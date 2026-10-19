import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { weekendData, recordsData, ratingsData, raceRatings, teamDuelsData, titleData, raceLapsData, recapData, seasonCaptions, teamColor } from '../shared/social-season.js';
import { parseRaceLaps, cleanPace, lapsLedBy } from '../shared/race-laps.js';
import { questionCaptions, questionFor } from '../shared/social-follow.js';
import { slidesFor } from '../shared/social-draw.js';
import { newsPost } from '../shared/social-news.js';
import { xLength } from '../shared/social.js';
import { createScheduler } from '../server/post-schedule.js';
import { forecast } from '../server/forecast.js';

const drv = (code, name, team, teamId) => ({ code, name, last: name.split(' ').at(-1), team, teamId });
const D = { VER: drv('VER', 'Max Verstappen', 'Red Bull', 'red_bull'), TSU: drv('TSU', 'Yuki Tsunoda', 'Red Bull', 'red_bull'), LEC: drv('LEC', 'Charles Leclerc', 'Ferrari', 'ferrari'), HAM: drv('HAM', 'Lewis Hamilton', 'Ferrari', 'ferrari') };
const res = (code, pos, grid, pts, posText = String(pos)) => ({ ...D[code], pos, grid, points: pts, posText, status: posText === 'R' ? 'Accident' : 'Finished' });
const quali = (code, pos, q3) => ({ ...D[code], pos, q: [q3 + 1, q3 + 0.5, q3] });
const race = (round, results, q) => ({ round, name: 'United States Grand Prix', locality: 'Austin', country: 'USA', lat: 30.13, lon: -97.64, date: `2026-10-${round}T19:00:00Z`, sprint: false,
  sessions: [{ label: 'EL1', t: '2026-10-23T17:30:00Z' }, { label: 'Qualifications', t: '2026-10-24T21:00:00Z' }, { label: 'Course', t: '2026-10-25T19:00:00Z' }],
  results, quali: q, sprintResults: [] });
const R1 = race(10, [res('VER', 1, 2, 25), res('LEC', 2, 1, 18), res('HAM', 3, 4, 15), res('TSU', 4, 3, 12, 'R')], [quali('LEC', 1, 90), quali('VER', 2, 90.1), quali('TSU', 3, 90.4), quali('HAM', 4, 90.5)]);
const R2 = race(11, [res('LEC', 1, 1, 25), res('HAM', 2, 3, 18), res('VER', 3, 2, 15), res('TSU', 4, 4, 12)], [quali('LEC', 1, 90), quali('VER', 2, 90.2), quali('HAM', 3, 90.3), quali('TSU', 4, 90.6)]);

test('programme du week-end : horaires en heure de Paris, météo des jours de séance', () => {
  const d = weekendData(R1, { year: 2026, tyres: { hard: 2, medium: 3, soft: 4 }, forecast: [{ date: '2026-10-23', tmax: 25, tmin: 14, rain: 10 }, { date: '2026-10-25', tmax: 27.4, tmin: 15, rain: 30 }, { date: '2026-11-02', tmax: 1, tmin: 0, rain: 0 }] });
  assert.deepEqual(d.sessions.map((s) => [s.label, s.day, s.time]), [['Essais libres 1', 'Vendredi', '19:30'], ['Qualifications', 'Samedi', '23:00'], ['Course', 'Dimanche', '20:00']]);
  assert.equal(d.iso, 'us');
  assert.equal(d.date, '23 au 25 octobre 2026');
  assert.deepEqual(d.forecast.map((f) => f.day), ['Vendredi', 'Dimanche']);
  assert.deepEqual(slidesFor(d), ['couverture', 'horaires', 'infos']);
  const c = seasonCaptions(d, '@moi');
  assert.match(c.instagram, /^🗓️ PROGRAMME DU WEEK-END \| Grand Prix des États-Unis 🇺🇸/);
  assert.match(c.instagram, /🏁 Dim\. 20:00 · Course/);
  assert.match(c.instagram, /(☀️|🌧️) Météo prévue dimanche : 27 °C, 30 % de risque de pluie/);
  assert.ok(xLength(c.x) <= 280 && c.threads.length <= 500);
});

