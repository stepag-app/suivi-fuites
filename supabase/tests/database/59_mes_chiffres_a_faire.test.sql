-- =============================================================================
-- « Mes chiffres » et « À faire » de l'APK : chiffres du compte par période (heure du Maroc), chiffres du marché,
-- actions par rôle (urgentes d'abord, puis les plus anciennes), étape renvoyée puis reprise, isolation entre
-- marchés, marché désactivé. Migration 20261016900000. Transaction annulée à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(29);

-- a admin, b détection, c réparation, e réfection, d les trois rôles (A) ; f réparation de B
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local', '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'det@test.local',   '{"identifiant": "det", "nom_complet": "Détection"}'),
  ('00000000-0000-0000-0000-00000000000c', 'rep@test.local',   '{"identifiant": "rep", "nom_complet": "Réparation"}'),
  ('00000000-0000-0000-0000-00000000000e', 'refe@test.local',  '{"identifiant": "refe", "nom_complet": "Réfection"}'),
  ('00000000-0000-0000-0000-00000000000d', 'cumul@test.local', '{"identifiant": "cumul", "nom_complet": "Cumul"}'),
  ('00000000-0000-0000-0000-00000000000f', 'repb@test.local',  '{"identifiant": "repb", "nom_complet": "Réparation B"}');
update profils set est_admin = true where identifiant = 'issam';
insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-A', '1', 'Marché A', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-B', '2', 'Marché B', 'Client B');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000001', 'refection');
select modifier_roles('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', array['detection', 'chef_reparation', 'refection']);
select appliquer_modele_role('00000000-0000-0000-0000-00000000000f', 'bbbbbbbb-0000-0000-0000-000000000001', 'chef_reparation');
insert into natures_refection (id, marche_id, code, libelle_fr, emplacement) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'beton', 'Béton', 'trottoir'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'enrobe', 'Enrobé', 'chaussee');
insert into troncons (id, marche_id, reference, geom) values
  ('aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'T1',
   st_geomfromtext('LINESTRING(-1.9140 34.6810, -1.9130 34.6810)', 4326)),
  ('aaaaaaaa-4444-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'T2',
   st_geomfromtext('LINESTRING(-1.9130 34.6810, -1.9120 34.6810)', 4326));

set local role authenticated;
-- Détection : F1 aujourd'hui, F2 (3 j), F3 (40 j), F4 aujourd'hui, F7 (3 j), F8 (45 j)
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
insert into fuites (id, marche_id, adresse) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue 1'),
  ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue 2'),
  ('aaaaaaaa-1111-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue 3'),
  ('aaaaaaaa-1111-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue 4'),
  ('aaaaaaaa-1111-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue 5'),
  ('aaaaaaaa-1111-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue 6'),
  ('aaaaaaaa-1111-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue 7'),
  ('aaaaaaaa-1111-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', 'Rue 8');
insert into balayages (marche_id, troncon_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-000000000002');
-- Réparation : F1 et F2 réparées aujourd'hui, F6 en cours, F8 réparée sur chaussée
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
insert into reparations (id, marche_id, fuite_id, resultat, emplacement) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'reparee', 'trottoir'),
  ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000002', 'reparee', 'trottoir'),
  ('aaaaaaaa-2222-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000006', 'en_cours', 'trottoir'),
  ('aaaaaaaa-2222-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000008', 'reparee', 'chaussee');
-- Réfection : F1 faite aujourd'hui
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
insert into refections (id, marche_id, fuite_id, reparation_id, resultat, nature_id, longueur_m, largeur_m) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001',
   'aaaaaaaa-2222-0000-0000-000000000001', 'faite', 'cccccccc-0000-0000-0000-000000000001', 1, 1);
reset role;
-- Dates du passé, F5 introuvable (déclencheurs coupés)
set local session_replication_role = replica;
update fuites set date_detection = now() - interval '3 days' where id in ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000007');
update fuites set date_detection = now() - interval '40 days' where id = 'aaaaaaaa-1111-0000-0000-000000000003';
update fuites set date_detection = now() - interval '45 days' where id = 'aaaaaaaa-1111-0000-0000-000000000008';
update reparations set realisee_le = now() - interval '40 days' where id = 'aaaaaaaa-2222-0000-0000-000000000008';
update fuites set statut = 'a_redetecter' where id = 'aaaaaaaa-1111-0000-0000-000000000005';
set local session_replication_role = origin;

create function pg_temp.actions(p_compte text) returns table (type text, numero text, urgent boolean)
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_compte, 'role', 'authenticated')::text, true);
  return query select a.type, a.numero_affiche, a.urgent from mes_actions('aaaaaaaa-0000-0000-0000-000000000001') a;
end
$$;
create function pg_temp.chiffres(p_compte text) returns jsonb language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_compte, 'role', 'authenticated')::text, true);
  return mes_chiffres('aaaaaaaa-0000-0000-0000-000000000001');
