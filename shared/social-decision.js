// Post « Décision des commissaires » (mode créateur) : sanctions d'une séance, d'après les documents de décision
// de la FIA (PDF lus par le Studio : pilote, écurie, séance, faits, sanction, motifs) et, à défaut, d'après les
// messages de la direction de course. Sanction et motif traduits en français ; fonctions pures (testées).
import { postData } from './social.js';
import { portraitUrl } from './portraits.js';
import { analyzeStewards } from './stewards.js';
import { reasonFr, REASONS_FR } from './rcm-fr.js';
import { lines } from './fia-tech.js';

const list = (o) => (!o ? [] : Array.isArray(o) ? o : Object.keys(o).sort((a, b) => a - b).map((k) => o[k]));
const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

// ---------- Document de décision de la FIA ----------
// Rubriques du document : intitulé dans la colonne de gauche, texte à droite (sur une ou plusieurs lignes)
const FIELDS = [
  ['driver', /^(?:No\s*\/\s*Driver|Car\s*\/\s*Driver|Driver)$/i], ['team', /^Competitor$/i], ['time', /^Time$/i], ['session', /^Session$/i],
  ['fact', /^Facts?$/i], ['infringement', /^(?:Infringement|Offence)$/i], ['decision', /^(?:Decision|Penalty|Sanction)$/i], ['reason', /^Reasons?$/i],
];
// Fin des rubriques : rappel du droit d'appel, signatures
const END = /^(?:Competitors are reminded|Decisions of the Stewards are taken|The Stewards$)/i;

// Pages du PDF (texte positionné { x, y, s }) -> { num, name, team, session, time, fact, infringement, decision, reason }
export function parseDecisionDoc(pages) {
  const out = {};
  let cur = null;
  let done = false;
  for (const items of pages || []) {
    for (const row of lines(items)) {
      if (done) break;
      const first = row.items[0];
      const field = first.x < 100 && FIELDS.find(([, re]) => re.test(first.s.trim()));
      if (field) { cur = field[0]; out[cur] = row.items.slice(1).map((i) => i.s).join(' ').trim(); continue; }
      if (!cur) continue;
      if (END.test(row.text)) { done = true; break; }
      if (first.x < 100) { cur = null; continue; }   // autre texte de la colonne de gauche : fin de la rubrique
      out[cur] = `${out[cur]} ${row.text}`.trim();
    }
  }
  const m = /^(\d{1,2})\s*[-–]\s*(.+)$/.exec(out.driver || '');
  if (!m || !out.decision) return null;
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  return { num: String(Number(m[1])), name: clean(m[2]), team: clean(out.team), session: clean(out.session), time: clean(out.time), fact: clean(out.fact), infringement: clean(out.infringement), decision: clean(out.decision), reason: clean(out.reason) };
}

