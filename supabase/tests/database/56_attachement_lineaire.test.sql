-- =============================================================================
-- Attachement du linéaire (20261016700100) : prix 1 (balayage) par zone, dès le premier mois, sur option,
-- plafonné à la quantité du marché ; prix 2 (maintien) en tranches 40 % / 60 % ; suivi en direct, arrêt,
-- régularisation, réouverture, contrôles et droits. Tout est annulé à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(42);

-- -----------------------------------------------------------------------------
-- Jeu d'essai : a = admin, b = détection A, d = responsable A
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-A', '1', 'Marché A', 'Client A');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');

insert into prix (id, marche_id, numero, ordre, designation, unite, quantite_marche, pu_ht, famille) values
  ('aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '1', 1, 'Balayage', 'ml', 1466000, 0.30, 'balayage'),
  ('aaaaaaaa-4444-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '2', 2, 'Maintien', 'ml', 1466000, 0.45, 'maintien'),
  ('aaaaaaaa-4444-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '3', 3, 'Terrassement', 'm3', 10, 50, 'terrassement');
insert into ordres_service (id, marche_id, numero, date_os, objet, nature) values
  ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '02', '2026-09-25', 'Commencement', 'commencement');
insert into phases (id, marche_id, code, libelle, ordre, date_debut, date_fin) values
  ('aaaaaaaa-6666-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'balayage', 'Balayage', 1, '2026-10-02', '2027-02-01'),
  ('aaaaaaaa-6666-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'maintien_1', 'Maintien 1', 2, '2027-02-02', '2027-06-01'),
  ('aaaaaaaa-6666-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'maintien_2', 'Maintien 2', 3, '2027-06-02', '2027-10-01');
update phases set part_maintien_pct = 40 where id = 'aaaaaaaa-6666-0000-0000-000000000002';
update phases set part_maintien_pct = 60 where id = 'aaaaaaaa-6666-0000-0000-000000000003';

insert into zones (id, marche_id, numero, code, libelle, lineaire_m) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1, 'Z1', 'Zone 1', 1000),
  ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 2, 'Z2', 'Zone 2', 500);
insert into secteurs (id, marche_id, zone_id, code, libelle, ordre) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'S1', 'Secteur 1', 1),
  ('aaaaaaaa-3333-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000002', 'S2', 'Secteur 2', 2);

-- T1, T2 (zone 1), T3 (zone 2), T4 branchement (zone 1), T5 sans zone
insert into troncons (id, marche_id, reference, categorie, secteur_id, geom) values
  ('aaaaaaaa-5555-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'T1', 'conduite', 'aaaaaaaa-3333-0000-0000-000000000001',
   st_geomfromtext('LINESTRING(-1.9140 34.6810, -1.9130 34.6810)', 4326)),
  ('aaaaaaaa-5555-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'T2', 'conduite', 'aaaaaaaa-3333-0000-0000-000000000001',
   st_geomfromtext('LINESTRING(-1.9130 34.6810, -1.9110 34.6810)', 4326)),
  ('aaaaaaaa-5555-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'T3', 'conduite', 'aaaaaaaa-3333-0000-0000-000000000002',
   st_geomfromtext('LINESTRING(-1.9090 34.6810, -1.9080 34.6810)', 4326)),
  ('aaaaaaaa-5555-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'T4', 'branchement', 'aaaaaaaa-3333-0000-0000-000000000001',
   st_geomfromtext('LINESTRING(-1.9130 34.6830, -1.9120 34.6835)', 4326)),
  ('aaaaaaaa-5555-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'T5', 'conduite', null,
   st_geomfromtext('LINESTRING(-1.9200 34.6920, -1.9190 34.6920)', 4326));

create temporary table t_l (ref text primary key, m numeric);
insert into t_l select reference, longueur_m from troncons where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001';
grant select on t_l to authenticated;

-- Balayages : T1, T3, T4, T5 en octobre ; T1 repassé ; T2 en novembre
insert into balayages (id, marche_id, troncon_id, date_balayage, balaye_le, agent_id) values
  ('aaaaaaaa-8888-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-000000000001', '2026-10-15', '2026-10-15 09:00+00', '00000000-0000-0000-0000-00000000000b'),
  ('aaaaaaaa-8888-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-000000000003', '2026-10-20', '2026-10-20 09:00+00', '00000000-0000-0000-0000-00000000000b'),
  ('aaaaaaaa-8888-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-000000000004', '2026-10-15', '2026-10-15 09:05+00', '00000000-0000-0000-0000-00000000000b'),
  ('aaaaaaaa-8888-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-000000000005', '2026-10-16', '2026-10-16 09:00+00', '00000000-0000-0000-0000-00000000000b'),
  ('aaaaaaaa-8888-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-000000000001', '2026-10-22', '2026-10-22 09:00+00', '00000000-0000-0000-0000-00000000000b'),
  ('aaaaaaaa-8888-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-000000000002', '2026-11-03', '2026-11-03 09:00+00', '00000000-0000-0000-0000-00000000000b');

-- -----------------------------------------------------------------------------
-- 1. Lot d'octobre : proposition du prix 1 (premiers passages jusqu'au 31/10, branchements et tronçons sans zone exclus)
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);

