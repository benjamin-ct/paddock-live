// Vue 3D de la carte (case « 3D » du panneau Circuit) : piste en relief (altitude calculée par le serveur d'après le GPS,
// sinon d'après le modèle de terrain des alentours, à plat tant qu'aucune n'est là), bords et vibreurs, alentours
// (sol, bâtiments, tribunes, arbres, eau d'OpenStreetMap), F1 2026 faites maison aux couleurs des écuries (jamais de
// livrée ni de logo), caméras Hélico / Poursuite / Embarquée / Libre autour du pilote suivi (le même que sur la carte
// 2D), lumière selon l'heure au circuit (lever, jour, coucher, nuit étoilée avec projecteurs).
// Chargée seulement à l'ouverture de la vue (three.js). Mêmes positions que la carte 2D : GPS lissé, sinon estimées.
import * as THREE from '/vendor/three/three.module.min.js';
import { store, displayNow, f1Now, setFocus } from '../store.js';
import { CIRCUITS } from '/shared/circuits-info.js';
import { smoothAlong } from '/shared/elevation.js';
import { drivers, orderedNumbers, storageGet, storageSet, esc } from '../util.js';
import { t } from '../i18n.js';
import { FONT, drawPuck, drawBadge, drawSectorBadge, drawCornerChip, drawFlagBadge, drawScBadge } from './map-draw.js';
import { QUALITY, nearFirst, autoQuality, frameCap } from './map3d-calc.js';

const W = 14;           // largeur de la piste (m)
const MAX_CARS = 30;
const CAMS = [['helico', 'Hélico'], ['poursuite', 'Poursuite'], ['embarquee', 'Embarquée'], ['libre', 'Libre']];
const FOV = { helico: 38, poursuite: 62, embarquee: 74, libre: 50 };
const TIMES = [['auto', 'Heure du circuit'], ['lever', 'Lever'], ['jour', 'Jour'], ['coucher', 'Coucher'], ['nuit', 'Nuit']];
const QUALITIES = [['auto', 'Qualité : Auto'], ['econome', 'Qualité : Économe'], ['haute', 'Qualité : Haute']];
const Q_NAMES = ['économe', 'moyenne', 'haute'];   // niveaux de map3d-calc.js (QUALITY)
// Soleil des ambiances choisies : hauteur et azimut (degrés, depuis le nord vers l'est)
const PRESET = { lever: [3, 100], jour: [50, 205], coucher: [3, 260], nuit: [-30, 0] };
const RAD = Math.PI / 180;

// ---------- Circuit : tracé (x, y du tracé MultiViewer, 1/10 m) + altitude (z de chaque point, 1/10 m) ----------
// Altitude : profil GPS (plus précis sur la piste), sinon celle du modèle de terrain des alentours ; alentours (sol,
// bâtiments, arbres, eau) seulement s'ils sont calculés pour ce tracé
function buildWorld(track, elevation, surroundings, gpu) {
  const n = track.pts.length;
  const gps = Array.isArray(elevation?.z) && elevation.z.length === n ? elevation.z : null;
  const land = surroundings?.terrain?.h?.length && surroundings.track?.z?.length === n ? surroundings : null;
  // Altitude lissée selon la distance le long du tracé (points très inégalement espacés : sinon, des marches)
  const z = gps || land ? smoothAlong(track.pts.map((p) => [p.x / 10, p.y / 10]), gps || land.track.z) : null;
  const zMin = z ? Math.min(...z) : 0;
  // Terrain (1/10 m au-dessus de la mer) ramené au repère du GPS : écart médian le long du tracé
  const off = gps && land ? gps.map((v, i) => land.track.z[i] - v).sort((p, q) => p - q)[n >> 1] : 0;
  // Même orientation que la carte 2D (rotation du tracé), nord de la carte vers le fond de la scène
  const a = (track.rotation * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  let cx = 0, cz = 0;
  const raw = (x, y) => [(x * cos - y * sin) / 10, -(x * sin + y * cos) / 10];
  for (const p of track.pts) { const [wx, wz] = raw(p.x, p.y); cx += wx / n; cz += wz / n; }
  const toW = (x, y) => { const [wx, wz] = raw(x, y); return [wx - cx, wz - cz]; };

  const ctrl = [];
  track.pts.forEach((p, i) => {
    const [x, zz] = toW(p.x, p.y);
    const v = new THREE.Vector3(x, z ? (z[i] - zMin) / 10 : 0, zz);
    if (!ctrl.length || v.distanceTo(ctrl.at(-1)) > 1.5) ctrl.push(v);
  });
  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
  curve.arcLengthDivisions = 10000;
  const LEN = curve.getLength();
  const N = Math.max(600, Math.min(3200, Math.round(LEN / 2.5))), DS = LEN / N;
  const P = curve.getSpacedPoints(N);
  P.pop();
  const T = P.map((_, i) => P[(i + 1) % N].clone().sub(P[(i - 1 + N) % N]).normalize());
  const SIDE = T.map((v) => new THREE.Vector3(-v.z, 0, v.x).normalize());
  const K = T.map((_, i) => T[(i - 2 + N) % N].angleTo(T[(i + 2) % N]) / (4 * DS));   // courbure (1/m)

  const group = new THREE.Group();
  // Bandes le long du tracé : piste, lignes blanches, vibreurs ; color(i, décalage) : couleur des sommets
  const ribbon = ({ off = 0, width, lift = 0, test = () => true, color = null }) => {
    const pos = [], col = [], idx = [];
    const p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      if (!test(i)) continue;
      const j = (i + 1) % N, b = pos.length / 3;
      for (const k of [i, j]) {
        for (const s of [off - width / 2, off + width / 2]) {
          p.copy(P[k]).addScaledVector(SIDE[k], s);
          pos.push(p.x, p.y + lift, p.z);
          if (color) col.push(...color(i, s).toArray());
        }
      }
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const road = new THREE.Mesh(ribbon({ width: W }), new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.92, side: THREE.DoubleSide }));
  road.receiveShadow = true;
  group.add(road);
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6, side: THREE.DoubleSide });
  for (const o of [-1, 1]) group.add(new THREE.Mesh(ribbon({ off: o * (W / 2 - 0.5), width: 0.3, lift: 0.02 }), lineMat));
  const red = new THREE.Color(0xd62020), white = new THREE.Color(0xf4f4f4);
  const kerbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
  for (const o of [-1, 1]) {
    group.add(new THREE.Mesh(ribbon({ off: o * (W / 2 + 0.6), width: 1.2, lift: 0.01, test: (i) => K[i] > 1 / 150,
      color: (i) => (Math.floor((i * DS) / 2.5) % 2 ? red : white) }), kerbMat));
  }

  const fromW = (x, zz) => { const X = x + cx, Z = zz + cz; return [X * cos - Z * sin, -X * sin - Z * cos]; };   // -> repère du tracé (m)
  const box = new THREE.Box3().setFromPoints(P);
  const { groundAt, detailAt = () => {}, setQuality = () => {} } = land ? landGround(group, land, { track, P, SIDE, toW, fromW, base: zMin + off, ...gpu }) : { groundAt: flatGround(group, P, box, z) };

  const world = { track, elevation, surroundings, land: !!land, source: gps ? 'gps' : land ? 'terrain' : null,
    relief: z ? (Math.max(...z) - zMin) / 10 : null, P, T, SIDE, N, DS, box, group, groundAt, detailAt, setQuality, toW, ribbon, road };
  // Ligne de chronométrage (damier), au même endroit que sur la carte 2D
  world.addStartLine = (frac) => {
    const sp = track.pointAt(frac * track.L), [x, zz] = toW(sp.x, sp.y), i = nearestIndex(world, x, zz, -1);
    const c = document.createElement('canvas');
    c.width = 128; c.height = 16;
    const g = c.getContext('2d');
    for (let a = 0; a < 16; a++) for (let b = 0; b < 2; b++) { g.fillStyle = (a + b) % 2 ? '#111' : '#fff'; g.fillRect(a * 8, b * 8, 8, 8); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    m.matrixAutoUpdate = false;
    m.matrix.makeBasis(SIDE[i], T[i], new THREE.Vector3(0, 1, 0)).setPosition(P[i].x, P[i].y + 0.03, P[i].z);
    group.add(m);
  };

  // Nuit : mâts des projecteurs le long de la piste (lampes allumées), lueur sur les bas-côtés, piste et lignes éclairées
  const night = new THREE.Group(), warm = new THREE.Color(0xf4f1ea), dark = new THREE.Color(0);
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  for (const o of [-1, 1]) night.add(new THREE.Mesh(ribbon({ off: o * (W / 2 + 7), width: 14, lift: -0.3, color: (i, s) => (Math.abs(s) < W / 2 + 1 ? warm : dark) }), glow));
  const every = Math.max(1, Math.round(70 / DS)), nM = Math.floor(N / every);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 18, 6).translate(0, 9, 0), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.6 }), nM);
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 1, 0.4).translate(0, 18, 0), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }), nM);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  for (let k = 0; k < nM; k++) {
    const i = k * every, side = k % 2 ? 1 : -1, p = P[i].clone().addScaledVector(SIDE[i], side * (W / 2 + 12));
    p.y = Math.min(P[i].y, groundAt(p.x, p.z)) - 0.3;
    m4.compose(p, q.setFromAxisAngle(up, Math.atan2(SIDE[i].x, SIDE[i].z)), one);
    poles.setMatrixAt(k, m4);
    lamps.setMatrixAt(k, m4);
  }
  night.add(poles, lamps);
  night.visible = false;
  group.add(night);
  world.setLights = (k) => {
    night.visible = k > 0.01;
    glow.opacity = 0.35 * k;
    road.material.emissive.setScalar(0.05 * k);
    lineMat.emissive.setScalar(0.35 * k);
    kerbMat.emissive.setScalar(0.1 * k);
    NIGHT.value = k;
  };
  // Direction (est, nord) -> scène : calage des alentours sur le terrain (presque nord en haut), puis rotation de la carte
  const fa = ((land?.fit?.deg || 0) * Math.PI) / 180;
  world.fromEN = (e, nn, y) => {
    const x = e * Math.cos(fa) + nn * Math.sin(fa), yy = -e * Math.sin(fa) + nn * Math.cos(fa);
    return new THREE.Vector3(x * cos - yy * sin, y, -(x * sin + yy * cos));
  };
  return world;
}

