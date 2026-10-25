// Mode créateur : publication des posts sur les réseaux (X, Instagram, Facebook, Threads), envoi
// de la vidéo en brouillon sur TikTok et en privé sur YouTube Shorts ; configuration des comptes.
import { $, esc, storageGet, storageSet } from '../util.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { toast } from './delay.js';
import { makeVideo, unlockAudio } from '/shared/social-video.js';
import { TRACKS, trackOf, previewTrack } from '/shared/social-music.js';
import { postProblems } from '/shared/post-check.js';
import { videoTexts } from '/shared/social.js';

const NETS = [
  { id: 'instagram', name: 'Instagram', what: 'Carrousel des visuels (format Instagram)' },
  { id: 'facebook', name: 'Facebook', what: 'Post sur la page avec les visuels' },
  { id: 'threads', name: 'Threads', what: 'Carrousel des visuels' },
  { id: 'x', name: 'X', what: '4 visuels au format X' },
  { id: 'bluesky', name: 'Bluesky', what: '4 visuels au format X (gratuit)' },
  { id: 'tiktok', name: 'TikTok', what: 'Vidéo en brouillon : vous ajoutez le son et publiez dans l\'appli TikTok' },
  { id: 'youtube', name: 'YouTube Shorts', what: 'Vidéo envoyée en privé (publique après l\'audit YouTube)' },
];
const VIDEO_NETS = ['tiktok', 'youtube'];

const api = async (path, body) => {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
  return j;
};
const b64 = (blob) => new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
const png = async (canvas) => b64(await new Promise((r) => canvas.toBlob(r, 'image/png')));
// JPEG de moins de 1 Mo (limite de Bluesky) : qualité baissée si besoin
async function jpegUnder(canvas, max = 950 * 1024) {
  let blob = null;
  for (const q of [0.92, 0.85, 0.75, 0.6, 0.45]) {
    blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob.size <= max) break;
  }
  return b64(blob);
}

