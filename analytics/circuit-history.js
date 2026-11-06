// « Dans l'histoire » des Grands Prix à venir (/live/api/circuit-history) : vainqueurs des courses passées sur chaque
// circuit des calendriers gardés, lus chez Jolpica par la tâche planifiée (un circuit par passage, une demande) et
// gardés dans la base (cirhist:<circuit>) ; relus seulement quand une course de la saison sur ce circuit est terminée.
// Les visiteurs ne déclenchent jamais de demande à Jolpica. Chiffres depuis 2018 : analyses des courses déjà gardées
// (racestats:<année>:<manche>, analytics/race-stats.js).
import { getRow, setRow, readJSON } from './alerts.js';
import { pages } from './season-cache.js';
import { STATS_VERSION } from '../shared/race-stats.js';
import { winnersOf, historySummary, raceFigures } from '../shared/circuit-history.js';
import { FIRST_YEAR } from '../shared/circuit-records.js';

const RETRY = 3600e3;   // lecture ratée, ou course terminée pas encore chez Jolpica : nouvel essai une heure plus tard
const WANT = 10 * 60e3;
export const historyKey = (id) => `cirhist:${id}`;

// Tâche planifiée : le premier circuit des calendriers (saison en cours, et la suivante si la base l'a déjà) jamais lu,
// ou dont une course de la saison est terminée sans être dans l'historique ; null : rien à faire
export async function historyTick(env, { now = Date.now(), fetchFn = fetch, wait } = {}) {
  if (!env.DB) return null;
  const year = new Date(now).getUTCFullYear();
  for (const y of [year, year + 1]) {
    for (const r of (await readJSON(env, `season:${y}`, null))?.v?.races || []) {
      if (!/^[a-z0-9_]{2,40}$/.test(r.circuitId || '')) continue;
      const row = await readJSON(env, historyKey(r.circuitId), null);
      const missing = !row?.v || (r.results?.length && !row.v.some((w) => w.y === y && w.round === r.round));
      if (!missing || now - (row?.at || 0) < RETRY) continue;
      try {
        const races = (await pages(`circuits/${r.circuitId}/results/1`, fetchFn, wait, env)).flatMap((m) => m?.RaceTable?.Races || []);
        await setRow(env, historyKey(r.circuitId), JSON.stringify({ at: now, v: winnersOf(races) }));
        return { circuit: r.circuitId };
      } catch (err) {
        await setRow(env, historyKey(r.circuitId), JSON.stringify({ at: now, v: row?.v || null, error: String(err.message || err) }));
        return { circuit: r.circuitId, error: err.message };
      }
    }
  }
  return null;
}

// Réponse de /live/api/circuit-history : { pending } tant que la tâche planifiée n'a pas lu le circuit. Course d'une
// saison passée pas encore analysée : sa saison est demandée à l'analyse des archives (racewant, comme l'espace Saison
// de la version web quand on ouvre ses statistiques), la plus récente d'abord
export async function circuitHistory(env, id, { now = Date.now() } = {}) {
  const row = await readJSON(env, historyKey(id), null);
  if (!row?.v) return { circuitId: id, pending: true };
  const figures = new Map();
  let want = null;
  for (const w of row.v.filter((x) => x.y >= FIRST_YEAR)) {
    if (figures.has(`${w.y}:${w.round}`)) continue;
    let d = null;
    try { d = JSON.parse(await getRow(env, `racestats:${w.y}:${w.round}`) || 'null'); } catch { /* ligne illisible */ }
    if (d?.v === STATS_VERSION) figures.set(`${w.y}:${w.round}`, raceFigures(d));
    else if (!d?.failed && w.y < new Date(now).getUTCFullYear()) want = w.y;
  }
  if (want && now - Number(await getRow(env, `racewant:${want}`) || 0) > WANT) await setRow(env, `racewant:${want}`, String(now));
  return { circuitId: id, ...historySummary(row.v, figures), pendingStats: !!want, at: row.at };
}
