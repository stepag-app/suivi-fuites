// Vérification des calculs du tableau de bord (src/lib/ui/tableau-de-bord.ts) sur des données fictives.
// Lancement, dans web/ : node scripts/verifier-tableau-de-bord.mjs
// (Node 22.18 ou plus récent ; Node 22.6 à 22.17 : node --experimental-strip-types …)
import assert from 'node:assert/strict';
import {
  activite, ajouterJours, debutMarche, graduations, jourCasa, libellePeriode, lundiDe, mediane, parGroupe, parSemaine, periodePour,
  recapAttachements, repartitionStatuts, resumeAnomalies, resumeLots, resumerUnites, semaineIso, situation, trierGroupes,
} from '../src/lib/ui/tableau-de-bord.ts';

let n = 0;
const ok = (nom, fn) => {
  fn();
  n++;
  console.log(`ok ${n} - ${nom}`);
};

const SANS_ALERTE = {
  alerte_non_reparee: false, alerte_communication_srm: false, alerte_refection_chaussee: false,
  refection_chaussee_hors_delai: false, alerte_refection_trottoir: false, alerte_sans_photo: false,
};
let numero = 0;
const fuite = (o) => ({
  id: `f${++numero}`, numero, statut: 'detectee', zone_id: 'z1', zone: 'Zone 1', secteur_id: 's1', secteur: 'Secteur A',
  derniere_reparation_le: null, derniere_refection_le: null, emplacement_fouille: null, nb_photos: 1,
  ...SANS_ALERTE, ...o,
});

// Lundi 5 octobre 2026, 10 h à Casablanca (UTC+1)
const MAINTENANT = new Date('2026-10-05T09:00:00Z');

ok('jour à l\'heure de Casablanca (23 h 30 UTC = lendemain à Casablanca)', () => {
  assert.equal(jourCasa('2026-09-30T23:30:00Z'), '2026-10-01');
  assert.equal(jourCasa('2026-09-30T22:30:00Z'), '2026-09-30');
});

ok('semaines ISO et lundis', () => {
  assert.equal(semaineIso('2026-10-05'), 41);
  assert.equal(semaineIso('2026-01-01'), 1);
  assert.equal(semaineIso('2025-12-29'), 1);
  assert.equal(semaineIso('2027-01-03'), 53);
  assert.equal(lundiDe('2026-10-11'), '2026-10-05');
  assert.equal(lundiDe('2026-10-05'), '2026-10-05');
  assert.equal(ajouterJours('2026-02-28', 1), '2026-03-01');
});

ok('périodes : mois en cours, semaine, mois précédent, dates libres', () => {
  assert.deepEqual(periodePour('mois', MAINTENANT), { du: '2026-10-01', au: '2026-10-31' });
  assert.deepEqual(periodePour('semaine', MAINTENANT), { du: '2026-10-05', au: '2026-10-11' });
  assert.deepEqual(periodePour('mois_precedent', MAINTENANT), { du: '2026-09-01', au: '2026-09-30' });
  assert.deepEqual(periodePour('mois_precedent', new Date('2026-01-15T12:00:00Z')), { du: '2025-12-01', au: '2025-12-31' });
  assert.deepEqual(periodePour('libre', MAINTENANT, { du: '2026-09-20', au: '2026-09-10' }), { du: '2026-09-10', au: '2026-09-20' });
  assert.deepEqual(periodePour('libre', MAINTENANT, { du: '2026-09-20' }), { du: '2026-09-20', au: '2026-09-20' });
  assert.deepEqual(periodePour('libre', MAINTENANT, {}), { du: '2026-10-01', au: '2026-10-31' });
  assert.equal(libellePeriode({ du: '2026-02-01', au: '2026-02-28' }), 'février 2026');
  assert.equal(libellePeriode({ du: '2026-10-05', au: '2026-10-11' }), 'du 05/10/2026 au 11/10/2026');
});

