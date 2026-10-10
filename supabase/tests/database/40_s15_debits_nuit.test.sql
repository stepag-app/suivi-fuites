-- =============================================================================
-- Chantier v3, S15 : débits de nuit (D1 à D6) — référentiel, campagnes, saisie (relevés, minimum),
-- débit d'une zone au même instant ou approché, Qi, Qf, ΔQ, τ1, τ2, pénalités (proportionnelles,
-- entières, plafond, assiette zone ou marché), alertes, validation du terrain, droits, isolation.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(93);

-- a admin, b agent de détection (droits débits ouverts : lire, saisir, les siennes), c agent de
-- détection sans droit débits, d responsable, e responsable de l'autre marché
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local', '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'det@test.local',   '{"identifiant": "det", "nom_complet": "Détection"}'),
  ('00000000-0000-0000-0000-00000000000c', 'det2@test.local',  '{"identifiant": "det2", "nom_complet": "Détection 2"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp@test.local',  '{"identifiant": "resp", "nom_complet": "Responsable"}'),
  ('00000000-0000-0000-0000-00000000000e', 'respo@test.local', '{"identifiant": "respo", "nom_complet": "Responsable O"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-D', '1', 'Marché D', 'Client D'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-O', '2', 'Marché O', 'Client O');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'bbbbbbbb-0000-0000-0000-000000000001', 'responsable');
-- Droits débits ouverts à l'agent b par la matrice (D6) : voir, saisir, modifier et supprimer les siennes.
insert into droits (profil_id, marche_id, type_donnee, lire, creer, modifier, supprimer, valider) values
  ('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'mesures_debit', true, true, 'siennes', 'siennes', false);

-- Zones : Z1 (Q exigé 100, 1 000 m), Z2 (Q exigé 50, 500 m) ; prix 1 et 2 ; points P1, P2 (Z1), P3 (Z2).
insert into zones (id, marche_id, numero, code, libelle, lineaire_m, q_exige_m3h) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 1, 'z1', 'Zone 1', 1000, 100),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001', 2, 'z2', 'Zone 2', 500, 50),
  ('bbbbbbbb-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-000000000001', 1, 'z1', 'Zone O', 800, 80);
insert into secteurs (id, marche_id, zone_id, code, libelle) values
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 's1', 'Secteur 1'),
  ('aaaaaaaa-0000-0000-0000-0000000000b2', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a2', 's2', 'Secteur 2');
insert into prix (marche_id, numero, ordre, designation, unite, quantite_marche, pu_ht, famille) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '1', 1, 'Balayage', 'ml', 1500, 0.30, 'balayage'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '2', 2, 'Maintien', 'ml', 1500, 0.45, 'maintien');

-- 1. Privilèges et référentiel
select ok(not has_table_privilege('anon', 'public.mesures_nuit', 'select')
      and not has_table_privilege('anon', 'public.campagnes_debit', 'select')
      and not has_table_privilege('anon', 'public.points_mesure', 'select'), 'anon : aucun accès aux débits');
select ok(not has_table_privilege('authenticated', 'public.mesures_nuit', 'delete')
      and not has_table_privilege('authenticated', 'public.campagnes_debit', 'delete'), 'aucune suppression physique');
select ok((select bool_and(relrowsecurity) from pg_class
            where oid in ('public.mesures_nuit'::regclass, 'public.campagnes_debit'::regclass, 'public.points_mesure'::regclass)),
  'RLS activée sur les trois tables');
select ok(not has_function_privilege('anon', 'public.debits_resultats(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.enregistrer_mesures_nuit(uuid, jsonb, text, public.source_saisie)', 'execute'),
  'anon : fonctions de calcul et de saisie refusées');
select results_eq(
  $$select z.numero, q_exige_m3h, q_plus_bas_historique_m3h, q_actuel_m3h from zones z join marches m on m.id = z.marche_id
     where m.code = 'SRM-4500004453' order by z.numero$$,
  $$values (1, 126.00, 133.00, 158.00), (2, 130.00, 136.00, 162.00), (3, 118.00, 133.00, 148.00), (4, 112.00, 99.00, 140.00), (5, 83.00, 79.00, 104.00)$$,
  'SRM : Q exigé, plus bas historique et débit actuel du tableau n° 1');
