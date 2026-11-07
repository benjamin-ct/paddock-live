// Pilotes du jeu du jour (jours « pilote » de paddocklive.app/jeu/, analytics/jeu/page.mjs) : la grille 2026 et de grands
// champions. Faits relevés dans Jolpica (api.jolpi.ca, base Ergast) le 7 novembre 2026, avant le Grand Prix du Brésil :
// première saison en F1, victoires en Grand Prix, titres mondiaux (saisons 1950 à 2025), écurie de la dernière course.
// Pas mis à jour tout seul : victoires et titres des pilotes en activité arrêtés à cette date (dit sur la page).
// L'ordre ne compte pas pour le jeu du jour (tiré par dailyIndex) ; ne pas retirer de pilote d'une liste en usage sans
// accepter que le pilote du jour change.
export const DRIVERS = [
  { id: 'max_verstappen', name: 'Max Verstappen', nat: 'Dutch', first: 2015, wins: 74, titles: 4, team: 'Red Bull' },
  { id: 'hamilton', name: 'Lewis Hamilton', nat: 'British', first: 2007, wins: 106, titles: 7, team: 'Ferrari' },
  { id: 'antonelli', name: 'Andrea Kimi Antonelli', nat: 'Italian', first: 2024, wins: 9, titles: 0, team: 'Mercedes' },
  { id: 'leclerc', name: 'Charles Leclerc', nat: 'Monegasque', first: 2018, wins: 9, titles: 0, team: 'Ferrari' },
  { id: 'norris', name: 'Lando Norris', nat: 'British', first: 2019, wins: 13, titles: 1, team: 'McLaren' },
  { id: 'russell', name: 'George Russell', nat: 'British', first: 2019, wins: 8, titles: 0, team: 'Mercedes' },
  { id: 'lawson', name: 'Liam Lawson', nat: 'New Zealander', first: 2023, wins: 0, titles: 0, team: 'Racing Bulls' },
  { id: 'bortoleto', name: 'Gabriel Bortoleto', nat: 'Brazilian', first: 2025, wins: 0, titles: 0, team: 'Audi' },
  { id: 'hadjar', name: 'Isack Hadjar', nat: 'French', first: 2025, wins: 0, titles: 0, team: 'Red Bull' },
  { id: 'albon', name: 'Alexander Albon', nat: 'Thai', first: 2019, wins: 0, titles: 0, team: 'Williams' },
  { id: 'sainz', name: 'Carlos Sainz', nat: 'Spanish', first: 2015, wins: 4, titles: 0, team: 'Williams' },
  { id: 'piastri', name: 'Oscar Piastri', nat: 'Australian', first: 2023, wins: 9, titles: 0, team: 'McLaren' },
  { id: 'hulkenberg', name: 'Nico Hülkenberg', nat: 'German', first: 2010, wins: 0, titles: 0, team: 'Audi' },
  { id: 'colapinto', name: 'Franco Colapinto', nat: 'Argentine', first: 2024, wins: 0, titles: 0, team: 'Alpine' },
  { id: 'perez', name: 'Sergio Pérez', nat: 'Mexican', first: 2011, wins: 6, titles: 0, team: 'Cadillac' },
  { id: 'gasly', name: 'Pierre Gasly', nat: 'French', first: 2017, wins: 1, titles: 0, team: 'Alpine' },
  { id: 'arvid_lindblad', name: 'Arvid Lindblad', nat: 'British', first: 2025, wins: 0, titles: 0, team: 'Racing Bulls' },
  { id: 'bearman', name: 'Oliver Bearman', nat: 'British', first: 2024, wins: 0, titles: 0, team: 'Haas' },
  { id: 'bottas', name: 'Valtteri Bottas', nat: 'Finnish', first: 2013, wins: 10, titles: 0, team: 'Cadillac' },
  { id: 'stroll', name: 'Lance Stroll', nat: 'Canadian', first: 2017, wins: 0, titles: 0, team: 'Aston Martin' },
  { id: 'alonso', name: 'Fernando Alonso', nat: 'Spanish', first: 2001, wins: 32, titles: 2, team: 'Aston Martin' },
  { id: 'ocon', name: 'Esteban Ocon', nat: 'French', first: 2016, wins: 1, titles: 0, team: 'Haas' },
  { id: 'tsunoda', name: 'Yuki Tsunoda', nat: 'Japanese', first: 2021, wins: 0, titles: 0, team: 'Racing Bulls' },
  { id: 'vettel', name: 'Sebastian Vettel', nat: 'German', first: 2007, wins: 53, titles: 4, team: 'Aston Martin' },
  { id: 'raikkonen', name: 'Kimi Räikkönen', nat: 'Finnish', first: 2001, wins: 21, titles: 1, team: 'Alfa Romeo' },
  { id: 'button', name: 'Jenson Button', nat: 'British', first: 2000, wins: 15, titles: 1, team: 'McLaren' },
  { id: 'rosberg', name: 'Nico Rosberg', nat: 'German', first: 2006, wins: 23, titles: 1, team: 'Mercedes' },
  { id: 'michael_schumacher', name: 'Michael Schumacher', nat: 'German', first: 1991, wins: 91, titles: 7, team: 'Mercedes' },
  { id: 'senna', name: 'Ayrton Senna', nat: 'Brazilian', first: 1984, wins: 41, titles: 3, team: 'Williams' },
  { id: 'prost', name: 'Alain Prost', nat: 'French', first: 1980, wins: 51, titles: 4, team: 'Williams' },
  { id: 'lauda', name: 'Niki Lauda', nat: 'Austrian', first: 1971, wins: 25, titles: 3, team: 'McLaren' },
  { id: 'hakkinen', name: 'Mika Häkkinen', nat: 'Finnish', first: 1991, wins: 20, titles: 2, team: 'McLaren' },
  { id: 'villeneuve', name: 'Jacques Villeneuve', nat: 'Canadian', first: 1996, wins: 11, titles: 1, team: 'BMW Sauber' },
  { id: 'damon_hill', name: 'Damon Hill', nat: 'British', first: 1992, wins: 22, titles: 1, team: 'Jordan' },
  { id: 'mansell', name: 'Nigel Mansell', nat: 'British', first: 1980, wins: 31, titles: 1, team: 'McLaren' },
  { id: 'piquet', name: 'Nelson Piquet', nat: 'Brazilian', first: 1978, wins: 23, titles: 3, team: 'Benetton' },
  { id: 'ricciardo', name: 'Daniel Ricciardo', nat: 'Australian', first: 2011, wins: 8, titles: 0, team: 'Racing Bulls' },
  { id: 'massa', name: 'Felipe Massa', nat: 'Brazilian', first: 2002, wins: 11, titles: 0, team: 'Williams' },
  { id: 'webber', name: 'Mark Webber', nat: 'Australian', first: 2002, wins: 9, titles: 0, team: 'Red Bull' },
  { id: 'coulthard', name: 'David Coulthard', nat: 'British', first: 1994, wins: 13, titles: 0, team: 'Red Bull' },
  { id: 'barrichello', name: 'Rubens Barrichello', nat: 'Brazilian', first: 1993, wins: 11, titles: 0, team: 'Williams' },
  { id: 'stewart', name: 'Jackie Stewart', nat: 'British', first: 1965, wins: 27, titles: 3, team: 'Tyrrell' },
  { id: 'fangio', name: 'Juan Manuel Fangio', nat: 'Argentine', first: 1950, wins: 24, titles: 5, team: 'Maserati' },
  { id: 'clark', name: 'Jim Clark', nat: 'British', first: 1960, wins: 25, titles: 2, team: 'Lotus' },
];

// Nationalité (Jolpica, en anglais) des pilotes et des écuries -> code du pays (nom du pays dans la langue de la page, drapeau)
export const NAT_ISO = { Argentine: 'ar', Australian: 'au', Austrian: 'at', Brazilian: 'br', British: 'gb', Canadian: 'ca', Dutch: 'nl', Finnish: 'fi', French: 'fr', German: 'de', Italian: 'it', Japanese: 'jp', Mexican: 'mx', Monegasque: 'mc', 'New Zealander': 'nz', Spanish: 'es', Thai: 'th', American: 'us', Swiss: 'ch', Irish: 'ie', Indian: 'in' };