test('le saviez-vous : records du circuit et spécialiste de la pole', () => {
  const p = (tla, time, team = 'Ferrari') => ({ tla, time, team, color: 'E80020' });
  const rec = { editions: [{ year: 2025, pole: p('LEC', 92.8), fastest: p('HAM', 97.1) }, { year: 2024, pole: p('LEC', 92.3), fastest: null }, { year: 2023, pole: p('HAM', 94.0), fastest: p('LEC', 96.5) }],
    bestPole: { ...p('LEC', 92.3), year: 2024 }, bestRaceLap: { ...p('LEC', 96.5), year: 2023 } };
  const d = recordsData(R1, rec, { year: 2026, names: { LEC: 'Charles Leclerc', HAM: 'Lewis Hamilton' } });
  assert.deepEqual(d.facts.map((f) => f.label), ['Record de la pole', 'Record du tour en course', 'Spécialiste de la pole']);
  assert.equal(d.facts[0].value, '1:32.300');
  assert.match(d.facts[2].sub, /2 poles sur les 3 dernières éditions/);
  assert.deepEqual(slidesFor(d), ['couverture', 'records', 'editions']);
  assert.deepEqual(slidesFor(recordsData(R1, { editions: [] }, { year: 2026 })), []);
});

test('notes des pilotes : résultat, places gagnées, duel avec le coéquipier, rythme', () => {
  const rows = raceRatings(R1);
  assert.equal(rows[0].code, 'VER');
  assert.equal(rows.at(-1).code, 'TSU');   // abandon, battu par son coéquipier
  assert.ok(rows.every((r) => r.note >= 3 && r.note <= 10));
  // Avec le rythme : un pilote bien plus rapide en course gagne des points
  const times = (base) => Array.from({ length: 20 }, (_, i) => (i === 0 ? base + 8 : base + (i % 3) * 0.1));
  const laps = { total: 20, drivers: [{ code: 'VER', times: times(95) }, { code: 'LEC', times: times(95.8) }, { code: 'HAM', times: times(94.5) }, { code: 'TSU', times: times(96) }] };
  const withPace = raceRatings(R1, { laps });
  assert.ok(withPace.find((r) => r.code === 'HAM').note > rows.find((r) => r.code === 'HAM').note);
  const d = ratingsData(R1, { year: 2026, laps });
  assert.ok(d.withPace);
  assert.deepEqual(slidesFor(d), ['couverture', 'topflop', 'notes']);
  assert.match(seasonCaptions(d, '').instagram, /🥇 Max Verstappen : \d,\d\/10/);
});

test('duels entre coéquipiers sur la saison', () => {
  const season = { races: [R1, R2, { ...race(12, [], []), results: [] }], constructors: [{ id: 'ferrari' }, { id: 'red_bull' }] };
  const d = teamDuelsData(season, { year: 2026 });
  assert.equal(d.after, 2);
  assert.deepEqual(d.rows.map((r) => r.teamId), ['ferrari', 'red_bull']);
  const fer = d.rows[0];
  assert.equal(fer.a.code, 'LEC');
  assert.deepEqual([fer.a.q, fer.b.q, fer.a.r, fer.b.r], [2, 0, 2, 0]);
  assert.equal(fer.gap, -0.4);
  assert.deepEqual(slidesFor(d), ['couverture', 'equipes-1']);
  assert.match(seasonCaptions(d, '').instagram, /🆚 Ferrari : Leclerc 2-0 Hamilton en qualifs, 2-0 en course/);
  assert.equal(teamColor('red_bull'), '#3671C6');
  assert.equal(teamColor('Racing Bulls'), '#6692FF');
});

