// Mode créateur : caché par défaut ; activé sur l'ordinateur avec Ctrl + Alt + P et le code du propriétaire.
// Les posts se préparent et se publient dans le Studio (page web) ; l'appli garde les comptes des réseaux
// (Réglages → Mode créateur → Comptes des réseaux…), envoyés chiffrés au Studio.
import { $, esc } from '../util.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { toast } from './delay.js';

let enabled = false;
const api = async (path, body) => {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
  return j;
};
const KEYS_NOTE = "Les clés restent sur cet ordinateur, hors des sauvegardes de réglages.";

// ---------- Comptes ----------
const HELP = {
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
  meta: [['appId', 'Identifiant de l\'app'], ['appSecret', 'Clé secrète de l\'app'], ['configId', 'ID de configuration (Facebook Login for Business)'], ['userToken', 'Jeton d\'accès (Explorateur de l\'API Graph, sans « Se connecter »)']],
  threads: [['appSecret', 'Clé secrète Threads'], ['token', 'Jeton Threads']],
  threads2: [['appSecret', 'Clé secrète Threads'], ['token', 'Jeton Threads']],
  bluesky: [['handle', 'Identifiant Bluesky'], ['appPassword', 'Mot de passe d\'application']],
  tiktok: [['clientKey', 'Client key'], ['clientSecret', 'Client secret']],
  tiktok2: [],
  youtube: [['clientId', 'ID client'], ['clientSecret', 'Code secret du client']],
};
const TITLES = { meta: 'Instagram + Facebook', threads: 'Threads', threads2: 'Threads (2e compte, statistiques)', bluesky: 'Bluesky', tiktok: 'TikTok', tiktok2: 'TikTok (2e compte, statistiques)', youtube: 'YouTube Shorts' };
// Connexion par le navigateur (OAuth) : bouton « Se connecter à … » ; Facebook revient par la page du site
const META_REDIRECT = 'https://paddocklive.app/fb-callback';
const OAUTH = { meta: 'Facebook', tiktok: 'TikTok', tiktok2: 'TikTok', youtube: 'YouTube' };

// open : section gardée ouverte après un enregistrement (sinon tout se replie)
async function accountsDialog(open = null) {
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
    if (e.target === dlg || e.target.closest('[data-close]')) { dlg.close(); return; }
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
        accountsDialog();
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
      accountsDialog(k);
    } catch (err) { toast(err.message, 6000, 'warning'); btn.disabled = false; }
  };
  if (!dlg.open) dlg.showModal();
}

function show(on) {
  enabled = on;
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
  if (enabled) { accountsDialog(); return; }
  if (document.querySelector('.creator-dlg[open]')) return;
  const code = await askCode();
  if (!code) return;
  const res = await fetch('/api/creator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).catch(() => null);
  if (res?.ok) {
    const { restored } = await res.json().catch(() => ({}));
    show(true);
    toast(restored ? t('Mode créateur activé : {} compte(s) repris de la page web', restored) : t('Mode créateur activé : comptes des réseaux dans Réglages → Mode créateur'), 4000, 'check');
  } else toast(t(res?.status === 403 ? 'Code incorrect' : 'Activation impossible'), 3000, 'warning');
}

export function initCreator() {
  fetch('/api/creator').then((r) => r.json()).then((j) => show(!!j.enabled)).catch(() => {});
  $('#creatorAccounts')?.addEventListener('click', () => accountsDialog());
  $('#creatorOff')?.addEventListener('click', async () => {
    await fetch('/api/creator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ off: true }) }).catch(() => {});
    show(false);
    toast(t('Mode créateur désactivé'), 2500, 'check');
  });
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyP') { e.preventDefault(); unlock(); }
  });
}
