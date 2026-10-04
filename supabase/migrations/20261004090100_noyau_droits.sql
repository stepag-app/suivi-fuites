-- =============================================================================
-- Migration 1 / fichier 2 : noyau (marchés, profils, affectations, droits, journal)
-- et fonctions de sécurité utilisées par toutes les règles RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Marchés
-- -----------------------------------------------------------------------------
create table public.marches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                       -- ex. SRM-4500004453
  numero text not null,                            -- numéro officiel du marché
  numero_appel_offres text,
  intitule text not null,
  client text not null,
  ville text,
  date_notification date,
  date_commencement date,
  duree_mois integer check (duree_mois > 0),
  -- Facturation : prix du bordereau, puis majoration appliquée au total de la facture.
  taux_majoration numeric(5,2) not null default 0 check (taux_majoration >= 0),
  taux_tva numeric(5,2) not null default 20 check (taux_tva >= 0),
  taux_retenue_garantie numeric(5,2) not null default 10 check (taux_retenue_garantie >= 0),
  plafond_retenue_garantie numeric(5,2) check (plafond_retenue_garantie >= 0),
  -- Paramètres terrain et alertes
  rayon_redetection_m integer not null default 15 check (rayon_redetection_m > 0),
  delai_alerte_reparation_h integer not null default 48 check (delai_alerte_reparation_h > 0),
  delai_prealerte_refection_chaussee_j integer not null default 20 check (delai_prealerte_refection_chaussee_j > 0),
  delai_refection_chaussee_j integer not null default 30 check (delai_refection_chaussee_j > 0),
  delai_alerte_refection_trottoir_j integer not null default 30 check (delai_alerte_refection_trottoir_j > 0),
  une_unite_par_prix_et_fuite boolean not null default true,
  actif boolean not null default true,
  observation text,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
alter table public.marches enable row level security;

