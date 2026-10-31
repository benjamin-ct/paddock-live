// Style « Télé premium » des visuels (choix du créateur dans le Studio) : fond fibre de carbone et bandes
// obliques à la couleur de l'écurie, bandeau d'en-tête en métal brossé, chiffres de position en or, argent
// et bronze en relief, titres chromés. Couverture, podium et classement dessinés à part ; les autres visuels
// reprennent le fond, l'en-tête, le pied et les pastilles (background, frame, footer et pill de social-draw.js).

import { C, rr, txt, alpha, vivid, photo, grain, topY, footY, pageDots, heroItems } from './social-draw.js';

export const TV_TITLE = '"Barlow Condensed", "Saira Condensed", sans-serif';
export const TV_LABEL = '"Chakra Petch", "Titillium Web", sans-serif';
const RED = '#e10600';
const METAL = {
  gold: [[0, '#fffbe8'], [0.12, '#ffe28a'], [0.28, '#e0a92e'], [0.4, '#a06a0c'], [0.47, '#fff0b0'], [0.55, '#e8b640'], [0.68, '#8a5a08'], [0.8, '#f5cf63'], [0.88, '#fff5cc'], [1, '#b07a12']],
  silver: [[0, '#ffffff'], [0.18, '#eef1f4'], [0.38, '#b4bac2'], [0.5, '#555c64'], [0.6, '#b8bec6'], [0.74, '#fbfcfd'], [0.88, '#9aa1a9'], [1, '#4f565e']],
  bronze: [[0, '#fff0e0'], [0.18, '#f6c08c'], [0.38, '#c4763a'], [0.5, '#63300c'], [0.6, '#c27a42'], [0.74, '#ffd9b3'], [0.88, '#a85d2a'], [1, '#5a2a0a']],
  chrome: [[0, '#ffffff'], [0.46, '#ffffff'], [0.52, '#c9ced5'], [0.7, '#eef1f4'], [1, '#a4abb4']],
};
const SHADE = { gold: ['#5a3a06', '#3a2603'], silver: ['#3a3f45', '#1f2226'], bronze: ['#4a2a14', '#2a160a'] };
export const MEDAL_KIND = ['gold', 'silver', 'bronze'];
// Dégradé métal vertical (coordonnées locales : 0 = haut de la lettre, h = ligne de base)
function metal(ctx, kind, y0, y1) {
  const g = ctx.createLinearGradient(0, y0, (y1 - y0) * 0.12, y1);
  METAL[kind].forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
const f = (size, w = 900) => `italic ${w} ${Math.round(size)}px ${TV_TITLE}`;
// Texte en italique gras (Barlow) ; fill : couleur ou dégradé métal ; max : largeur maximale
export function tt(ctx, text, x, y, size, { fill = '#fff', align = 'left', max = 0, w = 900, shadow = 0 } = {}) {
  let s = size;
  ctx.font = f(s, w);
  while (max && ctx.measureText(text).width > max && s > 10) { s -= 2; ctx.font = f(s, w); }
  ctx.save();
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.translate(x, y);
  ctx.fillStyle = METAL[fill] ? metal(ctx, fill, -s * 0.78, 0) : fill;
  if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = shadow; ctx.shadowOffsetY = shadow * 0.2; }
  ctx.fillText(text, 0, 0);
  ctx.restore();
  return s;
}
// Étiquette (Chakra Petch, capitales espacées)
function label(ctx, text, x, y, size, { color = '#fff', align = 'left', w = 700, spacing = 3, max = 0 } = {}) {
  return txt(ctx, text.toUpperCase(), x, y, { size: Math.round(size), weight: w, family: TV_LABEL, color, align, spacing, max });
}
// Chiffre de position en relief : couches sombres décalées, puis la face en métal
export function bigNum(ctx, n, x, y, size, kind, align = 'left') {
  const [d1, d2] = SHADE[kind] || SHADE.silver;
  ctx.save();
  ctx.font = f(size); ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  const k = size / 230;
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 30 * k; ctx.shadowOffsetX = 14 * k; ctx.shadowOffsetY = 18 * k;
  for (let i = 4; i >= 1; i--) { ctx.fillStyle = i > 2 ? d2 : d1; ctx.fillText(n, x + i * 3 * k, y + i * 3 * k); if (i === 4) { ctx.shadowColor = 'transparent'; } }
  ctx.translate(x, y);
  ctx.fillStyle = metal(ctx, kind, -size * 0.78, 0);
  ctx.fillText(n, 0, 0);
  ctx.restore();
}
// Parallélogramme (côtés penchés de `sk`)
export function slant(ctx, x, y, w, h, sk) {
  ctx.beginPath(); ctx.moveTo(x + sk, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - sk, y + h); ctx.lineTo(x, y + h); ctx.closePath();
}
// Métal brossé sombre (plaques, bandeau)
function brushed(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#34383f'); g.addColorStop(0.08, '#24272d'); g.addColorStop(1, '#14161a');
  return g;
}

