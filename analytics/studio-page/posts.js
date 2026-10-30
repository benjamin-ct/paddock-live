// Studio : posts des news (et récap de la semaine) et des séances (résultats, avant-course,
// championnat, flash). Chargé à l'ouverture d'un post.
import { decodeBody } from '/shared/news-collect.js';
import { bigNews, newsPost, newsCaptions, newsKind, similarArticles, mainTeam, mentionsTeam, LOOKS, OTHER_SERIES, NEWS_BADGES, NO_BADGE } from '/shared/social-news.js';
import { newsTags } from '/shared/news.js';
import { postData, captions } from '/shared/social.js';
import { preraceData, champData, flashEvents, flashData, moreCaptions, FLASH_KINDS } from '/shared/social-more.js';
import { builtinNomination } from '/shared/tyres.js';
import { CHAMPIONSHIP, parseSeasons, parseDocumentList, pickEvent } from '/shared/fia-list.js';
import { gridDocument, parseStartingGrid } from '/shared/fia-grid.js';
import { extractArticle } from '/shared/article.js';
import { recapData, seasonCaptions } from '/shared/social-season.js';
import { $, $$, esc, api, ago, icon, toggle, toast, glide, state, SIG, NET_NAMES, musicField, bindMusic, clipFile, shareClip } from './ui.js';
import { toFrench, freshNews, cachedNews, latestDrivers, loadState, lapsOf, rememberDrivers, SESSION_FR } from './data.js';
import { editor, assets } from './editor.js';
import { photoPicker, cropImage, bitmapUrl, photoGrid, addFiles, picked } from './photos.js';
import { makeAnimation, makeVideo, unlockAudio } from '/shared/social-video.js';
import { videoCover, newsPhotoBox, FORMATS, slidesFor, chosenSlides, drawSlide } from '/shared/social-draw.js';
import { newsFrame, newsVideoTiming } from '/shared/social-news-video.js';
import { makeClipVideo, CLIP_MAX } from '/shared/social-clip-video.js';
import { appPost, appCaptions } from '/shared/social-app.js';

// Résumé détaillé : page de l'article lue par le serveur, texte extrait ici, points clés rédigés par
// l'IA du serveur (reformulés, jamais recopiés)
async function detailedSummary(it) {
  const html = await decodeBody(await api(`page?u=${encodeURIComponent(it.link)}`, { raw: true }));
  const a = extractArticle(html, it.link);
  const text = a.blocks.map((b) => b.h || b.p || '').filter(Boolean).join('\n\n').slice(0, 12000);
  if (text.length < 400) throw new Error('Pas de texte lisible sur cette page (vidéo, accès réservé…)');
  const j = await api('summary', { method: 'POST', body: JSON.stringify({ title: it.title || a.title, text }) });
  if (!Array.isArray(j.points)) throw new Error('Résumé indisponible pour le moment');
  return j.points;
}

// Empreinte d'une photo (8 × 8 en gris, comparée à la moyenne) : la même photo reprise par deux médias, à
// une autre taille ou recadrée de peu, a une empreinte presque identique
function fingerprint(image) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, 8, 8);
  const px = ctx.getImageData(0, 0, 8, 8).data;
  const g = Array.from({ length: 64 }, (_, i) => px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11);
  const mean = g.reduce((n, v) => n + v, 0) / 64;
  return g.map((v) => (v > mean ? 1 : 0));
}
const sameFingerprint = (a, b) => a.reduce((n, v, i) => n + (v !== b[i]), 0) <= 5;

// ---------- Photo libre de droits (Wikimedia Commons, Flickr) à la place des portraits ----------
// Recherche proposée : le premier pilote cité, sinon l'écurie, sinon la F1
// Proportions du cadre de la photo de couverture sur le visuel du format choisi (recadrage « Visuel »)
const coverFrame = () => { const f = FORMATS[state.fmt] || FORMATS.ig; const b = newsPhotoBox(f.w, f.h); return b.w / b.h; };
const freeQuery = (d) => (d.drivers?.[0] ? `${d.drivers[0].first} ${d.drivers[0].last}` : d.teams?.find((t) => t.key !== 'fia')?.name || 'Formula 1');
const PHOTO_ROW = (p) => `<div class="row"><button class="btn small" id="${p}photo">${icon('image')}Photo libre de droits</button><button class="btn small" id="${p}photocrop" hidden>${icon('image')}Recadrer</button><button class="btn small" id="${p}photodel" hidden>${icon('close')}Retirer</button><span class="hint" id="${p}photost"></span></div>`;
// onPhoto({ image, credit } ou null) : photo choisie, recadrée ou retirée
function bindPhoto(p, getD, onPhoto) {
  let cur = null;   // photo choisie : { image (originale), credit }
  $(`#${p}photo`).onclick = () => photoPicker(freeQuery(getD()), (pic) => { cur = pic; onPhoto(pic); $(`#${p}photost`).textContent = pic.credit; $(`#${p}photodel`).hidden = false; $(`#${p}photocrop`).hidden = false; });
  $(`#${p}photocrop`).onclick = async () => { const image = cur && await cropImage(cur.image, coverFrame()); if (image) onPhoto({ image, credit: cur.credit }); };
  $(`#${p}photodel`).onclick = () => { cur = null; onPhoto(null); $(`#${p}photost`).textContent = ''; $(`#${p}photodel`).hidden = true; $(`#${p}photocrop`).hidden = true; };
}

// Vos photos (téléphone, ordinateur), plusieurs à la fois : ajoutées aux photos du post, déjà choisies
const MINE = (p) => `<label class="btn small">${icon('image')}Vos photos<input type="file" accept="image/*" multiple id="${p}mine" hidden></label>`;
function bindMine(p, list, show, onChange) {
  $(`#${p}mine`).onchange = async (e) => {
    const bad = await addFiles(list, e.target.files || []);
    e.target.value = '';
    $(`#${p}artst`).textContent = bad ? `${bad} image${bad > 1 ? 's' : ''} illisible${bad > 1 ? 's' : ''}` : '';
    show(); onChange();
  };
}

