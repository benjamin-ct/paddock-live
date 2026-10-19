// Transcription en texte des radios d'équipe (comme MultiViewer) et traduction, faites
// localement (Whisper + OPUS-MT) dans un Web Worker. Une seule fenêtre travaille (verrou
// partagé) ; les textes sont partagés entre fenêtres et conservés d'une session à l'autre.
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
let worker = null;
let busy = false;
let enabled = false;
let lang = 'fr';
let qualityPref = 'auto';     // 'auto' | 'high' | 'light'
// Haute qualité : carte graphique (WebGPU avec calcul FP16). Un échec d'un des deux modèles
// (reconnaissance vocale ou traduction) ne fait passer que celui-là en qualité légère, et pour
// un temps seulement : nouvel essai après quelques minutes (téléchargement interrompu, mémoire
// de la carte graphique pleine…). Avant, le premier échec faisait tout passer en qualité légère
// jusqu'au redémarrage de l'application.
let gpuInfo = null;                           // { ok, name, why }
const highFail = { asr: null, mt: null };     // { msg, at, wait }
const effective = { asr: null, mt: null };    // niveau utilisé en dernier ('high' | 'light')
const noCloud = new Set();                      // radios que le serveur Paddock Live n'a pas pu transcrire
const RETRY_MS = { pref: 2 * 60000, auto: 10 * 60000 };
let isTranscriber = !navigator.locks;
let status = { state: 'idle', msg: '' };
let retryAt = 0;
let current = null;   // tâche en cours {id, resolve, reject}
let nextId = 1;

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

// L'état (téléchargement, niveau de qualité…) a son propre évènement : il ne doit pas faire
// redessiner la liste des radios
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

export function setTranscribe(on, language, q = 'auto') {
  if (on && !enabled) track('feature.transcribe');
  enabled = !!on;
  lang = language || 'none';
  if (q !== qualityPref) {
    qualityPref = q;
    // Nouveau choix : on retente la haute qualité tout de suite
    highFail.asr = highFail.mt = null;
  }
  if (!enabled && !queue.some((t) => t.kind === 'text' || t.kind === 'win')) setTimeout(unload, 1000);
  if (enabled) {
    // Niveau de chaque modèle connu dès le départ (pour refaire en haute qualité les radios
    // traduites en qualité légère), puis revu chaque minute (fin d'attente après un échec)
    refreshEffective();
    refreshTimer ||= setInterval(() => { if (enabled && (highFail.asr || highFail.mt)) refreshEffective(); }, 60000);
    pump();
  }
}
let refreshTimer = 0;

// Carte graphique utilisable pour les grands modèles ? (WebGPU + calcul en demi-précision)
async function gpu() {
  if (gpuInfo) return gpuInfo;
  if (!navigator.gpu) return (gpuInfo = { ok: false, why: 'WebGPU indisponible sur cet appareil' });
  const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
  if (!a) return (gpuInfo = { ok: false, why: 'aucune carte graphique utilisable (WebGPU)' });
  const name = [a.info?.vendor, a.info?.description || a.info?.architecture].filter(Boolean).join(' ');
  const f16 = a.features?.has?.('shader-f16');
  return (gpuInfo = { ok: !!f16, name, why: f16 ? '' : `carte graphique${name ? ` (${name})` : ''} sans calcul FP16, nécessaire aux grands modèles` });
}

// Niveau à utiliser pour la reconnaissance vocale ('asr') ou la traduction ('mt')
// « Auto » = qualité légère (≈ 1 Go) : la haute qualité (10 à 15 Go, carte graphique très sollicitée)
// seulement si elle est choisie
async function qualityFor(use) {
  if (qualityPref !== 'high') return 'light';
  if (!(await gpu()).ok) return 'light';
  const f = highFail[use];
  if (f && Date.now() - f.at < f.wait) return 'light';
  return 'high';
}

