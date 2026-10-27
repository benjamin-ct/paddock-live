import test from 'node:test';
import assert from 'node:assert/strict';

test('transcription par le serveur : une erreur passagère (502) met en pause, la radio n\'est pas notée sans parole', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'archive F1 lente' }), { status: 502 });
  try {
    const { cloudTranscribe, cloudAsrOn } = await import('../public/js/cloud.js');
    assert.equal(await cloudTranscribe('https://livetiming.formula1.com/static/x.mp3'), null);
    assert.equal(cloudAsrOn(), false);   // l'appli attend et réessaie plus tard (pas de texte vide gardé)
  } finally { globalThis.fetch = real; }
});
