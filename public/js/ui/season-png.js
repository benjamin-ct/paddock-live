// Graphiques de la Saison enregistrés en image PNG (bouton « PNG » dans le titre de chaque bloc qui en a un) :
// le SVG est recopié avec ses couleurs calculées (variables du thème), dessiné sur un canvas au double de sa taille,
// avec le titre du bloc et la mention Paddock Live.
import { t } from '../i18n.js';
import { toast } from './delay.js';

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

// Image prête mais partage refusé par le navigateur (toucher trop ancien) : partagée au toucher suivant du même bouton
let ready = null;

// Image enregistrée : sur téléphone ou tablette, feuille de partage (« Enregistrer l'image » → Photos ; sur iPhone, un
// lien de téléchargement ne fait rien) ; ailleurs, téléchargement. key : le bouton qui l'a demandée
export async function saveImage(blob, name, key) {
  const file = new File([blob], name, { type: 'image/png' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err.name === 'NotAllowedError') { ready = { key, file }; toast(t('Image prête : touchez de nouveau pour l\'enregistrer'), 6000); } else if (err.name !== 'AbortError') throw err;
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Image déjà prête pour ce bouton : partagée tout de suite, pendant le toucher (à appeler avant tout await)
export function shareReady(key) {
  if (!ready || ready.key !== key) return false;
  const { file } = ready;
  ready = null;
  navigator.share({ files: [file] }).catch(() => {});
  return true;
}

export async function savePng(box, year, sub = '') {
  const svg = box.querySelector('svg.sz-svg');
  if (!svg || shareReady(box)) return;
  const [, , vw, vh] = (svg.getAttribute('viewBox') || `0 0 ${svg.clientWidth} ${svg.clientHeight}`).split(/\s+/).map(Number);
  const root = getComputedStyle(document.documentElement);
  const bg = root.getPropertyValue('--panel').trim() || '#0b0b0d', fg = root.getPropertyValue('--text').trim() || '#fff', mu = root.getPropertyValue('--muted').trim() || '#888';
  const h3 = box.querySelector(':scope > h3');
  const title = h3 ? [...h3.childNodes].filter((n) => !n.classList?.contains('sz-png')).map((n) => n.textContent).join('').trim() : '';
  const pad = 24, head = sub ? 62 : 44, foot = 26, k = 2;
  // Taille donnée en clair : Safari dessine sinon un SVG sans largeur ni hauteur à 150 × 150
  const copy = inlined(svg);
  copy.setAttribute('width', vw); copy.setAttribute('height', vh);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
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
    const blob = await new Promise((ok, ko) => out.toBlob((b) => (b ? ok(b) : ko(new Error('PNG'))), 'image/png'));
    await saveImage(blob, `paddock-live-${year}-${title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'graphique'}.png`, box);
  } finally { URL.revokeObjectURL(url); }
}
