-- =============================================================================
-- Tests de l'étape C : modèles d'export (valeurs par défaut, droits) et vue des
-- fuites enrichie pour les exports.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}');
insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-A', '1', 'Marché A', 'Client A');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');

insert into prix (marche_id, numero, ordre, designation, unite, pu_ht, famille, materiaux, diametre_max_mm) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '3', 3, 'Terrassement', 'm3', 50, 'terrassement', null, null),
  ('aaaaaaaa-0000-0000-0000-000000000001', '6', 6, 'PE DE < 40', 'u', 400, 'reparation_tuyau', array['polyethylene'], 39);
insert into produits_dolibarr (dolibarr_id, ref, designation, unite, famille, utilisable) values
  (9009, 'ESS09009', 'Manchon droit 32/32', 'U', 'ESS', true);
insert into fuites (id, marche_id, reference_srm) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '302-684-001');
insert into reparations (id, marche_id, fuite_id, materiau, diametre_mm, tuyau_repare, fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001',
   'polyethylene', 32, true, 1.2, 0.6, 0.8);
insert into reparation_pieces (marche_id, reparation_id, produit_id, quantite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 9009, 2);

select results_eq($$ select nom, jeu, format from modeles_export where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by ordre $$,
  $$ values ('État journalier'::text, 'fuites'::text, 'pdf'::text), ('Pièces posées par secteur', 'pieces', 'xlsx'),
            ('Attachement du mois', 'attachement', 'pdf') $$,
  'nouveau marché : trois modèles d''export par défaut');
select is((select count(*)::int from modeles_export m join marches x on x.id = m.marche_id
            where x.code = 'SRM-4500004453' and m.nom = 'État journalier SRM'), 1,
  'marché 4500004453 : « État journalier SRM »');

select results_eq($$ select materiau::text, volume_m3, pieces_posees, quantites from v_fuites_export
                      where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  $$ values ('polyethylene'::text, 0.576::numeric, 'Manchon droit 32/32 × 2'::text, 'P3 : 0.576 m3 ; P6 : 1 u'::text) $$,
  'export des fuites : réparation, pièces et quantités sur la même ligne');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select count(*)::int from modeles_export), 3, 'responsable : lit les modèles de son marché');
select lives_ok($$ insert into modeles_export (marche_id, nom, jeu, colonnes, format) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Réparations de la semaine', 'fuites', array['numero', 'materiau'], 'xlsx') $$,
  'responsable : enregistre un modèle');
select is((select saisi_par::text from modeles_export where nom = 'Réparations de la semaine'),
  '00000000-0000-0000-0000-00000000000d', 'modèle : auteur enregistré');
select throws_ok($$ insert into modeles_export (marche_id, nom, jeu) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Réparations de la semaine', 'fuites') $$,
  '23505', null, 'deux modèles ne portent pas le même nom');
select lives_ok($$ update modeles_export set actif = false where nom = 'Réparations de la semaine' $$,
  'responsable : retire un modèle');
select is((select quantites from v_fuites_export where id = 'aaaaaaaa-1111-0000-0000-000000000001'), 'P3 : 0.576 m3 ; P6 : 1 u',
  'responsable : voit les quantités dans l''export');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from modeles_export), 0, 'détection : aucun modèle d''export (pas de droit « exports »)');
reset role;

select * from finish();
rollback;
