// Vidéo d'un post avec sa propre vidéo (mode créateur, appli et page web) : un enregistrement d'écran, par
// exemple, habillé aux couleurs du post. En-tête « Actu F1 », titre du post, la vidéo au centre (coins arrondis),
// la source ; puis la fin « Abonnez-vous » de la vidéo des news. Fabriquée image par image par makeAnimation :
// la vidéo est calée sur chaque instant avant d'être dessinée (prepare).
import { C, TITLE, txt, fitLines, rr, background, breakingFrame } from './social-draw.js';
import { header, outro, OUTRO } from './social-news-video.js';
import { makeAnimation } from './social-video.js';
import { appPage, appOutro, APP_OUTRO } from './social-app.js';

export const CLIP_MAX = 60;   // secondes de la vidéo gardées au plus (TikTok, Shorts, Reels)
const FADE = 0.4;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const out3 = (x) => 1 - (1 - clamp01(x)) ** 3;

// Vidéo choisie (fichier) prête à être dessinée : élément <video> muet, sa durée et sa taille
export function loadClip(file) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('video');
    el.muted = true; el.playsInline = true; el.preload = 'auto';
    el.onloadeddata = () => resolve({ el, duration: Math.min(CLIP_MAX, el.duration || 0), w: el.videoWidth, h: el.videoHeight });
    el.onerror = () => reject(new Error('Vidéo illisible dans ce navigateur (MP4 en H.264 conseillé)'));
    el.src = URL.createObjectURL(file);
  });
}

// Vidéo calée sur l'instant t (résolu quand l'image est prête ; 1 s au plus)
function seek(el, t) {
  return new Promise((resolve) => {
    if (Math.abs(el.currentTime - t) < 0.001 && el.readyState >= 2) { resolve(); return; }
    const done = () => { el.removeEventListener('seeked', done); clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 1000);
    el.addEventListener('seeked', done);
    el.currentTime = t;
  });
}

// Mise en page (par taille d'image : zone sûre et plein écran) : titre sur 3 lignes au plus, la vidéo dans la
// place restante, en entier
const layouts = new WeakMap();
function layout(ctx, W, H, d, clip, u) {
  const key = `${W}x${H}`;
  if (!layouts.has(d)) layouts.set(d, new Map());
  if (layouts.get(d).has(key)) return layouts.get(d).get(key);
  const pad = 60 * u;
  const t = fitLines(ctx, String(d.title || '').toUpperCase(), W - pad * 2, [104, 92, 80, 70, 60].map((v) => Math.round(v * u)), 3, TITLE, 800);
  const lh = Math.round(t.size * 0.98);
  const top = 300 * u; const bottom = H - (d.source ? 170 : 110) * u;
  const boxTop = top + t.lines.length * lh + 50 * u;
  const maxW = W - pad * 2; const maxH = Math.max(100 * u, bottom - boxTop);
  const k = Math.min(maxW / (clip.w || 16), maxH / (clip.h || 9));
  const vw = (clip.w || 16) * k; const vh = (clip.h || 9) * k;
  const L = { pad, size: t.size, lh, lines: t.lines, top, vx: (W - vw) / 2, vy: boxTop + (maxH - vh) / 2, vw, vh };
  layouts.get(d).set(key, L);
  return L;
}

export function clipFrame(ctx, W, H, d, o, clip, t) {
  const u = W / 1080;
  // Post du compte Paddock Live : la vidéo à la place de la capture de sa page (la première sinon), fin aux couleurs de l'appli
  if (d.post === 'app') {
    if (t >= clip.duration) appOutro(ctx, W, H, t - clip.duration);
    else appPage(ctx, W, H, d, Math.max(1, (d.pages || []).findIndex((p) => p.video) + 1), { media: clip.el });
  } else if (t >= clip.duration) outro(ctx, W, H, d, o, u, t - clip.duration);
  else {
    background(ctx, W, H, d.color);
    const L = layout(ctx, W, H, d, clip, u);
    const k = out3(t / 0.6);
    ctx.save();
    ctx.globalAlpha = k;
    L.lines.forEach((line, i) => txt(ctx, line, L.pad, L.top + (i + 0.8) * L.lh + (1 - k) * 40 * u, { size: L.size, weight: 800, family: TITLE, max: W - L.pad * 2 }));
    // La vidéo, coins arrondis et liseré
    ctx.save();
    rr(ctx, L.vx, L.vy, L.vw, L.vh, 28 * u);
    ctx.clip();
    ctx.fillStyle = C.bg; ctx.fillRect(L.vx, L.vy, L.vw, L.vh);
    if (clip.el.readyState >= 2) ctx.drawImage(clip.el, L.vx, L.vy, L.vw, L.vh);
    ctx.restore();
    rr(ctx, L.vx, L.vy, L.vw, L.vh, 28 * u);
    ctx.lineWidth = 3 * u; ctx.strokeStyle = C.line; ctx.stroke();
    ctx.restore();
    header(ctx, W, d, o, u, t);
    if (d.source) txt(ctx, `SOURCE : ${d.source.toUpperCase()}`, W / 2, H - 90 * u, { size: Math.round(32 * u), weight: 700, family: TITLE, color: C.muted, align: 'center', spacing: 2, max: W - 120 * u });
  }
  // Vidéo → fin : fondu par le noir
  const f = 1 - Math.abs(t - clip.duration) / (FADE / 2);
  if (f > 0) { ctx.fillStyle = `rgba(11,13,18,${f})`; ctx.fillRect(0, 0, W, H); }
  if (d.breaking) breakingFrame(ctx, W, H, u, 1);
}

// file : la vidéo choisie ; d, o : données et images du post ; opts : musique, avancement (makeAnimation)
export async function makeClipVideo(file, d, o, opts = {}) {
  const clip = await loadClip(file);
  if (!(clip.duration > 0)) throw new Error('Vidéo vide ou illisible');
  try {
    return await makeAnimation((ctx, t, w, h) => clipFrame(ctx, w, h, d, o, clip, t), clip.duration + (d.post === 'app' ? APP_OUTRO : OUTRO), {
      box: true, prepare: (t) => (t < clip.duration ? seek(clip.el, t) : null), ...opts,
    });
  } finally { URL.revokeObjectURL(clip.el.src); }
}
