// Saison → Championnat des casseurs : coût estimé des dégâts de chaque pilote et de chaque écurie (et part du plafond
// budgétaire), coût cumulé des écuries, pièces cassées, plus gros dégâts d'un week-end et détail d'un pilote.
// Estimations de u/Dense-Strategy-867 (Reddit), compilées par Formula 1 Dashboard.
import { esc } from '../util.js';
import { DEC, EN, LANG, t } from '../i18n.js';
import { gpShort } from '/shared/gp-names.js';
import { destructors } from '/shared/destructors.js';

const PARTS = {
  'Front Wing': 'Aileron avant', 'Front Suspension': 'Suspension avant', 'Rear Suspension': 'Suspension arrière', Floor: 'Fond plat',
  'Floor/Diffuser': 'Fond plat et diffuseur', Bargeboard: 'Déflecteurs', 'Rear Wing': 'Aileron arrière', 'Side Pod': 'Ponton',
  'Additional Chassis': 'Châssis de rechange', Electronics: 'Électronique', Tyre: 'Pneu', Brakes: 'Freins', Gearbox: 'Boîte de vitesses', Wheel: 'Roue',
};
// Plafond budgétaire de base de la FIA (en $) : 215 millions en 2026 (135 en 2025, avant d'y ajouter des dépenses
// jusque-là exclues)
const CAP = { 2026: 215e6 };
// Montants arrondis : 2,24 M$ ou 960 k$ (anglais : $2.24M, $960k)
const usd = (v) => {
  const n = v >= 1e6 ? `${(v / 1e6).toFixed(v % 1e6 ? 2 : 0).replace('.', DEC)} M` : `${Math.round(v / 1e3)} k`;
  return EN ? `$${n.replace(' ', '')}` : `${n}$`;
};
const partName = (p) => esc(EN ? p : PARTS[p] || p);

let shown = null;   // pilote dont le détail est ouvert (numéro)
export const showDestructorsDriver = (num) => { shown = shown === num ? null : num; };

