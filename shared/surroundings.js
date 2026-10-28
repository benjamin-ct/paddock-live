// Alentours d'un circuit pour la vue 3D : relief (modèle numérique de terrain ouvert, tuiles Terrain Tiles au format
// terrarium) et ce qu'il y a autour d'après OpenStreetMap (bâtiments, tribunes, bois et arbres, eau, herbe, routes,
// parkings). Le tracé MultiViewer est dans un repère local (x, y en 1/10 m, sans latitude ni longitude) : il est calé
// sur les lignes highway=raceway d'OSM (angle cherché sur tout le tour par votes, puis affiné point par point), et
// tout est rendu dans son repère, en mètres. Calculé par le serveur (analytics/surroundings.js) ; ici, seulement
// les calculs, sans réseau.
import { smooth } from './elevation.js';

const R_EARTH = 6371008.8;
const TILE = 256;

// ---------- Tuiles d'altitude ----------

// Image PNG (8 bits par canal, RVB ou RVBA, non entrelacée : celle des tuiles) -> { width, height, channels, data }
export async function decodePng(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 8 || dv.getUint32(0) !== 0x89504e47) throw new Error('pas une image PNG');
  let width = 0, height = 0, ch = 0;
  const parts = [];
  for (let o = 8; o + 8 <= b.length;) {
    const len = dv.getUint32(o), type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
    if (type === 'IHDR') {
      width = dv.getUint32(o + 8);
      height = dv.getUint32(o + 12);
      ch = { 2: 3, 6: 4 }[b[o + 17]];
      if (b[o + 16] !== 8 || !ch || b[o + 20]) throw new Error('PNG non pris en charge');
    } else if (type === 'IDAT') parts.push(b.subarray(o + 8, o + 8 + len));
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  const raw = new Uint8Array(await new Response(new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const stride = width * ch, out = new Uint8Array(height * stride);
  if (raw.length < height * (stride + 1)) throw new Error('PNG tronquée');
  // Lignes filtrées (premier octet : filtre de la ligne)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[dst + x - ch] : 0, up = y ? out[dst - stride + x] : 0, c = x >= ch && y ? out[dst - stride + x - ch] : 0;
      let p = 0;
      if (f === 1) p = a;
      else if (f === 2) p = up;
      else if (f === 3) p = (a + up) >> 1;
      else if (f === 4) {
        const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      } else if (f) throw new Error('PNG : filtre inconnu');
      out[dst + x] = (raw[src + x] + p) & 255;
    }
  }
  return { width, height, channels: ch, data: out };
}

// Tuile terrarium -> altitude de chaque pixel (m) : h = R × 256 + G + B / 256 − 32768
export function terrarium({ width, height, channels, data }) {
  const h = new Float32Array(width * height);
  for (let i = 0; i < h.length; i++) { const k = i * channels; h[i] = data[k] * 256 + data[k + 1] + data[k + 2] / 256 - 32768; }
  return h;
}

// Coordonnées en pixels du monde au zoom z (Web Mercator, tuiles de 256 pixels)
export const lonToPx = (lon, z) => ((lon + 180) / 360) * TILE * 2 ** z;
export const latToPx = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE * 2 ** z; };

// Tuiles qui couvrent la zone { s, w, n, e } (degrés) : le zoom le plus fin (zmax au plus) qui en demande au plus max
export function tilesFor({ s, w, n, e }, max = 20, zmax = 14) {
  for (let z = zmax; ; z--) {
    const x0 = Math.floor(lonToPx(w, z) / TILE), x1 = Math.floor(lonToPx(e, z) / TILE);
    const y0 = Math.floor(latToPx(n, z) / TILE), y1 = Math.floor(latToPx(s, z) / TILE);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > max && z > 8) continue;
    const list = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) list.push({ z, x, y });
    return list;
  }
}

