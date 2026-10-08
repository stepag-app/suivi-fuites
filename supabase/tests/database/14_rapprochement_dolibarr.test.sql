-- =============================================================================
-- Chantier v2, X3 (lot P4) : rapprochement posé / transféré avec les mouvements de stock Dolibarr
-- (données fictives : famille « ESS », entrepôts 701 et 702).
-- Droits (admin importe ; responsable lit ; chef, détection et compte sans droit non ; entrepôt
-- réservé à l'admin ; isolation entre marchés par l'entrepôt), import idempotent et mis à jour,
-- aucun prix, annulations neutralisées, retours déduits, consommations comptées, posé depuis
-- v_pieces_reelles (pièce remplacée ou retirée exclue, réparation supprimée exclue), période et
-- cumul, seuil réglable, copie du marché.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(54);

-- a = admin, b = détection, c = chef de réparation, d = responsable (marché P4), f = sans droit
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',      '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'detect.p4@test.local',  '{"identifiant": "detect.p4", "nom_complet": "Détection P4"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chef.p4@test.local',    '{"identifiant": "chef.p4", "nom_complet": "Chef P4"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.p4@test.local',    '{"identifiant": "resp.p4", "nom_complet": "Responsable P4"}'),
  ('00000000-0000-0000-0000-00000000000f', 'sans.droit@test.local', '{"identifiant": "sans.droit", "nom_complet": "Sans droit"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000011', 'TEST-P4',  '4500000011', 'Marché P4 (entrepôt 701)', 'Client P4'),
  ('aaaaaaaa-0000-0000-0000-000000000012', 'TEST-P4B', '4500000012', 'Marché P4 bis (entrepôt 702)', 'Client P4');
update marches set entrepot_dolibarr_id = 702 where id = 'aaaaaaaa-0000-0000-0000-000000000012';
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000011', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000011', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000011', 'responsable');

-- Articles Dolibarr fictifs, activés (lot T)
insert into produits_dolibarr (dolibarr_id, ref, designation, unite, famille, utilisable) values
  (9101, 'ESS00101', 'MANCHON ESSAI DN 25', 'U', 'ESS', true),
  (9102, 'ESS00102', 'COLLIER ESSAI 63 X 20', 'U', 'ESS', true),
  (9103, 'ESS00103', 'TUBE ESSAI DN 40', 'm', 'ESS', true),
  (9104, 'ESS00104', 'JOINT ESSAI', 'U', 'ESS', true);

