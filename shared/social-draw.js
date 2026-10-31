// Visuels des posts pour les réseaux sociaux (mode créateur), dessinés sur un canvas aux formats
// des réseaux : Instagram / Facebook (1080 × 1350), story (1080 × 1920), X / Threads / Bluesky
// (même format que le carrousel Instagram : le carrousel de X recadre les images plus larges que hautes).
// Les textes des visuels sont en français (contenu publié).

import { teammateDuels, FLASH_KINDS, GRID_SOURCE } from './social-more.js';
import { teamLogoPath } from './team-logos.js';
import { followReason, questionFor } from './social-follow.js';
import { appSlides, appPage, plain } from './social-app.js';
import { TV_TITLE, tvBackground, tvFrame, tvFooter, tvCover, tvPodium, tvClassement, slant } from './social-draw-tv.js';
import { horaires, infos, editions, topflop, notes, equipes, positions, recapCover, recapItem, raceweek, titre, titreComment, titleBlocks } from './social-draw-season.js';

export const FORMATS = {
  ig: { w: 1080, h: 1350, name: 'instagram' },
  story: { w: 1080, h: 1920, name: 'story' },
  x: { w: 1080, h: 1350, name: 'x' },
};

export const C = { bg: '#06070b', bg2: '#11141c', panel: 'rgba(255,255,255,0.055)', line: 'rgba(255,255,255,0.12)', text: '#f5f7fb', muted: '#aeb6c6', red: '#ff1e0f', gold: '#f2c94c', silver: '#d3d8e2', bronze: '#e0955a', green: '#3ddc84' };
const SAIRA = '"Saira Condensed", "Titillium Web", sans-serif';
// Police des titres : Barlow Condensed le temps d'un dessin en style « Télé premium » (styled)
export let TITLE = SAIRA;
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
  if (list.length < 2 || d.post === 'app') return list;   // compte Paddock Live : ni question ni « Abonnez-vous »
  const end = [...(question ? ['question'] : []), ...(follow ? ['abonnement'] : [])];
  return [...(fmt === 'x' && end.length ? list.slice(0, 4 - end.length) : list), ...end];
}
function baseSlides(d, fmt) {
  if (d.post === 'app') return appSlides(d);
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
  // Essais et qualifs : vitesses de pointe et meilleurs secteurs, quand la F1 les a publiés
  const timing = [...(d.speeds ? ['vitesses'] : []), ...(d.sectors ? ['secteurs'] : [])];
  let list = ['meilleurtemps', 'podium', 'classement', ...timing, ...(d.facts.length ? ['faits'] : [])];
  const duels = teammateDuels(d).length >= 3 ? ['duels'] : [];
  // Course complète (10 pilotes au moins avec leur place de départ, leurs relais) : grille → arrivée, stratégie
  const data = [...(d.rows.filter((r) => r.grid).length >= 10 ? ['remontees'] : []), ...(d.rows.filter((r) => r.stints?.length).length >= 10 ? ['strategie'] : [])];
  if (d.kind === 'race') list = ['vainqueur', 'podium', 'classement', ...data, ...duels, 'faits', ...(d.champ ? ['championnat'] : [])];
  else if (d.kind === 'quali') list = ['pole', 'podium', 'classement', ...timing, ...duels, ...(d.facts.length ? ['faits'] : [])];
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
  if (d.post === 'app') return { ...d, pages: d.pages.filter((_, i) => !skip.has(`app-${i + 1}`)) };
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
export const SLIDE_NAMES = { grille: 'Grille de départ', meteo: 'Météo et pneus', champpilotes: 'Championnat pilotes', champecuries: 'Championnat constructeurs', flash: 'Flash', duels: 'Duels entre coéquipiers', news: 'News', couverture: 'Couverture', vainqueur: 'Vainqueur', pole: 'Pole position', meilleurtemps: 'Meilleur temps', podium: 'Podium', classement: 'Classement', remontees: 'Grille → arrivée', strategie: 'Stratégie des pneus', vitesses: 'Vitesses de pointe', secteurs: 'Meilleurs secteurs', faits: 'Faits marquants', championnat: 'Championnat', abonnement: 'Abonnez-vous', question: 'Question', essentiel: "L'essentiel", photo: 'Photo', raceweek: 'Race Week', horaires: 'Horaires', infos: 'Pneus et météo', records: 'Records', editions: 'Éditions précédentes', topflop: 'Tops et flops', notes: 'Toutes les notes', equipes: 'Duels par écurie', positions: 'Positions tour par tour', recapcover: 'La semaine', recap: 'Info', titrepilotes: 'Titre pilotes', titreecuries: 'Titre constructeurs', titrecomment: 'Comment être sacré', app: 'Page' };
export const slideName = (s) => SLIDE_NAMES[s] || SLIDE_NAMES[String(s).replace(/-\d+$/, '')] || s;
// Texte alternatif d'une image publiée (lecteurs d'écran) : ce qu'elle montre, avec le classement s'il y en a un
const RANKED = { vainqueur: 3, pole: 3, meilleurtemps: 3, podium: 3, classement: 10, grille: 10 };
export function slideAlt(d, slide) {
  const name = slideName(slide);
  if (d.post === 'app') { const p = d.pages?.[Number(String(slide).slice(4)) - 1] || {}; return [plain(p.title), String(p.text || '').trim()].filter(Boolean).join('. ').slice(0, 500) || name; }
  if (d.news) return `${name} : ${d.title}${d.summary ? `. ${d.summary}` : ''}`.slice(0, 500);
  const what = [d.label, d.gp].filter(Boolean).join(' · ');
  const full = (r) => [r.first, r.last].filter(Boolean).join(' ');
  if (slide === 'vitesses' && d.speeds) return `${name} — ${what} (${d.speeds.label.toLowerCase()}) : ${d.speeds.rows.slice(0, 10).map((r, i) => `${i + 1}. ${full(r)} ${r.kmh} km/h`).join(', ')}`.slice(0, 500);
  if (slide === 'secteurs' && d.sectors) return `${name} — ${what} : ${d.sectors.map((l, i) => `secteur ${i + 1}, ${full(l[0])} en ${l[0].time}`).join(' ; ')}${d.ideal ? ` ; tour idéal ${d.ideal.time}` : ''}`.slice(0, 500);
  const n = RANKED[slide] && d.rows?.[0]?.pos ? RANKED[slide] : 0;
  const top = n ? ` : ${d.rows.slice(0, n).map((r) => `${r.pos}. ${full(r)}${r.team ? ` (${r.team})` : ''}`).join(', ')}` : '';
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
// italic : penché vers l'avant (titres « vitesse ») ; stroke : contour seul, de cette épaisseur
export function txt(ctx, text, x, y, { size = 32, weight = 400, family = BODY, color = C.text, align = 'left', max = 0, base = 'alphabetic', spacing = 0, italic = false, stroke = 0 } = {}) {
  // Espacement des lettres (fixe, en px) compté dans la largeur permise : sinon le texte espacé déborde
  const s = max ? fit(ctx, text, Math.max(1, max - spacing * text.length), size, weight, family) : size;
  ctx.font = `${weight} ${s}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.save();
  ctx.translate(x, y);
  if (italic) ctx.transform(1, 0, -SKEW, 1, 0, 0);
  if (stroke) { ctx.strokeStyle = color; ctx.lineWidth = stroke; ctx.lineJoin = 'round'; ctx.strokeText(text, 0, 0); } else ctx.fillText(text, 0, 0);
  ctx.restore();
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  return s;
}
export const SKEW = 0.16;

// Carte « verre » : fond légèrement clair, reflet en haut, liseré fin ; tint : couleur (écurie) qui
// teinte la carte depuis la gauche
export function card(ctx, x, y, w, h, r, { tint = null, strong = false, light = false } = {}) {
  ctx.save();
  rr(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, `rgba(255,255,255,${strong ? 0.11 : 0.075})`); g.addColorStop(1, `rgba(255,255,255,${strong ? 0.05 : 0.03})`);
  ctx.fillStyle = g; ctx.fill();
  if (tint) {
    const t = ctx.createLinearGradient(x, y, x + Math.min(w, 520), y);
    t.addColorStop(0, alpha(hexOf(tint), light ? 0.2 : 0.42)); t.addColorStop(1, alpha(hexOf(tint), 0));
    ctx.fillStyle = t; ctx.fill();
  }
  const b = ctx.createLinearGradient(x, y, x, y + h);
  b.addColorStop(0, 'rgba(255,255,255,0.22)'); b.addColorStop(0.5, 'rgba(255,255,255,0.06)'); b.addColorStop(1, 'rgba(255,255,255,0.03)');
  ctx.strokeStyle = b; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}
// Couleur rgb(...) de vivid() remise en #rrggbb (pour alpha)
const hexOf = (c) => {
  const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(c || '');
  return m ? `#${m.slice(1).map((v) => Number(v).toString(16).padStart(2, '0')).join('')}` : c;
};
// Pastille arrondie (étiquette) : renvoie sa largeur
export function pill(ctx, label, x, y, h, { bg = C.red, color = '#fff', align = 'left', outline = false, dot = false } = {}) {
  const size = Math.round(h * 0.52);
  ctx.font = `800 ${size}px ${TITLE}`;
  const sp = size * 0.12;
  const w = ctx.measureText(label).width + sp * label.length + h * (dot ? 1.25 : 0.9);
  const x0 = align === 'right' ? x - w : x;
  if (tv) slant(ctx, x0, y, w, h, h * 0.22); else rr(ctx, x0, y, w, h, h / 2);
  if (outline) { ctx.strokeStyle = bg; ctx.lineWidth = 2; ctx.stroke(); } else { ctx.fillStyle = bg; ctx.fill(); }
  if (dot) { ctx.fillStyle = typeof dot === 'string' ? dot : outline ? bg : color; ctx.beginPath(); ctx.arc(x0 + h * 0.5, y + h / 2, h * 0.13, 0, Math.PI * 2); ctx.fill(); }
  txt(ctx, label, x0 + (dot ? h * 0.82 : h * 0.45), y + h * 0.7, { size, weight: 800, family: TITLE, color, spacing: sp });
  return w;
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
  const c = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(hex || '');   // couleur éclaircie par vivid()
  if (c) return `rgba(${c[1]},${c[2]},${c[3]},${a})`;
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

// Fond : noir profond, deux halos de la couleur (écurie, type de news) en haut à droite et en bas à
// gauche, un trait de lumière oblique et un grain fin (rendu « photo », sans aplats)
export function background(ctx, W, H, accent) {
  if (tv) { tvBackground(ctx, W, H, accent); return; }
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, C.bg2);
  g.addColorStop(1, C.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = (x, y, r, a) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, alpha(accent, a)); rg.addColorStop(0.55, alpha(accent, a * 0.32)); rg.addColorStop(1, alpha(accent, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  };
  if (accent) { glow(W * 0.92, H * 0.08, Math.max(W, H) * 0.75, 0.42); glow(W * 0.02, H * 0.98, Math.max(W, H) * 0.5, 0.16); }
  // Trait de lumière oblique
  ctx.save();
  ctx.translate(W * 0.62, 0); ctx.rotate(0.38);
  const band = ctx.createLinearGradient(-W * 0.12, 0, W * 0.12, 0);
  band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(255,255,255,0.045)'); band.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = band; ctx.fillRect(-W * 0.12, -H, W * 0.24, H * 3);
  ctx.restore();
  // Assombri en bas (lisibilité du pied)
  const v = ctx.createLinearGradient(0, H * 0.7, 0, H);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H);
}
// Grain : motif de bruit tiré une fois (le même à chaque image d'une vidéo, sans scintillement)
let noise = null;
export function grain(ctx, W, H) {
  if (noise === null) {
    noise = false;
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(160, 160) : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: 160, height: 160 }) : null;
    if (c) {
      const x = c.getContext('2d');
      const img = x.createImageData(160, 160);
      let seed = 7;
      for (let i = 0; i < img.data.length; i += 4) { seed = (seed * 16807) % 2147483647; const v = seed % 255; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 10; }
      x.putImageData(img, 0, 0);
      noise = c;
    }
  }
  if (!noise) return;
  const pat = ctx.createPattern(noise, 'repeat');
  if (!pat) return;
  ctx.save(); ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.restore();
}

