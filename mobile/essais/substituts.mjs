// Chargé par « node --import » avant l'essai sans pile : Node lit directement les .ts de src/ (types
// retirés à la volée, Node 22.18 ou plus) et les modules natifs sont remplacés par ceux de mocks/.
// Le client Supabase est le vrai (src/supabase.ts) ; seul le serveur est simulé (mocks/serveur-simule.js).
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import os from 'node:os';
import path from 'node:path';

process.env.H ??= fs.mkdtempSync(path.join(os.tmpdir(), 'essai-tablette-'));
// Adresse et clé anonyme de l'essai : aucune requête ne quitte la machine (fetch simulé), jamais les vraies valeurs.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://essai.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'cle-anonyme-essai';

const mocks = new URL('./mocks/', import.meta.url);
const SUBSTITUTS = {
  '@react-native-async-storage/async-storage': 'as.js',
  'expo-file-system/legacy': 'fs.js',
  'expo-crypto': 'expo.js',
  'expo-image-manipulator': 'expo.js',
  'expo-image-picker': 'expo.js',
  'expo-location': 'expo.js',
  'expo-task-manager': 'expo.js',
  'react-native': 'react-native.js',
  'react-native-url-polyfill/auto': 'vide.js',
};

registerHooks({
  resolve(specifier, context, suivant) {
    if (SUBSTITUTS[specifier]) return { url: new URL(SUBSTITUTS[specifier], mocks).href, shortCircuit: true };
    if (specifier === './supabase' && context.parentURL?.includes('/src/')) {
      return { url: new URL('supabase-simule.js', mocks).href, shortCircuit: true };
    }
    // Imports sans extension du code de l'appli (« ./reseau ») ; les bibliothèques gardent les leurs.
    if (specifier.startsWith('.') && !path.extname(specifier) && !context.parentURL?.includes('/node_modules/')) {
      return suivant(`${specifier}.ts`, context);
    }
    return suivant(specifier, context);
  },
});
