// Calculs de l'espace « Saison » (fonctions pures, testées) : écart en qualification entre
// coéquipiers, notes des pilotes (saison et face au coéquipier), tours en tête, circuits proches.
// data : saison Jolpica (/api/season) ; stats : analyse des archives (/api/season/stats).

export const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const classified = (x) => /^\d+$/.test(x?.posText || '');
// Abandon (« R ») ou non classé (« N ») ; un disqualifié (« D »), exclu (« E »), non-partant (« W ») ou non qualifié
// (« F ») n'a pas abandonné
export const retired = (x) => /^[RN]$/.test(x?.posText || '');

// Tours représentatifs d'un pilote dans une course : hors 1er tour, tours aux stands et sous
// neutralisation, et sans les tours anormalement lents (> 107 % de sa médiane : trafic, incident…).
export function cleanLaps(d) {
  const v = (d?.laps || []).filter((l) => !(l[2] & 7)).map((l) => l[1]);
  if (v.length < 8) return null;
  const med = median(v);
  return v.filter((t) => t <= med * 1.07 && t >= med * 0.93);
}

// Écart en qualification entre deux pilotes (lignes de qualification avec q = [Q1, Q2, Q3] en s) :
// dernière partie où les deux ont un temps. s < 0 : a plus rapide.
export function qualiGap(a, b) {
  if (!a?.q || !b?.q) return null;
  for (let i = 2; i >= 0; i--) {
    if (a.q[i] && b.q[i]) return { s: Math.round((a.q[i] - b.q[i]) * 1000) / 1000, pct: ((a.q[i] - b.q[i]) / b.q[i]) * 100, part: i + 1 };
  }
  return null;
}

// Écarts manche par manche entre deux pilotes (codes), avec médiane (les écarts de plus de 3 %
// — incident, piste qui change — sont montrés mais pas comptés)
export function qualiGaps(races, codeA, codeB) {
  const rounds = [];
  for (const r of races) {
    const g = qualiGap(r.quali.find((x) => x.code === codeA), r.quali.find((x) => x.code === codeB));
    if (g) rounds.push({ round: r.round, name: r.name, ...g, outlier: Math.abs(g.pct) > 3 });
  }
  const kept = rounds.filter((g) => !g.outlier);
  return { rounds, median: median(kept.map((g) => g.s)), medianPct: median(kept.map((g) => g.pct)), mean: mean(kept.map((g) => g.s)) };
}

// Tours en tête d'un pilote dans une course analysée (position à la fin de chaque tour)
export const lapsLed = (d) => (d?.laps || []).filter((l) => l[3] === 1).length;

// Rang centile (0 = moins bon, 1 = meilleur) de chaque valeur, plus haut = mieux
function percentiles(entries) {
  const out = new Map();
  const vals = entries.filter(([, v]) => v !== null && v !== undefined && !Number.isNaN(v));
  for (const [k, v] of vals) {
    if (vals.length < 2) { out.set(k, 0.5); continue; }
    let below = 0, same = 0;
    for (const [, w] of vals) { if (w < v) below++; else if (w === v) same++; }
    out.set(k, (below + (same - 1) / 2) / (vals.length - 1));
  }
  return out;
}

export const GRADES = [['S', 85], ['A', 70], ['B', 55], ['C', 45], ['D', 35], ['F', -Infinity]];
export const grade = (score) => (score === null || score === undefined ? null : GRADES.find(([, min]) => score >= min)[0]);

// Critères de la note de saison : [clé, poids, libellé, sens (1 : plus haut = mieux)]
export const SEASON_CRITERIA = [
  ['ppr', 30, 'Points par course', 1],
  ['pace', 20, 'Rythme de course', -1],
  ['avgFinish', 15, 'Place moyenne à l\'arrivée', -1],
  ['avgQuali', 15, 'Place moyenne en qualification', -1],
  ['gained', 10, 'Places gagnées par course', 1],
  ['finishRate', 10, 'Courses terminées', 1],
];
export const MATE_CRITERIA = [
  ['quali', 30, 'Duel en qualification'],
  ['race', 25, 'Duel en course'],
  ['points', 25, 'Part des points de l\'écurie'],
  ['gap', 20, 'Écart moyen en qualification'],
];

