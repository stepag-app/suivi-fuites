-- =============================================================================
-- Suivi GPS, compromis du 2026-10-10 : heures de travail par marché, pauses sans lieu, état de la tablette,
-- alerte « suivi coupé » au responsable ; droits (responsable et administrateur) et isolation entre marchés.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(96);

-- a admin, b agent détection, c agent réparation (même marché), d responsable, e responsable de l'autre marché,
-- f agent de l'autre marché
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local', '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'det@test.local',   '{"identifiant": "det", "nom_complet": "Détection"}'),
  ('00000000-0000-0000-0000-00000000000c', 'rep@test.local',   '{"identifiant": "rep", "nom_complet": "Réparation"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp@test.local',  '{"identifiant": "resp", "nom_complet": "Responsable"}'),
  ('00000000-0000-0000-0000-00000000000e', 'respo@test.local', '{"identifiant": "respo", "nom_complet": "Responsable O"}'),
  ('00000000-0000-0000-0000-00000000000f', 'autre@test.local', '{"identifiant": "autre", "nom_complet": "Autre"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-G', '1', 'Marché G', 'Client G'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-O', '2', 'Marché O', 'Client O');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'bbbbbbbb-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000f', 'bbbbbbbb-0000-0000-0000-000000000001', 'detection');
update affectations set roles = array['responsable'] where profil_id in
  ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000e');
update affectations set roles = array['detection'] where profil_id in
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000f');

-- Hier à Oujda (j1), et quelques instants de ce jour-là.
create temp table h on commit drop as
  select x.j1,
         extract(epoch from (x.j1 + time '07:30') at time zone 'Africa/Casablanca')::bigint as t0730,
         extract(epoch from (x.j1 + time '10:00') at time zone 'Africa/Casablanca')::bigint as t1000,
         extract(epoch from (x.j1 + time '12:00') at time zone 'Africa/Casablanca')::bigint as t1200,
         extract(epoch from (x.j1 + time '18:30') at time zone 'Africa/Casablanca')::bigint as t1830,
         (x.j1 + time '12:00') at time zone 'Africa/Casablanca' as midi
    from (select (now() at time zone 'Africa/Casablanca')::date - 1 as j1) x;
grant select on h to authenticated;
create temp table jwt (cle text primary key, claims text) on commit drop;
insert into jwt values
  ('a', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}'),
  ('b', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}'),
  ('c', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}'),
  ('d', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}'),
  ('e', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}'),
  ('f', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}');
grant select on jwt to authenticated;

-- 1. Privilèges et RLS
select ok((select relrowsecurity from pg_class where oid = 'public.pauses_gps'::regclass)
      and (select relrowsecurity from pg_class where oid = 'public.suivi_gps_etats'::regclass), 'RLS activée sur les pauses et les états');
select ok(not has_table_privilege('authenticated', 'public.pauses_gps', 'insert')
      and not has_table_privilege('authenticated', 'public.pauses_gps', 'update')
      and not has_table_privilege('authenticated', 'public.suivi_gps_etats', 'insert')
      and not has_table_privilege('authenticated', 'public.suivi_gps_etats', 'update'), 'aucune écriture directe (fonctions seulement)');
select ok(not has_table_privilege('anon', 'public.pauses_gps', 'select')
      and not has_table_privilege('anon', 'public.suivi_gps_etats', 'select'), 'anon : aucun accès');
select ok(not has_function_privilege('anon', 'public.enregistrer_pause_gps(uuid, timestamptz, timestamptz, text)', 'execute')
      and not has_function_privilege('anon', 'public.signaler_suivi_gps(uuid, text, integer)', 'execute')
      and not has_function_privilege('anon', 'public.regler_suivi_gps(uuid, time, time, smallint[], integer, integer)', 'execute'),
  'anon ne peut ni signaler, ni mettre en pause, ni régler');
select ok(not has_function_privilege('authenticated', 'public.generer_alertes_suivi_gps(timestamptz)', 'execute'),
  'les alertes ne se déclenchent que côté serveur');

-- 2. Réglages par défaut et réglage par le responsable
select is((select array[suivi_gps_debut::text, suivi_gps_fin::text] from marches where code = 'TEST-G'), array['08:00:00', '18:00:00'],
  'heures par défaut : 08:00 à 18:00');
select is((select suivi_gps_jours from marches where code = 'TEST-G'), '{1,2,3,4,5,6}'::smallint[], 'du lundi au samedi');
select is((select array[suivi_gps_pause_min, suivi_gps_pause_jour_min] from marches where code = 'TEST-G'), '{60,90}'::smallint[],
  'pause de 60 min, 90 min par jour');

set local role authenticated;
select set_config('request.jwt.claims', (select claims from jwt where cle = 'b'), true);
select throws_ok($$ select regler_suivi_gps('aaaaaaaa-0000-0000-0000-000000000001', '07:00', '17:00', '{1,2,3,4,5}', 45, 60) $$,
  '42501', null, 'un agent ne règle pas les heures');
select set_config('request.jwt.claims', (select claims from jwt where cle = 'e'), true);
select throws_ok($$ select regler_suivi_gps('aaaaaaaa-0000-0000-0000-000000000001', '07:00', '17:00', '{1,2,3,4,5}', 45, 60) $$,
  '42501', null, 'le responsable d''un autre marché non plus');
select set_config('request.jwt.claims', (select claims from jwt where cle = 'd'), true);
select lives_ok($$ select regler_suivi_gps('aaaaaaaa-0000-0000-0000-000000000001', '07:00', '17:00', '{5,1,2,3,4,1}', 45, 60) $$,
  'le responsable du marché règle les heures');
select is((select array[suivi_gps_debut::text, suivi_gps_fin::text] from marches where code = 'TEST-G'), array['07:00:00', '17:00:00'],
  'heures enregistrées');
select is((select suivi_gps_jours from marches where code = 'TEST-G'), '{1,2,3,4,5}'::smallint[], 'jours triés, sans doublon');
select throws_ok($$ select regler_suivi_gps('aaaaaaaa-0000-0000-0000-000000000001', '17:00', '07:00', '{1}', 45, 60) $$,
  '23514', null, 'fin avant le début : refusé');
select throws_ok($$ select regler_suivi_gps('aaaaaaaa-0000-0000-0000-000000000001', '07:00', '17:00', '{}', 45, 60) $$,
  '23514', null, 'aucun jour : refusé');
select throws_ok($$ select regler_suivi_gps('aaaaaaaa-0000-0000-0000-000000000001', '07:00', '17:00', '{1,8}', 45, 60) $$,
  '23514', null, 'jour inconnu : refusé');
select throws_ok($$ select regler_suivi_gps('aaaaaaaa-0000-0000-0000-000000000001', '07:00', '17:00', '{1}', 2, 60) $$,
  '23514', null, 'pause de moins de 5 min : refusée');
select set_config('request.jwt.claims', (select claims from jwt where cle = 'a'), true);
select throws_ok($$ update marches set suivi_gps_debut = '06:00' where code = 'TEST-G' $$, '42501', null,
  'modification directe refusée, même pour l''administrateur (Paramètres › Marché seulement)');
select lives_ok($$ select regler_suivi_gps('bbbbbbbb-0000-0000-0000-000000000001', '08:00', '18:00', '{1,2,3,4,5,6}', 60, 90) $$,
  'l''administrateur règle n''importe quel marché');
select lives_ok($$ update marches set intitule = 'Marché G bis' where code = 'TEST-G' $$, 'le reste de la fiche se modifie comme avant');
reset role;
select ok(exists (select 1 from journal where table_nom = 'marches' and changements ? 'suivi_gps_debut'
                     and utilisateur_id = '00000000-0000-0000-0000-00000000000d'), 'réglage journalisé au nom du responsable');
-- Retour aux valeurs par défaut, tous les jours (le jour d'hier n'importe pas pour la suite).
update marches set suivi_gps_debut = '08:00', suivi_gps_fin = '18:00', suivi_gps_jours = '{1,2,3,4,5,6,7}',
                   suivi_gps_pause_min = 60, suivi_gps_pause_jour_min = 90;

-- 3. Heures de travail (heure d'Oujda)
select ok(not private.heure_de_travail(timestamp '2026-10-12 07:59' at time zone 'Africa/Casablanca', '08:00', '18:00', '{1,2,3,4,5,6}'),
  'lundi 07:59 : hors des heures');
select ok(private.heure_de_travail(timestamp '2026-10-12 08:00' at time zone 'Africa/Casablanca', '08:00', '18:00', '{1,2,3,4,5,6}'),
  'lundi 08:00 : dans les heures');
select ok(private.heure_de_travail(timestamp '2026-10-12 17:59' at time zone 'Africa/Casablanca', '08:00', '18:00', '{1,2,3,4,5,6}'),
  'lundi 17:59 : dans les heures');
select ok(not private.heure_de_travail(timestamp '2026-10-12 18:00' at time zone 'Africa/Casablanca', '08:00', '18:00', '{1,2,3,4,5,6}'),
  'lundi 18:00 : fin exclue');
select ok(not private.heure_de_travail(timestamp '2026-10-11 10:00' at time zone 'Africa/Casablanca', '08:00', '18:00', '{1,2,3,4,5,6}'),
  'dimanche : hors des jours de travail');
select ok(private.heure_de_travail(timestamp '2026-10-11 23:59' at time zone 'Africa/Casablanca', '00:00', '24:00', '{7}'),
  'fin à 24:00 : toute la journée');

-- 4. Points : rien de gardé hors des heures ni hors des jours
set local role authenticated;
select set_config('request.jwt.claims', (select claims from jwt where cle = 'b'), true);
select is(ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array((select t0730 from h), -1.9100, 34.6800),
    jsonb_build_array((select t1000 from h), -1.9101, 34.6801),
    jsonb_build_array((select t1000 from h) + 30, -1.9103, 34.6804),
    jsonb_build_array((select t1830 from h), -1.9200, 34.6900))),
  '{"recus": 4, "ajoutes": 2, "ignores": 2}'::jsonb, '07:30 et 18:30 ignorés, 10:00 gardés');