select results_eq($$select debits_mode_saisie, debits_assiette, debits_points, debits_plafond_pct from marches where code = 'TEST-D'$$,
  $$values ('minimum'::text, 'zone'::text, 'entiers'::text, 25.00)$$, 'réglages par défaut : minimum, zone, points entiers, 25 %');

-- 2. Points de pénalité
select is(penalite_points(5, 25, 'proportionnels'), 0::numeric, 'τ positif : aucune pénalité');
select is(penalite_points(0, 25, 'proportionnels'), 0::numeric, 'τ nul : aucune pénalité');
select is(penalite_points(-3.4, 25, 'proportionnels'), 3.4, 'τ = −3,4 % : 3,4 points (proportionnels)');
select is(penalite_points(-3.4, 25, 'entiers'), 3::numeric, 'τ = −3,4 % : 3 points (entiers, arrondi au plus proche)');
select is(penalite_points(-3.5, 25, 'entiers'), 4::numeric, 'τ = −3,5 % : 4 points (demi-point vers le haut)');
select is(penalite_points(-9.6, 25, 'entiers'), 10::numeric, 'τ = −9,6 % : 10 points (pas de troncature)');
select is(penalite_points(-30, 25, 'proportionnels'), 25::numeric, 'plafond de 25 points');
select is(penalite_points(-25, 25, 'entiers'), 25::numeric, 'τ = −25 % : 25 points');
select is(penalite_points(null, 25, 'proportionnels'), null::numeric, 'τ inconnu : rien');

-- 3. Points de mesure (paramètres)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
insert into points_mesure (id, marche_id, zone_id, secteur_id, code, libelle) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'P1', 'Point 1'),
  ('aaaaaaaa-0000-0000-0000-0000000000c2', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', null, 'P2', 'Point 2'),
  ('aaaaaaaa-0000-0000-0000-0000000000c3', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-0000000000b2', 'P3', 'Point 3');
select is((select count(*)::int from points_mesure where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 3, 'le responsable crée les points de mesure');
select throws_ok($$insert into points_mesure (marche_id, zone_id, secteur_id, code, libelle) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000b2', 'P9', 'Mauvais')$$,
  '23514', null, 'secteur d''une autre zone refusé');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$insert into points_mesure (marche_id, zone_id, code, libelle) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'P8', 'Agent')$$,
  '42501', null, 'un agent ne crée pas de point de mesure');
select is((select count(*)::int from points_mesure), 3, 'l''agent lit les points de son marché');

-- 4. Campagnes : réservées au bureau (« valider »)
select throws_ok($$insert into campagnes_debit (marche_id, type, date_debut) values ('aaaaaaaa-0000-0000-0000-000000000001', 'avant', '2026-11-02')$$,
  '42501', null, 'un agent ne crée pas de campagne');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
insert into campagnes_debit (id, marche_id, type, date_debut) values
  ('aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000001', 'avant', '2026-11-02'),
  ('aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-000000000001', 'apres', '2027-02-02');
insert into campagnes_debit (id, marche_id, type, zone_id, date_debut) values
  ('aaaaaaaa-0000-0000-0000-0000000000d3', 'aaaaaaaa-0000-0000-0000-000000000001', 'maintien', 'aaaaaaaa-0000-0000-0000-0000000000a1', '2027-02-10'),
  ('aaaaaaaa-0000-0000-0000-0000000000d4', 'aaaaaaaa-0000-0000-0000-000000000001', 'maintien', 'aaaaaaaa-0000-0000-0000-0000000000a1', '2027-02-17');
select is((select date_fin from campagnes_debit where id = 'aaaaaaaa-0000-0000-0000-0000000000d1'), '2026-11-04'::date,
  'campagne « avant » : trois nuits par défaut');
select is((select date_fin from campagnes_debit where id = 'aaaaaaaa-0000-0000-0000-0000000000d3'), '2027-02-10'::date,
  'contrôle de maintien : une nuit par défaut');
select is((select saisi_par from campagnes_debit where id = 'aaaaaaaa-0000-0000-0000-0000000000d1'), '00000000-0000-0000-0000-00000000000d'::uuid,
  'auteur de la campagne posé par la base');
select throws_ok($$insert into campagnes_debit (marche_id, type, date_debut, date_fin) values ('aaaaaaaa-0000-0000-0000-000000000001', 'libre', '2026-11-02', '2026-12-20')$$,
  '23514', null, 'campagne de plus de 31 nuits refusée');

-- 5. Saisie du responsable : relevés détaillés (nuit 1), minimums (nuit 2), un seul point (nuit 3)
insert into mesures_nuit (marche_id, campagne_id, point_id, nuit, releves) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000c1', '2026-11-02',
   '[{"h": "0:30", "q": 75}, {"h": "00:00", "q": 80}, {"h": "00:15", "q": 70}]'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000c2', '2026-11-02',
   '[{"h": "00:00", "q": 60}, {"h": "00:15", "q": 65}, {"h": "00:30", "q": 55}]');
