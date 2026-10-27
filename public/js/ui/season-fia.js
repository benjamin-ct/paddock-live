// Vues « Évolutions techniques » et « Éléments moteur » de l'espace Saison, à partir des
// documents officiels de la FIA lus par le serveur (/api/season/fia).
import { $, esc, teamColor, teamMark, storageGet, storageSet } from '../util.js';
import { translated, requestTranslations, onTranslation, translationState } from './fia-translate.js';
import { icon } from '../icons.js';
import { pdfHref } from './pdf-view.js';
import { DEC, EN } from '../i18n.js';
import { gpShort } from '/shared/gp-names.js';

const TYPES_FR = { Performance: 'Performance', 'Circuit specific': 'Spécifique au circuit', Reliability: 'Fiabilité', 'Structural Improvement': 'Structure' };
const REASONS_FR = {
  'Local Load': 'Appui local', 'Flow Conditioning': 'Conditionnement du flux', 'Cooling Range': 'Plage de refroidissement',
  Cooling: 'Refroidissement', 'Brake Cooling': 'Refroidissement des freins', 'Drag Range': 'Plage de traînée',
  'Drag Reduction': 'Réduction de traînée', 'Balance Range': 'Plage d\'équilibre', Reliability: 'Fiabilité',
  'Mechanical Setup': 'Réglages mécaniques', 'Structural Improvement': 'Amélioration structurelle', Correlation: 'Corrélation',
  Weight: 'Poids', Unknown: 'Non précisé',
};
const ZONES = [
  [/front wing/i, 'Aileron avant'],
  [/rear wing|beam wing|brace wing|endplate|flap/i, 'Aileron arrière'],
  [/floor|diffuser|board|fence|bib|plank|skid/i, 'Fond plat et diffuseur'],
  [/sidepod|coke|engine cover|bodywork|louvre|louver|cooling|inlet|tail|exhaust|chimney|radiator/i, 'Pontons et carrosserie'],
  [/suspension|wishbone|push|pull|track rod/i, 'Suspensions'],
  [/corner|drum|brake|wheel|duct|upright/i, 'Coins de roue et freins'],
  [/nose|crash/i, 'Nez'],
  [/mirror|halo|camera|roll hoop|ris|impact|chassis|cockpit/i, 'Rétroviseurs, halo et divers'],
];
const zoneOf = (c) => ZONES.find(([re]) => re.test(c))?.[1] || 'Autre';

// Composants (libellés FIA les plus courants) ; les autres passent par le moteur de traduction
const COMP_FR = {
  'rear wing': 'Aileron arrière', 'front wing': 'Aileron avant', 'rear corner': 'Coin de roue arrière', 'front corner': 'Coin de roue avant',
  'floor body': 'Fond plat', floor: 'Fond plat', 'coke/engine cover': 'Capot moteur / coke', 'engine cover': 'Capot moteur',
  'beam wing': 'Beam wing', 'front suspension': 'Suspension avant', 'rear suspension': 'Suspension arrière', diffuser: 'Diffuseur',
  'front wing endplate': 'Dérive d\'aileron avant', 'rear wing endplate': 'Dérive d\'aileron arrière', 'floor edge': 'Bord du fond plat',
  'cooling louvres': 'Ouïes de refroidissement', 'cooling louvers': 'Ouïes de refroidissement', 'sidepod inlet': 'Entrée d\'air de ponton',
  'floor fences': 'Déflecteurs du fond plat', nose: 'Museau', 'exhaust tailpipe': 'Sortie d\'échappement', tailpipe: 'Sortie d\'échappement',
  halo: 'Halo', 'floor board': 'Floorboard (fond plat)', 'forward floorboard': 'Floorboard avant', 'rear impact structure': 'Structure d\'impact arrière',
  'mirror stay': 'Support de rétroviseur', mirror: 'Rétroviseur', mirrors: 'Rétroviseurs', 'mirror assembly': 'Rétroviseur', cover: 'Carénage',
  'exhaust tailpipe bracket': 'Support de sortie d\'échappement', 'tailpipe bracket': 'Support de sortie d\'échappement', 'floor corner': 'Coin du fond plat',
  'floor furniture': 'Appendices du fond plat', 'floor bib': 'Bib (avant du fond plat)', 'diffuser vane': 'Ailette du diffuseur', 'roll hoop': 'Arceau de sécurité',
  tail: 'Partie arrière', 'rear tail': 'Partie arrière', 'rv tail': 'Partie arrière', bodywork: 'Carrosserie', 'sidepod/coke': 'Ponton / coke', sidepod: 'Ponton',
  'floor leading edge': 'Bord d\'attaque du fond plat', 'front wing flap': 'Volet d\'aileron avant', 'nose camera': 'Caméra du museau',
  'ris fairings': 'Carénages de la structure d\'impact arrière', 'rear brace wing': 'Aileron de renfort arrière', 'floor edge and diffuser': 'Bord du fond plat et diffuseur',
  'floor edge & diffuser': 'Bord du fond plat et diffuseur', 'brake duct': 'Écope de frein', 'front brake duct': 'Écope de frein avant', 'rear brake duct': 'Écope de frein arrière',
  chassis: 'Châssis', 'side impact structure': 'Structure d\'impact latérale', 'front wing mainplane': 'Plan principal d\'aileron avant',
};
const compKey = (c) => String(c || '').toLowerCase().replace(/\s+/g, ' ').trim();
const compFr = (c) => COMP_FR[compKey(c)] || null;

