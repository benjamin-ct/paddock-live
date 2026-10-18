// Résumé automatique d'une séance, rédigé en français (ou en anglais) à partir de l'état affiché
// (donc au rythme du délai TV, sans rien dévoiler d'avance) : podium, écart, remontées, stratégies,
// voitures de sécurité, abandons, pénalités, meilleur tour. Course, qualifications et essais.

import { realStints } from './pits.js';

const list = (o) => (!o ? [] : Array.isArray(o) ? o : Object.keys(o).sort((a, b) => a - b).map((k) => o[k]));
const COMP = { SOFT: 'tendres', MEDIUM: 'médiums', HARD: 'durs', INTERMEDIATE: 'intermédiaires', WET: 'pluie' };
const COMP_EN = { SOFT: 'soft', MEDIUM: 'medium', HARD: 'hard', INTERMEDIATE: 'intermediate', WET: 'wet' };
const LETTER = { SOFT: 'T', MEDIUM: 'M', HARD: 'D', INTERMEDIATE: 'I', WET: 'P' };

// Nom du Grand Prix en français (« Azerbaijan Grand Prix » -> « Grand Prix d'Azerbaïdjan »)
const GP_FR = {
  Australian: "d'Australie", Chinese: 'de Chine', Japanese: 'du Japon', Bahrain: 'de Bahreïn', 'Saudi Arabian': "d'Arabie saoudite",
  Miami: 'de Miami', 'Emilia Romagna': "d'Émilie-Romagne", Monaco: 'de Monaco', Spanish: "d'Espagne", 'Barcelona-Catalunya': 'de Barcelone-Catalogne',
  Canadian: 'du Canada', Austrian: "d'Autriche", British: 'de Grande-Bretagne', Belgian: 'de Belgique', Hungarian: 'de Hongrie',
  Dutch: 'des Pays-Bas', Italian: "d'Italie", Madrid: 'de Madrid', Azerbaijan: "d'Azerbaïdjan", Singapore: 'de Singapour',
  'United States': 'des États-Unis', 'Mexico City': 'de Mexico', 'São Paulo': 'de São Paulo', 'Las Vegas': 'de Las Vegas',
  Qatar: 'du Qatar', 'Abu Dhabi': "d'Abou Dhabi", Brazilian: 'du Brésil', Mexican: 'du Mexique', Portuguese: 'du Portugal', French: 'de France',
  German: "d'Allemagne", Turkish: 'de Turquie', Russian: 'de Russie', Styrian: 'de Styrie', Malaysian: 'de Malaisie', Korean: 'de Corée', Indian: "d'Inde",
};
export function gpNameFr(name) {
  // « Bahrain Grand Prix in Malaysia » (Grand Prix déplacé) : nom du Grand Prix seul
  const base = String(name || '').replace(/ Grand Prix( in .+)?$/i, '').trim();
  if (!base) return 'ce Grand Prix';
  return `le Grand Prix ${GP_FR[base] || `${/^[AEIOUÉÂ]/i.test(base) ? "d'" : 'de '}${base}`}`;
}
const num = (v) => String(v).replace('+', '').replace('.', ',');

function ordinal(n) { return n === 1 ? '1er' : `${n}e`; }
function joinFr(arr) { return arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} et ${arr.at(-1)}`; }
function ordinalEn(n) { const t = n % 100; return `${n}${t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`; }
function joinEn(arr) { return arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr.at(-1)}`; }

export function sessionKindOf(state) {
  const info = state?.SessionInfo || {};
  if (info.Type === 'Race') return 'race';
  if (info.Type === 'Qualifying' || /qualif|shootout/i.test(info.Name || '')) return 'quali';
  return 'practice';
}

