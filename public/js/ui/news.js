// Espace « Actu » : toute l'actualité de la F1 au même endroit (F1, FIA, écuries, pilotes, médias
// du monde entier), traduite d'avance par le serveur Paddock Live, avec des alertes pour ce qui compte.
import { $, $$, esc, api, storageGet, storageSet, drivers, teamColor, placeView } from '../util.js';
import { store, on } from '../store.js';
import { prefs, setPref, isFav } from '../prefs.js';
import { NEWS_TEAMS, newsTags, webLink } from '/shared/news.js';
import { badScript } from '/shared/translation-check.js';
import { youtubeId } from '/shared/article.js';

// Lien ou image d'une nouvelle : adresse web uniquement (jamais « javascript: »), échappée
const safeUrl = (u) => esc(webLink(u) || '#');
import { cloudOn, cloudTranslate } from '../cloud.js';
import { notifyNews } from './alerts.js';
import { toast } from './delay.js';
import { icon } from '../icons.js';
import { LOCALE, EN } from '../i18n.js';

const LANG = EN ? 'en' : 'fr';   // langue cible des traductions = langue de l'interface
const CAT_LABEL = { official: 'Officiel', team: 'Écurie', driver: 'Pilote', media: 'Média' };
const LANG_LABEL = { en: 'Anglais', fr: 'Français', es: 'Espagnol', it: 'Italien', de: 'Allemand', nl: 'Néerlandais', pt: 'Portugais', ja: 'Japonais', zh: 'Chinois' };
const TEAM_NAME = Object.fromEntries(NEWS_TEAMS.map(([k, name]) => [k, name]));
const SEEN_KEY = 'paddock.newsSeen';
const ALERTED_KEY = 'paddock.newsAlerted';
const READ_KEY = 'paddock.newsRead';
const PAGE = 60;

let items = [];                // du plus récent au plus ancien
let sources = [];
let srcById = {};
let section = 'all';
let lang = 'all';
let query = '';
let tagFilter = null;          // étiquette choisie dans la colonne de droite (pilote ou écurie)
let limit = PAGE;
let loaded = null;
// Première ouverture : tout ce qui existe déjà est considéré comme lu
let lastSeen = storageGet(SEEN_KEY, null) ?? (storageSet(SEEN_KEY, Date.now()), Date.now());
let revealSpoilers = false;
let cascadeUntil = 0;          // cartes en cascade juste après l'ouverture ou un changement de rubrique
const justArrived = new Set();  // nouvelles reçues pendant que l'espace est ouvert
let alertOwner = !navigator.locks;   // une seule fenêtre par appareil donne les alertes
const open = () => !$('#newsView').hidden;

navigator.locks?.request('paddock-news-alerts', () => { alertOwner = true; return new Promise(() => {}); });

// ---- Traductions (gardées par le serveur, partagées avec le téléphone) ----
let cache = {};
let cacheLoaded = null;
const queued = new Set();
const failed = new Set();
let pendingSave = [];
let saveTimer = null;

// Le serveur de l'appli traduit les actualités d'avance (dès leur arrivée) dans la langue de
// l'interface : la page s'ouvre avec des titres et résumés déjà traduits
let staleTranslations = false;
function shareNewsLang() {
  const on = prefs.newsTranslate !== false;
  api('/api/news/translate', { method: 'POST', body: { lang: on ? LANG : null } }).catch(() => {});
}

function loadTranslations(force = false) {
  if (force) cacheLoaded = null;
  cacheLoaded ||= api(`/api/translations?lang=${LANG}`).then((d) => { cache = { ...cache, ...(d || {}) }; }).catch(() => {});
  return cacheLoaded;
}

// Traduction gardée avec des caractères d'une autre écriture (anciennes versions) : ignorée, refaite
const tr = (text) => { const t = cache[text]?.t; return t && !badScript(t, LANG) ? t : null; };
const needs = (text, from) => text && from !== LANG && !tr(text) && !failed.has(text);

function saveTranslation(item) {
  pendingSave.push(item);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const list = pendingSave;
    pendingSave = [];
    api('/api/translations', { method: 'POST', body: { lang: LANG, items: list } }).catch(() => {});
  }, 1500);
}

// Traduction par le serveur Paddock Live : tous les textes visibles partent ensemble. Serveur en pause (injoignable,
// plafond du jour) : le texte reste dans sa langue et sera retraduit au prochain affichage
function translate(text, from) {
  if (!prefs.newsTranslate || !needs(text, from) || queued.has(text)) return Promise.resolve();
  if (cloudOn()) {
    queued.add(text);
    return cloudTranslate(text, from, LANG).then((out) => {
      queued.delete(text);
      if (out) {
        cache[text] = { t: out, q: 'cloud' };
        if (store.isHost !== false) saveTranslation({ en: text, t: out, q: 'cloud' });
        renderSoon();
        return;
      }
      if (cloudOn()) failed.add(text);   // texte refusé : on n'insiste pas
    });
  }
  if (store.isHost === false) {
    // Téléphone : l'ordinateur traduit ; on relit son cache un peu plus tard
    clearTimeout(translate.reload);
    translate.reload = setTimeout(() => loadTranslations(true).then(scheduleRender), 20000);
  }
  return Promise.resolve();
}

