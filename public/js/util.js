// Petits utilitaires d'affichage.
import { parseLapTime, parseUtc } from '/shared/f1.js';
import { onLight } from '/shared/colors.js';
import { portraitUrl } from '/shared/portraits.js';
import { teamLogoUrl } from '/shared/team-logos.js';
import { DEC, LOCALE } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtLap(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3);
}

export function fmtSigned(sec, digits = 3) {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
  return `${sec >= 0 ? '+' : '−'}${Math.abs(sec).toFixed(digits)}`;
}

export function fmtDuration(ms, withHours = true) {
  if (!Number.isFinite(ms)) return '—';
  const neg = ms < 0;
  let s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const core = (withHours || h ? `${String(h).padStart(2, '0')}:` : '') + `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return (neg ? '-' : '') + core;
}

export function fmtClock(ms) {
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDelay(ms) {
  return `${(ms / 1000).toFixed(1).replace('.', DEC)} s`;
}

export function lapSeconds(v) {
  return parseLapTime(v);
}

export { parseUtc };

// Couleurs officielles : plusieurs équipes ont des teintes très proches (bleus, rouges, gris).
// Palette « contrastée » : une teinte bien distincte par équipe, proche de son identité.
const VIVID_TEAMS = [
  [/racing bulls|visa|alphatauri|\brb\b/i, '#b3c2ff'], // lavande
  [/red bull/i, '#2f4fff'],                             // bleu roi
  [/ferrari/i, '#ff2a2a'],                              // rouge
  [/mclaren/i, '#ff8a00'],                              // orange
  [/mercedes/i, '#00e0c6'],                             // turquoise
  [/aston/i, '#1f9a45'],                                // vert
  [/williams/i, '#00aaff'],                             // bleu ciel
  [/alpine/i, '#ff5fc8'],                               // rose
  [/haas/i, '#ffffff'],                                 // blanc
  [/audi|sauber|kick/i, '#8f979f'],                     // gris titane
  [/cadillac/i, '#d4b04a'],                             // or
];
let vividTeams = false;
export function setVividTeams(v) { vividTeams = !!v; }

// Photo d'un pilote (portrait de la saison, sinon celle de la séance), relayée par le serveur et gardée
// en cache ; null si la F1 n'en fournit pas
export function photoUrl(driver) {
  const u = portraitUrl(driver?.Tla) || driver?.HeadshotUrl;
  return u ? `/api/headshot?u=${encodeURIComponent(u)}` : null;
}

// Couleurs officielles des écuries par identifiant Jolpica (Saison, accueil ; utilisées si les couleurs contrastées
// sont désactivées)
export const OFFICIAL = {
  mercedes: '00D7B6', ferrari: 'ED1131', mclaren: 'F47600', red_bull: '4781D7', rb: '6C98FF', williams: '1868DB',
  alpine: '00A1E8', aston_martin: '229971', haas: '9C9FA2', sauber: '01C00E', audi: 'F50537', cadillac: '909090',
};

export function teamColor(driver) {
  let c = null;
  if (vividTeams && driver?.TeamName) c = VIVID_TEAMS.find(([re]) => re.test(driver.TeamName))?.[1] || null;
  if (!c) c = driver?.TeamColour ? `#${driver.TeamColour.replace('#', '')}` : '#8b95a8';
  return typeof document !== 'undefined' && document.documentElement.dataset.scheme === 'light' ? onLight(c) : c;
}


let teamLogos = true;
export function setTeamLogos(v) { teamLogos = !!v; }
let logoColor = true;
export function setLogoColor(v) { logoColor = !!v; }

// Logo en couleurs officielles (sur pastille claire : certains sont noirs) ou version blanche
export function teamLogo(teamName, color = logoColor) {
  return teamLogoUrl(teamName, { white: !color });
}

// Repère d'écurie d'un pilote : logo officiel (réglage « logos »), sinon barre de couleur.
// Logo en couleurs : pastille claire liserée de la couleur d'équipe ; logo blanc : sur la couleur d'équipe.
export function teamMark(driver) {
  const col = teamColor(driver);
  const logo = teamLogos ? teamLogo(driver?.TeamName) : null;
  if (!logo) return `<span class="drv-bar" style="background:${col}"></span>`;
  return `<span class="team-logo${logoColor ? ' color' : ''}" style="--tc:${col};background-image:url('${logo}')" title="${esc(driver?.TeamName || '')}"></span>`;
}

// Choix d'une liste de pilotes : numéro et repère d'écurie, affichés devant le nom par le menu des listes (ui/select.js)
export const driverOpt = (driver, num = driver?.RacingNumber) => ` data-num="${esc(num ?? '')}" data-mark="${esc(teamMark(driver))}"`;

