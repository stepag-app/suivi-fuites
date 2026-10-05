-- =============================================================================
-- Tests du lot R : contrôles et corrections à l'attachement.
--  1. Pièces « ajoutées au bureau » (indicateur, auteur, date posés par le serveur),
--     droits d'ajout sur la réparation d'un autre agent.
--  2. Lignes de quantités : motif obligatoire (ajout, article, quantité, suppression),
--     journal, article d'origine non reproposé, une unité par prix et par fuite, droits.
--  3. Lot arrêté figé après une requalification (régularisations).
--  4. Contrôles de cohérence (v_controles_attachement) et travaux hors bordereau
--     (v_hors_bordereau), réservés aux comptes « attachements » et « quantités ».
-- Tout se passe dans une transaction annulée à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(67);

-- -----------------------------------------------------------------------------
-- Jeu d'essai : a = admin, b = détection, c = chef de réparation, e = second chef,
-- d = responsable ; un marché, 13 articles et un article hors bordereau, 14 fuites.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',    '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'detect.r@test.local', '{"identifiant": "detect.r", "nom_complet": "Détection R"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chef.r@test.local',   '{"identifiant": "chef.r", "nom_complet": "Chef R"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.r@test.local',   '{"identifiant": "resp.r", "nom_complet": "Responsable R"}'),
  ('00000000-0000-0000-0000-00000000000e', 'chef.s@test.local',   '{"identifiant": "chef.s", "nom_complet": "Chef S"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-R', '4500000001', 'Marché R', 'Client R');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');