// ---- Données ----
async function load() {
  loaded ||= api('/api/news').then((d) => {
    items = d.items || [];
    setSources(d.sources || []);
  }).catch(() => { loaded = null; });
  await Promise.all([loaded, loadTranslations()]);
}

function setSources(list) {
  sources = list;
  srcById = Object.fromEntries(list.map((s) => [s.id, s]));
}

async function reload() {
  loaded = null;
  await load();
  render();
}

// Écuries et pilotes favoris (étoile du classement) → étiquettes des actualités
function favTags() {
  const out = new Set();
  for (const [num, d] of Object.entries(drivers(store.state))) {
    if (!isFav(num)) continue;
    if (d.Tla) out.add(d.Tla);
    for (const t of newsTags(d.TeamName || '')) out.add(t);
  }
  for (const k of prefs.favTeams || []) out.add(k);
  return out;
}

// Anti-spoiler : pendant une séance en direct, les titres sont masqués et les alertes suspendues (ils
// pourraient révéler un résultat pas encore vu à la TV). Pas pendant un replay d'une séance passée.
function spoilerRisk() {
  if (prefs.spoilers || prefs.newsSpoilers === false) return false;
  if (store.status?.source?.mode === 'replay') return false;
  const st = store.state.SessionStatus?.Status;
  return st === 'Started' || st === 'Aborted';
}

