// Studio : posts des news (et récap de la semaine) et des séances (résultats, avant-course,
// championnat, flash). Chargé à l'ouverture d'un post.
import { decodeBody } from '/shared/news-collect.js';
import { bigNews, newsPost, newsCaptions, newsKind, LOOKS, OTHER_SERIES, NEWS_BADGES } from '/shared/social-news.js';
import { newsTags } from '/shared/news.js';
import { postData, captions } from '/shared/social.js';
import { preraceData, champData, flashEvents, flashData, moreCaptions, FLASH_KINDS } from '/shared/social-more.js';
import { builtinNomination } from '/shared/tyres.js';
import { CHAMPIONSHIP, parseSeasons, parseDocumentList, pickEvent } from '/shared/fia-list.js';
import { gridDocument, parseStartingGrid } from '/shared/fia-grid.js';
import { extractArticle } from '/shared/article.js';
import { recapData, seasonCaptions } from '/shared/social-season.js';
import { $, $$, esc, api, ago, icon, toggle, glide, state, SIG, NET_NAMES, musicField, bindMusic, clipFile } from './ui.js';
import { toFrench, freshNews, cachedNews, latestDrivers, loadState, rememberDrivers, SESSION_FR } from './data.js';
import { editor, assets } from './editor.js';
import { photoPicker } from './photos.js';
import { makeAnimation, unlockAudio } from '/shared/social-video.js';
import { newsFrame, newsVideoTiming } from '/shared/social-news-video.js';

// Résumé détaillé : page de l'article lue par le serveur, texte extrait ici, points clés rédigés par
// l'IA du serveur (reformulés, jamais recopiés)
async function detailedSummary(it) {
  const html = await decodeBody(await api(`page?u=${encodeURIComponent(it.link)}`, { raw: true }));
  const a = extractArticle(html, it.link);
  const text = a.blocks.map((b) => b.h || b.p || '').filter(Boolean).join('\n\n').slice(0, 12000);
  if (text.length < 400) throw new Error('Pas de texte lisible sur cette page (vidéo, accès réservé…)');
  const res = await fetch('/s', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: it.title || a.title, text }) });
  const j = await res.json().catch(() => ({}));
  if (res.status === 429) throw new Error('Plafond du jour atteint, réessayez demain');
  if (!res.ok || !Array.isArray(j.points)) throw new Error(j.error || 'Résumé indisponible pour le moment');
  return j.points;
}

// ---------- Photo libre de droits (Wikimedia Commons, Flickr) à la place des portraits ----------
// Recherche proposée : le premier pilote cité, sinon l'écurie, sinon la F1
const freeQuery = (d) => (d.drivers?.[0] ? `${d.drivers[0].first} ${d.drivers[0].last}` : d.teams?.find((t) => t.key !== 'fia')?.name || 'Formula 1');
const PHOTO_ROW = (p) => `<div class="row"><button class="btn small" id="${p}photo">${icon('image')}Photo libre de droits</button><button class="btn small" id="${p}photodel" hidden>${icon('close')}Retirer</button><span class="hint" id="${p}photost"></span></div>`;
// onPhoto({ image, credit } ou null) : photo choisie ou retirée
function bindPhoto(p, getD, onPhoto) {
  $(`#${p}photo`).onclick = () => photoPicker(freeQuery(getD()), (pic) => { onPhoto(pic); $(`#${p}photost`).textContent = pic.credit; $(`#${p}photodel`).hidden = false; });
  $(`#${p}photodel`).onclick = () => { onPhoto(null); $(`#${p}photost`).textContent = ''; $(`#${p}photodel`).hidden = true; };
}

