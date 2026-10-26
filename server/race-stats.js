// Statistiques détaillées de chaque Grand Prix de la saison, tirées des archives officielles
// F1 Live Timing : temps au tour (régularité, rythme), vitesses de pointe, arrêts aux stands,
// relais de pneus et profil du circuit. Chaque course terminée est analysée une seule fois
// (en arrière-plan), puis conservée sur disque.
import fs from 'node:fs';
import path from 'node:path';
import { archiveJSON } from './archive.js';
import { loadArchive, seasonIndex } from './replay.js';
import { circuit, CACHE_DIR } from './circuits.js';
import { season } from './season.js';
import { seasonNominations } from './tyres.js';
import { Track } from '../shared/track.js';
import { summarizeRace, findRaceSession, STATS_VERSION } from '../shared/race-stats.js';
import { fetchDhl, withDhl, DHL_PAGE } from '../shared/dhl-pits.js';
import { getText } from './net.js';

export { summarizeRace, trackLength, outline } from '../shared/race-stats.js';

async function keyframe(p, topic) {
  try { return await archiveJSON(`${p}${topic}.json`, { timeout: 60000 }); } catch { return null; }
}

async function analyseRace(p, circuitKey, year) {
  const arc = await loadArchive(p, undefined, ['TimingData', 'TrackStatus', 'TimingAppData']);
  const [TimingStats, PitStopSeries, DriverList, LapCount, TimingAppData] = await Promise.all(
    ['TimingStats', 'PitStopSeries', 'DriverList', 'LapCount', 'TimingAppData'].map((t) => keyframe(p, t)));
  let track = null;
  try {
    const raw = circuitKey ? await circuit(circuitKey, year) : null;
    if (raw) track = new Track(raw);
  } catch { /* profil sans tracé */ }
  return summarizeRace({ events: arc.events, keyframes: { TimingStats, PitStopSeries, DriverList, LapCount, TimingAppData }, track });
}

// Message lisible quand l'index des archives officielles d'une année est inaccessible
export function archiveError(year, err) {
  if (err?.locked) return err.message;   // archives réservées aux abonnés F1 TV
  return err?.status === 403 || err?.status === 404
    ? `la F1 ne donne pas accès aux archives officielles de ${year}`
    : `archives officielles de la F1 injoignables (${err?.message || err}) ; nouvel essai dans quelques minutes`;
}

const jobs = new Map();       // année -> { running, failed: Map(round -> date) }
const file = (year, round) => path.join(CACHE_DIR, `race-${year}-${round}.json`);
const readRace = (year, round) => {
  try {
    const d = JSON.parse(fs.readFileSync(file(year, round), 'utf8'));
    return d.v === STATS_VERSION ? d : null;
  } catch { return null; }
};

async function runJob(year, todo) {
  const job = jobs.get(year);
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const t = queue.shift();
      job.current = t.round;
      try {
        const res = await analyseRace(t.path, t.circuitKey, year);
        if (!res.drivers.some((d) => d.laps.length)) throw new Error('aucun tour dans l\'archive');
        fs.writeFileSync(file(year, t.round), JSON.stringify({ ...res, round: t.round, path: t.path }));
        console.log(`[stats] ${year} R${t.round} analysée (${t.path})`);
      } catch (err) {
        job.failed.set(t.round, Date.now());
        console.warn(`[stats] ${year} R${t.round} : ${err.message}`);
      }
    }
  };
  await Promise.all([worker(), worker()]);
  job.running = false;
  job.current = null;
}

// Arrêts au centième de DHL (saison en cours) : lus une fois par course puis gardés sur disque ; pas encore
// publiés par DHL : nouvel essai 6 heures plus tard
const DHL_URL = process.env.PADDOCK_DHL_URL ?? DHL_PAGE;
const dhlFile = (year, round) => path.join(CACHE_DIR, `dhl-${year}-${round}.json`);
const readDhl = (year, round) => { try { return JSON.parse(fs.readFileSync(dhlFile(year, round), 'utf8')); } catch { return null; } };
const dhlTried = new Map();   // « année-manche » -> date du dernier essai
let dhlRunning = false;
function refreshDhl(year, races) {
  const todo = races.filter((r) => !readDhl(year, r.round) && Date.now() - (dhlTried.get(`${year}-${r.round}`) || 0) > 6 * 3600e3);
  if (dhlRunning || !todo.length || year !== new Date().getFullYear() || !DHL_URL) return;
  dhlRunning = true;
  for (const r of todo) dhlTried.set(`${year}-${r.round}`, Date.now());
  fetchDhl(todo, async (url, json) => { const t = await getText(url, { timeout: 30000 }); return json ? JSON.parse(t) : t; }, DHL_URL)
    .then((found) => { for (const [round, rows] of found) fs.writeFileSync(dhlFile(year, round), JSON.stringify(rows)); })
    .catch((err) => console.warn(`[stats] arrêts DHL : ${err.message}`))
    .finally(() => { dhlRunning = false; });
}

// Statistiques de toutes les courses terminées de l'année. Les courses pas encore analysées
// sont traitées en arrière-plan : la réponse indique alors l'avancement (pending).
export async function seasonStats(year) {
  const sd = await season(year);
  const done = sd.races.filter((r) => r.results.length);
  const races = [];
  const todo = [];
  let index = null;
  const job = jobs.get(year) || { running: false, failed: new Map(), current: null };
  jobs.set(year, job);
  refreshDhl(year, done);
  for (const r of done) {
    const cached = readRace(year, r.round);
    if (cached) { races.push(withDhl(cached, readDhl(year, r.round))); continue; }
    if (job.running || Date.now() - (job.failed.get(r.round) || 0) < 10 * 60000) continue;
    if (!index) {
      try { index = await seasonIndex(year); } catch (err) { index = []; job.indexError = archiveError(year, err); }
    }
    const s = findRaceSession(index, r);
    if (s) todo.push({ round: r.round, ...s });
  }
  if (todo.length && !job.running) {
    job.running = true;
    runJob(year, todo).catch(() => { job.running = false; });
  }
  // Archives officielles inaccessibles et rien en cache : on le dit plutôt que « 0 / 22 »
  if (!races.length && !job.running && job.indexError) return { year, total: done.length, done: 0, pending: false, races, error: job.indexError };
  return { year, total: done.length, done: races.length, pending: job.running, races, tyres: seasonNominations(year, sd.races) };
}
