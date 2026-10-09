-- =============================================================================
-- Chantier v2, S11 : suivi GPS en arrière-plan (X6, décisions d'Issam Q14).
--
-- Un tracé par agent, par marché et par jour (jour d'Oujda, Africa/Casablanca) : une seule ligne
-- `traces_gps` dont la géométrie est une LineString M (x = longitude, y = latitude, M = horodatage en secondes
-- Unix). Pas une ligne par point : 5 000 à 10 000 points par jour tiennent dans quelques dizaines de ko, ce qui
-- garde la base sous les 500 Mo du palier gratuit de Supabase (10 agents, 302 jours : environ 70 Mo au pire).
--
-- Écriture : uniquement par `ajouter_points_trace` (SECURITY DEFINER), par lots, idempotente : un point déjà
-- reçu (même horodatage) est ignoré, l'ordre d'arrivée des lots n'importe pas (reprise après coupure du réseau,
-- envoi en double). L'agent ne peut écrire que son propre tracé, dans un marché où il est affecté et actif.
--
-- Lecture : le responsable du marché et l'administrateur seulement (jamais les autres agents, ni l'agent
-- lui-même). Conservation jusqu'à la fin du marché ; `purger_traces_marche` (administrateur) efface les tracés
-- d'un marché désactivé. Pas de purge automatique : la désactivation d'un marché est réversible.
-- =============================================================================

create table public.traces_gps (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  profil_id uuid not null references public.profils (id) on delete cascade,
  jour date not null,
  trace extensions.geometry(LineStringM, 4326) not null,
  nb_points integer not null check (nb_points >= 1),
  debut timestamptz not null,
  fin timestamptz not null,
  distance_m integer not null default 0 check (distance_m >= 0),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, profil_id, jour),
  check (fin >= debut)
);
alter table public.traces_gps enable row level security;
create index traces_gps_marche_jour_idx on public.traces_gps (marche_id, jour);

comment on table public.traces_gps is
  'Suivi GPS (X6) : un tracé par agent, marché et jour ; LineString M (lon, lat, horodatage Unix) ; écrit par ajouter_points_trace, lu par le responsable et l''administrateur';
comment on column public.traces_gps.trace is
  'LineString M en WGS84 : M = secondes Unix ; un jour à un seul point répète ce point (une ligne a deux sommets au moins)';
comment on column public.traces_gps.jour is 'Jour civil à Oujda (Africa/Casablanca) des points du tracé';

