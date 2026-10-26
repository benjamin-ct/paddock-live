// Statistiques détaillées des courses pour l'espace Saison de la version web (régularité, arrêts aux stands, vitesses
// de pointe, profil des circuits, notes des pilotes). Chaque course terminée est analysée une seule fois par le
// serveur, d'après les archives officielles de la F1 lues avec la connexion F1 TV du créateur (copie à part, voir
// archiveToken), puis gardée dans la base. Même calcul que l'appli (shared/race-stats.js).
import { seasonRow, archiveToken } from './studio.js';
import { getRow, setRow } from './alerts.js';
import { summarizeRace, findRaceSession, parseStream, indexMeetings, STATS_VERSION } from '../shared/race-stats.js';
import { topicName } from '../shared/f1.js';
import { Track } from '../shared/track.js';

const ARCHIVE = 'https://livetiming.formula1.com/static/';
const UA = 'Mozilla/5.0 (Paddock-Live web relay)';
const RETRY = 6 * 3600e3;     // archive absente ou illisible : nouvel essai 6 heures plus tard
const LOCK = 5 * 60e3;        // une seule analyse à la fois par année
const FINISHED_AGE = 7 * 86400e3;   // saison finie : relue chez Jolpica une fois par semaine

const json = (d, status = 200, headers = {}) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const season = (env, year, now) => seasonRow(env, year, year < new Date(now).getUTCFullYear() ? { now, maxAge: FINISHED_AGE } : { now });

// Tracé d'un circuit (API MultiViewer, l'année demandée ou une des précédentes), gardé un jour
export async function circuitData(key, year, fetchFn = fetch) {
  const ck = new Request(`https://live.cache/circuit/${key}/${year}`);
  const hit = await caches.default.match(ck);
  if (hit) return hit.json();
  for (let y = year; y >= year - 6; y--) {
    const r = await fetchFn(`https://api.multiviewer.app/api/v1/circuits/${key}/${y}`, { headers: { 'User-Agent': UA } }).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    if (Array.isArray(d?.x) && d.x.length) {
      await caches.default.put(ck, json(d, 200, { 'Cache-Control': 'public, max-age=86400' }));
      return d;
    }
  }
  return null;
}

async function archiveText(rel, token, fetchFn) {
  const r = await fetchFn(ARCHIVE + rel, { headers: { 'User-Agent': UA, Authorization: `Bearer ${token}`, ascendontoken: token } });
  if (r.status !== 200) throw new Error(`${rel} : HTTP ${r.status}`);
  return (await r.text()).replace(/^﻿/, '');
}

// Analyse d'une course : flux du chronométrage, états finaux et tracé du circuit
async function analyse(race, year, token, fetchFn) {
  const s = findRaceSession(indexMeetings(JSON.parse(await archiveText(`${year}/Index.json`, token, fetchFn))), race);
  if (!s) throw new Error('course absente de l\'index des archives');
  const streams = await Promise.all(['TimingData', 'TrackStatus', 'TimingAppData'].map(async (t) => parseStream(await archiveText(`${s.path}${t}.jsonStream`, token, fetchFn), t)));
  const events = streams.flat().map((e) => ({ off: e.off, topic: topicName(e.topic), data: e.data })).sort((a, b) => a.off - b.off);
  const keyframes = Object.fromEntries(await Promise.all(['TimingStats', 'PitStopSeries', 'DriverList', 'LapCount', 'TimingAppData']
    .map(async (t) => [t, await archiveText(`${s.path}${t}.json`, token, fetchFn).then(JSON.parse).catch(() => null)])));
  let track = null;
  try {
    const raw = s.circuitKey ? await circuitData(s.circuitKey, year, fetchFn) : null;
    if (raw) track = new Track(raw);
  } catch { /* profil sans tracé */ }
  const res = summarizeRace({ events, keyframes, track });
  // Détail dans la raison (séance trouvée, messages lus, pilotes) : dit si l'archive est vide ou mal reliée
  if (!res.drivers.some((d) => d.laps.length)) throw new Error(`aucun tour dans l'archive (${s.path} · ${events.length} messages · ${res.drivers.length} pilotes)`);
  return { ...res, round: race.round, path: s.path };
}

