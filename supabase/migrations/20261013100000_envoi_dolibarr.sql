-- =============================================================================
-- Chantier v3, S13 (X8) : envoi automatique des mouvements de stock Dolibarr → Supabase.
--
-- Chaîne : tâche planifiée sur le serveur Dolibarr (outils/dolibarr/, sortante seulement : l'API
-- et la base Dolibarr restent sur le réseau local) → fonction serveur dolibarr-mouvements (jeton
-- dédié, secret de fonction DOLIBARR_JETON) → recevoir_envoi_dolibarr (service_role seulement)
-- → importer_mouvements_dolibarr (S9, idempotent par rowid Dolibarr : jamais de doublon).
--
-- Règles :
--  * seuls les mouvements des entrepôts suivis (marches.entrepot_dolibarr_id) sont gardés ; les
--    autres sont comptés « ignorés » ;
--  * seuls les mouvements nouveaux ou changés partent à l'import : un envoi sans changement (le
--    script renvoie toujours les derniers jours, par sécurité) n'écrit rien d'autre qu'un signe de
--    vie dans le journal ;
--  * « état » donne au script, par entrepôt suivi, le plus grand rowid déjà reçu (envoi ou CSV) :
--    il repart de là après une coupure, sans état local indispensable ;
--  * journal des envois (envois_dolibarr) : un envoi avec nouveautés = une ligne ; les signes de
--    vie et les erreurs identiques à la précédente sont regroupés (dernier_le, appels) ; lignes
--    de plus de 400 jours purgées ; lecture comme le journal des imports CSV (administrateur, ou
--    « quantités / lire » sur un marché) ;
--  * jamais de prix : importer_mouvements_dolibarr ne lit que les clés utiles.
-- =============================================================================

create table public.envois_dolibarr (
  id bigint generated always as identity primary key,
  recu_le timestamptz not null default now(),
  dernier_le timestamptz not null default now(),
  appels integer not null default 1 check (appels >= 1),
  statut text not null check (statut in ('recu', 'rien', 'erreur')),
  origine text not null default 'fonction' check (origine in ('fonction', 'script')),
  mouvements integer not null default 0 check (mouvements >= 0),
  nouveaux integer not null default 0 check (nouveaux >= 0),
  modifies integer not null default 0 check (modifies >= 0),
  ignores integer not null default 0 check (ignores >= 0),
  dernier_dolibarr_id bigint,
  date_max timestamptz,
  import_id bigint references public.imports_mouvements_dolibarr (id) on delete set null,
  message text check (length(message) <= 500),
  poste text check (length(poste) <= 100),
  version_script text check (length(version_script) <= 20),
  check (dernier_le >= recu_le)
);
alter table public.envois_dolibarr enable row level security;
create index envois_dolibarr_statut_idx on public.envois_dolibarr (statut, dernier_le desc);

comment on table public.envois_dolibarr is
  'Journal de l''envoi automatique Dolibarr (X8) : envois reçus, signes de vie et erreurs regroupés (appels, dernier_le). Aucun prix.';
comment on column public.envois_dolibarr.statut is
  'recu : au moins un mouvement nouveau ou changé importé ; rien : envoi sans changement (signe de vie) ; erreur : envoi refusé ou erreur signalée par le script.';
comment on column public.envois_dolibarr.origine is
  'fonction : erreur constatée à la réception ; script : erreur signalée par le serveur Dolibarr (lecture de la base impossible…).';
comment on column public.envois_dolibarr.ignores is
  'Mouvements d''un entrepôt qu''aucun marché ne suit (marches.entrepot_dolibarr_id) : non importés.';

create policy envois_dolibarr_lecture on public.envois_dolibarr for select to authenticated
  using (
    (select private.est_admin())
    or cardinality((select private.marches_autorises('quantites', 'lire'))) > 0
  );
revoke all on public.envois_dolibarr from anon, authenticated;
grant select on public.envois_dolibarr to authenticated;
grant all on public.envois_dolibarr to service_role;