// Pénalités annoncées par les commissaires (messages de la direction de course)
function penalties(msgs, name, en = false) {
  const out = [];
  for (const m of msgs) {
    const t = String(m?.Message || '');
    if (!/^FIA STEWARDS:.*PENALTY FOR/.test(t) || /NO FURTHER|REVIEWED/.test(t)) continue;
    const who = [...t.matchAll(/CAR (\d+) \((\w{3})\)/g)].map((x) => name(x[1]) || x[2]);
    const sec = t.match(/(\d+) SECOND TIME PENALTY/);
    const what = sec ? `${sec[1]} s` : /DRIVE THROUGH/.test(t) ? 'drive-through' : /STOP\/GO/.test(t) ? 'stop & go' : /GRID/.test(t) ? (en ? 'grid penalty' : 'pénalité sur la grille') : (en ? 'penalty' : 'pénalité');
    if (who.length) out.push(`${(en ? joinEn : joinFr)(who)} (${what})`);
  }
  return out;
}

export function buildSummary(state, { lang = 'fr' } = {}) {
  if (lang === 'en') return buildSummaryEn(state);
  const kind = sessionKindOf(state);
  const info = state?.SessionInfo || {};
  const gp = String(info.Meeting?.Name || '').trim() || 'ce Grand Prix';
  const dl = state?.DriverList || {};
  const lines = state?.TimingData?.Lines || {};
  const app = state?.TimingAppData?.Lines || {};
  const stats = state?.TimingStats?.Lines || {};
  const msgs = list(state?.RaceControlMessages?.Messages);
  const name = (n) => dl[n]?.LastName || dl[n]?.Tla || null;
  const tla = (n) => dl[n]?.Tla || n;
  const ranked = Object.keys(lines).filter((n) => Number(lines[n]?.Position) > 0).sort((a, b) => Number(lines[a].Position) - Number(lines[b].Position));
  const finished = ['Finished', 'Finalised', 'Ends'].includes(state?.SessionStatus?.Status);
  const lap = state?.LapCount;
  const out = { kind, final: finished, title: '', paragraphs: [] };
  if (!ranked.length) { out.title = 'Résumé indisponible'; out.paragraphs.push('Pas encore de classement pour cette séance.'); return out; }
  const [p1, p2, p3] = ranked;
  const team = (n) => dl[n]?.TeamName ? ` (${dl[n].TeamName})` : '';

  if (kind === 'race') {
    const label = /sprint/i.test(info.Name || '') ? 'le sprint' : gpNameFr(gp);
    out.title = finished ? `${name(p1)} remporte ${label}` : `${name(p1)} en tête (tour ${lap?.CurrentLap || '?'}${lap?.TotalLaps ? ` / ${lap.TotalLaps}` : ''})`;
    const gap2 = lines[p2]?.GapToLeader;
    let para = finished
      ? `${name(p1)}${team(p1)} s'impose devant ${name(p2)}${p3 ? ` et ${name(p3)}` : ''}`
      : `${name(p1)}${team(p1)} mène devant ${name(p2)}${p3 ? ` et ${name(p3)}` : ''}`;
    if (gap2 && /^\+?\d/.test(gap2)) para += `, avec ${num(gap2)} s d'avance sur son dauphin`;
    const grid1 = Number(app[p1]?.GridPos);
    if (grid1 > 1) para += `, après être parti ${ordinal(grid1)}`;
    else if (grid1 === 1) para += ', depuis la pole position';
    out.paragraphs.push(`${para}.`);

    // Abandons : retirés, ou arrêtés en piste. Course terminée : une voiture arrêtée qui a couvert
    // 90 % de la distance du vainqueur est classée (règle de la F1 ; garée après l'arrivée)
    const leaderLaps = Number(lines[p1]?.NumberOfLaps) || 0;
    const isOut = (n) => lines[n].Retired || (lines[n].Stopped && (!finished || (Number(lines[n].NumberOfLaps) || 0) < 0.9 * leaderLaps));
    // Remontées et reculs (grille -> position actuelle, pilotes encore en course)
    const moves = ranked.filter((n) => !isOut(n) && Number(app[n]?.GridPos) > 0)
      .map((n) => ({ n, d: Number(app[n].GridPos) - Number(lines[n].Position) }));
    const up = moves.filter((m) => m.d >= 4).sort((a, b) => b.d - a.d).slice(0, 3);
    const down = moves.filter((m) => m.d <= -4).sort((a, b) => a.d - b.d).slice(0, 2);
    if (up.length) out.paragraphs.push(`Belles remontées : ${joinFr(up.map((m) => `${name(m.n)} (${ordinal(Number(app[m.n].GridPos))} → ${ordinal(Number(lines[m.n].Position))}, +${m.d})`))}.`);
    if (down.length) out.paragraphs.push(`Course difficile pour ${joinFr(down.map((m) => `${name(m.n)} (${ordinal(Number(app[m.n].GridPos))} → ${ordinal(Number(lines[m.n].Position))})`))}.`);

    // Stratégies : celle du vainqueur et la plus courante
    const strat = (n) => realStints(list(app[n]?.Stints)).map((s) => s?.Compound).filter((c) => LETTER[c]);
    const s1 = strat(p1);
    if (s1.length) {
      const stops = s1.length - 1;
      out.paragraphs.push(`Stratégie de ${name(p1)} : ${stops === 0 ? 'aucun arrêt' : `${stops} arrêt${stops > 1 ? 's' : ''}`} (${s1.map((c) => COMP[c]).join(' → ')}).`);
    }
    const counts = new Map();
    for (const n of ranked) { const st = strat(n); if (st.length) { const k = st.map((c) => LETTER[c]).join('-'); counts.set(k, (counts.get(k) || 0) + 1); } }
    const common = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (common && common[1] >= 4) out.paragraphs.push(`Stratégie la plus courante : ${common[0]} (${common[1]} pilotes).`);

    // Neutralisations, abandons, pénalités, meilleur tour
    const sc = msgs.filter((m) => /^SAFETY CAR DEPLOYED/.test(m?.Message || '')).map((m) => m.Lap).filter(Boolean);
    const vsc = msgs.filter((m) => /^VIRTUAL SAFETY CAR DEPLOYED/.test(m?.Message || '')).map((m) => m.Lap).filter(Boolean);
    const red = msgs.filter((m) => m?.Flag === 'RED').map((m) => m.Lap).filter(Boolean);
    const neut = [];
    if (sc.length) neut.push(`${sc.length === 1 ? 'une voiture de sécurité' : `${sc.length} voitures de sécurité`} (tour${sc.length > 1 ? 's' : ''} ${joinFr(sc.map(String))})`);
    if (vsc.length) neut.push(`${vsc.length === 1 ? 'une VSC' : `${vsc.length} VSC`} (tour${vsc.length > 1 ? 's' : ''} ${joinFr(vsc.map(String))})`);
    if (red.length) neut.push(`${red.length === 1 ? 'un drapeau rouge' : `${red.length} drapeaux rouges`} (tour${red.length > 1 ? 's' : ''} ${joinFr(red.map(String))})`);
    out.paragraphs.push(neut.length ? `Course marquée par ${joinFr(neut)}.` : finished ? 'Aucune neutralisation : course disputée sous drapeau vert de bout en bout.' : 'Pas de neutralisation jusqu\'ici.');
    const out_ = ranked.filter(isOut).map(name);
    if (out_.length) out.paragraphs.push(`Abandon${out_.length > 1 ? 's' : ''} : ${joinFr(out_)}.`);
    const pen = penalties(msgs, name);
    if (pen.length) out.paragraphs.push(`Pénalités : ${joinFr(pen)}.`);
    const fl = Object.keys(stats).find((n) => stats[n]?.PersonalBestLapTime?.Position === 1);
    if (fl && stats[fl].PersonalBestLapTime.Value) out.paragraphs.push(`Meilleur tour : ${name(fl)} en ${stats[fl].PersonalBestLapTime.Value}${stats[fl].PersonalBestLapTime.Lap ? ` (tour ${stats[fl].PersonalBestLapTime.Lap})` : ''}.`);
  } else if (kind === 'quali') {
    const part = Number(state?.TimingData?.SessionPart) || 1;
    const best = (n) => list(lines[n]?.BestLapTimes)[part - 1]?.Value || lines[n]?.BestLapTime?.Value || '';
    const gap = (n) => list(lines[n]?.Stats)[part - 1]?.TimeDiffToFastest || '';
    out.title = finished && part >= 3 ? `Pole position pour ${name(p1)}` : `${name(p1)} en tête de la Q${part}`;
    out.paragraphs.push(`${name(p1)}${team(p1)} ${finished && part >= 3 ? 'signe la pole' : 'est en tête'}${best(p1) ? ` en ${best(p1)}` : ''}, devant ${name(p2)}${gap(p2) ? ` (${gap(p2)})` : ''}${p3 ? ` et ${name(p3)}${gap(p3) ? ` (${gap(p3)})` : ''}` : ''}.`);
    const ko = ranked.filter((n) => lines[n].KnockedOut).map(tla);
    if (ko.length) out.paragraphs.push(`Éliminés : ${joinFr(ko)}.`);
    const red = msgs.filter((m) => m?.Flag === 'RED').length;
    if (red) out.paragraphs.push(`Séance interrompue ${red === 1 ? 'une fois' : `${red} fois`} par le drapeau rouge.`);
    const pen = penalties(msgs, name);
    if (pen.length) out.paragraphs.push(`Pénalités : ${joinFr(pen)}.`);
  } else {
    out.title = `${name(p1)} ${finished ? 'termine' : 'est'} en tête de la séance`;
    out.paragraphs.push(`Meilleur temps pour ${name(p1)}${team(p1)}${lines[p1]?.BestLapTime?.Value ? ` en ${lines[p1].BestLapTime.Value}` : ''}, devant ${name(p2)}${lines[p2]?.TimeDiffToFastest ? ` (${lines[p2].TimeDiffToFastest})` : ''}${p3 ? ` et ${name(p3)}${lines[p3]?.TimeDiffToFastest ? ` (${lines[p3].TimeDiffToFastest})` : ''}` : ''}.`);
    const laps = ranked.map((n) => [n, Number(lines[n]?.NumberOfLaps) || 0]).sort((a, b) => b[1] - a[1]);
    if (laps[0]?.[1]) out.paragraphs.push(`Le plus de tours : ${name(laps[0][0])} (${laps[0][1]}).`);
    const red = msgs.filter((m) => m?.Flag === 'RED').length;
    if (red) out.paragraphs.push(`Séance interrompue ${red === 1 ? 'une fois' : `${red} fois`} par le drapeau rouge.`);
  }
  if (!finished) out.paragraphs.push('Résumé provisoire : la séance n\'est pas terminée (au rythme de votre délai TV).');
  return out;
}