// Altitude (m) en (lat, lon), bilinéaire entre les pixels ; tiles : Map 'x/y' -> altitudes (Float32Array 256 × 256)
// au zoom z ; au bord des tuiles lues, les pixels voisins qui manquent sont ignorés ; NaN hors des tuiles
export function demSampler(z, tiles) {
  const at = (px, py) => { const t = tiles.get(`${Math.floor(px / TILE)}/${Math.floor(py / TILE)}`); return t ? t[(py & 255) * TILE + (px & 255)] : NaN; };
  return (lat, lon) => {
    const fx = lonToPx(lon, z) - 0.5, fy = latToPx(lat, z) - 0.5, x = Math.floor(fx), y = Math.floor(fy), u = fx - x, v = fy - y;
    let sum = 0, w = 0;
    for (const [dx, dy, k] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
      const h = at(x + dx, y + dy);
      if (Number.isFinite(h)) { sum += h * k; w += k; }
    }
    return w > 0 ? sum / w : NaN;
  };
}

// Latitude / longitude <-> mètres vers l'est et vers le nord depuis (lat0, lon0) (projection plate : quelques mètres
// d'écart au plus sur la zone d'un circuit)
export function geoFrame(lat0, lon0) {
  const k = (Math.PI / 180) * R_EARTH, kx = k * Math.cos((lat0 * Math.PI) / 180);
  return { toEN: (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * k], toGeo: (e, n) => [lat0 + n / k, lon0 + e / kx] };
}

// ---------- Calage du tracé sur OSM ----------

// Points d'une ligne tous les step mètres (sommets compris)
export function densify(line, step) {
  const out = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1], k = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let j = 0; j < k; j++) out.push([ax + ((bx - ax) * j) / k, ay + ((by - ay) * j) / k]);
  }
  if (line.length) out.push(line.at(-1));
  return out;
}

// Points du tracé (boucle) régulièrement espacés : n points
function resample(pts, n) {
  const loop = [...pts, pts[0]], cum = [0];
  for (let i = 1; i < loop.length; i++) cum.push(cum[i - 1] + Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]));
  const out = [];
  for (let k = 0, i = 0; k < n; k++) {
    const d = (k / n) * cum.at(-1);
    while (cum[i + 1] < d) i++;
    const u = (d - cum[i]) / (cum[i + 1] - cum[i] || 1);
    out.push([loop[i][0] + (loop[i + 1][0] - loop[i][0]) * u, loop[i][1] + (loop[i + 1][1] - loop[i][1]) * u]);
  }
  return out;
}

// Recherche du point le plus proche parmi pts (grille de cases de cell mètres)
function nearIndex(pts, cell = 25) {
  const grid = new Map(), key = (i, j) => i * 100003 + j;
  pts.forEach(([x, y], k) => {
    const g = key(Math.floor(x / cell), Math.floor(y / cell));
    if (!grid.has(g)) grid.set(g, []);
    grid.get(g).push(k);
  });
  // Distance au point le plus proche (au plus max mètres, sinon Infinity) et ce point
  return (x, y, max) => {
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell), r = Math.ceil(max / cell);
    let bd = max * max, best = -1;
    for (let i = ci - r; i <= ci + r; i++) {
      for (let j = cj - r; j <= cj + r; j++) {
        for (const k of grid.get(key(i, j)) || []) { const d = (pts[k][0] - x) ** 2 + (pts[k][1] - y) ** 2; if (d < bd) { bd = d; best = k; } }
      }
    }
    return best < 0 ? { d: Infinity, p: null } : { d: Math.sqrt(bd), p: pts[best] };
  };
}

