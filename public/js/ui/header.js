// En-tête : session, drapeau/état de la piste, tour, temps restant, météo, source.
import { store, f1Now, versionOf } from '../store.js';
import { $, esc, api, fmtDuration, sessionKind, currentStint } from '../util.js';
import { trackStatusInfo, SESSION_STATUS_FR } from '/shared/f1.js';
import { FLAG_ISO } from '/shared/flags.js';
import { gpShort, gpFull, sessionLabel } from '/shared/gp-names.js';
import { EN, LANG, LOCALE, DEC, DAY, t } from '../i18n.js';
import { upcoming } from './home.js';
import { COUNTRY_ISO } from '/shared/social-season.js';
import { circuitInfo } from '/shared/circuits-info.js';
import { flagBanner, timeLeft } from './session-info.js';
import { toast } from './delay.js';

export { FLAG_ISO };
import { icon } from '../icons.js';

const POPOUT = new URLSearchParams(location.search).has('win');

let lastVer = -1;

export function renderHeader() {
  // Entre deux séances : le prochain Grand Prix plutôt que le dernier direct
  const nx = upcoming();
  if (nx) { renderUpcoming(nx); return; }
  if (upKey) { upKey = ''; lastVer = -1; $('#clockBox .hstat-label').textContent = 'Temps restant'; }
  const s = store.state;
  const v = versionOf(['SessionInfo', 'TrackStatus', 'SessionStatus', 'LapCount', 'WeatherData', 'TimingData', 'TimingAppData', 'RaceControlMessages', '__reset']);
  if (v !== lastVer) {
    lastVer = v;
    const info = s.SessionInfo;
    const kind = sessionKind(s);
    // « Azerbaijan GP — Race » (nom complet au survol), comme MultiViewer : plus de place pour le reste
    const sn = $('#sessionName');
    sn.textContent = info ? `${EN ? gpFull(info.Meeting?.Name, true, 'GP') : gpShort(info.Meeting?.Name, LANG)} — ${sessionLabel(info.Name, LANG)}` : (store.connected ? 'En attente de données…' : 'Connexion au serveur…');
    sn.title = info ? `${gpFull(info.Meeting?.Name, LANG)} — ${sessionLabel(info.Name, LANG)}` : '';
    const status = s.SessionStatus?.Status || info?.SessionStatus;
    $('#sessionSub').textContent = info
      ? [info.Meeting?.Circuit?.ShortName, info.Meeting?.Country?.Name, status ? SESSION_STATUS_FR[status] || status : null].filter(Boolean).join(' · ')
      : '';
    // Fenêtres secondaires : leur titre est la liste de leurs panneaux (layout.js), pas la séance
    // Saison ouverte à son adresse (version web) : l'onglet garde le titre de la rubrique
    if (!POPOUT && !document.documentElement.dataset.seasonTitle) document.title = info ? `Paddock Live · ${info.Meeting?.Name || ''} ${info.Name || ''}` : 'Paddock Live';

    // Drapeau / état de piste
    const ts = $('#trackStatus');
    const finished = status === 'Finished' || status === 'Finalised' || status === 'Ends';
    let cls = 'none', label = '—';
    if (finished) { cls = 'chequered'; label = 'Arrivée'; }
    else if (status === 'Aborted') { cls = 'red'; label = 'Interrompue'; }
    else if (s.TrackStatus?.Status) {
      const ti = trackStatusInfo(s.TrackStatus.Status);
      cls = ti.color; label = ti.short === 'VERT' ? 'Drapeau vert' : ti.label;
    }
    ts.className = `track-status ${cls}`;
    ts.querySelector('.ts-label').textContent = label;

    // Tour / partie de qualif
    if (kind === 'race') {
      $('#lapLabel').textContent = 'Tour';
      const lc = s.LapCount;
      $('#lapValue').textContent = lc?.CurrentLap ? `${lc.CurrentLap}${lc.TotalLaps ? ' / ' + lc.TotalLaps : ''}` : '—';
      // Tours restants (le tour en cours compte comme restant à finir)
      const left = lc?.TotalLaps && lc?.CurrentLap ? Math.max(0, Number(lc.TotalLaps) - Number(lc.CurrentLap) + (finished ? 0 : 1)) : null;
      $('#lapsLeftBox').hidden = left === null;
      if (left !== null) $('#lapsLeft').textContent = finished ? '0' : String(left);
      lapBar(lc?.TotalLaps ? Math.min(1, Number(lc.CurrentLap || 0) / Number(lc.TotalLaps)) : null);
    } else if (kind === 'quali') {
      $('#lapsLeftBox').hidden = true;
      $('#lapLabel').textContent = 'Partie';
      const part = s.TimingData?.SessionPart;
      const sprint = /sprint/i.test(info?.Name || '');
      $('#lapValue').textContent = part ? `${sprint ? 'SQ' : 'Q'}${part}` : '—';
      lapBar(null);
    } else {
      $('#lapsLeftBox').hidden = true;
      $('#lapLabel').textContent = 'Session';
      $('#lapValue').textContent = info?.Name?.replace('Practice', 'EL') || '—';
      lapBar(null);
    }
    gmtOffset = parseGmtOffset(info?.GmtOffset);
    $('#circuitTimeBox').hidden = gmtOffset === null;

    // Drapeau du pays
    const iso = FLAG_ISO[String(info?.Meeting?.Country?.Code || '').toUpperCase()];
    const flag = $('#sessionFlag');
    if (iso && flag.dataset.iso !== iso) { flag.dataset.iso = iso; flag.src = `https://flagcdn.com/w80/${iso}.png`; flag.onerror = () => { flag.hidden = true; }; flag.onload = () => { flag.hidden = false; }; }
    if (!iso) { flag.hidden = true; flag.dataset.iso = ''; }
    flag.title = info?.Meeting?.Country?.Name || '';

    // Météo : vent (vitesse et direction), piste, air, humidité, pression, pluie
    const w = s.WeatherData;
    const wind = Number(w?.WindSpeed), dir = Number(w?.WindDirection) || 0;
    const wm = (cls, label, val, title = '') => `<div class="wm ${cls}"${title ? ` title="${esc(title)}"` : ''}><span class="muted">${label}</span><b>${val}</b></div>`;
    const wmHtml = w ? wm('wm-wind', 'Vent', Number.isFinite(wind) ? `${(wind * 3.6).toFixed(0)}<small> km/h</small> <i class="wind-arrow" style="transform:rotate(${dir + 180}deg)">${icon('arrow-up')}</i>` : '—', `Vent venant de ${dir}°`)
      + wm('wm-track', 'Piste', `${esc(w.TrackTemp)}°`)
      + wm('wm-air', 'Air', `${esc(w.AirTemp)}°`)
      + wm('wm-hum', 'Humidité', `${esc(Math.round(Number(w.Humidity)) || w.Humidity)}<small> %</small>`)
      + wm('wm-pres', 'Pression', `${esc(Math.round(Number(w.Pressure)) || w.Pressure)}<small> hPa</small>`)
      + wm('wm-rain', 'Pluie', w.Rainfall === '1' || w.Rainfall === 1 ? `${icon('rain')} Oui` : 'Non') : '';
    // Réécrite seulement si elle change (cette partie suit aussi le chronométrage, plusieurs fois par seconde)
    const wmEl = $('#weatherMini');
    if (wmEl._html !== wmHtml) { wmEl.innerHTML = wmHtml; wmEl._html = wmHtml; }
    const surf = trackSurface(s);
    const sb = $('#surfaceBox');
    sb.hidden = !surf;
    if (surf) {
      sb.className = `hstat surface ${surf.cls}`;
      sb.title = surf.why;
      $('#surfaceValue').textContent = surf.label;
    }
  }

  renderBanner();

  // Temps restant (recalculé à chaque image)
  const rem = timeLeft();
  const txt = rem === null ? '—' : fmtDuration(rem);
  digits($('#clockValue'), txt);

  // Heure locale du circuit, au moment affiché (délai TV et replay compris)
  if (gmtOffset !== null) {
    const d = new Date(f1Now() + gmtOffset);
    const hm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    digits($('#circuitTime'), hm);
  }
}

