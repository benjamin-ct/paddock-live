// Studio : éditeur d'un post (contenu, visuels, vidéo, puis publication : publish.js), commun aux news,
// séances et posts de la saison.
import { slidesFor, drawSlide, slideName, chosenSlides, keptData } from '/shared/social-draw.js';
import { openImageViewer } from '/shared/image-viewer.js';
import { creditCaptions, followCaptions, questionCaptions } from '/shared/social-follow.js';
import { videoTexts } from '/shared/social.js';
import { makeVideo, unlockAudio } from '/shared/social-video.js';
import { FLAG_ISO } from '/shared/flags.js';
import { trackShape } from '/shared/circuits-info.js';
import { loadTeamLogos } from '/shared/team-logos.js';
import { $, $$, esc, api, icon, toast, toggle, schedList, glide, state, store, SIG, IOS, installed, musicField, bindMusic, shareClip, clipFile } from './ui.js';
import { packDraftImages } from '/shared/post-draft.js';
import { renderPublish, refreshTexts, resetPublish, confirmPublish, followSent, planNets, openX, xCanvases } from './publish.js';

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
// Tracé du circuit d'une séance (API MultiViewer, l'année d'avant si besoin) : en filigrane des visuels
const tracks = new Map();
const trackOf = (year, key) => {
  if (!tracks.has(`${key}-${year}`)) {
    tracks.set(`${key}-${year}`, (async () => {
      for (const y of [year, year - 1]) {
        const r = await fetch(`https://api.multiviewer.app/api/v1/circuits/${key}/${y}`).catch(() => null);
        if (r?.ok) return r.json().catch(() => null);
      }
      return null;
    })());
  }
  return tracks.get(`${key}-${year}`);
};
// Style des visuels : choix gardé sur l'appareil
if (state.tv === undefined) state.tv = !!store.get('tvstyle')?.v;
export async function assets(d) {
  await Promise.all(['800 40px "Saira Condensed"', '700 40px "Saira Condensed"', '600 30px "Titillium Web"', '400 30px "Titillium Web"', '700 30px "JetBrains Mono"',
    ...(state.tv ? ['italic 900 40px "Barlow Condensed"', 'italic 800 40px "Barlow Condensed"', '700 20px "Chakra Petch"', '600 20px "Chakra Petch"'] : [])].map((f) => document.fonts.load(f).catch(() => {})));
  const photos = {};
  if (state.photos) await Promise.all((d.rows || []).slice(0, 3).map(async (r) => { photos[r.num] = await headshot(r.headshot); }));
  const iso = d.iso || FLAG_ISO[String(d.country || '').toUpperCase()];
  const [flag, logos, track] = await Promise.all([iso ? loadImage(`https://flagcdn.com/${d.post === 'raceweek' ? 'w1280' : 'w160'}/${iso}.png`) : null, loadTeamLogos(loadImage), d.circuitKey ? trackOf(d.year, d.circuitKey) : null]);
  return { photos, flag, logos, signature: SIG, shape: trackShape(track), style: state.tv ? 'tv' : null };
}

// Post : Instagram, Facebook, Threads et Bluesky ; X : ses 4 images et son texte, publiés dans l'appli X ;
// Lien (news avec un article) : texte et lien seuls, la carte de l'article affichée par le réseau
const FORMATS = [['ig', 'Post'], ['story', 'Story'], ['x', 'X']];
// Vidéo des visuels (posts sans vidéo à eux : résultats, avant-course, championnat, saison…) : les images
// gardées, au format story, enchaînées avec un fondu ; pour TikTok, YouTube Shorts et les Reels
const SLIDES_VIDEO = () => `<h3 class="section">Vidéo des visuels</h3>${musicField('slides', 'depart')}<div class="row"><button class="btn" id="mkvid">${icon('video')}Créer la vidéo</button><button class="btn" id="sharevid" disabled>${icon('share')}Partager</button></div>
  <p class="hint" id="vidst">Les images gardées, au format story, environ 3 s chacune. Garder l'écran allumé pendant l'enregistrement.</p>
  <video id="vid" controls playsinline hidden></video>`;

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
const dropDraft = () => { if (draftId) api('drafts/remove', { method: 'POST', body: JSON.stringify({ id: draftId }) }).catch(() => {}); draftId = null; };

