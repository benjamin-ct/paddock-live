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

// Vidéos fabriquées image par image : chaque image dessinée puis encodée, sans limite de temps.
// paints : une vidéo par fonction de dessin, même musique ; null si le navigateur ne sait pas faire
// (enregistrement en temps réel à la place).
// prepare(t) : attendu avant de dessiner l'image de l'instant t (vidéo source calée sur t)
async function encodeFrames(paints, duration, { music, file, track, onProgress, prepare = null }) {
  const withAudio = music !== 'none';
  const plan = await pickPlan(withAudio);
  if (!plan) return null;
  const { Muxer, ArrayBufferTarget } = await plan.lib();
  const outs = paints.map((paint) => {
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target, firstTimestampBehavior: 'offset', ...plan.opts,
      video: { codec: plan.name, width: W, height: H, frameRate: FPS },
      ...(withAudio ? { audio: { codec: plan.audio[1], numberOfChannels: 2, sampleRate: 48000 } } : {}),
    });
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    return { paint, target, muxer, canvas, ctx: canvas.getContext('2d') };
  });
  let failure = null;
  let silent = false;   // musique rendue muette par le navigateur : signalée à l'appelant
  const fail = (e) => { failure = failure || e; };
  if (withAudio) {
    const buf = await renderMusic(music, file, track, duration);
    silent = !buf.getChannelData(0).some((x) => Math.abs(x) > 1e-4);
    // Son encodé une fois, copié dans chaque vidéo
    const enc = new AudioEncoder({ output: (c, m) => outs.forEach((o) => o.muxer.addAudioChunk(c, m)), error: fail });
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
  for (const o of outs) {
    o.enc = new VideoEncoder({ output: (c, m) => o.muxer.addVideoChunk(c, m), error: fail });
    o.enc.configure(plan.config);
  }
  const frames = Math.round(duration * FPS);
  for (let i = 0; i < frames && !failure; i++) {
    const time = Math.min(i / FPS, duration - 0.001);
    if (prepare) await prepare(time);
    for (const o of outs) {
      o.paint(o.ctx, time);
      const vf = new VideoFrame(o.canvas, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      o.enc.encode(vf, { keyFrame: i % (FPS * 2) === 0 });
      vf.close();
      // Encodeur en retard : on l'attend
      while (o.enc.encodeQueueSize > 3) await new Promise((r) => setTimeout(r, 2));
    }
    // La page respire (avancement affiché)
    if (i % 5 === 4) { onProgress?.((i + 1) / frames); await new Promise((r) => setTimeout(r, 0)); }
  }
  for (const o of outs) {
    if (!failure) await o.enc.flush();
    o.enc.close();
  }
  if (failure) throw failure;
  onProgress?.(1);
  return outs.map((o) => {
    o.muxer.finalize();
    return { blob: new Blob([o.target.buffer], { type: plan.mime }), mime: plan.mime, ...(silent ? { silent } : {}) };
  });
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
// Vidéos animées (course, Breaking news) : mise en page refaite à la taille du rectangle libre (texte et
// graphique plus grands qu'une image réduite) ; paint(ctx, t, w, h)
const BOX = { x: 100, y: 240, w: 790, h: 1340 };
export function safeFrame(paint, { box = false } = {}) {
  const [ox, oy, s, fw, fh] = box ? [BOX.x, BOX.y, 1, BOX.w, BOX.h] : [SAFE.x, SAFE.y, SAFE.s, W, H];
  return (ctx, t) => {
    const fill = ctx.fillRect;
    ctx.fillRect = function fullRect(x, y, w, h) {
      if (x !== 0 || y !== 0 || w !== fw || h !== fh) return fill.call(this, x, y, w, h);
      // Aplat de toute l'image : étendu à toute la vidéo (coins de la vidéo ramenés dans le repère courant)
      const m = this.getTransform().invertSelf();
      const pts = [[0, 0], [W, 0], [0, H], [W, H]].map(([a, b]) => m.transformPoint({ x: a, y: b }));
      const xs = pts.map((q) => q.x); const ys = pts.map((q) => q.y);
      return fill.call(this, Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    };
    // Liseré pleine image (Breaking news) : autour de tout l'écran, pas du contenu réduit
    const stroke = ctx.strokeRect;
    ctx.strokeRect = function edgeRect(x, y, w, h) {
      if (Math.abs(x * 2 + w - fw) > 1 || Math.abs(y * 2 + h - fh) > 1 || x > fw * 0.05) return stroke.call(this, x, y, w, h);
      const k = this.getTransform().a;
      const per = (2 * (W + H)) / (2 * (fw + fh) * k);   // tirets (tracé progressif) à l'échelle du tour d'écran
      this.save();
      this.setTransform(1, 0, 0, 1, 0, 0);
      this.lineWidth *= k;
      this.setLineDash(this.getLineDash().map((v) => v * k * per));
      const lw = this.lineWidth;
      stroke.call(this, lw / 2, lw / 2, W - lw, H - lw);
      this.restore();
    };
    ctx.save();
    ctx.setTransform(s, 0, 0, s, ox, oy);
    try { paint(ctx, t, fw, fh); } finally { ctx.restore(); delete ctx.fillRect; delete ctx.strokeRect; }
  };
}

// Couverture (miniature) : montrée COVER secondes au début de la vidéo (première image, couverture par
// défaut de TikTok) et rendue en JPEG (couverture envoyée à Instagram et Facebook)
const COVER = 0.4;
async function coverJpeg(paint) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  paint(c.getContext('2d'), 0);
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.9));
}

