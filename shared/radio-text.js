// Textes des radios d'équipe : nettoyage de la transcription, contrôle de la traduction rendue par
// le modèle de langage, et corrections du jargon F1 que le petit modèle de traduction rend mot à mot.
// (Utilisé pour les textes rendus par le serveur Paddock Live et ceux gardés par les anciennes versions.)
import { chatty } from './translation-check.js';

// Boucle de la reconnaissance vocale (ou de la traduction qui la recopie) : même groupe de 1 à 8
// mots répété à la suite (« easier, easier, easier… », des dizaines de fois) gardé une seule fois.
// Seuils hauts pour ne pas toucher aux vraies répétitions des radios (« box box, box box, box box ») :
// 8 fois pour un mot seul, 5 fois pour un groupe de mots.
export function collapseLoops(t) {
  const toks = String(t || '').split(/\s+/).filter(Boolean);
  if (toks.length < 6) return String(t || '').trim();
  const k = toks.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, ''));
  const same = (a, b, n) => { for (let j = 0; j < n; j++) if (k[a + j] !== k[b + j]) return false; return true; };
  const out = [];
  let endsInLoop = false;
  for (let i = 0; i < toks.length;) {
    let skip = 0;
    for (let n = 1; n <= 8 && !skip; n++) {
      if (!k.slice(i, i + n).join('')) continue;
      let reps = 1;
      while (i + (reps + 1) * n <= toks.length && same(i, i + reps * n, n)) reps++;
      if (reps >= (n === 1 ? 8 : 5)) { out.push(...toks.slice(i, i + n)); skip = reps * n; }
    }
    if (skip) i += skip; else out.push(toks[i++]);
    endsInLoop = skip > 0;
  }
  const s = out.join(' ');
  // Texte coupé par la boucle : terminé proprement
  return endsInLoop ? `${s.replace(/[\s,;:–—-]+$/, '')}${/[.!?…]$/.test(s) ? '' : '…'}` : s;
}

// Charabia de la reconnaissance vocale sur un son inaudible (bruit du moteur, radio hachée) :
// caractère illisible (« � »), autre écriture que l'alphabet latin au milieu de l'anglais, « mots »
// sans fin (« Goldmannutformificeyan »), ou même bout de texte répété avec des variantes.
const NON_LATIN = /[Ѐ-ӿ֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ㐀-䶿一-鿿가-힯ｦ-ﾟ]/;
export function garbled(t) {
  const s = String(t || '');
  if (!s.trim()) return false;
  if (s.includes('\uFFFD') || NON_LATIN.test(s)) return true;
  if ((s.match(/\p{L}{19,}/gu) || []).length) return true;
  // Peu de variété : groupes de 4 caractères presque tous déjà vus (texte long seulement)
  const c = s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (c.length < 80) return false;
  const grams = new Set();
  for (let i = 0; i + 4 <= c.length; i++) grams.add(c.slice(i, i + 4));
  return grams.size / (c.length - 3) < 0.3;
}

// Texte reconnu : annotations retirées (« (bruit) », « [musique] »), boucles réduites ; un texte
// sans aucun mot (« - », « ... » sur une radio sans parole audible) ou du charabia compte comme vide
export const clean = (t) => {
  const s = collapseLoops(String(t || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/>>+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[-–—]+\s*/, ''));
  return /[A-Za-z]{2}|\d/.test(s) && !garbled(s) ? s : '';
};