// Sol sans alentours : altitude des points du tracé les plus proches, adoucie au loin (pondération inverse), plaine
// jusqu'à l'horizon ; -> altitude du sol en (x, z)
function flatGround(group, P, box, z) {
  const MARGIN = 450, G = 160;
  const gx0 = box.min.x - MARGIN, gz0 = box.min.z - MARGIN;
  const gw = box.max.x - box.min.x + 2 * MARGIN, gd = box.max.z - box.min.z + 2 * MARGIN;
  const sub = P.filter((_, i) => i % 14 === 0);
  const H = new Float32Array((G + 1) * (G + 1)), DMIN = new Float32Array(H.length);
  const smooth = (lo, hi, x) => { const u = Math.min(1, Math.max(0, (x - lo) / (hi - lo))); return u * u * (3 - 2 * u); };
  for (let r = 0; r <= G; r++) {
    for (let c = 0; c <= G; c++) {
      const x = gx0 + (c / G) * gw, zz = gz0 + (r / G) * gd;
      let [dmin, hn] = trackNear(P, x, zz);
      dmin = Math.sqrt(dmin);
      let far = hn;
      if (z) {
        let sw = 0, sh = 0;
        for (const p of sub) { const w = 1 / ((p.x - x) ** 2 + (p.z - zz) ** 2 + 400) ** 1.5; sw += w; sh += w * p.y; }
        far = sh / sw;
      }
      const k = r * (G + 1) + c;
      H[k] = THREE.MathUtils.lerp(hn, far, smooth(W / 2 + 6, W / 2 + 70, dmin)) - 0.35;
      DMIN[k] = dmin;
    }
  }
  const terrainGeo = new THREE.PlaneGeometry(gw, gd, G, G);
  terrainGeo.rotateX(-Math.PI / 2);
  terrainGeo.translate(gx0 + gw / 2, 0, gz0 + gd / 2);
  {
    const pos = terrainGeo.attributes.position, col = [];
    const grass = new THREE.Color(0x5f8f3a), far = new THREE.Color(0x4a7a33), verge = new THREE.Color(0x7aa04a), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const c = Math.round(((pos.getX(i) - gx0) / gw) * G), r = Math.round(((pos.getZ(i) - gz0) / gd) * G), k = r * (G + 1) + c;
      pos.setY(i, H[k]);
      tmp.copy(far).lerp(grass, 1 - smooth(60, 260, DMIN[k])).lerp(verge, 1 - smooth(W / 2 + 2, W / 2 + 30, DMIN[k]));
      tmp.offsetHSL(0, 0, (((i * 2654435761) >>> 0) / 4294967296 - 0.5) * 0.04);
      col.push(tmp.r, tmp.g, tmp.b);
    }
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    terrainGeo.computeVertexNormals();
  }
  const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  terrain.receiveShadow = true;
  group.add(terrain);
  // Au-delà : plaine jusqu'à l'horizon (le bord du sol ne se voit pas)
  const plain = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial({ color: 0x4a7a33, roughness: 1 }));
  plain.rotation.x = -Math.PI / 2;
  plain.position.y = Math.min(...H) - 0.6;
  group.add(plain);
  return (x, zz) => {
    const fc = ((x - gx0) / gw) * G, fr = ((zz - gz0) / gd) * G, c = Math.floor(fc), r = Math.floor(fr), u = fc - c, v = fr - r;
    const h = (rr, cc) => H[Math.min(G, Math.max(0, rr)) * (G + 1) + Math.min(G, Math.max(0, cc))];
    return (h(r, c) * (1 - u) + h(r, c + 1) * u) * (1 - v) + (h(r + 1, c) * (1 - u) + h(r + 1, c + 1) * u) * v;
  };
}

// ---------- Alentours (serveur : relief du terrain et OpenStreetMap, en mètres dans le repère du tracé) ----------
const LAND = { farm: '#a4ad5e', urban: '#a6a398', grass: '#6c9c42', wood: '#3e6a2b', sand: '#dacb9c', parking: '#8f9295', water: '#3f78b5' };
const LINES = { water: '#3f78b5', road: '#6e7175', raceway: '#3a3d42' };
const FIELD = '#4f7f36';   // herbe loin de la piste (et plaine jusqu'à l'horizon)
const hash = (i) => ((i * 2654435761) >>> 0) / 4294967296;

