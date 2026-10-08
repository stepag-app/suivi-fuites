-- =============================================================================
-- Chantier v2, S2 / fichier 2 : rues OSM (import) et suggestions de localisation
-- (F3 : rues proches et secteur ; F4 : tronçon le plus proche, diamètre et matériau).
-- Jeu d'essai loin d'Oujda (lon 10 / lat 10) pour ne pas croiser les rues réelles chargées
-- par la migration ; tout est annulé à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chef.a@test.local',  '{"identifiant": "chef.a", "nom_complet": "Chef A"}'),
  ('00000000-0000-0000-0000-00000000000e', 'agent.b@test.local', '{"identifiant": "agent.b", "nom_complet": "Agent B"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-A', '1', 'Marché A', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-B', '2', 'Marché B', 'Client B');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'bbbbbbbb-0000-0000-0000-000000000001', 'detection');

insert into zones (id, marche_id, numero, code, libelle) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1, 'Z1', 'Zone 1');
insert into secteurs (id, marche_id, zone_id, code, libelle, geom) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
   'S1', 'Secteur 1', st_multi(st_geomfromtext('POLYGON((9.999 9.999, 10.001 9.999, 10.001 10.0005, 9.999 10.0005, 9.999 9.999))', 4326))),
  ('aaaaaaaa-3333-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
   'S2', 'Secteur 2', null);
-- T1 : PEHD 63 à ≈ 5,5 m au nord de P (10 ; 10), secteur S1 ; T2 : PVC 110 à ≈ 66 m, secteur S2 (sans contour)
insert into troncons (id, marche_id, reference, diametre_mm, materiau, secteur_id, geom) values
  ('aaaaaaaa-6666-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'T1', 63, 'PEHD',
   'aaaaaaaa-3333-0000-0000-000000000001', st_geomfromtext('LINESTRING(9.999 10.00005, 10.001 10.00005)', 4326)),
  ('aaaaaaaa-6666-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'T2', 110, 'PVC',
   'aaaaaaaa-3333-0000-0000-000000000002', st_geomfromtext('LINESTRING(9.999 10.0006, 10.001 10.0006)', 4326)),
  ('bbbbbbbb-6666-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'TB', 200, 'AC',
   null, st_geomfromtext('LINESTRING(9.999 10.00001, 10.001 10.00001)', 4326));

-- -----------------------------------------------------------------------------
-- 1. Rues d'Oujda chargées par la migration (OSM, ODbL)
-- -----------------------------------------------------------------------------
select ok((select count(*) from rues where ville = 'Oujda') > 3000, 'Oujda : plus de 3 000 voies nommées chargées');
select ok((select count(*) from rues where ville = 'Oujda' and nom_ar is not null) > 500, 'Oujda : noms arabes présents');
select ok(obj_description('public.rues'::regclass) like '%OpenStreetMap%ODbL%', 'licence ODbL citée sur la table');

-- -----------------------------------------------------------------------------
-- 2. Import (administrateur)
-- -----------------------------------------------------------------------------
create temporary table t_donnees (cle text primary key, valeur jsonb);
grant select on t_donnees to authenticated;
insert into t_donnees values ('rues', $j$[
  {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[9.999, 10.0001], [10.001, 10.0001]]},
   "properties": {"id": 9000000001, "nom": "Rue Alpha", "nom_fr": "Rue Alpha", "categorie": "residential"}},
  {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[9.999, 10.0002], [10.001, 10.0002]]},
   "properties": {"id": 9000000002, "nom": "Boulevard Beta شارع بيتا", "nom_fr": "Boulevard Beta", "nom_ar": "شارع بيتا", "categorie": "primary"}},
  {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[9.999, 9.9997], [10.001, 9.9997]]},
   "properties": {"id": 9000000003, "nom": "Boulevard Beta", "nom_fr": "Boulevard Beta", "categorie": "primary"}},
  {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[9.999, 10.0008], [10.001, 10.0008]]},
   "properties": {"id": 9000000004, "nom": "Rue Gamma", "nom_fr": "Rue Gamma", "categorie": "residential"}},
  {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[9.999, 10.01], [10.001, 10.01]]},
   "properties": {"id": 9000000005, "nom": "Rue Lointaine", "categorie": "residential"}},
  {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[9.999, 10.0001], [10.001, 10.0001]]},
   "properties": {"id": 9000000006, "categorie": "residential"}},
  {"type": "Feature", "geometry": {"type": "Point", "coordinates": [10, 10]},
   "properties": {"id": 9000000007, "nom": "Point"}}
]$j$);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ select importer_rues((select valeur from t_donnees where cle = 'rues')) $$,
  '42501', 'Import des rues réservé à l''administrateur', 'agent : import refusé');
select throws_ok($$ insert into rues (id, nom, geom) values (1, 'x', st_geomfromtext('LINESTRING(0 0, 1 1)', 4326)) $$,
  '42501', null, 'agent : aucune écriture directe');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is(importer_rues((select valeur from t_donnees where cle = 'rues'), 'Essai'),
  '{"recues": 7, "ecrites": 5}'::jsonb, 'administrateur : 5 voies écrites, sans nom et non linéaire ignorées');
select is(importer_rues((select valeur from t_donnees where cle = 'rues'), 'Essai'),
  '{"recues": 7, "ecrites": 0}'::jsonb, 'import idempotent : rien de réécrit');
select is(importer_rues(jsonb_set((select valeur from t_donnees where cle = 'rues'), '{0,properties,nom_ar}', '"زنقة ألفا"'), 'Essai'),
  '{"recues": 7, "ecrites": 1}'::jsonb, 'réimport : seule la voie modifiée est réécrite');

