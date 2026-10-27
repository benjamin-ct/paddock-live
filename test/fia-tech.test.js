import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTechUpdates, parsePuUsed, parsePuNew, parsePuPenalty, classify, teamOf, lines } from '../shared/fia-tech.js';

// Morceaux de texte positionnés comme dans les PDF de la FIA ({ x, y, s })
const it = (x, y, s) => ({ x, y, s });

test('éléments moteur : tableau « used per Driver up to now » (en-tête sur deux lignes)', () => {
  const page = [
    it(48, 416, 'N°'), it(74, 416, 'Car'), it(211, 416, 'Driver'), it(303, 416, 'ICE'), it(334, 416, 'TC'), it(361, 416, 'EXH'),
    it(394, 422, 'MGU'), it(400, 410, '-K'), it(431, 416, 'ES'), it(459, 422, 'PU-'), it(461, 410, 'CE'), it(490, 422, 'PU-'), it(492, 410, 'ANC'),
    it(48, 399, '81'), it(74, 399, 'McLaren Mercedes'), it(211, 399, 'Oscar Piastri'),
    ...[4, 3, 3, 2, 2, 2, 4].map((v, i) => it([309, 337, 368, 403, 434, 465, 498][i], 399, String(v))),
    it(48, 387, '03'), it(74, 387, 'Red Bull Racing RB Ford'), it(211, 387, 'Max Verstappen'),
    ...[3, 3, 3, 3, 3, 3, 4].map((v, i) => it([309, 337, 368, 403, 434, 465, 498][i], 387, String(v))),
  ];
  const r = parsePuUsed([page]);
  assert.deepEqual(r.elements, ['ICE', 'TC', 'EX', 'MGU-K', 'ES', 'CE', 'ANC']);
  assert.equal(r.drivers.length, 2);
  assert.deepEqual(r.drivers[0], { num: '81', team: 'McLaren Mercedes', driver: 'Oscar Piastri', used: { ICE: 4, TC: 3, EX: 3, 'MGU-K': 2, ES: 2, CE: 2, ANC: 4 } });
  assert.equal(r.drivers[1].num, '3');
});

test('éléments moteur : nouveaux éléments et pénalité', () => {
  const fresh = parsePuNew([[
    it(43, 530, 'The following driver will be using a new internal combustion engine (ICE) for the remainder of'),
    it(48, 492, 'Number'), it(110, 492, 'Car'), it(289, 492, 'Driver'), it(404, 492, 'Previously used ICE'),
    it(48, 472, '03'), it(110, 472, 'Red Bull Racing RB Ford'), it(289, 472, 'Max Verstappen'), it(452, 472, '3'),
    it(43, 444, 'The internal combustion engine used by Max Verstappen is one (1) of the four (4) new'),
  ]]);
  assert.deepEqual(fresh, [{ num: '3', driver: 'Max Verstappen', element: 'ICE', previous: 3 }]);
  const pen = parsePuPenalty([[
    it(46, 544, 'No / Driver'), it(119, 544, '14 - Fernando Alonso'),
    it(46, 454, 'Fact'), it(119, 454, 'The following Power Unit elements have been used:'), it(119, 437, '7th Energy Store (ES)'),
    it(46, 416, 'Infringement'), it(119, 416, 'Breaches of Articles B8.2.2'),
    it(46, 393, 'Decision'), it(119, 393, 'Drop of 5 grid positions for the next Race in which the driver participates.'),
    it(46, 371, 'Reason'), it(119, 371, 'The penalty is imposed in accordance with Article B8.2.8'),
  ]]);
  assert.equal(pen.num, '14');
  assert.equal(pen.driver, 'Fernando Alonso');
  assert.match(pen.fact, /7th Energy Store \(ES\)/);
  assert.match(pen.decision, /^Drop of 5 grid positions/);
});

