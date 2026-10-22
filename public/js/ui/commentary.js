// Commentaires en direct :
// - F1 TV Pro : piste audio (langue au choix) de la vidéo F1 TV de la séance, calée sur le délai du
//   dashboard grâce à l'horodatage du flux (PROGRAM-DATE-TIME) ;
// - Radio / flux audio : station choisie par l'utilisateur, retardée du délai TV (Web Audio).
import { store, f1Now, on } from '../store.js';
import { prefs, setPref } from '../prefs.js';
import { $, esc, api } from '../util.js';
import { icon } from '../icons.js';
import { DEC } from '../i18n.js';

const LANG_NAMES = { ENG: 'Anglais', FRA: 'Français', DEU: 'Allemand', NLD: 'Néerlandais', SPA: 'Espagnol', POR: 'Portugais', JPN: 'Japonais', ITA: 'Italien' };
const TO_ISO = { ENG: 'en', FRA: 'fr', DEU: 'de', NLD: 'nl', SPA: 'es', POR: 'pt', JPN: 'ja', ITA: 'it' };
const FROM_ISO = Object.fromEntries(Object.entries(TO_ISO).map(([k, v]) => [v, k]));
const ALIASES = { fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', dut: 'nl', nld: 'nl', eng: 'en', spa: 'es', por: 'pt', jpn: 'ja', ita: 'it' };

let player = null;
let shakaLoading = null;
let content = null;      // vidéo F1 TV de la séance
let contentKey = '';
let playing = false;
let stream = null;       // réponse /api/f1tv/play
let syncTimer = null;

const media = () => $('#commMedia');

// ---------- Chaîne audio (retard réglable pour la radio) ----------
let audioCtx = null, srcNode = null, delayNode = null, gainNode = null;
let radioStarted = 0;
const MAX_DELAY = 170;

function ensureGraph() {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  srcNode = audioCtx.createMediaElementSource(media());
  gainNode = audioCtx.createGain();
  gainNode.connect(audioCtx.destination);
  srcNode.connect(gainNode);
}

function setAudioDelay(sec) {
  if (!audioCtx) return 0;
  sec = Math.max(0, Math.min(MAX_DELAY, sec));
  if (sec === 0 && !delayNode) return 0;
  const cap = delayNode?.delayTime.maxValue ?? 0;
  if (!delayNode || cap < sec + 2) {
    // Nouvelle ligne à retard dimensionnée au besoin (la mémoire allouée dépend du maximum)
    const node = audioCtx.createDelay(Math.min(179, Math.max(30, sec + 30)));
    srcNode.disconnect();
    delayNode?.disconnect();
    srcNode.connect(node).connect(gainNode);
    delayNode = node;
  }
  delayNode.delayTime.setValueAtTime(sec, audioCtx.currentTime);
  return sec;
}

function radioDelay() {
  return (prefs.commSync ? store.delay / 1000 : 0) + prefs.commOffset;
}

function currentStation() {
  return prefs.radioStations.find((st) => st.id === prefs.radioStation) || prefs.radioStations[0] || null;
}

function showBrowserLink(on) {
  const a = $('#commBrowser');
  if (!a) return;
  a.href = `${location.origin}/`;
  a.hidden = !on;
}

function status(text, cls = '') {
  const el = $('#commStatus');
  el.textContent = text;
  el.className = `comm-status small ${cls}`;
}

function iso(code) {
  const c = String(code || '').toLowerCase().split('-')[0];
  return ALIASES[c] || c;
}

export function loadShaka() {
  if (window.shaka) return Promise.resolve(window.shaka);
  shakaLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/shaka/shaka-player.compiled.js';
    s.onload = () => resolve(window.shaka);
    s.onerror = () => reject(new Error('Lecteur audio introuvable'));
    document.head.appendChild(s);
  });
  return shakaLoading;
}

export const proxied = (u) => `/api/f1tv/proxy?u=${encodeURIComponent(u)}`;

function sessionKeys() {
  const info = store.state.SessionInfo;
  if (!info?.Meeting?.Key || !info?.Key) return null;
  return { meeting: info.Meeting.Key, session: info.Key, label: `${info.Meeting.Name || ''} — ${info.Name || ''}` };
}