// Texte traduit (ou original en attendant), mis à jour sur place quand la traduction arrive
// Interface en anglais : les textes de la FIA sont déjà dans la langue de l'interface
const showOriginal = () => EN || storageGet('paddock.techOriginal', false);
const trSpan = (en) => {
  if (!en) return '';
  const fr = showOriginal() ? null : translated(en);
  return `<span data-tr="${esc(en)}" class="${fr || showOriginal() ? '' : 'sz-tr-wait'}" ${fr ? `title="${esc(en)}"` : 'lang="en"'}>${esc(fr || en)}</span>`;
};

function trStatusHtml() {
  if (showOriginal()) return '';
  const s = translationState();
  if (s.left) return `${icon('hourglass')} Traduction en cours (${s.left} texte${s.left > 1 ? 's' : ''})${s.loading ? ` · ${esc(s.loading)}` : ''} — par le serveur Paddock Live, une seule fois.`;
  if (s.error) return `${icon('warning')} Traduction impossible pour l'instant : ${esc(s.error)}.`;
  return '';
}

onTranslation((en) => {
  const root = $('#szContent');
  if (!root) return;
  for (const el of root.querySelectorAll('[data-tr]')) {
    if (en && el.dataset.tr !== en) continue;
    const fr = translated(el.dataset.tr);
    if (!fr || showOriginal()) continue;
    el.textContent = fr;
    el.title = el.dataset.tr;
    el.removeAttribute('lang');
    el.classList.remove('sz-tr-wait');
  }
  const st = $('#szTrStatus');
  if (st) st.innerHTML = trStatusHtml();
});

export function toggleTechOriginal(v) {
  storageSet('paddock.techOriginal', v);
}

// Limites d'éléments moteur par saison (règlement sportif FIA)
const LIMITS = {
  2026: { ICE: 4, TC: 4, EX: 4, 'MGU-K': 3, ES: 3, CE: 3, ANC: 6 },
  2022: { ICE: 4, TC: 4, 'MGU-H': 4, 'MGU-K': 4, ES: 2, CE: 2, EX: 8 },
};
const limitsFor = (y) => (y >= 2026 ? LIMITS[2026] : LIMITS[2022]);
const EL_FR = { ICE: 'Moteur thermique', TC: 'Turbo', EX: 'Échappement', 'MGU-K': 'MGU-K', 'MGU-H': 'MGU-H', ES: 'Batterie', CE: 'Électronique', ANC: 'Auxiliaires' };

