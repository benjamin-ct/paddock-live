// Séance de F1 en cours (calendrier Jolpica) : le workflow « Statistiques » ne déploie pas le Worker pendant une
// séance, ce qui couperait tous les spectateurs de la version web. Code de sortie 0 (et la séance affichée) si
// une séance a commencé il y a moins de 2 h 30 ou commence dans moins de 15 min, 1 sinon (calendrier
// injoignable compris : le contrôle par /live/api/session reste en place).
import { pathToFileURL } from 'node:url';

const SESSIONS = ['FirstPractice', 'SecondPractice', 'ThirdPractice', 'SprintQualifying', 'SprintShootout', 'Sprint', 'Qualifying'];
const BEFORE = 15 * 60e3, AFTER = 150 * 60e3;

export function liveSession(race, now = Date.now()) {
  if (!race) return null;
  for (const [name, s] of [...SESSIONS.map((k) => [k, race[k]]), ['Race', race]]) {
    if (!s?.date || !s.time) continue;
    const t = Date.parse(`${s.date}T${s.time}`);
    if (now >= t - BEFORE && now <= t + AFTER) return `${race.raceName} · ${name}`;
  }
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await fetch('https://api.jolpi.ca/ergast/f1/current/next.json', { signal: AbortSignal.timeout(10e3) }).catch((e) => e);
  if (!r.ok) { console.log(`Calendrier injoignable : ${r.status || r.message}`); process.exit(1); }
  const live = liveSession((await r.json())?.MRData?.RaceTable?.Races?.[0]);
  if (live) console.log(live);
  process.exit(live ? 0 : 1);
}
