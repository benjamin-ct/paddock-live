// Onglet « Suivi » du Studio : le dossier Google Drive du suivi (« Paddock Live · Réseaux ») lu par le
// serveur ; écrits seulement : la feuille « Suivi réseaux » (chiffres) et les tâches cochées de « À faire ». Connexion Google faite depuis le Studio (retour sur la page /studio/),
// jetons gardés dans le coffre chiffré avec la clé du créateur.
// Le compte Google du Drive peut être un autre que celui de YouTube : Google demande toujours lequel
// utiliser, avec le même client Google (projet de YouTube).
import { googleOAuth, youtubeTokens } from '../shared/video-publish.js';

const FOLDER = 'Paddock Live · Réseaux';
// Lecture du Drive ; écriture des feuilles (« Suivi réseaux » remplie avec les chiffres du Studio) et des Docs
// (tâche cochée dans « À faire »)
const WRITE = 'https://www.googleapis.com/auth/spreadsheets';
const DOCS_WRITE = 'https://www.googleapis.com/auth/documents';
const SCOPE = `https://www.googleapis.com/auth/drive.readonly ${WRITE} ${DOCS_WRITE}`;
// Chaque service Google a son adresse (Docs et Sheets ne répondent pas sur celle de Drive)
const DRIVE = 'https://www.googleapis.com/drive/v3';
const DOCS = 'https://docs.googleapis.com/v1';
const SHEETS = 'https://sheets.googleapis.com/v4';
const ID = /^[\w-]{10,100}$/;

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

// Jeton d'accès valable (renouvelé dans ses 5 dernières minutes) ; coffre réenregistré s'il change
async function token(vault, save) {
  const g = vault.gdrive;
  if (g.accessToken && g.expiresAt - Date.now() > 5 * 60e3) return g.accessToken;
  const next = youtubeTokens(g, await googleOAuth({ client_id: g.clientId, client_secret: g.clientSecret, grant_type: 'refresh_token', refresh_token: g.refreshToken }));
  await save({ ...vault, gdrive: next });
  return next.accessToken;
}

