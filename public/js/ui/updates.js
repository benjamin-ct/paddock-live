// Mises à jour automatiques de l'application de bureau (Windows, Linux, macOS).
import { $ } from '../util.js';
import { t } from '../i18n.js';
import { toast } from './delay.js';
import { changelogHtml } from './changelog.js';

const desk = window.f1desktop;
let dismissed = false;

function fmt(s) {
  switch (s.status) {
    case 'checking': return 'Recherche d\'une nouvelle version…';
    case 'up-to-date': return `Vous avez la dernière version (${s.current}).`;
    case 'available': return `Nouvelle version ${s.latest?.version} disponible (vous avez ${s.current}).`;
    case 'downloading': return `Téléchargement de la version ${s.latest?.version}… ${Math.round((s.progress || 0) * 100)} %`;
    case 'ready': return `Version ${s.latest?.version} prête : installée à la fermeture, ou avec « Redémarrer ».`;
    case 'error': return `Erreur : ${s.error}`;
    case 'unsupported': return 'Mise à jour automatique impossible ici : installez la nouvelle version depuis GitHub.';
    default: return `Version ${s.current}`;
  }
}

function render(s) {
  $('#updateStatus').textContent = `${fmt(s)} ${{ portable: '· version portable', installer: '· version installée', appimage: '· AppImage', mac: '· macOS' }[s.kind] || ''}`;
  $('#updateAuto').checked = s.auto;
  $('#updateBeta').checked = !!s.beta;
  $('#updateInstall').hidden = s.status !== 'ready';
  $('#updateCheck').hidden = s.status === 'unsupported';
  const pill = $('#updatePill');
  pill.hidden = s.status !== 'ready' || dismissed;
  $('#updatePillText').textContent = `Paddock Live ${s.latest?.version} est prête`;
  // Nouveautés de la version à installer (page de la version : avant la ligne « --- »)
  const notes = ['available', 'downloading', 'ready'].includes(s.status) ? String(s.latest?.notes || '').split(/\n-{3,}\s*\n/)[0].replace(/^## .*\n/, '') : '';
  $('#updateNotes').hidden = !notes.trim();
  if (notes.trim()) { $('#updateNotesVer').textContent = s.latest.version; $('#updateNotesBody').innerHTML = changelogHtml(notes); }
  // Première ouverture après une mise à jour : on le signale
  if (s.current) {
    let seen = null;
    try { seen = localStorage.getItem('paddock.seenVersion'); localStorage.setItem('paddock.seenVersion', s.current); } catch { /* stockage indisponible */ }
    if (seen && seen !== s.current) toast(`Mis à jour en ${s.current} : nouveautés dans Réglages → Application`, 8000);
  }
}

async function install() {
  const r = await desk.installUpdate();
  if (!r?.ok) toast(r?.error || 'Installation impossible', 6000);
  else toast('Installation de la mise à jour… l\'appli va redémarrer', 6000);
}

// Mémoire utilisée (mise à jour toutes les 5 s pendant que les réglages sont ouverts)
const GB = (b) => `${(b / 1e9).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} Go`;
async function showMemory() {
  const el = $('#memUse');
  if (!desk?.memory || !el || el.offsetParent === null) return;
  const by = await desk.memory().catch(() => null);
  if (!by) return;
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  const part = (k, label) => (by[k] ? `${label} ${GB(by[k])}` : '');
  el.textContent = t('Mémoire utilisée : {} ({})', GB(total), [part('Browser', t('serveur')), part('Tab', t('fenêtres')), part('GPU', t('carte graphique')), part('Utility', t('services'))].filter(Boolean).join(' · '));
  el.hidden = false;
}

export function initUpdates() {
  if (!desk?.version) return;
  setInterval(showMemory, 5000);
  $('#settingsBtn')?.addEventListener('click', () => setTimeout(showMemory, 300));
  $('#updateBlock').hidden = false;
  desk.onUpdate(render);
  desk.version().then(render);
  $('#updateCheck').addEventListener('click', async () => render(await desk.checkUpdate()));
  $('#updateInstall').addEventListener('click', install);
  $('#updatePillBtn').addEventListener('click', install);
  $('#updatePillClose').addEventListener('click', () => { dismissed = true; $('#updatePill').hidden = true; });
  $('#updateAuto').addEventListener('change', async (e) => render(await desk.setAutoUpdate(e.target.checked)));
  // Ancienne appli de bureau (sans les bêtas) : réglage caché
  if (!desk.setBetaUpdates) $('#updateBeta').closest('.row').hidden = true;
  else $('#updateBeta').addEventListener('change', async (e) => render(await desk.setBetaUpdates(e.target.checked)));
}