insert into prix (id, marche_id, numero, ordre, designation, unite, pu_ht, famille, materiaux, diametre_min_mm, diametre_max_mm, hors_bordereau) values
  ('aaaaaaaa-4444-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '3', 3, 'Terrassement', 'm3', 50, 'terrassement', null, null, null, false),
  ('aaaaaaaa-4444-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '4', 4, 'Réfection trottoir', 'm2', 100, 'refection', null, null, null, false),
  ('aaaaaaaa-4444-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', '5', 5, 'Réfection chaussée', 'm2', 150, 'refection', null, null, null, false),
  ('aaaaaaaa-4444-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', '6', 6, 'PE DE < 40', 'u', 400, 'reparation_tuyau', array['polyethylene'], null, 39, false),
  ('aaaaaaaa-4444-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', '7', 7, 'Robinet PEC', 'u', 460, 'robinet_pec', null, null, null, false),
  ('aaaaaaaa-4444-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', '8', 8, 'Collier PEC', 'u', 460, 'collier_pec', null, null, null, false),
  ('aaaaaaaa-4444-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', '9', 9, 'PE DE >= 40', 'u', 400, 'reparation_tuyau', array['polyethylene'], 40, null, false),
  ('aaaaaaaa-4444-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', '10', 10, 'Bouche à clé', 'u', 140, 'bouche_a_cle', null, null, null, false),
  ('aaaaaaaa-4444-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001', '11', 11, 'AC/PVC 225-315', 'u', 4000, 'reparation_tuyau', array['amiante_ciment', 'pvc'], 225, 315, false),
  ('aaaaaaaa-4444-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-000000000001', '12', 12, 'AC/PVC 110-200', 'u', 2900, 'reparation_tuyau', array['amiante_ciment', 'pvc'], 110, 200, false),
  ('aaaaaaaa-4444-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000001', '13', 13, 'AC/PVC < 110', 'u', 2000, 'reparation_tuyau', array['amiante_ciment', 'pvc'], null, 109, false),
  ('aaaaaaaa-4444-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-000000000001', 'HB-01', 20, 'Pièce spéciale', 'u', 300, 'autre', null, null, null, true);

insert into natures_refection (id, marche_id, code, libelle_fr, emplacement, prix_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'beton', 'Béton', 'trottoir', 'aaaaaaaa-4444-0000-0000-000000000004'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'enrobe', 'Enrobé', 'chaussee', 'aaaaaaaa-4444-0000-0000-000000000005');

insert into catalogue_pieces (id, marche_id, designation, unite, prix_suggere_id) values
  ('aaaaaaaa-5555-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Robinet PEC 20/25', 'u', 'aaaaaaaa-4444-0000-0000-000000000007'),
  ('aaaaaaaa-5555-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Collier PEC 63/20', 'u', 'aaaaaaaa-4444-0000-0000-000000000008'),
  ('aaaaaaaa-5555-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Manchon droit 25/25', 'u', 'aaaaaaaa-4444-0000-0000-000000000006'),
  ('aaaaaaaa-5555-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Robinet vanne 400', 'u', null),
  ('aaaaaaaa-5555-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Té fonte (hors bordereau)', 'u', 'aaaaaaaa-4444-0000-0000-0000000000b1');

insert into ordres_service (id, marche_id, numero, date_os, objet, nature) values
  ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '02', '2026-09-25', 'Commencement', 'commencement');

insert into fuites (id, marche_id, date_detection)
select ('aaaaaaaa-1111-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'aaaaaaaa-0000-0000-0000-000000000001',
       now() - interval '45 days'
  from generate_series(1, 14) n;

-- -----------------------------------------------------------------------------
-- 1. Pièces posées : déclarées sur le terrain ou ajoutées au bureau
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);

select lives_ok($$
  insert into reparations (id, marche_id, fuite_id, materiau, diametre_mm, tuyau_repare,
                           fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m)
  values ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-1111-0000-0000-000000000001', 'polyethylene', 25, true, 1.0, 0.6, 0.8)
$$, 'chef : saisit sa réparation (PE DE 25)');

select lives_ok($$
  insert into reparation_pieces (id, marche_id, reparation_id, piece_id, quantite) values
    ('aaaaaaaa-6666-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
     'aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-000000000003', 2);
  insert into reparation_pieces (id, marche_id, reparation_id, piece_id, quantite, ajoutee_bureau, ajoutee_bureau_par, ajoutee_bureau_le) values
    ('aaaaaaaa-6666-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
     'aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-000000000003', 1,
     true, '00000000-0000-0000-0000-00000000000d', now());
$$, 'chef : déclare ses pièces posées');

select results_eq($$ select ajoutee_bureau, ajoutee_bureau_par is null, ajoutee_bureau_le is null from reparation_pieces
                      where reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001' order by id $$,
  $$ values (false, true, true), (false, true, true) $$,
  'pièces du réparateur : déclarées sur le terrain, indicateur non falsifiable par le client');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, piece_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-000000000003', 1) $$,
  '42501', 'Ajout d''une pièce refusé : réparation saisie par un autre agent',
  'second chef : n''ajoute pas de pièce à la réparation d''un autre');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, piece_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-000000000003', 1) $$,
  '42501', null, 'détection : n''ajoute pas de pièce');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ insert into reparation_pieces (id, marche_id, reparation_id, piece_id, quantite) values
  ('aaaaaaaa-6666-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-000000000001', 1) $$,
  'responsable : ajoute une pièce à la réparation du chef');
select results_eq($$ select ajoutee_bureau, ajoutee_bureau_par::text, ajoutee_bureau_le is not null from reparation_pieces
                      where id = 'aaaaaaaa-6666-0000-0000-000000000003' $$,
  $$ values (true, '00000000-0000-0000-0000-00000000000d', true) $$,
  'pièce du responsable : ajoutée au bureau, avec son auteur et sa date');
select lives_ok($$ update reparation_pieces set ajoutee_bureau = false, ajoutee_bureau_par = null, quantite = 2
                    where id = 'aaaaaaaa-6666-0000-0000-000000000003' $$,
  'responsable : modifie la pièce et tente d''effacer la marque');
select results_eq($$ select ajoutee_bureau, ajoutee_bureau_par::text, quantite from reparation_pieces
                      where id = 'aaaaaaaa-6666-0000-0000-000000000003' $$,
  $$ values (true, '00000000-0000-0000-0000-00000000000d', 2.00::numeric) $$,
  'la marque « ajoutée au bureau » ne s''efface pas');