export const COMPOUNDS = {
  SOFT: { letter: 'S', color: '#ff3b3b', name: 'Tendre' },
  MEDIUM: { letter: 'M', color: '#ffd12e', name: 'Medium' },
  HARD: { letter: 'H', color: '#f2f2ee', name: 'Dur' },
  INTERMEDIATE: { letter: 'I', color: '#43b02a', name: 'Intermédiaire' },
  WET: { letter: 'W', color: '#2f8cff', name: 'Pluie' },
};

// Apparence claire : couleurs de composés plus foncées (le dur blanc serait invisible sur le blanc)
const COMPOUND_LIGHT = { SOFT: '#DC2626', MEDIUM: '#C68A00', HARD: '#4B5563', INTERMEDIATE: '#16A34A', WET: '#2563EB' };

export function compoundInfo(c) {
  const ci = COMPOUNDS[c] || { letter: '?', color: '#7a8396', name: c ? c.toLowerCase() : 'Inconnu' };
  return typeof document !== 'undefined' && document.documentElement.dataset.scheme === 'light' && COMPOUND_LIGHT[c] ? { ...ci, color: COMPOUND_LIGHT[c] } : ci;
}

export function tyreBadge(compound, age, isNew) {
  const ci = compoundInfo(compound);
  return `<span class="tyre" style="--tc:${ci.color}" title="${esc(ci.name)}${isNew === false || isNew === 'false' ? ' (occasion)' : ''}">${ci.letter}</span>` +
    (age !== undefined && age !== null ? `<span class="tyre-age">${age}</span>` : '');
}

// Liste des stints (tableau ou objet indexé).
export function stintsOf(appLine) {
  const s = appLine?.Stints;
  if (!s) return [];
  return (Array.isArray(s) ? s : Object.keys(s).sort((a, b) => a - b).map((k) => s[k])).filter(Boolean);
}

export function currentStint(appLine) {
  const st = stintsOf(appLine);
  return st.length ? st[st.length - 1] : null;
}

export function drivers(state) {
  const dl = state.DriverList || {};
  const out = {};
  for (const [k, v] of Object.entries(dl)) if (v && typeof v === 'object' && (v.Tla || v.RacingNumber)) out[k] = v;
  return out;
}

export function sessionKind(state) {
  const info = state.SessionInfo || {};
  if (info.Type === 'Race') return 'race';
  if (info.Type === 'Qualifying' || /qualif|shootout/i.test(info.Name || '')) return 'quali';
  return 'practice';
}

// Classement : ordre d'affichage officiel (Line), à défaut Position.
export function orderedNumbers(state) {
  const lines = state.TimingData?.Lines || {};
  const dl = drivers(state);
  const nums = new Set([...Object.keys(lines), ...Object.keys(dl)]);
  const rank = (n) => Number(lines[n]?.Line ?? lines[n]?.Position ?? dl[n]?.Line ?? 999);
  return [...nums].filter((n) => lines[n] || dl[n]).sort((a, b) => rank(a) - rank(b));
}

// Date (AAAA-MM-JJ) d'un instant dans un fuseau : les prévisions météo sont datées à l'heure du circuit (la course du
// soir à Las Vegas est le lendemain en UTC) ; sans fuseau connu, la date UTC
export function dayIn(t, tz) {
  try { if (tz) return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)); } catch { /* fuseau inconnu */ }
  return new Date(t).toISOString().slice(0, 10);
}

export function throttle(fn, ms) {
  let last = 0, timer = null;
  return (...args) => {
    const now = performance.now();
    const run = () => { last = performance.now(); timer = null; fn(...args); };
    if (now - last >= ms) run();
    else if (!timer) timer = setTimeout(run, ms - (now - last));
  };
}

export function storageGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}

export function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
}

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

// Espace plein écran (Accueil, Saison, Actu, Replays, Résultats) : entre la barre du haut et, sur
// téléphone, la barre d'onglets du bas (qui reste visible)
export function placeView(view) {
  const nav = document.querySelector('#mobNav');
  view.style.top = `${Math.round(document.querySelector('.topbar').getBoundingClientRect().bottom)}px`;
  view.style.bottom = nav && !nav.hidden ? `${nav.offsetHeight}px` : '';
}

// Écran de chargement du démarrage (index.html) : retiré en fondu une fois l'accueil ou le tableau de bord prêt
export function hideBoot() {
  const el = document.getElementById('bootCover');
  if (!el || el.classList.contains('out')) return;
  el.classList.add('out');
  setTimeout(() => el.remove(), 400);
}
