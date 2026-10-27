// Contrôle d'une traduction rendue par le modèle de langage : il lui arrive de glisser des caractères
// d'une autre écriture (« Laurent Mekies将继续… ») ou de recopier un texte japonais sans le traduire.
// Pour une langue en alphabet latin, tout caractère chinois, japonais, coréen, cyrillique, arabe,
// hébreu, thaï ou devanagari rend la traduction suspecte : elle est refaite autrement.
const LATIN = new Set(['fr', 'en', 'es', 'de', 'it', 'nl', 'pt']);
const FOREIGN = /[Ѐ-ӿ֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ㐀-䶿一-鿿가-힯ｦ-ﾟ]/;

export const badScript = (out, to) => LATIN.has(to) && FOREIGN.test(String(out || ''));

// Le modèle répond au texte au lieu de le traduire (« Je ne comprends pas cette séquence… Pourriez-vous
// reformuler ? »), le plus souvent sur un texte illisible. Ignoré si l'original parle déjà de ne pas
// comprendre (« I don't understand what you said »), ou si la phrase est dans une citation (« Je ne comprends pas
// pourquoi nous manquions de rythme »).
const CHAT = /\b(je ne comprends pas|j'ai pas compris|pourr(ais|iez)[- ](je|tu|vous)|peux-tu|pouvez-vous|reformuler|clarifier|il semble (y avoir|s'agir|que)|bruit d'écoute|signal erroné|i (do not|don't) understand|could you (please )?(clarify|rephrase|provide)|it (seems|looks) like|please (clarify|provide|rephrase)|as an ai|no entiendo|puedes (aclarar|reformular)|ich verstehe nicht|non capisco)\b/i;
const ASKS = /understand|clarif|rephrase|repeat|say again|unclear|confus/i;
const QUOTED = /«[^»]*»|“[^”]*”|"[^"]*"/g;
export const chatty = (out, src) => CHAT.test(String(out || '').replace(QUOTED, '')) && !ASKS.test(String(src || ''));
export const badTranslation = (out, to, src) => badScript(out, to) || chatty(out, src);
