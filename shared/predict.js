// Pronostics entre amis : avant chaque Grand Prix, chacun prédit la pole et le podium. Points :
// pole exacte 3 ; chaque pilote du podium à la bonne place 3, sur le podium mais à une autre
// place 1 ; podium exact dans l'ordre +2. Les pronostics ferment au début des qualifications
// (pole) et au départ de la course (podium).

export const POINTS = { pole: 3, exact: 3, podium: 1, perfect: 2 };

// Heures de fermeture d'une manche : { pole, podium } (ms)
export function locksOf(race) {
  const t = (label) => Date.parse(race?.sessions?.find((s) => s.label === label)?.t || '') || null;
  const podium = t('Course') ?? (Date.parse(race?.date || '') || null);
  return { pole: t('Qualifications') ?? podium, podium };
}

// Points d'un pronostic { pole, p1, p2, p3 } (trigrammes) d'après les résultats officiels
// result : { pole: 'VER', podium: ['VER', 'NOR', 'LEC'] } ; détail pour l'affichage
export function scorePick(pick, result) {
  const out = { total: 0, pole: 0, podium: [0, 0, 0], perfect: 0 };
  if (!pick || !result) return out;
  if (result.pole && pick.pole && pick.pole === result.pole) out.pole = POINTS.pole;
  const podium = result.podium || [];
  if (podium.length === 3) {
    const mine = [pick.p1, pick.p2, pick.p3];
    mine.forEach((d, i) => {
      if (!d) return;
      if (podium[i] === d) out.podium[i] = POINTS.exact;
      else if (podium.includes(d)) out.podium[i] = POINTS.podium;
    });
    if (mine.every((d, i) => d && d === podium[i])) out.perfect = POINTS.perfect;
  }
  out.total = out.pole + out.podium.reduce((a, b) => a + b, 0) + out.perfect;
  return out;
}

// Résultat officiel d'une manche (données de la saison) : pole et podium, ou null si pas encore couru
export function resultOf(race) {
  const pole = (race?.quali || []).find((q) => q.pos === 1)?.code || null;
  const podium = [1, 2, 3].map((p) => (race?.results || []).find((r) => r.pos === p)?.code).filter(Boolean);
  return pole || podium.length === 3 ? { pole, podium: podium.length === 3 ? podium : [] } : null;
}

// Nom de joueur : 1 à 24 caractères lisibles ; clé insensible à la casse
export function playerKey(name) {
  const n = String(name || '').normalize('NFC').replace(/[^\p{L}\p{N} ._'-]/gu, '').trim().slice(0, 24);
  // Les noms réservés des objets JavaScript (« __proto__ », « constructor »…) ne peuvent pas servir de clé
  const k = n.toLowerCase();
  return k && !(k in Object.prototype) ? k : null;
}

// Classement de la saison : [{ name, total, rounds: { round: points } }], du meilleur au moins bon
export function leaderboard(store, races) {
  const byRound = new Map((races || []).map((r) => [r.round, resultOf(r)]));
  const players = new Map();
  for (const [round, picks] of Object.entries(store?.rounds || {})) {
    const res = byRound.get(Number(round));
    for (const [key, pick] of Object.entries(picks || {})) {
      const p = players.get(key) || { name: pick.name || key, total: 0, rounds: {} };
      const pts = res ? scorePick(pick, res).total : null;
      p.rounds[round] = pts;
      p.total += pts || 0;
      players.set(key, p);
    }
  }
  return [...players.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

// Pronostics d'une saison vus par un joueur. store : { rounds: { manche: { clé: pronostic } } } ;
// mine(clé, pronostic) : ce joueur (ses choix restent visibles) ; ceux des autres sont cachés (« ? »)
// jusqu'à la fermeture. Commun à l'appli (pronostics sur l'ordinateur) et au groupe en ligne.
export function predictView(store, s, mine, now = Date.now()) {
  const races = s.races.map((r) => {
    const locks = locksOf(r);
    const result = resultOf(r);
    const picks = Object.entries(store?.rounds?.[r.round] || {}).map(([key, p]) => {
      const me = mine(key, p);
      const showPole = me || !locks.pole || now >= locks.pole;
      const showPodium = me || !locks.podium || now >= locks.podium;
      return {
        name: p.name, mine: me,
        pole: showPole ? p.pole || null : (p.pole ? '?' : null),
        p1: showPodium ? p.p1 || null : (p.p1 ? '?' : null),
        p2: showPodium ? p.p2 || null : (p.p2 ? '?' : null),
        p3: showPodium ? p.p3 || null : (p.p3 ? '?' : null),
        points: result ? scorePick(p, result) : null,
      };
    }).sort((a, b) => (b.points?.total || 0) - (a.points?.total || 0) || a.name.localeCompare(b.name));
    return { round: r.round, name: r.name, locality: r.locality, date: r.date, locks, result, picks };
  });
  return { now, drivers: s.drivers.map((d) => ({ code: d.code, name: d.name, team: d.team })), races, board: leaderboard(store, s.races) };
}

// Pronostic reçu, vérifié : { race, key, pick } à enregistrer (old : pronostic déjà enregistré de ce
// joueur pour cette manche ; ses choix déjà fermés sont gardés), sinon une erreur au message clair
export function checkPick(s, { round, name, pole, p1, p2, p3 }, old = null, now = Date.now()) {
  const key = playerKey(name);
  if (!key) throw new Error('Indiquez votre prénom ou un pseudo');
  const race = s.races.find((r) => r.round === Number(round));
  if (!race) throw new Error('Grand Prix introuvable');
  const codes = new Set(s.drivers.map((d) => d.code));
  const pickOk = (c) => c === null || c === undefined || c === '' || codes.has(c);
  if (![pole, p1, p2, p3].every(pickOk)) throw new Error('Pilote inconnu');
  const podium = [p1, p2, p3].filter(Boolean);
  if (new Set(podium).size !== podium.length) throw new Error('Un même pilote ne peut pas occuper deux places du podium');
  const locks = locksOf(race);
  const poleOpen = !locks.pole || now < locks.pole;
  const podiumOpen = !locks.podium || now < locks.podium;
  if (!poleOpen && !podiumOpen) throw new Error('Pronostics fermés : la course a commencé');
  const o = old || {};
  return {
    race, key, poleOpen, podiumOpen,
    pick: {
      name: String(name).trim().slice(0, 24),
      pole: poleOpen ? pole || null : o.pole || null,
      p1: podiumOpen ? p1 || null : o.p1 || null,
      p2: podiumOpen ? p2 || null : o.p2 || null,
      p3: podiumOpen ? p3 || null : o.p3 || null,
      at: now,
    },
  };
}
