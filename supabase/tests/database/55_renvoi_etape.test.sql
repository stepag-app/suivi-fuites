-- =============================================================================
-- Renvoi d'une étape à l'agent (dévalidation) : renvoyer_etape, motif, notification, correction par
-- l'agent (champs, pièces), colonnes protégées, verrou d'un lot arrêté, réfection prévenue une fois.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(46);

-- a admin, b détection, c réparation, e réfection, d responsable, o responsable d'un autre marché
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local', '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'det@test.local',   '{"identifiant": "det", "nom_complet": "Détection"}'),
  ('00000000-0000-0000-0000-00000000000c', 'rep@test.local',   '{"identifiant": "rep", "nom_complet": "Réparation"}'),
  ('00000000-0000-0000-0000-00000000000e', 'refe@test.local',  '{"identifiant": "refe", "nom_complet": "Réfection"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp@test.local',  '{"identifiant": "resp", "nom_complet": "Responsable"}'),
  ('00000000-0000-0000-0000-000000000012', 'autre@test.local', '{"identifiant": "autre", "nom_complet": "Autre"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-R', '1', 'Marché R', 'Client R'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-O', '2', 'Marché O', 'Client O');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000001', 'refection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-000000000012', 'bbbbbbbb-0000-0000-0000-000000000001', 'responsable');

insert into natures_refection (id, marche_id, code, libelle_fr, emplacement) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'beton', 'Béton', 'trottoir');
insert into produits_dolibarr (dolibarr_id, ref, designation, unite, famille, utilisable) values
  (57001, 'ESS57001', 'Manchon 25', 'u', 'ESS', true);

create function pg_temp.notifs(p_evenement text) returns text[] language sql as $$
  select coalesce(array_agg(p.identifiant order by p.identifiant), '{}')
    from notifications n join profils p on p.id = n.destinataire_id
   where n.evenement = p_evenement
$$;

select is(has_function_privilege('anon', 'public.renvoyer_etape(text, uuid, text)', 'execute'), false, 'anon : aucun accès');
select is(has_function_privilege('authenticated', 'public.renvoyer_etape(text, uuid, text)', 'execute'), true,
  'authenticated : renvoyer_etape (droits contrôlés dedans)');

-- -----------------------------------------------------------------------------
-- 1. Détection : refus, renvoi, notification
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
insert into fuites (id, marche_id, adresse) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue A');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select valider_etapes('[{"etape": "detection", "id": "aaaaaaaa-1111-0000-0000-000000000001"}]');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ select renvoyer_etape('detection', 'aaaaaaaa-1111-0000-0000-000000000001', 'x') $$,
  '42501', null, 'agent : ne renvoie pas');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000012", "role": "authenticated"}', true);
select throws_ok($$ select renvoyer_etape('detection', 'aaaaaaaa-1111-0000-0000-000000000001', 'x') $$,
  '42501', null, 'responsable d''un autre marché : refusé');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select renvoyer_etape('detection', 'aaaaaaaa-1111-0000-0000-000000000001', '  ') $$,
  '23514', null, 'motif obligatoire');
select throws_ok($$ select renvoyer_etape('detection', 'aaaaaaaa-1111-0000-0000-000000000001', repeat('x', 501)) $$,
  '23514', null, 'motif de 500 caractères au plus');
select throws_ok($$ select renvoyer_etape('commande', 'aaaaaaaa-1111-0000-0000-000000000001', 'x') $$,
  '22023', null, 'étape inconnue refusée');
select throws_ok($$ select renvoyer_etape('reparation', 'aaaaaaaa-1111-0000-0000-000000000001', 'x') $$,
  'P0002', null, 'étape introuvable');

select is((select renvoyer_etape('detection', 'aaaaaaaa-1111-0000-0000-000000000001', ' Adresse fausse, refaire la position ')), 1,
  'responsable : renvoie la détection validée, l''agent est prévenu');
select results_eq($$ select validee_le, validee_par, renvoyee_le = now(), renvoyee_par::text, motif_renvoi
                       from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values (null::timestamptz, null::uuid, true, '00000000-0000-0000-0000-00000000000d', 'Adresse fausse, refaire la position'::text) $$,
  'détection dévalidée ; motif, date et auteur du renvoi posés');
select results_eq($$ select etape, motif_renvoi, renvoyee_le is not null from v_a_valider where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values ('detection'::text, 'Adresse fausse, refaire la position'::text, true) $$,
  'à valider : la détection revient, avec le motif du renvoi');

