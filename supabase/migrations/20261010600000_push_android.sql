-- =============================================================================
-- Chantier v2, S7 : notifications push Android (N2).
--
-- Les notifications sont écrites par la base (S1, table notifications). La fonction serveur envoyer-push
-- (service_role) les prend une seule fois (push_envoyee_le), les envoie par Firebase Cloud Messaging aux jetons
-- de leur destinataire (appareils_push, enregistrés par l'APK) et retire les jetons que Firebase refuse.
--
-- Déclenchement : à chaque insertion dans notifications (pg_net, un appel par instruction), et toutes les
-- 5 minutes par pg_cron (rattrapage d'un appel perdu ou d'un envoi en échec). Sans pg_net (tests, base locale),
-- rien n'est planifié : les fonctions restent utilisables par un appel du serveur.
--
-- Clé d'appel : tirée au hasard par cette migration, gardée dans le schéma private (jamais exposé par l'API) ;
-- la fonction serveur la fait vérifier par la base (verifier_cle_push, service_role seulement). Aucun secret
-- dans le dépôt ; la fonction serveur n'a pas de JWT à vérifier (verify_jwt = false), elle refuse tout appel
-- sans la clé.
-- =============================================================================

create table private.envoi_push (
  id boolean primary key default true check (id),
  url text not null,
  cle text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table private.envoi_push enable row level security;
comment on table private.envoi_push is
  'Adresse de la fonction serveur envoyer-push et clé que la base joint à ses appels (N2) ; une seule ligne';

-- Seules les notifications récentes partent : à la mise en service, et après une panne de Firebase, les
-- anciennes ne sont pas envoyées d'un coup (elles restent dans la cloche).
create function public.prendre_notifications_push(p_limite integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _resultat jsonb;
begin
  with prises as (
    update public.notifications n
       set push_envoyee_le = now()
     where n.id in (select x.id from public.notifications x
                     where x.push_envoyee_le is null and x.lue_le is null
                       and x.cree_le > now() - interval '2 hours'
                     order by x.id
                     limit greatest(1, least(coalesce(p_limite, 200), 500))
                     for update skip locked)
    returning n.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'destinataire_id', p.destinataire_id, 'marche_id', p.marche_id, 'evenement', p.evenement,
           'fuite_id', p.fuite_id, 'titre', p.titre, 'corps', p.corps, 'donnees', p.donnees,
           'langue', pr.langue,
           'non_lues', (select count(*) from public.notifications u
                         where u.destinataire_id = p.destinataire_id and u.lue_le is null),
           'jetons', (select coalesce(jsonb_agg(a.jeton order by a.vu_le desc), '[]'::jsonb)
                        from public.appareils_push a where a.profil_id = p.destinataire_id))
           order by p.id), '[]'::jsonb)
    into _resultat
    from prises p
    join public.profils pr on pr.id = p.destinataire_id
   where pr.actif;
  return _resultat;
end
$$;

comment on function public.prendre_notifications_push(integer) is
  'Fonction serveur envoyer-push (service_role) : notifications non lues des 2 dernières heures pas encore envoyées, '
  'marquées envoyées (une seule prise), avec la langue, le nombre de non lues et les jetons du destinataire (N2).';

create function public.retirer_jetons_push(p_jetons text[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with retires as (delete from public.appareils_push where jeton = any (coalesce(p_jetons, '{}')) returning 1)
  select count(*)::integer from retires
$$;

comment on function public.retirer_jetons_push(text[]) is
  'Jetons refusés par Firebase (application désinstallée, jeton périmé) : retirés (fonction serveur envoyer-push).';

create function public.verifier_cle_push(p_cle text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.envoi_push e where e.cle = p_cle and length(coalesce(p_cle, '')) >= 32)
$$;

comment on function public.verifier_cle_push(text) is
  'La clé jointe à un appel de envoyer-push est-elle celle de la base ? (service_role seulement)';

revoke all on function public.prendre_notifications_push(integer), public.retirer_jetons_push(text[]),
  public.verifier_cle_push(text) from public, anon, authenticated;
grant execute on function public.prendre_notifications_push(integer), public.retirer_jetons_push(text[]),
  public.verifier_cle_push(text) to service_role;

-- Appel de la fonction serveur (pg_net : requête mise en file, partie après la validation de la transaction).
-- Une panne de pg_net n'empêche jamais l'écriture d'une notification.
create function private.declencher_push()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _e private.envoi_push;
begin
  select * into _e from private.envoi_push limit 1;
  if _e.url is null then
    return;
  end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
      using _e.url, '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'x-cle-push', _e.cle);
  exception when others then
    raise warning 'Notification push non déclenchée : %', sqlerrm;
  end;
end
$$;

create function private.apres_insertion_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.declencher_push();
  return null;
end
$$;

revoke all on function private.declencher_push(), private.apres_insertion_notifications() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_net absent : envoi push à déclencher par le serveur (fonction envoyer-push)';
    return;
  end if;
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net indisponible (%) : envoi push à déclencher par le serveur', sqlerrm;
    return;
  end;
  insert into private.envoi_push (url)
  values ('https://osajiinsibwrsltntmsk.supabase.co/functions/v1/envoyer-push')
  on conflict (id) do nothing;
  create trigger envoyer_push after insert on public.notifications
    for each statement execute function private.apres_insertion_notifications();
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('envoi-push', '*/5 * * * *', 'select private.declencher_push()');
    exception when others then
      raise notice 'pg_cron indisponible (%) : pas de rattrapage planifié des envois push', sqlerrm;
    end;
  end if;
end
$$;
