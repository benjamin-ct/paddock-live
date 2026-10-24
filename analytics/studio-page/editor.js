// Studio : éditeur d'un post (visuels, textes, publication, programmation, partage), commun aux news,
// séances et posts de la saison.
import { slidesFor, drawSlide, slideName, slideAlt, chosenSlides, keptData } from '/shared/social-draw.js';
import { openImageViewer } from '/shared/image-viewer.js';
import { creditCaptions, followCaptions, questionCaptions } from '/shared/social-follow.js';
import { xLength } from '/shared/social.js';
import { linksIn } from '/shared/track-links.js';
import { FLAG_ISO } from '/shared/flags.js';
import { loadTeamLogos } from '/shared/team-logos.js';
import { $, $$, esc, api, icon, toast, toggle, sheet, schedList, glide, state, session, store, SIG, NET_NAMES, IOS, installed } from './ui.js';
import { bestSlot } from '/shared/post-history.js';
import { tiktokPanel, tiktokProblem, tiktokChoice, TIKTOK_PRIVACY } from './tiktok.js';
import { packDraftImages } from '/shared/post-draft.js';
import { postProblems, problemText } from '/shared/post-check.js';
import { THREADS_TOPIC } from '/shared/meta-publish.js';

// ---------- Images (photos des pilotes, drapeaux) par le relais du serveur ----------
const imgCache = new Map();
export function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (!imgCache.has(url)) {
    imgCache.set(url, api(`img?u=${encodeURIComponent(url)}`, { raw: true }).then((r) => r.blob()).then((b) => createImageBitmap(b)).catch(() => null));
  }
  return imgCache.get(url);
}
async function headshot(url) {
  if (!url) return null;
  const big = url.replace(/\.transform\/\dcol\//, '.transform/4col/');
  return (big !== url && await loadImage(big)) || loadImage(url);
}
export async function assets(d) {
  await Promise.all(['800 40px "Saira Condensed"', '700 40px "Saira Condensed"', '600 30px "Titillium Web"', '400 30px "Titillium Web"', '700 30px "JetBrains Mono"'].map((f) => document.fonts.load(f).catch(() => {})));
  const photos = {};
  if (state.photos) await Promise.all((d.rows || []).slice(0, 3).map(async (r) => { photos[r.num] = await headshot(r.headshot); }));
  const iso = d.iso || FLAG_ISO[String(d.country || '').toUpperCase()];
  const [flag, logos] = await Promise.all([iso ? loadImage(`https://flagcdn.com/${d.post === 'raceweek' ? 'w1280' : 'w160'}/${iso}.png`) : null, loadTeamLogos(loadImage)]);
  return { photos, flag, logos, signature: SIG };
}

// Post : Instagram, Facebook, Threads et Bluesky ; X : ses 4 images et son texte, publiés dans l'appli X ;
// Lien (news avec un article) : texte et lien seuls, la carte de l'article affichée par le réseau
const FORMATS = [['ig', 'Post'], ['story', 'Story'], ['x', 'X']];
const CAPS = [
  ['instagram', (c) => (c.facebook ? 'Légende Instagram' : 'Légende Instagram et Facebook'), 8],
  ['facebook', () => 'Texte Facebook', 8],
  ['threads', () => 'Texte Threads', 4, 500],
  ['x', () => 'Texte X (lien = 23 caractères)', 3, 0, 280],
  ['bsky', () => 'Texte Bluesky', 3, 0, 300],
  ['comment', () => 'Premier commentaire (Facebook, Threads, Bluesky ; X : à coller en réponse)', 2],
];

// Retour à la liste : bouton, geste « retour » de Safari (historique) et, sur l'appli installée,
// glissement depuis le bord gauche de l'écran
let leave = null;
const goBack = () => {
  if (history.state?.editor) { history.back(); return; }
  const fn = leave;
  leave = null;
  fn?.();
};
addEventListener('popstate', () => { if (leave && $('#app.editing')) { const fn = leave; leave = null; fn(); } });
let swipe = null;
addEventListener('touchstart', (e) => {
  swipe = leave && $('#app.editing') && installed() && e.touches.length === 1 && e.touches[0].clientX < 24 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0 } : null;
}, { passive: true });
addEventListener('touchmove', (e) => {
  if (!swipe) return;
  swipe.dx = e.touches[0].clientX - swipe.x;
  if (Math.abs(e.touches[0].clientY - swipe.y) > 60) { swipe = null; $('#app').classList.remove('swiping'); $('.editing .page')?.style.removeProperty('transform'); return; }
  $('#app').classList.add('swiping');
  const page = $('.editing .page');
  if (page) page.style.transform = `translateX(${Math.max(0, swipe.dx)}px)`;
}, { passive: true });
addEventListener('touchend', () => {
  if (!swipe) return;
  const done = swipe.dx > 90;
  swipe = null;
  $('#app').classList.remove('swiping');
  $('.editing .page')?.style.removeProperty('transform');
  if (done) goBack();
});

