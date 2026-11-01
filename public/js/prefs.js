// Préférences de l'utilisateur (conservées dans le navigateur).
import { storageGet, storageSet, setVividTeams, setTeamLogos, setLogoColor } from './util.js';
import { emit, touch } from './store.js';
import { LANG } from './i18n.js';

// Écran principal (1.30) : Classement (avec le duel par-dessus), Télémétrie, Direction de course et Radios ; Circuit,
// Analyse et Duel s'ouvrent dans leur propre fenêtre (bouton + d'un panneau, menu Dispo.) : masqués dans la fenêtre
// principale (ui/layout.js, ui/tabmove.js). Analyse : 3 onglets selon la séance (les autres : bouton +)
export const PANELS_HIDDEN = ['analysis', 'duel'];
export const TAB_HIDDEN = {
  race: ['laptimes', 'pace', 'tyrehist', 'sectors', 'tyres', 'pitsim', 'battles', 'champ'],
  quali: ['trace', 'positions', 'pits', 'strategy', 'laptimes', 'pace', 'tyrehist', 'tyres', 'pitsim', 'battles', 'champ'],
};

const DEFAULTS = {
  favs: [],               // numéros des pilotes favoris
  favTeams: [],           // écuries favorites (clés de shared/news.js : 'ferrari', 'redbull'…)
  alerts: { sound: true, vibrate: true, notify: false, flags: true, fastest: true, favPit: true, favRcm: true, retire: true, finish: true, favCut: true, rain: true, prono: true },
  hiddenPanels: [...PANELS_HIDDEN],
  hiddenTabs: [...TAB_HIDDEN.race],   // onglets masqués (Réglages → Onglets visibles, bouton +), comme ceux inutiles pour la séance
  hiddenCols: [],
  extraCols: [],          // colonnes facultatives ajoutées au classement (voir EXTRA_COLUMNS)
  bigCols: null,          // colonnes du classement agrandi (bouton ⤢) : { hidden, extra }, sinon les mêmes
  towerFit: true,         // classement agrandi pour remplir la hauteur disponible
  theme: 'pitwall',       // thème unique de l'application
  design: 'v2',           // habillage : 'v2' (Paddock 2) | 'broadcast' (façon retransmission TV) | 'classic' (ancien design Pitwall)
  scheme: 'auto',         // apparence : 'auto' (comme le système) | 'dark' (sombre) | 'light' (clair)
  schemeSet: false,       // apparence choisie par l'utilisateur (sinon : automatique)
  vividTeams: false,      // couleurs d'équipe contrastées plutôt qu'officielles
  teamLogos: true,        // logos des écuries (classement, championnat) plutôt que barres de couleur
  logoColor: true,        // logos dans leurs couleurs officielles (sinon logo blanc sur la couleur d'équipe)
  keepAwake: true,        // écran toujours allumé pendant une séance
  phoneFull: false,       // téléphone : tous les onglets et réglages de l'ordinateur (sinon version simplifiée)
  welcomed: true,         // écrans d'accueil du premier lancement déjà vus
  motion: true,           // animations de l'interface (désactivées aussi si le système le demande)
  momentsSpoil: false,    // replay : détail des moments clés à venir affiché
  lang: LANG,             // langue de l'interface : 'fr' | 'en' | 'it' | 'es' (voir i18n.js)
  autoSyncAdj: 0,         // synchro TV par le son : correction ajoutée au délai trouvé (s)
  remindMin: 15,          // rappel avant chaque séance (minutes, 0 : désactivé)
  legends: false,         // légendes sous les panneaux (couleurs et badges), à afficher dans Apparence
  replayMarks: true,      // replay : périodes de safety car / VSC sur la barre de lecture
  hotLapDim: false,       // essais / qualifs : voitures hors tour lancé estompées (carte, classement)
  layoutMode: 'auto',     // disposition : 'auto' (selon la séance) | 'race' | 'quali'
  tabLayout: null,        // onglets déplacés : { panneau: [onglets dans l'ordre] } (null : à leur place d'origine)
  radioAuto: false,
  radioText: true,        // transcription des radios en texte et traduction (serveur Paddock Live), active d'office
  radioLang: LANG === 'en' ? 'none' : LANG,        // langue de traduction des transcriptions ('none' : anglais)
  radioFilter: 'all',
  obRadio: false,         // radios captées sur les caméras embarquées F1 TV (expérimental)
  obRadioWho: 'auto',     // pilotes écoutés : 'auto' (suivi + duel) | 'favs' (3 premiers favoris)
  pitView: 'chrono',      // onglet Arrêts : 'chrono' ou 'driver'
  commLang: 'FRA',        // commentaires F1 TV : langue
  commVolume: 0.8,
  commDuck: true,         // commentaires plus bas pendant une radio d'équipe
  radioVolume: 1,
  commMuted: false,
  commSync: true,         // caler le son sur le délai du dashboard
  commOffset: 0,          // décalage manuel du son (s)
  commChannel: null,
  commSource: 'f1tv',     // 'f1tv' ou 'radio'
  radioStations: [],      // [{id, name, lang, url}]
  radioStation: null,
  rcmBlue: true,          // direction de course : drapeaux bleus affichés
  rcmDeleted: true,       // direction de course : temps supprimés affichés
  rcmType: 'all',         // direction de course : type de messages affichés
  rcmTranslate: true,     // direction de course : messages traduits par le serveur Paddock Live
  spoilers: false,
  newsAlerts: 'important', // actualités : 'important' | 'favs' | 'all' | 'off'
  newsTranslate: true,     // actualités traduites en français (serveur Paddock Live)
  newsSpoilers: true,      // actualités : titres masqués et alertes suspendues pendant une séance / un replay
  mapFollow: false,
  muted: false,
};

