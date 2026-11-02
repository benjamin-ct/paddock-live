// Onglet « Suivi » du Studio, sans Google : tâches, journal, textes des posts, chiffres des réseaux et guides gardés
// dans la base (table studio, une ligne par partie). Lus et écrits par le Studio (code créateur) et par les sessions
// Claude avec la clé du suivi (créée dans le Studio, seule son empreinte est gardée ; variable PADDOCK_SUIVI_KEY,
// scripts/suivi.mjs). Une modification = une liste d'opérations appliquées sur le serveur (ops).
import { getRow, setRow } from './alerts.js';
import { served } from './download.js';

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
export const PARTS = ['tasks', 'log', 'posts', 'net', 'guides'];
const EMPTY = { tasks: [], log: [], posts: [], net: { posts: [], app: [], benjy: [], streamers: [] }, guides: [] };
// Tables des chiffres des réseaux : nom de l'onglet de l'ancienne feuille « Suivi réseaux » (remplissage, import)
const NET_TABS = { app: 'Abonnés Paddock Live', benjy: 'Benjy Paddock', posts: 'Posts Paddock Live', streamers: 'Streamers' };
export const STATUSES = ['À faire', 'En attente', 'Fait', 'Lien'];
const KEY_ROW = 'suivi:key';
const MAX_BODY = 1_500_000;
const POSTS_KEPT = 12;   // textes des posts : les 12 derniers Grands Prix (leurs fichiers effacés avec eux)
// Photos et vidéos des posts : stockage R2 du serveur, à une adresse publique impossible à deviner (comme un lien de
// partage), effacées avec leur Grand Prix ; 90 Mo au plus par fichier (envoi au serveur limité à 100 Mo)
const MAX_FILE = 90 * 1024 * 1024;
const FILE_TYPES = /^(image\/(png|jpeg|webp|gif)|video\/(mp4|quicktime|webm)|application\/pdf)$/;
const fileKey = (f) => `suivi/${f.key}/${f.name}`;
export const fileUrl = (f) => `/studio/f/${f.key}/${encodeURIComponent(f.name)}`;
const cleanName = (n) => String(n || '').split(/[\\/]/).pop().replace(/[^\p{L}\p{N}._ -]+/gu, '-').slice(0, 120);

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const str = (v, max = 4000) => (v == null ? '' : String(v)).slice(0, max);
const id = () => hex(crypto.getRandomValues(new Uint8Array(6)));
const parisDay = (now = Date.now()) => new Date(now).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'numeric', year: 'numeric' });

export async function readPart(env, part) {
  try { return JSON.parse(await getRow(env, `suivi:${part}`)) ?? structuredClone(EMPTY[part]); } catch { return structuredClone(EMPTY[part]); }
}
const writePart = (env, part, v) => setRow(env, `suivi:${part}`, JSON.stringify(v));

// ---------- Nettoyage de ce qui est envoyé ----------
const cleanTask = (t, old = {}) => {
  const out = { ...old };
  for (const k of ['list', 'when', 'domain', 'title', 'detail', 'link', 'doneAt']) if (t[k] !== undefined) out[k] = str(t[k], k === 'detail' ? 4000 : 400);
  if (t.status !== undefined) out.status = STATUSES.includes(t.status) ? t.status : 'À faire';
  out.status ||= 'À faire';
  out.id ||= str(t.id, 40) || id();
  return out;
};
const cleanLog = (e) => ({ date: str(e.date, 20), domain: str(e.domain, 60), text: str(e.text, 4000), where: str(e.where, 400) });
const cleanFile = (f) => ({ key: /^[a-f0-9]{16}$/.test(f?.key) ? f.key : '', name: cleanName(f?.name), type: str(f?.type, 60), size: Number(f?.size) || 0, at: Number(f?.at) || 0 });
const cleanDoc = (d) => ({ id: str(d.id, 40) || id(), name: str(d.name, 200), text: str(d.text, 200000), at: Number(d.at) || Date.now(), ...(Array.isArray(d.files) ? { files: d.files.map(cleanFile).filter((f) => f.key && f.name) } : {}) });
const cleanTable = (rows) => (Array.isArray(rows) ? rows.slice(0, 2000).map((r) => (Array.isArray(r) ? r.slice(0, 30).map((c) => (typeof c === 'number' ? c : str(c, 2000))) : [])) : []);
const cleanNet = (n) => Object.fromEntries(Object.keys(EMPTY.net).map((k) => [k, cleanTable(n?.[k])]));