async function refreshEffective() {
  effective.asr = await qualityFor('asr');
  effective.mt = await qualityFor('mt');
  if (status.state !== 'loading') setStatus(status.state === 'idle' ? 'idle' : 'ready', describe());
}

// Échec d'un grand modèle : qualité légère pour ce modèle, nouvel essai plus tard, de plus en plus
// espacé si l'échec se répète (sinon le modèle de 2 Go est rechargé toutes les 2 minutes)
function markHighFailed(use, err) {
  const n = (highFail[use]?.n || 0) + 1;
  const base = qualityPref === 'high' ? RETRY_MS.pref : RETRY_MS.auto;
  highFail[use] = { msg: err.message, at: Date.now(), n, wait: Math.min(60 * 60000, base * 2 ** (n - 1)) };
  effective[use] = 'light';
  console.warn(`[transcription] ${use === 'asr' ? 'reconnaissance vocale' : 'traduction'} en haute qualité impossible :`, err.message);
}

// Texte d'état : niveau de chaque modèle et, s'il est léger, pourquoi
function describe() {
  const why = (use) => {
    if (qualityPref !== 'high') return 'économe en mémoire';
    if (gpuInfo && !gpuInfo.ok) return gpuInfo.why;
    const f = highFail[use];
    if (f) {
      const min = Math.max(1, Math.ceil((f.at + f.wait - Date.now()) / 60000));
      return `haute qualité en échec (${f.msg}) · nouvel essai dans ${min} min`;
    }
    return '';
  };
  const part = (label, use, hi) => {
    if (use === 'mt' ? cloudOn() : cloudAsrOn()) return `${label} : serveur Paddock Live (rien à calculer ici)`;
    const q = effective[use];
    if (!q) return '';
    if (q === 'high') return `${label} : haute qualité (${hi})`;
    const w = why(use);
    return `${label} : qualité légère${w ? ` — ${w}` : ''}`;
  };
  const txt = [part('Transcription', 'asr', 'Whisper large'), lang === 'none' ? '' : part('Traduction', 'mt', 'modèle de langage F1')].filter(Boolean).join(' · ');
  return txt ? `Actif · ${txt}` : 'Actif';
}

// Radios à transcrire / traduire (les plus récentes d'abord) : [{ url, who }]
export function requestTranscripts(items) {
  if (!enabled) return;
  for (const { url, who } of items) {
    const t = texts[url];
    // Haute qualité disponible : les radios faites en qualité légère sont refaites (transcription,
    // ou seulement la traduction si la transcription est déjà en haute qualité)
    // Transcription en ligne disponible : les radios faites sur l'ordinateur en qualité légère sont refaites
    const redoAsr = t && t.q !== 'high' && t.q !== 'cloud' && (effective.asr === 'high' || (t.q === 'light' && cloudAsrOn() && !noCloud.has(url)));
    const redoMt = t && t.en && lang !== 'none' && effective.mt === 'high' && t.tr?.[lang] !== undefined && t.tq?.[lang] !== 'high' && t.tq?.[lang] !== 'cloud';
    const kind = !t || redoAsr ? 'asr' : (lang !== 'none' && t.en && (t.tr?.[lang] === undefined || redoMt) ? 'mt' : null);
    if (!kind) continue;
    const k = `${kind}|${url}|${lang}`;
    if (queued.has(k)) continue;
    queued.add(k);
    queue.push({ url, who, kind, lang, k });
  }
  pump();
}

