-- =============================================================================
-- Tests de la migration 1 : isolation par marché, droits CRUD, verrouillage,
-- suppression logique, numérotation, statuts automatiques, lignes de prix,
-- re-détection, stockage des photos, journal.
--
-- Lancement : supabase test db   (ou pg_prove, voir supabase/README.md)
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(64);

-- -----------------------------------------------------------------------------
-- Jeu d'essai (rôle postgres)
-- Utilisateurs : a = admin, b = détection A, c = chef réparation A,
-- d = responsable A, e = détection B, f = détection A révoqué
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chef.a@test.local',  '{"identifiant": "chef.a", "nom_complet": "Chef A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}'),
  ('00000000-0000-0000-0000-00000000000e', 'agent.b@test.local', '{"identifiant": "agent.b", "nom_complet": "Agent B"}'),
  ('00000000-0000-0000-0000-00000000000f', 'ancien@test.local',  '{"identifiant": "ancien", "nom_complet": "Ancien agent"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client, taux_majoration) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-A', '1', 'Marché A', 'Client A', 15),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-B', '2', 'Marché B', 'Client B', 0);

select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'bbbbbbbb-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000f', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
update profils set actif = false where identifiant = 'ancien';

insert into prix (marche_id, numero, ordre, designation, unite, pu_ht, famille, materiaux, diametre_min_mm, diametre_max_mm) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '3', 3, 'Terrassement', 'm3', 50, 'terrassement', null, null, null),
  ('aaaaaaaa-0000-0000-0000-000000000001', '4', 4, 'Réfection trottoir', 'm2', 100, 'refection', null, null, null),
  ('aaaaaaaa-0000-0000-0000-000000000001', '6', 6, 'PE DE < 40', 'u', 400, 'reparation_tuyau', array['polyethylene'], null, 39),
  ('aaaaaaaa-0000-0000-0000-000000000001', '7', 7, 'Robinet PEC', 'u', 460, 'robinet_pec', null, null, null),
  ('aaaaaaaa-0000-0000-0000-000000000001', '9', 9, 'PE DE >= 40', 'u', 400, 'reparation_tuyau', array['polyethylene'], 40, null),
  ('aaaaaaaa-0000-0000-0000-000000000001', '10', 10, 'Bouche à clé', 'u', 140, 'bouche_a_cle', null, null, null),
  ('aaaaaaaa-0000-0000-0000-000000000001', '12', 12, 'AC/PVC 110-200', 'u', 2900, 'reparation_tuyau', array['amiante_ciment', 'pvc'], 110, 200);

insert into natures_refection (id, marche_id, code, libelle_fr, emplacement, prix_id)
select 'cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'beton', 'Béton', 'trottoir', p.id
  from prix p where p.marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and p.numero = '4';

insert into motifs (id, marche_id, categorie, code, libelle_fr, terrassement_paye) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'sans_reparation', 'sondage_negatif', 'Sondage négatif', true);

-- Une fuite du marché B, signalée par l'agent B. Elle est créée en premier et
-- par un utilisateur (et non par postgres) : PostgreSQL ne revérifie pas le droit
-- EXECUTE d'une fonction déjà appelée dans la transaction, un premier appel en
-- postgres masquerait donc un droit manquant.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
insert into fuites (id, marche_id, reference_srm) values
  ('bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '999-999-999');
reset role;
select set_config('request.jwt.claims', '', true);

-- -----------------------------------------------------------------------------
-- 0. Structure : RLS partout, rien pour anon, fonctions internes non exécutables
-- -----------------------------------------------------------------------------
select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
$$, 'RLS activée sur toutes les tables du schéma public');

select is_empty($$
  select table_name from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'
$$, 'anon : aucun privilège sur les tables');

select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute')
$$, 'anon : aucune fonction exécutable');

select ok(not has_function_privilege('authenticated', 'private.generer_lignes_reparation(uuid)', 'execute'),
  'authenticated : ne peut pas appeler directement la génération des lignes');

