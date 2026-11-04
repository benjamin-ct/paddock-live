// Style « Télémétrie » des visuels (choix du créateur dans le Studio, o.style = 'v3') : le design de l'appli depuis la
// v1.32 (public/css/design-v3.css, docs/design/refonte/DIRECTION.md). Fond graphite à plat, zones séparées par des
// filets d'un pixel, titres en Archivo étroit droit, petits titres et chiffres en JetBrains Mono, trait de la couleur
// de l'écurie à gauche des lignes ; le rouge marque une seule chose par visuel (le premier, la page en cours, la
// séance). Ni verre, ni lueur, ni damier. Fond, en-tête, pied, pastilles, cartes, couverture, podium et classement
// dessinés ici ; les autres visuels de social-draw.js les reprennent avec la palette C ci-dessous.

import { C, TITLE, BODY, MONO, rr, txt, vivid, topY, footY, page, trackMark, photo, fitLines, slideName, coverWord, coverTag } from './social-draw.js';

export const V3_TITLE = '"Archivo Cond", "Archivo", sans-serif';
export const V3_BODY = '"Archivo", sans-serif';
// Jetons du thème sombre de Télémétrie
export const T = {
  bg: '#0B0F15', panel: '#10151D', panel2: '#161D27', panel3: '#1B2430', line: '#222B37', line2: '#2E3946',
  text: '#F2F4F5', text2: '#B4BDC8', muted: '#8A95A3', accent: '#E10600', purple: '#B98CFF', green: '#3DDC84',
  red: '#FF5A5F', redText: '#FF6B61', sc: '#FFA62B', yellow: '#FFD43B',
};
// Palette C de social-draw.js le temps d'un dessin : l'or devient le jaune des données, les médailles l'ivoire
export const V3_C = { bg: T.bg, bg2: T.panel, panel: T.panel, line: T.line, text: T.text, muted: T.muted, red: T.accent, gold: T.yellow, silver: T.text2, bronze: T.text2, green: T.green };
export const V3_MEDAL = [T.text, T.text, T.text];
// Meilleur temps, record : violet des écrans de chronométrage
export const BEST = T.purple;

const RED = /^#?(e10600|ff1e0f)$/i;
const U = (W, H) => Math.min(W, H) / 1080;
// Petit titre en JetBrains Mono capitales, lettres espacées ; spacing 0 : chiffres (temps, écarts), casse gardée
export function mono(ctx, text, x, y, size, { color = T.muted, align = 'left', weight = 600, max = 0, spacing = 0.12 } = {}) {
  return txt(ctx, spacing ? String(text).toUpperCase() : String(text), x, y, { size: Math.round(size), weight, family: MONO, color, align, max, spacing: size * spacing });
}
// Petit titre espacé des visuels communs (txt) : en Mono, un peu plus petit (plus large), rouge en teinte texte
export const v3Kicker = (size, weight, color) => ({ family: MONO, size: Math.round(size * 0.8), spacing: size * 0.08, weight: Math.min(weight, 700), color: RED.test(color) ? T.redText : color });
// Filet d'un pixel (à l'échelle)
const rule = (ctx, x, y, w, u, color = T.line) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, Math.max(1, 1.5 * u)); };
// Drapeau : petit rectangle net, filet autour ; renvoie sa largeur
function flag(ctx, img, x, y, h, u) {
  const w = Math.round(h * img.width / img.height);
  ctx.save(); rr(ctx, x, y, w, h, 3 * u); ctx.clip(); ctx.drawImage(img, x, y, w, h); ctx.restore();
  rr(ctx, x, y, w, h, 3 * u); ctx.strokeStyle = T.line2; ctx.lineWidth = Math.max(1, 1.5 * u); ctx.stroke();
  return w;
}

// Fond : graphite à plat ; couleur d'écurie (ou du sujet) en trait sur le bord gauche
export function v3Background(ctx, W, H, accent) {
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  if (accent && !RED.test(accent)) { ctx.fillStyle = vivid(accent); ctx.fillRect(0, 0, Math.round(10 * U(W, H)), H); }
}

