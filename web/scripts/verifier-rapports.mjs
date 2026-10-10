// Vérification de l'écran Rapports (chantier v3, J1 ; src/lib/export/rapports.ts et rapports-donnees.ts), sans navigateur
// ni base : période (jour, semaine, dates libres), rubriques et colonnes selon les droits, modèles gardés dans
// modeles_export (contrôles de la table, distincts des autres modèles), filtres de chaque rubrique, synthèse, sections ;
// puis chargement réel sur le client de démonstration (matricules, R4) et fabrication de vrais PDF (A4 portrait et
// paysage) et classeurs Excel, relus.
//
// Usage (dans web/) : node scripts/verifier-rapports.mjs [dossier de sortie] (Node 22.18 ou plus). Si pdftoppm
// (poppler) est installé, la première page de chaque PDF est rendue en PNG dans le dossier de sortie.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

process.env.NEXT_PUBLIC_MODE_DEMO = '1';
const SRC = new URL('../src/', import.meta.url);
registerHooks({
  resolve(specifier, context, suivant) {
    const alias = specifier.startsWith('@/') ? new URL(specifier.slice(2), SRC).href : null;
    const relatif = specifier.startsWith('.') && context.parentURL?.endsWith('.ts') ? new URL(specifier, context.parentURL).href : null;
    let base = alias ?? relatif;
    if (base && !/\.[cm]?[jt]sx?$/.test(base)) {
      base = ['.ts', '.tsx', '/index.ts'].map((ext) => base + ext).find((u) => existsSync(fileURLToPath(u))) ?? base;
    }
    const cible = base && context.conditions?.includes('require') ? fileURLToPath(base) : base;
    const r = suivant(cible ?? specifier, context);
    return r.url.endsWith('.ts') && r.url.startsWith(SRC.href) ? { ...r, format: 'module-typescript' } : r;
  },
});
// supabase.ts charge le client de démonstration par require (comme dans Next)
globalThis.require = createRequire(new URL('lib/supabase.ts', SRC));

const r = await import('../src/lib/export/rapports.ts');
const rubriquesAutres = await import('../src/lib/export/rubriques.ts');
const { unzipSync, strFromU8 } = await import('fflate');

const sortie = process.argv[2] ?? join(tmpdir(), 'verification-rapports');
mkdirSync(sortie, { recursive: true });

let echecs = 0;
let total = 0;
const verifier = (nom, ok, detail = '') => {
  total++;
  if (!ok) echecs++;
  console.log(`${ok ? '  ok ' : '  ÉCHEC'} ${nom}${detail ? ` : ${detail}` : ''}`);
};
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// 1. Période
// ---------------------------------------------------------------------------
console.log('Période');
verifier('jour : la date seule', egal(r.bornesPeriode('jour', '2026-10-14'), { du: '2026-10-14', au: '2026-10-14' }));
verifier('semaine : du lundi au dimanche (mercredi)', egal(r.bornesPeriode('semaine', '2026-10-14'), { du: '2026-10-12', au: '2026-10-18' }));
verifier('semaine : un dimanche appartient à la semaine qui finit', egal(r.bornesPeriode('semaine', '2026-10-18'), { du: '2026-10-12', au: '2026-10-18' }));
verifier('semaine : un lundi ouvre la semaine', egal(r.bornesPeriode('semaine', '2026-10-12'), { du: '2026-10-12', au: '2026-10-18' }));
verifier('semaine à cheval sur deux années', egal(r.bornesPeriode('semaine', '2027-01-01'), { du: '2026-12-28', au: '2027-01-03' }));
verifier('dates libres remises dans l\'ordre', egal(r.bornesPeriode('libre', '2026-10-14', '2026-10-20', '2026-10-01'), { du: '2026-10-01', au: '2026-10-20' }));
verifier('dates libres manquantes : la date de référence', egal(r.bornesPeriode('libre', '2026-10-14'), { du: '2026-10-14', au: '2026-10-14' }));
verifier('date illisible : aujourd\'hui (Casablanca)', r.bornesPeriode('jour', 'n\'importe quoi').du === r.aujourdhui());
verifier('titre : journalier', r.titreRapport('jour', { du: '2026-10-14', au: '2026-10-14' }) === 'État journalier du 14/10/2026');
verifier('titre : hebdomadaire', r.titreRapport('semaine', { du: '2026-10-12', au: '2026-10-18' }) === 'État hebdomadaire du 12/10/2026 au 18/10/2026');
verifier('titre : période libre', r.titreRapport('libre', { du: '2026-10-01', au: '2026-10-20' }) === 'État de la période du 01/10/2026 au 20/10/2026');
verifier('jour de Casablanca d\'un horodatage tardif', r.jourCasablanca('2026-10-14T23:30:00Z') === '2026-10-15');

