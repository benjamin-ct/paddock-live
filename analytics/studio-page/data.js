// Studio : données lues par la page (actu de toutes les sources, traductions, archives des séances).
// Gardées sur le téléphone pour un affichage immédiat à la visite suivante, puis relues.
import { clusterNews } from '/shared/news.js';
import { feedItems, decodeBody } from '/shared/news-collect.js';
import { unpackFeeds } from '/shared/feed-pack.js';
import { createDerived, applyEvent } from '/shared/derive.js';
import { api, mapLimit, session, store } from './ui.js';

// ---------- Traductions (serveur Paddock Live), gardées sur le téléphone ----------
const FR_MAX = 600;
const frCache = new Map(store.get('fr')?.v || []);
let frSave = null;
const keepFr = () => {
  clearTimeout(frSave);
  frSave = setTimeout(() => store.set('fr', [...frCache].slice(-FR_MAX)), 500);
};
// Textes en français ; null si la traduction a échoué. Les paquets partent en parallèle.
export async function toFrench(list) {
  const todo = [...new Map(list.filter((x) => x.text && x.from !== 'fr' && !frCache.has(`${x.from}|${x.text}`)).map((x) => [`${x.from}|${x.text}`, x])).values()];
  const parts = [];
  for (let i = 0; i < todo.length; i += 30) parts.push(todo.slice(i, i + 30));
  await Promise.all(parts.map(async (part) => {
    const res = await api('translate', { method: 'POST', body: JSON.stringify({ to: 'fr', items: part.map((x) => ({ text: x.text.slice(0, 1500), from: x.from })) }) }).catch(() => ({}));
    part.forEach((x, j) => { if (res.out?.[j]) frCache.set(`${x.from}|${x.text}`, res.out[j]); });
  }));
  if (todo.length) keepFr();
  return list.map((x) => (!x.text || x.from === 'fr' ? x.text : frCache.get(`${x.from}|${x.text}`) ?? null));
}
// Traduction déjà connue (sans attendre le serveur)
export const knownFrench = (text, from) => (!text || from === 'fr' ? text : frCache.get(`${from}|${text}`) ?? null);

// ---------- Actu : toutes les sources en une seule requête ----------
let news = null;          // nouvelles lues pendant cette visite
let newsAt = 0;
let newsLoading = null;
let newsLoadingAt = 0;
const NEWS_KEEP = 12 * 3600e3;

function finish(items) {
  items.sort((a, b) => a.t - b.t);
  clusterNews(items);
  const sizes = new Map();
  for (const it of items) { if (!sizes.has(it.cluster)) sizes.set(it.cluster, new Set()); sizes.get(it.cluster).add(it.src); }
  for (const it of items) it.sources = sizes.get(it.cluster).size;
  return items;
}

async function fetchNews() {
  const now = Date.now();
  const bySrc = new Map(session.me.sources.map((s) => [s.id, s]));
  const items = [];
  const got = new Set();
  try {
    const buf = new Uint8Array(await (await api('feeds', { raw: true })).arrayBuffer());
    for (const p of unpackFeeds(buf)) {
      const s = bySrc.get(p.id);
      if (!s) continue;
      try {
        const list = feedItems(s, await decodeBody(new Response(p.body, { headers: { 'Content-Type': p.type } })), now);
        if (list.length) { items.push(...list); got.add(p.id); }
      } catch { /* flux illisible */ }
    }
    // Sources absentes de cette lecture (lentes, en panne) : articles déjà connus gardés (moins de
    // 12 heures), sinon les grosses news reprises par ces médias disparaîtraient de la liste
    const prev = news || store.get('news', NEWS_KEEP)?.v || [];
    for (const it of prev) if (!got.has(it.src) && bySrc.has(it.src)) items.push({ ...it });
  } catch (err) {
    if (err.message === 'Code incorrect') throw err;
    // Serveur d'avant la lecture groupée : une requête par source
    await mapLimit(session.me.sources, 6, async (s) => {
      try { items.push(...feedItems(s, await decodeBody(await api(`feed?id=${encodeURIComponent(s.id)}`, { raw: true })), now)); } catch { /* source indisponible */ }
    });
  }
  return finish(items);
}