let gmtOffset = null;

// Chiffres de largeur fixe (case .dg) : la police des chiffres n'en a pas de tabulaires, le compte à rebours
// changeait de largeur à chaque seconde et faisait bouger toute la barre du haut
function digits(el, txt) {
  if (el.textContent !== txt) el.innerHTML = esc(txt).replace(/\d/g, '<i class="dg">$&</i>');
}

// ---------- Prochain Grand Prix (aucune séance en cours) ----------
// Nom, lieu et dates du week-end, compte à rebours de la prochaine séance, tours et longueur de la
// course, heure locale du circuit, heure de la course et météo prévue ce jour-là.
let upKey = '';
const two = (n) => String(n).padStart(2, '0');
function renderUpcoming(nx) {
  const key = `${nx.race}|${nx.label}|${nx.t}|${nx.tz}|${nx.raceDay?.tmax}`;
  if (key !== upKey) {
    upKey = key;
    const sn = $('#sessionName');
    sn.textContent = `${EN ? gpFull(nx.race, true, 'GP') : gpShort(nx.race, LANG)} — ${t(nx.label)}`;
    sn.title = gpFull(nx.race, LANG);
    const day = (t, o) => new Date(t).toLocaleDateString(LOCALE, o);
    $('#sessionSub').textContent = [nx.locality, nx.country, `${day(nx.first, { day: 'numeric' })}–${day(nx.raceT, { day: 'numeric', month: 'long' })}`].filter(Boolean).join(' · ');
    if (!POPOUT && !document.documentElement.dataset.seasonTitle) document.title = `Paddock Live · ${nx.race}`;
    const ts = $('#trackStatus');
    ts.className = 'track-status none';
    ts.querySelector('.ts-label').textContent = 'À venir';
    const ci = circuitInfo(nx.circuitId);
    $('#lapLabel').textContent = 'Tours';
    $('#lapValue').textContent = ci?.laps ? String(ci.laps) : '—';
    $('#lapsLeftBox').hidden = true;
    lapBar(null);
    $('#clockBox .hstat-label').textContent = 'Début dans';
    $('#circuitTimeBox').hidden = !nx.tz;
    $('#surfaceBox').hidden = true;
    const iso = COUNTRY_ISO[nx.country];
    const flag = $('#sessionFlag');
    if (iso && flag.dataset.iso !== iso) { flag.dataset.iso = iso; flag.src = `https://flagcdn.com/w80/${iso}.png`; flag.onerror = () => { flag.hidden = true; }; flag.onload = () => { flag.hidden = false; }; }
    if (!iso) { flag.hidden = true; flag.dataset.iso = ''; }
    flag.title = nx.country || '';
    const wm = (label, val, title = '') => `<div class="wm"${title ? ` title="${esc(title)}"` : ''}><span class="muted">${label}</span><b>${val}</b></div>`;
    const w = nx.raceDay;
    $('#weatherMini').innerHTML = (ci?.km ? wm('Longueur', `${String(ci.km).replace('.', DEC)}<small> km</small>`) : '')
      + wm('Course', esc(new Date(nx.raceT).toLocaleString(LOCALE, { weekday: 'short', hour: '2-digit', minute: '2-digit' })), 'Départ de la course (heure de votre appareil)')
      + (w ? wm('Prévu', `${Math.round(w.tmax)}°`, 'Température maximale prévue le jour de la course') + (w.rain != null ? wm('Pluie', `${w.rain}<small> %</small>`, 'Risque de pluie le jour de la course') : '') : '');
  }
  renderBanner();
  // Compte à rebours et heure du circuit, à la seconde
  const left = Math.max(0, Math.floor((nx.t - Date.now()) / 1000));
  const d = Math.floor(left / 86400);
  const txt = `${d ? `${d} ${DAY} ` : ''}${two(Math.floor(left / 3600) % 24)}:${two(Math.floor(left / 60) % 60)}:${two(left % 60)}`;
  digits($('#clockValue'), txt);
  if (nx.tz) {
    const hm = new Date().toLocaleTimeString('fr-FR', { timeZone: nx.tz, hour: '2-digit', minute: '2-digit' });
    digits($('#circuitTime'), hm);
  }
}

