// Espace Saison → Pronostics : pole et podium de chaque Grand Prix, entre amis (ordinateur et
// téléphones de l'accès réseau), avec le classement de la saison. Groupe en ligne : les mêmes
// pronostics partagés avec un lien (page paddocklive.app/p/<groupe>), hors du réseau local.
// Pseudo d'un groupe réservé par un jeton gardé ici.
import { $, esc, api, storageGet, storageSet } from '../util.js';
import { icon } from '../icons.js';
import { toast } from './delay.js';
import { POINTS } from '/shared/predict.js';
import { LOCALE, EN } from '../i18n.js';
import { gpShort, gpFull } from '/shared/gp-names.js';
import { track } from './stats.js';

let view = null;
let viewYear = null;
let loading = false;
let seq = 0;               // numéro de la dernière lecture demandée (les réponses plus anciennes sont ignorées)

const me = () => storageGet('paddock.player', '');
const SITE = 'https://paddocklive.app/p/';
const group = () => { try { return JSON.parse(storageGet('paddock.pronoGroup', '') || 'null'); } catch { return null; } };
const tokKey = (g) => `paddock.pronoTok.${g.id}`;
const adminKey = (g) => `paddock.pronoAdmin.${g.id}`;   // jeton du créateur : suppression du groupe
// Groupes en ligne déjà ouverts ici (« Mes groupes »), le groupe affiché en tête
const groups = () => { let l; try { l = JSON.parse(storageGet('paddock.pronoGroups', '') || '[]'); } catch { l = []; } const g = group(); return g ? [g, ...l.filter((x) => x.id !== g.id)] : l; };
function useGroup(g) {
  storageSet('paddock.pronoGroups', JSON.stringify([{ id: g.id, name: g.name }, ...groups().filter((x) => x.id !== g.id)].slice(0, 20)));
  storageSet('paddock.pronoGroup', JSON.stringify({ id: g.id, name: g.name }));
}
// Retiré de « Mes groupes » (ici seulement : le groupe reste en ligne pour les autres)
function forget(g) {
  storageSet('paddock.pronoGroups', JSON.stringify(groups().filter((x) => x.id !== g.id)));
  storageSet('paddock.pronoGroup', '');
}
// Lien personnel : le groupe avec ce pseudo sur un autre appareil (page web ou autre appli)
const myLink = (g) => { const t = storageGet(tokKey(g), ''); return t ? `${SITE}${g.id}#k=${t}` : ''; };
const fmt = (t) => (t ? new Date(t).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

// quiet : relecture automatique (pronostics des autres) ; rien n'est redessiné si rien n'a changé ou
// pendant la saisie, et les choix en cours sont gardés
// Une lecture demandée (groupe changé…) n'attend pas la relecture automatique en cours : elle part
// tout de suite, et la réponse de l'ancienne lecture est ignorée
async function load(year, force = false, quiet = false) {
  if ((quiet && loading) || (!force && view && viewYear === year)) return;
  const my = ++seq;
  loading = true;
  let next;
  try {
    const g = group();
    next = await api(g ? `/api/predictions/online?${new URLSearchParams({ g: g.id, year, tok: storageGet(tokKey(g), '') })}` : `/api/predictions?year=${year}&me=${encodeURIComponent(me())}`);
  } catch (err) {
    next = quiet ? view : { error: err.message };
  } finally {
    if (my === seq) loading = false;
  }
  if (my !== seq) return;
  const form = $('#pdForm');
  if (quiet && (sig(next) === sig(view) || form?.contains(document.activeElement))) return;
  const keep = quiet && form ? Object.fromEntries(new FormData(form)) : null;
  view = next;
  viewYear = year;
  fill();
  if (keep) for (const [k, v] of Object.entries(keep)) { const el = $('#pdForm')?.elements[k]; if (el && !el.disabled) el.value = v; }
  lockPodium();
}
const sig = (v) => JSON.stringify({ ...v, now: 0 });

// Podium : un pilote choisi à une place ne peut pas être choisi aux deux autres
function lockPodium() {
  const f = $('#pdForm');
  if (!f) return;
  const sels = ['p1', 'p2', 'p3'].map((n) => f.elements[n]);
  for (const s of sels) for (const o of s.options) o.disabled = !!o.value && sels.some((x) => x !== s && x.value === o.value);
}

function driverSelect(name, value, drivers, disabled) {
  return `<select name="${name}" ${disabled ? 'disabled' : ''}><option value="">—</option>${drivers.map((d) => `<option value="${esc(d.code)}" ${d.code === value ? 'selected' : ''}>${esc(d.code)} · ${esc(d.name)}</option>`).join('')}</select>`;
}

function pickCell(code, pts) {
  if (!code) return '<td class="muted">—</td>';
  if (code === '?') return `<td class="muted" title="Révélé à la fermeture des pronostics">${icon('lock')}</td>`;
  return `<td class="${pts >= POINTS.exact ? 'pd-hit' : pts ? 'pd-near' : ''}">${esc(code)}${pts ? ` <small>+${pts}</small>` : ''}</td>`;
}

function picksTable(r) {
  if (!r.picks.length) return '<p class="muted small">Aucun pronostic pour ce Grand Prix.</p>';
  return `<table class="sz-table pd-table"><tr><th>Joueur</th><th>Pole</th><th>1er</th><th>2e</th><th>3e</th><th>Points</th></tr>
    ${r.picks.map((p) => `<tr class="${p.mine ? 'pd-me' : ''}"><td>${esc(p.name)}</td>${pickCell(p.pole, p.points?.pole)}${pickCell(p.p1, p.points?.podium[0])}${pickCell(p.p2, p.points?.podium[1])}${pickCell(p.p3, p.points?.podium[2])}
      <td><b>${p.points ? p.points.total : '—'}</b>${p.points?.perfect ? ` <small class="pd-hit">podium exact +${p.points.perfect}</small>` : ''}</td></tr>`).join('')}</table>`;
}

// Groupe en ligne : lien à partager, ou création / arrivée dans un groupe
function groupBox() {
  const g = group();
  const list = groups();
  if (g) {
    const mine = myLink(g);
    return `<section class="sz-box pd-group"><h3>${icon('share')} Groupe en ligne : ${esc(g.name)}</h3>
      <p class="muted small">Vos amis pronostiquent depuis cette page web, sans l'appli ni le réseau local ; tout s'affiche ici aussi.</p>
      <div class="pd-actions"><input readonly value="${esc(SITE + g.id)}" class="pd-link"><button class="btn small" data-pd="copy">${icon('doc')} Copier le lien</button>
        <button class="btn small" data-pd="leave" title="Revenir aux pronostics de cet ordinateur (le groupe reste dans Mes groupes)">Quitter le groupe</button></div>
      <div class="pd-actions"><button class="btn small" data-pd="forget" title="Le groupe disparaît de cet appareil ; il reste en ligne pour les autres joueurs">Retirer de mes groupes</button>
        ${storageGet(adminKey(g), '') || storageGet(tokKey(g), '') ? '<button class="btn small" data-pd="delete" title="Efface le groupe et les pronostics de tous les joueurs (créateur du groupe seulement)">Supprimer le groupe</button>' : ''}</div>
      ${mine ? `<div class="pd-actions"><input readonly value="${esc(mine)}" class="pd-link"><button class="btn small" data-pd="mylink">${icon('doc')} Copier mon lien personnel</button></div>
      <p class="muted small">Lien personnel : ce groupe avec votre pseudo et vos points sur un autre appareil (téléphone, autre ordinateur). Gardez-le pour vous.</p>` : ''}
      ${list.length > 1 ? `<label class="small pd-name">Mes groupes <select data-pd-switch>${list.map((x) => `<option value="${esc(x.id)}" ${x.id === g.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}</section>`;
  }
  return `<details class="sz-box pd-group" ${list.length ? 'open' : ''}><summary><b>${icon('share')} Jouer en ligne avec des amis</b> <span class="muted small">hors du réseau local, avec un lien à partager</span></summary>
      ${list.length ? `<div class="pd-actions"><span class="small">Mes groupes</span>${list.map((x) => `<button class="btn small" data-pd="open" data-id="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>` : ''}
      <div class="pd-actions"><input name="pdGroupName" maxlength="40" placeholder="Nom du groupe (ex. Les copains)"><button class="btn small" data-pd="create">Créer un groupe en ligne</button></div>
      <div class="pd-actions"><input name="pdGroupLink" placeholder="Lien d'un groupe ou lien personnel (paddocklive.app/p/…)"><button class="btn small" data-pd="join">Rejoindre</button></div>
      <p class="muted small">Le groupe et ses pronostics (pseudos et choix) sont gardés sur le serveur Paddock Live. Les pronostics de cet ordinateur restent à part.</p></details>`;
}

function fill() {
  const root = $('#pdRoot');
  if (!root) return;
  if (!view) { root.innerHTML = '<div class="note">Chargement des pronostics…</div>'; return; }
  if (view.error) { root.innerHTML = `${groupBox()}<div class="note">Pronostics indisponibles (${esc(view.error)}).</div>`; return; }
  const now = Date.now();
  const next = view.races.find((r) => !r.result && r.locks.podium && r.locks.podium > now);
  const mine = next?.picks.find((p) => p.mine) || {};
  const poleOpen = next && (!next.locks.pole || now < next.locks.pole);
  const others = next ? next.picks.filter((p) => !p.mine).length : 0;
  // Pseudo de ce joueur dans le groupe (repris d'un lien personnel), sinon celui de cet ordinateur
  const myName = mine.name || view.races.flatMap((r) => r.picks).find((p) => p.mine)?.name || me();
  const form = next ? `<section class="sz-box pd-next">
      <h3>${icon('target')} ${esc(gpFull(next.name, EN))} <span class="muted small">manche ${next.round}</span></h3>
      <form id="pdForm" data-round="${next.round}">
        <label class="small pd-name">Votre prénom ou pseudo <input name="name" value="${esc(myName)}" maxlength="24" placeholder="ex. Benjamin" required></label>
        <div class="pd-picks">
          <label class="small">Pole position ${driverSelect('pole', mine.pole, view.drivers, !poleOpen)}</label>
          <label class="small">1er ${driverSelect('p1', mine.p1, view.drivers)}</label>
          <label class="small">2e ${driverSelect('p2', mine.p2, view.drivers)}</label>
          <label class="small">3e ${driverSelect('p3', mine.p3, view.drivers)}</label>
        </div>
        <div class="pd-actions"><button class="btn" type="submit">${icon('check')} Enregistrer mon pronostic</button>
          <span class="muted small">Pole : ${poleOpen ? `jusqu'au ${fmt(next.locks.pole)}` : 'fermé (qualifications commencées)'} · Podium : jusqu'au ${fmt(next.locks.podium)}</span></div>
      </form>
      <p class="muted small">${others ? `${others} autre${others > 1 ? 's' : ''} joueur${others > 1 ? 's ont' : ' a'} déjà pronostiqué (choix révélés à la fermeture).` : group() ? 'Aucun autre joueur pour l\'instant : partagez le lien du groupe.' : 'Aucun autre joueur pour l\'instant : jouez en ligne avec un groupe.'}</p>
    </section>` : '<section class="sz-box"><p class="muted">Plus de Grand Prix à pronostiquer cette saison.</p></section>';

  const done = view.races.filter((r) => r.result && r.picks.length).reverse();
  const board = view.board.length ? `<table class="sz-table pd-board"><tr><th>#</th><th>Joueur</th><th>Points</th>${done.slice(0, 6).reverse().map((r) => `<th title="${esc(gpFull(r.name, EN))}">R${r.round}</th>`).join('')}</tr>
    ${view.board.map((p, i) => `<tr class="${p.name.toLowerCase() === myName.toLowerCase() ? 'pd-me' : ''}"><td>${i + 1}</td><td>${esc(p.name)}</td><td><b>${p.total}</b></td>${done.slice(0, 6).reverse().map((r) => `<td class="muted">${p.rounds[r.round] ?? '—'}</td>`).join('')}</tr>`).join('')}</table>`
    : '<p class="muted small">Le classement apparaîtra après le premier Grand Prix pronostiqué.</p>';
  const history = done.map((r, i) => `<details class="sz-box pd-round" ${i === 0 ? 'open' : ''}><summary><b>R${r.round} · ${esc(gpShort(r.name, EN))}</b>
      <span class="muted small">pole ${esc(r.result.pole || '—')} · podium ${esc(r.result.podium.join(', ') || '—')}</span></summary>${picksTable(r)}</details>`).join('');
  const locked = view.races.filter((r) => !r.result && r.picks.length && r !== next);
  root.innerHTML = `${groupBox()}${form}
    <section class="sz-box"><h3>${icon('trophy')} Classement des pronostics ${view.year}</h3>${board}
      <p class="muted small">Points : pole exacte ${POINTS.pole} · pilote à la bonne place du podium ${POINTS.exact} · sur le podium mais à une autre place ${POINTS.podium} · podium exact dans l'ordre +${POINTS.perfect}.</p></section>
    ${locked.map((r) => `<section class="sz-box pd-round"><h3>R${r.round} · ${esc(gpShort(r.name, EN))} <span class="muted small">en attente des résultats</span></h3>${picksTable(r)}</section>`).join('')}
    ${history}`;
}

export function renderPredict(year) {
  setTimeout(() => (view && viewYear === year ? (fill(), lockPodium()) : load(year)), 0);
  return '<div id="pdRoot"><div class="note">Chargement des pronostics…</div></div>';
}

export function initPredict() {
  document.addEventListener('change', (e) => {
    if (e.target.closest('#pdForm')) lockPodium();
    const sw = e.target.closest('[data-pd-switch]');
    if (sw) { useGroup(groups().find((x) => x.id === sw.value)); view = null; fill(); load(viewYear, true); }
  });
  // Pronostics des autres (téléphones, groupe en ligne) relus toutes les 5 s quand la vue est affichée
  setInterval(() => { if ($('#pdRoot')?.offsetParent && !document.hidden && viewYear) load(viewYear, true, true); }, 5000);
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pd]');
    if (!b) return;
    const box = b.closest('.pd-group');
    const act = b.dataset.pd;
    try {
      if (act === 'copy') { await navigator.clipboard.writeText(SITE + group().id); toast('Lien copié', 2000, 'check'); return; }
      if (act === 'mylink') { await navigator.clipboard.writeText(myLink(group())); toast('Lien copié', 2000, 'check'); return; }
      if (act === 'leave') { if (!window.confirm('Quitter le groupe en ligne ? Vous pourrez le rouvrir depuis Mes groupes.')) return; storageSet('paddock.pronoGroup', ''); }
      if (act === 'forget') { if (!window.confirm('Retirer ce groupe de vos groupes ? Il reste en ligne pour les autres joueurs.')) return; forget(group()); }
      if (act === 'delete') {
        if (!window.confirm('Supprimer ce groupe pour tout le monde ? Les pronostics de tous les joueurs seront effacés.')) return;
        const g = group();
        await api('/api/predictions/online', { method: 'DELETE', body: { g: g.id, admin: storageGet(adminKey(g), '') || undefined, tok: storageGet(tokKey(g), '') || undefined } });
        forget(g);
        toast('Groupe supprimé', 3000, 'check');
      }
      if (act === 'open') useGroup(groups().find((x) => x.id === b.dataset.id));
      if (act === 'create') {
        b.disabled = true;
        const g = await api('/api/predictions/online', { method: 'POST', body: { name: $('[name="pdGroupName"]', box).value } });
        if (g.admin) storageSet(adminKey(g), g.admin);
        useGroup(g);
        toast('Groupe créé : copiez le lien et envoyez-le à vos amis', 5000, 'check');
      }
      if (act === 'join') {
        const link = $('[name="pdGroupLink"]', box).value.trim();
        const id = /(?:^|\/)([a-z0-9]{10})\/?(?:[?#].*)?$/.exec(link)?.[1];
        if (!id) throw new Error('Lien de groupe invalide');
        const r = await api(`/api/predictions/online?${new URLSearchParams({ g: id, year: viewYear })}`);
        // Lien personnel (…#k=jeton) : on reprend son pseudo dans ce groupe
        const k = /[#&]k=([\w-]{20,64})/.exec(link)?.[1];
        if (k) storageSet(tokKey(r.group), k);
        useGroup(r.group);
      }
      view = null;
      fill();
      load(viewYear, true);
    } catch (err) { toast(err.message, 5000); b.disabled = false; }
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('#pdForm');
    if (!f) return;
    e.preventDefault();
    track('feature.predict');
    const v = Object.fromEntries(new FormData(f));
    storageSet('paddock.player', v.name.trim());
    try {
      const pick = { year: viewYear, round: Number(f.dataset.round), name: v.name, pole: v.pole || null, p1: v.p1 || null, p2: v.p2 || null, p3: v.p3 || null };
      const g = group();
      if (g) {
        const r = await api('/api/predictions/online', { method: 'POST', body: { g: g.id, ...pick, tok: storageGet(tokKey(g), '') || undefined } });
        storageSet(tokKey(g), r.tok);
      } else await api('/api/predictions', { method: 'POST', body: pick });
      toast('Pronostic enregistré', 3000, 'check');
      load(viewYear, true);
    } catch (err) {
      toast(err.message, 5000);
    }
  });
}
