import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../shared/track.js';
import { drawingShapes, drawingMarks, COLORS } from '../shared/fia-drawing.js';
import { estimateZones } from '../shared/zones.js';

// Circuit « stade » (dixièmes de mètre) : ligne droite du bas de 0 à 1 km, virage de droite (T1), ligne droite du haut,
// virage de gauche (T2)
function stadium() {
  const pts = [];
  const R = 2000, S = 10000;
  for (let x = 0; x < S; x += 100) pts.push([x, 0]);
  for (let a = -Math.PI / 2; a < Math.PI / 2; a += 100 / R) pts.push([S + R * Math.cos(a), R + R * Math.sin(a)]);
  for (let x = S; x > 0; x -= 100) pts.push([x, 2 * R]);
  for (let a = Math.PI / 2; a < 1.5 * Math.PI; a += 100 / R) pts.push([R * Math.cos(a), R + R * Math.sin(a)]);
  return { x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), rotation: 0,
    corners: [{ number: 1, trackPosition: { x: S + R, y: R } }, { number: 2, trackPosition: { x: -R, y: R } }] };
}
// Plan du PDF : le même tracé, tourné, retourné et réduit (coordonnées de la page)
const toPdf = ([x, y]) => [50 + 0.03 * y, 80 + 0.03 * x];
const nearestIdx = (track, x, y) => track.pts.reduce((b, p, i) => (Math.hypot(p.x - x, p.y - y) < Math.hypot(track.pts[b].x - x, track.pts[b].y - y) ? i : b), 0);

function drawing(track) {
  const outline = { fill: '#545454', pts: track.pts.map((p) => toPdf([p.x, p.y])) };
  // Bande de la zone « ligne droite » : ligne droite du bas, de 50 à 800 m (morceaux rouges et bleus)
  const stripes = [];
  for (let x = 500; x < 8000; x += 250) for (const fill of [COLORS.normal, COLORS.low]) stripes.push({ fill, pts: [toPdf([x, -20]), toPdf([x + 250, -20]), toPdf([x + 250, 20]), toPdf([x, 20])] });
  // Traits verts en travers de la ligne droite du haut : détection à 600 m, activation à 300 m (deux formes chacun)
  const tick = (x) => [{ fill: COLORS.overtake, pts: [toPdf([x, 3940]), toPdf([x, 4060])] }, { fill: COLORS.overtake, pts: [toPdf([x + 5, 3940]), toPdf([x + 5, 4060])] }];
  const shapes = [outline, ...stripes, ...tick(6000), ...tick(3000)];
  const [dx, dy] = toPdf([6000, 4300]), [ax, ay] = toPdf([3000, 4300]);
  const texts = [
    { x: dx, y: dy, s: 'OT D' },                                   // d'un seul tenant
    { x: ax, y: ay - 4, s: 'OT' }, { x: ax, y: ay + 4, s: 'A' },   // à la verticale, en deux morceaux
    { x: 900, y: 900, s: 'OT D' }, { x: 900, y: 920, s: 'OT A' },  // légende, loin du tracé
  ];
  return { shapes, texts };
}

test('dessin du plan FIA : formes remplies lues dans les opérations du PDF, transformations composées', () => {
  const ol = {
    fnArray: [10, 12, 59, 91, 11, 59, 91],
    argsArray: [null, [2, 0, 0, 2, 10, 20], ['#FF0000'], [23, [{ 0: 0, 1: 0, 2: 0, 3: 1, 4: 5, 5: 0 }]], null, ['#37dd00'], [23, [{ 0: 0, 1: 1, 2: 1, 3: 2, 4: 0, 5: 0, 6: 0, 7: 0, 8: 3, 9: 4 }]]],
  };
  assert.deepEqual(drawingShapes(ol), [
    { fill: '#ff0000', pts: [[10, 20], [20, 20]] },   // transformation de la forme (save … restore)
    { fill: '#37dd00', pts: [[1, 1], [3, 4]] },        // courbe : son point d'arrivée
  ]);
});

test('dessin du plan FIA : recalé sur le tracé, bandes des zones et traits de détection et d\'activation', () => {
  const track = new Track(stadium());
  const m = drawingMarks(drawing(track), track);
  assert.ok(m && m.err <= 1, `recalage : ${m?.err} m`);
  assert.equal(m.runs.length, 1);
  assert.ok(Math.abs(m.runs[0].from - nearestIdx(track, 500, 0)) <= 1);
  assert.ok(Math.abs(m.runs[0].to - nearestIdx(track, 8000, 0)) <= 1);
  assert.ok(Math.abs(m.detection - nearestIdx(track, 6000, 4000)) <= 1);
  assert.ok(Math.abs(m.activation - nearestIdx(track, 3000, 4000)) <= 1);
  // Dessin sans le tracé : inutilisable
  assert.equal(drawingMarks({ shapes: drawing(track).shapes.filter((s) => s.fill !== '#545454'), texts: [] }, track), null);
});

test('zones officielles : fin de la zone et points de détection et d\'activation pris sur le dessin du plan', () => {
  const track = new Track(stadium());
  const official = { zones: [{ name: 'A1', normal: { m: 350, dir: 1, turn: 2, text: '350m after T2' }, low: null }],
    detection: { m: 0, dir: 1, turn: 1, text: 'Mid-T1' }, activation: { m: 0, dir: 1, turn: 1, text: 'Mid-T1' }, source: 'plan' };
  const marks = drawingMarks(drawing(track), track);
  const z = estimateZones(track, [], [], { ...official, marks });
  assert.equal(z.zones.length, 1);
  assert.ok(Math.abs(z.zones[0].to - nearestIdx(track, 8000, 0)) <= 1, `fin de la zone : ${z.zones[0].to}`);
  assert.ok(Math.abs(z.detection.idx - marks.detection) === 0 && z.detection.text === 'Mid-T1');
  assert.equal(z.activation.idx, marks.activation);
  assert.deepEqual(z.drawing, { err: marks.err });
  // Sans dessin : fin avant le virage suivant, points du texte
  const plain = estimateZones(track, [], [], { ...official, marks: false });
  assert.equal(plain.drawing, false);
  assert.notEqual(plain.zones[0].to, z.zones[0].to);
});
