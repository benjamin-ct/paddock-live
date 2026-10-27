import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker from '../analytics/worker.js';
import { transcribeRadio, isAudio, ASR_MODEL, ASR_FALLBACK } from '../analytics/transcribe.js';
import { createCloudTranscriber } from '../server/cloud-transcribe.js';

// Faux MP3 (en-tête ID3) de la taille voulue
const mp3 = (n = 2000, fill = 7) => { const b = new Uint8Array(n).fill(fill); b.set([0x49, 0x44, 0x33]); return b; };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// Base D1 et Workers AI simulés
function fakeEnv({ limit = 100, failTurbo = false } = {}) {
  const radios = new Map();
  const usage = new Map();
  const calls = [];
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async all() { return { results: [] }; },
    async first() {
      if (sql.includes('radio_texts')) return radios.get(args[0]) || null;
      return usage.has(args[0]) ? { n: usage.get(args[0]) } : null;
    },
    async run() {
      if (sql.includes('radio_texts')) radios.set(args[0], { text: args[1], d: args[2] });
      else { const v = (usage.get(args[0]) || 0) + args[1]; if (v > args[2]) return { meta: { changes: 0 } }; usage.set(args[0], v); return { meta: { changes: 1 } }; }
    },
  });
  return {
    radios, usage, calls,
    env: {
      ASR_DAILY_LIMIT: String(limit),
      DB: { prepare: (sql) => stmt(sql) },
      AI: {
        async run(model, input) {
          calls.push({ model, input });
          if (model === ASR_MODEL) {
            if (failTurbo) throw new Error('indisponible');
            assert.equal(typeof input.audio, 'string');   // son envoyé en base64
            assert.equal(input.language, 'en');
            return { text: ' Box, box. (static) ', transcription_info: { duration: 4.26 } };
          }
          assert.equal(model, ASR_FALLBACK);
          assert.ok(Array.isArray(input.audio));
          return { text: 'Copy that.' };
        },
      },
    },
  };
}

test('transcription partagée : fichiers son reconnus', () => {
  assert.equal(isAudio(mp3()), true);
  const frame = new Uint8Array(1000); frame.set([0xff, 0xfb]);
  assert.equal(isAudio(frame), true);
  const m4a = new Uint8Array(1000); m4a.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70], 0);
  assert.equal(isAudio(m4a), true);
  assert.equal(isAudio(new TextEncoder().encode('<html>'.repeat(200))), false);
  assert.equal(isAudio(mp3(100)), false);
});

test('transcription partagée : une seule fois pour tous, texte nettoyé, plafond du jour', async () => {
  const { env, calls, usage } = fakeEnv({ limit: 2 });
  const a = await transcribeRadio(env, mp3(), '2026-10-15');
  assert.equal(a.text, 'Box, box.');
  assert.equal(a.d, 4.3);
  const again = await transcribeRadio(env, mp3(), '2026-10-15');
  assert.equal(again.cached, true);
  assert.equal(again.text, 'Box, box.');
  assert.equal(calls.length, 1);
  assert.equal(usage.get('radio:2026-10-15'), 1);
  await transcribeRadio(env, mp3(2000, 8), '2026-10-15');
  assert.deepEqual(await transcribeRadio(env, mp3(2000, 9), '2026-10-15'), { limited: true });
  assert.deepEqual(await transcribeRadio(env, new Uint8Array(2000), '2026-10-15'), { invalid: true });
});

test('transcription partagée : un long fichier son compte pour une radio par tranche de 30 s', async () => {
  const { env, usage } = fakeEnv({ limit: 100 });
  const run = env.AI.run;
  env.AI.run = async (model, input) => ({ ...(await run(model, input)), transcription_info: { duration: 35 * 60 } });   // MP3 de 35 min
  await transcribeRadio(env, mp3(2000, 40), '2026-10-15', '203.0.113.7');
  assert.equal(usage.get('radio:2026-10-15'), 70);
  assert.equal(usage.get('2026-10-15|203.0.113.7|radio:2026-10-15'), 70);   // sa part du jour (25) est dépassée
  assert.deepEqual(await transcribeRadio(env, mp3(2000, 41), '2026-10-15', '203.0.113.7'), { limited: true });
});

test('transcription partagée : une seule adresse ne prend qu\'un quart du plafond du jour', async () => {
  const { env, usage } = fakeEnv({ limit: 8 });
  for (let i = 0; i < 2; i++) assert.equal((await transcribeRadio(env, mp3(2000, 20 + i), '2026-10-15', '203.0.113.7')).text, 'Box, box.');
  assert.deepEqual(await transcribeRadio(env, mp3(2000, 30), '2026-10-15', '203.0.113.7'), { limited: true });
  assert.equal((await transcribeRadio(env, mp3(2000, 31), '2026-10-15', '198.51.100.2')).text, 'Box, box.', 'les autres adresses continuent');
  assert.equal(usage.get('radio:2026-10-15'), 3);
  assert.equal(usage.get('2026-10-15|203.0.113.7|radio:2026-10-15'), 2);
});

test('transcription partagée : modèle de secours si Whisper turbo échoue', async () => {
  const { env, calls } = fakeEnv({ failTurbo: true });
  const r = await transcribeRadio(env, mp3());
  assert.equal(r.text, 'Copy that.');
  assert.deepEqual(calls.map((c) => c.model), [ASR_MODEL, ASR_FALLBACK]);
});