// Articles regroupés par sujet : on montre le plus important (officiel d'abord), les autres en « repris par »
function groups(list) {
  const map = new Map();
  for (const it of list) {
    const k = it.cluster || it.id;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  const rank = (it) => (it.cat === 'official' ? 10 : 0) + (it.imp || 0) * 2 + (it.lang === LANG ? 1 : 0);
  return [...map.values()].map((g) => {
    g.sort((a, b) => rank(b) - rank(a) || a.t - b.t);
    const t = Math.max(...g.map((x) => x.t));
    return { lead: g[0], others: g.slice(1), t, imp: Math.max(...g.map((x) => x.imp || 0)), sources: new Set(g.map((x) => x.src)).size };
  }).sort((a, b) => b.t - a.t);
}

function matches(it, favs) {
  if (lang !== 'all' && it.lang !== lang) return false;
  if (srcById[it.src]?.enabled === false) return false;
  switch (section) {
    case 'important': if ((it.imp || 0) < 2 && (it.sources || 1) < 4) return false; break;
    case 'favs': if (!(it.tags || []).some((t) => favs.has(t))) return false; break;
    case 'video': if (it.kind !== 'video') return false; break;
    case 'official': case 'team': case 'driver': case 'media': if (it.cat !== section) return false; break;
    default: break;
  }
  if (tagFilter && !(it.tags || []).includes(tagFilter)) return false;
  if (query) {
    const q = query.toLowerCase();
    const hay = `${it.title} ${it.summary} ${tr(it.title) || ''} ${srcById[it.src]?.name || ''} ${(it.tags || []).map((t) => TEAM_NAME[t] || t).join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// Nouveau : publié et arrivé depuis la dernière visite de l'espace Actu
const isUnread = (it) => it.seen > lastSeen && it.t > lastSeen;
// Actus déjà lues (ouvertes, ou marquées à la main) : les 2 000 dernières, sur cet appareil
const readIds = new Set(storageGet(READ_KEY, []));
const isRead = (g) => [g.lead, ...g.others].some((x) => readIds.has(x.id));
function setRead(ids, on = true) {
  for (const id of ids) if (on) readIds.add(id); else readIds.delete(id);
  storageSet(READ_KEY, [...readIds].slice(-2000));
}

// ---- Affichage ----
const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'à l\'instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  const d = new Date(t);
  return d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }) + ` ${d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}`;
};

function tagChips(tags) {
  return (tags || []).slice(0, 5).map((t) => {
    return `<span class="nw-tag" style="--tc:${tagColor(t)}">${esc(TEAM_NAME[t] || t)}</span>`;
  }).join('');
}

function titleOf(it) {
  const t = prefs.newsTranslate && it.lang !== LANG ? tr(it.title) : null;
  return { text: t || it.title, translated: !!t, pending: !t && queued.has(it.title) };
}

function card(g, favs, i = -1) {
  const it = g.lead;
  const src = srcById[it.src] || { name: it.src };
  const title = titleOf(it);
  const sum = prefs.newsTranslate && it.lang !== LANG ? tr(it.summary) : null;
  const read = isRead(g);
  const unread = !read && isUnread(it);
  const fav = (it.tags || []).some((t) => favs.has(t));
  const level = g.imp >= 3 ? '<span class="nw-imp major">Majeur</span>' : g.imp >= 2 ? '<span class="nw-imp">Important</span>' : '';
  const hot = g.sources >= 3 ? `<span class="nw-hot" title="Sujet repris par ${g.sources} sources">${icon('fire')} ${g.sources} sources</span>` : '';
  const img = it.img ? `<img class="nw-img" src="${safeUrl(it.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.nw-thumb').remove()">` : '';
  const others = g.others.length ? `<details class="nw-others"><summary>Repris par ${g.others.length} autre${g.others.length > 1 ? 's' : ''} source${g.others.length > 1 ? 's' : ''}</summary>
    ${g.others.map((o) => `<a href="${safeUrl(o.link)}" target="_blank" rel="noopener" data-read="${esc(o.id)}"><b>${esc(srcById[o.src]?.name || o.src)}</b> <span class="nw-lang">${esc(o.lang.toUpperCase())}</span> <span data-no-i18n>${esc(titleOf(o).text)}</span> <span class="muted">· ${ago(o.t)}</span></a>`).join('')}</details>` : '';
  const readBtn = `<button class="nw-readbtn${read ? ' on' : ''}" data-readtoggle="${esc([it.id, ...g.others.map((o) => o.id)].join(' '))}" title="${read ? 'Marquer comme non lu' : 'Marquer comme lu'}">${icon('check')}${read ? ' Lu' : ''}</button>`;
  return `<article data-i="${i}" class="nw-card${read ? ' read' : ''}${justArrived.has(it.id) ? ' arrived' : ''}${unread ? ' unread' : ''}${g.imp >= 2 ? ' imp' : ''}${fav ? ' fav' : ''}${it.kind === 'video' ? ' video' : ''}">
    ${img ? `<a class="nw-thumb" href="${safeUrl(it.link)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true" data-read="${esc(it.id)}">${img}${it.kind === 'video' ? `<span class="nw-play">${icon('play')}</span>` : ''}</a>` : ''}
    <div class="nw-body">
      <div class="nw-meta"><span class="nw-src nw-c-${esc(it.cat)}">${esc(src.name)}</span><span class="nw-cat">${CAT_LABEL[it.cat] || ''}</span>
        <span class="nw-lang" title="Langue d'origine : ${esc(LANG_LABEL[it.lang] || it.lang)}">${esc(it.lang.toUpperCase())}</span><span class="nw-time" title="${esc(new Date(it.t).toLocaleString(LOCALE))}">${ago(it.t)}</span>${level}${hot}${fav ? `<span class="nw-favmark" title="Concerne un de vos favoris">${icon('star-fill')}</span>` : ''}${readBtn}</div>
      <a class="nw-title" data-no-i18n href="${safeUrl(it.link)}" target="_blank" rel="noopener" data-read="${esc(it.id)}" ${title.translated ? `title="${esc(it.title)}"` : ''}>${esc(title.text)}</a>
      ${title.pending ? '<div class="nw-trans muted">Traduction en cours…</div>' : title.translated ? '<div class="nw-trans muted" title="Traduit automatiquement par le serveur Paddock Live">Traduit · <button class="nw-vo" data-vo>VO</button></div>' : ''}
      <div class="nw-vo-text" hidden>${esc(it.title)}</div>
      ${it.summary ? `<p class="nw-sum" data-no-i18n>${esc(sum || it.summary)}</p>` : ''}
      <div class="nw-tags">${tagChips(it.tags)}</div>
      ${others}
    </div>
  </article>`;
}

function sourcesView() {
  const by = { official: [], team: [], driver: [], media: [] };
  for (const s of sources) (by[s.cat] || by.media).push(s);
  const row = (s) => {
    const state = !s.enabled ? '<span class="muted">désactivée</span>' : s.ok === false ? `<span class="nw-err" title="${esc(s.error || '')}">${icon('warning')} indisponible</span>` : s.ok ? `<span class="nw-ok">${icon('check')} ${s.count} article${s.count > 1 ? 's' : ''}</span>` : '<span class="muted">en attente…</span>';
    const kind = s.kind === 'youtube' ? 'YouTube' : s.kind === 'bsky' ? 'Bluesky' : 'Flux RSS';
    return `<tr><td><label class="toggle"><input type="checkbox" data-src-toggle="${esc(s.id)}" ${s.enabled ? 'checked' : ''}> ${esc(s.name)}</label></td>
      <td class="muted">${kind}</td><td>${esc((s.lang || '').toUpperCase())}</td><td>${state}</td></tr>`;
  };
  const block = (cat, title) => (by[cat].length ? `<div class="sz-box"><h3>${title}</h3><table class="sz-table nw-src-table">${by[cat].map(row).join('')}</table></div>` : '');
  return `<p class="muted small">Sources lues par le serveur de Paddock Live ; décochez celles que vous ne voulez pas voir.</p>
    ${block('official', `${icon('landmark')} Officiel : F1 et FIA`)}${block('team', `${icon('car')} Écuries (chaînes officielles)`)}${block('driver', `${icon('user')} Pilotes (chaînes officielles)`)}${block('media', `${icon('globe')} Médias`)}`;
}

// Nom affiché d'une étiquette : pilote (nom de famille du classement si connu) ou écurie
function tagName(t) {
  if (TEAM_NAME[t]) return TEAM_NAME[t];
  const d = Object.values(drivers(store.state)).find((x) => x.Tla === t);
  return d?.LastName ? `${d.LastName}` : t;
}

// Écurie de l'actualité -> nom d'équipe dans les données de la séance (couleur de l'écurie)
const TEAM_MATCH = {
  ferrari: /ferrari/i, mercedes: /mercedes/i, mclaren: /mclaren/i, redbull: /^red bull/i, rb: /racing bulls|\brb\b|visa cash/i,
  aston: /aston/i, williams: /williams/i, alpine: /alpine/i, haas: /haas/i, audi: /audi|sauber|kick/i, cadillac: /cadillac/i,
};

function tagColor(t) {
  const all = Object.values(drivers(store.state));
  const d = all.find((x) => x.Tla === t) || (TEAM_MATCH[t] && all.find((x) => TEAM_MATCH[t].test(x.TeamName || '')));
  return d ? teamColor(d) : t === 'fia' ? '#3b82f6' : 'var(--muted)';
}

// Colonne de droite : sujets à la une, qui fait l'actu, dernières vidéos
function asideView(all) {
  const now = Date.now();
  const recent = all.filter((it) => it.t > now - 48 * 3600e3);
  const top = groups(recent).filter((g) => g.sources >= 2 || g.imp >= 2)
    .sort((a, b) => b.sources - a.sources || b.imp - a.imp || b.t - a.t).slice(0, 6);
  const day = groups(all.filter((it) => it.t > now - 24 * 3600e3));
  const counts = new Map();
  for (const g of day) for (const t of new Set(g.lead.tags || [])) counts.set(t, (counts.get(t) || 0) + 1);
  const who = [...counts].filter(([t]) => t !== 'fia').sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = who[0]?.[1] || 1;
  const videos = all.filter((it) => it.kind === 'video' && it.img).slice(0, 4);
  // Titres de la colonne traduits comme ceux du fil
  for (const it of [...top.map((g) => g.lead), ...videos]) translate(it.title, it.lang);
  const topHtml = top.length ? top.map((g, i) => `<a class="nwa-top" href="${safeUrl(g.lead.link)}" target="_blank" rel="noopener" data-read="${esc(g.lead.id)}">
      <span class="nwa-rank">${i + 1}</span><span class="nwa-txt"><b data-no-i18n>${esc(titleOf(g.lead).text)}</b>
      <span class="muted small">${g.sources} source${g.sources > 1 ? 's' : ''} · ${ago(g.t)}</span></span></a>`).join('')
    : '<div class="muted small">Pas encore de sujet repris par plusieurs sources.</div>';
  const whoHtml = who.length ? who.map(([t, n]) => `<button class="nwa-who${tagFilter === t ? ' on' : ''}" data-tag="${esc(t)}" style="--tc:${tagColor(t)}" title="Afficher seulement les sujets qui citent ${esc(tagName(t))}">
      <span class="nwa-who-name">${esc(tagName(t))}</span><span class="nwa-bar"><i style="width:${Math.round((n / max) * 100)}%"></i></span><span class="nwa-n">${n}</span></button>`).join('')
    : '<div class="muted small">Rien sur les dernières 24 heures.</div>';
  const vidHtml = videos.length ? `<div class="nwa-vids">${videos.map((v) => `<a href="${safeUrl(v.link)}" target="_blank" rel="noopener" title="${esc(v.title)}" data-read="${esc(v.id)}">
      <span class="nwa-vthumb"><img src="${safeUrl(v.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">${icon('play')}</span>
      <span class="nwa-vtitle" data-no-i18n>${esc(titleOf(v).text)}</span><span class="muted small">${esc(srcById[v.src]?.name || '')}</span></a>`).join('')}</div>` : '<div class="muted small">Aucune vidéo récente.</div>';
  return [
    `<h3>${icon('fire')} À la une <span class="muted small">48 h</span></h3>${topHtml}`,
    `<h3>${icon('chart')} Qui fait l'actu <span class="muted small">24 h</span></h3>${whoHtml}`,
    `<h3>${icon('video')} Dernières vidéos</h3>${vidHtml}`,
  ];
}

// Mise à jour par morceaux : chaque traduction terminée redessinait toute la page (barres de
// « Qui fait l'actu » qui repartaient de zéro, images rechargées). Seul ce qui a changé est remplacé.
function patchHtml(node, html) {
  if (node._html === html) return;
  node._html = html;
  node.innerHTML = html;
}

// Traductions terminées : un seul rendu toutes les 1,5 s (au lieu d'un par titre traduit)
let soonTimer = 0;
function renderSoon() {
  if (soonTimer) return;
  soonTimer = setTimeout(() => { soonTimer = 0; scheduleRender(); }, 1500);
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; if (open()) render(); });
}