reset role;
select is((select nb_points from traces_gps where profil_id = '00000000-0000-0000-0000-00000000000b'), 2, 'deux points dans le tracé');
update marches set suivi_gps_jours = array(select d::smallint from generate_series(1, 7) d
                                             where d <> extract(isodow from (select j1 from h))::integer)
 where code = 'TEST-G';
set local role authenticated;
select set_config('request.jwt.claims', (select claims from jwt where cle = 'b'), true);
select is((ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array((select t1000 from h) + 90, -1.9105, 34.6807)))) ->> 'ajoutes', '0', 'jour hors des jours de travail : ignoré');
reset role;
update marches set suivi_gps_jours = '{1,2,3,4,5,6,7}' where code = 'TEST-G';

-- Nettoyage (fin de la migration) : un tracé reçu avant le compromis perd ses points hors des heures.
insert into traces_gps (marche_id, profil_id, jour, trace, nb_points, debut, fin)
select 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', h.j1,
       st_setsrid(st_makeline(array[st_makepointm(-1.91, 34.68, h.t0730), st_makepointm(-1.911, 34.681, h.t1000),
                                    st_makepointm(-1.912, 34.682, h.t1830)]), 4326),
       3, to_timestamp(h.t0730), to_timestamp(h.t1830)
  from h;