// ---------- Recherche de la vidéo F1 TV de la séance ----------
async function refreshContent(force = false) {
  const k = sessionKeys();
  const key = k ? `${k.meeting}|${k.session}` : '';
  if (!force && key === contentKey) return;
  contentKey = key;
  content = null;
  renderSelectors();
  if (!k) { $('#commInfo').textContent = 'En attente des informations de la séance…'; return; }
  $('#commInfo').textContent = `Recherche de la vidéo F1 TV (${k.label})…`;
  try {
    const r = await api(`/api/f1tv/content?meeting=${encodeURIComponent(k.meeting)}&session=${encodeURIComponent(k.session)}`);
    if (contentKey !== key) return;
    content = r.content;
    $('#commInfo').innerHTML = content
      ? `${esc(content.title || '')} <span class="muted">(${content.live ? 'en direct' : 'rediffusion'})</span>`
      : `Aucune vidéo F1 TV trouvée pour cette séance (${esc(k.label)}).`;
  } catch (err) {
    $('#commInfo').textContent = `Recherche F1 TV impossible : ${err.message}`;
  }
  renderSelectors();
}

function renderSelectors() {
  const chSel = $('#commChannel');
  const channels = content?.channels?.length ? content.channels : [{ channelId: null, title: 'INTERNATIONAL', main: true }];
  chSel.innerHTML = channels.map((c) => `<option value="${c.main ? '' : esc(c.channelId)}">${esc(c.title === 'INTERNATIONAL' ? 'International' : c.title === 'F1 LIVE' ? 'F1 Live' : c.title)}</option>`).join('');
  chSel.value = prefs.commChannel && channels.some((c) => String(c.channelId) === String(prefs.commChannel) && !c.main) ? String(prefs.commChannel) : '';
  renderLanguages();
}

// Langues : celles du flux en cours de lecture (sinon celles annoncées par F1 TV).
function renderLanguages() {
  const sel = $('#commLang');
  let langs = [];
  if (player && playing) {
    langs = [...new Set(player.getAudioTracks().map((l) => iso(l.language)))].map((l) => ({ value: FROM_ISO[l] || l.toUpperCase(), label: LANG_NAMES[FROM_ISO[l]] || l }));
  }
  if (!langs.length) langs = (content?.languages || ['ENG', 'FRA', 'DEU', 'NLD', 'SPA', 'POR']).map((c) => ({ value: c, label: LANG_NAMES[c] || c }));
  if (!langs.some((l) => l.value === prefs.commLang)) langs.push({ value: prefs.commLang, label: `${LANG_NAMES[prefs.commLang] || prefs.commLang} (indisponible ?)` });
  sel.innerHTML = langs.map((l) => `<option value="${esc(l.value)}">${esc(l.label)}</option>`).join('');
  sel.value = prefs.commLang;
}

// ---------- Lecture ----------
async function widevineAvailable() {
  if (!navigator.requestMediaKeySystemAccess) return false;
  try {
    await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] }]);
    return true;
  } catch { return false; }
}

