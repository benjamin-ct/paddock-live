// Rappels avant chaque séance du week-end (essais, qualifications, sprint, course), dans
// l'application ouverte. Pour être prévenu application fermée : calendrier .ics (Saison →
// Calendrier ou Réglages → Alertes), qui contient la même alarme.
import { api, storageGet, storageSet } from '../util.js';
import { prefs } from '../prefs.js';
import { notifyReminder } from './alerts.js';
import { dueReminders } from '/shared/ics.js';
import { LOCALE, EN } from '../i18n.js';
import { gpFull } from '/shared/gp-names.js';
import { pronoMissing } from './predict-view.js';

const PRONO = { Qualifications: ['pole', 'Pole'], Course: ['p1', 'Podium'] };

let schedule = [];   // [{ name, label, t }]
let loadedAt = 0;

async function load() {
  const year = new Date().getFullYear();
  try {
    const d = await api(`/api/schedule?year=${year}`);
    schedule = d.races.flatMap((r) => r.sessions.filter((s) => s.t).map((s) => ({ name: r.name, label: s.label, t: Date.parse(s.t) })));
    loadedAt = Date.now();
  } catch { /* hors ligne : nouvel essai plus tard */ }
}


// Pronostics : une heure avant leur fermeture (début des qualifs, départ de la course), s'il manque
async function pronoCheck() {
  if (!prefs.alerts.prono) return;
  const done = storageGet('paddock.reminded', []);
  const due = dueReminders(schedule.filter((s) => PRONO[s.label]), Date.now(), 60, done.filter((k) => k.startsWith('prono|')).map((k) => k.slice(6)));
  if (!due.length) return;
  storageSet('paddock.reminded', [...done, ...due.map((s) => `prono|${s.t}|${s.label}`)].slice(-60));
  for (const s of due) {
    const [field, what] = PRONO[s.label];
    if (await pronoMissing(new Date(s.t).getFullYear(), field)) {
      notifyReminder(`Pronostics — ${gpFull(s.name, EN, 'GP')}`, `${what} : fermeture dans ${Math.max(1, Math.round((s.t - Date.now()) / 60e3))} min, votre pronostic n'est pas encore fait`);
    }
  }
}

function check() {
  if (Date.now() - loadedAt > 6 * 3600e3) load();
  pronoCheck();
  const done = storageGet('paddock.reminded', []);
  const due = dueReminders(schedule, Date.now(), Number(prefs.remindMin) || 0, done);
  if (!due.length) return;
  // Mémorisé avant d'alerter : une seule alerte même avec plusieurs fenêtres ouvertes
  storageSet('paddock.reminded', [...done, ...due.map((s) => `${s.t}|${s.label}`)].slice(-60));
  for (const s of due) {
    const min = Math.max(1, Math.round((s.t - Date.now()) / 60e3));
    notifyReminder(`${gpFull(s.name, EN, 'GP')} — ${s.label}`, `début dans ${min} min (${new Date(s.t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })})`);
  }
}

export function initReminders() {
  // Fenêtre principale uniquement (pas les panneaux détachés)
  if (new URLSearchParams(location.search).has('win')) return;
  load().then(check);
  setInterval(check, 30000);
}
