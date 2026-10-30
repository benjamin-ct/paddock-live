// Infobulle des graphiques de la Saison : une seule bulle, au style de l'appli, pour tous les graphiques SVG.
// Elle s'affiche tout de suite au survol (au toucher sur téléphone) et suit la souris sans sortir de l'écran.
// Contenu : l'attribut data-sz-tip (voir tip()) ou, à défaut, le <title> de l'élément, repris à son premier survol
// et retiré (sinon le système affiche aussi sa propre bulle).
import { esc } from '../util.js';

// Titre (HTML déjà échappé), puis lignes : [libellé, valeur] ou texte sur toute la largeur ; tc : couleur de l'écurie
const html = (head, rows) => `<b>${head}</b>${rows.filter(Boolean)
  .map((r) => (Array.isArray(r) ? `<span>${esc(r[0])}</span><b>${esc(r[1])}</b>` : `<i>${esc(r)}</i>`)).join('')}`;
export const tip = (head, rows = [], tc = '') => ` data-sz-tip="${esc(html(head, rows))}"${tc ? ` data-tc="${esc(tc)}"` : ''}`;
// Zone de survol d'un point de courbe : invisible, halo de la couleur c sous la souris
export const hit = (x, y, c, attrs) => `<circle class="sz-hit" cx="${x}" cy="${y}" r="7" fill="${c}"${attrs}/>`;

// <title> « Ferrari · R3 : 0,25 % » -> titre « Ferrari », ligne R3 | 0,25 %, liseré de la couleur du tracé
function fromTitle(el, title) {
  const cut = (p) => p.split(/\s?:\s(.*)/);
  const [first, ...rest] = title.textContent.split(' · ');
  const [head, val] = cut(first);
  el.dataset.szTip = html(esc(head), [val, ...rest.map((p) => { const [l, v] = cut(p); return v ? [l, v] : p; })]);
  const paint = [el.getAttribute('fill'), el.getAttribute('stroke')].find((c) => c && c !== 'none' && c !== 'transparent');
  if (paint) el.dataset.tc = paint;
  title.remove();
}

export function initTips(host) {
  const box = document.createElement('div');
  box.className = 'sz-tip';
  box.hidden = true;
  box.dataset.noI18n = '';   // textes déjà traduits
  document.body.append(box);
  let on = null;
  const hide = () => { box.hidden = true; on = null; };
  const move = (e) => {
    let el = e.target.closest?.('.sz-svg') && e.target;
    for (; el && !el.classList?.contains('sz-svg'); el = el.parentNode) {
      const title = [...el.children].find((c) => c.tagName === 'title');
      if (title) fromTitle(el, title);
      if (el.dataset.szTip) break;
    }
    if (!el || el.classList?.contains('sz-svg')) return hide();
    if (on !== el) {
      on = el;
      box.innerHTML = el.dataset.szTip;
      box.style.setProperty('--tc', el.dataset.tc || 'var(--muted)');
      box.hidden = false;
    }
    const w = box.offsetWidth, h = box.offsetHeight, m = 8, d = 14;
    const x = e.clientX + d + w > innerWidth - m ? e.clientX - d - w : e.clientX + d;
    const y = e.clientY + d + h > innerHeight - m ? e.clientY - d - h : e.clientY + d;
    box.style.left = `${Math.max(m, Math.min(x, innerWidth - m - w))}px`;
    box.style.top = `${Math.max(m, Math.min(y, innerHeight - m - h))}px`;
  };
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerdown', move);
  host.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });   // doigt levé : la bulle reste
  host.addEventListener('scroll', hide, true);
  host.addEventListener('click', (e) => { if (e.target.closest('a, button')) hide(); });   // lien (carte du calendrier) : la vue change
}
