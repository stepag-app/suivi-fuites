// Assemble l'essai avec les vrais modules de l'appli et des substituts pour React Native.
import * as esbuild from 'esbuild';
import path from 'node:path';
const ici = process.env.ICI; // dossier essais/ (le script est copié à côté d'esbuild)
const M = path.join(ici, 'mocks');
await esbuild.build({
  entryPoints: [path.join(ici, 'file-attente.test.mjs')], bundle: true, platform: 'node', format: 'esm',
  outfile: path.join(process.env.H, 'essai.mjs'), nodePaths: [path.join(ici, '..', 'node_modules')], logLevel: 'warning',
  plugins: [{ name: 'substituts', setup(b) {
    b.onResolve({ filter: /^@react-native-async-storage\/async-storage$/ }, () => ({ path: `${M}/as.js` }));
    b.onResolve({ filter: /^expo-file-system\/legacy$/ }, () => ({ path: `${M}/fs.js` }));
    b.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: `${M}/supabase.js` }));
  } }],
});
