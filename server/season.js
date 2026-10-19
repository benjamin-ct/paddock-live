// Données de la saison (calendrier, classements, résultats, qualifications, sprints) depuis
// l'API publique Jolpica (successeur d'Ergast), regroupées en un seul objet compact pour
// l'espace « Saison ». Saison en cours : rafraîchie toutes les 15 min ; saisons terminées :
// gardées sur disque une fois pour toutes ; copie disque aussi utilisée hors ligne.
import fs from 'node:fs';
import path from 'node:path';
import { getJSON, withRetry } from './net.js';
import { CACHE_DIR } from './circuits.js';
import { parseRaceLaps } from '../shared/race-laps.js';
import { summarize } from '../shared/season-data.js';
export { summarize };

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
  const [schedule, ds, cs, results, quali, sprint] = await Promise.all([
    all(`${year}`, (m) => m?.RaceTable?.Races || []),
    jget(`${BASE}/${year}/driverstandings.json?limit=100`),
    jget(`${BASE}/${year}/constructorstandings.json?limit=100`),
    all(`${year}/results`, (m) => m?.RaceTable?.Races || []),
    all(`${year}/qualifying`, (m) => m?.RaceTable?.Races || []),
    all(`${year}/sprint`, (m) => m?.RaceTable?.Races || []),
  ]);
  return {
    year,
    v: FORMAT,
    updated: Date.now(),
    ...summarize({
      schedule,
      driverStandings: ds?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings,
      constructorStandings: cs?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings,
      results, quali, sprint,
    }),
  };
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

// Message lisible pour une erreur de l'API des résultats
function apiError(err) {
  const st = err?.status;
  if (st === 429 || st === 422) return `le serveur des résultats (Jolpica) refuse temporairement les demandes (erreur ${st} : trop de demandes en peu de temps) ; réessayez dans quelques minutes`;
  if (st >= 500) return `le serveur des résultats (Jolpica) rencontre un problème (erreur ${st}) ; réessayez plus tard`;
  return `serveur des résultats (Jolpica) injoignable : ${err?.message || err}`;
}

// Course tour par tour d'une manche (positions et temps), gardée sur disque une fois complète
const lapsMem = new Map();
export async function raceLaps(year, round) {
  const key = `${year}-${round}`;
  if (lapsMem.has(key)) return lapsMem.get(key);
  const file = path.join(CACHE_DIR, `laps2-${key}.json`);
  const disk = readDisk(file);
  if (disk?.total) { lapsMem.set(key, disk); return disk; }
  const [pages, results, pits] = await Promise.all([
    all(`${year}/${round}/laps`, (m) => m?.RaceTable?.Races || []),
    all(`${year}/${round}/results`, (m) => m?.RaceTable?.Races || []),
    all(`${year}/${round}/pitstops`, (m) => m?.RaceTable?.Races || []).catch(() => []),
  ]).catch((err) => { throw new Error(apiError(err)); });
  const data = parseRaceLaps(pages, results.flatMap((r) => r.Results || []), pits);
  if (data.total) {
    lapsMem.set(key, data);
    try { fs.writeFileSync(file, JSON.stringify(data)); } catch { /* cache facultatif */ }
  }
  return data;
}