// Transformation du repère du tracé (X, Y en m) vers le terrain (est, nord en m) : similitude (échelle s proche de 1,
// angle a, décalage e, n). Le repère MultiViewer n'est jamais retourné (vu sur tous les circuits essayés)
export const toEN = (f, x, y) => {
  const c = Math.cos(f.a) * f.s, s = Math.sin(f.a) * f.s;
  return [c * x - s * y + f.e, s * x + c * y + f.n];
};
export const fromEN = (f, e, n) => {
  const dx = e - f.e, dy = n - f.n, c = Math.cos(f.a) / f.s, s = Math.sin(f.a) / f.s;
  return [c * dx + s * dy, -s * dx + c * dy];
};

// Similitude qui envoie au mieux les points src sur dst (moindres carrés), échelle entre 0,95 et 1,05
function similarity(src, dst) {
  const n = src.length;
  let mx = 0, my = 0, qx = 0, qy = 0;
  for (let i = 0; i < n; i++) { mx += src[i][0] / n; my += src[i][1] / n; qx += dst[i][0] / n; qy += dst[i][1] / n; }
  let sxx = 0, sxy = 0, pp = 0;
  for (let i = 0; i < n; i++) {
    const ax = src[i][0] - mx, ay = src[i][1] - my, bx = dst[i][0] - qx, by = dst[i][1] - qy;
    sxx += ax * bx + ay * by;
    sxy += ax * by - ay * bx;
    pp += ax * ax + ay * ay;
  }
  const a = Math.atan2(sxy, sxx), s = Math.min(1.05, Math.max(0.95, Math.hypot(sxx, sxy) / (pp || 1)));
  const c = Math.cos(a) * s, sn = Math.sin(a) * s;
  return { s, a, e: qx - (c * mx - sn * my), n: qy - (sn * mx + c * my) };
}

// Calage : track = points du tracé (X, Y en m), lines = lignes highway=raceway d'OSM (est, nord en m). Angle cherché
// tous les 3°, le décalage par votes (chaque point du tracé vote pour les décalages qui le posent sur une ligne), puis
// affinage point par point (ICP). -> { s, a, e, n, err (écart moyen, m), p90, near (part du tracé à moins de 10 m
// d'une ligne) } ; null sans lignes
export function fitTrack(track, lines) {
  const osm = lines.flatMap((l) => densify(l, 2));
  if (osm.length < 10 || track.length < 10) return null;
  const near = nearIndex(osm);
  const coarse = osm.filter((_, i) => i % 8 === 0);   // tous les 16 m
  const few = resample(track, 40);
  const cx = few.reduce((s, p) => s + p[0], 0) / few.length, cy = few.reduce((s, p) => s + p[1], 0) / few.length;
  const CELL = 30;
  // Candidats : pour chaque angle, le décalage le plus voté
  const cands = [];
  for (let deg = 0; deg < 360; deg += 3) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const votes = new Map();
    for (const [x, y] of few) {
      const rx = c * (x - cx) - s * (y - cy), ry = s * (x - cx) + c * (y - cy), seen = new Set();
      for (const [ox, oy] of coarse) {
        const k = Math.round((ox - rx) / CELL) * 100003 + Math.round((oy - ry) / CELL);
        if (!seen.has(k)) { seen.add(k); votes.set(k, (votes.get(k) || 0) + 1); }
      }
    }
    let best = 0, bk = 0;
    for (const [k, v] of votes) if (v > best) { best = v; bk = k; }
    const ti = Math.round(bk / 100003);
    // Décalage tel que le centre du tracé tombe sur le décalage voté
    cands.push({ votes: best, f: { s: 1, a, e: ti * CELL - (c * cx - s * cy), n: (bk - ti * 100003) * CELL - (s * cx + c * cy) } });
  }
  cands.sort((p, q) => q.votes - p.votes);
  // Affinage des meilleurs candidats ; le plus proche des lignes gagne
  const pts = resample(track, Math.min(1500, Math.max(200, Math.round(perimeter(track) / 5))));
  let out = null;
  for (let { f } of cands.slice(0, 6)) {
    for (let it = 0, max = 60; it < 40; it++, max = Math.max(12, max * 0.85)) {
      const src = [], dst = [];
      for (const [x, y] of pts) {
        const [e, n] = toEN(f, x, y), m = near(e, n, max);
        if (m.p) { src.push([x, y]); dst.push(m.p); }
      }
      if (src.length < pts.length * 0.3) break;
      f = similarity(src, dst);
    }
    const d = pts.map(([x, y]) => Math.min(100, near(...toEN(f, x, y), 100).d)).sort((p, q) => p - q);
    const res = { ...f, err: d.reduce((s, v) => s + v, 0) / d.length, p90: d[Math.floor(d.length * 0.9)], near: d.filter((v) => v < 10).length / d.length };
    if (!out || res.err < out.err) out = res;
  }
  return out;
}

