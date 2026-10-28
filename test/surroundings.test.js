import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePng, terrarium, demSampler, tilesFor, lonToPx, latToPx, geoFrame, fitTrack, toEN, fromEN, simplify, clipRing, clipLine,
  buildSurroundings, buildingHeight, areaKind, omtElements, SHORTBREAD, extraQueries, overpassElements, deduceWalls, EDGE, deduceRunoff, RUNOFF, areaKind as kindOf, MAX } from '../shared/surroundings.js';
import { decodeMvt } from '../shared/mvt.js';
import { png, terrariumTile } from './fixtures/png.js';
import { mvt } from './fixtures/mvt.js';


test('alentours : image PNG décodée (5 filtres, plusieurs blocs), altitudes terrarium', async () => {
  const rgb = Uint8Array.from({ length: 7 * 6 * 3 }, (_, i) => (i * 37 + (i >> 3) * 11) & 255);
  const img = await decodePng(png(7, 6, rgb));
  assert.deepEqual([img.width, img.height, img.channels], [7, 6, 3]);
  assert.deepEqual([...img.data], [...rgb]);
  const tile = await decodePng(terrariumTile((x, y) => (x === 3 && y === 0 ? -12.5 : 153.5 + x)));
  const h = terrarium(tile);
  assert.equal(h[0], 153.5);   // R 128, G 153, B 128 : 128 × 256 + 153 + 0,5 − 32768
  assert.equal(h[3], -12.5);   // la mer : négatif
  assert.equal(h[255], 408.5);
  await assert.rejects(decodePng(Buffer.from('pas une image')), /PNG/);
});

test('alentours : tuiles de la zone et altitude bilinéaire entre les pixels', () => {
  const zone = { s: 50.42, w: 5.94, n: 50.45, e: 5.99 };
  const tiles = tilesFor(zone, 20);
  assert.ok(tiles.length <= 20 && tiles.every((t) => t.z === tiles[0].z));
  assert.equal(tilesFor(zone, 4).length <= 4, true);
  assert.ok(tilesFor(zone, 4)[0].z < tiles[0].z, 'zoom moins fin pour moins de tuiles');
  // Tuile qui monte de 1 m par pixel vers l'est : altitude au milieu entre deux pixels
  const z = 14, x = Math.floor(lonToPx(5.97, z) / 256), y = Math.floor(latToPx(50.43, z) / 256);
  const grid = new Float32Array(256 * 256).map((_, i) => i % 256);
  const dem = demSampler(z, new Map([[`${x}/${y}`, grid]]));
  const lonAt = (px) => (px / (256 * 2 ** z)) * 360 - 180;
  const lat = 50.43;
  assert.ok(Math.abs(dem(lat, lonAt(x * 256 + 10.5)) - 10) < 1e-6);
  assert.ok(Math.abs(dem(lat, lonAt(x * 256 + 11)) - 10.5) < 1e-6);
  assert.ok(Math.abs(dem(lat, lonAt(x * 256 + 255.9)) - 255) < 1e-6, 'bord de la tuile : voisin manquant ignoré');
  assert.ok(Number.isNaN(dem(lat, lonAt(x * 256 - 300))), 'hors des tuiles');
});

// Tracé « haricot » (m) et la même forme posée sur le terrain par une similitude connue
const bean = Array.from({ length: 320 }, (_, i) => {
  const a = (2 * Math.PI * i) / 320, r = 800 + 250 * Math.cos(2 * a) + 120 * Math.sin(3 * a);
  return [r * Math.cos(a) + 300, r * Math.sin(a) * 0.7 - 150];
});
const TRUE = { s: 0.995, a: (37 * Math.PI) / 180, e: 1234, n: -567 };

