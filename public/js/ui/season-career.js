// Saison → Pilotes : carrière du pilote choisi (départs, victoires, podiums, poles, titres, écuries saison par saison),
// calculée et gardée par le serveur de Paddock Live (/api/career), lue une fois par pilote et par ouverture de la Saison.
import { api, esc } from '../util.js';
import { t } from '../i18n.js';
import { icon } from '../icons.js';

const kept = new Map();   // id Jolpica -> réponse ; { busy } pendant la lecture
const AGAIN = 60e3;       // serveur pas encore prêt (pending) ou injoignable : relu une minute plus tard

function load(id, rerender) {
  const h = kept.get(id);
  if (h && (h.busy || !(h.pending || h.error) || Date.now() - h.t < AGAIN)) return h;
  kept.set(id, { busy: true });
  api(`/api/career?driver=${encodeURIComponent(id)}`)
    .then((d) => kept.set(id, { ...d, t: Date.now() }), () => kept.set(id, { error: true, t: Date.now() }))
    .finally(() => {
      rerender();
      const d = kept.get(id);
      if (d.pending || d.error) setTimeout(rerender, AGAIN + 1000);
    });
  return kept.get(id);
}

const card = (label, v, sub = '') => `<div class="sz-card sz-kpi"><div class="muted small">${label}</div><div class="sz-big">${v}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>`;

// drv : pilote de la saison (id Jolpica, absent des anciennes saisons gardées : rien d'affiché) ; color(écurie, id)
export function careerBlock(drv, { color, rerender }) {
  if (!drv?.id) return '';
  const c = load(drv.id, rerender);
  const head = `<h3>${t('Carrière')}</h3>`;
  if (c.busy) return `<section class="sz-box sz-career">${head}<div class="muted small">${t('Chargement de la carrière…')}</div></section>`;
  if (c.error) return '';
  if (c.pending) return `<section class="sz-box sz-career">${head}<div class="muted small">${t('Carrière en préparation par le serveur, de retour dans quelques minutes.')}</div></section>`;
  const n = c.totals, list = c.seasons.filter((s) => s.starts || s.poles || s.teams.length);
  if (!list.length) return `<section class="sz-box sz-career">${head}<p>${t('Première saison en Formule 1.')}</p></section>`;
  const pct = (v) => (n.starts ? `${Math.round((100 * v) / n.starts)} %` : '');
  const team = (x) => `<span class="sz-team-y"><i style="background:${color(x.name, x.id)}"></i>${esc(x.name)}</span>`;
  const rows = [...list].reverse().map((s) => `<tr><td><b>${s.y}</b>${s.title ? ` ${icon('trophy', 'ic-s')}` : ''}</td><td>${s.teams.map(team).join(' ')}</td>
    <td>${s.starts}</td><td>${s.wins || ''}</td><td>${s.podiums || ''}</td><td>${s.poles || ''}</td></tr>`).join('');
  return `<section class="sz-box sz-career">${head}
    <div class="sz-cards sz-kpis">
      ${card(t('Titres'), n.titles.length, n.titles.length ? n.titles.join(', ') : t('{} saison(s) depuis {}', list.length, c.first))}
      ${card(t('Départs'), n.starts, t('{} saison(s) depuis {}', list.length, c.first))}
      ${card(t('Victoires'), n.wins, pct(n.wins))}
      ${card(t('Podiums'), n.podiums, pct(n.podiums))}
      ${card(t('Poles'), n.poles, pct(n.poles))}
    </div>
    <div class="sz-scroll"><table class="sz-table"><tr><th>${t('Saison')}</th><th>${t('Écurie')}</th><th>${t('Départs')}</th><th>${t('Victoires')}</th><th>${t('Podiums')}</th><th>${t('Poles')}</th></tr>${rows}</table></div>
    <div class="muted small">${t('Grands Prix seulement (sans les sprints). Poles : 1er des qualifications (avant 2003 : 1er sur la grille).')}${c.pendingTitles ? ` ${t('Titres en cours de vérification.')}` : ''}</div></section>`;
}