const saved = storageGet('paddock.prefs', {});
export const prefs = { ...DEFAULTS, ...saved, alerts: { ...DEFAULTS.alerts, ...(saved.alerts || {}) } };
// v1.28 : nouvelle installation (aucun réglage enregistré) : écrans d'accueil ; v1.30 : déjà au nouvel écran principal
// (layoutV, ui/layout.js)
if (!Object.keys(saved).length) {
  Object.assign(prefs, { welcomed: false, layoutV: 4 });
  storageSet('paddock.prefs', { ...storageGet('paddock.prefs', {}), welcomed: false, layoutV: 4 });
}
// Un seul thème depuis la v1.20 : Pitwall, en mode sombre ou clair. Les anciens thèmes (F1 Pro,
// F1 sobre, Classique, Bleu nuit) passent sur Pitwall, en mode sombre.
prefs.theme = 'pitwall';
if ((saved.themeV || 0) < 5) storageSet('paddock.prefs', { ...storageGet('paddock.prefs', {}), theme: 'pitwall', themeV: 5 });
prefs.themeV = 5;   // gardé dans chaque enregistrement des préférences
// v1.27.47 : légendes masquées par défaut, aussi pour les installations existantes (une seule fois ;
// réaffichées ensuite si on les recoche dans Réglages → Apparence)
if (!saved.legendsV) { prefs.legends = false; storageSet('paddock.prefs', { ...storageGet('paddock.prefs', {}), legends: false, legendsV: 1 }); }
prefs.legendsV = 1;
// v1.30 : design Paddock 2 par défaut, aussi pour les installations existantes restées sur Broadcast (l'ancien
// défaut) ; un choix de Classique est gardé. Une seule fois : Broadcast se rechoisit dans Réglages → Apparence
if (!saved.designV) { if (prefs.design === 'broadcast') prefs.design = 'v2'; storageSet('paddock.prefs', { ...storageGet('paddock.prefs', {}), design: prefs.design, designV: 1 }); }
prefs.designV = 1;
// Langue retenue dès la première ouverture (sinon une autre fenêtre la redéduirait autrement)
if (saved.lang !== LANG) storageSet('paddock.prefs', { ...storageGet('paddock.prefs', {}), lang: LANG });
// Apparence automatique par défaut depuis la v1.20.1. En v1.20.0, « sombre » était enregistré par
// défaut avec les autres réglages : seul un choix fait dans les réglages (ou le clair) est conservé.
if (!saved.schemeSet && saved.scheme !== 'light') prefs.scheme = 'auto';
document.documentElement.dataset.motion = prefs.motion === false ? 'off' : 'on';
setVividTeams(prefs.vividTeams);
setTeamLogos(prefs.teamLogos);
setLogoColor(prefs.logoColor);