// Page du carrousel en cours de dessin (paintSlide) : points de progression dans le pied
let page = null;
// Story (image ou vidéo des visuels) : Instagram pose sa barre de progression et le nom du compte en haut (~230 px),
// le champ « Envoyer un message » en bas (~300 px), comme Reels, TikTok et Shorts leur interface ; rien d'important
// dessous.
let safe = false;
// Style « Télé premium » choisi dans le Studio (o.style = 'tv') : fond, en-tête, pied, pastilles et visuels de
// social-draw-tv.js, titres en Barlow Condensed
export let tv = false;
// Dessin (image, vidéo) dans le style choisi
export function styled(o, draw) {
  tv = o?.style === 'tv';
  TITLE = tv ? TV_TITLE : SAIRA;
  try { return draw(); } finally { tv = false; TITLE = SAIRA; }
}
export const topY = (W, H) => (safe ? 230 : Math.round(Math.min(W, H) * 0.06));
export const footY = (W, H) => H - (safe ? 300 : Math.round(Math.min(W, H) * 0.045));
// Points de progression du carrousel, centrés sur x
export function pageDots(ctx, x, y, u) {
  if (!page || page.total < 2) return;
  const r = 8 * u; const gap = 12 * u; const long = 44 * u;
  let cx = x - ((page.total - 1) * (r * 2 + gap) + long) / 2;
  for (let i = 1; i <= page.total; i++) {
    const w = i === page.n ? long : r * 2;
    rr(ctx, cx, y - r, w, r * 2, r);
    ctx.fillStyle = i === page.n ? C.red : 'rgba(255,255,255,0.28)'; ctx.fill();
    cx += w + gap;
  }
}
// Pied commun : signature (marque rouge) à gauche, progression du carrousel au milieu ; renvoie la
// ligne de base
export function footer(ctx, W, H, o, { dots = true } = {}) {
  const m = Math.min(W, H);
  const u = m / 1080;
  const pad = Math.round(W * 0.055);
  if (tv) return tvFooter(ctx, W, H, o, '', dots);
  const fy = footY(W, H);
  ctx.fillStyle = C.red;
  rr(ctx, pad, fy - 27 * u, 8 * u, 30 * u, 3 * u); ctx.fill();
  txt(ctx, o.signature || '@BenjyPaddock', pad + 22 * u, fy, { size: Math.round(m * 0.032), weight: 700, family: TITLE, color: C.text, spacing: 1 });
  if (dots) pageDots(ctx, W / 2, fy - 11 * u, u);
  return fy;
}
// En-tête des images sans Grand Prix (couverture, news, abonnement…) : pastille rouge et sous-titre
export function kicker(ctx, x, y, u, label, sub) {
  const w = pill(ctx, label, x, y, 54 * u, { bg: C.red, dot: '#fff' });
  if (sub) txt(ctx, sub, x + w + 20 * u, y + 37 * u, { size: Math.round(26 * u), weight: 700, family: TITLE, color: C.muted, spacing: 2.5, max: 1080 * u - w - x * 2 - 20 * u });
  return w;
}

// En-tête : drapeau, Grand Prix (penché), séance et date, titre de l'image dans une pastille ; pied :
// signature et progression du carrousel
export function frame(ctx, W, H, d, o, title) {
  const m = Math.min(W, H);
  const u = m / 1080;
  trackMark(ctx, W, H, o.shape);
  if (tv) return tvFrame(ctx, W, H, d, o, title);
  const pad = Math.round(W * 0.055);
  const top = topY(W, H);
  let x = pad;
  if (o.flag) {
    const fh = Math.round(m * 0.042);
    const fw = Math.round(fh * o.flag.width / o.flag.height);
    rr(ctx, x, top + 6 * u, fw, fh, 8 * u); ctx.save(); ctx.clip(); ctx.drawImage(o.flag, x, top + 6 * u, fw, fh); ctx.restore();
    rr(ctx, x, top + 6 * u, fw, fh, 8 * u); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    x += fw + 18 * u;
  } else { ctx.fillStyle = C.red; rr(ctx, x, top + 6 * u, 10 * u, m * 0.042, 3 * u); ctx.fill(); x += 28 * u; }
  const s1 = Math.round(m * 0.05);
  // Place prise à droite par la pastille du titre : le nom du Grand Prix s'arrête avant
  const ph = Math.round(52 * u);
  let tw = 0;
  if (title) { ctx.font = `800 ${Math.round(ph * 0.52)}px ${TITLE}`; tw = ctx.measureText(title.toUpperCase()).width + title.length * ph * 0.06 + ph * 1.25 + 24 * u; }
  txt(ctx, d.gp.toUpperCase(), x, top + s1 * 0.92, { size: s1, weight: 800, family: TITLE, max: W - x - pad - tw, italic: true });
  const sub = [d.label, d.date, d.circuit].filter(Boolean).join('  ·  ').toUpperCase();
  txt(ctx, sub, pad, top + s1 * 0.92 + Math.round(s1 * 0.95), { size: Math.round(s1 * 0.5), weight: 600, family: TITLE, color: C.muted, max: W - pad * 2, spacing: 2 });
  if (title) pill(ctx, title.toUpperCase(), W - pad, top + 2 * u, ph, { bg: 'rgba(255,255,255,0.09)', color: C.text, align: 'right', dot: C.red });
  // Pied
  const fy = footer(ctx, W, H, o);
  if (!d.final) txt(ctx, 'RÉSULTATS PROVISOIRES', W - pad, fy, { size: Math.round(m * 0.025), weight: 700, family: TITLE, color: C.gold, align: 'right', spacing: 2 });
  return { pad, top: top + Math.round(m * 0.15), bottom: fy - Math.round(m * 0.06) };
}

// Tracé du circuit en filigrane, grand et décalé à droite : chaque Grand Prix a son fond
export function trackMark(ctx, W, H, shape) {
  if (!shape?.pts?.length) return;
  const u = Math.min(W, H) / 1080;
  const bw = W * 0.95; const bh = H * 0.62;
  const s = Math.min(bw / shape.w, bh / shape.h);
  const ox = W * 0.3 + (bw - shape.w * s) / 2; const oy = H * 0.2 + (bh - shape.h * s) / 2;
  ctx.save();
  ctx.beginPath();
  shape.pts.forEach(([x, y], i) => { if (i) ctx.lineTo(ox + x * s, oy + y * s); else ctx.moveTo(ox + x * s, oy + y * s); });
  ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.055)'; ctx.lineWidth = 34 * u; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 4 * u; ctx.stroke();
  ctx.restore();
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
// Grand nom en contour, très pâle, derrière la photo (effet affiche)
function ghost(ctx, text, x, y, size, maxW, align = 'center') {
  ctx.save();
  ctx.globalAlpha = 0.07;
  txt(ctx, text, x, y, { size, weight: 800, family: TITLE, align, italic: true, max: maxW });
  ctx.globalAlpha = 0.22;
  txt(ctx, text, x, y, { size, weight: 800, family: TITLE, align, italic: true, stroke: Math.max(2, size / 80), max: maxW });
  ctx.restore();
}

