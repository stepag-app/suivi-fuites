-- =============================================================================
-- Marché désactivé : lecture seule pour les agents et le responsable,
-- l'administrateur garde la main ; réactivé, tout redevient possible.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}');
update profils set est_admin = true where identifiant = 'issam';
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'de000000-0000-4000-8000-000000000000', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'de000000-0000-4000-8000-000000000000', 'responsable');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select lives_ok($$ insert into fuites (id, marche_id) values
  ('de000000-9999-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000000') $$,
  'marché actif : l''agent de détection signale une fuite');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ update marches set actif = false where id = 'de000000-0000-4000-8000-000000000000' $$,
  'admin : désactive le marché DEMO');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ insert into fuites (id, marche_id) values
  ('de000000-9999-4000-8000-000000000002', 'de000000-0000-4000-8000-000000000000') $$,
  '42501', null, 'marché désactivé : l''agent ne signale plus de fuite');
select results_eq($$ with u as (update fuites set adresse = 'modifiée'
                                 where id = 'de000000-9999-4000-8000-000000000001' returning 1)
                     select count(*)::int from u $$,
  $$ values (0) $$, 'marché désactivé : l''agent ne modifie plus sa fuite');
select ok((select count(*) from fuites where marche_id = 'de000000-0000-4000-8000-000000000000') > 0,
  'marché désactivé : l''agent lit toujours les fuites');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select results_eq($$ with u as (update secteurs set libelle = libelle
                                 where marche_id = 'de000000-0000-4000-8000-000000000000' returning 1)
                     select count(*)::int from u $$,
  $$ values (0) $$, 'marché désactivé : le responsable ne modifie plus les paramètres');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select results_eq($$ with u as (update secteurs set libelle = libelle
                                 where marche_id = 'de000000-0000-4000-8000-000000000000' returning 1)
                     select count(*) > 0 from u $$,
  $$ values (true) $$, 'marché désactivé : l''administrateur modifie toujours');
select lives_ok($$ update marches set actif = true where id = 'de000000-0000-4000-8000-000000000000' $$,
  'admin : réactive le marché DEMO');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select lives_ok($$ insert into fuites (id, marche_id) values
  ('de000000-9999-4000-8000-000000000003', 'de000000-0000-4000-8000-000000000000') $$,
  'marché réactivé : l''agent signale de nouveau');
reset role;

select * from finish();
rollback;
