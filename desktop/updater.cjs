// Mise à jour automatique de l'application (Windows, Linux AppImage, macOS).
// Fichiers copiés sur Cloudflare (paddocklive.app/dl/…, GitHub en secours), en plusieurs morceaux à la fois.
// Les versions sont lues sur les Releases du dépôt public (package.json → paddockLive.updateRepo),
// téléchargées en arrière-plan, vérifiées (empreinte SHA-256 fournie par GitHub), puis installées :
// - Windows, installateur : exécution silencieuse du nouvel installateur, puis relance de l'appli ;
// - Windows portable / Linux AppImage : remplacement du fichier (l'ancien est renommé puis
//   supprimé au démarrage suivant) ;
// - macOS : l'archive .zip est décompressée à la place de « Paddock Live.app » une fois l'appli fermée.
// Paquet .deb (Linux) : pas de mise à jour automatique (installer le nouveau paquet).
// Au lancement (startup), l'écran de démarrage vérifie s'il existe une nouvelle version et
// l'installe avant d'ouvrir l'appli ; sans connexion ou en cas d'échec, l'appli s'ouvre quand même.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const pkg = require('./package.json');
const { newer } = require('./version.cjs');
const REPO = process.env.PADDOCK_UPDATE_REPO || pkg.paddockLive?.updateRepo || 'benjamin-ct/paddock-live';
const CHECK_EVERY_MS = 6 * 3600 * 1000;
const CHECK_TIMEOUT_MS = 10000;     // réponse de GitHub
const STALL_TIMEOUT_MS = 30000;     // téléchargement sans aucune donnée reçue
const PARTS = 6;                     // morceaux téléchargés en même temps
// Copie des fichiers sur Cloudflare (serveur Paddock Live), bien plus rapide en Europe ; GitHub en secours
const MIRROR = process.env.PADDOCK_DL_URL ?? 'https://paddocklive.app/dl/';

// Bundle « Paddock Live.app » de l'appli macOS, s'il peut être remplacé (pas lancé depuis l'image disque)
// macOS lance une appli non signée par Apple et encore « en quarantaine » depuis une copie temporaire
// en lecture seule (App Translocation) : on remplace alors l'appli installée dans Applications. Le
// script d'installation retire la quarantaine, les lancements suivants se font depuis Applications.
function macBundle() {
  if (process.platform !== 'darwin') return null;
  let bundle = path.resolve(path.dirname(process.execPath), '..', '..');
  if (!bundle.endsWith('.app') || bundle.startsWith('/Volumes/')) return null;
  if (bundle.includes('/AppTranslocation/')) {
    const name = path.basename(bundle);
    bundle = [path.join('/Applications', name), path.join(app.getPath('home'), 'Applications', name)].find((b) => fs.existsSync(b));
    if (!bundle) return null;
  }
  try { fs.accessSync(path.dirname(bundle), fs.constants.W_OK); return bundle; } catch { return null; }
}

function detectKind() {
  // Appli lancée depuis les sources (développement) : rien à remplacer
  if (!app.isPackaged && !process.env.PADDOCK_UPDATER_DEV) return 'unsupported';
  if (process.env.PORTABLE_EXECUTABLE_FILE) return 'portable';
  if (process.platform === 'win32') return 'installer';
  if (process.platform === 'linux' && process.env.APPIMAGE) return 'appimage';
  if (macBundle()) return 'mac';
  return 'unsupported';
}

const state = {
  current: app.getVersion(),
  kind: detectKind(),
  status: 'idle', // idle | checking | up-to-date | downloading | ready | error | unsupported
  latest: null,
  progress: 0,
  error: null,
  file: null,
  checkedAt: null,
  auto: true,
  // Versions bêta (pré-versions GitHub) : seulement pour qui s'y inscrit ; d'office si une bêta est installée
  beta: /-beta\./.test(app.getVersion()),
};

