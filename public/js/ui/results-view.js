// Page Résultats (barre latérale, « Voir les résultats » de l'accueil) : la séance en cartes
// (podium, remontées, stratégies, neutralisations, abandons, meilleur tour) et le classement complet.
// Séance chargée (direct, replay ou dernière séance), au rythme du délai TV.
import { $, placeView } from '../util.js';
import { store, versionOf } from '../store.js';
import { t, EN } from '../i18n.js';
import { gpShort, sessionLabel } from '/shared/gp-names.js';
import { summaryFacts } from '/shared/summary.js';
import { reportHtml, classificationHtml, chartHtml, numbersHtml, statusLabel } from './report.js';
import { icon } from '../icons.js';

let timer = null;
let lastKey = '';

function render() {
  const view = $('#resultsView');
  if (!view || view.hidden) return;
  const key = `${versionOf(['TimingData', 'TimingAppData', 'TimingStats', 'DriverList', 'RaceControlMessages', 'SessionStatus', 'LapCount', 'SessionInfo', '__reset'])}|${document.documentElement.dataset.scheme}`;
  if (key === lastKey) return;
  lastKey = key;
  const info = store.state.SessionInfo;
  const main = $('#resContent');
  if (!info) {
    main.innerHTML = `<div class="note">${t('Aucune séance chargée : lancez un replay ou attendez la prochaine séance.')}</div>`;
    return;
  }
  const f = summaryFacts(store.state);
  main.innerHTML = `<div class="rp-head"><div><div class="muted small">${t('Résultats')}</div>
      <h2>${gpShort(info.Meeting?.Name || '', EN)} : ${sessionLabel(info.Name || '', EN)}</h2></div>
      <span class="rp-status${f.final ? ' done' : ''}">${statusLabel(f)}</span></div>
    <div class="rp-layout"><div class="rp-left">${reportHtml(store.state)}${chartHtml(store.state)}</div>
      <div class="rp-right"><section class="sz-box rp-class"><h3>${t('Classement')}</h3>${classificationHtml(store.state)}</section>${numbersHtml(store.state)}</div></div>
    <div class="rp-foot">${f.final ? `<span class="muted small">${t('Résultats définitifs de la séance.')}</span>` : `<span class="muted small">${t('Résultats provisoires : séance pas terminée.')}</span>`}
      <div class="rp-foot-actions"><button class="btn small" data-res="summary">${icon('doc')} ${t('Résumé à copier')}</button>
        <button class="btn small" data-res="standings">${icon('trophy')} ${t('Classement du championnat')}</button>
        <button class="btn small" data-res="title">${icon('star')} ${t('Course au titre')}</button></div></div>`;
}

export function openResults() {
  const view = $('#resultsView');
  if (!view) return;
  placeView(view);
  view.hidden = false;
  lastKey = '';
  render();
  clearInterval(timer);
  timer = setInterval(render, 1000);
}

export function closeResults() {
  const view = $('#resultsView');
  if (!view || view.hidden) return;
  view.hidden = true;
  clearInterval(timer);
}

export const isResultsOpen = () => !$('#resultsView')?.hidden;

export function initResults() {
  // Pied de page : résumé à copier, classement du championnat, course au titre
  $('#resContent')?.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-res]')?.dataset.res;
    if (k === 'summary') $('#summaryBtn')?.click();
    else if (k) { closeResults(); (await import('./season.js')).openSeason(k); }
  });
  // Une autre page s'ouvre (Accueil, Saison, Actu, Replays) : la page Résultats se ferme
  const mo = new MutationObserver(() => {
    if (['#homeView', '#seasonView', '#newsView', '#replayView'].some((id) => $(id) && !$(id).hidden)) closeResults();
  });
  for (const id of ['#homeView', '#seasonView', '#newsView', '#replayView']) if ($(id)) mo.observe($(id), { attributes: true, attributeFilter: ['hidden'] });
}
