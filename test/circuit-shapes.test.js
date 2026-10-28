import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nearestShape, shapeOutline } from '../shared/circuit-shapes.js';

const shapes = JSON.parse(fs.readFileSync(new URL('../public/data/f1-circuits.json', import.meta.url), 'utf8')).circuits;

// Calendrier 2026 (Jolpica) : identifiant du circuit, position donnée par le calendrier, tracé attendu
const SEASON_2026 = [
  ['albert_park', -37.8497, 144.968, 'au-1953'], ['shanghai', 31.3389, 121.22, 'cn-2004'], ['suzuka', 34.8431, 136.541, 'jp-1962'],
  ['miami', 25.9581, -80.2389, 'us-2022'], ['villeneuve', 45.5, -73.5228, 'ca-1978'], ['monaco', 43.7347, 7.42056, 'mc-1929'],
  ['catalunya', 41.57, 2.26111, 'es-1991'], ['red_bull_ring', 47.2197, 14.7647, 'at-1969'], ['silverstone', 52.0786, -1.01694, 'gb-1948'],
  ['spa', 50.4372, 5.97139, 'be-1925'], ['hungaroring', 47.5789, 19.2486, 'hu-1986'], ['zandvoort', 52.3888, 4.54092, 'nl-1948'],
  ['monza', 45.6156, 9.28111, 'it-1922'], ['madring', 40.46528, -3.61528, 'es-2026'], ['baku', 40.3725, 49.8533, 'az-2016'],
  ['sepang', 2.76083, 101.738, 'my-1999'], ['marina_bay', 1.2914, 103.864, 'sg-2008'], ['americas', 30.1328, -97.6411, 'us-2012'],
  ['rodriguez', 19.4042, -99.0907, 'mx-1962'], ['interlagos', -23.7036, -46.6997, 'br-1940'], ['vegas', 36.1147, -115.173, 'us-2023'],
  ['losail', 25.49, 51.4542, 'qa-2004'], ['yas_marina', 24.4672, 54.6031, 'ae-2009'],
  // Anciens Grands Prix encore au calendrier récent
  ['bahrain', 26.0325, 50.5106, 'bh-2002'], ['jeddah', 21.6319, 39.1044, 'sa-2021'], ['imola', 44.3439, 11.7167, 'it-1953'],
];

test('tracés : chaque circuit de la saison retrouvé par sa position', () => {
  for (const [id, lat, lon, want] of SEASON_2026) assert.equal(nearestShape(shapes, lat, lon)?.id, want, id);
});

test('tracés : rien loin d\'un circuit connu ou sans position', () => {
  assert.equal(nearestShape(shapes, 48.8566, 2.3522), null);   // Paris
  assert.equal(nearestShape(shapes, undefined, 2.35), null);
  assert.equal(nearestShape(null, 19.4, -99.09), null);
});

test('tracés : dessin dans un carré 100 × 100, nord en haut, centré', () => {
  // Rectangle deux fois plus large que haut (à l'équateur) : sommet nord-ouest en haut à gauche
  const pts = shapeOutline([[0, 0.001], [0.002, 0.001], [0.002, 0], [0, 0]]).split(' ').map((p) => p.split(',').map(Number));
  assert.deepEqual(pts, [[4, 27], [96, 27], [96, 73], [4, 73]]);
  assert.equal(shapeOutline([]), '');
  // Vrai tracé : tout dans la marge de 4
  const xy = shapeOutline(nearestShape(shapes, 19.4042, -99.0907).line).split(' ').flatMap((p) => p.split(',').map(Number));
  assert.ok(Math.min(...xy) >= 3.9 && Math.max(...xy) <= 96.1);
});
