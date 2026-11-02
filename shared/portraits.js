// Portraits officiels de la saison (formula1.com), recadrés sur le visage : la même photo pour un pilote
// partout (appli, posts) et quelle que soit la séance chargée (celles des séances datent d'années
// différentes, ou manquent). Trigramme -> écurie/identifiant F1 ; à mettre à jour à chaque nouvelle saison.
const YEAR = 2026;
const PORTRAITS = {
  NOR: 'mclaren/lannor01', PIA: 'mclaren/oscpia01', VER: 'redbullracing/maxver01', HAD: 'redbullracing/isahad01',
  LEC: 'ferrari/chalec01', HAM: 'ferrari/lewham01', RUS: 'mercedes/georus01', ANT: 'mercedes/andant01',
  ALO: 'astonmartin/feralo01', STR: 'astonmartin/lanstr01', ALB: 'williams/alealb01', SAI: 'williams/carsai01',
  LAW: 'racingbulls/lialaw01', LIN: 'racingbulls/arvlin01', GAS: 'alpine/piegas01', COL: 'alpine/fracol01',
  OCO: 'haasf1team/estoco01', BEA: 'haasf1team/olibea01', HUL: 'audi/nichul01', BOR: 'audi/gabbor01',
  PER: 'cadillac/serper01', BOT: 'cadillac/valbot01', TSU: 'racingbulls/yuktsu01',
};

// Portrait serré sur le visage (appli : w pixels de côté, 480 pour les grandes cartes de la Saison) ;
// big : grand, tête et épaules (posts)
export function portraitUrl(tla, big = false, w = 240) {
  const [team, id] = PORTRAITS[tla]?.split('/') || [];
  const crop = big ? 'c_thumb,g_face,w_800,h_800,z_0.6' : `c_thumb,g_face,w_${w},h_${w},z_0.8`;
  return id ? `https://media.formula1.com/image/upload/${crop}/q_auto/v1740000001/common/f1/${YEAR}/${team}/${id}/${YEAR}${team}${id}right.webp` : null;
}

// Écurie de la saison d'un pilote de la base (« mclaren », « redbullracing »…), null sinon
export const portraitTeam = (tla) => PORTRAITS[tla]?.split('/')[0] || null;

// Photos relayées par le serveur de Paddock Live (/live/api/headshot) : seules les images du site de la F1
export function validHeadshot(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && ['media.formula1.com', 'www.formula1.com'].includes(url.hostname) && /\.(png|jpe?g|webp)(\/|$|\?)|\/image\.png$/i.test(url.pathname);
  } catch { return false; }
}