// Notes des pilotes sur 100 :
// - saison : moyenne pondérée des rangs centiles parmi les pilotes ayant couru au moins 40 %
//   des courses (50 = pilote médian) ;
// - coéquipier : part des duels (qualif, course), part des points de l'écurie et écart médian en
//   qualification face au(x) coéquipier(s) de chaque course (50 = à égalité).
export function driverRatings(data, stats) {
  const races = data.races.filter((r) => r.results.length);
  const statsBy = new Map((stats?.races || []).map((r) => [r.round, new Map(r.drivers.map((d) => [d.tla, d]))]));
  const minStarts = Math.max(2, Math.ceil(races.length * 0.4));
  const per = new Map();
  const get = (x) => {
    if (!per.has(x.code)) per.set(x.code, { code: x.code, name: x.name, last: x.last, team: x.team, teamId: x.teamId, starts: 0, pts: 0, fin: [], finAll: [], quali: [], gained: [], pace: [], led: 0, h2h: { qa: 0, qb: 0, ra: 0, rb: 0, pts: 0, matePts: 0, gaps: [], mates: new Set() } });
    return per.get(x.code);
  };
  for (const r of races) {
    // Rythme : tour médian « propre » rapporté au meilleur de la course
    const meds = new Map();
    for (const [tla, d] of statsBy.get(r.round) || []) { const c = cleanLaps(d); if (c) meds.set(tla, median(c)); }
    const best = meds.size ? Math.min(...meds.values()) : null;
    for (const x of r.results) {
      const e = get(x);
      e.team = x.team; e.teamId = x.teamId;
      e.starts++;
      e.pts += x.points;
      e.finAll.push(classified(x) ? x.pos : r.results.length);   // abandon : dernière place (22 voitures en 2026)
      if (classified(x)) { e.fin.push(x.pos); if (x.grid) e.gained.push(x.grid - x.pos); }
      if (best && meds.has(x.code)) e.pace.push(((meds.get(x.code) - best) / best) * 100);
      e.led += lapsLed(statsBy.get(r.round)?.get(x.code));
    }
    for (const x of r.sprintResults) get(x).pts += x.points;
    for (const q of r.quali) if (q.pos) get(q).quali.push(q.pos);
    // Duels avec le coéquipier de cette course
    const teams = new Map();
    for (const x of r.results) teams.set(x.teamId, [...(teams.get(x.teamId) || []), x]);
    for (const [teamId, pair] of teams) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      const qa = r.quali.find((q) => q.code === a.code), qb = r.quali.find((q) => q.code === b.code);
      const ptsOf = (x) => x.points + (r.sprintResults.find((s) => s.code === x.code && s.teamId === teamId)?.points || 0);
      const g = qualiGap(qa, qb);
      for (const [me, other, qm, qo, sign] of [[a, b, qa, qb, 1], [b, a, qb, qa, -1]]) {
        const h = get(me).h2h;
        h.mates.add(other.last || other.code);
        if (qm?.pos && qo?.pos) qm.pos < qo.pos ? h.qa++ : h.qb++;
        const pm = classified(me) ? me.pos : 99, po = classified(other) ? other.pos : 99;
        if (pm !== po) pm < po ? h.ra++ : h.rb++;
        h.pts += ptsOf(me);
        h.matePts += ptsOf(other);
        if (g && Math.abs(g.pct) <= 3) h.gaps.push(sign * g.pct);
      }
    }
  }
  const all = [...per.values()].map((e) => ({
    ...e,
    eligible: e.starts >= minStarts,
    metrics: {
      ppr: e.starts ? e.pts / e.starts : null,
      pace: e.pace.length ? mean(e.pace) : null,
      avgFinish: mean(e.finAll),
      avgQuali: mean(e.quali),
      gained: e.gained.length ? mean(e.gained) : null,
      finishRate: e.starts ? e.fin.length / e.starts : null,
    },
  }));
  const pool = all.filter((e) => e.eligible);
  const pct = {};
  for (const [k, , , dir] of SEASON_CRITERIA) pct[k] = percentiles(pool.map((e) => [e.code, e.metrics[k] === null ? null : dir * e.metrics[k]]));
  for (const e of all) {
    e.parts = {};
    let sw = 0, s = 0;
    for (const [k, w] of SEASON_CRITERIA) {
      const p = pct[k].get(e.code);
      e.parts[k] = p ?? null;
      if (p !== undefined && e.eligible) { s += w * p; sw += w; }
    }
    e.season = e.eligible && sw ? Math.round((s / sw) * 100) : null;
    // Face au coéquipier
    const h = e.h2h;
    const share = (a, b) => (a + b ? a / (a + b) : null);
    const gapMed = median(h.gaps);
    const mp = {
      quali: share(h.qa, h.qb),
      race: share(h.ra, h.rb),
      points: h.pts + h.matePts ? h.pts / (h.pts + h.matePts) : (h.qa + h.qb + h.ra + h.rb ? 0.5 : null),
      gap: gapMed === null ? null : Math.min(1, Math.max(0, 0.5 - gapMed / 2)),   // 1 % plus rapide = 1
    };
    let mw = 0, ms = 0;
    for (const [k, w] of MATE_CRITERIA) if (mp[k] !== null) { ms += w * mp[k]; mw += w; }
    e.mateParts = mp;
    e.gapPct = gapMed;
    e.mates = [...h.mates];
    e.mate = mw && h.qa + h.qb + h.ra + h.rb >= 2 ? Math.round((ms / mw) * 100) : null;
    e.seasonGrade = grade(e.season);
    e.mateGrade = grade(e.mate);
  }
  return all.sort((a, b) => (b.season ?? -1) - (a.season ?? -1) || b.pts - a.pts);
}

