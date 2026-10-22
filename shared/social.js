// Générateur de posts pour les réseaux sociaux (mode créateur) : données de la séance affichée
// (vainqueur, podium, classement, faits marquants, championnat projeté) et légendes prêtes à
// copier pour Instagram / Facebook, les stories et X / Threads / Bluesky.

import { buildSummary, gpNameFr, sessionKindOf } from './summary.js';
import { realStints } from './pits.js';
import { portraitUrl } from './portraits.js';
import { FLAG_ISO } from './flags.js';

const list = (o) => (!o ? [] : Array.isArray(o) ? o : Object.keys(o).sort((a, b) => a - b).map((k) => o[k]));
const RACE_PTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_PTS = [8, 7, 6, 5, 4, 3, 2, 1];
const COMP = { SOFT: 'Tendres', MEDIUM: 'Médiums', HARD: 'Durs', INTERMEDIATE: 'Intermédiaires', WET: 'Pluie' };
const dec = (v) => String(v).replace('.', ',');

// « +7.335 » -> « +7,335 s », « 1L » -> « +1 tour »
export function gapFr(v) {
  const s = String(v ?? '').trim();
  if (!s || /^LAP/i.test(s)) return '';
  const laps = s.match(/^\+?(\d+)\s*L(AP)?S?$/i);
  if (laps) return `+${laps[1]} tour${laps[1] > 1 ? 's' : ''}`;
  return /^\+?\d/.test(s) ? `+${dec(s.replace('+', ''))} s` : s;
}

// Longueur d'un texte pour X : chaque lien compte pour 23 caractères (raccourci t.co)
// Longueur comptée par X : lien = 23, lettres latines = 1, emojis et autres signes (flèches…) = 2.
// Sélecteur de variante et liaison d'emoji comptent 0 ; un drapeau compte 4 (X en compte 2).
const light = (c) => c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247);
export const xLength = (s) => [...String(s || '').replace(/https?:\/\/\S+/g, 'x'.repeat(23))]
  .reduce((n, ch) => { const c = ch.codePointAt(0); return n + (c === 0xfe0f || c === 0x200d ? 0 : c === 0x20e3 || light(c) ? 1 : 2); }, 0);

export const hashtag = (s) => `#${String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '')}`;

