// Saison au format compact de l'appli (calendrier, résultats, qualifications, sprints, classements)
// à partir des réponses de l'API publique Jolpica. Code pur, partagé par le serveur de l'appli et la
// page web du créateur (qui interroge l'API directement).

import { lapTime } from './race-laps.js';

// Les courses sont découpées sur plusieurs pages : on regroupe par manche
function byRound(races, key) {
  const m = new Map();
  for (const r of races) {
    const cur = m.get(r.round) || { ...r, [key]: [] };
    cur[key].push(...(r[key] || []));
    m.set(r.round, cur);
  }
  return [...m.values()];
}

const driverOf = (d) => ({ code: d?.code || d?.familyName?.slice(0, 3).toUpperCase(), name: `${d?.givenName || ''} ${d?.familyName || ''}`.trim(), last: d?.familyName || '', number: d?.permanentNumber || null });
const iso = (s) => (s?.date ? `${s.date}T${s.time || '00:00:00Z'}` : null);
// Séance sans heure (calendrier publié avant les horaires) : t null (ni rappel ni agenda), date seule dans day
const session = (label, s) => (s?.date && !s.time ? { label, t: null, day: s.date } : { label, t: iso(s) });

export function summarize({ schedule, driverStandings, constructorStandings, results, quali, sprint }) {
  const res = new Map(byRound(results, 'Results').map((r) => [r.round, r.Results]));
  const qual = new Map(byRound(quali, 'QualifyingResults').map((r) => [r.round, r.QualifyingResults]));
  const spr = new Map(byRound(sprint, 'SprintResults').map((r) => [r.round, r.SprintResults]));
  const row = (x) => ({
    ...driverOf(x.Driver), team: x.Constructor?.name || '', teamId: x.Constructor?.constructorId || '',
    grid: Number(x.grid) || null, pos: Number(x.position) || null, posText: x.positionText, status: x.status,
    points: Number(x.points) || 0, fastest: x.FastestLap?.rank === '1', time: x.Time?.time || null, laps: Number(x.laps) || null,
  });
  const races = schedule.map((r) => {
    const sessions = [['FirstPractice', 'EL1'], ['SecondPractice', 'EL2'], ['ThirdPractice', 'EL3'], ['SprintQualifying', 'Qualif. sprint'], ['Sprint', 'Sprint'], ['Qualifying', 'Qualifications']]
      .filter(([k]) => r[k]).map(([k, label]) => session(label, r[k]));
    sessions.push(session('Course', r));
    const results = (res.get(r.round) || []).map(row);
    const q = (qual.get(r.round) || []).map((x) => ({ ...driverOf(x.Driver), team: x.Constructor?.name || '', teamId: x.Constructor?.constructorId || '', pos: Number(x.position) || null,
      q: [x.Q1, x.Q2, x.Q3].map((t) => lapTime(t)) }));
    const s = (spr.get(r.round) || []).map(row);
    return {
      round: Number(r.round), name: r.raceName, circuit: r.Circuit?.circuitName, circuitId: r.Circuit?.circuitId || '', locality: r.Circuit?.Location?.locality,
      country: r.Circuit?.Location?.country, lat: Number(r.Circuit?.Location?.lat), lon: Number(r.Circuit?.Location?.long),
      date: iso(r), sprint: !!r.Sprint, sessions,
      results, quali: q, sprintResults: s,
    };
  });
  return {
    races,
    drivers: (driverStandings || []).map((x) => ({ pos: Number(x.position) || null, ...driverOf(x.Driver), team: x.Constructors?.at(-1)?.name || '', teamId: x.Constructors?.at(-1)?.constructorId || '', points: Number(x.points) || 0, wins: Number(x.wins) || 0 })),
    constructors: (constructorStandings || []).map((x) => ({ pos: Number(x.position) || null, name: x.Constructor?.name, id: x.Constructor?.constructorId, points: Number(x.points) || 0, wins: Number(x.wins) || 0 })),
  };
}

