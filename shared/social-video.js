// Mode créateur (appli et page web) : vidéo verticale (TikTok) à partir des visuels au format story. Diaporama avec
// léger zoom et fondus, ou animation (vidéo de la course, Breaking news), avec une musique générée
// sur place (libre de droits), un fichier audio choisi, ou sans musique.
// Fabriquée image par image (WebCodecs) : 30 images par seconde exactes, quel que soit le temps de
// dessin de chaque image. Navigateur sans WebCodecs : enregistrée en temps réel (MediaRecorder).

import { playTrack } from './social-music.js';

// Tailles des vidéos (opts.format) : 9:16 (format des réseaux), plus haute (forme des téléphones récents) ou paysage
const SIZES = { std: [1080, 1920], tall: [1080, 2340], wide: [1920, 1080] };
const STD = 1920;

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

// Formats essayés dans l'ordre : MP4 (H.264 + AAC, lu partout ; niveau 5.1 pour la vidéo plus haute, au-delà du 4.0),
// sinon WebM (VP9 + Opus, accepté par TikTok)
const PLANS = [
  { mime: 'video/mp4', lib: () => import('./mp4-muxer.js'), video: [['avc1.640028', 'avc'], ['avc1.4d0028', 'avc'], ['avc1.42002a', 'avc'], ['avc1.640033', 'avc'], ['avc1.4d0033', 'avc']], audio: ['mp4a.40.2', 'aac'], opts: { fastStart: 'in-memory' } },
  { mime: 'video/webm', lib: () => import('./webm-muxer.js'), video: [['vp09.00.40.08', 'V_VP9'], ['vp8', 'V_VP8']], audio: ['opus', 'A_OPUS'], opts: {} },
];
const FPS = 30;
async function pickPlan(withAudio, [W, H]) {
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
async function encodeFrames(paints, duration, [W, H], { music, file, track, onProgress, prepare = null }) {
  const withAudio = music !== 'none';
  const plan = await pickPlan(withAudio, [W, H]);
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

// Couverture (miniature) : montrée COVER secondes au début de la vidéo (première image, couverture par
// défaut de TikTok) et rendue en JPEG (couverture envoyée à Instagram et Facebook)
const COVER = 0.4;
async function coverJpeg(paint, [W, H]) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  paint(c.getContext('2d'), 0);
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.9));
}

// Animation : draw(ctx, t, w, h) dessine l'image à l'instant t (secondes), en plein écran, la même vidéo pour tous
// les réseaux. Résultat : { blob, mime, cover, silent, w, h } ; opts.cover(ctx, w, h) : couverture dessinée au format
// de la vidéo ; opts.format : 'std' (9:16), 'tall' (1080 × 2340) ou 'wide' (1920 × 1080, dessin prévu pour)
export async function makeAnimation(draw, duration, { cover = null, format = 'std', ...opts } = {}) {
  const size = SIZES[format] || SIZES.std;
  const [W, H] = size;
  // Couverture en plein cadre (son contenu reste dans la partie centrale, celle des grilles de profil)
  const front = cover && ((ctx) => { ctx.save(); ctx.globalAlpha = 1; cover(ctx, W, H); ctx.restore(); });
  const withCover = (body) => (front ? (ctx, t) => (t < COVER ? front(ctx, 0) : body(ctx, t - COVER)) : body);
  const paints = [(ctx, t) => draw(ctx, t, W, H)].map(withCover);
  const total = duration + (front ? COVER : 0);
  // Vidéo source calée sur le temps de l'animation (après la couverture)
  if (opts.prepare) { const prep = opts.prepare; opts.prepare = (t) => (front && t < COVER ? null : prep(t - (front ? COVER : 0))); }
  const extra = { w: W, h: H, ...(front ? { cover: await coverJpeg(front, size).catch(() => null) } : {}) };
  const music = opts.music || 'gen';
  let vids = null;
  try {
    vids = await encodeFrames(paints, total, size, { ...opts, music });
  } catch { /* encodeur du navigateur en échec : enregistrement en temps réel */ }
  if (!vids) return { ...(await recordLive(paints, total, size, { ...opts, music }))[0], ...extra };
  // Musique perdue à l'encodage (piste muette ou illisible, selon les navigateurs) : enregistrement en temps réel
  // essayé ; gardé seulement s'il a du son, sinon la vidéo encodée (signalée muette si sa piste l'est vraiment)
  const heard = music === 'none' ? true : await audible(vids[0].blob);
  if (vids[0].silent || heard === false || heard === null) {
    const live = await recordLive(paints, total, size, { ...opts, music }).catch(() => null);
    if (live && !live[0].silent) return { ...live[0], ...extra };
    if (heard === false) vids[0].silent = true;
  }
  return { ...vids[0], ...extra };
}

// Son de la vidéo fabriquée : true (audible), false (piste muette), null (illisible par le navigateur), undefined
// (vidéo de plus de 50 Mo pas vérifiée : trop de mémoire sur téléphone)
async function audible(blob) {
  if (blob.size > 50e6) return undefined;
  try {
    const buf = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(await blob.arrayBuffer());
    return buf.getChannelData(0).some((x) => Math.abs(x) > 1e-3);
  } catch { return null; }
}

