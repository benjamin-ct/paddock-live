// Évolutions techniques et éléments moteur de la saison, lus dans les documents officiels de
// la FIA publiés à chaque Grand Prix (fia.com) :
//  - « Car Presentation Submissions » : pièces nouvelles ou modifiées par chaque écurie ;
//  - « PU Elements used per Driver up to now » / « New PU Elements for this Competition » :
//    éléments du groupe propulseur utilisés par pilote ;
//  - « Infringement - Car N - PU element(s) » : pénalités sur la grille.
// Les PDF sont lus une fois puis le résultat est gardé sur disque.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { request } from './net.js';
import { seasonEvents, eventDocuments } from './fia.js';
import { CACHE_DIR } from './circuits.js';
import { FIA_VERSION, pdfPages, eventData } from '../shared/fia-tech.js';

export { pdfPages, lines, parseTechUpdates, parsePuUsed, parsePuNew, parsePuPenalty, classify, teamOf } from '../shared/fia-tech.js';

// ---------------- Collecte ----------------
const jobs = new Map();
const cacheFile = (url) => path.join(CACHE_DIR, `fia-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)}.json`);

async function parsedDoc(url, parser) {
  const f = cacheFile(url);
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (d.v === FIA_VERSION) return d.data;
  } catch { /* pas en cache */ }
  const r = await request(url, { timeout: 120000 });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const data = parser(await pdfPages(r.body));
  fs.writeFileSync(f, JSON.stringify({ v: FIA_VERSION, data }));
  return data;
}

async function runJob(year, events) {
  const job = jobs.get(year);
  const queue = [...events];
  const worker = async () => {
    while (queue.length) {
      const ev = queue.shift();
      try {
        const d = await eventData(ev, { documents: eventDocuments, parsed: parsedDoc });
        if (d) job.events.set(ev.page, { ...d, at: Date.now() });
      } catch (err) {
        console.warn(`[fia] ${ev.name} : ${err.message}`);
      }
      job.done++;
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  job.running = false;
  job.at = Date.now();
}

// Données de toutes les épreuves de l'année. Première fois : lecture en arrière-plan (pending).
// Les épreuves récentes (documents publiés il y a moins de 4 jours) sont relues toutes les 15 min.
export async function seasonTech(year) {
  const job = jobs.get(year) || { running: false, events: new Map(), done: 0, total: 0, at: 0 };
  jobs.set(year, job);
  if (!job.running && Date.now() - job.at > 15 * 60000) {
    const events = await seasonEvents(year);
    const todo = events.filter((ev) => {
      const e = job.events.get(ev.page);
      return !e || Date.now() - e.last < 4 * 86400e3;
    });
    if (todo.length) {
      job.running = true;
      job.done = events.length - todo.length;
      job.total = events.length;
      runJob(year, todo).catch(() => { job.running = false; });
    } else job.at = Date.now();
  }
  const events = [...job.events.values()].sort((a, b) => a.first - b.first);
  return { year, pending: job.running, done: job.done, total: job.total || events.length, events };
}
