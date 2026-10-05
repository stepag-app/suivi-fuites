-- =============================================================================
-- Lot P1 : nomenclature Dolibarr (données fictives, famille « ESS »).
-- Droits de lecture et d'écriture, aucun prix, import idempotent, lien catalogue ↔
-- produit (désignation Dolibarr, unicité par marché, réservé à l'administrateur),
-- désactivation sans perte d'historique, journal, copie d'un marché.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(43);

-- a = admin, b = détection SRM, d = responsable SRM
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}');
update profils set est_admin = true where identifiant = 'issam';

create temporary table t_ids (cle text primary key, id uuid);
grant select, insert on t_ids to authenticated;
insert into t_ids values
  ('srm', (select id from marches where code = 'SRM-4500004453')),
  ('demo', (select id from marches where code = 'DEMO'));
insert into t_ids values
  ('manchon25', (select id from catalogue_pieces where marche_id = (select id from t_ids where cle = 'srm') and designation = 'Manchon droit 25/25')),
  ('manchon32', (select id from catalogue_pieces where marche_id = (select id from t_ids where cle = 'srm') and designation = 'Manchon droit 32/32')),
  ('demo25',    (select id from catalogue_pieces where marche_id = (select id from t_ids where cle = 'demo') and designation = 'Manchon droit 25/25'));

select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', (select id from t_ids where cle = 'srm'), 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', (select id from t_ids where cle = 'srm'), 'responsable');

-- Fichiers fictifs, déjà réduits aux colonnes utiles par le navigateur ; le premier contient
-- en plus un prix et un PMP, qui ne doivent jamais être enregistrés.
create temporary table t_json (cle text primary key, valeur jsonb);
grant select on t_json to authenticated;
insert into t_json values
  ('import1', '[
     {"dolibarr_id": 9001, "ref": "ESS00001", "designation": "MANCHON ESSAI DN 25", "unite": "U", "famille": "ESS", "actif": true, "prix": 99.5, "pmp": 12},
     {"dolibarr_id": 9002, "ref": "ESS00002", "designation": "MANCHON ESSAI DN 32", "unite": "U", "famille": "ESS", "actif": true},
     {"dolibarr_id": 9003, "ref": "ESS00003", "designation": "TUBE ESSAI DN 40", "unite": "m", "famille": "ESS", "actif": true},
     {"dolibarr_id": 9004, "ref": "ESS00004", "designation": "COLLIER ESSAI 63 X 20", "unite": "U", "famille": "ESS", "actif": false}
   ]'),
  ('import2', '[
     {"dolibarr_id": 9001, "ref": "ESS00001", "designation": "MANCHON ESSAI PEHD DN 25", "unite": "U", "famille": "ESS", "actif": true},
     {"dolibarr_id": 9002, "ref": "ESS00002", "designation": "MANCHON ESSAI DN 32", "unite": "U", "famille": "ESS", "actif": true},
     {"dolibarr_id": 9004, "ref": "ESS00004", "designation": "COLLIER ESSAI 63 X 20", "unite": "U", "famille": "ESS", "actif": false}
   ]'),
  ('invalide', '[{"dolibarr_id": 9005, "ref": "", "designation": "SANS REFERENCE", "famille": "ESS"}]');

-- -----------------------------------------------------------------------------
-- 1. Structure : RLS, aucun droit pour anon, lecture seule par l'API, aucun prix
-- -----------------------------------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class
            where oid in ('public.produits_dolibarr'::regclass, 'public.imports_dolibarr'::regclass)),
  'RLS activée sur produits_dolibarr et imports_dolibarr');
select ok(not has_table_privilege('anon', 'public.produits_dolibarr', 'select')
          and not has_table_privilege('anon', 'public.imports_dolibarr', 'select'),
  'anon : aucun accès à la nomenclature');
select ok(has_table_privilege('authenticated', 'public.produits_dolibarr', 'select')
          and not has_table_privilege('authenticated', 'public.produits_dolibarr', 'insert')
          and not has_table_privilege('authenticated', 'public.produits_dolibarr', 'update')
          and not has_table_privilege('authenticated', 'public.produits_dolibarr', 'delete')
          and not has_table_privilege('authenticated', 'public.imports_dolibarr', 'insert'),
  'authenticated : lecture seule, écriture par la fonction d''import uniquement');
