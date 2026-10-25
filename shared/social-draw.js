// Visuels des posts pour les réseaux sociaux (mode créateur), dessinés sur un canvas aux formats
// des réseaux : Instagram / Facebook (1080 × 1350), story (1080 × 1920), X / Threads / Bluesky
// (même format que le carrousel Instagram : le carrousel de X recadre les images plus larges que hautes).
// Les textes des visuels sont en français (contenu publié).

import { teammateDuels, FLASH_KINDS, GRID_SOURCE } from './social-more.js';
import { teamLogoPath } from './team-logos.js';
import { followReason, questionFor } from './social-follow.js';
import { horaires, infos, editions, topflop, notes, equipes, positions, recapCover, recapItem, raceweek, titre, titreComment, titleBlocks } from './social-draw-season.js';

export const FORMATS = {
  ig: { w: 1080, h: 1350, name: 'instagram' },
  story: { w: 1080, h: 1920, name: 'story' },
  x: { w: 1080, h: 1350, name: 'x' },
};

export const C = { bg: '#0b0d12', bg2: '#151a24', panel: 'rgba(255,255,255,0.045)', line: 'rgba(255,255,255,0.10)', text: '#f3f5f9', muted: '#9aa3b2', red: '#e10600', gold: '#e8c35a', silver: '#c7ccd6', bronze: '#d08a4f', green: '#3ddc84' };
export const TITLE = '"Saira Condensed", "Titillium Web", sans-serif';
export const BODY = '"Titillium Web", sans-serif';
export const MONO = '"JetBrains Mono", monospace';
export const MEDAL = [C.gold, C.silver, C.bronze];

// Diapositives selon la séance, après une couverture « Résultats » (anti-spoiler : le vainqueur
// n'est pas dévoilé dès la première image, ni dans l'aperçu du réseau). follow : dernière image
// « Abonnez-vous » sur les carrousels ; question : avant-dernière image avec la question du post,
// pour faire réagir en commentaire. Format X (X et Bluesky : 4 images au plus) : ces images de fin
// passent avant les dernières images du post.
export function slidesFor(d, { fmt = 'ig', follow = false, question = false } = {}) {
  const list = baseSlides(d, fmt);
  if (list.length < 2) return list;
  const end = [...(question ? ['question'] : []), ...(follow ? ['abonnement'] : [])];
  return [...(fmt === 'x' && end.length ? list.slice(0, 4 - end.length) : list), ...end];
}
function baseSlides(d, fmt) {
  if (d.news) return ['news', ...(d.gallery || []).map((_, i) => `photo-${i + 1}`), ...pointPages(d.points, fmt).map((_, i) => `essentiel-${i + 1}`)];
  if (d.post === 'prerace') return ['couverture', 'grille', ...(d.weather || d.tyres ? ['meteo'] : [])];
  if (d.post === 'champ') return ['couverture', 'champpilotes', 'champecuries'];
  if (d.post === 'flash') return ['flash'];
  if (d.post === 'weekend') return ['couverture', 'horaires', ...(d.tyres || d.forecast?.length ? ['infos'] : [])];
  if (d.post === 'raceweek') return ['raceweek', 'horaires', ...(d.tyres || d.forecast?.length ? ['infos'] : [])];
  if (d.post === 'records') return d.facts.length ? ['couverture', 'records', ...(d.editions.length >= 2 ? ['editions'] : [])] : [];
  if (d.post === 'ratings') return d.rows.length ? ['couverture', 'topflop', 'notes'] : [];
  if (d.post === 'teamduels') return d.rows.length ? ['couverture', ...Array.from({ length: Math.ceil(d.rows.length / 5) }, (_, i) => `equipes-${i + 1}`)] : [];
  if (d.post === 'racelaps') return d.total ? ['couverture', 'positions'] : [];
  if (d.post === 'title') return d.drivers.length || d.constructors.length ? ['couverture', ...(d.drivers.length ? ['titrepilotes'] : []), ...(d.constructors.length ? ['titreecuries'] : []), ...(titleBlocks(d).length ? ['titrecomment'] : [])] : [];
  if (d.post === 'recap') return d.items.length ? ['recapcover', ...d.items.map((_, i) => `recap-${i + 1}`)].slice(0, fmt === 'x' ? 4 : undefined) : [];
  if (!d.rows.length) return [];
  let list = ['meilleurtemps', 'podium', 'classement', ...(d.facts.length ? ['faits'] : [])];
  const duels = teammateDuels(d).length >= 3 ? ['duels'] : [];
  if (d.kind === 'race') list = ['vainqueur', 'podium', 'classement', ...duels, 'faits', ...(d.champ ? ['championnat'] : [])];
  else if (d.kind === 'quali') list = ['pole', 'podium', 'classement', ...duels, ...(d.facts.length ? ['faits'] : [])];
  return ['couverture', ...list];
}
// Images choisies par le créateur : toutes, sauf celles écartées (une au moins reste). Passées aux
// dessins (o.slides) : sommaire de la couverture, nombre et numéros des points, récap renumérotés.
export function chosenSlides(list, skip = []) {
  const s = new Set(skip);
  const out = list.filter((x) => !s.has(x));
  return out.length ? out : list.slice(0, 1);
}
// Données des textes sans ce que montraient les images écartées (skip : Set) : points clés, infos du
// récap, duels d'une page, faits marquants, pneus et météo
export function keptData(d, skip, fmt) {
  if (!skip.size) return d;
  if (d.news) return { ...d, points: pointPages(d.points, fmt).filter((_, i) => !skip.has(`essentiel-${i + 1}`)).flat() };
  if (d.post === 'recap') return { ...d, items: d.items.filter((_, i) => !skip.has(`recap-${i + 1}`)) };
  if (d.post === 'teamduels') return { ...d, rows: d.rows.filter((_, i) => !skip.has(`equipes-${Math.floor(i / 5) + 1}`)) };
  if (d.post === 'title') return { ...d, drivers: skip.has('titrepilotes') ? [] : d.drivers, constructors: skip.has('titreecuries') ? [] : d.constructors };
  if ((d.post === 'weekend' || d.post === 'raceweek') && skip.has('infos')) return { ...d, tyres: null, forecast: [] };
  if (d.post === 'prerace' && skip.has('meteo')) return { ...d, weather: null, tyres: null };
  if (!d.post && skip.has('faits')) return { ...d, facts: [] };
  return d;
}
// Pages de points (essentiel-N) gardées : leurs numéros, dans l'ordre
const keptPages = (o, prefix, all) => (o.slides ? o.slides.filter((s) => s.startsWith(`${prefix}-`)).map((s) => Number(s.slice(prefix.length + 1))) : all);

// Points clés d'une news répartis en images de taille égale (3 au plus par image, 5 en story)
export function pointPages(points, fmt = 'ig') {
  const list = (points || []).filter(Boolean);
  if (!list.length) return [];
  const per = fmt === 'story' ? 5 : 3;
  const n = Math.ceil(list.length / per);
  const pages = [];
  let i = 0;
  for (let k = 0; k < n; k++) { const take = Math.ceil((list.length - i) / (n - k)); pages.push(list.slice(i, i + take)); i += take; }
  return pages;
}
export const SLIDE_NAMES = { grille: 'Grille de départ', meteo: 'Météo et pneus', champpilotes: 'Championnat pilotes', champecuries: 'Championnat constructeurs', flash: 'Flash', duels: 'Duels entre coéquipiers', news: 'News', couverture: 'Couverture', vainqueur: 'Vainqueur', pole: 'Pole position', meilleurtemps: 'Meilleur temps', podium: 'Podium', classement: 'Classement', faits: 'Faits marquants', championnat: 'Championnat', abonnement: 'Abonnez-vous', question: 'Question', essentiel: "L'essentiel", photo: 'Photo', raceweek: 'Race Week', horaires: 'Horaires', infos: 'Pneus et météo', records: 'Records', editions: 'Éditions précédentes', topflop: 'Tops et flops', notes: 'Toutes les notes', equipes: 'Duels par écurie', positions: 'Positions tour par tour', recapcover: 'La semaine', recap: 'Info', titrepilotes: 'Titre pilotes', titreecuries: 'Titre constructeurs', titrecomment: 'Comment être sacré' };
export const slideName = (s) => SLIDE_NAMES[s] || SLIDE_NAMES[String(s).replace(/-\d+$/, '')] || s;
// Texte alternatif d'une image publiée (lecteurs d'écran) : ce qu'elle montre, avec le classement s'il y en a un
const RANKED = { vainqueur: 3, pole: 3, meilleurtemps: 3, podium: 3, classement: 10, grille: 10 };
export function slideAlt(d, slide) {
  const name = slideName(slide);
  if (d.news) return `${name} : ${d.title}${d.summary ? `. ${d.summary}` : ''}`.slice(0, 500);
  const what = [d.label, d.gp].filter(Boolean).join(' · ');
  const n = RANKED[slide] && d.rows?.[0]?.pos ? RANKED[slide] : 0;
  const top = n ? ` : ${d.rows.slice(0, n).map((r) => `${r.pos}. ${[r.first, r.last].filter(Boolean).join(' ')}${r.team ? ` (${r.team})` : ''}`).join(', ')}` : '';
  return `${name}${what ? ` — ${what}` : ''}${top}`.slice(0, 500);
}

