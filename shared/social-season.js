// Posts de saison (mode créateur) : programme du week-end, « le saviez-vous » du circuit, notes des
// pilotes après la course, duels entre coéquipiers sur la saison, course tour par tour (graphique
// et vidéo animée) et récap de la semaine. Données de la saison (Jolpica, format de /api/season),
// records du circuit (archives F1) ; textes en français. Code pur, partagé par l'appli et la page web.
import { gpNameFr } from './summary.js';
import { driverRatings, qualiGaps, titleRace, placeForMaxPoints } from './season-calc.js';
import { cleanPace, lapsLedBy } from './race-laps.js';
import { raceStory } from './race-story.js';
import { hashtag, teamTag, BRAND_TAG, xLength } from './social.js';
import { circuitInfo, trackShape, flagColors } from './circuits-info.js';

const TZ = 'Europe/Paris';
const fmt = (t, o) => new Date(t).toLocaleString('fr-FR', { timeZone: TZ, ...o });
// « 1 novembre » -> « 1er novembre »
const fr1 = (s) => String(s).replace(/^1(?= )/, '1er');
const capFirst = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const dec = (v, n = 1) => (v == null ? '—' : Number(v).toFixed(n).replace('.', ','));
export const lapStr = (s) => (s ? `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}` : '—');

// Pays du calendrier (noms de l'API des résultats) -> code ISO des drapeaux
export const COUNTRY_ISO = {
  Australia: 'au', China: 'cn', Japan: 'jp', Bahrain: 'bh', 'Saudi Arabia': 'sa', USA: 'us', 'United States': 'us', Italy: 'it', Monaco: 'mc',
  Spain: 'es', Canada: 'ca', Austria: 'at', UK: 'gb', 'United Kingdom': 'gb', Belgium: 'be', Hungary: 'hu', Netherlands: 'nl', Azerbaijan: 'az',
  Singapore: 'sg', Mexico: 'mx', Brazil: 'br', Qatar: 'qa', UAE: 'ae', 'United Arab Emirates': 'ae', Portugal: 'pt', Turkey: 'tr', France: 'fr',
  Germany: 'de', Russia: 'ru', Argentina: 'ar', 'South Africa': 'za', Korea: 'kr', India: 'in', Malaysia: 'my', Vietnam: 'vn', Thailand: 'th', Morocco: 'ma',
};
// Couleurs des écuries (identifiant ou nom), à défaut de la liste des pilotes de la séance
const TEAM_COLORS = [
  [/racing_bulls|racing bulls|^rb\b|visa cash/i, '#6692FF'], [/red_bull|red bull/i, '#3671C6'], [/ferrari/i, '#E80020'], [/mercedes/i, '#27F4D2'],
  [/mclaren/i, '#FF8000'], [/aston/i, '#229971'], [/alpine/i, '#0093CC'], [/williams/i, '#64C4FF'], [/audi/i, '#F50537'],
  [/sauber|kick/i, '#52E252'], [/haas/i, '#B6BABD'], [/cadillac/i, '#C9A86A'],
];
export const teamColor = (idOrName, live = null) => live || TEAM_COLORS.find(([re]) => re.test(idOrName || ''))?.[1] || '#8b95a8';

const SESSION_FR = { EL1: 'Essais libres 1', EL2: 'Essais libres 2', EL3: 'Essais libres 3', 'Qualif. sprint': 'Qualifications sprint', Sprint: 'Course sprint', Qualifications: 'Qualifications', Course: 'Course' };

