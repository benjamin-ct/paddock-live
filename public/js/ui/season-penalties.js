// Saison → Sanctions : permis à points de chaque pilote (12 mois glissants, jauge jusqu'à 12, date de retrait de chaque
// point) et sanctions de la saison par pilote et par écurie, d'après les décisions des commissaires publiées par la FIA
// (/api/season/penalties, lues par le serveur dans les documents FIA).
import { esc, teamColor, teamMark } from '../util.js';
import { icon } from '../icons.js';
import { pdfHref } from './pdf-view.js';
import { LANG, LOCALE, t } from '../i18n.js';
import { gpShort } from '/shared/gp-names.js';

const LIMIT = 12;
const mark = (ctx, x) => teamMark({ TeamName: x.team, TeamColour: ctx.official(x.teamId) });
const tcol = (ctx, x) => teamColor({ TeamName: x.team, TeamColour: ctx.official(x.teamId) });
const day = (ts) => new Date(ts).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const eur = (n) => `${Number(n).toLocaleString(LOCALE)} €`;
const plain = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Libellé d'une sanction (serveur : shared/penalties.js, sanctionOf)
function label(s) {
  switch (s.kind) {
    case 'time': return t('{} s de pénalité', s.n);
    case 'grid': return t(s.n > 1 ? '{} places sur la grille' : '{} place sur la grille', s.n);
    case 'drive': return 'Drive-through';
    case 'stopgo': return 'Stop & go';
    case 'pitlane': return t('Départ des stands');
    case 'back': return t('Départ en fond de grille');
    case 'dsq': return t('Disqualification');
    case 'ban': return t('Suspension');
    case 'fine': return t('Amende de {}', eur(s.n));
    case 'reprimand': return t('Réprimande');
    case 'warning': return t('Avertissement');
    default: return t('Autre sanction');
  }
}
// Sanction sur la course (temps, grille, stands, disqualification) : marquée en rouge
const hard = (s) => ['time', 'grid', 'drive', 'stopgo', 'pitlane', 'back', 'dsq', 'ban'].includes(s.kind);
// Motif tiré du titre du document (« Doc 52 - Infringement - Car 5 - Causing a collision with Car 55 »), en anglais
const motive = (title) => String(title || '').replace(/^.*?\bCars?\s+\d+\s*[-–]\s*/i, '').replace(/^(?:doc\s*\d+\s*[-–]\s*)?/i, '').trim();
const pdf = (url, text) => `<a href="${esc(pdfHref(url))}" data-pdf="${esc(t('Décision des commissaires'))}" target="_blank" rel="noopener" class="btn-doc" title="${esc(t('Décision des commissaires (PDF)'))}"><span class="doc-badge">PDF</span><span>${esc(text)}</span>${icon('external', 'ic-s')}</a>`;

function note(d) {
  if (!d) return `<div class="note">${t('Chargement des documents de la FIA…')}</div>`;
  if (d.error) return `<div class="note">${t('Documents de la FIA indisponibles ({}).', esc(d.error))}</div>`;
  if (d.pending) return `<div class="note">${icon('hourglass')} ${t('Lecture des décisions des commissaires : {} / {} Grands Prix (saison et saison précédente)', d.done, d.total)}</div>`;
  return '';
}

// Jauge du permis : 12 cases, une par point, de la couleur de l'écurie ; case survolée : date de retrait du point
function gauge(ctx, x) {
  const cells = [];
  for (const p of [...x.points].sort((a, b) => a.expires - b.expires)) {
    for (let i = 0; i < p.n && cells.length < LIMIT; i++) cells.push(`<i class="on" title="${esc(t('{} · retiré le {}', gpShort(p.event, LANG), day(p.expires)))}"></i>`);
  }
  while (cells.length < LIMIT) cells.push('<i></i>');
  const level = x.total >= LIMIT ? 'ban' : x.total >= 8 ? 'near' : '';
  return `<span class="sz-lic ${level}" style="--tc:${tcol(ctx, x)}" role="meter" aria-valuemin="0" aria-valuemax="${LIMIT}" aria-valuenow="${x.total}" aria-label="${esc(t('{} points sur {}', x.total, LIMIT))}">${cells.join('')}</span>`;
}

