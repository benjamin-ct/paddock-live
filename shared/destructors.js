// Championnat des casseurs (Saison) : coût des dégâts estimés, par pilote, par écurie, par pièce, et les plus gros
// d'un week-end. rows : [{ round, num, driver, team, parts: [[pièce, prix, quantité]] }] (analytics/destructors-data.js)
export function destructors(rows = []) {
  const cost = (r) => r.parts.reduce((s, [, p, q]) => s + p * q, 0);
  const sum = (key) => {
    const m = new Map();
    for (const r of rows) {
      const k = key(r);
      const e = m.get(k) || { ...r, cost: 0, incidents: 0 };
      e.cost += cost(r);
      e.incidents++;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.cost - a.cost).map(({ parts, round, ...e }, i) => ({ ...e, pos: i + 1 }));
  };
  const parts = new Map();
  for (const r of rows) for (const [name, price, qty] of r.parts) {
    const e = parts.get(name) || { name, price, qty: 0, cost: 0 };
    e.qty += qty;
    e.cost += price * qty;
    parts.set(name, e);
  }
  return {
    total: rows.reduce((s, r) => s + cost(r), 0),
    drivers: sum((r) => r.num),
    teams: sum((r) => r.team).map(({ num, driver, ...e }) => e),
    parts: [...parts.values()].sort((a, b) => b.cost - a.cost),
    top: rows.map((r) => ({ round: r.round, num: r.num, driver: r.driver, team: r.team, cost: cost(r) })).sort((a, b) => b.cost - a.cost),
  };
}
