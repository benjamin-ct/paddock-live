import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, nearFirst, autoQuality, frameCap, weatherState, compoundOf, accentColor, drsOpen, seconds, pickBattle, bestLap, sessionBest, lapTrace, traceAt, wallCuts, pitRoute } from '../public/js/ui/map3d-calc.js';

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

test('pneus : composé du relais en cours', () => {
  assert.equal(compoundOf(null), null);
  assert.equal(compoundOf({ 0: { Compound: 'MEDIUM', TotalLaps: 12 } }), 'MEDIUM');
  // Objet indexé (direct) : le relais 10 après le 9, pas dans l'ordre des clés en texte
  const st = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [String(i), { Compound: i === 10 ? 'HARD' : 'SOFT' }]));
  assert.equal(compoundOf(st), 'HARD');
  // Arrêt : nouveau relais encore sans composé -> celui d'avant, puis le nouveau
  assert.equal(compoundOf([{ Compound: 'SOFT' }, { TotalLaps: 0 }]), 'SOFT');
  assert.equal(compoundOf([{ Compound: 'SOFT' }, { Compound: 'INTERMEDIATE' }]), 'INTERMEDIATE');
  assert.equal(compoundOf([{ Compound: 'wet' }]), 'WET');
  assert.equal(compoundOf([{ Compound: 'UNKNOWN' }]), null);
});

test('couleurs d\'écurie : deuxième couleur dérivée', () => {
  assert.equal(accentColor('FFFFFF'), '#737373', 'blanc : gris foncé');
  assert.equal(accentColor('#000000'), '#8c8c8c', 'noir : gris clair');
  assert.equal(accentColor('00D7B6'), '#006152', 'turquoise de Mercedes : plus sombre');
  const navy = accentColor('1B2A5C');   // bleu marine : plus clair
  assert.ok(parseInt(navy.slice(5), 16) > 0x5c);
  assert.equal(accentColor(''), null);
  assert.equal(accentColor(undefined), null);
});

test('DRS : volet ouvert d\'après le canal de la télémétrie', () => {
  for (const v of [10, 12, 14, '12']) assert.equal(drsOpen(v), true);
  for (const v of [0, 1, 8, 9, null, undefined]) assert.equal(drsOpen(v), false);
});

test('écarts du chronométrage en secondes', () => {
  assert.equal(seconds('+0.512'), 0.512);
  assert.equal(seconds('1:36.250'), 96.25);
  assert.equal(seconds('12.3'), 12.3);
  for (const v of ['1 L', '+2 LAPS', '', null, undefined]) assert.equal(seconds(v), null);
});

test('caméra Réalisation : la bataille la plus serrée, sans changer de plan trop souvent', () => {
  const L = (num, pos, gap, more = {}) => ({ num, pos, gap, drs: false, gained: 0, ...more });
  // Pas de bataille : le leader
  assert.deepEqual(pickBattle([L('1', 1, null), L('2', 2, 5.1), L('3', 3, 4)], null, 0), { num: '1', since: 0 });
  // Bataille à 0,3 s pour la 5e place plutôt qu'un écart de 1,8 s devant
  let cur = pickBattle([L('1', 1, null), L('2', 2, 1.8), L('5', 5, 0.3), L('6', 6, 3)], null, 0);
  assert.equal(cur.num, '5');
  // Une bataille encore plus serrée arrive : plan gardé au moins 8 s
  const tight = [L('1', 1, null), L('2', 2, 0.1), L('5', 5, 0.3)];
  assert.equal(pickBattle(tight, cur, 5000), cur);
  cur = pickBattle(tight, cur, 9000);
  assert.deepEqual(cur, { num: '2', since: 9000 });
  // Écarts proches : pas de changement pour si peu
  assert.equal(pickBattle([L('2', 2, 0.35), L('5', 5, 0.3)], { num: '2', since: 0 }, 20000).num, '2');
  // Dépassement ou DRS : la voiture qui attaque passe devant
  assert.equal(pickBattle([L('2', 2, 0.5), L('9', 9, 0.6, { gained: 1, drs: true })], { num: '2', since: 0 }, 10000).num, '9');
  // Au bout de 30 s : une autre bataille s'il y en a une
  assert.equal(pickBattle([L('2', 2, 0.2), L('7', 7, 1.2)], { num: '2', since: 0 }, 31000).num, '7');
  assert.equal(pickBattle([L('2', 2, 0.2)], { num: '2', since: 0 }, 31000).num, '2');
  // Plus de bataille : plan en cours gardé 8 s, puis le leader (pas une autre voiture pour toujours)
  const calm = [L('1', 1, null), L('2', 2, 4), L('9', 9, 6)];
  assert.deepEqual(pickBattle([L('2', 2, 4), L('9', 9, 6)], { num: '9', since: 0 }, 9000), { num: '9', since: 0 }, 'leader absent : plan gardé');
  assert.deepEqual(pickBattle(calm, { num: '9', since: 0 }, 5000), { num: '9', since: 0 });
  assert.deepEqual(pickBattle(calm, { num: '9', since: 0 }, 9000), { num: '1', since: 9000 });
  const lead = { num: '1', since: 9000 };
  assert.equal(pickBattle(calm, lead, 60000), lead, 'déjà sur le leader : plan gardé');
  // La voiture suivie n'est plus en piste : la meilleure bataille tout de suite
  assert.equal(pickBattle([L('2', 2, 0.2)], { num: '44', since: 0 }, 1000).num, '2');
});

