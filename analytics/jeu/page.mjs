// Jeu du jour « Devine le circuit » : page du site en français (/jeu/) et en anglais (/en/guess-the-circuit/), écrite
// par scripts/build-studio.mjs comme les pages des fonctions (analytics/launch/guides.mjs). Les 40 tracés
// (public/data/f1-circuits.json, d'après bacinger/f1-circuits, licence MIT) et leurs indices sont dans la page ; le
// navigateur choisit celui du jour (analytics/jeu/game.js, servi en /jeu/game.js) et garde la série (app.js).
import fs from 'node:fs';
import { shapeOutline, nearestShape } from '../../shared/circuit-shapes.js';
import { CIRCUITS, flagColors } from '../../shared/circuits-info.js';
import { DRIVERS, NAT_ISO } from './drivers.mjs';
import { TEAMS, RACES } from './teams-races.mjs';
import { gpFull } from '../../shared/gp-names.js';

const SITE = 'https://paddocklive.app';
export const PATHS = { fr: 'jeu', en: 'en/guess-the-circuit' };

// Indices de chaque tracé : ville (et son nom anglais s'il diffère), premier Grand Prix de F1, longueur en mètres et
// nombre de virages. Ville, année et longueur d'après bacinger/f1-circuits (Monaco : 1950, premier Grand Prix du
// championnat, et non 1929 ; Madring : 5 414 m, formula1.com) ; la longueur officielle de shared/circuits-info.js
// remplace celle-ci pour les circuits du calendrier. Virages : nombre du dernier tracé couru en F1, vérifié le 6 nov. 2026 (guides des circuits de formula1.com,
// sinon article du circuit ; Kyalami 13 = tracé 1992-1993) ; sources contradictoires (Buenos Aires, Watkins Glen) : null. Virages inconnus
// (null) : le tracé reste dans la liste des réponses possibles mais n'est jamais le circuit du jour.
const FACTS = {
  'au-1953': ['Melbourne', null, 1996, 5278, 14], 'bh-2002': ['Sakhir', null, 2004, 5412, 15], 'cn-2004': ['Shanghai', null, 2004, 5451, 16],
  'es-1991': ['Barcelone', 'Barcelona', 1991, 4655, 14], 'mc-1929': ['Monaco', null, 1950, 3337, 19], 'ca-1978': ['Montréal', 'Montreal', 1978, 4361, 14],
  'fr-1969': ['Le Castellet', null, 1971, 5842, 15], 'at-1969': ['Spielberg', null, 1970, 4318, 10], 'gb-1948': ['Silverstone', null, 1950, 5891, 18],
  'de-1932': ['Hockenheim', null, 1970, 4574, 17], 'hu-1986': ['Budapest', null, 1986, 4381, 14], 'be-1925': ['Spa-Francorchamps', null, 1950, 7004, 19],
  'it-1922': ['Monza', null, 1950, 5793, 11], 'sg-2008': ['Singapour', 'Singapore', 2008, 4928, 19], 'ru-2014': ['Sotchi', 'Sochi', 2014, 5848, 18],
  'jp-1962': ['Suzuka', null, 1987, 5807, 18], 'us-2012': ['Austin', null, 2012, 5514, 20], 'mx-1962': ['Mexico', 'Mexico City', 1963, 4304, 17],
  'br-1940': ['São Paulo', null, 1973, 4309, 15], 'ae-2009': ['Abou Dabi', 'Abu Dhabi', 2009, 5281, 16], 'it-1953': ['Imola', null, 1980, 4909, 19],
  'de-1927': ['Nürburg', null, 1984, 5148, 15], 'pt-2008': ['Portimão', null, 2020, 4653, 15], 'it-1914': ['Scarperia', null, 2020, 5245, 15],
  'my-1999': ['Sepang', null, 1999, 5543, 15], 'tr-2005': ['Istanbul', null, 2005, 5338, 14], 'nl-1948': ['Zandvoort', null, 1952, 4259, 14],
  'fr-1960': ['Magny-Cours', null, 1991, 4412, 17], 'pt-1972': ['Estoril', null, 1984, 4349, 13], 'br-1977': ['Rio de Janeiro', null, 1978, 5031, 11],
  'sa-2021': ['Djeddah', 'Jeddah', 2021, 6175, 27], 'us-2022': ['Miami', null, 2022, 5412, 19], 'qa-2004': ['Lusail', null, 2021, 5380, 16],
  'es-2026': ['Madrid', null, 2026, 5414, 22], 'az-2016': ['Bakou', 'Baku', 2016, 6003, 20], 'us-2023': ['Las Vegas', null, 2023, 6201, 17],
  'us-1909': ['Indianapolis', null, 2000, 4192, 13], 'ar-1952': ['Buenos Aires', null, 1953, 4322, null], 'za-1961': ['Johannesbourg', 'Johannesburg', 1967, 4529, 13],
  'us-1956': ['Watkins Glen', null, 1961, 5430, null],
};

// Tracés et indices dans la langue de la page (pays : nom donné par le navigateur de la machine qui écrit la page)
export function gameData(lang) {
  const shapes = JSON.parse(fs.readFileSync(new URL('../../public/data/f1-circuits.json', import.meta.url), 'utf8')).circuits;
  const km = {};
  for (const c of Object.values(CIRCUITS)) { const s = nearestShape(shapes, c.lat, c.lon); if (s) km[s.id] = c.km; }
  const country = new Intl.DisplayNames([lang], { type: 'region' });
  return shapes.map((s) => {
    if (!FACTS[s.id]) throw new Error(`Devine le circuit : indices manquants pour ${s.id}`);
    const [city, cityEn, first, m, turns] = FACTS[s.id], iso = s.id.split('-')[0];
    return { id: s.id, name: s.name, city: (lang === 'en' && cityEn) || city, country: country.of(iso.toUpperCase()), flag: flagColors(iso), first,
      km: km[s.id] ?? m / 1000, turns, outline: shapeOutline(s.line) };
  });
}

