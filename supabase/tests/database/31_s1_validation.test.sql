-- =============================================================================
-- Chantier v2, S1 : circuit de la fuite et validation par étape (V1 à V7).
-- Une transaction de test a une seule valeur de now() : les dates de validation et de verrou
-- sont reculées à la main (rôle postgres) pour simuler « plus tard ».
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(58);

-- a admin, b détection, x détection 2, c réparation, e réfection, d responsable, o autre marché
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local', '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'det@test.local',   '{"identifiant": "det", "nom_complet": "Détection"}'),
  ('00000000-0000-0000-0000-000000000014', 'det2@test.local',  '{"identifiant": "det2", "nom_complet": "Détection 2"}'),
  ('00000000-0000-0000-0000-00000000000c', 'rep@test.local',   '{"identifiant": "rep", "nom_complet": "Réparation"}'),
  ('00000000-0000-0000-0000-00000000000e', 'refe@test.local',  '{"identifiant": "refe", "nom_complet": "Réfection"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp@test.local',  '{"identifiant": "resp", "nom_complet": "Responsable"}'),
  ('00000000-0000-0000-0000-000000000012', 'autre@test.local', '{"identifiant": "autre", "nom_complet": "Autre"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-V', '1', 'Marché V', 'Client V'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-O', '2', 'Marché O', 'Client O');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-000000000014', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000001', 'refection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-000000000012', 'bbbbbbbb-0000-0000-0000-000000000001', 'detection');

insert into prix (id, marche_id, numero, ordre, designation, unite, quantite_marche, pu_ht, famille) values
  ('aaaaaaaa-4444-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '3', 3, 'Terrassement', 'm3', 10, 50, 'terrassement');
insert into natures_refection (id, marche_id, code, libelle_fr, emplacement) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'beton', 'Béton', 'trottoir');
insert into produits_dolibarr (dolibarr_id, ref, designation, unite, famille, utilisable) values
  (57001, 'ESS57001', 'Manchon 25', 'u', 'ESS', true);
update parametres_attachement set mentions_obligatoires = '{}' where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- -----------------------------------------------------------------------------
-- 1. Saisie de la détection
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select lives_ok($$ insert into fuites (id, marche_id, reference_srm, cree_le, validee_le) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '111-111-111', now() + interval '5 days', now()) $$,
  'détection : signale une fuite');
select results_eq($$ select cree_le = now(), validee_le, saisie_differee from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values (true, null::timestamptz, false) $$, 'date de dépôt posée par la base ; validation impossible à la création par l''agent');
select throws_ok($$ insert into fuites (marche_id, auteur_terrain_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014') $$,
  '42501', null, 'détection : ne saisit pas à la place d''un autre agent');
select lives_ok($$ update fuites set adresse = 'Rue A' where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  'avant validation : l''auteur modifie');
select lives_ok($$ update fuites set reference_srm = '111-111-112', date_detection = now() - interval '1 hour'
                    where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  'avant validation : l''auteur corrige sa référence et sa date sans motif');

-- Saisie à la place d'un agent (V5)
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ insert into fuites (id, marche_id, auteur_terrain_id, source_saisie, date_detection) values
  ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b',
   'papier', now() - interval '2 days') $$, 'responsable : saisit une fiche papier, « détectée par » l''agent');
select results_eq($$ select auteur_terrain_id::text, saisi_par::text, saisie_differee from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000002' $$,
  $$ values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000d', true) $$,
  'détectée par l''agent, saisie par le responsable, marquée « saisie différée »');
