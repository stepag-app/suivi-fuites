-- =============================================================================
-- Étape A / fichier 2 : application « standard » (paramétrable par marché).
--
--  * Fiche du marché : titulaire, maître d'ouvrage, délai (OS de commencement,
--    durée, date de fin), montant, devise ; modifiable par le droit « parametres »
--    (code et activation restent réservés à l'administrateur).
--  * Ordres de service typés ; arrêts et reprises de travaux ; avenants ;
--    vue du délai (date de fin prolongée des arrêts et des avenants).
--  * Articles du bordereau modifiables par versions (avenant ou motif) :
--    jamais de modification directe, historique complet, journal.
--  * Journal des événements particuliers (catégories par marché, pièces jointes).
--  * Règles d'attachement par marché (utilisées par l'étape B).
--  * Libellés et contrôles propres au client (référence, format, jalons) :
--    plus rien de figé pour le marché 4500004453.
--  * Valeurs par défaut posées à la création de chaque nouveau marché.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ordres de service : nature, clé composite pour les rattachements
-- -----------------------------------------------------------------------------
alter table public.ordres_service
  add column nature text not null default 'autre'
    check (nature in ('notification', 'commencement', 'arret', 'reprise', 'agent_suivi', 'avenant', 'autre')),
  add constraint ordres_service_id_marche_key unique (id, marche_id);

-- -----------------------------------------------------------------------------
-- 2. Fiche du marché
-- -----------------------------------------------------------------------------
alter table public.marches
  -- Maître d'ouvrage (son nom est déjà dans « client »)
  add column client_sigle text,                    -- ex. SRM : utilisé dans les libellés
  add column client_nom_ar text,
  add column client_direction text,
  add column client_service text,
  add column client_adresse text,
  add column client_ice text,
  add column client_telephone text,
  add column client_email text,
  add column client_representant text,
  -- Société titulaire
  add column titulaire_nom text,
  add column titulaire_nom_ar text,
  add column titulaire_forme_juridique text,
  add column titulaire_capital text,
  add column titulaire_adresse text,
  add column titulaire_ice text,
  add column titulaire_if text,
  add column titulaire_rc text,
  add column titulaire_patente text,               -- taxe professionnelle
  add column titulaire_cnss text,
  add column titulaire_telephone text,
  add column titulaire_email text,
  add column titulaire_representant text,
  add column titulaire_qualite_representant text,
  -- Délai d'exécution et montant
  add column os_commencement_id uuid,
  add column duree_jours integer check (duree_jours > 0),
  add column date_fin date,                        -- facultative : fin du délai initial si elle diffère du calcul
  add column montant_ttc numeric(14,2) check (montant_ttc >= 0),
  add column devise text not null default 'DH',
  -- Libellés et contrôles propres au client
  add column libelle_reference text not null default 'Référence client',
  add column masque_reference text check (masque_reference is null or masque_reference like '%9%'),
  add column jalons_client boolean not null default false,  -- communication, validation, avis avant terrassement
  add constraint marches_os_commencement_fkey foreign key (os_commencement_id, id)
    references public.ordres_service (id, marche_id),
  add constraint marches_une_seule_duree check (duree_mois is null or duree_jours is null);

-- Le responsable (droit « parametres / modifier ») tient la fiche de son marché ;
-- le code et l'activation restent à l'administrateur.
drop policy marches_modification on public.marches;
create policy marches_modification on public.marches for update to authenticated
  using (
    (select private.est_admin())
    or id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[])
  )
  with check (
    (select private.est_admin())
    or id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[])
  );

create function private.proteger_marche()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.appel_systeme() or private.est_admin() then
    return new;
  end if;
  if new.code is distinct from old.code or new.actif is distinct from old.actif then
    raise exception 'Le code et l''activation d''un marché sont réservés à l''administrateur'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger proteger_marche before update on public.marches
  for each row execute function private.proteger_marche();

-- -----------------------------------------------------------------------------
-- 3. Avenants
-- -----------------------------------------------------------------------------
create table public.avenants (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  numero text not null check (btrim(numero) <> ''),
  date_avenant date not null,
  objet text not null check (btrim(objet) <> ''),
  prolongation_jours integer not null default 0 check (prolongation_jours >= 0),
  observation text,
  actif boolean not null default true,              -- false = saisie annulée
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, numero),
  unique (id, marche_id)
);
alter table public.avenants enable row level security;

