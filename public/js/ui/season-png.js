// Graphiques de la Saison enregistrés en image PNG (bouton « PNG » dans le titre de chaque bloc qui en a un) :
// le SVG est recopié avec ses couleurs calculées (variables du thème), dessiné sur un canvas au double de sa taille,
// avec le titre du bloc et la mention Paddock Live.
import { t } from '../i18n.js';

const STYLE = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'opacity', 'font-size', 'font-weight', 'font-family', 'paint-order'];

// Boutons ajoutés après chaque affichage de la rubrique
export function addPngButtons(root) {
  for (const box of root.querySelectorAll('.sz-box')) {
    const h3 = box.querySelector(':scope > h3');
    if (h3 && box.querySelector('svg.sz-svg') && !h3.querySelector('.sz-png')) {
      h3.insertAdjacentHTML('beforeend', `<button type="button" class="sz-png" title="${t('Enregistrer le graphique en image (PNG)')}">PNG</button>`);
    }
  }
}

// Copie du SVG avec les styles calculés (les classes et variables du thème n'existent plus hors de la page)
function inlined(svg) {
  const copy = svg.cloneNode(true);
  const src = [svg, ...svg.querySelectorAll('*')], dst = [copy, ...copy.querySelectorAll('*')];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el), d = dst[i];
    d.removeAttribute('class');
    // Tracé animé (pathLength et pointillés de l'animation) : dessiné en entier
    if (d.hasAttribute('pathLength')) { d.removeAttribute('pathLength'); d.style.strokeDasharray = 'none'; }
    for (const p of STYLE) if (!(p === 'stroke-dasharray' && d.style.strokeDasharray)) d.style.setProperty(p, cs.getPropertyValue(p));
  });
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return copy;
}

export async function savePng(box, year, sub = '') {
  const svg = box.querySelector('svg.sz-svg');
  if (!svg) return;
  const [, , vw, vh] = (svg.getAttribute('viewBox') || `0 0 ${svg.clientWidth} ${svg.clientHeight}`).split(/\s+/).map(Number);
  const root = getComputedStyle(document.documentElement);
  const bg = root.getPropertyValue('--panel').trim() || '#0b0b0d', fg = root.getPropertyValue('--text').trim() || '#fff', mu = root.getPropertyValue('--muted').trim() || '#888';
  const h3 = box.querySelector(':scope > h3');
  const title = h3 ? [...h3.childNodes].filter((n) => !n.classList?.contains('sz-png')).map((n) => n.textContent).join('').trim() : '';
  const pad = 24, head = sub ? 62 : 44, foot = 26, k = 2;
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(inlined(svg))], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
    const out = document.createElement('canvas');
    out.width = (vw + pad * 2) * k; out.height = (vh + head + foot) * k;
    const c = out.getContext('2d');
    c.scale(k, k);
    c.fillStyle = bg; c.fillRect(0, 0, vw + pad * 2, vh + head + foot);
    const font = getComputedStyle(document.body).fontFamily;
    c.fillStyle = fg; c.font = `700 18px ${font}`; c.fillText(title, pad, 30);
    if (sub) { c.fillStyle = mu; c.font = `13px ${font}`; c.fillText(sub, pad, 50); }
    c.drawImage(img, pad, head, vw, vh);
    c.fillStyle = mu; c.font = `12px ${font}`; c.textAlign = 'right';
    c.fillText(`Paddock Live · ${t('saison {}', year)} · paddocklive.app`, vw + pad, vh + head + 18);
    const a = document.createElement('a');
    a.download = `paddock-live-${year}-${title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'graphique'}.png`;
    a.href = out.toDataURL('image/png');
    a.click();
  } finally { URL.revokeObjectURL(url); }
}