test('évolutions techniques : tableau par écurie, cellules fusionnées et pied de page', () => {
  const head = [it(117, 437, 'Updated'), it(188, 437, 'Primary reason'), it(305, 437, 'Geometric differences compared to'), it(536, 437, 'Brief description on how the update works'),
    it(109, 423, 'component'), it(200, 423, 'for update'), it(358, 423, 'previous version'), it(583, 423, '(min 20, max 100 words)')];
  const pages = [
    [it(286, 490, 'Car Presentation – Azerbaijan Grand Prix'), it(322, 468, 'McLaren Mastercard F1 Team'), ...head,
      it(84, 394, '1'), it(110, 394, 'Sidepod Inlet'), it(196, 401, 'Performance -'), it(188, 387, 'Flow Conditioning'), it(282, 394, 'Revised Sidepod Inlet Shape'), it(531, 401, 'The sidepod inlet has been revised.'),
      it(84, 350, '2'), it(110, 350, 'Floor Edge'), it(282, 350, 'Revised Floor Edge'), it(531, 350, 'New edge.'),
      it(84, 300, '3'), it(110, 300, 'Rear Impact Structure'), it(193, 300, 'Reliability'), it(282, 300, 'Stiffer'), it(531, 300, 'More robust.'),
      it(84, 60, '4'), it(300, 60, '© 2026. All Rights Reserved. Highly Confidential.')],
    [it(268, 490, 'Car Presentation – 2026 Azerbaijan Grand Prix'), it(301, 468, 'MoneyGram Haas F1 Team'), it(72, 427, 'No update for this event')],
  ];
  const { updates, noUpdates } = parseTechUpdates(pages);
  assert.equal(updates.length, 3, 'le pied de page n\'est pas une évolution');
  assert.deepEqual(updates.map((u) => [u.n, u.component, u.type, u.reason]), [
    [1, 'Sidepod Inlet', 'Performance', 'Flow Conditioning'],
    [2, 'Floor Edge', 'Performance', 'Flow Conditioning'],   // cellule fusionnée : raison de la ligne voisine
    [3, 'Rear Impact Structure', 'Reliability', 'Reliability'],
  ]);
  assert.equal(updates[0].description, 'The sidepod inlet has been revised.');
  assert.deepEqual(noUpdates, ['MoneyGram Haas F1 Team']);
});

// Documents de 2024 : seule la première page a le titre « Car Presentation » ; les suivantes n'ont que le nom de
// l'écurie au-dessus du tableau (toutes les évolutions du Grand Prix étaient comptées pour la première écurie)
test('évolutions techniques : documents de 2024, une écurie par page sans titre', () => {
  const head = (y) => [it(118, y, 'Updated'), it(188, y, 'Primary reason'), it(284, y, 'Geometric differences compared to previous'), it(536, y - 7, 'Brief description on how the update works'), it(110, y - 13, 'component')];
  const pages = [
    [it(294, 468, 'Car Presentation'), it(409, 468, '–'), it(420, 468, 'Monaco Grand Prix'), it(333, 447, 'ORACLE RED BULL RACING'), ...head(393),
      it(84, 350, '1'), it(110, 350, 'Rear Wing'), it(188, 350, 'Circuit specific - Balance Range'), it(531, 350, 'Higher downforce.')],
    [],
    [it(254, 470, 'MERCEDES-AMG PETRONAS FORMULA ONE TEAM'), ...head(417),
      it(84, 370, '1'), it(110, 370, 'Front Wing'), it(188, 370, 'Performance - Local Load'), it(531, 370, 'More load.'),
      it(84, 320, '2'), it(110, 320, 'Beam Wing'), it(188, 320, 'Circuit specific - Drag Range'), it(531, 320, 'Less drag.')],
    [it(323, 475, 'MONEYGRAM HAAS F1 TEAM'), ...head(434), it(84, 390, '1'), it(110, 390, 'Floor'), it(188, 390, 'Performance - Flow Conditioning'), it(531, 390, 'New floor.')],
  ];
  const { updates } = parseTechUpdates(pages);
  assert.deepEqual(updates.map((u) => [teamOf(u.team).team, u.component]), [
    ['Red Bull Racing', 'Rear Wing'], ['Mercedes', 'Front Wing'], ['Mercedes', 'Beam Wing'], ['Haas F1 Team', 'Floor'],
  ]);
});

test('classement des raisons et noms d\'écurie', () => {
  assert.deepEqual(classify('Circuit Specific Drag Range'), { type: 'Circuit specific', reason: 'Drag Range' });
  assert.deepEqual(classify('Performance - Local load'), { type: 'Performance', reason: 'Local Load' });
  assert.equal(teamOf('Haas Ferrari').team, 'Haas F1 Team');
  assert.equal(teamOf('Red Bull Racing RB Ford').team, 'Red Bull Racing');
  assert.equal(teamOf('Racing Bulls RB Ford').team, 'Racing Bulls');
  assert.equal(teamOf('C adillac').team, 'Cadillac');
  assert.equal(teamOf('Atlassian Williams Mercedes').teamId, 'williams');
  assert.equal(lines([it(10, 100, 'b'), it(5, 101, 'a'), it(5, 80, 'c')])[0].text, 'a b');
});
