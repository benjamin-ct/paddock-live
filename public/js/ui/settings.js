// Réglages : jeton F1 TV, affichage, alertes, application, et barre de contrôle du replay
// (le choix live / replay est dans l'espace Replays, replays.js).
import { store, serverNow, on } from '../store.js';
import { $, $$, esc, api, fmtDuration, drivers, orderedNumbers, storageGet, storageSet } from '../util.js';
import { toast } from './delay.js';
import { prefs, setPref, toggleFav, toggleTeamFav } from '../prefs.js';
import { NEWS_TEAMS, fold } from '/shared/news.js';
import { saveWindowsSnapshot, restoreWindowsSnapshot, hasWindowsSnapshot } from './layout.js';
import { icon } from '../icons.js';
import { LANG, LOCALE, EN, t } from '../i18n.js';

let dragging = false;

const fmtWhen = (ms) => new Date(ms).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const SESSION_WARN = 3 * 86400000;   // rappel 3 jours avant la fin de la session formula1.com

async function refreshAuth() {
  try {
    const a = await api('/api/auth');
    renderAuthPill(a);
    const el = $('#tokenStatus');
    if (!a.hasToken) { el.innerHTML = '<span class="muted">Aucun jeton enregistré : positions estimées en live.</span>'; return; }
    const live = store.status?.source?.authenticated;
    const offer = a.product ? ` · offre « ${esc(a.product)} »${a.country ? ` (${esc(a.country)})` : ''}${/pro/i.test(a.product) ? '' : ' — commentaires en direct réservés à F1 TV Pro'}` : '';
    const gps = !a.expired && store.status?.source?.mode === 'live' ? (live ? ' · GPS reçu' : ' · GPS pas encore reçu (normal hors session)') : '';
    let head;
    if (a.expired) head = `<span style="color:var(--orange)">${icon('warning')} Jeton expiré${a.autoRenew && !a.renewRejected ? ' : renouvellement en cours…' : ' : reconnectez-vous'}</span>`;
    else head = `<span style="color:var(--green)">${icon('check-circle')} Connecté</span> · jeton valable jusqu'au ${esc(a.expiresAt ? fmtWhen(a.expiresAt) : 'inconnu')}`;
    let renew;
    if (a.renewRejected) renew = `<span style="color:var(--orange)">La F1 a mis fin à la session : reconnectez-vous pour continuer.</span>`;
    else if (a.autoRenew) {
      renew = `${icon('refresh')} Renouvelé automatiquement (tous les ~4 jours)${a.sessionExpiresAt ? ` jusqu'au <b>${esc(fmtWhen(a.sessionExpiresAt))}</b>, fin de la session formula1.com (≈ 30 jours après la connexion) : il faudra alors se reconnecter` : ''}.`;
      if (a.renewError) renew += ` <span style="color:var(--orange)">Dernier essai : ${esc(a.renewError)}</span>`;
    } else renew = `<span class="muted">Ce jeton ne se renouvelle pas tout seul : reconnectez-vous avant son expiration.</span>`;
    el.innerHTML = `${head}${offer}${gps}<br>${renew} ${a.autoRenew && !a.renewRejected ? '<button class="btn small" id="tokenRenew">Renouveler maintenant</button>' : ''}`;
  } catch { /* ignore */ }
}

// Rappel discret avant de perdre la connexion F1 TV (sur l'ordinateur)
function renderAuthPill(a) {
  const pill = $('#authPill');
  if (!pill || store.isHost === false) return;
  const now = Date.now();
  let msg = '';
  if (a.hasToken) {
    if (a.renewRejected || (a.expired && !a.autoRenew)) msg = 'Connexion F1 TV perdue : reconnectez-vous pour retrouver le GPS et la télémétrie en live.';
    else if (!a.autoRenew && a.expiresAt && a.expiresAt - now < 86400000) msg = `Connexion F1 TV : le jeton expire ${fmtWhen(a.expiresAt)}.`;
    else if (a.sessionExpiresAt && a.sessionExpiresAt - now < SESSION_WARN) msg = `Connexion F1 TV : la session formula1.com se termine ${fmtWhen(a.sessionExpiresAt)}. Reconnectez-vous pour 30 jours de plus.`;
  }
  const key = msg ? `${new Date().toDateString()}|${msg.slice(0, 40)}` : '';
  pill.hidden = !msg || storageGet('paddock.authPillClosed', '') === key;
  if (msg) { $('#authPillText').textContent = msg; pill.dataset.k = key; }
}

