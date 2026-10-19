// Studio : page web du créateur, pour préparer et publier les posts quand l'appli de bureau n'est pas
// à portée (téléphone). Grosses news de la F1 et résultats des séances, mêmes visuels et mêmes textes
// que dans l'appli (code partagé), publication sur Facebook, Instagram et Threads par le serveur
// Paddock Live après confirmation, ou partage vers les autres applis (X, TikTok…) depuis le téléphone.
//
// Chargement rapide : les listes s'affichent d'abord avec les données gardées sur le téléphone, puis
// se mettent à jour ; l'éditeur et la Saison ne sont chargés qu'à l'ouverture (préchargés ensuite).
import { bigNews, newsKind, newsKinds, sortNews, isBreaking } from '/shared/social-news.js';
import { postedEntry } from '/shared/post-history.js';
import { pullToRefresh } from '/shared/pull-refresh.js';
import { $, $$, esc, api, ago, fmtN, icon, LOGO, toast, skeleton, empty, failure, sheet, schedList, store, state, session, hasKey, setKey, forgetKey, onLogout, glide, NET_NAMES, IOS, installed } from './ui.js';
import { cachedNews, freshNews, toFrench, knownFrench, cachedSessions, seasonSessions, SESSION_FR } from './data.js';

const app = $('#app');
// Ancienne adresse (*.workers.dev) : même page sur le nom de domaine (code à entrer une fois de plus)
if (/\.workers\.dev$/.test(location.hostname)) location.replace(`https://paddocklive.app${location.pathname}${location.search}${location.hash}`);
const posts = () => import('./posts.js');
const season = () => import('./season.js');
const scrolls = {};   // position dans chaque onglet, retrouvée au retour d'un post

// ---------- Accès ----------
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function deriveKey(code) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code.trim().toUpperCase()), 'PBKDF2', false, ['deriveBits']);
  return b64url(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode('paddock-live-studio'), iterations: 200000, hash: 'SHA-256' }, base, 256));
}

function login(error = '') {
  app.className = 'login-screen';
  app.innerHTML = `<form class="login">
      ${LOGO}
      <h1>Paddock <b>Studio</b></h1>
      <p class="sub">Posts des séances et des grosses news, publiés depuis votre téléphone.</p>
      <label class="field"><span>Code du mode créateur</span><input type="password" id="code" autocomplete="current-password" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" required></label>
      <label class="check"><input type="checkbox" id="keep" checked> Rester connecté sur cet appareil</label>
      ${error ? `<p class="notice bad">${icon('alert')}${esc(error)}</p>` : ''}
      <button class="btn primary wide">Entrer</button>
      <a class="to-site" href="https://paddocklive.app/">${icon('back')}Retour au site</a>
    </form>`;
  $('#code').focus();
  $('form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('form button');
    btn.disabled = true;
    btn.textContent = 'Vérification…';
    setKey(await deriveKey($('#code').value), $('#keep').checked);
    try {
      session.me = await api('me');
      afterLogin();
    } catch (err) { forgetKey(); login(err.message); }
  };
}
onLogout(() => login());

// ---------- Accueil : en-tête, onglet, barre d'onglets ----------
const TABS = [['news', 'News', 'news'], ['sessions', 'Séances', 'flag'], ['season', 'Saison', 'calendar'], ['stats', 'Stats', 'chart']];
const tabIndex = (k) => TABS.findIndex(([x]) => x === k);
// Retour d'un post : la liste revient en glissant depuis la gauche
const back = () => home({ from: 'left' });

// Animation d'entrée d'une vue (rejouée à chaque fois)
// (retirée ensuite : une liste mise à jour après coup ne se rejoue pas)
let enterTimer = null;
function enter(el, dir) {
  if (!el) return;
  el.classList.remove('in-left', 'in-right', 'in-up');
  void el.offsetWidth;
  el.classList.add(`in-${dir}`);
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => el.classList.remove('in-left', 'in-right', 'in-up'), 700);
}

