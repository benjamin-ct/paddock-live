// Mode créateur : générateur de posts pour les réseaux sociaux après la séance (visuels aux
// formats des réseaux et légendes prêtes à copier). Caché par défaut ; activé sur l'ordinateur
// avec Ctrl + Alt + P et le code du propriétaire.
import { store } from '../store.js';
import { $, esc, photoUrl, storageGet, storageSet } from '../util.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { toast } from './delay.js';
import { FLAG_ISO } from './header.js';
import { postData, captions, xLength } from '/shared/social.js';
import { FORMATS, slidesFor, drawSlide, slideName, slideAlt, chosenSlides, keptData, videoCover } from '/shared/social-draw.js';
import { creditCaptions, followCaptions, questionCaptions } from '/shared/social-follow.js';
import { raceWeekData, weekendData, recordsData, ratingsData, teamDuelsData, titleData, raceLapsData, recapData, seasonCaptions } from '/shared/social-season.js';
import { raceFrame, raceVideoTiming } from '/shared/social-draw-season.js';
import { makeAnimation } from '/shared/social-video.js';
import { newsFrame, newsVideoTiming } from '/shared/social-news-video.js';
import { bigNews, newsPost, newsCaptions, newsKind, newsKinds, sortNews, OTHER_SERIES, isBreaking, NEWS_BADGES } from '/shared/social-news.js';
import { newsTags } from '/shared/news.js';
import { builtinNomination } from '/shared/tyres.js';
import { preraceData, champData, flashEvents, flashData, moreCaptions, FLASH_KINDS } from '/shared/social-more.js';
import { postedEntry } from '/shared/post-history.js';
import { circuitInfo } from '/shared/circuits-info.js';
import { loadTeamLogos } from '/shared/team-logos.js';
import { openPublish, musicSelect, musicEvent, endPreview } from './social-publish-view.js';
import { openImageViewer } from '/shared/image-viewer.js';
import { captionsFor, packDraftImages, unpackDraftImages } from '/shared/post-draft.js';

const SIG_KEY = 'paddock.postSignature';
const OPT_KEY = 'paddock.postOptions';
let enabled = false;
let fmt = storageGet(OPT_KEY, {}).fmt || 'ig';
let withPhotos = storageGet(OPT_KEY, {}).photos !== false;
let noSpoiler = storageGet(OPT_KEY, {}).noSpoiler !== false;   // texte sans le vainqueur au début
let mode = ['news', 'season', 'manual'].includes(storageGet(OPT_KEY, {}).mode) ? storageGet(OPT_KEY, {}).mode : 'session';
let withQuestion = storageGet(OPT_KEY, {}).question !== false;   // question en fin de texte (commentaires)
const SEASON_TYPES = [['raceweek', 'Race Week'], ['weekend', 'Programme du week-end'], ['records', 'Le saviez-vous'], ['ratings', 'Notes des pilotes'], ['teamduels', 'Duels coéquipiers'], ['title', 'Course au titre'], ['racelaps', 'Course tour par tour']];
let seasonType = SEASON_TYPES.some(([k]) => k === storageGet(OPT_KEY, {}).seasonType) ? storageGet(OPT_KEY, {}).seasonType : 'raceweek';
let roundSel = null;   // manche choisie (posts de saison)
let recapMode = false; // news : récap de la semaine
let curPost = null;    // post affiché et ses visuels (vidéo animée de la course)
let skipSlides = { key: '', set: new Set() };   // images écartées du post affiché (toutes publiées par défaut)
let linkComment = storageGet(OPT_KEY, {}).linkComment !== false;   // news : lien de l'article en premier commentaire
let follow = storageGet(OPT_KEY, {}).follow !== false && !withQuestion;   // image « Abonnez-vous » et ligne dans les textes (pas avec la question : un seul appel par post)
const POST_TYPES = [['results', 'Résultats'], ['prerace', 'Avant-course'], ['champ', 'Championnat'], ['flash', 'Flash']];
let postType = POST_TYPES.some(([k]) => k === storageGet(OPT_KEY, {}).postType) ? storageGet(OPT_KEY, {}).postType : 'results';   // séance : type de post
let flashSel = null;   // évènement choisi pour un post flash
const imgCache = new Map();

function loadImage(src, cors = false) {
  if (!src) return Promise.resolve(null);
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  imgCache.set(src, p);
  return p;
}