ok('période « depuis le début du marché » : OS, sinon date de commencement, sinon première fuite', () => {
  assert.deepEqual(periodePour('debut', MAINTENANT, {}, '2026-03-02'), { du: '2026-03-02', au: '2026-10-05' });
  assert.deepEqual(periodePour('debut', MAINTENANT, {}, null), { du: '2026-10-05', au: '2026-10-05' });
  assert.deepEqual(periodePour('debut', MAINTENANT, {}, '2027-01-01'), { du: '2026-10-05', au: '2026-10-05' });
  const fuites = [{ date_detection: '2026-05-10T23:30:00Z' }, { date_detection: '2026-06-01T08:00:00Z' }];
  assert.equal(debutMarche({ date_commencement: '2026-04-01' }, { date_os: '2026-03-20', date_effet: '2026-03-25' }, fuites), '2026-03-25');
  assert.equal(debutMarche({ date_commencement: '2026-04-01' }, { date_os: '2026-03-20', date_effet: null }, fuites), '2026-03-20');
  assert.equal(debutMarche({ date_commencement: '2026-04-01' }, null, fuites), '2026-04-01');
  assert.equal(debutMarche({ date_commencement: null }, null, fuites), '2026-05-11');
  assert.equal(debutMarche(null, null, []), null);
});

ok('médiane', () => {
  assert.equal(mediane([]), null);
  assert.equal(mediane([5, 1, 3]), 3);
  assert.equal(mediane([4, 1, 3, 10]), 3.5);
});

// Jeu de fuites : septembre et octobre 2026
const FUITES = [
  // Détectée le 01/10 (Casablanca) à 00 h 30, réparée 24 h plus tard : achevée
  fuite({ date_detection: '2026-09-30T23:30:00Z', derniere_reparation_le: '2026-10-01T23:30:00Z', derniere_refection_le: '2026-10-03T10:00:00Z', statut: 'achevee' }),
  // Détectée le 02/10, réparée 48 h plus tard, réfection chaussée à faire
  fuite({ date_detection: '2026-10-02T08:00:00Z', derniere_reparation_le: '2026-10-04T08:00:00Z', statut: 'reparee', emplacement_fouille: 'chaussee', secteur_id: 's2', secteur: 'Secteur B' }),
  // Détectée le 03/10, toujours non réparée, en alerte, sans photo
  fuite({ date_detection: '2026-10-03T08:00:00Z', alerte_non_reparee: true, alerte_sans_photo: true, nb_photos: 0, secteur_id: 's2', secteur: 'Secteur B' }),
  // Réparation en cours (pas réparée)
  fuite({ date_detection: '2026-10-04T08:00:00Z', derniere_reparation_le: '2026-10-04T12:00:00Z', statut: 'en_reparation' }),
  // Détectée en septembre, réparée le 01/10 (96 h), réfection chaussée hors délai : non (réparée récemment)
  fuite({ date_detection: '2026-09-27T09:00:00Z', derniere_reparation_le: '2026-10-01T09:00:00Z', statut: 'reparee', zone_id: 'z2', zone: 'Zone 2', secteur_id: 's3', secteur: 'Secteur C' }),
  // Ancienne : septembre, réparée en septembre, réfection chaussée hors délai
  fuite({ date_detection: '2026-09-01T09:00:00Z', derniere_reparation_le: '2026-09-02T09:00:00Z', statut: 'reparee', refection_chaussee_hors_delai: true, alerte_refection_chaussee: true, zone_id: 'z2', zone: 'Zone 2', secteur_id: 's3', secteur: 'Secteur C' }),
  // Sans réparation (fermée) en octobre : jamais « réparée »
  fuite({ date_detection: '2026-10-02T09:00:00Z', derniere_reparation_le: '2026-10-02T15:00:00Z', statut: 'sans_reparation', secteur_id: null, secteur: null, zone_id: null, zone: null }),
];
const OCTOBRE = { du: '2026-10-01', au: '2026-10-31' };

ok('activité d\'octobre : détectées, réparées, délais moyen et médian', () => {
  const a = activite(FUITES, OCTOBRE);
  assert.equal(a.detectees, 5);
  assert.equal(a.detecteesEnAttente, 2);
  assert.equal(a.detecteesSansPhoto, 1);
  assert.equal(a.reparees, 3);
  assert.equal(a.repareesAchevees, 1);
  assert.equal(a.nbDelais, 3);
  assert.equal(a.delaiMoyenH, (24 + 48 + 96) / 3);
  assert.equal(a.delaiMedianH, 48);
  assert.equal(a.delaiMaxH, 96);
});