insert into mesures_nuit (marche_id, campagne_id, point_id, nuit, minimum_m3h) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000c1', '2026-11-03', 72),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000c2', '2026-11-03', 60),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000c1', '2026-11-04', 50),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000c3', '2026-11-02', 90);
select is((select releves from mesures_nuit where point_id = 'aaaaaaaa-0000-0000-0000-0000000000c1' and nuit = '2026-11-02'),
  '[{"h": "00:00", "q": 80}, {"h": "00:15", "q": 70}, {"h": "00:30", "q": 75}]'::jsonb, 'relevés triés et heures normalisées');
select results_eq($$select mode, minimum_m3h from mesures_nuit where point_id = 'aaaaaaaa-0000-0000-0000-0000000000c1' and nuit = '2026-11-02'$$,
  $$values ('releves'::text, 70.000)$$, 'mode « relevés » et minimum calculé');
select ok((select bool_and(validee_le is not null and validee_par = '00000000-0000-0000-0000-00000000000d') from mesures_nuit),
  'saisie du responsable : validée d''emblée');
select results_eq(
  $$select nuit, q_zone_m3h, approchee, complete, nb_points, nb_instants from v_debits_nuits
     where campagne_id = 'aaaaaaaa-0000-0000-0000-0000000000d1' and zone_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' order by nuit$$,
  $$values ('2026-11-02'::date, 130.000, false, true, 2, 3), ('2026-11-03'::date, 132.000, true, true, 2, 0), ('2026-11-04'::date, 50.000, false, false, 2, 0)$$,
  'zone 1 : minimum de la somme au même instant (130, et non 125), somme des minimums approchée (132), nuit incomplète');
select results_eq(
  $$select q_m3h, approchee, nb_nuits, nb_nuits_completes, nuit_minimum from v_debits_campagnes
     where campagne_id = 'aaaaaaaa-0000-0000-0000-0000000000d1' order by zone_numero$$,
  $$values (130.000, false, 3, 2, '2026-11-02'::date), (90.000, false, 1, 1, '2026-11-02'::date)$$,
  'Qi = minimum des nuits complètes (zone 1 : 130 exact ; zone 2 : un point, minimum exact)');

-- Contrôles de saisie
select throws_ok($$insert into mesures_nuit (marche_id, campagne_id, point_id, nuit, releves) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-0000000000c1', '2027-02-02', '[{"h": "07:00", "q": 10}]')$$,
  '23514', null, 'relevé hors de 0 h à 6 h refusé');
select throws_ok($$insert into mesures_nuit (marche_id, campagne_id, point_id, nuit, releves) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-0000000000c1', '2027-02-02', '[{"h": "01:00", "q": -1}]')$$,
  '23514', null, 'débit négatif refusé');
select throws_ok($$insert into mesures_nuit (marche_id, campagne_id, point_id, nuit, releves) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-0000000000c1', '2027-02-02',
   '[{"h": "01:00", "q": 1}, {"h": "1:00", "q": 2}]')$$,
  '23514', null, 'deux relevés à la même heure refusés');
select throws_ok($$insert into mesures_nuit (marche_id, campagne_id, point_id, nuit, releves) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-0000000000c1', '2027-02-02', '[{"h": "midi", "q": 1}]')$$,
  '22023', null, 'heure illisible refusée');
