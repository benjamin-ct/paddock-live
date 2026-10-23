// Traduction par le serveur Paddock Live (Workers AI) : actualités, radios, documents FIA. Chaque
// texte n'y est traduit qu'une fois pour tout le monde, l'ordinateur n'a plus rien à calculer.
// Les demandes de l'interface sont regroupées (jusqu'à 40 par envoi). Serveur injoignable ou plafond
// du jour atteint : pause de 10 minutes, l'interface traduit alors sur l'ordinateur comme avant.
import { request } from './net.js';
import { badScript } from '../shared/translation-check.js';

export const TRANSLATE_URL = process.env.PADDOCK_TRANSLATE_URL ?? 'https://paddock-live-stats.paddock-live.workers.dev/t';
export const LANGS = ['fr', 'en', 'es', 'de', 'it', 'nl', 'pt', 'ja', 'zh'];
const BATCH = 40;
const BATCH_CHARS = 6000;   // résumés d'articles : envois plus courts, traduits avant le délai d'attente
const WAIT_MS = 120;
const PAUSE_MS = 10 * 60e3;

async function postJSON(url, body) {
  const data = JSON.stringify(body);
  const r = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, body: data, timeout: 90000 });
  let json = null;
  try { json = JSON.parse(r.body.toString('utf8')); } catch { /* réponse illisible */ }
  return { status: r.status, json };
}

export function createCloudTranslator({ url = TRANSLATE_URL, post = postJSON, now = Date.now } = {}) {
  const pending = new Map();   // to -> [{ text, from, resolve }]
  const timers = new Map();
  const memo = new Map();      // `${from}|${to}|${text}` -> traduction (5 000 dernières : appli ouverte des jours)
  let pausedUntil = 0;

  const available = () => !!url && now() >= pausedUntil;

  async function flush(to) {
    clearTimeout(timers.get(to));
    timers.delete(to);
    const list = pending.get(to) || [];
    pending.delete(to);
    // Envois de 40 textes au plus, et pas trop longs (résumés d'articles)
    const parts = [];
    let cur = [], size = 0;
    for (const p of list) {
      if (cur.length && (cur.length >= BATCH || size + p.text.length > BATCH_CHARS)) { parts.push(cur); cur = []; size = 0; }
      cur.push(p);
      size += p.text.length;
    }
    if (cur.length) parts.push(cur);
    for (const part of parts) {
      let out = [];
      try {
        const r = await post(url, { to, items: part.map(({ text, from }) => ({ text, from })) });
        // Plafond du jour ou panne : pause ; envoi refusé (400) : seulement ces textes-là
        if (r.status === 429 || r.status >= 500 || (r.status === 200 && !Array.isArray(r.json?.out))) pausedUntil = now() + PAUSE_MS;
        out = Array.isArray(r.json?.out) ? r.json.out : [];
      } catch {
        pausedUntil = now() + PAUSE_MS;
      }
      part.forEach((p, j) => {
        const t = typeof out[j] === 'string' && out[j].trim() && !badScript(out[j], to) ? out[j] : null;
        if (t) memo.set(`${p.from}|${to}|${p.text}`, t);
        if (memo.size > 5000) memo.delete(memo.keys().next().value);
        p.resolve(t);
      });
    }
  }

  return {
    available,
    // Traduction d'un texte, ou null (serveur indisponible, langue non prise en charge…)
    translate(text, from, to) {
      text = String(text || '').trim().slice(0, 2000);   // coupé avant la mémoire : même clé à l'envoi et à la lecture
      if (!text || !LANGS.includes(to)) return Promise.resolve(null);
      if (!LANGS.includes(from)) from = 'en';
      if (from === to) return Promise.resolve(text);
      const m = memo.get(`${from}|${to}|${text}`);
      if (m) return Promise.resolve(m);
      if (!available()) return Promise.resolve(null);
      return new Promise((resolve) => {
        const list = pending.get(to) || [];
        list.push({ text, from, resolve });
        pending.set(to, list);
        if (list.length >= BATCH) flush(to);
        else if (!timers.has(to)) timers.set(to, setTimeout(() => flush(to), WAIT_MS));
      });
    },
  };
}

export const cloud = createCloudTranslator();
