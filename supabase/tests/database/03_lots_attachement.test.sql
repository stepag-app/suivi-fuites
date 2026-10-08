-- =============================================================================
-- Tests de l'étape B : lots d'attachement (solde fuite × article, brouillons,
-- arrêt et quantités figées, régularisations, réfection anticipée, forçage,
-- réouverture, droits).
-- Tout se passe dans une transaction annulée à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(41);

-- -----------------------------------------------------------------------------
-- Jeu d'essai : a = admin, b = détection A, d = responsable A
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-A', '1', 'Marché A', 'Client A');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');

insert into prix (id, marche_id, numero, ordre, designation, unite, quantite_marche, pu_ht, famille, materiaux, diametre_max_mm) values
  ('aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '1', 1, 'Balayage', 'ml', 1466000, 0.30, 'balayage', null, null),
  ('aaaaaaaa-4444-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '3', 3, 'Terrassement', 'm3', 10, 50, 'terrassement', null, null),
  ('aaaaaaaa-4444-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '4', 4, 'Réfection trottoir', 'm2', 100, 100, 'refection', null, null),
  ('aaaaaaaa-4444-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', '6', 6, 'PE DE < 40', 'u', 2400, 400, 'reparation_tuyau', array['polyethylene'], 39);
insert into natures_refection (id, marche_id, code, libelle_fr, emplacement, prix_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'beton', 'Béton', 'trottoir', 'aaaaaaaa-4444-0000-0000-000000000004');
insert into ordres_service (id, marche_id, numero, date_os, objet, nature) values
  ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '02', '2026-09-25', 'Commencement', 'commencement');

-- F1 : PE DE 32, fouille 1,5 × 0,6 × 0,8 (trottoir béton), réfection pas encore faite
-- F2 : PE DE 32, fouille 1 × 0,5 × 0,6, réfection faite (0,5 m2)
insert into fuites (id, marche_id) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into reparations (marche_id, fuite_id, materiau, diametre_mm, tuyau_repare,
                         fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m, emplacement, nature_revetement_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'polyethylene', 32, true, 1.5, 0.6, 0.8, 'trottoir', 'cccccccc-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000002', 'polyethylene', 32, true, 1.0, 0.5, 0.6, 'trottoir', 'cccccccc-0000-0000-0000-000000000001');
insert into refections (marche_id, fuite_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000002');

-- -----------------------------------------------------------------------------
-- 1. Solde des unités avant tout attachement
-- -----------------------------------------------------------------------------
select results_eq($$ select prix_numero, quantite_executee, reste from v_a_attacher
                      where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' order by prix_ordre $$,
  $$ values ('3'::text, 0.720::numeric, 0.720::numeric), ('6'::text, 1.000::numeric, 1.000::numeric) $$,
  'à attacher : F1 terrassement 0,72 m3 et prix 6');
select is((select count(*)::int from v_a_attacher where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 5,
  'à attacher : 5 unités (F1 : 3, 6 ; F2 : 3, 4, 6)');

-- -----------------------------------------------------------------------------
-- 2. Responsable : brouillon, lignes, contrôles
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);

select lives_ok($$ insert into attachements (id, marche_id, intitule, statut, numero) values
  ('aaaaaaaa-7777-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Octobre 2026', 'arrete', 99) $$,
  'responsable : crée un lot');
select results_eq($$ select statut, numero from attachements where id = 'aaaaaaaa-7777-0000-0000-000000000001' $$,
  $$ values ('brouillon'::text, null::integer) $$, 'un lot naît toujours en brouillon, sans numéro');

select lives_ok($$ insert into attachement_lignes (marche_id, attachement_id, fuite_id, prix_id)
  select 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', u.fuite_id, u.prix_id
    from v_a_attacher u where u.marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'responsable : coche les 5 unités');
select lives_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id, quantite, motif) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', 'anticipation',
   'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000004', 0.9, 'Accord de M. X (client)') $$,
  'responsable : attache la réfection de F1 par anticipation');
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id, quantite, motif) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', 'anticipation',
   'aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-4444-0000-0000-000000000006', 1, 'x') $$,
  '23514', 'Article hors du panier d''anticipation du marché', 'anticipation : articles du panier seulement (réfection par défaut)');
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id, quantite, motif) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', 'forcage',
   'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000006', 1, 'x') $$,
  '42501', 'Refacturation forcée réservée à l''administrateur', 'forçage refusé au responsable');

select lives_ok($$ insert into attachements (id, marche_id, intitule) values
  ('aaaaaaaa-7777-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Novembre 2026') $$,
  'responsable : prépare un second brouillon');
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, fuite_id, prix_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000002',
   'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000003') $$,
  '23505', 'Cette unité est déjà dans le brouillon « Octobre 2026 »', 'une unité dans un seul brouillon à la fois');

