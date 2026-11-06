import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provisionalOrder } from '../shared/f1.js';

const moves = (out) => out.filter((r) => r.from !== r.to).map((r) => `${r.num} P${r.from} → P${r.to}`);

test('arrivée provisoire : une pénalité de 5 s fait perdre deux places', () => {
  const rows = [
    { num: '1', gap: 'LAP 57', int: '' },
    { num: '81', gap: '+1.200', int: '+1.200' },
    { num: '4', gap: '+3.000', int: '+1.800' },
    { num: '16', gap: '+4.500', int: '+1.500' },
    { num: '63', gap: '+6.900', int: '+2.400' },
    { num: '44', gap: '+9.000', int: '+2.100' },
  ];
  const out = provisionalOrder(rows, { 4: 5 });
  assert.deepEqual(out.map((r) => r.num), ['1', '81', '16', '63', '4', '44']);
  assert.deepEqual(moves(out), ['16 P4 → P3', '63 P5 → P4', '4 P3 → P5']);
  // Sans pénalité : rien ne bouge
  assert.deepEqual(moves(provisionalOrder(rows)), []);
});

test('arrivée provisoire : un pilote doublé reste derrière ceux du tour du leader', () => {
  const rows = [
    { num: '1', gap: 'LAP 57', int: '' },
    { num: '4', gap: '+80.000', int: '+80.000' },
    { num: '10', gap: '1L', int: '+5.000' },
    { num: '18', gap: '1L', int: '+2.000' },
    { num: '22', gap: '2L', int: '+1 LAP' },
    { num: '31', gap: '', int: '', out: true },
  ];
  // 4 à +80 s avec 30 s de pénalité : toujours devant les doublés
  assert.deepEqual(moves(provisionalOrder(rows, { 4: 30 })), []);
  // Entre doublés du même tour, la pénalité compte (temps = intervalles additionnés) ; celui à deux tours reste dernier
  const out = provisionalOrder(rows, { 10: 5, 22: 0 });
  assert.deepEqual(out.map((r) => r.num), ['1', '4', '18', '10', '22', '31']);
  // L'abandon reste à la fin
  assert.deepEqual(out.at(-1), { num: '31', from: 6, to: 6 });
});

test('arrivée provisoire : égalité de temps, l\'ordre du classement est gardé', () => {
  const rows = [
    { num: '1', gap: 'LAP 57', int: '' },
    { num: '81', gap: '+2.000', int: '+2.000' },
    { num: '4', gap: '+7.000', int: '+5.000' },
  ];
  // 81 pénalisé de 5 s : 7 s, à égalité avec 4, garde sa place
  assert.deepEqual(moves(provisionalOrder(rows, { 81: 5 })), []);
  // Le leader pénalisé passe derrière 81
  assert.deepEqual(provisionalOrder(rows, { 1: 5 }).map((r) => r.num), ['81', '1', '4']);
});