// d : données du serveur ({ year, rows }), null pendant le chargement ou { error } ; ctx.chart : courbes de la Saison
export function renderDestructors(ctx, d) {
  const { data, bar } = ctx;
  if (!d) return `<div class="note small">${t('Chargement…')}</div>`;
  if (d.error) return `<div class="note small">${esc(d.error)}</div>`;
  if (!d.rows?.length) return `<div class="note small">${t('Pas de championnat des casseurs pour {}.', data.year)}</div>`;
  const c = destructors(d.rows);
  const cost = (r) => r.parts.reduce((s, [, p, q]) => s + p * q, 0);
  // Pilote de la saison (couleur de l'écurie) d'après son numéro, sinon son nom
  const drv = (x) => data.drivers.find((p) => String(p.number) === String(x.num)) || data.drivers.find((p) => p.last === x.driver) || { last: x.driver, team: x.team };
  const who = (x) => { const p = drv(x); return `${bar(p.team, p.teamId)}<b>${esc(p.last || x.driver)}</b> <span class="muted small">${esc(p.team || x.team)}</span>`; };
  const team = (name) => data.constructors.find((k) => name.toLowerCase().includes(k.name.toLowerCase()) || k.name.toLowerCase().includes(name.toLowerCase())) || { name };
  const gp = (round) => (round === 0 ? t('Roulage de Barcelone') : esc(gpShort(data.races.find((r) => r.round === round)?.name || `R${round}`, LANG)));
  const cap = CAP[data.year];
  const share = (v) => `${((v / cap) * 100).toFixed(1).replace('.', DEC)} %`;
  const card = (title, main, sub) => `<div class="sz-card"><div class="muted small">${title}</div><div class="sz-big">${main}</div><div class="muted small">${sub}</div></div>`;
  const [d1] = c.drivers, [t1] = c.teams, [x1] = c.top;
  const k1 = team(t1.team);
  // Détail d'un pilote touché dans le classement : chacun de ses dégâts, pièces et coût
  const open = shown !== null && c.drivers.find((x) => x.num === shown);
  const detail = open ? `<section class="sz-box"><h3>${who(open)} <small class="muted">${t('{} incidents', open.incidents)} · ${usd(open.cost)}</small>
      <button type="button" class="btn small" data-dest-drv="${open.num}">${t('Fermer')}</button></h3>
      <div class="sz-scroll"><table class="sz-table"><tr><th>${t('Grand Prix')}</th><th>${t('Pièces cassées')}</th><th>${t('Dégâts')}</th></tr>
      ${d.rows.filter((r) => r.num === open.num).sort((a, b) => a.round - b.round).map((r) => `<tr><td>${gp(r.round)}</td>
        <td class="small">${r.parts.map(([p, , q]) => `${partName(p)}${q > 1 ? ` ×${q}` : ''}`).join(', ')}</td><td><b>${usd(cost(r))}</b></td></tr>`).join('')}</table></div></section>` : '';
  // Coût cumulé des 5 écuries les plus coûteuses, Grand Prix par Grand Prix (en milliers de $)
  const rounds = [...new Set(d.rows.map((r) => r.round))].sort((a, b) => a - b);
  const chart = ctx.chart(c.teams.slice(0, 5).map((x) => {
    const k = team(x.team);
    let y = 0;
    return { label: k.name.replace(/ F1 Team$/, ''), color: ctx.color(k.name, k.id), points: rounds.map((round) => ({ x: round, y: Math.round((y += d.rows.filter((r) => r.round === round && r.team === x.team).reduce((s, r) => s + cost(r), 0)) / 1e3) })) };
  }), { w: ctx.w, h: 260 });
  const tdName = (x) => `<button type="button" class="dest-drv" data-dest-drv="${x.num}" title="${esc(t('Voir le détail'))}">${who(x)}</button>`;
  return `<div class="sz-cards">
      ${card(t('Dégâts de la saison'), usd(c.total), t('{} incidents', d.rows.length))}
      ${card(t('Pilote le plus coûteux'), `${bar(drv(d1).team, drv(d1).teamId)}${esc(drv(d1).last || d1.driver)}`, usd(d1.cost))}
      ${card(t('Écurie la plus coûteuse'), `${bar(k1.name, k1.id)}${esc(k1.name)}`, cap ? t('{}, soit {} du plafond budgétaire ({})', usd(t1.cost), share(t1.cost), usd(cap)) : usd(t1.cost))}
      ${card(t('Plus gros dégâts'), `${bar(drv(x1).team, drv(x1).teamId)}${esc(drv(x1).last || x1.driver)}`, `${usd(x1.cost)} · ${gp(x1.round)}`)}
    </div>
    ${detail}
    <div class="sz-grid2">
      <section class="sz-box"><h3>${t('Pilotes')} <small class="muted">${t('touchez un pilote pour le détail')}</small></h3><div class="sz-scroll"><table class="sz-table"><tr><th>${t('Pos.')}</th><th>${t('Pilote')}</th><th>${t('Dégâts')}</th><th>${t('Incidents')}</th></tr>
        ${c.drivers.map((x) => `<tr class="${x.num === shown ? 'on' : ''}"><td>${x.pos}</td><td>${tdName(x)}</td><td><b>${usd(x.cost)}</b></td><td>${x.incidents}</td></tr>`).join('')}</table></div></section>
      <section class="sz-box"><h3>${t('Écuries')}</h3><div class="sz-scroll"><table class="sz-table"><tr><th>${t('Pos.')}</th><th>${t('Écurie')}</th><th>${t('Dégâts')}</th>${cap ? `<th>${t('Part du plafond')}</th>` : ''}<th>${t('Incidents')}</th></tr>
        ${c.teams.map((x) => { const k = team(x.team); return `<tr><td>${x.pos}</td><td>${bar(k.name, k.id)}<b>${esc(k.name)}</b></td><td><b>${usd(x.cost)}</b></td>${cap ? `<td>${share(x.cost)}</td>` : ''}<td>${x.incidents}</td></tr>`; }).join('')}</table></div></section>
    </div>
    <section class="sz-box"><h3>${t('Coût cumulé des 5 écuries les plus coûteuses')} <small class="muted">${t('en milliers de $')}</small></h3>${chart}</section>
    <div class="sz-grid2">
      <section class="sz-box"><h3>${t('Plus gros dégâts d\'un week-end')}</h3><div class="sz-scroll"><table class="sz-table"><tr><th>${t('Pilote')}</th><th>${t('Grand Prix')}</th><th>${t('Dégâts')}</th></tr>
        ${c.top.slice(0, 15).map((x) => `<tr><td>${tdName(x)}</td><td>${gp(x.round)}</td><td><b>${usd(x.cost)}</b></td></tr>`).join('')}</table></div></section>
      <section class="sz-box"><h3>${t('Pièces cassées')}</h3><div class="sz-scroll"><table class="sz-table"><tr><th>${t('Pièce')}</th><th>${t('Prix estimé')}</th><th>${t('Nombre')}</th><th>${t('Total')}</th></tr>
        ${c.parts.map((p) => `<tr><td>${partName(p.name)}</td><td>${usd(p.price)}</td><td>${p.qty}</td><td><b>${usd(p.cost)}</b></td></tr>`).join('')}</table></div></section>
    </div>
    <p class="hint">${t('Coût estimé des pièces cassées, Grand Prix par Grand Prix : des estimations, pas un décompte officiel. Source : u/Dense-Strategy-867 (Reddit), compilé par Formula 1 Dashboard.')}${cap ? ` ${t('Plafond budgétaire {} de la FIA : {}.', data.year, usd(cap))}` : ''}</p>`;
}
