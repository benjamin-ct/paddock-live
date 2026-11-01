// Pont sécurisé entre l'interface et l'application de bureau.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('f1desktop', {
  isDesktop: true,
  loginF1TV: () => ipcRenderer.invoke('f1tv-login'),
  logoutF1TV: () => ipcRenderer.invoke('f1tv-logout'),
  version: () => ipcRenderer.invoke('update-get'),
  checkUpdate: () => ipcRenderer.invoke('update-check'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  setAutoUpdate: (v) => ipcRenderer.invoke('update-auto', v),
  setBetaUpdates: (v) => ipcRenderer.invoke('update-beta', v),
  onUpdate: (fn) => ipcRenderer.on('update-state', (_e, s) => fn(s)),
  getRestoreWindows: () => ipcRenderer.invoke('restore-windows-get'),
  setRestoreWindows: (v) => ipcRenderer.invoke('restore-windows-set', v),
  // Emplacement des fenêtres : enregistrer, revenir, choix au lancement ('last' | 'saved' | 'none')
  getWindowsStart: () => ipcRenderer.invoke('windows-start-get'),
  setWindowsStart: (v) => ipcRenderer.invoke('windows-start-set', v),
  saveWindows: (layouts) => ipcRenderer.invoke('windows-save', layouts),
  restoreWindows: (snap) => ipcRenderer.invoke('windows-restore', snap),
  savedWindows: () => ipcRenderer.invoke('windows-saved-get'),
  // Fenêtres détachées de la dernière session : rouvertes en quittant l'accueil
  openStartupWindows: () => ipcRenderer.invoke('windows-start-open'),
  // Dispositions enregistrées à appliquer au lancement (une seule fois, fenêtre principale)
  startupLayouts: () => ipcRenderer.sendSync('windows-startup-layouts'),
  focusWindow: () => ipcRenderer.invoke('window-focus'),
  memory: () => ipcRenderer.invoke('app-memory'),
  setLang: (l) => ipcRenderer.send('ui-lang', l),
  // Carte flottante (fenêtre sans cadre) : position et taille
  floatBounds: (b) => ipcRenderer.send('float-bounds', b),
  floatGetBounds: () => ipcRenderer.invoke('float-bounds-get'),
  // Compte à rebours de la prochaine séance (barre des menus sur macOS, zone de notification ailleurs)
  platform: process.platform,
  getTray: () => ipcRenderer.invoke('tray-get'),
  setTray: (v) => ipcRenderer.invoke('tray-set', !!v),
});