// Pilotes du jour « pilote » (analytics/jeu/drivers.mjs) : pays de la nationalité dans la langue de la page, drapeau
// (pays sans Grand Prix, absents de shared/circuits-info.js : leurs couleurs ici)
const FLAGS = { nz: ['#012169', '#C8102E'], fi: ['#F5F5F5', '#002F6C'], dk: ['#C8102E', '#F5F5F5'], se: ['#006AA7', '#FECC00'], ch: ['#DA291C', '#F5F5F5'], ie: ['#169B62', '#FF883E'] };
export function driverData(lang) {
  const country = new Intl.DisplayNames([lang], { type: 'region' });
  return DRIVERS.map((d) => {
    const iso = NAT_ISO[d.nat];
    if (!iso) throw new Error(`Devine le pilote : nationalité inconnue pour ${d.id} (${d.nat})`);
    return { id: d.id, name: d.name, iso, country: country.of(iso.toUpperCase()), flag: FLAGS[iso] || flagColors(iso), first: d.first, titles: d.titles, wins: d.wins, team: d.team };
  });
}

// Écuries (analytics/jeu/teams-races.mjs) : pays dans la langue de la page, drapeau ; en activité : sur la grille 2026
export function teamData(lang) {
  const country = new Intl.DisplayNames([lang], { type: 'region' });
  return TEAMS.map((c) => {
    const iso = NAT_ISO[c.nat];
    if (!iso) throw new Error(`Devine l'écurie : nationalité inconnue pour ${c.id} (${c.nat})`);
    return { id: c.id, name: c.name, iso, country: country.of(iso.toUpperCase()), flag: FLAGS[iso] || flagColors(iso), first: c.first, last: c.last, active: c.last >= 2026, wins: c.wins, titles: c.titles };
  });
}
// Courses célèbres : seulement celles dont le vainqueur est dans la liste des pilotes ; nom du Grand Prix dans la langue de
// la page (« Grand Prix du Brésil 2008 »)
export function raceData(lang) {
  const ids = new Set(DRIVERS.map((d) => d.id));
  return RACES.filter((r) => ids.has(r.winner)).map((r) => ({ key: `${r.year}-${r.round}`, title: `${gpFull(r.race, lang === 'en')} ${r.year}`, circuit: r.circuit,
    winner: r.winner, grid: r.grid, team: r.team }));
}

