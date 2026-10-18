// Documents FIA : PDF affiché dans l'appli (visionneuse intégrée) au lieu d'être téléchargé, par le
// serveur local qui le garde sur le disque. Sur téléphone, ouvert dans un onglet du navigateur (les
// PDF ne s'affichent pas dans une page). Liens : <a href="${pdfHref(url)}" data-pdf="titre" target="_blank">.
import { esc } from '../util.js';
import { icon } from '../icons.js';

export const pdfHref = (url) => `/api/fia-pdf?${new URLSearchParams({ url })}`;

document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[data-pdf]');
  if (!a || matchMedia('(pointer: coarse)').matches || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  let dlg = document.getElementById('pdfDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'pdfDlg';
    dlg.className = 'modal pdf-dlg';
    dlg.addEventListener('close', () => { dlg.innerHTML = ''; });
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg || ev.target.closest('[data-close]')) dlg.close(); });
    document.body.appendChild(dlg);
  }
  const href = a.getAttribute('href');
  dlg.innerHTML = `<div class="sum-head"><b>${icon('doc')} ${esc(a.dataset.pdf || 'Document FIA')}</b>
      <a class="btn small" href="${esc(href)}" target="_blank" rel="noopener">${icon('external', 'ic-s')} Ouvrir dans le navigateur</a>
      <button class="icon-btn" data-close title="Fermer">${icon('close')}</button></div>
    <iframe src="${esc(href)}" title="${esc(a.dataset.pdf || 'Document FIA')}"></iframe>`;
  if (!dlg.open) dlg.showModal();
});
