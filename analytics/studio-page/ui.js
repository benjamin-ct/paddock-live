// Studio : outils communs à toutes les vues (accès au serveur, mémoire du téléphone, icônes,
// messages, état de la page).
import { TRACKS, trackOf, previewTrack } from '/shared/social-music.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const SIG = '@BenjyPaddock';
export const NET_NAMES = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', x: 'X', bluesky: 'Bluesky', tiktok: 'TikTok', youtube: 'YouTube', 'instagram-story': 'Story Instagram', 'facebook-story': 'Story Facebook' };

// Réglages de la page (gardés pendant la visite) et comptes connectés (réponse de /me)
export const state = { tab: 'news', fmt: 'ig', noSpoiler: true, photos: true, all: false, linkComment: true, follow: false, question: true, stype: 'raceweek', round: null, nsort: 'top', nkind: null, ssub: 'accounts', skip: new Set() };
export const session = { me: null };

// iPhone / iPad, et page ouverte depuis l'écran d'accueil (sans la barre de Safari)
export const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const ago = (ts) => { const m = Math.max(1, Math.round((Date.now() - ts) / 60e3)); return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} j`; };
export const fmtN = (v) => (v == null ? '—' : Number(v).toLocaleString('fr-FR'));

// ---------- Mémoire du téléphone (affichage immédiat à la visite suivante) ----------
export const store = {
  get(k, ttl = Infinity) {
    try {
      const hit = JSON.parse(localStorage.getItem(`studio.${k}`) || 'null');
      return hit && Date.now() - hit.at < ttl ? hit : null;
    } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(`studio.${k}`, JSON.stringify({ at: Date.now(), v })); return true; } catch { return false; }
  },
  del(k) { try { localStorage.removeItem(`studio.${k}`); } catch { /* stockage bloqué */ } },
};

// ---------- Accès au serveur ----------
const KEY = 'studio.key';
let key = null;
try { key = localStorage.getItem(KEY) || sessionStorage.getItem(KEY); } catch { /* stockage bloqué */ }
export const hasKey = () => !!key;
export function setKey(k, keep) {
  key = k;
  try { (keep ? localStorage : sessionStorage).setItem(KEY, k); } catch { /* stockage bloqué */ }
}
let logoutHook = () => {};
export const onLogout = (fn) => { logoutHook = fn; };
export function forgetKey() {
  key = null;
  session.me = null;
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch { /* stockage bloqué */ }
  for (const k of ['news', 'stats', 'sessions', 'me', 'history']) store.del(k);
}

// Lectures limitées à 30 secondes : une requête bloquée (application mise en pause par l'iPhone,
// réseau perdu) échoue au lieu de laisser la page en chargement pour toujours. Les envois (vidéos,
// publications) n'ont pas de limite.
const READ_TIMEOUT = 30e3;
export async function api(path, { method = 'GET', body, raw = false } = {}) {
  const signal = method === 'GET' && AbortSignal.timeout ? AbortSignal.timeout(READ_TIMEOUT) : undefined;
  let res;
  try {
    res = await fetch(`/studio/api/${path}`, { method, body, signal, headers: { 'X-Studio-Key': key || '' } });
  } catch (err) {
    throw err?.name === 'TimeoutError' ? new Error('Le serveur ne répond pas (réseau lent ou coupé) : réessayez') : err;
  }
  if (res.status === 401) { forgetKey(); logoutHook(); throw new Error('Code incorrect'); }
  if (raw) {
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`);
    return res;
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
  return j;
}

export async function mapLimit(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); }
  }));
  return out;
}

