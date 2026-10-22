import test from 'node:test';
import assert from 'node:assert/strict';
import { postData, captions, gapFr } from '../shared/social.js';
import { slidesFor } from '../shared/social-draw.js';

const state = {
  SessionInfo: { Type: 'Race', Name: 'Race', StartDate: '2026-09-06T13:00:00', Meeting: { Name: 'Italian Grand Prix', Country: { Code: 'ITA', Name: 'Italy' } } },
  SessionStatus: { Status: 'Finished' },
  LapCount: { CurrentLap: 53, TotalLaps: 53 },
  DriverList: { 1: { Tla: 'NOR', FirstName: 'Lando', LastName: 'Norris', TeamName: 'McLaren', TeamColour: 'FF8000' }, 16: { Tla: 'LEC', FirstName: 'Charles', LastName: 'Leclerc', TeamName: 'Ferrari' }, 44: { Tla: 'HAM', FirstName: 'Lewis', LastName: 'Hamilton', TeamName: 'Ferrari' }, 14: { Tla: 'ALO', LastName: 'Alonso' }, 18: { Tla: 'STR', LastName: 'Stroll' } },
  TimingData: { Lines: {
    1: { Position: '1', NumberOfLaps: 53, GapToLeader: 'LAP 53' }, 16: { Position: '2', GapToLeader: '+2.5', NumberOfLaps: 53 }, 44: { Position: '3', GapToLeader: '+8.123', NumberOfLaps: 53 },
    18: { Position: '4', NumberOfLaps: 52, GapToLeader: '1L', Stopped: true }, 14: { Position: '5', NumberOfLaps: 20, Retired: true },
  } },
  TimingAppData: { Lines: { 1: { GridPos: '2', Stints: [{ Compound: 'MEDIUM' }, { Compound: 'HARD' }] }, 16: { GridPos: '1' }, 44: { GridPos: '10' }, 18: { GridPos: '8' }, 14: { GridPos: '6' } } },
  TimingStats: { Lines: { 44: { PersonalBestLapTime: { Value: '1:21.000', Position: 1, Lap: 50 } } } },
  RaceControlMessages: { Messages: [{ Message: 'SAFETY CAR DEPLOYED', Lap: 12 }] },
  ChampionshipPrediction: { Drivers: { 1: { RacingNumber: '1', CurrentPosition: 2, PredictedPosition: 1, CurrentPoints: 300, PredictedPoints: 325 } }, Teams: { McLaren: { TeamName: 'McLaren', CurrentPosition: 1, PredictedPosition: 1, CurrentPoints: 600, PredictedPoints: 625 } } },
};

test('posts : écarts en français', () => {
  assert.equal(gapFr('+2.5'), '+2,5 s');
  assert.equal(gapFr('1L'), '+1 tour');
  assert.equal(gapFr('3 LAPS'), '+3 tours');
  assert.equal(gapFr('LAP 53'), '');
});

test('posts : données de la course (classement, points, faits marquants, championnat)', () => {
  const d = postData(state);
  assert.equal(d.kind, 'race');
  assert.equal(d.gp, "Grand Prix d'Italie");
  assert.equal(d.date, '6 septembre 2026');
  assert.deepEqual(d.rows.map((r) => [r.tla, r.gap, r.points]), [['NOR', '', 25], ['LEC', '+2,5 s', 18], ['HAM', '+8,123 s', 15], ['STR', '+1 tour', 12], ['ALO', 'Abandon', 0]]);
  assert.equal(d.rows[0].color, '#FF8000');
  assert.equal(d.rows[2].delta, 7);
  const f = Object.fromEntries(d.facts.map((x) => [x.label, x]));
  assert.equal(f['Meilleur tour'].value, 'Hamilton');
  assert.equal(f['Plus belle remontée'].sub, 'P10 → P3 (+7)');
  assert.equal(f['Stratégie du vainqueur'].sub, 'Médiums → Durs');
  assert.equal(f.Neutralisations.value, '1 safety car');
  assert.equal(f.Abandons.sub, 'Alonso');
  assert.deepEqual([d.champ.drivers[0].tla, d.champ.drivers[0].gained, d.champ.drivers[0].move], ['NOR', 25, 1]);
});

