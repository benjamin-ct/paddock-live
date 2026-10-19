import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseStartingGrid, gridDocument, penaltyFr } from '../shared/fia-grid.js';
import { preraceData, moreCaptions } from '../shared/social-more.js';

// Texte positionné des PDF de la FIA (Bakou 2026 : grille définitive ; Miami 2026 : grille du sprint)
const pages = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/fia-grid-${n}.json`, import.meta.url)));

test('grille FIA : document choisi (définitif de préférence, sprint ou course)', () => {
  const docs = [
    { title: 'Doc 52 - Provisional Starting Grid', published: 1 }, { title: 'Doc 58 - Final Starting Grid', published: 2 },
    { title: 'Doc 35 - Provisional Sprint Starting Grid', published: 0 }, { title: 'Doc 51 - Final Qualifying Classification', published: 3 },
  ];
  assert.equal(gridDocument(docs).title, 'Doc 58 - Final Starting Grid');
  assert.equal(gridDocument(docs, { sprint: true }).title, 'Doc 35 - Provisional Sprint Starting Grid');
  assert.equal(gridDocument(docs.slice(0, 1)).title, 'Doc 52 - Provisional Starting Grid');
  assert.equal(gridDocument([]), null);
});

test('grille FIA : positions après pénalités, écuries, pénalités traduites', () => {
  const g = parseStartingGrid(pages('baku-final'));
  assert.equal(g.final, true);
  assert.equal(g.sprint, false);
  assert.equal(g.rows.length, 22);
  assert.deepEqual(g.rows.slice(0, 3).map((r) => [r.pos, r.num, r.first, r.last]), [[1, '63', 'George', 'Russell'], [2, '16', 'Charles', 'Leclerc'], [3, '81', 'Oscar', 'Piastri']]);
  assert.equal(g.rows[0].team, 'Mercedes-AMG PETRONAS F1 Team');
  assert.deepEqual(g.rows.slice(-2).map((r) => [r.pos, r.last, r.star]), [[21, 'Alonso', true], [22, 'Stroll', true]]);
  assert.deepEqual(g.rows.find((r) => r.num === '55').pos, 14);
  assert.deepEqual(g.penalties.map((p) => [p.cars, p.fr]), [
    [['14'], 'recul de 30 places (éléments moteur supplémentaires)'], [['18'], 'recul de 20 places (éléments moteur supplémentaires)'],
    [['11'], 'recul de 3 places (a gêné un autre pilote)'], [['55'], 'recul de 5 places (pas assez ralenti sous drapeau jaune)'],
  ]);
});

test('grille FIA : sprint avec départ des stands', () => {
  const g = parseStartingGrid(pages('miami-sprint'));
  assert.equal(g.sprint, true);
  assert.equal(g.rows.length, 22);
  assert.deepEqual(g.rows.at(-1), { num: '41', first: 'Arvid', last: 'Lindblad', lastUp: 'LINDBLAD', team: 'Visa Cash App Racing Bulls F1 Team', pos: 22, pitlane: true, star: true });
  assert.equal(g.penalties[0].fr, 'départ des stands (voiture modifiée sous régime de parc fermé)');
  assert.equal(penaltyFr('Back of the grid - Gearbox change'), 'départ en fond de grille (boîte de vitesses changée)');
});

test('avant-course : grille officielle prioritaire sur les qualifications', () => {
  const g = parseStartingGrid(pages('baku-final'));
  const state = {
    SessionInfo: { Type: 'Qualifying', Name: 'Qualifying', StartDate: '2026-09-25T16:00:00', Meeting: { Name: 'Azerbaijan Grand Prix', Country: { Code: 'AZE' } } },
    DriverList: { 14: { Tla: 'ALO', FirstName: 'Fernando', LastName: 'Alonso', TeamName: 'Aston Martin', TeamColour: '229971' }, 63: { Tla: 'RUS', FirstName: 'George', LastName: 'Russell', TeamName: 'Mercedes' } },
    TimingData: { Lines: { 14: { Position: '1' }, 63: { Position: '2' } } },
  };
  assert.equal(preraceData(state).gridSource, 'quali');
  const d = preraceData(state, { grid: g });
  assert.equal(d.gridSource, 'fia');
  assert.equal(d.rows.length, 22);
  const alo = d.rows.find((r) => r.num === '14');
  assert.deepEqual([alo.pos, alo.tla, alo.color, alo.penalty], [21, 'ALO', '#229971', 'recul de 30 places (éléments moteur supplémentaires)']);
  assert.equal(d.rows[3].tla, 'HAD');   // pilote absent de la séance : nom tiré du document
  const c = moreCaptions(d, '');
  assert.match(c.instagram, /^🚦 GRILLE DE DÉPART \| Grand Prix d'Azerbaïdjan( 🇦🇿)?\n\n🥇 En pole : George Russell/);
  assert.match(c.instagram, /– Alonso \(21e\) : recul de 30 places/);
  assert.match(c.x, /Pénalités : Sainz, Perez, Alonso, Stroll\./);
  assert.ok(c.x.length <= 280);
});
