// Essai SANS pile Supabase (ni Docker, ni dépendance à installer) de la file d'attente de la tablette :
// vrai code de src/file-attente.ts, src/modification.ts, src/photos.ts et src/reseau.ts, vrai client Supabase pour la
// connexion (src/supabase.ts) ; base, stockage, fichiers et réseau simulés (mocks/serveur-simule.js). Depuis mobile/ :
//   node --import ./essais/substituts.mjs essais/file-attente-hors-pile.test.mjs
import fs from 'node:fs';
import { abandonner, ajouterEnvoi, dependants, lireAttente, mettreEnAttente, surChangement, synchroniser } from '../src/file-attente.ts';
import { appliquer, aucunChangement, differences } from '../src/modification.ts';
import { avecDelai, DELAI_API_MS, DELAI_PHOTO_MS } from '../src/reseau.ts';
import { simulation as sim } from './mocks/supabase-simule.js';

let ok = 0, ko = 0;
const verifier = (cond, msg, extra) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg, extra ?? ''); } };
const uuid = () => crypto.randomUUID();
const D = `${process.env.H}/docs/attente/`;
fs.mkdirSync(D, { recursive: true });
const photo = (type) => {
  const id = uuid();
  const f = `${D}${id}.jpg`;
  fs.writeFileSync(f, 'jpeg');
  return { id, fichier: `file://${f}`, largeur: 10, hauteur: 10, taille: 4, prise_le: new Date().toISOString(), type };
};
const VIDE = { ligne: {}, pieces_ajoutees: [], pieces_retirees: [], quantites: [], ouvriers_ajoutes: [], ouvriers_retires: [] };

console.log('1. Changements d\'une réparation (modification.ts)');
const avant = {
  ligne: { resultat: 'reparee', realisee_le: '2026-10-05T08:30:00+00:00', fouille_longueur_m: 1.2, observation: null, equipe_id: 'e1' },
  pieces: [{ id: 'p1', produit_id: 101, designation: 'Collier', quantite: 2 }],
  ouvriers: ['o1'],
};
const apres = {
  ligne: { ...avant.ligne, realisee_le: '2026-10-05T08:30:00.000Z', fouille_longueur_m: 1.5, observation: '' },
  pieces: [{ ...avant.pieces[0], quantite: 3 }, { id: 'p2', produit_id: null, designation: 'Raccord', quantite: 1 }],
  ouvriers: ['o2'],
};
const c = differences(avant, apres);
verifier(JSON.stringify(c.ligne) === '{"fouille_longueur_m":1.5}', 'seuls les champs vraiment changés partent (même instant, vide = nul)', c.ligne);
verifier(c.quantites.length === 1 && c.quantites[0].quantite === 3 && c.pieces_ajoutees.map((p) => p.id).join() === 'p2' && !c.pieces_retirees.length,
  'pièces : une requantifiée, une ajoutée');
verifier(c.ouvriers_ajoutes.join() === 'o2' && c.ouvriers_retires.join() === 'o1', 'ouvriers : un ajouté, un retiré');
const refait = appliquer(avant, c);
verifier(JSON.stringify(refait.pieces) === JSON.stringify(apres.pieces) && refait.ouvriers.join() === 'o2' && refait.ligne.fouille_longueur_m === 1.5,
  'appliquer(avant, changements) redonne l\'état saisi');
verifier(aucunChangement(differences(avant, avant)), 'rien de changé : aucune modification à envoyer');