// ---------------------------------------------------------------------------
// 2. Rubriques, colonnes, droits
// ---------------------------------------------------------------------------
console.log('Rubriques et colonnes');
const cles = r.RUBRIQUES_RAPPORT.map((x) => x.cle);
verifier('les huit rubriques demandées et la synthèse', egal(cles, ['synthese', 'fuites', 'reparations', 'refections', 'balayage', 'debits', 'pieces', 'attente']));
verifier('sans droit : ni balayage ni débits', egal(r.rubriquesVisibles().map((x) => x.cle), ['synthese', 'fuites', 'reparations', 'refections', 'pieces', 'attente']));
verifier('avec « balayage / lire » et « mesures_debit / lire » : toutes', r.rubriquesVisibles({ balayage: true, mesures_debit: true }).length === 8);
const colsDebits = (d) => r.colonnesRubrique('debits', d).flatMap((t) => t.colonnes.map((c) => c.cle));
verifier('débits : pénalités (montants) seulement avec « quantités / lire »',
  !colsDebits({}).includes('s_pen_bal') && colsDebits({ quantites: true }).includes('s_pen_bal') && colsDebits({ quantites: true }).includes('s_pen_maint'));
verifier('débits : deux tableaux (nuits de la période, situation)', egal(r.colonnesRubrique('debits').map((t) => t.tableau.cle), ['nuits', 'situation']));
for (const k of cles) {
  const toutes = r.colonnesRubrique(k, { quantites: true }).flatMap((t) => t.colonnes.map((c) => c.cle));
  verifier(`${k} : clés de colonnes uniques, défauts parmi elles`, new Set(toutes).size === toutes.length && r.colonnesParDefaut(k).every((c) => toutes.includes(c)) && r.colonnesParDefaut(k).length > 0);
}
verifier('R4 : colonnes de personnes titrées « (matricule) »', ['fuites', 'reparations', 'refections', 'balayage', 'pieces'].every((k) =>
  r.colonnesRubrique(k).flatMap((t) => t.colonnes).filter((c) => ['detectee_par', 'chef', 'agent'].includes(c.cle)).every((c) => c.titre.includes('(matricule)'))));
verifier('libellé de la référence repris de la fiche du marché', r.colonnesRubrique('fuites', {}, { libelle_reference: 'Réf. tournée' })[0].colonnes[1].titre === 'Réf. tournée');
verifier('choix par défaut : toutes les rubriques, paysage, PDF, visas', (() => {
  const d = r.choixParDefaut();
  return d.rubriques.length === 8 && d.orientation === 'paysage' && d.format === 'pdf' && d.visas && d.periode === 'jour';
})());