insert into fuites (id, marche_id, date_detection)
select ('aaaaaaaa-1111-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'aaaaaaaa-0000-0000-0000-000000000011',
       '2026-09-10 08:00+01'::timestamptz
  from generate_series(1, 3) n;

create temporary table t_ids (cle text primary key, id uuid);
grant select, insert on t_ids to authenticated;

-- Fichier fictif, déjà réduit aux colonnes utiles par le navigateur (dates à l'heure du Maroc) ;
-- la première ligne contient en plus un prix et une valeur, qui ne doivent jamais être enregistrés.
create temporary table t_json (cle text primary key, valeur jsonb);
grant select on t_json to authenticated;
insert into t_json values
  ('import1', '[
     {"dolibarr_id": 80001, "date_mouvement": "2026-09-30 13:05:00", "produit_dolibarr_id": 9101, "produit_ref": "ESS00101",
      "produit_designation": "MANCHON ESSAI DN 25", "entrepot_id": 701, "entrepot_libelle": "DP-ESSAI",
      "entrepot_contrepartie": "DEPOT ESSAI", "quantite": 10, "type_mouvement": 0,
      "libelle": "Transfert de stock 2026-09-30 13:05", "code_inventaire": "ESSAI", "annulation": false,
      "projet_id": 900, "bon_id": 7001, "unite": "U", "prix": 12.5, "valeur": 125},
     {"dolibarr_id": 80002, "date_mouvement": "2026-09-30 13:27:00", "produit_dolibarr_id": 9103, "produit_ref": "ESS00103",
      "produit_designation": "TUBE ESSAI DN 40", "entrepot_id": 701, "entrepot_libelle": "DP-ESSAI",
      "quantite": 4, "type_mouvement": 0, "libelle": "Transfert de stock 2026-09-30 13:26", "code_inventaire": "ESSAI",
      "annulation": false, "projet_id": 900, "unite": "m"},
     {"dolibarr_id": 80003, "date_mouvement": "2026-09-30 13:27:30", "produit_dolibarr_id": 9103, "produit_ref": "ESS00103",
      "produit_designation": "TUBE ESSAI DN 40", "entrepot_id": 701, "entrepot_libelle": "DP-ESSAI",
      "quantite": -4, "type_mouvement": 1, "libelle": "Transfert de stock 2026-09-30 13:27 CANCEL",
      "code_inventaire": "ESSAI CANCEL", "projet_id": 900, "unite": "m"},
     {"dolibarr_id": 80004, "date_mouvement": "2026-09-30 23:30:00", "produit_dolibarr_id": 9102, "produit_ref": "ESS00102",
      "produit_designation": "COLLIER ESSAI 63 X 20", "entrepot_id": 701, "entrepot_libelle": "DP-ESSAI",
      "entrepot_contrepartie": "DEPOT ESSAI", "quantite": 5, "type_mouvement": 0,
      "libelle": "Transfert de stock 2026-09-30 23:30", "code_inventaire": "ESSAI", "annulation": false,
      "projet_id": 900, "bon_id": 7002, "unite": "U"},
     {"dolibarr_id": 80005, "date_mouvement": "2026-10-01 00:30:00", "produit_dolibarr_id": 9101, "produit_ref": "ESS00101",
      "produit_designation": "MANCHON ESSAI DN 25", "entrepot_id": 701, "entrepot_libelle": "DP-ESSAI",
      "entrepot_contrepartie": "DEPOT ESSAI", "quantite": 6, "type_mouvement": 0,
      "libelle": "Transfert de stock 2026-10-01 00:30", "code_inventaire": "ESSAI", "annulation": false,
      "projet_id": 900, "bon_id": 7003, "unite": "U"},
     {"dolibarr_id": 80006, "date_mouvement": "2026-10-01 13:24:00", "produit_dolibarr_id": 9101, "produit_ref": "ESS00101",
      "produit_designation": "MANCHON ESSAI DN 25", "entrepot_id": 701, "entrepot_libelle": "DP-ESSAI",
      "entrepot_contrepartie": "DEPOT ESSAI", "quantite": -2, "type_mouvement": 1,
      "libelle": "Transfert de stock 2026-10-01 13:24", "code_inventaire": "ESSAI", "annulation": false,
      "projet_id": 900, "bon_id": 7004, "unite": "U"},
     {"dolibarr_id": 80007, "date_mouvement": "2026-10-05 10:00:00", "produit_dolibarr_id": 9102, "produit_ref": "ESS00102",
      "produit_designation": "COLLIER ESSAI 63 X 20", "entrepot_id": 701, "entrepot_libelle": "DP-ESSAI",
      "quantite": -3, "type_mouvement": 1, "libelle": "Consommation pour le projet ESSAI",
      "code_inventaire": "CONSOESSAI261005100000", "annulation": false, "projet_id": 900, "unite": "U"},
     {"dolibarr_id": 80008, "date_mouvement": "2026-10-05 10:44:00", "produit_dolibarr_id": 9999, "produit_ref": "CON00999",
      "produit_designation": "GILET ESSAI", "entrepot_id": 701, "entrepot_libelle": "DP-ESSAI",
      "entrepot_contrepartie": "DEPOT ESSAI", "quantite": 7, "type_mouvement": 0,
      "libelle": "Transfert de stock 2026-10-05 10:44", "code_inventaire": "ESSAI", "annulation": false,
      "projet_id": 900, "bon_id": 7005, "unite": "U"},
     {"dolibarr_id": 80009, "date_mouvement": "2026-10-02 17:46:00", "produit_dolibarr_id": 9101, "produit_ref": "ESS00101",
      "produit_designation": "MANCHON ESSAI DN 25", "entrepot_id": 702, "entrepot_libelle": "DP-AUTRE",
      "entrepot_contrepartie": "DEPOT ESSAI", "quantite": 3, "type_mouvement": 0,
      "libelle": "Transfert de stock 2026-10-02 17:46", "code_inventaire": "ESSAI", "annulation": false,
      "projet_id": 901, "bon_id": 7006, "unite": "U"},
     {"dolibarr_id": 80010, "date_mouvement": "2026-10-03T09:00:00+01:00", "produit_dolibarr_id": 9101, "produit_ref": "ESS00101",
      "produit_designation": "MANCHON ESSAI DN 25", "entrepot_id": 702, "entrepot_libelle": "DP-AUTRE",
      "entrepot_contrepartie": "DEPOT ESSAI", "quantite": 1, "type_mouvement": 0,
      "libelle": "Transfert de stock 2026-10-03 09:00", "code_inventaire": "ESSAI", "annulation": false,
      "projet_id": 901, "bon_id": 7007, "unite": "U"}
   ]'),
  ('import2', '[
     {"dolibarr_id": 80008, "date_mouvement": "2026-10-05 10:44:00", "produit_dolibarr_id": 9999, "produit_ref": "CON00999",
      "produit_designation": "GILET ESSAI", "entrepot_id": 701, "entrepot_libelle": "DP-ESSAI",
      "entrepot_contrepartie": "DEPOT ESSAI", "quantite": 8, "type_mouvement": 0,
      "libelle": "Transfert de stock 2026-10-05 10:44", "code_inventaire": "ESSAI", "annulation": false,
      "projet_id": 900, "bon_id": 7005, "unite": "U"}
   ]'),
  ('invalide', '[{"dolibarr_id": 80011, "date_mouvement": "2026-10-05 10:44:00", "produit_dolibarr_id": 9101, "quantite": 1, "type_mouvement": 0}]');

-- -----------------------------------------------------------------------------
-- 1. Structure : RLS, aucun droit pour anon, lecture seule par l'API, aucun prix
-- -----------------------------------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class
            where oid in ('public.mouvements_dolibarr'::regclass, 'public.imports_mouvements_dolibarr'::regclass)),
  'RLS activée sur mouvements_dolibarr et imports_mouvements_dolibarr');