-- Une ligne par envoi utile ; signe de vie ou erreur identique à la dernière ligne : regroupés.
create function private.journaliser_envoi_dolibarr(
  p_statut text, p_origine text, p_message text, p_poste text, p_version text,
  p_mouvements integer default 0, p_nouveaux integer default 0, p_modifies integer default 0, p_ignores integer default 0,
  p_dernier_id bigint default null, p_date_max timestamptz default null, p_import_id bigint default null
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  _dernier public.envois_dolibarr;
  _id bigint;
  _message text := nullif(left(btrim(p_message), 500), '');
begin
  select * into _dernier from public.envois_dolibarr order by id desc limit 1 for update;
  if p_statut in ('rien', 'erreur') and _dernier.id is not null
     and _dernier.statut = p_statut and _dernier.origine = p_origine
     and _dernier.message is not distinct from _message then
    update public.envois_dolibarr
       set dernier_le = now(), appels = appels + 1, mouvements = p_mouvements, ignores = p_ignores,
           dernier_dolibarr_id = coalesce(p_dernier_id, dernier_dolibarr_id), date_max = coalesce(p_date_max, date_max),
           poste = coalesce(left(p_poste, 100), poste), version_script = coalesce(left(p_version, 20), version_script)
     where id = _dernier.id
    returning id into _id;
  else
    insert into public.envois_dolibarr (statut, origine, message, poste, version_script, mouvements, nouveaux, modifies,
                                        ignores, dernier_dolibarr_id, date_max, import_id)
    values (p_statut, p_origine, _message, left(p_poste, 100), left(p_version, 20), p_mouvements, p_nouveaux, p_modifies,
            p_ignores, p_dernier_id, p_date_max, p_import_id)
    returning id into _id;
  end if;
  delete from public.envois_dolibarr where dernier_le < now() - interval '400 days';
  return _id;
end
$$;

-- Entrepôts suivis et plus grand rowid reçu (envoi automatique ou CSV) pour chacun.
create function private.etat_entrepots_dolibarr()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'dernier_id', s.dernier_id, 'mouvements', coalesce(s.n, 0))
                            order by e.id), '[]'::jsonb)
    from (select distinct m.entrepot_dolibarr_id as id from public.marches m where m.entrepot_dolibarr_id is not null) e
    left join lateral (
      select max(mo.dolibarr_id) as dernier_id, count(*) as n
        from public.mouvements_dolibarr mo
       where mo.entrepot_id = e.id
    ) s on true
$$;

