-- =============================================================================
-- Lot S2 : réseau (tronçons, nœuds) et balayage par tronçon.
-- Import GeoJSON (administrateur), zonage automatique par contour et par
-- secteur_code, lecture par rôle et par marché, GeoJSON pour la carte,
-- balayages (premier passage, annulation, statut du secteur), affectation par
-- liste et par polygone avec recalcul des contours, vues, marché désactivé,
-- copie de marché sans tronçons.
-- Jeu d'essai autour d'Oujda (lon -1,91 / lat 34,68) ; tout est annulé à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(116);

-- -----------------------------------------------------------------------------
-- Jeu d'essai : a = admin, b = détection A, c = chef réparation A,
-- d = responsable A, e = détection B
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chef.a@test.local',  '{"identifiant": "chef.a", "nom_complet": "Chef A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}'),
  ('00000000-0000-0000-0000-00000000000e', 'agent.b@test.local', '{"identifiant": "agent.b", "nom_complet": "Agent B"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-A', '1', 'Marché A', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-B', '2', 'Marché B', 'Client B');

select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'bbbbbbbb-0000-0000-0000-000000000001', 'detection');

-- Deux zones, trois secteurs (S1 et S2 avec contour, S3 sans), une équipe de détection
insert into zones (id, marche_id, numero, code, libelle, lineaire_m) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1, 'Z1', 'Zone 1', 1000),
  ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 2, 'Z2', 'Zone 2', 500);
insert into secteurs (id, marche_id, zone_id, code, libelle, lineaire_m, ordre, geom) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
   'S1', 'Secteur 1', 400, 1,
   st_multi(st_geomfromtext('POLYGON((-1.9150 34.6800, -1.9100 34.6800, -1.9100 34.6850, -1.9150 34.6850, -1.9150 34.6800))', 4326))),
  ('aaaaaaaa-3333-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
   'S2', 'Secteur 2', 250, 2,
   st_multi(st_geomfromtext('POLYGON((-1.9100 34.6800, -1.9050 34.6800, -1.9050 34.6850, -1.9100 34.6850, -1.9100 34.6800))', 4326))),
  ('aaaaaaaa-3333-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000002',
   'S3', 'Secteur 3', 300, 3, null);

create temporary table t_donnees (cle text primary key, valeur jsonb);
grant select, insert on t_donnees to authenticated;
create temporary table t_ids (cle text primary key, id uuid);
grant select, insert on t_ids to authenticated;

-- Fichier 1 : neuf tronçons valides (T1-T4 dans S1, T5-T6 dans S2, T7 par secteur_code,
-- T8-T9 hors contour) et trois features à ignorer (sans référence, Point, doublon).
insert into t_donnees values ('fichier1', $j$[
  {"type": "Feature", "properties": {"reference": "T1", "calque": "AEP-DN63", "categorie": "conduite", "diametre_mm": 63, "materiau": "PEHD"},
   "geometry": {"type": "LineString", "coordinates": [[-1.9140, 34.6810], [-1.9130, 34.6810]]}},
  {"type": "Feature", "properties": {"reference": "T2", "calque": "AEP-DN63", "categorie": "conduite", "diametre_mm": "63", "materiau": "PEHD"},
   "geometry": {"type": "LineString", "coordinates": [[-1.9130, 34.6810], [-1.9120, 34.6810]]}},
  {"type": "Feature", "properties": {"reference": "T3", "calque": "AEP-DN110", "categorie": "conduite", "diametre_mm": 110, "materiau": "PVC"},
   "geometry": {"type": "LineString", "coordinates": [[-1.9140, 34.6820], [-1.9140, 34.6830]]}},
  {"type": "Feature", "properties": {"reference": "T4", "calque": "AEP-BRT", "categorie": "branchement", "diametre_mm": null, "materiau": null},
   "geometry": {"type": "LineString", "coordinates": [[-1.9130, 34.6830], [-1.9120, 34.6835]]}},
  {"type": "Feature", "properties": {"reference": "T5", "calque": "AEP-DN63", "categorie": "conduite", "diametre_mm": 63, "materiau": "PEHD"},
   "geometry": {"type": "LineString", "coordinates": [[-1.9090, 34.6810], [-1.9080, 34.6810]]}},
  {"type": "Feature", "properties": {"reference": "T6", "calque": "AEP-DN200", "categorie": "inconnue", "diametre_mm": 200, "materiau": "FONTE"},
   "geometry": {"type": "LineString", "coordinates": [[-1.9080, 34.6820], [-1.9080, 34.6830]]}},
  {"type": "Feature", "properties": {"reference": "T7", "calque": "AEP-DN315", "categorie": "adduction", "diametre_mm": 315, "materiau": "FONTE", "secteur_code": "S3"},
   "geometry": {"type": "LineString", "coordinates": [[-1.9000, 34.6900], [-1.9000, 34.6910]]}},
  {"type": "Feature", "properties": {"reference": "T8", "calque": "AEP-DN63", "categorie": "conduite", "diametre_mm": 63, "materiau": "PEHD", "secteur_code": "INCONNU"},
   "geometry": {"type": "LineString", "coordinates": [[-1.9200, 34.6900], [-1.9195, 34.6900]]}},
  {"type": "Feature", "properties": {"reference": "T9", "calque": "AEP-DN63", "categorie": "conduite", "diametre_mm": 63, "materiau": "PEHD"},
   "geometry": {"type": "LineString", "coordinates": [[-1.9200, 34.6920], [-1.9190, 34.6920]]}},
  {"type": "Feature", "properties": {"calque": "AEP-DN63"},
   "geometry": {"type": "LineString", "coordinates": [[-1.9300, 34.6900], [-1.9290, 34.6900]]}},
  {"type": "Feature", "properties": {"reference": "X11"},
   "geometry": {"type": "Point", "coordinates": [-1.9300, 34.6900]}},
  {"type": "Feature", "properties": {"reference": "T1", "calque": "DOUBLON"},
   "geometry": {"type": "LineString", "coordinates": [[-1.9300, 34.6910], [-1.9290, 34.6910]]}}
]$j$::jsonb);

