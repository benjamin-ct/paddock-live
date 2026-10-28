// Vue 3D de la carte (case « 3D » du panneau Circuit) : piste en relief (altitude calculée par le serveur d'après le GPS,
// à plat tant qu'elle manque), bords et vibreurs, voitures simples aux couleurs des écuries (jamais de livrée ni de
// logo), caméras Hélico / Poursuite / Embarquée / Libre autour du pilote suivi (le même que sur la carte 2D).
// Chargée seulement à l'ouverture de la vue (three.js). Mêmes positions que la carte 2D : GPS lissé, sinon estimées.
import * as THREE from '/vendor/three/three.module.min.js';
import { store, displayNow, setFocus } from '../store.js';
import { drivers, orderedNumbers, storageGet, storageSet, esc } from '../util.js';
import { t } from '../i18n.js';

const W = 14;           // largeur de la piste (m)
const MAX_CARS = 30;
const CAMS = [['helico', 'Hélico'], ['poursuite', 'Poursuite'], ['embarquee', 'Embarquée'], ['libre', 'Libre']];
const FOV = { helico: 38, poursuite: 62, embarquee: 74, libre: 50 };

// ---------- Circuit : tracé (x, y du tracé MultiViewer, 1/10 m) + altitude (z de chaque point, 1/10 m) ----------
function buildWorld(track, elevation) {
  const n = track.pts.length;
  const z = Array.isArray(elevation?.z) && elevation.z.length === n ? elevation.z : null;
  const zMin = z ? Math.min(...z) : 0;
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
    if (!ctrl.length || v.distanceTo(ctrl.at(-1)) > 0.5) ctrl.push(v);
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
  // Bandes le long du tracé : piste, lignes blanches, vibreurs
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
          if (color) col.push(...color(i).toArray());
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

  // Sol autour de la piste : altitude des points du tracé les plus proches, adoucie au loin (pondération inverse)
  const box = new THREE.Box3().setFromPoints(P);
  const MARGIN = 450, G = 160;
  const gx0 = box.min.x - MARGIN, gz0 = box.min.z - MARGIN;
  const gw = box.max.x - box.min.x + 2 * MARGIN, gd = box.max.z - box.min.z + 2 * MARGIN;
  const sub = P.filter((_, i) => i % 14 === 0), near = P.filter((_, i) => i % 3 === 0);
  const H = new Float32Array((G + 1) * (G + 1)), DMIN = new Float32Array(H.length);
  const smooth = (lo, hi, x) => { const u = Math.min(1, Math.max(0, (x - lo) / (hi - lo))); return u * u * (3 - 2 * u); };
  for (let r = 0; r <= G; r++) {
    for (let c = 0; c <= G; c++) {
      const x = gx0 + (c / G) * gw, zz = gz0 + (r / G) * gd;
      let dmin = Infinity, hn = 0;
      for (const p of near) { const d2 = (p.x - x) ** 2 + (p.z - zz) ** 2; if (d2 < dmin) { dmin = d2; hn = p.y; } }
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
  const groundAt = (x, zz) => {
    const fc = ((x - gx0) / gw) * G, fr = ((zz - gz0) / gd) * G, c = Math.floor(fc), r = Math.floor(fr), u = fc - c, v = fr - r;
    const h = (rr, cc) => H[Math.min(G, Math.max(0, rr)) * (G + 1) + Math.min(G, Math.max(0, cc))];
    return (h(r, c) * (1 - u) + h(r, c + 1) * u) * (1 - v) + (h(r + 1, c) * (1 - u) + h(r + 1, c + 1) * u) * v;
  };

  const world = { track, elevation, relief: z ? (Math.max(...z) - zMin) / 10 : null, P, T, SIDE, N, box, group, groundAt, toW };
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
  return world;
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

// ---------- Voiture : modèle simple fait maison (dimensions 2026 : 5,4 × 1,9 m), carrosserie à la couleur de l'écurie ----------
function carGeometries() {
  const body = [], dark = [];
  const add = (list, geo, x, y, z, rx = 0, rz = 0) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)).setPosition(x, y, z));
    list.push(g);
  };
  add(dark, new THREE.BoxGeometry(1.45, 0.06, 3.7), 0, 0.07, -0.25);                 // fond plat
  add(body, new THREE.BoxGeometry(0.78, 0.5, 2.1), 0, 0.42, 0.25);                    // coque
  add(body, new THREE.CylinderGeometry(0.1, 0.3, 1.4, 8), 0, 0.36, 1.95, Math.PI / 2); // nez
  add(dark, new THREE.BoxGeometry(1.85, 0.05, 0.5), 0, 0.14, 2.6);                    // aileron avant
  for (const s of [-1, 1]) add(body, new THREE.BoxGeometry(0.04, 0.28, 0.6), s * 0.92, 0.22, 2.55);
  add(body, new THREE.BoxGeometry(1.42, 0.42, 1.55), 0, 0.36, -0.35);                 // pontons
  add(body, new THREE.BoxGeometry(0.5, 0.45, 1.6), 0, 0.74, -0.85);                   // capot moteur
  add(dark, new THREE.BoxGeometry(0.3, 0.32, 0.45), 0, 1.0, -0.2);                    // prise d'air
  add(body, new THREE.BoxGeometry(1.0, 0.06, 0.38), 0, 0.98, -2.45);                  // aileron arrière
  add(dark, new THREE.BoxGeometry(1.0, 0.05, 0.25), 0, 0.82, -2.38);
  for (const s of [-1, 1]) add(dark, new THREE.BoxGeometry(0.04, 0.62, 0.55), s * 0.52, 0.74, -2.42);
  add(dark, new THREE.TorusGeometry(0.3, 0.035, 6, 14, Math.PI), 0, 0.92, 0.12, Math.PI / 2);   // halo
  add(body, new THREE.SphereGeometry(0.15, 12, 8), 0, 0.82, 0.2);                     // casque
  for (const [z, w] of [[1.62, 0.32], [-1.8, 0.4]]) {
    for (const s of [-1, 1]) add(dark, new THREE.CylinderGeometry(0.36, 0.36, w, 18), s * (0.95 - w / 2), 0.36, z, 0, Math.PI / 2);
  }
  return [merge(body), merge(dark)];
}