insert into attachements (id, marche_id, intitule, date_arret, os_id, lieu_travaux) values
  ('aaaaaaaa-7777-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Octobre 2026', '2026-10-31',
   'eeeeeeee-0000-0000-0000-000000000002', 'Zones 1 et 2');

select results_eq($$ select zone_numero, executee, attachee, reste, proposee from lineaire_a_attacher('aaaaaaaa-7777-0000-0000-000000000001')
                      where famille = 'balayage' order by zone_numero $$,
  $$ values (1, (select m from t_l where ref = 'T1'), 0::numeric, (select m from t_l where ref = 'T1'), (select m from t_l where ref = 'T1')),
            (2, (select m from t_l where ref = 'T3'), 0::numeric, (select m from t_l where ref = 'T3'), (select m from t_l where ref = 'T3')) $$,
  'octobre : zone 1 = T1 (repasse et branchement exclus, T2 de novembre exclu), zone 2 = T3');
select is((select distinct balaye_sans_zone_m from lineaire_a_attacher('aaaaaaaa-7777-0000-0000-000000000001') where famille = 'balayage'),
  (select m from t_l where ref = 'T5'), 'linéaire balayé sur un tronçon sans zone : signalé, jamais proposé');
select is((select distinct au from lineaire_a_attacher('aaaaaaaa-7777-0000-0000-000000000001')), '2026-10-31'::date,
  'proposition à la date « travaux exécutés au » du lot');
select is((select count(*)::int from lineaire_a_attacher('aaaaaaaa-7777-0000-0000-000000000001')
            where famille = 'maintien' and proposee <> 0), 0, 'maintien : aucune tranche disponible en octobre');

