// Premier lancement (ordinateur, nouvelle installation) : quelques écrans pour bien démarrer, à passer
// à tout moment. Favoris, délai TV expliqué, compte F1 TV Pro, interface Essentiel ou Complète.
import { $ } from '../util.js';
import { prefs, setPref } from '../prefs.js';
import { on } from '../store.js';
import { icon } from '../icons.js';
import { track } from './stats.js';
import { favPicker, favAction } from './home.js';

const STEPS = [
  { title: 'Bienvenue dans Paddock Live', body: () => `<p>Choisissez vos pilotes et écuries favoris : ils sont mis en avant dans le classement, les alertes et l'actu.</p>
    <div class="wl-favs" data-favs><p class="muted small">Chargement des pilotes…</p></div>` },
  { title: 'Vous regardez à la TV ?', body: () => `<p>Paddock Live retarde tout (chronos, carte, radios, alertes) pour coller à votre image : rien n'arrive avant la TV.</p>
    <div class="wl-tip">${icon('target')}<div>Pendant une séance, cliquez sur <b>Synchro TV</b> en haut (ou touche <kbd>S</kbd>), puis sur <b>« Je le vois ! »</b> quand l'événement proposé passe à l'écran.</div></div>
    <p class="muted small">Sans TV, avec les chronos seuls : rien à régler.</p>` },
  { title: 'Vous avez F1 TV Pro ?', body: () => `<p>Avec F1 TV Pro, les positions GPS sont exactes et la télémétrie s'affiche en direct. Sans abonnement, tout marche avec des positions estimées.</p>
    <div class="wl-choices">
      <button class="wl-choice" data-f1tv="1">${icon('lock')}<b>Oui, me connecter</b><small>Ouvre la connexion à la fin</small></button>
      <button class="wl-choice" data-f1tv="0">${icon('close')}<b>Non</b><small>Positions estimées</small></button>
    </div>` },
  { title: 'Quelle interface ?', body: () => `<div class="wl-choices">
      <button class="wl-choice" data-mode="0">${icon('check')}<b>Essentiel</b><small>Classement, carte, radios, duel, arrêts et alertes. Recommandé pour commencer.</small></button>
      <button class="wl-choice" data-mode="1">${icon('layout')}<b>Complète</b><small>Aussi l'analyse détaillée, les outils techniques, le streaming et les lumières.</small></button>
    </div>
    <p class="muted small">Modifiable à tout moment : Réglages → Apparence → Interface.</p>` },
];

let step = 0;
let f1tv = null;

function render(dlg) {
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  dlg.innerHTML = `<div class="wl-head"><div class="wl-dots">${STEPS.map((_, i) => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('')}</div>
      <button class="btn small wl-skip" data-wl="skip">Passer</button></div>
    <div class="wl-body"><h3>${s.title}</h3>${s.body()}</div>
    <div class="wl-foot">${step ? `<button class="btn" data-wl="back">${icon('arrow-left')} Retour</button>` : '<span></span>'}
      <button class="btn btn-accent" data-wl="next">${last ? `${icon('check')} C'est parti` : 'Suivant'}</button></div>`;
  for (const b of dlg.querySelectorAll('[data-f1tv]')) b.classList.toggle('on', String(f1tv) === b.dataset.f1tv);
  for (const b of dlg.querySelectorAll('[data-mode]')) b.classList.toggle('on', (prefs.fullMode ? '1' : '0') === b.dataset.mode);
  const favs = dlg.querySelector('[data-favs]');
  if (favs) favPicker().then((html) => { if (favs.isConnected) favs.innerHTML = html; });
}

function finish(dlg, how) {
  setPref('welcomed', true);
  delete document.documentElement.dataset.welcome;
  track(`welcome.${how}`);
  dlg.close();
  dlg.remove();
  if (how === 'done' && f1tv) {
    track('welcome.f1tv');
    $('#settingsModal').showModal();
    $('#setNav [data-sgroup="f1tv"]')?.click();
  }
}

function open() {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal welcome';
  dlg.setAttribute('aria-label', 'Bienvenue dans Paddock Live');
  document.body.appendChild(dlg);
  render(dlg);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(dlg, 'skip'); });
  dlg.addEventListener('click', (e) => {
    const fav = e.target.closest('[data-home]');
    if (fav) { favAction(fav.dataset.home); return; }
    const t = e.target.closest('[data-f1tv]');
    if (t) { f1tv = t.dataset.f1tv === '1'; render(dlg); return; }
    const m = e.target.closest('[data-mode]');
    if (m) { setPref('fullMode', m.dataset.mode === '1'); render(dlg); return; }
    const k = e.target.closest('[data-wl]')?.dataset.wl;
    if (k === 'skip') finish(dlg, 'skip');
    else if (k === 'back') { step--; render(dlg); }
    else if (k === 'next') { if (step === STEPS.length - 1) finish(dlg, 'done'); else { step++; render(dlg); } }
  });
  // Favoris choisis : boutons mis à jour
  on('prefs', (k) => { if ((k === 'favs' || k === 'favTeams') && dlg.open && step === 0) render(dlg); });
  dlg.showModal();
}

// Fenêtre principale d'un ordinateur, première fois seulement ; après l'écran de démarrage
export function initWelcome() {
  if (prefs.welcomed || new URLSearchParams(location.search).has('win') || innerWidth <= 900) return;
  document.documentElement.dataset.welcome = '1';   // question des statistiques reportée après l'accueil
  const wait = setInterval(() => {
    if (document.getElementById('bootCover')) return;
    clearInterval(wait);
    open();
  }, 300);
}
