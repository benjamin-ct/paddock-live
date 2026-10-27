// Mode créateur : outils réservés au propriétaire de l'application (comptes des réseaux sociaux pour le
// Studio, diagnostic des données F1). Caché par défaut, activé sur l'ordinateur avec un code dont seule
// l'empreinte est ici.
import crypto from 'node:crypto';
import { getConfig, saveConfig } from './config.js';

// Clé tirée du code (lente à calculer : 200 000 tours, un code ne se devine pas en essayant à la chaîne). Elle sert
// aussi à la page web (studio-sync.js) ; le serveur en connaît la même empreinte
export const studioKey = (code) => crypto.pbkdf2Sync(String(code).trim().toUpperCase(), 'paddock-live-studio', 200000, 32, 'sha256').toString('base64url');
// Autre clé tirée du même code, jamais envoyée : chiffre dans l'appli la copie des comptes gardée par le serveur
export const accountsKey = (code) => crypto.pbkdf2Sync(String(code).trim().toUpperCase(), 'paddock-live-comptes', 200000, 32, 'sha256').toString('base64url');
// Empreinte SHA-256 de la clé, remplaçable seulement pour les tests (variable d'environnement de l'ordinateur)
const HASH = process.env.PADDOCK_CREATOR_HASH || 'be805284f800e563ff899b7888cbc9a2d06db8223a7c903bb488ed99f105f05b';

export const creatorEnabled = () => getConfig().creator === true;

export const checkCode = (code) => crypto.timingSafeEqual(crypto.createHash('sha256').update(Buffer.from(studioKey(code || ''), 'base64url')).digest(), Buffer.from(HASH, 'hex'));

export function setCreator(code, on = true) {
  if (!on) { saveConfig({ creator: false }); return false; }
  const ok = checkCode(code);
  if (ok) saveConfig({ creator: true });
  return ok;
}
