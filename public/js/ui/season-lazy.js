// Espace Saison chargé à la demande : ui/season.js et ses modules (statistiques, documents FIA, calculs, rythme,
// pronostics… environ 230 Ko) ne sont lus qu'à la première ouverture de la Saison, pas au premier affichage.
// Tous les appels passent par ici (appli et version web, analytics/live-page/web.js).
const $ = (s) => document.querySelector(s);
let mod = null;
let loading = null;
let urls = false;
const SEASON_PATH = /^\/(saison|en\/season)\//;

export function loadSeason() {
  return (loading ||= import('./season.js').then((m) => {
    m.initSeason();
    if (urls) { m.seasonUrls(); removeEventListener('popstate', pop); }
    mod = m;
    return m;
  }));
}

// Ouverture demandée puis annulée pendant le chargement (autre espace choisi) : la Saison ne s'ouvre pas après coup
let asked = 0;
export async function openSeason(...args) {
  const n = ++asked;
  const m = await loadSeason();
  if (n === asked) m.openSeason(...args);
}

// Saison jamais ouverte : rien à fermer (le module n'est pas chargé pour autant)
export function closeSeason() {
  asked++;
  mod?.closeSeason();
}

export function initSeason() {
  $('#seasonBtn')?.addEventListener('click', () => ($('#seasonView').hidden ? openSeason() : closeSeason()));
}

// Version web : adresses de la Saison. Retour en arrière vers une page de la Saison avant tout chargement : le module
// est chargé, puis il traite ce retour comme les suivants (ui/season.js, seasonPop)
function pop(e) {
  if (mod || !SEASON_PATH.test(location.pathname)) return;
  loadSeason().then((m) => m.seasonPop(e));
}
export function seasonUrls() {
  urls = true;
  if (mod) mod.seasonUrls();
  else addEventListener('popstate', pop);
}
