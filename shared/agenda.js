// Agenda de l'intersaison (carte « Hors saison » de l'Accueil) : présentations des écuries, lancement de la saison,
// essais d'hiver. Aucune API ne les donne : liste tenue à la main. Chaque date est relevée à la source officielle
// (site de l'écurie, formula1.com, FIA) et donnée avec son lien ; une date pas encore annoncée officiellement n'est
// pas écrite (rumeurs et dates « attendues » de la presse non plus).
// date / end : jour (et dernier jour) à l'endroit de l'événement ; team : écurie, pour la présentation d'une seule
// écurie ; title : texte français affiché, traduit par l'interface (clé de public/js/i18n-en.js, -it.js, -es.js).
export const AGENDA = [
  // F1 Live Milan, 18-20 février 2027 ; « F1 The Show » le 18 avec les pilotes et directeurs des 11 écuries
  // (annonce de la F1 du 4 septembre 2026). Heure et salle pas encore annoncées par la F1.
  { date: '2027-02-18', title: 'Lancement de la saison 2027 à Milan, avec les 11 écuries',
    link: 'https://www.formula1.com/en/latest/article/f1-live-to-return-in-2027-with-unmissable-three-day-fan-event-in-milan.wf1XGQ4qkl3Md7Q7o7sX1' },
  // Calendrier 2027 de la F1 : un seul test, quatre jours à Sakhir (horaires « TBC »)
  { date: '2027-02-24', end: '2027-02-27', kind: 'tests', title: 'Essais d’hiver à Bahreïn (4 jours)',
    link: 'https://www.formula1.com/en/racing/2027/pre-season-testing' },
];

// Jour « AAAA-MM-JJ » dans le fuseau de l'appareil
const pad = (n) => String(n).padStart(2, '0');
export const localDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// Dates à venir ou en cours (jusqu'à la fin du dernier jour), dans l'ordre
export function upcomingAgenda(list = AGENDA, now = Date.now()) {
  const today = localDay(now);
  return list.filter((e) => (e.end || e.date) >= today).sort((a, b) => a.date.localeCompare(b.date));
}
