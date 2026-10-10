-- =============================================================================
-- Chantier v3, S12 (E1) : plus d'équipe dans les vues ni dans les fonctions. Le chef d'équipe
-- est le compte qui a saisi la réparation (auteur_terrain_id). La table equipes et les colonnes
-- equipe_id restent (E4), désactivées et inutilisées.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

-- -----------------------------------------------------------------------------
-- 1. Structure : plus rien ne lit les équipes
-- -----------------------------------------------------------------------------
select is((select count(*)::int
             from pg_depend d
             join pg_rewrite r on r.oid = d.objid
             join pg_class v on v.oid = r.ev_class and v.relkind in ('v', 'm')
             join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
            where d.classid = 'pg_rewrite'::regclass and v.oid <> d.refobjid
              and a.attname = 'equipe_id'), 0,
  'aucune vue ne dépend d''une colonne equipe_id');
select is((select count(*)::int
             from pg_depend d
             join pg_rewrite r on r.oid = d.objid
             join pg_class v on v.oid = r.ev_class
            where d.classid = 'pg_rewrite'::regclass and d.refobjid = 'public.equipes'::regclass
              and v.oid <> d.refobjid), 0,
  'aucune vue ne dépend de la table equipes');
select is((select string_agg(c.relname || '.' || a.attname, ', ')
             from pg_class c
             join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
              and a.attname ~ '^equipe'), null,
  'aucune vue exposée n''a de colonne d''équipe');
select is((select string_agg(n.nspname || '.' || p.proname, ', ')
             from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'private')
              and (p.prosrc ~ '\mequipes?\M|\mequipe_id\M' or pg_get_function_result(p.oid) ~ 'equipe')), null,
  'aucune fonction ne lit ni ne copie d''équipe');
select is((select count(*)::int from equipes where actif), 0, 'équipes désactivées (APK installées : choix masqué)');
select is((select count(*)::int from libelles_listes where liste = 'type_equipe' and actif), 0,
  'liste « type d''équipe » désactivée');

-- -----------------------------------------------------------------------------
-- 2. Regroupements : « par chef d'équipe » à la place de « par équipe »
-- -----------------------------------------------------------------------------
select throws_ok($$ update parametres_attachement set regroupement = 'equipe' $$, '23514', null,
  'attachement : regroupement par équipe refusé');
select lives_ok($$ update parametres_attachement set regroupement = 'chef' $$,
  'attachement : regroupement par chef d''équipe');
select throws_ok($$ insert into modeles_export (marche_id, nom, jeu, regroupement)
                    values ((select id from marches where code = 'DEMO'), 'S12 essai', 'pieces', 'equipe') $$, '23514', null,
  'modèle d''export : regroupement par équipe refusé');
select is((select count(*)::int from modeles_export
            where regroupement = 'equipe' or colonnes && array['equipe', 'equipe_reparation'] or filtres ? 'equipe'), 0,
  'modèles d''export : plus de colonne, de filtre ni de regroupement « équipe »');

-- -----------------------------------------------------------------------------
-- 3. Chef d'équipe = compte de la réparation (marché DEMO)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'chef.s12@test.local', '{"identifiant": "chef.s12", "nom_complet": "Chef S12"}');
create temporary table t_rep as
select r.id, r.fuite_id
  from reparations r join fuites f on f.id = r.fuite_id
 where r.marche_id = 'de000000-0000-4000-8000-000000000000' and r.supprime_le is null and f.supprime_le is null
   and r.resultat = 'reparee'
   and r.realisee_le = (select max(x.realisee_le) from reparations x where x.fuite_id = r.fuite_id and x.supprime_le is null)
   and exists (select 1 from lignes_quantites l where l.reparation_id = r.id and l.supprime_le is null)
 order by f.numero
 limit 1;
set local session_replication_role = replica;   -- donnée d'essai posée sans les contrôles de saisie
update reparations set auteur_terrain_id = '00000000-0000-0000-0000-0000000000c1' where id = (select id from t_rep);
set local session_replication_role = origin;

select results_eq($$ select chef_reparation_id::text, chef_reparation from v_fuites_export where id = (select fuite_id from t_rep) $$,
  $$ values ('00000000-0000-0000-0000-0000000000c1', 'Chef S12') $$,
  'v_fuites_export : chef d''équipe de la dernière réparation (compte et nom)');
select is((select count(*)::int from v_quantites where reparation_id = (select id from t_rep)
            and chef_equipe_id is distinct from '00000000-0000-0000-0000-0000000000c1'), 0,
  'v_quantites : lignes de la réparation au chef d''équipe');
select results_eq($$ select distinct chef_equipe_id::text, chef_equipe from v_a_attacher where fuite_id = (select fuite_id from t_rep) $$,
  $$ values ('00000000-0000-0000-0000-0000000000c1', 'Chef S12') $$,
  'v_a_attacher : chef d''équipe de la dernière réparation');
select is((select count(*)::int from v_refections_dues
            where chef_equipe_id is distinct from (select r.auteur_terrain_id from reparations r where r.id = reparation_id)), 0,
  'v_refections_dues : chef d''équipe = compte de la réparation');

select * from finish();
rollback;