ok('activité d\'une période vide', () => {
  const a = activite(FUITES, { du: '2026-11-01', au: '2026-11-30' });
  assert.equal(a.detectees, 0);
  assert.equal(a.reparees, 0);
  assert.equal(a.delaiMoyenH, null);
  assert.equal(a.delaiMedianH, null);
});

ok('situation à ce jour', () => {
  assert.deepEqual(situation(FUITES), { enAttente: 2, alertes: 2, refectionsHorsDelai: 1, refectionsTrottoirAlerte: 0, sansPhoto: 1 });
});

ok('répartition par statut', () => {
  assert.deepEqual(repartitionStatuts(FUITES), { detectee: 1, en_reparation: 1, reparee: 3, achevee: 1, sans_reparation: 1 });
});

ok('par secteur et par zone, tri', () => {
  const s = parGroupe(FUITES, OCTOBRE, 'secteur');
  const a = s.find((l) => l.cle === 's1');
  assert.deepEqual({ d: a.detectees, r: a.reparees, e: a.enAttente, al: a.alertes }, { d: 2, r: 1, e: 1, al: 0 });
  const b = s.find((l) => l.cle === 's2');
  assert.deepEqual({ d: b.detectees, r: b.reparees, e: b.enAttente, al: b.alertes }, { d: 2, r: 1, e: 1, al: 1 });
  const c = s.find((l) => l.cle === 's3');
  assert.deepEqual({ d: c.detectees, r: c.reparees, e: c.enAttente, al: c.alertes }, { d: 0, r: 1, e: 0, al: 1 });
  assert.equal(s.find((l) => l.cle === '').libelle, 'Non renseigné');
  assert.equal(s.find((l) => l.cle === '').zone, null);
  assert.equal(a.zone, 'Zone 1');
  const z = parGroupe(FUITES, OCTOBRE, 'zone');
  assert.equal(z.find((l) => l.cle === 'z1').detectees, 4);
  assert.deepEqual(trierGroupes(s, 'detectees', true).map((l) => l.cle), ['s1', 's2', '', 's3']);
  assert.deepEqual(trierGroupes(s, 'libelle', false).map((l) => l.libelle), ['Non renseigné', 'Secteur A', 'Secteur B', 'Secteur C']);
  // Septembre seulement : la fuite hors délai garde son alerte, celles d'octobre sont « en attente » à ce jour
  const sept = parGroupe(FUITES, { du: '2026-09-01', au: '2026-09-30' }, 'secteur');
  assert.equal(sept.find((l) => l.cle === 's3').detectees, 2);
});

ok('évolution par semaine', () => {
  const sem = parSemaine(FUITES, '2026-10-05', 12);
  assert.equal(sem.length, 12);
  assert.equal(sem[11].lundi, '2026-10-05');
  assert.equal(sem[11].numero, 41);
  assert.equal(sem[0].lundi, '2026-07-20');
  // Semaine du 28/09 au 04/10 : 5 détectées (01/10, 02/10, 03/10, 04/10, 02/10), 3 réparées (01/10 ×2, 04/10)
  const s40 = sem[10];
  assert.equal(s40.lundi, '2026-09-28');
  assert.equal(s40.detectees, 5);
  assert.equal(s40.reparees, 3);
  assert.equal(s40.delaiMoyenH, (24 + 48 + 96) / 3);
  // Semaine du 31/08 : 1 détectée, 1 réparée en 24 h
  const s36 = sem.find((s) => s.lundi === '2026-08-31');
  assert.deepEqual([s36.detectees, s36.reparees, s36.delaiMoyenH], [1, 1, 24]);
  // Semaine du 21/09 : détectée le 27/09, réparée la semaine suivante
  const s39 = sem.find((s) => s.lundi === '2026-09-21');
  assert.deepEqual([s39.detectees, s39.reparees, s39.delaiMoyenH], [1, 0, null]);
});

ok('graduations d\'axe', () => {
  assert.deepEqual(graduations(0), [0, 1]);
  assert.deepEqual(graduations(3), [0, 1, 2, 3]);
  assert.deepEqual(graduations(7), [0, 2, 4, 6, 8]);
  assert.deepEqual(graduations(37), [0, 10, 20, 30, 40]);
  assert.deepEqual(graduations(0.7, 4, false), [0, 0.2, 0.4, 0.6, 0.8]);
});