reset role;
select is(pg_temp.notifs('etape_a_corriger'), array['det'], 'notification au seul agent (ni le responsable, ni l''administrateur)');
select results_eq($$ select titre, corps, donnees ->> 'etape', donnees ->> 'numero', auteur_id::text, reparation_id, refection_id
                       from notifications where evenement = 'etape_a_corriger' $$,
  $$ values ('Détection à corriger : fuite N° 1'::text, 'Adresse fausse, refaire la position'::text, 'detection'::text, '1'::text,
             '00000000-0000-0000-0000-00000000000d', null::uuid, null::uuid) $$,
  'titre, motif en corps, données pour la traduction');
select ok(exists (select 1 from journal where table_nom = 'fuites' and ligne_id = 'aaaaaaaa-1111-0000-0000-000000000001'
                    and changements ? 'motif_renvoi' and changements ? 'validee_le'
                    and utilisateur_id = '00000000-0000-0000-0000-00000000000d'),
  'journal : dévalidation et motif, au nom du responsable');

-- -----------------------------------------------------------------------------
-- 2. Correction par l'agent ; colonnes du renvoi protégées
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select lives_ok($$ update fuites set adresse = 'Rue B' where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  'agent : corrige sa détection renvoyée');
select lives_ok($$ update fuites set motif_renvoi = 'rien', renvoyee_le = null where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  'agent : écriture des colonnes du renvoi sans effet ni erreur');
select results_eq($$ select adresse, motif_renvoi, renvoyee_le is not null from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values ('Rue B'::text, 'Adresse fausse, refaire la position'::text, true) $$, 'correction gardée, renvoi inchangé');
insert into fuites (id, marche_id, motif_renvoi, renvoyee_le, renvoyee_par) values
  ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'x', now(), '00000000-0000-0000-0000-00000000000d');
select results_eq($$ select motif_renvoi, renvoyee_le, renvoyee_par from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000002' $$,
  $$ values (null::text, null::timestamptz, null::uuid) $$, 'création : colonnes du renvoi vidées');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ update fuites set motif_renvoi = 'direct' where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  'responsable : écriture directe sans effet (seulement par renvoyer_etape)');
select is((select motif_renvoi from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001'), 'Adresse fausse, refaire la position',
  'motif inchangé par une écriture directe');
select is((select valider_etapes('[{"etape": "detection", "id": "aaaaaaaa-1111-0000-0000-000000000001"}]')), 1,
  'responsable : revalide après correction');
select results_eq($$ select validee_le is not null, motif_renvoi from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values (true, 'Adresse fausse, refaire la position'::text) $$, 'revalidée ; dernier renvoi gardé');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ update fuites set adresse = 'Rue C' where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  '42501', null, 'revalidée : l''agent ne modifie plus');

-- -----------------------------------------------------------------------------
-- 3. Réparation : pièces oubliées, réfection prévenue une seule fois
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
insert into reparations (id, marche_id, fuite_id, resultat, fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m,
                         emplacement, nature_revetement_id) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001',
   'reparee', 1, 0.5, 0.5, 'trottoir', 'cccccccc-0000-0000-0000-000000000001');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select valider_etapes('[{"etape": "reparation", "id": "aaaaaaaa-2222-0000-0000-000000000001"}]');
reset role;
select is(pg_temp.notifs('reparation_validee'), array['issam', 'refe'], 'réparation validée : réfection prévenue');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 57001, 1) $$,
  '42501', null, 'réparation validée : la pièce oubliée est refusée à l''agent');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select renvoyer_etape('reparation', 'aaaaaaaa-2222-0000-0000-000000000001', 'Pièces oubliées')), 1,
  'responsable : renvoie la réparation');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select is((select count(*)::int from v_a_refectionner where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001'), 0,
  'réparation renvoyée : plus de réfection à faire tant qu''elle n''est pas revalidée');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select lives_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 57001, 2) $$,
  'agent : ajoute la pièce oubliée');
select lives_ok($$ update reparations set fouille_longueur_m = 1.4 where id = 'aaaaaaaa-2222-0000-0000-000000000001' $$,
  'agent : corrige sa réparation');
reset role;
select results_eq($$ select destinataire_id::text, reparation_id::text, titre from notifications where evenement = 'etape_a_corriger' order by id desc limit 1 $$,
  $$ values ('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-2222-0000-0000-000000000001', 'Réparation à corriger : fuite N° 1'::text) $$,
  'notification au chef d''équipe de la réparation');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select valider_etapes('[{"etape": "reparation", "id": "aaaaaaaa-2222-0000-0000-000000000001"}]')), 1,
  'responsable : revalide la réparation corrigée');