// Photo en grand format quand la F1 la propose (« 1col » -> « 4col »), sinon celle de la liste
async function headshot(url) {
  if (!url) return null;
  const big = url.replace(/\.transform\/\dcol\//, '.transform/4col/');
  return (big !== url && await loadImage(photoUrl({ HeadshotUrl: big }))) || loadImage(photoUrl({ HeadshotUrl: url }));
}

async function assets(d) {
  await Promise.all(['800 40px "Saira Condensed"', '700 40px "Saira Condensed"', '600 30px "Titillium Web"', '400 30px "Titillium Web"', '700 30px "JetBrains Mono"']
    .map((f) => document.fonts?.load(f).catch(() => {})));
  const photos = {};
  if (withPhotos) {
    await Promise.all(d.rows.slice(0, 3).map(async (r) => { photos[r.num] = await headshot(r.headshot); }));
  }
  const iso = d.iso || FLAG_ISO[String(d.country || '').toUpperCase()];
  const [flag, logos] = await Promise.all([
    iso ? loadImage(`https://flagcdn.com/${d.post === 'raceweek' ? 'w1280' : 'w160'}/${iso}.png`, true) : null,
    loadTeamLogos((u) => loadImage(photoUrl({ HeadshotUrl: u }))),
  ]);
  return { photos, flag, logos };
}

const POST_FOLDER = { prerace: 'Avant-course', champ: 'Championnat', flash: 'Flash' };
const folderOf = (d) => (d.news ? `Actu ${d.date} - ${d.title.slice(0, 50)}` : d.recap ? `Actu semaine du ${d.date}`
  : `${d.year || ''} ${d.gpEn.replace(/ Grand Prix$/i, '') || 'Grand Prix'} - ${d.label}${POST_FOLDER[d.post] ? ` - ${POST_FOLDER[d.post]}` : ''}${d.event ? ` ${d.event.id}` : ''}`.trim());

// ---------- Posts de la séance : résultats, avant-course, championnat, flash ----------
let tyresCache = null;
async function nominations() {
  const info = store.state.SessionInfo || {};
  if (!info.Path) return null;
  if (tyresCache?.path !== info.Path) {
    const q = new URLSearchParams({ path: info.Path, until: Date.now(), name: info.Meeting?.Name || '', location: info.Meeting?.Location || '', country: info.Meeting?.Country?.Name || '', session: info.Name || '' });
    const r = await fetch(`/api/tyres?${q}`, { signal: AbortSignal.timeout(6000) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    tyresCache = { path: info.Path, n: r?.nominations || builtinNomination(Number(String(info.Path).slice(0, 4)), { name: info.Meeting?.Name, location: info.Meeting?.Location, country: info.Meeting?.Country?.Name }) };
  }
  return tyresCache.n;
}

// Grille officielle de la FIA (course ou sprint), relue toutes les 5 minutes (provisoire puis définitive)
const gridCache = new Map();
async function officialGrid(sprint) {
  const info = store.state.SessionInfo || {};
  const year = Number(String(info.Path || '').slice(0, 4)) || Number(String(info.StartDate || '').slice(0, 4));
  if (!year || !info.Meeting?.Name) return { grid: null };
  const key = `${year}|${info.Meeting.Name}|${sprint}`;
  const hit = gridCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60e3) return hit.r;
  const q = new URLSearchParams({ year, name: info.Meeting.Name, country: info.Meeting.Country?.Name || '', location: info.Meeting.Location || '', sprint: sprint ? '1' : '0' });
  const r = await fetch(`/api/social/grid?${q}`, { signal: AbortSignal.timeout(30000) }).then((x) => x.json()).catch((err) => ({ error: err.message }));
  if (!r.error) gridCache.set(key, { r, at: Date.now() });
  return r;
}

function sessionSource(sig) {
  const types = `<div class="row posts-news-bar"><span class="small muted">${t('Type de post')}</span>
    <div class="posts-seg" role="tablist">${POST_TYPES.map(([k, v]) => `<button class="posts-fmt ${k === postType ? 'active' : ''}" data-ptype="${k}">${t(v)}</button>`).join('')}</div></div>`;
  const state = store.state;
  if (postType === 'prerace') {
    return Promise.all([nominations(), officialGrid(postData(state).sprint)]).then(([tyres, og]) => {
      const d = preraceData(state, { tyres, grid: og.grid });
      const note = d.gridSource === 'fia' ? t('Grille officielle de la FIA, pénalités comprises.')
        : d.gridSource === 'fia-provisional' ? t('Grille provisoire de la FIA : la définitive peut encore changer (pénalités).')
          : og.error ? t('Grille de la FIA indisponible ({}) : ordre des qualifications, sans les pénalités.', og.error)
            : t('Grille pas encore publiée par la FIA : ordre des qualifications, sans les pénalités.');
      const warn = `<p class="posts-warn small">${icon('info')} ${esc(note)}</p>`;
      return { d, caps: (dd) => moreCaptions(dd, sig), head: types + warn, record: { key: `prerace:${folderOf(d)}`, kind: 'prerace', title: `${t('Avant-course')} · ${d.gp}` } };
    });
  }
  if (postType === 'champ') {
    const d = champData(state);
    if (!d) return { head: `${types}<p class="muted">${t('Championnat disponible après une course ou un sprint.')}</p>` };
    return { d, caps: (dd) => moreCaptions(dd, sig), head: types, record: { key: `champ:${folderOf(d)}`, kind: 'champ', title: `${t('Championnat')} · ${d.gp}` } };
  }
  if (postType === 'flash') {
    const evs = flashEvents(state);
    if (!evs.length) return { head: `${types}<p class="muted">${t("Aucun fait marquant pour l'instant.")}</p>` };
    const ev = evs.find((x) => x.id === flashSel) || evs[0];
    flashSel = ev.id;
    const d = flashData(state, ev);
    const pick = `<div class="row posts-news-bar"><select class="posts-news-sel" data-flashpick>${evs.map((x) => `<option value="${esc(x.id)}" ${x === ev ? 'selected' : ''}>${esc(t(FLASH_KINDS[x.kind].label))} · ${esc(x.title)}${x.lap ? ` · ${esc(t('tour {}', x.lap))}` : ''}</option>`).join('')}</select></div>`;
    return { d, caps: (dd) => moreCaptions(dd, sig), head: types + pick, record: { key: `flash:${folderOf(d)}`, kind: 'flash', title: `${ev.title} · ${d.gp}` } };
  }
  const d = postData(state);
  const warn = d.final ? '' : `<p class="posts-warn small">${icon('warning')} ${t('Séance pas terminée : résultats provisoires.')}</p>`;
  return { d, caps: (dd) => captions(dd, sig, { spoiler: !noSpoiler }), head: types + warn, record: { key: `session:${folderOf(d)}`, kind: 'session', title: `${d.label} · ${d.gp}` } };
}

// ---------- Posts de saison : programme, records, notes, duels, course tour par tour ----------
const jget = async (u, ms = 60000) => {
  const r = await fetch(u, { signal: AbortSignal.timeout(ms) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
};
const memo = new Map();
const cached = (k, fn, ttl = 10 * 60e3) => {
  const hit = memo.get(k);
  if (hit && Date.now() - hit.at < ttl) return hit.p;
  const p = fn().catch((err) => { memo.delete(k); throw err; });
  memo.set(k, { p, at: Date.now() });
  return p;
};
const liveColors = () => Object.fromEntries(Object.values(store.state?.DriverList || {}).filter((x) => x?.Tla && x.TeamColour).map((x) => [x.Tla, `#${String(x.TeamColour).replace('#', '')}`]));
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

async function seasonSource(sig) {
  const types = `<div class="row posts-news-bar"><span class="small muted">${t('Type de post')}</span>
    <div class="posts-seg" role="tablist">${SEASON_TYPES.map(([k, v]) => `<button class="posts-fmt ${k === seasonType ? 'active' : ''}" data-stype="${k}">${t(v)}</button>`).join('')}</div></div>`;
  const year = Number(String(store.state?.SessionInfo?.Path || '').slice(0, 4)) || new Date().getFullYear();
  let data;
  try { data = await cached(`season|${year}`, () => jget(`/api/season?year=${year}`)); } catch (err) { return { head: `${types}<p class="muted">${esc(err.message)}</p>` }; }
  const upcoming = ['raceweek', 'weekend', 'records'].includes(seasonType);
  const races = upcoming ? data.races : data.races.filter((r) => r.results.length);
  if (!races.length) return { head: `${types}<p class="muted">${t('Aucune manche disponible pour cette saison.')}</p>` };
  const def = upcoming ? (races.find((r) => Date.parse(r.date) > Date.now() - 12 * 3600e3) || races.at(-1)) : races.at(-1);
  const race = races.find((r) => r.round === roundSel) || def;
  roundSel = race.round;
  const head = `${types}<div class="row posts-news-bar"><select class="posts-news-sel" data-roundpick>${races.map((r) => `<option value="${r.round}" ${r === race ? 'selected' : ''}>${esc(t('Manche {}', r.round))} · ${esc(r.name)} · ${esc(shortDate(r.date))}</option>`).join('')}</select></div>`;
  const msg = (m, warn = false) => (warn ? `<p class="posts-warn small">${icon('warning')} ${esc(m)}</p>` : `<p class="small muted">${icon('info')} ${esc(m)}</p>`);
  const live = liveColors();
  const lapsOf = () => cached(`laps|${year}|${race.round}`, () => jget(`/api/social/laps?year=${year}&round=${race.round}`, 120000), 3600e3);
  let d;
  let extra = '';
  if (seasonType === 'raceweek') {
    // Tracé du circuit, météo, vainqueur de l'édition précédente
    const info = circuitInfo(race.circuitId);
    const [fc, track, before] = await Promise.all([
      Number.isFinite(race.lat) ? cached(`fc|${race.lat}|${race.lon}`, () => jget(`/api/social/forecast?lat=${race.lat}&lon=${race.lon}`, 40000)).catch(() => null) : null,
      info ? cached(`circuit|${info.key}|${year}`, () => jget(`/api/circuit?key=${info.key}&year=${year}`, 60000), 3600e3).catch(() => null) : null,
      cached(`season|${year - 1}`, () => jget(`/api/season?year=${year - 1}`), 3600e3).catch(() => null),
    ]);
    const prev = before?.races?.find((r) => (r.circuitId && r.circuitId === race.circuitId) || r.name === race.name)?.results?.[0] || null;
    d = raceWeekData(race, { year, rounds: data.races.length, tyres: builtinNomination(year, { name: race.name, location: race.locality, country: race.country }), forecast: fc?.days, track, prev });
    if (!track) extra = msg(t('Tracé du circuit indisponible pour ce Grand Prix : visuel sans le circuit.'));
  } else if (seasonType === 'weekend') {
    const tyres = builtinNomination(year, { name: race.name, location: race.locality, country: race.country });
    const fc = Number.isFinite(race.lat) ? await cached(`fc|${race.lat}|${race.lon}`, () => jget(`/api/social/forecast?lat=${race.lat}&lon=${race.lon}`, 40000)).catch(() => null) : null;
    d = weekendData(race, { year, tyres, forecast: fc?.days });
    if (!d.forecast.length) extra = msg(t('Météo prévue disponible environ 2 semaines avant le week-end.'));
  } else if (seasonType === 'records') {
    const rec = await cached(`rec|${year}|${race.round}`, () => jget(`/api/social/records?year=${year}&round=${race.round}`, 180000), 3600e3).catch((err) => ({ error: err.message }));
    if (rec.error) return { head: head + msg(rec.error, true) };
    d = recordsData(race, rec, { year, names: Object.fromEntries((data.drivers || []).map((x) => [x.code, x.name])) });
    if (!d.facts.length) return { head: head + msg(t('Pas encore de records connus pour ce circuit (archives de la F1 depuis 2018).')) };
  } else if (seasonType === 'ratings') {
    const laps = await lapsOf().catch(() => null);
    d = ratingsData(race, { year, laps, live });
    extra = msg(t(d.withPace ? 'Note sur 10 : résultat, rythme, places gagnées et duel avec le coéquipier.' : 'Tours de cette course indisponibles : notes calculées sans le rythme en course.'));
  } else if (seasonType === 'teamduels') {
    d = teamDuelsData(data, { year, upTo: race.round, live });
    extra = msg(t('Qui devance l\'autre en qualifs et en course, jusqu\'à la manche choisie.'));
  } else if (seasonType === 'title') {
    d = titleData(data, { year, upTo: race.round, live });
    extra = msg(t('Qui peut encore être champion après cette manche : points encore en jeu (courses et sprints restants), éliminés grisés.'));
  } else {
    // Tours et direction de course (safety car, VSC, drapeaux) pour la vidéo
    const [laps, rc] = await Promise.all([
      lapsOf().catch((err) => ({ error: err.message })),
      cached(`rc|${year}|${race.round}`, () => jget(`/api/social/racecontrol?year=${year}&round=${race.round}`, 60000), 3600e3).catch(() => null),
    ]);
    if (laps.error || !laps.total) return { head: head + msg(laps.error || t('Tours de cette course pas encore publiés.'), true) };
    d = raceLapsData(race, laps, { year, live, rcm: rc?.messages?.length ? rc.messages : null });
    const sec = Math.round(raceVideoTiming(d).duration);
    extra = `<div class="row posts-news-bar"><button class="btn small btn-accent" data-racevideo>${icon('video')} ${t('Créer la vidéo animée')}</button> ${musicSelect('race')}
      <button class="btn small" data-racevideosave disabled>${icon('save')} ${t('Enregistrer la vidéo')}</button><span class="small muted" data-rvst>${esc(t('Vidéo verticale (story, TikTok, Reels, Shorts) de {} s : le graphique des positions se dessine tour après tour, avec safety cars, drapeaux et moments forts.', sec))}</span></div>
      ${d.story.estimated ? msg(t('Direction de course indisponible : neutralisations estimées.')) : ''}
      <video class="posts-vid" data-rv controls playsinline hidden></video>`;
  }
  const label = SEASON_TYPES.find(([k]) => k === seasonType)[1];
  return { d, caps: (dd) => seasonCaptions(dd, sig), head: head + extra, record: { key: `${seasonType}:${year}-${race.round}`, kind: seasonType, title: `${t(label)} · ${d.gp}` } };
}

// Vidéo animée (format story) de la course ou d'une news (« Breaking news ») : enregistrée dans le navigateur
let raceVideo = null;
const raceVideoMaker = (d, o) => (d.post === 'racelaps' ? (opts) => makeAnimation((ctx, tt, w, h) => raceFrame(ctx, w, h, d, o, tt), raceVideoTiming(d).duration, { box: true, cover: (ctx) => videoCover(ctx, 1080, 1920, d, o), ...opts })
  : d.news ? (opts) => makeAnimation((ctx, tt, w, h) => newsFrame(ctx, w, h, d, o, tt), newsVideoTiming(d).duration, { box: true, cover: (ctx) => videoCover(ctx, 1080, 1920, d, o), ...opts }) : null);
async function buildRaceVideo(dlg, btn) {
  const make = curPost && raceVideoMaker(curPost.d, curPost.o);
  if (!make) return;
  const st = $('[data-rvst]', dlg);
  btn.disabled = true;
  try {
    const v = await make({ music: 'gen', track: $('[data-vtrack]', dlg)?.value, onProgress: (p) => { st.textContent = t('Enregistrement de la vidéo… {} %', Math.round(p * 100)); } });
    if (raceVideo?.url) URL.revokeObjectURL(raceVideo.url);
    raceVideo = { ...v, url: URL.createObjectURL(v.blob), folder: folderOf(curPost.d), name: curPost.d.news ? 'video-breaking-news' : 'video-course' };
    const el = $('[data-rv]', dlg);
    el.src = raceVideo.url; el.hidden = false;
    $('[data-racevideosave]', dlg).disabled = false;
    st.textContent = t('Vidéo prête ({} Mo)', (v.blob.size / 1e6).toFixed(1).replace('.', ','));
  } catch (err) { toast(err.message, 5000, 'warning'); } finally { btn.disabled = false; }
}
async function saveRaceVideo() {
  if (!raceVideo) return;
  const data = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.readAsDataURL(raceVideo.blob); });
  const r = await fetch('/api/posts/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: raceVideo.folder, name: raceVideo.name, data }) }).then((x) => x.json());
  if (r.error) throw new Error(r.error);
  toast(t('Vidéo enregistrée dans {}', r.dir), 4000, 'check');
}

// ---------- Grosses news de l'Actu ----------
let newsAll = false;   // toutes les actus des 48 dernières heures, pas seulement les grosses
let newsSel = null;
let newsSort = 'top';   // ordre des news : à la une ou plus récentes
let newsType = '';     // filtre par type de news ('' : toutes)
let newsCache = null;
const frCache = new Map();
const edits = new Map();   // id -> { title, summary } corrigés à la main
const breakingSet = new Map();   // id -> très grosse info cochée ou décochée à la main (vidéo Breaking news)

let histCache = null;
async function postHistory(force = false) {
  if (force || !histCache || Date.now() - histCache.at > 60e3) {
    const r = await fetch('/api/social/history').then((x) => x.json()).catch(() => ({}));
    histCache = { items: r.items || [], at: Date.now() };
  }
  return histCache.items;
}
const NET_NAMES = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', x: 'X', bluesky: 'Bluesky', tiktok: 'TikTok', youtube: 'YouTube' };

async function newsList() {
  if (!newsCache || Date.now() - newsCache.at > 60e3) {
    const r = await fetch('/api/news').then((x) => x.json());
    newsCache = { items: r.items || [], sources: r.sources || [], at: Date.now() };
  }
  return newsCache;
}

// Textes en français (traduction en ligne de l'appli, gardée en mémoire) ; null si indisponible
async function toFrench(list) {
  const todo = list.filter((x) => x.text && x.from !== 'fr' && !frCache.has(`${x.from}|${x.text}`));
  if (todo.length) {
    const res = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'fr', items: todo.map((x) => ({ text: x.text, from: x.from })) }) })
      .then((r) => r.json()).catch(() => ({}));
    todo.forEach((x, i) => { if (res.out?.[i]) frCache.set(`${x.from}|${x.text}`, res.out[i]); });
  }
  return list.map((x) => (!x.text || x.from === 'fr' ? x.text : frCache.get(`${x.from}|${x.text}`) ?? null));
}

