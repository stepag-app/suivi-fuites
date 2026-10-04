-- =============================================================================
-- Migration 1 / fichier 4 : fuites, réparations, réfections, pièces, ouvriers,
-- lignes de quantités (prix), photos ; numérotation, statuts automatiques,
-- verrouillage et proposition automatique des lignes de prix.
--
-- Identifiants uuid générés par la tablette (mode hors ligne) ; dates terrain
-- saisies sur place, dates techniques posées par le serveur.
-- Traçabilité : auteur_terrain_id (qui a fait le travail) ≠ saisi_par (compte
-- qui a saisi : chef, ou responsable à sa place) ; source_saisie.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fuites
-- -----------------------------------------------------------------------------
create table public.fuites (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  numero integer,                                   -- attribué par le serveur
  reference_srm text,                               -- tournée / référence NNN-NNN-NNN (non unique)
  origine public.origine_fuite not null default 'stepag',
  visibilite public.visibilite_fuite,
  ouvrage public.code_ouvrage,                      -- estimation à la détection
  methode_detection text,
  zone_id uuid,
  secteur_id uuid,
  equipe_id uuid,
  adresse text,
  position extensions.geography(Point, 4326),
  precision_gps_m numeric(7,2) check (precision_gps_m >= 0),
  date_detection timestamptz not null default now(),
  auteur_terrain_id uuid references public.profils (id),
  saisi_par uuid references public.profils (id),
  source_saisie public.source_saisie not null default 'tablette',
  statut public.statut_fuite not null default 'detectee',
  motif_sans_reparation_id uuid,
  -- Jalons SRM (le CPS les exige ; la SRM n'a pas de compte : saisis par STEPAG)
  date_communication_srm timestamptz,
  validation_srm_le timestamptz,
  validation_srm_par text,                          -- nom du représentant SRM
  avis_terrassement_srm_le timestamptz,
  fuite_liee_id uuid,                               -- re-détection d'une fuite existante
  observation text,
  verrouillee_le timestamptz,
  verrouillee_par uuid references public.profils (id),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  supprime_le timestamptz,
  supprime_par uuid references public.profils (id),
  unique (marche_id, numero),
  unique (id, marche_id),
  foreign key (zone_id, marche_id) references public.zones (id, marche_id),
  foreign key (secteur_id, marche_id) references public.secteurs (id, marche_id),
  foreign key (equipe_id, marche_id) references public.equipes (id, marche_id),
  foreign key (motif_sans_reparation_id, marche_id) references public.motifs (id, marche_id),
  foreign key (fuite_liee_id, marche_id) references public.fuites (id, marche_id),
  check (fuite_liee_id <> id),
  check (statut <> 'sans_reparation' or motif_sans_reparation_id is not null)
);
alter table public.fuites enable row level security;
create index fuites_marche_statut_idx on public.fuites (marche_id, statut) where supprime_le is null;
create index fuites_secteur_idx on public.fuites (secteur_id);
create index fuites_reference_idx on public.fuites (marche_id, reference_srm);
create index fuites_date_idx on public.fuites (marche_id, date_detection);
create index fuites_position_idx on public.fuites using gist (position);

-- -----------------------------------------------------------------------------
-- Réparations (une fuite peut en avoir plusieurs : reprise, réparation en deux temps)
-- -----------------------------------------------------------------------------
create table public.reparations (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  fuite_id uuid not null,
  resultat public.resultat_reparation not null default 'reparee',
  motif_id uuid,                                    -- obligatoire si non réparée
  realisee_le timestamptz not null default now(),
  equipe_id uuid,
  auteur_terrain_id uuid references public.profils (id),   -- chef d'équipe
  saisi_par uuid references public.profils (id),
  source_saisie public.source_saisie not null default 'tablette',
  -- Constat à l'ouverture
  ouvrage public.code_ouvrage,
  materiau public.code_materiau,
  diametre_mm integer check (diametre_mm > 0),      -- DE pour le PE, DN pour les conduites
  representant_srm text,                            -- présent à l'ouverture de la tranchée
  -- Travaux réalisés (cases à cocher sur la tablette)
  tuyau_repare boolean not null default false,
  robinet_pec_change boolean not null default false,
  collier_pec_change boolean not null default false,
  bouche_a_cle_mise_a_niveau boolean not null default false,
  element_remplace boolean not null default false,  -- justifie une fouille > 2 m
  longueur_pe_m numeric(5,2) check (longueur_pe_m >= 0),
  -- Terrassement
  fouille_longueur_m numeric(6,2) check (fouille_longueur_m >= 0),
  fouille_largeur_m numeric(6,2) check (fouille_largeur_m >= 0),
  fouille_profondeur_m numeric(6,2) check (fouille_profondeur_m >= 0),
  volume_m3 numeric(10,3) generated always as
    (round(fouille_longueur_m * fouille_largeur_m * fouille_profondeur_m, 3)) stored,
  emplacement public.emplacement_fouille,
  nature_revetement_id uuid,                        -- revêtement à refaire
  observation text,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  supprime_le timestamptz,
  supprime_par uuid references public.profils (id),
  unique (id, marche_id),
  foreign key (fuite_id, marche_id) references public.fuites (id, marche_id),
  foreign key (equipe_id, marche_id) references public.equipes (id, marche_id),
  foreign key (motif_id, marche_id) references public.motifs (id, marche_id),
  foreign key (nature_revetement_id, marche_id) references public.natures_refection (id, marche_id),
  check (resultat <> 'non_reparee' or motif_id is not null)
);
alter table public.reparations enable row level security;
create index reparations_fuite_idx on public.reparations (fuite_id);
create index reparations_marche_date_idx on public.reparations (marche_id, realisee_le);

-- Ouvriers (sans compte) ayant participé à une réparation : facultatif.
create table public.reparation_ouvriers (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  reparation_id uuid not null,
  ouvrier_id uuid not null,
  cree_le timestamptz not null default now(),
  unique (reparation_id, ouvrier_id),
  foreign key (reparation_id, marche_id) references public.reparations (id, marche_id) on delete cascade,
  foreign key (ouvrier_id, marche_id) references public.ouvriers (id, marche_id)
);
alter table public.reparation_ouvriers enable row level security;

-- Pièces posées (catalogue ou désignation libre).
create table public.reparation_pieces (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  reparation_id uuid not null,
  piece_id uuid,
  designation_libre text,
  quantite numeric(8,2) not null check (quantite > 0),
  saisi_par uuid references public.profils (id),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  supprime_le timestamptz,
  supprime_par uuid references public.profils (id),
  foreign key (reparation_id, marche_id) references public.reparations (id, marche_id),
  foreign key (piece_id, marche_id) references public.catalogue_pieces (id, marche_id),
  check (piece_id is not null or nullif(btrim(designation_libre), '') is not null)
);
alter table public.reparation_pieces enable row level security;
create index reparation_pieces_reparation_idx on public.reparation_pieces (reparation_id);
create index reparation_pieces_piece_idx on public.reparation_pieces (piece_id);

-- -----------------------------------------------------------------------------
-- Réfections (une ligne par revêtement refait ; longueur et largeur reprises
-- de la fouille si elles ne sont pas saisies). « non_faite » = clôture sans
-- réfection, avec motif obligatoire.
-- -----------------------------------------------------------------------------
create table public.refections (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  fuite_id uuid not null,
  reparation_id uuid,
  resultat public.resultat_refection not null default 'faite',
  motif_id uuid,
  realisee_le timestamptz not null default now(),
  nature_id uuid,
  longueur_m numeric(6,2) check (longueur_m >= 0),
  largeur_m numeric(6,2) check (largeur_m >= 0),
  surface_m2 numeric(10,3) generated always as (round(longueur_m * largeur_m, 3)) stored,
  equipe_id uuid,
  auteur_terrain_id uuid references public.profils (id),
  saisi_par uuid references public.profils (id),
  source_saisie public.source_saisie not null default 'tablette',
  observation text,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  supprime_le timestamptz,
  supprime_par uuid references public.profils (id),
  unique (id, marche_id),
  foreign key (fuite_id, marche_id) references public.fuites (id, marche_id),
  foreign key (reparation_id, marche_id) references public.reparations (id, marche_id),
  foreign key (nature_id, marche_id) references public.natures_refection (id, marche_id),
  foreign key (motif_id, marche_id) references public.motifs (id, marche_id),
  foreign key (equipe_id, marche_id) references public.equipes (id, marche_id),
  check (resultat <> 'non_faite' or motif_id is not null),
  check (resultat <> 'faite' or nature_id is not null)
);
alter table public.refections enable row level security;
create index refections_fuite_idx on public.refections (fuite_id);
create index refections_marche_date_idx on public.refections (marche_id, realisee_le);

-- -----------------------------------------------------------------------------
-- Lignes de quantités : une ligne = un prix, une quantité, une date d'exécution.
-- Proposées automatiquement (origine 'auto'), corrigeables (passent en 'manuel').
-- Base des attachements et des factures (migration 3).
-- -----------------------------------------------------------------------------
create table public.lignes_quantites (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  fuite_id uuid not null,
  reparation_id uuid,
  refection_id uuid,
  prix_id uuid not null,
  quantite numeric(12,3) not null check (quantite >= 0),
  date_execution date not null,
  origine public.origine_ligne not null default 'manuel',
  commentaire text,
  saisi_par uuid references public.profils (id),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  supprime_le timestamptz,
  supprime_par uuid references public.profils (id),
  foreign key (fuite_id, marche_id) references public.fuites (id, marche_id),
  foreign key (reparation_id, marche_id) references public.reparations (id, marche_id),
  foreign key (refection_id, marche_id) references public.refections (id, marche_id),
  foreign key (prix_id, marche_id) references public.prix (id, marche_id)
);
alter table public.lignes_quantites enable row level security;
create index lignes_quantites_fuite_idx on public.lignes_quantites (fuite_id);
create index lignes_quantites_marche_date_idx on public.lignes_quantites (marche_id, date_execution);
create index lignes_quantites_reparation_idx on public.lignes_quantites (reparation_id);
create index lignes_quantites_refection_idx on public.lignes_quantites (refection_id);

-- -----------------------------------------------------------------------------
-- Photos (fichier dans le stockage, chemin : <marche_id>/<fuite_id>/<photo_id>.jpg)
-- -----------------------------------------------------------------------------
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  fuite_id uuid not null,
  reparation_id uuid,
  refection_id uuid,
  type public.type_photo not null,
  stockage text not null default 'supabase' check (stockage in ('supabase', 'r2')),
  chemin text not null,
  position extensions.geography(Point, 4326),
  prise_le timestamptz not null default now(),
  largeur_px integer,
  hauteur_px integer,
  taille_octets integer,
  auteur_terrain_id uuid references public.profils (id),
  saisi_par uuid references public.profils (id),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  supprime_le timestamptz,
  supprime_par uuid references public.profils (id),
  unique (stockage, chemin),
  foreign key (fuite_id, marche_id) references public.fuites (id, marche_id),
  foreign key (reparation_id, marche_id) references public.reparations (id, marche_id),
  foreign key (refection_id, marche_id) references public.refections (id, marche_id)
);
alter table public.photos enable row level security;
create index photos_fuite_idx on public.photos (fuite_id);