async function reconnectF1TV() {
  if (window.f1desktop?.isDesktop) {
    toast('Connectez-vous dans la fenêtre F1 qui vient de s\'ouvrir…', 6000);
    const res = await window.f1desktop.loginF1TV();
    if (res?.ok) toast('Connecté à F1 TV', 5000, 'check');
    else if (res?.error) toast(res.error, 6000);
    refreshAuth();
  } else {
    $('#settingsModal').showModal();
    $('#setNav [data-sgroup="f1tv"]')?.click();
    refreshAuth();
  }
}

const SPEEDS = [1, 2, 5, 10, 20, 30];

// Nom de chaque partie de la séance (Q1, Q2, Q3 / départ et reprises / séance)
function phaseLabels(src) {
  const ph = src.phases || [];
  const quali = ph.some((p) => p.part);
  const sq = /sprint/i.test(`${src.session || ''} ${src.path || ''}`) && quali ? 'SQ' : 'Q';
  const race = /race|course|sprint/i.test(`${src.session || ''} ${src.path || ''}`);
  return ph.map((p, i) => (quali ? `${sq}${p.part || i + 1}` : race ? (i ? 'Reprise' : 'Départ') : ph.length > 1 ? `Séance ${i + 1}` : 'Séance'));
}

function renderReplayBar() {
  const src = store.status?.source;
  const bar = $('#replayBar');
  const active = src?.mode === 'replay' && !src.loading && !src.error;
  bar.hidden = !active;
  if (!active) return;
  const speed = src.speed || 1;
  const dur = src.duration || 1;
  const pos = Math.max(0, Math.min(dur, (serverNow() - store.delay - src.anchor) * speed));
  const range = $('#rpRange');
  range.max = String(dur);
  if (!dragging) range.value = String(pos);
  const shown = dragging ? Number(range.value) : pos;
  $('#rpPlayed').style.width = `${(100 * shown) / dur}%`;
  for (const b of $$('#rpSpeeds [data-speed]')) b.classList.toggle('on', Number(b.dataset.speed) === speed);
  if ($('#rpFlags').checked !== prefs.replayMarks) $('#rpFlags').checked = prefs.replayMarks;

  // Segments : séance en cours (vert), drapeaux jaunes, SC / VSC (option « Drapeaux ») et
  // drapeaux rouges (toujours), sur fond sombre quand la séance est arrêtée ; points blancs au
  // début et à la fin de chaque partie (Q1, Q2, Q3, départ, reprise…)
  const reds = src.redFlags || [];
  const phases = src.phases || [];
  const labels = phaseLabels(src);
  const flags = prefs.replayMarks;
  const neutral = flags ? src.neutralized || [] : [];
  const yellows = flags ? src.yellows || [] : [];
  const mk = `${dur}|${flags}|${phases.length}|${reds.length}|${neutral.length}|${yellows.length}`;
  const segs = $('#rpSegs');
  if (segs.dataset.k !== mk) {
    segs.dataset.k = mk;
    const pct = (t) => (100 * Math.max(0, Math.min(dur, t))) / dur;
    const seg = (r, cls, title) => `<i class="${cls}" title="${title}" style="left:${pct(r.start)}%;width:${Math.max(0.25, pct(r.end) - pct(r.start))}%"></i>`;
    segs.innerHTML = phases.map((p, i) => seg(p, 'run', `${labels[i]} : de ${fmtDuration(p.start)} à ${fmtDuration(p.end)}`)).join('')
      + yellows.map((r) => seg(r, 'yellow', 'Drapeau jaune')).join('')
      + neutral.map((r) => seg(r, r.kind, r.kind === 'sc' ? 'Voiture de sécurité' : 'Voiture de sécurité virtuelle')).join('')
      + reds.map((r) => seg(r, 'red', 'Drapeau rouge')).join('');
    $('#rpDots').innerHTML = phases.map((p, i) => `<b class="rp-dot" data-seek="${p.start}" style="left:${pct(p.start)}%" title="Début ${labels[i]} — cliquer pour y aller"></b>`
      + `<span class="rp-lbl" style="left:${pct(p.start)}%">${labels[i]}</span>`
      + `<b class="rp-dot end" data-seek="${p.end}" style="left:${pct(p.end)}%" title="Fin ${labels[i]}"></b>`).join('');
  }
  const red = reds.find((r) => pos >= r.start - 1000 && pos < r.end - 35000);
  $('#rpRed').hidden = !red;
  $('#rpRed').dataset.end = red ? red.end : '';
  // Partie en cours et temps écoulé dans cette partie
  const cur = phases.findIndex((p) => shown >= p.start && shown < p.end);
  const next = phases.findIndex((p) => shown < p.start);
  $('#rpPhase').textContent = cur >= 0 ? `${labels[cur]} · ${fmtDuration(shown - phases[cur].start, false)}`
    : next > 0 ? `Entre ${labels[next - 1]} et ${labels[next]}` : next === 0 ? `Avant ${labels[0]} · ${fmtDuration(phases[0].start - shown, false)}` : phases.length ? 'Séance terminée' : '';
  $('#rpTime').innerHTML = `${fmtDuration(shown)}<span class="rp-dur"> / ${fmtDuration(dur)}</span>`;   // durée masquée sur téléphone
  $('#rpPlay').innerHTML = icon(store.status.paused ? 'play' : 'pause');
  $('#rpPlay').title = store.status.paused ? 'Reprendre (barre d\'espace)' : 'Pause (barre d\'espace)';
}