const ago = (ts) => { const m = Math.round((Date.now() - ts) / 60e3); return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`; };

async function newsSource(sig) {
  const data = await newsList();
  // Titres traduits en français d'abord : le même article publié en plusieurs langues est réuni
  await toFrench(bigNews(data.items, { all: newsAll }).slice(0, 60).map((it) => ({ text: it.title, from: it.lang })));
  const big = bigNews(data.items, { all: newsAll, frTitle: (it) => (it.lang === 'fr' ? it.title : frCache.get(`${it.lang}|${it.title}`)) });
  const history = await postHistory();
  const postedOf = new Map(big.map((it) => [it, postedEntry(it, history)]));
  // Tri (à la une ou récentes), filtre par type, news déjà publiées en dernier
  const kinds = newsKinds(big);
  if (newsType && !kinds.some((k) => k.key === newsType)) newsType = '';
  const list = sortNews(big.filter((it) => !newsType || newsKind(it).key === newsType), { by: newsSort, done: (it) => postedOf.get(it) }).slice(0, 40);
  const titles = await toFrench(list.map((it) => ({ text: it.title, from: it.lang })));
  const posted = list.map((it) => postedOf.get(it));
  const bar = (sel) => `<div class="row posts-news-bar">
      <select class="posts-news-sel" data-newspick>${list.map((it, i) => `<option value="${esc(it.id)}" ${it === sel ? 'selected' : ''}>${posted[i] ? `✓ ${esc(t('Publiée'))} · ` : ''}${isBreaking(it) ? 'BREAKING · ' : ''}${esc(newsKind(it).label)} · ${esc(titles[i] || it.title)} — ${esc(data.sources.find((s) => s.id === it.src)?.name || it.src)}, ${ago(it.t)}</option>`).join('')}</select>
      <select class="small" data-newssort title="${t('Ordre des news')}"><option value="top" ${newsSort === 'top' ? 'selected' : ''}>${t('À la une')}</option><option value="recent" ${newsSort === 'recent' ? 'selected' : ''}>${t('Plus récentes')}</option></select>
      ${kinds.length > 1 ? `<select class="small" data-newstype title="${t('Type de news')}"><option value="">${t('Tous les types')} (${big.length})</option>${kinds.map((k) => `<option value="${k.key}" ${newsType === k.key ? 'selected' : ''}>${esc(t(k.label))} (${k.n})</option>`).join('')}</select>` : ''}
      <label class="toggle small"><input type="checkbox" data-newsall ${newsAll ? 'checked' : ''}> ${t('Toutes les actus')}</label>
      <label class="toggle small" title="${t('Carrousel des 5 grosses news des 7 derniers jours')}"><input type="checkbox" data-recap ${recapMode ? 'checked' : ''}> ${t('Récap de la semaine')}</label>
      ${sel?.link ? `<a class="btn small" href="${esc(sel.link)}" target="_blank" rel="noopener">${icon('external')} ${t("Lire l'article")}</a>` : ''}</div>`;
  if (recapMode) return recapSource(sig, data, bar);
  if (!list.length) return { head: `${bar(null)}<p class="muted">${t('Aucune grosse news en 48 h : cochez « Toutes les actus ».')}</p>` };
  const it = list.find((x) => x.id === newsSel) || list[0];
  newsSel = it.id;
  const [title, summary] = edits.get(it.id) ? [edits.get(it.id).title, edits.get(it.id).summary]
    : await toFrench([{ text: it.title, from: it.lang }, { text: it.summary, from: it.lang }]);
  const points = edits.get(it.id)?.points ?? '';
  const failed = title === null || summary === null;
  const d = newsPost(it, { title: title ?? it.title, summary: summary ?? it.summary, points, driverList: store.state?.DriverList || {}, sourceName: data.sources.find((s) => s.id === it.src)?.name || it.src });
  if (breakingSet.has(it.id)) d.breaking = breakingSet.get(it.id);
  const done = posted[list.indexOf(it)];
  const head = `${bar(it)}
    ${done ? `<p class="posts-warn small">${icon('check')} ${esc(t('Déjà publiée le {} sur {}', new Date(done.at).toLocaleString(), Object.keys(done.nets).map((n) => NET_NAMES[n] || n).join(', ')))}</p>` : ''}
    <div class="posts-news-edit">
      <label class="small muted">${t('Titre')}<input type="text" data-ntitle maxlength="160" value="${esc(d.title)}"></label>
      <label class="small muted">${t('Résumé')}<textarea data-nsum rows="3" maxlength="400">${esc(d.summary)}</textarea></label>
      <label class="small muted">${t('Points clés, un par ligne (images suivantes du carrousel)')}<textarea data-npoints rows="4" maxlength="1600" placeholder="${t('Facultatif : cliquez sur « Résumé détaillé » ou écrivez-les vous-même')}">${esc(points)}</textarea></label>
      <div class="row">${it.link ? `<button class="btn small" data-nsummary title="${t("Résumé en 3 à 5 points par l'IA : relisez avant de publier")}">${icon('doc')} ${t('Résumé détaillé')}</button>` : ''}<span class="small muted" data-nsumst></span></div>
      <label class="toggle small" title="${t("Lien de l'article en premier commentaire (Facebook, Threads, X)")}"><input type="checkbox" data-linkcomment ${linkComment ? 'checked' : ''}> ${t("Lien de l'article en premier commentaire")}</label>
      <label class="toggle small" title="${t('Visuel et vidéo « Breaking news »')}"><input type="checkbox" data-breaking ${d.breaking ? 'checked' : ''}> ${t('Très grosse info')}</label>
      <div class="row"><button class="btn small btn-accent" data-racevideo>${icon('video')} ${d.breaking ? t('Créer la vidéo Breaking news') : t('Créer la vidéo')}</button> ${musicSelect('news')}
        <button class="btn small" data-racevideosave disabled>${icon('save')} ${t('Enregistrer la vidéo')}</button><span class="small muted" data-rvst>${esc(t('Vidéo verticale avec musique : titre, résumé et points clés.'))}</span></div>
      <video class="posts-vid" data-rv controls playsinline hidden></video>
      <p class="small muted">${icon('info')} ${t(failed ? 'Traduction indisponible : textes en version originale, à traduire à la main.' : "Titre et résumé traduits automatiquement : relisez-les. La source est citée.")}</p>
    </div>`;
  const record = { key: `news:${it.id}`, kind: 'news', title: d.title, srcTitle: it.title, link: it.link || '', summary: String(it.summary || '').slice(0, 300) };
  return { d, caps: (dd) => newsCaptions(dd, sig, { linkInComment: linkComment }), head, record };
}
// ---------- Post écrit à la main (comme « Écrire un post » de la page web) ----------
// Texte libre, mise en forme par l'IA du serveur, photo ; pilotes et écuries reconnus dans le texte.
const blankManual = () => ({ id: `m${Date.now().toString(36)}`, raw: '', title: '', summary: '', points: '', kind: '', source: '', image: null, breaking: false });
let manual = blankManual();
function manualPost(sig) {
  const m = manual;
  const title = m.title.trim() || t('Votre titre ici');
  const d = newsPost({ id: m.id, cat: 'official', t: Date.now(), link: '', title, summary: m.summary, tags: newsTags(`${m.title} ${m.summary} ${m.points}`) },
    { title, summary: m.summary, points: m.points, driverList: store.state?.DriverList || {}, sourceName: m.source.trim() });
  if (m.kind) d.badge = NEWS_BADGES.find((b) => b.key === m.kind) || d.badge;
  if (m.image) d.image = m.image;
  d.breaking = m.breaking;
  return { d, caps: (dd) => newsCaptions(dd, sig), record: { key: `manual:${m.id}`, kind: 'manual', title: d.title } };
}
function manualSource(sig) {
  const m = manual;
  const { d, caps, record } = manualPost(sig);
  const head = `<div class="posts-news-edit">
      <label class="small muted">${t('Votre texte (l’info en vrac, vos notes, un brouillon)')}<textarea data-m="raw" rows="4" maxlength="4000" placeholder="${t('Ex. : Norris prolonge chez McLaren jusqu’en 2030, annonce faite ce matin avant le GP des États-Unis…')}">${esc(m.raw)}</textarea></label>
      <div class="row"><button class="btn small" data-mai>${icon('bolt')} ${t('Mettre en forme avec l’IA')}</button><span class="small muted" data-maist>${t('Titre, résumé et points clés rédigés à partir de votre texte.')}</span></div>
      <label class="small muted">${t('Titre')}<input type="text" data-m="title" maxlength="120" value="${esc(m.title)}" placeholder="${t('Le titre du visuel')}"></label>
      <label class="small muted">${t('Résumé')}<textarea data-m="summary" rows="3" maxlength="320">${esc(m.summary)}</textarea></label>
      <label class="small muted">${t('Points clés, un par ligne (images suivantes du carrousel)')}<textarea data-m="points" rows="4" maxlength="1600" placeholder="${t('Facultatif')}">${esc(m.points)}</textarea></label>
      <div class="posts-m2">
        <label class="small muted">${t('Type d’info')} <select data-mkind><option value="">${t('Deviné d’après le texte')}</option>${NEWS_BADGES.map((b) => `<option value="${b.key}" ${m.kind === b.key ? 'selected' : ''}>${esc(t(b.label.charAt(0) + b.label.slice(1).toLowerCase()))}</option>`).join('')}</select></label>
        <label class="small muted">${t('Source (facultatif)')} <input type="text" data-m="source" maxlength="60" value="${esc(m.source)}" placeholder="${t('Ex. : communiqué de McLaren')}"></label>
      </div>
      <div class="row"><label class="btn small">${icon('plus')} ${t('Choisir une photo')}<input type="file" data-mimg accept="image/*" hidden></label>
        ${m.image ? `<button class="btn small" data-mimgdel>${icon('close')} ${t('Retirer la photo')}</button>` : `<span class="small muted">${t('Facultatif : remplace les portraits des pilotes')}</span>`}
        <span class="spacer"></span><button class="btn small" data-mnew title="${t('Vider le formulaire pour écrire un autre post')}">${icon('plus')} ${t('Nouveau post')}</button></div>
      <label class="toggle small" title="${t('Visuel et vidéo « Breaking news »')}"><input type="checkbox" data-mbreaking ${m.breaking ? 'checked' : ''}> ${t('Très grosse info')}</label>
      <div class="row"><button class="btn small btn-accent" data-racevideo>${icon('video')} ${m.breaking ? t('Créer la vidéo Breaking news') : t('Créer la vidéo')}</button> ${musicSelect('news')}
        <button class="btn small" data-racevideosave disabled>${icon('save')} ${t('Enregistrer la vidéo')}</button><span class="small muted" data-rvst>${esc(t('Vidéo verticale avec musique : titre, résumé et points clés.'))}</span></div>
      <video class="posts-vid" data-rv controls playsinline hidden></video>
      <p class="small muted">${icon('info')} ${t('Pilotes et écuries reconnus dans le texte : portraits et couleurs suivent.')}</p>
    </div>`;
  return { d, caps, head, record };
}
async function manualRewrite(dlg, btn) {
  const text = (manual.raw.trim() || `${manual.title}\n${manual.summary}\n${manual.points}`).trim();
  const st = $('[data-maist]', dlg);
  if (text.length < 20) { st.textContent = t('Écrivez d’abord quelques phrases dans « Votre texte ».'); return; }
  btn.disabled = true;
  st.textContent = t('Mise en forme…');
  try {
    const r = await fetch('/api/social/rewrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.title) throw new Error(j.error ? t(j.error) : t('Mise en forme indisponible pour le moment'));
    Object.assign(manual, { title: j.title, summary: j.summary || '', points: (j.points || []).join('\n') });
    render(dlg);
    toast(t('Rédigé par l’IA à partir de votre texte : relisez et corrigez avant de publier.'), 4000, 'check');
  } catch (err) { st.textContent = err.message; } finally { btn.disabled = false; }
}

// Récap de la semaine : les 5 plus grosses news des 7 derniers jours (une par sujet)
async function recapSource(sig, data, bar) {
  const f1 = (l) => l.filter((it) => !OTHER_SERIES.test(`${it.title} ${it.summary || ''}`));
  let list = f1(bigNews(data.items, { hours: 7 * 24 })).slice(0, 5);
  if (list.length < 3) list = f1(bigNews(data.items, { hours: 7 * 24, all: true })).slice(0, 5);
  if (!list.length) return { head: `${bar(null)}<p class="muted">${t("Pas assez d'actus ces 7 derniers jours.")}</p>` };
  const fr = await toFrench(list.flatMap((it) => [{ text: it.title, from: it.lang }, { text: it.summary, from: it.lang }]));
  const posts = list.map((it, i) => newsPost(it, { title: fr[2 * i] ?? it.title, summary: fr[2 * i + 1] ?? it.summary, driverList: store.state?.DriverList || {}, sourceName: data.sources.find((s) => s.id === it.src)?.name || it.src }));
  const d = recapData(posts);
  const head = `${bar(null)}<p class="small muted">${icon('info')} ${t('Titres et résumés traduits automatiquement : relisez les visuels avant de publier.')}</p>`;
  return { d, caps: (dd) => seasonCaptions(dd, sig), head, record: { key: `recap:${d.date}`, kind: 'recap', title: `${t('La semaine en F1')} · ${d.date}` } };
}
const fileOf = (i, slide) => `${FORMATS[fmt].name}-${i + 1}-${slide}`;

async function saveImages(d, canvases) {
  const folder = folderOf(d);
  let dir = '';
  for (const [i, c] of canvases.entries()) {
    const data = c.toDataURL('image/png').split(',')[1];
    const res = await fetch('/api/posts/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder, name: fileOf(i, c.dataset.slide), data }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
    dir = j.dir;
  }
  return { folder, dir };
}

// Pages officielles pour écrire un post, préremplies (gratuit, sans clés d'accès). Seulement pour
// les réseaux sans publication automatique (compte non connecté dans « Publier sur mes réseaux »).
const INTENTS = {
  x: { name: 'X', url: 'https://x.com/intent/post?text=', acc: 'x' },
  threads: { name: 'Threads', url: 'https://www.threads.com/intent/post?text=', acc: 'threads' },
  bsky: { name: 'Bluesky', url: 'https://bsky.app/intent/compose?text=', acc: 'bluesky' },
};
let accounts = {};   // comptes connectés (/api/social/accounts), relus à chaque ouverture
const freeIntents = () => Object.entries(INTENTS).filter(([, v]) => !accounts[v.acc]?.connected);

async function copyImage(canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

// ---------- Brouillons (gardés par la page web, partagés avec le Studio) ----------
let curDraft = null;   // brouillon repris : { id, title, kind, key, d, edited… }
const draftApi = async (path, body) => {
  const r = await fetch(`/api/social/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || t('Brouillons indisponibles'));
  return j;
};
function draftSource(sig) {
  const dr = curDraft;
  return { d: dr.d, caps: (dd) => captionsFor(dd, sig, { spoiler: !noSpoiler, linkInComment: linkComment }), record: { key: dr.key || `draft:${dr.id}`, kind: dr.kind, title: dr.title } };
}
async function draftsList(dlg, body) {
  let items;
  try { items = (await draftApi('drafts')).items || []; } catch (err) { body.innerHTML = `<p class="muted">${esc(err.message)}</p>`; return; }
  body.innerHTML = items.length ? `<div class="posts-drafts">${items.map((x) => `<div class="row posts-draft" data-draft-id="${esc(x.id)}">
      <button class="btn" data-draftopen>${icon('note')} <b data-no-i18n>${esc(x.title)}</b></button>
      <span class="small muted">${new Date(x.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span><span class="spacer"></span>
      <button class="icon-btn" data-draftdel title="${t('Supprimer le brouillon')}">${icon('trash')}</button></div>`).join('')}</div>`
    : `<p class="muted">${t('Aucun brouillon. « Brouillon » garde le post affiché pour plus tard, ici et dans le Studio.')}</p>`;
}
async function openDraft(dlg, id) {
  const dr = await draftApi(`draft?id=${encodeURIComponent(id)}`);
  curDraft = { ...dr, d: await unpackDraftImages(dr.d) };
  const o = dr.opts || {};
  follow = o.follow ?? follow; withQuestion = o.question ?? withQuestion; withPhotos = o.photos ?? withPhotos;
  noSpoiler = o.noSpoiler ?? noSpoiler; linkComment = o.linkComment ?? linkComment;
  fmt = dr.fmt === 'link' ? 'ig' : dr.fmt;
  skipSlides = { key: dr.key || `draft:${dr.id}`, set: new Set(dr.skip) };
  mode = 'draft';
  dlg.syncPosts();
  render(dlg);
}

let renderId = 0;
const renderNewsOnly = (dlg) => render(dlg, true);
async function render(dlg, keepHead = false) {
  const id = ++renderId;
  dlg.dataset.ready = '';
  dlg.publish = null;
  dlg.saveDraft = null;
  const sig = storageGet(SIG_KEY, '@BenjyPaddock');
  const body = $('.posts-body', dlg);
  let d; let caps; let head = ''; let record = null;
  if (mode === 'drafts') { await draftsList(dlg, body); return; }
  if (mode === 'stats') { await statsPage(dlg, body); return; }
  if (mode === 'draft') {
    ({ d, caps, record } = draftSource(sig));
  } else if (mode === 'news') {
    let r;
    try { r = await newsSource(sig); } catch (err) { r = { head: `<p class="muted">${esc(err.message)}</p>` }; }
    if (id !== renderId) return;
    if (!r.d) { body.innerHTML = r.head; return; }
    ({ d, caps, head, record } = r);
  } else if (mode === 'manual') {
    ({ d, caps, head, record } = manualSource(sig));
  } else if (mode === 'season') {
    let r;
    try { r = await seasonSource(sig); } catch (err) { r = { head: `<p class="muted">${esc(err.message)}</p>` }; }
    if (id !== renderId) return;
    if (!r.d) { body.innerHTML = r.head; return; }
    ({ d, caps, head, record } = r);
  } else {
    const r = await sessionSource(sig);
    if (id !== renderId) return;
    if (!r.d) { body.innerHTML = r.head; return; }
    ({ d, caps, head, record } = r);
  }
  const slides = slidesFor(d, { fmt, follow, question: withQuestion });
  // Images écartées : propres à chaque post (remises à zéro quand on en change)
  const postKey = record?.key || `${mode}|${d.gp}|${d.post || d.kind || ''}|${d.title || ''}`;
  if (skipSlides.key !== postKey) skipSlides = { key: postKey, set: new Set() };
  const skip = skipSlides.set;
  const chosenOf = (list) => chosenSlides(list, [...skip]);
  // Textes sans ce que montraient les images écartées (question et abonnement compris)
  const capsOf = caps;
  const textsOf = () => {
    let c = capsOf(keptData(d, skip, fmt));
    if (withQuestion && !skip.has('question')) c = questionCaptions(c, d, sig);
    if (follow && !skip.has('abonnement')) c = followCaptions(c, d, sig);
    // Mention « Fait par IA avec l'appli », sauf pour les posts écrits à la main ; textes retouchés d'un brouillon
    if (mode === 'draft') return { ...(curDraft.kind === 'manual' ? c : creditCaptions(c)), ...curDraft.edited };
    return mode === 'manual' ? c : creditCaptions(c);
  };
  caps = textsOf();
  if (!slides.length || (!d.rows?.length && !d.post && !d.news)) { body.innerHTML = `${mode !== 'news' ? head : ''}<p class="muted">${t('Pas encore de classement pour cette séance : lancez un live ou un replay.')}</p>`; return; }
  const main = `<p class="small muted">${icon('info')} ${t('Décochez les images à laisser de côté.')}</p>
    <div class="posts-grid">${slides.map((s, i) => `<figure class="posts-item" data-fig="${i}"><canvas data-slide="${s}" title="${t('Cliquer pour voir en grand')}"></canvas>
      <figcaption><span><label class="posts-pick"><input type="checkbox" data-pick="${s}" ${skip.has(s) ? '' : 'checked'}> <b data-num></b> ${esc(t(slideName(s)))}</label></span>
        <button class="btn small" data-copy="${i}" title="${t('Copier l\'image, à coller dans le réseau social')}">${icon('doc')} ${t('Copier')}</button>
        <button class="btn small" data-save="${i}">${icon('save')} ${t('Enregistrer')}</button></figcaption></figure>`).join('')}</div>
    <div class="posts-caps">
      ${fmt === 'story' ? '' : `<label class="small muted">${fmt === 'x' ? t('Texte pour X / Threads / Bluesky') : t('Légende Instagram / Facebook')}</label>
      <textarea class="posts-cap" rows="${fmt === 'x' ? 4 : 12}" data-no-i18n>${esc(fmt === 'x' ? caps.x : caps.instagram)}</textarea>
      <div class="row"><button class="btn small" data-cap>${icon('doc')} ${t('Copier le texte')}</button>${fmt === 'x' ? `<span class="small muted" data-count></span><span class="spacer"></span>
        ${freeIntents().length ? `<span class="small muted">${t('Publier gratuitement :')}</span>` : ''}${freeIntents().map(([k, v]) => `<button class="btn small btn-accent" data-intent="${k}" title="${t("Ouvre la page de {} pour écrire un post, avec ce texte, et copie la première image : collez-la puis publiez. Gratuit, sans clés d'accès.", v.name)}">${icon('external')} ${v.name}</button>`).join('')}` : ''}</div>
      ${fmt === 'x' && caps.comment ? `<div class="row small"><span class="muted">${t('Premier commentaire :')}</span> <span data-no-i18n>${esc(caps.comment)}</span><button class="btn small" data-copycomment>${icon('doc')} ${t('Copier')}</button></div>` : ''}
      ${fmt === 'x' ? `<p class="small muted posts-xhelp" hidden>${icon('info')} ${t("Collez l'image (Ctrl+V, Cmd+V sur Mac), puis publiez.")}</p>` : ''}`}
    </div>`;
  // Titre ou résumé d'une news en cours de saisie : seuls les visuels et les textes sont redessinés
  if (keepHead && $('.posts-main', body)) $('.posts-main', body).innerHTML = main;
  else body.innerHTML = `<div class="posts-head">${head}</div><div class="posts-main">${main}</div>`;
  const o = { ...(await assets(d)), signature: sig };
  if (id !== renderId) return;   // format ou réglage changé entre-temps
  curPost = { d, o };
  // Publication : visuels de n'importe quel format, dessinés à part
  // Publication : images gardées, de n'importe quel format, dessinées à part
  // Chaque visuel avec son texte alternatif (data-alt), envoyé aux réseaux avec l'image
  const drawChosen = (f) => {
    const list = chosenOf(slidesFor(d, { fmt: f, follow, question: withQuestion }));
    return list.map((sl) => { const c = drawSlide(document.createElement('canvas'), sl, f, d, { ...o, slides: list }); c.dataset.alt = slideAlt(d, sl); return c; });
  };
  // Brouillon publié : effacé
  const posted = () => { histCache = null; if (mode === 'news') render(dlg); if (mode === 'draft') draftApi('drafts/remove', { id: curDraft.id }).catch(() => {}); };
  dlg.publish = () => openPublish({ d, caps, folder: folderOf(d), record, onPosted: posted, render: async (f) => drawChosen(f), videoMaker: raceVideoMaker(d, o) });
  // Brouillon : de quoi refaire le post (ici ou dans le Studio) ; texte de la case gardé s'il a été retouché
  dlg.saveDraft = async () => {
    const area = $('.posts-cap', body);
    const k = fmt === 'x' ? 'x' : 'instagram';
    const edited = { ...(mode === 'draft' ? curDraft.edited : {}) };
    if (area && area.value !== caps[k]) edited[k] = area.value;
    const dr = { id: mode === 'draft' ? curDraft.id : crypto.randomUUID(), title: record?.title || d.title || d.gp || 'Post', kind: record?.kind || mode, key: record?.key || '', at: Date.now(),
      d: packDraftImages(d), fmt, skip: [...skip], edited, opts: { follow, question: withQuestion, photos: withPhotos, noSpoiler, linkComment } };
    await draftApi('drafts', dr);
    if (mode === 'draft') curDraft = { ...curDraft, ...dr, d };
    toast(t('Brouillon enregistré'), 2500);
  };
  const allCanvases = [...body.querySelectorAll('canvas')];
  let canvases = [];
  // Images gardées : redessinées (sommaire, points, numéros) ; écartées : grisées, sans numéro
  const paint = () => {
    const list = chosenOf(slides);
    canvases = allCanvases.filter((c) => list.includes(c.dataset.slide));
    for (const c of allCanvases) {
      const on = list.includes(c.dataset.slide);
      drawSlide(c, c.dataset.slide, fmt, d, { ...o, slides: list });
      const fig = c.closest('.posts-item');
      fig.classList.toggle('off', !on);
      $('[data-num]', fig).textContent = on ? `${list.indexOf(c.dataset.slide) + 1}.` : '—';
    }
  };
  paint();
  body.querySelectorAll('[data-pick]').forEach((cb) => {
    cb.onchange = () => {
      if (cb.checked) skip.delete(cb.dataset.pick); else skip.add(cb.dataset.pick);
      // Une image au moins reste publiée
      if (!chosenOf(slides).some((s) => !skip.has(s))) { skip.delete(cb.dataset.pick); cb.checked = true; toast(t('Gardez au moins une image'), 2500, 'warning'); }
      paint();
      // Texte affiché mis à jour, sauf s'il a été retouché à la main
      const prev = caps;
      caps = textsOf();
      const k = fmt === 'x' ? 'x' : 'instagram';
      if (area && area.value === prev[k]) { area.value = caps[k]; upd(); }
    };
  });
  const count = $('[data-count]', body);
  const area = $('.posts-cap', body);
  const upd = () => { if (count) count.textContent = t('{} / 280 caractères', xLength(area.value)); };
  area?.addEventListener('input', upd); upd();
  // Liens remplacés d'office par leur lien court suivi (Studio activé ; la lettre du réseau est remise à
  // celle du réseau au moment de publier), dans la case et le premier commentaire
  const short = (net, text) => (/https?:\/\//.test(text || '') ? fetch('/api/social/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ net, text }) }).then((r) => r.json()).then((j) => j?.text || text).catch(() => text) : Promise.resolve(text));
  if (area) { const raw = area.value; short(fmt === 'x' ? 'x' : 'facebook', raw).then((v) => { if (v !== raw && area.isConnected && area.value === raw) { area.value = v; upd(); } }); }
  const note = $('[data-copycomment]', body)?.previousElementSibling;
  if (note) short('x', caps.comment).then((v) => { if (note.isConnected) note.textContent = v; caps.comment = v; });
  body.onclick = async (e) => {
    // Image cliquée : vue en grand (toutes les images du post, flèches pour passer de l'une à l'autre)
    const cv = e.target.closest('.posts-item canvas');
    if (cv) {
      openImageViewer(allCanvases.map((c) => ({ canvas: c, label: t(slideName(c.dataset.slide)), off: !canvases.includes(c) })), allCanvases.indexOf(cv), { t });
      return;
    }
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.copy !== undefined) { await copyImage(allCanvases[Number(b.dataset.copy)]); toast(t('Image copiée'), 2000, 'check'); }
      if (b.dataset.save !== undefined) { const r = await saveImages(d, [allCanvases[Number(b.dataset.save)]]); toast(t('Image enregistrée dans {}', r.dir), 4000, 'check'); }
      if (b.dataset.cap !== undefined) { await navigator.clipboard.writeText(await short(fmt === 'x' ? 'x' : 'facebook', area.value)); toast(t('Texte copié'), 2000, 'check'); }
      if (b.dataset.copycomment !== undefined) {
        // Lien suivi (clics comptés dans les statistiques du Studio), sinon tel quel
        await navigator.clipboard.writeText(await short('x', caps.comment));
        toast(t('Commentaire copié : publiez-le en réponse à votre post'), 3500, 'check');
      }
      // Publication sans accès payant : page officielle du réseau préremplie, première image copiée
      const net = INTENTS[b.dataset.intent];
      if (net) {
        await copyImage(canvases[0]).catch(() => {});
        // Liens suivis (clics comptés dans les statistiques du Studio), sinon texte tel quel
        const tracked = await fetch('/api/social/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ net: net.acc, text: area.value }) }).then((r) => r.json()).catch(() => null);
        window.open(net.url + encodeURIComponent(tracked?.text || area.value), `paddock-${b.dataset.intent}-compose`, 'width=720,height=780');
        $('.posts-xhelp', body).hidden = false;
        toast(t('Image 1 copiée : collez-la dans {} (Ctrl+V)', net.name), 4000, 'check');
      }
    } catch (err) { toast(err.message, 5000, 'warning'); }
  };
  dlg.onSaveAll = async () => {
    const r = await saveImages(d, canvases);
    dlg.dataset.folder = r.folder;
    toast(t('{} images enregistrées dans {}', canvases.length, r.dir), 5000, 'check');
    $('[data-open]', dlg).hidden = false;
  };
  dlg.dataset.ready = '1';
}

// ---------- Statistiques (comme l'onglet Stats du Studio : comptes, posts, liens) ----------
const fmtN = (v) => (v == null ? '—' : Number(v).toLocaleString());
const STAT_LABELS = [['views', 'Vues'], ['reach', 'Portée'], ['likes', "J'aime"], ['comments', 'Comm.'], ['shares', 'Partages'], ['saves', 'Enreg.']];
// Libellé au singulier pour 1 (« 1 abonné », « 1 nouvel abonné »)
const SINGULAR = { 'nouveaux abonnés': 'nouvel abonné', vues: 'vue', 'vues au total': 'vue au total', 'comptes touchés': 'compte touché', 'visites du profil': 'visite du profil',
  'comptes engagés': 'compte engagé', interactions: 'interaction', partages: 'partage', publications: 'publication', abonnés: 'abonné' };
const one = (n, l) => t((n === 1 && SINGULAR[l]) || l);
const ACC_LABELS = [['newFollowers', 'nouveaux abonnés'], ['views', 'vues'], ['totalViews', 'vues au total'], ['reach', 'comptes touchés'], ['profileViews', 'visites du profil'],
  ['engaged', 'comptes engagés'], ['interactions', 'interactions'], ['likes', "j'aime"], ['comments', 'comm.'], ['shares', 'partages'], ['posts', 'publications']];
const metricsOf = (s, labels, word) => labels.filter(([k]) => s[k]).map(([k, l]) => `<span class="pst-metric"><b>${fmtN(s[k])}</b>${word(s[k], l)}</span>`).join('');
const netLink = (n, url) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(NET_NAMES[n] || n)}</a>` : esc(NET_NAMES[n] || n));
const accountsHtml = (accounts) => `<h4 class="pst-section">${t('Mes comptes')} <small>${t('activité des 28 derniers jours')}</small></h4>
  <div class="pst-accs">${accounts.map((a) => {
    const nets = Object.entries(a.nets);
    const live = nets.filter(([, x]) => x.stats), off = nets.filter(([, x]) => !x.stats);
    const total = live.reduce((n, [, x]) => n + (x.stats.followers || 0), 0);
    return `<div class="pst-card"><div class="pst-acc-head"><b>${esc(a.name)}</b><span class="pst-acc-total"><b>${fmtN(total)}</b>${one(total, 'abonnés')}</span></div>
      ${live.map(([n, x]) => `<div class="pst-acc-net"><span class="pst-net">${netLink(n, x.url)}</span><span class="pst-acc-f"><b>${fmtN(x.stats.followers)}</b>${one(x.stats.followers, 'abonnés')}</span>
        <div class="pst-metrics">${metricsOf(x.stats, ACC_LABELS, one) || `<span>${t('aucune activité')}</span>`}</div></div>`).join('')}
      ${off.length ? `<div class="pst-acc-off">${off.map(([n, x]) => `<span>${netLink(n, x.url)} · ${esc(t(x.note || x.error || 'indisponible'))}</span>`).join('')}</div>` : ''}</div>`;
  }).join('')}</div>`;
const postHtml = (p) => `<div class="pst-card"><div class="pst-top"><time>${esc(new Date(p.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</time><span class="spacer"></span>
    <button class="icon-btn" data-statsremove="${esc(p.key)}" title="${t('Post supprimé sur les réseaux : le retirer des statistiques')}">${icon('close')}</button></div>
  <div class="pst-t" data-no-i18n>${esc(p.title || t('Post'))}</div>
  ${Object.entries(p.nets).map(([n, x]) => {
    const s = p.stats?.[n];
    const vals = s && !s.error && !s.note ? metricsOf(s, STAT_LABELS, (v, l) => t(l)) || `<span>${t("pas encore d'interaction")}</span>`
      : `<span>${s?.note ? esc(t(s.note)) : `${t('statistiques indisponibles')}${s?.error ? ` (${esc(s.error)})` : ''}`}</span>`;
    return `<div class="pst-net-stats"><span class="pst-net">${netLink(n, x.url)}</span><div class="pst-metrics">${vals}</div></div>`;
  }).join('')}</div>`;
// Clics sur les liens suivis des posts et téléchargements de l'appli (30 jours)
const OS_LABELS = { windows: 'Windows', 'windows-portable': 'Windows portable', 'mac-arm': 'Mac Apple', 'mac-intel': 'Mac Intel', linux: 'Linux', 'linux-arm': 'Linux ARM', deb: 'Paquet .deb' };
const linkName = (l) => l.title || (() => { try { const u = new URL(l.url); return `${u.hostname.replace(/^www\./, '')}${u.pathname.length > 1 ? u.pathname.slice(0, 40) : ''}`; } catch { return l.url || t('Lien'); } })();
const clickHtml = (l) => {
  const dl = l.id === 'download';
  const parts = l.id.includes('/') ? [] : Object.entries(l.nets).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<span class="pst-metric"><b>${fmtN(v)}</b>${esc(dl ? OS_LABELS[n] || n : NET_NAMES[n] || n)}</span>`);
  const dev = [['mobile', 'téléphone'], ['desktop', 'ordinateur']].filter(([k]) => l.devices[k]).map(([k, v]) => `<span class="pst-metric"><b>${fmtN(l.devices[k])}</b>${t(v)}</span>`);
  const top = Object.entries(l.countries).filter(([k]) => k !== '?').sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(' · ');
  return `<div class="pst-card"><div class="pst-top"><b class="spacer" data-no-i18n>${esc(dl ? t("Téléchargements de l'appli") : linkName(l))}</b><span class="pst-metric"><b>${fmtN(l.total)}</b>${dl ? t('téléch.') : t(l.total > 1 ? 'clics' : 'clic')}</span></div>
    <div class="pst-metrics">${parts.join('')}${dev.join('')}${top ? `<span>${esc(top)}</span>` : ''}</div></div>`;
};
const SHORT_NETS = ['instagram', 'facebook', 'threads', 'x', 'bluesky', 'tiktok', 'youtube'];
const STATS_SUBS = [['accounts', 'Comptes'], ['posts', 'Posts'], ['links', 'Liens']];
let statsSub = 'accounts';
let statsCache = null;   // { at, r } : relus au plus toutes les 2 minutes (sauf « Actualiser »)
async function statsPage(dlg, body, force = false) {
  const fresh = statsCache && Date.now() - statsCache.at < 2 * 60e3 && !force;
  if (statsCache) drawStats(dlg, body, statsCache.r, !fresh);
  else body.innerHTML = `<p class="muted">${t('Lecture des statistiques…')}</p>`;
  if (fresh) return;
  try {
    const res = await fetch('/api/social/stats');
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || `Erreur ${res.status}`);
    statsCache = { at: Date.now(), r };
    if (mode === 'stats' && body.isConnected) drawStats(dlg, body, r, false);
  } catch (err) {
    if (statsCache) toast(t('Actualisation impossible : {}', err.message), 4000, 'warning');
    else body.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}
function drawStats(dlg, body, r, stale) {
  const f = Object.entries(r.followers || {});
  const typed = ['[data-shorturl]', '[data-shortname]', '[data-shortnet]'].map((s) => $(s, body)?.value);
  const shortOut = $('[data-shortout]', body)?.innerHTML || '';
  const posts = r.posts || [];
  body.innerHTML = `<div class="pst">
    <div class="pst-bar"><div class="pst-seg">${STATS_SUBS.map(([k, v]) => `<button data-ssub="${k}" class="${statsSub === k ? 'on' : ''}">${t(v)}</button>`).join('')}</div>
      <button class="btn" data-statsreload title="${t('Actualiser')}">${icon('refresh')}</button></div>
    ${stale ? `<p class="pst-status"><span class="dot"></span>${t('Mise à jour…')}</p>` : ''}
    <div data-pane="accounts">${r.accounts?.length ? accountsHtml(r.accounts) : f.length ? `<div class="pst-tiles">${f.map(([n, v]) => `<div class="pst-tile"><b>${fmtN(v)}</b><small>${t('abonnés')} ${esc(NET_NAMES[n] || n)}</small></div>`).join('')}</div>` : `<p class="pst-empty">${icon('chart')}${t('Aucun compte relié.')}</p>`}</div>
    <div data-pane="posts"><div class="pst-row"><h4 class="pst-section">${t('Posts publiés')}</h4><span class="spacer"></span>
      <button class="btn small" data-statsimport title="${t('Ajoute aux statistiques les posts des 30 derniers jours publiés hors du Studio')}">${icon('refresh')} ${t('Retrouver mes posts')}</button></div>
      ${posts.length ? `<div class="pst-list">${posts.map(postHtml).join('')}</div>` : `<p class="pst-empty">${icon('chart')}${t('Aucun post publié pour le moment.')}</p>`}</div>
    <div data-pane="links"><h4 class="pst-section">${t('Raccourcir un lien')}</h4>
      <form class="pst-card pst-short" data-shortform><input type="text" data-shorturl placeholder="https://…" spellcheck="false" required>
        <div class="pst-row"><input type="text" data-shortname placeholder="${t('Nom dans les statistiques (facultatif)')}"><select data-shortnet title="${t('Réseau où le lien sera partagé (clics comptés par réseau)')}"><option value="">${t('Autre')}</option>${SHORT_NETS.map((n) => `<option value="${n}">${NET_NAMES[n]}</option>`).join('')}</select><button class="btn btn-accent small">${t('Raccourcir')}</button></div>
        <div data-shortout>${shortOut}</div></form>
      ${r.clicks?.links?.length ? `<h4 class="pst-section">${t('Clics sur les liens')} <small>${t('{} derniers jours', r.clicks.days)}</small></h4><div class="pst-list">${r.clicks.links.map(clickHtml).join('')}</div>` : `<p class="pst-empty">${icon('chart')}${t('Aucun clic ces 30 derniers jours.')}</p>`}</div>
  </div>`;
  ['[data-shorturl]', '[data-shortname]', '[data-shortnet]'].forEach((s, i) => { if (typed[i]) $(s, body).value = typed[i]; });
  const sub = (k) => {
    statsSub = k;
    body.querySelectorAll('[data-ssub]').forEach((b) => b.classList.toggle('on', b.dataset.ssub === k));
    body.querySelectorAll('[data-pane]').forEach((el) => { el.hidden = el.dataset.pane !== k; });
  };
  body.querySelectorAll('[data-ssub]').forEach((b) => { b.onclick = () => sub(b.dataset.ssub); });
  sub(statsSub);
  $('[data-statsreload]', body).onclick = () => statsPage(dlg, body, true);
  // Lien court suivi : clics comptés comme ceux des posts
  $('[data-shortform]', body).onsubmit = async (e) => {
    e.preventDefault();
    const b = $('[data-shortform] button', body);
    let url = $('[data-shorturl]', body).value.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    b.disabled = true;
    try {
      const res = await fetch('/api/social/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ net: $('[data-shortnet]', body).value, text: url, title: $('[data-shortname]', body).value.trim() }) });
      const { text } = await res.json();
      if (!res.ok || !text || text === url) throw new Error(t('Lien court indisponible (page web activée ?)'));
      $('[data-shortout]', body).innerHTML = `<div class="pst-row"><code class="spacer selectable">${esc(text)}</code><button type="button" class="btn small" data-shortcopy>${t('Copier')}</button></div>`;
    } catch (err) { toast(err.message, 4000, 'warning'); } finally { b.disabled = false; }
  };
  $('[data-shortout]', body).onclick = (e) => {
    if (e.target.closest('[data-shortcopy]')) navigator.clipboard.writeText($('[data-shortout] code', body).textContent).then(() => toast(t('Lien copié'), 2000, 'check'), () => toast(t('Copie impossible'), 3000, 'warning'));
  };
  // Posts publiés hors du Studio et de l'appli : relus sur les comptes reliés
  $('[data-statsimport]', body).onclick = async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const res = await fetch('/api/social/history/import', { method: 'POST' });
      const imp = await res.json();
      if (!res.ok) throw new Error(imp.error || `Erreur ${res.status}`);
      const fails = Object.keys(imp.errors || {}).map((n) => NET_NAMES[n] || n);
      toast(`${imp.added ? t('{} post(s) ajouté(s)', imp.added) : t('Aucun nouveau post trouvé')}${fails.length ? ` (${t('illisible : {}', fails.join(', '))})` : ''}`, 4000, imp.added ? 'check' : 'info');
      if (imp.added) { histCache = null; statsPage(dlg, body, true); }
    } catch (err) { toast(err.message, 4000, 'warning'); } finally { b.disabled = false; }
  };
  // Post supprimé sur les réseaux : retiré des statistiques (ici et dans le Studio)
  body.querySelectorAll('[data-statsremove]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm(t('Retirer ce post des statistiques ? (Rien n\'est supprimé sur les réseaux.)'))) return;
      b.disabled = true;
      try {
        const res = await fetch('/api/social/history/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: b.dataset.statsremove }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`);
        histCache = null;
        statsCache = { ...statsCache, r: { ...r, posts: posts.filter((p) => p.key !== b.dataset.statsremove) } };
        b.closest('.pst-card').remove();
      } catch (err) { b.disabled = false; toast(err.message, 4000, 'warning'); }
    };
  });
}

