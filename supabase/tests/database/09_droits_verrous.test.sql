-- =============================================================================
-- Lot Q : matrice des droits (enregistrer_droits) et verrous de sécurité que
-- l'administrateur pose sur lui-même (verrous_admin).
-- Tout se passe dans une transaction annulée à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(68);

-- -----------------------------------------------------------------------------
-- Jeu d'essai : a = admin, b = détection, c = chef de réparation,
-- d = responsable, e = sans affectation ; marché Q, une fuite réparée, un lot.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.b@test.local', '{"identifiant": "agent.b", "nom_complet": "Agent B"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chef.c@test.local',  '{"identifiant": "chef.c", "nom_complet": "Chef C"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.d@test.local',  '{"identifiant": "resp.d", "nom_complet": "Responsable D"}'),
  ('00000000-0000-0000-0000-00000000000e', 'autre.e@test.local', '{"identifiant": "autre.e", "nom_complet": "Autre E"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('99999999-0000-0000-0000-000000000001', 'TEST-Q', '1', 'Marché Q', 'Client Q');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', '99999999-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', '99999999-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', '99999999-0000-0000-0000-000000000001', 'responsable');

insert into prix (id, marche_id, numero, ordre, designation, unite, quantite_marche, pu_ht, famille, materiaux, diametre_max_mm) values
  ('99999999-4444-0000-0000-000000000003', '99999999-0000-0000-0000-000000000001', '3', 3, 'Terrassement', 'm3', 10, 50, 'terrassement', null, null),
  ('99999999-4444-0000-0000-000000000006', '99999999-0000-0000-0000-000000000001', '6', 6, 'PE DE < 40', 'u', 2400, 400, 'reparation_tuyau', array['polyethylene'], 39);
insert into ordres_service (id, marche_id, numero, date_os, objet, nature) values
  ('99999999-5555-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', '01', '2026-09-25', 'Commencement', 'commencement');
insert into fuites (id, marche_id) values
  ('99999999-1111-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001'),
  ('99999999-1111-0000-0000-000000000002', '99999999-0000-0000-0000-000000000001'),
  ('99999999-1111-0000-0000-000000000003', '99999999-0000-0000-0000-000000000001'),
  ('99999999-1111-0000-0000-000000000004', '99999999-0000-0000-0000-000000000001');
insert into reparations (marche_id, fuite_id, materiau, diametre_mm, tuyau_repare,
                         fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m, emplacement) values
  ('99999999-0000-0000-0000-000000000001', '99999999-1111-0000-0000-000000000001', 'polyethylene', 32, true, 1.5, 0.6, 0.8, 'trottoir');
insert into attachements (id, marche_id, intitule, os_id, lieu_travaux) values
  ('99999999-7777-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', 'Octobre', '99999999-5555-0000-0000-000000000001', 'Rue Q');
insert into attachement_lignes (marche_id, attachement_id, fuite_id, prix_id)
  select u.marche_id, '99999999-7777-0000-0000-000000000001', u.fuite_id, u.prix_id
    from v_a_attacher u where u.marche_id = '99999999-0000-0000-0000-000000000001';

-- -----------------------------------------------------------------------------
-- 1. Structure : RLS, aucun accès anonyme, aucun verrou par défaut
-- -----------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.verrous_admin'::regclass),
  'verrous_admin : RLS activée');
select ok(not has_table_privilege('anon', 'public.verrous_admin', 'select')
          and not has_table_privilege('anon', 'public.verrous_admin', 'insert'),
  'anon : aucun accès aux verrous');
select ok(not has_function_privilege('anon', 'public.enregistrer_droits(uuid, jsonb, jsonb)', 'execute'),
  'anon : n''appelle pas enregistrer_droits');
select is((select count(*)::int from verrous_admin), 0, 'aucun verrou par défaut : l''administrateur garde tout');

-- -----------------------------------------------------------------------------
-- 2. L'administrateur pose un verrou sur lui-même, et seulement sur lui-même
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ insert into verrous_admin (objet, action) values ('comptes', 'revoquer') $$,
  'admin : verrouille « révoquer un compte » pour lui-même');