// ---------------------------------------------------------------------------
// 3. Modèles (modeles_export)
// ---------------------------------------------------------------------------
console.log('Modèles');
verifier('lecture tolérante : rien → défaut', egal(r.normaliserChoix(null), r.choixParDefaut()) && egal(r.normaliserChoix('x'), r.choixParDefaut()));
const brut = {
  periode: 'semaine', du: '2026-10-01', rubriques: ['fuites', 'inconnue', 'balayage'], colonnes: { fuites: ['numero', 'pas_une_colonne', 'adresse'], autre: ['x'] },
  filtres: { zone: 'z1', statut: 'pas_un_statut', personne: '  ', validees: 'oui' }, orientation: 'portrait', format: 'docx', visas: false, titre: '  État SRM  ',
};
const n = r.normaliserChoix(brut);
verifier('rubriques et colonnes inconnues retirées, ordre des rubriques gardé', egal(n.rubriques, ['fuites', 'balayage']) && egal(n.colonnes.fuites, ['numero', 'adresse']) && !('autre' in n.colonnes));
verifier('filtres invalides retirés (statut inconnu, texte vide, validées non booléen)', egal(n.filtres, { zone: 'z1' }));
verifier('dates libres gardées seulement pour « Dates libres »', n.du === undefined && r.normaliserChoix({ periode: 'libre', du: '2026-10-01', au: 'x' }).du === '2026-10-01');
verifier('format inconnu → PDF ; portrait, sans visas, titre rogné', n.format === 'pdf' && n.orientation === 'portrait' && n.visas === false && n.titre === 'État SRM');
const choixEssai = { ...r.choixParDefaut(), periode: 'libre', du: '2026-10-01', au: '2026-10-07', format: 'xlsx', orientation: 'portrait', filtres: { secteur: 's1', validees: true }, titre: 'Essai' };
const ligne = r.versModele(choixEssai);
verifier('ligne de modeles_export : contrôles de la table respectés', ligne.jeu === 'fuites' && ligne.regroupement === 'aucun'
  && ['xlsx', 'pdf', 'docx', 'csv'].includes(ligne.format) && ['portrait', 'paysage'].includes(ligne.orientation) && ligne.filtres.document === 'rapports');
verifier('aller-retour modèle → choix sans perte', egal(r.depuisModele({ ...ligne }), r.normaliserChoix(choixEssai)));
verifier('dernier choix marqué, distinct des modèles nommés',
  r.estDernierChoix(r.versModele(choixEssai, true)) && !r.estDernierChoix(ligne) && r.estModeleRapport(ligne));
verifier('ignoré par le panneau « Exporter » (modèle à rubriques) et par les rubriques des autres documents',
  rubriquesAutres.estModeleRubriques(ligne) && !['rapport_fuite', 'rapport_balayage', 'carte'].includes(ligne.filtres.document));
verifier('un modèle de colonnes du panneau n\'est pas un modèle de rapport', !r.estModeleRapport({ filtres: { periode: 'jour' } }) && !r.estModeleRapport({ filtres: { document: 'carte' } }));
verifier('dernier choix sur l\'appareil : repli et lecture', (() => {
  const memoire = new Map();
  globalThis.localStorage = { getItem: (k) => memoire.get(k) ?? null, setItem: (k, v) => memoire.set(k, v) };
  const vide = r.dernierChoixLocal('m1') === null;
  r.memoriserChoixLocal('m1', choixEssai);
  const relu = egal(r.dernierChoixLocal('m1'), r.normaliserChoix(choixEssai)) && r.dernierChoixLocal('m2') === null;
  memoire.set('suivi-fuites:rapports:m3', 'pas du json');
  const abime = r.dernierChoixLocal('m3') === null;
  delete globalThis.localStorage;
  return vide && relu && abime;
})());

