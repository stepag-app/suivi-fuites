-- =============================================================================
-- Lot T : articles Dolibarr, référentiel unique des pièces (données fictives, famille « ESS »).
-- Structure (plus de catalogue ni de rapprochement), import idempotent sans prix, nouveaux
-- produits désactivés, activation globale par l'administrateur, lecture par tout compte
-- affecté, saisie limitée aux articles activés (ligne ancienne gardée), pièce libre,
-- article suggéré par marché (produit, sinon famille), droits des règles.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(47);

-- a = admin, b = détection, c = chef de réparation, d = responsable, z = compte sans affectation
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chef.a@test.local',  '{"identifiant": "chef.a", "nom_complet": "Chef A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}'),
  ('00000000-0000-0000-0000-00000000000f', 'seul@test.local',    '{"identifiant": "seul", "nom_complet": "Sans marché"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-T', '1', 'Marché T', 'Client T'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'TEST-U', '2', 'Marché U', 'Client U');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');

insert into prix (id, marche_id, numero, ordre, designation, unite, pu_ht, famille) values
  ('aaaaaaaa-4444-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', '7', 7, 'Robinet PEC', 'u', 460, 'robinet_pec'),
  ('aaaaaaaa-4444-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', '8', 8, 'Collier PEC', 'u', 460, 'collier_pec'),
  ('aaaaaaaa-4444-0000-0000-000000000018', 'aaaaaaaa-0000-0000-0000-000000000002', '8', 8, 'Collier PEC', 'u', 470, 'collier_pec');

insert into fuites (id, marche_id) values ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into reparations (id, marche_id, fuite_id, auteur_terrain_id) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001',
   '00000000-0000-0000-0000-00000000000c');

-- Fichiers fictifs, déjà réduits aux colonnes utiles par le navigateur ; le premier contient
-- en plus un prix et un PMP, qui ne doivent jamais être enregistrés.
create temporary table t_json (cle text primary key, valeur jsonb);
grant select on t_json to authenticated;
insert into t_json values
  ('import1', '[
     {"dolibarr_id": 9001, "ref": "ESS00001", "designation": "MANCHON ESSAI DN 25", "unite": "U", "famille": "ESS", "actif": true, "prix": 99.5, "pmp": 12},
     {"dolibarr_id": 9002, "ref": "ESS00002", "designation": "COLLIER ESSAI 63 X 20", "unite": "U", "famille": "ESS", "actif": true},
     {"dolibarr_id": 9003, "ref": "ESS00003", "designation": "TUBE ESSAI DN 40", "unite": "m", "famille": "ESS", "actif": true},
     {"dolibarr_id": 9004, "ref": "ESS00004", "designation": "ROBINET ESSAI 20", "unite": "U", "famille": "ESS", "actif": false}
   ]'),
  ('import2', '[
     {"dolibarr_id": 9001, "ref": "ESS00001", "designation": "MANCHON ESSAI PEHD DN 25", "unite": "U", "famille": "ESS", "actif": true},
     {"dolibarr_id": 9002, "ref": "ESS00002", "designation": "COLLIER ESSAI 63 X 20", "unite": "U", "famille": "ESS", "actif": true},
     {"dolibarr_id": 9004, "ref": "ESS00004", "designation": "ROBINET ESSAI 20", "unite": "U", "famille": "ESS", "actif": false},
     {"dolibarr_id": 9005, "ref": "ESS00005", "designation": "TE ESSAI 63", "unite": "Barre", "famille": "ESS", "actif": true}
   ]'),
  ('invalide', '[{"dolibarr_id": 9006, "ref": "", "designation": "SANS REFERENCE", "famille": "ESS"}]');

-- -----------------------------------------------------------------------------
-- 1. Structure : plus de catalogue, RLS, aucun droit pour anon, aucun prix
-- -----------------------------------------------------------------------------
select hasnt_table('public', 'catalogue_pieces', 'le catalogue des pièces par marché n''existe plus');
select hasnt_function('public', 'rapprocher_pieces', 'le rapprochement pièce ↔ produit n''existe plus');
select hasnt_column('public', 'reparation_pieces', 'piece_id', 'pièce posée : plus de pièce du catalogue');
select col_is_fk('public', 'reparation_pieces', 'produit_id', 'pièce posée : produit Dolibarr (clé étrangère)');
select ok((select bool_and(relrowsecurity) from pg_class
            where oid in ('public.produits_dolibarr'::regclass, 'public.imports_dolibarr'::regclass,
                          'public.suggestions_articles'::regclass)),
  'RLS activée sur produits_dolibarr, imports_dolibarr et suggestions_articles');
select ok(not has_table_privilege('anon', 'public.produits_dolibarr', 'select')
          and not has_table_privilege('anon', 'public.suggestions_articles', 'select'),
  'anon : aucun accès aux articles ni aux règles');