console.log('2. Modification et photos d\'une réparation encore en attente : envoyées après elle, coupures comprises');
sim.remettre();
sim.utilisateur = 'chef';
sim.droits = { modifier: 'siennes', supprimer: 'non' };
await sim.connecter(); // l'agent est connecté : jeton valide une heure
const M = 'marche-essai';
const F = uuid(), R = uuid(), P1 = uuid(), P2 = uuid();
await mettreEnAttente({ id: F, marche_id: M, position: null, photos: [photo('detection')], ligne: { adresse: 'Essai' } });
await ajouterEnvoi({
  type: 'reparation', id: R, marche_id: M, fuite_id: F, fuite_libelle: 'Fuite à envoyer', photos: [photo('avant')],
  pieces: [{ id: P1, produit_id: 101, designation: 'Collier', quantite: 1 }], ouvriers: ['o1'],
  ligne: { fuite_id: F, resultat: 'en_cours', realisee_le: new Date().toISOString(), fouille_longueur_m: 1 },
});
const etatR = { ligne: { resultat: 'en_cours', fouille_longueur_m: 1 }, pieces: [{ id: P1, produit_id: 101, designation: 'Collier', quantite: 1 }], ouvriers: ['o1'] };
const modif = {
  type: 'modification', marche_id: M, fuite_id: F, fuite_libelle: 'Fuite à envoyer', reparation_id: R,
  changements: differences(etatR, {
    ligne: { resultat: 'reparee', fouille_longueur_m: 2.5 },
    pieces: [{ id: P1, produit_id: 101, designation: 'Collier', quantite: 4 }, { id: P2, produit_id: null, designation: 'Raccord', quantite: 1 }],
    ouvriers: ['o2'],
  }),
};
await ajouterEnvoi({ ...modif, id: uuid(), photos: [photo('apres')] });
await ajouterEnvoi({ type: 'photos', id: uuid(), marche_id: M, fuite_id: F, fuite_libelle: 'Fuite à envoyer', reparation_id: R, photos: [photo('pendant')] });
await ajouterEnvoi({ type: 'photos', id: uuid(), marche_id: M, fuite_id: F, fuite_libelle: 'Fuite à envoyer', photos: [photo('detection')] });
sim.reseau = false;
let reste = await synchroniser();
verifier(reste === 5 && (await lireAttente()).every((e) => !e.erreur), 'sans réseau : 5 envois gardés, aucune erreur');
sim.reseau = true;
sim.coupureDans = 11; // la 12e requête (pièce ajoutée par la modification) tombe ; l'appel à photos-r2 d'une photo compte
reste = await synchroniser();
const coupe = await lireAttente();
verifier(reste === 3 && coupe[0].type === 'modification' && coupe[0].fait?.ligne === true && coupe.every((e) => !e.erreur),
  'coupure en pleine modification : champs déjà modifiés, reprise notée, pas d\'erreur', coupe);
sim.reseau = true;
sim.coupureDans = null;
reste = await synchroniser();
verifier(reste === 0, 'retour du réseau : tout est envoyé', await lireAttente());
verifier(sim.journal.indexOf('reparations:insert') < sim.journal.indexOf('reparations:update'), 'la réparation est créée avant d\'être modifiée');
verifier(sim.journal.filter((x) => x === 'reparations:update').length === 1, 'les champs ne sont pas renvoyés à la reprise');
const rep = sim.tables.reparations.find((r) => r.id === R);
verifier(rep.resultat === 'reparee' && rep.fouille_longueur_m === 2.5, 'champs modifiés enregistrés');
const posees = sim.tables.reparation_pieces.filter((p) => p.reparation_id === R && !p.supprime_le);
verifier(posees.length === 2 && posees.find((p) => p.id === P1)?.quantite === 4, 'pièces : quantité corrigée, pièce ajoutée');
verifier(sim.tables.reparation_ouvriers.map((o) => o.ouvrier_id).join() === 'o2', 'ouvriers : o1 retiré, o2 ajouté');
const photos = sim.tables.photos;
verifier(photos.length === 5 && photos.filter((p) => p.reparation_id === R).map((p) => p.type).sort().join() === 'apres,avant,pendant',
  '5 photos, dont avant / pendant / après rattachées à la réparation');
verifier(photos.filter((p) => !p.reparation_id).every((p) => p.type === 'detection'), 'photos ajoutées à la fuite : type détection');
verifier(fs.readdirSync(D).length === 0, 'fichiers effacés de la tablette après confirmation');

console.log('3. Même modification renvoyée (réponse perdue) : rien en double');
await ajouterEnvoi({ ...modif, id: uuid(), photos: [] });
reste = await synchroniser();
verifier(reste === 0 && sim.tables.reparation_pieces.filter((p) => p.reparation_id === R).length === 2 && sim.tables.reparation_ouvriers.length === 1,
  'aucune pièce ni aucun ouvrier en double, aucune erreur');

