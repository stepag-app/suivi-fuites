-- =============================================================================
-- Tuiles du réseau (X5) : lecture du réseau complet par pages (reseau_geojson_page,
-- noeuds_geojson_page). Pages bornées par référence croissante, zonés et non zonés,
-- inactifs exclus, mêmes propriétés que reseau_geojson / noeuds_geojson, RLS de l'appelant.
-- Tout est annulé à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

-- a = admin, b = détection A, e = détection B
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000004a', 'admin.p@test.local', '{"identifiant": "admin.p", "nom_complet": "Admin P"}'),
  ('00000000-0000-0000-0000-00000000004b', 'agent.pa@test.local', '{"identifiant": "agent.pa", "nom_complet": "Agent PA"}'),
  ('00000000-0000-0000-0000-00000000004e', 'agent.pb@test.local', '{"identifiant": "agent.pb", "nom_complet": "Agent PB"}');
update profils set est_admin = true where identifiant = 'admin.p';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000044', 'PAGE-A', '44', 'Marché A', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000044', 'PAGE-B', '45', 'Marché B', 'Client B');
select appliquer_modele_role('00000000-0000-0000-0000-00000000004b', 'aaaaaaaa-0000-0000-0000-000000000044', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000004e', 'bbbbbbbb-0000-0000-0000-000000000044', 'detection');

-- Un secteur avec contour : R01, R02 et N01 y tombent, les autres restent non zonés.
insert into zones (id, marche_id, numero, code, libelle, lineaire_m) values
  ('aaaaaaaa-2222-0000-0000-000000000044', 'aaaaaaaa-0000-0000-0000-000000000044', 1, 'Z1', 'Zone 1', 1000);
insert into secteurs (id, marche_id, zone_id, code, libelle, lineaire_m, ordre, geom) values
  ('aaaaaaaa-3333-0000-0000-000000000044', 'aaaaaaaa-0000-0000-0000-000000000044', 'aaaaaaaa-2222-0000-0000-000000000044',
   'S1', 'Secteur 1', 400, 1,
   st_multi(st_geomfromtext('POLYGON((-1.9150 34.6800, -1.9100 34.6800, -1.9100 34.6850, -1.9150 34.6850, -1.9150 34.6800))', 4326)));

-- Six tronçons dans A (R04 inactif), un dans B.
insert into troncons (marche_id, reference, geom, actif) values
  ('aaaaaaaa-0000-0000-0000-000000000044', 'R01', st_geomfromtext('LINESTRING(-1.9140 34.6810, -1.9130 34.6810)', 4326), true),
  ('aaaaaaaa-0000-0000-0000-000000000044', 'R02', st_geomfromtext('LINESTRING(-1.9130 34.6810, -1.9120 34.6810)', 4326), true),
  ('aaaaaaaa-0000-0000-0000-000000000044', 'R03', st_geomfromtext('LINESTRING(-1.9200 34.6900, -1.9195 34.6900)', 4326), true),
  ('aaaaaaaa-0000-0000-0000-000000000044', 'R04', st_geomfromtext('LINESTRING(-1.9200 34.6910, -1.9195 34.6910)', 4326), false),
  ('aaaaaaaa-0000-0000-0000-000000000044', 'R05', st_geomfromtext('LINESTRING(-1.9200 34.6920, -1.9195 34.6920)', 4326), true),
  ('aaaaaaaa-0000-0000-0000-000000000044', 'R06', st_geomfromtext('LINESTRING(-1.9200 34.6930, -1.9195 34.6930)', 4326), true),
  ('bbbbbbbb-0000-0000-0000-000000000044', 'RB1', st_geomfromtext('LINESTRING(-1.9000 34.7000, -1.9000 34.7010)', 4326), true);

-- Trois nœuds dans A (N02 inactif), un dans B.
insert into noeuds (marche_id, reference, type, geom, actif) values
  ('aaaaaaaa-0000-0000-0000-000000000044', 'N01', 'vanne', st_geomfromtext('POINT(-1.9140 34.6810)', 4326), true),
  ('aaaaaaaa-0000-0000-0000-000000000044', 'N02', 'jonction', st_geomfromtext('POINT(-1.9200 34.6900)', 4326), false),
  ('aaaaaaaa-0000-0000-0000-000000000044', 'N03', 'jonction', st_geomfromtext('POINT(-1.9200 34.6920)', 4326), true),
  ('bbbbbbbb-0000-0000-0000-000000000044', 'NB1', 'jonction', st_geomfromtext('POINT(-1.9000 34.7000)', 4326), true);

-- -----------------------------------------------------------------------------
-- 0. Privilèges
-- -----------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.reseau_geojson_page(uuid, text, integer, double precision)', 'execute')
          and not has_function_privilege('anon', 'public.noeuds_geojson_page(uuid, text, integer)', 'execute'),
  'anon : n''appelle pas la lecture par pages');
select ok(has_function_privilege('authenticated', 'public.reseau_geojson_page(uuid, text, integer, double precision)', 'execute')
          and has_function_privilege('authenticated', 'public.noeuds_geojson_page(uuid, text, integer)', 'execute'),
  'authenticated : lecture par pages autorisée');

-- -----------------------------------------------------------------------------
-- 1. Tronçons par pages (détection A)
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000004b", "role": "authenticated"}', true);