select is(private.nettoyer_trace('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', (select j1 from h)), 2,
  'nettoyage : deux points hors des heures retirés');
select is((select array[nb_points, extract(epoch from debut)::bigint] from traces_gps where profil_id = '00000000-0000-0000-0000-00000000000c'),
  array[1::bigint, (select t1000 from h)], 'reste le point de 10:00 (début recalculé)');
update marches set suivi_gps_debut = '11:00' where code = 'TEST-G';
select is(private.nettoyer_trace('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', (select j1 from h)), 1,
  'tous les points hors des heures : le dernier part aussi');
select is((select count(*)::int from traces_gps where profil_id = '00000000-0000-0000-0000-00000000000c'), 0, 'tracé vide effacé');
update marches set suivi_gps_debut = '08:00' where code = 'TEST-G';

-- 5. Pauses
set local role authenticated;
select set_config('request.jwt.claims', (select claims from jwt where cle = 'b'), true);
select is((enregistrer_pause_gps('aaaaaaaa-0000-0000-0000-000000000001', (select midi from h)) ->> 'fin_prevue')::timestamptz,
  (select midi from h) + interval '60 minutes', 'pause commencée : reprise prévue 60 min plus tard');
select is(ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array((select t1200 from h) - 60, -1.9110, 34.6810),
    jsonb_build_array((select t1200 from h) + 600, -1.9500, 34.7000),
    jsonb_build_array((select t1200 from h) + 3540, -1.9501, 34.7001))),
  '{"recus": 3, "ajoutes": 1, "ignores": 2}'::jsonb, 'aucun point gardé pendant la pause (celui d''avant, oui)');