function hero(ctx, W, H, d, o, word) {
  const w = d.rows[0];
  const col = vivid(w.color);
  const u = Math.min(W, H) / 1080;
  background(ctx, W, H, w.color);
  const f = frame(ctx, W, H, d, o, '');
  // Bloc du nom calé en bas ; au-dessus, le portrait en grand, calé à droite, dont le bas passe sous le nom
  const stTop = f.bottom - 96 * u;
  const teamC = stTop - 56 * u;
  const lastB = teamC - 46 * u;
  const firstB = lastB - 160 * u;
  const pillY = firstB - 126 * u;
  const pb = pillY + 270 * u;   // bas de la photo
  const S = Math.min(W * 0.92, pb - (f.top - 40 * u));
  ghost(ctx, w.last.toUpperCase(), W / 2, pb - S * 0.12, Math.round((H > 1600 ? 340 : 300) * u), W * 1.15);
  photo(ctx, o.photos?.[w.num], W - S + 40 * u, pb - S, S, S, w.color, 0.34);
  pill(ctx, word, f.pad, pillY, 60 * u, { bg: C.red, dot: '#fff' });
  // Ombre douce : le nom reste lisible là où il passe sur la photo
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 36 * u;
  txt(ctx, w.first, f.pad, firstB, { size: Math.round(54 * u), weight: 600 });
  txt(ctx, w.last.toUpperCase(), f.pad - 6 * u, lastB, { size: Math.round(176 * u), weight: 800, family: TITLE, max: W - f.pad * 2, italic: true });
  ctx.restore();
  const lw = teamLogo(ctx, o, w.team, f.pad, teamC, 50 * u);
  if (!lw) { ctx.fillStyle = col; rr(ctx, f.pad, teamC - 22 * u, 10 * u, 44 * u, 4 * u); ctx.fill(); }
  txt(ctx, w.team, f.pad + (lw ? lw + 20 * u : 28 * u), teamC + 14 * u, { size: Math.round(38 * u), weight: 600, color: C.muted, max: W - f.pad * 2 - 30 * u });
  stats(ctx, d, f.pad, stTop, W - f.pad * 2, 3, u);
}

function stats(ctx, d, x, y, w, perRow, u = 1) {
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
  const gap = 16 * u;
  const h = 96 * u;
  const cw = perRow === 1 ? w : (w - gap * (n - 1)) / n;
  items.slice(0, perRow === 1 ? 3 : n).forEach(([k, v], i) => {
    const cx = perRow === 1 ? x : x + i * (cw + gap);
    const cy = perRow === 1 ? y + i * (h + 12 * u) : y;
    const ww = perRow === 1 ? Math.min(cw, 420 * u) : cw;
    card(ctx, cx, cy, ww, h, 22 * u);
    txt(ctx, k.toUpperCase(), cx + 24 * u, cy + 36 * u, { size: Math.round(30 * u), weight: 700, family: TITLE, color: C.muted, spacing: 2.5 });
    txt(ctx, v, cx + 24 * u, cy + 82 * u, { size: Math.round(42 * u), weight: 800, family: TITLE, max: ww - 48 * u, italic: true });
  });
}

function podium(ctx, W, H, d, o) {
  background(ctx, W, H, d.rows[0].color);
  const f = frame(ctx, W, H, d, o, d.kind === 'race' ? 'Podium' : 'Top 3');
  const u = Math.min(W, H) / 1080;
  const top3 = d.rows.slice(0, 3);
  const order = [1, 0, 2].filter((i) => top3[i]);
  const colW = (W - f.pad * 2) / 3;
  const baseY = f.bottom - 30 * u;
  const r = Math.min(H > 1600 ? 175 : 125, colW * (H > 1600 ? 0.52 : 0.42));
  // Marches réduites si besoin : la photo du vainqueur (au-dessus de la plus haute) reste sous l'en-tête
  const k0 = Math.min(1, (baseY - f.top - 190 - 2 * r) / (H > 1600 ? 800 : 380));
  const heights = (H > 1600 ? [800, 670, 560] : [380, 300, 240]).map((h) => h * k0);
  order.forEach((i, k) => {
    const p = top3[i];
    const cx = f.pad + colW * k + colW / 2;
    const h = heights[i];
    const y0 = baseY - h;
    const bw = colW * 0.9;
    // Marche : carte teintée de l'écurie, liseré de la médaille en haut
    ctx.save();
    rr(ctx, cx - bw / 2, y0, bw, h, 26 * u); ctx.clip();
    const g = ctx.createLinearGradient(0, y0, 0, baseY);
    g.addColorStop(0, alpha(p.color, 0.62)); g.addColorStop(0.6, alpha(p.color, 0.16)); g.addColorStop(1, alpha(p.color, 0.04));
    ctx.fillStyle = g; ctx.fillRect(cx - bw / 2, y0, bw, h);
    ctx.fillStyle = MEDAL[i]; ctx.fillRect(cx - bw / 2, y0, bw, 6 * u);
    ctx.restore();
    card(ctx, cx - bw / 2, y0, bw, h, 26 * u);
    txt(ctx, String(i + 1), cx, y0 + h * 0.52 + h * 0.17, { size: Math.round(h * 0.5), weight: 800, family: TITLE, color: MEDAL[i], align: 'center', italic: true });
    teamLogo(ctx, o, p.team, cx, y0 + 52 * u, 54 * u, 'center', colW * 0.5);
    const tt = y0 - 172;
    const cy = tt - 18 - r;
    driverPhoto(ctx, o.photos?.[p.num], cx, cy, r, p.color, p.tla);
    txt(ctx, p.first, cx, tt + 40, { size: 38, weight: 600, align: 'center', max: colW - 20, color: C.muted });
    txt(ctx, p.last.toUpperCase(), cx, tt + 100, { size: 62, weight: 800, family: TITLE, align: 'center', max: colW - 16, italic: true });
    txt(ctx, i === 0 ? (d.kind !== 'race' ? p.gap || p.team : p.team) : p.gap || p.team, cx, tt + 150, { size: 36, weight: 700, family: TITLE, color: i === 0 ? C.text : C.muted, align: 'center', max: colW - 16 });
  });
}

function classement(ctx, W, H, d, o) {
  background(ctx, W, H, d.rows[0]?.color);
  const f = frame(ctx, W, H, d, o, d.kind === 'quali' ? 'Grille' : 'Classement');
  const rows = d.rows.slice(0, 22);
  // Deux colonnes sauf en story (assez haute pour une seule) : textes lisibles sur un téléphone
  const cols = H > 1600 || rows.length <= 12 ? 1 : 2;
  const gapC = 20;
  const per = Math.ceil(rows.length / cols);
  const colW = (W - f.pad * 2 - (cols - 1) * gapC) / cols;
  const rowH = Math.min(cols === 1 ? 76 : 92, (f.bottom - f.top + 20) / per);
  const fs = Math.round(Math.min(rowH * 0.5, cols === 1 ? 38 : 34));
  const names = colW > 620;
  const laps = d.kind === 'practice' && d.rows.some((x) => x.laps);
  rows.forEach((r, i) => {
    const c = Math.floor(i / per);
    const x = f.pad + c * (colW + gapC);
    const y = f.top - 10 + (i % per) * rowH;
    const h = rowH - 8;
    card(ctx, x, y, colW, h, h * 0.32, { tint: r.out ? null : r.color, strong: i < 3, light: i >= 3 });
    const mid = y + h / 2 + fs * 0.34;
    // Place : pastille de la médaille sur le podium
    const px = x + fs * 1.05;
    if (i < 3) { ctx.fillStyle = MEDAL[i]; ctx.beginPath(); ctx.arc(px, y + h / 2, fs * 0.62, 0, Math.PI * 2); ctx.fill(); }
    txt(ctx, String(r.pos), px, mid, { size: Math.round(fs * (i < 3 ? 0.85 : 1)), weight: 800, family: TITLE, color: i < 3 ? C.bg : C.text, align: 'center', italic: i >= 3 });
    const slot = fs * 1.2;
    const lx = x + fs * 2.05;
    teamLogo(ctx, o, r.team, lx + slot / 2, y + h / 2, fs * 0.9, 'center', slot);
    const tx = lx + slot + fs * 0.35;
    txt(ctx, r.tla, tx, mid, { size: fs, weight: 800, family: TITLE, color: r.out ? C.muted : C.text, italic: true });
    if (names) txt(ctx, r.last, tx + fs * 2.6, mid, { size: Math.round(fs * 0.86), weight: 600, color: C.muted, max: colW * 0.3 });
    const right = x + colW - fs * 0.6;
    if (d.kind === 'race' && r.points) txt(ctx, `+${r.points}`, right, mid, { size: Math.round(fs * 0.8), weight: 800, family: TITLE, color: C.green, align: 'right' });
    // Essais : nombre de tours de chaque pilote à droite, écart juste avant
    if (laps) txt(ctx, r.laps ? `${r.laps} tours` : '', right, mid, { size: Math.round(fs * 0.72), weight: 600, color: C.muted, align: 'right' });
    const gx = d.kind === 'race' ? right - fs * 2.4 : laps ? right - fs * 3.9 : right;
    txt(ctx, r.out ? 'ABANDON' : r.gap || (i === 0 && d.kind === 'race' ? 'VAINQUEUR' : ''), gx, mid, { size: Math.round(fs * 0.8), weight: 700, family: r.out || (i === 0 && d.kind === 'race') ? TITLE : MONO, color: r.out ? C.red : i === 0 ? C.gold : C.text, align: 'right', spacing: r.out || (i === 0 && d.kind === 'race') ? 1.5 : 0 });
    if (d.kind === 'quali' && r.knockedOut) txt(ctx, `${names ? 'ÉLIMINÉ ' : ''}${d.sprint ? 'SQ' : 'Q'}${r.koPart}`, names ? x + colW * 0.6 : tx + fs * 2.3, mid, { size: Math.round(fs * 0.62), weight: 700, family: TITLE, color: C.red, spacing: 1 });
  });
}