select ok(not has_table_privilege('anon', 'public.mouvements_dolibarr', 'select')
          and not has_table_privilege('anon', 'public.imports_mouvements_dolibarr', 'select')
          and not has_function_privilege('anon', 'public.rapprochement_fournitures(uuid, date, date)', 'execute'),
  'anon : aucun accès aux mouvements, au journal ni au rapprochement');
select ok(has_table_privilege('authenticated', 'public.mouvements_dolibarr', 'select')
          and not has_table_privilege('authenticated', 'public.mouvements_dolibarr', 'insert')
          and not has_table_privilege('authenticated', 'public.mouvements_dolibarr', 'update')
          and not has_table_privilege('authenticated', 'public.mouvements_dolibarr', 'delete')
          and not has_table_privilege('authenticated', 'public.imports_mouvements_dolibarr', 'insert')
          and has_function_privilege('authenticated', 'public.rapprochement_fournitures(uuid, date, date)', 'execute'),
  'authenticated : lecture seule, écriture par la fonction d''import uniquement');
select ok(not has_function_privilege('anon', 'public.importer_mouvements_dolibarr(jsonb)', 'execute')
          and has_function_privilege('authenticated', 'public.importer_mouvements_dolibarr(jsonb)', 'execute')
          and has_function_privilege('service_role', 'public.importer_mouvements_dolibarr(jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'private.lire_mouvements_dolibarr(jsonb)', 'execute'),
  'fonctions : rien pour anon, import ouvert au serveur (X8), lecture du fichier interne non appelable');
select columns_are('public', 'mouvements_dolibarr',
  array['dolibarr_id', 'date_mouvement', 'produit_dolibarr_id', 'produit_ref', 'produit_designation', 'entrepot_id',
        'entrepot_libelle', 'entrepot_contrepartie_id', 'entrepot_contrepartie', 'quantite', 'type_mouvement', 'libelle',
        'code_inventaire', 'annulation', 'projet_id', 'bon_id', 'unite', 'importe_le', 'modifie_le'],
  'mouvements_dolibarr : aucune colonne de prix, de valeur ni de PMP');
select is_empty($$ select p.parameter_name from information_schema.parameters p
                    join information_schema.routines r on r.specific_name = p.specific_name
                   where r.routine_schema = 'public' and r.routine_name = 'rapprochement_fournitures'
                     and p.parameter_name ~ 'prix|pmp|valeur|montant|cout' $$,
  'rapprochement : aucune colonne de prix, PMP, valeur ou montant');
select is((select entrepot_dolibarr_id from marches where numero = '4500004453'), 76,
  'marché 4500004453 : entrepôt 76 du chantier');

-- -----------------------------------------------------------------------------
-- 2. Réglages du marché : seuil par le responsable, entrepôt par l'administrateur seulement
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ update marches set seuil_ecart_fournitures_pct = 10 where id = 'aaaaaaaa-0000-0000-0000-000000000011' $$,
  'responsable : règle le seuil d''alerte');
