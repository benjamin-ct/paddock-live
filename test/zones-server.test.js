import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { computeZones, zonesWeb } from '../analytics/zones.js';

// Circuit « stade » (voir zones.test.js) et séance simulée : 4 voitures, GPS et télémétrie toutes les 250 ms
function stadium() {
  const pts = [];
  const R = 2000, S = 10000;
  for (let x = 0; x < S; x += 100) pts.push([x, 0]);
  for (let a = -Math.PI / 2; a < Math.PI / 2; a += 100 / R) pts.push([S + R * Math.cos(a), R + R * Math.sin(a)]);
  for (let x = S; x > 0; x -= 100) pts.push([x, 2 * R]);
  for (let a = Math.PI / 2; a < 1.5 * Math.PI; a += 100 / R) pts.push([R * Math.cos(a), R + R * Math.sin(a)]);
  return { x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), rotation: 0, meetingName: 'Stadium Grand Prix', location: 'Ville', countryName: 'Pays' };
}
const stamp = (ms) => `${String(Math.floor(ms / 3600e3)).padStart(2, '0')}:${String(Math.floor(ms / 60e3) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1e3) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
const z = (o) => JSON.stringify(zlib.deflateRawSync(Buffer.from(JSON.stringify(o))).toString('base64'));

function session() {
  const raw = stadium();
  const pts = raw.x.map((x, i) => ({ x, y: raw.y[i] }));
  const t0 = Date.parse('2026-05-01T12:00:00Z');
  const steps = [];   // par pas de 250 ms : [{ t, c, x, y, v, throttle }] des 4 voitures
  for (let c = 1; c <= 4; c++) {
    let i = c * 7, frac = 0, t = t0 + c * 333;
    for (let step = 0; step < 4000; step++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const curve = Math.abs(a.y - b.y) > 1;
      const v = curve ? 150 : 300;
      (steps[step] ||= []).push({ t, c, x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac, v, throttle: curve ? 40 : 100 });
      frac += ((v / 3.6) * 0.25 * 10) / Math.hypot(b.x - a.x, b.y - a.y);
      while (frac >= 1) { frac -= 1; i = (i + 1) % pts.length; }
      t += 250;
    }
  }
  // Une ligne par seconde (4 pas), comme les archives : plusieurs instantanés par message
  const pos = [], car = [];
  for (let k = 0; k < steps.length; k += 4) {
    const group = steps.slice(k, k + 4).flat();
    const off = stamp(group[0].t - t0);
    pos.push(`${off}${z({ Position: group.map((s) => ({ Timestamp: new Date(s.t).toISOString(), Entries: { [s.c]: { Status: 'OnTrack', X: s.x, Y: s.y, Z: Math.round(s.y / 100) } } })) })}`);
    car.push(`${off}${z({ Entries: group.map((s) => ({ Utc: new Date(s.t).toISOString(), Cars: { [s.c]: { Channels: { 0: 11000, 2: s.v, 3: 7, 4: s.throttle, 5: 0 } } } })) })}`);
  }
  const file = (list) => `\uFEFF${list.join('\r\n')}\r\n`;
  return { raw, position: file(pos), carData: file(car) };
}

test('serveur : zones du circuit calculées d\'après une séance archivée lue au fil de l\'eau, gardées dans la base', async () => {
  const { raw, position, carData } = session();
  const path = '2026/2026-05-03_Stadium_Grand_Prix/2026-05-02_Qualifying/';
  const index = { Meetings: [{ Name: 'Stadium Grand Prix', Circuit: { Key: 999 }, Sessions: [{ Name: 'Qualifying', Type: 'Qualifying', Path: path, StartDate: '2026-05-02T15:00:00', GmtOffset: '00:00:00' }] }] };
  const asked = [];
  const fetchFn = async (u, opts) => {
    asked.push(u);
    if (u.includes('multiviewer')) return new Response(JSON.stringify(raw));
    if (u.endsWith('2026/Index.json')) return new Response(JSON.stringify(index));
    if (u.endsWith('Position.z.jsonStream')) return new Response(position);
    if (u.endsWith('CarData.z.jsonStream')) return new Response(carData);
    if (u.endsWith('Heartbeat.jsonStream') || u.endsWith('TimingData.jsonStream')) return new Response('');
    if (u.startsWith('https://livetiming')) { assert.equal(opts.headers.Authorization, 'Bearer jeton'); return new Response('', { status: 404 }); }
    return new Response('', { status: 404 });
  };
  const cache = new Map();
  globalThis.caches = { default: { match: async (r) => cache.get(r.url)?.clone() || null, put: async (r, res) => { cache.set(r.url, res); } } };
  try {
    const res = await computeZones({}, 999, 2026, { now: Date.parse('2026-05-10T00:00:00Z'), fetchFn, token: 'jeton' });
    assert.ok(res.zones, res.error);
    assert.equal(res.zones.zones.length, 2);
    assert.equal(res.zones.session, path);
    assert.equal(res.loops, null);   // pas de chronométrage dans cette séance simulée
    assert.ok(asked.some((u) => u.endsWith('CarData.z.jsonStream')));
    // Altitude : z de chaque point du tracé (ici Z = y / 100 : 0 sur la ligne droite du bas, 40 sur celle du haut)
    assert.equal(res.elevation.n, raw.x.length);
    assert.equal(res.elevation.z.length, raw.x.length);
    assert.equal(res.elevation.session, path);
    assert.ok(Math.abs(res.elevation.z[30] - 0) <= 1 && Math.abs(res.elevation.z[raw.x.length - 140] - 40) <= 1, `${res.elevation.z[30]} ${res.elevation.z.at(-140)}`);

    // Zones et altitude déjà gardées : seules les boucles sont recherchées (ni télémétrie ni plan FIA relus)
    asked.length = 0;
    const again = await computeZones({}, 999, 2026, { now: Date.parse('2026-05-10T00:00:00Z'), fetchFn, token: 'jeton', keep: { zones: res.zones, elevation: res.elevation } });
    assert.equal(again.zones, res.zones);
    assert.equal(again.elevation, res.elevation);
    assert.ok(!asked.some((u) => u.endsWith('CarData.z.jsonStream')), 'télémétrie pas relue');
    assert.ok(asked.some((u) => u.endsWith('TimingData.jsonStream')), 'chronométrage relu (boucles)');
    // Altitude seule à calculer : le GPS seulement
    asked.length = 0;
    const elev = await computeZones({}, 999, 2026, { now: Date.parse('2026-05-10T00:00:00Z'), fetchFn, token: 'jeton', keep: { zones: res.zones, loops: { segs: {} } } });
    assert.deepEqual(elev.elevation, res.elevation);
    assert.equal(elev.error, undefined);
    const files = asked.filter((u) => u.startsWith('https://livetiming') && !u.endsWith('Index.json')).map((u) => u.split('/').pop());
    assert.deepEqual(files, ['Position.z.jsonStream']);

    // Route : résultat gardé servi ; calcul demandé à la tâche planifiée quand il manque
    const rows = new Map([['zones:999:2026', JSON.stringify(res)]]);
    const env = { DB: { prepare: (sql) => ({ bind: (...a) => ({ first: async () => (rows.has(a[0]) ? { v: rows.get(a[0]) } : null), run: async () => { rows.set(a[0], a[1]); return {}; } }) }) } };
    const now = Date.parse('2026-05-10T07:00:00Z');   // 7 h plus tard : boucles absentes, nouvel essai
    assert.equal((await zonesWeb(env, 'zones', 999, 2026, now)).zones.length, 2);
    assert.equal(rows.has('zoneswant:999:2026'), true, 'boucles absentes : nouveau calcul plus tard');
    assert.equal((await zonesWeb(env, 'elevation', 999, 2026, now)).n, raw.x.length);
    assert.equal(await zonesWeb(env, 'loops', 22, 2026, now), null);
    assert.equal(rows.get('zoneswant:22:2026'), String(now));
  } finally {
    delete globalThis.caches;
  }
});

test('serveur : tâche planifiée des zones, un circuit demandé à la fois, échec noté et revu plus tard', async () => {
  const { zonesTick } = await import('../analytics/zones.js');
  const now = Date.parse('2026-10-27T12:00:00Z');
  const rows = new Map([['zoneswant:999:2026', String(now - 60e3)], ['season:2026', JSON.stringify({ at: now, v: { races: [] } })]]);
  const env = {
    STATS_KEY: 'cle',
    DB: { prepare: (sql) => ({ bind: (...a) => ({
      first: async () => (rows.has(a[0]) ? { v: rows.get(a[0]) } : null),
      run: async () => { rows.set(a[0], a[1]); return {}; },
      all: async () => ({ results: [...rows].filter(([k]) => k.startsWith('zoneswant:')).map(([k, v]) => ({ k, v })) }),
    }) }) },
  };
  const cache = new Map();
  globalThis.caches = { default: { match: async (r) => cache.get(r.url)?.clone() || null, put: async (r, res) => { cache.set(r.url, res); } } };
  try {
    const fetchFn = async (u) => (u.includes('multiviewer') ? new Response(JSON.stringify(stadium())) : new Response('', { status: 404 }));
    const r = await zonesTick(env, { now, fetchFn });
    assert.deepEqual(r, { key: 999, year: 2026, zones: false, loops: false, elevation: false, error: 'connexion F1 TV absente ou expirée' });
    assert.equal(JSON.parse(rows.get('zones:999:2026')).at, now);
    assert.equal(rows.get('zoneswant:999:2026'), '0');
    assert.equal(await zonesTick(env, { now: now + 60e3, fetchFn }), null, 'rien d\'autre à calculer');
  } finally {
    delete globalThis.caches;
  }
});