// ---------- Icônes (traits, couleur du texte) ----------
const PATHS = {
  news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 8h3v9a2 2 0 0 1-2 2"/><path d="M7 9h7M7 13h7M7 17h4"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h13l-2.5 4.5L18 13H5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chart: '<path d="M5 20V11M11 20V5M17 20v-6M3 20h18"/>',
  settings: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  share: '<path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  rocket: '<path d="M12 15l-3-3c1.6-4.6 4.7-7.6 10-9 .3 5.3-2.8 8.4-7 10z"/><path d="M9 12H5l3-4h4M12 15v4l4-3v-4"/><path d="M6.5 16.5c-1.2.5-2 1.7-2 4 2.3 0 3.5-.8 4-2"/>',
  spark: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z"/>',
  link: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3z"/>',
  play: '<path d="M7 4.5l12 7.5-12 7.5z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  wand: '<path d="M4 20L15 9"/><path d="M14 4v2M18 8h2M17.5 5.5L19 4M10 6l1 1M18 13l1 1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;

// Logo Paddock Live (le même que la page des statistiques)
export const LOGO = '<svg class="logo" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="pl-lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2a1a"/><stop offset=".55" stop-color="#d40500"/><stop offset="1" stop-color="#8e0300"/></linearGradient></defs><rect width="512" height="512" rx="114" fill="url(#pl-lg)"/><g transform="translate(256 256) skewX(-14) translate(-256 -256)" fill="#fff" fill-rule="evenodd"><g transform="translate(234 168) scale(0.6) translate(-241 -256)"><path d="M118 150 H262 V202 H180 V240 H248 V290 H180 V362 H118 Z"/><path d="M300 150 H364 V362 H302 V214 L276 230 V178 Z"/></g><g transform="translate(278 344) scale(0.6) translate(-256 -256)"><path d="M108 150 H200 A68 68 0 0 1 200 286 H170 V362 H108 Z M170 200 H194 A18 18 0 0 1 194 236 H170 Z"/><path d="M262 150 H324 V306 H404 V362 H262 Z"/></g></g></svg>';

// ---------- Messages ----------
let toastTimer = null;
export function toast(text, kind = '') {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.className = `toast show ${kind}`;
  el.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = `toast ${kind}`; }, 2800);
}

// Lignes grises en attendant les données
export const skeleton = (n = 4) => `<div class="list">${Array.from({ length: n }, () => '<div class="card skel"><i style="width:28%"></i><i></i><i style="width:62%"></i></div>').join('')}</div>`;
export const empty = (text, ic = 'news') => `<div class="empty">${icon(ic)}<p>${esc(text)}</p></div>`;
export const failure = (err) => `<div class="empty err">${icon('alert')}<p>${esc(err?.message || err)}</p><button class="btn small" data-retry>${icon('refresh')}Réessayer</button></div>`;

// Segments (À la une / Plus récentes, Instagram / Story / X…) : pastille qui glisse sous le choix ;
// position retenue par segment (id) pour glisser aussi quand la vue est redessinée
const segPos = new Map();
export function glide(root = document) {
  for (const seg of root.querySelectorAll('.seg')) {
    const on = seg.querySelector('button.on');
    let th = seg.querySelector(':scope > .thumb');
    if (!th) { th = document.createElement('i'); th.className = 'thumb'; seg.prepend(th); }
    if (!on || !on.offsetWidth) { th.style.opacity = '0'; continue; }
    const pos = { x: on.offsetLeft, w: on.offsetWidth };
    const put = (p) => { th.style.transform = `translateX(${p.x}px)`; th.style.width = `${p.w}px`; };
    const prev = seg.id && segPos.get(seg.id);
    if (!th.dataset.ready) {
      th.style.transition = 'none';
      put(prev || pos);
      void th.offsetWidth;
      th.style.transition = '';
      th.dataset.ready = '1';
    }
    th.style.opacity = '1';
    put(pos);
    if (seg.id) segPos.set(seg.id, pos);
  }
}
addEventListener('resize', () => glide());
// iPhone : clavier refermé, ou retour dans le Studio depuis une autre appli (Snapchat…), en laissant toute la
// page décalée vers le haut (barre du haut cachée, barre du bas remontée au milieu de l'écran) : défilement
// ramené dans les limites de la page, ce qui remet tout en place
const typing = () => document.activeElement?.matches('input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable]');
const unshift = (ms) => setTimeout(() => {
  if (!typing()) scrollTo({ top: Math.max(0, Math.min(scrollY, document.documentElement.scrollHeight - innerHeight)) });
}, ms);
addEventListener('focusout', () => unshift(120));
addEventListener('pageshow', () => unshift(120));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') unshift(300); });
// Écran visible qui s'agrandit (clavier d'une autre appli refermé pendant le retour)
let vvh = visualViewport?.height || 0;
visualViewport?.addEventListener('resize', () => { if (visualViewport.height > vvh + 50) unshift(120); vvh = visualViewport.height; });

