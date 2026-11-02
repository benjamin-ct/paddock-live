// Records des circuits (bandeau de l'Analyse, /live/api/records) : pole et meilleur tour en course des éditions
// précédentes (depuis 2018), pour situer les temps de la séance. D'après les résultats officiels publics (Jolpica) ;
// archives de la F1 (connexion F1 TV du créateur) pour un circuit inconnu de la liste. Une édition passée ne change
// plus : gardée dans la base.
import { getRow, readJSON, setRow } from './alerts.js';
import { archiveToken } from './studio.js';
import { archiveText } from './race-stats.js';
import { pages } from './season-cache.js';
import { CIRCUITS } from '../shared/circuits-info.js';
import { editionOf, editionFromResults, recordsOf, recordYears } from '../shared/circuit-records.js';

async function edition(env, year, circuitKey, fetchFn, wait) {
  const k = `records:${circuitKey}:${year}`;
  const kept = await readJSON(env, k, null);
  if (kept) return kept.none ? null : kept;
  const id = Object.keys(CIRCUITS).find((c) => CIRCUITS[c].key === circuitKey);
  let out;
  try {
    if (id) {
      const races = async (what) => (await pages(`${year}/circuits/${id}/${what}`, fetchFn, wait)).flatMap((m) => m?.RaceTable?.Races || []);
      out = editionFromResults(year, await races('results'), await races('qualifying'));
    } else {
      const token = await archiveToken(env, { fetchFn });
      if (!token) return null;
      out = await editionOf(year, circuitKey, async (p) => JSON.parse(await archiveText(p, token, fetchFn)));
    }
  } catch { return null; }
  if (out?.pending) return null;   // archive pas encore disponible : on réessaiera
  await setRow(env, k, JSON.stringify(out || { none: true }));
  return out;
}

// Éditions précédentes (au plus 4) du Grand Prix disputé sur ce circuit, lues l'une après l'autre (Jolpica limite le
// nombre de demandes)
export async function circuitRecords(env, circuitKey, year, { fetchFn = fetch, wait } = {}) {
  const editions = [];
  for (const y of recordYears(year)) editions.push(await edition(env, y, circuitKey, fetchFn, wait));
  return recordsOf(circuitKey, editions);
}

// Tâche planifiée : une édition par appel, celles des circuits connus que la base n'a pas encore pour cette saison, pour
// que personne n'attende les demandes à Jolpica (30 à 40 s pour la première ouverture des records d'une saison).
// Une fois tout lu, une seule ligne lue par appel jusqu'à la saison suivante
export async function recordsTick(env, { now = Date.now(), fetchFn = fetch, wait } = {}) {
  const year = new Date(now).getUTCFullYear(), done = `recordsdone:${year}`;
  if (!env.DB || await getRow(env, done)) return null;
  for (const { key } of Object.values(CIRCUITS)) {
    for (const y of recordYears(year)) {
      if (await getRow(env, `records:${key}:${y}`)) continue;
      await edition(env, y, key, fetchFn, wait);
      return { key, year: y };
    }
  }
  await setRow(env, done, '1');
  return null;
}
