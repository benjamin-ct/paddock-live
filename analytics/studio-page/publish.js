// Studio : étape « Publier » de l'éditeur. Une carte par réseau : formats à cocher (carrousel, Reel, story,
// lien…), texte du réseau modifiable sur place, compte et état de la connexion. Puis une seule feuille
// « Vérifier » (tout de suite ou à une heure choisie) qui dit ce qui part où, avant tout envoi. Les formats
// choisis sont repris au post suivant du même type (gardés sur l'appareil).
// Un envoi au serveur par sorte de contenu (images du fil, vidéo, images en story, lien) : le serveur publie
// chacun à l'heure, même page fermée.
import { slidesFor, drawSlide, slideAlt, chosenSlides } from '/shared/social-draw.js';
import { xLength } from '/shared/social.js';
import { linksIn } from '/shared/track-links.js';
import { bestSlot } from '/shared/post-history.js';
import { postProblems, problemText } from '/shared/post-check.js';
import { THREADS_TOPIC } from '/shared/meta-publish.js';
import { $, $$, esc, api, icon, toast, toggle, sheet, schedList, glide, state, session, store, NET_NAMES, IOS } from './ui.js';
import { tiktokPanel, tiktokProblem, tiktokChoice, TIKTOK_PRIVACY } from './tiktok.js';

// Réseaux et leurs formats : feed (images du post), video (la vidéo du post), story (24 h : la vidéo s'il y en
// a une, sinon une story par image), link (carte de l'article), manual (X : à finir dans l'appli X)
const NETS = [
  ['instagram', 'Instagram', ['feed', 'video', 'story']],
  ['facebook', 'Facebook', ['feed', 'video', 'story', 'link']],
  ['threads', 'Threads', ['feed', 'video', 'link']],
  ['bluesky', 'Bluesky', ['feed', 'video', 'link']],
  ['tiktok', 'TikTok', ['video']],
  ['youtube', 'YouTube', ['video']],
  ['x', 'X', ['manual']],
];
const fmtName = (n, f, vid) => ({ feed: n === 'instagram' ? 'Carrousel' : 'Images', video: n === 'instagram' ? 'Reel' : n === 'youtube' ? 'Short' : 'Vidéo', story: vid ? 'Story vidéo' : 'Story', link: 'Lien', manual: 'Rappel dans « Reste à faire »' }[f]);
// Case du texte de chaque réseau (Facebook : celle d'Instagram s'il n'a pas le sien)
const CAP = { instagram: 'instagram', facebook: 'facebook', threads: 'threads', bluesky: 'bsky', tiktok: 'tiktok', youtube: 'youtube', x: 'x' };
const LIMIT = { threads: 500, x: 280, bsky: 300, tiktok: 2200 };
const ROWS = { instagram: 7, facebook: 6, threads: 4, bsky: 3, x: 3, tiktok: 3, youtube: 4, comment: 2 };
const CAP_NET = { instagram: 'instagram', facebook: 'facebook', threads: 'threads', x: 'x', bsky: 'bluesky', tiktok: 'tiktok', youtube: 'youtube' };

// Choix du post ouvert : formats par réseau, identifiants des envois (gardés jusqu'à la réussite : un nouvel
// appui après une erreur ne programme pas une deuxième fois ce qui était déjà parti), envois réussis
let cur = null;
export function resetPublish(kind) { cur = { kind, plan: null, ids: {}, sent: new Set() }; }

const rid = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
const capOf = (c, n) => c[n === 'facebook' && !c.facebook ? 'instagram' : CAP[n]] || '';
const textOf = (n) => $(`#cap-${n === 'facebook' && !$('#cap-facebook') ? 'instagram' : CAP[n.replace('-story', '')]}`)?.value ?? '';
const commentOf = (n) => (n !== 'instagram' && $('#cap-comment')?.value.trim()) || '';

