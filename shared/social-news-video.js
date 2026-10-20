// Vidéo « Breaking news » (mode créateur) : animation verticale 1080 × 1920 tirée des données d'un post
// news (newsPost), enregistrée dans le navigateur par makeAnimation. Quatre temps : intro « BREAKING »,
// l'info (photo, type, titre, résumé), les points clés un par un, puis « Abonnez-vous ». Même style que
// l'image : liseré rouge tout autour, étiquette « ● BREAKING » en haut à droite.
import { C, TITLE, BODY, rr, txt, fitLines, vivid, alpha, lightColor, background, photo, coverPhoto, photoCredit, driverPhoto, breakingFrame, breakingTag } from './social-draw.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const out3 = (x) => 1 - (1 - clamp01(x)) ** 3;
const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;
const INTRO = 1.8;
const OUTRO = 2.8;
const FADE = 0.4;   // passage d'un temps à l'autre : fondu par le noir

// Durées : le temps de lire (environ 3,5 mots par seconde) ; 4 points clés au plus
export function newsVideoTiming(d) {
  const pts = (d.points || []).slice(0, 4);
  const main = Math.min(9, Math.max(5, 2.2 + (words(d.title) + words(d.summary)) / 3.5));
  const per = pts.map((p) => Math.min(6, Math.max(3, 1.2 + words(p) / 3.5)));
  const starts = [INTRO, INTRO + main];
  per.forEach((s) => starts.push(starts.at(-1) + s));
  return { pts, main, starts, duration: starts.at(-1) + OUTRO };
}

// Étiquette du type de nouvelle ; renvoie sa largeur
function chip(ctx, b, x, y, u, size = 34) {
  ctx.font = `700 ${Math.round(size * u)}px ${TITLE}`;
  const w = ctx.measureText(b.label).width + 6 * b.label.length * u + 44 * u;
  rr(ctx, x, y, w, size * 1.7 * u, 8 * u); ctx.fillStyle = b.color; ctx.fill();
  txt(ctx, b.label, x + 22 * u, y + size * 1.21 * u, { size: Math.round(size * u), weight: 700, family: TITLE, color: lightColor(b.color) ? C.bg : '#fff', spacing: 6 * u });
  return w;
}

const blink = (t) => 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(t * Math.PI * 2.2));   // point qui clignote

// En-tête (Actu F1, date ; à droite : étiquette « BREAKING », signature dessous)
function header(ctx, W, d, o, u, t) {
  const pad = 60 * u; const top = 100 * u;
  ctx.fillStyle = C.red; ctx.fillRect(pad, top, 12 * u, 84 * u);
  txt(ctx, 'ACTU F1', pad + 34 * u, top + 40 * u, { size: Math.round(46 * u), weight: 800, family: TITLE, spacing: 4 });
  txt(ctx, d.date.toUpperCase(), pad + 34 * u, top + 80 * u, { size: Math.round(32 * u), weight: 600, family: TITLE, color: C.muted, spacing: 2 });
  breakingTag(ctx, W - pad, top, 72 * u, blink(t));
  txt(ctx, o.signature || '@BenjyPaddock', W - pad, top + 116 * u, { size: Math.round(32 * u), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 1 });
}

// Intro : le liseré se dessine, la grande étiquette « BREAKING » arrive au centre, puis le type d'info
// et la date
function intro(ctx, W, H, d, u, s) {
  background(ctx, W, H, C.red);
  u *= 1.25;   // écran centré : tout un cran plus grand
  const cy = H * 0.42;
  const kt = out3((s - 0.15) / 0.45);
  if (kt > 0) {
    ctx.save();
    ctx.globalAlpha = kt;
    ctx.translate(W / 2, cy); ctx.scale(1.25 - 0.25 * kt, 1.25 - 0.25 * kt);
    ctx.font = `800 ${Math.round(150 * 0.6 * u)}px ${TITLE}`;
    const h = 150 * u;
    const w = ctx.measureText('BREAKING').width + 8 * 0.18 * 0.6 * h + h * 1.25;
    breakingTag(ctx, w / 2, -h / 2, h, blink(s));
    ctx.restore();
  }
  const kc = out3((s - 0.65) / 0.4);
  if (kc > 0) {
    ctx.save(); ctx.globalAlpha = kc;
    ctx.font = `700 ${Math.round(40 * u)}px ${TITLE}`;
    const w = ctx.measureText(d.badge.label).width + 6 * d.badge.label.length * u + 44 * u;
    chip(ctx, d.badge, (W - w) / 2, cy + 150 * u + (1 - kc) * 40 * u, u, 40);
    txt(ctx, d.date.toUpperCase(), W / 2, cy + 290 * u + (1 - kc) * 40 * u, { size: Math.round(34 * u), weight: 600, family: TITLE, color: C.muted, align: 'center', spacing: 4 });
    ctx.restore();
  }
}