let settingsFile = null;
// Dernière installation lancée au démarrage ({ version }) : si l'appli redémarre sans avoir
// changé de version, l'installation a échoué et on ne bloque pas l'ouverture une seconde fois.
let installTry = null;
// « Plus tard » sur l'écran de démarrage : la version téléchargée s'installe à la fermeture de l'appli
let deferred = false;
const defer = () => { deferred = true; };

function loadSettings() {
  try {
    const st = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    state.auto = st.auto !== false;
    if (typeof st.beta === 'boolean') state.beta = st.beta;
    installTry = st.installTry || null;
  } catch { /* défaut */ }
}

function saveSettings() {
  try { fs.writeFileSync(settingsFile, JSON.stringify({ auto: state.auto, beta: state.beta, installTry })); } catch { /* ignore */ }
}

const listeners = new Set();

function broadcast() {
  const payload = publicState();
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('update-state', payload);
  }
  for (const fn of listeners) fn(payload);
}

function publicState() {
  const { file, ...rest } = state;
  return { ...rest, repo: REPO };
}

function set(patch) {
  Object.assign(state, patch);
  broadcast();
}

// Dernière version à proposer : la dernière publiée pour tous, ou, inscrit aux bêtas, la plus récente des
// versions (pré-versions comprises). null si aucune
const GH = { Accept: 'application/vnd.github+json', 'User-Agent': 'Paddock-Live-updater' };
async function latestRelease() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases${state.beta ? '?per_page=15' : '/latest'}`, { headers: GH, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
  if (res.status === 404) throw new Error(`Aucune version publiée sur ${REPO}`);
  if (!res.ok) throw new Error(`GitHub a répondu ${res.status}`);
  const data = await res.json();
  if (!state.beta) return data;
  const tag = (r) => String(r.tag_name || '').replace(/^v/, '');
  return data.filter((r) => !r.draft && /^\d+\.\d+\.\d+(-beta\.\d+)?$/.test(tag(r))).reduce((best, r) => (!best || newer(tag(r), tag(best)) ? r : best), null);
}

function pickAsset(release) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const re = {
    portable: /-portable\.exe$/i,
    installer: /-x64-win\.exe$/i,
    appimage: new RegExp(`-linux-${arch === 'x64' ? 'x86_64' : arch}\\.AppImage$`, 'i'),
    mac: new RegExp(`-mac-${arch}\\.zip$`, 'i'),
  }[state.kind];
  return re && (release.assets || []).find((a) => re.test(a.name));
}

// Fichier exécutable remplacé sur place : .exe portable (Windows) ou AppImage (Linux)
const selfFile = () => process.env.PORTABLE_EXECUTABLE_FILE || process.env.APPIMAGE;

async function download(asset, dest) {
  const ctrl = new AbortController();
  const tmp = `${dest}.part`;
  try {
    await fetchTo(asset, tmp, ctrl);
    fs.renameSync(tmp, dest);
  } catch (err) {
    ctrl.abort();
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

// Attend une promesse au plus ms millisecondes (connexion coupée ou bloquée)
function within(promise, ms, ctrl) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => { ctrl.abort(); reject(new Error('Téléchargement interrompu (connexion trop lente ou coupée)')); }, ms); }),
  ]).finally(() => clearTimeout(t));
}

// Fichier en plusieurs morceaux à la fois : les serveurs de GitHub sont aux États-Unis et le débit d'une
// seule connexion depuis l'Europe est limité. Faux si le serveur ne découpe pas (un seul flux alors).
async function fetchParts(asset, tmp, ctrl) {
  const total = asset.size;
  const size = Math.ceil(total / PARTS);
  const pc = new AbortController();
  const stop = () => pc.abort();
  ctrl.signal.addEventListener('abort', stop);
  const fd = await fs.promises.open(tmp, 'w');
  const got = new Array(PARTS).fill(0);
  let lastBroadcast = 0;
  try {
    await Promise.all(got.map(async (_, i) => {
      const start = i * size;
      const end = Math.min(total, start + size) - 1;
      const res = await within(fetch(asset.browser_download_url, { headers: { 'User-Agent': 'Paddock-Live-updater', Range: `bytes=${start}-${end}` }, signal: pc.signal }), STALL_TIMEOUT_MS, pc);
      if (res.status !== 206 || !res.body) throw Object.assign(new Error('Pas de téléchargement par morceaux'), { noRange: true });
      const reader = res.body.getReader();
      let pos = start;
      try {
        while (pos <= end) {
          const { done, value } = await within(reader.read(), STALL_TIMEOUT_MS, pc);
          if (done) break;
          const n = Math.min(value.length, end + 1 - pos);
          await fd.write(value, 0, n, pos);
          pos += n;
          got[i] += n;
          if (Date.now() - lastBroadcast > 300) {
            lastBroadcast = Date.now();
            set({ progress: Math.min(1, got.reduce((a, b) => a + b, 0) / total) });
          }
        }
      } finally { reader.cancel().catch(() => {}); }
      if (pos <= end) throw new Error('Téléchargement incomplet');
    }));
  } catch (err) {
    pc.abort();
    throw err;
  } finally {
    ctrl.signal.removeEventListener('abort', stop);
    await fd.close();
  }
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(tmp)) hash.update(chunk);
  return `sha256:${hash.digest('hex')}`;
}

// Copie sur Cloudflare d'abord, fichier de GitHub si elle échoue (absente, coupée, empreinte différente)
async function fetchTo(asset, tmp, ctrl) {
  const urls = [MIRROR && `${MIRROR}${encodeURIComponent(asset.name)}`, asset.browser_download_url].filter(Boolean);
  for (let i = 0; ; i++) {
    const ac = new AbortController();
    const stop = () => ac.abort();
    ctrl.signal.addEventListener('abort', stop);
    try {
      return await fetchFrom({ ...asset, browser_download_url: urls[i], url: i === urls.length - 1 ? asset.url : null }, tmp, ac);
    } catch (err) {
      if (ctrl.signal.aborted || i === urls.length - 1) throw err;
    } finally { ctrl.signal.removeEventListener('abort', stop); }
  }
}

async function fetchFrom(asset, tmp, ctrl) {
  if (asset.size > 8e6 && asset.browser_download_url) {
    const digest = await fetchParts(asset, tmp, ctrl).catch((err) => { if (!err.noRange) throw err; return null; });
    if (digest) {
      if (asset.digest && asset.digest !== digest) throw new Error('Fichier téléchargé corrompu (empreinte SHA-256 différente)');
      return;
    }
  }
  // Lien public direct, sinon l'API GitHub (qui redirige vers le même fichier).
  const get = (url, headers) => within(fetch(url, { headers: { 'User-Agent': 'Paddock-Live-updater', ...headers }, signal: ctrl.signal }), STALL_TIMEOUT_MS, ctrl);
  let res = await get(asset.browser_download_url);
  if (!res.ok && asset.url) res = await get(asset.url, { Accept: 'application/octet-stream' });
  if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || asset.size || 0;
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  let received = 0;
  let lastBroadcast = 0;
  try {
    for (;;) {
      const { done, value } = await within(reader.read(), STALL_TIMEOUT_MS, ctrl);
      if (done) break;
      hash.update(value);
      received += value.length;
      if (!out.write(value)) await new Promise((r) => out.once('drain', r));
      if (total && Date.now() - lastBroadcast > 300) {
        lastBroadcast = Date.now();
        set({ progress: Math.min(1, received / total) });
      }
      // Taille annoncée atteinte : terminé, même si la connexion ne se ferme pas
      if (total && received >= total) break;
    }
  } finally {
    reader.cancel().catch(() => {});
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  }
  if (total && received < total) throw new Error('Téléchargement incomplet');
  const digest = `sha256:${hash.digest('hex')}`;
  if (asset.digest && asset.digest !== digest) throw new Error('Fichier téléchargé corrompu (empreinte SHA-256 différente)');
}

let running = null;

async function check({ manual = false } = {}) {
  if (state.kind === 'unsupported') { set({ status: 'unsupported' }); return publicState(); }
  if (running) return running;
  running = (async () => {
    set({ status: state.status === 'ready' ? 'ready' : 'checking', error: null });
    try {
      const release = await latestRelease();
      if (!release) throw new Error(`Aucune version publiée sur ${REPO}`);
      const version = String(release.tag_name || '').replace(/^v/, '');
      set({ checkedAt: Date.now(), latest: { version, notes: release.body || '', url: release.html_url } });
      if (!newer(version, state.current)) { set({ status: 'up-to-date' }); return; }
      if (state.status === 'ready' && state.latest?.version === version && state.file) return;
      const asset = pickAsset(release);
      if (!asset) throw new Error('Fichier de mise à jour introuvable dans la version publiée');
      if (!state.auto && !manual) { set({ status: 'available', asset: { name: asset.name, size: asset.size } }); return; }
      const dir = path.join(app.getPath('userData'), 'updates');
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, asset.name);
      set({ status: 'downloading', progress: 0, asset: { name: asset.name, size: asset.size } });
      if (!fs.existsSync(dest)) await download(asset, dest);
      set({ status: 'ready', progress: 1, file: dest });
    } catch (err) {
      const msg = err.name === 'TimeoutError' ? 'GitHub ne répond pas (pas de connexion ?)'
        : /fetch failed|ENOTFOUND|ECONN|EAI_AGAIN/i.test(`${err.message} ${err.cause?.code || ''}`) ? 'Pas de connexion internet' : err.message;
      set({ status: 'error', error: msg });
    }
  })().finally(() => { running = null; });
  await running;
  return publicState();
}

// Installe la mise à jour téléchargée puis relance l'application (relaunch = false : à la fermeture).
function install(relaunch = true) {
  if (state.status !== 'ready' || !state.file) return { ok: false, error: 'Aucune mise à jour prête' };
  try {
    if (state.kind === 'installer') {
      // Installateur NSIS : /S = silencieux (même dossier d'installation), --force-run = relance ensuite.
      spawn(state.file, ['/S', '--updated', ...(relaunch ? ['--force-run'] : [])], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    } else if (state.kind === 'mac') {
      // Script lancé à part : attend la fermeture de l'appli, remplace le bundle, puis la relance.
      const bundle = macBundle();
      const script = path.join(path.dirname(state.file), 'install.sh');
      fs.writeFileSync(script, [
        '#!/bin/sh',
        `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
        'TMP=$(mktemp -d) || exit 1',
        `ditto -x -k "$1" "$TMP" || exit 1`,
        'NEW=$(find "$TMP" -maxdepth 1 -name "*.app" | head -n 1)',
        '[ -n "$NEW" ] || exit 1',
        'rm -rf "$2" && mv "$NEW" "$2" && xattr -cr "$2"',
        'rm -rf "$TMP"',
        '[ "$3" = "1" ] && open "$2"',
        'exit 0',
      ].join('\n'), { mode: 0o755 });
      spawn('/bin/sh', [script, state.file, bundle, relaunch ? '1' : '0'], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    } else {
      const exe = selfFile();
      const old = `${exe}.old`;
      fs.rmSync(old, { force: true });
      // Un exécutable en cours d'utilisation ne peut pas être supprimé, mais il peut être renommé.
      fs.renameSync(exe, old);
      try {
        fs.copyFileSync(state.file, exe);
        if (state.kind === 'appimage') fs.chmodSync(exe, 0o755);
      } catch (err) {
        fs.renameSync(old, exe);
        throw err;
      }
      if (relaunch) spawn(exe, [], { detached: true, stdio: 'ignore', cwd: path.dirname(exe) }).on('error', () => {}).unref();
    }
    state.installing = true;
    if (relaunch) setTimeout(() => app.exit(0), 300);
    return { ok: true };
  } catch (err) {
    set({ status: 'error', error: `Installation impossible : ${err.message}` });
    return { ok: false, error: err.message };
  }
}

