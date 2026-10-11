-- =============================================================================
-- Heure du Maroc explicite (migration 20261014900000) : UTC+0 depuis le 2026-09-20 01:00 UTC, Africa/Casablanca
-- avant, quelle que soit la base des fuseaux du serveur (celle de Supabase croit encore UTC+1) ; le fuseau n'est
-- écrit nulle part ailleurs dans la base.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

-- 1. Règle
select is(private.heure_maroc('2026-10-14 23:30+00'), '2026-10-14 23:30'::timestamp, 'octobre 2026 : UTC+0');
select is(private.jour_maroc('2026-10-14 23:30+00'), '2026-10-14'::date, 'octobre 2026 : 23 h 30 UTC reste le même jour');
select is(private.heure_maroc('2026-08-14 23:30+00'), '2026-08-15 00:30'::timestamp, 'août 2026 : UTC+1');
select is(private.jour_maroc('2026-08-14 23:30+00'), '2026-08-15'::date, 'août 2026 : 23 h 30 UTC est déjà le lendemain');
select is(private.heure_maroc('2026-03-01 12:00+00'), '2026-03-01 12:00'::timestamp, 'ramadan 2026 : UTC+0');
select is(private.heure_maroc('2026-09-20 00:59:59+00'), '2026-09-20 01:59:59'::timestamp, 'bascule : UTC+1 jusqu''à 00:59:59 UTC');
select is(private.heure_maroc('2026-09-20 01:00+00'), '2026-09-20 01:00'::timestamp, 'bascule : UTC+0 dès 01:00 UTC');
select is(private.heure_maroc('2027-07-14 12:00+00'), '2027-07-14 12:00'::timestamp, 'été 2027 : UTC+0, pas d''heure d''été');
select is(private.instant_maroc('2026-10-15 00:30'), '2026-10-15 00:30+00'::timestamptz, 'inverse : octobre 2026');
select is(private.instant_maroc('2026-08-15 00:30'), '2026-08-14 23:30+00'::timestamptz, 'inverse : août 2026');
select is(private.heure_maroc(null), null, 'instant absent : null');
select is((select count(*) from generate_series(timestamptz '2026-09-20 01:00+00', '2027-12-31', interval '17 minutes') t
            where private.instant_maroc(private.heure_maroc(t)) <> t), 0::bigint,
  'aller-retour exact depuis la bascule');
select is(private.jour_maroc(now()), (now() at time zone 'UTC')::date, 'aujourd''hui au Maroc : le jour UTC');

-- 2. Le fuseau n'est écrit que dans heure_maroc et instant_maroc
select is_empty($$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname in ('public', 'private') and p.prosrc like '%Africa/Casablanca%'
                      and p.oid not in ('private.heure_maroc(timestamptz)'::regprocedure, 'private.instant_maroc(timestamp)'::regprocedure) $$,
  'fonctions : aucune autre ne porte le fuseau');
select is_empty($$ select c.oid::regclass::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname in ('public', 'private') and c.relkind in ('v', 'm')
                      and pg_get_viewdef(c.oid) like '%Africa/Casablanca%' $$,
  'vues : aucune ne porte le fuseau');
select is_empty($$ select d.adrelid::regclass::text from pg_attrdef d
                    where pg_get_expr(d.adbin, d.adrelid) like '%Africa/Casablanca%' $$,
  'valeurs par défaut et colonnes calculées : aucune ne porte le fuseau');
select is_empty($$ select conname::text from pg_constraint where pg_get_constraintdef(oid) like '%Africa/Casablanca%'
                   union all
                   select indexrelid::regclass::text from pg_index where pg_get_indexdef(indexrelid) like '%Africa/Casablanca%'
                   union all
                   select polname::text from pg_policy
                    where coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), '')
                          like '%Africa/Casablanca%' $$,
  'contraintes, index et règles RLS : aucun ne porte le fuseau');
select is((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
            where d.adrelid = 'public.balayages'::regclass and a.attname = 'date_balayage'),
  'private.jour_maroc(now())', 'balayage : jour du Maroc par défaut');

-- 3. Droits
select ok(has_function_privilege('authenticated', 'private.heure_maroc(timestamptz)', 'execute')
      and has_function_privilege('authenticated', 'private.instant_maroc(timestamp)', 'execute')
      and has_function_privilege('authenticated', 'private.jour_maroc(timestamptz)', 'execute'),
  'authenticated : exécution (vues en security_invoker, valeurs par défaut)');
select ok(not has_function_privilege('anon', 'private.jour_maroc(timestamptz)', 'execute'), 'anon : aucune exécution');

-- 4. Vues : jour de détection et retard de communication au client
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}');
insert into marches (id, code, numero, intitule, client, jalons_client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-A', '1', 'Marché A', 'Client A', true);
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
insert into fuites (id, marche_id, reference_srm, date_detection) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '302-684-001', '2026-10-01 23:30+00'),
  ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '302-684-002', '2026-08-14 23:30+00'),
  ('aaaaaaaa-1111-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '302-684-003', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select results_eq($$ select reference_srm, jour_detection from v_fuites where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'
                     and reference_srm in ('302-684-001', '302-684-002') order by reference_srm $$,
  $$ values ('302-684-001'::text, '2026-10-01'::date), ('302-684-002', '2026-08-15') $$,
  'v_fuites : jour de détection à l''heure du Maroc (octobre UTC+0, août UTC+1), lu par un agent');
select is((select alerte_communication_srm from v_fuites where reference_srm = '302-684-001'), true,
  'v_fuites : non communiquée au client un jour passé, en retard');
select is((select alerte_communication_srm from v_fuites where reference_srm = '302-684-003'), false,
  'v_fuites : détectée aujourd''hui, pas encore en retard');
select ok((select count(*) from v_delai_marche) >= 0, 'v_delai_marche : lisible par un agent');

select * from finish();
rollback;