ok('anomalies : total, fuites, types triés', () => {
  const r = resumeAnomalies([
    { fuite_id: 'f1', anomalie: 'reference_srm_format' },
    { fuite_id: 'f1', anomalie: 'fouille_superieure_2m' },
    { fuite_id: 'f2', anomalie: 'fouille_superieure_2m' },
    { fuite_id: 'f3', anomalie: 'inconnue' },
  ]);
  assert.equal(r.total, 4);
  assert.equal(r.fuites, 3);
  assert.deepEqual(r.types.map((t) => [t.libelle, t.nombre]),
    [['Fouille > 2 m sans remplacement', 2], ['inconnue', 1], ['Référence hors format', 1]]);
});

ok('lots : arrêtés, brouillons (dont rouvert), dernier numéro', () => {
  const r = resumeLots([
    { id: 'a', numero: 1, statut: 'arrete', date_arret: '2026-08-31' },
    { id: 'b', numero: 2, statut: 'arrete', date_arret: '2026-09-30' },
    { id: 'c', numero: null, statut: 'brouillon', date_arret: '2026-10-31' },
    { id: 'd', numero: 3, statut: 'brouillon', date_arret: null },
  ]);
  assert.equal(r.arretes, 2);
  assert.equal(r.brouillons, 2);
  assert.equal(r.dernier.numero, 2);
  assert.equal(resumeLots([]).dernier, null);
});

ok('attachements : cumul attaché au prix figé, reste au prix actuel, % du marché', () => {
  const articles = [
    { id: 'p3', numero: '3', ordre: 3, designation: 'Terrassement', unite: 'm3', quantite_marche: 100, pu_ht: 200, hors_bordereau: false, actif: true },
    { id: 'p1', numero: '1', ordre: 1, designation: 'Balayage', unite: 'km', quantite_marche: 50, pu_ht: 1000, hors_bordereau: false, actif: true },
    { id: 'p9', numero: 'HB1', ordre: 99, designation: 'Hors bordereau', unite: 'u', quantite_marche: null, pu_ht: 500, hors_bordereau: true, actif: true },
    { id: 'p8', numero: 'HB2', ordre: 98, designation: 'Hors bordereau inutilisé', unite: 'u', quantite_marche: null, pu_ht: 10, hors_bordereau: true, actif: true },
  ];
  const lignes = [
    { prix_id: 'p3', quantite: 10, pu_ht: 180 },       // prix figé avant un avenant
    { prix_id: 'p3', quantite: 0.16, pu_ht: 200 },     // régularisation
    { prix_id: 'p1', quantite: 12.5, pu_ht: 1000 },    // ligne libre (balayage)
    { prix_id: 'p9', quantite: 1, pu_ht: 500 },        // refacturation forcée
  ];
  const unites = [
    { fuite_id: 'f1', prix_id: 'p3', reste: 2, brouillon_id: null },
    { fuite_id: 'f2', prix_id: 'p3', reste: -0.5, brouillon_id: 'x' },
    { fuite_id: 'f2', prix_id: 'p9', reste: 1, brouillon_id: null },
  ];
  const r = recapAttachements(articles, lignes, resumerUnites(unites));
  assert.deepEqual(r.articles.map((a) => a.article.numero), ['1', '3', 'HB1']);
  const p3 = r.articles.find((a) => a.article.id === 'p3');
  assert.equal(p3.attachee, 10.16);
  assert.equal(p3.montantAttache, 1832);
  assert.equal(p3.reste, 1.5);
  assert.equal(p3.montantReste, 300);
  assert.equal(p3.pourcentage, 10.2);
  assert.equal(p3.pourcentageReste, 1.5);
  const hb = r.articles.find((a) => a.article.id === 'p9');
  assert.equal(hb.pourcentage, null);
  assert.equal(r.montantAttache, 1832 + 12500 + 500);
  assert.equal(r.montantReste, 300 + 500);
  assert.equal(r.montantMarche, 100 * 200 + 50 * 1000);
  assert.equal(r.avancement, 21.2);
  assert.deepEqual([r.unitesReste, r.fuitesReste, r.unitesEnBrouillon], [3, 2, 1]);
});

ok('attachements : rien d\'attaché', () => {
  const r = recapAttachements([], [], resumerUnites([]));
  assert.deepEqual([r.montantAttache, r.montantReste, r.avancement, r.articles.length], [0, 0, null, 0]);
});

console.log(`\n${n} vérifications réussies.`);