// Pastille : badge à angles vifs (rayon 4), Mono capitales ; dot : petit carré devant le texte. Renvoie sa largeur
export function v3Pill(ctx, label, x, y, h, { bg = C.red, color = '#fff', align = 'left', outline = false, dot = false } = {}) {
  const size = Math.round(h * 0.42);
  const sp = size * 0.08;
  ctx.font = `700 ${size}px ${MONO}`;
  const px = h * 0.36;
  const dw = dot ? h * 0.32 : 0;
  const w = ctx.measureText(label).width + sp * label.length + px * 2 + dw;
  const x0 = align === 'right' ? x - w : x;
  rr(ctx, x0, y, w, h, Math.min(h * 0.12, 6));
  if (outline) { ctx.strokeStyle = bg; ctx.lineWidth = 2; ctx.stroke(); } else { ctx.fillStyle = bg; ctx.fill(); }
  if (dot) { const q = h * 0.16; ctx.fillStyle = typeof dot === 'string' ? dot : outline ? bg : color; ctx.fillRect(x0 + px, y + (h - q) / 2, q, q); }
  txt(ctx, label, x0 + px + dw, y + h * 0.5 + size * 0.36, { size, weight: 700, family: MONO, color, spacing: sp });
  return w;
}

// Zone : à plat, filet d'un pixel, angles de 10 au plus ; tint : trait de la couleur à gauche (pas pour le rouge,
// réservé) ; strong : zone surélevée
export function v3Card(ctx, x, y, w, h, r, { tint = null, strong = false } = {}) {
  const rad = Math.min(r, 10);
  rr(ctx, x, y, w, h, rad); ctx.fillStyle = strong ? T.panel2 : T.panel; ctx.fill();
  if (tint && !RED.test(tint)) { ctx.save(); rr(ctx, x, y, w, h, rad); ctx.clip(); ctx.fillStyle = vivid(tint); ctx.fillRect(x, y, 6, h); ctx.restore(); }
  rr(ctx, x, y, w, h, rad); ctx.strokeStyle = T.line; ctx.lineWidth = 1.5; ctx.stroke();
}

// Pied : filet, signature, pages du carrousel en segments (la page en cours en rouge), texte à droite
export function v3Footer(ctx, W, H, o, right = '', dots = true) {
  const u = U(W, H);
  const pad = Math.round(W * 0.055);
  const fy = footY(W, H);
  rule(ctx, pad, fy - 40 * u, W - pad * 2, u);
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(30 * u), weight: 700, family: TITLE, color: T.text, spacing: 0.5 });
  if (dots && page && page.total > 1) {
    const sw = 30 * u; const cur = 54 * u; const gap = 6 * u; const sh = 5 * u;
    let x = W / 2 - ((page.total - 1) * (sw + gap) + cur) / 2;
    for (let i = 1; i <= page.total; i++) {
      const w = i === page.n ? cur : sw;
      ctx.fillStyle = i === page.n ? T.accent : T.line2; ctx.fillRect(x, fy - 12 * u, w, sh);
      x += w + gap;
    }
  }
  if (right) mono(ctx, right, W - pad, fy, 20 * u, { align: 'right', color: T.text2 });
  return fy;
}

// En-tête : drapeau et Grand Prix, séance · date · circuit en Mono, titre du visuel en grand, filet ; renvoie la zone
// libre comme frame()
export function v3Frame(ctx, W, H, d, o, title) {
  const u = U(W, H);
  const pad = Math.round(W * 0.055);
  const top = topY(W, H);
  let x = pad;
  const ky = top + 34 * u;
  if (o.flag) x += flag(ctx, o.flag, x, ky - 28 * u, 32 * u, u) + 16 * u;
  // Résultats provisoires : badge orange (voiture de sécurité : en attente) à droite
  let rw = 0;
  if (d.final === false) rw = v3Pill(ctx, 'PROVISOIRE', W - pad, ky - 31 * u, 38 * u, { bg: T.sc, outline: true, color: T.sc, align: 'right' }) + 20 * u;
  txt(ctx, String(d.gp || '').toUpperCase(), x, ky, { size: Math.round(40 * u), weight: 800, family: TITLE, max: W - pad - x - rw });
  mono(ctx, [d.label, d.date, d.circuit].filter(Boolean).join(' · '), pad, top + 78 * u, 21 * u, { max: W - pad * 2 });
  let y = top + 102 * u;
  if (title) { txt(ctx, title.toUpperCase(), pad - 2 * u, top + 172 * u, { size: Math.round(76 * u), weight: 800, family: TITLE, max: W - pad * 2 }); y = top + 196 * u; }
  rule(ctx, pad, y, W - pad * 2, u);
  const fy = v3Footer(ctx, W, H, o);
  return { pad, top: title ? y + 32 * u : top + Math.round(162 * u), bottom: fy - Math.round(78 * u) };
}