select lives_ok($$
  insert into reparations (id, marche_id, fuite_id, auteur_terrain_id, source_saisie, materiau, diametre_mm, tuyau_repare,
                           fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m)
  values ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-1111-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000e', 'papier',
          'polyethylene', 25, true, 1.0, 0.5, 0.6);
  insert into reparation_pieces (id, marche_id, reparation_id, piece_id, quantite) values
    ('aaaaaaaa-6666-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
     'aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-5555-0000-0000-000000000003', 2);
$$, 'responsable : recopie la fiche papier du second chef (réparation et pièces)');
select is((select ajoutee_bureau from reparation_pieces where id = 'aaaaaaaa-6666-0000-0000-000000000004'), false,
  'pièces recopiées avec la réparation : déclaration du réparateur');
reset role;

-- Le lendemain
update reparations set cree_le = now() - interval '1 day'
 where id in ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ insert into reparation_pieces (id, marche_id, reparation_id, piece_id, quantite) values
  ('aaaaaaaa-6666-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-5555-0000-0000-000000000003', 1) $$,
  'responsable : ajoute une pièce le lendemain à la réparation recopiée');
select is((select ajoutee_bureau from reparation_pieces where id = 'aaaaaaaa-6666-0000-0000-000000000005'), true,
  'ajout après coup par le responsable : ajoutée au bureau');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select lives_ok($$ insert into reparation_pieces (id, marche_id, reparation_id, piece_id, quantite) values
  ('aaaaaaaa-6666-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-000000000003', 1) $$,
  'chef : complète sa propre réparation le lendemain (tablette)');
select is((select ajoutee_bureau from reparation_pieces where id = 'aaaaaaaa-6666-0000-0000-000000000006'), false,
  'le réparateur fait foi : sa pièce reste déclarée sur le terrain');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select results_eq($$ select count(*) filter (where ajoutee_bureau), count(*) filter (where not ajoutee_bureau)
                      from v_pieces_posees where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values (1::bigint, 3::bigint) $$,
  'v_pieces_posees : filtre « ajoutée au bureau » pour l''inventaire');

-- -----------------------------------------------------------------------------
-- 2. Lignes de quantités : motif obligatoire, journal, requalification
-- -----------------------------------------------------------------------------
select throws_ok($$ update lignes_quantites set quantite = 0.5
                     where reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001' and prix_id = 'aaaaaaaa-4444-0000-0000-000000000003' $$,
  '23514', 'Motif obligatoire pour modifier une ligne de quantités (ajout, article, quantité ou suppression)',
  'quantité corrigée sans motif : refusée');
select lives_ok($$ update lignes_quantites set quantite = 0.5, motif_modification = 'Relevé contradictoire du 05/10'
                    where reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001' and prix_id = 'aaaaaaaa-4444-0000-0000-000000000003' $$,
  'quantité corrigée avec motif');
select results_eq($$ select quantite, origine::text, motif_correction, corrigee_par::text, motif_modification is null
                      from lignes_quantites
                     where reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001' and prix_id = 'aaaaaaaa-4444-0000-0000-000000000003' $$,
  $$ values (0.500::numeric, 'manuel'::text, 'Relevé contradictoire du 05/10'::text, '00000000-0000-0000-0000-00000000000d'::text, true) $$,
  'motif, auteur gardés ; ligne devenue manuelle');
select ok(exists (select 1 from journal
                   where table_nom = 'lignes_quantites' and operation = 'modification'
                     and changements -> 'quantite' ->> 0 = '0.480' and changements -> 'quantite' ->> 1 = '0.500'
                     and changements -> 'motif_correction' ->> 1 = 'Relevé contradictoire du 05/10'),
  'journal : ancienne quantité et motif');

select lives_ok($$ update lignes_quantites set prix_id = 'aaaaaaaa-4444-0000-0000-000000000009', motif_modification = 'Diamètre relevé : DE 40'
                    where reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001' and prix_id = 'aaaaaaaa-4444-0000-0000-000000000006' $$,
  'requalification : prix 6 → prix 9, avec motif');
