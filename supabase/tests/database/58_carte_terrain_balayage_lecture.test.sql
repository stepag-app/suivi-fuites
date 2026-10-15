-- =============================================================================
-- Carte terrain : les rôles Réparation et Réfection lisent les balayages de leur marché, sans les
-- saisir ni les annuler ; isolation entre marchés ; rôles recalculés. Migration 20261016800000.
-- Tout se passe dans une transaction annulée à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

-- a admin, b détection (A), c réparation (A), e réfection (A), f réparation (B), g ancien compte Réparation (A)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local', '{"identifiant": "issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'det@test.local',   '{"identifiant": "det"}'),
  ('00000000-0000-0000-0000-00000000000c', 'rep@test.local',   '{"identifiant": "rep"}'),
  ('00000000-0000-0000-0000-00000000000e', 'refe@test.local',  '{"identifiant": "refe"}'),
  ('00000000-0000-0000-0000-00000000000f', 'repb@test.local',  '{"identifiant": "repb"}'),
  ('00000000-0000-0000-0000-000000000010', 'ancien@test.local', '{"identifiant": "ancien"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-A', '1', 'Marché A', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-B', '2', 'Marché B', 'Client B');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000001', 'refection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000f', 'bbbbbbbb-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001', 'detection');

insert into zones (id, marche_id, numero, code, libelle, lineaire_m) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1, 'Z1', 'Zone 1', 1000);
insert into secteurs (id, marche_id, zone_id, code, libelle, lineaire_m, ordre, geom) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
   'S1', 'Secteur 1', 400, 1,
   st_multi(st_geomfromtext('POLYGON((-1.9150 34.6800, -1.9100 34.6800, -1.9100 34.6850, -1.9150 34.6850, -1.9150 34.6800))', 4326)));
insert into troncons (id, marche_id, reference, geom) values
  ('aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'T1',
   st_geomfromtext('LINESTRING(-1.9140 34.6810, -1.9130 34.6810)', 4326)),
  ('aaaaaaaa-4444-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'T2',
   st_geomfromtext('LINESTRING(-1.9130 34.6810, -1.9120 34.6810)', 4326)),
  ('bbbbbbbb-4444-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'TB1',
   st_geomfromtext('LINESTRING(-1.9140 34.6810, -1.9130 34.6810)', 4326));

-- -----------------------------------------------------------------------------
-- 1. Modèles des rôles
-- -----------------------------------------------------------------------------
select results_eq($$ select role, lire, creer, modifier::text, supprimer::text, valider from modeles_droits
                      where type_donnee = 'balayage' and role in ('chef_reparation', 'refection') order by role $$,
  $$ values ('chef_reparation', true, false, 'non', 'non', false), ('refection', true, false, 'non', 'non', false) $$,
  'modèles Réparation et Réfection : balayage en lecture seule');
select results_eq($$ select lire, creer, supprimer::text from modeles_droits where role = 'detection' and type_donnee = 'balayage' $$,
  $$ values (true, true, 'siennes') $$, 'modèle Détection inchangé : voit, coche, annule les siens');

set local role authenticated;

-- La détection balaie T1 dans A et TB1 dans B.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select lives_ok($$ insert into balayages (id, marche_id, troncon_id) values
  ('aaaaaaaa-8888-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000001'),
  ('bbbbbbbb-8888-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-4444-0000-0000-000000000001') $$,
  'détection : balaie un tronçon dans chaque marché');

-- -----------------------------------------------------------------------------
-- 2. Réparation seule : lit, ne saisit ni n'annule
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select results_eq($$ select private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'balayage', 'lire'),
                            private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'balayage', 'creer'),
                            private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'balayage', 'supprimer') $$,
  $$ values (true, false, false) $$, 'Réparation : balayage en lecture seule');
select results_eq($$ select id::text from balayages $$, $$ values ('aaaaaaaa-8888-0000-0000-000000000001') $$,
  'Réparation : voit le balayage de son marché, pas celui de B');
select is((etat_balayage_compact('aaaaaaaa-0000-0000-0000-000000000001') -> 't'), '["aaaaaaaa-4444-0000-0000-000000000001"]'::jsonb,
  'Réparation : état de balayage du marché lu (carte terrain)');
