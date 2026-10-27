// Actualités de la F1 (onglet Actu) : lues, triées et regroupées par sujet par le serveur de Paddock Live (/news/api),
// relues ici chaque minute. Ici restent les sources que l'utilisateur a décochées (gardées dans config.json) et les
// nouveautés signalées à l'interface (alertes) et à la traduction d'avance.
import { getJSON } from './net.js';
import { getConfig, saveConfig } from './config.js';
import { SEASON_URL } from './season.js';

const EVERY = 60e3;
const FRESH_MS = 20 * 60e3;   // au lancement : seules les nouvelles découvertes depuis moins de 20 min sont signalées

let data = { items: [], sources: [] };
let known = null;             // identifiants déjà reçus (null avant la première lecture)
let started = false;
const listeners = new Set();
const startedAt = Date.now();

const disabled = () => new Set(Array.isArray(getConfig().news?.disabled) ? getConfig().news.disabled : []);

async function poll() {
  try {
    const d = await getJSON(`${SEASON_URL}/news/api`, { timeout: 30000 });
    if (!Array.isArray(d?.items)) return;
    const off = disabled();
    const fresh = d.items.filter((it) => !off.has(it.src) && (known ? !known.has(it.id) : Date.now() - (it.seen || 0) < FRESH_MS));
    known = new Set(d.items.map((it) => it.id));
    data = { items: d.items, sources: d.sources || [] };
    if (fresh.length) for (const fn of listeners) { try { fn(fresh); } catch { /* ignore */ } }
  } catch (err) {
    console.warn('[actu]', err.message);
  }
}

export function onNews(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function startNews() {
  if (started || process.env.NO_NEWS) return;
  started = true;
  poll();
  setInterval(poll, EVERY).unref?.();
}

export const refreshNews = () => poll();

export function newsSnapshot({ limit = 800 } = {}) {
  const off = disabled();
  return {
    items: data.items.filter((it) => !off.has(it.src)).slice(0, limit),
    sources: data.sources.map((s) => ({ ...s, enabled: !off.has(s.id) })),
    startedAt,
  };
}

export function setNewsSourceEnabled(id, on) {
  const now = disabled();
  if (on) now.delete(id); else now.add(id);
  saveConfig({ news: { disabled: [...now] } });
}

// Restauration d'une sauvegarde des réglages : sources décochées (les sources ajoutées par les anciennes versions ne
// sont plus lues : les sources en plus s'ajoutent sur le serveur)
export function importNewsConfig(cfg) {
  const ids = (Array.isArray(cfg?.disabled) ? cfg.disabled : []).filter((id) => typeof id === 'string' && /^[\w-]{1,60}$/.test(id));
  saveConfig({ news: { disabled: [...new Set(ids)].slice(0, 200) } });
  return { disabled: ids };
}