// ---------- Vidéo « Breaking news » (TikTok, Reels, Shorts, story), commune aux news et aux posts écrits ----------
const NEWS_VIDEO = (on) => `${toggle('brk', 'Très grosse info', on, 'Visuel et vidéo « Breaking news »')}<div id="vidbox" ${on ? '' : 'hidden'}>${musicField('news', 'flash')}<div class="row"><button class="btn" id="mkvid">${icon('video')}Créer la vidéo</button><button class="btn" id="sharevid" disabled>${icon('share')}Partager</button></div>
  <p class="hint" id="vidst">Garder l'écran allumé pendant l'enregistrement.</p>
  <video id="vid" controls playsinline hidden></video></div>`;
// onBreaking(on) : très grosse info cochée ou décochée à la main
// onClip(file) : vidéo prête (MP4), jointe au post pour la publier sur TikTok, Instagram, Facebook…
function bindNewsVideo(getD, name, onBreaking, onClip) {
  let clip = null;
  const track = bindMusic('news');
  $('#brk').onchange = (e) => { $('#vidbox').hidden = !e.target.checked; onBreaking(e.target.checked); };
  $('#mkvid').onclick = async () => {
    unlockAudio();   // pendant le toucher, avant toute attente (sinon vidéo muette sur iPhone)
    $('#mkvid').disabled = true;
    try {
      const d = getD();
      const o = await assets(d);
      const { duration } = newsVideoTiming(d);
      clip = await makeAnimation((ctx, t) => newsFrame(ctx, 1080, 1920, d, o, t), duration, { music: 'gen', track: track(), onProgress: (p) => { $('#vidst').textContent = `Enregistrement… ${Math.round(p * 100)} %`; } });
      $('#vid').src = URL.createObjectURL(clip.blob); $('#vid').hidden = false;
      $('#sharevid').disabled = false;
      $('#vidst').textContent = `Vidéo prête : ${Math.round(duration)} s, ${(clip.blob.size / 1e6).toFixed(1).replace('.', ',')} Mo${clip.silent ? ' · sans son : le navigateur a bloqué la musique, recommencez' : ''}${clipFile(clip, name) ? ' · cochez TikTok, Instagram… dans « Publier sur » pour la publier' : ' · format WebM : à partager seulement (publication en MP4)'}`;
      onClip(clipFile(clip, name));
    } catch (err) { $('#vidst').textContent = err.message; } finally { $('#mkvid').disabled = false; }
  };
  $('#sharevid').onclick = async () => {
    if (!clip) return;
    const file = new File([clip.blob], `${name}.${clip.mime.includes('mp4') ? 'mp4' : 'webm'}`, { type: clip.mime });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch { /* annulé */ } return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
  };
}

