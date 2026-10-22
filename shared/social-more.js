// Autres posts de séance (mode créateur) : avant-course (grille, météo, pneus Pirelli), championnat
// après la course, « flash » pendant la séance (drapeau rouge, voiture de sécurité, abandon,
// pénalité) et duels entre coéquipiers. Données tirées de l'état de la séance, textes en français.
import { postData, hashtag, teamTag, fiveTags, twoTags, noTags, THREADS_TAG, gpFlag, MEDALS, xLength } from './social.js';
import { portraitUrl } from './portraits.js';

const list = (o) => (!o ? [] : Array.isArray(o) ? o : Object.keys(o).sort((a, b) => a - b).map((k) => o[k]));
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const dec = (v, n = 0) => (v == null ? '—' : v.toFixed(n).replace('.', ','));

// ---------- Duels entre coéquipiers (séance affichée) ----------
export function teammateDuels(d) {
  const teams = new Map();
  for (const r of d.rows) {
    if (!r.team) continue;
    if (!teams.has(r.team)) teams.set(r.team, []);
    teams.get(r.team).push(r);
  }
  return [...teams.values()].filter((t) => t.length === 2).map(([a, b]) => ({ team: a.team, color: a.color, ahead: a.pos < b.pos ? a : b, behind: a.pos < b.pos ? b : a }))
    .sort((x, y) => x.ahead.pos - y.ahead.pos);
}

// ---------- Avant-course : grille de départ, météo, pneus ----------
// grid : grille officielle de la FIA (shared/fia-grid.js), prioritaire ; sinon positions de départ
// du flux F1 (séance de course), sinon classement des qualifications (sans les pénalités)
export function preraceData(state, { tyres = null, grid = null } = {}) {
  const d = postData(state);
  let rows;
  let gridSource;
  if (grid?.rows?.length) {
    const byNum = Object.fromEntries(d.rows.map((r) => [r.num, r]));
    const dl = state?.DriverList || {};
    const pens = Object.fromEntries((grid.penalties || []).flatMap((p) => p.cars.map((c) => [c, p.fr])));
    rows = grid.rows.map((g) => {
      const base = byNum[g.num] || { num: g.num, tla: dl[g.num]?.Tla || g.lastUp.slice(0, 3), first: g.first, last: g.last, team: dl[g.num]?.TeamName || g.team, color: dl[g.num]?.TeamColour ? `#${dl[g.num].TeamColour}` : '#8b95a8', headshot: portraitUrl(dl[g.num]?.Tla, true) || dl[g.num]?.HeadshotUrl || '' };
      return { ...base, pos: g.pos, pitlane: g.pitlane, penalty: pens[g.num] || null };
    });
    gridSource = grid.final ? 'fia' : 'fia-provisional';
  } else {
    const withGrid = d.rows.filter((r) => r.grid);
    const live = d.kind === 'race' && withGrid.length >= d.rows.length / 2;
    rows = (live ? [...d.rows].sort((a, b) => (a.grid || 99) - (b.grid || 99)).map((r) => ({ ...r, pos: r.grid || r.pos })) : d.rows)
      .map((r, i) => ({ ...r, pos: r.pos || i + 1 }));
    gridSource = live ? 'live' : 'quali';
  }
  const w = state?.WeatherData || {};
  const weather = { air: num(w.AirTemp), track: num(w.TrackTemp), humidity: num(w.Humidity), wind: num(w.WindSpeed), rain: String(w.Rainfall ?? '0') !== '0' };
  return {
    ...d, post: 'prerace', final: true, rows, gridSource,
    weather: Object.values(weather).some((v) => v !== null && v !== false) ? weather : null,
    tyres: tyres?.hard ? { hard: tyres.hard, medium: tyres.medium, soft: tyres.soft } : null,
  };
}

// Mention de la source de la grille (visuel et texte)
export const GRID_SOURCE = { fia: 'Grille officielle (FIA)', 'fia-provisional': 'Grille provisoire (FIA)', live: 'Grille officielle', quali: 'Ordre des qualifications, avant pénalités éventuelles' };

// ---------- Championnat (projeté, après la course ou le sprint) ----------
export function champData(state) {
  const d = postData(state);
  return d.champ ? { ...d, post: 'champ', final: d.final } : null;
}