-- -----------------------------------------------------------------------------
-- 3. Suggestions de localisation
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
create temporary table t_s (cle text primary key, s jsonb);
insert into t_s values
  ('p',       suggestions_localisation('aaaaaaaa-0000-0000-0000-000000000001', 10.0, 10.0)),
  ('p50',     suggestions_localisation('aaaaaaaa-0000-0000-0000-000000000001', 10.0, 10.0, 50)),
  ('q',       suggestions_localisation('aaaaaaaa-0000-0000-0000-000000000001', 10.0, 10.0007, 5)),
  ('loin',    suggestions_localisation('aaaaaaaa-0000-0000-0000-000000000001', 20.0, 20.0, 5)),
  ('imprecis', suggestions_localisation('aaaaaaaa-0000-0000-0000-000000000001', 10.0, 10.0, 250));

select is((select s -> 'rayon_m' from t_s where cle = 'p'), '30'::jsonb, 'sans précision : rayon 30 m');
select is((select array_agg(r ->> 'nom' order by o) from t_s, jsonb_array_elements(s -> 'rues') with ordinality x (r, o) where cle = 'p'),
  array['Rue Alpha', 'Boulevard Beta'], 'rues dans 30 m, la plus proche d''abord ; un nom = une suggestion');
select ok((select (s -> 'rues' -> 0 ->> 'distance_m')::numeric between 10 and 12 from t_s where cle = 'p'),
  'distance en mètres (Rue Alpha ≈ 11 m)');
select is((select s -> 'rues' -> 1 ->> 'nom_ar' from t_s where cle = 'p'), 'شارع بيتا', 'nom arabe gardé');
select is((select s -> 'rues' -> 0 ->> 'nom_ar' from t_s where cle = 'p'), 'زنقة ألفا', 'nom arabe réimporté');
select is((select s -> 'rayon_m' from t_s where cle = 'p50'), '100'::jsonb, 'précision 50 m : rayon 100 m');
select is((select array_agg(r ->> 'nom' order by o) from t_s, jsonb_array_elements(s -> 'rues') with ordinality x (r, o) where cle = 'p50'),
  array['Rue Alpha', 'Boulevard Beta', 'Rue Gamma'], 'rayon élargi : Rue Gamma (≈ 88 m) suggérée');
select results_eq($$ select s -> 'troncon' ->> 'reference', (s -> 'troncon' ->> 'diametre_mm')::int, s -> 'troncon' ->> 'materiau',
                            s -> 'troncon' ->> 'materiau_plan', s -> 'troncon' -> 'geojson' ->> 'type'
                       from t_s where cle = 'p' $$,
  $$ values ('T1'::text, 63, 'polyethylene'::text, 'PEHD'::text, 'LineString'::text) $$,
  'tronçon le plus proche du marché : diamètre 63 et matériau PE suggérés, géométrie pour la carte');
select results_eq($$ select s -> 'secteur' ->> 'code', s -> 'secteur' ->> 'source' from t_s where cle = 'p' $$,
  $$ values ('S1'::text, 'contour'::text) $$, 'secteur : contour qui contient le point');
select results_eq($$ select s -> 'troncon' ->> 'reference', s -> 'secteur' ->> 'code', s -> 'secteur' ->> 'source',
                            (select array_agg(r ->> 'nom') from jsonb_array_elements(s -> 'rues') r)
                       from t_s where cle = 'q' $$,
  $$ values ('T2'::text, 'S2'::text, 'troncon'::text, array['Rue Gamma']) $$,
  'hors contour : secteur du tronçon le plus proche ; rayon 30 m (précision 5 m)');
select is((select s from t_s where cle = 'loin'),
  '{"rayon_m": 30, "precision_insuffisante": false, "rues": [], "secteur": null, "troncon": null}'::jsonb,
  'rien autour : listes vides, aucune suggestion');
select is((select s from t_s where cle = 'imprecis'),
  '{"rayon_m": null, "precision_insuffisante": true, "rues": [], "secteur": null, "troncon": null}'::jsonb,
  'précision au-delà de 200 m : aucune suggestion');
select throws_ok($$ select suggestions_localisation('bbbbbbbb-0000-0000-0000-000000000001', 10.0, 10.0) $$,
  '42501', 'Marché non autorisé', 'agent A : marché B refusé');
select throws_ok($$ select suggestions_localisation('aaaaaaaa-0000-0000-0000-000000000001', 200, 10) $$,
  '22023', 'Position invalide', 'position hors bornes refusée');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is(suggestions_localisation('aaaaaaaa-0000-0000-0000-000000000001', 10.0, 10.0) -> 'troncon' ->> 'reference', 'T1',
  'chef de réparation : mêmes suggestions');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select is(suggestions_localisation('bbbbbbbb-0000-0000-0000-000000000001', 10.0, 10.0) -> 'troncon' ->> 'materiau', 'amiante_ciment',
  'agent B : tronçons de son seul marché (AC 200)');
select is(suggestions_localisation('bbbbbbbb-0000-0000-0000-000000000001', 10.0, 10.0) -> 'secteur', 'null'::jsonb,
  'tronçon sans secteur et aucun contour : pas de secteur suggéré');
reset role;
select ok(not has_function_privilege('anon', 'public.suggestions_localisation(uuid, double precision, double precision, numeric)', 'execute'),
  'anon : aucune suggestion');
select ok(not has_function_privilege('authenticated', 'private.charger_rues(jsonb, text)', 'execute'),
  'chargement interne fermé aux comptes');

select * from finish();
rollback;