test('alentours : calage du tracé sur les pistes d\'OSM (angle et décalage retrouvés, autre piste ignorée)', () => {
  let seed = 3;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const onGround = bean.map(([x, y]) => toEN(TRUE, x, y)).map(([e, n]) => [e + noise(), n + noise()]);
  // Piste coupée en morceaux (chemins d'OSM), plus une piste de karting à côté
  const lines = [onGround.slice(0, 70), onGround.slice(70, 160), onGround.slice(161, 250), [...onGround.slice(250), onGround[0]]];
  lines.push(Array.from({ length: 40 }, (_, i) => [2600 + 80 * Math.cos(i / 6), 900 + 80 * Math.sin(i / 6)]));
  const f = fitTrack(bean, lines);
  assert.ok(Math.abs((f.a * 180) / Math.PI - 37) < 0.3, `angle ${(f.a * 180) / Math.PI}`);
  assert.ok(Math.abs(f.s - TRUE.s) < 0.003, `échelle ${f.s}`);
  const [e, n] = toEN(f, 300, -150), [e0, n0] = toEN(TRUE, 300, -150);
  assert.ok(Math.hypot(e - e0, n - n0) < 2, `décalage ${e - e0} ${n - n0}`);
  assert.ok(f.err < 2 && f.near > 0.97, `écart ${f.err}`);
  // Aller-retour entre les deux repères
  const [x, y] = fromEN(f, ...toEN(f, 12, 34));
  assert.ok(Math.abs(x - 12) < 1e-9 && Math.abs(y - 34) < 1e-9);
  // Pistes sans rapport : écart trop grand (le Worker écarte le résultat)
  const other = fitTrack(bean, [Array.from({ length: 200 }, (_, i) => [500 * Math.cos(i / 30), 500 * Math.sin(i / 30)])]);
  assert.ok(other.err > 8 || other.near < 0.85, `écart ${other.err}`);
  assert.equal(fitTrack(bean, []), null);
});

test('alentours : tuile vectorielle décodée (couches, valeurs, points, lignes, polygones à trous), découpée au carré de la tuile', () => {
  const T = { z: 14, x: 8529, y: 5974 };
  const bytes = mvt([
    { name: 'building', features: [
      // Extérieur dans le sens des aiguilles d'une montre (y vers le bas), trou dans l'autre sens
      { type: 3, props: { render_height: 12, render_min_height: 0, hide_3d: false }, geom: [[[100, 100], [900, 100], [900, 900], [100, 900]], [[300, 300], [300, 600], [600, 600], [600, 300]]] },
      { type: 3, props: { render_height: 4.5 }, geom: [[[4000, 2000], [4300, 2000], [4300, 2300], [4000, 2300]]] },   // déborde de la tuile
    ] },
    { name: 'transportation', extent: 4096, features: [
      { type: 2, props: { class: 'raceway', ramp: 1 }, geom: [[[-200, 2048], [2048, 2048], [2048, 3000]]] },
      { type: 2, props: { class: 'minor', layer: -1 }, geom: [[[10, 10], [20, 20]], [[30, 30], [40, 40]]] },
    ] },
    { name: 'poi', features: [{ type: 1, props: { name: 'Café' }, geom: [[[2048, 2048], [5000, 10]]] }] },
  ]);
  const t = decodeMvt(bytes, T);
  assert.deepEqual(Object.keys(t), ['building', 'transportation', 'poi']);
  assert.deepEqual(Object.keys(decodeMvt(bytes, T, ['poi'])), ['poi'], 'couches demandées seulement');
  const [b, big] = t.building;
  assert.deepEqual(b.props, { render_height: 12, render_min_height: 0, hide_3d: false });
  assert.equal(big.props.render_height, 4.5);
  assert.equal(b.type, 'polygon');
  assert.equal(b.geom.length, 1, 'un polygone');
  assert.equal(b.geom[0].length, 2, 'avec son trou');
  // Coin nord-ouest de la tuile = (0, 0) ; 100 unités sur 4096 vers l'est et le sud
  const n = 2 ** 14, lon0 = (T.x / n) * 360 - 180, lat = (py) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / n))) * 180) / Math.PI;
  assert.ok(Math.abs(b.geom[0][0][0][1] - (lon0 + (100 / 4096 / n) * 360)) < 1e-9);
  assert.ok(Math.abs(b.geom[0][0][0][0] - lat(T.y + 100 / 4096)) < 1e-9);
  assert.ok(b.geom[0][0][0][0] > b.geom[0][0][2][0], 'y vers le bas : latitude qui baisse');
  assert.ok(Math.max(...big.geom[0][0].map((p) => p[1])) <= ((T.x + 1) / n) * 360 - 180 + 1e-12, 'coupé au bord est de la tuile');
  const [race, minor] = t.transportation;
  assert.deepEqual(race.props, { class: 'raceway', ramp: 1 });
  assert.equal(race.geom.length, 1);
  assert.ok(Math.abs(race.geom[0][0][1] - lon0) < 1e-12, 'ligne coupée au bord ouest');
  assert.equal(race.geom[0].length, 3);
  assert.equal(minor.props.layer, -1);
  assert.equal(minor.geom.length, 2, 'ligne en deux morceaux');
  assert.deepEqual(t.poi[0].props, { name: 'Café' });
  assert.equal(t.poi[0].geom.length, 1, 'point hors de la tuile écarté');
  assert.throws(() => decodeMvt(new Uint8Array([0x1f, 1, 2]), T), /illisible/);
});