// ---------- Outils de dessin ----------
export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}
export function fit(ctx, text, max, size, weight, family) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 2; } while (ctx.measureText(text).width > max && s > 10);
  return s + 2;
}
export function txt(ctx, text, x, y, { size = 32, weight = 400, family = BODY, color = C.text, align = 'left', max = 0, base = 'alphabetic', spacing = 0 } = {}) {
  const s = max ? fit(ctx, text, max, size, weight, family) : size;
  ctx.font = `${weight} ${s}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(text, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  return s;
}
export function wrap(ctx, text, x, y, maxW, lineH, maxLines, style) {
  ctx.font = `${style.weight || 400} ${style.size}px ${style.family || BODY}`;
  const words = String(text).split(/\s+/);
  let line = '';
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      if (n === maxLines - 1) { txt(ctx, `${line}…`, x, y + n * lineH, style); return n + 1; }
      txt(ctx, line, x, y + n * lineH, style);
      n++;
      line = words[i];
    } else line = test;
  }
  if (line) { txt(ctx, line, x, y + n * lineH, style); n++; }
  return n;
}
export const alpha = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(139,149,168,${a})`;
  const v = parseInt(m[1], 16);
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
};
// Couleur d'écurie trop sombre sur le fond : éclaircie
export function vivid(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#8b95a8';
  const v = parseInt(m[1], 16);
  let r = v >> 16; let g = (v >> 8) & 255; let b = v & 255;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (l < 70) { const k = 70 / Math.max(l, 1); r = Math.min(255, r * k + 40); g = Math.min(255, g * k + 40); b = Math.min(255, b * k + 40); }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export function background(ctx, W, H, accent) {
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, C.bg2);
  g.addColorStop(1, C.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (accent) {
    const rg = ctx.createRadialGradient(W * 0.85, H * 0.2, 0, W * 0.85, H * 0.2, Math.max(W, H) * 0.7);
    rg.addColorStop(0, alpha(accent, 0.28));
    rg.addColorStop(1, alpha(accent, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
  // Fines lignes obliques (effet vitesse)
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 2;
  for (let x = -H; x < W; x += 46) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H * 0.45, 0); ctx.stroke(); }
  ctx.restore();
}

// En-tête : drapeau, Grand Prix, séance et date ; pied : signature
export function frame(ctx, W, H, d, o, title) {
  const pad = Math.round(W * 0.055);
  const top = Math.round(Math.min(W, H) * 0.06);
  ctx.fillStyle = C.red;
  ctx.fillRect(pad, top, 10, Math.round(Math.min(W, H) * 0.085));
  let x = pad + 28;
  if (o.flag) {
    const fh = Math.round(Math.min(W, H) * 0.04);
    const fw = Math.round(fh * o.flag.width / o.flag.height);
    rr(ctx, x, top + 4, fw, fh, 5); ctx.save(); ctx.clip(); ctx.drawImage(o.flag, x, top + 4, fw, fh); ctx.restore();
    x += fw + 16;
  }
  const s1 = Math.round(Math.min(W, H) * 0.046);
  // Place prise à droite par le titre de l'image : le nom du Grand Prix s'arrête avant
  let tw = 0;
  if (title) { ctx.font = `700 ${Math.round(s1 * 0.6)}px ${TITLE}`; tw = ctx.measureText(title.toUpperCase()).width + title.length * 3 + 30; }
  txt(ctx, d.gp.toUpperCase(), x, top + s1 * 0.95, { size: s1, weight: 800, family: TITLE, max: W - x - pad - tw, spacing: 0.5 });
  const sub = [d.label, d.date, d.circuit].filter(Boolean).join('  ·  ').toUpperCase();
  txt(ctx, sub, pad + 28, top + s1 * 0.95 + Math.round(s1 * 0.85), { size: Math.round(s1 * 0.52), weight: 600, family: TITLE, color: C.muted, max: W - pad * 2 - 28, spacing: 1.5 });
  if (title) txt(ctx, title.toUpperCase(), W - pad, top + s1 * 0.95, { size: Math.round(s1 * 0.6), weight: 700, family: TITLE, color: C.red, align: 'right', spacing: 3 });
  // Pied
  const fy = H - Math.round(Math.min(W, H) * 0.045);
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, fy - Math.round(Math.min(W, H) * 0.04), W - pad * 2, 2);
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(Math.min(W, H) * 0.032), weight: 700, family: TITLE, color: C.text, spacing: 1 });
  if (!d.final) txt(ctx, 'RÉSULTATS PROVISOIRES', W - pad, fy, { size: Math.round(Math.min(W, H) * 0.025), weight: 700, family: TITLE, color: C.gold, align: 'right', spacing: 2 });
  return { pad, top: top + Math.round(Math.min(W, H) * 0.14), bottom: fy - Math.round(Math.min(W, H) * 0.06) };
}

// Photo détourée posée en bas de la zone ; fade : bas fondu dans le décor
export function photo(ctx, img, x, y, w, h, color, fade = 0) {
  if (!img) {
    rr(ctx, x, y, w, h, w * 0.06); ctx.fillStyle = alpha(color, 0.25); ctx.fill();
    return;
  }
  const k = Math.min(w / img.width, h / img.height);
  const dw = img.width * k; const dh = img.height * k;
  const dx = x + (w - dw) / 2; const dy = y + h - dh;
  if (!fade || typeof document === 'undefined') { ctx.drawImage(img, dx, dy, dw, dh); return; }
  const off = document.createElement('canvas');
  off.width = Math.ceil(dw); off.height = Math.ceil(dh);
  const o = off.getContext('2d');
  o.drawImage(img, 0, 0, dw, dh);
  o.globalCompositeOperation = 'destination-in';
  const g = o.createLinearGradient(0, dh * (1 - fade), 0, dh);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  o.fillStyle = g; o.fillRect(0, 0, dw, dh);
  ctx.drawImage(off, dx, dy);
}

// Cadre de la photo de couverture d'une actu (photo importée) : le même pour le visuel et pour le recadrage
export function newsPhotoBox(W, H) {
  const m = Math.min(W, H);
  const pad = Math.round(W * 0.055);
  const y = Math.round(m * 0.06) + 110 * m / 1080;
  const bottom = H - Math.round(m * 0.045) - Math.round(m * 0.07);
  return { x: pad, y, w: W - pad * 2, h: (bottom - y) * (H > 1600 ? 0.42 : 0.38) };
}

// Photo importée (post écrit à la main) : recadrée pour remplir la zone, coins arrondis, bas assombri
export function coverPhoto(ctx, img, x, y, w, h, r = 24) {
  const k = Math.max(w / img.width, h / img.height);
  const dw = img.width * k; const dh = img.height * k;
  ctx.save();
  rr(ctx, x, y, w, h, r); ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  const g = ctx.createLinearGradient(0, y + h * 0.55, 0, y + h);
  g.addColorStop(0, 'rgba(11,13,18,0)'); g.addColorStop(1, 'rgba(11,13,18,0.6)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// Crédit d'une photo libre de droits (auteur et licence), en bas à droite de la photo
export function photoCredit(ctx, credit, x, y, w, h, u) {
  if (!credit) return;
  txt(ctx, credit, x + w - 18 * u, y + h - 18 * u, { size: Math.round(20 * u), weight: 600, color: 'rgba(255,255,255,0.85)', align: 'right', max: w - 36 * u });
}

// Logo blanc d'une écurie (o.logos) calé sur la hauteur h, centré verticalement sur cy ; largeur au plus
// maxW. Renvoie la largeur dessinée (0 sans logo : à l'appelant de mettre une barre de couleur)
export function teamLogo(ctx, o, team, x, cy, h, align = 'left', maxW = h * 1.8) {
  const img = o.logos?.[teamLogoPath(team)];
  if (!img?.width) return 0;
  const k = Math.min(h / img.height, maxW / img.width);
  const w = img.width * k; const hh = img.height * k;
  ctx.drawImage(img, align === 'right' ? x - w : align === 'center' ? x - w / 2 : x, cy - hh / 2, w, hh);
  return w;
}

// Portrait détouré (tête et épaules) dans un carré de côté 2r centré sur (cx, cy) : halo aux couleurs
// de l'écurie, bas fondu ; sans photo, le trigramme
export function driverPhoto(ctx, img, cx, cy, r, color, label) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, alpha(color, 0.45)); g.addColorStop(1, alpha(color, 0));
  ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (img) photo(ctx, img, cx - r, cy - r, r * 2, r * 2, color, 0.22);
  else if (label) txt(ctx, label, cx, cy + r * 0.2, { size: Math.round(r * 0.6), weight: 800, family: TITLE, align: 'center' });
}

// ---------- Diapositives ----------
function hero(ctx, W, H, d, o, word) {
  const w = d.rows[0];
  const col = vivid(w.color);
  background(ctx, W, H, w.color);
  const f = frame(ctx, W, H, d, o, '');
  const img = o.photos?.[w.num];
  const ph = (f.bottom - f.top) * 0.58;
  photo(ctx, img, W * 0.12, f.top + 40, W * 0.76, ph, w.color, 0.3);
  let y = f.top + ph + 40;
  txt(ctx, word, f.pad, f.top + 50, { size: 50, weight: 700, family: TITLE, color: C.red, spacing: 6 });
  txt(ctx, w.first, f.pad, y + 20, { size: 54, weight: 600 });
  txt(ctx, w.last.toUpperCase(), f.pad, y + 165, { size: 160, weight: 800, family: TITLE, max: W - f.pad * 2 });
  y += 200;
  const lw = teamLogo(ctx, o, w.team, f.pad, y + 22, 52);
  if (!lw) { ctx.fillStyle = col; ctx.fillRect(f.pad, y, 12, 44); }
  txt(ctx, w.team, f.pad + (lw ? lw + 20 : 30), y + 37, { size: 40, weight: 600, max: W - f.pad * 2 - 30 });
  stats(ctx, d, f.pad, y + (H > 1600 ? 130 : 100), W - f.pad * 2, 3);
}

function stats(ctx, d, x, y, w, perRow) {
  const r = d.rows;
  const items = [];
  if (d.kind === 'race') {
    if (r[1]?.gap) items.push(['Avance', r[1].gap.replace(/^\+/, '')]);
    if (r[0].grid) items.push(['Départ', r[0].grid === 1 ? 'Pole' : `P${r[0].grid}`]);
    if (d.laps) items.push(['Tours', String(d.laps)]);
  } else {
    if (r[0].gap) items.push(['Temps', r[0].gap]);
    if (r[1]?.gap) items.push(['Sur P2', r[1].gap]);
    if (d.kind === 'practice' && r[0].laps) items.push(['Tours', String(r[0].laps)]);
  }
  const n = Math.min(items.length, perRow > 2 ? 3 : perRow === 1 ? 3 : 2);
  if (!n) return;
  const gap = 16;
  const cw = perRow === 1 ? w : (w - gap * (n - 1)) / n;
  items.slice(0, perRow === 1 ? 3 : n).forEach(([k, v], i) => {
    const cx = perRow === 1 ? x : x + i * (cw + gap);
    const cy = perRow === 1 ? y + i * 96 : y;
    rr(ctx, cx, cy, perRow === 1 ? Math.min(cw, 420) : cw, 84, 14); ctx.fillStyle = C.panel; ctx.fill();
    txt(ctx, k.toUpperCase(), cx + 22, cy + 32, { size: 22, weight: 700, family: TITLE, color: C.muted, spacing: 2 });
    txt(ctx, v, cx + 22, cy + 70, { size: 36, weight: 700, family: MONO, max: (perRow === 1 ? Math.min(cw, 420) : cw) - 44 });
  });
}

