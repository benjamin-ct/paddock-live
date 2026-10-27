// Studio : photo libre de droits (Wikimedia Commons, Flickr) pour illustrer un post, cherchée par le
// serveur ; auteur et licence crédités sur le visuel
import { $, $$, esc, api, sheet, glide } from './ui.js';
import { loadImage } from './editor.js';

// query : recherche proposée (pilote, écurie…) ; onPick({ image, credit }) : photo choisie
export function photoPicker(query, onPick) {
  const dlg = sheet('Photo libre de droits', `<form class="row" id="pform"><input type="search" id="pq" value="${esc(query)}" placeholder="Pilote, écurie, circuit…" enterkeyhint="search"><button class="btn small">Chercher</button></form>
    <p class="hint" id="pst"></p><div class="photos" id="pgrid"></div>`);
  const run = async () => {
    $('#pst', dlg).textContent = 'Recherche…';
    $('#pgrid', dlg).innerHTML = '';
    try {
      const r = await api(`photos?q=${encodeURIComponent($('#pq', dlg).value)}`);
      $('#pst', dlg).textContent = r.items.length ? 'Auteur et licence affichés sur le visuel.' : 'Aucune photo libre trouvée : essayez un autre nom.';
      $('#pgrid', dlg).innerHTML = r.items.map((p, i) => `<button type="button" data-ph="${i}"><img src="${esc(p.thumb)}" alt="" loading="lazy"><small>${esc(p.author)} · ${esc(p.license)} · ${esc(p.site)}</small></button>`).join('');
      for (const b of dlg.querySelectorAll('[data-ph]')) {
        b.onclick = async () => {
          const p = r.items[b.dataset.ph];
          b.classList.add('busy');
          const image = await loadImage(p.url);
          b.classList.remove('busy');
          if (!image) { $('#pst', dlg).textContent = 'Photo illisible : choisissez-en une autre.'; return; }
          onPick({ image, credit: `Photo : ${p.author} · ${p.license}` });
          dlg.close();
        };
      }
    } catch (err) { $('#pst', dlg).textContent = err.message; }
  };
  $('#pform', dlg).onsubmit = (e) => { e.preventDefault(); run(); };
  run();
}

