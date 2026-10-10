// Vérification des calculs des débits de nuit du panneau (src/lib/debits.ts) : mêmes jeux et mêmes résultats que
// les tests de la base (supabase/tests/database/40_s15_debits_nuit.test.sql), import CSV, concordance avec la migration.
// Lancement, dans web/ : node scripts/verifier-debits.mjs   (Node 22.18 ou plus récent)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HEURES_NUIT, REGLAGES_DEFAUT, dateFinDefaut, dateImport, debitsNuits, heureImport, lireCsv, lireTableauImport, normaliserReleves,
  nuitsCampagne, penalitePoints, regrouperImport, resultatsCampagnes, resultatsDebits, tau,
} from '../src/lib/debits.ts';

let n = 0;
const ok = (nom, fn) => { fn(); n++; console.log(`ok ${n} - ${nom}`); };
const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Jeu des tests de la base : zones Z1 (Q exigé 100, 1 000 m) et Z2 (50, 500 m), points P1, P2 (Z1) et P3 (Z2).
const zones = [
  { id: 'z1', numero: 1, libelle: 'Zone 1', lineaire_m: 1000, q_exige_m3h: 100, actif: true },
  { id: 'z2', numero: 2, libelle: 'Zone 2', lineaire_m: 500, q_exige_m3h: 50, actif: true },
];
const points = [
  { id: 'p1', zone_id: 'z1', code: 'P1', libelle: 'Point 1', actif: true },
  { id: 'p2', zone_id: 'z1', code: 'P2', libelle: 'Point 2', actif: true },
  { id: 'p3', zone_id: 'z2', code: 'P3', libelle: 'Point 3', actif: true },
];
const campagnes = [
  { id: 'avant', type: 'avant', zone_id: null, date_debut: '2026-11-02', date_fin: '2026-11-04', cree_le: '1' },
  { id: 'apres', type: 'apres', zone_id: null, date_debut: '2027-02-02', date_fin: '2027-02-04', cree_le: '2' },
  { id: 'm1', type: 'maintien', zone_id: 'z1', date_debut: '2027-02-10', date_fin: '2027-02-10', cree_le: '3' },
  { id: 'm2', type: 'maintien', zone_id: 'z1', date_debut: '2027-02-17', date_fin: '2027-02-17', cree_le: '4' },
];
const V = '2026-11-01T00:00:00Z';
let k = 0;
const rel = (c, p, nuit, releves) => ({ id: `m${++k}`, campagne_id: c, point_id: p, nuit, releves, mode: 'releves', minimum_m3h: Math.min(...releves.map((r) => r.q)), validee_le: V });
const min = (c, p, nuit, q, validee_le = V) => ({ id: `m${++k}`, campagne_id: c, point_id: p, nuit, releves: null, mode: 'minimum', minimum_m3h: q, validee_le });
const mesures = [
  rel('avant', 'p1', '2026-11-02', [{ h: '00:00', q: 80 }, { h: '00:15', q: 70 }, { h: '00:30', q: 75 }]),
  rel('avant', 'p2', '2026-11-02', [{ h: '00:00', q: 60 }, { h: '00:15', q: 65 }, { h: '00:30', q: 55 }]),
  min('avant', 'p1', '2026-11-03', 72), min('avant', 'p2', '2026-11-03', 60), min('avant', 'p1', '2026-11-04', 50),
  min('avant', 'p3', '2026-11-02', 90),
  min('apres', 'p1', '2027-02-02', 60), min('apres', 'p2', '2027-02-02', 50), min('apres', 'p3', '2027-02-02', 70),
  rel('m1', 'p1', '2027-02-10', [{ h: '00:00', q: 70 }, { h: '03:00', q: 65 }]),
  rel('m1', 'p2', '2027-02-10', [{ h: '00:00', q: 45 }, { h: '03:00', q: 50 }]),
  min('m2', 'p1', '2027-02-17', 75), min('m2', 'p2', '2027-02-17', 50),
];
const pu = { balayage: { pu: 0.30, quantite: 1500 }, maintien: { pu: 0.45, quantite: 1500 } };
const calculer = (m = mesures, r = REGLAGES_DEFAUT, p = pu) => {
  const nuits = debitsNuits(zones, points, campagnes, m);
  const camps = resultatsCampagnes(zones, campagnes, nuits);
  return { nuits, camps, res: resultatsDebits(zones, camps, r, p) };
};