select ok(exists (select 1 from journal where table_nom = 'verrous_admin' and operation = 'creation'
                    and utilisateur_id = '00000000-0000-0000-0000-00000000000a' and changements ->> 'action' = 'revoquer'),
  'journal : pose du verrou tracée');
select throws_ok($$ insert into verrous_admin (profil_id, objet, action)
                    values ('00000000-0000-0000-0000-00000000000d', 'fuites', 'supprimer') $$,
  '42501', null, 'admin : ne pose pas de verrou sur un autre compte');
select throws_ok($$ insert into verrous_admin (objet, action) values ('fuites', 'detruire') $$,
  '23514', null, 'verrou inconnu refusé');

-- -----------------------------------------------------------------------------
-- 3. Un non-administrateur ne lit ni n'écrit les verrous ni les droits des autres
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select count(*)::int from droits where profil_id = '00000000-0000-0000-0000-00000000000b'), 0,
  'responsable : ne lit pas les droits de l''agent');
select is((select count(*)::int from verrous_admin), 0, 'responsable : ne voit pas les verrous de l''administrateur');
select throws_ok($$ insert into verrous_admin (objet, action) values ('fuites', 'supprimer') $$,
  '42501', null, 'responsable : ne pose pas de verrou');
select results_eq($$ with s as (delete from verrous_admin returning 1) select count(*)::int from s $$,
  $$ values (0) $$, 'responsable : ne retire pas les verrous de l''administrateur');
select results_eq($$ with u as (update droits set supprimer = 'toutes'
                                 where profil_id = '00000000-0000-0000-0000-00000000000b' returning 1)
                     select count(*)::int from u $$,
  $$ values (0) $$, 'responsable : ne modifie pas les droits de l''agent');
select throws_ok($$ insert into droits (profil_id, marche_id, type_donnee, lire)
                    values ('00000000-0000-0000-0000-00000000000b', '99999999-0000-0000-0000-000000000001', 'exports', true) $$,
  '42501', null, 'responsable : ne crée pas de droit');
select throws_ok($$ select enregistrer_droits('99999999-0000-0000-0000-000000000001',
                    '[{"profil_id": "00000000-0000-0000-0000-00000000000d", "type_donnee": "journal", "lire": true}]') $$,
  '42501', 'Réservé à l''administrateur', 'responsable : n''enregistre pas la matrice (même pour lui)');

-- -----------------------------------------------------------------------------
-- 4. L'administrateur modifie la matrice (journal alimenté)
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is(enregistrer_droits('99999999-0000-0000-0000-000000000001',
  '[{"profil_id": "00000000-0000-0000-0000-00000000000b", "type_donnee": "fuites",
     "lire": true, "creer": true, "modifier": "siennes", "supprimer": "toutes", "valider": false}]'), 1,
  'admin : donne à l''agent le droit de supprimer toutes les fuites');
select results_eq($$ select lire, creer, modifier::text, supprimer::text, valider from droits
                      where profil_id = '00000000-0000-0000-0000-00000000000b' and type_donnee = 'fuites' $$,
  $$ values (true, true, 'siennes', 'toutes', false) $$, 'matrice : valeurs enregistrées');
select is(enregistrer_droits('99999999-0000-0000-0000-000000000001',
  '[{"profil_id": "00000000-0000-0000-0000-00000000000b", "type_donnee": "fuites",
     "lire": true, "creer": true, "modifier": "siennes", "supprimer": "toutes", "valider": false}]'), 0,
  'matrice : rien de changé, rien d''écrit');
select is(enregistrer_droits('99999999-0000-0000-0000-000000000001',
  '[{"profil_id": "00000000-0000-0000-0000-00000000000b", "type_donnee": "exports", "lire": true}]',
  '[{"profil_id": "00000000-0000-0000-0000-00000000000b", "roles": ["responsable", "detection"]}]'), 2,
  'matrice : nouveau droit (exports) et rôle affiché en une fois');
