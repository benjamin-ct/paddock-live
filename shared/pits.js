// Arrêts aux stands au plus près de la réalité.
//
// Un passage par la voie des stands n'est pas toujours un arrêt : sous voiture de sécurité ou
// drapeau rouge, la direction de course fait parfois passer tout le monde par les stands (« ALL
// CARS THROUGH THE PIT LANE »), et un drive-through se purge sans s'arrêter. La F1 compte pourtant
// ces passages (NumberOfPitStops) et ouvre un « nouveau relais » avec les mêmes pneus. Ici, un
// relais marqué « pneus non changés » (TyresNotChanged), ou qui continue le précédent (même composé,
// pneus pas neufs, usure qui reprend exactement là où elle s'était arrêtée), est rattaché au
// précédent : il ne reste que les vrais changements de pneus.

import { median } from './season-calc.js';

const list = (o) => (!o ? [] : Array.isArray(o) ? o : Object.keys(o).sort((a, b) => a - b).map((k) => o[k])).filter(Boolean);
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const isNew = (s) => s?.New === true || s?.New === 'true';

// Relais d'un pilote (TimingAppData.Lines[n]) : [{ Compound, New, StartLaps, TotalLaps, … }]
export function stintList(appLine) {
  return list(appLine?.Stints);
}

const truthy = (v) => v === true || v === 'true' || v === '1' || v === 1;

// Le relais b prolonge-t-il le relais a (mêmes pneus, sans arrêt) ? Indication officielle
// (TyresNotChanged), sinon même composé avec une usure qui reprend exactement au même nombre de tours.
export function continuesStint(a, b) {
  if (!a || !b) return false;
  if (truthy(b.TyresNotChanged) && (!a.Compound || !b.Compound || a.Compound === b.Compound)) return true;
  if (!a.Compound || a.Compound !== b.Compound || isNew(b)) return false;
  const end = num(a.TotalLaps), start = num(b.StartLaps);
  return end !== null && start !== null && start > 0 && start === end;
}

// Relais réels : les relais « mêmes pneus » sont fusionnés avec le précédent.
// Chaque relais garde l'indice de ses relais d'origine (from, to) pour les rapprocher des passages.
export function realStints(stints) {
  const out = [];
  stints.forEach((s, i) => {
    const last = out[out.length - 1];
    if (last && continuesStint(last, s)) {
      Object.assign(last, { TotalLaps: s.TotalLaps, LapTime: s.LapTime ?? last.LapTime, LapNumber: s.LapNumber ?? last.LapNumber, to: i });
    } else out.push({ ...s, from: i, to: i });
  });
  return out;
}

// Nombre de vrais arrêts (changements de pneus) d'un pilote ; à défaut de relais, le compteur officiel
export function realStopCount(appLine, timingLine) {
  const st = stintList(appLine);
  if (!st.length) return Number(timingLine?.NumberOfPitStops) || 0;
  return Math.max(0, realStints(st).length - 1);
}

// Le n-ième passage par la voie des stands (0 = premier) est-il un vrai arrêt ?
// Passage n = passage du relais d'origine n au relais n + 1.
export function passIsRealStop(stints, n) {
  const a = stints[n], b = stints[n + 1];
  if (!a || !b) return true;                  // relais pas encore connu : on le compte
  return !continuesStint(a, b);
}

// Tours neutralisés (voiture de sécurité, VSC, drapeau rouge) d'après la direction de course
export function neutralLaps(messages) {
  const out = new Set();
  let from = null;
  for (const m of list(messages)) {
    const lap = num(m?.Lap);
    if (!lap) continue;
    const text = String(m.Message || '').toUpperCase();
    if (m.Category === 'SafetyCar') {
      if (m.Status === 'DEPLOYED') from ??= lap;
      else if ((m.Status === 'ENDING' || m.Status === 'IN THIS LAP') && from !== null) { for (let l = from; l <= lap + 1; l++) out.add(l); from = null; }
    } else if (m.Flag === 'RED' && (m.Scope === 'Track' || /RED FLAG/.test(text))) {
      // Drapeau rouge pendant une voiture de sécurité : la période se referme ici (comme race-story.js)
      if (from !== null) { for (let l = from; l < lap; l++) out.add(l); from = null; }
      out.add(lap); out.add(lap + 1);
    }
  }
  if (from !== null) for (let l = from; l <= from + 60; l++) out.add(l);
  return out;
}


/**
 * Temps réellement perdu dans la voie des stands, mesuré pendant la course. La voie des stands
 * longe la ligne d'arrivée : on compare le secteur 3 du tour d'entrée et le secteur 1 du tour de
 * sortie aux mêmes secteurs des tours normaux du pilote juste avant et après l'arrêt.
 * laps : { num: [{ lap, s1, s3, pit }] } (secondes) ; stops : [{ num, lap, stop? }] (tour d'entrée,
 * immobilisation) ; neutral : Set des tours neutralisés.
 * Renvoie { value, n, detail } (médiane des arrêts sous drapeau vert) ou null (moins de 2 arrêts).
 */
export function measuredPitLoss(laps, stops, neutral = new Set()) {
  const out = [];
  for (const s of stops) {
    const L = num(s.lap);
    if (!L || L < 2 || neutral.has(L) || neutral.has(L + 1)) continue;
    const arr = laps[s.num] || [];
    const byLap = new Map(arr.map((x) => [x.lap, x]));
    const s3 = byLap.get(L)?.s3, s1 = byLap.get(L + 1)?.s1;
    if (!(s3 > 0 && s1 > 0)) continue;
    const near = arr.filter((x) => x.lap >= L - 4 && x.lap <= L + 5 && x.lap !== L && x.lap !== L + 1 && x.lap > 1 && !x.pit && !neutral.has(x.lap));
    const r3 = median(near.map((x) => x.s3).filter((v) => v > 0)), r1 = median(near.map((x) => x.s1).filter((v) => v > 0));
    if (!r3 || !r1 || near.length < 3) continue;
    const loss = s3 - r3 + s1 - r1;
    if (loss >= 8 && loss <= 40) out.push({ loss, num: s.num, lap: L, stop: s.stop ?? null });
  }
  if (out.length < 2) return null;
  // Immobilisation : un arrêt raté (6 s au lieu de 2,5 s) ne doit pas fausser la perte « type ».
  const st = median(out.map((x) => x.stop).filter((v) => v > 0));
  const vals = out.map((x) => (st && x.stop > 0 ? x.loss - x.stop + st : x.loss));
  return { value: Math.round(median(vals) * 10) / 10, n: out.length, detail: out };
}