select results_eq($$ select p.numero, pi.numero from lignes_quantites l
                      join prix p on p.id = l.prix_id join prix pi on pi.id = l.prix_initial_id
                     where l.reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001' and l.prix_id = 'aaaaaaaa-4444-0000-0000-000000000009' $$,
  $$ values ('9'::text, '6'::text) $$, 'requalification : article d''origine gardé');
select ok(exists (select 1 from journal
                   where table_nom = 'lignes_quantites' and operation = 'modification'
                     and changements -> 'prix_id' ->> 0 = 'aaaaaaaa-4444-0000-0000-000000000006'
                     and changements -> 'prix_id' ->> 1 = 'aaaaaaaa-4444-0000-0000-000000000009'),
  'journal : ancien article de la ligne requalifiée');
reset role;

-- Recalcul automatique de la réparation : l'article remplacé n'est pas reproposé
update reparations set observation = 'Recalcul' where id = 'aaaaaaaa-2222-0000-0000-000000000001';
select results_eq($$ select p.numero from lignes_quantites l join prix p on p.id = l.prix_id
                      where l.fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' and l.supprime_le is null order by p.ordre $$,
  $$ values ('3'::text), ('9'::text) $$, 'recalcul : pas de prix 6 en plus du prix 9 (aucune double facturation)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ insert into lignes_quantites (marche_id, fuite_id, reparation_id, prix_id, quantite, date_execution) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
   'aaaaaaaa-4444-0000-0000-000000000007', 1, current_date) $$,
  '23514', 'Motif obligatoire pour modifier une ligne de quantités (ajout, article, quantité ou suppression)',
  'ligne ajoutée sans motif : refusée');
select lives_ok($$ insert into lignes_quantites (marche_id, fuite_id, reparation_id, prix_id, quantite, date_execution, origine, motif_modification) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
   'aaaaaaaa-4444-0000-0000-000000000007', 1, current_date, 'auto', 'Robinet PEC posé, case oubliée sur le terrain') $$,
  'ligne ajoutée avec motif');
select results_eq($$ select origine::text, corrigee_par::text from lignes_quantites
                      where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' and prix_id = 'aaaaaaaa-4444-0000-0000-000000000007' $$,
  $$ values ('manuel'::text, '00000000-0000-0000-0000-00000000000d'::text) $$, 'ligne ajoutée : toujours manuelle, auteur gardé');
select throws_ok($$ insert into lignes_quantites (marche_id, fuite_id, reparation_id, prix_id, quantite, date_execution, motif_modification) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
   'aaaaaaaa-4444-0000-0000-000000000007', 1, current_date, 'Deuxième robinet') $$,
  '23514', 'Une seule unité de cet article par fuite (réglage du marché)', 'une seule unité de prix 7 par fuite');
select throws_ok($$ update lignes_quantites set quantite = 2, motif_modification = 'Deux joints'
                     where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' and prix_id = 'aaaaaaaa-4444-0000-0000-000000000009' $$,
  '23514', 'Une seule unité de cet article par fuite (réglage du marché)', 'une réparation = une unité par prix');
select throws_ok($$ insert into lignes_quantites (marche_id, fuite_id, reparation_id, prix_id, quantite, date_execution, motif_modification) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000002',
   'aaaaaaaa-4444-0000-0000-000000000010', 1, current_date, 'x') $$,
  '23514', 'La réparation indiquée n''appartient pas à cette fuite', 'ligne rattachée à la réparation d''une autre fuite : refusée');
select throws_ok($$ update lignes_quantites set supprime_le = now()
                     where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' and prix_id = 'aaaaaaaa-4444-0000-0000-000000000007' $$,
  '23514', 'Motif obligatoire pour modifier une ligne de quantités (ajout, article, quantité ou suppression)',
  'suppression sans motif : refusée');
select lives_ok($$ update lignes_quantites set supprime_le = now(), motif_modification = 'Saisie en double'
                    where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' and prix_id = 'aaaaaaaa-4444-0000-0000-000000000007' $$,
  'suppression avec motif');
