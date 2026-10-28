// Carte du circuit : tracé, secteurs sous drapeau, voitures (GPS ou estimées), virages.
import { store, displayNow, f1Now, on, versionOf } from '../store.js';
import { prefs, setPref } from '../prefs.js';
import { $, api, drivers, teamColor, storageGet, storageSet } from '../util.js';
import { loadTrack } from '../track.js';
import { parseUtc, segmentClass } from '/shared/f1.js';
import { hotLaps } from './tower.js';
import { icon } from '../icons.js';
import { DEC, tx, t } from '../i18n.js';

const canvas = () => $('#mapCanvas');
let ctx = null;
let track = null;
let trackKey = null;
let zones = null;          // zones ligne droite / détection estimées (serveur)
let elevation = null;      // altitude de chaque point du tracé (serveur ; vue 3D)
let xf = null;
let size = { w: 0, h: 0, dpr: 1 };
let lastFrame = performance.now();

// Couleurs de la carte (thème Pitwall) : fond adapté à l'apparence, piste toujours en asphalte sombre
const PAL_DARK = {
  outline: '#050608', edge: 'rgba(255,255,255,.09)', track: '#262B34', trackLine: '#4A5260',
  glow: 'rgba(96,165,250,.035)', dots: 'rgba(255,255,255,.05)', shadow: 'rgba(0, 0, 0, .75)',
  chip: 'rgba(14,17,22,.96)', chipEdge: '#3A414D', chipText: '#B4BAC4', label: 'rgba(7,8,10,.92)', ring: '#07080A',
};
const PAL_LIGHT = {
  ...PAL_DARK, outline: '#B4BCC8', edge: 'rgba(255,255,255,.6)', shadow: 'rgba(15, 23, 42, .22)', ring: '#FFFFFF',
  glow: 'rgba(37,99,235,.04)', dots: 'rgba(14,17,22,.07)',
};
const lightUI = () => document.documentElement.dataset.scheme === 'light';
const pal = () => (lightUI() ? PAL_LIGHT : PAL_DARK);
// Polices de la carte : Saira Condensed ; chiffres en chasse fixe
const FONT = () => '"Saira Condensed", "Titillium Web", sans-serif';
const MONO = () => '"JetBrains Mono", Consolas, monospace';

// Niveau de détail selon la taille réelle du tracé à l'écran (taille du panneau et zoom) :
// 0 = petite carte (points, pilotes suivis nommés), 1 = moyenne (pastilles avec trigramme, sans
// virages, positions, écarts ni étiquettes), 2 = tout.
// Évite une mini-carte illisible où pastilles, virages et étiquettes se recouvrent.
function detail() {
  const e = (xf?.base?.extent || 1e4) * view.z;
  return e < 220 ? 0 : e < 520 ? 1 : 2;
}

// Largeur de la piste à l'écran : proportionnelle à la taille de la carte, élargie au zoom.
function trackWidth() {
  return Math.max(7, Math.min(17, Math.min(size.w, size.h) / 44)) * Math.min(2.4, Math.sqrt(view.z));
}

// Texte lisible sur une couleur d'écurie
function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const v = parseInt(m[1], 16);
  const lum = (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  return lum > 0.6 ? '#0b0b0d' : '#ffffff';
}

function list(obj) {
  if (!obj) return [];
  return Array.isArray(obj) ? obj : Object.keys(obj).sort((a, b) => a - b).map((k) => obj[k]);
}

function ensureTrack() {
  const info = store.state.SessionInfo;
  const key = info?.Meeting?.Circuit?.Key;
  const year = Number(info?.StartDate?.slice(0, 4)) || new Date().getFullYear();
  if (!key) return;
  const k = `${key}-${year}`;
  if (k === trackKey) return;
  trackKey = k;
  track = null;
  zones = null;
  elevation = null;
  $('#mapEmpty').textContent = 'Chargement du tracé…';
  $('#mapEmpty').hidden = false;
  loadTrack(key, year).then((t) => {
    if (trackKey !== k) return;
    track = t;
    store.positions.setTrack(t);
    // Emplacement réel des boucles de chrono, zones ligne droite et ligne de détection : calculés une fois par circuit
    // par le serveur ; pas encore calculés (404) ou serveur injoignable : redemandés toutes les 2 minutes
    const ask = (what, use) => api(`/api/${what}?key=${key}&year=${year}`)
      .then((v) => { if (trackKey === k) use(v); }, () => setTimeout(() => { if (trackKey === k) ask(what, use); }, 120e3));
    ask('loops', (l) => store.positions.setLoops(l));
    ask('zones', (z) => { zones = z; });
    ask('elevation', (e) => { elevation = e; });
    xf = null;
    $('#mapEmpty').hidden = true;
  }).catch((err) => {
    $('#mapEmpty').textContent = `Tracé indisponible (${err.message})`;
    trackKey = null;
    setTimeout(() => { if (!track) trackKey = null; }, 30000);
  });
}

function resize() {
  const c = canvas();
  const r = c.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (r.width === size.w && r.height === size.h && dpr === size.dpr) return;
  size = { w: r.width, h: r.height, dpr };
  c.width = Math.round(r.width * dpr);
  c.height = Math.round(r.height * dpr);
  xf = null;
}

function makeTransform() {
  const a = (track.rotation * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const rot = (x, y) => [x * cos - y * sin, -(x * sin + y * cos)];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of track.pts) {
    const [rx, ry] = rot(p.x, p.y);
    if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
  }
  // Place laissée en bas pour la bande « ordre sur la piste »
  const below = $('#mapRibbon2')?.checked ? 44 : 0;
  // Marge autour du tracé : réduite sur une petite carte pour lui laisser la place
  const pad = Math.max(12, Math.min(36, Math.min(size.w, size.h - below) * 0.1));
  const bw = maxX - minX || 1, bh = maxY - minY || 1;
  const scale = Math.min((size.w - pad * 2) / bw, (size.h - below - pad * 2) / bh);
  const ox = (size.w - bw * scale) / 2 - minX * scale;
  const oy = (size.h - below - bh * scale) / 2 - minY * scale;
  const f = (x, y) => {
    const [rx, ry] = rot(x, y);
    return [rx * scale + ox, ry * scale + oy];
  };
  f.scale = scale;
  f.extent = Math.sqrt(bw * bh) * scale;   // taille moyenne du tracé à l'écran (niveau de détail)
  return f;
}

// Côté choisi pour l'étiquette de chaque pilote : { i, blocked } (voir drawCars)
const labelSide = new Map();

// Vue (zoom / déplacement) appliquée par-dessus la projection de base.
const view = { z: 1, x: 0, y: 0 };
let followTarget = null;

function withView(base) {
  const f = (x, y) => {
    const [bx, by] = base(x, y);
    return [(bx - size.w / 2) * view.z + size.w / 2 + view.x, (by - size.h / 2) * view.z + size.h / 2 + view.y];
  };
  f.base = base;
  f.screen = track.pts.map((p) => f(p.x, p.y));
  return f;
}

function resetView() {
  view.z = 1; view.x = 0; view.y = 0;
}

// État des drapeaux par secteur de commissaires, d'après les messages de la direction de course.
function sectorFlags() {
  const flags = new Map();
  let red = false;
  const now = f1Now();
  for (const m of list(store.state.RaceControlMessages?.Messages)) {
    if (!m || m.Category !== 'Flag') continue;
    if (parseUtc(m.Utc) > now + 1000) continue;
    const flag = m.Flag;
    if (m.Scope === 'Track') {
      if (flag === 'RED') red = true;
      if (flag === 'GREEN' || flag === 'CLEAR') { flags.clear(); red = false; }
      if (flag === 'CHEQUERED') flags.clear();
    } else if (m.Scope === 'Sector' && m.Sector) {
      if (flag === 'CLEAR' || flag === 'GREEN') flags.delete(Number(m.Sector));
      else if (flag === 'YELLOW' || flag === 'DOUBLE YELLOW') flags.set(Number(m.Sector), flag);
    }
  }
  return { flags, red };
}

// Trait parallèle au tracé (décalé de off px vers l'extérieur du point de vue de la normale).
function strokeOffset(from, to, off) {
  const pts = xf.screen;
  const n = pts.length;
  const at = (i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [pts[i][0] - ((b[1] - a[1]) / len) * off, pts[i][1] + ((b[0] - a[0]) / len) * off];
  };
  ctx.beginPath();
  let i = from;
  ctx.moveTo(...at(i));
  for (let guard = 0; i !== to && guard < n; guard++) {
    i = (i + 1) % n;
    ctx.lineTo(...at(i));
  }
  ctx.stroke();
}

function badge(x, y, text, bg, fg, edge) {
  ctx.font = `800 10.5px ${FONT()}`;
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 8, w, 16, 5);
  ctx.fill();
  if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tx(text), x, y + 0.5);
}