// Champs communs des posts d'un Grand Prix (en-tête des visuels, couverture)
function base(race, year, post, label) {
  const gpEn = race?.name || '';
  return {
    post, label, year, round: race?.round || null, gpEn, gp: gpEn ? gpNameFr(gpEn).replace(/^le /, '') : 'Grand Prix',
    circuit: race?.locality || race?.circuit || '', iso: COUNTRY_ISO[race?.country] || '', countryName: race?.country || '',
    date: race?.date ? fr1(fmt(Date.parse(race.date), { day: 'numeric', month: 'long', year: 'numeric' })) : '', final: true,
    sprint: !!race?.sprint, rows: [], facts: [], summary: { paragraphs: [] },
  };
}
const gpTagOf = (d) => hashtag(`${String(d.gpEn || '').replace(/ Grand Prix$/i, '')}GP`);
const tagsOf = (d, extra = []) => {
  const seen = new Set();
  return [BRAND_TAG, '#F1', '#Formula1', '#Formule1', d.gpEn ? gpTagOf(d) : '', d.year ? `#F1${d.year}` : '', ...extra]
    .filter((t) => t && t.length > 2 && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
};

// ---------- 1. Programme du week-end ----------
// race : manche de /api/season ; tyres : composés Pirelli ; forecast : [{ date: 'AAAA-MM-JJ', tmax, tmin, rain }]
export function weekendData(race, { year, tyres = null, forecast = null } = {}) {
  const d = base(race, year, 'weekend', 'Programme');
  d.sessions = (race.sessions || []).filter((s) => s.t).map((s) => {
    const t = Date.parse(s.t);
    return { label: SESSION_FR[s.label] || s.label, t, day: capFirst(fmt(t, { weekday: 'long' })), dayNum: fr1(fmt(t, { day: 'numeric', month: 'long' })), time: fmt(t, { hour: '2-digit', minute: '2-digit' }), main: /^(Course|Qualifications|Course sprint)$/.test(SESSION_FR[s.label] || s.label) };
  }).sort((a, b) => a.t - b.t);
  if (d.sessions.length) {
    const first = d.sessions[0].t, last = d.sessions.at(-1).t;
    const sameMonth = fmt(first, { month: 'long' }) === fmt(last, { month: 'long' });
    d.date = `${fr1(fmt(first, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'long' }))} au ${fr1(fmt(last, { day: 'numeric', month: 'long', year: 'numeric' }))}`;
  }
  d.tyres = tyres;
  // Météo prévue pour chaque jour de séance
  const days = [...new Set(d.sessions.map((s) => fmt(s.t, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-')))];
  d.forecast = (forecast || []).filter((f) => days.includes(f.date)).map((f) => ({ ...f, day: capFirst(fmt(Date.parse(`${f.date}T12:00:00Z`), { weekday: 'long' })) }));
  d.rows = d.sessions;
  return d;
}

// ---------- Race Week : annonce du Grand Prix en début de semaine ----------
// track : tracé MultiViewer ; prev : vainqueur de l'édition précédente ({ name, team, teamId, laps }) ;
// rounds : nombre de manches de la saison. Visuel propre à chaque Grand Prix : couleurs du drapeau,
// tracé du circuit, nom de la ville, mise en page qui alterne selon la manche.
export function raceWeekData(race, { year, rounds = null, tyres = null, forecast = null, track = null, prev = null } = {}) {
  const d = weekendData(race, { year, tyres, forecast });
  d.post = 'raceweek';
  d.label = 'Race Week';
  d.rounds = rounds;
  d.city = race.locality || race.circuit || '';
  const info = circuitInfo(race.circuitId);
  d.km = info?.km ?? null;
  d.laps = info?.laps ?? prev?.laps ?? null;
  d.shape = trackShape(track);
  d.corners = track?.corners?.length || null;
  d.palette = flagColors(d.iso);
  d.prev = prev ? { name: prev.name, team: prev.team, year: year - 1, color: teamColor(prev.teamId || prev.team) } : null;
  d.race = d.sessions.find((x) => x.label === 'Course') || null;
  d.variant = (race.round || 0) % 3;
  return d;
}

// ---------- 2. Le saviez-vous : records du circuit ----------
// records : /api/records (éditions précédentes : pole et meilleur tour en course) ; names : code -> nom
export function recordsData(race, records, { year, names = {} } = {}) {
  const d = base(race, year, 'records', 'Le saviez-vous');
  const who = (x) => (x ? { ...x, name: names[x.tla] || x.tla, color: x.color ? `#${String(x.color).replace('#', '')}` : teamColor(x.team) } : null);
  d.editions = (records?.editions || []).map((e) => ({ year: e.year, pole: who(e.pole), fastest: who(e.fastest) })).sort((a, b) => b.year - a.year);
  d.bestPole = who(records?.bestPole);
  d.bestRaceLap = who(records?.bestRaceLap);
  const facts = [];
  if (d.bestPole) facts.push({ label: 'Record de la pole', value: lapStr(d.bestPole.time), sub: `${d.bestPole.name} (${d.bestPole.team}), ${d.bestPole.year}`, color: d.bestPole.color });
  if (d.bestRaceLap) facts.push({ label: 'Record du tour en course', value: lapStr(d.bestRaceLap.time), sub: `${d.bestRaceLap.name} (${d.bestRaceLap.team}), ${d.bestRaceLap.year}`, color: d.bestRaceLap.color });
  // Pilote le plus souvent en pole sur les éditions connues
  const poles = new Map();
  for (const e of d.editions) if (e.pole) poles.set(e.pole.tla, [...(poles.get(e.pole.tla) || []), e]);
  const [topTla, topList] = [...poles.entries()].sort((a, b) => b[1].length - a[1].length)[0] || [];
  if (topList?.length >= 2) facts.push({ label: 'Spécialiste de la pole', value: topList[0].pole.name, sub: `${topList.length} poles sur les ${d.editions.length} dernières éditions`, color: topList[0].pole.color, tla: topTla });
  const last = d.editions.find((e) => e.pole);
  if (last && !(topList?.length >= 2 && last.pole.tla === topTla)) facts.push({ label: `Poleman ${last.year}`, value: last.pole.name, sub: `${lapStr(last.pole.time)} (${last.pole.team})`, color: last.pole.color });
  d.facts = facts;
  d.rows = d.editions;
  return d;
}

// ---------- 3. Notes des pilotes après la course ----------
// race : manche avec résultats et qualifs ; laps : parseRaceLaps (rythme), facultatif ; live : TLA -> couleur
const RATING_W = { res: 0.35, pace: 0.25, gain: 0.15, mate: 0.15, mateQ: 0.10 };
export function raceRatings(race, { laps = null, live = {} } = {}) {
  const res = race.results || [];
  const n = res.length;
  const cls = (x) => /^\d+$/.test(x.posText || '');
  // Rythme : rang du tour médian propre parmi les pilotes qui en ont un
  const paces = new Map();
  for (const l of laps?.drivers || []) { const p = cleanPace(l.times); if (p) paces.set(l.code, p); }
  const sorted = [...paces.values()].sort((a, b) => a - b);
  const paceScore = (code) => (paces.has(code) && sorted.length > 1 ? 1 - sorted.indexOf(paces.get(code)) / (sorted.length - 1) : null);
  const mateOf = (x) => res.find((y) => y.teamId === x.teamId && y.code !== x.code);
  const qPos = (x) => race.quali?.find((q) => q.code === x.code)?.pos || null;
  const rows = res.map((x) => {
    const ok = cls(x);
    const grid = x.grid || n;   // départ des stands : dernier
    const mate = mateOf(x);
    const parts = {
      res: ok ? (n - x.pos) / Math.max(1, n - 1) : 0,
      pace: paceScore(x.code),
      gain: ok ? Math.max(0, Math.min(1, 0.5 + (grid - x.pos) / 16)) : 0.2,
      mate: !mate ? null : ok && (!cls(mate) || x.pos < mate.pos) ? 1 : !ok && !cls(mate) ? 0.5 : 0,
      mateQ: mate && qPos(x) && qPos(mate) ? (qPos(x) < qPos(mate) ? 1 : 0) : null,
    };
    let s = 0, w = 0;
    for (const [k, kw] of Object.entries(RATING_W)) if (parts[k] !== null) { s += kw * parts[k]; w += kw; }
    const note = Math.round((3 + 7 * (w ? s / w : 0)) * 10) / 10;
    return { code: x.code, first: String(x.name || '').endsWith(x.last) ? String(x.name).slice(0, -x.last.length).trim() : '', last: x.last, team: x.team, teamId: x.teamId, color: teamColor(x.teamId || x.team, live[x.code]),
      pos: x.pos, posText: x.posText, classified: ok, grid: x.grid, note, parts, status: x.status };
  });
  return rows.sort((a, b) => b.note - a.note || (a.pos || 99) - (b.pos || 99));
}
export function ratingsData(race, { year, laps = null, live = {} } = {}) {
  const d = base(race, year, 'ratings', 'Notes des pilotes');
  d.rows = raceRatings(race, { laps, live });
  d.withPace = !!laps?.drivers?.some((l) => cleanPace(l.times));
  return d;
}

// ---------- 4. Duels entre coéquipiers sur la saison ----------
export function teamDuelsData(season, { year, upTo = null, live = {} } = {}) {
  const races = season.races.filter((r) => r.results.length && (!upTo || r.round <= upTo));
  const last = races.at(-1);
  const d = base(last, year, 'teamduels', 'Duels entre coéquipiers');
  d.after = races.length;
  const all = driverRatings({ races }, null);
  const byTeam = new Map();
  for (const e of all) byTeam.set(e.teamId, [...(byTeam.get(e.teamId) || []), e]);
  const order = (season.constructors || []).map((c) => c.id);
  d.rows = [...byTeam.entries()].map(([teamId, list]) => {
    const [a, b] = list.sort((x, y) => y.starts - x.starts || y.pts - x.pts).slice(0, 2);
    if (!a || !b) return null;
    // Le mieux placé à gauche
    const [l, r] = a.h2h.qa + a.h2h.ra >= b.h2h.qa + b.h2h.ra ? [a, b] : [b, a];
    const g = qualiGaps(races, l.code, r.code);
    const side = (e) => ({ code: e.code, last: e.last, q: e.h2h.qa, r: e.h2h.ra, pts: e.pts });
    return { teamId, team: l.team, color: teamColor(teamId || l.team, live[l.code]), a: side(l), b: side(r), gap: g.median, gapPct: g.medianPct, rounds: g.rounds.length };
  }).filter(Boolean).sort((x, y) => ((order.indexOf(x.teamId) + 1 || 99) - (order.indexOf(y.teamId) + 1 || 99)) || (y.a.pts + y.b.pts) - (x.a.pts + x.b.pts));
  return d;
}

// ---------- 4 bis. Course au titre (pilotes et constructeurs) après une manche ----------
// Classements officiels après la dernière course ; pour une manche plus ancienne, recalculés d'après
// les résultats jusqu'à elle (courses et sprints). Qui peut encore être champion : titleRace.
function standingsUpTo(races) {
  const dm = new Map(); const cm = new Map();
  const add = (x, win) => {
    const d = dm.get(x.code) || { code: x.code, name: x.name, last: x.last, points: 0, wins: 0 };
    dm.set(x.code, { ...d, team: x.team, teamId: x.teamId, points: d.points + x.points, wins: d.wins + win });
    const c = cm.get(x.teamId) || { id: x.teamId, name: x.team, points: 0, wins: 0 };
    cm.set(x.teamId, { ...c, points: c.points + x.points, wins: c.wins + win });
  };
  for (const r of races) { for (const x of r.results) add(x, x.pos === 1 ? 1 : 0); for (const x of r.sprintResults || []) add(x, 0); }
  const rank = (m) => [...m.values()].sort((a, b) => b.points - a.points || b.wins - a.wins).map((e, i) => ({ ...e, pos: i + 1 }));
  return { drivers: rank(dm), constructors: rank(cm) };
}
export function titleData(season, { year, upTo = null, live = {} } = {}) {
  const done = season.races.filter((r) => r.results.length && (!upTo || r.round <= upTo));
  const last = done.at(-1);
  const d = base(last, year, 'title', 'Course au titre');
  d.after = done.length;
  if (!last) return { ...d, drivers: [], constructors: [] };
  const races = season.races.map((r) => (r.round <= last.round ? r : { ...r, results: [], sprintResults: [] }));
  const latest = !season.races.some((r) => r.round > last.round && r.results.length);
  const tr = titleRace({ races, ...(latest ? { drivers: season.drivers, constructors: season.constructors } : standingsUpTo(done)) }, year);
  const gp = (r) => (r ? gpNameFr(r.name).replace(/^le /, '') : '');
  const row = (e, label, color) => ({ pos: e.pos, label, code: e.code || '', team: e.team || e.name, color, points: e.points, behind: e.behind, maxPts: e.maxPts, alive: e.alive, outRound: e.outRound });
  d.drivers = tr.drivers.map((e) => row(e, e.last || e.name, teamColor(e.teamId || e.team, live[e.code])));
  d.constructors = tr.constructors.map((e) => row(e, e.name, teamColor(e.id || e.name)));
  d.left = { races: tr.races, sprints: tr.sprints, d: tr.maxD, c: tr.maxC };
  d.champion = tr.champion ? { name: tr.champion.name, team: tr.champion.team } : null;
  d.champTeam = tr.champTeam ? { name: tr.champTeam.name } : null;
  // Titre au plus tôt : dès la prochaine manche, sinon la première où il devient possible. Comme dans
  // l'appli (Saison → Course au titre) : pour chaque rival, avance à prendre sur le week-end et, pour
  // les pilotes hors sprint, place qu'il doit faire au pire si le leader gagne ou finit 2e
  const place = (margin, lp, lpos) => {
    const allowed = lp - margin;
    if (allowed < 0) return '—';
    const p = placeForMaxPoints(allowed);
    if (p < lpos || (lpos === 1 && p <= 2)) return 'suffit';
    return p > 10 ? 'hors des points' : `P${p === lpos ? p + 1 : p} ou plus loin`;
  };
  const when = (c, rows, team) => c && {
    leader: c.leader.name, next: c.possibleNext ? gpNameFr(c.next.name) : null, earliest: c.earliest ? gp(c.earliest) : null,
    nextGp: gp(c.next), max: c.next.max, sprint: c.next.sprint, possibleNext: c.possibleNext,
    needs: c.needs.slice(0, 4).map((n) => {
      const r = rows.find((e) => (n.code ? e.code === n.code : e.label === n.name)) || {};
      return { label: r.label || n.name, color: r.color, margin: n.margin, ...(!team && !c.next.sprint ? { win: place(n.margin, 25, 1), second: place(n.margin, 18, 2) } : {}) };
    }),
  };
  d.clinchD = when(tr.clinchD, d.drivers, false);
  d.clinchC = when(tr.clinchC, d.constructors, true);
  return d;
}

// ---------- 5. Course tour par tour (graphique des positions, vidéo) ----------
// rcm : direction de course (parseRaceControl), sinon neutralisations estimées d'après les temps au
// tour (vidéo animée)
export function raceLapsData(race, laps, { year, live = {}, rcm = null } = {}) {
  const d = base(race, year, 'racelaps', 'Course');
  d.total = laps.total;
  d.drivers = laps.drivers.map((x) => ({ ...x, color: teamColor(x.teamId || x.team, live[x.code]) }));
  const { led, changes } = lapsLedBy(laps);
  d.led = [...led.entries()].sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, n, last: d.drivers.find((x) => x.code === code)?.last || code }));
  d.leadChanges = changes;
  d.climbs = d.drivers.filter((x) => x.classified && x.grid).map((x) => ({ ...x, gain: x.grid - x.finish })).sort((a, b) => b.gain - a.gain).slice(0, 3);
  d.rows = [...d.drivers].sort((a, b) => (a.finish || 99) - (b.finish || 99));
  d.story = raceStory(laps, rcm);
  return d;
}

// ---------- 6. Récap de la semaine ----------
// items : posts « news » déjà préparés (newsPost), 5 au plus, du plus important au moins important
export function recapData(items, { now = Date.now() } = {}) {
  const list = items.slice(0, 5);
  const from = now - 6 * 24 * 3600e3;
  return {
    post: 'recap', label: 'La semaine en F1', recap: true, final: true, year: new Date(now).getFullYear(),
    date: `${fmt(from, { day: 'numeric', month: 'long' })} au ${fmt(now, { day: 'numeric', month: 'long' })}`,
    items: list, rows: list.flatMap((x) => x.drivers).slice(0, 6), color: list[0]?.color || '#e10600', facts: [], summary: { paragraphs: [] },
    gp: 'La semaine en F1', gpEn: '', circuit: '',
  };
}

// ---------- Textes des posts ----------
function finish(d, head, lines, sig, extra, shortLines = lines) {
  const tags = tagsOf(d, extra);
  const s = sig ? `\n\n${sig}` : '';
  const body = lines.join('\n');
  const instagram = `${head}\n\n${body}${s}\n\n${tags.join(' ')}`;
  let threads = `${head}\n\n${body}${s}\n\n#F1 ${BRAND_TAG}`;
  if (threads.length > 500) threads = `${head}\n\n${shortLines.join('\n')}${s}\n\n#F1 ${BRAND_TAG}`;
  if (threads.length > 500) threads = `${threads.slice(0, 497 - `\n\n#F1 ${BRAND_TAG}`.length)}…\n\n#F1 ${BRAND_TAG}`;
  // X : lignes puis mots-clés retirés tant que le post dépasse 280 caractères
  const xl = [...shortLines];
  const xt = tags.slice(0, 4);
  const make = () => `${head}\n\n${xl.join('\n')}\n\n${xt.join(' ')}`.replace(/\n\n\n\n/, '\n\n');
  let x = make();
  while (xLength(x) > 280 && xl.length > 1) { xl.pop(); x = make(); }
  while (xLength(x) > 280 && xt.length > 1) { xt.pop(); x = make(); }
  if (xLength(x) > 280) x = `${x.slice(0, 278)}…`;
  return { instagram, x, bsky: [...x].length <= 300 ? x : `${[...x].slice(0, 299).join('')}…`, threads, story: head };
}

export function seasonCaptions(d, sig = '') {
  if (d.post === 'weekend') {
    const lines = d.sessions.map((s) => `${s.day.slice(0, 3)}. ${s.time} · ${s.label}`);
    const extra = [];
    if (d.tyres) extra.push(`Pneus Pirelli : C${d.tyres.hard} (durs), C${d.tyres.medium} (médiums), C${d.tyres.soft} (tendres).`);
    const sun = d.forecast?.at(-1);
    if (sun) extra.push(`Météo prévue ${sun.day.toLowerCase()} : ${Math.round(sun.tmax)} °C, ${Math.round(sun.rain ?? 0)} % de risque de pluie.`);
    return finish(d, `Programme du week-end : ${d.gp}${d.sprint ? ' (format sprint)' : ''}`, [...lines, '(heures de Paris)', ...(extra.length ? ['', ...extra] : [])], sig, ['#RaceWeek'],
      d.sessions.filter((s) => s.main).map((s) => `${s.day.slice(0, 3)}. ${s.time} · ${s.label}`));
  }
  if (d.post === 'raceweek') {
    const lines = [`Manche ${d.round}${d.rounds ? `/${d.rounds}` : ''} · du ${d.date}${d.city ? ` · ${d.city}` : ''}`];
    if (d.race) lines.push(`Course ${d.race.day.toLowerCase()} à ${d.race.time} (heure de Paris)`);
    const facts = [d.laps && `${d.laps} tours`, d.km && `${dec(d.km, 3)} km`, d.corners && `${d.corners} virage${d.corners > 1 ? 's' : ''}`].filter(Boolean);
    if (facts.length) lines.push(facts.join(' · '));
    if (d.prev) lines.push(`Vainqueur ${d.prev.year} : ${d.prev.name} (${d.prev.team})`);
    if (d.tyres) lines.push(`Pneus : C${d.tyres.hard}, C${d.tyres.medium}, C${d.tyres.soft}`);
    return finish(d, `RACE WEEK | ${capFirst(d.gp)}${d.sprint ? ' (format sprint)' : ''}`, lines, sig, ['#RaceWeek', d.city ? hashtag(d.city) : ''], lines.slice(0, 3));
  }
  if (d.post === 'records') {
    const lines = d.facts.map((f) => `${f.label} : ${f.value} — ${f.sub}`);
    return finish(d, `Le saviez-vous ? Les records du ${d.gp}`, lines, sig, ['#F1Facts'], lines.slice(0, 2));
  }
  if (d.post === 'ratings') {
    const top = d.rows.slice(0, 3).map((r, i) => `${i + 1}. ${r.first} ${r.last} : ${dec(r.note)}/10`);
    const flop = d.rows.slice(-2).reverse().map((r) => `${r.last} : ${dec(r.note)}/10`);
    const lines = ['Les mieux notés :', ...top, '', `Les moins bien notés : ${flop.join(', ')}`, '', `Note Paddock Live : résultat, ${d.withPace ? 'rythme, ' : ''}places gagnées et duel avec le coéquipier.`];
    return finish(d, `Les notes des pilotes après ${gpNameFr(d.gpEn)}`, lines, sig, ['#DriverRatings', hashtag(`${d.rows[0]?.first}${d.rows[0]?.last}`)], top);
  }
  if (d.post === 'teamduels') {
    const lines = d.rows.map((r) => `${r.team} : ${r.a.last} ${r.a.q}-${r.b.q} ${r.b.last} en qualifs, ${r.a.r}-${r.b.r} en course`);
    return finish(d, `Duels entre coéquipiers après ${d.after} course${d.after > 1 ? 's' : ''}`, lines, sig, ['#Teammates'], lines.slice(0, 4));
  }
  if (d.post === 'title') {
    const part = (list, champ, clinch, max, team) => {
      if (!list.length) return [];
      if (champ) return [`${team ? 'Constructeurs' : 'Pilotes'} : ${champ.name} ${team ? 'champion du monde des constructeurs' : 'champion du monde'} !`];
      const alive = list.filter((e) => e.alive);
      const out = [`${team ? 'Constructeurs' : 'Pilotes'} (${max} pts encore en jeu) :`,
        ...alive.slice(0, 5).map((e) => `${e.pos}. ${e.label} : ${e.points} pts${e.behind ? ` (à ${e.behind} pts)` : ''}`)];
      if (alive.length > 5) out.push(`… et ${alive.length - 5} autre${alive.length > 6 ? 's' : ''} encore en course`);
      if (clinch?.next) out.push(`${clinch.leader} peut être sacré dès ${clinch.next}.`);
      else if (clinch?.earliest) out.push(`Titre possible au plus tôt : ${clinch.earliest}.`);
      return out;
    };
    const dl = part(d.drivers, d.champion, d.clinchD, d.left.d, false);
    const cl = part(d.constructors, d.champTeam, d.clinchC, d.left.c, true);
    const left = d.left.races ? `Encore ${d.left.races} Grand${d.left.races > 1 ? 's' : ''} Prix${d.left.sprints ? `, dont ${d.left.sprints} en format sprint` : ''}.` : 'Saison terminée.';
    const lines = [...dl, ...(dl.length && cl.length ? [''] : []), ...cl, '', left];
    return finish(d, d.champion ? `${d.champion.name} champion du monde ${d.year} !` : `La course au titre après ${gpNameFr(d.gpEn)}`, lines, sig, ['#F1Championship'], [...dl.slice(0, 3), '', ...cl.slice(0, 2)]);
  }
  if (d.post === 'racelaps') {
    const lines = [];
    if (d.led.length) lines.push(`En tête : ${d.led.slice(0, 3).map((x) => `${x.last} (${x.n} tour${x.n > 1 ? 's' : ''})`).join(', ')}`);
    if (d.leadChanges) lines.push(`${d.leadChanges} changement${d.leadChanges > 1 ? 's' : ''} de leader`);
    const c = d.climbs.filter((x) => x.gain > 0);
    if (c.length) lines.push(`Plus belles remontées : ${c.map((x) => `${x.last} (P${x.grid} → P${x.finish})`).join(', ')}`);
    return finish(d, `${capFirst(gpNameFr(d.gpEn))} tour par tour`, lines, sig, ['#RaceDay'], lines);
  }
  if (d.post === 'recap') {
    const lines = d.items.map((it, i) => `${i + 1}. ${it.badge.label} | ${it.title}`);
    const src = [...new Set(d.items.map((it) => it.source).filter(Boolean))];
    return finish({ ...d, gpEn: '' }, `La semaine en F1 : les ${d.items.length} infos à retenir`, [...lines, ...(src.length ? ['', `Sources : ${src.join(', ')}`] : [])], sig, ['#F1News'], lines.slice(0, 3));
  }
  return { instagram: '', x: '', bsky: '', threads: '', story: '' };
}