function getWorker() {
  if (worker) return worker;
  const w = worker = new Worker(new URL('../workers/whisper.js', import.meta.url), { type: 'module' });
  // Échec du moteur (pas de connexion pour le télécharger, plantage…) : il est arrêté pour de bon
  // (sinon l'ancien continue en mémoire, avec ses modèles, à côté du nouveau)
  w.onerror = (e) => {
    e.preventDefault?.();
    w.terminate();
    if (worker === w) worker = null;
    current?.reject(new Error(e.message || 'moteur de transcription indisponible (connexion ?)'));
  };
  w.onmessage = (e) => {
    if (worker !== w) return;
    const m = e.data;
    if (m.type === 'progress') {
      const what = m.what === 'mt' ? 'traduction' : 'reconnaissance vocale';
      const mb = (x) => Math.round(x / 1e6);
      setStatus('loading', m.cached
        ? `Chargement du modèle de ${what} : ${mb(m.loaded)} / ${mb(m.total)} Mo`
        : `Téléchargement du modèle de ${what} (première fois) : ${mb(m.loaded)} / ${mb(m.total)} Mo`);
      return;
    }
    if (m.type === 'ready') { setStatus('ready', describe()); return; }
    if (!current || m.id !== current.id) return;
    if (m.type === 'result') current.resolve(m.text); else current.reject(new Error(m.error));
  };
  return worker;
}

// Modèles libérés (plusieurs Go en haute qualité) après 5 minutes sans rien à traiter ou quand la
// transcription est coupée ; ils sont rechargés depuis le disque à la prochaine radio
const IDLE_MS = 5 * 60000;
let unloadTimer = 0;
function unload() {
  clearTimeout(unloadTimer);
  if (!worker || busy || current) return;
  worker.terminate();
  worker = null;
}

function run(msg, transfer = []) {
  clearTimeout(unloadTimer);
  const w = getWorker();
  return new Promise((resolve, reject) => {
    current = { id: nextId++, resolve, reject };
    w.postMessage({ ...msg, id: current.id }, transfer);
  }).finally(() => {
    current = null;
    clearTimeout(unloadTimer);
    unloadTimer = setTimeout(unload, IDLE_MS);
  });
}