console.log('4. Retrait d\'une pièce : refusé au chef (supprimer = non), accepté au responsable');
const F2 = uuid();
await ajouterEnvoi({ ...modif, id: uuid(), photos: [], changements: { ...VIDE, pieces_retirees: [P2] } });
await ajouterEnvoi({ type: 'photos', id: uuid(), marche_id: M, fuite_id: F, fuite_libelle: 'x', photos: [photo('detection')] });
await mettreEnAttente({ id: F2, marche_id: M, position: null, photos: [], ligne: { adresse: 'Autre fuite' } });
reste = await synchroniser();
const l4 = await lireAttente();
verifier(reste === 2 && /Droit insuffisant/.test(l4[0].erreur ?? ''), `retrait refusé, message clair : ${l4[0].erreur}`);
verifier(/saisie précédente/.test(l4[1].erreur ?? ''), 'la photo suivante de la même fuite attend');
verifier(sim.tables.fuites.some((f) => f.id === F2), 'une autre fuite part quand même');
sim.droits = { modifier: 'toutes', supprimer: 'toutes' };
reste = await synchroniser();
verifier(reste === 0 && !!sim.tables.reparation_pieces.find((p) => p.id === P2)?.supprime_le, 'responsable : pièce retirée (suppression logique), photo envoyée');

console.log('5. Portée « siennes » et absence de droit');
sim.droits = { modifier: 'siennes', supprimer: 'non' };
sim.tables.reparations.find((r) => r.id === R).saisi_par = 'collegue';
await ajouterEnvoi({ ...modif, id: uuid(), photos: [], changements: { ...VIDE, ligne: { observation: 'corrigée' } } });
reste = await synchroniser();
verifier(reste === 1 && /Droit insuffisant/.test((await lireAttente())[0].erreur ?? ''), 'réparation d\'un collègue : refusée, saisie gardée');
sim.droits = { modifier: 'non', supprimer: 'non' };
reste = await synchroniser();
verifier(reste === 1 && /Droit insuffisant/.test((await lireAttente())[0].erreur ?? '') && !rep.observation,
  'sans droit de modifier : la base ne touche rien sans le dire, la tablette le signale');
await abandonner((await lireAttente())[0].id);

