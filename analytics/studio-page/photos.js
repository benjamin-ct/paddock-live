// Studio : photo libre de droits (Wikimedia Commons, Flickr) pour illustrer un post, cherchée par le
// serveur ; auteur et licence crédités sur le visuel
import { $, esc, api, sheet } from './ui.js';
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