let video = null;   // { blob, mime, url }
// Date locale pour un champ « datetime-local »
const localInput = (ts) => { const x = new Date(ts); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
// Heure où les posts publiés ont eu le plus d'interactions (3 posts au moins avec des statistiques)
export function bestHour(posts) {
  const by = new Map();
  for (const p of posts) {
    const s = Object.values(p.stats || {}).filter((x) => x && !x.error);
    if (!s.length) continue;
    const score = s.reduce((a, x) => a + (x.likes || 0) + 2 * (x.comments || 0) + 3 * (x.shares || 0) + (x.views || x.reach || 0) / 100, 0);
    const h = new Date(p.at).getHours();
    by.set(h, [...(by.get(h) || []), score]);
  }
  const n = [...by.values()].reduce((a, l) => a + l.length, 0);
  if (n < 3) return null;
  return [...by.entries()].map(([h, l]) => [h, l.reduce((a, b) => a + b, 0) / l.length]).sort((a, b) => b[1] - a[1])[0][0];
}
const KEYS_NOTE = "Les clés restent sur cet ordinateur, hors des sauvegardes de réglages.";
// ---------- Musique des vidéos : morceaux fabriqués sur place (libres de droits) ----------
// Choix gardé par type de vidéo (course, news, diaporama), à écouter avant (15 s)
const TRACK_KEY = 'paddock.videoTrack';
const TRACK_DEF = { race: 'depart', news: 'flash', slides: 'electro' };
export const trackKind = (d) => (d.post === 'racelaps' ? 'race' : d.news ? 'news' : 'slides');
export const savedTrack = (kind) => trackOf(storageGet(TRACK_KEY, {})[kind] || TRACK_DEF[kind]).id;
export const musicSelect = (kind) => `<select class="small" data-vtrack="${kind}" title="${t('Musique fabriquée sur place, libre de droits')}">${TRACKS.map((x) => `<option value="${x.id}" ${x.id === savedTrack(kind) ? 'selected' : ''} title="${esc(t(x.desc))}">${esc(t(x.name))}</option>`).join('')}</select>
  <button class="btn small" data-vlisten>${icon('play')} ${t('Écouter')}</button>`;
let stopPreview = null;
const endPreview = () => { stopPreview?.(); stopPreview = null; document.querySelectorAll('[data-vlisten]').forEach((b) => { b.innerHTML = `${icon('play')} ${t('Écouter')}`; }); };
// À appeler pour chaque clic ou changement de la fenêtre : true si l'événement était pour la musique
export function musicEvent(e) {
  const sel = e.target.closest?.('[data-vtrack]');
  if (e.type === 'change' && sel) {
    storageSet(TRACK_KEY, { ...storageGet(TRACK_KEY, {}), [sel.dataset.vtrack]: sel.value });
    if (stopPreview) { endPreview(); sel.nextElementSibling?.click(); }
    return true;
  }
  const btn = e.type === 'click' && e.target.closest('[data-vlisten]');
  if (!btn) return false;
  if (stopPreview) { endPreview(); return true; }
  const me = stopPreview = previewTrack(btn.previousElementSibling.value, (st) => {
    if (stopPreview !== me) return;
    if (st === 'ended') endPreview();
    else btn.innerHTML = `${icon('stop')} ${t('Arrêter')}`;
  });
  btn.innerHTML = `${icon('stop')} ${t('Préparation…')}`;
  return true;
}
export { endPreview };

const MUSIC_NOTE = "Votre musique : vérifiez que vous avez le droit de l'utiliser.";
const PUBLIC_NOTE = "Les posts seront publics (TikTok : brouillon ; YouTube : Short privé avant l'audit).";

// ---------- Comptes ----------
const HELP = {
  x: ["Sans clés : boutons « Publier gratuitement » dans la fenêtre Posts. Les clés ne servent qu'à publier automatiquement.",
    'developer.x.com : créez un projet et une app (accès payant à l\'usage, environ 0,015 $ par post).',
    'Dans l\'app, « User authentication settings » : autorisations « Read and write ».',
    '« Keys and tokens » : copiez API Key et API Key Secret, puis générez Access Token et Access Token Secret.'],
  meta: ['Passez votre compte Instagram en compte professionnel (créateur) et reliez-le à votre page Facebook.',
    'developers.facebook.com : créez une app (type Business) ; identifiant et clé secrète dans Paramètres → Général.',
    'Facebook Login for Business → Paramètres : ajoutez {} dans « URI de redirection OAuth valides ». Créez une configuration (jeton d\'accès utilisateur) avec pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_engagement, read_insights, instagram_basic, instagram_content_publish, instagram_manage_insights et business_management, et copiez son ID.',
    'Collez identifiant, clé secrète et ID de configuration, puis « Se connecter à Facebook ». Sans configuration : Outils → Explorateur de l\'API Graph, mêmes autorisations, « Generate Access Token », et collez le jeton.'],
  threads: ['Dans l\'app Meta, ajoutez « Accéder à l\'API Threads » (threads_basic, threads_content_publish, threads_manage_replies, threads_manage_insights).',
    'Ajoutez votre compte Threads comme testeur et acceptez l\'invitation dans Threads.',
    'Copiez la clé secrète Threads et générez un jeton avec « User Token Generator ».'],
  threads2: ['Statistiques d\'un deuxième compte Threads : même app Meta, compte ajouté comme testeur (invitation à accepter dans Threads).',
    'Générez un jeton pour ce compte (« User Token Generator ») et collez-le avec la clé secrète.'],
  bluesky: ['Bluesky : Paramètres → Confidentialité et sécurité → Mots de passe d\'application.',
    'Votre identifiant (ex. pseudo.bsky.social) et ce mot de passe d\'application (pas votre mot de passe principal).'],
  tiktok: ['developers.tiktok.com → Manage apps : créez une app avec Login Kit (plateforme Desktop) et Content Posting API.',
    'Login Kit : ajoutez l\'adresse de redirection {}.',
    'Autorisations user.info.basic et video.upload ; ajoutez votre compte TikTok comme utilisateur de test (sandbox).',
    'Publication directe : activez « Direct Post » (video.publish) dans Content Posting API, cochez « Publication directe » et reconnectez-vous. Avant l\'audit TikTok, vidéos visibles par vous seul.',
    'Statistiques : ajoutez user.info.profile, user.info.stats et video.list, cochez « Statistiques » et reconnectez-vous.',
    'Collez client key et client secret, enregistrez, puis « Se connecter à TikTok ».'],
  tiktok2: ['Statistiques d\'un deuxième compte TikTok : même app, autorisations user.info.profile, user.info.stats et video.list, compte ajouté comme utilisateur de test.',
    'Connectez-vous d\'abord à TikTok avec ce compte dans le navigateur, puis « Se connecter à TikTok ».'],
  youtube: ['console.cloud.google.com : créez un projet, puis API et services → Bibliothèque : activez « YouTube Data API v3 ».',
    'Écran de consentement OAuth : type « Externe », puis ajoutez le compte Google de la chaîne dans « Utilisateurs test ».',
    'Identifiants → Créer un client OAuth « Application de bureau » : copiez l\'ID et le code secret.',
    'Collez-les ici, enregistrez, puis « Se connecter à YouTube ». « Application non validée » : continuez, c\'est votre projet.',
    'En mode « Test », Google déconnecte au bout de 7 jours : publiez l\'application dans l\'écran de consentement.',
    'Tant que votre projet Google n\'a pas passé l\'audit de l\'API YouTube (demande gratuite : support.google.com/youtube/contact/yt_api_form), les vidéos restent privées.'],
};
const FIELDS = {
  x: [['apiKey', 'API Key'], ['apiSecret', 'API Key Secret'], ['accessToken', 'Access Token'], ['accessSecret', 'Access Token Secret']],
  meta: [['appId', 'Identifiant de l\'app'], ['appSecret', 'Clé secrète de l\'app'], ['configId', 'ID de configuration (Facebook Login for Business)'], ['userToken', 'Jeton d\'accès (Explorateur de l\'API Graph, sans « Se connecter »)']],
  threads: [['appSecret', 'Clé secrète Threads'], ['token', 'Jeton Threads']],
  threads2: [['appSecret', 'Clé secrète Threads'], ['token', 'Jeton Threads']],
  bluesky: [['handle', 'Identifiant Bluesky'], ['appPassword', 'Mot de passe d\'application']],
  tiktok: [['clientKey', 'Client key'], ['clientSecret', 'Client secret']],
  tiktok2: [],
  youtube: [['clientId', 'ID client'], ['clientSecret', 'Code secret du client']],
};
const TITLES = { x: 'X', meta: 'Instagram + Facebook', threads: 'Threads', threads2: 'Threads (2e compte, statistiques)', bluesky: 'Bluesky', tiktok: 'TikTok', tiktok2: 'TikTok (2e compte, statistiques)', youtube: 'YouTube Shorts' };
// Connexion par le navigateur (OAuth) : bouton « Se connecter à … » ; Facebook revient par la page du site
const META_REDIRECT = 'https://paddocklive.app/fb-callback';
const OAUTH = { meta: 'Facebook', tiktok: 'TikTok', tiktok2: 'TikTok', youtube: 'YouTube' };

// open : section gardée ouverte après un enregistrement (sinon tout se replie)
async function accountsDialog(onChange, open = null) {
  let dlg = $('#socialAccDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'socialAccDlg';
    dlg.className = 'modal posts-acc-dlg';
    document.body.appendChild(dlg);
  }
  const info = await api('/api/social/accounts');
  const studio = await api('/api/social/studio').catch(() => ({ enabled: false }));
  const status = (k) => {
    const a = k === 'meta' ? [info.facebook, info.instagram] : [info[k]];
    const on = a.filter((x) => x?.connected);
    if (on.length) return `<span class="posts-ok">${icon('check')} ${esc(on.map((x) => x.name).filter(Boolean).join(' · ') || t('Connecté'))}</span>`;
    return OAUTH[k] && info[k]?.configured ? `<span class="muted">${t('Clés enregistrées, compte non connecté')}</span>` : `<span class="muted">${t('Non connecté')}</span>`;
  };
  const redirect = `http://127.0.0.1:${location.port || 80}/tiktok-callback/`;
  dlg.innerHTML = `<div class="sum-head"><b>${icon('lock')} ${t('Comptes des réseaux sociaux')}</b><button class="icon-btn" data-close title="${t('Fermer')}">${icon('close')}</button></div>
    <div class="posts-acc-body">
      <p class="small muted">${t(KEYS_NOTE)}</p>
      ${Object.keys(FIELDS).map((k) => `<details class="posts-acc" data-net="${k}" ${k === open ? 'open' : ''}><summary><b>${TITLES[k]}</b> ${status(k)}</summary>
        <ol class="small">${HELP[k].map((h) => `<li>${esc(t(h, k === 'meta' ? META_REDIRECT : redirect))}</li>`).join('')}</ol>
        ${FIELDS[k].map(([f, l]) => `<label class="small">${esc(t(l))}<input type="password" data-f="${f}" autocomplete="off" spellcheck="false"></label>`).join('')}
        ${k === 'tiktok' ? `<label class="toggle small"><input type="checkbox" data-f="direct" ${info.tiktok?.direct ? 'checked' : ''}> ${t('Publication directe (Direct Post activé dans votre app TikTok)')}</label>
          <label class="toggle small"><input type="checkbox" data-f="stats" ${info.tiktok?.stats ? 'checked' : ''}> ${t('Statistiques (user.info.stats et video.list ajoutés dans votre app TikTok)')}</label>` : ''}
        <div class="row">${FIELDS[k].length ? `<button class="btn small btn-accent" data-save>${t('Enregistrer et vérifier')}</button>` : ''}
          ${OAUTH[k] ? `<button class="btn small ${info[k]?.configured && !info[k]?.connected ? 'btn-accent' : ''}" data-login ${info[k]?.configured || k === 'meta' ? '' : 'disabled'}>${t('Se connecter à {}', OAUTH[k])}</button>` : ''}
          <button class="btn small" data-remove>${t('Déconnecter')}</button></div></details>`).join('')}
      <details class="posts-acc" data-studio ${studio.enabled ? '' : 'open'}><summary><b>${t('Page web (téléphone)')}</b> ${studio.enabled ? `<span class="posts-ok">${icon('check')} ${t('Activée')}</span>` : `<span class="muted">${t('Désactivée')}</span>`}</summary>
        <p class="small">${t("Préparez et publiez les posts depuis votre téléphone, même ordinateur éteint. Comptes et connexion F1 TV envoyés chiffrés au serveur.")}</p>
        ${studio.enabled ? `<p class="small">${t('Adresse :')} <a href="${esc(studio.url)}" target="_blank" rel="noopener">${esc(studio.url)}</a> — ${t('entrez avec le code du mode créateur.')}</p>
          ${studio.error ? `<p class="small posts-warn">${icon('warning')} ${esc(studio.error)}</p>` : ''}
          ${studio.f1tv ? '' : `<p class="small muted">${icon('info')} ${t('Posts des séances : connectez F1 TV (Réglages → Compte F1 TV).')}</p>`}
          ${studio.backup ? '' : `<p class="small muted">${icon('info')} ${t('Pour retrouver tous les comptes sur un autre ordinateur (en y activant le mode créateur), entrez le code une fois : copie chiffrée ici, illisible par le serveur.')}</p>
          <label class="small">${t('Code du mode créateur')}<input type="password" data-studio-code autocomplete="off" spellcheck="false"></label>
          <div class="row"><button class="btn small" data-studio-on>${t('Garder une copie des comptes')}</button></div>`}
          <div class="row"><button class="btn small" data-studio-copy>${icon('doc')} ${t("Copier l'adresse")}</button><button class="btn small" data-studio-sync>${t('Renvoyer les comptes')}</button><button class="btn small" data-studio-off>${t('Désactiver')}</button></div>`
        : `<label class="small">${t('Code du mode créateur')}<input type="password" data-studio-code autocomplete="off" spellcheck="false"></label>
          <div class="row"><button class="btn small btn-accent" data-studio-on>${t('Activer la page web')}</button></div>`}
      </details>
    </div>`;
  dlg.onclick = async (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) { dlg.close(); onChange?.(); return; }
    const sbtn = e.target.closest('[data-studio] button');
    if (sbtn) {
      try {
        sbtn.disabled = true;
        if (sbtn.dataset.studioOn !== undefined) {
          await api('/api/social/studio', { code: $('[data-studio-code]', dlg).value });
          toast(t(studio.enabled ? 'Copie des comptes enregistrée' : 'Page web activée'), 3000, 'check');
        } else if (sbtn.dataset.studioSync !== undefined) {
          const r = await api('/api/social/studio', { sync: true });
          if (r.error) throw new Error(r.error);
          toast(t('Comptes envoyés'), 2500, 'check');
        } else if (sbtn.dataset.studioOff !== undefined) {
          if (!window.confirm(t('Désactiver la page web ? Les comptes envoyés au serveur sont effacés.'))) return;
          await api('/api/social/studio', { off: true });
        } else if (sbtn.dataset.studioCopy !== undefined) {
          await navigator.clipboard.writeText(studio.url);
          toast(t('Adresse copiée'), 2000, 'check');
          return;
        }
        accountsDialog(onChange);
      } catch (err) { toast(err.message, 5000, 'warning'); } finally { sbtn.disabled = false; }
      return;
    }
    const box = e.target.closest('[data-net]');
    const btn = e.target.closest('button');
    if (!box || !btn) return;
    const k = box.dataset.net;
    const network = k === 'meta' ? 'facebook' : k;
    try {
      btn.disabled = true;
      if (btn.dataset.save !== undefined) {
        const body = { network };
        for (const i of box.querySelectorAll('[data-f]')) body[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.value;
        await api('/api/social/accounts', body);
        toast(k === 'tiktok' ? t('Clés TikTok vérifiées : cliquez sur « Se connecter à TikTok »') : k === 'youtube' ? t('Clés enregistrées : cliquez sur « Se connecter à YouTube »') : t('Compte enregistré'), OAUTH[k] ? 6000 : 2500, 'check');
      } else if (btn.dataset.remove !== undefined) {
        await api('/api/social/accounts', { network, remove: true });
      } else if (btn.dataset.login !== undefined) {
        // Facebook : identifiants tapés (sinon ceux déjà enregistrés), envoyés avec la demande de connexion
        const body = {};
        if (k === 'meta') for (const i of box.querySelectorAll('[data-f]')) if (i.value.trim()) body[i.dataset.f] = i.value;
        const { url } = await api(`/api/social/${k}/login`, body);
        window.open(url, '_blank');
        toast(t('Connectez-vous dans le navigateur, puis revenez ici et rouvrez cette fenêtre'), 6000, 'external');
      }
      accountsDialog(onChange, k);
    } catch (err) { toast(err.message, 6000, 'warning'); btn.disabled = false; }
  };
  if (!dlg.open) dlg.showModal();
}

// ---------- Publication ----------
export async function openPublish({ d, caps, render, folder, record = null, onPosted = null, videoMaker = null }) {
  let dlg = $('#publishDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'publishDlg';
    dlg.className = 'modal posts-pub-dlg';
    document.body.appendChild(dlg);
  }
  let info = {};
  try { info = await api('/api/social/accounts'); } catch (err) { toast(err.message, 5000, 'warning'); return; }
  const draw = () => {
    dlg.innerHTML = `<div class="sum-head"><b>${icon('megaphone')} ${t('Publier sur mes réseaux')}</b><button class="icon-btn" data-close title="${t('Fermer')}">${icon('close')}</button></div>
      <div class="posts-pub-body">
        ${d.final ? '' : `<p class="posts-warn small">${icon('warning')} ${t('Séance pas terminée : résultats provisoires.')}</p>`}
        <div class="posts-nets">${NETS.map((n) => `<label class="posts-net ${info[n.id]?.connected ? '' : 'off'}">
          <input type="checkbox" data-net="${n.id}" ${info[n.id]?.connected ? 'checked' : 'disabled'}>
          <span><b>${n.name}</b> <span class="small muted">${esc(info[n.id]?.connected ? info[n.id].name || t('Connecté') : t('Non connecté'))}</span><br><span class="small muted">${esc(t(n.what))}</span></span>
          <span class="posts-st small" data-st="${n.id}"></span></label>`).join('')}</div>
        <button class="btn small" data-acc>${icon('lock')} ${t('Comptes…')}</button>
        <label class="small muted">${t(caps.facebook ? 'Texte Instagram' : 'Texte Instagram / Facebook')}<textarea rows="6" data-txt="instagram">${esc(caps.instagram)}</textarea></label>
        ${caps.facebook ? `<label class="small muted">${t('Texte Facebook')}<textarea rows="6" data-txt="facebook">${esc(caps.facebook)}</textarea></label>` : ''}
        <label class="small muted">${t('Texte Threads (500 caractères max.)')}<textarea rows="3" data-txt="threads" maxlength="500">${esc(caps.threads)}</textarea></label>
        <label class="small muted">${t('Texte X (280 caractères max.)')}<textarea rows="3" data-txt="x">${esc(caps.x)}</textarea></label>
        <label class="small muted">${t('Texte Bluesky (300 caractères max.)')}<textarea rows="3" data-txt="bsky">${esc(caps.bsky || caps.x)}</textarea></label>
        ${caps.comment ? `<label class="small muted">${t('Premier commentaire (Facebook, Threads, X, Bluesky)')}<textarea rows="2" data-txt="comment">${esc(caps.comment)}</textarea></label>` : ''}
        <label class="small muted">${t('Texte TikTok (copié à la publication : le brouillon TikTok arrive sans texte)')}<textarea rows="3" data-txt="tiktok">${esc(caps.tiktok || videoTexts(caps).tiktok)}</textarea></label>
        <label class="small muted">${t('Texte YouTube Shorts (1re ligne = titre, 100 caractères max.)')}<textarea rows="3" data-txt="youtube">${esc(caps.youtube || videoTexts(caps).youtube)}</textarea></label>
        <fieldset class="posts-video"><legend class="small">${t('Vidéo TikTok / YouTube Shorts')}</legend>
          <div class="row small">
            <label class="toggle"><input type="radio" name="pmusic" value="gen" checked> ${t('Musique générée (libre de droits)')}</label> ${musicSelect(trackKind(d))}
            <label class="toggle"><input type="radio" name="pmusic" value="file"> ${t('Mon fichier audio')}</label>
            <label class="toggle"><input type="radio" name="pmusic" value="none"> ${t('Sans musique')}</label>
            <input type="file" accept="audio/*" data-audio hidden>
          </div>
          <div class="row"><button class="btn small" data-mkvideo>${icon('video')} ${t('Préparer la vidéo')}</button>
            <button class="btn small" data-savevideo ${video ? '' : 'disabled'}>${icon('save')} ${t('Enregistrer la vidéo')}</button><span class="small muted" data-vst></span></div>
          <video class="posts-vid" controls playsinline ${video ? `src="${video.url}"` : 'hidden'}></video>
          <p class="small muted">${t(MUSIC_NOTE)}</p>
        </fieldset>
        <div class="row"><span class="spacer"></span><button class="btn btn-accent" data-go>${icon('megaphone')} ${t('Publier maintenant')}</button></div>
        <fieldset class="posts-video"><legend class="small">${t('Programmer la publication')}</legend>
          <div class="row small"><input type="datetime-local" data-schedat value="${localInput(Date.now() + 3600e3)}">
            <button class="btn small" data-schedquick="tonight">${t('Ce soir 19:00')}</button><button class="btn small" data-schedquick="tomorrow">${t('Demain 12:00')}</button>
            <button class="btn small" data-schedbest title="${t("Heure où vos posts ont le mieux marché, d'après leurs statistiques")}">${t('Meilleure heure')}</button>
            <span class="spacer"></span><button class="btn small btn-accent" data-schedule>${icon('calendar')} ${t('Programmer')}</button></div>
          <p class="small muted" data-schedhint>${t("Publié à l'heure choisie, appli ouverte (sinon à sa réouverture, dans les 24 h).")}</p>
          <div class="posts-sched" data-schedlist></div>
        </fieldset>
      </div>`;
  };
  draw();
  const vst = () => $('[data-vst]', dlg);
  const buildVideo = async () => {
    unlockAudio();   // pendant le clic, avant toute attente (sinon vidéo muette sur iPhone)
    const music = dlg.querySelector('[name="pmusic"]:checked')?.value || 'gen';
    const file = $('[data-audio]', dlg).files?.[0] || null;
    if (music === 'file' && !file) { $('[data-audio]', dlg).click(); throw new Error(t('Choisissez d\'abord un fichier audio')); }
    const onProgress = (p) => { if (vst()) vst().textContent = t('Enregistrement de la vidéo… {} %', Math.round(p * 100)); };
    const track = $('[data-vtrack]', dlg)?.value;
    const v = videoMaker ? await videoMaker({ music, file, track, onProgress }) : await makeVideo(await render('story'), { music, file, track, onProgress });
    if (video?.url) URL.revokeObjectURL(video.url);
    video = { ...v, url: URL.createObjectURL(v.blob) };
    const el = $('.posts-vid', dlg);
    el.src = video.url; el.hidden = false;
    $('[data-savevideo]', dlg).disabled = false;
    vst().textContent = t('Vidéo prête ({} Mo)', (v.blob.size / 1e6).toFixed(1).replace('.', ',')) + (v.silent ? ` · ${t('sans son : le navigateur a bloqué la musique, recommencez')}` : '');
  };
  // Contenu envoyé à un réseau (visuels préparés une seule fois par format)
  const txt = (k) => $(`[data-txt="${k}"]`, dlg).value;
  let ig = null; let xs = null; let bs = null;
  // Images et leur texte alternatif (lecteurs d'écran), dans le même ordre
  const pack = async (canvases, enc) => ({ images: await Promise.all(canvases.map(enc)), alts: canvases.map((c) => c.dataset.alt || '') });
  const bodyFor = async (n) => {
    if (VIDEO_NETS.includes(n)) {
      if (!video) await buildVideo();
      return { network: n, video: await b64(video.blob), mime: video.mime, ...(n === 'youtube' ? { text: txt('youtube') } : {}) };
    }
    if (n === 'bluesky') {
      bs ||= await pack((await render('x')).slice(0, 4), (c) => jpegUnder(c));
      return { network: n, text: txt('bsky'), ...bs, comment: caps.comment ? txt('comment') : '' };
    }
    if (n === 'x') {
      xs ||= await pack((await render('x')).slice(0, 4), png);
      return { network: n, text: txt('x'), ...xs, comment: caps.comment ? txt('comment') : '' };
    }
    ig ||= await pack(await render('ig'), png);
    return { network: n, text: txt(n === 'threads' ? 'threads' : n === 'facebook' && caps.facebook ? 'facebook' : 'instagram'), ...ig, comment: n === 'instagram' || !caps.comment ? '' : txt('comment') };
  };
  // Avant d'envoyer : texte trop long (bloque), visuels au-delà du carrousel (prévient)
  const check = async (nets) => {
    const carousel = nets.some((n) => ['instagram', 'facebook', 'threads'].includes(n));
    if (carousel) ig ||= await pack(await render('ig'), png);
    const pb = postProblems(nets, (n) => txt(n === 'bluesky' ? 'bsky' : n === 'facebook' ? (caps.facebook ? 'facebook' : 'instagram') : n), carousel ? ig.images.length : 0);
    const block = pb.find((p) => p.block);
    if (block) { toast(t(block.msg, ...block.vals), 6000, 'warning'); return null; }
    return pb.map((p) => t(p.msg, ...p.vals));
  };
  // Publications programmées : liste (à venir, puis récentes) avec annulation
  const schedList = async () => {
    const el = $('[data-schedlist]', dlg);
    if (!el) return;
    const r = await api('/api/social/schedule').catch(() => ({ items: [] }));
    const ST = { pending: 'à venir', running: 'en cours', done: 'publiée', error: 'erreur', expired: 'expirée (plus de 24 h de retard)' };
    el.innerHTML = r.items.map((j) => `<div class="row small"><b>${esc(new Date(j.at).toLocaleString())}</b> <span>${esc(j.title)}</span>
      <span class="muted">${esc(j.nets.map((n) => NETS.find((x) => x.id === n)?.name || n).join(', '))} · ${esc(t(ST[j.status] || j.status))}</span>
      ${Object.values(j.results).filter((x) => !x.ok).map((x) => `<span class="posts-warn">${esc(x.error)}</span>`).join(' ')}
      ${Object.values(j.results).some((x) => x.hidden) ? `<span class="posts-warn">${t('pas visible publiquement sur Threads : vérifiez le post (compte ou post masqué)')}</span>` : ''}
      <span class="spacer"></span>${j.status === 'pending' ? `<button class="btn small" data-schedcancel="${esc(j.id)}">${t('Annuler')}</button>` : ''}</div>`).join('');
  };
  schedList();
  dlg.onchange = (e) => { if (musicEvent(e)) return; if (e.target.name === 'pmusic' && e.target.value === 'file') $('[data-audio]', dlg).click(); };
  dlg.addEventListener('close', endPreview);
  dlg.onclick = async (e) => {
    if (musicEvent(e)) return;
    if (e.target === dlg || e.target.closest('[data-close]')) { dlg.close(); return; }
    if (e.target.closest('[data-acc]')) { accountsDialog(async () => { info = await api('/api/social/accounts').catch(() => info); draw(); }); return; }
    const btn = e.target.closest('button');
    if (!btn) return;
    try {
      if (btn.dataset.mkvideo !== undefined) { btn.disabled = true; await buildVideo(); btn.disabled = false; }
      if (btn.dataset.savevideo !== undefined && video) {
        const r = await api('/api/posts/save', { folder, name: 'tiktok-video', data: await b64(video.blob) });
        // Version plein écran (X, Bluesky, Facebook…) à côté de celle de TikTok, Reels et Shorts
        if (video.full) await api('/api/posts/save', { folder, name: 'video-plein-ecran', data: await b64(video.full.blob) });
        toast(t('Vidéo enregistrée dans {}', r.dir), 4000, 'check');
      }
      if (btn.dataset.schedquick) {
        const x = new Date();
        if (btn.dataset.schedquick === 'tonight') { x.setHours(19, 0, 0, 0); if (x < Date.now()) x.setDate(x.getDate() + 1); } else { x.setDate(x.getDate() + 1); x.setHours(12, 0, 0, 0); }
        $('[data-schedat]', dlg).value = localInput(x.getTime());
      }
      if (btn.dataset.schedbest !== undefined) {
        btn.disabled = true;
        const st = await api('/api/social/stats').catch(() => ({}));
        const h = bestHour(st.kept || st.posts || []);
        btn.disabled = false;
        if (h === null) { toast(t('Pas encore assez de posts avec des statistiques'), 4500, 'info'); return; }
        const x = new Date(); x.setHours(h, 0, 0, 0); if (x < Date.now()) x.setDate(x.getDate() + 1);
        $('[data-schedat]', dlg).value = localInput(x.getTime());
        toast(t('Vos posts marchent le mieux vers {} h', h), 3500, 'check');
      }
      if (btn.dataset.schedcancel) { await api('/api/social/schedule/cancel', { id: btn.dataset.schedcancel }); await schedList(); }
      if (btn.dataset.schedule !== undefined) {
        const nets = [...dlg.querySelectorAll('[data-net]:checked')].map((i) => i.dataset.net);
        if (!nets.length) { toast(t('Cochez au moins un réseau'), 3000, 'warning'); return; }
        const at = new Date($('[data-schedat]', dlg).value).getTime();
        if (!(at > Date.now())) { toast(t('Choisissez une date à venir'), 3000, 'warning'); return; }
        const warn = await check(nets);
        if (!warn || (warn.length && !window.confirm(`${warn.join('\n')}\n\n${t('Programmer quand même ?')}`))) return;
        btn.disabled = true;
        try {
          const posts = [];
          for (const n of nets) posts.push({ body: await bodyFor(n) });
          await api('/api/social/schedule', { at, posts, title: record?.title || d.title || d.gp || '', record });
          toast(t('Publication programmée le {}', new Date(at).toLocaleString()), 4000, 'check');
          await schedList();
        } finally { btn.disabled = false; }
      }
      if (btn.dataset.go !== undefined) {
        const nets = [...dlg.querySelectorAll('[data-net]:checked')].map((i) => i.dataset.net);
        if (!nets.length) { toast(t('Cochez au moins un réseau'), 3000, 'warning'); return; }
        const warn = await check(nets);
        if (!warn) return;
        if (!window.confirm(`${t('Publier maintenant sur : {} ?', nets.map((n) => NETS.find((x) => x.id === n).name).join(', '))}${warn.length ? `\n\n${warn.join('\n')}` : ''}\n\n${t(PUBLIC_NOTE)}`)) return;
        // Brouillon TikTok sans texte : le sien copié, à coller en publiant dans l'appli TikTok
        if (nets.includes('tiktok')) navigator.clipboard?.writeText(txt('tiktok')).then(() => toast(t('Texte TikTok copié : collez-le en publiant le brouillon dans l\'appli TikTok'), 6000, 'check'), () => {});
        btn.disabled = true;
        for (const n of nets) {
          const st = $(`[data-st="${n}"]`, dlg);
          st.className = 'posts-st small'; st.textContent = t('Envoi…');
          // Temps écoulé : Instagram et Threads préparent chaque image avant de publier (jusqu'à quelques minutes)
          const t0 = Date.now();
          const tick = setInterval(() => { st.textContent = t('Envoi… {} s', Math.round((Date.now() - t0) / 1000)); }, 1000);
          try {
            const r = await api('/api/social/publish', await bodyFor(n));
            st.className = 'posts-st small ok';
            // Journal des publications (news marquées « publiée », statistiques)
            if (record) api('/api/social/history', { entry: { ...record, at: Date.now(), nets: { [n]: { id: r.id ?? null, url: r.url || null } } } }).then(() => onPosted?.()).catch(() => {});
            st.innerHTML = (r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${icon('check')} ${t(r.note ? 'Envoyé' : 'Publié')}</a>${r.note ? ` · ${esc(t(r.note))}` : ''}` : `${icon('check')} ${esc(t(r.note || 'Envoyé'))}`)
              + (r.comment ? ` · ${t('commentaire ajouté')}` : r.commentError ? ` <span class="posts-warn">· ${esc(t('commentaire refusé : {}', r.commentError))}</span>` : '')
              + (r.visible === false ? ` <span class="posts-warn">· ${t('pas visible publiquement sur Threads : vérifiez le post (compte ou post masqué)')}</span>` : '');
          } catch (err) {
            st.className = 'posts-st small err';
            st.textContent = err.message;
          } finally {
            clearInterval(tick);
          }
        }
        btn.disabled = false;
      }
    } catch (err) { toast(err.message, 6000, 'warning'); btn.disabled = false; }
  };
  if (!dlg.open) dlg.showModal();
}
