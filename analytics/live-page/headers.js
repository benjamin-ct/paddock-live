// En-têtes de sécurité de la version web (app.paddocklive.app), ajoutés par le Worker à ses fichiers
// (analytics/worker.js : servis par lui, le fichier _headers ne s'y applique pas). Cloudflare
// Insights : statistiques de visite ajoutées par Cloudflare à la page ; OpenFreeMap : fonds du globe du Calendrier
// (style, tuiles, polices et icônes de la carte, lus par MapLibre)
export const LIVE_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob:; connect-src 'self' wss://app.paddocklive.app https://cloudflareinsights.com https://tiles.openfreemap.org; font-src 'self' data:; manifest-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
