// Essai SANS pile Supabase (ni Docker, ni dépendance à installer) de la file d'attente de la tablette :
// vrai code de src/file-attente.ts, src/modification.ts et src/photos.ts ; base, stockage, fichiers et
// réseau simulés (mocks/supabase-simule.js). Depuis mobile/ :
//   node --import ./essais/substituts.mjs essais/file-attente-hors-pile.test.mjs
import fs from 'node:fs';
import { abandonner, ajouterEnvoi, dependants, lireAttente, mettreEnAttente, synchroniser } from '../src/file-attente.ts';
import { appliquer, aucunChangement, differences } from '../src/modification.ts';
import { simulation as sim } from './mocks/supabase-simule.js';

let ok = 0, ko = 0;
const verifier = (cond, msg, extra) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg, extra ?? ''); } };
const uuid = () => crypto.randomUUID();
const D = `${process.env.H}/docs/attente/`;
fs.mkdirSync(D, { recursive: true });
// photos.ts lit le fichier local par fetch(file://…)
globalThis.fetch = (u) => Promise.resolve(new Response(fs.readFileSync(String(u).replace(/^file:\/\//, ''))));
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
  pieces: [{ id: 'p1', piece_id: 'c1', designation: 'Collier', quantite: 2 }],
  ouvriers: ['o1'],
};
const apres = {
  ligne: { ...avant.ligne, realisee_le: '2026-10-05T08:30:00.000Z', fouille_longueur_m: 1.5, observation: '' },
  pieces: [{ ...avant.pieces[0], quantite: 3 }, { id: 'p2', piece_id: null, designation: 'Raccord', quantite: 1 }],
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
const M = 'marche-essai';
const F = uuid(), R = uuid(), P1 = uuid(), P2 = uuid();
await mettreEnAttente({ id: F, marche_id: M, position: null, photos: [photo('detection')], ligne: { adresse: 'Essai' } });
await ajouterEnvoi({
  type: 'reparation', id: R, marche_id: M, fuite_id: F, fuite_libelle: 'Fuite à envoyer', photos: [photo('avant')],
  pieces: [{ id: P1, piece_id: 'c1', designation: 'Collier', quantite: 1 }], ouvriers: ['o1'],
  ligne: { fuite_id: F, resultat: 'en_cours', realisee_le: new Date().toISOString(), fouille_longueur_m: 1 },
});
const etatR = { ligne: { resultat: 'en_cours', fouille_longueur_m: 1 }, pieces: [{ id: P1, piece_id: 'c1', designation: 'Collier', quantite: 1 }], ouvriers: ['o1'] };
const modif = {
  type: 'modification', marche_id: M, fuite_id: F, fuite_libelle: 'Fuite à envoyer', reparation_id: R,
  changements: differences(etatR, {
    ligne: { resultat: 'reparee', fouille_longueur_m: 2.5 },
    pieces: [{ id: P1, piece_id: 'c1', designation: 'Collier', quantite: 4 }, { id: P2, piece_id: null, designation: 'Raccord', quantite: 1 }],
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
sim.coupureDans = 9; // la 10e requête (pièce ajoutée par la modification) tombe
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

console.log(`\n${ok} vérifications réussies, ${ko} en échec`);
process.exit(ko ? 1 : 0);