async function start() {
  showBrowserLink(false);
  media().onerror = media().onended = null;   // surveillance propre au flux radio (remise par startRadio)
  if (prefs.commSource === 'radio') return startRadio();
  await refreshContent();
  if (!content) { status('Pas de vidéo F1 TV pour cette séance.', 'err'); return; }
  playing = true;
  renderButtons();
  status('Demande du flux à F1 TV…');
  try {
    const q = new URLSearchParams({ contentId: content.contentId });
    if (prefs.commChannel) q.set('channelId', prefs.commChannel);
    stream = await api(`/api/f1tv/play?${q}`);
    if (!stream.ok) {
      const tried = stream.tried || [];
      const acc = stream.account || {};
      const who = [acc.product && `offre « ${acc.product} »`, acc.country && `pays ${acc.country}`].filter(Boolean).join(', ');
      const t = tried.map((x) => `${x.format} : HTTP ${x.status}${x.message ? ` (${x.message})` : ''}`).join('\n');
      if (tried.some((x) => /technical package not available/i.test(x.message || ''))) {
        throw new Error(`F1 TV refuse la vidéo : il faut l'offre F1 TV Pro${who ? ` (${who})` : ''}.\n\nDétail :\n${t}`);
      }
      throw new Error(`F1 TV a refusé le flux${who ? ` (${who})` : ''}. Vérifiez que votre abonnement est « Pro » et que le jeton est valide.\n${t}`);
    }
    if (stream.drm && !(await widevineAvailable())) {
      showBrowserLink(true);
      throw new Error(`Ce flux est protégé par DRM (${stream.drm}, ${stream.streamType || stream.format}) et le module Widevine n'est pas disponible ici.\n${window.f1desktop ? 'L\'application télécharge ce module au premier lancement (connexion Internet nécessaire) : redémarrez-la puis réessayez.' : 'Utilisez Chrome ou Edge, ou l\'application Windows à jour.'}\nVous pouvez aussi ouvrir le dashboard dans votre navigateur (lien ci-dessous).`);
    }
    await getPlayer();
    player.configure({
      manifest: { disableVideo: true },
      preferredAudio: [{ language: TO_ISO[prefs.commLang] || 'en' }],
      streaming: { bufferingGoal: 20, rebufferingGoal: 2, bufferBehind: 30 },
      drm: stream.drm && stream.laURL ? { servers: { 'com.widevine.alpha': stream.laURL } } : { servers: {} },
    });
    setAudioDelay(0);
    status(`Chargement du flux (${stream.streamType || stream.format}${stream.drm ? `, DRM ${stream.drm}` : ''})…`);
    await player.load(stream.url);
    applyVolume();
    selectLanguage();
    await media().play().catch(() => {});
    showBrowserLink(false);
    status(`Lecture en cours · ${stream.streamType || stream.format}${stream.drm ? ` · DRM ${stream.drm}` : ''}`, 'ok');
    steady();
    renderLanguages();
    startSync();
  } catch (err) {
    fail(err);
  }
}

async function getPlayer() {
  const shaka = await loadShaka();
  shaka.polyfill.installAll();
  if (!shaka.Player.isBrowserSupported()) throw new Error('Navigateur non compatible avec le lecteur audio.');
  if (!player) {
    player = new shaka.Player();
    await player.attach(media());
    const net = player.getNetworkingEngine();
    net.registerRequestFilter((type, req) => {
      // Toute adresse externe passe par le relais local (jamais deux fois)
      req.uris = req.uris.map((u) => (/^https?:/i.test(u) && !u.startsWith(location.origin) ? proxied(u) : u));
      if (type === shaka.net.NetworkingEngine.RequestType.LICENSE && stream?.drmToken) req.headers['x-f1tv-entitlement'] = stream.drmToken;
    });
    // Les adresses relatives des manifestes se résolvent par rapport à l'adresse d'origine.
    net.registerResponseFilter((type, res) => {
      const up = res.headers?.['x-upstream-url'];
      if (up) res.uri = up;
    });
    player.addEventListener('error', (e) => fail(e.detail));
    player.addEventListener('adaptation', renderLanguages);
    player.addEventListener('trackschanged', renderLanguages);
  }
  return player;
}

// ---------- Radio / flux audio ----------
async function startRadio() {
  const st = currentStation();
  if (!st) { status('Ajoutez d\'abord une station avec « Ajouter ».', 'err'); return; }
  playing = true;
  renderButtons();
  status(`Connexion à « ${st.name} »…`);
  try {
    let url = st.url;
    await api('/api/radio/allow', { method: 'POST', body: { url } });
    if (/\.(pls|m3u)(\?|$)/i.test(url)) url = (await api(`/api/radio/resolve?u=${encodeURIComponent(url)}`)).url;
    ensureGraph();
    await audioCtx.resume();
    const m = media();
    if (/\.m3u8(\?|$)/i.test(url)) {
      const p = await getPlayer();
      p.configure({ manifest: { disableVideo: true }, streaming: { bufferingGoal: 20, rebufferingGoal: 2, bufferBehind: 30 }, drm: { servers: {} } });
      await p.load(url);
    } else {
      if (player) await player.unload().catch(() => {});
      // Flux radio coupé (erreur ou fin d'un flux en direct) : reconnexion comme pour F1 TV
      m.onerror = m.onended = () => { if (m.getAttribute('src')) fail({ recoverable: true, message: 'Flux radio interrompu' }); };
      m.src = proxied(url);
    }
    applyVolume();
    setAudioDelay(radioDelay());
    radioStarted = performance.now();
    await m.play();
    steady();
    startSync();
  } catch (err) {
    fail(err);
  }
}

