// Tracés de circuits (API MultiViewer, lue par le serveur de Paddock Live) et boucles de chronométrage (calculées par
// lui), avec cache disque dans .cache/.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { getJSON, HttpError } from './net.js';
import { DATA_DIR } from './config.js';
import { buildTrackFromArchive } from '../shared/calibrate.js';
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

// Boucles de chronométrage (mini-secteurs de la comparaison des tours), calculées par le serveur de Paddock Live
// d'après une séance archivée ; gardées sur disque une fois reçues (null tant que le serveur ne les a pas)
export async function loops(key, year) {
  const name = `loops2-${key}-${year}.json`;   // « loops- » : calculées sur l'ordinateur par la 1.28, plus relues
  const cached = readCache(name);
  if (cached) return cached;
  try {
    const data = await getJSON(`${SEASON_URL}/live/api/loops?key=${key}&year=${year}`, { timeout: 30000 });
    writeCache(name, data);
    return data;
  } catch (err) {
    if (err instanceof HttpError) return null;
    throw err;
  }
}