select throws_ok($$insert into mesures_nuit (marche_id, campagne_id, point_id, nuit) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-0000000000c1', '2027-02-02')$$,
  '23502', null, 'ni relevés ni minimum : refusé');
select throws_ok($$insert into mesures_nuit (marche_id, campagne_id, point_id, nuit, minimum_m3h) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-0000000000c1', '2027-02-10', 10)$$,
  '23514', null, 'nuit hors de la campagne refusée');
select throws_ok($$insert into mesures_nuit (marche_id, campagne_id, point_id, nuit, minimum_m3h) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d3', 'aaaaaaaa-0000-0000-0000-0000000000c3', '2027-02-10', 10)$$,
  '23514', null, 'point d''une autre zone que celle de la campagne refusé');
select throws_ok($$insert into mesures_nuit (marche_id, campagne_id, point_id, nuit, minimum_m3h) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-0000000000c3', '2026-11-02', 10)$$,
  '23505', null, 'deuxième mesure du même point la même nuit refusée');
select throws_ok($$update mesures_nuit set nuit = '2026-11-03' where point_id = 'aaaaaaaa-0000-0000-0000-0000000000c3'$$,
  '23514', null, 'la nuit d''une mesure ne change pas');
select throws_ok($$update campagnes_debit set zone_id = 'aaaaaaaa-0000-0000-0000-0000000000a2' where id = 'aaaaaaaa-0000-0000-0000-0000000000d1'$$,
  '23514', null, 'campagne mesurée : zone figée');
select throws_ok($$update campagnes_debit set date_debut = '2026-11-03', date_fin = '2026-11-05' where id = 'aaaaaaaa-0000-0000-0000-0000000000d1'$$,
  '23514', null, 'campagne mesurée : dates qui excluent des mesures refusées');

-- 6. Saisie de terrain : agent b (droits ouverts), à valider
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is(enregistrer_mesures_nuit('aaaaaaaa-0000-0000-0000-0000000000d2', jsonb_build_array(
    jsonb_build_object('point_id', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'nuit', '2027-02-02', 'minimum_m3h', 60),
    jsonb_build_object('point_id', 'aaaaaaaa-0000-0000-0000-0000000000c2', 'nuit', '2027-02-02', 'minimum_m3h', 50),
    jsonb_build_object('point_id', 'aaaaaaaa-0000-0000-0000-0000000000c3', 'nuit', '2027-02-02', 'minimum_m3h', 75)), 'saisie', 'tablette'),
  '{"ajoutees": 3, "modifiees": 0}'::jsonb, 'l''agent saisit trois minimums (après balayage)');
select ok((select bool_and(validee_le is null and auteur_terrain_id = '00000000-0000-0000-0000-00000000000b' and source_saisie = 'tablette')
             from mesures_nuit where campagne_id = 'aaaaaaaa-0000-0000-0000-0000000000d2'), 'saisie de terrain : à valider, auteur et source posés');
select is((select count(*)::int from v_debits_a_valider), 0, 'l''agent ne voit pas la liste « à valider »');
select is(enregistrer_mesures_nuit('aaaaaaaa-0000-0000-0000-0000000000d2', jsonb_build_array(
    jsonb_build_object('point_id', 'aaaaaaaa-0000-0000-0000-0000000000c3', 'nuit', '2027-02-02', 'minimum_m3h', 70))),
  '{"ajoutees": 0, "modifiees": 1}'::jsonb, 'l''agent corrige sa mesure non validée');