// ---------- Couverture : Grand Prix, séance, sommaire ; jamais de résultat (anti-spoiler) ----------
export function v3Cover(ctx, W, H, d, o, next, fmt) {
  const u = U(W, H);
  const pad = Math.round(W * 0.055);
  const top = topY(W, H);
  const colW = W - pad * 2;
  const tall = H / W > 1.5;
  v3Background(ctx, W, H, null);
  trackMark(ctx, W, H, o.shape);
  mono(ctx, `Formule 1 · Saison ${d.year || ''}`.trim(), pad, top + 30 * u, 22 * u, { color: T.text2 });
  if (d.round) mono(ctx, `Manche ${d.round}`, W - pad, top + 30 * u, 22 * u, { color: T.text2, align: 'right' });
  rule(ctx, pad, top + 54 * u, colW, u);
  let y = tall ? H * 0.2 : H * 0.15;
  if (o.flag) { flag(ctx, o.flag, pad, y, 58 * u, u); y += 58 * u + 34 * u; }
  const big = txt(ctx, coverWord(d), pad - 6 * u, y + 168 * u, { size: Math.round(206 * u), weight: 800, family: TITLE, max: colW + 6 * u });
  y += 168 * u + Math.max(40, big * 0.22);
  // Séance : la touche rouge du visuel
  v3Pill(ctx, coverTag(d), pad, y, 56 * u, { bg: T.accent, dot: '#fff' });
  y += 56 * u + 30 * u;
  const t = fitLines(ctx, String(d.gp || '').toUpperCase(), colW, [92, 84, 76].map((v) => Math.round(v * u)), 2, TITLE, 800);
  t.lines.forEach((l, i) => txt(ctx, l, pad - 3 * u, y + t.size * 0.78 + i * t.size * 0.96, { size: t.size, weight: 800, family: TITLE }));
  y += t.size * 0.78 + (t.lines.length - 1) * t.size * 0.96 + 46 * u;
  const info = [d.date, d.circuit, d.kind === 'race' && d.laps ? `${d.laps} tours` : ''].filter(Boolean).join(' · ');
  if (info) mono(ctx, info, pad, y, 24 * u, { color: T.text2, max: colW });
  // Sommaire des images suivantes (numéro = place dans le carrousel publié) : lignes séparées par des filets
  const items = next.map((s, i) => [String((o.slides ? o.slides.indexOf(s) : i + 1) + 1).padStart(2, '0'), slideName(s)]);
  const end = footY(W, H) - 84 * u;
  let sy = tall ? y + 110 * u : Math.max(y + 70 * u, end - items.length * 56 * u - 44 * u);
  const two = (end - sy - 44 * u) / Math.max(items.length, 1) < 44 * u;
  const per = two ? Math.ceil(items.length / 2) : items.length;
  const lh = Math.min(56 * u, (end - sy - 44 * u) / Math.max(per, 1));
  if (items.length) mono(ctx, 'Au programme', pad, sy, 20 * u);
  sy += 18 * u;
  items.forEach(([n, name], i) => {
    const cw = two ? colW / 2 - 12 * u : colW;
    const x = pad + (two && i >= per ? colW / 2 + 12 * u : 0);
    const ry = sy + (i % per) * lh;
    rule(ctx, x, ry, cw, u);
    mono(ctx, n, x, ry + lh * 0.68, 22 * u, { color: T.muted, spacing: 0 });
    txt(ctx, name.toUpperCase(), x + 58 * u, ry + lh * 0.7, { size: Math.round(Math.min(34 * u, lh * 0.62)), weight: 700, family: TITLE, color: T.text, max: cw - 66 * u });
  });
  v3Footer(ctx, W, H, o, fmt === 'ig' ? 'Faites défiler →' : 'À suivre →');
  if (d.final === false) mono(ctx, 'Résultats provisoires', W - pad, footY(W, H) - 62 * u, 20 * u, { color: T.sc, align: 'right' });
}

