-- =============================================================================
-- Lot S2 : réseau d'eau potable (tronçons, nœuds) et balayage par tronçon.
-- Contrat : docs/lots/lot-s-reseau.md § 2 et § 3 (interfaces figées, le panneau
-- web et l'APK sont développés en parallèle contre ce contrat).
--
-- Décisions :
--  * Géométries WGS84 dans le schéma extensions (PostGIS) : LineString pour les
--    tronçons, Point pour les nœuds ; longueur_m posée par déclencheur
--    (ST_Length sur geography, arrondie au centimètre).
--  * Zonage : la zone d'un tronçon ou d'un nœud suit toujours son secteur. Sans
--    secteur à l'insertion, le secteur actif dont le contour contient le milieu
--    du tronçon (ou le nœud) est pris ; plusieurs contours : le plus petit.
--    Un tronçon désaffecté (secteur nul) perd aussi sa zone. Pas de rezonage
--    automatique à la mise à jour : les corrections de l'administrateur priment.
--  * Import (administrateur seul, SECURITY DEFINER, comme importer_produits_dolibarr) :
--    2 000 features par appel au plus ; une feature sans référence, sans
--    géométrie lisible, de mauvais type, hors WGS84 ou en double est ignorée et
--    comptée (10 premières erreurs renvoyées, « index » = position dans le
--    tableau, à partir de 0). Upsert par (marche_id, reference) : une ligne déjà
--    identique n'est pas réécrite (modifie_le intact, le cache du panneau reste
--    valable) et compte dans « inchanges », clé ajoutée au résultat du contrat.
--    secteur_code n'est appliqué qu'à un tronçon encore sans secteur ; actif
--    n'est pas touché par un réimport ; une entrée de journal par appel.
--  * Balayages : table en ajout seul ; la seule modification admise est
--    l'annulation (annule_le, annule_par, motif_annulation), contrôlée par le
--    droit « balayage / supprimer » (portée) ou « valider ». Un balayage annulé
--    ne se rétablit pas. premier_passage est posé puis recalculé par déclencheur
--    (plus ancien balayage non annulé du tronçon : balaye_le, puis id), y
--    compris pour une synchronisation hors ligne arrivée dans le désordre. Pas
--    de balayage sur un tronçon désactivé. Une entrée de journal par annulation.
--  * Statut du secteur (a_balayer / en_cours / balayee) recalculé après chaque
--    balayage ou annulation, et quand un tronçon change de secteur, est créé ou
--    désactivé (déclencheurs d'instruction, tables de transition).
--  * Contours : enveloppe concave des tronçons actifs du secteur, tamponnée de
--    20 m (geography) puis MultiPolygon ; secteur sans tronçon : contour nul.
--    Contour d'une zone : union des contours de ses secteurs actifs, recalculé
--    après chaque recalcul de secteur et après un contour dessiné à la main.
--  * Pas de journalisation ligne à ligne sur troncons et noeuds (volume) : une
--    entrée résumée par import et par affectation. Les changements de statut et
--    de contour des secteurs et des zones restent tracés par leur déclencheur
--    journaliser existant.
--  * Modèles de rôles : « detection » obtient balayage lire + créer + supprimer
--    (les siennes), modifier « non » (rien d'autre que l'annulation n'est
--    possible) ; le droit est aussi fusionné dans les droits des agents déjà
--    affectés avec ce rôle (on ne retire jamais rien). « responsable » avait
--    déjà tout. « chef_reparation → lire » n'est PAS ajouté ici : le test
--    existant 05_marche_demo fige la liste des droits de ce modèle ; à faire
--    dans un lot suivant avec ce test.
--  * Marché désactivé : lecture seule pour tous sauf l'administrateur, par les
--    mêmes fonctions que le reste (private.marches_autorises, private.peut).
--  * copier_marche n'est pas modifiée : les tronçons, nœuds et balayages ne
--    sont jamais copiés.
--  * v_balayage_journalier : nb_troncons et lineaire_m comptent les premiers
--    passages (payés), lineaire_repasse_m les passages suivants ; zone et
--    secteur sont ceux du tronçon au moment de la lecture.
--  * Volume (46 512 tronçons, 30 753 nœuds, secteurs jusqu'à 4 500 tronçons) :
--    filtres toujours par (marche_id, secteur_id) ou (marche_id, zone_id) pour
--    servir les index partiels « where actif » ; statut des secteurs recalculé
--    une fois par instruction ; premier passage relu par l'index partiel des
--    balayages non annulés. Sous RLS, PostgreSQL n'utilise pas l'index GiST
--    pour un opérateur PostGIS (non « leakproof ») : la recherche des nœuds
--    d'extrémité passe par private.noeuds_extremites (SECURITY DEFINER, bornée
--    aux marchés de l'appelant). Mesuré sur PostgreSQL 17 + PostGIS 3.6 :
--    import 200 à 400 ms par paquet de 1 000, reseau_geojson d'un secteur de
--    4 500 tronçons 0,1 s (1,4 Mo), v_balayage_journalier d'une journée de
--    5 500 balayages 1,1 s.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
create table public.troncons (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  reference text not null,                  -- identifiant stable issu du dessin (handle AutoCAD), ex. 'H1A2B3C'
  calque text,                              -- calque AutoCAD d'origine
  categorie text not null default 'conduite'
    check (categorie in ('conduite', 'branchement', 'adduction', 'autre')),
  diametre_mm integer check (diametre_mm > 0),
  materiau text,                            -- texte du dessin (PEHD, PVC, FONTE, AC…), non normalisé
  zone_id uuid,
  secteur_id uuid,
  longueur_m numeric(10,2) not null,        -- posée par déclencheur : ST_Length(geom::geography)
  geom extensions.geometry(LineString, 4326) not null,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, reference),
  unique (id, marche_id),
  foreign key (zone_id, marche_id) references public.zones (id, marche_id),
  foreign key (secteur_id, marche_id) references public.secteurs (id, marche_id)
);
alter table public.troncons enable row level security;
create index troncons_geom_idx on public.troncons using gist (geom);
create index troncons_marche_secteur_idx on public.troncons (marche_id, secteur_id) where actif;
create index troncons_marche_zone_idx on public.troncons (marche_id, zone_id) where actif;

comment on table public.troncons is
  'Tronçons du réseau (LineString WGS84) importés du plan ; zonés par secteur ; jamais supprimés, désactivés.';

create table public.noeuds (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  reference text not null,
  type text not null default 'jonction'
    check (type in ('jonction', 'extremite', 'vanne', 'bouche_incendie', 'ventouse', 'vidange', 'compteur', 'reservoir', 'autre')),
  calque text,
  zone_id uuid,
  secteur_id uuid,
  geom extensions.geometry(Point, 4326) not null,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, reference),
  unique (id, marche_id),
  foreign key (zone_id, marche_id) references public.zones (id, marche_id),
  foreign key (secteur_id, marche_id) references public.secteurs (id, marche_id)
);
alter table public.noeuds enable row level security;
create index noeuds_geom_idx on public.noeuds using gist (geom);
create index noeuds_marche_secteur_idx on public.noeuds (marche_id, secteur_id) where actif;

comment on table public.noeuds is
  'Nœuds du réseau (Point WGS84) : jonctions, vannes, bouches d''incendie… ; zonés comme les tronçons.';