select throws_ok($$ update marches set entrepot_dolibarr_id = 701 where id = 'aaaaaaaa-0000-0000-0000-000000000011' $$,
  '42501', null, 'responsable : ne choisit pas l''entrepôt du chantier');
select throws_ok($$ update marches set seuil_ecart_fournitures_pct = -1 where id = 'aaaaaaaa-0000-0000-0000-000000000011' $$,
  '23514', null, 'seuil négatif refusé');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ update marches set entrepot_dolibarr_id = 701 where id = 'aaaaaaaa-0000-0000-0000-000000000011' $$,
  'administrateur : renseigne l''entrepôt du chantier');
select throws_ok($$ update marches set entrepot_dolibarr_id = 0 where id = 'aaaaaaaa-0000-0000-0000-000000000011' $$,
  '23514', null, 'entrepôt 0 refusé');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select lives_ok($$ update marches set seuil_ecart_fournitures_pct = 99 where id = 'aaaaaaaa-0000-0000-0000-000000000011' $$,
  'chef : tentative de modification (aucune ligne modifiable)');
reset role;
select results_eq($$ select entrepot_dolibarr_id, seuil_ecart_fournitures_pct from marches where id = 'aaaaaaaa-0000-0000-0000-000000000011' $$,
  $$ values (701, 10.00::numeric) $$, 'réglages : entrepôt de l''administrateur, seuil du responsable');

-- -----------------------------------------------------------------------------
-- 3. Import : administrateur seulement, sans prix, idempotent, mis à jour
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select importer_mouvements_dolibarr((select valeur from t_json where cle = 'import1')) $$,
  '42501', null, 'responsable : n''importe pas les mouvements');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select throws_ok($$ select importer_mouvements_dolibarr((select valeur from t_json where cle = 'import1')) $$,
  '42501', null, 'chef : n''importe pas les mouvements');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select throws_ok($$ insert into mouvements_dolibarr (dolibarr_id, date_mouvement, produit_dolibarr_id, entrepot_id, quantite, type_mouvement)
                     values (1, now(), 9101, 701, 1, 0) $$,
  '42501', null, 'administrateur : n''écrit pas directement dans mouvements_dolibarr');
select is((select importer_mouvements_dolibarr((select valeur from t_json where cle = 'import1')) - 'date_min' - 'date_max'),
  '{"lignes_lues": 10, "nouveaux": 10, "modifies": 0, "inchanges": 0, "annulations": 1, "entrepots": [701, 702]}'::jsonb,
  'admin : premier import, 10 nouveaux mouvements, 1 annulation, 2 entrepôts');
select results_eq($$ select date_min, date_max from imports_mouvements_dolibarr order by id desc limit 1 $$,
  $$ values ('2026-09-30 13:05'::timestamp at time zone 'Africa/Casablanca', '2026-10-05 10:44'::timestamp at time zone 'Africa/Casablanca') $$,
  'journal des imports : période couverte, dates lues à l''heure du Maroc');
select is((select importer_mouvements_dolibarr((select valeur from t_json where cle = 'import1')) - 'date_min' - 'date_max'),
  '{"lignes_lues": 10, "nouveaux": 0, "modifies": 0, "inchanges": 10, "annulations": 1, "entrepots": [701, 702]}'::jsonb,
  'admin : le même fichier réimporté ne change rien (idempotent)');
