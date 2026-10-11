-- =============================================================================
-- Rôles de terrain : chacun ne saisit que son étape (Détection → fuite, Réparation → réparation,
-- Réfection → réfection) ; les rôles cochés ensemble se cumulent. Migration 20261015200000.
-- Tout se passe dans une transaction annulée à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

-- a admin, b détection, c réparation, e réfection, f réparation + réfection, g détection + réparation
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local', '{"identifiant": "issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'det@test.local',   '{"identifiant": "det"}'),
  ('00000000-0000-0000-0000-00000000000c', 'rep@test.local',   '{"identifiant": "rep"}'),
  ('00000000-0000-0000-0000-00000000000e', 'refe@test.local',  '{"identifiant": "refe"}'),
  ('00000000-0000-0000-0000-00000000000f', 'repf@test.local',  '{"identifiant": "repf"}'),
  ('00000000-0000-0000-0000-000000000010', 'detr@test.local',  '{"identifiant": "detr"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-R', '1', 'Marché R', 'Client R');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000001', 'refection');
select appliquer_modele_role('00000000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');

insert into natures_refection (id, marche_id, code, libelle_fr, emplacement) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'beton', 'Béton', 'trottoir');

-- Fuites « système » (sans auteur) ; la 9 a une réparation pour les réfections
insert into fuites (id, marche_id) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-1111-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into reparations (id, marche_id, fuite_id, fouille_longueur_m, fouille_largeur_m, emplacement, nature_revetement_id) values
  ('aaaaaaaa-2222-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009',
   1, 0.5, 'trottoir', 'cccccccc-0000-0000-0000-000000000001');

-- -----------------------------------------------------------------------------
-- 1. Modèle du rôle Réparation
-- -----------------------------------------------------------------------------
select results_eq($$ select lire, creer, modifier::text, supprimer::text, valider from modeles_droits
                      where role = 'chef_reparation' and type_donnee = 'fuites' $$,
  $$ values (true, false, 'non', 'non', false) $$, 'modèle Réparation : fuites en lecture seule');

set local role authenticated;

-- -----------------------------------------------------------------------------
-- 2. Réparation seule
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select results_eq($$ select private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'fuites', 'lire'),
                            private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'fuites', 'creer'),
                            private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'interventions', 'creer'),
                            private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'refections', 'creer') $$,
  $$ values (true, false, true, false) $$, 'Réparation seule : voit les fuites, saisit les réparations, rien d''autre');