const perimeter = (pts) => pts.reduce((s, p, i) => s + Math.hypot(p[0] - pts[(i + 1) % pts.length][0], p[1] - pts[(i + 1) % pts.length][1]), 0);

// ---------- Formes : simplification, découpe, assemblage ----------

// Douglas-Peucker : sommets à moins de tol mètres de la ligne simplifiée retirés (anneau : fermé, premier point non répété)
export function simplify(pts, tol, ring = false) {
  if (pts.length < 3) return pts.slice();
  if (ring) {
    // Coupé en deux au point le plus loin du premier, chaque moitié simplifiée
    let far = 0, fd = -1;
    pts.forEach((p, i) => { const d = (p[0] - pts[0][0]) ** 2 + (p[1] - pts[0][1]) ** 2; if (d > fd) { fd = d; far = i; } });
    const a = simplify(pts.slice(0, far + 1), tol), b = simplify([...pts.slice(far), pts[0]], tol);
    return [...a, ...b.slice(1, -1)];
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const [ax, ay] = pts[i], [bx, by] = pts[j], dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let far = -1, fd = tol * tol;
    for (let k = i + 1; k < j; k++) {
      const u = len2 ? Math.max(0, Math.min(1, ((pts[k][0] - ax) * dx + (pts[k][1] - ay) * dy) / len2)) : 0;
      const d = (pts[k][0] - ax - u * dx) ** 2 + (pts[k][1] - ay - u * dy) ** 2;
      if (d > fd) { fd = d; far = k; }
    }
    if (far > 0) { keep[far] = 1; stack.push([i, far], [far, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

// Polygone découpé au rectangle [x0, y0, x1, y1] (Sutherland-Hodgman)
export function clipRing(ring, [x0, y0, x1, y1]) {
  let out = ring;
  for (const [axis, lim, low] of [[0, x0, false], [0, x1, true], [1, y0, false], [1, y1, true]]) {
    const inside = (p) => (low ? p[axis] <= lim : p[axis] >= lim);
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const p = src[i], q = src[(i + 1) % src.length];
      if (inside(p)) out.push(p);
      if (inside(p) !== inside(q)) {
        const u = (lim - p[axis]) / (q[axis] - p[axis]);
        out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]);
      }
    }
    if (!out.length) return out;
  }
  return out;
}

// Ligne découpée au rectangle (Liang-Barsky, segment par segment) : morceaux à l'intérieur
export function clipLine(line, [x0, y0, x1, y1]) {
  const out = [];
  let cur = [];
  const cut = () => { if (cur.length > 1) out.push(cur); cur = []; };
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i], dx = line[i + 1][0] - ax, dy = line[i + 1][1] - ay;
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) ok = false; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) ok = false; else t0 = Math.max(t0, r); } else if (r < t0) ok = false; else t1 = Math.min(t1, r);
    }
    if (!ok) { cut(); continue; }
    if (!cur.length || t0 > 0) { cut(); cur.push([ax + t0 * dx, ay + t0 * dy]); }
    cur.push([ax + t1 * dx, ay + t1 * dy]);
    if (t1 < 1) cut();
  }
  cut();
  return out;
}

