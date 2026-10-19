// Statistiques d'utilisation anonymes (avec accord) : les fonctions utilisées dans cette fenêtre sont
// comptées puis confiées au serveur de l'appli, qui envoie les totaux. Question posée dans un bandeau
// discret jusqu'à la réponse ; réglage dans Réglages → Application.
import { $ } from '../util.js';
import { t, EN } from '../i18n.js';
import { icon } from '../icons.js';
import { toast } from './delay.js';
import { cleanErrorText, stackFrames } from '/shared/stats.js';

let on = null;   // null tant que le réglage n'est pas connu : les événements attendent
const queue = new Map();
let timer = null;
let errors = 0;
const errQueue = new Map();   // détail des erreurs : clé -> { w, k, m, s, n }

const device = () => (window.f1desktop ? 'desktop' : document.querySelector('.grid.mobile') ? 'phone' : 'browser');

function send() {
  clearTimeout(timer);
  timer = null;
  if (!on || (!queue.size && !errQueue.size)) return;
  const events = Object.fromEntries(queue);
  const errs = [...errQueue.values()];
  queue.clear();
  errQueue.clear();
  fetch('/api/stats/events', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events, device: device(), errors: errs }) }).catch(() => {});
}

export function track(name) {
  if (on === false || !/^[a-z0-9][a-z0-9._:-]{0,63}$/.test(name)) return;
  queue.set(name, (queue.get(name) || 0) + 1);
  if (on && !timer) timer = setTimeout(send, 60e3);
}

// Détail d'une erreur : message technique nettoyé et chemin d'appel (voir shared/stats.js)
function trackError(w, k, message, stack) {
  if (on === false) return;
  const m = cleanErrorText(message), st = stackFrames(stack);
  const key = [w, k, m, st].join('\u0001');
  const cur = errQueue.get(key);
  errQueue.set(key, { w, k, m, s: st, n: (cur?.n || 0) + 1 });
  if (on && !timer) timer = setTimeout(send, 60e3);
}
const messageOf = (r) => (r instanceof Error ? `${r.name}: ${r.message}` : typeof r === 'string' ? r : r?.message || String(r));

// Clics suivis sans toucher aux modules : barre latérale, onglets, réglages, sections Saison
const CLICKS = [
  ['#rail [data-rail]', (b) => (b.dataset.rail === 'posts' ? null : `rail.${b.dataset.rail}`)],
  ['#setNav [data-sgroup]', (b) => `settings.${b.dataset.sgroup}`],
  ['#szNav [data-sz]', (b) => `season.${b.dataset.sz}`],
  ['.panel [data-tab]', (b) => `tab.${b.dataset.tab}`],
  ['[data-track]', (b) => b.dataset.track],
  ['#asStart', () => 'feature.autosync'],
  ['#backupExport', () => 'feature.backup'],
  ['#icsSeason', () => 'feature.reminders'],
];
const CHANGES = [
  ['#lanEnabled', (el) => (el.checked ? 'feature.lan' : null)],
  ['#lightsProvider', (el) => (el.value && el.value !== 'none' ? 'feature.lights' : null)],
  ['#remindSel', (el) => (el.value && el.value !== '0' ? 'feature.reminders' : null)],
];