// Étapes de l'éditeur, dans l'ordre : chacune son écran (sur ordinateur, l'aperçu reste affiché à gauche)
// Brouillon du post ouvert : effacé une fois le post publié ou programmé
let draftId = null;
// Identifiants des envois du post ouvert (lui et son jumeau), gardés jusqu'à la réussite : un nouvel appui
// après une erreur ne programme pas une deuxième fois ce qui était déjà parti
let sendIds = null;
const newSendIds = () => { const id = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join(''); return { main: id(), twin: id() }; };
const dropDraft = () => { if (draftId) api('drafts/remove', { method: 'POST', body: JSON.stringify({ id: draftId }) }).catch(() => {}); draftId = null; };

const STEPS = [['contenu', 'Contenu'], ['visuels', 'Visuels'], ['video', 'Vidéo'], ['textes', 'Textes'], ['publier', 'Publier']];

// back : retour ; title / subtitle : en-tête ; head : réglages propres au post (HTML, étape Contenu) ;
// vhead : fabrication ou choix de la vidéo (étape Vidéo) ; note : remarque sur les données (étape Visuels) ; data : données des visuels ; caps(d) : textes
// des données d (sans ce que montrent les images écartées) ; bind(redraw) : branchement des réglages ;
// record : entrée du journal ; video() : vidéo jointe au post ; link() : article { url, title, description }
// pour un post « lien » (format Lien) ; twin : post jumeau publié en même temps, au choix
// { label(), data(), record() } (ses visuels et ses textes faits d'office, sans retouche) ; draft : brouillon
// repris (drafts.js), mis à jour par « Brouillon » et effacé une fois le post publié ou programmé
export function editor({ back, title, subtitle = '', head = '', vhead = '', note = '', data, caps, bind = () => {}, record, video = () => null, link = null, twin = null, draft = null }) {
  const formats = link ? [...FORMATS, ['link', 'Lien']] : FORMATS;
  if (!formats.some(([k]) => k === state.fmt)) state.fmt = 'ig';
  let canvases = [];
  let edited = { ...draft?.edited };   // textes retouchés à la main : gardés en changeant de format
  state.skip = new Set(draft?.skip);   // images écartées de ce post (toutes publiées par défaut)
  draftId = draft?.id || null;
  sendIds = null;
  state.noVideo = false;    // vidéo prête laissée de côté (visuels publiés)
  state.noTwin = false;     // post jumeau laissé de côté
  const root = $('#app');
  const steps = STEPS.filter(([k]) => (k === 'contenu' ? head.trim() : k === 'video' ? vhead.trim() : true));
  root.className = 'shell editing';
  root.innerHTML = `<header class="appbar"><button class="iconbtn" id="back" aria-label="Retour">${icon('back')}</button>
      <div class="titles"><b>${esc(title)}</b>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div>
      <button class="btn small" id="savedraft" title="Garder ce post pour plus tard (aussi dans l'appli)">${icon('pen')}Brouillon</button></header>
    <main class="page">
      <nav class="steps" id="steps">${steps.map(([k, v]) => `<button data-go="${k}"><i></i><span>${v}</span></button>`).join('')}</nav>
      ${head.trim() ? `<section class="panel" data-in="contenu">${head}</section>` : ''}
      ${note ? `<p class="hint" data-in="visuels">${esc(note)}</p>` : ''}
      <div class="seg wide" id="fmt" data-in="visuels">${formats.map(([k, v]) => `<button data-fmt="${k}" class="${state.fmt === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div id="main" class="preview" data-in="visuels"></div>
      <section class="panel" id="opts" data-in="visuels">
        <h3 class="section">Options</h3>
        ${toggle('photos', 'Photos des pilotes', state.photos)}
        ${toggle('follow', 'Image « Abonnez-vous »', state.follow, '', state.question ? 'disabled' : '')}
        ${toggle('question', 'Question pour faire réagir', state.question, '', state.follow ? 'disabled' : '')}
      </section>
      ${vhead.trim() ? `<section class="panel" data-in="video">${vhead}<p class="hint">Facultatif : sans vidéo, ce sont les visuels qui sont publiés.</p></section>` : ''}
      <div id="texts" data-in="textes"></div>
      <section class="panel" id="netsbox" data-in="publier"></section>
      <div id="schedlist" data-in="publier"></div>
    </main>
    <div class="actionbar"><button class="iconbtn boxed" id="prev" aria-label="Étape précédente">${icon('back')}</button><button class="btn primary" id="next"></button>
      <button class="btn primary" id="go">${icon('send')}Publier</button><button class="btn" id="plan">${icon('clock')}Programmer</button><button class="iconbtn boxed" id="share" aria-label="Partager ou enregistrer">${icon('share')}</button>${IOS ? '' : `<button class="iconbtn boxed" id="dl" aria-label="Télécharger">${icon('download')}</button>`}</div>`;
  scrollTo(0, 0);
  // Étape affichée (#app[data-step] : la feuille de style montre ses blocs et ses boutons) ; étapes
  // masquées (Textes pour une story) sautées par Précédent / Suivant
  const shown = () => steps.filter(([k]) => !$(`[data-go="${k}"]`).hidden);
  const setStep = (k) => {
    document.activeElement?.blur();   // clavier refermé avant de masquer le champ (iPhone : page décalée sinon)
    const list = shown();
    const i = Math.max(0, list.findIndex(([x]) => x === k));
    root.dataset.step = list[i][0];
    $$('#steps [data-go]').forEach((b) => {
      const j = list.findIndex(([x]) => x === b.dataset.go);
      b.classList.toggle('on', j === i);
      b.classList.toggle('done', j >= 0 && j < i);
    });
    $('#prev').hidden = i === 0;
    const nx = list[i + 1];
    $('#next').innerHTML = nx ? `${esc(nx[1])}${icon('next')}` : '';
    if (nx) $('#next').onclick = () => setStep(nx[0]);
    scrollTo({ top: 0 });
    glide();
  };
  $('#prev').onclick = () => { const list = shown(); setStep(list[Math.max(0, list.findIndex(([x]) => x === root.dataset.step) - 1)][0]); };
  $$('#steps [data-go]').forEach((b) => { b.onclick = () => setStep(b.dataset.go); });
  setStep(steps[0][0]);
  // Entrée dans l'historique : le geste « retour » ramène à la liste au lieu de quitter la page
  if (!history.state?.editor) history.pushState({ editor: 1 }, '');
  leave = back;

  // Textes : question et abonnement seulement si leur image est gardée ; retouches à la main conservées
  const texts = (d, skip = state.skip, mine = edited) => {
    let base = caps(keptData(d, skip, state.fmt));
    if (state.question && !skip.has('question')) base = questionCaptions(base, d, SIG);
    if (state.follow && !skip.has('abonnement')) base = followCaptions(base, d, SIG);
    if (!base.bsky) base = { ...base, bsky: base.x };
    // Mention « Fait par IA avec l'appli », sauf pour les posts écrits à la main
    return { ...(record?.()?.kind === 'manual' ? base : creditCaptions(base)), ...mine };
  };
  const redraw = async (changed = false) => {
    if (changed) edited = {};
    const d = data();
    const c = texts(d);
    const linkTab = state.fmt === 'link';
    const slides = linkTab ? [] : slidesFor(d, { fmt: state.fmt, follow: state.follow, question: state.question });
    const lk = linkTab ? link() : null;
    $('#main').innerHTML = linkTab ? `<div class="linkcard"><div id="lcimg"></div><small>${esc(new URL(lk.url).hostname.replace(/^www\./, ''))}</small><b>${esc(lk.title)}</b><p>${esc(lk.description)}</p></div>
      <p class="hint">Carte de l'article sur Facebook, Threads et X ; titre et résumé sur Bluesky ; Instagram : visuels de l'onglet Post.</p>
      <div class="row"><button class="btn small" id="xlink">${icon('send')}Ouvrir X avec le lien</button></div>` : `<div class="slides ${state.fmt}">${slides.map((sl) => `<figure class="sl"><canvas data-slide="${sl}" title="${esc(slideName(sl))} : voir en grand"></canvas>
        <label class="pick"><input type="checkbox" data-pick="${sl}" ${state.skip.has(sl) ? '' : 'checked'}><span data-num></span>${esc(slideName(sl))}</label></figure>`).join('')}</div>`;
    const xTab = state.fmt === 'x';
    const shown = ([k]) => (linkTab ? ['instagram', 'facebook', 'threads', 'bsky', 'x'].includes(k) : xTab ? k === 'x' || (k === 'comment' && c[k]) : k !== 'x' && (k === 'instagram' || k === 'threads' || k === 'bsky' || c[k]));
    $('#texts').innerHTML = `<section class="panel"><h3 class="section">Textes</h3>${CAPS.filter(shown).map(([k, label, rows, max = 0, limit = 0], i) => `
      <details class="cap" ${i === 0 ? 'open' : ''}><summary><span>${esc(label(c))}</span><small data-count="${k}"></small></summary>
        <textarea id="cap-${k}" rows="${rows}" ${max ? `maxlength="${max}"` : ''} data-limit="${limit || max}">${esc(c[k])}</textarea>
        ${k === 'comment' ? `<div class="row end"><button class="btn small" id="copycomment">${icon('copy')}Copier</button></div>` : ''}
        ${k === 'threads' ? `<label class="field"><span>Sujet Threads (vide : aucun)</span><input type="text" id="threadtopic" maxlength="50" value="${esc(state.topic ?? THREADS_TOPIC)}"></label>` : ''}</details>`).join('')}</section>`;
    if ($('#threadtopic')) $('#threadtopic').oninput = (e) => { state.topic = e.target.value; };
    const count = (k) => {
      const el = $(`#cap-${k}`);
      const n = k === 'x' ? xLength(el.value) : el.value.length;
      const lim = Number(el.dataset.limit) || 0;
      $(`[data-count="${k}"]`).textContent = lim ? `${n} / ${lim}` : `${n}`;
      $(`[data-count="${k}"]`).classList.toggle('err', !!lim && n > lim);
    };
    let prep = 0;
    // Liens remplacés d'office par leur lien court suivi (pdkl.app) dans chaque case, avec la lettre de son
    // réseau (remise à celle du réseau de publication par le serveur : premier commentaire commun)
    const prepare = () => {
      for (const k of CAPS.map(([x]) => x)) {
        const el = $(`#cap-${k}`);
        if (!el) continue;
        const raw = el.value;
        prepareX(raw, record?.()?.title, CAP_NET[k] || (xTab ? 'x' : 'facebook')).then((t) => {
          if (t === raw || !el.isConnected || el.value !== raw) return;
          el.value = t;
          if (k in edited) edited[k] = t;
          count(k);
        });
      }
    };
    for (const k of CAPS.map(([x]) => x).filter((x) => $(`#cap-${x}`))) {
      count(k);
      $(`#cap-${k}`).oninput = (e) => { edited[k] = e.target.value; count(k); clearTimeout(prep); prep = setTimeout(prepare, 800); };
    }
    prepare();
    // Avec une vidéo : Reel, vidéo Facebook, Threads et Bluesky, et aussi brouillon TikTok et Short YouTube (à cocher).
    // Format Story : stories Instagram et Facebook (Threads et Bluesky n'en ont pas). Vidéo prête : publiée
    // (une story vidéo) ou laissée de côté pour les visuels, au choix
    const story = state.fmt === 'story';
    const vid = state.noVideo ? null : video();
    const list = story ? [['instagram-story', 'Story Instagram'], ['facebook-story', 'Story Facebook']]
      : linkTab ? [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['threads', 'Threads'], ['bluesky', 'Bluesky']]
      : [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['threads', 'Threads'], ['bluesky', 'Bluesky'], ...(vid ? [['tiktok', 'TikTok'], ['youtube', 'YouTube Shorts']] : [])];
    const withVid = video() ? `<label class="switch net"><span><b>${story ? 'Vidéo en story' : 'Publier la vidéo'}</b><small>${story ? 'sinon une story par visuel' : 'sinon les visuels'}</small></span><input type="checkbox" role="switch" id="withvid" ${vid ? 'checked' : ''}></label>` : '';
    $('#go').innerHTML = `${icon('send')}${xTab ? 'Ouvrir X' : 'Publier'}`;
    $('#plan').hidden = xTab;
    $('#go').disabled = false;
    $('#netsbox').hidden = xTab;
    $('[data-go="textes"]').hidden = story;   // stories : pas de texte publié
    if (story && root.dataset.step === 'textes') setStep('publier');
    for (const el of [$('#opts'), $('#share'), $('#dl')]) if (el) el.hidden = linkTab;   // post « lien » : pas de visuels
    $('#netsbox').innerHTML = xTab ? '' : `<h3 class="section">Publier sur</h3>${twin && !linkTab ? `<label class="switch net"><span><b>Publier aussi « ${esc(twin.label())} »</b><small>Son propre post, sur les mêmes réseaux, en même temps</small></span><input type="checkbox" role="switch" id="withtwin" ${state.noTwin ? '' : 'checked'}></label>` : ''}${withVid}${list.map(([k, v]) => {
      const acc = session.me?.[k.replace('-story', '')];
      return `<label class="switch net"><span><b>${v}</b><small>${esc(acc || 'non connecté')}</small><em class="st" data-st="${k}"></em></span><input type="checkbox" role="switch" data-net="${k}" ${acc ? (k === 'tiktok' || k === 'youtube' ? '' : 'checked') : 'disabled'}></label>`;
    }).join('')}${vid ? '<div id="tkbox" class="tkbox" hidden></div>' : ''}${vid || story ? `<p class="hint">${story ? `${vid ? 'La vidéo en story' : 'Une story par image'}, visible 24 heures.` : `Vidéo sur tous les réseaux${vid.full ? ' : plein écran sur Facebook, Threads et Bluesky, zone sûre sur Instagram, TikTok et YouTube (privé)' : ''}.`}</p>` : ''}`;
    if ($('#withvid')) $('#withvid').onchange = (e) => { state.noVideo = !e.target.checked; redraw(); };
    if ($('#withtwin')) $('#withtwin').onchange = (e) => { state.noTwin = !e.target.checked; };
    // Post jumeau à publier aussi : ses textes faits d'office (toutes ses images gardées)
    const pair = () => (twin && !state.noTwin && !xTab && !linkTab ? { data: twin.data(), record: twin.record(), texts: texts(twin.data(), new Set(), {}) } : null);
    // TikTok coché : réglages (brouillon ou publication directe) ; publication bloquée tant qu'ils manquent
    const tk = $('[data-net="tiktok"]');
    if (vid && tk) {
      const check = () => {
        const why = tk.checked ? tiktokProblem() : null;
        $('#go').disabled = !!why;
        $('#go').title = why || '';
      };
      const show = () => { $('#tkbox').hidden = !tk.checked; if (tk.checked) tiktokPanel($('#tkbox'), vid, textOf('tiktok'), check); else check(); };
      tk.onchange = show;
      show();
    }
    if (linkTab) {
      canvases = [];
      articlePhoto(lk.url).then((src) => { if (src && $('#lcimg')) $('#lcimg').innerHTML = `<img src="${src}" alt="">`; });
      $('#go').onclick = () => publishAll(d, null, record?.(), null, link());
      $('#plan').onclick = () => schedulePanel(d, null, record?.(), null, link());
      $('#xlink').onclick = () => openX([], $('#cap-x').value);
      return;
    }
    const o = await assets(d);
    const all = $$('#main canvas');
    // Images gardées : redessinées (sommaire, points, numéros) ; écartées : grisées, sans numéro
    const paint = () => {
      const list = chosenSlides(slides, [...state.skip]);
      canvases = all.filter((cv) => list.includes(cv.dataset.slide));
      for (const cv of all) {
        const on = list.includes(cv.dataset.slide);
        drawSlide(cv, cv.dataset.slide, state.fmt, d, { ...o, slides: list });
        cv.closest('.sl').classList.toggle('off', !on);
        cv.closest('.sl').querySelector('[data-num]').textContent = on ? `${list.indexOf(cv.dataset.slide) + 1}` : '–';
      }
    };
    paint();
    // Image touchée : vue en grand (glisser pour passer à la suivante, vers le bas pour fermer)
    for (const cv of all) cv.onclick = () => openImageViewer(all.map((c) => ({ canvas: c, label: slideName(c.dataset.slide), off: !canvases.includes(c) })), all.indexOf(cv));
    $$('#main [data-pick]').forEach((cb) => {
      cb.onchange = () => {
        if (cb.checked) state.skip.delete(cb.dataset.pick); else state.skip.add(cb.dataset.pick);
        if (!chosenSlides(slides, [...state.skip]).some((s) => !state.skip.has(s))) { state.skip.delete(cb.dataset.pick); cb.checked = true; toast('Gardez au moins une image', 'bad'); }
        paint();
        const t = texts(d);
        for (const k of Object.keys(t)) if (!(k in edited) && $(`#cap-${k}`)) { $(`#cap-${k}`).value = t[k]; count(k); }
        prepare();
      };
    });
    $('#go').onclick = () => (xTab ? openX(canvases, $('#cap-x').value, vid) : publishAll(d, o, record?.(), vid, null, pair()));
    $('#plan').onclick = () => schedulePanel(d, o, record?.(), vid, null, pair());
    $('#share').onclick = () => share(canvases, state.fmt === 'x' ? $('#cap-x').value : state.fmt === 'ig' ? $('#cap-instagram').value : '');
    // iPhone : « Partager » propose aussi « Enregistrer les images » (Photos)
    if ($('#dl')) $('#dl').onclick = () => download(canvases);
    if ($('#copycomment')) $('#copycomment').onclick = async () => { try { await navigator.clipboard.writeText(trackedNow($('#cap-comment').value)); toast('Commentaire copié'); } catch { /* presse-papiers refusé */ } };
  };
  $('#back').onclick = goBack;
  // Brouillon : de quoi refaire le post (ici ou dans l'appli) ; un deuxième clic met à jour le même
  $('#savedraft').onclick = async () => {
    const b = $('#savedraft');
    b.disabled = true;
    try {
      const rec = record?.() || {};
      const id = draftId || crypto.randomUUID();
      await api('drafts', { method: 'POST', body: JSON.stringify({ id, title: rec.title || title, kind: rec.kind || '', key: rec.key || '', at: Date.now(),
        d: packDraftImages(data()), fmt: state.fmt, skip: [...state.skip], edited,
        opts: { follow: state.follow, question: state.question, photos: state.photos, noSpoiler: state.noSpoiler, linkComment: state.linkComment } }) });
      draftId = id;
      toast('Brouillon enregistré', 'ok');
    } catch (err) { toast(err.message, 'bad'); } finally { b.disabled = false; }
  };
  $$('[data-fmt]').forEach((b) => { b.onclick = () => { state.fmt = b.dataset.fmt; $$('[data-fmt]').forEach((x) => x.classList.toggle('on', x === b)); glide(); redraw(); }; });
  $('#photos').onchange = (e) => { state.photos = e.target.checked; redraw(); };
  // Question et abonnement : un seul appel par post
  $('#follow').onchange = (e) => { state.follow = e.target.checked; $('#question').disabled = state.follow; redraw(true); };
  $('#question').onchange = (e) => { state.question = e.target.checked; $('#follow').disabled = state.question; redraw(true); };
  bind(redraw);
  glide();
  redraw();
  schedList($('#schedlist'));
}