function podium(ctx, W, H, d, o) {
  background(ctx, W, H, d.rows[0].color);
  const f = frame(ctx, W, H, d, o, d.kind === 'race' ? 'Podium' : 'Top 3');
  const top3 = d.rows.slice(0, 3);
  const order = [1, 0, 2].filter((i) => top3[i]);
  const colW = (W - f.pad * 2) / 3;
  const baseY = f.bottom - 40;
  const heights = H > 1600 ? [800, 670, 560] : [380, 300, 240];
  const r = Math.min(H > 1600 ? 175 : 125, colW * (H > 1600 ? 0.52 : 0.42));
  order.forEach((i, k) => {
    const p = top3[i];
    const cx = f.pad + colW * k + colW / 2;
    const h = heights[i];
    const y0 = baseY - h;
    const g = ctx.createLinearGradient(0, y0, 0, baseY);
    g.addColorStop(0, alpha(p.color, 0.55)); g.addColorStop(1, alpha(p.color, 0.08));
    rr(ctx, cx - colW * 0.44, y0, colW * 0.88, h, 18); ctx.fillStyle = g; ctx.fill();
    txt(ctx, String(i + 1), cx, y0 + h * 0.5 + 40, { size: Math.round(h * 0.42), weight: 800, family: TITLE, color: MEDAL[i], align: 'center' });
    teamLogo(ctx, o, p.team, cx, y0 + 50, 56, 'center', colW * 0.5);
    const tt = y0 - 172;
    const cy = tt - 18 - r;
    driverPhoto(ctx, o.photos?.[p.num], cx, cy, r, p.color, p.tla);
    txt(ctx, p.first, cx, tt + 40, { size: 34, weight: 600, align: 'center', max: colW - 20 });
    txt(ctx, p.last.toUpperCase(), cx, tt + 100, { size: 60, weight: 800, family: TITLE, align: 'center', max: colW - 16 });
    txt(ctx, i === 0 ? (d.kind !== 'race' ? p.gap || p.team : p.team) : p.gap || p.team, cx, tt + 150, { size: 32, weight: 600, family: i === 0 && d.kind === 'race' ? BODY : MONO, color: C.muted, align: 'center', max: colW - 16 });
  });
}

function classement(ctx, W, H, d, o) {
  background(ctx, W, H, null);
  const f = frame(ctx, W, H, d, o, d.kind === 'quali' ? 'Grille' : 'Classement');
  const rows = d.rows.slice(0, 22);
  // Deux colonnes sauf en story (assez haute pour une seule) : textes lisibles sur un téléphone
  const cols = H > 1600 || rows.length <= 12 ? 1 : 2;
  const gapC = 24;
  const per = Math.ceil(rows.length / cols);
  const colW = (W - f.pad * 2 - (cols - 1) * gapC) / cols;
  const rowH = Math.min(cols === 1 ? 76 : 92, (f.bottom - f.top + 20) / per);
  const fs = Math.round(Math.min(rowH * 0.5, cols === 1 ? 38 : 34));
  const names = colW > 620;
  rows.forEach((r, i) => {
    const c = Math.floor(i / per);
    const x = f.pad + c * (colW + gapC);
    const y = f.top - 10 + (i % per) * rowH;
    if (i % 2 === 0) { rr(ctx, x, y, colW, rowH - 4, 10); ctx.fillStyle = C.panel; ctx.fill(); }
    const mid = y + rowH / 2 + fs * 0.34;
    const px = x + fs * 1.6;
    txt(ctx, String(r.pos), px, mid, { size: fs, weight: 800, family: TITLE, color: i < 3 ? MEDAL[i] : C.text, align: 'right' });
    // Logo de l'écurie (sinon barre de couleur), puis trigramme
    const slot = fs * 1.2;
    const lx = px + fs * 0.4;
    ctx.fillStyle = vivid(r.color); ctx.fillRect(x, y + 6, 5, rowH - 16);
    teamLogo(ctx, o, r.team, lx + slot / 2, y + (rowH - 4) / 2, fs * 0.9, 'center', slot);
    const tx = lx + slot + fs * 0.3;
    txt(ctx, r.tla, tx, mid, { size: fs, weight: 800, family: TITLE, color: r.out ? C.muted : C.text });
    if (names) txt(ctx, r.last, tx + fs * 2.5, mid, { size: Math.round(fs * 0.8), weight: 600, color: C.muted, max: colW * 0.3 });
    const right = x + colW - fs * 0.6;
    if (d.kind === 'race' && r.points) {
      txt(ctx, `+${r.points}`, right, mid, { size: Math.round(fs * 0.8), weight: 700, family: TITLE, color: C.green, align: 'right' });
    }
    // Essais : nombre de tours de chaque pilote à droite, écart juste avant
    const laps = d.kind === 'practice' && d.rows.some((x) => x.laps);
    if (laps) txt(ctx, r.laps ? `${r.laps} tours` : '', right, mid, { size: Math.round(fs * 0.72), weight: 600, color: C.muted, align: 'right' });
    const gx = d.kind === 'race' ? right - fs * 2.4 : laps ? right - fs * 3.9 : right;
    txt(ctx, r.out ? 'ABANDON' : r.gap || (i === 0 && d.kind === 'race' ? 'VAINQUEUR' : ''), gx, mid, { size: Math.round(fs * 0.8), weight: 600, family: r.out || (i === 0 && d.kind === 'race') ? TITLE : MONO, color: r.out ? C.red : i === 0 ? C.gold : C.text, align: 'right' });
    if (d.kind === 'quali' && r.knockedOut) txt(ctx, `${names ? 'ÉLIMINÉ ' : ''}${d.sprint ? 'SQ' : 'Q'}${r.koPart}`, names ? x + colW * 0.6 : tx + fs * 2.3, mid, { size: Math.round(fs * 0.62), weight: 700, family: TITLE, color: C.red, spacing: 1 });
  });
}

export function faits(ctx, W, H, d, o, title = 'Faits marquants') {
  background(ctx, W, H, d.facts[0]?.color || d.rows[0]?.color);
  const f = frame(ctx, W, H, d, o, title);
  const cols = 2;
  const items = d.facts.slice(0, 6);
  const gap = 24;
  const cw = (W - f.pad * 2 - gap * (cols - 1)) / cols;
  const rowsN = Math.ceil(items.length / cols);
  // Cases seules sur la slide : le résumé de la course reste dans le texte du post
  const ch = Math.min(H > 1600 ? 520 : 380, (f.bottom - f.top - gap * (rowsN - 1)) / Math.max(rowsN, 1));
  items.forEach((it, i) => {
    const x = f.pad + (i % cols) * (cw + gap);
    const y = f.top + Math.floor(i / cols) * (ch + gap);
    // Dernière case seule sur sa ligne : toute la largeur
    const w = i === items.length - 1 && i % cols === 0 && cols === 2 ? cw * 2 + gap : cw;
    rr(ctx, x, y, w, ch, 18); ctx.fillStyle = C.panel; ctx.fill();
    ctx.fillStyle = it.color ? vivid(it.color) : C.red; ctx.fillRect(x, y + 24, 8, 44);
    txt(ctx, it.label.toUpperCase(), x + 30, y + 58, { size: 26, weight: 700, family: TITLE, color: C.muted, spacing: 2, max: w - 50 });
    txt(ctx, it.value, x + 30, y + ch * 0.55 + 20, { size: 58, weight: 800, family: TITLE, max: w - 50 });
    if (it.sub) wrap(ctx, it.sub, x + 30, y + ch * 0.55 + 70, w - 56, 34, 2, { size: 27, weight: 600, color: C.muted });
  });
}

function championnat(ctx, W, H, d, o) {
  background(ctx, W, H, null);
  const f = frame(ctx, W, H, d, o, 'Championnat');
  const drv = d.champ.drivers.slice(0, 10);
  const teams = d.champ.teams.slice(0, 5);
  const list = (items, x, y, w, rowH, titleText, nameOf) => {
    txt(ctx, titleText, x, y, { size: 30, weight: 700, family: TITLE, color: C.red, spacing: 3 });
    const fs = Math.round(rowH * 0.48);
    items.forEach((r, i) => {
      const ry = y + 20 + i * rowH;
      if (i % 2 === 0) { rr(ctx, x, ry, w, rowH - 4, 8); ctx.fillStyle = C.panel; ctx.fill(); }
      const mid = ry + rowH / 2 + fs * 0.34;
      txt(ctx, String(r.pos ?? ''), x + 40, mid, { size: fs, weight: 800, family: TITLE, color: i < 3 ? MEDAL[i] : C.text, align: 'right' });
      ctx.fillStyle = vivid(r.color); ctx.fillRect(x + 56, ry + rowH * 0.22, 6, rowH * 0.52);
      txt(ctx, nameOf(r), x + 78, mid, { size: fs, weight: 700, family: TITLE, max: w * 0.5 });
      if (r.move) txt(ctx, `${r.move > 0 ? '▲' : '▼'}${Math.abs(r.move)}`, x + w * 0.66, mid, { size: Math.round(fs * 0.7), weight: 700, family: BODY, color: r.move > 0 ? C.green : C.red, align: 'right' });
      if (r.gained) txt(ctx, `+${r.gained}`, x + w * 0.8, mid, { size: Math.round(fs * 0.75), weight: 700, family: TITLE, color: C.green, align: 'right' });
      txt(ctx, `${r.points ?? ''} pts`, x + w - 16, mid, { size: Math.round(fs * 0.85), weight: 700, family: MONO, align: 'right' });
    });
  };
  const avail = f.bottom - f.top - 120;
  const rowH = Math.min(H > 1600 ? 74 : 58, avail / (drv.length + teams.length));
  list(drv, f.pad, f.top + 10, W - f.pad * 2, rowH, 'PILOTES', (r) => r.last.toUpperCase());
  list(teams, f.pad, f.top + 10 + 20 + drv.length * rowH + 70, W - f.pad * 2, rowH, 'CONSTRUCTEURS', (r) => r.name.toUpperCase());
  txt(ctx, d.final ? 'Après la course' : 'Projection en cours de course', W - f.pad, f.bottom + 20, { size: 22, weight: 600, color: C.muted, align: 'right' });
}

