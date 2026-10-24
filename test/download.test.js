import test from 'node:test';
import assert from 'node:assert/strict';
import { download, mirror, FILES } from '../analytics/download.js';

const names = ['Paddock-Live-1.27.19-x64-win.exe', 'Paddock-Live-1.27.19-portable.exe', 'Paddock-Live-1.27.19-mac-arm64.dmg', 'Paddock-Live-1.27.19-mac-arm64.zip', 'Paddock-Live-1.27.19-mac-x64.dmg', 'Paddock-Live-1.27.19-linux-x86_64.AppImage', 'Paddock-Live-1.27.19-linux-arm64.AppImage', 'Paddock-Live-1.27.19-linux-amd64.deb'];
const gh = async (url, opts) => {
  assert.equal(opts.redirect, 'manual');
  return { status: 302, headers: new Headers({ Location: 'https://github.com/benjamin-ct/paddock-live/releases/tag/v1.27.19' }) };
};

test('téléchargement : chaque système mène au bon fichier de la dernière version', async () => {
  for (const [os, file] of [['windows', 'x64-win.exe'], ['windows-portable', 'portable.exe'], ['mac-arm', 'mac-arm64.dmg'], ['mac-intel', 'mac-x64.dmg'], ['linux', 'x86_64.AppImage'], ['linux-arm', 'arm64.AppImage'], ['deb', 'amd64.deb']]) {
    const r = await download(`/download/${os}`, { fetchFn: gh, now: 1 });
    assert.equal(r.status, 302);
    assert.ok(r.headers.get('Location').endsWith(file), os);
    // Nom réel d'un fichier publié (liste de la version 1.27.19), servi par la copie sur Cloudflare
    assert.ok(names.some((n) => r.headers.get('Location') === `/dl/${n}`), os);
  }
  assert.equal(Object.keys(FILES).length, 7);
  const j = await (await download('/download/latest.json', { fetchFn: gh, now: 2 })).json();
  assert.equal(j.version, '1.27.19');
  assert.equal(j.files.windows, 'Paddock-Live-1.27.19-x64-win.exe');
  // Version copiée sur Cloudflare : sans demander à GitHub
  const env = { MEDIA: { get: async (k) => (k === 'releases/version' ? { text: async () => '1.27.51' } : null) } };
  const nope = async () => { throw new Error('GitHub ne doit pas être appelé'); };
  assert.equal((await download('/download/windows', { env, fetchFn: nope })).headers.get('Location'), '/dl/Paddock-Live-1.27.51-x64-win.exe');
  // Système inconnu : page des versions
  assert.match((await download('/download/amiga', { fetchFn: gh, now: 3 })).headers.get('Location'), /releases\/latest$/);
});

test('téléchargement : copie de la dernière version sur Cloudflare (morceaux acceptés), sinon GitHub', async () => {
  const data = new TextEncoder().encode('0123456789');
  const store = { 'releases/version': '1.27.19\n', 'releases/x64-win.exe': data };
  const MEDIA = {
    async get(key, { range } = {}) {
      const v = store[key];
      if (v == null) return null;
      if (typeof v === 'string') return { text: async () => v };
      // Partie comme R2 la décrit : { offset, length }, { offset } (jusqu'à la fin) ou { suffix }
      const m = range && /bytes=(\d*)-(\d*)/.exec(range.get('Range'));
      const r = !m ? null : !m[1] ? { suffix: +m[2] } : m[2] ? { offset: +m[1], length: +m[2] - +m[1] + 1 } : { offset: +m[1] };
      const from = r?.suffix != null ? v.length - r.suffix : r?.offset ?? 0;
      return { body: new Blob([v.slice(from, r?.length != null ? from + r.length : v.length)]).stream(), size: v.length, range: r, httpEtag: '"e"' };
    },
  };
  const env = { MEDIA };
  let r = await mirror(new Request('https://p.test/dl/Paddock-Live-1.27.19-x64-win.exe'), env, 'Paddock-Live-1.27.19-x64-win.exe');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '0123456789');
  assert.equal(r.headers.get('Accept-Ranges'), 'bytes');
  r = await mirror(new Request('https://p.test/dl/x', { headers: { Range: 'bytes=2-5' } }), env, 'Paddock-Live-1.27.19-x64-win.exe');
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('Content-Range'), 'bytes 2-5/10');
  assert.equal(await r.text(), '2345');
  // Jusqu'à la fin (« bytes=0- », lecteurs vidéo) et la fin seule
  r = await mirror(new Request('https://p.test/dl/x', { headers: { Range: 'bytes=3-' } }), env, 'Paddock-Live-1.27.19-x64-win.exe');
  assert.deepEqual([r.status, r.headers.get('Content-Range'), r.headers.get('Content-Length'), await r.text()], [206, 'bytes 3-9/10', '7', '3456789']);
  r = await mirror(new Request('https://p.test/dl/x', { headers: { Range: 'bytes=-4' } }), env, 'Paddock-Live-1.27.19-x64-win.exe');
  assert.deepEqual([r.status, r.headers.get('Content-Range'), r.headers.get('Content-Length'), await r.text()], [206, 'bytes 6-9/10', '4', '6789']);
  // Autre version que la copie, ou fichier absent : GitHub
  r = await mirror(new Request('https://p.test/dl/x'), env, 'Paddock-Live-1.27.18-x64-win.exe');
  assert.equal(r.headers.get('Location'), 'https://github.com/benjamin-ct/paddock-live/releases/download/v1.27.18/Paddock-Live-1.27.18-x64-win.exe');
  r = await mirror(new Request('https://p.test/dl/x'), env, 'Paddock-Live-1.27.19-mac-x64.dmg');
  assert.equal(r.status, 302);
  assert.equal((await mirror(new Request('https://p.test/dl/x'), {}, 'Paddock-Live-1.27.19-x64-win.exe')).status, 302);
  assert.equal((await mirror(new Request('https://p.test/dl/x'), env, '../secret')).status, 404);
});

