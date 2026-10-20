// Alertes sonores / visuelles. Elles sont déclenchées par les événements *retardés* :
// elles arrivent donc en même temps que l'image TV, jamais avant (pas de spoiler).
import { store, on } from '../store.js';
import { $, esc, drivers } from '../util.js';
import { prefs, setPref, isFav } from '../prefs.js';
import { toast } from './delay.js';
import { icon } from '../icons.js';
import { FLOAT } from './floatwin.js';
import { EN } from '../i18n.js';
import { rcmFr } from '/shared/rcm-fr.js';

let audio = null;

// Petits signaux sonores synthétisés (pas de fichier audio).
function beep(kind) {
  if (!prefs.alerts.sound || prefs.muted) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const tones = {
      red: [[880, 0.18], [660, 0.18], [880, 0.18], [660, 0.3]],
      sc: [[740, 0.2], [740, 0.2], [740, 0.35]],
      green: [[660, 0.12], [990, 0.25]],
      info: [[880, 0.12]],
      fastest: [[990, 0.1], [1320, 0.2]],
      fav: [[523, 0.12], [784, 0.2]],
    }[kind] || [[880, 0.12]];
    let t = audio.currentTime;
    for (const [f, d] of tones) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = f;
      o.type = 'triangle';
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + d + 0.02);
      t += d + 0.05;
    }
  } catch { /* audio indisponible */ }
}

// Vibration du téléphone (Android ; iPhone : non pris en charge par Safari)
function buzz(kind) {
  if (!prefs.alerts.vibrate || prefs.muted || !navigator.vibrate) return;
  const pattern = { red: [400, 150, 400, 150, 400], sc: [300, 150, 300], green: [150, 100, 150], fav: [120, 80, 120] }[kind] || [150];
  try { navigator.vibrate(pattern); } catch { /* ignore */ }
}

// Icône du message selon le type d'alerte
const KIND_ICON = { red: 'flag', sc: 'siren', green: 'checkered', info: 'warning', fastest: 'stopwatch', fav: 'star' };

function notify(title, body, kind) {
  beep(kind);
  buzz(kind);
  toast(`${title}${body ? ' — ' + body : ''}`, 5000, KIND_ICON[kind] || 'bell');
  if (prefs.alerts.notify && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, silent: true }); } catch { /* ignore */ }
  }
}

// Rappel avant une séance (voir reminders.js) : son, vibration, message et notification système
// (même quand la fenêtre est au premier plan : c'est souvent le moment de lancer la télé)
export function notifyReminder(title, body) {
  beep('info');
  buzz('info');
  toast(`${title} — ${body}`, 10000, 'bell');
  if (prefs.alerts.notify && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, silent: true }); } catch { /* ignore */ }
  }
}

// Actualités (voir news.js) : même son, vibration et notification que les alertes de course ; un
// clic sur la notification ouvre l'espace Actu
export function notifyNews(title, body, kind, onClick) {
  beep(kind);
  buzz(kind);
  toast(`${title} — ${body}`, 8000, 'news');
  if (prefs.alerts.notify && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, { body, silent: true });
      n.onclick = () => { window.focus(); onClick?.(); n.close(); };
    } catch { /* ignore */ }
  }
}

const TRACK_ALERT = {
  '4': ['Voiture de sécurité', 'sc'],
  '5': ['Drapeau rouge', 'red'],
  '6': ['Voiture de sécurité virtuelle', 'sc'],
};

let lastTrack = null;

