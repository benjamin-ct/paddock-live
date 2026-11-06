import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pointsOf, sanctionOf, expiry, licencePoints } from '../shared/penalties.js';
import { parseDecision, FIA_VERSION } from '../shared/fia-tech.js';

const it = (x, y, s) => ({ x, y, s });
const day = (s) => Date.parse(`${s}T12:00:00Z`);

test('sanctions : points de pénalité lus dans la décision (formes écrites par les commissaires)', () => {
  assert.deepEqual(pointsOf('10 second time penalty. 2 penalty points (total of 6 for the 12 month period).'), { points: 2, total: 6 });
  assert.deepEqual(pointsOf('A drop of one grid position for the next race in which the driver competes. One penalty point is imposed, making a total of 1 for the 12 month period.'), { points: 1, total: 1 });
  assert.deepEqual(pointsOf('10 second time penalty. 2 penalty points (7 points in total)'), { points: 2, total: 7 });
  assert.deepEqual(pointsOf('10 second time penalty. 1 penalty points (total of 5 for the 12 month period).'), { points: 1, total: 5 });
  assert.equal(pointsOf('10 second time penalty.'), null);
  assert.equal(pointsOf('No further action.'), null);
});

test('sanctions : nature de la sanction', () => {
  assert.deepEqual(sanctionOf('10 second time penalty imposed after the Race.'), { kind: 'time', n: 10 });
  assert.deepEqual(sanctionOf('Drop of 3 grid positions for the next Sprint/Race in which the driver participates.'), { kind: 'grid', n: 3 });
  assert.deepEqual(sanctionOf('A drop of one grid position for the next race'), { kind: 'grid', n: 1 });
  assert.deepEqual(sanctionOf('The competitor (Mercedes-AMG PETRONAS F1 Team) is fined €7,500.'), { kind: 'fine', n: 7500 });
  assert.equal(sanctionOf('Drive through penalty. 2 penalty points (total of 3 for the 12 month period).').kind, 'drive');
  assert.equal(sanctionOf('Stop and go penalty imposed after the Race.').kind, 'stopgo');
  assert.equal(sanctionOf('Required to start the Race from the pit lane.').kind, 'pitlane');
  assert.equal(sanctionOf('Car 30 is disqualified from the results of the Provisional Qualifying Classifications.').kind, 'dsq');
  assert.equal(sanctionOf('Driver: Reprimand (Driving). This is the driver’s 1st reprimand of the season.').kind, 'reprimand');
  assert.equal(sanctionOf('Driver: Warning.').kind, 'warning');
  assert.equal(sanctionOf('The Super Licence of the driver of Car 20 is suspended for the next Competition').kind, 'ban');
  assert.equal(sanctionOf('No further action.'), null);
  assert.equal(sanctionOf('No penalty is applied.'), null);
  assert.equal(sanctionOf(''), null);
});

test('permis à points : chaque point retiré un an après la décision, pilote suivi par son nom', () => {
  assert.equal(new Date(expiry(day('2026-08-23'))).toISOString().slice(0, 10), '2027-08-23');
  const dec = [
    { driver: 'Liam Lawson', num: '30', published: day('2025-12-07'), decision: '5 second time penalty. 1 penalty point (total of 6 for the 12 month period).', event: 'Abu Dhabi Grand Prix' },
    { driver: 'Liam Lawson', num: '30', published: day('2026-08-23'), decision: '10 second time penalty. 1 penalty points (total of 3 for the 12 month period).', event: 'Dutch Grand Prix' },
    { driver: 'Liam Lawson', num: '30', published: day('2026-10-31'), decision: 'No further action.', event: 'Mexico City Grand Prix' },
    // Même pilote, autre numéro la saison d'après
    { driver: 'Max Verstappen', num: '1', published: day('2025-12-07'), decision: '5 second time penalty. 2 penalty points (total of 2 for the 12 month period).', event: 'Abu Dhabi Grand Prix' },
    { driver: 'Max Verstappen', num: '3', published: day('2026-10-31'), decision: 'One penalty point is imposed, making a total of 3 for the 12 month period.', event: 'Mexico City Grand Prix' },
    // Décision publiée après la date demandée : pas comptée
    { driver: 'Pierre Gasly', num: '10', published: day('2026-12-01'), decision: '2 penalty points', event: 'Qatar Grand Prix' },
  ];
  const at = day('2026-11-06');
  const out = licencePoints(dec, at);
  assert.deepEqual(out.map((x) => [x.driver, x.num, x.total]), [['Max Verstappen', '3', 3], ['Liam Lawson', '30', 2]]);
  assert.deepEqual(out[1].points.map((p) => [p.n, new Date(p.expires).toISOString().slice(0, 10), p.event]), [[1, '2026-12-07', 'Abu Dhabi Grand Prix'], [1, '2027-08-23', 'Dutch Grand Prix']]);
  // Un mois plus tard, le point d'Abu Dhabi 2025 est retiré
  assert.equal(licencePoints(dec, day('2026-12-08')).find((x) => x.driver === 'Liam Lawson').total, 1);
});

