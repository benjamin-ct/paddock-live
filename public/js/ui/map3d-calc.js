// Calculs de la vue 3D sans three.js ni page (ui/map3d.js, chargés avec elle ; testés dans test/map3d.test.js)

// Qualité : 0 économe, 1 moyenne (seulement en Auto), 2 haute (rendu complet). pr : densité de pixels au plus ;
// shadow : taille de la carte des ombres, shadowAll : bâtiments et arbres font de l'ombre (sinon les voitures seules) ;
// trees, buildings : part des arbres et des bâtiments dessinés (les plus grands et les plus près de la piste) ;
// detail : taille du sol de détail (part de la taille complète) ; aniso : anisotropie des textures du sol
export const QUALITY = [
  { pr: 1, shadow: 1024, shadowAll: false, trees: 0.3, buildings: 0.4, detail: 0.5, aniso: 2 },
  { pr: 1.5, shadow: 1024, shadowAll: true, trees: 0.65, buildings: 0.75, detail: 0.5, aniso: 4 },
  { pr: 2, shadow: 2048, shadowAll: true, trees: 1, buildings: 1, detail: 1, aniso: 16 },
];

// Ordre de dessin des arbres ou des bâtiments : les plus grands et les plus près de la piste d'abord (les plus petits
// et les plus lointains sont les premiers laissés de côté en Économe). items : [[distance à la piste (m), taille (m)]…]
// -> indices dans cet ordre
export function nearFirst(items) {
  const score = items.map(([d, size]) => size / (Math.max(0, d) + 40));
  return items.map((_, i) => i).sort((a, b) => score[b] - score[a] || a - b);
}

// Qualité Auto : images/s mesurées par fenêtres de win ms (sans les arrêts de plus de 2 s : onglet caché, décor en
// construction) ; un cran plus bas dès qu'une fenêtre saccade (moins de low images/s, ou de 80 % de la limite cap
// quand la vue en dessine moins exprès), un cran plus haut seulement après calm fenêtres de suite à high images/s ou
// plus, sans limite, et jamais avant un délai qui double à chaque retour en arrière depuis ce niveau (pas de
// va-et-vient). La fenêtre qui suit un changement est ignorée (le temps que la vue s'y fasse).
export function autoQuality(level, { max = 2, win = 3000, low = 28, high = 50, calm = 3, retry = 60000 } = {}) {
  let t0 = -1, last = -1, n = 0, cap0 = Infinity, skip = 1, good = 0;
  const wait = [], until = [];
  return {
    get level() { return level; },
    // Image dessinée à now (ms) ; cap : images/s visées (Infinity : sans limite) -> nouveau niveau, sinon null
    frame(now, cap = Infinity) {
      if (t0 < 0 || now - last > 2000 || cap !== cap0) { t0 = last = now; n = 0; cap0 = cap; return null; }
      last = now;
      n++;
      if (now - t0 < win) return null;
      const fps = (n * 1000) / (now - t0);
      t0 = now;
      n = 0;
      if (skip) { skip--; return null; }
      if (level > 0 && fps < Math.min(low, 0.8 * cap)) {
        wait[level] = (wait[level] || retry / 2) * 2;
        until[level] = now + wait[level];
        level--;
        good = 0;
        skip = 1;
        return level;
      }
      good = cap === Infinity && fps >= high ? good + 1 : 0;
      if (good >= calm && level < max && now >= (until[level + 1] || 0)) {
        level++;
        good = 0;
        skip = 1;
        return level;
      }
      return null;
    },
  };
}

// Images/s visées (économie de batterie) : 5 quand rien ne bouge (replay en pause, aucune voiture en piste), 20 sous
// drapeau rouge, 30 sur téléphone sur batterie ; sans limite (Infinity) sinon. busy : on touche à la vue (caméra,
// glisser…) : pas de ralenti, seulement la limite de la batterie
export function frameCap({ still = false, red = false, battery = false, busy = false } = {}) {
  const cap = battery ? 30 : Infinity;
  return busy ? cap : Math.min(cap, still ? 5 : red ? 20 : Infinity);
}