// Couleur assombrie (k : part gardée)
function dark(hex, k) {
  const v = parseInt(String(hex).replace('#', ''), 16) || 0;
  return `rgb(${Math.round((v >> 16) * k)},${Math.round(((v >> 8) & 255) * k)},${Math.round((v & 255) * k)})`;
}
// Fines rayures obliques claires (cartes, grande bande)
function stripes(ctx, x, y, w, h, u, a = 0.08) {
  ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 3 * u;
  ctx.beginPath(); for (let i = -h; i < w + h; i += 18 * u) { ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h * 0.58, y); } ctx.stroke();
  ctx.restore();
}
// Couverture : grande bande pleine de la couleur montant vers la droite derrière le chiffre et la photo (y0 : bord
// haut à gauche, e : épaisseur, en fraction de la hauteur), liseré clair, tout le bas sombre sous la bande (nom, panneau)
function slab(ctx, W, H, color, y0, e) {
  const u = Math.min(W, H) / 1080;
  const y1 = y0 - 0.6 * W / H;
  const c = vivid(color);
  const poly = (a, b, c2, d2) => { ctx.beginPath(); ctx.moveTo(0, H * a); ctx.lineTo(W, H * b); ctx.lineTo(W, H * c2); ctx.lineTo(0, H * d2); ctx.closePath(); };
  const thin = ctx.createLinearGradient(0, 0, W, 0); thin.addColorStop(0, alpha(c, 0)); thin.addColorStop(1, alpha(c, 0.9));
  poly(y0 - 0.08, y1 - 0.08, y1 - 0.054, y0 - 0.054); ctx.fillStyle = thin; ctx.fill();
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, dark(color, 0.72)); g.addColorStop(0.45, c); g.addColorStop(0.7, alpha(c, 0.85)); g.addColorStop(1, c);
  poly(y0, y1, y1 + e, y0 + e); ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip(); stripes(ctx, 0, 0, W, H, u, 0.07);
  const hi = ctx.createLinearGradient(0, H * y1, 0, H * (y0 + e)); hi.addColorStop(0, 'rgba(255,255,255,0.12)'); hi.addColorStop(1, 'rgba(0,0,0,0.18)'); ctx.fillStyle = hi; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,243,224,0.75)'; poly(y0, y1, y1 + 0.012, y0 + 0.012); ctx.fill();
  const b0 = y0 + e + 0.02; const b1 = y1 + e + 0.02;
  poly(b0, b1, 1.01, 1.01); ctx.fillStyle = 'rgba(8,9,11,0.86)'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; poly(b0 - 0.003, b1 - 0.003, b1, b0); ctx.fill();
}

// Fibre de carbone : motif tissé tiré une fois
let weave = null;
function carbon(ctx, W, H) {
  if (weave === null) {
    weave = false;
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(16, 16) : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: 16, height: 16 }) : null;
    if (c) {
      const x = c.getContext('2d');
      x.fillStyle = '#0c0d10'; x.fillRect(0, 0, 16, 16);
      const cell = (cx, cy, vert) => {
        const g = vert ? x.createLinearGradient(cx, cy, cx, cy + 8) : x.createLinearGradient(cx, cy, cx + 8, cy);
        g.addColorStop(0, '#1b1e23'); g.addColorStop(0.5, '#121418'); g.addColorStop(1, '#0a0b0d');
        x.fillStyle = g; x.fillRect(cx, cy, 8, 8);
      };
      cell(0, 0, false); cell(8, 8, false); cell(8, 0, true); cell(0, 8, true);
      weave = c;
    }
  }
  ctx.fillStyle = '#0b0c0f'; ctx.fillRect(0, 0, W, H);
  const pat = weave && ctx.createPattern?.(weave, 'repeat');
  if (pat) { ctx.save(); ctx.fillStyle = pat; ctx.globalAlpha = 0.9; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}