async function control(body) {
  try { await api('/api/replay/control', { method: 'POST', body }); } catch (err) { toast(err.message); }
}

// Accès depuis un téléphone / une tablette du réseau local (réglage disponible sur l'ordinateur uniquement)
async function renderLan(change) {
  // Ouvert depuis un téléphone : réglage réservé à l'ordinateur (inutile de le demander au serveur)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) { $('#lanBlock').hidden = true; return; }
  let info;
  try {
    info = await api('/api/lan', change ? { method: 'POST', body: change } : undefined);
  } catch {
    $('#lanBlock').hidden = true;   // ouvert depuis un téléphone : réglage réservé à l'ordinateur
    return;
  }
  $('#lanBlock').hidden = false;
  $('#lanEnabled').checked = info.enabled;
  const ok = info.enabled && info.running && info.urls.length;
  $('#lanInfo').hidden = !ok;
  $('#lanError').hidden = !(info.enabled && !ok);
  $('#lanError').textContent = info.error ? `Accès réseau impossible : ${info.error}.` : !info.urls.length ? 'Aucun réseau local détecté sur cet ordinateur.' : 'Démarrage…';
  if (!ok) return;
  $('#lanQr').innerHTML = info.qr;
  $('#lanUrl').textContent = info.urls[0].url;
  $('#lanOther').textContent = info.urls.length > 1 ? `Autres adresses possibles : ${info.urls.slice(1).map((u) => u.url).join(' · ')}` : '';
}