export function postData(state) {
  const kind = sessionKindOf(state);
  const info = state?.SessionInfo || {};
  const sprint = /sprint/i.test(info.Name || '');
  const dl = state?.DriverList || {};
  const lines = state?.TimingData?.Lines || {};
  const app = state?.TimingAppData?.Lines || {};
  const stats = state?.TimingStats?.Lines || {};
  const msgs = list(state?.RaceControlMessages?.Messages);
  const finished = ['Finished', 'Finalised', 'Ends'].includes(state?.SessionStatus?.Status);
  const part = Number(state?.TimingData?.SessionPart) || 1;
  const gpEn = String(info.Meeting?.Name || '').trim();
  const gp = gpEn ? gpNameFr(gpEn).replace(/^le /, '') : 'Grand Prix';
  const label = kind === 'race' ? (sprint ? 'Sprint' : 'Course') : kind === 'quali' ? (sprint ? 'Qualifications sprint' : 'Qualifications') : (info.Name || 'Essais').replace(/^Practice (\d)$/, 'Essais libres $1');
  const ranked = Object.keys(lines).filter((n) => Number(lines[n]?.Position) > 0).sort((a, b) => Number(lines[a].Position) - Number(lines[b].Position));
  const leaderLaps = Number(lines[ranked[0]]?.NumberOfLaps) || 0;
  const isOut = (n) => kind === 'race' && (lines[n].Retired || (lines[n].Stopped && (!finished || (Number(lines[n].NumberOfLaps) || 0) < 0.9 * leaderLaps)));
  const pts = sprint ? SPRINT_PTS : RACE_PTS;
  const bestQ = (n) => list(lines[n]?.BestLapTimes)[part - 1]?.Value || lines[n]?.BestLapTime?.Value || '';

  const rows = ranked.map((n, i) => {
    const d = dl[n] || {};
    const grid = Number(app[n]?.GridPos) || null;
    const out = isOut(n);
    let gap = '';
    if (kind === 'race') gap = out ? 'Abandon' : i === 0 ? '' : gapFr(lines[n].GapToLeader);
    else if (kind === 'quali') gap = i === 0 ? bestQ(n) : (list(lines[n]?.Stats)[part - 1]?.TimeDiffToFastest ? `+${dec(String(list(lines[n].Stats)[part - 1].TimeDiffToFastest).replace('+', ''))}` : lines[n].KnockedOut ? (list(lines[n].BestLapTimes).filter((x) => x?.Value).at(-1)?.Value || bestQ(n)) : '');
    else gap = i === 0 ? (lines[n]?.BestLapTime?.Value || '') : (lines[n]?.TimeDiffToFastest ? `+${dec(String(lines[n].TimeDiffToFastest).replace('+', ''))}` : '');
    return {
      pos: i + 1, num: n, tla: d.Tla || n, first: d.FirstName || '', last: d.LastName || d.Tla || n,
      team: d.TeamName || '', color: d.TeamColour ? `#${String(d.TeamColour).replace('#', '')}` : '#8b95a8', headshot: portraitUrl(d.Tla, true) || d.HeadshotUrl || null,
      gap, grid, delta: kind === 'race' && grid && !out ? grid - (i + 1) : null, out, laps: Number(lines[n].NumberOfLaps) || 0,
      points: kind === 'race' && !out ? (pts[i] || 0) : 0, knockedOut: !!lines[n].KnockedOut,
      // Partie de la qualif où le pilote a été éliminé (dernier temps réalisé : Q1 ou Q2)
      koPart: lines[n].KnockedOut ? Math.max(1, list(lines[n].BestLapTimes).filter((x) => x?.Value).length) : null,
    };
  });

  // Faits marquants
  const facts = [];
  const byNum = Object.fromEntries(rows.map((r) => [r.num, r]));
  if (kind === 'race' && rows.length) {
    const fl = Object.keys(stats).find((n) => stats[n]?.PersonalBestLapTime?.Position === 1);
    if (fl && byNum[fl] && stats[fl].PersonalBestLapTime.Value) facts.push({ label: 'Meilleur tour', value: byNum[fl].last, sub: `${stats[fl].PersonalBestLapTime.Value}${stats[fl].PersonalBestLapTime.Lap ? ` · tour ${stats[fl].PersonalBestLapTime.Lap}` : ''}`, color: byNum[fl].color });
    const up = rows.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta)[0];
    if (up && up.delta >= 3) facts.push({ label: 'Plus belle remontée', value: up.last, sub: `P${up.grid} → P${up.pos} (+${up.delta})`, color: up.color });
    const w = rows[0];
    const stints = realStints(list(app[w.num]?.Stints)).map((s) => s?.Compound).filter((c) => COMP[c]);
    if (stints.length) facts.push({ label: 'Stratégie du vainqueur', value: stints.length === 1 ? 'Sans arrêt' : `${stints.length - 1} arrêt${stints.length > 2 ? 's' : ''}`, sub: stints.map((c) => COMP[c]).join(' → '), color: w.color });
    const sc = msgs.filter((m) => /^SAFETY CAR DEPLOYED/.test(m?.Message || '')).length;
    const vsc = msgs.filter((m) => /^VIRTUAL SAFETY CAR DEPLOYED/.test(m?.Message || '')).length;
    const red = msgs.filter((m) => m?.Flag === 'RED').length;
    const neut = [sc && `${sc} safety car${sc > 1 ? 's' : ''}`, vsc && `${vsc} VSC`, red && `${red} drapeau${red > 1 ? 'x' : ''} rouge${red > 1 ? 's' : ''}`].filter(Boolean);
    facts.push({ label: 'Neutralisations', value: neut.length ? neut.join(' · ') : 'Aucune', sub: neut.length ? '' : 'Drapeau vert de bout en bout' });
    const outs = rows.filter((r) => r.out);
    facts.push({ label: 'Abandons', value: outs.length ? String(outs.length) : 'Aucun', sub: outs.map((r) => r.last).join(', ') });
  } else if (kind === 'quali' && rows.length) {
    const ko = rows.filter((r) => r.knockedOut);
    if (ko.length) facts.push({ label: 'Éliminés', value: String(ko.length), sub: ko.map((r) => r.tla).join(', ') });
    if (rows[1]) facts.push({ label: 'Écart pole / P2', value: rows[1].gap || '—', sub: `${rows[0].last} devant ${rows[1].last}`, color: rows[0].color });
  } else if (rows.length) {
    // Essais : écart en tête, pneus du meilleur temps, roulage, pilotes dans la seconde
    const [p1, p2] = rows;
    if (p2?.gap) facts.push({ label: 'Écart P1 / P2', value: p2.gap, sub: `${p1.last} devant ${p2.last}`, color: p1.color });
    const best = lines[p1.num]?.BestLapTime?.Value;
    const stint = best && list(app[p1.num]?.Stints).find((st) => st?.LapTime === best);
    if (stint && COMP[stint.Compound]) {
      const fresh = String(stint.New) === 'true' ? ' · train neuf' : String(stint.New) === 'false' ? ' · train utilisé' : '';
      facts.push({ label: 'Pneus du meilleur temps', value: COMP[stint.Compound], sub: `${p1.last}${fresh}`, color: p1.color });
    }
    const most = [...rows].sort((a, b) => b.laps - a.laps)[0];
    if (most?.laps) facts.push({ label: 'Le plus de tours', value: most.last, sub: `${most.laps} tours`, color: most.color });
    const total = rows.reduce((n, r) => n + r.laps, 0);
    if (total) facts.push({ label: 'Tours bouclés', value: String(total), sub: `par les ${rows.length} pilotes` });
    const diff = (r) => Number(String(lines[r.num]?.TimeDiffToFastest ?? '').replace('+', ''));
    const close = rows.slice(1).filter((r) => diff(r) > 0 && diff(r) < 1).length + 1;
    if (best && rows.slice(1).some((r) => diff(r) > 0)) facts.push({ label: 'Dans la seconde', value: `${close} pilote${close > 1 ? 's' : ''}`, sub: 'à moins d\'1 s du meilleur temps' });
  }

  // Championnat projeté (publié par la F1 pendant les courses et les sprints)
  let champ = null;
  const cp = state?.ChampionshipPrediction;
  if (cp?.Drivers) {
    const drv = Object.values(cp.Drivers).filter(Boolean).sort((a, b) => (a.PredictedPosition || 99) - (b.PredictedPosition || 99));
    const teams = Object.values(cp.Teams || {}).filter(Boolean).sort((a, b) => (a.PredictedPosition || 99) - (b.PredictedPosition || 99));
    const teamColor = (name) => { const d = Object.values(dl).find((x) => x?.TeamName === name); return d?.TeamColour ? `#${d.TeamColour}` : '#8b95a8'; };
    champ = {
      drivers: drv.map((r) => { const d = dl[r.RacingNumber] || {}; return { pos: r.PredictedPosition, tla: d.Tla || r.RacingNumber, last: d.LastName || d.Tla || r.RacingNumber, team: d.TeamName || '', color: d.TeamColour ? `#${d.TeamColour}` : '#8b95a8', points: r.PredictedPoints, gained: (r.PredictedPoints || 0) - (r.CurrentPoints || 0), move: (r.CurrentPosition || 0) - (r.PredictedPosition || 0) }; }),
      teams: teams.map((t) => ({ pos: t.PredictedPosition, name: t.TeamName || '', color: teamColor(t.TeamName), points: t.PredictedPoints, gained: (t.PredictedPoints || 0) - (t.CurrentPoints || 0), move: (t.CurrentPosition || 0) - (t.PredictedPosition || 0) })),
    };
  }

  // Date du jour de la séance sur place (heure locale du circuit, sans décalage)
  const start = /^\d{4}-\d\d-\d\d/.test(info.StartDate || '') ? new Date(`${info.StartDate.slice(0, 10)}T12:00:00Z`) : null;
  return {
    kind, sprint, final: finished, label, gp, gpEn,
    country: info.Meeting?.Country?.Code || '', countryName: info.Meeting?.Country?.Name || '', circuit: info.Meeting?.Circuit?.ShortName || info.Meeting?.Location || '',
    date: start && !Number.isNaN(start.getTime()) ? start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '',
    year: start && !Number.isNaN(start.getTime()) ? start.getFullYear() : '',
    laps: state?.LapCount?.TotalLaps || null,
    rows, facts, champ, summary: buildSummary(state, { lang: 'fr' }),
  };
}