// « 04:00:00 », « -05:00:00 » -> décalage en ms par rapport à UTC
function parseGmtOffset(v) {
  const m = /^\s*([+-])?(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(v || ''));
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * ((+m[2] * 60 + +m[3]) * 60 + +(m[4] || 0)) * 1000;
}

// Barre de progression de la course (tour en cours / total)
function lapBar(frac) {
  const bar = $('#lapBar');
  bar.hidden = frac === null;
  if (frac !== null) bar.firstElementChild.style.width = `${(frac * 100).toFixed(1)}%`;
}

// État de la piste : déclaration de la direction de course (« TRACK DECLARED WET / DRY ») et
// pneus utilisés en piste (intermédiaires / pluie), complétés par le capteur de pluie.
export function trackSurface(s) {
  if (!s.SessionInfo) return null;
  let declared = null;
  const msgs = s.RaceControlMessages?.Messages;
  const arr = Array.isArray(msgs) ? msgs : Object.values(msgs || {});
  for (const m of arr) {
    const t = String(m?.Message || '').toUpperCase();
    if (/DECLARED WET|WET RACE|WET TRACK|TRACK IS WET|WET SESSION/.test(t)) declared = 'wet';
    else if (/DECLARED DRY|DRY RACE|DRY TRACK|TRACK IS DRY/.test(t)) declared = 'dry';
  }
  const lines = s.TimingData?.Lines || {};
  const apps = s.TimingAppData?.Lines || {};
  let wet = 0, total = 0;
  for (const [num, l] of Object.entries(lines)) {
    if (l?.Retired || l?.Stopped || l?.KnockedOut) continue;
    const c = currentStint(apps[num])?.Compound;
    if (!c || c === 'UNKNOWN') continue;
    total++;
    if (c === 'INTERMEDIATE' || c === 'WET') wet++;
  }
  const rain = s.WeatherData?.Rainfall === '1' || s.WeatherData?.Rainfall === 1;
  const share = total ? wet / total : 0;
  const tyres = total ? `${wet}/${total} voitures en pneus pluie/intermédiaires` : 'pneus inconnus';
  if (declared === 'wet' || share >= 0.5) {
    return { cls: 'wet', label: share >= 0.5 && s.TimingAppData ? 'Mouillée' : 'Humide', why: `Piste mouillée${declared === 'wet' ? ' (déclarée par la direction de course)' : ''} · ${tyres}${rain ? ' · pluie en cours' : ''}` };
  }
  if (share > 0 || rain) {
    return { cls: 'damp', label: 'Mixte', why: `Conditions changeantes · ${tyres}${rain ? ' · pluie en cours' : ''}` };
  }
  return { cls: 'dry', label: 'Sèche', why: `Piste sèche${declared === 'dry' ? ' (déclarée par la direction de course)' : ''} · ${tyres}` };
}