select results_eq($$ select r ->> 'type', jsonb_array_length(r -> 'features'), r ->> 'suivant'
                      from (select reseau_geojson_page('aaaaaaaa-0000-0000-0000-000000000044', null, 2) r) x $$,
  $$ values ('FeatureCollection', 2, 'R02') $$, 'tronçons : première page pleine (2), suivant = R02');
select results_eq($$ select jsonb_array_length(r -> 'features'), r ->> 'suivant'
                      from (select reseau_geojson_page('aaaaaaaa-0000-0000-0000-000000000044', 'R02', 2) r) x $$,
  $$ values (2, 'R05') $$, 'tronçons : deuxième page R03, R05 (R04 inactif sauté), suivant = R05');
select results_eq($$ select jsonb_array_length(r -> 'features'), r ->> 'suivant'
                      from (select reseau_geojson_page('aaaaaaaa-0000-0000-0000-000000000044', 'R05', 2) r) x $$,
  $$ values (1, null::text) $$, 'tronçons : dernière page incomplète (R06), suivant nul');
select results_eq($$ select (f -> 'properties' ->> 'id')::uuid
                      from jsonb_array_elements(
                             (reseau_geojson_page('aaaaaaaa-0000-0000-0000-000000000044', null, 2) -> 'features')
                          || (reseau_geojson_page('aaaaaaaa-0000-0000-0000-000000000044', 'R02', 2) -> 'features')
                          || (reseau_geojson_page('aaaaaaaa-0000-0000-0000-000000000044', 'R05', 2) -> 'features')) f
                     order by 1 $$,
  $$ select (f -> 'properties' ->> 'id')::uuid
       from jsonb_array_elements(reseau_geojson('aaaaaaaa-0000-0000-0000-000000000044', null, true) -> 'features') f
      order by 1 $$,
  'tronçons : les pages réunies = reseau_geojson avec les non zonés (5 actifs)');
select results_eq($$ select (count(*) filter (where f -> 'properties' ->> 's' is not null))::int,
                            (count(*) filter (where f -> 'properties' ->> 's' is null))::int
                       from jsonb_array_elements(reseau_geojson_page('aaaaaaaa-0000-0000-0000-000000000044') -> 'features') f $$,
  $$ values (2, 3) $$, 'tronçons : zonés (R01, R02) et non zonés (R03, R05, R06) dans la même lecture');
select is((select array_agg(k order by k) from jsonb_object_keys(
             reseau_geojson_page('aaaaaaaa-0000-0000-0000-000000000044') -> 'features' -> 0 -> 'properties') k),
  array['c', 'd', 'id', 'l', 'm', 's', 'z'], 'tronçons : propriétés courtes de reseau_geojson');
select results_eq($$ select jsonb_array_length(reseau_geojson_page('aaaaaaaa-0000-0000-0000-000000000044', null, 0) -> 'features'),
                            jsonb_array_length(reseau_geojson_page('aaaaaaaa-0000-0000-0000-000000000044', null, 100000, 0.0001) -> 'features') $$,
  $$ values (1, 5) $$, 'tronçons : taille bornée (0 → 1), simplification acceptée');

-- -----------------------------------------------------------------------------
-- 2. Nœuds par pages (détection A)
-- -----------------------------------------------------------------------------
select results_eq($$ select jsonb_array_length(a -> 'features'), a ->> 'suivant', jsonb_array_length(b -> 'features'), b ->> 'suivant'
                      from (select noeuds_geojson_page('aaaaaaaa-0000-0000-0000-000000000044', null, 1) a,
                                   noeuds_geojson_page('aaaaaaaa-0000-0000-0000-000000000044', 'N01', 1) b) x $$,
  $$ values (1, 'N01', 1, 'N03') $$, 'nœuds : pages de 1, N02 inactif sauté');
select results_eq($$ select (f -> 'properties' ->> 'id')::uuid
                      from jsonb_array_elements(noeuds_geojson_page('aaaaaaaa-0000-0000-0000-000000000044') -> 'features') f
                     order by 1 $$,
  $$ select (f -> 'properties' ->> 'id')::uuid
       from jsonb_array_elements(noeuds_geojson('aaaaaaaa-0000-0000-0000-000000000044', null, true) -> 'features') f
      order by 1 $$,
  'nœuds : une page = noeuds_geojson avec les non zonés');
select is((select array_agg(k order by k) from jsonb_object_keys(
             noeuds_geojson_page('aaaaaaaa-0000-0000-0000-000000000044') -> 'features' -> 0 -> 'properties') k),
  array['id', 's', 't', 'z'], 'nœuds : propriétés courtes de noeuds_geojson');

-- -----------------------------------------------------------------------------
-- 3. Isolation : détection B ne lit rien du marché A
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000004e", "role": "authenticated"}', true);
select results_eq($$ select jsonb_array_length(reseau_geojson_page('aaaaaaaa-0000-0000-0000-000000000044') -> 'features'),
                            reseau_geojson_page('aaaaaaaa-0000-0000-0000-000000000044') ->> 'suivant',
                            jsonb_array_length(noeuds_geojson_page('aaaaaaaa-0000-0000-0000-000000000044') -> 'features') $$,
  $$ values (0, null::text, 0) $$, 'détection B : aucun tronçon ni nœud du marché A');
select is(jsonb_array_length(reseau_geojson_page('bbbbbbbb-0000-0000-0000-000000000044') -> 'features'), 1,
  'détection B : lit son tronçon');

select * from finish();
rollback;
