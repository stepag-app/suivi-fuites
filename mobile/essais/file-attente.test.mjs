// Essai de la file d'attente de la tablette contre une pile Supabase LOCALE (voir essais/lancer.sh).
// Vrai code de src/file-attente.ts, src/fiche-donnees.ts et src/parametres.ts ; stockage, fichiers
// et réseau simulés (mocks/). Crée deux comptes d'essai dans le marché DEMO local.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { ajouterEnvoi, mettreEnAttente, synchroniser, lireAttente, abandonner } from '../src/file-attente.ts';
import { chargerServeur } from '../src/fiche-donnees.ts';
import { chargerParametres } from '../src/parametres.ts';
import { supabase } from './mocks/supabase.js';

const vraiFetch = globalThis.fetch;
let panne = null; // 'tout' | 'stockage'
globalThis.__fetch = (u, o) => {
  const url = String(u);
  if (panne === 'tout' || (panne === 'stockage' && url.includes('/storage/'))) return Promise.reject(new TypeError('Network request failed'));
  return vraiFetch(u, o);
};
globalThis.fetch = (u, o) => (String(u).startsWith('file://') ? Promise.resolve(new Response(fs.readFileSync(String(u).slice(7)))) : vraiFetch(u, o));

const admin = createClient(process.env.SB_URL, process.env.SB_SERVICE, { auth: { persistSession: false } });
let ok = 0, ko = 0;
const verifier = (cond, msg, extra) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg, extra ?? ''); } };
const uuid = () => crypto.randomUUID();
const D = `${process.env.H}/docs/attente/`;
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
fs.mkdirSync(D, { recursive: true });
const photo = (type) => { const id = uuid(); const f = `${D}${id}.jpg`; fs.writeFileSync(f, JPEG); return { id, fichier: `file://${f}`, largeur: 10, hauteur: 10, taille: fs.statSync(f).size, prise_le: new Date().toISOString(), type }; };

const { data: m } = await admin.from('marches').select('id').eq('code', 'DEMO').single();
const marche = m.id;
async function compte(id, role) {
  const email = `${id}@agents.stepag.ma`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'motdepasse1', email_confirm: true, user_metadata: { identifiant: id, nom_complet: id } });
  if (error) throw error;
  const r = await admin.rpc('appliquer_modele_role', { p_profil: data.user.id, p_marche: marche, p_role: role });
  if (r.error) throw r.error;
  return email;
}
const suffixe = Date.now().toString(36);
const chef = await compte(`chef${suffixe}`, 'chef_reparation');
const det = await compte(`det${suffixe}`, 'detection');
const connexion = async (email) => { await supabase.auth.signOut(); const r = await supabase.auth.signInWithPassword({ email, password: 'motdepasse1' }); if (r.error) throw r.error; };

const p = await admin.from('catalogue_pieces').select('id').eq('marche_id', marche).limit(1).single();
const o = await admin.from('ouvriers').select('id').eq('marche_id', marche).limit(1).maybeSingle();
const n = await admin.from('natures_refection').select('id, necessite_refection').eq('marche_id', marche).eq('necessite_refection', true).limit(1).single();
const verrouillee = await admin.from('fuites').select('id, numero').eq('marche_id', marche).not('verrouillee_le', 'is', null).limit(1).single();

console.log('1. Chef : paramètres et fiche lisibles, jamais de prix');
await connexion(chef);
const par = await chargerParametres(marche);
verifier(par.natures.length > 0 && par.motifs.length > 0 && par.pieces.length > 0, `paramètres (${par.natures.length} natures, ${par.motifs.length} motifs, ${par.pieces.length} pièces, ${par.equipes.length} équipes, ${par.ouvriers.length} ouvriers)`);
const fiche = await chargerServeur(verrouillee.data.id);
verifier(fiche && fiche.fuite && fiche.fuite.numero === verrouillee.data.numero, 'fiche d\'une fuite (v_fuites, photos, réparations, pièces, ouvriers)', fiche);
verifier(fiche.reparations.length > 0, `réparations lues (${fiche.reparations.length}, pièces ${fiche.pieces.length})`);
const prix = await supabase.from('v_quantites').select('id').eq('marche_id', marche).limit(1);
verifier((prix.data ?? []).length === 0, 'aucune ligne de quantités / prix visible');

