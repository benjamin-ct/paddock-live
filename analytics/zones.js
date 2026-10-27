// Zones du mode dépassement (lignes droites, détection, voie des stands) et boucles de chronométrage (mini-secteurs)
// d'un circuit, pour la carte de l'appli et de la version web (/live/api/zones, /live/api/loops : même forme que
// /api/zones et /api/loops des anciennes applis). Calculées par la tâche planifiée, un circuit à la fois, à partir du
// GPS et de la télémétrie d'une séance archivée (connexion F1 TV du créateur, voir archiveToken) et des définitions
// officielles du plan FIA du circuit ; gardées dans la base. Même calcul que l'appli auparavant (shared/zones.js,
// shared/calibrate.js). Les fichiers de la séance (plusieurs dizaines de Mo) sont lus au fil de l'eau et réduits à
// ce qui sert, pour tenir dans la mémoire du serveur.
import { setRow, readJSON, rowsWithPrefix } from './alerts.js';
import { archiveToken, seasonRow } from './studio.js';
import { archiveText, circuitData } from './race-stats.js';
import { seasonIndex } from './tyres.js';
import { fiaDocsWeb } from './fia-tech.js';
import { parseStream } from '../shared/race-stats.js';
import { pdfPages } from '../shared/fia-tech.js';
import { parseCircuitData } from '../shared/fia-circuit.js';
import { Track } from '../shared/track.js';
import { estimateZones } from '../shared/zones.js';
import { calibrateLoops } from '../shared/calibrate.js';
import { CIRCUITS } from '../shared/circuits-info.js';

const ARCHIVE = 'https://livetiming.formula1.com/static/';
const UA = 'Mozilla/5.0 (Paddock-Live web relay)';
const RETRY = 6 * 3600e3;      // échec, ou zones sans définitions officielles de la saison en cours : revu 6 h plus tard
const LOCK = 10 * 60e3;        // un seul calcul à la fois
const MAX_CARDATA = 400000;    // échantillons de télémétrie lus (estimateZones n'en prend pas plus)
const MAX_POSITIONS = 400000;  // positions GPS gardées (mémoire du serveur : une course entière ne tiendrait pas)

const rowKey = (key, year) => `zones:${key}:${year}`;

// Lignes d'un fichier .jsonStream des archives, lues au fil de l'eau : onLine(texte) ; false arrête la lecture
async function eachLine(rel, token, fetchFn, onLine) {
  const r = await fetchFn(ARCHIVE + rel, { headers: { 'User-Agent': UA, Authorization: `Bearer ${token}`, ascendontoken: token } });
  if (r.status !== 200) throw new Error(`${rel} : HTTP ${r.status}`);
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let rest = '';
  for (;;) {
    const { done, value } = await reader.read();
    const lines = (rest + (value || '')).split(/\r?\n/);
    rest = done ? '' : lines.pop();
    for (const line of lines) {
      const m = /^\uFEFF?\d+:\d\d:\d\d\.\d+(".*")\s*$/.exec(line);
      if (m && (await onLine(JSON.parse(m[1]))) === false) { await reader.cancel(); return; }
    }
    if (done) return;
  }
}

// Message compressé des archives (Position.z, CarData.z : base64 de deflate brut) -> objet
async function inflate(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
}

// Séance : horloge et chronométrage (boucles), GPS réduit aux X/Y, télémétrie réduite à la vitesse et à l'accélérateur
async function sessionData(path, token, fetchFn) {
  const events = [];
  for (const t of ['Heartbeat', 'TimingData']) events.push(...parseStream(await archiveText(`${path}${t}.jsonStream`, token, fetchFn), t));
  events.sort((a, b) => a.off - b.off);
  const positions = [];
  let p = 0;
  await eachLine(`${path}Position.z.jsonStream`, token, fetchFn, async (raw) => {
    const Position = ((await inflate(raw)).Position || []).map((s) => {
      const Entries = {};
      for (const [num, e] of Object.entries(s.Entries || {})) if (e && (e.X || e.Y)) { Entries[num] = { X: e.X, Y: e.Y }; p++; }
      return { Timestamp: s.Timestamp, Entries };
    });
    positions.push({ data: { Position } });
    return p < MAX_POSITIONS;
  });
  const carData = [];
  let n = 0;
  await eachLine(`${path}CarData.z.jsonStream`, token, fetchFn, async (raw) => {
    const Entries = ((await inflate(raw)).Entries || []).map((en) => {
      const Cars = {};
      for (const [num, c] of Object.entries(en.Cars || {})) {
        if (!c?.Channels) continue;
        Cars[num] = { Channels: { 2: c.Channels[2], 4: c.Channels[4] } };
        n++;
      }
      return { Utc: en.Utc, Cars };
    });
    carData.push({ data: { Entries } });
    return n < MAX_CARDATA;
  });
  return { events, positions, carData };
}

// Définitions officielles du Grand Prix (plan du circuit de la FIA), ou null s'il n'est pas encore publié
async function officialData(year, raw, fetchFn) {
  const { docs } = await fiaDocsWeb(year, { name: raw.meetingName, location: raw.location, country: raw.countryName }, { fetchFn });
  const doc = docs.filter((d) => /circuit map/i.test(d.title)).sort((a, b) => (b.published || 0) - (a.published || 0))[0];
  if (!doc) return null;
  const r = await fetchFn(doc.url, { headers: { 'User-Agent': UA } });
  if (r.status !== 200) throw new Error(`plan du circuit FIA : HTTP ${r.status}`);
  const data = parseCircuitData(await pdfPages(new Uint8Array(await r.arrayBuffer())));
  return data && { ...data, source: doc.url, title: doc.title };
}

