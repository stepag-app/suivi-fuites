-- =============================================================================
-- Tuiles du réseau (X5) : lecture du réseau complet par pages de taille bornée.
-- reseau_geojson et noeuds_geojson sur tout un marché (Oujda : 44 044 tronçons, 15 Mo de JSON)
-- dépassent le délai maximal d'une requête de l'API en production (« canceling statement due to
-- statement timeout ») ; la lecture par paquets de secteurs (PR #88) ne suffit pas, les 8 862
-- tronçons non zonés restant un seul bloc. Ces deux fonctions lisent les tronçons (ou les nœuds)
-- actifs d'un marché, zonés ou non, dans l'ordre de la référence (index unique marche_id,
-- reference) : « suivant » est la dernière référence de la page, à repasser dans p_apres ; nul
-- quand la page n'est pas pleine (fin). Mêmes propriétés courtes que reseau_geojson et
-- noeuds_geojson ; droits de l'appelant (RLS), comme elles.
-- =============================================================================

create function public.reseau_geojson_page(
  p_marche uuid,
  p_apres text default null,
  p_limite integer default 2000,
  p_tolerance double precision default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with lim as (
    select least(greatest(coalesce(p_limite, 2000), 1), 5000) as n
  ), page as (
    select t.reference, t.id, t.secteur_id, t.zone_id, t.categorie, t.diametre_mm, t.materiau, t.longueur_m, t.geom
      from public.troncons t
     where t.marche_id = p_marche and t.actif
       and t.reference > coalesce(p_apres, '')
     order by t.reference
     limit (select n from lim)
  )
  select jsonb_build_object(
           'type', 'FeatureCollection',
           'features', coalesce(jsonb_agg(
             jsonb_build_object(
               'type', 'Feature',
               'geometry', extensions.st_asgeojson(
                 case when coalesce(p_tolerance, 0) > 0
                      then extensions.st_simplifypreservetopology(p.geom, p_tolerance)
                      else p.geom end, 6)::jsonb,
               'properties', jsonb_build_object(
                 'id', p.id, 's', p.secteur_id, 'z', p.zone_id, 'c', p.categorie,
                 'd', p.diametre_mm, 'm', p.materiau, 'l', p.longueur_m))
             order by p.reference), '[]'::jsonb),
           'suivant', case when count(*) >= (select n from lim) then max(p.reference) end)
    from page p
$$;

comment on function public.reseau_geojson_page(uuid, text, integer, double precision) is
  'Page des tronçons actifs du marché, zonés ou non, par référence croissante après p_apres (1 à 5 000, 2 000 par défaut) : FeatureCollection aux propriétés de reseau_geojson, plus « suivant » (dernière référence, nul à la fin).';

create function public.noeuds_geojson_page(
  p_marche uuid,
  p_apres text default null,
  p_limite integer default 3000
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with lim as (
    select least(greatest(coalesce(p_limite, 3000), 1), 5000) as n
  ), page as (
    select n.reference, n.id, n.secteur_id, n.zone_id, n.type, n.geom
      from public.noeuds n
     where n.marche_id = p_marche and n.actif
       and n.reference > coalesce(p_apres, '')
     order by n.reference
     limit (select l.n from lim l)
  )
  select jsonb_build_object(
           'type', 'FeatureCollection',
           'features', coalesce(jsonb_agg(
             jsonb_build_object(
               'type', 'Feature',
               'geometry', extensions.st_asgeojson(p.geom, 6)::jsonb,
               'properties', jsonb_build_object('id', p.id, 's', p.secteur_id, 'z', p.zone_id, 't', p.type))
             order by p.reference), '[]'::jsonb),
           'suivant', case when count(*) >= (select l.n from lim l) then max(p.reference) end)
    from page p
$$;

comment on function public.noeuds_geojson_page(uuid, text, integer) is
  'Page des nœuds actifs du marché, zonés ou non, par référence croissante après p_apres (1 à 5 000, 3 000 par défaut) : FeatureCollection aux propriétés de noeuds_geojson, plus « suivant » (dernière référence, nul à la fin).';

revoke execute on function
  public.reseau_geojson_page(uuid, text, integer, double precision),
  public.noeuds_geojson_page(uuid, text, integer)
  from public, anon, authenticated;

grant execute on function
  public.reseau_geojson_page(uuid, text, integer, double precision),
  public.noeuds_geojson_page(uuid, text, integer)
  to authenticated, service_role;