console.log('2. Hors ligne : fuite → réparation (pièces, ouvrier, photos) → réfection, envoyés dans l\'ordre');
const fuite = uuid(), rep = uuid(), refe = uuid();
await mettreEnAttente({ id: fuite, marche_id: marche, position: 'SRID=4326;POINT(-1.91 34.68)', photos: [photo()], ligne: { reference_srm: null, adresse: 'Essai tablette', position: 'SRID=4326;POINT(-1.91 34.68)', source_saisie: 'tablette' } });
await ajouterEnvoi({ type: 'reparation', id: rep, marche_id: marche, fuite_id: fuite, fuite_libelle: 'Fuite à envoyer', photos: [photo('avant'), photo('pendant'), photo('apres')],
  pieces: [{ id: uuid(), piece_id: p.data.id, designation: 'cat', quantite: 2 }, { id: uuid(), piece_id: null, designation: 'Raccord libre', quantite: 1 }],
  ouvriers: o.data ? [o.data.id] : [],
  ligne: { fuite_id: fuite, resultat: 'reparee', motif_id: null, realisee_le: new Date().toISOString(), materiau: 'polyethylene', diametre_mm: 32, tuyau_repare: true,
    fouille_longueur_m: 1.2, fouille_largeur_m: 0.6, fouille_profondeur_m: 0.8, emplacement: 'trottoir', nature_revetement_id: n.data.id, representant_srm: 'M. Essai', source_saisie: 'tablette' } });
await ajouterEnvoi({ type: 'refection', id: refe, marche_id: marche, fuite_id: fuite, fuite_libelle: 'Fuite à envoyer', photos: [photo('refection')],
  ligne: { fuite_id: fuite, resultat: 'faite', realisee_le: new Date().toISOString(), nature_id: null, motif_id: null, longueur_m: null, largeur_m: null, source_saisie: 'tablette' } });
panne = 'tout';
let reste = await synchroniser();
verifier(reste === 3 && (await lireAttente()).every((e) => !e.erreur), 'sans réseau : 3 envois gardés, aucune erreur affichée');
panne = 'stockage';
reste = await synchroniser();
const apresCoupure = await lireAttente();
verifier(reste === 3 && apresCoupure[0].fait?.ligne === true && !apresCoupure[0].erreur, 'coupure pendant les photos : fuite déjà créée, reprise notée, pas d\'erreur');
panne = null;
reste = await synchroniser();
verifier(reste === 0, 'retour du réseau : tout est envoyé', await lireAttente());
const f = await admin.from('fuites').select('statut, numero').eq('id', fuite).single();
verifier(f.data.statut === 'achevee', `statut avancé par le serveur : ${f.data.statut}`);
const r = await admin.from('reparations').select('*').eq('id', rep).single();
verifier(r.data && r.data.representant_srm === 'M. Essai' && r.data.tuyau_repare, 'réparation enregistrée');
const pcs = await admin.from('reparation_pieces').select('piece_id, designation_libre, quantite').eq('reparation_id', rep);
verifier(pcs.data.length === 2, `2 pièces posées (catalogue + libre)`);
const ouv = await admin.from('reparation_ouvriers').select('ouvrier_id').eq('reparation_id', rep);
verifier(ouv.data.length === (o.data ? 1 : 0), 'ouvrier rattaché');
const rf = await admin.from('refections').select('reparation_id, longueur_m, largeur_m, nature_id').eq('id', refe).single();
verifier(rf.data.reparation_id === rep && Number(rf.data.longueur_m) === 1.2 && Number(rf.data.largeur_m) === 0.6 && rf.data.nature_id === n.data.id, 'réfection : nature et dimensions reprises de la fouille', rf.data);
const phs = await admin.from('photos').select('type, reparation_id, refection_id').eq('fuite_id', fuite);
const types = phs.data.map((x) => x.type).sort().join(',');
verifier(types === 'apres,avant,detection,pendant,refection', `5 photos typées (${types})`);
verifier(phs.data.filter((x) => x.reparation_id === rep).length === 3 && phs.data.filter((x) => x.refection_id === refe).length === 1, 'photos rattachées à la réparation et à la réfection');
verifier(fs.readdirSync(D).length === 0, 'fichiers locaux supprimés après confirmation');
const lq = await admin.from('lignes_quantites').select('id').eq('fuite_id', fuite);
verifier(lq.data.length > 0, `lignes de quantités proposées par le serveur (${lq.data.length})`);

