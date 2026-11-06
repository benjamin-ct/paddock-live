// Carrière des pilotes de la saison (/live/api/career?driver=<id Jolpica>) : saisons passées lues chez Jolpica par la
// tâche planifiée, un pilote par passage (ses résultats, 5 pages au plus, et ses poles, 1 ou 2) puis le champion de
// chaque saison qui manque (une demande par passage, commune à tous les pilotes), gardées dans la base (career:<id>,
// champions) et relues seulement au changement d'année. Saison en cours : celle que la base garde déjà (relue toutes
// les 30 minutes), donc à jour après chaque course sans aucune demande en plus. Les visiteurs ne déclenchent jamais de
// demande à Jolpica ; un échec est noté et réessayé une heure plus tard.
import { setRow, readJSON, rowsWithPrefix } from './alerts.js';
import { pages } from './season-cache.js';
import { careerSeasons, seasonLine, careerOf } from '../shared/career.js';

const RETRY = 3600e3;
export const careerKey = (id) => `career:${id}`;
export const DRIVER_ID = /^[a-z0-9_]{2,40}$/;
const racesOf = (list) => list.flatMap((m) => m?.RaceTable?.Races || []);

export async function careerTick(env, { now = Date.now(), fetchFn = fetch, wait } = {}) {
  if (!env.DB) return null;
  const year = new Date(now).getUTCFullYear(), upTo = year - 1;
  const season = await readJSON(env, `season:${year}`, null);
  // Pilotes de la saison : saisons passées jusqu'à l'an dernier
  for (const d of season?.v?.drivers || []) {
    if (!DRIVER_ID.test(d.id || '')) continue;
    const row = await readJSON(env, careerKey(d.id), null);
    if (row?.v?.upTo === upTo || now - (row?.at || 0) < RETRY) continue;
    try {
      const races = racesOf(await pages(`drivers/${d.id}/results`, fetchFn, wait, env));
      const poles = racesOf(await pages(`drivers/${d.id}/qualifying/1`, fetchFn, wait, env));
      await setRow(env, careerKey(d.id), JSON.stringify({ at: now, v: { upTo, name: d.name, seasons: careerSeasons(races, poles, upTo) } }));
      return { driver: d.id };
    } catch (err) {
      await setRow(env, careerKey(d.id), JSON.stringify({ at: now, v: row?.v || null, error: String(err.message || err) }));
      return { driver: d.id, error: err.message };
    }
  }
  // Champion de chaque saison courue par un de ces pilotes (une saison passée ne change plus)
  const champs = await readJSON(env, 'champions', { v: {} });
  if (now - (champs.at || 0) < RETRY && champs.error) return null;
  const years = new Set();
  for (const { v } of await rowsWithPrefix(env, 'career:')) {
    try { for (const s of JSON.parse(v)?.v?.seasons || []) if (s.y <= upTo) years.add(s.y); } catch { /* ligne illisible */ }
  }
  const y = [...years].sort((a, b) => b - a).find((x) => !(x in champs.v));
  if (!y) return null;
  try {
    const id = (await pages(`${y}/driverstandings/1`, fetchFn, wait, env))[0]?.StandingsTable?.StandingsLists?.[0]?.DriverStandings?.[0]?.Driver?.driverId;
    if (!id) throw new Error(`champion ${y} introuvable`);
    await setRow(env, 'champions', JSON.stringify({ at: now, v: { ...champs.v, [y]: id } }));
    return { champion: y };
  } catch (err) {
    await setRow(env, 'champions', JSON.stringify({ at: now, v: champs.v, error: String(err.message || err) }));
    return { champion: y, error: err.message };
  }
}

// Réponse de /live/api/career : { pending } tant que la tâche planifiée n'a pas lu les saisons passées du pilote ;
// pendingTitles : champion d'une de ses saisons pas encore lu
export async function careerWeb(env, id, { now = Date.now() } = {}) {
  const year = new Date(now).getUTCFullYear();
  const row = await readJSON(env, careerKey(id), null);
  if (row?.v?.upTo !== year - 1) return { driver: id, pending: true };
  const season = (await readJSON(env, `season:${year}`, null))?.v;
  const me = season?.drivers?.find((d) => d.id === id);
  const cur = seasonLine(season, id, me?.code, year);
  const champs = (await readJSON(env, 'champions', { v: {} })).v;
  const out = careerOf([...row.v.seasons, ...(cur ? [cur] : [])], id, champs);
  return { driver: id, name: row.v.name, ...out, pendingTitles: row.v.seasons.some((s) => !(s.y in champs)) };
}
