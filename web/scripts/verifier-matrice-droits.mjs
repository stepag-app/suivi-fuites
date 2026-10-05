// Vérification de la matrice des droits et des verrous (src/app/(app)/utilisateurs/matrice.ts) sur des données
// fictives, et de sa concordance avec les migrations (colonnes de « droits », verrous admis par la base, modèles).
// Lancement, dans web/ : node scripts/verifier-matrice-droits.mjs
// (Node 22.18 ou plus récent ; Node 22.6 à 22.17 : node --experimental-strip-types …)
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLES_SENSIBLES, COLONNES, DROIT_VIDE, GROUPES, LIGNES, ROLES, TITRES_TYPES, avecValeur, basculer, calculerChangements,
  changementsVerrous, cleVerrou, droitsDepuisLignes, droitsDesRoles, droitsDuModele, estPersonnalise, libelleDroit,
  libelleVerrou, lignesAEnregistrer, memesDroits, objetAction, peutSelonDroits, texteValeur, valeur,
} from '../src/app/(app)/utilisateurs/matrice.ts';

let n = 0;
const ok = (nom, fn) => {
  fn();
  n++;
  console.log(`ok ${n} - ${nom}`);
};

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');
const sql = readdirSync(MIGRATIONS).sort().map((f) => readFileSync(join(MIGRATIONS, f), 'utf8')).join('\n');
const listeSql = (texte) => [...texte.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

// Types de donnée : énumération de la migration 1, plus les valeurs ajoutées ensuite.
const TYPES = [
  ...listeSql(sql.match(/create type public\.type_donnee as enum \(([\s\S]*?)\);/)[1].replace(/--.*$/gm, '')),
  ...[...sql.matchAll(/alter type public\.type_donnee add value if not exists '([a-z_]+)'/g)].map((m) => m[1]),
];

// Verrous admis par la contrainte « verrous_admin_droit_connu » de la migration du lot Q.
const contrainte = sql.match(/constraint verrous_admin_droit_connu check \(([\s\S]*?)\n  \)\n\);/)[1];
const OBJETS_DROITS = listeSql(contrainte.match(/objet in \(([^)]*)\)/)[1]);
const ACTIONS_DROITS = listeSql(contrainte.match(/action in \(([^)]*)\)/)[1]);
const RESERVEES = [...contrainte.matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => `${m[1]}.${m[2]}`);
const verrouAdmis = (cle) => {
  const { objet, action } = objetAction(cle);
  return (OBJETS_DROITS.includes(objet) && ACTIONS_DROITS.includes(action)) || RESERVEES.includes(cle);
};

// Modèles de rôles insérés par les migrations (rôle, type, lire, créer, modifier, supprimer, valider).
const MODELES = [...sql.matchAll(
  /\('(detection|chef_reparation|responsable)', '([a-z_]+)',\s+(true|false),\s+(true|false),\s+'(non|siennes|toutes)',\s+'(non|siennes|toutes)',\s+(true|false)\)/g,
)].map((m) => ({
  role: m[1], type_donnee: m[2], lire: m[3] === 'true', creer: m[4] === 'true', modifier: m[5], supprimer: m[6], valider: m[7] === 'true',
}));

// Couples type × colonne que la base contrôle aujourd'hui (règles RLS, déclencheurs, fonctions) : chacun a sa ligne.
const CONTROLES_PAR_LA_BASE = [
  ...['fuites', 'interventions', 'photos', 'quantites', 'attachements'].flatMap((t) => COLONNES.map((c) => `${t}.${c}`)),
  'parametres.lire', 'parametres.creer', 'parametres.modifier', 'ouvriers.creer', 'ouvriers.modifier',
  'evenements.lire', 'evenements.creer', 'evenements.modifier', 'evenements.supprimer',
  'exports.lire', 'exports.creer', 'journal.lire',
];

ok('les migrations sont lues (types, verrous admis, modèles de rôles)', () => {
  assert.equal(TYPES.length, 12);
  assert.ok(TYPES.includes('evenements') && TYPES.includes('attachements'));
  assert.deepEqual(new Set(OBJETS_DROITS), new Set(TYPES), 'la contrainte des verrous couvre tous les types de donnée');
  assert.deepEqual(ACTIONS_DROITS, ['lire', 'creer', 'modifier', 'supprimer', 'valider']);
  assert.deepEqual(RESERVEES, ['attachements.rouvrir', 'attachements.forcer', 'marches.desactiver', 'marches.copier', 'comptes.revoquer']);
  assert.equal(MODELES.length, 19);
  assert.deepEqual(Object.keys(TITRES_TYPES).sort(), [...TYPES].sort());
});

