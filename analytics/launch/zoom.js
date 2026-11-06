// Captures du site (accueil et guides) : un clic, ou Entrée au clavier, ouvre l'image en grand ; Échap, un clic
// ou le bouton la referme. Libellés en français ou en anglais selon la langue de la page (lue à l'ouverture,
// l'accueil change de langue sans recharger)
(() => {
  const imgs = document.querySelectorAll('.shot img, .frame img');
  if (!imgs.length || !window.HTMLDialogElement) return;
  const en = () => document.documentElement.lang === 'en';
  const css = document.createElement('style');
  css.textContent = `
    .shot img, .frame img { cursor: zoom-in; }
    .shot img:focus-visible, .frame img:focus-visible { outline: 2px solid #e10600; outline-offset: -2px; }
    dialog.zoom { padding: 0; border: 0; background: none; max-width: 96vw; max-height: 94vh; overflow: visible; }
    dialog.zoom::backdrop { background: rgba(5, 7, 10, .9); }
    dialog.zoom img { display: block; max-width: 96vw; max-height: 94vh; width: auto; height: auto; border-radius: 10px; cursor: zoom-out; }
    dialog.zoom button { position: fixed; top: 14px; right: 14px; width: 44px; height: 44px; border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, .25); background: #121821; color: #fff; font: 400 26px/1 sans-serif; cursor: pointer; }`;
  document.head.append(css);
  const d = document.createElement('dialog');
  d.className = 'zoom';
  d.innerHTML = '<img alt=""><button type="button">×</button>';
  document.body.append(d);
  const big = d.querySelector('img'), close = d.querySelector('button');
  const label = (img) => img.setAttribute('aria-label', en() ? `Enlarge: ${img.alt || 'screenshot'}` : `Agrandir : ${img.alt || 'capture'}`);
  for (const img of imgs) {
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    label(img);
    img.addEventListener('focus', () => label(img));
    const open = () => {
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      close.setAttribute('aria-label', en() ? 'Close' : 'Fermer');
      d.showModal();
    };
    img.addEventListener('click', open);
    img.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  }
  d.addEventListener('click', () => d.close());
})();