-- -----------------------------------------------------------------------------
-- 4. Versions des articles du bordereau
-- Un article du bordereau ne se modifie jamais directement : on enregistre une
-- nouvelle version (avenant et / ou motif), qui s'applique à l'article. Les
-- articles hors bordereau restent modifiables directement ; chaque changement
-- crée aussi une version. Version 1 = état initial.
-- -----------------------------------------------------------------------------
alter table public.prix
  add column avenant_id uuid,                       -- avenant ayant créé l'article
  add constraint prix_avenant_fkey foreign key (avenant_id, marche_id)
    references public.avenants (id, marche_id);

create table public.prix_versions (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  prix_id uuid not null,
  version integer not null check (version > 0),
  designation text not null,
  unite text not null check (unite in ('ml', 'm2', 'm3', 'u', 'forfait')),
  quantite_marche numeric(14,3) check (quantite_marche >= 0),
  pu_ht numeric(12,2) check (pu_ht >= 0),
  avenant_id uuid,
  motif text not null check (btrim(motif) <> ''),
  date_effet date not null default (now() at time zone 'Africa/Casablanca')::date,
  saisi_par uuid references public.profils (id),
  cree_le timestamptz not null default now(),
  unique (prix_id, version),
  foreign key (prix_id, marche_id) references public.prix (id, marche_id),
  foreign key (avenant_id, marche_id) references public.avenants (id, marche_id)
);
alter table public.prix_versions enable row level security;
create index prix_versions_prix_idx on public.prix_versions (prix_id, version desc);

-- Avant insertion : numéro de version, valeurs non fournies reprises de l'article.
create function private.preparer_version_prix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _p public.prix;
begin
  select * into _p from public.prix where id = new.prix_id for update;
  if _p.id is null then
    raise exception 'Article introuvable' using errcode = 'foreign_key_violation';
  end if;
  new.marche_id := _p.marche_id;
  new.version := coalesce((select max(v.version) from public.prix_versions v where v.prix_id = new.prix_id), 0) + 1;
  new.saisi_par := auth.uid();
  new.cree_le := now();
  new.designation := coalesce(nullif(btrim(new.designation), ''), _p.designation);
  new.unite := coalesce(new.unite, _p.unite);
  new.quantite_marche := coalesce(new.quantite_marche, _p.quantite_marche);
  new.pu_ht := coalesce(new.pu_ht, _p.pu_ht);
  if new.version > 1
     and (new.designation, new.unite, new.quantite_marche, new.pu_ht)
         is not distinct from (_p.designation, _p.unite, _p.quantite_marche, _p.pu_ht)
     and not exists (select 1 from public.prix_versions v where v.prix_id = new.prix_id and v.version = new.version - 1
                       and (v.designation, v.unite, v.quantite_marche, v.pu_ht)
                           is distinct from (_p.designation, _p.unite, _p.quantite_marche, _p.pu_ht)) then
    raise exception 'Aucun changement par rapport à la version en vigueur' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- Après insertion : la version s'applique à l'article (contexte système).
create function private.appliquer_version_prix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.prix p
     set designation = new.designation,
         unite = new.unite,
         quantite_marche = new.quantite_marche,
         pu_ht = new.pu_ht
   where p.id = new.prix_id
     and (p.designation, p.unite, p.quantite_marche, p.pu_ht)
         is distinct from (new.designation, new.unite, new.quantite_marche, new.pu_ht);
  return null;
end
$$;

-- Version 1 à la création de l'article.
create function private.version_initiale_prix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.prix_versions (prix_id, avenant_id, motif)
  values (new.id, new.avenant_id,
          case when new.avenant_id is not null then 'Article ajouté par avenant'
               else 'Création de l''article' end);
  return null;
end
$$;

-- Garde : pas de modification directe d'un article du bordereau.
create function private.proteger_prix()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.appel_systeme() then
    return new;
  end if;
  if new.hors_bordereau is distinct from old.hors_bordereau then
    raise exception 'Un article ne passe pas du bordereau au hors bordereau (ni l''inverse)'
      using errcode = 'check_violation';
  end if;
  if not old.hors_bordereau
     and (new.designation, new.unite, new.quantite_marche, new.pu_ht)
         is distinct from (old.designation, old.unite, old.quantite_marche, old.pu_ht) then
    raise exception 'Article du bordereau : enregistrez une nouvelle version (avenant ou motif)'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

