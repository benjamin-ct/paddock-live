// Traductions (actualités, textes de la FIA) demandées au serveur Paddock Live par le navigateur et conservées
// ici : elles servent ensuite à tous les appareils (téléphone…) et ne sont jamais redemandées. Une traduction
// « high » (modèle de langage des anciennes versions) remplace une « light ».
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR } from './circuits.js';
import { badScript } from '../shared/translation-check.js';

const LANGS = new Set(['fr', 'es', 'de', 'it', 'en']);
const MAX_ENTRIES = 20000;
const MAX_LEN = 4000;
const stores = new Map();

const file = (lang) => path.join(CACHE_DIR, `translations-${lang}.json`);

function load(lang) {
  if (!stores.has(lang)) {
    let data = {};
    try { data = JSON.parse(fs.readFileSync(file(lang), 'utf8')) || {}; } catch { /* rien encore */ }
    // Traductions avec des caractères d'une autre écriture (anciennes versions) : retirées, refaites
    for (const [k, v] of Object.entries(data)) if (badScript(v?.t, lang)) delete data[k];
    stores.set(lang, data);
  }
  return stores.get(lang);
}

// Une minuterie par langue (avec une seule, l'ajout d'une autre langue annulait l'enregistrement)
const saveTimers = new Map();
function scheduleSave(lang) {
  clearTimeout(saveTimers.get(lang));
  saveTimers.set(lang, setTimeout(() => {
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(file(lang), JSON.stringify(load(lang)));
    } catch (err) { console.warn('[traductions]', err.message); }
  }, 1000));
}

export function getTranslations(lang) {
  return LANGS.has(lang) ? load(lang) : {};
}

// items : [{ en, t, q }] ; renvoie le nombre de traductions enregistrées
export function addTranslations(lang, items) {
  if (!LANGS.has(lang) || !Array.isArray(items)) return 0;
  const data = load(lang);
  let n = 0;
  for (const it of items.slice(0, 200)) {
    const en = typeof it?.en === 'string' ? it.en.trim() : '';
    const t = typeof it?.t === 'string' ? it.t.trim() : '';
    const q = it?.q === 'high' ? 'high' : 'light';
    // « __proto__ », « constructor »… : noms réservés des objets JavaScript, jamais enregistrés
    if (!en || !t || en.length > MAX_LEN || t.length > MAX_LEN || en in Object.prototype || badScript(t, lang)) continue;
    const old = Object.hasOwn(data, en) ? data[en] : null;
    if (old && (old.q === 'high' || q === 'light')) continue;
    if (!old && Object.keys(data).length >= MAX_ENTRIES) break;
    data[en] = { t, q };
    n++;
  }
  if (n) scheduleSave(lang);
  return n;
}