ok('chaque ligne de droit correspond à une colonne de « droits », sans doublon', () => {
  const cles = LIGNES.map((l) => l.cle);
  assert.equal(new Set(cles).size, cles.length, 'clés uniques');
  for (const l of LIGNES.filter((x) => !x.adminSeul)) {
    assert.ok(TYPES.includes(l.objet), `${l.cle} : type de donnée inconnu`);
    assert.ok(COLONNES.includes(l.action), `${l.cle} : colonne inconnue`);
    assert.equal(!!l.portee, l.action === 'modifier' || l.action === 'supprimer', `${l.cle} : 3 états seulement pour une portée`);
    assert.equal(l.cle, cleVerrou(l.objet, l.action));
  }
  assert.deepEqual(GROUPES.slice(0, 5), ['Fuites', 'Interventions', 'Photos', 'Quantités et prix', 'Attachements']);
});

ok('tout couple contrôlé par la base a sa ligne ; chaque ligne est verrouillable en base', () => {
  for (const cle of CONTROLES_PAR_LA_BASE) assert.ok(LIGNES.some((l) => l.cle === cle), `ligne manquante : ${cle}`);
  for (const l of LIGNES) assert.ok(verrouAdmis(l.cle), `verrou refusé par la base : ${l.cle}`);
  assert.deepEqual(LIGNES.filter((l) => l.adminSeul).map((l) => l.cle), RESERVEES);
});

ok('actions sensibles : les 7 actions irréversibles demandées', () => {
  assert.deepEqual([...CLES_SENSIBLES].sort(), [
    'attachements.forcer', 'attachements.rouvrir', 'attachements.valider', 'comptes.revoquer',
    'fuites.supprimer', 'marches.copier', 'marches.desactiver',
  ]);
});

ok('appliquer un modèle : remplace toute la colonne (types absents = aucun droit)', () => {
  const det = droitsDuModele(MODELES, 'detection');
  assert.deepEqual(det.fuites, { lire: true, creer: true, modifier: 'siennes', supprimer: 'non', valider: false });
  assert.deepEqual(det.photos, { lire: true, creer: true, modifier: 'siennes', supprimer: 'siennes', valider: false });
  assert.equal(det.attachements, undefined);
  assert.equal(valeur(det, 'attachements', 'lire'), false);
  assert.deepEqual(droitsDuModele(MODELES, null), {});
  const resp = droitsDuModele(MODELES, 'responsable');
  assert.equal(resp.attachements.valider, true);
  assert.equal(resp.evenements.supprimer, 'toutes');
  // Un responsable passé « détection » perd ses attachements : changement listé.
  const ch = calculerChangements({ p1: resp }, { p1: det });
  assert.ok(ch.some((c) => c.type_donnee === 'attachements' && c.colonne === 'valider' && c.avant === true && c.apres === false));
});

ok('rôles cumulés : on garde le plus large ; droits personnalisés repérés', () => {
  const d = droitsDesRoles(MODELES, ['detection', 'chef_reparation']);
  assert.equal(d.interventions.creer, true);
  assert.equal(d.fuites.modifier, 'siennes');
  assert.equal(droitsDesRoles(MODELES, ['detection', 'responsable']).fuites.supprimer, 'toutes');
  assert.equal(estPersonnalise(droitsDuModele(MODELES, 'detection'), ['detection'], MODELES), false);
  const retouche = avecValeur(droitsDuModele(MODELES, 'detection'), 'exports', 'lire', true);
  assert.equal(estPersonnalise(retouche, ['detection'], MODELES), true);
  assert.equal(estPersonnalise({}, [], MODELES), false);
});

ok('cases : lecture et copie sans modification sur place', () => {
  const avant = droitsDepuisLignes([{ type_donnee: 'fuites', ...DROIT_VIDE, lire: true }]);
  const apres = avecValeur(avant, 'fuites', 'supprimer', 'toutes');
  assert.equal(valeur(avant, 'fuites', 'supprimer'), 'non');
  assert.equal(valeur(apres, 'fuites', 'supprimer'), 'toutes');
  assert.equal(valeur(apres, 'fuites', 'lire'), true);
  assert.equal(valeur(apres, 'photos', 'lire'), false);
  assert.ok(memesDroits({ photos: DROIT_VIDE }, {}), 'type absent = aucun droit');
});

ok('calcul des changements : avant / après, rien si on revient à l\'état initial', () => {
  const initial = { b: droitsDuModele(MODELES, 'detection'), c: droitsDuModele(MODELES, 'chef_reparation') };
  let courant = { ...initial, b: avecValeur(initial.b, 'fuites', 'supprimer', 'toutes') };
  courant = { ...courant, b: avecValeur(courant.b, 'exports', 'lire', true) };
  const ch = calculerChangements(initial, courant);
  assert.deepEqual(ch, [
    { profil_id: 'b', type_donnee: 'fuites', colonne: 'supprimer', avant: 'non', apres: 'toutes' },
    { profil_id: 'b', type_donnee: 'exports', colonne: 'lire', avant: false, apres: true },
  ]);
  const retour = { ...courant, b: avecValeur(avecValeur(courant.b, 'fuites', 'supprimer', 'non'), 'exports', 'lire', false) };
  assert.deepEqual(calculerChangements(initial, retour), []);
  assert.deepEqual(lignesAEnregistrer(initial, retour), []);
});

