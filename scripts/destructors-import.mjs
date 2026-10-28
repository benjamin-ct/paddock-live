// Championnat des casseurs : relit les dégâts de la saison sur app.formula1dashboard.com/destructors-championship
// (estimations de u/Dense-Strategy-867 sur Reddit, compilées et corrigées par Formula 1 Dashboard, reprises avec leur
// accord) et réécrit analytics/destructors-data.js, données de secours du serveur (qui relit lui-même la page toutes
// les 12 heures, analytics/destructors.js). À lancer de temps en temps, puis PR (serveur seul).
import fs from 'node:fs';
import { parseDashboard } from '../shared/destructors.js';

const html = await (await fetch('https://app.formula1dashboard.com/destructors-championship')).text();
const data = parseDashboard(html);
if (!data) throw new Error('Données des dégâts introuvables dans la page');
const rows = data.rows;
const total = rows.reduce((s, r) => s + r.parts.reduce((a, [, p, q]) => a + p * q, 0), 0);
const out = `// Championnat des casseurs ${data.year} : dégâts estimés de chaque pilote, Grand Prix par Grand Prix (round 0 : roulage
// de Barcelone avant la saison). Estimations de u/Dense-Strategy-867 (Reddit), compilées et corrigées par Formula 1
// Dashboard (app.formula1dashboard.com), reprises avec leur accord. Pièces : [nom, prix unitaire en $, quantité].
// Écrit par scripts/destructors-import.mjs le ${new Date().toISOString().slice(0, 10)} (total ${total} $).
export const DESTRUCTORS = { year: ${data.year}, rows: ${JSON.stringify(rows)} };
`;
fs.writeFileSync(new URL('../analytics/destructors-data.js', import.meta.url), out);
console.log(`${rows.length} dégâts, ${total} $`);