-- =============================================================================
-- Déclencheurs
-- =============================================================================

-- Avant insertion : auteur de saisie = compte connecté, numérotation.
create function private.avant_insertion_saisie()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.appel_systeme() then
    new.saisi_par := auth.uid();
    new.supprime_le := null;
    new.supprime_par := null;
  end if;
  if tg_table_name in ('fuites', 'reparations', 'refections', 'photos') then
    new.auteur_terrain_id := coalesce(new.auteur_terrain_id, new.saisi_par);
  end if;
  if tg_table_name = 'fuites' then
    if not private.appel_systeme() then
      new.numero := null;
      new.verrouillee_le := null;
      new.verrouillee_par := null;
    end if;
    if new.numero is null then
      new.numero := private.prochain_numero(new.marche_id, 'fuite');
    end if;
  end if;
  return new;
end
$$;

-- Avant modification : suppression logique (droit « supprimer »), verrouillage
-- (droit « valider »), champs protégés.
create function private.avant_modification_saisie()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _type public.type_donnee := case tg_table_name
    when 'fuites' then 'fuites'
    when 'photos' then 'photos'
    when 'lignes_quantites' then 'quantites'
    else 'interventions'
  end::public.type_donnee;
  _auteur uuid := case when tg_table_name in ('fuites', 'reparations', 'refections', 'photos')
                       then (to_jsonb(old) ->> 'auteur_terrain_id')::uuid end;
  _verrou timestamptz;
  _donnees_modifiees boolean;