// Photo de l'article (celle des aperçus de lien), lue par le serveur : adresse locale, ou null
const artPhotos = new Map();
function articlePhoto(url) {
  if (!artPhotos.has(url)) artPhotos.set(url, api(`artimg?u=${encodeURIComponent(url)}`, { raw: true }).then((r) => r.blob()).then((b) => URL.createObjectURL(b)).catch(() => null));
  return artPhotos.get(url);
}

// Vers X (un lien ne transmet que le texte) : sur téléphone, menu de partage avec les images et le texte
// (choisir X ; texte aussi copié, à coller si l'appli ne le reprend pas), sinon l'appli X. Sur ordinateur,
// x.com avec le texte et les images ou la vidéo téléchargées (le menu de partage de Windows ne propose pas X)
// Texte X (et premier commentaire) avec ses liens suivis (clics comptés), préparé à l'affichage : le
// partage part dès le toucher
const CAP_NET = { instagram: 'instagram', facebook: 'facebook', threads: 'threads', x: 'x', bsky: 'bluesky' };
const trackedX = new Map();   // réseau|texte -> texte suivi (ou demande en cours)
const trackedNow = (raw, net = 'x') => { const t = trackedX.get(`${net}|${raw}`); return typeof t === 'string' ? t : raw; };
function prepareX(raw, title, net = 'x') {
  if (!/https?:\/\//.test(raw) || !linksIn(raw).length) return Promise.resolve(raw);
  const key = `${net}|${raw}`;
  if (!trackedX.has(key)) {
    trackedX.set(key, api('links', { method: 'POST', body: JSON.stringify({ net, text: raw, title }) })
      .then((r) => { const t = r?.text || raw; trackedX.set(key, t); return t; })
      .catch(() => { trackedX.delete(key); return raw; }));
  }
  return Promise.resolve(trackedX.get(key));
}
// video : vidéo jointe au post, partagée à la place des visuels (en plein écran si elle en a une version)
async function openX(canvases, raw, video = null) {
  const text = trackedNow(raw);
  navigator.clipboard?.writeText(text).catch(() => {});
  const files = video ? [video.full || video] : await Promise.all(canvases.map(async (cv, i) => new File([await toBlob(cv)], `x-${i + 1}.png`, { type: 'image/png' })));
  const phone = IOS || /Android/.test(navigator.userAgent);
  if (phone && navigator.canShare?.({ files })) {
    try { await navigator.share({ files, text }); } catch { /* partage annulé */ }
    return;
  }
  if (phone) { location.href = `twitter://post?message=${encodeURIComponent(text)}`; return; }
  open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  if (!video) { download(canvases); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(files[0]); a.download = files[0].name; a.click();
}

const toBlob = (cv, type = 'image/png', q) => new Promise((r) => cv.toBlob(r, type, q));

async function share(canvases, text) {
  const files = await Promise.all(canvases.map(async (cv, i) => new File([await toBlob(cv)], `post-${i + 1}.png`, { type: 'image/png' })));
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files, text: text || undefined }); } catch { /* partage annulé */ }
    return;
  }
  download(canvases);
}