// Couverture du carrousel : Grand Prix, séance, date, circuit et sommaire des images suivantes
function cover(ctx, W, H, d, o, next, fmt) {
  background(ctx, W, H, C.red);
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  // Damier fondu en haut à droite
  const sq = Math.round(46 * u);
  ctx.save();
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      if ((i + j) % 2) continue;
      const a = 0.11 * (1 - (i + j) / 16);
      if (a <= 0) continue;
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.fillRect(W - (i + 1) * sq, j * sq, sq, sq);
    }
  }
  ctx.restore();
  // En-tête : barre rouge, Formule 1 et saison
  const top = Math.round(Math.min(W, H) * 0.06);
  ctx.fillStyle = C.red;
  ctx.fillRect(pad, top, 10, Math.round(64 * u));
  txt(ctx, 'FORMULE 1', pad + 28, top + 30 * u, { size: Math.round(34 * u), weight: 800, family: TITLE, spacing: 4 });
  txt(ctx, `SAISON ${d.year || ''}`.trim(), pad + 28, top + 62 * u, { size: Math.round(24 * u), weight: 600, family: TITLE, color: C.muted, spacing: 3 });

  // Bloc central : drapeau, « Résultats », séance, nom du Grand Prix
  const colW = W - pad * 2;
  const tall = H / W > 1.5;   // story : bloc et sommaire groupés au milieu
  let y = tall ? H * 0.27 : H * 0.24;
  if (o.flag) {
    const fh = Math.round(66 * u);
    const fw = Math.round(fh * o.flag.width / o.flag.height);
    rr(ctx, pad, y, fw, fh, 8); ctx.save(); ctx.clip(); ctx.drawImage(o.flag, pad, y, fw, fh); ctx.restore();
    y += fh + 30 * u;
  }
  const word = { prerace: 'AVANT-COURSE', champ: 'CHAMPIONNAT', weekend: 'PROGRAMME', records: 'LE SAVIEZ-VOUS', ratings: 'LES NOTES', teamduels: 'LES DUELS', racelaps: 'LA COURSE', title: 'LE TITRE' }[d.post] || 'RÉSULTATS';
  txt(ctx, word, pad, y + 150 * u, { size: Math.round(190 * u), weight: 800, family: TITLE, max: colW, spacing: 2 });
  y += 190 * u;
  // Séance dans une étiquette rouge
  const tag = (d.post === 'prerace' ? (d.sprint ? 'Sprint' : 'Course') : d.post === 'champ' ? (d.final ? 'Après la course' : 'En direct')
    : d.post === 'weekend' ? (d.sprint ? 'Week-end sprint' : `Manche ${d.round || ''}`) : d.post === 'records' ? 'Records du circuit'
      : d.post === 'ratings' ? 'Après la course' : d.post === 'teamduels' || d.post === 'title' ? `Après ${d.after} course${d.after > 1 ? 's' : ''}` : d.post === 'racelaps' ? 'Tour par tour'
        : d.kind === 'race' && !d.sprint ? 'Course' : d.label).toUpperCase();
  ctx.font = `700 ${Math.round(36 * u)}px ${TITLE}`;
  const tw = ctx.measureText(tag).width + 6 * tag.length * u;
  rr(ctx, pad, y, tw + 48 * u, 62 * u, 8 * u); ctx.fillStyle = C.red; ctx.fill();
  txt(ctx, tag, pad + 24 * u, y + 44 * u, { size: Math.round(36 * u), weight: 700, family: TITLE, spacing: 6 * u });
  y += 62 * u + 70 * u;
  const lines = wrap(ctx, d.gp.toUpperCase(), pad, y + 20 * u, colW, 92 * u, 2, { size: Math.round(92 * u), weight: 800, family: TITLE });
  y += (lines - 1) * 92 * u + 80 * u;
  const info = [d.date, d.circuit, d.kind === 'race' && d.laps ? `${d.laps} tours` : ''].filter(Boolean).join('  ·  ').toUpperCase();
  if (info) txt(ctx, info, pad, y, { size: Math.round(30 * u), weight: 600, family: TITLE, color: C.muted, max: colW, spacing: 2 });

  // Sommaire des images suivantes (numéro = place dans le carrousel publié)
  const items = next.map((s, i) => [String((o.slides ? o.slides.indexOf(s) : i + 1) + 1).padStart(2, '0'), slideName(s)]);
  const sx = pad;
  const end = H - Math.round(Math.min(W, H) * 0.13);   // au-dessus du pied
  let sy = tall ? y + 120 * u : Math.max(y + 80 * u, end - items.length * 52 * u - 40 * u);
  const lh = Math.min(52 * u, (end - sy - 22 * u) / Math.max(items.length, 1));
  txt(ctx, 'AU PROGRAMME', sx, sy, { size: Math.round(26 * u), weight: 700, family: TITLE, color: C.red, spacing: 4 });
  sy += 22 * u;
  ctx.fillStyle = C.line; ctx.fillRect(sx, sy, W * 0.5, 2);
  for (const [n, name] of items) {
    sy += lh;
    txt(ctx, n, sx, sy, { size: Math.round(30 * u), weight: 700, family: MONO, color: C.muted });
    txt(ctx, name.toUpperCase(), sx + 70 * u, sy, { size: Math.round(36 * u), weight: 700, family: TITLE, spacing: 1 });
  }

  // Pied : signature, « faites défiler », résultats provisoires
  const fy = H - Math.round(Math.min(W, H) * 0.045);
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, fy - Math.round(Math.min(W, H) * 0.04), W - pad * 2, 2);
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(Math.min(W, H) * 0.032), weight: 700, family: TITLE, spacing: 1 });
  // Carrousel : on fait défiler ; story, vidéo et X : la suite vient après
  const hint = fmt === 'ig' ? 'FAITES DÉFILER' : 'À SUIVRE';
  const swipe = d.final ? hint : `RÉSULTATS PROVISOIRES · ${hint}`;
  const ax = W - pad;
  const ay = fy - Math.round(Math.min(W, H) * 0.009);
  ctx.save();
  ctx.strokeStyle = C.red; ctx.lineWidth = 5 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const k of [0, 1]) {
    const cx = ax - k * 18 * u;
    ctx.beginPath(); ctx.moveTo(cx - 14 * u, ay - 13 * u); ctx.lineTo(cx, ay); ctx.lineTo(cx - 14 * u, ay + 13 * u); ctx.stroke();
  }
  ctx.restore();
  txt(ctx, swipe, ax - 52 * u, fy, { size: Math.round(Math.min(W, H) * 0.024), weight: 700, family: TITLE, color: d.final ? C.text : C.gold, align: 'right', spacing: 2 });
}

// ---------- News (transfert, pénalité, annonce…) ----------
// Lignes d'un texte coupé à la largeur, au plus grand corps qui tient en maxLines lignes
export function fitLines(ctx, text, maxW, sizes, maxLines, family, weight) {
  for (const size of sizes) {
    ctx.font = `${weight} ${size}px ${family}`;
    const out = [];
    let line = '';
    for (const w of String(text).split(/\s+/)) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
    if (out.length <= maxLines || size === sizes[sizes.length - 1]) {
      if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = `${out[maxLines - 1].replace(/\s+\S*$/, '')}…`; }
      return { size, lines: out };
    }
  }
  return { size: sizes[0], lines: [] };
}
export const lightColor = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return false;
  const v = parseInt(m[1], 16);
  return 0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255) > 150;
};