begin
  if private.appel_systeme() then
    return new;
  end if;

  -- Champs que l'utilisateur ne change jamais directement
  new.saisi_par := old.saisi_par;
  new.cree_le := old.cree_le;
  if tg_table_name = 'fuites' then
    new.numero := old.numero;
  end if;

  -- Suppression logique et restauration
  if new.supprime_le is distinct from old.supprime_le then
    if not private.peut(old.marche_id, _type, 'supprimer', _auteur, old.saisi_par) then
      raise exception 'Suppression non autorisée' using errcode = 'insufficient_privilege';
    end if;
    new.supprime_par := case when new.supprime_le is null then null else auth.uid() end;
  else
    new.supprime_par := old.supprime_par;
  end if;

  -- Toute modification autre que suppression ou verrouillage demande le droit « modifier »
  _donnees_modifiees := (to_jsonb(new) - 'supprime_le' - 'supprime_par' - 'modifie_le'
                                       - 'verrouillee_le' - 'verrouillee_par')
                        is distinct from
                        (to_jsonb(old) - 'supprime_le' - 'supprime_par' - 'modifie_le'
                                       - 'verrouillee_le' - 'verrouillee_par');
  if _donnees_modifiees
     and not private.peut(old.marche_id, _type, 'modifier', _auteur, old.saisi_par) then
    raise exception 'Modification non autorisée' using errcode = 'insufficient_privilege';
  end if;

  -- Verrouillage d'une fuite validée
  if tg_table_name = 'fuites' then
    if new.verrouillee_le is distinct from old.verrouillee_le then
      if not private.peut(old.marche_id, 'fuites', 'valider') then
        raise exception 'Verrouillage réservé au responsable' using errcode = 'insufficient_privilege';
      end if;
      new.verrouillee_par := case when new.verrouillee_le is null then null else auth.uid() end;
    else
      new.verrouillee_par := old.verrouillee_par;
    end if;
    _verrou := old.verrouillee_le;
    if _verrou is not null and new.verrouillee_le is not null
       and not private.peut(old.marche_id, 'fuites', 'valider') then
      raise exception 'Fuite verrouillée : modification réservée au responsable'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end
