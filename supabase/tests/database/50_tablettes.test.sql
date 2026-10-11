-- =============================================================================
-- Lot TP : codes temporaires de déverrouillage des tablettes et journal (migration 20261016100000).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', '{"identifiant": "admin-tp", "nom_complet": "Admin TP"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'agent@test.local', '{"identifiant": "agent-tp", "nom_complet": "Agent TP"}');
update profils set est_admin = true where id = '00000000-0000-0000-0000-0000000000a1';

create temp table codes (nom text primary key, code text);
grant select, insert on codes to authenticated, anon;

-- 1. Création : administrateur seulement, durées permises, empreinte seule en base.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}', true);
select throws_ok($$ select creer_code_tablette('deverrouiller', 60) $$, '42501', null, 'un agent ne crée pas de code');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
insert into codes values
  ('heure', creer_code_tablette('deverrouiller', 60, 'Installer une appli')),
  ('quart', creer_code_tablette('deverrouiller', 15)),
  ('liberer', creer_code_tablette('liberer', null)),
  ('expire', creer_code_tablette('deverrouiller', 240));
select ok((select bool_and(code ~ '^\d{8}$') from codes), 'codes de 8 chiffres');
select is((select count(distinct code) from codes), 4::bigint, 'codes tous différents');
select throws_ok($$ select creer_code_tablette('deverrouiller', 30) $$, '22023', null, 'durée hors de 15, 60, 240 refusée');
select throws_ok($$ select creer_code_tablette('autre', 60) $$, '22023', null, 'type inconnu refusé');
select is((select count(*) from codes_tablette c join codes k on c.empreinte = k.code), 0::bigint, 'le code en clair n''est pas gardé');
select is((select minutes from codes_tablette where type = 'liberer'), null::integer, 'code de libération sans durée');
select is((select count(*) from journal_tablettes where action = 'code_cree'), 4::bigint, 'création journalisée');
reset role;
update codes_tablette set expire_le = now() - interval '1 minute'
 where empreinte = encode(sha256(convert_to((select code from codes where nom = 'expire'), 'UTF8')), 'hex');

-- 2. Utilisation par l'agent connecté.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}', true);
select is(utiliser_code_tablette((select code from codes where nom = 'heure'), 'tab-1', 'Xiaomi Redmi Pad 2'),
  '{"ok": true, "type": "deverrouiller", "minutes": 60}'::jsonb, 'code valide : déverrouiller 60 min');
select is(utiliser_code_tablette((select code from codes where nom = 'heure'), 'tab-1'),
  '{"ok": false, "erreur": "invalide"}'::jsonb, 'code déjà utilisé : refusé');
select is(utiliser_code_tablette((select code from codes where nom = 'expire'), 'tab-1'),
  '{"ok": false, "erreur": "invalide"}'::jsonb, 'code expiré : refusé');
select is(utiliser_code_tablette(' ' || substr((select code from codes where nom = 'quart'), 1, 4) || ' ' ||
                                 substr((select code from codes where nom = 'quart'), 5) || ' ', 'tab-1')->>'minutes',
  '15', 'espaces tolérés dans le code tapé');
select is((select count(*) from codes_tablette), 0::bigint, 'un agent ne lit pas les codes');
select is((select count(*) from journal_tablettes), 0::bigint, 'un agent ne lit pas le journal');
reset role;
select is((select utilise_appareil || ' ' || utilise_modele from codes_tablette where minutes = 60), 'tab-1 Xiaomi Redmi Pad 2',
  'tablette notée sur le code utilisé');
select is((select count(*) from journal_tablettes where action = 'deverrouillage' and compte = '00000000-0000-0000-0000-0000000000a2'),
  2::bigint, 'déverrouillages journalisés avec le compte');
select is((select count(*) from journal_tablettes where action = 'code_refuse'), 2::bigint, 'codes refusés journalisés');

-- 3. Limite : 5 refus dans l'heure bloquent le compte, même avec un bon code.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}', true);
-- Le code accepté juste avant a remis le compteur du compte à zéro.
select utiliser_code_tablette('00000000', 'tab-1') from generate_series(1, 5);
select is(utiliser_code_tablette((select code from codes where nom = 'liberer'), 'tab-1'),
  '{"ok": false, "erreur": "trop_d_essais"}'::jsonb, '5 refus dans l''heure : essais bloqués');
reset role;
select is((select utilise_le from codes_tablette where type = 'liberer'), null::timestamptz, 'code non consommé pendant le blocage');

-- 4. Sans session : rien (aucune fonction ouverte à anon) ; un autre compte n'est pas bloqué par les refus de l'agent.
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select utiliser_code_tablette('12345678', 'tab-2') $$, '42501', null, 'sans session : code refusé');
select throws_ok($$ select creer_code_tablette('deverrouiller', 60) $$, '42501', null, 'sans session : pas de création');
select throws_ok($$ select journaliser_tablette('tab-2', null, 'mise_a_jour') $$, '42501', null, 'sans session : pas de journal');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
select is(utiliser_code_tablette((select code from codes where nom = 'liberer'), 'tab-2'),
  '{"ok": true, "type": "liberer", "minutes": null}'::jsonb, 'administrateur sur une autre tablette : libération acceptée');
reset role;
update profils set actif = false where id = '00000000-0000-0000-0000-0000000000a2';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}', true);
select throws_ok($$ select utiliser_code_tablette('12345678', 'tab-1') $$, '42501', null, 'compte désactivé : refusé');
reset role;
update profils set actif = true where id = '00000000-0000-0000-0000-0000000000a2';

-- 5. Journal des événements de la tablette (agent connecté), lu par l'administrateur.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated"}', true);
select lives_ok($$ select journaliser_tablette('tab-1', 'Redmi', 'reverrouillage', '{"automatique": true}', now() - interval '30 days') $$,
  'reverrouillage journalisé par la tablette');
select throws_ok($$ select journaliser_tablette('tab-1', 'Redmi', 'deverrouillage') $$, '22023', null,
  'un déverrouillage ne se journalise que par un code');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
select ok((select survenu_le > now() - interval '8 days' from journal_tablettes where action = 'reverrouillage'),
  'heure de la tablette bornée à une semaine');
select ok((select count(*) > 0 from codes_tablette) and (select count(*) > 0 from journal_tablettes),
  'l''administrateur lit codes et journal');
reset role;

select * from finish();
rollback;