// Mise en page de l'info : titre et résumé au plus grand qui tient en entier, visuel agrandi dans la place
// restante, le tout centré en hauteur. Une mise en page par taille d'image (zone sûre et plein écran)
const layouts = new WeakMap();
const TOP = 290; const BOTTOM = 200;   // sous l'en-tête ; au-dessus de la source
function mainLayout(ctx, W, H, d, o, u) {
  const key = `${W}x${H}`;
  if (!layouts.has(d)) layouts.set(d, new Map());
  if (layouts.get(d).has(key)) return layouts.get(d).get(key);
  const pad = 60 * u; const colW = W - pad * 2;
  const top = TOP * u; const bottom = H - BOTTOM * u;
  const withPhoto = d.drivers.filter((p) => o.photos?.[p.num]);
  const custom = d.image?.width ? d.image : null;
  const vis = custom ? 'image' : withPhoto.length === 1 ? 'photo' : d.drivers.length ? 'row' : '';
  const gap = vis ? 50 * u : 0;
  const minVis = vis === 'row' ? 300 * u : vis ? (bottom - top) * 0.3 : 0;
  const avail = bottom - top - minVis - gap;
  const chipH = 110 * u; const rule = 80 * u;
  const blockOf = (p, n) => chipH + p.lines.length * p.lh + rule + n * p.sumLh;
  // Combinaisons titre / résumé : la plus grande qui tient (résumé en entier), sinon résumé coupé
  let pick = null; let cut = null;
  for (const size of [190, 170, 150, 136, 122, 110, 100, 90, 80, 70, 60].map((v) => Math.round(v * u))) {
    const lines = fitLines(ctx, d.title.toUpperCase(), colW, [size], 99, TITLE, 800).lines;
    if (lines.length > 5) continue;
    for (const sumSize of [60, 54, 48, 44, 40].map((v) => Math.round(v * u))) {
      if (sumSize > size * 0.5) continue;
      const sumLines = d.summary ? fitLines(ctx, d.summary, colW, [sumSize], 99, BODY, 400).lines : [];
      const p = { size, lh: Math.round(size * 0.98), lines, sumSize, sumLh: Math.round(sumSize * 1.36), sumLines };
      const score = size + 2.5 * sumSize;
      if (sumLines.length <= 9 && blockOf(p, sumLines.length) <= avail) { if (!pick || score > pick.score) pick = { ...p, score, sumN: sumLines.length }; }
      else if (!cut) {
        const sumN = Math.max(0, Math.floor((avail - blockOf(p, 0)) / p.sumLh));
        if (sumN >= Math.min(3, sumLines.length)) cut = { ...p, sumN: Math.min(sumN, 9) };
      }
    }
  }
  pick ||= cut;
  if (!pick) { const size = Math.round(60 * u); const sumSize = Math.round(40 * u); pick = { size, lh: Math.round(size * 0.98), lines: fitLines(ctx, d.title.toUpperCase(), colW, [size], 5, TITLE, 800).lines, sumSize, sumLh: Math.round(sumSize * 1.36), sumLines: [], sumN: 0 }; }
  const sum = pick.sumLines.slice(0, pick.sumN);
  if (sum.length && sum.length < pick.sumLines.length) sum[sum.length - 1] = `${sum[sum.length - 1].replace(/\s+\S*$/, '')}…`;
  const blockH = blockOf(pick, sum.length);
  // Place restante : la moitié au visuel (photos plus grandes), le reste réparti autour du texte
  const spare = Math.max(0, avail - blockH);
  const visH = vis ? Math.min(minVis + spare * 0.5, vis === 'row' ? 380 * u : (bottom - top) * 0.45) : 0;
  const y0 = top + visH + gap + Math.max(0, bottom - top - visH - gap - blockH) / 2;
  const L = { pad, colW, top, bottom, vis, visH, withPhoto, custom, sumSize: pick.sumSize, sumLh: pick.sumLh, sum, size: pick.size, lh: pick.lh, lines: pick.lines, y0 };
  layouts.get(d).set(key, L);
  return L;
}