// ---------- Podium : trois marches à plat (2, 1, 3), trait de l'écurie en haut, place en grand ----------
export function v3Podium(ctx, W, H, d, o) {
  const u = U(W, H);
  const top3 = d.rows.slice(0, 3);
  v3Background(ctx, W, H, top3[0].color);
  const f = v3Frame(ctx, W, H, d, o, d.kind === 'race' ? 'Podium' : 'Top 3');
  const gap = 18 * u;
  const cw = (W - f.pad * 2 - gap * 2) / 3;
  const base = f.bottom;
  const pic = cw * (H > 1600 ? 1.1 : 0.92);   // place de la photo (ou du trigramme), au-dessus des marches
  const s1 = Math.min(base - f.top - pic, (H > 1600 ? 820 : 600) * u);
  const steps = [s1, s1 - 80 * u, s1 - 140 * u];
  [1, 0, 2].forEach((i, k) => {
    const p = top3[i];
    if (!p) return;
    const x = f.pad + k * (cw + gap);
    const h = steps[i];
    const y0 = base - h;
    rr(ctx, x, y0, cw, h, 8 * u); ctx.fillStyle = i === 0 ? T.panel2 : T.panel; ctx.fill();
    ctx.save(); rr(ctx, x, y0, cw, h, 8 * u); ctx.clip(); ctx.fillStyle = vivid(p.color); ctx.fillRect(x, y0, cw, 6 * u); ctx.restore();
    rr(ctx, x, y0, cw, h, 8 * u); ctx.strokeStyle = T.line; ctx.lineWidth = 1.5; ctx.stroke();
    // Photo debout sur la marche, sinon le trigramme
    const img = o.photos?.[p.num];
    if (img) photo(ctx, img, x - 10 * u, y0 - pic, cw + 20 * u, pic, p.color, 0);
    else txt(ctx, p.tla || '', x + cw / 2, y0 - 26 * u, { size: Math.round(cw * 0.42), weight: 800, family: TITLE, color: T.line2, align: 'center', max: cw });
    // Place : le premier en rouge
    txt(ctx, String(i + 1), x + 22 * u, y0 + (i === 0 ? 196 : 166) * u, { size: Math.round((i === 0 ? 220 : 180) * u), weight: 800, family: TITLE, color: i === 0 ? T.accent : T.text });
    const ix = x + 24 * u; const iw = cw - 44 * u;
    txt(ctx, p.first || '', ix, base - 176 * u, { size: Math.round(28 * u), weight: 500, family: BODY, color: T.text2, max: iw });
    txt(ctx, p.last.toUpperCase(), ix - 2 * u, base - 116 * u, { size: Math.round(58 * u), weight: 800, family: TITLE, max: iw });
    mono(ctx, p.team || '', ix, base - 76 * u, 18 * u, { max: iw, spacing: 0.06 });
    rule(ctx, ix, base - 60 * u, iw, u);
    const g = i === 0 ? (d.kind === 'race' ? 'Vainqueur' : p.gap || '') : p.gap || '';
    mono(ctx, g, ix, base - 22 * u, 26 * u, { color: i === 0 ? T.text : T.text2, spacing: i === 0 && d.kind === 'race' ? 0.12 : 0, max: iw });
  });
}