// Animation : draw(ctx, t) dessine l'image à l'instant t (secondes). Deux vidéos fabriquées ensemble :
// l'une placée dans la zone sûre (Reels, TikTok, Shorts), l'autre en plein écran (full : Facebook, Threads,
// Bluesky, X, partage). Résultat : { blob, mime, cover, full: { blob, mime } } ;
// opts.cover(ctx) : couverture dessinée au format de la vidéo ;
// opts.box : draw(ctx, t, w, h) mis en page à la taille du rectangle libre (sinon image réduite)
export async function makeAnimation(draw, duration, { cover = null, box = false, ...opts } = {}) {
  // Couverture en plein cadre (son contenu reste dans la partie centrale, celle des grilles de profil)
  const front = cover && ((ctx) => { ctx.save(); ctx.globalAlpha = 1; cover(ctx); ctx.restore(); });
  const withCover = (body) => (front ? (ctx, t) => (t < COVER ? front(ctx, 0) : body(ctx, t - COVER)) : body);
  const paints = [safeFrame(draw, { box }), (ctx, t) => draw(ctx, t, W, H)].map(withCover);
  const total = duration + (front ? COVER : 0);
  // Vidéo source calée sur le temps de l'animation (après la couverture)
  if (opts.prepare) { const prep = opts.prepare; opts.prepare = (t) => (front && t < COVER ? null : prep(t - (front ? COVER : 0))); }
  const extra = front ? { cover: await coverJpeg(front).catch(() => null) } : {};
  let vids = null;
  try {
    vids = await encodeFrames(paints, total, { music: 'gen', ...opts });
  } catch { /* encodeur du navigateur en échec : enregistrement en temps réel */ }
  const [safe, full] = vids || await recordLive(paints, total, opts);
  return { ...safe, ...extra, full: { blob: full.blob, mime: full.mime } };
}

// Enregistrement en temps réel (navigateur sans WebCodecs) : une vidéo par fonction de dessin, même son
async function recordLive(paints, duration, { music = 'gen', file = null, track, onProgress, prepare = null } = {}) {
  let silent = false;   // son bloqué par le navigateur : vidéo muette, signalée à l'appelant
  if (!window.MediaRecorder) throw new Error('Enregistrement vidéo indisponible dans ce navigateur');
  let ac = null;
  const audio = [];
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
    audio.push(...dest.stream.getAudioTracks());
  }
  const mimeType = pickMime(audio.length > 0);
  const outs = paints.map((paint) => {
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const video = out.captureStream(30);
    const rec = new MediaRecorder(new MediaStream([...video.getVideoTracks(), ...audio]), { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 8e6, audioBitsPerSecond: 192e3 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((resolve) => { rec.onstop = resolve; });
    return { paint, ctx: out.getContext('2d'), video, rec, chunks, done };
  });

  // Vidéo source calée au mieux (en temps réel, sans attendre : une demande à la fois)
  let busy = false;
  const draw = (t) => {
    if (prepare && !busy) { busy = true; Promise.resolve(prepare(t)).finally(() => { busy = false; }); }
    outs.forEach((o) => o.paint(o.ctx, t));
  };
  draw(0);
  outs.forEach((o) => o.rec.start(500));
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
  outs.forEach((o) => o.rec.stop());
  await Promise.all(outs.map((o) => o.done));
  outs.forEach((o) => o.video.getTracks().forEach((tr) => tr.stop()));
  // Contexte ouvert pendant le geste : gardé pour la vidéo suivante, seul le son de celle-ci est coupé
  if (ac === liveAc) master?.disconnect(); else await ac?.close();
  return Promise.all(outs.map(async ({ rec, chunks }) => {
    const type = (rec.mimeType || mimeType || 'video/webm').split(';')[0];
    let blob = new Blob(chunks, { type });
    if (type === 'video/webm') blob = new Blob([webmWithDuration(await blob.arrayBuffer(), duration * 1000)], { type });
    return { blob, mime: type, ...(silent ? { silent } : {}) };
  }));
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
  // Couverture : le premier visuel (sa couverture le plus souvent)
  return makeAnimation(draw, duration, { cover: slides[0]?.paint ? (ctx) => slides[0].paint(ctx) : null, ...opts });
}