-- -----------------------------------------------------------------------------
-- 2. Option : rien n'entre sans clic ; ajout en un geste ; quantités suivies en direct
-- -----------------------------------------------------------------------------
select is((select count(*)::int from attachement_lignes where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000001'), 0,
  'sans clic, aucune ligne de linéaire dans le lot');
select is((select ajouter_lineaire_attachement('aaaaaaaa-7777-0000-0000-000000000001', 'balayage')), 2,
  'responsable : ajoute le linéaire balayé (une ligne par zone)');
select is((select ajouter_lineaire_attachement('aaaaaaaa-7777-0000-0000-000000000001', 'balayage')), 0,
  'second clic : rien de plus');
select is((select ajouter_lineaire_attachement('aaaaaaaa-7777-0000-0000-000000000001', 'maintien')), 0,
  'maintien : aucune ligne avant la fin de la phase');
select results_eq($$ select zone, quantite, designation from v_attachement_lignes
                      where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000001' order by zone $$,
  $$ values ('Zone 1'::text, (select m from t_l where ref = 'T1'), 'Linéaire balayé (premiers passages), zone 1 : Zone 1'::text),
            ('Zone 2'::text, (select m from t_l where ref = 'T3'), 'Linéaire balayé (premiers passages), zone 2 : Zone 2'::text) $$,
  'brouillon : lignes de linéaire par zone, quantité en direct');
select is((select quantite_lot from v_attachement_recap
            where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000001' and prix_numero = '1'),
  (select sum(m) from t_l where ref in ('T1', 'T3')), 'récapitulatif : prix 1 = T1 + T3');

-- La date du lot gouverne : au 30/11, T2 entre dans le suivi en direct
update attachements set date_arret = '2026-11-30' where id = 'aaaaaaaa-7777-0000-0000-000000000001';
select is((select quantite from v_attachement_lignes where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000001' and zone = 'Zone 1'),
  (select sum(m) from t_l where ref in ('T1', 'T2')), 'date du lot repoussée au 30/11 : T2 suivi en direct');
update attachements set date_arret = '2026-10-31' where id = 'aaaaaaaa-7777-0000-0000-000000000001';

-- -----------------------------------------------------------------------------
-- 3. Contrôles des lignes
-- -----------------------------------------------------------------------------
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, prix_id, zone_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', 'lineaire',
   'aaaaaaaa-4444-0000-0000-000000000003', 'aaaaaaaa-2222-0000-0000-000000000001') $$,
  '23514', 'Ligne de linéaire : article de balayage ou de maintien seulement', 'linéaire : prix 1 ou 2 seulement');
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, prix_id, zone_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', 'lineaire',
   'aaaaaaaa-4444-0000-0000-000000000002', 'aaaaaaaa-2222-0000-0000-000000000001') $$,
  '23514', 'Maintien : tranche obligatoire (phase portant une part du prix)', 'maintien : tranche obligatoire');
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, prix_id, zone_id, phase_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', 'lineaire',
   'aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-6666-0000-0000-000000000002') $$,
  '23514', 'Balayage : pas de tranche', 'balayage : pas de tranche');
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, prix_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', 'lineaire',
   'aaaaaaaa-4444-0000-0000-000000000001') $$,
  '23514', null, 'linéaire : zone obligatoire');

insert into attachements (id, marche_id, intitule) values
  ('aaaaaaaa-7777-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'Autre brouillon');
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, prix_id, zone_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000009', 'lineaire',
   'aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001') $$,
  '23505', 'Ce linéaire est déjà dans le brouillon « Octobre 2026 »', 'un linéaire dans un seul brouillon à la fois');
select is((select ajouter_lineaire_attachement('aaaaaaaa-7777-0000-0000-000000000009', 'balayage')), 0,
  'ajout en un geste : saute les zones déjà dans un autre brouillon');
select is((select autre_brouillon from lineaire_a_attacher('aaaaaaaa-7777-0000-0000-000000000009')
            where famille = 'balayage' and zone_numero = 1), 'Octobre 2026', 'autre brouillon signalé au panneau');
update attachements set supprime_le = now() where id = 'aaaaaaaa-7777-0000-0000-000000000009';

-- L'agent de détection n'a pas le droit « attachements »
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from lineaire_a_attacher('aaaaaaaa-7777-0000-0000-000000000001')), 0,
  'détection : ne voit pas la proposition');
select is((select ajouter_lineaire_attachement('aaaaaaaa-7777-0000-0000-000000000001', 'balayage')), 0,
  'détection : l''ajout en un geste n''ajoute rien');
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, prix_id, zone_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', 'lineaire',
   'aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000002') $$,
  null, null, 'détection : aucune ligne de linéaire (droit « attachements »)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);

