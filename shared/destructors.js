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

// Page app.formula1dashboard.com/destructors-championship -> { year, rows } (données glissées par la page dans
// self.__next_f), ou null si elles n'y sont pas. Pièces : [nom, prix unitaire en $, quantité]
export function parseDashboard(html) {
  const payload = [...String(html).matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/gs)].map((m) => { try { return JSON.parse(`"${m[1]}"`); } catch { return ''; } }).join('');
  const at = payload.search(/\{"round":\d+,"driver_number"/);
  if (at < 0) return null;
  // Tableau JSON qui commence juste avant : lu jusqu'au crochet fermant correspondant
  const i = payload.lastIndexOf('[', at);
  let depth = 0, end = i, str = false;
  for (; end < payload.length; end++) {
    const c = payload[end];
    if (str) { if (c === '\\') end++; else if (c === '"') str = false; continue; }
    if (c === '"') str = true; else if (c === '[' || c === '{') depth++; else if ((c === ']' || c === '}') && !--depth) break;
  }
  let list;
  try { list = JSON.parse(payload.slice(i, end + 1)); } catch { return null; }
  const year = Number(/(\d{4}) F1 Destructors Championship/.exec(html)?.[1]) || null;
  const rows = list.filter((d) => Array.isArray(d?.components)).map((d) => ({
    round: d.round, num: d.driver_number, driver: d.driver_name, team: d.constructor_name,
    parts: d.components.map((c) => [c.name, c.price, c.quantity]),
  }));
  return rows.length && year ? { year, rows } : null;
}
