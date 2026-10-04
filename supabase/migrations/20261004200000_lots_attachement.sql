-- =============================================================================
-- Étape B : lots d'attachement (métrés et attachements, sans facture).
--
-- Unité d'œuvre = une fuite × un article du bordereau. Pour chaque unité :
--   exécuté (lignes de quantités) − attaché (lots arrêtés) = reste à attacher.
-- Le responsable choisit les unités d'un lot (brouillon), en tire des aperçus,
-- puis l'arrête : quantités figées, numéro attribué, fuites verrouillées.
-- Une quantité attachée ne peut plus l'être une seconde fois ; une correction
-- faite après coup réapparaît en régularisation (+ ou −) dans le lot suivant.
--
-- Natures de ligne :
--   solde        unité fuite × article ; quantité = reste à attacher, figée à l'arrêt
--   anticipation réfection attachée avant exécution (accord du maître d'ouvrage) ;
--                compte dans le solde : la vraie réfection fait la différence
--   libre        ligne sans fuite (balayage, maintien en attendant le plan du réseau…)
--   forcage      refacturation forcée par l'administrateur, hors solde, motif obligatoire
--
-- Réservé à l'administrateur : forçage, réouverture du dernier lot arrêté.
-- =============================================================================

create table public.attachements (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  numero integer,                                   -- attribué à l'arrêt, gardé en cas de réouverture
  statut text not null default 'brouillon' check (statut in ('brouillon', 'arrete')),
  intitule text,
  date_arret date,                                  -- « travaux exécutés au »
  periode_debut date,
  periode_fin date,
  zone_id uuid,
  lieu_travaux text,                                -- mention du CPS : lieu exact du début et de la fin
  os_id uuid,
  observation text,
  arrete_le timestamptz,
  arrete_par uuid references public.profils (id),
  rouvert_le timestamptz,
  rouvert_par uuid references public.profils (id),
  motif_reouverture text,
  -- Suivi (aucun calcul) : acceptation par le maître d'ouvrage, facture faite à la main
  accepte_le date,
  accepte_par text,
  reference_facture text,
  facture_le date,
  saisi_par uuid references public.profils (id),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  supprime_le timestamptz,
  supprime_par uuid references public.profils (id),
  unique (marche_id, numero),
  unique (id, marche_id),
  foreign key (zone_id, marche_id) references public.zones (id, marche_id),
  foreign key (os_id, marche_id) references public.ordres_service (id, marche_id),
  check (periode_fin is null or periode_debut is null or periode_fin >= periode_debut),
  check (statut = 'brouillon' or (numero is not null and date_arret is not null))
);
alter table public.attachements enable row level security;
create index attachements_marche_idx on public.attachements (marche_id, numero);

create table public.attachement_lignes (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  attachement_id uuid not null,
  nature text not null default 'solde' check (nature in ('solde', 'anticipation', 'libre', 'forcage')),
  fuite_id uuid,
  prix_id uuid not null,
  quantite numeric(14,3),                           -- nulle pour une unité au solde d'un brouillon (suivie en direct)
  designation text,                                 -- ligne libre : lieu, secteur, période
  zone_id uuid,
  secteur_id uuid,
  motif text,                                       -- anticipation (accord) ou forçage
  -- Copie de l'article à l'arrêt (un avenant ultérieur ne change pas un lot arrêté)
  prix_numero text,
  prix_designation text,
  unite text,
  pu_ht numeric(12,2),
  saisi_par uuid references public.profils (id),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  foreign key (attachement_id, marche_id) references public.attachements (id, marche_id),
  foreign key (fuite_id, marche_id) references public.fuites (id, marche_id),
  foreign key (prix_id, marche_id) references public.prix (id, marche_id),
  foreign key (zone_id, marche_id) references public.zones (id, marche_id),
  foreign key (secteur_id, marche_id) references public.secteurs (id, marche_id),
  check ((nature = 'libre') = (fuite_id is null)),
  check (nature = 'solde' or quantite is not null),
  check (nature not in ('anticipation', 'forcage') or nullif(btrim(motif), '') is not null),
  check (nature <> 'libre' or nullif(btrim(designation), '') is not null),
  check (nature <> 'anticipation' or quantite > 0)
);
alter table public.attachement_lignes enable row level security;
create unique index attachement_lignes_unite_idx on public.attachement_lignes (attachement_id, fuite_id, prix_id)
  where nature in ('solde', 'anticipation');
create index attachement_lignes_lot_idx on public.attachement_lignes (attachement_id);
create index attachement_lignes_fuite_idx on public.attachement_lignes (fuite_id, prix_id);

-- -----------------------------------------------------------------------------
-- Solde de chaque unité fuite × article
-- -----------------------------------------------------------------------------
create view public.v_a_attacher with (security_invoker = true) as
with executees as (
  select l.marche_id, l.fuite_id, l.prix_id, sum(l.quantite) as quantite
    from public.lignes_quantites l
   where l.supprime_le is null
   group by l.marche_id, l.fuite_id, l.prix_id
),
attachees as (
  select al.marche_id, al.fuite_id, al.prix_id,
         sum(al.quantite) as quantite,
         coalesce(sum(al.quantite) filter (where al.nature = 'anticipation'), 0) as anticipee,
         max(a.numero) as dernier_lot
    from public.attachement_lignes al
    join public.attachements a on a.id = al.attachement_id and a.statut = 'arrete' and a.supprime_le is null
   where al.nature in ('solde', 'anticipation')
   group by al.marche_id, al.fuite_id, al.prix_id
),
brouillons as (
  select al.fuite_id, al.prix_id, (array_agg(a.id order by a.cree_le))[1] as attachement_id
    from public.attachement_lignes al
    join public.attachements a on a.id = al.attachement_id and a.statut = 'brouillon' and a.supprime_le is null
   where al.nature in ('solde', 'anticipation')
   group by al.fuite_id, al.prix_id
),
unites as (
  select coalesce(e.marche_id, t.marche_id) as marche_id,
         coalesce(e.fuite_id, t.fuite_id) as fuite_id,
         coalesce(e.prix_id, t.prix_id) as prix_id,
         coalesce(e.quantite, 0) as quantite_executee,
         coalesce(t.quantite, 0) as quantite_attachee,
         coalesce(t.anticipee, 0) as quantite_anticipee,
         t.dernier_lot
    from executees e
    full join attachees t on t.fuite_id = e.fuite_id and t.prix_id = e.prix_id
)
select
  u.marche_id,
  u.fuite_id,
  f.numero as fuite_numero,
  f.reference_srm,
  f.adresse,
  f.statut,
  f.verrouillee_le is not null as verrouillee,
  f.zone_id,
  z.libelle as zone,
  f.secteur_id,
  s.libelle as secteur,
  r.equipe_id,
  e.libelle as equipe,
  r.realisee_le as reparee_le,
  rf.realisee_le as refectionnee_le,
  u.prix_id,
  p.numero as prix_numero,
  p.ordre as prix_ordre,
  p.designation as prix_designation,
  p.unite,
  p.famille,
  u.quantite_executee,
  u.quantite_attachee,
  u.quantite_anticipee,
  -- Réfection attachée par anticipation et pas encore saisie : rien à régulariser pour l'instant
  (u.quantite_anticipee > 0 and rf.nombre = 0) as en_attente_refection,
  case when u.quantite_anticipee > 0 and rf.nombre = 0 then 0
       else u.quantite_executee - u.quantite_attachee end as reste,
  u.dernier_lot,
  b.attachement_id as brouillon_id
from unites u
join public.fuites f on f.id = u.fuite_id and f.supprime_le is null
join public.prix p on p.id = u.prix_id
left join public.zones z on z.id = f.zone_id
left join public.secteurs s on s.id = f.secteur_id
left join lateral (
  select rp.realisee_le, rp.equipe_id
    from public.reparations rp
   where rp.fuite_id = f.id and rp.supprime_le is null
   order by rp.realisee_le desc
   limit 1
) r on true
left join public.equipes e on e.id = r.equipe_id
left join lateral (
  select max(x.realisee_le) as realisee_le, count(*) as nombre
    from public.refections x
   where x.fuite_id = f.id and x.supprime_le is null
) rf on true
left join brouillons b on b.fuite_id = u.fuite_id and b.prix_id = u.prix_id;

-- Reste à attacher d'une unité (même règle que la vue, contexte système).
create function private.reste_a_attacher(p_fuite uuid, p_prix uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select v.reste from public.v_a_attacher v where v.fuite_id = p_fuite and v.prix_id = p_prix), 0)
$$;