// Apparence : sombre, clair ou comme le système (data-scheme sur <html>, lu par le CSS et la carte)
const systemLight = window.matchMedia?.('(prefers-color-scheme: light)');
export function resolvedScheme() {
  // Overlays de streaming (OBS…) : toujours sombres, quelle que soit l'apparence de l'ordinateur
  if (document.documentElement.classList.contains('overlay')) return 'dark';
  return prefs.scheme === 'light' || (prefs.scheme === 'auto' && systemLight?.matches) ? 'light' : 'dark';
}
function applyScheme() {
  const v = resolvedScheme();
  if (document.documentElement.dataset.scheme !== v) {
    document.documentElement.dataset.scheme = v;
    emit('scheme', v);
    touch('DriverList');   // panneaux redessinés avec les couleurs de l'apparence (pneus, carte…)
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', v === 'light' ? '#F4F5F7' : '#07080A');
  // Appli installée sur iPhone : barre d'état claire ou noire (prise en compte au lancement suivant)
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', v === 'light' ? 'default' : 'black');
}
// Habillage : la feuille broadcast.css (posée par-dessus le thème Pitwall) est coupée en design classique
function applyDesign() {
  document.documentElement.dataset.design = prefs.design;
  const css = document.querySelector('link[href="/css/broadcast.css"]');
  if (css) css.disabled = prefs.design === 'classic';
}
document.documentElement.dataset.theme = 'pitwall';
applyDesign();
applyScheme();
systemLight?.addEventListener?.('change', () => { if (prefs.scheme === 'auto') applyScheme(); });

// Couleurs d'équipe changées : les panneaux qui affichent les pilotes se redessinent.
function applyTeamColors() {
  setVividTeams(prefs.vividTeams);
  setTeamLogos(prefs.teamLogos);
  setLogoColor(prefs.logoColor);
  touch('DriverList');
}

export function setPref(key, value) {
  prefs[key] = value;
  if (['vividTeams', 'teamLogos', 'logoColor'].includes(key)) applyTeamColors();
  if (key === 'scheme') { prefs.schemeSet = true; applyScheme(); }
  if (key === 'design') applyDesign();
  if (key === 'motion') document.documentElement.dataset.motion = value ? 'on' : 'off';
  storageSet('paddock.prefs', prefs);
  emit('prefs', key);
}

export function isFav(num) {
  return prefs.favs.includes(String(num));
}

export function toggleFav(num) {
  num = String(num);
  setPref('favs', isFav(num) ? prefs.favs.filter((n) => n !== num) : [...prefs.favs, num]);
}

export function toggleTeamFav(key) {
  const list = prefs.favTeams || [];
  setPref('favTeams', list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
}

// Préférences modifiées dans une autre fenêtre (favoris, colonnes, filtres…).
window.addEventListener('storage', (e) => {
  if (e.key !== 'paddock.prefs' || e.newValue === null) return;
  let next;
  try { next = JSON.parse(e.newValue); } catch { return; }
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in next) || JSON.stringify(next[key]) === JSON.stringify(prefs[key])) continue;
    prefs[key] = key === 'alerts' ? { ...DEFAULTS.alerts, ...next.alerts } : next[key];
    if (['vividTeams', 'teamLogos', 'logoColor'].includes(key)) applyTeamColors();
    if (key === 'scheme') applyScheme();
    if (key === 'design') applyDesign();
    emit('prefs', key);
  }
});

// Colonnes du classement : les siennes quand il est agrandi (bouton ⤢), sinon celles de la disposition
export const towerBig = () => !!document.querySelector('.p-tower.maximized');
export const towerCols = () => (towerBig() && prefs.bigCols) || { hidden: prefs.hiddenCols, extra: prefs.extraCols };