// Grille → arrivée : place de départ à gauche, d'arrivée à droite, une ligne par pilote (couleur de l'écurie) ;
// remontées et chutes de 3 places ou plus en couleur pleine, les autres en retrait
function remontees(ctx, W, H, d, o) {
  background(ctx, W, H, d.rows[0]?.color);
  const f = frame(ctx, W, H, d, o, 'Grille → arrivée');
  const rows = d.rows.filter((r) => r.grid).slice(0, 22);
  const n = Math.max(rows.length, ...rows.map((r) => r.grid));
  const top = f.top + 40;
  const rowH = (f.bottom - top) / n;
  const fs = Math.round(Math.min(rowH * 0.62, 34));
  const lw = fs * 4.2;
  const xL = f.pad + lw;
  const xR = W - f.pad - lw - fs * 1.6;
  const Y = (p) => top + (p - 0.5) * rowH;
  txt(ctx, 'DÉPART', xL - 12, f.top + 6, { size: 26, weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 3 });
  txt(ctx, 'ARRIVÉE', xR + 12, f.top + 6, { size: 26, weight: 700, family: TITLE, color: C.muted, spacing: 3 });
  // Lignes en retrait d'abord, les grands écarts par-dessus
  const big = (r) => r.out || Math.abs(r.delta || 0) >= 3;
  [...rows].sort((a, b) => big(a) - big(b)).forEach((r) => {
    const y0 = Y(r.grid); const y1 = Y(r.pos);
    const c = vivid(r.color);
    ctx.save();
    ctx.globalAlpha = big(r) ? 0.95 : 0.35;
    ctx.strokeStyle = c; ctx.lineWidth = big(r) ? 5 : 3; ctx.lineCap = 'round';
    if (r.out) ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.moveTo(xL, y0); ctx.bezierCurveTo((xL + xR) / 2, y0, (xL + xR) / 2, y1, xR, y1); ctx.stroke();
    ctx.restore();
    for (const [x, y] of [[xL, y0], [xR, y1]]) { ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); }
  });
  rows.forEach((r) => {
    const mid = (p) => Y(p) + fs * 0.34;
    txt(ctx, String(r.grid), f.pad + fs * 1.1, mid(r.grid), { size: Math.round(fs * 0.8), weight: 700, family: TITLE, color: C.muted, align: 'right' });
    txt(ctx, r.tla, xL - 20, mid(r.grid), { size: fs, weight: 800, family: TITLE, align: 'right', italic: true, color: big(r) ? C.text : C.muted });
    txt(ctx, r.tla, xR + 20, mid(r.pos), { size: fs, weight: 800, family: TITLE, italic: true, color: r.pos <= 3 ? MEDAL[r.pos - 1] : big(r) ? C.text : C.muted });
    const tag = r.out ? 'AB' : r.delta > 0 ? `+${r.delta}` : r.delta < 0 ? String(r.delta) : '=';
    txt(ctx, tag, W - f.pad, mid(r.pos), { size: Math.round(fs * 0.8), weight: 800, family: TITLE, align: 'right', color: r.out ? C.red : r.delta > 0 ? C.green : r.delta < 0 ? '#ff6b6b' : C.muted });
  });
}

// Stratégie des pneus : une bande par pilote (ordre d'arrivée), un segment par relais à la couleur du composé
const TYRE = { SOFT: ['#ff3b3b', 'T'], MEDIUM: ['#ffd12e', 'M'], HARD: ['#eef0f4', 'D'], INTERMEDIATE: ['#3ddc84', 'I'], WET: ['#3d8bff', 'P'] };
const TYRE_NAME = { SOFT: 'Tendres', MEDIUM: 'Médiums', HARD: 'Durs', INTERMEDIATE: 'Intermédiaires', WET: 'Pluie' };
function strategie(ctx, W, H, d, o) {
  background(ctx, W, H, d.rows[0]?.color);
  const f = frame(ctx, W, H, d, o, 'Stratégie');
  const rows = d.rows.filter((r) => r.stints?.length).slice(0, 22);
  const total = Math.max(d.laps || 0, ...rows.map((r) => r.stints.reduce((n, s) => n + s.laps, 0)), 1);
  // Légende : composés vus dans la course
  const used = Object.keys(TYRE).filter((c) => rows.some((r) => r.stints.some((s) => s.c === c)));
  let lx = f.pad;
  used.forEach((c) => {
    ctx.beginPath(); ctx.arc(lx + 14, f.top + 2, 14, 0, Math.PI * 2); ctx.fillStyle = TYRE[c][0]; ctx.fill();
    txt(ctx, TYRE[c][1], lx + 14, f.top + 11, { size: 22, weight: 800, family: TITLE, color: C.bg, align: 'center' });
    ctx.font = `700 26px ${TITLE}`;
    txt(ctx, TYRE_NAME[c].toUpperCase(), lx + 38, f.top + 11, { size: 26, weight: 700, family: TITLE, color: C.muted, spacing: 1.5 });
    lx += 38 + ctx.measureText(TYRE_NAME[c].toUpperCase()).width + 34;
  });
  const top = f.top + 44;
  const rowH = (f.bottom - top) / rows.length;
  const fs = Math.round(Math.min(rowH * 0.56, 32));
  const bx = f.pad + fs * 3.6;
  const bw = W - f.pad - bx;
  const bh = Math.min(rowH * 0.66, 44);
  rows.forEach((r, i) => {
    const cy = top + (i + 0.5) * rowH;
    txt(ctx, String(r.pos), f.pad + fs * 0.9, cy + fs * 0.34, { size: Math.round(fs * 0.8), weight: 700, family: TITLE, color: C.muted, align: 'right' });
    txt(ctx, r.tla, f.pad + fs * 1.3, cy + fs * 0.34, { size: fs, weight: 800, family: TITLE, italic: true, color: r.out ? C.muted : C.text });
    let x = bx;
    r.stints.forEach((s) => {
      const w = (s.laps / total) * bw;
      if (w <= 0) return;
      rr(ctx, x + 1.5, cy - bh / 2, Math.max(w - 3, 2), bh, Math.min(bh / 2, 10)); ctx.fillStyle = TYRE[s.c][0]; ctx.fill();
      if (w > fs * 1.9) txt(ctx, String(s.laps), x + w / 2, cy + fs * 0.3, { size: Math.round(fs * 0.72), weight: 800, family: TITLE, color: C.bg, align: 'center' });
      x += w;
    });
    if (r.out) txt(ctx, 'ABANDON', x + 14, cy + fs * 0.3, { size: Math.round(fs * 0.66), weight: 800, family: TITLE, color: C.red, spacing: 1.5 });
  });
}

// Barre d'un pilote (vitesses, secteurs) : couleur de l'écurie, plus vive vers le bout ; oblique en style « Télé »
function bar(ctx, x, y, w, h, color, strong) {
  if (w <= 0) return;
  const c = vivid(color);
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, alpha(c, strong ? 0.45 : 0.2)); g.addColorStop(1, alpha(c, strong ? 1 : 0.85));
  if (tv) slant(ctx, x, y, w, h, Math.min(h * 0.35, w)); else rr(ctx, x, y, w, h, Math.min(h * 0.3, w / 2));
  ctx.fillStyle = g; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x + (tv ? h * 0.35 : h * 0.3), y, Math.max(0, w - h * 0.6), Math.max(1, h * 0.06));
}
// Ligne d'un classement en barres : place, trait de l'écurie, trigramme ; renvoie la ligne de base du texte
function barRow(ctx, x, cy, fs, i, r, u) {
  const mid = cy + fs * 0.34;
  txt(ctx, String(i + 1), x + fs * 0.95, mid, { size: Math.round(fs * 0.8), weight: 800, family: TITLE, color: i < 3 ? MEDAL[i] : C.muted, align: 'right', italic: true });
  ctx.fillStyle = vivid(r.color);
  if (tv) slant(ctx, x + fs * 1.25, cy - fs * 0.4, 6 * u, fs * 0.8, 3 * u); else rr(ctx, x + fs * 1.25, cy - fs * 0.4, 5 * u, fs * 0.8, 2 * u);
  ctx.fill();
  txt(ctx, r.tla, x + fs * 1.25 + 14 * u, mid, { size: fs, weight: 800, family: TITLE, italic: true });
  return mid;
}
// Largeur du plus long de ces textes (police donnée)
function widest(ctx, list, font) {
  ctx.font = font;
  return Math.max(0, ...list.map((t) => ctx.measureText(t).width));
}
// Début des barres : après le plus long trigramme de la liste (penché : un peu de marge)
const barStart = (ctx, list, x, fs, u) => x + fs * 1.25 + 14 * u + widest(ctx, list.map((r) => r.tla), `800 ${fs}px ${TITLE}`) + fs * 0.4;