test('alentours : couches OpenMapTiles -> étiquettes à la manière d\'OSM, bâtiments seulement près du tracé', () => {
  const sq = (lat, lon, d = 0.001) => [[[[lat, lon], [lat, lon + d], [lat + d, lon + d], [lat + d, lon]]]];
  const tiles = [{
    building: [{ type: 'polygon', props: { render_height: 22 }, geom: sq(45, 5) }, { type: 'polygon', props: { render_height: 9 }, geom: sq(46, 5) },
      { type: 'polygon', props: { render_height: 30, hide_3d: true }, geom: sq(45, 5) }],
    landcover: [{ type: 'polygon', props: { class: 'wood', subclass: 'forest' }, geom: sq(45.1, 5) }, { type: 'polygon', props: { class: 'rock' }, geom: sq(45, 5) }],
    landuse: [{ type: 'polygon', props: { class: 'industrial' }, geom: sq(45, 5) }, { type: 'polygon', props: { class: 'pitch' }, geom: sq(45, 5) }],
    water: [{ type: 'polygon', props: { class: 'lake' }, geom: sq(45, 5) }, { type: 'polygon', props: { class: 'ocean' }, geom: sq(45, 5) }],
    waterway: [{ type: 'line', props: { class: 'river' }, geom: [[[45, 5], [45.01, 5]]] }, { type: 'line', props: { class: 'stream', brunnel: 'tunnel' }, geom: [[[45, 5], [45.01, 5]]] }],
    transportation: [{ type: 'line', props: { class: 'primary', ramp: 1 }, geom: [[[45, 5], [45, 5.01]]] }, { type: 'line', props: { class: 'raceway' }, geom: [[[45, 5], [45, 5.01]]] },
      { type: 'line', props: { class: 'path' }, geom: [[[45, 5], [45, 5.01]]] }, { type: 'polygon', props: { class: 'pier' }, geom: sq(45, 5) }],
  }];
  const els = omtElements(tiles, { s: 44.9, w: 4.9, n: 45.5, e: 5.5 });
  assert.deepEqual(els.map((e) => e.tags), [{ building: 'yes', height: 22 }, { natural: 'wood' }, { landuse: 'industrial' }, { leisure: 'pitch' }, { natural: 'water' },
    { waterway: 'river' }, { highway: 'primary_link' }, { highway: 'raceway' }]);
  assert.deepEqual(els.map((e) => areaKind(e.tags)), ['building', 'wood', 'urban', 'grass', 'water', null, null, null]);
  assert.equal(buildingHeight(els[0].tags), 22);
  assert.equal(els[0].geometry.length, 5, 'anneau fermé');
  assert.deepEqual(els[0].geometry[0], els[0].geometry[4]);
  assert.equal(els[5].geometry.length, 2, 'ligne ouverte');
});

test('alentours : simplification, découpe à la zone, genres et hauteurs', () => {
  const line = Array.from({ length: 11 }, (_, i) => [i * 10, i === 5 ? 0.5 : 0]);
  assert.deepEqual(simplify(line, 1), [[0, 0], [100, 0]]);
  assert.equal(simplify(line, 0.45).length, 3);
  assert.deepEqual(clipLine([[-50, 50], [50, 50], [150, 50], [150, 150], [50, 150]], [0, 0, 100, 100]), [[[0, 50], [50, 50], [100, 50]]]);
  const square = [];
  for (let i = 0; i < 40; i++) square.push(i < 10 ? [i * 10, 0] : i < 20 ? [100, (i - 10) * 10] : i < 30 ? [100 - (i - 20) * 10, 100] : [0, 100 - (i - 30) * 10]);
  assert.equal(simplify(square, 1, true).length, 4);
  assert.deepEqual(clipRing([[-50, -50], [50, -50], [50, 50], [-50, 50]], [0, 0, 100, 100]).map(String).sort(), ['0,0', '0,50', '50,0', '50,50']);
  assert.deepEqual(clipRing([[200, 200], [300, 200], [300, 300]], [0, 0, 100, 100]), []);
  assert.equal(areaKind({ landuse: 'forest' }), 'wood');
  assert.equal(areaKind({ natural: 'water' }), 'water');
  assert.equal(areaKind({ landuse: 'meadow' }), 'grass');
  assert.equal(areaKind({ amenity: 'parking' }), 'parking');
  assert.equal(areaKind({ highway: 'footway' }), null);
  assert.equal(buildingHeight({ building: 'yes', height: '25 m' }), 25);
  assert.equal(buildingHeight({ building: 'yes', 'building:levels': '4' }), 14);
  assert.equal(buildingHeight({ building: 'grandstand' }), 10);
  assert.equal(buildingHeight({ building: 'yes' }), 7);
});