function render() {
  updateBadge();
  if (!open()) return;
  $$('#nwNav [data-nw]').forEach((b) => b.classList.toggle('active', b.dataset.nw === section));
  const el = $('#nwContent');
  if (section === 'sources') { el.innerHTML = sourcesView(); return; }
  const favs = favTags();
  const list = groups(items.filter((it) => matches(it, favs)));
  listed = list;
  const shown = list.slice(0, limit);
  const guard = spoilerRisk() && !revealSpoilers;
  const okSources = sources.filter((s) => s.enabled && s.ok !== false).length;
  const head = `<div class="nw-head"><div><h2>${$(`#nwNav [data-nw="${section}"]`)?.innerHTML.trim() || 'Actualités'}</h2>
      <div class="muted small">${tagFilter ? `<button class="nw-filter" data-tag-clear style="--tc:${tagColor(tagFilter)}">${esc(tagName(tagFilter))} ${icon('close')}</button> ` : ''}${okSources} sources suivies · ${list.length} sujet${list.length > 1 ? 's' : ''}${section === 'favs' && !favTags().size ? ' · aucun favori : ajoutez-en avec l\'étoile du classement' : ''}</div></div>
      <div class="nw-actions"><button class="btn small" id="nwRefresh" title="Relire les actualités maintenant">${icon('refresh')} Actualiser</button>
      <button class="btn small" id="nwMarkRead" title="Tout marquer comme lu">${icon('check')} Tout marquer comme lu</button></div></div>`;
  const banner = guard ? `<div class="nw-guard">${icon('eye-off')} <b>Anti-spoiler</b> : séance en cours, titres masqués.
      <button class="btn small" id="nwReveal">Afficher quand même</button></div>` : '';
  const body = shown.length
    ? `<div class="nw-list${guard ? ' guarded' : ''}${Date.now() < cascadeUntil ? ' cascade' : ''}">${shown.map((g, i) => card(g, favs, i)).join('')}</div>${list.length > limit ? '<button class="btn nw-more" id="nwMore">Voir plus</button>' : ''}`
    : `<div class="sz-box muted">${loaded ? 'Aucune actualité pour ces filtres.' : 'Chargement des actualités…'}</div>`;
  const keep = el.scrollTop;
  const visible = items.filter((it) => srcById[it.src]?.enabled !== false);
  const aside = asideView(visible);
  let layout = el.firstElementChild;
  if (!layout?.classList.contains('nw-layout') || layout.querySelectorAll('.nwa-box').length !== aside.length) {
    el.innerHTML = `<div class="nw-layout"><div class="nw-feed"></div><aside class="nw-aside">${aside.map(() => '<section class="nwa-box"></section>').join('')}</aside></div>`;
    layout = el.firstElementChild;
  }
  layout.classList.toggle('guarded', guard);
  patchHtml(layout.querySelector('.nw-feed'), `${head}${banner}${body}`);
  layout.querySelectorAll('.nwa-box').forEach((box, i) => patchHtml(box, aside[i]));
  el.scrollTop = keep;
  justArrived.clear();
  // Traduction des seuls articles visibles à l'écran (titre, puis résumé)
  lastShown = shown;
  watchVisible(layout.querySelector('.nw-feed'));
}

let lastShown = [];
let visObserver = null;
function watchVisible(feed) {
  if (!prefs.newsTranslate || store.isHost === false) return;
  visObserver ||= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const g = lastShown[Number(e.target.dataset.i)];
      if (!g) continue;
      translate(g.lead.title, g.lead.lang);
      if (g.lead.summary) translate(g.lead.summary, g.lead.lang);
    }
  }, { root: $('#nwContent'), rootMargin: '200px 0px' });
  visObserver.disconnect();
  for (const c of feed.querySelectorAll('.nw-card[data-i]')) visObserver.observe(c);
}

function updateBadge() {
  const n = items.filter((it) => isUnread(it) && srcById[it.src]?.enabled !== false).length;
  for (const b of [$('#newsBtn'), $('#rail [data-rail="news"]')]) {
    if (!b) continue;
    const v = n > 99 ? '99+' : String(n);
    if (n && b.dataset.count !== v) {
      if (Number(v) > Number(b.dataset.count || 0) || v === '99+') { b.classList.remove('count-pop'); void b.offsetWidth; b.classList.add('count-pop'); }
      b.dataset.count = v;
    } else if (!n) delete b.dataset.count;
  }
}

// Tout marquer comme lu : articles de la liste affichée marqués lus, plus de pastille « nouveau »
let listed = [];
function markRead() {
  lastSeen = Date.now();
  storageSet(SEEN_KEY, lastSeen);
  setRead(listed.map((g) => g.lead.id));
  render();
}

// ---- Alertes ----
function alerted() { return new Set(storageGet(ALERTED_KEY, [])); }
function rememberAlert(k) {
  const list = [...alerted(), k].slice(-400);
  storageSet(ALERTED_KEY, list);
}

function wantsAlert(it, favs) {
  const level = prefs.newsAlerts || 'important';
  if (level === 'off' || !it.fresh) return false;
  if (srcById[it.src]?.enabled === false) return false;
  const important = (it.imp || 0) >= 2 || (it.sources || 1) >= 4;
  const fav = (it.tags || []).some((t) => favs.has(t));
  if (level === 'all') return true;
  if (level === 'favs') return fav;
  return important || (fav && (it.imp || 0) >= 1);
}

async function onFresh(list) {
  if (!alertOwner || spoilerRisk()) return;
  const favs = favTags();
  const done = alerted();
  for (const it of list) {
    const key = it.cluster || it.id;
    if (done.has(key) || !wantsAlert(it, favs)) continue;
    done.add(key);
    rememberAlert(key);
    // Traduit avant l'alerte (15 s au plus), sinon texte d'origine
    await Promise.race([translate(it.title, it.lang), new Promise((r) => setTimeout(r, 15000))]);
    const src = srcById[it.src]?.name || it.src;
    const title = titleOf(it).text;
    notifyNews(`${src}${it.sources >= 4 ? ` · ${it.sources} sources` : ''}`, title, (it.imp || 0) >= 2 ? 'info' : 'fav', () => { openNews(); });
  }
}

on('news', (list) => {
  if (!Array.isArray(list) || !list.length) return;
  const known = new Set(items.map((x) => x.id));
  const sizes = {};
  for (const it of list) sizes[it.cluster] = it.sources;
  for (const it of items) if (sizes[it.cluster]) it.sources = sizes[it.cluster];
  const fresh = list.filter((x) => !known.has(x.id));
  // 800 plus récentes, comme au chargement (appli ouverte des jours : la liste ne grossit plus sans fin)
  items = [...fresh.map(({ fresh: f, ...x }) => x), ...items].sort((a, b) => b.t - a.t).slice(0, 800);
  for (const it of fresh) justArrived.add(it.id);
  // Pas de traduction de toutes les nouvelles en arrière-plan sur l'ordinateur (beaucoup de calcul) :
  // le serveur de l'appli les fait traduire d'avance en ligne ; ici, seulement les alertes et l'écran
  onFresh(fresh);
  staleTranslations = true;   // traductions faites d'avance par le serveur : relues à l'ouverture
  scheduleRender();
  updateBadge();
  // Une nouvelle source a répondu : on rafraîchit leur état si la page Sources est ouverte
  if (section === 'sources') reloadSources();
});

on('prefs', (k) => {
  if ((k === 'favs' || k === 'favTeams') && open()) scheduleRender();
  if (k === 'newsTranslate' && store.isHost !== false) shareNewsLang();
});

async function reloadSources() {
  try { setSources((await api('/api/news')).sources || []); } catch { /* ignore */ }
  if (open()) render();
}

// ---- Lecture d'un article dans l'appli ----
// Article : texte lu par le serveur de l'appli (server/article.js), traduit paragraphe par paragraphe ;
// vidéo YouTube : lecteur intégré ; publication : texte complet. Lien vers le site toujours proposé.
let readerEl = null;
let readerSeq = 0;
let readerScroll = 0;
const readerOpen = () => !!readerEl && !readerEl.hidden;

function closeReader() {
  if (!readerOpen()) return;
  readerSeq++;
  readerEl.hidden = true;
  readerEl.innerHTML = '';
  $('#nwContent').hidden = false;
  render();   // l'actu ouverte passe en « Lu »
  $('#nwContent').scrollTop = readerScroll;
}

const readerTranslate = (text, from) => cloudTranslate(text, from, LANG);

async function openReader(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return false;
  setRead([id]);
  if (!readerEl) {
    readerEl = document.createElement('div');
    readerEl.className = 'sz-main nw-reader';
    readerEl.hidden = true;
    $('#nwContent').after(readerEl);
    readerEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-r-close]')) closeReader();
      const vo = e.target.closest('[data-r-vo]');
      if (vo) {
        const on = vo.getAttribute('aria-pressed') !== 'true';
        vo.setAttribute('aria-pressed', String(on));
        vo.classList.toggle('on', on);
        for (const el of readerEl.querySelectorAll('[data-orig]')) el.textContent = on || !el.dataset.tr ? el.dataset.orig : el.dataset.tr;
      }
    });
  }
  if (!readerOpen()) readerScroll = $('#nwContent').scrollTop;
  $('#nwContent').hidden = true;
  readerEl.hidden = false;
  readerEl.scrollTop = 0;
  const seq = ++readerSeq;
  const translate = prefs.newsTranslate && it.lang !== LANG;
  const src = srcById[it.src]?.name || it.src;
  const bar = `<div class="nwr-bar"><button class="btn small" data-r-close>${icon('arrow-left')} Retour à l'actu</button>
    <span class="nwr-src"><b>${esc(src)}</b> <span class="nw-lang">${esc(it.lang.toUpperCase())}</span> · ${ago(it.t)}</span><span class="spacer"></span>
    ${translate ? `<button class="btn small" data-r-vo aria-pressed="false" title="Afficher le texte d'origine">VO</button>` : ''}
    <a class="btn small" href="${safeUrl(it.link)}" target="_blank" rel="noopener">${icon('external')} Ouvrir sur le site</a></div>`;
  // Seuls le titre et le résumé sont traduits (déjà faits d'avance) ; le texte de l'article reste en
  // version originale, pour ne pas multiplier les traductions
  const textEl = (tag, text, cls = '') => `<${tag}${cls ? ` class="${cls}"` : ''} data-no-i18n data-orig="${esc(text)}">${esc(text)}</${tag}>`;
  const plainEl = (tag, text) => `<${tag} data-no-i18n>${esc(text)}</${tag}>`;
  const summary = translate && it.summary ? `<div class="nwr-sum"><div class="nwr-sum-h">Résumé</div>${textEl('p', it.summary)}</div>` : '';
  const yt = youtubeId(it.link);
  let body;
  if (yt) {
    body = `${textEl('h1', it.title)}<div class="nwr-video"><iframe src="https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}" title="${esc(it.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      ${it.summary ? textEl('p', it.summary) : ''}`;
  } else if (it.kind === 'post') {
    body = `${textEl('p', it.summary || it.title, 'nwr-post')}${it.img ? `<img class="nwr-img" src="${safeUrl(it.img)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}`;
  } else {
    readerEl.innerHTML = `${bar}<article class="nwr">${textEl('h1', it.title)}<div class="nwr-loading muted">${icon('history')} Chargement de l'article…</div></article>`;
    let a;
    try { a = await api(`/api/news/article?u=${encodeURIComponent(it.link)}`); } catch (err) { a = { readable: false, reason: err.message }; }
    if (seq !== readerSeq) return true;
    const date = a.published && Number.isFinite(Date.parse(a.published)) ? new Date(a.published).toLocaleString(LOCALE, { dateStyle: 'long', timeStyle: 'short' }) : '';
    const meta = [a.author, date].filter(Boolean).join(' · ');
    const img = a.image || it.img;
    const blocks = (summary ? `<div class="nwr-vo-note muted small">Article en version originale (${esc(LANG_LABEL[it.lang] || it.lang)})</div>` : '')
      + (a.blocks || []).map((b) => (b.h ? plainEl('h2', b.h) : plainEl('p', b.p))).join('');
    body = `${textEl('h1', it.title)}${meta ? `<div class="nwr-meta muted" data-no-i18n>${esc(meta)}</div>` : ''}
      ${img ? `<img class="nwr-img" src="${safeUrl(img)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      ${a.readable ? summary + blocks : `${it.summary ? textEl('p', it.summary, 'nwr-lead') : a.description ? plainEl('p', a.description) : ''}
        <div class="nwr-note">${icon('info')} <span>L'article complet ne peut pas être affiché dans l'appli.${a.reason ? ` <span class="muted">${esc(a.reason)}</span>` : ''}</span>
        <a class="btn small btn-accent" href="${safeUrl(it.link)}" target="_blank" rel="noopener">${icon('external')} Lire sur le site</a></div>`}
      ${a.readable ? `<div class="nwr-end muted small">Texte lu sur ${esc(a.site || src)} · <a href="${safeUrl(it.link)}" target="_blank" rel="noopener">article d'origine</a></div>` : ''}`;
  }
  readerEl.innerHTML = `${bar}<article class="nwr">${body}</article>`;
  if (yt) watchEmbed(readerEl.querySelector('.nwr-video iframe'), it.link, yt);
  if (!translate) return true;
  // Traduction du titre et du résumé (en général déjà faite d'avance)
  const els = [...readerEl.querySelectorAll('[data-orig]')];
  const voBtn = readerEl.querySelector('[data-r-vo]');
  await Promise.all(els.map(async (el) => {
    const known = tr(el.dataset.orig);
    const t = known || await readerTranslate(el.dataset.orig, it.lang);
    if (seq !== readerSeq || !t || badScript(t, LANG)) return;
    el.dataset.tr = t;
    if (voBtn?.getAttribute('aria-pressed') !== 'true') el.textContent = t;
  }));
  return true;
}