select results_eq($$ select roles from affectations where profil_id = '00000000-0000-0000-0000-00000000000b'
                       and marche_id = '99999999-0000-0000-0000-000000000001' $$,
  $$ values (array['detection', 'responsable']) $$, 'matrice : rôles affichés triés');
select throws_ok($$ select enregistrer_droits('99999999-0000-0000-0000-000000000001',
                    '[{"profil_id": "00000000-0000-0000-0000-00000000000a", "type_donnee": "fuites", "lire": false}]') $$,
  '23514', 'Un administrateur a tous les droits : seuls ses verrous de sécurité se règlent',
  'matrice : les droits d''un administrateur ne se règlent pas');
select throws_ok($$ select enregistrer_droits('99999999-0000-0000-0000-000000000001',
                    '[{"profil_id": "00000000-0000-0000-0000-00000000000e", "type_donnee": "fuites", "lire": true}]') $$,
  '23503', 'Utilisateur non affecté à ce marché', 'matrice : utilisateur non affecté refusé');
select ok(exists (select 1 from journal where table_nom = 'droits' and operation = 'modification'
                    and utilisateur_id = '00000000-0000-0000-0000-00000000000a'
                    and changements -> 'supprimer' = '["non", "toutes"]'::jsonb),
  'journal : changement de droit tracé (avant, après, auteur)');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select lives_ok($$ update fuites set supprime_le = now() where id = '99999999-1111-0000-0000-000000000003' $$,
  'agent : supprime une fuite grâce au droit donné par la matrice');

-- -----------------------------------------------------------------------------
-- 5. Sans verrou, l'administrateur a tout ; chaque verrou bloque, son retrait rétablit
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select ok(private.peut('99999999-0000-0000-0000-000000000001', 'fuites', 'supprimer')
          and private.peut('99999999-0000-0000-0000-000000000001', 'attachements', 'valider')
          and private.peut('99999999-0000-0000-0000-000000000001', 'parametres', 'modifier'),
  'sans verrou : l''administrateur peut tout');

-- Supprimer une fuite
select lives_ok($$ insert into verrous_admin (objet, action) values ('fuites', 'supprimer') $$,
  'verrou posé : supprimer une fuite');
select throws_ok($$ update fuites set supprime_le = now() where id = '99999999-1111-0000-0000-000000000002' $$,
  '42501', 'Action verrouillée par vous : supprimer une fuite. Ouvrez le verrou (Utilisateurs > Droits) pour agir.',
  'verrou : la base refuse la suppression à l''administrateur');
select ok(not private.peut('99999999-0000-0000-0000-000000000001', 'fuites', 'supprimer')
          and private.peut('99999999-0000-0000-0000-000000000001', 'fuites', 'modifier'),
  'verrou précis : supprimer refusé, modifier permis');
select lives_ok($$ update fuites set adresse = 'Rue du verrou' where id = '99999999-1111-0000-0000-000000000002' $$,
  'verrou précis : l''administrateur modifie toujours la fuite');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ update fuites set supprime_le = now() where id = '99999999-1111-0000-0000-000000000004' $$,
  'verrou personnel : le responsable supprime toujours');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ delete from verrous_admin where objet = 'fuites' and action = 'supprimer' $$,
  'verrou retiré par l''administrateur');
select lives_ok($$ update fuites set supprime_le = now() where id = '99999999-1111-0000-0000-000000000002' $$,
  'verrou retiré : suppression rétablie');

-- Arrêter un lot
select lives_ok($$ insert into verrous_admin (objet, action) values ('attachements', 'valider') $$,
  'verrou posé : arrêter un lot');
select throws_ok($$ select arreter_attachement('99999999-7777-0000-0000-000000000001', '2026-10-31') $$,
  '42501', null, 'verrou : arrêt du lot refusé');
