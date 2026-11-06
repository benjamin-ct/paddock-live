// Saison → Grille 2027 (marché des transferts) : les 22 baquets de la saison suivante, écurie par écurie, confirmés
// par une annonce officielle (date et lien) ou à confirmer, et les changements par rapport au duo de 2026. Liste tenue
// à la main (shared/grid-next.js), aussi en page publique (analytics/season-pages.js). Couleurs des écuries seulement,
// sans logo ni photo.
import { esc } from '../util.js';
import { LOCALE, t } from '../i18n.js';
import { icon } from '../icons.js';
import { GRID_NEXT, gridSummary } from '/shared/grid-next.js';

const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const host = (url) => new URL(url).hostname.replace(/^www\./, '');

// ctx.color : couleur de l'écurie (ui/season.js)
export function renderGrid({ color }) {
  const g = gridSummary(), y = GRID_NEXT.year;
  const seat = (x, s) => (s.driver ? `<li class="gr-seat">
      <b class="gr-name">${esc(s.driver)}${x.was.includes(s.driver) ? '' : ` <span class="sz-tag gr-new">${t('Nouveau')}</span>`}</b>
      <span class="gr-ok">${icon('check', 'ic-s')} ${t('Confirmé')}</span>
      <a class="gr-src" href="${esc(s.url)}" target="_blank" rel="noopener" title="${t('Annonce officielle')}">${esc(day(s.date))} · ${esc(host(s.url))} ${icon('external', 'ic-s')}</a>
      ${s.by ? `<span class="gr-meta">${t('Déclaration de {}', esc(s.by))}</span>` : ''}
      ${s.replaces ? `<span class="gr-meta">${t('Remplace {}', esc(s.replaces))}</span>` : ''}</li>`
    : `<li class="gr-seat gr-open"><b class="gr-name">${t('À confirmer')}</b><span class="gr-meta">${t('Pas encore d\'annonce officielle')}</span></li>`);
  const teams = g.teams.map((x) => `<section class="gr-team" style="--tc:${color(x.team, x.id)}">
      <h3>${esc(x.team)} <span class="gr-state${x.open ? '' : ' full'}">${x.open ? (x.open === 1 ? t('1 baquet à confirmer') : t('{} baquets à confirmer', x.open)) : t('Au complet')}</span></h3>
      <ol class="gr-seats">${x.seats.map((s) => seat(x, s)).join('')}</ol>
      <p class="gr-was">${t('Duo {} : {}', y - 1, x.was.map(esc).join(' · '))}${x.same ? ` · <b>${t('duo inchangé')}</b>` : ''}</p></section>`).join('');
  // Les 22 baquets en une barre, dans l'ordre des écuries : plein (couleur de l'écurie) si confirmé
  let i = 0;
  const cells = g.teams.flatMap((x) => x.seats.map((s) => `<i class="${s.driver ? 'on' : ''}" style="--tc:${color(x.team, x.id)};--i:${i++}"></i>`)).join('');
  const card = (title, main, sub = '') => `<div class="sz-card"><div class="muted small">${title}</div><div class="sz-big">${main}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>`;
  return `<div class="sz-cards">
      ${card(t('Baquets confirmés'), `${g.confirmed} <small>/ ${g.seats}</small>`, `<span class="gr-bar" role="img" aria-label="${t('{} baquets confirmés sur {}', g.confirmed, g.seats)}">${cells}</span>`)}
      ${card(t('À confirmer'), String(g.open), t('sans annonce officielle'))}
      ${card(t('Écuries au complet'), `${g.complete} <small>/ ${g.teams.length}</small>`)}
      ${card(t('Nouveaux pilotes'), String(g.arrivals.length), g.arrivals.map((a) => esc(a.driver)).join(', ') || t('aucun pour l\'instant'))}
    </div>
    <div class="sz-team-grid gr-grid">${teams}</div>
    <div class="note small">${t('Annonces officielles seulement : communiqué de l\'écurie ou de la F1, ou déclaration officielle d\'un dirigeant de l\'écurie. Un baquet sans annonce reste « à confirmer », sans nom, même quand la presse cite un favori. À jour au {}.', esc(day(GRID_NEXT.updated)))}</div>`;
}