async function decode(url) {
  const res = await fetch(`/api/f1tv/proxy?u=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`audio ${res.status}`);
  const buf = await res.arrayBuffer();
  const audio = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(buf);
  // Mono 16 kHz pour Whisper
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

// Traduction d'un texte quelconque (évolutions techniques de la FIA…) avec le même moteur que
// les radios : un seul modèle en mémoire, une tâche à la fois. Le modèle de langage (carte
// graphique) n'est utilisé que s'il est déjà téléchargé, pour ne pas imposer 2,5 Go.
export function translateText(text, language, domain, from = 'en') {
  return new Promise((resolve, reject) => {
    queue.push({ kind: 'text', text, lang: language, domain, from, resolve, reject, k: `text|${text}` });
    pump();
  });
}

// Fenêtre de son (16 kHz) des caméras embarquées : segments horodatés [{ timestamp: [a, b], text }].
// Passe avant les radios officielles (c'est du direct).
export function transcribeWindow(audio) {
  return new Promise((resolve, reject) => {
    queue.unshift({ kind: 'win', audio, resolve, reject, k: `win|${nextId}` });
    pump();
  });
}

async function runWindow(task) {
  const q = await qualityFor('asr');
  try {
    task.resolve(await run({ kind: 'asr-ts', audio: task.audio, quality: q }, q === 'high' ? [] : [task.audio.buffer]));
  } catch (err) {
    if (q !== 'high') throw err;
    markHighFailed('asr', err);
    task.resolve(await run({ kind: 'asr-ts', audio: task.audio, quality: 'light' }, [task.audio.buffer]));
  }
}

async function textQuality() {
  if ((await qualityFor('mt')) !== 'high') return 'light';
  try {
    const keys = await (await caches.open('transformers-cache')).keys();
    if (!keys.some((r) => r.url.includes('Qwen3-4B'))) return 'light';
  } catch { return 'light'; }
  return 'high';
}

async function runText(task) {
  const c = await cloudTranslate(task.text, task.from || 'en', task.lang);
  if (c) { task.resolve({ text: c, q: 'cloud' }); return; }
  const q = await textQuality();
  try {
    task.resolve({ text: await run({ kind: 'translate', text: task.text, lang: task.lang, quality: q, domain: task.domain, from: task.from }), q });
  } catch (err) {
    if (q === 'high') {
      markHighFailed('mt', err);
      task.resolve({ text: await run({ kind: 'translate', text: task.text, lang: task.lang, quality: 'light', domain: task.domain, from: task.from }), q: 'light' });
    } else throw err;
  }
}

async function pump() {
  if (busy || !queue.length || Date.now() < retryAt) return;
  // Radios : seulement si la transcription est activée, dans la fenêtre qui en est chargée
  const radios = enabled && isTranscriber;
  const i = queue.findIndex((t) => t.kind === 'text' || t.kind === 'win' || radios);
  if (i < 0) return;
  busy = true;
  const task = queue.splice(i, 1)[0];
  if (task.kind === 'text' || task.kind === 'win') {
    try { await (task.kind === 'win' ? runWindow(task) : runText(task)); } catch (err) { task.reject(err); }
    busy = false;
    setTimeout(pump, 50);
    return;
  }
  try {
    if (task.kind === 'asr') {
      // Serveur Paddock Live d'abord (rien à calculer ici), sinon Whisper sur l'ordinateur
      const c = await cloudTranscribe(task.url);
      let en;
      if (c) {
        task.q = 'cloud';
        en = collapseLoops(c.text);
        texts[task.url] = { en, tr: {}, tq: {}, q: 'cloud', ...(c.d ? { d: c.d } : {}) };
      } else {
        if (cloudAsrOn()) noCloud.add(task.url);   // refusée par le serveur : pas de nouvel essai
        const q = task.q = await qualityFor('asr');
        effective.asr = q;
        const audio = await decode(task.url);
        if (status.state !== 'ready') setStatus('loading', 'Préparation de la transcription…');
        const d = Math.round(audio.length / 1600) / 10;
        en = collapseLoops(await run({ kind: 'asr', audio, quality: q }, [audio.buffer]));
        texts[task.url] = { en, tr: {}, tq: {}, q, d };
      }
      // Traduction juste après, avant les radios plus anciennes
      if (en && task.lang !== 'none') {
        const k = `mt|${task.url}|${task.lang}`;
        if (!queued.has(k)) { queued.add(k); queue.unshift({ url: task.url, who: task.who, kind: 'mt', lang: task.lang, k }); }
      }
    } else {
      const t = texts[task.url];
      if (t?.en) {
        const c = await cloudTranslate(t.en, 'en', task.lang);
        const q = task.q = c ? 'cloud' : await qualityFor('mt');
        effective.mt = q;
        const tr = collapseLoops(c ? fixRadio(c, task.lang) : await run({ kind: 'translate', text: t.en, lang: task.lang, quality: q, who: task.who }));
        t.tr = { ...(t.tr || {}), [task.lang]: tr };
        t.tq = { ...(t.tq || {}), [task.lang]: q };
      }
    }
    save();
    setStatus('ready', describe());
    emit('radioText');
    queued.delete(task.k);
  } catch (err) {
    console.warn('[transcription]', err.message);
    if (/^audio/.test(err.message)) {
      texts[task.url] = { en: '', tr: {} };
      queued.delete(task.k);
    } else if (task.q === 'high') {
      // Grand modèle inutilisable pour l'instant (téléchargement, mémoire de la carte graphique…) :
      // ce modèle seul passe en qualité légère, nouvel essai plus tard
      markHighFailed(task.kind === 'asr' ? 'asr' : 'mt', err);
      queue.unshift(task);
    } else {
      // Moteur ou modèle indisponible : nouvel essai dans une minute (la tâche reste en file)
      queue.unshift(task);
      retryAt = Date.now() + 60000;
      setTimeout(pump, 60500);
    }
    setStatus(task.q === 'high' ? 'ready' : 'error', task.q === 'high' ? describe() : `Impossible : ${err.message}`);
  } finally {
    busy = false;
    // Courte pause entre deux radios : le processeur respire (replay qui en découvre beaucoup d'un coup)
    setTimeout(pump, 400);
  }
}