function home({ from = 'up' } = {}) {
  app.className = 'shell';
  app.innerHTML = `<header class="appbar"><div class="brand">${LOGO}<span>Paddock <b>Studio</b></span></div><span class="grow"></span>
      <a class="iconbtn" href="https://paddocklive.app/" aria-label="Retour au site" title="Retour au site">${icon('home')}</a>
      <button class="iconbtn" id="refresh" aria-label="Actualiser">${icon('refresh')}</button><button class="iconbtn" id="inbox" aria-label="Messages">${icon('mail')}<i class="count" hidden></i></button><button class="iconbtn" id="settings" aria-label="Réglages">${icon('settings')}</button></header>
    <main class="page" id="body"></main>
    <nav class="tabbar" style="--i:${tabIndex(state.tab)}"><div class="side-brand">${LOGO}<span>Paddock <b>Studio</b></span></div><span class="lens"></span>${TABS.map(([k, v, ic]) => `<button data-tab="${k}" class="${state.tab === k ? 'on' : ''}">${icon(ic)}<span>${v}</span></button>`).join('')}</nav>`;
  $('#settings').onclick = settings;
  $('#inbox').onclick = messages;
  $('#refresh').onclick = () => { inboxCount(); showTab({ force: true }); };
  inboxCount();
  $$('[data-tab]').forEach((b) => {
    b.onclick = () => {
      if (state.tab === b.dataset.tab) { scrollTo({ top: 0, behavior: 'smooth' }); return; }
      scrolls[state.tab] = scrollY;
      // Lentille qui glisse jusqu'à l'onglet choisi, contenu qui arrive du côté de l'onglet
      const dir = tabIndex(b.dataset.tab) > tabIndex(state.tab) ? 'right' : 'left';
      state.tab = b.dataset.tab;
      $('.tabbar').style.setProperty('--i', tabIndex(state.tab));
      $$('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
      scrollTo(0, 0);
      enter($('#body'), dir);
      showTab();
    };
  });
  enter($('#body'), from);
  showTab({ restore: true });
}

let tabRun = 0;
async function showTab({ force = false, restore = false } = {}) {
  const run = ++tabRun;
  const body = $('#body');
  const spin = $('#refresh');
  spin?.classList.add('spin');
  const fn = { news: newsTab, sessions: sessionsTab, season: seasonView, stats: statsTab }[state.tab];
  try {
    await fn(body, { force, restore: restore ? scrolls[state.tab] || 0 : 0, current: () => run === tabRun && body.isConnected });
  } catch (err) {
    if (run !== tabRun || !body.isConnected) return;
    // Liste déjà affichée (données gardées) : elle reste, l'échec est signalé à part ; sinon écran
    // d'erreur avec « Réessayer »
    if (body.querySelector('.card:not(.skel), .row-item, .tile')) toast(`Actualisation impossible : ${err.message}`, 'bad');
    else {
      body.innerHTML = failure(err);
      const retry = $('[data-retry]', body);
      if (retry) retry.onclick = () => showTab({ force: true });
    }
  } finally { if (run === tabRun) spin?.classList.remove('spin'); }
}
const restoreScroll = (y) => { if (y) requestAnimationFrame(() => scrollTo(0, y)); };

// Ouverture d'un post : bouton marqué en cours, erreur affichée sans quitter la liste
async function open(btn, fn) {
  if (btn.classList.contains('busy')) return;
  scrolls[state.tab] = scrollY;
  btn.classList.add('busy');
  try { await fn(); } catch (err) { toast(err.message, 'bad'); } finally { btn.classList.remove('busy'); }
}

// ---------- News ----------
let postLog = store.get('history')?.v || [];   // journal des posts publiés
async function newsTab(body, { force, restore, current }) {
  const known = cachedNews();
  if (known) renderNews(body, known.items, { at: known.at, stale: true });
  else body.innerHTML = skeleton(6);
  restoreScroll(restore);
  // Journal des posts publiés et nouvelles fraîches, en même temps
  const [items] = await Promise.all([
    freshNews({ force }),
    api('history').then((r) => { postLog = r.items || []; store.set('history', postLog); }).catch(() => {}),
  ]);
  if (!current()) return;
  const y = scrollY;
  renderNews(body, items, { at: Date.now() });
  if (known) scrollTo(0, y);
  setTimeout(() => posts().catch(() => {}), 300);   // éditeur préchargé
}

// Titres pas encore traduits de la liste affichée : demandés au serveur, remplacés dès qu'ils
// arrivent (à chaque affichage : chargement, tri, filtre, « Toutes »)
async function translateShown(body, list) {
  const todo = list.filter((it) => it.lang !== 'fr' && !knownFrench(it.title, it.lang));
  if (!todo.length) return;
  await toFrench(todo.map((it) => ({ text: it.title, from: it.lang })));
  if (list !== shown || !body.isConnected) return;
  list.forEach((it, i) => {
    const fr = knownFrench(it.title, it.lang);
    const t = $(`[data-i="${i}"] .t`, body);
    if (t && fr && t.textContent !== fr) t.textContent = fr;
  });
}

let shown = [];
// News déjà lues (ouvertes, ou marquées à la main) : les 2 000 dernières, sur cet appareil
const READ = new Set(store.get('read')?.v || []);
const setRead = (id, on = true) => { if (on) READ.add(id); else READ.delete(id); store.set('read', [...READ].slice(-2000)); };
const KIND_NAMES = { transfert: 'Transferts', penalite: 'Pénalités', depart: 'Départs', accident: 'Accidents', officiel: 'Officiel', actu: 'Actu F1' };
function renderNews(body, items, { at, stale = false }) {
  const big = bigNews(items, { all: state.all });
  const done = new Map(big.map((it) => [it, postedEntry(it, postLog)]));
  // Tri (à la une ou récentes), filtre par type, news déjà publiées en dernier
  const kinds = newsKinds(big);
  if (state.nkind && !kinds.some((k) => k.key === state.nkind)) state.nkind = null;
  const list = sortNews(big.filter((it) => (!state.nkind || newsKind(it).key === state.nkind) && !(state.hideRead && READ.has(it.id))), { by: state.nsort, done: (it) => done.get(it) }).slice(0, 40);
  shown = list;
  body.innerHTML = `<div class="toolbar">
      <div class="seg" id="nsort"><button data-by="top" class="${state.nsort === 'top' ? 'on' : ''}">À la une</button><button data-by="recent" class="${state.nsort === 'recent' ? 'on' : ''}">Récentes</button></div>
      <label class="chip-toggle"><input type="checkbox" id="all" ${state.all ? 'checked' : ''}><span>Toutes</span></label>
      <label class="chip-toggle"><input type="checkbox" id="hideread" ${state.hideRead ? 'checked' : ''}><span>Non lues</span></label>
    </div>
    ${kinds.length > 1 ? `<div class="chips" id="nkinds"><button data-k="" class="${state.nkind ? '' : 'on'}">Tout <small>${big.length}</small></button>${kinds.map((k) => `<button data-k="${k.key}" class="${state.nkind === k.key ? 'on' : ''}"><i style="background:${k.color}"></i>${esc(KIND_NAMES[k.key] || k.label)} <small>${k.n}</small></button>`).join('')}</div>` : ''}
    <p class="status">${stale ? '<span class="dot"></span>Mise à jour…' : `À jour · ${new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}</p>
    <div class="features"><button class="card feature" id="manual">${icon('pen')}<span class="grow"><b>Écrire un post</b><small>Votre texte, mis en forme par l'IA si besoin ; visuels faits tout seuls</small></span>${icon('next')}</button>
    <button class="card feature" id="recap">${icon('spark')}<span class="grow"><b>Récap de la semaine</b><small>Carrousel des 5 plus grosses news des 7 derniers jours</small></span>${icon('next')}</button></div>
    ${list.length ? `<div class="list">${list.map((it, i) => {
      const k = newsKind(it);
      const posted = done.get(it);
      const read = READ.has(it.id);
      return `<div class="nwrap"><button class="card news${posted ? ' done' : ''}${read ? ' read' : ''}" data-i="${i}"><div class="card-top"><span class="badge" style="background:${k.color}">${esc(k.label)}</span>${isBreaking(it) ? '<span class="badge breaking">BREAKING</span>' : ''}${posted ? `<span class="pill ok">${icon('check')}Publiée</span>` : ''}<span class="grow"></span><time>${ago(it.t)}</time></div>
        <div class="t">${esc(knownFrench(it.title, it.lang) || it.title)}</div><div class="meta">${esc(it.srcName)}${it.sources > 1 ? ` · ${it.sources} médias` : ''}</div></button>
        <button class="readmark${read ? ' on' : ''}" data-r="${i}" aria-label="${read ? 'Lue : marquer comme non lue' : 'Marquer comme lue'}" title="${read ? 'Lue : marquer comme non lue' : 'Marquer comme lue'}">${icon('check')}</button></div>`;
    }).join('')}</div>` : empty(state.all ? 'Aucune actu ces dernières 48 heures.' : 'Aucune grosse news ces dernières 48 heures : essayez « Toutes ».')}`;
  glide(body);
  translateShown(body, list);
  $('#all', body).onchange = (e) => { state.all = e.target.checked; renderNews(body, items, { at, stale }); };
  $('#hideread', body).onchange = (e) => { state.hideRead = e.target.checked; renderNews(body, items, { at, stale }); };
  $$('[data-r]', body).forEach((b) => { b.onclick = () => { const y = scrollY; setRead(list[Number(b.dataset.r)].id, !b.classList.contains('on')); renderNews(body, items, { at, stale }); scrollTo(0, y); }; });
  $$('#nsort [data-by]', body).forEach((b) => { b.onclick = () => { state.nsort = b.dataset.by; renderNews(body, items, { at, stale }); }; });
  $$('#nkinds [data-k]', body).forEach((b) => { b.onclick = () => { state.nkind = b.dataset.k || null; renderNews(body, items, { at, stale }); }; });
  $('#manual', body).onclick = (e) => open(e.currentTarget, async () => (await posts()).manualEditor(back));
  $('#recap', body).onclick = (e) => open(e.currentTarget, async () => (await posts()).recapEditor(back));
  $$('[data-i]', body).forEach((b) => { b.onclick = () => { setRead(list[Number(b.dataset.i)].id); open(b, async () => (await posts()).newsEditor(list[Number(b.dataset.i)], done.get(list[Number(b.dataset.i)]), back)); }; });
}

// ---------- Séances (archives de la F1), regroupées par Grand Prix ----------
async function sessionsTab(body, { force, restore, current }) {
  const known = cachedSessions();
  if (known && !force) renderSessions(body, known);
  else body.innerHTML = skeleton(5);
  restoreScroll(restore);
  const list = await seasonSessions({ force });
  if (!current()) return;
  renderSessions(body, list);
  setTimeout(() => posts().catch(() => {}), 300);
}
function renderSessions(body, list) {
  if (!list.length) {
    body.innerHTML = `<div class="empty">${icon('flag')}<p>${session.me.f1tv ? 'Archives indisponibles pour le moment.' : 'Les archives de la F1 sont réservées aux abonnés F1 TV : connectez F1 TV dans l\'appli (Réglages → Compte F1 TV), puis réactivez la page (Posts → Publier… → Comptes…).'}</p></div>`;
    return;
  }
  const groups = [];
  for (const s of list) { if (groups.at(-1)?.gp !== s.gp) groups.push({ gp: s.gp, items: [] }); groups.at(-1).items.push(s); }
  body.innerHTML = `<div class="gps">${groups.map((g) => `<section><h3 class="section">${esc(g.gp.replace(/ Grand Prix$/, ''))}</h3><div class="group">${g.items.map((s) => `<button class="row-item" data-s="${list.indexOf(s)}"><span class="grow"><b>${esc(SESSION_FR(s.name))}</b><small>il y a ${ago(s.end)}</small></span>${icon('next')}</button>`).join('')}</div></section>`).join('')}</div>`;
  $$('[data-s]', body).forEach((b) => { b.onclick = () => open(b, async () => (await posts()).sessionEditor(list[Number(b.dataset.s)], back)); });
}

// ---------- Saison (chargée à l'ouverture de l'onglet) ----------
async function seasonView(body, { restore }) {
  if (!body.innerHTML.trim()) body.innerHTML = skeleton(5);
  const m = await season();
  await m.seasonTab(body, back);
  restoreScroll(restore);
}

// ---------- Statistiques des posts ----------
// Chiffres des comptes (28 derniers jours, sauf abonnés, publications et vues totales). Une ligne par
// réseau : abonnés à droite, autres chiffres non nuls en dessous ; réseaux sans chiffres regroupés en bas.
// Libellé au singulier pour 1 (« 1 abonné », « 1 nouvel abonné »)
const SINGULAR = { 'nouveaux abonnés': 'nouvel abonné', vues: 'vue', 'vues au total': 'vue au total', 'comptes touchés': 'compte touché', 'visites du profil': 'visite du profil',
  'comptes engagés': 'compte engagé', interactions: 'interaction', partages: 'partage', publications: 'publication', abonnés: 'abonné' };
const one = (n, l) => (n === 1 && SINGULAR[l]) || l;
const ACC_LABELS = [['newFollowers', 'nouveaux abonnés'], ['views', 'vues'], ['totalViews', 'vues au total'], ['reach', 'comptes touchés'], ['profileViews', 'visites du profil'],
  ['engaged', 'comptes engagés'], ['interactions', 'interactions'], ['likes', 'j\'aime'], ['comments', 'comm.'], ['shares', 'partages'], ['posts', 'publications']];
const metricsOf = (s, labels) => labels.filter(([k]) => s[k]).map(([k, l]) => `<span class="metric"><b>${fmtN(s[k])}</b>${one(s[k], l)}</span>`).join('');
const netLink = (n, url) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(NET_NAMES[n] || n)}</a>` : esc(NET_NAMES[n] || n));
const accountsHtml = (accounts) => `<h3 class="section">Mes comptes <small>activité des 28 derniers jours</small></h3>
  <div class="accs">${accounts.map((a) => {
    const nets = Object.entries(a.nets);
    const live = nets.filter(([, x]) => x.stats);
    const off = nets.filter(([, x]) => !x.stats);
    const total = live.reduce((t, [, x]) => t + (x.stats.followers || 0), 0);
    return `<div class="card acc"><div class="acc-head"><b>${esc(a.name)}</b><span class="acc-total"><b>${fmtN(total)}</b>${one(total, 'abonnés')}</span></div>
      ${live.map(([n, x]) => `<div class="acc-net"><span class="net">${netLink(n, x.url)}</span><span class="acc-f"><b>${x.stats.followers != null ? fmtN(x.stats.followers) : '—'}</b>${one(x.stats.followers, 'abonnés')}</span>
        <div class="metrics">${metricsOf(x.stats, ACC_LABELS) || '<span>aucune activité</span>'}</div></div>`).join('')}
      ${off.length ? `<div class="acc-off">${off.map(([n, x]) => `<span>${netLink(n, x.url)} · ${esc(x.note || x.error || 'indisponible')}</span>`).join('')}</div>` : ''}</div>`;
  }).join('')}</div>`;
// Clics sur les liens suivis des posts et téléchargements de l'appli (30 derniers jours)
const OS_LABELS = { windows: 'Windows', 'windows-portable': 'Windows portable', 'mac-arm': 'Mac Apple', 'mac-intel': 'Mac Intel', linux: 'Linux', 'linux-arm': 'Linux ARM' };
const linkName = (l) => l.title || (() => { try { const u = new URL(l.url); return `${u.hostname.replace(/^www\./, '')}${u.pathname.length > 1 ? u.pathname.slice(0, 40) : ''}`; } catch { return l.url || 'Lien'; } })();
const clicksHtml = (c) => {
  if (!c?.links?.length) return '';
  const row = (l) => {
    const dl = l.id === 'download';
    const parts = Object.entries(l.nets).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<span class="metric"><b>${fmtN(v)}</b>${esc(dl ? OS_LABELS[n] || n : NET_NAMES[n] || n)}</span>`);
    const dev = [['mobile', 'téléphone'], ['desktop', 'ordinateur']].filter(([k]) => l.devices[k]).map(([k, v]) => `<span class="metric"><b>${fmtN(l.devices[k])}</b>${v}</span>`);
    const top = Object.entries(l.countries).filter(([k]) => k !== '?').sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(' · ');
    return `<div class="card post"><div class="card-top"><b class="grow">${esc(dl ? 'Téléchargements de l\'appli' : linkName(l))}</b><span class="metrics"><span class="metric"><b>${fmtN(l.total)}</b>${dl ? 'téléch.' : `clic${l.total > 1 ? 's' : ''}`}</span></span></div>
      <div class="metrics">${parts.join('')}${dev.join('')}${top ? `<span>${esc(top)}</span>` : ''}</div></div>`;
  };
  return `<h3 class="section">Clics sur les liens <small>${c.days} derniers jours</small></h3><div class="list posts">${c.links.map(row).join('')}</div>`;
};
const STAT_LABELS = [['views', 'Vues'], ['reach', 'Portée'], ['likes', 'J\'aime'], ['comments', 'Comm.'], ['shares', 'Partages'], ['saves', 'Enreg.']];
async function statsTab(body, { force, restore, current }) {
  // Statistiques relues au plus toutes les 2 minutes (sauf « Actualiser »)
  const known = store.get('stats');
  const recent = known && Date.now() - known.at < 2 * 60e3 && !force;
  if (known) renderStats(body, known.v, !recent);
  else body.innerHTML = skeleton(4);
  restoreScroll(restore);
  if (recent) return;
  const r = await api('stats');
  if (!current()) return;
  store.set('stats', r);
  renderStats(body, r, false);
}
function renderStats(body, r, stale) {
  const f = Object.entries(r.followers || {});
  body.innerHTML = `${stale ? '<p class="status"><span class="dot"></span>Mise à jour…</p>' : ''}
    ${r.accounts?.length ? accountsHtml(r.accounts) : f.length ? `<div class="tiles">${f.map(([n, v]) => `<div class="tile"><b>${fmtN(v)}</b><small>abonnés ${esc(NET_NAMES[n] || n)}</small></div>`).join('')}</div>` : ''}
    <div id="schedlist"></div>
    ${clicksHtml(r.clicks)}
    <div class="row section-row"><h3 class="section grow">Posts publiés</h3><button class="btn small" id="statsimport" title="Ajoute aux statistiques les posts des 30 derniers jours publiés hors du Studio">${icon('refresh')}Retrouver mes posts</button></div>
    ${(r.posts || []).length ? `<div class="list posts">${r.posts.map((p) => `<div class="card post"><div class="card-top"><time>${esc(new Date(p.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</time><span class="grow"></span><button class="iconbtn small" data-statsremove="${esc(p.key)}" aria-label="Retirer des statistiques" title="Retirer des statistiques">${icon('close')}</button></div><div class="t">${esc(p.title || 'Post')}</div>
      ${Object.entries(p.nets).map(([n, x]) => {
        const s = p.stats?.[n];
        const name = x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(NET_NAMES[n] || n)}</a>` : esc(NET_NAMES[n] || n);
        const vals = s && !s.error ? metricsOf(s, STAT_LABELS) || '<span>pas encore d\'interaction</span>' : `<span class="hint">statistiques indisponibles${s?.error ? ` (${esc(s.error)})` : ''}</span>`;
        return `<div class="net-stats"><span class="net">${name}</span><div class="metrics">${vals}</div></div>`;
      }).join('')}</div>`).join('')}</div>` : empty('Aucun post publié pour le moment.', 'chart')}`;
  schedList($('#schedlist', body));
  // Posts publiés hors du Studio : relus sur les comptes reliés
  $('#statsimport', body).onclick = async (e) => {
    const b = e.currentTarget;
    b.classList.add('busy');
    b.disabled = true;
    try {
      const imp = await api('history/import', { method: 'POST' });
      const fails = Object.keys(imp.errors || {}).map((n) => NET_NAMES[n] || n);
      toast(`${imp.added ? `${imp.added} post${imp.added > 1 ? 's' : ''} ajouté${imp.added > 1 ? 's' : ''}` : 'Aucun nouveau post trouvé'}${fails.length ? ` (illisible : ${fails.join(', ')})` : ''}`, imp.added ? 'ok' : undefined);
      if (imp.added) {
        const next = await api('stats');
        store.set('stats', next);
        renderStats(body, next, false);
      }
    } catch (err) { toast(err.message, 'bad'); } finally { b.classList.remove('busy'); b.disabled = false; }
  };
  // Post supprimé sur les réseaux : retiré des statistiques (ici et dans l'appli)
  $$('[data-statsremove]', body).forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Retirer ce post des statistiques ?\n\nÀ faire si vous l\'avez supprimé sur les réseaux : rien n\'est supprimé chez eux.')) return;
      b.disabled = true;
      try {
        await api('history/remove', { method: 'POST', body: JSON.stringify({ key: b.dataset.statsremove }) });
        b.closest('.card').remove();
        store.set('stats', { ...r, posts: r.posts.filter((p) => p.key !== b.dataset.statsremove) });
        toast('Post retiré des statistiques');
      } catch (err) { b.disabled = false; toast(err.message, 'bad'); }
    };
  });
}

// ---------- Messages : questions et suggestions des utilisateurs (appli, site) ----------
const KIND = { idea: 'Suggestion', question: 'Question', bug: 'Problème' };
const SYS = { win: 'Windows', mac: 'macOS', linux: 'Linux' };
const isMail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const showCount = (items) => {
  const c = $('#inbox .count'), n = items.filter((m) => !m.seen).length;
  if (c) { c.hidden = !n; c.textContent = n > 9 ? '9+' : n; }
};
const inboxCount = () => api('feedback').then((r) => showCount(r.items || [])).catch(() => {});
function msgHtml(m) {
  const from = m.src === 'app' ? ['Appli', /^\d/.test(m.version) ? `v${m.version}` : '', SYS[m.os] || m.os].filter(Boolean).join(' ') : 'Site';
  const when = new Date(m.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  // Réponse : e-mail prêt avec le message d'origine cité (en anglais si le message l'était)
  const en = m.lang === 'en';
  const reply = `mailto:${encodeURIComponent(m.contact || '').replace('%40', '@')}?${new URLSearchParams({
    subject: en ? 'Re: your message about Paddock Live' : 'Re : votre message sur Paddock Live',
    body: `${en ? 'Hi,' : 'Bonjour,'}\n\n\n\n${en ? 'Your message:' : 'Votre message :'}\n${String(m.text).slice(0, 1500).split('\n').map((l) => `> ${l}`).join('\n')}`,
  }).toString().replace(/\+/g, '%20')}`;
  const contact = !m.contact ? '<small>Pas de contact laissé</small>'
    : isMail(m.contact) ? `<a class="btn small" href="${esc(reply)}">${icon('send')}Répondre à ${esc(m.contact)}</a>`
      : `<small>Contact : ${esc(m.contact)}</small>`;
  const files = (m.files || []).map((f) => `<button class="att" data-att="${Number(m.id)}:${Number(f.n)}" data-type="${esc(f.type)}">${icon(f.type.startsWith('video/') ? 'video' : 'image')}<span>${f.type.startsWith('video/') ? 'Vidéo' : 'Image'} · ${(f.size / 1e6).toFixed(1)} Mo</span></button>`).join('');
  return `<article class="msg${m.seen ? '' : ' new'}"><div class="msg-head"><span class="badge kind-${esc(m.kind)}">${esc(KIND[m.kind] || m.kind)}</span>
    <small>${esc(when)} · ${esc(from)}${m.lang === 'en' ? ' · en anglais' : ''}</small></div><p>${esc(m.text)}</p>${files ? `<div class="atts">${files}</div>` : ''}
    <div class="msg-foot">${contact}<button class="btn small" data-remove="${Number(m.id)}">Supprimer</button></div></article>`;
}
async function messages() {
  const dlg = sheet('Messages', '<p class="hint center">Chargement…</p>');
  const body = $('.sheet-body', dlg);
  let items;
  try { items = (await api('feedback')).items || []; } catch (err) { body.innerHTML = `<p class="hint center">${esc(err.message)}</p>`; return; }
  const draw = () => {
    body.innerHTML = items.length ? `<div class="group">${items.map(msgHtml).join('')}</div>
      <p class="hint">Envoyés depuis l'appli ou le site.</p>`
      : '<p class="hint center">Aucun message pour l\'instant. Les questions et suggestions envoyées depuis l\'appli (Réglages → À propos) ou le site arriveront ici.</p>';
    // Pièces jointes : chargées au toucher (images affichées, vidéos lues sur place)
    $$('[data-att]', body).forEach((b) => {
      b.onclick = async () => {
        const [msg, n] = b.dataset.att.split(':');
        b.classList.add('busy');
        try {
          const src = URL.createObjectURL(await (await api(`feedback/file?msg=${msg}&n=${n}`, { raw: true })).blob());
          const el = document.createElement(b.dataset.type.startsWith('video/') ? 'video' : 'img');
          Object.assign(el, { src, className: 'att-view' }, el.tagName === 'VIDEO' ? { controls: true, playsInline: true } : { alt: '' });
          b.replaceWith(el);
        } catch (err) { b.classList.remove('busy'); toast(err.message, 'bad'); }
      };
    });
    $$('[data-remove]', body).forEach((b) => {
      b.onclick = async () => {
        try { await api('feedback/remove', { method: 'POST', body: JSON.stringify({ id: Number(b.dataset.remove) }) }); } catch (err) { toast(err.message, 'bad'); return; }
        items = items.filter((m) => m.id !== Number(b.dataset.remove));
        draw();
      };
    });
  };
  draw();
  // Messages lus : pastille retirée (ils restent marqués jusqu'à la prochaine ouverture)
  if (items.some((m) => !m.seen)) api('feedback/seen', { method: 'POST' }).then(() => showCount([])).catch(() => {});
}

// Pack de présentation pour les streamers : page non listée (ni le site ni l'appli n'y mènent),
// à envoyer avec un de ces messages
const KIT = 'https://paddocklive.app/kit/streamers/';
const PITCH = [
  ['Message court (DM Instagram, TikTok, X, Discord)', `Salut ! Je regarde tes lives pendant les Grands Prix et je pense qu'un outil que j'ai créé pourrait te servir : Paddock Live, une appli gratuite et sans compte qui affiche la course en direct (classement, carte GPS, radios traduites, stratégie) et qui ajoute des overlays sur ton stream (OBS, Streamlabs, Meld).

Elle se cale sur ta diffusion TV : zéro spoiler pour toi et ton chat.

Tout est résumé en 6 images ici : ${KIT}

Si tu veux tester pendant le prochain GP, je t'aide volontiers à l'installer !`],
  ['Message complet (e-mail, adresse pro)', `Objet : Un outil gratuit pour tes lives F1

Salut,

Je suis tes lives pendant les Grands Prix et je voulais te présenter Paddock Live, une appli que j'ai développée pour suivre la F1 en direct comme au mur des stands. Elle est gratuite, sans compte, pour Windows, macOS et Linux.

Ce qu'elle peut apporter à tes lives :
- Des overlays prêts pour OBS, Streamlabs ou Meld : classement, carte du circuit, compteur de tours, bandeaux safety car et drapeaux, podium. Ils se mettent à jour tout seuls.
- Zéro spoiler : le chronométrage arrive avant l'image TV, Paddock Live retarde tout pour coller à ta diffusion (un clic, ou l'appli écoute la TV).
- De quoi commenter chaque tour : écarts, secteurs, pneus, arrêts, carte GPS, radios d'équipe retranscrites et traduites, direction de course.
- Des pronostics avec ta communauté : ton chat pronostique la pole et le podium depuis une simple page web, avec un classement sur la saison.

Le pack de présentation (6 images) : ${KIT}

Je serais ravi d'avoir ton avis, et je peux t'aider à tout installer avant le prochain GP.

À bientôt !`],
  ['Short message (English)', `Hi! I watch your race-day streams and I think a tool I built could help: Paddock Live, a free desktop app (no account needed) that shows the race live (timing, GPS track map, translated team radios, strategy) and adds overlays to your stream (OBS, Streamlabs, Meld).

It syncs with your TV broadcast, so no spoilers for you or your chat.

Everything in 6 images here (in French, the app is in English too): ${KIT}

Happy to help you set it up before the next Grand Prix!`],
];

// ---------- Réglages : comptes, alertes, déconnexion ----------
function settings() {
  const me = session.me || {};
  const accounts = [['Instagram', me.instagram], ['Facebook', me.facebook], ['Threads', me.threads], ['Bluesky', me.bluesky], ['F1 TV (archives des séances)', me.f1tv ? 'connecté' : null]];
  const pages = [['Paddock Live', 'https://paddocklive.app/liens/'], ['Benjy Paddock', 'https://paddocklive.app/benjy/']];
  const link = ([n, u]) => `<div class="row-item static"><span class="grow"><b>${esc(n)}</b><small>${esc(u.replace('https://', ''))}</small></span>
      <a class="btn small" href="${esc(u)}" target="_blank" rel="noopener">${icon('link')}Ouvrir</a><button class="btn small" data-copy="${esc(u)}">${icon('copy')}Copier</button></div>`;
  const dlg = sheet('Réglages', `<h3 class="section">Mes pages de liens</h3><div class="group">${pages.map(link).join('')}</div>
    <p class="hint">Tous les réseaux sur une seule page : le lien à mettre en bio.</p>
    <h3 class="section">Pack streamers</h3><div class="group">${link(['Présentation pour les streamers', KIT])}
      <div class="row-item static"><span class="grow"><b>Pack en PDF</b><small>Les 6 pages en un fichier, à joindre à un e-mail</small></span>
        <a class="btn small" href="${KIT}paddock-live-streamers.pdf" download>${icon('download')}Télécharger</a></div></div>
    ${PITCH.map(([n, t]) => `<details class="cap"><summary><span>${esc(n)}</span></summary><textarea rows="9">${esc(t)}</textarea>
      <button class="btn small" data-copy="">${icon('copy')}Copier le message</button></details>`).join('')}
    <p class="hint">Page non listée : envoie le lien avec un des messages.</p>
    <h3 class="section">Comptes</h3><div class="group">${accounts.map(([n, v]) => `<div class="row-item static"><span class="grow"><b>${esc(n)}</b><small>${esc(v || 'non connecté')}</small></span><span class="state ${v ? 'on' : ''}"></span></div>`).join('')}</div>
    <p class="hint">Comptes envoyés par l'appli de bureau (Posts → Publier… → Comptes…).</p>
    <h3 class="section">Alertes des grosses news</h3><div id="alerts"></div>
    <button class="btn danger wide" id="out">${icon('logout')}Se déconnecter de cet appareil</button>
    <p class="hint center">Version du Studio : ${esc(VERSION)} · © 2026 Paddock Live · <a href="https://github.com/benjamin-ct/paddock-live/blob/main/analytics/LICENSE" target="_blank" rel="noopener">Licence AGPL v3</a></p>`);
  alertsBlock($('#alerts', dlg));
  $$('[data-copy]', dlg).forEach((b) => { b.onclick = () => navigator.clipboard.writeText(b.dataset.copy || b.previousElementSibling.value).then(() => toast(b.dataset.copy ? 'Lien copié' : 'Message copié', 'ok'), () => toast('Copie impossible', 'bad')); });
  $('#out', dlg).onclick = () => { dlg.close(); forgetKey(); login(); };
}

const pushReady = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const keyBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

async function currentSub() {
  if (!pushReady()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/studio/');
  return reg ? reg.pushManager.getSubscription() : null;
}

async function enableAlerts() {
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications refusées : autorisez-les pour cette page dans les réglages du téléphone');
  const { key: server } = await api('push');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Abonnement fait avec une autre clé du serveur : refait
  const same = sub?.options?.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === server;
  if (sub && !same) { await sub.unsubscribe(); sub = null; }
  try {
    sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(server) });
  } catch (err) { throw new Error(`Abonnement refusé par le navigateur (${err.message}). Navigation privée : les notifications n'y fonctionnent pas.`); }
  await api('push', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
}

async function alertsBlock(el) {
  if (!el) return;
  if (!pushReady()) {
    el.innerHTML = `<p class="hint">${IOS && !installed() ? 'Sur iPhone, ajoutez d\'abord cette page à l\'écran d\'accueil (bouton Partager → « Sur l\'écran d\'accueil »), puis ouvrez-la depuis l\'icône.' : 'Alertes indisponibles dans ce navigateur.'}</p>`;
    return;
  }
  const sub = await currentSub().catch(() => null);
  const on = !!sub && Notification.permission === 'granted';
  el.innerHTML = `<div class="group"><div class="row-item static"><span class="grow"><b>${on ? `Actives sur ${/iPhone|Android.*Mobile/.test(navigator.userAgent) ? 'ce téléphone' : IOS || matchMedia('(pointer: coarse)').matches ? 'cet appareil' : 'cet ordinateur'}` : 'Désactivées'}</b><small>À chaque grosse news, avec le post prêt</small></span><span class="state ${on ? 'on' : ''}"></span></div></div>
    <div class="row">${on ? `<button class="btn" id="alerttest">${icon('bell')}Tester</button><button class="btn" id="alertoff">Couper</button>` : `<button class="btn primary" id="alerton">${icon('bell')}Activer</button>`}</div>`;
  const fail = (err) => toast(err.message, 'bad');
  if ($('#alerton', el)) $('#alerton', el).onclick = () => enableAlerts().then(() => { toast('Alertes activées', 'ok'); alertsBlock(el); }).catch(fail);
  if ($('#alerttest', el)) $('#alerttest', el).onclick = () => api('push/test', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }).then(() => toast('Envoyée : elle arrive dans quelques secondes')).catch(fail);
  if ($('#alertoff', el)) $('#alertoff', el).onclick = async () => { try { await api('push/off', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); toast('Alertes coupées'); alertsBlock(el); } catch (err) { fail(err); } };
}

// Notification touchée : post de la news prêt à relire
async function openAlert(id) {
  if (!id) return;
  if (id === 'messages') { messages(); return; }
  try {
    const it = ((await api('alerts')).items || []).find((a) => a.id === id);
    if (!it) return;
    const h = (await api('history').catch(() => ({}))).items || [];
    state.tab = 'news';
    (await posts()).newsEditor(it, postedEntry(it, h), back);
  } catch { /* alerte introuvable : liste des news */ }
}

// Version de la page (dossier /m/<version>/) : affichée dans les réglages ; page installée sur
// l'écran d'accueil rechargée d'elle-même au retour dans l'appli quand une nouvelle version est en
// ligne (iOS garde sinon l'ancienne en mémoire)
const VERSION = /\/m\/(\w+)\//.exec(import.meta.url)?.[1] || 'essai';
async function checkUpdate() {
  try {
    const html = await (await fetch('/studio/', { cache: 'no-store' })).text();
    const v = /\/m\/(\w+)\/studio\/app\.js/.exec(html)?.[1];
    if (v && v !== VERSION && !$('#app.editing') && !$('dialog[open]')) location.reload();
  } catch { /* hors ligne */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });

const startAlert = new URLSearchParams(location.search).get('alert');
if (startAlert) history.replaceState(null, '', '/studio/');
const afterLogin = () => { home(); openAlert(startAlert); };
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/studio/sw.js', { scope: '/studio/' }).catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => { if (session.me && e.data?.alert) openAlert(e.data.alert); });
}

// Tirer vers le bas sur l'accueil : onglet relu ; pas dans un post (textes en cours de saisie) ni
// sous une feuille ouverte (le même geste la referme)
pullToRefresh(async () => {
  session.me = await api('me').catch(() => session.me);
  await showTab({ force: true });
}, { enabled: () => !!session.me && !!$('#body') && !$('dialog[open]') });

(async () => {
  if (!hasKey()) { login(); return; }
  // Comptes connus de la visite précédente : accueil affiché sans attendre le serveur
  const known = store.get('me');
  if (known) { session.me = known.v; afterLogin(); }
  try {
    session.me = await api('me');
    store.set('me', session.me);
    if (!known) afterLogin();
  } catch (err) {
    if (err.message !== 'Code incorrect' && !known) login(err.message);
  }
})();