select ok(not has_function_privilege('anon', 'public.importer_produits_dolibarr(jsonb, text[])', 'execute')
          and not has_function_privilege('anon', 'public.rapprocher_pieces(uuid, jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'private.lire_produits_dolibarr(jsonb)', 'execute'),
  'fonctions : rien pour anon, lecture du fichier interne non appelable');
select columns_are('public', 'produits_dolibarr',
  array['dolibarr_id', 'ref', 'designation', 'unite', 'famille', 'actif', 'importe_le', 'modifie_le'],
  'produits_dolibarr : aucune colonne de prix, de PMP ou de stock');

-- -----------------------------------------------------------------------------
-- 2. Import : administrateur seulement, sans prix, idempotent
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select importer_produits_dolibarr((select valeur from t_json where cle = 'import1')) $$,
  '42501', null, 'responsable : n''importe pas la nomenclature');
select throws_ok($$ insert into produits_dolibarr (dolibarr_id, ref, designation, famille) values (1, 'X1', 'X', 'ESS') $$,
  '42501', null, 'responsable : n''écrit pas directement dans produits_dolibarr');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is(importer_produits_dolibarr((select valeur from t_json where cle = 'import1'), array['ESS']),
  '{"produits_lus": 4, "nouveaux": 4, "modifies": 0, "designations_modifiees": 0, "desactives": 0,
    "pieces_renommees": 0, "conflits_designation": 0}'::jsonb,
  'admin : premier import, 4 nouveaux produits');
select results_eq($$ select dolibarr_id, ref, designation, unite, famille, actif from produits_dolibarr order by dolibarr_id $$,
  $$ values (9001, 'ESS00001'::text, 'MANCHON ESSAI DN 25'::text, 'U'::text, 'ESS'::text, true),
            (9002, 'ESS00002', 'MANCHON ESSAI DN 32', 'U', 'ESS', true),
            (9003, 'ESS00003', 'TUBE ESSAI DN 40', 'm', 'ESS', true),
            (9004, 'ESS00004', 'COLLIER ESSAI 63 X 20', 'U', 'ESS', false) $$,
  'produits enregistrés sans le prix ni le PMP du fichier');
select is(importer_produits_dolibarr((select valeur from t_json where cle = 'import1'), array['ESS']),
  '{"produits_lus": 4, "nouveaux": 0, "modifies": 0, "designations_modifiees": 0, "desactives": 0,
    "pieces_renommees": 0, "conflits_designation": 0}'::jsonb,
  'admin : le même fichier réimporté ne change rien (idempotent)');
select throws_ok($$ select importer_produits_dolibarr((select valeur from t_json where cle = 'invalide')) $$,
  '22023', null, 'admin : produit sans référence refusé');
select throws_ok($$ select importer_produits_dolibarr('[]'::jsonb) $$,
  '22023', null, 'admin : fichier vide refusé');

-- -----------------------------------------------------------------------------
-- 3. Lecture : paramètres / lire sur un marché ; jamais pour les agents de terrain
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select count(*)::int from produits_dolibarr), 4, 'responsable (paramètres / lire) : lit la nomenclature');
select is((select count(*)::int from imports_dolibarr), 2, 'responsable : lit le journal des imports');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from produits_dolibarr) + (select count(*)::int from imports_dolibarr), 0,
  'agent de détection : ne voit ni la nomenclature ni les imports');

-- -----------------------------------------------------------------------------
-- 4. Lien catalogue ↔ produit
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is(rapprocher_pieces((select id from t_ids where cle = 'srm'),
            jsonb_build_array(jsonb_build_object('piece_id', (select id from t_ids where cle = 'manchon25'), 'produit_dolibarr_id', 9001))),
  '{"rapprochees": 1, "erreurs": []}'::jsonb, 'admin : rapproche une pièce d''un produit');
select results_eq($$ select produit_dolibarr_id, designation, designation_initiale from catalogue_pieces
                     where id = (select id from t_ids where cle = 'manchon25') $$,
  $$ values (9001, 'MANCHON ESSAI DN 25'::text, 'Manchon droit 25/25'::text) $$,
  'pièce rapprochée : désignation Dolibarr, désignation d''origine gardée');
