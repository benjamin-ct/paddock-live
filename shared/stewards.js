// Analyse des messages de la direction de course :
// - suivi des enquêtes des commissaires (notée → sous enquête → après la course → décision),
// - suivi des limites de piste (tours / temps supprimés, drapeau noir et blanc, pénalités).
// Fonctions pures, partagées (tests côté serveur, affichage côté navigateur).
import { parseUtc } from './f1.js';

const CAR_RE = /(\d{1,2}) \(([A-Z]{3})\)/g;

function carsIn(text) {
  const out = [];
  for (const m of text.matchAll(CAR_RE)) if (!out.some((c) => c.num === m[1])) out.push({ num: m[1], tla: m[2] });
  return out;
}

// "(15:12::25)" -> "15:12:25"
function incidentTime(text) {
  const m = /\((\d{1,2}):+(\d{2}):+(\d{2})\)\s*$/.exec(text);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}:${m[3]}` : null;
}

const STATUS_RULES = [
  [/NO FURTHER (?:INVESTIGATION|ACTION)/, 'nfa'],
  [/WILL BE INVESTIGATED AFTER THE (?:RACE|SESSION)/, 'after'],
  [/UNDER INVESTIGATION/, 'investigating'],
  [/\bNOTED\b/, 'noted'],
];

export const STATUS_LABEL = {
  noted: 'Incident noté',
  investigating: 'Sous enquête',
  after: 'Enquête après la course',
  nfa: 'Pas d\'action',
  penalty: 'Pénalité',
  warning: 'Avertissement',
  reprimand: 'Réprimande',
};

function decisionOf(text) {
  let m;
  if ((m = /(\d+) SECOND TIME PENALTY/.exec(text))) return { kind: 'penalty', label: `${m[1]} s de pénalité` };
  if (/DRIVE THROUGH/.test(text)) return { kind: 'penalty', label: 'Drive-through' };
  if (/STOP[\s/-]*(?:AND[\s-]*)?GO/.test(text)) return { kind: 'penalty', label: 'Stop & go' };
  if ((m = /(\d+) PLACE GRID PENALTY/.exec(text))) return { kind: 'penalty', label: `${m[1]} places de pénalité sur la grille` };
  if (/DISQUALIF/.test(text)) return { kind: 'penalty', label: 'Disqualification' };
  if (/BLACK AND WHITE FLAG/.test(text)) return { kind: 'warning', label: 'Drapeau noir et blanc' };
  if (/REPRIMAND/.test(text)) return { kind: 'reprimand', label: 'Réprimande' };
  if (/\bWARNING FOR\b/.test(text)) return { kind: 'warning', label: 'Avertissement' };
  if (/\bPENALTY\b/.test(text)) return { kind: 'penalty', label: 'Pénalité' };
  return null;
}

function reasonOf(text) {
  // Motif après le tiret : "… NOTED - CAUSING A COLLISION (16:11:31)"
  const m = /\s[-–]\s(.+?)(?:\s*\(\d{1,2}:+\d{2}:+\d{2}\))?\s*$/.exec(text);
  if (!m) return null;
  const r = m[1].trim();
  return /^\d/.test(r) ? null : r;
}

function locationOf(text) {
  const m = /^(?:TURN (\d+)|(Q\d|SQ\d))\s+INCIDENT/.exec(text);
  if (!m) return null;
  return m[1] ? `Virage ${m[1]}` : m[2];
}

function sameCars(a, b) {
  return a.length === b.length && a.every((c) => b.some((d) => d.num === c.num));
}

function overlap(a, b) {
  return a.some((c) => b.some((d) => d.num === c.num));
}

/**
 * @param messages liste des messages RaceControlMessages (ordre chronologique)
 * @returns {{incidents: object[], trackLimits: object[], decisions: object[]}}
 */
export function analyzeStewards(messages) {
  const incidents = [];
  const tl = new Map(); // num -> suivi limites de piste
  const decisions = [];

  const tlOf = (num, tla) => {
    if (!tl.has(num)) tl.set(num, { num, tla, deletions: [], otherDeletions: [], blackWhite: null, penalties: [] });
    return tl.get(num);
  };

  for (const msg of messages) {
    if (!msg || !msg.Message) continue;
    const raw = String(msg.Message).trim();
    const text = raw.replace(/^(?:FIA STEWARDS:|UPDATE:)\s*/g, '').replace(/^(?:FIA STEWARDS:|UPDATE:)\s*/, '');
    const t = parseUtc(msg.Utc);
    const lap = msg.Lap ?? null;
    let m;

    // Tour / temps supprimé
    if ((m = /^CAR (\d+) \(([A-Z]{3})\) (?:TIME ([\d:.]+)|LAP) DELETED - (.+?) AT TURN (\d+) LAP (\d+)(.*)$/.exec(text))) {
      const entry = { t, lap: Number(m[6]), turn: Number(m[5]), time: m[3] || null, reason: m[4], pit: /\(PIT\)/.test(m[7]) };
      const d = tlOf(m[1], m[2]);
      if (/TRACK LIMITS/.test(m[4])) d.deletions.push(entry);
      else d.otherDeletions.push(entry);
      continue;
    }

    // Drapeau noir et blanc pour limites de piste (l'autre, disciplinaire, est traité comme une décision)
    if ((m = /BLACK AND WHITE FLAG FOR CAR (\d+) \(([A-Z]{3})\)/.exec(text)) && (/TRACK LIMITS/.test(text) || !incidentTime(text))) {
      tlOf(m[1], m[2]).blackWhite = { t, lap };
      continue;
    }

    // Décision des commissaires (pénalité, avertissement, réprimande)
    const dec = /INCIDENT INVOLVING/.test(text) ? null : decisionOf(text);
    if (dec) {
      const cars = carsIn(text);
      const served = /PENALTY SERVED/.test(text);
      const time = incidentTime(text);
      const reason = reasonOf(text);
      const d = { t, lap, cars, ...dec, served, reason, time, text: raw };
      if (served) {
        const prev = [...decisions].reverse().find((x) => !x.served && overlap(x.cars, cars) && x.label === dec.label);
        if (prev) { prev.servedAt = t; continue; }
      }
      decisions.push(d);
      if (reason && /TRACK LIMITS/.test(reason)) for (const c of cars) tlOf(c.num, c.tla).penalties.push(d);
      // Rattachement à l'enquête correspondante
      const inc = [...incidents].reverse().find((i) => overlap(i.cars, cars) && (time ? i.time === time : !['nfa'].includes(i.status)));
      if (inc) {
        inc.decisions.push(d);
        inc.status = dec.kind;
        inc.updated = t;
        inc.history.push({ t, lap, status: dec.kind, label: dec.label + (served ? ' (purgée)' : ''), cars, text: raw });
        d.incident = inc.id;
      }
      continue;
    }

    // Enquêtes
    if (/INCIDENT INVOLVING/.test(text)) {
      const rule = STATUS_RULES.find(([re]) => re.test(text));
      if (!rule) continue;
      const status = rule[1];
      const cars = carsIn(text);
      const time = incidentTime(text);
      const reason = reasonOf(text);
      const location = locationOf(text);
      const compatible = (a, b) => a === null || b === null || a === b;
      let inc = [...incidents].reverse().find((i) => {
        if (time && i.time) return i.time === time && overlap(i.cars, cars);
        // Sans heure de référence : même pilotes, même lieu, même motif, et enquête encore ouverte.
        // Un nouveau « NOTED » ne complète qu'un incident lui-même seulement noté (message « UPDATE »).
        if (!sameCars(i.cars, cars) || !compatible(location, i.location) || !compatible(reason, i.reason)) return false;
        return status === 'noted' ? i.status === 'noted' : isOpen(i);
      });
      if (!inc) {
        inc = { id: incidents.length + 1, cars, time, reason, location, status, history: [], decisions: [], created: t, updated: t, lap };
        incidents.push(inc);
      }
      if (cars.length >= inc.cars.length) inc.cars = cars; // les mises à jour peuvent ajouter des pilotes
      inc.time ||= time;
      inc.reason ||= reason;
      inc.location ||= location;
      // Une décision déjà rendue n'est pas écrasée par un message plus ancien.
      if (!['penalty', 'warning', 'reprimand'].includes(inc.status) || status === 'nfa') inc.status = status;
      inc.updated = t;
      inc.history.push({ t, lap, status, label: STATUS_LABEL[status], text: raw });
    }
  }

  const trackLimits = [...tl.values()].sort((a, b) => b.deletions.length - a.deletions.length || a.num - b.num);
  return { incidents, trackLimits, decisions };
}

// Pastilles de la carte, par virage : tours / temps supprimés pour limites de piste (et pilotes concernés), puis
// événements récents au virage (incident, piste glissante, commissaires ou dépanneuse en piste) des `recent` dernières
// ms avant `now`. Messages sans numéro de virage ignorés.
// -> [{ turn, limits, drivers: [{ num, tla, n }], events: [{ kind: 'incident'|'slippery'|'marshals'|'recovery', t, cars }] }]
const TURN_EVENTS = { 'TRACK SURFACE SLIPPERY': 'slippery', 'MARSHALS ON TRACK': 'marshals', 'RECOVERY VEHICLE ON TRACK': 'recovery' };
export function turnMarks(messages, now = Infinity, recent = 5 * 60e3) {
  const by = new Map();
  const at = (turn) => { if (!by.has(turn)) by.set(turn, { turn, limits: 0, drivers: [], events: [] }); return by.get(turn); };
  const fresh = (t) => Number.isFinite(t) && t <= now && now - t <= recent;
  const { incidents, trackLimits } = analyzeStewards(messages);
  for (const d of trackLimits) {
    for (const x of d.deletions) {
      if (x.t > now) continue;
      const m = at(x.turn);
      m.limits++;
      const drv = m.drivers.find((c) => c.num === d.num) || m.drivers[m.drivers.push({ num: d.num, tla: d.tla, n: 0 }) - 1];
      drv.n++;
    }
  }
  for (const inc of incidents) {
    const turn = /^Virage (\d+)$/.exec(inc.location || '')?.[1];
    if (turn && fresh(inc.created)) at(Number(turn)).events.push({ kind: 'incident', t: inc.created, cars: inc.cars });
  }
  for (const msg of messages) {
    const m = /^(TRACK SURFACE SLIPPERY|MARSHALS ON TRACK|RECOVERY VEHICLE ON TRACK) AT TURN (\d+)$/.exec(String(msg?.Message || '').trim().replace(/\s+/g, ' '));
    const t = parseUtc(msg?.Utc);
    if (!m || !fresh(t)) continue;
    const ev = at(Number(m[2])).events, kind = TURN_EVENTS[m[1]];
    const prev = ev.find((e) => e.kind === kind);
    if (prev) prev.t = Math.max(prev.t, t);
    else ev.push({ kind, t, cars: [] });
  }
  for (const m of by.values()) m.drivers.sort((a, b) => b.n - a.n || a.num - b.num);
  return [...by.values()].sort((a, b) => a.turn - b.turn);
}

export function isOpen(incident) {
  return incident.status === 'noted' || incident.status === 'investigating' || incident.status === 'after';
}

// ---- Documents officiels de la FIA ----
const DOC_TYPES = /^(Decision|Infringement|Offence|Summons)\b/i;
const DOC_STOP = new Set(['car', 'cars', 'with', 'incident', 'alleged', 'involving', 'driver', 'drivers', 'into', 'from', 'during', 'the', 'and']);

/** "Doc 67 - Decision - Car 77 - Turn 15 Incident" -> {num, type, cars, subject} */
export function parseFiaDoc(doc) {
  const title = String(doc?.title || '');
  const m = /^Doc\s+(\d+)\s*[-–]\s*(.*)$/i.exec(title);
  const rest = m ? m[2] : title;
  const tm = DOC_TYPES.exec(rest);
  const cars = [];
  for (const cm of rest.matchAll(/\bCars?\s+((?:\d+(?:\s*(?:,|and|&)\s*(?=\d))?)+)/gi)) {
    for (const n of cm[1].match(/\d+/g)) { const num = String(Number(n)); if (!cars.includes(num)) cars.push(num); }
  }
  return {
    num: m ? Number(m[1]) : null,
    type: tm ? tm[1].toLowerCase() : null,
    cars,
    subject: rest.replace(DOC_TYPES, '').replace(/^\s*[-–]\s*/, '').trim(),
  };
}

function words(text) {
  return new Set(String(text || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !DOC_STOP.has(w)));
}

function turnOf(text) {
  const m = /\bturns?\s+(\d+)/i.exec(String(text || ''));
  return m ? Number(m[1]) : null;
}

// Proximité entre un document et un message : mots du motif en commun, même virage.
function affinity(doc, text) {
  const dw = words(doc.info.subject);
  let s = 0;
  for (const w of words(text)) if (dw.has(w) || [...dw].some((x) => x.slice(0, 6) === w.slice(0, 6))) s++;
  const a = turnOf(doc.info.subject), b = turnOf(text);
  if (a !== null && b !== null) s += a === b ? 2 : -2;
  return s;
}

function best(cands, score) {
  let out = null, bs = -Infinity;
  for (const c of cands) {
    const s = score(c);
    if (s > bs) { bs = s; out = c; }
  }
  return out;
}

/**
 * Rattache les documents FIA aux décisions (doc de décision / d'infraction) et aux enquêtes
 * (convocation, décision « pas d'action »). En rediffusion, un document publié après `now`
 * n'est montré que s'il ne dévoile rien : décision déjà annoncée, convocation, enquête close.
 * @param data résultat d'analyzeStewards (modifié : decision.doc, incident.docs)
 * @param docs [{title, url, published}]
 */
export function linkFiaDocs(data, docs, now = Infinity) {
  const list = (docs || []).filter((d) => d && d.url && Number.isFinite(d.published))
    .map((d) => ({ ...d, info: parseFiaDoc(d) })).filter((d) => d.info.type && d.info.cars.length)
    .sort((a, b) => a.published - b.published);
  const used = new Set();
  const HOUR = 3600e3;

  for (const inc of data.incidents) inc.docs = [];
  for (const d of data.decisions) {
    d.doc = null;
    if (!d.cars.length) continue;
    const inc = d.incident ? data.incidents.find((i) => i.id === d.incident) : null;
    const text = [d.reason, inc?.reason, inc?.location?.replace('Virage', 'Turn')].filter(Boolean).join(' ');
    const cands = list.filter((x) => !used.has(x) && x.info.type !== 'summons' && x.info.cars[0] === d.cars[0].num
      && x.published >= d.t - 30 * 60e3 && x.published <= d.t + 12 * HOUR);
    const doc = best(cands, (x) => affinity(x, text) * 10 - Math.abs(x.published - d.t) / HOUR);
    if (doc) { used.add(doc); d.doc = { title: doc.title, url: doc.url, published: doc.published, num: doc.info.num }; }
  }

  for (const inc of data.incidents) {
    const nums = inc.cars.map((c) => c.num);
    const text = [inc.reason, inc.location?.replace('Virage', 'Turn')].filter(Boolean).join(' ');
    const near = (x) => !used.has(x) && (x.info.type === 'summons' ? x.info.cars.some((n) => nums.includes(n)) : nums.includes(x.info.cars[0])) && x.published >= inc.created - 10 * 60e3 && x.published <= inc.updated + 24 * HOUR;
    const summons = best(list.filter((x) => near(x) && x.info.type === 'summons'), (x) => affinity(x, text) * 10 - Math.abs(x.published - inc.created) / HOUR);
    if (summons) { used.add(summons); inc.docs.push({ kind: 'summons', title: summons.title, url: summons.url, published: summons.published, num: summons.info.num }); }
    // Décision sans sanction (ou avant le message de la direction de course)
    if (!inc.decisions.some((d) => d.doc)) {
      const dec = best(list.filter((x) => near(x) && x.info.type !== 'summons' && (affinity(x, text) > 0 || summons)
        && (x.published <= now || !isOpen(inc))),
        (x) => affinity(x, text) * 10 - Math.abs(x.published - inc.updated) / HOUR);
      if (dec) { used.add(dec); inc.docs.push({ kind: 'decision', title: dec.title, url: dec.url, published: dec.published, num: dec.info.num }); }
    }
  }
  return data;
}

// Document « … Deleted Lap Times » de la session (limites de piste).
export function deletedLapsDoc(docs, sessionName, now = Infinity) {
  const name = String(sessionName || '').toLowerCase();
  const want = /sprint (?:qualifying|shootout)/.test(name) ? /sprint (?:qualifying|shootout)/i
    : name === 'sprint' ? /^(?:doc \d+ - )?(?:infringement - )?sprint deleted/i
      : name === 'qualifying' ? /(?<!sprint )qualifying deleted/i
        : name === 'race' ? /race deleted/i
          : /practice (\d)/.test(name) ? new RegExp(`practice ${/practice (\d)/.exec(name)[1]} deleted`, 'i') : null;
  if (!want) return null;
  const cands = (docs || []).filter((d) => d?.url && /deleted lap times/i.test(d.title) && !/double yellow/i.test(d.title)
    && want.test(d.title) && (d.published ?? 0) <= now);
  return cands.sort((a, b) => b.published - a.published)[0] || null;
}
