-- =============================================================================
-- Correctif « auteur inconnu » : une saisie sans auteur terrain ni saisi_par
-- (importée, de démonstration, générée) n'est « la sienne » pour personne.
-- Avant la migration 20261006110000, private.peut renvoyait null et le
-- déclencheur avant_modification_saisie laissait passer la modification.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',    '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'detect.s@test.local', '{"identifiant": "detect.s", "nom_complet": "Détection S"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chef.s1@test.local',  '{"identifiant": "chef.s1", "nom_complet": "Chef S1"}'),
  ('00000000-0000-0000-0000-00000000000e', 'chef.s2@test.local',  '{"identifiant": "chef.s2", "nom_complet": "Chef S2"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.s@test.local',   '{"identifiant": "resp.s", "nom_complet": "Responsable S"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-S', '4500000003', 'Marché S', 'Client S');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'bbbbbbbb-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'bbbbbbbb-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'bbbbbbbb-0000-0000-0000-000000000001', 'responsable');

-- Saisies « système » (appel hors rôle authenticated) : ni auteur terrain, ni saisi_par,
-- comme les données importées ou de démonstration.
insert into fuites (id, marche_id) values
  ('bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');
insert into reparations (id, marche_id, fuite_id, materiau, diametre_mm, tuyau_repare) values
  ('bbbbbbbb-2222-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   'bbbbbbbb-1111-0000-0000-000000000001', 'polyethylene', 25, true);
select is((select auteur_terrain_id from reparations where id = 'bbbbbbbb-2222-0000-0000-000000000001'), null,
  'saisie système : aucun auteur terrain');

set local role authenticated;

-- Agent de détection : « les siennes » sur les fuites
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is(private.peut('bbbbbbbb-0000-0000-0000-000000000001', 'fuites', 'modifier', null, null), false,
  'auteur inconnu : peut() renvoie false, jamais null');
select throws_ok($$ update fuites set adresse = 'modifiée' where id = 'bbbbbbbb-1111-0000-0000-000000000001' $$,
  '42501', null, 'auteur inconnu : l''agent de détection ne modifie pas une fuite sans auteur');

-- Chef S1 : « les siennes » sur les interventions
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select throws_ok($$ update reparations set fouille_longueur_m = 1.2 where id = 'bbbbbbbb-2222-0000-0000-000000000001' $$,
  '42501', null, 'auteur inconnu : le chef ne modifie pas une réparation sans auteur');
select lives_ok($$ insert into reparations (id, marche_id, fuite_id, materiau, diametre_mm, tuyau_repare) values
  ('bbbbbbbb-2222-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001',
   'bbbbbbbb-1111-0000-0000-000000000001', 'polyethylene', 32, true) $$,
  'chef S1 : saisit sa propre réparation');
select lives_ok($$ update reparations set fouille_longueur_m = 1.2 where id = 'bbbbbbbb-2222-0000-0000-000000000002' $$,
  'chef S1 : modifie toujours sa propre réparation');

-- Chef S2 : pas la sienne
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select throws_ok($$ update reparations set fouille_longueur_m = 1.5 where id = 'bbbbbbbb-2222-0000-0000-000000000002' $$,
  '42501', null, 'chef S2 : ne modifie pas la réparation du chef S1');

-- Responsable : « toutes »
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ update reparations set fouille_longueur_m = 1.4 where id = 'bbbbbbbb-2222-0000-0000-000000000001' $$,
  'responsable (toutes) : modifie une réparation sans auteur');

-- Administrateur : inchangé
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is(private.peut('bbbbbbbb-0000-0000-0000-000000000001', 'fuites', 'modifier', null, null), true,
  'administrateur : inchangé');
reset role;

select * from finish();
rollback;