// Résumé détaillé de la news choisie : points clés rédigés par le serveur, à relire et corriger
async function detailedSummary(dlg, btn) {
  const id = newsSel;
  const it = (newsCache?.items || []).find((x) => x.id === id);
  if (!it?.link) return;
  const st = $('[data-nsumst]', dlg);
  btn.disabled = true;
  if (st) st.textContent = t("Lecture de l'article et résumé…");
  try {
    const r = await fetch('/api/social/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link: it.link }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(j.points)) throw new Error(j.error ? t(j.error) : t('Résumé indisponible pour le moment'));
    edits.set(id, { title: $('[data-ntitle]', dlg).value, summary: $('[data-nsum]', dlg).value, points: j.points.join('\n') });
    if (newsSel === id) render(dlg);
    toast(t('{} points clés : relisez-les avant de publier', j.points.length), 3500, 'check');
  } catch (err) {
    if (st) st.textContent = '';
    toast(err.message, 5000, 'warning');
  } finally { btn.disabled = false; }
}

function open() {
  let dlg = $('#postsDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'postsDlg';
    dlg.className = 'modal posts-dlg';
    const MODES = [['session', 'Séance', 'Résultats, avant-course, flash', 'checkered'], ['season', 'Saison', 'Race week, records, notes', 'calendar'], ['news', 'News', 'Grosses news et récap', 'news'], ['manual', 'Écrire', 'Votre propre post', 'note'], ['drafts', 'Brouillons', 'Posts gardés pour plus tard', 'doc'], ['stats', 'Statistiques', 'Comptes, posts, liens', 'chart']];
    const FMTS = [['ig', 'Instagram / Facebook', 'Carrousel 4:5', 'r45'], ['story', 'Story / TikTok / Shorts', 'Vertical 9:16', 'r916'], ['x', 'X / Threads / Bluesky', 'Carrousel 4:5', 'r45']];
    dlg.innerHTML = `<div class="pv-shell">
      <aside class="pv-side">
        <div class="pv-brand">Paddock <b>${t('Posts')}</b></div>
        <div class="pv-sec">${t('Contenu')}</div>
        <nav class="pv-nav">${MODES.map(([k, v, sub, ic]) => `<button class="pv-item" data-mode="${k}"><span class="pv-ico">${icon(ic)}</span><span class="pv-lbl"><b>${t(v)}</b><small>${t(sub)}</small></span></button>`).join('')}</nav>
        <div class="pv-sec" data-pvfmt>${t('Format')}</div>
        <nav class="pv-nav" data-pvfmt>${FMTS.map(([k, v, sub, r]) => `<button class="pv-item" data-fmt="${k}"><span class="pv-ico"><i class="pv-ratio ${r}"></i></span><span class="pv-lbl"><b>${v}</b><small>${t(sub)}</small></span></button>`).join('')}</nav>
        <div class="pv-sec" data-pvfmt>${t('Options')}</div>
        <div class="pv-opts" data-pvfmt>
          <label class="toggle"><input type="checkbox" data-photos> ${t('Photos des pilotes')}</label>
          <label class="toggle" title="${t("Texte sans le nom du vainqueur au début")}"><input type="checkbox" data-nospoil> ${t('Texte sans spoiler')}</label>
          <label class="toggle" title="${t('Une question à la fin pour faire réagir')}"><input type="checkbox" data-question> ${t('Question en fin de texte')}</label>
          <label class="toggle" title="${t("Image et ligne « Abonnez-vous » à la fin des posts")}"><input type="checkbox" data-follow> ${t('Image « Abonnez-vous »')}</label>
          <label class="pv-sig"><span>${t('Signature')}</span><input type="text" class="posts-sig" maxlength="40" spellcheck="false"></label>
        </div>
      </aside>
      <div class="pv-main">
        <header class="pv-head">
          <div><h3 data-ptitle tabindex="-1" autofocus></h3><p data-psub></p></div>
          <div class="pv-actions">
            <button class="btn" data-open hidden>${icon('external')} ${t('Ouvrir le dossier')}</button>
            <button class="btn" data-savedraft title="${t('Garder ce post pour plus tard (aussi dans le Studio)')}">${icon('note')} ${t('Brouillon')}</button>
            <button class="btn" data-all>${icon('save')} ${t('Tout enregistrer')}</button>
            <button class="btn btn-accent" data-publish>${icon('megaphone')} ${t('Publier…')}</button>
            <button class="icon-btn" data-close title="${t('Fermer')}">${icon('close')}</button>
          </div>
        </header>
        <div class="posts-body"></div>
      </div>
    </div>`;
    document.body.appendChild(dlg);
    const sync = () => {
      const m = MODES.find(([k]) => k === (mode === 'draft' ? 'drafts' : mode));
      $('[data-ptitle]', dlg).textContent = t(m[1]);
      $('[data-psub]', dlg).textContent = mode === 'drafts' || mode === 'stats' ? t(m[2]) : `${t(m[2])} · ${FMTS.find(([k]) => k === fmt)[1]}`;
      for (const b of dlg.querySelectorAll('[data-fmt]')) b.classList.toggle('active', b.dataset.fmt === fmt);
      $('[data-photos]', dlg).checked = withPhotos;
      for (const b of dlg.querySelectorAll('[data-mode]')) b.classList.toggle('active', b.dataset.mode === (mode === 'draft' ? 'drafts' : mode));
      // Brouillons et statistiques : ni boutons d'enregistrement ou de publication, ni format, ni options
      for (const b of dlg.querySelectorAll('[data-savedraft], [data-all], [data-publish], [data-pvfmt]')) b.hidden = mode === 'drafts' || mode === 'stats';
      if (mode === 'draft') $('[data-psub]', dlg).textContent = curDraft.title;
      $('[data-nospoil]', dlg).checked = noSpoiler;
      $('[data-follow]', dlg).checked = follow;
      $('[data-question]', dlg).checked = withQuestion;
      $('[data-follow]', dlg).disabled = withQuestion;
      $('[data-question]', dlg).disabled = follow;
      $('[data-nospoil]', dlg).closest('label').hidden = mode !== 'session' || postType !== 'results';
      storageSet(OPT_KEY, { fmt, photos: withPhotos, noSpoiler, mode, linkComment, postType, follow, question: withQuestion, seasonType });
    };
    dlg.syncPosts = sync;
    dlg.addEventListener('close', endPreview);
    dlg.addEventListener('click', async (e) => {
      if (musicEvent(e)) return;
      if (e.target === dlg || e.target.closest('[data-close]')) { dlg.close(); return; }
      const m = e.target.closest('[data-mode]')?.dataset.mode;
      if (m && m !== mode) { mode = m; sync(); render(dlg); }
      const stp = e.target.closest('[data-stype]')?.dataset.stype;
      if (stp && stp !== seasonType) { seasonType = stp; roundSel = null; sync(); render(dlg); }
      if (e.target.closest('[data-racevideo]')) buildRaceVideo(dlg, e.target.closest('[data-racevideo]'));
      if (e.target.closest('[data-racevideosave]')) saveRaceVideo().catch((err) => toast(err.message, 5000, 'warning'));
      const pt = e.target.closest('[data-ptype]')?.dataset.ptype;
      if (pt && pt !== postType) { postType = pt; sync(); render(dlg); }
      const f = e.target.closest('[data-fmt]')?.dataset.fmt;
      if (f && f !== fmt) { fmt = f; sync(); render(dlg); }
      if (e.target.closest('[data-nsummary]')) detailedSummary(dlg, e.target.closest('[data-nsummary]'));
      if (e.target.closest('[data-mai]')) manualRewrite(dlg, e.target.closest('[data-mai]'));
      if (e.target.closest('[data-mimgdel]')) { manual.image = null; render(dlg); }
      if (e.target.closest('[data-mnew]')) { manual = blankManual(); render(dlg); }
      if (e.target.closest('[data-savedraft]')) { try { if (dlg.saveDraft) await dlg.saveDraft(); else toast(t('Visuels en préparation, réessayez dans un instant'), 3000); } catch (err) { toast(err.message, 5000, 'warning'); } }
      const dOpen = e.target.closest('[data-draftopen]');
      if (dOpen) { try { await openDraft(dlg, dOpen.closest('[data-draft-id]').dataset.draftId); } catch (err) { toast(err.message, 5000, 'warning'); } }
      const dDel = e.target.closest('[data-draftdel]');
      if (dDel && confirm(t('Supprimer ce brouillon ?'))) { try { await draftApi('drafts/remove', { id: dDel.closest('[data-draft-id]').dataset.draftId }); render(dlg); } catch (err) { toast(err.message, 5000, 'warning'); } }
      if (e.target.closest('[data-all]')) { try { await dlg.onSaveAll?.(); } catch (err) { toast(err.message, 5000, 'warning'); } }
      if (e.target.closest('[data-publish]')) { if (dlg.publish) dlg.publish(); else toast(t('Visuels en préparation, réessayez dans un instant'), 3000); }
      if (e.target.closest('[data-open]')) fetch('/api/posts/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: dlg.dataset.folder }) });
    });
    $('[data-photos]', dlg).addEventListener('change', (e) => { withPhotos = e.target.checked; sync(); render(dlg); });
    $('[data-nospoil]', dlg).addEventListener('change', (e) => { noSpoiler = e.target.checked; sync(); render(dlg); });
    $('[data-follow]', dlg).addEventListener('change', (e) => { follow = e.target.checked; sync(); render(dlg); });
    $('[data-question]', dlg).addEventListener('change', (e) => { withQuestion = e.target.checked; sync(); render(dlg); });
    // News : choix de la nouvelle, toutes les actus, titre et résumé corrigés à la main
    let te = null;
    dlg.addEventListener('change', (e) => {
      if (musicEvent(e)) return;
      if (e.target.matches('[data-newspick]')) { newsSel = e.target.value; render(dlg); }
      if (e.target.matches('[data-flashpick]')) { flashSel = e.target.value; render(dlg); }
      if (e.target.matches('[data-newsall]')) { newsAll = e.target.checked; render(dlg); }
      if (e.target.matches('[data-newssort]')) { newsSort = e.target.value; render(dlg); }
      if (e.target.matches('[data-newstype]')) { newsType = e.target.value; render(dlg); }
      if (e.target.matches('[data-recap]')) { recapMode = e.target.checked; render(dlg); }
      if (e.target.matches('[data-roundpick]')) { roundSel = Number(e.target.value); render(dlg); }
      if (e.target.matches('[data-linkcomment]')) { linkComment = e.target.checked; sync(); render(dlg); }
      if (e.target.matches('[data-breaking]') && newsSel) { breakingSet.set(newsSel, e.target.checked); render(dlg); }
      if (e.target.matches('[data-mbreaking]')) { manual.breaking = e.target.checked; render(dlg); }
      if (e.target.matches('[data-mkind]')) { manual.kind = e.target.value; renderNewsOnly(dlg); }
      if (e.target.matches('[data-mimg]') && e.target.files?.[0]) {
        createImageBitmap(e.target.files[0]).then((img) => { manual.image = img; render(dlg); }, () => toast(t('Image illisible'), 3000, 'warning'));
      }
    });
    dlg.addEventListener('input', (e) => {
      // Post écrit à la main : seuls les visuels et les textes sont redessinés pendant la saisie
      if (e.target.matches('[data-m]')) {
        manual[e.target.dataset.m] = e.target.value;
        clearTimeout(te);
        if (e.target.dataset.m !== 'raw') te = setTimeout(() => renderNewsOnly(dlg), 450);
        return;
      }
      if (!e.target.matches('[data-ntitle], [data-nsum], [data-npoints]') || !newsSel) return;
      edits.set(newsSel, { title: $('[data-ntitle]', dlg).value, summary: $('[data-nsum]', dlg).value, points: $('[data-npoints]', dlg).value });
      clearTimeout(te);
      te = setTimeout(() => renderNewsOnly(dlg), 450);
    });
    const sig = $('.posts-sig', dlg);
    sig.value = storageGet(SIG_KEY, '@BenjyPaddock');
    let tm = null;
    sig.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { storageSet(SIG_KEY, sig.value.trim()); render(dlg); }, 500); });
    sync();
  }
  $('[data-open]', dlg).hidden = true;
  dlg.showModal();
  render(dlg);
  fetch('/api/social/accounts').then((r) => r.json()).then((a) => {
    const changed = JSON.stringify(a) !== JSON.stringify(accounts);
    accounts = a;
    if (changed && dlg.open) render(dlg);
  }).catch(() => {});
}