-- Article hors bordereau modifié directement : la version garde la trace.
-- Fonction à droits de l'appelant : elle ne réagit qu'aux modifications faites
-- par un utilisateur (pas à celles appliquées par une version).
create function private.versionner_prix_direct()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.appel_systeme()
     and (new.designation, new.unite, new.quantite_marche, new.pu_ht)
         is distinct from (old.designation, old.unite, old.quantite_marche, old.pu_ht) then
    insert into public.prix_versions (prix_id, motif)
    values (new.id, 'Modification de l''article hors bordereau');
  end if;
  return null;
end
$$;

create trigger proteger_prix before update on public.prix
  for each row execute function private.proteger_prix();
create trigger version_initiale after insert on public.prix
  for each row execute function private.version_initiale_prix();
create trigger versionner_modification_directe after update on public.prix
  for each row execute function private.versionner_prix_direct();
create trigger a_preparer before insert on public.prix_versions
  for each row execute function private.preparer_version_prix();
create trigger appliquer after insert on public.prix_versions
  for each row execute function private.appliquer_version_prix();

-- Versions initiales des articles existants.
insert into public.prix_versions (prix_id, motif, date_effet)
select p.id,
       case when p.hors_bordereau then 'Article hors bordereau existant' else 'Bordereau initial' end,
       coalesce(m.date_commencement, (now() at time zone 'Africa/Casablanca')::date)
  from public.prix p
  join public.marches m on m.id = p.marche_id
 order by p.marche_id, p.ordre, p.numero;

-- -----------------------------------------------------------------------------
-- 5. Arrêts et reprises de travaux (ordres de service d'arrêt et de reprise)
-- -----------------------------------------------------------------------------
create table public.arrets_travaux (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  date_arret date not null,
  os_arret_id uuid,
  motif text not null check (btrim(motif) <> ''),
  date_reprise date,                                -- nulle : arrêt en cours
  os_reprise_id uuid,
  observation text,
  actif boolean not null default true,              -- false = saisie annulée
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (id, marche_id),
  foreign key (os_arret_id, marche_id) references public.ordres_service (id, marche_id),
  foreign key (os_reprise_id, marche_id) references public.ordres_service (id, marche_id),
  check (date_reprise is null or date_reprise >= date_arret)
);
alter table public.arrets_travaux enable row level security;
create index arrets_travaux_marche_idx on public.arrets_travaux (marche_id, date_arret);

create function private.controler_arret()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.actif and exists (
    select 1 from public.arrets_travaux a
     where a.marche_id = new.marche_id and a.id <> new.id and a.actif
       and daterange(a.date_arret, a.date_reprise, '[)') && daterange(new.date_arret, new.date_reprise, '[)')
  ) then
    raise exception 'Cet arrêt chevauche un autre arrêt du marché' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger controler_arret before insert or update on public.arrets_travaux
  for each row execute function private.controler_arret();

-- -----------------------------------------------------------------------------
-- 6. Délai d'exécution : fin calculée (veille du jour anniversaire, comme les
-- phases du marché 4500004453), sauf date de fin saisie ; prolongée des jours
-- d'arrêt (arrêt en cours compté jusqu'à aujourd'hui) et des avenants.
-- -----------------------------------------------------------------------------
create view public.v_delai_marche with (security_invoker = true) as
with jour as (
  select (now() at time zone 'Africa/Casablanca')::date as aujourd_hui
),
arrets as (
  select a.marche_id,
         sum(coalesce(a.date_reprise, greatest(j.aujourd_hui, a.date_arret)) - a.date_arret)::integer as jours,
         bool_or(a.date_reprise is null and a.date_arret <= j.aujourd_hui) as en_cours
    from public.arrets_travaux a, jour j
   where a.actif
   group by a.marche_id
),
prolongations as (
  select v.marche_id, sum(v.prolongation_jours)::integer as jours
    from public.avenants v
   where v.actif
   group by v.marche_id
)
select
  m.id as marche_id,
  m.os_commencement_id,
  m.date_commencement,
  m.duree_mois,
  m.duree_jours,
  calc.date_fin_calculee,
  m.date_fin as date_fin_saisie,
  coalesce(m.date_fin, calc.date_fin_calculee) as date_fin_initiale,
  coalesce(ar.jours, 0) as jours_arret,
  coalesce(pr.jours, 0) as jours_prolongation,
  coalesce(m.date_fin, calc.date_fin_calculee) + coalesce(ar.jours, 0) + coalesce(pr.jours, 0) as date_fin_prevue,
  coalesce(ar.en_cours, false) as arret_en_cours,
  coalesce(m.date_fin, calc.date_fin_calculee) + coalesce(ar.jours, 0) + coalesce(pr.jours, 0) - j.aujourd_hui
    as jours_restants