insert into t_donnees values ('fichierB', $j$[
  {"type": "Feature", "properties": {"reference": "TB1", "calque": "AEP"},
   "geometry": {"type": "LineString", "coordinates": [[-1.9000, 34.7000], [-1.9000, 34.7010]]}}
]$j$::jsonb);

-- Nœuds : N1 au départ de T1, N2 à l'arrivée de T7 (secteur_code), N3 au départ de T8
-- (hors contour), N4 à l'arrivée de T5 (type inconnu), N5 à ignorer (LineString).
insert into t_donnees values ('noeuds', $j$[
  {"type": "Feature", "properties": {"reference": "N1", "type": "vanne", "calque": "AEP-VANNES"},
   "geometry": {"type": "Point", "coordinates": [-1.9140, 34.6810]}},
  {"type": "Feature", "properties": {"reference": "N2", "type": "bouche_incendie", "secteur_code": "S3"},
   "geometry": {"type": "Point", "coordinates": [-1.9000, 34.6910]}},
  {"type": "Feature", "properties": {"reference": "N3", "type": "jonction"},
   "geometry": {"type": "Point", "coordinates": [-1.9200, 34.6900]}},
  {"type": "Feature", "properties": {"reference": "N4", "type": "inconnu"},
   "geometry": {"type": "Point", "coordinates": [-1.9080, 34.6810]}},
  {"type": "Feature", "properties": {"reference": "N5"},
   "geometry": {"type": "LineString", "coordinates": [[-1.9000, 34.6900], [-1.9000, 34.6910]]}}
]$j$::jsonb);

insert into t_donnees values ('polygone_s2', $j${"type": "Polygon", "coordinates":
  [[[-1.9100, 34.6800], [-1.9050, 34.6800], [-1.9050, 34.6850], [-1.9100, 34.6850], [-1.9100, 34.6800]]]}$j$::jsonb);
insert into t_donnees values ('polygone_s1', $j${"type": "Polygon", "coordinates":
  [[[-1.9150, 34.6800], [-1.9100, 34.6800], [-1.9100, 34.6850], [-1.9150, 34.6850], [-1.9150, 34.6800]]]}$j$::jsonb);

-- -----------------------------------------------------------------------------
-- 0. Structure : RLS, rien pour anon, pas de suppression, modèles de rôles
-- -----------------------------------------------------------------------------
select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname in ('troncons', 'noeuds', 'balayages')),
  'RLS activée sur troncons, noeuds et balayages');
select is_empty($$ select table_name from information_schema.role_table_grants
                    where grantee = 'anon' and table_schema = 'public'
                      and table_name in ('troncons', 'noeuds', 'balayages') $$,
  'anon : aucun privilège sur le réseau et les balayages');
select is_empty($$ select table_name from information_schema.role_table_grants
                    where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'DELETE'
                      and table_name in ('troncons', 'noeuds', 'balayages') $$,
  'authenticated : aucune suppression physique');
select results_eq($$ select lire, creer, modifier::text, supprimer::text, valider from modeles_droits
                      where role = 'detection' and type_donnee = 'balayage' $$,
  $$ values (true, true, 'non', 'siennes', false) $$,
  'modèle « detection » : balayage lire, créer, supprimer les siennes');
select results_eq($$ select lire, creer, modifier::text, supprimer::text, valider from modeles_droits
                      where role = 'responsable' and type_donnee = 'balayage' $$,
  $$ values (true, true, 'toutes', 'toutes', true) $$,
  'modèle « responsable » : balayage complet, validation comprise');
select ok(not has_function_privilege('anon', 'public.importer_troncons(uuid, jsonb)', 'execute'),
  'anon : n''appelle pas l''import');
select ok(not has_function_privilege('authenticated', 'private.recalculer_statut_secteurs(uuid[])', 'execute'),
  'authenticated : les recalculs internes ne sont pas appelables directement');

-- -----------------------------------------------------------------------------
-- 1. Import : réservé à l'administrateur, idempotent, mise à jour par référence
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select importer_troncons('aaaaaaaa-0000-0000-0000-000000000001', (select valeur from t_donnees where cle = 'fichier1')) $$,
  '42501', null, 'responsable : l''import du réseau lui est refusé');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ insert into t_donnees values ('import1',
  importer_troncons('aaaaaaaa-0000-0000-0000-000000000001', (select valeur from t_donnees where cle = 'fichier1'))) $$,
  'admin : importe le fichier de tronçons');
select results_eq($$ select (valeur ->> 'inseres')::int, (valeur ->> 'mis_a_jour')::int, (valeur ->> 'inchanges')::int, (valeur ->> 'ignores')::int
                      from t_donnees where cle = 'import1' $$,
  $$ values (9, 0, 0, 3) $$, 'premier import : 9 insérés, 3 ignorés');
select results_eq($$ select e ->> 'index', e ->> 'message'
                      from t_donnees, jsonb_array_elements(valeur -> 'erreurs') e
                     where cle = 'import1' order by (e ->> 'index')::int $$,
  $$ values ('9', 'référence manquante'), ('10', 'géométrie attendue : LineString'), ('11', 'référence en double dans le fichier') $$,
  'erreurs détaillées : référence manquante, mauvais type, doublon');
