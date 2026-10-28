import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePng, terrarium, demSampler, tilesFor, lonToPx, latToPx, geoFrame, fitTrack, toEN, fromEN, simplify, clipRing, clipLine, stitch,
  buildSurroundings, buildingHeight, areaKind, trimOsm, MAX } from '../shared/surroundings.js';
import { png, terrariumTile } from './fixtures/png.js';


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

test('alentours : simplification, découpe à la zone, anneaux assemblés, genres et hauteurs', () => {
  const line = Array.from({ length: 11 }, (_, i) => [i * 10, i === 5 ? 0.5 : 0]);
  assert.deepEqual(simplify(line, 1), [[0, 0], [100, 0]]);
  assert.equal(simplify(line, 0.45).length, 3);
  assert.deepEqual(clipLine([[-50, 50], [50, 50], [150, 50], [150, 150], [50, 150]], [0, 0, 100, 100]), [[[0, 50], [50, 50], [100, 50]]]);
  const square = [];
  for (let i = 0; i < 40; i++) square.push(i < 10 ? [i * 10, 0] : i < 20 ? [100, (i - 10) * 10] : i < 30 ? [100 - (i - 20) * 10, 100] : [0, 100 - (i - 30) * 10]);
  assert.equal(simplify(square, 1, true).length, 4);
  assert.deepEqual(clipRing([[-50, -50], [50, -50], [50, 50], [-50, 50]], [0, 0, 100, 100]).map(String).sort(), ['0,0', '0,50', '50,0', '50,50']);
  assert.deepEqual(clipRing([[200, 200], [300, 200], [300, 300]], [0, 0, 100, 100]), []);
  const p = (lat, lon) => ({ lat, lon });
  const rings = stitch([[p(0, 0), p(0, 1)], [p(1, 1), p(0, 1)], [p(1, 1), p(1, 0), p(0, 0)]]);
  assert.equal(rings.length, 1);
  assert.equal(rings[0].length, 5);
  assert.equal(areaKind({ landuse: 'forest' }), 'wood');
  assert.equal(areaKind({ natural: 'water' }), 'water');
  assert.equal(areaKind({ landuse: 'meadow' }), 'grass');
  assert.equal(areaKind({ amenity: 'parking' }), 'parking');
  assert.equal(areaKind({ highway: 'footway' }), null);
  assert.equal(buildingHeight({ building: 'yes', height: '25 m' }), 25);
  assert.equal(buildingHeight({ building: 'yes', 'building:levels': '4' }), 14);
  assert.equal(buildingHeight({ building: 'grandstand' }), 10);
  assert.equal(buildingHeight({ building: 'yes' }), 7);
  const t = trimOsm([{ type: 'way', id: 1, tags: { building: 'yes', name: 'Hangar', height: '9' }, geometry: [p(1.123456789, 2)] }]);
  assert.deepEqual(t, [{ type: 'way', tags: { building: 'yes', height: '9' }, geometry: [p(1.123457, 2)] }]);
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
    { type: 'node', tags: { natural: 'tree' }, ...g(1500, 1500) },
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
  assert.deepEqual(d.trees.slice(0, 2), [1500, 1500], 'arbre isolé d\'abord');
  for (let i = 0; i < d.trees.length; i += 2) {
    const [x, y] = [d.trees[i], d.trees[i + 1]];
    assert.ok(Math.min(...sq.map((p) => Math.hypot(p[0] - x, p[1] - y))) > 15, 'pas d\'arbre sur la piste');
  }
  // Relief manquant sur une partie de la zone : rien
  assert.equal(buildSurroundings({ track: sq, fit, frame, dem: (lat) => (lat > 45.01 ? NaN : 1) }), null);
});