// Très grosse info (« Breaking news », image et vidéo) : liseré rouge tout autour (k < 1 : en train de
// se dessiner) et étiquette « ● BREAKING » calée à droite sur x, en haut sur y, de hauteur h ; dot :
// opacité du point (qui clignote dans la vidéo). Renvoie la largeur de l'étiquette.
export function breakingFrame(ctx, W, H, u, k = 1) {
  const lw = 14 * u;
  ctx.save();
  ctx.strokeStyle = C.red; ctx.lineWidth = lw;
  if (k < 1) { const per = 2 * (W + H); ctx.setLineDash([per * Math.max(0, k), per]); }
  ctx.strokeRect(lw / 2, lw / 2, W - lw, H - lw);
  ctx.restore();
}
export function breakingTag(ctx, x, y, h, dot = 1) {
  const size = Math.round(h * 0.6);
  const sp = size * 0.18;
  ctx.font = `800 ${size}px ${TITLE}`;
  const w = ctx.measureText('BREAKING').width + 8 * sp + h * 1.25;
  rr(ctx, x - w, y, w, h, h * 0.14); ctx.fillStyle = C.red; ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${dot})`;
  ctx.beginPath(); ctx.arc(x - w + h * 0.45, y + h / 2, h * 0.15, 0, Math.PI * 2); ctx.fill();
  txt(ctx, 'BREAKING', x - h * 0.32, y + h * 0.71, { size, weight: 800, family: TITLE, color: '#fff', align: 'right', spacing: sp });
  return w;
}

export function newsSlide(ctx, W, H, d, o, fmt = 'ig') {
  background(ctx, W, H, d.color);
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const top = Math.round(Math.min(W, H) * 0.06);
  const fy = H - Math.round(Math.min(W, H) * 0.045);
  const bottom = fy - Math.round(Math.min(W, H) * 0.07);
  // Résumé détaillé ou photos de l'article dans les images suivantes (celles gardées) : invitation à faire défiler
  const pagesAll = pointPages(d.points, fmt);
  const more = keptPages(o, 'essentiel', pagesAll.map((_, i) => i + 1)).reduce((n, k) => n + (pagesAll[k - 1]?.length || 0), 0);
  const pics = keptPages(o, 'photo', (d.gallery || []).map((_, i) => i + 1)).length;
  const scroll = (more || pics) && fmt !== 'x';
  // En-tête : Actu F1 et date ; très grosse info : liseré rouge et étiquette « BREAKING » à droite
  ctx.fillStyle = C.red;
  ctx.fillRect(pad, top, 10, Math.round(64 * u));
  txt(ctx, 'ACTU F1', pad + 28, top + 30 * u, { size: Math.round(34 * u), weight: 800, family: TITLE, spacing: 4 });
  txt(ctx, d.date.toUpperCase(), pad + 28, top + 62 * u, { size: Math.round(24 * u), weight: 600, family: TITLE, color: C.muted, spacing: 2 });
  if (d.breaking) { breakingFrame(ctx, W, H, u); breakingTag(ctx, W - pad, top + 2 * u, 58 * u); }
  if (scroll) {
    const ax = W - pad;
    const ay = top + (d.breaking ? 92 : 38) * u;   // sous l'étiquette « BREAKING »
    ctx.save();
    ctx.strokeStyle = C.red; ctx.lineWidth = 5 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const k of [0, 1]) {
      const cx = ax - k * 18 * u;
      ctx.beginPath(); ctx.moveTo(cx - 14 * u, ay - 13 * u); ctx.lineTo(cx, ay); ctx.lineTo(cx - 14 * u, ay + 13 * u); ctx.stroke();
    }
    ctx.restore();
    txt(ctx, more ? `L'ESSENTIEL EN ${more} POINTS` : `${pics + 1} PHOTOS`, ax - 52 * u, ay + 10 * u, { size: Math.round(26 * u), weight: 700, family: TITLE, align: 'right', spacing: 2 });
  }

  // Photos des pilotes cités : une grande, ou une rangée de portraits
  const withPhoto = d.drivers.filter((p) => o.photos?.[p.num]);
  const x = pad;
  let colW = W - pad * 2;
  let areaTop = top + 110 * u;
  let centered = false;
  const custom = d.image?.width ? d.image : null;   // photo importée : à la place des portraits
  if (custom) {
    const ph = newsPhotoBox(W, H).h;
    coverPhoto(ctx, custom, pad, areaTop, W - pad * 2, ph);
    photoCredit(ctx, d.credit, pad, areaTop, W - pad * 2, ph, u);
    areaTop += ph + 30 * u;
  } else if (withPhoto.length === 1) {
    const ph = (bottom - areaTop) * (H > 1600 ? 0.42 : 0.38);
    photo(ctx, o.photos[withPhoto[0].num], W * 0.18, areaTop, W * 0.64, ph, withPhoto[0].color, 0.3);
    areaTop += ph + 30 * u;
  } else if (d.drivers.length) {
    const r = Math.round(100 * u);
    d.drivers.forEach((p, i) => driverPhoto(ctx, o.photos?.[p.num], pad + r + i * (r * 2 + 40 * u), areaTop + r + 10 * u, r, p.color, p.tla));
    areaTop += r * 2 + 60 * u;
  } else centered = true;

  // Mise en page du texte : le plus grand titre qui laisse au moins 2 lignes de résumé
  const sumSize = Math.round(34 * u);
  const sumLh = Math.round(sumSize * 1.38);
  const sumAll = d.summary ? fitLines(ctx, d.summary, colW, [sumSize], 99, BODY, 400).lines : [];
  const maxSum = H > 1600 ? 9 : 6;
  const fixed = (58 + 40 + 34 + 30) * u;
  const avail = bottom - areaTop;
  const maxTitle = H > 1600 ? 6 : 5;
  let pick = null;
  for (const size of [104, 96, 88, 80, 72, 66, 60, 54, 48].map((v) => Math.round(v * u))) {
    const t = fitLines(ctx, d.title.toUpperCase(), colW, [size], 99, TITLE, 800);
    if (t.lines.length > maxTitle) continue;
    const titleH = t.lines.length * Math.round(size * 0.98);
    const sumN = Math.min(sumAll.length, maxSum, Math.floor((avail - fixed - titleH) / sumLh));
    pick = { size, lines: t.lines, sumN: Math.max(0, sumN) };
    if (sumN >= Math.min(2, sumAll.length)) break;
  }
  if (!pick) {
    const size = Math.round(48 * u);
    pick = { size, lines: fitLines(ctx, d.title.toUpperCase(), colW, [size], maxTitle, TITLE, 800).lines, sumN: 0 };
  }
  const lh = Math.round(pick.size * 0.98);
  const blockH = fixed + pick.lines.length * lh + pick.sumN * sumLh;
  let y = centered ? areaTop + Math.max(0, (avail - blockH) / 2.2) : areaTop;

  // Étiquette du type de nouvelle (aucune si le type est « Aucun »)
  const tag = d.badge.label;
  if (tag) {
    ctx.font = `700 ${Math.round(34 * u)}px ${TITLE}`;
    const tw = ctx.measureText(tag).width + 6 * tag.length * u;
    rr(ctx, x, y, tw + 44 * u, 58 * u, 8 * u); ctx.fillStyle = d.badge.color; ctx.fill();
    txt(ctx, tag, x + 22 * u, y + 41 * u, { size: Math.round(34 * u), weight: 700, family: TITLE, color: lightColor(d.badge.color) ? C.bg : '#fff', spacing: 6 * u });
    y += (58 + 40) * u;
  }
  pick.lines.forEach((l, i) => txt(ctx, l, x, y + pick.size * 0.82 + i * lh, { size: pick.size, weight: 800, family: TITLE }));
  y += pick.lines.length * lh + 34 * u;
  ctx.fillStyle = d.color ? vivid(d.color) : C.red;
  ctx.fillRect(x, y - 10 * u, 90 * u, 6 * u);
  y += 30 * u;
  const sum = sumAll.slice(0, pick.sumN);
  if (sum.length && sum.length < sumAll.length) sum[sum.length - 1] = `${sum[sum.length - 1].replace(/\s+\S*$/, '')}…`;
  sum.forEach((l, i) => txt(ctx, l, x, y + sumSize * 0.8 + i * sumLh, { size: sumSize, weight: 400, color: C.text }));

  // Pied : signature et source
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, fy - Math.round(Math.min(W, H) * 0.04), W - pad * 2, 2);
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(Math.min(W, H) * 0.032), weight: 700, family: TITLE, spacing: 1 });
  if (d.source) txt(ctx, `SOURCE : ${d.source.toUpperCase()}`, W - pad, fy, { size: Math.round(Math.min(W, H) * 0.025), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2, max: W * 0.55 });
}

// ---------- Grille de départ (deux colonnes décalées, comme sur la piste) ----------
function grille(ctx, W, H, d, o) {
  background(ctx, W, H, d.rows[0]?.color);
  const f = frame(ctx, W, H, d, o, d.sprint ? 'Grille du sprint' : 'Grille de départ');
  const rows = d.rows.slice(0, 22);
  // Notes sous la grille : source, puis pénalités et départs des stands
  const pens = rows.filter((r) => r.penalty);
  const noteSize = 22;
  const notes = [GRID_SOURCE[d.gridSource] || '', ...pens.slice(0, 5).map((r) => `* ${r.tla} : ${r.penalty}`)].filter(Boolean);
  if (pens.length > 5) notes.push(`* … et ${pens.length - 5} autre${pens.length - 5 > 1 ? 's' : ''}`);
  const noteH = notes.length * (noteSize + 8) + 14;
  const lines = Math.ceil(rows.length / 2);
  const cw = (W - f.pad * 2 - 24) / 2;
  const rowH = (f.bottom - noteH - f.top + 10) / (lines + 0.5);
  const fs = Math.round(Math.min(rowH * 0.36, 40));
  rows.forEach((r, i) => {
    const col = i % 2;
    const x = f.pad + col * (cw + 24);
    const y = f.top - 6 + Math.floor(i / 2) * rowH + (col ? rowH * 0.5 : 0);
    const h = rowH * 0.86;
    rr(ctx, x, y, cw, h, 10); ctx.fillStyle = C.panel; ctx.fill();
    ctx.fillStyle = vivid(r.color); ctx.fillRect(x, y, 8, h);
    const mid = y + h / 2 + fs * 0.35;
    txt(ctx, r.pitlane ? 'PL' : String(r.pos), x + 24, mid, { size: Math.round(fs * (r.pitlane ? 0.9 : 1.2)), weight: 800, family: TITLE, color: r.pitlane ? C.red : r.pos <= 3 ? MEDAL[r.pos - 1] : C.text });
    txt(ctx, `${r.tla}${r.penalty ? '*' : ''}`, x + 24 + fs * 1.6, mid, { size: fs, weight: 800, family: TITLE, color: r.penalty ? C.gold : C.text });
    txt(ctx, r.pitlane ? 'Départ des stands' : r.last, x + 24 + fs * 3.6, mid, { size: Math.round(fs * 0.78), weight: 600, color: r.pitlane ? C.red : C.muted, max: cw - fs * 3.6 - 34 });
  });
  notes.forEach((n, i) => txt(ctx, n, f.pad, f.bottom - noteH + 14 + noteSize + i * (noteSize + 8), { size: noteSize, weight: i ? 400 : 700, family: i ? undefined : TITLE, color: i ? C.text : C.muted, spacing: i ? 0 : 1.5, max: W - f.pad * 2 }));
}

// ---------- Météo et pneus Pirelli ----------
function meteo(ctx, W, H, d, o) {
  background(ctx, W, H, '#2b5fd9');
  const f = frame(ctx, W, H, d, o, 'Météo et pneus');
  const w = d.weather;
  const tiles = w ? [['Air', `${w.air == null ? '—' : String(Math.round(w.air))} °C`], ['Piste', `${w.track == null ? '—' : String(Math.round(w.track))} °C`], ['Humidité', `${w.humidity == null ? '—' : String(Math.round(w.humidity))} %`], ['Vent', `${w.wind == null ? '—' : String(Math.round(w.wind * 3.6))} km/h`], ['Pluie', w.rain ? 'Oui' : 'Non']] : [];
  const cols = 2;
  const gap = 20;
  const tw = (W - f.pad * 2 - gap * (cols - 1)) / cols;
  // Les cases remplissent la hauteur laissée par les pneus (sinon toute la hauteur)
  const rowsT = Math.ceil(tiles.length / cols);
  const rT = Math.min(120, (W - f.pad * 2) / 7);
  const tyreH = d.tyres ? rT * 2 + 190 : 0;
  const th = rowsT ? Math.max(150, Math.min(H > 1600 ? 440 : 300, (f.bottom - f.top - tyreH) / rowsT - gap)) : 0;
  tiles.forEach(([k, v], i) => {
    const x = f.pad + (i % cols) * (tw + gap);
    const y = f.top + Math.floor(i / cols) * (th + gap);
    rr(ctx, x, y, tw, th, 18); ctx.fillStyle = C.panel; ctx.fill();
    txt(ctx, k.toUpperCase(), x + 30, y + 56, { size: 28, weight: 700, family: TITLE, color: C.muted, spacing: 2 });
    txt(ctx, v, x + 30, y + th - 40, { size: Math.round(Math.min(92, th * 0.42)), weight: 800, family: TITLE, max: tw - 50, color: k === 'Pluie' && w.rain ? '#4fc3f7' : C.text });
  });
  if (!d.tyres) return;
  const y0 = tiles.length ? f.top + rowsT * (th + gap) + 70 : f.top + 40;
  txt(ctx, 'PNEUS PIRELLI DU WEEK-END', f.pad, y0, { size: 30, weight: 700, family: TITLE, color: C.red, spacing: 3 });
  const tyres = [['Durs', d.tyres.hard, '#f2f2f2'], ['Médiums', d.tyres.medium, '#f5c518'], ['Tendres', d.tyres.soft, '#e10600']];
  const r = Math.min(rT, (f.bottom - y0 - 120) / 2);
  tyres.forEach(([name, c, color], i) => {
    const cx = f.pad + r + 10 + i * ((W - f.pad * 2 - 2 * r - 20) / 2);
    const cy = y0 + 40 + r;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#16181d'; ctx.fill();
    ctx.lineWidth = r * 0.22; ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2); ctx.stroke();
    txt(ctx, `C${c}`, cx, cy + r * 0.2, { size: Math.round(r * 0.5), weight: 800, family: TITLE, align: 'center' });
    txt(ctx, name.toUpperCase(), cx, cy + r + 50, { size: 30, weight: 700, family: TITLE, color: C.muted, align: 'center', spacing: 2 });
  });
}