// Circuits les plus proches : distance entre profils normalisés (écart à la moyenne / écart-type).
// items : [{ round, key?, length, corners, … }] ; key : même tracé (exclu de ses propres voisins)
export const CIRCUIT_FEATURES = [
  ['length', 'longueur'], ['corners', 'virages'], ['avgSpeed', 'vitesse moyenne'], ['topSpeed', 'vitesse de pointe'],
  ['passes', 'dépassements'], ['stopsPerCar', 'arrêts'], ['hard', 'pneus'],
];
export function similarCircuits(items, n = 3) {
  const stat = {};
  for (const [k] of CIRCUIT_FEATURES) {
    const v = items.map((x) => x[k]).filter((x) => x !== null && x !== undefined && !Number.isNaN(x));
    const m = mean(v);
    const s = v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)) : 0;
    stat[k] = { m, s };
  }
  const z = (x, k) => (x[k] === null || x[k] === undefined || !stat[k].s ? null : (x[k] - stat[k].m) / stat[k].s);
  const out = new Map();
  for (const a of items) {
    const near = items.filter((b) => b !== a && (a.key === undefined || b.key !== a.key)).map((b) => {
      let d = 0, c = 0;
      for (const [k] of CIRCUIT_FEATURES) { const za = z(a, k), zb = z(b, k); if (za !== null && zb !== null) { d += (za - zb) ** 2; c++; } }
      return { b, d: c >= 3 ? Math.sqrt(d / c) : Infinity };
    }).filter((x) => x.d < Infinity).sort((x, y) => x.d - y.d);
    out.set(a.key ?? a.round, near.slice(0, n).map((x) => ({ ...x.b, dist: x.d })));
  }
  return out;
}