function merge(list) {
  const pos = [], nor = [];
  for (const g of list) {
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

// Étiquette du pilote (trigramme sur la couleur de l'écurie), de taille fixe à l'écran
function label(text, hex) {
  const c = document.createElement('canvas');
  c.width = 192; c.height = 72;
  const g = c.getContext('2d');
  g.fillStyle = hex;
  g.beginPath(); g.roundRect(6, 6, 180, 60, 16); g.fill();
  const v = parseInt(hex.slice(1), 16), lum = (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  g.fillStyle = lum > 0.5 ? '#0b0b0d' : '#fff';
  g.font = '800 44px "Saira Condensed", "Titillium Web", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 96, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, fog: false, sizeAttenuation: false }));
  s.scale.set(0.1, 0.0375, 1);
  s.center.set(0.5, 0);
  s.renderOrder = 10;
  return s;
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

// Ouvre la vue dans host ; null si WebGL est indisponible. getTrack / getElevation : tracé et altitude de la carte 2D ;
// onFail(message) : contexte WebGL perdu (retour à la carte 2D)
export function open(host, { getTrack, getElevation, onFail }) {
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
    </div>
    <div class="map3d-note"></div>`;
  host.prepend(cvs);
  const lost = (e) => { e.preventDefault(); onFail(t('Vue 3D interrompue par la carte graphique : retour à la carte 2D')); };
  cvs.addEventListener('webglcontextlost', lost);

  // ---------- Scène, ciel et lumière (jour) ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 12000);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3f7fd6) }, horizon: { value: new THREE.Color(0xcfe3f2) }, bottom: { value: new THREE.Color(0x8aa37a) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, horizon, bottom; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.35)); gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(8000, 32, 16), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(0xdfefff, 0x4d6b35, 1.3);
  const sun = new THREE.DirectionalLight(0xfff3df, 2.6);
  const sunDir = new THREE.Vector3(-0.5, 0.75, 0.35).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 600 });
  sun.shadow.bias = -0.0005;
  scene.add(hemi, sun, sun.target);

  // ---------- Voitures : deux maillages instanciés (carrosserie à la couleur de l'écurie, carbone et pneus) ----------
  const [bodyGeo, darkGeo] = carGeometries();
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.25 }), MAX_CARS);
  const darks = new THREE.InstancedMesh(darkGeo, new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.7 }), MAX_CARS);
  for (const m of [bodies, darks]) { m.castShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
  const cars = new Map();   // num -> { k, q, p, hint, tag, seen }
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
      const tag = label(d.Tla || num, hex);
      scene.add(tag);
      bodies.setColorAt(k, new THREE.Color(hex));
      cars.set(num, { k, q: new THREE.Quaternion(), p: new THREE.Vector3(), hint: -1, tag, seen: false });
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

  // ---------- Construction (tracé, ou altitude arrivée plus tard) ----------
  function rebuild(track, elevation) {
    if (world) { scene.remove(world.group); dispose(world.group); }
    world = buildWorld(track, elevation);
    world.addStartLine(store.positions.lineFrac());
    scene.add(world.group);
    const s = world.box.getSize(new THREE.Vector3());
    scene.fog = new THREE.Fog(0xc6dcea, 700, Math.max(4800, Math.max(s.x, s.z) * 2.5));
    for (const c of cars.values()) c.hint = -1;
    note.textContent = world.relief !== null ? t('Relief réel · dénivelé {} m', Math.round(world.relief)) : t('Piste à plat : relief pas encore calculé');
    overview();
    snap = true;
  }

  // ---------- Image ----------
  const tmp = new THREE.Object3D(), m4 = new THREE.Matrix4(), camPos = new THREE.Vector3(), look = new THREE.Vector3();
  const dir = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let last = performance.now(), raf = 0, focusSeen = null;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000), dtCam = Math.min(1, (now - last) / 1000);   // caméra : temps réel
    last = now;
    if (document.hidden || !host.getClientRects().length) return;
    const tr = getTrack(), el = getElevation();
    if (!tr) return;
    if (!world || world.track !== tr || world.elevation !== el) rebuild(tr, el);
    const w = host.clientWidth, h = host.clientHeight;
    if (cvs.width !== Math.round(w * renderer.getPixelRatio()) || cvs.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / (h || 1);
    }
    const dl = roster();
    if (sel.value !== (store.focus && dl[store.focus] ? store.focus : '') && document.activeElement !== sel) fillDrivers(dl);
    const disp = displayNow(), gps = store.positions.hasGps(disp);
    const lines = store.state.TimingData?.Lines || {};
    const showOut = document.getElementById('mapShowOut')?.checked;
    const redFlag = String(store.state.TrackStatus?.Status || '') === '5';
    const a = 1 - Math.exp(-dtCam * 12);
    for (const [num, c] of cars) {
      const l = lines[num] || {};
      let g = null;
      if (!(l.Retired || (!showOut && (l.KnockedOut || (l.Stopped && !redFlag))) || (!gps && (l.InPit || l.Stopped)))) {
        g = gps ? gpsSmooth(num, disp) : store.positions.estimatedXY(num, disp, dt);
      }
      if (!g) { c.seen = false; bodies.setMatrixAt(c.k, HIDDEN); darks.setMatrixAt(c.k, HIDDEN); c.tag.visible = false; continue; }
      const [x, z] = world.toW(g.x, g.y);
      const jump = !c.seen || Math.hypot(x - c.p.x, z - c.p.z) > 200;
      c.hint = nearestIndex(world, x, z, jump ? -1 : c.hint);
      const i = c.hint, Ti = world.T[i];
      c.p.set(x, world.P[i].y, z);
      // Cap : d'après la position 0,12 s avant et après (GPS), sinon le sens de la piste ; pente : celle du tracé
      dir.copy(Ti);
      if (gps) {
        const b = gpsSmooth(num, disp - 120), f = gpsSmooth(num, disp + 120);
        if (b && f) {
          const [bx, bz] = world.toW(b.x, b.y), [fx, fz] = world.toW(f.x, f.y);
          if ((fx - bx) ** 2 + (fz - bz) ** 2 > 0.04) dir.set(fx - bx, 0, fz - bz).normalize();
        }
      }
      dir.y = Ti.y / (Math.hypot(Ti.x, Ti.z) || 1);
      tmp.position.copy(c.p);
      tmp.lookAt(c.p.x + dir.x, c.p.y + dir.y, c.p.z + dir.z);
      if (jump) c.q.copy(tmp.quaternion); else c.q.slerp(tmp.quaternion, a);
      c.seen = true;
      m4.compose(c.p, c.q, one);
      bodies.setMatrixAt(c.k, m4);
      darks.setMatrixAt(c.k, m4);
      c.tag.position.set(c.p.x, c.p.y + 2.2, c.p.z);
      c.tag.visible = true;
    }
    bodies.instanceMatrix.needsUpdate = true;
    darks.instanceMatrix.needsUpdate = true;

    // Pilote suivi : celui de la carte 2D, sinon le premier du classement qui est en piste
    const order = orderedNumbers(store.state);
    const fnum = [store.focus, ...order].find((n) => cars.get(n)?.seen);
    const focus = cars.get(fnum);
    if (fnum !== focusSeen) { focusSeen = fnum; snap = true; }
    // Étiquette du pilote suivi cachée derrière lui et à bord (elle tomberait sur l'horizon)
    if (focus && (mode === 'poursuite' || mode === 'embarquee')) focus.tag.visible = false;
    camera.fov = FOV[mode];
    camera.updateProjectionMatrix();
    camera.up.set(0, 1, 0);
    if (mode === 'libre' || !focus) {
      const ce = Math.cos(orbit.el);
      camera.position.set(orbit.target.x + orbit.dist * ce * Math.sin(orbit.az), orbit.target.y + orbit.dist * Math.sin(orbit.el), orbit.target.z + orbit.dist * ce * Math.cos(orbit.az));
      camera.position.y = Math.max(camera.position.y, world.groundAt(camera.position.x, camera.position.z) + 2);
      camera.lookAt(orbit.target);
      sun.target.position.copy(orbit.target);
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
      if (mode !== 'embarquee') camPos.y = Math.max(camPos.y, world.groundAt(camPos.x, camPos.z) + 1.2);
      camera.position.copy(camPos);
      if (mode === 'embarquee') camera.up.copy(upL);
      camera.lookAt(look);
      sun.target.position.copy(p);
    }
    snap = false;
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 250);
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
    host.dataset.ready = '1';
  }
  raf = requestAnimationFrame(frame);

  return {
    close() {
      cancelAnimationFrame(raf);
      cvs.removeEventListener('webglcontextlost', lost);
      if (world) dispose(world.group);
      for (const c of cars.values()) { c.tag.material.map.dispose(); c.tag.material.dispose(); }
      dispose(scene);
      renderer.dispose();
      host.innerHTML = '';
    },
  };
}

function dispose(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); }
  });
}
