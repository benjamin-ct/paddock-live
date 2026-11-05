// Onglet « Suivi » : tâches (cochables d'ici), textes des posts du week-end à copier, chiffres des réseaux, journal et
// guides, gardés par le serveur Paddock Live (analytics/suivi.js, sans Google). Les sessions Claude les tiennent à jour
// avec la clé du suivi (Réglages de l'onglet) et scripts/suivi.mjs.
import { $, $$, esc, api, fmtN, icon, toast, skeleton, empty, failure, store, state, glide } from './ui.js';

// Réglages du suivi en icône (une clé, pour ne pas les confondre avec les Réglages du Studio) au bout des onglets :
// les cinq rubriques tiennent sur un téléphone sans être coupées
const KEY_ICON = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M10.9 12.1L20 3M16.5 6.5l3 3M14 9l2.5 2.5"/></svg>';
const SUBS = [['todo', 'À faire'], ['posts', 'Posts'], ['net', 'Réseaux'], ['log', 'Journal'], ['guides', 'Guides'], ['set', 'Réglages']];
const NET_COLORS = { instagram: '#d62976', facebook: '#1877f2', threads: '#9a9fa7', bluesky: '#1185fe', x: '#c9c8c2', tiktok: '#00c2b8', youtube: '#ff0000' };
const netColor = (n) => NET_COLORS[String(n || '').toLowerCase().split(' ')[0]] || '#8e8c86';
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const plain = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s)»<]+[^\s).,»<]/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
const num = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[\s  ]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const parseFr = (s) => { const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const back = (t, n) => { const d = new Date(t); d.setDate(d.getDate() - n); return d.getTime(); };
// Jour d'une date écrite à la main ou par le serveur : « 03/11/2026 », « 30/10 », « 30 oct. », « 1er novembre »
// (sans année : la plus proche dans le passé)
const MON = ['janv', 'fevr', 'mars', 'avr', 'mai', 'juin', 'juil', 'aout', 'sept', 'oct', 'nov', 'dec'];
function dayOf(s) {
  const t = plain(String(s || '').trim());
  let k = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/), d, m, y;
  if (k) [d, m, y] = [+k[1], +k[2] - 1, k[3] ? +k[3] : null];
  else if ((k = t.match(/^(\d{1,2})(?:er)?\s+([a-z]+)/))) [d, m, y] = [+k[1], MON.findIndex((x) => k[2].startsWith(x)), null];
  if (d == null || m < 0 || m > 11) return null;
  const now = new Date();
  let day = new Date(y || now.getFullYear(), m, d).getTime();
  if (!y && day > now.getTime() + 864e5) day = new Date(now.getFullYear() - 1, m, d).getTime();
  return day;
}
const dayTxt = (t) => (t === today0() ? 'aujourd\'hui' : t === back(today0(), 1) ? 'hier' : new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));
let copies = [];
const copyBtn = (text) => `<button type="button" class="btn small" data-copy="${copies.push(text) - 1}">${icon('copy')}Copier</button>`;

// ---------- Tâches, posts et guides (texte gardé par le serveur) ----------
// À faire : une tâche par entrée (statut, liste, quand, domaine, titre, détails, lien, fait le), une liste par nom.
// Ordre d'après le nom : « Cette semaine », puis ce qu'il faut vérifier (versions à tester, dernières courses), les
// autres listes, et tout en bas, repliées au départ, celles qui attendent (attente, pause, idées, liens…)
const RANKS = [[/cette semaine/, 0], [/tester|a verifier/, 1], [/pause|attente|idees|plus tard|sans urgence|version 2\.0|liens/, 3]];
const LIST_COLORS = [[/cette semaine/, 'var(--brand)'], [/tester|a verifier/, 'var(--data)'], [/pause|attente/, 'var(--warn)']];
const DONE_DAYS = 7, DONE_SHOWN = 15;
const canCheck = (it) => it.status !== 'En attente' && it.status !== 'Lien';
function parseTasks(tasks) {
  const lists = new Map(), done = [];
  tasks.forEach((r) => {
    if (!r.title) return;
    const it = { id: r.id, status: r.status, when: r.when || '', domain: r.domain || '', title: r.title, detail: String(r.detail || '').split(' / ').filter((l) => l.trim()), link: r.link || null, list: r.list || 'Sans liste' };
    if (r.status === 'Fait') { done.push({ ...it, done: true, day: dayOf(r.doneAt), doneAt: r.doneAt || '', i: done.length }); return; }
    if (!lists.has(it.list)) {
      const t = plain(it.list), rank = RANKS.find(([re]) => re.test(t))?.[1] ?? 2;
      lists.set(it.list, { title: it.list, rank, parked: rank === 3, color: LIST_COLORS.find(([re]) => re.test(t))?.[1] || 'var(--line-3)', items: [] });
    }
    lists.get(it.list).items.push(it);
  });
  // Faites : les plus récentes d'abord (date « fait le », puis ajoutées en dernier)
  done.sort((a, b) => (b.day ?? -1) - (a.day ?? -1) || b.i - a.i);
  return { sections: [...lists.values()].sort((a, b) => a.rank - b.rank), done };
}

