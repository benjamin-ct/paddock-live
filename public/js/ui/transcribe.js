// Transcription en texte des radios d'équipe (comme MultiViewer) et traduction, par le serveur Paddock Live : chaque
// radio n'y est transcrite qu'une fois pour tout le monde, rien n'est calculé sur l'ordinateur. Une seule fenêtre
// demande (verrou partagé) ; les textes sont partagés entre fenêtres et conservés d'une session à l'autre.
import { storageGet, storageSet } from '../util.js';
import { emit } from '../store.js';
import { track } from './stats.js';
import { cloudOn, cloudAsrOn, cloudTranslate, cloudTranscribe } from '../cloud.js';
import { fixRadio, collapseLoops, garbled } from '/shared/radio-text.js';
import { chatty } from '/shared/translation-check.js';

const KEY = 'paddock.radioTexts';
const MAX_KEEP = 400;
let texts = cleanTexts(storageGet(KEY, {}));   // url -> { en, tr: { fr, es… }, d: durée (s) }
const queue = [];                          // tâches { url, kind: 'asr' | 'mt' } (plus récentes d'abord)
const queued = new Set();
let busy = false;
let enabled = false;
let lang = 'fr';
const rechecked = new Set();                    // radios sans texte déjà redemandées au serveur (une fois par lancement)
let isTranscriber = !navigator.locks;
let status = { state: 'idle', msg: '' };
let retryAt = 0;
const READY = 'Actif · transcription et traduction par le serveur Paddock Live';

// Modèles de transcription et de traduction des anciennes versions (jusqu'à 15 Go) : effacés
globalThis.caches?.delete('transformers-cache').catch(() => {});

// Anciennes transcriptions sans aucun mot (« - ») ou en charabia : comptées comme « pas de parole
// reconnue » ; traduction qui répond au lieu de traduire : refaite ;
// phrases répétées en boucle (reconnaissance ou traduction) réduites à une seule fois
function cleanTexts(o) {
  for (const t of Object.values(o || {})) {
    if (!t?.en) continue;
    if (!/[A-Za-z]{2}|\d/.test(t.en) || garbled(t.en)) { t.en = ''; t.tr = {}; continue; }
    t.en = collapseLoops(t.en);
    for (const [l, x] of Object.entries(t.tr || {})) {
      if (typeof x !== 'string') continue;
      // Réponse du modèle au lieu d'une traduction : refaite
      if (chatty(x, t.en)) { delete t.tr[l]; if (t.tq) delete t.tq[l]; } else t.tr[l] = collapseLoops(x);
    }
  }
  return o || {};
}

navigator.locks?.request('paddock-radio-transcriber', () => {
  isTranscriber = true;
  pump();
  return new Promise(() => {});
});

// Textes reçus d'une autre fenêtre
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { texts = cleanTexts(JSON.parse(e.newValue)); } catch { return; }
  emit('radioText');
});

export function radioEntry(url) {
  return texts[url] || null;
}

export function transcribeStatus() {
  return status;
}

// L'état a son propre évènement : il ne doit pas faire redessiner la liste des radios
function setStatus(state, msg = '') {
  if (status.state === state && status.msg === msg) return;
  status = { state, msg };
  emit('radioStatus');
}

function save() {
  const keys = Object.keys(texts);
  if (keys.length > MAX_KEEP) for (const k of keys.slice(0, keys.length - MAX_KEEP)) delete texts[k];
  storageSet(KEY, texts);
}

export function setTranscribe(on, language) {
  if (on && !enabled) track('feature.transcribe');
  enabled = !!on;
  lang = language || 'none';
  if (enabled) { setStatus('ready', READY); pump(); }
}