select throws_ok($$ insert into fuites (marche_id, auteur_terrain_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012') $$,
  '23514', null, '« détectée par » : agent affecté au marché seulement');
select lives_ok($$ insert into fuites (id, marche_id, validee_le) values
  ('aaaaaaaa-1111-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '2000-01-01') $$,
  'responsable : « enregistrer et valider »');
select results_eq($$ select validee_le = now(), validee_par::text from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000003' $$,
  $$ values (true, '00000000-0000-0000-0000-00000000000d') $$, 'validée dès la création, date et auteur posés par la base');

-- -----------------------------------------------------------------------------
-- 2. Validation de la détection (V1, V2)
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from v_a_valider), 0, 'à valider : rien pour un agent');
select throws_ok($$ select valider_etapes('[{"etape": "detection", "id": "aaaaaaaa-1111-0000-0000-000000000001"}]') $$,
  '42501', null, 'détection : ne valide pas');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select results_eq($$ select etape, fuite_numero is not null, nb_photos from v_a_valider where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values ('detection'::text, true, 0::bigint) $$, 'à valider : la détection, sans photo (avertissement)');
select is((select valider_etapes('[{"etape": "detection", "id": "aaaaaaaa-1111-0000-0000-000000000001"},
                                   {"etape": "detection", "id": "aaaaaaaa-1111-0000-0000-000000000002"}]')), 2,
  'responsable : « Valider (2) »');
select is((select valider_etapes('[{"etape": "detection", "id": "aaaaaaaa-1111-0000-0000-000000000001"}]')), 0,
  'une seule validation : déjà validée, ignorée');
select is((select validee_par::text from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000d', 'auteur de la validation gardé');
select throws_ok($$ select valider_etapes('[{"etape": "commande", "id": "aaaaaaaa-1111-0000-0000-000000000001"}]') $$,
  '22023', null, 'étape inconnue refusée');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ update fuites set adresse = 'Rue B' where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  '42501', null, 'après validation : l''agent ne modifie plus');

-- -----------------------------------------------------------------------------
-- 3. Corrections du responsable (V5)
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ update fuites set adresse = 'Rue B' where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  'responsable : corrige l''adresse sans motif');
select throws_ok($$ update fuites set reference_srm = '111-111-113' where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  '23514', null, 'responsable : motif obligatoire pour la référence');
select throws_ok($$ update fuites set date_detection = now() - interval '3 hours' where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  '23514', null, 'responsable : motif obligatoire pour la date de détection');
select throws_ok($$ update fuites set position = 'SRID=4326;POINT(-1.9 34.68)' where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  '23514', null, 'responsable : motif obligatoire pour la position');
select lives_ok($$ update fuites set position = 'SRID=4326;POINT(-1.9 34.68)', motif_modification = 'Épingle déplacée sur le regard'
                    where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$, 'responsable : déplace la position avec un motif');
select results_eq($$ select motif_correction, corrigee_par::text, motif_modification from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values ('Épingle déplacée sur le regard'::text, '00000000-0000-0000-0000-00000000000d', null::text) $$,
  'motif, auteur gardés ; le motif envoyé est vidé');
select ok(exists (select 1 from journal where table_nom = 'fuites' and ligne_id = 'aaaaaaaa-1111-0000-0000-000000000001'
                    and changements ? 'position' and changements ? 'motif_correction'),
  'journal : ancienne position et motif');
select lives_ok($$ update fuites set auteur_terrain_id = '00000000-0000-0000-0000-000000000014'
                    where id = 'aaaaaaaa-1111-0000-0000-000000000002' $$, 'responsable : corrige « détectée par »');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000014", "role": "authenticated"}', true);
insert into fuites (id, marche_id) values ('aaaaaaaa-1111-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$ update fuites set auteur_terrain_id = '00000000-0000-0000-0000-00000000000b'
                     where id = 'aaaaaaaa-1111-0000-0000-000000000004' $$,
  '42501', null, 'agent : ne change pas l''auteur de sa saisie');

-- -----------------------------------------------------------------------------
-- 4. Réparation dès la détection, validation, ajout seulement (V2, V7)
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select lives_ok($$ insert into reparations (id, marche_id, fuite_id, resultat, fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m,
                                             emplacement, nature_revetement_id) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000004',
   'en_cours', 1, 0.5, 0.5, 'trottoir', 'cccccccc-0000-0000-0000-000000000001') $$,
  'réparation possible dès la détection (fuite non validée)');
