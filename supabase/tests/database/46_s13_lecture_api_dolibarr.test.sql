-- =============================================================================
-- Chantier v3, S13 bis (X8) : lecture de l'API REST de Dolibarr (20261014700000_lecture_api_dolibarr.sql).
-- Données fictives : entrepôt suivi 712, projet de l'entrepôt 41.
-- Clé d'appel de la planification (privée, vérifiée par la base), bouton « Synchroniser maintenant » (droits),
-- verrou d'une lecture à la fois, erreur de lecture journalisée en origine « api », n° de bon et projet absents de
-- l'API gardés (déjà reçus par le CSV) ou projet de l'entrepôt, dates avec fuseau, prix ignoré.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000014aa', 'admin.s13b@test.local', '{"identifiant": "admin.s13b", "nom_complet": "Admin S13b"}'),
  ('00000000-0000-0000-0000-0000000014bb', 'detect.s13b@test.local', '{"identifiant": "detect.s13b", "nom_complet": "Détection S13b"}'),
  ('00000000-0000-0000-0000-0000000014dd', 'resp.s13b@test.local', '{"identifiant": "resp.s13b", "nom_complet": "Responsable S13b"}');
update profils set est_admin = true where identifiant = 'admin.s13b';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000001401', 'TEST-S13B', '4500001401', 'Marché S13b (entrepôt 712)', 'Client S13b');
update marches set entrepot_dolibarr_id = 712 where id = 'aaaaaaaa-0000-0000-0000-000000001401';
select appliquer_modele_role('00000000-0000-0000-0000-0000000014bb', 'aaaaaaaa-0000-0000-0000-000000001401', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-0000000014dd', 'aaaaaaaa-0000-0000-0000-000000001401', 'responsable');

create temporary table t_res (cle text primary key, valeur jsonb);
grant select, insert on t_res to service_role;

-- Mouvements déjà reçus par le CSV : bon 7401 et projet 30 (projet du bon), date sans fuseau (heure du Maroc).
select importer_mouvements_dolibarr('[
  {"dolibarr_id": 92001, "date_mouvement": "2026-10-12 13:05:30", "produit_dolibarr_id": 9401, "produit_ref": "ESS01401",
   "produit_designation": "MANCHON S13B", "entrepot_id": 712, "entrepot_libelle": "DP-ESSAI S13B", "entrepot_contrepartie": null,
   "quantite": 3, "type_mouvement": 0, "libelle": "Transfert de stock 2026-10-12 13:05", "code_inventaire": "OUJDA",
   "annulation": false, "projet_id": 30, "bon_id": 7401, "unite": "U"}]'::jsonb);

-- -----------------------------------------------------------------------------
-- 1. Structure et privilèges
-- -----------------------------------------------------------------------------
select has_table('private', 'synchro_dolibarr', 'adresse, clé d''appel et verrou de la lecture planifiée');
select ok((select relrowsecurity from pg_class where oid = 'private.synchro_dolibarr'::regclass), 'synchro_dolibarr : RLS activée');
select ok(not has_table_privilege('authenticated', 'private.synchro_dolibarr', 'select')
          and not has_table_privilege('anon', 'private.synchro_dolibarr', 'select')
          and not has_table_privilege('service_role', 'private.synchro_dolibarr', 'select'),
  'clé d''appel illisible par l''API (aucun droit sur la table)');
select is((select count(*)::int from private.synchro_dolibarr), 1, 'une seule ligne');
select ok((select length(cle) >= 64 and en_cours_depuis is null from private.synchro_dolibarr), 'clé tirée au hasard, aucun verrou');
select ok(has_function_privilege('service_role', 'public.verifier_cle_synchro_dolibarr(text)', 'execute')
          and not has_function_privilege('authenticated', 'public.verifier_cle_synchro_dolibarr(text)', 'execute')
          and not has_function_privilege('anon', 'public.verifier_cle_synchro_dolibarr(text)', 'execute'),
  'verifier_cle_synchro_dolibarr : service_role seulement');
select ok(has_function_privilege('authenticated', 'public.peut_synchroniser_dolibarr()', 'execute')
          and not has_function_privilege('anon', 'public.peut_synchroniser_dolibarr()', 'execute'),
  'peut_synchroniser_dolibarr : comptes connectés seulement');
select ok(not has_function_privilege('authenticated', 'private.declencher_synchro_dolibarr()', 'execute')
          and not has_function_privilege('service_role', 'private.declencher_synchro_dolibarr()', 'execute'),
  'declencher_synchro_dolibarr : appelée par pg_cron seulement');

-- -----------------------------------------------------------------------------
-- 2. Clé d'appel et droits du bouton
-- -----------------------------------------------------------------------------
create temporary table t_cle as select cle from private.synchro_dolibarr;
grant select on t_cle to service_role;
set local role service_role;
select ok(verifier_cle_synchro_dolibarr((select cle from t_cle)), 'clé de la base : acceptée');
select ok(not verifier_cle_synchro_dolibarr((select cle || 'x' from t_cle)) and not verifier_cle_synchro_dolibarr('')
          and not verifier_cle_synchro_dolibarr(null), 'autre clé, clé vide ou nulle : refusées');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000014aa", "role": "authenticated"}', true);
select ok(peut_synchroniser_dolibarr(), 'administrateur : peut synchroniser');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000014dd", "role": "authenticated"}', true);
select ok(peut_synchroniser_dolibarr(), 'responsable (quantités / lire) : peut synchroniser');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000014bb", "role": "authenticated"}', true);
select ok(not peut_synchroniser_dolibarr(), 'agent de détection : ne peut pas');
select throws_ok($$ select recevoir_envoi_dolibarr('{"action": "debut"}') $$, '42501', null, 'compte connecté : verrou refusé');
reset role;

-- -----------------------------------------------------------------------------
-- 3. Verrou : une lecture à la fois
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role service_role;
insert into t_res select 'debut1', recevoir_envoi_dolibarr('{"action": "debut", "script": {"version": "api-1.0", "poste": "lecture planifiée"}}');
insert into t_res select 'debut2', recevoir_envoi_dolibarr('{"action": "debut", "script": {"version": "api-1.0", "poste": "lecture demandée par resp.s13b"}}');
reset role;
select is((select valeur -> 'occupe' from t_res where cle = 'debut1'), 'false'::jsonb, 'première lecture : verrou pris');
select is((select e from jsonb_array_elements((select valeur -> 'entrepots' from t_res where cle = 'debut1')) e where (e ->> 'id')::int = 712),
  '{"id": 712, "dernier_id": 92001, "mouvements": 1}'::jsonb, 'verrou pris : état des entrepôts suivis rendu');
select is((select valeur ->> 'par' from t_res where cle = 'debut2'), 'lecture planifiée', 'seconde lecture : occupée, avec qui la fait');

update private.synchro_dolibarr set en_cours_depuis = now() - interval '4 minutes' where id;
set local role service_role;
insert into t_res select 'debut3', recevoir_envoi_dolibarr('{"action": "debut", "script": {"poste": "lecture planifiée"}}');
insert into t_res select 'fin', recevoir_envoi_dolibarr('{"action": "fin"}');
insert into t_res select 'debut4', recevoir_envoi_dolibarr('{"action": "debut", "script": {"poste": "lecture planifiée"}}');
insert into t_res select 'fin2', recevoir_envoi_dolibarr('{"action": "fin"}');
reset role;
select is((select valeur -> 'occupe' from t_res where cle = 'debut3'), 'false'::jsonb, 'verrou de plus de 3 minutes : périmé, repris');
select is((select valeur -> 'occupe' from t_res where cle = 'debut4'), 'false'::jsonb, 'après « fin » : verrou libre');
select ok((select en_cours_depuis is null and en_cours_par is null from private.synchro_dolibarr), 'verrou rendu');

-- -----------------------------------------------------------------------------
-- 4. Mouvements lus dans l'API : bon et projet absents, date avec fuseau, prix ignoré
-- -----------------------------------------------------------------------------
set local role service_role;
insert into t_res select 'api1', recevoir_envoi_dolibarr('{"action": "envoyer", "script": {"version": "api-1.0", "poste": "lecture planifiée"},
  "mouvements": [
    {"dolibarr_id": 92001, "date_mouvement": "2026-10-12T11:05:30.000Z", "produit_dolibarr_id": 9401, "produit_ref": "ESS01401",
     "produit_designation": "MANCHON S13B", "entrepot_id": 712, "entrepot_libelle": "DP-ESSAI S13B", "entrepot_contrepartie_id": 1,
     "entrepot_contrepartie": "DEPOT ESSAI", "quantite": 3, "type_mouvement": 0, "libelle": "Transfert de stock 2026-10-12 13:05",
     "code_inventaire": "OUJDA", "annulation": false, "unite": "U", "projet_entrepot_id": 41, "price": 12.5},
    {"dolibarr_id": 92002, "date_mouvement": "2026-10-12T12:00:00.000Z", "produit_dolibarr_id": 9402, "produit_ref": "ESS01402",
     "produit_designation": "COLLIER S13B", "entrepot_id": 712, "entrepot_libelle": "DP-ESSAI S13B", "entrepot_contrepartie_id": null,
     "entrepot_contrepartie": null, "quantite": -40, "type_mouvement": 1, "libelle": "Consommation pour le projet S13B",
     "code_inventaire": "CONSO", "annulation": false, "unite": "U", "projet_entrepot_id": 41},
    {"dolibarr_id": 92003, "date_mouvement": "2026-10-12T12:30:00.000Z", "produit_dolibarr_id": 9402, "entrepot_id": 712,
     "quantite": 1, "type_mouvement": 0, "projet_id": 55, "bon_id": 7402, "annulation": false}]}');
reset role;

select is((select valeur - 'entrepots' from t_res where cle = 'api1'),
  '{"statut": "recu", "mouvements": 3, "nouveaux": 2, "modifies": 1, "ignores": 0}'::jsonb,
  'lecture de l''API : 2 nouveaux, 1 mis à jour (date et contrepartie)');
select results_eq($$ select bon_id, projet_id, entrepot_contrepartie_id from mouvements_dolibarr where dolibarr_id = 92001 $$,
  $$ values (7401, 30, 1) $$,
  'mouvement déjà reçu : n° de bon et projet du CSV gardés, contrepartie ajoutée');
select is((select date_mouvement from mouvements_dolibarr where dolibarr_id = 92001), '2026-10-12 11:05:30+00'::timestamptz,
  'date avec fuseau (instant vrai) remplace l''heure brute du CSV');
select results_eq($$ select bon_id, projet_id from mouvements_dolibarr where dolibarr_id = 92002 $$,
  $$ values (null::integer, 41) $$,
  'nouveau mouvement sans bon ni projet : projet de l''entrepôt');
select results_eq($$ select bon_id, projet_id from mouvements_dolibarr where dolibarr_id = 92003 $$,
  $$ values (7402, 55) $$,
  'clés présentes : elles font foi');

-- Renvoi identique (recouvrement des 3 derniers jours) : rien de neuf.
set local role service_role;
insert into t_res select 'api2', recevoir_envoi_dolibarr('{"action": "envoyer", "mouvements": [
    {"dolibarr_id": 92001, "date_mouvement": "2026-10-12T11:05:30.000Z", "produit_dolibarr_id": 9401, "produit_ref": "ESS01401",
     "produit_designation": "MANCHON S13B", "entrepot_id": 712, "entrepot_libelle": "DP-ESSAI S13B", "entrepot_contrepartie_id": 1,
     "entrepot_contrepartie": "DEPOT ESSAI", "quantite": 3, "type_mouvement": 0, "libelle": "Transfert de stock 2026-10-12 13:05",
     "code_inventaire": "OUJDA", "annulation": false, "unite": "U", "projet_entrepot_id": 41}]}');
insert into t_res select 'err_api', recevoir_envoi_dolibarr('{"action": "erreur", "origine": "api",
  "message": "Dolibarr injoignable : serveur éteint, tunnel Cloudflare arrêté ou coupure Internet", "script": {"version": "api-1.0", "poste": "lecture planifiée"}}');
reset role;
select is((select valeur ->> 'statut' from t_res where cle = 'api2'), 'rien', 'renvoi identique : rien de neuf, aucun écrasement du bon');
select results_eq($$ select statut, origine, poste, version_script from envois_dolibarr order by id desc limit 1 $$,
  $$ values ('erreur', 'api', 'lecture planifiée', 'api-1.0') $$,
  'erreur de lecture de l''API : journalisée en origine « api »');

select * from finish();
rollback;
