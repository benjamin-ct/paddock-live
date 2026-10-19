// Paquets de l'extension Paddock Live Companion à envoyer aux boutiques :
// paddock-live-companion-<version>-chrome.zip (Chrome, Edge) et …-firefox.zip, dont le manifeste n'a
// que background.scripts (Firefox signale service_worker comme non pris en charge).
// Usage : node scripts/extension-zip.mjs [dossier de sortie, par défaut la racine du dépôt]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'extension');
const out = path.resolve(process.argv[2] || root);
const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
const firefox = { ...manifest, background: { scripts: manifest.background.scripts } };

for (const [name, m] of [['chrome', manifest], ['firefox', firefox]]) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plc-'));
  fs.cpSync(src, tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  const zip = path.join(out, `paddock-live-companion-${manifest.version}-${name}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', '-X', zip, '.'], { cwd: tmp });
  fs.rmSync(tmp, { recursive: true });
  console.log(zip);
}
