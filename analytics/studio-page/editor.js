// Studio : éditeur d'un post (visuels, textes, publication, programmation, partage), commun aux news,
// séances et posts de la saison.
import { slidesFor, drawSlide, slideName, chosenSlides, keptData } from '/shared/social-draw.js';
import { openImageViewer } from '/shared/image-viewer.js';
import { followCaptions, questionCaptions } from '/shared/social-follow.js';
import { xLength } from '/shared/social.js';
import { FLAG_ISO } from '/shared/flags.js';
import { loadTeamLogos } from '/shared/team-logos.js';
import { $, $$, esc, api, icon, toast, toggle, sheet, schedList, glide, state, session, SIG, NET_NAMES, IOS, installed } from './ui.js';
import { tiktokPanel, tiktokProblem, tiktokChoice, TIKTOK_PRIVACY } from './tiktok.js';

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
  ['facebook', () => 'Texte Facebook (avec le lien de l\'article)', 8],
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

// back : retour ; title / subtitle : en-tête ; head : réglages propres au post (HTML), au-dessus des
// visuels ou en dessous (below) ; data : données des visuels ; caps(d) : textes des données d (sans ce
// que montrent les images écartées) ; bind(redraw) :
// branchement des réglages ; record : entrée du journal ; video() : vidéo du créateur jointe au post ;
// link() : article { url, title, description } pour un post « lien » (onglet Lien)
export function editor({ back, title, subtitle = '', head = '', below = false, data, caps, bind = () => {}, record, video = () => null, link = null }) {
  const formats = link ? [...FORMATS, ['link', 'Lien']] : FORMATS;
  if (!formats.some(([k]) => k === state.fmt)) state.fmt = 'ig';
  let canvases = [];
  let edited = {};          // textes retouchés à la main : gardés en changeant de format
  state.skip = new Set();   // images écartées de ce post (toutes publiées par défaut)
  const root = $('#app');
  root.className = 'shell editing';
  root.innerHTML = `<header class="appbar"><button class="iconbtn" id="back" aria-label="Retour">${icon('back')}</button>
      <div class="titles"><b>${esc(title)}</b>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div></header>
    <main class="page">
      <div class="seg wide" id="fmt">${formats.map(([k, v]) => `<button data-fmt="${k}" class="${state.fmt === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      ${head.trim() && !below ? `<section class="panel">${head}</section>` : ''}
      <div id="main" class="preview"></div>
      ${head.trim() && below ? `<section class="panel">${head}</section>` : ''}
      <section class="panel" id="opts">
        <h3 class="section">Options</h3>
        ${toggle('photos', 'Photos des pilotes', state.photos)}
        ${toggle('follow', 'Image « Abonnez-vous »', state.follow)}
        ${toggle('question', 'Question pour faire réagir', state.question)}
      </section>
      <div id="texts"></div>
      <section class="panel" id="netsbox"></section>
      <div id="schedlist"></div>
    </main>
    <div class="actionbar"><button class="btn primary" id="go">${icon('send')}Publier</button><button class="btn" id="plan">${icon('clock')}Programmer</button><button class="iconbtn boxed" id="share" aria-label="Partager ou enregistrer">${icon('share')}</button>${IOS ? '' : `<button class="iconbtn boxed" id="dl" aria-label="Télécharger">${icon('download')}</button>`}</div>`;
  scrollTo(0, 0);
  // Entrée dans l'historique : le geste « retour » ramène à la liste au lieu de quitter la page
  if (!history.state?.editor) history.pushState({ editor: 1 }, '');
  leave = back;

  // Textes : question et abonnement seulement si leur image est gardée ; retouches à la main conservées
  const texts = (d) => {
    let base = caps(keptData(d, state.skip, state.fmt));
    if (state.question && !state.skip.has('question')) base = questionCaptions(base, d, SIG);
    if (state.follow && !state.skip.has('abonnement')) base = followCaptions(base, d, SIG);
    const c = { ...base, ...edited };
    if (!c.bsky) c.bsky = c.x;
    return c;
  };
  const redraw = async (changed = false) => {
    if (changed) edited = {};
    const d = data();
    const c = texts(d);
    const linkTab = state.fmt === 'link';
    const slides = linkTab ? [] : slidesFor(d, { fmt: state.fmt, follow: state.follow, question: state.question });
    const lk = linkTab ? link() : null;
    $('#main').innerHTML = linkTab ? `<div class="linkcard"><div id="lcimg"></div><small>${esc(new URL(lk.url).hostname.replace(/^www\./, ''))}</small><b>${esc(lk.title)}</b><p>${esc(lk.description)}</p></div>
      <p class="hint">Carte de l'article sur Facebook, Threads et X ; titre et résumé sur Bluesky.</p>
      <div class="row"><button class="btn small" id="xlink">${icon('send')}Ouvrir X avec le lien</button></div>` : `<div class="slides ${state.fmt}">${slides.map((sl) => `<figure class="sl"><canvas data-slide="${sl}" title="${esc(slideName(sl))} : voir en grand"></canvas>
        <label class="pick"><input type="checkbox" data-pick="${sl}" ${state.skip.has(sl) ? '' : 'checked'}><span data-num></span>${esc(slideName(sl))}</label></figure>`).join('')}</div>`;
    const xTab = state.fmt === 'x';
    const shown = ([k]) => (linkTab ? ['facebook', 'threads', 'bsky', 'x'].includes(k) : xTab ? k === 'x' || (k === 'comment' && c[k]) : k !== 'x' && (k === 'instagram' || k === 'threads' || k === 'bsky' || c[k]));
    $('#texts').innerHTML = `<section class="panel"><h3 class="section">Textes</h3>${CAPS.filter(shown).map(([k, label, rows, max = 0, limit = 0], i) => `
      <details class="cap" ${i === 0 ? 'open' : ''}><summary><span>${esc(label(c))}</span><small data-count="${k}"></small></summary>
        <textarea id="cap-${k}" rows="${rows}" ${max ? `maxlength="${max}"` : ''} data-limit="${limit || max}">${esc(c[k])}</textarea>
        ${k === 'comment' ? `<div class="row end"><button class="btn small" id="copycomment">${icon('copy')}Copier</button></div>` : ''}</details>`).join('')}</section>`;
    const count = (k) => {
      const el = $(`#cap-${k}`);
      const n = k === 'x' ? xLength(el.value) : el.value.length;
      const lim = Number(el.dataset.limit) || 0;
      $(`[data-count="${k}"]`).textContent = lim ? `${n} / ${lim}` : `${n}`;
      $(`[data-count="${k}"]`).classList.toggle('err', !!lim && n > lim);
    };
    let prep = 0;
    const prepare = () => { if (xTab || linkTab) for (const k of ['x', 'comment']) if ($(`#cap-${k}`)) prepareX($(`#cap-${k}`).value, record?.()?.title); };
    for (const k of CAPS.map(([x]) => x).filter((x) => $(`#cap-${x}`))) {
      count(k);
      $(`#cap-${k}`).oninput = (e) => { edited[k] = e.target.value; count(k); clearTimeout(prep); prep = setTimeout(prepare, 800); };
    }
    prepare();
    // Avec une vidéo : Reel, vidéo Facebook et Threads, et aussi brouillon TikTok et Short YouTube (à cocher).
    // Format Story : stories Instagram et Facebook (Threads et Bluesky n'en ont pas)
    const vid = video();
    const story = !vid && state.fmt === 'story';
    const list = story ? [['instagram-story', 'Story Instagram'], ['facebook-story', 'Story Facebook']]
      : linkTab ? [['facebook', 'Facebook'], ['threads', 'Threads'], ['bluesky', 'Bluesky']]
      : [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['threads', 'Threads'], ['bluesky', 'Bluesky'], ...(vid ? [['tiktok', 'TikTok'], ['youtube', 'YouTube Shorts']] : [])];
    $('#go').innerHTML = `${icon('send')}${xTab ? 'Ouvrir X' : 'Publier'}`;
    $('#plan').hidden = xTab;
    $('#go').disabled = false;
    $('#netsbox').hidden = xTab;
    $('#texts').hidden = story;   // stories : pas de texte publié
    for (const el of [$('#opts'), $('#share'), $('#dl')]) if (el) el.hidden = linkTab;   // post « lien » : pas de visuels
    $('#netsbox').innerHTML = xTab ? '' : `<h3 class="section">Publier sur</h3>${list.map(([k, v]) => {
      const acc = session.me?.[k.replace('-story', '')];
      return `<label class="switch net"><span><b>${v}</b><small>${esc(acc || 'non connecté')}</small><em class="st" data-st="${k}"></em></span><input type="checkbox" role="switch" data-net="${k}" ${acc ? (k === 'tiktok' || k === 'youtube' ? '' : 'checked') : 'disabled'}></label>`;
    }).join('')}${vid ? '<div id="tkbox" class="tkbox" hidden></div>' : ''}${vid || story ? `<p class="hint">${vid ? 'Vidéo sur Instagram, Facebook, Threads, TikTok et YouTube (privé) ; visuels sur Bluesky.' : 'Une story par image, visible 24 heures.'}</p>` : ''}`;
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
      };
    });
    $('#go').onclick = () => (xTab ? openX(canvases, $('#cap-x').value) : publishAll(d, o, record?.(), vid));
    $('#plan').onclick = () => schedulePanel(d, o, record?.(), vid);
    $('#share').onclick = () => share(canvases, state.fmt === 'x' ? $('#cap-x').value : state.fmt === 'ig' ? $('#cap-instagram').value : '');
    // iPhone : « Partager » propose aussi « Enregistrer les images » (Photos)
    if ($('#dl')) $('#dl').onclick = () => download(canvases);
    if ($('#copycomment')) $('#copycomment').onclick = async () => { try { await navigator.clipboard.writeText(trackedX.get($('#cap-comment').value) || $('#cap-comment').value); toast('Commentaire copié'); } catch { /* presse-papiers refusé */ } };
  };
  $('#back').onclick = goBack;
  $$('[data-fmt]').forEach((b) => { b.onclick = () => { state.fmt = b.dataset.fmt; $$('[data-fmt]').forEach((x) => x.classList.toggle('on', x === b)); glide(); redraw(); }; });
  $('#photos').onchange = (e) => { state.photos = e.target.checked; redraw(); };
  $('#follow').onchange = (e) => { state.follow = e.target.checked; redraw(true); };
  $('#question').onchange = (e) => { state.question = e.target.checked; redraw(true); };
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

