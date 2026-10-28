// Séances dans son agenda sans fichier à télécharger : abonnement (Apple Calendrier, Outlook…) ou
// Google Agenda, à l'adresse publique de Paddock Live, mis à jour tout seul quand les horaires
// changent ; le fichier .ics reste proposé. Boutons : <a data-cal="année" data-round="manche">.
import { esc } from '../util.js';
import { icon } from '../icons.js';
import { FR } from '../i18n.js';

const FEED = `paddocklive.app/calendar${FR ? '' : '-en'}.ics`;
const google = `https://calendar.google.com/calendar/render?${new URLSearchParams({ cid: `webcal://${FEED}` })}`;

document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[data-cal]');
  if (!a) return;
  e.preventDefault();
  let dlg = document.getElementById('calDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'calDlg';
    dlg.className = 'modal cal-dlg';
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg || ev.target.closest('[data-close], .cal-opt')) dlg.close(); });
    document.body.appendChild(dlg);
  }
  const round = a.dataset.round;
  const file = `/api/calendar.ics?${new URLSearchParams({ year: a.dataset.cal, ...(round ? { round } : {}), ...(FR ? {} : { lang: 'en' }) })}`;
  const opt = (href, ic, title, sub, extra = 'target="_blank" rel="noopener"') => `<a class="cal-opt" href="${esc(href)}" ${extra}>${icon(ic)}<span><b>${title}</b><small>${sub}</small></span></a>`;
  dlg.innerHTML = `<div class="sum-head"><b>${icon('calendar')} Ajouter à mon agenda</b><button class="icon-btn" data-close title="Fermer">${icon('close')}</button></div>
    <div class="cal-opts">
      ${opt(`webcal://${FEED}`, 'calendar', 'S’abonner au calendrier', 'Apple Calendrier, Outlook… : toute la saison, mise à jour toute seule')}
      ${opt(google, 'external', 'Google Agenda', 'Même abonnement, dans Google Agenda (téléphone Android compris)')}
      ${opt(file, 'save', round ? 'Fichier de ce week-end (.ics)' : 'Fichier de la saison (.ics)', 'Alarme 15 min avant chaque séance', 'download')}
    </div>`;
  if (!dlg.open) dlg.showModal();
});
