import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';

// Mise à jour de l'appli de bureau (desktop/updater.cjs) avec des simulacres : Electron, GitHub et le
// téléchargement (fetch) ; rien ne part sur le réseau
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-updater-'));
const exe = path.join(dir, 'Paddock-Live-portable.exe');
fs.writeFileSync(exe, 'ancienne');
Object.assign(process.env, { PADDOCK_UPDATER_DEV: '1', PORTABLE_EXECUTABLE_FILE: exe, PADDOCK_DL_URL: '', PADDOCK_UPDATE_REPO: 'test/repo' });
const app = { getVersion: () => '1.30.0', isPackaged: false, getPath: () => dir, exit() {}, on() {} };
const load = Module._load;
Module._load = function (req, ...rest) {
  return req === 'electron' ? { app, BrowserWindow: { getAllWindows: () => [] } } : load.call(this, req, ...rest);
};
const updater = createRequire(import.meta.url)('../desktop/updater.cjs');

const sha = (buf) => `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`;
const files = new Map();     // adresse → contenu
let releases = [];           // versions publiées sur GitHub
let downloads = 0;
function publish(version, { size = 1000, digest, draft = false } = {}) {
  const buf = crypto.randomBytes(size);
  const url = `https://dl.example/${version}`;
  files.set(url, buf);
  releases.unshift({ tag_name: `v${version}`, draft, html_url: `https://gh.example/${version}`, body: '',
    assets: [{ name: `Paddock-Live-${version}-portable.exe`, size, browser_download_url: url, digest: digest ?? sha(buf) }] });
  return buf;
}
globalThis.fetch = async (url, { headers = {} } = {}) => {
  if (url.endsWith('/releases/latest')) return Response.json(releases.find((r) => !r.draft && !/-beta/.test(r.tag_name)));
  if (url.includes('/releases?')) return Response.json(releases);
  const buf = files.get(url);
  if (!buf) return new Response('absent', { status: 404 });
  downloads++;
  const range = /bytes=(\d+)-(\d+)/.exec(headers.Range || '');
  return range ? new Response(buf.subarray(+range[1], +range[2] + 1), { status: 206 }) : new Response(buf);
};
const reset = () => { Object.assign(updater.state, { status: 'idle', file: null, latest: null, error: null, beta: false }); releases = []; downloads = 0; };

test('mise à jour : téléchargée, vérifiée, puis pas retéléchargée', async () => {
  reset();
  const buf = publish('1.31.0');
  const st = await updater.check();
  assert.equal(st.status, 'ready');
  assert.equal(st.latest.version, '1.31.0');
  assert.deepEqual(fs.readFileSync(updater.state.file), buf);
  await updater.check();
  assert.equal(downloads, 1);
});

test('mise à jour : version plus récente sortie quand une autre attend, c\'est elle qui est installée', async () => {
  reset();
  publish('1.31.1');
  await updater.check();
  assert.match(path.basename(updater.state.file), /1\.31\.1/);
  const buf = publish('1.32.0');
  const st = await updater.check();
  assert.equal(st.status, 'ready');
  assert.equal(st.latest.version, '1.32.0');
  assert.match(path.basename(updater.state.file), /1\.32\.0/, 'annonce 1.32.0 et installe 1.32.0');
  assert.deepEqual(fs.readFileSync(updater.state.file), buf);
});

test('mise à jour : empreinte SHA-256 différente, fichier refusé et effacé', async () => {
  reset();
  publish('1.33.0', { digest: `sha256:${'0'.repeat(64)}` });
  const st = await updater.check();
  assert.equal(st.status, 'error');
  assert.match(st.error, /corrompu/);
  const left = fs.readdirSync(path.join(dir, 'updates')).filter((f) => f.includes('1.33.0'));
  assert.deepEqual(left, []);
});

test('mise à jour : gros fichier en plusieurs morceaux, empreinte vérifiée', async () => {
  reset();
  const buf = publish('1.34.0', { size: 9e6 });
  const st = await updater.check();
  assert.equal(st.status, 'ready');
  assert.ok(downloads >= 2, 'plusieurs morceaux');
  assert.deepEqual(fs.readFileSync(updater.state.file), buf);
});

test('mise à jour : choix de la version (à jour, bêtas seulement si inscrit)', async () => {
  reset();
  publish('1.29.0');
  assert.equal((await updater.check()).status, 'up-to-date');
  publish('1.35.0-beta.2');
  publish('1.35.0-beta.3', { draft: true });
  assert.equal((await updater.check()).status, 'up-to-date', 'bêta ignorée sans inscription');
  updater.state.beta = true;
  const st = await updater.check();
  assert.equal(st.latest.version, '1.35.0-beta.2', 'brouillon ignoré');
  assert.equal(st.status, 'ready');
});