// ---------- Flash : faits marquants pendant la séance ----------
const FR_REASON = { 'CAUSING A COLLISION': 'collision', 'LEAVING THE TRACK AND GAINING AN ADVANTAGE': 'avantage pris hors piste', 'SPEEDING IN THE PIT LANE': 'excès de vitesse aux stands', 'FORCING ANOTHER DRIVER OFF THE TRACK': 'pilote poussé hors de la piste', 'UNSAFE RELEASE': 'sortie des stands dangereuse', 'TRACK LIMITS': 'limites de piste' };
export const FLASH_KINDS = {
  red: { label: 'DRAPEAU ROUGE', color: '#e10600', emoji: '🔴' }, sc: { label: 'VOITURE DE SÉCURITÉ', color: '#f5c518', emoji: '🚨' }, vsc: { label: 'VOITURE DE SÉCURITÉ VIRTUELLE', color: '#f5c518', emoji: '🟡' },
  retire: { label: 'ABANDON', color: '#9aa3b2', emoji: '💥' }, penalty: { label: 'PÉNALITÉ', color: '#f5a524', emoji: '⚠️' },
};

// Évènements de la séance, du plus récent au plus ancien
export function flashEvents(state) {
  const d = postData(state);
  const byNum = Object.fromEntries(d.rows.map((r) => [r.num, r]));
  const byTla = Object.fromEntries(d.rows.map((r) => [r.tla, r]));
  const out = [];
  list(state?.RaceControlMessages?.Messages).forEach((m, i) => {
    const msg = String(m?.Message || '');
    const lap = num(m?.Lap);
    const base = { id: `rc${i}`, lap, utc: m?.Utc || '' };
    const at = lap ? ` au tour ${lap}` : '';
    const what = d.kind === 'race' ? 'Course' : 'Séance';
    if (m?.Flag === 'RED' || /^RED FLAG/.test(msg)) out.push({ ...base, kind: 'red', title: `${what} arrêtée${at}`, sub: 'Drapeau rouge : retour des voitures dans la voie des stands' });
    else if (/^SAFETY CAR DEPLOYED/.test(msg)) out.push({ ...base, kind: 'sc', title: `${what} neutralisée${at}`, sub: 'Le peloton se regroupe derrière la voiture de sécurité' });
    else if (/^VIRTUAL SAFETY CAR DEPLOYED/.test(msg)) out.push({ ...base, kind: 'vsc', title: `${what} neutralisée${at}`, sub: 'Vitesse limitée sur tout le circuit' });
    else if (/PENALTY|DRIVE THROUGH|STOP\/GO/.test(msg) && !/NO FURTHER|INVESTIGATION|NOTED|REVIEWED/.test(msg)) {
      const tla = msg.match(/CAR \d+ \((\w{3})\)/)?.[1];
      const r = byTla[tla];
      const sec = msg.match(/(\d+) SECOND TIME PENALTY/);
      const what = sec ? `${sec[1]} s de pénalité` : /DRIVE THROUGH/.test(msg) ? 'drive-through' : /STOP\/GO/.test(msg) ? 'stop & go' : /GRID/.test(msg) ? 'pénalité sur la grille' : 'pénalité';
      const reason = msg.split(' - ').slice(1).join(' - ').trim();
      out.push({ ...base, kind: 'penalty', driver: r || null, title: `${r ? `${r.first} ${r.last}` : tla || 'Pilote'} : ${what}`, sub: FR_REASON[reason] || reason.toLowerCase() });
    }
  });
  // Abandons (classement de la séance)
  for (const r of d.rows.filter((x) => x.out)) out.push({ id: `out${r.num}`, kind: 'retire', driver: byNum[r.num], lap: r.laps ? r.laps + 1 : null, title: `Abandon de ${r.first} ${r.last}`, sub: r.laps ? `Après ${r.laps} tour${r.laps > 1 ? 's' : ''}` : '' });
  // Plus récent d'abord (tour de l'évènement quand il est connu)
  return out.reverse().map((e, i) => [e, i]).sort(([a, i], [b, j]) => (b.lap ?? -1) - (a.lap ?? -1) || i - j).map(([e]) => e);
}

export function flashData(state, ev) {
  const d = postData(state);
  return { ...d, post: 'flash', final: true, event: ev, rows: ev.driver ? [ev.driver] : [] };
}