const STEPS = [['contenu', 'Contenu'], ['visuels', 'Visuels'], ['video', 'Vidéo'], ['publier', 'Publier']];

// back : retour ; title / subtitle : en-tête ; head : réglages propres au post (HTML, étape Contenu) ;
// vhead : fabrication ou choix de la vidéo (étape Vidéo) ; note : remarque sur les données (étape Visuels) ; data : données des visuels ; caps(d) : textes
// des données d (sans ce que montrent les images écartées) ; bind(redraw) : branchement des réglages ;
// record : entrée du journal ; video() : vidéo jointe au post ; link() : article { url, title, description }
// pour un post « lien » (format Lien) ; twin : post jumeau publié en même temps, au choix
// { label(), data(), record() } (ses visuels et ses textes faits d'office, sans retouche) ; draft : brouillon
// repris (drafts.js), mis à jour par « Brouillon » et effacé une fois le post publié ou programmé
export function editor({ back, title, subtitle = '', head = '', vhead = '', note = '', data, caps, bind = () => {}, record, video = () => null, link = null, twin = null, draft = null }) {
  const formats = link ? [...FORMATS, ['link', 'Lien']] : FORMATS;
  // Post du compte Paddock Live : préparé ici, publié à la main (étape « Exporter », sans les options de Benjy)
  const app = data().post === 'app';
  // Post sans vidéo à lui : vidéo de ses visuels, fabriquée ici
  const own = !vhead.trim();
  let slideClip = null;
  if (own) { vhead = SLIDES_VIDEO(); video = () => slideClip; }
  if (!formats.some(([k]) => k === state.fmt)) state.fmt = 'ig';
  let canvases = [];
  let edited = { ...draft?.edited };   // textes retouchés à la main : gardés en changeant de format
  state.skip = new Set(draft?.skip);   // images écartées de ce post (toutes publiées par défaut)
  draftId = draft?.id || null;
  resetPublish(record?.()?.kind || 'post');
  const root = $('#app');
  const steps = STEPS.filter(([k]) => (k === 'contenu' ? head.trim() : k === 'video' ? vhead.trim() : true));
  root.className = 'shell editing';
  root.innerHTML = `<header class="appbar"><button class="iconbtn" id="back" aria-label="Retour">${icon('back')}</button>
      <div class="titles"><b>${esc(title)}</b>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div>
      <button class="btn small" id="savedraft" title="Garder ce post pour plus tard (aussi dans l'appli)">${icon('pen')}Brouillon</button></header>
    <main class="page">
      <nav class="steps" id="steps">${steps.map(([k, v]) => `<button data-go="${k}"><i></i><span>${app && k === 'publier' ? 'Exporter' : v}</span></button>`).join('')}</nav>
      ${head.trim() ? `<section class="panel" data-in="contenu">${head}</section>` : ''}
      ${note ? `<p class="hint" data-in="visuels">${esc(note)}</p>` : ''}
      <div class="seg wide" id="fmt" data-in="visuels">${formats.map(([k, v]) => `<button data-fmt="${k}" class="${state.fmt === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div id="main" class="preview" data-in="visuels"></div>
      <section class="panel" id="opts" data-in="visuels">
        <h3 class="section">Options</h3>
        ${toggle('photos', 'Photos des pilotes', state.photos)}
        ${toggle('tvstyle', 'Style « Télé premium » (fibre de carbone, chiffres or)', state.tv)}
        ${toggle('follow', 'Image « Abonnez-vous »', state.follow, '', state.question ? 'disabled' : '')}
        ${toggle('question', 'Question pour faire réagir', state.question, '', state.follow ? 'disabled' : '')}
      </section>
      ${vhead.trim() ? `<section class="panel" data-in="video">${vhead}<p class="hint">Facultatif : sans vidéo, ce sont les visuels qui sont publiés.</p></section>` : ''}
      <section class="panel" id="exportbox" data-in="publier" hidden></section>
      <section id="netsbox" data-in="publier"></section>
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
    $('#next').innerHTML = nx ? `${esc(app && nx[0] === 'publier' ? 'Exporter' : nx[1])}${icon('next')}` : '';
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
    let base = caps(keptData(d, skip, 'ig'));
    if (state.question && !app && !skip.has('question')) base = questionCaptions(base, d, SIG);
    if (state.follow && !app && !skip.has('abonnement')) base = followCaptions(base, d, SIG);
    if (!base.bsky) base = { ...base, bsky: base.x };
    // Mention « Fait par IA avec l'appli », sauf pour les posts écrits à la main ; textes de la vidéo tirés des autres
    const out = app || record?.()?.kind === 'manual' ? base : creditCaptions(base);
    return { ...videoTexts(out), ...out, ...mine };
  };
  const redraw = async (changed = false) => {
    if (changed) edited = {};
    const d = data();
    const c = texts(d);
    const linkTab = state.fmt === 'link';
    const slides = linkTab ? [] : slidesFor(d, { fmt: state.fmt, follow: state.follow, question: state.question });
    const lk = link?.() || null;
    $('#main').innerHTML = linkTab ? `<div class="linkcard"><div id="lcimg"></div><small>${esc(new URL(lk.url).hostname.replace(/^www\./, ''))}</small><b>${esc(lk.title)}</b><p>${esc(lk.description)}</p></div>
      <p class="hint">Carte de l'article sur Facebook, Threads et X ; titre et résumé sur Bluesky ; Instagram : visuels de l'onglet Post.</p>
      <div class="row"><button class="btn small" id="xlink">${icon('send')}Ouvrir X avec le lien</button></div>` : `<div class="slides ${state.fmt}">${slides.map((sl) => `<figure class="sl"><canvas data-slide="${sl}" title="${esc(slideName(sl))} : voir en grand"></canvas>
        <label class="pick"><input type="checkbox" data-pick="${sl}" ${state.skip.has(sl) ? '' : 'checked'}><span data-num></span>${esc(slideName(sl))}</label></figure>`).join('')}</div>`;
    // Étape Publier : une carte par réseau (formats, texte, compte), ou l'export du compte Paddock Live
    const vid = video();
    $('#go').hidden = app;
    $('#plan').hidden = app;
    for (const el of [$('#opts'), $('#share'), $('#dl')]) if (el) el.hidden = linkTab || (app && el.id === 'opts');   // post « lien » : pas de visuels
    $('#exportbox').hidden = !app;
    if (app) {
      $('#exportbox').innerHTML = `<h3 class="section">Exporter</h3><p class="hint">Compte @paddockliveapp : à publier à la main, depuis les applis des réseaux. Images : ${IOS ? 'Partager, puis « Enregistrer les images »' : 'Télécharger (ou Partager)'} ; vidéo : « Partager » à l'étape Vidéo ; textes : « Copier » sous chacun.</p>
        <div class="row"><button class="btn primary" id="expshare">${icon('share')}Partager les images</button>${IOS ? '' : `<button class="btn" id="expdl">${icon('download')}Télécharger les images</button>`}</div>`;
      $('#expshare').onclick = () => $('#share').click();
      if ($('#expdl')) $('#expdl').onclick = () => $('#dl').click();
    }
    const xOpen = async () => openX(xCanvases(d, await assets(d)), $('#cap-x').value, vid);
    renderPublish($('#netsbox'), { c, edited, vid, lk, title: record?.()?.title, app, x: xOpen });
    // Post jumeau à publier aussi : ses textes faits d'office (toutes ses images gardées)
    const ctx = { d, record: record?.(), vid, lk, o: () => assets(d),
      twin: () => (twin ? { data: twin.data(), record: twin.record(), texts: texts(twin.data(), new Set(), {}) } : null),
      onSent: (at, mode, tkText) => {
        toast(`${mode === 'now' ? 'Envoyé : publication dans la minute, vous pouvez quitter la page' : `Programmé pour le ${new Date(at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}`}${tkText ? '. Texte TikTok copié : collez-le dans la description du brouillon' : ''}`, 'ok');
        dropDraft();
        followSent($('#schedlist'), planNets(), at);
      } };
    $('#go').onclick = () => confirmPublish(ctx, 'now');
    $('#plan').onclick = () => confirmPublish(ctx, 'later');
    if (linkTab) {
      canvases = [];
      articlePhoto(lk.url).then((src) => { if (src && $('#lcimg')) $('#lcimg').innerHTML = `<img src="${src}" alt="">`; });
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
        refreshTexts(texts(d), edited);
      };
    });
    $('#share').onclick = () => share(canvases, state.fmt === 'x' ? $('#cap-x').value : state.fmt === 'ig' ? $('#cap-instagram').value : '');
    // iPhone : « Partager » propose aussi « Enregistrer les images » (Photos)
    if ($('#dl')) $('#dl').onclick = () => download(canvases);
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
  $('#tvstyle').onchange = (e) => { state.tv = e.target.checked; store.set('tvstyle', state.tv); redraw(); };
  // Question et abonnement : un seul appel par post
  $('#follow').onchange = (e) => { state.follow = e.target.checked; $('#question').disabled = state.follow; redraw(true); };
  $('#question').onchange = (e) => { state.question = e.target.checked; $('#follow').disabled = state.question; redraw(true); };
  // Vidéo des visuels : images gardées au format story, enchaînées (même vidéo que dans l'appli)
  if (own) {
    let clip = null;
    const name = `video-${record?.()?.kind || 'post'}`;
    const track = bindMusic('slides');
    $('#mkvid').onclick = async () => {
      unlockAudio();   // pendant le toucher, avant toute attente (sinon vidéo muette sur iPhone)
      $('#mkvid').disabled = true;
      try {
        const d = data();
        const o = await assets(d);
        const list = chosenSlides(slidesFor(d, { fmt: 'story', follow: state.follow, question: state.question }), [...state.skip]);
        const slides = list.map((sl) => drawSlide(document.createElement('canvas'), sl, 'story', d, { ...o, slides: list }));
        clip = await makeVideo(slides, { ...track(), onProgress: (p) => { $('#vidst').textContent = `Enregistrement… ${Math.round(p * 100)} %`; } });
        $('#vid').src = URL.createObjectURL(clip.blob); $('#vid').hidden = false;
        $('#sharevid').disabled = false;
        slideClip = clipFile(clip, name);
        $('#vidst').textContent = `Vidéo prête : ${(clip.blob.size / 1e6).toFixed(1).replace('.', ',')} Mo${clip.silent ? ' · sans son : le navigateur a bloqué la musique, recommencez' : ''}${slideClip ? ' · jointe au post : Reel, vidéo, TikTok et Short à choisir à l\'étape Publier' : ' · format WebM : à partager seulement (publication en MP4)'}`;
        redraw();
      } catch (err) { $('#vidst').textContent = err.message; } finally { $('#mkvid').disabled = false; }
    };
    $('#sharevid').onclick = () => clip && shareClip(clip, name);
  }
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

// Page plein écran avec retour (bouton, geste retour de Safari, glissement depuis le bord)
export function enterPage(back) {
  scrollTo(0, 0);
  if (!history.state?.editor) history.pushState({ editor: 1 }, '');
  leave = back;
}
export { goBack };
