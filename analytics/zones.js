// Zones du mode dépassement (lignes droites, détection, voie des stands), boucles de chronométrage (mini-secteurs) et
// profil d'altitude (carte 3D) d'un circuit, pour la carte de l'appli et de la version web (/live/api/zones,
// /live/api/loops : même forme que /api/zones et /api/loops des anciennes applis ; /live/api/elevation). Calculées par la tâche planifiée, un circuit à la fois, à partir du
// GPS et de la télémétrie d'une séance archivée (connexion F1 TV du créateur, voir archiveToken) et des définitions
// officielles du plan FIA du circuit ; gardées dans la base. Même calcul que l'appli auparavant (shared/zones.js,
// shared/calibrate.js). Les fichiers de la séance (plusieurs dizaines de Mo) sont lus au fil de l'eau et réduits à
// ce qui sert, pour tenir dans la mémoire du serveur.
import { setRow, readJSON, rowsWithPrefix } from './alerts.js';
import { archiveToken, seasonRow } from './studio.js';
import { archiveText, circuitData, gpsTrackKey } from './race-stats.js';
import { seasonIndex } from './tyres.js';
import { fiaDocsWeb } from './fia-tech.js';
import { parseStream } from '../shared/race-stats.js';
import { pdfPages } from '../shared/fia-tech.js';
import { parseCircuitData } from '../shared/fia-circuit.js';
import { pdfDrawing, drawingMarks } from '../shared/fia-drawing.js';
import { Track } from '../shared/track.js';
import { estimateZones } from '../shared/zones.js';
import { calibrateLoops, buildTrackFromArchive } from '../shared/calibrate.js';
import { elevationProfile, VERSION as ELEVATION_VERSION } from '../shared/elevation.js';
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