// Interrupteur (case à cocher) avec libellé et explication
export const toggle = (id, label, on, hint = '', attrs = '') => `<label class="switch"><span><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span><input type="checkbox" role="switch" ${id ? `id="${id}"` : ''} ${attrs} ${on ? 'checked' : ''}></label>`;

// Feuille qui monte du bas de l'écran (réglages, programmation…) ; renvoie l'élément <dialog>
export function sheet(title, html) {
  $('dialog.sheet')?.remove();
  const d = document.createElement('dialog');
  d.className = 'sheet';
  d.innerHTML = `<div class="sheet-head"><b>${esc(title)}</b><button class="iconbtn" data-close aria-label="Fermer">${icon('close')}</button></div><div class="sheet-body">${html}</div>`;
  document.body.append(d);
  d.querySelector('[data-close]').onclick = () => d.close();
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.addEventListener('close', () => d.remove());
  // Glisser vers le bas (depuis l'en-tête, ou n'importe où quand le contenu est en haut) : feuille
  // fermée, comme sur l'iPhone
  const body = d.querySelector('.sheet-body');
  let y0 = null;
  d.addEventListener('touchstart', (e) => {
    y0 = e.touches.length === 1 && (e.target.closest('.sheet-head') || body.scrollTop <= 0) ? e.touches[0].clientY : null;
  }, { passive: true });
  d.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy < 0 && !d.classList.contains('drag')) { y0 = null; return; }   // défilement vers le haut : contenu
    if (dy > 6) { d.classList.add('drag'); d.style.transform = `translateY(${dy}px)`; e.preventDefault(); }
  }, { passive: false });
  d.addEventListener('touchend', (e) => {
    const dy = y0 === null ? 0 : e.changedTouches[0].clientY - y0;
    const dragged = d.classList.contains('drag');
    y0 = null;
    d.classList.remove('drag');
    if (dragged && dy > 90) d.close(); else d.style.transform = '';
  });
  d.showModal();
  return d;
}