// Hashtag du compte du créateur, et hashtags des écuries
export const BRAND_TAG = '#BenjyPaddock';
const TEAM_TAGS = [
  [/racing bulls|visa|\brb\b/i, 'RacingBulls'], [/red bull/i, 'RedBullRacing'], [/ferrari/i, 'ScuderiaFerrari'],
  [/mclaren/i, 'McLaren'], [/mercedes/i, 'MercedesAMGF1'], [/aston/i, 'AstonMartinF1'], [/williams/i, 'WilliamsRacing'],
  [/alpine/i, 'AlpineF1Team'], [/haas/i, 'HaasF1'], [/audi|sauber|kick/i, 'AudiF1'], [/cadillac/i, 'CadillacF1'],
];
// Hashtag d'un Grand Prix : celui qu'utilisent la F1 et les fans quand il diffère du nom (« United States
// Grand Prix » : #USGP), sinon le nom suivi de GP (#ItalianGP)
const GP_TAGS = { 'United States': 'USGP', 'Mexico City': 'MexicoGP', 'São Paulo': 'BrazilGP' };
export const gpTag = (gpEn) => { const n = String(gpEn || '').replace(/ Grand Prix$/i, '').trim(); return n ? hashtag(GP_TAGS[n] || `${n}GP`) : ''; };
export const teamTag = (team) => hashtag(TEAM_TAGS.find(([re]) => re.test(team || ''))?.[1] || team);

