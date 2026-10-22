import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postProblems, problemText } from '../shared/post-check.js';

test('avant publication : textes trop longs bloqués, visuels en trop signalés', () => {
  const texts = { x: `${'a'.repeat(256)} https://example.com/un/lien/tres/long/qui/compte/pour/23`, bluesky: '🏎️'.repeat(300), threads: 'b'.repeat(501), instagram: 'ok' };
  assert.deepEqual(postProblems(['x', 'bluesky', 'instagram'], (n) => texts[n], 10), []);
  const p = postProblems(['threads', 'instagram', 'x'], (n) => texts[n], 12);
  assert.deepEqual(p.map((x) => problemText(x)), ['Texte Threads trop long : 501 caractères pour 500 au plus', 'Instagram : 12 visuels, seuls les 10 premiers seront publiés']);
  assert.equal(p.filter((x) => x.block).length, 1);
  assert.deepEqual(postProblems(['bluesky'], () => '🏎️'.repeat(301)).map((x) => x.vals), [['Bluesky', 301, 300]]);
  assert.deepEqual(postProblems(['tiktok', 'instagram-story'], () => 'x'.repeat(9999), 30), []);
});
