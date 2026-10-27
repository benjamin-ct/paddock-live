// Transcription partagée des radios d'équipe (Workers AI, Whisper large v3 turbo) : chaque radio n'est
// transcrite qu'une fois pour tous les utilisateurs de Paddock Live, puis gardée dans la base.
// La radio est reconnue par l'empreinte de son fichier son (calculée ici) : personne ne peut faire
// passer un faux texte pour une radio qu'il n'a pas envoyée. Plafond quotidien contre les abus ;
// au-delà, la radio attend le lendemain.
import { clean } from '../shared/radio-text.js';
import { aiQuota, runAI } from './quota.js';

export const ASR_MODEL = '@cf/openai/whisper-large-v3-turbo';
export const ASR_FALLBACK = '@cf/openai/whisper';
const MODEL_TAG = 'wl3t';   // dans la clé : changer de modèle = nouvelles transcriptions
export const MAX_AUDIO = 2 * 1024 * 1024;
const MIN_AUDIO = 512;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const HASH_RE = /^[0-9a-f]{64}$/;
export const radioKey = (hash) => `${MODEL_TAG}:${hash}`;
export async function audioHash(bytes) {
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

// Fichier son reconnu (MP3, AAC, M4A) : le reste est refusé sans passer par l'IA
export function isAudio(b) {
  if (!b || b.length < MIN_AUDIO || b.length > MAX_AUDIO) return false;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return true;                        // MP3 (ID3)
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return true;                                 // MP3 / AAC (trame)
  return b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;                  // M4A (ftyp)
}

function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function whisper(env, bytes) {
  try {
    const r = await runAI(env, ASR_MODEL, { audio: base64(bytes), task: 'transcribe', language: 'en' });
    if (typeof r?.text === 'string') return { text: r.text, d: r.transcription_info?.duration };
  } catch { /* modèle de secours */ }
  const r = await runAI(env, ASR_FALLBACK, { audio: [...bytes] });
  if (typeof r?.text !== 'string') throw new Error('réponse illisible');
  return { text: r.text };
}

// Transcription déjà faite (par n'importe quel utilisateur), ou null
export async function cachedRadio(env, hash) {
  const row = await env.DB.prepare('SELECT text, d FROM radio_texts WHERE k = ?1').bind(radioKey(hash)).first();
  // Texte nettoyé à nouveau : les transcriptions gardées avant un meilleur filtre en profitent
  return row ? { text: clean(row.text), d: row.d ?? undefined } : null;
}

// Fichier son -> { text, d } (texte vide : radio sans parole), { limited } ou { invalid }
export async function transcribeRadio(env, bytes, day = new Date().toISOString().slice(0, 10), ip = null) {
  if (!isAudio(bytes)) return { invalid: true };
  const hash = await audioHash(bytes);
  const hit = await cachedRadio(env, hash);
  if (hit) return { ...hit, cached: true };
  const limit = Number(env.ASR_DAILY_LIMIT) || 300;
  if (!(await aiQuota(env, { key: `radio:${day}`, day, n: 1, limit, ip }))) return { limited: true };
  const r = await whisper(env, bytes);
  const text = clean(r.text);
  const d = Number.isFinite(r.d) ? Math.round(r.d * 10) / 10 : null;
  await env.DB.prepare('INSERT OR REPLACE INTO radio_texts (k, text, d, at) VALUES (?1, ?2, ?3, ?4)').bind(radioKey(hash), text, d, Date.now()).run();
  return { text, d: d ?? undefined, hash };
}

// Son des caméras embarquées F1 TV (appli, expérimental) : fenêtre de 30 s en WAV mono 16 kHz, propre à chaque
// utilisateur (rien à garder) -> { segments: [{ timestamp: [début, fin] (s), text }] }, { limited } ou { invalid }
const isWav = (b) => b?.length >= 44 && b.length <= MAX_AUDIO && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WAVE';
export async function transcribeWindow(env, bytes, day = new Date().toISOString().slice(0, 10), ip = null) {
  if (!isWav(bytes)) return { invalid: true };
  const limit = Number(env.ONBOARD_DAILY_LIMIT) || 160;
  if (!(await aiQuota(env, { key: `onboard:${day}`, day, n: 1, limit, ip }))) return { limited: true };
  const r = await runAI(env, ASR_MODEL, { audio: base64(bytes), task: 'transcribe', language: 'en' });
  const segments = (r?.segments || []).map((x) => ({ timestamp: [x.start, x.end], text: x.text || '' }));
  const dur = Number(r?.transcription_info?.duration) || (bytes.length - 44) / 32000;
  return { segments: segments.length || !clean(r?.text || '') ? segments : [{ timestamp: [0, dur], text: r.text }] };
}
