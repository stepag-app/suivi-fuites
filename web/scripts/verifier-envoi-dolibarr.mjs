// Vérification de l'état de la synchronisation Dolibarr (X8) lu dans le journal envois_dolibarr : jamais reçu, en service,
// en retard au-delà d'une heure, en erreur après le dernier passage réussi, libellés du journal et du bouton
// « Synchroniser maintenant ».
// Lancement, dans web/ : node scripts/verifier-envoi-dolibarr.mjs (Node 22.18 ou plus récent).
import assert from 'node:assert/strict';

const env = await import('../src/lib/dolibarr/envoi-auto.ts');

let n = 0;
const ok = (nom, fn) => {
  fn();
  n++;
  console.log(`ok ${n} - ${nom}`);
};

const MAINTENANT = new Date('2026-10-12T10:00:00Z');
const il_y_a = (min) => new Date(MAINTENANT.getTime() - min * 60000).toISOString();
let id = 0;
const envoi = (p) => {
  id++;
  const d = p.dernier_le ?? il_y_a(5);
  return {
    id, recu_le: p.recu_le ?? d, dernier_le: d, appels: 1, statut: 'rien', origine: 'fonction', mouvements: 0, nouveaux: 0,
    modifies: 0, ignores: 0, dernier_dolibarr_id: null, date_max: null, message: null, poste: 'SRV-DOLIBARR', version_script: '1.0', ...p,
  };
};

ok('aucun envoi : jamais reçu', () => {
  const r = env.resumerEnvois([], MAINTENANT);
  assert.equal(r.etat, 'jamais');
  assert.equal(r.dernierContact, null);
  assert.equal(r.minutesDepuisContact, null);
});

ok('passage récent sans nouveauté : en service, dernier envoi = dernier « reçu »', () => {
  const recu = envoi({ statut: 'recu', dernier_le: il_y_a(200), mouvements: 4, nouveaux: 3, modifies: 1, dernier_dolibarr_id: 78009 });
  const rien = envoi({ statut: 'rien', dernier_le: il_y_a(4), appels: 12, mouvements: 2 });
  const r = env.resumerEnvois([recu, rien], MAINTENANT);
  assert.equal(r.etat, 'en_service');
  assert.equal(r.dernierRecu.id, recu.id);
  assert.equal(r.dernierSucces.id, rien.id);
  assert.equal(r.minutesDepuisContact, 4);
  assert.deepEqual(r.erreurs, []);
});

ok('plus d\'une heure sans nouvelles : en retard', () => {
  const r = env.resumerEnvois([envoi({ statut: 'rien', dernier_le: il_y_a(61) })], MAINTENANT);
  assert.equal(r.etat, 'en_retard');
  assert.equal(env.resumerEnvois([envoi({ statut: 'rien', dernier_le: il_y_a(60) })], MAINTENANT).etat, 'en_service');
});

ok('erreur après le dernier succès : en erreur, la plus récente d\'abord', () => {
  const succes = envoi({ statut: 'rien', dernier_le: il_y_a(50) });
  const e1 = envoi({ statut: 'erreur', origine: 'script', dernier_le: il_y_a(30), message: 'Lecture de Dolibarr impossible' });
  const e2 = envoi({ statut: 'erreur', dernier_le: il_y_a(10), appels: 3, message: '1 mouvement(s) sans identifiant…' });
  const r = env.resumerEnvois([e1, succes, e2], MAINTENANT);
  assert.equal(r.etat, 'en_erreur');
  assert.deepEqual(r.erreurs.map((e) => e.id), [e2.id, e1.id]);
  assert.equal(r.dernierContact, e2.dernier_le);
});

ok('erreur ancienne suivie d\'un passage réussi : en service', () => {
  const e = envoi({ statut: 'erreur', dernier_le: il_y_a(90), message: 'réseau' });
  const r = env.resumerEnvois([e, envoi({ statut: 'recu', dernier_le: il_y_a(2), nouveaux: 1, mouvements: 1 })], MAINTENANT);
  assert.equal(r.etat, 'en_service');
  assert.equal(r.erreurs.length, 0);
});

