// Évolutions techniques et éléments moteur (documents officiels de la FIA) pour l'espace Saison de la version web.
// Chaque épreuve est lue par la tâche planifiée (une par passage) sur fia.com, ses PDF avec la même lecture que
// l'appli (shared/fia-tech.js), puis gardée dans la base. Épreuve récente (documents de moins de 4 jours) : relue
// toutes les heures ; épreuve sans documents (pas encore courue) : revue 6 heures plus tard.
import { getRow, setRow } from './alerts.js';
import { BASE, CHAMPIONSHIP, parseDocumentList, parseSeasons, seasonEventList } from '../shared/fia-list.js';
import { FIA_VERSION, pdfPages, eventData } from '../shared/fia-tech.js';
import { translateBatch } from './translate.js';

const UA = 'Mozilla/5.0 (Paddock-Live web relay)';
const EMPTY = 6 * 3600e3;     // épreuve sans documents ou illisible : nouvel essai 6 heures plus tard
const RECENT = 4 * 86400e3;   // documents publiés depuis moins de 4 jours : l'épreuve est relue
const REREAD = 3600e3;
const LOCK = 5 * 60e3;

// fia.com répond parfois trop tard (HTTP 522, 5xx) : deux nouveaux essais, 2 puis 4 s plus tard
async function get(url, fetchFn, wait = (ms) => new Promise((r) => setTimeout(r, ms))) {
  let r;
  for (let i = 0; i < 3; i++) {
    if (i) await wait(2000 * i);
    r = await fetchFn(url, { headers: { 'User-Agent': UA } }).catch(() => null);
    if (r?.status === 200) return r;
    if (r && r.status < 500) break;
  }
  throw new Error(`${url} : ${r ? `HTTP ${r.status}` : 'injoignable'}`);
}
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20);

// Épreuves d'une saison (pages de documents de fia.com), relues toutes les 12 heures
async function seasonEvents(env, year, now, fetchFn) {
  const row = JSON.parse(await getRow(env, `fiaevents:${year}`) || 'null');
  if (row && now - row.at < 12 * 3600e3) return row.events;
  const season = parseSeasons(await (await get(BASE + CHAMPIONSHIP, fetchFn)).text()).bySeason[year];
  const events = season ? seasonEventList(await (await get(BASE + season, fetchFn)).text()) : [];
  await setRow(env, `fiaevents:${year}`, JSON.stringify({ at: now, events }));
  return events;
}

// PDF lu une seule fois (un document publié ne change plus), résultat gardé
async function parsed(env, url, parser, fetchFn) {
  const k = `fiadoc:${await sha(url)}`;
  const hit = JSON.parse(await getRow(env, k) || 'null');
  if (hit?.v === FIA_VERSION) return hit.data;
  const data = parser(await pdfPages(new Uint8Array(await (await get(url, fetchFn)).arrayBuffer())));
  await setRow(env, k, JSON.stringify({ v: FIA_VERSION, data }));
  return data;
}

// Épreuves déjà lues de l'année : page -> { at, data } (data null : pas de documents)
async function kept(env, year) {
  const { results } = await env.DB.prepare('SELECT k, v FROM studio WHERE k LIKE ?').bind(`fiatech:${year}:%`).all();
  const out = new Map();
  for (const { v } of results || []) {
    try { const d = JSON.parse(v); if (d?.v === FIA_VERSION) out.set(d.page, d); } catch { /* ligne abîmée : relue */ }
  }
  return out;
}
// Épreuve à lire (jamais lue), à reprendre après une erreur (5 min, puis de plus en plus espacé ; les PDF déjà lus
// sont gardés, chaque essai avance), à relire (documents récents, ou traductions pas toutes faites) ou à revoir
// (sans documents)
const due = (e, now) => !e
  || (e.error ? now - e.at > Math.min(EMPTY, 5 * 60e3 * 2 ** ((e.fails || 1) - 1))
    : e.data ? (now - e.data.last < RECENT || (e.data.tech?.length && !e.data.trDone)) && now - e.at > REREAD
      : !e.empty || now - e.at > EMPTY);   // vide sans « empty » : lecture d'avant, peut-être ratée, refaite

// Évolutions techniques en français, traduites par le serveur (même traduction que les radios, gardée pour tous) :
// la version web n'a rien à traduire elle-même. Mêmes textes que la page (pièce, géométrie, description)
const techTexts = (data) => [...new Set((data?.tech || []).flatMap((u) => [u.component, u.geometry, u.description]).filter(Boolean))];
async function serverTranslate(env, texts) {
  const out = {};
  for (let i = 0; i < texts.length; i += 40) {
    const part = texts.slice(i, i + 40);
    const r = await translateBatch(env, { to: 'fr', items: part.map((text) => ({ text: text.slice(0, 2000), from: 'en' })) }).catch(() => null);
    part.forEach((t, j) => { if (r?.out?.[j]) out[t] = r.out[j]; });
  }
  return out;
}

