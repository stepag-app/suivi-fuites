-- =============================================================================
-- Chantier v2, X3 (lot P3) : inventaire des fournitures posées (v_inventaire_fournitures,
-- resume_fournitures). Droits (responsable et administrateur ; chef, détection, compte sans
-- droit : rien ; isolation entre marchés), inventaire réel (corrections du bureau comprises,
-- pièces remplacées ou retirées et réparations supprimées exclues), famille du produit,
-- mois à l'heure du Maroc, résumé par article et par période, aucun prix.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',      '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'detect.p3@test.local',  '{"identifiant": "detect.p3", "nom_complet": "Détection P3"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chef.p3@test.local',    '{"identifiant": "chef.p3", "nom_complet": "Chef P3"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.p3@test.local',    '{"identifiant": "resp.p3", "nom_complet": "Responsable P3"}'),
  ('00000000-0000-0000-0000-00000000000e', 'resp.autre@test.local', '{"identifiant": "resp.autre", "nom_complet": "Responsable autre"}'),
  ('00000000-0000-0000-0000-00000000000f', 'sans.droit@test.local', '{"identifiant": "sans.droit", "nom_complet": "Sans droit"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000021', 'TEST-P3',  '4500000021', 'Marché P3', 'Client P3'),
  ('aaaaaaaa-0000-0000-0000-000000000022', 'TEST-P3B', '4500000022', 'Marché P3 bis', 'Client P3');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000021', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000021', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000021', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000022', 'responsable');

insert into produits_dolibarr (dolibarr_id, ref, designation, unite, famille, utilisable) values
  (9201, 'RAC09201', 'MANCHON ESSAI DN 25', 'U', 'RAC', true),
  (9202, 'ROB09202', 'ROBINET ESSAI 20', 'U', 'ROB', true),
  (9203, 'CND09203', 'TUBE ESSAI DN 25', 'm', 'CND', true);

insert into fuites (id, marche_id) values
  ('aaaaaaaa-1111-0000-0000-000000000201', 'aaaaaaaa-0000-0000-0000-000000000021'),
  ('aaaaaaaa-1111-0000-0000-000000000202', 'aaaaaaaa-0000-0000-0000-000000000021'),
  ('aaaaaaaa-1111-0000-0000-000000000203', 'aaaaaaaa-0000-0000-0000-000000000021');

-- -----------------------------------------------------------------------------
-- 1. Structure et privilèges
-- -----------------------------------------------------------------------------
select ok(not has_table_privilege('anon', 'public.v_inventaire_fournitures', 'select')
          and has_table_privilege('authenticated', 'public.v_inventaire_fournitures', 'select')
          and not has_table_privilege('authenticated', 'public.v_inventaire_fournitures', 'insert'),
  'vue : lecture seule pour authenticated, rien pour anon');
select ok(not has_function_privilege('anon', 'public.resume_fournitures(uuid, date, date)', 'execute')
          and has_function_privilege('authenticated', 'public.resume_fournitures(uuid, date, date)', 'execute'),
  'resume_fournitures : rien pour anon');
select is_empty($$ select column_name from information_schema.columns
                    where table_schema = 'public' and table_name = 'v_inventaire_fournitures'
                      and (column_name ~ 'prix|pmp|valeur|montant|cout' or column_name in ('ref', 'produit_ref')) $$,
  'vue : ni prix, ni montant, ni référence Dolibarr');
select ok((select reloptions::text ~ 'security_invoker=true' from pg_class where oid = 'public.v_inventaire_fournitures'::regclass),
  'vue : security_invoker (RLS de l''appelant)');

-- -----------------------------------------------------------------------------
-- 2. Saisie : chef (septembre et octobre), corrections du bureau, réparation supprimée
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select lives_ok($$
  insert into reparations (id, marche_id, fuite_id, realisee_le, materiau, diametre_mm, tuyau_repare) values
    ('aaaaaaaa-2222-0000-0000-000000000201', 'aaaaaaaa-0000-0000-0000-000000000021', 'aaaaaaaa-1111-0000-0000-000000000201',
     '2026-09-15 10:00+01', 'polyethylene', 25, true),
    ('aaaaaaaa-2222-0000-0000-000000000202', 'aaaaaaaa-0000-0000-0000-000000000021', 'aaaaaaaa-1111-0000-0000-000000000202',
     '2026-10-10 09:00+01', 'polyethylene', 25, true),
    ('aaaaaaaa-2222-0000-0000-000000000203', 'aaaaaaaa-0000-0000-0000-000000000021', 'aaaaaaaa-1111-0000-0000-000000000203',
     '2026-10-20 09:00+01', 'polyethylene', 25, true);
  insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite) values
    ('aaaaaaaa-6666-0000-0000-000000000201', 'aaaaaaaa-0000-0000-0000-000000000021', 'aaaaaaaa-2222-0000-0000-000000000201', 9201, 2),
    ('aaaaaaaa-6666-0000-0000-000000000202', 'aaaaaaaa-0000-0000-0000-000000000021', 'aaaaaaaa-2222-0000-0000-000000000201', 9202, 1),
    ('aaaaaaaa-6666-0000-0000-000000000203', 'aaaaaaaa-0000-0000-0000-000000000021', 'aaaaaaaa-2222-0000-0000-000000000202', 9201, 3),
    ('aaaaaaaa-6666-0000-0000-000000000204', 'aaaaaaaa-0000-0000-0000-000000000021', 'aaaaaaaa-2222-0000-0000-000000000202', 9203, 1.5),
    ('aaaaaaaa-6666-0000-0000-000000000205', 'aaaaaaaa-0000-0000-0000-000000000021', 'aaaaaaaa-2222-0000-0000-000000000203', 9201, 4);
$$, 'chef : trois réparations et leurs pièces');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$
  insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite, remplace_piece_id, motif_modification) values
    ('aaaaaaaa-6666-0000-0000-000000000206', 'aaaaaaaa-0000-0000-0000-000000000021', 'aaaaaaaa-2222-0000-0000-000000000201',
     9201, 1, 'aaaaaaaa-6666-0000-0000-000000000201', 'Un seul manchon posé');
  insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite, motif_modification) values
    ('aaaaaaaa-6666-0000-0000-000000000207', 'aaaaaaaa-0000-0000-0000-000000000021', 'aaaaaaaa-2222-0000-0000-000000000202',
     9202, 1, 'Robinet oublié (photo)');
  update reparation_pieces set etat = 'retiree', motif_modification = 'Robinet non posé'
   where id = 'aaaaaaaa-6666-0000-0000-000000000202';