// Tâche désignée par son identifiant, sinon par son titre exact (une seule tâche non faite de ce titre)
function findTask(tasks, ref) {
  const byId = tasks.findIndex((t) => t.id === ref);
  if (byId >= 0) return byId;
  const same = tasks.map((t, i) => [t, i]).filter(([t]) => t.title === ref && t.status !== 'Fait');
  return same.length === 1 ? same[0][1] : -1;
}

// Opérations : { op: 'task.add', task } · { op: 'task.set', id, ...champs } (status « Fait » : date du jour) ·
// { op: 'task.del', id } · { op: 'log.add', entry } (en tête) · { op: 'posts.put', name, text } (même nom : remplacé) ·
// { op: 'guide.put', name, text } · { op: 'guide.del', name } · { op: 'net.put', net } · { op: 'net.add', table, rows } ·
// { op: 'file.del', name, file } (fichier d'un Grand Prix) · { op: 'part.put', part, data }
// gone : fichiers retirés (effacés du stockage une fois les parties enregistrées)
export function applyOps(parts, ops, now = Date.now(), gone = []) {
  const touched = new Set();
  for (const o of ops) {
    const need = (p) => { touched.add(p); return parts[p]; };
    if (o?.op === 'task.add') { const t = cleanTask(o.task || {}); if (!t.title) throw new Error('Tâche sans titre'); need('tasks').push(t); o.result = t.id; }
    else if (o?.op === 'task.set' || o?.op === 'task.del') {
      const tasks = need('tasks');
      const i = findTask(tasks, String(o.id || o.title || ''));
      if (i < 0) throw new Error(`Tâche introuvable : ${o.id || o.title}`);
      if (o.op === 'task.del') { tasks.splice(i, 1); continue; }
      const { op, id: _, ...fields } = o;
      if (fields.status === 'Fait' && !fields.doneAt) fields.doneAt = parisDay(now);
      tasks[i] = cleanTask(fields, tasks[i]);
    } else if (o?.op === 'log.add') { const e = cleanLog({ date: parisDay(now), ...o.entry }); if (!e.text) throw new Error('Ligne du journal vide'); need('log').unshift(e); }
    else if (o?.op === 'posts.put' || o?.op === 'guide.put') {
      const part = o.op === 'posts.put' ? 'posts' : 'guides';
      const list = need(part);
      const d = cleanDoc({ ...o, at: now });
      if (!d.name) throw new Error('Nom manquant');
      const i = list.findIndex((x) => x.name === d.name);
      if (i >= 0) list[i] = { ...d, id: list[i].id, ...(list[i].files ? { files: list[i].files } : {}) }; else list.push(d);
      if (part === 'posts' && list.length > POSTS_KEPT) gone.push(...list.splice(0, list.length - POSTS_KEPT).flatMap((x) => x.files || []));
    } else if (o?.op === 'file.del') {
      const doc = need('posts').find((x) => x.name === o.name);
      const i = doc?.files?.findIndex((f) => f.name === o.file) ?? -1;
      if (i < 0) throw new Error(`Fichier introuvable : ${o.file}`);
      gone.push(...doc.files.splice(i, 1));
    } else if (o?.op === 'net.add') {
      if (!(o.table in EMPTY.net)) throw new Error('Table inconnue');
      touched.add('net');
      parts.net[o.table] = cleanTable([...(parts.net[o.table] || []), ...(Array.isArray(o.rows) ? o.rows : [])]);
    } else if (o?.op === 'guide.del') { const list = need('guides'); const i = list.findIndex((x) => x.name === o.name); if (i >= 0) list.splice(i, 1); }
    else if (o?.op === 'net.put') { touched.add('net'); parts.net = cleanNet(o.net); }
    else if (o?.op === 'part.put') {
      if (!PARTS.includes(o.part)) throw new Error('Partie inconnue');
      touched.add(o.part);
      const d = o.data;
      const before = o.part === 'posts' ? parts.posts.flatMap((x) => x.files || []) : [];
      parts[o.part] = o.part === 'tasks' ? (Array.isArray(d) ? d.map((t) => cleanTask(t)) : [])
        : o.part === 'log' ? (Array.isArray(d) ? d.map(cleanLog) : [])
        : o.part === 'net' ? cleanNet(d) : (Array.isArray(d) ? d.map(cleanDoc) : []);
      const kept = new Set(o.part === 'posts' ? parts.posts.flatMap((x) => (x.files || []).map(fileKey)) : []);
      gone.push(...before.filter((f) => !kept.has(fileKey(f))));
    } else throw new Error(`Opération inconnue : ${o?.op}`);
  }
  return touched;
}

