// Analyse → Tendances : ce que les données de la F1 permettent de mesurer de façon fiable (shared/insights.js) :
// en course, places gagnées au départ, usure des pneus et choix d'aileron ; en qualifs et en essais, évolution de la
// piste et choix d'aileron. Tout au rythme du délai TV.
import { store, serverNow } from '../store.js';
import { $, esc, api, drivers, sessionKind, teamColor, tyreBadge } from '../util.js';
import { DEC } from '../i18n.js';
import { trackEvolution, wingChoice, tyreWear, FUEL_GAIN } from '/shared/insights.js';

const num = (v, d) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', DEC));
const signed = (v, d) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${num(Math.abs(v), d)}`;

// Départ : demandé au serveur (appli) ou calculé dans la page (version web) ; gardé une fois toutes les voitures vues
let start = null, startKey = '', startAt = 0, startLoading = false;
async function loadStart() {
  const key = store.state.SessionInfo?.Path || '';
  if (key !== startKey) { start = null; startKey = key; }
  const total = Object.keys(store.state.TimingData?.Lines || {}).length;
  if (startLoading || (start?.seen && start.seen >= total) || Date.now() - startAt < 5000) return;
  startLoading = true;
  startAt = Date.now();
  try {
    const until = Math.round(serverNow() - store.delay);
    const r = store.startFetch ? await store.startFetch({ until }) : await api(`/api/start?until=${until}`);
    if (r?.moves) { start = r; renderInsights(); }
  } catch { /* GPS indisponible : la partie reste vide */ } finally { startLoading = false; }
}

function startHtml(dl) {
  if (!start) return '<p class="muted small">Places gagnées jusqu\'au premier virage, d\'après le GPS : visibles après le départ (compte F1 TV ; version web ouverte avant le départ).</p>';
  const tag = (m) => `<span class="ins-move ${m.gained > 0 ? 'up' : m.gained < 0 ? 'down' : ''}"><span class="ins-bar" style="background:${teamColor(dl[m.num])}"></span><b>${esc(dl[m.num]?.Tla || m.num)}</b> ${m.gained ? signed(m.gained, 0) : '='}<small>P${m.grid} → P${m.t1}</small></span>`;
  return `<div class="ins-moves">${start.moves.map(tag).join('')}</div>`;
}

function wearHtml(dl) {
  const rows = tyreWear(store.derived.laps);
  if (!rows.length) return '<p class="muted small">Il faut au moins 8 tours propres sur un même relais.</p>';
  const max = Math.max(0.05, ...rows.map((r) => Math.abs(r.wear)));
  return `<table class="ins-table"><tr><th>Pilote</th><th>Pneu</th><th>Tours</th><th>Perte par tour</th></tr>${rows.map((r) => `<tr>
    <td><span class="ins-bar" style="background:${teamColor(dl[r.num])}"></span><b>${esc(dl[r.num]?.Tla || r.num)}</b></td><td>${tyreBadge(r.compound)}</td><td>${r.laps}</td>
    <td><span class="ins-gauge"><i style="width:${Math.round((Math.max(0, r.wear) / max) * 100)}%"></i></span> ${signed(r.wear, 3)} s</td></tr>`).join('')}</table>
    <p class="muted small">Relais en cours, tours propres seulement ; corrigé de l'allègement en carburant (environ ${num(FUEL_GAIN, 2)} s par tour). Plus la perte est faible, mieux le pilote préserve ses pneus.</p>`;
}

function evolutionHtml() {
  const e = trackEvolution(store.derived.laps);
  if (!e) return '<p class="muted small">Pas encore assez de tours.</p>';
  return `<p class="ins-big">${e.gain > 0 ? `La piste a gagné <b>${num(e.gain, 3)} s</b>` : 'Pas de gain mesurable'} <small class="muted">en ${Math.round(e.minutes)} min</small></p>
    <table class="ins-table"><tr>${['1er quart', '2e quart', '3e quart', '4e quart'].map((q) => `<th>${q}</th>`).join('')}</tr>
    <tr>${e.quarters.map((v) => `<td>${num(v, 3)} s</td>`).join('')}</tr></table>
    <p class="muted small">Meilleur tour de tous les pilotes dans chaque quart de la séance écoulée.</p>`;
}

// Choix d'aileron : chaque écurie placée selon sa vitesse de pointe (à droite = plus rapide en ligne droite) et son
// meilleur tour (en haut = plus rapide)
function wingHtml() {
  const rows = wingChoice(store.state);
  if (rows.length < 3) return '<p class="muted small">Il faut des tours chronométrés et des vitesses de pointe.</p>';
  const W = 520, H = 220, P = 34;
  const xs = rows.map((r) => r.st), ys = rows.map((r) => r.lap);
  const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 0.1, y1 = Math.max(...ys) + 0.1;
  const X = (v) => P + ((v - x0) / (x1 - x0)) * (W - 2 * P), Y = (v) => P / 2 + ((v - y0) / (y1 - y0)) * (H - 1.5 * P);
  // Étiquettes : décalées vers le bas quand elles tomberaient sur leur voisine (même hauteur, à moins de 110 px)
  const placed = [];
  const dots = [...rows].sort((p, q) => Y(p.lap) - Y(q.lap)).map((r) => {
    const x = X(r.st), y = Y(r.lap);
    let ly = y + 4;
    while (placed.some((o) => Math.abs(o.x - x) < 110 && Math.abs(o.y - ly) < 12)) ly += 12;
    placed.push({ x, y: ly });
    return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#${esc(r.color || '888888')}"/>
    <text x="${(x > W - 130 ? x - 9 : x + 9).toFixed(1)}" y="${ly.toFixed(1)}" class="ins-lbl"${x > W - 130 ? ' text-anchor="end"' : ''}>${esc(r.team)}</text><title>${esc(r.team)} · ${Math.round(r.st)} km/h · ${num(r.lap, 3)} s</title></g>`;
  }).join('');
  return `<svg class="ins-wing" viewBox="0 0 ${W} ${H}"><text x="${W - P}" y="${H - 6}" class="ins-ax" text-anchor="end">Vitesse de pointe → ${Math.round(x1)} km/h</text>
    <text x="${P}" y="${H - 6}" class="ins-ax">${Math.round(x0)} km/h</text><text x="4" y="14" class="ins-ax">↑ meilleur tour</text>${dots}</svg>
    <p class="muted small">À droite : moins d'appui, plus de vitesse en ligne droite ; en haut : le tour le plus rapide. Une écurie en haut à gauche gagne son temps dans les virages.</p>`;
}

export function renderInsights() {
  const el = $('#anaInsights');
  if (!el) return;
  const dl = drivers(store.state);
  const race = sessionKind(store.state) === 'race';
  if (race) loadStart();
  const block = (title, html) => `<section class="ins-block"><h4>${title}</h4>${html}</section>`;
  el.innerHTML = race
    ? block('Départ : places gagnées jusqu\'au premier virage', startHtml(dl)) + block('Usure des pneus', wearHtml(dl)) + block('Choix d\'aileron', wingHtml())
    : block('Évolution de la piste', evolutionHtml()) + block('Choix d\'aileron', wingHtml());
}
