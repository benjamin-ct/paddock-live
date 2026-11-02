import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge } from '../shared/merge.js';
import { parseGap, parseLapTime, parseUtc, chequeredUtc, overtakeEnabled, catchLaps } from '../shared/f1.js';
import { applyEvent, createDerived, createSyncContext, extractSyncEvents } from '../shared/derive.js';

test('merge : mises à jour indexées dans un tableau', () => {
  const state = { Messages: [{ Message: 'A' }] };
  merge(state, { Messages: { 1: { Message: 'B' } } });
  assert.deepEqual(state.Messages.map((m) => m.Message), ['A', 'B']);
});

test('merge : fusion profonde et _deleted', () => {
  const state = merge(undefined, { Lines: { 1: { Position: '1', Sectors: [{ Value: '' }, { Value: '' }] } } });
  merge(state, { Lines: { 1: { Sectors: { 1: { Value: '30.123' } } } } });
  assert.equal(state.Lines[1].Sectors[1].Value, '30.123');
  assert.equal(state.Lines[1].Position, '1');
  merge(state, { Lines: { _deleted: ['1'] } });
  assert.equal(state.Lines[1], undefined);
});

test('merge : ne modifie pas la source lors d\'une copie', () => {
  const src = { a: { b: [1, 2] } };
  const copy = merge(undefined, src);
  copy.a.b[0] = 9;
  assert.equal(src.a.b[0], 1);
});

test('merge : une clé « __proto__ » du flux ne touche pas au modèle des objets', () => {
  const state = merge({}, JSON.parse('{"__proto__": {"pollue": 1}, "Lines": {"__proto__": {"x": 2}}}'));
  assert.equal({}.pollue, undefined);
  assert.equal(state.pollue, undefined);
  assert.equal(state.Lines.x, undefined);
});

test('parseGap / parseLapTime / parseUtc', () => {
  assert.deepEqual(parseGap('+1.234'), { s: 1.234 });
  assert.deepEqual(parseGap('1L'), { laps: 1 });
  assert.deepEqual(parseGap('+2 LAPS'), { laps: 2 });
  assert.equal(parseGap('LAP 23').leader, true);
  assert.equal(parseGap(''), null);
  assert.equal(parseLapTime('1:45.123'), 105.123);
  assert.equal(parseLapTime('28.5'), 28.5);
  assert.equal(parseLapTime(''), null);
  assert.equal(parseUtc('2026-09-25T12:00:00'), Date.parse('2026-09-25T12:00:00Z'));
});

test('derive : historique tour par tour avec infos arrivant après le changement de tour', () => {
  const state = {};
  const d = createDerived();
  applyEvent(state, d, 'TimingData', { Lines: { 16: { Position: '1', GapToLeader: 'LAP 1', Sectors: [{ Value: '' }, { Value: '' }, { Value: '' }] } } }, 1000);
  applyEvent(state, d, 'TimingData', { Lines: { 16: { Sectors: { 0: { Value: '28.1' } } } } }, 20000);
  applyEvent(state, d, 'TimingData', { Lines: { 16: { Sectors: { 1: { Value: '29.2' } } } } }, 50000);
  applyEvent(state, d, 'TimingData', { Lines: { 16: { NumberOfLaps: 1, GapToLeader: 'LAP 2' } } }, 80000);
  applyEvent(state, d, 'TimingData', { Lines: { 16: { LastLapTime: { Value: '1:25.500' }, Sectors: { 2: { Value: '28.2' } } } } }, 81000);
  assert.equal(d.laps[16].length, 1);
  const lap = d.laps[16][0];
  assert.equal(lap.lap, 1);
  assert.equal(lap.time, '1:25.500');
  assert.deepEqual(lap.s, ['28.1', '29.2', '28.2']);
});

test('derive : décalage d\'horloge = minimum des derniers Heartbeat', () => {
  const state = {};
  const d = createDerived();
  const utc = Date.parse('2026-09-25T12:00:00Z');
  applyEvent(state, d, 'Heartbeat', { Utc: '2026-09-25T12:00:00Z' }, utc + 2500);
  applyEvent(state, d, 'Heartbeat', { Utc: '2026-09-25T12:00:15Z' }, utc + 15000 + 400);
  assert.equal(d.clockOffset, 400);
});

test('derive : un snapshot n\'est pas modifié par les fusions suivantes', () => {
  const snap = { TimingData: { Lines: { 1: { Position: '1' } } } };
  const state = {};
  const d = createDerived();
  applyEvent(state, d, '__snapshot', snap, 0);
  applyEvent(state, d, 'TimingData', { Lines: { 1: { Position: '2' } } }, 1);
  assert.equal(snap.TimingData.Lines[1].Position, '1');
  assert.equal(state.TimingData.Lines[1].Position, '2');
});