end
$$;
grant execute on function pg_temp.actions(text), pg_temp.chiffres(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 1. Privilèges
-- -----------------------------------------------------------------------------
select is(has_function_privilege('anon', 'public.mes_chiffres(uuid)', 'execute'), false, 'anon : pas de chiffres');
select is(has_function_privilege('anon', 'public.mes_actions(uuid)', 'execute'), false, 'anon : pas d''actions');
select is(has_function_privilege('authenticated', 'public.mes_chiffres(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.mes_actions(uuid)', 'execute'), true,
  'authenticated : les deux fonctions (RLS de l''appelant)');
select is(has_function_privilege('anon', 'private.reprise_apres_renvoi(text, uuid, timestamptz)', 'execute'), false,
  'anon : pas de lecture du journal');

set local role authenticated;

-- -----------------------------------------------------------------------------
-- 2. Mes chiffres
-- -----------------------------------------------------------------------------
select is(pg_temp.chiffres('00000000-0000-0000-0000-00000000000b') -> 'roles',
  '{"detection": true, "reparation": false, "refection": false}'::jsonb, 'Détection : un seul rôle');
select is(pg_temp.chiffres('00000000-0000-0000-0000-00000000000d') -> 'roles',
  '{"detection": true, "reparation": true, "refection": true}'::jsonb, 'trois rôles cumulés');

select ok((select (c -> 'periodes' -> 'jour' ->> 'du')::date = private.jour_maroc(now())
              and (c -> 'periodes' -> 'jour' ->> 'au')::date = private.jour_maroc(now())
              and extract(isodow from (c -> 'periodes' -> 'semaine' ->> 'du')::date) = 1
              and (c -> 'periodes' -> 'semaine' ->> 'du')::date between private.jour_maroc(now()) - 6 and private.jour_maroc(now())
              and (c -> 'periodes' -> 'mois' ->> 'du')::date = date_trunc('month', private.jour_maroc(now()))::date
             from pg_temp.chiffres('00000000-0000-0000-0000-00000000000b') c),
  'périodes : aujourd''hui, depuis lundi, depuis le 1er (heure du Maroc)');

select is((select (c -> 'periodes' -> 'jour') - 'du' - 'au' from pg_temp.chiffres('00000000-0000-0000-0000-00000000000b') c),
  jsonb_build_object('detectees', 4, 'deja_reparees', 1,
    'balaye_m', (select round(sum(longueur_m)) from troncons where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
    'reparees', 0, 'reparees_dans_delai', 0, 'refections', 0, 'refections_dans_delai', 0, 'refections_delai_connu', 0),
  'Détection, aujourd''hui : ses 4 fuites, 1 déjà réparée, ses 2 tronçons balayés');
select ok((select (c -> 'periodes' -> 'mois' ->> 'detectees')::int between 4 and 6
             from pg_temp.chiffres('00000000-0000-0000-0000-00000000000b') c),
  'Détection, mois : les fuites de 40 et 45 jours ne comptent pas');

select is((select (c -> 'periodes' -> 'jour') - 'du' - 'au' from pg_temp.chiffres('00000000-0000-0000-0000-00000000000c') c),
  '{"detectees": 0, "deja_reparees": 0, "balaye_m": 0, "reparees": 2, "reparees_dans_delai": 1, "refections": 0,
    "refections_dans_delai": 0, "refections_delai_connu": 0}'::jsonb,
  'Réparation, aujourd''hui : 2 réparées dont 1 dans les 48 h ; rien des autres comptes');
select is((select (c -> 'periodes' -> 'jour') - 'du' - 'au' from pg_temp.chiffres('00000000-0000-0000-0000-00000000000e') c),
  '{"detectees": 0, "deja_reparees": 0, "balaye_m": 0, "reparees": 0, "reparees_dans_delai": 0, "refections": 1,
    "refections_dans_delai": 1, "refections_delai_connu": 1}'::jsonb,
  'Réfection, aujourd''hui : 1 faite dans le délai');
select is(pg_temp.chiffres('00000000-0000-0000-0000-00000000000e') -> 'marche',
  '{"a_redetecter": 1, "a_reparer": 4, "a_refectionner": 2}'::jsonb, 'marché : à re-détecter, à réparer, à refaire');
select is(pg_temp.chiffres('00000000-0000-0000-0000-00000000000c') -> 'delais',
  '{"reparation_h": 48, "refection_chaussee_j": 30, "refection_trottoir_j": 30}'::jsonb, 'délais du marché');

-- -----------------------------------------------------------------------------
-- 3. À faire, par rôle : urgentes d'abord, puis les plus anciennes
-- -----------------------------------------------------------------------------
select results_eq($$ select * from pg_temp.actions('00000000-0000-0000-0000-00000000000b') $$,
  $$ values ('redetection', '5', true), ('photo', '8', false), ('photo', '3', false), ('photo', '2', false),
            ('photo', '7', false), ('photo', '4', false), ('photo', '6', false) $$,
  'Détection : re-détection urgente, puis ses fuites sans photo (achevée exclue), plus anciennes d''abord');