select results_eq($$ select supprime_le is not null, motif_correction from lignes_quantites
                      where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' and prix_id = 'aaaaaaaa-4444-0000-0000-000000000007' $$,
  $$ values (true, 'Saisie en double'::text) $$, 'suppression : motif gardé');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select throws_ok($$ insert into lignes_quantites (marche_id, fuite_id, prix_id, quantite, date_execution, motif_modification) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000010', 1, current_date, 'x') $$,
  '42501', null, 'chef : n''ajoute pas de ligne de prix');
select lives_ok($$ update lignes_quantites set prix_id = 'aaaaaaaa-4444-0000-0000-000000000006', motif_modification = 'x'
                    where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  'chef : tentative de requalification (aucune ligne visible)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ insert into lignes_quantites (marche_id, fuite_id, prix_id, quantite, date_execution, motif_modification) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000010', 1, current_date, 'x') $$,
  '42501', null, 'détection : n''ajoute pas de ligne de prix');
reset role;
select results_eq($$ select p.numero from lignes_quantites l join prix p on p.id = l.prix_id
                      where l.fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' and l.supprime_le is null order by p.ordre $$,
  $$ values ('3'::text), ('9'::text) $$, 'chef et détection : lignes inchangées');

-- -----------------------------------------------------------------------------
-- 3. Lot arrêté : ses lignes restent figées, la requalification devient régularisation
-- -----------------------------------------------------------------------------
insert into reparations (id, marche_id, fuite_id, auteur_terrain_id, materiau, diametre_mm, tuyau_repare,
                         fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m) values
  ('aaaaaaaa-2222-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000003',
   '00000000-0000-0000-0000-00000000000c', 'polyethylene', 32, true, 1.0, 0.5, 0.6);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$
  insert into attachements (id, marche_id, intitule, os_id, lieu_travaux) values
    ('aaaaaaaa-7777-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Octobre', 'eeeeeeee-0000-0000-0000-000000000002', 'Secteur R');
  insert into attachement_lignes (marche_id, attachement_id, fuite_id, prix_id)
  select 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', u.fuite_id, u.prix_id
    from v_a_attacher u where u.fuite_id = 'aaaaaaaa-1111-0000-0000-000000000003';
  select arreter_attachement('aaaaaaaa-7777-0000-0000-000000000001', '2026-10-31');
$$, 'responsable : attache et arrête la fuite N° 3');
select results_eq($$ select prix_numero, quantite from attachement_lignes
                      where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000001' order by prix_numero $$,
  $$ values ('3'::text, 0.300::numeric), ('6'::text, 1.000::numeric) $$, 'lot arrêté : terrassement 0,3 m3 et prix 6');
select ok((select verrouillee_le is not null from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000003'),
  'lot arrêté : fuite verrouillée');
select lives_ok($$ update lignes_quantites set prix_id = 'aaaaaaaa-4444-0000-0000-000000000009', motif_modification = 'Constat contradictoire : DE 40'
                    where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000003' and prix_id = 'aaaaaaaa-4444-0000-0000-000000000006' $$,
  'responsable : requalifie la ligne d''une fuite attachée (motif)');
select results_eq($$ select prix_numero, quantite from attachement_lignes
                      where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000001' order by prix_numero $$,
  $$ values ('3'::text, 0.300::numeric), ('6'::text, 1.000::numeric) $$, 'lot arrêté : lignes inchangées après la requalification');
select results_eq($$ select prix_numero, reste from v_a_attacher
                      where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000003' and reste <> 0 order by prix_ordre $$,
  $$ values ('6'::text, -1::numeric), ('9'::text, 1::numeric) $$,
  'requalification après l''arrêt : régularisations − 1 prix 6 et + 1 prix 9 au lot suivant');
select throws_ok($$ update attachement_lignes set quantite = 2 where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000001' $$,
  '23514', 'Lot arrêté : ses lignes sont figées', 'lot arrêté : lignes figées');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, piece_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000003', 'aaaaaaaa-5555-0000-0000-000000000003', 1) $$,
  '42501', 'Fuite verrouillée : modification réservée au responsable', 'chef : fuite attachée, plus de pièce ajoutée');
reset role;