// Vidéo que sa chaîne ne laisse lire que sur certains sites (chaîne officielle de la F1…) : le lecteur YouTube
// le signale (erreur 101, 150…) ; à la place, son image et « Regarder sur YouTube » (navigateur)
let embedWatch = null;
function watchEmbed(frame, link, id) {
  if (embedWatch) removeEventListener('message', embedWatch);
  if (!frame) return;
  const box = frame.parentElement;
  embedWatch = (e) => {
    if (e.source !== frame.contentWindow) return;
    let d;
    try { d = JSON.parse(e.data); } catch { return; }
    if (d?.event !== 'onError') return;
    removeEventListener('message', embedWatch);
    box.classList.add('off');
    box.innerHTML = `<img src="https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg" alt="" referrerpolicy="no-referrer" onerror="this.remove()">
      <div><a class="btn btn-accent" href="${safeUrl(link)}" target="_blank" rel="noopener">${icon('play')} Regarder sur YouTube</a>
      <p class="small">La chaîne ne permet pas de lire cette vidéo en dehors de YouTube.</p></div>`;
  };
  addEventListener('message', embedWatch);
  // Le lecteur n'envoie ses évènements (dont les erreurs) qu'une fois prévenu qu'on l'écoute
  frame.addEventListener('load', () => frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'nwr', channel: 'widget' }), '*'));
}