const ringArea = (r) => Math.abs(r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0)) / 2;
export function inRing(r, x, y) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) ins = !ins;
  }
  return ins;
}

// Anneaux extérieurs d'une relation multipolygone : chemins « outer » mis bout à bout
export function stitch(ways) {
  const open = ways.filter((w) => w.length > 1).map((w) => w.slice()), rings = [];
  const same = (p, q) => p.lat === q.lat && p.lon === q.lon;
  while (open.length) {
    const cur = open.pop();
    for (let grown = true; grown && !same(cur[0], cur.at(-1));) {
      grown = false;
      for (let i = 0; i < open.length; i++) {
        const w = open[i];
        if (same(cur.at(-1), w[0])) cur.push(...w.slice(1));
        else if (same(cur.at(-1), w.at(-1))) cur.push(...w.slice(0, -1).reverse());
        else continue;
        open.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (cur.length > 3 && same(cur[0], cur.at(-1))) rings.push(cur);
  }
  return rings;
}

// ---------- Ce qu'il y a autour (OSM) ----------

export const MARGIN = 1200;   // zone : tracé + 1,2 km
export const MAX = { buildings: 2500, areaPts: 40000, linePts: 20000, trees: 5000, cells: 60000 };
const ROADS = { motorway: 14, trunk: 12, primary: 10, secondary: 8, tertiary: 7 };
// Hauteur par défaut (m) selon le type de bâtiment
const HEIGHTS = { grandstand: 10, stadium: 14, house: 6, detached: 6, semidetached_house: 6, terrace: 7, residential: 9, apartments: 15,
  garage: 3, garages: 3, shed: 3, roof: 5, carport: 3, hut: 3, industrial: 9, warehouse: 9, hangar: 10, commercial: 10, retail: 7 };

const num = (v) => { const m = /^\s*(\d+(?:[.,]\d+)?)/.exec(String(v ?? '')); return m ? Number(m[1].replace(',', '.')) : NaN; };
// Hauteur d'un bâtiment (m) : height, sinon building:levels, sinon selon son type
export function buildingHeight(tags) {
  const h = num(tags.height), lv = num(tags['building:levels']);
  return Math.round(Math.min(300, Math.max(2, h || (lv ? lv * 3.2 + 1 : HEIGHTS[tags.building] || 7))));
}
export const isStand = (t) => t.building === 'grandstand' || t.building === 'stadium' || t.leisure === 'stadium' || t.grandstand === 'yes';

// Genre d'une surface d'après ses étiquettes (null : pas montrée)
export function areaKind(t) {
  if (t.building && t.building !== 'no') return 'building';
  if (t.natural === 'water' || t.waterway === 'riverbank' || ['reservoir', 'basin'].includes(t.landuse)) return 'water';
  if (t.natural === 'wood' || t.landuse === 'forest') return 'wood';
  if (['sand', 'beach'].includes(t.natural)) return 'sand';
  if (t.amenity === 'parking') return 'parking';
  if (['farmland', 'farmyard', 'orchard', 'vineyard', 'allotments', 'plant_nursery'].includes(t.landuse)) return 'farm';
  if (['residential', 'commercial', 'industrial', 'retail', 'construction', 'railway', 'garages', 'brownfield'].includes(t.landuse)) return 'urban';
  if (['grass', 'meadow', 'recreation_ground', 'village_green', 'greenfield', 'cemetery'].includes(t.landuse)
    || ['grassland', 'heath', 'scrub'].includes(t.natural) || ['park', 'golf_course', 'pitch', 'garden'].includes(t.leisure)) return 'grass';
  return null;
}

// Requête Overpass : surfaces, routes et cours d'eau de la zone { s, w, n, e } (degrés) ; bâtiments et arbres isolés
// seulement dans near, plus près du tracé (en ville, ceux de toute la zone pèseraient des dizaines de Mo)
export function overpassQuery(zone, near = zone) {
  const box = ({ s, w, n, e }) => `(${[s, w, n, e].map((v) => v.toFixed(5)).join(',')})`, b = box(zone), c = box(near);
  return `[out:json][timeout:150];(way[building]${c};node[natural=tree]${c};way[landuse]${b};way[natural~"^(wood|water|grassland|heath|scrub|sand|beach)$"]${b};`
    + `way[leisure~"^(park|golf_course|pitch|garden|stadium)$"]${b};way[amenity=parking]${b};way[waterway~"^(river|canal|stream|riverbank)$"]${b};`
    + `way[highway~"^(motorway|trunk|primary|secondary|tertiary|raceway)(_link)?$"]${b};`
    + `relation[type=multipolygon][~"^(natural|landuse|leisure|building|waterway)$"~"."]${b};);out geom qt;`;
}

// Réponse d'Overpass réduite à ce qui sert (étiquettes lues ici, coordonnées à 10 cm près) : gardée par circuit
const TAGS = ['building', 'height', 'building:levels', 'grandstand', 'leisure', 'landuse', 'natural', 'amenity', 'waterway', 'highway'];
export function trimOsm(elements) {
  const pt = (p) => ({ lat: Math.round(p.lat * 1e6) / 1e6, lon: Math.round(p.lon * 1e6) / 1e6 });
  return elements.map((e) => {
    const tags = Object.fromEntries(TAGS.filter((k) => e.tags?.[k] != null).map((k) => [k, e.tags[k]]));
    if (e.type === 'node') return { type: 'node', ...pt(e), tags };
    if (e.type === 'way') return { type: 'way', tags, geometry: (e.geometry || []).map(pt) };
    return { type: 'relation', tags, members: (e.members || []).filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry)
      .map((m) => ({ type: 'way', role: 'outer', geometry: m.geometry.map(pt) })) };
  });
}

// Hachage déterministe -> [0, 1)
const rand = (a, b) => (((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) >>> 0) % 10007) / 10007;

// Arbres semés dans un bois (tous les step mètres, un peu décalés) : points [x, y]
function sowTrees(ring, step) {
  const out = [];
  let y0 = Infinity, y1 = -Infinity;
  for (const p of ring) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  for (let gy = Math.ceil(y0 / step); gy * step <= y1; gy++) {
    const y = gy * step, xs = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let gx = Math.ceil(xs[k] / step); gx * step <= xs[k + 1]; gx++) {
        out.push([gx * step + (rand(gx, gy) - 0.5) * step * 0.8, y + (rand(gy, gx) - 0.5) * step * 0.8]);
      }
    }
  }
  return out;
}