select is((select r -> 'erreurs' -> 0 ->> 'contrainte' from (select rapprocher_pieces((select id from t_ids where cle = 'srm'),
            jsonb_build_array(jsonb_build_object('piece_id', (select id from t_ids where cle = 'manchon32'), 'produit_dolibarr_id', 9001))) r) x),
  'catalogue_pieces_produit_unique', 'unicité : un produit une seule fois par marché');
select is(rapprocher_pieces((select id from t_ids where cle = 'demo'),
            jsonb_build_array(jsonb_build_object('piece_id', (select id from t_ids where cle = 'demo25'), 'produit_dolibarr_id', 9001))),
  '{"rapprochees": 1, "erreurs": []}'::jsonb, 'le même produit se rapproche dans un autre marché');
select is((select (r -> 'erreurs' -> 0 ->> 'code') from (select rapprocher_pieces((select id from t_ids where cle = 'srm'),
            jsonb_build_array(jsonb_build_object('piece_id', (select id from t_ids where cle = 'demo25'), 'produit_dolibarr_id', 9002))) r) x),
  'P0002', 'une pièce d''un autre marché est refusée (pièce introuvable dans ce marché)');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select rapprocher_pieces((select id from t_ids where cle = 'srm'), '[]'::jsonb) $$,
  '42501', null, 'responsable : ne valide pas de rapprochement');
select throws_ok($$ update catalogue_pieces set produit_dolibarr_id = 9002 where id = (select id from t_ids where cle = 'manchon32') $$,
  '42501', null, 'responsable : ne pose pas de lien directement');
select throws_ok($$ update catalogue_pieces set hors_nomenclature = true where id = (select id from t_ids where cle = 'manchon32') $$,
  '42501', null, 'responsable : ne classe pas une pièce hors nomenclature');
select throws_ok($$ update catalogue_pieces set designation = 'Autre nom' where id = (select id from t_ids where cle = 'manchon25') $$,
  '23514', null, 'responsable : ne renomme pas une pièce rapprochée');
select lives_ok($$ update catalogue_pieces set actif = false where id = (select id from t_ids where cle = 'manchon25') $$,
  'responsable : désactive une pièce rapprochée');
select results_eq($$ select produit_dolibarr_id, designation, actif from catalogue_pieces where id = (select id from t_ids where cle = 'manchon25') $$,
  $$ values (9001, 'MANCHON ESSAI DN 25'::text, false) $$,
  'pièce désactivée : lien et désignation conservés');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ update catalogue_pieces set actif = false where id = (select id from t_ids where cle = 'demo25') $$,
  'admin : désactive une pièce déjà posée (DEMO)');
select ok((select count(*) from v_pieces_posees where piece_id = (select id from t_ids where cle = 'demo25')
            and designation = 'MANCHON ESSAI DN 25') > 0,
  'désactivation sans perte d''historique : les pièces posées gardent leur désignation');
select lives_ok($$ update catalogue_pieces set hors_nomenclature = true where id = (select id from t_ids where cle = 'manchon32') $$,
  'admin : garde une pièce hors nomenclature');
select is(rapprocher_pieces((select id from t_ids where cle = 'srm'),
            jsonb_build_array(jsonb_build_object('piece_id', (select id from t_ids where cle = 'manchon25'), 'produit_dolibarr_id', null))),
  '{"rapprochees": 1, "erreurs": []}'::jsonb, 'admin : retire le lien');
select results_eq($$ select produit_dolibarr_id, designation from catalogue_pieces where id = (select id from t_ids where cle = 'manchon25') $$,
  $$ values (null::integer, 'Manchon droit 25/25'::text) $$,
  'lien retiré : la pièce reprend sa désignation d''origine');
select is(rapprocher_pieces((select id from t_ids where cle = 'srm'),
            jsonb_build_array(jsonb_build_object('piece_id', (select id from t_ids where cle = 'manchon25'), 'produit_dolibarr_id', 9001))),
  '{"rapprochees": 1, "erreurs": []}'::jsonb, 'admin : rapproche de nouveau');