function radioSyncStep() {
  const want = radioDelay();
  const applied = setAudioDelay(want);
  const since = (performance.now() - radioStarted) / 1000;
  const st = currentStation();
  let msg = `« ${st?.name || 'Radio'} » · retard appliqué ${applied.toFixed(1).replace('.', DEC)} s`;
  if (prefs.commSync) msg += ` (délai TV ${(store.delay / 1000).toFixed(1).replace('.', DEC)} s ${prefs.commOffset >= 0 ? '+' : '−'} ${Math.abs(prefs.commOffset).toFixed(1).replace('.', DEC)} s)`;
  if (want > MAX_DELAY) status(`${msg}\nRetard limité à ${MAX_DELAY} s.`, 'err');
  else if (since < applied) status(`${msg}\nLe son arrive dans ${Math.ceil(applied - since)} s…`, 'ok');
  else status(msg, 'ok');
}

function describe(err) {
  if (!err) return 'erreur inconnue';
  if (err.code && window.shaka) {
    const name = Object.entries(window.shaka.util.Error.Code).find(([, v]) => v === err.code)?.[0] || err.code;
    const http = err.data?.find?.((d) => typeof d === 'number' && d >= 400);
    if (/LICENSE|DRM|KEY/.test(String(name))) {
      showBrowserLink(true);
      return `Licence DRM refusée (${name}${http ? `, HTTP ${http}` : ''}).\nF1 TV exige probablement une application certifiée (signature VMP castlabs) : en attendant, ouvrez le dashboard dans Chrome ou Edge (lien ci-dessous), qui sont certifiés.`;
    }
    return `Erreur du lecteur ${name}${http ? ` (HTTP ${http})` : ''}`;
  }
  return err.message || String(err);
}

// Coupure passagère (réseau, segment en erreur 5xx, flux radio interrompu) : lecture relancée toute seule,
// 3 essais espacés ; compteur remis à zéro après une minute de lecture sans souci. Licence ou offre refusée :
// arrêt avec l'explication
let retries = 0;
let retryTimer = null;
let steadyTimer = null;
function recoverable(err) {
  if (err?.code && window.shaka) {
    const http = err.data?.find?.((d) => typeof d === 'number' && d >= 400);
    return err.category === window.shaka.util.Error.Category.NETWORK && !(http >= 400 && http < 500);
  }
  return err?.recoverable === true;
}
function steady() {
  clearTimeout(steadyTimer);
  steadyTimer = setTimeout(() => { if (playing) retries = 0; }, 60000);
}

function fail(err) {
  console.warn('[commentaires]', err);
  if (playing && recoverable(err) && retries < 3) {
    retries++;
    status(`Coupure du flux : reconnexion (essai ${retries}/3)…`);
    stop(false);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => start(), 3000 * retries);
    return;
  }
  status(describe(err), 'err');
  stop(false);
}

async function stop(clearStatus = true) {
  playing = false;
  clearTimeout(steadyTimer);
  if (clearStatus) clearTimeout(retryTimer);   // arrêt demandé : pas de reconnexion
  clearInterval(syncTimer);
  syncTimer = null;
  try { await player?.unload(); } catch { /* ignore */ }
  const m = media();
  if (m.getAttribute('src')) { m.pause(); m.removeAttribute('src'); m.load(); }
  if (clearStatus) status('');
  renderButtons();
}

function selectLanguage() {
  if (!player) return;
  const want = TO_ISO[prefs.commLang] || 'en';
  const avail = player.getAudioTracks();
  // Plusieurs pistes dans la langue : on garde la stéréo (la plus légère) plutôt que le 5.1
  const match = avail.filter((l) => iso(l.language) === want).sort((a, b) => (a.channelsCount || 2) - (b.channelsCount || 2))[0];
  if (match) { if (!match.active) player.selectAudioTrack(match); }
  else if (avail.length) status(`Langue « ${LANG_NAMES[prefs.commLang] || prefs.commLang} » absente de ce flux : ${avail.map((l) => LANG_NAMES[FROM_ISO[iso(l.language)]] || l.language).join(', ')}.`, 'err');
}

