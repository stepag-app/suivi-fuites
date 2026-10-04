-- =============================================================================
-- Tests du marché de démonstration (données fictives) et des droits des agents
-- de terrain : détection et chef de réparation voient les fuites et les
-- réparations, jamais les attachements, les prix, les paramètres ni les exports.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chef.a@test.local',  '{"identifiant": "chef.a", "nom_complet": "Chef A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}');
update profils set est_admin = true where identifiant = 'issam';
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'de000000-0000-4000-8000-000000000000', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'de000000-0000-4000-8000-000000000000', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', (select id from marches where code = 'SRM-4500004453'), 'responsable');

-- -----------------------------------------------------------------------------
-- 1. Données de démonstration
-- -----------------------------------------------------------------------------
select is((select count(*)::int from marches where code = 'DEMO' and actif), 1, 'marché DEMO créé et actif');
select results_eq($$ select statut::text, count(*)::int from fuites
                      where marche_id = 'de000000-0000-4000-8000-000000000000' group by statut order by statut $$,
  $$ values ('achevee', 14), ('detectee', 3), ('en_reparation', 1), ('reparee', 3), ('sans_reparation', 4) $$,
  'DEMO : 25 fuites, tous les statuts');
select is((select count(*)::int from fuites f join marches m on m.id = f.marche_id where m.code = 'SRM-4500004453'), 0,
  'marché SRM : aucune donnée de démonstration');
select results_eq($$ select count(*)::int, sum(round(quantite_marche * pu_ht, 2)) from prix
                      where marche_id = 'de000000-0000-4000-8000-000000000000' $$,
  $$ select count(*)::int, sum(round(quantite_marche * pu_ht, 2)) from prix p join marches m on m.id = p.marche_id
      where m.code = 'SRM-4500004453' $$,
  'DEMO : bordereau copié à l''identique');
select is((select count(*)::int from prix_versions v join prix p on p.id = v.prix_id
            where p.marche_id = 'de000000-0000-4000-8000-000000000000' and v.version = 1), 13,
  'DEMO : version initiale de chaque article');
select results_eq($$ select numero, statut, (select count(*)::int from attachement_lignes l where l.attachement_id = a.id)
                      from attachements a where a.marche_id = 'de000000-0000-4000-8000-000000000000' $$,
  $$ values (1, 'arrete'::text, 18) $$,
  'DEMO : lot N° 01 arrêté, 18 lignes');
select is((select count(*)::int from fuites where marche_id = 'de000000-0000-4000-8000-000000000000' and verrouillee_le is not null), 7,
  'DEMO : fuites du lot N° 01 verrouillées');
select is((select reste from v_a_attacher where marche_id = 'de000000-0000-4000-8000-000000000000'
            and fuite_numero = 2 and prix_numero = '3'), 0.160::numeric,
  'DEMO : profondeur corrigée après le lot, régularisation de + 0,160 m3');
select is((select count(*)::int from v_a_attacher where marche_id = 'de000000-0000-4000-8000-000000000000' and reste <> 0), 30,
  'DEMO : 30 unités restent à attacher');
select results_eq($$ select fuite_numero, anomalie from v_anomalies
                      where marche_id = 'de000000-0000-4000-8000-000000000000' order by 1, 2 $$,
  $$ values (18, 'fouille_superieure_2m'), (18, 'longueur_pe_superieure_2m'), (18, 'terrassement_sans_avis_srm'),
            (20, 'reference_srm_format'), (20, 'terrassement_sans_avis_srm') $$,
  'DEMO : anomalies attendues, aucune sur une fuite close sans fouille ni sur la fuite re-détectée');
select results_eq($$ select alerte_non_reparee, alerte_communication_srm from v_fuites
                      where marche_id = 'de000000-0000-4000-8000-000000000000' and numero = 23 $$,
  $$ values (true, true) $$,
  'DEMO : fuite détectée, non réparée et non communiquée en alerte');

-- -----------------------------------------------------------------------------
-- 2. Chef de réparation : fuites et réparations seulement
-- -----------------------------------------------------------------------------
select results_eq($$ select type_donnee::text from droits
                      where profil_id = '00000000-0000-0000-0000-00000000000c' order by 1 $$,
  $$ values ('fuites'), ('interventions'), ('photos') $$,
  'chef : droits limités aux fuites, interventions et photos');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((select count(*)::int from fuites), 25, 'chef : voit les fuites du marché');
select is((select count(*)::int from reparations), 23, 'chef : voit les réparations');
select results_eq($$ select (select count(*)::int from attachements), (select count(*)::int from attachement_lignes),
                            (select count(*)::int from v_a_attacher), (select count(*)::int from prix),
                            (select count(*)::int from lignes_quantites), (select count(*)::int from modeles_export),
                            (select count(*)::int from evenements) $$,
  $$ values (0, 0, 0, 0, 0, 0, 0) $$,
  'chef : ni attachements, ni prix, ni quantités, ni exports, ni journal des événements');
select throws_ok($$ insert into attachements (marche_id) values ('de000000-0000-4000-8000-000000000000') $$,
  '42501', null, 'chef : ne crée pas de lot');
select throws_ok($$ select arreter_attachement('de000000-0000-4000-8000-400000000001') $$,
  '42501', null, 'chef : n''arrête pas un lot');
select throws_ok($$ insert into prix (marche_id, numero, designation, unite, pu_ht)
                    values ('de000000-0000-4000-8000-000000000000', '99', 'Article pirate', 'u', 1) $$,
  '42501', null, 'chef : ne modifie pas le bordereau');
select lives_ok($$ update marches set intitule = 'Modifié par le chef' where id = 'de000000-0000-4000-8000-000000000000' $$,
  'chef : modification de la fiche du marché ignorée (aucune ligne visible en écriture)');
select lives_ok($$ insert into reparations (marche_id, fuite_id, resultat, observation)
                   values ('de000000-0000-4000-8000-000000000000', 'de000000-0000-4000-8000-100000000022', 'en_cours', 'Fouille ouverte') $$,
  'chef : saisit une réparation');
reset role;
select isnt((select intitule from marches where id = 'de000000-0000-4000-8000-000000000000'), 'Modifié par le chef',
  'chef : fiche du marché inchangée');
select is((select statut::text from fuites where id = 'de000000-0000-4000-8000-100000000022'), 'en_reparation',
  'chef : la réparation fait avancer le statut');

-- -----------------------------------------------------------------------------
-- 3. Agent de détection : fuites, réparations en lecture
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from fuites), 25, 'détection : voit les fuites du marché');
select results_eq($$ select (select count(*)::int from attachements), (select count(*)::int from prix),
                            (select count(*)::int from modeles_export), (select count(*)::int from evenements),
                            (select count(*)::int from lignes_quantites) $$,
  $$ values (0, 0, 0, 0, 0) $$,
  'détection : ni attachements, ni prix, ni exports, ni journal, ni quantités');
