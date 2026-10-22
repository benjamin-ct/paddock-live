// Application de bureau Paddock Live : lance le serveur local dans le processus Electron
// et affiche le dashboard dans une fenêtre, sans installer Node.js.
const { app, BrowserWindow, shell, Menu, screen, ipcMain, session, components, nativeTheme } = require('electron');
// Fond des fenêtres avant l'affichage de la page : clair ou sombre comme le système (apparence automatique)
const winBg = () => (nativeTheme.shouldUseDarkColors ? '#07080A' : '#F4F5F7');
const path = require('node:path');
const APP_ICON = path.join(__dirname, 'icon.png');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const { loginValues, diagnose } = require('./f1-cookies.cjs');

// Dossier des données (réglages, jeton F1 TV, enregistrements, fenêtres)
app.setPath('userData', path.join(app.getPath('appData'), 'Paddock Live'));

// Portables à deux cartes graphiques : la plus puissante, pour la transcription et la traduction
// des radios en haute qualité (grands modèles qui tournent sur la carte graphique)
app.commandLine.appendSwitch('force_high_performance_gpu');

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

async function pickPort() {
  // Port fixe de préférence (le favori « jeton F1 TV » pointe vers http://127.0.0.1:3000).
  for (const p of [3000, 3001, 3002, 3010]) if (await portFree(p)) return p;
  return 0;
}

let mainWindow = null;

// Taille et position de la fenêtre principale, conservées d'un lancement à l'autre
// (au premier lancement : plein écran fenêtré / maximisée).
function stateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')) || {}; } catch { return {}; }
}

function writeState(patch) {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...readState(), ...patch }));
  } catch { /* disque en lecture seule : tant pis */ }
}

// Fenêtre encore visible sur un des écrans actuels ?
function boundsVisible(b) {
  return !!b && screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + 100 < a.x + a.width && b.x + b.width - 100 > a.x && b.y >= a.y - 20 && b.y + 60 < a.y + a.height;
  });
}

// Choix au lancement : 'last' (comme à la fermeture), 'saved' (emplacement enregistré), 'none'
function startMode(st = readState()) {
  if (st.windowsStart === 'saved' && st.saved) return 'saved';
  if (st.windowsStart === 'none' || st.restoreWindows === false) return 'none';
  return 'last';
}

function loadWindowState() {
  const st = readState();
  if (startMode(st) === 'saved' && st.saved.main?.bounds) {
    return { bounds: boundsVisible(st.saved.main.bounds) ? st.saved.main.bounds : null, maximized: st.saved.main.maximized !== false };
  }
  if (!st.bounds) return { bounds: null, maximized: true };
  return { bounds: boundsVisible(st.bounds) ? st.bounds : null, maximized: st.maximized !== false };
}

function saveWindowState(win) {
  writeState({ bounds: win.getNormalBounds(), maximized: win.isMaximized() || win.isFullScreen() });
}

// ---------- Fenêtres détachées (panneaux sur le second écran) ----------
// Mémorisées à la fermeture de l'appli et rouvertes au lancement (réglable).
const isPanelUrl = (u) => /[?&](win|panel)=/.test(u || '');

function childWindows() {
  return BrowserWindow.getAllWindows().filter((w) => w !== mainWindow && w !== loginWindow && !w.isDestroyed() && isPanelUrl(w.webContents.getURL()));
}

function snapshotChildren() {
  return childWindows().map((w) => ({
    search: new URL(w.webContents.getURL()).search,
    bounds: w.getNormalBounds(),
    maximized: w.isMaximized() || w.isFullScreen(),
  }));
}

// plugins : visionneuse PDF intégrée (documents FIA affichés dans l'appli)
const childPrefs = () => ({ contextIsolation: true, sandbox: true, plugins: true, preload: path.join(__dirname, 'preload.cjs') });