select lives_ok($$ delete from verrous_admin where objet = 'attachements' and action = 'valider' $$, 'verrou retiré');
select is(arreter_attachement('99999999-7777-0000-0000-000000000001', '2026-10-31'), 1,
  'verrou retiré : lot arrêté (n° 1)');

-- Rouvrir un lot
select lives_ok($$ insert into verrous_admin (objet, action) values ('attachements', 'rouvrir') $$,
  'verrou posé : rouvrir un lot');
select throws_ok($$ select rouvrir_attachement('99999999-7777-0000-0000-000000000001', 'Erreur') $$,
  '42501', 'Action verrouillée par vous : rouvrir un lot d''attachement. Ouvrez le verrou (Utilisateurs > Droits) pour agir.',
  'verrou : réouverture refusée');
select lives_ok($$ delete from verrous_admin where objet = 'attachements' and action = 'rouvrir' $$, 'verrou retiré');
select lives_ok($$ select rouvrir_attachement('99999999-7777-0000-0000-000000000001', 'Erreur de quantité') $$,
  'verrou retiré : lot rouvert');

-- Refacturation forcée
select lives_ok($$ insert into verrous_admin (objet, action) values ('attachements', 'forcer') $$,
  'verrou posé : refacturation forcée');
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id, quantite, motif) values
  ('99999999-0000-0000-0000-000000000001', '99999999-7777-0000-0000-000000000001', 'forcage',
   '99999999-1111-0000-0000-000000000001', '99999999-4444-0000-0000-000000000006', 1, 'Seconde réparation') $$,
  '42501', 'Action verrouillée par vous : refacturation forcée. Ouvrez le verrou (Utilisateurs > Droits) pour agir.',
  'verrou : refacturation forcée refusée');
select lives_ok($$ delete from verrous_admin where objet = 'attachements' and action = 'forcer' $$, 'verrou retiré');
select lives_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id, quantite, motif) values
  ('99999999-0000-0000-0000-000000000001', '99999999-7777-0000-0000-000000000001', 'forcage',
   '99999999-1111-0000-0000-000000000001', '99999999-4444-0000-0000-000000000006', 1, 'Seconde réparation') $$,
  'verrou retiré : refacturation forcée enregistrée');

-- Créer un marché par copie
select lives_ok($$ insert into verrous_admin (objet, action) values ('marches', 'copier') $$,
  'verrou posé : copier un marché');
select throws_ok($$ select copier_marche('99999999-0000-0000-0000-000000000001', 'TEST-Q2', '2', 'Copie de Q') $$,
  '42501', 'Action verrouillée par vous : créer un marché par copie. Ouvrez le verrou (Utilisateurs > Droits) pour agir.',
  'verrou : copie refusée');
select lives_ok($$ delete from verrous_admin where objet = 'marches' and action = 'copier' $$, 'verrou retiré');
select ok(copier_marche('99999999-0000-0000-0000-000000000001', 'TEST-Q2', '2', 'Copie de Q') is not null,
  'verrou retiré : marché copié');

-- Désactiver un marché
select lives_ok($$ insert into verrous_admin (objet, action) values ('marches', 'desactiver') $$,
  'verrou posé : désactiver un marché');
select throws_ok($$ update marches set actif = false where id = '99999999-0000-0000-0000-000000000001' $$,
  '42501', 'Action verrouillée par vous : désactiver un marché. Ouvrez le verrou (Utilisateurs > Droits) pour agir.',
  'verrou : désactivation refusée');
select lives_ok($$ delete from verrous_admin where objet = 'marches' and action = 'desactiver';
                   update marches set actif = false where id = '99999999-0000-0000-0000-000000000001';
                   update marches set actif = true where id = '99999999-0000-0000-0000-000000000001' $$,
  'verrou retiré : marché désactivé puis réactivé');

