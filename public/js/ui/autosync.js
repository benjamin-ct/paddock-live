// Synchro TV automatique par le son (expérimental) : le micro de l'ordinateur écoute la TV ; quand
// une radio d'équipe passe à l'antenne, elle est reconnue et le délai de la diffusion en est déduit.
// Repère : l'heure de publication de chaque radio dans le flux F1, qui correspond à son passage à
// l'antenne. Le son du micro reste en mémoire (2 min 30 au plus) sur l'ordinateur : rien n'est
// enregistré ni envoyé.
import { store, setDelay, f1Now, replaySpeed } from '../store.js';
import { $, esc, api, fmtDelay, drivers } from '../util.js';
import { prefs, setPref } from '../prefs.js';
import { icon } from '../icons.js';
import { toast } from './delay.js';
import { RATE, Resampler, commonNoise, removeNoise, delayFromMatch } from '/shared/audio-sync.js';
import { parseUtc } from '/shared/f1.js';
import { DEC, LOCALE } from '../i18n.js';

const KEEP_S = 150;             // son du micro gardé en mémoire (s)
const MAX_LISTEN_MS = 15 * 60e3; // l'écoute s'arrête d'elle-même au bout de 15 min
const NOISE_CLIPS = 12;         // radios utilisées pour estimer le bruit de fond commun
const MIN_NOISE_CLIPS = 6;      // en dessous, l'estimation est trop imprécise (fausses reconnaissances)

let run = null;                 // écoute en cours
let last = null;                // dernier message d'état

export function autoSyncSupported() {
  return !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode);
}

const fmtS = (ms) => `${(ms / 1000).toFixed(1).replace('.', DEC)} s`;
const fmtDur = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`; };

function setStatus(text, kind = '') {
  last = { text, kind };
  render();
}

// ---------- Son du micro ----------
function onAudio({ t0, samples }) {
  const r = run;
  if (!r) return;
  // Trou dans le son (ordinateur en veille, micro débranché…) : nouveau repère de temps
  const expected = r.nextT0;
  if (expected === null || Math.abs(t0 - expected) > 0.05) {
    r.rs = new Resampler(r.ctx.sampleRate, RATE);
    r.segs.push({ idx: r.count, ctx: t0 });
    if (r.segs.length > 50) r.segs.shift();
  }
  r.nextT0 = t0 + samples.length / r.ctx.sampleRate;
  const out = r.rs.push(samples);
  const size = r.mic.length;
  for (let i = 0; i < out.length; i++) r.mic[(r.count + i) % size] = out[i];
  r.count += out.length;
  let e = 0;
  for (let i = 0; i < samples.length; i++) e += samples[i] * samples[i];
  const rms = Math.sqrt(e / samples.length);
  r.level = Math.max(rms, r.level * 0.85);
  if (rms > 0.003) r.heardAt = performance.now();
}

// Copie du son entre deux indices absolus (8 kHz)
function micSlice(a, b) {
  const size = run.mic.length;
  const out = new Float32Array(b - a);
  for (let i = a; i < b; i++) out[i - a] = run.mic[i % size];
  return out;
}

// Indice absolu -> heure de la page (performance.now)
function idxToPerf(i) {
  let seg = run.segs[0];
  for (const s of run.segs) if (s.idx <= i) seg = s;
  const ctxT = seg.ctx + (i - seg.idx) / RATE;
  return performance.now() - (run.ctx.currentTime - ctxT) * 1000;
}

// ---------- Ce que le dashboard affichait à un instant donné ----------
function sampleShown() {
  if (!run) return;
  run.shown.push({ p: performance.now(), f1: f1Now(), d: store.delay });
  const old = performance.now() - (KEEP_S + 60) * 1000;
  while (run.shown.length > 2 && run.shown[0].p < old) run.shown.shift();
}

function shownAt(p) {
  const s = run.shown;
  for (let i = s.length - 1; i > 0; i--) {
    const a = s[i - 1], b = s[i];
    if (a.p <= p && p <= b.p) {
      // Le délai a changé entre les deux mesures : pas d'interpolation possible
      if (a.d !== b.d) return { f1: a.f1 + (p - a.p) * replaySpeed(), d: a.d };
      return { f1: a.f1 + (b.f1 - a.f1) * (p - a.p) / Math.max(1, b.p - a.p), d: a.d };
    }
  }
  return null;
}

// ---------- Radios ----------
async function decodeClip(url) {
  const res = await fetch(`/api/f1tv/proxy?u=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`radio ${res.status}`);
  const audio = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await res.arrayBuffer());
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * RATE), RATE);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0).slice();
}

async function refreshRadios() {
  run.lastFetch = performance.now();
  try {
    const r = await api('/api/sync/radios');
    if (!run) return;
    run.base = r.base;
    for (const x of r.radios || []) {
      if (run.clips.has(x.path)) continue;
      const t = parseUtc(x.utc);
      if (Number.isFinite(t)) run.clips.set(x.path, { ...x, t, data: null, failed: false, searched: null, matched: false });
    }
  } catch { /* nouvel essai au prochain passage */ }
}

