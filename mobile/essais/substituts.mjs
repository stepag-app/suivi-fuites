// Chargé par « node --import » avant l'essai sans pile : Node lit directement les .ts de src/ (types
// retirés à la volée, Node 22.18 ou plus) et les modules natifs sont remplacés par ceux de mocks/.
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import os from 'node:os';
import path from 'node:path';

process.env.H ??= fs.mkdtempSync(path.join(os.tmpdir(), 'essai-tablette-'));

const mocks = new URL('./mocks/', import.meta.url);
const SUBSTITUTS = {
  '@react-native-async-storage/async-storage': 'as.js',
  'expo-file-system/legacy': 'fs.js',
  'expo-crypto': 'expo.js',
  'expo-image-manipulator': 'expo.js',
  'expo-image-picker': 'expo.js',
  'expo-location': 'expo.js',
};

registerHooks({
  resolve(specifier, context, suivant) {
    if (SUBSTITUTS[specifier]) return { url: new URL(SUBSTITUTS[specifier], mocks).href, shortCircuit: true };
    if (specifier === './supabase' && context.parentURL?.includes('/src/')) {
      return { url: new URL('supabase-simule.js', mocks).href, shortCircuit: true };
    }
    if (specifier.startsWith('.') && !path.extname(specifier)) return suivant(`${specifier}.ts`, context);
    return suivant(specifier, context);
  },
});