select throws_ok($$insert into mesures_nuit (marche_id, campagne_id, point_id, nuit, minimum_m3h, auteur_terrain_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-0000000000c1', '2027-02-03', 10, '00000000-0000-0000-0000-00000000000c')$$,
  '42501', null, 'l''agent ne saisit pas au nom d''un autre');
select throws_ok($$update mesures_nuit set validee_le = now() where campagne_id = 'aaaaaaaa-0000-0000-0000-0000000000d2'$$,
  '42501', null, 'l''agent ne valide pas');
select throws_ok($$update mesures_nuit set minimum_m3h = 1 where campagne_id = 'aaaaaaaa-0000-0000-0000-0000000000d1' and point_id = 'aaaaaaaa-0000-0000-0000-0000000000c3'$$,
  '42501', null, 'l''agent ne modifie pas la mesure (validée) du responsable');
select is((select count(*)::int from v_debits_campagnes where campagne_id = 'aaaaaaaa-0000-0000-0000-0000000000d2' and q_m3h is not null), 0,
  'mesures à valider : pas encore comptées');
select is((select sum(nb_a_valider)::int from v_debits_campagnes where campagne_id = 'aaaaaaaa-0000-0000-0000-0000000000d2'), 3,
  'trois mesures signalées « à valider »');

-- Agent c sans droit débits : rien
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((select count(*)::int from mesures_nuit) + (select count(*)::int from campagnes_debit), 0, 'sans droit « mesures_debit » : rien à lire');
select throws_ok($$insert into mesures_nuit (marche_id, campagne_id, point_id, nuit, minimum_m3h) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-0000000000c1', '2027-02-03', 10)$$,
  '42501', null, 'sans droit « mesures_debit » : saisie refusée');
select is((select count(*)::int from debits_resultats('aaaaaaaa-0000-0000-0000-000000000001')), 0, 'sans droit : aucun résultat');

-- 7. Validation par le responsable (circuit V1)
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select count(*)::int from v_debits_a_valider), 3, 'le responsable voit les trois mesures à valider');
select is(valider_etapes((select jsonb_agg(jsonb_build_object('etape', 'debit', 'id', id)) from v_debits_a_valider)), 3,
  'valider_etapes : étape « debit »');
select ok((select bool_and(validee_par = '00000000-0000-0000-0000-00000000000d') from mesures_nuit where campagne_id = 'aaaaaaaa-0000-0000-0000-0000000000d2'),
  'validées par le responsable');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$update mesures_nuit set minimum_m3h = 1 where campagne_id = 'aaaaaaaa-0000-0000-0000-0000000000d2' and point_id = 'aaaaaaaa-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'mesure validée : l''agent ne la modifie plus');
select throws_ok($$update mesures_nuit set supprime_le = now() where campagne_id = 'aaaaaaaa-0000-0000-0000-0000000000d2' and point_id = 'aaaaaaaa-0000-0000-0000-0000000000c1'$$,
  '42501', null, 'mesure validée : l''agent ne la supprime plus');

-- 8. Contrôles de maintien (zone 1 : 115 puis 125)
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is(enregistrer_mesures_nuit('aaaaaaaa-0000-0000-0000-0000000000d3', jsonb_build_array(
    jsonb_build_object('point_id', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'nuit', '2027-02-10', 'releves',
      jsonb_build_array(jsonb_build_object('h', '00:00', 'q', 70), jsonb_build_object('h', '03:00', 'q', 65))),
    jsonb_build_object('point_id', 'aaaaaaaa-0000-0000-0000-0000000000c2', 'nuit', '2027-02-10', 'releves',
      jsonb_build_array(jsonb_build_object('h', '00:00', 'q', 45), jsonb_build_object('h', '03:00', 'q', 50))))),
  '{"ajoutees": 2, "modifiees": 0}'::jsonb, 'premier contrôle : relevés détaillés');
select is(enregistrer_mesures_nuit('aaaaaaaa-0000-0000-0000-0000000000d4', jsonb_build_array(
    jsonb_build_object('point_id', 'aaaaaaaa-0000-0000-0000-0000000000c1', 'nuit', '2027-02-17', 'minimum_m3h', 75),
    jsonb_build_object('point_id', 'aaaaaaaa-0000-0000-0000-0000000000c2', 'nuit', '2027-02-17', 'minimum_m3h', 50)), 'import'),
  '{"ajoutees": 2, "modifiees": 0}'::jsonb, 'second contrôle : import des minimums');
select is((select q_m3h from v_debits_campagnes where campagne_id = 'aaaaaaaa-0000-0000-0000-0000000000d3'), 115.000,
  'contrôle 1 : 115 (minimum de la somme à 0 h et à 3 h)');
select is((select origine from mesures_nuit where campagne_id = 'aaaaaaaa-0000-0000-0000-0000000000d4' limit 1), 'import', 'origine « import » gardée');