test('permis à points : 12 points atteints, suspension puis 12 points retirés (les plus anciens d\'abord)', () => {
  const pts = (n, date) => ({ driver: 'Kevin Magnussen', num: '20', published: day(date), decision: `${n} penalty points`, event: date });
  const dec = [pts(2, '2024-01-10'), pts(3, '2024-03-01'), pts(4, '2024-05-01'), pts(2, '2024-07-01'), pts(2, '2024-09-01'), pts(1, '2024-10-01')];
  const [k] = licencePoints(dec, day('2024-10-15'));
  assert.deepEqual(k.bans.map((b) => new Date(b).toISOString().slice(0, 10)), ['2024-09-01']);
  assert.equal(k.total, 2, '13 points - 12 retirés + 1');
  assert.deepEqual(k.points.map((p) => [p.event, p.n]), [['2024-09-01', 1], ['2024-10-01', 1]]);
});

test('décision des commissaires : pilote, écurie, séance et décision sur plusieurs lignes', () => {
  const d = parseDecision([[
    it(46, 662, 'From The Stewards Document 47'), it(46, 584, 'The Stewards, having received a report from the Race Director, have considered the following'),
    it(46, 544, 'No / Driver'), it(119, 544, '30 - Liam Lawson'),
    it(46, 522, 'Competitor'), it(119, 522, 'Visa Cash App Racing Bulls F1 Team'),
    it(46, 477, 'Session'), it(119, 477, 'Race'),
    it(46, 454, 'Fact'), it(119, 454, 'Car 30 caused a collision with Car 18 in Turn 1.'),
    it(46, 409, 'Decision'), it(119, 409, '5 second time penalty.'), it(119, 396, '1 penalty point (total of 3 for the 12 month period).'),
    it(46, 375, 'Reason'), it(119, 375, 'The Stewards reviewed video evidence.'),
    it(119, 160, 'Decisions of the Stewards are taken independently of the FIA'),
  ]]);
  assert.deepEqual(d, { num: '30', driver: 'Liam Lawson', competitor: 'Visa Cash App Racing Bulls F1 Team', session: 'Race', fact: 'Car 30 caused a collision with Car 18 in Turn 1.', decision: '5 second time penalty. 1 penalty point (total of 3 for the 12 month period).' });
});

