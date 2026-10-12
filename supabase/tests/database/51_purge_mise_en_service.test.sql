-- =============================================================================
-- S22 (Z3) : purge de mise en service (outils/purge/purger.sql). Données d'essai dans le SRM (fuite,
-- réparation, photo, notifications, balayage, suivi GPS, événement), marché DEMO des migrations ; après la
-- purge : DEMO supprimé, aucune fuite ni balayage, numérotation à 1, secteurs « À balayer », paramétrage,
-- réseau, comptes et droits du SRM gardés, agent de DEMO seulement affecté au SRM, résumé au journal.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

select id as srm from marches where code = 'SRM-4500004453' \gset
\set demo de000000-0000-4000-8000-000000000000

-- a1 : agent de détection du SRM et de DEMO ; a2 : chef réparation de DEMO seulement ; a3 : responsable du SRM
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'det@test.local',  '{"identifiant": "det", "nom_complet": "Détection"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'rep@test.local',  '{"identifiant": "rep", "nom_complet": "Réparation"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'resp@test.local', '{"identifiant": "resp", "nom_complet": "Responsable"}');
select appliquer_modele_role('00000000-0000-0000-0000-0000000000a1', :'srm', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-0000000000a1', :'demo', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-0000000000a2', :'demo', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-0000000000a3', :'srm', 'responsable');
update affectations set roles = array['chef_reparation'] where profil_id = '00000000-0000-0000-0000-0000000000a2';

-- Réseau minimal du SRM (le jeu de migrations n'en a pas) : un tronçon dans le premier secteur.
select s.id as sect, s.zone_id as zone from secteurs s where s.marche_id = :'srm' order by s.code limit 1 \gset
select id as nat from natures_refection where marche_id = :'srm' limit 1 \gset
insert into troncons (id, marche_id, reference, secteur_id, zone_id, geom)
values ('22222222-0000-0000-0000-000000000001', :'srm', 'T-ESSAI-1', :'sect', :'zone',
        st_geomfromtext('LINESTRING(-1.910 34.680, -1.911 34.681)', 4326));

-- Saisies d'essai du SRM
insert into fuites (id, marche_id, reference_srm, secteur_id, zone_id, ouvrage, visibilite, nature_degradation_id,
                    adresse, position, date_detection, auteur_terrain_id)
values ('11111111-0000-0000-0000-000000000001', :'srm', '109-001-004', :'sect', :'zone', 'branchement', 'invisible',
        :'nat', 'Rue essai', st_geogfromtext('POINT(-1.91 34.68)'), now(), '00000000-0000-0000-0000-0000000000a1');
insert into reparations (id, marche_id, fuite_id)
values ('11111111-0000-0000-0000-000000000002', :'srm', '11111111-0000-0000-0000-000000000001');
insert into photos (marche_id, fuite_id, type, stockage, chemin)
values (:'srm', '11111111-0000-0000-0000-000000000001', 'detection', 'r2', :'srm' || '/11111111-0000-0000-0000-000000000001/33333333-0000-0000-0000-000000000001.jpg');
insert into notifications (marche_id, destinataire_id, evenement, fuite_id, titre)
values (:'srm', '00000000-0000-0000-0000-0000000000a3', 'fuite_detectee', '11111111-0000-0000-0000-000000000001', 'Fuite N° 1');
insert into notifications (marche_id, destinataire_id, evenement, titre)
values (:'srm', '00000000-0000-0000-0000-0000000000a3', 'suivi_coupe', 'Suivi coupé');
insert into balayages (marche_id, troncon_id, agent_id) values (:'srm', '22222222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1');
insert into traces_gps (marche_id, profil_id, jour, trace, nb_points, debut, fin)
values (:'srm', '00000000-0000-0000-0000-0000000000a1', current_date,
        st_geomfromtext('LINESTRING M(-1.910 34.680 1, -1.911 34.681 2)', 4326), 2, now(), now());
insert into evenements (marche_id, date_evenement, categorie_id, titre)
select :'srm', current_date, id, 'Réunion d''essai' from categories_evenement where marche_id = :'srm' limit 1;
update zones set balayage_acheve_le = current_date where id = :'zone';

select ok((select statut_balayage from secteurs where id = :'sect') <> 'a_balayer', 'avant : secteur balayé en partie');
select ok((select valeur from private.compteurs where marche_id = :'srm' and cle = 'fuite') = 1, 'avant : compteur des fuites du SRM à 1');

create temp table avant on commit drop as
select (select count(*) from prix where marche_id = :'srm') as prix,
       (select count(*) from secteurs where marche_id = :'srm') as secteurs,
       (select count(*) from zones where marche_id = :'srm') as zones,
       (select count(*) from motifs where marche_id = :'srm') as motifs,
       (select count(*) from journal where marche_id = :'srm' and table_nom in ('prix', 'secteurs', 'marches')) as journal_parametrage,
       (select count(*) from droits where marche_id = :'srm') as droits_srm,
       (select count(*) from droits where marche_id = :'demo' and profil_id = '00000000-0000-0000-0000-0000000000a2') as droits_a2_demo,
       (select count(*) from profils) as profils;

-- Purge (réglages recommandés à Issam)
\set effacer_gps oui
\set effacer_debits oui
\set effacer_evenements oui
\set effacer_envois_email oui
\set garder_notifications_generales non
\set affecter_agents_demo oui
\ir ../../../outils/purge/purger.sql

-- DEMO
select ok(not exists (select 1 from marches where id = :'demo'), 'DEMO supprimé');
select is((select count(*)::int from marches), 1, 'un seul marché : SRM');
select is((select count(*)::int from journal where marche_id = :'demo'), 0, 'journal de DEMO effacé');
select is((select count(*)::int from affectations where marche_id = :'demo'), 0, 'affectations de DEMO effacées');

-- Saisies effacées
select is((select count(*)::int from fuites), 0, 'aucune fuite');
select is((select count(*)::int from reparations), 0, 'aucune réparation');
select is((select count(*)::int from photos), 0, 'aucune photo');
select is((select count(*)::int from notifications), 0, 'aucune notification (générales comprises : réglage non)');
select is((select count(*)::int from balayages), 0, 'aucun balayage');
select is((select count(*)::int from traces_gps), 0, 'aucun tracé GPS');
select is((select count(*)::int from evenements), 0, 'aucun événement');
select is((select count(*)::int from journal where table_nom in ('fuites', 'reparations', 'photos', 'balayages', 'attachements', 'attachement_lignes')), 0,
  'historique des saisies effacé du journal');
select is((select count(*)::int from journal where operation = 'suppression' and table_nom <> 'purge_mise_en_service'), 0,
  'la purge n''écrit pas une ligne de journal par ligne effacée');

-- État remis à zéro
select ok(not exists (select 1 from private.compteurs where marche_id = :'srm' and cle in ('fuite', 'attachement')), 'numérotation du SRM remise à zéro');
select is((select count(*)::int from secteurs where marche_id = :'srm' and statut_balayage <> 'a_balayer'), 0, 'tous les secteurs du SRM « À balayer »');
select is((select count(*)::int from zones where marche_id = :'srm' and balayage_acheve_le is not null), 0, 'aucune zone achevée');

-- Gardé
select is((select count(*) from prix where marche_id = :'srm'), (select prix from avant), 'bordereau du SRM gardé');
select is((select count(*) from secteurs where marche_id = :'srm'), (select secteurs from avant), 'secteurs du SRM gardés');
select is((select count(*) from zones where marche_id = :'srm'), (select zones from avant), 'zones du SRM gardées');
select is((select count(*) from motifs where marche_id = :'srm'), (select motifs from avant), 'motifs du SRM gardés');
select ok(exists (select 1 from troncons where id = '22222222-0000-0000-0000-000000000001'), 'réseau du SRM gardé');
select is((select count(*) from journal where marche_id = :'srm' and table_nom in ('prix', 'secteurs', 'marches')),
  (select journal_parametrage from avant), 'historique du paramétrage du SRM gardé');
select is((select count(*) from profils), (select profils from avant), 'tous les comptes gardés');
select ok(exists (select 1 from affectations where profil_id = '00000000-0000-0000-0000-0000000000a1' and marche_id = :'srm'),
  'agent du SRM et de DEMO : affectation au SRM gardée');

-- Agent de DEMO seulement : mêmes rôles et droits sur le SRM
select is((select roles from affectations where profil_id = '00000000-0000-0000-0000-0000000000a2' and marche_id = :'srm'),
  array['chef_reparation'], 'agent de DEMO seulement : affecté au SRM avec son rôle');
select is((select count(*) from droits where profil_id = '00000000-0000-0000-0000-0000000000a2' and marche_id = :'srm'),
  (select droits_a2_demo from avant), 'agent de DEMO seulement : mêmes droits sur le SRM');

-- Résumé
select is((select count(*)::int from journal where table_nom = 'purge_mise_en_service' and marche_id = :'srm'), 1, 'résumé de la purge au journal du SRM');
select is((select (changements -> 'effacees_srm' ->> 'public.fuites')::int from journal where table_nom = 'purge_mise_en_service'), 1,
  'résumé : une fuite du SRM effacée');
select is((select (changements -> 'effacees_demo' ->> 'public.fuites')::int from journal where table_nom = 'purge_mise_en_service'), 25,
  'résumé : 25 fuites de DEMO effacées');

select * from finish();
rollback;
