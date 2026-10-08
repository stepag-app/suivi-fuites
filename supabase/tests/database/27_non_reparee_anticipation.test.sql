-- =============================================================================
-- Chantier v2, S2 / fichier 3 : réparation non réparée (P8 : terrassement et travaux
-- attachés, réfection due) et attachement par anticipation généralisé (A1 : case du
-- marché, panier, propositions, « Attaché par anticipation », pas de double paiement).
-- Tout est annulé à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(38);

-- -----------------------------------------------------------------------------
-- Jeu d'essai : a = admin, b = détection A, c = chef réparation A, d = responsable A,
-- e = détection B
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chef.a@test.local',  '{"identifiant": "chef.a", "nom_complet": "Chef A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}'),
  ('00000000-0000-0000-0000-00000000000e', 'agent.b@test.local', '{"identifiant": "agent.b", "nom_complet": "Agent B"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-A', '1', 'Marché A', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-B', '2', 'Marché B', 'Client B');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'bbbbbbbb-0000-0000-0000-000000000001', 'detection');

insert into prix (id, marche_id, numero, ordre, designation, unite, quantite_marche, pu_ht, famille) values
  ('aaaaaaaa-4444-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '3', 3, 'Terrassement', 'm3', 100, 50, 'terrassement'),
  ('aaaaaaaa-4444-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '4', 4, 'Réfection trottoir', 'm2', 100, 100, 'refection'),
  ('aaaaaaaa-4444-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', '7', 7, 'Robinet PEC', 'u', 100, 460, 'robinet_pec');
insert into natures_refection (id, marche_id, code, libelle_fr, emplacement, prix_id, necessite_refection) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'beton', 'Béton', 'trottoir',
   'aaaaaaaa-4444-0000-0000-000000000004', true),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'terrain_naturel', 'Terrain naturel',
   'terrain_naturel', null, false);
insert into motifs (id, marche_id, categorie, code, libelle_fr, terrassement_paye) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'sans_reparation', 'refus_abonne', 'Refus de l''abonné', false),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'sans_reparation', 'sondage_negatif', 'Sondage négatif', true),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'sans_refection', 'faite_par_proprietaire', 'Faite par le propriétaire', false);
insert into ordres_service (id, marche_id, numero, date_os, objet, nature) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '01', '2026-09-01', 'Commencement', 'commencement');

-- F1 : refus de l'abonné, fouille 1 × 0,6 × 0,8 sur béton, robinet PEC changé
-- F2 : sondage négatif en terrain naturel ; F3, F7 : réparées sur béton, réfection à faire
-- F4 : réparation en cours ; F5 : réparée et réfectionnée ; F6 : pas encore de réparation
insert into fuites (id, marche_id, numero) select ('aaaaaaaa-1111-0000-0000-00000000000' || n)::uuid,
       'aaaaaaaa-0000-0000-0000-000000000001', n from generate_series(1, 7) n;
insert into reparations (marche_id, fuite_id, resultat, motif_id, robinet_pec_change, auteur_terrain_id,
                         fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m, emplacement, nature_revetement_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'non_reparee', 'dddddddd-0000-0000-0000-000000000001',
   true,  '00000000-0000-0000-0000-00000000000c', 1.0, 0.6, 0.8, 'trottoir', 'cccccccc-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000002', 'non_reparee', 'dddddddd-0000-0000-0000-000000000002',
   false, '00000000-0000-0000-0000-00000000000c', 1.0, 1.0, 1.0, 'terrain_naturel', 'cccccccc-0000-0000-0000-000000000002'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000003', 'reparee', null,
   false, '00000000-0000-0000-0000-00000000000c', 1.5, 0.6, 0.8, 'trottoir', 'cccccccc-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000004', 'en_cours', null,
   false, '00000000-0000-0000-0000-00000000000c', 1.0, 0.6, 0.8, 'trottoir', 'cccccccc-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000005', 'reparee', null,
   false, '00000000-0000-0000-0000-00000000000c', 1.0, 0.6, 0.8, 'trottoir', 'cccccccc-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000007', 'reparee', null,
   false, '00000000-0000-0000-0000-00000000000c', 1.0, 0.5, 0.8, 'trottoir', 'cccccccc-0000-0000-0000-000000000001');