-- Révoquer un compte (verrou posé au § 2)
select throws_ok($$ update profils set actif = false where id = '00000000-0000-0000-0000-00000000000c' $$,
  '42501', 'Action verrouillée par vous : révoquer un compte. Ouvrez le verrou (Utilisateurs > Droits) pour agir.',
  'verrou : révocation refusée');
select lives_ok($$ delete from verrous_admin where objet = 'comptes' and action = 'revoquer';
                   update profils set actif = false where id = '00000000-0000-0000-0000-00000000000c' $$,
  'verrou retiré : compte du chef révoqué');
select throws_ok($$ update profils set actif = false where id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501', 'Vous ne pouvez pas révoquer votre propre accès', 'admin : ne révoque pas son propre accès');

-- Lire : un verrou sur « voir » masque les données à l'administrateur
select lives_ok($$ insert into verrous_admin (objet, action) values ('fuites', 'lire') $$, 'verrou posé : voir les fuites');
select is((select count(*)::int from fuites where marche_id = '99999999-0000-0000-0000-000000000001'), 0,
  'verrou : l''administrateur ne voit plus les fuites');
select lives_ok($$ delete from verrous_admin where objet = 'fuites' and action = 'lire' $$, 'verrou retiré');
select is((select count(*)::int from fuites where marche_id = '99999999-0000-0000-0000-000000000001'), 4,
  'verrou retiré : les fuites réapparaissent');

-- Paramètres : la fiche du marché suit le droit « paramètres / modifier »
select lives_ok($$ insert into verrous_admin (objet, action) values ('parametres', 'modifier') $$,
  'verrou posé : modifier les paramètres');
select throws_ok($$ update marches set ville = 'Oujda' where id = '99999999-0000-0000-0000-000000000001' $$,
  '42501', 'Action verrouillée par vous : modifier les paramètres du marché. Ouvrez le verrou (Utilisateurs > Droits) pour agir.',
  'verrou : fiche du marché figée pour l''administrateur');
select lives_ok($$ delete from verrous_admin where objet = 'parametres' and action = 'modifier';
                   update marches set ville = 'Oujda' where id = '99999999-0000-0000-0000-000000000001' $$,
  'verrou retiré : fiche modifiée');

-- Journal : le verrou « consulter » vaut aussi pour les lignes sans marché (comptes, droits, verrous)
select lives_ok($$ insert into verrous_admin (objet, action) values ('journal', 'lire') $$, 'verrou posé : consulter le journal');
select is((select count(*)::int from journal), 0, 'verrou : l''administrateur ne lit plus le journal');
select lives_ok($$ delete from verrous_admin where objet = 'journal' and action = 'lire' $$, 'verrou retiré');
select ok((select count(*) from journal where table_nom = 'verrous_admin') > 0, 'verrou retiré : journal lisible');
reset role;

-- -----------------------------------------------------------------------------
-- 6. Fonction serveur (service_role, sans utilisateur) : ne révoque plus, bloque seulement
-- -----------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ update profils set actif = false where id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', 'La révocation se fait par l''administrateur connecté (panneau, page Utilisateurs)',
  'service_role : ne révoque pas un compte actif');
select lives_ok($$ update profils set actif = false where id = '00000000-0000-0000-0000-00000000000c';
                   update profils set actif = true where id = '00000000-0000-0000-0000-00000000000c' $$,
  'service_role : profil déjà révoqué accepté (blocage de connexion), réactivation permise');
reset role;

-- -----------------------------------------------------------------------------
-- 7. Journal : chaque pose et chaque retrait de verrou
-- -----------------------------------------------------------------------------
select results_eq($$ select operation, count(*)::int from journal
                      where table_nom = 'verrous_admin' and utilisateur_id = '00000000-0000-0000-0000-00000000000a'
                      group by operation order by operation $$,
  $$ values ('creation'::text, 10), ('suppression'::text, 10) $$,
  'journal : 10 verrous posés, 10 retirés, au nom de l''administrateur');

select * from finish();
rollback;