// Textes des posts d'un Grand Prix : « 1. JOUR · HEURE · TITRE », puis images et textes à copier
function postDate(head, year) {
  const m = plain(head).match(/(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)/);
  return m ? new Date(year, MONTHS.findIndex((x) => plain(x) === m[2]), +m[1]).getTime() : null;
}
const isWhen = (s) => /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|ce soir|\d+\s*h\b)/i.test(s);
function parsePosts(d) {
  const year = new Date(d.at || Date.now()).getFullYear();
  const info = [], posts = [];
  let post = null, block = null, headline = '';
  for (const raw of String(d.text || '').split(/\r?\n/)) {
    const text = raw.trim();
    if (!text) continue;
    // Titre en capitales, parenthèse finale en minuscules possible (« 5. BENJY · IDÉES (@benjypaddock, idées seulement) ») ;
    // « quand » = les morceaux qui commencent par un jour ou une heure, le reste est le titre (« QUALIFS À 19 H » compris)
    const head = text.match(/^(\d+)\.\s+(.+)$/);
    const aside = head?.[2].match(/^(.*?)\s*\(([^()]*)\)$/);
    const h = aside && aside[2] !== aside[2].toUpperCase() ? aside[1] : head?.[2];
    if (head && h === h.toUpperCase() && /\p{Lu}/u.test(h)) {
      const parts = h.split(/\s+·\s+/);
      const title = parts.filter((x) => !isWhen(x)).join(' · ');
      post = { n: head[1], when: title ? parts.filter(isWhen).join(' · ') : '', title: title || h, date: postDate(h, year), media: [], blocks: [], notes: h !== head[2] ? [aside[2]] : [] };
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
// Listes repliées ou dépliées (titre → vrai si repliée), gardées sur cet appareil ; sans choix, les listes en réserve
// sont repliées. Reprend l'ancienne liste des titres repliés (« suivi.shut ») tant qu'aucun nouveau choix n'est fait.
const foldMap = () => store.get('suivi.fold')?.v || Object.fromEntries((store.get('suivi.shut')?.v || []).map((t) => [t, true]));
const isShut = (title, parked, f = foldMap()) => f[title] ?? parked;

// Une tâche par ligne : case, titre (deux lignes au plus), méta en Mono (quand · domaine) ; détails au toucher
function taskHtml(it, { filter, done }) {
  if (it.status === 'Lien' && it.link) {
    const host = it.link.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    return `<a class="sv-task" href="${esc(it.link)}" target="_blank" rel="noopener"><span class="sv-box link" aria-hidden="true">${icon('link')}</span><span class="sv-row"><b>${esc(it.title)}</b><small class="sv-meta">${esc(host)}</small></span></a>`;
  }
  const wait = !done && !canCheck(it);
  const meta = [done ? (it.day != null ? `fait ${dayTxt(it.day)}` : it.doneAt) : it.when, wait ? 'en attente' : '', filter === 'all' ? it.domain : ''].filter(Boolean);
  const box = done ? '<span class="sv-box on" aria-hidden="true"></span>'
    : wait ? '<span class="sv-box wait" aria-hidden="true"></span>'
      // Case cochée : statut « Fait » sur le serveur, avec la date du jour
      : `<button type="button" class="sv-box" data-check="${esc(it.id)}" role="checkbox" aria-checked="false" aria-label="Faite : ${esc(it.title)}"></button>`;
  const body = `<b>${esc(it.title)}</b>${meta.length ? `<small class="sv-meta">${meta.map(esc).join(' · ')}</small>` : ''}`;
  return `<div class="sv-task${done ? ' done' : ''}" data-id="${esc(it.id)}">${box}${it.detail.length
    ? `<button type="button" class="sv-row" aria-expanded="false">${body}</button><div class="sv-detail" hidden>${it.detail.map((x) => `<p>${linkify(x)}</p>`).join('')}</div>`
    : `<div class="sv-row">${body}</div>`}</div>`;
}

function todoHtml(m) {
  if (!m.sections.length && !m.done.length) return empty('Aucune tâche pour le moment : les sessions Claude les ajoutent avec la clé du suivi (Réglages), ou importe le fichier de l\'ancienne feuille.', 'list');
  const open = m.sections.flatMap((s) => s.items.filter((it) => it.status !== 'Lien'));
  const todo = open.filter(canCheck);
  const doms = Object.entries(open.reduce((a, it) => (it.domain ? { ...a, [it.domain]: (a[it.domain] || 0) + 1 } : a), {})).sort((a, b) => b[1] - a[1]);
  if (state.vtag && !doms.some(([d]) => d === state.vtag)) state.vtag = 'all';
  const filter = state.vtag || 'all';
  const keep = (it) => filter === 'all' || it.domain === filter;
  const bugs = todo.filter((it) => plain(it.domain) === 'bug').length;
  const since = back(today0(), DONE_DAYS - 1);
  const recent = m.done.filter((it) => it.day != null && it.day >= since);
  const next = m.sections.filter((s) => !s.parked).map((s) => s.items.filter(canCheck)).find((l) => l.length);
  const nx = next && (next.find((it) => it.when) || next[0]);
  const f = foldMap();
  const col = (s) => {
    const items = s.items.filter((it) => it.status === 'Lien' || keep(it));
    if (filter !== 'all' && !items.some((it) => it.status !== 'Lien')) return '';
    const shut = isShut(s.title, s.parked, f);
    return `<section class="sv-col${shut ? ' shut' : ''}" data-col="${esc(s.title)}"${s.parked ? ' data-park="1"' : ''} style="--col:${s.color}">
      <h3><button type="button" class="sv-colhead" aria-expanded="${!shut}"><span>${esc(s.title)}</span><small>${items.length}</small></button></h3>
      <div class="sv-items">${items.map((it) => taskHtml(it, { filter })).join('')}</div></section>`;
  };
  // Faites : celles des 7 derniers jours (les plus récentes), le reste derrière « Voir tout »
  const doneAll = m.done.filter(keep), doneRecent = recent.filter(keep);
  const shown = state.vdoneAll ? doneAll : doneRecent.slice(0, DONE_SHOWN);
  const doneShut = isShut('Fait', false, f);
  const doneCol = doneAll.length ? `<section class="sv-col${doneShut ? ' shut' : ''}" data-col="Fait" style="--col:var(--ok)">
      <h3><button type="button" class="sv-colhead" aria-expanded="${!doneShut}"><span>Faites</span><small>${doneRecent.length} en ${DONE_DAYS} j</small></button></h3>
      <div class="sv-items">${shown.map((it) => taskHtml(it, { filter, done: true })).join('') || '<p class="sv-note">Rien de fait ces 7 derniers jours.</p>'}
        ${shown.length < doneAll.length || state.vdoneAll ? `<button type="button" class="btn small sv-all" id="svdone">${state.vdoneAll ? 'Seulement les récentes' : `Voir tout <small>${doneAll.length}</small>`}</button>` : ''}</div></section>` : '';
  const active = m.sections.filter((s) => !s.parked).map(col).join(''), parked = m.sections.filter((s) => s.parked).map(col).join('');
  const allShut = [...m.sections.map((s) => isShut(s.title, s.parked, f)), ...(doneCol ? [doneShut] : [])].every(Boolean);
  return `<p class="sv-kpis"><span><b>${todo.length}</b> à faire</span><span><b>${recent.length}</b> faites en ${DONE_DAYS} j</span><span${bugs ? ' class="sv-warn"' : ''}><b>${bugs}</b> bug${bugs > 1 ? 's' : ''}</span></p>
    ${nx ? `<button type="button" class="panel sv-next" data-goto="${esc(nx.id)}"><small>Prochaine tâche · ${esc(nx.list)}</small><b>${esc(nx.title)}</b>${nx.when ? `<span class="sv-when">${esc(nx.when)}</span>` : ''}</button>` : ''}
    <div class="sv-tools"><div class="chips" id="svtags"><button data-tag="all" class="${filter === 'all' ? 'on' : ''}">Tout <small>${open.length}</small></button>${doms.map(([d, n]) => `<button data-tag="${esc(d)}" class="${filter === d ? 'on' : ''}">${esc(d)} <small>${n}</small></button>`).join('')}</div>
      <button type="button" class="btn small" id="svfold">${allShut ? 'Tout déplier' : 'Tout replier'}</button></div>
    <div class="sv-board">${active}${doneCol}</div>${parked ? `<p class="sv-group">En réserve</p><div class="sv-board park">${parked}</div>` : ''}`;
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
        ${p.media.map(([k, v]) => { const f = gp.files.find((x) => v.includes(x.name)); return f ? fileCard(f) : `<p class="sv-media"><small>${/vid/i.test(k) ? 'Vidéo' : 'Image'}</small><span>${linkify(v)}</span></p>`; }).join('')}
        ${p.blocks.map((b) => { const text = b.lines.join('\n\n'); return `<div class="sv-txt"><div class="sv-txthead"><small>${esc(b.label)}</small>${copyBtn(text)}</div><p>${linkify(text)}</p></div>`; }).join('')}
        ${p.notes.map((n) => `<p class="sv-media note"><span>${linkify(n)}</span></p>`).join('')}</article>`;
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
    subs = `<p class="sv-kpis"><span><b>${fmtN(total(last))}</b> abonnés au ${esc(String(last[0]).slice(0, 5))}</span><span class="sv-ok"><b>${prev ? `+${fmtN(total(last) - total(prev))}` : '—'}</b> en une semaine</span></p>
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
  return `<p class="sv-kpis"><span><b>${posts.length}</b> posts prévus</span><span><b>${posts.filter((p) => p['Lien du post']).length}</b> avec leur lien</span><span><b>${views.length ? fmtN(views.reduce((a, p) => a + num(p['Vues']), 0)) : '—'}</b> vues relevées</span></p>
    ${best ? `<div class="panel sv-next"><small>Meilleur post</small><b>${esc(best['Sujet'])}</b><span class="sv-when">${esc(best['Réseau'])} · ${fmtN(num(best['Vues']))} vues</span></div>` : ''}
    <div class="sv-grid">
      <section class="panel"><div class="sv-h"><b>Abonnés</b><div class="seg" id="svacc"><button data-acc="app" class="${acc === 'app' ? 'on' : ''}">@paddockliveapp</button><button data-acc="benjy" class="${acc === 'benjy' ? 'on' : ''}">@benjypaddock</button></div></div>${subs}</section>
      <section class="panel"><div class="sv-h"><b>Vues par réseau</b><small>@paddockliveapp</small></div>
        ${netRows.length ? `<div class="sv-bars">${netRows.map(([k, v]) => bar(k, netColor(k), v, netRows[0][1])).join('')}</div>` : `<p class="sv-note">${posts.length} posts prévus, pas encore de vues relevées : le Studio les remplit tout seul une fois les posts publiés (TikTok et X : à la main, ces réseaux ne donnent pas les chiffres d'un post).</p>`}</section>
    </div>
    <section class="panel"><div class="sv-h"><b>Posts @paddockliveapp</b><small>${posts.length} lignes</small></div>
      <div class="sv-scroll"><table class="sv-table"><thead><tr><th>Date</th><th>Réseau</th><th>Sujet</th>${metrics.map((x) => `<th class="n">${x}</th>`).join('')}<th>Lien</th></tr></thead>
      <tbody>${sorted.map((p) => `<tr><td class="nw">${esc(p['Date'].slice(0, 5))} ${esc(p['Heure'])}</td><td class="nw"><i class="sv-dot" style="background:${netColor(p['Réseau'])}"></i>${esc(p['Réseau'])}</td><td class="sj">${esc(p['Sujet'])}</td>${metrics.map((x) => `<td class="n">${fmtN(num(p[x]))}</td>`).join('')}<td>${p['Lien du post'] ? `<a href="${esc(p['Lien du post'])}" target="_blank" rel="noopener">Voir ↗</a>` : '—'}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="panel"><div class="sv-h"><b>Streamers</b><small>${streamers.length} notés</small></div>
      ${streamers.length ? `<div class="sv-scroll"><table class="sv-table"><thead><tr><th>Nom</th><th>Plateforme</th><th class="n">Abonnés</th><th>Statut</th><th>Contacté le</th><th>Relance</th><th>Notes</th></tr></thead><tbody>${streamers.map((s) => `<tr><td>${s['Lien de la chaîne'] ? `<a href="${esc(s['Lien de la chaîne'])}" target="_blank" rel="noopener">${esc(s['Nom'])}</a>` : esc(s['Nom'])}</td><td>${esc(s['Plateforme'])}</td><td class="n">${fmtN(num(s['Abonnés']))}</td><td><i class="sv-tag">${esc(s['Statut'] || 'À contacter')}</i></td><td>${esc(s['Contacté le'])}</td><td>${esc(s['Relance prévue'])}</td><td>${esc(s['Notes'])}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sv-note">Aucun streamer noté pour le moment.</p>'}</section>
    ${auto}`;
}

// Journal : couleur du domaine (texte en Mono sur fond sombre, contraste AA)
const DOMAINS = { code: 'var(--link)', developpement: '#8FA3FF', site: 'var(--data)', 'version web': 'var(--data)', suivi: '#B79CFF', reseaux: '#FF7AB8', version: 'var(--ok)', appli: 'var(--ok)', securite: 'var(--warn)', referencement: '#E9C46A' };
const domColor = (d) => DOMAINS[plain(d || '')] || 'var(--muted)';
// 14 derniers jours (depuis la ligne la plus récente), une journée par bloc, les trois plus récentes ouvertes ;
// « Plus ancien » ajoute les 14 jours qui précèdent la journée suivante. Le domaine n'est écrit qu'au premier d'une
// suite de lignes du même domaine.
const LOG_DAYS = 14;
function logHtml(m) {
  if (!m.rows.length) return empty('Le Journal est vide.', 'news');
  const days = new Map();
  for (const r of m.rows) { const t = dayOf(r.date), k = t ?? r.date; if (!days.has(k)) days.set(k, { t, d: r.date, items: [] }); days.get(k).items.push(r); }
  const groups = [...days.values()].sort((a, b) => (b.t ?? -Infinity) - (a.t ?? -Infinity));
  const since = state.vlogSince ?? back(groups[0].t ?? today0(), LOG_DAYS - 1);
  const dated = groups.filter((g) => g.t != null && g.t >= since);
  const shown = dated.length === groups.filter((g) => g.t != null).length ? groups : dated;
  const label = (g) => (g.t != null ? new Date(g.t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : g.d || 'Sans date');
  const line = (r, prev) => `<div class="sv-line"><span class="sv-dom" style="color:${domColor(r.domain)}">${prev?.domain === r.domain ? '' : esc(r.domain || '—')}</span><p>${linkify(r.text)}${r.where ? ` <small>→ ${linkify(r.where)}</small>` : ''}</p></div>`;
  const older = groups.length - shown.length;
  return `<div class="sv-log">${shown.map((g, i) => `<details class="sv-daybox"${i < 3 ? ' open' : ''}><summary class="sv-day"><span>${esc(label(g))}</span><small>${g.items.length}</small></summary>
      ${g.items.map((r, j) => line(r, g.items[j - 1])).join('')}</details>`).join('')}
    ${older ? `<button type="button" class="btn wide" id="svolder" data-next="${groups.find((g) => g.t != null && g.t < since)?.t ?? since}">Plus ancien <small>${older} jour${older > 1 ? 's' : ''}</small></button>` : ''}</div>`;
}

// Guides : choix du guide dans un menu, sommaire numéroté (ouvert sur ordinateur, à déplier au téléphone), texte
// en colonne de lecture
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
  const wide = matchMedia('(min-width: 960px)').matches;
  return `<label class="sv-pick"><small>Guide <i>${m.list.length}</i></small><select id="svguide">${m.list.map((g) => `<option value="${esc(g.id)}"${g.id === m.id ? ' selected' : ''}>${esc(g.name.replace(/\s*·\s*Paddock Live$/i, ''))}</option>`).join('')}</select></label>
    <div class="sv-guide">${toc.length > 1 ? `<details class="sv-toc"${wide ? ' open' : ''}><summary>Sommaire <small>${toc.length} parties</small></summary>
      <ol>${toc.map((b, i) => `<li><button type="button" data-toc="${i}"><i>${String(i + 1).padStart(2, '0')}</i><span>${esc(b.text.replace(/^\d+\.\s*/, ''))}</span></button></li>`).join('')}</ol></details>` : ''}
    <article class="sv-doc">${html}</article></div>`;
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
    body.innerHTML = `<div class="seg wide" id="svsub">${SUBS.map(([k, v]) => (k === 'set'
      ? `<button data-sub="${k}" class="sv-gear${k === sub ? ' on' : ''}" aria-label="${v} du suivi" title="${v} du suivi : clé des sessions Claude, import">${KEY_ICON}</button>`
      : `<button data-sub="${k}" class="${k === sub ? 'on' : ''}">${v}</button>`)).join('')}</div>
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
  const cols = () => $$('.sv-col', body);
  const fold = (f) => {
    store.set('suivi.fold', f);
    for (const c of cols()) { const shut = isShut(c.dataset.col, !!c.dataset.park, f); c.classList.toggle('shut', shut); $('.sv-colhead', c).setAttribute('aria-expanded', !shut); }
    if (all) all.textContent = cols().every((c) => c.classList.contains('shut')) ? 'Tout déplier' : 'Tout replier';
  };
  $$('.sv-colhead', body).forEach((h) => { h.onclick = () => { const c = h.closest('.sv-col'); fold({ ...foldMap(), [c.dataset.col]: !c.classList.contains('shut') }); }; });
  if (all) all.onclick = () => { const shut = !cols().every((c) => c.classList.contains('shut')), f = foldMap(); for (const c of cols()) f[c.dataset.col] = shut; fold(f); };
  // Détails d'une tâche : ouverts en touchant la ligne
  const openTask = (t, on = !t.classList.contains('open')) => {
    const row = $('.sv-row[aria-expanded]', t);
    if (!row) return;
    t.classList.toggle('open', on);
    row.setAttribute('aria-expanded', on);
    $('.sv-detail', t).hidden = !on;
  };
  $$('.sv-row[aria-expanded]', body).forEach((r) => { r.onclick = () => openTask(r.closest('.sv-task')); });
  // Prochaine tâche : sa ligne montrée (liste dépliée) et ses détails ouverts
  const go = $('[data-goto]', body);
  if (go) go.onclick = () => {
    const t = $$('.sv-task', body).find((x) => x.dataset.id === go.dataset.goto);
    if (!t) return;
    const c = t.closest('.sv-col');
    if (c.classList.contains('shut')) $('.sv-colhead', c).click();
    openTask(t, true);
    t.scrollIntoView({ block: 'center' });
    t.classList.toggle('flash', false);
    void t.offsetWidth;
    t.classList.toggle('flash', true);
  };
  const doneBtn = $('#svdone', body);
  if (doneBtn) doneBtn.onclick = () => { state.vdoneAll = !state.vdoneAll; again(); };
  const older = $('#svolder', body);
  if (older) older.onclick = () => { state.vlogSince = back(+older.dataset.next, LOG_DAYS - 1); again(); };
  const guide = $('#svguide', body);
  if (guide) guide.onchange = () => { state.vguide = guide.value; again(); scrollTo(0, 0); };
  // Case cochée : tâche marquée faite tout de suite (rangée dans « Fait » avec la date du jour), puis liste relue
  $$('[data-check]', body).forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const card = b.closest('.sv-task');
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
  // Sauts directs, sans défilement animé : le recalage de la page (ui.js, à la perte du focus) l'interromprait
  $$('[data-toc]', body).forEach((b) => { b.onclick = () => $(`#svh${b.dataset.toc}`, body)?.scrollIntoView({ block: 'start' }); });
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