async function download(canvases) {
  for (const [i, cv] of canvases.entries()) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await toBlob(cv));
    a.download = `post-${state.fmt}-${i + 1}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}

// Réseaux cochés, texte et premier commentaire de chacun
const checkedNets = () => $$('[data-net]:checked').map((i) => i.dataset.net);
const textOf = (n) => $(`#cap-${n === 'threads' ? 'threads' : n === 'bluesky' ? 'bsky' : n === 'facebook' && $('#cap-facebook') ? 'facebook' : 'instagram'}`)?.value ?? '';
const capOf = (c, n) => c[n === 'threads' ? 'threads' : n === 'bluesky' ? 'bsky' : n === 'facebook' && c.facebook ? 'facebook' : 'instagram'] || '';
// Avant d'envoyer : texte trop long (refusé, message affiché), visuels au-delà du carrousel (texte d'avertissement)
function checkPost(d, nets, carousel) {
  const pb = postProblems(nets, textOf, carousel ? chosenSlides(slidesFor(d, { fmt: 'ig', follow: state.follow, question: state.question }), [...(state.skip || [])]).length : 0);
  const block = pb.find((p) => p.block);
  if (block) { toast(problemText(block), 'bad'); return null; }
  return pb.map((p) => `\n\n${problemText(p)}`).join('');
}
const commentOf = (n) => (n !== 'instagram' && $('#cap-comment')?.value.trim()) || '';
// JPEG de moins de max octets : qualité baissée au besoin, puis visuel réduit (diapo photo très détaillée,
// encodeur de Safari qui produit des fichiers bien plus lourds)
async function fitJpeg(cv, max) {
  let b = null;
  for (const q of [0.92, 0.85, 0.75, 0.6, 0.45]) { b = await toBlob(cv, 'image/jpeg', q); if (b.size <= max) return b; }
  for (const k of [0.85, 0.7, 0.55, 0.4]) {
    const c = document.createElement('canvas');
    c.width = Math.round(cv.width * k); c.height = Math.round(cv.height * k);
    c.getContext('2d').drawImage(cv, 0, 0, c.width, c.height);
    b = await toBlob(c, 'image/jpeg', 0.8);
    if (b.size <= max) break;
  }
  return b;
}
// Visuels : format Instagram (Instagram, Facebook, Threads) ou Story (stories) ; Bluesky : 4 au format X, moins de 1 Mo
const isStory = (n) => n.endsWith('-story');
async function postImages(d, o, nets, maxIg = Infinity, skip = state.skip) {
  // Images gardées seulement (sommaire et numéros suivent)
  const draw = (fmt, max, n = 99) => {
    const list = chosenSlides(slidesFor(d, { fmt, follow: state.follow, question: state.question }), [...(skip || [])]).slice(0, n);
    return Promise.all(list.map(async (sl) => Object.assign(await fitJpeg(drawSlide(document.createElement('canvas'), sl, fmt, d, { ...o, slides: list }), max), { alt: slideAlt(d, sl) })));
  };
  return { ig: nets.some((n) => n !== 'bluesky') ? await draw(nets.some(isStory) ? 'story' : 'ig', maxIg) : [], x: nets.includes('bluesky') ? await draw('x', 950 * 1024, 4) : [] };
}