select is((enregistrer_pause_gps('aaaaaaaa-0000-0000-0000-000000000001', (select midi from h),
    (select midi from h) + interval '25 minutes', 'fuite') ->> 'fin')::timestamptz,
  (select midi from h) + interval '25 minutes', 'fin de la pause (fuite signalée) : 25 min');
select is((enregistrer_pause_gps('aaaaaaaa-0000-0000-0000-000000000001', (select midi from h), null, null) ->> 'fin')::timestamptz,
  (select midi from h) + interval '25 minutes', 'renvoi du début : la pause finie ne se rouvre pas');
reset role;
select is((select motif_fin from pauses_gps where debut = (select midi from h)), 'fuite', 'motif de fin gardé');
set local role authenticated;
select is((ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array((select t1200 from h) + 1800, -1.9502, 34.7002)))) ->> 'ajoutes', '1', 'après la fin réelle de la pause, les points comptent');
-- Deuxième pause (13:00) : il reste 65 min sur 90, bornée à 60 ; troisième (14:30) : 5 min ; quatrième (15:00) : rien.
select is((enregistrer_pause_gps('aaaaaaaa-0000-0000-0000-000000000001', (select midi from h) + interval '1 hour',
    (select midi from h) + interval '3 hours', 'automatique') ->> 'fin')::timestamptz,
  (select midi from h) + interval '2 hours', 'fin envoyée au-delà de la reprise prévue : bornée à 60 min');
select is((enregistrer_pause_gps('aaaaaaaa-0000-0000-0000-000000000001', (select midi from h) + interval '2 hours 30 minutes') ->> 'fin_prevue')::timestamptz,
  (select midi from h) + interval '2 hours 35 minutes', 'troisième pause : il ne reste que 5 min sur 90');
select is((enregistrer_pause_gps('aaaaaaaa-0000-0000-0000-000000000001', (select midi from h) + interval '3 hours') ->> 'fin_prevue')::timestamptz,
  (select midi from h) + interval '3 hours', 'plus rien à prendre : pause de durée nulle');
select throws_ok($$ select enregistrer_pause_gps('aaaaaaaa-0000-0000-0000-000000000001', now() + interval '1 hour') $$,
  '22023', null, 'début dans le futur : refusé');
select throws_ok($$ select enregistrer_pause_gps('aaaaaaaa-0000-0000-0000-000000000001', now() - interval '1 hour', now() - interval '2 hours') $$,
  '22023', null, 'fin avant le début : refusée');
select throws_ok($$ select enregistrer_pause_gps('aaaaaaaa-0000-0000-0000-000000000001', now() - interval '1 hour', now(), 'sieste') $$,
  '22023', null, 'motif inconnu : refusé');
select throws_ok($$ select enregistrer_pause_gps('bbbbbbbb-0000-0000-0000-000000000001', now() - interval '1 hour') $$,
  '42501', null, 'pas de pause dans un marché sans affectation');
reset role;
-- Points reçus avant la pause (ordre d'envoi, horloge) : retirés quand la pause arrive.
set local role authenticated;
select set_config('request.jwt.claims', (select claims from jwt where cle = 'c'), true);
select is((ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array((select t1000 from h), -1.92, 34.69),
    jsonb_build_array((select t1000 from h) + 300, -1.921, 34.691),
    jsonb_build_array((select t1000 from h) + 600, -1.922, 34.692)))) ->> 'ajoutes', '3', 'agent c : trois points');