// Votre vidéo (ex. un enregistrement d'écran), habillée aux couleurs du post à la place de son animation ;
// onPick(fichier, ou null une fois retirée)
const OWN_VIDEO = (p) => `<div class="field"><span>Votre vidéo <small>(facultatif, ex. un enregistrement d'écran : intégrée au visuel du post, ${CLIP_MAX} s au plus)</small></span>
    <div class="row"><label class="btn small">${icon('video')}Choisir une vidéo<input type="file" id="${p}vid" accept="video/mp4,video/quicktime" hidden></label><button class="btn small" id="${p}viddel" hidden>${icon('close')}Retirer</button><span class="hint" id="${p}vidst"></span></div>
    <video id="${p}vidprev" controls playsinline hidden></video></div>`;
function bindOwnVideo(p, onPick) {
  const prev = $(`#${p}vidprev`);
  $(`#${p}vid`).onchange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^video\/(mp4|quicktime)$/.test(file.type)) { $(`#${p}vidst`).textContent = 'Vidéo MP4 ou MOV seulement'; return; }
    if (file.size > 300e6) { $(`#${p}vidst`).textContent = `Trop lourde (${Math.round(file.size / 1e6)} Mo) : 300 Mo au plus`; return; }
    $(`#${p}vidst`).textContent = `${file.name} · ${(file.size / 1e6).toFixed(1).replace('.', ',')} Mo`;
    if (prev.src) URL.revokeObjectURL(prev.src);
    prev.src = URL.createObjectURL(file); prev.hidden = false;
    $(`#${p}viddel`).hidden = false;
    onPick(file);
  };
  $(`#${p}viddel`).onclick = () => { $(`#${p}vid`).value = ''; $(`#${p}vidst`).textContent = ''; $(`#${p}viddel`).hidden = true; prev.hidden = true; prev.removeAttribute('src'); onPick(null); };
}

// ---------- Vidéo de la news (TikTok, Reels, Shorts, story…), commune aux news et aux posts écrits ----------
// Style « Breaking news » quand la très grosse info est cochée (BREAKING, étape Contenu)
const BREAKING = (on) => toggle('brk', 'Très grosse info', on, 'Style « Breaking news » du visuel et de la vidéo');
const NEWS_VIDEO = () => `<h3 class="section">Vidéo de la news</h3>${musicField('news', 'flash')}<div class="row"><button class="btn" id="mkvid">${icon('video')}Créer la vidéo</button><button class="btn" id="sharevid" disabled>${icon('share')}Partager</button></div>
  <p class="hint" id="vidst">Garder l'écran allumé pendant l'enregistrement.</p>
  <video id="vid" controls playsinline hidden></video>`;
// onBreaking(on) : très grosse info cochée ou décochée à la main
// onClip(file) : vidéo prête (MP4), jointe au post pour la publier sur TikTok, Instagram, Facebook…
// source() : vidéo choisie (post écrit à la main), intégrée au visuel à la place de l'animation de la news
function bindNewsVideo(getD, onBreaking, onClip, source = () => null) {
  let clip = null;
  const name = () => (getD().breaking ? 'breaking-news' : 'actu-f1');   // nom du fichier
  const track = bindMusic('news');
  $('#brk').onchange = (e) => onBreaking(e.target.checked);
  $('#mkvid').onclick = async () => {
    unlockAudio();   // pendant le toucher, avant toute attente (sinon vidéo muette sur iPhone)
    $('#mkvid').disabled = true;
    try {
      const d = getD();
      const o = await assets(d);
      const src = source();
      const onProgress = (p) => { $('#vidst').textContent = `${src ? 'Habillage de votre vidéo' : 'Enregistrement'}… ${Math.round(p * 100)} %`; };
      clip = src ? await makeClipVideo(src, d, o, { ...track(), onProgress })
        : await makeAnimation((ctx, t, w, h) => newsFrame(ctx, w, h, d, o, t), newsVideoTiming(d).duration, { cover: (ctx, w, h) => videoCover(ctx, w, h, d, o), ...track(), onProgress });
      $('#vid').src = URL.createObjectURL(clip.blob); $('#vid').hidden = false;
      $('#sharevid').disabled = false;
      $('#vidst').textContent = `Vidéo prête : ${src ? '' : `${Math.round(newsVideoTiming(d).duration)} s, `}${(clip.blob.size / 1e6).toFixed(1).replace('.', ',')} Mo${clip.silent ? ' · sans son : le navigateur a bloqué la musique, recommencez' : ''}${clipFile(clip, name()) ? ' · jointe au post : Reel, vidéo, TikTok et Short à choisir à l\'étape Publier' : ' · format WebM : à partager seulement (publication en MP4)'}`;
      onClip(clipFile(clip, name()));
    } catch (err) { $('#vidst').textContent = err.message; } finally { $('#mkvid').disabled = false; }
  };
  $('#sharevid').onclick = () => clip && shareClip(clip, name());
}

