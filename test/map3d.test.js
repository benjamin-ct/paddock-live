import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, nearFirst, autoQuality, frameCap, weatherState, compoundOf, accentColor, drsOpen, seconds, pickBattle, bestLap, sessionBest, lapTrace, traceAt, wallCuts, pitRoute, steering, wheelSpin, kerbMask, barrierOffsets, standSpots, runoffPlan, groundClimate, GROUND } from '../public/js/ui/map3d-calc.js';

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
  assert.deepEqual(QUALITY.map((q) => q.props), [false, true, true], 'Économe : sans poteaux ni tribunes des virages');
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

// Volant : voiture qui roule à v m/s pendant ms sur un virage de rayon R (signe : à gauche si positif ; Infinity : tout
// droit), images de 1/60 s -> état final
function drive(s, R, ms, v = 40) {
  const dt = 1 / 60;
  let yaw = s ? s.yaw + 0 : 0;
  for (let t = 0; t < ms; t += 1000 / 60) {
    yaw += R === Infinity ? 0 : (v * dt) / R;
    s = steering(s, yaw, v * dt, dt);
  }
  return s;
}

test('volant : tourne du côté du virage, d\'autant plus que le virage est serré, borné et sans saccade', () => {
  let s = steering(null, 0, 0, 0);
  assert.deepEqual([s.angle, s.front], [0, 0]);
  s = drive(s, Infinity, 1000);
  assert.ok(Math.abs(s.angle) < 1e-9, 'tout droit : volant droit');
  const left = drive(s, 100, 3000), right = drive(s, -100, 3000);
  // Rayon 100 m, empattement 3,6 m : roues braquées de atan(0,036) ≈ 2,06°, volant 7 fois plus
  assert.ok(Math.abs(left.angle - 7 * Math.atan(0.036)) < 0.01, `virage à gauche : ${left.angle}`);
  assert.ok(Math.abs(right.angle + left.angle) < 1e-6, 'à droite : l\'inverse');
  assert.ok(Math.abs(left.front - left.angle / 7) < 1e-12);
  assert.ok(drive(s, 30, 3000).angle > left.angle, 'virage serré : plus de volant');
  assert.equal(drive(s, 5, 3000, 10).angle.toFixed(6), (Math.PI / 2).toFixed(6), 'épingle : borné à 90°');
  // Lissé : à l'entrée du virage, le volant tourne peu à peu (jamais plus de 0,2 rad d'une image à l'autre)
  let prev = s, jump = 0;
  for (let k = 0; k < 120; k++) { const next = drive(prev, 15, 1000 / 60); jump = Math.max(jump, Math.abs(next.angle - prev.angle)); prev = next; }
  assert.ok(jump < 0.2, `saut de ${jump}`);
  // À l'arrêt (aucune distance) : volant gardé
  const stop = steering(left, left.yaw + 1, 0, 1);
  assert.ok(Math.abs(stop.angle - left.angle) < 0.01);
  // Cap qui passe de +π à -π : petit virage, pas un demi-tour
  const wrapS = steering({ yaw: Math.PI - 0.01, run: 0, target: 0, angle: 0 }, -Math.PI + 0.01, 4, 10);
  assert.ok(wrapS.target > 0 && wrapS.target < 0.2, `cap qui fait le tour : ${wrapS.target}`);
});

test('roues : tournent à la vitesse de la voiture, sans effet stroboscopique', () => {
  assert.ok(Math.abs(wheelSpin(0, 3.6, 0.05) - 0.5) < 1e-12, '3,6 m/s pendant 0,05 s : 0,18 m, soit 0,5 rad');
  assert.equal(wheelSpin(1, 0, 0.1), 1, 'à l\'arrêt : immobiles');
  assert.equal(wheelSpin(0, 80, 1 / 60), 0.5, 'très vite : au plus 0,5 rad par image');
  assert.ok(wheelSpin(6.2, 2, 0.05) < 1, 'reste entre 0 et 2π');
  assert.equal(wheelSpin(1, -5, 0.1), 1, 'jamais à l\'envers');
});

// Tracé de n points tous les 2,5 m : courbure k entre les points a et b, 0 ailleurs
const bend = (n, parts) => Array.from({ length: n }, (_, i) => parts.find(([a, b]) => i >= a && i < b)?.[2] ?? 0);

test('vibreurs : dans les virages (prolongés un peu), pas sur les lignes droites ni pour un petit bruit', () => {
  const m = kerbMask(bend(400, [[100, 120, 1 / 40], [250, 252, 1 / 40]]), 2.5);
  assert.equal(m.length, 400);
  assert.ok(m.slice(100, 120).every(Boolean), 'virage');
  assert.ok(m[97] && m[122], 'prolongés de 8 m');
  assert.ok(!m[90] && !m[130], 'pas au-delà');
  assert.ok(m.slice(240, 262).every((v) => !v), 'bruit de 5 m : rien');
  assert.ok(m.slice(140, 240).every((v) => !v), 'ligne droite : rien');
  // Virage à cheval sur le début du tour
  const w = kerbMask(bend(400, [[0, 10, -1 / 40], [390, 400, -1 / 40]]), 2.5);
  assert.ok(w[0] && w[399] && w[387] && w[12] && !w[200]);
});