-- -----------------------------------------------------------------------------
-- Détail des lignes (quantité en direct pour les unités au solde d'un brouillon)
-- -----------------------------------------------------------------------------
create view public.v_attachement_lignes with (security_invoker = true) as
select
  al.id,
  al.marche_id,
  al.attachement_id,
  a.numero as attachement_numero,
  a.statut as attachement_statut,
  al.nature,
  al.fuite_id,
  f.numero as fuite_numero,
  f.reference_srm,
  f.adresse,
  coalesce(al.zone_id, f.zone_id) as zone_id,
  z.libelle as zone,
  coalesce(al.secteur_id, f.secteur_id) as secteur_id,
  s.libelle as secteur,
  r.equipe_id,
  e.libelle as equipe,
  r.realisee_le as reparee_le,
  r.fouille_longueur_m,
  r.fouille_largeur_m,
  r.fouille_profondeur_m,
  r.volume_m3,
  rf.realisee_le as refectionnee_le,
  rf.surface_m2 as surface_refection_m2,
  al.prix_id,
  coalesce(al.prix_numero, p.numero) as prix_numero,
  p.ordre as prix_ordre,
  coalesce(al.prix_designation, p.designation) as prix_designation,
  coalesce(al.unite, p.unite) as unite,
  coalesce(al.pu_ht, p.pu_ht) as pu_ht,
  case when al.nature = 'solde' and a.statut = 'brouillon' then coalesce(u.reste, 0) else al.quantite end as quantite,
  case when al.nature = 'solde' and a.statut = 'brouillon' then coalesce(u.reste, 0) < 0 else al.quantite < 0 end as regularisation_negative,
  -- Unité déjà attachée dans un lot arrêté précédent : cette ligne est une régularisation
  (al.nature = 'solde' and prec.numero is not null) as regularisation,
  prec.numero as lot_precedent,
  al.designation,
  al.motif,
  al.cree_le,
  nr.prix_id as prix_refection_prevu               -- article de réfection selon le revêtement de la fouille
from public.attachement_lignes al
join public.attachements a on a.id = al.attachement_id and a.supprime_le is null
join public.prix p on p.id = al.prix_id
left join public.fuites f on f.id = al.fuite_id
left join public.v_a_attacher u on u.fuite_id = al.fuite_id and u.prix_id = al.prix_id
left join lateral (
  select max(b.numero) as numero
    from public.attachement_lignes bl
    join public.attachements b on b.id = bl.attachement_id and b.statut = 'arrete' and b.supprime_le is null
   where bl.fuite_id = al.fuite_id and bl.prix_id = al.prix_id and bl.nature in ('solde', 'anticipation')
     and b.id <> a.id and (a.numero is null or b.numero < a.numero)
) prec on true
left join public.zones z on z.id = coalesce(al.zone_id, f.zone_id)
left join public.secteurs s on s.id = coalesce(al.secteur_id, f.secteur_id)
left join lateral (
  select rp.realisee_le, rp.equipe_id, rp.fouille_longueur_m, rp.fouille_largeur_m, rp.fouille_profondeur_m, rp.volume_m3,
         rp.nature_revetement_id
    from public.reparations rp
   where rp.fuite_id = al.fuite_id and rp.supprime_le is null
   order by rp.realisee_le desc
   limit 1
) r on true
left join public.natures_refection nr on nr.id = r.nature_revetement_id
left join public.equipes e on e.id = r.equipe_id
left join lateral (
  select x.realisee_le, x.surface_m2
    from public.refections x
   where x.fuite_id = al.fuite_id and x.supprime_le is null and x.resultat = 'faite'
   order by x.realisee_le desc
   limit 1
) rf on true;

-- -----------------------------------------------------------------------------
-- Récapitulatif par lot et par article : antérieur (lots arrêtés précédents),
-- ce lot, cumul, part de la quantité du marché.
-- -----------------------------------------------------------------------------
create view public.v_attachement_recap with (security_invoker = true) as
with lots as (
  select a.id, a.marche_id, a.numero, a.statut
    from public.attachements a
   where a.supprime_le is null
),
lignes as (
  select l.attachement_id, l.prix_id, sum(l.quantite) as quantite
    from public.v_attachement_lignes l
   group by l.attachement_id, l.prix_id
),
anterieures as (
  select a.id as attachement_id, l.prix_id, sum(l.quantite) as quantite
    from lots a
    join lots b on b.marche_id = a.marche_id and b.statut = 'arrete' and b.id <> a.id
               and (a.numero is null or b.numero < a.numero)
    join lignes l on l.attachement_id = b.id
   group by a.id, l.prix_id
)
select
  a.id as attachement_id,
  a.marche_id,
  a.numero,
  a.statut,
  p.id as prix_id,
  p.numero as prix_numero,
  p.ordre as prix_ordre,
  p.designation as prix_designation,
  p.unite,
  p.hors_bordereau,
  p.quantite_marche,
  p.pu_ht,
  coalesce(ant.quantite, 0) as quantite_anterieure,
  coalesce(lot.quantite, 0) as quantite_lot,
  coalesce(ant.quantite, 0) + coalesce(lot.quantite, 0) as quantite_cumulee,
  case when p.quantite_marche > 0
       then round(100 * (coalesce(ant.quantite, 0) + coalesce(lot.quantite, 0)) / p.quantite_marche, 1)
  end as pourcentage_marche
from lots a
join public.prix p on p.marche_id = a.marche_id
left join lignes lot on lot.attachement_id = a.id and lot.prix_id = p.id
left join anterieures ant on ant.attachement_id = a.id and ant.prix_id = p.id
where (p.actif and not p.hors_bordereau) or lot.quantite is not null or ant.quantite is not null;

-- -----------------------------------------------------------------------------
-- Contrôles
-- -----------------------------------------------------------------------------

-- En-tête d'un lot : statut, numéro et arrêt ne changent que par les fonctions ;
-- un lot arrêté ne garde modifiables que les informations de suivi.
create function private.controler_lot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.appel_systeme() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.statut := 'brouillon';
    new.numero := null;
    new.arrete_le := null;
    new.arrete_par := null;
    new.rouvert_le := null;
    new.rouvert_par := null;
    new.motif_reouverture := null;
    return new;
  end if;
  new.statut := old.statut;
  new.numero := old.numero;
  new.arrete_le := old.arrete_le;
  new.arrete_par := old.arrete_par;
  new.rouvert_le := old.rouvert_le;
  new.rouvert_par := old.rouvert_par;
  new.motif_reouverture := old.motif_reouverture;
  if new.supprime_le is not null and old.supprime_le is null and (old.statut = 'arrete' or old.numero is not null) then
    raise exception 'Un lot numéroté ne se supprime pas' using errcode = 'check_violation';
  end if;
  if old.statut = 'arrete'
     and (to_jsonb(new) - 'accepte_le' - 'accepte_par' - 'reference_facture' - 'facture_le' - 'observation' - 'modifie_le')
         is distinct from
         (to_jsonb(old) - 'accepte_le' - 'accepte_par' - 'reference_facture' - 'facture_le' - 'observation' - 'modifie_le') then
    raise exception 'Lot arrêté : seuls l''acceptation, la facture et l''observation se modifient'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- Lignes : seulement dans un brouillon ; une unité au solde dans un seul
-- brouillon à la fois ; anticipation et forçage encadrés.
create function private.controler_ligne_attachement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _ligne public.attachement_lignes := coalesce(new, old);
  _lot public.attachements;
  _autre public.attachements;
  _refection boolean;
  _anticipation boolean;
begin
  if private.appel_systeme() then
    return coalesce(new, old);
  end if;
  select * into _lot from public.attachements where id = _ligne.attachement_id;
  if _lot.statut is distinct from 'brouillon' or _lot.supprime_le is not null then
    raise exception 'Lot arrêté : ses lignes sont figées' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.attachement_id is distinct from old.attachement_id then
    raise exception 'Une ligne ne change pas de lot' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  new.prix_numero := null;
  new.prix_designation := null;
  new.unite := null;
  new.pu_ht := null;
  if tg_op = 'INSERT' then
    new.saisi_par := auth.uid();
  else
    new.saisi_par := old.saisi_par;
  end if;

  if new.nature = 'forcage' and not private.est_admin() then
    raise exception 'Refacturation forcée réservée à l''administrateur' using errcode = 'insufficient_privilege';
  end if;

  if new.nature = 'anticipation' then
    select pa.refection_anticipee into _anticipation from public.parametres_attachement pa where pa.marche_id = new.marche_id;
    select p.famille = 'refection' or exists (select 1 from public.natures_refection n where n.prix_id = p.id)
      into _refection
      from public.prix p where p.id = new.prix_id;
    if not coalesce(_anticipation, false) then
      raise exception 'Réfection anticipée non autorisée par les règles du marché' using errcode = 'check_violation';
    end if;
    if not coalesce(_refection, false) then
      raise exception 'Seule une réfection peut être attachée par anticipation' using errcode = 'check_violation';
    end if;
  end if;

  if new.nature = 'solde' then
    new.quantite := null;
  end if;

  if new.nature in ('solde', 'anticipation') then
    select a.* into _autre
      from public.attachement_lignes l
      join public.attachements a on a.id = l.attachement_id and a.statut = 'brouillon' and a.supprime_le is null
     where l.fuite_id = new.fuite_id and l.prix_id = new.prix_id and l.nature in ('solde', 'anticipation')
       and l.attachement_id <> new.attachement_id and l.id <> new.id
     limit 1;
    if _autre.id is not null then
      raise exception 'Cette unité est déjà dans le brouillon « % »', coalesce(_autre.intitule, 'sans titre')
        using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Arrêt et réouverture
-- -----------------------------------------------------------------------------
create function public.arreter_attachement(p_attachement uuid, p_date_arret date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _a public.attachements;
  _r public.parametres_attachement;
  _m public.marches;
  _manque text[] := '{}';
  _numero integer;
begin
  select * into _a from public.attachements where id = p_attachement for update;
  if _a.id is null or _a.supprime_le is not null then
    raise exception 'Lot introuvable' using errcode = 'no_data_found';
  end if;
  if not private.peut(_a.marche_id, 'attachements', 'valider') then
    raise exception 'Arrêt d''un lot réservé au responsable' using errcode = 'insufficient_privilege';
  end if;
  if _a.statut <> 'brouillon' then
    raise exception 'Ce lot est déjà arrêté' using errcode = 'check_violation';
  end if;
  select * into _r from public.parametres_attachement where marche_id = _a.marche_id;
  select * into _m from public.marches where id = _a.marche_id;

  _a.date_arret := coalesce(p_date_arret, _a.date_arret);
  if _a.date_arret is null then
    _manque := _manque || 'date « travaux exécutés au »'::text;
  end if;
  if 'reference_marche' = any (_r.mentions_obligatoires) and nullif(btrim(_m.numero), '') is null then
    _manque := _manque || 'numéro du marché'::text;
  end if;
  if 'ordre_service' = any (_r.mentions_obligatoires) and _a.os_id is null then
    _manque := _manque || 'ordre de service'::text;
  end if;
  if 'lieu_travaux' = any (_r.mentions_obligatoires) and nullif(btrim(_a.lieu_travaux), '') is null then
    _manque := _manque || 'lieu des travaux'::text;
  end if;
  if 'zone' = any (_r.mentions_obligatoires) and _a.zone_id is null then
    _manque := _manque || 'zone'::text;
  end if;
  if 'observation' = any (_r.mentions_obligatoires) and nullif(btrim(_a.observation), '') is null then
    _manque := _manque || 'observation'::text;
  end if;
  if cardinality(_manque) > 0 then
    raise exception 'Mentions manquantes : %', array_to_string(_manque, ', ') using errcode = 'check_violation';
  end if;

  -- Quantités figées : reste à attacher de chaque unité au moment de l'arrêt
  update public.attachement_lignes l
     set quantite = private.reste_a_attacher(l.fuite_id, l.prix_id)
   where l.attachement_id = p_attachement and l.nature = 'solde';
  delete from public.attachement_lignes l
   where l.attachement_id = p_attachement and l.nature = 'solde' and l.quantite = 0;
  if not exists (select 1 from public.attachement_lignes l where l.attachement_id = p_attachement) then
    raise exception 'Lot vide : aucune quantité à attacher' using errcode = 'check_violation';
  end if;

  update public.attachement_lignes l
     set prix_numero = p.numero, prix_designation = p.designation, unite = p.unite, pu_ht = p.pu_ht
    from public.prix p
   where p.id = l.prix_id and l.attachement_id = p_attachement;

  _numero := coalesce(_a.numero, private.prochain_numero(_a.marche_id, 'attachement'));
  update public.attachements
     set statut = 'arrete', numero = _numero, date_arret = _a.date_arret,
         arrete_le = now(), arrete_par = auth.uid()
   where id = p_attachement;

  if coalesce(_r.verrouiller_a_l_arret, true) then
    update public.fuites f
       set verrouillee_le = now(), verrouillee_par = auth.uid()
     where f.verrouillee_le is null
       and f.id in (select l.fuite_id from public.attachement_lignes l where l.attachement_id = p_attachement);
  end if;
  return _numero;
end
$$;

create function public.rouvrir_attachement(p_attachement uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _a public.attachements;
  _dernier integer;
begin
  if not private.est_admin() then
    raise exception 'Réouverture d''un lot réservée à l''administrateur' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_motif), '') is null then
    raise exception 'Motif de réouverture obligatoire' using errcode = 'check_violation';
  end if;
  select * into _a from public.attachements where id = p_attachement for update;
  if _a.id is null or _a.supprime_le is not null or _a.statut <> 'arrete' then
    raise exception 'Seul un lot arrêté peut être rouvert' using errcode = 'check_violation';
  end if;
  select max(a.numero) into _dernier
    from public.attachements a
   where a.marche_id = _a.marche_id and a.statut = 'arrete' and a.supprime_le is null;
  if _a.numero <> _dernier then
    raise exception 'Seul le dernier lot arrêté (n° %) peut être rouvert', _dernier using errcode = 'check_violation';
  end if;
  update public.attachements
     set statut = 'brouillon', rouvert_le = now(), rouvert_par = auth.uid(), motif_reouverture = btrim(p_motif)
   where id = p_attachement;
  -- Les unités au solde redeviennent suivies en direct ; les autres lignes gardent leur quantité.
  update public.attachement_lignes
     set quantite = case when nature = 'solde' then null else quantite end,
         prix_numero = null, prix_designation = null, unite = null, pu_ht = null
   where attachement_id = p_attachement;
end
$$;

-- -----------------------------------------------------------------------------
-- Correspondance table → type de donnée pour les contrôles de saisie communs
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
    when 'attachements' then 'attachements'
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
-- Déclencheurs
-- -----------------------------------------------------------------------------
create trigger a_avant_insertion before insert on public.attachements
  for each row execute function private.avant_insertion_saisie();
create trigger b_avant_modification before update on public.attachements
  for each row execute function private.avant_modification_saisie();
create trigger c_controler_lot before insert or update on public.attachements
  for each row execute function private.controler_lot();
create trigger c_controler_ligne before insert or update or delete on public.attachement_lignes
  for each row execute function private.controler_ligne_attachement();

do $$
declare
  _t text;
begin
  foreach _t in array array['attachements', 'attachement_lignes'] loop
    execute format('create trigger maj_modifie_le before update on public.%I
                    for each row execute function private.maj_modifie_le()', _t);
    execute format('create trigger figer_marche before update on public.%I
                    for each row execute function private.figer_marche()', _t);
    execute format('create trigger journaliser after insert or update or delete on public.%I
                    for each row execute function private.journaliser()', _t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- RLS et privilèges (droit « attachements »)
-- -----------------------------------------------------------------------------
create policy attachements_lecture on public.attachements for select to authenticated
  using (marche_id = any ((select private.marches_autorises('attachements', 'lire'))::uuid[]));
create policy attachements_creation on public.attachements for insert to authenticated
  with check (marche_id = any ((select private.marches_autorises('attachements', 'creer'))::uuid[]));
create policy attachements_modification on public.attachements for update to authenticated
  using (
    marche_id = any ((select private.marches_autorises('attachements', 'modifier'))::uuid[])
    or marche_id = any ((select private.marches_autorises('attachements', 'supprimer'))::uuid[])
  )
  with check (
    marche_id = any ((select private.marches_autorises('attachements', 'modifier'))::uuid[])
    or marche_id = any ((select private.marches_autorises('attachements', 'supprimer'))::uuid[])
  );
grant select, insert, update on public.attachements to authenticated;

-- Les lignes d'un brouillon sont une sélection : on les retire physiquement (journalisé).
create policy attachement_lignes_lecture on public.attachement_lignes for select to authenticated
  using (marche_id = any ((select private.marches_autorises('attachements', 'lire'))::uuid[]));
create policy attachement_lignes_creation on public.attachement_lignes for insert to authenticated
  with check (marche_id = any ((select private.marches_autorises('attachements', 'creer'))::uuid[]));
create policy attachement_lignes_modification on public.attachement_lignes for update to authenticated
  using (marche_id = any ((select private.marches_autorises('attachements', 'modifier'))::uuid[]))
  with check (marche_id = any ((select private.marches_autorises('attachements', 'modifier'))::uuid[]));
create policy attachement_lignes_suppression on public.attachement_lignes for delete to authenticated
  using (marche_id = any ((select private.marches_autorises('attachements', 'modifier'))::uuid[]));
grant select, insert, update, delete on public.attachement_lignes to authenticated;

grant select on public.v_a_attacher, public.v_attachement_lignes, public.v_attachement_recap to authenticated;

revoke execute on function
  private.reste_a_attacher(uuid, uuid),
  private.controler_lot(),
  private.controler_ligne_attachement(),
  private.avant_modification_saisie(),
  public.arreter_attachement(uuid, date),
  public.rouvrir_attachement(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.arreter_attachement(uuid, date),
  public.rouvrir_attachement(uuid, text)
  to authenticated, service_role;
grant execute on function
  private.reste_a_attacher(uuid, uuid),
  private.controler_lot(),
  private.controler_ligne_attachement(),
  private.avant_modification_saisie()
  to service_role;