select lives_ok($$ select enregistrer_pause_gps('aaaaaaaa-0000-0000-0000-000000000001',
    to_timestamp((select t1000 from h) + 200), to_timestamp((select t1000 from h) + 400), 'agent') $$, 'pause reçue après les points');
reset role;
select is((select nb_points from traces_gps where profil_id = '00000000-0000-0000-0000-00000000000c'), 2,
  'le point pris pendant la pause est retiré du tracé');

-- Lecture des pauses
set local role authenticated;
select set_config('request.jwt.claims', (select claims from jwt where cle = 'b'), true);
select is((select count(*)::int from pauses_gps), 0, 'l''agent ne lit pas les pauses, pas même les siennes');
select set_config('request.jwt.claims', (select claims from jwt where cle = 'd'), true);
select is((select count(*)::int from pauses_gps), 5, 'le responsable lit les pauses de son marché');
select ok((select bool_and(not (to_jsonb(q) ?| array['lon', 'lat', 'position', 'trace'])) from pauses_gps q),
  'une pause n''a aucune position');
select set_config('request.jwt.claims', (select claims from jwt where cle = 'e'), true);
select is((select count(*)::int from pauses_gps), 0, 'le responsable de l''autre marché ne les voit pas');
select set_config('request.jwt.claims', (select claims from jwt where cle = 'a'), true);
select is((select count(*)::int from pauses_gps), 5, 'l''administrateur les voit');
reset role;

-- 6. État signalé par la tablette
set local role authenticated;
select set_config('request.jwt.claims', (select claims from jwt where cle = 'b'), true);
select is(signaler_suivi_gps('aaaaaaaa-0000-0000-0000-000000000001', 'actif') ->> 'suivi_gps_pause_jour_min', '90',
  'état signalé ; réglages du marché rendus à la tablette');
select throws_ok($$ select signaler_suivi_gps('aaaaaaaa-0000-0000-0000-000000000001', 'eteint') $$, '22023', null, 'état inconnu : refusé');
select throws_ok($$ select signaler_suivi_gps('bbbbbbbb-0000-0000-0000-000000000001', 'actif') $$, '42501', null,
  'pas d''état dans un marché sans affectation');
select set_config('request.jwt.claims', (select claims from jwt where cle = 'f'), true);
select lives_ok($$ select signaler_suivi_gps('bbbbbbbb-0000-0000-0000-000000000001', 'hors_heures') $$, 'agent de l''autre marché');
reset role;
select ok((select dernier_suivi is not null from suivi_gps_etats where profil_id = '00000000-0000-0000-0000-00000000000b'),
  'état actif : dernier signe du suivi noté');
select ok((select dernier_suivi is null from suivi_gps_etats where profil_id = '00000000-0000-0000-0000-00000000000f'),
  'hors des heures : pas de signe du suivi');
update suivi_gps_etats set dernier_suivi = (select midi from h) - interval '1 day' where profil_id = '00000000-0000-0000-0000-00000000000b';
set local role authenticated;
select set_config('request.jwt.claims', (select claims from jwt where cle = 'b'), true);
select lives_ok($$ select ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_array((select t1200 from h) + 7200 + 3600, -1.96, 34.71))) $$, 'un point reçu');
reset role;
select is((select dernier_suivi from suivi_gps_etats where profil_id = '00000000-0000-0000-0000-00000000000b'),
  to_timestamp((select t1200 from h) + 10800), 'un point reçu fait foi de signe du suivi (son horodatage)');
-- L'heure de la tablette (décalage UTC envoyé avec l'état) fait foi pour les heures de l'agent.
set local role authenticated;
select set_config('request.jwt.claims', (select claims from jwt where cle = 'c'), true);
select lives_ok($$ select signaler_suivi_gps('aaaaaaaa-0000-0000-0000-000000000001', 'actif', 120) $$, 'décalage de la tablette noté (+2 h)');
select is((ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_array(
    extract(epoch from ((select j1 from h) + time '06:30') at time zone 'UTC')::bigint, -1.93, 34.70)))) ->> 'ajoutes', '1',
  '06:30 UTC, soit 08:30 à la tablette : gardé');
