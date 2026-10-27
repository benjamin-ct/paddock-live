// Données de la saison (calendrier, classements, résultats, qualifications, sprints) : lues sur le serveur de
// Paddock Live (mêmes données que la version web, tirées par lui de l'API Jolpica), en un seul objet compact pour
// l'espace « Saison », l'accueil et les rappels. Saison en cours : relue toutes les 15 min ; saisons terminées :
// gardées sur disque une fois pour toutes ; copie disque aussi utilisée hors ligne. Records des circuits
// (server/records.js) : API Jolpica directement.
import fs from 'node:fs';
import path from 'node:path';
import { getJSON, withRetry } from './net.js';
import { CACHE_DIR } from './circuits.js';
import { summarize } from '../shared/season-data.js';
export { summarize };

// Serveur de Paddock Live (version web) : saison, statistiques détaillées et documents FIA
export const SEASON_URL = process.env.PADDOCK_SEASON_URL ?? 'https://app.paddocklive.app';
const BASE = 'https://api.jolpi.ca/ergast/f1';
const TTL = 15 * 60 * 1000;
const mem = new Map();
const pending = new Map();

// L'API Jolpica limite le nombre de requêtes (4 par seconde) : elles sont espacées, et
// relancées en cas de refus temporaire (422, 429…), d'erreur serveur ou de délai dépassé.
const GAP_MS = 300;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let queue = Promise.resolve();
let lastAt = 0;
function throttled(fn) {
  const turn = queue.then(async () => {
    const wait = lastAt + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
  });
  queue = turn.catch(() => {});
  return turn.then(fn);
}

function jget(url) {
  return withRetry(() => throttled(() => getJSON(url, { timeout: 30000 })));
}

// Toutes les pages d'une ressource (limite 100 par page)
async function all(pathname, pick) {
  const out = [];
  for (let offset = 0, total = 1; offset < total; offset += 100) {
    const d = await jget(`${BASE}/${pathname}.json?limit=100&offset=${offset}`);
    total = Number(d?.MRData?.total) || 0;
    out.push(...pick(d?.MRData));
    if (!total) break;
  }
  return out;
}

// Courses (résultats) ou qualifications d'un Grand Prix : chemin de l'API (ex. 2024/circuits/monza/results)
export const jolpicaRaces = (pathname) => all(pathname, (m) => m?.RaceTable?.Races || []);

// Format des données enregistrées : une copie plus ancienne est rechargée une fois
const FORMAT = 3;

async function fetchSeason(year) {
  const d = await getJSON(`${SEASON_URL}/live/api/season?year=${year}`, { timeout: 30000 });
  return { ...d, year, v: FORMAT, updated: Date.now() };
}

// Saison terminée (année passée, toutes les courses ont un résultat) : elle ne change plus,
// la copie sur disque sert indéfiniment (l'API publique limite à 500 requêtes par heure).
const finished = (d) => d && d.v === FORMAT && d.year < new Date().getFullYear() && d.races?.length && d.races.every((r) => r.results?.length);

function readDisk(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export async function season(year) {
  const hit = mem.get(year);
  if (hit && (finished(hit) || Date.now() - hit.updated < TTL)) return hit;
  const file = path.join(CACHE_DIR, `season-${year}.json`);
  if (!hit) {
    const disk = readDisk(file);
    if (finished(disk) || (disk?.v === FORMAT && Date.now() - disk.updated < TTL)) { mem.set(year, disk); return disk; }
  }
  if (pending.has(year)) return pending.get(year);
  const job = fetchSeason(year).then((data) => {
    mem.set(year, data);
    try { fs.writeFileSync(file, JSON.stringify(data)); } catch { /* cache facultatif */ }
    return data;
  }).catch((err) => {
    // API indisponible : dernière copie connue
    const disk = readDisk(file);
    if (disk) return { ...disk, stale: true };
    throw new Error(apiError(err));
  }).finally(() => pending.delete(year));
  pending.set(year, job);
  return job;
}

// Message lisible quand le serveur de Paddock Live ne répond pas
function apiError(err) {
  return `serveur de Paddock Live injoignable : ${err?.message || err}`;
}