select is((select importer_mouvements_dolibarr((select valeur from t_json where cle = 'import2')) - 'date_min' - 'date_max'),
  '{"lignes_lues": 1, "nouveaux": 0, "modifies": 1, "inchanges": 0, "annulations": 0, "entrepots": [701]}'::jsonb,
  'admin : une ligne corrigée dans Dolibarr est mise à jour');
select throws_ok($$ select importer_mouvements_dolibarr((select valeur from t_json where cle = 'invalide')) $$,
  '22023', null, 'admin : mouvement sans entrepôt refusé');
select throws_ok($$ select importer_mouvements_dolibarr('[]'::jsonb) $$,
  '22023', null, 'admin : fichier vide refusé');
reset role;

select results_eq($$ select quantite, date_mouvement, annulation, entrepot_contrepartie is null, produit_designation
                       from mouvements_dolibarr where dolibarr_id in (80003, 80008) order by dolibarr_id $$,
  $$ values (-4.0000::numeric, '2026-09-30 13:27:30'::timestamp at time zone 'Africa/Casablanca', true, true, 'TUBE ESSAI DN 40'::text),
            (8.0000, '2026-10-05 10:44:00'::timestamp at time zone 'Africa/Casablanca', false, false, 'GILET ESSAI') $$,
  'lignes enregistrées : quantité mise à jour, annulation déduite du libellé « CANCEL », instantané du produit');
select is((select date_mouvement from mouvements_dolibarr where dolibarr_id = 80010), '2026-10-03 09:00+01'::timestamptz,
  'date ISO avec décalage lue telle quelle');
select ok(not (to_jsonb((select m from mouvements_dolibarr m where m.dolibarr_id = 80001)) ?| array['prix', 'valeur', 'pmp']),
  'la ligne enregistrée ne porte ni prix ni valeur, même si le fichier en contenait');
select results_eq($$ select lignes_lues, nouveaux, modifies, inchanges, annulations, entrepots, importe_par::text
                       from imports_mouvements_dolibarr order by id $$,
  $$ values (10, 10, 0, 0, 1, array[701, 702], '00000000-0000-0000-0000-00000000000a'::text),
            (10, 0, 0, 10, 1, array[701, 702], '00000000-0000-0000-0000-00000000000a'),
            (1, 0, 1, 0, 0, array[701], '00000000-0000-0000-0000-00000000000a') $$,
  'journal des imports : trois imports tracés avec leurs chiffres et leur auteur');

-- Serveur (X8, service_role, aucun compte connecté) : import accepté, sans auteur
select set_config('request.jwt.claims', '', true);
select is((select (importer_mouvements_dolibarr((select valeur from t_json where cle = 'import2')) ->> 'inchanges')::int), 1,
  'serveur : import accepté (envoi automatique futur), ligne inchangée');

-- -----------------------------------------------------------------------------
-- 4. Lecture des mouvements : responsable (quantités / lire) sur son entrepôt seulement
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select count(*)::int from mouvements_dolibarr), 8, 'responsable : lit les 8 mouvements de l''entrepôt de son marché');
select is((select count(*)::int from mouvements_dolibarr where entrepot_id = 702), 0,
  'responsable : ne voit pas l''entrepôt d''un autre marché (isolation par l''entrepôt)');
select is((select count(*)::int from imports_mouvements_dolibarr), 4, 'responsable : lit le journal des imports');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((select count(*)::int from mouvements_dolibarr) + (select count(*)::int from imports_mouvements_dolibarr)
          + (select count(*)::int from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000011')), 0,
  'chef de réparation : ne voit ni mouvements, ni journal, ni rapprochement');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from mouvements_dolibarr)
          + (select count(*)::int from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000011')), 0,
  'détection : ne voit ni mouvements ni rapprochement');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
select is((select count(*)::int from mouvements_dolibarr) + (select count(*)::int from imports_mouvements_dolibarr)
          + (select count(*)::int from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000011')), 0,
  'compte sans droit : rien');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select count(*)::int from mouvements_dolibarr), 10, 'administrateur : lit tous les mouvements');