select lives_ok($$ select signaler_suivi_gps('aaaaaaaa-0000-0000-0000-000000000001', 'actif', 0) $$, 'décalage +0');
select is((ajouter_points_trace('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_array(
    extract(epoch from ((select j1 from h) + time '06:40') at time zone 'UTC')::bigint, -1.931, 34.701)))) ->> 'ajoutes', '0',
  '06:40 à la tablette : ignoré');
reset role;

-- 7. Suivi coupé (instants fixés : hier, heures 08:00 à 18:00, tous les jours ; contexte serveur sans compte)
select set_config('request.jwt.claims', '', true);
update suivi_gps_etats set etat = 'actif', dernier_signe = (select midi from h) + interval '3 hours',
       dernier_suivi = (select midi from h) + interval '3 hours', alerte_le = null
 where profil_id = '00000000-0000-0000-0000-00000000000b';
select is(private.suivi_gps_coupe_depuis('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
    (select midi from h) + interval '3 hours 20 minutes'), null, 'signe il y a 20 min : pas coupé');
select is(private.suivi_gps_coupe_depuis('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
    (select midi from h) + interval '3 hours 45 minutes'), (select midi from h) + interval '3 hours', 'aucun signe depuis 45 min : coupé');
select is(private.suivi_gps_coupe_depuis('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
    (select midi from h) + interval '6 hours 45 minutes'), null, '18:45 : hors des heures, pas d''alerte');
select is(private.suivi_gps_coupe_depuis('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
    (select midi from h) + interval '2 hours 33 minutes'), null, 'pendant une pause : pas d''alerte');
update suivi_gps_etats set dernier_suivi = (select midi from h) where profil_id = '00000000-0000-0000-0000-00000000000b';
select is(private.suivi_gps_coupe_depuis('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
    (select midi from h) + interval '3 hours 40 minutes'), (select midi from h) + interval '3 hours',
  'après la dernière pause : compté depuis sa fin');
update suivi_gps_etats set dernier_suivi = (select midi from h) + interval '3 hours' where profil_id = '00000000-0000-0000-0000-00000000000b';
select is(private.suivi_gps_coupe_depuis('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
    (select midi from h) + interval '20 hours 20 minutes'), null, 'lendemain 08:20 : pas encore 30 min depuis le début des heures');
select is(private.suivi_gps_coupe_depuis('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
    (select midi from h) + interval '20 hours 40 minutes'), (select midi from h) + interval '20 hours',
  'lendemain 08:40, session toujours ouverte : coupé depuis 08:00');
select is(private.suivi_gps_coupe_depuis('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
    (select midi from h) + interval '4 days'), null, 'tablette muette depuis plus de 3 jours : plus d''alerte');

-- Agent f (autre marché) : session ouverte, aucun suivi de la journée : alerte aussi, à son responsable.
select is(generer_alertes_suivi_gps((select midi from h) + interval '3 hours 45 minutes'), 4,
  'alertes « suivi coupé » : deux agents, chacun à son responsable et à l''administrateur');
select is((select array_agg(p.identifiant order by p.identifiant) from notifications n join profils p on p.id = n.destinataire_id
            where n.evenement = 'suivi_coupe' and n.donnees ->> 'profil_id' = '00000000-0000-0000-0000-00000000000b'),
  array['issam', 'resp'], 'jamais l''agent lui-même ni un autre agent');
select is((select array_agg(p.identifiant order by p.identifiant) from notifications n join profils p on p.id = n.destinataire_id
            where n.evenement = 'suivi_coupe' and n.donnees ->> 'profil_id' = '00000000-0000-0000-0000-00000000000f'),
  array['issam', 'respo'], 'l''alerte de l''autre marché va à son responsable seulement (et à l''administrateur)');