function setAuto(value) {
  set({ auto: !!value });
  saveSettings();
  if (state.auto && state.status === 'available') check();
}

// Inscription aux versions bêta : nouvelle recherche aussitôt (une bêta plus récente, ou rien en la quittant :
// la version installée reste jusqu'à la prochaine version finale plus récente)
function setBeta(value) {
  set({ beta: !!value });
  saveSettings();
  return check({ manual: true });
}

// Au lancement, avant d'ouvrir l'appli : recherche d'une nouvelle version, téléchargement et
// installation (l'appli redémarre alors toute seule sur la nouvelle version).
// onState(état) suit l'avancement. Renvoie :
// - { action: 'installing', version } : installation lancée, l'appli va se fermer ;
// - { action: 'notify', version, url } : nouvelle version, mais à installer à la main (.deb, image disque) ;
// - { action: 'open', reason? } : à jour, hors ligne, ou échec : on ouvre l'appli.
async function startup(onState = () => {}) {
  listeners.add(onState);
  try {
    if (state.kind === 'unsupported') {
      if (!app.isPackaged && !process.env.PADDOCK_UPDATER_DEV) return { action: 'open' };
      // Pas d'installation automatique possible : on signale seulement la nouvelle version
      const release = await latestRelease().catch(() => null);
      const version = String(release?.tag_name || '').replace(/^v/, '');
      return version && newer(version, state.current) ? { action: 'notify', version, url: release.html_url } : { action: 'open' };
    }
    // « Installer les mises à jour à la fermeture » décoché : nouvelle version seulement signalée (Réglages)
    await check({ manual: state.auto });
    if (state.status !== 'ready' || !state.auto) return { action: 'open', reason: state.status === 'error' ? state.error : null };
    const version = state.latest?.version;
    // Déjà tenté au lancement précédent sans succès : on n'insiste pas (bouton dans les réglages)
    if (installTry?.version === version) {
      set({ status: 'ready', error: null });
      return { action: 'open', reason: `L'installation automatique de la version ${version} n'a pas abouti` };
    }
    if (deferred) return { action: 'open' };
    installTry = { version, at: Date.now() };
    saveSettings();
    const r = install(true);
    return r.ok ? { action: 'installing', version } : { action: 'open', reason: r.error };
  } catch (err) {
    return { action: 'open', reason: err.message };
  } finally {
    listeners.delete(onState);
  }
}