// Course au titre : qui peut encore être champion, pilotes et constructeurs. Après chaque manche
// courue (sprint compris), un concurrent est éliminé quand ses points plus le maximum encore à
// prendre ne rattrapent plus le leader. Points max par manche : course 25 (+1 meilleur tour de 2019 à
// 2024) et sprint 8 ; constructeurs : les deux voitures (25 + 18, sprint 8 + 7).
export function titleRace(data, year) {
  const fl = year >= 2019 && year <= 2024 ? 1 : 0;
  const races = [...(data?.races || [])].sort((a, b) => a.round - b.round);
  const done = races.filter((r) => r.results?.length);
  const future = races.filter((r) => !r.results?.length);
  const maxRound = { d: (r) => 25 + fl + (r.sprint ? 8 : 0), c: (r) => 43 + fl + (r.sprint ? 15 : 0) };
  const left = (kind, from) => [...done.slice(from), ...future].reduce((s, r) => s + maxRound[kind](r), 0);
  const run = (kind, list, keyOf) => {
    const cum = new Map(), out = new Map();
    done.forEach((r, i) => {
      for (const x of [...(r.results || []), ...(r.sprintResults || [])]) cum.set(keyOf(x), (cum.get(keyOf(x)) || 0) + (x.points || 0));
      const lead = Math.max(0, ...cum.values());
      const rest = left(kind, i + 1);
      for (const e of list) if (!out.has(e.key) && (cum.get(e.key) || 0) + rest < lead) out.set(e.key, r);
    });
    // Points officiels (pénalités, décisions) : ils décident de l'état actuel
    const rest = left(kind, done.length);
    const lead = Math.max(0, ...list.map((e) => e.points));
    return list.map((e) => {
      const alive = e.points + rest >= lead;
      const r = alive ? null : out.get(e.key) || done.at(-1) || null;
      return { ...e, alive, maxPts: e.points + rest, behind: lead - e.points, outRound: r?.round || null, outName: r?.name || '' };
    });
  };
  const drivers = run('d', (data?.drivers || []).map((d) => ({ ...d, key: d.code })), (x) => x.code);
  const constructors = run('c', (data?.constructors || []).map((c) => ({ ...c, key: c.id })), (x) => x.teamId);
  const champ = (list) => (list.filter((e) => e.alive).length === 1 && done.length ? list.find((e) => e.alive) : null);
  // Quand le titre peut-il se jouer ? Au plus tôt : le leader marque le maximum à chaque manche et son
  // premier poursuivant rien. Au prochain GP : le leader doit y marquer au moins « margin » points de
  // plus que chaque rival (négatif : il peut en perdre jusqu'à -margin-1 ; égalité de points :
  // départage au nombre de victoires, non compté ici). Rivaux que le week-end ne peut pas sauver exclus.
  const clinch = (list, kind) => {
    const alive = list.filter((e) => e.alive).sort((a, b) => b.points - a.points);
    if (alive.length < 2 || !future.length) return null;
    const [leader, ...rivals] = alive;
    const tot = left(kind, done.length);
    let s = 0, earliest = null;
    for (const r of future) {
      s += maxRound[kind](r);
      if (leader.points + s - rivals[0].points > tot - s) { earliest = r; break; }
    }
    const next = future[0], max = maxRound[kind](next), after = tot - max;
    const needs = rivals.map((r) => ({ key: r.key, code: r.code, name: r.name, points: r.points, margin: after - (leader.points - r.points) + 1 })).filter((n) => n.margin > -max);
    return {
      leader: { key: leader.key, code: leader.code, name: leader.name, points: leader.points },
      earliest: earliest ? { round: earliest.round, name: earliest.name } : null,
      next: { round: next.round, name: next.name, sprint: !!next.sprint, max },
      possibleNext: needs.every((n) => n.margin <= max), needs,
    };
  };
  return {
    drivers, constructors, champion: champ(drivers), champTeam: champ(constructors),
    clinchD: champ(drivers) ? null : clinch(drivers, 'd'), clinchC: champ(constructors) ? null : clinch(constructors, 'c'),
    races: future.length, sprints: future.filter((r) => r.sprint).length, maxD: left('d', done.length), maxC: left('c', done.length),
  };
}

// Points d'une place à l'arrivée d'une course (barème depuis 2010, sans le point du meilleur tour)
// Classements après les « round » premières manches (Saison → Comparer deux saisons) : points des courses et des sprints,
// victoires ; pilotes repérés par leur code, écuries par leur identifiant ; à égalité de points, le plus de victoires
export function standingsAfter(data, round) {
  const races = (data?.races || []).filter((r) => r.round <= round && r.results?.length);
  const tally = (keyOf, info) => {
    const m = new Map();
    for (const r of races) {
      for (const x of [...r.results, ...(r.sprintResults || [])]) {
        const k = keyOf(x);
        if (!m.has(k)) m.set(k, { key: k, ...info(x), points: 0, wins: 0 });
        m.get(k).points += x.points || 0;
      }
      if (r.results[0]?.pos === 1) m.get(keyOf(r.results[0])).wins++;
    }
    return [...m.values()].sort((a, b) => b.points - a.points || b.wins - a.wins).map((e, i) => ({ ...e, pos: i + 1 }));
  };
  return {
    races: races.length,
    drivers: tally((x) => x.code, (x) => ({ code: x.code, name: x.name, last: x.last, team: x.team, teamId: x.teamId })),
    constructors: tally((x) => x.teamId, (x) => ({ name: x.team, id: x.teamId })),
  };
}