// Fond : carbone, larges bandes obliques de la couleur, vignettage et grain
export function tvBackground(ctx, W, H, accent) {
  carbon(ctx, W, H);
  const col = /^#?[0-9a-f]{6}$/i.test(accent || '') ? accent : RED;
  // Halos de la couleur (en haut à droite, en bas à gauche)
  const glow = (x, y, r, a) => { const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, alpha(vivid(col), a)); rg.addColorStop(1, alpha(vivid(col), 0)); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); };
  glow(W * 0.72, H * 0.36, Math.max(W, H) * 0.62, 0.4);
  glow(W * 0.08, H * 1.02, Math.max(W, H) * 0.55, 0.22);
  const band = (x0, x1, a, w) => {
    const g = ctx.createLinearGradient(0, H, W, 0);
    g.addColorStop(0, alpha(vivid(col), a * 0.25)); g.addColorStop(0.4, alpha(vivid(col), a)); g.addColorStop(0.8, alpha(vivid(col), a * 0.9)); g.addColorStop(1, alpha(vivid(col), a * 0.4));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(W * x0, H); ctx.lineTo(W * (x0 + w), H); ctx.lineTo(W * (x1 + w), 0); ctx.lineTo(W * x1, 0); ctx.closePath(); ctx.fill();
  };
  band(0.05, 1.05, 0.62, 0.2);
  band(0.32, 1.32, 0.3, 0.06);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = Math.max(1, W / 900);
  ctx.beginPath(); ctx.moveTo(W * 0.02, H); ctx.lineTo(W * 1.02, 0); ctx.stroke();
  ctx.restore();
  const v = ctx.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.3, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H);
}

// Pastille « RÉSULTAT OFFICIEL » (ou provisoire) ; align right : x = bord droit
function officialTag(ctx, d, x, y, u, align = 'left') {
  const text = d.final === false ? 'RÉSULTATS PROVISOIRES' : 'RÉSULTAT OFFICIEL';
  ctx.font = `700 ${Math.round(20 * u)}px ${TV_LABEL}`;
  const w = ctx.measureText(text).width + text.length * 4 * u + 56 * u;
  const x0 = align === 'right' ? x - w : x;
  slant(ctx, x0, y, w, 40 * u, 10 * u); ctx.fillStyle = d.final === false ? 'rgba(242,201,76,0.16)' : 'rgba(0,0,0,0.55)'; ctx.fill();
  ctx.beginPath(); ctx.arc(x0 + 26 * u, y + 20 * u, 6 * u, 0, Math.PI * 2); ctx.fillStyle = d.final === false ? C.gold : RED; ctx.fill();
  label(ctx, text, x0 + 40 * u, y + 27 * u, 20 * u, { color: d.final === false ? C.gold : '#fff', spacing: 4 });
}
const subline = (d) => [d.label, d.date, d.kind === 'race' && d.laps ? `${d.laps} tours` : d.circuit].filter(Boolean).join('  •  ');

// Pied : signature à gauche (trait rouge), progression du carrousel au milieu
export function tvFooter(ctx, W, H, o, right = '', dots = true) {
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const fy = footY(W, H);
  ctx.fillStyle = RED; slant(ctx, pad, fy - 24 * u, 14 * u, 28 * u, 6 * u); ctx.fill();
  label(ctx, o.signature || '@BenjyPaddock', pad + 26 * u, fy, 24 * u, { w: 600, spacing: 1.5, color: 'rgba(255,255,255,0.85)' });
  if (dots) pageDots(ctx, W / 2, fy - 10 * u, u);
  if (right) label(ctx, right, W - pad, fy, 22 * u, { align: 'right', spacing: 4, color: 'rgba(255,255,255,0.85)' });
  return fy;
}