// Serveur : décisions lues par la tâche planifiée avec les autres documents FIA (PDF déjà lus : gardés dans la base),
// saison précédente demandée pour les 12 mois glissants
test('version web : /live/api/season/penalties, points sur 12 mois (saison précédente lue aussi) et sanctions de la saison', async () => {
  const { fiaTick, seasonPenaltiesWeb } = await import('../analytics/fia-tech.js');
  const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 20);
  const rows = new Map();
  const DB = { prepare: (sql) => ({ bind: (...a) => ({
    first: async () => (rows.has(a[0]) ? { v: rows.get(a[0]) } : null),
    all: async () => ({ results: [...rows].filter(([k]) => k.startsWith(a[0].replace('%', ''))).map(([k, v]) => ({ k, v })) }),
    run: async () => { if (sql.startsWith('INSERT INTO studio')) rows.set(a[0], a[1]); else throw new Error(sql); },
  }) }) };
  const env = { DB };
  const CH = '/documents/championships/fia-formula-one-world-championship-14';
  const S = { 2025: `${CH}/season/season-2025-2071`, 2026: `${CH}/season/season-2026-2072` };
  const EV = { 2025: `${S[2025]}/event/Abu%20Dhabi%20Grand%20Prix`, 2026: `${S[2026]}/event/Mexico%20City%20Grand%20Prix` };
  const li = (n, title, file, date) => `<li class="document-row key-${n}"><a href="/system/files/decision-document/${file}.pdf" download><div class="title">${title}</div><div class="published"><span class="date-display-single">${date}</span></div></a></li>`;
  const pages = {
    [CH]: `<option value="${S[2025]}">2025</option><option value="${S[2026]}">2026</option>`,
    [S[2025]]: `<option value="${EV[2025]}">Abu Dhabi Grand Prix</option>`,
    [S[2026]]: `<option value="${EV[2026]}">Mexico City Grand Prix</option>`,
    [EV[2025]]: li(45, 'Doc 45 - Infringement - Car 30 - Erratic driving', 'ad_30', '07.12.25 17:00') + li(40, 'Doc 40 - Summons - Car 30 - Erratic driving', 'ad_s30', '07.12.25 16:00'),
    [EV[2026]]: li(34, 'Doc 34 - Infringement - Car 30 - Turn 14 incident with Car 3', 'mx_30', '31.10.26 20:00')
      + li(48, 'Doc 48 - Infringement - Car 12 - Released in an unsafe condition', 'mx_12', '31.10.26 21:00')
      + li(50, 'Doc 50 - Decision - Car 10 - Alleged causing a collision', 'mx_10', '01.11.26 22:00')
      + li(51, 'Doc 51 - Infringement - Race Deleted Lap Times', 'mx_del', '01.11.26 22:00'),
  };
  const seed = (file, data) => rows.set(`fiadoc:${sha(`https://www.fia.com/system/files/decision-document/${file}.pdf`)}`, JSON.stringify({ v: FIA_VERSION, data }));
  seed('ad_30', { num: '30', driver: 'Liam Lawson', competitor: 'Visa Cash App Racing Bulls F1 Team', session: 'Race', fact: '', decision: '5 second time penalty. 1 penalty point (total of 6 for the 12 month period).' });
  seed('mx_30', { num: '30', driver: 'Liam Lawson', competitor: 'Visa Cash App Racing Bulls F1 Team', session: 'Qualifying', fact: '', decision: 'A drop of one grid position for the next race. One penalty point is imposed, making a total of 2 for the 12 month period.' });
  seed('mx_12', { num: '12', driver: 'Kimi Antonelli', competitor: 'Mercedes-AMG PETRONAS F1 Team', session: 'Qualifying', fact: '', decision: 'The Competitor (Mercedes-AMG Petronas F1 Team) is fined €7,500.' });
  seed('mx_10', { num: '10', driver: 'Pierre Gasly', competitor: 'BWT Alpine F1 Team', session: 'Race', fact: '', decision: 'No further action' });
  const asked = [];
  const fetchFn = async (u) => { asked.push(u); const p = u.replace('https://www.fia.com', ''); return p in pages ? new Response(pages[p]) : new Response('', { status: 404 }); };
  const now = Date.parse('2026-11-06T12:00:00Z');

  const first = await seasonPenaltiesWeb(env, 2026, { now });
  assert.deepEqual([first.pending, first.drivers, first.penalties], [true, [], []]);
  assert.ok(rows.has('fiawant:2025') && rows.has('fiawant:2026'), 'saison précédente demandée aussi');
  assert.equal(asked.length, 0, 'la page ne lit jamais fia.com elle-même');
  assert.equal((await fiaTick(env, { now, fetchFn })).event, 'Mexico City Grand Prix');
  assert.deepEqual(await fiaTick(env, { now: now + 60e3, fetchFn }), { year: 2025, event: 'Abu Dhabi Grand Prix' });
  assert.ok(!asked.some((u) => /\.pdf$/.test(u)), 'PDF déjà lus : repris de la base');

  const out = await seasonPenaltiesWeb(env, 2026, { now: now + 120e3 });
  assert.equal(out.pending, false);
  assert.deepEqual(out.drivers.map((x) => [x.driver, x.total, x.team, x.points.length]), [['Liam Lawson', 2, 'Racing Bulls', 2]]);
  assert.equal(new Date(out.drivers[0].points[0].expires).toISOString().slice(0, 10), '2026-12-07');
  assert.match(out.drivers[0].points[0].url, /ad_30\.pdf$/);
  // Sanctions de la saison seulement (pas l'Abu Dhabi 2025), sans les décisions sans sanction, la plus récente d'abord
  assert.deepEqual(out.penalties.map((p) => [p.driver, p.sanction.kind, p.points, p.teamId]), [['Kimi Antonelli', 'fine', 0, 'mercedes'], ['Liam Lawson', 'grid', 1, 'rb']]);
  assert.equal(out.penalties[1].event, 'Mexico City Grand Prix');
  // /live/api/season/fia (éléments moteur, évolutions) : sans les décisions, même réponse qu'avant
  const { seasonFiaWeb } = await import('../analytics/fia-tech.js');
  assert.ok((await seasonFiaWeb(env, 2026, { now: now + 120e3 })).events.every((e) => !('decisions' in e)));
  // Saison passée : points à la fin de la saison
  const y25 = await seasonPenaltiesWeb(env, 2025, { now: now + 120e3 });
  assert.deepEqual([y25.drivers[0].total, y25.penalties.length], [1, 1]);
});
