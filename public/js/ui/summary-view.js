// Bouton « Résumé » : résumé automatique de la séance en français (au rythme du délai TV), à lire
// ou à copier pour le partager.
import { store } from '../store.js';
import { $, esc } from '../util.js';
import { icon } from '../icons.js';
import { toast } from './delay.js';
import { buildSummary, summaryFacts } from '/shared/summary.js';
import { reportHtml, statusLabel } from './report.js';
import { FR, t } from '../i18n.js';

function text(s) { return `${s.title}\n\n${s.paragraphs.join('\n')}`; }

function open() {
  let dlg = $('#summaryDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'summaryDlg';
    dlg.className = 'modal summary-dlg';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-sum-close]')) dlg.close();
      if (e.target.closest('[data-sum-copy]')) {
        navigator.clipboard?.writeText(dlg.dataset.text || '').then(() => toast(t('Résumé copié'), 2500, 'check'), () => toast(t('Copie impossible : sélectionnez le texte'), 4000));
      }
    });
  }
  const s = buildSummary(store.state, { lang: FR ? 'fr' : 'en' });
  dlg.dataset.text = text(s);
  // En cartes (podium, remontées, stratégies…) ; le texte rédigé reste copiable
  const f = summaryFacts(store.state);
  dlg.innerHTML = `<div class="sum-head"><b data-no-i18n>${icon('doc')} ${esc(s.title)}</b><span class="rp-status${f.final ? ' done' : ''}">${statusLabel(f)}</span><button class="icon-btn" data-sum-close title="Fermer">${icon('close')}</button></div>
    <div class="sum-body">${reportHtml(store.state)}</div>
    <div class="sum-foot"><span class="muted small">Rédigé automatiquement à partir des données de la séance${s.final ? '' : ', au rythme de votre délai TV'}.</span>
      <button class="btn small" data-sum-copy>${icon('save')} Copier le texte</button></div>`;
  dlg.showModal();
}

export function initSummary() {
  $('#summaryBtn')?.addEventListener('click', open);
}
