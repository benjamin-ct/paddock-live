// Compte à rebours de l'icône de l'appli de bureau (barre des menus, zone de notification)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { countdown } = createRequire(import.meta.url)('../desktop/countdown.cjs');
const H = 3600e3, M = 60e3;
const t0 = Date.parse('2026-11-01T12:00:00Z');
const week = [{ label: 'EL1', t: t0 }, { label: 'Qualifications', t: t0 + 26 * H }, { label: 'Course', t: t0 + 50 * H }];

test('compte à rebours : jours, heures, minutes avant la prochaine séance', () => {
  assert.equal(countdown(week, t0 - 2 * H - 14 * M).text, 'EL1 2 h 14');
  assert.equal(countdown(week, t0 - 12 * M).text, 'EL1 12 min');
  assert.equal(countdown(week, t0 - 12 * M - 20e3).text, 'EL1 13 min');   // minute entamée comptée
  assert.equal(countdown(week, t0 - 60 * M).text, 'EL1 1 h 00');
  assert.equal(countdown(week, t0 - 3 * 24 * H - 5 * H).text, 'EL1 3 j 05 h');
  assert.equal(countdown(week, t0 - 3 * 24 * H - 5 * H, { day: 'd' }).text, 'EL1 3 d 05 h');
});

test('compte à rebours : LIVE pendant la séance, la course dure plus longtemps', () => {
  assert.equal(countdown(week, t0 + 30 * M).text, 'EL1 LIVE');
  assert.equal(countdown(week, t0 + 30 * M).next.label, 'Qualifications');
  assert.equal(countdown(week, t0 + 80 * M).text, 'Qualifications 1 j 00 h');
  assert.equal(countdown(week, t0 + 3 * H + 20 * M).text, 'Qualifications 22 h 40');
  assert.equal(countdown(week, t0 + 50 * H + 2 * H).text, 'Course LIVE');
});

test('compte à rebours : libellés traduits, rien après la dernière séance', () => {
  assert.equal(countdown(week, t0 + 49 * H, { tr: (s) => ({ Course: 'Race' })[s] ?? s }).text, 'Race 1 h 00');
  assert.deepEqual(countdown(week, t0 + 60 * H), { next: null, text: '' });
  assert.deepEqual(countdown([], t0), { next: null, text: '' });
});