export async function newsEditor(it, done, back) {
  const [title, summary] = await toFrench([{ text: it.title, from: it.lang }, { text: it.summary, from: it.lang }]);
  const failed = title === null || summary === null;
  let breaking = null;   // très grosse info choisie à la main (sinon : détectée)
  let made = null;       // vidéo Breaking news fabriquée (MP4), jointe au post
  let own = null;        // votre vidéo (fichier), habillée à la place de l'animation
  let pic = null;        // photo libre de droits choisie : { image, credit }
  const arts = [];       // photos trouvées et les vôtres : { image, url, pick, src } ; pick : rang choisi (0 : pas dans le post), le 1er en couverture (sans photo libre)
  const look = it.link && LOOKS.has(newsKind(it).key) ? newsKind(it).key : '';   // livrée ou tenue spéciale
  const make = async (t, s, p = '') => {
    const nd = newsPost(it, { title: t, summary: s, points: p, driverList: await latestDrivers(), sourceName: it.srcName });
    if (breaking !== null) nd.breaking = breaking;
    const on = picked(arts);
    if (pic) Object.assign(nd, pic);
    else if (on[0]) Object.assign(nd, on[0]);
    nd.gallery = pic ? on : on.slice(1);
    return nd;
  };
  let d = await make(title ?? it.title, summary ?? it.summary);
  editor({
    back,
    title: 'News',
    subtitle: `${it.srcName} · il y a ${ago(it.t)}`,
    head: `<div class="row"><span class="badge" style="background:${d.badge.color}">${esc(d.badge.label)}</span>${it.link ? `<a class="link" href="${esc(it.link)}" target="_blank" rel="noopener">Lire l'article ${icon('link')}</a>` : ''}</div>
      ${done ? `<p class="notice ok">${icon('check')}Déjà publiée le ${esc(new Date(done.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }))} sur ${esc(Object.keys(done.nets).map((n) => NET_NAMES[n] || n).join(', '))}</p>` : ''}
      <label class="field"><span>Titre</span><input type="text" id="ntitle" maxlength="160" value="${esc(d.title)}"></label>
      <label class="field"><span>Résumé</span><textarea id="nsum" rows="4" maxlength="400">${esc(d.summary)}</textarea></label>
      <label class="field"><span>Points clés, un par ligne <small>(images suivantes du carrousel)</small></span><textarea id="npoints" rows="5" maxlength="1600" placeholder="Facultatif : « Résumé détaillé » ou à écrire soi-même"></textarea></label>
      ${it.link ? `<div class="row"><button class="btn small" id="nsummary">${icon('wand')}Résumé détaillé</button><span class="hint" id="nsumst"></span></div>` : ''}
      ${PHOTO_ROW('n')}
      <div class="row">${/^https:\/\//.test(it.link || '') ? `<button class="btn small" id="nartimg">${icon('image')}${look ? `Photos de la ${look === 'tenue' ? 'tenue' : 'livrée'} (article)` : 'Photos de l\'article'}</button>` : ''}${MINE('n')}<span class="hint" id="nartst"></span></div>
        <div class="photos" id="nartlist"></div>
        <p class="hint">${/^https:\/\//.test(it.link || '') ? `Photos de cet article, des autres médias sur la même info${look ? ', d\'Instagram (posts des écuries sur leur look) et de Bluesky' : ''}, et les vôtres. ` : ''}Touchez celles à mettre dans le post, dans l'ordre : la première en couverture, puis une image par photo${/^https:\/\//.test(it.link || '') ? ', « via » la source créditée' : ''}.</p>
      ${toggle('linkcomment', 'Lien en premier commentaire', state.linkComment, 'Facebook, Threads, Bluesky, X')}
      ${BREAKING(d.breaking)}
      <p class="hint">${failed ? 'Traduction indisponible : textes en version originale, à traduire à la main.' : 'Traduction automatique : à relire.'}</p>`,
    vhead: `${OWN_VIDEO('n')}${NEWS_VIDEO()}`,
    data: () => d,
    caps: (dd) => newsCaptions(dd, SIG, { linkInComment: state.linkComment && state.fmt !== 'link' }),
    video: () => made,
    link: /^https:\/\//.test(it.link || '') ? () => ({ url: it.link, title: d.title, description: d.summary }) : null,
    record: () => ({ key: `news:${it.id}`, kind: 'news', title: d.title, srcTitle: it.title, link: it.link || '', summary: String(it.summary || '').slice(0, 300) }),
    bind: (redraw) => {
      let tm = null;
      const upd = () => { clearTimeout(tm); tm = setTimeout(async () => { d = await make($('#ntitle').value, $('#nsum').value, $('#npoints').value); redraw(true); }, 400); };
      $('#ntitle').oninput = upd;
      $('#nsum').oninput = upd;
      $('#npoints').oninput = upd;
      if ($('#nsummary')) $('#nsummary').onclick = async () => {
        const btn = $('#nsummary');
        btn.disabled = true;
        btn.classList.add('busy');
        $('#nsumst').textContent = 'Lecture de l\'article et résumé…';
        try {
          $('#npoints').value = (await detailedSummary(it)).join('\n');
          $('#nsumst').textContent = 'Points clés reformulés par l\'IA : relisez-les avant de publier.';
          upd();
        } catch (err) { $('#nsumst').textContent = err.message; } finally { btn.disabled = false; btn.classList.remove('busy'); }
      };
      const showArts = photoGrid($('#nartlist'), arts, { cover: () => !pic, frame: coverFrame, onChange: () => upd() });
      bindPhoto('n', () => d, (p) => { pic = p; showArts(); upd(); });
      bindMine('n', arts, showArts, upd);
      // Livrée ou tenue spéciale : toutes les photos de l'article (rendus, photos de l'écurie), puis celles
      // des autres médias sur la même info ; une photo reprise par plusieurs médias n'est gardée qu'une fois
      if ($('#nartimg')) {
        const load = async (link, i) => {
          const res = await api(`artimg?u=${encodeURIComponent(link)}&i=${i}`, { raw: true });
          const blob = await res.blob();
          const image = await createImageBitmap(blob);
          return { image, url: URL.createObjectURL(blob), pick: 0, n: Number(res.headers.get('X-Photos')) || 1, key: fingerprint(image) };
        };
        // Photos d'un article (max au plus) : la première donne leur nombre
        const loadArticle = async (x, max) => {
          const first = await load(x.link, 0);
          const rest = await Promise.all(Array.from({ length: Math.min(first.n, max) - 1 }, (_, k) => load(x.link, k + 1).catch(() => null)));
          return [first, ...rest].filter(Boolean).map((a) => ({ ...a, src: x.srcName }));
        };
        // Photos des réseaux (Instagram des écuries, Bluesky), lues par le serveur
        const loadSocial = async () => {
          // Seulement l'écurie du sujet (pas celles citées en passant dans le résumé)
          const main = mainTeam(d.title, d.teams);
          const who = look === 'tenue' ? d.drivers[0]?.last || main?.name : main?.name;
          if (!main && !who) return [];
          const r = await api(`socialphotos?${new URLSearchParams({ teams: main?.key || '', look, who: who || '', since: String(it.t - 3 * 86400e3), until: String(it.t + 2 * 86400e3) })}`);
          socialErrors = r.errors || [];
          const list = await Promise.all(r.items.map(async (p) => {
            const blob = await (await api(`img?u=${encodeURIComponent(p.url)}`, { raw: true })).blob();
            const image = await createImageBitmap(blob);
            return { image, url: URL.createObjectURL(blob), pick: 0, key: fingerprint(image), src: p.src };
          }).map((p) => p.catch(() => null)));
          return list.filter(Boolean);
        };
        let socialErrors = [];
        const add = (list) => {
          for (const a of list) {
            if (arts.some((b) => b.key && sameFingerprint(a.key, b.key))) URL.revokeObjectURL(a.url);
            else arts.push(a);
          }
        };
        $('#nartimg').onclick = async () => {
          const b = $('#nartimg');
          b.disabled = true; b.classList.add('busy');
          $('#nartst').textContent = 'Lecture des photos…';
          // Vos photos gardées (et leur ordre), les autres relues
          for (const a of arts) if (!a.mine) URL.revokeObjectURL(a.url);
          arts.splice(0, arts.length, ...arts.filter((a) => a.mine));
          arts.filter((a) => a.pick).sort((a, b) => a.pick - b.pick).forEach((a, i) => { a.pick = i + 1; });
          let err = null;
          try { add(await loadArticle(it, 12)); showArts(); upd(); } catch (e) { err = e; }
          // Autres médias : articles du même type dont le titre cite l'écurie du sujet
          const main = mainTeam(d.title, d.teams);
          const others = similarArticles(it, await freshNews().catch(() => cachedNews()?.items || []), 12, look).filter((x) => !main || mentionsTeam(x.title, main.key)).slice(0, 4);
          let found = 0;
          for (const [k, x] of others.entries()) {
            $('#nartst').textContent = `${arts.length} photo${arts.length > 1 ? 's' : ''} · autres médias (${k + 1}/${others.length})…`;
            const before = arts.length;
            add(await loadArticle(x, 6).catch(() => []));
            if (arts.length > before) { found++; showArts(); upd(); }
          }
          if (look) {
            $('#nartst').textContent = `${arts.length} photo${arts.length > 1 ? 's' : ''} · Instagram et Bluesky…`;
            const before = arts.length;
            add(await loadSocial().catch(() => []));
            if (arts.length > before) { found++; showArts(); upd(); }
          }
          $('#nartst').textContent = (arts.length ? `${arts.length} photo${arts.length > 1 ? 's' : ''}${found ? ` (dont ${found} autre${found > 1 ? 's' : ''} source${found > 1 ? 's' : ''})` : ''}` : (err?.message || 'Pas de photo')) + (socialErrors.length ? ` · ${socialErrors.join(' · ')}` : '');
          b.disabled = false; b.classList.remove('busy');
        };
      }
      $('#linkcomment').onchange = (e) => { state.linkComment = e.target.checked; redraw(true); };
      bindOwnVideo('n', (file) => { own = file; made = null; if (file) $('#mkvid').click(); else redraw(); });
      bindNewsVideo(() => d, (on) => { breaking = on; d.breaking = on; redraw(true); }, (file) => { made = file; redraw(); }, () => own);
    },
  });
}

// ---------- Post écrit à la main : texte libre, mise en forme par l'IA, photo, visuels automatiques ----------
// Pilotes et écuries reconnus dans le texte (portraits, couleurs) ; type d'info deviné ou choisi.
export async function manualEditor(back) {
  const it = { id: `m${Date.now().toString(36)}`, cat: 'official', t: Date.now(), link: '' };
  const f = { title: '', summary: '', points: '', kind: '', source: '', pic: null, breaking: false, video: null };
  const mine = [];   // vos photos : la première choisie en couverture (sans photo libre de droits), puis une image chacune
  const drivers = await latestDrivers();
  const make = () => {
    const text = `${f.title} ${f.summary} ${f.points}`;
    const title = f.title.trim() || 'Votre titre ici';
    const d = newsPost({ ...it, title, summary: f.summary, tags: newsTags(text) }, { title, summary: f.summary, points: f.points, driverList: drivers, sourceName: f.source.trim() });
    if (f.kind) d.badge = f.kind === 'none' ? NO_BADGE : NEWS_BADGES.find((b) => b.key === f.kind) || d.badge;
    const on = picked(mine);
    if (f.pic) Object.assign(d, f.pic);
    else if (on[0]) Object.assign(d, on[0]);
    d.gallery = f.pic ? on : on.slice(1);
    d.breaking = f.breaking;
    return d;
  };
  let d = make();
  editor({
    back,
    title: 'Écrire un post',
    subtitle: 'Texte libre, visuels faits tout seuls',
    head: `<label class="field"><span>Votre texte <small>(l'info en vrac, vos notes, un brouillon)</small></span><textarea id="mraw" rows="5" maxlength="4000" placeholder="Ex. : Norris prolonge chez McLaren jusqu'en 2030, annonce faite ce matin avant le GP des États-Unis…"></textarea></label>
      <div class="row"><button class="btn small" id="mai">${icon('wand')}Mettre en forme avec l'IA</button><span class="hint" id="maist">Titre, résumé et points clés rédigés à partir de votre texte.</span></div>
      <label class="field"><span>Titre</span><input type="text" id="mtitle" maxlength="120" placeholder="Le titre du visuel"></label>
      <label class="field"><span>Résumé</span><textarea id="msum" rows="3" maxlength="320"></textarea></label>
      <label class="field"><span>Points clés, un par ligne <small>(images suivantes du carrousel)</small></span><textarea id="mpoints" rows="4" maxlength="1600" placeholder="Facultatif"></textarea></label>
      <label class="field"><span>Type d'info</span><select id="mkind"><option value="">Deviné d'après le texte</option><option value="none">Aucun (pas d'étiquette)</option>${NEWS_BADGES.map((b) => `<option value="${b.key}">${esc(b.label.charAt(0) + b.label.slice(1).toLowerCase())}</option>`).join('')}</select></label>
      <label class="field"><span>Source <small>(facultatif, citée en bas de l'image)</small></span><input type="text" id="msrc" maxlength="60" placeholder="Ex. : communiqué de McLaren"></label>
      <div class="field"><span>Photos <small>(facultatif : la couverture remplace les portraits des pilotes, les autres font une image chacune)</small></span>
        ${PHOTO_ROW('m')}<div class="row">${MINE('m')}<span class="hint" id="martst"></span></div>
        <div class="photos" id="martlist"></div></div>
      ${BREAKING(false)}`,
    vhead: `${OWN_VIDEO('m')}${NEWS_VIDEO()}`,
    data: () => d,
    caps: (dd) => newsCaptions(dd, SIG),
    record: () => ({ key: `manual:${it.id}`, kind: 'manual', title: d.title }),
    video: () => f.made,
    bind: (redraw) => {
      let tm = null;
      const upd = (now = false) => {
        clearTimeout(tm);
        tm = setTimeout(() => {
          Object.assign(f, { title: $('#mtitle').value, summary: $('#msum').value, points: $('#mpoints').value, kind: $('#mkind').value, source: $('#msrc').value });
          d = make();
          redraw(true);
        }, now ? 0 : 400);
      };
      for (const id of ['#mtitle', '#msum', '#mpoints', '#msrc']) $(id).oninput = () => upd();
      $('#mkind').onchange = () => upd(true);
      $('#mai').onclick = async () => {
        const text = $('#mraw').value.trim() || `${$('#mtitle').value}\n${$('#msum').value}\n${$('#mpoints').value}`.trim();
        if (text.length < 20) { $('#maist').textContent = 'Écrivez d\'abord quelques phrases dans « Votre texte ».'; return; }
        const btn = $('#mai');
        btn.disabled = true; btn.classList.add('busy');
        $('#maist').textContent = 'Mise en forme…';
        try {
          const r = await api('rewrite', { method: 'POST', body: JSON.stringify({ text }) });
          $('#mtitle').value = r.title;
          $('#msum').value = r.summary;
          if (r.points?.length) $('#mpoints').value = r.points.join('\n');
          $('#maist').textContent = 'Rédigé par l\'IA à partir de votre texte : relisez et corrigez avant de publier.';
          upd(true);
        } catch (err) { $('#maist').textContent = err.message; } finally { btn.disabled = false; btn.classList.remove('busy'); }
      };
      const showMine = photoGrid($('#martlist'), mine, { cover: () => !f.pic, frame: coverFrame, onChange: () => upd(true) });
      bindPhoto('m', () => d, (p) => { f.pic = p; showMine(); upd(true); });
      bindMine('m', mine, showMine, () => upd(true));
      // Vidéo choisie : seulement la source, habillée aux couleurs du post (« Créer la vidéo », lancé tout de suite)
      bindOwnVideo('m', (file) => { f.video = file; f.made = null; if (file) $('#mkvid').click(); else upd(true); });
      bindNewsVideo(() => d, (on) => { f.breaking = on; upd(true); }, (file) => { f.made = file; redraw(); }, () => f.video);
    },
  });
}

// ---------- Post du compte Paddock Live (@paddockliveapp) : préparé ici, publié à la main ----------
// Une page par image du carrousel (petit titre, titre aux mots en rouge, texte, capture ou photo) ; votre vidéo
// (enregistrement d'écran) habillée du même visuel ; visuels, vidéo et textes à télécharger ou partager.
export async function appEditor(back) {
  const blank = () => ({ kicker: '', title: '', text: '', image: null, orig: null, url: '' });
  const pages = [blank()];
  const v = { video: null, made: null };
  const id = `a${Date.now().toString(36)}`;
  let d = appPost(pages);
  const pageHtml = (p, i) => `<section class="apage" data-p="${i}"><div class="row"><b>Page ${i + 1}</b><span class="grow"></span>
      ${i ? `<button class="iconbtn" data-up aria-label="Monter la page" title="Monter la page">${icon('back')}</button>` : ''}${pages.length > 1 ? `<button class="iconbtn" data-del aria-label="Retirer la page" title="Retirer la page">${icon('close')}</button>` : ''}</div>
      <label class="field"><span>Petit titre <small>(en rouge, au-dessus du titre)</small></span><input type="text" data-f="kicker" maxlength="60" value="${esc(p.kicker)}" placeholder="Ex. : Radios d'équipe"></label>
      <label class="field"><span>Titre <small>(mots en rouge entre *astérisques*)</small></span><input type="text" data-f="title" maxlength="140" value="${esc(p.title)}" placeholder="Ex. : Ce qu'ils se disent à la radio, *en français.*"></label>
      <label class="field"><span>Texte <small>(facultatif)</small></span><textarea data-f="text" rows="2" maxlength="300">${esc(p.text)}</textarea></label>
      <div class="row"><label class="btn small">${icon('image')}${p.image ? 'Changer' : 'Capture, photo ou vidéo'}<input type="file" accept="image/*,video/mp4,video/quicktime" data-img hidden></label>${p.image ? `${p.video ? '' : `<button class="btn small" data-crop>${icon('image')}Recadrer</button>`}<button class="btn small" data-rm>${icon('close')}Retirer</button><img class="athumb" src="${p.url}" alt="">` : ''}</div>
      ${p.video ? `<p class="hint" data-vst>${icon('video')}${esc(v.video?.name || 'Vidéo')} : habillée du visuel de cette page (étape Vidéo), ${CLIP_MAX} s au plus</p>` : ''}</section>`;
  editor({
    back,
    title: 'Post Paddock Live',
    subtitle: '@paddockliveapp · à publier à la main',
    head: `<p class="hint">Le visuel du compte de l'appli, une image par page du carrousel. Tout se télécharge ou se partage à l'étape Exporter.</p>
      <label class="field"><span>Votre texte <small>(facultatif : l'idée en vrac, mise en pages par l'IA)</small></span><textarea id="araw" rows="3" maxlength="4000" placeholder="Ex. : les radios des pilotes traduites en français au moment où elles passent à la TV, gratuit…"></textarea></label>
      <div class="row"><button class="btn small" id="aai">${icon('wand')}Mettre en pages avec l'IA</button><span class="hint" id="aaist"></span></div>
      <div id="apages"></div>
      <div class="row"><button class="btn small" id="aadd">${icon('pen')}Ajouter une page</button><label class="btn small">${icon('image')}Une page par photo<input type="file" accept="image/*" multiple id="aphotos" hidden></label><span class="hint" id="aphst"></span></div>`,
    vhead: `<p class="hint">Votre vidéo (enregistrement d'écran…) se choisit dans une page, à l'étape Contenu : « Capture, photo ou vidéo ».</p>
      ${musicField('app', 'flash')}<div class="row"><button class="btn" id="mkvid">${icon('video')}Créer la vidéo</button><button class="btn" id="sharevid" disabled>${icon('share')}Partager</button></div>
      <p class="hint" id="vidst">Sans vidéo à vous : les images gardées, au format story, environ 3 s chacune. Garder l'écran allumé pendant l'enregistrement.</p>
      <video id="vid" controls playsinline hidden></video>`,
    data: () => d,
    caps: appCaptions,
    record: () => ({ key: `app:${id}`, kind: 'app', title: d.title }),
    video: () => v.made,
    bind: (redraw) => {
      let tm = null;
      const upd = (now = false) => { clearTimeout(tm); tm = setTimeout(() => { d = appPost(pages); redraw(true); }, now ? 0 : 400); };
      const setImage = async (p, file) => {
        const image = await createImageBitmap(file);
        if (p.url) URL.revokeObjectURL(p.url);
        Object.assign(p, { image, orig: image, credit: '', url: await bitmapUrl(image) });
      };
      // Vidéo choisie dans une page : la vidéo du post (une seule), habillée du visuel de cette page ; sa première
      // image sert de capture sur le carrousel. Fabriquée tout de suite (étape Vidéo : musique, partage)
      const setVideo = async (p, file) => {
        if (!/^video\/(mp4|quicktime)$/.test(file.type)) throw new Error('Vidéo MP4 ou MOV seulement');
        if (file.size > 300e6) throw new Error(`Trop lourde (${Math.round(file.size / 1e6)} Mo) : 300 Mo au plus`);
        const image = await videoPoster(file);
        for (const x of pages) if (x.video && x !== p) Object.assign(x, { video: false, image: null, orig: null, url: '' });
        if (p.url) URL.revokeObjectURL(p.url);
        Object.assign(p, { image, orig: image, credit: '', url: await bitmapUrl(image), video: true });
        v.video = file; v.made = null;
      };
      const render = () => {
        $('#apages').innerHTML = pages.map(pageHtml).join('');
        for (const el of $$('#apages [data-p]')) {
          const p = pages[Number(el.dataset.p)];
          for (const f of $$('[data-f]', el)) f.oninput = () => { p[f.dataset.f] = f.value; upd(); };
          $('[data-img]', el).onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.type.startsWith('video/')) unlockAudio();   // pendant le toucher (sinon vidéo muette sur iPhone)
            try {
              if (file.type.startsWith('video/')) { await setVideo(p, file); render(); d = appPost(pages); redraw(true); $('#mkvid').click(); } else { if (p.video) { v.video = v.made = null; p.video = false; } await setImage(p, file); render(); upd(true); }
            } catch (err) { toast(err.message || 'Fichier illisible', 'bad'); }
          };
          if ($('[data-crop]', el)) $('[data-crop]', el).onclick = async () => { const image = await cropImage(p.orig); if (image) { p.image = image; URL.revokeObjectURL(p.url); p.url = await bitmapUrl(image); render(); upd(true); } };
          if ($('[data-rm]', el)) $('[data-rm]', el).onclick = () => { if (p.video) v.video = v.made = null; URL.revokeObjectURL(p.url); Object.assign(p, { image: null, orig: null, url: '', video: false }); render(); upd(true); };
          if ($('[data-up]', el)) $('[data-up]', el).onclick = () => { const i = pages.indexOf(p); pages.splice(i - 1, 0, ...pages.splice(i, 1)); render(); upd(true); };
          if ($('[data-del]', el)) $('[data-del]', el).onclick = () => { if (p.video) v.video = v.made = null; pages.splice(pages.indexOf(p), 1); render(); upd(true); };
        }
      };
      render();
      $('#aadd').onclick = () => { pages.push(blank()); render(); $(`#apages [data-p="${pages.length - 1}"] [data-f="title"]`).focus(); };
      // Une page par photo choisie (captures de l'appli…), dans l'ordre des fichiers ; la première page vide d'image d'abord
      $('#aphotos').onchange = async (e) => {
        const files = [...(e.target.files || [])].slice(0, 10);
        let bad = 0;
        for (const file of files) {
          const p = pages.find((x) => !x.image && !x.title && !x.text) || pages[pages.push(blank()) - 1];
          try { await setImage(p, file); } catch { bad++; pages.splice(pages.indexOf(p), 1); }
        }
        if (!pages.length) pages.push(blank());
        $('#aphst').textContent = bad ? `${bad} image${bad > 1 ? 's' : ''} illisible${bad > 1 ? 's' : ''}` : '';
        e.target.value = '';
        render(); upd(true);
      };
      // IA : titre et texte de la page 1, puis une page par point clé (images des pages gardées)
      $('#aai').onclick = async () => {
        const text = $('#araw').value.trim();
        if (text.length < 20) { $('#aaist').textContent = 'Écrivez d\'abord quelques phrases dans « Votre texte ».'; return; }
        const btn = $('#aai');
        btn.disabled = true; btn.classList.add('busy');
        $('#aaist').textContent = 'Mise en pages…';
        try {
          const r = await api('rewrite', { method: 'POST', body: JSON.stringify({ text }) });
          const list = [{ title: r.title, text: r.summary }, ...(r.points || []).map((x) => ({ title: x, text: '' }))];
          list.forEach((x, i) => { pages[i] ||= blank(); Object.assign(pages[i], x); });
          $('#aaist').textContent = 'Rédigé par l\'IA : relisez, et mettez des *astérisques* autour des mots à mettre en rouge.';
          render(); upd(true);
        } catch (err) { $('#aaist').textContent = err.message; } finally { btn.disabled = false; btn.classList.remove('busy'); }
      };
      // Vidéo à vous : habillée du visuel de sa page, avec la fin aux couleurs de l'appli
      const track = bindMusic('app');
      let clip = null;
      $('#mkvid').onclick = async () => {
        unlockAudio();   // pendant le toucher, avant toute attente (sinon vidéo muette sur iPhone)
        $('#mkvid').disabled = true;
        try {
          const opts = { ...track(), onProgress: (x) => { $('#vidst').textContent = `${v.video ? 'Habillage de votre vidéo' : 'Enregistrement'}… ${Math.round(x * 100)} %`; } };
          // Sans vidéo à vous : les images gardées au format story, enchaînées (comme la vidéo des visuels des autres posts)
          const list = chosenSlides(slidesFor(d, { fmt: 'story' }), [...state.skip]);
          clip = v.video ? await makeClipVideo(v.video, d, await assets(d), opts) : await makeVideo(list.map((sl) => drawSlide(document.createElement('canvas'), sl, 'story', d, { slides: list })), opts);
          $('#vid').src = URL.createObjectURL(clip.blob); $('#vid').hidden = false;
          $('#sharevid').disabled = false;
          v.made = clipFile(clip, 'paddock-live');
          $('#vidst').textContent = `Vidéo prête : ${(clip.blob.size / 1e6).toFixed(1).replace('.', ',')} Mo${clip.silent ? ' · sans son : le navigateur a bloqué la musique, recommencez' : ''} · « Partager » pour l'enregistrer ou l'envoyer (Reels, TikTok, Shorts)`;
          redraw();
        } catch (err) { $('#vidst').textContent = err.message; } finally { $('#mkvid').disabled = false; }
      };
      $('#sharevid').onclick = () => clip && shareClip(clip, 'paddock-live');
    },
  });
}

// Image d'une vidéo (vers 1 s) : sa capture sur le carrousel
async function videoPoster(file) {
  const el = document.createElement('video');
  el.muted = true; el.playsInline = true; el.preload = 'auto';
  el.src = URL.createObjectURL(file);
  try {
    await new Promise((ok, ko) => { el.onloadeddata = ok; el.onerror = () => ko(new Error('Vidéo illisible dans ce navigateur (MP4 en H.264 conseillé)')); });
    await new Promise((ok) => { el.onseeked = ok; el.currentTime = Math.min(1, (el.duration || 0) / 2); setTimeout(ok, 1500); });
    return await createImageBitmap(el);
  } finally { const src = el.src; el.removeAttribute('src'); el.load(); URL.revokeObjectURL(src); }
}

// ---------- Récap de la semaine : les 5 plus grosses news des 7 derniers jours ----------
export async function recapEditor(back) {
  const news = cachedNews()?.items || await freshNews();
  const f1 = (l) => l.filter((it) => !OTHER_SERIES.test(`${it.title} ${it.summary || ''}`));
  let list = f1(bigNews(news, { hours: 7 * 24 })).slice(0, 5);
  if (list.length < 3) list = f1(bigNews(news, { hours: 7 * 24, all: true })).slice(0, 5);
  if (!list.length) throw new Error('Pas assez d\'actus ces 7 derniers jours');
  const fr = await toFrench(list.flatMap((it) => [{ text: it.title, from: it.lang }, { text: it.summary, from: it.lang }]));
  const drivers = await latestDrivers();
  const d = recapData(list.map((it, i) => newsPost(it, { title: fr[2 * i] ?? it.title, summary: fr[2 * i + 1] ?? it.summary, driverList: drivers, sourceName: it.srcName })));
  editor({
    back,
    title: 'Récap de la semaine',
    subtitle: `${d.items.length} grosses news des 7 derniers jours`,
    note: 'Traduction automatique : à relire.',
    data: () => d, caps: (dd) => seasonCaptions(dd, SIG),
    record: () => ({ key: `recap:${d.date}`, kind: 'recap', title: `La semaine en F1 · ${d.date}` }),
  });
}

// ---------- Grille de départ officielle (document de la FIA, lu dans le navigateur) ----------
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38';
const fiaGet = (p) => api(`fia?p=${encodeURIComponent(p)}`, { raw: true });
async function pdfItems(buf) {
  const lib = await import(`${PDFJS}/pdf.min.mjs`);
  lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
  const pdf = await lib.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    pages.push(tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str })));
  }
  return pages;
}
async function fiaGrid(year, meeting, sprint) {
  const { bySeason, events } = parseSeasons(await (await fiaGet(CHAMPIONSHIP)).text());
  const event = bySeason[year] && pickEvent(events, meeting);
  if (!event) return null;
  const doc = gridDocument(parseDocumentList(await (await fiaGet(`${bySeason[year]}/event/${encodeURIComponent(event)}`)).text()), { sprint });
  if (!doc) return null;
  const grid = parseStartingGrid(await pdfItems(await (await fiaGet(new URL(doc.url).pathname)).arrayBuffer()));
  return grid && { ...grid, title: doc.title };
}

// Types de posts d'une séance : résultats, avant-course (grille, météo, pneus), championnat, flash
const POST_TYPES = [['results', 'Résultats'], ['prerace', 'Avant-course'], ['champ', 'Championnat'], ['flash', 'Flash']];
export async function sessionEditor(s, back) {
  const st = await loadState(s.path, undefined, { live: s.live });
  rememberDrivers(st.DriverList);
  const meet = st.SessionInfo?.Meeting || {};
  const tyres = builtinNomination(Number(String(s.path).slice(0, 4)), { name: meet.Name, location: meet.Location, country: meet.Country?.Name });
  const events = flashEvents(st);
  const results = postData(st, { laps: lapsOf(st) });
  const champ = champData(st);
  let type = 'results';
  let ev = events[0] || null;
  let grid;   // grille officielle de la FIA : undefined = pas encore lue
  let gridNote = '';
  const avail = (k) => k === 'results' || k === 'prerace' || (k === 'champ' && champ) || (k === 'flash' && ev);
  const data = () => (type === 'prerace' ? preraceData(st, { tyres, grid }) : type === 'champ' ? champ : type === 'flash' ? flashData(st, ev) : results);
  const typeName = () => POST_TYPES.find(([k]) => k === type)[1];
  const loadGrid = async (redraw) => {
    if (grid !== undefined) return;
    grid = null;
    $('#gridnote').textContent = 'Lecture de la grille officielle de la FIA…';
    try {
      grid = await fiaGrid(Number(String(s.path).slice(0, 4)), { name: meet.Name, country: meet.Country?.Name, location: meet.Location }, results.sprint);
      gridNote = !grid ? 'Grille pas encore publiée par la FIA : ordre des qualifications, sans les pénalités.'
        : grid.final ? 'Grille officielle de la FIA, pénalités comprises.' : 'Grille provisoire de la FIA : la définitive peut encore changer.';
    } catch (err) { gridNote = `Grille de la FIA indisponible (${err.message}) : ordre des qualifications, sans les pénalités.`; }
    if ($('#gridnote')) $('#gridnote').textContent = type === 'prerace' ? gridNote : '';
    if (type === 'prerace') redraw(true);
  };
  editor({
    back,
    title: SESSION_FR(s.name),
    subtitle: results.gp,
    head: `<div class="seg wide" id="ptype">${POST_TYPES.map(([k, v]) => `<button data-ptype="${k}" class="${k === type ? 'on' : ''}" ${avail(k) ? '' : 'disabled'}>${v}</button>`).join('')}</div>
      <p class="hint" id="gridnote" hidden></p>
      <label class="field" id="flashrow" hidden><span>Moment de la séance</span><select id="flashpick">${events.map((x, i) => `<option value="${i}">${esc(FLASH_KINDS[x.kind].label)} · ${esc(x.title)}${x.lap ? ` · tour ${x.lap}` : ''}</option>`).join('')}</select></label>
      <div id="nospoilrow">${toggle('nospoil', 'Texte sans spoiler', state.noSpoiler, 'Vainqueur absent du début du texte')}</div>`,
    data,
    caps: (dd) => (type === 'results' ? captions(dd, SIG, { spoiler: !state.noSpoiler }) : moreCaptions(dd, SIG)),
    record: () => (type === 'results' ? { key: `session:${s.path}`, kind: 'session', title: `${SESSION_FR(s.name)} · ${results.gp}` }
      : { key: `${type}:${s.path}${type === 'flash' ? `:${ev.id}` : ''}`, kind: type, title: `${type === 'flash' ? ev.title : typeName()} · ${results.gp}` }),
    bind: (redraw) => {
      $('#nospoil').onchange = (e) => { state.noSpoiler = e.target.checked; redraw(true); };
      $('#flashpick').onchange = (e) => { ev = events[Number(e.target.value)]; redraw(true); };
      $$('[data-ptype]').forEach((b) => {
        b.onclick = () => {
          type = b.dataset.ptype;
          $$('[data-ptype]').forEach((x) => x.classList.toggle('on', x === b));
          glide();
          $('#flashrow').hidden = type !== 'flash';
          $('#gridnote').hidden = type !== 'prerace';
          if (type === 'prerace') { $('#gridnote').textContent = gridNote; loadGrid(redraw); }
          $('#nospoilrow').hidden = type !== 'results';
          redraw(true);
        };
      });
    },
  });
}
