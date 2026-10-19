// Records du circuit (le saviez-vous) : pole et meilleur tour en course des éditions précédentes,
// lus dans les archives de la F1 (depuis 2018). Calcul commun à l'appli et à la page du créateur ;
// read(path) lit un fichier des archives (JSON).
import { parseLapTime } from './f1.js';

export const FIRST_YEAR = 2018;
export const YEARS_BACK = 4;

// Meilleur tour d'une séance (TimingData, DriverList) : { time, tla, team, color, lap }
export function sessionBest(td, dl = {}) {
  let best = null;
  for (const [num, l] of Object.entries(td?.Lines || {})) {
    const t = parseLapTime(l?.BestLapTime?.Value);
    if (t > 0 && (!best || t < best.time)) best = { time: t, num, lap: Number(l.BestLapTime.Lap) || null };
  }
  if (!best) return null;
  const d = dl?.[best.num] || {};
  return { time: best.time, tla: d.Tla || best.num, team: d.TeamName || '', color: d.TeamColour || '', lap: best.lap };
}

// Index.json d'une saison -> Grand Prix couru sur ce circuit (qualifs et course hors sprint)
export function meetingOf(index, circuitKey) {
  const m = (index?.Meetings || []).find((x) => Number(x.Circuit?.Key) === Number(circuitKey) && (x.Sessions || []).some((s) => s.Type === 'Race' && s.Path));
  if (!m) return null;
  const pick = (type) => (m.Sessions || []).find((s) => s.Type === type && s.Path && !/sprint/i.test(s.Name || ''))?.Path || null;
  return { name: m.Name, quali: pick('Qualifying'), race: pick('Race') };
}

// Une édition : null si le circuit n'était pas au calendrier, { pending } si l'archive manque encore
export async function editionOf(year, circuitKey, read) {
  const meeting = meetingOf(await read(`${year}/Index.json`), circuitKey);
  if (!meeting) return null;
  const best = async (p) => {
    if (!p) return null;
    const [td, dl] = await Promise.all([read(`${p}TimingData.json`), read(`${p}DriverList.json`).catch(() => ({}))]);
    return sessionBest(td, dl);
  };
  const [pole, fastest] = await Promise.all([best(meeting.quali).catch(() => null), best(meeting.race).catch(() => null)]);
  if (!pole && !fastest) return { pending: true };
  return { year, name: meeting.name, pole, fastest };
}

// Une édition d'après les résultats officiels publics (API Jolpica : course et qualifications du Grand
// Prix sur ce circuit cette année-là), sans les archives de la F1 que la F1 réserve et refuse parfois
export function editionFromResults(year, races = [], qualis = []) {
  const race = races[0];
  if (!race) return null;
  const who = (x, time, lap = null) => ({ time, tla: x.Driver?.code || '', team: x.Constructor?.name || '', color: '', lap });
  const fast = (race.Results || []).map((x) => ({ x, t: parseLapTime(x.FastestLap?.Time?.time) })).filter((o) => o.t > 0).sort((a, b) => a.t - b.t)[0];
  const p = (qualis[0]?.QualifyingResults || []).find((q) => q.position === '1');
  const poleTime = p && parseLapTime(p.Q3 || p.Q2 || p.Q1);
  return { year, name: race.raceName, pole: poleTime > 0 ? who(p, poleTime) : null, fastest: fast ? who(fast.x, fast.t, Number(fast.x.FastestLap.lap) || null) : null };
}

// Éditions retenues -> records (les plus rapides)
export function recordsOf(circuitKey, editions) {
  const list = editions.filter((e) => e && !e.pending);
  const pick = (k) => list.map((e) => e[k] && { ...e[k], year: e.year }).filter(Boolean).sort((a, b) => a.time - b.time)[0] || null;
  return { circuitKey, editions: list, bestPole: pick('pole'), bestRaceLap: pick('fastest') };
}

export const recordYears = (year) => {
  const out = [];
  for (let y = year - 1; y >= Math.max(FIRST_YEAR, year - YEARS_BACK); y--) out.push(y);
  return out;
};
