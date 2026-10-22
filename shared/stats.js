// Statistiques d'utilisation anonymes : format des compteurs envoyés, commun à l'appli et au petit
// serveur qui les additionne (analytics/worker.js). Seulement des noms de fonctions et des nombres :
// ni identifiant, ni contenu, ni adresse.

export const DEVICES = ['desktop', 'phone', 'browser', '-'];
export const SYSTEMS = ['win', 'mac', 'linux', 'other'];
export const EVENT_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
export const VERSION_RE = /^(\d{1,4}\.\d{1,4}\.\d{1,4}(-beta\.\d{1,4})?|dev)$/;
export const MAX_ITEMS = 300;
export const MAX_COUNT = 5000;

// ---- Détail des erreurs ----
// Pour comprendre une erreur : fichier et ligne, type (interface, promesse, serveur de l'appli),
// message technique et chemin d'appel (fonctions, fichiers, lignes). Le message est nettoyé :
// adresses web, dossiers, e-mails et longs nombres retirés (rien qui désigne la personne).
export const ERROR_KINDS = ['js', 'promise', 'server'];
export const WHERE_RE = /^([a-z0-9._-]{1,40}:\d{1,6}|other|server)$/;
export const MAX_ERRORS = 50;

export function cleanErrorText(text, max = 200) {
  return String(text || '')
    // Adresse : seul le nom d'un fichier de code est gardé (« news.js »)
    .replace(/[a-z][\w+.-]*:\/\/[^\s'"()<>]+/gi, (u) => { const f = u.split(/[?#]/)[0].split('/').pop(); return /^[\w.-]+\.[cm]?js(:\d+)*$/i.test(f) ? f : '<adresse>'; })
    .replace(/[A-Za-z]:\\[^\s'",;]+/g, '<dossier>')
    .replace(/(^|[\s('"=])\/(?:[^\s/'",;]+\/)+[^\s'",;]*/g, '$1<dossier>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<e-mail>')
    .replace(/\d{5,}/g, '#')
    .replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Pile d'appels -> « fonction fichier.js:ligne ← … » (3 étapes au plus, noms de fichiers seuls)
export function stackFrames(stack, max = 3) {
  const out = [];
  for (const line of String(stack || '').split('\n')) {
    const m = line.match(/^\s*(?:at\s+(?:async\s+)?(?:(.*?)\s+\()?|(.*?)@)(?:.*?[/\\])?([\w.-]+\.[cm]?js):(\d+)(?::\d+)?\)?\s*$/);
    if (!m) continue;
    const fn = String(m[1] || m[2] || '').replace(/^(Object|Module)\./, '').replace(/[^\w$.<>]/g, '').slice(0, 40);
    out.push(`${fn ? `${fn} ` : ''}${m[3]}:${m[4]}`);
    if (out.length >= max) break;
  }
  return out.join(' ← ');
}

// Erreurs reçues -> [{ w, k, m, s, d, n }] valides, doublons additionnés
export function cleanErrors(list) {
  if (!Array.isArray(list)) return [];
  const out = new Map();
  for (const e of list.slice(0, MAX_ERRORS)) {
    if (!e || typeof e !== 'object') continue;
    const w = String(e.w || ''), k = String(e.k || ''), d = String(e.d || '');
    if (!WHERE_RE.test(w) || !ERROR_KINDS.includes(k) || !DEVICES.includes(d) || !Number.isInteger(e.n) || e.n < 1) continue;
    const m = cleanErrorText(e.m), st = cleanErrorText(e.s, 300);
    const key = [w, k, m, st, d].join('\u0001');
    out.set(key, { w, k, m, s: st, d, n: Math.min(MAX_COUNT, (out.get(key)?.n || 0) + e.n) });
  }
  return [...out.values()];
}

// Lot reçu -> { version, os, items: [[événement, appareil, nombre]], errors? }, ou null s'il est
// invalide. Les lignes mal formées sont ignorées ; les doublons sont additionnés.
export function cleanBatch(body) {
  if (!body || typeof body !== 'object') return null;
  const version = String(body.v || '');
  const os = String(body.os || '');
  if (!VERSION_RE.test(version) || !SYSTEMS.includes(os) || (!Array.isArray(body.items) && !Array.isArray(body.errors))) return null;
  const errors = cleanErrors(body.errors);
  const sum = new Map();
  for (const it of (Array.isArray(body.items) ? body.items : []).slice(0, MAX_ITEMS)) {
    if (!Array.isArray(it)) continue;
    const [event, device, n] = it;
    if (typeof event !== 'string' || !EVENT_RE.test(event) || !DEVICES.includes(device)) continue;
    if (!Number.isInteger(n) || n < 1) continue;
    const k = `${event}|${device}`;
    sum.set(k, Math.min(MAX_COUNT, (sum.get(k) || 0) + n));
  }
  if (!sum.size && !errors.length) return null;
  return { version, os, items: [...sum].map(([k, n]) => [...k.split('|'), n]), ...(errors.length ? { errors } : {}) };
}

// Fonctions suivies, pour la page de stats : nom lisible et rubrique (les autres s'affichent telles quelles)
export const LABELS = {
  'app.active': 'Installations actives (par jour)',
  'app.install': 'Nouvelles installations',
  'app.open': 'Ouvertures de l\'interface',
  'session.live': 'Séances suivies en direct',
  'session.replay': 'Replays lancés',
  'lang.fr': 'Interface en français',
  'lang.en': 'Interface en anglais',
  'rail.home': 'Accueil',
  'rail.live': 'Direct',
  'rail.results': 'Résultats',
  'rail.season': 'Saison',
  'rail.news': 'Actu',
  'rail.replay': 'Replays (menu)',
  'rail.radio': 'Commentaires F1 TV / radio',
  'rail.summary': 'Résumé de la séance',
  'rail.mini': 'Mini-classement',
  'rail.reset': 'Disposition des panneaux',
  'rail.scheme': 'Apparence (clair / sombre)',
  'rail.settings': 'Réglages',
  'tool.docs': 'Documents FIA',
  'tool.speeds': 'Vitesses aux points de mesure',
  'tool.sectors': 'Meilleurs secteurs et tour idéal',
  'tool.weather': 'Météo et radar de pluie',
  'feature.autosync': 'Synchro TV par le son',
  'feature.transcribe': 'Transcription des radios',
  'feature.radio-play': 'Écoute d\'une radio d\'équipe',
  'feature.predict': 'Pronostics',
  'feature.moments': 'Moments clés du replay',
  'feature.backup': 'Sauvegarde des réglages',
  'feature.lan': 'Accès depuis le téléphone',
  'feature.lights': 'Lumières connectées',
  'feature.reminders': 'Rappels / calendrier',
  'feature.popout': 'Panneau dans une autre fenêtre',
  'feature.floatmap': 'Carte flottante',
  'feature.stream': 'Overlays de streaming (adresse copiée)',
  'feature.obradio': 'Radios des caméras embarquées',
  'feature.legends': 'Légendes sous les panneaux',
  'tab.rcm': 'Direction de course',
  'tab.stewards': 'Enquêtes des commissaires',
  'tab.tracklimits': 'Limites de piste',
  'tab.radios': 'Radios d\'équipe',
  'tab.trace': 'Analyse · Race trace',
  'tab.positions': 'Analyse · Positions',
  'tab.laptimes': 'Analyse · Temps au tour',
  'tab.pace': 'Analyse · Rythme',
  'tab.tyrehist': 'Analyse · Historique des pneus',
  'tab.sectors': 'Analyse · Secteurs',
  'tab.compare': 'Analyse · Comparaison',
  'tab.telemetry': 'Analyse · Télémétrie',
  'tab.pits': 'Arrêts aux stands',
  'tab.strategy': 'Stratégie',
  'tab.tyres': 'Jeux de pneus',
  'tab.pitsim': 'Simulateur d\'arrêt',
  'tab.battles': 'Bagarres',
  'tab.champ': 'Projection du championnat',
  'season.home': 'Saison · Accueil',
  'season.calendar': 'Saison · Calendrier',
  'season.standings': 'Saison · Classements',
  'season.results': 'Saison · Résultats et records',
  'season.title': 'Saison · Course au titre',
  'season.h2h': 'Saison · Duels',
  'season.ratings': 'Saison · Notes des pilotes',
  'season.predict': 'Saison · Pronostics',
  'season.drivers': 'Saison · Pilotes',
  'season.consistency': 'Saison · Régularité',
  'season.pits': 'Saison · Arrêts aux stands',
  'season.speeds': 'Saison · Vitesses de pointe',
  'season.circuits': 'Saison · Profil des circuits',
  'season.tech': 'Saison · Évolutions techniques',
  'season.elements': 'Saison · Éléments moteur',
  'settings.f1tv': 'Réglages · Compte F1 TV',
  'settings.look': 'Réglages · Apparence',
  'settings.display': 'Réglages · Disposition',
  'settings.alerts': 'Réglages · Alertes et favoris',
  'settings.app': 'Réglages · Application',
  'settings.stream': 'Réglages · Streaming',
  'settings.about': 'Réglages · À propos',
  'mode.essential': 'Interface Essentiel (ouvertures)',
  'mode.full': 'Interface complète (ouvertures)',
  'welcome.done': 'Accueil du premier lancement suivi jusqu\'au bout',
  'welcome.skip': 'Accueil du premier lancement passé',
  'welcome.f1tv': 'Accueil du premier lancement : connexion F1 TV demandée',
};

// Rubriques des fonctions (page des stats) : préfixe du compteur -> nom
export const FEATURE_GROUPS = { rail: 'Navigation', tab: 'Onglets', season: 'Saison', tool: 'Outils', feature: 'Fonctions', settings: 'Réglages' };
