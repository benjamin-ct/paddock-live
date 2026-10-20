// Mode créateur (appli et page web) : vidéo verticale (TikTok) à partir des visuels au format story. Diaporama avec
// léger zoom et fondus, ou animation (vidéo de la course, Breaking news), avec une musique générée
// sur place (libre de droits), un fichier audio choisi, ou sans musique.
// Fabriquée image par image (WebCodecs) : 30 images par seconde exactes, quel que soit le temps de
// dessin de chaque image. Navigateur sans WebCodecs : enregistrée en temps réel (MediaRecorder).

import { playTrack } from './social-music.js';

const W = 1080;
const H = 1920;

function pickMime(withAudio) {
  const list = withAudio
    ? ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'];
  // MP4 seulement en H.264 (lu partout) ; sinon WebM, accepté aussi par TikTok
  return list.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

// WebM de l'enregistreur du navigateur : sans durée dans l'en-tête (lecteurs et TikTok la voient
// « infinie »). On l'ajoute dans la section Info (élément Duration, en millisecondes).
export function webmWithDuration(buf, ms) {
  const b = new Uint8Array(buf);
  const vint = (p) => { let len = 1; while (len <= 8 && !(b[p] & (0x80 >> (len - 1)))) len++; let v = b[p] & (0xff >> len); for (let i = 1; i < len; i++) v = v * 256 + b[p + i]; return { len, v, unknown: v === 2 ** (7 * len) - 1 }; };
  const id = (p) => { let len = 1; while (len <= 4 && !(b[p] & (0x80 >> (len - 1)))) len++; let v = 0; for (let i = 0; i < len; i++) v = v * 256 + b[p + i]; return { len, v }; };
  let p = 0;
  while (p < b.length) {
    const i = id(p); const sz = vint(p + i.len);
    const data = p + i.len + sz.len;
    if (i.v === 0x18538067) {   // Segment : on cherche Info parmi ses enfants
      let q = data;
      while (q < b.length) {
        const ci = id(q); const cs = vint(q + ci.len);
        const cdata = q + ci.len + cs.len;
        if (ci.v === 0x1549a966) {   // Info
          const dur = new Uint8Array(11);
          dur.set([0x44, 0x89, 0x88]);
          new DataView(dur.buffer).setFloat64(3, ms);
          const newSize = cs.v + 11;
          if (newSize >= 2 ** (7 * cs.len) - 1) return buf;
          const sizeBytes = new Uint8Array(cs.len);
          let v = newSize;
          for (let k = cs.len - 1; k >= 0; k--) { sizeBytes[k] = v & 0xff; v = Math.floor(v / 256); }
          sizeBytes[0] |= 0x80 >> (cs.len - 1);
          const out = new Uint8Array(b.length + 11);
          out.set(b.subarray(0, q + ci.len), 0);
          out.set(sizeBytes, q + ci.len);
          out.set(b.subarray(cdata, cdata + cs.v), cdata);
          out.set(dur, cdata + cs.v);
          out.set(b.subarray(cdata + cs.v), cdata + cs.v + 11);
          return out.buffer;
        }
        if (cs.unknown) return buf;
        q = cdata + cs.v;
      }
      return buf;
    }
    if (sz.unknown) return buf;
    p = data + sz.v;
  }
  return buf;
}

// Musique de la vidéo, calculée d'avance (fondu d'entrée et de sortie comme en temps réel)
async function renderMusic(music, file, track, duration, rate = 48000) {
  const ac = new OfflineAudioContext(2, Math.ceil(duration * rate), rate);
  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, 0);
  master.gain.exponentialRampToValueAtTime(0.8, 0.6);
  master.gain.setValueAtTime(0.8, Math.max(0.7, duration - 1.2));
  master.gain.exponentialRampToValueAtTime(0.0001, duration);
  master.connect(ac.destination);
  if (music === 'file' && file) {
    const src = ac.createBufferSource();
    src.buffer = await ac.decodeAudioData(await file.arrayBuffer());
    src.loop = src.buffer.duration < duration;
    src.connect(master); src.start();
  } else playTrack(ac, master, track, duration);
  return ac.startRendering();
}