console.log('3. Fuite verrouillée par un lot arrêté : message clair, saisie gardée, suite bloquée');
const rv = uuid();
await ajouterEnvoi({ type: 'reparation', id: rv, marche_id: marche, fuite_id: verrouillee.data.id, fuite_libelle: `Fuite N° ${verrouillee.data.numero}`, photos: [photo('avant')], pieces: [], ouvriers: [],
  ligne: { fuite_id: verrouillee.data.id, resultat: 'en_cours', realisee_le: new Date().toISOString(), source_saisie: 'tablette' } });
await ajouterEnvoi({ type: 'refection', id: uuid(), marche_id: marche, fuite_id: verrouillee.data.id, fuite_libelle: `Fuite N° ${verrouillee.data.numero}`, photos: [],
  ligne: { fuite_id: verrouillee.data.id, resultat: 'non_faite', motif_id: par.motifs.find((x) => x.categorie === 'sans_refection').id, realisee_le: new Date().toISOString(), source_saisie: 'tablette' } });
reste = await synchroniser();
const l3 = await lireAttente();
verifier(reste === 2 && /verrouillée \(lot d'attachement arrêté\)/.test(l3[0].erreur ?? ''), `réparation refusée : ${l3[0].erreur}`);
verifier(/saisie précédente/.test(l3[1].erreur ?? ''), `réfection en attente : ${l3[1].erreur}`);
verifier(l3[0].photos.length === 1 && fs.existsSync(l3[0].photos[0].fichier.slice(7)), 'photo toujours sur la tablette');
for (const e of l3) await abandonner(e.id);
verifier((await lireAttente()).length === 0 && fs.readdirSync(D).length === 0, 'abandon : saisies et photos effacées');

console.log('4. Doublons : rechercher_fuites_proches');
const pr = await supabase.rpc('rechercher_fuites_proches', { p_marche: marche, p_latitude: 34.68, p_longitude: -1.91, p_reference: null });
verifier(!pr.error && pr.data.some((x) => x.id === fuite), `fuite proche trouvée (${pr.data?.length})`, pr.error);
const lie = uuid();
await mettreEnAttente({ id: lie, marche_id: marche, position: null, photos: [], ligne: { adresse: 'Re-détection', fuite_liee_id: fuite, source_saisie: 'tablette' } });
await synchroniser();
const fl = await admin.from('fuites').select('fuite_liee_id').eq('id', lie).single();
verifier(fl.data?.fuite_liee_id === fuite, 'nouvelle fuite liée enregistrée');

console.log('5. Agent de détection : lecture seule des interventions');
await connexion(det);
const fd = await chargerServeur(fuite);
verifier(fd && fd.reparations.length === 1 && fd.refections.length === 1, 'fiche lisible (réparation et réfection)');
await ajouterEnvoi({ type: 'reparation', id: uuid(), marche_id: marche, fuite_id: fuite, fuite_libelle: 'x', photos: [], pieces: [], ouvriers: [],
  ligne: { fuite_id: fuite, resultat: 'en_cours', realisee_le: new Date().toISOString(), source_saisie: 'tablette' } });
await synchroniser();
const l5 = await lireAttente();
verifier(/Droit insuffisant/.test(l5[0]?.erreur ?? ''), `saisie refusée : ${l5[0]?.erreur}`);
console.log(`\n${ok} vérifications réussies, ${ko} en échec`);
process.exit(ko ? 1 : 0);
