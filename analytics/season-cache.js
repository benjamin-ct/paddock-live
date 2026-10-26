// Saison (calendrier, classements, résultats, qualifs, sprints) lue chez Jolpica par le serveur :
// le Studio la reçoit en une seule demande, déjà résumée, au lieu d'une douzaine de demandes
// espacées depuis le téléphone. Gardée dans la base et relue par la tâche planifiée.
import { summarize } from '../shared/season-data.js';

const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
export const SEASON_TTL = 30 * 60e3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Toutes les pages d'une liste (100 par page), une demande à la fois (4 par seconde au plus chez Jolpica)
async function pages(path, fetchFn, wait) {
  const out = [];
  for (let offset = 0, total = 1; offset < total; offset += 100) {
    let j = null, last = null;
    for (let attempt = 0; attempt < 5 && !j; attempt++) {
      // Trop de demandes (429) : attente demandée par Jolpica (10 s au plus), sinon de plus en plus longue
      const after = Number(last?.headers?.get('Retry-After'));
      await wait(attempt ? Math.min(10000, after > 0 ? after * 1000 : 1000 * 2 ** attempt) : 300);
      last = await fetchFn(`${JOLPICA}/${path}.json?limit=100&offset=${offset}`, { signal: AbortSignal.timeout(20000) }).catch(() => null);
      if (last?.ok) j = await last.json();
      else if (last && last.status !== 429 && last.status < 500) throw new Error(`Résultats indisponibles (erreur ${last.status})`);
    }
    if (!j) throw new Error(`Serveur des résultats (Jolpica) injoignable${last ? ` (erreur ${last.status})` : ''}`);
    total = Number(j.MRData?.total) || 0;
    out.push(j.MRData);
    if (!total) break;
  }
  return out;
}

// Résultats parus depuis la lecture précédente (Grand Prix des 3 derniers jours) : un message par séance
// pour le téléphone du créateur (post prêt dans le Studio)
const READY = [['sprintResults', 'du sprint', 'sprint'], ['quali', 'des qualifications', 'qualifs'], ['results', 'de la course', 'course']];
export function resultsReady(before, after, now = Date.now()) {
  const out = [];
  for (const r of after?.races || []) {
    if (Math.abs(now - Date.parse(r.date)) > 3 * 86400e3) continue;
    const old = before?.races?.find((x) => x.round === r.round);
    for (const [k, label, id] of READY) {
      if (r[k]?.length && !old?.[k]?.length) out.push({ title: `Post prêt : résultats ${label}`, body: `${r.name} : à publier depuis le Studio`, id: `ready-${r.round}-${id}`, url: '/studio/' });
    }
  }
  return out;
}

export async function buildSeason(year, { fetchFn = fetch, wait = sleep } = {}) {
  const races = (list) => list.flatMap((m) => m?.RaceTable?.Races || []);
  const get = (p) => pages(p, fetchFn, wait);
  const schedule = races(await get(`${year}`));
  const ds = await get(`${year}/driverstandings`);
  const cs = await get(`${year}/constructorstandings`);
  const results = races(await get(`${year}/results`));
  const quali = races(await get(`${year}/qualifying`));
  const sprint = races(await get(`${year}/sprint`));
  return summarize({ schedule, driverStandings: ds[0]?.StandingsTable?.StandingsLists?.[0]?.DriverStandings, constructorStandings: cs[0]?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings, results, quali, sprint });
}