test('course au titre : points encore en jeu, éliminés, titre possible au prochain GP', () => {
  const season = {
    races: [R1, R2, { ...race(12, [], []), results: [] }],
    // Classement officiel (pénalité de points comprise pour Tsunoda)
    drivers: [{ pos: 1, ...D.LEC, points: 43 }, { pos: 2, ...D.VER, points: 40 }, { pos: 3, ...D.HAM, points: 33 }, { pos: 4, ...D.TSU, points: 10 }],
    constructors: [{ pos: 1, id: 'ferrari', name: 'Ferrari', points: 76 }, { pos: 2, id: 'red_bull', name: 'Red Bull', points: 50 }],
  };
  const d = titleData(season, { year: 2026 });
  assert.equal(d.after, 2);
  assert.deepEqual(d.left, { races: 1, sprints: 0, d: 25, c: 43 });
  assert.deepEqual(d.drivers.map((e) => [e.label, e.alive]), [['Leclerc', true], ['Verstappen', true], ['Hamilton', true], ['Tsunoda', false]]);
  assert.equal(d.drivers[3].outRound, 11);
  assert.equal(d.clinchD.next, 'le Grand Prix des États-Unis');
  assert.deepEqual(slidesFor(d), ['couverture', 'titrepilotes', 'titreecuries', 'titrecomment']);
  // Comme dans l'appli : avance à prendre sur chaque rival au prochain GP, place qu'il doit faire au pire
  assert.equal(d.clinchD.possibleNext, true);
  assert.deepEqual(d.clinchD.needs.map((n) => [n.label, n.margin]), [['Verstappen', -2], ['Hamilton', -9]]);
  assert.equal(d.clinchD.needs[0].win, 'suffit');
  const ig = seasonCaptions(d, '').instagram;
  assert.match(ig, /^🏆 La course au titre après le Grand Prix des États-Unis 🇺🇸/);
  assert.match(ig, /🥈 Verstappen : 40 pts \(à 3 pts\)/);
  assert.match(ig, /🔥 Charles Leclerc peut être sacré dès le Grand Prix des États-Unis\./);
  assert.match(ig, /🗓️ Encore 1 Grand Prix\./);
  // Manche plus ancienne : classement recalculé d'après les résultats jusqu'à elle
  const old = titleData(season, { year: 2026, upTo: 10 });
  assert.deepEqual(old.drivers.slice(0, 2).map((e) => [e.label, e.points]), [['Verstappen', 25], ['Leclerc', 18]]);
  assert.equal(old.left.races, 2);
  // Plus qu'un pilote en course : champion
  const won = titleData({ ...season, drivers: [season.drivers[0], { ...season.drivers[1], points: 10 }, { ...season.drivers[2], points: 5 }, season.drivers[3]] }, { year: 2026 });
  assert.equal(won.champion.name, 'Charles Leclerc');
  assert.match(seasonCaptions(won, '').instagram, /^👑 Charles Leclerc champion du monde 2026 !/);
});

