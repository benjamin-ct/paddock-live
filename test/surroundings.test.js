import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePng, terrarium, demSampler, tilesFor, lonToPx, latToPx, geoFrame, fitTrack, toEN, fromEN, simplify, clipRing, clipLine,
  buildSurroundings, buildingHeight, areaKind, omtElements, MAX } from '../shared/surroundings.js';
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