// Radios qui peuvent passer à la TV pendant l'écoute : publiées au plus « délai maximal » avant
// le début de l'écoute (heure du direct).
function candidates() {
  const maxDelay = store.status?.maxDelayMs ?? 600000;
  return [...run.clips.values()].filter((c) => !c.matched && !c.failed && c.t >= run.liveStart - maxDelay - 30000);
}

async function decodeSome() {
  if (!run.base) return;
  const all = [...run.clips.values()].filter((c) => !c.failed);
  const need = new Set(candidates());
  // Quelques radios plus anciennes servent à estimer le bruit de fond commun
  for (const c of all.slice(-NOISE_CLIPS)) need.add(c);
  let n = 0;
  for (const c of need) {
    if (c.data || n >= 3) continue;
    n++;
    try { c.data = await decodeClip(run.base + c.path); } catch { c.failed = true; }
    if (!run) return;
  }
  const decoded = all.filter((c) => c.data).slice(-NOISE_CLIPS);
  if (decoded.length >= MIN_NOISE_CLIPS && decoded.length !== run.noiseFrom) {
    run.noise = commonNoise(decoded.map((c) => c.data));
    run.noiseFrom = decoded.length;
  }
}

function workerMatch(mic, clip) {
  return new Promise((resolve) => {
    const id = ++run.reqId;
    run.pending.set(id, resolve);
    run.worker.postMessage({ id, mic, clip }, [mic.buffer]);
  });
}

async function searchAll() {
  // Sans bruit de fond estimé, deux radios différentes se ressemblent trop : on attend
  if (!run.noise) return;
  const size = run.mic.length;
  for (const c of candidates()) {
    if (!run || !c.data) continue;
    const end = run.count;
    const oldest = Math.max(0, end - size + 1);
    const from = Math.max(oldest, (c.searched ?? run.startIdx) - c.data.length - RATE);
    if (end - from < c.data.length + RATE) continue; // pas encore assez de son
    const r = await workerMatch(micSlice(from, end), removeNoise(c.data, run.noise));
    if (!run) return;
    if (r.error || !r.ok) { c.searched = end; continue; }
    const start = from + r.start;
    if (start + c.data.length > end) continue; // radio encore à l'antenne : on attend la fin
    c.searched = end;
    c.matched = true;
    apply(c, start, r.score);
  }
}

function apply(c, startIdx, score) {
  const s = shownAt(idxToPerf(startIdx));
  if (!s) return;
  const maxDelay = store.status?.maxDelayMs ?? 600000;
  const nd = delayFromMatch(s.d, s.f1, c.t, prefs.autoSyncAdj * 1000);
  const who = drivers(store.state)[c.num]?.Tla || `#${c.num}`;
  if (nd < 0 || nd > maxDelay) {
    run.matches.unshift({ who, delay: nd, ok: false, at: Date.now() });
    setStatus(`Radio de ${who} entendue, mais elle donne un délai impossible (${fmtS(nd)}) : sans doute rediffusée. Toujours à l'écoute.`, 'err');
    return;
  }
  setDelay(nd);
  run.matches.unshift({ who, delay: store.delay, ok: true, score, at: Date.now() });
  toast(`Synchro par le son : radio de ${who} reconnue, délai ${fmtDelay(store.delay)}`, 4000, 'check');
  setStatus(`Calé sur la radio de ${who}.`, 'ok');
}

async function tick() {
  if (!run || run.ticking) return;
  run.ticking = true;
  try {
    if (performance.now() - run.started > MAX_LISTEN_MS) { stop('Écoute arrêtée au bout de 15 minutes.'); return; }
    if (replaySpeed() !== 1) { setStatus('Remettez la lecture en vitesse normale (1x).', 'err'); return; }
    if (performance.now() - run.lastFetch > 10000) await refreshRadios();
    if (!run) return;
    if (!run.base) { setStatus('Pas de séance en cours : aucune radio à reconnaître.', 'err'); return; }
    await decodeSome();
    if (!run) return;
    if (!run.noise) {
      const total = [...run.clips.values()].filter((c) => !c.failed).length;
      setStatus(total < MIN_NOISE_CLIPS
        ? `En attente de radios publiées (${total} sur ${MIN_NOISE_CLIPS}).`
        : 'Préparation des radios de la séance…', '');
      return;
    }
    if (!run.ready) {
      run.ready = true;
      setStatus('En écoute : laissez le son de la TV, le délai se règle à la prochaine radio.', 'ok');
    }
    await searchAll();
  } finally {
    if (run) run.ticking = false;
    render();
  }
}