// Zones « ligne droite » (straight mode) et ligne de détection du mode dépassement.
// Voie des stands (estimée à partir des passages des voitures, voir shared/zones.js) : route
// plus étroite et plus sombre que la piste, pointillés au milieu, étiquette « STANDS »
function drawPitLane(W) {
  const pl = zones?.pitLane?.path;
  if (!pl?.length || !$('#mapPit').checked) return;
  const raw = pl.map(([x, y]) => xf(x, y));
  const w = Math.max(4, W * 0.5);
  // La voie des stands longe souvent la piste à quelques mètres : à l'écran elle serait cachée
  // sous la piste. On l'écarte juste à côté (toujours du même côté), en douceur à l'entrée et à la sortie.
  const tr = xf.screen;
  const near = raw.map(([x, y]) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < tr.length; i++) { const d = (tr[i][0] - x) ** 2 + (tr[i][1] - y) ** 2; if (d < bd) { bd = d; bi = i; } }
    const a = tr[(bi - 2 + tr.length) % tr.length], b = tr[(bi + 2) % tr.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { q: tr[bi], nx: -(b[1] - a[1]) / len, ny: (b[0] - a[0]) / len };
  });
  const side = Math.sign(near.reduce((t, n, i) => t + (raw[i][0] - n.q[0]) * n.nx + (raw[i][1] - n.q[1]) * n.ny, 0)) || 1;
  const gap = W / 2 + w / 2 + 3;
  const pts = raw.map((p, i) => {
    const n = near[i];
    const k = Math.min(1, i / 8, (raw.length - 1 - i) / 8);
    const off = (p[0] - n.q[0]) * n.nx * side + (p[1] - n.q[1]) * n.ny * side;
    const want = gap * k;
    return off >= want ? p : [p[0] + n.nx * side * (want - off), p[1] + n.ny * side * (want - off)];
  });
  const line = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  };
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  line();
  ctx.strokeStyle = pal().outline;
  ctx.lineWidth = w + 4;
  ctx.stroke();
  ctx.strokeStyle = pal().edge;
  ctx.lineWidth = w + 2;
  ctx.stroke();
  ctx.strokeStyle = '#4a4a55';
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(255, 255, 255, .7)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.setLineDash([]);
  // Étiquette au milieu de la voie
  const m = pts[pts.length >> 1], a = pts[(pts.length >> 1) - 2], b = pts[(pts.length >> 1) + 2];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
  // Du côté opposé à la piste
  const mn = near[pts.length >> 1];
  if ((nx * mn.nx + ny * mn.ny) * side < 0) { nx = -nx; ny = -ny; }
  if (detail() > 1) badge(m[0] + nx * (w / 2 + 14), m[1] + ny * (w / 2 + 14), 'STANDS', '#3a3a44', '#e6e6ee');
  ctx.restore();
}