// ---------------------------------------------------------------------------
// 4. Filtres
// ---------------------------------------------------------------------------
console.log('Filtres');
const F = (o) => ({ zone_id: 'z1', secteur_id: 's1', statut: 'detectee', auteur_terrain_id: 'a1', validee_le: null, ...o });
const donnees = {
  fuites: [F({ numero: 1, visibilite: 'invisible' }), F({ numero: 2, zone_id: 'z2', secteur_id: 's2', validee_le: '2026-10-14T10:00:00Z' }),
    F({ numero: 3, statut: 'reparee', auteur_terrain_id: 'a2', validee_le: '2026-10-14T10:00:00Z' })],
  reparations: [F({ fuite_numero: 3, statut: 'reparee', resultat: 'reparee', auteur_terrain_id: 'c1', volume_m3: 1.5, realisee_le: '2026-10-14T09:00:00Z', validee_le: 'x' }),
    F({ fuite_numero: 4, statut: 'en_reparation', resultat: 'en_cours', auteur_terrain_id: 'c2', volume_m3: '0.75', realisee_le: '2026-10-14T08:00:00Z' })],
  refections: [F({ fuite_numero: 5, statut: 'achevee', resultat: 'faite', surface_m2: 1.62, auteur_terrain_id: 'c1', realisee_le: '2026-10-14T11:00:00Z' })],
  balayage: [{ date_balayage: '2026-10-14', agent_id: 'a1', zone_id: 'z1', secteur_id: 's1', nb_troncons: 10, lineaire_m: '1000.5', lineaire_repasse_m: 20, statut: 'achevee' },
    { date_balayage: '2026-10-14', agent_id: 'a2', zone_id: 'z2', secteur_id: 's2', nb_troncons: 5, lineaire_m: 500, lineaire_repasse_m: 0 }],
  debitsNuits: [{ nuit: '2026-10-14', zone_id: 'z1', zone_numero: 1, zone_libelle: 'Zone 1', campagne_type: 'maintien', q_zone_m3h: 112.4, approchee: true, complete: true, nb_points: 2, nb_points_mesures: 2 },
    { nuit: '2026-10-14', zone_id: 'z2', zone_numero: 2, zone_libelle: 'Zone 2', campagne_type: 'maintien', q_zone_m3h: 90, approchee: false, complete: false, nb_points: 3, nb_points_mesures: 2 }],
  debitsSituation: [{ niveau: 'zone', zone_id: 'z1', zone_numero: 1, zone_libelle: 'Zone 1', q_exige_m3h: 126, qf_m3h: 160, tau1_pct: -26.98, alerte_arret: true, penalite_balayage: 1234.5 },
    { niveau: 'zone', zone_id: 'z2', zone_numero: 2, zone_libelle: 'Zone 2', tau1_pct: 3 }, { niveau: 'marche', zone_id: null, tau1_pct: -5 }],
  pieces: [F({ fuite_id: 'f3', chef_id: 'c1', designation: 'Collier', unite: 'U', quantite: 2, statut: 'reparee', validee_le: 'x' }),
    F({ fuite_id: 'f4', chef_id: 'c2', designation: 'Tuyau PE 63', unite: 'm', quantite: 1.5, statut: 'en_reparation' })],
  attente: [F({ numero: 1, alerte_non_reparee: true }), F({ numero: 3, statut: 'reparee', alerte_refection_chaussee: true, zone_id: 'z2', secteur_id: 's2' })],
};
const f = (filtres) => r.filtrerDonnees(donnees, filtres);
verifier('zone : toutes les rubriques, débits compris', (() => {
  const x = f({ zone: 'z2' });
  return x.fuites.length === 1 && x.balayage.length === 1 && x.debitsNuits.length === 1 && x.attente.length === 1 && x.reparations.length === 0;
})());
verifier('zone : situation des débits réduite à la zone (sans la ligne du marché)', egal(f({ zone: 'z1' }).debitsSituation.map((l) => l.zone_id), ['z1']));
verifier('sans zone : situation complète (zones et marché)', f({}).debitsSituation.length === 3);
verifier('secteur : sans effet sur les débits (mesurés par zone)', f({ secteur: 's2' }).debitsNuits.length === 2 && f({ secteur: 's2' }).fuites.length === 1);
verifier('statut : fuites, réparations, pièces, attente ; sans effet sur le balayage', (() => {
  const x = f({ statut: 'reparee' });
  return x.fuites.length === 1 && x.reparations.length === 1 && x.pieces.length === 1 && x.attente.length === 1 && x.balayage.length === 2;
})());
verifier('chef d\'équipe : réparations, réfections, pièces (compte du chef)', (() => {
  const x = f({ personne: 'c1' });
  return x.reparations.length === 1 && x.refections.length === 1 && x.pieces.length === 1 && x.fuites.length === 0;
})());
verifier('agent : détection et balayage', (() => {
  const x = f({ personne: 'a2' });
  return x.fuites.length === 1 && x.balayage.length === 1 && x.balayage[0].agent_id === 'a2' && x.debitsNuits.length === 2;
})());
verifier('validées seulement : détection, réparation, pièces ; balayage et débits inchangés', (() => {
  const x = f({ validees: true });
  return x.fuites.length === 2 && x.reparations.length === 1 && x.refections.length === 0 && x.pieces.length === 1 && x.balayage.length === 2 && x.debitsNuits.length === 2;
})());
verifier('filtres en clair (personne : matricule)', r.texteFiltres({ zone: 'z1', personne: 'c1', validees: true }, { zone: 'Zone 1', personne: '1022' })
  === 'Filtres : zone Zone 1, chef d\'équipe ou agent 1022, saisies validées seulement' && r.texteFiltres({}) === '');

