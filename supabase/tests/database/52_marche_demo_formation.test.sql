-- =============================================================================
-- Marché de démonstration pour la formation (20261016400000) : private.creer_marche_demo. Dans le jeu de
-- migrations, l'ancien DEMO existe encore (la migration ne crée donc rien) : la fonction est appelée avec un
-- autre code. Paramétrage copié du SRM, 10 fuites de statuts différents, aucune notification, isolation.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

select id as srm from marches where code = 'SRM-4500004453' \gset
\set demo de000002-0000-4000-8000-000000000000

select is((select count(*)::int from marches where id = :'demo'), 0, 'migration : rien créé tant qu''un DEMO existe');

-- Réseau minimal du SRM (le jeu de migrations n'en a pas) : un tronçon et un nœud dans le premier secteur
select s.id as sect, s.zone_id as zone from secteurs s where s.marche_id = :'srm' order by s.code limit 1 \gset
insert into troncons (marche_id, reference, secteur_id, zone_id, geom)
values (:'srm', 'T-ESSAI-1', :'sect', :'zone', st_geomfromtext('LINESTRING(-1.910 34.680, -1.911 34.681)', 4326));
insert into noeuds (marche_id, reference, secteur_id, zone_id, geom)
values (:'srm', 'N-ESSAI-1', :'sect', :'zone', st_geomfromtext('POINT(-1.910 34.680)', 4326));

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'det@test.local', '{"identifiant": "det", "nom_complet": "Détection"}');
select appliquer_modele_role('00000000-0000-0000-0000-0000000000d1', :'srm', 'detection');

select is(private.creer_marche_demo('DEMO-F')::text, :'demo', 'marché créé sous son identifiant propre');
select is(private.creer_marche_demo('DEMO-F'), null, 'second appel : rien');

select is((select count(*)::int from fuites where marche_id = :'demo'), 10, '10 fuites');
select is(
  (select string_agg(statut::text || '=' || n, ' ' order by statut)
     from (select statut, count(*) n from fuites where marche_id = :'demo' group by statut) x),
  'detectee=3 en_reparation=2 reparee=2 achevee=2 sans_reparation=1', 'statuts variés');
select is((select array_agg(numero order by numero) from fuites where marche_id = :'demo'),
  array[1,2,3,4,5,6,7,8,9,10], 'numéros 1 à 10');
select is((select valeur::int from private.compteurs where marche_id = :'demo' and cle = 'fuite'), 10,
  'prochaine fuite : N° 11');
select is((select count(*)::int from fuites where marche_id = :'demo' and (secteur_id is null or position is null
            or nature_degradation_id is null or reference_srm is null)), 0, 'champs obligatoires remplis');
select is((select count(*)::int from notifications where marche_id = :'demo'), 0, 'aucune notification');
select ok((select count(*) from lignes_quantites where marche_id = :'demo') > 0, 'quantités générées');

select is((select count(*)::int from secteurs where marche_id = :'demo'),
          (select count(*)::int from secteurs where marche_id = :'srm'), 'secteurs copiés');
select is((select count(*)::int from prix where marche_id = :'demo'),
          (select count(*)::int from prix where marche_id = :'srm'), 'bordereau copié');
select is((select secteur_id from troncons where marche_id = :'demo'), md5(:'demo' || ':' || :'sect')::uuid,
  'réseau copié, rattaché au secteur copié');
select is((select count(*)::int from noeuds where marche_id = :'demo'), 1, 'nœuds copiés');
select is((select count(*)::int from fuites where marche_id = :'srm'), 0, 'rien écrit dans le SRM');

-- Agent du SRM seulement : ne voit pas DEMO
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated"}', true);
select is((select count(*)::int from fuites where marche_id = :'demo'), 0, 'agent du SRM : DEMO invisible');
reset role;

select * from finish();
rollback;
