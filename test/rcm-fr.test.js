import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rcmFr, reasonFr } from '../shared/rcm-fr.js';

test('direction de course en français : formules connues', () => {
  const cases = [
    ['FIA STEWARDS: TURN 1 INCIDENT INVOLVING CAR 55 (SAI) REVIEWED NO FURTHER INVESTIGATION - LEAVING THE TRACK AND GAINING AN ADVANTAGE (20:03:47)',
      'Commissaires FIA : virage 1, incident impliquant la voiture 55 (SAI) : examiné, pas d\'enquête — avantage pris hors de la piste (20:03:47)'],
    ['UPDATE: TURN 1 INCIDENT INVOLVING CAR 55 (SAI) NOTED - LEAVING THE TRACK AND GAINING AN ADVANTAGE (20:03:47)',
      'Mise à jour : virage 1, incident impliquant la voiture 55 (SAI) : noté — avantage pris hors de la piste (20:03:47)'],
    ['TURN 4 INCIDENT INVOLVING CARS 4 (NOR), 10 (GAS) AND 43 (COL) NOTED',
      'Virage 4, incident impliquant les voitures 4 (NOR), 10 (GAS) et 43 (COL) : noté'],
    ['FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 55 (SAI) - CAUSING A COLLISION (20:10:02)',
      'Commissaires FIA : pénalité de 5 s pour la voiture 55 (SAI) — accrochage provoqué (20:10:02)'],
    ['FIA STEWARDS: PENALTY SERVED - 5 SECOND TIME PENALTY FOR CAR 55 (SAI) - CAUSING A COLLISION',
      'Commissaires FIA : pénalité purgée : pénalité de 5 s pour la voiture 55 (SAI) — accrochage provoqué'],
    ['CAR 12 (ANT) TIME 1:43.512 DELETED - TRACK LIMITS AT TURN 7 LAP 3 14:22:10',
      'Voiture 12 (ANT) : temps 1:43.512 supprimé — limites de piste au virage 7, tour 3 (14:22:10)'],
    ['WAVED BLUE FLAG FOR CAR 77 (BOT) TIMED AT 20:31:05', 'Drapeau bleu agité pour la voiture 77 (BOT) à 20:31:05'],
    ['DOUBLE YELLOW IN TRACK SECTOR 12', 'Double drapeau jaune dans le secteur 12'],
    ['RISK OF RAIN FOR F1 RACE IS 20%', 'Risque de pluie pour la course : 20 %'],
    ['SQ1 WILL START AT 16:30', 'La SQ1 commencera à 16:30'],
    ['SAFETY CAR IN THIS LAP', 'La voiture de sécurité rentre à la fin de ce tour'],
  ];
  for (const [en, fr] of cases) assert.equal(rcmFr(en), fr);
  // Espaces en trop, tiret long
  assert.equal(rcmFr('  BLACK AND WHITE FLAG FOR CAR 1 (VER)  –  TRACK LIMITS '), 'Drapeau noir et blanc pour la voiture 1 (VER) — limites de piste');
});

test('direction de course : message hors formule laissé à l\'appelant', () => {
  assert.equal(rcmFr('CAR 44 (HAM) WILL USE THE SPARE CHASSIS'), null);
  assert.equal(rcmFr(''), null);
  assert.equal(reasonFr('IMPEDING - UNKNOWN THING'), 'gêne d\'un autre pilote — unknown thing');
});
