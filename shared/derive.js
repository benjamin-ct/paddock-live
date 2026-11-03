// Construction de l'état à partir de la suite d'événements du flux, + données dérivées
// (historique tour par tour, passages aux stands, décalage d'horloge).
// Utilisé par le serveur (reconstruction de l'état à "maintenant - délai")
// et par le navigateur (application incrémentale des événements).
import { merge } from './merge.js';
import { parseUtc, parseLapTime, trackStatusInfo } from './f1.js';

export function createDerived() {
  return {
    laps: {},        // num -> [{lap, t, time, gap, int, pos, s:[s1,s2,s3], pit, compound}]
    pending: {},     // num -> {s: [..]} secteurs du tour en cours
    pitLane: [],     // [{num, lap, duration, t}]
    pitStops: [],    // temps d'immobilisation (topic PitStop) : [{num, lap, time, t}]
    pitIn: {},       // num -> t entrée stands
    clockOffset: null, // heure locale de réception - heure F1 (ms)
    hbOffsets: [],
    clockRef: null,  // {t, utc} battement de référence
  };
}

function currentCompound(state, num) {
  const stints = state.TimingAppData?.Lines?.[num]?.Stints;
  if (!stints) return null;
  const arr = Array.isArray(stints) ? stints : Object.values(stints);
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i]?.Compound) return arr[i].Compound;
  return null;
}

function forEachEntry(obj, fn) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) obj.forEach((v, i) => v !== undefined && fn(String(i), v));
  else for (const k of Object.keys(obj)) fn(k, obj[k]);
}

function gapValue(line) {
  const raw = line.GapToLeader ?? line.TimeDiffToFastest;
  return raw ?? null;
}

// Applique un événement du flux à l'état (muté) et aux données dérivées.
export function applyEvent(state, derived, topic, data, t) {
  if (topic === '__snapshot') {
    // Copie profonde : l'événement source ne doit jamais être modifié par les fusions suivantes.
    for (const k of Object.keys(data)) state[k] = merge(undefined, data[k]);
    return;
  }

  let prevPit = null;
  if (topic === 'TimingData' && data?.Lines) {
    prevPit = {};
    forEachEntry(data.Lines, (num) => { prevPit[num] = !!state.TimingData?.Lines?.[num]?.InPit; });
  }

  state[topic] = merge(state[topic], data);

  if (topic === 'Heartbeat' && data?.Utc) {
    // Décalage heure locale de réception - heure F1 : écart médian des derniers battements, comme
    // clockOffset (shared/compare.js) ; un battement décalé de 20 min ne fausse pas l'heure du circuit.
    const utc = parseUtc(data.Utc);
    const off = t - utc;
    if (Number.isFinite(off)) {
      const list = (derived.hbOffsets ||= []);
      list.push({ off, t, utc });
      if (list.length > 8) list.shift();
      const best = [...list].sort((a, b) => a.off - b.off)[list.length >> 1];
      derived.clockOffset = best.off;
      // Point de référence (heure locale, heure F1) : permet aussi le replay accéléré.
      derived.clockRef = { t: best.t, utc: best.utc };
    }
  } else if (topic === 'TimingData' && data?.Lines) {
    forEachEntry(data.Lines, (num, upd) => {
      if (upd && typeof upd === 'object') onTimingLine(state, derived, num, upd, t, prevPit[num]);
    });
  } else if (topic === 'PitStop' && data?.RacingNumber && data.PitStopTime) {
    // Un message par arrêt ; le tour n'est pas toujours renseigné (rapproché ensuite par l'heure).
    (derived.pitStops ||= []).push({ num: String(data.RacingNumber), lap: data.Lap ? Number(data.Lap) : null, time: parseLapTime(data.PitStopTime), t });
  } else if (topic === 'PitLaneTimeCollection' && data?.PitTimes) {
    forEachEntry(data.PitTimes, (num, p) => {
      if (!p || !p.Duration) return;
      const lap = p.Lap ? Number(p.Lap) : null;
      const dup = derived.pitLane.find((x) => x.num === num && x.lap === lap);
      if (dup) { dup.duration = parseLapTime(p.Duration); return; }
      derived.pitLane.push({ num, lap, duration: parseLapTime(p.Duration), t });
    });
  }
}

