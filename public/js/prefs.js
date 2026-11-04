// Préférences de l'utilisateur (conservées dans le navigateur).
import { storageGet, storageSet, setVividTeams, setTeamLogos, setLogoColor } from './util.js';
import { emit, touch } from './store.js';
import { LANG } from './i18n.js';

// Écran principal (1.30) : Classement (avec le duel par-dessus), Télémétrie, Direction de course et Radios ; Circuit,
// Analyse et Duel s'ouvrent dans leur propre fenêtre (bouton + d'un panneau, menu Dispo.) : masqués dans la fenêtre
// principale (ui/layout.js, ui/tabmove.js). Analyse : 3 onglets selon la séance (les autres : bouton +)
export const PANELS_HIDDEN = ['analysis', 'duel'];
// Fil de course (1.32 : radios et messages en un seul fil) : masqué par défaut, sauf en Télémétrie où il remplace
// Radios et Messages. Les listes de panneaux masqués enregistrées avant lui (réglages, disposition de chaque séance,
// dispositions enregistrées) le masquent aussi : « +race » marque une liste qui le connaît déjà
export const withRace = (list) => (!Array.isArray(list) || list.includes('+race') ? list : [...list, 'race', '+race']);
export const hiddenByDefault = (design) => (design === 'v3' ? [...PANELS_HIDDEN, 'radio', 'feed', '+race'] : [...PANELS_HIDDEN, 'race', '+race']);
export const TAB_HIDDEN = {
  race: ['laptimes', 'pace', 'tyrehist', 'sectors', 'tyres', 'pitsim', 'battles', 'champ'],
  quali: ['trace', 'positions', 'pits', 'strategy', 'laptimes', 'pace', 'tyrehist', 'tyres', 'pitsim', 'battles', 'champ'],
};

// Version web (classe posée par sa page avant les modules) : elle garde Paddock 2 tant que Télémétrie n'y est pas prêt
const WEB = typeof document !== 'undefined' && document.documentElement.classList.contains('web');
const DEFAULTS = {
  favs: [],               // numéros des pilotes favoris
  favTeams: [],           // écuries favorites (clés de shared/news.js : 'ferrari', 'redbull'…)
  alerts: { sound: true, vibrate: true, notify: false, flags: true, fastest: true, favPit: true, favRcm: true, retire: true, finish: true, favCut: true, rain: true, prono: true },
  hiddenPanels: hiddenByDefault(WEB ? 'v2' : 'v3'),
  raceFeedFilter: 'all',  // Fil de course : tout, radios, direction, enquêtes ou limites de piste
  hiddenTabs: [...TAB_HIDDEN.race],   // onglets masqués (Réglages → Onglets visibles, bouton +), comme ceux inutiles pour la séance
  hiddenCols: ['name'],   // classement : code du pilote seul (nom complet : menu Colonnes)
  extraCols: [],          // colonnes facultatives ajoutées au classement (voir EXTRA_COLUMNS)
  bigCols: null,          // colonnes du classement agrandi (bouton ⤢) : { hidden, extra }, sinon les mêmes
  towerFit: true,         // classement agrandi pour remplir la hauteur disponible
  theme: 'pitwall',       // thème unique de l'application
  design: WEB ? 'v2' : 'v3',   // habillage : 'v3' (Télémétrie, défaut depuis la v1.32) | 'v2' (Paddock 2) | 'classic' (ancien design Pitwall) ; 'broadcast' n'est plus proposé (v1.32)
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
prefs.hiddenPanels = withRace(prefs.hiddenPanels);
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
// v1.32 : le design Broadcast n'est plus proposé (Paddock 2 garde son habillage, broadcast.css, en dessous)
else if (prefs.design === 'broadcast') { prefs.design = 'v2'; storageSet('paddock.prefs', { ...storageGet('paddock.prefs', {}), design: 'v2' }); }
// v1.32 : Télémétrie par défaut dans l'appli (pas encore dans la version web), aussi pour les installations existantes
// en Paddock 2 ; un choix de Classique est gardé. Une seule fois : Paddock 2 se rechoisit dans Réglages → Apparence
if (!WEB && (saved.designV || 0) < 2) { if (prefs.design === 'v2') prefs.design = 'v3'; storageSet('paddock.prefs', { ...storageGet('paddock.prefs', {}), design: prefs.design, designV: 2 }); }
prefs.designV = WEB ? 1 : 2;   // gardé dans chaque enregistrement des préférences
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
  const webDark = document.documentElement.classList.contains('web') && (v === 'dark' || document.documentElement.dataset.design === 'v2');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', webDark ? '#0C1326' : v === 'light' ? '#F4F5F7' : '#07080A');   // version web : couleur de la barre du haut
  // Appli installée sur iPhone : barre d'état claire ou noire (prise en compte au lancement suivant). Version web à barre
  // du haut sombre (Paddock 2, ou apparence sombre) : transparente, la barre du haut remonte derrière l'heure et la batterie
  const bar = webDark ? 'black-translucent' : v === 'light' ? 'default' : 'black';
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', bar);
}
// Habillage : la feuille broadcast.css (posée par-dessus le thème Pitwall) est coupée en design classique et en
// Télémétrie (v3, posé directement sur le thème Pitwall), seulement dans les pages qui chargent design-v3.css (pas
// le Mini ni les overlays de streaming, qui gardent leur habillage)
function applyDesign() {
  document.documentElement.dataset.design = prefs.design;
  const css = document.querySelector('link[href="/css/broadcast.css"]');
  if (css) css.disabled = prefs.design === 'classic' || (prefs.design === 'v3' && !!document.querySelector('link[href="/css/design-v3.css"]'));
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
  if (key === 'hiddenPanels') value = withRace(value);
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