// Nouvelles connues : celles de cette visite, sinon celles gardées sur le téléphone (moins de 12 h)
export function cachedNews() {
  if (news) return { items: news, at: newsAt };
  const hit = store.get('news', NEWS_KEEP);
  return hit ? { items: hit.v, at: hit.at } : null;
}
// Nouvelles fraîches (une seule lecture à la fois)
const NEWS_FRESH = 3 * 60e3;   // nouvelles relues au plus toutes les 3 minutes (sauf « Actualiser »)
export function freshNews({ force = false } = {}) {
  if (!force && !news) {
    const hit = store.get('news', NEWS_FRESH);
    if (hit) { news = hit.v; newsAt = hit.at; }
  }
  if (news && !force && Date.now() - newsAt < NEWS_FRESH) return Promise.resolve(news);
  // Lecture en cours depuis plus de 45 s (bloquée pendant une mise en pause) : une nouvelle part
  if (newsLoading && Date.now() - newsLoadingAt < 45e3) return newsLoading;
  newsLoadingAt = Date.now();
  const job = fetchNews().then((items) => {
    news = items;
    newsAt = Date.now();
    // Gardées sans les champs inutiles à l'affichage (place limitée sur le téléphone)
    store.set('news', items.filter((it) => it.t > Date.now() - 8 * 86400e3).map(({ img, ...it }) => it));
    return items;
  });
  newsLoading = job;
  job.finally(() => { if (newsLoading === job) newsLoading = null; }).catch(() => {});
  return job;
}

// ---------- Séances (archives de la F1) ----------
export const TOPICS = ['SessionInfo', 'SessionStatus', 'DriverList', 'TimingData', 'TimingAppData', 'TimingStats', 'RaceControlMessages', 'LapCount', 'ChampionshipPrediction', 'WeatherData'];
const parseStream = (text, topic) => {
  const out = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^(\d+):(\d\d):(\d\d)\.(\d+)(.*)$/.exec(line);
    if (!m) continue;
    try { out.push({ off: ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + Math.round(+`0.${m[4]}` * 1000), topic, data: JSON.parse(m[5]) }); } catch { /* ligne illisible */ }
  }
  return out;
};

export async function loadState(path, topics = TOPICS) {
  const parts = await mapLimit(topics, 5, async (t) => {
    try { return parseStream(await (await api(`archive?p=${encodeURIComponent(`${path}${t}.jsonStream`)}`, { raw: true })).text(), t); } catch { return []; }
  });
  const events = parts.flat().sort((a, b) => a.off - b.off);
  if (!events.length) throw new Error('Archive de la séance indisponible (pas encore publiée, ou connexion F1 TV à renouveler dans l\'appli)');
  // État de fin de séance et tours de chaque pilote (dépassements des posts de résultats)
  const st = {};
  const derived = createDerived();
  for (const e of events) applyEvent(st, derived, e.topic, e.data, e.off);
  LAPS.set(st, derived.laps);
  return st;
}
const LAPS = new WeakMap();
export const lapsOf = (st) => LAPS.get(st) || null;

function parseOffset(v) {
  const m = /^\s*([+-])?(\d{1,2}):(\d{2})/.exec(String(v || ''));
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) * 60e3 : 0;
}
export const SESSION_FR = (n) => String(n).replace(/^Practice (\d)$/, 'Essais libres $1').replace('Sprint Qualifying', 'Qualifications sprint').replace('Sprint Shootout', 'Qualifications sprint').replace(/^Qualifying$/, 'Qualifications').replace(/^Race$/, 'Course');

// Séances terminées de la saison (30 dernières), gardées 30 minutes sur le téléphone
// (relues au plus toutes les 10 minutes, sauf « Actualiser »)
let sessions = null;
export const cachedSessions = () => sessions || store.get('sessions', 30 * 60e3)?.v || null;
export async function seasonSessions({ force = false } = {}) {
  if (!force && !sessions) sessions = store.get('sessions', 10 * 60e3)?.v || null;
  if (sessions && !force) return sessions;
  const year = new Date().getUTCFullYear();
  const out = [];
  for (const y of [year, year - 1]) {
    try {
      const idx = JSON.parse((await (await api(`archive?p=${y}/Index.json`, { raw: true })).text()).replace(/^﻿/, ''));
      for (const m of idx.Meetings || []) {
        for (const s of m.Sessions || []) {
          if (!s.Path || !s.EndDate) continue;
          const end = Date.parse(`${s.EndDate}Z`) - (parseOffset(s.GmtOffset) || 0);
          if (!(end < Date.now())) continue;
          out.push({ path: s.Path, name: s.Name, type: s.Type, end, gp: m.Name, country: m.Country?.Code });
        }
      }
      if (out.length) break;
    } catch { /* année absente */ }
  }
  sessions = out.sort((a, b) => b.end - a.end).slice(0, 30);
  store.set('sessions', sessions);
  return sessions;
}

// Pilotes de la dernière séance lue (photos et couleurs des news)
let lastDrivers = {};
export const rememberDrivers = (dl) => { if (dl && Object.keys(dl).length) lastDrivers = dl; };
export async function latestDrivers() {
  if (Object.keys(lastDrivers).length) return lastDrivers;
  try {
    const s = (await seasonSessions())[0];
    if (s) lastDrivers = (await loadState(s.path, ['DriverList'])).DriverList || {};
  } catch { /* archives indisponibles : pas de photo */ }
  return lastDrivers;
}
