// Évolutions techniques et éléments moteur de la Saison : lus dans les documents de la FIA par le serveur de
// Paddock Live (analytics/fia-tech.js, lu par /api/season/fia). Restent ici les outils de lecture des PDF
// (shared/fia-tech.js), utilisés par server/fia-circuit.js.
export { pdfPages, lines, parseTechUpdates, parsePuUsed, parsePuNew, parsePuPenalty, classify, teamOf } from '../shared/fia-tech.js';