test('fantôme du meilleur tour : tour le plus rapide connu, trajet et position', () => {
  const laps = {
    1: [{ lap: 1, t: 1000, time: '1:40.000' }, { lap: 2, t: 97000, time: '1:36.000' }, { lap: 3, t: 194000, time: '1:37.000' }],
    16: [{ lap: 2, t: 99000, time: '1:35.900' }, { lap: 4, t: 300000, time: '1:35.000' }, { lap: 5, t: 394800, time: '1:34.800' }],
  };
  // Le 4e tour de 16 ne compte pas (début inconnu : tour 3 absent)
  assert.deepEqual(bestLap(laps), { num: '16', lap: 5, time: 94.8, t0: 300000, t1: 394800 });
  assert.deepEqual(bestLap(laps, '1'), { num: '1', lap: 2, time: 96, t0: 1000, t1: 97000 });
  assert.equal(bestLap({}), null);
  // Le plus rapide dont on a encore le trajet
  assert.deepEqual(bestLap(laps, null, (b) => b.t0 > 150000), { num: '16', lap: 5, time: 94.8, t0: 300000, t1: 394800 });
  assert.equal(bestLap(laps, null, (b) => b.num === '1').lap, 2);
  assert.equal(bestLap(laps, null, () => false), null);
  const tr = lapTrace([{ t: 900, x: 0, y: 0 }, { t: 1000, x: 10, y: 0 }, { t: 2000, x: 20, y: 10 }, { t: 97000, x: 10, y: 0 }, { t: 97100, x: 11, y: 0 }], 1000, 97000);
  assert.deepEqual(tr.map((p) => p.dt), [0, 1000, 96000]);
  assert.deepEqual(traceAt(tr, 500), { x: 15, y: 5 });
  assert.equal(traceAt(tr, -1), null);
  assert.equal(traceAt(tr, 96001), null);
  assert.equal(traceAt([], 0), null);
});

test('murs : ouverts là où la voie des stands les traverse, pas là où elle les longe', () => {
  // Mur droit le long de x, en morceaux de 4 m (de x = 0 à 40), puis un autre mur plus loin
  const parts = Array.from({ length: 10 }, (_, i) => ({ a: [i * 4, 0], b: [i * 4 + 4, 0], wall: 'a' }));
  parts.push({ a: [40, 0], b: [44, 0], wall: 'b' });
  // Voie qui traverse le mur à x = 21 (morceau 5) en biais (45°) : le morceau et ses deux voisins
  assert.deepEqual(wallCuts(parts, [[11, -10], [31, 10]]), [4, 5, 6]);
  // Traversée au bout du mur : le voisin d'un autre mur reste
  assert.deepEqual(wallCuts(parts, [[39, -5], [39, 5]]), [8, 9]);
  // Voie qui longe le mur en zigzaguant dessus (2°) : rien
  assert.deepEqual(wallCuts(parts, [[0, -0.5], [20, 0.2], [40, -0.5]]), []);
  // Voie à côté du mur sans le toucher : rien
  assert.deepEqual(wallCuts(parts, [[0, 6], [40, 6]]), []);
});