console.log('6. Fuite verrouillée par un lot arrêté');
sim.droits = { modifier: 'toutes', supprimer: 'toutes' };
sim.verrouillees.add(F);
await ajouterEnvoi({ ...modif, id: uuid(), photos: [photo('apres')], changements: { ...VIDE, ligne: { observation: 'après le lot' } } });
await ajouterEnvoi({ type: 'photos', id: uuid(), marche_id: M, fuite_id: F, fuite_libelle: 'x', reparation_id: R, photos: [photo('pendant')] });
reste = await synchroniser();
const l6 = await lireAttente();
verifier(reste === 2 && /verrouillée \(lot d'attachement arrêté\)/.test(l6[0].erreur ?? ''), `modification refusée : ${l6[0].erreur}`);
verifier(/saisie précédente/.test(l6[1].erreur ?? '') && l6.every((e) => e.photos.every((p) => fs.existsSync(p.fichier.slice(7)))),
  'photos suivantes en attente, fichiers gardés sur la tablette');
for (const e of l6) await abandonner(e.id);
sim.verrouillees.clear();

console.log('7. Abandon d\'une réparation encore sur la tablette : ses modifications et photos partent avec elle');
sim.reseau = false;
const R2 = uuid();
await ajouterEnvoi({ type: 'reparation', id: R2, marche_id: M, fuite_id: F2, fuite_libelle: 'x', photos: [photo('avant')], pieces: [], ouvriers: [],
  ligne: { fuite_id: F2, resultat: 'en_cours' } });
await ajouterEnvoi({ ...modif, id: uuid(), fuite_id: F2, reparation_id: R2, photos: [photo('apres')], changements: { ...VIDE, ligne: { resultat: 'reparee' } } });
await ajouterEnvoi({ type: 'photos', id: uuid(), marche_id: M, fuite_id: F2, fuite_libelle: 'x', reparation_id: R2, photos: [photo('pendant')] });
await ajouterEnvoi({ type: 'photos', id: uuid(), marche_id: M, fuite_id: F2, fuite_libelle: 'x', photos: [photo('detection')] });
verifier((await dependants(R2)).length === 2, 'dépendants : la modification et la photo de cette réparation, pas la photo de la fuite');
await abandonner(R2);
const l7 = await lireAttente();
verifier(l7.length === 1 && l7[0].type === 'photos' && !l7[0].reparation_id && fs.readdirSync(D).length === 1,
  'abandon : 3 saisies et leurs photos effacées, la photo de la fuite reste');
sim.reseau = true;
reste = await synchroniser();
verifier(reste === 0 && fs.readdirSync(D).length === 0, 'la photo de la fuite part au retour du réseau');

console.log('8. Les écrans ne rechargent qu\'à un vrai changement de la file (synchro des 30 s au repos)');
let prevenus = 0;
const arreter = surChangement(() => { prevenus += 1; });
sim.journal = [];
reste = await synchroniser();
verifier(reste === 0 && prevenus === 0 && sim.journal.length === 0, 'file vide : aucune requête, aucun écran prévenu', { prevenus, journal: sim.journal });
sim.reseau = false;
await mettreEnAttente({ id: uuid(), marche_id: M, position: null, photos: [], ligne: { adresse: 'Sans réseau' } });
prevenus = 0;
reste = await synchroniser();
verifier(reste === 1 && prevenus === 0, 'sans réseau : file inchangée, aucun écran prévenu', prevenus);
sim.reseau = true;
reste = await synchroniser();
verifier(reste === 0 && prevenus === 1, 'envoi fait : écrans prévenus une fois (statuts recalculés par le serveur)', prevenus);
sim.verrouillees.add(F);
await ajouterEnvoi({ ...modif, id: uuid(), photos: [], changements: { ...VIDE, ligne: { observation: 'refusée' } } });
await ajouterEnvoi({ type: 'photos', id: uuid(), marche_id: M, fuite_id: F, fuite_libelle: 'x', photos: [photo('detection')] });
prevenus = 0;
await synchroniser();
const auRefus = prevenus;
await synchroniser();
await synchroniser();
verifier(auRefus === 1 && prevenus === 1, 'saisie refusée : prévenus au refus, pas à chaque nouvel essai (même erreur, rien de réécrit)', { auRefus, prevenus });
for (const e of await lireAttente()) await abandonner(e.id);
sim.verrouillees.clear();
arreter();

console.log('9. Requête sans réponse (connexion 4G morte) : abandonnée au délai, la file d\'attente repart');
// Horloge simulée le temps de cette section (setTimeout / clearTimeout) : les délais passent d'un coup.
const minuteurs = new Map();
let maintenant = 0, numero = 0;
const [vraiSetTimeout, vraiClearTimeout] = [globalThis.setTimeout, globalThis.clearTimeout];
globalThis.setTimeout = (f, ms) => { minuteurs.set(++numero, { f, echeance: maintenant + ms }); return numero; };
globalThis.clearTimeout = (n) => void minuteurs.delete(n);
const avancer = (ms) => {
  maintenant += ms;
  for (const [n, m] of [...minuteurs]) if (m.echeance <= maintenant) { minuteurs.delete(n); m.f(); }
};
// Laisse avancer les promesses en cours, par microtâches seulement, comme tout cet essai (un passage par la boucle
// d'événements ferait seulement afficher l'avertissement de Node sur le type de module des .ts).
const tour = async () => { for (let i = 0; i < 1000; i++) await null; };
const attendreBlocage = async () => { for (let i = 0; i < 1000 && !sim.sansReponse; i++) await null; };
const suivre = (p) => { const e = { finie: false, reste: null }; p.then((n) => { e.finie = true; e.reste = n; }); return e; };
const F3 = uuid();
await mettreEnAttente({ id: F3, marche_id: M, position: null, photos: [photo('detection')], ligne: { adresse: 'Connexion morte' } });
sim.sansReponseDans = 0; // la création de la fuite part, la réponse ne revient jamais
const bloquee = synchroniser();
const s1 = suivre(bloquee);
await attendreBlocage();
verifier(sim.sansReponse === 1 && synchroniser() === bloquee,
  'en attente de réponse : une synchro de plus (minuteur des 30 s, retour sur l\'appli, « Envoyer maintenant ») rejoint celle en cours');
avancer(DELAI_API_MS - 1);
await tour();
verifier(!s1.finie, `toujours en attente juste avant ${DELAI_API_MS / 1000} s`);
avancer(1);
await tour();
const l9 = await lireAttente();
verifier(s1.reste === 1 && !l9[0].erreur && sim.sansReponse === 0,
  `abandonnée à ${DELAI_API_MS / 1000} s : synchro terminée, fuite gardée sur la tablette sans message (comptée comme coupure)`, l9);
if (!s1.finie) process.exit(1); // file d'attente figée : la suite de l'essai attendrait sans fin
reste = await synchroniser();
verifier(reste === 0 && sim.tables.fuites.some((f) => f.id === F3) && fs.readdirSync(D).length === 0, 'synchro suivante : la fuite et sa photo partent');
const F4 = uuid();
await mettreEnAttente({ id: F4, marche_id: M, position: null, photos: [photo('detection')], ligne: { adresse: 'Photo sans réponse' } });
sim.sansReponseDans = 2; // la fuite et l'appel à photos-r2 (« non configuré ») passent, le dépôt de la photo reste sans réponse
const lente = synchroniser();
const s2 = suivre(lente);
await attendreBlocage();
avancer(DELAI_API_MS);
await tour();
verifier(!s2.finie, `envoi d'une photo : encore attendu à ${DELAI_API_MS / 1000} s (délai des photos plus long)`);
avancer(DELAI_PHOTO_MS - DELAI_API_MS);
await tour();
const l9b = await lireAttente();
verifier(s2.reste === 1 && l9b[0].fait?.ligne === true && !l9b[0].erreur && fs.existsSync(l9b[0].photos[0].fichier.slice(7)),
  `photo abandonnée à ${DELAI_PHOTO_MS / 60000} min : fuite déjà créée (reprise notée), photo gardée sur la tablette, sans message`, l9b);
if (!s2.finie) process.exit(1);
reste = await synchroniser();
verifier(reste === 0 && sim.tables.photos.some((p) => p.fuite_id === F4) && fs.readdirSync(D).length === 0,
  'synchro suivante : la photo part, fichier effacé de la tablette');
let recu;
const repond = (_adresse, init) => { recu = init?.signal; return Promise.resolve(new Response('[]')); };
const propre = new AbortController().signal;
await avecDelai(repond)('/rest/v1/v_fuites', { signal: propre });
verifier(recu === propre && minuteurs.size === 0, 'requête avec son propre signal (liste des fuites : 20 s) : signal gardé tel quel, pas de second délai');
await avecDelai(repond)('/rest/v1/fuites', { method: 'POST', body: '{}' });
verifier(minuteurs.size === 0 && !recu.aborted, 'réponse reçue à temps : délai annulé aussitôt, aucun minuteur laissé');
const muet = (_adresse, init) => new Promise((_, ko) => init?.signal?.addEventListener('abort', () => ko(new Error('fetch failed'))));
let erreur = null;
avecDelai(muet)('/rest/v1/fuites').catch((e) => { erreur = e; });
avancer(DELAI_API_MS);
await tour();
verifier(erreur?.name === 'AbortError' && /timeout/.test(erreur.message),
  'abandon par le délai : AbortError (supabase-js ne relance pas une lecture sur la même connexion morte)', erreur);
globalThis.setTimeout = vraiSetTimeout;
globalThis.clearTimeout = vraiClearTimeout;

verifier(!sim.sansJeton.length, 'toutes les requêtes de données ont porté le jeton de la session (jamais la clé anonyme)', sim.sansJeton);

console.log(`\n${ok} vérifications réussies, ${ko} en échec`);
process.exit(ko ? 1 : 0);