select throws_ok($$ insert into reparations (marche_id, fuite_id) values
                    ('de000000-0000-4000-8000-000000000000', 'de000000-0000-4000-8000-100000000025') $$,
  '42501', null, 'détection : ne saisit pas de réparation');
reset role;

-- -----------------------------------------------------------------------------
-- 4. Isolation : un responsable du marché SRM ne voit rien du marché DEMO
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select results_eq($$ select (select count(*)::int from fuites where marche_id = 'de000000-0000-4000-8000-000000000000'),
                            (select count(*)::int from attachements where marche_id = 'de000000-0000-4000-8000-000000000000'),
                            (select count(*)::int from prix where marche_id = 'de000000-0000-4000-8000-000000000000') $$,
  $$ values (0, 0, 0) $$,
  'responsable SRM : aucune donnée du marché DEMO');
reset role;

-- -----------------------------------------------------------------------------
-- 5. Administrateur : lot N° 02 de septembre (régularisation + réfection tardive)
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$
  insert into attachements (id, marche_id, intitule, date_arret, os_id, lieu_travaux) values
    ('de000000-0000-4000-8000-400000000002', 'de000000-0000-4000-8000-000000000000', 'Attachement de septembre 2026',
     '2026-09-30', 'de000000-0000-4000-8000-010000000002', 'Zones université et Aïn Serrak');
  insert into attachement_lignes (marche_id, attachement_id, fuite_id, prix_id)
  select marche_id, 'de000000-0000-4000-8000-400000000002', fuite_id, prix_id
    from v_a_attacher
   where marche_id = 'de000000-0000-4000-8000-000000000000' and reste <> 0 and fuite_numero in (2, 3);
$$, 'admin : lot de septembre avec la régularisation et la réfection tardive');
select is(arreter_attachement('de000000-0000-4000-8000-400000000002'), 2, 'admin : lot arrêté sous le N° 02');
select results_eq($$ select f.numero, l.prix_numero, l.quantite from attachement_lignes l join fuites f on f.id = l.fuite_id
                      where l.attachement_id = 'de000000-0000-4000-8000-400000000002' order by 1, 2 $$,
  $$ values (2, '3'::text, 0.160::numeric), (3, '5', 2.500) $$,
  'admin : seules les différences sont attachées (+ 0,160 m3 et 2,500 m2)');
select is((select count(*)::int from v_a_attacher where marche_id = 'de000000-0000-4000-8000-000000000000'
            and fuite_numero in (2, 3) and reste <> 0), 0,
  'admin : plus rien à attacher sur les fuites N° 2 et 3');
reset role;

select * from finish();
rollback;
