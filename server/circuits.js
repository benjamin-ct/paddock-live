// Tracés de circuits (API MultiViewer, lue par le serveur de Paddock Live) et calibration des boucles de chronométrage,
// avec cache disque dans .cache/.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { getJSON, HttpError } from './net.js';
import { DATA_DIR } from './config.js';
import { Track } from '../shared/track.js';
import { calibrateLoops, buildTrackFromArchive } from '../shared/calibrate.js';
import { estimateZones } from '../shared/zones.js';
import { loadArchive, seasonIndex } from './replay.js';
import { SEASON_URL } from './season.js';

export const CACHE_DIR = path.join(DATA_DIR, '.cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

function readCache(name) {
  try { return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, name), 'utf8')); } catch { return null; }
}

function writeCache(name, data) {
  fs.writeFileSync(path.join(CACHE_DIR, name), JSON.stringify(data));
}

const building = new Map();

export async function circuit(key, year) {
  const name = `circuit-${key}-${year}.json`;
  const cached = readCache(name);
  if (cached) return cached;
  if (building.has(name)) return building.get(name);
  const job = fetchCircuit(key, year, name).finally(() => building.delete(name));
  building.set(name, job);
  return job;
}

async function fetchCircuit(key, year, name) {
  // Tracé lu par le serveur de Paddock Live (API MultiViewer : l'année demandée ou une des précédentes)
  try {
    const data = await getJSON(`${SEASON_URL}/live/api/circuit?key=${key}&year=${year}`, { timeout: 30000 });
    if (Array.isArray(data?.x) && data.x.length) {
      writeCache(name, data);
      return data;
    }
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
  }
  // Circuit inconnu de MultiViewer (nouveau tracé) : reconstruction à partir du GPS d'une archive.
  for (const p of (await candidateSessions(key, year)).slice(0, 3)) {
    try {
      const arc = await loadArchive(p, undefined, ['Heartbeat', 'TimingData', 'Position.z']);
      const positions = arc.stream.filter((s) => s.topic === 'Position')
        .map((s) => ({ off: s.off, data: JSON.parse(zlib.inflateRawSync(Buffer.from(s.raw, 'base64')).toString('utf8')) }));
      const data = buildTrackFromArchive(arc.events, positions);
      if (data) {
        data.source = p;
        writeCache(name, data);
        console.log(`[circuit] tracé ${key} reconstruit à partir du GPS (${p})`);
        return data;
      }
    } catch (err) {
      console.warn(`[circuit] ${p} : ${err.message}`);
    }
  }
  return null;
}

// Sessions archivées sur ce circuit, de la plus récente à la plus ancienne.
async function candidateSessions(key, year) {
  const out = [];
  for (const y of [year, year - 1]) {
    let idx = [];
    try { idx = await seasonIndex(y); } catch { continue; }
    for (const m of idx.filter((mm) => mm.circuitKey === key).reverse()) {
      for (const s of [...m.sessions].reverse()) {
        // Les sessions de moins de 3 h n'ont pas encore d'archive complète.
        const start = Date.parse(`${s.start}Z`) - offsetMs(s.gmtOffset);
        if (Date.now() - start > 3 * 3600 * 1000) out.push(s.path);
      }
    }
  }
  return out;
}

function offsetMs(gmt) {
  const m = /^(-)?(\d+):(\d+)/.exec(gmt || '');
  if (!m) return 0;
  return (m[1] ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000;
}

const running = new Map();

export function loops(key, year) {
  const name = `loops-${key}-${year}.json`;
  const cached = readCache(name);
  if (cached) return Promise.resolve(cached);
  if (running.has(name)) return running.get(name);
  const job = (async () => {
    const data = await circuit(key, year);
    if (!data) return null;
    const track = new Track(data);
    for (const p of (await candidateSessions(key, year)).slice(0, 3)) {
      try {
        const arc = await loadArchive(p, undefined, ['Heartbeat', 'TimingData', 'Position.z']);
        const positions = arc.stream
          .filter((s) => s.topic === 'Position')
          .map((s) => ({ off: s.off, data: JSON.parse(zlib.inflateRawSync(Buffer.from(s.raw, 'base64')).toString('utf8')) }));
        if (!positions.length) continue;
        const res = calibrateLoops(track, arc.events, positions);
        if (res && Object.keys(res.segs).length > 5) {
          res.source = p;
          writeCache(name, res);
          console.log(`[calibration] circuit ${key} : ${Object.keys(res.segs).length} boucles (${p})`);
          return res;
        }
      } catch (err) {
        console.warn(`[calibration] ${p} : ${err.message}`);
      }
    }
    return null;
  })().finally(() => running.delete(name));
  running.set(name, job);
  return job;
}

// Zones ligne droite et ligne de détection estimées à partir de la télémétrie d'une séance
// archivée du circuit (calculées une fois par circuit et par saison).
const zoning = new Map();

const inflate = (s) => JSON.parse(zlib.inflateRawSync(Buffer.from(s.raw, 'base64')).toString('utf8'));

export function zones(key, year) {
  const name = `zones-${key}-${year}.json`;
  const cached = readCache(name);
  // Format 3 : voie des stands et définitions officielles de la FIA (refait une fois). Sans
  // définitions officielles (plan du circuit pas encore publié), nouvel essai toutes les 6 h
  // pour la saison en cours.
  const fresh = cached?.v === 3 && (cached.official || year < new Date().getFullYear() || Date.now() - (cached.checkedAt || 0) < 6 * 3600e3);
  if (fresh) return Promise.resolve(cached);
  if (zoning.has(name)) return zoning.get(name);
  const job = (async () => {
    const data = await circuit(key, year);
    if (!data) return null;
    const track = new Track(data);
    // Points de détection / d'activation et zones « ligne droite » officiels (plan FIA du circuit)
    let official = null;
    try {
      const { officialCircuitData } = await import('./fia-circuit.js');
      official = await officialCircuitData(year, { name: data.meetingName, location: data.location, country: data.countryName });
    } catch (err) {
      console.warn(`[zones] plan FIA du circuit ${key} : ${err.message}`);
    }
    // Rien de nouveau depuis la dernière estimation : on la garde
    if (cached?.v === 3 && !official) { const out = { ...cached, checkedAt: Date.now() }; writeCache(name, out); return out; }
    for (const p of (await candidateSessions(key, year)).slice(0, 3)) {
      try {
        const arc = await loadArchive(p, undefined, ['Heartbeat', 'Position.z', 'CarData.z']);
        const positions = arc.stream.filter((s) => s.topic === 'Position').map((s) => ({ data: inflate(s) }));
        const carData = arc.stream.filter((s) => s.topic === 'CarData').map((s) => ({ data: inflate(s) }));
        const res = estimateZones(track, carData, positions, official);
        if (res && (res.zones.length || res.pitLane || res.detection)) {
          res.session = p;
          res.checkedAt = Date.now();
          writeCache(name, res);
          console.log(`[zones] circuit ${key} : ${res.zones.length} zones ligne droite, détection ${res.detection ? 'trouvée' : 'inconnue'}, voie des stands ${res.pitLane ? `${res.pitLane.length} m` : 'inconnue'}${res.official ? ' — définitions officielles FIA' : ' — estimations'} (${p})`);
          return res;
        }
      } catch (err) {
        console.warn(`[zones] ${p} : ${err.message}`);
      }
    }
    return cached || null;   // ancienne estimation (sans voie des stands) plutôt que rien
  })().finally(() => zoning.delete(name));
  zoning.set(name, job);
  return job;
}