test('transcription partagée : routes du Worker', async () => {
  const { env } = fakeEnv();
  const base = 'https://stats.example';
  const audio = mp3();
  const miss = await worker.fetch(new Request(`${base}/r/${sha(audio)}`), env);
  assert.equal(miss.status, 404);
  const post = await worker.fetch(new Request(`${base}/r`, { method: 'POST', body: audio }), env);
  assert.equal(post.status, 200);
  assert.equal((await post.json()).text, 'Box, box.');
  const hit = await worker.fetch(new Request(`${base}/r/${sha(audio)}`), env);
  assert.deepEqual(await hit.json(), { text: 'Box, box.', d: 4.3 });
  const bad = await worker.fetch(new Request(`${base}/r`, { method: 'POST', body: 'pas du son'.repeat(100) }), env);
  assert.equal(bad.status, 400);
  const off = await worker.fetch(new Request(`${base}/r/${sha(audio)}`), { ...env, AI: undefined });
  assert.equal(off.status, 503);
});

test('transcription en ligne côté appli : empreinte demandée, puis son envoyé, mémoire et pause', async () => {
  const audio = Buffer.from(mp3());
  const seen = [];
  let t = 0;
  let reply = (url, opts) => (opts.method === 'POST'
    ? { status: 200, body: Buffer.from(JSON.stringify({ text: 'Box, box.', d: 4.3 })) }
    : { status: 404, body: Buffer.from('{}') });
  const c = createCloudTranscriber({
    url: 'https://w.example/r',
    audio: async () => audio,
    fetch: async (url, opts = {}) => { seen.push([opts.method || 'GET', url]); return reply(url, opts); },
    now: () => t,
  });
  const [a, b] = await Promise.all([c.transcribe('2026/x/TeamRadio/A.mp3'), c.transcribe('2026/x/TeamRadio/A.mp3')]);
  assert.deepEqual(a, { text: 'Box, box.', d: 4.3 });
  assert.equal(b, a);
  assert.deepEqual(seen, [['GET', `https://w.example/r/${sha(audio)}`], ['POST', 'https://w.example/r']]);
  // Déjà connue : rien n'est redemandé
  assert.deepEqual(await c.transcribe('2026/x/TeamRadio/A.mp3'), a);
  assert.equal(seen.length, 2);
  // Lecture de l'empreinte ratée : le son est envoyé quand même
  reply = (url, opts) => (opts.method === 'POST' ? { status: 200, body: Buffer.from('{"text":""}') } : { status: 500, body: Buffer.from('{}') });
  assert.deepEqual(await c.transcribe('2026/x/TeamRadio/D.mp3'), { text: '' });
  assert.equal(c.available(), true);
  // Plafond atteint : pause de 10 minutes, l'ordinateur prend le relais
  reply = () => ({ status: 429, body: Buffer.from('{}') });
  assert.equal(await c.transcribe('2026/x/TeamRadio/B.mp3'), null);
  assert.equal(c.available(), false);
  t += 10 * 60e3;
  assert.equal(c.available(), true);
});

test('transcription en ligne côté appli : erreur d\'archive remontée', async () => {
  const c = createCloudTranscriber({ url: 'https://w.example/r', audio: async () => { const e = new Error('absent'); e.status = 404; throw e; }, fetch: async () => assert.fail('pas d\'appel') });
  await assert.rejects(c.transcribe('2026/x/TeamRadio/C.mp3'), /absent/);
  assert.equal(c.available(), true);
});

test('caméras embarquées : fenêtre WAV retranscrite par le serveur avec l\'heure de chaque phrase, plafond du jour', async () => {
  const { transcribeWindow } = await import('../analytics/transcribe.js');
  const wav = (n = 32000) => { const b = new Uint8Array(44 + n); b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0); b.set([...'WAVE'].map((c) => c.charCodeAt(0)), 8); return b; };
  const usage = new Map();
  const env = {
    ONBOARD_DAILY_LIMIT: '1',
    DB: { prepare: () => ({ bind: (...a) => ({ first: async () => null, all: async () => ({ results: [] }), run: async () => { const v = (usage.get(a[0]) || 0) + a[1]; if (v > a[2]) return { meta: { changes: 0 } }; usage.set(a[0], v); return { meta: { changes: 1 } }; } }) }) },
    AI: { run: async (model, input) => {
      assert.equal(model, ASR_MODEL);
      assert.equal(typeof input.audio, 'string');
      return { text: 'Box box. Copy.', segments: [{ start: 1.2, end: 2.5, text: ' Box box.' }, { start: 4, end: 4.8, text: ' Copy.' }] };
    } },
  };
  assert.deepEqual(await transcribeWindow(env, wav(), '2026-10-30'), { segments: [{ timestamp: [1.2, 2.5], text: ' Box box.' }, { timestamp: [4, 4.8], text: ' Copy.' }] });
  assert.deepEqual(await transcribeWindow(env, wav(), '2026-10-30'), { limited: true });
  assert.deepEqual(await transcribeWindow(env, mp3(), '2026-10-30'), { invalid: true });
});