$$, 'responsable : remplacement, oubli et retrait, avec motif');
reset role;
update reparations set supprime_le = now() where id = 'aaaaaaaa-2222-0000-0000-000000000203';

-- -----------------------------------------------------------------------------
-- 3. Lecture
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select results_eq($$ select produit_id, designation, famille, unite, quantite, provenance, nature_correction, mois
                       from v_inventaire_fournitures order by jour, produit_id, quantite $$,
  $$ values (9201, 'MANCHON ESSAI DN 25'::text, 'RAC'::text, 'U'::text, 1.00::numeric, 'correction'::text, 'remplacement'::text, '2026-09'::text),
            (9201, 'MANCHON ESSAI DN 25', 'RAC', 'U', 3.00, 'terrain', null, '2026-10'),
            (9202, 'ROBINET ESSAI 20', 'ROB', 'U', 1.00, 'correction', 'oubli', '2026-10'),
            (9203, 'TUBE ESSAI DN 25', 'CND', 'm', 1.50, 'terrain', null, '2026-10') $$,
  'responsable : inventaire réel (remplacée, retirée et réparation supprimée exclues), famille du produit, mois');
select is((select sum(quantite) from v_inventaire_fournitures),
  (select sum(quantite) from v_pieces_reelles where marche_id = 'aaaaaaaa-0000-0000-0000-000000000021'),
  'inventaire : exactement v_pieces_reelles');
select results_eq($$ select produit_id, designation, famille, unite, quantite, pieces, fuites, corrections
                       from resume_fournitures('aaaaaaaa-0000-0000-0000-000000000021') $$,
  $$ values (9201, 'MANCHON ESSAI DN 25'::text, 'RAC'::text, 'U'::text, 4.00::numeric, 2, 2, 1),
            (9203, 'TUBE ESSAI DN 25', 'CND', 'm', 1.50, 1, 1, 0),
            (9202, 'ROBINET ESSAI 20', 'ROB', 'U', 1.00, 1, 1, 1) $$,
  'résumé : quantités par article, pièces, fuites, corrections du bureau, par quantité décroissante');
select results_eq($$ select produit_id, quantite from resume_fournitures('aaaaaaaa-0000-0000-0000-000000000021', '2026-10-01', '2026-10-31') order by produit_id $$,
  $$ values (9201, 3.00::numeric), (9202, 1.00), (9203, 1.50) $$,
  'résumé sur une période (octobre)');
select is((select count(*)::int from resume_fournitures('aaaaaaaa-0000-0000-0000-000000000021', '2026-11-01', null)), 0,
  'résumé : période sans pose, aucune ligne');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select count(*)::int from v_inventaire_fournitures), 4, 'administrateur : voit l''inventaire');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((select count(*)::int from v_inventaire_fournitures)
          + (select count(*)::int from resume_fournitures('aaaaaaaa-0000-0000-0000-000000000021')), 0,
  'chef de réparation : pas d''inventaire (droit « quantités / lire » absent)');
select ok((select count(*) from v_pieces_reelles) > 0, 'chef : voit pourtant ses pièces (fiche de la fuite)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from v_inventaire_fournitures), 0, 'détection : pas d''inventaire');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select is((select count(*)::int from v_inventaire_fournitures)
          + (select count(*)::int from resume_fournitures('aaaaaaaa-0000-0000-0000-000000000021')), 0,
  'responsable d''un autre marché : rien (isolation)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
select is((select count(*)::int from v_inventaire_fournitures), 0, 'compte sans droit : rien');

select * from finish();
rollback;
