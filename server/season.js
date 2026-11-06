// Données de la saison (calendrier, classements, résultats, qualifications, sprints) : lues sur le serveur de
// Paddock Live (mêmes données que la version web, tirées par lui de l'API Jolpica), en un seul objet compact pour
// l'espace « Saison », l'accueil et les rappels. Saison en cours : relue toutes les 15 min ; saisons terminées :
// gardées sur disque une fois pour toutes ; copie disque aussi utilisée hors ligne.
import fs from 'node:fs';
import path from 'node:path';
import { getJSON } from './net.js';
import { CACHE_DIR } from './circuits.js';
import { summarize } from '../shared/season-data.js';
import { openf1TestDays, indexTestDays, mergeTestDays } from '../shared/testing.js';
import { archiveJSON } from './archive.js';
export { summarize };

// Serveur de Paddock Live (version web) : saison et autres données publiques (server/index.js, fromServer)
export const SEASON_URL = process.env.PADDOCK_SEASON_URL ?? 'https://app.paddocklive.app';
const TTL = 15 * 60 * 1000;
const mem = new Map();
const pending = new Map();

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

// Essais d'hiver d'une saison (Accueil hors saison) : jours du calendrier d'OpenF1, heures officielles de l'index des
// archives de la F1 dès qu'il les a (shared/testing.js) ; relus toutes les heures, rien si les deux sont injoignables
const OPENF1 = 'https://api.openf1.org/v1';
const tests = new Map();
export function testDays(year) {
  const hit = tests.get(year);
  if (hit && Date.now() - hit.at < 3600e3) return hit.job;
  const job = Promise.all([
    getJSON(`${OPENF1}/sessions?year=${year}`, { timeout: 15000 }).then(openf1TestDays).catch(() => []),
    archiveJSON(`${year}/Index.json`, { timeout: 15000 }).then(indexTestDays).catch(() => []),
  ]).then(([a, b]) => mergeTestDays(a, b));
  tests.set(year, { at: Date.now(), job });
  return job;
}
