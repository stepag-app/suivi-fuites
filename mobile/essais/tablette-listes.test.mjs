// Lot TP : la liste des applis cachées par la politique de l'appli (Politique.kt, SERVICES_CACHES) est celle du ménage
// par câble (outils/tablettes/applis-retirees.txt + applis-desactivees.txt). Sans pile ni appareil.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (chemin) => readFileSync(join(racine, chemin), 'utf8');
const liste = (chemin) => lire(chemin).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

const kotlin = lire('mobile/modules/tablette-proprietaire/android/src/main/java/ma/stepag/tablette/Politique.kt');
const bloc = kotlin.match(/val SERVICES_CACHES = setOf\(([\s\S]*?)\n  \)/);
assert.ok(bloc, 'SERVICES_CACHES introuvable dans Politique.kt');
const politique = [...bloc[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const retirees = liste('outils/tablettes/applis-retirees.txt');
const desactivees = liste('outils/tablettes/applis-desactivees.txt');
const script = [...retirees, ...desactivees];

let ok = 0;
const verifier = (condition, message) => {
  assert.ok(condition, message);
  ok += 1;
};
verifier(new Set(politique).size === politique.length, 'doublon dans SERVICES_CACHES');
verifier(new Set(script).size === script.length, 'doublon dans les listes du script');
const manquentPolitique = script.filter((p) => !politique.includes(p));
const manquentScript = politique.filter((p) => !script.includes(p));
verifier(manquentPolitique.length === 0, `absentes de Politique.kt : ${manquentPolitique.join(', ')}`);
verifier(manquentScript.length === 0, `absentes des listes du script : ${manquentScript.join(', ')}`);
const gardees = ['ma.stepag.suivifuites', 'com.android.camera', 'com.google.android.apps.maps', 'com.google.android.dialer',
  'com.google.android.contacts', 'com.google.android.apps.messaging', 'com.whatsapp'];
verifier(!gardees.some((p) => script.includes(p)), 'une appli gardée figure dans les listes');
verifier(script.every((p) => /^[a-zA-Z][\w]*(\.[\w]+)+$/.test(p)), 'nom de paquet invalide');
console.log(`${ok} vérifications réussies, 0 en échec (${politique.length} paquets)`);