from public.marches m
cross join jour j
left join lateral (
  select case
    when m.date_commencement is null then null::date
    when m.duree_jours is not null then m.date_commencement + m.duree_jours - 1
    when m.duree_mois is not null then (m.date_commencement + make_interval(months => m.duree_mois))::date - 1
  end as date_fin_calculee
) calc on true
left join arrets ar on ar.marche_id = m.id
left join prolongations pr on pr.marche_id = m.id;

-- -----------------------------------------------------------------------------
-- 7. Journal des événements particuliers
-- -----------------------------------------------------------------------------
create table public.categories_evenement (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  code text not null,
  libelle text not null check (btrim(libelle) <> ''),
  libelle_ar text,
  ordre integer not null default 0,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, code),
  unique (id, marche_id)
);
alter table public.categories_evenement enable row level security;

create table public.evenements (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  date_evenement date not null,
  heure time,
  categorie_id uuid not null,
  titre text not null check (btrim(titre) <> ''),
  description text,
  participants text,
  lieu text,
  zone_id uuid,
  secteur_id uuid,
  saisi_par uuid references public.profils (id),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  supprime_le timestamptz,
  supprime_par uuid references public.profils (id),
  unique (id, marche_id),
  foreign key (categorie_id, marche_id) references public.categories_evenement (id, marche_id),
  foreign key (zone_id, marche_id) references public.zones (id, marche_id),
  foreign key (secteur_id, marche_id) references public.secteurs (id, marche_id)
);
alter table public.evenements enable row level security;
create index evenements_marche_date_idx on public.evenements (marche_id, date_evenement desc) where supprime_le is null;
create index evenements_categorie_idx on public.evenements (categorie_id);