// Vitesses de pointe : une barre par pilote, du plus rapide au plus lent ; échelle graduée en km/h qui ne part pas
// de zéro (sinon 342 et 355 km/h feraient deux barres presque égales)
function vitesses(ctx, W, H, d, o) {
  const rows = d.speeds.rows.slice(0, 22);
  background(ctx, W, H, rows[0].color);
  const f = frame(ctx, W, H, d, o, 'Vitesses de pointe');
  const u = Math.min(W, H) / 1080;
  const right = W - f.pad;
  txt(ctx, `${d.speeds.label} · meilleure vitesse de chaque pilote, en km/h`.toUpperCase(), f.pad, f.top + 26 * u, { size: Math.round(26 * u), weight: 700, family: TITLE, color: C.muted, spacing: 2, max: W - f.pad * 2 });
  const top = f.top + 86 * u;
  const rowH = Math.min((f.bottom - top) / rows.length, 64 * u);
  const fs = Math.round(Math.min(rowH * 0.72, 38 * u));
  // Graduations : pas de 1, 2, 5, 10… km/h, 3 à 6 intervalles, la plus basse sous le moins rapide
  const max = rows[0].kmh; const min = rows.at(-1).kmh;
  let lo; let hi; let step;
  for (step of [1, 2, 5, 10, 20, 50]) {
    lo = Math.floor((min - Math.max(step / 2, (max - min) * 0.25)) / step) * step;
    hi = Math.ceil(max / step) * step;
    if ((hi - lo) / step <= 6) break;
  }
  // Valeur (km/h) puis écart au plus rapide, à droite des barres
  const diffs = rows.map((r, i) => (i === 0 ? '' : r.diff ? `−${-r.diff}` : '='));
  const vx = right - widest(ctx, diffs, `700 ${Math.round(fs * 0.8)}px ${tv ? TITLE : MONO}`) - fs * 0.7;
  const bx = barStart(ctx, rows, f.pad, fs, u);
  const bw = vx - widest(ctx, [String(max)], `800 ${fs}px ${TITLE}`) - fs * 1.1 - bx;
  const X = (v) => bx + ((v - lo) / (hi - lo)) * bw;
  for (let v = lo; v <= hi; v += step) {
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(X(v), top - 6 * u, 1.5 * u, f.bottom - top);
    txt(ctx, String(v), X(v), top - 16 * u, { size: Math.round(22 * u), weight: 700, family: TITLE, color: C.muted, align: 'center' });
  }
  txt(ctx, 'ÉCART', right, top - 16 * u, { size: Math.round(22 * u), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 1.5 });
  rows.forEach((r, i) => {
    const cy = top + (i + 0.5) * rowH;
    const mid = barRow(ctx, f.pad, cy, fs, i, r, u);
    const h = Math.min(rowH * 0.62, 40 * u);
    bar(ctx, bx, cy - h / 2, X(r.kmh) - bx, h, r.color, i === 0);
    txt(ctx, String(r.kmh), vx, mid, { size: fs, weight: 800, family: TITLE, color: i === 0 ? C.gold : C.text, align: 'right', italic: true });
    txt(ctx, diffs[i], right, mid, { size: Math.round(fs * 0.8), weight: 700, family: tv ? TITLE : MONO, color: C.muted, align: 'right', italic: tv });
  });
}

// Meilleurs secteurs : les trois secteurs côte à côte, pilotes classés dans chacun (barre d'autant plus longue que le
// secteur est rapide, le plus lent garde un bout), temps du meilleur en or et écarts ; tour idéal en bas
function secteurs(ctx, W, H, d, o) {
  background(ctx, W, H, d.sectors[0][0].color);
  const f = frame(ctx, W, H, d, o, 'Meilleurs secteurs');
  const u = Math.min(W, H) / 1080;
  const gap = 24 * u;
  const cw = (W - f.pad * 2 - gap * 2) / 3;
  const note = d.ideal ? 96 * u : 0;
  const top = f.top + 70 * u;
  const n = Math.min(22, Math.max(...d.sectors.map((l) => l.length)));
  const rowH = Math.min((f.bottom - note - top) / n, 56 * u);
  // Corps borné aussi par la largeur de la colonne : les barres gardent un bon tiers de la place
  const fs = Math.round(Math.min(rowH * 0.72, 32 * u, cw / (tv ? 10.5 : 12)));
  const num = (v) => `+${v.toFixed(3).replace('.', ',')}`;
  const fam = tv ? TITLE : MONO;
  d.sectors.forEach((list, k) => {
    const x = f.pad + k * (cw + gap);
    ctx.fillStyle = C.red;
    if (tv) slant(ctx, x, f.top + 6 * u, 10 * u, 38 * u, 5 * u); else rr(ctx, x, f.top + 6 * u, 8 * u, 38 * u, 3 * u);
    ctx.fill();
    txt(ctx, `SECTEUR ${k + 1}`, x + 22 * u, f.top + 38 * u, { size: Math.round(36 * u), weight: 800, family: TITLE, italic: true, max: cw - 30 * u });
    const span = Math.max(list.at(-1).gap, 0.001);
    const tx = x + cw - 4 * u;   // temps ou écart, à droite
    const bx = barStart(ctx, list, x, fs, u);
    const tw = Math.max(widest(ctx, [list[0].time], `800 ${Math.round(fs * 0.9)}px ${fam}`), widest(ctx, list.slice(1).map((r) => num(r.gap)), `800 ${Math.round(fs * 0.82)}px ${fam}`));
    const bw = tx - tw - fs * 0.5 - bx;
    list.slice(0, 22).forEach((r, i) => {
      const cy = top + (i + 0.5) * rowH;
      if (i === 0) {   // meilleur temps du secteur : bande dorée derrière la ligne
        ctx.fillStyle = alpha(C.gold, 0.14);
        if (tv) slant(ctx, x - 6 * u, cy - rowH * 0.48, cw + 12 * u, rowH * 0.96, 10 * u); else rr(ctx, x - 6 * u, cy - rowH * 0.48, cw + 12 * u, rowH * 0.96, rowH * 0.3);
        ctx.fill();
      }
      const mid = barRow(ctx, x, cy, fs, i, r, u);
      const h = Math.min(rowH * 0.56, 34 * u);
      bar(ctx, bx, cy - h / 2, bw * (1 - 0.8 * (r.gap / span)), h, r.color, i === 0);
      txt(ctx, i === 0 ? r.time : num(r.gap), tx, mid, { size: Math.round(fs * (i === 0 ? 0.9 : 0.82)), weight: 800, family: fam, color: i === 0 ? C.gold : C.text, align: 'right', italic: tv });
    });
  });
  if (!d.ideal) return;
  // Tour idéal : bande en bas, sur toute la largeur
  const y = top + n * rowH + 22 * u;
  const h = note - 22 * u;
  card(ctx, f.pad, y, W - f.pad * 2, h, tv ? 6 * u : 22 * u, { tint: C.gold, light: true });
  const pw = pill(ctx, 'TOUR IDÉAL', f.pad + 20 * u, y + (h - 40 * u) / 2, 40 * u, { bg: 'rgba(0,0,0,0.3)', color: C.text, dot: C.gold });
  const ix = f.pad + 20 * u + pw + 22 * u;
  const s = txt(ctx, d.ideal.time, ix, y + h / 2 + 17 * u, { size: Math.round(48 * u), weight: 800, family: TITLE, color: C.gold, italic: true });
  ctx.font = `800 ${s}px ${TITLE}`;
  const sx = ix + ctx.measureText(d.ideal.time).width + 24 * u;
  const sub = d.ideal.gain > 0 ? `${d.ideal.gain.toFixed(3).replace('.', ',')} s de mieux que le meilleur tour (${d.ideal.best})` : 'les trois meilleurs secteurs réunis';
  txt(ctx, sub, sx, y + h / 2 + 11 * u, { size: Math.round(28 * u), weight: 600, color: C.muted, max: W - f.pad - 24 * u - sx });
}

export function faits(ctx, W, H, d, o, title = 'Faits marquants') {
  background(ctx, W, H, d.facts[0]?.color || d.rows[0]?.color);
  const f = frame(ctx, W, H, d, o, title);
  const cols = 2;
  const items = d.facts.slice(0, 6);
  const gap = 24;
  const cw = (W - f.pad * 2 - gap * (cols - 1)) / cols;
  const rowsN = Math.ceil(items.length / cols);
  // Dernière case seule sur sa ligne : bande sur toute la largeur, moins haute (valeur et détail côte à côte)
  const lone = items.length % cols === 1;
  const BAND = 0.6;
  // Cases seules sur la slide : le résumé de la course reste dans le texte du post
  const ch = Math.min(H > 1600 ? 560 : 470, (f.bottom - f.top - gap * (rowsN - 1)) / Math.max(rowsN - (lone ? 1 - BAND : 0), 1));
  items.forEach((it, i) => {
    const x = f.pad + (i % cols) * (cw + gap);
    const y = f.top + Math.floor(i / cols) * (ch + gap);
    const band = lone && i === items.length - 1;
    const w = band ? cw * 2 + gap : cw;
    const h = band ? ch * BAND : ch;
    card(ctx, x, y, w, h, 28, { tint: it.color || C.red });
    pill(ctx, it.label.toUpperCase(), x + 26, y + 26, 44, { bg: 'rgba(0,0,0,0.28)', color: C.text, dot: it.color ? vivid(it.color) : C.red });
    if (band) {
      ctx.font = `800 72px ${TITLE}`;
      const vw = Math.min(ctx.measureText(it.value).width, w * 0.45);
      txt(ctx, it.value, x + 30, y + h - 40, { size: 72, weight: 800, family: TITLE, max: w * 0.45, italic: true });
      if (it.sub) txt(ctx, it.sub, x + 30 + vw + 36, y + h - 44, { size: 34, weight: 600, color: C.muted, max: w - vw - 96 });
      return;
    }
    txt(ctx, it.value, x + 30, y + ch * 0.6 + 10, { size: 72, weight: 800, family: TITLE, max: w - 56, italic: true });
    if (it.sub) wrap(ctx, it.sub, x + 30, y + ch * 0.6 + 66, w - 56, 42, 2, { size: 34, weight: 600, color: C.muted });
  });
}

