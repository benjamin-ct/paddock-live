// Saison → Championnat des casseurs : coût estimé des dégâts de chaque pilote et de chaque écurie, pièces cassées et
// plus gros dégâts d'un week-end. Estimations de u/Dense-Strategy-867 (Reddit), compilées par Formula 1 Dashboard.
import { esc } from '../util.js';
import { LOCALE, EN, t } from '../i18n.js';
import { gpShort } from '/shared/gp-names.js';
import { destructors } from '/shared/destructors.js';

const PARTS = {
  'Front Wing': 'Aileron avant', 'Front Suspension': 'Suspension avant', 'Rear Suspension': 'Suspension arrière', Floor: 'Fond plat',
  'Floor/Diffuser': 'Fond plat et diffuseur', Bargeboard: 'Déflecteurs', 'Rear Wing': 'Aileron arrière', 'Side Pod': 'Ponton',
  'Additional Chassis': 'Châssis de rechange', Electronics: 'Électronique', Tyre: 'Pneu', Brakes: 'Freins', Gearbox: 'Boîte de vitesses', Wheel: 'Roue',
};
const usd = (v) => `${Math.round(v).toLocaleString(LOCALE)} $`;

// d : données du serveur ({ year, rows }), null pendant le chargement ou { error }
export function renderDestructors(ctx, d) {
  const { data, bar } = ctx;
  if (!d) return `<div class="note small">${t('Chargement…')}</div>`;
  if (d.error) return `<div class="note small">${esc(d.error)}</div>`;
  if (!d.rows?.length) return `<div class="note small">${t('Pas de championnat des casseurs pour {}.', data.year)}</div>`;
  const c = destructors(d.rows);
  // Pilote de la saison (couleur de l'écurie) d'après son numéro, sinon son nom
  const drv = (x) => data.drivers.find((p) => String(p.number) === String(x.num)) || data.drivers.find((p) => p.last === x.driver) || { last: x.driver, team: x.team };
  const who = (x) => { const p = drv(x); return `${bar(p.team, p.teamId)}<b>${esc(p.last || x.driver)}</b> <span class="muted small">${esc(p.team || x.team)}</span>`; };
  const team = (name) => data.constructors.find((k) => name.toLowerCase().includes(k.name.toLowerCase()) || k.name.toLowerCase().includes(name.toLowerCase())) || { name };
  const gp = (round) => (round === 0 ? t('Roulage de Barcelone') : esc(gpShort(data.races.find((r) => r.round === round)?.name || `R${round}`, EN)));
  const card = (title, main, sub) => `<div class="sz-card"><div class="muted small">${title}</div><div class="sz-big">${main}</div><div class="muted small">${sub}</div></div>`;
  const [d1] = c.drivers, [t1] = c.teams, [x1] = c.top;
  return `<div class="sz-cards">
      ${card(t('Dégâts de la saison'), usd(c.total), t('{} incidents', d.rows.length))}
      ${card(t('Pilote le plus coûteux'), `${bar(drv(d1).team, drv(d1).teamId)}${esc(drv(d1).last || d1.driver)}`, usd(d1.cost))}
      ${card(t('Écurie la plus coûteuse'), `${bar(team(t1.team).name, team(t1.team).id)}${esc(team(t1.team).name)}`, usd(t1.cost))}
      ${card(t('Plus gros dégâts'), `${bar(drv(x1).team, drv(x1).teamId)}${esc(drv(x1).last || x1.driver)}`, `${usd(x1.cost)} · ${gp(x1.round)}`)}
    </div>
    <div class="sz-grid2">
      <section class="sz-box"><h3>${t('Pilotes')}</h3><div class="sz-scroll"><table class="sz-table"><tr><th>${t('Pos.')}</th><th>${t('Pilote')}</th><th>${t('Dégâts')}</th><th>${t('Incidents')}</th></tr>
        ${c.drivers.map((x) => `<tr><td>${x.pos}</td><td>${who(x)}</td><td><b>${usd(x.cost)}</b></td><td>${x.incidents}</td></tr>`).join('')}</table></div></section>
      <section class="sz-box"><h3>${t('Écuries')}</h3><div class="sz-scroll"><table class="sz-table"><tr><th>${t('Pos.')}</th><th>${t('Écurie')}</th><th>${t('Dégâts')}</th><th>${t('Incidents')}</th></tr>
        ${c.teams.map((x) => { const k = team(x.team); return `<tr><td>${x.pos}</td><td>${bar(k.name, k.id)}<b>${esc(k.name)}</b></td><td><b>${usd(x.cost)}</b></td><td>${x.incidents}</td></tr>`; }).join('')}</table></div></section>
    </div>
    <div class="sz-grid2">
      <section class="sz-box"><h3>${t('Plus gros dégâts d\'un week-end')}</h3><div class="sz-scroll"><table class="sz-table"><tr><th>${t('Pilote')}</th><th>${t('Grand Prix')}</th><th>${t('Dégâts')}</th></tr>
        ${c.top.slice(0, 15).map((x) => `<tr><td>${who(x)}</td><td>${gp(x.round)}</td><td><b>${usd(x.cost)}</b></td></tr>`).join('')}</table></div></section>
      <section class="sz-box"><h3>${t('Pièces cassées')}</h3><div class="sz-scroll"><table class="sz-table"><tr><th>${t('Pièce')}</th><th>${t('Prix estimé')}</th><th>${t('Nombre')}</th><th>${t('Total')}</th></tr>
        ${c.parts.map((p) => `<tr><td>${esc(EN ? p.name : PARTS[p.name] || p.name)}</td><td>${usd(p.price)}</td><td>${p.qty}</td><td><b>${usd(p.cost)}</b></td></tr>`).join('')}</table></div></section>
    </div>
    <p class="hint">${t('Coût estimé des pièces cassées, Grand Prix par Grand Prix : des estimations, pas un décompte officiel. Source : u/Dense-Strategy-867 (Reddit), compilé par Formula 1 Dashboard.')}</p>`;
}