ok('25 instants de 0 h à 6 h toutes les 15 minutes', () => {
  assert.equal(HEURES_NUIT.length, 25);
  assert.equal(HEURES_NUIT[0], '00:00');
  assert.equal(HEURES_NUIT[1], '00:15');
  assert.equal(HEURES_NUIT[24], '06:00');
});
ok('points de pénalité : τ positif ou nul, proportionnels, entiers arrondis au plus proche, plafond, inconnu', () => {
  assert.equal(penalitePoints(5), 0);
  assert.equal(penalitePoints(0), 0);
  assert.equal(penalitePoints(-3.4), 3.4);
  assert.equal(penalitePoints(-3.4, 25, 'entiers'), 3);
  assert.equal(penalitePoints(-3.5, 25, 'entiers'), 4);
  assert.equal(penalitePoints(-9.6, 25, 'entiers'), 10);
  assert.equal(penalitePoints(-30), 25);
  assert.equal(penalitePoints(-25, 25, 'entiers'), 25);
  assert.equal(penalitePoints(null), null);
});
ok('τ arrondi à 2 décimales (−9,0909 → −9,09)', () => {
  assert.equal(tau(110, 120), -9.09);
  assert.equal(tau(100, 110), -10);
  assert.equal(tau(0, 10), null);
});
ok('relevés normalisés et triés, refus identiques à la base', () => {
  assert.deepEqual(normaliserReleves([{ h: '0:30', q: 75 }, { h: '00:00', q: '80' }, { h: '00:15', q: '70,5' }]),
    [{ h: '00:00', q: 80 }, { h: '00:15', q: 70.5 }, { h: '00:30', q: 75 }]);
  assert.equal(normaliserReleves([{ h: '01:00', q: '' }]), null);
  assert.throws(() => normaliserReleves([{ h: '07:00', q: 10 }]), /00:00 à 06:00/);
  assert.throws(() => normaliserReleves([{ h: '01:00', q: -1 }]), /négatif/);
  assert.throws(() => normaliserReleves([{ h: '01:00', q: 1 }, { h: '1:00', q: 2 }]), /même heure/);
  assert.throws(() => normaliserReleves([{ h: 'midi', q: 1 }]), /HH:MM/);
});
ok('zone 1, avant : 130 au même instant (et non 125), 132 approché, nuit incomplète', () => {
  const z1 = calculer().nuits.filter((x) => x.campagne_id === 'avant' && x.zone_id === 'z1')
    .map((x) => [x.nuit, x.q_zone_m3h, x.approchee, x.complete, x.nb_points, x.nb_instants]);
  assert.deepEqual(z1, [['2026-11-02', 130, false, true, 2, 3], ['2026-11-03', 132, true, true, 2, 0], ['2026-11-04', 50, false, false, 2, 0]]);
});
ok('Qi = minimum des nuits complètes ; un seul point : minimum exact', () => {
  const qi = calculer().camps.filter((c) => c.campagne_id === 'avant')
    .map((c) => [c.q_m3h, c.approchee, c.nb_nuits, c.nb_nuits_completes, c.nuit_minimum]);
  assert.deepEqual(qi, [[130, false, 3, 2, '2026-11-02'], [90, false, 1, 1, '2026-11-02']]);
});
ok('mesures à valider : signalées, pas comptées', () => {
  const m = [...mesures.filter((x) => x.campagne_id !== 'apres'), min('apres', 'p1', '2027-02-02', 60, null)];
  const c = calculer(m).camps.find((x) => x.campagne_id === 'apres' && x.zone_id === 'z1');
  assert.equal(c.q_m3h, null);
  assert.equal(c.nb_a_valider, 1);
});
ok('zone 1 : Qi 130, Qf 110 approché, ΔQ 20, τ1 −10 %, pénalité 30 DH', () => {
  const z = calculer().res.find((r) => r.zone_numero === 1);
  assert.deepEqual([z.qi_m3h, z.qf_m3h, z.delta_q_m3h, z.qf_approche, z.qf_nuits], [130, 110, 20, true, 1]);
  assert.deepEqual([z.tau1_pct, z.points_balayage, z.montant_balayage, z.penalite_balayage, z.alerte_arret], [-10, 10, 300, 30, false]);
});
ok('zone 2 : τ1 −40 %, plafond 25 points, 37,50 DH, alerte « arrêt de zone »', () => {
  const z = calculer().res.find((r) => r.zone_numero === 2);
  assert.deepEqual([z.tau1_pct, z.points_balayage, z.penalite_balayage, z.alerte_arret], [-40, 25, 37.5, true]);
});
ok('maintien zone 1 : deux contrôles à 7 jours, moyenne 120, τ2 −9,09 %, 9 points (arrondis), 40,50 DH, dégradation 50 %', () => {
  const z = calculer().res.find((r) => r.zone_numero === 1);
  assert.deepEqual([z.nb_controles, z.dernier_controle, z.dernier_controle_m3h, z.ecart_controles_max_j, z.q_maintien_moyen_m3h],
    [2, '2027-02-17', 125, 7, 120]);
  assert.deepEqual([z.tau2_pct, z.points_maintien, z.montant_maintien, z.penalite_maintien], [-9.09, 9, 450, 40.5]);
  assert.deepEqual([z.degradation_m3h, z.degradation_pct, z.alerte_degradation], [10, 50, true]);
});
ok('marché, assiette zone : sommes, pénalité 67,50 DH, τ2 global inconnu', () => {
  const m = calculer().res.at(-1);
  assert.equal(m.niveau, 'marche');
  assert.deepEqual([m.qi_m3h, m.qf_m3h, m.tau1_pct, m.penalite_balayage, m.montant_balayage, m.alerte_arret, m.tau2_pct],
    [220, 180, -20, 67.5, 450, true, null]);
});
ok('points proportionnels : 9,09 points, 40,91 DH', () => {
  const z = calculer(mesures, { ...REGLAGES_DEFAUT, debits_points: 'proportionnels' }).res.find((r) => r.zone_numero === 1);
  assert.deepEqual([z.points_maintien, z.penalite_maintien], [9.09, 40.91]);
});
ok('assiette « marché » : τ1 global −20 % sur 450 DH, 90 DH ; aucune pénalité par zone', () => {
  const { res } = calculer(mesures, { ...REGLAGES_DEFAUT, debits_assiette: 'marche' });
  const m = res.at(-1);
  assert.deepEqual([m.tau1_pct, m.points_balayage, m.montant_balayage, m.penalite_balayage], [-20, 20, 450, 90]);
  assert.ok(res.filter((r) => r.niveau === 'zone').every((r) => r.penalite_balayage == null));
});
ok('seuil d\'arrêt réglable ; montants cachés sans prix', () => {
  assert.equal(calculer(mesures, { ...REGLAGES_DEFAUT, debits_seuil_arret_pct: 50 }).res.find((r) => r.zone_numero === 2).alerte_arret, false);
  const z = calculer(mesures, REGLAGES_DEFAUT, { balayage: null, maintien: null }).res.find((r) => r.zone_numero === 1);
  assert.deepEqual([z.tau1_pct, z.montant_balayage, z.penalite_balayage], [-10, null, null]);
});
ok('mesure supprimée : nuit incomplète, contrôle non compté', () => {
  const m = mesures.map((x) => (x.campagne_id === 'm2' && x.point_id === 'p2' ? { ...x, supprime_le: V } : x));
  const { nuits, res } = calculer(m);
  const nuit = nuits.find((x) => x.campagne_id === 'm2');
  assert.deepEqual([nuit.complete, nuit.q_zone_m3h], [false, 75]);
  assert.equal(res.find((r) => r.zone_numero === 1).nb_controles, 1);
});
ok('nuits d\'une campagne et dernière nuit par défaut', () => {
  assert.deepEqual(nuitsCampagne({ date_debut: '2026-12-31', date_fin: '2027-01-02' }), ['2026-12-31', '2027-01-01', '2027-01-02']);
  assert.equal(dateFinDefaut('avant', '2026-11-02'), '2026-11-04');
  assert.equal(dateFinDefaut('maintien', '2026-11-02'), '2026-11-02');
});
ok('import : dates, heures (texte et Excel), séparateur détecté', () => {
  assert.equal(dateImport('03/11/2026'), '2026-11-03');
  assert.equal(dateImport('2026-11-03 00:15'), '2026-11-03');
  assert.equal(dateImport('46329'), '2026-11-03');
  assert.equal(heureImport('0:15:00'), '00:15');
  assert.equal(heureImport('0.25'), '06:00');
  assert.deepEqual(lireCsv('point;date;heure;débit\r\nP1;03/11/2026;00:15;"12,5"\n'), [['point', 'date', 'heure', 'débit'], ['P1', '03/11/2026', '00:15', '12,5']]);
});
ok('import : relevés regroupés par point et par nuit, hors nuit ignorés, points inconnus signalés', () => {
  const csv = [
    'Point,Date,Heure,Debit m3/h',
    'P1,2026-11-02,00:00,80', 'P1,2026-11-02,00:15,70', 'P1,2026-11-02,07:00,95',
    'P2,2026-11-02,00:00,60', 'P2,2026-11-02,00:15,65',
    'P3,2026-11-02,,90', 'X9,2026-11-02,00:00,1', 'P1,2026-12-01,00:00,1', 'P1,,00:00,1',
  ].join('\n');
  const r = regrouperImport(lireTableauImport(lireCsv(csv)), points, campagnes[0]);
  assert.deepEqual(r.mesures, [
    { point_id: 'p1', nuit: '2026-11-02', releves: [{ h: '00:00', q: 80 }, { h: '00:15', q: 70 }] },
    { point_id: 'p2', nuit: '2026-11-02', releves: [{ h: '00:00', q: 60 }, { h: '00:15', q: 65 }] },
    { point_id: 'p3', nuit: '2026-11-02', minimum_m3h: 90 },
  ]);
  assert.equal(r.ignorees, 2);
  assert.deepEqual(r.pointsInconnus, ['X9']);
  assert.equal(r.erreurs.length, 1);
});
ok('import : colonnes manquantes signalées ; point d\'une autre zone refusé', () => {
  assert.match(lireTableauImport([['a', 'b'], ['1', '2']]).erreurs[0], /Colonnes attendues/);
  const r = regrouperImport(lireTableauImport([['point', 'date', 'debit'], ['P3', '2027-02-10', '5']]), points, campagnes[2]);
  assert.deepEqual(r.pointsInconnus, ['P3']);
});
ok('concordance avec la migration : réglages, seuils, colonnes de debits_resultats', () => {
  const sql = readFileSync(join(racine, 'supabase/migrations/20261013300000_debits_nuit.sql'), 'utf8');
  for (const v of ["debits_mode_saisie text not null default 'minimum'", "debits_assiette text not null default 'zone'",
    "debits_points text not null default 'proportionnels'", 'debits_plafond_pct numeric(5,2) not null default 25',
    'debits_seuil_arret_pct numeric(5,2) not null default 25', 'debits_seuil_degradation_pct numeric(5,2) not null default 25']) {
    assert.ok(sql.includes(v), v);
  }
  const bloc = sql.slice(sql.indexOf('create function public.debits_resultats'), sql.indexOf('language sql', sql.indexOf('create function public.debits_resultats')));
  const colonnes = [...bloc.matchAll(/^\s{2}([a-z0-9_]+) (?:text|uuid|integer|numeric|boolean|date)/gm)].map((m) => m[1]);
  const arrondi = readFileSync(join(racine, 'supabase/migrations/20261014500000_penalites_arrondi_normal.sql'), 'utf8');
  assert.ok(arrondi.includes("alter column debits_points set default 'entiers'"));
  assert.ok(arrondi.includes("when p_mode = 'entiers' then round(-p_tau)"));
  assert.equal(REGLAGES_DEFAUT.debits_points, 'entiers');
  const exemple = calculer().res[0];
  assert.deepEqual(colonnes.sort(), Object.keys(exemple).sort());
  assert.ok(sql.includes("type in ('avant', 'apres', 'maintien', 'libre')"));
});

console.log(`1..${n}`);