-- -----------------------------------------------------------------------------
-- 5. Réimport : libellé modifié suivi par les pièces, produit disparu rendu inactif
-- -----------------------------------------------------------------------------
select is(importer_produits_dolibarr((select valeur from t_json where cle = 'import2'), array['ESS']),
  '{"produits_lus": 3, "nouveaux": 0, "modifies": 1, "designations_modifiees": 1, "desactives": 1,
    "pieces_renommees": 2, "conflits_designation": 0}'::jsonb,
  'réimport : un libellé modifié, un produit disparu, deux pièces renommées (SRM et DEMO)');
select results_eq($$ select designation from catalogue_pieces where produit_dolibarr_id = 9001 order by designation $$,
  $$ values ('MANCHON ESSAI PEHD DN 25'::text), ('MANCHON ESSAI PEHD DN 25'::text) $$,
  'les pièces rapprochées suivent le libellé de Dolibarr');
select results_eq($$ select actif from produits_dolibarr where dolibarr_id = 9003 $$, $$ values (false) $$,
  'produit absent du fichier : inactif, jamais supprimé');
reset role;

-- -----------------------------------------------------------------------------
-- 6. Journal
-- -----------------------------------------------------------------------------
select ok(exists (select 1 from journal
                   where table_nom = 'catalogue_pieces' and ligne_id = (select id::text from t_ids where cle = 'manchon25')
                     and changements ? 'produit_dolibarr_id'
                     and utilisateur_id = '00000000-0000-0000-0000-00000000000a'),
  'journal : le rapprochement est tracé avec son auteur');
select ok(exists (select 1 from journal
                   where table_nom = 'catalogue_pieces' and ligne_id = (select id::text from t_ids where cle = 'manchon25')
                     and changements -> 'designation' ->> 1 = 'MANCHON ESSAI PEHD DN 25'),
  'journal : le renommage par l''import est tracé (avant, après)');
select results_eq($$ select produits_lus, nouveaux, modifies, desactives, pieces_renommees, familles, importe_par::text
                       from imports_dolibarr order by id desc limit 1 $$,
  $$ values (3, 0, 1, 1, 2, array['ESS']::text[], '00000000-0000-0000-0000-00000000000a'::text) $$,
  'journal des imports : familles, chiffres et auteur');

-- -----------------------------------------------------------------------------
-- 7. Le réparateur ne voit que la désignation ; aucune référence ailleurs que dans la nomenclature
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select designation from catalogue_pieces where id = (select id from t_ids where cle = 'manchon25')),
  'MANCHON ESSAI PEHD DN 25', 'agent de terrain : lit la désignation Dolibarr dans le catalogue');
reset role;
select is_empty($$ select table_name || '.' || column_name from information_schema.columns
                    where table_schema = 'public'
                      and table_name in ('catalogue_pieces', 'v_pieces_posees', 'v_fuites_export', 'reparation_pieces')
                      and column_name in ('ref', 'reference_dolibarr', 'ref_dolibarr') $$,
  'aucune référence Dolibarr dans le catalogue, les pièces posées ni les exports');

-- -----------------------------------------------------------------------------
-- 8. Copie d'un marché : les liens suivent le catalogue copié
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ insert into t_ids values ('copie',
  copier_marche((select id from t_ids where cle = 'srm'), 'COPIE-P1', '4500000001', 'Marché copié (essai)')) $$,
  'admin : copie le marché SRM');
reset role;
select results_eq($$ select c.produit_dolibarr_id, c.designation, c.hors_nomenclature
                       from catalogue_pieces c
                      where c.marche_id = (select id from t_ids where cle = 'copie')
                        and c.id in (md5((select id from t_ids where cle = 'copie') || ':' || (select id from t_ids where cle = 'manchon25'))::uuid,
                                     md5((select id from t_ids where cle = 'copie') || ':' || (select id from t_ids where cle = 'manchon32'))::uuid)
                      order by c.hors_nomenclature desc $$,
  $$ values (null::integer, 'Manchon droit 32/32'::text, true), (9001, 'MANCHON ESSAI PEHD DN 25'::text, false) $$,
  'copie : lien Dolibarr et pièce hors nomenclature repris');
select is((select count(*)::int from catalogue_pieces
            where marche_id = (select id from t_ids where cle = 'copie') and produit_dolibarr_id is not null), 1,
  'copie : seules les pièces rapprochées de la source le sont');

select * from finish();
rollback;