// Lecture de la première épreuve de l'année à lire ou relire (une par appel, personne d'autre en même temps)
export async function fiaNext(env, year, { now = Date.now(), fetchFn = fetch, translate = (texts) => (env.AI ? serverTranslate(env, texts) : {}) } = {}) {
  if (!env.DB) return null;
  const events = await seasonEvents(env, year, now, fetchFn);
  const have = await kept(env, year);
  const ev = events.find((e) => due(have.get(e.page), now));
  if (!ev || now - Number(await getRow(env, `fialock:${year}`) || 0) < LOCK) return null;
  await setRow(env, `fialock:${year}`, String(now));
  let data = null, error;
  try {
    data = await eventData(ev, { documents: async (page) => parseDocumentList(await (await get(page, fetchFn)).text()), parsed: (url, parser) => parsed(env, url, parser, fetchFn) });
  } catch (err) { error = String(err.message || err); }
  if (data?.tech?.length) {
    // Traductions déjà faites (relecture) reprises ; seules les nouvelles sont demandées
    const texts = techTexts(data), old = have.get(ev.page)?.data?.tr || {};
    const kept = Object.fromEntries(texts.filter((t) => old[t]).map((t) => [t, old[t]]));
    const todo = texts.filter((t) => !kept[t]);
    data.tr = { ...kept, ...(todo.length ? await translate(todo).catch(() => ({})) : {}) };
    data.trDone = texts.every((t) => data.tr[t]);
  }
  // Erreur : la lecture précédente est gardée en attendant le nouvel essai
  const prev = have.get(ev.page);
  const row = error ? { v: FIA_VERSION, page: ev.page, at: now, data: prev?.data || null, error, fails: (prev?.fails || 0) + 1 } : { v: FIA_VERSION, page: ev.page, at: now, data: data && { ...data, at: now }, empty: !data };
  await setRow(env, `fiatech:${year}:${await sha(ev.page)}`, JSON.stringify(row));
  await setRow(env, `fialock:${year}`, '0');
  return { event: ev.name, ...(error ? { error } : {}) };
}

// Tâche planifiée : une épreuve par passage, pour l'année en cours ou une année demandée dans l'heure
export async function fiaTick(env, { now = Date.now(), fetchFn = fetch } = {}) {
  if (!env.DB) return null;
  const { results } = await env.DB.prepare('SELECT k, v FROM studio WHERE k LIKE ?').bind('fiawant:%').all();
  const years = [new Date(now).getUTCFullYear(), ...(results || []).filter((r) => now - Number(r.v) < 3600e3).map((r) => Number(r.k.slice(8)))];
  for (const y of new Set(years)) {
    const r = await fiaNext(env, y, { now, fetchFn });
    if (r) return { year: y, ...r };
  }
  return null;
}

// /live/api/season/fia : même forme que /api/season/fia de l'appli. Épreuves pas encore lues : demandées à la
// tâche planifiée (pending : la page relit l'avancement)
export async function seasonFiaWeb(env, year, { now = Date.now() } = {}) {
  const events = JSON.parse(await getRow(env, `fiaevents:${year}`) || 'null')?.events;
  const have = await kept(env, year);
  const pending = !events || events.some((e) => !have.has(e.page));
  if (pending && now - Number(await getRow(env, `fiawant:${year}`) || 0) > 10 * 60e3) await setRow(env, `fiawant:${year}`, String(now));
  const list = [...have.values()].map((e) => e.data).filter(Boolean).sort((a, b) => a.first - b.first);
  // failed : épreuves pas lues pour l'instant et la raison (nouvel essai automatique)
  const failed = [...have.values()].filter((e) => e.error).map((e) => ({ page: e.page, error: e.error, fails: e.fails }));
  return { year, pending: pending || failed.length > 0, done: have.size - failed.length, total: events?.length || have.size, events: list, failed };
}

// /live/api/translations : traductions des textes FIA faites par le serveur, sous la forme lue par la page
// (fia-translate.js : anglais -> { t, q })
export async function fiaTranslations(env) {
  const { results } = await env.DB.prepare('SELECT k, v FROM studio WHERE k LIKE ?').bind('fiatech:%').all();
  const out = {};
  for (const { v } of results || []) {
    try { for (const [en, t] of Object.entries(JSON.parse(v)?.data?.tr || {})) out[en] = { t, q: 'cloud' }; } catch { /* ligne abîmée */ }
  }
  return out;
}