// body : envoyé en POST (JSON) ; sinon lecture
async function google(url, at, body = null) {
  const res = await fetch(url, { ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), headers: { Authorization: `Bearer ${at}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(20000) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = d.error?.message || `HTTP ${res.status}`;
    // API pas encore activée dans le projet Google : le message de Google le dit, avec le lien
    throw Object.assign(new Error(`Google : ${why}`.slice(0, 400)), { status: res.status === 404 ? 404 : 502 });
  }
  return d;
}

async function folder(at) {
  const q = (s) => new URLSearchParams({ q: s, fields: 'files(id,name,mimeType,createdTime,modifiedTime)', pageSize: '100', orderBy: 'name' });
  const dir = (await google(`${DRIVE}/files?${q(`name = '${FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)}`, at)).files?.[0];
  if (!dir) return { folder: null, files: [] };
  return { folder: { id: dir.id, name: dir.name }, files: (await google(`${DRIVE}/files?${q(`'${dir.id}' in parents and trashed = false`)}`, at)).files || [] };
}

// ---------- Feuille « Suivi réseaux » remplie avec les chiffres du Studio ----------
// Abonnés : la ligne du lundi de la semaine (heure de Paris), seulement si elle est encore vide (relevé
// du début de semaine, jamais un chiffre tapé à la main remplacé). Benjy : meilleur post des 7 derniers
// jours. Posts : chiffres des posts du journal des publications du Studio (mis à jour), d'après le lien collé dans
// la feuille, ou retrouvé et écrit quand la case est vide (même réseau, même jour, l'heure la plus proche).
const NET_COLS = { instagram: 'instagram', facebook: 'facebook', tiktok: 'tiktok', x: 'x', threads: 'threads', bluesky: 'bluesky', youtube: 'youtube' };
const METRICS = { vues: ['views'], "j'aime": ['likes'], commentaires: ['comments'], partages: ['shares'], enregistrements: ['saves'], clics: ['clicks'] };
const TABS = [['Abonnés Paddock Live', 'Paddock Live'], ['Benjy Paddock', 'Benjy Paddock']];
const col = (i) => String.fromCharCode(65 + i);
const cell = (tab, i, r) => `'${tab}'!${col(i)}${r + 1}`;
const empty = (v) => v == null || String(v).trim() === '';
const number = (v) => { const n = Number(String(v ?? '').replace(/[\s\u202f\u00a0]/g, '').replace(',', '.')); return String(v ?? '').trim() && Number.isFinite(n) ? n : null; };
const norm = (u) => String(u || '').trim().toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

export function mondayParis(now = Date.now()) {
  const [d, m, y] = new Date(now).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }).split('/').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function sheetUpdates(tables, accounts, { history = [], kept = [], now = Date.now() } = {}) {
  const out = [];
  const monday = mondayParis(now);
  const stats = new Map(kept.map((k) => [k.key, k.stats || {}]));
  for (const [tab, name] of TABS) {
    const [head = [], ...rows] = tables[tab] || [];
    const acc = (accounts || []).find((a) => a?.name === name);
    const r = rows.findIndex((row) => String(row[0] || '').trim() === monday);
    if (!acc || r < 0) continue;
    const row = rows[r];
    const nets = head.map((h, i) => [i, NET_COLS[String(h).trim().toLowerCase()]]).filter(([i, n]) => i > 0 && n);
    if (!nets.every(([i]) => empty(row[i]))) continue;
    // Un réseau en erreur (YouTube déconnecté…) : rien d'écrit, nouvel essai l'heure suivante (une ligne à moitié
    // remplie ne serait plus complétée, et son total oublierait ce réseau)
    if (nets.some(([, n]) => acc.nets?.[n]?.error)) continue;
    let total = 0, any = false;
    for (const [i, n] of nets) {
      const v = acc.nets?.[n]?.stats?.followers;
      if (typeof v === 'number') { out.push({ range: cell(tab, i, r + 1), values: [[v]] }); total += v; any = true; }
    }
    if (!any) continue;
    const ti = head.findIndex((h) => /^total$/i.test(String(h).trim()));
    if (ti > 0 && empty(row[ti])) out.push({ range: cell(tab, ti, r + 1), values: [[total]] });
    const gi = head.findIndex((h) => /^gagn/i.test(String(h).trim()));
    const prev = ti > 0 ? rows.slice(0, r).reverse().map((x) => number(x[ti])).find((x) => x != null) : null;
    if (gi > 0 && empty(row[gi]) && prev != null) out.push({ range: cell(tab, gi, r + 1), values: [[total - prev]] });
    // Meilleur post des 7 derniers jours (vues de tous ses réseaux)
    const bi = head.findIndex((h) => /^meilleur post/i.test(String(h).trim()));
    const vi = head.findIndex((h) => /^vues du meilleur/i.test(String(h).trim()));
    if (bi > 0 && vi > 0 && empty(row[bi]) && empty(row[vi])) {
      const best = history.filter((e) => e.at > now - 7 * 86400e3 && stats.has(e.key))
        .map((e) => ({ e, views: Object.values(stats.get(e.key)).reduce((a, s) => a + (Number(s?.views) || 0), 0) }))
        .sort((a, b) => b.views - a.views)[0];
      if (best?.views) out.push({ range: cell(tab, bi, r + 1), values: [[String(best.e.title || best.e.key).slice(0, 120)]] }, { range: cell(tab, vi, r + 1), values: [[best.views]] });
    }
  }
  // Posts : lien du post retrouvé dans le journal des publications du Studio
  const tab = 'Posts Paddock Live';
  const [head = [], ...rows] = tables[tab] || [];
  const li = head.findIndex((h) => /^lien/i.test(String(h).trim()));
  const [di, hi, ni] = ['date', 'heure', 'réseau'].map((x) => head.findIndex((h) => String(h).trim().toLowerCase() === x));
  const urls = new Map();
  for (const e of history) for (const [n, v] of Object.entries(e.nets || {})) if (v?.url) urls.set(norm(v.url), [e.key, n]);
  const paris = (t, o) => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', ...o });
  const mins = (v) => { const m = String(v || '').match(/^(\d{1,2})[:h](\d{2})/); return m ? m[1] * 60 + Number(m[2]) : null; };
  const used = new Set(rows.map((row) => norm(row[li])).filter(Boolean));
  // Case vide : post du même réseau (« Instagram Reels » : Instagram) publié le même jour, le plus proche de l'heure prévue
  const guess = (row) => {
    const net = NET_COLS[String(row[ni] || '').trim().toLowerCase().split(' ')[0]];
    const want = mins(row[hi]);
    return history.filter((e) => e.nets?.[net]?.url && !used.has(norm(e.nets[net].url)) && paris(e.at, { day: '2-digit', month: '2-digit', year: 'numeric' }) === String(row[di] || '').trim())
      .map((e) => ({ url: e.nets[net].url, gap: want == null ? 0 : Math.abs(mins(paris(e.at, { hour: '2-digit', minute: '2-digit' })) - want) }))
      .sort((a, b) => a.gap - b.gap)[0]?.url;
  };
  // Lignes avec une heure d'abord : elles prennent le post le plus proche, les autres ce qui reste
  if (li >= 0) rows.map((row, r) => [row, r]).sort(([a], [b]) => (mins(a[hi]) == null) - (mins(b[hi]) == null)).forEach(([row, r]) => {
    let link = row[li];
    if (empty(link) && di >= 0 && ni >= 0 && (link = guess(row))) { used.add(norm(link)); out.push({ range: cell(tab, li, r + 1), values: [[link]] }); }
    const hit = urls.get(norm(link));
    const s = hit && stats.get(hit[0])?.[hit[1]];
    if (!s) return;
    head.forEach((h, i) => {
      const keys = METRICS[String(h).trim().toLowerCase()];
      const v = keys && keys.map((k) => s[k]).find((x) => typeof x === 'number');
      // Case vide ou chiffre plus petit seulement : un chiffre tapé à la main (plus récent, d'après le réseau) reste
      if (typeof v === 'number' && (number(row[i]) == null || v > number(row[i]))) out.push({ range: cell(tab, i, r + 1), values: [[v]] });
    });
  });
  return out;
}

async function fill(at, accounts, { history, kept }) {
  const { files } = await folder(at);
  const sheet = files.find((f) => /^Suivi réseaux/i.test(f.name));
  if (!sheet) return { error: 'Feuille « Suivi réseaux » introuvable dans le dossier' };
  const ranges = ["'Abonnés Paddock Live'!A1:J80", "'Benjy Paddock'!A1:L80", "'Posts Paddock Live'!A1:L500"];
  const got = await google(`${SHEETS}/spreadsheets/${sheet.id}/values:batchGet?${new URLSearchParams(ranges.map((r) => ['ranges', r]))}`, at);
  const tables = Object.fromEntries((got.valueRanges || []).map((v, i) => [ranges[i].split('!')[0].replace(/'/g, ''), v.values || []]));
  const data = sheetUpdates(tables, accounts, { history, kept });
  if (data.length) {
    const res = await fetch(`${SHEETS}/spreadsheets/${sheet.id}/values:batchUpdate`, {
      method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw Object.assign(new Error(res.status === 403 ? 'Écriture refusée par Google : reconnectez Google Drive (onglet Suivi) pour autoriser le remplissage de la feuille' : `Google : ${d.error?.message || `HTTP ${res.status}`}`), { status: res.status === 403 ? 403 : 502 });
    }
  }
  return { ok: true, cells: data.length };
}

// Tâche cochée dans l'onglet « Tâches » de « Suivi réseaux » : Statut « Fait » et date du jour (« Fait le »).
// row : sa ligne, title : son titre (contrôle que la feuille n'a pas été triée ou modifiée entre-temps)
export async function doneRow(at, id, row, title, now = new Date(), call = google) {
  const got = await call(`${SHEETS}/spreadsheets/${id}/values/${encodeURIComponent(`'Tâches'!E${row}`)}`, at);
  if (!title.trim() || String(got.values?.[0]?.[0] || '').trim() !== title.trim()) throw Object.assign(new Error('La liste a changé : actualisez l\'onglet Suivi'), { status: 409 });
  const date = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
  await call(`${SHEETS}/spreadsheets/${id}/values:batchUpdate`, at, { valueInputOption: 'RAW', data: [
    { range: `'Tâches'!A${row}`, values: [['Fait']] }, { range: `'Tâches'!H${row}`, values: [[date]] }] });
  return { ok: true, date };
}

// Tâche cochée dans « À faire » : déplacée en tête de « Fait » avec la date du jour (« 25 oct.  ·  titre »), dans la
// mise en forme de la première tâche faite. start : début de son paragraphe, title : son titre (contrôle que
// la liste n'a pas changé entre-temps ; le Doc doit aussi être resté à la même version)
const paraText = (p) => (p?.elements || []).map((x) => x.textRun?.content || '').join('').replace(/\n$/, '');
const heading = (e) => /^HEADING_/.test(e.paragraph?.paragraphStyle?.namedStyleType || '');
const STYLE = 'bold,italic,fontSize,foregroundColor,weightedFontFamily';
const styleOf = (s = {}, bold) => ({ bold, italic: !!s.italic, ...['fontSize', 'foregroundColor', 'weightedFontFamily'].reduce((o, k) => (s[k] ? { ...o, [k]: s[k] } : o), {}) });
export async function checkTask(at, id, start, title, now = new Date(), call = google) {
  const d = await call(`${DOCS}/documents/${id}`, at);
  const content = d.body?.content || [];
  const item = content.find((e) => e.startIndex === start && e.paragraph?.bullet);
  const lines = paraText(item?.paragraph).split('\u000b');
  if (!item || !title.trim() || !lines[0].includes(title)) throw Object.assign(new Error('La liste a changé : actualisez l\'onglet Suivi'), { status: 409 });
  const h = content.findIndex((e) => heading(e) && /(^|\s)fait\b/.test(paraText(e.paragraph).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()));
  const model = h < 0 ? null : content.slice(h + 1).find((e) => heading(e) || e.paragraph?.bullet);
  if (!model?.paragraph?.bullet) throw Object.assign(new Error('Section « Fait » (avec au moins une tâche) introuvable dans le Doc'), { status: 409 });
  const runs = model.paragraph.elements.map((x) => x.textRun).filter(Boolean);
  // Détail : mis en forme comme celui de la première tâche faite qui en a un (la première peut n'avoir qu'un titre)
  const end = content.findIndex((e, i) => i > h && heading(e));
  const withDetail = content.slice(h + 1, end < 0 ? undefined : end).map((e) => (e.paragraph?.elements || []).map((x) => x.textRun).filter(Boolean)).find((r) => r.length > 1);
  const date = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
  const head = `${date}  ·  ${title.trim()}`;
  const rest = lines.slice(1).filter((l) => l.trim()).map((l) => `\u000b${l}`).join('');
  const at0 = model.startIndex;
  const len = (s) => s.length;   // index Google : unités UTF-16, comme les chaînes JavaScript
  const add = [
    { insertText: { location: { index: at0 }, text: `${head}${rest}\n` } },
    { updateTextStyle: { range: { startIndex: at0, endIndex: at0 + len(head) }, textStyle: styleOf(runs[0]?.textStyle, true), fields: STYLE } },
    ...(rest ? [{ updateTextStyle: { range: { startIndex: at0 + len(head), endIndex: at0 + len(head) + len(rest) }, textStyle: styleOf((runs[1] || withDetail?.[1] || runs[0])?.textStyle, false), fields: STYLE } }] : []),
  ];
  const del = { deleteContentRange: { range: { startIndex: item.startIndex, endIndex: item.endIndex } } };
  // Le plus loin dans le Doc d'abord : l'autre modification ne décale pas ses index
  const requests = at0 > item.startIndex ? [...add, del] : [del, ...add];
  await call(`${DOCS}/documents/${id}:batchUpdate`, at, { requests, writeControl: { requiredRevisionId: d.revisionId } });
  return { ok: true, date };
}

export async function driveApi(sub, req, url, vault, save, data = async () => ({ history: [], kept: [] })) {
  if (sub === 'start' && req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
    let redirect;
    try { redirect = new URL(body?.redirect); } catch { redirect = null; }
    if (!redirect || redirect.protocol !== 'https:' || redirect.pathname !== '/studio/' || redirect.search || redirect.hash) return json({ error: 'Adresse de retour invalide' }, 400);
    // Client Google : celui donné, sinon celui de YouTube (même projet Google)
    // Client Google : celui donné, sinon celui de la connexion Drive (reconnexion), sinon celui de YouTube
    const known = [vault.gdrive, vault.youtube].find((c) => c?.clientId && (!body.clientId || c.clientId === body.clientId));
    const clientId = String(body.clientId || known?.clientId || '').trim();
    const clientSecret = String(body.clientSecret || known?.clientSecret || '').trim();
    if (!clientId || !clientSecret) return json({ error: 'Renseignez l\'ID client et le code secret Google' }, 400);
    const verifier = random(48);
    const state = random(16);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    await save({ ...vault, gdrivePending: { state, verifier, redirect: redirect.href, clientId, clientSecret, at: Date.now() } });
    return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: clientId, redirect_uri: redirect.href, response_type: 'code', state, scope: SCOPE,
      code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'select_account consent',
    })}` });
  }
  if (sub === 'finish' && req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
    const p = vault.gdrivePending;
    if (!p || p.state !== body?.state || Date.now() - p.at > 15 * 60e3) return json({ error: 'Demande de connexion expirée : recommencez depuis l\'onglet Suivi' }, 400);
    const { gdrivePending, ...rest } = vault;
    let r;
    try {
      r = await googleOAuth({ client_id: p.clientId, client_secret: p.clientSecret, code: String(body.code || ''), grant_type: 'authorization_code', redirect_uri: p.redirect, code_verifier: p.verifier });
    } catch (err) {
      await save(rest);
      return json({ error: `Google a refusé la connexion : ${err.message}` }, 502);
    }
    if (!r.refresh_token) { await save(rest); return json({ error: 'Google n\'a pas donné d\'accès durable : recommencez la connexion' }, 502); }
    await save({ ...rest, gdrive: { ...youtubeTokens({ clientId: p.clientId, clientSecret: p.clientSecret }, r), scope: r.scope || '' } });
    return json({ ok: true });
  }
  if (sub === 'forget' && req.method === 'POST') {
    const { gdrive, gdrivePending, ...rest } = vault;
    await save(rest);
    return json({ ok: true });
  }
  if (!(req.method === 'GET' && ['files', 'doc', 'values'].includes(sub)) && !(req.method === 'POST' && ['fill', 'check', 'done'].includes(sub))) return json({ error: 'Introuvable' }, 404);
  if (!vault.gdrive?.refreshToken) return json({ connected: false, youtubeClient: !!vault.youtube?.clientId });

  let at;
  try { at = await token(vault, save); } catch (err) {
    // Accès retiré ou expiré (projet Google en mode « Test » : 7 jours) : il faut se reconnecter
    if (err.code === 'invalid_grant') {
      const { gdrive, ...rest } = vault;
      await save(rest);
      return json({ connected: false, expired: true, youtubeClient: !!vault.youtube?.clientId });
    }
    return json({ error: `Google : ${err.message}` }, 502);
  }
  try {
    if (sub === 'files') return json({ connected: true, canWrite: (vault.gdrive.scope || '').includes(WRITE), canCheck: (vault.gdrive.scope || '').includes(DOCS_WRITE), ...(await folder(at)) });
    if (sub === 'check') {
      if (!(vault.gdrive.scope || '').includes(DOCS_WRITE)) return json({ error: 'Reconnectez Google Drive (onglet Suivi) pour cocher depuis le Studio' }, 403);
      let body;
      try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
      if (!ID.test(String(body?.id || '')) || !Number.isInteger(body?.start)) return json({ error: 'Tâche invalide' }, 400);
      return json(await checkTask(at, body.id, body.start, String(body.title || '').slice(0, 300)));
    }
    if (sub === 'done') {
      if (!(vault.gdrive.scope || '').includes(WRITE)) return json({ error: 'Reconnectez Google Drive (onglet Suivi) pour cocher depuis le Studio' }, 403);
      let body;
      try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
      if (!ID.test(String(body?.id || '')) || !Number.isInteger(body?.row) || body.row < 2) return json({ error: 'Tâche invalide' }, 400);
      return json(await doneRow(at, body.id, body.row, String(body.title || '').slice(0, 300)));
    }
    if (sub === 'fill') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
      return json(await fill(at, body?.accounts, await data()));
    }
    const id = url.searchParams.get('id') || '';
    if (!ID.test(id)) return json({ error: 'Document invalide' }, 400);
    if (sub === 'doc') return json(await google(`${DOCS}/documents/${id}?includeTabsContent=true`, at));
    const range = url.searchParams.get('range') || '';
    if (!range || range.length > 100) return json({ error: 'Plage invalide' }, 400);
    return json(await google(`${SHEETS}/spreadsheets/${id}/values/${encodeURIComponent(range)}`, at));
  } catch (err) {
    return json({ error: err.message }, err.status || 502);
  }
}