// ---------- Tables des réseaux remplies avec les chiffres du Studio ----------
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


// Chiffres du Studio écrits dans les tables des réseaux (mêmes règles que pour l'ancienne feuille) ; la ligne du lundi
// de la semaine est ajoutée aux tables des abonnés si elle manque
export function fillNet(net, accounts, { history = [], kept = [], now = Date.now() } = {}) {
  const monday = mondayParis(now);
  for (const k of ['app', 'benjy']) if (net[k]?.length && !net[k].slice(1).some((r) => String(r[0] || '').trim() === monday)) net[k].push([monday]);
  const tables = Object.fromEntries(Object.entries(NET_TABS).map(([k, tab]) => [tab, net[k] || []]));
  const updates = sheetUpdates(tables, accounts, { history, kept, now });
  for (const u of updates) {
    const m = u.range.match(/^'(.+)'!([A-Z])(\d+)$/);
    const key = m && Object.keys(NET_TABS).find((k) => NET_TABS[k] === m[1]);
    if (!key) continue;
    const r = Number(m[3]) - 1, c = m[2].charCodeAt(0) - 65;
    while (net[key].length <= r) net[key].push([]);
    const row = net[key][r];
    while (row.length < c) row.push('');
    row[c] = u.values[0][0];
  }
  return updates.length;
}

// ---------- Clé des sessions Claude ----------
export async function sessionKeyOk(env, req) {
  const k = req.headers.get('X-Suivi-Key') || '';
  const saved = await getRow(env, KEY_ROW);
  return !!(k.length >= 32 && saved && (await sha(k)) === saved);
}

