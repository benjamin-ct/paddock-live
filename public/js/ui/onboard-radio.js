// Radios captées sur les caméras embarquées F1 TV (expérimental).
//
// Le flux officiel de la F1 ne publie qu'une sélection des radios d'équipe (une trentaine par
// course). Le son de la caméra embarquée d'un pilote, lui, contient toutes ses radios. Ici, le son
// embarqué de 1 à 3 pilotes (pilote suivi et pilotes du duel, ou favoris) est écouté en direct,
// sans être joué, découpé en fenêtres de 30 s qui se chevauchent, retranscrit par le serveur Paddock
// Live (reconnaissance vocale avec horodatage), puis traduit. Chaque radio est datée à l'heure F1 du
// flux et n'apparaît qu'une fois atteinte par l'affichage (délai TV) : rien n'est dévoilé.
//
// Nécessite F1 TV Pro (caméras embarquées) et un flux sans DRM : le son d'un flux protégé ne
// peut pas être lu par l'application, la fonction l'indique alors.
import { store, on, emit, f1Now } from '../store.js';
import { prefs, setPref } from '../prefs.js';
import { $, api, storageGet, storageSet } from '../util.js';
import { Resampler } from '/shared/audio-sync.js';
import { newSegments } from '/shared/radio-text.js';
import { transcribeWindow, translateText } from './transcribe.js';
import { loadShaka, proxied } from './commentary.js';
import { t } from '../i18n.js';

const SR = 16000;
const WIN_S = 30;            // fenêtre envoyée à la reconnaissance vocale
const STEP_S = 22;           // une nouvelle fenêtre toutes les 22 s (8 s de chevauchement)
const MAX_BUF_S = 50;        // reconnaissance en retard : le son plus ancien est abandonné
const MAX_DRIVERS = 3;
const KEY = 'paddock.obRadio';
const MAX_KEEP = 300;

let entries = storageGet(KEY, []);       // [{ id, num, utc, en, tr: { fr… } }]
let status = '';
let pausedUntil = 0;   // plafond du jour du serveur atteint : plus aucun envoi jusqu'à minuit UTC
let content = null, contentKey = '';
let ctx = null, workletReady = null;
const feeds = new Map();                 // pilote -> écoute en cours
let isCapturer = !navigator.locks;
let reconciling = false;

export const onboardStatus = () => status;

function setStatus(s) {
  if (s === status) return;
  status = s;
  emit('obStatus');
}

function save() {
  if (entries.length > MAX_KEEP) entries = entries.slice(-MAX_KEEP);
  storageSet(KEY, entries);
  emit('obText');
}

// Radios des autres fenêtres (une seule écoute, partagée)
window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  try { entries = JSON.parse(e.newValue) || []; } catch { return; }
  emit('obText');
});

// Pilotes écoutés
function wanted() {
  if (!prefs.obRadio) return [];
  const list = prefs.obRadioWho === 'favs' ? prefs.favs : [store.focus, store.duel.a, store.duel.b];
  return [...new Set(list.filter(Boolean).map(String))].slice(0, MAX_DRIVERS);
}

const sessionKeys = () => {
  const i = store.state.SessionInfo;
  return i?.Meeting?.Key && i?.Key ? { meeting: i.Meeting.Key, session: i.Key } : null;
};

async function findContent() {
  const k = sessionKeys();
  const key = k ? `${k.meeting}|${k.session}` : '';
  if (key === contentKey && content) return content;
  contentKey = key;
  content = null;
  if (!k) return null;
  const r = await api(`/api/f1tv/content?meeting=${encodeURIComponent(k.meeting)}&session=${encodeURIComponent(k.session)}`);
  content = r.content || null;
  return content;
}

// Piste du son de la voiture (radios + moteur) plutôt que les commentaires
function pickTrack(player) {
  const tracks = player.getAudioTracks();
  if (!tracks.length) return '';
  const label = (t) => `${t.label || ''} ${t.language || ''} ${(t.roles || []).join(' ')}`;
  const best = tracks.find((t) => /radio|team|obc|onboard|car|fx|effect|nat|ambient|zxx|und/i.test(label(t))) || tracks[0];
  if (!best.active) player.selectAudioTrack(best);
  return label(best).trim() || 'piste unique';
}

async function audioGraph() {
  ctx ||= new AudioContext();
  workletReady ||= ctx.audioWorklet.addModule('/js/workers/mic-tap.js');
  await workletReady;
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  return ctx;
}