// d : réponse du serveur ({ year, at, pending, drivers, penalties }), null pendant le chargement, ou { error }
export function renderPenalties(ctx, d) {
  if (!d || d.error || (!d.drivers?.length && !d.penalties?.length)) return note(d) || `<div class="note">${t('Aucune décision des commissaires lue pour {}.', ctx.data.year)}</div>`;
  // Pilotes de la saison (couleurs, noms comme ailleurs), plus ceux qui ont encore des points d'une saison précédente
  const season = ctx.data.drivers;
  const find = (x) => season.find((s) => plain(x.driver).endsWith(plain(s.last))) || season.find((s) => String(s.number) === String(x.num));
  const lic = d.drivers.map((x) => ({ ...x, label: find(x)?.name || x.driver }));
  for (const s of season) if (!lic.some((x) => find(x) === s)) lic.push({ driver: s.name, label: s.name, team: s.team, teamId: s.teamId, total: 0, points: [], bans: [] });
  lic.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  const pens = d.penalties;
  const top = lic[0] || { total: 0 };
  const fines = pens.filter((p) => p.sanction.kind === 'fine').reduce((s, p) => s + p.sanction.n, 0);
  const card = (title, main, sub) => `<div class="sz-card sz-kpi"><div class="muted small">${title}</div><div class="sz-big">${main}</div><div class="muted small">${sub}</div></div>`;
  // Sanctions par pilote et par écurie : nombre, secondes, places sur la grille, amendes, points
  const sum = (list) => ({
    n: list.length, s: list.filter((p) => p.sanction.kind === 'time').reduce((a, p) => a + p.sanction.n, 0),
    g: list.filter((p) => p.sanction.kind === 'grid').reduce((a, p) => a + p.sanction.n, 0), hard: list.filter((p) => hard(p.sanction)).length,
    fine: list.filter((p) => p.sanction.kind === 'fine').reduce((a, p) => a + p.sanction.n, 0), pts: list.reduce((a, p) => a + p.points, 0),
  });
  const group = (list, key) => {
    const m = new Map();
    for (const p of list) { const k = key(p); if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
    return [...m.values()].map((list) => ({ ...list[0], ...sum(list) })).sort((a, b) => b.hard - a.hard || b.n - a.n);
  };
  // Amende de l'écurie (« The competitor … is fined ») : comptée pour l'écurie seulement
  const byDriver = group(pens.filter((p) => !(p.sanction.kind === 'fine' && /competitor/i.test(p.decision))), (p) => plain(p.driver));
  const byTeam = group(pens, (p) => p.teamId || p.competitor);
  const row = (x, name) => `<tr><td>${mark(ctx, x)}<b>${esc(name)}</b></td><td><b>${x.n}</b></td><td>${x.hard || '—'}</td><td>${x.s ? `${x.s} s` : '—'}</td><td>${x.g || '—'}</td><td>${x.fine ? eur(x.fine) : '—'}</td><td>${x.pts || '—'}</td></tr>`;
  const head = (first) => `<tr><th>${first}</th><th>${t('Décisions')}</th><th title="${esc(t('Temps, grille, départ des stands, disqualification'))}">${t('Sur la course')}</th><th>${t('Temps')}</th><th>${t('Places')}</th><th>${t('Amendes')}</th><th>${t('Points')}</th></tr>`;
  // Décisions, un bloc par Grand Prix (le plus récent ouvert)
  const gps = [];
  for (const p of pens) { const g = gps.find((x) => x.event === p.event); if (g) g.list.push(p); else gps.push({ event: p.event, list: [p] }); }
  const who = (p) => `<span class="sz-who">${mark(ctx, p)}<b>${esc(find(p)?.name || p.driver)}</b></span>`;
  return `${note(d)}
    <div class="sz-cards">
      ${card(t('Le plus près de la suspension'), top.total ? `${mark(ctx, top)} ${esc(top.label)}` : '—', top.total ? t('{} points sur {}', top.total, LIMIT) : t('aucun point en cours'))}
      ${card(t('Points de pénalité en cours'), lic.reduce((a, x) => a + x.total, 0), t('{} pilotes concernés', lic.filter((x) => x.total).length))}
      ${card(t('Sanctions de la saison'), pens.length, t('dont {} sur la course', pens.filter((p) => hard(p.sanction)).length))}
      ${card(t('Amendes de la saison'), fines ? eur(fines) : '—', t('pilotes et écuries'))}
    </div>
    <section class="sz-box"><h3>${icon('scales')} ${t('Permis à points')} <small class="muted">${t('12 mois glissants, au {}', day(d.at))}</small></h3>
      <div class="sz-lics">${lic.map((x) => `<div class="sz-lic-row">
        <span class="sz-who">${mark(ctx, x)}<b>${esc(x.label)}</b></span>${gauge(ctx, x)}<b class="sz-lic-n">${x.total}<small>/${LIMIT}</small></b>
        ${x.points.length || x.bans.length ? `<div class="sz-lic-pts small">${x.bans.map((b) => `<span class="sz-tag pen">${t('Suspendu le {}', day(b))}</span>`).join('')}${[...x.points].sort((a, b) => a.expires - b.expires).map((p) => `<span class="sz-lic-pt"><b>${t(p.n > 1 ? '{} points de pénalité' : '{} point de pénalité', p.n)}</b> · ${esc(gpShort(p.event, LANG))} · <span class="muted">${t('retiré le {}', day(p.expires))}</span> ${pdf(p.url, t('Décision'))}</span>`).join('')}</div>` : ''}
      </div>`).join('')}</div>
      <p class="muted small">${t('Un pilote qui atteint 12 points est suspendu pour la course suivante, puis 12 points lui sont retirés ; chaque point est retiré un an après la décision (FIA, règlement de la F1, article A3.3.1).')}</p></section>
    <section class="sz-box"><h3>${t('Sanctions par écurie')}</h3><div class="sz-scroll"><table class="sz-table">${head(t('Écurie'))}${byTeam.map((x) => row(x, x.team || x.competitor)).join('')}</table></div></section>
    <section class="sz-box"><h3>${t('Sanctions par pilote')}</h3><div class="sz-scroll"><table class="sz-table">${head(t('Pilote'))}${byDriver.map((x) => row(x, find(x)?.name || x.driver)).join('')}</table></div></section>
    <section class="sz-box"><h3>${t('Décisions des commissaires')}</h3>${gps.map((g, i) => `<details class="sz-fold"${i ? '' : ' open'}><summary><b>${esc(gpShort(g.event, LANG))}</b><span class="muted small">${t(g.list.length > 1 ? '{} sanctions' : '{} sanction', g.list.length)}</span></summary>
      ${g.list.map((p) => `<div class="sz-pen">${who(p)}<span class="sz-els small"><span lang="en">${esc(motive(p.title))}${p.session ? ` <span class="muted">· ${esc(p.session)}</span>` : ''}</span>${p.points ? ` <b class="sz-lic-add">${t(p.points > 1 ? '{} points de pénalité' : '{} point de pénalité', p.points)}</b>` : ''}</span><span class="sz-tag ${hard(p.sanction) ? 'pen' : ''}">${esc(label(p.sanction))}</span>${pdf(p.url, t('Décision'))}</div>`).join('')}</details>`).join('') || `<div class="note">${t('Aucune sanction.')}</div>`}</section>
    <p class="muted small">${t('D\'après les décisions publiées par la FIA : une décision rectifiée ou annulée en appel peut ne pas être prise en compte. Fait foi : le document de la FIA.')}</p>`;
}
