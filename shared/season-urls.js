// Adresses des rubriques de l'espace Saison dans la version web (app.paddocklive.app/saison/2026/pilotes/lando-norris/) :
// à partager, et pour les moteurs de recherche. Lues par la page (ui/season.js) et par le serveur (analytics/season-pages.js).
import { gpShort, gpFull } from './gp-names.js';

export const SECTION_PATHS = {
  home: '', calendar: 'calendrier', standings: 'classements', title: 'course-au-titre', compare: 'comparer', destructors: 'casseurs', review: 'bilan', results: 'resultats', quali: 'qualifications',
  h2h: 'duels', ratings: 'notes', predict: 'pronostics', drivers: 'pilotes', teams: 'ecuries', consistency: 'regularite', pits: 'arrets-aux-stands',
  speeds: 'vitesses', circuits: 'circuits', tech: 'evolutions-techniques', elements: 'elements-moteur', gp: 'grand-prix',
};
export const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const gpSlug = (name) => slug(gpShort(name));

// « /saison/2026/ », « /saison/2026/classements/ », « /saison/2026/pilotes/lando-norris/ »
export function seasonPath(year, section = 'home', item = null) {
  const p = SECTION_PATHS[section] || '';
  return `/saison/${year}/${p ? `${p}/` : ''}${p && item ? `${item}/` : ''}`;
}

// Titre de chaque rubrique (onglet du navigateur, moteurs de recherche) ; name : pilote ou nom du Grand Prix (Jolpica)
const TITLES = {
  home: 'Saison {} de F1 : classements, calendrier et résultats', calendar: 'Calendrier F1 {}', standings: 'Classements F1 {} : pilotes et constructeurs',
  title: 'Course au titre F1 {}', compare: 'Comparer la saison F1 {} à une autre', destructors: 'Championnat des casseurs F1 {} : coût des dégâts', review: 'Bilan de la saison F1 {}', results: 'Résultats F1 {} : tous les Grands Prix', quali: 'Qualifications F1 {} : écart à la pole par écurie', h2h: 'Duels entre coéquipiers F1 {}',
  ratings: 'Notes des pilotes F1 {}', predict: 'Pronostics F1 {} entre amis', drivers: 'Pilotes F1 {}', teams: 'Écuries F1 {} : pilotes, points et résultats', consistency: 'Régularité des pilotes F1 {}',
  pits: 'Arrêts aux stands F1 {} : les plus rapides, par écurie', speeds: 'Vitesses de pointe F1 {}', circuits: 'Profil des circuits F1 {}',
  tech: 'Évolutions techniques F1 {}', elements: 'Éléments moteur F1 {}', gp: 'Grands Prix F1 {}',
};
export function seasonTitle(year, section, name = null, run = true) {
  if (section === 'drivers' && name) return `${name} : saison ${year} de F1, résultats et classement`;
  if (section === 'gp' && name) return `${gpFull(name)} ${year} : ${run ? 'résultats' : 'programme'}`;
  return (TITLES[section] || TITLES.home).replace('{}', year);
}

// Adresse -> { year, section, item } ; year null pour « /saison/ » ; null si ce n'est pas une adresse de la Saison
export function parseSeasonPath(path) {
  if (path === '/saison/' || path === '/saison') return { year: null, section: 'home', item: null };
  const m = /^\/saison\/(\d{4})\/(?:([a-z-]+)\/(?:([a-z0-9-]+)\/)?)?$/.exec(path);
  if (!m) return null;
  const section = m[2] ? Object.keys(SECTION_PATHS).find((k) => SECTION_PATHS[k] === m[2]) : 'home';
  if (!section || (m[3] && section !== 'drivers' && section !== 'gp') || (section === 'gp' && !m[3])) return null;
  return { year: Number(m[1]), section, item: m[3] || null };
}

// Version anglaise (app.paddocklive.app/en/season/…) : mêmes rubriques, chemins anglais ; le nom du Grand Prix en anglais
// (« /en/season/2026/grand-prix/mexico-city/ »). Même table que analytics/season-pages.js (vérifié par
// test/season-pages.test.js), pour que l'appli tienne ses adresses et ses titres anglais.
export const EN_PATHS = {
  home: '', calendar: 'calendar', standings: 'standings', title: 'title-race', compare: 'compare', destructors: 'destructors', review: 'review', results: 'results', quali: 'qualifying',
  h2h: 'head-to-head', ratings: 'ratings', predict: 'predictions', drivers: 'drivers', teams: 'teams', consistency: 'consistency', pits: 'pit-stops',
  speeds: 'top-speeds', circuits: 'circuits', tech: 'upgrades', elements: 'power-unit-elements', gp: 'grand-prix',
};
export const enGpSlug = (name) => slug(gpShort(name, 'en'));
export function enSeasonPath(year, section = 'home', item = null) {
  const p = EN_PATHS[section] || '';
  return `/en/season/${year}/${p ? `${p}/` : ''}${p && item ? `${item}/` : ''}`;
}
// « /en/season/2026/drivers/lando-norris/ » -> { year, section, item, lang: 'en' } ; year null pour « /en/season/ » ; null sinon
export function parseEnSeasonPath(path) {
  if (path === '/en/season/' || path === '/en/season') return { year: null, section: 'home', item: null, lang: 'en' };
  const m = /^\/en\/season\/(\d{4})\/(?:([a-z-]+)\/(?:([a-z0-9-]+)\/)?)?$/.exec(path);
  if (!m) return null;
  const section = m[2] ? Object.keys(EN_PATHS).find((k) => EN_PATHS[k] === m[2]) : 'home';
  if (!section || (m[3] && section !== 'drivers' && section !== 'gp') || (section === 'gp' && !m[3])) return null;
  return { year: Number(m[1]), section, item: m[3] || null, lang: 'en' };
}
const EN_TITLES = {
  home: 'F1 {} season: standings, calendar and results', calendar: 'F1 {} calendar', standings: 'F1 {} standings: drivers and constructors',
  title: 'F1 {} title race', compare: 'Compare the F1 {} season with another', destructors: 'F1 {} destructors\' championship: crash damage', review: 'F1 {} season review',
  results: 'F1 {} results: every Grand Prix', quali: 'F1 {} qualifying: gap to pole by team', h2h: 'F1 {} teammate head-to-heads', ratings: 'F1 {} driver ratings',
  predict: 'F1 {} predictions with friends', drivers: 'F1 {} drivers', teams: 'F1 {} teams: drivers, points and results', consistency: 'F1 {} driver consistency',
  pits: 'F1 {} pit stops: fastest, by team', speeds: 'F1 {} top speeds', circuits: 'F1 {} circuit profiles', tech: 'F1 {} technical upgrades',
  elements: 'F1 {} power unit elements', gp: 'F1 {} Grands Prix',
};
export function enSeasonTitle(year, section, name = null, run = true) {
  if (section === 'drivers' && name) return `${name}: ${year} F1 season results`;
  if (section === 'gp' && name) return `${gpFull(name, 'en')} ${year}: ${run ? 'results' : 'schedule'}`;
  return (EN_TITLES[section] || EN_TITLES.home).replace('{}', year);
}
// Titre de l'onglet : « · Paddock Live » ajouté seulement s'il tient dans 60 caractères (comme les pages du serveur)
export const tabTitle = (title) => (`${title} · Paddock Live`.length <= 60 ? `${title} · Paddock Live` : title);