// En-tête : bandeau métal (drapeau, Grand Prix), bande rouge (séance, date, tours), pastille officielle,
// titre chromé du visuel ; renvoie la zone libre comme frame()
export function tvFrame(ctx, W, H, d, o, title) {
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const top = topY(W, H);
  const bw = W * 0.84;
  slant(ctx, -20 * u, top, bw, 84 * u, 22 * u); ctx.fillStyle = brushed(ctx, 0, top, bw, 84 * u); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(0, top, bw - 22 * u, 2 * u);
  ctx.fillStyle = RED; ctx.fillRect(0, top, 12 * u, 84 * u);
  let x = pad;
  if (o.flag) {
    const fh = Math.round(40 * u); const fw = Math.round(fh * o.flag.width / o.flag.height);
    ctx.drawImage(o.flag, x, top + 22 * u, fw, fh);
    x += fw + 20 * u;
  }
  tt(ctx, String(d.gp || '').toUpperCase(), x, top + 60 * u, 50 * u, { max: bw - x - 60 * u });
  const sw = Math.min(W * 0.66, bw - 60 * u);
  slant(ctx, -20 * u, top + 84 * u, sw, 42 * u, 12 * u); ctx.fillStyle = RED; ctx.fill();
  label(ctx, subline(d), pad, top + 113 * u, 22 * u, { spacing: 3, max: sw - pad - 30 * u });
  // Pastille officielle avec le titre (sans titre, le visuel du vainqueur : sa photo occupe ce coin)
  if (title) officialTag(ctx, d, W - pad, top + 146 * u, u, 'right');
  let y = top + 150 * u;
  if (title) { tt(ctx, title.toUpperCase(), pad, top + 270 * u, 104 * u, { fill: 'chrome', max: W * 0.62, shadow: 18 * u }); y = top + 300 * u; }
  const fy = tvFooter(ctx, W, H, o);
  return { pad, top: y, bottom: fy - Math.round(56 * u) };
}

// ---------- Couverture d'un post de séance ----------
export function tvCover(ctx, W, H, d, o, fmt) {
  const u = Math.min(W, H) / 1080;
  const tall = H / W > 1.5;
  const win = d.rows[0];
  tvBackground(ctx, W, H, win.color);
  slab(ctx, W, H, win.color, tall ? 0.36 : 0.38, tall ? 0.15 : 0.18);
  const pad = Math.round(W * 0.055);
  const top = topY(W, H);
  const pic = o.photos?.[win.num];
  // Portrait en grand à droite, bas fondu
  if (pic) { const S = Math.min(W * 0.98, H * (tall ? 0.62 : 0.8)); photo(ctx, pic, W - S + 60 * u, tall ? H * 0.14 : H * 0.05, S, S, win.color, 0.42); }
  officialTag(ctx, d, pad, top, u);
  let x = pad;
  const ly = top + 86 * u;
  if (o.flag) { const fh = Math.round(30 * u); const fw = Math.round(fh * o.flag.width / o.flag.height); ctx.drawImage(o.flag, x, ly - 24 * u, fw, fh); x += fw + 16 * u; }
  label(ctx, [d.label, d.circuit].filter(Boolean).join(' · '), x, ly, 22 * u, { spacing: 4, color: 'rgba(255,255,255,0.85)' });
  const gp = String(d.gp || '').toUpperCase().replace(/^(GRAND PRIX)\s+/, '$1\n').split('\n');
  gp.forEach((l, i) => tt(ctx, l, pad, ly + (78 + i * 64) * u, 70 * u, { max: W * 0.55, shadow: 16 * u }));
  // Grand 1 doré et étiquette du résultat
  const ny = tall ? H * 0.58 : H * 0.585;
  bigNum(ctx, '1', pad - 10 * u, ny, (tall ? 520 : 470) * u, 'gold');
  const tag = d.kind === 'race' && d.final ? 'VAINQUEUR' : d.kind === 'quali' ? 'POLE POSITION' : 'EN TÊTE';
  const tw = (tag.length * 15 + 80) * u;
  slant(ctx, pad, ny + 10 * u, tw, 46 * u, 12 * u); ctx.fillStyle = metal(ctx, 'gold', ny + 10 * u, ny + 56 * u); ctx.fill();
  label(ctx, tag, pad + 34 * u, ny + 42 * u, 22 * u, { color: '#1a1206', spacing: 5 });
  // Prénom (couleur de l'écurie), nom chromé
  const nb = tall ? H * 0.74 : H * 0.83;
  tt(ctx, (win.first || '').toUpperCase(), pad, nb - 170 * u, 56 * u, { fill: vivid(win.color), max: W * 0.6 });
  tt(ctx, win.last.toUpperCase(), pad - 6 * u, nb, 190 * u, { fill: 'chrome', max: W - pad * 2, shadow: 26 * u });
  // Panneau verre : date, distance ou séance, écurie
  const py = nb + 30 * u; const ph = 96 * u; const pw = W - pad * 2;
  if (py + ph < footY(W, H) - 40 * u) {
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; slant(ctx, pad, py, pw, ph, 14 * u); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(pad + 14 * u, py, pw - 14 * u, 1.5 * u);
    // Chiffres du premier (temps, écart, tours ; en course avance, départ, tours), complétés par l'écurie
    const cells = [...heroItems(d), ['Écurie', win.team || '']].slice(0, 3);
    cells.forEach(([k, v], i) => {
      const cx = pad + 30 * u + i * (pw / 3);
      if (i) { ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(cx - 24 * u, py + 18 * u, 1.5 * u, ph - 36 * u); }
      label(ctx, k, cx, py + 34 * u, 17 * u, { spacing: 3, color: 'rgba(255,255,255,0.6)' });
      const team = k === 'Écurie';
      if (team) { ctx.fillStyle = vivid(win.color); slant(ctx, cx, py + 52 * u, 10 * u, 30 * u, 5 * u); ctx.fill(); }
      tt(ctx, String(v).toUpperCase(), cx + (team ? 20 * u : 0), py + 80 * u, 40 * u, { max: pw / 3 - 50 * u, w: 800 });
    });
  }
  tvFooter(ctx, W, H, o, fmt === 'ig' ? 'FAITES DÉFILER »' : 'À SUIVRE »');
}