test('alentours : données compactes, plafonnées, rien sur la piste', () => {
  // Tracé carré de 1 km (repère du tracé = est, nord), terrain qui monte vers le nord
  const sq = [];
  for (let i = 0; i < 400; i++) { const s = i % 100, k = Math.floor(i / 100); sq.push([[s * 10, 0], [1000, s * 10], [1000 - s * 10, 1000], [0, 1000 - s * 10]][k]); }
  const frame = geoFrame(45, 5), fit = { s: 1, a: 0, e: 0, n: 0 };
  const g = (x, y) => { const [lat, lon] = frame.toGeo(x, y); return { lat, lon }; };
  const ring = (x0, y0, w, h) => [g(x0, y0), g(x0 + w, y0), g(x0 + w, y0 + h), g(x0, y0 + h), g(x0, y0)];
  const elements = [
    ...Array.from({ length: 30 }, (_, i) => ({ type: 'way', tags: { building: 'yes' }, geometry: ring(200 + (i % 6) * 100, 200 + Math.floor(i / 6) * 100, 20 + i, 20) })),
    { type: 'way', tags: { building: 'grandstand' }, geometry: ring(100, -60, 300, 30) },
    { type: 'way', tags: { building: 'yes', height: '30' }, geometry: ring(480, -20, 40, 40) },   // sur la piste (tunnel) : écarté
    { type: 'way', tags: { landuse: 'forest' }, geometry: ring(-1100, -1100, 900, 3000) },
    { type: 'way', tags: { natural: 'water' }, geometry: ring(1300, 300, 200, 100) },
    { type: 'way', tags: { highway: 'primary' }, geometry: [g(-5000, 500), g(-100, 500), g(5000, 500)] },
  ];
  const max = { ...MAX, buildings: 10, trees: 50 };
  const d = buildSurroundings({ track: sq, fit, frame, elements, dem: (lat) => 100 + (lat - 45) * 1000, max, margin: 1200 });
  assert.deepEqual([d.terrain.x0, d.terrain.y0, d.terrain.step], [-1200, -1200, 30]);
  assert.equal(d.terrain.h.length, d.terrain.cols * d.terrain.rows);
  assert.ok(d.terrain.h.every(Number.isInteger));
  assert.ok(d.terrain.h[d.terrain.cols * (d.terrain.rows - 1)] > d.terrain.h[0], 'monte vers le nord');
  assert.equal(d.track.n, sq.length);
  assert.equal(d.track.z.length, sq.length);
  assert.equal(d.stands.length, 1);
  assert.equal(d.stands[0][0], 10);
  assert.equal(d.buildings.length + d.stands.length, 10, 'plafond des bâtiments');
  assert.ok(!d.buildings.some((b) => b[0] === 30), 'bâtiment sur la piste écarté');
  assert.ok(d.buildings.every((b) => b.slice(1).every(Number.isInteger) && b.length === 9), 'contours simplifiés à 4 sommets');
  assert.ok(d.areas.wood && d.areas.water);
  const wood = d.areas.wood[0];
  assert.ok(Math.min(...wood.filter((_, i) => i % 2 === 0)) >= -1200, 'bois découpé à la zone');
  assert.equal(d.lines.road[0][0], 10);
  assert.ok(Math.min(...d.lines.road[0].slice(1).filter((_, i) => i % 2 === 0)) >= -1200, 'route découpée à la zone');
  assert.equal(d.trees.length, 2 * 50, 'plafond des arbres');
  for (let i = 0; i < d.trees.length; i += 2) {
    const [x, y] = [d.trees[i], d.trees[i + 1]];
    assert.ok(Math.min(...sq.map((p) => Math.hypot(p[0] - x, p[1] - y))) > 15, 'pas d\'arbre sur la piste');
  }
  // Relief manquant sur une partie de la zone : rien
  assert.equal(buildSurroundings({ track: sq, fit, frame, dem: (lat) => (lat > 45.01 ? NaN : 1) }), null);
});