// Hashtags selon les règles 2026 des réseaux : Instagram en refuse plus de 5 (les plus précis d'abord, le
// compte du créateur en dernier), X et Bluesky 2 au plus, Threads un seul (son sujet)
export function fiveTags(list) {
  const seen = new Set([BRAND_TAG.toLowerCase()]);
  return [...list.filter((t) => t && t.length > 2 && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())).slice(0, 4), BRAND_TAG];
}
// X et Bluesky : le compte du créateur et le mot-clé le plus précis
export const twoTags = (tags) => [BRAND_TAG, tags.find((t) => t !== '#F1' && t !== BRAND_TAG) || '#F1'];
export const THREADS_TAG = '#F1';
// Facebook : hashtags sans effet, retirés du texte Instagram
export const noTags = (text) => text.replace(/\n\n#[^\n]*$/, '');

export function hashtags(d) {
  const [p1] = d.rows;
  const all = fiveTags(['#F1', gpTag(d.gpEn), p1 ? hashtag(`${p1.first}${p1.last}`) : '', p1 ? teamTag(p1.team) : '']);
  return {
    all,
    x: twoTags(all),
    threads: [THREADS_TAG],
  };
}

// Drapeau du pays du Grand Prix en emoji (« 🇮🇹 »), vide si le pays est inconnu
export function flagEmoji(d) {
  const iso = d.iso || FLAG_ISO[String(d.country || '').toUpperCase()] || '';
  return /^[a-z]{2}$/i.test(iso) ? [...iso.toUpperCase()].map((c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0))).join('') : '';
}
// Nom du Grand Prix suivi de son drapeau
export const gpFlag = (d, name = d.gp) => [name, flagEmoji(d)].filter(Boolean).join(' ');
export const MEDALS = ['🥇', '🥈', '🥉'];
// Faits marquants : un emoji par type
const FACT_ICON = { 'Meilleur tour': '⏱️', 'Plus belle remontée': '🚀', 'Stratégie du vainqueur': '🛞', Neutralisations: '🚨', Abandons: '💥', 'Éliminés': '❌', 'Pneus du meilleur temps': '🛞', 'Le plus de tours': '🔁', 'Tours bouclés': '🔁', 'Dans la seconde': '🔥' };

// Accroche sans le nom du vainqueur (texte « sans spoiler », avec la couverture des visuels)
function teaser(d) {
  if (d.kind === 'race') return `🏁 Résultats ${d.sprint ? 'du sprint du' : 'du'} ${gpFlag(d)} : qui l'a emporté ? 👀 Réponse en images.`;
  if (d.kind === 'quali') return `🚦 ${d.label} du ${gpFlag(d)} : qui part en pole ? 👀 Réponse en images.`;
  return `⏱️ ${d.label} du ${gpFlag(d)} : qui signe le meilleur temps ? 👀 Réponse en images.`;
}