// Post confié au serveur (visuels ou vidéo, textes), publié à l'heure `at` même page fermée
// video : envoyée à tous les réseaux (video.full : version plein écran hors Reels, TikTok et Shorts) ;
// tk : réglages d'une publication directe TikTok ;
// link : post « lien » (carte de l'article), sauf Instagram qui n'en a pas : visuels de l'onglet Post
// alt : post jumeau (textes donnés, toutes ses images)
// Post jumeau, après le principal : son échec dit que le principal, lui, est parti
async function queueTwin(twin, o, nets, at) {
  try { await queuePost(twin.data, o, nets, at, twin.record, null, null, null, twin, sendIds.twin); } catch (err) { throw new Error(`Post principal envoyé ; « ${twin.record.title} » : ${err.message}`); }
}
async function queuePost(d, o, nets, at, record, video = null, tk = null, link = null, alt = null, id = null) {
  const imgs = video ? { ig: [], x: [] } : !link ? await postImages(d, o, nets, 3.5e6, alt ? new Set() : state.skip)
    : { ig: nets.includes('instagram') ? (await postImages(d, o || await assets(d), ['instagram'], 3.5e6)).ig : [], x: [] };
  const form = new FormData();
  if (id) form.append('id', id);
  form.append('at', String(at));
  form.append('title', record?.title || d.title || d.gp || 'Post');
  form.append('record', JSON.stringify(record));
  form.append('posts', JSON.stringify(nets.map((n) => (isStory(n) ? { network: n } : { network: n, text: alt ? capOf(alt.texts, n) : textOf(n), comment: link ? '' : alt ? (n !== 'instagram' && alt.texts.comment?.trim()) || '' : commentOf(n), ...(n === 'threads' ? { topic: state.topic ?? THREADS_TOPIC } : {}) }))));
  if (link) form.append('link', JSON.stringify(link));
  imgs.ig.forEach((b, i) => form.append('ig', b, `image-${i + 1}.jpg`));
  form.append('alts', JSON.stringify({ ig: imgs.ig.map((b) => b.alt || ''), x: imgs.x.map((b) => b.alt || '') }));
  imgs.x.forEach((b, i) => form.append('x', b, `x-${i + 1}.jpg`));
  if (video) form.append('video', video, video.type === 'video/quicktime' ? 'video.mov' : 'video.mp4');
  if (video?.cover) form.append('cover', video.cover, 'cover.jpg');
  if (video?.full) form.append('videofull', video.full, 'video-full.mp4');
  if (video?.vsize) form.append('vsize', video.vsize);
  if (tk) form.append('tiktok', JSON.stringify(tk));
  return (await api('schedule', { method: 'POST', body: form })).item;
}

