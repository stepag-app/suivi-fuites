-- =============================================================================
-- Chantier v2, S1 : comptes, rôles et droits (R1, R2, R3, R4, R6, R7).
-- Tout se passe dans une transaction annulée à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(47);

-- a admin, b détection, c réparation, d responsable, e réfection, n nouveau (aucune saisie),
-- j journal seulement, o autre marché
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local', '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'det@test.local',   '{"identifiant": "det", "nom_complet": "Détection"}'),
  ('00000000-0000-0000-0000-00000000000c', 'rep@test.local',   '{"identifiant": "rep", "nom_complet": "Réparation"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp@test.local',  '{"identifiant": "resp", "nom_complet": "Responsable"}'),
  ('00000000-0000-0000-0000-00000000000e', 'refe@test.local',  '{"identifiant": "refe", "nom_complet": "Réfection"}'),
  ('00000000-0000-0000-0000-000000000010', 'nouv@test.local',  '{"identifiant": "nouv", "nom_complet": "Nouveau"}'),
  ('00000000-0000-0000-0000-000000000011', 'jour@test.local',  '{"identifiant": "jour", "nom_complet": "Journal"}'),
  ('00000000-0000-0000-0000-000000000012', 'autre@test.local', '{"identifiant": "autre", "nom_complet": "Autre"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-R', '1', 'Marché R', 'Client R'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-O', '2', 'Marché O', 'Client O');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000001', 'refection');
select appliquer_modele_role('00000000-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-000000000012', 'bbbbbbbb-0000-0000-0000-000000000001', 'detection');

insert into produits_dolibarr (dolibarr_id, ref, designation, unite, famille, utilisable) values
  (56001, 'ESS56001', 'Manchon 25', 'u', 'ESS', true),
  (56002, 'ESS56002', 'Manchon 32', 'u', 'ESS', true);
insert into natures_refection (id, marche_id, code, libelle_fr, emplacement) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'beton', 'Béton', 'trottoir');

-- Fuite et réparation « système » (sans auteur) pour la réfection
insert into fuites (id, marche_id) values ('aaaaaaaa-1111-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into reparations (id, marche_id, fuite_id, fouille_longueur_m, fouille_largeur_m, emplacement, nature_revetement_id) values
  ('aaaaaaaa-2222-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009',
   1, 0.5, 'trottoir', 'cccccccc-0000-0000-0000-000000000001');

-- -----------------------------------------------------------------------------
-- 1. R1 : rôle « refection » et type de donnée « refections »
-- -----------------------------------------------------------------------------
select is((select count(*)::int from modeles_droits where role = 'refection'), 4, 'modèle « refection » : 4 types de donnée');
select is((select roles from affectations where profil_id = '00000000-0000-0000-0000-00000000000e'),
  array['refection'], 'rôle « refection » seul accepté');
select throws_ok($$ insert into affectations (profil_id, marche_id, roles) values
  ('00000000-0000-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-000000000001', array['chauffeur']) $$,
  '23514', null, 'rôle inconnu refusé');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select results_eq($$ select private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'interventions', 'creer'),
                            private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'refections', 'creer'),
                            private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'refections', 'lire') $$,
  $$ values (true, false, true) $$, 'Réparation seule : réparations oui, réfections non (lecture seule)');
select throws_ok($$ insert into refections (marche_id, fuite_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009') $$,
  '42501', null, 'Réparation seule : ne saisit pas de réfection');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select results_eq($$ select private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'interventions', 'creer'),
                            private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'refections', 'creer'),
                            private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'fuites', 'creer') $$,
  $$ values (false, true, false) $$, 'Réfection seule : réfections oui, réparations et fuites non');
select throws_ok($$ insert into reparations (marche_id, fuite_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009') $$,
  '42501', null, 'Réfection seule : ne saisit pas de réparation');
select lives_ok($$ insert into refections (id, marche_id, fuite_id) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009') $$,
  'Réfection seule : saisit sa réfection (dimensions reprises de la fouille)');
select lives_ok($$ update refections set observation = 'reprise' where id = 'aaaaaaaa-3333-0000-0000-000000000001' $$,
  'Réfection seule : modifie sa réfection');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ insert into verrous_admin (objet, action) values ('refections', 'creer') $$,
  'verrou de l''administrateur sur « refections / créer » accepté');
select is(private.peut('aaaaaaaa-0000-0000-0000-000000000001', 'refections', 'creer'), false,
  'verrou posé : l''administrateur perd « refections / créer »');
delete from verrous_admin where objet = 'refections';