// Formats essayés dans l'ordre : MP4 (H.264 + AAC, lu partout), sinon WebM (VP9 + Opus, accepté par TikTok)
const PLANS = [
  { mime: 'video/mp4', lib: () => import('./mp4-muxer.js'), video: [['avc1.640028', 'avc'], ['avc1.4d0028', 'avc'], ['avc1.42002a', 'avc']], audio: ['mp4a.40.2', 'aac'], opts: { fastStart: 'in-memory' } },
  { mime: 'video/webm', lib: () => import('./webm-muxer.js'), video: [['vp09.00.40.08', 'V_VP9'], ['vp8', 'V_VP8']], audio: ['opus', 'A_OPUS'], opts: {} },
];
const FPS = 30;
async function pickPlan(withAudio) {
  if (!window.VideoEncoder || !window.VideoFrame || (withAudio && !window.AudioEncoder)) return null;
  for (const plan of PLANS) {
    if (withAudio && !(await AudioEncoder.isConfigSupported({ codec: plan.audio[0], sampleRate: 48000, numberOfChannels: 2, bitrate: 192e3 }).catch(() => ({}))).supported) continue;
    for (const [codec, name] of plan.video) {
      const config = { codec, width: W, height: H, bitrate: 8e6, framerate: FPS, ...(name === 'avc' ? { avc: { format: 'avc' } } : {}) };
      if ((await VideoEncoder.isConfigSupported(config).catch(() => ({}))).supported) return { ...plan, config, name };
    }
  }
  return null;
}

// Vidéo fabriquée image par image : chaque image dessinée puis encodée, sans limite de temps.
// null si le navigateur ne sait pas faire (enregistrement en temps réel à la place).
async function encodeFrames(paint, duration, { music, file, track, onProgress }) {
  const withAudio = music !== 'none';
  const plan = await pickPlan(withAudio);
  if (!plan) return null;
  const { Muxer, ArrayBufferTarget } = await plan.lib();
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target, firstTimestampBehavior: 'offset', ...plan.opts,
    video: { codec: plan.name, width: W, height: H, frameRate: FPS },
    ...(withAudio ? { audio: { codec: plan.audio[1], numberOfChannels: 2, sampleRate: 48000 } } : {}),
  });
  let failure = null;
  let silent = false;   // musique rendue muette par le navigateur : signalée à l'appelant
  const fail = (e) => { failure = failure || e; };
  if (withAudio) {
    const buf = await renderMusic(music, file, track, duration);
    silent = !buf.getChannelData(0).some((x) => Math.abs(x) > 1e-4);
    const enc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: fail });
    enc.configure({ codec: plan.audio[0], sampleRate: 48000, numberOfChannels: 2, bitrate: 192e3 });
    const step = 4800;
    for (let i = 0; i < buf.length; i += step) {
      const n = Math.min(step, buf.length - i);
      const data = new Float32Array(n * 2);
      data.set(buf.getChannelData(0).subarray(i, i + n), 0);
      data.set(buf.getChannelData(1).subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / 48000 * 1e6), data });
      enc.encode(ad); ad.close();
    }
    await enc.flush(); enc.close();
  }
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: fail });
  enc.configure(plan.config);
  const frames = Math.round(duration * FPS);
  for (let i = 0; i < frames && !failure; i++) {
    paint(ctx, Math.min(i / FPS, duration - 0.001));
    const vf = new VideoFrame(out, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(vf, { keyFrame: i % (FPS * 2) === 0 });
    vf.close();
    // Encodeur en retard : on l'attend ; et la page respire (avancement affiché)
    while (enc.encodeQueueSize > 3) await new Promise((r) => setTimeout(r, 2));
    if (i % 5 === 4) { onProgress?.((i + 1) / frames); await new Promise((r) => setTimeout(r, 0)); }
  }
  if (!failure) await enc.flush();
  enc.close();
  if (failure) throw failure;
  muxer.finalize();
  onProgress?.(1);
  return { blob: new Blob([target.buffer], { type: plan.mime }), mime: plan.mime, ...(silent ? { silent } : {}) };
}

// Son des vidéos enregistrées en temps réel : le contexte audio doit démarrer pendant le geste
// (toucher « Créer la vidéo »), sinon l'iPhone le laisse en pause et la vidéo sort muette. À appeler
// au tout début du clic, avant toute attente. Le mode silencieux de l'iPhone ne coupe plus le son.
let liveAc = null;
export function unlockAudio() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    liveAc = liveAc && liveAc.state !== 'closed' ? liveAc : new AudioContext();
    liveAc.resume().catch(() => {});
  } catch { /* pas de son possible dans ce navigateur */ }
}