// ---- Ouverture / fermeture ----
export function openNews(sec) {
  if (sec) section = sec;
  import('./season.js').then((m) => m.closeSeason());
  import('./home.js').then((m) => { m.homeTouched(); m.closeHome(); });
  import('./replays.js').then((m) => m.closeReplays());
  placeView($('#newsView'));
  $('#newsView').hidden = false;
  $('#newsBtn')?.classList.add('on');
  limit = PAGE;
  cascadeUntil = Date.now() + 400;
  // Nouvelles arrivées depuis la dernière lecture : leurs traductions (faites d'avance) sont relues
  // avant d'afficher la page, pour ne pas montrer le texte d'origine une fraction de seconde
  if (staleTranslations && cacheLoaded) {
    staleTranslations = false;
    loadTranslations(true).then(render);
  } else {
    load().then(render);
    render();
  }
  clearInterval(openNews.timer);
  openNews.timer = setInterval(() => { if (open()) scheduleRender(); }, 60000);
}

export function closeNews() {
  if ($('#newsView').hidden) return;
  closeReader();
  $('#newsView').hidden = true;
  $('#newsBtn')?.classList.remove('on');
  clearInterval(openNews.timer);
  // Ce qui a été vu est marqué comme lu
  markRead();
}

// Dernières actualités (page d'accueil) : titre traduit si besoin, source, date. Titres pas encore
// traduits (arrivés depuis l'ouverture de l'appli) : traductions du serveur relues, sinon demandées,
// puis onTranslated() pour réafficher
export async function latestNews(n = 4, onTranslated = null) {
  await load();
  const list = items.filter((it) => srcById[it.src]?.enabled !== false && it.kind !== 'video').sort((a, b) => b.t - a.t).slice(0, n);
  const missing = prefs.newsTranslate ? list.filter((it) => needs(it.title, it.lang)) : [];
  if (missing.length && onTranslated) {
    loadTranslations(true)
      .then(() => Promise.all(missing.filter((it) => needs(it.title, it.lang)).map((it) => translate(it.title, it.lang))))
      .then(onTranslated);
  }
  return list.map((it) => ({ id: it.id, title: titleOf(it).text, link: safeUrl(it.link), src: srcById[it.src]?.name || it.src, when: ago(it.t) }));
}