-- -----------------------------------------------------------------------------
-- 2. R2 : modifier les rôles d'un compte dans un marché
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select modifier_roles('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', array['responsable']) $$,
  '42501', null, 'modifier_roles : réservé à l''administrateur');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ select modifier_roles('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', array['refection', 'chef_reparation']) $$,
  'administrateur : ajoute le rôle Réfection au réparateur');
select is((select roles from affectations where profil_id = '00000000-0000-0000-0000-00000000000c'),
  array['chef_reparation', 'refection'], 'rôles triés : Réparation et Réfection');
select is((select creer from droits where profil_id = '00000000-0000-0000-0000-00000000000c' and type_donnee = 'refections'),
  true, 'rôle ajouté : droit « refections / créer » accordé');

-- Droit ajouté à la main (exports / lire), que le rôle retiré n'accorde pas : gardé
update droits set lire = true where profil_id = '00000000-0000-0000-0000-00000000000c' and type_donnee = 'photos';
insert into droits (profil_id, marche_id, type_donnee, lire)
values ('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'exports', true);
select lives_ok($$ select modifier_roles('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', array['refection']) $$,
  'administrateur : retire le rôle Réparation');
select results_eq($$ select type_donnee::text, lire, creer, modifier::text from droits
                      where profil_id = '00000000-0000-0000-0000-00000000000c' order by 1 $$,
  $$ values ('exports', true, false, 'non'), ('fuites', true, false, 'non'), ('interventions', true, false, 'non'),
            ('photos', true, true, 'siennes'), ('refections', true, true, 'siennes') $$,
  'rôle retiré : ses droits redescendent au niveau du rôle restant ; le droit ajouté à la main reste');
select is((select roles from affectations where profil_id = '00000000-0000-0000-0000-00000000000c'),
  array['refection'], 'rôle affiché : Réfection');
select throws_ok($$ select modifier_roles('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', array['chauffeur']) $$,
  '22023', null, 'rôle inconnu refusé');
select throws_ok($$ select modifier_roles('00000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', array['detection']) $$,
  '23514', null, 'administrateur : pas de rôle à régler');
select lives_ok($$ select modifier_roles('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', '{}') $$,
  'liste vide : retiré du marché');
select results_eq($$ select a.actif, a.roles, (select count(*) from droits d where d.profil_id = a.profil_id)
                      from affectations a where a.profil_id = '00000000-0000-0000-0000-00000000000c' $$,
  $$ values (false, '{}'::text[], 0::bigint) $$, 'liste vide : affectation inactive, aucun droit');
select lives_ok($$ select modifier_roles('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', array['chef_reparation']) $$,
  'réaffecté avec un rôle');
select results_eq($$ select a.actif, a.roles from affectations a where a.profil_id = '00000000-0000-0000-0000-00000000000c' $$,
  $$ values (true, array['chef_reparation']) $$, 'réaffecté : affectation active');

-- -----------------------------------------------------------------------------
-- 3. R3, R4, R6 : nom, prénom, matricule, entreprise
-- -----------------------------------------------------------------------------
select lives_ok($$ update profils set nom = ' Bousalam ', prenom = 'Issam', matricule = ' stg-001 ', entreprise = ''
                    where id = '00000000-0000-0000-0000-00000000000a' $$, 'administrateur : nom, prénom, matricule de son compte');
select results_eq($$ select nom_complet, matricule, entreprise from profils where id = '00000000-0000-0000-0000-00000000000a' $$,
  $$ values ('BOUSALAM Issam'::text, 'stg-001'::text, 'STEPAG'::text) $$,
  'nom complet « NOM Prénom », matricule nettoyé, entreprise STEPAG par défaut');
select throws_ok($$ update profils set matricule = 'STG-001' where id = '00000000-0000-0000-0000-00000000000b' $$,
  '23505', null, 'matricule unique, sans distinction de casse');
select lives_ok($$ update profils set entreprise = 'Sous-traitant SARL' where id = '00000000-0000-0000-0000-00000000000c' $$,
  'entreprise du compte (sous-traitant)');
select lives_ok($$ insert into ouvriers (marche_id, nom_complet, matricule) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ouvrier 1', 'OUV-1'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Ouvrier 2', 'OUV-1') $$, 'ouvriers : matricule, même valeur dans deux marchés');
select throws_ok($$ insert into ouvriers (marche_id, nom_complet, matricule) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ouvrier 3', 'ouv-1') $$, '23505', null, 'ouvriers : matricule unique par marché');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ update profils set matricule = 'X1' where id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', null, 'un agent ne change pas son matricule');
reset role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000013', 'meta@test.local',
   '{"identifiant": "meta", "nom_complet": "x", "nom": "Alaoui", "prenom": "Karim", "matricule": "M-13", "entreprise": "ST Réseaux"}');
