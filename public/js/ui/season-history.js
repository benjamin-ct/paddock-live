// Saison : « Dans l'histoire » sur la fiche d'un Grand Prix à venir (vainqueurs passés sur le circuit, recordman,
// victoires depuis la pole et, depuis 2018, neutralisations, arrêts et places gagnées de chaque course). Calculé et
// gardé par le serveur de Paddock Live (/api/circuit-history), lu une fois par circuit.
import { api, esc } from '../util.js';
import { DEC, t } from '../i18n.js';

const hist = new Map();   // circuit -> réponse ; { busy } pendant la lecture
const AGAIN = 60e3;       // serveur pas encore prêt (pending) ou injoignable : relu une minute plus tard

function load(id, rerender) {
  const h = hist.get(id);
  if (h && (h.busy || !(h.pending || h.error) || Date.now() - h.t < AGAIN)) return h;
  hist.set(id, { busy: true });
  api(`/api/circuit-history?circuit=${encodeURIComponent(id)}`)
    .then((d) => hist.set(id, { ...d, t: Date.now() }), () => hist.set(id, { error: true, t: Date.now() }))
    .finally(() => {
      rerender();
      const d = hist.get(id);
      if (d.pending || d.error) setTimeout(rerender, AGAIN + 1000);
    });
  return hist.get(id);
}

const num = (v) => String(v).replace('.', DEC);
const card = (label, v, sub = '') => `<div class="sz-card sz-kpi"><div class="muted small">${label}</div><div class="sz-big">${v}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>`;
const start = (g) => (g === 1 ? t('pole') : g === 0 ? t('stands') : g ? `P${g}` : '—');

// circuitId (Jolpica) ; chip(pilote) : puce aux couleurs de l'écurie ; rerender : rubrique redessinée une fois la réponse lue
export function historyBlock(id, { chip, rerender }) {
  if (!id) return '';
  const h = load(id, rerender);
  const head = `<h3>${t('Dans l\'histoire')}</h3>`;
  if (h.busy) return `<section class="sz-box sz-hist">${head}<div class="muted small">${t('Chargement de l\'histoire du circuit…')}</div></section>`;
  if (h.error) return '';
  if (h.pending) return `<section class="sz-box sz-hist">${head}<div class="muted small">${t('Histoire du circuit en préparation par le serveur, de retour dans quelques minutes.')}</div></section>`;
  if (!h.races) return `<section class="sz-box sz-hist">${head}<p>${t('Première course sur ce circuit.')}</p></section>`;
  const rec = h.recordmen.slice(0, 3), more = h.recordmen.length - rec.length;
  const r = h.recent;
  const cards = [
    card(t('Recordman des victoires'), `${esc(rec.map((x) => x.last || x.driver).join(', '))}${more > 0 ? ` <span class="muted small">+${more}</span>` : ''}`,
      rec.length === 1 ? `${t('{} victoire(s)', rec[0].wins)} · ${rec[0].years.join(', ')}` : t('{} victoire(s) chacun', rec[0].wins)),
    h.fromPole && card(t('Victoires depuis la pole'), `${num(Math.round((100 * h.fromPole.n) / h.fromPole.of))} %`, t('{} course(s) sur {}', h.fromPole.n, h.fromPole.of)),
    r?.analysed && card(t('Course neutralisée'), `${r.neutralised}/${r.analysed}`, t('voiture de sécurité, virtuelle ou drapeau rouge, depuis {}', r.from)),
    r?.analysed && r.stops !== null && card(t('Arrêts par course'), num(r.stops), t('tous les pilotes, depuis {}', r.from)),
    r?.analysed && r.gains !== null && card(t('Places gagnées en piste'), num(r.gains), t('par course, depuis {} (hors 1er tour, stands et neutralisations)', r.from)),
  ].filter(Boolean);
  // Dix dernières courses : vainqueur et place au départ ; chiffres de l'analyse depuis 2018
  const fig = new Map((r?.races || []).map((x) => [`${x.y}:${x.round}`, x]));
  const cell = (x, k) => { const v = fig.get(`${x.y}:${x.round}`)?.[k]; return v === undefined || v === null ? '—' : v; };
  const rows = h.winners.map((x) => `<tr><td>${x.y}</td><td>${x.winners.map((w) => `${chip(w)} <span class="muted small">${esc(w.team)}</span>`).join('<br>')}</td>
    <td>${x.winners.map((w) => start(w.grid)).join(' / ')}</td><td>${cell(x, 'neutral')}</td><td>${cell(x, 'stops')}</td><td>${cell(x, 'gains')}</td></tr>`).join('');
  const since = h.since > h.first ? ` · ${t('de retour au calendrier en {}', h.since)}` : '';
  return `<section class="sz-box sz-hist">${head}
    <div class="muted">${t('{} course(s) sur ce circuit depuis {}', h.races, h.first)}${since}</div>
    <div class="sz-cards sz-kpis">${cards.join('')}</div>
    <div class="sz-scroll"><table class="sz-table"><tr><th>${t('Année')}</th><th>${t('Vainqueur')}</th><th>${t('Départ')}</th><th>${t('Tours neutralisés')}</th><th>${t('Arrêts')}</th><th>${t('Places gagnées')}</th></tr>${rows}</table></div>
    <div class="muted small">${t('Toutes les courses disputées sur ce circuit comptent, même avant une modification du tracé.')} ${t('Neutralisations, arrêts et places gagnées : analyse des archives de la F1, depuis {}.', r?.from || 2018)}</div></section>`;
}