// Sol des alentours : grille du relief (raccordée à la piste près du tracé), couleurs selon l'usage du sol (texture
// dessinée ici), bâtiments et tribunes extrudés, arbres, plans d'eau, bord prolongé jusqu'à l'horizon. base : altitude
// (1/10 m) du bas de la scène ; maxTex, aniso : taille de texture et anisotropie de la carte graphique ;
// -> { groundAt : altitude du sol en (x, z), detailAt(x, z) : sol plus détaillé autour de ce point }
function landGround(group, land, { track, P, SIDE, toW, fromW, base, maxTex, aniso }) {
  const { x0, y0, step, cols, rows, h } = land.terrain;
  const W2 = (x, y) => toW(x * 10, y * 10);   // repère du tracé (m) -> scène
  const sea = -base / 10;                     // niveau de la mer dans la scène
  // Mer : nœuds à 0 m ou moins reliés au bord de la zone (pas un creux à l'intérieur des terres)
  const count = cols * rows, wetAt = new Uint8Array(count), todo = [];
  for (let i = 0; i < count; i++) if ((i < cols || i >= count - cols || i % cols === 0 || i % cols === cols - 1) && h[i] <= 0) { wetAt[i] = 1; todo.push(i); }
  while (todo.length) {
    const i = todo.pop();
    for (const j of [i - cols, i + cols, i % cols ? i - 1 : -1, i % cols < cols - 1 ? i + 1 : -1]) if (j >= 0 && j < count && !wetAt[j] && h[j] <= 0) { wetAt[j] = 1; todo.push(j); }
  }
  const smooth = (lo, hi, x) => { const u = Math.min(1, Math.max(0, (x - lo) / (hi - lo))); return u * u * (3 - 2 * u); };
  // Altitude de chaque nœud : celle du terrain ; jusqu'à une maille et plus du tracé, celle de la piste (les mailles que
  // la piste traverse n'ont que des nœuds à sa hauteur : ni piste qui flotte, ni piste enterrée), puis raccord en 100 m
  const sub = P.filter((_, i) => i % 14 === 0), flat = W / 2 + 1.2 * step;
  const H = new Float32Array(count), pos = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c, [x, zz] = W2(x0 + c * step, y0 + r * step), far = wetAt[k] ? sea : (h[k] - base) / 10;
      let d2 = Infinity, hn = far;
      for (const p of sub) { const d = (p.x - x) ** 2 + (p.z - zz) ** 2; if (d < d2) { d2 = d; hn = p.y; } }
      if (d2 < (flat + 150) ** 2) [d2, hn] = trackNear(P, x, zz);
      H[k] = THREE.MathUtils.lerp(hn, far, smooth(flat, flat + 100, Math.sqrt(d2))) - 0.35;
      pos.set([x, H[k], zz], k * 3);
      uv.set([c / (cols - 1), 1 - r / (rows - 1)], k * 2);
    }
  }
  // Triangle du sol sous (x, z) (scène) : ses trois nœuds et leur poids (les mêmes triangles que le maillage)
  const cellAt = (x, zz) => {
    const [mx, my] = fromW(x, zz), fc = (mx - x0) / step, fr = (my - y0) / step;
    if (!(fc >= 0 && fr >= 0 && fc <= cols - 1 && fr <= rows - 1)) return null;
    const c = Math.min(cols - 2, Math.floor(fc)), r = Math.min(rows - 2, Math.floor(fr)), u = fc - c, w = fr - r, i = r * cols + c;
    return u + w <= 1 ? [i, i + 1, i + cols, 1 - u - w, u, w] : [i + cols + 1, i + cols, i + 1, u + w - 1, 1 - u, 1 - w];
  };
  // Sol jamais au-dessus de la piste ni des vibreurs (creux, fortes pentes : la grille fait 30 m) : nœuds abaissés
  for (let i = 0; i < P.length; i++) {
    for (const o of [-(W / 2 + 1.5), -W / 4, 0, W / 4, W / 2 + 1.5]) {
      const t = cellAt(P[i].x + SIDE[i].x * o, P[i].z + SIDE[i].z * o), over = t && H[t[0]] * t[3] + H[t[1]] * t[4] + H[t[2]] * t[5] - (P[i].y - 0.3);
      if (over > 0) for (let j = 0; j < 3; j++) { H[t[j]] -= over; pos[t[j] * 3 + 1] = H[t[j]]; }
    }
  }
  const idx = [];
  for (let r = 0; r + 1 < rows; r++) for (let c = 0; c + 1 < cols; c++) { const k = r * cols + c; idx.push(k, k + cols, k + 1, k + 1, k + cols, k + cols + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Repère du tracé retourné dans la scène : triangles dans l'autre sens (normales vers le haut)
  if (geo.attributes.normal.getY((rows >> 1) * cols + (cols >> 1)) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }

  // Couleurs du sol : herbe (plus claire près de la piste), mer, surfaces, routes et cours d'eau, pied des bâtiments,
  // dessinées sur cv pour la zone qui commence en (ox, oy) (repère du tracé, m), à k px par mètre
  const trackFlat = track.pts.flatMap((p) => [p.x / 10, p.y / 10]);
  const paint = (cv, ox, oy, k) => {
    const g = cv.getContext('2d'), X = (x) => (x - ox) * k, Y = (y) => (y - oy) * k;
    const path = (flat, close) => {
      g.beginPath();
      for (let i = 0; i < flat.length; i += 2) g[i ? 'lineTo' : 'moveTo'](X(flat[i]), Y(flat[i + 1]));
      if (close) g.closePath();
    };
    g.lineJoin = g.lineCap = 'round';
    g.fillStyle = FIELD;
    g.fillRect(0, 0, cv.width, cv.height);
    for (const [w, col] of [[520, 'rgba(95,143,58,.45)'], [300, 'rgba(95,143,58,.6)'], [W + 50, 'rgba(122,160,74,.75)']]) { g.strokeStyle = col; g.lineWidth = w * k; path(trackFlat, true); g.stroke(); }
    g.fillStyle = LAND.water;
    for (let i = 0; i < count; i++) {
      if (!wetAt[i]) continue;
      g.beginPath();
      g.arc(X(x0 + (i % cols) * step), Y(y0 + Math.floor(i / cols) * step), step * k * 0.75, 0, 2 * Math.PI);   // bords arrondis
      g.fill();
    }
    for (const [kind, col] of Object.entries(LAND)) { g.fillStyle = col; for (const ring of land.areas?.[kind] || []) { path(ring, true); g.fill(); } }
    for (const [kind, col] of Object.entries(LINES)) {
      g.strokeStyle = col;
      for (const [w, ...pts] of land.lines?.[kind] || []) { g.lineWidth = Math.max(1, w * k); path(pts); g.stroke(); }
    }
    g.fillStyle = '#8c8b85';
    for (const [, ...ring] of [...(land.buildings || []), ...(land.stands || [])]) { path(ring, true); g.fill(); }
    // Bas-côtés en herbe : la piste d'OSM, décalée de quelques mètres, faisait des taches sombres le long du tracé
    g.strokeStyle = '#6f9845';
    g.lineWidth = (W + 12) * k;
    path(trackFlat, true);
    g.stroke();
  };
  const texture = (cv) => {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    return tex;
  };
  // Vue d'ensemble : 2 m par pixel environ (2048 px de côté) ; près de la caméra, détail à 25 cm par pixel (37 cm sur
  // écran tactile) redessiné quand elle s'éloigne (net vu d'hélicoptère ou de la voiture, sans texture géante)
  const gw = (cols - 1) * step, gh = (rows - 1) * step, k = Math.min(2048, maxTex) / Math.max(gw, gh);
  const cv = document.createElement('canvas');
  cv.width = Math.round(gw * k);
  cv.height = Math.round(gh * k);
  paint(cv, x0, y0, k);
  const touch = matchMedia('(pointer: coarse)').matches, DPX0 = touch ? 1024 : 2048, SPAN0 = touch ? 384 : 512, maxAniso = aniso;
  let DPX = DPX0, SPAN = SPAN0;
  const dcv = document.createElement('canvas');
  dcv.width = dcv.height = DPX;
  const detail = { map: { value: texture(dcv) }, rect: { value: new THREE.Vector4(0, 0, 1, 1) }, on: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ map: texture(cv), roughness: 1, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 });
  mat.userData.extra = detail.map.value;   // libérée avec le reste (dispose)
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { dMap: detail.map, dRect: detail.rect, dOn: detail.on });
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      vec4 sampledDiffuseColor = texture2D(map, vMapUv);
      vec2 dUv = (vMapUv - dRect.xy) / dRect.zw, dE = min(dUv, 1.0 - dUv);
      sampledDiffuseColor = mix(sampledDiffuseColor, texture2D(dMap, clamp(dUv, 0.0, 1.0)), dOn * smoothstep(0.0, 0.08, min(dE.x, dE.y)));
      diffuseColor *= sampledDiffuseColor;`).replace('void main() {', 'uniform sampler2D dMap; uniform vec4 dRect; uniform float dOn;\nvoid main() {');
  };
  // Sol repoussé en profondeur : vue de loin, la piste (35 cm au-dessus) reste devant
  const terrain = new THREE.Mesh(geo, mat);
  terrain.receiveShadow = true;
  group.add(terrain);
  // Détail centré en (x, z) (scène), redessiné quand ce point s'est éloigné d'un quart de sa largeur
  let dx = Infinity, dy = Infinity;
  const detailAt = (x, zz) => {
    const [mx, my] = fromW(x, zz);
    if (Math.hypot(mx - dx, my - dy) < SPAN / 4) return;
    dx = mx; dy = my;
    paint(dcv, mx - SPAN / 2, my - SPAN / 2, DPX / SPAN);
    detail.map.value.needsUpdate = true;
    // Coordonnées de texture du sol (v inversé : 1 en y0)
    detail.rect.value.set((mx - SPAN / 2 - x0) / gw, 1 - (my + SPAN / 2 - y0) / gh, SPAN / gw, SPAN / gh);
    detail.on.value = 1;
  };
  // Qualité (map3d-calc.js) : sol de détail plus petit (nouvelle texture, redessinée), anisotropie des textures du sol
  const qualityGround = (q) => {
    aniso = Math.min(maxAniso, q.aniso);
    for (const tex of [mat.map, detail.map.value]) if (tex.anisotropy !== aniso) { tex.anisotropy = aniso; tex.needsUpdate = true; }
    if (DPX === DPX0 * q.detail) return;
    DPX = DPX0 * q.detail;
    SPAN = SPAN0 * (0.5 + q.detail / 2);
    dcv.width = dcv.height = DPX;
    detail.map.value.dispose();
    detail.map.value = mat.userData.extra = texture(dcv);
    detail.on.value = 0;
    dx = Infinity;
  };

  // Bord : prolongé de 12 km (au-delà du brouillard) à l'altitude moyenne du bord, pas de marche visible ; plaine plus
  // bas que tout le sol (jamais par-dessus une vallée)
  const ring = [];
  for (let c = 0; c < cols; c++) ring.push(c);
  for (let r = 1; r < rows; r++) ring.push(r * cols + cols - 1);
  for (let c = cols - 2; c >= 0; c--) ring.push((rows - 1) * cols + c);
  for (let r = rows - 2; r > 0; r--) ring.push(r * cols);
  const edge = ring.reduce((sum, i) => sum + H[i], 0) / ring.length;
  const wet = ring.filter((i) => wetAt[i]).length > ring.length / 2;
  const m0 = ((rows >> 1) * cols + (cols >> 1)) * 3, mid = new THREE.Vector3(pos[m0], 0, pos[m0 + 2]);
  const sPos = [], sCol = [], sIdx = [], green = new THREE.Color(FIELD), blue = new THREE.Color(LAND.water), v = new THREE.Vector3();
  ring.forEach((i, j) => {
    v.set(pos[i * 3], 0, pos[i * 3 + 2]);
    const out = v.clone().sub(mid).normalize().multiplyScalar(12000).add(v);
    sPos.push(v.x, H[i], v.z, out.x, edge, out.z);
    for (const col of [wetAt[i] ? blue : green, wet ? blue : green]) sCol.push(col.r, col.g, col.b);
    const a = 2 * j, b = 2 * ((j + 1) % ring.length);
    sIdx.push(a, a + 1, b, b, a + 1, b + 1);
  });
  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
  skirtGeo.setAttribute('color', new THREE.Float32BufferAttribute(sCol, 3));
  skirtGeo.setIndex(sIdx);
  skirtGeo.computeVertexNormals();
  group.add(new THREE.Mesh(skirtGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));
  const plain = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshStandardMaterial({ color: wet ? LAND.water : FIELD, roughness: 1 }));
  plain.rotation.x = -Math.PI / 2;
  plain.position.y = H.reduce((lo, y) => Math.min(lo, y), edge) - 1;
  group.add(plain);

  const groundAt = (x, zz) => { const t = cellAt(x, zz); return t ? H[t[0]] * t[3] + H[t[1]] * t[4] + H[t[2]] * t[5] : edge; };

  // Bâtiments et tribunes : prismes posés sous le point le plus bas du sol, toit plat ; plans d'eau plats
  const corners = (flat) => { const out = []; for (let i = 0; i < flat.length; i += 2) out.push(W2(flat[i], flat[i + 1])); return out; };
  const flatTop = (pts, y, list, col) => {
    for (const tri of THREE.ShapeUtils.triangulateShape(pts.map(([x, zz]) => new THREE.Vector2(x, zz)), [])) {
      for (const j of tri) { list.pos.push(pts[j][0], y, pts[j][1]); if (col) list.col.push(col.r, col.g, col.b); }
    }
  };
  const solids = { pos: [], col: [] }, spans = [];
  for (const [kind, wall, roof] of [['buildings', '#e3e0d7', '#c9c6bd'], ['stands', '#bac2cd', '#8e9aab']].map(([kd, a, b]) => [kd, new THREE.Color(a), new THREE.Color(b)])) {
    for (const [height, ...flat] of land[kind] || []) {
      const pts = corners(flat), start = solids.pos.length;
      let lo = Infinity, hi = -Infinity;
      for (const [x, zz] of pts) { const y = groundAt(x, zz); lo = Math.min(lo, y); hi = Math.max(hi, y); }
      const top = hi + height;
      pts.forEach(([ax, az], i) => {
        const [bx, bz] = pts[(i + 1) % pts.length];
        solids.pos.push(ax, lo - 0.5, az, bx, lo - 0.5, bz, bx, top, bz, ax, lo - 0.5, az, bx, top, bz, ax, top, az);
        for (let j = 0; j < 6; j++) solids.col.push(wall.r, wall.g, wall.b);
      });
      flatTop(pts, top, solids, roof);
      spans.push([start, solids.pos.length, pts, height]);
    }
  }
  // Les plus grands et les plus près de la piste d'abord : en Économe, seuls les premiers sont dessinés (qualityGround)
  const ends = [], sorted = { pos: [], col: [] };
  for (const k of nearFirst(spans.map(([, , pts, height]) => [Math.sqrt(trackNear(P, ...centroid(pts))[0]), height + Math.sqrt(areaOf(pts))]))) {
    const [a, b] = spans[k];
    for (const key of ['pos', 'col']) for (let i = a; i < b; i++) sorted[key].push(solids[key][i]);
    ends.push(sorted.pos.length / 3);
  }
  Object.assign(solids, sorted);
  let buildings = null;
  if (solids.pos.length) {
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(solids.pos, 3));
    bg.setAttribute('color', new THREE.Float32BufferAttribute(solids.col, 3));
    bg.computeVertexNormals();
    const bm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    bm.onBeforeCompile = windows;
    const b = buildings = new THREE.Mesh(bg, bm);
    b.castShadow = b.receiveShadow = true;
    group.add(b);
  }
  const water = { pos: [] };
  for (const flat of land.areas?.water || []) {
    const pts = corners(flat);
    flatTop(pts, Math.min(...pts.map(([x, zz]) => groundAt(x, zz))) + 0.25, water);
  }
  if (water.pos.length) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(water.pos, 3));
    wg.computeVertexNormals();
    group.add(new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: LAND.water, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide })));
  }

  // Arbres : cône et tronc, en instances (taille, teinte et orientation un peu variées)
  const nT = (land.trees?.length || 0) >> 1, treeAt = (i) => W2(land.trees[2 * i], land.trees[2 * i + 1]), slot = [];
  nearFirst(Array.from({ length: nT }, (_, i) => [Math.sqrt(trackNear(P, ...treeAt(i))[0]), 1])).forEach((i, k) => { slot[i] = k; });   // les plus près d'abord
  let crowns = null, trunks = null;
  if (nT) {
    const crown = new THREE.ConeGeometry(2.6, 7, 7).translate(0, 6.3, 0), trunk = new THREE.CylinderGeometry(0.3, 0.4, 3.2, 5).translate(0, 1.6, 0);
    crowns = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), nT);
    trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 }), nT);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < nT; i++) {
      const [x, zz] = treeAt(i), r = hash(i + 1);
      m.compose(p.set(x, groundAt(x, zz) - 0.2, zz), q.setFromAxisAngle(up, r * 6.28), sc.setScalar(0.75 + r * 0.6));
      crowns.setMatrixAt(slot[i], m);
      trunks.setMatrixAt(slot[i], m);
      crowns.setColorAt(slot[i], col.setHSL(0.25 + hash(i + 7) * 0.07, 0.45, 0.2 + hash(i + 13) * 0.08));
    }
    crowns.castShadow = true;
    group.add(crowns, trunks);
  }
  // Qualité : arbres et bâtiments dessinés (les premiers), ombres des alentours, sol de détail
  const setQuality = (q) => {
    if (buildings) {
      buildings.geometry.setDrawRange(0, ends[Math.ceil(ends.length * q.buildings) - 1] || 0);
      buildings.castShadow = q.shadowAll;
    }
    if (crowns) {
      crowns.count = trunks.count = Math.round(nT * q.trees);
      crowns.castShadow = q.shadowAll;
    }
    qualityGround(q);
  };
  return { groundAt, detailAt, setQuality };
}

// Centre (moyenne des coins) et surface d'un polygone [[x, z]…]
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const areaOf = (pts) => Math.abs(pts.reduce((s, [x, z], i) => { const [x2, z2] = pts[(i + 1) % pts.length]; return s + x * z2 - x2 * z; }, 0)) / 2;

// Fenêtres allumées la nuit sur les murs (environ une sur deux, effacées au loin : pas de moiré) ; NIGHT : de 0 (jour) à 1
const NIGHT = { value: 0 };
function windows(sh) {
  sh.uniforms.night = NIGHT;
  sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vW, vN;\nvoid main() {')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position, 1.0)).xyz; vN = normal;');
  sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float night; varying vec3 vW, vN;\nvoid main() {')
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      vec2 cell = vec2(abs(vN.x) > abs(vN.z) ? vW.z : vW.x, vW.y) / vec2(3.5, 3.2), f = fract(cell);
      float win = step(0.3, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.7) * step(0.5, fract(sin(dot(floor(cell), vec2(12.9898, 78.233))) * 43758.5453));
      totalEmissiveRadiance += night * win * (1.0 - abs(vN.y)) * smoothstep(900.0, 250.0, length(vViewPosition)) * vec3(1.0, 0.75, 0.42);`);
}

