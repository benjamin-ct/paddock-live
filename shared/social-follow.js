// Appel à s'abonner au compte : phrase adaptée au post (dernière image des carrousels) et ligne
// ajoutée aux textes des réseaux, dans la limite de longueur de chacun.

import { xLength } from './social.js';

export function followReason(d) {
  if (d.news || d.post === 'recap') return 'pour ne rater aucune actu de la Formule 1';
  if (d.post === 'weekend' || d.post === 'raceweek') return 'pour suivre tout le week-end en direct';
  if (d.post === 'prerace') return `pour suivre ${d.sprint ? 'le sprint' : 'la course'} et avoir les résultats dès l'arrivée`;
  if (d.post === 'champ' || d.post === 'title') return 'pour suivre la lutte pour le titre';
  if (d.post === 'flash') return 'pour suivre la course en direct';
  if (d.kind === 'quali') return `pour ne rien rater ${d.sprint ? 'du sprint' : 'de la course'}`;
  if (d.kind === 'practice') return 'pour suivre tout le week-end de Formule 1';
  return "pour suivre toute l'actualité de la Formule 1";
}

// Question en fin de texte, pour faire réagir en commentaire (adaptée au post)
const FLASH_Q = { penalty: 'Pénalité méritée selon vous ? Dites-le en commentaire.', red: 'Votre réaction en commentaire.', retire: 'Votre réaction en commentaire.', sc: 'Qui va en profiter ? Votre avis en commentaire.', vsc: 'Qui va en profiter ? Votre avis en commentaire.' };
const NEWS_Q = { penalite: 'Sanction méritée selon vous ? Dites-le en commentaire.', transfert: 'Bon choix selon vous ? Dites-le en commentaire.', depart: 'Votre réaction en commentaire.', accident: 'Votre réaction en commentaire.' };
export function questionFor(d) {
  if (d.news) return NEWS_Q[d.badge?.key] || 'Votre avis en commentaire.';
  switch (d.post) {
    case 'prerace': return `Votre pronostic pour le podium ${d.sprint ? 'du sprint' : 'de la course'} ? Dites-le en commentaire.`;
    case 'champ': case 'title': return 'Qui sera champion ? Votre pronostic en commentaire.';
    case 'flash': return FLASH_Q[d.event?.kind] || "Qu'en pensez-vous ? Dites-le en commentaire.";
    case 'weekend': return 'Qui gagne ce week-end ? Votre pronostic en commentaire.';
    case 'raceweek': return 'Qui gagne ce week-end ? Votre pronostic en commentaire.';
    case 'records': return 'Un record va-t-il tomber ce week-end ? Votre avis en commentaire.';
    case 'ratings': return "D'accord avec ces notes ? Donnez les vôtres en commentaire.";
    case 'teamduels': return 'Quel duel vous surprend le plus ? Dites-le en commentaire.';
    case 'racelaps': return 'Quel a été le moment fort de la course pour vous ?';
    case 'recap': return 'Quelle info vous a le plus marqué cette semaine ?';
    default: break;
  }
  if (d.kind === 'race') return 'Votre pilote du jour ? Dites-le en commentaire.';
  if (d.kind === 'quali') return `Qui gagne ${d.sprint ? 'le sprint' : 'la course'} ? Votre pronostic en commentaire.`;
  return 'Qui sera en pole ? Votre pronostic en commentaire.';
}

// Ligne placée à la place de la signature seule, sinon juste avant les hashtags
function insert(text, line, handle) {
  if (!text) return text;
  if (handle && text.includes(`\n\n${handle}\n\n`)) return text.replace(`\n\n${handle}\n\n`, `\n\n${line}\n\n`);
  if (handle && text.endsWith(`\n\n${handle}`)) return `${text.slice(0, -handle.length)}${line}`;
  const parts = text.split('\n\n');
  if (parts.length > 1 && /^#/.test(parts[parts.length - 1])) return [...parts.slice(0, -1), line, parts[parts.length - 1]].join('\n\n');
  return `${text}\n\n${line}`;
}

// Question ajoutée juste avant la signature (ou les hashtags), dans la limite de chaque réseau
export function questionCaptions(caps, d, handle = '') {
  const h = String(handle || '').trim();
  const q = `💬 ${questionFor(d)}`;
  const before = (text) => {
    if (!text) return text;
    if (h && text.includes(`\n\n${h}\n\n`)) return text.replace(`\n\n${h}\n\n`, `\n\n${q}\n\n${h}\n\n`);
    if (h && text.endsWith(`\n\n${h}`)) return `${text.slice(0, -h.length)}${q}\n\n${h}`;
    return insert(text, q, '');
  };
  const out = { ...caps };
  for (const k of ['instagram', 'facebook']) if (out[k]) out[k] = before(out[k]);
  if (out.threads) { const t = before(out.threads); if (t.length <= 500) out.threads = t; }
  if (out.x) { const t = before(out.x); if (xLength(t) <= 280) out.x = t; }
  if (out.bsky) { const t = before(out.bsky); if ([...t].length <= 300) out.bsky = t; }
  return out;
}

// caps : textes des réseaux (instagram, facebook, threads, x, bsky…) ; handle : compte (@…)
export function followCaptions(caps, d, handle = '') {
  const h = String(handle || '').trim();
  const long = `🔔 ${h ? `Abonnez-vous à ${h}` : 'Abonnez-vous'} ${followReason(d)} !`;
  const short = h ? `🔔 Suivez ${h} pour toute l'actu F1 !` : '';
  const out = { ...caps };
  for (const k of ['instagram', 'facebook']) if (out[k]) out[k] = insert(out[k], long, h);
  if (out.threads) { const t = insert(out.threads, long, h); if (t.length <= 500) out.threads = t; }
  // X et Bluesky : ligne courte, seulement si le post reste dans la limite
  if (short && out.x) { const t = insert(out.x, short, h); if (xLength(t) <= 280) out.x = t; }
  if (short && out.bsky) { const t = insert(out.bsky, short, h); if ([...t].length <= 300) out.bsky = t; }
  return out;
}