-- 9. Résultats : assiette par zone, points proportionnels
update marches set debits_points = 'proportionnels' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
create temp table r on commit drop as select * from debits_resultats('aaaaaaaa-0000-0000-0000-000000000001');
select results_eq($$select niveau, zone_numero from r$$,
  $$values ('zone'::text, 1), ('zone'::text, 2), ('marche'::text, null::integer)$$, 'une ligne par zone, puis le marché');
select results_eq($$select qi_m3h, qf_m3h, delta_q_m3h, qf_approche, qf_nuits from r where zone_numero = 1$$,
  $$values (130.000, 110.000, 20.000, true, 1)$$, 'zone 1 : Qi 130, Qf 110 (somme des minimums, approché), ΔQ 20');
select results_eq($$select tau1_pct, points_balayage, montant_balayage, penalite_balayage, alerte_arret from r where zone_numero = 1$$,
  $$values (-10.00, 10.00, 300.00, 30.00, false)$$, 'zone 1 : τ1 = −10 %, 10 points de 300 DH, pénalité 30 DH, pas d''arrêt');
select results_eq($$select tau1_pct, points_balayage, penalite_balayage, alerte_arret from r where zone_numero = 2$$,
  $$values (-40.00, 25::numeric, 37.50, true)$$, 'zone 2 : τ1 = −40 %, plafond 25 points, 37,50 DH, alerte « arrêt de zone »');
select results_eq($$select nb_controles, dernier_controle, dernier_controle_m3h, ecart_controles_max_j, q_maintien_moyen_m3h from r where zone_numero = 1$$,
  $$values (2, '2027-02-17'::date, 125.000, 7, 120.0000000000000000)$$, 'zone 1 : deux contrôles à 7 jours, moyenne 120');
select results_eq($$select tau2_pct, points_maintien, montant_maintien, penalite_maintien from r where zone_numero = 1$$,
  $$values (-9.09, 9.09, 450.00, 40.91)$$, 'zone 1 : τ2 = −9,09 %, pénalité de maintien 40,91 DH');
select results_eq($$select round(degradation_m3h, 2), degradation_pct, alerte_degradation from r where zone_numero = 1$$,
  $$values (10.00, 50.00, true)$$, 'zone 1 : dégradation 10 m3/h, 50 % du gain, alerte au-delà de 25 %');
select results_eq($$select tau2_pct, penalite_maintien, alerte_degradation from r where zone_numero = 2$$,
  $$values (null::numeric, null::numeric, false)$$, 'zone 2 : aucun contrôle, ni τ2 ni alerte');
select results_eq($$select qi_m3h, qf_m3h, tau1_pct, penalite_balayage, montant_balayage, alerte_arret, tau2_pct from r where niveau = 'marche'$$,
  $$values (220.000, 180.000, -20.00, 67.50, 450.00, true, null::numeric)$$,
  'marché (assiette zone) : sommes des zones, pénalité = 30 + 37,50, τ2 global inconnu (zone 2 sans contrôle)');

-- 10. Points entiers (arrondis au plus proche), puis assiette « marché »
update marches set debits_points = 'entiers' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select results_eq($$select points_maintien, penalite_maintien from debits_resultats('aaaaaaaa-0000-0000-0000-000000000001') where zone_numero = 1$$,
  $$values (9::numeric, 40.50)$$, 'points entiers : τ2 −9,09 % → 9 points, 40,50 DH');
update marches set debits_points = 'proportionnels', debits_assiette = 'marche' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select results_eq($$select tau1_pct, points_balayage, montant_balayage, penalite_balayage from debits_resultats('aaaaaaaa-0000-0000-0000-000000000001') where niveau = 'marche'$$,
  $$values (-20.00, 20.00, 450.00, 90.00)$$, 'assiette « marché » : τ1 global −20 % sur 1 500 m × 0,30 = 450 DH, pénalité 90 DH');
select is((select count(*)::int from debits_resultats('aaaaaaaa-0000-0000-0000-000000000001') where niveau = 'zone' and penalite_balayage is not null), 0,
  'assiette « marché » : pas de pénalité par zone');
update marches set debits_assiette = 'zone', debits_seuil_arret_pct = 50 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select alerte_arret from debits_resultats('aaaaaaaa-0000-0000-0000-000000000001') where zone_numero = 2), false,
  'seuil d''arrêt réglable (50 %)');
