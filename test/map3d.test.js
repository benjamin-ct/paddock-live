import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, nearFirst, autoQuality, frameCap, weatherState } from '../public/js/ui/map3d-calc.js';

// Images à cadence fixe (fps) pendant ms, à partir de t ; -> [instant de fin, niveaux choisis en route]
function run(auto, t, ms, fps, cap = Infinity) {
  const out = [];
  for (const end = t + ms; t < end; t += 1000 / fps) { const l = auto.frame(t, cap); if (l !== null) out.push(l); }
  return [t, out];
}

test('qualité : trois niveaux, du plus économe au rendu complet', () => {
  assert.equal(QUALITY.length, 3);
  assert.deepEqual(QUALITY.map((q) => q.pr), [1, 1.5, 2]);
  assert.equal(QUALITY[0].shadowAll, false, 'Économe : seules les voitures font de l\'ombre');
  assert.ok(QUALITY[0].trees < QUALITY[1].trees && QUALITY[1].trees < QUALITY[2].trees);
  assert.equal(QUALITY[2].trees, 1);
  assert.equal(QUALITY[2].buildings, 1);
});

test('qualité : arbres et bâtiments les plus grands et les plus près de la piste d\'abord', () => {
  // [distance à la piste, taille]
  assert.deepEqual(nearFirst([[500, 10], [20, 10], [100, 10]]), [1, 2, 0]);
  assert.deepEqual(nearFirst([[100, 5], [100, 40]]), [1, 0], 'à distance égale, le plus grand d\'abord');
  assert.deepEqual(nearFirst([[0, 1], [0, 1], [0, 1]]), [0, 1, 2], 'ordre stable');
  // Une grande tribune un peu loin passe avant une cabane au bord de la piste
  assert.deepEqual(nearFirst([[5, 4], [150, 60]]), [1, 0]);
});

test('qualité Auto : baisse d\'un cran quand ça saccade, après une fenêtre ignorée', () => {
  const auto = autoQuality(2);
  let [t, got] = run(auto, 0, 3100, 60);
  assert.deepEqual(got, [], 'première fenêtre ignorée');
  [t, got] = run(auto, t, 3100, 20);
  assert.deepEqual(got, [1]);
  assert.equal(auto.level, 1);
  [t, got] = run(auto, t, 3100, 20);
  assert.deepEqual(got, [], 'fenêtre qui suit le changement ignorée');
  [t, got] = run(auto, t, 3100, 20);
  assert.deepEqual(got, [0]);
  [, got] = run(auto, t, 20000, 10);
  assert.deepEqual(got, [], 'jamais sous Économe');
});

test('qualité Auto : ne bouge pas tant que ça va, ni pour une image lente isolée', () => {
  const auto = autoQuality(1);
  const [t, got] = run(auto, 0, 60000, 40);
  assert.deepEqual(got, []);
  // Une image de 400 ms dans une fenêtre fluide
  auto.frame(t + 400);
  assert.deepEqual(run(auto, t + 400, 6000, 45)[1], []);
});

test('qualité Auto : remonte prudemment, sans va-et-vient', () => {
  const auto = autoQuality(1);
  // Large marge trois fenêtres de suite (après la fenêtre ignorée) : un cran plus haut
  let [t, got] = run(auto, 0, 12500, 60);
  assert.deepEqual(got, [2]);
  // Ça saccade à ce niveau : retour en arrière, puis plus d'essai avant 60 s (délai qui double)
  [t, got] = run(auto, t, 6200, 20);
  assert.deepEqual(got, [1]);
  [t, got] = run(auto, t, 50000, 60);
  assert.deepEqual(got, [], 'pas de nouvel essai trop tôt');
  [t, got] = run(auto, t, 15000, 60);
  assert.deepEqual(got, [2]);
  // Deuxième échec : attente doublée (plus de 2 minutes)
  [t, got] = run(auto, t, 6200, 20);
  assert.deepEqual(got, [1]);
  [t, got] = run(auto, t, 110000, 60);
  assert.deepEqual(got, []);
  [, got] = run(auto, t, 20000, 60);
  assert.deepEqual(got, [2]);
});

test('qualité Auto : marge moyenne ou images limitées exprès : pas de montée ; arrêts : mesure reprise', () => {
  let auto = autoQuality(1);
  assert.deepEqual(run(auto, 0, 60000, 40)[1], [], '40 images/s : pas assez de marge');
  auto = autoQuality(1);
  assert.deepEqual(run(auto, 0, 60000, 30, 30)[1], [], 'limitée à 30 (batterie) : on ne sait pas s\'il reste de la marge');
  assert.deepEqual(run(auto, 60000, 20000, 20, 30)[1], [0], 'mais 20 pour 30 visées : ça saccade');
  // Limite de 5 images/s (rien ne bouge) : pas une saccade
  auto = autoQuality(2);
  assert.deepEqual(run(auto, 0, 60000, 5, 5)[1], []);
  // Onglet caché 10 s (aucune image) : pas compté comme une saccade
  auto = autoQuality(2);
  let [t] = run(auto, 0, 3100, 60);
  t += 10000;
  assert.deepEqual(run(auto, t, 9000, 60)[1], []);
});

test('économie de batterie : images/s visées', () => {
  assert.equal(frameCap(), Infinity);
  assert.equal(frameCap({ still: true }), 5, 'replay en pause, aucune voiture en piste');
  assert.equal(frameCap({ red: true }), 20, 'drapeau rouge');
  assert.equal(frameCap({ battery: true }), 30, 'téléphone sur batterie');
  assert.equal(frameCap({ still: true, battery: true }), 5);
  assert.equal(frameCap({ still: true, busy: true }), Infinity, 'on touche à la vue : toutes les images');
  assert.equal(frameCap({ still: true, busy: true, battery: true }), 30);
});

test('météo : réelle d\'après la F1 (pluie, pneus montés, nuages prévus), ou choisie', () => {
  assert.deepEqual(weatherState('reelle', { rainfall: '0', compounds: ['SOFT', 'MEDIUM'] }), { rain: 0, wet: 0, cloud: 0 });
  assert.deepEqual(weatherState('reelle', { rainfall: '1' }), { rain: 1, wet: 1, cloud: 1 });
  // La pluie s'est arrêtée mais un quart des voitures roule en intermédiaires : piste encore à moitié mouillée
  const w = weatherState('reelle', { rainfall: '0', compounds: ['INTERMEDIATE', 'MEDIUM', 'MEDIUM', 'SOFT'] });
  assert.equal(w.rain, 0);
  assert.equal(w.wet, 0.5);
  assert.ok(Math.abs(w.cloud - 0.425) < 1e-9);
  assert.equal(weatherState('reelle', { compounds: ['WET', 'INTERMEDIATE', 'SOFT', 'SOFT'] }).wet, 1, 'la moitié en pneus de pluie : piste mouillée');
  assert.equal(weatherState('reelle', { rainfall: '0', cloud: 60 }).cloud, 0.6, 'nuages prévus (direct)');
  assert.equal(weatherState('reelle', { rainfall: '0', cloud: null }).cloud, 0);
  assert.deepEqual(weatherState('sec', { rainfall: '1' }), { rain: 0, wet: 0, cloud: 0 });
  assert.deepEqual(weatherState('pluie', { rainfall: '0' }), { rain: 1, wet: 1, cloud: 1 });
});