// Formats de départ : ceux du dernier post du même type (réglage gardé), sinon images partout (ou la vidéo s'il y en
// a une) ; seulement ce qui est possible pour ce post (vidéo, lien, compte connecté)
function startPlan(kind, vid, lk) {
  const can = (n, f) => (n === 'x' || session.me?.[n]) && (f !== 'video' || vid) && (f !== 'link' || lk);
  const saved = store.get(`plan.${kind}`)?.v;
  const base = saved || Object.fromEntries(['instagram', 'facebook', 'threads', 'bluesky'].map((n) => [n, [vid ? 'video' : 'feed']]));
  const plan = {};
  for (const [n, , fs] of NETS) {
    // Vidéo choisie la dernière fois, pas de vidéo cette fois : les images à la place (et l'inverse)
    const want = (base[n] || []).map((f) => (f === 'video' && !vid && n !== 'tiktok' && n !== 'youtube' ? 'feed' : f === 'feed' && vid && !saved ? 'video' : f));
    plan[n] = [...new Set(want)].filter((f) => fs.includes(f) && can(n, f));
  }
  return { plan, saved: !!saved };
}

// Envois au serveur : un par sorte de contenu ; stories : la vidéo s'il y en a une, sinon les images au format story
function jobsOf(plan, vid) {
  const g = { feed: [], video: [], story: [], link: [] };
  for (const [n, fs] of Object.entries(plan)) {
    for (const f of fs) {
      if (f === 'manual') continue;   // X : tâche « Reste à faire », pas d'envoi
      if (f === 'story') (vid ? g.video : g.story).push(`${n}-story`);
      else if (g[f]) g[f].push(n);
    }
  }
  return Object.entries(g).filter(([, nets]) => nets.length).map(([kind, nets]) => ({ kind, nets }));
}

