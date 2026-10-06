-- =============================================================================
-- Tests du lot R : contrôles et corrections à l'attachement.
--  1. Pièces posées : déclaration du terrain (auteur de la réparation, sans délai) et
--     corrections du bureau (remplacement, oubli, retrait) avec motif obligatoire ; saisie
--     d'origine gardée ; inventaire réel (v_pieces_reelles, v_pieces_posees, v_fuites_export) ;
--     droits (chef et détection ne corrigent pas la réparation d'un autre).
--  2. Lignes de quantités : motif obligatoire (ajout, article, quantité, suppression),
--     journal, article d'origine non reproposé, une unité par prix et par fuite, droits.
--  3. Lot arrêté figé après une requalification (régularisations).
--  4. Contrôles de cohérence (v_controles_attachement) et travaux hors bordereau
--     (v_hors_bordereau), réservés aux comptes « attachements » et « quantités ».
--  5. Seuil du polyéthylène réglable par marché, suivi par les trois vues.
-- Tout se passe dans une transaction annulée à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(110);

-- -----------------------------------------------------------------------------
-- Jeu d'essai : a = admin, b = détection, c = chef de réparation, e = second chef,
-- d = responsable, f = compte sans droit ; un marché (et un second pour le seuil du PE),
-- 13 articles et un article hors bordereau, 14 fuites.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',    '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'detect.r@test.local', '{"identifiant": "detect.r", "nom_complet": "Détection R"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chef.r@test.local',   '{"identifiant": "chef.r", "nom_complet": "Chef R"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.r@test.local',   '{"identifiant": "resp.r", "nom_complet": "Responsable R"}'),
  ('00000000-0000-0000-0000-00000000000e', 'chef.s@test.local',   '{"identifiant": "chef.s", "nom_complet": "Chef S"}'),
  ('00000000-0000-0000-0000-00000000000f', 'sans.droit@test.local', '{"identifiant": "sans.droit", "nom_complet": "Sans droit"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-R', '4500000001', 'Marché R', 'Client R'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'TEST-R2', '4500000002', 'Marché R2', 'Client R2');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000002', 'responsable');

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

-- Articles Dolibarr (activés) et article suggéré par règle « produit » du marché
insert into produits_dolibarr (dolibarr_id, ref, designation, unite, famille, utilisable) values
  (55001, 'ESS55001', 'Robinet PEC 20/25', 'u', 'ESS', true),
  (55002, 'ESS55002', 'Collier PEC 63/20', 'u', 'ESS', true),
  (55003, 'ESS55003', 'Manchon droit 25/25', 'u', 'ESS', true),
  (55004, 'ESS55004', 'Robinet vanne 400', 'u', 'ESS', true),
  (55005, 'ESS55005', 'Té fonte (hors bordereau)', 'u', 'ESS', true);
insert into suggestions_articles (marche_id, produit_id, prix_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 55001, 'aaaaaaaa-4444-0000-0000-000000000007'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 55002, 'aaaaaaaa-4444-0000-0000-000000000008'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 55003, 'aaaaaaaa-4444-0000-0000-000000000006'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 55005, 'aaaaaaaa-4444-0000-0000-0000000000b1');

insert into ordres_service (id, marche_id, numero, date_os, objet, nature) values
  ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '02', '2026-09-25', 'Commencement', 'commencement');

insert into fuites (id, marche_id, date_detection)
select ('aaaaaaaa-1111-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'aaaaaaaa-0000-0000-0000-000000000001',
       now() - interval '45 days'
  from generate_series(1, 14) n;

-- -----------------------------------------------------------------------------
-- 1. Pièces posées : déclaration du terrain et corrections du bureau
--   P1, P2 : pièces du chef sur sa réparation R1 (fuite N° 1)
--   P3 : oubli ajouté par le responsable ; P7 : remplace P1 ; P2 retirée
--   R2 (fuite N° 2) : fiche papier du second chef recopiée par le responsable (P4)
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);