select results_eq($$ select prix_numero, sum(quantite) from v_attachement_lignes
                      where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000001' group by prix_numero order by prix_numero $$,
  $$ values ('3'::text, 1.020::numeric), ('4'::text, 1.400::numeric), ('6'::text, 2.000::numeric) $$,
  'brouillon : quantités suivies en direct (terrassement 1,02 ; réfection 0,5 + 0,9 anticipée ; prix 6 × 2)');
select results_eq($$ select quantite_anterieure, quantite_lot, quantite_cumulee, pourcentage_marche from v_attachement_recap
                      where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000001' and prix_numero = '3' $$,
  $$ values (0::numeric, 1.020::numeric, 1.020::numeric, 10.2::numeric) $$,
  'récapitulatif du brouillon : prix 3 = 1,02 m3, 10,2 % de la quantité du marché');

select throws_ok($$ select arreter_attachement('aaaaaaaa-7777-0000-0000-000000000001', '2026-10-31') $$,
  '23514', 'Mentions manquantes : ordre de service, lieu des travaux', 'arrêt refusé sans les mentions du CPS');
select lives_ok($$ update attachements set os_id = 'eeeeeeee-0000-0000-0000-000000000002',
                          lieu_travaux = 'Secteurs Andalous et Qods Bas'
                    where id = 'aaaaaaaa-7777-0000-0000-000000000001' $$,
  'responsable : complète l''en-tête du lot');
select is((select arreter_attachement('aaaaaaaa-7777-0000-0000-000000000001', '2026-10-31')), 1,
  'responsable : arrête le lot, numéro 1');
reset role;

-- -----------------------------------------------------------------------------
-- 3. Après l'arrêt : quantités figées, fuites verrouillées, solde à zéro
-- -----------------------------------------------------------------------------
select results_eq($$ select statut, date_arret from attachements where id = 'aaaaaaaa-7777-0000-0000-000000000001' $$,
  $$ values ('arrete'::text, '2026-10-31'::date) $$, 'lot 1 arrêté au 31/10/2026');
select results_eq($$ select prix_numero, quantite from attachement_lignes
                      where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000001'
                        and fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' order by prix_numero $$,
  $$ values ('3'::text, 0.720::numeric), ('4'::text, 0.900::numeric), ('6'::text, 1.000::numeric) $$,
  'lot 1 : quantités et numéros d''article figés');
select is((select count(*)::int from fuites where verrouillee_le is not null
            and id in ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000002')), 2,
  'fuites du lot verrouillées à l''arrêt');
select is((select count(*)::int from v_a_attacher where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and reste <> 0), 0,
  'plus rien à attacher : aucune double facturation possible');
select results_eq($$ select en_attente_refection, reste from v_a_attacher
                      where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' and prix_numero = '4' $$,
  $$ values (true, 0::numeric) $$, 'réfection anticipée : en attente de la vraie réfection');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, fuite_id, prix_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001',
   'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000001') $$,
  '23514', 'Lot arrêté : ses lignes sont figées', 'lot arrêté : aucune ligne ajoutée');
select throws_ok($$ update attachements set lieu_travaux = 'Autre' where id = 'aaaaaaaa-7777-0000-0000-000000000001' $$,
  '23514', 'Lot arrêté : seuls l''acceptation, la facture et l''observation se modifient', 'lot arrêté : en-tête figé');
select lives_ok($$ update attachements set accepte_le = '2026-11-05', accepte_par = 'M. X', reference_facture = 'FA 2610-0002'
                    where id = 'aaaaaaaa-7777-0000-0000-000000000001' $$,
  'lot arrêté : acceptation et référence de facture enregistrées');

-- Corrections après coup : terrassement de F1 corrigé, vraie réfection de F1 (1,0 m2)
select lives_ok($$ update lignes_quantites set quantite = 0.800, motif_modification = 'Profondeur relevée contradictoirement'
                    where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' and prix_id = 'aaaaaaaa-4444-0000-0000-000000000003' $$,
  'responsable : corrige le terrassement de F1 après l''arrêt');
select lives_ok($$ insert into refections (marche_id, fuite_id, longueur_m, largeur_m) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 2.0, 0.5) $$,
  'responsable : saisit la vraie réfection de F1 (1,0 m2)');