// Zone montrée : tracé + margin mètres, dans le repère du tracé (box : [x0, y0, x1, y1]) et en degrés (s, w, n, e)
export function zone(track, fit, frame, margin = MARGIN) {
  const xs = track.map((p) => p[0]), ys = track.map((p) => p[1]);
  const box = [Math.min(...xs) - margin, Math.min(...ys) - margin, Math.max(...xs) + margin, Math.max(...ys) + margin].map(Math.round);
  const geo = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]].map(([x, y]) => frame.toGeo(...toEN(fit, x, y)));
  const lats = geo.map((g) => g[0]), lons = geo.map((g) => g[1]);
  return { box, s: Math.min(...lats), w: Math.min(...lons), n: Math.max(...lats), e: Math.max(...lons) };
}

// Données de /live/api/surroundings, en mètres dans le repère du tracé (x, y MultiViewer / 10), nombres entiers :
//   terrain : { x0, y0, step, cols, rows, h } — altitude (1/10 m au-dessus de la mer ; 0 ou moins : la mer) de chaque
//             nœud de la grille, ligne par ligne (y croissant)
//   track   : { z, n } — altitude (1/10 m) de chaque point du tracé, comme le profil GPS de /live/api/elevation
//   buildings, stands : [[hauteur (m), x0, y0, x1, y1…]] — contour des bâtiments et des tribunes
//   areas   : { water, wood, grass, farm, urban, sand, parking : [[x0, y0, x1, y1…]] } — surfaces
//   lines   : { road, water, raceway : [[largeur (m), x0, y0…]] } — routes principales, cours d'eau, autres pistes
//   trees   : [x0, y0, x1, y1…] — arbres isolés, puis arbres des bois (les plus proches de la piste d'abord)
// track : points du tracé [x, y] (m) ; fit : calage (fitTrack) ; frame : geoFrame ; elements : réponse d'Overpass ;
// dem(lat, lon) : altitude (m). null si le relief manque sur une partie de la zone
export function buildSurroundings({ track, fit, frame, elements = [], dem, margin = MARGIN, max = MAX }) {
  const toT = (lat, lon) => fromEN(fit, ...frame.toEN(lat, lon));
  const toGeo = (x, y) => frame.toGeo(...toEN(fit, x, y));
  const { box } = zone(track, fit, frame, margin);

  // Relief : grille (30 m au moins, au plus max.cells nœuds) et tracé (lissé : le modèle de terrain est bruité)
  const step = Math.max(30, Math.ceil(Math.sqrt(((box[2] - box[0]) * (box[3] - box[1])) / max.cells)));
  const cols = Math.floor((box[2] - box[0]) / step) + 1, rows = Math.floor((box[3] - box[1]) / step) + 1;
  const h = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) h.push(dem(...toGeo(box[0] + c * step, box[1] + r * step)));
  const tz = track.map(([x, y]) => dem(...toGeo(x, y)) * 10);
  if (![...h, ...tz].every(Number.isFinite)) return null;

  // Distance au tracé sur la grille du relief (bâtiments et arbres près de la piste d'abord)
  const few = resample(track, Math.max(60, Math.round(perimeter(track) / 30)));
  const dist = new Float32Array(cols * rows);
  for (let k = 0; k < dist.length; k++) {
    const x = box[0] + (k % cols) * step, y = box[1] + Math.floor(k / cols) * step;
    let d = Infinity;
    for (const p of few) d = Math.min(d, (p[0] - x) ** 2 + (p[1] - y) ** 2);
    dist[k] = Math.sqrt(d);
  }
  const distAt = (x, y) => dist[Math.min(rows - 1, Math.max(0, Math.round((y - box[1]) / step))) * cols + Math.min(cols - 1, Math.max(0, Math.round((x - box[0]) / step)))];
  const nearTrack = nearIndex(resample(track, Math.round(perimeter(track) / 4)));

  // Surfaces et lignes dans le repère du tracé, découpées à la zone
  const shapes = [], lines = [];
  const addRing = (geom, tags) => {
    const kind = areaKind(tags);
    if (!kind) return;
    let ring = geom.map((p) => toT(p.lat, p.lon));
    if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
    ring = simplify(clipRing(ring, box), kind === 'building' ? 1 : 4, true);
    const area = ring.length < 3 ? 0 : ringArea(ring);
    if (area >= (kind === 'building' ? 12 : 200)) shapes.push({ kind, ring, area, tags });
  };
  for (const el of elements) {
    const t = el.tags || {};
    if (el.type === 'way' && el.geometry?.length > 1) {
      const g = el.geometry, road = String(t.highway || '').replace(/_link$/, '');
      const kind = t.highway === 'raceway' ? 'raceway' : ROADS[road] ? 'road' : ['river', 'canal', 'stream'].includes(t.waterway) ? 'water' : null;
      if (kind) {
        const w = kind === 'raceway' ? 12 : kind === 'water' ? { river: 12, canal: 10, stream: 3 }[t.waterway] : t.highway.endsWith('_link') ? 6 : ROADS[road];
        const rank = kind === 'raceway' ? 0 : kind === 'water' ? 1 : 2 + Object.keys(ROADS).indexOf(road);
        for (const part of clipLine(g.map((p) => toT(p.lat, p.lon)), box)) lines.push({ kind, w, rank, pts: simplify(part, 3) });
      } else if (g.length > 3 && g[0].lat === g.at(-1).lat && g[0].lon === g.at(-1).lon) addRing(g, t);
    } else if (el.type === 'relation') {
      for (const r of stitch((el.members || []).filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry).map((m) => m.geometry))) addRing(r, t);
    }
  }

  // Bâtiments : aucun sur la piste (tunnel, pont) ; tribunes d'abord, puis les plus grands près du tracé ; plafonnés
  const onTrack = (ring) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const c = nearTrack((x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0) / 2 + 3);
    return !!c.p && (inRing(ring, ...c.p) || ring.some(([x, y]) => nearTrack(x, y, 3).p));
  };
  const flat = (pts) => pts.flatMap((p) => [Math.round(p[0]), Math.round(p[1])]);
  const blds = shapes.filter((s) => s.kind === 'building' && !onTrack(s.ring)).map((s) => {
    const [cx, cy] = s.ring.reduce((a, p) => [a[0] + p[0] / s.ring.length, a[1] + p[1] / s.ring.length], [0, 0]);
    return { ...s, stand: isStand(s.tags), score: s.area / (1 + distAt(cx, cy) / 300) };
  }).sort((p, q) => q.stand - p.stand || q.score - p.score).slice(0, max.buildings);
  const out = {
    terrain: { x0: box[0], y0: box[1], step, cols, rows, h: h.map((v) => Math.round(Math.max(-100, v) * 10)) },
    track: { z: smooth(tz, 6).map(Math.round), n: track.length },
    buildings: blds.filter((b) => !b.stand).map((b) => [buildingHeight(b.tags), ...flat(b.ring)]),
    stands: blds.filter((b) => b.stand).map((b) => [buildingHeight(b.tags), ...flat(b.ring)]),
    areas: {},
    lines: {},
    trees: [],
  };
  // Surfaces les plus grandes et lignes les plus importantes d'abord, jusqu'au plafond de sommets
  let budget = max.areaPts;
  for (const s of shapes.filter((x) => x.kind !== 'building').sort((p, q) => q.area - p.area)) {
    if ((budget -= s.ring.length) < 0) break;
    (out.areas[s.kind] ||= []).push(flat(s.ring));
  }
  budget = max.linePts;
  for (const l of lines.sort((p, q) => p.rank - q.rank)) {
    if ((budget -= l.pts.length) < 0) break;
    (out.lines[l.kind] ||= []).push([l.w, ...flat(l.pts)]);
  }
  // Arbres : isolés d'abord, puis semés dans les bois (tous les 12 m), jamais sur la piste ; plafonnés : surtout les
  // plus proches de la piste, et quelques-uns répartis plus loin
  const ok = ([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3] && !nearTrack(x, y, 18).p;
  const chosen = elements.filter((e) => e.type === 'node' && e.tags?.natural === 'tree').map((e) => toT(e.lat, e.lon)).filter(ok).slice(0, max.trees);
  const sown = (out.areas.wood || []).flatMap((r) => sowTrees(Array.from({ length: r.length / 2 }, (_, i) => [r[2 * i], r[2 * i + 1]]), 12))
    .map((p) => ({ p, d: distAt(...p) })).sort((a, b) => a.d - b.d);
  const nearMax = chosen.length + Math.round((max.trees - chosen.length) * 0.75), rest = [];
  for (const { p } of sown) {
    if (!ok(p)) continue;
    if (chosen.length < nearMax) chosen.push(p); else rest.push(p);
  }
  for (let i = 0, room = max.trees - chosen.length; i < room && i < rest.length; i++) chosen.push(rest[Math.floor((i * rest.length) / Math.min(room, rest.length))]);
  out.trees = flat(chosen);
  return out;
}