select lives_ok($$
  insert into reparations (id, marche_id, fuite_id, materiau, diametre_mm, tuyau_repare,
                           fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m)
  values ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-1111-0000-0000-000000000001', 'polyethylene', 25, true, 1.0, 0.6, 0.8)
$$, 'chef : saisit sa réparation (PE DE 25)');

-- Insertion telle que l'envoie la tablette (valeurs par défaut), puis une tentative de falsification
select lives_ok($$
  insert into reparation_pieces (id, marche_id, reparation_id, produit_id, designation_libre, quantite) values
    ('aaaaaaaa-6666-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
     'aaaaaaaa-2222-0000-0000-000000000001', 55003, null, 2);
  insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite, provenance, nature_correction,
                                 motif_correction, etat, etat_le, motif_retrait) values
    ('aaaaaaaa-6666-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
     'aaaaaaaa-2222-0000-0000-000000000001', 55003, 1,
     'correction', 'oubli', 'x', 'retiree', now(), 'x');
$$, 'chef : déclare ses pièces posées (tablette : valeurs par défaut)');

select results_eq($$ select provenance, nature_correction, etat, etat_le is null, motif_retrait is null from reparation_pieces
                      where reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001' order by id $$,
  $$ values ('terrain'::text, null::text, 'posee'::text, true, true), ('terrain', null, 'posee', true, true) $$,
  'pièces du réparateur : terrain et posées ; provenance, nature et état non falsifiables par le client');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite, motif_modification) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 55003, 1, 'Oubli') $$,
  '42501', 'Correction refusée : réparation d''un autre agent (droit « interventions / modifier » requis)',
  'second chef : n''ajoute pas de pièce à la réparation d''un autre');
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite, remplace_piece_id, motif_modification) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 55003, 1,
   'aaaaaaaa-6666-0000-0000-000000000001', 'Remplacement') $$,
  '42501', 'Correction refusée : réparation d''un autre agent (droit « interventions / modifier » requis)',
  'second chef : ne remplace pas la pièce d''un autre');
select throws_ok($$ update reparation_pieces set etat = 'retiree', motif_modification = 'Non posée'
                     where id = 'aaaaaaaa-6666-0000-0000-000000000001' $$,
  '42501', null,  -- refus par le garde générique (saisie d'un autre), message : « Modification non autorisée »
  'second chef : ne retire pas la pièce d''un autre');
select throws_ok($$ update reparation_pieces set quantite = 1 where id = 'aaaaaaaa-6666-0000-0000-000000000001' $$,
  '42501', null,
  'second chef : ne modifie pas la pièce d''un autre');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite, motif_modification) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 55003, 1, 'Oubli') $$,
  '42501', null, 'détection : n''ajoute pas de pièce');
select lives_ok($$ update reparation_pieces set etat = 'retiree', motif_modification = 'Non posée'
                    where id = 'aaaaaaaa-6666-0000-0000-000000000001' $$,
  'détection : tentative de retrait (aucune ligne modifiable)');
select is((select etat from reparation_pieces where id = 'aaaaaaaa-6666-0000-0000-000000000001'), 'posee',
  'chef et détection : la pièce du réparateur reste posée');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 55001, 1) $$,
  '23514', 'Motif obligatoire pour corriger les pièces posées (remplacement, oubli ou retrait)',
  'responsable : oubli sans motif refusé');
select lives_ok($$ insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite, motif_modification) values
  ('aaaaaaaa-6666-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-2222-0000-0000-000000000001', 55001, 1, 'Robinet PEC posé (photo du 05/10)') $$,
  'responsable : ajoute un oubli, avec motif');
select results_eq($$ select provenance, nature_correction, motif_correction, saisi_par::text, etat, motif_modification is null
                      from reparation_pieces where id = 'aaaaaaaa-6666-0000-0000-000000000003' $$,
  $$ values ('correction'::text, 'oubli'::text, 'Robinet PEC posé (photo du 05/10)'::text, '00000000-0000-0000-0000-00000000000d'::text, 'posee'::text, true) $$,
  'oubli : correction du bureau, nature, motif et auteur gardés');
