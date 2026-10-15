-- =============================================================================
-- Re-détection (20261016700000, 20261016700200) : statut « À re-détecter » sur un motif qui la demande,
-- notification du détecteur (ou de tous les agents de détection), re-détection numérotée 22-bis, 22-ter…,
-- fuite d'origine close, numéro affiché dans les vues et les notifications (renvoi à l'agent compris), numéro
-- protégé, copie de marché.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(37);

-- a admin, b détection (détecte), e détection, c réparation, d responsable
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local', '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'det@test.local',   '{"identifiant": "det", "nom_complet": "Détection"}'),
  ('00000000-0000-0000-0000-00000000000e', 'det2@test.local',  '{"identifiant": "det2", "nom_complet": "Détection 2"}'),
  ('00000000-0000-0000-0000-00000000000c', 'rep@test.local',   '{"identifiant": "rep", "nom_complet": "Réparation"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp@test.local',  '{"identifiant": "resp", "nom_complet": "Responsable"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-R', '1', 'Marché R', 'Client R'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-C', '2', 'Copie', 'Client R');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');

insert into motifs (id, marche_id, categorie, code, libelle_fr, ordre) values
  ('aaaaaaaa-9999-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'sans_reparation', 'a_detecter', 'À détecter de nouveau', 1),
  ('aaaaaaaa-9999-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'sans_reparation', 'refus_abonne', 'Refus de l''abonné', 2);
update motifs set redetection = true where id = 'aaaaaaaa-9999-0000-0000-000000000001';
insert into prix (id, marche_id, numero, ordre, designation, unite, quantite_marche, pu_ht, famille) values
  ('aaaaaaaa-4444-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '3', 3, 'Terrassement', 'm3', 10, 50, 'terrassement');

create function pg_temp.dest(p_evenement text, p_fuite uuid) returns text[] language sql as $$
  select coalesce(array_agg(p.identifiant order by p.identifiant), '{}')
    from notifications n join profils p on p.id = n.destinataire_id
   where n.evenement = p_evenement and n.fuite_id = p_fuite
$$;

select is((select libelle_fr from libelles_listes where liste = 'statut_fuite' and code = 'a_redetecter'), 'À re-détecter',
  'libellé du statut « À re-détecter »');

-- -----------------------------------------------------------------------------
-- 1. Détection, puis « non réparée : à détecter de nouveau » → « À re-détecter » et notification
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
insert into fuites (id, marche_id, adresse, reference_srm) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue des Orangers', '302-684-001');
select results_eq($$ select numero, rang, numero_affiche from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values (1, 1::smallint, '1'::text) $$, 'fuite d''origine : N° 1, rang 1, affiché « 1 »');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
insert into reparations (marche_id, fuite_id, resultat, motif_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'non_reparee', 'aaaaaaaa-9999-0000-0000-000000000001');
reset role;
select results_eq($$ select statut::text, motif_sans_reparation_id from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values ('a_redetecter'::text, 'aaaaaaaa-9999-0000-0000-000000000001'::uuid) $$,
  'non réparée « à détecter de nouveau » : fuite « À re-détecter », motif gardé, pas close');
select is(pg_temp.dest('redetection_demandee', 'aaaaaaaa-1111-0000-0000-000000000001'), array['det', 'issam', 'resp'],
  'notification : le détecteur, le responsable et l''administrateur ; ni l''auteur ni l''autre agent de détection');
select results_eq($$ select distinct titre, corps, donnees ->> 'numero', donnees ->> 'motif' from notifications
                      where evenement = 'redetection_demandee' and fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values ('Fuite N° 1 à re-détecter'::text, 'Rue des Orangers'::text, '1'::text, 'À détecter de nouveau'::text) $$,
  'titre, adresse, numéro affiché et motif');
select is((select count(*)::int from v_fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001' and alerte_non_reparee), 0,
  '« À re-détecter » : pas d''alerte de réparation');

-- -----------------------------------------------------------------------------
-- 2. Re-détection : nouvelle fuite liée → « 1-bis » ; la fuite d'origine est close
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
insert into fuites (id, marche_id, adresse, reference_srm, fuite_liee_id, numero) values
  ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue des Orangers, 12 m plus loin', '302-684-001',
   'aaaaaaaa-1111-0000-0000-000000000001', 99);
reset role;
select results_eq($$ select numero, rang, numero_affiche from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000002' $$,
  $$ values (1, 2::smallint, '1-bis'::text) $$, 're-détection : même numéro, rang 2, affiché « 1-bis » (numéro saisi ignoré)');
select results_eq($$ select statut::text, motif_sans_reparation_id from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values ('sans_reparation'::text, 'aaaaaaaa-9999-0000-0000-000000000001'::uuid) $$,
  'fuite d''origine close « Sans réparation », motif « à détecter de nouveau » gardé');
select is(pg_temp.dest('fuite_detectee', 'aaaaaaaa-1111-0000-0000-000000000002'), array['issam', 'rep', 'resp'],
  're-détection : l''équipe de réparation et le responsable sont prévenus');
select is((select distinct titre from notifications where evenement = 'fuite_detectee' and fuite_id = 'aaaaaaaa-1111-0000-0000-000000000002'),
  'Fuite N° 1-bis re-détectée', 'titre de la re-détection');
select results_eq($$ select numero_affiche, fuite_liee_numero, redetection_numero from v_fuites
                      where id in ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000002') order by rang $$,
  $$ values ('1'::text, null::text, '1-bis'::text), ('1-bis'::text, '1'::text, null::text) $$,
  'v_fuites : numéro affiché, numéro de la fuite liée, numéro de la re-détection');
select is((select count(*)::int from v_fuites v where v.marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and v.numero = 1), 2,
  'les deux fuites portent le numéro 1');

-- La numérotation continue sans trou
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
insert into fuites (id, marche_id, adresse) values
  ('aaaaaaaa-1111-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue B');
select results_eq($$ select numero, numero_affiche from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000003' $$,
  $$ values (2, '2'::text) $$, 'fuite suivante : N° 2 (la re-détection ne consomme pas de numéro)');
-- Lien vers une fuite qui n'est pas « À re-détecter » : nouveau numéro
insert into fuites (id, marche_id, adresse, fuite_liee_id) values
  ('aaaaaaaa-1111-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue B bis', 'aaaaaaaa-1111-0000-0000-000000000003');
select results_eq($$ select numero, rang from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000004' $$,
  $$ values (3, 1::smallint) $$, 'lien vers une fuite ouverte : nouveau numéro (doublon signalé, pas une re-détection)');
-- Lien vers la fuite d'origine déjà close : nouveau numéro
insert into fuites (id, marche_id, adresse, fuite_liee_id) values
  ('aaaaaaaa-1111-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue des Orangers', 'aaaaaaaa-1111-0000-0000-000000000001');
select results_eq($$ select numero, rang from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000005' $$,
  $$ values (4, 1::smallint) $$, 'fuite d''origine déjà re-détectée : un second lien prend un nouveau numéro');

-- -----------------------------------------------------------------------------
-- 3. Seconde re-détection : « 1-ter »
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
insert into reparations (marche_id, fuite_id, resultat, motif_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000002', 'non_reparee', 'aaaaaaaa-9999-0000-0000-000000000001');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
insert into fuites (id, marche_id, adresse, fuite_liee_id) values
  ('aaaaaaaa-1111-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue des Orangers, angle', 'aaaaaaaa-1111-0000-0000-000000000002');
reset role;
select results_eq($$ select numero, rang, numero_affiche from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000006' $$,
  $$ values (1, 3::smallint, '1-ter'::text) $$, 'seconde re-détection (par un autre agent) : « 1-ter »');
select is((select statut::text from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000002'), 'sans_reparation',
  '« 1-bis » close à son tour');
select is(private.numero_affiche(22, 4::smallint), '22-quater', 'suffixes : bis, ter, quater…');

-- -----------------------------------------------------------------------------
-- 4. Numéro protégé ; motif sans re-détection ; reprise de la réparation
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
update fuites set rang = 5, numero_affiche = '1-x', numero = 7, observation = 'contrôle'
 where id = 'aaaaaaaa-1111-0000-0000-000000000006';
select results_eq($$ select numero, rang, numero_affiche, observation from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000006' $$,
  $$ values (1, 3::smallint, '1-ter'::text, 'contrôle'::text) $$, 'numéro, rang et numéro affiché ne changent pas par l''API');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
insert into reparations (marche_id, fuite_id, resultat, motif_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000003', 'non_reparee', 'aaaaaaaa-9999-0000-0000-000000000002');
reset role;
select is((select statut::text from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000003'), 'sans_reparation',
  'motif sans re-détection (refus de l''abonné) : close comme avant');
select is(pg_temp.dest('redetection_demandee', 'aaaaaaaa-1111-0000-0000-000000000003'), '{}'::text[],
  'motif sans re-détection : pas de notification');

-- « À re-détecter », puis l'équipe trouve et répare quand même : la fuite avance
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
insert into reparations (marche_id, fuite_id, resultat, motif_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000006', 'non_reparee', 'aaaaaaaa-9999-0000-0000-000000000001');
reset role;
select is((select statut::text from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000006'), 'a_redetecter', '« 1-ter » à re-détecter');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
insert into reparations (marche_id, fuite_id, resultat, emplacement, realisee_le,
                         fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000006', 'reparee', 'terrain_naturel', now() + interval '1 hour',
   1, 0.5, 0.6);
reset role;
select is((select statut::text from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000006'), 'achevee',
  '« À re-détecter » puis réparée (terrain naturel) : achevée');

-- -----------------------------------------------------------------------------
-- 5. Détecteur injoignable : tous les agents de détection ; statut posé à la main par le responsable
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
insert into fuites (id, marche_id, adresse) values
  ('aaaaaaaa-1111-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue C');
reset role;
select set_config('request.jwt.claims', '', true);
update profils set actif = false where identifiant = 'det';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
insert into reparations (marche_id, fuite_id, resultat, motif_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000007', 'non_reparee', 'aaaaaaaa-9999-0000-0000-000000000001');
reset role;
select is(pg_temp.dest('redetection_demandee', 'aaaaaaaa-1111-0000-0000-000000000007'), array['det2', 'issam', 'resp'],
  'détecteur désactivé : les autres agents de détection du marché sont prévenus');
select set_config('request.jwt.claims', '', true);
update profils set actif = true where identifiant = 'det';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
insert into fuites (id, marche_id, adresse) values
  ('aaaaaaaa-1111-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue D');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
update fuites set statut = 'a_redetecter' where id = 'aaaaaaaa-1111-0000-0000-000000000008';
reset role;
select is(pg_temp.dest('redetection_demandee', 'aaaaaaaa-1111-0000-0000-000000000008'), array['det', 'issam'],
  'statut posé à la main par le responsable : le détecteur et l''administrateur (jamais l''auteur)');
-- Re-détection d'une fuite mise « À re-détecter » sans motif : close avec le motif de re-détection du marché
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
insert into fuites (id, marche_id, adresse, fuite_liee_id) values
  ('aaaaaaaa-1111-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue D', 'aaaaaaaa-1111-0000-0000-000000000008');
reset role;
select results_eq($$ select statut::text, motif_sans_reparation_id from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000008' $$,
  $$ values ('sans_reparation'::text, 'aaaaaaaa-9999-0000-0000-000000000001'::uuid) $$,
  'fuite mise à la main « À re-détecter » : close avec le motif de re-détection');
select is((select numero_affiche from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000009'), '6-bis', 're-détection de la N° 6 : « 6-bis »');

-- -----------------------------------------------------------------------------
-- 6. Vues, recherche, données des notifications, copie de marché (lues comme le responsable)
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select distinct fuite_numero_affiche from v_a_valider where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000002'), '1-bis',
  'v_a_valider : numéro affiché');
select is((select numero_affiche from v_fuites_export where id = 'aaaaaaaa-1111-0000-0000-000000000006'), '1-ter',
  'v_fuites_export : numéro affiché');
select is((select fuite_numero_affiche from v_quantites where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000006' limit 1), '1-ter',
  'v_quantites : numéro affiché');
select is((select string_agg(numero_affiche, ',' order by numero_affiche)
             from rechercher_fuites_proches('aaaaaaaa-0000-0000-0000-000000000001', null, null, '302-684-001')),
  '1,1-bis', 'recherche par référence : numéros affichés');
select is((select distinct donnees ->> 'numero' from notifications
            where evenement = 'reparation_saisie' and fuite_id = 'aaaaaaaa-1111-0000-0000-000000000006'), '1-ter',
  'notifications : numéro affiché dans les données (APK installées comprises)');
select is((select distinct titre from notifications
            where evenement = 'reparation_saisie' and fuite_id = 'aaaaaaaa-1111-0000-0000-000000000006'), 'Réparation saisie : fuite N° 1-ter',
  'notifications : numéro affiché dans le titre');

select is(renvoyer_etape('detection', 'aaaaaaaa-1111-0000-0000-000000000006', 'Photo du marquage floue'), 1,
  'renvoi de la détection de la « 1-ter » à son agent');
select is((select titre from notifications where evenement = 'etape_a_corriger' and fuite_id = 'aaaaaaaa-1111-0000-0000-000000000006'),
  'Détection à corriger : fuite N° 1-ter', 'renvoi à l''agent : numéro affiché dans le titre');

select lives_ok($$ select private.copier_parametres_marche('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  'copie des paramètres du marché');
select is((select redetection from motifs where marche_id = 'bbbbbbbb-0000-0000-0000-000000000001' and code = 'a_detecter'), true,
  'copie : la case « re-détection » du motif suit');

select * from finish();
rollback;
