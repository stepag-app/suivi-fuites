-- =============================================================================
-- Essai de charge (docs/essai-charge-3000.md) : compter_fuites, resume_a_attacher,
-- etat_balayage_compact. Mêmes résultats que les lectures ligne à ligne qu'elles
-- remplacent, sous la RLS de l'appelant, et sans plafond à 1 000 lignes.
-- Marché DEMO (25 fuites de démonstration) ; tout est annulé à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

-- a = admin, b = détection DEMO, c = chef de réparation DEMO, d = responsable SRM (rien sur DEMO)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chef.a@test.local',  '{"identifiant": "chef.a", "nom_complet": "Chef A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}');
update profils set est_admin = true where identifiant = 'issam';
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'de000000-0000-4000-8000-000000000000', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', 'de000000-0000-4000-8000-000000000000', 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', (select id from marches where code = 'SRM-4500004453'), 'responsable');

-- Une fuite supprimée (jamais comptée)
update fuites set supprime_le = now()
 where id = (select id from fuites where marche_id = 'de000000-0000-4000-8000-000000000000' and statut = 'achevee' order by numero limit 1);

-- 1 200 tronçons balayés sur DEMO (au-delà du plafond de 1 000 lignes de l'API), deux équipes,
-- un second passage sur les 100 premiers, un balayage annulé (ignoré)
create temporary table t_equipes as
select (row_number() over (order by numero) - 1)::int as rang, id
  from equipes where marche_id = 'de000000-0000-4000-8000-000000000000' and type = 'detection';
insert into troncons (marche_id, reference, categorie, secteur_id, geom)
select 'de000000-0000-4000-8000-000000000000', 'CHG-' || n, 'conduite',
       case when n <= 600 then (select id from secteurs where marche_id = 'de000000-0000-4000-8000-000000000000' order by code limit 1) end,
       st_setsrid(st_makeline(st_makepoint(-1.90 + n * 0.00002, 34.68), st_makepoint(-1.90 + n * 0.00002, 34.6801)), 4326)
  from generate_series(1, 1200) n;
insert into balayages (marche_id, troncon_id, date_balayage, balaye_le, equipe_id, agent_id, saisi_par, methode)
select t.marche_id, t.id, date '2026-09-01', timestamptz '2026-09-01 10:00+01',
       (select q.id from t_equipes q where q.rang = right(t.reference, 1)::int % 2),
       '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'ecoute'
  from troncons t where t.reference like 'CHG-%';
insert into balayages (marche_id, troncon_id, date_balayage, balaye_le, equipe_id, agent_id, saisi_par, methode)
select t.marche_id, t.id, date '2026-09-20', timestamptz '2026-09-20 10:00+01', null, '00000000-0000-0000-0000-00000000000c',
       '00000000-0000-0000-0000-00000000000c', 'correlation'
  from troncons t where t.reference in (select 'CHG-' || n from generate_series(1, 100) n);
update balayages set annule_le = now(), annule_par = '00000000-0000-0000-0000-00000000000a', motif_annulation = 'essai'
 where id = (select b.id from balayages b join troncons t on t.id = b.troncon_id where t.reference = 'CHG-1200');

-- État décodé depuis la forme compacte (mêmes colonnes que etat_balayage)
create function pg_temp.etat_decode(p jsonb)
returns table (troncon_id uuid, premier_le date, dernier_le date, nb_passages integer, equipe_id uuid, agent_id uuid)
language sql as $$
  select (t.v #>> '{}')::uuid, (p -> 'p' ->> (t.i - 1)::int)::date, (p -> 'd' ->> (t.i - 1)::int)::date,
         (p -> 'n' ->> (t.i - 1)::int)::integer,
         (p -> 'equipes' ->> (p -> 'e' ->> (t.i - 1)::int)::int)::uuid,
         (p -> 'agents' ->> (p -> 'a' ->> (t.i - 1)::int)::int)::uuid
    from jsonb_array_elements(p -> 't') with ordinality t (v, i)
$$;
grant execute on function pg_temp.etat_decode(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 1. Privilèges
-- -----------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.compter_fuites(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.resume_a_attacher(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.etat_balayage_compact(uuid, uuid[])', 'execute'),
  'anon : aucune des trois fonctions');
select ok(has_function_privilege('authenticated', 'public.compter_fuites(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.resume_a_attacher(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.etat_balayage_compact(uuid, uuid[])', 'execute'),
  'authenticated : les trois fonctions');
select is((select prosecdef from pg_proc where oid = 'public.compter_fuites(uuid)'::regprocedure)
          or (select prosecdef from pg_proc where oid = 'public.resume_a_attacher(uuid)'::regprocedure)
          or (select prosecdef from pg_proc where oid = 'public.etat_balayage_compact(uuid, uuid[])'::regprocedure),
  false, 'les trois fonctions s''exécutent avec les droits de l''appelant (RLS)');

-- -----------------------------------------------------------------------------
-- 2. compter_fuites
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select results_eq(
  $$ select statut::text, nb from compter_fuites('de000000-0000-4000-8000-000000000000') order by statut::text $$,
  $$ values ('achevee', 13), ('detectee', 3), ('en_reparation', 1), ('reparee', 3), ('sans_reparation', 4) $$,
  'admin : comptage par statut du marché DEMO, fuite supprimée exclue');
select results_eq(
  $$ select marche_id, statut, nb from compter_fuites() order by 1, 2 $$,
  $$ select marche_id, statut, count(*)::integer from v_fuites group by 1, 2 order by 1, 2 $$,
  'admin : tous les marchés, identique à un comptage de v_fuites');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select sum(nb)::integer from compter_fuites('de000000-0000-4000-8000-000000000000')), 24,
  'détection DEMO : 24 fuites comptées');
select is((select count(*)::integer from compter_fuites() where marche_id <> 'de000000-0000-4000-8000-000000000000'), 0,
  'détection DEMO : aucun autre marché');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is((select count(*)::integer from compter_fuites('de000000-0000-4000-8000-000000000000')), 0,
  'responsable SRM : rien sur DEMO (RLS)');
select is((select count(*)::integer from compter_fuites()), 0, 'responsable SRM : aucune fuite visible');

-- -----------------------------------------------------------------------------
-- 3. resume_a_attacher
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select ok((select count(*) from v_a_attacher where marche_id = 'de000000-0000-4000-8000-000000000000' and reste <> 0) > 0,
  'admin : DEMO a des unités à attacher (sinon l''essai ne prouve rien)');
select results_eq(
  $$ select (a ->> 'prix_id')::uuid, (a ->> 'reste')::numeric, (a ->> 'unites')::integer
       from jsonb_array_elements(resume_a_attacher('de000000-0000-4000-8000-000000000000') -> 'articles') a $$,
  $$ select prix_id, sum(reste), count(*)::integer from v_a_attacher
      where marche_id = 'de000000-0000-4000-8000-000000000000' and reste <> 0 group by prix_id order by prix_id $$,
  'admin : reste par article identique à v_a_attacher');
select is(
  (select jsonb_build_array(r -> 'unites', r -> 'fuites', r -> 'unites_en_brouillon')
     from resume_a_attacher('de000000-0000-4000-8000-000000000000') r),
  (select jsonb_build_array(count(*), count(distinct fuite_id), count(*) filter (where brouillon_id is not null))
     from v_a_attacher where marche_id = 'de000000-0000-4000-8000-000000000000' and reste <> 0),
  'admin : unités, fuites et unités en brouillon identiques à v_a_attacher');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is(resume_a_attacher('de000000-0000-4000-8000-000000000000'),
  '{"articles": [], "unites": 0, "fuites": 0, "unites_en_brouillon": 0}'::jsonb,
  'détection DEMO : rien à attacher visible (pas de droit sur les quantités)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is(resume_a_attacher('de000000-0000-4000-8000-000000000000') -> 'unites', '0'::jsonb,
  'responsable SRM : rien sur DEMO');

-- -----------------------------------------------------------------------------
-- 4. etat_balayage_compact
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is(jsonb_array_length(etat_balayage_compact('de000000-0000-4000-8000-000000000000') -> 't'), 1199,
  'admin : 1 199 tronçons balayés en un seul document (au-delà de 1 000, balayage annulé ignoré)');
select results_eq(
  $$ select * from pg_temp.etat_decode(etat_balayage_compact('de000000-0000-4000-8000-000000000000')) order by troncon_id $$,
  $$ select * from etat_balayage('de000000-0000-4000-8000-000000000000') order by troncon_id $$,
  'admin : forme compacte identique à etat_balayage (dates, passages, équipe et agent du dernier passage)');
select is((select count(*)::integer from pg_temp.etat_decode(etat_balayage_compact('de000000-0000-4000-8000-000000000000'))
            where nb_passages = 2 and dernier_le = '2026-09-20' and equipe_id is null
              and agent_id = '00000000-0000-0000-0000-00000000000c'), 100,
  'admin : second passage sans équipe repris (équipe nulle, agent du dernier passage)');
select is(jsonb_array_length(etat_balayage_compact('de000000-0000-4000-8000-000000000000') -> 'equipes'), 2,
  'admin : dictionnaire des deux équipes');
select results_eq(
  $$ select * from pg_temp.etat_decode(etat_balayage_compact('de000000-0000-4000-8000-000000000000',
       array[(select secteur_id from troncons where reference = 'CHG-1' )]::uuid[])) order by troncon_id $$,
  $$ select * from etat_balayage('de000000-0000-4000-8000-000000000000',
       array[(select secteur_id from troncons where reference = 'CHG-1')]::uuid[]) order by troncon_id $$,
  'admin : filtre par secteurs identique à etat_balayage');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is(jsonb_array_length(etat_balayage_compact('de000000-0000-4000-8000-000000000000') -> 't'), 1199,
  'détection DEMO : état complet visible (balayage / lire)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select is(etat_balayage_compact('de000000-0000-4000-8000-000000000000'),
  '{"t": [], "p": [], "d": [], "n": [], "e": [], "a": [], "equipes": [], "agents": []}'::jsonb,
  'responsable SRM : rien sur DEMO (document vide, pas d''erreur)');
select is(jsonb_array_length(etat_balayage_compact((select id from marches where code = 'SRM-4500004453')) -> 't'), 0,
  'responsable SRM : marché sans balayage, document vide');

reset role;
select * from finish();
rollback;