function applyVolume() {
  const m = media();
  if (gainNode) {
    m.volume = 1;
    m.muted = false;
    gainNode.gain.value = prefs.commMuted ? 0 : prefs.commVolume;
  } else {
    m.volume = prefs.commVolume;
    m.muted = prefs.commMuted;
  }
  $('#commVol').value = prefs.commVolume;
  $('#commVolVal').textContent = `${Math.round(prefs.commVolume * 100)} %`;
  renderButtons();
}

function renderButtons() {
  $('#commPlay').innerHTML = playing ? `${icon('stop')} Arrêter` : `${icon('play')} Écouter`;
  $('#commPlay').classList.toggle('btn-accent', !playing);
  $('#commMute').innerHTML = icon(prefs.commMuted ? 'volume-off' : 'volume');
  $('#commBtn').classList.toggle('on', playing);
  $('#commBtn').classList.toggle('muted', playing && prefs.commMuted);
  $('#commOffset').textContent = `${prefs.commOffset >= 0 ? '+' : ''}${prefs.commOffset.toFixed(1).replace('.', DEC)} s`;
  $('#commSync').checked = prefs.commSync;
  const radio = prefs.commSource === 'radio';
  $('#commSyncLbl').textContent = radio ? 'Retarder du délai du dashboard (délai TV)' : 'Caler sur le dashboard (délai TV)';
  document.querySelector('.comm-f1tv').hidden = radio;
  document.querySelector('.comm-radio').hidden = !radio;
  for (const r of document.querySelectorAll('input[name=commSource]')) r.checked = r.value === prefs.commSource;
}

function renderStations() {
  const sel = $('#radioStation');
  const list = prefs.radioStations;
  sel.innerHTML = list.length
    ? list.map((st) => `<option value="${esc(st.id)}">${esc(st.name)} (${esc(LANG_NAMES[st.lang] || st.lang)})</option>`).join('')
    : '<option value="">— aucune station —</option>';
  sel.value = currentStation()?.id || '';
  $('#radioDel').disabled = !list.length;
}

// ---------- Synchronisation avec le délai du dashboard ----------
// L'horodatage du flux (heure réelle de l'image) est comparé à l'heure F1 affichée par le dashboard.
function startSync() {
  clearInterval(syncTimer);
  syncTimer = setInterval(syncStep, 1000);
}

function syncStep() {
  if (prefs.commSource === 'radio') { if (playing) radioSyncStep(); return; }
  const m = media();
  if (!player || !playing || m.paused && m.readyState < 2) return;
  if (!prefs.commSync) { m.playbackRate = 1; return; }
  const date = player.getPlayheadTimeAsDate?.();
  // Sans PROGRAM-DATE-TIME, shaka renvoie une date fictive (1970) : pas de calage possible.
  if (!date || date.getTime() < Date.UTC(2000, 0, 1)) {
    m.playbackRate = 1;
    // Direct sans horodatage : position = bord du direct − décalage manuel
    if (player.isLive?.()) {
      const r = player.seekRange();
      const want = Math.max(r.start, r.end - 3 - Math.max(0, prefs.commOffset));
      if (Math.abs(m.currentTime - want) > 1.5) m.currentTime = want;
      status('Lecture en cours · ajustez le décalage du son à l\'oreille.', 'ok');
      return;
    } status('Lecture en cours · réglez le décalage à la main.', 'ok'); return; }
  const target = f1Now() - prefs.commOffset * 1000;
  const diff = (date.getTime() - target) / 1000; // > 0 : le son est en avance sur le dashboard
  const range = player.seekRange();
  if (Math.abs(diff) > 2) {
    const want = m.currentTime - diff;
    const t = Math.max(range.start, Math.min(range.end, want));
    m.currentTime = t;
    m.playbackRate = 1;
    if (want > range.end + 1) status(`Le flux F1 TV a ${(want - range.end).toFixed(0)} s de retard : augmentez le délai du dashboard.`, 'err');
    else if (want < range.start - 1) status('Moment trop ancien pour ce flux.', 'err');
  } else {
    // Petits écarts : on accélère ou ralentit légèrement, sans coupure
    m.playbackRate = Math.abs(diff) < 0.25 ? 1 : diff > 0 ? 0.97 : 1.03;
    if ($('#commStatus').classList.contains('err') && Math.abs(diff) < 1) status(`Lecture en cours · calé sur le dashboard`, 'ok');
  }
}

