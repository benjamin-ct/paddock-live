import test from 'node:test';
import assert from 'node:assert/strict';
import { teammateDuels, preraceData, champData, flashEvents, flashData, moreCaptions } from '../shared/social-more.js';
import { postData } from '../shared/social.js';
import { slidesFor } from '../shared/social-draw.js';
import { builtinNomination } from '../shared/tyres.js';

const state = {
  SessionInfo: { Type: 'Race', Name: 'Race', StartDate: '2026-09-06T13:00:00', Meeting: { Name: 'Italian Grand Prix', Location: 'Monza', Country: { Code: 'ITA', Name: 'Italy' } } },
  SessionStatus: { Status: 'Finished' },
  LapCount: { CurrentLap: 53, TotalLaps: 53 },
  DriverList: {
    1: { Tla: 'NOR', FirstName: 'Lando', LastName: 'Norris', TeamName: 'McLaren', TeamColour: 'FF8000' }, 81: { Tla: 'PIA', FirstName: 'Oscar', LastName: 'Piastri', TeamName: 'McLaren', TeamColour: 'FF8000' },
    16: { Tla: 'LEC', FirstName: 'Charles', LastName: 'Leclerc', TeamName: 'Ferrari' }, 44: { Tla: 'HAM', FirstName: 'Lewis', LastName: 'Hamilton', TeamName: 'Ferrari' },
    14: { Tla: 'ALO', FirstName: 'Fernando', LastName: 'Alonso', TeamName: 'Aston Martin' },
  },
  TimingData: { Lines: {
    1: { Position: '1', NumberOfLaps: 53, GapToLeader: 'LAP 53' }, 16: { Position: '2', GapToLeader: '+2.5', NumberOfLaps: 53 }, 44: { Position: '3', GapToLeader: '+8.1', NumberOfLaps: 53 },
    81: { Position: '4', GapToLeader: '+9.0', NumberOfLaps: 53 }, 14: { Position: '5', NumberOfLaps: 20, Retired: true },
  } },
  TimingAppData: { Lines: { 1: { GridPos: '2' }, 16: { GridPos: '1' }, 44: { GridPos: '4' }, 81: { GridPos: '3' }, 14: { GridPos: '5' } } },
  WeatherData: { AirTemp: '24.6', TrackTemp: '38.1', Humidity: '40', WindSpeed: '1.5', Rainfall: '0' },
  RaceControlMessages: { Messages: [
    { Message: 'SAFETY CAR DEPLOYED', Lap: 12 },
    { Message: 'FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 44 (HAM) - CAUSING A COLLISION', Lap: 15 },
    { Message: 'FIA STEWARDS: TURN 1 INCIDENT INVOLVING CARS 16 (LEC) AND 44 (HAM) NOTED - CAUSING A COLLISION', Lap: 15 },
    { Message: 'RED FLAG', Flag: 'RED', Lap: 30 },
  ] },
  ChampionshipPrediction: {
    Drivers: { 1: { RacingNumber: '1', CurrentPosition: 2, PredictedPosition: 1, CurrentPoints: 300, PredictedPoints: 325 }, 81: { RacingNumber: '81', CurrentPosition: 1, PredictedPosition: 2, CurrentPoints: 310, PredictedPoints: 322 } },
    Teams: { McLaren: { TeamName: 'McLaren', CurrentPosition: 1, PredictedPosition: 1, CurrentPoints: 610, PredictedPoints: 647 } },
  },
};

test('autres posts : duels entre coéquipiers', () => {
  const duels = teammateDuels(postData(state));
  assert.deepEqual(duels.map((x) => [x.team, x.ahead.tla, x.behind.tla]), [['McLaren', 'NOR', 'PIA'], ['Ferrari', 'LEC', 'HAM']]);
});

test('autres posts : avant-course (grille de départ, météo, pneus)', () => {
  const tyres = builtinNomination(2026, { name: 'Italian Grand Prix', location: 'Monza' });
  assert.deepEqual([tyres.hard, tyres.medium, tyres.soft], [3, 4, 5]);
  const d = preraceData(state, { tyres });
  assert.equal(d.post, 'prerace');
  assert.deepEqual(d.rows.map((r) => [r.pos, r.tla]), [[1, 'LEC'], [2, 'NOR'], [3, 'PIA'], [4, 'HAM'], [5, 'ALO']]);
  assert.deepEqual(d.weather, { air: 24.6, track: 38.1, humidity: 40, wind: 1.5, rain: false });
  assert.deepEqual(slidesFor(d), ['couverture', 'grille', 'meteo']);
  const c = moreCaptions(d, '@sig');
  assert.match(c.instagram, /^🚦 GRILLE DE DÉPART \| Grand Prix d'Italie/);
  assert.equal(d.gridSource, 'live');   // positions de départ du flux de la course
  assert.match(c.instagram, /🥇 En pole : Charles Leclerc \(Ferrari\), devant Norris et Piastri\./);
  assert.match(c.instagram, /🛞 Pneus Pirelli : C3 \(durs\), C4 \(médiums\), C5 \(tendres\)\./);
  assert.ok(c.x.length <= 280);
  // Sans météo ni pneus : pas de diapositive météo
  assert.deepEqual(slidesFor(preraceData({ ...state, WeatherData: undefined })), ['couverture', 'grille']);
});

test('autres posts : championnat après la course', () => {
  const d = champData(state);
  assert.equal(d.post, 'champ');
  assert.deepEqual(slidesFor(d), ['couverture', 'champpilotes', 'champecuries']);
  const c = moreCaptions(d, '');
  assert.match(c.instagram, /🥇 Norris : 325 pts \(\+25\)\n🥈 Piastri : 322 pts \(à 3\)/);
  assert.match(c.instagram, /🔧 Constructeurs : McLaren en tête avec 647 pts/);
  assert.equal(champData({ ...state, ChampionshipPrediction: undefined }), null);
});

test('autres posts : flash (drapeau rouge, voiture de sécurité, pénalité, abandon)', () => {
  const evs = flashEvents(state);
  assert.deepEqual(evs.map((e) => e.kind), ['red', 'retire', 'penalty', 'sc']);   // plus récent d'abord, enquête « NOTED » ignorée
  assert.equal(evs[0].title, 'Course arrêtée au tour 30');
  assert.equal(evs[1].title, 'Abandon de Fernando Alonso');
  assert.equal(evs[2].title, 'Lewis Hamilton : 5 s de pénalité');
  assert.equal(evs[2].sub, 'collision');
  const d = flashData(state, evs[2]);
  assert.deepEqual(slidesFor(d), ['flash']);
  assert.deepEqual(d.rows.map((r) => r.tla), ['HAM']);
  const c = moreCaptions(d, '@sig');
  assert.match(c.x, /^⚠️ PÉNALITÉ \| Grand Prix d'Italie( 🇮🇹)?\n\nLewis Hamilton : 5 s de pénalité — collision/);
  assert.match(c.instagram, /#LewisHamilton/);
});