insert into refections (marche_id, fuite_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000005');

-- -----------------------------------------------------------------------------
-- 1. P8 : réparation non réparée
-- -----------------------------------------------------------------------------
select results_eq($$ select p.numero, l.quantite from lignes_quantites l join prix p on p.id = l.prix_id
                      where l.fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' order by p.ordre $$,
  $$ values ('3'::text, 0.480::numeric), ('7'::text, 1.000::numeric) $$,
  'refus de l''abonné : terrassement (0,48 m3) et robinet PEC changé attachables');
select is((select statut::text from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001'), 'sans_reparation',
  'refus de l''abonné : le statut reste « sans réparation »');
select results_eq($$ select p.numero, l.quantite from lignes_quantites l join prix p on p.id = l.prix_id
                      where l.fuite_id = 'aaaaaaaa-1111-0000-0000-000000000002' $$,
  $$ values ('3'::text, 1.000::numeric) $$, 'sondage négatif : terrassement attachable');
select is((select count(*)::int from private.v_prix_proposes where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001'), 2,
  'règle des contrôles (v_prix_proposes) : mêmes articles proposés que les lignes automatiques');
select is((select array_agg(fuite_numero order by fuite_numero) from v_refections_dues
            where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'), array[1, 3, 7],
  'réfections dues : la non réparée sur béton comprise ; ni terrain naturel, ni en cours, ni déjà réfectionnée');
select results_eq($$ select resultat_reparation::text, surface_fouille_m2, prix_refection_id from v_refections_dues
                      where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values ('non_reparee'::text, 0.600::numeric, 'aaaaaaaa-4444-0000-0000-000000000004'::uuid) $$,
  'réfection due : surface de fouille et article de réfection prévus');
select ok(private.refection_due('aaaaaaaa-1111-0000-0000-000000000001') and not private.refection_due('aaaaaaaa-1111-0000-0000-000000000002'),
  'refection_due : vraie pour la non réparée sur béton, fausse en terrain naturel');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((select count(*)::int from v_refections_dues), 3, 'équipe de réparation / réfection : voit les réfections dues');
select lives_ok($$ insert into refections (marche_id, fuite_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001') $$,
  'réfection saisie sur une fuite non réparée');
reset role;
select results_eq($$ select p.numero, l.quantite from lignes_quantites l join prix p on p.id = l.prix_id
                      where l.fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' and l.refection_id is not null $$,
  $$ values ('4'::text, 0.600::numeric) $$, 'réfection de la non réparée : 0,6 m2 au prix 4');
select ok(not private.refection_due('aaaaaaaa-1111-0000-0000-000000000001'), 'réfection faite : plus due');

-- -----------------------------------------------------------------------------
-- 2. A1 : panier d'articles anticipables
-- -----------------------------------------------------------------------------
select results_eq($$ select numero, anticipable from prix where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by ordre $$,
  $$ values ('3'::text, false), ('4', true), ('7', false) $$, 'panier par défaut : articles de réfection');
select is((select bool_and(p.anticipable = (p.famille = 'refection' or exists (select 1 from natures_refection n where n.prix_id = p.id)))
             from prix p join marches m on m.id = p.marche_id where m.code in ('SRM-4500004453', 'DEMO')), true,
  'SRM et DEMO : panier = articles de réfection (prix 4 et 5)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select results_eq($$ select fuite_numero, prix_numero, quantite_proposee, brouillon_id from v_propositions_anticipation
                      order by fuite_numero $$,
  $$ values (3, '4'::text, 0.900::numeric, null::uuid), (7, '4'::text, 0.500::numeric, null::uuid) $$,
  'propositions anticipées : réfections dues, quantité = surface de fouille');

select lives_ok($$ insert into attachements (id, marche_id, intitule, os_id, lieu_travaux) values
  ('aaaaaaaa-7777-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Lot 1',
   'eeeeeeee-0000-0000-0000-000000000001', 'Secteur 1') $$, 'responsable : brouillon du lot 1');
select lives_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id, quantite, motif)
  select marche_id, 'aaaaaaaa-7777-0000-0000-000000000001', 'anticipation', fuite_id, prix_id, quantite_proposee,
         'Accord du maître d''ouvrage'
    from v_propositions_anticipation where fuite_numero = 3 $$,
  'responsable : ajoute la proposition anticipée de F3');
select is((select brouillon_id from v_propositions_anticipation where fuite_numero = 3), 'aaaaaaaa-7777-0000-0000-000000000001'::uuid,
  'proposition déjà cochée : brouillon indiqué');

reset role;
update parametres_attachement set refection_anticipee = false where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select count(*)::int from v_propositions_anticipation), 0, 'case décochée : aucune proposition');
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id, quantite, motif) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', 'anticipation',
   'aaaaaaaa-1111-0000-0000-000000000007', 'aaaaaaaa-4444-0000-0000-000000000004', 0.5, 'Accord') $$,
  '23514', 'Attachement par anticipation non accepté par le maître d''ouvrage (règles du marché)',
  'case du marché décochée : anticipation refusée');
