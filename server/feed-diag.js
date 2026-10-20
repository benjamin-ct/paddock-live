// Diagnostic des données F1 (Réglages → Application, mode créateur) : lit TOUTE la séance dans les
// archives (chaque flux de l'Index.json, même ceux que l'appli ignore), sans avoir à regarder le
// replay, et dresse l'inventaire des champs et des canaux de télémétrie, pour repérer une donnée
// nouvelle (énergie de la batterie, mode Boost…).
import zlib from 'node:zlib';
import { archiveGet, archiveJSON } from './archive.js';
import { parseUtc } from '../shared/f1.js';

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
const offOf = (line) => { const m = /^(\d+):(\d\d):(\d\d)\.(\d+)/.exec(line); return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + Math.round(+`0.${m[4]}` * 1000) : 0; };

// Chronologie des indices possibles du mode dépassement 2026 : chaque changement d'OvertakeState
// (DriverRaceInfo) et des indicateurs 4096 / 8192 du statut d'un pilote (TimingData, absents de
// TimingDataF1), avec tour, position et écart sur la voiture de devant à cet instant ; et chaque entrée
// d'OvertakeSeries (dépassements, sens encore à confirmer : deux pilotes par instant, « count » rarement > 1)
const CHRONO = new Set(['DriverList', 'DriverRaceInfo', 'TimingData', 'OvertakeSeries']);
const FLAGS = 4096 | 8192;
const secs = (v) => { const m = /^\+?(\d+(?:\.\d+)?)$/.exec(String(v ?? '').trim()); return m ? +m[1] : null; };

