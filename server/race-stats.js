// Statistiques détaillées de la Saison : calculées par le serveur de Paddock Live (analytics/race-stats.js, lu par
// /api/season/stats). Reste ici le calcul d'une course (shared/race-stats.js, tests) et le message des archives.
export { summarizeRace, trackLength, outline } from '../shared/race-stats.js';

// Message lisible quand l'index des archives officielles d'une année est inaccessible
export function archiveError(year, err) {
  if (err?.locked) return err.message;   // archives réservées aux abonnés F1 TV
  return err?.status === 403 || err?.status === 404
    ? `la F1 ne donne pas accès aux archives officielles de ${year}`
    : `archives officielles de la F1 injoignables (${err?.message || err}) ; nouvel essai dans quelques minutes`;
}
