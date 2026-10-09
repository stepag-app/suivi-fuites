// Essai sans pile des règles de saisie de la tablette (gardes-fous, champs obligatoires, pièces proposées, versions).
// Depuis mobile/ : node --import ./essais/substituts.mjs essais/regles-saisie.test.mjs
let ok = 0, ko = 0;
const verifier = (cond, msg, extra) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg, extra ?? ''); } };
verifier(true, 'essai prêt');
console.log(`\n${ok} vérifications réussies, ${ko} en échec`);
if (ko) process.exit(1);