function championnat(ctx, W, H, d, o) {
  background(ctx, W, H, null);
  const f = frame(ctx, W, H, d, o, 'Championnat');
  const drv = d.champ.drivers.slice(0, 10);
  const teams = d.champ.teams.slice(0, 5);
  const list = (items, x, y, w, rowH, titleText, nameOf) => {
    txt(ctx, titleText, x, y, { size: 30, weight: 700, family: TITLE, color: C.red, spacing: 3 });
    txt(ctx, 'POINTS', x + w - 16, y, { size: 26, weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
    const fs = Math.round(rowH * 0.48);
    items.forEach((r, i) => {
      const ry = y + 20 + i * rowH;
      card(ctx, x, ry, w, rowH - 6, (rowH - 6) * 0.3, { tint: r.color, light: i >= 3 });
      const mid = ry + rowH / 2 + fs * 0.34;
      txt(ctx, String(r.pos ?? ''), x + 40, mid, { size: fs, weight: 800, family: TITLE, color: i < 3 ? MEDAL[i] : C.text, align: 'right', italic: true });
      txt(ctx, nameOf(r), x + 78, mid, { size: fs, weight: 800, family: TITLE, max: w * 0.5, italic: true });
      if (r.move) txt(ctx, `${r.move > 0 ? '▲' : '▼'}${Math.abs(r.move)}`, x + w * 0.66, mid, { size: Math.round(fs * 0.7), weight: 700, family: BODY, color: r.move > 0 ? C.green : C.red, align: 'right' });
      if (r.gained) txt(ctx, `+${r.gained}`, x + w * 0.8, mid, { size: Math.round(fs * 0.9), weight: 800, family: TITLE, color: C.green, align: 'right' });
      txt(ctx, String(r.points ?? ''), x + w - 16, mid, { size: Math.round(fs * 1.05), weight: 800, family: TITLE, align: 'right', italic: true });
    });
  };
  // Constructeurs pas encore connus : pas de titre seul, les pilotes prennent la place
  const avail = f.bottom - f.top - (teams.length ? 120 : 50);
  const rowH = Math.min(H > 1600 ? (teams.length ? 74 : 96) : (teams.length ? 58 : 76), avail / (drv.length + teams.length));
  list(drv, f.pad, f.top + 10, W - f.pad * 2, rowH, 'PILOTES', (r) => r.last.toUpperCase());
  if (teams.length) list(teams, f.pad, f.top + 10 + 20 + drv.length * rowH + 70, W - f.pad * 2, rowH, 'CONSTRUCTEURS', (r) => r.name.toUpperCase());
  txt(ctx, d.final ? 'Après la course' : 'Projection en cours de course', W - f.pad, f.bottom + 24, { size: 28, weight: 600, color: C.muted, align: 'right' });
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
  trackMark(ctx, W, H, o.shape);
  // En-tête : barre rouge, Formule 1 et saison
  const top = topY(W, H);
  kicker(ctx, pad, top, u, 'FORMULE 1', `SAISON ${d.year || ''}`.trim());

  // Résultats d'une séance : photo du vainqueur à droite et phrase du résultat (« NORRIS GAGNE ») à la place
  // de « RÉSULTATS » : un visage et une info, pour la grille du profil et le fil
  const win = !d.post && d.rows?.[0];
  const pic = win && o.photos?.[win.num];
  const colW = W - pad * 2;
  const tall = H / W > 1.5;   // story : bloc et sommaire groupés au milieu
  if (pic) { const S = Math.min(W * 0.8, H * (tall ? 0.5 : 0.64)); photo(ctx, pic, W - S + 40 * u, tall ? H * 0.17 : H * 0.07, S, S, win.color, 0.5); }
  // Bloc central : drapeau, « Résultats » (ou le résultat), séance, nom du Grand Prix
  let y = tall ? H * 0.27 : H * (pic ? 0.2 : 0.24);
  if (o.flag) {
    const fh = Math.round(66 * u);
    const fw = Math.round(fh * o.flag.width / o.flag.height);
    rr(ctx, pad, y, fw, fh, 8); ctx.save(); ctx.clip(); ctx.drawImage(o.flag, pad, y, fw, fh); ctx.restore();
    y += fh + 30 * u;
  }
  const word = { prerace: 'AVANT-COURSE', champ: 'CHAMPIONNAT', weekend: 'PROGRAMME', records: 'LE SAVIEZ-VOUS', ratings: 'LES NOTES', teamduels: 'LES DUELS', racelaps: 'LA COURSE', title: 'LE TITRE' }[d.post] || 'RÉSULTATS';
  if (pic) {
    // Course en cours (résultats provisoires) : en tête, pas encore vainqueur
    const verb = d.kind === 'race' && d.final ? (d.sprint ? 'GAGNE LE SPRINT' : 'GAGNE') : d.kind === 'quali' ? (d.sprint ? 'EN POLE DU SPRINT' : 'EN POLE') : 'EN TÊTE';
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 40 * u;
    txt(ctx, win.last.toUpperCase(), pad - 8 * u, y + 130 * u, { size: Math.round(158 * u), weight: 800, family: TITLE, max: colW, italic: true });
    txt(ctx, verb, pad - 4 * u, y + 222 * u, { size: Math.round(84 * u), weight: 800, family: TITLE, color: C.red, max: colW, italic: true });
    ctx.restore();
    y += 262 * u;
  } else {
    txt(ctx, word, pad - 8 * u, y + 150 * u, { size: Math.round(196 * u), weight: 800, family: TITLE, max: colW, italic: true });
    y += 190 * u;
  }
  // Séance dans une étiquette rouge
  const tag = (d.post === 'prerace' ? (d.sprint ? 'Sprint' : 'Course') : d.post === 'champ' ? (d.final ? 'Après la course' : 'En direct')
    : d.post === 'weekend' ? (d.sprint ? 'Week-end sprint' : `Manche ${d.round || ''}`) : d.post === 'records' ? 'Records du circuit'
      : d.post === 'ratings' ? 'Après la course' : d.post === 'teamduels' || d.post === 'title' ? `Après ${d.after} course${d.after > 1 ? 's' : ''}` : d.post === 'racelaps' ? 'Tour par tour'
        : d.kind === 'race' && !d.sprint ? 'Course' : d.label).toUpperCase();
  pill(ctx, tag, pad, y, 62 * u, { bg: C.red, dot: '#fff' });
  y += 62 * u + 70 * u;
  const lines = wrap(ctx, d.gp.toUpperCase(), pad, y + 20 * u, colW, 92 * u, 2, { size: Math.round(92 * u), weight: 800, family: TITLE, italic: true });
  y += (lines - 1) * 92 * u + 80 * u;
  const info = [d.date, d.circuit, d.kind === 'race' && d.laps ? `${d.laps} tours` : ''].filter(Boolean).join('  ·  ').toUpperCase();
  if (info) txt(ctx, info, pad, y, { size: Math.round(33 * u), weight: 600, family: TITLE, color: C.muted, max: colW, spacing: 2 });

  // Sommaire des images suivantes (numéro = place dans le carrousel publié)
  const items = next.map((s, i) => [String((o.slides ? o.slides.indexOf(s) : i + 1) + 1).padStart(2, '0'), slideName(s)]);
  const sx = pad;
  const end = footY(W, H) - Math.round(Math.min(W, H) * 0.08);   // au-dessus du pied (zone sûre des stories comprise)
  let sy = tall ? y + 120 * u : Math.max(y + 80 * u, end - items.length * 52 * u - 40 * u);
  // Sommaire trop long pour la place : sur deux colonnes
  const two = (end - sy - 22 * u) / Math.max(items.length, 1) < 44 * u;
  const per = two ? Math.ceil(items.length / 2) : items.length;
  const lh = Math.min(52 * u, (end - sy - 22 * u) / Math.max(per, 1));
  txt(ctx, 'AU PROGRAMME', sx, sy, { size: Math.round(26 * u), weight: 700, family: TITLE, color: C.red, spacing: 4 });
  sy += 22 * u;
  items.forEach(([n, name], i) => {
    const x = sx + (two && i >= per ? colW / 2 : 0);
    const y = sy + ((i % per) + 1) * lh;
    txt(ctx, n, x, y, { size: Math.round(32 * u), weight: 800, family: TITLE, color: C.red, italic: true });
    txt(ctx, name.toUpperCase(), x + 64 * u, y, { size: Math.round(36 * u), weight: 700, family: TITLE, spacing: 1, max: (two ? colW / 2 : colW) - 80 * u });
  });

  // Pied : signature, « faites défiler », résultats provisoires
  const fy = footY(W, H);
  footer(ctx, W, H, o);
  // Carrousel : on fait défiler ; story, vidéo et X : la suite vient après
  const hint = fmt === 'ig' ? 'FAITES DÉFILER' : 'À SUIVRE';
  const ax = W - pad;
  const ay = fy - Math.round(Math.min(W, H) * 0.009);
  ctx.save();
  ctx.strokeStyle = C.red; ctx.lineWidth = 5 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const k of [0, 1]) {
    const cx = ax - k * 18 * u;
    ctx.beginPath(); ctx.moveTo(cx - 14 * u, ay - 13 * u); ctx.lineTo(cx, ay); ctx.lineTo(cx - 14 * u, ay + 13 * u); ctx.stroke();
  }
  ctx.restore();
  txt(ctx, hint, ax - 52 * u, fy, { size: Math.round(Math.min(W, H) * 0.024), weight: 700, family: TITLE, color: C.text, align: 'right', spacing: 2 });
  // Résultats provisoires : sur leur ligne, au-dessus (à côté de « faites défiler », ils passaient sur les points du carrousel)
  if (!d.final) txt(ctx, 'RÉSULTATS PROVISOIRES', ax, fy - Math.round(Math.min(W, H) * 0.05), { size: Math.round(Math.min(W, H) * 0.024), weight: 700, family: TITLE, color: C.gold, align: 'right', spacing: 2 });
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
  const top = topY(W, H);
  const fy = footY(W, H);
  const bottom = fy - Math.round(Math.min(W, H) * 0.07);
  // Résumé détaillé ou photos de l'article dans les images suivantes (celles gardées) : invitation à faire défiler
  const pagesAll = pointPages(d.points, fmt);
  const more = keptPages(o, 'essentiel', pagesAll.map((_, i) => i + 1)).reduce((n, k) => n + (pagesAll[k - 1]?.length || 0), 0);
  const pics = keptPages(o, 'photo', (d.gallery || []).map((_, i) => i + 1)).length;
  const scroll = (more || pics) && fmt !== 'x';
  // En-tête : Actu F1 et date ; très grosse info : liseré rouge et étiquette « BREAKING » à droite
  kicker(ctx, pad, top, u, 'ACTU F1', d.date.toUpperCase());
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
    const p = withPhoto[0];
    ghost(ctx, p.last.toUpperCase(), W / 2, areaTop + ph * 0.92, Math.round(250 * u), W * 1.1);
    photo(ctx, o.photos[p.num], W * 0.08, areaTop, W * 0.84, ph, p.color, 0.3);
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
    pill(ctx, tag, x, y, 58 * u, { bg: d.badge.color, color: lightColor(d.badge.color) ? C.bg : '#fff', dot: true });
    y += (58 + 40) * u;
  }
  pick.lines.forEach((l, i) => txt(ctx, l, x, y + pick.size * 0.82 + i * lh, { size: pick.size, weight: 800, family: TITLE, italic: true }));
  y += pick.lines.length * lh + 34 * u;
  ctx.fillStyle = d.color ? vivid(d.color) : C.red;
  ctx.fillRect(x, y - 10 * u, 90 * u, 6 * u);
  y += 30 * u;
  const sum = sumAll.slice(0, pick.sumN);
  if (sum.length && sum.length < sumAll.length) sum[sum.length - 1] = `${sum[sum.length - 1].replace(/\s+\S*$/, '')}…`;
  sum.forEach((l, i) => txt(ctx, l, x, y + sumSize * 0.8 + i * sumLh, { size: sumSize, weight: 400, color: C.text }));

  // Pied : signature et source
  footer(ctx, W, H, o);
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
    card(ctx, x, y, cw, h, 10);
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
    card(ctx, x, y, tw, th, 18);
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
    card(ctx, x, y, colW, rowH - 8, (rowH - 8) * 0.3, { tint: r.color, light: i >= 3 });
    const mid = y + rowH / 2 + fs * 0.34;
    const px = x + fs * 1.6;
    txt(ctx, String(r.pos), px, mid, { size: fs, weight: 800, family: TITLE, color: i < 3 ? MEDAL[i] : C.text, align: 'right', italic: true });
    const slot = fs * 1.2;
    const lx = px + fs * 0.4;
    teamLogo(ctx, o, r.team || r.name, lx + slot / 2, y + (rowH - 4) / 2, fs * 0.9, 'center', slot);
    const right = x + colW - fs * 0.6;
    const tx = lx + slot + fs * 0.3;
    txt(ctx, r.label, tx, mid, { size: fs, weight: 800, family: TITLE, max: right - fs * (cols === 2 ? 4.7 : 6.8) - tx, italic: true });
    txt(ctx, String(r.points), right, mid, { size: Math.round(fs * 1.02), weight: 800, family: TITLE, align: 'right', italic: true });
    if (r.gained) txt(ctx, `+${r.gained}`, right - fs * 3.4, mid, { size: Math.round(fs * 0.86), weight: 800, family: TITLE, color: C.green, align: 'right' });
    if (r.move && cols === 1) txt(ctx, r.move > 0 ? `▲${r.move}` : `▼${-r.move}`, right - fs * 6.1, mid, { size: Math.round(fs * 0.7), weight: 700, family: TITLE, color: r.move > 0 ? C.green : C.red, align: 'right' });
  });
  txt(ctx, 'POINTS', W - f.pad - 16, f.top - 22, { size: 28, weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
  txt(ctx, d.final ? 'Après la course' : 'Projection en cours de course', W - f.pad, f.bottom + 14, { size: 28, weight: 600, color: C.muted, align: 'right' });
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
    card(ctx, x, y, cw, ch, 22, { tint: t.color });
    const lw = teamLogo(ctx, o, t.team, x + 26, y + ch * 0.22, ch * 0.18);
    txt(ctx, t.team.toUpperCase(), x + 26 + (lw ? lw + 12 : 0), y + ch * 0.27, { size: Math.round(ch * 0.15), weight: 700, family: TITLE, color: C.muted, spacing: 1.5, max: cw - 46 - lw });
    const s = Math.round(ch * 0.3);
    txt(ctx, t.ahead.tla, x + 26, y + ch * 0.68, { size: s, weight: 800, family: TITLE, italic: true });
    txt(ctx, `P${t.ahead.pos}`, x + 26, y + ch * 0.9, { size: Math.round(s * 0.6), weight: 700, family: MONO, color: C.gold });
    txt(ctx, 'devant', x + cw / 2, y + ch * 0.64, { size: Math.round(s * 0.58), weight: 600, color: C.muted, align: 'center' });
    txt(ctx, t.behind.tla, x + cw - 22, y + ch * 0.68, { size: s, weight: 800, family: TITLE, color: C.muted, align: 'right', italic: true });
    txt(ctx, t.behind.out ? 'ABANDON' : `P${t.behind.pos}`, x + cw - 22, y + ch * 0.9, { size: Math.round(s * 0.6), weight: 700, family: t.behind.out ? TITLE : MONO, color: t.behind.out ? C.red : C.muted, align: 'right' });
  });
}