// Soleil vu de (lat, lon) à l'instant ms (UTC) : hauteur et azimut (degrés, depuis le nord vers l'est) ; formules
// simplifiées de l'almanach (à 1° près)
function sunAt(ms, lat, lon) {
  const d = ms / 864e5 - 10957.5, g = (357.529 + 0.98560028 * d) * RAD;   // jours depuis le 1er janvier 2000 à midi
  const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD, e = (23.439 - 3.6e-7 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const H = (280.46061837 + 360.98564736629 * d + lon) * RAD - ra, la = lat * RAD;
  return [Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H)) / RAD,
    Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(H)) / RAD];
}

// Ambiances selon la hauteur du soleil (degrés) : ciel (haut, horizon, sous l'horizon), lueur du côté du soleil (et sa
// force), lumière du soleil (de la lune et des projecteurs la nuit), du ciel et du sol, étoiles et éclairage (0 à 1)
const AMB = [
  { h: -14, top: 0x03060f, hor: 0x0c1526, low: 0x05080c, glow: 0x000000, gk: 0, key: 0xcbd6ff, keyI: 0.7, sky: 0x2a3a5c, gnd: 0x0a0c10, hemiI: 0.4, stars: 1, lights: 1 },
  { h: -5, top: 0x16224a, hor: 0x4d5886, low: 0x1c2330, glow: 0xc0604a, gk: 0.5, key: 0xcbd6ff, keyI: 0, sky: 0x4a5a85, gnd: 0x1a1f24, hemiI: 0.6, stars: 0.35, lights: 1 },
  { h: 1, top: 0x34528f, hor: 0xf09060, low: 0x5a5548, glow: 0xff7a3a, gk: 1, key: 0xffa060, keyI: 1.6, sky: 0xbcc4dc, gnd: 0x4a4836, hemiI: 1.05, stars: 0, lights: 0.3 },
  { h: 10, top: 0x3c6fc4, hor: 0xf1cfa0, low: 0x80906a, glow: 0xffb070, gk: 0.5, key: 0xffd2a0, keyI: 2.3, sky: 0xcfdcf0, gnd: 0x4d6b35, hemiI: 1.2, stars: 0, lights: 0 },
  { h: 25, top: 0x3f7fd6, hor: 0xcfe3f2, low: 0x8aa37a, glow: 0xcfe3f2, gk: 0, key: 0xfff3df, keyI: 2.6, sky: 0xdfefff, gnd: 0x4d6b35, hemiI: 1.3, stars: 0, lights: 0 },
];
function ambience(h, out) {
  let j = AMB.findIndex((a) => a.h > h);
  j = j < 0 ? AMB.length - 1 : Math.max(1, j);
  const a = AMB[j - 1], b = AMB[j], u = Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h)));
  for (const k of Object.keys(a)) {
    if (k === 'h') continue;
    if (['top', 'hor', 'low', 'glow', 'key', 'sky', 'gnd'].includes(k)) (out[k] ||= new THREE.Color()).lerpColors(new THREE.Color(a[k]), new THREE.Color(b[k]), u);
    else out[k] = a[k] + (b[k] - a[k]) * u;
  }
  return out;
}

// Position du circuit (calendrier), sinon longitude d'après le fuseau horaire de la séance
function circuitPlace() {
  const info = store.state.SessionInfo, key = Number(info?.Meeting?.Circuit?.Key);
  const c = Object.values(CIRCUITS).find((x) => x.key === key);
  if (c) return c;
  const m = /^(-)?(\d+):(\d+)/.exec(info?.GmtOffset || '');
  return { lat: 35, lon: m ? (m[1] ? -1 : 1) * (+m[2] + m[3] / 60) * 15 : 0 };
}

// Hauteur du ruban de piste en (x, z), près du point i du tracé : interpolée sur le segment où tombe le point (voitures,
// caméras et sol lisent la même hauteur que la piste, sans marches) ; pente du segment (montée positive)
function trackAt(P, i, x, z) {
  const N = P.length;
  for (const [a, b] of [[i, (i + 1) % N], [(i - 1 + N) % N, i]]) {
    const A = P[a], B = P[b], dx = B.x - A.x, dz = B.z - A.z, l2 = dx * dx + dz * dz || 1, u = ((x - A.x) * dx + (z - A.z) * dz) / l2;
    if (u >= 0 && u <= 1) return [A.y + (B.y - A.y) * u, (B.y - A.y) / Math.sqrt(l2)];
  }
  const B = P[(i + 1) % N];
  return [P[i].y, (B.y - P[i].y) / (Math.hypot(B.x - P[i].x, B.z - P[i].z) || 1)];
}

// Distance au carré du point (x, z) au tracé et hauteur de la piste à cet endroit (recherche tous les 3 points, affinée)
function trackNear(P, x, z) {
  const N = P.length, d = (i) => (P[i].x - x) ** 2 + (P[i].z - z) ** 2;
  let bi = 0;
  for (let i = 3; i < N; i += 3) if (d(i) < d(bi)) bi = i;
  for (let k = -2; k <= 2; k++) if (d((bi + k + N) % N) < d(bi)) bi = (bi + k + N) % N;
  return [d(bi), trackAt(P, bi, x, z)[0]];
}

// Point du tracé le plus proche de (x, z) : recherche locale autour du dernier (hint), sinon sur tout le tour
function nearestIndex(world, x, z, hint) {
  const { P, N } = world;
  let best = hint, bd = Infinity;
  const look = (i) => { const d = (P[i].x - x) ** 2 + (P[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } };
  if (hint >= 0) for (let k = -40; k <= 40; k++) look((hint + k + N) % N);
  if (hint < 0 || bd > 30 ** 2) for (let i = 0; i < N; i++) look(i);
  return best;
}

// ---------- Voiture : F1 2026 faite maison (5,4 × 1,9 m, empattement 3,4 m), jamais de livrée ni de logo ----------
// Avant vers +z, sol en y = 0. -> [carrosserie (couleur de l'écurie), pièces sombres (carbone, pneus, jantes, casque :
// couleur de chaque sommet), feux arrière]
function carGeometries() {
  const parts = [[], [], []];
  const CARBON = new THREE.Color(0x1c1e22), TYRE = new THREE.Color(0x0d0d0e), RIM = new THREE.Color(0x6c737c), HELMET = new THREE.Color(0xe9e9e6);
  const add = (k, geo, m, color) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    g.userData.color = color;
    parts[k].push(g);
  };
  const at = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z);
  // Corps fuselé : sections [z, x, y du centre, demi-largeur, demi-hauteur] de l'avant vers l'arrière (superellipses
  // de n points, e : plus elles sont carrées), extrémités fermées
  const loft = (sec, n, e) => {
    const pos = [], idx = [], ring = ([z, cx, cy, hw, hh]) => {
      for (let j = 0; j < n; j++) {
        const a = (j / n) * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a);
        pos.push(cx + hw * Math.sign(c) * Math.abs(c) ** (2 / e), cy + hh * Math.sign(s) * Math.abs(s) ** (2 / e), z);
      }
    };
    sec.forEach(ring);
    for (let i = 0; i + 1 < sec.length; i++) {
      for (let j = 0; j < n; j++) { const a = i * n + j, b = i * n + ((j + 1) % n); idx.push(a, a + n, b, b, a + n, b + n); }
    }
    const body = new THREE.BufferGeometry();
    body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    body.setIndex(idx);
    body.computeVertexNormals();
    const out = [body.toNonIndexed()];
    for (const [s, dir] of [[sec[0], 1], [sec.at(-1), -1]]) {   // bouchons (normales vers l'avant, vers l'arrière)
      const cap = [];
      pos.length = 0;
      ring(s);
      for (let j = 0; j < n; j++) {
        const b = j * 3, c = ((j + 1) % n) * 3;
        cap.push(s[1], s[2], s[0], ...(dir > 0 ? [pos[b], pos[b + 1], pos[b + 2], pos[c], pos[c + 1], pos[c + 2]] : [pos[c], pos[c + 1], pos[c + 2], pos[b], pos[b + 1], pos[b + 2]]));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(cap, 3));
      g.computeVertexNormals();
      out.push(g);
    }
    return out;
  };
  // Élément d'aileron : plaque de largeur w, épaisseur t, corde c, relevée de lift(x) vers les bouts
  const plate = (w, t, c, lift = () => 0) => {
    const g = new THREE.BoxGeometry(w, t, c, 8, 1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + lift(p.getX(i)));
    g.computeVertexNormals();
    return g;
  };
  // Dérive : profil [[z, y]…] d'épaisseur t, en x
  const fin = (pts, x, t) => new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y))), { depth: t, bevelEnabled: false })
    .applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x - t / 2, 0, 0));
  // Bras de suspension (ou tige) de a à b
  const up = new THREE.Vector3(0, 1, 0);
  const rod = (a, b, r = 0.016) => {
    const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A);
    add(1, new THREE.BoxGeometry(2 * r, d.length(), 1.3 * r), new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize()))
      .setPosition(A.addScaledVector(d, 0.5)), CARBON);
  };
  const disc = (k, rx, ry, m, color) => add(k, new THREE.CircleGeometry(1, 12).scale(rx, ry, 1), m, color);

  // Coque : nez fin et long jusqu'à l'aileron avant, cockpit, capot moteur, boîte de vitesses
  for (const g of loft([[2.66, 0, 0.2, 0.045, 0.04], [2.45, 0, 0.22, 0.08, 0.06], [2.1, 0, 0.27, 0.12, 0.1], [1.7, 0, 0.33, 0.17, 0.14],
    [1.25, 0, 0.4, 0.23, 0.19], [0.75, 0, 0.44, 0.27, 0.22], [0.1, 0, 0.44, 0.29, 0.21], [-0.5, 0, 0.42, 0.27, 0.22], [-1.1, 0, 0.4, 0.2, 0.2],
    [-1.7, 0, 0.36, 0.13, 0.15], [-2.3, 0, 0.33, 0.08, 0.1]], 16, 2.8)) add(0, g);
  // Prise d'air au-dessus du pilote, qui descend en pente vers l'aileron arrière, et sa dérive
  for (const g of loft([[-0.1, 0, 0.79, 0.12, 0.2], [-0.35, 0, 0.77, 0.15, 0.22], [-0.8, 0, 0.67, 0.14, 0.2], [-1.3, 0, 0.55, 0.1, 0.15], [-1.8, 0, 0.46, 0.06, 0.1]], 12, 2.5)) add(0, g);
  disc(1, 0.08, 0.09, at(0, 0.88, -0.095), CARBON);
  add(0, fin([[-0.85, 0.88], [-1.95, 0.9], [-1.95, 0.64], [-1.4, 0.62]], 0, 0.016));
  // Pontons sculptés : entrée d'air haute et étroite, flancs creusés vers l'arrière
  for (const s of [-1, 1]) {
    for (const g of loft([[0.62, s * 0.34, 0.42, 0.14, 0.12], [0.5, s * 0.4, 0.41, 0.2, 0.15], [0.2, s * 0.44, 0.39, 0.24, 0.17], [-0.3, s * 0.43, 0.36, 0.24, 0.17],
      [-0.8, s * 0.37, 0.32, 0.19, 0.14], [-1.25, s * 0.29, 0.29, 0.12, 0.1], [-1.6, s * 0.2, 0.29, 0.06, 0.07]], 14, 4)) add(0, g);
    disc(1, 0.12, 0.09, at(s * 0.34, 0.43, 0.625), CARBON);
    add(0, new THREE.BoxGeometry(0.12, 0.06, 0.03), at(s * 0.42, 0.67, 0.58));   // rétroviseurs
    rod([s * 0.27, 0.6, 0.55], [s * 0.38, 0.67, 0.58], 0.012);
  }
  // Cockpit, casque, halo
  disc(1, 0.2, 0.36, at(0, 0.656, 0.3, -Math.PI / 2), CARBON);
  add(1, new THREE.SphereGeometry(0.14, 10, 7), at(0, 0.72, 0.15), HELMET);
  const halo = new THREE.CatmullRomCurve3([[-0.24, 0.64, -0.08], [-0.27, 0.86, 0.12], [-0.18, 0.92, 0.36], [0, 0.93, 0.42], [0.18, 0.92, 0.36], [0.27, 0.86, 0.12], [0.24, 0.64, -0.08]]
    .map((p) => new THREE.Vector3(...p)));
  add(1, new THREE.TubeGeometry(halo, 14, 0.028, 5), null, CARBON);
  rod([0, 0.92, 0.42], [0, 0.65, 0.68], 0.025);
  // Fond plat, diffuseur
  const half = [[0.3, 1.15], [0.62, 0.62], [0.72, 0.45], [0.72, -1.3], [0.52, -1.46], [0.5, -2.25]];
  add(1, new THREE.ExtrudeGeometry(new THREE.Shape([...half, ...half.map(([x, z]) => [-x, z]).reverse()].map(([x, z]) => new THREE.Vector2(x, z))), { depth: 0.04, bevelEnabled: false }),
    new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.07, 0), CARBON);
  add(1, new THREE.BoxGeometry(0.9, 0.03, 0.8), at(0, 0.16, -1.95, -0.3), CARBON);
  // Aileron avant à trois éléments relevés vers les bouts, dérives
  add(1, plate(1.76, 0.025, 0.26, (x) => 0.02 * (x / 0.88) ** 2), at(0, 0.09, 2.62, 0.08), CARBON);
  add(0, plate(1.7, 0.02, 0.17, (x) => 0.07 * (x / 0.85) ** 2), at(0, 0.15, 2.47, 0.35));
  add(1, plate(1.6, 0.02, 0.14, (x) => 0.1 * (x / 0.8) ** 2), at(0, 0.23, 2.36, 0.6), CARBON);
  for (const s of [-1, 1]) add(0, fin([[2.78, 0.04], [2.78, 0.2], [2.55, 0.34], [2.25, 0.34], [2.25, 0.04]], s * 0.89, 0.02));
  // Aileron arrière : plan principal, volet mobile (DRS) et son vérin, dérives, petit aileron du bas, support
  add(1, plate(1.02, 0.03, 0.3, (x) => -0.015 * (1 - (x / 0.51) ** 2)), at(0, 0.82, -2.4, 0.12), CARBON);
  add(0, plate(1.02, 0.02, 0.2), at(0, 0.96, -2.58, 0.55));
  add(1, new THREE.BoxGeometry(0.04, 0.1, 0.06), at(0, 0.9, -2.5), CARBON);
  for (const s of [-1, 1]) add(0, fin([[-2.15, 0.55], [-2.2, 1.0], [-2.72, 1.0], [-2.72, 0.62]], s * 0.52, 0.02));
  add(1, plate(0.8, 0.02, 0.14), at(0, 0.42, -2.45, 0.25), CARBON);
  rod([0, 0.4, -2.25], [0, 0.82, -2.42], 0.02);
  // Roues : pneus larges (plus à l'arrière), jantes ; suspensions fines (triangles, poussoirs), arbres de transmission
  for (const [z, w] of [[1.62, 0.3], [-1.8, 0.38]]) {
    for (const s of [-1, 1]) {
      const x = s * (0.95 - w / 2);
      add(1, new THREE.CylinderGeometry(0.36, 0.36, w, 20), at(x, 0.36, z, 0, 0, Math.PI / 2), TYRE);
      add(1, new THREE.CylinderGeometry(0.23, 0.23, w + 0.012, 14), at(x, 0.36, z, 0, 0, Math.PI / 2), RIM);
      const hub = s * (0.95 - w - 0.02), lo = z > 0 ? 1 : -1;
      for (const [y0, y1] of [[0.5, 0.5], [0.28, 0.22]]) {
        rod([s * 0.18, y0, z + 0.25 * lo], [hub, y1, z]);
        rod([s * 0.18, y0, z - 0.2 * lo], [hub, y1, z]);
      }
      rod([hub, 0.24, z], [s * 0.2, 0.55, z - 0.08 * lo]);
      if (z < 0) rod([s * 0.1, 0.34, z], [hub, 0.36, z], 0.025);
    }
  }
  // Feux arrière (pluie, nuit) : sous la boîte de vitesses et au bord des dérives
  add(2, new THREE.BoxGeometry(0.12, 0.05, 0.02), at(0, 0.33, -2.31));
  for (const s of [-1, 1]) add(2, new THREE.BoxGeometry(0.025, 0.3, 0.02), at(s * 0.52, 0.82, -2.73));
  return parts.map(merge);
}