-- -----------------------------------------------------------------------------
-- 4. Contrôles de cohérence et travaux hors bordereau (données fictives)
--   F4 robinet posé sans la case      F5 case robinet sans pièce
--   F6 collier posé sans la case      F7 case collier sans pièce
--   F8 fouille sans volume            F9 réparation sans prix de réparation
--   F10 réfection en retard           F11 ligne manuelle incohérente sans motif
--   F12 PE 3,5 m                      F13 AC DN 400 (sans article), robinet vanne
--   F14 pièce dont l'article suggéré est hors bordereau
-- -----------------------------------------------------------------------------
insert into reparations (id, marche_id, fuite_id, auteur_terrain_id, realisee_le, materiau, diametre_mm,
                         tuyau_repare, robinet_pec_change, collier_pec_change, longueur_pe_m,
                         fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m, emplacement, nature_revetement_id)
select ('aaaaaaaa-2222-0000-0000-0000000000' || lpad(v.n::text, 2, '0'))::uuid, 'aaaaaaaa-0000-0000-0000-000000000001',
       ('aaaaaaaa-1111-0000-0000-0000000000' || lpad(v.n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000000c',
       now() - make_interval(days => v.jours), v.materiau, v.dn, v.tuyau, v.robinet, v.collier, v.pe, v.l, v.lg, v.p,
       v.emplacement::emplacement_fouille, v.nature::uuid
  from (values
    ( 4,  0, 'polyethylene',    25, true,  false, false, null::numeric, 1.0::numeric, 0.5::numeric, 0.6::numeric, null::text, null::text),
    ( 5,  0, 'polyethylene',    25, false, true,  false, null, 1.0, 0.5, 0.6, null, null),
    ( 6,  0, 'polyethylene',    25, true,  false, false, null, 1.0, 0.5, 0.6, null, null),
    ( 7,  0, 'polyethylene',    25, false, false, true,  null, 1.0, 0.5, 0.6, null, null),
    ( 8,  0, 'polyethylene',    25, true,  false, false, null, null, null, null, null, null),
    ( 9,  0, 'polyethylene',    25, false, false, false, null, 1.0, 0.5, 0.6, null, null),
    (10, 40, 'polyethylene',    25, true,  false, false, null, 1.0, 0.5, 0.6, 'chaussee', 'cccccccc-0000-0000-0000-000000000002'),
    (11,  0, 'polyethylene',    25, true,  false, false, null, 1.0, 0.5, 0.6, null, null),
    (12,  0, 'polyethylene',    32, true,  false, false, 3.5,  1.0, 0.5, 0.6, null, null),
    (13,  0, 'amiante_ciment', 400, true,  false, false, null, 1.5, 1.0, 1.5, null, null),
    (14,  0, 'polyethylene',    25, true,  false, false, null, 1.0, 0.5, 0.6, null, null)
  ) v (n, jours, materiau, dn, tuyau, robinet, collier, pe, l, lg, p, emplacement, nature);

insert into reparation_pieces (marche_id, reparation_id, piece_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000004', 'aaaaaaaa-5555-0000-0000-000000000001', 1),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000006', 'aaaaaaaa-5555-0000-0000-000000000002', 1),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000013', 'aaaaaaaa-5555-0000-0000-000000000004', 2),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000014', 'aaaaaaaa-5555-0000-0000-000000000005', 1);

-- Ligne corrigée à la main avant le lot R (sans motif) : prix 13 au lieu du prix 6 proposé
update lignes_quantites set prix_id = 'aaaaaaaa-4444-0000-0000-000000000013', origine = 'manuel'
 where reparation_id = 'aaaaaaaa-2222-0000-0000-000000000011' and prix_id = 'aaaaaaaa-4444-0000-0000-000000000006';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select string_agg(controle, ',' order by controle) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000004'),
  'robinet_pec_non_coche', 'contrôle : robinet PEC posé, case non cochée');