// ---------- Sanction ----------
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50 };
const N = `(\\d+|${Object.keys(WORDS).join('|')})`;
const re = (s) => new RegExp(s.replace(/N/g, N), 'i');
const num = (w) => (/^\d+$/.test(w) ? Number(w) : WORDS[String(w).toLowerCase()] ?? null);
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
// 7500 -> « 7 500 » (espace insécable)
const euros = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Texte de la sanction (rubrique « Decision » d'un document, ou début d'un message de la direction de course :
// « 5 SECOND TIME PENALTY ») -> { kind, band (bande du visuel), short (texte), next, points, total, fine }
export function penaltyFr(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  let m;
  // Points de pénalité sur la licence : « One penalty point is imposed, making a total of 1 », « 2 penalty points (Total 6 points… »
  const pm = re('\\bN penalty points?').exec(t);
  const total = /total (?:of )?(\d+)/i.exec(t);
  const fine = /fined? (?:of )?(?:€|EUR ?)\s?([\d,. ]*\d)/i.exec(t) || /€\s?([\d,.]*\d)/.exec(t);
  const amount = fine ? Number(fine[1].replace(/[,. ]/g, '')) : null;
  const extra = { next: /next (?:race|event)/i.test(t), points: pm ? num(pm[1]) : null, total: pm && total ? Number(total[1]) : null, fine: amount };
  const out = (kind, band, short) => ({ kind, band, short, ...extra, ...(kind === 'fine' ? { fine: null } : {}) });
  if (/disqualif/i.test(t)) return out('dsq', 'DISQUALIFICATION', 'disqualification');
  if ((m = re('N[- ]seconds? stop[\\s/-]*(?:and[\\s-]*)?go').exec(t))) return out('stopgo', `STOP & GO DE ${num(m[1])} SECONDES`, `stop & go de ${num(m[1])} secondes`);
  if (/stop[\s/-]*(?:and[\s-]*)?go/i.test(t)) return out('stopgo', 'STOP & GO', 'stop & go');
  if (/drive[\s-]*through/i.test(t)) return out('drive', 'DRIVE-THROUGH', 'drive-through');
  if ((m = re('N[- ]seconds?(?: time)? penalty|time penalty of N seconds?').exec(t))) { const n = num(m[1] || m[2]); return out('time', `${plural(n, 'SECONDE').toUpperCase()} DE PÉNALITÉ`, `${plural(n, 'seconde')} de pénalité`); }
  if ((m = re('(?:drop|demotion) of N grid (?:positions?|places?)|N[- ]places? grid penalty|N grid (?:positions?|places?)').exec(t))) {
    const n = num(m[1] || m[2] || m[3]);
    return out('grid', `${plural(n, 'PLACE').toUpperCase()} DE PÉNALITÉ SUR LA GRILLE`, `${plural(n, 'place')} de pénalité sur la grille`);
  }
  if (/start(?:s|ing)? (?:the race )?from the pit ?lane|pit ?lane start/i.test(t)) return out('pitlane', 'DÉPART DES STANDS', 'départ des stands');
  if (/back of the (?:starting )?grid/i.test(t)) return out('back', 'DÉPART EN FOND DE GRILLE', 'départ en fond de grille');
  if (/(?:lap )?times? deleted|delet\w* (?:the |all |his )?(?:lap )?times?/i.test(t)) return out('deleted', 'TEMPS SUPPRIMÉ', 'temps supprimé');
  if (/reprimand/i.test(t)) return out('reprimand', 'RÉPRIMANDE', 'réprimande');
  if (/black and white flag/i.test(t)) return out('warning', 'DRAPEAU NOIR ET BLANC', 'drapeau noir et blanc');
  if (/\bwarning\b/i.test(t)) return out('warning', 'AVERTISSEMENT', 'avertissement');
  if (amount) return out('fine', `AMENDE DE ${euros(amount)} €`, `amende de ${euros(amount)} €`);
  if (/no further action|no action/i.test(t)) return out('nfa', 'AUCUNE SANCTION', 'aucune sanction');
  return out('other', 'PÉNALITÉ', 'pénalité');
}

// ---------- Motif (rubrique « Fact », ou motif d'un message de la direction de course) ----------
// Formules habituelles des commissaires ; texte libre : null (traduit par le serveur, ou laissé en anglais)
const at = (turn) => (turn ? ` au virage ${turn}` : '');
const FACTS = [
  [/^(alleged )?causing a collision(?: with car (\d+))?(?: (?:at|in) turn (\d+))?$/i, (m) => `${m[1] ? 'Accrochage présumé' : 'Accrochage provoqué'}${m[2] ? ` avec la voiture ${m[2]}` : ''}${at(m[3])}.`],
  [/^car (\d+) left the track and gained an? (lasting )?advantage(?: (?:at|in) turn (\d+))?$/i, (m) => `La voiture ${m[1]} est sortie de la piste${at(m[3])} et en a tiré un avantage${m[2] ? ' durable' : ''}.`],
  [/^(alleged )?leaving the track and gaining an? (lasting )?advantage(?: (?:at|in) turn (\d+))?$/i, (m) => `${m[1] ? 'Avantage présumé pris' : 'Avantage pris'} hors de la piste${at(m[3])}${m[2] ? ' (avantage durable)' : ''}.`],
  [/^pit lane speeding\s*[-–:]?\s*([\d.,]+)\s*km\/h$/i, (m) => `Excès de vitesse dans la voie des stands : ${m[1].replace('.', ',')} km/h.`],
  [/^(?:speeding in the pit lane|pit lane speeding)$/i, () => 'Excès de vitesse dans la voie des stands.'],
  [/^car (\d+) impeded car (\d+)(?: (?:at|in) turn (\d+))?$/i, (m) => `La voiture ${m[1]} a gêné la voiture ${m[2]}${at(m[3])}.`],
  [/^(alleged )?impeding (?:of )?car (\d+)(?: (?:at|in) turn (\d+))?$/i, (m) => `${m[1] ? 'Gêne présumée' : 'Gêne'} de la voiture ${m[2]}${at(m[3])}.`],
  [/^(alleged )?(?:unsafe release|released in an unsafe condition)$/i, (m) => `${m[1] ? 'Sortie des stands dangereuse présumée' : 'Sortie des stands dangereuse'}.`],
  [/^(alleged )?(?:failure|failing) to slow (?:sufficiently )?for (?:double )?yellow flags?(?: (?:at|in) turn (\d+))?$/i, (m) => `${m[1] ? 'Ralentissement insuffisant présumé' : 'Ralentissement insuffisant'} sous drapeau jaune${at(m[2])}.`],
  [/^(alleged )?overtaking under (?:double )?yellow flags?(?: (?:at|in) turn (\d+))?$/i, (m) => `${m[1] ? 'Dépassement présumé' : 'Dépassement'} sous drapeau jaune${at(m[2])}.`],
  [/^(alleged )?forcing (?:another driver|car (\d+)) off the track(?: (?:at|in) turn (\d+))?$/i, (m) => `${m[2] ? `Voiture ${m[2]} poussée` : 'Pilote poussé'} hors de la piste${at(m[3])}${m[1] ? ' (présumé)' : ''}.`],
  [/^(alleged )?(?:failure|failing) to follow (?:the )?race director'?s? instructions$/i, (m) => `${m[1] ? 'Non-respect présumé' : 'Non-respect'} des consignes du directeur de course.`],
  [/^(alleged )?track limits(?: (?:at|in) turn (\d+))?$/i, (m) => `Limites de piste${at(m[2])}${m[1] ? ' (présumé)' : ''}.`],
];
export function factFr(fact) {
  const t = String(fact || '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  if (!t) return null;
  for (const [rx, fr] of FACTS) { const m = rx.exec(t); if (m) return fr(m); }
  // Motif court en capitales des messages de la direction de course (« CAUSING A COLLISION »)
  const r = REASONS_FR[t.toUpperCase()];
  return r ? `${cap(r)}.` : null;
}

// Virages cités (« turn 12 … turn 14 », « virage 4 ») : { from, to }, null sans virage
export function turnsOf(text) {
  const n = [...String(text || '').matchAll(/\b(?:turns?|virages?)\s+(\d{1,2})(?:\s*(?:and|et|&|-|to|à)\s*(\d{1,2}))?/gi)]
    .flatMap((m) => [m[1], m[2]]).filter(Boolean).map(Number).filter((x) => x > 0 && x <= 30);
  return n.length ? { from: Math.min(...n), to: Math.max(...n) } : null;
}

// ---------- Décisions d'une séance ----------
// Séance du document (« Free Practice 2 ») et de l'état (« Practice 2 ») comparées
const sessionKey = (s) => String(s || '').toLowerCase().replace(/^free /, '').replace('sprint shootout', 'sprint qualifying').replace(/\s+/g, ' ').trim();
export const sameSession = (a, b) => !a || !b || sessionKey(a) === sessionKey(b);

// Documents lus : [{ doc: { title, url, published }, num (numéro du document), p (parseDecisionDoc) }] -> décisions de
// la séance, une par sanction : même faits et même sanction pour plusieurs pilotes (deux documents) -> une seule
export function docDecisions(entries, sessionName = '') {
  const out = [];
  for (const { doc, num: n, p } of [...(entries || [])].sort((a, b) => (a.num ?? 0) - (b.num ?? 0))) {
    if (!p || !sameSession(p.session, sessionName)) continue;
    const penalty = penaltyFr(p.decision);
    const key = `${p.fact.toLowerCase()}|${penalty.band}`;
    let g = out.find((x) => x.key === key);
    if (!g) {
      g = { key, id: `fia${n ?? out.length}`, source: 'fia', penalty, fact: p.fact, factFr: factFr(p.fact), turns: turnsOf(p.fact), session: p.session, drivers: [], docs: [], t: doc?.published || 0 };
      out.push(g);
    }
    if (!g.drivers.some((x) => x.num === p.num)) g.drivers.push({ num: p.num, name: p.name, team: p.team, points: penalty.points, total: penalty.total });
    if (n != null) g.docs.push(n);
    g.t = Math.max(g.t, doc?.published || 0);
  }
  return out.map(({ key, ...g }) => ({ ...g, docs: g.docs.sort((a, b) => a - b) })).sort((a, b) => b.t - a.t);
}

// Messages de la direction de course (« FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 3 (VER) - CAUSING A COLLISION ») ->
// décisions, plus récentes d'abord (pénalités purgées et limites de piste comptées une fois, par analyzeStewards)
export function rcmDecisions(messages) {
  const { decisions, incidents } = analyzeStewards(list(messages));
  return decisions.filter((x) => x.cars.length).map((x, i) => {
    const inc = incidents.find((n) => n.id === x.incident);
    const head = x.text.replace(/^(?:(?:FIA STEWARDS|UPDATE):\s*)+/, '').split(/ FOR CARS? /)[0];
    const reason = x.reason || inc?.reason || '';
    const where = inc?.location?.startsWith('Virage') ? ` au ${inc.location.toLowerCase()}` : '';
    return { id: `rc${i}`, source: 'rcm', penalty: penaltyFr(head), fact: reason, factFr: reason ? `${cap(reasonFr(reason))}${where}.` : '', turns: turnsOf(inc?.location || ''), drivers: x.cars.map((c) => ({ num: c.num, tla: c.tla })), docs: [], lap: x.lap, t: x.t || 0 };
  }).reverse();
}

// Documents d'abord ; un message de la direction de course déjà couvert par un document (même pilote, même sanction) écarté
export function mergeDecisions(docs, rcm) {
  const covered = (r) => docs.some((d) => d.penalty.kind === r.penalty.kind && d.drivers.some((x) => x.num === r.drivers[0]?.num));
  return [...docs, ...rcm.filter((r) => !covered(r))];
}

// Données du visuel et des textes : pilotes de la séance (portrait, couleur de l'écurie) ; motif retouché à la main
export function decisionData(state, dec, { motif = null } = {}) {
  const d = postData(state);
  const dl = state?.DriverList || {};
  const rows = (dec?.drivers || []).map((x) => {
    const r = d.rows.find((y) => y.num === x.num);
    if (r) return r;
    const e = dl[x.num] || {};
    const [first = '', ...rest] = String(x.name || '').split(' ');
    return { num: x.num, tla: e.Tla || x.tla || x.num, first: e.FirstName || first, last: e.LastName || rest.join(' ') || e.Tla || x.tla || x.num, team: e.TeamName || x.team || '', color: e.TeamColour ? `#${String(e.TeamColour).replace('#', '')}` : '#8b95a8', headshot: portraitUrl(e.Tla || x.tla, true) || e.HeadshotUrl || null };
  });
  return { ...d, post: 'decision', final: true, decision: dec ? { ...dec, motif: (motif ?? (dec.factFr || dec.fact)) || '' } : null, rows };
}