select lives_ok($$ insert into t_donnees values ('import2',
  importer_troncons('aaaaaaaa-0000-0000-0000-000000000001', (select valeur from t_donnees where cle = 'fichier1'))) $$,
  'admin : réimporte le même fichier');
select results_eq($$ select (valeur ->> 'inseres')::int, (valeur ->> 'mis_a_jour')::int, (valeur ->> 'inchanges')::int, (valeur ->> 'ignores')::int
                      from t_donnees where cle = 'import2' $$,
  $$ values (0, 0, 9, 3) $$, 'réimport : idempotent, rien d''inséré ni de modifié');
select lives_ok($$ insert into t_donnees values ('import3',
  importer_troncons('aaaaaaaa-0000-0000-0000-000000000001', '[
    {"type": "Feature", "properties": {"reference": "T1", "calque": "AEP-DN110", "categorie": "conduite", "diametre_mm": 110, "materiau": "PVC"},
     "geometry": {"type": "LineString", "coordinates": [[-1.9140, 34.6810], [-1.9120, 34.6810]]}}]'::jsonb)) $$,
  'admin : importe T1 modifié');
select results_eq($$ select (valeur ->> 'inseres')::int, (valeur ->> 'mis_a_jour')::int, (valeur ->> 'inchanges')::int, (valeur ->> 'ignores')::int
                      from t_donnees where cle = 'import3' $$,
  $$ values (0, 1, 0, 0) $$, 'mise à jour par référence : 1 modifié');
select throws_ok($$ select importer_troncons('aaaaaaaa-0000-0000-0000-000000000001',
  (select jsonb_agg(f) from t_donnees, jsonb_array_elements(valeur) f, generate_series(1, 200) where cle = 'fichier1')) $$,
  '54000', null, 'plus de 2 000 features dans un appel : refusé');
select lives_ok($$ insert into t_donnees values ('importB',
  importer_troncons('bbbbbbbb-0000-0000-0000-000000000001', (select valeur from t_donnees where cle = 'fichierB'))) $$,
  'admin : importe un tronçon dans le marché B');
select lives_ok($$ insert into t_donnees values ('noeuds_import',
  importer_noeuds('aaaaaaaa-0000-0000-0000-000000000001', (select valeur from t_donnees where cle = 'noeuds'))) $$,
  'admin : importe les nœuds');
select results_eq($$ select (valeur ->> 'inseres')::int, (valeur ->> 'mis_a_jour')::int, (valeur ->> 'inchanges')::int, (valeur ->> 'ignores')::int
                      from t_donnees where cle = 'noeuds_import' $$,
  $$ values (4, 0, 0, 1) $$, 'nœuds : 4 insérés, 1 ignoré (LineString)');
reset role;

insert into t_ids select reference, id from troncons where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into t_ids select reference, id from noeuds where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- -----------------------------------------------------------------------------
-- 2. Données calculées : longueur, zonage, lecture des propriétés
-- -----------------------------------------------------------------------------
select results_eq($$ select diametre_mm, longueur_m between 182 and 184 from troncons where id = (select id from t_ids where cle = 'T1') $$,
  $$ values (110, true) $$, 'T1 mis à jour : diamètre 110, longueur recalculée (≈ 183 m)');
select ok((select longueur_m between 110 and 112 from troncons where id = (select id from t_ids where cle = 'T3')),
  'longueur géodésique : 0,001° de latitude ≈ 111 m');
select results_eq($$ select t.reference, s.code from troncons t left join secteurs s on s.id = t.secteur_id
                      where t.marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by t.reference $$,
  $$ values ('T1', 'S1'), ('T2', 'S1'), ('T3', 'S1'), ('T4', 'S1'), ('T5', 'S2'), ('T6', 'S2'),
            ('T7', 'S3'), ('T8', null), ('T9', null) $$,
  'zonage : par contour (milieu du tronçon), par secteur_code, sinon non zoné');
select is((select zone_id from troncons where id = (select id from t_ids where cle = 'T7')),
  'aaaaaaaa-2222-0000-0000-000000000002', 'la zone suit le secteur');
select results_eq($$ select (select diametre_mm from troncons where id = (select id from t_ids where cle = 'T2')),
                            (select categorie from troncons where id = (select id from t_ids where cle = 'T6')) $$,
  $$ values (63, 'autre') $$, 'propriétés : diamètre en texte lu, catégorie inconnue → autre');
select results_eq($$ select nb_troncons, lineaire_m between 136 and 139 from v_troncons_sans_secteur
                      where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  $$ values (2, true) $$, 'v_troncons_sans_secteur : T8 et T9 restent à zoner');
select results_eq($$ select n.reference, s.code, n.type from noeuds n left join secteurs s on s.id = n.secteur_id
                      where n.marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by n.reference $$,
  $$ values ('N1', 'S1', 'vanne'), ('N2', 'S3', 'bouche_incendie'), ('N3', null, 'jonction'), ('N4', 'S2', 'autre') $$,
  'nœuds : zonés par le point ou par secteur_code, type inconnu → autre');
select is((select count(*)::int from journal where table_nom in ('troncons', 'noeuds') and ligne_id = 'import'
             and utilisateur_id = '00000000-0000-0000-0000-00000000000a'), 5,
  'journal : une entrée résumée par import, au nom de l''administrateur');

-- -----------------------------------------------------------------------------
-- 3. Lecture et écriture par rôle ; GeoJSON pour la carte
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from troncons), 9, 'détection A : lit les 9 tronçons de son marché');
select throws_ok($$ insert into troncons (marche_id, reference, geom) values ('aaaaaaaa-0000-0000-0000-000000000001', 'PIRATE',
  st_geomfromtext('LINESTRING(-1.9100 34.6800, -1.9090 34.6800)', 4326)) $$,
  '42501', null, 'détection : ne crée pas de tronçon');