test('murs : des deux côtés des lignes droites, à l\'extérieur des virages et plus loin, sans marche', () => {
  const off = barrierOffsets(bend(400, [[100, 140, 1 / 50]]), 2.5);
  assert.deepEqual(off[300], [15, 15], 'ligne droite : les deux côtés');
  // Virage vers la droite (côté SIDE) : mur à gauche, au loin ; rien à droite
  assert.equal(off[120][1], null);
  assert.equal(off[120][0], 30);
  // Écart adouci : pas plus de 1,5 m d'un point à l'autre
  for (let i = 1; i < 400; i++) if (off[i][0] !== null && off[i - 1][0] !== null) assert.ok(Math.abs(off[i][0] - off[i - 1][0]) <= 1.5, `marche au point ${i}`);
  // Virage à gauche : l'inverse
  const left = barrierOffsets(bend(400, [[100, 140, -1 / 50]]), 2.5);
  assert.equal(left[120][0], null);
  assert.equal(left[120][1], 30);
});

test('tribunes : ligne droite de la ligne d\'arrivée, puis à l\'extérieur des plus grands virages, espacées', () => {
  // Ligne au point 20 ; épingle vers la droite (point 200), grand virage à gauche (point 350), petit virage (point 430),
  // épingle trop près de la première (point 230)
  const turn = bend(480, [[190, 210, 1 / 20], [228, 236, 1 / 20], [330, 370, -1 / 50], [425, 435, 1 / 200 + 0.002]]);
  const spots = standSpots(turn, 2.5, 20);
  assert.deepEqual(spots[0].side, 0, 'ligne droite : des deux côtés');
  assert.ok(spots[0].from > 400 || spots[0].from < 20, 'avant la ligne');
  assert.ok(spots[0].to > 20 && spots[0].to <= 20 + 44, 'après la ligne, 110 m au plus');
  const [hair, big] = spots.slice(1);
  assert.equal(spots.length, 3, 'virages trop proches ou trop petits laissés');
  assert.equal(hair.side, -1, 'épingle à droite : tribune à gauche');
  assert.ok(hair.from < 200 && hair.to > 200);
  assert.equal(big.side, 1);
  assert.ok(big.from < 350 && big.to > 340);
  // Tracé sans ligne droite autour de la ligne : seulement les virages
  assert.ok(standSpots(bend(480, [[0, 480, 1 / 100]]), 2.5, 20).every((s) => s.side !== 0));
});

test('dégagements : à l\'extérieur des virages et en sortie, graviers dans les virages lents', () => {
  // Virage rapide vers la droite (rayon 100 m, points 100 à 120), épingle vers la gauche (rayon 20 m, points 250 à 262)
  const plan = runoffPlan(bend(400, [[100, 120, 1 / 100], [250, 262, -1 / 20], [330, 332, 1 / 20]]), 2.5);
  assert.deepEqual(plan[110], [1, 0], 'virage rapide à droite : asphalte à gauche');
  assert.deepEqual(plan[92], [1, 0], '20 m avant');
  assert.deepEqual(plan[138], [1, 0], 'en sortie (50 m après)');
  assert.deepEqual(plan[145], [0, 0]);
  assert.deepEqual(plan[255], [0, 2], 'épingle à gauche : asphalte et graviers à droite');
  assert.deepEqual(plan[200], [0, 0], 'ligne droite : rien');
  assert.deepEqual(plan[331], [0, 0], 'bruit de 5 m : rien');
});

test('sol : sable dans le désert, herbe jaunie au sec, verte ailleurs', () => {
  assert.equal(groundClimate(63), 'desert', 'Bahreïn');
  assert.equal(groundClimate('150'), 'desert', 'Qatar');
  assert.equal(groundClimate(70), 'desert', 'Abou Dabi');
  assert.equal(groundClimate(149), 'desert', 'Djeddah');
  for (const k of [65, 9, 152]) assert.equal(groundClimate(k), 'sec', `circuit ${k}`);
  assert.equal(groundClimate(2), 'vert', 'Silverstone');
  assert.equal(groundClimate(undefined), 'vert', 'circuit inconnu');
  for (const pal of Object.values(GROUND)) {
    for (const k of ['field', 'mid', 'near', 'verge', 'grass']) assert.match(pal[k], /^#[0-9a-f]{6}$/);
    assert.ok(pal.patches.length >= 4);
  }
  assert.equal(GROUND.vert.field, '#4f7f36', 'vert : la couleur d\'avant');
});