// Vers X (un lien ne transmet que le texte) : menu de partage avec les images et le texte quand le
// navigateur sait partager des fichiers (choisir X ; texte aussi copié, à coller si l'appli ne le reprend
// pas). Sinon : appli X sur téléphone, x.com sur ordinateur avec les images téléchargées
// Texte X (et premier commentaire) avec ses liens suivis (clics comptés), préparé à l'affichage : le
// partage part dès le toucher
const trackedX = new Map();
function prepareX(raw, title) {
  if (!/https?:\/\//.test(raw) || trackedX.has(raw)) return;
  trackedX.set(raw, raw);
  api('links', { method: 'POST', body: JSON.stringify({ net: 'x', text: raw, title }) }).then((r) => { if (r?.text) trackedX.set(raw, r.text); }).catch(() => trackedX.delete(raw));
}
async function openX(canvases, raw) {
  const text = trackedX.get(raw) || raw;
  navigator.clipboard?.writeText(text).catch(() => {});
  const files = await Promise.all(canvases.map(async (cv, i) => new File([await toBlob(cv)], `x-${i + 1}.png`, { type: 'image/png' })));
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files, text }); } catch { /* partage annulé */ }
    return;
  }
  if (IOS || /Android/.test(navigator.userAgent)) { location.href = `twitter://post?message=${encodeURIComponent(text)}`; return; }
  open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  download(canvases);
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
const textOf = (n) => $(`#cap-${n === 'threads' ? 'threads' : n === 'bluesky' ? 'bsky' : n === 'facebook' && $('#cap-facebook') ? 'facebook' : 'instagram'}`).value;
const commentOf = (n) => (n !== 'instagram' && $('#cap-comment')?.value.trim()) || '';
// JPEG de moins de max octets (qualité baissée au besoin)
async function fitJpeg(cv, max) {
  let b = null;
  for (const q of [0.92, 0.85, 0.75, 0.6, 0.45]) { b = await toBlob(cv, 'image/jpeg', q); if (b.size <= max) break; }
  return b;
}
// Visuels : format Instagram (Instagram, Facebook, Threads) ou Story (stories) ; Bluesky : 4 au format X, moins de 1 Mo
const isStory = (n) => n.endsWith('-story');
async function postImages(d, o, nets, maxIg = Infinity) {
  // Images gardées seulement (sommaire et numéros suivent)
  const draw = (fmt, max, n = 99) => {
    const list = chosenSlides(slidesFor(d, { fmt, follow: state.follow, question: state.question }), [...(state.skip || [])]).slice(0, n);
    return Promise.all(list.map((sl) => fitJpeg(drawSlide(document.createElement('canvas'), sl, fmt, d, { ...o, slides: list }), max)));
  };
  return { ig: nets.some((n) => n !== 'bluesky') ? await draw(nets.some(isStory) ? 'story' : 'ig', maxIg) : [], x: nets.includes('bluesky') ? await draw('x', 950 * 1024, 4) : [] };
}

