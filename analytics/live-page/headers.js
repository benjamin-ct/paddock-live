// En-têtes de sécurité de la version web : fichiers /live/* (scripts/build-studio.mjs, fichier _headers) et page
// servie à la racine de app.paddocklive.app (analytics/worker.js, que _headers ne couvre pas)
export const LIVE_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob:; connect-src 'self' wss://app.paddocklive.app wss://paddocklive.app; font-src 'self' data:; manifest-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