test('course tour par tour : pages de l\'API regroupées, leaders et remontées', () => {
  const T = (id, position, time) => ({ driverId: id, position: String(position), time });
  const pages = [{ round: '10', Laps: [{ number: '1', Timings: [T('max', 2, '1:40.0'), T('lec', 1, '1:39.0')] }] }, { round: '10', Laps: [{ number: '1', Timings: [T('ham', 3, '1:41.0')] }, { number: '2', Timings: [T('max', 1, '1:35.0'), T('lec', 2, '1:36.0'), T('ham', 3, '1:36.5')] }] }];
  const results = [
    { Driver: { driverId: 'max', code: 'VER', givenName: 'Max', familyName: 'Verstappen' }, Constructor: { name: 'Red Bull', constructorId: 'red_bull' }, grid: '2', position: '1', positionText: '1', status: 'Finished' },
    { Driver: { driverId: 'lec', code: 'LEC', givenName: 'Charles', familyName: 'Leclerc' }, Constructor: { name: 'Ferrari', constructorId: 'ferrari' }, grid: '1', position: '2', positionText: '2', status: 'Finished' },
    { Driver: { driverId: 'ham', code: 'HAM', givenName: 'Lewis', familyName: 'Hamilton' }, Constructor: { name: 'Ferrari', constructorId: 'ferrari' }, grid: '5', position: '3', positionText: '3', status: 'Finished' },
  ];
  const laps = parseRaceLaps(pages, results);
  assert.equal(laps.total, 2);
  assert.deepEqual(laps.drivers[0].pos, [2, 1]);
  assert.deepEqual(laps.drivers[2].times, [101, 96.5]);
  const { led, changes } = lapsLedBy(laps);
  assert.deepEqual([...led], [['LEC', 1], ['VER', 1]]);
  assert.equal(changes, 1);
  assert.equal(cleanPace([100, 90, 90.2]), null);   // trop peu de tours
  const d = raceLapsData(R1, laps, { year: 2026 });
  assert.equal(d.climbs[0].code, 'HAM');
  assert.deepEqual(slidesFor(d), ['couverture', 'positions']);
  assert.match(seasonCaptions(d, '').instagram, /🚀 Plus belles remontées : Hamilton \(P5 → P3\)/);
});

test('récap de la semaine et questions en fin de texte', () => {
  const it = (title, tags = []) => ({ id: title, title, summary: 'Résumé.', tags, src: 'f1', t: Date.UTC(2026, 9, 14), link: 'https://x.test', lang: 'fr', sources: 3 });
  const items = ['Hamilton signs new Ferrari deal', 'Verstappen handed grid penalty', 'Audi confirms line-up'].map((t) => newsPost(it(t), { sourceName: 'Formula 1' }));
  const d = recapData(items, { now: Date.UTC(2026, 9, 16, 12) });
  assert.deepEqual(slidesFor(d), ['recapcover', 'recap-1', 'recap-2', 'recap-3']);
  assert.equal(d.date, '10 octobre au 16 octobre');
  const c = seasonCaptions(d, '@moi');
  assert.match(c.instagram, /^📰 La semaine en F1 : les 3 infos à retenir\n\n1️⃣ TRANSFERT \| Hamilton signs new Ferrari deal\n2️⃣ PÉNALITÉ/);
  // Question adaptée, avant la signature
  const q = questionCaptions(c, d, '@moi');
  assert.match(q.instagram, /\n\n💬 Quelle info vous a le plus marqué cette semaine \?\n\n@moi\n\n#/);
  assert.match(questionFor({ kind: 'quali', sprint: false }), /Qui gagne la course/);
  assert.match(questionFor({ news: true, badge: { key: 'penalite' } }), /Sanction méritée/);
  assert.match(questionFor({ post: 'flash', event: { kind: 'sc' } }), /Qui va en profiter/);
  const full = { x: `${'a'.repeat(275)}\n\n#F1` };
  assert.equal(questionCaptions(full, d, '').x, full.x);   // X plein : inchangé
});

test('publications programmées : publiées à l\'heure, résultat gardé, annulation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-'));
  let now = Date.UTC(2026, 9, 16, 12);
  const sent = [];
  const recorded = [];
  const s = createScheduler({ dir, now: () => now, timers: false, publish: async (net, body) => { if (net === 'x') throw new Error('refusé'); sent.push([net, body.text]); return { id: '1', url: `https://${net}.test/1` }; }, record: async (e) => recorded.push(e) });
  assert.throws(() => s.add({ at: now - 3600e3, posts: [{ body: { network: 'instagram' } }] }), /Date/);
  assert.throws(() => s.add({ at: now + 60e3, posts: [] }), /réseau/);
  const a = s.add({ at: now + 3600e3, title: 'Programme', posts: [{ body: { network: 'instagram', text: 'Bonjour', images: ['AAAA'] } }, { body: { network: 'x', text: 'Salut' } }], record: { key: 'weekend:2026-19', kind: 'weekend', title: 'Programme' } });
  const b = s.add({ at: now + 7200e3, posts: [{ body: { network: 'threads', text: 'b' } }] });
  await s.tick();
  assert.equal(sent.length, 0);   // pas encore l'heure
  s.cancel(b.id);
  now += 3600e3 + 1000;
  await s.tick();
  assert.deepEqual(sent, [['instagram', 'Bonjour']]);
  const [job] = s.list();
  assert.equal(job.status, 'error');
  assert.deepEqual(job.results, { instagram: { ok: true, url: 'https://instagram.test/1' }, x: { ok: false, error: 'refusé' } });
  assert.equal(recorded[0].nets.instagram.url, 'https://instagram.test/1');
  assert.ok(!fs.readFileSync(path.join(dir, `${a.id}.json`), 'utf8').includes('AAAA'));   // visuels retirés après publication
  await s.tick();
  assert.equal(sent.length, 1);   // jamais publiée deux fois
  assert.throws(() => s.cancel('../x'), /inconnue/);
});