test('alentours : enrichissement (parkings Shortbread, réponse Overpass, requêtes ciblées le long du tracé)', () => {
  const sq = (lat, lon, d = 0.001) => [[[[lat, lon], [lat, lon + d], [lat + d, lon + d], [lat + d, lon]]]];
  const sb = omtElements([{ sites: [{ type: 'polygon', props: { kind: 'parking' }, geom: sq(45, 5) }, { type: 'polygon', props: { kind: 'school' }, geom: sq(45, 5) }],
    buildings: [{ type: 'polygon', props: {}, geom: sq(45, 5) }] }], { s: 44, w: 4, n: 46, e: 6 }, SHORTBREAD);
  assert.deepEqual(sb.map((e) => [e.tags, e.geometry.length]), [[{ amenity: 'parking' }, 5]], 'parkings seulement');
  const ov = overpassElements({ elements: [
    { type: 'way', id: 1, tags: { building: 'grandstand', name: 'Tribune', 'building:levels': '3' }, geometry: [{ lat: 45.1234567, lon: 5 }, { lat: 45.2, lon: 5 }, { lat: 45.2, lon: 5.1 }] },
    { type: 'node', id: 2, lat: 45.3, lon: 5.3, tags: { natural: 'tree', species: 'Quercus' } },
    { type: 'way', id: 3, tags: { building: 'stadium' } },   // sans géométrie : écarté
  ] });
  assert.deepEqual(ov, [{ type: 'way', tags: { building: 'grandstand', 'building:levels': '3' }, geometry: [{ lat: 45.123457, lon: 5 }, { lat: 45.2, lon: 5 }, { lat: 45.2, lon: 5.1 }] },
    { type: 'node', lat: 45.3, lon: 5.3, tags: { natural: 'tree' } }]);
  const q = extraQueries({ s: 45, w: 5, n: 45.01, e: 5.02 }, [45.001, 5.001, 45.002, 5.003]);
  assert.match(q.stands, /way\[building~"\^\(grandstand\|stadium\)\$"\]\(45\.00000,5\.00000,45\.01000,5\.02000\);out geom/);
  assert.match(q.trees, /node\[natural=tree\]\(around:250,45\.00100,5\.00100,45\.00200,5\.00300\);out qt/);
});

test('alentours : tribunes d\'Overpass à la place du bâtiment des tuiles, arbres isolés près de la piste d\'abord', () => {
  const sq = [];
  for (let i = 0; i < 400; i++) { const s = i % 100, k = Math.floor(i / 100); sq.push([[s * 10, 0], [1000, s * 10], [1000 - s * 10, 1000], [0, 1000 - s * 10]][k]); }
  const frame = geoFrame(45, 5), fit = { s: 1, a: 0, e: 0, n: 0 };
  const g = (x, y) => { const [lat, lon] = frame.toGeo(x, y); return { lat, lon }; };
  const ring = (x0, y0, w, h) => [g(x0, y0), g(x0 + w, y0), g(x0 + w, y0 + h), g(x0, y0 + h), g(x0, y0)];
  const elements = [
    { type: 'way', tags: { building: 'yes', height: 12 }, geometry: ring(100, -60, 300, 30) },   // tuiles
    { type: 'way', tags: { building: 'grandstand' }, geometry: ring(98, -62, 304, 34) },         // Overpass, même tribune
    { type: 'way', tags: { building: 'yes' }, geometry: ring(500, 300, 40, 40) },
    { type: 'way', tags: { landuse: 'forest' }, geometry: ring(-1100, -1100, 900, 3000) },
    { type: 'node', lat: g(1100, 500).lat, lon: g(1100, 500).lon, tags: { natural: 'tree' } },
    { type: 'node', lat: g(500, 3).lat, lon: g(500, 3).lon, tags: { natural: 'tree' } },          // sur la piste : écarté
  ];
  const d = buildSurroundings({ track: sq, fit, frame, elements, dem: () => 100, max: { ...MAX, trees: 20 } });
  assert.equal(d.stands.length, 1);
  assert.deepEqual(d.buildings.map((b) => b[0]), [7], 'bâtiment des tuiles sous la tribune retiré');
  assert.deepEqual(d.trees.slice(0, 2), [1100, 500], 'arbre isolé d\'abord');
  assert.equal(d.trees.length, 40);
  assert.ok(!d.trees.some((v, i) => i % 2 === 0 && v === 500 && d.trees[i + 1] === 3));
});