const T = {
  fr: {
    locale: 'fr-FR', ogLocale: 'fr_FR', home: '/', title: 'Devine le circuit : le jeu F1 du jour · Paddock Live',
    description: 'Chaque jour, un circuit ou un pilote de F1 à deviner, en facile, moyen ou difficile. Six essais, un indice par erreur et un classement des joueurs.',
    eyebrow: 'Jeu du jour', num: 'n° {}', h1: 'Devine le circuit',
    lead: 'Un tracé de F1 par jour, le même pour tout le monde, dont tu ne vois d\'abord qu\'un morceau. Tu as six essais : chaque erreur en dévoile un peu plus, avec un indice.',
    trackLabel: 'Tracé du circuit du jour, nord en haut', trackShort: 'Tracé du jour', driverShort: 'Pilote du jour', helmetLabel: 'Casque d\'un pilote, dessin sans livrée',
    modeCircuit: 'Circuit', modeDriver: 'Pilote', lv_easy: 'Facile', lv_medium: 'Moyen', lv_hard: 'Difficile', levelLabel: 'Difficulté du jour',
    h1Driver: 'Devine le pilote', leadDriver: 'Un pilote de F1 par jour, le même pour tout le monde : quelques indices au départ, un de plus à chaque erreur. Tu as six essais.',
    placeholderDriver: 'Nom du pilote', unknownDriver: 'Pilote inconnu : choisis-le dans la liste.', manyDriver: 'Plusieurs pilotes correspondent : précise ou choisis dans la liste.',
    nearDriver: 'Même pays', debut: 'Débuts en F1', titles: 'Titres mondiaux', wins: 'Victoires en GP', nat: 'Pays', team: 'Dernière écurie', initials: 'Initiales',
    shareTitleDriver: 'Devine le pilote',
    boardTitle: 'Classement', boardLead: 'Rejoins le classement avec un pseudo : ton résultat du jour y est envoyé, puis ceux des jours suivants.',
    pseudo: 'Ton pseudo', pseudoPh: '2 à 20 caractères', join: 'Rejoindre le classement', rename: 'Changer de pseudo',
    boardNote: 'Seuls ton pseudo et tes résultats sont envoyés au serveur de Paddock Live.',
    players: '{} joueurs', pts: 'pts', days: '{} j', rank: '{}e, {} pts', you: 'Toi',
    tab_today: 'Jour', tab_week: 'Semaine', tab_month: 'Mois', tab_all: 'Général', streakTip: 'Série de {} jours',
    mine: 'Ta partie du jour : {} pts', bonus: 'dont {} de bonus de série',
    joker: 'Joker', jokerTitle: 'Indice suivant sans perdre d\'essai : 2 points de moins', stake: 'Points en jeu : {}',
    jokerHint: 'Joker, {} : {}.',
    modeTeam: 'Écurie', modeRace: 'Course', h1Team: 'Devine l\'écurie', h1Race: 'Qui a gagné ?',
    leadTeam: 'Une écurie de F1 par jour : quelques indices au départ, un de plus à chaque erreur. Tu as six essais.',
    leadRace: 'Une course célèbre par jour : trouve qui l\'a gagnée. Quelques indices au départ, un de plus à chaque erreur.',
    placeholderTeam: 'Nom de l\'écurie', unknownTeam: 'Écurie inconnue : choisis-la dans la liste.', manyTeam: 'Plusieurs écuries correspondent : précise ou choisis dans la liste.',
    teamShort: 'Écurie du jour', raceShort: 'Course du jour', carLabel: 'Monoplace, dessin sans livrée', flagLabel: 'Drapeau à damier',
    tFirst: 'Première saison', tTitles: 'Titres constructeurs', tLast: 'Dernière saison', active: 'En activité',
    grid: 'Départ du vainqueur', gridPos: '{}e sur la grille', pitStart: 'Des stands', rTeam: 'Écurie du vainqueur',
    shareTitleTeam: 'Devine l\'écurie', shareTitleRace: 'Qui a gagné ?', special: 'Spécial week-end de Grand Prix',
    everyone: 'Tous les joueurs', groupNew: '+ Groupe d\'amis', groupMembers: '{} membres', groupInvite: 'Inviter (lien)', groupLeave: 'Quitter le groupe',
    groupNeedName: 'Choisis d\'abord un pseudo pour créer un groupe.', groupShareText: 'Rejoins mon classement du jeu du jour de Paddock Live',
    linkCopied: 'Lien copié : envoie-le à tes amis.', groupName: 'Nom du groupe', groupNamePh: 'Les potes du paddock', groupCreate: 'Créer le groupe',
    invited: 'Invitation au classement « {} » : fais la partie du jour, puis rejoins le classement pour y entrer.',
    imgBtn: 'Image à partager', imgSaved: 'Image enregistrée.', lost: 'Perdu', toPlay: 'À jouer',
    archTitle: 'Jours précédents', archLead: 'Rejoue les jours que tu as manqués : sans points, sans série et hors classement.', archEmpty: 'Pas encore de jour précédent.',
    archTag: 'Archives', archBack: 'Revenir au jeu du jour', archNote: 'Partie des archives : pas de points, ni de série, ni de classement.', boardEmpty: 'Personne encore : sois le premier.',
    boardOff: 'Classement injoignable pour l\'instant.', sending: 'Envoi…', sent: 'Classement : tu joues sous le pseudo {}.', north: 'N', next: 'Prochain jeu dans {}', fresh: 'Nouveau jeu disponible', reload: 'Recharger',
    guessLabel: 'Ton essai', placeholder: 'Nom du circuit ou ville', submit: 'Valider', tries: 'Essais', hintsTitle: 'Indices',
    hit: 'Trouvé', near: 'Même pays', miss: 'Raté', locked1: 'Après 1 erreur ou joker', locked: 'Après {} erreurs ou jokers',
    country: 'Pays', length: 'Longueur', turns: 'Virages', first: 'Premier GP de F1', city: 'Ville',
    unknown: 'Circuit inconnu : choisis-le dans la liste.', many: 'Plusieurs circuits correspondent : précise ou choisis dans la liste.', again: 'Déjà essayé.',
    missed: 'Raté : {}.', newHint: 'Nouvel indice, {} : {}.', winOne: 'Trouvé du premier coup', win: 'Trouvé en {} essais', lose: 'Perdu, c\'était',
    share: 'Partager le résultat', copied: 'Résultat copié.', copyFail: 'Copie impossible : sélectionne le texte ci-dessus.',
    played: 'Joués', wonPct: 'Trouvés', streak: 'Série', best: 'Meilleure série',
    shareTitle: 'Devine le circuit', shareStreak: '🔥 Série : {} jours', url: 'paddocklive.app/jeu/',
    noscript: 'Le jeu a besoin de JavaScript pour fonctionner.',
    howTitle: 'Comment jouer',
    how: ['Un nouveau jeu chaque jour à minuit, heure de Paris, le même pour tout le monde, en facile, moyen ou difficile : un circuit, un pilote, une écurie ou le vainqueur d\'une course célèbre à deviner. Pendant un week-end de Grand Prix : le vainqueur d\'une édition passée de ce Grand Prix.',
      'Circuit : au départ, seule une partie du tracé est visible (plus ou moins selon la difficulté). Chaque erreur dévoile un peu plus le tracé, et un indice : le pays, la longueur, le nombre de virages, l\'année du premier Grand Prix de F1, puis la ville. Les 40 circuits de la liste ont tous accueilli la F1, ou vont l\'accueillir.',
      'Pilote : 1 à 3 indices au départ selon la difficulté (débuts en F1, titres, victoires, pays, dernière écurie, initiales), un de plus à chaque erreur. Les 44 pilotes de la liste : la grille 2026 et de grands champions ; chiffres arrêtés au 7 novembre 2026.',
      'Carré jaune : bon pays (circuit) ou même nationalité (pilote). Six essais au plus. Le joker donne l\'indice suivant sans perdre d\'essai.',
      'Points : 10 au départ, 1 de moins par erreur, 2 de moins par joker (au moins 1 si tu trouves, 0 si tu perds), fois 1, 2 ou 3 selon la difficulté. Bonus de série au classement : +1 par jour trouvé d\'affilée, jusqu\'à +5.',
      'Ta série reste dans ce navigateur. Rien n\'est envoyé, sauf si tu rejoins le classement : ton pseudo et tes résultats.'],
    cta: 'Chaque Grand Prix en direct, calé sur ta TV et sans spoiler', dl: 'Télécharger', ctaBtn: 'Télécharger Paddock Live', os: 'Gratuit · Windows, macOS et Linux',
    credit: 'Tracés : <a href="https://github.com/bacinger/f1-circuits">bacinger/f1-circuits</a>, © 2019-2025 Tomislav Bacinger, licence <a href="https://github.com/bacinger/f1-circuits/blob/master/LICENSE">MIT</a>. Aucune image de la Formula 1.',
    terms: 'Conditions d\'utilisation', privacy: 'Confidentialité', mentions: 'Mentions légales', other: 'English',
    legal: 'Paddock Live est un projet indépendant, sans lien avec la Formula 1, la FIA ni les écuries. F1, FORMULA 1 et les marques associées appartiennent à Formula One Licensing B.V.',
  },
  en: {
    locale: 'en-US', ogLocale: 'en_US', home: '/en/', title: 'Guess the Circuit: the daily F1 game · Paddock Live',
    description: 'Every day, an F1 circuit or driver to guess, on easy, medium or hard. Six guesses, one clue per miss, and a leaderboard. Free.',
    eyebrow: 'Daily game', num: '#{}', h1: 'Guess the circuit',
    lead: 'One F1 track a day, the same for everyone, and at first you only see a piece of it. You get six guesses: every miss reveals a bit more, with a clue.',
    trackLabel: 'Today\'s circuit layout, north up', trackShort: 'Today\'s track', driverShort: 'Today\'s driver', helmetLabel: 'A driver\'s helmet, plain drawing',
    modeCircuit: 'Circuit', modeDriver: 'Driver', lv_easy: 'Easy', lv_medium: 'Medium', lv_hard: 'Hard', levelLabel: 'Today\'s difficulty',
    h1Driver: 'Guess the driver', leadDriver: 'One F1 driver a day, the same for everyone: a few clues to start with, one more with every miss. You get six guesses.',
    placeholderDriver: 'Driver name', unknownDriver: 'Unknown driver: pick one from the list.', manyDriver: 'Several drivers match: be more specific or pick from the list.',
    nearDriver: 'Same country', debut: 'F1 debut', titles: 'World titles', wins: 'GP wins', nat: 'Country', team: 'Last team', initials: 'Initials',
    shareTitleDriver: 'Guess the driver',
    boardTitle: 'Leaderboard', boardLead: 'Join the leaderboard with a nickname: today\'s result is sent, then the following days\' results.',
    pseudo: 'Your nickname', pseudoPh: '2 to 20 characters', join: 'Join the leaderboard', rename: 'Change nickname',
    boardNote: 'Only your nickname and results are sent to the Paddock Live server.',
    players: '{} players', pts: 'pts', days: '{} d', rank: '#{}, {} pts', you: 'You',
    tab_today: 'Day', tab_week: 'Week', tab_month: 'Month', tab_all: 'Overall', streakTip: '{}-day streak',
    mine: 'Today\'s game: {} pts', bonus: 'including {} streak bonus',
    joker: 'Joker', jokerTitle: 'Next clue without losing a guess: 2 points less', stake: 'Points at stake: {}',
    jokerHint: 'Joker, {}: {}.',
    modeTeam: 'Team', modeRace: 'Race', h1Team: 'Guess the team', h1Race: 'Who won?',
    leadTeam: 'One F1 team a day: a few clues to start with, one more with every miss. You get six guesses.',
    leadRace: 'One famous race a day: find out who won it. A few clues to start with, one more with every miss.',
    placeholderTeam: 'Team name', unknownTeam: 'Unknown team: pick one from the list.', manyTeam: 'Several teams match: be more specific or pick from the list.',
    teamShort: 'Today\'s team', raceShort: 'Today\'s race', carLabel: 'A racing car, plain drawing', flagLabel: 'Chequered flag',
    tFirst: 'First season', tTitles: 'Constructors\' titles', tLast: 'Last season', active: 'Still racing',
    grid: 'Winner\'s start', gridPos: 'P{} on the grid', pitStart: 'Pit lane', rTeam: 'Winner\'s team',
    shareTitleTeam: 'Guess the team', shareTitleRace: 'Who won?', special: 'Grand Prix weekend special',
    everyone: 'All players', groupNew: '+ Friends group', groupMembers: '{} members', groupInvite: 'Invite (link)', groupLeave: 'Leave group',
    groupNeedName: 'Pick a nickname first to create a group.', groupShareText: 'Join my leaderboard for the Paddock Live daily game',
    linkCopied: 'Link copied: send it to your friends.', groupName: 'Group name', groupNamePh: 'Paddock pals', groupCreate: 'Create group',
    invited: 'Invitation to the « {} » leaderboard: play today\'s game, then join the leaderboard to get in.',
    imgBtn: 'Image to share', imgSaved: 'Image saved.', lost: 'Lost', toPlay: 'To play',
    archTitle: 'Previous days', archLead: 'Replay the days you missed: no points, no streak and off the leaderboard.', archEmpty: 'No previous day yet.',
    archTag: 'Archive', archBack: 'Back to today\'s game', archNote: 'Archive game: no points, no streak and no leaderboard.', boardEmpty: 'Nobody yet: be the first.',
    boardOff: 'Leaderboard unavailable for now.', sending: 'Sending…', sent: 'Leaderboard: you play as {}.', north: 'N', next: 'Next game in {}', fresh: 'New game available', reload: 'Reload',
    guessLabel: 'Your guess', placeholder: 'Circuit name or city', submit: 'Guess', tries: 'Guesses', hintsTitle: 'Clues',
    hit: 'Correct', near: 'Same country', miss: 'Wrong', locked1: 'After 1 miss or joker', locked: 'After {} misses or jokers',
    country: 'Country', length: 'Length', turns: 'Turns', first: 'First F1 GP', city: 'City',
    unknown: 'Unknown circuit: pick it from the list.', many: 'Several circuits match: be more specific or pick from the list.', again: 'Already guessed.',
    missed: 'Wrong: {}.', newHint: 'New clue, {}: {}.', winOne: 'Got it first time', win: 'Got it in {} guesses', lose: 'Out of guesses, it was',
    share: 'Share your result', copied: 'Result copied.', copyFail: 'Could not copy: select the text above.',
    played: 'Played', wonPct: 'Solved', streak: 'Streak', best: 'Best streak',
    shareTitle: 'Guess the circuit', shareStreak: '🔥 Streak: {} days', url: 'paddocklive.app/en/guess-the-circuit/',
    noscript: 'The game needs JavaScript to work.',
    howTitle: 'How to play',
    how: ['A new game every day at midnight, Paris time, the same for everyone, on easy, medium or hard: a circuit, a driver, a team or the winner of a famous race to guess. On a Grand Prix weekend: the winner of a past edition of that Grand Prix.',
      'Circuit: at first only part of the layout is shown (more or less depending on difficulty). Every miss reveals more of the track, and a clue: the country, the length, the number of turns, the year of the first F1 Grand Prix, then the city. All 40 circuits in the list have hosted F1, or are about to.',
      'Driver: 1 to 3 clues to start with depending on difficulty (F1 debut, titles, wins, country, last team, initials), one more with every miss. The 44 drivers in the list: the 2026 grid and great champions; figures as of 7 November 2026.',
      'Yellow square: right country (circuit) or same nationality (driver). Six guesses at most. The joker gives the next clue without losing a guess.',
      'Points: 10 to start, 1 less per miss, 2 less per joker (at least 1 if you get it, 0 if you lose), times 1, 2 or 3 depending on difficulty. Streak bonus on the leaderboard: +1 per day solved in a row, up to +5.',
      'Your streak stays in this browser. Nothing is sent unless you join the leaderboard: your nickname and results.'],
    cta: 'Every Grand Prix live, synced to your TV and spoiler-free', dl: 'Download', ctaBtn: 'Download Paddock Live', os: 'Free · Windows, macOS and Linux',
    credit: 'Track layouts: <a href="https://github.com/bacinger/f1-circuits">bacinger/f1-circuits</a>, © 2019-2025 Tomislav Bacinger, <a href="https://github.com/bacinger/f1-circuits/blob/master/LICENSE">MIT</a> licence. No Formula 1 imagery.',
    terms: 'Terms of Service', privacy: 'Privacy', mentions: 'Legal notice', other: 'Français',
    legal: 'Paddock Live is an independent project, not affiliated with Formula 1, the FIA or the teams. F1, FORMULA 1 and related marks are trademarks of Formula One Licensing B.V.',
  },
};
// Textes repris par le script de la page
const CLIENT = ['locale', 'num', 'next', 'fresh', 'reload', 'hit', 'near', 'miss', 'locked1', 'locked', 'country', 'length', 'turns', 'first', 'city', 'unknown', 'many', 'again',
  'missed', 'newHint', 'winOne', 'win', 'lose', 'copied', 'copyFail', 'played', 'wonPct', 'streak', 'best', 'shareTitle', 'shareStreak', 'url',
  'driverShort', 'modeCircuit', 'modeDriver', 'lv_easy', 'lv_medium', 'lv_hard', 'h1Driver', 'leadDriver', 'placeholderDriver', 'unknownDriver', 'manyDriver',
  'nearDriver', 'debut', 'titles', 'wins', 'nat', 'team', 'initials', 'shareTitleDriver', 'players', 'pts', 'days', 'rank', 'you', 'boardEmpty',
  'boardOff', 'sending', 'sent', 'tab_today', 'tab_week', 'tab_month', 'tab_all', 'streakTip', 'mine', 'bonus', 'stake', 'jokerHint', 'h1', 'imgSaved', 'lost', 'toPlay', 'archEmpty',
  'modeTeam', 'modeRace', 'h1Team', 'h1Race', 'leadTeam', 'leadRace', 'placeholderTeam', 'unknownTeam', 'manyTeam', 'teamShort', 'raceShort',
  'tFirst', 'tTitles', 'tLast', 'active', 'grid', 'gridPos', 'pitStart', 'rTeam', 'shareTitleTeam', 'shareTitleRace', 'special',
  'everyone', 'groupNew', 'groupMembers', 'groupInvite', 'groupLeave', 'groupNeedName', 'groupShareText', 'linkCopied', 'invited'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Design « Télémétrie » du site (analytics/launch/guides.mjs), en sombre et en clair ; couleurs de la course pour les
// essais (vert trouvé, jaune même pays, rouge raté) et violet pour le tracé trouvé (meilleur temps absolu)
const STYLE = `@font-face { font-family: 'Archivo'; font-style: normal; font-weight: 100 900; font-stretch: 62% 125%; font-display: swap; src: url('/fonts/archivo-var.woff2') format('woff2'); }
@font-face { font-family: 'Archivo Cond'; font-style: normal; font-weight: 100 900; font-display: swap; src: url('/fonts/archivo-cond-var.woff2') format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 400 700; font-display: swap; src: url('/fonts/jetbrainsmono-var.woff2') format('woff2'); }
:root { color-scheme: dark; --bg: #0B0F15; --panel: #10151D; --panel-2: #161D27; --panel-3: #1B2430; --border: #222B37; --line-2: #2E3946;
  --text: #F2F4F5; --text-2: #B4BDC8; --muted: #8A95A3; --accent: #E10600; --accent-2: #C80500; --ring: #F2F4F5;
  --best: #B98CFF; --pb: #3DDC84; --yellow: #FFD43B; --red: #FF5A5F; --ease: cubic-bezier(.16, 1, .3, 1);
  --font: 'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif; --title: 'Archivo Cond', 'Archivo', 'Arial Narrow', sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace; }
@media (prefers-color-scheme: light) {
  :root { color-scheme: light; --bg: #F3F5F7; --panel: #FFFFFF; --panel-2: #F7F8FA; --panel-3: #ECEFF3; --border: #E1E5EA; --line-2: #C9D0D8;
    --text: #10151D; --text-2: #3D4754; --muted: #56606D; --ring: #10151D; --best: #6D28D9; --pb: #0A7A45; --yellow: #8A5A00; --red: #C42828; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 400 16px/1.6 var(--font); font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
a { color: inherit; }
:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.wrap { max-width: 1000px; margin: 0 auto; padding: 0 max(16px, env(safe-area-inset-left)); }
.nav { position: sticky; top: 0; z-index: 20; background: var(--bg); border-bottom: 1px solid var(--border); }
.nav .wrap { display: flex; align-items: center; gap: 16px; height: 56px; }
.brand { display: flex; align-items: center; gap: 10px; text-decoration: none; font: 800 20px/1 var(--title); text-transform: uppercase; letter-spacing: .01em; }
.brand img { width: 30px; height: 30px; border-radius: 6px; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 22px; border: 1px solid var(--accent); border-radius: 6px; background: var(--accent); color: #fff;
  text-decoration: none; font: 600 15px/1 var(--font); white-space: nowrap; cursor: pointer; transition: background-color .14s, border-color .14s, transform .08s; }
.btn:hover { background: var(--accent-2); border-color: var(--accent-2); }
.btn:active { transform: scale(.97); }
.btn:disabled { opacity: .45; cursor: default; transform: none; }
.btn.ghost { background: var(--panel-3); border-color: var(--line-2); color: var(--text); }
.btn.ghost:hover { background: var(--panel-2); }
.nav .btn { margin-left: auto; min-height: 36px; padding: 0 14px; font-size: 14px; }
.eyebrow, .label { color: var(--muted); font: 500 11px/1.3 var(--mono); letter-spacing: .12em; text-transform: uppercase; }
.eyebrow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin: 48px 0 14px; }
.eyebrow b { color: var(--text-2); font-weight: 500; }
h1, h2 { font-family: var(--title); font-weight: 800; text-transform: uppercase; letter-spacing: .005em; margin: 0; }
h1 { font-size: clamp(40px, 7vw, 72px); line-height: .92; }
h2 { font-size: clamp(26px, 3.6vw, 36px); line-height: .95; margin: 64px 0 16px; }
.lead { color: var(--text-2); font-size: 18px; line-height: 1.55; max-width: 60ch; margin: 18px 0 0; }
/* Plateau : le tracé à gauche, essais et indices à droite (l'un sous l'autre au téléphone) */
.board { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 24px; margin: 36px 0 0; align-items: start; }
.track { margin: 0; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); overflow: hidden; }
.bar { display: flex; justify-content: space-between; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--panel-2); }
.bar .label:last-child { text-align: right; }
.stage { position: relative; aspect-ratio: 1; background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px);
  background-size: 12.5% 12.5%; background-position: -1px -1px; }
.stage svg { display: block; width: 100%; height: 100%; }
.stage .north { position: absolute; top: 10px; left: 12px; color: var(--muted); font: 500 11px/1 var(--mono); letter-spacing: .12em; }
.stage .north::before { content: '↑ '; }
.trk-under { fill: none; stroke: var(--bg); stroke-width: 5; stroke-linejoin: round; stroke-linecap: round; }
.trk { fill: none; stroke: var(--text); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.map.anim .trk { transition: stroke .4s, stroke-dasharray .6s var(--ease), stroke-dashoffset .6s var(--ease); }
.track.won .trk { stroke: var(--best); }
/* Jours « pilote », « écurie », « course » : dessin à la place du tracé ; difficulté du jour en pastille */
.stage .helmet, .stage .car, .stage .flagfig { display: none; padding: 16%; }
body:not([data-mode="circuit"]) .stage .map, body:not([data-mode="circuit"]) .stage .north { display: none; }
body[data-mode="driver"] .stage .helmet, body[data-mode="team"] .stage .car { display: block; }
body[data-mode="race"] .stage .flagfig { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 10%; gap: 10px; }
.flagfig svg { width: 60%; height: auto; }
.chk { fill: var(--text); }
.premise { margin: 0; text-align: center; font: 800 clamp(22px, 4vw, 30px)/1.05 var(--title); text-transform: uppercase; }
.premise small { display: block; margin-top: 6px; color: var(--muted); font: 500 12px/1.3 var(--mono); letter-spacing: .1em; }
.special { color: var(--accent); border-color: currentColor; }
.level { padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line-2); color: var(--text-2); white-space: nowrap; }
.level:empty { display: none; }
.level[data-level="easy"] { color: var(--pb); border-color: currentColor; }
.level[data-level="medium"] { color: var(--yellow); border-color: currentColor; }
.level[data-level="hard"] { color: var(--red); border-color: currentColor; }
/* Groupes d'amis */
.invite { margin: 16px 0 0; padding: 12px 14px; border: 1px solid var(--best); border-radius: 8px; color: var(--text); background: var(--panel); }
.scopes { display: flex; flex-wrap: wrap; gap: 6px; margin: 16px 0 0; }
.chip { min-height: 36px; padding: 0 12px; border: 1px solid var(--line-2); border-radius: 999px; background: none; color: var(--text-2); font: 600 13px/1 var(--font); cursor: pointer; }
.chip[aria-pressed="true"] { border-color: var(--text); color: var(--text); background: var(--panel-3); }
.chip.add { border-style: dashed; }
.ginfo { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin-top: 10px; }
#groupForm { margin-top: 12px; }
/* Archives */
.arch-tag { color: var(--best); border-color: currentColor; }
#archBack { margin: 10px 0 0; }
.small-lead { font-size: 16px; margin-top: 0; }
ol.arch li { padding: 0; }
ol.arch a { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 46px; text-decoration: none; }
ol.arch a:hover .nm { text-decoration: underline; }
ol.arch a[aria-current] .nm { color: var(--best); }
/* Joker et points en jeu */
.help { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
.btn.small { min-height: 36px; padding: 0 12px; font-size: 14px; gap: 6px; }
.btn.small small { color: var(--red); font: 500 12px/1 var(--mono); }
/* Classement : onglets jour, semaine, mois, général */
.tabs { display: flex; gap: 4px; margin: 16px 0 10px; padding: 3px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel-2); width: max-content; max-width: 100%; }
.tabs button { min-height: 36px; padding: 0 14px; border: 0; border-radius: 6px; background: none; color: var(--text-2); font: 600 14px/1 var(--font); cursor: pointer; }
.tabs button[aria-selected="true"] { background: var(--panel-3); color: var(--text); box-shadow: inset 0 -2px 0 var(--accent); }
.fire { color: var(--yellow); font: 500 12px/1 var(--mono); }
.bonus { color: var(--pb); font-weight: 500; }
/* Classement */
.board-sec .row { margin-top: 10px; }
.board-sec form .msg { margin-top: 0; }
.board-sec .small { font-size: 12.5px; color: var(--muted); }
.linkish { background: none; border: 0; padding: 0; color: var(--text-2); font: inherit; font-size: 14px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
#boardJoin:not([hidden]) ~ .row .linkish { display: none; }
.me { margin: 14px 0 0; font: 600 15px/1.4 var(--font); }
ol.rank { list-style: none; margin: 8px 0 0; padding: 0; border-top: 1px solid var(--border); }
.rank li { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 10px; min-height: 40px; border-bottom: 1px solid var(--border); }
.rank .n { color: var(--muted); font: 500 12px/1 var(--mono); }
.rank li:nth-child(-n+3) .n { color: var(--text); }
.rank .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.rank .pts { font: 600 14px/1 var(--mono); white-space: nowrap; }
.rank .pts small { color: var(--muted); font-size: 11px; }
.rank .pts em { margin-left: 8px; color: var(--muted); font: 400 11px/1 var(--mono); font-style: normal; }
.answer { padding: 14px; border-top: 1px solid var(--border); }
.answer b { display: block; font: 800 24px/1.05 var(--title); text-transform: uppercase; }
.answer span { color: var(--text-2); font-size: 14px; }
/* Saisie */
form { margin: 0; }
.field { display: flex; gap: 8px; margin-top: 8px; }
.field input { flex: 1; min-width: 0; min-height: 48px; padding: 0 14px; border: 1px solid var(--line-2); border-radius: 6px; background: var(--panel-2); color: var(--text); font: 400 16px var(--font); }
.field input::placeholder { color: var(--muted); }
.field input:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
.msg { min-height: 1.6em; margin: 8px 0 0; color: var(--text-2); font-size: 14px; }
/* Essais : lignes numérotées comme une tour des temps */
ol.tries { list-style: none; margin: 18px 0 0; padding: 0; border-top: 1px solid var(--border); }
.tries li { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 46px; padding: 6px 0; border-bottom: 1px solid var(--border); }
.tries .n { color: var(--muted); font: 500 12px/1 var(--mono); }
.tries .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.tries li:not(.on) .nm { color: var(--muted); font-weight: 400; }
.tag { display: inline-flex; align-items: center; gap: 7px; color: var(--text-2); font: 500 11px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
.tag::before { content: ''; width: 10px; height: 10px; border-radius: 2px; background: currentColor; }
.tag.hit { color: var(--pb); } .tag.near { color: var(--yellow); } .tag.miss { color: var(--red); }
/* Indices */
.hints-h { margin: 28px 0 0; }
dl.hints { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin: 10px 0 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--border); }
.hints div { min-width: 0; padding: 12px 14px; background: var(--panel); }
.hints div:last-child { grid-column: 1 / -1; }
.hints dt { color: var(--muted); font: 500 11px/1.3 var(--mono); letter-spacing: .1em; text-transform: uppercase; }
.hints dd { margin: 6px 0 0; font: 800 22px/1.1 var(--title); text-transform: uppercase; overflow-wrap: anywhere; display: flex; align-items: center; gap: 8px; }
.hints div.lock dd { color: var(--muted); font: 400 14px/1.6 var(--font); text-transform: none; }
.hints div.lock { background: var(--panel-2); }
.flag { flex: none; display: inline-flex; width: 18px; height: 12px; border-radius: 2px; overflow: hidden; box-shadow: 0 0 0 1px var(--line-2); }
.flag i { flex: 1; }
.hints .new dd, .tries .new { animation: rise .22s var(--ease) both; }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } }
/* Résultat */
.end { margin: 28px 0 0; padding: 20px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); }
.end h2 { margin: 0; font-size: clamp(26px, 4vw, 34px); }
.end h2:focus { outline: none; }
.end pre { margin: 16px 0 0; padding: 12px 14px; border-radius: 6px; background: var(--panel-2); border: 1px solid var(--border); color: var(--text-2); font: 400 14px/1.5 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; }
.end .row { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; margin-top: 14px; }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 20px 0 0; padding: 16px 0 0; border-top: 1px solid var(--border); }
.stats b { display: block; font: 800 34px/1 var(--title); }
.stats span { display: block; margin-top: 6px; color: var(--muted); font: 500 10px/1.3 var(--mono); letter-spacing: .1em; text-transform: uppercase; }
ul.how { counter-reset: pt; list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border); color: var(--text-2); max-width: 72ch; }
ul.how li { counter-increment: pt; position: relative; padding: 12px 0 12px 44px; border-bottom: 1px solid var(--border); }
ul.how li::before { content: counter(pt, decimal-leading-zero); position: absolute; left: 0; top: 15px; color: var(--muted); font: 500 12px/1.3 var(--mono); letter-spacing: .08em; }
.cta { margin: 48px 0 0; padding: 22px 0 0; border-top: 1px solid var(--border); display: flex; gap: 12px 16px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
.cta p { margin: 0; font: 800 22px/1.1 var(--title); text-transform: uppercase; max-width: 30ch; }
.cta small { display: block; margin-top: 6px; color: var(--muted); font: 500 12px/1.3 var(--mono); letter-spacing: .06em; }
.noscript { padding: 14px; color: var(--text-2); }
footer { margin-top: 72px; padding: 28px 0 40px; border-top: 1px solid var(--border); color: var(--muted); font-size: 14px; }
footer a { color: var(--text-2); text-underline-offset: 3px; }
@media (max-width: 760px) {
  .board { grid-template-columns: minmax(0, 1fr); }
  .track { max-width: 460px; width: 100%; justify-self: center; }
}
@media (max-width: 520px) {
  .eyebrow { margin-top: 32px; }
  .bar .label:first-child { display: none; }
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cta .btn, .end .row .btn { width: 100%; }
}
@media (pointer: coarse) { .nav .btn { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) {
  .btn, .trk { transition: none; } .btn:active { transform: none; }
  .hints .new dd, .tries .new { animation: none; }
}
`;

export function gamePage(lang) {
  const t = T[lang], other = lang === 'fr' ? 'en' : 'fr';
  const url = `${SITE}/${PATHS[lang]}/`;
  const circuits = gameData(lang), drivers = driverData(lang), teams = teamData(lang), races = raceData(lang);
  const names = [...circuits].sort((a, b) => a.name.localeCompare(b.name, lang));
  const driverNames = [...drivers].sort((a, b) => a.name.split(' ').at(-1).localeCompare(b.name.split(' ').at(-1), lang));
  const data = { t: Object.fromEntries(CLIENT.map((k) => [k, t[k]])), circuits, drivers, teams, races };
  const ld = { '@context': 'https://schema.org', '@type': 'WebApplication', name: t.h1, url, description: t.description, applicationCategory: 'GameApplication', operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, isPartOf: { '@type': 'WebSite', name: 'Paddock Live', url: `${SITE}/` } };
  const json = (x) => JSON.stringify(x).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.description)}">