// sub : chemin après « suivi » ; studio : appel du Studio (code créateur) ou d'une session (clé du suivi)
export async function suiviApi(env, req, sub, { studio = false, rows = async () => ({ history: [], kept: [] }), now = Date.now() } = {}) {
  if (req.method === 'GET' && (sub === '' || PARTS.includes(sub))) {
    if (sub) return json({ [sub]: await readPart(env, sub) });
    const out = Object.fromEntries(await Promise.all(PARTS.map(async (p) => [p, await readPart(env, p)])));
    return json({ ...out, keySet: !!(await getRow(env, KEY_ROW)) });
  }
  // Photo ou vidéo d'un Grand Prix (gp : nom de ses textes des posts, créés vides s'il n'y en a pas) : même nom = remplacé
  if (sub === 'file' && req.method === 'PUT') return putFile(env, req, now);
  if (req.method !== 'POST') return json({ error: 'Méthode non prise en charge' }, 405);
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: 'Envoi trop gros' }, 413);
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { return json({ error: 'JSON invalide' }, 400); }
  if (sub === 'ops') {
    const ops = Array.isArray(body) ? body : body?.ops;
    if (!Array.isArray(ops) || !ops.length || ops.length > 200) return json({ error: 'Liste d\'opérations attendue' }, 400);
    const parts = Object.fromEntries(await Promise.all(PARTS.map(async (p) => [p, await readPart(env, p)])));
    let touched;
    const gone = [];
    try { touched = applyOps(parts, ops, now, gone); } catch (err) { return json({ error: err.message }, 400); }
    for (const p of touched) await writePart(env, p, parts[p]);
    if (gone.length) await env.MEDIA?.delete(gone.map(fileKey)).catch(() => {});
    return json({ ok: true, ids: ops.map((o) => o.result).filter(Boolean), ...Object.fromEntries([...touched].map((p) => [p, parts[p]])) });
  }
  if (!studio) return json({ error: 'Réservé au Studio' }, 403);
  // Nouvelle clé des sessions Claude : rendue une seule fois, seule son empreinte est gardée (l'ancienne ne sert plus)
  if (sub === 'key') {
    const key = hex(crypto.getRandomValues(new Uint8Array(24)));
    await setRow(env, KEY_ROW, await sha(key));
    return json({ key });
  }
  // Chiffres des comptes et des posts écrits dans les tables des réseaux (au plus une fois par heure, côté Studio)
  if (sub === 'fill') {
    const net = await readPart(env, 'net');
    const cells = fillNet(net, body?.accounts || [], { ...(await rows()), now });
    if (cells) await writePart(env, 'net', net);
    return json({ ok: true, cells });
  }
  return json({ error: 'Introuvable' }, 404);
}

async function putFile(env, req, now) {
  if (!env.MEDIA) return json({ error: 'Stockage des fichiers (R2) absent du serveur' }, 503);
  const url = new URL(req.url);
  const gp = str(url.searchParams.get('gp'), 200), name = cleanName(url.searchParams.get('f'));
  const type = (req.headers.get('Content-Type') || '').split(';')[0].trim();
  const size = Number(req.headers.get('Content-Length')) || 0;
  if (!gp || !name) return json({ error: 'Grand Prix (gp) et nom du fichier (f) attendus' }, 400);
  if (!FILE_TYPES.test(type)) return json({ error: 'Type de fichier refusé (images, vidéos MP4/MOV/WebM, PDF)' }, 415);
  if (!size || size > MAX_FILE) return json({ error: 'Fichier vide ou trop gros (90 Mo au plus)' }, 413);
  const f = { key: hex(crypto.getRandomValues(new Uint8Array(8))), name, type, size, at: now };
  await env.MEDIA.put(fileKey(f), req.body, { httpMetadata: { contentType: type } });
  const posts = await readPart(env, 'posts');
  let doc = posts.find((x) => x.name === gp);
  if (!doc) { doc = cleanDoc({ name: gp, text: '', at: now }); posts.push(doc); }
  const old = (doc.files ||= []).findIndex((x) => x.name === name);
  const gone = old >= 0 ? doc.files.splice(old, 1, f) : (doc.files.push(f), []);
  if (posts.length > POSTS_KEPT) gone.push(...posts.splice(0, posts.length - POSTS_KEPT).flatMap((x) => x.files || []));
  await writePart(env, 'posts', posts);
  if (gone.length) await env.MEDIA.delete(gone.map(fileKey)).catch(() => {});
  return json({ ok: true, file: { ...f, url: fileUrl(f) } });
}

// Fichier public : /studio/f/<clé>/<nom> (morceaux acceptés pour les vidéos)
export async function suiviFile(req, env, rest) {
  const m = /^([a-f0-9]{16})\/([^/]+)$/.exec(rest);
  if (!m) return new Response('Introuvable', { status: 404 });
  let name;
  try { name = decodeURIComponent(m[2]); } catch { return new Response('Introuvable', { status: 404 }); }
  const obj = await env.MEDIA?.get(`suivi/${m[1]}/${name}`, req.headers.has('Range') ? { range: req.headers } : {});
  if (!obj?.body) return new Response('Introuvable', { status: 404 });
  return served(req, obj, { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400', 'X-Robots-Tag': 'noindex' });
}