// ---------- Podium : trois cartes en escalier, photo, chiffre métal, plaque du nom ----------
export function tvPodium(ctx, W, H, d, o) {
  const u = Math.min(W, H) / 1080;
  const top3 = d.rows.slice(0, 3);
  tvBackground(ctx, W, H, top3[0].color);
  const fr = tvFrame(ctx, W, H, d, o, d.kind === 'race' ? 'Podium' : 'Top 3');
  const gap = 18 * u;
  const cw = [(W - fr.pad * 2 - gap * 2) * 0.32, (W - fr.pad * 2 - gap * 2) * 0.36, (W - fr.pad * 2 - gap * 2) * 0.32];
  const plateH = 170 * u;
  const base = fr.bottom;
  const avail = base - plateH - fr.top;
  const heights = [avail * 0.7, avail * 0.88, avail * 0.6];   // places 2, 1, 3
  const order = [1, 0, 2];
  let x = fr.pad;
  order.forEach((i, k) => {
    const p = top3[i];
    if (!p) { x += cw[k] + gap; return; }
    const w = cw[k]; const h = heights[k];
    const py = base - plateH; const y0 = py - h;
    // Carte couleur de l'écurie (fond de la photo)
    const g = ctx.createLinearGradient(x, y0, x + h * 0.18, py);
    g.addColorStop(0, vivid(p.color)); g.addColorStop(0.55, dark(p.color, 0.45)); g.addColorStop(1, '#0b0c0e');
    slant(ctx, x, y0, w, h, 16 * u); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip(); stripes(ctx, x, y0, w, h, u);
    const sh = ctx.createLinearGradient(x, y0, x + w, y0 + w * 0.5);
    sh.addColorStop(0, 'rgba(255,255,255,0.22)'); sh.addColorStop(0.3, 'rgba(255,255,255,0)'); ctx.fillStyle = sh; ctx.fillRect(x, y0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x, y0, w, 2 * u);
    ctx.restore();
    // Photo : dépasse un peu du haut de la carte, coupée au bas
    const img = o.photos?.[p.num];
    if (img) {
      const S = Math.min(w * (i === 0 ? 1.7 : 1.55) * (H / W > 1.5 ? 1.3 : 1), h * 1.15);
      ctx.save(); ctx.beginPath(); ctx.rect(x - 40 * u, y0 - S * 0.35, w + 80 * u, h + S * 0.35); ctx.clip();
      photo(ctx, img, x + (w - S) / 2, py - S, S, S, p.color, 0);
      ctx.restore();
    }
    // Plaque : prénom, nom, écurie, écart (ou vainqueur)
    slant(ctx, x, py, w, plateH, 16 * u); ctx.fillStyle = brushed(ctx, x, py, w, plateH); ctx.fill();
    ctx.fillStyle = vivid(p.color); ctx.fillRect(x + 16 * u, py, w - 16 * u, 4 * u);
    label(ctx, p.first || '', x + 26 * u, py + 40 * u, 19 * u, { spacing: 4, color: 'rgba(255,255,255,0.7)', max: w - 40 * u });
    tt(ctx, p.last.toUpperCase(), x + 24 * u, py + 98 * u, 58 * u, { fill: 'chrome', max: w - 44 * u });
    ctx.fillStyle = vivid(p.color); slant(ctx, x + 24 * u, py + 118 * u, 8 * u, 30 * u, 4 * u); ctx.fill();
    label(ctx, p.team || '', x + 40 * u, py + 142 * u, 19 * u, { spacing: 1.5, max: w * 0.5 });
    const gapText = i === 0 ? (d.kind === 'race' ? 'VAINQUEUR' : p.gap || '') : p.gap || '';
    if (gapText) {
      ctx.font = f(30 * u, 800);
      const gw = ctx.measureText(gapText).width + 34 * u;
      const gx = x + w - gw - 20 * u;
      slant(ctx, gx, py + 116 * u, gw, 38 * u, 8 * u);
      ctx.fillStyle = i === 0 && d.kind === 'race' ? metal(ctx, 'gold', py + 116 * u, py + 154 * u) : 'rgba(255,255,255,0.12)'; ctx.fill();
      tt(ctx, gapText, gx + gw / 2, py + 146 * u, 30 * u, { w: 800, align: 'center', fill: i === 0 && d.kind === 'race' ? '#1a1206' : '#fff' });
    }
    // Chiffre de la place, posé au-dessus de la plaque (jamais sur le texte)
    bigNum(ctx, String(i + 1), x + 6 * u, py - 8 * u, (i === 0 ? 250 : 210) * u, MEDAL_KIND[i]);
    x += w + gap;
  });
}