// ---------- Flash : drapeau rouge, voiture de sécurité, abandon, pénalité ----------
function flash(ctx, W, H, d, o) {
  const ev = d.event;
  const k = FLASH_KINDS[ev.kind] || { label: 'FLASH', color: C.red };
  background(ctx, W, H, k.color);
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const top = topY(W, H);
  kicker(ctx, pad, top, u, 'EN DIRECT', `${d.gp} · ${d.label}`.toUpperCase());
  const fy = footY(W, H);
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
    txt(ctx, l, pad + 10 * u, ly + label.size * 0.83, { size: label.size, weight: 800, family: TITLE, color: ev.kind === 'sc' || ev.kind === 'vsc' || ev.kind === 'penalty' ? C.bg : '#fff', italic: true });
  });
  y += label.lines.length * label.size * 1.02 + 50 * u;
  const t = fitLines(ctx, ev.title, colW, [72, 64, 56, 50, 44].map((v) => Math.round(v * u)), 3, TITLE, 800);
  t.lines.forEach((l, i) => txt(ctx, l, pad, y + t.size * 0.85 + i * t.size, { size: t.size, weight: 800, family: TITLE, italic: true }));
  y += t.lines.length * t.size + 30 * u;
  if (ev.sub) wrap(ctx, ev.sub.charAt(0).toUpperCase() + ev.sub.slice(1), pad, y + 34 * u, colW, 46 * u, 3, { size: Math.round(36 * u), weight: 400, color: C.text });
  footer(ctx, W, H, o);
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
  const top = topY(W, H);
  kicker(ctx, pad, top, u, 'FORMULE 1', `SAISON ${d.year || ''}`.trim());
  const colW = W - pad * 2;
  const fy = footY(W, H);
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
  txt(ctx, 'À TOI !', pad - 8 * u, y + bigS * 0.88, { size: bigS, weight: 800, family: TITLE, max: colW, italic: true });
  y += bigS * 0.88 + 70 * u;
  r.lines.forEach((l, i) => txt(ctx, l.toUpperCase(), pad, y + r.size * 0.85 + i * r.size * 1.15, { size: r.size, weight: 800, family: TITLE, spacing: 1 }));
  y += r.lines.length * r.size * 1.15 + 60 * u;
  const label = 'RÉPONDS EN COMMENTAIRE';
  ctx.font = `800 ${hs}px ${TITLE}`;
  const hw = Math.min(colW, ctx.measureText(label).width + label.length * 2 * u + 90 * u);
  rr(ctx, pad, y, hw, hs * 1.8, hs * 0.9); ctx.fillStyle = C.red; ctx.fill();
  txt(ctx, label, pad + 40 * u, y + hs * 1.22, { size: hs, weight: 800, family: TITLE, color: '#fff', max: hw - 80 * u, spacing: 2 });
  footer(ctx, W, H, o);
  txt(ctx, 'ON LIT TOUT', W - pad, fy, { size: Math.round(27 * u), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2 });
}