update marches set debits_seuil_arret_pct = 25 where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- 11. Montants cachés sans « quantités / lire » ; résultats de l'agent
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select results_eq($$select tau1_pct, montant_balayage, penalite_balayage from debits_resultats('aaaaaaaa-0000-0000-0000-000000000001') where zone_numero = 1$$,
  $$values (-10.00, null::numeric, null::numeric)$$, 'agent avec « mesures_debit / lire » : τ visibles, montants cachés');
update marches set debits_assiette = 'marche' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is((select debits_assiette from marches where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'zone',
  'l''agent ne change pas les réglages (RLS « paramètres / modifier »)');

-- 12. Suppression logique et isolation
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
update mesures_nuit set supprime_le = now()
 where campagne_id = 'aaaaaaaa-0000-0000-0000-0000000000d4' and point_id = 'aaaaaaaa-0000-0000-0000-0000000000c2';
select results_eq($$select complete, q_zone_m3h from v_debits_nuits where campagne_id = 'aaaaaaaa-0000-0000-0000-0000000000d4'$$,
  $$values (false, 75.000)$$, 'mesure supprimée : la nuit devient incomplète');
select is((select nb_controles from debits_resultats('aaaaaaaa-0000-0000-0000-000000000001') where zone_numero = 1), 1,
  'contrôle incomplet : non compté');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select is((select count(*)::int from mesures_nuit) + (select count(*)::int from campagnes_debit) + (select count(*)::int from v_debits_nuits), 0,
  'responsable de l''autre marché : rien');
select is((select count(*)::int from debits_resultats('aaaaaaaa-0000-0000-0000-000000000001')), 0, 'autre marché : aucun résultat');
select throws_ok($$insert into campagnes_debit (marche_id, type, date_debut) values ('aaaaaaaa-0000-0000-0000-000000000001', 'libre', '2026-11-02')$$,
  '42501', null, 'autre marché : campagne refusée');

-- 13. Pièces jointes (compartiment « debits »)
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values
  ('debits', 'aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-0000-0000-0000-0000000000d2/afficheur.jpg', '00000000-0000-0000-0000-00000000000b')$$,
  'l''agent dépose une photo de l''afficheur');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values
  ('debits', 'aaaaaaaa-0000-0000-0000-000000000001/x/pv.pdf', '00000000-0000-0000-0000-00000000000c')$$,
  '42501', null, 'sans droit : dépôt refusé');
select is((select count(*)::int from storage.objects where bucket_id = 'debits'), 0, 'sans droit : pièces jointes invisibles');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values
  ('debits', 'aaaaaaaa-0000-0000-0000-000000000001/x/pv.pdf', '00000000-0000-0000-0000-00000000000e')$$,
  '42501', null, 'autre marché : dépôt refusé');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'debits'), 1, 'le responsable voit la pièce jointe');

-- 14. Marché désactivé : lecture seule
reset role;
update marches set actif = false where id = 'aaaaaaaa-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$insert into campagnes_debit (marche_id, type, date_debut) values ('aaaaaaaa-0000-0000-0000-000000000001', 'libre', '2026-11-02')$$,
  '42501', null, 'marché désactivé : campagne refusée');
select ok((select count(*) from debits_resultats('aaaaaaaa-0000-0000-0000-000000000001')) = 3, 'marché désactivé : résultats lisibles');
reset role;
update marches set actif = true where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- 15. Journal et administrateur
select ok((select count(*) from journal where table_nom = 'mesures_nuit' and operation = 'creation') >= 10, 'saisies journalisées');
select ok((select count(*) from journal where table_nom = 'mesures_nuit' and operation = 'suppression_logique') = 1, 'suppression logique journalisée');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select count(*)::int from debits_resultats('aaaaaaaa-0000-0000-0000-000000000001')), 3, 'l''administrateur lit les résultats');
select lives_ok($$insert into campagnes_debit (marche_id, type, date_debut) values ('aaaaaaaa-0000-0000-0000-000000000001', 'libre', '2026-12-01')$$,
  'l''administrateur crée une campagne libre');
select is((select validee_le is not null from mesures_nuit where id = (select id from mesures_nuit order by cree_le limit 1)), true, 'contrôle final');

select * from finish();
rollback;