// Post confié au serveur (visuels ou vidéo, textes), publié à l'heure `at` même page fermée
// video : envoyée à tous les réseaux sauf Bluesky (visuels) ; tk : réglages d'une publication directe TikTok ;
// link : post « lien » sans visuels (carte de l'article)
async function queuePost(d, o, nets, at, record, video = null, tk = null, link = null) {
  const imgs = link ? { ig: [], x: [] } : await postImages(d, o, video ? nets.filter((n) => n === 'bluesky') : nets, 1.3e6);
  const form = new FormData();
  form.append('at', String(at));
  form.append('title', record?.title || d.title || d.gp || 'Post');
  form.append('record', JSON.stringify(record));
  form.append('posts', JSON.stringify(nets.map((n) => (isStory(n) ? { network: n } : { network: n, text: textOf(n), comment: link ? '' : commentOf(n) }))));
  if (link) form.append('link', JSON.stringify(link));
  imgs.ig.forEach((b, i) => form.append('ig', b, `image-${i + 1}.jpg`));
  imgs.x.forEach((b, i) => form.append('x', b, `x-${i + 1}.jpg`));
  if (video) form.append('video', video, video.type === 'video/quicktime' ? 'video.mov' : 'video.mp4');
  if (tk) form.append('tiktok', JSON.stringify(tk));
  return (await api('schedule', { method: 'POST', body: form })).item;
}

