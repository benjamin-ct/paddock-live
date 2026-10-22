// Texte de la page d'une version publiée : nouveautés de cette version (CHANGELOG.md), puis
// les instructions d'installation (.github/release-footer.md).
// Usage : node scripts/release-notes.mjs v1.15.0 > notes.md, ou pour une bêta
// node scripts/release-notes.mjs v1.28.0-beta.3 [CHANGELOG.md de la bêta précédente] — échoue si la version n'a pas
// sa section dans CHANGELOG.md (chaque version publiée doit avoir son journal).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changelogFor, newItems } from '../shared/changelog.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2];
const entry = changelogFor(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), tag);
if (!entry || !entry.body) {
  console.error(`CHANGELOG.md : pas de section « ## ${tag} » — ajoutez les nouveautés de cette version avant de la publier.`);
  process.exit(1);
}
const footer = fs.readFileSync(path.join(root, '.github', 'release-footer.md'), 'utf8').trim();
// Bêta (v1.28.0-beta.3) : d'abord ce qu'elle apporte depuis la bêta précédente (journal de celle-ci en
// second argument), puis tout ce qui arrive dans la version ; version finale : toute sa section
const beta = /-beta\.\d+$/.test(tag);
const prev = beta && process.argv[3] && fs.existsSync(process.argv[3]) ? changelogFor(fs.readFileSync(process.argv[3], 'utf8'), tag) : null;
const fresh = prev ? newItems(prev.body, entry.body) : null;
const notes = !beta ? `## Nouveautés de la version ${entry.version}\n\n${entry.body}`
  : `> Version bêta (de test) : reçue seulement par les applis inscrites aux bêtas (Réglages → Application).\n\n${
    prev ? `## Nouveau dans cette bêta\n\n${fresh || 'Corrections et réglages, sans nouveauté visible.'}\n\n## Tout ce qui arrive dans la version ${entry.version}\n\n${entry.body}`
      : `## Nouveautés de la version ${entry.version} (bêta)\n\n${entry.body}`}`;
process.stdout.write(`${notes}\n\n---\n\n${footer}\n`);