test('posts : légendes Instagram et X', () => {
  const c = captions(postData(state), '@BenjyPaddock');
  assert.match(c.instagram, /^🏆 Lando Norris remporte le Grand Prix d'Italie 🇮🇹 !/);
  assert.match(c.instagram, /🥈 Charles Leclerc \(Ferrari\) \+2,5 s/);
  assert.match(c.instagram, /\n\n@BenjyPaddock\n\n/);
  const tags = c.instagram.split('\n').at(-1).split(' ');
  // Instagram : 5 hashtags au plus, les plus précis, le compte du créateur en dernier ; X 2 ; Threads 1
  assert.deepEqual(tags, ['#F1', '#ItalianGP', '#LandoNorris', '#McLaren', '#BenjyPaddock']);
  assert.match(c.x, /\n\n#BenjyPaddock #ItalianGP$/);
  assert.match(c.threads, /\n\n#F1$/);
  // Facebook : même texte qu'Instagram, sans les hashtags
  assert.equal(c.facebook, c.instagram.slice(0, c.instagram.lastIndexOf('\n\n')));
  assert.match(c.facebook, /\n\n@BenjyPaddock$/);
  assert.ok(c.x.length <= 280);
  assert.ok(c.threads.length <= 500);
  assert.match(c.threads, /^🏆 Lando Norris remporte/);
  assert.match(c.x, /^🏆 NORRIS remporte le Grand Prix d'Italie 🇮🇹 !\n🥈 Leclerc · 🥉 Hamilton\n/);
});

test('posts : qualifications', () => {
  const q = {
    ...state,
    SessionInfo: { ...state.SessionInfo, Type: 'Qualifying', Name: 'Qualifying' },
    TimingData: { SessionPart: 3, Lines: {
      1: { Position: '1', BestLapTimes: [{ Value: '1:20.5' }, { Value: '1:20.1' }, { Value: '1:19.8' }], Stats: [{}, {}, { TimeDiffToFastest: '' }] },
      16: { Position: '2', BestLapTimes: [{}, {}, { Value: '1:19.9' }], Stats: [{}, {}, { TimeDiffToFastest: '+0.100' }] },
      14: { Position: '3', KnockedOut: true, BestLapTimes: [{ Value: '1:21.0' }], Stats: [] },
    } },
  };
  const d = postData(q);
  assert.equal(d.kind, 'quali');
  assert.deepEqual(d.rows.map((r) => r.gap), ['1:19.8', '+0,100', '1:21.0']);
  assert.equal(d.rows[2].koPart, 1);
  assert.match(captions(d).instagram, /^⚡ Pole position pour Lando Norris au Grand Prix d'Italie 🇮🇹 !/);
});

test('posts : couverture « Résultats » (anti-spoiler) en première image de chaque format', () => {
  const d = { kind: 'race', rows: [{}], facts: [], champ: {} };
  assert.deepEqual(slidesFor(d), ['couverture', 'vainqueur', 'podium', 'classement', 'faits', 'championnat']);
  assert.deepEqual(slidesFor({ ...d, kind: 'quali', champ: null }).slice(0, 2), ['couverture', 'pole']);
  assert.deepEqual(slidesFor({ ...d, kind: 'practice' }), ['couverture', 'meilleurtemps', 'podium', 'classement']);
  assert.deepEqual(slidesFor({ ...d, kind: 'practice', facts: [{}] }).at(-1), 'faits');
  assert.deepEqual(slidesFor({ ...d, rows: [] }), []);
});

test('posts : texte sans spoiler (début de légende et texte court sans le vainqueur)', () => {
  const d = { kind: 'race', sprint: false, label: 'Course', gp: "Grand Prix d'Azerbaïdjan", gpEn: 'Azerbaijan Grand Prix', year: 2026, countryName: 'Azerbaijan', circuit: 'Baku', facts: [], summary: { paragraphs: ['Résumé.'] },
    rows: [{ first: 'Max', last: 'Verstappen', team: 'Red Bull Racing', gap: '' }, { first: 'Lando', last: 'Norris', team: 'McLaren', gap: '+2,1 s' }, { first: 'Charles', last: 'Leclerc', team: 'Ferrari', gap: '+4,0 s' }] };
  const c = captions(d, '@moi', { spoiler: false });
  // Instagram : les premières lignes (visibles sans « plus ») ne citent pas le vainqueur, le détail suit
  assert.match(c.instagram, /^🏁 Résultats du Grand Prix d'Azerbaïdjan : qui l'a emporté \? 👀 Réponse en images\.\n👉 Fais défiler/);
  assert.ok(!c.instagram.split('\n.\n')[0].includes('Verstappen'));
  assert.match(c.instagram, /Max Verstappen remporte/);
  for (const k of ['x', 'threads', 'story']) assert.ok(!c[k].includes('Verstappen'), k);
  assert.ok(c.x.length <= 280 && c.threads.length <= 500);
  // Par défaut : comme avant
  assert.match(captions(d, '').x, /^🏆 VERSTAPPEN remporte/);
});

test('posts : essais libres (meilleur temps, top 3, faits marquants)', () => {
  const fp = {
    ...state,
    SessionInfo: { ...state.SessionInfo, Type: 'Practice', Name: 'Practice 2' },
    TimingAppData: { Lines: { 1: { Stints: [{ Compound: 'MEDIUM', New: 'true', LapTime: '1:21.400' }, { Compound: 'SOFT', New: 'true', LapTime: '1:20.100' }] } } },
    TimingData: { Lines: {
      1: { Position: '1', NumberOfLaps: 24, BestLapTime: { Value: '1:20.100' } },
      16: { Position: '2', NumberOfLaps: 31, BestLapTime: { Value: '1:20.350' }, TimeDiffToFastest: '+0.250' },
      44: { Position: '3', NumberOfLaps: 27, BestLapTime: { Value: '1:21.300' }, TimeDiffToFastest: '+1.200' },
    } },
  };
  const d = postData(fp);
  assert.equal(d.kind, 'practice');
  assert.equal(d.label, 'Essais libres 2');
  assert.deepEqual(d.rows.map((r) => r.gap), ['1:20.100', '+0,250', '+1,200']);
  const f = Object.fromEntries(d.facts.map((x) => [x.label, `${x.value} | ${x.sub}`]));
  assert.equal(f['Écart P1 / P2'], '+0,250 | Norris devant Leclerc');
  assert.equal(f['Pneus du meilleur temps'], 'Tendres | Norris · train neuf');
  assert.equal(f['Le plus de tours'], 'Leclerc | 31 tours');
  assert.equal(f['Tours bouclés'], '82 | par les 3 pilotes');
  assert.equal(f['Dans la seconde'], "2 pilotes | à moins d'1 s du meilleur temps");
  assert.deepEqual(slidesFor(d), ['couverture', 'meilleurtemps', 'podium', 'classement', 'faits']);
  const c = captions(d);
  assert.match(c.instagram, /^⏱️ Essais libres 2 du Grand Prix d'Italie 🇮🇹 : Lando Norris en tête !\n\n📊 Top 3 :\n🥇 Lando Norris \(McLaren\) 1:20\.100\n/);
  assert.match(captions(d, '', { spoiler: false }).x, /^⏱️ Essais libres 2 du Grand Prix d'Italie 🇮🇹 : qui signe le meilleur temps \?/);
});

test('brouillons : textes refaits d\'après les données, comme dans l\'éditeur qui a fait le post', async () => {
  const { captionsFor, cleanDraft } = await import('../shared/post-draft.js');
  const d = postData(state);
  assert.equal(captionsFor(d, '@moi').instagram, captions(d, '@moi').instagram);
  assert.equal(captionsFor(d, '@moi', { spoiler: false }).instagram, captions(d, '@moi', { spoiler: false }).instagram);
  assert.equal(cleanDraft({ id: 'pas-un-uuid', d }), null);
  const ok = cleanDraft({ id: '0b5c1e9a-1111-4a2b-9c3d-123456789abc', d, fmt: 'tiktok', skip: ['question', 3], edited: { x: 'Texte', 'bad key': 'non' } });
  assert.deepEqual([ok.fmt, ok.skip, ok.edited], ['ig', ['question'], { x: 'Texte' }]);
});