// Publication programmée : envoyée au serveur, publiée à l'heure même page fermée
const localValue = (t) => new Date(t - t.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
function schedulePanel(d, o, record = null, video = null, link = null, twin = null) {
  const nets = checkedNets();
  if (!nets.length) { toast('Cochez au moins un réseau', 'bad'); return; }
  const tk = nets.includes('tiktok') ? tiktokChoice() : null;
  if (nets.includes('tiktok') && tiktokProblem()) { toast(tiktokProblem(), 'bad'); return; }
  const warn = checkPost(d, nets, !video && !link);
  if (warn === null) return;
  const t = new Date(Date.now() + 3600e3);
  t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15, 0, 0);
  // Créneau conseillé d'après les chiffres des posts déjà publiés (lus dans l'onglet Stats au fil du temps)
  const slot = bestSlot(store.get('poststats')?.v);
  const dlg = sheet('Programmer la publication', `<label class="field"><span>Date et heure</span><input type="datetime-local" id="when" value="${localValue(t)}"></label>
    ${slot ? `<p class="hint">Conseil : d'après vos ${slot.n} derniers posts, ceux publiés entre ${slot.from} h et ${slot.to} h ont ${String(slot.ratio).replace('.', ',')} fois plus de réactions que la moyenne.</p>
    <div class="row"><button class="btn small" id="bestslot">${icon('clock')}Choisir ${slot.from + 1} h</button></div>` : ''}
    <p class="hint">Sur ${esc(nets.map((n) => NET_NAMES[n]).join(', '))}, même page fermée (7 jours à l'avance au plus).</p>
    ${warn ? `<p class="hint err">${esc(warn.trim())}</p>` : ''}
    <p class="hint" id="schedst"></p>
    <button class="btn primary wide" id="dosched">${icon('clock')}Programmer</button>`);
  if (slot) {
    $('#bestslot', dlg).onclick = () => {
      const next = new Date();
      next.setHours(slot.from + 1, 0, 0, 0);
      if (next.getTime() < Date.now() + 10 * 60e3) next.setDate(next.getDate() + 1);
      $('#when', dlg).value = localValue(next);
    };
  }
  $('#dosched', dlg).onclick = async () => {
    const at = new Date($('#when', dlg).value).getTime();
    const st = $('#schedst', dlg);
    if (!Number.isFinite(at) || at < Date.now() - 60e3) { st.className = 'hint err'; st.textContent = 'Choisissez une heure à venir'; return; }
    if (!confirm(`Programmer pour le ${new Date(at).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })} sur : ${nets.map((n) => NET_NAMES[n]).join(', ')} ?${twin ? `\n\nDeux posts : celui-ci et « ${twin.record.title} ».` : ''}\n\nLes posts seront publics à cette heure-là.`)) return;
    const btn = $('#dosched', dlg);
    btn.disabled = true;
    st.className = 'hint';
    st.textContent = video ? 'Envoi de la vidéo…' : 'Envoi des visuels…';
    try {
      sendIds ||= newSendIds();
      await queuePost(d, o, nets, at, record, video, tk, link, null, sendIds.main);
      if (twin) await queueTwin(twin, o, nets, at);
      sendIds = null;
      dlg.close();
      toast(`Programmé pour le ${new Date(at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}`, 'ok');
      dropDraft();
      schedList($('#schedlist'));
    } catch (err) {
      st.className = 'hint err';
      st.textContent = err.message;
      btn.disabled = false;
    }
  };
}

