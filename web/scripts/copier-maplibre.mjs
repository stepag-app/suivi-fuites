// Copie MapLibre GL JS (modules ES déjà minifiés) dans public/maplibre/, servi tel quel.
// Pourquoi : la version 6 charge son « worker » à côté de son propre fichier (import.meta.url),
// ce que webpack casse en l'intégrant au bundle. Servie à part, la page /carte l'importe à la
// demande et le navigateur partage le module commun entre la page et le worker.
// Lancé avant `npm run dev` et `npm run build` (scripts predev / prebuild) ; dossier ignoré par git.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(racine, 'node_modules', 'maplibre-gl');
const cible = join(racine, 'public', 'maplibre');
mkdirSync(cible, { recursive: true });
for (const f of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs']) {
  copyFileSync(join(source, 'dist', f), join(cible, f));
}
copyFileSync(join(source, 'LICENSE.txt'), join(cible, 'LICENSE.txt'));
const { version } = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
console.log(`MapLibre GL JS ${version} copié dans public/maplibre/`);