-- -----------------------------------------------------------------------------
-- 5. Pièces posées (inventaire réel) : chef en septembre et octobre, corrections du bureau,
--    réparation supprimée
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select lives_ok($$
  insert into reparations (id, marche_id, fuite_id, realisee_le, materiau, diametre_mm, tuyau_repare) values
    ('aaaaaaaa-2222-0000-0000-000000000101', 'aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-1111-0000-0000-000000000101',
     '2026-09-15 10:00+01', 'polyethylene', 25, true),
    ('aaaaaaaa-2222-0000-0000-000000000102', 'aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-1111-0000-0000-000000000102',
     '2026-10-10 09:00+01', 'polyethylene', 25, true),
    ('aaaaaaaa-2222-0000-0000-000000000103', 'aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-1111-0000-0000-000000000103',
     '2026-10-20 09:00+01', 'polyethylene', 25, true);
  insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite) values
    ('aaaaaaaa-6666-0000-0000-000000000101', 'aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-2222-0000-0000-000000000101', 9101, 2),
    ('aaaaaaaa-6666-0000-0000-000000000102', 'aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-2222-0000-0000-000000000101', 9102, 1),
    ('aaaaaaaa-6666-0000-0000-000000000103', 'aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-2222-0000-0000-000000000102', 9101, 3),
    ('aaaaaaaa-6666-0000-0000-000000000104', 'aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-2222-0000-0000-000000000102', 9104, 2),
    ('aaaaaaaa-6666-0000-0000-000000000106', 'aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-2222-0000-0000-000000000103', 9101, 5);
$$, 'chef : trois réparations (septembre, octobre, octobre) et leurs pièces posées');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$
  insert into reparation_pieces (id, marche_id, reparation_id, produit_id, quantite, remplace_piece_id, motif_modification) values
    ('aaaaaaaa-6666-0000-0000-000000000107', 'aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-2222-0000-0000-000000000101',
     9101, 1, 'aaaaaaaa-6666-0000-0000-000000000101', 'Un seul manchon posé (constat)');
  update reparation_pieces set etat = 'retiree', motif_modification = 'Collier non posé (erreur de saisie)'
   where id = 'aaaaaaaa-6666-0000-0000-000000000102';
$$, 'responsable : remplace le manchon (2 → 1) et retire le collier, avec motif');
reset role;
update reparations set supprime_le = now() where id = 'aaaaaaaa-2222-0000-0000-000000000103';

-- -----------------------------------------------------------------------------
-- 6. Rapprochement : transféré, consommé, posé, écart, période et cumul, seuil
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select results_eq($$ select transfere, consomme, pose, ecart, cumul_transfere, cumul_pose, cumul_ecart, ecart_pct, au_dela_seuil
                       from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000011', '2026-09-01', '2026-09-30')
                      where produit_id = 9101 $$,
  $$ values (10::numeric, 0::numeric, 1::numeric, 9::numeric, 10::numeric, 1::numeric, 9::numeric, 90.0::numeric, true) $$,
  'manchon, septembre : transféré 10, posé 1 (pièce remplacée exclue, correction comptée)');
select results_eq($$ select transfere, pose, ecart, pieces, cumul_transfere, cumul_pose, cumul_ecart, ecart_pct, au_dela_seuil,
                            designation, famille, unite, dans_articles
                       from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000011', '2026-10-01', '2026-10-31')
                      where produit_id = 9101 $$,
  $$ values (4::numeric, 3::numeric, 1::numeric, 1, 14::numeric, 4::numeric, 10::numeric, 71.4::numeric, true,
             'MANCHON ESSAI DN 25'::text, 'ESS'::text, 'U'::text, true) $$,
  'manchon, octobre : 6 − 2 (retour déduit, entrée du 1er octobre 00:30 au Maroc), posé 3 (réparation supprimée exclue), cumul');
select results_eq($$ select transfere, consomme, pose, ecart, cumul_transfere, cumul_consomme, cumul_ecart, ecart_pct
                       from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000011', '2026-10-01', '2026-10-31')
                      where produit_id = 9102 $$,
  $$ values (0::numeric, 3::numeric, 0::numeric, -3::numeric, 5::numeric, 3::numeric, 2::numeric, 40.0::numeric) $$,
  'collier : pièce retirée exclue, consommation pour le projet comptée en octobre, cumul 2');
