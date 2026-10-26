// Onglet « Suivi » : le dossier Google Drive « Paddock Live · Réseaux » lu en direct par le serveur
// (lecture seule) : tâches, textes des posts du week-end à copier, chiffres des réseaux, journal et
// guides. On coche et on modifie toujours dans Google Docs et Sheets (bouton « Ouvrir »).
import { $, $$, esc, api, fmtN, icon, toast, skeleton, empty, failure, store, state, glide } from './ui.js';

const SUBS = [['todo', 'À faire'], ['posts', 'Posts'], ['net', 'Réseaux'], ['log', 'Journal'], ['guides', 'Guides']];
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
const docUrl = (id) => `https://docs.google.com/document/d/${id}/edit`;
const sheetUrl = (id) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s)»<]+[^\s).,»<]/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
const num = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[\s  ]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const parseFr = (s) => { const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const openBtn = (href, label) => `<a class="btn small" href="${href}" target="_blank" rel="noopener">${icon('link')}${label}</a>`;
let copies = [];
const copyBtn = (text) => `<button type="button" class="btn small" data-copy="${copies.push(text) - 1}">${icon('copy')}Copier</button>`;

// ---------- Lecture des Google Docs ----------
const docTab = (d) => (d.tabs ? d.tabs[0].documentTab : d);
const paraText = (p) => p.elements.filter((x) => x.textRun).map((x) => x.textRun.content).join('').replace(/\n$/, '');
const cellText = (c) => c.content.filter((x) => x.paragraph).map((x) => paraText(x.paragraph)).join('\n');
const rgb = (c) => (c?.rgbColor ? `rgb(${['red', 'green', 'blue'].map((k) => Math.round((c.rgbColor[k] || 0) * 255)).join(',')})` : null);

// À faire : une colonne par titre (couleur du bandeau du Doc), une carte par puce
function parseTodo(d) {
  const tab = docTab(d);
  const lists = tab.lists || {};
  const sections = [];
  let updated = '', cur = null;
  for (const e of tab.body.content) {
    const p = e.paragraph;
    if (!p) continue;
    const text = paraText(p);
    if (!text.trim()) continue;
    const st = p.paragraphStyle || {};
    if (/^HEADING_[1-3]$/.test(st.namedStyleType || '')) {
      const title = text.trim();
      const t = plain(title);
      const kind = t.includes('lien') ? 'links' : /(^|\s)fait\b/.test(t) ? 'done' : t.includes('attente') || t.includes('chaque semaine') ? 'info' : 'tasks';
      cur = { title, color: rgb(st.shading?.backgroundColor?.color) || 'var(--surface-2)', kind, items: [], notes: [] };
      sections.push(cur);
      continue;
    }
    if (!cur) { const m = text.match(/Mis à jour le ([^.·]+)/); if (m) updated = m[1].trim(); continue; }
    if (!p.bullet) { cur.notes.push(text); continue; }
    const runs = p.elements.filter((x) => x.textRun).map((x) => x.textRun);
    const level = lists[p.bullet.listId]?.listProperties?.nestingLevels?.[0] || {};
    const lines = text.split('\u000b');
    let first = lines[0];
    const done = cur.kind === 'done' || runs.some((r) => r.textStyle?.strikethrough && r.content.trim()) || /^\s*[☑✅]/.test(first);
    first = first.replace(/^\s*[☐☑✅•]\s*/, '');
    let when = '';
    const sep = first.indexOf('  ·  ');
    if (sep > 0) { when = first.slice(0, sep).trim(); first = first.slice(sep + 5).trim(); }
    let tag = null;
    for (const t of TAGS) for (const ic of [t.icon, ...(t.also || [])]) if (first.startsWith(ic)) { tag = t.key; first = first.slice(ic.length).trim(); }
    if (first.startsWith('🔗')) first = first.slice(2).trim();
    cur.items.push({ start: e.startIndex, when, title: first, detail: lines.slice(1).filter((l) => l.trim()), tag, done,
      box: !level.glyphSymbol, link: runs.map((r) => r.textStyle?.link?.url).find(Boolean) || null });
  }
  return { sections, updated };
}

// Textes des posts d'un Grand Prix : « 1. JOUR · HEURE · TITRE », puis images et textes à copier
function postDate(head, year) {
  const m = plain(head).match(/(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)/);
  return m ? new Date(year, MONTHS.findIndex((x) => plain(x) === m[2]), +m[1]).getTime() : null;
}
const isWhen = (s) => /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|ce soir|\d+\s*h\b)/i.test(s);
function parsePosts(d, file) {
  const year = new Date(file.createdTime || Date.now()).getFullYear();
  const info = [], posts = [];
  let post = null, block = null, headline = '';
  for (const e of docTab(d).body.content) {
    if (!e.paragraph) continue;
    const text = paraText(e.paragraph).trim();
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
  return { id: file.id, name: file.name.replace(/\s*·\s*textes des posts/i, '').replace(/^week-end (de |d')/i, ''), info, posts, first: Math.min(...dates, Infinity), last: Math.max(...dates, 0) };
}

// Guide : titres, paragraphes, puces, tableaux ; tableau d'une seule case = texte à copier (prompts)
function parseGuide(d) {
  const out = [];
  for (const e of docTab(d).body.content) {
    if (e.table) {
      const t = e.table;
      if (t.rows === 1 && t.columns === 1) out.push({ t: 'copy', text: cellText(t.tableRows[0].tableCells[0]).replace(/\u000b/g, '\n').trim() });
      else out.push({ t: 'table', rows: t.tableRows.map((r) => r.tableCells.map((c) => cellText(c).replace(/\u000b/g, ' '))) });
      continue;
    }
    const p = e.paragraph;
    if (!p) continue;
    const text = paraText(p).replace(/\u000b/g, '\n');
    if (!text.trim()) continue;
    const st = p.paragraphStyle?.namedStyleType || '';
    out.push({ t: st === 'TITLE' || st === 'HEADING_1' ? 'h1' : st === 'HEADING_2' ? 'h2' : /^HEADING_/.test(st) ? 'h3' : p.bullet ? 'li' : 'p', text });
  }
  return out;
}

// ---------- Données (gardées sur le téléphone pour l'affichage immédiat) ----------
const values = async (id, range) => (await api(`drive/values?id=${id}&range=${encodeURIComponent(range)}`)).values || [];
const doc = (id) => api(`drive/doc?id=${id}`);
const table = (vals) => { const [h = [], ...r] = vals; return r.map((row) => Object.fromEntries(h.map((k, i) => [k, row[i] ?? '']))); };
const find = (files, re) => files.find((f) => re.test(f.name));
const isDoc = (f) => f.mimeType === 'application/vnd.google-apps.document';

const LOADERS = {
  async todo(files) { const f = find(files, /^À faire/i); if (!f) throw new Error('Document « À faire » introuvable dans le dossier'); return { id: f.id, ...parseTodo(await doc(f.id)) }; },
  async posts(files) {
    const gps = files.filter((f) => isDoc(f) && /textes des posts/i.test(f.name));
    return (await Promise.all(gps.map(async (f) => parsePosts(await doc(f.id), f)))).sort((a, b) => a.first - b.first);
  },
  async net(files) {
    const f = find(files, /^Suivi réseaux/i);
    if (!f) throw new Error('Feuille « Suivi réseaux » introuvable dans le dossier');
    // Feuille remplie d'abord avec les chiffres des comptes (ceux de l'onglet Stats, sinon relus)
    await fillSheet(store.get('stats', 6 * 3600e3)?.v?.accounts || (await api('stats/accounts').catch(() => null))?.accounts);
    const [posts, app, benjy, streamers] = await Promise.all(["'Posts Paddock Live'!A1:L500", "'Abonnés Paddock Live'!A1:J80", "'Benjy Paddock'!A1:L80", 'Streamers!A1:H200'].map((r) => values(f.id, r)));
    return { id: f.id, posts: table(posts), subs: { app, benjy }, streamers: table(streamers) };
  },
  async log(files) {
    const f = find(files, /^Suivi réseaux/i);
    if (!f) throw new Error('Feuille « Suivi réseaux » introuvable dans le dossier');
    return { id: f.id, rows: table(await values(f.id, 'Journal!A1:D400')).filter((r) => r['Ce qui a été fait']) };
  },
  async guides(files) {
    const list = files.filter((f) => isDoc(f) && !/^À faire|textes des posts/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    if (!list.some((f) => f.id === state.vguide)) state.vguide = (find(list, /workflow/i) || list[0])?.id;
    const sel = list.find((f) => f.id === state.vguide);
    return { list: list.map(({ id, name }) => ({ id, name })), id: sel?.id, blocks: sel ? parseGuide(await doc(sel.id)) : [] };
  },
};

// ---------- Affichage ----------
function todoHtml(m) {
  const tasks = m.sections.filter((s) => s.kind === 'tasks').flatMap((s) => s.items.map((it) => ({ ...it, sec: s })));
  const open = tasks.filter((t) => !t.done);
  const next = open.find((t) => t.when) || open[0];
  const bugs = open.filter((t) => t.tag === 'bug').length;
  const filter = state.vtag || 'all';
  const counts = Object.fromEntries(TAGS.map((t) => [t.key, open.filter((x) => x.tag === t.key).length]));
  const card = (it, s) => {
    if (s.kind === 'links' && it.link) return `<a class="sv-card" href="${esc(it.link)}" target="_blank" rel="noopener"><span class="sv-box link">↗</span><span><b>${esc(it.title)}</b></span></a>`;
    const t = TAGS.find((x) => x.key === it.tag);
    const dot = (!it.box || s.kind === 'info') && !it.done;
    // Tâche à cocher : la case la déplace dans « Fait » du Doc, avec la date du jour
    const check = s.kind === 'tasks' && it.box && !it.done ? ` data-check="${it.start}" data-title="${esc(it.title)}" role="checkbox" aria-checked="false" title="Cocher (déplacée dans « Fait »)"` : '';
    return `<button type="button" class="sv-card${it.done ? ' done' : ''}"${it.detail.length ? ' data-open' : ''}><span class="sv-box${dot ? ' dot' : ''}"${check}></span><span>
      ${it.when ? `<small class="sv-when" style="color:${s.color}">${esc(it.when)}</small>` : ''}<b>${esc(it.title)}</b>
      ${t || it.detail.length ? `<span class="sv-meta">${t ? `<i class="sv-tag">${t.icon} ${t.label}</i>` : ''}${it.detail.length ? '<i class="sv-more">Détails ▾</i>' : ''}</span>` : ''}
      ${it.detail.length ? `<span class="sv-detail">${it.detail.map((x) => `<span>${linkify(x)}</span>`).join('')}</span>` : ''}</span></button>`;
  };
  const canCheck = store.get('drive.files')?.v?.canCheck;
  return `${canCheck ? '' : `<div class="notice">${icon('alert')}<span class="grow">Pour cocher les tâches d'ici, reconnecte Google Drive une fois : il demandera aussi le droit de modifier tes Docs.</span><button type="button" class="btn small" id="svwrite">${icon('link')}Reconnecter</button></div>`}<div class="tiles">
      <div class="tile"><b>${open.length}</b><small>tâches à faire</small></div>
      <div class="tile"><b>${tasks.length - open.length + (m.sections.find((s) => s.kind === 'done')?.items.length || 0)}</b><small>faites</small></div>
      <div class="tile"><b${bugs ? ' class="sv-warn"' : ''}>${bugs}</b><small>bugs ouverts</small></div>
    </div>
    ${next ? `<div class="panel sv-next"><small>Prochaine tâche</small><b>${esc(next.title)}</b>${next.when ? `<span class="sv-when">${esc(next.when)} · ${esc(next.sec.title.replace(/^\W+/u, ''))}</span>` : ''}</div>` : ''}
    <div class="chips" id="svtags"><button data-tag="all" class="${filter === 'all' ? 'on' : ''}">Tout <small>${open.length}</small></button>${TAGS.filter((t) => counts[t.key]).map((t) => `<button data-tag="${t.key}" class="${filter === t.key ? 'on' : ''}">${t.icon} ${t.label} <small>${counts[t.key]}</small></button>`).join('')}</div>
    <div class="sv-board">${m.sections.map((s) => {
      const items = filter === 'all' || s.kind === 'links' ? s.items : s.items.filter((it) => it.tag === filter);
      if (filter !== 'all' && !items.length) return '';
      const left = s.items.filter((it) => !it.done).length;
      const pct = s.items.length ? Math.round(((s.items.length - left) / s.items.length) * 100) : 0;
      return `<section class="sv-col"><h3 style="background:${s.color}">${esc(s.title)}<i>${s.kind === 'tasks' ? (left ? `${left} à faire` : 'tout fait ✓') : s.items.length}</i></h3>
        ${s.kind === 'tasks' && s.items.length ? `<div class="sv-prog"><i style="width:${pct}%"></i></div>` : ''}
        ${s.notes.map((n) => `<p class="sv-note">${esc(n)}</p>`).join('')}
        <div class="sv-items">${items.length ? items.map((it) => card(it, s)).join('') : '<p class="sv-note">Rien ici pour le moment.</p>'}</div></section>`;
    }).join('')}</div>
    <p class="sv-foot">${m.updated ? `Liste mise à jour le ${esc(m.updated)} · ` : ''}${openBtn(docUrl(m.id), 'Ouvrir le Doc')}</p>`;
}

function postsHtml(list) {
  if (!list.length) return empty('Aucun texte de posts dans le dossier pour le moment : la routine du lundi les y dépose (« Week-end de <Grand Prix> · textes des posts »).', 'news');
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
        ${p.media.map(([k, v]) => `<p class="sv-media">${/vid/i.test(k) ? '🎬' : '🖼️'} <span>${linkify(v)}</span></p>`).join('')}
        ${p.blocks.map((b) => { const text = b.lines.join('\n\n'); return `<div class="sv-txt"><div class="sv-txthead"><small>${esc(b.label)}</small>${copyBtn(text)}</div><p>${linkify(text)}</p></div>`; }).join('')}
        ${p.notes.map((n) => `<p class="sv-media">ℹ️ <span>${linkify(n)}</span></p>`).join('')}</article>`;
    }).join('')}</div>
    <p class="sv-foot">${openBtn(docUrl(gp.id), 'Ouvrir le Doc')}</p>`;
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
    subs = `<p class="sv-note">Pas encore de relevé. Premier relevé prévu le lundi ${next ? next.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : 'prochain'} : une ligne remplie dans l'onglet « ${acc === 'app' ? 'Abonnés Paddock Live' : 'Benjy Paddock'} » et les chiffres apparaissent ici.</p>`;
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
  const files = store.get('drive.files')?.v;
  const lastFill = store.get('drive.filled')?.at;
  const auto = files?.canWrite
    ? `<p class="sv-note">Abonnés du lundi, meilleur post de Benjy, liens et chiffres des posts (Instagram, Facebook, Threads, Bluesky ; YouTube publié depuis le Studio) remplis par le Studio${lastFill ? ` · dernier passage ${new Date(lastFill).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}` : ''}.</p>`
    : `<div class="notice">${icon('alert')}<span class="grow">Le Studio peut remplir la feuille tout seul (abonnés du lundi, chiffres des posts) : reconnecte Google Drive une fois pour l'autoriser à écrire.</span><button type="button" class="btn small" id="svwrite">${icon('link')}Reconnecter</button></div>`;
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
      ${streamers.length ? `<div class="sv-scroll"><table class="sv-table"><thead><tr><th>Nom</th><th>Plateforme</th><th class="n">Abonnés</th><th>Statut</th><th>Contacté le</th><th>Relance</th><th>Notes</th></tr></thead><tbody>${streamers.map((s) => `<tr><td>${s['Lien de la chaîne'] ? `<a href="${esc(s['Lien de la chaîne'])}" target="_blank" rel="noopener">${esc(s['Nom'])}</a>` : esc(s['Nom'])}</td><td>${esc(s['Plateforme'])}</td><td class="n">${fmtN(num(s['Abonnés']))}</td><td><i class="sv-tag">${esc(s['Statut'] || 'À contacter')}</i></td><td>${esc(s['Contacté le'])}</td><td>${esc(s['Relance prévue'])}</td><td>${esc(s['Notes'])}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sv-note">Aucun streamer noté pour le moment (onglet « Streamers »).</p>'}</section>
    <p class="sv-foot">${openBtn(sheetUrl(m.id), 'Ouvrir la feuille')}</p>`;
}

const DOMAINS = { code: '#1a66d2', site: '#0e7490', suivi: '#6b4fbb', reseaux: '#d62976', version: '#0f8a4f', securite: '#c2410c' };
const domColor = (d) => DOMAINS[plain(d || '')] || '#5a616c';
function logHtml(m) {
  if (!m.rows.length) return empty('Le Journal est vide.', 'news');
  const days = [];
  for (const r of m.rows) { if (days[days.length - 1]?.d !== r['Date']) days.push({ d: r['Date'], items: [] }); days[days.length - 1].items.push(r); }
  const label = (d) => parseFr(d)?.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) || d;
  return `<div class="sv-log">${days.map((g) => `<section><h3 class="sv-day">${esc(label(g.d))}</h3>${g.items.map((r) => `<div class="sv-entry">
      <i class="sv-dom" style="background:${domColor(r['Domaine'])}">${esc(r['Domaine'] || '—')}</i><p>${linkify(r['Ce qui a été fait'])}</p>${r['Où'] ? `<small>→ ${linkify(r['Où'])}</small>` : ''}</div>`).join('')}</section>`).join('')}</div>
    <p class="sv-foot">${openBtn(sheetUrl(m.id), 'Ouvrir la feuille')}</p>`;
}

function guidesHtml(m) {
  if (!m.list.length) return empty('Aucun guide dans le dossier.', 'news');
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
    <article class="sv-doc">${html}</article>
    ${m.id ? `<p class="sv-foot">${openBtn(docUrl(m.id), 'Ouvrir le Doc')}</p>` : ''}`;
}

const RENDER = { todo: todoHtml, posts: postsHtml, net: netHtml, log: logHtml, guides: guidesHtml };

// ---------- Feuille « Suivi réseaux » remplie par le serveur (au plus une fois par heure) ----------
export async function fillSheet(accounts, force = false) {
  const files = store.get('drive.files')?.v;
  if (!accounts?.length || !files?.connected || !files.canWrite || (!force && store.get('drive.filled', 3600e3))) return null;
  try {
    // Posts publiés à la main retrouvés sur les comptes reliés, et leurs chiffres relus : la feuille les reçoit aussi
    const imp = await api('history/import', { method: 'POST' }).catch(() => null);
    if (imp?.added || !store.get('stats', 3600e3)) await api('stats').catch(() => null);
    const r = await api('drive/fill', { method: 'POST', body: JSON.stringify({ accounts }) });
    store.set('drive.filled', r);
    if (r.cells) toast(`Feuille « Suivi réseaux » remplie (${r.cells} case${r.cells > 1 ? 's' : ''})`, 'ok');
    return r;
  } catch (err) {
    if (!store.get('drive.fillerr', 86400e3)) { store.set('drive.fillerr', 1); toast(err.message, 'bad'); }
    return null;
  }
}

async function reconnect(btn) {
  btn.disabled = true;
  btn.classList.add('busy');
  try { location.href = (await api('drive/start', { method: 'POST', body: JSON.stringify({ redirect: `${location.origin}/studio/` }) })).url; }
  catch (err) { toast(err.message, 'bad'); btn.disabled = false; btn.classList.remove('busy'); }
}

// ---------- Connexion Google Drive ----------
function connectHtml(r) {
  const redirect = `${location.origin}/studio/`;
  return `<div class="panel sv-connect">
    <h3>${icon('link')}Relier le dossier Google Drive</h3>
    ${r.expired ? `<p class="notice bad">${icon('alert')}La connexion Google Drive a expiré : reconnectez-la.</p>` : ''}
    <p>Le Studio lit en direct le dossier « Paddock Live · Réseaux » : tâches, textes des posts, chiffres des réseaux, journal et guides. Lecture seule : rien n'est modifié dans le Drive.</p>
    <p class="sv-note">Une seule fois, dans la console Google Cloud (projet de YouTube) :</p>
    <ol>
      <li>API et services → Bibliothèque : activer <b>Google Drive API</b>, <b>Google Docs API</b> et <b>Google Sheets API</b>.</li>
      <li>Identifiants → l'ID client OAuth de YouTube → URI de redirection autorisés : ajouter <code>${esc(redirect)}</code> ${copyBtn(redirect)}</li>
      <li>Le Drive est sur un autre compte Google que YouTube : tant que le projet est en mode « Test », ajouter ce compte dans Google Auth Platform → Audience → Utilisateurs test. Ou « Publier l'application » : tout compte peut se connecter, et l'accès n'expire plus au bout de 7 jours.</li>
    </ol>
    <p class="sv-note">Au moment de se connecter, Google demande quel compte utiliser : choisir celui qui contient le dossier « Paddock Live · Réseaux ».</p>
    <details class="sv-client"${r.youtubeClient ? '' : ' open'}><summary>${r.youtubeClient ? 'Utiliser un autre client Google' : 'Client Google (ID et code secret)'}</summary>
      <label class="field"><span>ID client</span><input type="text" id="svcid" autocomplete="off" spellcheck="false"></label>
      <label class="field"><span>Code secret</span><input type="password" id="svcsecret" autocomplete="off"></label>
    </details>
    <button class="btn primary wide" id="svconnect">${icon('link')}Connecter Google Drive</button>
  </div>`;
}

// Retour de Google sur /studio/?code=…&state=… : connexion terminée par le serveur
export async function finishDrive(back) {
  if (back.error) { toast(back.error === 'access_denied' ? 'Connexion Google Drive annulée' : `Google : ${back.error}`, 'bad'); return; }
  try { await api('drive/finish', { method: 'POST', body: JSON.stringify({ code: back.code, state: back.state }) }); toast('Google Drive connecté', 'ok'); store.del('drive.files'); }
  catch (err) { toast(err.message, 'bad'); }
}

// ---------- Onglet ----------
export async function suiviTab(body, { force, restore, current }) {
  state.vsub ||= 'todo';
  const known = store.get('drive.files');
  let files = known?.v;
  const recent = known && Date.now() - known.at < 2 * 60e3 && !force;
  if (!files) body.innerHTML = skeleton(3);
  if (!recent || !files) {
    files = await api('drive/files');
    if (!current()) return;
    store.set('drive.files', files);
  }
  if (!files.connected) { renderConnect(body, files); return; }
  if (!files.folder) { body.innerHTML = empty('Dossier « Paddock Live · Réseaux » introuvable dans ce compte Google Drive.', 'alert'); return; }
  await showSub(body, { force, current });
  if (restore) requestAnimationFrame(() => scrollTo(0, restore));
}

function renderConnect(body, r) {
  copies = [];
  body.innerHTML = connectHtml(r);
  bindCopies(body);
  $('#svconnect', body).onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.classList.add('busy');
    try {
      const { url } = await api('drive/start', { method: 'POST', body: JSON.stringify({ redirect: `${location.origin}/studio/`, clientId: $('#svcid', body).value.trim(), clientSecret: $('#svcsecret', body).value.trim() }) });
      location.href = url;
    } catch (err) { toast(err.message, 'bad'); btn.disabled = false; btn.classList.remove('busy'); }
  };
}

async function showSub(body, { force, current }) {
  const sub = state.vsub;
  const key = `drive.${sub}${sub === 'guides' ? `.${state.vguide || ''}` : ''}`;
  const known = store.get(key);
  const paint = (m, stale) => {
    if (!current() || state.vsub !== sub) return;
    copies = [];
    body.innerHTML = `<div class="seg wide" id="svsub">${SUBS.map(([k, v]) => `<button data-sub="${k}" class="${k === sub ? 'on' : ''}">${v}</button>`).join('')}</div>
      ${stale ? '<p class="status"><span class="dot"></span>Mise à jour…</p>' : ''}<div id="svpane">${m ? RENDER[sub](m) : skeleton(3)}</div>`;
    bind(body, m, { force, current });
    glide(body);
  };
  // Rubrique relue au plus toutes les 2 minutes (sauf « Actualiser »)
  if (known && Date.now() - known.at < 2 * 60e3 && !force) { paint(known.v, false); return; }
  paint(known?.v, !!known);
  try {
    const m = await LOADERS[sub](store.get('drive.files').v.files);
    store.set(`drive.${sub}${sub === 'guides' ? `.${m.id || ''}` : ''}`, m);
    paint(m, false);
  } catch (err) {
    if (!current() || state.vsub !== sub) return;
    if (known) { paint(known.v, false); toast(`Actualisation impossible : ${err.message}`, 'bad'); return; }
    $('#svpane', body).innerHTML = failure(err);
    $('[data-retry]', body).onclick = () => showSub(body, { force: true, current });
  }
}

function bindCopies(root) {
  $$('[data-copy]', root).forEach((b) => {
    b.onclick = () => navigator.clipboard.writeText(copies[+b.dataset.copy]).then(() => toast('Copié', 'ok'), () => toast('Copie impossible', 'bad'));
  });
}

function bind(body, m, opts) {
  const again = (force = false) => showSub(body, { ...opts, force });
  $$('#svsub [data-sub]', body).forEach((b) => { b.onclick = () => { state.vsub = b.dataset.sub; again(); }; });
  bindCopies(body);
  if (!m) return;
  $$('.sv-card[data-open]', body).forEach((c) => { c.onclick = (e) => { if (!e.target.closest('a, [data-check]')) c.classList.toggle('open'); }; });
  // Case cochée : tâche marquée faite tout de suite, déplacée dans « Fait » du Doc, puis liste relue
  $$('[data-check]', body).forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      if (!store.get('drive.files')?.v?.canCheck) { toast('Reconnecte Google Drive pour cocher d\'ici', 'bad'); return; }
      const card = b.closest('.sv-card');
      if (card.classList.contains('done')) return;
      card.classList.add('done');
      b.setAttribute('aria-checked', 'true');
      try {
        await api('drive/check', { method: 'POST', body: JSON.stringify({ id: m.id, start: Number(b.dataset.check), title: b.dataset.title }) });
        toast('Fait : rangé dans « Fait » du Doc', 'ok');
      } catch (err) { toast(err.message, 'bad'); }
      again(true);
    };
  });
  $$('#svtags [data-tag]', body).forEach((b) => { b.onclick = () => { state.vtag = b.dataset.tag; again(); }; });
  $$('#svgps [data-gp]', body).forEach((b) => { b.onclick = () => { state.vgp = b.dataset.gp; again(); }; });
  $$('#svacc [data-acc]', body).forEach((b) => { b.onclick = () => { state.vacc = b.dataset.acc; again(); }; });
  $$('#svguides [data-guide]', body).forEach((b) => { b.onclick = () => { state.vguide = b.dataset.guide; again(); }; });
  const write = $('#svwrite', body);
  if (write) write.onclick = () => reconnect(write);
  $$('[data-toc]', body).forEach((b) => { b.onclick = () => $(`#svh${b.dataset.toc}`, body)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