select lives_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 57001, 1) $$, 'réparateur : pose une pièce');
select lives_ok($$ update reparations set fouille_longueur_m = 1.2 where id = 'aaaaaaaa-2222-0000-0000-000000000001' $$,
  'avant validation : le réparateur modifie sa réparation');
select throws_ok($$ update reparations set validee_le = now() where id = 'aaaaaaaa-2222-0000-0000-000000000001' $$,
  '42501', null, 'réparateur : ne valide pas sa réparation');
select throws_ok($$ insert into reparations (marche_id, fuite_id, auteur_terrain_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000e') $$,
  '42501', null, 'réparateur : ne saisit pas à la place d''un autre');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select count(*)::int from v_a_valider where etape = 'reparation'), 1, 'à valider : la réparation');
select is((select valider_etapes('[{"etape": "reparation", "id": "aaaaaaaa-2222-0000-0000-000000000001"}]')), 1,
  'responsable : valide la réparation');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select throws_ok($$ update reparations set fouille_longueur_m = 1.5 where id = 'aaaaaaaa-2222-0000-0000-000000000001' $$,
  '42501', null, 'après validation : le réparateur ne modifie plus');
select throws_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 57001, 1) $$,
  '42501', null, 'après validation : pas de pièce ajoutée à la réparation validée');
select lives_ok($$ insert into reparations (id, marche_id, fuite_id, resultat, fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m,
                                             emplacement, nature_revetement_id) values
  ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000004',
   'reparee', 1, 0.5, 0.5, 'trottoir', 'cccccccc-0000-0000-0000-000000000001') $$,
  'après validation : le réparateur ajoute une nouvelle réparation');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select results_eq($$ select id::text from v_a_valider where etape = 'reparation' $$,
  $$ values ('aaaaaaaa-2222-0000-0000-000000000002') $$, 'la nouvelle réparation est à valider ; la validée ne l''est plus');
select lives_ok($$ update reparations set fouille_longueur_m = 1.3 where id = 'aaaaaaaa-2222-0000-0000-000000000001' $$,
  'responsable : modifie une réparation validée');

-- Réfections à faire : seulement après validation d'une réparation « réparée »
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select is((select count(*)::int from v_a_refectionner where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000004'), 0,
  'réfection : rien à faire tant que la réparation « réparée » n''est pas validée');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select valider_etapes('[{"etape": "reparation", "id": "aaaaaaaa-2222-0000-0000-000000000002"}]');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select results_eq($$ select reparation_id::text from v_a_refectionner where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000004' $$,
  $$ values ('aaaaaaaa-2222-0000-0000-000000000002') $$, 'réfection : la fuite réparée et validée est à refaire');
select lives_ok($$ insert into refections (id, marche_id, fuite_id) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000004') $$,
  'réfection : saisie');
select is((select count(*)::int from v_a_refectionner where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000004'), 0,
  'réfection saisie : la fuite sort de la liste');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select valider_etapes('[{"etape": "refection", "id": "aaaaaaaa-3333-0000-0000-000000000001"}]')), 1,
  'responsable : valide la réfection');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select throws_ok($$ update refections set observation = 'x' where id = 'aaaaaaaa-3333-0000-0000-000000000001' $$,
  '42501', null, 'après validation : l''équipe de réfection ne modifie plus');

-- -----------------------------------------------------------------------------
-- 5. Photos (V3)
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000014", "role": "authenticated"}', true);
insert into photos (id, marche_id, fuite_id, type, chemin) values
  ('aaaaaaaa-5555-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000004', 'detection', 'x/1.jpg');
