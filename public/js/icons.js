// Icônes de l'application, dessinées pour Paddock Live (traits de 24 × 24, couleur du texte) : elles
// remplacent les emojis partout. Dans le HTML : <svg class="ic"><use href="#i-nom"/></svg> ;
// en JavaScript : icon('nom').
const P = {
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM12 13v4M8 20h8M16 6h3a3 3 0 0 1-3 4M8 6H5a3 3 0 0 0 3 4"/>',
  news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 12h7M7 15h4"/>',
  bell: '<path d="M6 10a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 15 6 10zM10 20a2 2 0 0 0 4 0"/>',
  'bell-off': '<path d="M8.5 5.1A6 6 0 0 1 18 10c0 2.4.5 4 1 5M6 9.5V10c0 5-2 6.5-2 6.5h12.5M10 20a2 2 0 0 0 4 0M3 3l18 18"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  pause: '<rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"/>',
  play: '<path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.3-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z" fill="currentColor" stroke="none"/>',
  'skip-next': '<path d="M5 5.3v13.4a.7.7 0 0 0 1.1.6l9.4-6.7a.7.7 0 0 0 0-1.2L6.1 4.7a.7.7 0 0 0-1.1.6z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>',
  'skip-start': '<path d="M19 5.3v13.4a.7.7 0 0 1-1.1.6l-9.4-6.7a.7.7 0 0 1 0-1.2l9.4-6.7a.7.7 0 0 1 1.1.6z" fill="currentColor" stroke="none"/><path d="M5 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
  'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'chevron-up': '<path d="M6 15l6-6 6 6"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'tri-up': '<path d="M12 5.5l7 11H5z" fill="currentColor" stroke="none"/>',
  'tri-down': '<path d="M12 18.5l7-11H5z" fill="currentColor" stroke="none"/>',
  swap: '<path d="M4 8h15l-3.5-3.5M20 16H5l3.5 3.5"/>',
  undo: '<path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7L20 8.7M20 3.5v5.2h-5.2"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/>',
  'window-in': '<path d="M11 13l-7 7M4 14v6h6M8 10V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-5"/>',
  window: '<rect x="3" y="7" width="14" height="12" rx="1.5"/><path d="M7 7V4.5A1.5 1.5 0 0 1 8.5 3h11A1.5 1.5 0 0 1 21 4.5V14a1.5 1.5 0 0 1-1.5 1.5H17"/>',
  home: '<path d="M3 11l9-7 9 7M5.5 9.5V20h5v-6h3v6h5V9.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  flag: '<path d="M5 21V4M5 4h13l-2.5 4.5L18 13H5"/>',
  checkered: '<path d="M5 21V4"/><rect x="5" y="4" width="14" height="9" rx=".5"/><path d="M5 4h3.5v3H5zM12 4h3.5v3H12zM8.5 7H12v3H8.5zM15.5 7H19v3h-3.5zM5 10h3.5v3H5zM12 10h3.5v3H12z" fill="currentColor" stroke="none"/>',
  duel: '<path d="M4 4l9.5 9.5M4 4v4.5M4 4h4.5M20 4l-9.5 9.5M20 4v4.5M20 4h-4.5M7 14.5l2.5 2.5M17 14.5L14.5 17M4.5 19.5l3.5-3.5M19.5 19.5L16 16"/>',
  medal: '<circle cx="12" cy="15" r="5.5"/><path d="M8 3l2.3 6.8M16 3l-2.3 6.8M8 3h8M12 12.5l.8 1.7 1.9.3-1.4 1.3.3 1.9-1.6-.9-1.6.9.3-1.9-1.4-1.3 1.9-.3z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  ruler: '<rect x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M6.5 8v3M10.5 8v4.5M14.5 8v3M18.5 8v4.5"/>',
  wrench: '<path d="M15.5 3.5a5 5 0 0 0-5.2 6.9L3.6 17.1a1.9 1.9 0 0 0 2.7 2.7l6.7-6.7a5 5 0 0 0 6.9-5.2l-3.1 3.1-2.7-.6-.6-2.7z"/>',
  bolt: '<path d="M13.5 2.5L4.5 14H11l-1 7.5L19 10h-6.5z"/>',
  map: '<path d="M3 6.5l6-3 6 3 6-3v14l-6 3-6-3-6 3zM9 3.5v14M15 6.5v14"/>',
  wing: '<path d="M2.5 9h19M4 9v6M20 9v6M4 13h16M9 13v6M15 13v6M7.5 19h9"/>',
  engine: '<rect x="5" y="8" width="11" height="9" rx="1.5"/><path d="M8 8V5.5h5V8M16 11h2.5V9H21v7h-2.5v-2H16M5 12.5H2.5M8.5 12.5h4"/>',
  star: '<path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  highlights: '<path d="M4 6h9M4 12h9M4 18h6"/><path d="M18 3.5l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z"/>',
  'star-fill': '<path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="currentColor"/>',
  landmark: '<path d="M3 9.5L12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>',
  car: '<circle cx="6.5" cy="16.5" r="2.5"/><circle cx="18" cy="16.5" r="2.5"/><path d="M2 14.5h2M9 16.5h6.5M20.5 16.5H22v-3h-4l-2-3H11l-2.5 3H4.5M13 10.5V8h3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10.2 9.2v5.6a.4.4 0 0 0 .6.3l4.4-2.8a.4.4 0 0 0 0-.6l-4.4-2.8a.4.4 0 0 0-.6.3z" fill="currentColor" stroke="none"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  save: '<path d="M5 3h11.5L20 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 3v5h7V3M7.5 21v-6.5h9V21"/>',
  signal: '<circle cx="12" cy="10" r="1.8"/><path d="M12 12v9M8.5 21h7M8 6a5.7 5.7 0 0 0 0 8M16 6a5.7 5.7 0 0 1 0 8M5 3a10 10 0 0 0 0 14M19 3a10 10 0 0 1 0 14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2"/>',
  layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M10 10v10"/>',
  columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  record: '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.2M3.5 3.5v4.7h4.7M12 7.5V12l3 2"/>',
  stopwatch: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5M12 2.5V6M18.5 6.5l1.5-1.5"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  note: '<path d="M6 3h8.5L19 7.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M8.5 12h7M8.5 16h7"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10"/>',
  trash: '<path d="M4 7h16M9.5 3.5h5M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  'volume-off': '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5"/>',
  warning: '<path d="M10.3 4.2L2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0zM12 9.5v4.5M12 17.5h.01"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  fire: '<path d="M12 21.5c3.9 0 6.5-2.7 6.5-6.4 0-4.4-3.6-6.4-4.6-10.6-2.7 1.8-4.2 4.5-4.2 7.3-.9-.7-1.6-1.8-1.9-3.3C6.2 10.3 5.5 12.6 5.5 15c0 3.8 2.6 6.5 6.5 6.5z"/>',
  'eye-off': '<path d="M3 3l18 18M10.6 6.1A9.4 9.4 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.8 3.3M6.5 7.6C4.3 9.1 3 12 3 12s4 6 9 6a8.6 8.6 0 0 0 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  rain: '<path d="M7 15.5a4.5 4.5 0 1 1 1.3-8.8A6 6 0 0 1 19.5 9a3.5 3.5 0 0 1-.5 6.5M8.5 18.5l-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  cloud: '<path d="M7 18.5a4.5 4.5 0 1 1 1.3-8.8A6 6 0 0 1 19.5 12a3.5 3.5 0 0 1-.5 6.5z"/>',
  'cloud-sun': '<path d="M8 3v1.5M3.5 8H2M4.8 4.8l1 1M12.2 4.8l-1 1M5.5 11.2a3.5 3.5 0 1 1 6.2-2.6"/><path d="M9.5 20a3.5 3.5 0 1 1 1-6.8A5 5 0 0 1 20 15a2.5 2.5 0 0 1-.5 5z"/>',
  storm: '<path d="M7 15.5a4.5 4.5 0 1 1 1.3-8.8A6 6 0 0 1 19.5 9a3.5 3.5 0 0 1-.5 6.5M13 13l-3 4.5h4l-3 4.5"/>',
  fog: '<path d="M7 12.5a4.5 4.5 0 1 1 1.3-8.8A6 6 0 0 1 19.5 6a3.5 3.5 0 0 1-.5 6.5M4 16h16M6 19.5h12"/>',
  snow: '<path d="M7 15.5a4.5 4.5 0 1 1 1.3-8.8A6 6 0 0 1 19.5 9a3.5 3.5 0 0 1-.5 6.5M8 19h.01M12 18h.01M16 19h.01M10 21.5h.01M14 21.5h.01"/>',
  droplet: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  radio: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8l10-5"/><circle cx="15.5" cy="14" r="2.8"/><path d="M6.5 12h3M6.5 16h3"/>',
  megaphone: '<path d="M3 10.5v3a1 1 0 0 0 1 1h2.5l8.5 5V4.5l-8.5 5H4a1 1 0 0 0-1 1zM18.5 9a4 4 0 0 1 0 6M6.5 14.5l1.2 5h3l-1-4.2"/>',
  chart: '<path d="M3 20h18M5 16l4.5-5.5 4 3.5L20 6"/>',
  doc: '<path d="M6 2.5h8.5L19 7v14a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 21zM14 2.5V7h5M9 12.5h7M9 16.5h7"/>',
  scales: '<path d="M12 3.5v17M7.5 20.5h9M5 7h14M5 7l-2.8 6.5a3 3 0 0 0 5.6 0zM19 7l-2.8 6.5a3 3 0 0 0 5.6 0z"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7.5 3c0 5 9 5.5 9 9s-9 4-9 9M16.5 3c0 5-9 5.5-9 9s9 4 9 9"/>',
  siren: '<path d="M6.5 18v-5.5a5.5 5.5 0 0 1 11 0V18M4 18h16v3H4zM12 2.5V4.5M4.4 5.4l1.4 1.4M19.6 5.4l-1.4 1.4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3.2"/>',
  maximize: '<path d="M14 4h6v6M20 4l-6.5 6.5M10 20H4v-6M4 20l6.5-6.5"/>',
  dot: '<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>',
};

export function icon(name, cls = '') {
  if (!P[name]) return '';
  return `<svg class="ic i-${name}${cls ? ` ${cls}` : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

// Flèches d'un texte déjà échappé (messages, journal des nouveautés) remplacées par les icônes
const ARROWS = { '→': 'arrow-right', '←': 'arrow-left', '↑': 'arrow-up', '↓': 'arrow-down' };
export function arrows(html) {
  return String(html).replace(/[→←↑↓]/g, (a) => icon(ARROWS[a], 'ic-s'));
}

// Planche d'icônes insérée une fois dans la page : toutes les <use href="#i-…"> y renvoient
export function installIcons(doc = document) {
  if (doc.getElementById('iconSprite')) return;
  const box = doc.createElement('div');
  box.innerHTML = `<svg id="iconSprite" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${
    Object.entries(P).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('')}</svg>`;
  doc.body.prepend(box.firstChild);
}

if (typeof document !== 'undefined' && document.body) installIcons();
else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => installIcons());
