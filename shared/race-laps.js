// Course tour par tour (position et temps de chaque pilote à la fin de chaque tour), d'après l'API
// publique Jolpica (pages « laps » et résultats de la manche). Code pur, partagé par l'appli et la
// page web du créateur : graphique des positions, vidéo animée, rythme des notes des pilotes.

import { median } from './season-calc.js';

// « 1:23.456 » -> secondes (null si pas de temps)
export const lapTime = (t) => {
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(t || '').trim());
  return m ? Math.round(((Number(m[1]) || 0) * 60 + Number(m[2])) * 1000) / 1000 : null;
};

// lapPages : courses renvoyées par /{année}/{manche}/laps (une par page) ; results : résultats bruts
// de la manche (Jolpica « Results » : Driver, Constructor, grid, position, status) ; pitPages :
// courses renvoyées par /{année}/{manche}/pitstops (facultatif : tours des arrêts au stand)
export function parseRaceLaps(lapPages, results, pitPages = []) {
  const stops = new Map();
  for (const r of pitPages || []) for (const p of r?.PitStops || []) {
    const n = Number(p.lap);
    if (n) stops.set(p.driverId, [...(stops.get(p.driverId) || []), n]);
  }
  const laps = new Map();
  for (const r of lapPages || []) for (const l of r?.Laps || []) {
    const n = Number(l.number);
    if (!n) continue;
    laps.set(n, [...(laps.get(n) || []), ...(l.Timings || [])]);
  }
  const total = laps.size ? Math.max(...laps.keys()) : 0;
  const drivers = (results || []).map((x) => {
    const id = x.Driver?.driverId;
    const pos = [];
    const times = [];
    for (let n = 1; n <= total; n++) {
      const t = (laps.get(n) || []).find((y) => y.driverId === id);
      pos.push(t ? Number(t.position) || null : null);
      times.push(t ? lapTime(t.time) : null);
    }
    // Dernier tour bouclé : au-delà, le pilote a abandonné
    const done = pos.reduce((a, p, i) => (p ? i + 1 : a), 0);
    return {
      code: x.Driver?.code || String(x.Driver?.familyName || '').slice(0, 3).toUpperCase(),
      first: x.Driver?.givenName || '', last: x.Driver?.familyName || '', team: x.Constructor?.name || '', teamId: x.Constructor?.constructorId || '',
      grid: Number(x.grid) || null, finish: Number(x.position) || null, classified: /^\d+$/.test(x.positionText || ''),
      status: x.status || '', laps: done, pos, times, pits: [...new Set(stops.get(id) || [])].sort((a, b) => a - b),
    };
  });
  return { total, drivers };
}

// Tour médian « propre » d'un pilote : hors 1er tour, sans les tours lents (> 107 % de sa médiane :
// arrêt au stand, voiture de sécurité, incident) ; null s'il en reste moins de 8
export function cleanPace(times) {
  const v = (times || []).slice(1).filter((t) => t > 0);
  if (v.length < 8) return null;
  const med = median(v);
  const kept = v.filter((t) => t <= med * 1.07);
  return kept.length >= 8 ? median(kept) : null;
}

// Changements de leader et tours en tête
export function lapsLedBy(race) {
  const led = new Map();
  let changes = 0;
  let prev = null;
  for (let i = 0; i < race.total; i++) {
    const lead = race.drivers.find((d) => d.pos[i] === 1);
    if (!lead) continue;
    led.set(lead.code, (led.get(lead.code) || 0) + 1);
    if (prev && prev !== lead.code) changes++;
    prev = lead.code;
  }
  return { led, changes };
}