// ---------- Publications programmées (Stats et éditeur) ----------
const SCHED_ST = { pending: 'à venir', running: 'en cours…', done: 'publié', error: 'erreur', expired: 'abandonné (plus de 24 h de retard)' };
export async function schedList(el) {
  if (!el) return;
  // Publications du serveur (null si la liste n'a pas pu être lue)
  const r = await api('schedule').catch(() => null);
  const items = (r?.items || []).filter((j) => j.at > Date.now() - 2 * 86400e3);
  el.innerHTML = items.length ? `<h3 class="section">Publications programmées</h3><div class="list">${items.map((j) => {
    const states = Object.values(j.nets);
    const cancel = states.some((x) => x.status === 'pending') && !states.some((x) => x.status === 'running' || x.status === 'done' || x.sent);
    // Terminée (avec une erreur ou un envoi interrompu) : retirée de la liste à la main
    const over = states.every((x) => !['pending', 'running'].includes(x.status));
    return `<div class="card"><div class="card-top">${icon('clock')}<span>${esc(new Date(j.at).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}</span></div><div class="t">${esc(j.title || 'Post')}</div>
      <div class="nets-st">${Object.entries(j.nets).map(([n, x]) => `<div><span>${esc(NET_NAMES[n] || n)}</span>${x.status === 'done' && x.url ? `<a class="pill ok" href="${esc(x.url)}" target="_blank" rel="noopener">${SCHED_ST.done} ${icon('check')}</a>` : `<span class="pill ${x.status === 'error' || x.status === 'expired' ? 'bad' : ''}">${x.sent && x.status !== 'error' ? `en cours (${x.sent}/${x.total})` : esc(SCHED_ST[x.status] || x.status)}</span>`}`
        + (x.error ? `<small class="err">${esc(x.error)}</small>` : '')
        // Brouillon TikTok : son texte n'y est pas (TikTok ne le prend pas), à coller dans la description
        + (n === 'tiktok' && x.status === 'done' && !x.url && j.texts?.tiktok ? `<button class="btn small" data-copytk="${esc(j.id)}">${icon('copy')}Copier le texte</button>` : '')
        + (j.retry && ['error', 'expired'].includes(x.status) ? `<button class="btn small" data-retry="${esc(j.id)}" data-net="${esc(n)}">Réessayer</button>` : '')
        + (x.commentError ? `<small class="err">Commentaire refusé : ${esc(x.commentError)}</small>` : '')
        + (x.visible === false ? '<small class="err">Pas visible publiquement sur Threads : vérifiez le post (compte ou post masqué)</small>' : '') + '</div>').join('')}</div>
      ${cancel || over ? `<div class="row end">${cancel ? `<button class="btn small" data-edit="${esc(j.id)}">Modifier</button>` : ''}<button class="btn small" data-cancel="${esc(j.id)}" ${over ? 'data-over' : ''}>${over ? 'Retirer de la liste' : 'Annuler'}</button></div>` : ''}</div>`;
  }).join('')}</div>` : '';
  el.querySelectorAll('[data-cancel]').forEach((b) => {
    b.onclick = async () => {
      const over = 'over' in b.dataset;
      if (!confirm(over ? 'Retirer cette publication de la liste ?\n\nRien n\'est supprimé sur les réseaux.' : 'Annuler cette publication programmée ?')) return;
      b.disabled = true;
      try { await api('schedule/cancel', { method: 'POST', body: JSON.stringify({ id: b.dataset.cancel }) }); toast(over ? 'Retirée de la liste' : 'Publication annulée'); } catch (err) { alert(err.message); }
      schedList(el);
    };
  });
  el.querySelectorAll('[data-copytk]').forEach((b) => {
    b.onclick = () => navigator.clipboard.writeText(items.find((x) => x.id === b.dataset.copytk)?.texts?.tiktok || '')
      .then(() => toast('Texte copié : collez-le dans la description du brouillon TikTok', 'ok'), () => toast('Copie impossible', 'bad'));
  });
  // Réseau en erreur : renvoyé au relevé suivant (visuels gardés 24 h après la fin)
  el.querySelectorAll('[data-retry]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm(`Réessayer sur ${NET_NAMES[b.dataset.net] || b.dataset.net} ?\n\nSi l'erreur dit « vérifiez sur le réseau », regardez d'abord que le post n'y est pas déjà.`)) return;
      b.disabled = true;
      try { await api('schedule/retry', { method: 'POST', body: JSON.stringify({ id: b.dataset.retry, net: b.dataset.net }) }); toast('Nouvel essai dans la minute', 'ok'); } catch (err) { alert(err.message); }
      schedList(el);
    };
  });
  // Pas encore parti : heure et textes modifiables
  el.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => {
      const j = items.find((x) => x.id === b.dataset.edit);
      const local = (t) => new Date(t - new Date(t).getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
      const dlg = sheet('Modifier la publication', `<label class="field"><span>Date et heure</span><input type="datetime-local" id="edwhen" value="${local(j.at)}"></label>
        ${Object.entries(j.texts || {}).map(([n, t]) => `<label class="field"><span>${esc(NET_NAMES[n] || n)}</span><textarea rows="5" data-edtxt="${esc(n)}">${esc(t)}</textarea></label>`).join('')}
        <p class="hint" id="edst"></p><button class="btn primary wide" id="edsave">${icon('check')}Enregistrer</button>`);
      dlg.querySelector('#edsave').onclick = async () => {
        const texts = Object.fromEntries([...dlg.querySelectorAll('[data-edtxt]')].map((x) => [x.dataset.edtxt, x.value]));
        try {
          await api('schedule/update', { method: 'POST', body: JSON.stringify({ id: j.id, at: new Date(dlg.querySelector('#edwhen').value).getTime(), texts }) });
          dlg.close();
          toast('Publication modifiée', 'ok');
          schedList(el);
        } catch (err) { const st = dlg.querySelector('#edst'); st.className = 'hint err'; st.textContent = err.message; }
      };
    };
  });
  return r && (r.items || []);
}

// ---------- Musique des vidéos : morceaux fabriqués sur place (libres de droits), à écouter avant ----------
// kind : type de vidéo (choix gardé pour chacun) ; def : morceau proposé la première fois
export const musicField = (kind, def) => {
  const cur = trackOf(store.get(`track.${kind}`)?.v || def).id;
  return `<div class="field"><span>Musique <small>(fabriquée sur place, libre de droits)</small></span>
    <div class="row"><select id="vtrack">${TRACKS.map((x) => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><button type="button" class="btn small" id="vlisten">${icon('play')}Écouter</button></div>
    <small class="hint" id="vtrackdesc">${esc(trackOf(cur).desc)}</small></div>`;
};
// Branche la liste et l'écoute (15 s) ; renvoie le morceau choisi
export function bindMusic(kind) {
  let stop = null;
  const label = (st) => { if ($('#vlisten')) $('#vlisten').innerHTML = st === 'loading' ? `${icon('stop')}Préparation…` : st === 'playing' ? `${icon('stop')}Arrêter` : `${icon('play')}Écouter`; };
  const end = () => { stop?.(); stop = null; label('ended'); };
  const listen = () => {
    end();
    const me = stop = previewTrack($('#vtrack').value, (st) => { if (stop !== me) return; if (st === 'ended') end(); else label(st); });
    label('loading');
  };
  $('#vtrack').onchange = (e) => {
    store.set(`track.${kind}`, e.target.value);
    $('#vtrackdesc').textContent = trackOf(e.target.value).desc;
    if (stop) listen();
  };
  $('#vlisten').onclick = () => (stop ? end() : listen());
  addEventListener('popstate', end, { once: true });
  return () => $('#vtrack').value;
}

// Vidéo fabriquée sur place, jointe au post si elle est en MP4 (format accepté par tous les réseaux)
// Partage d'une vidéo fabriquée (sinon téléchargement) ; full : version plein écran (X, Bluesky…)
export async function shareClip(clip, name, full = false) {
  const v = full ? clip.full : clip;
  const file = new File([v.blob], `${name}${full ? '-plein-ecran' : ''}.${v.mime.includes('mp4') ? 'mp4' : 'webm'}`, { type: v.mime });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch { /* annulé */ } return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
}

// Vidéo fabriquée (MP4) avec sa couverture (JPEG, envoyée à Instagram et Facebook) et sa version plein écran
export const clipFile = (clip, name) => (clip?.mime.includes('mp4') ? Object.assign(new File([clip.blob], `${name}.mp4`, { type: 'video/mp4' }), {
  cover: clip.cover || null, vsize: '1080x1920', full: clip.full?.mime.includes('mp4') ? new File([clip.full.blob], `${name}-plein-ecran.mp4`, { type: 'video/mp4' }) : null,
}) : null);