export function initNews() {
  if (store.isHost !== false) shareNewsLang();
  const alertsSel = $('#nwAlerts');
  alertsSel.value = prefs.newsAlerts || 'important';
  alertsSel.addEventListener('change', () => setPref('newsAlerts', alertsSel.value));
  $('#nwTranslate').checked = prefs.newsTranslate !== false;
  $('#nwTranslate').addEventListener('change', (e) => { setPref('newsTranslate', e.target.checked); render(); });
  $('#nwSpoilers').checked = prefs.newsSpoilers !== false;
  $('#nwSpoilers').addEventListener('change', (e) => { setPref('newsSpoilers', e.target.checked); render(); });
  $('#nwLang').addEventListener('change', (e) => { lang = e.target.value; limit = PAGE; render(); });
  let t = null;
  $('#nwSearch').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { query = e.target.value.trim(); limit = PAGE; render(); }, 200); });
  $('#newsBtn')?.addEventListener('click', () => (open() ? closeNews() : openNews()));
  $('#nwClose').addEventListener('click', closeNews);
  $('#nwNav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-nw]');
    if (!b) return;
    closeReader();
    section = b.dataset.nw;
    limit = PAGE;
    cascadeUntil = Date.now() + 400;
    if (section === 'sources') reloadSources();
    render();
    $('#nwContent').scrollTop = 0;
  });
  $('#nwContent').addEventListener('click', async (e) => {
    if (e.target.closest('#nwMore')) { limit += PAGE; render(); return; }
    if (e.target.closest('#nwRefresh')) { api('/api/news/refresh', { method: 'POST' }).catch(() => {}); toast('Mise à jour des actualités…'); setTimeout(reload, 5000); return; }
    if (e.target.closest('#nwMarkRead')) { markRead(); return; }
    if (e.target.closest('#nwReveal')) { revealSpoilers = true; render(); return; }
    const rt = e.target.closest('[data-readtoggle]');
    if (rt) { setRead(rt.dataset.readtoggle.split(' '), !rt.classList.contains('on')); render(); return; }
    const tagBtn = e.target.closest('[data-tag]');
    if (tagBtn) { tagFilter = tagFilter === tagBtn.dataset.tag ? null : tagBtn.dataset.tag; limit = PAGE; render(); $('#nwContent').scrollTop = 0; return; }
    if (e.target.closest('[data-tag-clear]')) { tagFilter = null; render(); return; }
    const vo = e.target.closest('[data-vo]');
    if (vo) {
      const card = vo.closest('.nw-card');
      const box = card.querySelector('.nw-vo-text');
      box.hidden = !box.hidden;
      return;
    }
  });
  $('#nwContent').addEventListener('change', async (e) => {
    const tg = e.target.closest('[data-src-toggle]');
    if (!tg) return;
    await api('/api/news/sources', { method: 'POST', body: { toggle: tg.dataset.srcToggle, on: tg.checked } }).catch(() => {});
    reloadSources();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !open() || document.querySelector('dialog[open]')) return;
    if (readerOpen()) closeReader(); else closeNews();
  });
  // Articles, vidéos et publications ouverts dans l'appli (Ctrl / Cmd / clic milieu : dans le navigateur)
  $('#newsView').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-read]');
    if (!a) return;
    setRead([a.dataset.read]);
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) { a.closest('.nw-card')?.classList.add('read'); return; }
    if (items.some((x) => x.id === a.dataset.read)) { e.preventDefault(); openReader(a.dataset.read); }
  });
  // Liste chargée au démarrage : pastille du nombre de nouveautés
  load().then(updateBadge);
}