// Géométries réunies en une seule ; couleur des sommets si les pièces en ont une
function merge(list) {
  const pos = [], nor = [], col = [];
  for (const g of list) {
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    const c = g.userData.color;
    if (c) for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (col.length) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

// Étiquette dessinée sur un canevas de w × h px (deux fois plus fin) : draw(g) ; à taille fixe à l'écran (en px,
// ajustée à chaque image par fitSprites), ou dans la scène si m (largeur en mètres) ; depth : cachée derrière le relief
function canvasSprite(w, h, draw, { m = 0, depth = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  draw(g);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: depth, fog: false, sizeAttenuation: !!m, transparent: true }));
  s.userData = { w, h, g, tex, px: !m };
  if (m) s.scale.set(m, (m * h) / w, 1);
  return s;
}

// Étiquettes à taille fixe à l'écran : taille selon la hauteur de la vue et l'angle de la caméra
function fitSprites(root, camera, h) {
  const k = 2 / ((camera.projectionMatrix.elements[5] || 1) * (h || 1));
  root.traverse((o) => { if (o.isSprite && o.userData.px) o.scale.set(o.userData.w * k, o.userData.h * k, 1); });
}

// ---------- Calques de la carte 2D (mêmes cases du menu Calques) : secteurs, zones, stands, virages, drapeaux ----------
// L : calques donnés par la carte 2D (ui/map.js, layers3d). Redessinés seulement quand L.key change
function buildLayers(world, L) {
  const { P, SIDE, N, DS, track, toW, ribbon } = world;
  const group = new THREE.Group(), blink = [];
  const o = L.opt, sectors = o.mapSectors && !L.red && !L.sc && !L.vsc;
  const at = (x, y) => { const [wx, wz] = toW(x, y); return nearestIndex(world, wx, wz, -1); };   // point du tracé -> indice de P
  const atR = (r) => { const p = track.pointAt(r); return at(p.x, p.y); };
  const range = (a, b, more = () => true) => (i) => (b >= a ? i >= a && i <= b : i >= a || i <= b) && more(i);
  const band = (test, { off = 0, width, lift, color, opacity = 1 }) => {
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
    group.add(new THREE.Mesh(ribbon({ off, width, lift, test }), mat));
    return mat;
  };
  const beside = (i, d, up = 2.5) => P[i].clone().addScaledVector(SIDE[i], d).setY(P[i].y + up);   // à d m du milieu de la piste
  const put = (sprite, pos) => { sprite.center.set(0.5, 0); sprite.position.copy(pos); group.add(sprite); return sprite; };   // posée au-dessus du point
  const label = (text, bg, fg, edge) => canvasSprite(Math.ceil(text.length * 7 + 18), 18, (g) => drawBadge(g, (text.length * 7 + 18) / 2, 9, text, bg, fg, edge));

  // Secteurs : fin liseré coloré le long du bord gauche de la piste, micro-secteurs du pilote suivi juste à côté
  // (le milieu de la piste reste de l'asphalte), repères des micro-secteurs, pastilles S1 / S2 / S3
  if (sectors) {
    for (const sec of L.lay.sectors) {
      const a = atR(sec.from), b = atR(sec.from + sec.len);
      band(range(a, b), { off: -(W / 2 - 1.2), width: 0.8, lift: 0.03, color: L.sectorColors[sec.i] });
      const mid = atR(sec.from + sec.len / 2), best = L.best[sec.i];
      put(canvasSprite(best ? 150 : 30, 22, (g) => drawSectorBadge(g, best ? 75 : 15, 11, sec.i, L.sectorColors[sec.i], best)), beside(mid, -(W / 2 + 12)));
    }
    for (const m of L.minis) band(range(atR(m.from), atR(m.to)), { off: -(W / 2 - 2.1), width: 0.8, lift: 0.035, color: m.color });
    for (const m of L.lay.minis) {
      const i = atR(m.r);
      band((k) => k === i, { off: -(W / 2 - 1.65), width: m.last ? 2.6 : 2, lift: 0.04, color: m.last ? 0xffffff : 0xe9edf4, opacity: m.last ? 1 : 0.6 });
    }
    // Numéros des micro-secteurs : à taille fixe dans la scène (lisibles de près)
    if (o.mapMiniNums) {
      for (const sec of L.lay.sectors) {
        let prev = sec.from;
        L.lay.minis.filter((m) => m.i === sec.i).forEach((m, k) => {
          const txt = `${sec.i + 1}.${k + 1}`, mid = atR(prev + (((m.r - prev) % track.L) + track.L) % track.L / 2);
          put(canvasSprite(32, 16, (g) => {
            g.font = `700 13px ${FONT()}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = 'rgba(14,17,22,.75)';
            g.beginPath(); g.roundRect(1, 1, 30, 14, 4); g.fill();
            g.fillStyle = 'rgba(233,237,244,.95)';
            g.fillText(txt, 16, 8.5);
          }, { m: 5 }), beside(mid, W / 2 + 4, 1.5));
          prev = m.r;
        });
      }
    }
  }

  // Zones « ligne droite » (pointillés verts des deux côtés), détection et activation du mode dépassement
  const n = track.pts.length, z = L.zones;
  if (o.mapZones && !L.red && z && !z.zones.some((x) => x.from >= n || x.to >= n)) {
    const idx = (k) => at(track.pts[k].x, track.pts[k].y);
    z.zones.forEach((zz, k) => {
      const a = idx(zz.from), b = idx(zz.to), dash = (i) => Math.floor((i * DS) / 1.5) % 2 === 0;
      for (const s of [-1, 1]) band(range(a, b, dash), { off: s * (W / 2 + 1.2), width: 0.9, lift: 0.03, color: 0x3cc86e });
      const mid = idx((zz.from + Math.floor((((zz.to - zz.from) % n) + n) % n / 2)) % n);
      put(label(`LD ${zz.name || k + 1}`, '#0E1116', '#34D399', '#34D399'), beside(mid, W / 2 + 14));
    });
    for (const [m, color, ink, text, side] of [[z.detection, '#ff4fd8', '#2a0623', 'DÉTECTION', 1], [z.activation, '#3ce08a', '#062414', 'ACTIVATION', -1]]) {
      if (!m || m.idx >= n) continue;
      const i = idx(m.idx);
      band((k) => k === i, { width: W + 8, lift: 0.045, color });
      put(label(text, color, ink), beside(i, side * (W / 2 + 16)));
    }
  }

  // Voie des stands : route plus étroite et plus sombre, pointillés au milieu, étiquette « STANDS »
  const pit = z?.pitLane?.path;
  if (o.mapPit && pit?.length > 1) {
    const pts = [];
    for (let k = 0; k + 1 < pit.length; k++) {
      const [ax, az] = toW(...pit[k]), [bx, bz] = toW(...pit[k + 1]), steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
      for (let j = 0; j < steps; j++) pts.push([ax + ((bx - ax) * j) / steps, az + ((bz - az) * j) / steps]);
    }
    pts.push(toW(...pit.at(-1)));
    const strip = (width, lift, color, test = () => true) => {
      const pos = [], ix = [];
      pts.forEach(([x, zz], k) => {
        const [px, pz] = pts[Math.max(0, k - 1)], [qx, qz] = pts[Math.min(pts.length - 1, k + 1)], l = Math.hypot(qx - px, qz - pz) || 1;
        const sx = -(qz - pz) / l, sz = (qx - px) / l, y = world.groundAt(x, zz) + lift;
        pos.push(x + (sx * width) / 2, y, zz + (sz * width) / 2, x - (sx * width) / 2, y, zz - (sz * width) / 2);
        if (k && test(k)) ix.push(2 * k - 2, 2 * k, 2 * k - 1, 2 * k - 1, 2 * k, 2 * k + 1);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(ix);
      group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })));
    };
    strip(7, 0.3, 0x4a4a55);
    strip(0.35, 0.33, 0xdddde6, (k) => Math.floor(k / 2) % 2 === 0);
    const [mx, mz] = pts[pts.length >> 1];
    put(label('STANDS', '#3a3a44', '#e6e6ee'), new THREE.Vector3(mx, world.groundAt(mx, mz) + 4, mz));
  }

  // Numéros de virage : pastilles à l'extérieur de la piste
  if (o.mapCorners) {
    for (const c of track.corners) {
      const i = at(c.x, c.y), a = (c.angle * Math.PI) / 180, [x0, z0] = toW(c.x, c.y), [x1, z1] = toW(c.x + Math.cos(a) * 560, c.y + Math.sin(a) * 560);
      const l = Math.hypot(x1 - x0, z1 - z0) || 1, rad = 9 + (c.number >= 10 ? 2 : 0);
      put(canvasSprite(26, 26, (g) => {
        g.font = `700 11px ${FONT()}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        drawCornerChip(g, 13, 13, rad, c.number, L.pal);
      }), new THREE.Vector3(x0 + ((x1 - x0) / l) * (W / 2 + 10), P[i].y + 2, z0 + ((z1 - z0) / l) * (W / 2 + 10)));
    }
  }

  // Secteurs de commissaires sous drapeau jaune (double jaune : clignote) et leur fanion
  for (const f of L.flagZones) {
    const a = at(track.pts[f.from].x, track.pts[f.from].y), b = at(track.pts[f.to].x, track.pts[f.to].y);
    const mat = band(range(a, b), { width: W + 3, lift: 0.05, color: f.dbl ? 0xff9f1a : 0xf5c518, opacity: 0.7 });
    if (f.dbl) blink.push(mat);
    put(canvasSprite(44, 20, (g) => drawFlagBadge(g, 22, 10, f.number, f.dbl)), beside(a, W / 2 + 12));
  }
  // Voiture de sécurité estimée devant le leader (placée par placeSc)
  const sc = put(canvasSprite(30, 20, (g) => drawScBadge(g, 15, 10), { depth: false }), new THREE.Vector3());
  sc.visible = false;
  sc.renderOrder = 9;
  const placeSc = (r) => {
    sc.visible = r !== null && r !== undefined;
    if (sc.visible) sc.position.copy(beside(atR(r + track.L / 45), 0, 3));
  };
  placeSc(L.scR);
  // Piste rouge (drapeau rouge) ou orangée (voiture de sécurité), comme la carte 2D
  world.road.material.color.set(L.red ? 0x8f2622 : L.sc || L.vsc ? 0x8c6418 : 0x3a3d42);
  return { group, blink, placeSc };
}

// Position GPS lissée (Catmull-Rom entre les échantillons, 3 à 4 par seconde) ; extrapolation de positions.js au bout
function gpsSmooth(num, t) {
  const arr = store.positions.gps.get(num);
  if (!arr?.length) return null;
  let lo = 0, hi = arr.length - 1, i = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid].t <= t) { i = mid; lo = mid + 1; } else hi = mid - 1; }
  if (i < 0 || t - arr[i].t > 8000) return null;
  const b = arr[i], c = arr[i + 1];
  if (!c || Math.hypot(c.x - b.x, c.y - b.y) > 2500) return store.positions.gpsAt(num, t);
  const a = arr[i - 1] || b, d = arr[i + 2] || c;
  const u = Math.min(1, Math.max(0, (t - b.t) / (c.t - b.t || 1)));
  const cr = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
  return { x: cr(a.x, b.x, c.x, d.x), y: cr(a.y, b.y, c.y, d.y) };
}

