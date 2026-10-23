// Moments clés d'une séance enregistrée (replay) : départ, drapeaux, changements de leader,
// dépassements pour le podium, arrêts des premiers, abandons, incidents, pénalités, meilleur
// tour, arrivée. Calculés une fois au chargement du replay à partir des messages de la séance.
// Chaque moment : { off (ms depuis le début), kind, text, who (pilotes concernés), lap }.

import { passIsRealStop } from './pits.js';

const KIND_LABEL = {
  start: 'Départ', sc: 'Voiture de sécurité', vsc: 'VSC', red: 'Drapeau rouge', green: 'Reprise',
  lead: 'Changement de leader', overtake: 'Dépassement (podium)', pit: 'Arrêt aux stands', retire: 'Abandon',
  incident: 'Incident', penalty: 'Pénalité', fastest: 'Meilleur tour', finish: 'Arrivée', part: 'Début de partie',
};
export const MOMENT_LABEL = KIND_LABEL;

const lines = (o) => (!o ? [] : Array.isArray(o) ? o.map((v, i) => [String(i), v]) : Object.entries(o));
const messages = (data) => (Array.isArray(data?.Messages) ? data.Messages : Object.values(data?.Messages || {}));
const tlas = (msg) => [...String(msg).matchAll(/CARS? \d+ \((\w{3})\)|, \d+ \((\w{3})\)|AND \d+ \((\w{3})\)/g)].map((m) => m[1] || m[2] || m[3]);

// Pénalité annoncée par les commissaires, en français : « 10 s », « drive-through »…
function penaltyText(msg, en = false) {
  const m = String(msg);
  const sec = m.match(/(\d+) SECOND TIME PENALTY/);
  const what = sec ? (en ? `${sec[1]} s penalty` : `${sec[1]} s de pénalité`) : /DRIVE THROUGH/.test(m) ? 'drive-through' : /STOP\/GO|STOP AND GO/.test(m) ? 'stop & go'
    : /GRID PENALTY|GRID PLACE/.test(m) ? (en ? 'grid penalty' : 'pénalité sur la grille') : /BLACK AND WHITE/.test(m) ? null : (en ? 'penalty' : 'pénalité');
  if (!what) return null;
  const reason = m.split(' - ').slice(1).join(' - ').replace(/\s*\(\d{2}:\d{2}:\d{2}\)\s*$/, '').trim();
  const fr = { 'CAUSING A COLLISION': 'collision', 'LEAVING THE TRACK AND GAINING AN ADVANTAGE': 'avantage hors piste', 'SPEEDING IN THE PIT LANE': 'excès de vitesse aux stands', 'FORCING ANOTHER DRIVER OFF THE TRACK': 'pilote poussé hors piste', 'UNSAFE RELEASE': 'sortie des stands dangereuse', 'TRACK LIMITS': 'limites de piste' };
  return { what, reason: (!en && fr[reason]) || reason.toLowerCase() };
}