select ok(has_table_privilege('authenticated', 'public.produits_dolibarr', 'select')
          and not has_table_privilege('authenticated', 'public.produits_dolibarr', 'insert')
          and not has_table_privilege('authenticated', 'public.produits_dolibarr', 'update')
          and not has_table_privilege('authenticated', 'public.produits_dolibarr', 'delete'),
  'authenticated : articles en lecture seule (import et activation par fonction)');
select ok(not has_function_privilege('anon', 'public.importer_produits_dolibarr(jsonb, text[])', 'execute')
          and not has_function_privilege('anon', 'public.activer_produits_dolibarr(integer[], boolean)', 'execute')
          and not has_function_privilege('authenticated', 'private.controler_produit_piece()', 'execute'),
  'fonctions : rien pour anon, contrôle de la saisie non appelable');
select columns_are('public', 'produits_dolibarr',
  array['dolibarr_id', 'ref', 'designation', 'unite', 'famille', 'actif', 'importe_le', 'modifie_le',
        'utilisable', 'utilisable_le', 'utilisable_par', 'cree_le'],
  'produits_dolibarr : aucune colonne de prix, de PMP ou de stock');

-- -----------------------------------------------------------------------------
-- 2. Import : administrateur seulement, sans prix, nouveaux produits désactivés, idempotent
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select importer_produits_dolibarr((select valeur from t_json where cle = 'import1')) $$,
  '42501', null, 'responsable : n''importe pas les articles');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is(importer_produits_dolibarr((select valeur from t_json where cle = 'import1'), array['ESS']),
  '{"produits_lus": 4, "nouveaux": 4, "modifies": 0, "designations_modifiees": 0, "desactives": 0}'::jsonb,
  'admin : premier import, 4 nouveaux produits');
select results_eq($$ select dolibarr_id, designation, unite, actif, utilisable from produits_dolibarr
                     where famille = 'ESS' order by dolibarr_id $$,
  $$ values (9001, 'MANCHON ESSAI DN 25'::text, 'U'::text, true, false),
            (9002, 'COLLIER ESSAI 63 X 20', 'U', true, false),
            (9003, 'TUBE ESSAI DN 40', 'm', true, false),
            (9004, 'ROBINET ESSAI 20', 'U', false, false) $$,
  'produits enregistrés sans prix ni PMP, unité de Dolibarr telle quelle, tous désactivés');
select is(importer_produits_dolibarr((select valeur from t_json where cle = 'import1'), array['ESS']),
  '{"produits_lus": 4, "nouveaux": 0, "modifies": 0, "designations_modifiees": 0, "desactives": 0}'::jsonb,
  'admin : le même fichier réimporté ne change rien (idempotent)');
select throws_ok($$ select importer_produits_dolibarr((select valeur from t_json where cle = 'invalide')) $$,
  '22023', null, 'admin : produit sans référence refusé');

-- -----------------------------------------------------------------------------
-- 3. Activation : globale, par l'administrateur seulement
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select activer_produits_dolibarr(array[9001], true) $$,
  '42501', null, 'responsable : n''active pas d''article');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is(activer_produits_dolibarr(array[9001, 9002, 9003, 9004], true), 3,
  'admin : active trois articles (le produit retiré de Dolibarr ne s''active pas)');
select is(activer_produits_dolibarr(array[9001, 9002], true), 0, 'activer un article déjà activé ne change rien');
select results_eq($$ select utilisable_par::text, utilisable_le is not null from produits_dolibarr where dolibarr_id = 9001 $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::text, true) $$,
  'activation : auteur et date gardés');

-- Réimport : libellé modifié, 9003 absent (retiré), 9005 nouveau (désactivé)
select is(importer_produits_dolibarr((select valeur from t_json where cle = 'import2'), array['ESS']),
  '{"produits_lus": 4, "nouveaux": 1, "modifies": 1, "designations_modifiees": 1, "desactives": 1}'::jsonb,
  'admin : réimport (un libellé modifié, un produit retiré, un nouveau)');
select results_eq($$ select dolibarr_id, designation, actif, utilisable from produits_dolibarr
                     where dolibarr_id in (9001, 9003, 9005) order by dolibarr_id $$,
  $$ values (9001, 'MANCHON ESSAI PEHD DN 25'::text, true, true),
            (9003, 'TUBE ESSAI DN 40', false, true),
            (9005, 'TE ESSAI 63', true, false) $$,
  'réimport : libellé suivi, activation gardée, produit retiré inactif, nouveau désactivé');

-- -----------------------------------------------------------------------------
-- 4. Lecture : tout compte affecté à un marché ; rien sans affectation
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from produits_dolibarr where famille = 'ESS'), 5, 'agent de détection affecté : lit les articles');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((select string_agg(designation, ' | ' order by designation) from produits_dolibarr
            where famille = 'ESS' and utilisable and actif),
  'COLLIER ESSAI 63 X 20 | MANCHON ESSAI PEHD DN 25', 'chef : liste déroulante = articles activés et présents dans Dolibarr');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