select results_eq($$ select nom_complet, matricule, entreprise from profils where id = '00000000-0000-0000-0000-000000000013' $$,
  $$ values ('ALAOUI Karim'::text, 'M-13'::text, 'ST Réseaux'::text) $$,
  'création du compte : nom, prénom, matricule, entreprise lus dans les métadonnées');

-- -----------------------------------------------------------------------------
-- 4. R2 : suppression d'un compte (seulement sans saisie)
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
insert into fuites (marche_id, adresse) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Rue 1');
select throws_ok($$ select compte_supprimable('00000000-0000-0000-0000-000000000010') $$,
  '42501', null, 'compte_supprimable : réservé à l''administrateur');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000011", "role": "authenticated"}', true);
update profils set langue = 'ar' where id = '00000000-0000-0000-0000-000000000011';

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select compte_supprimable('00000000-0000-0000-0000-000000000010') -> 'supprimable'), 'true'::jsonb,
  'compte sans saisie : supprimable');
select is((select compte_supprimable('00000000-0000-0000-0000-000000000011') -> 'supprimable'), 'true'::jsonb,
  'changer sa propre langue n''est pas une saisie');
select results_eq($$ select (r -> 'supprimable')::boolean, (r -> 'saisies' ->> 'fuites')::int, r ->> 'raison' like '%révocation seulement%'
                      from compte_supprimable('00000000-0000-0000-0000-00000000000b') r $$,
  $$ values (false, 2, true) $$, 'compte avec une fuite (auteur et saisie) : révocation seulement, raison donnée');
select is((select compte_supprimable('00000000-0000-0000-0000-00000000000a') ->> 'raison'),
  'Vous ne pouvez pas supprimer votre propre compte', 'son propre compte : non supprimable');
reset role;

insert into journal (table_nom, ligne_id, operation, changements, utilisateur_id)
values ('balayages', 'x', 'modification', '{}', '00000000-0000-0000-0000-000000000011');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select compte_supprimable('00000000-0000-0000-0000-000000000011') -> 'saisies' ->> 'journal'), '1',
  'une ligne du journal écrite par le compte est une saisie');
reset role;

select throws_ok($$ delete from profils where id = '00000000-0000-0000-0000-00000000000b' $$,
  '23514', null, 'suppression refusée en base : le compte a des saisies');
select throws_ok($$ delete from auth.users where id = '00000000-0000-0000-0000-00000000000b' $$,
  '23514', null, 'suppression du compte d''authentification refusée par cascade');
select throws_ok($$ delete from profils where id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'administrateur : suppression refusée');
select lives_ok($$ delete from auth.users where id = '00000000-0000-0000-0000-000000000010' $$,
  'compte sans saisie : supprimé (profil, affectation et droits par cascade)');
select results_eq($$ select (select count(*) from profils where id = '00000000-0000-0000-0000-000000000010'),
                            (select count(*) from affectations where profil_id = '00000000-0000-0000-0000-000000000010'),
                            (select count(*) from droits where profil_id = '00000000-0000-0000-0000-000000000010') $$,
  $$ values (0::bigint, 0::bigint, 0::bigint) $$, 'plus de profil, d''affectation ni de droit');

-- -----------------------------------------------------------------------------
-- 5. R7 : corrections du bureau invisibles du terrain
-- -----------------------------------------------------------------------------
select modifier_roles('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', array['chef_reparation']);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
insert into reparations (id, marche_id, fuite_id) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009');
insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-6666-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 56001, 1);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite, remplace_piece_id, motif_modification) values
  ('aaaaaaaa-6666-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
   56002, 1, 'aaaaaaaa-6666-0000-0000-000000000001', 'Diamètre réel 32');
select is((select count(*)::int from reparation_pieces where reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001'), 2,
  'responsable : voit la pièce du terrain et sa correction');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select results_eq($$ select id::text from reparation_pieces where reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001' $$,
  $$ values ('aaaaaaaa-6666-0000-0000-000000000001') $$, 'réparateur : ne voit pas la correction du bureau');
select results_eq($$ select produit_id, quantite from v_pieces_terrain where reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001' $$,
  $$ values (56001, 1.00::numeric) $$, 'v_pieces_terrain : la saisie d''origine, comme le réparateur l''a faite');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from reparation_pieces where reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001'), 1,
  'détection : ne voit pas la correction du bureau');
reset role;

select * from finish();
rollback;