export async function newsEditor(it, done, back) {
  const [title, summary] = await toFrench([{ text: it.title, from: it.lang }, { text: it.summary, from: it.lang }]);
  const failed = title === null || summary === null;
  let breaking = null;   // très grosse info choisie à la main (sinon : détectée)
  let made = null;       // vidéo Breaking news fabriquée (MP4), jointe au post
  let pic = null;        // photo choisie (libre de droits, ou celle de l'article) : { image, credit }
  const look = it.link && LOOKS.has(newsKind(it).key) ? newsKind(it).key : '';   // livrée ou tenue spéciale
  const make = async (t, s, p = '') => {
    const nd = newsPost(it, { title: t, summary: s, points: p, driverList: await latestDrivers(), sourceName: it.srcName });
    if (breaking !== null) nd.breaking = breaking;
    if (pic) Object.assign(nd, pic);
    return nd;
  };
  let d = await make(title ?? it.title, summary ?? it.summary);
  editor({
    back,
    title: 'News',
    subtitle: `${it.srcName} · il y a ${ago(it.t)}`,
    below: true,
    head: `<div class="row"><span class="badge" style="background:${d.badge.color}">${esc(d.badge.label)}</span>${it.link ? `<a class="link" href="${esc(it.link)}" target="_blank" rel="noopener">Lire l'article ${icon('link')}</a>` : ''}</div>
      ${done ? `<p class="notice ok">${icon('check')}Déjà publiée le ${esc(new Date(done.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }))} sur ${esc(Object.keys(done.nets).map((n) => NET_NAMES[n] || n).join(', '))}</p>` : ''}
      <label class="field"><span>Titre</span><input type="text" id="ntitle" maxlength="160" value="${esc(d.title)}"></label>
      <label class="field"><span>Résumé</span><textarea id="nsum" rows="4" maxlength="400">${esc(d.summary)}</textarea></label>
      <label class="field"><span>Points clés, un par ligne <small>(images suivantes du carrousel)</small></span><textarea id="npoints" rows="5" maxlength="1600" placeholder="Facultatif : « Résumé détaillé » ou à écrire soi-même"></textarea></label>
      ${it.link ? `<div class="row"><button class="btn small" id="nsummary">${icon('wand')}Résumé détaillé</button><span class="hint" id="nsumst"></span></div>` : ''}
      ${PHOTO_ROW('n')}
      ${/^https:\/\//.test(it.link || '') ? `<div class="row"><button class="btn small" id="nartimg">${icon('image')}${look ? `Photo de la ${look === 'tenue' ? 'tenue' : 'livrée'} (article)` : 'Photo de l\'article'}</button></div>
        <p class="hint">Dans les visuels, « via ${esc(it.srcName)} » crédité.</p>` : ''}
      ${toggle('linkcomment', 'Lien en premier commentaire', state.linkComment, 'Facebook, Threads, Bluesky, X')}
      ${NEWS_VIDEO(d.breaking)}
      <p class="hint">${failed ? 'Traduction indisponible : textes en version originale, à traduire à la main.' : 'Traduction automatique : à relire.'}</p>`,
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
      bindPhoto('n', () => d, (p) => { pic = p; upd(); });
      // Livrée ou tenue spéciale : la photo de l'article (rendu ou photo de l'écurie)
      if ($('#nartimg')) {
        $('#nartimg').onclick = async () => {
          const b = $('#nartimg');
          b.disabled = true; b.classList.add('busy');
          try {
            pic = { image: await createImageBitmap(await (await api(`artimg?u=${encodeURIComponent(it.link)}`, { raw: true })).blob()), credit: `Photo : via ${it.srcName}` };
            $('#nphotost').textContent = pic.credit; $('#nphotodel').hidden = false;
            upd();
          } catch (err) { $('#nphotost').textContent = err.message; } finally { b.disabled = false; b.classList.remove('busy'); }
        };
      }
      $('#linkcomment').onchange = (e) => { state.linkComment = e.target.checked; redraw(true); };
      bindNewsVideo(() => d, 'breaking-news', (on) => { breaking = on; d.breaking = on; redraw(true); }, (file) => { made = file; redraw(); });
    },
  });
}