export const words = (t) => (t.match(/[A-Za-z']+/g) || []).length;

// Réponse du modèle de langage nettoyée : réflexion, préfixe (« Traduction : »), guillemets
export function tidy(reply) {
  return String(reply || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
    .replace(/^\s*(traduction|translation|traducción|übersetzung|traduzione|réponse|answer)\s*(\([^)]*\))?\s*:\s*/i, '')
    .replace(/^["«»“”\s]+|["«»“”\s]+$/g, '').trim();
}

// Réponse inutilisable : vide, anglais recopié, réponse au lieu d'une traduction, ou bien plus
// longue que l'original (explication, variantes…)
const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function badReply(out, text) {
  if (!out || chatty(out, text)) return true;
  if (norm(out) === norm(text) && words(text) > 2) return true;
  return out.length > text.length * 3 + 60;
}

// Petit modèle, radios : jargon F1 traduit mot à mot
const FIX_RADIO_FR = [
  [/\bbo[iî]te de bo[iî]te\b/gi, 'rentre aux stands, rentre aux stands'],   // traduction en ligne (m2m100)
  [/\b(la |une )?bo[iî]te,? (la |une )?bo[iî]te\b/gi, 'rentre aux stands, rentre aux stands'],
  [/\b(la |une )?bo[iî]te (ce|au prochain|à ce) tour\b/gi, 'rentre aux stands $2 tour'],
  [/^(copie|copier|copié)\s*[.!]?$/i, 'Reçu.'], [/^(copie|copier|copié)( ça| cela)?\b/i, 'Reçu'],
  [/\bsoulever et (la )?c[ôo]te\b/gi, 'lever le pied'], [/\bdégager et (la )?c[ôo]te\b/gi, 'lever le pied'],
  [/\bvoiture de sécurité virtuelle\b/gi, 'VSC'], [/\bpneus? (difficiles?|durs?)\b/gi, (m) => (/s\b/.test(m) ? 'pneus durs' : 'pneu dur')],
  [/\b(les|des|pneus) doux\b/gi, '$1 tendres'], [/\b(le|un) deg\b/gi, 'la dégradation'], [/\bdeg\b/gi, 'dégradation'],
];
export const fixRadio = (t, lang) => {
  if (lang !== 'fr') return t;
  const out = FIX_RADIO_FR.reduce((x, [re, by]) => x.replace(re, by), t);
  return out.charAt(0).toUpperCase() + out.slice(1);
};

// Son des caméras embarquées : sur le bruit du moteur, la reconnaissance vocale « entend » parfois
// des phrases toutes faites ou répète un mot en boucle. Ces textes-là sont écartés.
const PHANTOM = new Set(['you', 'thank you', 'thanks', 'thanks for watching', 'thank you for watching', 'bye', 'bye bye',
  'the end', 'please subscribe', 'subscribe', 'music', 'applause', 'laughter', 'oh', 'ah', 'uh', 'hmm', 'mm', 'so']);
export function isPhantom(text) {
  const t = String(text || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || PHANTOM.has(t)) return true;
  if (/^(subtitles|transcribed|captions?) by\b/.test(t)) return true;
  const w = t.split(' ');
  // Même mot répété (« go go go go go go ») ou texte sans variété
  let run = 1;
  for (let i = 1; i < w.length; i++) { run = w[i] === w[i - 1] ? run + 1 : 1; if (run >= 5) return true; }
  return w.length >= 8 && new Set(w).size / w.length < 0.25;
}

// Segments horodatés d'une fenêtre d'écoute (secondes depuis le début de la fenêtre) gardés une
// seule fois : les fenêtres se chevauchent, un segment déjà donné par la fenêtre précédente (même
// instant absolu) est ignoré. `from` : instant absolu (ms) de la fin du dernier segment gardé.
// Les phrases séparées de moins de GAP_MS forment un seul message radio.
const GAP_MS = 1500;
export function newSegments(chunks, windowStartMs, fromMs) {
  const out = [];
  let last = fromMs ?? -Infinity;
  for (const c of chunks || []) {
    const [a, b] = c.timestamp || [];
    if (!Number.isFinite(a)) continue;
    const start = windowStartMs + a * 1000;
    const end = windowStartMs + (Number.isFinite(b) ? b : a + 2) * 1000;
    const text = clean(c.text);
    if (start < last - 500 || !text || isPhantom(text)) continue;
    const prev = out.at(-1);
    if (prev && start - prev.end < GAP_MS) { prev.text = `${prev.text} ${text}`; prev.end = end; } else out.push({ start, end, text });
    last = end;
  }
  return out;
}
