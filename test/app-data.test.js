import test from 'node:test';
import assert from 'node:assert/strict';
import { liveApi } from '../analytics/live-relay.js';

// Base du serveur (table studio) et cache du Worker en mémoire ; demandes sortantes simulées
function fakeEnv() {
  const rows = new Map();
  return {
    rows,
    DB: {
      prepare: (sql) => ({
        bind: (...a) => ({
          first: async () => (sql.startsWith('SELECT v FROM studio') && rows.has(a[0]) ? { v: rows.get(a[0]) } : null),
          run: async () => { if (sql.startsWith('INSERT INTO studio')) rows.set(a[0], a[1]); return {}; },
          all: async () => ({ results: [] }),
        }),
      }),
    },
  };
}
async function withNet(answer, fn) {
  const cache = new Map(), asked = [];
  const old = globalThis.fetch;
  globalThis.caches = { default: { match: async (r) => cache.get(r.url)?.clone() || null, put: async (r, res) => { cache.set(r.url, res); } } };
  globalThis.fetch = async (u) => { asked.push(String(u)); return answer(String(u)); };
  try { return await fn(asked); } finally { globalThis.fetch = old; delete globalThis.caches; }
}
const call = async (env, path) => {
  const url = new URL(`https://app.paddocklive.app${path}`);
  const r = await liveApi(new Request(url), url, env);
  return { status: r.status, type: r.headers.get('Content-Type'), body: r.headers.get('Content-Type')?.startsWith('application/json') ? await r.json() : await r.arrayBuffer() };
};

const FEED = `<rss><channel><item><title>Mexico City Grand Prix preview</title><link>https://press.pirelli.com/mexico/</link>
<pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>For the Mexico City Grand Prix, Pirelli has selected the C3, C4 and C5.</p>
<p>A one-stop strategy is expected to be the quickest.</p>]]></description></item></channel></rss>`;

