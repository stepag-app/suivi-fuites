// Essai sans pile des règles de saisie de la tablette (src/regles.ts) : champs obligatoires (F1), gardes-fous (P6, P9),
// pièces proposées (P3), droit de modifier une étape ou une photo (V2, V3, V6), version (X2), texte des notifications.
// Depuis mobile/ : node --import ./essais/substituts.mjs essais/regles-saisie.test.mjs
import {
  champsExiges, champsManquants, CHAMPS_FUITE_DEFAUT, compterUsage, gardeFousRefection, gardeFousReparation, peutChangerPhoto,
  peutModifierEtape, piecesProposees, texteNotification, versionPlusRecente,
} from '../src/regles.ts';

let ok = 0, ko = 0;
const verifier = (cond, msg, extra) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg, extra ?? ''); } };

console.log('1. Champs obligatoires d\'une nouvelle fuite (F1)');
verifier(champsExiges({ champs_obligatoires_fuite: [] }).join() === CHAMPS_FUITE_DEFAUT.join(), 'liste du marché vide (suspendue) : règle F1 par défaut');
verifier(champsExiges({ champs_obligatoires_fuite: ['reference_srm'] }).join() === 'reference_srm', 'liste du marché : appliquée telle quelle');
verifier(champsExiges(null).length === 5, 'marché inconnu : règle F1');
const manquants = champsManquants({ reference_srm: '  ', secteur_id: 's', ouvrage: null, visibilite: 'visible' }, CHAMPS_FUITE_DEFAUT);
verifier(manquants.join() === 'reference_srm,ouvrage,nature_degradation_id', 'texte blanc, nul ou absent : manquant', manquants);

console.log('2. Gardes-fous de la réparation (P6, Q10, Q10 bis)');
let a = gardeFousReparation({ fouille_longueur_m: 1.2, fouille_largeur_m: 0.8, fouille_profondeur_m: 1 });
verifier(a.length === 0, 'fouille plausible : aucun avertissement', a);
a = gardeFousReparation({ fouille_longueur_m: 80, fouille_largeur_m: 0.8, fouille_profondeur_m: 1, element_remplace: true });
verifier(a.length === 1 && /Longueur de la fouille : 80 m, au-delà de 10 m/.test(a[0]), '80 au lieu de 0,80 : avertissement en mètres', a);
a = gardeFousReparation({ fouille_longueur_m: 1, fouille_largeur_m: 3.5, fouille_profondeur_m: 4 });
verifier(a.length === 2, 'largeur > 3 m et profondeur > 3 m : deux avertissements', a);
a = gardeFousReparation({ fouille_longueur_m: 3, fouille_largeur_m: 1, fouille_profondeur_m: 1 });
verifier(a.length === 1 && /2 m/.test(a[0]), 'fouille > 2 m sans élément remplacé : à justifier', a);
a = gardeFousReparation({ fouille_longueur_m: 1.5, fouille_largeur_m: 0.6, longueur_pe_m: 0.4 });
verifier(a.length === 1 && /plus courte que la plus petite dimension de la fouille \(0,6 m\)/.test(a[0]), 'conduite posée < plus petite dimension', a);
a = gardeFousReparation({ fouille_longueur_m: 1.5, fouille_largeur_m: 0.6, longueur_pe_m: 2 });
verifier(a.length === 1 && /plus longue que la plus grande dimension de la fouille \(1,5 m\)/.test(a[0]), 'conduite posée > plus grande dimension', a);
a = gardeFousReparation({ fouille_longueur_m: 1.5, fouille_largeur_m: 0.6, longueur_pe_m: 1 });
verifier(a.length === 0, 'conduite posée entre les deux : rien', a);

console.log('3. Gardes-fous de la réfection (P9, réfection > 30 m²)');
const fuite = { fouilles: [{ fouille_longueur_m: 2, fouille_largeur_m: 1 }, { fouille_longueur_m: 1, fouille_largeur_m: 1 }], refections: [] };
a = gardeFousRefection({ longueur: 2, largeur: 1, faite: true }, fuite);
verifier(a.length === 1 && /\(2 m²\) inférieur au total des fouilles \(3 m²\)/.test(a[0]), 'total des réfections < total des fouilles', a);
a = gardeFousRefection({ longueur: 1, largeur: 1, faite: true }, { ...fuite, refections: [{ longueur_m: 2, largeur_m: 1 }] });
verifier(a.length === 0, 'avec la réfection déjà saisie : totaux égaux, rien', a);
a = gardeFousRefection({ longueur: null, largeur: null, faite: true }, { fouilles: [{ fouille_longueur_m: 2, fouille_largeur_m: 1 }], refections: [], fouilleReprise: { fouille_longueur_m: 2, fouille_largeur_m: 1 } });
verifier(a.length === 0, 'dimensions vides : reprises de la fouille, rien', a);
a = gardeFousRefection({ longueur: 8, largeur: 5, faite: true }, { fouilles: [], refections: [] });
verifier(a.length === 1 && /40 m², au-delà de 30 m²/.test(a[0]), 'réfection de 40 m² : avertissement', a);
verifier(gardeFousRefection({ longueur: 80, largeur: 50, faite: false }, fuite).length === 0, 'réfection non faite : aucun contrôle');