// Enregistrement en temps réel (navigateur sans WebCodecs) : une vidéo par fonction de dessin, même son
async function recordLive(paints, duration, [W, H], { music = 'gen', file = null, track, onProgress, prepare = null } = {}) {
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
  // Page cachée (autre appli, écran verrouillé : l'iPhone la met en pause) : enregistrement et horloge
  // arrêtés, repris au retour, sinon la vidéo s'arrêtait au retour sans sa fin
  let away = 0;
  let since = 0;
  const vis = () => {
    if (document.hidden) { since = performance.now(); outs.forEach((o) => o.rec.state === 'recording' && o.rec.pause()); }
    else if (since) { away += performance.now() - since; since = 0; ac?.resume().catch(() => {}); outs.forEach((o) => o.rec.state === 'paused' && o.rec.resume()); }
  };
  document.addEventListener('visibilitychange', vis);
  await new Promise((resolve) => {
    const tick = () => {
      if (since) { requestAnimationFrame(tick); return; }
      const t = (performance.now() - start - away) / 1000;
      draw(Math.min(t, duration - 0.001));
      onProgress?.(Math.min(1, t / duration));
      if (t >= duration) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  document.removeEventListener('visibilitychange', vis);
  outs.forEach((o) => o.rec.stop());
  await Promise.all(outs.map((o) => o.done));
  outs.forEach((o) => o.video.getTracks().forEach((tr) => tr.stop()));
  // Contexte ouvert pendant le geste : gardé pour la vidéo suivante, seul le son de celle-ci est coupé
  if (ac === liveAc) master?.disconnect(); else await ac?.close();
  const vids = await Promise.all(outs.map(async ({ rec, chunks }) => {
    const type = (rec.mimeType || mimeType || 'video/webm').split(';')[0];
    let blob = new Blob(chunks, { type });
    if (type === 'video/webm') blob = new Blob([webmWithDuration(await blob.arrayBuffer(), duration * 1000)], { type });
    return { blob, mime: type };
  }));
  // Son vérifié sur la vidéo enregistrée : bloqué ou muet, elle est signalée à l'appelant (illisible : rien de sûr)
  if (music !== 'none' && (silent || await audible(vids[0].blob) === false)) vids.forEach((v) => { v.silent = true; });
  return vids;
}

// Diaporama des visuels au format story : zoom lent et continu, passage d'une image à l'autre en
// glissant (comme un carrousel qu'on fait défiler), adouci au départ et à l'arrivée
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
// Visuels au format story (1080 × 1920) dans une vidéo plus haute : centrés, leur fond prolongé en haut et en bas
export async function makeVideo(slides, { perSlide = 3.2, ...opts } = {}) {
  const duration = slides.length * perSlide;
  const W = 1080;
  const H = opts.format === 'tall' ? SIZES.tall[1] : STD;
  const oy = (H - STD) / 2;
  const swap = 0.6;
  // Visuel centré en hauteur, ses lignes du haut et du bas étirées jusqu'aux bords
  const place = (ctx, c) => {
    if (c.width && oy) { ctx.drawImage(c, 0, 0, W, 2, 0, 0, W, oy + 1); ctx.drawImage(c, 0, STD - 2, W, 2, 0, oy + STD - 1, W, oy + 1); }
    ctx.translate(0, oy);
    if (c.width) ctx.drawImage(c, 0, 0, W, STD); else c.paint(ctx);
  };
  const draw = (ctx, t) => {
    const i = Math.min(slides.length - 1, Math.floor(t / perSlide));
    const local = t - i * perSlide;
    // Image déjà dessinée (rapide, sans saccade) ; zoom de 0 à 4 % sur toute sa durée
    const paint = (c, k, x, fade = 1) => {
      const s = 1 + 0.04 * k;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(x + (W - W * s) / 2, (H - H * s) / 2);
      ctx.scale(s, s);
      place(ctx, c);
      ctx.restore();
    };
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#06070b'; ctx.fillRect(0, 0, W, H);
    const next = slides[i + 1];
    const p = next && local > perSlide - swap ? easeInOut((local - (perSlide - swap)) / swap) : 0;
    // Zoom continu d'une image à l'autre : celle qui arrive a déjà commencé le sien
    const zoom = (l) => (l + swap) / (perSlide + swap);
    paint(slides[i], zoom(local), -W * 0.35 * p, 1 - p * 0.6);
    if (p) paint(next, zoom(local - perSlide), W * (1 - p));
    ctx.globalAlpha = 1;
  };
  // Couverture : le premier visuel (sa couverture le plus souvent)
  const cover = (ctx) => { if (oy) place(ctx, slides[0]); else slides[0].paint(ctx); };
  return makeAnimation(draw, duration, { ...opts, cover: slides[0]?.paint ? cover : null, format: oy ? 'tall' : 'std' });
}