// ---------- Recadrage d'une photo : cadre à déplacer, coins pour l'agrandir, format libre ou imposé ----------
const FORMATS = [['Libre', 0], ['Carré', 1], ['4:5', 4 / 5], ['16:9', 16 / 9]];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// image -> Promise de la photo recadrée (ImageBitmap), ou null si la fenêtre est fermée sans valider ;
// frame : proportions du cadre de la photo sur le visuel (format « Visuel », proposé d'abord : la photo
// recadrée y apparaît telle quelle, sans être recoupée)
export function cropImage(image, frame = 0) {
  const RATIOS = frame ? [['Visuel', frame], ...FORMATS] : FORMATS;
  return new Promise((resolve) => {
    const IW = image.width;
    const IH = image.height;
    let ratio = RATIOS[0][1];
    let box = { x: 0, y: 0, w: 1, h: 1 };   // cadre, en fraction de la photo
    const dlg = sheet('Recadrer la photo', `<div class="crop" id="crop"><canvas id="cropcv"></canvas><div class="crop-box" id="cropbox">${['nw', 'ne', 'sw', 'se'].map((h) => `<i data-h="${h}"></i>`).join('')}</div></div>
      <div class="seg wide" id="cropratio">${RATIOS.map(([l], i) => `<button type="button" data-r="${i}"${i ? '' : ' class="on"'}>${l}</button>`).join('')}</div>
      <div class="row"><button class="btn primary" id="cropok">Valider</button><button class="btn" id="cropall">Toute la photo</button></div>`);
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    dlg.addEventListener('close', () => finish(null));
    const cv = $('#cropcv', dlg);
    const k = Math.min(1, 1600 / Math.max(IW, IH));
    cv.width = Math.round(IW * k);
    cv.height = Math.round(IH * k);
    cv.style.width = `min(100%, ${(55 * IW / IH).toFixed(1)}vh)`;
    cv.getContext('2d').drawImage(image, 0, 0, cv.width, cv.height);
    const el = $('#cropbox', dlg);
    const show = () => Object.assign(el.style, { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` });
    // Format imposé : le plus grand cadre de ce format, centré sur le cadre actuel
    const fit = () => {
      if (!ratio) return;
      let w = 1;
      let h = IW / (IH * ratio);
      if (h > 1) { w = 1 / h; h = 1; }
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      box = { w, h, x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h) };
    };
    const area = $('#crop', dlg);
    area.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });   // glisser ici ne ferme pas la feuille
    let drag = null;
    area.onpointerdown = (e) => {
      const r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const h = e.target.dataset?.h;
      if (!h && !(px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h)) return;
      drag = { h, px, py, b: { ...box }, r };
      area.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    area.onpointermove = (e) => {
      if (!drag) return;
      const { r, b, h: c } = drag;
      const dx = (e.clientX - r.left) / r.width - drag.px;
      const dy = (e.clientY - r.top) / r.height - drag.py;
      if (!c) box = { ...b, x: clamp(b.x + dx, 0, 1 - b.w), y: clamp(b.y + dy, 0, 1 - b.h) };
      else {
        // Coin tiré, coin opposé fixe ; format imposé : la hauteur suit la largeur
        const MIN = 0.08;
        let x0 = b.x; let y0 = b.y; let x1 = b.x + b.w; let y1 = b.y + b.h;
        if (c.includes('w')) x0 = clamp(x0 + dx, 0, x1 - MIN); else x1 = clamp(x1 + dx, x0 + MIN, 1);
        if (c.includes('n')) y0 = clamp(y0 + dy, 0, y1 - MIN); else y1 = clamp(y1 + dy, y0 + MIN, 1);
        if (ratio) {
          let w = x1 - x0;
          let hh = w * IW / (IH * ratio);
          const maxH = c.includes('n') ? y1 : 1 - y0;
          if (hh > maxH) { hh = maxH; w = hh * IH * ratio / IW; if (c.includes('w')) x0 = x1 - w; else x1 = x0 + w; }
          if (c.includes('n')) y0 = y1 - hh; else y1 = y0 + hh;
        }
        box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      show();
    };
    area.onpointerup = () => { drag = null; };
    area.onpointercancel = area.onpointerup;
    const pickRatio = (i) => {
      ratio = RATIOS[i][1];
      for (const b of $$('#cropratio button', dlg)) b.classList.toggle('on', b.dataset.r === String(i));
      glide(dlg);
    };
    for (const b of $$('#cropratio button', dlg)) b.onclick = () => { pickRatio(Number(b.dataset.r)); fit(); show(); };
    $('#cropall', dlg).onclick = () => { pickRatio(RATIOS.findIndex(([, r]) => !r)); box = { x: 0, y: 0, w: 1, h: 1 }; show(); };
    $('#cropok', dlg).onclick = async () => {
      const sx = Math.round(box.x * IW);
      const sy = Math.round(box.y * IH);
      finish(await createImageBitmap(image, sx, sy, Math.max(1, Math.round(box.w * IW)), Math.max(1, Math.round(box.h * IH))));
      dlg.close();
    };
    fit();
    show();
    glide(dlg);
  });
}

// Aperçu d'une photo (ImageBitmap) pour une vignette : adresse locale
export async function bitmapUrl(image) {
  const c = document.createElement('canvas');
  const k = Math.min(1, 600 / Math.max(image.width, image.height));
  c.width = Math.round(image.width * k);
  c.height = Math.round(image.height * k);
  c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
  return URL.createObjectURL(await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85)));
}

// ---------- Photos d'un post (article, autres médias, réseaux, vos photos) ----------
// Touchées dans l'ordre : la première en couverture quand le post n'a pas déjà sa photo (cover()), puis une
// image chacune ; recadrage toujours depuis la photo d'origine. Élément : { image, url, pick, src, credit?, mine? }
export function photoGrid(el, list, { cover = () => true, frame = () => 0, onChange }) {
  const show = () => {
    el.innerHTML = list.map((a, i) => `<div class="ph"><button type="button" data-art="${i}" class="${a.pick ? 'on' : ''}">${a.pick ? `<b class="pick">${a.pick}</b>` : ''}<img src="${a.url}" alt=""><small>${a.pick ? (a.pick === 1 && cover() ? 'Couverture' : `Image ${a.pick + (cover() ? 0 : 1)}`) : 'Touchez pour ajouter'} · ${esc(a.src)}</small></button>${a.pick ? `<button type="button" class="cropbtn" data-crop="${i}">Recadrer</button>` : ''}</div>`).join('');
    for (const b of $$('[data-crop]', el)) {
      b.onclick = async () => {
        const a = list[b.dataset.crop];
        a.orig ||= a.image;
        const image = await cropImage(a.orig, a.pick === 1 && cover() ? frame() : 0);   // couverture : cadre du visuel
        if (!image) return;
        a.image = image;
        URL.revokeObjectURL(a.url);
        a.url = await bitmapUrl(image);
        show(); onChange();
      };
    }
    for (const b of $$('[data-art]', el)) {
      b.onclick = () => {
        const a = list[b.dataset.art];
        // Retirée : les suivantes avancent d'un rang ; ajoutée : à la fin
        if (a.pick) { for (const x of list) if (x.pick > a.pick) x.pick--; a.pick = 0; } else a.pick = Math.max(0, ...list.map((x) => x.pick)) + 1;
        show(); onChange();
      };
    }
  };
  show();
  return show;
}
// Vos photos (fichiers de l'appareil) ajoutées à la liste, déjà choisies, à la suite ; renvoie le nombre d'illisibles
export async function addFiles(list, files) {
  let bad = 0;
  for (const file of [...files].slice(0, 20)) {
    try {
      const image = await createImageBitmap(file);
      list.push({ image, url: await bitmapUrl(image), pick: Math.max(0, ...list.map((x) => x.pick)) + 1, src: 'Vos photos', credit: '', mine: true });
    } catch { bad++; }
  }
  return bad;
}
// Photos choisies, dans l'ordre : { image, credit } (photos des médias : « via » la source)
export const picked = (list) => list.filter((a) => a.pick).sort((a, b) => a.pick - b.pick).map((a) => ({ image: a.image, credit: a.credit ?? `Photo : via ${a.src}` }));