select results_eq($$ with u as (update troncons set calque = 'x' where id = (select id from t_ids where cle = 'T1') returning 1)
                     select count(*)::int from u $$,
  $$ values (0) $$, 'détection : ne modifie aucun tronçon (aucune ligne touchée)');
select results_eq($$ select r ->> 'type', jsonb_array_length(r -> 'features')
                      from (select reseau_geojson('aaaaaaaa-0000-0000-0000-000000000001') r) x $$,
  $$ values ('FeatureCollection', 7) $$, 'reseau_geojson : FeatureCollection des 7 tronçons zonés');
select results_eq($$ select jsonb_array_length(reseau_geojson('aaaaaaaa-0000-0000-0000-000000000001', null, true) -> 'features'),
                            jsonb_array_length(reseau_geojson('aaaaaaaa-0000-0000-0000-000000000001',
                              array['aaaaaaaa-3333-0000-0000-000000000001']::uuid[]) -> 'features') $$,
  $$ values (9, 4) $$, 'reseau_geojson : avec les non zonés (9), par secteur (S1 : 4)');
select results_eq($$ select jsonb_array_length(r -> 'features'),
                            (select bool_and(f -> 'properties' -> 's' = 'null'::jsonb) from jsonb_array_elements(r -> 'features') f),
                            jsonb_array_length(reseau_geojson('aaaaaaaa-0000-0000-0000-000000000001', '{}'::uuid[], false) -> 'features')
                      from (select reseau_geojson('aaaaaaaa-0000-0000-0000-000000000001', '{}'::uuid[], true) r) x $$,
  $$ values (2, true, 0) $$, 'reseau_geojson : tableau vide = aucun secteur ; avec p_sans_secteur, les 2 non zonés seuls');
select is((select array_agg(k order by k) from jsonb_object_keys(
             reseau_geojson('aaaaaaaa-0000-0000-0000-000000000001') -> 'features' -> 0 -> 'properties') k),
  array['c', 'd', 'id', 'l', 'm', 's', 'z'], 'reseau_geojson : propriétés courtes id, s, z, c, d, m, l');
select results_eq($$ select f -> 'geometry' ->> 'type', (f -> 'properties' ->> 's')::uuid, (f -> 'properties' ->> 'l')::numeric > 0
                      from jsonb_array_elements(reseau_geojson('aaaaaaaa-0000-0000-0000-000000000001',
                             array['aaaaaaaa-3333-0000-0000-000000000001']::uuid[]) -> 'features') f limit 1 $$,
  $$ values ('LineString', 'aaaaaaaa-3333-0000-0000-000000000001'::uuid, true) $$,
  'reseau_geojson : géométrie LineString, secteur et longueur');
select is(jsonb_array_length(reseau_geojson('aaaaaaaa-0000-0000-0000-000000000001', null, false, 0.0001) -> 'features'), 7,
  'reseau_geojson : simplification acceptée');
select results_eq($$ select jsonb_array_length(a -> 'features'), jsonb_array_length(b -> 'features'),
                            (select array_agg(k order by k) from jsonb_object_keys(a -> 'features' -> 0 -> 'properties') k)
                      from (select noeuds_geojson('aaaaaaaa-0000-0000-0000-000000000001') a,
                                   noeuds_geojson('aaaaaaaa-0000-0000-0000-000000000001', null, true) b) x $$,
  $$ values (3, 4, array['id', 's', 't', 'z']) $$, 'noeuds_geojson : zonés (3), avec les non zonés (4), propriétés id, s, z, t');
select results_eq($$ select jsonb_array_length(noeuds_geojson('aaaaaaaa-0000-0000-0000-000000000001', '{}'::uuid[], true) -> 'features'),
                            noeuds_geojson('aaaaaaaa-0000-0000-0000-000000000001', '{}'::uuid[], true) -> 'features' -> 0 -> 'properties' ->> 'id',
                            jsonb_array_length(noeuds_geojson('aaaaaaaa-0000-0000-0000-000000000001',
                              array['aaaaaaaa-3333-0000-0000-000000000001']::uuid[]) -> 'features') $$,
  $$ select 1, (select id::text from t_ids where cle = 'N3'), 1 $$,
  'noeuds_geojson : tableau vide + sans secteur = N3 seul ; liste (S1) = N1');
select is((select count(*)::int from etat_balayage('aaaaaaaa-0000-0000-0000-000000000001')), 0,
  'etat_balayage : vide avant tout balayage');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select is(reseau_geojson('aaaaaaaa-0000-0000-0000-000000000001'), '{"type": "FeatureCollection", "features": []}'::jsonb,
  'détection B : FeatureCollection vide (objet valide) pour un marché non affecté');
select results_eq($$ select (select count(*)::int from troncons), (select count(*)::int from noeuds), (select count(*)::int from balayages) $$,
  $$ values (1, 0, 0) $$, 'détection B : son seul tronçon, rien du marché A');
select is((select count(*)::int from private.noeuds_extremites((select id from t_ids where cle = 'T1'))), 0,
  'détection B : la recherche des nœuds d''extrémité (SECURITY DEFINER) ne sort pas de ses marchés');