// ---------- Écoute d'un pilote ----------
async function startFeed(num) {
  const feed = { num, state: 'start', busy: false, chunks: [], len: 0, winStart: null, lastEnd: null, note: '' };
  feeds.set(num, feed);
  const c = await findContent();
  if (!c) throw new Error('aucune vidéo F1 TV pour cette séance');
  const ob = (c.onboards || []).find((o) => o.num === num);
  if (!ob) throw new Error('pas de caméra embarquée F1 TV pour ce pilote');
  const st = await api(`/api/f1tv/play?${new URLSearchParams({ contentId: c.contentId, channelId: ob.channelId })}`);
  if (!st.ok) throw new Error('F1 TV refuse le flux embarqué (abonnement sans caméras embarquées ?)');
  if (st.drm) throw new Error(t('son protégé (DRM {}) : impossible de le retranscrire', st.drm));
  if (feeds.get(num) !== feed) return;
  const shaka = await loadShaka();
  shaka.polyfill.installAll();
  const el = document.createElement('audio');
  el.preload = 'auto';
  const player = new shaka.Player();
  await player.attach(el);
  const net = player.getNetworkingEngine();
  net.registerRequestFilter((type, req) => {
    req.uris = req.uris.map((u) => (/^https?:/i.test(u) && !u.startsWith(location.origin) ? proxied(u) : u));
  });
  net.registerResponseFilter((type, res) => {
    const up = res.headers?.['x-upstream-url'];
    if (up) res.uri = up;
  });
  player.configure({ manifest: { disableVideo: true }, streaming: { bufferingGoal: 12, rebufferingGoal: 2, bufferBehind: 10 }, drm: { servers: {} } });
  player.addEventListener('error', (e) => { feed.state = 'error'; feed.note = t('erreur du flux ({})', e.detail?.code || '?'); showStatus(); });
  Object.assign(feed, { el, player });
  await player.load(st.url);
  feed.track = pickTrack(player);
  const a = await audioGraph();
  if (feeds.get(num) !== feed) { stopFeed(feed); return; }
  feed.src = a.createMediaElementSource(el);
  feed.tap = new AudioWorkletNode(a, 'mic-tap', { channelCount: 1, channelCountMode: 'explicit' });
  feed.mute = a.createGain();
  feed.mute.gain.value = 0;                     // rien n'est joué dans les haut-parleurs
  feed.src.connect(feed.tap).connect(feed.mute).connect(a.destination);
  feed.rs = new Resampler(a.sampleRate, SR);
  feed.tap.port.onmessage = ({ data }) => onAudio(feed, data);
  feed.state = 'on';
  console.info('[onboard-radio]', num, feed.track);
  try {
    await el.play();
  } catch {
    // Lecture automatique bloquée tant que la page n'a pas été touchée : reprise au premier clic
    feed.note = t('cliquez dans la page pour lancer l\'écoute');
    document.addEventListener('pointerdown', () => { a.resume().catch(() => {}); el.play().then(() => { feed.note = ''; showStatus(); }).catch(() => {}); }, { once: true });
  }
}

function stopFeed(feed) {
  feed.state = 'off';
  try { feed.tap && (feed.tap.port.onmessage = null); feed.src?.disconnect(); feed.tap?.disconnect(); } catch { /* déjà débranché */ }
  feed.player?.destroy().catch(() => {});
  feed.el?.removeAttribute('src');
}

// Son reçu : rééchantillonné, daté à l'heure F1 du flux, découpé en fenêtres
function onAudio(feed, { t0, samples }) {
  if (feed.state !== 'on') return;
  const playhead = feed.player.getPlayheadTimeAsDate?.();
  if (!playhead) return;
  const at = playhead.getTime() - (ctx.currentTime - t0) * 1000;
  const out = feed.rs.push(samples);
  if (!out.length) return;
  if (feed.winStart === null) feed.winStart = at;
  feed.chunks.push(out);
  feed.len += out.length;
  // Retard de la reconnaissance : on garde au plus MAX_BUF_S de son
  while (feed.len > MAX_BUF_S * SR && feed.chunks.length > 1) {
    const drop = feed.chunks.shift();
    feed.len -= drop.length;
    feed.winStart += drop.length / SR * 1000;
  }
  if (!feed.busy && feed.len >= WIN_S * SR && Date.now() >= pausedUntil) sendWindow(feed);
}

async function sendWindow(feed) {
  const all = new Float32Array(feed.len);
  let o = 0;
  for (const c of feed.chunks) { all.set(c, o); o += c.length; }
  const win = all.slice(0, WIN_S * SR);
  const start = feed.winStart;
  // On garde la fin (chevauchement) pour la fenêtre suivante
  const rest = all.slice(STEP_S * SR);
  feed.chunks = [rest];
  feed.len = rest.length;
  feed.winStart = start + STEP_S * 1000;
  feed.busy = true;
  try {
    const chunks = await transcribeWindow(win);
    const segs = newSegments(chunks, start, feed.lastEnd);
    if (segs.length) {
      feed.lastEnd = segs.at(-1).end;
      for (const s of segs) addEntry(feed.num, s);
      save();
    }
    feed.note = '';
  } catch (err) {
    if (err.status === 429) {
      pausedUntil = new Date().setUTCHours(24, 0, 0, 0);
      for (const f of feeds.values()) f.note = t('plafond du jour du serveur atteint, reprise demain');
    } else feed.note = t('reconnaissance impossible ({})', err.message);
  } finally {
    feed.busy = false;
    showStatus();
  }
}

