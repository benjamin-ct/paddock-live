// Adresses des rubriques de l'espace Saison dans la version web (app.paddocklive.app/saison/2026/pilotes/lando-norris/) :
// à partager, et pour les moteurs de recherche. Lues par la page (ui/season.js) et par le serveur (analytics/season-pages.js).
import { gpShort, gpFull } from './gp-names.js';

export const SECTION_PATHS = {
  home: '', calendar: 'calendrier', standings: 'classements', title: 'course-au-titre', compare: 'comparer', destructors: 'casseurs', review: 'bilan', results: 'resultats',
  h2h: 'duels', ratings: 'notes', predict: 'pronostics', drivers: 'pilotes', consistency: 'regularite', pits: 'arrets-aux-stands',
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
  title: 'Course au titre F1 {}', compare: 'Comparer la saison F1 {} à une autre', destructors: 'Championnat des casseurs F1 {} : coût des dégâts', review: 'Bilan de la saison F1 {}', results: 'Résultats F1 {} : tous les Grands Prix', h2h: 'Duels entre coéquipiers F1 {}',
  ratings: 'Notes des pilotes F1 {}', predict: 'Pronostics F1 {} entre amis', drivers: 'Pilotes F1 {}', consistency: 'Régularité des pilotes F1 {}',
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
