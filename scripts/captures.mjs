// Captures d'écran pour les audits visuels (UX Reviewer, UI Designer) : l'appli en téléphone, tablette et ordinateur,
// en sombre et en clair, avec le serveur local de test (rien n'est envoyé au Worker en production).
//   node scripts/captures.mjs [chemin…] [--design=v2|broadcast|classic] [--lang=fr|en|it|es] [--out=dossier]
// Sans chemin : « / » (Accueil). Images dans --out (par défaut .cache/captures/, ignoré par git) ; débordements
// horizontaux et erreurs de page affichés. Utilise le Playwright préinstallé (aucune dépendance ajoutée au projet).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] || d;
const pages = args.filter((a) => !a.startsWith('--'));
if (!pages.length) pages.push('/');
const design = opt('design', 'v2'), lang = opt('lang', 'fr'), out = path.resolve(opt('out', path.join(root, '.cache/captures')));
const port = Number(process.env.PORT) || 3099;

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { console.error('Playwright absent : rien à capturer'); process.exit(1); }

// Serveur local sans traduction, radio, statistiques, avis, pronos, Studio, relais, saison ni actualités (CLAUDE.md)
const off = Object.fromEntries(['TRANSLATE', 'RADIO', 'STATS', 'FEEDBACK', 'PRONOS', 'STUDIO', 'RELAY', 'SEASON'].map((k) => [`PADDOCK_${k}_URL`, '']));
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, ...off, NO_NEWS: '1', PORT: String(port) }, stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);
const base = `http://127.0.0.1:${port}`;
for (let i = 0; ; i++) {
  try { if ((await fetch(base)).ok) break; } catch {}
  if (i > 50) { console.error(`Serveur local injoignable sur ${base}`); process.exit(1); }
  await new Promise((r) => setTimeout(r, 200));
}

const sizes = [['telephone', { width: 390, height: 844, isMobile: true, hasTouch: true }], ['tablette', { width: 820, height: 1180, hasTouch: true }], ['ordinateur', { width: 1440, height: 900 }]];
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
let problems = 0;
for (const p of pages) {
  for (const [name, { width, height, ...dev }] of sizes) {
    for (const scheme of ['dark', 'light']) {
      const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: scheme, locale: lang, ...dev });
      await ctx.addInitScript((pr) => localStorage.setItem('paddock.prefs', JSON.stringify(pr)), { welcomed: true, lang, design, designV: 1 });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.goto(base + p, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(2000);
      const file = path.join(out, `${p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'accueil'}-${name}-${scheme}.png`);
      await page.screenshot({ path: file });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      const notes = [over > 1 && `déborde de ${over} px en largeur`, ...errs.map((e) => `erreur : ${e}`)].filter(Boolean);
      problems += notes.length;
      console.log(`${path.relative(root, file)}${notes.length ? `  ⚠ ${notes.join(' · ')}` : ''}`);
      await ctx.close();
    }
  }
}
await b.close();
stop();
console.log(problems ? `${problems} point(s) à regarder` : 'Aucun débordement ni erreur de page');