function show(on) {
  enabled = on;
  const btn = $('#postsBtn');
  if (btn) btn.hidden = !on;
  const block = $('#creatorBlock');
  if (block) block.hidden = !on;
}

// Saisie du code (window.prompt n'existe pas dans l'application de bureau)
function askCode() {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal creator-dlg';
    dlg.innerHTML = `<form method="dialog" class="creator-form">
      <label class="small muted" for="creatorCode">${t('Code du mode créateur :')}</label>
      <input id="creatorCode" type="password" autocomplete="off" spellcheck="false" maxlength="40" required>
      <div class="row"><span class="spacer"></span><button class="btn" value="" type="button" data-cancel>${t('Annuler')}</button><button class="btn btn-accent" value="ok">${t('Valider')}</button></div>
    </form>`;
    document.body.appendChild(dlg);
    const input = $('#creatorCode', dlg);
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    $('[data-cancel]', dlg).addEventListener('click', () => done(''));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(''); });
    $('form', dlg).addEventListener('submit', (e) => { e.preventDefault(); done(input.value.trim()); });
    dlg.showModal();
    input.focus();
  });
}

async function unlock() {
  if (enabled) { open(); return; }
  if (document.querySelector('.creator-dlg[open]')) return;
  const code = await askCode();
  if (!code) return;
  const res = await fetch('/api/creator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).catch(() => null);
  if (res?.ok) { show(true); toast(t('Mode créateur activé : bouton « Posts » dans la barre latérale'), 4000, 'check'); } else toast(t(res?.status === 403 ? 'Code incorrect' : 'Activation impossible'), 3000, 'warning');
}

export function initSocial() {
  fetch('/api/creator').then((r) => r.json()).then((j) => show(!!j.enabled)).catch(() => {});
  $('#postsBtn')?.addEventListener('click', open);
  $('#creatorOff')?.addEventListener('click', async () => {
    await fetch('/api/creator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ off: true }) }).catch(() => {});
    show(false);
    toast(t('Mode créateur désactivé'), 2500, 'check');
  });
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyP') { e.preventDefault(); unlock(); }
  });
}
