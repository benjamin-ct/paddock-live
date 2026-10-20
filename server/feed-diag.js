// Diagnostic des données F1 (Réglages → Application, mode créateur) : lit TOUTE la séance dans les
// archives (chaque flux de l'Index.json, même ceux que l'appli ignore), sans avoir à regarder le
// replay, et dresse l'inventaire des champs et des canaux de télémétrie, pour repérer une donnée
// nouvelle (énergie de la batterie, mode Boost…).
import zlib from 'node:zlib';
import { archiveGet, archiveJSON } from './archive.js';

const SAMPLES = 6;     // valeurs d'exemple gardées par champ
const DISTINCT = 400;  // valeurs comptées par champ (au-delà : seulement min/max)

// Clé numérique (pilote, indice de tableau, tour…) -> *, sauf les numéros de canaux de télémétrie
const norm = (k, parent) => (/^\d+$/.test(k) && parent !== 'Channels' ? '*' : k);

function walk(fields, node, path, parent) {
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) if (k !== '_kf' && k !== '_deleted') walk(fields, v, `${path}.${norm(k, parent)}`, k);
    return;
  }
  let f = fields.get(path);
  if (!f) fields.set(path, (f = { n: 0, min: Infinity, max: -Infinity, counts: new Map() }));
  f.n++;
  if (typeof node === 'number') { f.min = Math.min(f.min, node); f.max = Math.max(f.max, node); }
  const key = typeof node === 'string' ? node.slice(0, 40) : JSON.stringify(node);
  if (f.counts.has(key) || f.counts.size < DISTINCT) f.counts.set(key, (f.counts.get(key) || 0) + 1);
  else f.more = true;
}

const inflate = (s) => JSON.parse(zlib.inflateRawSync(Buffer.from(s, 'base64')).toString('utf8'));
const decode = (v) => (typeof v === 'string' ? inflate(v) : v);

function summary(fields) {
  return [...fields].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([path, f]) => {
    const byCount = [...f.counts].sort((a, b) => b[1] - a[1]);
    const nums = [...f.counts.keys()].map(Number).filter(Number.isFinite).sort((a, b) => b - a);
    return {
      path, n: f.n, distinct: f.counts.size, more: !!f.more,
      ...(Number.isFinite(f.min) ? { min: f.min, max: f.max, highest: nums.slice(0, 5).map((v) => [v, f.counts.get(String(v))]) } : {}),
      top: byCount.slice(0, SAMPLES),
    };
  });
}

// Tous les flux de la séance (chemin d'archive "2026/…/") : liste, champs et canaux
export async function feedDiag(path, { get = archiveGet, getJSON = archiveJSON } = {}) {
  const t0 = Date.now();
  const feeds = (await getJSON(`${path}Index.json`)).Feeds || {};
  const out = await Promise.all(Object.entries(feeds).map(async ([name, f]) => {
    const fields = new Map();
    let lines = 0, error = null;
    try {
      if (f.KeyFramePath) walk(fields, decode(await getJSON(`${path}${f.KeyFramePath}`)), name);
    } catch { /* image de départ absente : le flux suffit */ }
    try {
      const text = f.StreamPath ? await get(`${path}${f.StreamPath}`, { timeout: 180000 }) : '';
      for (const line of text.split(/\r?\n/)) {
        const i = line.search(/[{"[]/);
        if (i < 0) continue;
        try { walk(fields, decode(JSON.parse(line.slice(i))), name); lines++; } catch { /* ligne illisible */ }
      }
    } catch (err) { error = err.message; }
    return { name, lines, error, fields: summary(fields) };
  }));
  return { path, ms: Date.now() - t0, feeds: out.sort((a, b) => (a.name < b.name ? -1 : 1)) };
}
