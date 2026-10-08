-- =============================================================================
-- Chantier v2, S1 / fichier 4 : notifications (N1, N3) et appareils push (base de N2).
-- Contrat pour les écrans : docs/lots/chantier-v2-base-s1.md.
--
--  * notifications : une ligne par destinataire ; chacun ne lit et ne marque (lu / non lu) que
--    les siennes ; remplie par déclencheurs, jamais par les clients ; publiée en temps réel.
--  * Circuit (N3), réglable dans notifications_circuit (événement × rôle) :
--      fuite_detectee      → Réparation (chef_reparation) et Responsable, dès la détection ;
--      reparation_saisie   → Responsable (réparation à valider) ;
--      reparation_validee  → Réfection, quand une réparation « réparée » qui appelle une
--                            réfection est validée ;
--      refection_saisie    → Responsable ;
--      alerte_reparation   → Réparation et Responsable (non réparée au-delà du délai du marché,
--                            48 h par défaut ; generer_alertes_reparation, toutes les 15 min) ;
--    l'administrateur reçoit tout ; jamais l'auteur ; seulement les comptes affectés au marché.
--  * appareils_push : jetons Firebase des tablettes (enregistrés par l'APK, lus par la fonction
--    serveur d'envoi de S7) ; notifications.push_envoyee_le marque l'envoi.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
create table public.notifications_circuit (
  evenement text not null check (evenement in (
    'fuite_detectee', 'reparation_saisie', 'reparation_validee', 'refection_saisie', 'alerte_reparation')),
  role text not null check (role in ('detection', 'chef_reparation', 'refection', 'responsable')),
  id uuid not null default gen_random_uuid() unique,   -- clé du journal
  primary key (evenement, role)
);
alter table public.notifications_circuit enable row level security;

comment on table public.notifications_circuit is
  'Circuit des notifications (N3) : rôles destinataires de chaque événement ; l''administrateur reçoit tout.';

insert into public.notifications_circuit (evenement, role) values
  ('fuite_detectee', 'chef_reparation'),
  ('fuite_detectee', 'responsable'),
  ('reparation_saisie', 'responsable'),
  ('reparation_validee', 'refection'),
  ('refection_saisie', 'responsable'),
  ('alerte_reparation', 'chef_reparation'),
  ('alerte_reparation', 'responsable');

create table public.notifications (
  id bigint generated always as identity primary key,
  destinataire_id uuid not null references public.profils (id) on delete cascade,
  marche_id uuid not null references public.marches (id),
  evenement text not null check (evenement in (
    'fuite_detectee', 'reparation_saisie', 'reparation_validee', 'refection_saisie', 'alerte_reparation')),
  fuite_id uuid not null,
  reparation_id uuid,
  refection_id uuid,
  auteur_id uuid references public.profils (id) on delete set null,
  titre text not null,
  corps text,
  donnees jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now(),
  lue_le timestamptz,
  push_envoyee_le timestamptz,
  foreign key (fuite_id, marche_id) references public.fuites (id, marche_id),
  foreign key (reparation_id, marche_id) references public.reparations (id, marche_id),
  foreign key (refection_id, marche_id) references public.refections (id, marche_id)
);
alter table public.notifications enable row level security;
create index notifications_destinataire_idx on public.notifications (destinataire_id, cree_le desc);
create index notifications_non_lues_idx on public.notifications (destinataire_id) where lue_le is null;
create index notifications_push_idx on public.notifications (cree_le) where push_envoyee_le is null;
create index notifications_fuite_idx on public.notifications (fuite_id, evenement);

comment on table public.notifications is
  'Notifications par destinataire (N1, N3) : écrites par la base, lues et marquées lues par leur destinataire seulement.';
comment on column public.notifications.donnees is
  'Pour l''affichage traduit (FR / AR) : numero, reference_srm, adresse, resultat, delai_h…';
comment on column public.notifications.push_envoyee_le is
  'Envoi push Android fait (fonction serveur de S7, service_role)';

create table public.appareils_push (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null default auth.uid() references public.profils (id) on delete cascade,
  jeton text not null unique,
  plateforme text not null default 'android' check (plateforme in ('android')),
  version_app text,
  cree_le timestamptz not null default now(),
  vu_le timestamptz not null default now()
);
alter table public.appareils_push enable row level security;
create index appareils_push_profil_idx on public.appareils_push (profil_id);

comment on table public.appareils_push is
  'Jetons push (Firebase Cloud Messaging) des appareils, un par appareil, rattaché au compte connecté (N2, S7).';

-- -----------------------------------------------------------------------------
-- 2. Écriture des notifications
-- -----------------------------------------------------------------------------
create function private.notifier(
  p_evenement text,
  p_marche uuid,
  p_fuite uuid,
  p_reparation uuid,
  p_refection uuid,
  p_exclus uuid[],
  p_titre text,
  p_corps text,
  p_donnees jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _n integer;
begin
  insert into public.notifications
    (destinataire_id, marche_id, evenement, fuite_id, reparation_id, refection_id, auteur_id, titre, corps, donnees)
  select p.id, p_marche, p_evenement, p_fuite, p_reparation, p_refection, auth.uid(), p_titre, p_corps,
         coalesce(p_donnees, '{}'::jsonb)
    from public.profils p
   where p.actif
     and not p.id = any (array_remove(coalesce(p_exclus, '{}'), null))
     and (p.est_admin
          or exists (select 1
                       from public.affectations a
                       join public.notifications_circuit c on c.evenement = p_evenement and c.role = any (a.roles)
                      where a.profil_id = p.id and a.marche_id = p_marche and a.actif));
  get diagnostics _n = row_count;
  return _n;
end
$$;

create function private.donnees_fuite(p_fuite uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('numero', f.numero, 'reference_srm', f.reference_srm, 'adresse', f.adresse,
                            'statut', f.statut)
    from public.fuites f where f.id = p_fuite
$$;

-- Fuite détectée → Réparation et Responsable (pas les fuites importées).
create function private.notifier_fuite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.supprime_le is null and new.source_saisie <> 'import' then
    perform private.notifier('fuite_detectee', new.marche_id, new.id, null, null,
      array[auth.uid(), new.saisi_par, new.auteur_terrain_id],
      format('Nouvelle fuite N° %s détectée', new.numero),
      coalesce(new.adresse, new.reference_srm),
      private.donnees_fuite(new.id));
  end if;
  return null;
end
$$;

-- Réparation saisie → Responsable ; réparation « réparée » validée qui appelle une réfection → Réfection.
create function private.notifier_reparation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _numero integer := (select f.numero from public.fuites f where f.id = new.fuite_id);
  _donnees jsonb := private.donnees_fuite(new.fuite_id) || jsonb_build_object('resultat', new.resultat);
begin
  if new.supprime_le is not null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform private.notifier('reparation_saisie', new.marche_id, new.fuite_id, new.id, null,
      array[auth.uid(), new.saisi_par, new.auteur_terrain_id],
      format('Réparation saisie : fuite N° %s', _numero),
      case new.resultat when 'reparee' then 'Réparée' when 'en_cours' then 'En cours' else 'Non réparée' end,
      _donnees);
  end if;
  if new.validee_le is not null and new.resultat = 'reparee'
     and not (tg_op = 'UPDATE' and old.validee_le is not null and old.resultat = 'reparee' and old.supprime_le is null)
     and private.refection_attendue(new.id)
     and not exists (select 1 from public.refections rf
                      where rf.fuite_id = new.fuite_id and rf.supprime_le is null and rf.cree_le >= new.cree_le) then
    perform private.notifier('reparation_validee', new.marche_id, new.fuite_id, new.id, null,
      array[auth.uid()],
      format('Fuite N° %s réparée et validée : réfection à faire', _numero),
      (select f.adresse from public.fuites f where f.id = new.fuite_id),
      _donnees);
  end if;
  return null;
end
$$;

-- Réfection saisie (faite ou clôture sans réfection) → Responsable.
create function private.notifier_refection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _numero integer := (select f.numero from public.fuites f where f.id = new.fuite_id);
begin
  if new.supprime_le is null then
    perform private.notifier('refection_saisie', new.marche_id, new.fuite_id, new.reparation_id, new.id,
      array[auth.uid(), new.saisi_par, new.auteur_terrain_id],
      case when new.resultat = 'faite' then format('Réfection saisie : fuite N° %s', _numero)
           else format('Clôture sans réfection : fuite N° %s', _numero) end,
      (select f.adresse from public.fuites f where f.id = new.fuite_id),
      private.donnees_fuite(new.fuite_id) || jsonb_build_object('resultat', new.resultat));
  end if;
  return null;
end
$$;

create trigger notifier after insert on public.fuites
  for each row execute function private.notifier_fuite();
create trigger notifier after insert or update on public.reparations
  for each row execute function private.notifier_reparation();
create trigger notifier after insert on public.refections
  for each row execute function private.notifier_refection();

-- Alerte : fuite toujours « détectée » au-delà du délai du marché (48 h par défaut), une seule fois
-- par fuite ; fuites détectées depuis moins de 30 jours (pas de rattrapage des anciennes). Purge des
-- notifications lues depuis plus de 90 jours. Appelée toutes les 15 min (pg_cron) ou par le serveur.
create function public.generer_alertes_reparation()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _f record;
  _n integer := 0;
begin
  for _f in
    select f.id, f.marche_id, f.numero, f.adresse, m.delai_alerte_reparation_h as delai
      from public.fuites f
      join public.marches m on m.id = f.marche_id and m.actif
     where f.statut = 'detectee'
       and f.supprime_le is null
       and f.date_detection > now() - interval '30 days'
       and now() - f.date_detection > make_interval(hours => m.delai_alerte_reparation_h)
       and not exists (select 1 from public.notifications n
                        where n.fuite_id = f.id and n.evenement = 'alerte_reparation')
  loop
    _n := _n + private.notifier('alerte_reparation', _f.marche_id, _f.id, null, null, '{}',
      format('Fuite N° %s non réparée depuis plus de %s h', _f.numero, _f.delai),
      _f.adresse,
      private.donnees_fuite(_f.id) || jsonb_build_object('delai_h', _f.delai));
  end loop;
  delete from public.notifications where lue_le < now() - interval '90 days';
  return _n;
end
$$;

comment on function public.generer_alertes_reparation() is
  'Alertes « non réparée » au-delà du délai du marché (N3) ; serveur seulement (pg_cron toutes les 15 min).';

-- -----------------------------------------------------------------------------
-- 3. Lecture et appareils (comptes connectés)
-- -----------------------------------------------------------------------------

-- Marquer lues : toutes les siennes (p_ids nul, « tout marqué lu à l'ouverture ») ou une liste.
create function public.marquer_notifications_lues(p_ids bigint[] default null)
returns integer
language sql
set search_path = ''
as $$
  with lues as (
    update public.notifications
       set lue_le = now()
     where destinataire_id = auth.uid()
       and lue_le is null
       and (p_ids is null or id = any (p_ids))
    returning 1
  )
  select count(*)::integer from lues
$$;

create function public.compter_notifications_non_lues()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.notifications where destinataire_id = auth.uid() and lue_le is null
$$;

-- Jeton push de l'appareil, rattaché au compte connecté (un appareil passé à un autre agent change
-- de compte).
create function public.enregistrer_appareil_push(p_jeton text, p_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profils p where p.id = auth.uid() and p.actif) then
    raise exception 'Compte non connecté ou révoqué' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_jeton), '') is null then
    raise exception 'Jeton vide' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.appareils_push as a (profil_id, jeton, version_app)
  values (auth.uid(), btrim(p_jeton), p_version)
  on conflict (jeton) do update
    set profil_id = excluded.profil_id, version_app = excluded.version_app, vu_le = now();
end
$$;

create function public.retirer_appareil_push(p_jeton text)
returns void
language sql
set search_path = ''
as $$
  delete from public.appareils_push where jeton = btrim(p_jeton) and profil_id = auth.uid()
$$;

-- -----------------------------------------------------------------------------
-- 4. Règles RLS, privilèges, journal
-- -----------------------------------------------------------------------------
create policy notifications_circuit_lecture on public.notifications_circuit for select to authenticated
  using (true);
create policy notifications_circuit_creation on public.notifications_circuit for insert to authenticated
  with check ((select private.est_admin()));
create policy notifications_circuit_suppression on public.notifications_circuit for delete to authenticated
  using ((select private.est_admin()));
grant select, insert, delete on public.notifications_circuit to authenticated;
create trigger journaliser after insert or update or delete on public.notifications_circuit
  for each row execute function private.journaliser();

create policy notifications_lecture on public.notifications for select to authenticated
  using (destinataire_id = (select auth.uid()));
create policy notifications_marquage on public.notifications for update to authenticated
  using (destinataire_id = (select auth.uid()))
  with check (destinataire_id = (select auth.uid()));
grant select on public.notifications to authenticated;
grant update (lue_le) on public.notifications to authenticated;

create policy appareils_push_lecture on public.appareils_push for select to authenticated
  using (profil_id = (select auth.uid()));
create policy appareils_push_suppression on public.appareils_push for delete to authenticated
  using (profil_id = (select auth.uid()));
grant select, delete on public.appareils_push to authenticated;

revoke execute on function
  private.notifier(text, uuid, uuid, uuid, uuid, uuid[], text, text, jsonb),
  private.donnees_fuite(uuid),
  private.notifier_fuite(),
  private.notifier_reparation(),
  private.notifier_refection(),
  public.generer_alertes_reparation(),
  public.marquer_notifications_lues(bigint[]),
  public.compter_notifications_non_lues(),
  public.enregistrer_appareil_push(text, text),
  public.retirer_appareil_push(text)
  from public, anon, authenticated;
grant execute on function
  public.marquer_notifications_lues(bigint[]),
  public.compter_notifications_non_lues(),
  public.enregistrer_appareil_push(text, text),
  public.retirer_appareil_push(text)
  to authenticated, service_role;
grant execute on function
  private.notifier(text, uuid, uuid, uuid, uuid, uuid[], text, text, jsonb),
  private.donnees_fuite(uuid),
  private.notifier_fuite(),
  private.notifier_reparation(),
  private.notifier_refection(),
  public.generer_alertes_reparation()
  to service_role;

-- -----------------------------------------------------------------------------
-- 5. Temps réel (cloche du panneau) et tâche planifiée (alertes)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('alertes-reparation', '*/15 * * * *', 'select public.generer_alertes_reparation()');
    exception when others then
      raise notice 'pg_cron indisponible (%) : alertes à planifier autrement', sqlerrm;
    end;
  else
    raise notice 'pg_cron absent : alertes « non réparée » à planifier autrement';
  end if;
end
$$;