-- -----------------------------------------------------------------------------
-- 4. Balayages : premier passage, annulation, statut du secteur
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select lives_ok($$ insert into balayages (id, marche_id, troncon_id, balaye_le) values
  ('aaaaaaaa-8888-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', (select id from t_ids where cle = 'T1'), now() - interval '2 hours') $$,
  'détection : enregistre un balayage de T1');
select results_eq($$ select agent_id::text, saisi_par::text, premier_passage, source_saisie::text
                      from balayages where id = 'aaaaaaaa-8888-0000-0000-000000000001' $$,
  $$ values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', true, 'tablette') $$,
  'balayage : agent et saisie = compte connecté, premier passage');
select is((select statut_balayage::text from secteurs where id = 'aaaaaaaa-3333-0000-0000-000000000001'), 'en_cours',
  'secteur S1 : à balayer → en cours');
select lives_ok($$ insert into balayages (id, marche_id, troncon_id, balaye_le) values
  ('aaaaaaaa-8888-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', (select id from t_ids where cle = 'T1'), now() - interval '1 hour') $$,
  'détection : second passage sur T1');
select is((select premier_passage from balayages where id = 'aaaaaaaa-8888-0000-0000-000000000002'), false,
  'second passage : premier_passage faux');
select throws_ok($$ insert into balayages (marche_id, troncon_id, motif_repasse) values
  ('aaaaaaaa-0000-0000-0000-000000000001', (select id from t_ids where cle = 'T1'), 'pour voir') $$,
  '23514', null, 'motif de second passage hors liste refusé');
select lives_ok($$ insert into balayages (id, marche_id, troncon_id, balaye_le) values
  ('aaaaaaaa-8888-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', (select id from t_ids where cle = 'T1'), now() - interval '3 hours') $$,
  'détection : balayage plus ancien synchronisé après coup');
select results_eq($$ select id::text, premier_passage from balayages
                      where troncon_id = (select id from t_ids where cle = 'T1') order by balaye_le $$,
  $$ values ('aaaaaaaa-8888-0000-0000-000000000003', true), ('aaaaaaaa-8888-0000-0000-000000000001', false),
            ('aaaaaaaa-8888-0000-0000-000000000002', false) $$,
  'premier_passage recalculé : le plus ancien balayage non annulé');
select throws_ok($$ update balayages set observation = 'x' where id = 'aaaaaaaa-8888-0000-0000-000000000001' $$,
  '23514', null, 'un balayage ne se modifie pas');
select throws_ok($$ update balayages set annule_le = now() where id = 'aaaaaaaa-8888-0000-0000-000000000002' $$,
  '23514', 'Motif d''annulation obligatoire', 'annulation sans motif refusée');
select lives_ok($$ update balayages set annule_le = now(), motif_annulation = 'Erreur de tronçon'
                    where id = 'aaaaaaaa-8888-0000-0000-000000000002' $$,
  'détection : annule son propre balayage');
select results_eq($$ select annule_par::text, premier_passage from balayages where id = 'aaaaaaaa-8888-0000-0000-000000000002' $$,
  $$ values ('00000000-0000-0000-0000-00000000000b', false) $$, 'annulation : auteur enregistré');
select throws_ok($$ update balayages set annule_le = null, motif_annulation = null where id = 'aaaaaaaa-8888-0000-0000-000000000002' $$,
  '23514', 'Ce balayage est déjà annulé', 'un balayage annulé ne se rétablit pas');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ insert into balayages (id, marche_id, troncon_id) values
  ('aaaaaaaa-8888-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', (select id from t_ids where cle = 'T5')) $$,
  'responsable : balaie T5');
select lives_ok($$ insert into balayages (id, marche_id, troncon_id) values
  ('aaaaaaaa-8888-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', (select id from t_ids where cle = 'T6')) $$,
  'responsable : balaie T6');
select is((select statut_balayage::text from secteurs where id = 'aaaaaaaa-3333-0000-0000-000000000002'), 'balayee',
  'secteur S2 : tous les tronçons balayés → balayée');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ update balayages set annule_le = now(), motif_annulation = 'pas à moi'
                     where id = 'aaaaaaaa-8888-0000-0000-000000000005' $$,
  '42501', null, 'détection : n''annule pas le balayage d''un autre');
select lives_ok($$ insert into balayages (id, marche_id, troncon_id) values
  ('aaaaaaaa-8888-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', (select id from t_ids where cle = 'T5')) $$,
  'détection : repasse sur T5');
select is((select premier_passage from balayages where id = 'aaaaaaaa-8888-0000-0000-000000000007'), false,
  'repassage : premier_passage faux');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select throws_ok($$ insert into balayages (marche_id, troncon_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', (select id from t_ids where cle = 'T2')) $$,
  '42501', null, 'chef de réparation : ne balaie pas');
select is((select count(*)::int from balayages), 0,
  'chef de réparation : son modèle n''a pas (encore) de droit balayage, il ne lit aucun balayage');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ update balayages set annule_le = now(), motif_annulation = 'Doublon'
                    where id = 'aaaaaaaa-8888-0000-0000-000000000003' $$,
  'responsable (toutes) : annule le balayage de l''agent');
select is((select premier_passage from balayages where id = 'aaaaaaaa-8888-0000-0000-000000000001'), true,
  'premier_passage recalculé après annulation : le suivant devient premier');
select lives_ok($$ update balayages set annule_le = now(), motif_annulation = 'Doublon'
                    where id = 'aaaaaaaa-8888-0000-0000-000000000001' $$,
  'responsable : annule le dernier balayage de T1');