select throws_ok($$ update reparation_pieces set quantite = 1, motif_modification = 'Un seul manchon'
                     where id = 'aaaaaaaa-6666-0000-0000-000000000001' $$,
  '23514', 'Pièce déclarée par le réparateur ou corrigée par le bureau : la remplacer ou la retirer, avec motif (jamais la modifier ni la supprimer)',
  'responsable : ne modifie pas la pièce du réparateur');
select throws_ok($$ update reparation_pieces set supprime_le = now() where id = 'aaaaaaaa-6666-0000-0000-000000000001' $$,
  '23514', 'Pièce déclarée par le réparateur ou corrigée par le bureau : la remplacer ou la retirer, avec motif (jamais la modifier ni la supprimer)',
  'responsable : ne supprime pas la pièce du réparateur');
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite, remplace_piece_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 55003, 1,
   'aaaaaaaa-6666-0000-0000-000000000001') $$,
  '23514', 'Motif obligatoire pour corriger les pièces posées (remplacement, oubli ou retrait)',
  'responsable : remplacement sans motif refusé');
select lives_ok($$ insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite, remplace_piece_id, motif_modification) values
  ('aaaaaaaa-6666-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
   55003, 1, 'aaaaaaaa-6666-0000-0000-000000000001', 'Un seul manchon posé (constat du 05/10)') $$,
  'responsable : remplace une pièce erronée, avec motif');
select results_eq($$ select id::text, provenance, nature_correction, etat, quantite, remplace_piece_id::text, etat_par::text
                      from reparation_pieces
                     where id in ('aaaaaaaa-6666-0000-0000-000000000001', 'aaaaaaaa-6666-0000-0000-000000000007') order by id $$,
  $$ values ('aaaaaaaa-6666-0000-0000-000000000001'::text, 'terrain'::text, null::text, 'remplacee'::text, 2.00::numeric, null::text,
             '00000000-0000-0000-0000-00000000000d'::text),
            ('aaaaaaaa-6666-0000-0000-000000000007', 'correction', 'remplacement', 'posee', 1.00, 'aaaaaaaa-6666-0000-0000-000000000001', null) $$,
  'remplacement : la pièce du réparateur reste en base telle que saisie, marquée « remplacée », liée à la nouvelle');
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite, remplace_piece_id, motif_modification) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 55003, 1,
   'aaaaaaaa-6666-0000-0000-000000000001', 'Encore') $$,
  '23514', 'Pièce déjà remplacée ou retirée', 'une pièce remplacée ne se remplace pas deux fois');
select throws_ok($$ update reparation_pieces set etat = 'retiree' where id = 'aaaaaaaa-6666-0000-0000-000000000002' $$,
  '23514', 'Motif obligatoire pour corriger les pièces posées (remplacement, oubli ou retrait)',
  'responsable : retrait sans motif refusé');
select lives_ok($$ update reparation_pieces set etat = 'retiree', motif_modification = 'Manchon non posé (erreur de saisie)'
                    where id = 'aaaaaaaa-6666-0000-0000-000000000002' $$,
  'responsable : retire une pièce non posée, avec motif');
select results_eq($$ select etat, motif_retrait, etat_par::text, etat_le is not null, supprime_le is null, quantite
                      from reparation_pieces where id = 'aaaaaaaa-6666-0000-0000-000000000002' $$,
  $$ values ('retiree'::text, 'Manchon non posé (erreur de saisie)'::text, '00000000-0000-0000-0000-00000000000d'::text, true, true, 1.00::numeric) $$,
  'retrait : pièce gardée telle que saisie, marquée « retirée », sans suppression');
select throws_ok($$ update reparation_pieces set quantite = 2, motif_modification = 'Deux robinets'
                     where id = 'aaaaaaaa-6666-0000-0000-000000000003' $$,
  '23514', 'Pièce déclarée par le réparateur ou corrigée par le bureau : la remplacer ou la retirer, avec motif (jamais la modifier ni la supprimer)',
  'une correction du bureau ne se modifie pas : elle se remplace ou se retire');