// ---------- Classement : podium en grandes lignes (visage, plaque métal), les autres en deux colonnes ----------
export function tvClassement(ctx, W, H, d, o) {
  const u = Math.min(W, H) / 1080;
  const rows = d.rows.slice(0, 22);
  tvBackground(ctx, W, H, rows[0]?.color);
  const fr = tvFrame(ctx, W, H, d, o, d.kind === 'quali' ? 'Grille' : 'Classement');
  const fullW = W - fr.pad * 2;
  const rest = rows.slice(3);
  const per = Math.ceil(rest.length / 2);
  const total = fr.bottom - fr.top;
  // Hauteurs : grandes lignes ≈ 1,45 fois les petites
  const small = Math.min(H > 1600 ? 78 : 62, total / (3 * 1.45 + per + 0.6)) ;
  const big = small * 1.45;
  const gapRow = small * 0.12;
  let y = fr.top;
  rows.slice(0, 3).forEach((r, i) => {
    const h = big - gapRow;
    const g = ctx.createLinearGradient(fr.pad, 0, fr.pad + fullW, 0);
    g.addColorStop(0, alpha(vivid(r.color), 0.85)); g.addColorStop(0.4, alpha(vivid(r.color), 0.3)); g.addColorStop(0.72, 'rgba(30,33,38,0.92)'); g.addColorStop(1, 'rgba(20,22,26,0.92)');
    slant(ctx, fr.pad, y, fullW, h, 14 * u); ctx.fillStyle = g; ctx.fill();
    // Plaque métal de la place
    const pw = h * 1.05;
    slant(ctx, fr.pad, y, pw, h, 14 * u); ctx.fillStyle = metal(ctx, MEDAL_KIND[i], y, y + h); ctx.fill();
    tt(ctx, String(r.pos), fr.pad + pw / 2, y + h * 0.8, h * 0.8, { align: 'center', fill: '#14110a' });
    let tx = fr.pad + pw + 14 * u;
    const img = o.photos?.[r.num];
    if (img) {
      ctx.save(); slant(ctx, tx, y, h * 1.1, h, 14 * u); ctx.clip();
      ctx.fillStyle = alpha(r.color, 0.5); ctx.fillRect(tx, y, h * 1.1, h);
      const S = h * 1.5; ctx.drawImage(img, tx + (h * 1.1 - S) / 2, y - S * 0.08, S, S);
      ctx.restore();
      tx += h * 1.1 + 16 * u;
    }
    ctx.fillStyle = vivid(r.color); slant(ctx, tx, y + h * 0.2, 8 * u, h * 0.6, 4 * u); ctx.fill();
    label(ctx, r.first || '', tx + 24 * u, y + h * 0.36, h * 0.2, { spacing: 3, color: 'rgba(255,255,255,0.65)' });
    tt(ctx, r.last.toUpperCase(), tx + 22 * u, y + h * 0.82, h * 0.5, { max: fullW * 0.36 });
    const right = fr.pad + fullW - 24 * u;
    const gapText = r.out ? 'ABANDON' : i === 0 ? (d.kind === 'race' ? 'VAINQUEUR' : r.gap) : r.gap;
    if (i === 0 && d.kind === 'race') {
      const gw = h * 1.7;
      slant(ctx, right - gw, y + h * 0.3, gw, h * 0.42, 8 * u); ctx.fillStyle = metal(ctx, 'gold', y + h * 0.3, y + h * 0.72); ctx.fill();
      label(ctx, 'VAINQUEUR', right - gw / 2, y + h * 0.59, h * 0.19, { align: 'center', color: '#1a1206', spacing: 3 });
    } else tt(ctx, gapText || '', right, y + h * 0.66, h * 0.4, { align: 'right', w: 800 });
    label(ctx, r.team || '', right - h * 2, y + h * 0.6, h * 0.2, { align: 'right', spacing: 1.5, color: 'rgba(255,255,255,0.75)', max: fullW * 0.2 });
    y += big;
  });
  y += small * 0.3;
  const colW = (fullW - 20 * u) / 2;
  rest.forEach((r, k) => {
    const c = Math.floor(k / per);
    const x = fr.pad + c * (colW + 20 * u);
    const ry = y + (k % per) * small;
    const h = small - gapRow;
    slant(ctx, x, ry, colW, h, 10 * u); ctx.fillStyle = r.out ? 'rgba(40,20,22,0.85)' : 'rgba(22,24,28,0.88)'; ctx.fill();
    const tint = ctx.createLinearGradient(x, 0, x + colW, 0);
    tint.addColorStop(0, alpha(vivid(r.color), 0.34)); tint.addColorStop(0.34, alpha(vivid(r.color), 0)); ctx.fillStyle = tint; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x + 10 * u, ry, colW - 10 * u, 1.2 * u);
    const fs = h * 0.62;
    tt(ctx, String(r.pos), x + h * 0.75, ry + h * 0.74, fs * 0.92, { align: 'center', fill: 'rgba(255,255,255,0.9)' });
    ctx.fillStyle = vivid(r.color); slant(ctx, x + h * 1.45, ry + h * 0.18, 7 * u, h * 0.64, 3.5 * u); ctx.fill();
    tt(ctx, r.tla, x + h * 1.45 + 18 * u, ry + h * 0.76, fs, { fill: r.out ? 'rgba(255,255,255,0.55)' : '#fff' });
    ctx.font = f(fs);
    const nameX = x + h * 1.45 + 26 * u + ctx.measureText(r.tla).width;
    label(ctx, r.team || '', nameX, ry + h * 0.66, h * 0.24, { spacing: 1.2, color: 'rgba(255,255,255,0.55)', max: colW * 0.3 });
    const rx = x + colW - 18 * u;
    if (r.out) {
      ctx.font = `700 ${Math.round(h * 0.26)}px ${TV_LABEL}`;
      const aw = ctx.measureText('ABANDON').width + 30 * u;
      slant(ctx, rx - aw, ry + h * 0.24, aw, h * 0.52, 6 * u); ctx.fillStyle = RED; ctx.fill();
      label(ctx, 'ABANDON', rx - aw / 2, ry + h * 0.6, h * 0.26, { align: 'center', spacing: 2 });
    } else tt(ctx, r.gap || '', rx, ry + h * 0.72, fs * 0.82, { align: 'right', w: 800 });
  });
  // Case libre en bas à droite : drapeau à damier de l'arrivée
  if (rest.length % 2 === 1 && d.kind === 'race' && d.final) {
    const x = fr.pad + colW + 20 * u; const ry = y + (per - 1) * small; const h = small - gapRow;
    slant(ctx, x, ry, colW, h, 10 * u); ctx.fillStyle = 'rgba(22,24,28,0.88)'; ctx.fill();
    const sq = h / 4;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#fff' : '#111'; ctx.fillRect(x + 18 * u + i * sq, ry + j * sq, sq, sq); }
    label(ctx, 'ARRIVÉE', x + 30 * u + 6 * sq, ry + h * 0.62, h * 0.26, { spacing: 3, color: 'rgba(255,255,255,0.75)' });
    if (d.laps) tt(ctx, `TOUR ${d.laps}/${d.laps}`, x + colW - 18 * u, ry + h * 0.74, h * 0.5, { align: 'right' });
  }
}