// ---------------------------------------------------------------------------
// 5. Synthèse et sections
// ---------------------------------------------------------------------------
console.log('Synthèse et sections');
const syn = r.lignesSynthese(donnees, cles);
const ligneSyn = (debut) => syn.find((l) => String(l.rubrique).startsWith(debut));
verifier('synthèse : une ligne par rubrique cochée (hors synthèse)', syn.length === 7);
verifier('synthèse : fuites (validées, invisibles)', ligneSyn('Fuites détectées').nombre === 3 && ligneSyn('Fuites détectées').detail === 'dont 2 validées, 1 invisible');
verifier('synthèse : réparations et volume (texte numérique accepté)', ligneSyn('Réparations').detail === '1 réparée, 1 en cours, 0 non réparée ; fouilles 2,250 m3');
verifier('synthèse : linéaire balayé arrondi au mètre', ligneSyn('Balayage').nombre === 1501 && ligneSyn('Balayage').detail.startsWith('15 tronçons sur 1 jour'));
verifier('synthèse : débits (nuits complètes, zones en alerte)', ligneSyn('Débits').detail === '1 nuit complète ; 1 zone en alerte');
verifier('synthèse : attente (non achevées, en alerte, accord)', ligneSyn('Fuites en attente').detail === '1 non achevée, 2 en alerte');
verifier('synthèse : seulement les rubriques cochées', r.lignesSynthese(donnees, ['synthese', 'fuites']).length === 1);
const choixTout = { ...r.choixParDefaut(), colonnes: Object.fromEntries(cles.map((k) => [k, r.colonnesRubrique(k, { quantites: true }).flatMap((t) => t.colonnes.map((c) => c.cle))])) };
const droitsTout = { balayage: true, mesures_debit: true, quantites: true };
const sections = r.sectionsRapport(donnees, choixTout, { droits: droitsTout });
verifier('sections dans l\'ordre des rubriques, débits en deux tableaux', egal(sections.map((s) => s.titre), ['Synthèse', 'Fuites détectées', 'Réparations', 'Réfections',
  'Balayage du réseau', 'Débits de nuit : nuits de la période', 'Débits de nuit : situation des performances', 'Pièces posées', 'Fuites en attente et alertes']));
verifier('sans le droit : rubrique retirée même si cochée', !r.sectionsRapport(donnees, choixTout, { droits: {} }).some((s) => s.titre?.startsWith('Débits') || s.titre === 'Balayage du réseau'));
verifier('rubrique décochée : aucune section', !r.sectionsRapport(donnees, { ...choixTout, rubriques: ['fuites'] }, { droits: droitsTout }).some((s) => s.titre !== 'Fuites détectées'));
verifier('tableau sans colonne cochée : omis (situation des débits seule)', egal(r.sectionsRapport(donnees, { ...choixTout, rubriques: ['debits'], colonnes: { debits: ['s_zone', 's_tau1'] } }, { droits: droitsTout })
  .map((s) => s.titre), ['Débits de nuit : situation des performances']));