function follow(ctx, W, H, d, o) {
  background(ctx, W, H, C.red);
  const u = Math.min(W, H) / 1080;
  const pad = Math.round(W * 0.055);
  const top = topY(W, H);
  kicker(ctx, pad, top, u, 'FORMULE 1', `SAISON ${d.year || ''}`.trim());
  const handle = o.signature || '@BenjyPaddock';
  const colW = W - pad * 2;
  const fy = footY(W, H);
  // Bloc d'appel : grand titre, raison adaptée au post, compte dans une pastille rouge
  const tall = H / W > 1.5;
  let y = tall ? H * 0.22 : H * 0.19;
  const big = txt(ctx, 'ABONNE-TOI', pad - 8 * u, y + 150 * u, { size: Math.round(180 * u), weight: 800, family: TITLE, max: colW, italic: true });
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
  for (const [k, v] of FOLLOW_TOPICS) {
    ty += 14 * u;
    card(ctx, tx, ty + 4 * u, tw, rowH - 20 * u, 22 * u, { tint: C.red });
    txt(ctx, k, tx + 32 * u, ty + rowH * 0.45, { size: Math.round(Math.min(38 * u, rowH * 0.34)), weight: 800, family: TITLE, spacing: 2, max: tw - 40 * u });
    txt(ctx, v, tx + 32 * u, ty + rowH * 0.82, { size: Math.round(Math.min(28 * u, rowH * 0.25)), weight: 400, color: C.muted, max: tw - 40 * u });
    ty += rowH - 14 * u;
  }
  footer(ctx, W, H, o);
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
  const top = topY(W, H);
  kicker(ctx, pad, top, u, "L'ESSENTIEL", (d.badge.label || 'ACTU F1').toUpperCase());
  const fy = footY(W, H);
  const bottom = fy - Math.round(Math.min(W, H) * 0.08);
  const colW = W - pad * 2;
  // Rappel du titre
  let y = top + 120 * u;
  const t = fitLines(ctx, d.title.toUpperCase(), colW, [56, 50, 44].map((v) => Math.round(v * u)), 2, TITLE, 800);
  t.lines.forEach((l, i) => txt(ctx, l, pad, y + t.size * 0.82 + i * t.size, { size: t.size, weight: 800, family: TITLE, color: C.muted, italic: true }));
  y += t.lines.length * t.size + 26 * u;
  ctx.fillStyle = d.color ? vivid(d.color) : C.red;
  ctx.fillRect(pad, y, 90 * u, 6 * u);
  y += 50 * u;
  // Points numérotés, chacun dans sa carte : le plus grand corps qui tient dans la hauteur
  const numW = 100 * u;
  const px = 30 * u;   // marge intérieure des cartes
  const gap = 24 * u;
  let pick = null;
  for (const size of [64, 58, 54, 50, 46, 42, 38, 35, 32, 29, 26].map((v) => Math.round(v * u))) {
    const lh = Math.round(size * 1.3);
    const blocks = pts.map((p) => fitLines(ctx, p, colW - numW - px * 2, [size], 99, BODY, 600).lines);
    const h = blocks.reduce((n, b) => n + Math.max(b.length * lh, numW * 0.7) + px * 2, 0) + gap * (pts.length - 1);
    pick = { size, lh, blocks, h };
    if (h <= bottom - y) break;
  }
  if (pick) {
    y += Math.max(0, (bottom - y - pick.h) / 2.5);
    pick.blocks.forEach((lines, i) => {
      const bh = Math.max(lines.length * pick.lh, numW * 0.7);
      card(ctx, pad, y, colW, bh + px * 2, 28 * u, { tint: d.color || C.red });
      const n = Math.round(numW * 0.62);
      rr(ctx, pad + px, y + px, n, n, n * 0.28); ctx.fillStyle = C.red; ctx.fill();
      txt(ctx, String(first + i + 1).padStart(2, '0'), pad + px + n / 2, y + px + n * 0.74, { size: Math.round(n * 0.5), weight: 800, family: TITLE, color: '#fff', align: 'center', italic: true });
      lines.forEach((l, k) => { if (y + px + (k + 1) * pick.lh <= bottom + pick.lh * 0.3) txt(ctx, l, pad + px + numW, y + px + pick.size * 0.92 + k * pick.lh, { size: pick.size, weight: 600, color: C.text }); });
      y += bh + px * 2 + gap;
    });
  }
  footer(ctx, W, H, o);
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
  const top = topY(W, H);
  const kw = kicker(ctx, pad, top, u, (d.badge.label || 'ACTU F1').toUpperCase(), '');
  const t = fitLines(ctx, d.title.toUpperCase(), W - pad * 2 - kw - 220 * u, [24].map((v) => Math.round(v * u)), 1, TITLE, 600);
  if (t.lines[0]) txt(ctx, t.lines[0], pad + kw + 20 * u, top + 37 * u, { size: t.size, weight: 600, family: TITLE, color: C.muted, spacing: 1 });
  if (kept.length > 1) txt(ctx, `${kept.indexOf(n) + 1} / ${kept.length}`, W - pad, top + 46 * u, { size: Math.round(34 * u), weight: 700, family: MONO, color: C.muted, align: 'right' });
  const fy = footY(W, H);
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
  footer(ctx, W, H, o);
  if (d.source) txt(ctx, `D'APRÈS ${d.source.toUpperCase()}`, W - pad, fy, { size: Math.round(Math.min(W, H) * 0.025), weight: 700, family: TITLE, color: C.muted, align: 'right', spacing: 2, max: W * 0.55 });
}

export function drawSlide(canvas, slide, fmt, d, o = {}) {
  const { w, h } = FORMATS[fmt];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  paintSlide(ctx, slide, fmt, d, o);
  // Vidéo : visuel redessiné directement à chaque image (net, sans saccade) ; size : [largeur, hauteur]
  // à la place de celles du format (couverture d'une vidéo plus haute)
  canvas.paint = (c, size) => paintSlide(c, slide, fmt, d, o, size);
  return canvas;
}

// Couverture des vidéos (Reels, TikTok, Shorts), plein cadre 9:16 : news → étiquette, photo et titre en très
// gros ; autres posts → leur visuel de couverture. L'essentiel tient dans la partie centrale 3:4 que montrent
// les grilles de profil (240 px rognés en haut et en bas).
export function videoCover(ctx, W, H, d, o = {}) {
  // Visuel au format story, dessiné à la taille de la vidéo (plus haute comprise)
  if (!d.news) { paintSlide(ctx, slidesFor(d, { fmt: 'story' }).includes('couverture') ? 'couverture' : slidesFor(d, { fmt: 'story' })[0], 'story', d, o, [W, H]); return; }
  const u = W / 1080;
  const pad = Math.round(W * 0.055);
  const lead = d.drivers.find((p) => o.photos?.[p.num]);
  background(ctx, W, H, lead?.color || d.color);
  // Étiquette du type de nouvelle (ou BREAKING), comme sur les visuels
  const top = Math.round(260 * u);
  if (d.breaking) breakingTag(ctx, pad + 300 * u, top, 72 * u);
  else if (d.badge.label) {
    pill(ctx, d.badge.label, pad, top, 72 * u, { bg: d.badge.color, color: lightColor(d.badge.color) ? C.bg : '#fff', dot: true });
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
  pick.lines.forEach((line, i) => txt(ctx, line, pad, y + pick.size * 0.82 + i * lh, { size: pick.size, weight: 800, family: TITLE, max: W - pad * 2, italic: true }));
  txt(ctx, o.signature || '@BenjyPaddock', pad, H - 270 * u, { size: Math.round(40 * u), weight: 700, family: TITLE, spacing: 1 });
}

// Visuel dessiné sur un contexte (taille du format, ou size = [largeur, hauteur] ; transformation du contexte respectée)
export function paintSlide(ctx, slide, fmt, d, o = {}, size = null) {
  page = o.slides?.includes(slide) ? { n: o.slides.indexOf(slide) + 1, total: o.slides.length } : null;
  safe = fmt === 'story';
  try { styled(o, () => paintOne(ctx, slide, fmt, d, o, size)); } finally { page = null; safe = false; }
}
function paintOne(ctx, slide, fmt, d, o, size) {
  const [w, h] = size || [FORMATS[fmt].w, FORMATS[fmt].h];
  // X : 4 images au plus par post, le sommaire n'annonce que celles publiées
  if (slide === 'news') newsSlide(ctx, w, h, d, o, fmt);
  else if (/^app-\d+$/.test(slide)) { const list = o.slides || appSlides(d); appPage(ctx, w, h, d, Number(slide.slice(4)), { num: list.indexOf(slide) + 1, total: list.length }); }
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
  else if (slide === 'couverture' && tv && !d.post && d.rows?.length) tvCover(ctx, w, h, d, o, fmt);
  else if (slide === 'couverture') cover(ctx, w, h, d, o, (o.slides ? o.slides.filter((s) => s !== 'couverture' && s !== 'abonnement' && s !== 'question') : slidesFor(d).slice(1)).slice(0, fmt === 'x' ? 3 : undefined), fmt);
  else if (slide === 'vainqueur') hero(ctx, w, h, d, o, 'VAINQUEUR');
  else if (slide === 'pole') hero(ctx, w, h, d, o, 'POLE POSITION');
  else if (slide === 'meilleurtemps') hero(ctx, w, h, d, o, 'MEILLEUR TEMPS');
  else if (slide === 'podium') (tv ? tvPodium : podium)(ctx, w, h, d, o);
  else if (slide === 'classement') (tv ? tvClassement : classement)(ctx, w, h, d, o);
  else if (slide === 'remontees') remontees(ctx, w, h, d, o);
  else if (slide === 'strategie') strategie(ctx, w, h, d, o);
  else if (slide === 'vitesses' && d.speeds) vitesses(ctx, w, h, d, o);
  else if (slide === 'secteurs' && d.sectors) secteurs(ctx, w, h, d, o);
  else if (slide === 'faits') faits(ctx, w, h, d, o);
  else if (slide === 'championnat' && d.champ) championnat(ctx, w, h, d, o);
}