-- -----------------------------------------------------------------------------
-- 4. Arrêt : quantités figées
-- -----------------------------------------------------------------------------
select is((select arreter_attachement('aaaaaaaa-7777-0000-0000-000000000001', '2026-10-31')), 1, 'lot d''octobre arrêté, N° 1');
select results_eq($$ select z.numero, l.quantite, l.prix_numero, l.pu_ht from attachement_lignes l join zones z on z.id = l.zone_id
                      where l.attachement_id = 'aaaaaaaa-7777-0000-0000-000000000001' order by z.numero $$,
  $$ values (1, (select m from t_l where ref = 'T1'), '1'::text, 0.30::numeric(12,2)),
            (2, (select m from t_l where ref = 'T3'), '1'::text, 0.30::numeric(12,2)) $$,
  'arrêt : quantités et article figés');

-- -----------------------------------------------------------------------------
-- 5. Lot de novembre : le linéaire déjà attaché n'est jamais repris ; balayage annulé → régularisation
-- -----------------------------------------------------------------------------
insert into attachements (id, marche_id, intitule, date_arret, os_id, lieu_travaux) values
  ('aaaaaaaa-7777-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Novembre 2026', '2026-11-30',
   'eeeeeeee-0000-0000-0000-000000000002', 'Zones 1 et 2');
select results_eq($$ select zone_numero, attachee, proposee from lineaire_a_attacher('aaaaaaaa-7777-0000-0000-000000000002')
                      where famille = 'balayage' order by zone_numero $$,
  $$ values (1, (select m from t_l where ref = 'T1'), (select m from t_l where ref = 'T2')), (2, (select m from t_l where ref = 'T3'), 0::numeric) $$,
  'novembre : zone 1 = T2 seulement, zone 2 = rien');
select is((select ajouter_lineaire_attachement('aaaaaaaa-7777-0000-0000-000000000002', 'balayage')), 1, 'novembre : une ligne (zone 1)');

reset role;
update balayages set annule_le = now(), motif_annulation = 'Tronçon hors périmètre'
 where id = 'aaaaaaaa-8888-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);

select is((select proposee from lineaire_a_attacher('aaaaaaaa-7777-0000-0000-000000000002') where famille = 'balayage' and zone_numero = 2),
  -(select m from t_l where ref = 'T3'), 'balayage de T3 annulé après l''arrêt : régularisation négative en zone 2');
select is((select ajouter_lineaire_attachement('aaaaaaaa-7777-0000-0000-000000000002', 'balayage')), 1, 'régularisation ajoutée au lot');
select results_eq($$ select zone, quantite, regularisation_negative from v_attachement_lignes
                      where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000002' order by zone $$,
  $$ values ('Zone 1'::text, (select m from t_l where ref = 'T2'), false), ('Zone 2'::text, -(select m from t_l where ref = 'T3'), true) $$,
  'novembre : T2 en zone 1, − T3 en zone 2');

-- -----------------------------------------------------------------------------
-- 6. Plafond du marché (bordereau), pas par zone
-- -----------------------------------------------------------------------------
reset role;
update prix set quantite_marche = (select m from t_l where ref = 'T1') + 10 where id = 'aaaaaaaa-4444-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
-- Déjà attaché : T1 + T3 ; la régularisation de zone 2 (− T3) ramène le cumul à T1 : reste 10 m pour la zone 1
select is((select proposee from lineaire_a_attacher('aaaaaaaa-7777-0000-0000-000000000002') where famille = 'balayage' and zone_numero = 1),
  least((select m from t_l where ref = 'T2'), 10),
  'plafond : zone 1 limitée à la quantité du marché restante (régularisation comprise)');
select is((select reste from lineaire_a_attacher('aaaaaaaa-7777-0000-0000-000000000002') where famille = 'balayage' and zone_numero = 1),
  (select m from t_l where ref = 'T2'), 'plafond : le reste exécuté reste affiché');
reset role;
update prix set quantite_marche = 1466000 where id = 'aaaaaaaa-4444-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);

select is((select arreter_attachement('aaaaaaaa-7777-0000-0000-000000000002', '2026-11-30')), 2, 'lot de novembre arrêté, N° 2');
select is((select sum(quantite) from attachement_lignes where prix_id = 'aaaaaaaa-4444-0000-0000-000000000001'),
  (select sum(m) from t_l where ref in ('T1', 'T2')), 'prix 1 attaché au total : T1 + T2 (T3 annulé, régularisé)');

