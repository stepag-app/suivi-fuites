-- =============================================================================
-- Chantier v2, S11 : suivi GPS (X6) — un tracé par agent et par jour, ajout par lots idempotent,
-- lecture limitée au responsable et à l'administrateur, isolation entre marchés, purge à la fin du marché.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(57);

-- a admin, b agent détection, c agent réparation (même marché), d responsable, e responsable de l'autre marché,
-- f agent de l'autre marché, g agent révoqué
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local', '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'det@test.local',   '{"identifiant": "det", "nom_complet": "Détection"}'),
  ('00000000-0000-0000-0000-00000000000c', 'rep@test.local',   '{"identifiant": "rep", "nom_complet": "Réparation"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp@test.local',  '{"identifiant": "resp", "nom_complet": "Responsable"}'),
  ('00000000-0000-0000-0000-00000000000e', 'respo@test.local', '{"identifiant": "respo", "nom_complet": "Responsable O"}'),
  ('00000000-0000-0000-0000-00000000000f', 'autre@test.local', '{"identifiant": "autre", "nom_complet": "Autre"}'),
  ('00000000-0000-0000-0000-000000000010', 'revo@test.local',  '{"identifiant": "revo", "nom_complet": "Révoqué"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-G', '1', 'Marché G', 'Client G'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-O', '2', 'Marché O', 'Client O');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'bbbbbbbb-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000f', 'bbbbbbbb-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
update affectations set roles = array['responsable'] where profil_id = '00000000-0000-0000-0000-00000000000d';
update affectations set roles = array['responsable'] where profil_id = '00000000-0000-0000-0000-00000000000e';
update affectations set roles = array['detection'] where profil_id in
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000010');
update profils set actif = false where identifiant = 'revo';

-- Horodatages : deux jours d'Oujda, il y a 1 et 2 jours à midi UTC (midi à Oujda, pas de bascule autour).
create temp table h on commit drop as
  select (extract(epoch from date_trunc('day', now()) - interval '1 day' + interval '12 hours'))::bigint as j1,
         (extract(epoch from date_trunc('day', now()) - interval '2 days' + interval '12 hours'))::bigint as j2;
grant select on h to authenticated;

-- 1. Privilèges
select ok(not has_table_privilege('anon', 'public.traces_gps', 'select'), 'anon : aucun accès aux tracés');
select ok(not has_table_privilege('authenticated', 'public.traces_gps', 'insert')
      and not has_table_privilege('authenticated', 'public.traces_gps', 'update')
      and not has_table_privilege('authenticated', 'public.traces_gps', 'delete'), 'un compte connecté ne peut qu''y lire (aucune écriture directe)');
select ok((select relrowsecurity from pg_class where oid = 'public.traces_gps'::regclass), 'RLS activée sur traces_gps');
select ok(not has_function_privilege('anon', 'public.ajouter_points_trace(uuid, jsonb)', 'execute'), 'anon ne peut pas ajouter de points');

-- 2. Ajout de points par un agent
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is(ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array((select j1 from h), -1.9100, 34.6800),
    jsonb_build_array((select j1 from h) + 30, -1.9102, 34.6803),
    jsonb_build_array((select j1 from h) + 60, -1.9104, 34.6806))),
  '{"recus": 3, "ajoutes": 3, "ignores": 0}'::jsonb, 'trois points ajoutés');
reset role;
select is((select count(*)::int from traces_gps), 1, 'un seul tracé');
select is((select nb_points from traces_gps), 3, 'trois points dans le tracé');
select is((select extensions.st_geometrytype(trace) from traces_gps), 'ST_LineString', 'géométrie : LineString');
select is((select extensions.st_ndims(trace)::int from traces_gps), 3, 'avec une mesure M (horodatage)');
select is((select extensions.st_m(extensions.st_endpoint(trace))::bigint - extensions.st_m(extensions.st_startpoint(trace))::bigint from traces_gps),
  60::bigint, 'horodatages de début et de fin conservés');
select ok((select distance_m from traces_gps) between 60 and 80, 'distance calculée en mètres (environ 70 m)');
select is((select jour from traces_gps), (to_timestamp((select j1 from h)) at time zone 'Africa/Casablanca')::date, 'jour d''Oujda');

