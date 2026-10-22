// Vérifications avant publication : texte trop long pour un réseau (il le refuserait) et visuels au-delà
// de ce qu'accepte un carrousel (les derniers ne partiraient pas). Appli et Studio.
import { xLength } from './social.js';

const chars = (s) => [...String(s || '')].length;
const graphemes = (s) => [...new Intl.Segmenter().segment(String(s || ''))].length;
// réseau -> [nom, longueur maximale du texte, mesure, visuels d'un carrousel (X et Bluesky : 4 déjà choisis)]
const RULES = {
  instagram: ['Instagram', 2200, chars, 10], facebook: ['Facebook', 63206, chars, 10], threads: ['Threads', 500, chars, 20],
  x: ['X', 280, xLength, 0], bluesky: ['Bluesky', 300, graphemes, 0],
};

// nets : réseaux cochés ; textOf(n) : texte envoyé à n ; images : visuels du carrousel
// [{ msg, vals, block }] : msg à traduire, valeurs à la place des {} ; block : publication impossible
export function postProblems(nets, textOf, images = 0) {
  const out = [];
  for (const n of nets) {
    const r = RULES[n];
    if (!r) continue;
    const len = r[2](textOf(n));
    if (len > r[1]) out.push({ msg: 'Texte {} trop long : {} caractères pour {} au plus', vals: [r[0], len, r[1]], block: true });
    if (r[3] && images > r[3]) out.push({ msg: '{} : {} visuels, seuls les {} premiers seront publiés', vals: [r[0], images, r[3]] });
  }
  return out;
}

export const problemText = (p, t = (m, ...v) => v.reduce((s, x) => s.replace('{}', x), m)) => t(p.msg, ...p.vals);