export function initSettings() {
  // Réglages : rubriques à gauche (Compte F1 TV, Apparence, Disposition, Alertes, Application, À propos),
  // titre de la rubrique en haut, et recherche dans tous les réglages
  const search = $('#setSearch');
  // Première rubrique affichée (téléphone, version simplifiée : pas de Compte F1 TV)
  const firstGroup = () => [...document.querySelectorAll('#setNav .set-tab')].find((b) => getComputedStyle(b).display !== 'none')?.dataset.sgroup || 'f1tv';
  const showGroup = (g) => {
    const tab = $(`#setNav .set-tab[data-sgroup="${g}"]`);
    for (const b of document.querySelectorAll('#setNav .set-tab')) b.classList.toggle('active', b === tab);
    for (const sec of document.querySelectorAll('#settingsModal .set-block')) sec.classList.toggle('set-hidden', sec.dataset.sgroup !== g);
    $('#setTitle').textContent = tab?.querySelector('b')?.textContent || '';
    $('#setSub').textContent = tab?.querySelector('small')?.textContent || '';
    $('#settingsModal .modal-body').scrollTop = 0;
  };
  const find = () => {
    const q = fold(search.value.trim());
    if (!q) { showGroup($('#setNav .set-tab.active')?.dataset.sgroup || firstGroup()); return; }
    let n = 0;
    for (const sec of document.querySelectorAll('#settingsModal .set-block')) {
      const hit = !sec.hidden && fold(sec.textContent).includes(q);
      sec.classList.toggle('set-hidden', !hit);
      n += hit;
    }
    $('#setTitle').textContent = n ? `Résultats pour « ${search.value.trim()} »` : 'Aucun réglage trouvé';
    $('#setSub').textContent = n ? `${n} rubrique${n > 1 ? 's' : ''}` : 'Essayez un autre mot (ex. : délai, langue, favoris, téléphone)';
  };
  search.addEventListener('input', find);
  $('#setNav').addEventListener('click', (e) => { const b = e.target.closest('.set-tab'); if (b) { search.value = ''; showGroup(b.dataset.sgroup); } });
  showGroup('f1tv');
  const modal = $('#settingsModal');
  const open = () => {
    if (search.value) { search.value = ''; find(); }
    // Rubrique active masquée (passage en version simplifiée) : la première visible
    if (getComputedStyle($('#setNav .set-tab.active')).display === 'none') showGroup(firstGroup());
    modal.showModal();
    refreshAuth();
    renderFavs();
  };
  $('#settingsBtn').addEventListener('click', open);

  // Favoris
  $('#favList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav]');
    if (b) { toggleFav(b.dataset.fav); renderFavs(); }
  });
  $('#favTeamList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav-team]');
    if (b) toggleTeamFav(b.dataset.favTeam);
  });
  // La liste des pilotes peut arriver après l'ouverture de la fenêtre : on la rafraîchit.
  on('prefs', (k) => { if ((k === 'favs' || k === 'favTeams') && modal.open) renderFavs(); });
  setInterval(() => { if (modal.open && !$('#favList .fav')) renderFavs(); }, 1000);

  // Application de bureau : connexion F1 TV intégrée (le cookie est lu directement par l'appli).
  renderLan();
  $('#lanEnabled').addEventListener('change', (e) => renderLan({ enabled: e.target.checked }));
  $('#lanRegen').addEventListener('click', () => { if (confirm('Changer la clé ? Les téléphones et tablettes déjà autorisés devront rescanner le QR code.')) renderLan({ regenerate: true }); });
  // Application de bureau : fenêtres détachées rouvertes au lancement
  $('#remindSel').value = String(prefs.remindMin ?? 15);
  $('#remindSel').addEventListener('change', (e) => setPref('remindMin', Number(e.target.value)));
  $('#icsSeason').dataset.cal = new Date().getFullYear();
  // Langue : l'interface est rechargée pour s'afficher dans la nouvelle langue
  $('#langSel').value = LANG;
  $('#langSel').addEventListener('change', (e) => { setPref('lang', e.target.value); location.reload(); });
  $('#schemeSel').value = prefs.scheme || 'auto';
  $('#schemeSel').addEventListener('change', (e) => setPref('scheme', e.target.value));
  on('prefs', (k) => { if (k === 'scheme') $('#schemeSel').value = prefs.scheme; });
  $('#vividTeams').checked = prefs.vividTeams;
  $('#vividTeams').addEventListener('change', (e) => setPref('vividTeams', e.target.checked));
  on('prefs', (k) => { if (k === 'vividTeams') $('#vividTeams').checked = prefs.vividTeams; });
  $('#replayMarks').checked = prefs.replayMarks;
  $('#replayMarks').addEventListener('change', (e) => setPref('replayMarks', e.target.checked));
  $('#teamLogos').checked = prefs.teamLogos;
  $('#teamLogos').addEventListener('change', (e) => setPref('teamLogos', e.target.checked));
  on('prefs', (k) => { if (k === 'teamLogos') $('#teamLogos').checked = prefs.teamLogos; });
  $('#logoColor').checked = prefs.logoColor;
  $('#logoColor').addEventListener('change', (e) => setPref('logoColor', e.target.checked));
  on('prefs', (k) => { if (k === 'logoColor') $('#logoColor').checked = prefs.logoColor; });
  // Téléphone ou tablette connecté à l'ordinateur : suivre son délai TV
  on('role', (host) => { $('#followHostBlock').hidden = host; });
  $('#followHost').checked = storageGet('paddock.followHost', true);
  $('#followHost').addEventListener('change', (e) => storageSet('paddock.followHost', e.target.checked));
  $('#motionOpt').checked = prefs.motion !== false;
  $('#motionOpt').addEventListener('change', (e) => setPref('motion', e.target.checked));
  $('#phoneFull').checked = !!prefs.phoneFull;
  $('#phoneFull').addEventListener('change', (e) => setPref('phoneFull', e.target.checked));
  $('#keepAwake').checked = prefs.keepAwake;
  $('#keepAwake').addEventListener('change', (e) => setPref('keepAwake', e.target.checked));
  on('prefs', (k) => { if (k === 'keepAwake') $('#keepAwake').checked = prefs.keepAwake; });
  // Emplacement des fenêtres : enregistrer / revenir ; application de bureau : choix au lancement
  $('#winSave').addEventListener('click', () => { saveWindowsSnapshot(); $('#winRestore').disabled = false; });
  $('#winRestore').disabled = !hasWindowsSnapshot();
  $('#winRestore').addEventListener('click', () => restoreWindowsSnapshot());
  if (window.f1desktop?.getWindowsStart) {
    $('#winStartRow').hidden = false;
    window.f1desktop.getWindowsStart().then((v) => { $('#winStart').value = v; });
    $('#winStart').addEventListener('change', (e) => window.f1desktop.setWindowsStart(e.target.value));
  } else if (window.f1desktop?.getRestoreWindows) {
    // Application de bureau d'une version précédente (avant le choix « emplacement enregistré »)
    $('#winStartRow').hidden = false;
    $('#winStart').querySelector('[value="saved"]').remove();
    window.f1desktop.getRestoreWindows().then((v) => { $('#winStart').value = v ? 'last' : 'none'; });
    $('#winStart').addEventListener('change', (e) => window.f1desktop.setRestoreWindows(e.target.value !== 'none'));
  }
  // Connexion F1 TV : renouvellement immédiat, rappel avant la fin de la session
  $('#tokenStatus').addEventListener('click', async (e) => {
    const b = e.target.closest('#tokenRenew');
    if (!b) return;
    b.disabled = true;
    try { await api('/api/auth/renew', { method: 'POST' }); toast('Connexion F1 TV renouvelée', 2500, 'check'); } catch (err) { toast(err.message, 6000); }
    refreshAuth();
  });
  $('#authPillBtn')?.addEventListener('click', reconnectF1TV);
  $('#authPillClose')?.addEventListener('click', () => { storageSet('paddock.authPillClosed', $('#authPill').dataset.k || ''); $('#authPill').hidden = true; });
  refreshAuth();
  setInterval(refreshAuth, 30 * 60 * 1000);

  if (window.f1desktop?.isDesktop) {
    $('#desktopLogin').hidden = false;
    $('#bookmarkletHelp').hidden = true;
    $('#desktopLoginBtn').addEventListener('click', async () => {
      toast('Connectez-vous dans la fenêtre F1 qui vient de s\'ouvrir…', 6000);
      const res = await window.f1desktop.loginF1TV();
      if (res?.ok) toast('Connecté à F1 TV : GPS et télémétrie activés en live', 6000, 'check');
      else if (res?.error) toast(res.error, 6000);
      refreshAuth();
    });
    $('#desktopLogoutBtn').addEventListener('click', async () => {
      await window.f1desktop.logoutF1TV();
      await api('/api/auth', { method: 'DELETE' }).catch(() => {});
      toast('Session F1 TV oubliée');
      refreshAuth();
    });
  } else {
    // Navigateur : pas de connexion intégrée, les méthodes manuelles sont dépliées
    $('#f1tvMore').open = true;
  }

  // Jeton F1 TV en un clic : favori à glisser dans la barre du navigateur. Exécuté sur formula1.com,
  // il lit le cookie de session et revient sur le dashboard avec le jeton dans l'URL (#f1tv=…).
  const code = `(()=>{const c=document.cookie.split('; ').find(x=>x.startsWith('login-session='));if(!c){alert('Paddock Live : cookie introuvable. Connectez-vous sur formula1.com, ou utilisez la méthode manuelle.');return}location.href='${location.origin}/#f1tv='+encodeURIComponent(c.slice(14))})()`;
  $('#bookmarklet').href = `javascript:${code}`;
  $('#bookmarklet').addEventListener('click', (e) => { e.preventDefault(); toast('Glissez ce bouton dans votre barre de favoris, puis cliquez dessus depuis formula1.com', 5000); });
  const m = /[#&]f1tv=([^&]+)/.exec(location.hash);
  if (m) {
    history.replaceState(null, '', location.pathname + location.search);
    api('/api/auth', { method: 'POST', body: { token: decodeURIComponent(m[1]) } })
      .then(() => toast('Jeton F1 TV enregistré : GPS et télémétrie activés en live', 5000, 'check'))
      .catch((err) => toast(err.message, 6000));
  }


  $('#tokenSave').addEventListener('click', async () => {
    try {
      await api('/api/auth', { method: 'POST', body: { token: $('#tokenInput').value } });
      $('#tokenInput').value = '';
      toast('Jeton F1 TV enregistré, reconnexion au flux…');
    } catch (err) { toast(err.message, 5000); }
    refreshAuth();
  });
  $('#tokenClear').addEventListener('click', async () => {
    await api('/api/auth', { method: 'DELETE' }).catch(() => {});
    refreshAuth();
  });

  // Barre de replay
  $('#rpPlay').addEventListener('click', () => control({ action: store.status?.paused ? 'resume' : 'pause' }));
  $('#replayBar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-skip]');
    if (b) control({ action: 'skip', deltaMs: Number(b.dataset.skip) });
  });
  $('#rpRed').addEventListener('click', (e) => {
    const end = Number(e.currentTarget.dataset.end);
    if (!end) return;
    control({ action: 'seek', toMs: end - 30000 + store.delay * (store.status?.source?.speed || 1) });
    toast('Reprise 30 s avant la relance de la séance');
  });
  $('#rpStart').addEventListener('click', () => {
    const src = store.status?.source;
    if (src) control({ action: 'seek', toMs: (src.sessionStart || 0) + store.delay * (src.speed || 1) });
  });
  const range = $('#rpRange');
  range.addEventListener('input', () => { dragging = true; });
  range.addEventListener('change', () => {
    dragging = false;
    control({ action: 'seek', toMs: Number(range.value) + store.delay * (store.status?.source?.speed || 1) });
  });
  $('#rpSpeeds').innerHTML = SPEEDS.map((v) => `<button class="rp-speed" data-speed="${v}" title="Vitesse ×${v}">${v}x</button>`).join('');
  $('#rpSpeeds').addEventListener('click', (e) => {
    const b = e.target.closest('[data-speed]');
    if (b) control({ action: 'speed', speed: Number(b.dataset.speed) });
  });
  $('#rpFlags').addEventListener('change', (e) => setPref('replayMarks', e.target.checked));
  $('#rpDots').addEventListener('click', (e) => {
    const d = e.target.closest('[data-seek]');
    if (d) control({ action: 'seek', toMs: Number(d.dataset.seek) + store.delay * (store.status?.source?.speed || 1) });
  });
  $('#rpClose').addEventListener('click', async () => {
    await api('/api/live', { method: 'POST' }).catch((err) => toast(err.message));
    toast('Retour au direct');
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.target.closest('input, select, textarea, button') && store.status?.source?.mode === 'replay') {
      e.preventDefault();
      control({ action: store.status?.paused ? 'resume' : 'pause' });
    }
  });

  on('status', renderReplayBar);
  setInterval(renderReplayBar, 250);

  // À propos : question ou suggestion envoyée au créateur (relais du serveur local), avec jusqu'à
  // 3 captures ou vidéos envoyées ensuite une par une (mêmes limites que le serveur Paddock Live)
  const FB_MAX = { 'image/png': 8e6, 'image/jpeg': 8e6, 'image/webp': 8e6, 'image/gif': 8e6, 'video/mp4': 40e6, 'video/webm': 40e6, 'video/quicktime': 40e6 };
  const fbHint = $('#fbFileList').textContent;
  const fbFiles = () => [...$('#fbFiles').files];
  $('#fbFiles').addEventListener('change', () => {
    const f = fbFiles();
    $('#fbFileList').textContent = f.length ? f.map((x) => `${x.name} (${(x.size / 1e6).toFixed(1)} Mo)`).join(' · ') : t(fbHint);
  });
  // Captures et vidéos aussi collées (Ctrl+V) ou glissées sur le formulaire : ajoutées à la sélection
  const fbAdd = (list) => {
    const add = [...list].filter((f) => /^(image|video)\//.test(f.type));
    if (!add.length) return false;
    const dt = new DataTransfer();
    [...fbFiles(), ...add].slice(0, 3).forEach((f) => dt.items.add(f));
    $('#fbFiles').files = dt.files;
    $('#fbFiles').dispatchEvent(new Event('change'));
    return true;
  };
  const fbForm = $('#fbForm');
  fbForm.addEventListener('paste', (e) => { if (fbAdd(e.clipboardData?.files || [])) e.preventDefault(); });
  fbForm.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); fbForm.classList.add('drag'); } });
  fbForm.addEventListener('dragleave', (e) => { if (!fbForm.contains(e.relatedTarget)) fbForm.classList.remove('drag'); });
  fbForm.addEventListener('drop', (e) => { e.preventDefault(); fbForm.classList.remove('drag'); fbAdd(e.dataTransfer.files); });
  $('#fbForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#fbText').value.trim();
    const files = fbFiles();
    if (text.length < 5) { toast(t('Message trop court')); return; }
    if (files.length > 3) { toast(t('3 fichiers au plus')); return; }
    const bad = files.find((f) => !(f.size <= (FB_MAX[f.type] || 0)));
    if (bad) { toast(t('{} : format non accepté ou fichier trop lourd', bad.name), 5000); return; }
    $('#fbSend').disabled = true;
    try {
      const r = await api('/api/feedback', { method: 'POST', body: { kind: $('#fbKind').value, text, contact: $('#fbContact').value.trim(), lang: LANG, files: files.length } });
      $('#fbText').value = '';
      try {
        for (const [n, f] of files.entries()) {
          toast(t('Envoi des pièces jointes ({}/{})…', n + 1, files.length), 120000);
          const res = await fetch(`/api/feedback/file?${new URLSearchParams({ id: r.id, up: r.up, n })}`, { method: 'POST', headers: { 'Content-Type': f.type }, body: f });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`);
        }
        toast(t('Message envoyé : merci !'), 3000, 'check');
      } catch (err) { toast(t('Message envoyé, mais pièce jointe refusée : {}', err.message), 6000); }
      $('#fbFiles').value = '';
      $('#fbFileList').textContent = t(fbHint);
    } catch (err) { toast(err.message, 5000); }
    $('#fbSend').disabled = false;
  });
}

function renderFavs() {
  $('#favTeamList').innerHTML = NEWS_TEAMS.filter(([k]) => k !== 'fia')
    .map(([k, name]) => `<button class="fav ${(prefs.favTeams || []).includes(k) ? 'on' : ''}" data-fav-team="${k}">${esc(name)}</button>`).join('');
  const dl = drivers(store.state);
  const nums = orderedNumbers(store.state).filter((n) => dl[n]);
  $('#favList').innerHTML = nums.length
    ? nums.map((n) => `<button class="fav ${prefs.favs.includes(n) ? 'on' : ''}" data-fav="${n}" title="${esc(dl[n].FullName || '')}">${esc(dl[n].Tla || n)}</button>`).join('')
    : '<span class="muted small">La liste des pilotes apparaît dès que des données sont reçues.</span>';
}