// Carte flottante : fenêtre transparente, sans cadre ni fond, au-dessus de tout (par-dessus la vidéo)
const isFloatUrl = (u) => /[?&]float=1(&|$)/.test(u || '');
const floatOptions = (b, { width = 560, height = 460, title = 'Paddock Live — carte flottante' } = {}) => ({
  frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, alwaysOnTop: true,
  resizable: true, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: false,
  minWidth: 160, minHeight: 120, icon: APP_ICON, title,
  ...(b && boundsVisible(b) ? b : { width, height }),
  webPreferences: childPrefs(),
});
// Au-dessus de tout, y compris d'une vidéo en plein écran. Windows remet au premier plan la fenêtre
// plein écran (navigateur, lecteur) quand on clique dedans : la carte et le mini-classement
// reprennent leur place dès qu'ils perdent le focus, puis toutes les 2 s tant qu'ils sont ouverts
function floatOnTop(win) {
  const top = () => {
    if (win.isDestroyed() || !win.isVisible() || win.isFocused()) return;
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
  };
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  win.on('blur', () => setTimeout(top, 150));
  const timer = setInterval(top, 2000);
  win.on('closed', () => clearInterval(timer));
}

function openChild(baseUrl, c) {
  if (isFloatUrl(c.search)) {
    const fw = new BrowserWindow(floatOptions(c.bounds));
    setupContents(fw.webContents, baseUrl);
    floatOnTop(fw);
    fw.loadURL(`${baseUrl}${c.search}`);
    return fw;
  }
  const win = new BrowserWindow({
    autoHideMenuBar: true,
    icon: APP_ICON,
    backgroundColor: winBg(),
    ...(boundsVisible(c.bounds) ? c.bounds : { width: 1200, height: 800 }),
    webPreferences: childPrefs(),
  });
  setupContents(win.webContents, baseUrl);
  if (c.maximized) win.maximize();
  win.loadURL(`${baseUrl}${c.search}`);
  return win;
}

let pendingChildren = null;   // adresse de la page : fenêtres détachées à rouvrir au premier passage au Direct
ipcMain.handle('windows-start-open', () => {
  if (!pendingChildren) return false;
  const url = pendingChildren;
  pendingChildren = null;
  setTimeout(() => restoreChildren(url), 300);
  return true;
});

function restoreChildren(baseUrl) {
  const st = readState();
  const mode = startMode(st);
  if (mode === 'none') return;
  for (const c of (mode === 'saved' ? st.saved.children : st.children) || []) {
    if (isPanelUrl(c.search)) openChild(baseUrl, c);
  }
}

// Écran différent de celui de la fenêtre principale (second écran), s'il existe.
function otherDisplay() {
  const displays = screen.getAllDisplays();
  if (displays.length < 2 || !mainWindow) return null;
  const current = screen.getDisplayMatching(mainWindow.getBounds());
  return displays.find((d) => d.id !== current.id) || null;
}

// ---- Connexion F1 TV ----
// Ouvre la page de connexion officielle dans une fenêtre de l'appli, puis lit les cookies de connexion
// (y compris protégés : f1-cookies.cjs) et les envoie au serveur local, qui garde le jeton d'abonnement.
const LOGIN_URL = 'https://account.formula1.com/#/fr/login?redirect=https%3A%2F%2Ff1tv.formula1.com%2F';
let loginWindow = null;