select is((select string_agg(controle, ',' order by controle) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000005'),
  'robinet_pec_sans_piece', 'contrôle : case robinet PEC cochée sans pièce');
select is((select string_agg(controle, ',' order by controle) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000006'),
  'collier_pec_non_coche', 'contrôle : collier PEC posé, case non cochée');
select is((select string_agg(controle, ',' order by controle) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000007'),
  'collier_pec_sans_piece', 'contrôle : case collier PEC cochée sans pièce');
select is((select string_agg(controle, ',' order by controle) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000008'),
  'fouille_sans_volume', 'contrôle : réparation réussie sans volume de fouille');
select is((select string_agg(controle, ',' order by controle) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000009'),
  'reparation_sans_prix', 'contrôle : réparation réussie sans ligne de prix de réparation');
select is((select string_agg(controle, ',' order by controle) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000010'),
  'refection_hors_delai', 'contrôle : réfection ni faite ni close après le délai');
select is((select string_agg(controle, ',' order by controle) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000011'),
  'ligne_incoherente', 'contrôle : article retenu à la main différent de la règle, sans motif');
select results_eq($$ select gravite, detail from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000011' $$,
  $$ values ('alerte'::text, 'Prix 13 retenu ; la règle propose : prix 3, prix 6'::text) $$,
  'ligne incohérente : gravité « alerte », articles retenu et proposés');
select results_eq($$ select controle, excedent, unite from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000012' $$,
  $$ values ('pe_superieur_2m'::text, 1.5::numeric, 'm'::text) $$, 'contrôle : PE 3,5 m, excédent 1,5 m');
select results_eq($$ select controle, gravite, detail from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000013' $$,
  $$ values ('reparation_hors_bordereau'::text, 'information'::text, 'amiante-ciment, diamètre 400 mm'::text) $$,
  'contrôle : AC DN 400 sans article (et pas de « sans prix » en double)');
select is((select string_agg(controle, ',' order by controle) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000014'),
  null::text, 'réparation complète : aucun contrôle en défaut');
select is((select string_agg(controle, ',' order by controle) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001'),
  'robinet_pec_non_coche', 'fuite N° 1 : ligne requalifiée avec motif non signalée ; robinet ajouté au bureau sans la case');

select lives_ok($$ update lignes_quantites set prix_id = 'aaaaaaaa-4444-0000-0000-000000000006', motif_modification = 'PE DE 25 : prix 6'
                    where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000011' and prix_id = 'aaaaaaaa-4444-0000-0000-000000000013' $$,
  'responsable : requalifie la ligne incohérente');
select is((select count(*)::int from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000011'), 0,
  'ligne requalifiée : plus de contrôle en défaut');

select results_eq($$ select nature, quantite, unite from v_hors_bordereau where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000012' $$,
  $$ values ('pe_au_dela_2m'::text, 1.5::numeric, 'm'::text) $$, 'hors bordereau : excédent de polyéthylène 1,5 m');
select results_eq($$ select nature, designation, quantite from v_hors_bordereau
                      where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000013' order by nature $$,
  $$ values ('piece_non_couverte'::text, 'Robinet vanne 400'::text, 2::numeric),
            ('reparation_sans_article'::text, 'Réparation amiante-ciment, diamètre 400 mm'::text, 1::numeric) $$,
  'hors bordereau : réparation AC DN 400 et ses pièces');
select results_eq($$ select nature, designation from v_hors_bordereau where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000014' $$,
  $$ values ('piece_non_couverte'::text, 'Té fonte (hors bordereau)'::text) $$,
  'hors bordereau : pièce dont l''article suggéré est hors bordereau');
select is((select count(*)::int from v_hors_bordereau where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000004'), 0,
  'hors bordereau : rien pour une réparation couverte');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select results_eq($$ select (select count(*) from v_controles_attachement), (select count(*) from v_hors_bordereau) $$,
  $$ values (0::bigint, 0::bigint) $$, 'détection : ni contrôles ni travaux hors bordereau');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select results_eq($$ select (select count(*) from v_controles_attachement), (select count(*) from v_hors_bordereau) $$,
  $$ values (0::bigint, 0::bigint) $$, 'chef de réparation : ni contrôles ni travaux hors bordereau');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select ok((select count(*) > 0 from v_controles_attachement where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'administrateur : voit les contrôles');
reset role;

select * from finish();
rollback;
