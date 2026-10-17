-- =============================================================================
-- Tests de la migration 20261017100000 (durcissement de sécurité, audit S20).
-- Prouvent que chaque exploit confirmé est refusé APRÈS correctif, et que les
-- usages légitimes passent toujours (pas de régression). Transaction annulée.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

-- Jeu d'essai : a = admin, b = détection A, c = chef réparation A, d = responsable A,
-- e = détection B, f = détection A désactivé.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a0', 'adm@test.local',   '{"identifiant":"adm","nom_complet":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000b0', 'detA@test.local',  '{"identifiant":"deta","nom_complet":"Det A"}'),
  ('00000000-0000-0000-0000-0000000000c0', 'chefA@test.local', '{"identifiant":"chefa","nom_complet":"Chef A"}'),
  ('00000000-0000-0000-0000-0000000000d0', 'respA@test.local', '{"identifiant":"respa","nom_complet":"Resp A"}'),
  ('00000000-0000-0000-0000-0000000000e0', 'detB@test.local',  '{"identifiant":"detb","nom_complet":"Det B"}'),
  ('00000000-0000-0000-0000-0000000000f0', 'off@test.local',   '{"identifiant":"off","nom_complet":"Desactive"}');
update profils set est_admin = true where identifiant = 'adm';

insert into marches (id, code, numero, intitule, client, taux_majoration, montant_ttc) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-A', '1', 'Marché A', 'Client A', 15, 1000000),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-B', '2', 'Marché B', 'Client B', 0, 2000000);

select appliquer_modele_role('00000000-0000-0000-0000-0000000000b0', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-0000000000c0', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-0000000000d0', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-0000000000e0', 'bbbbbbbb-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-0000000000f0', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
update profils set actif = false where identifiant = 'off';

-- Données cibles (rôle postgres : déclencheurs court-circuités par appel_systeme)
insert into fuites (id, marche_id) values ('f1111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into troncons (id, marche_id, reference, longueur_m, geom, actif) values
  ('70000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'TR-1', 100,
   st_setsrid(st_makeline(st_makepoint(-1.9,34.68), st_makepoint(-1.901,34.681)), 4326), true);
insert into reparations (id, marche_id, fuite_id, auteur_terrain_id, saisi_par) values
  ('d0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000b0'),  -- appartient à détection A
  ('d0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-0000000000c0'); -- appartient au chef A
insert into ouvriers (id, marche_id, nom_complet) values ('01000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ouvrier');
insert into produits_dolibarr (dolibarr_id, ref, designation, famille, actif, utilisable) values (9991, 'P1', 'Produit', 'AUTRE', true, false);

-- ============ 1. balayages.agent_id (usurpation production terrain) ============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
select throws_ok($$ insert into balayages (marche_id, troncon_id, agent_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000d0') $$,
  '42501', NULL, 'détection A ne peut pas créditer un collègue d''un balayage');
select lives_ok($$ insert into balayages (marche_id, troncon_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001') $$,
  'détection A crée un balayage pour lui-même');

-- ============ 2. photos.auteur_terrain_id (usurpation d'auteur) ============
select throws_ok($$ insert into photos (marche_id, fuite_id, type, chemin, stockage, auteur_terrain_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001','f1111111-0000-0000-0000-000000000001','avant','a/b/c.jpg','supabase','00000000-0000-0000-0000-0000000000d0') $$,
  '42501', NULL, 'détection A ne peut pas attribuer une photo à un collègue');
select lives_ok($$ insert into photos (marche_id, fuite_id, type, chemin, stockage)
  values ('aaaaaaaa-0000-0000-0000-000000000001','f1111111-0000-0000-0000-000000000001','avant','a/b/d.jpg','supabase') $$,
  'détection A dépose une photo pour lui-même');

-- ============ 3. reparation_ouvriers (objet d'autrui) ============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c0","role":"authenticated"}', true);
select throws_ok($$ insert into reparation_ouvriers (marche_id, reparation_id, ouvrier_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','01000000-0000-0000-0000-000000000001') $$,
  '42501', NULL, 'chef A ne peut pas ajouter un ouvrier sur la réparation d''un collègue');
select lives_ok($$ insert into reparation_ouvriers (marche_id, reparation_id, ouvrier_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','01000000-0000-0000-0000-000000000001') $$,
  'chef A ajoute un ouvrier sur sa propre réparation');

-- ============ 4. marches : montant / identifiants légaux réservés à l'admin ============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d0","role":"authenticated"}', true);
select throws_ok($$ update marches set montant_ttc = 1 where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', NULL, 'responsable A ne peut pas changer le montant du marché');
select throws_ok($$ update marches set titulaire_ice = '001122334455667' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', NULL, 'responsable A ne peut pas changer l''ICE du titulaire');

-- ============ 5. activer_produits_dolibarr : effet global réservé à l'admin ============
select throws_ok($$ select activer_produits_dolibarr(array[9991]::int[], true) $$,
  '42501', NULL, 'responsable A ne peut pas activer un produit Dolibarr (effet global)');
reset role; select set_config('request.jwt.claims', '', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
select lives_ok($$ select activer_produits_dolibarr(array[9991]::int[], true) $$,
  'admin active un produit Dolibarr');

-- ============ 6. storage photos : dossier lié à une vraie fuite du marché ============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
select throws_ok($$ insert into storage.objects (bucket_id, name)
  values ('photos','aaaaaaaa-0000-0000-0000-000000000001/99999999-9999-4999-8999-999999999999/x.jpg') $$,
  NULL, NULL, 'dépôt refusé sous une fuite inexistante du marché');
select lives_ok($$ insert into storage.objects (bucket_id, name)
  values ('photos','aaaaaaaa-0000-0000-0000-000000000001/f1111111-0000-0000-0000-000000000001/ok.jpg') $$,
  'dépôt accepté sous une vraie fuite du marché');

-- ============ 7. est_affecte : agent désactivé n'est plus cible de saisie à la place ============
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d0","role":"authenticated"}', true);
select throws_ok($$ insert into fuites (marche_id, auteur_terrain_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000f0') $$,
  NULL, NULL, 'responsable ne peut pas attribuer une saisie à un agent désactivé');

reset role; select set_config('request.jwt.claims', '', true);
select * from finish();
rollback;