// lang : 'fr' (par défaut) ou 'en' pour les textes des moments
export function keyMoments(events, { kind = 'race', lang = 'fr' } = {}) {
  const en = lang === 'en';
  const out = [];
  const name = new Map();      // numéro -> trigramme
  const pos = new Map();       // numéro -> position
  const inPit = new Map();
  const retired = new Set();
  let lap = 0;
  let leader = null;
  let started = false;
  let finished = false;
  let startOff = 0;
  let track = '1';
  let part = null;
  let fastest = null;
  const passes = new Map();     // numéro -> passages par la voie des stands
  const stints = new Map();     // numéro -> relais (indice -> relais)
  const tla = (n) => name.get(n) || `n°${n}`;
  const add = (off, k, text, who = []) => out.push({ off, kind: k, text, who, lap: kind === 'race' ? lap : null });

  for (const e of events) {
    const d = e.data;
    if (!d) continue;
    switch (e.topic) {
      case 'DriverList':
        for (const [n, v] of lines(d)) if (v && typeof v === 'object' && v.Tla) name.set(n, v.Tla);
        break;
      case 'LapCount':
        if (d.CurrentLap) lap = Number(d.CurrentLap) || lap;
        break;
      case 'SessionStatus':
        if (d.Status === 'Started') {
          finished = false;
          // Leader au départ : celui qui est en tête juste avant (pole), même sans nouvelle position
          if (!started) leader = [...pos].find(([, q]) => q === 1)?.[0] ?? leader;
          if (!started) { started = true; startOff = e.off; add(e.off, kind === 'quali' ? 'part' : 'start', kind === 'quali' ? (en ? `Start of Q${part || 1}` : `Début de Q${part || 1}`) : kind === 'race' ? (en ? 'Lights out' : 'Extinction des feux') : (en ? 'Session start' : 'Début de la séance')); }
          else if (kind === 'quali' && part) add(e.off, 'part', en ? `Start of Q${part}` : `Début de Q${part}`);
        } else if (d.Status === 'Finished' && !finished) {
          finished = true;
          if (kind === 'quali') add(e.off, 'finish', en ? `End of Q${part || 1}${part >= 3 && leader ? `: pole for ${tla(leader)}` : ''}` : `Fin de Q${part || 1}${part >= 3 && leader ? ` : pole pour ${tla(leader)}` : ''}`, part >= 3 && leader ? [tla(leader)] : []);
          else if (kind === 'race') add(e.off, 'finish', 'Drapeau à damier');
          else add(e.off, 'finish', en ? `End of the session${leader ? `: fastest time for ${tla(leader)}` : ''}` : `Fin de la séance${leader ? ` : meilleur temps pour ${tla(leader)}` : ''}`, leader ? [tla(leader)] : []);
        }
        break;
      case 'TrackStatus': {
        const st = String(d.Status ?? '');
        if (!st || st === track) break;
        if (st === '4') add(e.off, 'sc', 'Voiture de sécurité');
        else if (st === '6') add(e.off, 'vsc', 'Voiture de sécurité virtuelle');
        else if (st === '5') add(e.off, 'red', 'Drapeau rouge');
        else if (st === '1' && ['4', '5', '6', '7'].includes(track)) add(e.off, 'green', track === '5' ? 'Reprise après le drapeau rouge' : kind === 'race' ? 'Reprise de la course' : 'Reprise de la séance');
        track = st;
        break;
      }
      case 'TimingAppData':
        // Relais (pour écarter ensuite les passages par les stands sans changement de pneus)
        for (const [n, l] of lines(d.Lines)) {
          if (!l?.Stints || typeof l.Stints !== 'object') continue;
          const m = stints.get(n) || {};
          for (const [i, v] of lines(l.Stints)) if (v && typeof v === 'object') m[i] = { ...(m[i] || {}), ...v };
          stints.set(n, m);
        }
        break;
      case 'TimingData': {
        if (d.SessionPart !== undefined) part = Number(d.SessionPart) || part;
        for (const [n, l] of lines(d.Lines)) {
          if (!l || typeof l !== 'object') continue;
          if (l.InPit === true && !inPit.get(n)) {
            inPit.set(n, true);
            const p = pos.get(n);
            const pass = passes.get(n) || 0;
            passes.set(n, pass + 1);
            if (kind === 'race' && started && p && p <= 5 && !retired.has(n)) {
              add(e.off, 'pit', en ? `${tla(n)} pits (P${p})` : `Arrêt de ${tla(n)} (P${p})`, [tla(n)]);
              out[out.length - 1].pass = { n, i: pass };
            }
          } else if (l.InPit === false) inPit.set(n, false);
          // Voitures garées après l'arrivée : pas des abandons
          if ((l.Retired === true || (l.Stopped === true && kind === 'race')) && !retired.has(n) && started && !finished) {
            retired.add(n);
            add(e.off, 'retire', l.Retired ? (en ? `${tla(n)} retires` : `Abandon de ${tla(n)}`) : (en ? `${tla(n)} stops on track` : `${tla(n)} s'arrête en piste`), [tla(n)]);
          }
          if (l.LastLapTime?.OverallFastest && l.LastLapTime?.Value && kind === 'race') fastest = { off: e.off, n, time: l.LastLapTime.Value, lap };
          if (l.Position === undefined) continue;
          const p = Number(l.Position);
          const before = pos.get(n);
          pos.set(n, p);
          if (!started || !p || before === p) continue;
          if (p === 1 && leader !== n) {
            const prev = leader;
            leader = n;
            // Qualifications : seulement la bataille pour la pole (Q3) ; essais : meilleur temps
            // final seulement (à la fin de la séance)
            if (prev && e.off - startOff > 5000 && (kind === 'race' || (kind === 'quali' && part >= 3))) {
              const why = kind === 'race' && inPit.get(prev) ? (en ? ` (${tla(prev)} pitted)` : ` (arrêt de ${tla(prev)})`) : '';
              add(e.off, 'lead', kind === 'race' ? (en ? `${tla(n)} takes the lead from ${tla(prev)}${why}` : `${tla(n)} prend la tête devant ${tla(prev)}${why}`)
                : en ? `${tla(n)} goes top (${kind === 'quali' ? `Q${part || 1}` : 'fastest time'})` : `${tla(n)} passe en tête (${kind === 'quali' ? `Q${part || 1}` : 'meilleur temps'})`, [tla(n), tla(prev)]);
            }
          } else if (kind === 'race' && p <= 3 && before && before > p && p > 1 && lap > 1 && !inPit.get(n)) {
            // Gain d'une place sur le podium, hors arrêts au stand des autres
            const passed = [...pos].find(([m, q]) => m !== n && q === p + 1);
            if (passed && !inPit.get(passed[0])) add(e.off, 'overtake', en ? `${tla(n)} passes ${tla(passed[0])} for P${p}` : `${tla(n)} passe ${tla(passed[0])} pour la P${p}`, [tla(n), tla(passed[0])]);
          }
        }
        break;
      }
      case 'RaceControlMessages':
        for (const m of messages(d)) {
          const msg = String(m?.Message || '');
          if (/^FIA STEWARDS:.*PENALTY FOR/.test(msg) && !/NO FURTHER|REVIEWED|PENALTY SERVED/.test(msg)) {
            const p = penaltyText(msg, en);
            if (p) add(e.off, 'penalty', `${tlas(msg).join(', ')}${en ? ':' : ' :'} ${p.what}${p.reason ? ` (${p.reason})` : ''}`, tlas(msg));
          } else if (/INCIDENT INVOLVING CARS? .* NOTED/.test(msg) && !/^(FIA STEWARDS|UPDATE)/.test(msg) && /COLLISION|TURN \d+ INCIDENT/.test(msg) && tlas(msg).length) {
            const turn = msg.match(/^TURN (\d+)/)?.[1];
            add(e.off, 'incident', en ? `Incident${turn ? ` at turn ${turn}` : ''}: ${tlas(msg).join(', ')}` : `Incident${turn ? ` au virage ${turn}` : ''} : ${tlas(msg).join(', ')}`, tlas(msg));
          }
        }
        break;
      default:
    }
  }
  if (fastest) out.push({ off: fastest.off, kind: 'fastest', text: en ? `Fastest race lap: ${tla(fastest.n)} in ${fastest.time}` : `Meilleur tour de la course : ${tla(fastest.n)} en ${fastest.time}`, who: [tla(fastest.n)], lap: fastest.lap });
  // Passage par les stands sans changement de pneus (voiture de sécurité, drive-through) : pas un arrêt
  const stintArr = (n) => Object.keys(stints.get(n) || {}).sort((a, b) => a - b).map((k) => stints.get(n)[k]);
  for (let i = out.length - 1; i >= 0; i--) {
    const pz = out[i].pass;
    if (pz && !passIsRealStop(stintArr(pz.n), pz.i)) out.splice(i, 1);
    else delete out[i].pass;
  }
  // Doublons rapprochés (même type et mêmes pilotes à moins de 20 s) écartés ; arrêts de
  // plusieurs pilotes en moins de 2 min (sous voiture de sécurité) regroupés ; ordre chronologique
  const seen = [];
  const res = [];
  for (const m of out.sort((a, b) => a.off - b.off)) {
    if (seen.some((x) => x.kind === m.kind && x.text === m.text && m.off - x.off < 20000)) continue;
    seen.push(m);
    const last = [...res].reverse().find((x) => x.kind === 'pit');
    if (m.kind === 'pit' && last && m.off - last.lastOff < 120000) {
      last.who.push(...m.who);
      last.lastOff = m.off;
      last.text = en ? `Pit stops: ${last.who.join(', ')}` : `Arrêts de ${last.who.join(', ')}`;
      continue;
    }
    res.push(m.kind === 'pit' ? { ...m, who: [...m.who], lastOff: m.off } : m);
  }
  return res.map(({ lastOff, ...m }) => m).slice(0, 120);
}