select throws_ok($$ update reparation_pieces set etat = 'remplacee', motif_modification = 'x'
                     where id = 'aaaaaaaa-6666-0000-0000-000000000003' $$,
  '23514', 'Seul le retrait d''une pièce se fait à la main (un remplacement passe par la pièce qui la remplace)',
  'marque « remplacée » posée à la main : refusée');
select throws_ok($$ update reparation_pieces set etat = 'posee' where id = 'aaaaaaaa-6666-0000-0000-000000000002' $$,
  '23514', 'Pièce remplacée ou retirée : elle ne se modifie plus', 'pièce retirée : figée');
select ok(exists (select 1 from journal
                   where table_nom = 'reparation_pieces' and ligne_id = 'aaaaaaaa-6666-0000-0000-000000000001'
                     and operation = 'modification' and utilisateur_id = '00000000-0000-0000-0000-00000000000d'
                     and changements -> 'etat' ->> 0 = 'posee' and changements -> 'etat' ->> 1 = 'remplacee'),
  'journal : pièce marquée « remplacée » au nom du responsable');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select throws_ok($$ update reparation_pieces set quantite = 3 where id = 'aaaaaaaa-6666-0000-0000-000000000001' $$,
  '23514', 'Pièce remplacée ou retirée : elle ne se modifie plus', 'réparateur : sa pièce remplacée est figée');
select throws_ok($$ update reparation_pieces set etat = 'retiree', motif_modification = 'Pas posé'
                     where id = 'aaaaaaaa-6666-0000-0000-000000000003' $$,
  '42501', null, 'réparateur : ne retire pas une correction du bureau');
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite, remplace_piece_id, motif_modification) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 55002, 1,
   'aaaaaaaa-6666-0000-0000-000000000003', 'Collier et non robinet') $$,
  '42501', 'Correction refusée : pièce saisie par un autre compte', 'réparateur : ne remplace pas une correction du bureau');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$
  insert into reparations (id, marche_id, fuite_id, auteur_terrain_id, source_saisie, materiau, diametre_mm, tuyau_repare,
                           fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m)
  values ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-1111-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000e', 'papier',
          'polyethylene', 25, true, 1.0, 0.5, 0.6);
  insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite) values
    ('aaaaaaaa-6666-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
     'aaaaaaaa-2222-0000-0000-000000000002', 55003, 2);
$$, 'responsable : recopie la fiche papier du second chef (réparation et pièces)');
reset role;

-- Le lendemain : aucun délai, l'auteur de la réparation reste l'auteur
update reparations set cree_le = now() - interval '1 day'
 where id in ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-6666-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-2222-0000-0000-000000000002', 55002, 1) $$,
  'responsable : complète le lendemain la réparation qu''il a saisie (sans motif)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select lives_ok($$ insert into reparation_pieces (id, marche_id, reparation_id, produit_id, designation_libre, quantite) values
  ('aaaaaaaa-6666-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-2222-0000-0000-000000000002', null, 'Joint plat 25', 1) $$,
  'second chef : complète le lendemain, depuis la tablette, la réparation faite par lui');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select lives_ok($$ insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-6666-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-2222-0000-0000-000000000001', 55003, 1) $$,
  'chef : complète sa propre réparation le lendemain');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000002', 55003, 1) $$,
  '23514', 'Motif obligatoire pour corriger les pièces posées (remplacement, oubli ou retrait)',
  'administrateur (autre compte) : oubli sans motif refusé');
select lives_ok($$ insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite, motif_modification) values
  ('aaaaaaaa-6666-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-2222-0000-0000-000000000002', 55003, 1, 'Manchon oublié sur la fiche papier') $$,
  'administrateur : ajoute un oubli, avec motif');
