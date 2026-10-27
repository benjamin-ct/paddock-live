import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocumentList, parsePublished, pickEvent } from '../shared/fia-list.js';
import { analyzeStewards, linkFiaDocs, deletedLapsDoc, parseFiaDoc } from '../shared/stewards.js';

const row = (n, title, file, date) => `<li class="document-row key-${n}">  <a href="/system/files/decision-document/${file}.pdf" download target="_blank">
  <div class="file-type"><div class="pdf"></div></div>
  <div class="title">
  ${title}
  </div>
  <div class="published">
  Published on <span  class="date-display-single">${date}</span> CET  </div></a></li>`;

const HTML = [
  row(68, 'Doc 68 - Infringement - Car 5 - Overtaking under yellow flags', '2026_x_-_infringement_-_car_5', '26.09.26 17:52'),
  row(66, 'Doc 66 - Infringement - Car 43 - Collision with Car 10 in Turn 1', '2026_x_-_infringement_-_car_43', '26.09.26 16:55'),
  row(65, 'Doc 65 - Decision - Car 41 - Collision with Car 30 in turn 1', '2026_x_-_decision_-_car_41', '26.09.26 16:50'),
  row(64, 'Doc 64 - Race Deleted Lap Times', '2026_x_-_race_deleted', '26.09.26 16:40'),
  row(60, 'Doc 60 - Summons - Car 5  - Overtaking under yellow flags', '2026_x_-_summons_-_car_5', '26.09.26 16:30'),
  row(59, 'Doc 59 - Driver&#039;s Briefing', '2026_x_-_briefing', '26.09.26 12:00'),
].join('\n');

test('documents FIA : lecture de la liste et heure de Paris', () => {
  const docs = parseDocumentList(HTML);
  assert.equal(docs.length, 6);
  assert.equal(docs[1].title, 'Doc 66 - Infringement - Car 43 - Collision with Car 10 in Turn 1');
  assert.ok(docs[1].url.startsWith('https://www.fia.com/system/files/decision-document/'));
  assert.equal(docs[5].title, 'Doc 59 - Driver\'s Briefing');
  // Heure d'été : UTC+2 ; heure d'hiver : UTC+1
  assert.equal(new Date(parsePublished('26.09.26 16:55')).toISOString(), '2026-09-26T14:55:00.000Z');
  assert.equal(new Date(parsePublished('06.12.26 17:00')).toISOString(), '2026-12-06T16:00:00.000Z');
  assert.deepEqual(parseFiaDoc(docs[1]), { num: 66, type: 'infringement', cars: ['43', '10'], subject: 'Car 43 - Collision with Car 10 in Turn 1' });
});

test('documents FIA : mise en page 2026 (lien et titre dans des blocs imbriqués)', () => {
  const html = `<li class="document-row key-72">
<div class="panelizer-view-mode node node-teaser node-decision-document node-64521">
          <a href="/system/files/decision-document/2026_x_-_championship_points.pdf" download target="_blank">
  <div class="file-type"><div class="field"><div class="field-items"><div class="field-item even"><div class="pdf"></div>
</div></div></div>
  </div>
<div class="panel-separator"></div>  <div class="title">
  <div class="field field-name-title-field"><div class="field-items"><div class="field-item even">Doc 72 - Championship Points</div></div></div>
  </div>
<div class="panel-separator"></div>
  <div class="published">
  <div class="field"><div class="field-items"><div class="field-item even">Published on <span  class="date-display-single">26.09.26 18:20</span> CET</div></div></div>  </div>
</a></div></li>
<li class="document-row key-71">
<div class="panelizer-view-mode"><a href="/system/files/decision-document/2026_x_-_final_race_classification.pdf" download>
<div class="title"><div class="field-item even">Doc 71 - Final Race Classification</div></div>
<div class="published"><span  class="date-display-single">26.09.26 18:11</span></div></a></div></li>`;
  const docs = parseDocumentList(html);
  assert.equal(docs.length, 2);
  assert.equal(docs[0].title, 'Doc 72 - Championship Points');
  assert.match(docs[0].url, /championship_points\.pdf$/);
  assert.equal(new Date(docs[0].published).toISOString(), '2026-09-26T16:20:00.000Z');
  assert.equal(docs[1].title, 'Doc 71 - Final Race Classification');
});