create table public.balayages (
  id uuid primary key default gen_random_uuid(),          -- créé sur l'appareil (hors ligne)
  marche_id uuid not null references public.marches (id),
  troncon_id uuid not null,
  date_balayage date not null default ((now() at time zone 'Africa/Casablanca')::date),
  balaye_le timestamptz not null default now(),
  equipe_id uuid,
  agent_id uuid references public.profils (id),           -- qui a balayé (défaut : auth.uid())
  saisi_par uuid references public.profils (id),          -- compte qui a saisi (défaut : auth.uid())
  source_saisie public.source_saisie not null default 'tablette',
  methode text check (methode in ('ecoute', 'correlation', 'prelocalisation', 'enregistreurs')),
  premier_passage boolean not null default true,          -- posé par déclencheur : aucun balayage antérieur non annulé du tronçon
  observation text,
  annule_le timestamptz,
  annule_par uuid references public.profils (id),
  motif_annulation text,
  cree_le timestamptz not null default now(),
  unique (id, marche_id),
  foreign key (troncon_id, marche_id) references public.troncons (id, marche_id),
  foreign key (equipe_id, marche_id) references public.equipes (id, marche_id),
  check (annule_le is null or motif_annulation is not null)
);
alter table public.balayages enable row level security;
create index balayages_marche_date_idx on public.balayages (marche_id, date_balayage);
create index balayages_troncon_idx on public.balayages (troncon_id) where annule_le is null;

comment on table public.balayages is
  'Passages de balayage par tronçon ; ajout seul, annulation motivée ; le premier passage non annulé est le seul payé.';

-- -----------------------------------------------------------------------------
-- 2. Fonctions internes : zonage, lecture GeoJSON, contours, statuts
-- -----------------------------------------------------------------------------

-- Secteur actif dont le contour contient le point (le plus petit si plusieurs).
create function private.secteur_contenant(p_marche uuid, p_point extensions.geometry)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
    from public.secteurs s
   where s.marche_id = p_marche and s.actif and s.geom is not null
     and extensions.st_intersects(s.geom, p_point)
   order by extensions.st_area(s.geom), s.ordre, s.code
   limit 1
$$;

