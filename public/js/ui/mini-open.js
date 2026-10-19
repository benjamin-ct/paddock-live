// Bouton « mini-classement » : fenêtre flottante toujours au premier plan, par-dessus la vidéo.
// Chrome / Edge : image dans l'image (Document Picture-in-Picture) ; appli de bureau : petite
// fenêtre « toujours au premier plan » ; autres navigateurs : simple petite fenêtre.
import { $ } from '../util.js';
import { toast } from './delay.js';

let pip = null;

async function openMini() {
  if (pip && !pip.closed) { pip.focus?.(); return; }
  const size = { width: 300, height: 640 };   // les 20 pilotes en entier
  if (!window.f1desktop && window.documentPictureInPicture) {
    try {
      pip = await window.documentPictureInPicture.requestWindow(size);
      const d = pip.document;
      d.title = 'Paddock Live — mini-classement';
      d.body.style.cssText = 'margin:0;background:#07080A;overflow:hidden';
      const f = d.createElement('iframe');
      f.src = '/mini.html';
      f.style.cssText = 'border:0;width:100vw;height:100vh;display:block';
      d.body.appendChild(f);
      return;
    } catch { /* refusé : petite fenêtre classique */ }
  }
  // Appli de bureau : fenêtre sans cadre ni fond (comme la carte flottante)
  const w = window.open(window.f1desktop ? '/mini.html?float=1' : '/mini.html', 'paddock-mini', `popup,width=${size.width},height=${size.height}`);
  if (!w) toast('Fenêtre bloquée : autorisez les fenêtres surgissantes pour ce site', 5000);
}

export function initMiniOpen() {
  $('#miniBtn')?.addEventListener('click', openMini);
}
