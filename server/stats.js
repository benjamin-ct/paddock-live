// Statistiques d'utilisation anonymes, envoyées seulement si l'utilisateur a accepté (question au
// premier lancement, puis Réglages → Application). Les fenêtres (ordinateur, téléphone) signalent les
// fonctions utilisées ; le serveur les additionne et envoie les totaux toutes les 15 minutes au
// petit serveur des statistiques (analytics/worker.js). Rien d'autre : ni compte F1 TV, ni
// identifiant, ni contenu (l'adresse IP n'est pas conservée là-bas).
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, getConfig, saveConfig } from './config.js';
import { request } from './net.js';
import { cleanBatch, cleanErrors, stackFrames, EVENT_RE, DEVICES, MAX_COUNT, WHERE_RE } from '../shared/stats.js';

// Adresse du serveur des statistiques (analytics/, workflow « Statistiques »). Vide = fonction
// désactivée : aucune question posée, rien d'envoyé.
const DEFAULT_URL = 'https://paddock-live-stats.paddock-live.workers.dev/e';
export const STATS_URL = process.env.PADDOCK_STATS_URL ?? DEFAULT_URL;
const VERSION = process.env.PADDOCK_VERSION || 'dev';
const OS = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform] || 'other';
const FLUSH_MS = 15 * 60e3;

// Question ou suggestion écrite par l'utilisateur (Réglages → À propos), envoyée quand il clique sur
// Envoyer, avec la version et le système : lue par le créateur dans le Studio
export const FEEDBACK_URL = process.env.PADDOCK_FEEDBACK_URL ?? 'https://paddock-live-stats.paddock-live.workers.dev/f';
export async function sendFeedback(b, { url = FEEDBACK_URL, send = request } = {}) {
  const data = JSON.stringify({ kind: b?.kind, text: b?.text, contact: b?.contact, lang: b?.lang, src: 'app', version: VERSION, os: OS });
  const r = await send(url, { method: 'POST', timeout: 20000, body: data, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } });
  try { return { status: r.status, data: JSON.parse(r.body.toString('utf8')) }; } catch { return { status: 502, data: { error: `Serveur Paddock Live indisponible (HTTP ${r.status})` } }; }
}
const PENDING_FILE = path.join(DATA_DIR, 'stats-pending.json');

