-- =============================================================================
-- Chantier v3, S18 : envoi des documents par e-mail (tâches M1 et M2).
-- Contrat : docs/lots/chantier-v3-email.md. L'envoi lui-même part de la route serveur du panneau
-- (web/src/app/api/email/route.ts, Resend, depuis contact@stepag.ma) ; la base tient :
--  1. le carnet des destinataires de chaque marché ;
--  2. le journal des envois, écrit seulement par deux fonctions (réserver, puis terminer) ;
--  3. les limites : envois par marché et par jour (réglable), limite commune à tous les marchés.
-- Droits : responsable du marché et administrateur (comme le suivi GPS, S11).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Qui peut envoyer : responsable du marché (rôle actif) et administrateur
-- -----------------------------------------------------------------------------
-- p_ecriture : pour un non-administrateur, un marché désactivé reste lisible mais ne permet plus d'envoyer.
create function private.marches_emails(p_ecriture boolean default false)
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
         join public.marches m on m.id = a.marche_id and (m.actif or not p_ecriture)
        where a.profil_id = auth.uid() and a.actif and 'responsable' = any (a.roles))
  end
$$;

revoke execute on function private.marches_emails(boolean) from public, anon;
grant execute on function private.marches_emails(boolean) to authenticated;

create function public.peut_envoyer_email(p_marche uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_marche is not null and p_marche = any (private.marches_emails(true))
$$;

comment on function public.peut_envoyer_email(uuid) is
  'Le compte peut envoyer des documents par e-mail pour ce marché (responsable du marché, administrateur).';
revoke execute on function public.peut_envoyer_email(uuid) from public, anon;
grant execute on function public.peut_envoyer_email(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Limite du marché
-- -----------------------------------------------------------------------------
alter table public.marches
  add column emails_par_jour integer not null default 20 check (emails_par_jour between 1 and 100);

comment on column public.marches.emails_par_jour is
  'Envois de documents par e-mail permis par jour (jour d''Oujda) pour ce marché (S18).';

-- -----------------------------------------------------------------------------
-- 3. Destinataires
-- -----------------------------------------------------------------------------
create table public.destinataires_email (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  nom text not null check (btrim(nom) <> '' and length(nom) <= 120),
  email text not null check (length(email) <= 254 and email ~* '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'),
  organisme text check (length(organisme) <= 120),
  par_defaut boolean not null default false,
  actif boolean not null default true,
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
alter table public.destinataires_email enable row level security;
create unique index destinataires_email_unique_idx on public.destinataires_email (marche_id, lower(email));

comment on table public.destinataires_email is
  'Carnet des destinataires des documents envoyés par e-mail, par marché (SRM, bureau…) ; « par défaut » : coché d''office.';

create trigger maj_modifie_le before update on public.destinataires_email
  for each row execute function private.maj_modifie_le();
create trigger figer_marche before update on public.destinataires_email
  for each row execute function private.figer_marche();
create trigger journaliser after insert or update or delete on public.destinataires_email
  for each row execute function private.journaliser();

create policy destinataires_email_lecture on public.destinataires_email for select to authenticated
  using (marche_id = any ((select private.marches_emails(false))::uuid[]));
create policy destinataires_email_creation on public.destinataires_email for insert to authenticated
  with check (marche_id = any ((select private.marches_emails(true))::uuid[]));
create policy destinataires_email_modification on public.destinataires_email for update to authenticated
  using (marche_id = any ((select private.marches_emails(true))::uuid[]))
  with check (marche_id = any ((select private.marches_emails(true))::uuid[]));
create policy destinataires_email_suppression on public.destinataires_email for delete to authenticated
  using (marche_id = any ((select private.marches_emails(true))::uuid[]));

grant select, insert, update, delete on public.destinataires_email to authenticated;
grant all on public.destinataires_email to service_role;

-- -----------------------------------------------------------------------------
-- 4. Journal des envois (aucune écriture directe : fonctions du § 5)
-- -----------------------------------------------------------------------------
create table public.envois_email (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  envoye_par uuid not null references public.profils (id),
  document text not null constraint envois_email_document_check
    check (document in ('rapport', 'rapport_fuite', 'carte', 'attachement', 'pv_debits', 'rapport_balayage', 'export')),
  reference text check (length(reference) <= 120),
  objet text not null check (btrim(objet) <> '' and length(objet) <= 200),
  destinataires text[] not null check (cardinality(destinataires) between 1 and 10),
  piece_nom text not null check (btrim(piece_nom) <> '' and length(piece_nom) <= 200),
  piece_octets integer not null check (piece_octets between 1 and 4194304),
  statut text not null default 'en_cours' check (statut in ('en_cours', 'envoye', 'echec')),
  fournisseur_id text check (length(fournisseur_id) <= 200),
  erreur text check (length(erreur) <= 500),
  cree_le timestamptz not null default now(),
  termine_le timestamptz
);
alter table public.envois_email enable row level security;
create index envois_email_marche_idx on public.envois_email (marche_id, cree_le desc);
create index envois_email_jour_idx on public.envois_email (cree_le) where statut <> 'echec';

comment on table public.envois_email is
  'Journal des documents envoyés par e-mail (S18) : qui, quand, quoi, à qui ; copie cachée dans la boîte contact@stepag.ma.';

create policy envois_email_lecture on public.envois_email for select to authenticated
  using (marche_id = any ((select private.marches_emails(false))::uuid[]));

grant select on public.envois_email to authenticated;
grant all on public.envois_email to service_role;

-- -----------------------------------------------------------------------------
-- 5. Réserver un envoi (avant l'appel au fournisseur), puis le terminer
-- -----------------------------------------------------------------------------
-- Limite commune à tous les marchés : l'offre gratuite de Resend permet 100 e-mails par jour.
create function private.limite_emails_jour_total()
returns integer
language sql
immutable
set search_path = ''
as $$ select 90 $$;

create function public.reserver_envoi_email(
  p_marche uuid,
  p_document text,
  p_reference text,
  p_objet text,
  p_destinataires text[],
  p_piece_nom text,
  p_piece_octets integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _jour date := (now() at time zone 'Africa/Casablanca')::date;
  _limite integer;
  _du_marche integer;
  _total integer;
  _adresses text[];
  _id uuid;
begin
  if auth.uid() is null or not public.peut_envoyer_email(p_marche) then
    raise exception 'Envoi par e-mail réservé au responsable du marché et à l''administrateur'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(distinct lower(btrim(a))), '{}') into _adresses
    from unnest(coalesce(p_destinataires, '{}')) a
   where btrim(a) <> '';
  if cardinality(_adresses) not between 1 and 10 then
    raise exception 'De 1 à 10 destinataires' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from unnest(_adresses) a
              where length(a) > 254 or a !~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$') then
    raise exception 'Adresse e-mail invalide' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(btrim(p_objet), '') = '' or length(p_objet) > 200 then
    raise exception 'Objet obligatoire (200 caractères au plus)' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_piece_octets, 0) not between 1 and 4194304 then
    raise exception 'Pièce jointe : 4 Mo au plus' using errcode = 'invalid_parameter_value';
  end if;

  -- Un envoi à la fois pour le décompte du jour (deux clics simultanés ne dépassent pas la limite).
  perform pg_advisory_xact_lock(hashtext('envois_email'));

  select m.emails_par_jour into _limite from public.marches m where m.id = p_marche;
  select count(*) filter (where e.marche_id = p_marche), count(*)
    into _du_marche, _total
    from public.envois_email e
   where e.statut <> 'echec'
     and e.cree_le >= (_jour::timestamp at time zone 'Africa/Casablanca')
     and e.cree_le < ((_jour + 1)::timestamp at time zone 'Africa/Casablanca');
  if _du_marche >= _limite then
    raise exception 'Limite du jour atteinte pour ce marché (% envois)', _limite using errcode = 'check_violation';
  end if;
  if _total >= private.limite_emails_jour_total() then
    raise exception 'Limite du jour atteinte pour l''ensemble des marchés (% envois)', private.limite_emails_jour_total()
      using errcode = 'check_violation';
  end if;

  insert into public.envois_email (marche_id, envoye_par, document, reference, objet, destinataires, piece_nom, piece_octets)
  values (p_marche, auth.uid(), p_document, nullif(btrim(p_reference), ''), btrim(p_objet), _adresses,
          btrim(p_piece_nom), p_piece_octets)
  returning id into _id;
  return _id;
end
$$;

comment on function public.reserver_envoi_email(uuid, text, text, text, text[], text, integer) is
  'Contrôle droit et limites du jour, puis inscrit l''envoi « en cours » au journal ; renvoie son identifiant (S18).';

create function public.terminer_envoi_email(p_id uuid, p_statut text, p_fournisseur_id text default null, p_erreur text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_statut not in ('envoye', 'echec') then
    raise exception 'Statut final : envoye ou echec' using errcode = 'invalid_parameter_value';
  end if;
  update public.envois_email e
     set statut = p_statut,
         fournisseur_id = left(p_fournisseur_id, 200),
         erreur = case when p_statut = 'echec' then left(coalesce(p_erreur, 'Échec'), 500) end,
         termine_le = now()
   where e.id = p_id and e.envoye_par = auth.uid() and e.statut = 'en_cours';
  if not found then
    raise exception 'Envoi introuvable ou déjà terminé' using errcode = 'no_data_found';
  end if;
end
$$;

comment on function public.terminer_envoi_email(uuid, text, text, text) is
  'Clôt un envoi « en cours » de l''appelant : envoyé (identifiant du fournisseur) ou échec (message).';

revoke execute on function public.reserver_envoi_email(uuid, text, text, text, text[], text, integer) from public, anon;
revoke execute on function public.terminer_envoi_email(uuid, text, text, text) from public, anon;
revoke execute on function private.limite_emails_jour_total() from public, anon;
grant execute on function public.reserver_envoi_email(uuid, text, text, text, text[], text, integer) to authenticated;
grant execute on function public.terminer_envoi_email(uuid, text, text, text) to authenticated;
grant execute on function private.limite_emails_jour_total() to authenticated;