select results_eq($$ select * from pg_temp.actions('00000000-0000-0000-0000-00000000000c') $$,
  $$ values ('reparation', '3', true), ('reparation', '7', true), ('reparation', '4', false), ('finir_reparation', '6', false) $$,
  'Réparation : au-delà de 48 h d''abord, puis détectée, puis en cours');
select results_eq($$ select * from pg_temp.actions('00000000-0000-0000-0000-00000000000e') $$,
  $$ values ('refection', '8', true), ('refection', '2', false) $$,
  'Réfection : chaussée hors délai d''abord');
select results_eq($$ select distinct type from pg_temp.actions('00000000-0000-0000-0000-00000000000d') order by 1 $$,
  $$ values ('finir_reparation'), ('redetection'), ('refection'), ('reparation') $$,
  'trois rôles : toutes les actions du marché (aucune photo : pas de fuite à lui)');
select is((select emplacement from mes_actions('aaaaaaaa-0000-0000-0000-000000000001') where type = 'refection' and numero_affiche = '8'),
  'chaussee', 'réfection : emplacement de la fouille');

-- -----------------------------------------------------------------------------
-- 4. Étape renvoyée : action « à corriger » jusqu'à ce que l'agent la reprenne
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select renvoyer_etape('reparation', 'aaaaaaaa-2222-0000-0000-000000000002', 'Photo après manquante');
select renvoyer_etape('detection', 'aaaaaaaa-1111-0000-0000-000000000004', 'Adresse à préciser');

select results_eq($$ select type, numero, urgent from pg_temp.actions('00000000-0000-0000-0000-00000000000c') where type like 'corriger%' $$,
  $$ values ('corriger_reparation', '2', true) $$, 'Réparation : sa réparation renvoyée, urgente');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((select motif from mes_actions('aaaaaaaa-0000-0000-0000-000000000001') where type = 'corriger_reparation'),
  'Photo après manquante', 'motif du renvoi joint');
select results_eq($$ select type, numero, urgent from pg_temp.actions('00000000-0000-0000-0000-00000000000b') where type like 'corriger%' $$,
  $$ values ('corriger_detection', '4', true) $$, 'Détection : sa détection renvoyée');
select is((select count(*)::int from pg_temp.actions('00000000-0000-0000-0000-00000000000d') where type like 'corriger%'), 0,
  'un autre compte ne voit pas les renvois des autres');

-- Changement posé par le serveur après le renvoi (statut) : l'action reste
reset role;
insert into journal (marche_id, table_nom, ligne_id, operation, changements, utilisateur_id, le) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'reparations', 'aaaaaaaa-2222-0000-0000-000000000002', 'modification',
   '{"statut": ["a", "b"], "validee_le": [null, null]}', '00000000-0000-0000-0000-00000000000c', now() + interval '1 minute');
set local role authenticated;
select is((select count(*)::int from pg_temp.actions('00000000-0000-0000-0000-00000000000c') where type = 'corriger_reparation'), 1,
  'changement du serveur seulement : toujours à corriger');

-- L'agent corrige (journal daté après le renvoi, la transaction d'essai figeant now())
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
update reparations set observation = 'Photo ajoutée' where id = 'aaaaaaaa-2222-0000-0000-000000000002';
reset role;
update journal set le = now() + interval '2 minutes'
 where table_nom = 'reparations' and ligne_id = 'aaaaaaaa-2222-0000-0000-000000000002' and changements ? 'observation';
set local role authenticated;
select is((select count(*)::int from pg_temp.actions('00000000-0000-0000-0000-00000000000c') where type = 'corriger_reparation'), 0,
  'reprise par l''agent : l''action disparaît');
select is((select count(*)::int from pg_temp.actions('00000000-0000-0000-0000-00000000000b') where type = 'corriger_detection'), 1,
  'la détection renvoyée reste tant qu''elle n''est pas reprise');

-- -----------------------------------------------------------------------------
-- 5. Isolation et marché désactivé
-- -----------------------------------------------------------------------------
select is(pg_temp.chiffres('00000000-0000-0000-0000-00000000000f'), null, 'compte d''un autre marché : rien');
select is((select count(*)::int from pg_temp.actions('00000000-0000-0000-0000-00000000000f')), 0,
  'compte d''un autre marché : aucune action');

reset role;
update marches set actif = false where id = 'aaaaaaaa-0000-0000-0000-000000000001';
set local role authenticated;
select is(pg_temp.chiffres('00000000-0000-0000-0000-00000000000b') -> 'roles',
  '{"detection": false, "reparation": false, "refection": false}'::jsonb, 'marché désactivé : aucun rôle de saisie');
select is((select count(*)::int from pg_temp.actions('00000000-0000-0000-0000-00000000000d')), 0,
  'marché désactivé : rien à faire');

select * from finish();
rollback;
