// État de la séance partagé par la barre du haut et les overlays de streaming : bandeau du drapeau
// (SC, VSC, drapeau rouge…) et temps restant, à l'heure affichée (délai TV compris).
import { store, f1Now } from '../store.js';
import { parseUtc, parseLapTime } from '/shared/f1.js';

const banner = { status: null, greenUntil: 0 };

// Bandeau pleine largeur : SC, VSC, drapeau rouge, jaune (et drapeau vert 10 s à la reprise) ;
// null quand la piste est libre
export function flagBanner() {
  const st = String(store.state.TrackStatus?.Status || '');
  const session = store.state.SessionStatus?.Status;
  const now = performance.now();
  if (st !== banner.status) {
    if (st === '1' && ['4', '5', '6', '7'].includes(banner.status)) banner.greenUntil = now + 10000;
    banner.status = st;
  }
  if (session !== 'Started' && session !== 'Aborted') return null;
  if (st === '5' || session === 'Aborted') return { cls: 'red', text: 'Drapeau rouge', sub: 'Session interrompue' };
  if (st === '4') return { cls: 'sc', text: 'Voiture de sécurité', sub: 'En piste, dépassements interdits' };
  if (st === '6') return { cls: 'vsc', text: 'Voiture de sécurité virtuelle', sub: 'Vitesse limitée sur tout le circuit' };
  if (st === '7') return { cls: 'vsc', text: 'Fin de VSC', sub: 'Reprise imminente' };
  if (st === '2') return { cls: 'yellow', text: 'Drapeau jaune', sub: 'Incident sur la piste' };
  if (st === '1' && now < banner.greenUntil) return { cls: 'green', text: 'Drapeau vert', sub: 'Reprise de la course' };
  return null;
}

// Temps restant de la séance (ms) ; null si inconnu
export function timeLeft() {
  const ec = store.state.ExtrapolatedClock;
  if (!ec?.Remaining) return null;
  let rem = parseLapTime(ec.Remaining) * 1000;
  if (ec.Extrapolating) rem -= f1Now() - parseUtc(ec.Utc);
  return Math.max(0, rem);
}
