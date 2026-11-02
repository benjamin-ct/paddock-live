// Championnat des casseurs (version web et appli) : dégâts estimés de la saison, relus sur Formula 1 Dashboard
// (estimations de u/Dense-Strategy-867, reprises avec leur accord) au plus toutes les 12 heures et gardés dans la base ;
// page injoignable ou illisible : dernière lecture gardée, sinon les données livrées avec le serveur
// (analytics/destructors-data.js), nouvel essai une heure plus tard
import { DESTRUCTORS } from './destructors-data.js';
import { getRow, setRow } from './alerts.js';
import { parseDashboard } from '../shared/destructors.js';

const PAGE = 'https://app.formula1dashboard.com/destructors-championship';
const TTL = 12 * 3600e3, RETRY = 3600e3;

export async function destructorsWeb(env, year, { now = Date.now(), fetchFn = fetch } = {}) {
  const bundled = year === DESTRUCTORS.year ? DESTRUCTORS : { year, rows: [] };
  if (!env.DB || year !== new Date(now).getUTCFullYear()) return bundled;
  const key = `destructors:${year}`;
  const row = JSON.parse(await getRow(env, key).catch(() => null) || 'null');
  if (row && now - row.at < TTL) return row.v;
  let v = null;
  try {
    const res = await fetchFn(PAGE, { headers: { 'User-Agent': 'Paddock Live (paddocklive.app)' }, signal: AbortSignal.timeout(15000) });
    if (res.ok) v = parseDashboard(await res.text());
  } catch { /* page injoignable */ }
  const keep = v?.year === year ? v : row?.v || bundled;
  await setRow(env, key, JSON.stringify({ at: v?.year === year ? now : now - TTL + RETRY, v: keep })).catch(() => {});
  return keep;
}
