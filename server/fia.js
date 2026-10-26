// Documents officiels de la FIA (convocations, décisions des commissaires…) d'un Grand Prix,
// lus sur la page publique fia.com/documents, avec cache mémoire ; listes des épreuves terminées et
// PDF gardés sur le disque (ils ne changent plus) : réouverture immédiate, même après un redémarrage.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getText, request, HttpError } from './net.js';
import { DATA_DIR } from './config.js';
import { BASE, CHAMPIONSHIP, parseDocumentList, parseSeasons, seasonEventList, pickEvent } from '../shared/fia-list.js';

export { parseDocumentList, parsePublished, pickEvent } from '../shared/fia-list.js';

const TIMEOUT = 60000;
const DIR = path.join(DATA_DIR, '.cache', 'fia');
fs.mkdirSync(DIR, { recursive: true });
const fileOf = (key, ext) => path.join(DIR, `${crypto.createHash('sha1').update(key).digest('hex')}.${ext}`);
const readJSON = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

let seasonCache = null;

async function seasons() {
  if (seasonCache && Date.now() - seasonCache.at < 12 * 3600e3) return seasonCache;
  seasonCache = { at: Date.now(), ...parseSeasons(await getText(BASE + CHAMPIONSHIP, { timeout: TIMEOUT })) };
  return seasonCache;
}

// Épreuves d'une saison (pages de documents) : [{ name, page }]
export async function seasonEvents(year) {
  const s = await seasons();
  const season = s.bySeason[year];
  if (!season) return [];
  return seasonEventList(await getText(BASE + season, { timeout: TIMEOUT }));
}

export async function eventDocuments(page) {
  return parseDocumentList(await getText(page, { timeout: TIMEOUT }));
}

const cache = new Map();

export async function fiaDocuments(year, meeting) {
  const key = `${year}|${meeting.name}`;
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expires) return hit.job;
  const saved = !hit && readJSON(fileOf(key, 'json'));
  if (saved) { cache.set(key, { job: Promise.resolve(saved), expires: Date.now() + 12 * 3600e3 }); return saved; }
  const job = (async () => {
    const s = await seasons();
    const season = s.bySeason[year];
    if (!season) return { event: null, page: null, docs: [] };
    const event = pickEvent(s.events, meeting);
    if (!event) return { event: null, page: BASE + season, docs: [] };
    const page = `${BASE}${season}/event/${encodeURIComponent(event)}`;
    const docs = parseDocumentList(await getText(page, { timeout: TIMEOUT }));
    return { event, page, docs };
  })();
  cache.set(key, { job, expires: Date.now() + 90e3 });
  try {
    const res = await job;
    // Épreuve terminée depuis plusieurs jours : la liste ne bouge plus.
    const last = Math.max(0, ...res.docs.map((d) => d.published || 0));
    const settled = last && Date.now() - last > 4 * 86400e3;
    cache.set(key, { job, expires: Date.now() + (settled ? 12 * 3600e3 : 90e3) });
    if (settled) fs.promises.writeFile(fileOf(key, 'json'), JSON.stringify(res)).catch(() => {});
    return res;
  } catch (err) {
    if (hit) { cache.set(key, hit); return hit.job; }
    cache.delete(key);
    throw err;
  }
}

// PDF d'un document (fia.com l'envoie en téléchargement forcé) : relu une seule fois, puis servi depuis
// le disque pour être affiché dans l'appli ou le navigateur. Seuls les fichiers de fia.com sont acceptés.
export function fiaPdfUrl(raw) {
  let u;
  try { u = new URL(String(raw || '')); } catch { return null; }
  return u.protocol === 'https:' && u.hostname === 'www.fia.com' && u.pathname.startsWith('/system/files/') && /\.pdf$/i.test(u.pathname) ? u.toString() : null;
}
const pdfJobs = new Map();
export function fiaPdf(url) {
  const file = fileOf(url, 'pdf');
  if (fs.existsSync(file)) return fs.promises.readFile(file);
  if (!pdfJobs.has(url)) {
    pdfJobs.set(url, (async () => {
      const r = await request(url, { timeout: TIMEOUT });
      if (r.status !== 200) throw new HttpError(r.status, url);
      if (!r.body.subarray(0, 5).toString().startsWith('%PDF')) throw new Error('Document FIA illisible (pas un PDF)');
      await fs.promises.writeFile(file, r.body).catch(() => {});
      return r.body;
    })().finally(() => pdfJobs.delete(url)));
  }
  return pdfJobs.get(url);
}