const mark = (team, ctx, teamId) => teamMark({ TeamName: team, TeamColour: ctx.official(teamId) });
const tcol = (team, ctx, teamId) => teamColor({ TeamName: team, TeamColour: ctx.official(teamId) });
const short = (n) => gpShort(n, EN);

function note(fia) {
  if (!fia) return '<div class="note">Chargement des documents de la FIA…</div>';
  if (fia.error) return `<div class="note">Documents de la FIA indisponibles (${esc(fia.error)}).</div>`;
  if (fia.pending) return `<div class="note">${icon('hourglass')} Lecture des documents officiels de la FIA : <b>${fia.done} / ${fia.total}</b> Grands Prix</div>`;
  return '';
}

function hbars(rows) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return `<div class="sz-hbars">${rows.map((r) => `<div class="sz-hbar"><div class="sz-hb-l">${r.html || esc(r.label)}</div><div class="sz-hb-t"><i style="width:${Math.max(2, (100 * r.v) / max)}%;background:${r.color || 'var(--accent)'}"></i></div><div class="sz-hb-v">${r.text ?? r.v}</div></div>`).join('')}</div>`;
}
const count = (arr, key) => {
  const m = new Map();
  for (const x of arr) { const k = key(x); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

// Épreuves réelles (hors essais) rattachées à une manche du calendrier
function events(ctx, fia) {
  return (fia?.events || []).filter((e) => e.tech || e.used).map((e) => {
    const race = ctx.data.races.find((r) => {
      const d = Date.parse(r.date);
      return d >= e.first - 2 * 86400e3 && d <= e.first + 10 * 86400e3;
    });
    return { ...e, round: race?.round || null, label: race ? `R${race.round}` : short(e.name).slice(0, 3) };
  }).sort((a, b) => (a.round ?? 99) - (b.round ?? 99) || a.first - b.first);
}

// ---------------- Évolutions techniques ----------------
let techGp = null;
let techTeam = 'all';
export function setTechFilter(gp, team) {
  if (gp !== undefined) techGp = gp;
  if (team !== undefined) techTeam = team;
}

export function renderTech(ctx, fia) {
  const evs = events(ctx, fia).filter((e) => e.tech);
  if (!evs.length) return note(fia) || '<div class="note">Aucun document « Car Presentation Submissions » pour cette saison.</div>';
  const all = evs.flatMap((e) => e.tech.map((u) => ({ ...u, ev: e })));
  const teams = count(all, (u) => u.team).map(([team, n]) => ({ team, n, teamId: all.find((u) => u.team === team)?.teamId }));
  const last = evs.at(-1);
  const types = count(all, (u) => u.type);
  const reasons = count(all, (u) => u.reason);
  const zones = count(all, (u) => zoneOf(u.component));
  // Regroupés par nom français (« Floor » et « Floor Body » = « Fond plat »)
  const comps = count(all.filter((u) => u.component), (u) => compFr(u.component) || u.component.replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())).slice(0, 15);
  const tot = all.length;
  const pct = (n) => `${Math.round((n / tot) * 1000) / 10} %`.replace('.', DEC);

  // Cumul par écurie (SVG)
  const W = Math.max(600, (document.querySelector('#szContent')?.clientWidth || 934) - 34), H = 260, pl = 34, pr = 96, pt = 10, pb = 22;
  const maxCum = Math.max(...teams.map((t) => t.n));
  const X = (i) => pl + (i / Math.max(1, evs.length - 1)) * (W - pl - pr);
  const Y = (v) => pt + (1 - v / maxCum) * (H - pt - pb);
  let grid = '';
  for (let v = 0; v <= maxCum; v += 10) grid += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" class="sz-gl"/><text x="${pl - 6}" y="${Y(v) + 4}" class="sz-ax" text-anchor="end">${v}</text>`;
  evs.forEach((e, i) => { grid += `<text x="${X(i)}" y="${H - 6}" class="sz-ax" text-anchor="middle">${esc(e.label)}</text>`; });
  const labels = [];
  const lines = teams.map((t) => {
    let c = 0;
    const pts = evs.map((e, i) => { c += e.tech.filter((u) => u.team === t.team).length; return [X(i), Y(c)]; });
    labels.push({ y: pts.at(-1)[1] + 4, t, c });
    return `<polyline fill="none" stroke="${tcol(t.team, ctx, t.teamId)}" stroke-width="2" points="${pts.map((p) => p.join(',')).join(' ')}"/>`;
  }).join('');
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 12);
  const lbl = labels.map((l) => `<text x="${W - pr + 5}" y="${l.y}" fill="${tcol(l.t.team, ctx, l.t.teamId)}" class="sz-lbl">${esc(l.t.team.replace(/ F1 Team$/, '').replace('Red Bull Racing', 'Red Bull'))} ${l.c}</text>`).join('');

  // Détail d'un Grand Prix
  const gp = evs.find((e) => e.page === techGp) || last;
  const list = gp.tech.filter((u) => techTeam === 'all' || u.team === techTeam);
  const teamsGp = [...new Set(gp.tech.map((u) => u.team))];
  return `${note(fia)}
    <div class="sz-cards">
      <div class="sz-card sz-kpi"><div class="muted small">Évolutions déclarées</div><div class="sz-big">${tot}</div><div class="muted small">${evs.length} Grands Prix</div></div>
      <div class="sz-card sz-kpi"><div class="muted small">Écurie la plus active</div><div class="sz-big">${mark(teams[0].team, ctx, teams[0].teamId)} ${esc(teams[0].team)}</div><div class="muted small">${teams[0].n} évolutions</div></div>
      <div class="sz-card sz-kpi"><div class="muted small">Zone la plus développée</div><div class="sz-big">${esc(zones[0][0])}</div><div class="muted small">${zones[0][1]} évolutions</div></div>
      <div class="sz-card sz-kpi"><div class="muted small">Dernier Grand Prix · ${esc(short(last.name))}</div><div class="sz-big">${last.tech.length}</div><div class="muted small">évolutions${last.noUpdates.length ? ` · ${last.noUpdates.length} écurie(s) sans nouveauté` : ''}</div></div>
    </div>
    <div class="sz-grid2">
      <section class="sz-box"><h3>Évolutions par écurie</h3>${hbars(teams.map((t) => ({ html: `${mark(t.team, ctx, t.teamId)}<b>${esc(t.team)}</b>`, v: t.n, color: tcol(t.team, ctx, t.teamId) })))}</section>
      <section class="sz-box"><h3>Zones de la voiture</h3>${hbars(zones.map(([z, n]) => ({ label: z, v: n, text: `${n} · ${pct(n)}` })))}</section>
      <section class="sz-box"><h3>Type d'évolution</h3>${hbars(types.map(([k, n]) => ({ label: TYPES_FR[k] || k, v: n, text: `${n} · ${pct(n)}` })))}
        <h3 style="margin-top:14px">Raison principale</h3>${hbars(reasons.map(([k, n]) => ({ label: REASONS_FR[k] || k, v: n, text: `${n} · ${pct(n)}` })))}</section>
      <section class="sz-box"><h3>Composants les plus modifiés</h3>${hbars(comps.map(([c, n]) => ({ label: c, v: n })))}</section>
    </div>
    <section class="sz-box"><h3>Évolutions cumulées</h3><svg viewBox="0 0 ${W} ${H}" class="sz-svg">${grid}${lines}${lbl}</svg></section>
    <section class="sz-box"><h3>Par écurie et Grand Prix</h3><div class="sz-scroll"><table class="sz-table sz-heat"><tr><th>Écurie</th>${evs.map((e) => `<th title="${esc(e.name)}">${esc(e.label)}</th>`).join('')}<th>Total</th></tr>
      ${teams.map((t) => `<tr><td>${mark(t.team, ctx, t.teamId)}<b>${esc(t.team)}</b></td>${evs.map((e) => {
        const n = e.tech.filter((u) => u.team === t.team).length;
        return n ? `<td class="sz-hm" style="background:color-mix(in srgb, ${tcol(t.team, ctx, t.teamId)} ${Math.min(75, 10 + n * 5)}%, transparent)">${n}</td>` : '<td class="muted">·</td>';
      }).join('')}<td><b>${t.n}</b></td></tr>`).join('')}</table></div></section>
    <section class="sz-box"><h3>Détail des évolutions</h3>
      <div class="sz-h2h-pick"><label class="small">Grand Prix <select id="szTechGp">${evs.map((e) => `<option value="${esc(e.page)}" ${e === gp ? 'selected' : ''}>${esc(e.label)} · ${esc(short(e.name))} (${e.tech.length})</option>`).join('')}</select></label>
        <label class="small">Écurie <select id="szTechTeam"><option value="all">Toutes</option>${teamsGp.map((t) => `<option ${t === techTeam ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        ${gp.docs?.tech ? `<a class="btn-doc" href="${esc(pdfHref(gp.docs.tech))}" data-pdf="Document FIA" target="_blank" rel="noopener"><span class="doc-badge">PDF</span><span>Document FIA</span>${icon('external', 'ic-s')}</a>` : ''}</div>
      ${gp.noUpdates.length ? `<p class="muted small">Sans nouveauté : ${gp.noUpdates.map(esc).join(', ')}.</p>` : ''}
      <div class="sz-tr-bar small">${EN ? '' : `<label class="toggle small"><input type="checkbox" id="szTechOrig" ${showOriginal() ? 'checked' : ''}> Texte d'origine (anglais)</label>`}<span class="muted" id="szTrStatus">${trStatusHtml()}</span></div>
      <div class="sz-upd">${list.map((u) => `<article class="sz-upd-item" style="--tc:${tcol(u.team, ctx, u.teamId)}">
        <div class="sz-upd-head">${mark(u.team, ctx, u.teamId)}<b>${showOriginal() ? esc(u.component || '—') : compFr(u.component) ? `<span title="${esc(u.component)}">${esc(compFr(u.component))}</span>` : trSpan(u.component) || '—'}</b><span class="sz-tag" title="Type d'évolution déclaré par l'écurie">${esc(TYPES_FR[u.type] || u.type)}</span>${(REASONS_FR[u.reason] || u.reason) !== (TYPES_FR[u.type] || u.type) ? `<span class="sz-tag sprint" title="Raison principale déclarée">${esc(REASONS_FR[u.reason] || u.reason)}</span>` : ''}<span class="muted small">${esc(u.team)} · n° ${u.n}</span></div>
        ${u.geometry ? `<div class="small"><span class="muted">Ce qui change :</span> ${trSpan(u.geometry)}</div>` : ''}
        ${u.description ? `<div class="small sz-upd-desc"><span class="muted">Pourquoi :</span> ${trSpan(u.description)}</div>` : ''}
      </article>`).join('') || '<div class="note">Aucune évolution.</div>'}</div>
      <p class="muted small">Descriptions fournies par les écuries à la FIA${showOriginal() ? '' : ', traduites (original au survol)'}.</p></section>`;
}

// Textes du détail affiché à traduire (appelé après l'affichage)
export function translateTechDetail(ctx, fia) {
  if (showOriginal()) return;
  const evs = events(ctx, fia).filter((e) => e.tech);
  const gp = evs.find((e) => e.page === techGp) || evs.at(-1);
  if (!gp) return;
  const list = gp.tech.filter((u) => techTeam === 'all' || u.team === techTeam);
  requestTranslations(list.flatMap((u) => [compFr(u.component) ? null : u.component, u.geometry, u.description]));
}

// ---------------- Éléments moteur ----------------
// « 5th Engine (ICE) 6th Turbocharger (TC) 4th MGU-K… » -> « 5e ICE · 6e TC · 4e MGU-K »
const elementsOf = (fact) => {
  const out = [];
  for (const m of String(fact || '').matchAll(/(\d+)(?:st|nd|rd|th)\s+(?:[A-Za-z ]*?\((?:PU-)?([A-Z]+(?:-[A-Z])?)\)|(MGU-[KH]))/g)) {
    const code = (m[2] || m[3]).replace(/^EXH$/, 'EX');
    out.push(`${m[1]}${m[1] === '1' ? 'er' : 'e'} ${code}`);
  }
  return out.length ? out.join(' · ') : String(fact || '').replace(/^The following (additional )?Power Unit elements? (has|have) been used:\s*/i, '');
};

const DECISION_FR = (d) => String(d || '')
  .replace(/Drop of (\d+) grid positions?.*/i, 'Recul de $1 places sur la grille')
  .replace(/.*start the race from the pit ?lane.*/i, 'Départ depuis la voie des stands')
  .replace(/.*back of the (starting )?grid.*/i, 'Départ en fond de grille')
  .replace(/^Reprimand.*/i, 'Réprimande');

export function renderElements(ctx, fia) {
  const evs = events(ctx, fia).filter((e) => e.used);
  if (!evs.length) return note(fia) || '<div class="note">Aucun relevé d\'éléments moteur pour cette saison.</div>';
  const base = evs.at(-1);
  const lim = limitsFor(ctx.data.year);
  const els = base.used.elements;
  // Relevé du dernier Grand Prix + éléments neufs montés pendant ce Grand Prix
  const drivers = base.used.drivers.map((d) => {
    const used = { ...d.used };
    for (const f of base.fresh.filter((x) => x.num === d.num)) used[f.element] = Math.max(used[f.element] || 0, (f.previous || 0) + 1);
    const total = els.reduce((n, e) => n + (used[e] || 0), 0);
    const over = els.filter((e) => lim[e] && used[e] > lim[e]);
    return { ...d, used, total, over };
  }).sort((a, b) => b.total - a.total);
  const pens = evs.flatMap((e) => e.penalties.map((p) => ({ ...p, ev: e }))).sort((a, b) => a.published - b.published);
  const byTeam = count(drivers.flatMap((d) => Array(d.total).fill(d)), (d) => d.team).map(([team, n]) => ({ team, n, teamId: drivers.find((d) => d.team === team)?.teamId }));
  const cell = (d, e) => {
    const v = d.used[e] ?? 0, l = lim[e];
    const cls = !l ? '' : v > l ? 'over' : v === l ? 'at' : '';
    return `<td class="sz-pu ${cls}"><b>${v}</b>${l ? `<small>/${l}</small>` : ''}</td>`;
  };
  const lastName = (d) => d.driver.split(' ').slice(-1)[0];
  // Pénalités et éléments neufs : un bloc par Grand Prix, le plus récent ouvert ; un pilote par ligne
  const who = (name) => { const d = drivers.find((x) => x.driver === name); return `<span class="sz-who">${d ? mark(d.team, ctx, d.teamId) : ''}<b>${esc(name)}</b></span>`; };
  const chips = (list) => list.filter(Boolean).map((x) => `<span class="sz-el" title="${esc(EL_FR[x.split(' ').pop()] || '')}">${esc(x)}</span>`).join('');
  const byGp = (list, ev) => { const m = new Map(); for (const x of [...list].reverse()) m.set(ev(x), [...(m.get(ev(x)) || []), x]); return [...m]; };
  const fold = (ev, i, count, body) => `<details class="sz-fold"${i ? '' : ' open'}><summary><b>${esc(ev.label)} ${esc(short(ev.name))}</b><span class="muted small">${count}</span></summary>${body}</details>`;
  return `${note(fia)}
    <div class="sz-cards">
      <div class="sz-card sz-kpi"><div class="muted small">Éléments utilisés (total)</div><div class="sz-big">${drivers.reduce((n, d) => n + d.total, 0)}</div><div class="muted small">relevé FIA · ${esc(short(base.name))}</div></div>
      <div class="sz-card sz-kpi"><div class="muted small">Pilotes au-delà d'une limite</div><div class="sz-big">${drivers.filter((d) => d.over.length).length} / ${drivers.length}</div></div>
      <div class="sz-card sz-kpi"><div class="muted small">Pénalités liées au moteur</div><div class="sz-big">${pens.length}</div></div>
      <div class="sz-card sz-kpi"><div class="muted small">Le plus d'éléments</div><div class="sz-big">${mark(drivers[0].team, ctx, drivers[0].teamId)} ${esc(lastName(drivers[0]))}</div><div class="muted small">${drivers[0].total} éléments</div></div>
    </div>
    <section class="sz-box"><h3>Éléments utilisés par pilote</h3><div class="sz-scroll"><table class="sz-table sz-heat"><tr><th>Pilote</th><th>Moteur</th>${els.map((e) => `<th title="${esc(EL_FR[e] || e)}">${esc(e)}</th>`).join('')}<th>Total</th></tr>
      ${drivers.map((d) => `<tr><td>${mark(d.team, ctx, d.teamId)}<b>${esc(d.driver)}</b></td><td class="muted small">${esc(d.engine || '')}</td>${els.map((e) => cell(d, e)).join('')}<td><b>${d.total}</b></td></tr>`).join('')}</table></div>
      <p class="muted small">${els.map((e) => `<b>${esc(e)}</b> ${esc(EL_FR[e] || e)}`).join(' · ')} <span class="sz-pu-key at">limite atteinte</span> <span class="sz-pu-key over">limite dépassée</span></p></section>
    <div class="sz-grid2">
      <section class="sz-box"><h3>Total par pilote</h3>${hbars(drivers.map((d) => ({ html: `${mark(d.team, ctx, d.teamId)}<b>${esc(lastName(d))}</b>`, v: d.total, color: tcol(d.team, ctx, d.teamId) })))}</section>
      <section class="sz-box"><h3>Total par écurie</h3>${hbars(byTeam.map((t) => ({ html: `${mark(t.team, ctx, t.teamId)}<b>${esc(t.team)}</b>`, v: t.n, color: tcol(t.team, ctx, t.teamId) })))}</section>
    </div>
    <section class="sz-box"><h3>Pénalités sur la grille</h3>${pens.length ? byGp(pens, (p) => p.ev).map(([ev, list], i) => fold(ev, i, `${list.length} ${list.length > 1 ? 'pénalités' : 'pénalité'}`,
      list.map((p) => `<div class="sz-pen">${who(p.driver)}<span class="sz-els">${chips(elementsOf(p.fact).split(' · '))}${/without the approval|parc ferm/i.test(p.fact) ? ' <span class="muted small">en parc fermé</span>' : ''}</span><span class="sz-tag ${/stands|fond/i.test(DECISION_FR(p.decision)) ? 'pen' : ''}">${esc(DECISION_FR(p.decision))}</span><a href="${esc(pdfHref(p.url))}" data-pdf="Décision des commissaires" target="_blank" rel="noopener" class="btn-doc" title="Décision des commissaires (PDF)"><span class="doc-badge">PDF</span><span>Décision</span>${icon('external', 'ic-s')}</a></div>`).join(''))).join('') : '<div class="note">Aucune pénalité.</div>'}</section>
    <section class="sz-box"><h3>Éléments neufs par Grand Prix</h3>${evs.filter((e) => e.fresh.length).reverse().map((e, i) => {
      const by = new Map();
      for (const f of e.fresh) by.set(f.driver, [...new Set([...(by.get(f.driver) || []), f.element])]);
      return fold(e, i, `${by.size} ${by.size > 1 ? 'pilotes' : 'pilote'} · ${e.fresh.length} ${e.fresh.length > 1 ? 'éléments' : 'élément'}`,
        `<div class="sz-fresh">${[...by].map(([drv, list]) => `<div class="sz-fresh-row">${who(drv)}<span class="sz-els">${chips(list)}</span></div>`).join('')}</div>`);
    }).join('')}</section>
    <p class="muted small">Source : documents FIA et décisions des commissaires.</p>`;
}