async function sendToken(value) {
  const res = await fetch(`http://127.0.0.1:${process.env.PORT}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

function loginF1TV() {
  if (loginWindow) { loginWindow.focus(); return Promise.resolve({ pending: true }); }
  const ses = session.fromPartition('persist:f1tv');
  return new Promise((resolve) => {
    loginWindow = new BrowserWindow({
      width: 1000,
      height: 800,
      parent: mainWindow || undefined,
      title: 'Connexion F1 TV',
      autoHideMenuBar: true,
      icon: APP_ICON,
      webPreferences: { partition: 'persist:f1tv', contextIsolation: true, sandbox: true },
    });
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
      loginWindow = null;
      resolve(result);
    };
    // Cookie d'une ancienne connexion dont la session est finie : refusé par le serveur, on
    // attend que l'utilisateur se reconnecte (le cookie change) au lieu de fermer la fenêtre.
    // Autre refus : on essaie le cookie suivant, puis on s'arrête avec la liste des cookies vus
    // (jamais leurs valeurs), pour savoir quoi corriger si formula1.com change encore.
    const refused = new Set();
    const check = async () => {
      const cookies = await ses.cookies.get({}).catch(() => []);
      let error = null;
      for (const value of loginValues(cookies)) {
        if (refused.has(value)) continue;
        try { return finish({ ok: true, info: await sendToken(value) }); } catch (err) {
          refused.add(value);
          if (!/expir/i.test(err.message)) error = err;
        }
      }
      if (error) finish({ ok: false, error: `${error.message} (cookies formula1.com : ${diagnose(cookies) || 'aucun'})` });
    };
    // Déjà connecté (session mémorisée) ? Sinon on surveille jusqu'à la connexion.
    const timer = setInterval(check, 1500);
    loginWindow.on('closed', async () => {
      const seen = diagnose(await ses.cookies.get({}).catch(() => []));
      finish({ ok: false, error: `Fenêtre fermée avant la connexion${seen ? ` (cookies formula1.com : ${seen})` : ''}` });
    });
    // User-agent de Chrome standard (sans la mention Electron ni le nom de l'appli) pour la page de connexion.
    const ua = loginWindow.webContents.getUserAgent().replace(/ Electron\/\S+/, '').replace(/\) (?!Chrome\/)\S+\/\S+ (?=Chrome\/)/, ') ');
    loginWindow.loadURL(LOGIN_URL, { userAgent: ua });
  });
}

ipcMain.handle('f1tv-login', () => loginF1TV());
ipcMain.handle('f1tv-logout', async () => {
  await session.fromPartition('persist:f1tv').clearStorageData();
  return { ok: true };
});

// Electron castlabs : module Widevine (DRM) nécessaire aux commentaires F1 TV. Il est téléchargé
// au premier lancement ; on ne bloque jamais l'ouverture de l'appli plus de 15 s pour lui.
async function widevineReady() {
  if (!components?.whenReady) return;
  try {
    await Promise.race([components.whenReady(), new Promise((r) => setTimeout(r, 15000))]);
    console.log('[widevine]', JSON.stringify(components.status()));
  } catch (err) {
    console.warn('[widevine]', err.message);
  }
}

// Publication sans accès payant (mode créateur) : la page officielle de X, Threads ou Bluesky pour
// écrire un post (« intent »), préremplie avec le texte, dans une fenêtre de l'appli. La connexion au
// compte y est gardée (une session à part par réseau, sans accès à l'appli) ; l'image se colle avec
// Ctrl+V (Cmd+V sur Mac).
const COMPOSE = [
  ['x', /^https:\/\/(x|twitter)\.com\/intent\/(post|tweet)\?/i, 'Publier sur X'],
  ['threads', /^https:\/\/(www\.)?threads\.(com|net)\/intent\/post\?/i, 'Publier sur Threads'],
  ['bsky', /^https:\/\/bsky\.app\/intent\/compose\?/i, 'Publier sur Bluesky'],
];
const composeOf = (u) => COMPOSE.find(([, re]) => re.test(String(u || '')));
const composeWindows = new Map();
function openCompose(url) {
  const [net, , title] = composeOf(url);
  const old = composeWindows.get(net);
  if (old && !old.isDestroyed()) {
    old.loadURL(url, { userAgent: old.webContents.getUserAgent() });
    if (old.isMinimized()) old.restore();
    old.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 720, height: 780, title, autoHideMenuBar: true, icon: APP_ICON, backgroundColor: '#000000',
    webPreferences: { partition: `persist:${net}`, contextIsolation: true, sandbox: true },
  });
  composeWindows.set(net, win);
  // Liens vers d'autres sites : navigateur par défaut
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });
  win.on('closed', () => { if (composeWindows.get(net) === win) composeWindows.delete(net); });
  // User-agent de Chrome standard (sans la mention Electron ni le nom de l'appli), comme pour F1 TV
  const ua = win.webContents.getUserAgent().replace(/ Electron\/\S+/, '').replace(/\) (?!Chrome\/)\S+\/\S+ (?=Chrome\/)/, ') ');
  win.webContents.setUserAgent(ua);
  win.loadURL(url, { userAgent: ua });
}

// Ouverture de fenêtres depuis une page de l'appli : panneaux détachés = nouvelle fenêtre de l'appli
// (directement sur le second écran s'il existe) ; tout le reste (liens, dashboard dans le
// navigateur pour les flux DRM) s'ouvre dans le navigateur.
function setupContents(wc, url) {
  wc.setWindowOpenHandler(({ url: target }) => {
    // Mini-classement : petite fenêtre sans cadre ni fond, toujours au premier plan (par-dessus la vidéo)
    if (target.startsWith(url) && new URL(target).pathname === '/mini.html') {
      return { action: 'allow', overrideBrowserWindowOptions: floatOptions(null, { width: 300, height: 640, title: 'Paddock Live — mini-classement' }) };
    }
    if (target.startsWith(url) && isPanelUrl(target) && isFloatUrl(target)) {
      return { action: 'allow', overrideBrowserWindowOptions: floatOptions() };
    }
    if (target.startsWith(url) && isPanelUrl(target)) {
      const other = otherDisplay();
      const area = other ? other.workArea : null;
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          icon: APP_ICON,
          backgroundColor: winBg(),
          ...(area ? { x: area.x + 40, y: area.y + 40, width: Math.min(1400, area.width - 80), height: Math.min(900, area.height - 80) } : {}),
          webPreferences: childPrefs(),
        },
      };
    }
    // Mode créateur : page de publication (X, Threads, Bluesky) préremplie, ouverte dans l'appli
    if (composeOf(target)) { openCompose(target); return { action: 'deny' }; }
    // Navigateur par défaut, pour les adresses web seulement (pas de file:, ni de protocole
    // système qui lancerait un autre programme) ; webcal : abonnement au calendrier, ouvert par l'agenda
    if (/^(https?|webcal):\/\//i.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });
  wc.on('did-create-window', (win, { url: target }) => {
    setupContents(win.webContents, url);
    if (isFloatUrl(target)) { floatOnTop(win); return; }
    if (/\/mini\.html(\?|$)/.test(target || '')) { floatOnTop(win); return; }
    if (otherDisplay()) win.maximize();
  });
}

// ---------- Écran de démarrage : recherche et installation des mises à jour ----------
function createSplash() {
  const win = new BrowserWindow({
    width: 440,
    height: 330,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    show: false,
    backgroundColor: '#0b0b0f',
    title: 'Paddock Live',
    icon: APP_ICON,
    webPreferences: { contextIsolation: true, sandbox: true, javascript: true },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { if (!mainWindow && !splashDone) app.quit(); });
  win.loadFile(path.join(__dirname, 'splash.html'), { query: { lang: uiEn() ? 'en' : 'fr' } });
  return win;
}

let splashDone = false;

// Langue de l'interface (choisie dans l'appli, sinon celle du système) pour l'écran de démarrage
function uiEn() {
  const l = readState().uiLang;
  return l ? l === 'en' : !String(app.getLocale() || 'fr').toLowerCase().startsWith('fr');
}
const T = (fr, en) => (uiEn() ? en : fr);

// Met à jour le texte de l'écran de démarrage (progress : null = activité, 0…1, false = sans barre)
function splashSay(win, title, detail = '', progress = null) {
  if (!win || win.isDestroyed()) return;
  const run = () => win.webContents.executeJavaScript(`setStatus(${JSON.stringify(title)}, ${JSON.stringify(detail)}, ${JSON.stringify(progress)})`).catch(() => {});
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', run); else run();
}

const mo = (b) => `${Math.round(b / 1048576)} ${T('Mo', 'MB')}`;

// Avancement de la mise à jour affiché sur l'écran de démarrage
function splashUpdate(win, st) {
  if (st.status === 'checking') splashSay(win, T('Recherche de mise à jour…', 'Checking for updates…'));
  else if (st.status === 'downloading') {
    win.webContents.executeJavaScript('later(true)').catch(() => {});
    const size = st.asset?.size;
    const next = T('l\'appli s\'ouvrira sur la nouvelle version', 'the app will open on the new version');
    splashSay(win, T(`Téléchargement de la version ${st.latest?.version}…`, `Downloading version ${st.latest?.version}…`),
      size ? `${mo(size * (st.progress || 0))} / ${mo(size)} · ${next}` : next, st.progress || 0);
  } else if (st.status === 'ready') {
    win.webContents.executeJavaScript('later(false)').catch(() => {});
    splashSay(win, T(`Installation de la version ${st.latest?.version}…`, `Installing version ${st.latest?.version}…`), T('L\'appli va redémarrer toute seule dans quelques secondes.', 'The app will restart by itself in a few seconds.'));
  }
}

// Nouvelle version qui ne s'installe pas toute seule (.deb, appli lancée depuis l'image disque) :
// « Télécharger » ouvre la page de la version, « Continuer » ouvre l'appli actuelle
function splashAsk(win, version) {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed()) { resolve('continue'); return; }
    splashSay(win, T(`Nouvelle version ${version} disponible`, `New version ${version} available`), T('Elle s\'installe à la main pour cette installation.', 'It installs by hand for this installation.'), false);
    win.webContents.executeJavaScript('ask(true)').catch(() => {});
    const onNav = (e, target) => {
      e.preventDefault();
      if (!/^paddock:/.test(target)) return;
      win.webContents.removeListener('will-navigate', onNav);
      win.webContents.executeJavaScript('ask(false)').catch(() => {});
      resolve(target.includes('download') ? 'download' : 'continue');
    };
    win.webContents.on('will-navigate', onNav);
    win.once('closed', () => resolve('continue'));
  });
}

// Langue choisie dans l'interface (écran de démarrage suivant)
ipcMain.on('ui-lang', (_e, l) => { if ((l === 'en' || l === 'fr') && readState().uiLang !== l) writeState({ uiLang: l }); });
ipcMain.handle('restore-windows-get', () => readState().restoreWindows !== false);
ipcMain.handle('restore-windows-set', (_e, v) => { writeState({ restoreWindows: !!v, windowsStart: v ? 'last' : 'none' }); return !!v; });
ipcMain.handle('windows-start-get', () => { const st = readState(); return st.windowsStart || (st.restoreWindows === false ? 'none' : 'last'); });
ipcMain.handle('windows-start-set', (_e, v) => {
  const mode = ['last', 'saved', 'none'].includes(v) ? v : 'last';
  writeState({ windowsStart: mode, restoreWindows: mode !== 'none' });
  return mode;
});
// Enregistre la place de toutes les fenêtres et leurs dispositions (envoyées par la page)
ipcMain.handle('windows-save', (_e, layouts) => {
  if (!mainWindow) return false;
  writeState({ saved: {
    at: Date.now(),
    main: { bounds: mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized() || mainWindow.isFullScreen() },
    children: snapshotChildren(),
    layouts: layouts && typeof layouts === 'object' ? layouts : null,
  } });
  return true;
});
// Remet les fenêtres à leur place enregistrée : fenêtre principale déplacée, fenêtres
// secondaires fermées puis rouvertes (elles reprennent leur disposition enregistrée)
ipcMain.handle('windows-restore', () => {
  const saved = readState().saved;
  if (!saved || !mainWindow) return false;
  const base = mainWindow.webContents.getURL().replace(/[?#].*$/, '');
  for (const w of childWindows()) w.destroy();
  if (saved.main?.bounds && boundsVisible(saved.main.bounds)) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    mainWindow.setBounds(saved.main.bounds);
  }
  if (saved.main?.maximized) mainWindow.maximize();
  for (const c of saved.children || []) if (isPanelUrl(c.search)) openChild(base, c);
  return true;
});
// Au lancement (emplacement enregistré) : la page principale reprend les dispositions enregistrées
let startupLayoutsSent = false;
ipcMain.on('windows-startup-layouts', (e) => {
  const st = readState();
  const isMain = mainWindow && e.sender === mainWindow.webContents;
  e.returnValue = isMain && !startupLayoutsSent && startMode(st) === 'saved' ? st.saved.layouts || null : null;
  if (isMain) startupLayoutsSent = true;
});
// Mémoire utilisée par l'application, par type de processus (Réglages → Application)
ipcMain.handle('app-memory', () => {
  const by = {};
  for (const m of app.getAppMetrics()) by[m.type] = (by[m.type] || 0) + (m.memory?.workingSetSize || 0) * 1024;
  return by;
});
// Carte flottante : déplacement et taille réglés depuis la page (fenêtre sans cadre)
ipcMain.on('float-bounds', (e, b) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w.isDestroyed() || !isFloatUrl(e.sender.getURL()) || !b || typeof b !== 'object') return;
  const cur = w.getBounds();
  const n = (v, d) => (Number.isFinite(v) ? Math.round(v) : d);
  const width = Math.max(160, Math.min(4000, n(b.width, cur.width)));
  const height = Math.max(120, Math.min(4000, n(b.height, cur.height)));
  w.setBounds({ x: n(b.x, cur.x), y: n(b.y, cur.y), width, height });
});
ipcMain.handle('float-bounds-get', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  return w && !w.isDestroyed() ? w.getBounds() : null;
});
ipcMain.handle('window-focus', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return false;
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
  return true;
});

async function start() {
  // User-agent de Chrome standard pour toutes les fenêtres (sans la mention Electron ni le nom de
  // l'appli) : le lecteur YouTube intégré de l'Actu refusait les vidéos (« Cette vidéo n'est pas
  // disponible ») face au navigateur d'Electron, comme F1 TV et X pour leurs pages de connexion
  app.userAgentFallback = app.userAgentFallback.replace(/ Electron\/\S+/, '').replace(/\) (?!Chrome\/)\S+\/\S+ (?=Chrome\/)/, ') ');
  const updater = require('./updater.cjs');
  updater.init(ipcMain);
  const splash = createSplash();
  splash.webContents.once('did-finish-load', () => splash.webContents.executeJavaScript(`setVersion(${JSON.stringify(app.getVersion())})`).catch(() => {}));
  // « Plus tard » pendant le téléchargement : l'appli s'ouvre tout de suite, la version s'installe à la fermeture
  const later = new Promise((resolve) => {
    splash.webContents.on('will-navigate', (e, target) => {
      if (!String(target).startsWith('paddock://later')) return;
      e.preventDefault();
      updater.defer();
      resolve({ action: 'open', reason: null });
    });
  });
  const res = await Promise.race([updater.startup((st) => { if (!splash.isDestroyed()) splashUpdate(splash, st); }), later]);
  console.log('[mise à jour]', JSON.stringify(res));
  if (res.action === 'installing') { splashDone = true; return; }   // l'appli se ferme puis redémarre
  if (res.action === 'notify' && await splashAsk(splash, res.version) === 'download') shell.openExternal(res.url);
  splashSay(splash, T('Démarrage…', 'Starting…'), res.reason ? T(`Mise à jour impossible : ${res.reason}`, `Update not possible: ${res.reason}`) : '');
  await widevineReady();
  const port = await pickPort();
  process.env.PORT = String(port || 3000);
  process.env.PADDOCK_DATA_DIR = path.join(app.getPath('userData'), 'data');
  process.env.PADDOCK_VERSION = app.getVersion();
  await import(pathToFileURL(path.join(__dirname, 'bundle', 'server', 'index.js')).href);

  // Pas de barre de menus sous Windows / Linux. Sous macOS, le menu système reste nécessaire pour
  // les raccourcis (Cmd+C / Cmd+V dans les champs, Cmd+Q, Cmd+M, plein écran).
  Menu.setApplicationMenu(process.platform === 'darwin'
    ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }])
    : null);
  const ws = loadWindowState();
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    // Premier lancement : toute la zone utile de l'écran (en plus de maximize(), selon le système)
    ...(ws.bounds || screen.getPrimaryDisplay().workArea),
    show: false,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: winBg(),
    title: 'Paddock Live',
    autoHideMenuBar: true,
    icon: APP_ICON,
    webPreferences: childPrefs(),
  });
  const url = `http://127.0.0.1:${process.env.PORT}/`;
  setupContents(mainWindow.webContents, url);
  // Fenêtres détachées de la dernière session : rouvertes quand la page principale quitte l'accueil
  // (Direct, replay, séance en cours), pas sur l'accueil (pas de résultat sur le second écran)
  pendingChildren = url;
  // Laisse le serveur démarrer avant de charger la page.
  const load = (tries = 0) => mainWindow.loadURL(url).catch(() => tries < 20 && setTimeout(() => load(tries + 1), 250));
  setTimeout(load, 300);
  // Fenêtre affichée une fois la page chargée (au plus tard après 10 s), puis fin de l'écran de démarrage
  let shown = false;
  const showMain = () => {
    if (shown || !mainWindow) return;
    shown = true;
    if (ws.maximized) mainWindow.maximize();
    mainWindow.show();
    splashDone = true;
    if (!splash.isDestroyed()) splash.destroy();
  };
  mainWindow.webContents.once('did-finish-load', showMain);
  setTimeout(showMain, 10000);
  // Sauvegarde à chaque changement de taille / position (et à la fermeture)
  let saveTimer = null;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => mainWindow && saveWindowState(mainWindow), 800); };
  for (const evt of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) mainWindow.on(evt, saveSoon);
  mainWindow.on('close', () => {
    clearTimeout(saveTimer);
    saveWindowState(mainWindow);
    // Fenêtres détachées : mémorisées puis fermées avec la fenêtre principale
    writeState({ children: snapshotChildren() });
    for (const w of childWindows()) w.destroy();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  app.whenReady().then(start);
  app.on('window-all-closed', () => app.quit());
}