select is((select statut_balayage::text from secteurs where id = 'aaaaaaaa-3333-0000-0000-000000000001'), 'a_balayer',
  'secteur S1 : plus aucun balayage → à balayer');
reset role;

select ok(exists (select 1 from journal where table_nom = 'balayages' and operation = 'suppression_logique'
                    and ligne_id = 'aaaaaaaa-8888-0000-0000-000000000003'
                    and utilisateur_id = '00000000-0000-0000-0000-00000000000d'
                    and changements ->> 'motif_annulation' = 'Doublon'),
  'journal : annulation tracée au nom du responsable, avec le motif');
select is((select count(*)::int from journal where table_nom = 'balayages'), 3,
  'journal : une entrée par annulation, aucune par balayage');

-- -----------------------------------------------------------------------------
-- 5. État de balayage pour la carte
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select results_eq($$ select premier_le = private.jour_maroc(now()),
                            dernier_le = private.jour_maroc(now()),
                            nb_passages, agent_id::text
                      from etat_balayage('aaaaaaaa-0000-0000-0000-000000000001')
                     where troncon_id = (select id from t_ids where cle = 'T5') $$,
  $$ values (true, true, 2, '00000000-0000-0000-0000-00000000000b') $$,
  'etat_balayage : deux passages sur T5 (responsable puis agent), agent du dernier passage');
select results_eq($$ select (select count(*)::int from etat_balayage('aaaaaaaa-0000-0000-0000-000000000001')),
                            (select count(*)::int from etat_balayage('aaaaaaaa-0000-0000-0000-000000000001',
                               array['aaaaaaaa-3333-0000-0000-000000000001']::uuid[])) $$,
  $$ values (2, 0) $$, 'etat_balayage : T5 et T6 seulement (T1 tout annulé) ; filtre par secteur');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select is((select count(*)::int from etat_balayage('aaaaaaaa-0000-0000-0000-000000000001')), 0,
  'etat_balayage : non affecté au marché → zéro ligne');
reset role;
insert into droits (profil_id, marche_id, type_donnee, lire) values
  ('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'balayage', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((select count(*)::int from etat_balayage('aaaaaaaa-0000-0000-0000-000000000001')), 2,
  'etat_balayage : lisible avec le seul droit « balayage / lire » (chef de réparation)');
reset role;
update droits set lire = false where profil_id = '00000000-0000-0000-0000-00000000000c' and type_donnee = 'balayage';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((select count(*)::int from etat_balayage('aaaaaaaa-0000-0000-0000-000000000001')), 0,
  'etat_balayage : sans « balayage / lire » → zéro ligne, pas d''erreur');

-- -----------------------------------------------------------------------------
-- 6. Zonage : affectation par liste et par polygone, contours
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is(affecter_troncons_secteur('aaaaaaaa-3333-0000-0000-000000000003',
            array[(select id from t_ids where cle = 'T8'), (select id from t_ids where cle = 'T9')]), 2,
  'responsable : affecte T8 et T9 au secteur S3');
select results_eq($$ select s.code, z.code from troncons t join secteurs s on s.id = t.secteur_id join zones z on z.id = t.zone_id
                      where t.id = (select id from t_ids where cle = 'T8') $$,
  $$ values ('S3', 'Z2') $$, 'affectation : secteur et zone du tronçon');
select results_eq($$ select st_geometrytype(s.geom),
                            st_covers(s.geom, st_lineinterpolatepoint(t7.geom, 0.5))
                            and st_covers(s.geom, st_lineinterpolatepoint(t8.geom, 0.5))
                            and st_covers(s.geom, st_lineinterpolatepoint(t9.geom, 0.5))
                       from secteurs s, troncons t7, troncons t8, troncons t9
                      where s.id = 'aaaaaaaa-3333-0000-0000-000000000003'
                        and t7.id = (select id from t_ids where cle = 'T7')
                        and t8.id = (select id from t_ids where cle = 'T8')
                        and t9.id = (select id from t_ids where cle = 'T9') $$,
  $$ values ('ST_MultiPolygon', true) $$, 'contour de S3 recalculé : MultiPolygon couvrant ses tronçons');
select results_eq($$ select st_geometrytype(z.geom), st_covers(z.geom, s.geom)
                       from zones z, secteurs s
                      where z.id = 'aaaaaaaa-2222-0000-0000-000000000002' and s.id = 'aaaaaaaa-3333-0000-0000-000000000003' $$,
  $$ values ('ST_MultiPolygon', true) $$, 'contour de la zone Z2 : union de ses secteurs');
select is((select secteur_id from noeuds where id = (select id from t_ids where cle = 'N3')),
  'aaaaaaaa-3333-0000-0000-000000000003', 'nœud à l''extrémité de T8 : suit le tronçon');
select ok(exists (select 1 from journal where table_nom = 'secteurs' and ligne_id = 'aaaaaaaa-3333-0000-0000-000000000003'
                    and changements ->> 'action' = 'affectation_troncons' and (changements ->> 'nb_troncons')::int = 2
                    and utilisateur_id = '00000000-0000-0000-0000-00000000000d'),
  'journal : affectation résumée (2 tronçons) au nom du responsable');
select is((select nb_troncons from v_troncons_sans_secteur where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'plus rien à zoner');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ select affecter_troncons_secteur('aaaaaaaa-3333-0000-0000-000000000003', array[(select id from t_ids where cle = 'T1')]) $$,
  '42501', null, 'détection : n''affecte pas de tronçon');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is(affecter_troncons_polygone('aaaaaaaa-3333-0000-0000-000000000001', (select valeur from t_donnees where cle = 'polygone_s2'), 'ajouter'), 2,
  'polygone « ajouter » : T5 et T6 passent dans S1');
