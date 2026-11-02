// Visuel « Décision des commissaires » (mode créateur) : grand bandeau, bande de la sanction, pilotes concernés
// (portrait sur la couleur de leur écurie, côte à côte), motif et, quand les virages sont connus, le tracé du
// circuit en filigrane avec ces virages mis en évidence. Fond : celui des posts, ou votre photo (« Vos photos »).

import { C, BODY, TITLE, tv, rr, txt, alpha, vivid, background, kicker, footer, topY, footY, fitLines, photo } from './social-draw.js';
import { tt, slant } from './social-draw-tv.js';

// Couleur de la bande selon la sanction (texte foncé sur le jaune)
const BAND = { warning: ['#f5c518', '#0b0c0f'], reprimand: ['#f5c518', '#0b0c0f'], fine: ['#f5a524', '#0b0c0f'], nfa: ['#3a4150', '#fff'] };
const BAND_RED = ['#e10600', '#fff'];

// Votre photo en plein cadre, assombrie (texte lisible)
function photoBack(ctx, img, W, H) {
  const k = Math.max(W / img.width, H / img.height);
  ctx.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(6,7,11,0.62)'); g.addColorStop(0.45, 'rgba(6,7,11,0.78)'); g.addColorStop(1, 'rgba(6,7,11,0.94)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// Tracé du circuit dans la boîte (x, y, w, h), virages from → to en rouge, avec leur numéro ; renvoie le bas du tracé
function turnMap(ctx, shape, turns, x, y, w, h, u) {
  // Marge pour les numéros des virages, posés à l'extérieur du tracé
  const s = Math.min((w - 60 * u) / shape.w, (h - 40 * u) / shape.h);
  const ox = x + (w - shape.w * s) / 2; const oy = y + (h - shape.h * s) / 2;
  const at = ([px, py]) => [ox + px * s, oy + py * s];
  const path = (pts, close) => { ctx.beginPath(); pts.forEach((q, i) => { const [a, b] = at(q); if (i) ctx.lineTo(a, b); else ctx.moveTo(a, b); }); if (close) ctx.closePath(); };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  path(shape.pts, true);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 16 * u; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 3 * u; ctx.stroke();
  const n = shape.pts.length;
  const near = (c) => shape.pts.reduce((b, q, i) => { const dd = Math.hypot(q[0] - c.p[0], q[1] - c.p[1]); return dd < b.d ? { i, d: dd } : b; }, { i: 0, d: Infinity }).i;
  const a = shape.corners.find((c) => c.n === turns.from); const b = shape.corners.find((c) => c.n === turns.to);
  if (a && b) {
    // De l'entrée du premier virage à la sortie du dernier, dans le sens de la course
    const m = Math.round(n * (turns.from === turns.to ? 0.03 : 0.015));
    const i0 = near(a); const len = (near(b) - i0 + n) % n + 2 * m;
    const seg = Array.from({ length: len + 1 }, (_, k) => shape.pts[(i0 - m + k + n) % n]);
    path(seg, false);
    ctx.shadowColor = alpha(C.red, 0.9); ctx.shadowBlur = 22 * u;
    ctx.strokeStyle = C.red; ctx.lineWidth = 13 * u; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3 * u; ctx.stroke();
    // Numéros des virages, poussés vers l'extérieur du tracé
    const cx = ox + shape.w * s / 2; const cy = oy + shape.h * s / 2;
    // Premier et dernier virage d'abord, ceux du milieu s'il reste de la place (pastilles sans chevauchement)
    const r = 19 * u;
    const mid = Array.from({ length: Math.max(0, turns.to - turns.from - 1) }, (_, k) => turns.from + 1 + k);
    const placed = [];
    for (const t of [...new Set([turns.from, turns.to, ...mid])]) {
      const c = shape.corners.find((q) => q.n === t);
      if (!c) continue;
      const [px, py] = at(c.p);
      const dl = Math.hypot(px - cx, py - cy) || 1;
      const bx = px + (px - cx) / dl * 32 * u; const by = py + (py - cy) / dl * 32 * u;
      if (placed.some(([qx, qy]) => Math.hypot(qx - bx, qy - by) < r * 2.2)) continue;
      placed.push([bx, by]);
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      txt(ctx, String(t), bx, by + r * 0.42, { size: Math.round(r * 1.15), weight: 800, family: TITLE, color: C.bg, align: 'center' });
    }
  }
  ctx.restore();
  return oy + shape.h * s;
}

// Carte d'un pilote : portrait sur la couleur de l'écurie, plaque « #3 · MAX VERSTAPPEN » et écurie dessous ;
// photo : false = plaque seule (beaucoup de pilotes)
function driverCard(ctx, r, img, x, y, w, h, u, withPhoto = true) {
  const col = vivid(r.color);
  const ph = withPhoto ? Math.min(Math.round(h * 0.3), Math.round(118 * u)) : h;   // hauteur de la plaque
  const rad = 22 * u;
  ctx.save();
  if (tv) slant(ctx, x, y, w, h, 18 * u); else rr(ctx, x, y, w, h, rad);
  ctx.clip();
  if (withPhoto) {
    const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
    g.addColorStop(0, alpha(col, 1)); g.addColorStop(0.6, alpha(col, 0.72)); g.addColorStop(1, alpha(col, 0.42));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h - ph);
    // Fines rayures obliques et reflet en haut
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 3 * u;
    ctx.beginPath(); for (let i = -h; i < w + h; i += 22 * u) { ctx.moveTo(x + i, y + h - ph); ctx.lineTo(x + i + (h - ph) * 0.6, y); } ctx.stroke();
    const hi = ctx.createLinearGradient(0, y, 0, y + (h - ph)); hi.addColorStop(0, 'rgba(255,255,255,0.16)'); hi.addColorStop(0.5, 'rgba(255,255,255,0)'); hi.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = hi; ctx.fillRect(x, y, w, h - ph);
    const ih = h - ph - 10 * u;
    if (img) photo(ctx, img, x, y + h - ph - ih, w, ih, r.color, 0);
    else txt(ctx, r.tla, x + w / 2, y + (h - ph) * 0.62, { size: Math.round((h - ph) * 0.4), weight: 800, family: TITLE, align: 'center', italic: true, color: 'rgba(255,255,255,0.9)', max: w * 0.8 });
  }
  // Plaque : fond sombre, liseré de la couleur
  ctx.fillStyle = 'rgba(9,10,14,0.92)'; ctx.fillRect(x, y + h - ph, w, ph);
  ctx.fillStyle = col; ctx.fillRect(x, y + h - ph, w, 5 * u);
  ctx.restore();
  if (tv) slant(ctx, x, y, w, h, 18 * u); else rr(ctx, x, y, w, h, rad);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5 * u; ctx.stroke();
  // Nom : numéro à la couleur de l'écurie, puis prénom et nom en capitales ; écurie dessous
  const inner = w - 36 * u;
  const ns = Math.round(Math.min(46 * u, ph * 0.38));
  const name = `${r.first} ${r.last}`.trim().toUpperCase();
  const numTxt = `#${r.num}`;
  ctx.font = `800 ${ns}px ${TITLE}`;
  const full = `${numTxt} · ${name}`;
  const size = ctx.measureText(full).width > inner ? Math.max(18 * u, Math.floor(ns * inner / ctx.measureText(full).width)) : ns;
  ctx.font = `800 ${size}px ${TITLE}`;
  const nw = ctx.measureText(`${numTxt} · `).width;
  const total = ctx.measureText(full).width;
  const nx = x + (w - total) / 2;
  const base = y + h - ph + ph * 0.52;
  txt(ctx, `${numTxt} · `, nx, base, { size, weight: 800, family: TITLE, color: col });
  txt(ctx, name, nx + nw, base, { size, weight: 800, family: TITLE, color: '#fff' });
  if (r.team) txt(ctx, r.team.toUpperCase(), x + w / 2, base + ph * 0.3, { size: Math.round(Math.min(24 * u, ph * 0.2)), weight: 700, family: TITLE, color: C.muted, align: 'center', spacing: 1.5, max: inner });
}