function addEntry(num, seg) {
  const e = { id: `ob-${num}-${Math.round(seg.start)}`, num, utc: seg.start, en: seg.text, tr: {} };
  entries.push(e);
  const lang = prefs.radioLang;
  if (lang && lang !== 'none') {
    translateText(seg.text, lang, 'radio').then(({ text }) => {
      if (!text) return;
      e.tr[lang] = text;
      save();
    }).catch(() => {});
  }
}

// Radios déjà atteintes par l'affichage (délai TV) : jamais en avance sur la course
export function visibleOnboard() {
  const now = f1Now();
  return entries.filter((e) => e.utc <= now);
}

// ---------- État affiché ----------
function showStatus() {
  if (!prefs.obRadio) { setStatus(''); return; }
  const dl = store.state.DriverList || {};
  const who = (n) => dl[n]?.Tla || `#${n}`;
  const parts = [...feeds.values()].map((f) => {
    if (f.state === 'error') return t('{} : {}', who(f.num), t(f.note));
    if (f.state !== 'on') return t('{} : connexion…', who(f.num));
    return f.note ? t('{} : à l\'écoute ({})', who(f.num), t(f.note)) : t('{} : à l\'écoute', who(f.num));
  });
  setStatus(parts.length ? t('Radios embarquées · {}', parts.join(' · ')) : t('Radios embarquées : choisissez un pilote (pilote suivi ou duel).'));
}

// Met les écoutes en conformité avec les pilotes choisis
async function reconcile() {
  if (reconciling) { reconcile.again = true; return; }
  reconciling = true;
  try {
    if (prefs.obRadio && store.status?.source?.mode && store.status.source.mode !== 'live') {
      for (const f of feeds.values()) stopFeed(f);
      feeds.clear();
      setStatus(t('Radios embarquées : disponibles pendant les séances en direct seulement.'));
      return;
    }
    if (prefs.obRadio && !isCapturer) { setStatus(t('Radios embarquées : écoute faite par une autre fenêtre.')); return; }
    const want = new Set(wanted());
    for (const [num, f] of feeds) if (!want.has(num)) { stopFeed(f); feeds.delete(num); }
    for (const num of want) {
      const f = feeds.get(num);
      // Écoute en échec : nouvel essai au bout d'une minute (flux pas encore ouvert, coupure…)
      if (f && !(f.state === 'error' && Date.now() - (f.failedAt || 0) > 60000)) continue;
      if (f) { stopFeed(f); feeds.delete(num); }
      startFeed(num).catch((err) => {
        const f = feeds.get(num);
        if (f) { f.state = 'error'; f.note = err.message; f.failedAt = Date.now(); }
        showStatus();
      }).finally(showStatus);
    }
    showStatus();
  } finally {
    reconciling = false;
    if (reconcile.again) { reconcile.again = false; reconcile(); }
  }
}

export function initOnboardRadio() {
  const box = $('#obRadio');
  if (!box) return;
  box.checked = prefs.obRadio;
  box.addEventListener('change', (e) => setPref('obRadio', e.target.checked));
  const who = $('#obRadioWho');
  who.value = prefs.obRadioWho;
  who.addEventListener('change', (e) => setPref('obRadioWho', e.target.value));
  on('prefs', (k) => {
    if (k === 'obRadio') { box.checked = prefs.obRadio; $('#obRadioOpts').hidden = !prefs.obRadio; reconcile(); }
    if (k === 'obRadioWho') { who.value = prefs.obRadioWho; reconcile(); }
    if (k === 'favs' && prefs.obRadioWho === 'favs') reconcile();
  });
  $('#obRadioOpts').hidden = !prefs.obRadio;
  on('focus', () => reconcile());
  on('duel', () => reconcile());
  on('reset', () => { for (const f of feeds.values()) stopFeed(f); feeds.clear(); content = null; contentKey = ''; reconcile(); });
  let mode = null;
  on('status', () => {
    const m = store.status?.source?.mode || null;
    if (m === mode) return;
    mode = m;
    if (prefs.obRadio) reconcile();
  });
  // Une seule fenêtre écoute (les radios sont partagées avec les autres)
  navigator.locks?.request('paddock-onboard-radio', () => {
    isCapturer = true;
    reconcile();
    return new Promise(() => {});
  });
  setInterval(() => { if (prefs.obRadio && [...feeds.values()].some((f) => f.state === 'error')) reconcile(); }, 30000);
  if (prefs.obRadio) reconcile();
}