test('météo prévue : jours, températures et risque de pluie', async () => {
  const days = await forecast(30.13, -97.64, { get: async (u) => { assert.match(u, /latitude=30\.1300&longitude=-97\.6400/); return { daily: { time: ['2026-10-23', '2026-10-24'], temperature_2m_max: [25, 26], temperature_2m_min: [14, 15], precipitation_probability_max: [10, null] }, timezone: 'America/Chicago' }; } });
  assert.equal(days.tz, 'America/Chicago');
  assert.deepEqual([...days], [{ date: '2026-10-23', tmax: 25, tmin: 14, rain: 10 }, { date: '2026-10-24', tmax: 26, tmin: 15, rain: null }]);
  await assert.rejects(forecast('a', 1), /Coordonnées/);
  // Temps qu'il fait sur le circuit (onglet Météo entre deux séances)
  const now = await forecast(1.29, 103.86, { get: async (u) => { assert.match(u, /current=temperature_2m/); return { daily: { time: ['2026-10-18'], temperature_2m_max: [31] }, current: { time: '2026-10-18T11:30', temperature_2m: 30.2, relative_humidity_2m: 77, surface_pressure: 1011.1, wind_speed_10m: 5, wind_direction_10m: 204, precipitation: 0 } }; } });
  assert.deepEqual(now.current, { at: '2026-10-18T11:30', air: 30.2, humidity: 77, pressure: 1011.1, wind: 5, windDir: 204, rain: 0 });
});

test('race week : tracé du circuit, couleurs du pays, vainqueur précédent, mise en page selon la manche', async () => {
  const { raceWeekData } = await import('../shared/social-season.js');
  const { trackShape, circuitInfo, flagColors } = await import('../shared/circuits-info.js');
  const track = { rotation: 90, x: [0, 1000, 1000, 0], y: [0, 0, 500, 500], corners: [{ number: 1, trackPosition: { x: 1000, y: 0 } }] };
  const sh = trackShape(track);
  assert.equal(sh.pts.length, 4);
  assert.ok(sh.pts.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1));
  assert.ok(Math.abs(sh.h - 1) < 1e-9 && Math.abs(sh.w - 0.5) < 1e-9);   // tourné d'un quart de tour
  assert.equal(trackShape(null), null);
  assert.deepEqual(circuitInfo('americas'), { key: 9, km: 5.513, laps: 56 });
  assert.deepEqual(flagColors('zz'), ['#e10600', '#f3f5f9']);
  const race = { ...R1, round: 18, circuitId: 'americas' };
  const d = raceWeekData(race, { year: 2026, rounds: 23, track, prev: { name: 'Max Verstappen', team: 'Red Bull', teamId: 'red_bull' }, tyres: { hard: 2, medium: 3, soft: 4 } });
  assert.equal(d.post, 'raceweek');
  assert.equal(d.variant, 0);
  assert.deepEqual([d.laps, d.km, d.corners, d.city], [56, 5.513, 1, 'Austin']);
  assert.deepEqual(d.palette, flagColors('us'));
  assert.deepEqual(slidesFor(d), ['raceweek', 'horaires', 'infos']);
  const c = seasonCaptions(d, '@moi');
  assert.match(c.instagram, /^🔥 RACE WEEK \| Grand Prix des États-Unis 🇺🇸\n\n📍 Manche 18\/23 · du 23 au 25 octobre 2026 · Austin\n🏁 Course dimanche à 20:00 \(heure de Paris\)\n🛣️ 56 tours · 5,513 km · 1 virage\n🏆 Vainqueur 2025 : Max Verstappen \(Red Bull\)/);
  assert.match(c.instagram, /#RaceWeek #Austin/);
  assert.ok(xLength(c.x) <= 280);
  assert.equal(raceWeekData({ ...race, round: 19 }, { year: 2026 }).variant, 1);
  // « 1 novembre » écrit « 1er novembre »
  const nov = raceWeekData({ ...race, sessions: [{ label: 'EL1', t: '2026-10-30T18:30:00Z' }, { label: 'Course', t: '2026-11-01T20:00:00Z' }] }, { year: 2026 });
  assert.equal(nov.date, '30 octobre au 1er novembre 2026');
});