select lives_ok($$ update photos set type = 'avant' where id = 'aaaaaaaa-5555-0000-0000-000000000001' $$,
  'avant validation : l''auteur change le type de sa photo');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select valider_etapes('[{"etape": "detection", "id": "aaaaaaaa-1111-0000-0000-000000000004"}]');
reset role;
update fuites set validee_le = now() - interval '1 hour' where id = 'aaaaaaaa-1111-0000-0000-000000000004';
update photos set cree_le = now() - interval '2 hours' where id = 'aaaaaaaa-5555-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000014", "role": "authenticated"}', true);
select throws_ok($$ update photos set type = 'detection' where id = 'aaaaaaaa-5555-0000-0000-000000000001' $$,
  '42501', null, 'photo antérieure à la validation : type figé pour l''agent');
select throws_ok($$ update photos set supprime_le = now() where id = 'aaaaaaaa-5555-0000-0000-000000000001' $$,
  '42501', null, 'photo antérieure à la validation : non retirable par l''agent');
select lives_ok($$ insert into photos (id, marche_id, fuite_id, type, chemin) values
  ('aaaaaaaa-5555-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000004', 'detection', 'x/2.jpg') $$,
  'après validation : l''agent ajoute une photo');
select lives_ok($$ update photos set type = 'avant', supprime_le = now(), motif_retrait = 'Floue' where id = 'aaaaaaaa-5555-0000-0000-000000000002' $$,
  'photo postérieure à la validation : l''agent la retire (retrait logique)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ update photos set supprime_le = now() where id = 'aaaaaaaa-5555-0000-0000-000000000001' $$,
  'responsable : retire une photo antérieure à la validation');

-- -----------------------------------------------------------------------------
-- 6. Après un lot arrêté (V6)
-- -----------------------------------------------------------------------------
reset role;
update fuites set verrouillee_le = now() - interval '1 hour' where id = 'aaaaaaaa-1111-0000-0000-000000000004';
update reparations set cree_le = now() - interval '2 hours' where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select lives_ok($$ insert into reparations (id, marche_id, fuite_id, resultat, fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m) values
  ('aaaaaaaa-2222-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000004',
   'reparee', 2, 1, 1) $$, 'fuite verrouillée : l''agent ajoute une réparation');
select lives_ok($$ update reparations set fouille_profondeur_m = 0.8 where id = 'aaaaaaaa-2222-0000-0000-000000000003' $$,
  'fuite verrouillée : il modifie ce qu''il a ajouté depuis le verrou (non validé)');
select lives_ok($$ insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000003', 57001, 1) $$,
  'fuite verrouillée : pièce posée sur la nouvelle réparation');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select results_eq($$ select quantite_executee, reste from v_a_attacher where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000004' $$,
  $$ values (1.850::numeric, 1.850::numeric) $$, 'la fuite revient dans « À attacher » (terrassement des trois réparations)');

-- Nouvel arrêt : la fuite est reverrouillée, l'ajout se fige
insert into attachements (id, marche_id, intitule) values
  ('aaaaaaaa-7777-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Lot 2');
insert into attachement_lignes (marche_id, attachement_id, fuite_id, prix_id)
  select marche_id, 'aaaaaaaa-7777-0000-0000-000000000001', fuite_id, prix_id from v_a_attacher
   where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000004';
select lives_ok($$ select arreter_attachement('aaaaaaaa-7777-0000-0000-000000000001', current_date) $$, 'lot suivant arrêté');
select is((select verrouillee_le = now() from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000004'), true,
  'nouvel arrêt : la fuite est reverrouillée à la date de l''arrêt');
reset role;
update reparations set cree_le = now() - interval '30 minutes' where id = 'aaaaaaaa-2222-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select throws_ok($$ update reparations set fouille_profondeur_m = 0.7 where id = 'aaaaaaaa-2222-0000-0000-000000000003' $$,
  '42501', null, 'après le nouvel arrêt : la réparation ajoutée est figée à son tour');
reset role;

select * from finish();
rollback;
