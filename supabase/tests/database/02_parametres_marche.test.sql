-- =============================================================================
-- Tests de l'étape A : fiche du marché, valeurs par défaut d'un nouveau marché,
-- versions des articles du bordereau, avenants, arrêts et délai, journal des
-- événements (droits, suppression logique, pièces jointes), libellés et
-- contrôles propres au client.
-- Tout se passe dans une transaction annulée à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(49);

-- -----------------------------------------------------------------------------
-- Jeu d'essai : a = admin, b = détection A, d = responsable A, e = détection B
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}'),
  ('00000000-0000-0000-0000-00000000000e', 'agent.b@test.local', '{"identifiant": "agent.b", "nom_complet": "Agent B"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-A', '1', 'Marché A', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-B', '2', 'Marché B', 'Client B');

select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'bbbbbbbb-0000-0000-0000-000000000001', 'detection');

insert into prix (id, marche_id, numero, ordre, designation, unite, quantite_marche, pu_ht, famille, hors_bordereau) values
  ('aaaaaaaa-4444-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '3', 3, 'Terrassement', 'm3', 2400, 50, 'terrassement', false),
  ('aaaaaaaa-4444-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-000000000001', 'HB-01', 900, 'Pièce spéciale', 'u', null, 10, 'autre', true);

-- -----------------------------------------------------------------------------
-- 1. Valeurs par défaut d'un nouveau marché et du marché 4500004453
-- -----------------------------------------------------------------------------
select is((select count(*)::int from categories_evenement where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 5,
  'nouveau marché : 5 catégories d''événements par défaut');
select results_eq($$ select regroupement, fuites_admissibles, afficher_prix, verrouiller_a_l_arret
                      from parametres_attachement where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  $$ values ('poste'::text, 'toutes'::text, false, true) $$,
  'nouveau marché : règles d''attachement par défaut');
select results_eq($$ select libelle_reference, masque_reference, jalons_client, devise
                      from marches where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  $$ values ('Référence client'::text, null::text, false, 'DH'::text) $$,
  'nouveau marché : libellés génériques, aucun format ni jalon imposé');
select is((select version from prix_versions where prix_id = 'aaaaaaaa-4444-0000-0000-000000000003'), 1,
  'article créé : version 1 enregistrée');
select results_eq($$ select m.titulaire_nom, m.client_sigle, m.masque_reference, m.jalons_client, o.nature
                      from marches m join ordres_service o on o.id = m.os_commencement_id
                     where m.code = 'SRM-4500004453' $$,
  $$ values ('STEPAG SARL'::text, 'SRM'::text, '999-999-999'::text, true, 'commencement'::text) $$,
  'marché 4500004453 : titulaire, sigle, format de référence, jalons et OS de commencement');
select is((select date_fin_initiale from v_delai_marche d join marches m on m.id = d.marche_id where m.code = 'SRM-4500004453'),
  '2027-10-01'::date, 'marché 4500004453 : fin du délai initial au 2027-10-01 (veille du jour anniversaire)');
select is((select count(*)::int from prix_versions v join marches m on m.id = v.marche_id where m.code = 'SRM-4500004453'), 13,
  'marché 4500004453 : version initiale des 13 prix');
select ok((select bool_and(d.lire and d.valider) from droits d
            where d.profil_id = '00000000-0000-0000-0000-00000000000d' and d.type_donnee = 'evenements'),
  'modèle « responsable » : droits sur le journal des événements');

-- -----------------------------------------------------------------------------
-- 2. Responsable du marché A
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);

select lives_ok($$ update marches set titulaire_nom = 'Société X', titulaire_ice = '000111222000033',
                          date_commencement = '2026-10-02', duree_mois = 12
                    where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'responsable : renseigne la fiche du marché (titulaire, délai)');
select is((select titulaire_nom from marches where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'Société X',
  'responsable : fiche du marché enregistrée');
select throws_ok($$ update marches set code = 'AUTRE' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', 'Le code et l''activation d''un marché sont réservés à l''administrateur',
  'responsable : ne change pas le code du marché');
select throws_ok($$ update marches set duree_jours = 365 where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23514', null, 'durée en mois ou en jours, pas les deux');

-- Bordereau : versions et avenants
select throws_ok($$ update prix set pu_ht = 60 where id = 'aaaaaaaa-4444-0000-0000-000000000003' $$,
  '42501', 'Article du bordereau : enregistrez une nouvelle version (avenant ou motif)',
  'responsable : pas de modification directe d''un article du bordereau');
select throws_ok($$ update prix set hors_bordereau = true where id = 'aaaaaaaa-4444-0000-0000-000000000003' $$,
  '23514', null, 'un article ne passe pas du bordereau au hors bordereau');
select lives_ok($$ insert into avenants (id, marche_id, numero, date_avenant, objet, prolongation_jours)
                    values ('aaaaaaaa-5555-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
                            'AV-01', '2026-12-01', 'Prolongation et révision du prix 3', 30) $$,
  'responsable : enregistre un avenant');
select lives_ok($$ insert into prix_versions (prix_id, pu_ht, quantite_marche, avenant_id, motif)
                    values ('aaaaaaaa-4444-0000-0000-000000000003', 55, 2600,
                            'aaaaaaaa-5555-0000-0000-000000000001', 'Avenant n° AV-01') $$,
  'responsable : nouvelle version d''un article par avenant');
select results_eq($$ select pu_ht, quantite_marche, designation from prix where id = 'aaaaaaaa-4444-0000-0000-000000000003' $$,
  $$ values (55.00::numeric, 2600.000::numeric, 'Terrassement'::text) $$,
  'la version s''applique à l''article (valeurs non fournies reprises)');
select results_eq($$ select version, pu_ht, saisi_par::text from prix_versions
                      where prix_id = 'aaaaaaaa-4444-0000-0000-000000000003' order by version $$,
  $$ values (1, 50.00::numeric, null::text), (2, 55.00::numeric, '00000000-0000-0000-0000-00000000000d') $$,
  'historique : version initiale et version de l''avenant, avec son auteur');
select throws_ok($$ insert into prix_versions (prix_id, pu_ht, motif) values ('aaaaaaaa-4444-0000-0000-000000000003', 55, 'Rien') $$,
  '23514', 'Aucun changement par rapport à la version en vigueur', 'version identique refusée');
select throws_ok($$ insert into prix_versions (prix_id, pu_ht, motif) values ('aaaaaaaa-4444-0000-0000-000000000003', 58, '  ') $$,
  '23514', null, 'motif obligatoire pour une version');
select lives_ok($$ update prix set pu_ht = 12 where id = 'aaaaaaaa-4444-0000-0000-0000000000b1' $$,
  'responsable : modifie directement un article hors bordereau');
select results_eq($$ select version, pu_ht from prix_versions where prix_id = 'aaaaaaaa-4444-0000-0000-0000000000b1' order by version $$,
  $$ values (1, 10.00::numeric), (2, 12.00::numeric) $$,
  'article hors bordereau : chaque modification crée une version');

-- Arrêts, reprises et délai
select lives_ok($$ insert into arrets_travaux (marche_id, date_arret, motif, date_reprise)
                    values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-11-01', 'Intempéries', '2026-11-11') $$,
  'responsable : enregistre un arrêt et sa reprise');
select throws_ok($$ insert into arrets_travaux (marche_id, date_arret, motif)
                     values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-11-05', 'Autre') $$,
  '23514', 'Cet arrêt chevauche un autre arrêt du marché', 'arrêts qui se chevauchent refusés');
select results_eq($$ select date_fin_initiale, jours_arret, jours_prolongation, date_fin_prevue, arret_en_cours
                      from v_delai_marche where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  $$ values ('2027-10-01'::date, 10, 30, '2027-11-10'::date, false) $$,
  'délai : 12 mois depuis le 2026-10-02, + 10 jours d''arrêt + 30 jours d''avenant');

-- Journal des événements
select lives_ok($$ insert into evenements (id, marche_id, date_evenement, categorie_id, titre, participants)
                    select 'aaaaaaaa-6666-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-10-20', c.id,
                           'Audit des réfections', 'M. X (client), M. Y (entreprise)'
                      from categories_evenement c
                     where c.marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and c.code = 'sortie_audit' $$,
  'responsable : enregistre un événement');
select is((select saisi_par::text from evenements where id = 'aaaaaaaa-6666-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000d', 'événement : auteur de saisie forcé au compte connecté');
select lives_ok($$ insert into categories_evenement (marche_id, code, libelle) values
                    ('aaaaaaaa-0000-0000-0000-000000000001', 'visite_client', 'Visite du client') $$,
  'responsable : ajoute une catégorie d''événement');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id) values
                    ('evenements', 'aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-6666-0000-0000-000000000001/pv.pdf',
                     '00000000-0000-0000-0000-00000000000d') $$,
  'responsable : envoie une pièce jointe dans le dossier du marché');
select lives_ok($$ insert into evenement_pieces (marche_id, evenement_id, nom_fichier, chemin, type_mime) values
                    ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-6666-0000-0000-000000000001', 'pv.pdf',
                     'aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-6666-0000-0000-000000000001/pv.pdf', 'application/pdf') $$,
  'responsable : rattache la pièce jointe à l''événement');
select lives_ok($$ update evenements set supprime_le = now() where id = 'aaaaaaaa-6666-0000-0000-000000000001' $$,
  'responsable : suppression logique d''un événement');
select is((select supprime_par::text from evenements where id = 'aaaaaaaa-6666-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000d', 'suppression logique : auteur enregistré');
select throws_ok($$ delete from evenements where id = 'aaaaaaaa-6666-0000-0000-000000000001' $$,
  '42501', null, 'suppression physique d''un événement interdite');
select lives_ok($$ update parametres_attachement set afficher_prix = true, regroupement = 'secteur'
                    where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'responsable : modifie les règles d''attachement');
reset role;

select ok((select count(*) > 0 from journal where table_nom = 'prix' and operation = 'modification'
             and utilisateur_id = '00000000-0000-0000-0000-00000000000d'),
  'journal : modification de l''article par version tracée au nom du responsable');
select ok((select count(*) > 0 from journal where table_nom = 'marches' and operation = 'modification'
             and utilisateur_id = '00000000-0000-0000-0000-00000000000d'),
  'journal : modification de la fiche du marché tracée');

-- -----------------------------------------------------------------------------
-- 3. Agent de détection du marché A : lit les paramètres, rien d'autre
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);

select is((select count(*)::int from evenements), 0, 'détection : ne lit pas le journal des événements');
select throws_ok($$ insert into evenements (marche_id, date_evenement, categorie_id, titre)
                     select marche_id, '2026-10-21', id, 'Essai' from categories_evenement limit 1 $$,
  '42501', null, 'détection : ne crée pas d''événement');
select lives_ok($$ update marches set titulaire_nom = 'Pirate' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'détection : la modification de la fiche n''échoue pas mais ne touche aucune ligne');
select throws_ok($$ insert into prix_versions (prix_id, pu_ht, motif) values ('aaaaaaaa-4444-0000-0000-000000000003', 1, 'x') $$,
  '42501', null, 'détection : ne crée pas de version de prix');
select is((select count(*)::int from categories_evenement), 6, 'détection : lit les catégories de son marché');
select throws_ok($$ insert into storage.objects (bucket_id, name) values
                     ('evenements', 'aaaaaaaa-0000-0000-0000-000000000001/x/y.pdf') $$,
  '42501', null, 'détection : n''envoie pas de pièce jointe');
reset role;

select is((select titulaire_nom from marches where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'Société X',
  'fiche du marché inchangée par l''agent de détection');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select is((select count(*)::int from categories_evenement), 5, 'détection B : ne voit que les catégories du marché B');
reset role;

-- -----------------------------------------------------------------------------
-- 4. Libellés et contrôles propres au client
-- -----------------------------------------------------------------------------
insert into fuites (id, marche_id, reference_srm, date_detection) values
  ('aaaaaaaa-1111-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', '12-34', now() - interval '2 days');

select is((select alerte_communication_srm from v_fuites where id = 'aaaaaaaa-1111-0000-0000-000000000009'), false,
  'sans jalons client : pas d''alerte de communication');
select is((select count(*)::int from v_anomalies where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000009' and anomalie = 'reference_srm_format'), 0,
  'sans masque : la référence est libre');

update marches set jalons_client = true, masque_reference = '999-999-999' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select is((select alerte_communication_srm from v_fuites where id = 'aaaaaaaa-1111-0000-0000-000000000009'), true,
  'avec jalons client : alerte de communication');
select is((select count(*)::int from v_anomalies where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000009' and anomalie = 'reference_srm_format'), 1,
  'avec masque 999-999-999 : référence « 12-34 » signalée');

-- -----------------------------------------------------------------------------
-- 5. Administrateur
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ update marches set code = 'TEST-A2' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'administrateur : change le code d''un marché');
reset role;

select * from finish();
rollback;
