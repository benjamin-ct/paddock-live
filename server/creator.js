// Mode créateur : outils réservés au propriétaire de l'application (générateur de posts pour les
// réseaux sociaux). Caché par défaut, activé sur l'ordinateur avec un code dont seule l'empreinte
// est ici. Les images des posts sont enregistrées dans Téléchargements/Paddock Live.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getConfig, saveConfig, DATA_DIR } from './config.js';

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

// Dossier des posts : Téléchargements/Paddock Live/<séance> (sinon dans le dossier des données)
const clean = (s, max = 80) => String(s || '').normalize('NFC').replace(/[^\p{L}\p{N} ._-]+/gu, ' ').replace(/\s+/g, ' ').trim().replace(/^[.\s]+/, '').slice(0, max);

export function postsDir(folder) {
  const dl = path.join(os.homedir(), 'Downloads');
  const base = fs.existsSync(dl) ? path.join(dl, 'Paddock Live') : path.join(DATA_DIR, 'posts');
  return path.join(base, clean(folder) || 'Posts');
}

// Image PNG ou vidéo (MP4 / WebM), reconnue d'après son contenu
export function savePostImage(folder, name, base64) {
  const file = clean(name, 100).replace(/\.(png|mp4|webm)$/i, '');
  if (!file || typeof base64 !== 'string') throw new Error('Fichier invalide');
  const data = Buffer.from(base64, 'base64');
  const ext = data.length > 12 && data.readUInt32BE(0) === 0x89504e47 ? 'png'
    : data.length > 12 && data.toString('latin1', 4, 8) === 'ftyp' ? 'mp4'
      : data.length > 12 && data.readUInt32BE(0) === 0x1a45dfa3 ? 'webm' : null;
  if (!ext) throw new Error('Image PNG ou vidéo attendue');
  const dir = postsDir(folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${file}.${ext}`), data);
  return dir;
}

export function openPostsDir(folder) {
  const dir = postsDir(folder);
  if (!fs.existsSync(dir)) throw new Error('Dossier introuvable');
  const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [dir], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return dir;
}
