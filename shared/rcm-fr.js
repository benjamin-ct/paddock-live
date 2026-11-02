// Messages de la direction de course en français, sans traduction automatique : ils suivent des formules
// fixes (drapeaux, incidents, pénalités, stands) qu'une traduction mot à mot massacre (« INVOLVING » →
// « inclusif »). null pour un message hors formule : l'appelant le traduit autrement ou le laisse en anglais.

// Motifs des commissaires (après le tiret)
export const REASONS_FR = {
  'CAUSING A COLLISION': 'accrochage provoqué',
  'LEAVING THE TRACK AND GAINING AN ADVANTAGE': 'avantage pris hors de la piste',
  'FORCING ANOTHER DRIVER OFF THE TRACK': 'pilote poussé hors de la piste',
  'YELLOW FLAG INFRINGEMENT': 'non-respect du drapeau jaune',
  'SPEEDING IN THE PIT LANE': 'excès de vitesse dans la voie des stands',
  'IMPEDING': 'gêne d\'un autre pilote',
  'MOVING UNDER BRAKING': 'changement de trajectoire au freinage',
  'STARTING PROCEDURE INFRINGEMENT': 'infraction à la procédure de départ',
  'UNSAFE RELEASE': 'relâchement dangereux aux stands',
  'UNSAFE CONDITION': 'voiture dans un état dangereux',
  'TRACK LIMITS': 'limites de piste',
  'FAILING TO FOLLOW RACE DIRECTORS INSTRUCTIONS': 'consignes du directeur de course non respectées',
  'FAILING TO FOLLOW RACE DIRECTOR\'S INSTRUCTIONS': 'consignes du directeur de course non respectées',
  'PRACTICE START INFRINGEMENT': 'départ d\'entraînement non conforme',
  'ESCAPE ROAD INSTRUCTIONS': 'utilisation de l\'échappatoire',
  'MAXIMUM DELTA TIME': 'temps de référence maximal dépassé',
  'FALSE START': 'faux départ',
  'MOVING BEFORE SIGNAL': 'mouvement avant le signal',
  'DRIVING ERRATICALLY': 'conduite erratique',
  'DRIVING UNNECESSARILY SLOWLY': 'conduite inutilement lente',
  'DOUBLE YELLOW': 'double drapeau jaune',
  'PIT ENTRY INFRINGEMENT': 'infraction à l\'entrée des stands',
  'PIT EXIT INFRINGEMENT': 'infraction à la sortie des stands',
  'PIT LANE INFRINGEMENT': 'infraction dans la voie des stands',
  'CROSSING THE PIT EXIT LINE': 'ligne de sortie des stands franchie',
  'OVERTAKING UNDER SAFETY CAR': 'dépassement sous voiture de sécurité',
  'OVERTAKING UNDER VSC': 'dépassement sous VSC',
  'SAFETY CAR INFRINGEMENT': 'infraction sous voiture de sécurité',
  'VSC INFRINGEMENT': 'infraction sous VSC',
  'TECHNICAL INFRINGEMENT': 'infraction technique',
};

export function reasonFr(reason) {
  if (!reason) return '';
  // Heure de l'incident collée au motif (« DRIVING ERRATICALLY (16:22:32) ») : gardée telle quelle
  return reason.split(/\s[–-]\s/).map((p) => {
    const [, r, time = ''] = /^(.*?)(\s*\(\d{1,2}:\d{2}(?::\d{2})?\))?$/.exec(p.trim());
    return (REASONS_FR[r] || r.toLowerCase()) + time;
  }).join(' — ');
}