test('serveur : pneus du week-end (choix et communiqués de Pirelli), même sans connexion F1 TV du créateur', async () => {
  const env = fakeEnv();
  await withNet((u) => (u.startsWith('https://press.pirelli.com/') ? new Response(FEED) : new Response('', { status: 404 })), async (asked) => {
    const q = new URLSearchParams({ path: '2026/2026-10-25_Mexico_City_Grand_Prix/2026-10-24_Qualifying/', until: Date.parse('2026-10-24T22:00:00Z'), name: 'Mexico City Grand Prix', location: 'Mexico City', country: 'Mexico', session: 'Qualifying' });
    const r = await call(env, `/live/api/tyres?${q}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.meeting.name, 'Mexico City Grand Prix');
    assert.deepEqual(r.body.nominations, { hard: 3, medium: 4, soft: 5, url: 'https://press.pirelli.com/the-compound-selection-for-austin-mexico-city-and-so-paulo/' });
    assert.equal(r.body.articles.length, 1);
    assert.deepEqual(r.body.articles[0].advice, ['A one-stop strategy is expected to be the quickest.']);
    assert.deepEqual(r.body.allocation, { HARD: 2, MEDIUM: 3, SOFT: 8 });
    assert.deepEqual(r.body.sessions, []);
    // Choix repéré dans le flux : gardé dans la base ; flux relu une seule fois (cache)
    assert.equal(JSON.parse(env.rows.get('pirelli:found'))[0].c.join(), '3,4,5');
    await call(env, `/live/api/tyres?${q}`);
    assert.equal(asked.filter((u) => u.includes('pirelli')).length, 1);
    assert.equal((await call(env, '/live/api/tyres?path=../x')).status, 400);
  });
});

test('serveur : records du circuit d\'après Jolpica, éditions passées gardées dans la base', async () => {
  const env = fakeEnv();
  const race = (y) => ({ MRData: { total: '1', RaceTable: { Races: [{ raceName: 'Monaco Grand Prix', Results: [{ Driver: { code: 'LEC' }, Constructor: { name: 'Ferrari' }, FastestLap: { lap: '50', Time: { time: `1:1${y - 2020}.000` } } }] }] } } });
  const quali = { MRData: { total: '1', RaceTable: { Races: [{ QualifyingResults: [{ position: '1', Q3: '1:10.270', Driver: { code: 'NOR' }, Constructor: { name: 'McLaren' } }] }] } } };
  await withNet((u) => new Response(JSON.stringify(u.includes('/qualifying') ? quali : race(Number(/f1\/(\d{4})/.exec(u)[1])))), async (asked) => {
    const r = await call(env, '/live/api/records?key=22&year=2026');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.editions.map((e) => e.year), [2025, 2024, 2023, 2022]);
    assert.equal(r.body.bestRaceLap.year, 2022);
    assert.equal(r.body.bestPole.tla, 'NOR');
    const n = asked.length;
    await call(env, '/live/api/records?key=22&year=2026');
    assert.equal(asked.length, n, 'éditions passées relues dans la base');
    assert.equal((await call(env, '/live/api/records?key=x&year=2026')).status, 400);
  });
});

test('serveur : météo, documents FIA du Grand Prix et photos des pilotes', async () => {
  const env = fakeEnv();
  const champ = '<option value="/documents/championships/fia-formula-one-world-championship-14/season/season-2026-2072">2026</option>'
    + '<option value="/documents/championships/fia-formula-one-world-championship-14/event/Mexican%20Grand%20Prix">Mexican Grand Prix</option>'
    + '<option value="/documents/championships/fia-formula-one-world-championship-14/event/Mexico%20City%20Grand%20Prix">Mexico City Grand Prix</option>';
  await withNet((u) => {
    if (u.startsWith('https://api.open-meteo.com/')) return new Response(JSON.stringify({ daily: { time: ['2026-10-25'], temperature_2m_max: [24] }, timezone: 'America/Mexico_City' }));
    if (u.endsWith('-14')) return new Response(champ);
    if (u.includes('/event/')) return new Response('<div>pas de document</div>');
    if (u.startsWith('https://media.formula1.com/')) return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { headers: { 'Content-Type': 'image/png' } });
    return new Response('', { status: 404 });
  }, async () => {
    const f = await call(env, '/live/api/forecast?lat=19.40&lon=-99.09');
    assert.equal(f.body.tz, 'America/Mexico_City');
    assert.equal(f.body.days[0].tmax, 24);
    assert.equal((await call(env, '/live/api/forecast?lat=a&lon=1')).status, 400);

    const d = await call(env, '/live/api/fia-docs?year=2026&name=Mexico%20City%20Grand%20Prix&location=Mexico%20City');
    assert.equal(d.body.event, 'Mexico City Grand Prix');
    assert.match(d.body.page, /\/event\/Mexico%20City%20Grand%20Prix$/);
    assert.deepEqual(d.body.docs, []);

    const h = await call(env, `/live/api/headshot?u=${encodeURIComponent('https://media.formula1.com/image/upload/x/lannor01right.webp')}`);
    assert.equal(h.status, 200);
    assert.equal(h.type, 'image/png');
    assert.equal((await call(env, `/live/api/headshot?u=${encodeURIComponent('https://evil.example/x.png')}`)).status, 400);
  });
});

test('serveur : composés Pirelli de chaque manche dans les statistiques de la Saison', async () => {
  const env = fakeEnv();
  const races = [{ round: 20, name: 'Mexico City Grand Prix', locality: 'Mexico City', circuit: 'Autódromo Hermanos Rodríguez', date: '2026-11-01' }, { round: 30, name: 'Grand Prix inconnu', locality: 'Nulle part', date: '2026-12-20' }];
  env.rows.set('season:2026', JSON.stringify({ at: Date.now(), v: { races } }));
  await withNet(() => new Response('', { status: 404 }), async () => {
    const r = await call(env, '/live/api/season/stats?year=2026');
    assert.deepEqual(Object.keys(r.body.tyres), ['20']);
    assert.equal(r.body.tyres[20].soft, 5);
  });
});