function drawZones() {
  if (!zones || !$('#mapZones').checked) return;
  const pts = xf.screen;
  const n = pts.length;
  if (!n || zones.zones.some((z) => z.from >= n || z.to >= n)) return;
  const W = trackWidth();
  ctx.save();
  ctx.lineCap = 'round';
  // Zones « ligne droite » : hachures vertes de part et d'autre de la piste
  ctx.lineCap = 'butt';
  const small = detail() === 0;   // petite carte : hachures plus fines et plus proches
  for (const z of zones.zones) {
    ctx.strokeStyle = 'rgba(60, 200, 110, 0.85)';
    ctx.lineWidth = small ? 2.5 : 4;
    ctx.setLineDash(small ? [1.5, 2.5] : [2, 3]);
    strokeOffset(z.from, z.to, W / 2 + (small ? 2.5 : 3.5));
    strokeOffset(z.from, z.to, -(W / 2 + (small ? 2.5 : 3.5)));
    ctx.setLineDash([]);
  }
  // Nom de chaque zone (officiel : A1, A2…) au milieu, à l'extérieur de la piste
  if (detail() > 1) zones.zones.forEach((z, k) => {
    const len = (z.to - z.from + n) % n;
    const i = (z.from + Math.floor(len / 2)) % n;
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
    badge(p[0] + nx * (W / 2 + 22), p[1] + ny * (W / 2 + 22), `LD ${z.name || k + 1}`, '#0E1116', '#34D399', '#34D399');
  });
  ctx.lineCap = 'round';
  // Mode dépassement : point de détection (rose) et point d'activation (vert), officiels (plan FIA
  // du circuit) ou estimés ; étiquettes de part et d'autre de la piste pour ne pas se chevaucher
  const mark = (m, color, ink, text, side) => {
    if (!m || m.idx >= n) return;
    const p = pts[m.idx], a = pts[(m.idx - 1 + n) % n], b = pts[(m.idx + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (-(b[1] - a[1]) / len) * side, ny = ((b[0] - a[0]) / len) * side;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p[0] - nx * (W / 2 + 4), p[1] - ny * (W / 2 + 4));
    ctx.lineTo(p[0] + nx * (W / 2 + 4), p[1] + ny * (W / 2 + 4));
    ctx.stroke();
    if (detail() > 1) badge(p[0] + nx * (W / 2 + 20), p[1] + ny * (W / 2 + 20), text, color, ink);
  };
  mark(zones.detection, '#ff4fd8', '#2a0623', 'DÉTECTION', 1);
  mark(zones.activation, '#3ce08a', '#062414', 'ACTIVATION', -1);
  ctx.restore();
}

function strokeRange(from, to) {
  const pts = xf.screen;
  const n = pts.length;
  ctx.beginPath();
  let i = from;
  ctx.moveTo(pts[i][0], pts[i][1]);
  let guard = 0;
  while (i !== to && guard++ < n) {
    i = (i + 1) % n;
    ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.stroke();
}

// Tracé entre deux distances de référence (r croissant, modulo L).
function strokeDist(r0, r1) {
  const L = track.L;
  if (r1 < r0) r1 += L;
  const step = L / 700;
  ctx.beginPath();
  for (let r = r0; ; r += step) {
    const last = r >= r1;
    const p = track.pointAt(last ? r1 : r);
    const [x, y] = xf(p.x, p.y);
    if (r === r0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    if (last) break;
  }
  ctx.stroke();
}

// Point et direction (normale) du tracé à la distance r, en coordonnées écran.
function screenAt(r) {
  const a = track.pointAt(r), b = track.pointAt(r + track.L / 400);
  const [x0, y0] = xf(a.x, a.y), [x1, y1] = xf(b.x, b.y);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  return { x: x0, y: y0, nx: -Math.sin(ang), ny: Math.cos(ang) };
}

// ---------- Secteurs et micro-secteurs du chronométrage ----------
// Couleurs des secteurs choisies pour ne pas se confondre avec les drapeaux (jaune, rouge)
const SECTOR_COLORS = ['#ff3b4a', '#2f8cff', '#ffb340'];
let layoutCache = null;

const mod = (r, L) => ((r % L) + L) % L;

function timingLayout() {
  const s = store.state;
  const pos = store.positions;
  const counts = [0, 0, 0];
  for (const l of Object.values(s.TimingData?.Lines || {})) {
    for (let i = 0; i < 3; i++) {
      const segs = l?.Sectors?.[i]?.Segments;
      const c = segs ? (Array.isArray(segs) ? segs.length : Object.keys(segs).length) : 0;
      if (c > counts[i]) counts[i] = c;
    }
  }
  const fb = pos.sectorFractions(s);
  const key = `${trackKey}|${counts}|${fb.map((x) => x.toFixed(3))}|${pos.lineFrac()}|${!!pos.loops}`;
  if (layoutCache?.key === key) return layoutCache;
  const L = track.L, line = pos.lineFrac();
  const toR = (q) => mod((line + q) * L, L);
  const qb = [0, pos.loopQ('S0', fb[1]), pos.loopQ('S1', fb[2]), 1];
  const sectors = [0, 1, 2].map((i) => ({ i, from: toR(qb[i]), to: toR(qb[i + 1]), len: mod((qb[i + 1] - qb[i]) * L, L) || L / 3 }));
  const minis = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < counts[i]; j++) {
      const q = pos.loopQ(`${i}-${j}`, fb[i] + ((j + 1) / counts[i]) * (fb[i + 1] - fb[i]));
      minis.push({ i, j, r: toR(q), last: j === counts[i] - 1 });
    }
  }
  // Distance de chaque virage sur le tracé (pour décrire les zones sous drapeau)
  const corners = track.corners.map((c) => ({ number: c.number, r: track.t[track.nearestIndex(c.x, c.y)] }));
  layoutCache = { key, sectors, minis, counts, corners, qb };
  return layoutCache;
}

// Secteur (1-3) et micro-secteur (1-n) contenant la distance r.
function locate(lay, r) {
  const L = track.L;
  for (const sec of lay.sectors) {
    const d = mod(r - sec.from, L);
    if (d <= sec.len) {
      const mins = lay.minis.filter((m) => m.i === sec.i);
      const k = mins.findIndex((m) => mod(m.r - sec.from, L) >= d);
      return { sector: sec.i + 1, mini: k >= 0 ? k + 1 : mins.length || null };
    }
  }
  return { sector: null, mini: null };
}

// Secteurs de commissaires : positions fournies avec le tracé (MultiViewer) ou, pour un tracé
// reconstruit à partir du GPS, estimées en découpant le tour en parts égales depuis la ligne
// (en pratique un secteur tous les ~300 m, numérotés dans le sens de la course).
let approxMarshal = null;

function marshalLayout() {
  if (track.marshal.length) return { ranges: track.marshalRanges(), approx: false };
  let maxSeen = 0;
  for (const m of list(store.state.RaceControlMessages?.Messages)) {
    if (m?.Scope === 'Sector' && Number(m.Sector) > maxSeen) maxSeen = Number(m.Sector);
  }
  const pts = track.pts;
  const n = pts.length;
  const line = store.positions.lineFrac();
  const key = `${trackKey}|${maxSeen}|${line.toFixed(3)}`;
  if (approxMarshal?.key === key) return approxMarshal;
  // Point de départ : ligne de départ/arrivée (temps le plus proche sur le tracé)
  const tl = line * track.L;
  let start = 0;
  for (let i = 1; i < n; i++) if (Math.abs(track.t[i] - tl) < Math.abs(track.t[start] - tl)) start = i;
  // Distances cumulées depuis la ligne (coordonnées en dixièmes de mètre)
  const cum = [0];
  for (let k = 1; k <= n; k++) {
    const a = pts[(start + k - 1) % n], b = pts[(start + k) % n];
    cum.push(cum[k - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[n];
  const count = Math.max(maxSeen, Math.round(total / 10 / 300), 1);
  const idxAt = (d) => {
    let k = cum.findIndex((c) => c >= d);
    if (k < 0) k = n;
    return (start + k) % n;
  };
  const bounds = Array.from({ length: count + 1 }, (_, i) => idxAt((i / count) * total));
  const ranges = Array.from({ length: count }, (_, i) => ({ number: i + 1, from: bounds[i], to: bounds[i + 1] }));
  approxMarshal = { key, ranges, approx: true };
  return approxMarshal;
}

function describeZone(lay, r0, r1) {
  const L = track.L;
  const span = mod(r1 - r0, L);
  const turns = lay.corners.filter((c) => mod(c.r - r0, L) <= span).map((c) => c.number).sort((a, b) => a - b);
  const a = locate(lay, r0 + span * 0.02), b = locate(lay, r1 - span * 0.02);
  const parts = [];
  if (turns.length) parts.push(turns.length > 1 ? `virages ${turns[0]}–${turns[turns.length - 1]}` : `virage ${turns[0]}`);
  if (a.sector) {
    if (a.sector === b.sector) parts.push(`S${a.sector}${a.mini ? ` · micro-secteur${a.mini !== b.mini ? `s ${a.mini}–${b.mini}` : ` ${a.mini}`}` : ''}`);
    else parts.push(`S${a.sector}${a.mini ? `.${a.mini}` : ''} ${icon('arrow-right', 'ic-s')} S${b.sector}${b.mini ? `.${b.mini}` : ''}`);
  }
  return parts.join(' · ');
}

function drawSectors(lay) {
  const W = trackWidth();
  // Bande centrale lumineuse colorée par secteur
  ctx.save();
  ctx.lineWidth = Math.max(2.5, W * 0.3);
  ctx.shadowBlur = W * 0.35;
  for (const sec of lay.sectors) {
    ctx.strokeStyle = SECTOR_COLORS[sec.i];
    ctx.shadowColor = SECTOR_COLORS[sec.i];
    ctx.globalAlpha = 0.9;
    strokeDist(sec.from, sec.from + sec.len);
  }
  ctx.restore();
  drawFocusMinis(lay, W);
  // Repères des micro-secteurs (petits traits) et des fins de secteur (grands traits)
  for (const m of lay.minis) {
    const p = screenAt(m.r);
    const len = m.last ? W / 2 + 5 : W / 2 - 1;
    ctx.strokeStyle = m.last ? '#ffffff' : 'rgba(233,237,244,.45)';
    ctx.lineWidth = m.last ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(p.x - p.nx * len, p.y - p.ny * len);
    ctx.lineTo(p.x + p.nx * len, p.y + p.ny * len);
    ctx.stroke();
  }
}

// Pilote suivi en piste (tour lancé…) : ses micro-secteurs aux couleurs du classement (jaune, vert, violet, stand)
const SEG_VARS = { 'seg-yellow': '--yellow', 'seg-green': '--green', 'seg-purple': '--purple', 'seg-pit': '--blue' };
const focusSecs = () => {
  const l = store.focus && store.state.TimingData?.Lines?.[store.focus];
  return l && !l.InPit && !l.Retired && !l.Stopped ? list(l.Sectors) : null;
};
// Fond de la carte redessiné dès que le pilote suivi ou un de ses micro-secteurs change
const focusMinisKey = () => `${store.focus}:${(focusSecs() || []).map((s) => list(s?.Segments).map((g) => g?.Status).join(',')).join(';')}`;
function drawFocusMinis(lay, W) {
  const secs = focusSecs();
  if (!secs?.length) return;
  const css = getComputedStyle(document.documentElement);
  ctx.save();
  ctx.lineWidth = Math.max(3, W * 0.5);
  for (const sec of lay.sectors) {
    let from = sec.from;
    for (const m of lay.minis.filter((x) => x.i === sec.i)) {
      const v = SEG_VARS[segmentClass(list(secs[sec.i]?.Segments)[m.j]?.Status)];
      if (v) { ctx.strokeStyle = css.getPropertyValue(v).trim(); strokeDist(from, m.r); }
      from = m.r;
    }
  }
  ctx.restore();
}

// Étiquettes S1 / S2 / S3 au milieu de chaque secteur, numéros de micro-secteur en zoom
// (dessinées après les numéros de virage pour rester visibles).
function drawSectorLabels(lay) {
  const L = track.L;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const W = trackWidth();
  const best = bestSectors();
  for (const sec of lay.sectors) {
    const p = screenAt(sec.from + sec.len / 2);
    const b = best[sec.i];
    if (b) {
      // Pastille « S1 · 38.178 · RUS » : meilleur temps du secteur et son auteur
      const x = p.x - p.nx * (W / 2 + 22), y = p.y - p.ny * (W / 2 + 22);
      ctx.font = `700 11px ${FONT()}`;
      const head = `S${sec.i + 1}`;
      const hw = ctx.measureText(head).width + 10;
      ctx.font = `600 10.5px ${MONO()}`;
      const tw = ctx.measureText(b.time).width;
      ctx.font = `700 11px ${FONT()}`;
      const nw = ctx.measureText(b.tla).width;
      const w = hw + tw + nw + 18;
      ctx.fillStyle = 'rgba(14,17,22,.96)';
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 10, w, 20, 6);
      ctx.fill();
      ctx.strokeStyle = SECTOR_COLORS[sec.i];
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = SECTOR_COLORS[sec.i];
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 10, hw, 20, [6, 0, 0, 6]);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tx(head), x - w / 2 + 5, y + 0.5);
      ctx.fillStyle = '#C084FC';
      ctx.font = `600 10.5px ${MONO()}`;
      ctx.fillText(tx(b.time), x - w / 2 + hw + 6, y + 0.5);
      ctx.fillStyle = '#F1F3F6';
      ctx.font = `700 11px ${FONT()}`;
      ctx.fillText(tx(b.tla), x - w / 2 + hw + tw + 12, y + 0.5);
      ctx.textAlign = 'center';
      continue;
    }
    const x = p.x - p.nx * (W / 2 + 16), y = p.y - p.ny * (W / 2 + 16);
    ctx.fillStyle = SECTOR_COLORS[sec.i];
    ctx.beginPath();
    ctx.roundRect(x - 13, y - 9, 26, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 11px ${FONT()}`;
    ctx.fillText(tx(`S${sec.i + 1}`), x, y + 0.5);
  }
  if ($('#mapMiniNums').checked && view.z >= 1.5) {
    ctx.font = `700 9.5px ${FONT()}`;
    for (const sec of lay.sectors) {
      const mins = lay.minis.filter((m) => m.i === sec.i);
      let prev = sec.from;
      mins.forEach((m, k) => {
        const mid = prev + mod(m.r - prev, L) / 2;
        const p = screenAt(mid);
        ctx.fillStyle = 'rgba(233,237,244,.8)';
        ctx.fillText(tx(`${sec.i + 1}.${k + 1}`), p.x + p.nx * (W / 2 + 9), p.y + p.ny * (W / 2 + 9));
        prev = m.r;
      });
    }
  }
}

// Meilleur temps de chaque secteur dans la séance et son auteur : [{ time, tla }] (S1, S2, S3)
function bestSectors() {
  const s = store.state;
  const dl = drivers(s);
  const out = [];
  for (const [num, l] of Object.entries(s.TimingStats?.Lines || {})) {
    list(l?.BestSectors).slice(0, 3).forEach((b, i) => {
      if (b?.Position === 1 && b.Value) out[i] = { time: b.Value, tla: dl[num]?.Tla || num };
    });
  }
  return out;
}

// Position estimée de la voiture de sécurité : juste devant le leader.
function leaderR() {
  const lines = store.state.TimingData?.Lines || {};
  const num = Object.keys(lines).find((n) => Number(lines[n]?.Position) === 1);
  if (!num) return null;
  const disp = displayNow();
  const g = store.positions.hasGps(disp) ? store.positions.gpsAt(num, disp) : store.positions.estimatedXY(num, disp, 0);
  return g ? track.project(g.x, g.y).r : null;
}

function scEnding() {
  // « SAFETY CAR IN THIS LAP » publié après le dernier « SAFETY CAR DEPLOYED »
  let ending = false;
  const now = f1Now();
  for (const m of list(store.state.RaceControlMessages?.Messages)) {
    if (!m?.Message || parseUtc(m.Utc) > now + 1000) continue;
    if (/SAFETY CAR DEPLOYED/.test(m.Message) && !/VIRTUAL/.test(m.Message)) ending = false;
    if (/SAFETY CAR IN THIS LAP/.test(m.Message)) ending = true;
  }
  return ending;
}

let flagsHtml = '';

function renderFlagInfo(html) {
  if (html === flagsHtml) return;
  flagsHtml = html;
  $('#mapFlags').innerHTML = html;
}

function draw() {
  const now = performance.now();
  const dt = Math.min(0.2, (now - lastFrame) / 1000);
  lastFrame = now;
  ensureTrack();
  resize();
  const dpr = size.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.w, size.h);
  // Carte masquée (autre panneau agrandi, Saison ouverte) : rien à dessiner
  if (!track || !canvas().width || !canvas().height) return;
  if (!xf) xf = { base: makeTransform() };
  // Suivi du pilote : on centre la vue sur sa voiture (repérée à l'image précédente).
  if ($('#mapFollow').checked && followTarget) {
    if (view.z < 2.2) view.z += (2.6 - view.z) * Math.min(1, dt * 3);
    const tx = -(followTarget[0] - size.w / 2) * view.z, ty = -(followTarget[1] - size.h / 2) * view.z;
    view.x += (tx - view.x) * Math.min(1, dt * 4);
    view.y += (ty - view.y) * Math.min(1, dt * 4);
  }
  xf = withView(xf.base);

  const pts = xf.screen;
  const ts = String(store.state.TrackStatus?.Status || '1');
  const sf = sectorFlags();
  const flags = sf.flags;
  const red = sf.red || ts === '5';
  const sc = ts === '4', vsc = ts === '6' || ts === '7';
  const scMode = sc || vsc;
  const lay = timingLayout();

  const animated = red || scMode || [...flags.values()].includes('DOUBLE YELLOW');
  const bgKey = [size.w, size.h, size.dpr, view.x.toFixed(1), view.y.toFixed(1), view.z.toFixed(3), ts, [...flags].join(),
    lay?.key, !!zones, store.positions.lineFrac().toFixed(4), MAP_OPTS.map((k) => $(`#${k}`).checked).join(), trackKey, document.fonts?.status, document.documentElement.dataset.scheme, versionOf(['TimingStats']), focusMinisKey()].join('|');
  let flagZones;
  if (!animated && bg.key === bgKey && bg.canvas) {
    ctx.drawImage(bg.canvas, 0, 0, size.w, size.h);
    flagZones = bg.flagZones;
  } else if (animated) {
    bg.key = '';
    flagZones = drawBackground(now, red, sc, vsc, scMode, flags, lay);
  } else {
    // Nouveau fond : dessiné hors écran puis recopié
    if (!bg.canvas) bg.canvas = document.createElement('canvas');
    if (bg.canvas.width !== canvas().width || bg.canvas.height !== canvas().height) {
      bg.canvas.width = canvas().width;
      bg.canvas.height = canvas().height;
    }
    const main = ctx;
    ctx = bg.canvas.getContext('2d');
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    try { flagZones = drawBackground(now, red, sc, vsc, scMode, flags, lay); } finally { ctx = main; }
    bg.key = bgKey;
    bg.flagZones = flagZones;
    ctx.drawImage(bg.canvas, 0, 0, size.w, size.h);
  }

  drawCars(dt);
  drawRibbon(lay, flagZones);

  // Voiture de sécurité : position estimée juste devant le leader
  if (sc && !red) {
    const lr = leaderR();
    if (lr !== null) {
      const p = screenAt(lr + track.L / 45);
      ctx.beginPath();
      ctx.roundRect(p.x - 13, p.y - 9, 26, 18, 4);
      ctx.fillStyle = '#ffb020';
      ctx.fill();
      ctx.strokeStyle = '#1d1200';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#1d1200';
      ctx.font = `900 11px ${FONT()}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tx('SC'), p.x, p.y + 0.5);
    }
  }

  // Informations : bandeau drapeau rouge / SC / VSC et zones sous drapeau jaune
  const items = [];
  if (red) items.push('<div class="mf-banner red">Drapeau rouge — séance arrêtée</div>');
  else if (sc) items.push(`<div class="mf-banner sc">${scEnding() ? 'Voiture de sécurité — rentre à la fin du tour' : 'Voiture de sécurité en piste'}${leaderR() !== null ? ' · position estimée' : ''}</div>`);
  else if (ts === '6') items.push('<div class="mf-banner vsc">Voiture de sécurité virtuelle</div>');
  else if (ts === '7') items.push('<div class="mf-banner vsc">Fin de VSC — reprise imminente</div>');
  for (const z of $('#mapFlagText').checked ? flagZones.sort((a, b) => a.number - b.number) : []) {
    items.push(`<div class="mf-item ${z.dbl ? 'dy' : ''}"><b>${z.dbl ? 'Double jaune' : 'Jaune'}</b> · secteur de commissaires ${z.number}${z.text ? ` · ${z.text}` : ''}${z.approx ? ' <span class="muted">(position estimée)</span>' : ''}</div>`);
  }
  renderFlagInfo(items.join(''));
}

// Fond : halo central et trame de points qui suit les déplacements de la vue
let dotPattern = null;

function drawBackdrop() {
  const g = ctx.createRadialGradient(size.w / 2, size.h / 2, 0, size.w / 2, size.h / 2, Math.hypot(size.w, size.h) / 2);
  g.addColorStop(0, pal().glow);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size.w, size.h);
  const step = 22;
  if (dotPattern?.color !== pal().dots) {
    const c = document.createElement('canvas');
    c.width = c.height = step * 2;
    const g2 = c.getContext('2d');
    g2.fillStyle = pal().dots;
    g2.beginPath();
    g2.arc(step, step, 2.2, 0, Math.PI * 2);
    g2.fill();
    dotPattern = { color: pal().dots, pattern: ctx.createPattern(c, 'repeat') };
  }
  const pat = dotPattern.pattern;
  pat.setTransform(new DOMMatrix().translateSelf(size.w / 2 + view.x - step / 2, size.h / 2 + view.y - step / 2).scaleSelf(0.5));
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, size.w, size.h);
}

// Ligne de départ/arrivée en damier (position calibrée si connue) et flèche du sens de course
function drawStartLine(W) {
  const r0 = store.positions.lineFrac() * track.L;
  const p = screenAt(r0);
  const ang = Math.atan2(-p.nx, p.ny);   // direction de la piste
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  const half = W / 2 + 1.5;
  const rows = Math.max(2, Math.round(W / 4.5));
  const sq = (half * 2) / rows;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#0d0d0f' : '#f6f6f6';
      ctx.fillRect(-sq + j * sq, -half + i * sq, sq, sq);
    }
  }
  ctx.restore();
  // Chevrons du sens de course, un peu après la ligne, à côté de la piste
  const q = screenAt(r0 + track.L / 70);
  const qa = Math.atan2(-q.nx, q.ny);
  ctx.save();
  ctx.translate(q.x - q.nx * (W / 2 + 10), q.y - q.ny * (W / 2 + 10));
  ctx.rotate(qa);
  ctx.strokeStyle = pal().chipText;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const dx of [-4, 3]) {
    ctx.beginPath();
    ctx.moveTo(dx - 3, -4);
    ctx.lineTo(dx + 1, 0);
    ctx.lineTo(dx - 3, 4);
    ctx.stroke();
  }
  ctx.restore();
}

// Fond de carte (tracé, secteurs, zones, drapeaux, virages…) : dessiné dans un calque mis en
// cache et seulement recopié à chaque image tant que rien ne change (la carte ne fait alors
// plus que déplacer les voitures, beaucoup moins coûteux).
const bg = { canvas: null, key: '', flagZones: [] };

function drawBackground(now, red, sc, vsc, scMode, flags, lay) {
  const pts = xf.screen;
  // Carte flottante : aucun fond, seulement la piste et les voitures
  if ($('#mapGrid').checked && !document.documentElement.classList.contains('float-map')) drawBackdrop();
  // Drapeau rouge : toute la carte en rouge
  if (red) {
    const pulse = 0.16 + 0.06 * Math.sin(now / 260);
    ctx.fillStyle = `rgba(255, 40, 40, ${pulse})`;
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, size.w - 6, size.h - 6);
  } else if (scMode) {
    ctx.strokeStyle = `rgba(255, 176, 32, ${0.55 + 0.25 * Math.sin(now / 300)})`;
    ctx.lineWidth = 4;
    if (vsc) ctx.setLineDash([16, 10]);
    ctx.strokeRect(2, 2, size.w - 4, size.h - 4);
    ctx.setLineDash([]);
  }

  // Tracé : ombre portée, bordure (limites de piste), asphalte
  const W = trackWidth();
  drawPitLane(W);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };
  path();
  ctx.save();
  ctx.shadowColor = pal().shadow;
  ctx.shadowBlur = W * 1.4;
  ctx.shadowOffsetY = W * 0.25;
  ctx.strokeStyle = pal().outline;
  ctx.lineWidth = W + 7;
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = red ? 'rgba(255, 110, 100, .55)' : scMode ? 'rgba(255, 205, 110, .55)' : pal().edge;
  ctx.lineWidth = W + 3;
  ctx.stroke();
  ctx.strokeStyle = red ? '#c8302a' : scMode ? '#d39516' : pal().track;
  ctx.lineWidth = W;
  ctx.stroke();
  if (vsc && !red) {
    // VSC : pointillés défilants sur tout le tracé
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -now / 40;
    ctx.strokeStyle = '#1d1200';
    ctx.lineWidth = Math.max(3, W * 0.35);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  } else if (red || scMode || !$('#mapSectors').checked) {
    ctx.strokeStyle = red ? '#ff8a80' : scMode ? '#ffe2a0' : pal().trackLine;
    ctx.lineWidth = Math.max(1.5, W * 0.14);
    ctx.stroke();
  }
  if (!red && !scMode && $('#mapSectors').checked) drawSectors(lay);

  if (!red) drawZones();

  // Secteurs de commissaires sous drapeau jaune / double jaune
  const flagZones = [];
  const marshal = flags.size ? marshalLayout() : null;
  if (marshal) {
    for (const r of marshal.ranges) {
      const f = flags.get(r.number);
      if (!f) continue;
      const dbl = f === 'DOUBLE YELLOW';
      const blink = dbl ? 0.65 + 0.35 * Math.sin(now / 180) : 1;
      // Contour sombre : la zone reste visible même sur la piste orange de la safety car
      ctx.strokeStyle = 'rgba(0, 0, 0, .85)';
      ctx.lineWidth = W + (dbl ? 11 : 8);
      strokeRange(r.from, r.to);
      ctx.globalAlpha = blink;
      ctx.strokeStyle = dbl ? '#ff9f1a' : '#f5c518';
      ctx.lineWidth = W + (dbl ? 6 : 3);
      strokeRange(r.from, r.to);
      ctx.globalAlpha = 1;
      const r0 = track.t[r.from], r1 = track.t[r.to];
      // Fanion au début de la zone avec le numéro du secteur de commissaires
      const p = screenAt(r0);
      const x = p.x + p.nx * (W / 2 + 15), y = p.y + p.ny * (W / 2 + 15);
      // Étiquette : fanion(s) dessiné(s) puis numéro du secteur de commissaires
      ctx.font = `800 10.5px ${FONT()}`;
      const label = String(r.number);
      const fw = (dbl ? 2 : 1) * 7 + 2;
      const bw = Math.max(28, fw + ctx.measureText(label).width + 10);
      ctx.fillStyle = dbl ? '#ff9f1a' : '#f5c518';
      ctx.beginPath();
      ctx.roundRect(x - bw / 2, y - 9, bw, 18, 4);
      ctx.fill();
      const x0 = x - (fw + ctx.measureText(label).width) / 2;
      ctx.fillStyle = ctx.strokeStyle = '#1a1500';
      ctx.lineWidth = 1.3;
      for (let k = 0; k < (dbl ? 2 : 1); k++) {
        const fx = x0 + k * 7 + 1;
        ctx.beginPath();
        ctx.moveTo(fx, y + 5); ctx.lineTo(fx, y - 5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(fx, y - 5); ctx.lineTo(fx + 5, y - 3.2); ctx.lineTo(fx, y - 1.4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(tx(label), x0 + fw, y + 0.5);
      flagZones.push({ number: r.number, dbl, approx: marshal.approx, text: describeZone(lay, r0, r1) });
    }
  }

  drawStartLine(W);

  // Numéros de virage (pastilles à l'extérieur de la piste)
  if ($('#mapCorners').checked && detail() > 1) {
    const fs = Math.min(13, 10 + (view.z - 1) * 1.2);
    ctx.font = `700 ${fs}px ${FONT()}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of track.corners) {
      const a = (c.angle * Math.PI) / 180;
      const [x0, y0] = xf(c.x, c.y), [x1, y1] = xf(c.x + Math.cos(a) * 560, c.y + Math.sin(a) * 560);
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      const rad = fs * 0.75 + (c.number >= 10 ? 2 : 0);
      const off = W / 2 + rad + 9;
      const x = x0 + ((x1 - x0) / len) * off, y = y0 + ((y1 - y0) / len) * off;
      // Trait qui relie la pastille au bord de la piste
      ctx.strokeStyle = pal().chipEdge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + ((x1 - x0) / len) * (W / 2 + 1), y0 + ((y1 - y0) / len) * (W / 2 + 1));
      ctx.lineTo(x - ((x1 - x0) / len) * rad, y - ((y1 - y0) / len) * rad);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = pal().chip;
      ctx.fill();
      ctx.strokeStyle = pal().chipEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = pal().chipText;
      ctx.fillText(tx(String(c.number)), x, y + 0.5);
    }
  }

  if (!red && !scMode && $('#mapSectors').checked && detail() > 1) drawSectorLabels(lay);
  return flagZones;
}

// Écarts de moins d'une seconde entre deux voitures qui se suivent (course) : bulle entre les deux
function drawGaps(cars, lines) {
  const byPos = new Map(cars.filter((c) => c.pos).map((c) => [c.pos, c]));
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const c of cars) {
    if (!c.pos || c.pos < 2 || c.cool) continue;
    const v = parseFloat(String(lines[c.num]?.IntervalToPositionAhead?.Value || '').replace('+', ''));
    const a = byPos.get(c.pos - 1);
    if (!a || !(v >= 0) || v >= 1) continue;
    const dx = a.p[0] - c.p[0], dy = a.p[1] - c.p[1], d = Math.hypot(dx, dy);
    if (d > 260) continue;
    const mx = (a.p[0] + c.p[0]) / 2, my = (a.p[1] + c.p[1]) / 2;
    // Perpendiculaire, du côté opposé au centre de la carte
    let nx = d ? -dy / d : 0, ny = d ? dx / d : -1;
    if ((mx - size.w / 2) * nx + (my - size.h / 2) * ny < 0) { nx = -nx; ny = -ny; }
    const off = Math.max(c.r, a.r) + 20;
    const txt = v.toFixed(2).replace('.', DEC);
    ctx.font = `700 11px ${MONO()}`;
    const w = ctx.measureText(txt).width + 14;
    // Bulle hors de la carte (tracé au bord) : de l'autre côté, et jamais coupée
    const out = (x, y) => x - w / 2 < 2 || x + w / 2 > size.w - 2 || y < 11 || y > size.h - 11;
    if (out(mx + nx * off, my + ny * off)) { nx = -nx; ny = -ny; }
    const bx = Math.min(size.w - w / 2 - 2, Math.max(w / 2 + 2, mx + nx * off));
    const by = Math.min(size.h - 11, Math.max(11, my + ny * off));
    const color = v < 0.7 ? '#34D399' : '#FACC15';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.fillStyle = 'rgba(7,8,10,.94)';
    ctx.beginPath();
    ctx.roundRect(bx - w / 2, by - 9, w, 18, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(tx(txt), bx, by + 0.5);
  }
  ctx.restore();
}

// Pilote suivi (choisi dans le classement) : bulle de télémétrie à côté de sa voiture (vitesse, rapport, accélérateur, frein, écart)
function drawFocusCard(cars, lines, disp) {
  const c = cars.find((x) => x.isF);   // seulement un pilote choisi (pas le pilote A du duel)
  if (!c) return;
  if (size.w < 360 || size.h < 260) return;   // carte trop petite : pas de bulle
  const small = size.w < 560 || size.h < 380;
  const tel = store.positions.carLerp(c.num, disp);
  const l = lines[c.num] || {};
  const W = 176, H = tel && !small ? 82 : tel ? 60 : 46;
  let x = c.p[0] + c.r + 22, y = c.p[1] - c.r - H - 10;
  if (x + W > size.w - 8) x = c.p[0] - c.r - 22 - W;
  if (y < 8) y = c.p[1] + c.r + 10;
  x = Math.max(8, Math.min(size.w - W - 8, x));
  y = Math.max(8, Math.min(size.h - H - 8, y));
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(241,243,246,.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(c.p[0], c.p[1]);
  ctx.lineTo(x + (x > c.p[0] ? 0 : W), y + (y > c.p[1] ? 0 : H));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(14,17,22,.96)';
  ctx.beginPath();
  ctx.roundRect(x, y, W, H, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(241,243,246,.35)';
  ctx.stroke();
  ctx.fillStyle = c.col;
  ctx.beginPath();
  ctx.roundRect(x + 10, y + 11, 4, 22, 2);
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#F1F3F6';
  ctx.font = `800 17px ${FONT()}`;
  const tla = c.d?.Tla || c.num;
  ctx.fillText(tx(tla), x + 20, y + 23);
  const tw = ctx.measureText(tla).width;
  const iv = String(l.IntervalToPositionAhead?.Value || l.TimeDiffToPositionAhead || '');
  ctx.fillStyle = '#8A919C';
  ctx.font = `500 11px ${FONT()}`;
  ctx.fillText(tx(`${c.pos ? `P${c.pos}` : ''}${iv && !/LAP/i.test(iv) ? ` · ${iv} devant` : ''}`), x + 26 + tw, y + 23.5);
  if (tel) {
    ctx.fillStyle = '#F1F3F6';
    ctx.font = `700 20px ${MONO()}`;
    const sp = Math.round(tel.speed || 0);
    ctx.fillText(tx(String(sp)), x + 12, y + 52);
    const sw = ctx.measureText(String(sp)).width;
    ctx.fillStyle = '#8A919C';
    ctx.font = `600 10.5px ${FONT()}`;
    ctx.fillText(tx(`KM/H · ${tel.gear === 0 ? 'N' : tel.gear ?? '—'}e · ${Math.round((tel.rpm || 0) / 10) * 10} tr/min`), x + 18 + sw, y + 53);
    const bw = 96;
    if (small) { ctx.restore(); return; }
    ctx.fillStyle = '#1C2028';
    ctx.beginPath(); ctx.roundRect(x + 12, y + 66, bw, 5, 2.5); ctx.fill();
    ctx.fillStyle = '#34D399';
    ctx.beginPath(); ctx.roundRect(x + 12, y + 66, (bw * Math.max(0, Math.min(100, tel.thr || 0))) / 100, 5, 2.5); ctx.fill();
    ctx.fillStyle = (tel.brk || 0) > 0 ? '#FF453A' : '#1C2028';
    ctx.beginPath(); ctx.roundRect(x + bw + 20, y + 66, 44, 5, 2.5); ctx.fill();
  }
  ctx.restore();
}

// Bande « ordre sur la piste » : chaque voiture le long du tour, de la ligne à la ligne
let lastCars = [];
function drawRibbon(lay, flagZones) {
  const el = $('#mapRibbon');
  const on = $('#mapRibbon2').checked && track && lay;
  el.hidden = !on;
  $('.p-map .map-wrap')?.classList.toggle('with-ribbon', !!on);
  if (!on) return;
  const r = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (!r.width) return;
  if (el.width !== Math.round(r.width * dpr) || el.height !== Math.round(r.height * dpr)) { el.width = Math.round(r.width * dpr); el.height = Math.round(r.height * dpr); }
  const g = el.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, r.width, r.height);
  const pad = 14, w = r.width - pad * 2, mid = r.height / 2;
  const X = (q) => pad + q * w;
  const cols = ['#E10600', '#60A5FA', '#FB923C'];
  for (let i = 0; i < 3; i++) {
    g.fillStyle = cols[i];
    g.globalAlpha = 0.55;
    g.fillRect(X(lay.qb[i]), mid - 2.5, (lay.qb[i + 1] - lay.qb[i]) * w, 5);
  }
  g.globalAlpha = 1;
  const L = track.L, line = store.positions.lineFrac();
  const disp = displayNow();
  const gps = store.positions.hasGps(disp);
  const pts = [];
  for (const c of lastCars) {
    const p = gps ? store.positions.progressAt(c.num, disp) : store.positions.estimatedProgress(c.num, disp);
    if (p === null || p === undefined) continue;
    pts.push({ c, q: mod(p / L - line, 1) });
  }
  pts.sort((a, b) => a.q - b.q);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 10px ${FONT()}`;
  for (const { c, q } of pts) {
    const x = X(q);
    g.beginPath();
    g.arc(x, mid, c.sp ? 6 : 5, 0, Math.PI * 2);
    g.fillStyle = c.col;
    g.fill();
    g.strokeStyle = lightUI() ? (c.isF ? '#0E1116' : '#FFFFFF') : (c.isF ? '#F1F3F6' : '#07080A');
    g.lineWidth = c.isF ? 2 : 1.2;
    g.stroke();
  }
  // Noms au-dessus ou en dessous, sans chevauchement (pilotes suivis d'abord, puis ordre de course)
  const rows = [[], []];
  const order = [...pts].sort((a, b) => (b.c.sp - a.c.sp) || ((a.c.pos || 99) - (b.c.pos || 99)));
  for (const { c, q } of order) {
    const x = X(q), txt = c.d?.Tla || c.num, half = g.measureText(txt).width / 2 + 3;
    const row = [0, 1].find((k) => rows[k].every(([a, b]) => x + half < a || x - half > b));
    if (row === undefined) continue;
    rows[row].push([x - half, x + half]);
    g.fillStyle = lightUI() ? (c.isF ? '#0E1116' : c.sp ? '#3D4552' : '#6B7380') : (c.isF ? '#F1F3F6' : c.sp ? '#D5D9E0' : '#8A919C');
    g.fillText(tx(txt), x, row ? mid + 14 : mid - 13);
  }
}

// Traînées : dernières positions de chaque voiture (~1 s)
const TRAIL_LEN = 24;
const trail = new Map();

function drawCars(dt) {
  const s = store.state;
  const dl = drivers(s);
  const lines = s.TimingData?.Lines || {};
  const disp = displayNow();
  const gps = store.positions.hasGps(disp);
  // Petite carte : simples points (noms seulement pour les pilotes suivis) ; moyenne : sans écarts ni positions
  const lod = detail();
  const labels = $('#mapLabels').checked && lod > 0;
  const mode = $('#mapMode');
  const modeTxt = gps ? 'GPS' : 'Positions estimées';
  if (mode.textContent !== modeTxt) {
    mode.textContent = modeTxt;
    mode.className = `map-mode ${gps ? 'gps' : 'est'}`;
    mode.title = gps ? 'Positions GPS officielles' : 'Sans GPS (F1 TV non connecté) : positions estimées';
  }

  const order = Object.keys(dl).sort((a, b) => (Number(lines[b]?.Position) || 99) - (Number(lines[a]?.Position) || 99));
  // Pilotes du duel marqués seulement quand le panneau Duel est affiché (pas en Essentiel, ni panneau masqué)
  const duel = document.querySelector('.p-duel')?.getClientRects().length ? store.duel : {};
  const special = new Set([duel.a, duel.b, store.focus].filter(Boolean));
  const drawOrder = [...order.filter((n) => !special.has(n)), ...order.filter((n) => special.has(n))];

  let inPit = 0;
  const followNum = store.focus || duel.a;
  if (!followNum) followTarget = null;
  const W = trackWidth();
  const trails = $('#mapTrails').checked;
  const hideOut = !$('#mapShowOut').checked;
  const red = String(store.state.TrackStatus?.Status || '') === '5' || store.state.SessionStatus?.Status === 'Aborted';
  const nowMs = performance.now();
  const cars = [];
  for (const num of drawOrder) {
    const l = lines[num] || {};
    // Pilotes hors course (abandon, voiture arrêtée, éliminé en qualif) : retirés de la carte
    // (case « Pilotes hors course » du menu Calques). Sous drapeau rouge, une voiture arrêtée
    // dans les stands n'est pas hors course.
    if (l.Retired || (hideOut && (l.KnockedOut || (l.Stopped && !red)))) { trail.delete(num); continue; }
    let g = null;
    if (gps) g = store.positions.gpsAt(num, disp);
    else {
      if (l.InPit || l.Stopped) { if (l.InPit) inPit++; trail.delete(num); continue; }
      g = store.positions.estimatedXY(num, disp, dt);
    }
    if (!g) continue;
    const p = xf(g.x, g.y);
    if (num === followNum) {
      // Coordonnées "de base" (sans vue) pour centrer la vue à l'image suivante.
      followTarget = [(p[0] - size.w / 2 - view.x) / view.z + size.w / 2, (p[1] - size.h / 2 - view.y) / view.z + size.h / 2];
    }
    // Historique des positions (coordonnées circuit) pour la traînée
    let h = trail.get(num);
    if (!h) trail.set(num, h = []);
    const last = h.at(-1);
    if (last && Math.hypot(g.x - last.x, g.y - last.y) > 2500) h.length = 0;   // saut (replay, stands)
    if (!last || nowMs - last.t > 45) {
      h.push({ x: g.x, y: g.y, t: nowMs });
      if (h.length > TRAIL_LEN) h.shift();
    }
    const d = dl[num];
    const isA = duel.a === num, isB = duel.b === num, isF = store.focus === num;
    const sp = isA || isB || isF;
    // Avec les noms : pastille ronde avec le trigramme à l'intérieur ; sinon simple point
    const r = labels ? Math.max(12, Math.min(16, W * 0.85)) + (sp ? 1.5 : 0) : Math.max(5.5, Math.min(10, W * 0.55)) + (sp ? 1.5 : 0);
    cars.push({ num, p, h, d, col: teamColor(d), isA, isB, isF, sp, pos: Number(l.Position) || null, r });
  }

  // Traînées (dégradé vers la couleur de l'écurie)
  if (trails) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const c of cars) {
      const n = c.h.length;
      if (n < 3) continue;
      let prev = xf(c.h[0].x, c.h[0].y);
      for (let i = 1; i < n; i++) {
        const cur = i === n - 1 ? c.p : xf(c.h[i].x, c.h[i].y);
        const k = i / n;
        ctx.globalAlpha = 0.7 * k * k;
        ctx.strokeStyle = c.col;
        ctx.lineWidth = c.r * 1.3 * (0.35 + 0.65 * k);
        ctx.beginPath();
        ctx.moveTo(prev[0], prev[1]);
        ctx.lineTo(cur[0], cur[1]);
        ctx.stroke();
        prev = cur;
      }
    }
    ctx.restore();
  }

  // Voitures (essais / qualifs, option : celles hors tour lancé sont estompées)
  const posOpt = $('#mapPosBadges').checked, posBadges = posOpt && lod > 1;
  const hot = hotLaps();
  for (const c of cars) c.cool = !!hot && !hot.has(c.num) && !c.sp;
  for (const c of cars) {
    const [x, y] = c.p;
    ctx.globalAlpha = c.cool ? 0.3 : 1;
    if (!c.sp && posOpt && c.pos === 1) {
      // Leader : anneau jaune
      ctx.beginPath();
      ctx.arc(x, y, c.r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (c.sp) {
      ctx.beginPath();
      ctx.arc(x, y, c.r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = c.isA ? '#3ea6ff' : c.isB ? '#ff9f1a' : '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    // Ombre (disque sombre décalé, moins coûteux qu'un flou à chaque image)
    ctx.beginPath();
    ctx.arc(x + 0.8, y + 1.6, c.r + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, .45)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = c.col;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal().ring;
    ctx.stroke();
    if (labels) {
      // Trigramme dans la pastille
      ctx.fillStyle = inkOn(c.col);
      ctx.font = `800 ${(c.r * 0.78).toFixed(1)}px ${FONT()}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tx(c.d?.Tla || c.num), x, y + 0.5);
      if (posBadges && c.pos) {
        // Numéro de position dans un petit rond, en haut à droite de la pastille
        const br = Math.max(6.5, c.r * 0.48), bx = x + c.r * 0.82, by = y - c.r * 0.82;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = '#07080A';
        ctx.fill();
        ctx.strokeStyle = c.pos === 1 ? '#FACC15' : '#3A414D';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = '#F1F3F6';
        ctx.font = `700 ${(br * 1.2).toFixed(1)}px ${MONO()}`;
        ctx.fillText(tx(String(c.pos)), bx, by + 0.5);
      }
    } else {
      // Reflet
      ctx.beginPath();
      ctx.arc(x - c.r * 0.3, y - c.r * 0.35, c.r * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, .28)';
      ctx.fill();
    }
    if (!gps) {
      ctx.beginPath();
      ctx.arc(x, y, c.r, 0, Math.PI * 2);
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.globalAlpha = 1;

  // Étiquettes : position + trigramme, placées sans se chevaucher (pilotes suivis puis ordre de course)
  const now = performance.now();
  const placed = cars.map((c) => ({ x: c.p[0] - c.r, y: c.p[1] - c.r, w: c.r * 2, h: c.r * 2, num: c.num }));
  const hit = (b, num) => b.x < 2 || b.y < 2 || b.x + b.w > size.w - 2 || b.y + b.h > size.h - 2 || placed.some((o) => o.num !== num && b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
  const prio = cars.filter((c) => !labels && c.sp).sort((a, b) => (b.sp - a.sp) || ((a.pos || 99) - (b.pos || 99)));
  ctx.textBaseline = 'middle';
  for (const c of prio) {
    const txt = c.d?.Tla || c.num;
    const fs = c.sp ? 12 : 10.5;
    const h = c.sp ? 18 : 16;
    ctx.font = `800 ${fs}px ${FONT()}`;
    const posTxt = c.pos ? String(c.pos) : '';
    const pw = posTxt ? ctx.measureText(posTxt).width + 8 : 0;
    ctx.font = `700 ${fs}px ${FONT()}`;
    const w = pw + ctx.measureText(txt).width + 9;
    const [x, y] = c.p;
    const g = c.r + 4;
    const spots = [[x + g, y - h / 2], [x - g - w, y - h / 2], [x + c.r - 2, y - c.r - h - 1], [x + c.r - 2, y + c.r + 1], [x - c.r - w + 2, y - c.r - h - 1], [x - c.r - w + 2, y + c.r + 1]];
    // Côté de l'étiquette gardé d'une image à l'autre : elle ne change de côté que si sa place
    // reste prise plus de 0,7 s (sinon les étiquettes sautent sans arrêt dans les paquets)
    const memo = labelSide.get(c.num);
    const free = (i) => !hit({ x: spots[i][0], y: spots[i][1], w, h }, c.num);
    let idx = memo && free(memo.i) ? memo.i : -1;
    if (idx >= 0) memo.blocked = 0;
    else {
      const first = spots.findIndex((_, i) => free(i));
      if (memo && (first < 0 || (memo.blocked ||= now) > now - 700)) idx = memo.i;
      else idx = first >= 0 ? first : 0;
    }
    const crowded = !free(idx);
    if (!memo || memo.i !== idx) labelSide.set(c.num, { i: idx, blocked: 0 });
    const [lx, ly] = spots[idx];
    placed.push({ x: lx, y: ly, w, h, num: c.num });
    ctx.globalAlpha = c.cool ? 0.3 : crowded && !c.sp ? 0.55 : 1;
    ctx.fillStyle = pal().label;
    ctx.beginPath();
    ctx.roundRect(lx, ly, w, h, 4);
    ctx.fill();
    if (pw) {
      ctx.fillStyle = c.col;
      ctx.beginPath();
      ctx.roundRect(lx, ly, pw, h, [4, 0, 0, 4]);
      ctx.fill();
      ctx.fillStyle = inkOn(c.col);
      ctx.font = `800 ${fs}px ${FONT()}`;
      ctx.textAlign = 'center';
      ctx.fillText(tx(posTxt), lx + pw / 2, ly + h / 2 + 0.5);
    } else {
      ctx.fillStyle = c.col;
      ctx.fillRect(lx, ly, 2.5, h);
    }
    ctx.fillStyle = '#eef0f5';
    ctx.font = `700 ${fs}px ${FONT()}`;
    ctx.textAlign = 'left';
    ctx.fillText(tx(txt), lx + (pw || 3) + 4, ly + h / 2 + 0.5);
    ctx.globalAlpha = 1;
  }

  if ($('#mapGaps').checked && lod > 1) drawGaps(cars, lines);
  if ($('#mapFocusCard').checked) drawFocusCard(cars, lines, disp);
  lastCars = cars;

  const legend = $('#mapLegend');
  const txt = !gps && inPit ? `${inPit} voiture(s) aux stands` : '';
  if (legend.textContent !== txt) legend.textContent = txt;
}

// Cases de la carte mémorisées d'une session à l'autre
const MAP_OPTS = ['mapLabels', 'mapCorners', 'mapSectors', 'mapMiniNums', 'mapZones', 'mapPit', 'mapFlagText', 'mapShowOut', 'mapTrails', 'mapGrid', 'mapPosBadges', 'mapGaps', 'mapFocusCard', 'mapRibbon2'];
// Calques décochés par défaut sur téléphone : traînées, bulles d'écart et de télémétrie, bande de l'ordre,
// numéros de virage, zones de dépassement, liste des drapeaux (restent : pastilles, positions, secteurs, stands)
const MOBILE_OFF = ['mapTrails', 'mapGaps', 'mapFocusCard', 'mapRibbon2', 'mapCorners', 'mapZones', 'mapFlagText'];

function initMapOptions() {
  const saved = storageGet('paddock.mapOpts', {});
  // Nouveau dessin de la carte (v2) : fond uni par défaut, l'ancien choix du fond est oublié
  if (saved.v !== 2) delete saved.mapGrid;
  // Téléphone (petite carte) : allégée au premier affichage, une seule fois (les choix restent ensuite)
  if (matchMedia('(pointer: coarse) and (max-width: 900px)').matches && !saved.mob) {
    for (const id of MOBILE_OFF) saved[id] = false;
    saved.mob = 1;
  }
  const save = () => storageSet('paddock.mapOpts', { v: 2, mob: saved.mob, ...Object.fromEntries(MAP_OPTS.map((k) => [k, $(`#${k}`).checked])) });
  for (const id of MAP_OPTS) {
    const el = $(`#${id}`);
    if (typeof saved[id] === 'boolean') el.checked = saved[id];
    el.addEventListener('change', save);
    if (id === 'mapRibbon2') el.addEventListener('change', () => { xf = null; });
  }
  // Overlay de streaming : calques choisis dans Réglages → Streaming (appliqués en direct), sinon
  // dans l'adresse (&layers=labels,trails…, anciens liens)
  if (document.documentElement.classList.contains('overlay')) {
    const layers = (list) => { const set = new Set(list); for (const id of MAP_OPTS) $(`#${id}`).checked = set.has(id.slice(3).toLowerCase()); };
    const want = new URLSearchParams(location.search).get('layers');
    if (want !== null) layers(want.split(','));
    if (store.overlayCfg?.map?.layers) layers(store.overlayCfg.map.layers);
    on('overlayCfg', (cfg) => { if (cfg?.map?.layers) layers(cfg.map.layers); });
  }
  const hot = $('#hotLapDim');
  hot.checked = prefs.hotLapDim;
  hot.addEventListener('change', (e) => setPref('hotLapDim', e.target.checked));
  on('prefs', (k) => { if (k === 'hotLapDim') hot.checked = prefs.hotLapDim; });
}

export function initMap() {
  initMapOptions();
  ctx = canvas().getContext('2d');
  const c = canvas();
  // Zoom à la molette autour du curseur, déplacement à la souris, double-clic = vue d'ensemble.
  c.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = c.getBoundingClientRect();
    const mx = e.clientX - r.left - size.w / 2, my = e.clientY - r.top - size.h / 2;
    const z0 = view.z;
    view.z = Math.max(1, Math.min(8, view.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    view.x = mx - ((mx - view.x) * view.z) / z0;
    view.y = my - ((my - view.y) * view.z) / z0;
    if (view.z === 1) resetView();
  }, { passive: false });
  let drag = null;
  c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', (e) => {
    if (!drag) return;
    view.x = drag.vx + e.clientX - drag.x;
    view.y = drag.vy + e.clientY - drag.y;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) $('#mapFollow').checked = false;
  });
  c.addEventListener('pointerup', () => { drag = null; });
  const reset = () => { resetView(); $('#mapFollow').checked = false; };
  c.addEventListener('dblclick', reset);
  $('#mapReset').addEventListener('click', reset);
  // Boutons + / − : zoom autour du centre de la carte
  for (const b of document.querySelectorAll('.map-zoom [data-mz="in"], .map-zoom [data-mz="out"]')) {
    b.addEventListener('click', () => {
      const z0 = view.z;
      view.z = Math.max(1, Math.min(8, view.z * (b.dataset.mz === 'in' ? 1.4 : 1 / 1.4)));
      view.x *= view.z / z0;
      view.y *= view.z / z0;
      if (view.z === 1) resetView();
    });
  }
  // Menu des calques : se ferme au clic ailleurs ou avec Échap
  const layers = $('#mapLayers');
  document.addEventListener('pointerdown', (e) => { if (layers.open && !layers.contains(e.target)) layers.open = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') layers.open = false; });
  $('#mapFollow').addEventListener('change', (e) => { if (!e.target.checked) resetView(); });
  // Allègement : petite ou moyenne carte à 30 images/s (la grande garde 60) ; en pause, aucun
  // redessin tant que rien ne change (vue, données, options, apparence)
  let lastDraw = 0;
  let idleKey = '';
  const loop = (now) => {
    requestAnimationFrame(loop);
    if (v3d.on) return;   // vue 3D affichée à la place
    if (xf && detail() < 2 && now - lastDraw < 1000 / 30 - 2) return;
    const ts = String(store.state.TrackStatus?.Status || '1');
    if (store.status?.paused && (ts === '1' || ts === '2')) {
      const c = canvas();
      const k = [displayNow(), view.x, view.y, view.z, c?.clientWidth, c?.clientHeight, store.ver.__any, store.focus, store.duel.a, store.duel.b,
        MAP_OPTS.map((o) => $(`#${o}`)?.checked).join(), document.documentElement.dataset.scheme, trackKey, !!zones].join('|');
      if (k === idleKey) return;
      idleKey = k;
    } else idleKey = '';
    lastDraw = now;
    try { draw(); } catch (err) { console.error(err); }
  };
  requestAnimationFrame(loop);
  init3d();
}

// Vue 3D (ui/map3d.js, chargée à la demande) à la place de la carte 2D, choix gardé ; retour en 2D, avec un message,
// si WebGL manque ou si la carte graphique perd la vue. Pas dans la carte flottante ni l'overlay de streaming
const v3d = { on: false, view: null, turn: 0, timer: 0 };
function init3d() {
  // Case « 3D » du panneau Circuit : vue 3D activée ou non, choix gardé
  const tog = $('#map3dTog');
  const html = document.documentElement;
  if (!tog || html.classList.contains('float-map') || html.classList.contains('overlay')) return;
  tog.hidden = false;
  $('#map3dOpt').addEventListener('change', (e) => set3d(e.target.checked));
  if (storageGet('paddock.map3d', {}).on) set3d(true);
}

async function set3d(on, msg = '') {
  const turn = ++v3d.turn;
  v3d.view?.close();
  v3d.view = null;
  v3d.on = on;
  const box = $('#map3dMsg');
  $('.p-map').classList.toggle('is-3d', on);
  $('#map3dOpt').checked = on;
  storageSet('paddock.map3d', { ...storageGet('paddock.map3d', {}), on });
  box.textContent = msg;
  box.hidden = !msg;
  clearTimeout(v3d.timer);
  if (msg) v3d.timer = setTimeout(() => { box.hidden = true; }, 8000);
  if (!on) { xf = null; return; }
  try {
    const m = await import('./map3d.js');
    if (turn !== v3d.turn) return;
    v3d.view = m.open($('#map3d'), { getTrack: () => track, getElevation: () => elevation, getSurroundings: surroundingsNow, onFail: (why) => set3d(false, why) });
    if (!v3d.view) set3d(false, t('Vue 3D indisponible : cet appareil ne prend pas en charge WebGL'));
  } catch (err) {
    if (turn === v3d.turn) set3d(false, t('Vue 3D indisponible ({})', err.message));
  }
}

// Alentours du circuit (relief du terrain, bâtiments, arbres… : serveur), lus seulement pour la vue 3D, à sa première
// image ; pas encore calculés (404) ou serveur injoignable : redemandés 2 minutes plus tard
let surr = { key: null, data: null };
function surroundingsNow() {
  if (!track || surr.key === trackKey) return surr.data;
  const k = trackKey, [key, year] = k.split('-');
  surr = { key: k, data: null };
  api(`/api/surroundings?key=${key}&year=${year}`)
    .then((d) => { if (surr.key === k) surr.data = d; }, () => setTimeout(() => { if (surr.key === k) surr.key = null; }, 120e3));
  return null;
}

export function currentTrack() {
  return track;
}