// ---------- Initialisation ----------
export function initCommentary() {
  const panel = $('#commPanel');
  $('#commBtn').addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden && prefs.commSource !== 'radio') refreshContent();
  });
  $('#commClose').addEventListener('click', () => { panel.hidden = true; });
  // Échap : ferme le panneau (le son continue), sans fermer aussi la page ouverte derrière
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || panel.hidden || document.querySelector('dialog[open]')) return;
    e.stopPropagation();
    panel.hidden = true;
  }, true);
  $('#commPlay').addEventListener('click', () => { if (playing) stop(); else { retries = 0; start(); } });
  $('#commMute').addEventListener('click', () => setPref('commMuted', !prefs.commMuted));
  $('#commVol').addEventListener('input', (e) => {
    setPref('commVolume', Number(e.target.value));
    if (prefs.commMuted && prefs.commVolume > 0) setPref('commMuted', false);
  });
  $('#commLang').addEventListener('change', (e) => { setPref('commLang', e.target.value); selectLanguage(); });
  $('#commChannel').addEventListener('change', async (e) => {
    setPref('commChannel', e.target.value || null);
    if (playing) { await stop(); start(); }
  });
  $('#commSync').addEventListener('change', (e) => setPref('commSync', e.target.checked));
  for (const r of document.querySelectorAll('input[name=commSource]')) {
    r.addEventListener('change', async (e) => {
      if (playing) await stop();
      setPref('commSource', e.target.value);
      status('');
      if (e.target.value === 'f1tv') refreshContent();
    });
  }
  $('#radioStation').addEventListener('change', async (e) => {
    setPref('radioStation', e.target.value);
    if (playing && prefs.commSource === 'radio') { await stop(); start(); }
  });
  $('#radioAdd').addEventListener('click', () => { $('#radioForm').hidden = false; $('#radioName').focus(); });
  $('#radioCancel').addEventListener('click', () => { $('#radioForm').hidden = true; });
  $('#radioForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = $('#radioUrl').value.trim();
    try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw new Error(); } catch { status('Adresse invalide : http:// ou https:// attendu.', 'err'); return; }
    const st = { id: Date.now().toString(36), name: $('#radioName').value.trim() || 'Radio', lang: $('#radioLangSel').value, url };
    setPref('radioStations', [...prefs.radioStations, st]);
    setPref('radioStation', st.id);
    $('#radioForm').reset();
    $('#radioForm').hidden = true;
  });
  $('#radioDel').addEventListener('click', async () => {
    const st = currentStation();
    if (!st || !window.confirm(`Supprimer la station « ${st.name} » ?`)) return;
    if (playing && prefs.commSource === 'radio') await stop();
    setPref('radioStations', prefs.radioStations.filter((x) => x.id !== st.id));
    setPref('radioStation', prefs.radioStations[0]?.id || null);
  });
  panel.querySelector('.comm-offset').addEventListener('click', (e) => {
    const b = e.target.closest('[data-coff]');
    if (b) setPref('commOffset', Math.round((prefs.commOffset + Number(b.dataset.coff)) * 10) / 10);
  });
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest('input, select, textarea') && playing) setPref('commMuted', !prefs.commMuted);
  });
  on('prefs', (k) => {
    if (k === 'commVolume' || k === 'commMuted') applyVolume();
    if (k === 'commOffset' || k === 'commSync' || k === 'commSource') renderButtons();
    if (k === 'radioStations' || k === 'radioStation') renderStations();
  });
  on('delay', () => { if (playing && prefs.commSource === 'radio') radioSyncStep(); });
  on('status', () => { if (!panel.hidden) refreshContent(); });
  applyVolume();
  renderSelectors();
  renderStations();
  renderButtons();
}

export const _test = { iso, TO_ISO, graph: () => ({ audioCtx, gainNode, delayNode }) };