select is((select array[n.titre, n.corps] from notifications n
            where n.evenement = 'suivi_coupe' and n.donnees ->> 'profil_id' = '00000000-0000-0000-0000-00000000000b' limit 1),
  array['Suivi GPS interrompu : Détection',
        format('Aucune position depuis %s : application fermée, autorisation retirée, tablette éteinte ou sans réseau.',
               to_char(((select midi from h) + interval '3 hours') at time zone 'Africa/Casablanca', 'HH24:MI'))],
  'titre et texte de l''alerte (heure d''Oujda)');
select ok((select bool_and(fuite_id is null) from notifications where evenement = 'suivi_coupe'), 'alerte sans fuite');
select is(generer_alertes_suivi_gps((select midi from h) + interval '3 hours 50 minutes'), 0, 'une seule alerte par interruption');
update suivi_gps_etats set dernier_suivi = (select midi from h) + interval '4 hours 30 minutes', etat = 'autorisation'
 where profil_id = '00000000-0000-0000-0000-00000000000b';
select is(generer_alertes_suivi_gps((select midi from h) + interval '4 hours 40 minutes'), 0, 'suivi revenu : pas d''alerte');
select is(generer_alertes_suivi_gps((select midi from h) + interval '5 hours 50 minutes'), 2, 'nouvelle interruption : nouvelle alerte');
select ok((select corps from notifications where evenement = 'suivi_coupe' order by id desc limit 1) like 'Autorisation de position refusée%',
  'autorisation refusée : dite dans l''alerte');
update suivi_gps_etats set etat = 'ferme' where profil_id = '00000000-0000-0000-0000-00000000000b';
select is(private.suivi_gps_coupe_depuis('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
    (select midi from h) + interval '23 hours'), null, '« Quitter » : session fermée, pas d''alerte');
select throws_ok($$ insert into notifications (destinataire_id, marche_id, evenement, titre)
    values ('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'fuite_detectee', 'x') $$,
  '23514', null, 'les autres notifications gardent leur fuite');
select ok((select jsonb_array_length(prendre_notifications_push()) >= 2), 'les alertes partent en push (fuite absente acceptée)');

-- Lecture de l'état (vue du panneau)
update suivi_gps_etats set etat = 'actif' where profil_id = '00000000-0000-0000-0000-00000000000b';
set local role authenticated;
select set_config('request.jwt.claims', (select claims from jwt where cle = 'b'), true);
select is((select count(*)::int from v_suivi_gps_etats), 0, 'l''agent ne lit aucun état');
select is(private.suivi_gps_coupe_depuis('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
    (select midi from h) + interval '3 hours 45 minutes'), null, 'ni par la fonction');
select set_config('request.jwt.claims', (select claims from jwt where cle = 'd'), true);
select is((select array_agg(identifiant order by identifiant) from v_suivi_gps_etats), array['det', 'rep'], 'le responsable lit les états de son marché');
select set_config('request.jwt.claims', (select claims from jwt where cle = 'e'), true);
select is((select array_agg(identifiant) from v_suivi_gps_etats), array['autre'], 'le responsable de l''autre marché, le sien seulement');
select set_config('request.jwt.claims', (select claims from jwt where cle = 'a'), true);
select is((select count(*)::int from v_suivi_gps_etats), 3, 'l''administrateur lit tout');
reset role;

-- 8. Comptes et fin du marché
select is((compte_supprimable('00000000-0000-0000-0000-00000000000f') ->> 'supprimable')::boolean, true,
  'un compte qui n''a qu''un état du suivi reste supprimable');
update marches set actif = false where code = 'TEST-G';
set local role authenticated;
select set_config('request.jwt.claims', (select claims from jwt where cle = 'a'), true);
select lives_ok($$ select purger_traces_marche('aaaaaaaa-0000-0000-0000-000000000001') $$, 'fin du marché : purge');
reset role;
select is((select count(*)::int from pauses_gps where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001')
        + (select count(*)::int from suivi_gps_etats where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'pauses et états effacés avec les tracés');
select is((select count(*)::int from suivi_gps_etats where marche_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 1,
  'l''autre marché est intact');

select * from finish();
rollback;
