// Point d'entrée de l'interface.
import { translatePage } from './i18n.js';
import './icons.js';

translatePage();

// Démarrage : les panneaux apparaissent l'un après l'autre (animation CSS), une seule fois
document.body.classList.add('booting');
setTimeout(() => document.body.classList.remove('booting'), 1600);
import { store, on } from './store.js';
import { $$ } from './util.js';
import { connect } from './conn.js';
import { renderHeader, renderSource } from './ui/header.js';
import { initDelay } from './ui/delay.js';
import { initAutoSync } from './ui/autosync.js';
import { initTower, renderTower } from './ui/tower.js';
import { initMap } from './ui/map.js';
import { initDuel, renderDuel } from './ui/duel.js';
import { renderRcm, renderPits } from './ui/feed.js';
import { renderRadios, initRadios } from './ui/radios.js';
import { initTabMove } from './ui/tabmove.js';
import { initOnboardRadio } from './ui/onboard-radio.js';
import { renderTelemetry, renderStrategy, renderWeather, renderChampionship } from './ui/extra.js';
import { initSettings } from './ui/settings.js';
import { renderPitSim, renderBattles, initRaceTools } from './ui/race-tools.js';
import { initAlerts } from './ui/alerts.js';
import { initMissed } from './ui/missed.js';
import { initWakeLock } from './ui/wakelock.js';
import { initSelects } from './ui/select.js';
import { initLegends, legendsToggle } from './ui/legends.js';
import { initStewards, renderStewards, initRcmFilters } from './ui/feed.js';
import { initLayout } from './ui/layout.js';
import { initUpdates } from './ui/updates.js';
import { initChangelog } from './ui/changelog.js';
import { initCommentary } from './ui/commentary.js';
import { initAnalysis, renderAnalysis } from './ui/analysis.js';
import { initSeason } from './ui/season.js';
import { initNews } from './ui/news.js';
import { initHome, initNoLive } from './ui/home.js';
import { initWelcome } from './ui/welcome.js';
import './ui/calendar-menu.js';
import './ui/streaming.js';
import { initFloatMap } from './ui/floatmap.js';
import { initReplays } from './ui/replays.js';
import { initRail } from './ui/rail.js';
import { initTyres, renderTyres } from './ui/tyres.js';
import { initTopInfo } from './ui/topinfo.js';
import { initMiniOpen } from './ui/mini-open.js';
import { initReminders } from './ui/reminders.js';
import { initMoments } from './ui/moments.js';
import { initSummary } from './ui/summary-view.js';
import { initResults } from './ui/results-view.js';
import { initRadar } from './ui/radar.js';
import { initFeedDiag } from './ui/feed-diag.js';
import { initLights } from './ui/lights.js';
import { initBackup } from './ui/backup.js';
import { initSocial } from './ui/social-view.js';
import { initStats } from './ui/stats.js';
import { initCloud } from './cloud.js';

function initTabs() {
  for (const head of $$('[data-tabs]')) {
    const panel = head.closest('.panel');
    head.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      for (const t of head.querySelectorAll('[data-tab]')) t.classList.toggle('active', t === b);
      for (const p of panel.querySelectorAll('[data-pane]')) p.classList.toggle('active', p.dataset.pane === b.dataset.tab);
    });
  }
}

function safe(fn) {
  try { fn(); } catch (err) { console.error(err); }
}

// Pendant un clic (bouton de souris enfoncé), on ne reconstruit pas l'interface : sinon le
// bouton visé (A/B du classement, onglets…) peut être remplacé entre l'appui et le relâchement
// et le clic est perdu. Sécurité : reprise au bout de 1,5 s.
let pressedAt = 0;
window.addEventListener('pointerdown', () => { pressedAt = performance.now(); }, true);
for (const evt of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(evt, () => { pressedAt = 0; }, true);
window.addEventListener('click', () => { pressedAt = 0; }, true);

function loop() {
  if (pressedAt && performance.now() - pressedAt < 1500) { setTimeout(loop, 50); return; }
  safe(renderHeader);
  safe(renderTower);
  safe(renderDuel);
  safe(renderRcm);
  safe(renderRadios);
  safe(renderPits);
  safe(renderTelemetry);
  safe(renderStrategy);
  safe(renderTyres);
  safe(renderWeather);
  safe(renderChampionship);
  safe(renderPitSim);
  safe(renderBattles);
  safe(renderStewards);
  safe(renderAnalysis);
  // Mises à jour calées sur l'affichage (juste avant une image) : pas de saccade à mi-image.
  // Fenêtre cachée : pas d'images, on continue au minuteur (alertes, radios)
  setTimeout(() => (document.visibilityState === 'visible' ? requestAnimationFrame(loop) : loop()), 100);
}

initTabs();
initTabMove();
initDelay();
initAutoSync();
initTower();
initMap();
initDuel();
initSettings();
initRaceTools();
initAlerts();
initMissed();
initWakeLock();
initSelects();
// Sur ordinateur, la page n'a pas de barre de défilement : si un focus, un scrollIntoView ou une sélection
// de texte la fait défiler quand même, on la remet en place (sinon la barre du haut sort de l'écran)
const desktop = matchMedia('(min-width: 901px)');
addEventListener('scroll', () => {
  if (!desktop.matches) return;
  const o = getComputedStyle(document.body);
  if ((scrollX && o.overflowX === 'hidden') || (scrollY && o.overflowY === 'hidden')) {
    scrollTo(o.overflowX === 'hidden' ? 0 : scrollX, o.overflowY === 'hidden' ? 0 : scrollY);
  }
});
initLegends();
legendsToggle(document.querySelector('#legendsOn'));
initRadios();
initOnboardRadio();
initRcmFilters();
initStewards();
initLayout();
initUpdates();
initChangelog();
initBackup();
initSocial();
initStats();
initCloud();
initCommentary();
initAnalysis();
initSeason();
initNews();
initHome();
initWelcome();
initReplays();
initNoLive();
initFloatMap();
initRail();
initTyres();
initTopInfo();
initMiniOpen();
initReminders();
initMoments();
initSummary();
initResults();
initRadar();
initFeedDiag();
initLights();
on('status', renderSource);
on('connection', renderSource);
on('focus', () => renderTower(true));
on('duel', () => renderTower(true));
connect();
loop();

// Accès debug depuis la console : window.paddock
window.paddock = store;