-- 3. Idempotence : même lot renvoyé, puis lot qui recoupe
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is(ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array((select j1 from h), -1.9100, 34.6800),
    jsonb_build_array((select j1 from h) + 30, -1.9102, 34.6803),
    jsonb_build_array((select j1 from h) + 60, -1.9104, 34.6806))),
  '{"recus": 3, "ajoutes": 0, "ignores": 3}'::jsonb, 'même lot renvoyé : rien d''ajouté');
select is(ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array((select j1 from h) + 60, -1.9104, 34.6806),
    jsonb_build_array((select j1 from h) + 90, -1.9106, 34.6809))),
  '{"recus": 2, "ajoutes": 1, "ignores": 1}'::jsonb, 'lot qui recoupe : seul le nouveau point est ajouté');
-- lot plus ancien arrivé après (ordre d'arrivée inversé)
select is(ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array((select j1 from h) - 120, -1.9096, 34.6794),
    jsonb_build_array((select j1 from h) - 60, -1.9098, 34.6797))),
  '{"recus": 2, "ajoutes": 2, "ignores": 0}'::jsonb, 'lot plus ancien reçu après : inséré à sa place');
reset role;
select is((select count(*)::int from traces_gps), 1, 'toujours un seul tracé pour l''agent et le jour');
select is((select nb_points from traces_gps), 6, 'six points au total');
select is((select extensions.st_m(extensions.st_startpoint(trace))::bigint - (select j1 from h) from traces_gps), -120::bigint,
  'points triés par horodatage (début = le plus ancien)');
select is((select extensions.st_m(extensions.st_endpoint(trace))::bigint - (select j1 from h) from traces_gps), 90::bigint, 'fin = le plus récent');

-- 4. Un tracé par agent et par jour : un autre jour, un autre agent
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array((select j2 from h), -1.9000, 34.6700)))) ->> 'ajoutes', '1', 'un lot d''un seul point est accepté');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array((select j1 from h), -1.9200, 34.6900),
    jsonb_build_array((select j1 from h) + 30, -1.9201, 34.6902)))) ->> 'ajoutes', '2', 'un second agent a son propre tracé');
reset role;
select is((select count(*)::int from traces_gps where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 3, 'trois tracés : agent b deux jours, agent c un jour');
select is((select nb_points from traces_gps where jour = (to_timestamp((select j2 from h)) at time zone 'Africa/Casablanca')::date), 1, 'un tracé d''un point');
select is((select extensions.st_numpoints(trace) from traces_gps where nb_points = 1), 2, 'répété une fois : une ligne a deux sommets au moins');
select throws_ok($$ insert into traces_gps (marche_id, profil_id, jour, trace, nb_points, debut, fin)
    select marche_id, profil_id, jour, trace, 1, debut, fin from traces_gps limit 1 $$,
  '23505', null, 'deux tracés pour le même agent, marché et jour sont refusés');

-- 5. Un lot à cheval sur minuit (heure d'Oujda) donne deux tracés
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array(extract(epoch from (date_trunc('day', now() at time zone 'Africa/Casablanca') - interval '3 days' - interval '1 minute') at time zone 'Africa/Casablanca')::bigint, -1.91, 34.68),
    jsonb_build_array(extract(epoch from (date_trunc('day', now() at time zone 'Africa/Casablanca') - interval '3 days' + interval '1 minute') at time zone 'Africa/Casablanca')::bigint, -1.91, 34.68)))) ->> 'ajoutes',
  '2', 'lot à cheval sur minuit accepté');
reset role;
select is((select count(*)::int from traces_gps where profil_id = '00000000-0000-0000-0000-00000000000c'), 3, 'répartis sur deux jours d''Oujda (un tracé de plus)');

-- 6. Refus
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ select ajouter_points_trace('bbbbbbbb-0000-0000-0000-000000000001', '[]'::jsonb) $$, '42501', null,
  'pas d''ajout dans un marché sans affectation');
select throws_ok($$ select ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', '{"a": 1}'::jsonb) $$, '22023', null,
  'une liste est exigée');
select throws_ok($$ select ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001',
    (select jsonb_agg(jsonb_build_array(1, 0, 0)) from generate_series(1, 1001))) $$, '22023', null, 'plus de 1000 points : refusé');
