// Championnat des casseurs : relit les dégâts de la saison sur app.formula1dashboard.com/destructors-championship
// (estimations de u/Dense-Strategy-867 sur Reddit, compilées et corrigées par Formula 1 Dashboard, reprises avec leur
// accord) et réécrit analytics/destructors-data.js. À lancer après chaque Grand Prix, puis PR (serveur seul).
import fs from 'node:fs';

const year = Number(process.argv[2]) || new Date().getUTCFullYear();
const html = await (await fetch('https://app.formula1dashboard.com/destructors-championship')).text();
const payload = [...html.matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/gs)].map((m) => JSON.parse(`"${m[1]}"`)).join('');
const at = payload.indexOf('{"round":0,"driver_number"') >= 0 ? payload.indexOf('{"round":0,"driver_number"') : payload.indexOf('{"round":1,"driver_number"');
if (at < 0) throw new Error('Données des dégâts introuvables dans la page');
// Tableau JSON qui commence juste avant : lu jusqu'au crochet fermant correspondant
let i = payload.lastIndexOf('[', at), depth = 0, end = i, str = false;
for (; end < payload.length; end++) {
  const c = payload[end];
  if (str) { if (c === '\\') end++; else if (c === '"') str = false; continue; }
  if (c === '"') str = true; else if (c === '[' || c === '{') depth++; else if (c === ']' || c === '}') { depth--; if (!depth) break; }
}
const rows = JSON.parse(payload.slice(i, end + 1)).map((d) => ({
  round: d.round, num: d.driver_number, driver: d.driver_name, team: d.constructor_name,
  parts: d.components.map((c) => [c.name, c.price, c.quantity]),
}));
const total = rows.reduce((s, r) => s + r.parts.reduce((a, [, p, q]) => a + p * q, 0), 0);
const out = `// Championnat des casseurs ${year} : dégâts estimés de chaque pilote, Grand Prix par Grand Prix (round 0 : roulage
// de Barcelone avant la saison). Estimations de u/Dense-Strategy-867 (Reddit), compilées et corrigées par Formula 1
// Dashboard (app.formula1dashboard.com), reprises avec leur accord. Pièces : [nom, prix unitaire en $, quantité].
// Écrit par scripts/destructors-import.mjs le ${new Date().toISOString().slice(0, 10)} (total ${total} $).
export const DESTRUCTORS = { year: ${year}, rows: ${JSON.stringify(rows)} };
`;
fs.writeFileSync(new URL('../analytics/destructors-data.js', import.meta.url), out);
console.log(`${rows.length} dégâts, ${total} $`);