ok('lignes à enregistrer : une ligne complète par utilisateur × type changé', () => {
  const initial = { b: droitsDuModele(MODELES, 'detection') };
  const courant = { b: avecValeur(avecValeur(initial.b, 'fuites', 'supprimer', 'toutes'), 'fuites', 'valider', true) };
  assert.deepEqual(lignesAEnregistrer(initial, courant), [
    { profil_id: 'b', type_donnee: 'fuites', lire: true, creer: true, modifier: 'siennes', supprimer: 'toutes', valider: true },
  ]);
  // Modèle « aucun droit » : chaque type tenu est remis à zéro.
  const vide = lignesAEnregistrer(initial, { b: droitsDuModele(MODELES, null) });
  assert.deepEqual(vide.map((l) => l.type_donnee).sort(), ['balayage', 'fuites', 'interventions', 'photos']);
  assert.ok(vide.every((l) => !l.lire && !l.creer && l.modifier === 'non' && l.supprimer === 'non' && !l.valider));
});

ok('effet d\'un verrou : l\'administrateur perd seulement ce qu\'il a verrouillé', () => {
  const admin = { estAdmin: true, verrous: [], droits: [], marcheId: 'm1' };
  assert.ok(COLONNES.every((a) => peutSelonDroits(admin, 'attachements', a)), 'sans verrou : tout');
  const verrouille = { ...admin, verrous: [{ objet: 'fuites', action: 'supprimer' }, { objet: 'attachements', action: 'valider' }] };
  assert.equal(peutSelonDroits(verrouille, 'fuites', 'supprimer'), false);
  assert.equal(peutSelonDroits(verrouille, 'attachements', 'valider'), false);
  assert.equal(peutSelonDroits(verrouille, 'fuites', 'modifier'), true);
  assert.equal(peutSelonDroits(verrouille, 'quantites', 'supprimer'), true);
});

ok('agents : droits du marché choisi, verrous sans effet', () => {
  const droits = [
    { marche_id: 'm1', type_donnee: 'fuites', lire: true, creer: true, modifier: 'siennes', supprimer: 'non', valider: false },
    { marche_id: 'm2', type_donnee: 'fuites', lire: true, creer: true, modifier: 'toutes', supprimer: 'toutes', valider: true },
  ];
  const agent = { estAdmin: false, verrous: [{ objet: 'fuites', action: 'lire' }], droits, marcheId: 'm1' };
  assert.equal(peutSelonDroits(agent, 'fuites', 'lire'), true);
  assert.equal(peutSelonDroits(agent, 'fuites', 'modifier'), true, 'portée « siennes » : bouton affiché, la base filtre');
  assert.equal(peutSelonDroits(agent, 'fuites', 'supprimer'), false);
  assert.equal(peutSelonDroits(agent, 'attachements', 'lire'), false);
  assert.equal(peutSelonDroits({ ...agent, marcheId: 'm2' }, 'fuites', 'supprimer'), true);
  assert.equal(peutSelonDroits({ ...agent, marcheId: null }, 'fuites', 'lire'), false);
});

ok('verrous : pose et retrait calculés, liste jamais modifiée sur place', () => {
  const initial = ['comptes.revoquer', 'fuites.supprimer'];
  const courant = basculer(basculer(initial, 'fuites.supprimer'), 'marches.copier');
  assert.deepEqual(initial, ['comptes.revoquer', 'fuites.supprimer']);
  assert.deepEqual(courant, ['comptes.revoquer', 'marches.copier']);
  assert.deepEqual(changementsVerrous(initial, courant), { poser: ['marches.copier'], retirer: ['fuites.supprimer'] });
  assert.deepEqual(changementsVerrous(initial, initial), { poser: [], retirer: [] });
  assert.deepEqual(objetAction('attachements.valider'), { objet: 'attachements', action: 'valider' });
});

ok('libellés : valeurs, cases sans écran, verrous', () => {
  assert.equal(texteValeur(true), 'Oui');
  assert.equal(texteValeur('non'), 'Non');
  assert.equal(texteValeur('siennes'), 'Les siennes');
  assert.equal(libelleDroit('fuites', 'supprimer'), 'Fuites : supprimer');
  assert.equal(libelleDroit('balayage', 'creer'), 'Balayage : creer (sans écran)');
  assert.equal(libelleVerrou('comptes.revoquer'), 'Comptes : révoquer un accès');
  assert.equal(Object.keys(ROLES).length, 3);
});

console.log(`\n${n} vérifications réussies`);