test('records du circuit : éditions lues dans les archives (commun à l\'appli et à la page du créateur)', async () => {
  const { editionOf, recordsOf, recordYears, sessionBest } = await import('../shared/circuit-records.js');
  assert.deepEqual(recordYears(2026), [2025, 2024, 2023, 2022]);
  assert.deepEqual(recordYears(2019), [2018]);
  assert.equal(sessionBest({ Lines: {} }), null);
  const files = {
    '2025/Index.json': { Meetings: [{ Name: 'Italian Grand Prix', Circuit: { Key: 39 }, Sessions: [
      { Name: 'Sprint Qualifying', Type: 'Qualifying', Path: '2025/sq/' }, { Name: 'Qualifying', Type: 'Qualifying', Path: '2025/q/' }, { Name: 'Race', Type: 'Race', Path: '2025/r/' }] }] },
    '2025/q/TimingData.json': { Lines: { 1: { BestLapTime: { Value: '1:18.792', Lap: 20 } }, 16: { BestLapTime: { Value: '1:18.900' } } } },
    '2025/q/DriverList.json': { 1: { Tla: 'VER', TeamName: 'Red Bull Racing', TeamColour: '4781D7' } },
    '2025/r/TimingData.json': { Lines: { 4: { BestLapTime: { Value: '1:20.901', Lap: 50 } } } },
    '2024/Index.json': { Meetings: [{ Name: 'Monaco Grand Prix', Circuit: { Key: 22 }, Sessions: [{ Name: 'Race', Type: 'Race', Path: '2024/m/' }] }] },
    '2023/Index.json': { Meetings: [{ Name: 'Italian Grand Prix', Circuit: { Key: 39 }, Sessions: [{ Name: 'Qualifying', Type: 'Qualifying', Path: '2023/q/' }, { Name: 'Race', Type: 'Race', Path: '2023/r/' }] }] },
  };
  const read = async (p) => { if (!files[p]) throw new Error('404'); return files[p]; };
  const e25 = await editionOf(2025, 39, read);
  assert.equal(e25.pole.tla, 'VER');
  assert.equal(e25.pole.time, 78.792);
  assert.equal(e25.fastest.tla, '4');            // pilote absent de la liste : numéro gardé
  assert.equal(await editionOf(2024, 39, read), null);                 // pas au calendrier
  assert.deepEqual(await editionOf(2023, 39, read), { pending: true }); // archive pas encore publiée
  const rec = recordsOf(39, [e25, null, { pending: true }]);
  assert.equal(rec.editions.length, 1);
  assert.equal(rec.bestPole.year, 2025);
  assert.equal(rec.bestRaceLap.time, 80.901);
  // D'après les résultats publics (Jolpica) : pole = meilleur temps de Q3 (sinon Q2, Q1), meilleur tour en course
  const { editionFromResults } = await import('../shared/circuit-records.js');
  const drv = (code, team) => ({ Driver: { code }, Constructor: { name: team } });
  const ej = editionFromResults(2024, [{ raceName: 'United States Grand Prix', Results: [
    { ...drv('LEC', 'Ferrari'), FastestLap: { lap: '40', Time: { time: '1:37.900' } } },
    { ...drv('OCO', 'Alpine F1 Team'), FastestLap: { lap: '56', Time: { time: '1:37.330' } } },
    { ...drv('MAG', 'Haas F1 Team') },
  ] }], [{ QualifyingResults: [{ position: '1', ...drv('NOR', 'McLaren'), Q1: '1:33.4', Q2: '1:32.9', Q3: '1:32.330' }] }]);
  assert.deepEqual(ej, { year: 2024, name: 'United States Grand Prix', pole: { time: 92.33, tla: 'NOR', team: 'McLaren', color: '', lap: null }, fastest: { time: 97.33, tla: 'OCO', team: 'Alpine F1 Team', color: '', lap: 56 } });
  assert.equal(editionFromResults(2024, [], []), null);   // pas couru sur ce circuit cette année-là
});