select results_eq($$ select (select statut_balayage::text from secteurs where id = 'aaaaaaaa-3333-0000-0000-000000000001'),
                            (select statut_balayage::text from secteurs where id = 'aaaaaaaa-3333-0000-0000-000000000002'),
                            (select geom is null from secteurs where id = 'aaaaaaaa-3333-0000-0000-000000000002') $$,
  $$ values ('en_cours', 'a_balayer', true) $$,
  'changement de secteur : S1 en cours (deux tronçons balayés), S2 vidé → à balayer, sans contour');
select is(affecter_troncons_polygone('aaaaaaaa-3333-0000-0000-000000000001', (select valeur from t_donnees where cle = 'polygone_s2'), 'retirer'), 2,
  'polygone « retirer » : T5 et T6 désaffectés');
select results_eq($$ select (select count(*)::int from troncons where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and secteur_id is null),
                            (select count(*)::int from troncons where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and secteur_id is null and zone_id is null),
                            (select statut_balayage::text from secteurs where id = 'aaaaaaaa-3333-0000-0000-000000000001') $$,
  $$ values (2, 2, 'a_balayer') $$, 'désaffectation : sans secteur ni zone ; S1 à balayer');
select is(affecter_troncons_polygone('aaaaaaaa-3333-0000-0000-000000000002', (select valeur from t_donnees where cle = 'polygone_s2'), 'remplacer'), 2,
  'polygone « remplacer » : S2 = T5 et T6');
select results_eq($$ select statut_balayage::text, geom is not null,
                            (select count(*)::int from troncons where secteur_id = 'aaaaaaaa-3333-0000-0000-000000000002')
                       from secteurs where id = 'aaaaaaaa-3333-0000-0000-000000000002' $$,
  $$ values ('balayee', true, 2) $$, 'S2 recomposé : balayé, contour recalculé');
select throws_ok($$ select affecter_troncons_polygone('aaaaaaaa-3333-0000-0000-000000000002',
  '{"type": "Polygon", "coordinates": [[[0, 0], [1, 1]]]}'::jsonb, 'ajouter') $$,
  '22023', null, 'polygone invalide refusé');
select throws_ok($$ select affecter_troncons_polygone('aaaaaaaa-3333-0000-0000-000000000002',
  '{"type": "Point", "coordinates": [-1.91, 34.68]}'::jsonb, 'ajouter') $$,
  '22023', null, 'géométrie autre qu''un polygone refusée');
select throws_ok($$ select affecter_troncons_polygone('aaaaaaaa-3333-0000-0000-000000000002',
  (select valeur from t_donnees where cle = 'polygone_s2'), 'fusionner') $$,
  '22023', null, 'mode inconnu refusé');
select lives_ok($$ select definir_contour_secteur('aaaaaaaa-3333-0000-0000-000000000001', (select valeur from t_donnees where cle = 'polygone_s1')) $$,
  'responsable : dessine le contour de S1 à la main');
select results_eq($$ select st_geometrytype(s.geom),
                            st_equals(s.geom, st_setsrid(st_geomfromgeojson((select valeur from t_donnees where cle = 'polygone_s1')::text), 4326)),
                            (select count(*)::int from troncons where secteur_id = s.id)
                       from secteurs s where s.id = 'aaaaaaaa-3333-0000-0000-000000000001' $$,
  $$ values ('ST_MultiPolygon', true, 4) $$, 'contour dessiné : MultiPolygon forcé, tronçons inchangés');
select lives_ok($$ select recalculer_contour_secteur('aaaaaaaa-3333-0000-0000-000000000001') $$,
  'responsable : recalcule le contour de S1');
select ok((select not st_equals(s.geom, st_setsrid(st_geomfromgeojson((select valeur from t_donnees where cle = 'polygone_s1')::text), 4326))
                  and st_covers(s.geom, st_lineinterpolatepoint(t.geom, 0.5))
             from secteurs s, troncons t
            where s.id = 'aaaaaaaa-3333-0000-0000-000000000001' and t.id = (select id from t_ids where cle = 'T1')),
  'contour recalculé depuis les tronçons (différent du dessin, couvre T1)');
select ok((select st_covers(z.geom, s1.geom) and st_covers(z.geom, s2.geom)
             from zones z, secteurs s1, secteurs s2
            where z.id = 'aaaaaaaa-2222-0000-0000-000000000001'
              and s1.id = 'aaaaaaaa-3333-0000-0000-000000000001' and s2.id = 'aaaaaaaa-3333-0000-0000-000000000002'),
  'contour de la zone Z1 : couvre S1 et S2');

-- Désactivation d'un tronçon : statut du secteur recalculé ; pas de balayage dessus
select lives_ok($$ insert into balayages (id, marche_id, troncon_id) values
  ('aaaaaaaa-8888-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', (select id from t_ids where cle = 'T7')),
  ('aaaaaaaa-8888-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', (select id from t_ids where cle = 'T8')) $$,
  'responsable : balaie T7 et T8');
select is((select statut_balayage::text from secteurs where id = 'aaaaaaaa-3333-0000-0000-000000000003'), 'en_cours',
  'S3 : deux tronçons sur trois balayés → en cours');
select lives_ok($$ update troncons set actif = false where id = (select id from t_ids where cle = 'T9') $$,
  'responsable : désactive T9');