-- -----------------------------------------------------------------------------
-- Profils : un par compte Supabase Auth. Le compte est créé par l'administrateur
-- (Edge Function côté serveur) ; l'agent se connecte avec un identifiant simple.
-- -----------------------------------------------------------------------------
create table public.profils (
  id uuid primary key references auth.users (id) on delete cascade,
  identifiant text not null unique check (identifiant ~ '^[a-z0-9._-]{3,40}$'),
  nom_complet text not null,
  telephone text,
  langue public.langue_interface not null default 'fr',
  est_admin boolean not null default false,
  actif boolean not null default true,              -- false = accès révoqué
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
alter table public.profils enable row level security;

-- -----------------------------------------------------------------------------
-- Affectation d'un utilisateur à un marché, avec ses rôles (cumulables).
-- -----------------------------------------------------------------------------
create table public.affectations (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null references public.profils (id),
  marche_id uuid not null references public.marches (id),
  roles text[] not null default '{}'
    check (roles <@ array['detection', 'chef_reparation', 'responsable']::text[]),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (profil_id, marche_id)
);
alter table public.affectations enable row level security;
create index affectations_marche_idx on public.affectations (marche_id);

-- -----------------------------------------------------------------------------
-- Droits CRUD par utilisateur, marché et type de donnée.
-- -----------------------------------------------------------------------------
create table public.droits (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null,
  marche_id uuid not null,
  type_donnee public.type_donnee not null,
  lire boolean not null default false,
  creer boolean not null default false,
  modifier public.portee_droit not null default 'non',
  supprimer public.portee_droit not null default 'non',   -- suppression logique
  valider boolean not null default false,                  -- valider, verrouiller, corriger
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (profil_id, marche_id, type_donnee),
  foreign key (profil_id, marche_id)
    references public.affectations (profil_id, marche_id) on delete cascade
);
alter table public.droits enable row level security;

-- Modèles de rôles : droits appliqués d'un clic depuis le panneau. Les rôles se
-- cumulent : appliquer un second modèle ne retire jamais un droit.
create table public.modeles_droits (
  role text not null check (role in ('detection', 'chef_reparation', 'responsable')),
  type_donnee public.type_donnee not null,
  lire boolean not null default false,
  creer boolean not null default false,
  modifier public.portee_droit not null default 'non',
  supprimer public.portee_droit not null default 'non',
  valider boolean not null default false,
  primary key (role, type_donnee)
);
alter table public.modeles_droits enable row level security;

insert into public.modeles_droits (role, type_donnee, lire, creer, modifier, supprimer, valider) values
  -- Agent de détection : voit tout le marché, signale, corrige ses propres saisies.
  ('detection', 'fuites',        true,  true,  'siennes', 'non',     false),
  ('detection', 'interventions', true,  false, 'non',     'non',     false),
  ('detection', 'photos',        true,  true,  'siennes', 'siennes', false),
  ('detection', 'balayage',      true,  true,  'siennes', 'non',     false),
  -- Chef d'équipe de réparation : saisit réparations, réfections, pièces.
  ('chef_reparation', 'fuites',        true, true,  'siennes', 'non',     false),
  ('chef_reparation', 'interventions', true, true,  'siennes', 'non',     false),
  ('chef_reparation', 'photos',        true, true,  'siennes', 'siennes', false),
  -- Responsable (technicien de bureau) : supervise, corrige, valide, exporte.
  ('responsable', 'fuites',        true, true, 'toutes', 'toutes', true),
  ('responsable', 'interventions', true, true, 'toutes', 'toutes', true),
  ('responsable', 'photos',        true, true, 'toutes', 'toutes', true),
  ('responsable', 'quantites',     true, true, 'toutes', 'toutes', true),
  ('responsable', 'parametres',    true, true, 'toutes', 'toutes', true),
  ('responsable', 'ouvriers',      true, true, 'toutes', 'toutes', true),
  ('responsable', 'journal',       true, false, 'non',   'non',    false),
  ('responsable', 'exports',       true, true, 'non',    'non',    false),
  ('responsable', 'balayage',      true, true, 'toutes', 'toutes', true),
  ('responsable', 'mesures_debit', true, true, 'toutes', 'toutes', true),
  ('responsable', 'attachements',  true, true, 'toutes', 'toutes', true);

-- -----------------------------------------------------------------------------
-- Compteurs (numérotation séquentielle par marché). Table technique privée.
-- -----------------------------------------------------------------------------
create table private.compteurs (
  marche_id uuid not null references public.marches (id),
  cle text not null,
  valeur integer not null default 0,
  primary key (marche_id, cle)
);

create function private.prochain_numero(p_marche uuid, p_cle text)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into private.compteurs as c (marche_id, cle, valeur)
  values (p_marche, p_cle, 1)
  on conflict (marche_id, cle) do update set valeur = c.valeur + 1
  returning valeur
$$;

-- -----------------------------------------------------------------------------
-- Fonctions de sécurité (SECURITY DEFINER, search_path vide, schéma privé)
-- -----------------------------------------------------------------------------

create function private.est_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profils p
    where p.id = auth.uid() and p.est_admin and p.actif
  )
$$;

-- Marchés auxquels l'utilisateur est affecté (tous pour l'administrateur).
create function private.mes_marches()
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
        where a.profil_id = auth.uid() and a.actif)
  end
$$;

-- Droit effectif de l'utilisateur sur un type de donnée dans un marché.
create function private.droit(p_marche uuid, p_type public.type_donnee)
returns public.droits
language sql
stable
security definer
set search_path = ''
as $$
  select d.*
    from public.droits d
    join public.affectations a
      on a.profil_id = d.profil_id and a.marche_id = d.marche_id and a.actif
    join public.profils p on p.id = d.profil_id and p.actif
   where d.profil_id = auth.uid()
     and d.marche_id = p_marche
     and d.type_donnee = p_type
$$;