// Radios à transcrire / traduire (les plus récentes d'abord) : [{ url, who }]
export function requestTranscripts(items) {
  if (!enabled) return;
  for (const { url, who } of items) {
    const t = texts[url];
    // Radios faites sur l'ordinateur par les anciennes versions (qualité légère) : refaites par le serveur ;
    // celles restées sans texte sont redemandées une fois par lancement
    const empty = t && !t.en && !rechecked.has(url);
    if (empty) rechecked.add(url);
    const redoAsr = t && (empty || t.q === 'light');
    const kind = !t || redoAsr ? 'asr' : (lang !== 'none' && t.en && t.tr?.[lang] === undefined ? 'mt' : null);
    if (!kind) continue;
    const k = `${kind}|${url}|${lang}`;
    if (queued.has(k)) continue;
    queued.add(k);
    queue.push({ url, who, kind, lang, k });
  }
  pump();
}

// Traduction d'un texte quelconque (actualités, évolutions techniques de la FIA…) par le serveur : { text, q }
export async function translateText(text, language, domain, from = 'en') {
  const out = await cloudTranslate(text, from, language);
  if (!out) throw new Error('traduction indisponible (serveur Paddock Live)');
  return { text: out, q: 'cloud' };
}

// Fenêtre de son (16 kHz, mono) des caméras embarquées, retranscrite par le serveur : segments horodatés
// [{ timestamp: [a, b], text }]
export async function transcribeWindow(audio) {
  const res = await fetch('/api/radio-window', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav(audio) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(r.error || `HTTP ${res.status}`);
  return r.segments || [];
}

// Son 16 kHz -> fichier WAV 16 bits
function wav(audio) {
  const view = new DataView(new ArrayBuffer(44 + audio.length * 2));
  const str = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, 36 + audio.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, audio.length * 2, true);
  for (let i = 0; i < audio.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, audio[i])) * 0x7fff, true);
  return view.buffer;
}

// Serveur en pause (injoignable, plafond du jour) : la tâche attend son retour
function later(task, what) {
  queue.unshift(task);
  retryAt = Date.now() + 60000;
  setTimeout(pump, 60500);
  setStatus('error', `${what} : serveur Paddock Live indisponible pour l'instant (plafond du jour ou connexion), nouvel essai plus tard`);
}

async function pump() {
  if (busy || !queue.length || Date.now() < retryAt || !enabled || !isTranscriber) return;
  busy = true;
  const task = queue.shift();
  try {
    if (task.kind === 'asr') {
      if (!cloudAsrOn()) { later(task, 'Transcription'); return; }
      const c = await cloudTranscribe(task.url);
      if (!c) {
        if (!cloudAsrOn()) { later(task, 'Transcription'); return; }
        // Refusée par le serveur (radio introuvable dans les archives…) : sans texte
        texts[task.url] = { en: '', tr: {} };
      } else {
        const en = collapseLoops(c.text);
        texts[task.url] = { en, tr: {}, tq: {}, q: 'cloud', ...(c.d ? { d: c.d } : {}) };
        // Traduction juste après, avant les radios plus anciennes
        if (en && task.lang !== 'none') {
          const k = `mt|${task.url}|${task.lang}`;
          if (!queued.has(k)) { queued.add(k); queue.unshift({ url: task.url, who: task.who, kind: 'mt', lang: task.lang, k }); }
        }
      }
    } else {
      const t = texts[task.url];
      if (t?.en) {
        if (!cloudOn()) { later(task, 'Traduction'); return; }
        const c = await cloudTranslate(t.en, 'en', task.lang);
        if (!c && !cloudOn()) { later(task, 'Traduction'); return; }
        // Langue non prise en charge : la radio reste en anglais
        t.tr = { ...(t.tr || {}), [task.lang]: c ? collapseLoops(fixRadio(c, task.lang)) : '' };
        t.tq = { ...(t.tq || {}), [task.lang]: 'cloud' };
      }
    }
    save();
    setStatus('ready', READY);
    emit('radioText');
    queued.delete(task.k);
  } catch (err) {
    console.warn('[transcription]', err.message);
    later(task, 'Transcription');
  } finally {
    busy = false;
    // Courte pause entre deux radios (replay qui en découvre beaucoup d'un coup)
    setTimeout(pump, 400);
  }
}