function init(ipcMain) {
  settingsFile = path.join(app.getPath('userData'), 'updater.json');
  loadSettings();
  // Version installée au lancement précédent bien en place : on oublie la tentative
  if (installTry && !newer(installTry.version, state.current)) { installTry = null; saveSettings(); }
  // Nettoyage après une mise à jour de la version portable / de l'AppImage.
  if (state.kind === 'portable' || state.kind === 'appimage') {
    try { fs.rmSync(`${selfFile()}.old`, { force: true }); } catch { /* encore verrouillé */ }
  }
  // Anciens téléchargements (version déjà installée ou plus ancienne, fichiers incomplets)
  try {
    const dir = path.join(app.getPath('userData'), 'updates');
    for (const f of fs.readdirSync(dir)) {
      const v = /(\d+\.\d+\.\d+(?:-beta\.\d+)?)/.exec(f)?.[1];
      if (f.endsWith('.part') || (v && !newer(v, state.current))) fs.rmSync(path.join(dir, f), { force: true });
    }
  } catch { /* pas de dossier */ }

  ipcMain.handle('update-get', () => publicState());
  ipcMain.handle('update-check', () => check({ manual: true }));
  ipcMain.handle('update-install', () => install());
  ipcMain.handle('update-auto', (_e, v) => { setAuto(v); return publicState(); });
  ipcMain.handle('update-beta', (_e, v) => setBeta(v));

  // Mise à jour prête et installation automatique activée : appliquée à la fermeture de l'appli.
  app.on('will-quit', () => {
    if ((state.auto || deferred) && state.status === 'ready' && !state.installing) install(false);
  });

  if (state.kind === 'unsupported') { state.status = 'unsupported'; return; }
  // Première vérification faite par l'écran de démarrage, puis régulièrement pendant l'utilisation
  setInterval(() => check(), CHECK_EVERY_MS);
}

module.exports = { init, startup, check, install, defer, state, newer };