// ---------- Championnat (pilotes, constructeurs) ----------
function standings(ctx, W, H, d, o, title, rows) {
  background(ctx, W, H, rows[0]?.color);
  const f = frame(ctx, W, H, d, o, title);
  const list = rows.slice(0, 22);
  // Deux colonnes au-delà de 12 lignes, sauf en story : textes lisibles sur un téléphone
  const cols = H > 1600 || list.length <= 12 ? 1 : 2;
  const gapC = 24;
  const per = Math.ceil(list.length / cols);
  const colW = (W - f.pad * 2 - (cols - 1) * gapC) / cols;
  const rowH = Math.min(cols === 2 ? 92 : H > 1600 ? 132 : 88, (f.bottom - f.top - 24) / per);
  const fs = Math.round(Math.min(rowH * 0.5, cols === 2 ? 32 : 44));
  list.forEach((r, i) => {
    const x = f.pad + Math.floor(i / per) * (colW + gapC);
    const y = f.top - 10 + (i % per) * rowH;
    if (i % 2 === 0) { rr(ctx, x, y, colW, rowH - 4, 8); ctx.fillStyle = C.panel; ctx.fill(); }
    const mid = y + rowH / 2 + fs * 0.34;
    const px = x + fs * 1.6;
    txt(ctx, String(r.pos), px, mid, { size: fs, weight: 800, family: TITLE, color: i < 3 ? MEDAL[i] : C.text, align: 'right' });
    const slot = fs * 1.2;
    const lx = px + fs * 0.4;
    ctx.fillStyle = vivid(r.color); ctx.fillRect(x, y + 6, 5, rowH - 16);
    teamLogo(ctx, o, r.team || r.name, lx + slot / 2, y + (rowH - 4) / 2, fs * 0.9, 'center', slot);
    const right = x + colW - fs * 0.6;
    const tx = lx + slot + fs * 0.3;
    txt(ctx, r.label, tx, mid, { size: fs, weight: 800, family: TITLE, max: right - fs * (cols === 2 ? 4.7 : 6.8) - tx });
    txt(ctx, `${r.points} pts`, right, mid, { size: Math.round(fs * 0.86), weight: 700, family: MONO, align: 'right' });
    if (r.gained) txt(ctx, `+${r.gained}`, right - fs * 4.2, mid, { size: Math.round(fs * 0.76), weight: 700, family: TITLE, color: C.green, align: 'right' });
    if (r.move && cols === 1) txt(ctx, r.move > 0 ? `▲${r.move}` : `▼${-r.move}`, right - fs * 6.1, mid, { size: Math.round(fs * 0.7), weight: 700, family: TITLE, color: r.move > 0 ? C.green : C.red, align: 'right' });
  });
  txt(ctx, d.final ? 'Après la course' : 'Projection en cours de course', W - f.pad, f.bottom + 6, { size: 22, weight: 600, color: C.muted, align: 'right' });
}

// ---------- Duels entre coéquipiers ----------
function duels(ctx, W, H, d, o) {
  background(ctx, W, H, null);
  const f = frame(ctx, W, H, d, o, 'Duels');
  const list = teammateDuels(d).slice(0, 12);
  const cols = 2;
  const gap = 18;
  const cw = (W - f.pad * 2 - gap * (cols - 1)) / cols;
  const rowsN = Math.ceil(list.length / cols);
  const ch = Math.min(H > 1600 ? 230 : 170, (f.bottom - f.top - gap * (rowsN - 1)) / rowsN);
  list.forEach((t, i) => {
    const x = f.pad + (i % cols) * (cw + gap);
    const y = f.top + Math.floor(i / cols) * (ch + gap);
    rr(ctx, x, y, cw, ch, 14); ctx.fillStyle = C.panel; ctx.fill();
    ctx.fillStyle = vivid(t.color); ctx.fillRect(x, y + 14, 8, ch - 28);
    const lw = teamLogo(ctx, o, t.team, x + 26, y + ch * 0.22, ch * 0.18);
    txt(ctx, t.team.toUpperCase(), x + 26 + (lw ? lw + 12 : 0), y + ch * 0.27, { size: Math.round(ch * 0.15), weight: 700, family: TITLE, color: C.muted, spacing: 1.5, max: cw - 46 - lw });
    const s = Math.round(ch * 0.3);
    txt(ctx, t.ahead.tla, x + 26, y + ch * 0.68, { size: s, weight: 800, family: TITLE });
    txt(ctx, `P${t.ahead.pos}`, x + 26, y + ch * 0.9, { size: Math.round(s * 0.5), weight: 700, family: MONO, color: C.gold });
    txt(ctx, 'devant', x + cw / 2, y + ch * 0.64, { size: Math.round(s * 0.45), weight: 600, color: C.muted, align: 'center' });
    txt(ctx, t.behind.tla, x + cw - 22, y + ch * 0.68, { size: s, weight: 800, family: TITLE, color: C.muted, align: 'right' });
    txt(ctx, t.behind.out ? 'ABANDON' : `P${t.behind.pos}`, x + cw - 22, y + ch * 0.9, { size: Math.round(s * 0.5), weight: 700, family: t.behind.out ? TITLE : MONO, color: t.behind.out ? C.red : C.muted, align: 'right' });
  });
}