function onTimingLine(state, derived, num, upd, t, wasInPit) {
  const line = state.TimingData.Lines[num];
  const laps = (derived.laps[num] ||= []);
  const pend = (derived.pending[num] ||= { s: [null, null, null] });

  if (upd.InPit === true && !wasInPit) derived.pitIn[num] = t;

  let s3 = null;
  forEachEntry(upd.Sectors, (i, s) => {
    if (s && s.Value) {
      pend.s[+i] = s.Value;
      if (+i === 2) s3 = s.Value;
    }
  });

  if (upd.NumberOfLaps !== undefined && upd.NumberOfLaps !== null) {
    const entry = {
      lap: upd.NumberOfLaps,
      t,
      time: line.LastLapTime?.Value || null,
      gap: gapValue(line),
      int: line.IntervalToPositionAhead?.Value ?? null,
      pos: line.Position ? Number(line.Position) : null,
      s: pend.s.slice(),
      pit: !!(line.InPit || line.PitOut),
      compound: currentCompound(state, num),
    };
    const last = laps[laps.length - 1];
    if (last && last.lap === entry.lap) laps[laps.length - 1] = entry;
    else laps.push(entry);
    pend.s = [null, null, null];
  } else if (laps.length) {
    // Les infos de fin de tour peuvent arriver quelques instants après le changement de tour.
    const last = laps[laps.length - 1];
    if (t - last.t < 6000) {
      if (upd.LastLapTime?.Value) last.time = upd.LastLapTime.Value;
      if (upd.GapToLeader !== undefined) last.gap = upd.GapToLeader;
      if (upd.IntervalToPositionAhead?.Value !== undefined) last.int = upd.IntervalToPositionAhead.Value;
      if (upd.Position) last.pos = Number(upd.Position);
      if (s3 && !last.s[2]) { last.s[2] = s3; pend.s[2] = null; }
    }
  }
}

// ---- Événements "repères" pour la synchronisation avec la TV ----
// Calculés à l'heure réelle de réception (non retardée).
export function createSyncContext() {
  return { lap: null, track: null, session: null, rcm: new Set(), pit: {} };
}

export function extractSyncEvents(ctx, topic, data, t) {
  const out = [];
  if (!data || typeof data !== 'object') return out;
  if (topic === '__snapshot') {
    // On mémorise l'état courant pour ne pas générer de faux repères.
    if (data.LapCount?.CurrentLap) ctx.lap = data.LapCount.CurrentLap;
    if (data.TrackStatus?.Status) ctx.track = data.TrackStatus.Status;
    if (data.SessionStatus?.Status) ctx.session = data.SessionStatus.Status;
    forEachEntry(data.RaceControlMessages?.Messages, (k) => ctx.rcm.add(k));
    forEachEntry(data.TimingData?.Lines, (num, l) => { ctx.pit[num] = !!l?.InPit; });
    return out;
  }
  switch (topic) {
    case 'LapCount':
      if (data.CurrentLap && data.CurrentLap !== ctx.lap) {
        ctx.lap = data.CurrentLap;
        out.push({ t, kind: 'lap', text: `Tour ${data.CurrentLap}`, hint: 'Le compteur de tours change à l\'écran (passage du leader)' });
      }
      break;
    case 'TrackStatus':
      if (data.Status && data.Status !== ctx.track) {
        ctx.track = data.Status;
        out.push({ t, kind: 'track', text: trackStatusInfo(data.Status).label, status: data.Status });
      }
      break;
    case 'SessionStatus':
      if (data.Status && data.Status !== ctx.session) {
        ctx.session = data.Status;
        if (data.Status === 'Started') out.push({ t, kind: 'session', text: 'Début de session / extinction des feux' });
        if (data.Status === 'Finished') out.push({ t, kind: 'session', text: 'Fin de session (drapeau à damier)' });
      }
      break;
    case 'RaceControlMessages':
      forEachEntry(data.Messages, (k, m) => {
        if (!m?.Message || ctx.rcm.has(k)) return;
        ctx.rcm.add(k);
        out.push({ t, kind: 'rcm', text: m.Message, flag: m.Flag || null });
      });
      break;
    case 'TimingData':
      forEachEntry(data.Lines, (num, l) => {
        if (!l || typeof l !== 'object') return;
        if (l.InPit === true && !ctx.pit[num]) out.push({ t, kind: 'pit', num, text: 'entre aux stands' });
        if (l.InPit !== undefined) ctx.pit[num] = !!l.InPit;
      });
      break;
  }
  return out;
}

