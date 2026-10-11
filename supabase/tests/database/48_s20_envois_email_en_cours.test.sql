-- =============================================================================
-- Audit S20 (fiabilité) : un envoi d'e-mail resté « en cours » (serveur interrompu entre la réservation et la
-- clôture) passe en échec à la réservation suivante et ne compte plus dans la limite du jour.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000d', 'resp@test.local', '{"identifiant": "resp", "nom_complet": "Responsable"}');
insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-G', '1', 'Marché G', 'Client G');
update marches set emails_par_jour = 2 where code = 'TEST-G';
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
update affectations set roles = array['responsable'] where profil_id = '00000000-0000-0000-0000-00000000000d';

create temp table r (id uuid);
grant select, insert on r to authenticated;

-- 1. Un envoi réservé, puis le serveur interrompu : jamais clos, vieux de 20 minutes.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
insert into r select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'carte', null, 'Carte 1', array['a@b.test.ma'], 'carte.pdf', 2000);
reset role;
update envois_email set cree_le = now() - interval '20 minutes' where id = (select id from r);

-- 2. La réservation suivante le clôt en échec et ne le compte plus (limite du marché : 2).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'carte', null, 'Carte 2', array['a@b.test.ma'], 'carte.pdf', 2000) $$,
  'nouvel envoi réservé après un envoi interrompu');
reset role;
select is((select statut from envois_email where id = (select id from r)), 'echec', 'envoi interrompu : passé en échec');
select ok((select erreur ~ 'interrompu' and termine_le is not null from envois_email where id = (select id from r)),
  'envoi interrompu : motif et date de clôture posés');

-- 3. Les envois récents comptent toujours : 2 en cours = limite du marché atteinte.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'carte', null, 'Carte 3', array['a@b.test.ma'], 'carte.pdf', 2000) $$,
  'second envoi du jour : limite de 2 non atteinte (l''envoi interrompu ne compte pas)');
select throws_ok($$ select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'carte', null, 'Carte 4', array['a@b.test.ma'], 'carte.pdf', 2000) $$,
  '23514', null, 'troisième envoi : limite du marché atteinte (deux envois récents en cours)');
select throws_ok(format($$ select terminer_envoi_email(%L, 'envoye') $$, (select id from r)),
  'P0002', null, 'envoi interrompu : son auteur ne peut plus le clore');
reset role;
select is((select count(*) from envois_email where statut = 'en_cours'), 2::bigint, 'les envois récents restent en cours');

select * from finish();
rollback;