// ---------- Classement : tableau de l'appli (place, trait de l'écurie, trigramme, écart en Mono, filets) ----------
export function v3Classement(ctx, W, H, d, o) {
  const u = U(W, H);
  const rows = d.rows.slice(0, 22);
  v3Background(ctx, W, H, rows[0]?.color);
  const f = v3Frame(ctx, W, H, d, o, d.kind === 'quali' ? 'Grille' : 'Classement');
  // Deux colonnes sauf en story (assez haute pour une seule) : textes lisibles sur un téléphone
  const cols = H > 1600 || rows.length <= 12 ? 1 : 2;
  const gapC = 30 * u;
  const per = Math.ceil(rows.length / cols);
  const colW = (W - f.pad * 2 - (cols - 1) * gapC) / cols;
  const head = 34 * u;
  const rowH = Math.min((cols === 1 ? 84 : 92) * u, (f.bottom - f.top - head) / per);
  const fs = Math.round(Math.min(rowH * 0.5, (cols === 1 ? 42 : 36) * u));
  const names = colW > 620 * u;
  const race = d.kind === 'race';
  const laps = d.kind === 'practice' && rows.some((x) => x.laps);
  const posX = (x) => x + fs * 1.25;
  const tlaX = (x) => x + fs * 1.25 + 26 * u;
  const rightX = (x) => x + colW - 14 * u;
  const gapX = (x) => (race && rows.some((r) => r.points) ? rightX(x) - fs * 2.3 : laps ? rightX(x) - fs * 3.6 : rightX(x));
  for (let c = 0; c < cols; c++) {
    const x = f.pad + c * (colW + gapC);
    mono(ctx, 'Pos', posX(x), f.top + 16 * u, 17 * u, { align: 'right', spacing: 0.1 });
    mono(ctx, 'Pilote', tlaX(x), f.top + 16 * u, 17 * u, { spacing: 0.1 });
    mono(ctx, race ? 'Écart' : 'Temps', gapX(x), f.top + 16 * u, 17 * u, { align: 'right', spacing: 0.1 });
    if (race && rows.some((r) => r.points)) mono(ctx, 'Pts', rightX(x), f.top + 16 * u, 17 * u, { align: 'right', spacing: 0.1 });
    if (laps) mono(ctx, 'Tours', rightX(x), f.top + 16 * u, 17 * u, { align: 'right', spacing: 0.1 });
  }
  rows.forEach((r, i) => {
    const c = Math.floor(i / per);
    const x = f.pad + c * (colW + gapC);
    const y = f.top + head + (i % per) * rowH;
    const mid = y + rowH / 2 + fs * 0.36;
    if (i === 0) { rr(ctx, x, y + 2 * u, colW, rowH - 4 * u, 6 * u); ctx.fillStyle = T.panel2; ctx.fill(); }
    rule(ctx, x, y + rowH - 1.5 * u, colW, u);
    txt(ctx, String(r.pos), posX(x), mid, { size: fs, weight: 800, family: TITLE, color: i === 0 ? T.accent : r.out ? T.muted : T.text, align: 'right' });
    ctx.fillStyle = vivid(r.color); ctx.fillRect(posX(x) + 10 * u, y + rowH * 0.24, 5 * u, rowH * 0.52);
    txt(ctx, r.tla, tlaX(x), mid, { size: fs, weight: 800, family: TITLE, color: r.out ? T.muted : T.text });
    if (names) txt(ctx, r.last, tlaX(x) + fs * 2.4, mid, { size: Math.round(fs * 0.72), weight: 500, family: BODY, color: T.text2, max: colW * 0.3 });
    const ms = fs * 0.66;
    if (race && r.points) mono(ctx, `+${r.points}`, rightX(x), mid - fs * 0.04, ms, { align: 'right', color: T.green, spacing: 0 });
    if (laps) mono(ctx, r.laps ? String(r.laps) : '', rightX(x), mid - fs * 0.04, ms, { align: 'right', color: T.muted, spacing: 0 });
    const g = r.out ? 'Abandon' : r.gap || (i === 0 && race ? 'Vainqueur' : '');
    mono(ctx, g, gapX(x), mid - fs * 0.04, ms, { align: 'right', color: r.out ? T.red : i === 0 ? T.text : T.text2, spacing: r.out || !r.gap ? 0.1 : 0 });
    if (d.kind === 'quali' && r.knockedOut) mono(ctx, `${names ? 'Éliminé ' : ''}${d.sprint ? 'SQ' : 'Q'}${r.koPart}`, names ? x + colW * 0.6 : tlaX(x) + fs * 2.3, mid - fs * 0.04, ms * 0.8, { color: T.red, spacing: 0.08 });
  });
}