// Légendes prêtes à copier. spoiler: false : premières lignes et texte court sans le vainqueur
// (Instagram / Facebook n'affichent que le début de la légende : le détail suit, plus bas)
export function captions(d, signature = '', { spoiler = true } = {}) {
  if (!d.rows.length) return { instagram: '', x: '', threads: '', story: '' };
  const [p1, p2, p3] = d.rows;
  const sig = signature ? `\n\n${signature}` : '';
  const tags = hashtags(d);
  // Essais et qualifs : temps du premier aussi ; course : écarts seulement
  const podium = [p1, p2, p3].filter(Boolean).map((r, i) => `${MEDALS[i]} ${r.first} ${r.last} (${r.team})${(i || d.kind !== 'race') && r.gap ? ` ${r.gap}` : ''}`).join('\n');
  // Texte court : le premier, puis ses deux poursuivants avec leur médaille
  const chase = [p2, p3].map((r, i) => r && `${MEDALS[i + 1]} ${r.last}`).filter(Boolean).join(' · ');
  const gp = gpFlag(d);
  let head; let short;
  if (d.kind === 'race') {
    head = `🏆 ${p1.first} ${p1.last} remporte ${d.sprint ? 'le sprint du ' : 'le '}${gp} !`;
    short = `🏆 ${p1.last.toUpperCase()} remporte ${d.sprint ? 'le sprint du ' : 'le '}${gp} !`;
  } else if (d.kind === 'quali') {
    head = `⚡ Pole position pour ${p1.first} ${p1.last} au ${gp}${d.sprint ? ' (sprint)' : ''} !`;
    short = `⚡ POLE pour ${p1.last}${p1.gap ? ` en ${p1.gap}` : ''} au ${gp}${d.sprint ? ' (sprint)' : ''} !`;
  } else {
    head = `⏱️ ${d.label} du ${gp} : ${p1.first} ${p1.last} en tête !`;
    short = `⏱️ ${d.label} du ${gp} : ${p1.last} en tête !`;
  }
  if (chase) short += `\n${chase}`;
  const facts = d.facts.filter((f) => f.value && f.value !== 'Aucun').map((f) => `${FACT_ICON[f.label] || '📌'} ${f.label} : ${f.value}${f.sub ? ` (${f.sub})` : ''}`).join('\n');
  const story = d.summary.paragraphs.slice(0, 2).join(' ');
  if (!spoiler) {
    head = `${teaser(d)}\n👉 Fais défiler pour ${d.kind === 'practice' ? 'le top 3' : d.kind === 'quali' ? 'la grille' : 'le podium'} et tous les détails.\n\n.\n.\n.\n\n${head}`;
    short = teaser(d);
  }
  const instagram = `${head}\n\n${d.kind === 'quali' ? '🚦 Grille de départ' : d.kind === 'race' ? '🏁 Podium' : '📊 Top 3'} :\n${podium}${facts ? `\n\n${facts}` : ''}\n\n${story}${sig}\n\n${tags.all.join(' ')}`;
  // X : 280 caractères, hashtags retirés un à un si besoin (le compte du créateur reste)
  const xt = [...tags.x];
  let x = `${short}\n\n${xt.join(' ')}`;
  while (xLength(x) > 280 && xt.length > 1) { xt.pop(); x = `${short}\n\n${xt.join(' ')}`; }
  if (xLength(x) > 280) x = `${short.slice(0, 260 - xt[0].length)}… ${xt[0]}`;
  // Threads affiche tout le texte : sans spoiler, seulement l'accroche
  let threads = spoiler ? `${head}\n\n${podium}${sig}\n\n${tags.threads.join(' ')}` : `${short}${sig}\n\n${tags.threads.join(' ')}`;
  if (threads.length > 500) threads = `${spoiler ? head : short}\n\n${tags.threads.join(' ')}`.slice(0, 500);
  // Bluesky : même texte que X (300 caractères, pas de lien dans les posts des séances)
  return { instagram, facebook: noTags(instagram), x, bsky: x, threads, story: spoiler ? head : short };
}
