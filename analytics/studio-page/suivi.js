// Onglet « Suivi » : tâches (cochables d'ici), textes des posts du week-end à copier, chiffres des réseaux, journal et
// guides, gardés par le serveur Paddock Live (analytics/suivi.js, sans Google). Les sessions Claude les tiennent à jour
// avec la clé du suivi (Réglages de l'onglet) et scripts/suivi.mjs.
import { $, $$, esc, api, fmtN, icon, toast, skeleton, empty, failure, store, state, glide } from './ui.js';

const SUBS = [['todo', 'À faire'], ['posts', 'Posts'], ['net', 'Réseaux'], ['log', 'Journal'], ['guides', 'Guides'], ['set', 'Réglages']];
const TAGS = [
  { key: 'res', icon: '📣', label: 'Réseaux', also: ['📊'] },
  { key: 'app', icon: '💻', label: 'Appli et site' },
  { key: 'seo', icon: '🔍', label: 'Référencement' },
  { key: 'sec', icon: '🔒', label: 'Sécurité' },
  { key: 'bug', icon: '🐞', label: 'Bug' },
];
const NET_COLORS = { instagram: '#d62976', facebook: '#1877f2', threads: '#9a9fa7', bluesky: '#1185fe', x: '#c9c8c2', tiktok: '#00c2b8', youtube: '#ff0000' };
const netColor = (n) => NET_COLORS[String(n || '').toLowerCase().split(' ')[0]] || '#8e8c86';
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const plain = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s)»<]+[^\s).,»<]/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
const num = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[\s  ]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const parseFr = (s) => { const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
let copies = [];
const copyBtn = (text) => `<button type="button" class="btn small" data-copy="${copies.push(text) - 1}">${icon('copy')}Copier</button>`;

// ---------- Tâches, posts et guides (texte gardé par le serveur) ----------
// À faire : une tâche par entrée (statut, liste, quand, domaine, titre, détails, lien, fait le), une colonne par liste
// dans l'ordre d'arrivée, les tâches faites à la fin
const LIST_COLORS = [[/tester/, '#6d28d9'], [/semaine de|cette semaine|week-end/, '#e10600'], [/chaque semaine/, '#0284c7'], [/attente/, '#64748b'], [/lien/, '#334155'], [/urgence/, '#475569']];
const DONE_SHOWN = 25;
function parseTasks(tasks) {
  const lists = new Map(), done = [];
  tasks.forEach((r) => {
    if (!r.title) return;
    const tag = TAGS.find((t) => t.label === r.domain)?.key || null;
    const it = { id: r.id, when: r.when, title: r.title, detail: String(r.detail || '').split(' / ').filter((l) => l.trim()), tag, box: true, link: r.link || null };
    if (r.status === 'Fait') { done.push({ ...it, done: true, when: r.doneAt || it.when, recent: r.list !== 'Archive' }); return; }
    const name = r.list || 'Sans liste';
    if (!lists.has(name)) {
      const t = plain(name);
      lists.set(name, { title: name, color: LIST_COLORS.find(([re]) => re.test(t))?.[1] || 'var(--surface-2)', kind: r.status === 'Lien' ? 'links' : r.status === 'En attente' ? 'info' : 'tasks', items: [], notes: [] });
    }
    lists.get(name).items.push({ ...it, done: false });
  });
  // Faites : les plus récentes d'abord (ajoutées en dernier), l'archive à la fin
  done.reverse().sort((a, b) => b.recent - a.recent);
  const sections = [...lists.values()];
  if (done.length) sections.push({ title: 'Fait', color: '#0f766e', kind: 'done', items: done.slice(0, DONE_SHOWN), notes: done.length > DONE_SHOWN ? [`Les ${DONE_SHOWN} dernières sur ${done.length}.`] : [] });
  return { sections };
}

// Textes des posts d'un Grand Prix : « 1. JOUR · HEURE · TITRE », puis images et textes à copier
function postDate(head, year) {
  const m = plain(head).match(/(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)/);
  return m ? new Date(year, MONTHS.findIndex((x) => plain(x) === m[2]), +m[1]).getTime() : null;
}
const isWhen = (s) => /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|ce soir|\d+\s*h\b)/i.test(s);
function parsePosts(d) {
  const year = new Date(d.at || Date.now()).getFullYear();
  const info = [], posts = [];
  let post = null, block = null, headline = '';
  for (const raw of String(d.text || '').split(/\r?\n/)) {
    const text = raw.trim();
    if (!text) continue;
    const head = text.match(/^(\d+)\.\s+(.+)$/);
    if (head && head[2] === head[2].toUpperCase()) {
      const parts = head[2].split(/\s+·\s+/);
      post = { n: head[1], when: parts.filter(isWhen).join(' · '), title: parts.filter((x) => !isWhen(x)).join(' · ') || head[2], date: postDate(head[2], year), media: [], blocks: [], notes: [] };
      posts.push(post);
      block = null;
      continue;
    }
    if (!post) { if (!headline) headline = text; else info.push(text); continue; }
    const media = text.match(/^(Images?|Vidéo)\s*:\s*(.+)$/i);
    if (media) { post.media.push([media[1], media[2]]); block = null; continue; }
    const label = text.match(/^(Texte long|Texte court|Légende|Titre|Texte)([^:]*?)\s*:\s*$/i);
    if (label) { block = { label: label[1] + label[2], lines: [] }; post.blocks.push(block); continue; }
    if (block) block.lines.push(text); else post.notes.push(text);
  }
  const dates = posts.map((p) => p.date).filter(Boolean);
  return { id: d.id, gp: d.name, files: d.files || [], name: d.name.replace(/\s*·\s*textes des posts/i, '').replace(/^week-end (de |d')/i, ''), info, posts, first: Math.min(...dates, Infinity), last: Math.max(...dates, 0) };
}

// Guide (texte simple) : « # », « ## », « ### » titres, « - » puces, lignes « | a | b | » tableau, bloc entre « ``` »
// texte à copier (prompts), le reste paragraphes
function parseGuide(text) {
  const out = [];
  let copy = null, table = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (/^```/.test(raw.trim())) { if (copy) { out.push({ t: 'copy', text: copy.join('\n').trim() }); copy = null; } else copy = []; continue; }
    if (copy) { copy.push(raw); continue; }
    const line = raw.trim();
    if (/^\|.*\|$/.test(line)) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue;   // ligne de séparation
      const cells = line.slice(1, -1).split('|').map((c) => c.trim());
      if (!table) { table = { t: 'table', rows: [] }; out.push(table); }
      table.rows.push(cells);
      continue;
    }
    table = null;
    if (!line) continue;
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) out.push({ t: `h${h[1].length}`, text: h[2] });
    else if (/^[-•]\s+/.test(line)) out.push({ t: 'li', text: line.replace(/^[-•]\s+/, '') });
    else out.push({ t: 'p', text: line });
  }
  if (copy) out.push({ t: 'copy', text: copy.join('\n').trim() });
  return out;
}

// ---------- Données (gardées sur le téléphone pour l'affichage immédiat) ----------
const table = (vals) => { const [h = [], ...r] = vals || []; return r.map((row) => Object.fromEntries(h.map((k, i) => [k, row[i] ?? '']))); };
const VIEW = {
  todo: (d) => parseTasks(d.tasks || []),
  posts: (d) => (d.posts || []).map(parsePosts).sort((a, b) => a.first - b.first),
  net: (d) => ({ posts: table(d.net?.posts), subs: { app: d.net?.app || [], benjy: d.net?.benjy || [] }, streamers: table(d.net?.streamers) }),
  log: (d) => ({ rows: (d.log || []).filter((r) => r.text) }),
  guides: (d) => {
    const list = [...(d.guides || [])].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    if (!list.some((g) => g.id === state.vguide)) state.vguide = (list.find((g) => /workflow/i.test(g.name)) || list[0])?.id;
    const sel = list.find((g) => g.id === state.vguide);
    return { list: list.map(({ id, name }) => ({ id, name })), id: sel?.id, blocks: sel ? parseGuide(sel.text) : [] };
  },
  set: (d) => d,
};

// ---------- Affichage ----------
// Listes repliées (titres des sections), gardées sur cet appareil
const folded = () => new Set(store.get('suivi.shut')?.v || []);

function todoHtml(m) {
  const tasks = m.sections.filter((s) => s.kind === 'tasks').flatMap((s) => s.items.map((it) => ({ ...it, sec: s })));
  const open = tasks.filter((t) => !t.done);
  const next = open.find((t) => t.when) || open[0];
  const bugs = open.filter((t) => t.tag === 'bug').length;
  const filter = state.vtag || 'all';
  const shut = folded();
  const counts = Object.fromEntries(TAGS.map((t) => [t.key, open.filter((x) => x.tag === t.key).length]));
  const card = (it, s) => {
    if (s.kind === 'links' && it.link) return `<a class="sv-card" href="${esc(it.link)}" target="_blank" rel="noopener"><span class="sv-box link">↗</span><span><b>${esc(it.title)}</b></span></a>`;
    const t = TAGS.find((x) => x.key === it.tag);
    const dot = (!it.box || s.kind === 'info') && !it.done;
    // Tâche à cocher : statut « Fait » sur le serveur, avec la date du jour
    const check = s.kind === 'tasks' && it.box && !it.done ? ` data-check="${esc(it.id)}" role="checkbox" aria-checked="false" title="Cocher (rangée dans « Fait »)"` : '';
    return `<button type="button" class="sv-card${it.done ? ' done' : ''}"${it.detail.length ? ' data-open' : ''}><span class="sv-box${dot ? ' dot' : ''}"${check}></span><span>
      ${it.when ? `<small class="sv-when" style="color:${s.color}">${esc(it.when)}</small>` : ''}<b>${esc(it.title)}</b>
      ${t || it.detail.length ? `<span class="sv-meta">${t ? `<i class="sv-tag">${t.icon} ${t.label}</i>` : ''}${it.detail.length ? '<i class="sv-more">Détails ▾</i>' : ''}</span>` : ''}
      ${it.detail.length ? `<span class="sv-detail">${it.detail.map((x) => `<span>${linkify(x)}</span>`).join('')}</span>` : ''}</span></button>`;
  };
  if (!m.sections.length) return empty('Aucune tâche pour le moment : les sessions Claude les ajoutent avec la clé du suivi (Réglages), ou importe le fichier de l\'ancienne feuille.', 'list');
  return `<div class="sv-sum">
      <div class="tile"><b>${open.length}</b><small>à faire</small></div>
      <div class="tile"><b>${tasks.length - open.length + (m.sections.find((s) => s.kind === 'done')?.items.length || 0)}</b><small>faites</small></div>
      <div class="tile"><b${bugs ? ' class="sv-warn"' : ''}>${bugs}</b><small>bug${bugs > 1 ? 's' : ''}</small></div>
    </div>
    ${next ? `<div class="panel sv-next"><small>Prochaine tâche</small><b>${esc(next.title)}</b>${next.when ? `<span class="sv-when">${esc(next.when)} · ${esc(next.sec.title.replace(/^\W+/u, ''))}</span>` : ''}</div>` : ''}
    <div class="sv-tools"><div class="chips" id="svtags"><button data-tag="all" class="${filter === 'all' ? 'on' : ''}">Tout <small>${open.length}</small></button>${TAGS.filter((t) => counts[t.key]).map((t) => `<button data-tag="${t.key}" class="${filter === t.key ? 'on' : ''}">${t.icon} ${t.label} <small>${counts[t.key]}</small></button>`).join('')}</div>
      <button type="button" class="btn small" id="svfold">${m.sections.every((s) => shut.has(s.title)) ? 'Tout déplier' : 'Tout replier'}</button></div>
    <div class="sv-board">${m.sections.map((s) => {
      const items = filter === 'all' || s.kind === 'links' ? s.items : s.items.filter((it) => it.tag === filter);
      if (filter !== 'all' && !items.length) return '';
      const left = s.items.filter((it) => !it.done).length;
      const pct = s.items.length ? Math.round(((s.items.length - left) / s.items.length) * 100) : 0;
      return `<section class="sv-col${shut.has(s.title) ? ' shut' : ''}" data-col="${esc(s.title)}"><h3 style="--col:${s.color}" role="button" tabindex="0" aria-expanded="${!shut.has(s.title)}" title="Replier ou déplier">${esc(s.title)}<i>${s.kind === 'tasks' ? (left ? `${left} à faire` : 'tout fait ✓') : s.items.length}</i></h3>
        ${s.kind === 'tasks' && s.items.length ? `<div class="sv-prog"><i style="width:${pct}%"></i></div>` : ''}
        ${s.notes.map((n) => `<p class="sv-note">${esc(n)}</p>`).join('')}
        <div class="sv-items">${items.length ? items.map((it) => card(it, s)).join('') : '<p class="sv-note">Rien ici pour le moment.</p>'}</div></section>`;
    }).join('')}</div>`;
}

// Photos et vidéos d'un Grand Prix (stockage du serveur) : vignette, lecture, téléchargement
const fileUrl = (f) => `/studio/f/${f.key}/${encodeURIComponent(f.name)}`;
const sizeTxt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1e3))} Ko`);
function fileCard(f) {
  const u = fileUrl(f);
  const view = /^image\//.test(f.type) ? `<img src="${u}" alt="" loading="lazy">` : /^video\//.test(f.type) ? `<video src="${u}" controls preload="metadata" playsinline></video>` : '<span class="sv-fileicon">📄</span>';
  return `<figure class="sv-file">${view}<figcaption><span class="grow">${esc(f.name)} <small>${sizeTxt(f.size)}</small></span><a class="btn small" href="${u}" download="${esc(f.name)}">${icon('link')}Télécharger</a></figcaption></figure>`;
}

function postsHtml(list) {
  if (!list.length) return empty('Aucun texte de posts pour le moment : la routine du lundi les dépose ici (« Week-end de <Grand Prix> · textes des posts »).', 'news');
  const t0 = today0();
  if (!list.some((g) => g.id === state.vgp)) state.vgp = (list.find((g) => g.last >= t0) || list[list.length - 1]).id;
  const gp = list.find((g) => g.id === state.vgp);
  return `<div class="chips" id="svgps">${list.map((g) => `<button data-gp="${g.id}" class="${g.id === gp.id ? 'on' : ''}">${esc(g.name)} <small>${g.posts.length}</small></button>`).join('')}</div>
    ${gp.info.length ? `<div class="sv-info">${gp.info.map((i) => `<span>${linkify(i)}</span>`).join('')}</div>` : ''}
    <div class="sv-posts">${gp.posts.map((p) => {
      const when = p.date == null ? '' : p.date < t0 ? 'past' : p.date === t0 ? 'today' : '';
      return `<article class="sv-post ${when}"><header><span class="sv-num">${esc(p.n)}</span><span class="grow">
          <small class="sv-when">${esc(p.when || 'Quand tu veux')}${when === 'today' ? ' <i class="sv-pill ok">Aujourd\'hui</i>' : when === 'past' ? ' <i class="sv-pill">Passé</i>' : ''}</small>
          <b>${esc(p.title)}</b></span></header>
        ${p.media.map(([k, v]) => { const f = gp.files.find((x) => v.includes(x.name)); return f ? fileCard(f) : `<p class="sv-media">${/vid/i.test(k) ? '🎬' : '🖼️'} <span>${linkify(v)}</span></p>`; }).join('')}
        ${p.blocks.map((b) => { const text = b.lines.join('\n\n'); return `<div class="sv-txt"><div class="sv-txthead"><small>${esc(b.label)}</small>${copyBtn(text)}</div><p>${linkify(text)}</p></div>`; }).join('')}
        ${p.notes.map((n) => `<p class="sv-media">ℹ️ <span>${linkify(n)}</span></p>`).join('')}</article>`;
    }).join('')}</div>
    <section class="panel"><div class="sv-h"><b>Photos et vidéos</b><small>${gp.files.length}</small></div>
      ${gp.files.length ? `<div class="sv-files">${gp.files.map(fileCard).join('')}</div>` : '<p class="sv-note">Aucun fichier pour ce Grand Prix.</p>'}
      <label class="btn wide">${icon('link')}Ajouter des fichiers<input type="file" id="svfiles" data-gp="${esc(gp.gp)}" accept="image/*,video/mp4,video/quicktime,video/webm,application/pdf" multiple hidden></label></section>`;
}

function chart(series, dates) {
  const W = 560, H = 190, L = 34, R = 24, T = 10, B = 24;
  const max = Math.max(1, ...series.flatMap((s) => s.values.filter((v) => v != null)));
  const x = (i) => L + (dates.length > 1 ? (i * (W - L - R)) / (dates.length - 1) : 0);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const grid = [0, 1, 2, 3, 4].map((k) => { const v = Math.round((max * k) / 4); return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity=".1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`; }).join('');
  const labels = dates.map((d, i) => (dates.length <= 8 || i % 2 === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(d.slice(0, 5))}</text>` : '')).join('');
  const lines = series.map((s) => {
    const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
    if (!pts.length) return '';
    const [lx, ly] = pts[pts.length - 1];
    return `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.bold ? 3 : 2}" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lx}" cy="${ly}" r="${s.bold ? 4.5 : 3.5}" fill="${s.color}"/>`;
  }).join('');
  return `<svg class="sv-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Abonnés semaine après semaine">${grid}${labels}${lines}</svg>`;
}
const bar = (label, color, v, max) => `<div class="sv-bar"><span><i style="background:${color}"></i>${esc(label)}</span><span class="sv-track"><i style="width:${v ? Math.max(2, (v / max) * 100) : 0}%;background:${color}"></i></span><b>${fmtN(v)}</b></div>`;

function netHtml(m) {
  const metrics = ['Vues', 'J\'aime', 'Commentaires', 'Partages', 'Enregistrements', 'Clics'];
  const posts = m.posts.filter((p) => p['Réseau']);
  const views = posts.filter((p) => num(p['Vues']) != null);
  const best = [...views].sort((a, b) => num(b['Vues']) - num(a['Vues']))[0];

  const acc = state.vacc || 'app';
  const [head = [], ...lines] = m.subs[acc] || [];
  const nets = head.slice(1).filter((h) => !/total|gagn|meilleur|vues/i.test(h));
  const col = (h) => head.indexOf(h);
  const filled = lines.filter((r) => nets.some((n) => num(r[col(n)]) != null));
  const total = (r) => num(r[col('Total')]) ?? nets.reduce((a, n) => a + (num(r[col(n)]) || 0), 0);
  const last = filled[filled.length - 1], prev = filled[filled.length - 2];
  let subs;
  if (!last) {
    const next = lines.map((r) => parseFr(r[0])).find((d) => d && d.getTime() >= today0());
    subs = `<p class="sv-note">Pas encore de relevé. Premier relevé le lundi ${next ? next.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : 'prochain'} : le Studio remplit la ligne du lundi tout seul.</p>`;
  } else {
    const max = Math.max(1, ...nets.map((n) => num(last[col(n)]) || 0));
    subs = `<div class="tiles"><div class="tile"><b>${fmtN(total(last))}</b><small>abonnés au ${esc(last[0])}</small></div><div class="tile"><b class="ok">${prev ? `+${fmtN(total(last) - total(prev))}` : '—'}</b><small>en une semaine</small></div></div>
      <div class="sv-bars">${nets.map((n) => bar(n, netColor(n), num(last[col(n)]), max)).join('')}</div>
      ${filled.length > 1 ? `${chart([{ values: filled.map(total), color: 'var(--brand)', bold: true }, ...nets.map((n) => ({ values: filled.map((r) => num(r[col(n)])), color: netColor(n) }))], filled.map((r) => r[0]))}
        <div class="sv-legend"><span><i style="background:var(--brand)"></i>Total</span>${nets.map((n) => `<span><i style="background:${netColor(n)}"></i>${esc(n)}</span>`).join('')}</div>` : ''}`;
  }

  const byNet = {};
  for (const p of views) byNet[p['Réseau']] = (byNet[p['Réseau']] || 0) + num(p['Vues']);
  const netRows = Object.entries(byNet).sort((a, b) => b[1] - a[1]);
  const sorted = [...posts].sort((a, b) => (parseFr(b['Date'])?.getTime() || 0) - (parseFr(a['Date'])?.getTime() || 0) || String(b['Heure']).localeCompare(String(a['Heure'])));
  const streamers = m.streamers.filter((s) => s['Nom']);
  const lastFill = store.get('suivi.filled')?.at;
  const auto = `<p class="sv-note">Abonnés du lundi, meilleur post de Benjy, liens et chiffres des posts (Instagram, Facebook, Threads, Bluesky ; YouTube publié depuis le Studio) remplis par le Studio${lastFill ? ` · dernier passage ${new Date(lastFill).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}` : ''}.</p>`;
  return `${auto}<div class="tiles">
      <div class="tile"><b>${posts.length}</b><small>posts prévus</small></div>
      <div class="tile"><b>${posts.filter((p) => p['Lien du post']).length}</b><small>avec leur lien</small></div>
      <div class="tile"><b>${views.length ? fmtN(views.reduce((a, p) => a + num(p['Vues']), 0)) : '—'}</b><small>vues relevées</small></div>
    </div>
    ${best ? `<div class="panel sv-next"><small>Meilleur post</small><b>${esc(best['Sujet'])}</b><span class="sv-when">${esc(best['Réseau'])} · ${fmtN(num(best['Vues']))} vues</span></div>` : ''}
    <div class="sv-grid">
      <section class="panel"><div class="sv-h"><b>Abonnés</b><div class="seg" id="svacc"><button data-acc="app" class="${acc === 'app' ? 'on' : ''}">@paddockliveapp</button><button data-acc="benjy" class="${acc === 'benjy' ? 'on' : ''}">@benjypaddock</button></div></div>${subs}</section>
      <section class="panel"><div class="sv-h"><b>Vues par réseau</b><small>@paddockliveapp</small></div>
        ${netRows.length ? `<div class="sv-bars">${netRows.map(([k, v]) => bar(k, netColor(k), v, netRows[0][1])).join('')}</div>` : `<p class="sv-note">${posts.length} posts prévus, pas encore de vues relevées : le Studio les remplit tout seul une fois les posts publiés (TikTok et X : à la main, ces réseaux ne donnent pas les chiffres d'un post).</p>`}</section>
    </div>
    <section class="panel"><div class="sv-h"><b>Posts @paddockliveapp</b><small>${posts.length} lignes</small></div>
      <div class="sv-scroll"><table class="sv-table"><thead><tr><th>Date</th><th>Réseau</th><th>Sujet</th>${metrics.map((x) => `<th class="n">${x}</th>`).join('')}<th>Lien</th></tr></thead>
      <tbody>${sorted.map((p) => `<tr><td class="nw">${esc(p['Date'].slice(0, 5))} ${esc(p['Heure'])}</td><td class="nw"><i class="sv-dot" style="background:${netColor(p['Réseau'])}"></i>${esc(p['Réseau'])}</td><td>${esc(p['Sujet'])}</td>${metrics.map((x) => `<td class="n">${fmtN(num(p[x]))}</td>`).join('')}<td>${p['Lien du post'] ? `<a href="${esc(p['Lien du post'])}" target="_blank" rel="noopener">Voir ↗</a>` : '—'}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="panel"><div class="sv-h"><b>Streamers</b><small>${streamers.length} notés</small></div>
      ${streamers.length ? `<div class="sv-scroll"><table class="sv-table"><thead><tr><th>Nom</th><th>Plateforme</th><th class="n">Abonnés</th><th>Statut</th><th>Contacté le</th><th>Relance</th><th>Notes</th></tr></thead><tbody>${streamers.map((s) => `<tr><td>${s['Lien de la chaîne'] ? `<a href="${esc(s['Lien de la chaîne'])}" target="_blank" rel="noopener">${esc(s['Nom'])}</a>` : esc(s['Nom'])}</td><td>${esc(s['Plateforme'])}</td><td class="n">${fmtN(num(s['Abonnés']))}</td><td><i class="sv-tag">${esc(s['Statut'] || 'À contacter')}</i></td><td>${esc(s['Contacté le'])}</td><td>${esc(s['Relance prévue'])}</td><td>${esc(s['Notes'])}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sv-note">Aucun streamer noté pour le moment.</p>'}</section>
`;
}

const DOMAINS = { code: '#1a66d2', site: '#0e7490', suivi: '#6b4fbb', reseaux: '#d62976', version: '#0f8a4f', securite: '#c2410c' };
const domColor = (d) => DOMAINS[plain(d || '')] || '#5a616c';
function logHtml(m) {
  if (!m.rows.length) return empty('Le Journal est vide.', 'news');
  const days = [];
  for (const r of m.rows) { if (days[days.length - 1]?.d !== r.date) days.push({ d: r.date, items: [] }); days[days.length - 1].items.push(r); }
  const label = (d) => parseFr(d)?.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) || d;
  return `<div class="sv-log">${days.map((g) => `<section><h3 class="sv-day">${esc(label(g.d))}</h3>${g.items.map((r) => `<div class="sv-entry">
      <i class="sv-dom" style="background:${domColor(r.domain)}">${esc(r.domain || '—')}</i><p>${linkify(r.text)}</p>${r.where ? `<small>→ ${linkify(r.where)}</small>` : ''}</div>`).join('')}</section>`).join('')}</div>`;
}

function guidesHtml(m) {
  if (!m.list.length) return empty('Aucun guide pour le moment.', 'news');
  let html = '', list = false, h2 = 0;
  for (const b of m.blocks) {
    if (b.t !== 'li' && list) { html += '</ul>'; list = false; }
    if (b.t === 'li') { if (!list) { html += '<ul>'; list = true; } html += `<li>${linkify(b.text)}</li>`; }
    else if (b.t === 'h1') html += `<h2>${esc(b.text)}</h2>`;
    else if (b.t === 'h2') html += `<h3 id="svh${h2++}">${esc(b.text)}</h3>`;
    else if (b.t === 'h3') html += `<h4>${esc(b.text)}</h4>`;
    else if (b.t === 'p') html += `<p>${linkify(b.text)}</p>`;
    else if (b.t === 'copy') html += `<div class="sv-txt sv-prompt"><div class="sv-txthead"><small>${esc(b.text.split('\n')[0].slice(0, 60))}</small>${copyBtn(b.text)}</div><pre>${esc(b.text)}</pre></div>`;
    else if (b.t === 'table') html += `<div class="sv-scroll sv-doctable"><table class="sv-table">${b.rows.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${linkify(c)}</td>` : `<th>${esc(c)}</th>`)).join('')}</tr>`).join('')}</table></div>`;
  }
  if (list) html += '</ul>';
  const toc = m.blocks.filter((b) => b.t === 'h2');
  return `<div class="chips" id="svguides">${m.list.map((f) => `<button data-guide="${f.id}" class="${f.id === m.id ? 'on' : ''}">${esc(f.name.replace(/\s*·\s*Paddock Live$/i, ''))}</button>`).join('')}</div>
    ${toc.length > 2 ? `<div class="chips wrap sv-toc">${toc.map((b, i) => `<button data-toc="${i}">${esc(b.text.replace(/^\d+\.\s*/, ''))}</button>`).join('')}</div>` : ''}
    <article class="sv-doc">${html}</article>`;
}

// Réglages : clé des sessions Claude, import de l'ancienne feuille
function setHtml(d) {
  const counts = [['tâches', d.tasks?.length || 0], ['lignes du journal', d.log?.length || 0], ['Grands Prix (posts)', d.posts?.length || 0], ['guides', d.guides?.length || 0]];
  return `<section class="panel sv-connect">
      <h3>${icon('link')}Clé des sessions Claude</h3>
      <p>Les sessions Claude (Développement, Réseaux…) tiennent ce suivi à jour avec cette clé : tâches, journal, textes des posts. Le serveur ne garde que son empreinte.</p>
      <p class="sv-note">${d.keySet ? 'Une clé est en service. En créer une nouvelle remplace l\'ancienne.' : 'Aucune clé pour le moment.'}</p>
      <div id="svkeybox"></div>
      <button class="btn primary wide" id="svkey">${icon('link')}${d.keySet ? 'Nouvelle clé' : 'Créer la clé'}</button>
    </section>
    <section class="panel sv-connect">
      <h3>${icon('list')}Contenu</h3>
      <p class="sv-note">${counts.map(([k, n]) => `${n} ${k}`).join(' · ')}</p>
      <p>Importer un fichier de suivi (.json, par exemple celui tiré de l'ancienne feuille Google) : il remplace les parties qu'il contient.</p>
      <label class="btn wide">${icon('list')}Importer un fichier<input type="file" id="svimport" accept="application/json,.json" hidden></label>
    </section>`;
}

const RENDER = { todo: todoHtml, posts: postsHtml, net: netHtml, log: logHtml, guides: guidesHtml, set: setHtml };

// ---------- Chiffres des comptes et des posts écrits par le serveur (au plus une fois par heure) ----------
export async function fillNet(accounts, force = false) {
  if (!accounts?.length || (!force && store.get('suivi.filled', 3600e3))) return null;
  try {
    // Posts publiés à la main retrouvés sur les comptes reliés, et leurs chiffres relus : les tables les reçoivent aussi
    const imp = await api('history/import', { method: 'POST' }).catch(() => null);
    if (imp?.added || !store.get('stats', 3600e3)) await api('stats').catch(() => null);
    const r = await api('suivi/fill', { method: 'POST', body: JSON.stringify({ accounts }) });
    store.set('suivi.filled', r);
    if (r.cells) { toast(`Chiffres des réseaux remplis (${r.cells} case${r.cells > 1 ? 's' : ''})`, 'ok'); store.del('suivi.data'); }
    return r;
  } catch (err) {
    if (!store.get('suivi.fillerr', 86400e3)) { store.set('suivi.fillerr', 1); toast(err.message, 'bad'); }
    return null;
  }
}

// ---------- Onglet ----------
export async function suiviTab(body, { force, restore, current }) {
  state.vsub ||= 'todo';
  await showSub(body, { force, current });
  if (restore) requestAnimationFrame(() => scrollTo(0, restore));
}

async function showSub(body, { force, current }) {
  const sub = state.vsub;
  const known = store.get('suivi.data');
  const paint = (d, stale) => {
    if (!current() || state.vsub !== sub) return;
    copies = [];
    body.innerHTML = `<div class="seg wide" id="svsub">${SUBS.map(([k, v]) => `<button data-sub="${k}" class="${k === sub ? 'on' : ''}">${v}</button>`).join('')}</div>
      ${stale ? '<p class="status"><span class="dot"></span>Mise à jour…</p>' : ''}<div id="svpane">${d ? RENDER[sub](VIEW[sub](d)) : skeleton(3)}</div>`;
    bind(body, d, { force, current });
    glide(body);
  };
  // Relu au plus toutes les 2 minutes (sauf « Actualiser »)
  if (known && Date.now() - known.at < 2 * 60e3 && !force) { paint(known.v, false); return; }
  paint(known?.v, !!known);
  try {
    const d = await api('suivi');
    store.set('suivi.data', d);
    paint(d, false);
  } catch (err) {
    if (!current() || state.vsub !== sub) return;
    if (known) { paint(known.v, false); toast(`Actualisation impossible : ${err.message}`, 'bad'); return; }
    $('#svpane', body).innerHTML = failure(err);
    $('[data-retry]', body).onclick = () => showSub(body, { force: true, current });
  }
}

// Opérations envoyées au serveur, puis suivi relu
async function ops(list) {
  const r = await api('suivi/ops', { method: 'POST', body: JSON.stringify({ ops: list }) });
  store.del('suivi.data');
  return r;
}

function bindCopies(root) {
  $$('[data-copy]', root).forEach((b) => {
    b.onclick = () => navigator.clipboard.writeText(copies[+b.dataset.copy]).then(() => toast('Copié', 'ok'), () => toast('Copie impossible', 'bad'));
  });
}

// Fichier de suivi : { tasks, log, posts, net, guides } (parties absentes laissées telles quelles)
async function importFile(file) {
  const d = JSON.parse(await file.text());
  const list = ['tasks', 'log', 'posts', 'net', 'guides'].filter((k) => d[k] != null).map((part) => ({ op: 'part.put', part, data: d[part] }));
  if (!list.length) throw new Error('Rien à importer dans ce fichier');
  await ops(list);
  return list.length;
}

function bind(body, d, opts) {
  const again = (force = false) => showSub(body, { ...opts, force });
  $$('#svsub [data-sub]', body).forEach((b) => { b.onclick = () => { state.vsub = b.dataset.sub; again(); }; });
  bindCopies(body);
  if (!d) return;
  // Repli : titre d'une liste (une seule) ou bouton « Tout replier / Tout déplier », appliqué sur place
  // (sans redessiner l'onglet) et gardé sur cet appareil
  const all = $('#svfold', body);
  const fold = (titles) => {
    store.set('suivi.shut', [...titles]);
    const cols = $$('.sv-col', body);
    for (const c of cols) { c.classList.toggle('shut', titles.has(c.dataset.col)); $('h3', c).setAttribute('aria-expanded', !titles.has(c.dataset.col)); }
    if (all) all.textContent = cols.every((c) => titles.has(c.dataset.col)) ? 'Tout déplier' : 'Tout replier';
  };
  $$('.sv-col h3', body).forEach((h) => {
    const toggle = () => { const s = folded(), k = h.parentElement.dataset.col; if (!s.delete(k)) s.add(k); fold(s); };
    h.onclick = toggle;
    h.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
  });
  if (all) all.onclick = () => { const cols = $$('.sv-col', body).map((c) => c.dataset.col); fold(new Set(cols.every((k) => folded().has(k)) ? [] : cols)); };
  $$('.sv-card[data-open]', body).forEach((c) => { c.onclick = (e) => { if (!e.target.closest('a, [data-check]')) c.classList.toggle('open'); }; });
  // Case cochée : tâche marquée faite tout de suite (rangée dans « Fait » avec la date du jour), puis liste relue
  $$('[data-check]', body).forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const card = b.closest('.sv-card');
      if (card.classList.contains('done')) return;
      card.classList.add('done');
      b.setAttribute('aria-checked', 'true');
      try { await ops([{ op: 'task.set', id: b.dataset.check, status: 'Fait' }]); toast('Fait : rangé dans « Fait »', 'ok'); } catch (err) { toast(err.message, 'bad'); }
      again(true);
    };
  });
  $$('#svtags [data-tag]', body).forEach((b) => { b.onclick = () => { state.vtag = b.dataset.tag; again(); }; });
  $$('#svgps [data-gp]', body).forEach((b) => { b.onclick = () => { state.vgp = b.dataset.gp; again(); }; });
  $$('#svacc [data-acc]', body).forEach((b) => { b.onclick = () => { state.vacc = b.dataset.acc; again(); }; });
  $$('#svguides [data-guide]', body).forEach((b) => { b.onclick = () => { state.vguide = b.dataset.guide; again(); }; });
  $$('[data-toc]', body).forEach((b) => { b.onclick = () => $(`#svh${b.dataset.toc}`, body)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  // Réglages : nouvelle clé (montrée une seule fois), import d'un fichier
  const keyBtn = $('#svkey', body);
  if (keyBtn) keyBtn.onclick = async () => {
    if (d.keySet && !confirm('Créer une nouvelle clé ? L\'ancienne ne marchera plus : il faudra la remplacer dans l\'environnement des sessions Claude.')) return;
    keyBtn.disabled = true;
    try {
      const { key } = await api('suivi/key', { method: 'POST' });
      copies = [key];
      $('#svkeybox', body).innerHTML = `<div class="sv-txt sv-prompt"><div class="sv-txthead"><small>Clé du suivi (montrée une seule fois)</small>${copyBtn(key).replace(/data-copy="\d+"/, 'data-copy="0"')}</div><pre>${esc(key)}</pre></div>
        <p class="sv-note">Dans claude.ai : environnement cloud des sessions Paddock Live → variables d'environnement → <code>PADDOCK_SUIVI_KEY=</code> suivi de cette clé. Ne la colle pas dans une conversation.</p>`;
      bindCopies(body);
      store.del('suivi.data');
    } catch (err) { toast(err.message, 'bad'); }
    keyBtn.disabled = false;
  };
  const up = $('#svfiles', body);
  if (up) up.onchange = async () => {
    const files = [...(up.files || [])];
    let n = 0;
    for (const f of files) {
      try { await api(`suivi/file?gp=${encodeURIComponent(up.dataset.gp)}&f=${encodeURIComponent(f.name)}`, { method: 'PUT', body: f }); n++; } catch (err) { toast(`${f.name} : ${err.message}`, 'bad'); }
    }
    if (n) { toast(`${n} fichier${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}`, 'ok'); store.del('suivi.data'); again(true); }
  };
  const imp = $('#svimport', body);
  if (imp) imp.onchange = async () => {
    const f = imp.files?.[0];
    if (!f) return;
    try { const n = await importFile(f); toast(`Importé (${n} partie${n > 1 ? 's' : ''})`, 'ok'); again(true); } catch (err) { toast(`Import impossible : ${err.message}`, 'bad'); }
  };
}