reset role;
select is(pg_temp.notifs('reparation_validee'), array['issam', 'refe'], 'revalidation : la réfection n''est pas prévenue une seconde fois');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select is((select count(*)::int from v_a_refectionner where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001'), 1,
  'revalidée : la réfection est de nouveau à faire');

-- -----------------------------------------------------------------------------
-- 4. Réfection ; renvoi d'une étape non validée ; saisie du responsable lui-même
-- -----------------------------------------------------------------------------
insert into refections (id, marche_id, fuite_id, nature_id, longueur_m, largeur_m) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001', 1, 0.5);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select renvoyer_etape('refection', 'aaaaaaaa-3333-0000-0000-000000000001', 'Surface à remesurer')), 1,
  'responsable : renvoie une réfection pas encore validée');
select is((select renvoyer_etape('refection', 'aaaaaaaa-3333-0000-0000-000000000001', 'Photo après manquante')), 1,
  'second renvoi : nouveau motif');
select results_eq($$ select validee_le, motif_renvoi from refections where id = 'aaaaaaaa-3333-0000-0000-000000000001' $$,
  $$ values (null::timestamptz, 'Photo après manquante'::text) $$, 'le dernier motif fait foi');
reset role;
select results_eq($$ select destinataire_id::text, refection_id::text, titre from notifications where evenement = 'etape_a_corriger' order by id desc limit 1 $$,
  $$ values ('00000000-0000-0000-0000-00000000000e', 'aaaaaaaa-3333-0000-0000-000000000001', 'Réfection à corriger : fuite N° 1'::text) $$,
  'notification à l''équipe de réfection');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select lives_ok($$ update refections set longueur_m = 1.2 where id = 'aaaaaaaa-3333-0000-0000-000000000001' $$,
  'réfection : corrigée par son équipe');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
insert into fuites (id, marche_id, validee_le) values
  ('aaaaaaaa-1111-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', now());
select is((select renvoyer_etape('detection', 'aaaaaaaa-1111-0000-0000-000000000003', 'Pour mémoire')), 0,
  'saisie du responsable lui-même : renvoyée, personne à prévenir');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select renvoyer_etape('detection', 'aaaaaaaa-1111-0000-0000-000000000002', 'Secteur faux')), 1,
  'administrateur : renvoie aussi');

-- -----------------------------------------------------------------------------
-- 5. Fuite verrouillée par un lot arrêté, étape supprimée, marché désactivé
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select valider_etapes('[{"etape": "reparation", "id": "aaaaaaaa-2222-0000-0000-000000000001"},
                        {"etape": "refection", "id": "aaaaaaaa-3333-0000-0000-000000000001"}]');
reset role;
update fuites set verrouillee_le = now() - interval '1 hour' where id = 'aaaaaaaa-1111-0000-0000-000000000001';
update reparations set cree_le = now() - interval '2 hours' where id = 'aaaaaaaa-2222-0000-0000-000000000001';
update refections set cree_le = now() - interval '30 minutes' where id = 'aaaaaaaa-3333-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select renvoyer_etape('detection', 'aaaaaaaa-1111-0000-0000-000000000001', 'x') $$,
  '23514', null, 'fuite verrouillée : la détection n''est pas renvoyée');
select throws_ok($$ select renvoyer_etape('reparation', 'aaaaaaaa-2222-0000-0000-000000000001', 'x') $$,
  '23514', null, 'fuite verrouillée : réparation antérieure au verrou non renvoyée');
select is((select validee_le is not null from reparations where id = 'aaaaaaaa-2222-0000-0000-000000000001'), true,
  'refus : la réparation reste validée');
select is((select renvoyer_etape('refection', 'aaaaaaaa-3333-0000-0000-000000000001', 'Ajoutée après le lot')), 1,
  'fuite verrouillée : une étape ajoutée depuis le verrou se renvoie');

update reparations set supprime_le = now() where id = 'aaaaaaaa-2222-0000-0000-000000000001';
select throws_ok($$ select renvoyer_etape('reparation', 'aaaaaaaa-2222-0000-0000-000000000001', 'x') $$,
  'P0002', null, 'étape supprimée : introuvable');

reset role;
update marches set actif = false where id = 'aaaaaaaa-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select renvoyer_etape('detection', 'aaaaaaaa-1111-0000-0000-000000000002', 'x') $$,
  '42501', null, 'marché désactivé : lecture seule');
reset role;

select * from finish();
rollback;