select results_eq($$ select prix_numero, reste from v_a_attacher
                      where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' and reste <> 0 order by prix_ordre $$,
  $$ values ('3'::text, 0.080::numeric), ('4'::text, 0.100::numeric) $$,
  'régularisations proposées : + 0,08 m3 et + 0,1 m2 (réfection réelle − anticipée)');

-- Lot 2 : régularisations et ligne libre de balayage
select lives_ok($$ insert into attachement_lignes (marche_id, attachement_id, fuite_id, prix_id)
  select 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000002', u.fuite_id, u.prix_id
    from v_a_attacher u where u.marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and u.reste <> 0 $$,
  'lot 2 : ajoute les régularisations');
select lives_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, prix_id, quantite, designation) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000002', 'libre',
   'aaaaaaaa-4444-0000-0000-000000000001', 12500, 'Balayage secteur Andalous du 01/11 au 30/11') $$,
  'lot 2 : ligne libre de balayage (12 500 ml)');
select results_eq($$ select regularisation, lot_precedent from v_attachement_lignes
                      where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000002' and prix_numero = '3' $$,
  $$ values (true, 1) $$, 'lot 2 : la ligne de terrassement est une régularisation du lot 1');
select results_eq($$ select prix_numero, quantite_anterieure, quantite_lot, quantite_cumulee from v_attachement_recap
                      where attachement_id = 'aaaaaaaa-7777-0000-0000-000000000002' and quantite_cumulee <> 0 order by prix_ordre $$,
  $$ values ('1'::text, 0::numeric, 12500::numeric, 12500::numeric),
            ('3'::text, 1.020::numeric, 0.080::numeric, 1.100::numeric),
            ('4'::text, 1.400::numeric, 0.100::numeric, 1.500::numeric),
            ('6'::text, 2.000::numeric, 0::numeric, 2.000::numeric) $$,
  'récapitulatif du lot 2 : antérieur, lot, cumul par article');
select lives_ok($$ update attachements set os_id = 'eeeeeeee-0000-0000-0000-000000000002', lieu_travaux = 'Secteur Andalous'
                    where id = 'aaaaaaaa-7777-0000-0000-000000000002' $$, 'lot 2 : en-tête complété');
select is((select arreter_attachement('aaaaaaaa-7777-0000-0000-000000000002', '2026-11-30')), 2, 'lot 2 arrêté, numéro 2');
reset role;

-- -----------------------------------------------------------------------------
-- 4. Agent de détection : aucun accès aux attachements
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from attachements), 0, 'détection : ne voit aucun lot');
select throws_ok($$ insert into attachements (marche_id) values ('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'détection : ne crée pas de lot');
reset role;

-- -----------------------------------------------------------------------------
-- 5. Administrateur : forçage hors solde, réouverture du dernier lot seulement
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$
  insert into attachements (id, marche_id, intitule, os_id, lieu_travaux) values
    ('aaaaaaaa-7777-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Refacturation', 'eeeeeeee-0000-0000-0000-000000000002', 'Rue X');
  insert into attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id, quantite, motif) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000003', 'forcage',
     'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000006', 1, 'Seconde réparation refacturée');
  select arreter_attachement('aaaaaaaa-7777-0000-0000-000000000003', '2026-12-31');
$$, 'administrateur : refacturation forcée dans un lot n° 3');
select is((select reste from v_a_attacher where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' and prix_numero = '6'), 0::numeric,
  'le forçage est hors solde : aucune déduction proposée ensuite');
select throws_ok($$ select rouvrir_attachement('aaaaaaaa-7777-0000-0000-000000000001', 'Erreur') $$,
  '23514', 'Seul le dernier lot arrêté (n° 3) peut être rouvert', 'réouverture limitée au dernier lot');
select lives_ok($$ select rouvrir_attachement('aaaaaaaa-7777-0000-0000-000000000003', 'Erreur de quantité') $$,
  'administrateur : rouvre le dernier lot avec un motif');
select results_eq($$ select statut, numero, motif_reouverture from attachements where id = 'aaaaaaaa-7777-0000-0000-000000000003' $$,
  $$ values ('brouillon'::text, 3, 'Erreur de quantité'::text) $$, 'lot rouvert : brouillon, numéro gardé, motif tracé');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select rouvrir_attachement('aaaaaaaa-7777-0000-0000-000000000002', 'x') $$,
  '42501', 'Réouverture d''un lot réservée à l''administrateur', 'responsable : ne rouvre pas un lot');
reset role;

select ok((select count(*) > 0 from journal where table_nom = 'attachements' and operation = 'modification'
             and utilisateur_id = '00000000-0000-0000-0000-00000000000d' and changements ? 'statut'),
  'journal : arrêt du lot tracé au nom du responsable');

select * from finish();
rollback;