export function decision(ctx, W, H, d, o) {
  const k = d.decision;
  const p = k.penalty;
  const [bandBg, bandFg] = BAND[p.kind] || BAND_RED;
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const top = topY(W, H);
  const fy = footY(W, H);
  const bottom = fy - Math.round(64 * u);
  const colW = W - pad * 2;
  const story = H > 1600;
  const img = d.image?.width ? d.image : null;
  if (img) photoBack(ctx, img, W, H); else background(ctx, W, H, bandBg);

  // En-tête : séance et Grand Prix
  kicker(ctx, pad, top, u, String(d.label || '').toUpperCase(), String(d.gp || '').toUpperCase());
  let y = top + 54 * u + (story ? 56 : 40) * u;

  // Grand bandeau
  const words = ['DÉCISION DES', 'COMMISSAIRES'];
  let ts = Math.round((story ? 156 : 138) * u);
  ctx.font = `800 ${ts}px ${TITLE}`;
  while (ctx.measureText(words[1]).width > colW * 0.98 && ts > 40) { ts -= 4; ctx.font = `800 ${ts}px ${TITLE}`; }
  words.forEach((l, i) => {
    const ly = y + ts * 0.82 + i * ts * 0.94;
    if (tv) tt(ctx, l, pad, ly, ts, { fill: 'chrome', shadow: 18 * u, max: colW });
    else txt(ctx, l, pad, ly, { size: ts, weight: 800, family: TITLE, italic: true, max: colW });
  });
  y += ts * 0.82 + ts * 0.94 + (story ? 54 : 38) * u;

  // Bande de la sanction : une ligne si elle tient en assez gros, sinon deux
  const bw = colW - 36 * u;
  let f = fitLines(ctx, p.band, bw, [92, 86, 80, 74, 68, 62].map((v) => Math.round(v * u)), 1, TITLE, 800);
  if (f.lines.length !== 1 || f.lines[0].endsWith('…')) f = fitLines(ctx, p.band, bw, [84, 76, 68, 60, 54, 48].map((v) => Math.round(v * u)), 2, TITLE, 800);
  const lh = f.size * 1.02;
  const bh = Math.round(f.lines.length * lh + f.size * 0.42);
  ctx.save();
  if (tv) slant(ctx, -30 * u, y, W - pad + 30 * u, bh, 26 * u); else rr(ctx, -30 * u, y, W - pad + 30 * u, bh, 14 * u);
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30 * u; ctx.shadowOffsetY = 8 * u;
  ctx.fillStyle = bandBg; ctx.fill();
  ctx.restore();
  f.lines.forEach((l, i) => txt(ctx, l, pad + 4 * u, y + f.size * 0.21 + f.size * 0.8 + i * lh, { size: f.size, weight: 800, family: TITLE, color: bandFg, italic: true, max: bw }));
  y += bh;
  // Sous la bande : course concernée, points sur la licence, amende de l'écurie
  const pts = (k.drivers || []).find((x) => x.points)?.points;
  const notes = [p.kind === 'grid' && p.next ? 'POUR LA PROCHAINE COURSE' : '', pts ? `+${pts} POINT${pts > 1 ? 'S' : ''} SUR LA LICENCE${d.rows.length > 1 ? ' (CHACUN)' : ''}` : '', p.fine && p.kind !== 'fine' ? `AMENDE DE ${String(p.fine).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €` : ''].filter(Boolean);
  if (notes.length) { txt(ctx, notes.join('  ·  '), pad, y + 46 * u, { size: Math.round(27 * u), weight: 700, family: TITLE, color: C.text, spacing: 2, max: colW }); y += 62 * u; }
  y += (story ? 48 : 34) * u;

  // Motif (et tracé du circuit à droite quand les virages sont connus) : réservé en bas
  const map = k.turns && o.shape?.corners?.length && o.shape.corners.some((c) => c.n === k.turns.from) ? o.shape : null;
  const mw = map ? Math.round(colW * 0.4) : 0;
  const tw = colW - (map ? mw + 28 * u : 0);
  const motif = String(k.motif || '').trim();
  // Motif : le plus gros des trois premiers corps qui donne le moins de lignes (pas de mot seul sur la dernière)
  const sizes = [(story ? 44 : 40), 38, 36, 34, 32, 30].map((v) => Math.round(v * u));
  const mt = motif ? sizes.slice(0, 3).map((sz) => fitLines(ctx, motif, tw, [sz, ...sizes.filter((v) => v < sz)], story ? 7 : 5, BODY, 600)).reduce((a, b) => (b.lines.length < a.lines.length ? b : a)) : { size: 0, lines: [] };
  const mlh = Math.round(mt.size * 1.28);
  const textH = motif ? 44 * u + mt.lines.length * mlh : 0;
  // Tracé : à peine plus haut que le motif (au moins 230 px), sans dépasser sa largeur
  const blockH = Math.max(textH, map ? Math.min(mw, (story ? 400 : 320) * u, Math.max(230 * u, textH + 60 * u)) : 0);
  const my = bottom - blockH;

  // Pilotes : la place qui reste
  const n = d.rows.length;
  const dh = Math.min(my - 34 * u - y, (story ? 640 : 470) * u);
  if (n && dh > 120 * u) {
    const gap = 26 * u;
    const withPhoto = n <= 3;
    const cols = withPhoto ? n : 2;
    const rowsN = Math.ceil(n / cols);
    const cw = n === 1 ? Math.min(colW, 600 * u) : (colW - gap * (cols - 1)) / cols;
    const ch = withPhoto ? dh : Math.min(110 * u, (dh - gap * (rowsN - 1)) / rowsN);
    const x0 = n === 1 ? (W - cw) / 2 : pad;
    const y0 = y + Math.max(0, (dh - (ch * rowsN + gap * (rowsN - 1))) / 2);
    d.rows.forEach((r, i) => driverCard(ctx, r, o.photos?.[r.num], x0 + (i % cols) * (cw + gap), y0 + Math.floor(i / cols) * (ch + gap), cw, ch, u, withPhoto));
  }

  if (motif) {
    const ty = my + (blockH - textH) / 2;
    txt(ctx, 'MOTIF', pad, ty + 24 * u, { size: Math.round(25 * u), weight: 800, family: TITLE, color: bandBg === BAND.nfa?.[0] ? C.muted : bandBg, spacing: 4 });
    mt.lines.forEach((l, i) => txt(ctx, l, pad, ty + 44 * u + mt.size * 0.9 + i * mlh, { size: mt.size, weight: 600, family: BODY, color: C.text }));
  }
  if (map) {
    const mh = blockH - 38 * u;
    const mb = turnMap(ctx, map, k.turns, W - pad - mw, my, mw, mh, u);
    const t = k.turns.from === k.turns.to ? `VIRAGE ${k.turns.from}` : `VIRAGES ${k.turns.from} À ${k.turns.to}`;
    txt(ctx, t, W - pad - mw / 2, Math.min(my + blockH - 4 * u, mb + 48 * u), { size: Math.round(24 * u), weight: 800, family: TITLE, color: C.muted, align: 'center', spacing: 3 });
  }

  footer(ctx, W, H, o);
  const src = k.docs?.length ? `${k.docs.length > 1 ? 'DOCUMENTS' : 'DOCUMENT'} FIA ${k.docs.join(' ET ')}` : 'DIRECTION DE COURSE';
  txt(ctx, src, W - pad, fy, { size: Math.round(Math.min(W, H) * 0.024), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2, max: W * 0.5 });
}
// Texte alternatif : sanction, pilotes (numéro, écurie), motif
export function decisionAlt(d) {
  const k = d.decision;
  const who = d.rows.map((r) => `${r.first} ${r.last} (n° ${r.num}${r.team ? `, ${r.team}` : ''})`);
  return `Décision des commissaires — ${[d.gp, d.label].filter(Boolean).join(' · ')} : ${k.penalty.short} pour ${new Intl.ListFormat('fr', { type: 'conjunction' }).format(who)}.${k.motif ? ` Motif : ${k.motif}` : ''}`.slice(0, 500);
}