<meta name="theme-color" content="#0B0F15" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F3F5F7" media="(prefers-color-scheme: light)">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="fr" href="${SITE}/${PATHS.fr}/">
<link rel="alternate" hreflang="en" href="${SITE}/${PATHS.en}/">
<link rel="alternate" hreflang="x-default" href="${SITE}/${PATHS.en}/">
<meta property="og:locale" content="${t.ogLocale}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(t.title)}">
<meta property="og:description" content="${esc(t.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/site/img/apercu.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(t.title)}">
<meta name="twitter:description" content="${esc(t.description)}">
<link rel="icon" href="/site/img/logo.png">
<link rel="apple-touch-icon" href="/site/img/apple-touch-icon.png">
<link rel="modulepreload" href="/jeu/game.js">
<script type="application/ld+json">${json(ld)}</script>
<style>
${STYLE}</style>
</head>
<body>
<header class="nav"><div class="wrap">
  <a class="brand" href="${t.home}"><img src="/site/img/logo.png" alt="" width="32" height="32">Paddock <b>Live</b></a>
  <a class="btn" href="${t.home}#telecharger">${t.dl}</a>
</div></header>
<main class="wrap">
  <p class="eyebrow">${esc(t.eyebrow)} <b id="num"></b> <span class="level" id="level" title="${esc(t.levelLabel)}"></span> <span class="level arch-tag" id="archTag" hidden>${esc(t.archTag)}</span> <span class="level special" id="specialTag" hidden>${esc(t.special)}</span></p>
  <p id="archBack" hidden><a class="linkish" href="./">${esc(t.archBack)}</a></p>
  <h1 id="h1">${esc(t.h1)}</h1>
  <p class="lead" id="lead">${esc(t.lead)}</p>
  <p class="invite" id="inviteNote" role="status" hidden></p>
  <div class="board">
    <figure class="track" id="track">
      <div class="bar"><span class="label" id="trackShort">${esc(t.trackShort)}</span><span class="label" id="clock" aria-live="off"></span></div>
      <div class="stage"><span class="north" aria-hidden="true">${t.north}</span>
        <svg class="map" viewBox="-4 -4 108 108" role="img" aria-label="${esc(t.trackLabel)}"><polygon class="trk-under" id="trkU" points="" pathLength="1"/><polygon class="trk" id="trk" points="" pathLength="1"/></svg>
        <svg class="helmet" viewBox="0 0 100 100" role="img" aria-label="${esc(t.helmetLabel)}"><path class="trk" d="M18 64C18 36 36 20 58 20c17 0 28 13 28 30v10c0 7-4 11-10 11H29c-6 0-11-3-11-7z"/><path class="trk" d="M52 38h34v13H48c0-6 1-10 4-13z"/><path class="trk" d="M30 71v8h40l6-8"/></svg>
        <svg class="car" viewBox="0 0 100 100" role="img" aria-label="${esc(t.carLabel)}"><path class="trk" d="M8 64h12l10-5h20l5-7h9l4 7h18v6H8z"/><path class="trk" d="M3 69h18M84 42h12v6H84zM90 48v11"/><circle class="trk" cx="60" cy="49" r="3"/><circle class="trk" cx="26" cy="67" r="8"/><circle class="trk" cx="78" cy="67" r="8"/></svg>
        <div class="flagfig"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(t.flagLabel)}"><path class="trk" d="M20 86V14"/><path class="trk" d="M20 16c14-6 26 6 40 0s20-4 24-2v34c-4-2-10-4-24 2s-26-6-40 0"/><path class="chk" d="M20 16h16v11H20zM52 16h16v11H52zM36 27h16v11H36zM68 27h16v11H68zM20 38h16v11H20zM52 38h16v11H52z"/></svg><p class="premise" id="premise"></p></div>
      </div>
      <figcaption class="answer" id="answer" hidden></figcaption>
      <noscript><p class="noscript">${esc(t.noscript)}</p></noscript>
    </figure>
    <div>
      <form id="form" autocomplete="off">
        <label class="label" for="guess">${esc(t.guessLabel)}</label>
        <div class="field"><input id="guess" name="guess" list="names" placeholder="${esc(t.placeholder)}" autocapitalize="words" spellcheck="false" enterkeyhint="go" required><button class="btn" type="submit">${esc(t.submit)}</button></div>
        <div class="help"><button class="btn ghost small" type="button" id="joker" title="${esc(t.jokerTitle)}">${esc(t.joker)} <small>−2</small></button><span class="label" id="stake"></span></div>
        <p class="msg" id="msg" role="status"></p>
      </form>
      <datalist id="names">${names.map((c) => `<option value="${esc(c.name)}">${esc(c.city)}</option>`).join('')}</datalist>
      <datalist id="teams">${[...teams].sort((a, b) => a.name.localeCompare(b.name, lang)).map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>
      <datalist id="drivers">${driverNames.map((d) => `<option value="${esc(d.name)}"></option>`).join('')}</datalist>
      <ol class="tries" id="tries" aria-label="${esc(t.tries)}"></ol>
      <p class="label hints-h" id="hintsH">${esc(t.hintsTitle)}</p>
      <dl class="hints" id="hints" aria-labelledby="hintsH"></dl>
    </div>
  </div>
  <section class="end" id="end" hidden aria-labelledby="endH">
    <h2 id="endH" tabindex="-1"></h2>
    <pre id="shareText"></pre>
    <div class="row" id="shareRow"><button class="btn" type="button" id="share">${esc(t.share)}</button><button class="btn ghost" type="button" id="shareImg">${esc(t.imgBtn)}</button><span class="msg" id="shareMsg" role="status"></span></div>
    <p class="msg" id="archNote" hidden>${esc(t.archNote)}</p>
    <div class="stats" id="stats"></div>
  </section>
  <section class="end board-sec" id="board" hidden aria-labelledby="boardH">
    <h2 id="boardH">${esc(t.boardTitle)}</h2>
    <form id="boardJoin" autocomplete="off" hidden>
      <p class="msg">${esc(t.boardLead)}</p>
      <label class="label" for="pseudo">${esc(t.pseudo)}</label>
      <div class="field"><input id="pseudo" name="pseudo" maxlength="20" minlength="2" placeholder="${esc(t.pseudoPh)}" spellcheck="false" enterkeyhint="send" required><button class="btn" type="submit">${esc(t.join)}</button></div>
      <p class="msg small">${esc(t.boardNote)}</p>
    </form>
    <div class="row"><span class="msg" id="boardMsg" role="status"></span><button class="linkish" type="button" id="boardRename">${esc(t.rename)}</button></div>
    <form id="groupForm" autocomplete="off" hidden>
      <label class="label" for="groupName">${esc(t.groupName)}</label>
      <div class="field"><input id="groupName" maxlength="20" minlength="2" placeholder="${esc(t.groupNamePh)}" required><button class="btn" type="submit">${esc(t.groupCreate)}</button></div>
    </form>
    <div id="boardBody"></div>
  </section>
  <h2>${esc(t.archTitle)}</h2>
  <p class="lead small-lead">${esc(t.archLead)}</p>
  <div id="archList"></div>
  <h2>${esc(t.howTitle)}</h2>
  <ul class="how">${t.how.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
  <div class="cta"><p>${esc(t.cta)}<small>${esc(t.os)}</small></p><a class="btn" href="${t.home}#telecharger">${esc(t.ctaBtn)}</a></div>
</main>
<footer><div class="wrap">
  <p>${t.credit}</p>
  <p><a href="${t.home}">Paddock Live</a> · <a href="/legal/terms">${esc(t.terms)}</a> · <a href="/legal/privacy">${esc(t.privacy)}</a> · <a href="/legal/mentions">${esc(t.mentions)}</a> · <a href="/${PATHS[other]}/" hreflang="${other}">${t.other}</a></p>
  <p>${esc(t.legal)}</p>
</div></footer>
<script type="application/json" id="data">${json(data)}</script>
<script type="module" src="/jeu/app.js"></script>
</body>
</html>
`;
}