// Nom court d'une écurie, le même dans toute la Saison : Jolpica dit « RB F1 Team », « Alpine F1 Team », la F1 et la FIA
// « Racing Bulls », « Red Bull Racing », « Haas F1 Team »
export const teamShort = (name) => (typeof name !== 'string' ? name
  : /^(rb f1 team|visa cash app rb)/i.test(name) ? 'Racing Bulls' : name === 'Red Bull Racing' ? 'Red Bull' : name.replace(/ F1 Team$/, ''));
// Tous les noms d'écuries d'une réponse du serveur (champs « team », et « name » des constructeurs), raccourcis sur place
export function shortTeams(v) {
  if (Array.isArray(v)) v.forEach(shortTeams);
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (k === 'team') v[k] = teamShort(x);
      else if (k === 'constructors' && Array.isArray(x)) x.forEach((c) => { c.name = teamShort(c.name); });
      else if (x && typeof x === 'object') shortTeams(x);
    }
  }
  return v;
}

// Même écurie sous un autre nom d'une saison à l'autre (identifiants Jolpica) : Sauber (Alfa Romeo, Audi), Racing Bulls
// (Toro Rosso, AlphaTauri), Aston Martin (Force India, Racing Point), Alpine (Renault)
const LINEAGE = { alfa: 'sauber', audi: 'sauber', toro_rosso: 'rb', alphatauri: 'rb', force_india: 'aston_martin', racing_point: 'aston_martin', renault: 'alpine' };
export const lineage = (id) => LINEAGE[id] || id;

// Points cumulés d'un pilote (code) ou d'une écurie (identifiant, même lignée) après chaque manche jusqu'à « round » :
// [{ x: manche, y: points, pos, gp }] (pos : arrivée en course, gp : nom du Grand Prix)
export function pointsPath(data, kind, key, round) {
  const races = [...(data?.races || [])].filter((r) => r.round <= round && r.results?.length).sort((a, b) => a.round - b.round);
  const mine = (x) => (kind === 'd' ? x.code === key : lineage(x.teamId) === lineage(key));
  let y = 0;
  return races.map((r) => {
    for (const x of [...r.results, ...(r.sprintResults || [])]) if (mine(x)) y += x.points || 0;
    const res = r.results.find(mine);
    return { x: r.round, y, pos: res ? res.posText || res.pos : null, gp: r.name };
  });
}

export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
// Meilleure place qui rapporte au plus « pts » points (11 = hors des points)
export function placeForMaxPoints(pts) {
  const i = RACE_POINTS.findIndex((p) => p <= pts);
  return i < 0 ? 11 : i + 1;
}

// Bilan de la saison (Saison → Bilan) : courses disputées, vainqueurs, poles, podiums, plus belle remontée,
// abandons, victoires depuis la pole. Pilotes repérés par leur code (« VER »)
export function seasonReview(data) {
  const races = [...(data?.races || [])].sort((a, b) => a.round - b.round);
  const done = races.filter((r) => r.results?.length);
  const tally = (pick) => {
    const m = new Map();
    for (const r of done) for (const x of pick(r)) if (x) m.set(x.code, { name: x.name, last: x.last, code: x.code, team: x.team, teamId: x.teamId, n: (m.get(x.code)?.n || 0) + 1 });
    return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  };
  const wins = tally((r) => [r.results.find((x) => x.pos === 1)]);
  const poles = tally((r) => [r.quali?.find((x) => x.pos === 1) || r.results.find((x) => x.grid === 1)]);
  const podiums = tally((r) => r.results.filter((x) => x.pos >= 1 && x.pos <= 3 && classified(x)));
  let comeback = null, dnf = 0, poleWins = 0;
  for (const r of done) {
    for (const x of r.results) {
      if (!classified(x)) { if (retired(x)) dnf++; continue; }
      const gain = x.grid ? x.grid - x.pos : 0;   // départ des stands (grille 0) : pas compté
      if (gain > (comeback?.gain || 0)) comeback = { name: x.name, last: x.last, code: x.code, team: x.team, teamId: x.teamId, gp: r.name, from: x.grid, to: x.pos, gain };
    }
    const w = r.results.find((x) => x.pos === 1);
    if (w && w.grid === 1) poleWins++;
  }
  return { races: races.length, done: done.length, wins, poles, podiums, winners: wins.length, comeback, dnf, poleWins, leader: data?.drivers?.[0] || null, leaderTeam: data?.constructors?.[0] || null };
}