-- -----------------------------------------------------------------------------
-- 7. Prix 2 : tranches 40 % puis 60 % sur le prix 1 attaché de la zone
-- -----------------------------------------------------------------------------
insert into attachements (id, marche_id, intitule, date_arret, os_id, lieu_travaux) values
  ('aaaaaaaa-7777-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Mars 2027', '2027-03-31',
   'eeeeeeee-0000-0000-0000-000000000002', 'Zones 1 et 2');
select is((select ajouter_lineaire_attachement('aaaaaaaa-7777-0000-0000-000000000003', 'maintien')), 0,
  'mars 2027 : tranche de 40 % pas encore disponible');
update attachements set date_arret = '2027-06-01' where id = 'aaaaaaaa-7777-0000-0000-000000000003';
select results_eq($$ select zone_numero, phase, base, part_pct, executee, proposee, disponible from lineaire_a_attacher('aaaaaaaa-7777-0000-0000-000000000003')
                      where famille = 'maintien' and zone_numero = 1 order by phase_fin $$,
  $$ values (1, 'Maintien 1'::text, (select sum(m) from t_l where ref in ('T1', 'T2')), 40.00::numeric,
             round((select sum(m) from t_l where ref in ('T1', 'T2')) * 0.40, 2), round((select sum(m) from t_l where ref in ('T1', 'T2')) * 0.40, 2), true),
            (1, 'Maintien 2'::text, (select sum(m) from t_l where ref in ('T1', 'T2')), 60.00::numeric,
             round((select sum(m) from t_l where ref in ('T1', 'T2')) * 0.60, 2), 0::numeric, false) $$,
  'fin du maintien 1 : 40 % du linéaire attaché de la zone 1 ; 60 % plus tard');
select is((select ajouter_lineaire_attachement('aaaaaaaa-7777-0000-0000-000000000003', 'maintien')), 1,
  'maintien 1 : une ligne (zone 1 ; zone 2 sans linéaire attaché)');
select is((select designation from attachement_lignes where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000003'),
  'Maintien des résultats, Maintien 1 (40 %), zone 1 : Zone 1', 'désignation de la tranche');
select is((select arreter_attachement('aaaaaaaa-7777-0000-0000-000000000003', '2027-06-01')), 3, 'lot de juin 2027 arrêté, N° 3');

-- Réouverture : la ligne redevient suivie en direct
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok($$ select rouvrir_attachement('aaaaaaaa-7777-0000-0000-000000000003', 'Contrôle') $$, 'administrateur : rouvre le lot N° 3');
select is((select quantite from attachement_lignes where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000003'), null::numeric,
  'réouverture : quantité de linéaire rendue au suivi en direct');
select is((select quantite from v_attachement_lignes where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000003'),
  round((select sum(m) from t_l where ref in ('T1', 'T2')) * 0.40, 2), 'réouverture : quantité recalculée');
select is((select arreter_attachement('aaaaaaaa-7777-0000-0000-000000000003', '2027-06-01')), 3, 'lot N° 3 de nouveau arrêté');

-- Zone arrêtée par la SRM : plus de maintien
reset role;
update zones set arret_srm_le = '2027-02-05' where id = 'aaaaaaaa-2222-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
insert into attachements (id, marche_id, intitule, date_arret) values
  ('aaaaaaaa-7777-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Octobre 2027', '2027-10-01');
select results_eq($$ select phase, executee, proposee from lineaire_a_attacher('aaaaaaaa-7777-0000-0000-000000000004')
                      where famille = 'maintien' and zone_numero = 1 order by phase_fin $$,
  $$ values ('Maintien 1'::text, 0::numeric, -round((select sum(m) from t_l where ref in ('T1', 'T2')) * 0.40, 2)),
            ('Maintien 2'::text, 0::numeric, 0::numeric) $$,
  'zone arrêtée par la SRM : plus de maintien, la tranche déjà attachée revient en régularisation');

select * from finish();
rollback;