select is((select statut_balayage::text from secteurs where id = 'aaaaaaaa-3333-0000-0000-000000000001'), 'en_cours',
  'Réparation : état du secteur lu (secteur teinté)');
select throws_ok($$ insert into balayages (marche_id, troncon_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000002') $$,
  '42501', null, 'Réparation : ne balaie pas');
select results_eq($$ with u as (update balayages set annule_le = now(), motif_annulation = 'x'
                                 where id = 'aaaaaaaa-8888-0000-0000-000000000001' returning 1) select count(*)::int from u $$,
  $$ values (0) $$, 'Réparation : n''annule pas un balayage');

-- -----------------------------------------------------------------------------
-- 3. Réfection seule, Réparation d'un autre marché
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select results_eq($$ select private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'balayage', 'lire'),
                            private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'balayage', 'creer') $$,
  $$ values (true, false) $$, 'Réfection : balayage en lecture seule');
select is((select count(*)::int from balayages), 1, 'Réfection : voit le balayage de son marché');
select throws_ok($$ insert into balayages (marche_id, troncon_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000002') $$,
  '42501', null, 'Réfection : ne balaie pas');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
select results_eq($$ select id::text from balayages $$, $$ values ('bbbbbbbb-8888-0000-0000-000000000001') $$,
  'Réparation de B : ne voit que le balayage de B');
select is((etat_balayage_compact('aaaaaaaa-0000-0000-0000-000000000001') -> 't'), '[]'::jsonb,
  'Réparation de B : rien de l''état de balayage de A');

-- -----------------------------------------------------------------------------
-- 4. Rôles changés par l'administrateur : recalcul depuis les modèles
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ select modifier_roles('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001',
                                         array['refection']) $$,
  'administrateur : Réparation remplacée par Réfection');
select results_eq($$ select lire, creer from droits where profil_id = '00000000-0000-0000-0000-00000000000c'
                      and marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and type_donnee = 'balayage' $$,
  $$ values (true, false) $$, 'Réfection seule : la lecture des balayages reste');
select lives_ok($$ select modifier_roles('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001',
                                         array['detection', 'chef_reparation']) $$,
  'administrateur : Détection + Réparation');
select results_eq($$ select lire, creer from droits where profil_id = '00000000-0000-0000-0000-00000000000c'
                      and marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and type_donnee = 'balayage' $$,
  $$ values (true, true) $$, 'Détection + Réparation : voit et balaie');
select lives_ok($$ select modifier_roles('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001',
                                         array['chef_reparation']) $$,
  'administrateur : Détection retirée');
select results_eq($$ select lire, creer from droits where profil_id = '00000000-0000-0000-0000-00000000000c'
                      and marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and type_donnee = 'balayage' $$,
  $$ values (true, false) $$, 'Réparation seule à nouveau : lecture gardée, saisie retirée');

-- -----------------------------------------------------------------------------
-- 5. Comptes affectés avant la migration : rattrapage (instruction 2 de la migration, rejouée)
-- -----------------------------------------------------------------------------
reset role;
insert into affectations (profil_id, marche_id, roles) values
  ('00000000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', array['chef_reparation']);
insert into droits (profil_id, marche_id, type_donnee, lire) values
  ('00000000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', 'fuites', true);
insert into public.droits as d (profil_id, marche_id, type_donnee, lire, creer, modifier, supprimer, valider)
select a.profil_id, a.marche_id, 'balayage'::public.type_donnee, true, false,
       'non'::public.portee_droit, 'non'::public.portee_droit, false
  from public.affectations a
 where a.roles && array['chef_reparation', 'refection']::text[]
on conflict (profil_id, marche_id, type_donnee) do update
  set lire = true
  where not d.lire;
select results_eq($$ select lire, creer, supprimer::text from droits where profil_id = '00000000-0000-0000-0000-000000000010'
                      and type_donnee = 'balayage' $$,
  $$ values (true, false, 'non') $$, 'ancien compte Réparation : lecture des balayages ajoutée');
select results_eq($$ select lire, creer, supprimer::text from droits where profil_id = '00000000-0000-0000-0000-00000000000b'
                      and marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and type_donnee = 'balayage' $$,
  $$ values (true, true, 'siennes') $$, 'compte Détection : droits balayage inchangés par le rattrapage');

select * from finish();
rollback;