// Même résumé, rédigé en anglais
function buildSummaryEn(state) {
  const kind = sessionKindOf(state);
  const info = state?.SessionInfo || {};
  const gp = String(info.Meeting?.Name || '').trim() || 'this Grand Prix';
  const dl = state?.DriverList || {};
  const lines = state?.TimingData?.Lines || {};
  const app = state?.TimingAppData?.Lines || {};
  const stats = state?.TimingStats?.Lines || {};
  const msgs = list(state?.RaceControlMessages?.Messages);
  const name = (n) => dl[n]?.LastName || dl[n]?.Tla || null;
  const tla = (n) => dl[n]?.Tla || n;
  const ranked = Object.keys(lines).filter((n) => Number(lines[n]?.Position) > 0).sort((a, b) => Number(lines[a].Position) - Number(lines[b].Position));
  const finished = ['Finished', 'Finalised', 'Ends'].includes(state?.SessionStatus?.Status);
  const lap = state?.LapCount;
  const out = { kind, final: finished, title: '', paragraphs: [] };
  if (!ranked.length) { out.title = 'Summary unavailable'; out.paragraphs.push('No classification for this session yet.'); return out; }
  const [p1, p2, p3] = ranked;
  const team = (n) => dl[n]?.TeamName ? ` (${dl[n].TeamName})` : '';
  const times = (k) => (k === 1 ? 'once' : k === 2 ? 'twice' : `${k} times`);

  if (kind === 'race') {
    const label = /sprint/i.test(info.Name || '') ? 'the sprint' : `the ${gp}`;
    out.title = finished ? `${name(p1)} wins ${label}` : `${name(p1)} leads (lap ${lap?.CurrentLap || '?'}${lap?.TotalLaps ? ` / ${lap.TotalLaps}` : ''})`;
    const gap2 = lines[p2]?.GapToLeader;
    let para = `${name(p1)}${team(p1)} ${finished ? 'wins ahead of' : 'leads'} ${name(p2)}${p3 ? ` and ${name(p3)}` : ''}`;
    if (gap2 && /^\+?\d/.test(gap2)) para += `, ${String(gap2).replace('+', '')} s clear of second place`;
    const grid1 = Number(app[p1]?.GridPos);
    if (grid1 > 1) para += `, having started ${ordinalEn(grid1)}`;
    else if (grid1 === 1) para += ', from pole position';
    out.paragraphs.push(`${para}.`);

    const leaderLaps = Number(lines[p1]?.NumberOfLaps) || 0;
    const isOut = (n) => lines[n].Retired || (lines[n].Stopped && (!finished || (Number(lines[n].NumberOfLaps) || 0) < 0.9 * leaderLaps));
    const moves = ranked.filter((n) => !isOut(n) && Number(app[n]?.GridPos) > 0)
      .map((n) => ({ n, d: Number(app[n].GridPos) - Number(lines[n].Position) }));
    const up = moves.filter((m) => m.d >= 4).sort((a, b) => b.d - a.d).slice(0, 3);
    const down = moves.filter((m) => m.d <= -4).sort((a, b) => a.d - b.d).slice(0, 2);
    if (up.length) out.paragraphs.push(`Great comebacks: ${joinEn(up.map((m) => `${name(m.n)} (${ordinalEn(Number(app[m.n].GridPos))} → ${ordinalEn(Number(lines[m.n].Position))}, +${m.d})`))}.`);
    if (down.length) out.paragraphs.push(`A difficult race for ${joinEn(down.map((m) => `${name(m.n)} (${ordinalEn(Number(app[m.n].GridPos))} → ${ordinalEn(Number(lines[m.n].Position))})`))}.`);

    const strat = (n) => realStints(list(app[n]?.Stints)).map((s) => s?.Compound).filter((c) => LETTER[c]);
    const s1 = strat(p1);
    if (s1.length) {
      const stops = s1.length - 1;
      out.paragraphs.push(`${name(p1)}'s strategy: ${stops === 0 ? 'no stops' : `${stops} stop${stops > 1 ? 's' : ''}`} (${s1.map((c) => COMP_EN[c]).join(' → ')}).`);
    }
    const counts = new Map();
    for (const n of ranked) { const st = strat(n); if (st.length) { const k = st.map((c) => c[0]).join('-'); counts.set(k, (counts.get(k) || 0) + 1); } }
    const common = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (common && common[1] >= 4) out.paragraphs.push(`Most common strategy: ${common[0]} (${common[1]} drivers).`);

    const sc = msgs.filter((m) => /^SAFETY CAR DEPLOYED/.test(m?.Message || '')).map((m) => m.Lap).filter(Boolean);
    const vsc = msgs.filter((m) => /^VIRTUAL SAFETY CAR DEPLOYED/.test(m?.Message || '')).map((m) => m.Lap).filter(Boolean);
    const red = msgs.filter((m) => m?.Flag === 'RED').map((m) => m.Lap).filter(Boolean);
    const neut = [];
    const laps = (a) => `(lap${a.length > 1 ? 's' : ''} ${joinEn(a.map(String))})`;
    if (sc.length) neut.push(`${sc.length === 1 ? 'a safety car' : `${sc.length} safety cars`} ${laps(sc)}`);
    if (vsc.length) neut.push(`${vsc.length === 1 ? 'a VSC' : `${vsc.length} VSCs`} ${laps(vsc)}`);
    if (red.length) neut.push(`${red.length === 1 ? 'a red flag' : `${red.length} red flags`} ${laps(red)}`);
    out.paragraphs.push(neut.length ? `A race marked by ${joinEn(neut)}.` : finished ? 'No neutralisation: green flag from start to finish.' : 'No neutralisation so far.');
    const out_ = ranked.filter(isOut).map(name);
    if (out_.length) out.paragraphs.push(`Retirement${out_.length > 1 ? 's' : ''}: ${joinEn(out_)}.`);
    const pen = penalties(msgs, name, true);
    if (pen.length) out.paragraphs.push(`Penalties: ${joinEn(pen)}.`);
    const fl = Object.keys(stats).find((n) => stats[n]?.PersonalBestLapTime?.Position === 1);
    if (fl && stats[fl].PersonalBestLapTime.Value) out.paragraphs.push(`Fastest lap: ${name(fl)} in ${stats[fl].PersonalBestLapTime.Value}${stats[fl].PersonalBestLapTime.Lap ? ` (lap ${stats[fl].PersonalBestLapTime.Lap})` : ''}.`);
  } else if (kind === 'quali') {
    const part = Number(state?.TimingData?.SessionPart) || 1;
    const best = (n) => list(lines[n]?.BestLapTimes)[part - 1]?.Value || lines[n]?.BestLapTime?.Value || '';
    const gap = (n) => list(lines[n]?.Stats)[part - 1]?.TimeDiffToFastest || '';
    out.title = finished && part >= 3 ? `Pole position for ${name(p1)}` : `${name(p1)} tops Q${part}`;
    out.paragraphs.push(`${name(p1)}${team(p1)} ${finished && part >= 3 ? 'takes pole' : 'is on top'}${best(p1) ? ` with ${best(p1)}` : ''}, ahead of ${name(p2)}${gap(p2) ? ` (${gap(p2)})` : ''}${p3 ? ` and ${name(p3)}${gap(p3) ? ` (${gap(p3)})` : ''}` : ''}.`);
    const ko = ranked.filter((n) => lines[n].KnockedOut).map(tla);
    if (ko.length) out.paragraphs.push(`Knocked out: ${joinEn(ko)}.`);
    const red = msgs.filter((m) => m?.Flag === 'RED').length;
    if (red) out.paragraphs.push(`Session stopped ${times(red)} by a red flag.`);
    const pen = penalties(msgs, name, true);
    if (pen.length) out.paragraphs.push(`Penalties: ${joinEn(pen)}.`);
  } else {
    out.title = `${name(p1)} ${finished ? 'ends the session on top' : 'tops the session'}`;
    out.paragraphs.push(`Fastest time for ${name(p1)}${team(p1)}${lines[p1]?.BestLapTime?.Value ? ` with ${lines[p1].BestLapTime.Value}` : ''}, ahead of ${name(p2)}${lines[p2]?.TimeDiffToFastest ? ` (${lines[p2].TimeDiffToFastest})` : ''}${p3 ? ` and ${name(p3)}${lines[p3]?.TimeDiffToFastest ? ` (${lines[p3].TimeDiffToFastest})` : ''}` : ''}.`);
    const laps = ranked.map((n) => [n, Number(lines[n]?.NumberOfLaps) || 0]).sort((a, b) => b[1] - a[1]);
    if (laps[0]?.[1]) out.paragraphs.push(`Most laps: ${name(laps[0][0])} (${laps[0][1]}).`);
    const red = msgs.filter((m) => m?.Flag === 'RED').length;
    if (red) out.paragraphs.push(`Session stopped ${times(red)} by a red flag.`);
  }
  if (!finished) out.paragraphs.push('Provisional summary: the session isn\'t over (in step with your TV delay).');
  return out;
}