select is((select statut_balayage::text from secteurs where id = 'aaaaaaaa-3333-0000-0000-000000000003'), 'balayee',
  'S3 : tronçon désactivé → tous les tronçons actifs balayés → balayée');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ insert into balayages (marche_id, troncon_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', (select id from t_ids where cle = 'T9')) $$,
  '23514', 'Tronçon désactivé : balayage impossible', 'pas de balayage sur un tronçon désactivé');
reset role;

-- -----------------------------------------------------------------------------
-- 7. Vues : linéaires, rapport journalier
-- -----------------------------------------------------------------------------
insert into fuites (id, marche_id, zone_id, secteur_id, date_detection) values
  ('aaaaaaaa-9999-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000002', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select results_eq($$ select nb_troncons, nb_balayes, pct_balaye, nb_noeuds, lineaire_contrat_m, lineaire_m between 201 and 204,
                            lineaire_balaye_m = lineaire_m
                       from v_lineaire_secteurs where secteur_id = 'aaaaaaaa-3333-0000-0000-000000000002' $$,
  $$ values (2, 2, 100.0::numeric(5,1), 1, 250.00::numeric(12,2), true, true) $$,
  'v_lineaire_secteurs S2 : 2 tronçons balayés à 100 %, 1 nœud, linéaire du contrat');
select results_eq($$ select nb_troncons, nb_balayes, pct_balaye, nb_noeuds, modifie_le is not null
                       from v_lineaire_secteurs where secteur_id = 'aaaaaaaa-3333-0000-0000-000000000001' $$,
  $$ values (4, 0, 0.0::numeric(5,1), 1, true) $$,
  'v_lineaire_secteurs S1 : 4 tronçons, rien de balayé, date de modification');
select results_eq($$ select nb_secteurs, nb_troncons, pct_balaye between 25 and 35, lineaire_contrat_m
                       from v_lineaire_zones where zone_id = 'aaaaaaaa-2222-0000-0000-000000000001' $$,
  $$ values (2, 6, true, 1000.00::numeric(12,2)) $$,
  'v_lineaire_zones Z1 : 2 secteurs, 6 tronçons, ≈ 29 % balayés');
select results_eq($$ select agent, zone, secteur, nb_troncons, lineaire_m between 201 and 204, lineaire_repasse_m, nb_noeuds, nb_fuites
                       from v_balayage_journalier
                      where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'
                        and agent_id = '00000000-0000-0000-0000-00000000000d'
                        and secteur_id = 'aaaaaaaa-3333-0000-0000-000000000002' $$,
  $$ values ('Responsable A', 'Zone 1', 'Secteur 2', 2, true, 0.00::numeric(12,2), 1, 1) $$,
  'v_balayage_journalier : premiers passages du responsable, nœud d''extrémité, fuite du jour');
select results_eq($$ select nb_troncons, lineaire_m, lineaire_repasse_m between 90 and 93, nb_noeuds, nb_fuites
                       from v_balayage_journalier
                      where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'
                        and agent_id = '00000000-0000-0000-0000-00000000000b' $$,
  $$ values (0, 0.00::numeric(12,2), true, 1, 1) $$,
  'v_balayage_journalier : repassage de l''agent compté à part (aucun tronçon en premier passage)');
select is((select count(*)::int from v_balayage_journalier where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 3,
  'v_balayage_journalier : une ligne par jour, équipe, agent, zone et secteur');
reset role;

-- -----------------------------------------------------------------------------
-- 8. Marché désactivé : lecture seule, sauf pour l'administrateur
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ update marches set actif = false where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'admin : désactive le marché A');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ insert into balayages (marche_id, troncon_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', (select id from t_ids where cle = 'T2')) $$,
  '42501', null, 'marché désactivé : balayage refusé à l''agent');
select is((select count(*)::int from troncons), 9, 'marché désactivé : l''agent lit toujours le réseau');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select affecter_troncons_secteur('aaaaaaaa-3333-0000-0000-000000000003', array[(select id from t_ids where cle = 'T2')]) $$,
  '42501', null, 'marché désactivé : zonage refusé au responsable');
select results_eq($$ with u as (update troncons set calque = 'x' where id = (select id from t_ids where cle = 'T2') returning 1)
                     select count(*)::int from u $$,
  $$ values (0) $$, 'marché désactivé : tronçons en lecture seule pour le responsable');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ insert into balayages (id, marche_id, troncon_id) values
  ('aaaaaaaa-8888-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001', (select id from t_ids where cle = 'T2')) $$,
  'marché désactivé : l''administrateur garde la main');
select lives_ok($$ update marches set actif = true where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'admin : réactive le marché A');

-- -----------------------------------------------------------------------------
-- 9. Copie d'un marché : les tronçons ne sont pas copiés
-- -----------------------------------------------------------------------------
select lives_ok($$ insert into t_ids values ('copie',
  copier_marche('aaaaaaaa-0000-0000-0000-000000000001', 'COPIE-A', '9', 'Copie du marché A')) $$,
  'admin : copie le marché A');
reset role;
select results_eq($$ select (select count(*)::int from troncons where marche_id = t.id),
                            (select count(*)::int from noeuds where marche_id = t.id),
                            (select count(*)::int from balayages where marche_id = t.id),
                            (select count(*)::int from secteurs where marche_id = t.id and statut_balayage = 'a_balayer')
                       from t_ids t where t.cle = 'copie' $$,
  $$ values (0, 0, 0, 3) $$, 'copie : secteurs repris à balayer, ni tronçons, ni nœuds, ni balayages');

select * from finish();
rollback;