// ---------- Flash : drapeau rouge, voiture de sécurité, abandon, pénalité ----------
function flash(ctx, W, H, d, o) {
  const ev = d.event;
  const k = FLASH_KINDS[ev.kind] || { label: 'FLASH', color: C.red };
  background(ctx, W, H, k.color);
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const top = Math.round(Math.min(W, H) * 0.06);
  ctx.fillStyle = C.red; ctx.fillRect(pad, top, 10, Math.round(64 * u));
  txt(ctx, 'EN DIRECT', pad + 28, top + 30 * u, { size: Math.round(34 * u), weight: 800, family: TITLE, spacing: 4 });
  txt(ctx, `${d.gp} · ${d.label}`.toUpperCase(), pad + 28, top + 62 * u, { size: Math.round(24 * u), weight: 600, family: TITLE, color: C.muted, spacing: 2, max: W - pad * 2 - 40 });
  const fy = H - Math.round(Math.min(W, H) * 0.045);
  const bottom = fy - Math.round(Math.min(W, H) * 0.07);
  const img = ev.driver ? o.photos?.[ev.driver.num] : null;
  let y = top + 140 * u;
  const colW = W - pad * 2;
  if (img) {
    const ph = Math.min((bottom - y) * (H > 1600 ? 0.6 : 0.5), bottom - y - 440 * u); y += Math.max(0, (bottom - y - ph - 440 * u) / 2); photo(ctx, img, W * 0.18, y, W * 0.64, ph, ev.driver.color, 0.3); y += ph + 40 * u;
  } else y = (top + bottom) / 2 - 190 * u;   // sans photo : bloc centré
  // Bandeau du type d'évènement
  const label = fitLines(ctx, k.label, colW, [130, 116, 104, 92, 80, 70].map((v) => Math.round(v * u)), 2, TITLE, 800);
  label.lines.forEach((l, i) => {
    const ly = y + i * label.size * 1.02;
    ctx.font = `800 ${label.size}px ${TITLE}`;
    const lw = ctx.measureText(l).width;
    rr(ctx, pad - 10 * u, ly, lw + 40 * u, label.size * 0.98, 10 * u); ctx.fillStyle = k.color; ctx.fill();
    txt(ctx, l, pad + 10 * u, ly + label.size * 0.83, { size: label.size, weight: 800, family: TITLE, color: ev.kind === 'sc' || ev.kind === 'vsc' || ev.kind === 'penalty' ? C.bg : '#fff' });
  });
  y += label.lines.length * label.size * 1.02 + 50 * u;
  const t = fitLines(ctx, ev.title, colW, [72, 64, 56, 50, 44].map((v) => Math.round(v * u)), 3, TITLE, 800);
  t.lines.forEach((l, i) => txt(ctx, l, pad, y + t.size * 0.85 + i * t.size, { size: t.size, weight: 800, family: TITLE }));
  y += t.lines.length * t.size + 30 * u;
  if (ev.sub) wrap(ctx, ev.sub.charAt(0).toUpperCase() + ev.sub.slice(1), pad, y + 34 * u, colW, 46 * u, 3, { size: Math.round(36 * u), weight: 400, color: C.text });
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, fy - Math.round(Math.min(W, H) * 0.04), W - pad * 2, 2);
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(Math.min(W, H) * 0.032), weight: 700, family: TITLE, spacing: 1 });
  if (ev.lap) txt(ctx, `TOUR ${ev.lap}${d.laps ? ` / ${d.laps}` : ''}`, W - pad, fy, { size: Math.round(Math.min(W, H) * 0.024), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
}

// ---------- Dernière image des carrousels : s'abonner au compte ----------
const FOLLOW_TOPICS = [
  ['RÉSULTATS', 'Chaque séance, du podium au classement complet'],
  ['GRILLES', 'Les grilles de départ officielles et les pénalités'],
  ['ACTU', 'Transferts, annonces et décisions des commissaires'],
  ['CHAMPIONNAT', 'Les classements pilotes et constructeurs'],
];
// Question du post (avant-dernière image des carrousels) : faire réagir en commentaire
function question(ctx, W, H, d, o) {
  background(ctx, W, H, C.red);
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const top = Math.round(Math.min(W, H) * 0.06);
  ctx.fillStyle = C.red;
  ctx.fillRect(pad, top, 10, Math.round(64 * u));
  txt(ctx, 'FORMULE 1', pad + 28, top + 30 * u, { size: Math.round(34 * u), weight: 800, family: TITLE, spacing: 4 });
  txt(ctx, `SAISON ${d.year || ''}`.trim(), pad + 28, top + 62 * u, { size: Math.round(24 * u), weight: 600, family: TITLE, color: C.muted, spacing: 3 });
  const colW = W - pad * 2;
  const fy = H - Math.round(Math.min(W, H) * 0.045);
  // Titre, question (sans l'invitation finale, reprise dans la pastille), pastille rouge
  const q = questionFor(d);
  const main = q.replace(/\s*(Dis-le|Donne les tiennes) en commentaire\.$/, '').replace(/\s*Ton (avis|pronostic) en commentaire\.$/, '') || q;
  // Bloc centré entre l'en-tête et le pied : titre, question, pastille
  // Mesurée telle qu'affichée (majuscules, lettres espacées) : jamais coupée sur le bord
  const r = fitLines(ctx, main.toUpperCase(), (colW) - 40 * u, [64, 58, 52, 46, 40].map((v) => Math.round(v * u)), 4, TITLE, 800);
  const bigS = Math.round(170 * u);
  const hs = Math.round(44 * u);
  const block = bigS * 0.88 + 70 * u + r.lines.length * r.size * 1.15 + 60 * u + hs * 1.8;
  let y = Math.max(top + 120 * u, (top + 64 * u + fy - 40 * u) / 2 - block / 2) - bigS * 0.12;
  // Bulle de commentaire en grand, en filigrane
  const bs = Math.min(W, H) * 0.78;
  const bx = W - pad - bs * 0.92;
  const byy = y - bs * 0.12;
  ctx.save();
  ctx.globalAlpha = 0.08;
  rr(ctx, bx, byy, bs, bs * 0.66, bs * 0.12); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(bx + bs * 0.2, byy + bs * 0.64); ctx.lineTo(bx + bs * 0.14, byy + bs * 0.86); ctx.lineTo(bx + bs * 0.42, byy + bs * 0.64); ctx.closePath(); ctx.fill();
  ctx.restore();
  txt(ctx, 'À TOI !', pad, y + bigS * 0.88, { size: bigS, weight: 800, family: TITLE, max: colW, spacing: 2 });
  y += bigS * 0.88 + 70 * u;
  r.lines.forEach((l, i) => txt(ctx, l.toUpperCase(), pad, y + r.size * 0.85 + i * r.size * 1.15, { size: r.size, weight: 800, family: TITLE, spacing: 1 }));
  y += r.lines.length * r.size * 1.15 + 60 * u;
  const label = 'RÉPONDS EN COMMENTAIRE';
  ctx.font = `800 ${hs}px ${TITLE}`;
  const hw = Math.min(colW, ctx.measureText(label).width + label.length * 2 * u + 90 * u);
  rr(ctx, pad, y, hw, hs * 1.8, hs * 0.9); ctx.fillStyle = C.red; ctx.fill();
  txt(ctx, label, pad + 40 * u, y + hs * 1.22, { size: hs, weight: 800, family: TITLE, color: '#fff', max: hw - 80 * u, spacing: 2 });
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, fy - Math.round(Math.min(W, H) * 0.04), W - pad * 2, 2);
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(30 * u), weight: 700, family: TITLE, spacing: 1 });
  txt(ctx, 'ON LIT TOUT', W - pad, fy, { size: Math.round(24 * u), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
}

function follow(ctx, W, H, d, o) {
  background(ctx, W, H, C.red);
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const top = Math.round(Math.min(W, H) * 0.06);
  ctx.fillStyle = C.red;
  ctx.fillRect(pad, top, 10, Math.round(64 * u));
  txt(ctx, 'FORMULE 1', pad + 28, top + 30 * u, { size: Math.round(34 * u), weight: 800, family: TITLE, spacing: 4 });
  txt(ctx, `SAISON ${d.year || ''}`.trim(), pad + 28, top + 62 * u, { size: Math.round(24 * u), weight: 600, family: TITLE, color: C.muted, spacing: 3 });
  const handle = o.signature || '@BenjyPaddock';
  const colW = W - pad * 2;
  const fy = H - Math.round(Math.min(W, H) * 0.045);
  // Bloc d'appel : grand titre, raison adaptée au post, compte dans une pastille rouge
  const tall = H / W > 1.5;
  let y = tall ? H * 0.22 : H * 0.19;
  const big = txt(ctx, 'ABONNE-TOI', pad, y + 150 * u, { size: Math.round(170 * u), weight: 800, family: TITLE, max: colW, spacing: 2 });
  y += big * 0.88 + 60 * u;
  const reason = followReason(d);
  const r = fitLines(ctx, reason.charAt(0).toUpperCase() + reason.slice(1), colW, [46, 42, 38].map((v) => Math.round(v * u)), 3, BODY, 600);
  r.lines.forEach((l, i) => txt(ctx, l, pad, y + r.size * 0.8 + i * r.size * 1.3, { size: r.size, weight: 600, color: C.text }));
  y += r.lines.length * r.size * 1.3 + 50 * u;
  const hs = Math.round(58 * u);
  ctx.font = `800 ${hs}px ${TITLE}`;
  const hw = Math.min(colW, ctx.measureText(handle).width + 80 * u);
  rr(ctx, pad, y, hw, hs * 1.7, hs * 0.85); ctx.fillStyle = C.red; ctx.fill();
  txt(ctx, handle, pad + 40 * u, y + hs * 1.17, { size: hs, weight: 800, family: TITLE, color: '#fff', max: hw - 80 * u, spacing: 1 });
  y += hs * 1.7;
  // Ce que l'on trouve sur le compte
  const tx = pad;
  const tw = W - pad * 2;
  let ty = y + (tall ? 130 : 80) * u;
  const end = fy - Math.round(Math.min(W, H) * 0.08);
  const rowH = Math.min((tall ? 150 : 118) * u, (end - ty - 50 * u) / FOLLOW_TOPICS.length);
  txt(ctx, 'AU PROGRAMME DU COMPTE', tx, ty, { size: Math.round(26 * u), weight: 700, family: TITLE, color: C.red, spacing: 4 });
  ty += 26 * u;
  ctx.fillStyle = C.line; ctx.fillRect(tx, ty, tw, 2);
  for (const [k, v] of FOLLOW_TOPICS) {
    ty += 14 * u;
    ctx.fillStyle = C.red; ctx.fillRect(tx, ty + rowH * 0.22, 8 * u, rowH * 0.56);
    txt(ctx, k, tx + 32 * u, ty + rowH * 0.45, { size: Math.round(Math.min(38 * u, rowH * 0.34)), weight: 800, family: TITLE, spacing: 2, max: tw - 40 * u });
    txt(ctx, v, tx + 32 * u, ty + rowH * 0.82, { size: Math.round(Math.min(28 * u, rowH * 0.25)), weight: 400, color: C.muted, max: tw - 40 * u });
    ty += rowH - 14 * u;
  }
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, fy - Math.round(Math.min(W, H) * 0.04), W - pad * 2, 2);
  txt(ctx, handle, pad, fy, { size: Math.round(Math.min(W, H) * 0.032), weight: 700, family: TITLE, spacing: 1 });
  txt(ctx, 'ACTIVEZ LES NOTIFICATIONS', W - pad, fy, { size: Math.round(Math.min(W, H) * 0.025), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
}

// ---------- News : l'essentiel de l'article en points clés (images suivantes) ----------
function essentiel(ctx, W, H, d, o, page, fmt) {
  const pages = pointPages(d.points, fmt);
  const pts = pages[page - 1] || [];
  // Numéros suivis d'une image gardée à l'autre (images écartées : leurs points ne comptent pas)
  const first = keptPages(o, 'essentiel', pages.map((_, i) => i + 1)).filter((k) => k < page).reduce((n, k) => n + (pages[k - 1]?.length || 0), 0);
  background(ctx, W, H, d.color);
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const top = Math.round(Math.min(W, H) * 0.06);
  ctx.fillStyle = C.red;
  ctx.fillRect(pad, top, 10, Math.round(64 * u));
  txt(ctx, "L'ESSENTIEL", pad + 28, top + 30 * u, { size: Math.round(34 * u), weight: 800, family: TITLE, spacing: 4 });
  txt(ctx, (d.badge.label || 'ACTU F1').toUpperCase(), pad + 28, top + 62 * u, { size: Math.round(24 * u), weight: 600, family: TITLE, color: C.muted, spacing: 2 });
  if (pages.length > 1) txt(ctx, `${page} / ${pages.length}`, W - pad, top + 46 * u, { size: Math.round(34 * u), weight: 700, family: MONO, color: C.muted, align: 'right' });
  const fy = H - Math.round(Math.min(W, H) * 0.045);
  const bottom = fy - Math.round(Math.min(W, H) * 0.08);
  const colW = W - pad * 2;
  // Rappel du titre
  let y = top + 120 * u;
  const t = fitLines(ctx, d.title.toUpperCase(), colW, [56, 50, 44].map((v) => Math.round(v * u)), 2, TITLE, 800);
  t.lines.forEach((l, i) => txt(ctx, l, pad, y + t.size * 0.82 + i * t.size, { size: t.size, weight: 800, family: TITLE, color: C.muted }));
  y += t.lines.length * t.size + 26 * u;
  ctx.fillStyle = d.color ? vivid(d.color) : C.red;
  ctx.fillRect(pad, y, 90 * u, 6 * u);
  y += 50 * u;
  // Points numérotés : le plus grand corps qui tient dans la hauteur
  const numW = 92 * u;
  const gap = (44) * u;
  let pick = null;
  for (const size of [68, 62, 56, 52, 48, 44, 40, 36, 33, 30, 27].map((v) => Math.round(v * u))) {
    const lh = Math.round(size * 1.32);
    const blocks = pts.map((p) => fitLines(ctx, p, colW - numW, [size], 99, BODY, 600).lines);
    const h = blocks.reduce((n, b) => n + Math.max(b.length * lh, numW * 0.75), 0) + gap * (pts.length - 1);
    pick = { size, lh, blocks, h };
    if (h <= bottom - y) break;
  }
  if (pick) {
    y += Math.max(0, (bottom - y - pick.h) / 2.5);
    pick.blocks.forEach((lines, i) => {
      const bh = Math.max(lines.length * pick.lh, numW * 0.75);
      txt(ctx, String(first + i + 1).padStart(2, '0'), pad, y + pick.size * 0.95, { size: Math.round(pick.size * 1.35), weight: 800, family: TITLE, color: C.red });
      lines.forEach((l, k) => { if (y + (k + 1) * pick.lh <= bottom + pick.lh * 0.3) txt(ctx, l, pad + numW, y + pick.size * 0.9 + k * pick.lh, { size: pick.size, weight: 600, color: C.text }); });
      y += bh + gap;
    });
  }
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, fy - Math.round(Math.min(W, H) * 0.04), W - pad * 2, 2);
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(Math.min(W, H) * 0.032), weight: 700, family: TITLE, spacing: 1 });
  if (d.source) txt(ctx, `D'APRÈS ${d.source.toUpperCase()}`, W - pad, fy, { size: Math.round(Math.min(W, H) * 0.025), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2, max: W * 0.55 });
}