create function private.zone_du_secteur(p_secteur uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.zone_id from public.secteurs s where s.id = p_secteur
$$;

-- Géométrie WGS84 lue dans un objet GeoJSON ; nul si illisible.
create function private.geom_geojson(p_geometrie jsonb)
returns extensions.geometry
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_geometrie is null or jsonb_typeof(p_geometrie) <> 'object' then
    return null;
  end if;
  return extensions.st_setsrid(extensions.st_geomfromgeojson(p_geometrie::text), 4326);
exception when others then
  return null;
end
$$;

-- Entier lu dans une valeur JSON (nombre ou texte) ; nul sinon.
create function private.entier_ou_nul(p_valeur jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_valeur is null or jsonb_typeof(p_valeur) not in ('number', 'string') then
    return null;
  end if;
  return round(nullif(btrim(p_valeur #>> '{}'), '')::numeric)::integer;
exception when others then
  return null;
end
$$;

-- Polygone WGS84 (Polygon ou MultiPolygon, ou Feature qui en contient un) ;
-- refuse toute géométrie illisible, d'un autre type ou invalide, avec le motif.
create function private.polygone_geojson(p_polygone jsonb)
returns extensions.geometry
language plpgsql
immutable
set search_path = ''
as $$
declare
  _j jsonb := p_polygone;
  _g extensions.geometry;
begin
  if _j is null or jsonb_typeof(_j) <> 'object' then
    raise exception 'Polygone invalide : objet GeoJSON attendu' using errcode = 'invalid_parameter_value';
  end if;
  if _j ? 'geometry' then
    _j := _j -> 'geometry';
  end if;
  begin
    _g := extensions.st_setsrid(extensions.st_geomfromgeojson(_j::text), 4326);
  exception when others then
    raise exception 'Polygone invalide : %', sqlerrm using errcode = 'invalid_parameter_value';
  end;
  if extensions.st_geometrytype(_g) not in ('ST_Polygon', 'ST_MultiPolygon') then
    raise exception 'Polygone invalide : % reçu, Polygon ou MultiPolygon attendu', extensions.st_geometrytype(_g)
      using errcode = 'invalid_parameter_value';
  end if;
  if not extensions.st_isvalid(_g) then
    raise exception 'Polygone invalide : %', extensions.st_isvalidreason(_g) using errcode = 'invalid_parameter_value';
  end if;
  return _g;
end
$$;

-- Nœud à moins de 1 m d'une extrémité du tronçon (distance géodésique).
create function private.noeud_sur_extremite(p_noeud extensions.geometry, p_troncon extensions.geometry)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extensions.st_dwithin(p_noeud::extensions.geography, extensions.st_startpoint(p_troncon)::extensions.geography, 1)
      or extensions.st_dwithin(p_noeud::extensions.geography, extensions.st_endpoint(p_troncon)::extensions.geography, 1)
$$;

-- Nœuds actifs à moins de 1 m d'une extrémité d'un tronçon (marchés de l'appelant).
-- SECURITY DEFINER : sous RLS, PostgreSQL n'utilise pas l'index GiST pour un
-- opérateur PostGIS (non « leakproof ») et balaierait tous les nœuds pour chaque
-- tronçon (plusieurs minutes pour une journée de balayage à 30 000 nœuds).
create function private.noeuds_extremites(p_troncon uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select n.id
    from public.troncons t
    join public.noeuds n
      on extensions.st_dwithin(n.geom, t.geom, 0.00005)
     and n.marche_id = t.marche_id
     and n.actif
     and private.noeud_sur_extremite(n.geom, t.geom)
   where t.id = p_troncon
     and t.marche_id = any (private.mes_marches())
$$;

-- Lecture d'un tableau de Features GeoJSON de tronçons (contrat § 4).
create function private.lire_troncons_geojson(p_marche uuid, p_features jsonb)
returns table (
  n integer, reference text, calque text, categorie text, diametre_mm integer,
  materiau text, secteur_id uuid, geom extensions.geometry, erreur text
)
language sql
stable
set search_path = ''
as $$
  with brut as (
    select o.n::integer as n,
           nullif(btrim(o.f -> 'properties' ->> 'reference'), '') as reference,
           nullif(btrim(o.f -> 'properties' ->> 'calque'), '') as calque,
           nullif(btrim(o.f -> 'properties' ->> 'categorie'), '') as categorie,
           private.entier_ou_nul(o.f -> 'properties' -> 'diametre_mm') as diametre_mm,
           nullif(btrim(o.f -> 'properties' ->> 'materiau'), '') as materiau,
           nullif(btrim(o.f -> 'properties' ->> 'secteur_code'), '') as secteur_code,
           private.geom_geojson(o.f -> 'geometry') as geom
      from jsonb_array_elements(p_features) with ordinality o (f, n)
  )
  select b.n,
         b.reference,
         b.calque,
         case when b.categorie is null then 'conduite'
              when b.categorie in ('conduite', 'branchement', 'adduction', 'autre') then b.categorie
              else 'autre' end,
         case when b.diametre_mm > 0 then b.diametre_mm end,
         b.materiau,
         s.id,
         b.geom,
         case when b.reference is null then 'référence manquante'
              when b.geom is null then 'géométrie absente ou illisible'
              when extensions.st_geometrytype(b.geom) <> 'ST_LineString' then 'géométrie attendue : LineString'
              when extensions.st_npoints(b.geom) < 2 or extensions.st_length(b.geom) = 0
                   or not extensions.st_isvalid(b.geom) then 'géométrie invalide'
              when extensions.st_xmin(b.geom::extensions.box3d) < -180 or extensions.st_xmax(b.geom::extensions.box3d) > 180
                   or extensions.st_ymin(b.geom::extensions.box3d) < -90 or extensions.st_ymax(b.geom::extensions.box3d) > 90
                   then 'coordonnées hors WGS84 (longitude, latitude attendues)'
              when row_number() over (partition by b.reference order by b.n) > 1 then 'référence en double dans le fichier'
         end
    from brut b
    left join public.secteurs s on s.marche_id = p_marche and s.code = b.secteur_code
$$;

-- Lecture d'un tableau de Features GeoJSON de nœuds (contrat § 4).
create function private.lire_noeuds_geojson(p_marche uuid, p_features jsonb)
returns table (
  n integer, reference text, calque text, type text, secteur_id uuid, geom extensions.geometry, erreur text
)
language sql
stable
set search_path = ''
as $$
  with brut as (
    select o.n::integer as n,
           nullif(btrim(o.f -> 'properties' ->> 'reference'), '') as reference,
           nullif(btrim(o.f -> 'properties' ->> 'calque'), '') as calque,
           nullif(btrim(o.f -> 'properties' ->> 'type'), '') as type,
           nullif(btrim(o.f -> 'properties' ->> 'secteur_code'), '') as secteur_code,
           private.geom_geojson(o.f -> 'geometry') as geom
      from jsonb_array_elements(p_features) with ordinality o (f, n)
  )
  select b.n,
         b.reference,
         b.calque,
         case when b.type is null then 'jonction'
              when b.type in ('jonction', 'extremite', 'vanne', 'bouche_incendie', 'ventouse', 'vidange',
                              'compteur', 'reservoir', 'autre') then b.type
              else 'autre' end,
         s.id,
         b.geom,
         case when b.reference is null then 'référence manquante'
              when b.geom is null then 'géométrie absente ou illisible'
              when extensions.st_geometrytype(b.geom) <> 'ST_Point' then 'géométrie attendue : Point'
              when extensions.st_x(b.geom) < -180 or extensions.st_x(b.geom) > 180
                   or extensions.st_y(b.geom) < -90 or extensions.st_y(b.geom) > 90
                   then 'coordonnées hors WGS84 (longitude, latitude attendues)'
              when row_number() over (partition by b.reference order by b.n) > 1 then 'référence en double dans le fichier'
         end
    from brut b
    left join public.secteurs s on s.marche_id = p_marche and s.code = b.secteur_code
$$;

-- Contour d'un secteur : enveloppe concave des tronçons actifs, tamponnée de
-- 20 m (une ligne ou un point donnent ainsi toujours une surface), MultiPolygon ;
-- nul sans tronçon.
create function private.contour_troncons(p_secteur uuid)
returns extensions.geometry
language sql
stable
set search_path = ''
as $$
  select case when count(t.geom) = 0 then null
         else extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(
                extensions.st_buffer(
                  extensions.st_concavehull(extensions.st_collect(t.geom), 0.3, false)::extensions.geography, 20
                )::extensions.geometry), 3))
         end
    from public.secteurs s
    join public.troncons t on t.marche_id = s.marche_id and t.secteur_id = s.id and t.actif
   where s.id = p_secteur
$$;

-- Contour des zones : union des contours de leurs secteurs actifs (nul sans contour).
create function private.recalculer_contours_zones(p_zones uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.zones z
     set geom = x.geom
    from (
      select z2.id,
             (select extensions.st_multi(extensions.st_collectionextract(extensions.st_union(s.geom), 3))
                from public.secteurs s
               where s.zone_id = z2.id and s.actif and s.geom is not null) as geom
        from public.zones z2
       where z2.id = any (coalesce(p_zones, '{}'::uuid[]))
    ) x
   where z.id = x.id
     and not (z.geom is null and x.geom is null)
     and (z.geom is null or x.geom is null or not extensions.st_orderingequals(z.geom, x.geom))
$$;

create function private.recalculer_contours(p_secteurs uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _s uuid;
  _g extensions.geometry;
begin
  if p_secteurs is null or cardinality(p_secteurs) = 0 then
    return;
  end if;
  foreach _s in array p_secteurs loop
    _g := private.contour_troncons(_s);
    update public.secteurs s
       set geom = _g
     where s.id = _s
       and not (s.geom is null and _g is null)
       and (s.geom is null or _g is null or not extensions.st_orderingequals(s.geom, _g));
  end loop;
  perform private.recalculer_contours_zones(
    (select array_agg(distinct s.zone_id) from public.secteurs s where s.id = any (p_secteurs)));
end
$$;

-- Statut de balayage des secteurs : a_balayer (aucun tronçon balayé), en_cours
-- (au moins un), balayee (tous les tronçons actifs balayés au moins une fois).
create function private.recalculer_statut_secteurs(p_secteurs uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.secteurs s
     set statut_balayage = x.statut
    from (
      select s2.id,
             case when coalesce(c.nb_balayes, 0) = 0 then 'a_balayer'
                  when c.nb_balayes >= c.nb_actifs then 'balayee'
                  else 'en_cours' end::public.statut_balayage as statut
        from public.secteurs s2
        left join lateral (
          select count(*) as nb_actifs,
                 count(*) filter (where exists (
                   select 1 from public.balayages b where b.troncon_id = t.id and b.annule_le is null)) as nb_balayes
            from public.troncons t
           where t.marche_id = s2.marche_id and t.secteur_id = s2.id and t.actif
        ) c on true
       where s2.id = any (coalesce(p_secteurs, '{}'::uuid[]))
    ) x
   where s.id = x.id and s.statut_balayage is distinct from x.statut
$$;

-- premier_passage : vrai pour le seul plus ancien balayage non annulé du tronçon.
-- Un balayage annulé a toujours premier_passage faux (posé ici pour la ligne qu'on
-- vient d'annuler, p_annule) : seules les lignes non annulées sont relues, par
-- l'index partiel balayages (troncon_id) where annule_le is null.
create function private.recalculer_premier_passage(p_troncon uuid, p_annule uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.balayages b
     set premier_passage = false
   where p_annule is not null and b.id = p_annule and b.premier_passage;

  update public.balayages b
     set premier_passage = x.premier
    from (
      select b2.id, row_number() over (order by b2.balaye_le, b2.id) = 1 as premier
        from public.balayages b2
       where b2.troncon_id = p_troncon and b2.annule_le is null
    ) x
   where b.id = x.id and b.premier_passage is distinct from x.premier;
$$;

create function private.troncon_actif(p_troncon uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select t.actif from public.troncons t where t.id = p_troncon
$$;

create function private.est_premier_passage(p_troncon uuid, p_balaye_le timestamptz, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.balayages b
     where b.troncon_id = p_troncon and b.annule_le is null and b.id <> p_id
       and (b.balaye_le, b.id) < (p_balaye_le, p_id)
  )
$$;

-- -----------------------------------------------------------------------------
-- 3. Déclencheurs
-- -----------------------------------------------------------------------------

-- Tronçon : longueur, modifie_le, zone qui suit le secteur, zonage automatique à l'insertion.
create function private.avant_troncon()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.longueur_m := round(extensions.st_length(new.geom::extensions.geography)::numeric, 2);
  if tg_op = 'UPDATE' then
    new.modifie_le := now();
    new.cree_le := old.cree_le;
  end if;
  if new.secteur_id is not null then
    new.zone_id := private.zone_du_secteur(new.secteur_id);
  elsif tg_op = 'INSERT' then
    new.secteur_id := private.secteur_contenant(new.marche_id, extensions.st_lineinterpolatepoint(new.geom, 0.5));
    if new.secteur_id is not null then
      new.zone_id := private.zone_du_secteur(new.secteur_id);
    end if;
  elsif old.secteur_id is not null then
    new.zone_id := null;
  end if;
  return new;
end
$$;

-- Nœud : même règle de zonage, par le point.
create function private.avant_noeud()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.modifie_le := now();
    new.cree_le := old.cree_le;
  end if;
  if new.secteur_id is not null then
    new.zone_id := private.zone_du_secteur(new.secteur_id);
  elsif tg_op = 'INSERT' then
    new.secteur_id := private.secteur_contenant(new.marche_id, new.geom);
    if new.secteur_id is not null then
      new.zone_id := private.zone_du_secteur(new.secteur_id);
    end if;
  elsif old.secteur_id is not null then
    new.zone_id := null;
  end if;
  return new;
end
$$;

-- Après une insertion ou une modification de tronçons (déclencheur d'instruction) :
-- statut des secteurs touchés (secteur d'arrivée, secteur de départ, activation).
create function private.apres_troncons()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _secteurs uuid[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct n.secteur_id) into _secteurs
      from nouveaux n where n.secteur_id is not null;
  else
    select array_agg(distinct x.s) into _secteurs
      from (
        select n.secteur_id as s
          from nouveaux n join anciens a on a.id = n.id
         where n.secteur_id is distinct from a.secteur_id or n.actif is distinct from a.actif
        union
        select a.secteur_id
          from nouveaux n join anciens a on a.id = n.id
         where n.secteur_id is distinct from a.secteur_id or n.actif is distinct from a.actif
      ) x
     where x.s is not null;
  end if;
  perform private.recalculer_statut_secteurs(_secteurs);
  return null;
end
$$;

-- Balayage, avant insertion : auteurs, tronçon actif, premier passage.
create function private.avant_insertion_balayage()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _actif boolean;
begin
  if not private.appel_systeme() then
    new.saisi_par := auth.uid();
    new.annule_le := null;
    new.annule_par := null;
    new.motif_annulation := null;
    new.cree_le := now();
  end if;
  new.agent_id := coalesce(new.agent_id, auth.uid());
  new.saisi_par := coalesce(new.saisi_par, auth.uid());

  _actif := private.troncon_actif(new.troncon_id);
  if _actif is null then
    raise exception 'Tronçon introuvable' using errcode = 'foreign_key_violation';
  elsif not _actif then
    raise exception 'Tronçon désactivé : balayage impossible' using errcode = 'check_violation';
  end if;

  new.premier_passage := new.annule_le is null
                         and private.est_premier_passage(new.troncon_id, new.balaye_le, new.id);
  return new;
end
$$;

-- Balayage, avant modification : seule l'annulation est possible (droit
-- « supprimer » selon la portée, ou « valider »), une seule fois, avec un motif.
create function private.avant_modification_balayage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.appel_systeme() then
    return new;
  end if;
  if (to_jsonb(new) - 'annule_le' - 'annule_par' - 'motif_annulation')
     is distinct from (to_jsonb(old) - 'annule_le' - 'annule_par' - 'motif_annulation') then
    raise exception 'Un balayage ne se modifie pas : annulez-le (avec un motif) et enregistrez-en un autre'
      using errcode = 'check_violation';
  end if;
  if old.annule_le is not null then
    raise exception 'Ce balayage est déjà annulé' using errcode = 'check_violation';
  end if;
  if new.annule_le is null then
    new.annule_par := null;
    new.motif_annulation := null;
    return new;
  end if;
  if nullif(btrim(new.motif_annulation), '') is null then
    raise exception 'Motif d''annulation obligatoire' using errcode = 'check_violation';
  end if;
  if not (private.peut(old.marche_id, 'balayage', 'supprimer', old.agent_id, old.saisi_par)
          or private.peut(old.marche_id, 'balayage', 'valider')) then
    raise exception 'Annulation non autorisée' using errcode = 'insufficient_privilege';
  end if;
  new.annule_par := auth.uid();
  return new;
end
$$;

-- Balayage, après insertion ou annulation (par ligne) : premier passage du
-- tronçon, journal de l'annulation.
create function private.apres_balayage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.annule_le is not distinct from old.annule_le then
    return null;
  end if;
  perform private.recalculer_premier_passage(new.troncon_id,
            case when tg_op = 'UPDATE' and new.annule_le is not null then new.id end);
  if tg_op = 'UPDATE' and new.annule_le is not null then
    insert into public.journal (marche_id, table_nom, ligne_id, operation, changements, utilisateur_id)
    values (new.marche_id, 'balayages', new.id::text, 'suppression_logique',
            jsonb_build_object('troncon_id', new.troncon_id, 'date_balayage', new.date_balayage,
                               'agent_id', new.agent_id, 'annule_le', new.annule_le,
                               'annule_par', new.annule_par, 'motif_annulation', new.motif_annulation),
            auth.uid());
  end if;
  return null;
end
$$;

-- Balayages, après une instruction d'insertion ou d'annulation : statut des
-- secteurs touchés, une seule fois par instruction (envoi groupé depuis la carte).
create function private.apres_balayages_statut()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _secteurs uuid[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct t.secteur_id) into _secteurs
      from nouveaux n
      join public.troncons t on t.id = n.troncon_id
     where t.secteur_id is not null;
  else
    select array_agg(distinct t.secteur_id) into _secteurs
      from nouveaux n
      join anciens a on a.id = n.id
      join public.troncons t on t.id = n.troncon_id
     where n.annule_le is distinct from a.annule_le and t.secteur_id is not null;
  end if;
  perform private.recalculer_statut_secteurs(_secteurs);
  return null;
end
$$;

create trigger a_avant_troncon before insert or update on public.troncons
  for each row execute function private.avant_troncon();
create trigger figer_marche before update on public.troncons
  for each row execute function private.figer_marche();
create trigger apres_troncons_insertion after insert on public.troncons
  referencing new table as nouveaux
  for each statement execute function private.apres_troncons();
create trigger apres_troncons_modification after update on public.troncons
  referencing old table as anciens new table as nouveaux
  for each statement execute function private.apres_troncons();

create trigger a_avant_noeud before insert or update on public.noeuds
  for each row execute function private.avant_noeud();
create trigger figer_marche before update on public.noeuds
  for each row execute function private.figer_marche();

create trigger a_avant_insertion before insert on public.balayages
  for each row execute function private.avant_insertion_balayage();
create trigger b_avant_modification before update on public.balayages
  for each row execute function private.avant_modification_balayage();
create trigger figer_marche before update on public.balayages
  for each row execute function private.figer_marche();
create trigger apres_balayage after insert or update on public.balayages
  for each row execute function private.apres_balayage();
create trigger apres_balayages_insertion after insert on public.balayages
  referencing new table as nouveaux
  for each statement execute function private.apres_balayages_statut();
create trigger apres_balayages_modification after update on public.balayages
  referencing old table as anciens new table as nouveaux
  for each statement execute function private.apres_balayages_statut();

-- -----------------------------------------------------------------------------
-- 4. Règles RLS et privilèges (rien pour anon ; aucune suppression)
-- -----------------------------------------------------------------------------

-- Tronçons et nœuds : lecture pour tout affecté au marché ; écriture avec
-- « paramètres / modifier » (administrateur compris, marché actif exigé).
do $$
declare
  _t text;
begin
  foreach _t in array array['troncons', 'noeuds'] loop
    execute format($f$
      create policy %1$s_lecture on public.%1$I for select to authenticated
        using (marche_id = any ((select private.mes_marches())::uuid[]));
      create policy %1$s_creation on public.%1$I for insert to authenticated
        with check (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]));
      create policy %1$s_modification on public.%1$I for update to authenticated
        using (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]))
        with check (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]));
      grant select, insert, update on public.%1$I to authenticated;
    $f$, _t);
  end loop;
end
$$;

-- Balayages : lecture « balayage / lire », création « balayage / creer » (marché
-- actif), annulation « balayage / supprimer » (portée vérifiée par le déclencheur)
-- ou « balayage / valider ».
create policy balayages_lecture on public.balayages for select to authenticated
  using (marche_id = any ((select private.marches_autorises('balayage', 'lire'))::uuid[]));
create policy balayages_creation on public.balayages for insert to authenticated
  with check (marche_id = any ((select private.marches_autorises('balayage', 'creer'))::uuid[]));
create policy balayages_modification on public.balayages for update to authenticated
  using (
    marche_id = any ((select private.marches_autorises('balayage', 'supprimer'))::uuid[])
    or marche_id = any ((select private.marches_autorises('balayage', 'valider'))::uuid[])
  )
  with check (
    marche_id = any ((select private.marches_autorises('balayage', 'supprimer'))::uuid[])
    or marche_id = any ((select private.marches_autorises('balayage', 'valider'))::uuid[])
  );
grant select, insert, update on public.balayages to authenticated;

grant all on public.troncons, public.noeuds, public.balayages to service_role;

-- -----------------------------------------------------------------------------
-- 5. Import du réseau (administrateur)
-- -----------------------------------------------------------------------------
create function public.importer_troncons(p_marche uuid, p_features jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _total integer;
  _valides integer;
  _inseres integer;
  _maj integer;
  _erreurs jsonb;
begin
  if not private.est_admin() then
    raise exception 'L''import du réseau est réservé à l''administrateur' using errcode = 'insufficient_privilege';
  end if;
  if p_marche is null or not exists (select 1 from public.marches m where m.id = p_marche) then
    raise exception 'Marché introuvable' using errcode = 'no_data_found';
  end if;
  if p_features is null or jsonb_typeof(p_features) <> 'array' then
    raise exception 'Tableau de features GeoJSON attendu' using errcode = 'invalid_parameter_value';
  end if;
  _total := jsonb_array_length(p_features);
  if _total > 2000 then
    raise exception 'Trop de features dans un seul appel (2 000 au plus)' using errcode = 'program_limit_exceeded';
  end if;
  if _total = 0 then
    return jsonb_build_object('inseres', 0, 'mis_a_jour', 0, 'inchanges', 0, 'ignores', 0, 'erreurs', '[]'::jsonb);
  end if;

  select count(*) filter (where l.erreur is null),
         coalesce(jsonb_agg(jsonb_build_object('index', l.n - 1, 'reference', l.reference, 'message', l.erreur) order by l.n)
                  filter (where l.erreur is not null and l.rang <= 10), '[]'::jsonb)
    into _valides, _erreurs
    from (select l.*, row_number() over (partition by (l.erreur is null) order by l.n) as rang
            from private.lire_troncons_geojson(p_marche, p_features) l) l;

  with l as (
    select * from private.lire_troncons_geojson(p_marche, p_features) where erreur is null
  ),
  ecrit as (
    insert into public.troncons as t (marche_id, reference, calque, categorie, diametre_mm, materiau, secteur_id, geom)
    select p_marche, l.reference, l.calque, l.categorie, l.diametre_mm, l.materiau, l.secteur_id, l.geom
      from l
    on conflict (marche_id, reference) do update
      set calque = excluded.calque,
          categorie = excluded.categorie,
          diametre_mm = excluded.diametre_mm,
          materiau = excluded.materiau,
          geom = excluded.geom,
          secteur_id = coalesce(t.secteur_id, excluded.secteur_id)
      where (t.calque, t.categorie, t.diametre_mm, t.materiau, t.secteur_id)
            is distinct from
            (excluded.calque, excluded.categorie, excluded.diametre_mm, excluded.materiau,
             coalesce(t.secteur_id, excluded.secteur_id))
         or not extensions.st_orderingequals(t.geom, excluded.geom)
    returning (xmax = 0) as insere
  )
  select count(*) filter (where insere), count(*) filter (where not insere)
    into _inseres, _maj
    from ecrit;

  insert into public.journal (marche_id, table_nom, ligne_id, operation, changements, utilisateur_id)
  values (p_marche, 'troncons', 'import', 'creation',
          jsonb_build_object('features', _total, 'inseres', _inseres, 'mis_a_jour', _maj,
                             'inchanges', _valides - _inseres - _maj, 'ignores', _total - _valides),
          auth.uid());

  return jsonb_build_object(
    'inseres', _inseres, 'mis_a_jour', _maj, 'inchanges', _valides - _inseres - _maj,
    'ignores', _total - _valides, 'erreurs', _erreurs);
end
$$;

comment on function public.importer_troncons(uuid, jsonb) is
  'Administrateur : importe (upsert par référence) un tableau de Features GeoJSON LineString ; 2 000 au plus par appel.';

create function public.importer_noeuds(p_marche uuid, p_features jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _total integer;
  _valides integer;
  _inseres integer;
  _maj integer;
  _erreurs jsonb;
begin
  if not private.est_admin() then
    raise exception 'L''import du réseau est réservé à l''administrateur' using errcode = 'insufficient_privilege';
  end if;
  if p_marche is null or not exists (select 1 from public.marches m where m.id = p_marche) then
    raise exception 'Marché introuvable' using errcode = 'no_data_found';
  end if;
  if p_features is null or jsonb_typeof(p_features) <> 'array' then
    raise exception 'Tableau de features GeoJSON attendu' using errcode = 'invalid_parameter_value';
  end if;
  _total := jsonb_array_length(p_features);
  if _total > 2000 then
    raise exception 'Trop de features dans un seul appel (2 000 au plus)' using errcode = 'program_limit_exceeded';
  end if;
  if _total = 0 then
    return jsonb_build_object('inseres', 0, 'mis_a_jour', 0, 'inchanges', 0, 'ignores', 0, 'erreurs', '[]'::jsonb);
  end if;

  select count(*) filter (where l.erreur is null),
         coalesce(jsonb_agg(jsonb_build_object('index', l.n - 1, 'reference', l.reference, 'message', l.erreur) order by l.n)
                  filter (where l.erreur is not null and l.rang <= 10), '[]'::jsonb)
    into _valides, _erreurs
    from (select l.*, row_number() over (partition by (l.erreur is null) order by l.n) as rang
            from private.lire_noeuds_geojson(p_marche, p_features) l) l;

  with l as (
    select * from private.lire_noeuds_geojson(p_marche, p_features) where erreur is null
  ),
  ecrit as (
    insert into public.noeuds as n (marche_id, reference, calque, type, secteur_id, geom)
    select p_marche, l.reference, l.calque, l.type, l.secteur_id, l.geom
      from l
    on conflict (marche_id, reference) do update
      set calque = excluded.calque,
          type = excluded.type,
          geom = excluded.geom,
          secteur_id = coalesce(n.secteur_id, excluded.secteur_id)
      where (n.calque, n.type, n.secteur_id)
            is distinct from (excluded.calque, excluded.type, coalesce(n.secteur_id, excluded.secteur_id))
         or not extensions.st_orderingequals(n.geom, excluded.geom)
    returning (xmax = 0) as insere
  )
  select count(*) filter (where insere), count(*) filter (where not insere)
    into _inseres, _maj
    from ecrit;

  insert into public.journal (marche_id, table_nom, ligne_id, operation, changements, utilisateur_id)
  values (p_marche, 'noeuds', 'import', 'creation',
          jsonb_build_object('features', _total, 'inseres', _inseres, 'mis_a_jour', _maj,
                             'inchanges', _valides - _inseres - _maj, 'ignores', _total - _valides),
          auth.uid());

  return jsonb_build_object(
    'inseres', _inseres, 'mis_a_jour', _maj, 'inchanges', _valides - _inseres - _maj,
    'ignores', _total - _valides, 'erreurs', _erreurs);
end
$$;

comment on function public.importer_noeuds(uuid, jsonb) is
  'Administrateur : importe (upsert par référence) un tableau de Features GeoJSON Point ; 2 000 au plus par appel.';

-- -----------------------------------------------------------------------------
-- 6. Lecture pour la carte (RLS de l'appelant)
-- -----------------------------------------------------------------------------
create function public.reseau_geojson(
  p_marche uuid,
  p_secteurs uuid[] default null,
  p_sans_secteur boolean default false,
  p_tolerance double precision default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
           'type', 'FeatureCollection',
           'features', coalesce(jsonb_agg(x.f order by x.reference), '[]'::jsonb))
    from (
      select t.reference,
             jsonb_build_object(
               'type', 'Feature',
               'geometry', extensions.st_asgeojson(
                 case when coalesce(p_tolerance, 0) > 0
                      then extensions.st_simplifypreservetopology(t.geom, p_tolerance)
                      else t.geom end, 6)::jsonb,
               'properties', jsonb_build_object(
                 'id', t.id, 's', t.secteur_id, 'z', t.zone_id, 'c', t.categorie,
                 'd', t.diametre_mm, 'm', t.materiau, 'l', t.longueur_m)
             ) as f
        from (
          -- Deux branches indexables (marche_id, secteur_id) where actif : secteurs choisis
          -- (nul : tous ceux du marché ; tableau vide : aucun), puis tronçons sans secteur
          -- si demandé (le panneau web lit les non zonés seuls avec '{}' et true).
          select * from public.troncons t
           where t.marche_id = p_marche and t.actif
             and t.secteur_id = any (coalesce(p_secteurs,
                   (select coalesce(array_agg(s.id), '{}') from public.secteurs s where s.marche_id = p_marche)))
          union all
          select * from public.troncons t
           where coalesce(p_sans_secteur, false)
             and t.marche_id = p_marche and t.actif and t.secteur_id is null
        ) t
    ) x
$$;

comment on function public.reseau_geojson(uuid, uuid[], boolean, double precision) is
  'FeatureCollection des tronçons actifs : p_secteurs nul = tous les zonés, tableau vide = aucun, liste = ces secteurs ; p_sans_secteur ajoute les non zonés ; propriétés id, s, z, c, d, m, l.';

create function public.noeuds_geojson(
  p_marche uuid,
  p_secteurs uuid[] default null,
  p_sans_secteur boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
           'type', 'FeatureCollection',
           'features', coalesce(jsonb_agg(x.f order by x.reference), '[]'::jsonb))
    from (
      select n.reference,
             jsonb_build_object(
               'type', 'Feature',
               'geometry', extensions.st_asgeojson(n.geom, 6)::jsonb,
               'properties', jsonb_build_object('id', n.id, 's', n.secteur_id, 'z', n.zone_id, 't', n.type)
             ) as f
        from (
          select * from public.noeuds n
           where n.marche_id = p_marche and n.actif
             and n.secteur_id = any (coalesce(p_secteurs,
                   (select coalesce(array_agg(s.id), '{}') from public.secteurs s where s.marche_id = p_marche)))
          union all
          select * from public.noeuds n
           where coalesce(p_sans_secteur, false)
             and n.marche_id = p_marche and n.actif and n.secteur_id is null
        ) n
    ) x
$$;

comment on function public.noeuds_geojson(uuid, uuid[], boolean) is
  'FeatureCollection des nœuds actifs : p_secteurs nul = tous les zonés, tableau vide = aucun, liste = ces secteurs ; p_sans_secteur ajoute les non zonés ; propriétés id, s, z, t.';

-- État de balayage par tronçon (balayages non annulés) : date du premier passage
-- (celui qui est payé), date, équipe et agent du dernier passage (« balayé le …
-- par … » sur la carte). Sans « balayage / lire » sur le marché : aucune ligne (RLS).
create function public.etat_balayage(p_marche uuid, p_secteurs uuid[] default null)
returns table (
  troncon_id uuid,
  premier_le date,
  dernier_le date,
  nb_passages integer,
  equipe_id uuid,
  agent_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.troncon_id,
         min(b.date_balayage) as premier_le,
         max(b.date_balayage) as dernier_le,
         count(*)::integer as nb_passages,
         (array_agg(b.equipe_id order by b.balaye_le desc, b.id desc))[1] as equipe_id,
         (array_agg(b.agent_id order by b.balaye_le desc, b.id desc))[1] as agent_id
    from public.balayages b
    join public.troncons t on t.id = b.troncon_id
   where b.marche_id = p_marche
     and b.annule_le is null
     and t.actif
     and (p_secteurs is null or t.secteur_id = any (p_secteurs))
   group by b.troncon_id
$$;

comment on function public.etat_balayage(uuid, uuid[]) is
  'État léger par tronçon balayé : premier passage (payé), dernier passage, nombre, équipe et agent du dernier passage.';

-- -----------------------------------------------------------------------------
-- 7. Zonage par l'administrateur ou le droit « paramètres / modifier »
-- -----------------------------------------------------------------------------
create function public.affecter_troncons_secteur(p_secteur uuid, p_troncons uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _ids uuid[];
  _marche uuid;
  _nb_marches integer;
  _anciens uuid[];
  _n integer := 0;
  _noeuds integer := 0;
begin
  select coalesce(array_agg(distinct u.id), '{}') into _ids
    from unnest(coalesce(p_troncons, '{}'::uuid[])) u (id) where u.id is not null;

  if p_secteur is not null then
    select s.marche_id into _marche from public.secteurs s where s.id = p_secteur;
    if _marche is null then
      raise exception 'Secteur introuvable' using errcode = 'no_data_found';
    end if;
  elsif cardinality(_ids) > 0 then
    select min(t.marche_id::text)::uuid, count(distinct t.marche_id) into _marche, _nb_marches
      from public.troncons t where t.id = any (_ids);
    if coalesce(_nb_marches, 0) <> 1 then
      raise exception 'Les tronçons à désaffecter doivent appartenir à un seul marché'
        using errcode = 'invalid_parameter_value';
    end if;
  else
    return 0;
  end if;

  if not private.peut(_marche, 'parametres', 'modifier') then
    raise exception 'Zonage réservé à l''administrateur ou au droit « paramètres / modifier »'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from unnest(_ids) u (id)
              where not exists (select 1 from public.troncons t where t.id = u.id and t.marche_id = _marche)) then
    raise exception 'Tronçon introuvable dans ce marché' using errcode = 'foreign_key_violation';
  end if;
  if cardinality(_ids) = 0 then
    return 0;
  end if;

  select coalesce(array_agg(distinct t.secteur_id), '{}') into _anciens
    from public.troncons t
   where t.id = any (_ids) and t.secteur_id is not null and t.secteur_id is distinct from p_secteur;

  update public.troncons t
     set secteur_id = p_secteur
   where t.id = any (_ids) and t.secteur_id is distinct from p_secteur;
  get diagnostics _n = row_count;
  if _n = 0 then
    return 0;
  end if;

  -- Nœuds actifs à moins de 1 m d'une extrémité des tronçons affectés : ils suivent.
  update public.noeuds n
     set secteur_id = p_secteur
   where n.id in (select x.id from unnest(_ids) u (id) cross join lateral private.noeuds_extremites(u.id) x (id))
     and n.secteur_id is distinct from p_secteur;
  get diagnostics _noeuds = row_count;

  perform private.recalculer_contours(array_remove(_anciens || p_secteur, null));

  insert into public.journal (marche_id, table_nom, ligne_id, operation, changements, utilisateur_id)
  values (_marche, 'secteurs', coalesce(p_secteur::text, 'desaffectation'), 'modification',
          jsonb_build_object(
            'action', case when p_secteur is null then 'desaffectation_troncons' else 'affectation_troncons' end,
            'secteur_id', p_secteur, 'anciens_secteurs', to_jsonb(_anciens),
            'nb_troncons', _n, 'nb_noeuds', _noeuds, 'troncons', to_jsonb(_ids)),
          auth.uid());
  return _n;
end
$$;

comment on function public.affecter_troncons_secteur(uuid, uuid[]) is
  'Affecte des tronçons (et leurs nœuds d''extrémité) à un secteur (nul = désaffecter) ; contours recalculés ; renvoie le nombre modifié.';

create function public.affecter_troncons_polygone(p_secteur uuid, p_polygone jsonb, p_mode text default 'ajouter')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _marche uuid;
  _poly extensions.geometry;
  _dedans uuid[];
  _n integer := 0;
begin
  if p_secteur is null then
    raise exception 'Secteur obligatoire' using errcode = 'invalid_parameter_value';
  end if;
  if p_mode is null or p_mode not in ('ajouter', 'retirer', 'remplacer') then
    raise exception 'Mode inconnu : % (ajouter, retirer ou remplacer)', coalesce(p_mode, 'nul')
      using errcode = 'invalid_parameter_value';
  end if;
  select s.marche_id into _marche from public.secteurs s where s.id = p_secteur;
  if _marche is null then
    raise exception 'Secteur introuvable' using errcode = 'no_data_found';
  end if;
  if not private.peut(_marche, 'parametres', 'modifier') then
    raise exception 'Zonage réservé à l''administrateur ou au droit « paramètres / modifier »'
      using errcode = 'insufficient_privilege';
  end if;
  _poly := private.polygone_geojson(p_polygone);

  -- Tronçons actifs du marché dont le milieu est dans le polygone.
  select coalesce(array_agg(t.id), '{}') into _dedans
    from public.troncons t
   where t.marche_id = _marche and t.actif
     and extensions.st_intersects(t.geom, _poly)
     and extensions.st_intersects(_poly, extensions.st_lineinterpolatepoint(t.geom, 0.5));

  case p_mode
    when 'ajouter' then
      _n := public.affecter_troncons_secteur(p_secteur,
              (select coalesce(array_agg(t.id), '{}') from public.troncons t
                where t.id = any (_dedans) and t.secteur_id is distinct from p_secteur));
    when 'retirer' then
      _n := public.affecter_troncons_secteur(null,
              (select coalesce(array_agg(t.id), '{}') from public.troncons t
                where t.id = any (_dedans) and t.secteur_id = p_secteur));
    when 'remplacer' then
      _n := public.affecter_troncons_secteur(null,
              (select coalesce(array_agg(t.id), '{}') from public.troncons t
                where t.marche_id = _marche and t.secteur_id = p_secteur and not (t.id = any (_dedans))));
      _n := _n + public.affecter_troncons_secteur(p_secteur,
              (select coalesce(array_agg(t.id), '{}') from public.troncons t
                where t.id = any (_dedans) and t.secteur_id is distinct from p_secteur));
  end case;
  return _n;
end
$$;

comment on function public.affecter_troncons_polygone(uuid, jsonb, text) is
  'Tronçons dont le milieu est dans le polygone GeoJSON : ajouter au secteur, retirer (désaffecter les siens) ou remplacer (le secteur = ces tronçons).';

create function public.recalculer_contour_secteur(p_secteur uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _marche uuid;
begin
  select s.marche_id into _marche from public.secteurs s where s.id = p_secteur;
  if _marche is null then
    raise exception 'Secteur introuvable' using errcode = 'no_data_found';
  end if;
  if not private.peut(_marche, 'parametres', 'modifier') then
    raise exception 'Zonage réservé à l''administrateur ou au droit « paramètres / modifier »'
      using errcode = 'insufficient_privilege';
  end if;
  perform private.recalculer_contours(array[p_secteur]);
end
$$;

comment on function public.recalculer_contour_secteur(uuid) is
  'Contour du secteur = enveloppe concave de ses tronçons tamponnée de 20 m (MultiPolygon, nul sans tronçon) ; zone recalculée.';

create function public.definir_contour_secteur(p_secteur uuid, p_polygone jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _marche uuid;
  _zone uuid;
  _poly extensions.geometry;
begin
  select s.marche_id, s.zone_id into _marche, _zone from public.secteurs s where s.id = p_secteur;
  if _marche is null then
    raise exception 'Secteur introuvable' using errcode = 'no_data_found';
  end if;
  if not private.peut(_marche, 'parametres', 'modifier') then
    raise exception 'Zonage réservé à l''administrateur ou au droit « paramètres / modifier »'
      using errcode = 'insufficient_privilege';
  end if;
  _poly := extensions.st_multi(private.polygone_geojson(p_polygone));
  update public.secteurs s set geom = _poly where s.id = p_secteur;
  perform private.recalculer_contours_zones(array[_zone]);
end
$$;

comment on function public.definir_contour_secteur(uuid, jsonb) is
  'Contour dessiné à la main (Polygon ou MultiPolygon GeoJSON) : remplace secteurs.geom sans toucher aux tronçons ; zone recalculée.';

-- -----------------------------------------------------------------------------
-- 8. Vues (RLS de l'appelant)
-- -----------------------------------------------------------------------------
create view public.v_lineaire_secteurs with (security_invoker = true) as
select
  s.marche_id,
  s.zone_id,
  s.id as secteur_id,
  s.code,
  s.libelle,
  s.statut_balayage,
  coalesce(t.nb_troncons, 0)::integer as nb_troncons,
  coalesce(t.lineaire_m, 0)::numeric(12,2) as lineaire_m,
  coalesce(t.nb_balayes, 0)::integer as nb_balayes,
  coalesce(t.lineaire_balaye_m, 0)::numeric(12,2) as lineaire_balaye_m,
  (case when coalesce(t.lineaire_m, 0) > 0
        then round(100 * coalesce(t.lineaire_balaye_m, 0) / t.lineaire_m, 1)
        else 0 end)::numeric(5,1) as pct_balaye,
  coalesce(n.nb_noeuds, 0)::integer as nb_noeuds,
  s.lineaire_m as lineaire_contrat_m,
  t.modifie_le
from public.secteurs s
left join lateral (
  select count(*) as nb_troncons,
         sum(t.longueur_m) as lineaire_m,
         count(*) filter (where b.balaye) as nb_balayes,
         sum(t.longueur_m) filter (where b.balaye) as lineaire_balaye_m,
         max(t.modifie_le) as modifie_le
    from public.troncons t
    left join lateral (
      select true as balaye
        from public.balayages b
       where b.troncon_id = t.id and b.annule_le is null and b.premier_passage
       limit 1
    ) b on true
   where t.marche_id = s.marche_id and t.secteur_id = s.id and t.actif
) t on true
left join lateral (
  select count(*) as nb_noeuds
    from public.noeuds n
   where n.marche_id = s.marche_id and n.secteur_id = s.id and n.actif
) n on true
where s.actif;

create view public.v_lineaire_zones with (security_invoker = true) as
select
  z.marche_id,
  z.id as zone_id,
  z.numero,
  z.code,
  z.libelle,
  coalesce(s.nb_secteurs, 0)::integer as nb_secteurs,
  coalesce(t.nb_troncons, 0)::integer as nb_troncons,
  coalesce(t.lineaire_m, 0)::numeric(12,2) as lineaire_m,
  coalesce(t.lineaire_balaye_m, 0)::numeric(12,2) as lineaire_balaye_m,
  (case when coalesce(t.lineaire_m, 0) > 0
        then round(100 * coalesce(t.lineaire_balaye_m, 0) / t.lineaire_m, 1)
        else 0 end)::numeric(5,1) as pct_balaye,
  z.lineaire_m as lineaire_contrat_m
from public.zones z
left join lateral (
  select count(*) as nb_secteurs from public.secteurs s where s.zone_id = z.id and s.actif
) s on true
left join lateral (
  select count(*) as nb_troncons,
         sum(t.longueur_m) as lineaire_m,
         sum(t.longueur_m) filter (where b.balaye) as lineaire_balaye_m
    from public.troncons t
    left join lateral (
      select true as balaye
        from public.balayages b
       where b.troncon_id = t.id and b.annule_le is null and b.premier_passage
       limit 1
    ) b on true
   where t.marche_id = z.marche_id and t.zone_id = z.id and t.actif
) t on true
where z.actif;

-- Rapport journalier de détection : par jour, équipe, agent, zone et secteur
-- (zone et secteur actuels du tronçon) : tronçons et linéaire en premier passage
-- (payés), linéaire repassé, nœuds à moins de 1 m d'une extrémité d'un tronçon
-- balayé ce jour (tous passages), fuites détectées ce jour dans le secteur.
-- Sans CTE : un filtre sur marche_id et date_balayage descend dans les deux
-- agrégations (index balayages (marche_id, date_balayage)). Nœuds trouvés par
-- private.noeuds_extremites (index GiST, voir plus haut), comptés une fois par groupe.
create view public.v_balayage_journalier with (security_invoker = true) as
select
  g.marche_id,
  g.date_balayage,
  g.equipe_id,
  e.libelle as equipe,
  g.agent_id,
  p.nom_complet as agent,
  g.zone_id,
  z.libelle as zone,
  g.secteur_id,
  s.libelle as secteur,
  g.nb_troncons,
  g.lineaire_m,
  g.lineaire_repasse_m,
  coalesce(nn.nb_noeuds, 0)::integer as nb_noeuds,
  coalesce(f.nb_fuites, 0)::integer as nb_fuites
from (
  select b.marche_id, b.date_balayage, b.equipe_id, b.agent_id, t.zone_id, t.secteur_id,
         (count(distinct t.id) filter (where b.premier_passage))::integer as nb_troncons,
         coalesce(sum(t.longueur_m) filter (where b.premier_passage), 0)::numeric(12,2) as lineaire_m,
         coalesce(sum(t.longueur_m) filter (where not b.premier_passage), 0)::numeric(12,2) as lineaire_repasse_m
    from public.balayages b
    join public.troncons t on t.id = b.troncon_id
   where b.annule_le is null
   group by b.marche_id, b.date_balayage, b.equipe_id, b.agent_id, t.zone_id, t.secteur_id
) g
left join public.equipes e on e.id = g.equipe_id
left join public.profils p on p.id = g.agent_id
left join public.zones z on z.id = g.zone_id
left join public.secteurs s on s.id = g.secteur_id
left join (
  select b.marche_id, b.date_balayage, b.equipe_id, b.agent_id, t.zone_id, t.secteur_id,
         count(distinct x.noeud_id) as nb_noeuds
    from public.balayages b
    join public.troncons t on t.id = b.troncon_id
    cross join lateral private.noeuds_extremites(t.id) x (noeud_id)
   where b.annule_le is null
   group by b.marche_id, b.date_balayage, b.equipe_id, b.agent_id, t.zone_id, t.secteur_id
) nn
  on nn.marche_id = g.marche_id
 and nn.date_balayage = g.date_balayage
 and nn.equipe_id is not distinct from g.equipe_id
 and nn.agent_id is not distinct from g.agent_id
 and nn.zone_id is not distinct from g.zone_id
 and nn.secteur_id is not distinct from g.secteur_id
left join lateral (
  select count(*) as nb_fuites
    from public.fuites f
   where g.secteur_id is not null
     and f.marche_id = g.marche_id
     and f.secteur_id = g.secteur_id
     and f.supprime_le is null
     and (f.date_detection at time zone 'Africa/Casablanca')::date = g.date_balayage
) f on true;

-- Ce qui reste à zoner, par marché (une ligne par marché visible, même à zéro).
create view public.v_troncons_sans_secteur with (security_invoker = true) as
select
  m.id as marche_id,
  count(t.id)::integer as nb_troncons,
  coalesce(sum(t.longueur_m), 0)::numeric(12,2) as lineaire_m
from public.marches m
left join public.troncons t on t.marche_id = m.id and t.actif and t.secteur_id is null
group by m.id;

grant select on public.v_lineaire_secteurs, public.v_lineaire_zones, public.v_balayage_journalier,
  public.v_troncons_sans_secteur to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. Modèles de rôles : droits « balayage »
-- -----------------------------------------------------------------------------
insert into public.modeles_droits (role, type_donnee, lire, creer, modifier, supprimer, valider)
values ('detection', 'balayage', true, true, 'non', 'siennes', false)
on conflict (role, type_donnee) do update
  set lire = excluded.lire, creer = excluded.creer, modifier = excluded.modifier,
      supprimer = excluded.supprimer, valider = excluded.valider;

-- Agents déjà affectés avec le rôle « detection » : fusion du nouveau modèle
-- dans leurs droits (comme appliquer_modele_role : on ne retire jamais rien).
insert into public.droits as d (profil_id, marche_id, type_donnee, lire, creer, modifier, supprimer, valider)
select a.profil_id, a.marche_id, 'balayage'::public.type_donnee, true, true,
       'non'::public.portee_droit, 'siennes'::public.portee_droit, false
  from public.affectations a
 where 'detection' = any (a.roles)
on conflict (profil_id, marche_id, type_donnee) do update
  set lire = d.lire or excluded.lire,
      creer = d.creer or excluded.creer,
      modifier = greatest(d.modifier, excluded.modifier),
      supprimer = greatest(d.supprimer, excluded.supprimer),
      valider = d.valider or excluded.valider
  where (d.lire, d.creer, d.modifier, d.supprimer, d.valider)
        is distinct from
        (d.lire or excluded.lire, d.creer or excluded.creer, greatest(d.modifier, excluded.modifier),
         greatest(d.supprimer, excluded.supprimer), d.valider or excluded.valider);

-- -----------------------------------------------------------------------------
-- 10. Privilèges des fonctions
-- -----------------------------------------------------------------------------
revoke execute on function
  private.secteur_contenant(uuid, extensions.geometry),
  private.zone_du_secteur(uuid),
  private.geom_geojson(jsonb),
  private.entier_ou_nul(jsonb),
  private.polygone_geojson(jsonb),
  private.noeud_sur_extremite(extensions.geometry, extensions.geometry),
  private.noeuds_extremites(uuid),
  private.lire_troncons_geojson(uuid, jsonb),
  private.lire_noeuds_geojson(uuid, jsonb),
  private.contour_troncons(uuid),
  private.recalculer_contours_zones(uuid[]),
  private.recalculer_contours(uuid[]),
  private.recalculer_statut_secteurs(uuid[]),
  private.recalculer_premier_passage(uuid, uuid),
  private.troncon_actif(uuid),
  private.est_premier_passage(uuid, timestamptz, uuid),
  private.avant_troncon(),
  private.avant_noeud(),
  private.apres_troncons(),
  private.avant_insertion_balayage(),
  private.avant_modification_balayage(),
  private.apres_balayage(),
  private.apres_balayages_statut(),
  public.importer_troncons(uuid, jsonb),
  public.importer_noeuds(uuid, jsonb),
  public.reseau_geojson(uuid, uuid[], boolean, double precision),
  public.noeuds_geojson(uuid, uuid[], boolean),
  public.etat_balayage(uuid, uuid[]),
  public.affecter_troncons_secteur(uuid, uuid[]),
  public.affecter_troncons_polygone(uuid, jsonb, text),
  public.recalculer_contour_secteur(uuid),
  public.definir_contour_secteur(uuid, jsonb)
  from public, anon, authenticated;

-- Appelées avec les droits de l'utilisateur (déclencheurs non DEFINER, vue journalière).
grant execute on function
  private.troncon_actif(uuid),
  private.est_premier_passage(uuid, timestamptz, uuid),
  private.noeuds_extremites(uuid)
  to authenticated, service_role;

-- API du panneau web et de l'APK.
grant execute on function
  public.importer_troncons(uuid, jsonb),
  public.importer_noeuds(uuid, jsonb),
  public.reseau_geojson(uuid, uuid[], boolean, double precision),
  public.noeuds_geojson(uuid, uuid[], boolean),
  public.etat_balayage(uuid, uuid[]),
  public.affecter_troncons_secteur(uuid, uuid[]),
  public.affecter_troncons_polygone(uuid, jsonb, text),
  public.recalculer_contour_secteur(uuid),
  public.definir_contour_secteur(uuid, jsonb)
  to authenticated, service_role;

-- Fonctions internes appelées depuis les fonctions DEFINER : service_role seulement.
grant execute on function
  private.secteur_contenant(uuid, extensions.geometry),
  private.zone_du_secteur(uuid),
  private.geom_geojson(jsonb),
  private.entier_ou_nul(jsonb),
  private.polygone_geojson(jsonb),
  private.noeud_sur_extremite(extensions.geometry, extensions.geometry),
  private.lire_troncons_geojson(uuid, jsonb),
  private.lire_noeuds_geojson(uuid, jsonb),
  private.contour_troncons(uuid),
  private.recalculer_contours_zones(uuid[]),
  private.recalculer_contours(uuid[]),
  private.recalculer_statut_secteurs(uuid[]),
  private.recalculer_premier_passage(uuid, uuid),
  private.avant_troncon(),
  private.avant_noeud(),
  private.apres_troncons(),
  private.avant_insertion_balayage(),
  private.avant_modification_balayage(),
  private.apres_balayage(),
  private.apres_balayages_statut()
  to service_role;