// Page plein écran avec retour (bouton, geste retour de Safari, glissement depuis le bord)
export function enterPage(back) {
  scrollTo(0, 0);
  if (!history.state?.editor) history.pushState({ editor: 1 }, '');
  leave = back;
}
export { goBack };

async function publishAll(d, o, record = null, video = null, link = null, twin = null) {
  const nets = checkedNets();
  if (!nets.length) { toast('Cochez au moins un réseau', 'bad'); return; }
  const stories = nets.some(isStory);
  // TikTok : publication directe avec les réglages choisis, sinon brouillon ; rien n'est envoyé sans confirmation
  const tk = nets.includes('tiktok') ? tiktokChoice() : null;
  if (nets.includes('tiktok') && tiktokProblem()) { toast(tiktokProblem(), 'bad'); return; }
  const warn = checkPost(d, nets, !video && !link);
  if (warn === null) return;
  if (!confirm(`Publier maintenant sur : ${nets.map((n) => NET_NAMES[n] || n).join(', ')} ?${twin ? `\n\nDeux posts : celui-ci et « ${twin.record.title} ».` : ''}${warn}\n\n${stories ? 'Les stories seront publiques pendant 24 heures' : `Les posts seront publics${[nets.includes('tiktok') && `TikTok : ${tk ? `publication directe, visible par : ${TIKTOK_PRIVACY[tk.privacy]}` : 'en brouillon'}`, nets.includes('youtube') && 'YouTube : en privé'].filter(Boolean).map((x, i, a) => `${i ? ' ; ' : ' ('}${x}${i === a.length - 1 ? ')' : ''}`).join('')}`}.`)) return;
  // Brouillon TikTok : TikTok ne prend pas son texte, copié pour être collé dans la description
  const tkText = nets.includes('tiktok') && !tk && textOf('tiktok');
  if (tkText) navigator.clipboard?.writeText(tkText).catch(() => {});
  const go = $('#go');
  go.disabled = true;
  // Confié au serveur (visuels ou vidéo envoyés une fois) : publié dans la minute, même page fermée
  for (const n of nets) { const st = $(`[data-st="${n}"]`); st.className = 'st'; st.textContent = video ? 'Envoi de la vidéo au serveur…' : 'Envoi au serveur…'; }
  try {
    sendIds ||= newSendIds();
    const item = await queuePost(d, o, nets, Date.now(), record, video, tk, link, null, sendIds.main);
    if (twin) await queueTwin(twin, o, nets, Date.now());
    sendIds = null;
    for (const n of nets) $(`[data-st="${n}"]`).textContent = 'Publication dans la minute';
    toast(`Envoyé : publication dans la minute, vous pouvez quitter la page${tkText ? '. Texte TikTok copié : collez-le dans la description du brouillon' : ''}`, 'ok');
    dropDraft();
    // Avancement relu tant que la page reste ouverte (5 minutes au plus) ; tout publié : retirée de la liste
    const list = $('#schedlist');
    schedList(list);
    let n = 0;
    const poll = setInterval(async () => {
      if (++n > 20 || !list.isConnected) { clearInterval(poll); return; }
      const items = await schedList(list);
      if (items && !items.some((x) => x.id === item?.id)) {
        clearInterval(poll);
        for (const k of nets) { const st = $(`[data-st="${k}"]`); if (st) { st.className = 'st ok'; st.innerHTML = `Publié ${icon('check')}`; } }
      }
    }, 15e3);
  } catch (err) {
    for (const n of nets) { const st = $(`[data-st="${n}"]`); st.className = 'st err'; st.textContent = err.message; }
  } finally { go.disabled = false; }
}