test('fantôme : meilleur tour officiel de la séance, d\'après le chronométrage', () => {
  assert.deepEqual(sessionBest({ 3: { PersonalBestLapTime: { Value: '1:39.307', Position: 1 } }, 16: { PersonalBestLapTime: { Value: '1:39.687', Position: 2 } } }), { num: '3', time: 99.307 });
  assert.deepEqual(sessionBest({ 16: { PersonalBestLapTime: { Value: '1:38.5', Position: '1' } } }), { num: '16', time: 98.5 });
  assert.equal(sessionBest({ 1: { PersonalBestLapTime: { Value: '', Position: 1 } } }), null);
  assert.equal(sessionBest(undefined), null);
});

test('voie des stands : longe la piste et glisse dessous en pente douce à l\'entrée et à la sortie', () => {
  // Piste droite le long de x (milieu en z = 0, droite vers +z). Voie tous les 2 m comme le GPS des voitures : part du
  // milieu de la piste, s'écarte à 16 m en 60 m, revient en biais sur 120 m (elle chevaucherait la piste)
  const near = (x) => [x, 0, 0, 1];
  const raw = [];
  for (let x = 0; x <= 520; x += 2) raw.push([x, x < 60 ? (16 * x) / 60 : x <= 400 ? 16 : 16 - (13 * (x - 400)) / 120]);
  const lane = pitRoute(raw, near);
  assert.equal(lane.length, raw.length);
  const inner = 7 - 3.5, outer = 7 + 1.8 + 3.5;
  // Bouts : pointe nulle, sous la piste (bord extérieur de la voie au bord de la piste)
  for (const q of [lane[0], lane.at(-1)]) {
    assert.equal(q.w, 0);
    assert.ok(Math.abs(q.z - inner) < 1e-9);
  }
  // À côté de la piste partout sauf à 60 m des bouts, jamais de l'autre côté
  lane.forEach((q, i) => {
    const u = Math.min(i, lane.length - 1 - i) * 2;
    assert.ok(q.z >= inner - 1e-9, `point ${i}`);
    if (u >= 60) assert.ok(q.z >= outer - 1e-9, `point ${i} à ${q.z} m`);
    if (u >= 15) assert.equal(q.w, 7);
  });
  // Pente douce : pas de marche d'un point à l'autre ; le long des stands, voie laissée où elle est
  for (let i = 1; i < lane.length; i++) assert.ok(Math.abs(lane[i].z - lane[i - 1].z) < 0.6, `marche au point ${i}`);
  assert.equal(lane[100].z, 16);
  // Ligne blanche du côté de la piste là où la voie la longe, pas le long des stands
  assert.equal(lane[100].edge, null);
  const q = lane[lane.length - 40];
  assert.ok(q.edge && Math.abs(q.edge[1] - (q.z - 3.3)) < 1e-9);
  // Voie de l'autre côté de la piste : la même en miroir
  const left = pitRoute(raw.map(([x, z]) => [x, -z]), near);
  left.forEach((p, i) => assert.ok(Math.abs(p.z + lane[i].z) < 1e-9));
});

test('voie des stands : une voie qui passe sous la piste garde son côté de part et d\'autre', () => {
  // Sortie en tunnel : la voie longe la piste à droite, la traverse et la rejoint par la gauche
  const near = (x) => [x, 0, 0, 1];
  const raw = [];
  for (let x = 0; x <= 400; x += 2) raw.push([x, x < 200 ? 15 : x < 260 ? 15 - (30 * (x - 200)) / 60 : -15 + (15 * (x - 260)) / 140]);
  const lane = pitRoute(raw, near);
  assert.ok(lane.slice(30, 95).every((p) => p.z >= 12.3 - 1e-9), 'avant : à droite');
  assert.ok(lane.slice(140, 170).every((p) => p.z <= -12.3 + 1e-9), 'après : à gauche');
  assert.equal(pitRoute([[0, 0]], near).length, 0);
});
