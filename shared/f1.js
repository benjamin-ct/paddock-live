// Utilitaires communs (serveur + navigateur) pour interpréter les données F1 Live Timing.

// Topics demandés au flux live. Les topics ".z" sont compressés (deflate brut + base64).
export const LIVE_TOPICS = [
  'Heartbeat', 'CarData.z', 'Position.z', 'ExtrapolatedClock', 'TopThree', 'TimingStats',
  'TimingAppData', 'WeatherData', 'TrackStatus', 'SessionStatus', 'DriverList',
  'RaceControlMessages', 'SessionInfo', 'SessionData', 'LapCount', 'TimingData', 'TeamRadio',
  'PitLaneTimeCollection', 'PitStopSeries', 'PitStop', 'ChampionshipPrediction', 'TyreStintSeries',
];

// Délai TV minimal : le GPS et la télémétrie arrivent 2 à 3 s après les chronos, parfois plus ; en dessous, la carte et la
// télémétrie n'ont pas encore le point suivant et avancent par à-coups
export const MIN_DELAY_MS = 5000;

// Topics chargés depuis les archives (replay).
export const ARCHIVE_TOPICS = [
  'SessionInfo', 'SessionData', 'SessionStatus', 'TrackStatus', 'ExtrapolatedClock', 'Heartbeat',
  'DriverList', 'TimingData', 'TimingAppData', 'TimingStats', 'TopThree', 'LapCount',
  'RaceControlMessages', 'TeamRadio', 'WeatherData', 'PitLaneTimeCollection', 'PitStopSeries',
  'TyreStintSeries', 'ChampionshipPrediction', 'Position.z', 'CarData.z',
];

export function topicName(raw) {
  return raw.endsWith('.z') ? raw.slice(0, -2) : raw;
}

// Les horodatages F1 n'ont pas toujours de fuseau : ils sont en UTC.
export function parseUtc(s) {
  if (!s) return NaN;
  if (typeof s === 'number') return s;
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
}

// Drapeau à damier (messages de la direction de course) : heure UTC du dernier de la séance, ou de la partie
// des qualifs tant qu'un feu vert ne l'a pas suivi ; null sinon
export function chequeredUtc(messages) {
  let at = null;
  for (const m of Array.isArray(messages) ? messages : Object.values(messages || {})) {
    if (m?.Flag === 'CHEQUERED') at = parseUtc(m.Utc);
    else if (m?.Flag === 'GREEN' && m.Scope === 'Track') at = null;
  }
  return Number.isFinite(at) ? at : null;
}

// Mode dépassement 2026 (successeur du DRS) activé par la direction de course : son dernier message OVERTAKE ENABLED /
// DISABLED (coupé avant le départ, rétabli en fin de premier tour) ; activé quand il n'y a pas de message
export function overtakeEnabled(messages) {
  let on = true;
  for (const m of Array.isArray(messages) ? messages : Object.values(messages || {})) {
    const t = String(m?.Message || '').trim().toUpperCase();
    if (t === 'OVERTAKE ENABLED') on = true;
    else if (t === 'OVERTAKE DISABLED') on = false;
  }
  return on;
}

// "1:45.123" -> 105.123 ; "45.123" -> 45.123 ; "" -> null
export function parseLapTime(s) {
  if (s === null || s === undefined || s === '') return null;
  if (typeof s === 'number') return s;
  const parts = String(s).trim().split(':');
  let total = 0;
  for (const p of parts) {
    const n = parseFloat(p);
    if (Number.isNaN(n)) return null;
    total = total * 60 + n;
  }
  return Math.round(total * 1000) / 1000;
}

// Écart au leader / intervalle.
// "+1.234" -> {s: 1.234} ; "1 L" / "+2 LAPS" -> {laps: 1} ; "LAP 23" (leader) -> {s: 0}
export function parseGap(s) {
  if (s === null || s === undefined) return null;
  const str = String(s).trim();
  if (str === '') return null;
  if (/^LAP\b/i.test(str)) return { s: 0, leader: true };
  const lapMatch = str.match(/^\+?(\d+)\s*L/i);
  if (lapMatch) return { laps: parseInt(lapMatch[1], 10) };
  const n = parseFloat(str.replace('+', ''));
  if (Number.isNaN(n)) return null;
  return { s: n };
}

export const TRACK_STATUS = {
  '1': { label: 'Piste dégagée', short: 'VERT', color: 'green' },
  '2': { label: 'Drapeau jaune', short: 'JAUNE', color: 'yellow' },
  '3': { label: 'Drapeau jaune', short: 'JAUNE', color: 'yellow' },
  '4': { label: 'Voiture de sécurité', short: 'SC', color: 'sc' },
  '5': { label: 'Drapeau rouge', short: 'ROUGE', color: 'red' },
  '6': { label: 'Voiture de sécurité virtuelle', short: 'VSC', color: 'vsc' },
  '7': { label: 'Fin de VSC', short: 'VSC FIN', color: 'vsc' },
};

export function trackStatusInfo(status) {
  return TRACK_STATUS[String(status)] || { label: 'Statut inconnu', short: '—', color: 'none' };
}

export const SESSION_STATUS_FR = {
  Inactive: 'Pas commencée',
  Started: 'En cours',
  Aborted: 'Interrompue',
  Finished: 'Terminée',
  Finalised: 'Résultats finalisés',
  Ends: 'Terminée',
};

// Codes de statut des mini-secteurs.
export function segmentClass(status) {
  switch (status) {
    case 2048: return 'seg-yellow';
    case 2049: return 'seg-green';
    case 2051: return 'seg-purple';
    case 2064: return 'seg-pit';
    case 2052: return 'seg-yellow';
    default: return status ? 'seg-yellow' : 'seg-none';
  }
}
