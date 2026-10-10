-- =============================================================================
-- Chantier v3, S13 bis (X8) : les mouvements Dolibarr sont LUS par Supabase dans l'API REST de Dolibarr,
-- au lieu d'être poussés par une tâche planifiée du serveur Windows (script jamais installé, retiré du dépôt).
--
-- Chaîne : pg_cron (toutes les 15 min) → pg_net → fonction serveur dolibarr-mouvements (clé d'appel de la base,
-- en-tête x-cle-synchro) → API REST de Dolibarr derrière Cloudflare Access (jeton de service + clé API d'un
-- utilisateur en lecture seule ; secrets de la fonction) → recevoir_envoi_dolibarr (inchangée sur le fond)
-- → importer_mouvements_dolibarr. Le bouton « Synchroniser maintenant » de la page Rapprochement appelle la même
-- fonction avec le jeton du compte (administrateur, ou « quantités / lire »).
--
-- Ajouts à 20261013100000_envoi_dolibarr.sql :
--  * clé d'appel tirée au hasard, gardée dans private (jamais exposée par l'API), vérifiée par la base
--    (verifier_cle_synchro_dolibarr, service_role seulement) : aucun secret dans le dépôt ni à créer pour la
--    planification ;
--  * verrou : une seule lecture à la fois (action « debut », libérée par « fin », périmée après 3 minutes) ;
--  * journal : origine « api » (Dolibarr injoignable, clé refusée… : erreur constatée en lisant l'API) ;
--  * clés absentes d'un mouvement envoyé = valeur gardée : l'API ne connaît pas le bon de transfert (module
--    additionnel StockTransfers) ni son projet ; un n° de bon ou un projet déjà reçus par le CSV ne sont donc
--    pas effacés. Projet absent et jamais reçu : celui de l'entrepôt (projet_entrepot_id) ;
--  * une erreur signalée sans origine est désormais une erreur de lecture de l'API (le script n'existe plus ; « script »
--    reste accepté dans le journal pour l'historique).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Journal : erreurs de lecture de l'API
-- -----------------------------------------------------------------------------
alter table public.envois_dolibarr drop constraint envois_dolibarr_origine_check;
alter table public.envois_dolibarr add constraint envois_dolibarr_origine_check
  check (origine in ('fonction', 'script', 'api'));
comment on column public.envois_dolibarr.origine is
  'fonction : erreur constatée à l''import ; api : erreur en lisant l''API REST de Dolibarr (injoignable, clé ou jeton refusés…) ; script : erreur signalée par l''ancien script du serveur Dolibarr.';

-- -----------------------------------------------------------------------------
-- 2. Planification : adresse de la fonction, clé d'appel, verrou
-- -----------------------------------------------------------------------------
create table private.synchro_dolibarr (
  id boolean primary key default true check (id),
  url text,
  cle text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  en_cours_depuis timestamptz,
  en_cours_par text check (length(en_cours_par) <= 100)
);
alter table private.synchro_dolibarr enable row level security;
comment on table private.synchro_dolibarr is
  'Lecture planifiée de l''API Dolibarr (X8) : adresse de la fonction dolibarr-mouvements, clé que la base joint à ses appels, verrou de la lecture en cours ; une seule ligne';
insert into private.synchro_dolibarr default values;

create function public.verifier_cle_synchro_dolibarr(p_cle text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.synchro_dolibarr s where s.cle = p_cle and length(coalesce(p_cle, '')) >= 32)
$$;
comment on function public.verifier_cle_synchro_dolibarr(text) is
  'La clé jointe à un appel planifié de dolibarr-mouvements est-elle celle de la base ? (service_role seulement)';

-- Le bouton « Synchroniser maintenant » : les comptes qui voient le rapprochement.
create function public.peut_synchroniser_dolibarr()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and ((select private.est_admin()) or cardinality((select private.marches_autorises('quantites', 'lire'))) > 0)
$$;
comment on function public.peut_synchroniser_dolibarr() is
  'Le compte connecté peut-il lancer une lecture de l''API Dolibarr ? (administrateur, ou « quantités / lire » sur un marché)';

revoke all on function public.verifier_cle_synchro_dolibarr(text), public.peut_synchroniser_dolibarr() from public, anon, authenticated;
grant execute on function public.verifier_cle_synchro_dolibarr(text) to service_role;
grant execute on function public.peut_synchroniser_dolibarr() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Réception : verrou, origine « api », clés absentes gardées
-- -----------------------------------------------------------------------------
create or replace function public.recevoir_envoi_dolibarr(p_envoi jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _action text := coalesce(p_envoi ->> 'action', 'envoyer');
  _poste text := left(btrim(p_envoi #>> '{script,poste}'), 100);
  _version text := left(btrim(p_envoi #>> '{script,version}'), 20);
  _origine text := case when p_envoi ->> 'origine' = 'script' then 'script' else 'api' end;
  _verrou private.synchro_dolibarr;
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
    raise exception 'Réservé à la lecture automatique de Dolibarr (fonction serveur)' using errcode = 'insufficient_privilege';
  end if;
  if p_envoi is null or jsonb_typeof(p_envoi) <> 'object' then
    raise exception 'Envoi illisible' using errcode = 'invalid_parameter_value';
  end if;

  if _action = 'etat' then
    return jsonb_build_object('entrepots', private.etat_entrepots_dolibarr(), 'heure_serveur', now());
  end if;

  -- Une seule lecture à la fois ; un verrou de plus de 3 minutes est périmé (lecture interrompue).
  if _action = 'debut' then
    select * into _verrou from private.synchro_dolibarr limit 1 for update;
    if _verrou.en_cours_depuis > now() - interval '3 minutes' then
      return jsonb_build_object('occupe', true, 'depuis', _verrou.en_cours_depuis, 'par', _verrou.en_cours_par);
    end if;
    update private.synchro_dolibarr set en_cours_depuis = now(), en_cours_par = _poste where id;
    return jsonb_build_object('occupe', false, 'entrepots', private.etat_entrepots_dolibarr(), 'heure_serveur', now());
  end if;

  if _action = 'fin' then
    update private.synchro_dolibarr set en_cours_depuis = null, en_cours_par = null where id;
    return jsonb_build_object('libere', true);
  end if;

  if _action = 'erreur' then
    _message := coalesce(nullif(left(btrim(p_envoi ->> 'message'), 500), ''), 'Erreur sans message');
    perform private.journaliser_envoi_dolibarr('erreur', _origine, _message, _poste, _version);
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
     where jsonb_typeof(e.v) = 'object'
       and (e.v ->> 'entrepot_id') ~ '^\d{1,9}$' and (e.v ->> 'entrepot_id')::integer = any (_suivis);
    _ignores := _n - jsonb_array_length(_gardes);
    if exists (select 1 from jsonb_array_elements(_gardes) e (v) where coalesce(e.v ->> 'dolibarr_id', '') !~ '^[1-9]\d{0,17}$') then
      raise exception 'Mouvement sans identifiant Dolibarr valide' using errcode = 'invalid_parameter_value';
    end if;

    -- Bon de transfert et projet absents de l'envoi (lecture de l'API) : valeurs déjà reçues gardées ; projet
    -- jamais reçu : celui de l'entrepôt. Une clé présente, même nulle, fait foi (CSV, ancien script).
    select coalesce(jsonb_agg(
             case when e.v ? 'bon_id' and e.v ? 'projet_id' then e.v - 'projet_entrepot_id'
                  else (e.v - 'projet_entrepot_id') || jsonb_build_object(
                         'bon_id', case when e.v ? 'bon_id' then e.v -> 'bon_id' else to_jsonb(m.bon_id) end,
                         'projet_id', case when e.v ? 'projet_id' then e.v -> 'projet_id'
                                           else to_jsonb(coalesce(m.projet_id,
                                                  case when (e.v ->> 'projet_entrepot_id') ~ '^[1-9]\d{0,8}$'
                                                       then (e.v ->> 'projet_entrepot_id')::integer end)) end)
             end order by e.i), '[]'::jsonb)
      into _gardes
      from jsonb_array_elements(_gardes) with ordinality e (v, i)
      left join public.mouvements_dolibarr m on m.dolibarr_id = (e.v ->> 'dolibarr_id')::bigint;

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
  'Mouvements Dolibarr (X8), service_role seulement : « etat » (rowid reçus par entrepôt suivi), « debut » / « fin » (verrou de la lecture de l''API), « envoyer » (importés par importer_mouvements_dolibarr s''ils sont nouveaux ou changés ; bon et projet absents gardés), « erreur » (lecture de l''API). Journal : envois_dolibarr.';

revoke execute on function public.recevoir_envoi_dolibarr(jsonb) from public, anon, authenticated;
grant execute on function public.recevoir_envoi_dolibarr(jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- 4. Appel planifié (pg_net, réponse immédiate de la fonction : la lecture continue sans faire attendre la base)
-- -----------------------------------------------------------------------------
create function private.declencher_synchro_dolibarr()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _s private.synchro_dolibarr;
begin
  select * into _s from private.synchro_dolibarr limit 1;
  if _s.url is null then
    return;
  end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
      using _s.url, '{"action": "synchroniser"}'::jsonb,
            jsonb_build_object('Content-Type', 'application/json', 'x-cle-synchro', _s.cle);
  exception when others then
    raise warning 'Lecture Dolibarr non déclenchée : %', sqlerrm;
  end;
end
$$;
revoke all on function private.declencher_synchro_dolibarr() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net')
     or not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_net ou pg_cron absent : lecture de l''API Dolibarr par le bouton seulement';
    return;
  end if;
  update private.synchro_dolibarr set url = 'https://osajiinsibwrsltntmsk.supabase.co/functions/v1/dolibarr-mouvements' where id;
  begin
    perform cron.schedule('lecture-dolibarr', '*/15 * * * *', 'select private.declencher_synchro_dolibarr()');
  exception when others then
    raise notice 'pg_cron indisponible (%) : lecture de l''API Dolibarr par le bouton seulement', sqlerrm;
  end;
end
$$;
