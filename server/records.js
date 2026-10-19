// Références du circuit : pole et meilleur tour en course des éditions précédentes (depuis 2018), pour
// situer les temps de la séance. D'après les résultats officiels publics (Jolpica) ; archives de la F1
// pour un circuit inconnu de la liste (elle les refuse parfois même avec F1 TV). Gardées sur disque.
import fs from 'node:fs';
import path from 'node:path';
import { archiveJSON } from './archive.js';
import { seasonIndex } from './replay.js';
import { CACHE_DIR } from './circuits.js';
import { jolpicaRaces } from './season.js';
import { CIRCUITS } from '../shared/circuits-info.js';
import { editionOf, editionFromResults, recordsOf, recordYears } from '../shared/circuit-records.js';

function readCache(name) {
  try { return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, name), 'utf8')); } catch { return null; }
}
function writeCache(name, data) {
  try { fs.writeFileSync(path.join(CACHE_DIR, name), JSON.stringify(data)); } catch { /* cache facultatif */ }
}

async function edition(year, circuitKey) {
  const name = `records-${circuitKey}-${year}.json`;
  const cached = readCache(name);
  if (cached) return cached.none ? null : cached;
  const id = Object.keys(CIRCUITS).find((k) => CIRCUITS[k].key === Number(circuitKey));
  let out;
  try {
    out = id
      ? editionFromResults(year, ...(await Promise.all([jolpicaRaces(`${year}/circuits/${id}/results`), jolpicaRaces(`${year}/circuits/${id}/qualifying`)])))
      : await editionOf(year, circuitKey, async (p) => (p.endsWith('Index.json') ? { Meetings: (await seasonIndex(year)).map(toIndex) } : archiveJSON(p, { timeout: 30000 })));
  } catch { return null; }
  if (!out) { writeCache(name, { none: true }); return null; }
  if (out.pending) return null;   // archive pas encore disponible : on réessaiera
  writeCache(name, out);
  return out;
}

// Index déjà lu par le replay -> forme de l'Index.json de la F1
const toIndex = (m) => ({ Name: m.name, Circuit: { Key: m.circuitKey }, Sessions: m.sessions.map((s) => ({ Name: s.name, Type: s.type, Path: s.path })) });

// Éditions précédentes (au plus 4) du Grand Prix disputé sur ce circuit
export async function circuitRecords(circuitKey, year) {
  const editions = await Promise.all(recordYears(year).map((y) => edition(y, circuitKey).catch(() => null)));
  return recordsOf(circuitKey, editions);
}
