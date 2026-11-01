// Compte à rebours de l'icône de la barre des menus (macOS) / de la zone de notification (Windows, Linux) :
// texte d'après le calendrier des séances (« EL1 2 h 14 », « Course 12 min », « Course LIVE »).

// Durée approximative d'une séance, comme sur l'accueil : la course 2 h 30, les autres 1 h 15
const lengthOf = (label) => (label === 'Course' ? 150 : 75) * 60e3;

// sessions : [{ label, t }] triées par heure (t en ms) ; tr : traduction des libellés ; day : « jours » abrégé
function countdown(sessions, now, { tr = (s) => s, day = 'j' } = {}) {
  const live = sessions.find((s) => now >= s.t && now < s.t + lengthOf(s.label));
  const next = sessions.find((s) => s.t > now) || null;
  if (live) return { next, text: `${tr(live.label)} LIVE` };
  if (!next) return { next, text: '' };
  const m = Math.ceil((next.t - now) / 60e3);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
  const left = d ? `${d} ${day} ${String(h).padStart(2, '0')} h` : h ? `${h} h ${String(min).padStart(2, '0')}` : `${min} min`;
  return { next, text: `${tr(next.label)} ${left}` };
}

module.exports = { countdown };