select is((select count(*)::int from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000011') where produit_id = 9103), 0,
  'tube : entrée annulée (paire « CANCEL ») neutralisée, aucune ligne');
select results_eq($$ select transfere, ecart, designation, famille, unite, dans_articles, au_dela_seuil
                       from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000011') where produit_id = 9999 $$,
  $$ values (8::numeric, 8::numeric, 'GILET ESSAI'::text, 'CON'::text, 'U'::text, false, true) $$,
  'produit absent des articles : désignation et famille de l''instantané, quantité du second import');
select results_eq($$ select transfere, pose, ecart, au_dela_seuil
                       from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000011') where produit_id = 9104 $$,
  $$ values (0::numeric, 2::numeric, -2::numeric, true) $$,
  'pièce posée jamais transférée : écart négatif signalé');
select is((select count(*)::int from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000011', '2026-09-01', '2026-09-30')), 2,
  'septembre : manchon et collier seulement (gilet et joint d''octobre absents des cumuls à fin septembre)');
select is((select count(*)::int from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000012')), 0,
  'responsable : ne voit pas le rapprochement de l''autre marché');
select is((select sum(pose) from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000011')),
  (select sum(quantite) from v_pieces_reelles where marche_id = 'aaaaaaaa-0000-0000-0000-000000000011'),
  'le posé total du rapprochement est exactement l''inventaire réel');

-- Seuil réglable : à 50 %, le collier (40 %) n'est plus signalé, le manchon (71 %) l'est encore
select lives_ok($$ update marches set seuil_ecart_fournitures_pct = 50 where id = 'aaaaaaaa-0000-0000-0000-000000000011' $$,
  'responsable : relève le seuil à 50 %');
select results_eq($$ select produit_id, au_dela_seuil, seuil_pct
                       from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000011', '2026-10-01', '2026-10-31')
                      where produit_id in (9101, 9102) order by produit_id $$,
  $$ values (9101, true, 50.00::numeric), (9102, false, 50.00::numeric) $$,
  'seuil du marché : 71 % signalé, 40 % non');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select results_eq($$ select produit_id, transfere, pose, ecart, au_dela_seuil
                       from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000012') $$,
  $$ values (9101, 4::numeric, 0::numeric, 4::numeric, true) $$,
  'administrateur : rapprochement de l''autre marché (entrepôt 702, deux entrées dont une en ISO)');

-- Entrepôt retiré du marché : plus de transféré
select lives_ok($$ update marches set entrepot_dolibarr_id = null where id = 'aaaaaaaa-0000-0000-0000-000000000012' $$,
  'administrateur : retire l''entrepôt du second marché');
select is((select count(*)::int from rapprochement_fournitures('aaaaaaaa-0000-0000-0000-000000000012')), 0,
  'sans entrepôt ni pose : aucune ligne');

-- -----------------------------------------------------------------------------
-- 7. Copie d'un marché : entrepôt non copié, seuil par défaut ; journal
-- -----------------------------------------------------------------------------
select lives_ok($$ insert into t_ids values ('copie',
  copier_marche('aaaaaaaa-0000-0000-0000-000000000011', 'COPIE-P4', '4500000013', 'Marché copié (essai)')) $$,
  'admin : copie le marché P4');
reset role;
select results_eq($$ select entrepot_dolibarr_id, seuil_ecart_fournitures_pct from marches where id = (select id from t_ids where cle = 'copie') $$,
  $$ values (null::integer, 10.00::numeric) $$,
  'copie : entrepôt du chantier non copié (nul), seuil par défaut 10 %');
select ok(exists (select 1 from journal
                   where table_nom = 'marches' and ligne_id = 'aaaaaaaa-0000-0000-0000-000000000011'
                     and changements ? 'seuil_ecart_fournitures_pct'
                     and utilisateur_id = '00000000-0000-0000-0000-00000000000d'),
  'journal : le changement de seuil est tracé au nom du responsable');

select * from finish();
rollback;
