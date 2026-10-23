// « Pendant votre absence » : fenêtre réduite ou cachée plus de 2 min pendant une séance en direct,
// les moments clés (drapeaux, leaders, arrêts, abandons, pénalités…) arrivés entre-temps à l'écran.
// Tirés des événements déjà retardés : rien qui ne soit pas encore passé à la TV.
import { store, on } from '../store.js';
import { esc, sessionKind } from '../util.js';
import { icon } from '../icons.js';
import { keyMoments } from '/shared/moments.js';
import { EN, LOCALE, t } from '../i18n.js';
import { KIND } from './moments.js';
import { FLOAT } from './floatwin.js';

const TOPICS = ['DriverList', 'LapCount', 'TrackStatus', 'TimingAppData', 'TimingData', 'SessionStatus', 'RaceControlMessages'];
const AWAY_MS = 120000;
const MAX_EVENTS = 300000;
let away = null;   // { at, events }

function leave() {
  const s = store.state;
  // Séance en cours, drapeau rouge compris (« Aborted ») : c'est là qu'on s'absente le plus
  if (store.status?.source?.mode !== 'live' || !['Started', 'Aborted'].includes(s.SessionStatus?.Status)) return;
  const at = Date.now();
  // État de départ (pilotes, positions, drapeau), copié : seuls les moments de l'absence sont gardés
  away = { at, events: TOPICS.filter((k) => s[k] && k !== 'RaceControlMessages').map((topic) => ({ topic, data: structuredClone(s[topic]), off: at - 1 })) };
}

function back() {
  const a = away;
  away = null;
  if (!a || Date.now() - a.at < AWAY_MS) return;
  const list = keyMoments(a.events, { kind: sessionKind(store.state), lang: EN ? 'en' : 'fr' }).filter((m) => m.off >= a.at && m.kind !== 'start');
  if (!list.length) return;
  const dlg = document.createElement('dialog');
  dlg.className = 'modal';
  dlg.innerHTML = `<form method="dialog"><h3>${icon('history')} ${t('Pendant votre absence')}</h3>
    <div class="mo-list">${list.map((m) => `<div class="mo-row k-${KIND[m.kind]?.[1] || 'race'}"><span class="mo-ic">${icon(KIND[m.kind]?.[0] || 'dot')}</span>
      <span class="mo-when">${esc(m.lap ? `T${m.lap}` : new Date(m.off).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }))}</span><span class="mo-txt">${esc(t(m.text))}</span></div>`).join('')}</div>
    <div class="row"><span class="spacer"></span><button class="btn btn-accent">${t('Fermer')}</button></div></form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

export function initMissed() {
  if (FLOAT || new URLSearchParams(location.search).has('win')) return;
  document.addEventListener('visibilitychange', () => (document.hidden ? leave() : back()));
  on('reset', () => { away = null; if (document.hidden) leave(); });
  on('events', (events) => {
    if (!away || away.events.length > MAX_EVENTS) return;
    const off = Date.now();
    for (const [topic, data] of events) if (TOPICS.includes(topic)) away.events.push({ topic, data: structuredClone(data), off });
  });
}