function mainScene(ctx, W, H, d, o, u, s, dur) {
  background(ctx, W, H, d.color);
  const L = mainLayout(ctx, W, H, d, o, u);
  const x = L.pad;
  const zoom = 1 + 0.05 * clamp01(s / dur);   // lent zoom avant sur le visuel
  const kv = out3(s / 0.6);
  ctx.save();
  ctx.globalAlpha = kv;
  const dy = (1 - kv) * 90 * u;
  if (L.vis === 'image') {
    const w = W - L.pad * 2; const h = L.visH;
    ctx.save();
    rr(ctx, x, L.top + dy, w, h, 24 * u); ctx.clip();
    coverPhoto(ctx, L.custom, x - w * (zoom - 1) / 2, L.top + dy - h * (zoom - 1) / 2, w * zoom, h * zoom, 0);
    ctx.restore();
    photoCredit(ctx, d.credit, x, L.top + dy, w, h, u);
  } else if (L.vis === 'photo') {
    const p = L.withPhoto[0];
    const w = W * 0.7 * zoom; const h = L.visH * zoom;
    const g = ctx.createRadialGradient(W / 2, L.top + L.visH * 0.6, 0, W / 2, L.top + L.visH * 0.6, W * 0.45);
    g.addColorStop(0, alpha(p.color, 0.4)); g.addColorStop(1, alpha(p.color, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    photo(ctx, o.photos[p.num], (W - w) / 2, L.top + L.visH - h + dy, w, h, p.color, 0.3);
  } else if (L.vis === 'row') {
    const n = Math.min(d.drivers.length, 3);
    const r = Math.round(Math.min(L.visH / 2 - 10 * u, (W - L.pad * 2 - (n - 1) * 50 * u) / (n * 2)));
    d.drivers.slice(0, 3).forEach((p, i) => {
      const k = out3((s - i * 0.15) / 0.5);
      const cx = W / 2 + (i - (n - 1) / 2) * (r * 2 + 50 * u);
      ctx.save(); ctx.globalAlpha = k;
      driverPhoto(ctx, o.photos?.[p.num], cx, L.top + r + 10 * u + (1 - k) * 80 * u, r * (0.85 + 0.15 * k), p.color, p.tla);
      ctx.restore();
    });
  }
  ctx.restore();
  let y = L.y0;
  // Type de nouvelle : glisse depuis la gauche
  const kc = out3((s - 0.3) / 0.4);
  if (kc > 0) { ctx.save(); ctx.globalAlpha = kc; chip(ctx, d.badge, x - (1 - kc) * 200 * u, y, u, 44); ctx.restore(); }
  y += 110 * u;
  // Titre : lignes dévoilées une à une de gauche à droite
  L.lines.forEach((l, i) => {
    const k = out3((s - 0.55 - i * 0.16) / 0.45);
    if (k <= 0) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 10, y + i * L.lh - L.lh * 0.1, (L.colW + 20) * k, L.lh * 1.1); ctx.clip();
    txt(ctx, l, x + (1 - k) * -60 * u, y + L.size * 0.82 + i * L.lh, { size: L.size, weight: 800, family: TITLE });
    ctx.restore();
  });
  y += L.lines.length * L.lh + 38 * u;
  const tEnd = 0.55 + L.lines.length * 0.16 + 0.3;
  ctx.fillStyle = d.color ? vivid(d.color) : C.red;
  ctx.fillRect(x, y - 10 * u, 140 * u * out3((s - tEnd) / 0.4), 8 * u);
  y += 42 * u;
  L.sum.forEach((l, i) => {
    const k = out3((s - tEnd - 0.2 - i * 0.12) / 0.5);
    if (k <= 0) return;
    ctx.save(); ctx.globalAlpha = k;
    txt(ctx, l, x, y + L.sumSize * 0.8 + i * L.sumLh + (1 - k) * 24 * u, { size: L.sumSize, weight: 400, color: C.text });
    ctx.restore();
  });
}

// Un point clé par écran : carte qui entre par la droite et sort par la gauche, gros numéro
function pointScene(ctx, W, H, d, o, u, i, n, s, dur) {
  background(ctx, W, H, d.color);
  const pad = 60 * u; const colW = W - pad * 2;
  const acc = d.color ? vivid(d.color) : C.red;
  txt(ctx, "L'ESSENTIEL", pad, 360 * u, { size: Math.round(84 * u), weight: 800, family: TITLE, spacing: 3 });
  const t = fitLines(ctx, d.title.toUpperCase(), colW, [Math.round(42 * u)], 2, TITLE, 700).lines;
  t.forEach((l, k) => txt(ctx, l, pad, 432 * u + k * 50 * u, { size: Math.round(42 * u), weight: 700, family: TITLE, color: C.muted, spacing: 1 }));
  // Avancement : un trait par point
  const sw = (colW - (n - 1) * 14 * u) / n;
  for (let k = 0; k < n; k++) {
    rr(ctx, pad + k * (sw + 14 * u), 550 * u, sw, 10 * u, 5 * u); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    const f = k < i ? 1 : k > i ? 0 : clamp01(s / dur);
    if (f > 0) { rr(ctx, pad + k * (sw + 14 * u), 550 * u, sw * f, 10 * u, 5 * u); ctx.fillStyle = acc; ctx.fill(); }
  }
  const kin = out3(s / 0.45);
  const kout = i < n - 1 ? clamp01((s - (dur - 0.35)) / 0.35) ** 2 : 0;
  const dx = (1 - kin) * W - kout * W;
  const top = 630 * u; const bottom = H - BOTTOM * u - 30 * u;
  // Texte du point au plus grand qui tient dans la carte
  const room = (sz) => Math.floor((bottom - top - 250 * u) / Math.round(sz * 1.32));
  const sizes = [96, 88, 80, 72, 64, 58, 52, 46, 40].map((v) => Math.round(v * u));
  const lines = fitLines(ctx, d.points[i], colW - 80 * u, sizes, 9, BODY, 600);
  for (const sz of sizes) {
    const l = fitLines(ctx, d.points[i], colW - 80 * u, [sz], 99, BODY, 600).lines;
    if (l.length <= Math.min(9, room(sz))) { Object.assign(lines, { size: sz, lines: l }); break; }
  }
  const lh = Math.round(lines.size * 1.32);
  const ch = Math.min(bottom - top, 250 * u + lines.lines.length * lh);
  const cy = top + (bottom - top - ch) / 2;
  ctx.save();
  ctx.translate(dx, 0);
  rr(ctx, pad, cy, colW, ch, 26 * u); ctx.fillStyle = C.panel; ctx.fill();
  ctx.fillStyle = acc; ctx.fillRect(pad, cy + 30 * u, 8 * u, ch - 60 * u);
  txt(ctx, String(i + 1).padStart(2, '0'), pad + 40 * u, cy + 170 * u, { size: Math.round(150 * u), weight: 800, family: TITLE, color: acc });
  txt(ctx, `/ ${String(n).padStart(2, '0')}`, pad + 40 * u + 180 * u, cy + 170 * u, { size: Math.round(50 * u), weight: 700, family: TITLE, color: C.muted });
  lines.lines.forEach((l, k) => {
    const kl = out3((s - 0.25 - k * 0.1) / 0.45);
    ctx.save(); ctx.globalAlpha = kl;
    txt(ctx, l, pad + 40 * u, cy + 250 * u + lines.size * 0.8 + k * lh + (1 - kl) * 20 * u, { size: lines.size, weight: 600, color: C.text });
    ctx.restore();
  });
  ctx.restore();
}

// Fin : appel à s'abonner, signature, source
function outro(ctx, W, H, d, o, u, s) {
  background(ctx, W, H, C.red);
  u *= 1.25;   // écran centré : tout un cran plus grand
  const cy = H * 0.36;
  const k1 = out3(s / 0.5);
  ctx.save(); ctx.globalAlpha = k1;
  txt(ctx, "TOUTE L'ACTU F1", W / 2, cy + (1 - k1) * 60 * u, { size: Math.round(110 * u), weight: 800, family: TITLE, align: 'center', max: W * 0.88, spacing: 2 });
  txt(ctx, 'EN DIRECT ET EN FRANÇAIS', W / 2, cy + 80 * u + (1 - k1) * 60 * u, { size: Math.round(44 * u), weight: 700, family: TITLE, color: C.muted, align: 'center', spacing: 4 });
  ctx.restore();
  const k2 = out3((s - 0.35) / 0.5);
  const sig = o.signature || '@BenjyPaddock';
  ctx.save(); ctx.globalAlpha = k2;
  txt(ctx, sig, W / 2, cy + 260 * u, { size: Math.round(72 * u), weight: 800, family: TITLE, color: '#fff', align: 'center', max: W * 0.86, spacing: 1 });
  ctx.restore();
  const k3 = out3((s - 0.7) / 0.45);
  if (k3 > 0) {
    const pulse = 1 + 0.04 * Math.sin(Math.max(0, s - 1.1) * Math.PI * 3);
    const bw = 560 * u; const bh = 120 * u;
    ctx.save();
    ctx.globalAlpha = k3;
    ctx.translate(W / 2, cy + 420 * u); ctx.scale(pulse * (0.7 + 0.3 * k3), pulse * (0.7 + 0.3 * k3));
    rr(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2); ctx.fillStyle = C.red; ctx.fill();
    txt(ctx, 'ABONNEZ-VOUS', 0, 20 * u, { size: Math.round(56 * u), weight: 800, family: TITLE, color: '#fff', align: 'center', spacing: 3 });
    ctx.restore();
  }
  if (d.source) {
    ctx.save(); ctx.globalAlpha = k2;
    txt(ctx, `SOURCE : ${d.source.toUpperCase()}`, W / 2, cy + 600 * u, { size: Math.round(28 * u), weight: 700, family: TITLE, color: C.muted, align: 'center', spacing: 2, max: W * 0.86 });
    ctx.restore();
  }
}

export function newsFrame(ctx, W, H, d, o, t) {
  const tm = newsVideoTiming(d);
  const u = W / 1080;
  const n = tm.pts.length;
  const pd = { ...d, points: tm.pts };
  if (t < INTRO) intro(ctx, W, H, d, u, t);
  else if (t < tm.starts[1]) mainScene(ctx, W, H, d, o, u, t - INTRO, tm.main);
  else if (t < tm.starts.at(-1)) {
    const i = tm.starts.findLastIndex((st) => st <= t) - 1;
    pointScene(ctx, W, H, pd, o, u, i, n, t - tm.starts[i + 1], tm.starts[i + 2] - tm.starts[i + 1]);
  } else outro(ctx, W, H, d, o, u, t - tm.starts.at(-1));
  if (t >= INTRO && t < tm.starts.at(-1)) {
    header(ctx, W, d, o, u, t);
    if (d.source) txt(ctx, `SOURCE : ${d.source.toUpperCase()}`, W / 2, H - (BOTTOM - 80) * u, { size: Math.round(32 * u), weight: 700, family: TITLE, color: C.muted, align: 'center', spacing: 2, max: W - 120 * u });
  }
  // Passages : intro → info, info → points, points → fin (fondu par le noir)
  for (const b of [INTRO, tm.starts[1], tm.starts.at(-1)].filter((v, k, a) => a.indexOf(v) === k)) {
    const k = 1 - Math.abs(t - b) / (FADE / 2);
    if (k > 0) { ctx.fillStyle = `rgba(11,13,18,${k})`; ctx.fillRect(0, 0, W, H); }
  }
  breakingFrame(ctx, W, H, u, t < INTRO ? out3(t / 0.7) : 1);
}