// Séances archivées sur ce circuit (cette année et la précédente) : qualifications d'abord (une heure, voitures à fond),
// puis essais, puis courses, les plus récentes d'abord ; les séances de moins de 3 h n'ont pas encore d'archive complète
async function candidateSessions(key, year, token, fetchFn, now) {
  const out = [];
  for (const y of [year, year - 1]) {
    const idx = await seasonIndex(y, token, fetchFn).catch(() => []);
    for (const m of idx.filter((x) => x.circuitKey === key).reverse()) {
      for (const s of [...m.sessions].reverse()) {
        const [, sign, h, mn] = /^(-)?(\d+):(\d+)/.exec(s.gmtOffset || '') || [];
        const start = Date.parse(`${s.start}Z`) - (sign ? -1 : 1) * ((Number(h) || 0) * 60 + (Number(mn) || 0)) * 60000;
        if (now - start > 3 * 3600e3) out.push(s);
      }
    }
  }
  const rank = (s) => (s.type === 'Qualifying' && !/sprint/i.test(s.name) ? 0 : s.type === 'Practice' ? 1 : s.type === 'Race' ? 3 : 2);
  return out.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map(({ s }) => s.path);
}

// Calcul complet d'un circuit : { at, zones, loops } (zones / loops null si introuvables)
export async function computeZones(env, key, year, { now = Date.now(), fetchFn = fetch, token } = {}) {
  const raw = await circuitData(key, year, fetchFn);
  if (!raw) return { at: now, zones: null, loops: null, error: 'tracé introuvable' };
  const track = new Track(raw);
  const official = await officialData(year, raw, fetchFn).catch(() => null);
  token ??= await archiveToken(env, { now, fetchFn });
  let zones = null, loops = null, error = token ? 'aucune séance archivée utilisable' : 'connexion F1 TV absente ou expirée';
  for (const p of token ? (await candidateSessions(key, year, token, fetchFn, now)).slice(0, 3) : []) {
    try {
      const { events, positions, carData } = await sessionData(p, token, fetchFn);
      if (!loops) {
        const l = calibrateLoops(track, events, positions);
        if (l && Object.keys(l.segs).length > 5) loops = { ...l, source: p };
      }
      if (!zones) {
        const z = estimateZones(track, carData, positions, official);
        if (z && (z.zones.length || z.pitLane || z.detection)) zones = { ...z, session: p, checkedAt: now };
      }
      if (zones && loops) break;
    } catch (err) { error = `${p} : ${err.message}`; }
  }
  return { at: now, zones, loops, ...(zones && loops ? {} : { error }) };
}

// Résultat gardé à revoir : échec, ou zones estimées sans définitions officielles pour la saison en cours
const stale = (row, year, now) => now - row.at > RETRY
  && (!row.zones || !row.loops || (!row.zones.official && year >= new Date(now).getUTCFullYear()));

// /live/api/zones et /live/api/loops : résultat gardé (l'ancien en attendant un nouveau calcul), sinon calcul demandé
// à la tâche planifiée
export async function zonesWeb(env, kind, key, year, now = Date.now()) {
  const row = await readJSON(env, rowKey(key, year), null);
  if ((!row || stale(row, year, now)) && now - Number(await readJSON(env, `zoneswant:${key}:${year}`, 0)) > LOCK) {
    await setRow(env, `zoneswant:${key}:${year}`, String(now));
  }
  return row?.[kind] || null;
}

// Tâche planifiée : un circuit demandé (dans l'heure), sinon celui du prochain Grand Prix de la semaine, s'il n'a pas
// de résultat ou s'il est à revoir
export async function zonesTick(env, { now = Date.now(), fetchFn = fetch } = {}) {
  if (!env.DB || !env.STATS_KEY || now - Number(await readJSON(env, 'zoneslock', 0)) < LOCK) return null;
  const results = await rowsWithPrefix(env, 'zoneswant:');
  const jobs = (results || []).filter((r) => now - Number(r.v) < 3600e3).map((r) => r.k.split(':').slice(1).map(Number));
  const year = new Date(now).getUTCFullYear();
  const next = (await seasonRow(env, year, { now, maxAge: 7 * 86400e3 }).catch(() => null))?.v.races
    .find((r) => Date.parse(r.date) > now && Date.parse(r.date) - now < 7 * 86400e3);
  if (CIRCUITS[next?.circuitId]) jobs.unshift([CIRCUITS[next.circuitId].key, year]);   // le Grand Prix qui vient d'abord
  let job = null, old = null;
  for (const [key, y] of jobs) {
    old = await readJSON(env, rowKey(key, y), null);
    if (!old || stale(old, y, now)) { job = [key, y]; break; }
  }
  if (!job) return null;
  const [key, y] = job;
  await setRow(env, 'zoneslock', String(now));
  // Noté avant le calcul : s'il est interrompu (limite de temps du serveur), il n'est retenté que 6 heures plus tard
  await setRow(env, rowKey(key, y), JSON.stringify({ zones: null, loops: null, ...old, at: now, error: 'calcul interrompu' }));
  try {
    const res = await computeZones(env, key, y, { now, fetchFn });
    // Rien de mieux trouvé : l'ancien résultat reste, revu plus tard
    await setRow(env, rowKey(key, y), JSON.stringify({ ...res, zones: res.zones || old?.zones || null, loops: res.loops || old?.loops || null }));
    return { key, year: y, zones: !!res.zones, loops: !!res.loops, error: res.error };
  } finally {
    await setRow(env, `zoneswant:${key}:${y}`, '0');
    await setRow(env, 'zoneslock', '0');
  }
}
