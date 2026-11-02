// ADN des circuits : notes de 1 à 5 d'après les infographies « Grand Prix Preview » de Pirelli (press.pirelli.com),
// lues sur l'image publiée avant chaque Grand Prix et vérifiées à l'œil (valeurs transcrites, jamais l'image). season : année
// de la preview (2025 tant que celle de 2026 n'est pas publiée). Clé : circuitId de Jolpica.
export const DNA_KEYS = [
  ['traction', 'Traction'], ['asphaltGrip', 'Adhérence de l\'asphalte'], ['asphaltAbrasion', 'Abrasion de l\'asphalte'],
  ['trackEvolution', 'Évolution de la piste'], ['tyreStress', 'Contrainte sur les pneus'], ['braking', 'Freinage'], ['lateral', 'Appui latéral'],
];
export const CIRCUIT_DNA = {
  albert_park: { traction: 2, asphaltGrip: 2, asphaltAbrasion: 2, trackEvolution: 4, tyreStress: 3, braking: 2, lateral: 3, season: 2026, source: 'https://press.pirelli.com/melbourne-writes-the-first-chapter-of-the-new-f1-season/' },
  shanghai: { traction: 3, asphaltGrip: 3, asphaltAbrasion: 2, trackEvolution: 4, tyreStress: 4, braking: 4, lateral: 4, season: 2026, source: 'https://press.pirelli.com/the-first-sprint-of-the-season-in-shanghai/' },
  suzuka: { traction: 3, asphaltGrip: 4, asphaltAbrasion: 3, trackEvolution: 4, tyreStress: 5, braking: 2, lateral: 5, season: 2026, source: 'https://press.pirelli.com/the-suzuka-challenge-with-the-hardest-trio-in-the-range/' },
  miami: { traction: 3, asphaltGrip: 3, asphaltAbrasion: 3, trackEvolution: 5, tyreStress: 3, braking: 3, lateral: 3, season: 2026, source: 'https://press.pirelli.com/formula-1-returns-to-the-track-in-miami/' },
  villeneuve: { traction: 4, asphaltGrip: 2, asphaltAbrasion: 1, trackEvolution: 5, tyreStress: 3, braking: 5, lateral: 1, season: 2026, source: 'https://press.pirelli.com/the-first-sprint-in-montreal/' },
  monaco: { traction: 5, asphaltGrip: 2, asphaltAbrasion: 1, trackEvolution: 5, tyreStress: 1, braking: 2, lateral: 1, season: 2026, source: 'https://press.pirelli.com/the-jewel-of-formula-1-history-and-glamour-at-the-monaco-gp/' },
  catalunya: { traction: 3, asphaltGrip: 2, asphaltAbrasion: 4, trackEvolution: 3, tyreStress: 5, braking: 3, lateral: 5, season: 2026, source: 'https://press.pirelli.com/six-months-on-formula-1-returns-to-barcelona/' },
  red_bull_ring: { traction: 2, asphaltGrip: 3, asphaltAbrasion: 3, trackEvolution: 3, tyreStress: 3, braking: 3, lateral: 3, season: 2026, source: 'https://press.pirelli.com/red-bull-at-home-the-spielberg-weekend/' },
  silverstone: { traction: 3, asphaltGrip: 4, asphaltAbrasion: 2, trackEvolution: 2, tyreStress: 5, braking: 2, lateral: 5, season: 2026, source: 'https://press.pirelli.com/the-challenges-of-silverstone-the-cradle-of-motorsport/' },
  spa: { traction: 4, asphaltGrip: 3, asphaltAbrasion: 3, trackEvolution: 3, tyreStress: 5, braking: 4, lateral: 5, season: 2026, source: 'https://press.pirelli.com/formula-1-faces-its-spa-francorchamps-exam/' },
  hungaroring: { traction: 4, asphaltGrip: 3, asphaltAbrasion: 3, trackEvolution: 4, tyreStress: 3, braking: 3, lateral: 3, season: 2026, source: 'https://press.pirelli.com/the-heat-is-on-in-budapest/' },
  zandvoort: { traction: 3, asphaltGrip: 3, asphaltAbrasion: 3, trackEvolution: 4, tyreStress: 5, braking: 3, lateral: 4, season: 2026, source: 'https://press.pirelli.com/in-the-netherlands-with-the-sprint-format/' },
  monza: { traction: 3, asphaltGrip: 3, asphaltAbrasion: 2, trackEvolution: 4, tyreStress: 3, braking: 4, lateral: 2, season: 2026, source: 'https://press.pirelli.com/pirelli-headlines-italian-grand-prix-weekend-at-monza/' },
  madring: { traction: 3, asphaltGrip: 4, asphaltAbrasion: 2, trackEvolution: 5, tyreStress: 3, braking: 3, lateral: 4, season: 2026, source: 'https://press.pirelli.com/the-madring-makes-its-world-championship-debut-with-the-challenge-of-the-monumental/' },
  baku: { traction: 5, asphaltGrip: 2, asphaltAbrasion: 1, trackEvolution: 5, tyreStress: 3, braking: 4, lateral: 1, season: 2026, source: 'https://press.pirelli.com/appointment-on-saturday-for-the-azerbaijan-grand-prix/' },
  sepang: { traction: 3, asphaltGrip: 2, asphaltAbrasion: 4, trackEvolution: 4, tyreStress: 4, braking: 4, lateral: 4, season: 2026, source: 'https://press.pirelli.com/sepang-reopens-its-doors-to-formula-1-after-nine-years/' },
  marina_bay: { traction: 4, asphaltGrip: 3, asphaltAbrasion: 3, trackEvolution: 5, tyreStress: 2, braking: 5, lateral: 2, season: 2026, source: 'https://press.pirelli.com/spotlight-on-singapore/' },
  americas: { traction: 4, asphaltGrip: 3, asphaltAbrasion: 3, trackEvolution: 4, tyreStress: 4, braking: 3, lateral: 4, season: 2026, source: 'https://press.pirelli.com/in-the-land-of-the-cowboys/' },
  rodriguez: { traction: 3, asphaltGrip: 2, asphaltAbrasion: 2, trackEvolution: 5, tyreStress: 2, braking: 3, lateral: 2, season: 2025, source: 'https://press.pirelli.com/once-again-a-skip-in-compounds-for-the-mexico-city-weekend/' },
  interlagos: { traction: 3, asphaltGrip: 3, asphaltAbrasion: 2, trackEvolution: 5, tyreStress: 3, braking: 3, lateral: 3, season: 2025, source: 'https://press.pirelli.com/harder-compounds-for-the-sao-paulo-sprint-weekend/' },
  vegas: { traction: 2, asphaltGrip: 1, asphaltAbrasion: 2, trackEvolution: 5, tyreStress: 4, braking: 3, lateral: 2, season: 2025, source: 'https://press.pirelli.com/roulette-in-las-vegas/' },
  losail: { traction: 3, asphaltGrip: 4, asphaltAbrasion: 2, trackEvolution: 4, tyreStress: 5, braking: 3, lateral: 5, season: 2025, source: 'https://press.pirelli.com/another-desert-this-time-in-doha/' },
  yas_marina: { traction: 4, asphaltGrip: 3, asphaltAbrasion: 3, trackEvolution: 4, tyreStress: 3, braking: 4, lateral: 3, season: 2025, source: 'https://press.pirelli.com/in-abu-dhabi-for-a-first-step-towards-the-f1-of-the-future/' },
};