select throws_ok($$ insert into fuites (marche_id) values ('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'Réparation seule : ne signale pas de fuite');
select lives_ok($$ insert into reparations (marche_id, fuite_id, resultat, fouille_longueur_m, fouille_largeur_m,
                                             fouille_profondeur_m, emplacement, nature_revetement_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'en_cours', 1, 0.5, 0.5, 'trottoir',
   'cccccccc-0000-0000-0000-000000000001') $$,
  'Réparation seule : saisit sa réparation');
select is((select statut::text from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001'), 'en_reparation',
  'le statut de la fuite suit la réparation sans droit d''écriture sur la fuite');
select results_eq($$ with u as (update fuites set observation = 'x' where id = 'aaaaaaaa-1111-0000-0000-000000000001'
                                returning 1) select count(*)::int from u $$,
  $$ values (0) $$, 'Réparation seule : ne modifie pas la fuite');
select throws_ok($$ insert into refections (marche_id, fuite_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009') $$,
  '42501', null, 'Réparation seule : ne saisit pas de réfection');

-- -----------------------------------------------------------------------------
-- 3. Réfection seule
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select throws_ok($$ insert into fuites (marche_id) values ('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'Réfection seule : ne signale pas de fuite');
select throws_ok($$ insert into reparations (marche_id, fuite_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009') $$,
  '42501', null, 'Réfection seule : ne saisit pas de réparation');
select lives_ok($$ insert into refections (marche_id, fuite_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009') $$,
  'Réfection seule : saisit sa réfection');

-- -----------------------------------------------------------------------------
-- 4. Réparation et Réfection cochées ensemble (Utilisateurs > rôles)
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ select modifier_roles('00000000-0000-0000-0000-00000000000f', 'aaaaaaaa-0000-0000-0000-000000000001',
                                         array['chef_reparation', 'refection']) $$,
  'administrateur : coche Réparation et Réfection');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
select results_eq($$ select private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'fuites', 'creer'),
                            private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'interventions', 'creer'),
                            private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'refections', 'creer') $$,
  $$ values (false, true, true) $$, 'Réparation + Réfection : réparations et réfections, pas de fuite');
select throws_ok($$ insert into fuites (marche_id) values ('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'Réparation + Réfection : ne signale pas de fuite');
select lives_ok($$ insert into reparations (marche_id, fuite_id, resultat, fouille_longueur_m, fouille_largeur_m,
                                             fouille_profondeur_m, emplacement, nature_revetement_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009', 'en_cours', 1, 0.5, 0.5, 'trottoir',
   'cccccccc-0000-0000-0000-000000000001') $$,
  'Réparation + Réfection : saisit une réparation');
select lives_ok($$ insert into refections (marche_id, fuite_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009') $$,
  'Réparation + Réfection : saisit une réfection');

-- -----------------------------------------------------------------------------
-- 5. Détection seule, puis Détection + Réparation
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select lives_ok($$ insert into fuites (marche_id) values ('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'Détection seule : signale une fuite');
select throws_ok($$ insert into reparations (marche_id, fuite_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001') $$,
  '42501', null, 'Détection seule : ne saisit pas de réparation');
select throws_ok($$ insert into refections (marche_id, fuite_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009') $$,
  '42501', null, 'Détection seule : ne saisit pas de réfection');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000010", "role": "authenticated"}', true);
select results_eq($$ select private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'fuites', 'creer'),
                            private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'interventions', 'creer'),
                            private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'refections', 'creer') $$,
  $$ values (true, true, false) $$, 'Détection + Réparation : fuites et réparations');
select lives_ok($$ insert into fuites (marche_id) values ('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'Détection + Réparation : signale une fuite');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ select modifier_roles('00000000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001',
                                         array['chef_reparation']) $$,
  'administrateur : décoche Détection');
select results_eq($$ select creer, modifier::text from droits
                      where profil_id = '00000000-0000-0000-0000-000000000010' and type_donnee = 'fuites' $$,
  $$ values (false, 'non') $$, 'Détection décochée : plus de fuite à signaler ni à modifier');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000010", "role": "authenticated"}', true);
select throws_ok($$ insert into fuites (marche_id) values ('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'Réparation restante : ne signale plus de fuite');

-- -----------------------------------------------------------------------------
-- 6. Droits recalculés par la migration : aucun compte sans Détection ni Responsable ne signale
-- -----------------------------------------------------------------------------
reset role;
select is((select count(*)::int
             from droits d
             join affectations a on a.profil_id = d.profil_id and a.marche_id = d.marche_id
            where d.type_donnee = 'fuites' and d.creer
              and not a.roles && array['detection', 'responsable']), 0,
  'aucun compte sans rôle Détection ni Responsable n''a « fuites / créer »');
select is((select count(*)::int
             from droits d
             join affectations a on a.profil_id = d.profil_id and a.marche_id = d.marche_id
            where d.type_donnee = 'fuites' and d.modifier <> 'non'
              and not a.roles && array['detection', 'responsable']), 0,
  'aucun compte sans rôle Détection ni Responsable ne modifie une fuite');
select results_eq($$ select role from modeles_droits where type_donnee = 'fuites' and creer order by 1 $$,
  $$ values ('detection'), ('responsable') $$, 'seuls Détection et Responsable signalent une fuite');
select results_eq($$ select role from modeles_droits where type_donnee = 'interventions' and creer order by 1 $$,
  $$ values ('chef_reparation'), ('responsable') $$, 'seuls Réparation et Responsable saisissent une réparation');
select results_eq($$ select role from modeles_droits where type_donnee = 'refections' and creer order by 1 $$,
  $$ values ('refection'), ('responsable') $$, 'seuls Réfection et Responsable saisissent une réfection');

select * from finish();
rollback;