test('alentours : murs déduits côté ville (rue empruntée, bâtiments au bord), trous bouchés, morceaux trop courts écartés', () => {
  // Ligne droite de 1 km (aller sur y = 0, retour sur y = 400) : un tracé fermé en rectangle
  const loop = [];
  for (let x = 0; x < 1000; x += 5) loop.push([x, 0]);
  for (let y = 0; y < 400; y += 5) loop.push([1000, y]);
  for (let x = 1000; x > 0; x -= 5) loop.push([x, 400]);
  for (let y = 400; y > 0; y -= 5) loop.push([0, y]);
  const none = () => false;
  assert.deepEqual(deduceWalls(loop, { built: none, onRoad: none, taken: none }), [], 'rien autour : pas de mur');
  // Bâtiments au sud du bas du rectangle, de x = 100 à 600, sauf un trou de 20 m (x = 300 à 320) et un bâtiment isolé
  // de 25 m plus loin (x = 800 à 825)
  const built = (x, y) => y < -EDGE && y > -40 && ((x > 100 && x < 600 && !(x > 300 && x < 320)) || (x > 800 && x < 825));
  const w = deduceWalls(loop, { built, onRoad: none, taken: none });
  assert.equal(w.length, 1, 'trou de 20 m bouché, bâtiment de 25 m sans mur');
  const xs = w[0].map((p) => p[0]), ys = w[0].map((p) => p[1]);
  assert.ok(Math.abs(Math.min(...xs) - 100) < 30 && Math.abs(Math.max(...xs) - 600) < 30, `de ${Math.min(...xs)} à ${Math.max(...xs)}`);
  assert.ok(ys.every((y) => Math.abs(y + EDGE) < 0.5), 'à 1,5 m du bord, côté bâtiments');
  // Déjà un mur d'OSM : rien de déduit là
  assert.deepEqual(deduceWalls(loop, { built, onRoad: none, taken: (x) => x < 700 }), []);
  // Rue empruntée sur tout le tour (circuit en ville) : murs des deux côtés, en boucle fermée
  const street = deduceWalls(loop, { built: none, onRoad: () => true, taken: none });
  assert.equal(street.length, 2);
  for (const l of street) assert.deepEqual(l[0], l.at(-1), 'boucle fermée');
  // Deux portions parallèles à 15 m d'axe en axe (épingle allongée) : pas de mur entre elles, sur l'asphalte de l'autre
  const pin = [];
  for (let x = 0; x < 600; x += 5) pin.push([x, 0]);
  for (let a = -90; a < 90; a += 10) pin.push([600 + 7.5 * Math.cos((a * Math.PI) / 180), 7.5 + 7.5 * Math.sin((a * Math.PI) / 180)]);
  for (let x = 600; x > 0; x -= 5) pin.push([x, 15]);
  for (let a = 90; a < 270; a += 10) pin.push([7.5 * Math.cos((a * Math.PI) / 180), 7.5 + 7.5 * Math.sin((a * Math.PI) / 180)]);
  const both = deduceWalls(pin, { built: none, onRoad: () => true, taken: none });
  const len = both.reduce((sum, l) => sum + l.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - l[i][0], p[1] - l[i][1]), 0), 0);
  assert.ok(len > 1200, `mur tout autour, à l'extérieur (${len} m)`);
  for (const l of both) for (const [x, y] of l) assert.ok(x < 0 || x > 600 || y < -EDGE + 0.5 || y > 15 + EDGE - 0.5, `mur entre les deux portions en ${x}, ${y}`);
});