function listen() {
  document.addEventListener('click', (e) => {
    for (const [sel, name] of CLICKS) {
      const el = e.target.closest?.(sel);
      if (el) { const n = name(el); if (n) track(n); return; }
    }
  }, true);
  document.addEventListener('change', (e) => {
    for (const [sel, name] of CHANGES) {
      if (e.target.matches?.(sel)) { const n = name(e.target); if (n) track(n); }
    }
  }, true);
  // Erreurs de l'interface : fichier et ligne (compteur), plus le détail pour les comprendre :
  // message technique nettoyé (adresses, dossiers, e-mails et longs nombres retirés) et chemin d'appel
  const where = (file, line) => {
    const f = String(file || '').split(/[?#]/)[0].split('/').pop().replace(/[^a-z0-9._-]/gi, '').toLowerCase().slice(0, 40);
    return f ? `error.${f}:${Number(line) || 0}` : 'error.other';
  };
  window.addEventListener('error', (e) => {
    // Avertissement du navigateur (mise en page qui change pendant une mesure de taille, reportée à
    // l'image suivante), pas une erreur de l'appli : sans adresse ni ligne, rien à corriger
    if (!e.error && /^ResizeObserver loop/.test(e.message || '')) return;
    if (errors++ >= 20) return;
    const w = where(e.filename, e.lineno);
    track(w);
    trackError(w.slice(6), 'js', e.error ? messageOf(e.error) : e.message, e.error?.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (errors++ >= 20) return;
    const m = String(e.reason?.stack || '').match(/\/([\w.-]+\.js):(\d+):\d+/);
    const w = m ? where(m[1], m[2]) : 'error.other';
    track(w);
    trackError(w.slice(6), 'promise', messageOf(e.reason), e.reason?.stack);
  });
  window.addEventListener('pagehide', send);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') send(); });
}

async function setConsent(value) {
  const res = await fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: value }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`);
  return res.json();
}

function apply(state) {
  on = !!state.enabled;
  if (!on) { queue.clear(); errQueue.clear(); } else if ((queue.size || errQueue.size) && !timer) timer = setTimeout(send, 5000);
  const box = $('#statsOn');
  if (box) box.checked = on;
}

const STATS_TEXT = "Statistiques anonymes pour savoir quelles fonctions servent : fonctions utilisées, version, système et erreurs.";
const STATS_SHORT = "Envoyer des statistiques anonymes";
const STATS_PRIVACY = "Rien qui vous identifie : ni compte, ni contenu, ni adresse IP.";

// Bandeau discret dans un coin (rien n'est bloqué) : Oui, Non merci, Détails. La croix le referme
// sans réponse : il revient au prochain lancement.
function ask() {
  const bar = document.createElement('div');
  bar.className = 'stats-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', t('Statistiques anonymes'));
  bar.innerHTML = `<button class="icon-btn stats-later" title="${t('Plus tard')}" aria-label="${t('Plus tard')}">${icon('close')}</button>
    <div class="stats-bar-head">${icon('chart')} <b>${t('Aider à améliorer Paddock Live ?')}</b></div>
    <p class="small">${t(STATS_SHORT)}</p>
    <div class="stats-more small muted" hidden><p>${t(STATS_TEXT)}</p><p>${t(STATS_PRIVACY)}</p><p>${t('Modifiable à tout moment dans Réglages → Application.')}</p></div>
    <div class="row stats-actions">
      <button class="btn small stats-details">${t('Détails')}</button>
      <button class="btn small" data-no>${t('Non merci')}</button>
      <button class="btn small btn-accent" data-yes>${t('Oui')}</button>
    </div>`;
  document.body.appendChild(bar);
  const answer = async (value) => {
    bar.remove();
    try { apply(await setConsent(value)); } catch (err) { toast(err.message, 4000, 'warning'); }
    if (value) toast(t('Merci ! Statistiques anonymes activées'), 3000, 'check');
  };
  $('[data-yes]', bar).addEventListener('click', () => answer(true));
  $('[data-no]', bar).addEventListener('click', () => answer(false));
  $('.stats-later', bar).addEventListener('click', () => bar.remove());
  $('.stats-details', bar).addEventListener('click', (e) => {
    const more = $('.stats-more', bar);
    more.hidden = !more.hidden;
    e.currentTarget.textContent = t(more.hidden ? 'Détails' : 'Moins de détails');
  });
}

export async function initStats() {
  listen();
  const main = !new URLSearchParams(location.search).has('win');   // pas les fenêtres détachées
  if (main) { track('app.open'); track(EN ? 'lang.en' : 'lang.fr'); }
  let state;
  try { state = await (await fetch('/api/stats')).json(); } catch { on = false; return; }
  apply(state);
  const block = $('#statsBlock');
  if (block) block.hidden = !state.available || !state.canSet;
  $('#statsOn')?.addEventListener('change', async (e) => {
    try { apply(await setConsent(e.target.checked)); } catch (err) { e.target.checked = !e.target.checked; toast(err.message, 4000, 'warning'); }
  });
  // Tant que la question n'a pas de réponse : le bandeau, une fois l'interface affichée
  if (state.available && state.canSet && !state.asked && main) setTimeout(ask, 4000);
}