-- Marchés où le compte est responsable (tous pour l'administrateur) : les seuls à lire les tracés.
create function private.marches_traces_gps()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.est_admin() then
      (select coalesce(array_agg(m.id), '{}') from public.marches m)
    else
      (select coalesce(array_agg(a.marche_id), '{}')
         from public.affectations a
         join public.profils p on p.id = a.profil_id and p.actif
        where a.profil_id = auth.uid() and a.actif and 'responsable' = any (a.roles))
  end
$$;

create policy traces_gps_lecture on public.traces_gps for select to authenticated
  using (marche_id = any ((select private.marches_traces_gps())::uuid[]));
grant select on public.traces_gps to authenticated;

create trigger maj_modifie_le before update on public.traces_gps
  for each row execute function private.maj_modifie_le();

-- Un compte qui n'a que des tracés n'a rien « saisi » : il reste supprimable (ses tracés partent avec lui).
-- saisies_compte : les tracés GPS ne comptent pas comme des saisies (copie de la version S1 + 'traces_gps').
create or replace function private.saisies_compte(p_profil uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _r record;
  _n bigint;
  _res jsonb := '{}'::jsonb;
begin
  for _r in
    select n.nspname as schema_nom, t.relname as table_nom, a.attname as colonne
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.profils'::regclass
       and cardinality(c.conkey) = 1
       and not (n.nspname = 'public'
                and t.relname in ('profils', 'affectations', 'droits', 'verrous_admin', 'notifications', 'appareils_push', 'traces_gps'))
     order by 1, 2, 3
  loop
    execute format('select count(*) from %I.%I where %I = $1', _r.schema_nom, _r.table_nom, _r.colonne)
      into _n using p_profil;
    if _n > 0 then
      _res := _res || jsonb_build_object(_r.table_nom, coalesce((_res ->> _r.table_nom)::bigint, 0) + _n);
    end if;
  end loop;

  select count(*) into _n
    from public.journal j
   where j.utilisateur_id = p_profil
     and j.table_nom not in ('notifications', 'appareils_push')
     and not (j.table_nom = 'profils' and j.ligne_id = p_profil::text);
  if _n > 0 then
    _res := _res || jsonb_build_object('journal', _n);
  end if;
  return _res;
end
$$;

-- Le compte peut-il être supprimé ? Sinon, la raison (bouton « Supprimer » grisé) : révocation seule.
;


-- -----------------------------------------------------------------------------
-- Ajout de points par lots. p_points : tableau de [horodatage Unix en secondes, longitude, latitude].
-- Retourne {recus, ajoutes, ignores} ; « ignores » = points invalides ou déjà reçus.
-- -----------------------------------------------------------------------------
create function public.ajouter_points_trace(p_marche uuid, p_points jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _recus integer;
  _ajoutes integer := 0;
  _jour date;
  _avant integer;
  _apres integer;
  _geom extensions.geometry;
  _existant extensions.geometry;
  _maintenant double precision := extract(epoch from now());
  _valides jsonb;
begin
  if _uid is null then
    raise exception 'Connexion requise' using errcode = 'insufficient_privilege';
  end if;
  if p_points is null or jsonb_typeof(p_points) <> 'array' then
    raise exception 'Liste de points attendue' using errcode = 'invalid_parameter_value';
  end if;
  _recus := jsonb_array_length(p_points);
  if _recus > 1000 then
    raise exception 'Au plus 1000 points par envoi' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (
    select 1
      from public.affectations a
      join public.profils p on p.id = a.profil_id and p.actif
      join public.marches m on m.id = a.marche_id and m.actif
     where a.profil_id = _uid and a.marche_id = p_marche and a.actif
  ) then
    raise exception 'Aucune affectation active sur ce marché' using errcode = 'insufficient_privilege';
  end if;

  -- Points valides seulement : trois nombres, coordonnées possibles, horodatage ni futur ni vieux de plus de 7 jours.
  select coalesce(jsonb_agg(jsonb_build_object('t', y.t, 'lon', y.lon, 'lat', y.lat,
                                               'jour', (to_timestamp(y.t) at time zone 'Africa/Casablanca')::date)), '[]'::jsonb)
    into _valides
    from (
      select distinct on (x.t) x.t, x.lon, x.lat
        from (
          select case when v.ok then (v.e ->> 0)::double precision::bigint end as t,
                 case when v.ok then (v.e ->> 1)::double precision end as lon,
                 case when v.ok then (v.e ->> 2)::double precision end as lat
            from (
              select e, case
                       when jsonb_typeof(e) <> 'array' then false
                       when jsonb_array_length(e) < 3 then false
                       when not (jsonb_typeof(e -> 0) = 'number' and jsonb_typeof(e -> 1) = 'number'
                                 and jsonb_typeof(e -> 2) = 'number') then false
                       else (e ->> 0)::numeric between 0 and 4102444800
                     end as ok
                from jsonb_array_elements(p_points) e
            ) v
        ) x
       where x.lon between -180 and 180 and x.lat between -90 and 90
         and x.t between _maintenant - 7 * 86400 and _maintenant + 600
       order by x.t
    ) y;

  for _jour in select distinct r.jour from jsonb_to_recordset(_valides) r (jour date) order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(_uid::text || p_marche::text || _jour::text, 0));

    select t.trace into _existant
      from public.traces_gps t
     where t.marche_id = p_marche and t.profil_id = _uid and t.jour = _jour;
    _avant := case when _existant is null then 0 else
      (select count(distinct extensions.st_m(d.geom)) from extensions.st_dumppoints(_existant) d) end;

    with tous as (
      select extensions.st_m(d.geom)::bigint as t, extensions.st_x(d.geom) as lon, extensions.st_y(d.geom) as lat, 0 as rang
        from extensions.st_dumppoints(_existant) d
       where _existant is not null
      union all
      select r.t, r.lon, r.lat, 1
        from jsonb_to_recordset(_valides) r (t bigint, lon double precision, lat double precision, jour date)
       where r.jour = _jour
    ), uniques as (
      select distinct on (t) t, lon, lat from tous order by t, rang
    ), points as (
      select extensions.st_setsrid(extensions.st_makepointm(lon, lat, t), 4326) as p, t
        from uniques
       union all
      select extensions.st_setsrid(extensions.st_makepointm(lon, lat, t), 4326), t
        from uniques
       where (select count(*) from uniques) = 1
    )
    select extensions.st_makeline(p order by t), (select count(*) from uniques)
      into _geom, _apres
      from points;

    _ajoutes := _ajoutes + (_apres - _avant);
    insert into public.traces_gps as g (marche_id, profil_id, jour, trace, nb_points, debut, fin, distance_m)
    values (p_marche, _uid, _jour, _geom, _apres,
            to_timestamp(extensions.st_m(extensions.st_startpoint(_geom))),
            to_timestamp(extensions.st_m(extensions.st_endpoint(_geom))),
            round(extensions.st_length(_geom::extensions.geography))::integer)
    on conflict (marche_id, profil_id, jour) do update
      set trace = excluded.trace, nb_points = excluded.nb_points, debut = excluded.debut, fin = excluded.fin,
          distance_m = excluded.distance_m;
  end loop;

  return jsonb_build_object('recus', _recus, 'ajoutes', _ajoutes, 'ignores', _recus - _ajoutes);
end
$$;

comment on function public.ajouter_points_trace(uuid, jsonb) is
  'Suivi GPS (X6) : ajoute des points [t Unix, lon, lat] au tracé du jour de l''agent connecté dans le marché ; idempotent (point déjà reçu ignoré), indifférent à l''ordre des lots, 1000 points au plus';

-- Tracés d'un marché sans la géométrie (liste du panneau) : rôle de lecture de la table (RLS de l'appelant).
create view public.v_traces_gps with (security_invoker = true) as
select t.id, t.marche_id, t.profil_id, p.identifiant, p.nom_complet, t.jour, t.debut, t.fin, t.nb_points, t.distance_m
  from public.traces_gps t
  join public.profils p on p.id = t.profil_id;
grant select on public.v_traces_gps to authenticated;

-- Points d'un tracé : [[lon, lat, t], ...] dans l'ordre du temps (RLS de l'appelant : rien si non autorisé).
create function public.trace_gps(p_marche uuid, p_profil uuid, p_jour date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'id', t.id, 'jour', t.jour, 'profil_id', t.profil_id, 'debut', t.debut, 'fin', t.fin,
           'nb_points', t.nb_points, 'distance_m', t.distance_m,
           'points', (select coalesce(jsonb_agg(jsonb_build_array(
                        round(extensions.st_x(d.geom)::numeric, 6), round(extensions.st_y(d.geom)::numeric, 6),
                        extensions.st_m(d.geom)::bigint) order by d.path[1]), '[]'::jsonb)
                        from extensions.st_dumppoints(t.trace) d
                       where t.nb_points > 1 or d.path[1] = 1))
    from public.traces_gps t
   where t.marche_id = p_marche and t.profil_id = p_profil and t.jour = p_jour
$$;

comment on function public.trace_gps(uuid, uuid, date) is
  'Suivi GPS (X6) : points [lon, lat, t Unix] du tracé d''un agent pour un jour ; null si aucun tracé lisible (responsable du marché et administrateur seulement, par la RLS)';

-- Fin du marché : l'administrateur efface les tracés d'un marché désactivé (journalisé).
create function public.purger_traces_marche(p_marche uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _n integer;
  _points bigint;
begin
  if not private.est_admin() then
    raise exception 'Réservé à l''administrateur' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.marches m where m.id = p_marche) then
    raise exception 'Marché introuvable' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.marches m where m.id = p_marche and m.actif) then
    raise exception 'Le marché doit d''abord être désactivé (fin du marché)' using errcode = 'check_violation';
  end if;
  select coalesce(sum(t.nb_points), 0) into _points from public.traces_gps t where t.marche_id = p_marche;
  with supprimes as (delete from public.traces_gps t where t.marche_id = p_marche returning 1)
  select count(*) into _n from supprimes;
  insert into public.journal (marche_id, table_nom, ligne_id, operation, changements, utilisateur_id)
  values (p_marche, 'traces_gps', p_marche::text, 'suppression',
          jsonb_build_object('traces', _n, 'points', _points), auth.uid());
  return _n;
end
$$;

comment on function public.purger_traces_marche(uuid) is
  'Suivi GPS (X6) : efface tous les tracés d''un marché désactivé (administrateur) ; retourne le nombre de tracés effacés, journalisé';

revoke all on function public.ajouter_points_trace(uuid, jsonb), public.trace_gps(uuid, uuid, date),
  public.purger_traces_marche(uuid), private.marches_traces_gps() from public, anon, authenticated;
grant execute on function public.ajouter_points_trace(uuid, jsonb), public.trace_gps(uuid, uuid, date),
  public.purger_traces_marche(uuid), private.marches_traces_gps() to authenticated;