const vide = r.sectionsRapport({ ...donnees, refections: [] }, { ...choixTout, rubriques: ['refections'] }, { droits: droitsTout })[0];
verifier('rubrique sans ligne : « Aucun élément » (pas de tableau vide)', vide.lignes.length === 1 && vide.lignes[0].type === 'groupe' && /Aucun élément/.test(vide.lignes[0].libelle));
const balayageSec = sections.find((s) => s.titre === 'Balayage du réseau');
verifier('balayage : total du linéaire', balayageSec.lignes.at(-1).type === 'total' && balayageSec.lignes.at(-1).cellules[balayageSec.colonnes.findIndex((c) => c.titre === 'Linéaire (m)')] === 1500.5);
const situation = sections.find((s) => s.titre?.includes('situation'));
verifier('situation : zones puis « Ensemble du marché », alertes en clair', situation.lignes.filter((l) => l.type === 'donnees').at(-1).cellules[0] === 'Ensemble du marché'
  && situation.lignes[0].cellules.includes('Arrêt de zone (Tau 1)'));
verifier('nuits : mesure approchée ou incomplète en clair', sections.find((s) => s.titre?.includes('nuits')).lignes.some((l) => l.cellules.includes('Incomplète'))
  && sections.find((s) => s.titre?.includes('nuits')).lignes.some((l) => l.cellules.includes('Approchée (somme des minimums)')));
verifier('portrait, toutes les colonnes : tableaux trop chargés signalés', r.tableauxTropLarges(sections, 'portrait').length > 0);

// ---------------------------------------------------------------------------
// 6. Chargement réel sur le client de démonstration (R4)
// ---------------------------------------------------------------------------
console.log('Chargement (démonstration)');
const demo = await import('../src/lib/demo/donnees.ts');
const rd = await import('../src/lib/export/rapports-donnees.ts');
const MARCHE = demo.MARCHE_SRM;
const fin = r.aujourdhui();
const periode = { du: r.ajouterJours(fin, -27), au: fin };
const d = await rd.chargerDonneesRapport(MARCHE, periode, droitsTout);
verifier('lignes lues : fuites, réparations, balayage, attente', d.fuites.length > 0 && d.reparations.length > 0 && d.balayage.length > 0 && d.attente.length > 0,
  `${d.fuites.length} fuites, ${d.reparations.length} réparations, ${d.refections.length} réfections, ${d.balayage.length} balayages, ${d.pieces.length} pièces, ${d.attente.length} en attente, ${d.debitsNuits.length} nuits`);
verifier('fuites et interventions dans la période (jour de Casablanca)', d.fuites.every((l) => l.jour_detection >= periode.du && l.jour_detection <= periode.au)
  && d.reparations.every((l) => { const j = r.jourCasablanca(l.realisee_le); return j >= periode.du && j <= periode.au; }));
verifier('réparations enrichies de leur fuite (N°, secteur, statut)', d.reparations.every((l) => l.fuite_numero != null && l.secteur_id && l.statut));
verifier('attente : non achevées ou en alerte', d.attente.every((l) => ['detectee', 'en_reparation'].includes(l.statut) || r.enAlerte(l)));
const NOMS = ['EL AMRANI', 'BENALI', 'Karim', 'Youssef'];
const personnes = [...d.fuites.map((l) => l.detectee_par), ...d.reparations.map((l) => l.chef), ...d.balayage.map((l) => l.agent), ...d.pieces.map((l) => l.chef)].filter(Boolean);
verifier('R4 : matricules à la place des noms (détection, chef d\'équipe, balayage)', personnes.length > 0 && personnes.every((p) => !NOMS.some((x) => String(p).includes(x))),
  [...new Set(personnes)].join(', '));