-- Pièces jointes (fichier dans le compartiment « evenements » :
-- <marche_id>/<evenement_id>/<piece_id>.<extension>)
create table public.evenement_pieces (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  evenement_id uuid not null,
  nom_fichier text not null check (btrim(nom_fichier) <> ''),
  chemin text not null unique,
  type_mime text,
  taille_octets integer check (taille_octets >= 0),
  saisi_par uuid references public.profils (id),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  supprime_le timestamptz,
  supprime_par uuid references public.profils (id),
  foreign key (evenement_id, marche_id) references public.evenements (id, marche_id)
);
alter table public.evenement_pieces enable row level security;
create index evenement_pieces_evenement_idx on public.evenement_pieces (evenement_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evenements', 'evenements', false, 10485760, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy evenements_fichiers_lecture on storage.objects for select to authenticated
  using (
    bucket_id = 'evenements'
    and private.uuid_ou_nul((storage.foldername(name))[1])
        = any ((select private.marches_autorises('evenements', 'lire'))::uuid[])
  );
create policy evenements_fichiers_envoi on storage.objects for insert to authenticated
  with check (
    bucket_id = 'evenements'
    and private.uuid_ou_nul((storage.foldername(name))[1])
        = any ((select private.marches_autorises('evenements', 'creer'))::uuid[])
  );
create policy evenements_fichiers_suppression on storage.objects for delete to authenticated
  using (
    bucket_id = 'evenements'
    and private.peut(
      private.uuid_ou_nul((storage.foldername(name))[1]),
      'evenements', 'supprimer', null, private.uuid_ou_nul(owner_id)
    )
  );

-- -----------------------------------------------------------------------------
-- 8. Règles d'attachement (une ligne par marché ; utilisées par l'étape B)
-- -----------------------------------------------------------------------------
create table public.parametres_attachement (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null unique references public.marches (id),
  periodicite text not null default 'mensuelle'
    check (periodicite in ('mensuelle', 'quinzaine', 'trimestrielle', 'libre')),
  titre text not null default 'ATTACHEMENT N° {numero} des travaux exécutés au {date}',
  regroupement text not null default 'poste'
    check (regroupement in ('poste', 'zone', 'secteur', 'equipe')),
  fuites_admissibles text not null default 'toutes'
    check (fuites_admissibles in ('toutes', 'verrouillees', 'achevees')),
  refection_anticipee boolean not null default true,     -- réfection autorisée par le client avant exécution
  verrouiller_a_l_arret boolean not null default true,   -- verrouiller les fuites d'un lot arrêté
  afficher_prix boolean not null default false,          -- prix et montants sur l'attachement imprimé
  mentions_obligatoires text[] not null default array['reference_marche', 'ordre_service', 'lieu_travaux']
    check (mentions_obligatoires <@ array['reference_marche', 'ordre_service', 'lieu_travaux', 'zone', 'observation']),
  visas text[] not null default array['Pour le maître d''ouvrage', 'Pour l''entreprise'],
  decimales jsonb not null default '{"ml": 2, "m2": 2, "m3": 3, "u": 0, "forfait": 2}'::jsonb
    check (jsonb_typeof(decimales) = 'object'),
  texte_pied text,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
alter table public.parametres_attachement enable row level security;

-- -----------------------------------------------------------------------------
-- 9. Valeurs par défaut de chaque marché (nouveau ou existant)
-- -----------------------------------------------------------------------------
create function private.initialiser_parametres_marche(p_marche uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.parametres_attachement (marche_id) values (p_marche)
  on conflict (marche_id) do nothing;
  insert into public.categories_evenement (marche_id, code, libelle, ordre)
  select p_marche, v.code, v.libelle, v.ordre
    from (values
      ('sortie_audit',       'Sortie audit',                       1),
      ('sortie_reception',   'Sortie réception',                   2),
      ('sortie_laboratoire', 'Sortie laboratoire / prélèvement',   3),
      ('reunion_chantier',   'Réunion de chantier',                4),
      ('autre',              'Autre',                              9)
    ) v (code, libelle, ordre)
  on conflict (marche_id, code) do nothing;
$$;

create function private.initialiser_marche()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.initialiser_parametres_marche(new.id);
  return null;
end
$$;

create trigger initialiser_marche after insert on public.marches
  for each row execute function private.initialiser_marche();

-- -----------------------------------------------------------------------------
-- 10. Contrôles de saisie communs : les événements suivent les règles des
-- données terrain (auteur de saisie, suppression logique, portée « siennes »).
-- Seule la correspondance table → type de donnée change.
-- -----------------------------------------------------------------------------
create or replace function private.avant_modification_saisie()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _type public.type_donnee := case tg_table_name
    when 'fuites' then 'fuites'
    when 'photos' then 'photos'
    when 'lignes_quantites' then 'quantites'
    when 'evenements' then 'evenements'
    when 'evenement_pieces' then 'evenements'
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

-- -----------------------------------------------------------------------------
-- 11. Déclencheurs communs des nouvelles tables
-- -----------------------------------------------------------------------------
do $$
declare
  _t text;
begin
  foreach _t in array array[
    'avenants', 'arrets_travaux', 'categories_evenement', 'parametres_attachement',
    'evenements', 'evenement_pieces'
  ] loop
    execute format('create trigger maj_modifie_le before update on public.%I
                    for each row execute function private.maj_modifie_le()', _t);
    execute format('create trigger figer_marche before update on public.%I
                    for each row execute function private.figer_marche()', _t);
    execute format('create trigger journaliser after insert or update or delete on public.%I
                    for each row execute function private.journaliser()', _t);
  end loop;

  foreach _t in array array['evenements', 'evenement_pieces'] loop
    execute format('create trigger a_avant_insertion before insert on public.%I
                    for each row execute function private.avant_insertion_saisie()', _t);
    execute format('create trigger b_avant_modification before update on public.%I
                    for each row execute function private.avant_modification_saisie()', _t);
  end loop;
end
$$;

-- Les versions de prix ne changent jamais (pas de mise à jour accordée) ; on trace leur création.
create trigger journaliser after insert or update or delete on public.prix_versions
  for each row execute function private.journaliser();

-- -----------------------------------------------------------------------------
-- 12. Règles RLS et privilèges
-- -----------------------------------------------------------------------------
do $$
declare
  _t text;
begin
  foreach _t in array array['avenants', 'arrets_travaux', 'categories_evenement', 'parametres_attachement'] loop
    execute format($f$
      create policy %1$s_lecture on public.%1$I for select to authenticated
        using (marche_id = any ((select private.mes_marches())::uuid[]));
      create policy %1$s_creation on public.%1$I for insert to authenticated
        with check (marche_id = any ((select private.marches_autorises('parametres', 'creer'))::uuid[]));
      create policy %1$s_modification on public.%1$I for update to authenticated
        using (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]))
        with check (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]));
      grant select, insert, update on public.%1$I to authenticated;
    $f$, _t);
  end loop;

  foreach _t in array array['evenements', 'evenement_pieces'] loop
    execute format($f$
      create policy %1$s_lecture on public.%1$I for select to authenticated
        using (marche_id = any ((select private.marches_autorises('evenements', 'lire'))::uuid[]));
      create policy %1$s_creation on public.%1$I for insert to authenticated
        with check (marche_id = any ((select private.marches_autorises('evenements', 'creer'))::uuid[]));
      create policy %1$s_modification on public.%1$I for update to authenticated
        using (
          marche_id = any ((select private.marches_autorises('evenements', 'modifier'))::uuid[])
          or marche_id = any ((select private.marches_autorises('evenements', 'supprimer'))::uuid[])
        )
        with check (
          marche_id = any ((select private.marches_autorises('evenements', 'modifier'))::uuid[])
          or marche_id = any ((select private.marches_autorises('evenements', 'supprimer'))::uuid[])
        );
      grant select, insert, update on public.%1$I to authenticated;
    $f$, _t);
  end loop;
end
$$;

-- Versions de prix : lues comme les prix, créées avec le droit de modifier les paramètres.
create policy prix_versions_lecture on public.prix_versions for select to authenticated
  using (
    marche_id = any ((select private.marches_autorises('quantites', 'lire'))::uuid[])
    or marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[])
  );
create policy prix_versions_creation on public.prix_versions for insert to authenticated
  with check (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]));
