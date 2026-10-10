-- =============================================================================
-- Chantier v3, S13 (X8) : envoi automatique des mouvements Dolibarr (recevoir_envoi_dolibarr).
-- Données fictives : entrepôt suivi 711, entrepôt non suivi 999.
-- Droits (service_role seulement), état par entrepôt suivi, import des seuls nouveaux ou
-- changés, sans doublon, entrepôts non suivis ignorés, envoi refusé en bloc et journalisé,
-- signes de vie et erreurs identiques regroupés, erreur de lecture signalée (origine « api » depuis
-- 20261014600000 : le script du serveur est retiré), lecture du
-- journal (administrateur, responsable ; pas l'agent de détection).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000013aa', 'admin.s13@test.local', '{"identifiant": "admin.s13", "nom_complet": "Admin S13"}'),
  ('00000000-0000-0000-0000-0000000013bb', 'detect.s13@test.local', '{"identifiant": "detect.s13", "nom_complet": "Détection S13"}'),
  ('00000000-0000-0000-0000-0000000013dd', 'resp.s13@test.local', '{"identifiant": "resp.s13", "nom_complet": "Responsable S13"}');
update profils set est_admin = true where identifiant = 'admin.s13';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000001301', 'TEST-S13', '4500001301', 'Marché S13 (entrepôt 711)', 'Client S13');
update marches set entrepot_dolibarr_id = 711 where id = 'aaaaaaaa-0000-0000-0000-000000001301';
select appliquer_modele_role('00000000-0000-0000-0000-0000000013bb', 'aaaaaaaa-0000-0000-0000-000000001301', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-0000000013dd', 'aaaaaaaa-0000-0000-0000-000000001301', 'responsable');

create temporary table t_envoi (cle text primary key, valeur jsonb);
grant select on t_envoi to service_role, authenticated;
create temporary table t_res (cle text primary key, valeur jsonb);
grant select, insert on t_res to service_role;

-- Format des mouvements reçus (dates sans fuseau : heure du Maroc ; « prix » ignoré).
insert into t_envoi values
  ('m1', '{"dolibarr_id": 91001, "date_mouvement": "2026-10-12 09:00:00", "produit_dolibarr_id": 9301, "produit_ref": "ESS01301",
           "produit_designation": "MANCHON S13 DN 25", "entrepot_id": 711, "entrepot_libelle": "DP-ESSAI S13",
           "entrepot_contrepartie_id": 1, "entrepot_contrepartie": "DEPOT ESSAI", "quantite": 6, "type_mouvement": 0,
           "libelle": "Transfert de stock 2026-10-12 09:00", "code_inventaire": "ESSAI", "annulation": false,
           "projet_id": 940, "bon_id": 7301, "unite": "U", "prix": 12.5}'),
  ('m2', '{"dolibarr_id": 91002, "date_mouvement": "2026-10-12 09:05:00", "produit_dolibarr_id": 9302, "produit_ref": "ESS01302",
           "produit_designation": "COLLIER S13", "entrepot_id": 711, "entrepot_libelle": "DP-ESSAI S13",
           "entrepot_contrepartie_id": 1, "entrepot_contrepartie": "DEPOT ESSAI", "quantite": 2, "type_mouvement": 0,
           "libelle": "Transfert de stock 2026-10-12 09:05", "code_inventaire": "ESSAI", "annulation": false,
           "projet_id": 940, "bon_id": 7301, "unite": "U"}'),
  ('m2_change', '{"dolibarr_id": 91002, "date_mouvement": "2026-10-12 09:05:00", "produit_dolibarr_id": 9302, "produit_ref": "ESS01302",
           "produit_designation": "COLLIER S13", "entrepot_id": 711, "entrepot_libelle": "DP-ESSAI S13",
           "entrepot_contrepartie_id": 1, "entrepot_contrepartie": "DEPOT ESSAI", "quantite": 3, "type_mouvement": 0,
           "libelle": "Transfert de stock 2026-10-12 09:05", "code_inventaire": "ESSAI", "annulation": false,
           "projet_id": 940, "bon_id": 7301, "unite": "U"}'),
  ('m3', '{"dolibarr_id": 91003, "date_mouvement": "2026-10-12 10:00:00", "produit_dolibarr_id": 9301, "produit_ref": "ESS01301",
           "produit_designation": "MANCHON S13 DN 25", "entrepot_id": 711, "entrepot_libelle": "DP-ESSAI S13",
           "entrepot_contrepartie_id": 1, "entrepot_contrepartie": "DEPOT ESSAI", "quantite": -1, "type_mouvement": 1,
           "libelle": "Transfert de stock 2026-10-12 10:00", "code_inventaire": "ESSAI", "annulation": false,
           "projet_id": 940, "bon_id": 7302, "unite": "U"}'),
  ('autre', '{"dolibarr_id": 91004, "date_mouvement": "2026-10-12 10:30:00", "produit_dolibarr_id": 9301, "produit_ref": "ESS01301",
           "produit_designation": "MANCHON S13 DN 25", "entrepot_id": 999, "entrepot_libelle": "AUTRE CHANTIER",
           "quantite": 4, "type_mouvement": 0, "libelle": "Transfert de stock 2026-10-12 10:30", "unite": "U"}'),
  ('sans_date', '{"dolibarr_id": 91005, "produit_dolibarr_id": 9301, "entrepot_id": 711, "quantite": 1, "type_mouvement": 0}'),
  ('sans_id', '{"date_mouvement": "2026-10-12 11:00:00", "produit_dolibarr_id": 9301, "entrepot_id": 711, "quantite": 1, "type_mouvement": 0}');

-- -----------------------------------------------------------------------------
-- 1. Structure et privilèges
-- -----------------------------------------------------------------------------
select has_table('public', 'envois_dolibarr', 'journal des envois automatiques');
select ok((select relrowsecurity from pg_class where oid = 'public.envois_dolibarr'::regclass), 'envois_dolibarr : RLS activée');
select ok(has_table_privilege('authenticated', 'public.envois_dolibarr', 'select')
          and not has_table_privilege('authenticated', 'public.envois_dolibarr', 'insert')
          and not has_table_privilege('authenticated', 'public.envois_dolibarr', 'update')
          and not has_table_privilege('authenticated', 'public.envois_dolibarr', 'delete')
          and not has_table_privilege('anon', 'public.envois_dolibarr', 'select'),
  'journal : lecture seule pour les comptes, rien pour anon');
select ok(has_function_privilege('service_role', 'public.recevoir_envoi_dolibarr(jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'public.recevoir_envoi_dolibarr(jsonb)', 'execute')
          and not has_function_privilege('anon', 'public.recevoir_envoi_dolibarr(jsonb)', 'execute'),
  'recevoir_envoi_dolibarr : service_role seulement');
select ok(not has_function_privilege('authenticated', 'private.etat_entrepots_dolibarr()', 'execute')
          and not has_function_privilege('authenticated',
            'private.journaliser_envoi_dolibarr(text, text, text, text, text, integer, integer, integer, integer, bigint, timestamptz, bigint)', 'execute'),
  'fonctions internes non appelables par un compte');
select is_empty($$ select column_name from information_schema.columns
                    where table_schema = 'public' and table_name = 'envois_dolibarr'
                      and column_name ~ 'prix|pmp|valeur|montant|cout' $$,
  'journal : aucune colonne de prix');

-- Un compte connecté (même administrateur) n'entre pas : privilège retiré, et garde dans la fonction.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000013aa", "role": "authenticated"}', true);
select throws_ok($$ select recevoir_envoi_dolibarr('{"action": "etat"}') $$, '42501', null,
  'administrateur connecté : refusé');
reset role;

-- -----------------------------------------------------------------------------
-- 2. Service_role : état, envoi, sans doublon
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role service_role;

select is((select e from jsonb_array_elements(recevoir_envoi_dolibarr('{"action": "etat"}') -> 'entrepots') e where (e ->> 'id')::int = 711),
  '{"id": 711, "dernier_id": null, "mouvements": 0}'::jsonb,
  'état : entrepôt suivi 711, rien reçu');
select ok(not exists (select 1 from jsonb_array_elements(recevoir_envoi_dolibarr('{"action": "etat"}') -> 'entrepots') e
                       where (e ->> 'id')::int = 999),
  'état : un entrepôt qu''aucun marché ne suit n''est pas demandé');

insert into t_res select 'envoi1', recevoir_envoi_dolibarr(jsonb_build_object(
  'action', 'envoyer', 'script', jsonb_build_object('version', '1.0', 'poste', 'SERVEUR-ESSAI'),
  'mouvements', jsonb_build_array((select valeur from t_envoi where cle = 'm1'), (select valeur from t_envoi where cle = 'm2'),
                                  (select valeur from t_envoi where cle = 'autre'))));
select is((select valeur - 'entrepots' from t_res where cle = 'envoi1'),
  '{"statut": "recu", "mouvements": 3, "nouveaux": 2, "modifies": 0, "ignores": 1}'::jsonb,
  'premier envoi : 2 nouveaux, 1 ignoré (entrepôt non suivi)');
select is((select e from jsonb_array_elements((select valeur -> 'entrepots' from t_res where cle = 'envoi1')) e where (e ->> 'id')::int = 711),
  '{"id": 711, "dernier_id": 91002, "mouvements": 2}'::jsonb,
  'réponse : dernier rowid reçu pour 711');
reset role;

select results_eq($$ select dolibarr_id, quantite from mouvements_dolibarr where dolibarr_id between 91001 and 91005 order by 1 $$,
  $$ values (91001::bigint, 6::numeric), (91002, 2) $$,
  'mouvements importés ; entrepôt 999 non importé');
select ok((select importe_par is null from imports_mouvements_dolibarr order by id desc limit 1),
  'import tracé sans auteur (serveur)');
select results_eq($$ select statut, origine, mouvements, nouveaux, modifies, ignores, dernier_dolibarr_id, poste, version_script, appels,
                            import_id = (select max(id) from imports_mouvements_dolibarr)
                       from envois_dolibarr order by id $$,
  $$ values ('recu', 'fonction', 3, 2, 0, 1, 91002::bigint, 'SERVEUR-ESSAI', '1.0', 1, true) $$,
  'journal : une ligne « reçu » avec ses chiffres et l''import');

-- Même envoi (le script renvoie toujours les derniers jours) : rien n'est importé, signe de vie regroupé.
select set_config('request.jwt.claims', '', true);
set local role service_role;
insert into t_res select 'envoi2', recevoir_envoi_dolibarr(jsonb_build_object(
  'action', 'envoyer', 'script', jsonb_build_object('version', '1.0', 'poste', 'SERVEUR-ESSAI'),
  'mouvements', jsonb_build_array((select valeur from t_envoi where cle = 'm1'), (select valeur from t_envoi where cle = 'm2'))));
insert into t_res select 'envoi3', recevoir_envoi_dolibarr(jsonb_build_object(
  'action', 'envoyer', 'script', jsonb_build_object('version', '1.0', 'poste', 'SERVEUR-ESSAI'),
  'mouvements', jsonb_build_array((select valeur from t_envoi where cle = 'm1'), (select valeur from t_envoi where cle = 'm2'))));
insert into t_res select 'vide', recevoir_envoi_dolibarr('{"action": "envoyer", "mouvements": []}');
reset role;
select is((select valeur ->> 'statut' from t_res where cle = 'envoi2'), 'rien', 'renvoi identique : statut « rien »');
select is((select count(*)::int from imports_mouvements_dolibarr where importe_par is null), 1,
  'renvoi identique : aucun nouvel import');
select results_eq($$ select statut, appels, mouvements from envois_dolibarr order by id $$,
  $$ values ('recu', 1, 3), ('rien', 3, 0) $$,
  'signes de vie regroupés (deux renvois identiques et un envoi vide : appels = 3, dernier nombre reçu)');
select ok((select dernier_le >= recu_le from envois_dolibarr where statut = 'rien' and appels = 3), 'signe de vie : dernier_le tenu');

-- Un mouvement changé et un nouveau : seuls ceux-là partent.
select set_config('request.jwt.claims', '', true);
set local role service_role;
insert into t_res select 'envoi4', recevoir_envoi_dolibarr(jsonb_build_object(
  'action', 'envoyer',
  'mouvements', jsonb_build_array((select valeur from t_envoi where cle = 'm1'), (select valeur from t_envoi where cle = 'm2_change'),
                                  (select valeur from t_envoi where cle = 'm3'))));
reset role;
select is((select valeur - 'entrepots' from t_res where cle = 'envoi4'),
  '{"statut": "recu", "mouvements": 3, "nouveaux": 1, "modifies": 1, "ignores": 0}'::jsonb,
  'changement + nouveau : 1 nouveau, 1 modifié');
select is((select lignes_lues from imports_mouvements_dolibarr order by id desc limit 1), 2,
  'seuls les mouvements nouveaux ou changés sont passés à l''import');
select is((select quantite from mouvements_dolibarr where dolibarr_id = 91002), 3::numeric, 'quantité mise à jour');
select is((select count(*)::int from mouvements_dolibarr where dolibarr_id between 91001 and 91003), 3, 'aucun doublon');

-- -----------------------------------------------------------------------------
-- 3. Erreurs : envoi refusé en bloc, journalisé, regroupé
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role service_role;
insert into t_res select 'err1', recevoir_envoi_dolibarr(jsonb_build_object(
  'action', 'envoyer', 'mouvements', jsonb_build_array(
    jsonb_set((select valeur from t_envoi where cle = 'm3'), '{dolibarr_id}', '91006'), (select valeur from t_envoi where cle = 'sans_date'))));
insert into t_res select 'err2', recevoir_envoi_dolibarr(jsonb_build_object(
  'action', 'envoyer', 'mouvements', jsonb_build_array(
    jsonb_set((select valeur from t_envoi where cle = 'm3'), '{dolibarr_id}', '91006'), (select valeur from t_envoi where cle = 'sans_date'))));
insert into t_res select 'err_id', recevoir_envoi_dolibarr(jsonb_build_object(
  'action', 'envoyer', 'mouvements', jsonb_build_array((select valeur from t_envoi where cle = 'sans_id'))));
insert into t_res select 'trop', recevoir_envoi_dolibarr(jsonb_build_object(
  'action', 'envoyer', 'mouvements', (select jsonb_agg((select valeur from t_envoi where cle = 'm1')) from generate_series(1, 5001))));
insert into t_res select 'script', recevoir_envoi_dolibarr(
  '{"action": "erreur", "message": "Lecture de Dolibarr impossible (connexion à la base, code 2002)", "script": {"version": "1.0", "poste": "SERVEUR-ESSAI"}}');
select throws_ok($$ select recevoir_envoi_dolibarr('{"action": "supprimer"}') $$, '22023', null, 'action inconnue : refusée');
select throws_ok($$ select recevoir_envoi_dolibarr('[]') $$, '22023', null, 'envoi qui n''est pas un objet : refusé');
reset role;

select is((select valeur ->> 'statut' from t_res where cle = 'err1'), 'erreur', 'mouvement sans date : envoi refusé');
select is((select valeur ->> 'code' from t_res where cle = 'err1'), '22023', 'code d''erreur transmis au script');
select is((select count(*)::int from mouvements_dolibarr where dolibarr_id = 91006), 0,
  'envoi refusé en bloc : le mouvement valide du même envoi n''est pas importé');
select is((select valeur ->> 'statut' from t_res where cle = 'err_id'), 'erreur', 'mouvement sans identifiant : refusé');
select ok((select valeur ->> 'erreur' from t_res where cle = 'trop') ~ '5 000', 'plus de 5 000 mouvements : refusé');
select results_eq($$ select statut, origine, appels, message ~ 'invalide|valide' from envois_dolibarr where statut = 'erreur' and origine = 'fonction' order by id limit 1 $$,
  $$ values ('erreur', 'fonction', 2, true) $$,
  'erreur identique répétée : une ligne, appels = 2');
select results_eq($$ select origine, message, poste from envois_dolibarr order by id desc limit 1 $$,
  $$ values ('api', 'Lecture de Dolibarr impossible (connexion à la base, code 2002)', 'SERVEUR-ESSAI') $$,
  'erreur signalée sans origine : journalisée comme erreur de lecture de l''API');

-- -----------------------------------------------------------------------------
-- 4. Lecture du journal
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000013dd", "role": "authenticated"}', true);
select ok((select count(*) from envois_dolibarr) >= 6, 'responsable (quantités / lire) : lit le journal');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000013bb", "role": "authenticated"}', true);
select is((select count(*)::int from envois_dolibarr), 0, 'agent de détection : ne lit pas le journal');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000013aa", "role": "authenticated"}', true);
select ok((select count(*) from envois_dolibarr) >= 6, 'administrateur : lit le journal');
reset role;

select * from finish();
rollback;