$$;

-- Les données rattachées à une fuite verrouillée ne changent plus (sauf responsable).
create function private.controler_verrou_fuite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _ligne jsonb := to_jsonb(coalesce(new, old));
  _type public.type_donnee := case tg_table_name
    when 'photos' then 'photos'
    when 'lignes_quantites' then 'quantites'
    else 'interventions'
  end::public.type_donnee;
  _fuite uuid;
begin
  if private.appel_systeme() then
    return coalesce(new, old);
  end if;
  _fuite := case
    when tg_table_name in ('reparation_ouvriers', 'reparation_pieces') then
      (select r.fuite_id from public.reparations r where r.id = (_ligne ->> 'reparation_id')::uuid)
    else (_ligne ->> 'fuite_id')::uuid
  end;
  if exists (select 1 from public.fuites f where f.id = _fuite and f.verrouillee_le is not null)
     and not private.peut((_ligne ->> 'marche_id')::uuid, _type, 'valider') then
    raise exception 'Fuite verrouillée : modification réservée au responsable'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end
$$;

-- Réfection : longueur et largeur reprises de la fouille si non saisies.
create function private.completer_refection()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _rep public.reparations;
begin
  if new.reparation_id is null then
    select * into _rep from public.reparations r
     where r.fuite_id = new.fuite_id and r.supprime_le is null
     order by r.realisee_le desc limit 1;
    new.reparation_id := _rep.id;
  else
    select * into _rep from public.reparations r where r.id = new.reparation_id;
  end if;
  new.longueur_m := coalesce(new.longueur_m, _rep.fouille_longueur_m);
  new.largeur_m := coalesce(new.largeur_m, _rep.fouille_largeur_m);
  new.nature_id := coalesce(new.nature_id, case when new.resultat = 'faite' then _rep.nature_revetement_id end);
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Statut automatique : avance seulement (jamais de retour en arrière automatique).
-- Les changements manuels restent libres et sont journalisés.
-- -----------------------------------------------------------------------------
create function private.avancer_statut_fuite(p_fuite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _f public.fuites;
  _rep public.reparations;
  _sans_refection boolean;
  _refection_close boolean;
  _nouveau public.statut_fuite;
  _motif uuid;
begin
  select * into _f from public.fuites where id = p_fuite;
  if _f.id is null or _f.supprime_le is not null or _f.statut in ('achevee', 'sans_reparation') then
    return;
  end if;

  select * into _rep from public.reparations r
   where r.fuite_id = p_fuite and r.supprime_le is null
   order by (r.resultat = 'reparee') desc, r.realisee_le desc
   limit 1;

  _refection_close := exists (
    select 1 from public.refections rf
     where rf.fuite_id = p_fuite and rf.supprime_le is null
  );

  if _rep.id is null then
    return;
  elsif _rep.resultat = 'non_reparee' then
    _nouveau := 'sans_reparation';
    _motif := _rep.motif_id;
  elsif _rep.resultat = 'en_cours' then
    _nouveau := 'en_reparation';
  else
    select not n.necessite_refection into _sans_refection
      from public.natures_refection n where n.id = _rep.nature_revetement_id;
    _nouveau := case
      when _refection_close or coalesce(_sans_refection, false) or _rep.emplacement = 'terrain_naturel'
        then 'achevee'
      else 'reparee'
    end;
  end if;

  -- Ordre d'avancement : detectee < en_reparation < reparee < achevee / sans_reparation
  if array_position(array['detectee', 'en_reparation', 'reparee', 'achevee', 'sans_reparation']::public.statut_fuite[], _nouveau)
     > array_position(array['detectee', 'en_reparation', 'reparee', 'achevee', 'sans_reparation']::public.statut_fuite[], _f.statut) then
    update public.fuites
       set statut = _nouveau,
           motif_sans_reparation_id = coalesce(_motif, motif_sans_reparation_id)
     where id = p_fuite;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Proposition automatique des lignes de quantités (règle R-DER-007).
-- Régénère les lignes « auto » d'une réparation ou d'une réfection ; une ligne
-- corrigée à la main (origine « manuel ») n'est jamais écrasée ni doublée.
-- -----------------------------------------------------------------------------
create function private.prix_famille(
  p_marche uuid,
  p_famille public.famille_prix,
  p_materiau text default null,
  p_diametre integer default null
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.prix p
   where p.marche_id = p_marche
     and p.famille = p_famille
     and p.actif
     and not p.hors_bordereau
     and (p.materiaux is null or p_materiau = any (p.materiaux))
     and (p.diametre_min_mm is null or p_diametre >= p.diametre_min_mm)
     and (p.diametre_max_mm is null or p_diametre <= p.diametre_max_mm)
   order by p.ordre, p.numero
   limit 1
$$;

create function private.ajouter_ligne_auto(
  p_marche uuid,
  p_fuite uuid,
  p_reparation uuid,
  p_refection uuid,
  p_prix uuid,
  p_quantite numeric,
  p_date date,
  p_unitaire boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _une_unite boolean;
begin
  if p_prix is null or coalesce(p_quantite, 0) <= 0 then
    return;
  end if;
  -- Déjà couvert par une ligne manuelle de la même source (même supprimée : décision du responsable)
  if exists (
    select 1 from public.lignes_quantites l
     where l.prix_id = p_prix and l.origine = 'manuel'
       and (l.reparation_id = p_reparation or l.refection_id = p_refection)
  ) then
    return;
  end if;
  -- Au plus une unité de chaque prix unitaire par fuite (paramètre du marché)
  select m.une_unite_par_prix_et_fuite into _une_unite from public.marches m where m.id = p_marche;
  if p_unitaire and _une_unite and exists (
    select 1 from public.lignes_quantites l
     where l.fuite_id = p_fuite and l.prix_id = p_prix and l.supprime_le is null
  ) then
    return;
  end if;
  insert into public.lignes_quantites
    (marche_id, fuite_id, reparation_id, refection_id, prix_id, quantite, date_execution, origine)
  values
    (p_marche, p_fuite, p_reparation, p_refection, p_prix, p_quantite, p_date, 'auto');
end
$$;

create function private.generer_lignes_reparation(p_reparation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _r public.reparations;
  _date date;
  _terrassement_paye boolean;
begin
  select * into _r from public.reparations where id = p_reparation;
  delete from public.lignes_quantites where reparation_id = p_reparation and origine = 'auto';
  if _r.id is null or _r.supprime_le is not null or _r.resultat = 'en_cours' then
    return;
  end if;
  _date := (_r.realisee_le at time zone 'Africa/Casablanca')::date;

  -- Terrassement : payé pour une réparation, ou pour une fouille sans fuite
  -- si le motif le prévoit (sondage négatif).
  select coalesce(m.terrassement_paye, false) into _terrassement_paye
    from public.motifs m where m.id = _r.motif_id;
  if _r.resultat = 'reparee' or _terrassement_paye then
    perform private.ajouter_ligne_auto(_r.marche_id, _r.fuite_id, _r.id, null,
      private.prix_famille(_r.marche_id, 'terrassement'), _r.volume_m3, _date, false);
  end if;

  if _r.resultat <> 'reparee' then
    return;
  end if;

  if _r.tuyau_repare then
    perform private.ajouter_ligne_auto(_r.marche_id, _r.fuite_id, _r.id, null,
      private.prix_famille(_r.marche_id, 'reparation_tuyau', _r.materiau, _r.diametre_mm), 1, _date, true);
  end if;
  if _r.robinet_pec_change then
    perform private.ajouter_ligne_auto(_r.marche_id, _r.fuite_id, _r.id, null,
      private.prix_famille(_r.marche_id, 'robinet_pec'), 1, _date, true);
  end if;
  if _r.collier_pec_change then
    perform private.ajouter_ligne_auto(_r.marche_id, _r.fuite_id, _r.id, null,
      private.prix_famille(_r.marche_id, 'collier_pec'), 1, _date, true);
  end if;
  -- Bouche à clé : déjà comprise dans le changement de robinet ou de collier PEC
  if _r.bouche_a_cle_mise_a_niveau and not (_r.robinet_pec_change or _r.collier_pec_change) then
    perform private.ajouter_ligne_auto(_r.marche_id, _r.fuite_id, _r.id, null,
      private.prix_famille(_r.marche_id, 'bouche_a_cle'), 1, _date, true);
  end if;
end
$$;

create function private.generer_lignes_refection(p_refection uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _rf public.refections;
  _prix uuid;
begin
  select * into _rf from public.refections where id = p_refection;
  delete from public.lignes_quantites where refection_id = p_refection and origine = 'auto';
  if _rf.id is null or _rf.supprime_le is not null or _rf.resultat <> 'faite' then
    return;
  end if;
  select n.prix_id into _prix from public.natures_refection n where n.id = _rf.nature_id;
  perform private.ajouter_ligne_auto(_rf.marche_id, _rf.fuite_id, null, _rf.id, _prix, _rf.surface_m2,
    (_rf.realisee_le at time zone 'Africa/Casablanca')::date, false);
end
$$;

create function private.apres_reparation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.generer_lignes_reparation(new.id);
  perform private.avancer_statut_fuite(new.fuite_id);
  return null;
end
$$;

create function private.apres_refection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.generer_lignes_refection(new.id);
  perform private.avancer_statut_fuite(new.fuite_id);
  return null;
end
$$;

-- Toute modification d'une ligne par un utilisateur en fait une ligne manuelle.
create function private.marquer_ligne_manuelle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.appel_systeme() then
    new.origine := 'manuel';
  end if;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Pose des déclencheurs
-- -----------------------------------------------------------------------------
do $$
declare
  _t text;
begin
  foreach _t in array array['fuites', 'reparations', 'refections', 'reparation_pieces', 'lignes_quantites', 'photos'] loop
    execute format('create trigger a_avant_insertion before insert on public.%I
                    for each row execute function private.avant_insertion_saisie()', _t);
    execute format('create trigger b_avant_modification before update on public.%I
                    for each row execute function private.avant_modification_saisie()', _t);
    execute format('create trigger maj_modifie_le before update on public.%I
                    for each row execute function private.maj_modifie_le()', _t);
    execute format('create trigger figer_marche before update on public.%I
                    for each row execute function private.figer_marche()', _t);
    execute format('create trigger journaliser after insert or update or delete on public.%I
                    for each row execute function private.journaliser()', _t);
  end loop;

  foreach _t in array array['reparations', 'refections', 'reparation_pieces', 'reparation_ouvriers', 'lignes_quantites', 'photos'] loop
    execute format('create trigger c_controler_verrou before insert or update or delete on public.%I
                    for each row execute function private.controler_verrou_fuite()', _t);
  end loop;
end
$$;

create trigger figer_marche before update on public.reparation_ouvriers
  for each row execute function private.figer_marche();
create trigger journaliser after insert or update or delete on public.reparation_ouvriers
  for each row execute function private.journaliser();

create trigger d_completer_refection before insert or update on public.refections
  for each row execute function private.completer_refection();

create trigger e_marquer_ligne_manuelle before update on public.lignes_quantites
  for each row execute function private.marquer_ligne_manuelle();

create trigger apres_reparation after insert or update on public.reparations
  for each row execute function private.apres_reparation();
create trigger apres_refection after insert or update on public.refections
  for each row execute function private.apres_refection();
