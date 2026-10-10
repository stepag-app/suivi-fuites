-- =============================================================================
-- Suivi GPS : compromis présenté aux agents (décision d'Issam, 2026-10-10).
--
-- Motif du suivi : le tracé prouve à la SRM le linéaire réellement balayé (le balayage est payé au linéaire, un
-- tronçon coché peut être contesté) et sert à la sécurité de l'agent seul sur la voie publique. Il n'est lu que par
-- le responsable du marché (et l'administrateur), jusqu'à la fin du marché.
--
--  1. Heures de travail par marché (Paramètres › Marché, responsable et administrateur, par regler_suivi_gps) :
--     08:00 à 18:00, du lundi au samedi, heure d'Oujda, par défaut. La tablette n'enregistre rien en dehors ; la
--     base ignore aussi tout point reçu hors des heures (APK pas encore à jour comprises). Les points déjà reçus hors
--     des heures par défaut sont retirés des tracés existants (fin de la migration).
--  2. Pauses : l'agent met le suivi en pause (« Pause » remplace « Désactiver ») ; reprise automatique au bout de
--     60 min, au plus 90 min par jour (réglables), reprise immédiate quand il signale une fuite ou coche un tronçon.
--     Une pause n'a ni lieu ni position : début, fin, durée. Aucun point n'est gardé pendant une pause.
--  3. État du suivi de chaque agent (signaler_suivi_gps, appelé par la tablette) et alerte « suivi coupé » au
--     responsable : session ouverte, heures de travail, pas de pause en cours, aucun signe du suivi depuis plus de
--     30 min (autorisation retirée, appli fermée, tablette éteinte). Une alerte par interruption (pg_cron, 5 min).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Réglages du marché (lus par l'APK avec la fiche du marché)
-- -----------------------------------------------------------------------------
alter table public.marches
  add column suivi_gps_debut time not null default '08:00',
  add column suivi_gps_fin time not null default '18:00',
  add column suivi_gps_jours smallint[] not null default '{1,2,3,4,5,6}',
  add column suivi_gps_pause_min smallint not null default 60,
  add column suivi_gps_pause_jour_min smallint not null default 90,
  add constraint marches_suivi_gps_heures check (suivi_gps_fin > suivi_gps_debut),
  add constraint marches_suivi_gps_jours check (
    cardinality(suivi_gps_jours) between 1 and 7 and suivi_gps_jours <@ '{1,2,3,4,5,6,7}'::smallint[]),
  add constraint marches_suivi_gps_pauses check (
    suivi_gps_pause_min between 5 and 240 and suivi_gps_pause_jour_min between 0 and 480);

comment on column public.marches.suivi_gps_debut is 'Suivi GPS : début des heures de travail (heure d''Oujda)';
comment on column public.marches.suivi_gps_fin is 'Suivi GPS : fin des heures de travail (heure d''Oujda, exclue ; 24:00 = minuit)';
comment on column public.marches.suivi_gps_jours is 'Suivi GPS : jours de travail, 1 = lundi … 7 = dimanche';
comment on column public.marches.suivi_gps_pause_min is 'Suivi GPS : durée d''une pause avant la reprise automatique (min)';
comment on column public.marches.suivi_gps_pause_jour_min is 'Suivi GPS : durée totale des pauses par jour (min) ; 0 = pas de pause';

-- Modifiables seulement par regler_suivi_gps (responsable du marché ou administrateur), jamais par la fiche.
create function private.proteger_reglages_suivi_gps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.appel_systeme()
     and (new.suivi_gps_debut, new.suivi_gps_fin, new.suivi_gps_jours, new.suivi_gps_pause_min, new.suivi_gps_pause_jour_min)
         is distinct from
         (old.suivi_gps_debut, old.suivi_gps_fin, old.suivi_gps_jours, old.suivi_gps_pause_min, old.suivi_gps_pause_jour_min) then
    raise exception 'Les heures de travail et les pauses du suivi GPS se règlent dans Paramètres › Marché (responsable ou administrateur)'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger proteger_reglages_suivi_gps before update on public.marches
  for each row execute function private.proteger_reglages_suivi_gps();

create function public.regler_suivi_gps(
  p_marche uuid,
  p_debut time,
  p_fin time,
  p_jours smallint[],
  p_pause_min integer,
  p_pause_jour_min integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = 'insufficient_privilege';
  end if;
  if not (private.est_admin() or p_marche = any (private.marches_traces_gps())) then
    raise exception 'Réservé au responsable du marché et à l''administrateur' using errcode = 'insufficient_privilege';
  end if;
  perform private.controler_verrou_admin('parametres', 'modifier');
  if not exists (select 1 from public.marches m where m.id = p_marche) then
    raise exception 'Marché introuvable' using errcode = 'no_data_found';
  end if;
  update public.marches m
     set suivi_gps_debut = p_debut,
         suivi_gps_fin = p_fin,
         suivi_gps_jours = (select coalesce(array_agg(distinct j order by j), '{}') from unnest(p_jours) j),
         suivi_gps_pause_min = p_pause_min,
         suivi_gps_pause_jour_min = p_pause_jour_min
   where m.id = p_marche;
end
$$;

comment on function public.regler_suivi_gps(uuid, time, time, smallint[], integer, integer) is
  'Suivi GPS : heures et jours de travail, durée d''une pause et total par jour ; responsable du marché ou administrateur (journalisé)';

-- Heure d'Oujda d'un instant. La tablette donne son décalage UTC (minutes, heure affichée à l'agent, réglée par le
-- réseau) : il fait foi. Sans lui, la base des fuseaux (Africa/Casablanca), qui peut retarder d'un changement d'heure
-- décidé par le Maroc (retour à +00 le 2026-09-20 selon les bases à jour).
create function private.heure_locale(p_instant timestamptz, p_decalage_min integer default null)
returns timestamp
language sql
stable
set search_path = ''
as $$
  select case when p_decalage_min is null then p_instant at time zone 'Africa/Casablanca'
              else (p_instant at time zone 'UTC') + make_interval(mins => p_decalage_min) end
$$;

-- Instant d'une heure locale (inverse de heure_locale).
create function private.instant_local(p_local timestamp, p_decalage_min integer default null)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when p_decalage_min is null then p_local at time zone 'Africa/Casablanca'
              else (p_local - make_interval(mins => p_decalage_min)) at time zone 'UTC' end
$$;

-- Instant compris dans les heures de travail (heure d'Oujda) ?
create function private.heure_de_travail(p_instant timestamptz, p_debut time, p_fin time, p_jours smallint[],
                                         p_decalage_min integer default null)
returns boolean
language sql
stable
set search_path = ''
as $$
  select extract(isodow from x.l)::integer = any (p_jours) and x.l::time >= p_debut and x.l::time < p_fin
    from (select private.heure_locale(p_instant, p_decalage_min) as l) x
$$;

-- -----------------------------------------------------------------------------
-- 2. Pauses (sans lieu)
-- -----------------------------------------------------------------------------
create table public.pauses_gps (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  profil_id uuid not null references public.profils (id) on delete cascade,
  jour date not null,
  debut timestamptz not null,
  fin_prevue timestamptz not null,
  fin timestamptz,
  motif_fin text check (motif_fin in ('automatique', 'agent', 'fuite', 'balayage', 'fin_journee', 'quitter')),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, profil_id, debut),
  check (fin_prevue >= debut),
  check (fin is null or (fin >= debut and fin <= fin_prevue))
);
alter table public.pauses_gps enable row level security;
create index pauses_gps_marche_jour_idx on public.pauses_gps (marche_id, jour);
create index pauses_gps_profil_idx on public.pauses_gps (profil_id, marche_id, debut);

comment on table public.pauses_gps is
  'Suivi GPS : pauses des agents (début, fin, durée ; jamais de position) ; écrites par enregistrer_pause_gps, lues par le responsable et l''administrateur';
comment on column public.pauses_gps.fin_prevue is 'Reprise automatique : début + durée d''une pause, bornée par le reste du jour';
comment on column public.pauses_gps.fin is 'Fin réelle ; nulle tant que la pause n''est pas finie (ou pas encore reçue)';

create policy pauses_gps_lecture on public.pauses_gps for select to authenticated
  using (marche_id = any ((select private.marches_traces_gps())::uuid[]));
grant select on public.pauses_gps to authenticated;
create trigger maj_modifie_le before update on public.pauses_gps
  for each row execute function private.maj_modifie_le();

-- -----------------------------------------------------------------------------
-- 3. État du suivi de chaque agent (une ligne par agent et par marché)
-- -----------------------------------------------------------------------------
create table public.suivi_gps_etats (
  marche_id uuid not null references public.marches (id),
  profil_id uuid not null references public.profils (id) on delete cascade,
  etat text not null check (etat in ('actif', 'pause', 'hors_heures', 'autorisation', 'ferme')),
  dernier_signe timestamptz not null default now(),
  dernier_suivi timestamptz,
  alerte_le timestamptz,
  decalage_min smallint check (decalage_min between -720 and 840),
  modifie_le timestamptz not null default now(),
  primary key (marche_id, profil_id)
);
alter table public.suivi_gps_etats enable row level security;

comment on table public.suivi_gps_etats is
  'Suivi GPS : dernier état signalé par la tablette de l''agent (actif, pause, hors_heures, autorisation refusée, ferme = « Quitter »), lu par le responsable et l''administrateur';
comment on column public.suivi_gps_etats.dernier_signe is 'Dernier contact de la tablette (tout état)';
comment on column public.suivi_gps_etats.dernier_suivi is 'Dernier signe d''un suivi qui tourne : état actif ou pause, ou point reçu (son horodatage)';
comment on column public.suivi_gps_etats.alerte_le is 'Dernière alerte « suivi coupé » envoyée au responsable';
comment on column public.suivi_gps_etats.decalage_min is 'Décalage UTC de l''heure de la tablette (minutes) : heure d''Oujda de l''agent';

create policy suivi_gps_etats_lecture on public.suivi_gps_etats for select to authenticated
  using (marche_id = any ((select private.marches_traces_gps())::uuid[]));
grant select on public.suivi_gps_etats to authenticated;

-- Affectation active du compte connecté sur un marché actif (écriture du suivi).
create function private.controler_affectation_suivi(p_marche uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'Connexion requise' using errcode = 'insufficient_privilege';
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
  return _uid;
end
$$;

-- Réglages tels que la tablette les lit (marches.suivi_gps_*).
create function private.reglages_suivi_gps(p_marche uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'suivi_gps_debut', m.suivi_gps_debut, 'suivi_gps_fin', m.suivi_gps_fin, 'suivi_gps_jours', m.suivi_gps_jours,
           'suivi_gps_pause_min', m.suivi_gps_pause_min, 'suivi_gps_pause_jour_min', m.suivi_gps_pause_jour_min)
    from public.marches m
   where m.id = p_marche
$$;

-- La tablette signale son état (changement, ou toutes les 10 min pendant que le suivi tourne) ; retourne les
-- réglages du marché, que la tâche de fond garde à jour sans rouvrir l'appli.
create function public.signaler_suivi_gps(p_marche uuid, p_etat text, p_decalage_min integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := private.controler_affectation_suivi(p_marche);
begin
  if p_etat is null or p_etat not in ('actif', 'pause', 'hors_heures', 'autorisation', 'ferme') then
    raise exception 'État inconnu : %', p_etat using errcode = 'invalid_parameter_value';
  end if;
  if p_decalage_min is not null and p_decalage_min not between -720 and 840 then
    raise exception 'Décalage horaire invalide' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.suivi_gps_etats as e (marche_id, profil_id, etat, dernier_signe, dernier_suivi, decalage_min)
  values (p_marche, _uid, p_etat, now(), case when p_etat in ('actif', 'pause') then now() end, p_decalage_min)
  on conflict (marche_id, profil_id) do update
    set etat = excluded.etat,
        dernier_signe = excluded.dernier_signe,
        dernier_suivi = coalesce(excluded.dernier_suivi, e.dernier_suivi),
        decalage_min = coalesce(excluded.decalage_min, e.decalage_min),
        modifie_le = now();
  return private.reglages_suivi_gps(p_marche);
end
$$;

comment on function public.signaler_suivi_gps(uuid, text, integer) is
  'Suivi GPS : état de la tablette de l''agent connecté (actif, pause, hors_heures, autorisation, ferme) et décalage UTC de son heure ; retourne les réglages du marché';

create function private.decalage_suivi(p_marche uuid, p_profil uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select e.decalage_min::integer from public.suivi_gps_etats e where e.marche_id = p_marche and e.profil_id = p_profil
$$;

-- -----------------------------------------------------------------------------
-- 4. Écriture d'un tracé à partir de ses points, et nettoyage (heures de travail, pauses)
-- -----------------------------------------------------------------------------
-- p_points : [{t, lon, lat}, …] ; doublons d'horodatage : le premier gardé. Aucun point : le tracé est effacé.
create function private.ecrire_trace(p_marche uuid, p_profil uuid, p_jour date, p_points jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _geom extensions.geometry;
  _n integer;
begin
  with uniques as (
    select distinct on (r.t) r.t, r.lon, r.lat
      from jsonb_to_recordset(coalesce(p_points, '[]'::jsonb)) r (t bigint, lon double precision, lat double precision)
     order by r.t
  ), points as (
    select extensions.st_setsrid(extensions.st_makepointm(lon, lat, t), 4326) as p, t
      from uniques
     union all
    select extensions.st_setsrid(extensions.st_makepointm(lon, lat, t), 4326), t
      from uniques
     where (select count(*) from uniques) = 1
  )
  select extensions.st_makeline(p order by t), (select count(*) from uniques)
    into _geom, _n
    from points;

  if coalesce(_n, 0) = 0 then
    delete from public.traces_gps t where t.marche_id = p_marche and t.profil_id = p_profil and t.jour = p_jour;
    return 0;
  end if;
  insert into public.traces_gps as g (marche_id, profil_id, jour, trace, nb_points, debut, fin, distance_m)
  values (p_marche, p_profil, p_jour, _geom, _n,
          to_timestamp(extensions.st_m(extensions.st_startpoint(_geom))),
          to_timestamp(extensions.st_m(extensions.st_endpoint(_geom))),
          round(extensions.st_length(_geom::extensions.geography))::integer)
  on conflict (marche_id, profil_id, jour) do update
    set trace = excluded.trace, nb_points = excluded.nb_points, debut = excluded.debut, fin = excluded.fin,
        distance_m = excluded.distance_m;
  return _n;
end
$$;

-- Retire d'un tracé les points hors des heures de travail du marché ou pendant une pause de l'agent ; retourne le
-- nombre de points retirés.
create function private.nettoyer_trace(p_marche uuid, p_profil uuid, p_jour date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _m public.marches;
  _dec integer := private.decalage_suivi(p_marche, p_profil);
  _avant integer;
  _gardes jsonb;
  _apres integer;
begin
  select * into _m from public.marches m where m.id = p_marche;
  perform pg_advisory_xact_lock(hashtextextended(p_profil::text || p_marche::text || p_jour::text, 0));
  select count(distinct x.t),
         coalesce(jsonb_agg(jsonb_build_object('t', x.t, 'lon', x.lon, 'lat', x.lat))
                    filter (where private.heure_de_travail(to_timestamp(x.t), _m.suivi_gps_debut, _m.suivi_gps_fin, _m.suivi_gps_jours, _dec)
                              and not exists (select 1 from public.pauses_gps q
                                               where q.marche_id = p_marche and q.profil_id = p_profil
                                                 and x.t >= extract(epoch from q.debut)
                                                 and x.t < extract(epoch from coalesce(q.fin, q.fin_prevue)))), '[]'::jsonb)
    into _avant, _gardes
    from public.traces_gps t
   cross join lateral (
     select extensions.st_m(d.geom)::bigint as t, extensions.st_x(d.geom) as lon, extensions.st_y(d.geom) as lat
       from extensions.st_dumppoints(t.trace) d
   ) x
   where t.marche_id = p_marche and t.profil_id = p_profil and t.jour = p_jour;
  if coalesce(_avant, 0) = 0 then
    return 0;
  end if;
  select count(distinct (e ->> 't')) into _apres from jsonb_array_elements(_gardes) e;
  if _apres = _avant then
    return 0;
  end if;
  perform private.ecrire_trace(p_marche, p_profil, p_jour, _gardes);
  return _avant - _apres;
end
$$;

-- -----------------------------------------------------------------------------
-- 5. Ajout de points : mêmes règles qu'en S11, plus les heures de travail et les pauses (filtre de la base,
--    en plus de celui de la tablette), et le dernier signe du suivi.
-- -----------------------------------------------------------------------------
create or replace function public.ajouter_points_trace(p_marche uuid, p_points jsonb)
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
  _existant extensions.geometry;
  _maintenant double precision := extract(epoch from now());
  _valides jsonb;
  _tous jsonb;
  _dernier bigint;
  _m public.marches;
  _dec integer;
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
  perform private.controler_affectation_suivi(p_marche);
  select * into _m from public.marches m where m.id = p_marche;
  _dec := private.decalage_suivi(p_marche, _uid);

  -- Points valides seulement : trois nombres, coordonnées possibles, horodatage ni futur ni vieux de plus de 7 jours,
  -- pris pendant les heures de travail du marché et hors d'une pause de l'agent.
  select coalesce(jsonb_agg(jsonb_build_object('t', y.t, 'lon', y.lon, 'lat', y.lat,
                                               'jour', (to_timestamp(y.t) at time zone 'Africa/Casablanca')::date)), '[]'::jsonb),
         max(y.t)
    into _valides, _dernier
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
         and private.heure_de_travail(to_timestamp(x.t), _m.suivi_gps_debut, _m.suivi_gps_fin, _m.suivi_gps_jours, _dec)
         and not exists (select 1 from public.pauses_gps q
                          where q.marche_id = p_marche and q.profil_id = _uid
                            and x.t >= extract(epoch from q.debut) and x.t < extract(epoch from coalesce(q.fin, q.fin_prevue)))
       order by x.t
    ) y;

  for _jour in select distinct r.jour from jsonb_to_recordset(_valides) r (jour date) order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(_uid::text || p_marche::text || _jour::text, 0));

    select t.trace into _existant
      from public.traces_gps t
     where t.marche_id = p_marche and t.profil_id = _uid and t.jour = _jour;
    _avant := case when _existant is null then 0 else
      (select count(distinct extensions.st_m(d.geom)) from extensions.st_dumppoints(_existant) d) end;

    -- Points déjà reçus d'abord : à horodatage égal, l'ancien est gardé.
    select jsonb_agg(jsonb_build_object('t', w.t, 'lon', w.lon, 'lat', w.lat))
      into _tous
      from (select distinct on (u.t) u.t, u.lon, u.lat from (
        select extensions.st_m(d.geom)::bigint as t, extensions.st_x(d.geom) as lon, extensions.st_y(d.geom) as lat, 0 as rang
          from extensions.st_dumppoints(_existant) d
         where _existant is not null
        union all
        select r.t, r.lon, r.lat, 1
          from jsonb_to_recordset(_valides) r (t bigint, lon double precision, lat double precision, jour date)
         where r.jour = _jour
      ) u order by u.t, u.rang) w;
    _apres := private.ecrire_trace(p_marche, _uid, _jour, _tous);
    _ajoutes := _ajoutes + (_apres - _avant);
  end loop;

  -- Signe du suivi (tablette à jour seulement : la ligne d'état n'existe qu'après son premier signalement).
  if _dernier is not null then
    update public.suivi_gps_etats e
       set dernier_signe = now(),
           dernier_suivi = greatest(e.dernier_suivi, to_timestamp(_dernier)),
           modifie_le = now()
     where e.marche_id = p_marche and e.profil_id = _uid;
  end if;

  return jsonb_build_object('recus', _recus, 'ajoutes', _ajoutes, 'ignores', _recus - _ajoutes);
end
$$;

comment on function public.ajouter_points_trace(uuid, jsonb) is
  'Suivi GPS (X6) : ajoute des points [t Unix, lon, lat] au tracé du jour de l''agent connecté dans le marché ; idempotent (point déjà reçu ignoré), indifférent à l''ordre des lots, 1000 points au plus ; points hors des heures de travail ou pendant une pause ignorés';

-- -----------------------------------------------------------------------------
-- 6. Pauses envoyées par la tablette (début, puis fin ; idempotent sur le début)
-- -----------------------------------------------------------------------------
create function public.enregistrer_pause_gps(
  p_marche uuid,
  p_debut timestamptz,
  p_fin timestamptz default null,
  p_motif text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := private.controler_affectation_suivi(p_marche);
  _m public.marches;
  _jour date;
  _utilise double precision;
  _reste double precision;
  _fin_prevue timestamptz;
  _fin timestamptz;
  _p public.pauses_gps;
begin
  if p_debut is null or p_debut > now() + interval '10 minutes' or p_debut < now() - interval '7 days' then
    raise exception 'Début de pause invalide' using errcode = 'invalid_parameter_value';
  end if;
  if p_fin is not null and p_fin < p_debut then
    raise exception 'Fin de pause avant son début' using errcode = 'invalid_parameter_value';
  end if;
  if p_motif is not null and p_motif not in ('automatique', 'agent', 'fuite', 'balayage', 'fin_journee', 'quitter') then
    raise exception 'Motif de fin inconnu : %', p_motif using errcode = 'invalid_parameter_value';
  end if;
  select * into _m from public.marches m where m.id = p_marche;
  _jour := private.heure_locale(p_debut, private.decalage_suivi(p_marche, _uid))::date;
  perform pg_advisory_xact_lock(hashtextextended('pause' || _uid::text || p_marche::text || _jour::text, 0));

  -- Fin prévue fixée au premier envoi : durée d'une pause, bornée par ce qui reste du jour (autres pauses du jour).
  select * into _p from public.pauses_gps q where q.marche_id = p_marche and q.profil_id = _uid and q.debut = p_debut;
  if found then
    _fin_prevue := _p.fin_prevue;
  else
    select coalesce(sum(extract(epoch from coalesce(q.fin, q.fin_prevue) - q.debut)), 0)
      into _utilise
      from public.pauses_gps q
     where q.marche_id = p_marche and q.profil_id = _uid and q.jour = _jour;
    _reste := greatest(0, least(_m.suivi_gps_pause_min * 60.0, _m.suivi_gps_pause_jour_min * 60.0 - _utilise));
    _fin_prevue := p_debut + make_interval(secs => _reste);
  end if;
  _fin := case when p_fin is not null then least(p_fin, _fin_prevue) end;

  insert into public.pauses_gps as q (marche_id, profil_id, jour, debut, fin_prevue, fin, motif_fin)
  values (p_marche, _uid, _jour, p_debut, _fin_prevue, _fin, case when _fin is not null then p_motif end)
  on conflict (marche_id, profil_id, debut) do update
    -- une pause finie ne se rouvre pas
    set fin = coalesce(q.fin, excluded.fin),
        motif_fin = coalesce(q.motif_fin, excluded.motif_fin)
  returning * into _p;

  -- Aucun point pendant une pause, même arrivé avant elle (ordre d'envoi, horloge de la tablette).
  perform private.nettoyer_trace(p_marche, _uid, _jour);
  update public.suivi_gps_etats e set dernier_signe = now(), modifie_le = now()
   where e.marche_id = p_marche and e.profil_id = _uid;

  return jsonb_build_object('id', _p.id, 'debut', _p.debut, 'fin_prevue', _p.fin_prevue, 'fin', _p.fin);
end
$$;

comment on function public.enregistrer_pause_gps(uuid, timestamptz, timestamptz, text) is
  'Suivi GPS : pause de l''agent connecté (début, puis fin et motif) ; durée bornée par les réglages du marché ; jamais de position';

-- -----------------------------------------------------------------------------
-- 7. Suivi coupé : depuis quand (null s'il ne l'est pas) et alerte au responsable
-- -----------------------------------------------------------------------------
create function private.suivi_gps_coupe_depuis(p_marche uuid, p_profil uuid, p_maintenant timestamptz default now())
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _e public.suivi_gps_etats;
  _m public.marches;
  _ref timestamptz;
begin
  -- Appel d'un compte connecté : responsable du marché ou administrateur seulement (la tâche planifiée n'a pas de compte).
  if auth.uid() is not null and not (private.est_admin() or p_marche = any (private.marches_traces_gps())) then
    return null;
  end if;
  select * into _e from public.suivi_gps_etats e where e.marche_id = p_marche and e.profil_id = p_profil;
  -- Session fermée (« Quitter »), ou tablette muette depuis plus de 3 jours (congé, tablette rangée) : rien.
  if not found or _e.etat = 'ferme' or _e.dernier_signe < p_maintenant - interval '3 days' then
    return null;
  end if;
  select * into _m from public.marches m where m.id = p_marche and m.actif;
  if not found or not private.heure_de_travail(p_maintenant, _m.suivi_gps_debut, _m.suivi_gps_fin, _m.suivi_gps_jours, _e.decalage_min) then
    return null;
  end if;
  if not exists (select 1 from public.affectations a join public.profils p on p.id = a.profil_id and p.actif
                  where a.profil_id = p_profil and a.marche_id = p_marche and a.actif) then
    return null;
  end if;
  if exists (select 1 from public.pauses_gps q
              where q.marche_id = p_marche and q.profil_id = p_profil
                and q.debut <= p_maintenant and coalesce(q.fin, q.fin_prevue) > p_maintenant) then
    return null;
  end if;
  -- Dernier signe du suivi, mais pas avant le début des heures du jour ni avant la fin de la dernière pause.
  _ref := greatest(
    _e.dernier_suivi,
    private.instant_local(private.heure_locale(p_maintenant, _e.decalage_min)::date + _m.suivi_gps_debut, _e.decalage_min),
    (select max(coalesce(q.fin, q.fin_prevue)) from public.pauses_gps q
      where q.marche_id = p_marche and q.profil_id = p_profil and q.debut <= p_maintenant));
  if p_maintenant - _ref > interval '30 minutes' then
    return _ref;
  end if;
  return null;
end
$$;

-- Notifications sans fuite (alerte du suivi GPS) : la fuite devient facultative, nouvel événement « suivi_coupe »
-- envoyé au responsable (et à l'administrateur, qui reçoit tout).
alter table public.notifications alter column fuite_id drop not null;
alter table public.notifications drop constraint notifications_evenement_check;
alter table public.notifications add constraint notifications_evenement_check check (evenement in (
  'fuite_detectee', 'reparation_saisie', 'reparation_validee', 'refection_saisie', 'alerte_reparation', 'suivi_coupe'));
alter table public.notifications add constraint notifications_fuite_requise check (fuite_id is not null or evenement = 'suivi_coupe');
alter table public.notifications_circuit drop constraint notifications_circuit_evenement_check;
alter table public.notifications_circuit add constraint notifications_circuit_evenement_check check (evenement in (
  'fuite_detectee', 'reparation_saisie', 'reparation_validee', 'refection_saisie', 'alerte_reparation', 'suivi_coupe'));
insert into public.notifications_circuit (evenement, role) values ('suivi_coupe', 'responsable')
  on conflict do nothing;

create function public.generer_alertes_suivi_gps(p_maintenant timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _e record;
  _depuis timestamptz;
  _heure text;
  _n integer := 0;
begin
  for _e in
    select e.marche_id, e.profil_id, e.etat, e.alerte_le, e.decalage_min, p.nom_complet
      from public.suivi_gps_etats e
      join public.profils p on p.id = e.profil_id
     where e.etat <> 'ferme'
  loop
    _depuis := private.suivi_gps_coupe_depuis(_e.marche_id, _e.profil_id, p_maintenant);
    continue when _depuis is null or (_e.alerte_le is not null and _e.alerte_le >= _depuis);
    _heure := to_char(private.heure_locale(_depuis, _e.decalage_min), 'HH24:MI');
    _n := _n + private.notifier('suivi_coupe', _e.marche_id, null, null, null, array[_e.profil_id],
      format('Suivi GPS interrompu : %s', _e.nom_complet),
      case when _e.etat = 'autorisation'
        then format('Autorisation de position refusée sur la tablette ; aucune position depuis %s.', _heure)
        else format('Aucune position depuis %s : application fermée, autorisation retirée, tablette éteinte ou sans réseau.', _heure)
      end,
      jsonb_build_object('agent', _e.nom_complet, 'profil_id', _e.profil_id, 'depuis', _depuis, 'heure', _heure, 'etat', _e.etat));
    update public.suivi_gps_etats e set alerte_le = p_maintenant
     where e.marche_id = _e.marche_id and e.profil_id = _e.profil_id;
  end loop;
  return _n;
end
$$;

comment on function public.generer_alertes_suivi_gps(timestamptz) is
  'Suivi GPS : alerte « suivi coupé » au responsable (session ouverte, heures de travail, pas de pause, aucun signe depuis 30 min), une par interruption ; serveur seulement (pg_cron toutes les 5 min)';

-- -----------------------------------------------------------------------------
-- 8. Lecture pour le panneau (responsable et administrateur, par la RLS des tables)
-- -----------------------------------------------------------------------------
create view public.v_suivi_gps_etats with (security_invoker = true) as
select e.marche_id, e.profil_id, p.identifiant, p.nom_complet, e.etat, e.dernier_signe, e.dernier_suivi, e.alerte_le,
       pz.debut as pause_debut, pz.fin_prevue as pause_fin_prevue,
       private.suivi_gps_coupe_depuis(e.marche_id, e.profil_id) as coupe_depuis
  from public.suivi_gps_etats e
  join public.profils p on p.id = e.profil_id
  left join lateral (
    select q.debut, q.fin_prevue
      from public.pauses_gps q
     where q.marche_id = e.marche_id and q.profil_id = e.profil_id
       and q.debut <= now() and coalesce(q.fin, q.fin_prevue) > now()
     order by q.debut desc
     limit 1
  ) pz on true;
grant select on public.v_suivi_gps_etats to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Fin du marché et suppression d'un compte : pauses et états suivent les tracés
-- -----------------------------------------------------------------------------
create or replace function public.purger_traces_marche(p_marche uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _n integer;
  _points bigint;
  _pauses integer;
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
  with supprimees as (delete from public.pauses_gps q where q.marche_id = p_marche returning 1)
  select count(*) into _pauses from supprimees;
  delete from public.suivi_gps_etats e where e.marche_id = p_marche;
  insert into public.journal (marche_id, table_nom, ligne_id, operation, changements, utilisateur_id)
  values (p_marche, 'traces_gps', p_marche::text, 'suppression',
          jsonb_build_object('traces', _n, 'points', _points, 'pauses', _pauses), auth.uid());
  return _n;
end
$$;

-- saisies_compte : les tracés, pauses et états du suivi ne comptent pas comme des saisies (copie de S11).
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
                and t.relname in ('profils', 'affectations', 'droits', 'verrous_admin', 'notifications', 'appareils_push',
                                  'traces_gps', 'pauses_gps', 'suivi_gps_etats'))
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

-- -----------------------------------------------------------------------------
-- 10. Privilèges
-- -----------------------------------------------------------------------------
revoke all on function
  public.regler_suivi_gps(uuid, time, time, smallint[], integer, integer),
  public.signaler_suivi_gps(uuid, text, integer),
  public.enregistrer_pause_gps(uuid, timestamptz, timestamptz, text),
  public.generer_alertes_suivi_gps(timestamptz),
  private.proteger_reglages_suivi_gps(),
  private.heure_locale(timestamptz, integer),
  private.instant_local(timestamp, integer),
  private.heure_de_travail(timestamptz, time, time, smallint[], integer),
  private.decalage_suivi(uuid, uuid),
  private.controler_affectation_suivi(uuid),
  private.reglages_suivi_gps(uuid),
  private.ecrire_trace(uuid, uuid, date, jsonb),
  private.nettoyer_trace(uuid, uuid, date),
  private.suivi_gps_coupe_depuis(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function
  public.regler_suivi_gps(uuid, time, time, smallint[], integer, integer),
  public.signaler_suivi_gps(uuid, text, integer),
  public.enregistrer_pause_gps(uuid, timestamptz, timestamptz, text),
  private.heure_locale(timestamptz, integer),
  private.instant_local(timestamp, integer),
  private.heure_de_travail(timestamptz, time, time, smallint[], integer),
  private.suivi_gps_coupe_depuis(uuid, uuid, timestamptz)
  to authenticated;
grant execute on function public.generer_alertes_suivi_gps(timestamptz) to service_role;

-- -----------------------------------------------------------------------------
-- 11. Tâche planifiée et nettoyage des tracés déjà reçus
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('alertes-suivi-gps', '*/5 * * * *', 'select public.generer_alertes_suivi_gps()');
  else
    raise notice 'pg_cron absent : alertes « suivi coupé » à planifier autrement';
  end if;
exception when others then
  raise notice 'pg_cron indisponible (%) : alertes « suivi coupé » à planifier autrement', sqlerrm;
end
$$;

-- Points déjà reçus hors des heures de travail par défaut (08:00 à 18:00, lundi à samedi) : retirés.
do $$
declare
  _t record;
  _retires bigint := 0;
begin
  for _t in select t.marche_id, t.profil_id, t.jour from public.traces_gps t loop
    _retires := _retires + private.nettoyer_trace(_t.marche_id, _t.profil_id, _t.jour);
  end loop;
  raise notice 'Suivi GPS : % point(s) hors des heures de travail retiré(s) des tracés existants', _retires;
  raise notice 'Suivi GPS : heure d''Oujda selon la base : % (UTC : %)',
    to_char(now() at time zone 'Africa/Casablanca', 'YYYY-MM-DD HH24:MI'), to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI');
end
$$;