test('documents FIA : choix de l\'épreuve', () => {
  const events = ['Italian Grand Prix', 'Grand Prix of Japan', 'Mexico City Grand Prix', 'Barcelona-Catalunya Grand Prix', 'Spanish Grand Prix'];
  assert.equal(pickEvent(events, { name: 'Italian Grand Prix' }), 'Italian Grand Prix');
  assert.equal(pickEvent(events, { name: 'Japanese Grand Prix', country: 'Japan', location: 'Suzuka' }), 'Grand Prix of Japan');
  assert.equal(pickEvent(events, { name: 'Spanish Grand Prix', country: 'Spain', location: 'Madrid' }), 'Spanish Grand Prix');
});

test('documents FIA : rattachement aux décisions et enquêtes, sans divulgation', () => {
  const at = (hh, mm) => `2026-09-26T${hh}:${mm}:00`;
  const msgs = [
    { Utc: at(14, 20), Lap: 38, Message: 'TURN 1 INCIDENT INVOLVING CARS 1 (NOR), 10 (GAS) AND 43 (COL) NOTED - CAUSING A COLLISION' },
    { Utc: at(14, 50), Lap: 51, Message: 'FIA STEWARDS: 10 SECOND TIME PENALTY FOR CAR 43 (COL) - CAUSING A COLLISION' },
    { Utc: at(14, 21), Lap: 38, Message: 'TURN 1 INCIDENT INVOLVING CARS 41 (LIN) AND 30 (LAW) NOTED' },
    { Utc: at(14, 25), Lap: 40, Message: 'FIA STEWARDS: TURN 7 INCIDENT INVOLVING CAR 5 (BOR) WILL BE INVESTIGATED AFTER THE RACE - YELLOW FLAG INFRINGEMENT' },
  ];
  const docs = parseDocumentList(HTML);
  const data = linkFiaDocs(analyzeStewards(msgs), docs);
  const col = data.decisions.find((d) => d.cars[0].tla === 'COL');
  assert.match(col.doc.title, /Car 43/);
  const bor = data.incidents.find((i) => i.cars[0].tla === 'BOR');
  assert.deepEqual(bor.docs.map((d) => d.kind), ['summons', 'decision']);
  const lin = data.incidents.find((i) => i.cars[0].tla === 'LIN');
  assert.match(lin.docs[0].title, /Car 41/);
  // En rediffusion : la décision déjà annoncée garde son document, mais l'issue d'une enquête
  // encore ouverte n'est pas dévoilée avant la publication du document.
  const early = linkFiaDocs(analyzeStewards(msgs), docs, Date.parse('2026-09-26T14:52:00Z'));
  assert.match(early.decisions.find((d) => d.cars[0].tla === 'COL').doc.title, /Car 43/);
  assert.deepEqual(early.incidents.find((i) => i.cars[0].tla === 'BOR').docs.map((d) => d.kind), ['summons']);
  assert.equal(deletedLapsDoc(docs, 'Race').title, 'Doc 64 - Race Deleted Lap Times');
  assert.equal(deletedLapsDoc(docs, 'Qualifying'), null);
});