// Séance : horloge et chronométrage (boucles), GPS réduit aux X/Y/Z, télémétrie réduite à la vitesse et à
// l'accélérateur ; seulement ce qui sert au calcul demandé (need : timing, carData)
async function sessionData(path, token, fetchFn, need = { timing: true, carData: true }) {
  const events = [];
  for (const t of need.timing ? ['Heartbeat', 'TimingData'] : []) events.push(...parseStream(await archiveText(`${path}${t}.jsonStream`, token, fetchFn), t));
  events.sort((a, b) => a.off - b.off);
  const positions = [];
  let p = 0;
  await eachLine(`${path}Position.z.jsonStream`, token, fetchFn, async (raw) => {
    const Position = ((await inflate(raw)).Position || []).map((s) => {
      const Entries = {};
      for (const [num, e] of Object.entries(s.Entries || {})) if (e && (e.X || e.Y)) { Entries[num] = { X: e.X, Y: e.Y, Z: e.Z }; p++; }
      return { Timestamp: s.Timestamp, Entries };
    });
    positions.push({ data: { Position } });
    return p < MAX_POSITIONS;
  });
  const carData = [];
  let n = 0;
  if (need.carData) await eachLine(`${path}CarData.z.jsonStream`, token, fetchFn, async (raw) => {
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

// Définitions officielles du Grand Prix (plan du circuit de la FIA), ou null s'il n'est pas encore publié. marks : marques
// du dessin du plan recalées sur le tracé (fin des zones, détection, activation), false si le dessin est inutilisable
async function officialData(year, raw, fetchFn, track) {
  const { docs } = await fiaDocsWeb(year, { name: raw.meetingName, location: raw.location, country: raw.countryName }, { fetchFn });
  const doc = docs.filter((d) => /circuit map/i.test(d.title)).sort((a, b) => (b.published || 0) - (a.published || 0))[0];
  if (!doc) return null;
  const r = await fetchFn(doc.url, { headers: { 'User-Agent': UA } });
  if (r.status !== 200) throw new Error(`plan du circuit FIA : HTTP ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  const data = parseCircuitData(await pdfPages(buf));
  if (!data) return null;
  const drawing = await pdfDrawing(buf).catch(() => null);
  const marks = (drawing && track && drawingMarks(drawing, track)) || false;
  return { ...data, marks, source: doc.url, title: doc.title };
}

// Séances archivées sur ce circuit (cette année et la précédente) : qualifications d'abord (une heure, voitures à fond),
// puis essais, puis courses, les plus récentes d'abord ; les séances de moins de 3 h n'ont pas encore d'archive complète.
// [{ path, meeting }] (meeting : Grand Prix de l'index des archives)
async function candidateSessions(key, year, token, fetchFn, now) {
  const out = [];
  for (const y of [year, year - 1]) {
    const idx = await seasonIndex(y, token, fetchFn).catch(() => []);
    for (const m of idx.filter((x) => x.circuitKey === key).reverse()) {
      for (const s of [...m.sessions].reverse()) {
        const [, sign, h, mn] = /^(-)?(\d+):(\d+)/.exec(s.gmtOffset || '') || [];
        const start = Date.parse(`${s.start}Z`) - (sign ? -1 : 1) * ((Number(h) || 0) * 60 + (Number(mn) || 0)) * 60000;
        if (now - start > 3 * 3600e3) out.push({ ...s, meeting: m });
      }
    }
  }
  const rank = (s) => (s.type === 'Qualifying' && !/sprint/i.test(s.name) ? 0 : s.type === 'Practice' ? 1 : s.type === 'Race' ? 3 : 2);
  return out.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map(({ s }) => ({ path: s.path, meeting: s.meeting }));
}

// Positions GPS de la séance -> [{ car, x, y, z }] (profil d'altitude)
function* gpsSamples(positions) {
  for (const m of positions) {
    for (const s of m.data.Position) for (const [car, e] of Object.entries(s.Entries)) yield { car, x: e.X, y: e.Y, z: e.Z };
  }
}

// Calcul complet d'un circuit : { at, zones, loops, elevation } (null si introuvables) ; keep : résultats déjà bons,
// gardés tels quels (seul ce qui manque est calculé)
export async function computeZones(env, key, year, { now = Date.now(), fetchFn = fetch, token, keep = {} } = {}) {
  let zones = keep.zones || null, loops = keep.loops || null, elevation = keep.elevation || null;
  let raw = await circuitData(key, year, fetchFn, env);
  let track = raw && new Track(raw);
  let official = zones || !track ? null : await officialData(year, raw, fetchFn, track).catch(() => null);
  token ??= await archiveToken(env, { now, fetchFn });
  let error = token ? 'aucune séance archivée utilisable' : 'connexion F1 TV absente ou expirée';
  if (!track && !token) return { at: now, zones, loops, elevation, error: `tracé introuvable (${error})` };
  for (const { path: p, meeting } of token ? (await candidateSessions(key, year, token, fetchFn, now)).slice(0, 3) : []) {
    if (track && zones && loops && elevation) break;
    try {
      const { events, positions, carData } = await sessionData(p, token, fetchFn, { timing: !loops || !track, carData: !zones });
      if (!track) {
        // Circuit que MultiViewer n'a pas (Madrid, Sepang) : tracé du meilleur tour de la séance d'après le GPS, numéros
        // des virages pris sur le dessin du plan FIA ; gardé dans la base (circuitData le sert ensuite à tous)
        const gps = buildTrackFromArchive(events, positions);
        if (!gps) continue;
        raw = { ...gps, meetingName: meeting.name, location: meeting.location, countryName: meeting.country, source: p };
        official = await officialData(year, raw, fetchFn, new Track(raw)).catch(() => null);
        raw.corners = (official?.marks?.corners || []).map((c) => ({ number: c.number, angle: c.angle, trackPosition: { x: raw.x[c.idx], y: raw.y[c.idx] } }));
        track = new Track(raw);
        await setRow(env, gpsTrackKey(key, year), JSON.stringify(raw));
      }
      if (!loops) {
        const l = calibrateLoops(track, events, positions);
        if (l && Object.keys(l.segs).length > 5) loops = { ...l, source: p };
      }
      if (!zones) {
        const z = estimateZones(track, carData, positions, official);
        if (z && (z.zones.length || z.pitLane || z.detection)) zones = { ...z, session: p, checkedAt: now };
      }
      if (!elevation) {
        const e = elevationProfile(track, gpsSamples(positions));
        if (e) elevation = { ...e, session: p };
      }
    } catch (err) { error = `${p} : ${err.message}`; }
  }
  if (!track) return { at: now, zones, loops, elevation, error: `tracé introuvable (${error})` };
  return { at: now, zones, loops, elevation, ...(zones && loops && elevation ? {} : { error }) };
}

// Zones à revoir : estimées sans définitions officielles, ou officielles sans lecture du dessin du plan (drawing absent),
// pour la saison en cours
const zonesStale = (row, year, now) => !row.zones || ((!row.zones.official || row.zones.drawing === undefined) && year >= new Date(now).getUTCFullYear());
// Profil d'altitude à refaire : absent, ou calculé par une version plus ancienne (creux faux de Spa)
const elevationStale = (row) => row.elevation?.v !== ELEVATION_VERSION;
// Résultat gardé à revoir : échec (une partie manque), zones à revoir ou altitude d'une ancienne version ; revu tout
// de suite s'il n'a pas encore été essayé avec cette version (tried), sinon 6 heures plus tard
const stale = (row, year, now) => (now - row.at > RETRY || row.tried !== ELEVATION_VERSION) &&
  (!row.loops || elevationStale(row) || zonesStale(row, year, now));

// /live/api/zones, /live/api/loops et /live/api/elevation : résultat gardé (l'ancien en attendant un nouveau calcul), sinon calcul demandé
// à la tâche planifiée
export async function zonesWeb(env, kind, key, year, now = Date.now()) {
  const row = await readJSON(env, rowKey(key, year), null);
  if ((!row || stale(row, year, now)) && now - Number(await readJSON(env, `zoneswant:${key}:${year}`, 0)) > LOCK) {
    await setRow(env, `zoneswant:${key}:${year}`, String(now));
  }
  return row?.[kind] || null;
}

// Circuits à calculer ([clé, année]) : asked, ceux demandés dans l'heure (lignes <prefix>clé:année) ; next, celui du
// prochain Grand Prix de la semaine (ou null). Aussi pour les alentours (analytics/surroundings.js)
export async function wantedCircuits(env, prefix, now) {
  const results = await rowsWithPrefix(env, prefix);
  const asked = (results || []).filter((r) => now - Number(r.v) < 3600e3).map((r) => r.k.split(':').slice(1).map(Number));
  const year = new Date(now).getUTCFullYear();
  const gp = (await seasonRow(env, year, { now, maxAge: 7 * 86400e3 }).catch(() => null))?.v.races
    .find((r) => Date.parse(r.date) > now && Date.parse(r.date) - now < 7 * 86400e3);
  return { asked, next: CIRCUITS[gp?.circuitId] ? [CIRCUITS[gp.circuitId].key, year] : null };
}

// Tâche planifiée : un circuit demandé (dans l'heure), sinon celui du prochain Grand Prix de la semaine, s'il n'a pas
// de résultat ou s'il est à revoir
export async function zonesTick(env, { now = Date.now(), fetchFn = fetch } = {}) {
  if (!env.DB || !env.STATS_KEY || now - Number(await readJSON(env, 'zoneslock', 0)) < LOCK) return null;
  const { asked, next } = await wantedCircuits(env, 'zoneswant:', now);
  let job = null, old = null;
  for (const [key, y] of next ? [next, ...asked] : asked) {   // le Grand Prix qui vient d'abord
    old = await readJSON(env, rowKey(key, y), null);
    if (!old || stale(old, y, now)) { job = [key, y]; break; }
  }
  if (!job) return null;
  const [key, y] = job;
  await setRow(env, 'zoneslock', String(now));
  // Noté avant le calcul : s'il est interrompu (limite de temps du serveur), il n'est retenté que 6 heures plus tard
  await setRow(env, rowKey(key, y), JSON.stringify({ zones: null, loops: null, ...old, at: now, tried: ELEVATION_VERSION, error: 'calcul interrompu' }));
  try {
    // Ce qui est déjà bon est gardé tel quel (une altitude qui manque ne refait pas les zones)
    const keep = old ? { zones: zonesStale(old, y, now) ? null : old.zones, loops: old.loops, elevation: elevationStale(old) ? null : old.elevation } : {};
    const res = await computeZones(env, key, y, { now, fetchFn, keep });
    // Rien de mieux trouvé : l'ancien résultat reste, revu plus tard
    await setRow(env, rowKey(key, y), JSON.stringify({ ...res, tried: ELEVATION_VERSION, zones: res.zones || old?.zones || null, loops: res.loops || old?.loops || null,
      elevation: res.elevation || old?.elevation || null }));
    return { key, year: y, zones: !!res.zones, loops: !!res.loops, elevation: !!res.elevation, error: res.error };
  } finally {
    await setRow(env, `zoneswant:${key}:${y}`, '0');
    await setRow(env, 'zoneslock', '0');
  }
}