create function public.recevoir_envoi_dolibarr(p_envoi jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _action text := coalesce(p_envoi ->> 'action', 'envoyer');
  _poste text := left(btrim(p_envoi #>> '{script,poste}'), 100);
  _version text := left(btrim(p_envoi #>> '{script,version}'), 20);
  _tous jsonb;
  _suivis integer[];
  _gardes jsonb;
  _changes jsonb;
  _n integer := 0;
  _ignores integer := 0;
  _dernier_id bigint;
  _date_max timestamptz;
  _resultat jsonb;
  _import_id bigint;
  _message text;
begin
  -- Ouverte au seul service_role (fonction serveur) : un compte connecté n'y entre jamais.
  if auth.uid() is not null then
    raise exception 'Réservé à l''envoi automatique du serveur Dolibarr' using errcode = 'insufficient_privilege';
  end if;
  if p_envoi is null or jsonb_typeof(p_envoi) <> 'object' then
    raise exception 'Envoi illisible' using errcode = 'invalid_parameter_value';
  end if;

  if _action = 'etat' then
    return jsonb_build_object('entrepots', private.etat_entrepots_dolibarr(), 'heure_serveur', now());
  end if;

  if _action = 'erreur' then
    _message := coalesce(nullif(left(btrim(p_envoi ->> 'message'), 500), ''), 'Erreur sans message');
    perform private.journaliser_envoi_dolibarr('erreur', 'script', _message, _poste, _version);
    return jsonb_build_object('journalise', true);
  end if;

  if _action <> 'envoyer' then
    raise exception 'Action inconnue : %', left(_action, 40) using errcode = 'invalid_parameter_value';
  end if;

  begin
    _tous := coalesce(p_envoi -> 'mouvements', '[]'::jsonb);
    if jsonb_typeof(_tous) <> 'array' then
      raise exception 'Liste des mouvements illisible' using errcode = 'invalid_parameter_value';
    end if;
    _n := jsonb_array_length(_tous);
    if _n > 5000 then
      raise exception 'Trop de mouvements dans un seul envoi (5 000 au plus)' using errcode = 'program_limit_exceeded';
    end if;

    select coalesce(array_agg(distinct m.entrepot_dolibarr_id), '{}') into _suivis
      from public.marches m where m.entrepot_dolibarr_id is not null;

    select coalesce(jsonb_agg(e.v order by e.i), '[]'::jsonb) into _gardes
      from jsonb_array_elements(_tous) with ordinality e (v, i)
     where (e.v ->> 'entrepot_id') ~ '^\d{1,9}$' and (e.v ->> 'entrepot_id')::integer = any (_suivis);
    _ignores := _n - jsonb_array_length(_gardes);
    if exists (select 1 from jsonb_array_elements(_gardes) e (v) where coalesce(e.v ->> 'dolibarr_id', '') !~ '^[1-9]\d{0,17}$') then
      raise exception 'Mouvement sans identifiant Dolibarr valide' using errcode = 'invalid_parameter_value';
    end if;

    -- Nouveaux ou changés seulement (mêmes colonnes que la mise à jour de importer_mouvements_dolibarr).
    with lus as (
      select * from private.lire_mouvements_dolibarr(_gardes)
    ),
    a_importer as (
      select l.dolibarr_id
        from lus l
        left join public.mouvements_dolibarr m on m.dolibarr_id = l.dolibarr_id
       where m.dolibarr_id is null
          or (m.date_mouvement, m.produit_dolibarr_id, m.produit_ref, m.produit_designation, m.entrepot_id, m.entrepot_libelle,
              m.entrepot_contrepartie_id, m.entrepot_contrepartie, m.quantite, m.type_mouvement, m.libelle, m.code_inventaire,
              m.annulation, m.projet_id, m.bon_id, m.unite)
             is distinct from
             (l.date_mouvement, l.produit_dolibarr_id, l.produit_ref, l.produit_designation, l.entrepot_id, l.entrepot_libelle,
              l.entrepot_contrepartie_id, l.entrepot_contrepartie, l.quantite, l.type_mouvement, l.libelle, l.code_inventaire,
              l.annulation, l.projet_id, l.bon_id, l.unite)
    )
    select coalesce(jsonb_agg(e.v), '[]'::jsonb),
           (select max(l.dolibarr_id) from lus l),
           (select max(l.date_mouvement) from lus l)
      into _changes, _dernier_id, _date_max
      from jsonb_array_elements(_gardes) e (v)
     where (e.v ->> 'dolibarr_id')::bigint in (select a.dolibarr_id from a_importer a);

    if jsonb_array_length(_changes) = 0 then
      perform private.journaliser_envoi_dolibarr('rien', 'fonction', null, _poste, _version, _n, 0, 0, _ignores,
                                                 _dernier_id, _date_max);
      return jsonb_build_object('statut', 'rien', 'mouvements', _n, 'nouveaux', 0, 'modifies', 0, 'ignores', _ignores,
                                'entrepots', private.etat_entrepots_dolibarr());
    end if;

    _resultat := public.importer_mouvements_dolibarr(_changes);
    select max(i.id) into _import_id from public.imports_mouvements_dolibarr i;
  exception when others then
    _message := left(sqlerrm, 480);
    perform private.journaliser_envoi_dolibarr('erreur', 'fonction', _message, _poste, _version, _n, 0, 0, _ignores);
    return jsonb_build_object('statut', 'erreur', 'erreur', _message, 'code', sqlstate);
  end;

  perform private.journaliser_envoi_dolibarr('recu', 'fonction', null, _poste, _version, _n,
                                             (_resultat ->> 'nouveaux')::integer, (_resultat ->> 'modifies')::integer,
                                             _ignores, _dernier_id, _date_max, _import_id);
  return jsonb_build_object('statut', 'recu', 'mouvements', _n, 'nouveaux', (_resultat ->> 'nouveaux')::integer,
                            'modifies', (_resultat ->> 'modifies')::integer, 'ignores', _ignores,
                            'entrepots', private.etat_entrepots_dolibarr());
end
$$;

comment on function public.recevoir_envoi_dolibarr(jsonb) is
  'Envoi automatique Dolibarr (X8), service_role seulement : action « etat » (rowid reçus par entrepôt suivi), « envoyer » (mouvements, importés par importer_mouvements_dolibarr s''ils sont nouveaux ou changés), « erreur » (signalée par le script). Journal : envois_dolibarr.';

revoke execute on function private.journaliser_envoi_dolibarr(text, text, text, text, text, integer, integer, integer, integer, bigint, timestamptz, bigint)
  from public, anon, authenticated;
revoke execute on function private.etat_entrepots_dolibarr() from public, anon, authenticated;
revoke execute on function public.recevoir_envoi_dolibarr(jsonb) from public, anon, authenticated;
grant execute on function public.recevoir_envoi_dolibarr(jsonb) to service_role;