function onEvents(events) {
  const a = prefs.alerts;
  const dl = drivers(store.state);
  const tla = (n) => dl[n]?.Tla || `#${n}`;
  for (const [topic, data] of events) {
    if (!data || typeof data !== 'object') continue;
    if (topic === 'TrackStatus' && data.Status && a.flags) {
      const st = String(data.Status);
      if (st !== lastTrack) {
        if (TRACK_ALERT[st]) notify(TRACK_ALERT[st][0], '', TRACK_ALERT[st][1]);
        else if (st === '1' && ['4', '5', '6', '7'].includes(lastTrack)) notify('Piste dégagée', 'Reprise de la course', 'green');
        lastTrack = st;
      }
    } else if (topic === 'SessionStatus' && data.Status === 'Finished' && a.finish) {
      notify('Drapeau à damier', '', 'green');
    } else if (topic === 'TimingData' && data.Lines) {
      for (const [num, l] of Object.entries(data.Lines)) {
        if (!l || typeof l !== 'object') continue;
        if (a.fastest && l.LastLapTime?.OverallFastest === true && l.LastLapTime?.Value) {
          notify(`Meilleur tour : ${tla(num)}`, l.LastLapTime.Value, 'fastest');
        }
        if (a.favPit && isFav(num) && l.InPit === true) notify(`${tla(num)} rentre aux stands`, '', 'fav');
        if (a.retire && (l.Retired === true || l.Stopped === true) && store.state.SessionStatus?.Status === 'Started') notify(`${tla(num)} ${l.Retired ? 'abandonne' : 'est arrêté'}`, '', 'info');
      }
    } else if (topic === 'RaceControlMessages' && data.Messages && a.favRcm) {
      const msgs = Array.isArray(data.Messages) ? data.Messages : Object.values(data.Messages);
      for (const m of msgs) {
        const nums = new Set([m?.RacingNumber, ...String(m?.Message || '').matchAll(/CAR (\d+)/g)].map((x) => (Array.isArray(x) ? x[1] : x)).filter(Boolean).map(String));
        const fav = [...nums].find((n) => isFav(n));
        if (fav && m.Flag !== 'BLUE') notify(`${tla(fav)} — direction de course`, (!EN && rcmFr(m.Message)) || m.Message, 'fav');
      }
    }
  }
}

export function initAlerts() {
  // Carte flottante : pas d'alertes (message et son déjà donnés par la fenêtre principale)
  if (FLOAT) return;
  on('reset', () => { lastTrack = String(store.state.TrackStatus?.Status || ''); });
  on('events', onEvents);
  // Téléphones et tablettes : le son n'est autorisé qu'après un premier appui sur l'écran
  window.addEventListener('pointerdown', () => {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch { /* audio indisponible */ }
  }, { passive: true });
  const toggleMute = () => {
    setPref('muted', !prefs.muted);
    toast(prefs.muted ? 'Son des alertes coupé (touche M pour le remettre)' : 'Son des alertes activé', 2500, prefs.muted ? 'bell-off' : 'bell');
  };
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'm' || e.key === 'M') && !e.target.closest('input, select, textarea')) toggleMute();
  });
  // Bouton de la barre du haut : cloche (son actif) ou cloche barrée (coupé)
  const btn = $('#muteBtn');
  const showMute = () => {
    if (!btn) return;
    const off = prefs.muted || !prefs.alerts.sound;
    btn.innerHTML = icon(off ? 'bell-off' : 'bell');
    btn.classList.toggle('off', off);
    btn.title = off ? 'Son des alertes coupé — cliquer pour le remettre (touche M)' : 'Son des alertes actif — cliquer pour le couper (touche M)';
  };
  btn?.addEventListener('click', () => {
    // Son décoché dans les Réglages : le bouton le réactive
    if (!prefs.alerts.sound) { setPref('alerts', { ...prefs.alerts, sound: true }); setPref('muted', false); toast('Son des alertes activé', 2500, 'bell'); renderAlertOptions(); } else toggleMute();
  });
  on('prefs', (k) => { if (k === 'muted' || k === 'alerts') showMute(); });
  showMute();
  renderAlertOptions();
}

const OPTS = [
  ['sound', 'Son'], ['vibrate', 'Vibration (téléphone)'], ['notify', 'Notification Windows (onglet en arrière-plan)'], ['flags', 'SC / VSC / drapeau rouge'],
  ['fastest', 'Meilleur tour'], ['favPit', 'Arrêt d\'un favori'], ['favRcm', 'Messages FIA sur un favori'],
  ['retire', 'Abandons'], ['finish', 'Arrivée'],
];

export function renderAlertOptions() {
  const el = $('#alertOpts');
  el.innerHTML = OPTS.filter(([k]) => k !== 'vibrate' || ('vibrate' in navigator && matchMedia('(pointer: coarse)').matches)).map(([k, label]) => `<label class="toggle small"><input type="checkbox" data-alert="${k}" ${prefs.alerts[k] ? 'checked' : ''}> ${esc(label)}</label>`).join('');
  el.onchange = (e) => {
    const k = e.target.dataset.alert;
    if (!k) return;
    setPref('alerts', { ...prefs.alerts, [k]: e.target.checked });
    if (k === 'notify' && e.target.checked && 'Notification' in window) Notification.requestPermission();
  };
  $('#alertTest').onclick = () => notify('Voiture de sécurité', 'Exemple d\'alerte', 'sc');
}