console.log('4. Pièces proposées (P3)');
const pieces = [
  { id: 1, designation: 'Collier de prise en charge PEHD 63/20' },
  { id: 2, designation: 'Manchon électrosoudable PE 63' },
  { id: 3, designation: 'Manchon PVC 63' },
  { id: 4, designation: 'Collier de réparation fonte DN100' },
  { id: 5, designation: 'Robinet de prise 1/2"' },
  { id: 6, designation: 'Bouche à clé' },
  { id: 7, designation: 'Tube PE 110 PN10' },
  { id: 8, designation: 'Té égal 630' },
];
const usage = compterUsage([{ produit_id: 6 }, { produit_id: 6 }, { produit_id: 3 }, { produit_id: null }, { produit_id: 2 }]);
verifier(usage[6] === 2 && usage[3] === 1 && !(null in usage), 'usage compté par article');
let p = piecesProposees(pieces, { materiau: 'polyethylene', diametre: 63, usage });
verifier(p.adaptees.map((x) => x.id).join() === '2,1,3', 'Ø 63 PE : PE d\'abord (le plus posé en tête), puis PVC 63 ; pas « 630 »', p.adaptees.map((x) => x.id));
verifier(p.frequentes.map((x) => x.id).join() === '6', 'les plus utilisées : celles qui ne sont pas déjà proposées', p.frequentes);
p = piecesProposees(pieces, { materiau: 'fonte_ductile', diametre: 100, usage, exclues: [4] });
verifier(p.adaptees.length === 0, 'article déjà ajouté : plus proposé');
p = piecesProposees(pieces, { materiau: 'acier_galvanise', diametre: 15, usage });
verifier(p.adaptees.map((x) => x.id).join() === '5', 'acier galvanisé Ø 15 : désignation en pouces (1/2")');
p = piecesProposees(pieces, { materiau: 'pvc', usage });
verifier(p.adaptees.map((x) => x.id).join() === '3', 'matériau sans diamètre : articles du matériau');
p = piecesProposees(pieces, { usage });
verifier(!p.adaptees.length && p.frequentes.map((x) => x.id).join() === '6,2,3', 'ni matériau ni diamètre : les plus utilisées seulement');

console.log('5. Modifier une étape ou une photo (V2, V3, V6)');
const peutDe = (droits) => (type, action, auteurs) => {
  const d = droits[`${type}:${action}`];
  if (action === 'modifier' || action === 'supprimer') return d === 'toutes' || (d === 'siennes' && (!auteurs || auteurs.includes('moi')));
  return !!d;
};
const chef = peutDe({ 'interventions:modifier': 'siennes', 'photos:modifier': 'siennes', 'photos:supprimer': 'siennes' });
const resp = peutDe({ 'interventions:modifier': 'toutes', 'interventions:valider': true, 'photos:valider': true });
verifier(peutModifierEtape({ auteurs: ['moi', 'moi'] }, { type: 'interventions', peut: chef }), 'avant validation : l\'auteur modifie');
verifier(!peutModifierEtape({ auteurs: ['autre', 'autre'] }, { type: 'interventions', peut: chef }), 'saisie d\'un collègue : non');
verifier(!peutModifierEtape({ validee_le: '2026-10-09T08:00:00Z', auteurs: ['moi'] }, { type: 'interventions', peut: chef }), 'validée : l\'auteur ajoute seulement');
verifier(peutModifierEtape({ validee_le: '2026-10-09T08:00:00Z', auteurs: ['autre'] }, { type: 'interventions', peut: resp }), 'validée : le responsable modifie');
const verrou = '2026-10-09T10:00:00Z';
verifier(!peutModifierEtape({ cree_le: '2026-10-09T09:00:00Z', auteurs: ['moi'] }, { type: 'interventions', peut: chef, verrouilleeLe: verrou }),
  'fuite verrouillée : saisie antérieure au lot figée');
verifier(peutModifierEtape({ cree_le: '2026-10-09T11:00:00+00:00', auteurs: ['moi'] }, { type: 'interventions', peut: chef, verrouilleeLe: verrou }),
  'fuite verrouillée : ajout postérieur au lot modifiable par son auteur (V6)');
verifier(peutModifierEtape({}, { type: 'interventions', peut: chef, verrouilleeLe: verrou }), 'saisie encore sur la tablette : modifiable');
const photoAvant = { cree_le: '2026-10-09T07:00:00Z', saisi_par: 'moi' };
const photoApres = { cree_le: '2026-10-09T09:00:00Z', saisi_par: 'moi' };
const valideeLe = '2026-10-09T08:00:00Z';
verifier(!peutChangerPhoto(photoAvant, { action: 'supprimer', valideeLe, peut: chef }), 'photo antérieure à la validation : réservée au responsable');
verifier(peutChangerPhoto(photoApres, { action: 'supprimer', valideeLe, peut: chef }), 'photo postérieure à la validation : son auteur la retire');
verifier(peutChangerPhoto(photoAvant, { action: 'modifier', valideeLe, peut: resp }), 'responsable : toutes les photos');
verifier(!peutChangerPhoto({ ...photoApres, saisi_par: 'autre' }, { action: 'modifier', peut: chef }), 'photo d\'un collègue : non');

console.log('6. Version publiée (X2) et texte des notifications (N2)');
verifier(versionPlusRecente(107, 112) && !versionPlusRecente(112, 112) && !versionPlusRecente(null, 112) && !versionPlusRecente(107, undefined),
  'nouvelle version seulement si son numéro est plus grand');
const n = texteNotification({ evenement: 'reparation_validee', titre: 'x', corps: null, donnees: { numero: 12, adresse: 'Rue A', resultat: 'non_reparee' } });
verifier(n.titre === 'Fuite N° 12 non réparée, fouille validée : réfection à faire' && n.corps === 'Rue A', 'titre composé comme celui de la base (français)', n);
const sansNumero = texteNotification({ evenement: 'fuite_detectee', titre: 'Titre de la base', corps: 'c', donnees: {} });
verifier(sansNumero.titre === 'Titre de la base', 'sans données : titre de la base');

console.log(`\n${ok} vérifications réussies, ${ko} en échec`);
if (ko) process.exit(1);