reset role;
update parametres_attachement set refection_anticipee = true where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);

select lives_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id, quantite, motif) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', 'anticipation',
   'aaaaaaaa-1111-0000-0000-000000000007', 'aaaaaaaa-4444-0000-0000-000000000004', 0.5, 'Accord') $$,
  'case cochée : réfection de F7 anticipée');
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id, quantite, motif) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', 'anticipation',
   'aaaaaaaa-1111-0000-0000-000000000006', 'aaaaaaaa-4444-0000-0000-000000000003', 1, 'Accord') $$,
  '23514', 'Article hors du panier d''anticipation du marché', 'terrassement hors du panier : refusé');
select lives_ok($$ update prix set anticipable = true where id = 'aaaaaaaa-4444-0000-0000-000000000003' $$,
  'responsable : met le terrassement dans le panier');
select lives_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id, quantite, motif) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', 'anticipation',
   'aaaaaaaa-1111-0000-0000-000000000006', 'aaaaaaaa-4444-0000-0000-000000000003', 1, 'Accord') $$,
  'panier élargi : terrassement de F6 anticipé (1 m3)');
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id, quantite, motif) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000001', 'anticipation',
   'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000003', 1, 'Accord') $$,
  '23514', 'Travail déjà exécuté : attachez le solde, pas une anticipation', 'travail déjà exécuté : pas d''anticipation');

select is(arreter_attachement('aaaaaaaa-7777-0000-0000-000000000001', '2026-10-31'), 1, 'lot 1 arrêté');
select results_eq($$ select fuite_numero, prix_numero, quantite_executee, quantite_attachee, reste, en_attente_execution
                       from v_a_attacher where quantite_anticipee > 0 order by fuite_numero $$,
  $$ values (3, '4'::text, 0::numeric, 0.900::numeric, 0::numeric, true),
            (6, '3'::text, 0::numeric, 1.000::numeric, 0::numeric, true),
            (7, '4'::text, 0::numeric, 0.500::numeric, 0::numeric, true) $$,
  'attaché par anticipation : rien à attacher tant que l''exécution réelle manque');
select is((select count(*)::int from v_propositions_anticipation), 0, 'propositions : unités déjà attachées retirées');

select lives_ok($$ insert into attachements (id, marche_id, intitule, os_id, lieu_travaux) values
  ('aaaaaaaa-7777-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Lot 2',
   'eeeeeeee-0000-0000-0000-000000000001', 'Secteur 1') $$, 'responsable : brouillon du lot 2');
select throws_ok($$ insert into attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id, quantite, motif) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000002', 'anticipation',
   'aaaaaaaa-1111-0000-0000-000000000003', 'aaaaaaaa-4444-0000-0000-000000000004', 0.9, 'Accord') $$,
  '23514', 'Déjà attaché (lot N° 1) : pas de seconde anticipation', 'pas de seconde anticipation de la même unité');

-- Badge « Anticipé » et priorité : lisibles par l'agent, sans quantités ni prix
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select results_eq($$ select fuite_numero, premier_lot, attachee_le, articles from fuites_anticipees('aaaaaaaa-0000-0000-0000-000000000001') $$,
  $$ values (3, 1, '2026-10-31'::date, 1), (6, 1, '2026-10-31'::date, 1), (7, 1, '2026-10-31'::date, 1) $$,
  'agent de détection : fuites « Attaché par anticipation » en attente d''exécution');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select throws_ok($$ select * from fuites_anticipees('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', 'Marché non autorisé', 'agent B : marché A refusé');
reset role;
select set_config('request.jwt.claims', '', true);

-- -----------------------------------------------------------------------------
-- 3. A1 : exécution réelle, solde exécuté − attaché, pas de double paiement
--    (saisies en contexte serveur : les fuites du lot 1 sont verrouillées, V6 relève de S1)
-- -----------------------------------------------------------------------------
insert into refections (marche_id, fuite_id, longueur_m, largeur_m) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000003', 1.25, 0.8),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000007', 0.8, 0.5);
insert into reparations (marche_id, fuite_id, resultat, fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m,
                         emplacement, nature_revetement_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000006', 'reparee', 1.0, 1.0, 0.9,
   'terrain_naturel', 'cccccccc-0000-0000-0000-000000000002');

