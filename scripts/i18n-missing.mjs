// Version anglaise : liste les textes de l'interface (code et HTML) qui n'ont pas encore de
// traduction dans public/js/i18n-en.js. À lancer après avoir ajouté des textes :
//   node scripts/i18n-missing.mjs
// Les valeurs dynamiques des gabarits (`${…}`) apparaissent comme {} : c'est la forme attendue
// dans le dictionnaire. Les fragments de code ou noms propres listés peuvent être ignorés.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dict = (await import(path.join(ROOT, 'public/js/i18n-en.js'))).default;
const FR = /[éèàêçùôîâûœÉÈÀ]|\b(le|la|les|des|du|de|un|une|et|ou|pour|avec|sans|dans|sur|par|au|aux|est|pas|plus|tour|tours|pilote|pilotes|séance|course|délai)\b/i;
const keys = new Map();

function add(k, f) {
  k = k.replace(/\s+/g, ' ').trim();
  const html = f.endsWith('.html');
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(k)) return;
  if (!html && !FR.test(k) && !/^[A-ZÀ-Ý][a-zà-ÿ]+(\s|$|[.:…])/.test(k)) return;
  if (!html && /^[\w./#:-]+$/.test(k) && !/^[A-ZÀ-Ý][a-zà-ÿ]{2,}$/.test(k) && !/[éèàêç]/.test(k)) return;
  if (/^(https?:|\/api\/|#|\.|[a-z]+[A-Z])/.test(k) || /[{};]\s*$|=>|\(\)|^[a-z-]+:\s/.test(k.replace(/\{\}/g, ''))) return;
  if (!keys.has(k)) keys.set(k, f);
}
function segments(s, f) {
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ');
  const attr = /\b(title|placeholder|aria-label|alt)="([^"]*)"/g;
  for (const m of s.matchAll(attr)) add(m[2], f);
  // Attribut seul dans une chaîne (' title="…"', ajouté à une balise) : déjà lu ci-dessus
  s = s.replace(attr, ' ');
  for (const part of s.split(/<[^>]*>/)) for (const p of part.split(/&nbsp;|\n/)) add(p.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'), f);
}
// Lecture des chaînes du code : '…', "…" et gabarits `…${…}…` (imbriqués à toute profondeur)
const unesc = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, ' ');
function skipString(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length && src[j] !== q && (q === '`' || src[j] !== '\n')) {
    if (src[j] === '\\') j += 2;
    else if (q === '`' && src[j] === '$' && src[j + 1] === '{') j = skipExpr(src, j + 2);
    else j++;
  }
  return j + 1;
}
function skipExpr(src, i) {
  for (let depth = 1; i < src.length;) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') { i = skipString(src, i); continue; }
    if (c === '{') depth++;
    else if (c === '}' && !--depth) return i + 1;
    i++;
  }
  return i;
}
function literals(src, f) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  for (let i = 0; i < src.length;) {
    const c = src[i];
    if (c !== "'" && c !== '"' && c !== '`') { i++; continue; }
    const end = skipString(src, i);
    let text = src.slice(i + 1, end - 1);
    // Gabarits : chaque ${…} devient {} et ses propres textes sont lus à part
    if (c === '`') {
      let out = '';
      for (let j = 0; j < text.length;) {
        if (text[j] === '\\') { out += text.slice(j, j + 2); j += 2; }
        else if (text[j] === '$' && text[j + 1] === '{') { const k = skipExpr(text, j + 2); literals(text.slice(j + 2, k - 1), f); out += '{}'; j = k; }
        else out += text[j++];
      }
      text = out;
    }
    segments(unesc(text), f);
    i = end;
  }
}
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } };
walk(path.join(ROOT, 'public/js'));
// Hors interface : moteurs (radios, son), dictionnaires, textes rédigés directement en anglais
const SKIP = /workers\/|icons\.js|i18n|fia-docs-fr|audio-sync|calibrate/;
for (const f of files.filter((x) => x.endsWith('.js') && !SKIP.test(x))) literals(fs.readFileSync(f, 'utf8'), path.relative(ROOT, f));
for (const f of ['public/index.html', 'public/mini.html', 'analytics/live-page/index.html']) segments(fs.readFileSync(path.join(ROOT, f), 'utf8'), f);

// Fragments de gabarits imbriqués (code), polices et textes déjà en anglais ou noms propres : ignorés
const CODE = /\$\{|card\(|const |\? '|: ''|\)\.join|=>|sans-serif|^&\w+=/;
const missing = [...keys].filter(([k]) => dict[k] === undefined && dict[k.replace(/^\{\} /, '')] === undefined && !CODE.test(k) && FR.test(k));
for (const [k, f] of missing) console.log(`${f}\t${k}`);
console.log(`\n${missing.length} texte(s) sans traduction anglaise sur ${keys.size}.`);
