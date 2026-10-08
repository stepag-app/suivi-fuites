-- =============================================================================
-- Chantier v2, S1 : notifications (N1, N3) et appareils push.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(37);

-- a admin, b détection, c réparation, e réfection, f réparation + réfection, d responsable,
-- o responsable d'un autre marché, z responsable révoqué
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local', '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'det@test.local',   '{"identifiant": "det", "nom_complet": "Détection"}'),
  ('00000000-0000-0000-0000-00000000000c', 'rep@test.local',   '{"identifiant": "rep", "nom_complet": "Réparation"}'),
  ('00000000-0000-0000-0000-00000000000e', 'refe@test.local',  '{"identifiant": "refe", "nom_complet": "Réfection"}'),
  ('00000000-0000-0000-0000-00000000000f', 'mixte@test.local', '{"identifiant": "mixte", "nom_complet": "Mixte"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp@test.local',  '{"identifiant": "resp", "nom_complet": "Responsable"}'),
  ('00000000-0000-0000-0000-000000000012', 'autre@test.local', '{"identifiant": "autre", "nom_complet": "Autre"}'),
  ('00000000-0000-0000-0000-000000000013', 'revo@test.local',  '{"identifiant": "revo", "nom_complet": "Révoqué"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-N', '1', 'Marché N', 'Client N'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-O', '2', 'Marché O', 'Client O');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000001', 'refection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000f', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000f', 'aaaaaaaa-0000-0000-0000-000000000001', 'refection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-000000000012', 'bbbbbbbb-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
update profils set actif = false where identifiant = 'revo';

insert into natures_refection (id, marche_id, code, libelle_fr, emplacement) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'beton', 'Béton', 'trottoir');

create function pg_temp.dest(p_evenement text, p_fuite uuid) returns text[] language sql as $$
  select coalesce(array_agg(p.identifiant order by p.identifiant), '{}')
    from notifications n join profils p on p.id = n.destinataire_id
   where n.evenement = p_evenement and n.fuite_id = p_fuite
$$;

-- -----------------------------------------------------------------------------
-- 1. Fuite détectée → Réparation et Responsable (+ administrateur), jamais l'auteur
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
insert into fuites (id, marche_id, adresse) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue des Orangers');
reset role;
select is(pg_temp.dest('fuite_detectee', 'aaaaaaaa-1111-0000-0000-000000000001'), array['issam', 'mixte', 'rep', 'resp'],
  'fuite détectée : Réparation, Responsable et administrateur ; ni l''auteur, ni la réfection, ni un révoqué, ni un autre marché');
select results_eq($$ select titre, corps, donnees ->> 'numero' is not null, auteur_id::text from notifications
                      where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' limit 1 $$,
  $$ values ('Nouvelle fuite N° 1 détectée'::text, 'Rue des Orangers'::text, true, '00000000-0000-0000-0000-00000000000b') $$,
  'titre, adresse, données pour la traduction, auteur');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
insert into fuites (id, marche_id, auteur_terrain_id) values
  ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b');
reset role;
select is(pg_temp.dest('fuite_detectee', 'aaaaaaaa-1111-0000-0000-000000000002'), array['issam', 'mixte', 'rep'],
  'saisie à la place d''un agent : ni le responsable qui saisit, ni l''agent');
insert into fuites (id, marche_id, source_saisie) values
  ('aaaaaaaa-1111-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'import');
select is(pg_temp.dest('fuite_detectee', 'aaaaaaaa-1111-0000-0000-000000000003'), '{}'::text[], 'fuite importée : pas de notification');

-- -----------------------------------------------------------------------------
-- 2. Lecture : les siennes seulement ; lu / non lu
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((select count(*)::int from notifications), 2, 'réparateur : voit ses 2 notifications');
select is((select count(*)::int from notifications where destinataire_id <> '00000000-0000-0000-0000-00000000000c'), 0,
  'réparateur : ne voit pas celles des autres');
select is(compter_notifications_non_lues(), 2, 'compteur : 2 non lues');
select throws_ok($$ insert into notifications (destinataire_id, marche_id, evenement, fuite_id, titre) values
  ('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'fuite_detectee',
   'aaaaaaaa-1111-0000-0000-000000000001', 'x') $$, '42501', null, 'un compte n''écrit pas de notification');
select throws_ok($$ update notifications set titre = 'x' $$, '42501', null, 'seul « lue_le » se modifie');
select is(marquer_notifications_lues(array[(select min(id) from notifications)]), 1, 'marquer lue : une notification');
select is(compter_notifications_non_lues(), 1, 'compteur : 1 non lue');
select is(marquer_notifications_lues(), 1, 'tout marquer lu (ouverture de la liste)');
select is(compter_notifications_non_lues(), 0, 'compteur : 0');
select lives_ok($$ update notifications set lue_le = null where id = (select min(id) from notifications) $$,
  'remettre en non lu');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is(marquer_notifications_lues(), 1, 'tout marquer lu ne touche que les siennes');
reset role;
select is((select count(*)::int from notifications where destinataire_id = '00000000-0000-0000-0000-00000000000c' and lue_le is null), 1,
  'les notifications du réparateur restent telles quelles');

-- -----------------------------------------------------------------------------
-- 3. Réparation saisie → Responsable ; réparation « réparée » validée → Réfection
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
insert into reparations (id, marche_id, fuite_id, resultat) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'en_cours');
insert into reparations (id, marche_id, fuite_id, resultat, fouille_longueur_m, fouille_largeur_m, emplacement, nature_revetement_id) values
  ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001',
   'reparee', 1, 0.5, 'trottoir', 'cccccccc-0000-0000-0000-000000000001');