// ---------- Post écrit à la main : texte libre, mise en forme par l'IA, photo, visuels automatiques ----------
// Pilotes et écuries reconnus dans le texte (portraits, couleurs) ; type d'info deviné ou choisi.
export async function manualEditor(back) {
  const it = { id: `m${Date.now().toString(36)}`, cat: 'official', t: Date.now(), link: '' };
  const f = { title: '', summary: '', points: '', kind: '', source: '', image: null, breaking: false, video: null };
  const drivers = await latestDrivers();
  const make = () => {
    const text = `${f.title} ${f.summary} ${f.points}`;
    const title = f.title.trim() || 'Votre titre ici';
    const d = newsPost({ ...it, title, summary: f.summary, tags: newsTags(text) }, { title, summary: f.summary, points: f.points, driverList: drivers, sourceName: f.source.trim() });
    if (f.kind) d.badge = NEWS_BADGES.find((b) => b.key === f.kind) || d.badge;
    if (f.image) Object.assign(d, { image: f.image, credit: f.credit });
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
      <label class="field"><span>Type d'info</span><select id="mkind"><option value="">Deviné d'après le texte</option>${NEWS_BADGES.map((b) => `<option value="${b.key}">${esc(b.label.charAt(0) + b.label.slice(1).toLowerCase())}</option>`).join('')}</select></label>
      <label class="field"><span>Source <small>(facultatif, citée en bas de l'image)</small></span><input type="text" id="msrc" maxlength="60" placeholder="Ex. : communiqué de McLaren"></label>
      <div class="field"><span>Photo <small>(facultatif : remplace les portraits des pilotes)</small></span>
        <div class="row"><label class="btn small">${icon('image')}Choisir une photo<input type="file" id="mimg" accept="image/*" hidden></label><button class="btn small" id="mfree">${icon('image')}Photo libre de droits</button><button class="btn small" id="mimgdel" hidden>${icon('close')}Retirer</button><span class="hint" id="mimgst"></span></div></div>
      <div class="field"><span>Vidéo <small>(facultatif : publiée avec le post, MP4 ou MOV, 50 Mo au plus)</small></span>
        <div class="row"><label class="btn small">${icon('video')}Choisir une vidéo<input type="file" id="mvid" accept="video/mp4,video/quicktime" hidden></label><button class="btn small" id="mviddel" hidden>${icon('close')}Retirer</button><span class="hint" id="mvidst"></span></div>
        <video id="mvidprev" controls playsinline hidden></video></div>
      ${NEWS_VIDEO(false)}`,
    data: () => d,
    caps: (dd) => newsCaptions(dd, SIG),
    record: () => ({ key: `manual:${it.id}`, kind: 'manual', title: d.title }),
    video: () => f.video || f.made,
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
      $('#mimg').onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          f.image = await createImageBitmap(file);
          f.credit = '';
          $('#mimgst').textContent = file.name;
          $('#mimgdel').hidden = false;
          upd(true);
        } catch { $('#mimgst').textContent = 'Image illisible'; }
      };
      $('#mfree').onclick = () => photoPicker(freeQuery(d), (p) => { f.image = p.image; f.credit = p.credit; $('#mimgst').textContent = p.credit; $('#mimgdel').hidden = false; upd(true); });
      $('#mimgdel').onclick = () => { f.image = null; f.credit = ''; $('#mimg').value = ''; $('#mimgst').textContent = ''; $('#mimgdel').hidden = true; upd(true); };
      $('#mvid').onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!/^video\/(mp4|quicktime)$/.test(file.type)) { $('#mvidst').textContent = 'Vidéo MP4 ou MOV seulement'; return; }
        if (file.size > 50e6) { $('#mvidst').textContent = `Trop lourde (${Math.round(file.size / 1e6)} Mo) : 50 Mo au plus`; return; }
        f.video = file;
        $('#mvidst').textContent = `${file.name} · ${(file.size / 1e6).toFixed(1).replace('.', ',')} Mo`;
        if ($('#mvidprev').src) URL.revokeObjectURL($('#mvidprev').src);
        $('#mvidprev').src = URL.createObjectURL(file); $('#mvidprev').hidden = false;
        $('#mviddel').hidden = false;
        upd(true);
      };
      $('#mviddel').onclick = () => { f.video = null; $('#mvid').value = ''; $('#mvidst').textContent = ''; $('#mviddel').hidden = true; $('#mvidprev').hidden = true; $('#mvidprev').removeAttribute('src'); upd(true); };
      bindNewsVideo(() => d, 'breaking-news', (on) => { f.breaking = on; upd(true); }, (file) => { f.made = file; redraw(); });
    },
  });
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
    head: '<p class="hint">Traduction automatique : à relire.</p>',
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
  const st = await loadState(s.path);
  rememberDrivers(st.DriverList);
  const meet = st.SessionInfo?.Meeting || {};
  const tyres = builtinNomination(Number(String(s.path).slice(0, 4)), { name: meet.Name, location: meet.Location, country: meet.Country?.Name });
  const events = flashEvents(st);
  const results = postData(st);
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
