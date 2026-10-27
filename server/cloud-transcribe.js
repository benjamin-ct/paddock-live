// Transcription des radios d'équipe par le serveur Paddock Live (Workers AI, Whisper large v3 turbo) :
// chaque radio n'y est transcrite qu'une fois pour tout le monde, l'ordinateur n'a plus rien à calculer.
// Le fichier son est pris dans les archives F1 (même accès que les replays), puis on demande d'abord
// si son empreinte est déjà connue ; sinon le son est envoyé. Serveur injoignable ou plafond du jour
// atteint : pause de 10 minutes, les radios attendent.
import crypto from 'node:crypto';
import { request } from './net.js';
import { archiveGet } from './archive.js';

export const RADIO_URL = process.env.PADDOCK_RADIO_URL ?? 'https://paddock-live-stats.paddock-live.workers.dev/r';
const PAUSE_MS = 10 * 60e3;
const MAX_AUDIO = 2 * 1024 * 1024;

const parse = (r) => { try { return JSON.parse(r.body.toString('utf8')); } catch { return null; } };

export function createCloudTranscriber({ url = RADIO_URL, fetch = request, audio = (rel) => archiveGet(rel, { raw: true, timeout: 30000 }), now = Date.now } = {}) {
  const memo = new Map();      // chemin d'archive -> { text, d } (5 000 derniers)
  const running = new Map();   // chemin d'archive -> promesse en cours
  let pausedUntil = 0;

  const available = () => !!url && now() >= pausedUntil;
  const pause = () => { pausedUntil = now() + PAUSE_MS; };

  async function ask(rel) {
    const body = await audio(rel);   // erreur d'archive (fichier absent, accès refusé) : remontée telle quelle
    if (!body?.length || body.length > MAX_AUDIO) return null;
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    try {
      // Empreinte inconnue (ou lecture ratée) : le son est envoyé, le serveur reprend sa transcription s'il l'a
      let r = await fetch(`${url}/${hash}`, { timeout: 15000 }).catch(() => ({ status: 0 }));
      if (r.status !== 200) {
        r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length }, body, timeout: 60000 });
      }
      const j = r.status === 200 ? parse(r) : null;
      if (typeof j?.text !== 'string') {
        if (r.status === 429 || r.status >= 500 || r.status === 200) pause();
        return null;
      }
      const out = { text: j.text, ...(Number.isFinite(j.d) ? { d: j.d } : {}) };
      memo.set(rel, out);
      if (memo.size > 5000) memo.delete(memo.keys().next().value);
      return out;
    } catch {
      pause();
      return null;
    }
  }

  return {
    available,
    // Radio (chemin dans les archives F1) -> { text, d } (texte vide : radio sans parole), ou null
    transcribe(rel) {
      if (memo.has(rel)) return Promise.resolve(memo.get(rel));
      if (!available()) return Promise.resolve(null);
      if (!running.has(rel)) running.set(rel, ask(rel).finally(() => running.delete(rel)));
      return running.get(rel);
    },
  };
}

export const cloudRadio = createCloudTranscriber();