// « CAR 55 (SAI) » / « CARS 1 (NOR) AND 81 (PIA) » -> « la voiture 55 (SAI) » / « les voitures 1 (NOR) et 81 (PIA) »
const cars = (word, list) => `${word === 'CARS' ? 'les voitures' : 'la voiture'} ${list.replace(/ AND /g, ' et ')}`;
const where = (w) => (!w ? '' : /^TURN (\d+)$/.test(w) ? `virage ${w.slice(5)}, ` : /^LAP (\d+)$/.test(w) ? `tour ${w.slice(4)}, ` : { 'PIT LANE': 'voie des stands, ', 'PIT ENTRY': 'entrée des stands, ', 'PIT EXIT': 'sortie des stands, ' }[w] || `${w}, `);
const prefix = (p) => (p === 'FIA STEWARDS: ' ? 'Commissaires FIA : ' : p === 'UPDATE: ' ? 'Mise à jour : ' : '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const tail = (reason, time) => `${reason ? ` — ${reasonFr(reason)}` : ''}${time ? ` (${time})` : ''}`;

const STATUS = {
  'NOTED': 'noté',
  'UNDER INVESTIGATION': 'sous enquête',
  'REVIEWED NO FURTHER INVESTIGATION': 'examiné, pas d\'enquête',
  'NO FURTHER INVESTIGATION': 'pas d\'enquête',
  'REVIEWED NO FURTHER ACTION': 'examiné, aucune sanction',
  'NO FURTHER ACTION': 'aucune sanction',
  'WILL BE INVESTIGATED AFTER THE RACE': 'enquête après la course',
  'WILL BE INVESTIGATED AFTER THE SPRINT': 'enquête après le sprint',
  'WILL BE INVESTIGATED AFTER THE SESSION': 'enquête après la séance',
};

const PENALTY = [
  [/^(\d+) SECOND TIME PENALTY$/, (m) => `pénalité de ${m[1]} s`],
  [/^(\d+) SECOND STOP\/GO PENALTY$/, (m) => `stop & go de ${m[1]} s`],
  [/^DRIVE THROUGH PENALTY$/, () => 'drive-through'],
  [/^(\d+) PLACE GRID PENALTY$/, (m) => `${m[1]} places de pénalité sur la grille`],
  [/^REPRIMAND$/, () => 'réprimande'],
  [/^WARNING$/, () => 'avertissement'],
  [/^DISQUALIFICATION$/, () => 'disqualification'],
];

// Messages sans valeur
const FIXED = {
  'TRACK CLEAR': 'Piste dégagée',
  'CHEQUERED FLAG': 'Drapeau à damier',
  'RED FLAG': 'Drapeau rouge',
  'GREEN LIGHT - PIT EXIT OPEN': 'Feu vert : sortie des stands ouverte',
  'PIT EXIT OPEN': 'Sortie des stands ouverte',
  'PIT EXIT CLOSED': 'Sortie des stands fermée',
  'PIT LANE ENTRY OPEN': 'Entrée des stands ouverte',
  'PIT LANE ENTRY CLOSED': 'Entrée des stands fermée',
  'PIT LANE CLEAR': 'Voie des stands dégagée',
  'YELLOW IN PIT LANE': 'Drapeau jaune dans la voie des stands',
  'OVERTAKE ENABLED': 'Mode dépassement activé',
  'OVERTAKE DISABLED': 'Mode dépassement désactivé',
  'DRS ENABLED': 'DRS activé',
  'DRS DISABLED': 'DRS désactivé',
  'SAFETY CAR DEPLOYED': 'Voiture de sécurité déployée',
  'SAFETY CAR IN THIS LAP': 'La voiture de sécurité rentre à la fin de ce tour',
  'SAFETY CAR ENDING': 'Fin de la voiture de sécurité',
  'SAFETY CAR LIGHTS ON': 'Gyrophares de la voiture de sécurité allumés',
  'SAFETY CAR LIGHTS OFF': 'Gyrophares de la voiture de sécurité éteints',
  'VSC DEPLOYED': 'Voiture de sécurité virtuelle (VSC) déployée',
  'VSC ENDING': 'Fin de la voiture de sécurité virtuelle (VSC)',
  'VIRTUAL SAFETY CAR DEPLOYED': 'Voiture de sécurité virtuelle (VSC) déployée',
  'VIRTUAL SAFETY CAR ENDING': 'Fin de la voiture de sécurité virtuelle (VSC)',
  'RACE START': 'Départ de la course',
  'STANDING START': 'Départ arrêté',
  'ROLLING START': 'Départ lancé',
  'DELAYED START': 'Départ retardé',
  'STARTING PROCEDURE SUSPENDED': 'Procédure de départ suspendue',
  'START ORDER: ORIGINAL GRID': 'Ordre de départ : grille d\'origine',
  'FORMATION LAP(S) BEHIND SAFETY CAR': 'Tour(s) de formation derrière la voiture de sécurité',
  'ALL PASS HOLDERS MAY ACCESS THE PIT LANE': 'Les détenteurs d\'un laissez-passer peuvent accéder à la voie des stands',
  'ALL CARS THROUGH THE PIT LANE': 'Toutes les voitures passent par la voie des stands',
  'ALL CARS USE START/FINISH STRAIGHT': 'Toutes les voitures passent par la ligne droite des stands',
  'AWNINGS MAY BE USED': 'Les auvents peuvent être utilisés',
  'LOW GRIP DELTA ACTIVE': 'Temps de référence « faible adhérence » actif',
  'NORMAL GRIP DELTA ACTIVE': 'Temps de référence « adhérence normale » actif',
  'LOW GRIP CONDITIONS': 'Conditions de faible adhérence',
  'NORMAL GRIP CONDITIONS': 'Conditions d\'adhérence normales',
  'CHANGE IN CLIMATIC CONDITIONS': 'Changement des conditions climatiques',
  'WEATHER RADAR SYSTEM NOT AVAILABLE': 'Radar météo indisponible',
  'WEATHER RADAR SYSTEM NOW OPERATIONAL': 'Radar météo de nouveau opérationnel',
  'SESSION SUSPENDED': 'Séance suspendue',
  'RACE SUSPENDED': 'Course suspendue',
  'MEDICAL CAR DEPLOYED': 'Voiture médicale déployée',
};

const SESSION = { 'THE F1 RACE': 'la course', 'F1 RACE': 'la course', 'THE F1 SPRINT': 'le sprint', 'F1 SPRINT': 'le sprint', 'F1 QUALIFYING': 'les qualifications', 'F1 SPRINT QUALIFYING': 'les qualifications sprint' };
const WHAT = { RACE: 'La course', 'FORMATION LAP': 'Le tour de formation', SESSION: 'La séance', SPRINT: 'Le sprint', QUALIFYING: 'Les qualifications' };
const what = (w) => WHAT[w] || (/^S?Q\d$/.test(w) ? `La ${w}` : w);

const RULES = [
  [/^CLEAR IN TRACK SECTOR (\d+)$/, (m) => `Fin du drapeau jaune dans le secteur ${m[1]}`],
  [/^(DOUBLE YELLOW|YELLOW) IN TRACK SECTOR (\d+)$/, (m) => `${m[1] === 'YELLOW' ? 'Drapeau jaune' : 'Double drapeau jaune'} dans le secteur ${m[2]}`],
  [/^WAVED BLUE FLAG FOR CAR (.+?) TIMED AT (\d{1,2}:\d{2}:\d{2})$/, (m) => `Drapeau bleu agité pour la voiture ${m[1]} à ${m[2]}`],
  [/^CAR (.+?) (?:TIME (\S+)|LAP) DELETED - (.+?) AT TURN (\d+)(?: LAP (\d+))?(?: (\d{1,2}:\d{2}:\d{2}))?(?: \((?:NEXT LAP PIT|[A-Z]{3})\))?$/,
    (m) => `Voiture ${m[1]} : ${m[2] ? `temps ${m[2]}` : 'tour'} supprimé — ${reasonFr(m[3])} au virage ${m[4]}${m[5] ? `, tour ${m[5]}` : ''}${m[6] ? ` (${m[6]})` : ''}`],
  [/^TRACK SURFACE SLIPPERY IN TRACK SECTOR (\d+)$/, (m) => `Piste glissante dans le secteur ${m[1]}`],
  [/^TRACK SURFACE SLIPPERY AT TURN (\d+)$/, (m) => `Piste glissante au virage ${m[1]}`],
  [/^MARSHALS ON TRACK AT TURN (\d+)$/, (m) => `Commissaires sur la piste au virage ${m[1]}`],
  [/^MARSHALS ON TRACK AT PIT EXIT$/, () => 'Commissaires sur la piste à la sortie des stands'],
  [/^RECOVERY VEHICLE ON TRACK AT TURN (\d+)$/, (m) => `Véhicule de dépannage sur la piste au virage ${m[1]}`],
  [/^FIRST CAR TO TAKE THE FLAG - CAR (.+)$/, (m) => `Première voiture à recevoir le drapeau à damier : voiture ${m[1]}`],
  [/^RISK OF RAIN FOR (.+?) IS (\d+)%$/, (m) => {
    const fp = /^F1 FREE PRACTICE (\d)$/.exec(m[1]);
    return `Risque de pluie pour ${fp ? `les essais libres ${fp[1]}` : SESSION[m[1]] || m[1].toLowerCase()} : ${m[2]} %`;
  }],
  [/^(RACE|FORMATION LAP|SESSION|SPRINT|QUALIFYING|S?Q\d) WILL (START|RESUME) AT (\d{1,2}:\d{2})$/, (m) => `${what(m[1])} ${m[2] === 'START' ? 'commencera' : 'reprendra'} à ${m[3]}`],
  [/^START OF (S?Q\d|RACE|SESSION|SPRINT) WILL BE DELAYED$/, (m) => `Le départ de ${what(m[1]).replace(/^L[ae] /, (x) => x.toLowerCase())} sera retardé`],
  [/^LAPPED CARS MAY NOW OVERTAKE THE SAFETY CAR: (.+)$/, (m) => `Les voitures attardées peuvent maintenant dépasser la voiture de sécurité : ${m[1]}`],
  [/^LAPPED CARS WILL NOT BE ALLOWED TO OVERTAKE$/, () => 'Les voitures attardées ne pourront pas se dédoubler'],
  [/^BLACK AND WHITE FLAG FOR CAR (.+?)(?: - (.+))?$/, (m) => `Drapeau noir et blanc pour la voiture ${m[1]}${tail(m[2])}`],
  [/^BLACK AND ORANGE FLAG FOR CAR (.+?)(?: - (.+))?$/, (m) => `Drapeau noir et orange pour la voiture ${m[1]}${tail(m[2])}`],
  // Incidents : « FIA STEWARDS: TURN 1 INCIDENT INVOLVING CAR 55 (SAI) UNDER INVESTIGATION - … (20:03:47) »
  [new RegExp(`^(FIA STEWARDS: |UPDATE: )?(?:(TURN \\d+|LAP \\d+|PIT LANE|PIT ENTRY|PIT EXIT|S?Q\\d|SPRINT) )?INCIDENT INVOLVING (CARS?) (.+?) (${Object.keys(STATUS).join('|')})(?: - (.+?))?(?: \\((\\d{1,2}:\\d{2}:\\d{2})\\))?$`),
    (m) => cap(`${prefix(m[1])}${where(m[2])}incident impliquant ${cars(m[3], m[4])} : ${STATUS[m[5]]}${tail(m[6], m[7])}`)],
  // Pénalités : « FIA STEWARDS: [PENALTY SERVED - ]5 SECOND TIME PENALTY FOR CAR 55 (SAI) - … (20:03:47) »
  [/^(FIA STEWARDS: )?(PENALTY SERVED - )?(.+?) FOR (CARS?) (.+?)(?: - (.+?))?(?: \((\d{1,2}:\d{2}:\d{2})\))?$/, (m) => {
    const p = PENALTY.map(([re, f]) => { const x = re.exec(m[3]); return x && f(x); }).find(Boolean);
    return p ? `${prefix(m[1])}${m[2] ? 'pénalité purgée : ' : ''}${p} pour ${cars(m[4], m[5])}${tail(m[6], m[7])}`.replace(/^./, (c) => c.toUpperCase()) : null;
  }],
];

export function rcmFr(message) {
  const msg = String(message || '').trim().replace(/\s+/g, ' ').replace(/–/g, '-');
  if (FIXED[msg]) return FIXED[msg];
  for (const [re, fn] of RULES) {
    const m = re.exec(msg);
    if (m) { const fr = fn(m); if (fr) return fr; }
  }
  return null;
}