// Ouvre la vue dans host ; null si WebGL est indisponible. getTrack / getElevation / getSurroundings : tracé, altitude
// et alentours de la carte 2D ; getLayers : ses calques (cases du menu Calques, drapeaux…) ; onFail(message) :
// contexte WebGL perdu (retour à la carte 2D)
export function open(host, { getTrack, getElevation, getSurroundings = () => null, getLayers = () => null, onFail }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const cvs = renderer.domElement;
  cvs.className = 'map3d-canvas';
  host.innerHTML = `<div class="map3d-bar">
      <div class="map3d-cams" role="group" aria-label="Caméra">${CAMS.map(([k, txt]) => `<button class="btn small" data-cam="${k}">${txt}</button>`).join('')}</div>
      <select class="map3d-driver" aria-label="Pilote suivi" title="Pilote suivi (le même que sur la carte 2D et le classement)"></select>
      <select class="map3d-time" aria-label="Heure">${TIMES.map(([k, txt]) => `<option value="${k}">${txt}</option>`).join('')}</select>
      <select class="map3d-quality" aria-label="Qualité">${QUALITIES.map(([k, txt]) => `<option value="${k}">${txt}</option>`).join('')}</select>
    </div>
    <div class="map3d-note"></div>
    <div class="map3d-credit" hidden><a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">${esc(t('© contributeurs OpenStreetMap'))}</a> · ${esc(t('Altitude : Terrain Tiles (Mapzen, AWS Open Data)'))}</div>`;
  host.prepend(cvs);
  const lost = (e) => { e.preventDefault(); onFail(t('Vue 3D interrompue par la carte graphique : retour à la carte 2D')); };
  cvs.addEventListener('webglcontextlost', lost);

  // ---------- Scène, ciel et lumière (jour) ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 12000);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, glow: { value: new THREE.Color() },
      gk: { value: 0 }, moon: { value: 0 }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // Dégradé du ciel, lueur près de l'horizon du côté du soleil, disque du soleil et halo, lune la nuit
    fragmentShader: `uniform vec3 top, horizon, bottom, glow, sunDir, moonDir; uniform float gk, moon; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y, s = dot(d, sunDir);
        vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.35));
        float side = pow(max(dot(normalize(d.xz + 1e-5), normalize(sunDir.xz + 1e-5)), 0.0), 2.0);
        c = mix(c, glow, gk * side * exp(-abs(h) * 6.0));
        c += vec3(1.0, 0.85, 0.65) * (pow(max(s, 0.0), 250.0) * 0.35 + smoothstep(0.9994, 0.9997, s)) * step(0.0, h) * (1.0 - moon);
        c = mix(c, vec3(0.9, 0.92, 0.98), smoothstep(0.99965, 0.99985, dot(d, moonDir)) * moon);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(8000, 32, 16), skyMat);
  sky.renderOrder = -1;
  // Étoiles (la nuit) : points fixes sur la moitié haute du ciel, plus ou moins brillants
  const starPos = [], starCol = [];
  const rnd = (k) => { const x = Math.sin(k) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i < 1500; i++) {
    const y = rnd(i * 12.9898 + 1) ** 0.7, a = rnd(i * 78.233 + 2) * 2 * Math.PI, r = Math.sqrt(1 - y * y), b = 0.35 + 0.65 * rnd(i * 37.719 + 3) ** 3;
    starPos.push(7000 * r * Math.cos(a), 7000 * y, 7000 * r * Math.sin(a));
    starCol.push(b, b, b * 1.05);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starCol, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
  stars.renderOrder = -1;
  sky.add(stars);
  scene.add(sky);
  // Lumière : soleil (la nuit, lune et projecteurs) et ciel, selon l'heure ; ombres nettes autour de ce qu'on regarde
  const hemi = new THREE.HemisphereLight(0xdfefff, 0x4d6b35, 1.3);
  const sun = new THREE.DirectionalLight(0xfff3df, 2.6);
  const sunDir = new THREE.Vector3(-0.5, 0.75, 0.35).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { near: 1, far: 900 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(hemi, sun, sun.target);
  const amb = {};

  // ---------- Voitures : trois maillages instanciés (carrosserie à la couleur de l'écurie ; carbone, pneus, jantes et
  // casque ; feux arrière, allumés la nuit) ----------
  const [bodyGeo, darkGeo, lightGeo] = carGeometries();
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.3 }), MAX_CARS);
  const darks = new THREE.InstancedMesh(darkGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }), MAX_CARS);
  const tails = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x4a0b0b }), MAX_CARS);
  const carMeshes = [bodies, darks, tails];
  for (const m of carMeshes) { m.castShadow = m !== tails; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
  const cars = new Map();   // num -> { k, q, p, hint, tag (pastille, comme sur la carte 2D), look (son dessin), seen }
  let rosterKey = '';
  const roster = () => {
    const dl = drivers(store.state);
    const key = Object.entries(dl).map(([n, d]) => `${n}:${d.Tla}:${d.TeamColour}`).join();
    if (key === rosterKey) return dl;
    rosterKey = key;
    for (const c of cars.values()) { scene.remove(c.tag); c.tag.material.map.dispose(); c.tag.material.dispose(); }
    cars.clear();
    Object.keys(dl).slice(0, MAX_CARS).forEach((num, k) => {
      const d = dl[num], hex = `#${String(d.TeamColour || '8b95a8').replace('#', '')}`;
      const tag = canvasSprite(64, 64, () => {}, { depth: false });
      tag.center.set(0.5, 0.2);
      tag.renderOrder = 10;
      scene.add(tag);
      bodies.setColorAt(k, new THREE.Color(hex));
      cars.set(num, { k, q: new THREE.Quaternion(), p: new THREE.Vector3(), hint: -1, tag, look: '', seen: false });
    });
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    fillDrivers(dl);
    return dl;
  };

  // ---------- Interface : caméra et pilote suivi ----------
  const saved = storageGet('paddock.map3d', {});
  let mode = CAMS.some(([k]) => k === saved.cam) ? saved.cam : 'poursuite';
  let snap = true;
  const bar = host.querySelector('.map3d-bar'), sel = host.querySelector('.map3d-driver'), note = host.querySelector('.map3d-note');
  const credit = host.querySelector('.map3d-credit'), timeSel = host.querySelector('.map3d-time');
  timeSel.value = TIMES.some(([k]) => k === saved.time) ? saved.time : 'auto';
  timeSel.addEventListener('change', () => storageSet('paddock.map3d', { ...storageGet('paddock.map3d', {}), time: timeSel.value }));
  const showCam = () => { for (const b of bar.querySelectorAll('[data-cam]')) b.classList.toggle('on', b.dataset.cam === mode); };
  showCam();
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cam]');
    if (!b) return;
    mode = b.dataset.cam;
    storageSet('paddock.map3d', { ...storageGet('paddock.map3d', {}), cam: mode });
    if (mode === 'libre') overview();
    snap = true;
    showCam();
  });
  function fillDrivers(dl) {
    const order = orderedNumbers(store.state).filter((n) => dl[n]);
    sel.innerHTML = `<option value="">${esc(t('Leader'))}</option>${order.map((n) => `<option value="${esc(n)}">${esc(dl[n].Tla || n)} · ${esc(dl[n].LastName || dl[n].FullName || '')}</option>`).join('')}`;
    sel.value = store.focus && dl[store.focus] ? store.focus : '';
  }
  sel.addEventListener('change', () => { setFocus(sel.value || null); snap = true; });

  // ---------- Caméra libre : orbite (glisser), déplacement (clic droit ou Maj), zoom (molette, pincement) ----------
  const orbit = { target: new THREE.Vector3(), dist: 800, az: 0, el: 0.9 };
  let world = null;
  function overview() {
    if (!world) return;
    const s = world.box.getSize(new THREE.Vector3());
    world.box.getCenter(orbit.target);
    if (world.land) orbit.target.y = world.groundAt(orbit.target.x, orbit.target.z);   // visée au sol (le centre peut être dans une colline)
    orbit.dist = Math.max(s.x, s.z) * 0.8 + 150;
    orbit.az = 0; orbit.el = 0.95;
  }
  const pointers = new Map();
  let pinch = 0;
  cvs.addEventListener('contextmenu', (e) => e.preventDefault());
  cvs.addEventListener('pointerdown', (e) => {
    if (mode !== 'libre') return;
    cvs.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  cvs.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p || mode !== 'libre') return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) orbit.dist = Math.max(15, Math.min(6000, orbit.dist * (pinch / d)));
      pinch = d;
    } else if (p.pan) {
      const k = orbit.dist / (cvs.clientHeight || 400);
      const right = new THREE.Vector3(Math.cos(orbit.az), 0, -Math.sin(orbit.az)), fwd = new THREE.Vector3(-Math.sin(orbit.az), 0, -Math.cos(orbit.az));
      orbit.target.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
    } else {
      orbit.az -= dx * 0.006;
      orbit.el = Math.max(0.05, Math.min(1.5, orbit.el + dy * 0.005));
    }
  });
  const up = (e) => { pointers.delete(e.pointerId); pinch = 0; };
  cvs.addEventListener('pointerup', up);
  cvs.addEventListener('pointercancel', up);
  cvs.addEventListener('wheel', (e) => {
    if (mode !== 'libre') return;
    e.preventDefault();
    orbit.dist = Math.max(15, Math.min(6000, orbit.dist * (e.deltaY < 0 ? 1 / 1.15 : 1.15)));
  }, { passive: false });
  cvs.addEventListener('dblclick', () => { if (mode === 'libre') overview(); });

  const quality = qualityControl(host, renderer, sun, () => world);

  // ---------- Construction (tracé, ou altitude et alentours arrivés plus tard) ----------
  function rebuild(track, elevation, surroundings) {
    if (world) { scene.remove(world.group); dispose(world.group); }
    world = buildWorld(track, elevation, surroundings, { maxTex: renderer.capabilities.maxTextureSize, aniso: renderer.capabilities.getMaxAnisotropy() });
    world.setQuality(QUALITY[quality.level]);
    world.addStartLine(store.positions.lineFrac());
    scene.add(world.group);
    if (layers) { scene.remove(layers.group); dispose(layers.group); }
    layers = null;   // calques redessinés sur ce tracé
    const s = world.box.getSize(new THREE.Vector3());
    scene.fog = new THREE.Fog(0xc6dcea, 700, Math.max(4800, Math.max(s.x, s.z) * 2.5));
    fogFar = scene.fog.far;
    for (const c of cars.values()) c.hint = -1;
    lastSun = -1e9;   // ambiance appliquée au nouveau décor
    note.textContent = world.source === 'gps' ? t('Relief réel · dénivelé {} m', Math.round(world.relief))
      : world.source === 'terrain' ? t('Relief du terrain · dénivelé {} m', Math.round(world.relief)) : t('Piste à plat : relief pas encore calculé');
    credit.hidden = !world.land;   // mention des sources des alentours, quand ils sont affichés
    overview();
    snap = true;
  }

  // ---------- Image ----------
  const tmp = new THREE.Object3D(), m4 = new THREE.Matrix4(), camPos = new THREE.Vector3(), look = new THREE.Vector3();
  const dir = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let last = performance.now(), raf = 0, focusSeen = null, fogFar = 4800, lastSun = -1e9;
  // Calques de la carte 2D : relus 5 fois par seconde, redessinés seulement quand ils changent
  let L = null, lastL = -1e9, layers = null;
  const pollLayers = (now) => {
    if (now - lastL < 200 && layers) return;
    lastL = now;
    L = getLayers() || null;
    if (!L) return;
    if (layers?.key !== L.key) {
      if (layers) { scene.remove(layers.group); dispose(layers.group); }
      layers = { ...buildLayers(world, L), key: L.key };
      scene.add(layers.group);
    } else layers.placeSc(L.scR);
  };
  // Heure : soleil (direction, couleur, force), ciel, brouillard, étoiles, projecteurs et feux des voitures. Auto : heure
  // affichée (en replay, celle de la séance) au circuit
  let shadowSpan = 45, lastTime = '';
  function setSun(now) {
    lastSun = now;
    lastTime = timeSel.value;
    let h, az;
    if (lastTime === 'auto') {
      const pl = circuitPlace(), ms = f1Now();
      [h, az] = sunAt(ms, pl.lat, pl.lon);
      const off = /^(-)?(\d+):(\d+)/.exec(store.state.SessionInfo?.GmtOffset || ''), local = new Date(ms + (off ? (off[1] ? -1 : 1) * (+off[2] * 60 + +off[3]) * 6e4 : (pl.lon / 15) * 36e5));
      timeSel.title = t('Heure au circuit : {} · soleil à {}°', `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`, Math.round(h));
    } else {
      [h, az] = PRESET[lastTime];
      timeSel.title = '';
    }
    ambience(h, amb);
    const lit = h > -5;   // au-dessus : le soleil éclaire (rasant près de l'horizon) ; en dessous : lune et projecteurs
    const alt = (lit ? Math.max(h, 6) : 55) * RAD, a = (lit ? az : az + 160) * RAD;
    sunDir.copy(world.fromEN(Math.sin(a) * Math.cos(alt), Math.cos(a) * Math.cos(alt), Math.sin(alt))).normalize();
    skyMat.uniforms.sunDir.value.copy(world.fromEN(Math.sin(az * RAD) * Math.cos(h * RAD), Math.cos(az * RAD) * Math.cos(h * RAD), Math.sin(h * RAD))).normalize();
    skyMat.uniforms.moonDir.value.copy(world.fromEN(Math.sin(a) * Math.cos(0.6), Math.cos(a) * Math.cos(0.6), Math.sin(0.6))).normalize();
    const u = skyMat.uniforms;
    u.top.value.copy(amb.top); u.horizon.value.copy(amb.hor); u.bottom.value.copy(amb.low); u.glow.value.copy(amb.glow);
    u.gk.value = amb.gk; u.moon.value = amb.stars;
    sun.color.copy(amb.key); sun.intensity = amb.keyI;
    hemi.color.copy(amb.sky); hemi.groundColor.copy(amb.gnd); hemi.intensity = amb.hemiI;
    stars.material.opacity = amb.stars;
    stars.visible = amb.stars > 0.01;
    scene.fog.color.copy(amb.hor);
    scene.fog.near = 700 - 450 * amb.stars;
    scene.fog.far = fogFar - (fogFar - 2600) * amb.stars;
    world.setLights(amb.lights);
    tails.material.color.setHex(0x4a0b0b).lerp(new THREE.Color(0xff2a2a), amb.lights);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden || !host.getClientRects().length || now - last < 1000 / quality.cap - 4) return;   // économie (quality)
    const dt = Math.min(0.1, (now - last) / 1000), dtCam = Math.min(1, (now - last) / 1000);   // caméra : temps réel
    last = now;
    const tr = getTrack(), el = getElevation(), su = tr ? getSurroundings() : null;
    if (!tr) return;
    if (!world || world.track !== tr || world.elevation !== el || world.surroundings !== su) rebuild(tr, el, su);
    const w = host.clientWidth, h = host.clientHeight;
    if (cvs.width !== Math.round(w * renderer.getPixelRatio()) || cvs.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / (h || 1);
    }
    pollLayers(now);
    const dl = roster();
    if (sel.value !== (store.focus && dl[store.focus] ? store.focus : '') && document.activeElement !== sel) fillDrivers(dl);
    const disp = displayNow(), gps = store.positions.hasGps(disp);
    const lines = store.state.TimingData?.Lines || {};
    const showOut = document.getElementById('mapShowOut')?.checked;
    const redFlag = String(store.state.TrackStatus?.Status || '') === '5';
    const a = 1 - Math.exp(-dtCam * 12);
    // Pastilles : même dessin que la carte 2D (trigramme ou simple point, position, anneaux du leader et des pilotes
    // suivis), redessinées seulement quand elles changent
    const o = L?.opt || { mapLabels: true, mapPosBadges: true }, duel = L?.duel || {};
    const puck = { labels: o.mapLabels, posOpt: o.mapPosBadges, posBadges: o.mapPosBadges, gps, ring: L?.pal.ring || '#07080A' };
    for (const [num, c] of cars) {
      const d = dl[num], pos = Number(lines[num]?.Position) || null, isA = duel.a === num, isB = duel.b === num, sp = isA || isB || store.focus === num;
      const key = [puck.labels, puck.posOpt, puck.gps, puck.ring, pos, isA, isB, sp, d?.Tla, d?.TeamColour].join();
      if (key !== c.look) {
        c.look = key;
        const { g, tex } = c.tag.userData, r = (puck.labels ? 14 : 7) + (sp ? 1.5 : 0);
        g.clearRect(0, 0, 64, 64);
        drawPuck(g, 32, 32, { r, col: `#${String(d?.TeamColour || '8b95a8').replace('#', '')}`, d, num, pos, sp, isA, isB }, puck);
        tex.needsUpdate = true;
      }
      c.tag.material.opacity = L?.hot && !L.hot.has(num) && !sp ? 0.3 : 1;
    }
    for (const [num, c] of cars) {
      const l = lines[num] || {};
      let g = null;
      if (!(l.Retired || (!showOut && (l.KnockedOut || (l.Stopped && !redFlag))) || (!gps && (l.InPit || l.Stopped)))) {
        g = gps ? gpsSmooth(num, disp) : store.positions.estimatedXY(num, disp, dt);
      }
      if (!g) { c.seen = false; for (const m of carMeshes) m.setMatrixAt(c.k, HIDDEN); c.tag.visible = false; continue; }
      const [x, z] = world.toW(g.x, g.y);
      const jump = !c.seen || Math.hypot(x - c.p.x, z - c.p.z) > 200;
      c.hint = nearestIndex(world, x, z, jump ? -1 : c.hint);
      const i = c.hint, [y, slope] = trackAt(world.P, i, x, z);
      c.p.set(x, y, z);
      // Cap : d'après la position 0,12 s avant et après (GPS), sinon le sens de la piste ; pente : celle du tracé
      dir.copy(world.T[i]);
      if (gps) {
        const b = gpsSmooth(num, disp - 120), f = gpsSmooth(num, disp + 120);
        if (b && f) {
          const [bx, bz] = world.toW(b.x, b.y), [fx, fz] = world.toW(f.x, f.y);
          if ((fx - bx) ** 2 + (fz - bz) ** 2 > 0.04) dir.set(fx - bx, 0, fz - bz).normalize();
        }
      }
      dir.y = 0;
      dir.normalize();
      dir.y = slope * Math.sign(dir.x * world.T[i].x + dir.z * world.T[i].z || 1);   // pente dans le sens de la marche
      tmp.position.copy(c.p);
      tmp.lookAt(c.p.x + dir.x, c.p.y + dir.y, c.p.z + dir.z);
      if (jump) c.q.copy(tmp.quaternion); else c.q.slerp(tmp.quaternion, a);
      c.seen = true;
      m4.compose(c.p, c.q, one);
      for (const m of carMeshes) m.setMatrixAt(c.k, m4);
      c.tag.position.set(c.p.x, c.p.y + 1.6, c.p.z);
      c.tag.visible = true;
    }
    for (const m of carMeshes) m.instanceMatrix.needsUpdate = true;

    // Pilote suivi : celui de la carte 2D, sinon le premier du classement qui est en piste
    const order = orderedNumbers(store.state);
    const fnum = [store.focus, ...order].find((n) => cars.get(n)?.seen);
    const focus = cars.get(fnum);
    if (fnum !== focusSeen) { focusSeen = fnum; snap = true; }
    // Étiquette du pilote suivi cachée derrière lui et à bord (elle tomberait sur l'horizon)
    if (focus && (mode === 'poursuite' || mode === 'embarquee')) focus.tag.visible = false;
    camera.fov = FOV[mode];
    // Plan proche reculé quand la caméra est loin (précision de la profondeur : piste juste au-dessus du sol)
    camera.near = !world.land ? 0.1 : mode === 'libre' || !focus ? Math.min(20, Math.max(0.1, orbit.dist / 150)) : mode === 'helico' ? 2 : 0.1;
    camera.updateProjectionMatrix();
    camera.up.set(0, 1, 0);
    if (mode === 'libre' || !focus) {
      const ce = Math.cos(orbit.el);
      camera.position.set(orbit.target.x + orbit.dist * ce * Math.sin(orbit.az), orbit.target.y + orbit.dist * Math.sin(orbit.el), orbit.target.z + orbit.dist * ce * Math.cos(orbit.az));
      camera.position.y = Math.max(camera.position.y, world.groundAt(camera.position.x, camera.position.z) + 2);
      camera.lookAt(orbit.target);
      sun.target.position.copy(orbit.target);
      shadowSpan = Math.min(400, Math.max(45, orbit.dist * 0.35));
    } else {
      const p = focus.p, f = new THREE.Vector3(0, 0, 1).applyQuaternion(focus.q), fh = f.clone().setY(0).normalize();
      const upL = new THREE.Vector3(0, 1, 0).applyQuaternion(focus.q), right = new THREE.Vector3(-fh.z, 0, fh.x);
      let want, target, kPos, kLook;
      if (mode === 'helico') {          // haut, en retrait et de côté, suit doucement
        want = p.clone().addScaledVector(fh, -80).addScaledVector(right, 50).add(new THREE.Vector3(0, 60, 0));
        target = p.clone(); kPos = 2; kLook = 5;
      } else if (mode === 'poursuite') { // derrière la voiture, un peu au-dessus
        want = p.clone().addScaledVector(fh, -7).add(new THREE.Vector3(0, 2.1, 0));
        target = p.clone().addScaledVector(f, 7).add(new THREE.Vector3(0, 0.9, 0)); kPos = 7; kLook = 12;
      } else {                           // embarquée (au-dessus de la prise d'air), solidaire de la voiture
        want = p.clone().addScaledVector(f, -0.1).addScaledVector(upL, 1.38);
        target = p.clone().addScaledVector(f, 40).addScaledVector(upL, 0.9); kPos = Infinity; kLook = Infinity;
      }
      const ease = (k) => (snap || k === Infinity ? 1 : 1 - Math.exp(-dtCam * k));
      camPos.lerp(want, ease(kPos));
      look.lerp(target, ease(kLook));
      // Jamais sous le sol ni sous la piste (sommet d'une bosse entre la caméra et la voiture)
      const ci = nearestIndex(world, camPos.x, camPos.z, focus.hint), [cy] = trackAt(world.P, ci, camPos.x, camPos.z);
      const floor = Math.max(world.groundAt(camPos.x, camPos.z), (world.P[ci].x - camPos.x) ** 2 + (world.P[ci].z - camPos.z) ** 2 < (W / 2 + 3) ** 2 ? cy : -Infinity);
      camPos.y = Math.max(camPos.y, floor + (mode === 'embarquee' ? 0.9 : 1.2));
      camera.position.copy(camPos);
      if (mode === 'embarquee') camera.up.copy(upL);
      camera.lookAt(look);
      if (mode === 'helico') { sun.target.position.copy(p); shadowSpan = 110; } else { sun.target.position.copy(p).addScaledVector(fh, 30); shadowSpan = 45; }
    }
    snap = false;
    // Sol détaillé devant la caméra (inutile de très haut : pas redessiné en tournant autour du circuit)
    camera.getWorldDirection(dir);
    const hd = Math.hypot(dir.x, dir.z) || 1;
    if (mode !== 'libre' || orbit.dist < 900) world.detailAt(camera.position.x + (dir.x / hd) * 180, camera.position.z + (dir.z / hd) * 180);
    if (now - lastSun > 1000 || timeSel.value !== lastTime) setSun(now);
    const cam = sun.shadow.camera, tx = (2 * shadowSpan) / sun.shadow.mapSize.x;
    if (cam.right !== shadowSpan) { Object.assign(cam, { left: -shadowSpan, right: shadowSpan, top: shadowSpan, bottom: -shadowSpan }); cam.updateProjectionMatrix(); }
    const lx = new THREE.Vector3(0, 1, 0).cross(sunDir).normalize(), ly = sunDir.clone().cross(lx), tp = sun.target.position;
    for (const v of [lx, ly]) { const d = tp.dot(v); tp.addScaledVector(v, Math.round(d / tx) * tx - d); }
    sun.position.copy(tp).addScaledVector(sunDir, 300);
    sky.position.copy(camera.position);
    for (const m of layers?.blink || []) m.opacity = 0.45 + 0.35 * Math.sin(now / 180);   // double jaune
    fitSprites(scene, camera, h);
    renderer.render(scene, camera);
    host.dataset.ready = '1';
    quality.frame(now, !focus || store.status?.paused, redFlag);
  }
  raf = requestAnimationFrame(frame);

  return {
    close() {
      cancelAnimationFrame(raf);
      cvs.removeEventListener('webglcontextlost', lost);
      quality.close();
      if (world) dispose(world.group);
      for (const c of cars.values()) { c.tag.material.map.dispose(); c.tag.material.dispose(); }
      dispose(scene);
      renderer.dispose();
      host.innerHTML = '';
    },
  };
}