// Serveur de la version web : épreuves lues par la tâche planifiée, une par passage, puis servies
test('version web : documents FIA lus par le serveur, une épreuve à la fois, épreuve récente relue', async () => {
  const { fiaTick, seasonFiaWeb } = await import('../analytics/fia-tech.js');
  const rows = new Map();
  const DB = { prepare: (sql) => ({ bind: (...a) => ({
    first: async () => (rows.has(a[0]) ? { v: rows.get(a[0]) } : null),
    all: async () => ({ results: [...rows].filter(([k]) => k.startsWith(a[0].replace('%', ''))).map(([k, v]) => ({ k, v })) }),
    run: async () => { if (sql.startsWith('INSERT INTO studio')) rows.set(a[0], a[1]); else throw new Error(sql); },
  }) }) };
  const env = { DB };
  const SEASON = '/documents/championships/fia-formula-one-world-championship-14/season/season-2026-2072';
  const pages = {
    '/documents/championships/fia-formula-one-world-championship-14': `<option value="${SEASON}">2026</option>`,
    [SEASON]: `<option value="${SEASON}/event/United%20States%20Grand%20Prix">United States Grand Prix</option><option value="${SEASON}/event/Mexico%20City%20Grand%20Prix">Mexico City Grand Prix</option>`,
    [`${SEASON}/event/United%20States%20Grand%20Prix`]: row(1, 'Doc 1 - Driver&#039;s Briefing', '2026_usa_-_briefing', '20.10.26 12:00'),
    [`${SEASON}/event/Mexico%20City%20Grand%20Prix`]: '',
  };
  const asked = [];
  const fetchFn = async (u) => { asked.push(u); const p = u.replace('https://www.fia.com', ''); return p in pages ? new Response(pages[p]) : new Response('', { status: 404 }); };
  const now = Date.parse('2026-10-21T12:00:00Z');

  const first = await seasonFiaWeb(env, 2026, { now });
  assert.deepEqual([first.pending, first.events.length], [true, 0]);
  assert.equal(asked.length, 0);   // la page ne lit jamais fia.com elle-même
  assert.deepEqual(await fiaTick(env, { now, fetchFn }), { year: 2026, event: 'United States Grand Prix' });
  assert.deepEqual(await fiaTick(env, { now: now + 60e3, fetchFn }), { year: 2026, event: 'Mexico City Grand Prix' });
  assert.equal(await fiaTick(env, { now: now + 120e3, fetchFn }), null);
  const out = await seasonFiaWeb(env, 2026, { now: now + 180e3 });
  assert.deepEqual([out.pending, out.done, out.total, out.events.length], [false, 2, 2, 1]);
  assert.equal(out.events[0].name, 'United States Grand Prix');
  assert.equal(out.events[0].tech, null);
  // Documents de moins de 4 jours : l'épreuve est relue une heure plus tard
  assert.deepEqual(await fiaTick(env, { now: now + 2 * 3600e3, fetchFn }), { year: 2026, event: 'United States Grand Prix' });

  // fia.com en panne pendant une relecture : raison gardée (lecture d'avant aussi), nouvel essai 5 minutes plus tard
  const down = async () => new Response('', { status: 503 });
  const t2 = now + 4 * 3600e3;
  assert.match((await fiaTick(env, { now: t2, fetchFn: down })).error, /HTTP 503/);
  const mid = await seasonFiaWeb(env, 2026, { now: t2 });
  assert.deepEqual([mid.events.length, mid.failed.length, mid.pending], [1, 1, true]);
  assert.equal(await fiaTick(env, { now: t2 + 60e3, fetchFn }), null);
  assert.deepEqual(await fiaTick(env, { now: t2 + 6 * 60e3, fetchFn }), { year: 2026, event: 'United States Grand Prix' });
  assert.deepEqual((await seasonFiaWeb(env, 2026, { now: t2 + 7 * 60e3 })).failed, []);
});

test('version web : évolutions techniques traduites par le serveur, une fois, reprises à la relecture', async () => {
  const { fiaNext, fiaTranslations } = await import('../analytics/fia-tech.js');
  const { FIA_VERSION } = await import('../shared/fia-tech.js');
  const { createHash } = await import('node:crypto');
  const rows = new Map();
  const DB = { prepare: (sql) => ({ bind: (...a) => ({
    first: async () => (rows.has(a[0]) ? { v: rows.get(a[0]) } : null),
    all: async () => ({ results: [...rows].filter(([k]) => k.startsWith(a[0].replace('%', ''))).map(([k, v]) => ({ k, v })) }),
    run: async () => { if (sql.startsWith('INSERT INTO studio')) rows.set(a[0], a[1]); else throw new Error(sql); },
  }) }) };
  const env = { DB };
  const SEASON = '/documents/championships/fia-formula-one-world-championship-14/season/season-2026-2072';
  const EVENT = `${SEASON}/event/United%20States%20Grand%20Prix`;
  const pages = {
    '/documents/championships/fia-formula-one-world-championship-14': `<option value="${SEASON}">2026</option>`,
    [SEASON]: `<option value="${EVENT}">United States Grand Prix</option>`,
    [EVENT]: row(5, 'Doc 5 - Car Presentation Submissions', '2026_usa_-_cps', '20.10.26 12:00'),
  };
  const fetchFn = async (u) => { const p = u.replace('https://www.fia.com', ''); return p in pages ? new Response(pages[p]) : new Response('', { status: 404 }); };
  // PDF déjà lu (gardé) : pas de lecture de PDF dans le test
  const pdf = 'https://www.fia.com/system/files/decision-document/2026_usa_-_cps.pdf';
  rows.set(`fiadoc:${createHash('sha1').update(pdf).digest('hex').slice(0, 20)}`, JSON.stringify({ v: FIA_VERSION, data: { updates: [{ team: 'Ferrari', n: 1, component: 'Floor', type: 'Performance', reason: 'Performance', geometry: 'New floor edge', description: 'Improves local load' }], noUpdates: [] } }));
  const asked = [];
  let fail = true;
  const translate = async (texts) => { asked.push(...texts); const out = Object.fromEntries(texts.map((t) => [t, `FR ${t}`])); if (fail) { fail = false; delete out['Improves local load']; } return out; };
  const now = Date.parse('2026-11-10T12:00:00Z');   // épreuve vieille de plus de 4 jours : relue seulement si une traduction manque
  await fiaNext(env, 2026, { now, fetchFn, translate });
  assert.deepEqual(asked, ['Floor', 'New floor edge', 'Improves local load']);
  await fiaNext(env, 2026, { now: now + 2 * 3600e3, fetchFn, translate });
  assert.deepEqual(asked.slice(3), ['Improves local load']);   // seule la traduction manquante est redemandée
  assert.equal(await fiaNext(env, 2026, { now: now + 4 * 3600e3, fetchFn, translate }), null);   // tout est traduit : plus relue
  assert.deepEqual(await fiaTranslations(env), { Floor: { t: 'FR Floor', q: 'cloud' }, 'New floor edge': { t: 'FR New floor edge', q: 'cloud' }, 'Improves local load': { t: 'FR Improves local load', q: 'cloud' } });
});

