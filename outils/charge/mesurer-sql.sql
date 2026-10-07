-- =============================================================================
-- Essai de charge : temps SQL des lectures principales sous RLS (base LOCALE).
--
--   psql -d charge_3000 -v uid=c0000000-0000-4000-8000-000000000001 -f outils/charge/mesurer-sql.sql
--
-- :uid = profil dont on prend les droits (rôle « authenticated », RLS active).
-- Chaque requête est jouée 3 fois ; on garde la médiane du temps d'exécution
-- (EXPLAIN ANALYZE) et le volume JSON produit (row_to_json, proche de PostgREST).
-- =============================================================================
\set ON_ERROR_STOP on
\if :{?uid}
\else
  \set uid c0000000-0000-4000-8000-000000000007
\endif
\pset pager off

create or replace function pg_temp.mesurer(p_nom text, p_sql text)
returns table (requete text, ms numeric, lignes bigint, octets_json bigint)
language plpgsql as $$
declare
  _plan json;
  _t numeric[] := '{}';
  _n bigint;
  _o bigint;
begin
  for i in 1..3 loop
    execute 'explain (analyze, format json) ' || p_sql into _plan;
    _t := _t || ((_plan -> 0 ->> 'Execution Time')::numeric + (_plan -> 0 ->> 'Planning Time')::numeric);
    _n := (_plan -> 0 -> 'Plan' ->> 'Actual Rows')::bigint;
  end loop;
  execute format('select coalesce(sum(octet_length(row_to_json(x)::text)), 0) from (%s) x', p_sql) into _o;
  return query select p_nom, round((select percentile_disc(0.5) within group (order by v) from unnest(_t) v), 1), _n, _o;
end
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'uid', 'role', 'authenticated')::text, true);
select :'uid' as compte, (select identifiant from public.profils where id = :'uid') as identifiant;

select * from pg_temp.mesurer('v_fuites * (toutes)',
  $q$ select * from public.v_fuites where marche_id = 'de000000-0000-4000-8000-000000000000' order by numero $q$)
union all select * from pg_temp.mesurer('v_fuites * (1re page de 1 000)',
  $q$ select * from public.v_fuites where marche_id = 'de000000-0000-4000-8000-000000000000' order by numero limit 1000 $q$)
union all select * from pg_temp.mesurer('v_fuites (liste, colonnes réduites)',
  $q$ select id, numero, reference_srm, origine, statut, zone, secteur_id, secteur, adresse, date_detection,
            derniere_reparation_le, derniere_refection_le, emplacement_fouille, nb_photos, verrouillee_le, detectee_par,
            alerte_non_reparee, alerte_communication_srm, alerte_refection_chaussee, refection_chaussee_hors_delai,
            alerte_refection_trottoir, alerte_sans_photo
       from public.v_fuites where marche_id = 'de000000-0000-4000-8000-000000000000' order by numero $q$)
union all select * from pg_temp.mesurer('v_fuites (statuts de tous les marchés)',
  $q$ select marche_id, statut from public.v_fuites order by numero $q$)
union all select * from pg_temp.mesurer('v_fuites en alerte',
  $q$ select * from public.v_fuites where marche_id = 'de000000-0000-4000-8000-000000000000'
        and (alerte_non_reparee or alerte_communication_srm or alerte_refection_chaussee or refection_chaussee_hors_delai
             or alerte_refection_trottoir or alerte_sans_photo) order by numero $q$)
union all select * from pg_temp.mesurer('v_anomalies',
  $q$ select fuite_id, anomalie from public.v_anomalies where marche_id = 'de000000-0000-4000-8000-000000000000' $q$)
union all select * from pg_temp.mesurer('v_a_attacher (reste ≠ 0)',
  $q$ select fuite_id, prix_id, reste, brouillon_id from public.v_a_attacher
       where marche_id = 'de000000-0000-4000-8000-000000000000' and reste <> 0 $q$)
union all select * from pg_temp.mesurer('etat_balayage (marché)',
  $q$ select * from public.etat_balayage('de000000-0000-4000-8000-000000000000') $q$)
union all select * from pg_temp.mesurer('reseau_geojson (1 secteur, le plus gros)',
  $q$ select public.reseau_geojson('de000000-0000-4000-8000-000000000000',
        array[(select secteur_id from public.troncons where marche_id = 'de000000-0000-4000-8000-000000000000'
                group by 1 order by count(*) desc limit 1)]) $q$)
union all select * from pg_temp.mesurer('reseau_geojson (tout le réseau)',
  $q$ select public.reseau_geojson('de000000-0000-4000-8000-000000000000', null, true) $q$);

-- Fonctions de la migration 20261007120000 (essai de charge), si elle est appliquée
select exists (select 1 from pg_proc where proname = 'compter_fuites') as nouvelles \gset
\if :nouvelles
select * from pg_temp.mesurer('compter_fuites (marché)',
  $q$ select * from public.compter_fuites('de000000-0000-4000-8000-000000000000') $q$)
union all select * from pg_temp.mesurer('compter_fuites (tous les marchés)',
  $q$ select * from public.compter_fuites() $q$)
union all select * from pg_temp.mesurer('resume_a_attacher',
  $q$ select public.resume_a_attacher('de000000-0000-4000-8000-000000000000') $q$)
union all select * from pg_temp.mesurer('etat_balayage_compact',
  $q$ select public.etat_balayage_compact('de000000-0000-4000-8000-000000000000') $q$);
\endif
rollback;