// ---------- Légendes ----------
export function moreCaptions(d, signature = '') {
  const sig = signature ? `\n\n${signature}` : '';
  const gpTag = hashtag(`${String(d.gpEn || '').replace(/ Grand Prix$/i, '')}GP`);
  let head = '';
  let body = '';
  let bodyX = null;   // version courte pour X
  let extra = [];
  if (d.post === 'prerace') {
    const [p1, p2, p3] = d.rows;
    head = `🚦 ${d.sprint ? 'GRILLE DU SPRINT' : 'GRILLE DE DÉPART'} | ${gpFlag(d)}${d.gridSource === 'fia-provisional' ? ' (provisoire)' : ''}`;
    const lines = [];
    if (p1) lines.push(`🥇 ${d.gridSource === 'fia' || d.gridSource === 'live' ? 'En pole' : 'Pole'} : ${p1.first} ${p1.last} (${p1.team})${p2 ? `, devant ${p2.last}${p3 ? ` et ${p3.last}` : ''}` : ''}.`);
    const pens = d.rows.filter((r) => r.penalty);
    if (pens.length) lines.push(`⚠️ Pénalités :\n${pens.map((r) => `– ${r.last}${r.pitlane ? '' : ` (${r.pos}e)`} : ${r.penalty}`).join('\n')}`);
    if (d.weather) lines.push(`${d.weather.rain ? '🌧️' : '☀️'} Météo : ${dec(d.weather.air)} °C dans l'air, ${dec(d.weather.track)} °C sur la piste, ${d.weather.rain ? 'pluie' : 'pas de pluie'}.`);
    if (d.tyres) lines.push(`🛞 Pneus Pirelli : C${d.tyres.hard} (durs), C${d.tyres.medium} (médiums), C${d.tyres.soft} (tendres).`);
    body = lines.join('\n');
    bodyX = lines.map((l) => (l.startsWith('⚠️ Pénalités') ? `⚠️ Pénalités : ${pens.map((r) => r.last).join(', ')}.` : l)).join('\n');
    extra = ['#RaceDay', p1 ? hashtag(`${p1.first}${p1.last}`) : ''];
  } else if (d.post === 'champ') {
    const [a, b, c] = d.champ.drivers;
    const t = d.champ.teams[0];
    head = `🏆 Championnat ${d.final ? 'après' : 'en direct de'} ${d.sprint ? 'la course sprint du ' : 'le '}${gpFlag(d)}`;
    body = [a && `${MEDALS[0]} ${a.last} : ${a.points} pts${a.gained ? ` (+${a.gained})` : ''}`, b && `${MEDALS[1]} ${b.last} : ${b.points} pts${a ? ` (à ${a.points - b.points})` : ''}`, c && `${MEDALS[2]} ${c.last} : ${c.points} pts`, t && `\n🔧 Constructeurs : ${t.name} en tête avec ${t.points} pts`].filter(Boolean).join('\n');
    extra = ['#F1Championship', a ? hashtag(a.last) : '', t ? teamTag(t.name) : ''];
  } else if (d.post === 'flash') {
    const k = FLASH_KINDS[d.event.kind];
    head = `${k.emoji} ${k.label} | ${gpFlag(d)}`;
    body = [d.event.title, d.event.sub].filter(Boolean).join(' — ');
    extra = d.event.driver ? [hashtag(`${d.event.driver.first}${d.event.driver.last}`), teamTag(d.event.driver.team)] : [];
  }
  const all = fiveTags(['#F1', gpTag, ...extra]);
  const instagram = `${head}\n\n${body}${sig}\n\n${all.join(' ')}`;
  const shortTags = twoTags(all);
  // X : mots-clés puis dernières lignes du texte retirés tant que le post dépasse 280 caractères
  const bodyLines = (bodyX ?? body).split('\n');
  const make = () => `${head}\n\n${bodyLines.join('\n')}\n\n${shortTags.join(' ')}`;
  let x = make();
  while (xLength(x) > 280 && shortTags.length > 3) { shortTags.pop(); x = make(); }
  while (xLength(x) > 280 && bodyLines.length > 1) { bodyLines.pop(); x = make(); }
  while (xLength(x) > 280 && shortTags.length > 1) { shortTags.pop(); x = make(); }
  if (xLength(x) > 280) x = `${head}\n\n${bodyLines.join('\n')}`.slice(0, 260) + '…';
  const threads = `${head}\n\n${body}${sig}\n\n${THREADS_TAG}`.slice(0, 500);
  return { instagram, facebook: noTags(instagram), x, bsky: x, threads, story: head };
}