-- service_role (Edge Functions côté serveur) : contourne la RLS, mais les
-- déclencheurs doivent fonctionner (numérotation, journal)
set local role service_role;
select lives_ok($$ insert into fuites (id, marche_id) values
  ('bbbbbbbb-1111-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  'service_role : enregistre une fuite (déclencheurs exécutables)');
reset role;
select is((select numero from fuites where id = 'bbbbbbbb-1111-0000-0000-000000000002'), 2,
  'service_role : numérotation appliquée');

-- Ce que fait la fonction gerer-utilisateurs : lire le profil de l'appelant,
-- appliquer un modèle de rôle, modifier un profil.
set local role service_role;
select lives_ok($$ select est_admin, actif from profils where id = '00000000-0000-0000-0000-00000000000a' $$,
  'service_role : lit les profils');
select lives_ok($$ select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'bbbbbbbb-0000-0000-0000-000000000001', 'detection') $$,
  'service_role : applique un modèle de rôle');
select lives_ok($$ update profils set telephone = '0600000000' where id = '00000000-0000-0000-0000-00000000000c' $$,
  'service_role : modifie un profil');
reset role;

-- -----------------------------------------------------------------------------
-- 1. Anonyme : aucun accès
-- -----------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select count(*) from fuites $$, '42501', null, 'anon : aucun accès aux fuites');
select throws_ok($$ select count(*) from marches $$, '42501', null, 'anon : aucun accès aux marchés');
reset role;

-- -----------------------------------------------------------------------------
-- 2. Agent de détection du marché A
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);

select results_eq($$ select code from marches $$, array['TEST-A'], 'détection A : ne voit que le marché A');

select lives_ok($$
  insert into fuites (id, marche_id, reference_srm, position, saisi_par, numero)
  values ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '302-684-001',
          extensions.st_setsrid(extensions.st_makepoint(-1.9100, 34.6800), 4326)::extensions.geography,
          '00000000-0000-0000-0000-00000000000e', 999)
$$, 'détection A : signale une fuite dans son marché');

select results_eq($$ select numero, saisi_par::text, auteur_terrain_id::text from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values (1, '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b') $$,
  'numéro attribué par le serveur ; saisi_par et auteur forcés au compte connecté');

select throws_ok($$
  insert into fuites (marche_id) values ('bbbbbbbb-0000-0000-0000-000000000001')
$$, '42501', null, 'détection A : ne peut pas créer dans le marché B');

select is((select count(*)::int from fuites where marche_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 0,
  'détection A : ne voit pas les fuites du marché B');

select lives_ok($$ update fuites set adresse = 'Rue 1' where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  'détection A : modifie sa propre fuite');

select throws_ok($$ update fuites set supprime_le = now() where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  '42501', 'Suppression non autorisée', 'détection A : pas de droit de suppression');

select throws_ok($$ delete from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  '42501', 'permission denied for table fuites', 'suppression physique interdite à tous');

select is((select count(*)::int from prix), 0, 'détection A : ne voit pas les prix');
select is((select count(*)::int from journal), 0, 'détection A : ne lit pas le journal');

select throws_ok($$
  insert into reparations (marche_id, fuite_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001')
$$, '42501', null, 'détection A : ne saisit pas de réparation');

select throws_ok($$ update profils set est_admin = true where id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', 'Seule la langue du profil peut être modifiée par l''utilisateur', 'un agent ne peut pas se donner les droits d''administrateur');

select lives_ok($$ update profils set langue = 'ar' where id = '00000000-0000-0000-0000-00000000000b' $$,
  'un agent change sa langue');

select throws_ok($$
  select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001', 'responsable')
$$, '42501', 'Réservé à l''administrateur', 'un agent ne peut pas s''attribuer un rôle');

select throws_ok($$ insert into droits (profil_id, marche_id, type_donnee, lire)
  values ('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'quantites', true) $$,
  '42501', null, 'un agent ne peut pas modifier ses droits');

-- Re-détection : à ~10 m, à ~30 m, même référence
select is((select count(*)::int from rechercher_fuites_proches('aaaaaaaa-0000-0000-0000-000000000001', 34.68009, -1.9100)), 1,
  're-détection : fuite trouvée à 10 m (rayon 15 m)');
select is((select count(*)::int from rechercher_fuites_proches('aaaaaaaa-0000-0000-0000-000000000001', 34.68027, -1.9100)), 0,
  're-détection : rien à 30 m');
select is((select count(*)::int from rechercher_fuites_proches('aaaaaaaa-0000-0000-0000-000000000001', null, null, '302-684-001')), 1,
  're-détection : même référence SRM');

-- Stockage des photos
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
  values ('photos', 'aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-1111-0000-0000-000000000001/p1.jpg', '00000000-0000-0000-0000-00000000000b') $$,
  'photo envoyée dans le dossier du marché A');
select throws_ok($$ insert into storage.objects (bucket_id, name)
  values ('photos', 'bbbbbbbb-0000-0000-0000-000000000001/x/p1.jpg') $$,
  '42501', null, 'photo refusée dans le dossier du marché B');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('photos', 'sans-dossier.jpg') $$,
  '42501', null, 'photo refusée hors dossier de marché');

reset role;

-- -----------------------------------------------------------------------------
-- 3. Chef d'équipe de réparation du marché A
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);

select throws_ok($$ update fuites set adresse = 'Autre' where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  '42501', 'Modification non autorisée', 'chef : ne modifie pas une fuite signalée par un autre');

select lives_ok($$
  insert into reparations (id, marche_id, fuite_id, materiau, diametre_mm, tuyau_repare,
                           fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m,
                           emplacement, nature_revetement_id)
  values ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-1111-0000-0000-000000000001', 'polyethylene', 32, true, 1.5, 0.6, 0.8,
          'trottoir', 'cccccccc-0000-0000-0000-000000000001')
$$, 'chef : saisit une réparation PE DE 32');