// ---------- Cartes des réseaux ----------
// el : emplacement ; c : textes ; edited : textes retouchés à la main ; vid : vidéo du post ; lk() : article (post
// « lien ») ; title : titre du post (liens suivis) ; app : compte Paddock Live (textes seulement, publiés à la main)
export function renderPublish(el, { c, edited, vid, lk, title, app = false, x }) {
  if (!cur.plan) { const s = startPlan(cur.kind, vid, lk); cur.plan = s.plan; cur.saved = s.saved; }
  const plan = cur.plan;
  const card = ([n, name, fs]) => {
    const acc = n === 'x' ? 'à finir dans l\'appli X' : session.me?.[n];
    const opts = app ? [] : fs.filter((f) => (f !== 'video' || vid) && (f !== 'link' || lk));
    if (!app && n !== 'x' && !opts.length) return '';   // TikTok, YouTube : seulement avec une vidéo
    const on = app || plan[n]?.length;
    const k = n === 'facebook' && !c.facebook ? null : CAP[n];
    const lim = LIMIT[k] || 0;
    return `<div class="netcard${on ? '' : ' off'}" data-card="${n}"><div class="nc-head"><b>${name}</b><small>${esc(app ? '@paddockliveapp' : acc || 'non connecté')}</small><em class="st" data-st="${n}"></em></div>
      ${n === 'x' && !app ? `<div class="row"><button class="btn small" id="openx">${icon('send')}Ouvrir X${vid ? ' avec la vidéo' : ' avec les images'}</button><span class="hint">Texte copié, à coller si X ne le reprend pas.</span></div>` : ''}
      ${opts.length ? `<div class="chips wrap nc-f">${opts.map((f) => `<button type="button" data-f="${f}" class="${plan[n]?.includes(f) ? 'on' : ''}" ${acc ? '' : 'disabled'}>${fmtName(n, f, vid)}</button>`).join('')}</div>` : ''}
      ${k ? `<details class="cap"${on && n !== 'instagram' && !app ? '' : on ? ' open' : ''}><summary><span>Texte</span><small data-count="${k}"></small></summary>
        <textarea id="cap-${k}" rows="${ROWS[k]}" ${lim && k !== 'x' && k !== 'bsky' ? `maxlength="${lim}"` : ''} data-limit="${lim}">${esc(edited[k] ?? c[k] ?? '')}</textarea>
        <div class="row end"><button class="btn small" data-copy="${k}">${icon('copy')}Copier</button></div>
        ${n === 'threads' && !app ? `<label class="field"><span>Sujet Threads (vide : aucun)</span><input type="text" id="threadtopic" maxlength="50" value="${esc(state.topic ?? THREADS_TOPIC)}"></label>` : ''}</details>`
        : n === 'facebook' ? '<p class="hint">Même texte qu\'Instagram.</p>' : ''}
      ${n === 'tiktok' ? '<div id="tkbox" class="tkbox" hidden></div>' : ''}</div>`;
  };
  el.innerHTML = `${app ? '' : '<p class="hint" id="plansum"></p>'}${NETS.map(card).join('')}
    ${c.comment && !app ? `<div class="netcard" data-card="comment"><div class="nc-head"><b>Premier commentaire</b><small>Facebook, Threads, Bluesky ; X : à coller en réponse</small></div>
      <textarea id="cap-comment" rows="${ROWS.comment}">${esc(edited.comment ?? c.comment)}</textarea><div class="row end"><button class="btn small" data-copy="comment">${icon('copy')}Copier</button></div></div>` : ''}`;
  // Compteurs, liens suivis (lien court pdkl.app avec la lettre du réseau), retouches gardées
  const count = (k) => {
    const t = $(`#cap-${k}`);
    const n = k === 'x' ? xLength(t.value) : t.value.length;
    const lim = Number(t.dataset.limit) || 0;
    const m = $(`[data-count="${k}"]`);
    if (!m) return;
    m.textContent = lim ? `${n} / ${lim}` : `${n}`;
    m.classList.toggle('err', !!lim && n > lim);
  };
  let prep = 0;
  const prepare = () => {
    for (const t of $$('textarea[id^="cap-"]', el)) {
      const k = t.id.slice(4);
      const raw = t.value;
      tracked(raw, title, CAP_NET[k] || 'facebook').then((v) => {
        if (v === raw || !t.isConnected || t.value !== raw) return;
        t.value = v;
        if (k in edited) edited[k] = v;
        if (k !== 'comment') count(k);
      });
    }
  };
  for (const t of $$('textarea[id^="cap-"]', el)) {
    const k = t.id.slice(4);
    if (k !== 'comment') count(k);
    t.oninput = () => { edited[k] = t.value; if (k !== 'comment') count(k); clearTimeout(prep); prep = setTimeout(prepare, 800); };
  }
  prepare();
  for (const b of $$('[data-copy]', el)) b.onclick = async () => { try { await navigator.clipboard.writeText($(`#cap-${b.dataset.copy}`).value); toast('Texte copié'); } catch { /* presse-papiers refusé */ } };
  if ($('#threadtopic', el)) $('#threadtopic', el).oninput = (e) => { state.topic = e.target.value; };
  if ($('#openx', el)) $('#openx', el).onclick = () => x();
  if (app) return;
  // Formats touchés : la carte s'allume ou s'éteint, résumé à jour ; TikTok : ses réglages
  const sum = () => {
    const jobs = jobsOf(plan, vid);
    const nets = Object.keys(plan).filter((n) => plan[n].some((f) => f !== 'manual'));
    $('#plansum', el).textContent = nets.length ? `${jobs.reduce((t, j) => t + j.nets.length, 0)} publication${jobs.reduce((t, j) => t + j.nets.length, 0) > 1 ? 's' : ''} sur ${nets.map((n) => NETS.find(([k]) => k === n)[1]).join(', ')}${cur.saved ? ' · formats repris de votre dernier post de ce type' : ''}` : 'Choisissez au moins un format sur un réseau.';
  };
  const tk = () => {
    const box = $('#tkbox', el);
    if (!box) return;
    box.hidden = !plan.tiktok?.length;
    if (!box.hidden) tiktokPanel(box, vid, textOf('tiktok'), () => {});
  };
  for (const b of $$('[data-f]', el)) {
    b.onclick = () => {
      const n = b.closest('[data-card]').dataset.card;
      const list = plan[n] ||= [];
      if (list.includes(b.dataset.f)) list.splice(list.indexOf(b.dataset.f), 1); else list.push(b.dataset.f);
      b.classList.toggle('on', list.includes(b.dataset.f));
      b.closest('.netcard').classList.toggle('off', !list.length);
      if (n === 'tiktok') tk();
      sum(); glide(el);
    };
  }
  sum(); tk();
  // Connexions expirées (YouTube, TikTok, Threads) : formats retirés et grisés, avec la marche à suivre
  accountProblems().then((pb) => {
    for (const [n, why] of Object.entries(pb || {})) {
      const box = why && $(`[data-card="${n}"]`, el);
      if (!box) continue;
      plan[n] = [];
      box.classList.add('off');
      for (const b of $$('[data-f]', box)) { b.classList.remove('on'); b.disabled = true; }
      const st = $(`[data-st="${n}"]`, box);
      st.className = 'st err'; st.textContent = why;
      if (n === 'tiktok') tk();
      sum();
    }
  });
}
// Textes recalculés (images écartées…) : remis dans les cases que vous n'avez pas retouchées
export function refreshTexts(c, edited) {
  for (const t of $$('textarea[id^="cap-"]')) {
    const k = t.id.slice(4);
    if (!(k in edited) && c[k] != null) { t.value = c[k]; t.dispatchEvent(new Event('input')); delete edited[k]; }
  }
}