select is(ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array((select j1 from h) + 500, 200, 34.68),
    jsonb_build_array((select j1 from h) + 501, -1.91, 95),
    jsonb_build_array(extract(epoch from now())::bigint + 7200, -1.91, 34.68),
    jsonb_build_array(extract(epoch from now())::bigint - 9 * 86400, -1.91, 34.68),
    jsonb_build_array('x', -1.91, 34.68),
    jsonb_build_array(1e300, -1.91, 34.68),
    jsonb_build_array(1, 2),
    'texte')),
  '{"recus": 8, "ajoutes": 0, "ignores": 8}'::jsonb, 'points invalides (coordonnées, futur, trop ancien, forme) ignorés');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000010", "role": "authenticated"}', true);
select throws_ok($$ select ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', '[]'::jsonb) $$, '42501', null,
  'un compte révoqué ne peut pas ajouter de points');
reset role;
select throws_ok($$ select ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', '[]'::jsonb) $$, '42501', null,
  'contexte serveur sans compte : refusé');

-- 7. Lecture : responsable et administrateur seulement
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from traces_gps), 0, 'l''agent ne voit aucun tracé, pas même le sien');
select is((select count(*)::int from v_traces_gps), 0, 'ni dans la vue');
select is(trace_gps('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
    (to_timestamp((select j1 from h)) at time zone 'Africa/Casablanca')::date), null, 'ni par trace_gps');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((select count(*)::int from traces_gps), 0, 'un autre agent du même marché ne voit rien non plus');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select count(*)::int from traces_gps), 5, 'le responsable voit les cinq tracés de son marché');
select is((select count(*)::int from v_traces_gps where nom_complet = 'Détection'), 2, 'la vue donne le nom de l''agent');
select is(jsonb_array_length(trace_gps('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
    (to_timestamp((select j1 from h)) at time zone 'Africa/Casablanca')::date) -> 'points'), 6, 'trace_gps : six points');
select is((trace_gps('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
    (to_timestamp((select j1 from h)) at time zone 'Africa/Casablanca')::date) -> 'points' -> 0),
  jsonb_build_array(-1.9096, 34.6794, (select j1 from h) - 120), 'premier point : [lon, lat, t], dans l''ordre du temps');
select is(jsonb_array_length(trace_gps('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
    (to_timestamp((select j2 from h)) at time zone 'Africa/Casablanca')::date) -> 'points'), 1, 'tracé d''un point : un seul point rendu');
select is(trace_gps('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', date '2000-01-01'), null, 'jour sans tracé : null');

-- 8. Isolation entre marchés
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
select is((ajouter_points_trace('bbbbbbbb-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array((select j1 from h), -2.00, 34.70)))) ->> 'ajoutes', '1', 'agent de l''autre marché : tracé dans son marché');
select throws_ok($$ select ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', '[]'::jsonb) $$, '42501', null,
  'et pas dans le premier marché');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select count(*)::int from traces_gps), 5, 'le responsable du premier marché ne voit pas le tracé de l''autre');
select is(trace_gps('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000f',
    (to_timestamp((select j1 from h)) at time zone 'Africa/Casablanca')::date), null, 'ni par trace_gps');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select is((select count(*)::int from traces_gps), 1, 'le responsable de l''autre marché ne voit que le sien');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select count(*)::int from traces_gps), 6, 'l''administrateur voit tous les marchés');

-- 9. Fin du marché : purge
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select purger_traces_marche('aaaaaaaa-0000-0000-0000-000000000001') $$, '42501', null, 'le responsable ne purge pas');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select throws_ok($$ select purger_traces_marche('aaaaaaaa-0000-0000-0000-000000000001') $$, '23514', null, 'marché encore actif : purge refusée');
select throws_ok($$ select purger_traces_marche('cccccccc-0000-0000-0000-000000000001') $$, 'P0002', null, 'marché inconnu : refusé');
select is((compte_supprimable('00000000-0000-0000-0000-00000000000f') ->> 'supprimable')::boolean, true,
  'un compte qui n''a que des tracés reste supprimable');
update marches set actif = false where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is(purger_traces_marche('aaaaaaaa-0000-0000-0000-000000000001'), 5, 'marché désactivé : les cinq tracés sont effacés');
select is((select count(*)::int from traces_gps), 1, 'le tracé de l''autre marché est intact');
select is((select (changements ->> 'points')::int from journal where table_nom = 'traces_gps' order by id desc limit 1), 11,
  'purge journalisée (nombre de points effacés)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ select ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', '[]'::jsonb) $$, '42501', null,
  'plus de points ajoutés à un marché désactivé');
reset role;

select * from finish();
rollback;