select is((select statut::text from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001'), 'reparee',
  'statut automatique : réparée (réfection à faire)');

select throws_ok($$
  insert into reparations (marche_id, fuite_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001')
$$, '23503', null, 'une réparation ne peut pas viser une fuite d''un autre marché');

select throws_ok($$
  insert into reparations (marche_id, fuite_id, resultat) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'non_reparee')
$$, '23514', null, 'fuite non réparée : motif obligatoire');

select lives_ok($$
  insert into refections (id, marche_id, fuite_id) values
    ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001')
$$, 'chef : saisit la réfection sans ressaisir les dimensions');

select results_eq($$ select longueur_m, largeur_m, surface_m2 from refections where id = 'aaaaaaaa-3333-0000-0000-000000000001' $$,
  $$ values (1.50::numeric, 0.60::numeric, 0.900::numeric) $$, 'réfection : L × l repris de la fouille');

select is((select statut::text from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000001'), 'achevee',
  'statut automatique : achevée après réfection');

select throws_ok($$
  insert into refections (marche_id, fuite_id, resultat) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'non_faite')
$$, '23514', null, 'clôture sans réfection : motif obligatoire');

select is((select count(*)::int from lignes_quantites), 0, 'chef : ne voit pas les quantités ni les montants');

-- Fuite 2 (signalée par le chef) : robinet PEC + bouche à clé ; fuite 3 : AC DN 150 ;
-- fuite 4 : AC DN 400 (hors bordereau) ; fuite 5 : sondage négatif
select lives_ok($$
  insert into fuites (id, marche_id) values
    ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001'),
    ('aaaaaaaa-1111-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001'),
    ('aaaaaaaa-1111-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001'),
    ('aaaaaaaa-1111-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001');
  insert into reparations (id, marche_id, fuite_id, materiau, diametre_mm, robinet_pec_change, bouche_a_cle_mise_a_niveau) values
    ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000002', 'polyethylene', 25, true, true);
  insert into reparations (marche_id, fuite_id, materiau, diametre_mm, tuyau_repare) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000003', 'amiante_ciment', 150, true),
    ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000004', 'amiante_ciment', 400, true);
  insert into reparations (marche_id, fuite_id, resultat, motif_id, fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000005', 'non_reparee', 'dddddddd-0000-0000-0000-000000000001', 1, 1, 1);
$$, 'chef : quatre autres réparations saisies');

select is((select statut::text from fuites where id = 'aaaaaaaa-1111-0000-0000-000000000005'), 'sans_reparation',
  'sondage négatif : statut « sans réparation » avec motif');

reset role;

-- -----------------------------------------------------------------------------
-- 4. Lignes de prix proposées automatiquement (vérification en postgres)
-- -----------------------------------------------------------------------------
select results_eq($$
  select p.numero, l.quantite from lignes_quantites l join prix p on p.id = l.prix_id
   where l.fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' order by p.ordre
$$, $$ values ('3', 0.720::numeric), ('4', 0.900::numeric), ('6', 1.000::numeric) $$,
  'PE DE 32 : terrassement 0,72 m3 + réfection béton 0,9 m2 + prix 6');

select results_eq($$
  select p.numero from lignes_quantites l join prix p on p.id = l.prix_id
   where l.fuite_id = 'aaaaaaaa-1111-0000-0000-000000000002' order by p.ordre
$$, $$ values ('7') $$, 'robinet PEC changé : prix 7, bouche à clé comprise (pas de prix 10)');

select results_eq($$
  select p.numero from lignes_quantites l join prix p on p.id = l.prix_id
   where l.fuite_id = 'aaaaaaaa-1111-0000-0000-000000000003'
$$, $$ values ('12') $$, 'AC DN 150 : prix 12');

select is((select count(*)::int from lignes_quantites where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000004'), 0,
  'AC DN 400 : aucun prix proposé (hors bordereau)');

select is((select count(*)::int from v_anomalies where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000004' and anomalie = 'prix_hors_bordereau'), 1,
  'AC DN 400 : signalé dans les anomalies');

select results_eq($$
  select p.numero, l.quantite from lignes_quantites l join prix p on p.id = l.prix_id
   where l.fuite_id = 'aaaaaaaa-1111-0000-0000-000000000005'
$$, $$ values ('3', 1.000::numeric) $$, 'sondage négatif : terrassement seul');

-- -----------------------------------------------------------------------------
-- 5. Responsable du marché A
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);

select lives_ok($$
  update lignes_quantites set quantite = 0.800, motif_modification = 'Profondeur relevée contradictoirement'
   where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001'
     and prix_id = (select id from prix where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and numero = '3')
$$, 'responsable : corrige une quantité');

select is((select count(*)::int from v_quantites where fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001'), 3,
  'responsable : voit les quantités et montants');

select lives_ok($$ update fuites set verrouillee_le = now() where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  'responsable : verrouille une fuite validée');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);

select throws_ok($$ update reparations set observation = 'reprise' where id = 'aaaaaaaa-2222-0000-0000-000000000001' $$,
  '42501', 'Fuite verrouillée : modification réservée au responsable', 'chef : réparation d''une fuite verrouillée non modifiable');

select lives_ok($$ update reparations set observation = 'vu' where id = 'aaaaaaaa-2222-0000-0000-000000000002' $$,
  'chef : modifie sa réparation (fuite non verrouillée)');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);

select throws_ok($$ update fuites set adresse = 'Rue 2' where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  '42501', 'Fuite verrouillée : modification réservée au responsable', 'détection : sa fuite verrouillée n''est plus modifiable');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);

select lives_ok($$ update reparations set observation = 'corrigé par le responsable' where id = 'aaaaaaaa-2222-0000-0000-000000000001' $$,
  'responsable : corrige une réparation verrouillée');

select results_eq($$
  select p.numero, l.quantite, l.origine::text from lignes_quantites l join prix p on p.id = l.prix_id
   where l.fuite_id = 'aaaaaaaa-1111-0000-0000-000000000001' order by p.ordre
$$, $$ values ('3', 0.800::numeric, 'manuel'), ('4', 0.900::numeric, 'auto'), ('6', 1.000::numeric, 'auto') $$,
  'la correction manuelle survit au recalcul automatique, sans doublon');

select lives_ok($$ update fuites set supprime_le = now() where id = 'aaaaaaaa-1111-0000-0000-000000000004' $$,
  'responsable : suppression logique d''une fuite');

select ok((select count(*) > 0 from journal where table_nom = 'fuites' and operation = 'suppression_logique'
             and utilisateur_id = '00000000-0000-0000-0000-00000000000d'),
  'journal : suppression tracée avec son auteur');

select ok((select count(*) > 0 from journal where table_nom = 'reparations' and operation = 'creation'
             and utilisateur_id = '00000000-0000-0000-0000-00000000000c'),
  'journal : réparation tracée au nom du chef');

reset role;

-- -----------------------------------------------------------------------------
-- 6. Compte révoqué, administrateur, autre marché
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
select is((select count(*)::int from fuites), 0, 'compte révoqué : ne voit plus rien');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select results_eq($$ select reference_srm from fuites order by numero $$, array['999-999-999', null], 'détection B : ne voit que les fuites du marché B');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select count(*)::int from marches where code in ('TEST-A', 'TEST-B')), 2,
  'administrateur : voit les marchés A et B');
reset role;

select * from finish();
rollback;
