// Qualifs, dernières minutes de Q1, Q2, Q3 : la voiture passera-t-elle la ligne avant le drapeau (et pourra-t-elle
// lancer encore un tour) ? Avec le GPS seulement : sa place sur le tour et son allure des dernières secondes.
//   remaining : temps restant de la partie (s, 0 après le drapeau)
//   toLine : distance jusqu'à la ligne, en secondes du tour de référence (shared/track.js)
//   rate : allure, en secondes du tour de référence parcourues par seconde (1 = rythme du tour de référence)
//   hot : en tour lancé ; startedInTime : (après le drapeau) ce tour a commencé avant le drapeau
// -> { call, eta, margin } ; call : 'go' (à temps), 'tight' (juste), 'late' (trop tard), 'last' (dernier tour : en tour
// lancé, commencé à temps, il finira après le drapeau) ; null en dehors des 3 dernières minutes ou si l'allure manque
export const LAST_LAP_WINDOW = 180;

export function lineCall({ remaining, toLine, rate, hot = false, startedInTime = false }) {
  if (!Number.isFinite(remaining) || remaining > LAST_LAP_WINDOW) return null;
  if (remaining <= 0) return hot && startedInTime ? { call: 'last', eta: null, margin: null } : null;
  if (!Number.isFinite(toLine) || !(rate > 0.2)) return null;   // arrêtée, au ralenti : rien
  const eta = toLine / rate;
  const margin = remaining - eta;
  // Marge « juste » : l'allure d'un tour de lancement varie (voitures qui ralentissent pour se faire de la place, puis
  // accélèrent à l'approche de la ligne) ; 2 s plus 10 % du temps qu'il lui reste à rouler
  const band = 2 + 0.1 * eta;
  let call;
  if (hot && margin < 0) call = 'last';
  else if (margin > band) call = 'go';
  else if (margin >= -band) call = 'tight';
  else call = 'late';
  return { call, eta, margin };
}
