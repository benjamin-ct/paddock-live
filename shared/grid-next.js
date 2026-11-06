// Grille de la saison suivante (marché des transferts) : aucune API avant la saison, liste tenue à la main. Annonces
// OFFICIELLES seulement : communiqué de l'écurie ou article de formula1.com (choix du 6 nov. 2026 : pas les
// propos d'un dirigeant rapportés par la presse). Un baquet sans annonce officielle reste à confirmer, sans
// nom (driver absent), même quand la presse cite un favori. Chaque baquet : date de l'annonce et lien vers elle ;
// replaces : pilote de l'écurie en 2026 qu'il remplace, d'après l'annonce. was : duo de l'écurie au début de 2026.
// Lu par l'appli (rubrique « Grille 2027 » de la Saison, ui/season-grid.js) et par le serveur (page publique,
// analytics/season-pages.js). À mettre à jour à chaque annonce (date du jour dans updated), vérifiée à la source ;
// nouvelle année : aussi le bouton « Grille 2027 » de public/index.html et sa traduction (test/grid-next.test.js).
export const GRID_NEXT = {
  year: 2027,
  updated: '2026-11-06',
  teams: [
    { team: 'McLaren', id: 'mclaren', was: ['Lando Norris', 'Oscar Piastri'], seats: [
      { driver: 'Lando Norris', date: '2026-08-29', url: 'https://www.mclaren.com/racing/formula-1/2026/lando-norris-contract-extension-2030/' },
      { driver: 'Oscar Piastri', date: '2025-03-11', url: 'https://www.mclaren.com/racing/formula-1/2025/mclaren-formula-1-team-announce-multi-year-contract-extension-with-oscar-piastri/' },
    ] },
    // Aucune annonce pour 2027 (l'annonce d'octobre 2025 ne portait que sur 2026)
    { team: 'Mercedes', id: 'mercedes', was: ['George Russell', 'Kimi Antonelli'], seats: [{}, {}] },
    { team: 'Red Bull Racing', id: 'red_bull', was: ['Max Verstappen', 'Isack Hadjar'], seats: [
      { driver: 'Max Verstappen', date: '2026-08-20', url: 'https://www.formula1.com/en/latest/article/verstappen-signs-contract-extension-with-red-bull-until-the-end-of-2030-ahead-of-dutch-grand-prix.4gUd8JEkYnKmD6bNMS5syw' },
      { driver: 'Isack Hadjar', date: '2026-09-23', url: 'https://www.formula1.com/en/latest/article/red-bull-announce-new-deal-with-hadjar-for-2027-ahead-of-his-return-in-azerbaijan.3QcucG3BkfbWJNk4M5dWme' },
    ] },
    { team: 'Ferrari', id: 'ferrari', was: ['Charles Leclerc', 'Lewis Hamilton'], seats: [
      { driver: 'Charles Leclerc', date: '2026-06-03', url: 'https://www.formula1.com/en/latest/article/ferrari-announce-new-multi-year-deal-with-leclerc-ahead-of-monaco-gp.5Mz0PYSKh0YT40Af4LEJdT' },
      {},   // Hamilton : déclaration de Frédéric Vasseur à la presse (juillet 2026), pas d'annonce officielle de Ferrari
    ] },
    { team: 'Williams', id: 'williams', was: ['Alex Albon', 'Carlos Sainz'], seats: [
      { driver: 'Alex Albon', date: '2026-08-18', url: 'https://www.formula1.com/en/latest/article/williams-confirm-albon-will-remain-with-the-team-in-2027.3ZwdrAmEY4MGL5Ce1eXHIQ' },
      { driver: 'Carlos Sainz', date: '2026-08-19', url: 'https://www.formula1.com/en/latest/article/sainz-agrees-new-multi-year-contract-with-williams-as-team-complete-2027-driver-line-up.66fBQTFaXXt7oIUfzi8NiO' },
    ] },
    { team: 'Racing Bulls', id: 'rb', was: ['Liam Lawson', 'Arvid Lindblad'], seats: [{}, {}] },
    { team: 'Aston Martin', id: 'aston_martin', was: ['Fernando Alonso', 'Lance Stroll'], seats: [
      { driver: 'Fernando Alonso', date: '2026-09-29', url: 'https://www.formula1.com/en/latest/article/alonso-and-stroll-to-stay-at-aston-martin-in-2027-as-team-confirm-unchanged-line-up.7xg2Sct45vzW92UaiE8YXR' },
      { driver: 'Lance Stroll', date: '2026-09-29', url: 'https://www.formula1.com/en/latest/article/alonso-and-stroll-to-stay-at-aston-martin-in-2027-as-team-confirm-unchanged-line-up.7xg2Sct45vzW92UaiE8YXR' },
    ] },
    { team: 'Haas', id: 'haas', was: ['Esteban Ocon', 'Oliver Bearman'], seats: [
      { driver: 'Rafael Câmara', date: '2026-10-15', replaces: 'Esteban Ocon', url: 'https://www.formula1.com/en/latest/article/ferrari-junior-rafael-camara-promoted-to-f1-with-haas-for-2027.1RSxvnFaLu8Hd3JD2ppFsz' },
      {},
    ] },
    // Conférence de presse de la FIA à Bakou : « nos pilotes avaient un contrat », aucun communiqué
    { team: 'Audi', id: 'audi', was: ['Nico Hülkenberg', 'Gabriel Bortoleto'], seats: [
      {},   // Hülkenberg et Bortoleto : propos de Mattia Binotto rapportés par la presse (sept. 2026), pas d'annonce d'Audi
      {},
    ] },
    { team: 'Alpine', id: 'alpine', was: ['Pierre Gasly', 'Franco Colapinto'], seats: [
      { driver: 'Pierre Gasly', date: '2026-08-27', url: 'https://www.formula1.com/en/latest/article/alpine-announce-colapinto-contract-extension-as-team-confirms-unchanged-2027-line-up.DL3dVyZLJm5cHryWcHyPq' },
      { driver: 'Franco Colapinto', date: '2026-08-27', url: 'https://www.formula1.com/en/latest/article/alpine-announce-colapinto-contract-extension-as-team-confirms-unchanged-2027-line-up.DL3dVyZLJm5cHryWcHyPq' },
    ] },
    // Bottas : Cadillac n'a rien annoncé pour 2027 (prolongation de Pérez seulement)
    { team: 'Cadillac', id: 'cadillac', was: ['Sergio Pérez', 'Valtteri Bottas'], seats: [
      { driver: 'Sergio Pérez', date: '2026-10-28', url: 'https://www.formula1.com/en/latest/article/perez-signs-contract-extension-to-remain-at-cadillac-until-at-least-2029.4oF3HFX8tK9qTWvU7wAXHM' },
      {},
    ] },
  ],
};

// Chiffres de la grille et changements de chaque écurie par rapport à son duo de 2026 : arrivées (nouveau pilote,
// pilote remplacé d'après l'annonce) ; same : les deux baquets confirmés, mêmes pilotes qu'en 2026
export function gridSummary(g = GRID_NEXT) {
  const teams = g.teams.map((x) => {
    const named = x.seats.filter((s) => s.driver);
    return { ...x, open: x.seats.length - named.length, arrivals: named.filter((s) => !x.was.includes(s.driver)),
      same: named.length === x.seats.length && named.every((s) => x.was.includes(s.driver)) };
  });
  const seats = teams.reduce((n, x) => n + x.seats.length, 0), open = teams.reduce((n, x) => n + x.open, 0);
  return { teams, seats, confirmed: seats - open, open, complete: teams.filter((x) => !x.open).length, arrivals: teams.flatMap((x) => x.arrivals) };
}
