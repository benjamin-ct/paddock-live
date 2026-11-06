// En-têtes de sécurité de la version web (app.paddocklive.app), ajoutés par le Worker à ses fichiers
// (analytics/worker.js : servis par lui, le fichier _headers ne s'y applique pas). Cloudflare
// Insights : statistiques de visite ajoutées par Cloudflare à la page ; OpenFreeMap : fonds du globe du Calendrier
// (style, tuiles, polices et icônes de la carte, lus par MapLibre) ; RainViewer : liste des images du radar de pluie
// (images elles-mêmes : img-src https:) ; Windy : carte animée de l'onglet Météo, dans un cadre
export const LIVE_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https://livetiming.formula1.com; connect-src 'self' wss://app.paddocklive.app https://cloudflareinsights.com https://tiles.openfreemap.org https://api.rainviewer.com https://api.openf1.org https://livetiming.formula1.com; frame-src https://embed.windy.com; font-src 'self' data:; manifest-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// Page du créateur (/studio/) : seulement son code (/m/…), pdf.js (cdnjs, grille de la FIA) et ses fichiers ; images,
// sons et vidéos de partout (visuels des posts, photos, aperçus) ; données lues en direct dans la page (Jolpica,
// MultiViewer, Open-Meteo) ; jamais dans le cadre d'un autre site. Mis par le Worker sur la page (run_worker_first) et
// par le fichier _headers sur ses autres fichiers (scripts/build-studio.mjs)
export const STUDIO_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; worker-src 'self' blob: https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https: data: blob:; font-src 'self' data:; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