select results_eq($$ select id::text, provenance, nature_correction from reparation_pieces
                      where id in ('aaaaaaaa-6666-0000-0000-000000000004', 'aaaaaaaa-6666-0000-0000-000000000005',
                                   'aaaaaaaa-6666-0000-0000-000000000006', 'aaaaaaaa-6666-0000-0000-000000000008',
                                   'aaaaaaaa-6666-0000-0000-000000000009') order by id $$,
  $$ values ('aaaaaaaa-6666-0000-0000-000000000004'::text, 'terrain'::text, null::text),
            ('aaaaaaaa-6666-0000-0000-000000000005', 'terrain', null),
            ('aaaaaaaa-6666-0000-0000-000000000006', 'terrain', null),
            ('aaaaaaaa-6666-0000-0000-000000000008', 'terrain', null),
            ('aaaaaaaa-6666-0000-0000-000000000009', 'correction', 'oubli') $$,
  'pas de délai : terrain pour l''auteur de la réparation (web ou tablette, à tout moment), correction pour tout autre compte');

-- Inventaire réel
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select results_eq($$ select designation, provenance, nature_correction, quantite from v_pieces_reelles
                      where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' order by designation, provenance $$,
  $$ values ('Manchon droit 25/25'::text, 'correction'::text, 'remplacement'::text, 1.00::numeric),
            ('Manchon droit 25/25', 'terrain', null, 1.00),
            ('Robinet PEC 20/25', 'correction', 'oubli', 1.00) $$,
  'inventaire réel : pièces du terrain ni remplacées ni retirées, et corrections du bureau');
select results_eq($$ select designation_remplacee, quantite_remplacee, motif_correction, saisi_par_nom from v_pieces_reelles
                      where id = 'aaaaaaaa-6666-0000-0000-000000000007' $$,
  $$ values ('Manchon droit 25/25'::text, 2.00::numeric, 'Un seul manchon posé (constat du 05/10)'::text, 'Responsable R'::text) $$,
  'inventaire réel : pièce remplacée, quantité d''origine, motif et auteur de la correction');