// ---------- News : photos de l'article (livrée spéciale sous tous les angles…), une par image ----------
// Photo entière (rien de coupé) sur un fond fait de la même photo assombrie
function newsPhoto(ctx, W, H, d, o, n) {
  const { image: img, credit } = d.gallery?.[n - 1] || {};
  const kept = keptPages(o, 'photo', (d.gallery || []).map((_, i) => i + 1));
  background(ctx, W, H, d.color);
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const top = Math.round(Math.min(W, H) * 0.06);
  ctx.fillStyle = C.red;
  ctx.fillRect(pad, top, 10, Math.round(64 * u));
  txt(ctx, (d.badge.label || 'ACTU F1').toUpperCase(), pad + 28, top + 30 * u, { size: Math.round(34 * u), weight: 800, family: TITLE, spacing: 4 });
  const t = fitLines(ctx, d.title.toUpperCase(), W - pad * 2 - 200 * u, [24].map((v) => Math.round(v * u)), 1, TITLE, 600);
  if (t.lines[0]) txt(ctx, t.lines[0], pad + 28, top + 62 * u, { size: t.size, weight: 600, family: TITLE, color: C.muted, spacing: 1 });
  if (kept.length > 1) txt(ctx, `${kept.indexOf(n) + 1} / ${kept.length}`, W - pad, top + 46 * u, { size: Math.round(34 * u), weight: 700, family: MONO, color: C.muted, align: 'right' });
  const fy = H - Math.round(Math.min(W, H) * 0.045);
  const y0 = top + 110 * u;
  const y1 = fy - Math.round(Math.min(W, H) * 0.08);
  if (img?.width) {
    const w = W - pad * 2; const h = y1 - y0;
    coverPhoto(ctx, img, pad, y0, w, h);
    ctx.save(); rr(ctx, pad, y0, w, h, 24); ctx.fillStyle = 'rgba(11,13,18,0.72)'; ctx.fill(); ctx.restore();
    const k = Math.min(w / img.width, h / img.height);
    const dw = img.width * k; const dh = img.height * k;
    const x = pad + (w - dw) / 2; const y = y0 + (h - dh) / 2;
    ctx.save(); rr(ctx, x, y, dw, dh, 24); ctx.clip(); ctx.drawImage(img, x, y, dw, dh); ctx.restore();
    photoCredit(ctx, credit, x, y, dw, dh, u);
  }
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, fy - Math.round(Math.min(W, H) * 0.04), W - pad * 2, 2);
  txt(ctx, o.signature || '@BenjyPaddock', pad, fy, { size: Math.round(Math.min(W, H) * 0.032), weight: 700, family: TITLE, spacing: 1 });
  if (d.source) txt(ctx, `D'APRÈS ${d.source.toUpperCase()}`, W - pad, fy, { size: Math.round(Math.min(W, H) * 0.025), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2, max: W * 0.55 });
}

export function drawSlide(canvas, slide, fmt, d, o = {}) {
  const { w, h } = FORMATS[fmt];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  paintSlide(ctx, slide, fmt, d, o);
  // Vidéo : visuel redessiné directement (plus petit, dans la zone sûre des applis) plutôt que réduit
  canvas.paint = (c) => paintSlide(c, slide, fmt, d, o);
  return canvas;
}

// Couverture des vidéos (Reels, TikTok, Shorts), plein cadre 9:16 : news → étiquette, photo et titre en très
// gros ; autres posts → leur visuel de couverture. L'essentiel tient dans la partie centrale 3:4 que montrent
// les grilles de profil (240 px rognés en haut et en bas).
export function videoCover(ctx, W, H, d, o = {}) {
  if (!d.news) { paintSlide(ctx, slidesFor(d, { fmt: 'story' }).includes('couverture') ? 'couverture' : slidesFor(d, { fmt: 'story' })[0], 'story', d, o); return; }
  const u = W / 1080;
  const pad = Math.round(W * 0.055);
  const lead = d.drivers.find((p) => o.photos?.[p.num]);
  background(ctx, W, H, lead?.color || d.color);
  // Étiquette du type de nouvelle (ou BREAKING), comme sur les visuels
  const top = Math.round(260 * u);
  if (d.breaking) breakingTag(ctx, pad + 300 * u, top, 72 * u);
  else if (d.badge.label) {
    ctx.font = `800 ${Math.round(40 * u)}px ${TITLE}`;
    const bw = ctx.measureText(d.badge.label).width + 70 * u;
    rr(ctx, pad, top, bw, 72 * u, 12 * u); ctx.fillStyle = d.badge.color; ctx.fill();
    txt(ctx, d.badge.label, pad + bw / 2, top + 50 * u, { size: Math.round(40 * u), weight: 800, family: TITLE, align: 'center', spacing: 3 });
  }
  // Photo : celle de l'article, sinon le pilote cité ; titre en très gros dessous (centré sans photo)
  const custom = d.image?.width ? d.image : null;
  let y = top + 110 * u;
  const ph = Math.round(H * 0.33);
  if (custom) { coverPhoto(ctx, custom, pad, y, W - pad * 2, ph, 28 * u); y += ph + 50 * u; }
  else if (lead) { photo(ctx, o.photos[lead.num], W * 0.04, y, W * 0.92, ph, lead.color, 0.3); y += ph + 40 * u; }
  const bottom = H - 330 * u;
  let pick = null;
  for (const size of [190, 170, 152, 136, 122, 110, 98, 88, 78].map((v) => Math.round(v * u))) {
    const t = fitLines(ctx, d.title.toUpperCase(), W - pad * 2, [size], 99, TITLE, 800);
    pick = { size, lines: t.lines };
    ctx.font = `800 ${size}px ${TITLE}`;   // chaque ligne (mot long compris) tient sans être resserrée
    if (t.lines.length * size * 0.96 <= bottom - y && t.lines.every((l) => ctx.measureText(l).width <= W - pad * 2)) break;
  }
  const lh = Math.round(pick.size * 0.96);
  if (!custom && !lead) y += Math.max(0, (bottom - y - pick.lines.length * lh) / 2);
  pick.lines.forEach((line, i) => txt(ctx, line, pad, y + pick.size * 0.82 + i * lh, { size: pick.size, weight: 800, family: TITLE, max: W - pad * 2 }));
  txt(ctx, o.signature || '@BenjyPaddock', pad, H - 270 * u, { size: Math.round(40 * u), weight: 700, family: TITLE, spacing: 1 });
}

// Visuel dessiné sur un contexte (taille du format, transformation du contexte respectée)
export function paintSlide(ctx, slide, fmt, d, o = {}) {
  const { w, h } = FORMATS[fmt];
  // X : 4 images au plus par post, le sommaire n'annonce que celles publiées
  if (slide === 'news') newsSlide(ctx, w, h, d, o, fmt);
  else if (slide === 'abonnement') follow(ctx, w, h, d, o);
  else if (slide === 'question') question(ctx, w, h, d, o);
  else if (slide === 'raceweek') raceweek(ctx, w, h, d, o);
  else if (slide === 'horaires') horaires(ctx, w, h, d, o);
  else if (slide === 'infos') infos(ctx, w, h, d, o);
  else if (slide === 'records') faits(ctx, w, h, d, o, 'Le savais-tu ?');
  else if (slide === 'editions') editions(ctx, w, h, d, o);
  else if (slide === 'topflop') topflop(ctx, w, h, d, o);
  else if (slide === 'notes') notes(ctx, w, h, d, o);
  else if (/^equipes-\d+$/.test(slide)) equipes(ctx, w, h, d, o, Number(slide.slice(8)));
  else if (slide === 'positions') positions(ctx, w, h, d, o);
  else if (slide === 'titrepilotes' || slide === 'titreecuries') titre(ctx, w, h, d, o, slide === 'titreecuries');
  else if (slide === 'titrecomment') titreComment(ctx, w, h, d, o);
  else if (slide === 'recapcover') recapCover(ctx, w, h, d, o);
  else if (/^recap-\d+$/.test(slide)) recapItem(ctx, w, h, d, o, Number(slide.slice(6)), fmt);
  else if (/^essentiel-\d+$/.test(slide)) essentiel(ctx, w, h, d, o, Number(slide.slice(10)), fmt);
  else if (/^photo-\d+$/.test(slide)) newsPhoto(ctx, w, h, d, o, Number(slide.slice(6)));
  else if (slide === 'grille') grille(ctx, w, h, d, o);
  else if (slide === 'meteo') meteo(ctx, w, h, d, o);
  else if (slide === 'champpilotes') standings(ctx, w, h, d, o, 'Pilotes', d.champ.drivers.map((r) => ({ ...r, label: r.last.toUpperCase() })));
  else if (slide === 'champecuries') standings(ctx, w, h, d, o, 'Constructeurs', d.champ.teams.map((r) => ({ ...r, label: r.name.toUpperCase() })));
  else if (slide === 'duels') duels(ctx, w, h, d, o);
  else if (slide === 'flash') flash(ctx, w, h, d, o);
  else if (slide === 'couverture') cover(ctx, w, h, d, o, (o.slides ? o.slides.filter((s) => s !== 'couverture' && s !== 'abonnement' && s !== 'question') : slidesFor(d).slice(1)).slice(0, fmt === 'x' ? 3 : undefined), fmt);
  else if (slide === 'vainqueur') hero(ctx, w, h, d, o, 'VAINQUEUR');
  else if (slide === 'pole') hero(ctx, w, h, d, o, 'POLE POSITION');
  else if (slide === 'meilleurtemps') hero(ctx, w, h, d, o, 'MEILLEUR TEMPS');
  else if (slide === 'podium') podium(ctx, w, h, d, o);
  else if (slide === 'classement') classement(ctx, w, h, d, o);
  else if (slide === 'faits') faits(ctx, w, h, d, o);
  else if (slide === 'championnat' && d.champ) championnat(ctx, w, h, d, o);
}
