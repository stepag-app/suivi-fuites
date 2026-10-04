-- =============================================================================
-- Migration 1 / fichier 3 : paramètres propres à chaque marché
-- Zones, secteurs, phases, équipes, ouvriers, prix (bordereau et hors bordereau),
-- natures de réfection, motifs, catalogue de pièces, ordres de service.
-- Chaque table porte marche_id ; les clés étrangères composites (id, marche_id)
-- empêchent de rattacher une donnée à un paramètre d'un autre marché.
-- =============================================================================

create domain public.code_materiau as text check (value in (
  'polyethylene', 'amiante_ciment', 'pvc', 'fonte_ductile', 'fonte_grise',
  'acier_galvanise', 'ppr', 'autre'
));

create domain public.code_ouvrage as text check (value in (
  'branchement', 'conduite', 'piece_speciale', 'bouche_incendie', 'vanne',
  'compteur', 'branchement_clandestin', 'autre'
));

-- -----------------------------------------------------------------------------
-- Zones et secteurs (géométries facultatives, importées plus tard)
-- -----------------------------------------------------------------------------
create table public.zones (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  numero integer not null,
  code text not null,
  libelle text not null,
  lineaire_m numeric(12,2) check (lineaire_m >= 0),
  q_exige_m3h numeric(8,2) check (q_exige_m3h >= 0),     -- débit nocturne minimum exigé
  geom extensions.geometry(MultiPolygon, 4326),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, code),
  unique (marche_id, numero),
  unique (id, marche_id)
);
alter table public.zones enable row level security;
create index zones_geom_idx on public.zones using gist (geom);

create table public.secteurs (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  zone_id uuid not null,
  code text not null,
  libelle text not null,
  lineaire_m numeric(12,2) check (lineaire_m >= 0),
  statut_balayage public.statut_balayage not null default 'a_balayer',
  geom extensions.geometry(MultiPolygon, 4326),
  ordre integer not null default 0,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, code),
  unique (id, marche_id),
  foreign key (zone_id, marche_id) references public.zones (id, marche_id)
);
alter table public.secteurs enable row level security;
create index secteurs_zone_idx on public.secteurs (zone_id);
create index secteurs_geom_idx on public.secteurs using gist (geom);

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  code text not null,
  libelle text not null,
  ordre integer not null default 0,
  date_debut date,
  date_fin date,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, code),
  check (date_fin is null or date_debut is null or date_fin >= date_debut)
);
alter table public.phases enable row level security;

-- -----------------------------------------------------------------------------
-- Équipes et ouvriers sans compte
-- -----------------------------------------------------------------------------
create table public.equipes (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  type public.type_equipe not null,
  numero integer not null check (numero > 0),
  libelle text not null,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, type, numero),
  unique (id, marche_id)
);
alter table public.equipes enable row level security;

create table public.ouvriers (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  nom_complet text not null,
  telephone text,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (id, marche_id)
);
alter table public.ouvriers enable row level security;

-- -----------------------------------------------------------------------------
-- Prix : bordereau du marché et articles hors bordereau.
-- famille + matériaux + bornes de diamètre servent à proposer les lignes de
-- quantités à partir des mesures de terrain (modifiables ensuite).
-- -----------------------------------------------------------------------------
create table public.prix (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  numero text not null,                     -- « 1 » à « 13 », « HB-01 »...
  ordre integer not null default 0,
  designation text not null,
  unite text not null check (unite in ('ml', 'm2', 'm3', 'u', 'forfait')),
  quantite_marche numeric(14,3) check (quantite_marche >= 0),
  pu_ht numeric(12,2) check (pu_ht >= 0),   -- prix du bordereau, avant majoration
  famille public.famille_prix not null default 'autre',
  materiaux text[],                         -- codes de public.code_materiau
  diametre_min_mm integer check (diametre_min_mm >= 0),
  diametre_max_mm integer check (diametre_max_mm >= 0),
  hors_bordereau boolean not null default false,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, numero),
  unique (id, marche_id),
  check (diametre_max_mm is null or diametre_min_mm is null or diametre_max_mm >= diametre_min_mm),
  check (materiaux is null or materiaux <@ array[
    'polyethylene', 'amiante_ciment', 'pvc', 'fonte_ductile', 'fonte_grise',
    'acier_galvanise', 'ppr', 'autre']::text[])
);
alter table public.prix enable row level security;

-- -----------------------------------------------------------------------------
-- Natures de revêtement / réfection, avec leur prix (nul = non payée).
-- -----------------------------------------------------------------------------
create table public.natures_refection (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  code text not null,
  libelle_fr text not null,
  libelle_ar text,
  symbole text,                              -- B, M, L, C, AC, TN (attachement)
  emplacement public.emplacement_fouille not null,
  prix_id uuid,
  necessite_refection boolean not null default true,   -- false : terrain naturel
  ordre integer not null default 0,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, code),
  unique (id, marche_id),
  foreign key (prix_id, marche_id) references public.prix (id, marche_id)
);
alter table public.natures_refection enable row level security;

-- Motifs de fuite non réparée et de clôture sans réfection (listes FR / AR).
create table public.motifs (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  categorie public.categorie_motif not null,
  code text not null,
  libelle_fr text not null,
  libelle_ar text,
  terrassement_paye boolean not null default false,    -- ex. sondage négatif
  ordre integer not null default 0,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, categorie, code),
  unique (id, marche_id)
);
alter table public.motifs enable row level security;

-- Catalogue des pièces (justification et suivi des quantités posées ; pas de montant).
create table public.catalogue_pieces (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  designation text not null,
  famille text,
  unite text not null default 'u' check (unite in ('u', 'ml', 'm2', 'm3', 'kg')),
  prix_suggere_id uuid,
  numero_source integer,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, designation),
  unique (id, marche_id),
  foreign key (prix_suggere_id, marche_id) references public.prix (id, marche_id)
);
alter table public.catalogue_pieces enable row level security;

create table public.ordres_service (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  numero text not null,
  date_os date not null,
  objet text not null,
  date_effet date,
  observation text,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, numero)
);
alter table public.ordres_service enable row level security;

-- -----------------------------------------------------------------------------
-- Déclencheurs communs
-- -----------------------------------------------------------------------------
do $$
declare
  _t text;
begin
  foreach _t in array array[
    'zones', 'secteurs', 'phases', 'equipes', 'ouvriers', 'prix',
    'natures_refection', 'motifs', 'catalogue_pieces', 'ordres_service'
  ] loop
    execute format('create trigger maj_modifie_le before update on public.%I
                    for each row execute function private.maj_modifie_le()', _t);
    execute format('create trigger figer_marche before update on public.%I
                    for each row execute function private.figer_marche()', _t);
    execute format('create trigger journaliser after insert or update or delete on public.%I
                    for each row execute function private.journaliser()', _t);
  end loop;
end
$$;
