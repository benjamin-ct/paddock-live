// Fichiers statiques du serveur Paddock Live (dossier analytics/site, servi par le Worker) : page web
// du créateur (/studio/, avec son code et le code partagé dans /m/<version>/) et polices (/fonts/).
// Lancé par le workflow « Statistiques » avant le déploiement (et à la main pour un essai local).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PAGES, linksPage } from '../analytics/links/pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'analytics', 'site');
const copy = (from, to, filter = () => true) => {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) if (filter(f)) fs.copyFileSync(path.join(from, f), path.join(to, f));
};

fs.rmSync(OUT, { recursive: true, force: true });
// Page du créateur : code et styles dans un dossier à l'empreinte du contenu (/m/<version>/), gardés
// un an par le téléphone ; seule la page (index.html) est relue à chaque ouverture. Le navigateur
// reçoit d'emblée la liste des modules à charger (modulepreload) au lieu de les découvrir un à un.
const PAGE = path.join(ROOT, 'analytics', 'studio-page');
const SHARED = path.join(ROOT, 'shared');
const isCode = (f) => /\.(js|css)$/.test(f) && f !== 'sw.js';
const hash = crypto.createHash('sha256');
for (const [dir, filter] of [[PAGE, () => true], [SHARED, (f) => f.endsWith('.js')]]) {
  for (const f of fs.readdirSync(dir).filter(filter).sort()) hash.update(`${f}\0`).update(fs.readFileSync(path.join(dir, f)));
}
const VERSION = hash.digest('hex').slice(0, 12);
const M = path.join(OUT, 'm', VERSION);
copy(PAGE, path.join(OUT, 'studio'), (f) => !isCode(f) || f === 'sw.js');
copy(SHARED, path.join(M, 'shared'), (f) => f.endsWith('.js'));
fs.mkdirSync(path.join(M, 'studio'), { recursive: true });
for (const f of fs.readdirSync(PAGE).filter(isCode)) {
  // Code partagé : chemin relatif dans le dossier versionné
  const src = fs.readFileSync(path.join(PAGE, f), 'utf8').replace(/(\bfrom\s*|\bimport\s*\(\s*)(['"])\/shared\//g, '$1$2../shared/');
  fs.writeFileSync(path.join(M, 'studio', f), src);
}
// Modules chargés d'emblée (imports statiques depuis app.js, de proche en proche)
const IMPORT = /(?:^|[\n;])\s*(?:import|export)\s+(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g;
const graph = [];
const visit = (file) => {
  if (graph.includes(file)) return;
  graph.push(file);
  for (const m of fs.readFileSync(file, 'utf8').matchAll(IMPORT)) {
    if (m[1].startsWith('.')) visit(path.resolve(path.dirname(file), m[1]));
  }
};
visit(path.join(M, 'studio', 'app.js'));
const rel = (f) => `/${path.relative(OUT, f).split(path.sep).join('/')}`;
const FONTS = ['titillium-400', 'titillium-600', 'titillium-700', 'sairacondensed-800'];
const head = [
  ...FONTS.map((f) => `<link rel="preload" href="/fonts/${f}.woff2" as="font" type="font/woff2" crossorigin>`),
  `<link rel="stylesheet" href="/m/${VERSION}/studio/style.css">`,
  ...graph.map((f) => `<link rel="modulepreload" href="${rel(f)}">`),
].join('\n');
const index = fs.readFileSync(path.join(PAGE, 'index.html'), 'utf8')
  .replace('<link rel="stylesheet" href="./style.css">', head)
  .replace('src="./app.js"', `src="/m/${VERSION}/studio/app.js"`);
if (!index.includes(`/m/${VERSION}/studio/app.js`) || !index.includes('modulepreload')) throw new Error('index.html : liens du style ou du script introuvables');
fs.writeFileSync(path.join(OUT, 'studio', 'index.html'), index);
// Icônes de l'écran d'accueil du téléphone (dessins dans analytics/icons) : Studio en rouge, statistiques en bleu
const ICONS = path.join(ROOT, 'analytics', 'icons');
fs.copyFileSync(path.join(ICONS, 'studio-180.png'), path.join(OUT, 'studio', 'apple-touch-icon.png'));
fs.copyFileSync(path.join(ICONS, 'studio-512.png'), path.join(OUT, 'studio', 'icon-512.png'));
// Icône et manifeste de la page des statistiques (écran d'accueil du téléphone)
fs.copyFileSync(path.join(ICONS, 'stats-180.png'), path.join(OUT, 'apple-touch-icon.png'));
fs.copyFileSync(path.join(ICONS, 'stats-512.png'), path.join(OUT, 'stats-icon-512.png'));
fs.writeFileSync(path.join(OUT, 'stats.webmanifest'), JSON.stringify({
  name: 'Statistiques · Paddock Live', short_name: 'Statistiques', start_url: '/stats', scope: '/', display: 'standalone',
  background_color: '#07080A', theme_color: '#07080A', lang: 'fr', icons: [{ src: '/stats-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
}, null, 2));
// « Tirer pour actualiser » de la page des statistiques : script classique tiré du module partagé
const ptr = fs.readFileSync(path.join(ROOT, 'shared', 'pull-refresh.js'), 'utf8').replace(/^export function/m, 'function');
fs.writeFileSync(path.join(OUT, 'stats-refresh.js'), `${ptr}\npullToRefresh(() => { location.reload(); return new Promise(() => {}); });\n`);
// Conditions d'utilisation et politique de confidentialité (/legal/terms, /legal/privacy), demandées
// par TikTok pour l'app de publication en brouillon
copy(path.join(ROOT, 'analytics', 'legal'), path.join(OUT, 'legal'));
// Kit de lancement des comptes (visuels et vidéos des posts de lancement, page du Studio)
for (const acc of ['benjy', 'paddocklive']) copy(path.join(ROOT, 'analytics', 'launch-kit', acc), path.join(OUT, 'kit', acc));
// Site de l'appli pour le lancement (/site/, racine d'un nom de domaine à soi), avec ses images
copy(path.join(ROOT, 'analytics', 'launch'), path.join(OUT, 'site'), (f) => f !== 'img');
copy(path.join(ROOT, 'analytics', 'launch', 'img'), path.join(OUT, 'site', 'img'));
// Présentation publique de l'appli (/app/), site officiel déclaré à TikTok
copy(path.join(ROOT, 'analytics', 'home'), path.join(OUT, 'app'));
// Scènes OBS toutes prêtes (paddocklive.app/obs, téléchargées : voir _headers)
copy(path.join(ROOT, 'docs', 'obs'), path.join(OUT, 'obs'), (f) => f.endsWith('.json'));
// Pronostics entre amis en ligne (/p/<groupe>) : une seule page, le Worker la sert pour chaque groupe
copy(path.join(ROOT, 'analytics', 'pronos-page'), path.join(OUT, 'p'));
// Pages « tous les liens » à mettre en bio des réseaux (/liens/, /benjy/)
for (const id of Object.keys(PAGES)) {
  fs.mkdirSync(path.join(OUT, id), { recursive: true });
  fs.writeFileSync(path.join(OUT, id, 'index.html'), linksPage(id));
}
// Fichiers servis à la racine du site (vérification du domaine par TikTok)
copy(path.join(ROOT, 'analytics', 'root'), OUT);
copy(path.join(ROOT, 'public', 'fonts'), path.join(OUT, 'fonts'), (f) => /^(titillium|sairacondensed|jetbrainsmono).*\.woff2$|^OFL/.test(f));
// En-têtes : la page et l'API ne doivent pas être indexées ni mises en cache trop longtemps
fs.writeFileSync(path.join(OUT, '_headers'), `/studio/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-cache
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
/m/*
  Cache-Control: public, max-age=31536000, immutable
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
/fonts/*
  Cache-Control: public, max-age=2592000
/legal/*
  Cache-Control: public, max-age=3600
/app/*
  Cache-Control: public, max-age=3600
/site/*
  Cache-Control: public, max-age=3600
/liens/*
  Cache-Control: public, max-age=3600
/benjy/*
  Cache-Control: public, max-age=3600
/site/img/*
  Cache-Control: public, max-age=86400
/obs/*
  Cache-Control: public, max-age=3600
  Content-Disposition: attachment
/kit/*
  Cache-Control: public, max-age=86400
  X-Robots-Tag: noindex, nofollow
`);
const n = (d) => fs.readdirSync(path.join(OUT, d)).length;
console.log(`Site prêt : version ${VERSION}, ${n(`m/${VERSION}/studio`)} fichiers studio, ${n(`m/${VERSION}/shared`)} modules partagés (${graph.length} chargés d'emblée), ${n('fonts')} polices`);