// Connexions expirées, demandées au serveur au plus toutes les 10 minutes
let checked = null;
function accountProblems() {
  if (!checked || Date.now() - checked.at > 600e3) checked = { at: Date.now(), p: api('accounts/check').catch(() => ({})) };
  return checked.p;
}

// Liens remplacés par leur lien court suivi (pdkl.app), avec la lettre du réseau (clics comptés)
const trackedMap = new Map();   // réseau|texte -> texte suivi (ou demande en cours)
const trackedNow = (raw, net = 'x') => { const t = trackedMap.get(`${net}|${raw}`); return typeof t === 'string' ? t : raw; };
function tracked(raw, title, net = 'x') {
  if (!/https?:\/\//.test(raw) || !linksIn(raw).length) return Promise.resolve(raw);
  const key = `${net}|${raw}`;
  if (!trackedMap.has(key)) {
    trackedMap.set(key, api('links', { method: 'POST', body: JSON.stringify({ net, text: raw, title }) })
      .then((r) => { const t = r?.text || raw; trackedMap.set(key, t); return t; })
      .catch(() => { trackedMap.delete(key); return raw; }));
  }
  return Promise.resolve(trackedMap.get(key));
}

// ---------- X (publié dans l'appli X) ----------
// Sur téléphone, menu de partage avec les images (ou la vidéo) et le texte (choisir X ; texte aussi copié, à coller
// si l'appli ne le reprend pas), sinon l'appli X. Sur ordinateur, x.com avec le texte et les fichiers téléchargés
const toBlob = (cv, type = 'image/png', q) => new Promise((r) => cv.toBlob(r, type, q));
export async function openX(canvases, raw, video = null) {
  const files = video ? [video.full || video] : await Promise.all(canvases.map(async (cv, i) => new File([await toBlob(cv)], `x-${i + 1}.png`, { type: 'image/png' })));
  return shareToX(files, trackedNow(raw));
}
export async function shareToX(files, text) {
  navigator.clipboard?.writeText(text).catch(() => {});
  const phone = IOS || /Android/.test(navigator.userAgent);
  if (phone && navigator.canShare?.({ files })) {
    try { await navigator.share({ files, text }); } catch { /* partage annulé */ }
    return;
  }
  if (phone) { location.href = `twitter://post?message=${encodeURIComponent(text)}`; return; }
  open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  for (const f of files) { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); }
}
// Images au format X (4 au plus), dessinées pour X
export function xCanvases(d, o) {
  const list = chosenSlides(slidesFor(d, { fmt: 'x', follow: state.follow, question: state.question }), [...state.skip]).slice(0, 4);
  return list.map((sl) => drawSlide(document.createElement('canvas'), sl, 'x', d, { ...o, slides: list }));
}