test('alentours : murs, rails et grillages d\'OSM gardés près de la piste seulement, avec leur genre', () => {
  const sq = [];
  for (let i = 0; i < 400; i++) { const s = i % 100, k = Math.floor(i / 100); sq.push([[s * 10, 0], [1000, s * 10], [1000 - s * 10, 1000], [0, 1000 - s * 10]][k]); }
  const frame = geoFrame(45, 5), fit = { s: 1, a: 0, e: 0, n: 0 };
  const g = (x, y) => { const [lat, lon] = frame.toGeo(x, y); return { lat, lon }; };
  const elements = [
    { type: 'way', tags: { barrier: 'guard_rail' }, geometry: [g(100, -9), g(400, -9)] },
    { type: 'way', tags: { barrier: 'fence' }, geometry: [g(500, -12), g(500, -300)] },   // s'éloigne : coupé à 40 m
    { type: 'way', tags: { barrier: 'wall' }, geometry: [g(300, 300), g(600, 300)] },     // loin de la piste
    { type: 'way', tags: { barrier: 'kerb' }, geometry: [g(100, 5), g(400, 5)] },
  ];
  const d = buildSurroundings({ track: sq, fit, frame, elements, dem: () => 100 });
  assert.deepEqual(d.walls.map((w) => w[0]), [1, 2]);
  assert.deepEqual(d.walls[0].slice(1), [100, -9, 400, -9]);
  assert.ok(Math.min(...d.walls[1].filter((_, i) => i % 2 === 0 && i > 0)) >= -41, 'grillage coupé à 40 m de la piste');
});

test('alentours : graviers et dégagements déduits à l\'extérieur des virages, coupés avant un obstacle', () => {
  // Stade parcouru dans le sens inverse des aiguilles d'une montre : lignes droites de 600 m, épingles de 40 m de rayon
  const st = [];
  for (let x = 0; x < 600; x += 4) st.push([x, -40]);
  for (let a = -90; a < 90; a += 4) st.push([600 + 40 * Math.cos((a * Math.PI) / 180), 40 * Math.sin((a * Math.PI) / 180)]);
  for (let x = 600; x > 0; x -= 4) st.push([x, 40]);
  for (let a = 90; a < 270; a += 4) st.push([40 * Math.cos((a * Math.PI) / 180), 40 * Math.sin((a * Math.PI) / 180)]);
  const g = deduceRunoff(st, { blocked: () => false });
  assert.equal(g.gravel.length, 2, 'graviers dans les deux épingles');
  assert.equal(g.runoff.length, 2);
  const gap = ([x, y]) => Math.min(...st.map((p) => Math.hypot(p[0] - x, p[1] - y)));
  for (const ring of g.gravel) {
    const d = ring.map(gap);
    assert.ok(Math.min(...d) > RUNOFF + 3 && Math.max(...d) < RUNOFF + 29, `graviers après 4 m d'asphalte (${Math.min(...d)} à ${Math.max(...d)} m de la piste)`);
    assert.ok(ring.every(([x, y]) => Math.abs(y) > 40 || x < 0 || x > 600), 'à l\'extérieur');
  }
  // Rien au milieu des lignes droites
  assert.ok([...g.gravel, ...g.runoff].flat().every(([x]) => x < 120 || x > 480));
  // Obstacle (bâtiment, eau, mur) à l'extérieur de l'épingle de droite : rien là
  const cut = deduceRunoff(st, { blocked: (x) => x > 620 });
  assert.ok(cut.gravel.flat().every(([x]) => x < 621), 'rien au-delà de l\'obstacle');
  assert.ok(cut.gravel.some((r) => Math.min(...r.map(([x]) => x)) < -40 - RUNOFF - 20), 'épingle de gauche intacte');
  // Grand cercle de 100 m de rayon : dégagement asphalté tout autour, sans graviers
  const circle = Array.from({ length: 160 }, (_, i) => [100 * Math.cos((i * Math.PI) / 80), 100 * Math.sin((i * Math.PI) / 80)]);
  const c = deduceRunoff(circle, { blocked: () => false });
  assert.deepEqual([c.gravel.length, c.runoff.length], [0, 1]);
  assert.ok(c.runoff[0].every(([x, y]) => Math.hypot(x, y) > 100 + RUNOFF - 1), 'à l\'extérieur');
  // Étiquettes d'OSM
  assert.equal(kindOf({ surface: 'gravel', area: 'yes' }), 'gravel');
  assert.equal(kindOf({ highway: 'raceway', area: 'yes', surface: 'asphalt' }), 'runoff');
  assert.equal(kindOf({ 'area:highway': 'emergency' }), 'runoff');
});