insert into reparations (id, marche_id, fuite_id, resultat, emplacement) values
  ('aaaaaaaa-2222-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000002',
   'reparee', 'terrain_naturel');
reset role;
select is((select array_agg(distinct p.identifiant order by p.identifiant) from notifications n join profils p on p.id = n.destinataire_id
            where n.evenement = 'reparation_saisie' and n.reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001'),
  array['issam', 'resp'], 'réparation saisie : Responsable et administrateur, pas le réparateur');
select is((select count(*)::int from notifications where evenement = 'reparation_validee'), 0,
  'réparation non validée : la réfection n''est pas prévenue');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select valider_etapes('[{"etape": "reparation", "id": "aaaaaaaa-2222-0000-0000-000000000001"},
                        {"etape": "reparation", "id": "aaaaaaaa-2222-0000-0000-000000000002"},
                        {"etape": "reparation", "id": "aaaaaaaa-2222-0000-0000-000000000003"}]');
reset role;
select is(pg_temp.dest('reparation_validee', 'aaaaaaaa-1111-0000-0000-000000000001'), array['issam', 'mixte', 'refe'],
  'réparation « réparée » validée : Réfection (rôle cumulé compris) et administrateur, pas le responsable qui valide');
select is((select count(*)::int from notifications where evenement = 'reparation_validee'
            and reparation_id = 'aaaaaaaa-2222-0000-0000-000000000001'), 0, 'réparation « en cours » validée : rien');
select is(pg_temp.dest('reparation_validee', 'aaaaaaaa-1111-0000-0000-000000000002'), '{}'::text[],
  'terrain naturel (pas de réfection) : rien');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
update reparations set observation = 'vu' where id = 'aaaaaaaa-2222-0000-0000-000000000002';
reset role;
select is((select count(*)::int from notifications where evenement = 'reparation_validee'), 3,
  'modification après validation : pas de nouvelle notification');

-- -----------------------------------------------------------------------------
-- 4. Réfection saisie → Responsable
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
insert into refections (id, marche_id, fuite_id, reparation_id) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001',
   'aaaaaaaa-2222-0000-0000-000000000002');
reset role;
select is(pg_temp.dest('refection_saisie', 'aaaaaaaa-1111-0000-0000-000000000001'), array['issam', 'resp'],
  'réfection saisie : Responsable et administrateur, pas l''équipe de réfection');

-- -----------------------------------------------------------------------------
-- 5. Alerte « non réparée » au-delà du délai du marché (48 h)
-- -----------------------------------------------------------------------------
insert into fuites (id, marche_id, date_detection, source_saisie) values
  ('aaaaaaaa-1111-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '3 days', 'import'),
  ('aaaaaaaa-1111-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '40 days', 'import'),
  ('aaaaaaaa-1111-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '1 day', 'import');
select ok(generer_alertes_reparation() >= 4, 'alerte : notifications créées');
select is((select count(*)::int from notifications where evenement = 'alerte_reparation'
            and marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 4,
  'alerte : 4 destinataires pour la seule fuite de plus de 48 h (ni moins de 48 h, ni plus de 30 jours)');
select is(pg_temp.dest('alerte_reparation', 'aaaaaaaa-1111-0000-0000-000000000004'), array['issam', 'mixte', 'rep', 'resp'],
  'alerte : Réparation, Responsable et administrateur');
select is((select titre from notifications where evenement = 'alerte_reparation'
             and fuite_id = 'aaaaaaaa-1111-0000-0000-000000000004' limit 1),
  'Fuite N° 4 non réparée depuis plus de 48 h', 'titre de l''alerte');
select is(generer_alertes_reparation(), 0, 'alerte : une seule fois par fuite');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select throws_ok($$ select generer_alertes_reparation() $$, '42501', null, 'alerte : réservée au serveur');

-- -----------------------------------------------------------------------------
-- 6. Circuit réglable par l'administrateur
-- -----------------------------------------------------------------------------
select lives_ok($$ delete from notifications_circuit where evenement = 'reparation_saisie' and role = 'responsable' $$,
  'administrateur : retire le responsable du circuit « réparation saisie »');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ insert into notifications_circuit values ('reparation_saisie', 'detection') $$,
  '42501', null, 'circuit : réglé par l''administrateur seulement');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
insert into reparations (id, marche_id, fuite_id, resultat) values
  ('aaaaaaaa-2222-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000002', 'en_cours');
reset role;
select is((select array_agg(p.identifiant) from notifications n join profils p on p.id = n.destinataire_id
            where n.reparation_id = 'aaaaaaaa-2222-0000-0000-000000000004'), array['issam'],
  'circuit modifié : seul l''administrateur est prévenu');

-- -----------------------------------------------------------------------------
-- 7. Appareils push
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select lives_ok($$ select enregistrer_appareil_push('jeton-tablette-1', '2.0.0') $$, 'réparateur : enregistre sa tablette');
select is((select count(*)::int from appareils_push), 1, 'il voit son appareil');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select enregistrer_appareil_push('jeton-tablette-1');
select results_eq($$ select profil_id::text from appareils_push $$, $$ values ('00000000-0000-0000-0000-00000000000d') $$,
  'tablette passée à un autre compte : le jeton change de compte');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((select count(*)::int from appareils_push), 0, 'l''ancien compte ne la voit plus');
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select enregistrer_appareil_push('jeton-x') $$, '42501', null, 'sans compte connecté : refusé');
reset role;

select * from finish();
rollback;