// Courses de l'année déjà analysées (manche -> résumé) et essais ratés récents (manche -> date)
async function kept(env, year) {
  const { results } = await env.DB.prepare('SELECT k, v FROM studio WHERE k LIKE ?').bind(`racestats:${year}:%`).all();
  const done = new Map(), failed = new Map(), errors = [];
  for (const { k, v } of results || []) {
    const round = Number(k.split(':')[2]);
    let d;
    try { d = JSON.parse(v); } catch { continue; }
    if (d?.v === STATS_VERSION) done.set(round, d);
    else if (d?.failed) { failed.set(round, d.failed); errors.push({ round, error: d.error, at: d.failed }); }
  }
  return { done, failed, errors };
}

// Analyse de la course terminée la plus ancienne qui manque encore (une par appel, personne d'autre en même temps)
export async function analyseNext(env, year, { now = Date.now(), fetchFn = fetch } = {}) {
  if (!env.DB) return null;
  const races = (await season(env, year, now)).v.races.filter((r) => r.results?.length);
  const { done, failed } = await kept(env, year);
  const race = races.find((r) => !done.has(r.round) && now - (failed.get(r.round) || 0) > RETRY);
  if (!race || now - Number(await getRow(env, `racelock:${year}`) || 0) < LOCK) return null;
  const token = await archiveToken(env, { now, fetchFn });
  if (!token) return { round: race.round, error: 'connexion F1 TV absente ou expirée' };
  await setRow(env, `racelock:${year}`, String(now));
  try {
    const res = await analyse(race, year, token, fetchFn);
    await setRow(env, `racestats:${year}:${race.round}`, JSON.stringify(res));
    return { round: race.round };
  } catch (err) {
    await setRow(env, `racestats:${year}:${race.round}`, JSON.stringify({ failed: now, error: String(err.message || err) }));
    return { round: race.round, error: err.message };
  } finally {
    await setRow(env, `racelock:${year}`, '0');
  }
}

// Tâche planifiée (chaque minute) : courses analysées l'une après l'autre tant qu'il reste du temps (20 s), pour
// l'année en cours ou une année demandée depuis la version web dans l'heure ; arrêt à la première erreur
export async function statsTick(env, { now = Date.now(), fetchFn = fetch, budget = 20e3 } = {}) {
  if (!env.DB || !env.STATS_KEY) return null;
  const { results } = await env.DB.prepare('SELECT k, v FROM studio WHERE k LIKE ?').bind('racewant:%').all();
  const years = [new Date(now).getUTCFullYear(), ...(results || []).filter((r) => now - Number(r.v) < 3600e3).map((r) => Number(r.k.slice(9)))];
  const t0 = Date.now();
  let last = null;
  for (const y of new Set(years)) {
    while (Date.now() - t0 < budget) {
      const r = await analyseNext(env, y, { now, fetchFn });
      if (!r) break;
      last = { year: y, ...r, done: (last?.done || 0) + (r.error ? 0 : 1) };
      if (r.error) break;
    }
    if (last) return last;
  }
  return null;
}

// /live/api/season/stats : même forme que /api/season/stats de l'appli. Les courses qui manquent sont demandées à
// la tâche planifiée (pending : la page relit l'avancement)
export async function seasonStatsWeb(env, year, { now = Date.now(), fetchFn = fetch } = {}) {
  const races = (await season(env, year, now)).v.races.filter((r) => r.results?.length);
  const { done, failed, errors } = await kept(env, year);
  const missing = races.some((r) => !done.has(r.round) && now - (failed.get(r.round) || 0) > RETRY);
  const pending = missing && !!await archiveToken(env, { now, fetchFn });
  if (pending && now - Number(await getRow(env, `racewant:${year}`) || 0) > 10 * 60e3) await setRow(env, `racewant:${year}`, String(now));
  const list = races.map((r) => done.get(r.round)).filter(Boolean);
  // failed : courses pas analysées et la raison (nouvel essai 6 heures plus tard)
  const out = { year, total: races.length, done: list.length, pending, races: list, tyres: {}, failed: errors };
  if (!list.length && !pending && races.length) out.error = 'statistiques pas encore calculées par le serveur';
  return out;
}