// Mêmes éléments que le résumé, en données (pour l'affichage en cartes : résumé et page Résultats)
export function summaryFacts(state, { lang = 'fr' } = {}) {
  const kind = sessionKindOf(state);
  const dl = state?.DriverList || {};
  const lines = state?.TimingData?.Lines || {};
  const app = state?.TimingAppData?.Lines || {};
  const stats = state?.TimingStats?.Lines || {};
  const msgs = list(state?.RaceControlMessages?.Messages);
  const ranked = Object.keys(lines).filter((n) => Number(lines[n]?.Position) > 0).sort((a, b) => Number(lines[a].Position) - Number(lines[b].Position));
  const finished = ['Finished', 'Finalised', 'Ends'].includes(state?.SessionStatus?.Status);
  const part = Number(state?.TimingData?.SessionPart) || 1;
  const drv = (n) => ({ n, tla: dl[n]?.Tla || n, name: dl[n]?.LastName || dl[n]?.Tla || n, team: dl[n]?.TeamName || '', color: dl[n]?.TeamColour ? `#${dl[n].TeamColour}` : '#8b95a8', pos: Number(lines[n]?.Position) || null });
  const f = { kind, final: finished, lap: state?.LapCount?.CurrentLap || null, total: state?.LapCount?.TotalLaps || null, part, top: [], ranked };
  if (!ranked.length) return f;
  const redFlags = msgs.filter((m) => m?.Flag === 'RED').map((m) => m.Lap || null);
  if (kind === 'race') {
    const leaderLaps = Number(lines[ranked[0]]?.NumberOfLaps) || 0;
    const isOut = (n) => lines[n].Retired || (lines[n].Stopped && (!finished || (Number(lines[n].NumberOfLaps) || 0) < 0.9 * leaderLaps));
    f.top = ranked.slice(0, 3).map((n, i) => ({ ...drv(n), gap: i ? lines[n]?.GapToLeader || '' : '', grid: Number(app[n]?.GridPos) || null }));
    const moves = ranked.filter((n) => !isOut(n) && Number(app[n]?.GridPos) > 0)
      .map((n) => ({ ...drv(n), from: Number(app[n].GridPos), to: Number(lines[n].Position), d: Number(app[n].GridPos) - Number(lines[n].Position) }));
    f.up = moves.filter((m) => m.d >= 4).sort((a, b) => b.d - a.d).slice(0, 3);
    f.down = moves.filter((m) => m.d <= -4).sort((a, b) => a.d - b.d).slice(0, 2);
    const strat = (n) => realStints(list(app[n]?.Stints)).map((s) => s?.Compound).filter((c) => LETTER[c]);
    f.leaderStrat = strat(ranked[0]);
    const counts = new Map();
    for (const n of ranked) { const st = strat(n); if (st.length) { const k = st.join('-'); counts.set(k, (counts.get(k) || 0) + 1); } }
    const common = [...counts].sort((a, b) => b[1] - a[1])[0];
    f.common = common && common[1] >= 4 ? { comps: common[0].split('-'), count: common[1] } : null;
    f.sc = msgs.filter((m) => /^SAFETY CAR DEPLOYED/.test(m?.Message || '')).map((m) => m.Lap).filter(Boolean);
    f.vsc = msgs.filter((m) => /^VIRTUAL SAFETY CAR DEPLOYED/.test(m?.Message || '')).map((m) => m.Lap).filter(Boolean);
    f.red = redFlags.filter(Boolean);
    f.out = ranked.filter(isOut).map(drv);
    const fl = Object.keys(stats).find((n) => stats[n]?.PersonalBestLapTime?.Position === 1);
    if (fl && stats[fl].PersonalBestLapTime.Value) f.fastest = { ...drv(fl), time: stats[fl].PersonalBestLapTime.Value, lap: stats[fl].PersonalBestLapTime.Lap || null };
  } else if (kind === 'quali') {
    const best = (n) => list(lines[n]?.BestLapTimes)[part - 1]?.Value || lines[n]?.BestLapTime?.Value || '';
    const gap = (n) => list(lines[n]?.Stats)[part - 1]?.TimeDiffToFastest || '';
    f.top = ranked.slice(0, 3).map((n, i) => ({ ...drv(n), time: best(n), gap: i ? gap(n) : '' }));
    // Éliminés, par partie : la dernière partie où le pilote a un temps
    const lastPart = (n) => list(lines[n]?.BestLapTimes).reduce((k, x, i) => (x?.Value ? i + 1 : k), 0) || 1;
    f.knocked = {};
    for (const n of ranked.filter((x) => lines[x].KnockedOut)) (f.knocked[lastPart(n)] ||= []).push(drv(n));
    f.red = redFlags;
  } else {
    f.top = ranked.slice(0, 3).map((n, i) => ({ ...drv(n), time: lines[n]?.BestLapTime?.Value || '', gap: i ? lines[n]?.TimeDiffToFastest || '' : '' }));
    const laps = ranked.map((n) => [n, Number(lines[n]?.NumberOfLaps) || 0]).sort((a, b) => b[1] - a[1]);
    if (laps[0]?.[1]) f.mostLaps = { ...drv(laps[0][0]), laps: laps[0][1] };
    f.red = redFlags;
  }
  const name = (n) => dl[n]?.LastName || dl[n]?.Tla || null;
  f.penalties = penalties(msgs, name, lang === 'en');
  return f;
}