// Compteurs pas encore envoyés, gardés sur le disque : rien de perdu si l'appli se ferme avant l'envoi
// (ancien format : la liste des compteurs seule ; maintenant { items, errors })
const diskStore = {
  load() { try { return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')); } catch { return []; } },
  save(items, errors = []) {
    try {
      if (items.length || errors.length) fs.writeFileSync(PENDING_FILE, JSON.stringify({ items, errors }));
      else fs.rmSync(PENDING_FILE, { force: true });
    } catch { /* disque indisponible : tant pis */ }
  },
};

// Compteur indépendant du serveur HTTP (testable) : config, envoi et stockage injectés
export function createStats({
  config = { get: getConfig, save: saveConfig }, post = postBatch, store = diskStore,
  url = STATS_URL, version = VERSION, os = OS, today = () => new Date().toISOString().slice(0, 10),
} = {}) {
  const counts = new Map();
  const errs = new Map();   // détail des erreurs : clé -> { w, k, m, s, d, n }
  const enabled = () => !!url && config.get().stats === true;
  let saveTimer = null;
  const items = () => [...counts].map(([k, n]) => [...k.split('|'), n]);
  const errors = () => [...errs.values()];
  const persist = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; store.save(items(), errors()); }, 5000);
    saveTimer.unref?.();
  };
  const add = (event, device, n) => {
    const k = `${event}|${device}`;
    counts.set(k, Math.min(MAX_COUNT, (counts.get(k) || 0) + n));
    persist();
  };
  const addErrors = (list) => {
    for (const e of cleanErrors(list)) {
      const k = [e.w, e.k, e.m, e.s, e.d].join('\u0001');
      errs.set(k, { ...e, n: Math.min(MAX_COUNT, (errs.get(k)?.n || 0) + e.n) });
    }
    if (errs.size > 200) for (const k of [...errs.keys()].slice(0, errs.size - 200)) errs.delete(k);
    persist();
  };
  if (enabled()) {
    const saved = store.load();
    const list = Array.isArray(saved) ? saved : Array.isArray(saved?.items) ? saved.items : [];
    for (const [ev, dev, n] of list) if (EVENT_RE.test(ev) && DEVICES.includes(dev) && Number.isInteger(n) && n > 0) add(ev, dev, n);
    if (Array.isArray(saved?.errors)) addErrors(saved.errors);
  }

  // Installation active aujourd'hui (une fois par jour), nouvelle installation (une seule fois)
  const markActive = () => {
    if (!enabled()) return;
    const c = config.get();
    const day = today();
    if (c.statsDay === day) return;
    add('app.active', '-', 1);
    if (!c.statsInstalled) add('app.install', '-', 1);
    config.save({ statsDay: day, statsInstalled: true });
  };

  return {
    state: () => ({ available: !!url, enabled: enabled(), asked: typeof config.get().stats === 'boolean' }),
    set(on) {
      config.save({ stats: !!on });
      if (on) markActive();
      else { counts.clear(); errs.clear(); clearTimeout(saveTimer); saveTimer = null; store.save([]); }
    },
    // Événement venu du serveur lui-même (séances, erreurs)
    record(event, n = 1) {
      if (enabled() && EVENT_RE.test(event)) add(event, '-', n);
    },
    // Erreur du serveur de l'appli : endroit (premier fichier de la pile), message nettoyé, chemin d'appel
    recordError(err) {
      if (!enabled()) return;
      const frames = stackFrames(err?.stack);
      const first = frames.split(' ← ')[0]?.match(/([\w.-]+\.[cm]?js:\d+)$/)?.[1]?.toLowerCase();
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      addErrors([{ w: first && WHERE_RE.test(first) ? first : 'server', k: 'server', m: message, s: frames, d: '-', n: 1 }]);
    },
    // Événements d'une fenêtre : { nom: nombre } (et détail des erreurs). Les compteurs « app. »
    // (sauf les ouvertures) et « session. » sont réservés au serveur.
    fromClient(events, device, errorList) {
      if (!enabled()) return 0;
      const dev = DEVICES.includes(device) && device !== '-' ? device : 'browser';
      if (Array.isArray(errorList)) addErrors(errorList.slice(0, 20).map((e) => ({ ...e, k: e?.k === 'server' ? 'js' : e?.k, d: dev })));
      if (!events || typeof events !== 'object' || Array.isArray(events)) return 0;
      let added = 0;
      for (const [ev, n] of Object.entries(events).slice(0, 100)) {
        if (!EVENT_RE.test(ev) || (ev.startsWith('app.') && ev !== 'app.open') || ev.startsWith('session.')) continue;
        if (!Number.isInteger(n) || n < 1) continue;
        add(ev, dev, Math.min(n, 500));
        added++;
      }
      return added;
    },
    markActive,
    pending: items,
    async flush() {
      markActive();
      if (!enabled() || (!counts.size && !errs.size)) return false;
      const batch = cleanBatch({ v: version, os, items: items(), errors: errors() });
      counts.clear();
      errs.clear();
      if (!batch) { store.save([]); return false; }
      try {
        await post(url, { v: batch.version, os: batch.os, items: batch.items, ...(batch.errors ? { errors: batch.errors } : {}) });
        store.save(items(), errors());   // ce qui a pu arriver pendant l'envoi
        return true;
      } catch {
        // Hors ligne : les compteurs reviennent pour le prochain envoi
        for (const [ev, dev, n] of batch.items) add(ev, dev, n);
        if (batch.errors) addErrors(batch.errors);
        return false;
      }
    },
  };
}

async function postBatch(url, body) {
  const data = JSON.stringify(body);
  const r = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, body: data, timeout: 10000 });
  if (r.status >= 300) throw new Error(`HTTP ${r.status}`);
}

export const stats = createStats();

// Envoi régulier + séances suivies en direct (une fois par séance, quand les chronos arrivent)
export function startStats(hub, live) {
  if (!STATS_URL) return;
  let lastLive = null;
  const tick = () => {
    const running = Date.now() - (live.lastTimingAt || 0) < 120e3;
    if (hub.source?.mode === 'live' && running && hub.sessionKey && hub.sessionKey !== lastLive) {
      lastLive = hub.sessionKey;
      stats.record('session.live');
    }
  };
  setInterval(tick, 60e3).unref();
  setInterval(() => stats.flush(), FLUSH_MS).unref();
  setTimeout(() => stats.flush(), 60e3).unref();
}