select is((select count(*)::int from produits_dolibarr), 0, 'compte sans affectation : aucun article');
select is((select count(*)::int from imports_dolibarr), 0, 'compte sans affectation : aucun import');

-- -----------------------------------------------------------------------------
-- 5. Saisie des pièces posées : article activé, ou désignation libre
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select lives_ok($$ insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 9002, 1) $$,
  'chef : pose un article activé');
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 9005, 1) $$,
  '23514', null, 'chef : article non activé refusé');
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 9003, 1) $$,
  '23514', null, 'chef : article retiré de Dolibarr refusé (même activé)');
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 424242, 1) $$,
  '23514', null, 'chef : article inconnu refusé (message « article non proposé »)');
select lives_ok($$ insert into reparation_pieces (id, marche_id, reparation_id, designation_libre, quantite) values
  ('aaaaaaaa-3333-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'Joint plat (hors Dolibarr)', 1) $$,
  'chef : pièce libre (cas exceptionnel)');
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 1) $$,
  '23514', null, 'chef : ni article ni désignation libre refusé');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is(activer_produits_dolibarr(array[9002], false), 1, 'admin : désactive un article déjà posé');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select lives_ok($$ update reparation_pieces set quantite = 2 where id = 'aaaaaaaa-3333-0000-0000-000000000001' $$,
  'chef : la pièce déjà saisie garde son article désactivé (quantité modifiable)');
select throws_ok($$ update reparation_pieces set produit_id = 9005 where id = 'aaaaaaaa-3333-0000-0000-000000000001' $$,
  '23514', null, 'chef : changer pour un article non activé est refusé');
select results_eq($$ select produit_id, designation, famille, unite, quantite from v_pieces_reelles
                     where reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001' order by designation $$,
  $$ values (9002, 'COLLIER ESSAI 63 X 20'::text, 'ESS'::text, 'U'::text, 2.00::numeric),
            (null, 'Joint plat (hors Dolibarr)', null, 'u', 1.00) $$,
  'inventaire réel : désignation, famille et unité de Dolibarr ; pièce libre en « u »');

-- -----------------------------------------------------------------------------
-- 6. Article suggéré par marché : règle du produit, sinon de la famille
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ insert into suggestions_articles (marche_id, prix_id, famille) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000007', 'ESS') $$,
  '42501', null, 'agent de détection : ne crée pas de règle');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ insert into suggestions_articles (marche_id, prix_id, famille) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000007', 'ESS') $$,
  'responsable : règle par famille');
select is(private.article_suggere('aaaaaaaa-0000-0000-0000-000000000001', 9002), 'aaaaaaaa-4444-0000-0000-000000000007'::uuid,
  'sans règle du produit : article de la famille');
select lives_ok($$ insert into suggestions_articles (marche_id, prix_id, produit_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000008', 9002) $$,
  'responsable : règle par article');
select is(private.article_suggere('aaaaaaaa-0000-0000-0000-000000000001', 9002), 'aaaaaaaa-4444-0000-0000-000000000008'::uuid,
  'la règle du produit l''emporte sur celle de la famille');
select is(private.article_suggere('aaaaaaaa-0000-0000-0000-000000000002', 9002), null,
  'autre marché : aucune règle, aucune suggestion');
select throws_ok($$ insert into suggestions_articles (marche_id, prix_id, produit_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000007', 9002) $$,
  '23505', null, 'un article au plus une règle par marché');
select throws_ok($$ insert into suggestions_articles (marche_id, prix_id, produit_id, famille) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000007', 9001, 'ESS') $$,
  '23514', null, 'une règle porte sur un article ou une famille, pas les deux');
select throws_ok($$ insert into suggestions_articles (marche_id, prix_id, produit_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000018', 9001) $$,
  '23503', null, 'article du bordereau d''un autre marché refusé');
select throws_ok($$ insert into suggestions_articles (marche_id, prix_id, famille) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-4444-0000-0000-000000000018', 'ESS') $$,
  '42501', null, 'responsable : aucune règle dans un marché où il n''est pas affecté');
select lives_ok($$ delete from suggestions_articles where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and famille = 'ESS' $$,
  'responsable : supprime une règle');
reset role;
select is((select count(*)::int from suggestions_articles where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1,
  'règle supprimée, l''autre gardée');
select ok(exists (select 1 from journal where table_nom = 'suggestions_articles' and operation = 'suppression'
                   and utilisateur_id = '00000000-0000-0000-0000-00000000000d'),
  'journal : suppression d''une règle tracée au nom du responsable');

select * from finish();
rollback;