test('repères de synchro TV : tours, drapeaux, stands', () => {
  const ctx = createSyncContext();
  extractSyncEvents(ctx, '__snapshot', { LapCount: { CurrentLap: 3 }, TrackStatus: { Status: '1' } }, 0);
  assert.equal(extractSyncEvents(ctx, 'LapCount', { CurrentLap: 3 }, 1).length, 0);
  assert.equal(extractSyncEvents(ctx, 'LapCount', { CurrentLap: 4 }, 2)[0].text, 'Tour 4');
  assert.equal(extractSyncEvents(ctx, 'TrackStatus', { Status: '4', Message: 'SCDeployed' }, 3)[0].kind, 'track');
  assert.equal(extractSyncEvents(ctx, 'TimingData', { Lines: { 44: { InPit: true } } }, 4)[0].num, '44');
  assert.equal(extractSyncEvents(ctx, 'TimingData', { Lines: { 44: { InPit: true } } }, 5).length, 0);
});

test('drapeau à damier : dernier de la séance, oublié au feu vert de la partie suivante des qualifs', () => {
  const m = (Flag, Utc, Scope = 'Track') => ({ Category: 'Flag', Flag, Scope, Utc });
  assert.equal(chequeredUtc(undefined), null);
  assert.equal(chequeredUtc([m('GREEN', '2026-10-24T21:00:00'), m('YELLOW', '2026-10-24T21:05:00', 'Sector')]), null);
  const q1 = [m('GREEN', '2026-10-24T21:00:00'), m('CHEQUERED', '2026-10-24T21:18:00')];
  assert.equal(chequeredUtc(q1), Date.parse('2026-10-24T21:18:00Z'));
  assert.equal(chequeredUtc({ 0: q1[0], 1: q1[1] }), Date.parse('2026-10-24T21:18:00Z'));   // messages indexés
  assert.equal(chequeredUtc([...q1, m('GREEN', '2026-10-24T21:25:00')]), null);   // Q2 commencée
  assert.equal(chequeredUtc([...q1, m('GREEN', '2026-10-24T21:25:00'), m('CHEQUERED', '2026-10-24T21:40:00')]), Date.parse('2026-10-24T21:40:00Z'));
});

test('mode dépassement : activé ou coupé par le dernier message de la direction de course', () => {
  const m = (Message) => ({ Utc: '2026-10-25T20:00:00', Category: 'Other', Message });
  assert.equal(overtakeEnabled(undefined), true, 'pas de message : activé');
  assert.equal(overtakeEnabled([m('OVERTAKE DISABLED')]), false, 'coupé avant le départ');
  assert.equal(overtakeEnabled([m('OVERTAKE DISABLED'), m('GREEN LIGHT - PIT EXIT OPEN'), m('OVERTAKE ENABLED')]), true, 'rétabli en fin de premier tour');
  assert.equal(overtakeEnabled({ 0: m('OVERTAKE ENABLED'), 1: m('OVERTAKE DISABLED') }), false, 'messages en objet (état fusionné)');
});

test('catchLaps : prévision du duel (tours pour revenir, à portée du DÉP, trop loin)', () => {
  assert.equal(catchLaps(2.5, 0.5, 20), 5);
  assert.equal(catchLaps(2.6, 0.5, 20), 6);          // au tour supérieur
  assert.equal(catchLaps(1.2, 0.3, null), 4);        // 4,000…01 en virgule flottante : 4 tours
  assert.equal(catchLaps(0.8, 0.2, 20), 'dep');      // déjà à moins d'une seconde
  assert.equal(catchLaps(5, 0.5, 8), null);          // 10 tours : plus que les tours restants
  assert.equal(catchLaps(16, 0.5, null), null);      // 32 tours : au-delà de 30
  assert.equal(catchLaps(15, 0.5, null), 30);
  assert.equal(catchLaps(3, 0, 20), null);           // ne reprend rien
});

test('carte : voiture arrêtée encore en course seulement sous drapeau rouge, dans les stands, à moins d\'un tour du leader', async () => {
  const { stoppedInRace } = await import('../shared/f1.js');
  const lines = { 1: { NumberOfLaps: 46 }, 18: { Stopped: true, InPit: true, NumberOfLaps: 5 }, 77: { Stopped: true, NumberOfLaps: 45 }, 44: { Stopped: true, InPit: true, NumberOfLaps: 46 } };
  assert.equal(stoppedInRace(lines[44], true, lines), true, 'drapeau rouge, dans la voie des stands');
  assert.equal(stoppedInRace(lines[44], false, lines), false, 'sans drapeau rouge : arrêtée = hors course');
  assert.equal(stoppedInRace(lines[77], true, lines), false, 'arrêtée en piste (Bottas)');
  assert.equal(stoppedInRace(lines[18], true, lines), false, 'abandon au tour 5 (Stroll)');
});
