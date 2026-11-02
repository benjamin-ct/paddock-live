// Mode créateur : caché par défaut ; activé sur l'ordinateur avec Ctrl + Alt + P et le code du propriétaire.
// Les posts se préparent et se publient dans le Studio (page web), où se connectent aussi les comptes des réseaux ;
// l'appli active le Studio et lui envoie la connexion F1 TV (archives des séances), chiffrée.
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

// ---------- Studio : activation, connexion F1 TV envoyée ----------
async function studioDialog() {
  let dlg = $('#socialAccDlg');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'socialAccDlg';
    dlg.className = 'modal posts-acc-dlg';
    document.body.appendChild(dlg);
  }
  const studio = await api('/api/social/studio').catch(() => ({ enabled: false }));
  dlg.innerHTML = `<div class="sum-head"><b>${icon('lock')} ${t('Studio')}</b><button class="icon-btn" data-close title="${t('Fermer')}">${icon('close')}</button></div>
    <div class="posts-acc-body"><div class="posts-acc" data-studio>
      <p class="small">${t('Posts et comptes des réseaux : dans le Studio (Réglages → Comptes). Cette appli lui envoie la connexion F1 TV, chiffrée.')}</p>
      ${studio.enabled ? `<p class="small"><span class="posts-ok">${icon('check')} ${t('Activée')}</span> · <a href="${esc(studio.url)}" target="_blank" rel="noopener">${esc(studio.url)}</a></p>
        ${studio.error ? `<p class="small posts-warn">${icon('warning')} ${esc(studio.error)}</p>` : ''}
        ${studio.f1tv ? '' : `<p class="small muted">${icon('info')} ${t('Posts des séances : connectez F1 TV (Réglages → Compte F1 TV).')}</p>`}
        <div class="row"><button class="btn small" data-studio-copy>${icon('doc')} ${t("Copier l'adresse")}</button><button class="btn small" data-studio-sync>${t('Renvoyer F1 TV')}</button><button class="btn small" data-studio-off>${t('Désactiver')}</button></div>`
      : `<label class="small">${t('Code du mode créateur')}<input type="password" data-studio-code autocomplete="off" spellcheck="false"></label>
        <div class="row"><button class="btn small btn-accent" data-studio-on>${t('Activer la page web')}</button></div>`}
    </div></div>`;
  dlg.onclick = async (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) { dlg.close(); return; }
    const sbtn = e.target.closest('[data-studio] button');
    if (!sbtn) return;
    try {
      sbtn.disabled = true;
      if (sbtn.dataset.studioOn !== undefined) {
        await api('/api/social/studio', { code: $('[data-studio-code]', dlg).value });
        toast(t('Page web activée'), 3000, 'check');
      } else if (sbtn.dataset.studioSync !== undefined) {
        const r = await api('/api/social/studio', { sync: true });
        if (r.error) throw new Error(r.error);
        toast(t('Connexion F1 TV envoyée'), 2500, 'check');
      } else if (sbtn.dataset.studioOff !== undefined) {
        if (!window.confirm(t('Désactiver la page web ? Les comptes envoyés au serveur sont effacés.'))) return;
        await api('/api/social/studio', { off: true });
      } else if (sbtn.dataset.studioCopy !== undefined) {
        await navigator.clipboard.writeText(studio.url);
        toast(t('Adresse copiée'), 2000, 'check');
        return;
      }
      studioDialog();
    } catch (err) { toast(err.message, 5000, 'warning'); } finally { sbtn.disabled = false; }
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
  if (enabled) { studioDialog(); return; }
  if (document.querySelector('.creator-dlg[open]')) return;
  const code = await askCode();
  if (!code) return;
  const res = await fetch('/api/creator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).catch(() => null);
  if (res?.ok) {
    const { restored } = await res.json().catch(() => ({}));
    show(true);
    toast(restored ? t('Mode créateur activé : {} compte(s) repris de la page web', restored) : t('Mode créateur activé'), 4000, 'check');
  } else toast(t(res?.status === 403 ? 'Code incorrect' : 'Activation impossible'), 3000, 'warning');
}

export function initCreator() {
  fetch('/api/creator').then((r) => r.json()).then((j) => show(!!j.enabled)).catch(() => {});
  $('#creatorAccounts')?.addEventListener('click', () => studioDialog());
  $('#creatorOff')?.addEventListener('click', async () => {
    await fetch('/api/creator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ off: true }) }).catch(() => {});
    show(false);
    toast(t('Mode créateur désactivé'), 2500, 'check');
  });
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyP') { e.preventDefault(); unlock(); }
  });
}