export function overtakeChrono(events) {
  const cars = new Map(), out = [];
  const car = (n) => { if (!cars.has(n)) cars.set(n, { tla: n, lap: 0, pos: null, gap: null, state: null, flags: 0 }); return cars.get(n); };
  const at = (off, n, c, what, from, to) => out.push({ off, num: n, tla: c.tla, lap: c.lap, pos: c.pos, gap: c.gap, what, from, to });
  for (const { off, feed, data } of events.sort((a, b) => a.off - b.off)) {
    if (feed === 'DriverList') {
      for (const [n, d] of Object.entries(data || {})) if (d?.Tla) car(n).tla = d.Tla;
    } else if (feed === 'OvertakeSeries') {
      for (const [n, list] of Object.entries(data?.Overtakes || {})) {
        for (const o of Object.values(list || {})) if (o?.Timestamp) at(off, n, car(n), 'Overtake', null, o.count);
      }
    } else if (feed === 'DriverRaceInfo') {
      for (const [n, d] of Object.entries(data || {})) {
        if (!d || typeof d !== 'object') continue;
        const c = car(n);
        if (d.Position) c.pos = +d.Position;
        if (d.Interval !== undefined) c.gap = secs(d.Interval);
        if (d.OvertakeState !== undefined && d.OvertakeState !== c.state) { if (c.state !== null) at(off, n, c, 'OvertakeState', c.state, d.OvertakeState); c.state = d.OvertakeState; }
      }
    } else {
      for (const [n, l] of Object.entries(data?.Lines || {})) {
        if (!l || typeof l !== 'object') continue;
        const c = car(n);
        if (l.NumberOfLaps !== undefined) c.lap = +l.NumberOfLaps;
        if (l.Position) c.pos = +l.Position;
        if (l.IntervalToPositionAhead?.Value !== undefined) c.gap = secs(l.IntervalToPositionAhead.Value);
        if (typeof l.Status === 'number' && (l.Status & FLAGS) !== c.flags) { at(off, n, c, 'Status', c.flags, l.Status & FLAGS); c.flags = l.Status & FLAGS; }
      }
    }
  }
  // Résumé : écart médian sur la voiture de devant au moment de chaque passage
  const groups = new Map();
  for (const e of out) {
    const k = `${e.what} → ${e.to}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e.gap);
  }
  const changes = [...groups].sort().map(([k, gaps]) => {
    const g = gaps.filter((x) => x !== null).sort((a, b) => a - b);
    return { change: k, n: gaps.length, median: g.length ? g[g.length >> 1] : null, under1: g.filter((x) => x <= 1).length, known: g.length };
  });
  // Entrées d'OvertakeSeries par pilote (nombre et total des « count »)
  const per = new Map();
  for (const e of out) if (e.what === 'Overtake') { const p = per.get(e.tla) || { tla: e.tla, n: 0, sum: 0 }; p.n++; p.sum += Number(e.to) || 0; per.set(e.tla, p); }
  return { summary: changes.filter((x) => !x.change.startsWith('Overtake ')), overtakes: [...per.values()].sort((a, b) => b.n - a.n), events: out };
}

// Calibrage de l'énergie estimée (shared/energy.js) : à plein gaz (sans frein), vitesse gagnée en ~1 s selon
// la vitesse. Une voiture qui débite encore gagne nettement ; batterie vide : gain nul, voire perte
const BANDS = [200, 240, 270, 290];   // km/h (bas de chaque tranche)
const GAINS = [0, 3, 6, 10];          // km/h gagnés en 1 s (haut de chaque classe, puis « plus »)
export function energyCalibration() {
  const hist = new Map();
  const bands = BANDS.map((from) => ({ from, n: 0, bins: new Array(GAINS.length + 1).fill(0) }));
  return {
    add(data) {
      for (const e of data?.Entries || []) {
        const t = parseUtc(e.Utc);
        for (const [num, c] of Object.entries(e.Cars || {})) {
          const ch = c?.Channels;
          if (!ch || !Number.isFinite(t)) continue;
          const s = { t, v: ch['2'], full: ch['4'] >= 98 && ch['4'] <= 100 && !ch['5'] };
          let h = hist.get(num);
          if (!h) hist.set(num, (h = []));
          h.push(s);
          while (t - h[0].t > 1500) h.shift();
          const p = h[0];
          if (!s.full || !p.full || t - p.t < 900 || s.v < BANDS[0] || h.some((x) => !x.full)) continue;
          const gain = ((s.v - p.v) * 1000) / (t - p.t);
          const b = bands.findLast((x) => s.v >= x.from);
          b.n++;
          const k = GAINS.findIndex((g) => gain <= g);
          b.bins[k < 0 ? GAINS.length : k]++;
        }
      }
    },
    result: () => ({ gains: GAINS, bands }),
  };
}

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
  const chrono = [];
  const cal = energyCalibration();
  const out = await Promise.all(Object.entries(feeds).map(async ([name, f]) => {
    const fields = new Map();
    let lines = 0, error = null;
    try {
      if (f.KeyFramePath) {
        const kf = decode(await getJSON(`${path}${f.KeyFramePath}`));
        walk(fields, kf, name);
        if (name === 'DriverList') chrono.push({ off: -1, feed: name, data: kf });   // les autres : état de fin de séance
      }
    } catch { /* image de départ absente : le flux suffit */ }
    try {
      const text = f.StreamPath ? await get(`${path}${f.StreamPath}`, { timeout: 180000 }) : '';
      for (const line of text.split(/\r?\n/)) {
        const i = line.search(/[{"[]/);
        if (i < 0) continue;
        try {
          const data = decode(JSON.parse(line.slice(i)));
          walk(fields, data, name);
          if (CHRONO.has(name)) chrono.push({ off: offOf(line), feed: name, data });
          else if (name === 'CarData.z') cal.add(data);
          lines++;
        } catch { /* ligne illisible */ }
      }
    } catch (err) { error = err.message; }
    return { name, lines, error, fields: summary(fields) };
  }));
  return { path, ms: Date.now() - t0, feeds: out.sort((a, b) => (a.name < b.name ? -1 : 1)), overtake: overtakeChrono(chrono), energy: cal.result() };
}