let shownReplayError = null;
let shownElsewhere = false;
const ELSEWHERE = 'Votre compte F1 TV suit déjà le direct sur un autre appareil : la F1 n\'envoie le GPS qu\'à un seul. Il y reste ; ici, positions estimées. Touchez « LIVE · GPS ailleurs » pour le reprendre ici.';
// Badge « GPS ailleurs » touché : GPS repris ici (version web : par son relais, store.takeGps), avant tout autre
// clic du badge (ouverture des replays)
export function initGpsBadge() {
  $('#sourceBadge')?.addEventListener('click', (e) => {
    if (!store.status?.source?.elsewhere) return;
    e.stopImmediatePropagation();
    if (store.takeGps) store.takeGps();
    else api('/api/live/here', { method: 'POST' }).catch(() => {});
    toast('GPS repris sur cet appareil');
  }, true);
}
// Version web sur téléphone (étiquette masquée faute de place, seul le point reste) : le toucher dit l'état du direct
export function initSourceTap() {
  $('#sourceBadge')?.addEventListener('click', () => {
    const lbl = $('#sourceLabel'), title = $('#sourceBadge').title;
    if (getComputedStyle(lbl).display === 'none') toast(title ? `${lbl.textContent} — ${title}` : lbl.textContent, 6000);
  });
}
export function renderSource() {
  const st = store.status;
  const badge = $('#sourceBadge');
  const lbl = $('#sourceLabel');
  if (!store.connected) {
    badge.className = 'source-badge error';
    lbl.textContent = 'Serveur déconnecté';
    return;
  }
  const src = st?.source || {};
  if (src.mode === 'replay') {
    badge.className = 'source-badge replay';
    lbl.textContent = src.loading ? `Chargement ${Math.round((src.progress || 0) * 100)} %` : (src.error ? 'Erreur replay' : 'REPLAY');
    badge.title = src.error || src.session || '';
    // Replay qui ne se charge pas : dit clairement, avec le retour au direct (une fois par erreur)
    if (src.error && src.error !== shownReplayError) {
      shownReplayError = src.error;
      toast(`Replay impossible : ${src.error} — « Direct » dans le menu de gauche pour revenir au direct`, 10000, 'warning');
    }
  } else if (src.mode === 'live' && src.rest) {
    // Version web, relais au repos entre deux séances : il se rebranche tout seul avant la prochaine
    badge.className = 'source-badge';
    lbl.textContent = t('Hors séance');
    badge.title = src.next ? t('Pas de séance en cours : le direct reprend tout seul avant la prochaine, {}', new Date(src.next - 30 * 60e3).toLocaleString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) : t('Pas de séance en cours');
  } else if (src.mode === 'live') {
    const stale = src.connected && src.stale;
    badge.className = `source-badge ${stale ? 'stale' : src.connected ? 'live' : 'error'}`;
    // GPS reçu ou non (positions estimées d'après les chronos) : écrit sur le badge, pas seulement au survol
    lbl.textContent = stale ? 'LIVE · figé' : !src.connected ? 'Connexion F1…' : src.authenticated ? 'LIVE · GPS' : src.elsewhere ? 'LIVE · GPS ailleurs' : 'LIVE · sans GPS';
    badge.title = stale ? 'Plus de données reçues depuis 25 s : reconnexion automatique si ça dure' : src.elsewhere ? ELSEWHERE : src.error || (src.authenticated ? 'Flux live (avec GPS F1 TV)' : src.f1tv ? 'Connexion F1 TV prête : le GPS arrive quand les voitures roulent' : 'Flux live (sans GPS : positions estimées)');
    // GPS laissé à un autre appareil : dit une fois, le badge le reprend ici
    if (src.elsewhere && !shownElsewhere) toast(ELSEWHERE, 12000, 'warning');
    shownElsewhere = !!src.elsewhere;
  } else {
    badge.className = 'source-badge';
    lbl.textContent = 'Inactif';
  }
}

// Bandeau pleine largeur : SC, VSC, drapeau rouge (et drapeau vert à la reprise).
function renderBanner() {
  const b = flagBanner();
  const el = $('#flagBanner');
  if (!b) { if (!el.hidden) el.hidden = true; return; }
  const key = `${b.cls}|${b.text}`;
  if (el._k !== key) {
    el._k = key;
    el.className = `flag-banner ${b.cls}`;
    el.querySelector('.fb-text').textContent = b.text;
    el.querySelector('.fb-sub').textContent = b.sub;
  }
  el.hidden = false;
}