// ---------- Qualité (Auto / Économe / Haute, choix gardé) et économie de batterie ----------
// Auto : niveau ajusté d'après les images/s (map3d-calc.js), gardé pour la fois suivante. Moins d'images quand rien ne
// bouge, sous drapeau rouge et sur téléphone sur batterie ; toutes pendant qu'on touche à la vue. -> { level, cap :
// images/s visées, frame(now, still, red) : après chaque image, close() }
function qualityControl(host, renderer, sun, getWorld) {
  const sel = host.querySelector('.map3d-quality'), touch = matchMedia('(pointer: coarse)').matches, saved = storageGet('paddock.map3d', {});
  sel.value = QUALITIES.some(([k]) => k === saved.quality) ? saved.quality : 'auto';
  const auto = autoQuality(QUALITY[saved.autoQ] ? saved.autoQ : touch ? 1 : 2);
  const ctl = { level: -1, cap: Infinity };
  let battery = false, busyUntil = 0, unBattery = () => {};
  const apply = () => {
    const level = sel.value === 'econome' ? 0 : sel.value === 'haute' ? 2 : auto.level, q = QUALITY[level];
    sel.title = sel.value === 'auto' ? t('Qualité automatique, en ce moment : {}', t(Q_NAMES[level])) : '';
    if (level === ctl.level) return;
    ctl.level = level;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
    if (sun.shadow.mapSize.x !== q.shadow) {
      sun.shadow.mapSize.set(q.shadow, q.shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    getWorld()?.setQuality(q);
  };
  const choose = () => { storageSet('paddock.map3d', { ...storageGet('paddock.map3d', {}), quality: sel.value }); apply(); };
  sel.addEventListener('change', choose);
  apply();
  // On touche à la vue (caméra, pilote, glisser, molette…) : toutes les images pendant 2 s
  const wake = () => { busyUntil = performance.now() + 2000; ctl.cap = frameCap({ battery, busy: true }); };
  const EVENTS = ['pointerdown', 'pointermove', 'wheel', 'click', 'change'];
  for (const e of EVENTS) host.addEventListener(e, wake, { passive: true });
  // Téléphone sur batterie (si le navigateur le dit) : 30 images/s au plus
  navigator.getBattery?.().then((b) => {
    const upd = () => { battery = touch && !b.charging; };
    upd();
    b.addEventListener('chargingchange', upd);
    unBattery = () => b.removeEventListener('chargingchange', upd);
  }, () => {});
  ctl.frame = (now, still, red) => {
    if (sel.value === 'auto' && auto.frame(now, ctl.cap) !== null) {
      storageSet('paddock.map3d', { ...storageGet('paddock.map3d', {}), autoQ: auto.level });
      apply();
    }
    ctl.cap = frameCap({ still, red, battery, busy: now < busyUntil });
  };
  ctl.close = () => {
    for (const e of EVENTS) host.removeEventListener(e, wake);
    sel.removeEventListener('change', choose);
    unBattery();
  };
  return ctl;
}

function dispose(root) {
  root.traverse((o) => {
    if (!o.isSprite) o.geometry?.dispose();   // géométrie des étiquettes : commune à toutes (three.js)
    for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.userData.extra?.dispose(); m.dispose(); }
  });
}