// Publication programmée : envoyée au serveur, publiée à l'heure même page fermée
const localValue = (t) => new Date(t - t.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
function schedulePanel(d, o, record = null, video = null, link = null) {
  const nets = checkedNets();
  if (!nets.length) { toast('Cochez au moins un réseau', 'bad'); return; }
  const tk = nets.includes('tiktok') ? tiktokChoice() : null;
  if (nets.includes('tiktok') && tiktokProblem()) { toast(tiktokProblem(), 'bad'); return; }
  const t = new Date(Date.now() + 3600e3);
  t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15, 0, 0);
  const dlg = sheet('Programmer la publication', `<label class="field"><span>Date et heure</span><input type="datetime-local" id="when" value="${localValue(t)}"></label>
    <p class="hint">Sur ${esc(nets.map((n) => NET_NAMES[n]).join(', '))}, même page fermée (7 jours à l'avance au plus).</p>
    <p class="hint" id="schedst"></p>
    <button class="btn primary wide" id="dosched">${icon('clock')}Programmer</button>`);
  $('#dosched', dlg).onclick = async () => {
    const at = new Date($('#when', dlg).value).getTime();
    const st = $('#schedst', dlg);
    if (!Number.isFinite(at) || at < Date.now() - 60e3) { st.className = 'hint err'; st.textContent = 'Choisissez une heure à venir'; return; }
    if (!confirm(`Programmer pour le ${new Date(at).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })} sur : ${nets.map((n) => NET_NAMES[n]).join(', ')} ?\n\nLes posts seront publics à cette heure-là.`)) return;
    const btn = $('#dosched', dlg);
    btn.disabled = true;
    st.className = 'hint';
    st.textContent = video ? 'Envoi de la vidéo…' : 'Envoi des visuels…';
    try {
      await queuePost(d, o, nets, at, record, video, tk, link);
      dlg.close();
      toast(`Programmé pour le ${new Date(at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}`, 'ok');
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

async function publishAll(d, o, record = null, video = null, link = null) {
  const nets = checkedNets();
  if (!nets.length) { toast('Cochez au moins un réseau', 'bad'); return; }
  const stories = nets.some(isStory);
  // TikTok : publication directe avec les réglages choisis, sinon brouillon ; rien n'est envoyé sans confirmation
  const tk = nets.includes('tiktok') ? tiktokChoice() : null;
  if (nets.includes('tiktok') && tiktokProblem()) { toast(tiktokProblem(), 'bad'); return; }
  if (!confirm(`Publier maintenant sur : ${nets.map((n) => NET_NAMES[n] || n).join(', ')} ?\n\n${stories ? 'Les stories seront publiques pendant 24 heures' : `Les posts seront publics${[nets.includes('tiktok') && `TikTok : ${tk ? `publication directe, visible par : ${TIKTOK_PRIVACY[tk.privacy]}` : 'en brouillon'}`, nets.includes('youtube') && 'YouTube : en privé'].filter(Boolean).map((x, i, a) => `${i ? ' ; ' : ' ('}${x}${i === a.length - 1 ? ')' : ''}`).join('')}`}.`)) return;
  const go = $('#go');
  go.disabled = true;
  // Confié au serveur (visuels ou vidéo envoyés une fois) : publié dans la minute, même page fermée
  for (const n of nets) { const st = $(`[data-st="${n}"]`); st.className = 'st'; st.textContent = video ? 'Envoi de la vidéo au serveur…' : 'Envoi au serveur…'; }
  try {
    const item = await queuePost(d, o, nets, Date.now(), record, video, tk, link);
    for (const n of nets) $(`[data-st="${n}"]`).textContent = 'Publication dans la minute';
    toast('Envoyé : publication dans la minute, vous pouvez quitter la page', 'ok');
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