select results_eq($$ select (select count(*) from reparation_pieces where reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001'),
                            (select count(*) from v_pieces_posees where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001'),
                            (select count(*) filter (where provenance = 'correction') from v_pieces_posees
                              where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001') $$,
  $$ values (5::bigint, 3::bigint, 2::bigint) $$,
  'saisie d''origine gardée en base (5 lignes) ; v_pieces_posees = inventaire réel (3, dont 2 corrections)');
select is((select pieces_posees from v_fuites_export where id = 'aaaaaaaa-1111-0000-0000-000000000001'),
  'Manchon droit 25/25 × 1 ; Manchon droit 25/25 × 1 ; Robinet PEC 20/25 × 1',
  'export des fuites : pièces de l''inventaire réel');
select ok((select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.v_pieces_reelles'::regclass),
  'v_pieces_reelles : droits de l''utilisateur (security_invoker)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select results_eq($$ select (select count(*) from v_pieces_reelles), (select count(*) from reparation_pieces where etat = 'posee') $$,
  $$ values (7::bigint, 7::bigint) $$,
  'détection : lit l''inventaire réel comme les pièces (mêmes droits de lecture)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
select results_eq($$ select (select count(*) from v_pieces_reelles), (select count(*) from reparation_pieces) $$,
  $$ values (0::bigint, 0::bigint) $$,
  'compte sans droit sur le marché : ni pièces ni inventaire');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);


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
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000003', 55003, 1) $$,
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

insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-6666-0000-0000-000000000014', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000004', 55001, 1),
  ('aaaaaaaa-6666-0000-0000-000000000016', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000006', 55002, 1),
  ('aaaaaaaa-6666-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000013', 55004, 2),
  ('aaaaaaaa-6666-0000-0000-000000000015', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000014', 55005, 1);

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
select results_eq($$ select controle, excedent, unite, libelle from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000012' $$,
  $$ values ('pe_superieur_2m'::text, 1.5::numeric, 'm'::text, 'Polyéthylène au-delà de 2 m : excédent hors bordereau, à faire valoir'::text) $$,
  'contrôle : PE 3,5 m, excédent 1,5 m au-delà du seuil par défaut (2 m)');
select results_eq($$ select controle, gravite, detail from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000013' $$,
  $$ values ('reparation_hors_bordereau'::text, 'information'::text, 'amiante-ciment, diamètre 400 mm'::text) $$,
  'contrôle : AC DN 400 sans article (et pas de « sans prix » en double)');
select is((select string_agg(controle, ',' order by controle) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000014'),
  null::text, 'réparation complète : aucun contrôle en défaut');
select is((select string_agg(controle, ',' order by controle) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001'),
  'robinet_pec_non_coche', 'fuite N° 1 : ligne requalifiée avec motif non signalée ; robinet ajouté au bureau (oubli) sans la case');

select lives_ok($$ update lignes_quantites set prix_id = 'aaaaaaaa-4444-0000-0000-000000000006', motif_modification = 'PE DE 25 : prix 6'
                    where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000011' and prix_id = 'aaaaaaaa-4444-0000-0000-000000000013' $$,
  'responsable : requalifie la ligne incohérente');
select is((select count(*)::int from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000011'), 0,
  'ligne requalifiée : plus de contrôle en défaut');

select lives_ok($$ update reparation_pieces set etat = 'retiree', motif_modification = 'Robinet non posé (erreur de saisie)'
                    where id = 'aaaaaaaa-6666-0000-0000-000000000014' $$,
  'responsable : retire le robinet PEC non posé de la fuite N° 4');
select is((select string_agg(controle, ',' order by controle) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000004'),
  null::text, 'pièce retirée : hors inventaire réel, le contrôle « robinet posé sans la case » disparaît');

select results_eq($$ select nature, quantite, unite from v_hors_bordereau where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000012' $$,
  $$ values ('pe_au_dela_2m'::text, 1.5::numeric, 'm'::text) $$, 'hors bordereau : excédent de polyéthylène 1,5 m');
select results_eq($$ select nature, designation, quantite, piece_provenance from v_hors_bordereau
                      where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000013' order by nature $$,
  $$ values ('piece_non_couverte'::text, 'Robinet vanne 400'::text, 2::numeric, 'terrain'::text),
            ('reparation_sans_article'::text, 'Réparation amiante-ciment, diamètre 400 mm'::text, 1::numeric, null::text) $$,
  'hors bordereau : réparation AC DN 400 et ses pièces (déclarées sur le terrain)');
select lives_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite, remplace_piece_id, motif_modification) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000013', 55004, 1,
   'aaaaaaaa-6666-0000-0000-000000000013', 'Un seul robinet vanne posé (constat contradictoire)') $$,
  'responsable : remplace la pièce erronée de la fuite N° 13 (2 robinets vanne déclarés, 1 posé)');
select results_eq($$ select designation, quantite, piece_provenance, piece_nature_correction from v_hors_bordereau
                      where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000013' and nature = 'piece_non_couverte' $$,
  $$ values ('Robinet vanne 400'::text, 1::numeric, 'correction'::text, 'remplacement'::text) $$,
  'hors bordereau : pièces de l''inventaire réel, avec la provenance et la nature de la correction');
select results_eq($$ select nature, designation from v_hors_bordereau where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000014' $$,
  $$ values ('piece_non_couverte'::text, 'Té fonte (hors bordereau)'::text) $$,
  'hors bordereau : pièce dont l''article suggéré est hors bordereau');
select is((select count(*)::int from v_hors_bordereau where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000004'), 0,
  'hors bordereau : rien pour une réparation couverte');
reset role;

-- -----------------------------------------------------------------------------
-- 5. Seuil du polyéthylène réglable par marché (F12 : PE 3,5 m ; F15, second marché : PE 2,8 m)
-- -----------------------------------------------------------------------------
insert into fuites (id, marche_id, date_detection) values
  ('aaaaaaaa-1111-0000-0000-000000000015', 'aaaaaaaa-0000-0000-0000-000000000002', now() - interval '10 days');
insert into reparations (id, marche_id, fuite_id, materiau, diametre_mm, tuyau_repare, longueur_pe_m,
                         fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m) values
  ('aaaaaaaa-2222-0000-0000-000000000015', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000015',
   'polyethylene', 32, true, 2.8, 1.0, 0.5, 0.6);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select longueur_pe_max_m from marches where id = 'aaaaaaaa-0000-0000-0000-000000000002'), 2.00::numeric,
  'nouveau marché : seuil du polyéthylène de 2 m par défaut');
select results_eq($$ select (select count(*) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000012' and controle = 'pe_superieur_2m'),
                            (select count(*) from v_hors_bordereau where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000012' and nature = 'pe_au_dela_2m'),
                            (select count(*) from v_anomalies where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000012' and anomalie = 'longueur_pe_superieure_2m') $$,
  $$ values (1::bigint, 1::bigint, 1::bigint) $$,
  'seuil de 2 m : PE de 3,5 m signalé par les contrôles, les travaux hors bordereau et les anomalies');
select throws_ok($$ update marches set longueur_pe_max_m = 0 where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23514', null, 'seuil du polyéthylène nul refusé');
select lives_ok($$ update marches set longueur_pe_max_m = 4 where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'responsable : règle le seuil du marché à 4 m (paramètres / modifier)');
select results_eq($$ select (select count(*) from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000012' and controle = 'pe_superieur_2m'),
                            (select count(*) from v_hors_bordereau where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000012' and nature = 'pe_au_dela_2m'),
                            (select count(*) from v_anomalies where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000012' and anomalie = 'longueur_pe_superieure_2m') $$,
  $$ values (0::bigint, 0::bigint, 0::bigint) $$,
  'seuil de 4 m : PE de 3,5 m ni contrôlé, ni hors bordereau, ni en anomalie');
select lives_ok($$ update marches set longueur_pe_max_m = 3 where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'responsable : règle le seuil du marché à 3 m');
select results_eq($$ select excedent, libelle, detail from v_controles_attachement
                      where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000012' and controle = 'pe_superieur_2m' $$,
  $$ values (0.5::numeric, 'Polyéthylène au-delà de 3 m : excédent hors bordereau, à faire valoir'::text,
             '3,5 m posés : 0,5 m au-delà des 3 m couverts par l''article de réparation'::text) $$,
  'seuil de 3 m : contrôle, excédent de 0,5 m, libellé et détail suivent le seuil');
select results_eq($$ select libelle, designation, quantite from v_hors_bordereau
                      where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000012' and nature = 'pe_au_dela_2m' $$,
  $$ values ('Polyéthylène au-delà de 3 m'::text, 'Polyéthylène 32 mm : 3,5 m posés, excédent au-delà de 3 m'::text, 0.5::numeric) $$,
  'seuil de 3 m : travaux hors bordereau, excédent de 0,5 m');
select is((select count(*)::int from v_anomalies where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000012' and anomalie = 'longueur_pe_superieure_2m'), 1,
  'seuil de 3 m : anomalie « longueur de PE » (code inchangé)');
select results_eq($$ select (select excedent from v_controles_attachement where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000015' and controle = 'pe_superieur_2m'),
                            (select quantite from v_hors_bordereau where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000015' and nature = 'pe_au_dela_2m'),
                            (select count(*) from v_anomalies where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000015' and anomalie = 'longueur_pe_superieure_2m') $$,
  $$ values (0.8::numeric, 0.8::numeric, 1::bigint) $$,
  'seuil propre à chaque marché : le second marché garde 2 m (PE de 2,8 m signalé par les trois vues)');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select lives_ok($$ update marches set longueur_pe_max_m = 10 where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'chef : tentative de régler le seuil (aucune ligne modifiable)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select longueur_pe_max_m from marches where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 3.00::numeric,
  'seuil inchangé : réservé au droit « paramètres / modifier »');
reset role;

-- -----------------------------------------------------------------------------
-- Droits sur les contrôles et les travaux hors bordereau
-- -----------------------------------------------------------------------------
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