verifier('filtre agent sur le balayage de démonstration', r.filtrerDonnees(d, { personne: demo.profils[1].id }).balayage.every((l) => l.agent === '1021'));
const listes = await rd.chargerListes(MARCHE);
verifier('listes des filtres : zones, secteurs, comptes du marché (avec matricule)', listes.zones.length === 5 && listes.secteurs.length > 10
  && listes.personnes.some((p) => p.matricule === '1022'));

// ---------------------------------------------------------------------------
// 7. Fichiers réels : PDF portrait et paysage, Excel
// ---------------------------------------------------------------------------
console.log('Fichiers');
const ctx = { marche: { ...demo.marches[0] }, os: [], osCommencement: null, regles: null, peutMontants: true };
const { genererPdf } = await import('../src/lib/export/pdf.ts');
const { genererXlsx } = await import('../src/lib/export/xlsx.ts');
const textePdf = (latin) => [...latin.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map(([, x]) => {
  try { return inflateSync(Buffer.from(x, 'latin1')).toString('latin1'); } catch { return x; }
}).join('\n');
const pdftoppm = (() => { try { execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
// Chaînes de texte du PDF (opérateurs Tj) : un mot coupé par le tableau n'y figure plus en entier.
const chainesPdf = (latin) => [...textePdf(latin).matchAll(/\((?:\\.|[^\\)])*\)/g)].map(([x]) => x.slice(1, -1).replace(/\\([()\\])/g, '$1'));
const { parcourir, texteCellule } = await import('../src/lib/export/modele.ts');
function motsCoupes(section, chaines) {
  const mots = new Set();
  section.colonnes.forEach((c, i) => {
    c.titre.split(/\s+/).forEach((m) => mots.add(m));
    for (const { ligne, indexDonnees } of parcourir(section)) {
      if (ligne.type !== 'donnees') continue;
      const t = texteCellule(section, ligne, i, indexDonnees);
      (c.type === 'texte' ? t.split(/\s+/) : [t]).forEach((m) => mots.add(m));
    }
  });
  return [...mots].filter((m) => m.length >= 3 && /^[\x20-\xff]+$/.test(m) && !chaines.some((x) => x.includes(m)));
}
for (const orientation of ['portrait', 'paysage']) {
  const choix = { ...r.choixParDefaut(), periode: 'libre', du: periode.du, au: periode.au, orientation };
  const doc = r.documentRapport(d, choix, ctx, periode, { droits: droitsTout, noms: {} });
  const blob = await genererPdf(doc);
  const latin = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  const boite = latin.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  const [l, h] = boite ? [Number(boite[1]), Number(boite[2])] : [0, 0];
  verifier(`PDF ${orientation} : A4 dans le bon sens`, orientation === 'portrait' ? Math.round(l) === 595 && Math.round(h) === 842 : Math.round(l) === 842 && Math.round(h) === 595, `${l} × ${h}`);
  const coupes = doc.sections.flatMap((x) => motsCoupes(x, chainesPdf(latin)));
  verifier(`PDF ${orientation} : colonnes par défaut sans mot coupé, sans conseil à l'écran`,
    coupes.length === 0 && r.tableauxTropLarges(doc.sections, orientation).length === 0, [...coupes.slice(0, 5), ...r.tableauxTropLarges(doc.sections, orientation)].join(', '));
  const texte = textePdf(latin);
  const titres = ['Synth', 'Fuites d', 'Balayage du r', 'situation des performances', 'Fuites en attente'];
  verifier(`PDF ${orientation} : titre, période et rubriques imprimés`, texte.includes('tat de la p') && titres.every((t) => texte.includes(t)), titres.filter((t) => !texte.includes(t)).join(', '));
  verifier(`PDF ${orientation} : aucun nom d'agent (R4)`, !NOMS.some((x) => texte.includes(x)) && texte.includes('1021'));
  verifier(`PDF ${orientation} : visas en fin de document`, texte.includes('Pour le titulaire'));
  const fichier = join(sortie, `rapport-${orientation}.pdf`);
  writeFileSync(fichier, Buffer.from(await blob.arrayBuffer()));
  if (pdftoppm) execFileSync('pdftoppm', ['-r', '60', '-png', '-f', '1', '-l', '1', fichier, join(sortie, `rapport-${orientation}`)]);

  const xlsx = unzipSync(new Uint8Array(await (await genererXlsx(doc)).arrayBuffer()));
  const feuilles = Object.keys(xlsx).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
  const classeur = strFromU8(xlsx['xl/workbook.xml']);
  const xml = feuilles.map((k) => strFromU8(xlsx[k])).join('\n');
  verifier(`Excel ${orientation} : une feuille par tableau`, feuilles.length === doc.sections.length, `${feuilles.length} feuilles / ${doc.sections.length} tableaux`);
  verifier(`Excel ${orientation} : A4 ${orientation}`, xml.includes(`orientation="${orientation === 'portrait' ? 'portrait' : 'landscape'}"`) && xml.includes('paperSize="9"'));
  verifier(`Excel ${orientation} : feuilles nommées par rubrique`, classeur.includes('Synthèse') && classeur.includes('Réparations'));
}

// Conseil de l'écran face au PDF réel : chaque tableau, en portrait et en paysage, avec les colonnes par défaut, toutes
// les colonnes et des choix tirés au hasard ; un tableau qui coupe des mots doit toujours être signalé.
{
  let graine = 7;
  const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  const bilan = { justes: 0, manques: [], prudents: 0, signales: 0 };
  for (const orientation of ['portrait', 'paysage']) {
    for (let essai = 0; essai < 8; essai++) {
      const colonnes = Object.fromEntries(cles.map((k) => {
        const toutes = r.colonnesRubrique(k, droitsTout).flatMap((t) => t.colonnes.map((c) => c.cle));
        return [k, essai === 0 ? r.colonnesParDefaut(k) : essai === 1 ? toutes : toutes.filter(() => hasard() < 0.25 + essai / 10)];
      }));
      const doc = r.documentRapport(d, { ...r.choixParDefaut(), colonnes, orientation, periode: 'libre', du: periode.du, au: periode.au }, ctx, periode, { droits: droitsTout });
      const signales = new Set(r.tableauxTropLarges(doc.sections, orientation));
      for (const s of doc.sections) {
        const latin = Buffer.from(await (await genererPdf({ ...doc, sections: [s] })).arrayBuffer()).toString('latin1');
        const coupe = motsCoupes(s, chainesPdf(latin)).length > 0;
        const signale = signales.has(s.titre);
        if (signale) bilan.signales++;
        if (coupe && !signale) bilan.manques.push(`${s.titre} (${orientation}, ${s.colonnes.length} col.)`);
        else if (!coupe && signale) bilan.prudents++;
        else bilan.justes++;
      }
    }
  }
  verifier('conseil « tableaux chargés » : tout tableau qui coupe des mots est signalé', bilan.manques.length === 0, bilan.manques.slice(0, 4).join(' ; '));
  verifier('conseil « tableaux chargés » : rarement à tort (au plus un sur quatre)', bilan.prudents <= bilan.signales / 4,
    `${bilan.justes} justes, ${bilan.prudents} signalés sans coupure sur ${bilan.signales} signalés`);
  const choix = { ...choixTout, periode: 'libre', du: periode.du, au: periode.au, orientation: 'paysage' };
  const fichier = join(sortie, 'rapport-toutes-colonnes-paysage.pdf');
  writeFileSync(fichier, Buffer.from(await (await genererPdf(r.documentRapport(d, choix, ctx, periode, { droits: droitsTout }))).arrayBuffer()));
  if (pdftoppm) execFileSync('pdftoppm', ['-r', '60', '-png', '-f', '1', '-l', '2', fichier, join(sortie, 'rapport-toutes-colonnes-paysage')]);
}

console.log(`\nFichiers : ${sortie}${pdftoppm ? ' (aperçus PNG compris)' : ''}`);
console.log(`${total - echecs} / ${total} vérifications réussies`);
process.exit(echecs ? 1 : 0);