-- Marchés où l'utilisateur peut faire une action sans condition d'auteur
-- (lire, créer, valider, ou modifier / supprimer avec une portée quelconque).
-- Appelée sous la forme « marche_id = any ((select private.marches_autorises(...))::uuid[]) »
-- pour n'être évaluée qu'une fois par requête.
create function private.marches_autorises(p_type public.type_donnee, p_action text)
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
      (select coalesce(array_agg(d.marche_id), '{}')
         from public.droits d
         join public.affectations a
           on a.profil_id = d.profil_id and a.marche_id = d.marche_id and a.actif
         join public.profils p on p.id = d.profil_id and p.actif
        where d.profil_id = auth.uid()
          and d.type_donnee = p_type
          and case p_action
                when 'lire' then d.lire
                when 'creer' then d.creer
                when 'valider' then d.valider
                when 'modifier' then d.modifier <> 'non'
                when 'supprimer' then d.supprimer <> 'non'
                else false
              end)
  end
$$;

-- Contrôle complet, ligne par ligne. Pour « modifier » et « supprimer » avec la
-- portée « siennes », la ligne doit avoir été réalisée sur le terrain ou saisie
-- par l'utilisateur (p_auteur = auteur terrain, p_saisi_par = compte de saisie).
create function private.peut(
  p_marche uuid,
  p_type public.type_donnee,
  p_action text,
  p_auteur uuid default null,
  p_saisi_par uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _d public.droits;
  _portee public.portee_droit;
begin
  if p_marche is null then
    return false;
  end if;
  if private.est_admin() then
    return true;
  end if;
  _d := private.droit(p_marche, p_type);
  if _d.id is null then
    return false;
  end if;
  case p_action
    when 'lire' then return _d.lire;
    when 'creer' then return _d.creer;
    when 'valider' then return _d.valider;
    when 'modifier' then _portee := _d.modifier;
    when 'supprimer' then _portee := _d.supprimer;
    else return false;
  end case;
  return _portee = 'toutes'
      or (_portee = 'siennes' and auth.uid() in (p_auteur, p_saisi_par));
end
$$;

grant execute on function private.prochain_numero(uuid, text) to authenticated;
grant execute on function private.est_admin() to authenticated;
grant execute on function private.mes_marches() to authenticated;
grant execute on function private.marches_autorises(public.type_donnee, text) to authenticated;
grant execute on function private.peut(uuid, public.type_donnee, text, uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Création automatique du profil à la création du compte (Edge Function admin).
-- Métadonnées attendues : identifiant, nom_complet.
-- -----------------------------------------------------------------------------
create function private.creer_profil_utilisateur()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _identifiant text := lower(coalesce(
    new.raw_user_meta_data ->> 'identifiant',
    split_part(new.email, '@', 1)
  ));
begin
  insert into public.profils (id, identifiant, nom_complet)
  values (new.id, _identifiant, coalesce(new.raw_user_meta_data ->> 'nom_complet', _identifiant));
  return new;
end
$$;

create trigger creer_profil_apres_inscription
  after insert on auth.users
  for each row execute function private.creer_profil_utilisateur();

-- Un utilisateur ne peut changer que sa langue ; le reste est réservé à
-- l'administrateur (ou au serveur).
create function private.proteger_profil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.appel_systeme() or private.est_admin() then
    return new;
  end if;
  if (to_jsonb(new) - 'langue' - 'modifie_le') is distinct from (to_jsonb(old) - 'langue' - 'modifie_le') then
    raise exception 'Seule la langue du profil peut être modifiée par l''utilisateur'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger proteger_profil
  before update on public.profils
  for each row execute function private.proteger_profil();

-- -----------------------------------------------------------------------------
-- Application d'un modèle de rôle (administrateur). Crée l'affectation si besoin
-- et fusionne les droits (on garde toujours le plus large).
-- -----------------------------------------------------------------------------
create function public.appliquer_modele_role(p_profil uuid, p_marche uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.contexte_serveur() or private.est_admin()) then
    raise exception 'Réservé à l''administrateur' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.modeles_droits where role = p_role) then
    raise exception 'Rôle inconnu : %', p_role using errcode = 'invalid_parameter_value';
  end if;

  insert into public.affectations as a (profil_id, marche_id, roles)
  values (p_profil, p_marche, array[p_role])
  on conflict (profil_id, marche_id) do update
    set roles = (select array_agg(distinct r order by r) from unnest(a.roles || array[p_role]) r),
        actif = true;

  insert into public.droits as d (profil_id, marche_id, type_donnee, lire, creer, modifier, supprimer, valider)
  select p_profil, p_marche, m.type_donnee, m.lire, m.creer, m.modifier, m.supprimer, m.valider
    from public.modeles_droits m
   where m.role = p_role
  on conflict (profil_id, marche_id, type_donnee) do update
    set lire = d.lire or excluded.lire,
        creer = d.creer or excluded.creer,
        modifier = greatest(d.modifier, excluded.modifier),
        supprimer = greatest(d.supprimer, excluded.supprimer),
        valider = d.valider or excluded.valider;
end
$$;

grant execute on function public.appliquer_modele_role(uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Journal : trace de toute création, modification et suppression, par utilisateur.
-- Alimenté uniquement par déclencheur ; personne ne peut l'écrire ni le modifier.
-- -----------------------------------------------------------------------------
create table public.journal (
  id bigint generated always as identity primary key,
  marche_id uuid references public.marches (id),
  table_nom text not null,
  ligne_id text not null,
  operation text not null check (operation in (
    'creation', 'modification', 'suppression_logique', 'restauration', 'suppression'
  )),
  changements jsonb not null,      -- création : ligne complète ; modification : {colonne: [avant, après]}
  utilisateur_id uuid,             -- compte connecté (nul en contexte serveur)
  role_bd text not null default current_user,
  le timestamptz not null default now()
);
alter table public.journal enable row level security;
create index journal_marche_le_idx on public.journal (marche_id, le desc);
create index journal_ligne_idx on public.journal (table_nom, ligne_id);

create function private.journaliser()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _avant jsonb;
  _apres jsonb;
  _changements jsonb := '{}'::jsonb;
  _operation text;
  _cle text;
begin
  if tg_op = 'INSERT' then
    _apres := to_jsonb(new);
    _operation := 'creation';
    _changements := _apres;
  elsif tg_op = 'DELETE' then
    _avant := to_jsonb(old);
    _operation := 'suppression';
    _changements := _avant;
  else
    _avant := to_jsonb(old);
    _apres := to_jsonb(new);
    for _cle in select jsonb_object_keys(_apres) loop
      if _cle <> 'modifie_le' and (_apres -> _cle) is distinct from (_avant -> _cle) then
        _changements := _changements || jsonb_build_object(_cle, jsonb_build_array(_avant -> _cle, _apres -> _cle));
      end if;
    end loop;
    if _changements = '{}'::jsonb then
      return null;
    end if;
    _operation := case
      when _changements ? 'supprime_le' and (_apres ->> 'supprime_le') is not null then 'suppression_logique'
      when _changements ? 'supprime_le' then 'restauration'
      else 'modification'
    end;
  end if;

  insert into public.journal (marche_id, table_nom, ligne_id, operation, changements, utilisateur_id)
  values (
    private.uuid_ou_nul(coalesce(_apres, _avant) ->> case when tg_table_name = 'marches' then 'id' else 'marche_id' end),
    tg_table_name,
    coalesce(_apres, _avant) ->> 'id',
    _operation,
    _changements,
    auth.uid()
  );
  return null;
end
$$;

-- -----------------------------------------------------------------------------
-- Déclencheurs du noyau
-- -----------------------------------------------------------------------------
create trigger maj_modifie_le before update on public.marches
  for each row execute function private.maj_modifie_le();
create trigger maj_modifie_le before update on public.profils
  for each row execute function private.maj_modifie_le();
create trigger maj_modifie_le before update on public.affectations
  for each row execute function private.maj_modifie_le();
create trigger maj_modifie_le before update on public.droits
  for each row execute function private.maj_modifie_le();
create trigger figer_marche before update on public.affectations
  for each row execute function private.figer_marche();
create trigger figer_marche before update on public.droits
  for each row execute function private.figer_marche();

create trigger journaliser after insert or update or delete on public.marches
  for each row execute function private.journaliser();
create trigger journaliser after insert or update or delete on public.profils
  for each row execute function private.journaliser();
create trigger journaliser after insert or update or delete on public.affectations
  for each row execute function private.journaliser();
create trigger journaliser after insert or update or delete on public.droits
  for each row execute function private.journaliser();