test('version web : lecteur de PDF changé, épreuves relues petit à petit, ancienne lecture montrée en attendant', async () => {
  const { fiaNext, seasonFiaWeb } = await import('../analytics/fia-tech.js');
  const { FIA_VERSION } = await import('../shared/fia-tech.js');
  const { createHash } = await import('node:crypto');
  const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 20);
  const rows = new Map();
  const DB = { prepare: (sql) => ({ bind: (...a) => ({
    first: async () => (rows.has(a[0]) ? { v: rows.get(a[0]) } : null),
    all: async () => ({ results: [...rows].filter(([k]) => k.startsWith(a[0])).map(([k, v]) => ({ k, v })) }),
    run: async () => { rows.set(a[0], a[1]); },
  }) }) };
  const env = { DB };
  const SEASON = '/documents/championships/fia-formula-one-world-championship-14/season/season-2026-2072';
  const names = ['Monaco Grand Prix', 'Spanish Grand Prix'];
  const ev = (n) => `${SEASON}/event/${encodeURIComponent(n)}`;
  const pages = {
    '/documents/championships/fia-formula-one-world-championship-14': `<option value="${SEASON}">2026</option>`,
    [SEASON]: names.map((n) => `<option value="${ev(n)}">${n}</option>`).join(''),
  };
  names.forEach((n, i) => {
    const file = `2026_${i}_-_cps`;
    pages[ev(n)] = row(5, 'Doc 5 - Car Presentation Submissions', file, '01.06.26 12:00');
    // PDF déjà lu par le nouveau lecteur ; épreuve lue par l'ancien (évolutions toutes à la même écurie)
    rows.set(`fiadoc:${sha(`https://www.fia.com/system/files/decision-document/${file}.pdf`)}`, JSON.stringify({ v: FIA_VERSION, data: { updates: [{ team: 'Mercedes', n: 1, component: 'Floor', type: 'Performance', reason: 'Local Load', geometry: '', description: '' }], noUpdates: [] } }));
    const page = `https://www.fia.com${ev(n)}`;
    rows.set(`fiatech:2026:${sha(page)}`, JSON.stringify({ v: FIA_VERSION - 1, page, at: 0, data: { name: n, page, first: 0, last: 0, tech: [{ team: 'Red Bull Racing', component: 'Floor' }], tr: { Floor: 'Fond plat' }, trDone: true } }));
  });
  const fetchFn = async (u) => { const p = u.replace('https://www.fia.com', ''); return p in pages ? new Response(pages[p]) : new Response('', { status: 404 }); };
  const now = Date.parse('2026-10-27T12:00:00Z');
  const translate = async () => assert.fail('traductions reprises de l\'ancienne lecture');

  const before = await seasonFiaWeb(env, 2026, { now });
  assert.equal(before.events.length, 2, 'ancienne lecture montrée');
  assert.equal(before.pending, true);
  assert.equal((await fiaNext(env, 2026, { now, fetchFn, translate })).event, 'Monaco Grand Prix');
  assert.equal(await fiaNext(env, 2026, { now: now + 6 * 60e3 - 2 * 60e3, fetchFn, translate }), null, 'pas plus d\'une toutes les 5 minutes');
  assert.equal((await fiaNext(env, 2026, { now: now + 6 * 60e3, fetchFn, translate })).event, 'Spanish Grand Prix');
  assert.equal(await fiaNext(env, 2026, { now: now + 20 * 60e3, fetchFn, translate }), null, 'tout est relu');
  const after = await seasonFiaWeb(env, 2026, { now: now + 20 * 60e3 });
  assert.equal(after.pending, false);
  assert.deepEqual(after.events.map((e) => e.tech[0].team), ['Mercedes', 'Mercedes']);
});