test('vidéo de course : safety car, VSC, drapeaux et moments forts (direction de course ou estimation)', async () => {
  const { parseRaceControl, raceStory, raceSessionPath } = await import('../shared/race-story.js');
  // 10 tours, 3 pilotes ; VER abandonne au tour 7
  const mk = (code, pos, times, extra = {}) => ({ code, first: code, last: code, team: '', pos, times, grid: pos[0], finish: pos.at(-1), classified: true, laps: times.filter(Boolean).length, pits: [], ...extra });
  const base = [90, 90, 90, 120, 121, 90, 90, 90, 90, 89];
  const laps = { total: 10, drivers: [
    mk('RUS', [1, 1, 1, 1, 1, 2, 2, 2, 1, 1], base.map((t, i) => (i === 9 ? 88.5 : t))),
    mk('LEC', [2, 2, 2, 2, 2, 1, 1, 1, 2, 2], base.map((t) => t + 0.2), { pits: [4] }),
    mk('VER', [3, 3, 3, 3, 3, 3, null, null, null, null], [...base.slice(0, 6), null, null, null, null], { classified: false, finish: null }),
  ] };
  const rcm = parseRaceControl({ Messages: {
    0: { Utc: '2026-01-01T10:00:00', Lap: 1, Category: 'Flag', Flag: 'GREEN', Scope: 'Track', Message: 'GREEN LIGHT - PIT EXIT OPEN' },
    1: { Utc: '2026-01-01T10:10:00', Lap: 4, Category: 'SafetyCar', Status: 'DEPLOYED', Mode: 'SAFETY CAR', Message: 'SAFETY CAR DEPLOYED' },
    2: { Utc: '2026-01-01T10:14:00', Lap: 5, Category: 'SafetyCar', Status: 'IN THIS LAP', Mode: 'SAFETY CAR', Message: 'SAFETY CAR IN THIS LAP' },
    3: { Utc: '2026-01-01T10:20:00', Lap: 8, Category: 'SafetyCar', Status: 'DEPLOYED', Mode: 'VIRTUAL SAFETY CAR', Message: 'VIRTUAL SAFETY CAR DEPLOYED' },
    4: { Utc: '2026-01-01T10:21:00', Lap: 8, Category: 'SafetyCar', Status: 'ENDING', Mode: 'VIRTUAL SAFETY CAR', Message: 'VIRTUAL SAFETY CAR ENDING' },
    5: { Utc: '2026-01-01T10:30:00', Lap: 10, Category: 'Flag', Flag: 'CHEQUERED', Scope: 'Track', Message: 'CHEQUERED FLAG' },
    6: { Utc: '2026-01-01T10:31:00', Lap: 10, Category: 'Flag', Flag: 'DOUBLE YELLOW', Scope: 'Sector', Message: 'DOUBLE YELLOW IN TRACK SECTOR 3' },
    7: { Utc: '2026-01-01T10:40:00', Lap: 10, Category: 'Other', Message: 'FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 16 (LEC) - CAUSING A COLLISION' },
  } });
  assert.equal(rcm.length, 8);
  const s = raceStory(laps, rcm);
  assert.equal(s.estimated, false);
  // « CHEQUERED FLAG » n'est pas un drapeau rouge ; drapeaux d'après l'arrivée ignorés
  assert.deepEqual(s.status, ['green', 'green', 'green', 'sc', 'sc', 'green', 'green', 'vsc', 'green', 'green']);
  // Même tour : direction de course d'abord (dans l'ordre des messages), puis leader, abandons, meilleur tour
  assert.deepEqual(s.events.map((e) => `${e.lap}:${e.kind}${e.code ? `:${e.code}` : ''}`), ['4:sc', '6:restart', '6:lead:LEC', '7:out:VER', '8:vsc', '8:restart', '9:lead:RUS', '10:penalty:LEC', '10:fastest:RUS']);
  assert.deepEqual(s.counts, { sc: 1, vsc: 1, red: 0, neutral: 0, lead: 2 });
  assert.equal(s.events.find((e) => e.kind === 'penalty').text, '5 S');
  assert.deepEqual(s.best, { time: 88.5, lap: 10, code: 'RUS' });
  // Sans direction de course : tours lents de tout le peloton = neutralisation estimée
  const e = raceStory(laps, null);
  assert.equal(e.estimated, true);
  assert.deepEqual(e.status.slice(2, 6), ['green', 'neutral', 'neutral', 'green']);
  assert.ok(e.events.some((x) => x.kind === 'neutral' && x.lap === 4) && e.events.some((x) => x.kind === 'restart' && x.lap === 6));
  // Course retrouvée dans l'Index des archives (nom, sinon circuit)
  const idx = { Meetings: [{ Name: 'Italian Grand Prix', Circuit: { Key: 39 }, Sessions: [{ Name: 'Sprint', Type: 'Race', Path: 'x/sprint/' }, { Name: 'Race', Type: 'Race', Path: 'x/race/' }] }] };
  assert.equal(raceSessionPath(idx, { name: 'Italian Grand Prix' }), 'x/race/');
  assert.equal(raceSessionPath(idx, { name: 'GP', circuitKey: 39 }), 'x/race/');
  assert.equal(raceSessionPath(idx, { name: 'GP', circuitKey: 1 }), null);
  // Arrêts au stand lus dans l'API publique
  const T = (id, position, time) => ({ driverId: id, position: String(position), time });
  const pl = parseRaceLaps([{ Laps: [{ number: '1', Timings: [T('max', 1, '1:40.0')] }] }], [{ Driver: { driverId: 'max', code: 'VER' }, Constructor: {}, grid: '1', position: '1', positionText: '1' }], [{ PitStops: [{ driverId: 'max', lap: '1' }, { driverId: 'max', lap: '1' }] }]);
  assert.deepEqual(pl.drivers[0].pits, [1]);
  // Données de la vidéo : déroulé ; timing plus lent sur les neutralisations
  const d = raceLapsData(R1, { ...laps, drivers: laps.drivers.map((x) => ({ ...x, teamId: '' })) }, { year: 2026, rcm });
  assert.equal(d.story.counts.sc, 1);
  const { raceVideoTiming } = await import('../shared/social-draw-season.js');
  const tm = raceVideoTiming(d);
  assert.ok(tm.w[3] > tm.w[1]);
  assert.ok(tm.banners.length >= 4 && tm.duration > 25 && tm.duration < 55);
});