test('téléchargements : comptés seulement sur un clic dans un navigateur', async () => {
  const { default: worker } = await import('../analytics/worker.js');
  const runs = [];
  const env = { MEDIA: { get: async () => ({ text: async () => '1.27.51' }) }, DB: { prepare: () => ({ bind: (...a) => ({ run: async () => { runs.push(a); return {}; } }) }) } };
  const ctx = { waitUntil: (p) => p };
  const ua = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0' };
  await worker.fetch(new Request('https://paddocklive.app/download/deb', { headers: ua }), env, ctx);
  await worker.fetch(new Request('https://paddocklive.app/download/deb', { headers: { ...ua, 'Sec-Fetch-User': '?1' } }), env, ctx);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(runs.map((a) => [a[1], a[2], a[4]]), [['download', 'deb', 'desktop']]);
});

test('nom de domaine : racine = site de l\'appli, www redirigé, workers.dev inchangé', async () => {
  const { default: worker } = await import('../analytics/worker.js');
  const env = { ASSETS: { fetch: async (req) => new Response(`site:${new URL(req.url).pathname}`) } };
  let r = await worker.fetch(new Request('https://paddocklive.app/'), env);
  assert.equal(await r.text(), 'site:/site/');
  r = await worker.fetch(new Request('https://www.paddocklive.app/legal/privacy?x=1'), env);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://paddocklive.app/legal/privacy?x=1');
  r = await worker.fetch(new Request('https://paddock-live-stats.paddock-live.workers.dev/'), env);
  assert.notEqual(await r.text(), 'site:/site/');
  // Nom court des liens suivis : hors liens, renvoi sur le site
  r = await worker.fetch(new Request('https://pdkl.app/download?x=1'), { ...env, SITE_ORIGIN: 'https://paddocklive.app' });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://paddocklive.app/download?x=1');
});

test('ancienne adresse workers.dev : connexion et statistiques renvoyées sur le nom de domaine, appels de l\'appli inchangés', async () => {
  const { default: worker } = await import('../analytics/worker.js');
  const env = { SITE_ORIGIN: 'https://paddocklive.app', STATS_KEY: 'k' };
  const W = 'https://paddock-live-stats.paddock-live.workers.dev';
  let r = await worker.fetch(new Request(`${W}/`), env);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'https://paddocklive.app/login');
  r = await worker.fetch(new Request(`${W}/stats?days=30`), env);
  assert.equal(r.headers.get('location'), 'https://paddocklive.app/stats?days=30');
  // Envoi des statistiques de l'appli : pas de redirection
  r = await worker.fetch(new Request(`${W}/e`, { method: 'POST', body: '{}' }), env);
  assert.notEqual(r.status, 302);
});

test('retour de la connexion Facebook : renvoyé vers l\'appli de bureau (port de « state »), rien d\'autre', async () => {
  const { default: worker } = await import('../analytics/worker.js');
  const state = `3000.${'a'.repeat(32)}`;
  let r = await worker.fetch(new Request(`https://paddocklive.app/fb-callback?code=abc&state=${state}&autre=x`), {});
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `http://127.0.0.1:3000/meta-callback/?code=abc&state=${state}`);
  for (const bad of ['evil.com', `80.${'a'.repeat(32)}`, `3000.${'a'.repeat(31)}`, '']) {
    r = await worker.fetch(new Request(`https://paddocklive.app/fb-callback?code=abc&state=${encodeURIComponent(bad)}`), {});
    assert.equal(r.status, 400);
  }
});