grant select, insert on public.prix_versions to authenticated;

grant select on public.v_delai_marche to authenticated;

-- Le responsable tient le journal des événements ; les droits existants sont complétés.
insert into public.modeles_droits (role, type_donnee, lire, creer, modifier, supprimer, valider)
values ('responsable', 'evenements', true, true, 'toutes', 'toutes', true)
on conflict (role, type_donnee) do nothing;

insert into public.droits (profil_id, marche_id, type_donnee, lire, creer, modifier, supprimer, valider)
select a.profil_id, a.marche_id, 'evenements', true, true, 'toutes', 'toutes', true
  from public.affectations a
 where 'responsable' = any (a.roles)
on conflict (profil_id, marche_id, type_donnee) do nothing;

-- -----------------------------------------------------------------------------
-- 13. Libellés et contrôles propres au client dans les vues
-- -----------------------------------------------------------------------------

-- Masque de référence → expression régulière (« 9 » = un chiffre, le reste littéral).
create function private.regex_masque(p_masque text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_masque is null then null
    else '^' || replace(regexp_replace(p_masque, '([^0-9A-Za-z])', '\\\1', 'g'), '9', '[0-9]') || '$'
  end
$$;

-- v_fuites : l'alerte « non communiquée au client » ne vaut que si le marché suit
-- les jalons du client.
create or replace view public.v_fuites with (security_invoker = true) as
select
  f.id,
  f.marche_id,
  f.numero,
  f.reference_srm,
  f.origine,
  f.visibilite,
  f.ouvrage,
  f.statut,
  f.zone_id,
  z.libelle as zone,
  f.secteur_id,
  s.libelle as secteur,
  f.equipe_id,
  e.libelle as equipe,
  f.adresse,
  extensions.st_y(f.position::extensions.geometry) as latitude,
  extensions.st_x(f.position::extensions.geometry) as longitude,
  f.date_detection,
  (f.date_detection at time zone 'Africa/Casablanca')::date as jour_detection,
  f.auteur_terrain_id,
  pa.nom_complet as detectee_par,
  f.source_saisie,
  f.date_communication_srm,
  f.validation_srm_le,
  f.validation_srm_par,
  f.avis_terrassement_srm_le,
  r.realisee_le as derniere_reparation_le,
  r.emplacement as emplacement_fouille,
  rf.realisee_le as derniere_refection_le,
  coalesce(ph.nb_photos, 0) as nb_photos,
  f.motif_sans_reparation_id,
  mo.libelle_fr as motif_sans_reparation,
  mo.libelle_ar as motif_sans_reparation_ar,
  f.fuite_liee_id,
  f.verrouillee_le,
  f.observation,
  f.cree_le,
  f.modifie_le,
  -- Alertes (seuils paramétrés par marché)
  (f.statut = 'detectee'
     and now() - f.date_detection > make_interval(hours => m.delai_alerte_reparation_h))
    as alerte_non_reparee,
  (m.jalons_client
     and f.date_communication_srm is null
     and (f.date_detection at time zone 'Africa/Casablanca')::date
         < (now() at time zone 'Africa/Casablanca')::date)
    as alerte_communication_srm,
  (f.statut = 'reparee' and r.emplacement = 'chaussee'
     and now() - r.realisee_le > make_interval(days => m.delai_prealerte_refection_chaussee_j))
    as alerte_refection_chaussee,
  (f.statut = 'reparee' and r.emplacement = 'chaussee'
     and now() - r.realisee_le > make_interval(days => m.delai_refection_chaussee_j))
    as refection_chaussee_hors_delai,
  (f.statut = 'reparee' and r.emplacement is distinct from 'chaussee'
     and now() - r.realisee_le > make_interval(days => m.delai_alerte_refection_trottoir_j))
    as alerte_refection_trottoir,
  (coalesce(ph.nb_photos, 0) = 0) as alerte_sans_photo
from public.fuites f
join public.marches m on m.id = f.marche_id
left join public.zones z on z.id = f.zone_id
left join public.secteurs s on s.id = f.secteur_id
left join public.equipes e on e.id = f.equipe_id
left join public.profils pa on pa.id = f.auteur_terrain_id
left join public.motifs mo on mo.id = f.motif_sans_reparation_id
left join lateral (
  select rp.realisee_le, rp.emplacement
    from public.reparations rp
   where rp.fuite_id = f.id and rp.supprime_le is null
   order by rp.realisee_le desc
   limit 1
) r on true
left join lateral (
  select max(x.realisee_le) as realisee_le
    from public.refections x
   where x.fuite_id = f.id and x.supprime_le is null
) rf on true
left join lateral (
  select count(*) as nb_photos
    from public.photos p
   where p.fuite_id = f.id and p.supprime_le is null
) ph on true
where f.supprime_le is null;

-- v_anomalies : avis avant terrassement seulement si le marché suit les jalons du
-- client ; format de la référence selon le masque du marché (aucun contrôle sans masque).
create or replace view public.v_anomalies with (security_invoker = true) as
with rep as (
  select r.*, f.numero, f.date_detection, f.avis_terrassement_srm_le, m.jalons_client
    from public.reparations r
    join public.fuites f on f.id = r.fuite_id and f.supprime_le is null
    join public.marches m on m.id = r.marche_id
   where r.supprime_le is null
)
select rep.marche_id, rep.fuite_id, rep.numero as fuite_numero, rep.id as reparation_id,
       'prix_hors_bordereau'::text as anomalie,
       format('Réparation %s DN %s sans prix au bordereau', rep.materiau, rep.diametre_mm) as detail
  from rep
 where rep.resultat = 'reparee' and rep.tuyau_repare
   and not exists (
     select 1 from public.lignes_quantites l
       join public.prix p on p.id = l.prix_id
      where l.reparation_id = rep.id and l.supprime_le is null
        and (p.famille = 'reparation_tuyau' or p.hors_bordereau)
   )
union all
select rep.marche_id, rep.fuite_id, rep.numero, rep.id, 'fouille_superieure_2m',
       format('Longueur de fouille %s m sans remplacement d''élément', rep.fouille_longueur_m)
  from rep where rep.fouille_longueur_m > 2 and not rep.element_remplace
union all
select rep.marche_id, rep.fuite_id, rep.numero, rep.id, 'longueur_pe_superieure_2m',
       format('Longueur de polyéthylène %s m', rep.longueur_pe_m)
  from rep where rep.longueur_pe_m > 2
union all
select rep.marche_id, rep.fuite_id, rep.numero, rep.id, 'reparation_avant_detection',
       'Date de réparation antérieure à la date de détection'
  from rep where rep.realisee_le < rep.date_detection
union all
select rep.marche_id, rep.fuite_id, rep.numero, rep.id, 'terrassement_sans_avis_srm',
       'Terrassement sans avis préalable du maître d''ouvrage enregistré'
  from rep where rep.jalons_client and rep.avis_terrassement_srm_le is null
union all
select rf.marche_id, rf.fuite_id, f.numero, rf.reparation_id, 'refection_avant_reparation',
       'Date de réfection antérieure à la date de réparation'
  from public.refections rf
  join public.reparations r on r.id = rf.reparation_id
  join public.fuites f on f.id = rf.fuite_id and f.supprime_le is null
 where rf.supprime_le is null and rf.realisee_le < r.realisee_le
union all
select f.marche_id, f.id, f.numero, null::uuid, 'reference_srm_format',
       format('Référence « %s » hors format %s', f.reference_srm, m.masque_reference)
  from public.fuites f
  join public.marches m on m.id = f.marche_id
 where f.supprime_le is null and f.reference_srm is not null
   and m.masque_reference is not null
   and f.reference_srm !~ private.regex_masque(m.masque_reference)
union all
select f.marche_id, f.id, f.numero, null::uuid, 'reference_srm_doublon',
       format('Référence « %s » portée par une autre fuite', f.reference_srm)
  from public.fuites f
 where f.supprime_le is null and f.reference_srm is not null
   and f.fuite_liee_id is null
   and exists (
     select 1 from public.fuites g
      where g.marche_id = f.marche_id and g.id <> f.id and g.supprime_le is null
        and g.reference_srm = f.reference_srm
   );

-- -----------------------------------------------------------------------------
-- 14. Fonctions : rien pour anon ; authenticated n'exécute que ce que les vues
-- appellent. Les fonctions de déclencheur ne demandent aucun droit d'exécution.
-- -----------------------------------------------------------------------------
revoke execute on function
  private.proteger_marche(),
  private.preparer_version_prix(),
  private.appliquer_version_prix(),
  private.version_initiale_prix(),
  private.proteger_prix(),
  private.versionner_prix_direct(),
  private.controler_arret(),
  private.initialiser_parametres_marche(uuid),
  private.initialiser_marche(),
  private.avant_modification_saisie(),
  private.regex_masque(text)
  from public, anon, authenticated;
grant execute on function private.regex_masque(text) to authenticated, service_role;
grant execute on function
  private.proteger_marche(),
  private.preparer_version_prix(),
  private.appliquer_version_prix(),
  private.version_initiale_prix(),
  private.proteger_prix(),
  private.versionner_prix_direct(),
  private.controler_arret(),
  private.initialiser_parametres_marche(uuid),
  private.initialiser_marche(),
  private.avant_modification_saisie()
  to service_role;

-- -----------------------------------------------------------------------------
-- 15. Valeurs des marchés existants
-- -----------------------------------------------------------------------------
do $$
begin
  perform private.initialiser_parametres_marche(m.id) from public.marches m;
end
$$;

-- Marché n° 4500004453 (source : references/regles-marche-4500004453.md, § 2).
-- Adresse et identifiants à relire par Issam dans Paramètres > Marché.
update public.ordres_service o
   set nature = v.nature
  from public.marches m,
       (values ('01/4500004453', 'notification'), ('02/4500004453', 'commencement')) v (numero, nature)
 where m.code = 'SRM-4500004453' and o.marche_id = m.id and o.numero = v.numero;

update public.marches m
   set client_sigle = 'SRM',
       client_nom_ar = 'الشركة الجهوية متعددة الخدمات الشرق',
       client_direction = 'Direction Exploitation Eau Potable',
       client_service = 'Département Mesures et Amélioration du Rendement',
       client_adresse = 'Hay Al Hikma, Bd la Liberté, BP 418, Oujda',
       client_ice = '003507258000090',
       client_representant = 'Le Directeur Exploitation Eau Potable',
       titulaire_nom = 'STEPAG SARL',
       titulaire_nom_ar = 'ستيݒاݣ (ش.م.م)',
       titulaire_forme_juridique = 'SARL',
       titulaire_capital = '15 000 000,00 DH',
       titulaire_adresse = 'Bureau N° 02, Résidence Nasr, Imm. 110, Appt 08, Oujda',
       titulaire_ice = '001544809000060',
       titulaire_if = '14447728',
       titulaire_rc = 'Oujda 26239',
       titulaire_patente = '11265141',
       titulaire_cnss = '9628093',
       titulaire_email = 'contact@stepag.ma',
       titulaire_representant = 'Imad BOUSALAM',
       titulaire_qualite_representant = 'Gérant',
       os_commencement_id = (select o.id from public.ordres_service o
                              where o.marche_id = m.id and o.numero = '02/4500004453'),
       montant_ttc = 5191974.00,
       libelle_reference = 'Référence SRM / tournée',
       masque_reference = '999-999-999',
       jalons_client = true
 where m.code = 'SRM-4500004453';