// ---------- Envoi ----------
// JPEG de moins de max octets : qualité baissée au besoin, puis visuel réduit (diapo photo très détaillée,
// encodeur de Safari qui produit des fichiers bien plus lourds)
async function fitJpeg(cv, max) {
  let b = null;
  for (const q of [0.92, 0.85, 0.75, 0.6, 0.45]) { b = await toBlob(cv, 'image/jpeg', q); if (b.size <= max) return b; }
  for (const k of [0.85, 0.7, 0.55, 0.4]) {
    const cnv = document.createElement('canvas');
    cnv.width = Math.round(cv.width * k); cnv.height = Math.round(cv.height * k);
    cnv.getContext('2d').drawImage(cv, 0, 0, cnv.width, cnv.height);
    b = await toBlob(cnv, 'image/jpeg', 0.8);
    if (b.size <= max) break;
  }
  return b;
}
// Visuels : format Instagram (Instagram, Facebook, Threads) ou Story (stories) ; Bluesky : 4 au format X, moins de 1 Mo
const isStory = (n) => n.endsWith('-story');
async function postImages(d, o, nets, skip = state.skip) {
  const draw = (fmt, max, n = 99) => {
    const list = chosenSlides(slidesFor(d, { fmt, follow: state.follow, question: state.question }), [...(skip || [])]).slice(0, n);
    return Promise.all(list.map(async (sl) => Object.assign(await fitJpeg(drawSlide(document.createElement('canvas'), sl, fmt, d, { ...o, slides: list }), max), { alt: slideAlt(d, sl) })));
  };
  return { ig: nets.some((n) => n !== 'bluesky') ? await draw(nets.some(isStory) ? 'story' : 'ig', 3.5e6) : [], x: nets.includes('bluesky') ? await draw('x', 950 * 1024, 4) : [] };
}
// Un envoi confié au serveur (visuels ou vidéo, textes), publié à l'heure `at` même page fermée.
// alt : post jumeau (textes donnés, toutes ses images) ; tk : réglages d'une publication directe TikTok
async function queuePost(d, o, nets, at, record, { video = null, tk = null, link = null, alt = null, id = null } = {}) {
  const imgs = video || link ? { ig: [], x: [] } : await postImages(d, o, nets, alt ? new Set() : state.skip);
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

// Ce qui part sur chaque réseau, en clair (feuille « Vérifier »)
function planLines(plan, d, vid, lk, tk) {
  const n = chosenSlides(slidesFor(d, { fmt: 'ig', follow: state.follow, question: state.question }), [...state.skip]).length;
  const imgs = (k) => `${k} image${k > 1 ? 's' : ''}`;
  const what = (net, f) => (f === 'feed' ? (net === 'instagram' && n > 1 ? `carrousel de ${imgs(n)}` : imgs(net === 'bluesky' ? Math.min(n, 4) : n))
    : f === 'video' ? (net === 'tiktok' ? (tk ? `vidéo publiée, visible par : ${TIKTOK_PRIVACY[tk.privacy]}` : 'vidéo en brouillon (texte copié, à coller dans TikTok)') : net === 'youtube' ? 'Short en privé' : net === 'instagram' ? 'Reel' : 'vidéo')
    : f === 'story' ? (vid ? 'story vidéo (24 h)' : `${Math.min(n, 10)} stor${n > 1 ? 'ies' : 'y'} (24 h)`)
    : f === 'manual' ? 'rappel dans « Reste à faire » (texte et visuels prêts, à publier dans l\'appli X)'
    : `lien vers l'article (${new URL(lk.url).hostname.replace(/^www\./, '')})`);
  return NETS.filter(([k]) => plan[k]?.length).map(([k, name]) => `<li><b>${name}</b> · ${plan[k].map((f) => what(k, f)).join(' + ')}</li>`).join('');
}

// Feuille « Vérifier » : ce qui part où, maintenant ou à une heure choisie, puis envoi.
// ctx : { d, o(), record, vid, lk, twin(), onSent(at) } ; mode : 'now' ou 'later'
const localValue = (t) => new Date(t - t.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
export function confirmPublish(ctx, mode = 'now') {
  const { d, record, vid, lk } = ctx;
  const plan = cur.plan;
  const jobs = jobsOf(plan, vid);
  if (!jobs.length && !plan.x?.includes('manual')) { toast('Choisissez au moins un format sur un réseau', 'bad'); return; }
  if (plan.tiktok?.length && tiktokProblem()) { toast(tiktokProblem(), 'bad'); return; }
  const tk = plan.tiktok?.length ? tiktokChoice() : null;
  // Textes trop longs (bloquant) ; carrousel au-delà de ce qu'accepte un réseau (avertissement)
  const feedNets = jobs.find((j) => j.kind === 'feed')?.nets || [];
  const pb = postProblems(Object.keys(plan).filter((n) => n !== 'x' && plan[n].some((f) => f !== 'story')), textOf, feedNets.length ? chosenSlides(slidesFor(d, { fmt: 'ig', follow: state.follow, question: state.question }), [...state.skip]).length : 0);
  const block = pb.find((p) => p.block);
  if (block) { toast(problemText(block), 'bad'); return; }
  const twin0 = feedNets.length ? ctx.twin() : null;
  const t = new Date(Date.now() + 3600e3);
  t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15, 0, 0);
  const slot = bestSlot(store.get('poststats')?.v);
  const dlg = sheet('Vérifier avant de publier', `<ul class="plan">${planLines(plan, d, vid, lk, tk)}</ul>
    ${twin0 ? toggle('withtwin', `Publier aussi « ${twin0.record.title} »`, true, `Son propre post, sur ${feedNets.map((n) => NET_NAMES[n]).join(', ')}, en même temps`) : ''}
    ${pb.length ? `<p class="hint err">${esc(pb.map(problemText).join(' · '))}</p>` : ''}
    <div class="seg wide" id="when-mode"><button data-m="now" class="${mode === 'now' ? 'on' : ''}">Maintenant</button><button data-m="later" class="${mode === 'later' ? 'on' : ''}">Programmer</button></div>
    <div id="when-box" ${mode === 'later' ? '' : 'hidden'}><label class="field"><span>Date et heure</span><input type="datetime-local" id="when" value="${localValue(t)}"></label>
      ${slot ? `<p class="hint">Conseil : d'après vos ${slot.n} derniers posts, ceux publiés entre ${slot.from} h et ${slot.to} h ont ${String(slot.ratio).replace('.', ',')} fois plus de réactions que la moyenne. <button type="button" class="linkbtn" id="bestslot">Choisir ${slot.from + 1} h</button></p>` : ''}</div>
    <p class="hint" id="sendst">${mode === 'now' ? 'Publication dans la minute, même page fermée.' : 'Publié à l\'heure choisie, même page fermée (7 jours à l\'avance au plus).'}</p>
    <button class="btn primary wide" id="dosend">${icon(mode === 'now' ? 'send' : 'clock')}${mode === 'now' ? 'Publier maintenant' : 'Programmer'}</button>`);
  const setMode = (m) => {
    mode = m;
    for (const b of $$('[data-m]', dlg)) b.classList.toggle('on', b.dataset.m === m);
    $('#when-box', dlg).hidden = m !== 'later';
    $('#dosend', dlg).innerHTML = `${icon(m === 'now' ? 'send' : 'clock')}${m === 'now' ? 'Publier maintenant' : 'Programmer'}`;
    $('#sendst', dlg).textContent = m === 'now' ? 'Publication dans la minute, même page fermée.' : 'Publié à l\'heure choisie, même page fermée (7 jours à l\'avance au plus).';
    glide(dlg);
  };
  for (const b of $$('[data-m]', dlg)) b.onclick = () => setMode(b.dataset.m);
  glide(dlg);
  if ($('#bestslot', dlg)) {
    $('#bestslot', dlg).onclick = () => {
      const next = new Date();
      next.setHours(slot.from + 1, 0, 0, 0);
      if (next.getTime() < Date.now() + 10 * 60e3) next.setDate(next.getDate() + 1);
      $('#when', dlg).value = localValue(next);
    };
  }
  $('#dosend', dlg).onclick = async () => {
    const at = mode === 'now' ? Date.now() : new Date($('#when', dlg).value).getTime();
    const st = $('#sendst', dlg);
    if (!Number.isFinite(at) || at < Date.now() - 60e3) { st.className = 'hint err'; st.textContent = 'Choisissez une heure à venir'; return; }
    const btn = $('#dosend', dlg);
    const twin = twin0 && $('#withtwin', dlg).checked ? twin0 : null;
    btn.disabled = true;
    st.className = 'hint';
    // Brouillon TikTok : TikTok ne prend pas son texte, copié pour être collé dans la description
    const tkText = plan.tiktok?.length && !tk && textOf('tiktok');
    if (tkText) navigator.clipboard?.writeText(tkText).catch(() => {});
    try {
      const o = await ctx.o();
      // Un envoi par sorte de contenu ; ceux déjà partis (essai précédent) ne repartent pas
      for (const j of jobs) {
        if (cur.sent.has(j.kind)) continue;
        st.textContent = `Envoi ${j.kind === 'video' ? 'de la vidéo' : j.kind === 'link' ? 'du lien' : j.kind === 'story' ? 'des stories' : 'des visuels'}…`;
        cur.ids[j.kind] ||= rid();
        await queuePost(d, o, j.nets, at, record, { video: j.kind === 'video' ? vid : null, tk: j.nets.includes('tiktok') ? tk : null, link: j.kind === 'link' ? lk : null, id: cur.ids[j.kind] });
        cur.sent.add(j.kind);
      }
      if (twin && !cur.sent.has('twin')) {
        cur.ids.twin ||= rid();
        try { await queuePost(twin.data, o, feedNets, at, twin.record, { alt: twin, id: cur.ids.twin }); } catch (err) { throw new Error(`Post principal envoyé ; « ${twin.record.title} » : ${err.message}`); }
        cur.sent.add('twin');
      }
      await addTodos(ctx, plan, at, tk).catch((err) => toast(`« Reste à faire » : ${err.message}`, 'bad'));
      store.set(`plan.${cur.kind}`, plan);   // formats repris au prochain post de ce type
      cur.sent = new Set(); cur.ids = {};
      dlg.close();
      ctx.onSent(at, mode, tkText);
    } catch (err) {
      st.className = 'hint err';
      st.textContent = err.message;
      btn.disabled = false;
    }
  };
}

// « Reste à faire » (onglet Publications) : X (texte, images ou vidéo prêts), brouillon TikTok à finir, Short privé
async function addTodos(ctx, plan, at, tk) {
  const title = ctx.record?.title || ctx.d.title || 'Post';
  const add = async (kind, name, text, files = []) => {
    const form = new FormData();
    form.append('kind', kind); form.append('title', name); form.append('text', text); form.append('after', String(at));
    files.forEach((f) => form.append('f', f, f.name));
    await api('todo', { method: 'POST', body: form });
  };
  if (plan.x?.includes('manual')) {
    const c = $('#cap-comment')?.value.trim();
    const files = ctx.vid ? [ctx.vid.full || ctx.vid] : await Promise.all(xCanvases(ctx.d, await ctx.o()).map(async (cv, i) => new File([await fitJpeg(cv, 3.5e6)], `x-${i + 1}.jpg`, { type: 'image/jpeg' })));
    await add('x', `Publier sur X : ${title}`, `${trackedNow($('#cap-x').value)}${c ? `\n\n— En réponse au post —\n${trackedNow(c)}` : ''}`, files);
  }
  if (plan.tiktok?.length && !tk) await add('tiktok', `Finir le brouillon TikTok : ${title}`, textOf('tiktok'));
  if (plan.youtube?.length) await add('youtube', `Passer le Short en public : ${title}`, textOf('youtube').split('\n')[0]);
}

// Après l'envoi : état de chaque réseau relu tant que la page reste ouverte (5 minutes au plus)
export function followSent(list, nets, at) {
  for (const n of nets) { const s = $(`[data-st="${n}"]`); if (s) { s.className = 'st'; s.textContent = at > Date.now() + 60e3 ? `Programmé le ${new Date(at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Publication dans la minute'; } }
  schedList(list);
  if (at > Date.now() + 60e3) return;
  let k = 0;
  const poll = setInterval(async () => {
    if (++k > 20 || !list.isConnected) { clearInterval(poll); return; }
    const items = await schedList(list);
    if (items && !items.some((x) => Object.values(x.nets).some((s) => s.status === 'pending' || s.status === 'running'))) {
      clearInterval(poll);
      for (const n of nets) { const s = $(`[data-st="${n}"]`); if (s) { s.className = 'st ok'; s.innerHTML = `Publié ${icon('check')}`; } }
    }
  }, 15e3);
}
export const planNets = () => Object.keys(cur?.plan || {}).filter((n) => cur.plan[n].length);