ok('erreurs seules (aucun succès) : toutes listées', () => {
  const r = env.resumerEnvois([envoi({ statut: 'erreur', message: 'a' }), envoi({ statut: 'erreur', message: 'b', dernier_le: il_y_a(20) })], MAINTENANT);
  assert.equal(r.etat, 'en_erreur');
  assert.equal(r.erreurs.length, 2);
  assert.equal(r.dernierSucces, null);
});

ok('durées lisibles', () => {
  assert.equal(env.depuis(null), '—');
  assert.equal(env.depuis(0), 'à l\'instant');
  assert.equal(env.depuis(14), 'il y a 14 min');
  assert.equal(env.depuis(60), 'il y a 1 h');
  assert.equal(env.depuis(125), 'il y a 2 h 05');
  assert.equal(env.depuis(60 * 72), 'il y a 3 jours');
});

ok('libellés du journal', () => {
  assert.equal(env.libelleEnvoi(envoi({ statut: 'recu', nouveaux: 1, mouvements: 1 })), '1 nouveau');
  assert.equal(env.libelleEnvoi(envoi({ statut: 'recu', nouveaux: 2, modifies: 1, ignores: 3, mouvements: 6 })),
    '2 nouveaux, 1 mis à jour, 3 ignorés (entrepôt non suivi)');
  assert.equal(env.libelleEnvoi(envoi({ statut: 'recu', modifies: 1, mouvements: 2 })), '1 mis à jour');
  assert.equal(env.libelleEnvoi(envoi({ statut: 'rien' })), 'rien de neuf');
  assert.equal(env.libelleEnvoi(envoi({ statut: 'rien', mouvements: 2 })), 'rien de neuf (2 mouvements relus)');
  assert.equal(env.libelleEnvoi(envoi({ statut: 'erreur', message: 'Jeton refusé' })), 'Jeton refusé');
  assert.equal(env.LIBELLES_ETAT.en_retard, 'En retard');
});

ok('erreur de lecture de l\'API : origine lisible', () => {
  const e = envoi({ statut: 'erreur', origine: 'api', message: 'Dolibarr injoignable' });
  const r = env.resumerEnvois([e], MAINTENANT);
  assert.equal(r.etat, 'en_erreur');
  assert.equal(env.LIBELLES_ORIGINE[r.erreurs[0].origine], 'lecture de Dolibarr');
  assert.equal(env.LIBELLES_ORIGINE.fonction, 'import');
});

ok('bilan du bouton « Synchroniser maintenant »', () => {
  const b = (p) => ({ statut: 'recu', mouvements: 0, nouveaux: 0, modifies: 0, ignores: 0, ...p });
  assert.equal(env.libelleBilan(b({ statut: 'rien', mouvements: 36 })), 'Synchronisé : rien de neuf (36 mouvements lus).');
  assert.equal(env.libelleBilan(b({ mouvements: 129, modifies: 93 })), 'Synchronisé : 93 mis à jour (129 mouvements lus).');
  assert.equal(env.libelleBilan(b({ mouvements: 36, nouveaux: 1, modifies: 2 })), 'Synchronisé : 1 nouveau, 2 mis à jour (36 mouvements lus).');
  assert.equal(env.libelleBilan(b({ statut: 'erreur', erreur: 'Dolibarr refuse la clé API' })), 'Lecture impossible : Dolibarr refuse la clé API');
  assert.match(env.libelleBilan(b({ statut: 'occupe', depuis: '2026-10-12T09:58:00Z' })), /^Une lecture est déjà en cours \(commencée à \d{2}:\d{2}\) : réessayez dans une minute\.$/);
  assert.equal(env.libelleBilan(b({ statut: 'occupe' })), 'Une lecture est déjà en cours : réessayez dans une minute.');
});

console.log(`\n${n} vérifications réussies.`);