// ---------- Démarrer / arrêter ----------
async function start() {
  if (run) return;
  if (replaySpeed() !== 1) { setStatus('Remettez la lecture en vitesse normale (1x).', 'err'); return; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  } catch (err) {
    setStatus(err.name === 'NotAllowedError'
      ? 'Accès au micro refusé : autorisez-le pour Paddock Live.'
      : `Micro indisponible (${err.message}).`, 'err');
    return;
  }
  const ctx = new AudioContext();
  try {
    await ctx.audioWorklet.addModule('/js/workers/mic-tap.js');
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
    setStatus(`Écoute impossible (${err.message}).`, 'err');
    return;
  }
  const src = ctx.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(ctx, 'mic-tap', { channelCount: 1, channelCountMode: 'explicit' });
  const silent = ctx.createGain();
  silent.gain.value = 0;                       // rien n'est rejoué dans les haut-parleurs
  src.connect(tap).connect(silent).connect(ctx.destination);
  const worker = new Worker('/js/workers/autosync.js', { type: 'module' });
  run = {
    stream, ctx, tap, worker,
    rs: new Resampler(ctx.sampleRate, RATE),
    mic: new Float32Array(KEEP_S * RATE), count: 0, startIdx: 0, segs: [], nextT0: null,
    level: 0, heardAt: 0, started: performance.now(),
    liveStart: f1Now() + store.delay * replaySpeed(),   // heure F1 du direct au début de l'écoute
    shown: [], clips: new Map(), base: null, noise: null, noiseFrom: 0,
    matches: [], lastFetch: -Infinity, reqId: 0, pending: new Map(), ticking: false,
  };
  worker.onmessage = ({ data }) => { const fn = run?.pending.get(data.id); if (fn) { run.pending.delete(data.id); fn(data); } };
  // Fil de calcul en échec (chargement impossible…) : les recherches en attente ne doivent pas
  // bloquer l'écoute indéfiniment
  worker.onerror = (e) => {
    e.preventDefault?.();
    for (const fn of run?.pending.values() || []) fn({ ok: false, error: 'worker' });
    run?.pending.clear();
  };
  tap.port.onmessage = ({ data }) => onAudio(data);
  run.shownTimer = setInterval(sampleShown, 250);
  run.timer = setInterval(tick, 3000);
  run.uiTimer = setInterval(render, 500);
  sampleShown();
  setStatus('Préparation des radios de la séance…', '');
  tick();
}

function stop(msg) {
  if (!run) return;
  const r = run;
  run = null;
  clearInterval(r.timer);
  clearInterval(r.shownTimer);
  clearInterval(r.uiTimer);
  r.stream.getTracks().forEach((t) => t.stop());
  r.ctx.close().catch(() => {});
  r.worker.terminate();
  for (const fn of r.pending.values()) fn({ ok: false, error: 'stop' });
  lastMatches = r.matches;
  setStatus(msg || (r.matches.some((m) => m.ok) ? 'Écoute terminée.' : 'Écoute arrêtée.'), '');
}

let lastMatches = [];

// ---------- Affichage ----------
function render() {
  const box = $('#autoSync');
  if (!box) return;
  const on = !!run;
  $('#syncBtn')?.classList.toggle('listening', on);
  $('#asStart').innerHTML = on ? `${icon('stop')} Arrêter l'écoute` : `${icon('mic')} Écouter la TV`;
  $('#asStart').classList.toggle('btn-accent', !on);
  $('#asMeter').hidden = !on;
  if (on) {
    $('#asLevel').style.width = `${Math.min(100, Math.round(Math.sqrt(run.level) * 220))}%`;
    const quiet = performance.now() - Math.max(run.heardAt, run.started) > 10000;
    $('#asTime').textContent = `${fmtDur(performance.now() - run.started)}${quiet ? ' · le micro n\'entend presque rien : montez le son de la TV ou rapprochez l\'ordinateur' : ''}`;
  }
  const st = $('#asStatus');
  st.textContent = last?.text || '';
  st.className = `small as-status ${last?.kind || ''}`;
  const matches = run ? run.matches : lastMatches;
  $('#asResults').innerHTML = matches.slice(0, 5).map((m) => `<li class="${m.ok ? '' : 'muted'}">${icon(m.ok ? 'check' : 'warning')}
    <span>Radio de <b>${esc(m.who)}</b> ${m.ok ? `reconnue · délai réglé sur <b>${esc(fmtDelay(m.delay))}</b>` : 'ignorée (délai impossible)'}</span>
    <span class="muted">${new Date(m.at).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></li>`).join('');
  $('#asAdj').textContent = `${prefs.autoSyncAdj > 0 ? '+' : ''}${fmtS(prefs.autoSyncAdj * 1000)}`;
}

export function initAutoSync() {
  const box = $('#autoSync');
  if (!box) return;
  // Fenêtre principale de l'ordinateur uniquement (micro ; pas les panneaux détachés ni le téléphone)
  if (new URLSearchParams(location.search).has('win') || !autoSyncSupported()) {
    box.hidden = true;
    return;
  }
  $('#asStart').addEventListener('click', () => (run ? stop() : start()));
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-asadj]');
    if (!b) return;
    setPref('autoSyncAdj', Math.round((prefs.autoSyncAdj + Number(b.dataset.asadj)) * 10) / 10);
    render();
  });
  window.addEventListener('pagehide', () => stop());
  render();
}

