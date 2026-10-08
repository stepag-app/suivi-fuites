-- =============================================================================
-- Chantier v2, S2 / fichier 2 : rues d'OpenStreetMap et suggestions de localisation
-- (tâches F3 et F4). Contrat : docs/lots/chantier-v2-base-s2.md.
--
--  * rues : voies nommées tirées d'OSM (© contributeurs OpenStreetMap, ODbL 1.0), communes
--    à tous les marchés (une ville peut servir plusieurs marchés) ; chargées par la
--    migration suivante (extrait d'Oujda, outils/reseau/extraire_rues.py) ou par
--    importer_rues (administrateur).
--  * suggestions_localisation(marché, longitude, latitude, précision) : rues proches (plus
--    proche d'abord), secteur selon le zonage en vigueur, tronçon le plus proche avec son
--    diamètre et son matériau. Ce sont des SUGGESTIONS : l'appli les propose, l'agent les
--    valide d'un toucher ; rien n'est écrit. Rien de trouvé : listes vides et objets nuls.
--  * Rayon de recherche selon la précision annoncée par la tablette : 2 × précision,
--    borné entre 30 et 150 m (30 m sans précision) ; au-delà de 200 m de précision, aucune
--    suggestion (position inutilisable).
--  * SECURITY DEFINER : sous RLS, PostgreSQL n'utilise pas l'index GiST d'un opérateur
--    PostGIS (non « leakproof ») ; l'accès est donc contrôlé dans la fonction (marché de
--    l'appelant, actif ou non : lecture seule).
-- =============================================================================

create table public.rues (
  id bigint primary key,                    -- identifiant de la voie OSM (way)
  nom text,                                 -- étiquette « name » d'OSM (souvent bilingue)
  nom_fr text,                              -- « name:fr », sinon partie latine de « name »
  nom_ar text,                              -- « name:ar », sinon partie arabe de « name »
  categorie text,                           -- « highway » d'OSM (residential, primary…)
  ville text not null default 'Oujda',
  geom extensions.geometry(LineString, 4326) not null,
  source text not null default 'osm',
  importe_le timestamptz not null default now(),
  check (coalesce(nom, nom_fr, nom_ar) is not null)
);
alter table public.rues enable row level security;
create index rues_geom_idx on public.rues using gist (geom);

comment on table public.rues is
  'Voies nommées d''OpenStreetMap (© contributeurs OpenStreetMap, licence ODbL 1.0) ; suggestions d''adresse uniquement.';

create policy rues_lecture on public.rues for select to authenticated using (true);
grant select on public.rues to authenticated;
grant all on public.rues to service_role;

-- -----------------------------------------------------------------------------
-- Chargement (migration et administrateur) : upsert par identifiant OSM
-- -----------------------------------------------------------------------------
create function private.charger_rues(p_features jsonb, p_ville text default 'Oujda')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _recues integer := coalesce(jsonb_array_length(p_features), 0);
  _ecrites integer;
begin
  if jsonb_typeof(p_features) is distinct from 'array' then
    raise exception 'Tableau de features GeoJSON attendu' using errcode = 'invalid_parameter_value';
  end if;
  with lues as (
    select case when (f -> 'properties' ->> 'id') ~ '^[0-9]{1,18}$' then (f -> 'properties' ->> 'id')::bigint end as id,
           nullif(btrim(f -> 'properties' ->> 'nom'), '') as nom,
           nullif(btrim(f -> 'properties' ->> 'nom_fr'), '') as nom_fr,
           nullif(btrim(f -> 'properties' ->> 'nom_ar'), '') as nom_ar,
           nullif(btrim(f -> 'properties' ->> 'categorie'), '') as categorie,
           private.geom_geojson(f -> 'geometry') as geom
      from jsonb_array_elements(p_features) f
  ),
  valides as (
    select distinct on (l.id) l.*
      from lues l
     where l.id is not null and coalesce(l.nom, l.nom_fr, l.nom_ar) is not null
       and l.geom is not null and extensions.geometrytype(l.geom) = 'LINESTRING'
       and extensions.st_npoints(l.geom) >= 2
     order by l.id
  )
  insert into public.rues (id, nom, nom_fr, nom_ar, categorie, ville, geom, importe_le)
  select v.id, v.nom, v.nom_fr, v.nom_ar, v.categorie, coalesce(nullif(btrim(p_ville), ''), 'Oujda'), v.geom, now()
    from valides v
  on conflict (id) do update
    set nom = excluded.nom, nom_fr = excluded.nom_fr, nom_ar = excluded.nom_ar, categorie = excluded.categorie,
        ville = excluded.ville, geom = excluded.geom, importe_le = excluded.importe_le
  where (rues.nom, rues.nom_fr, rues.nom_ar, rues.categorie, rues.ville)
          is distinct from (excluded.nom, excluded.nom_fr, excluded.nom_ar, excluded.categorie, excluded.ville)
     or not extensions.st_equals(rues.geom, excluded.geom);
  get diagnostics _ecrites = row_count;
  return jsonb_build_object('recues', _recues, 'ecrites', _ecrites);
end
$$;

create function public.importer_rues(p_features jsonb, p_ville text default 'Oujda')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.est_admin() then
    raise exception 'Import des rues réservé à l''administrateur' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(jsonb_array_length(p_features), 0) > 5000 then
    raise exception '5 000 rues par appel au plus' using errcode = 'program_limit_exceeded';
  end if;
  return private.charger_rues(p_features, p_ville);
end
$$;

comment on function public.importer_rues(jsonb, text) is
  'Administrateur : charge des voies OSM (GeoJSON de outils/reseau/extraire_rues.py, 5 000 au plus par appel ; upsert par identifiant OSM). Renvoie {recues, ecrites}.';

-- -----------------------------------------------------------------------------
-- Suggestions de localisation (F3, F4)
-- -----------------------------------------------------------------------------
create function public.suggestions_localisation(
  p_marche uuid,
  p_longitude double precision,
  p_latitude double precision,
  p_precision_m numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _point extensions.geometry;
  _geo extensions.geography;
  _rayon numeric;
  _degres double precision;
  _rues jsonb;
  _troncon jsonb;
  _secteur jsonb;
  _secteur_id uuid;
begin
  if p_marche is null or not (p_marche = any (private.mes_marches())) then
    raise exception 'Marché non autorisé' using errcode = 'insufficient_privilege';
  end if;
  if p_longitude is null or p_latitude is null
     or p_longitude not between -180 and 180 or p_latitude not between -90 and 90 then
    raise exception 'Position invalide' using errcode = 'invalid_parameter_value';
  end if;
  if p_precision_m > 200 then
    return jsonb_build_object('rayon_m', null, 'precision_insuffisante', true,
                              'rues', '[]'::jsonb, 'secteur', null, 'troncon', null);
  end if;

  _rayon := least(150, greatest(30, ceil(2 * coalesce(p_precision_m, 15))));
  _point := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326);
  _geo := _point::extensions.geography;
  -- Préfiltre en degrés (index GiST) : 80 km par degré, en deçà des 91 km d'un degré de
  -- longitude et des 111 km d'un degré de latitude à Oujda ; le filtre exact suit en mètres.
  _degres := _rayon / 80000.0;

  select coalesce(jsonb_agg(jsonb_build_object('nom', x.nom, 'nom_fr', x.nom_fr, 'nom_ar', x.nom_ar,
                                               'distance_m', x.distance_m) order by x.distance_m, x.nom), '[]'::jsonb)
    into _rues
    from (
      select coalesce(r.nom_fr, r.nom, r.nom_ar) as nom,
             (array_agg(r.nom_fr order by d.distance_m) filter (where r.nom_fr is not null))[1] as nom_fr,
             (array_agg(r.nom_ar order by d.distance_m) filter (where r.nom_ar is not null))[1] as nom_ar,
             round(min(d.distance_m)::numeric, 1) as distance_m
        from public.rues r
        cross join lateral (select extensions.st_distance(r.geom::extensions.geography, _geo) as distance_m) d
       where extensions.st_dwithin(r.geom, _point, _degres)
         and d.distance_m <= _rayon
       group by coalesce(r.nom_fr, r.nom, r.nom_ar)
       order by min(d.distance_m)
       limit 5
    ) x;

  select jsonb_build_object(
           'id', t.id, 'reference', t.reference, 'diametre_mm', t.diametre_mm,
           'materiau', private.materiau_reseau(t.materiau), 'materiau_plan', t.materiau,
           'secteur_id', t.secteur_id, 'distance_m', round(d.distance_m::numeric, 1),
           'geojson', extensions.st_asgeojson(t.geom, 6)::jsonb)
    into _troncon
    from public.troncons t
    cross join lateral (select extensions.st_distance(t.geom::extensions.geography, _geo) as distance_m) d
   where t.marche_id = p_marche and t.actif
     and extensions.st_dwithin(t.geom, _point, _degres)
     and d.distance_m <= _rayon
   order by d.distance_m, t.reference
   limit 1;

  _secteur_id := coalesce(private.secteur_contenant(p_marche, _point), (_troncon ->> 'secteur_id')::uuid);
  select jsonb_build_object('id', s.id, 'code', s.code, 'libelle', s.libelle, 'zone_id', s.zone_id,
                            'source', case when s.geom is not null and extensions.st_intersects(s.geom, _point)
                                           then 'contour' else 'troncon' end)
    into _secteur
    from public.secteurs s
   where s.id = _secteur_id and s.actif;

  return jsonb_build_object('rayon_m', _rayon, 'precision_insuffisante', false,
                            'rues', _rues, 'secteur', _secteur, 'troncon', _troncon);
end
$$;

comment on function public.suggestions_localisation(uuid, double precision, double precision, numeric) is
  'Suggestions (jamais pré-remplies) pour une fuite : {rayon_m, precision_insuffisante, rues: [{nom, nom_fr, nom_ar, distance_m}] (5 au plus, plus proche d''abord), secteur: {id, code, libelle, zone_id, source: contour|troncon} | null, troncon: {id, reference, diametre_mm, materiau, materiau_plan, secteur_id, distance_m, geojson} | null}.';

revoke execute on function
  private.charger_rues(jsonb, text),
  public.importer_rues(jsonb, text),
  public.suggestions_localisation(uuid, double precision, double precision, numeric)
  from public, anon, authenticated;
grant execute on function
  public.importer_rues(jsonb, text),
  public.suggestions_localisation(uuid, double precision, double precision, numeric)
  to authenticated, service_role;