// Zone sûre : sur les téléphones (écran plus allongé que 9:16), Reels, TikTok et Shorts remplissent l'écran
// en rognant les côtés (environ 9 % de chaque côté, ~100 px) et posent leur interface par-dessus : en haut
// l'onglet, la recherche ou le retour (~13 %), à droite la colonne J'aime / Commentaire / Partage (~110 px
// visibles), en bas le compte, la légende et la musique (~18 %). L'image est dessinée réduite (SAFE.s) dans
// le rectangle libre ; ses aplats pleine page (fond, lueurs, fondus) couvrent toute la vidéo : un seul fond
// continu, rien de coupé ni caché, ni bandes noires ni cadre.
const SAFE = { x: 120, y: 260, s: 0.68 };
export function safeFrame(paint) {
  return (ctx, t) => {
    const fill = ctx.fillRect;
    ctx.fillRect = function fullRect(x, y, w, h) {
      if (x !== 0 || y !== 0 || w !== W || h !== H) return fill.call(this, x, y, w, h);
      // Aplat de toute l'image : étendu à toute la vidéo (coins de la vidéo ramenés dans le repère courant)
      const m = this.getTransform().invertSelf();
      const pts = [[0, 0], [W, 0], [0, H], [W, H]].map(([a, b]) => m.transformPoint({ x: a, y: b }));
      const xs = pts.map((q) => q.x); const ys = pts.map((q) => q.y);
      return fill.call(this, Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    };
    ctx.save();
    ctx.setTransform(SAFE.s, 0, 0, SAFE.s, SAFE.x, SAFE.y);
    try { paint(ctx, t); } finally { ctx.restore(); delete ctx.fillRect; }
  };
}

// Animation : paint(ctx, t) dessine l'image à l'instant t (secondes), placée dans la zone sûre
export async function makeAnimation(draw, duration, opts = {}) {
  const paint = safeFrame(draw);
  try {
    const v = await encodeFrames(paint, duration, { music: 'gen', ...opts });
    if (v) return v;
  } catch { /* encodeur du navigateur en échec : enregistrement en temps réel */ }
  return recordLive(paint, duration, opts);
}

// Enregistrement en temps réel (navigateur sans WebCodecs)
async function recordLive(paint, duration, { music = 'gen', file = null, track, onProgress } = {}) {
  let silent = false;   // son bloqué par le navigateur : vidéo muette, signalée à l'appelant
  if (!window.MediaRecorder) throw new Error('Enregistrement vidéo indisponible dans ce navigateur');
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  const video = out.captureStream(30);
  let ac = null;
  const tracks = [...video.getVideoTracks()];
  let master = null;
  if (music !== 'none') {
    ac = liveAc && liveAc.state !== 'closed' ? liveAc : new AudioContext();
    await ac.resume().catch(() => {});
    if (ac.state !== 'running') silent = true;
    const dest = ac.createMediaStreamDestination();
    master = ac.createGain();
    master.gain.setValueAtTime(0.0001, ac.currentTime);
    master.gain.exponentialRampToValueAtTime(0.8, ac.currentTime + 0.6);
    master.gain.setValueAtTime(0.8, ac.currentTime + Math.max(0.7, duration - 1.2));
    master.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
    master.connect(dest);
    if (music === 'file' && file) {
      const buf = await ac.decodeAudioData(await file.arrayBuffer());
      const src = ac.createBufferSource();
      src.buffer = buf; src.loop = buf.duration < duration;
      src.connect(master); src.start();
    } else playTrack(ac, master, track, duration);
    tracks.push(...dest.stream.getAudioTracks());
  }
  const mimeType = pickMime(tracks.length > 1);
  const rec = new MediaRecorder(new MediaStream(tracks), { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 8e6, audioBitsPerSecond: 192e3 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((resolve) => { rec.onstop = resolve; });

  const draw = (t) => paint(ctx, t);
  draw(0);
  rec.start(500);
  const start = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      draw(Math.min(t, duration - 0.001));
      onProgress?.(Math.min(1, t / duration));
      if (t >= duration) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
  video.getTracks().forEach((tr) => tr.stop());
  // Contexte ouvert pendant le geste : gardé pour la vidéo suivante, seul le son de celle-ci est coupé
  if (ac === liveAc) master?.disconnect(); else await ac?.close();
  const type = (rec.mimeType || mimeType || 'video/webm').split(';')[0];
  let blob = new Blob(chunks, { type });
  if (type === 'video/webm') blob = new Blob([webmWithDuration(await blob.arrayBuffer(), duration * 1000)], { type });
  return { blob, mime: type, ...(silent ? { silent } : {}) };
}

// Diaporama des visuels au format story : léger zoom et fondu enchaîné
export async function makeVideo(slides, { perSlide = 3.2, ...opts } = {}) {
  const duration = slides.length * perSlide;
  const fade = 0.45;
  const draw = (ctx, t) => {
    const i = Math.min(slides.length - 1, Math.floor(t / perSlide));
    const local = t - i * perSlide;
    const paint = (c, k, alpha, dy = 0) => {
      const s = 1 + 0.045 * k;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate((W - W * s) / 2, (H - H * s) / 2 + dy);
      ctx.scale(s, s);
      if (c.paint) c.paint(ctx); else ctx.drawImage(c, 0, 0, W, H);
      ctx.restore();
    };
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, W, H);
    paint(slides[i], local / perSlide, 1);
    const next = slides[i + 1];
    if (next && local > perSlide - fade) {
      const p = (local - (perSlide - fade)) / fade;
      paint(next, 0, p, (1 - p) * 80);
    }
    ctx.globalAlpha = 1;
  };
  return makeAnimation(draw, duration, opts);
}