select results_eq($$ select fuite_numero, quantite_executee, quantite_attachee, reste, en_attente_execution, en_attente_refection
                       from v_a_attacher where quantite_anticipee > 0 order by fuite_numero $$,
  $$ values (3, 1.000::numeric, 0.900::numeric, 0.100::numeric, false, false),
            (6, 0.900::numeric, 1.000::numeric, -0.100::numeric, false, false),
            (7, 0.400::numeric, 0.500::numeric, -0.100::numeric, false, false) $$,
  'exécution réelle : régularisation + ou − (exécuté − attaché)');
select is((select count(*)::int from fuites_anticipees('aaaaaaaa-0000-0000-0000-000000000001')), 0,
  'exécution réelle faite : plus de fuite en attente');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ insert into attachement_lignes (marche_id, attachement_id, fuite_id, prix_id)
  select marche_id, 'aaaaaaaa-7777-0000-0000-000000000002', fuite_id, prix_id
    from v_a_attacher where quantite_anticipee > 0 $$, 'lot 2 : régularisations cochées');
select is(arreter_attachement('aaaaaaaa-7777-0000-0000-000000000002', '2026-11-30'), 2, 'lot 2 arrêté');
reset role;
select results_eq($$ select al.fuite_id, al.prix_id, sum(al.quantite)
                       from attachement_lignes al join attachements a on a.id = al.attachement_id and a.statut = 'arrete'
                      where al.marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and al.nature in ('solde', 'anticipation')
                        and al.fuite_id in ('aaaaaaaa-1111-0000-0000-000000000003', 'aaaaaaaa-1111-0000-0000-000000000006',
                                            'aaaaaaaa-1111-0000-0000-000000000007')
                      group by al.fuite_id, al.prix_id order by al.fuite_id $$,
  $$ select l.fuite_id, l.prix_id, sum(l.quantite) from lignes_quantites l
      where l.supprime_le is null and l.marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'
        and (l.fuite_id, l.prix_id) in (('aaaaaaaa-1111-0000-0000-000000000003'::uuid, 'aaaaaaaa-4444-0000-0000-000000000004'::uuid),
                                        ('aaaaaaaa-1111-0000-0000-000000000006', 'aaaaaaaa-4444-0000-0000-000000000003'),
                                        ('aaaaaaaa-1111-0000-0000-000000000007', 'aaaaaaaa-4444-0000-0000-000000000004'))
      group by l.fuite_id, l.prix_id order by l.fuite_id $$,
  'pas de double paiement : total attaché (anticipation + régularisation) = exécuté');
select is((select count(*)::int from v_a_attacher where quantite_anticipee > 0 and reste <> 0), 0,
  'après le lot 2 : plus rien à attacher sur ces unités');

-- Réfection close sans être faite après une anticipation : tout l'anticipé revient en moins
insert into fuites (id, marche_id, numero) values ('aaaaaaaa-1111-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', 8);
insert into reparations (marche_id, fuite_id, resultat, fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m,
                         emplacement, nature_revetement_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000008', 'reparee', 1.0, 0.5, 0.5,
   'trottoir', 'cccccccc-0000-0000-0000-000000000001');
insert into attachements (id, marche_id, intitule, os_id, lieu_travaux) values
  ('aaaaaaaa-7777-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Lot 3',
   'eeeeeeee-0000-0000-0000-000000000001', 'Secteur 1');
insert into attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id, quantite, motif) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-000000000003', 'anticipation',
   'aaaaaaaa-1111-0000-0000-000000000008', 'aaaaaaaa-4444-0000-0000-000000000004', 0.5, 'Accord');
update attachements set statut = 'arrete', numero = 3, date_arret = '2026-12-31' where id = 'aaaaaaaa-7777-0000-0000-000000000003';
insert into refections (marche_id, fuite_id, resultat, motif_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000008', 'non_faite', 'dddddddd-0000-0000-0000-000000000003');
select is((select reste from v_a_attacher where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000008' and prix_numero = '4'), -0.500::numeric,
  'réfection close sans être faite : l''anticipé revient en régularisation négative');

select * from finish();
rollback;
