-- =============================================================================
-- Attachement du linéaire : prix 1 (balayage) et prix 2 (maintien des résultats).
-- Demande d'Issam du 2026-10-14. Règles : CPS art. I-32 (factures 1 à 3), II-15 et II-19 (un mètre payé une
-- fois, branchements exclus), II-23 (pénalités τ1 / τ2), définition des prix 1 et 2
-- (references/regles-marche-4500004453.md : R-CPS-067 à 074, R-CPS-105, R-CPS-130, R-DEF-001 à 009).
--
--  * Nouvelle nature de ligne « lineaire » : une ligne par zone (et par tranche pour le maintien), sans fuite.
--    Quantité suivie en direct dans un brouillon, figée à l'arrêt comme le solde ; un mètre n'est jamais attaché
--    deux fois ; une baisse (balayage annulé, tronçon passé dans une autre zone) revient en régularisation
--    négative au lot suivant.
--  * Prix 1 (famille « balayage ») : linéaire des premiers passages non annulés, datés jusqu'à la date du lot
--    (« travaux exécutés au », à défaut aujourd'hui), tronçons actifs et zonés, branchements exclus. C'est une
--    option : le responsable l'ajoute au lot quand il le veut, dès le premier mois ; sans clic, rien n'entre (le
--    CPS paie le balayage à son achèvement : on attend et on ajoute tout).
--    Plafond : quantité du marché du prix 1 (bordereau : 1 466 000 m, seule quantité contractuelle ; le tableau
--    n° 1 ne donne qu'un linéaire « approximatif » par zone, sans plafond par zone ; en 2017 le plafond était déjà
--    celui du marché, R-ATT-029), appliqué au cumul du marché, zones prises dans l'ordre de leur numéro (le
--    montant ne dépend pas de la zone : même prix partout).
--  * Prix 2 (famille « maintien ») : une tranche par phase portant une part du prix (phases.part_maintien_pct :
--    40 % à la fin du maintien 1, 60 % à la fin du maintien 2) ; base = prix 1 attaché de la zone (lots arrêtés) ;
--    tranche disponible quand la date du lot atteint la fin de la phase ; zone arrêtée par la SRM
--    (zones.arret_srm_le, τ1 < −25 %) : plus de maintien.
--  * Pénalités τ1 / τ2 : pas de quantité ; le panneau les rappelle (debits_resultats) pour les factures 1 et 3.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Phases : part du prix de maintien ; zones : arrêt par la SRM
-- -----------------------------------------------------------------------------
alter table public.phases add constraint phases_id_marche_id_key unique (id, marche_id);
alter table public.phases add column part_maintien_pct numeric(5,2)
  check (part_maintien_pct is null or (part_maintien_pct > 0 and part_maintien_pct <= 100));
comment on column public.phases.part_maintien_pct is
  'Part du prix de maintien (famille « maintien ») attachable à la fin de la phase, en % (SRM : maintien_1 40, maintien_2 60 ; CPS art. I-32).';
update public.phases set part_maintien_pct = 40 where code = 'maintien_1' and part_maintien_pct is null;
update public.phases set part_maintien_pct = 60 where code = 'maintien_2' and part_maintien_pct is null;

alter table public.zones add column arret_srm_le date;
comment on column public.zones.arret_srm_le is
  'Arrêt de la zone par la SRM après le balayage (CPS art. II-23 : τ1 < −25 %) : plus de maintien attaché (prix 2).';
grant select (arret_srm_le), insert (arret_srm_le), update (arret_srm_le) on public.zones to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Lignes d'attachement : nature « lineaire » et tranche
-- -----------------------------------------------------------------------------
alter table public.attachement_lignes add column phase_id uuid;
comment on column public.attachement_lignes.phase_id is
  'Ligne de linéaire du prix de maintien : tranche (phase portant une part du prix).';
alter table public.attachement_lignes
  add constraint attachement_lignes_phase_fk foreign key (phase_id, marche_id) references public.phases (id, marche_id);

-- Contraintes de 20261004200000 sans nom : retrouvées par leur définition.
do $$
declare
  _c record;
begin
  for _c in
    select conname, pg_get_constraintdef(oid) as def
      from pg_constraint
     where conrelid = 'public.attachement_lignes'::regclass and contype = 'c'
  loop
    if _c.def like '%nature = ANY (ARRAY[''solde''::text, ''anticipation''::text, ''libre''::text, ''forcage''::text])%'
       or _c.def = 'CHECK (((nature = ''libre''::text) = (fuite_id IS NULL)))'
       or _c.def = 'CHECK (((nature = ''solde''::text) OR (quantite IS NOT NULL)))' then
      execute format('alter table public.attachement_lignes drop constraint %I', _c.conname);
    end if;
  end loop;
end
$$;
alter table public.attachement_lignes add constraint attachement_lignes_nature_check
  check (nature in ('solde', 'anticipation', 'libre', 'lineaire', 'forcage'));
alter table public.attachement_lignes add constraint attachement_lignes_sans_fuite_check
  check ((nature in ('libre', 'lineaire')) = (fuite_id is null));
alter table public.attachement_lignes add constraint attachement_lignes_quantite_check
  check (nature in ('solde', 'lineaire') or quantite is not null);
alter table public.attachement_lignes add constraint attachement_lignes_lineaire_check
  check (nature <> 'lineaire' or zone_id is not null);
alter table public.attachement_lignes add constraint attachement_lignes_phase_check
  check (phase_id is null or nature = 'lineaire');
create unique index attachement_lignes_lineaire_idx on public.attachement_lignes
  (attachement_id, prix_id, zone_id, coalesce(phase_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where nature = 'lineaire';

-- -----------------------------------------------------------------------------
-- 3. Calculs
-- -----------------------------------------------------------------------------

-- Linéaire balayé payable par zone jusqu'à une date (premiers passages non annulés, tronçons actifs,
-- branchements exclus) ; zone nulle : tronçons sans zone (information, jamais attachés).
create function private.lineaire_balaye_zones(p_marche uuid, p_au date)
returns table (zone_id uuid, lineaire_m numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select t.zone_id, sum(t.longueur_m)
    from public.balayages b
    join public.troncons t on t.id = b.troncon_id
   where b.marche_id = p_marche and b.annule_le is null and b.premier_passage and b.date_balayage <= p_au
     and t.actif and t.categorie <> 'branchement'
   group by t.zone_id
$$;

-- Article du marché d'une famille (le premier, comme private.prix_famille).
create function private.prix_lineaire(p_marche uuid, p_famille public.famille_prix)
returns public.prix
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.prix p
   where p.marche_id = p_marche and p.famille = p_famille and p.actif and not p.hors_bordereau
   order by p.ordre, p.numero
   limit 1
$$;

-- Linéaire à attacher dans un lot (prix 1 par zone, prix 2 par zone et tranche) :
--   executee  prix 1 : linéaire balayé jusqu'à la date ; prix 2 : base × part de la tranche (0 si zone arrêtée)
--   attachee  quantité des lots arrêtés (prix 1 : toutes les lignes de la zone ; prix 2 : lignes de la tranche)
--   reste     executee − attachee
--   proposee  prix 1 : reste dans la limite de la quantité du marché ; prix 2 : reste si la tranche est disponible
create function private.proposition_lineaire(p_attachement uuid, p_au date default null)
returns table (
  attachement_id uuid,
  prix_id uuid,
  famille public.famille_prix,
  zone_id uuid,
  phase_id uuid,
  base numeric,
  part_pct numeric,
  executee numeric,
  attachee numeric,
  reste numeric,
  proposee numeric,
  disponible boolean,
  au date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _a public.attachements;
  _au date;
  _p1 public.prix;
  _p2 public.prix;
  _dec integer;
  _dispo numeric;
begin
  select * into _a from public.attachements a where a.id = p_attachement and a.supprime_le is null;
  if _a.id is null or (not private.contexte_serveur() and not private.peut(_a.marche_id, 'attachements', 'lire')) then
    return;
  end if;
  _au := coalesce(p_au, _a.date_arret, private.jour_maroc(now()));
  _p1 := private.prix_lineaire(_a.marche_id, 'balayage');
  _p2 := private.prix_lineaire(_a.marche_id, 'maintien');
  select coalesce((pa.decimales ->> 'ml')::integer, 2) into _dec
    from public.parametres_attachement pa where pa.marche_id = _a.marche_id;
  _dec := coalesce(_dec, 2);

  -- Prix 1 : reste disponible sous le plafond du marché (lots arrêtés, toutes lignes du prix 1)
  if _p1.id is not null then
    _dispo := _p1.quantite_marche - coalesce((
      select sum(al.quantite)
        from public.attachement_lignes al
        join public.attachements x on x.id = al.attachement_id and x.statut = 'arrete' and x.supprime_le is null
       where al.prix_id = _p1.id), 0);

    return query
    with balaye as (
      select b.zone_id, b.lineaire_m from private.lineaire_balaye_zones(_a.marche_id, _au) b where b.zone_id is not null
    ),
    attachees as (
      select al.zone_id, sum(al.quantite) as quantite
        from public.attachement_lignes al
        join public.attachements x on x.id = al.attachement_id and x.statut = 'arrete' and x.supprime_le is null
       where al.prix_id = _p1.id and al.zone_id is not null
       group by al.zone_id
    ),
    restes as (
      select z.id as zone_id, z.numero,
             coalesce(b.lineaire_m, 0) as executee,
             coalesce(t.quantite, 0) as attachee,
             coalesce(b.lineaire_m, 0) - coalesce(t.quantite, 0) as reste
        from public.zones z
        left join balaye b on b.zone_id = z.id
        left join attachees t on t.zone_id = z.id
       where z.marche_id = _a.marche_id and z.actif
    ),
    cumuls as (
      select r.*,
             sum(greatest(r.reste, 0)) over (order by r.numero, r.zone_id rows unbounded preceding) - greatest(r.reste, 0)
               as positif_avant,
             sum(least(r.reste, 0)) over () as negatif
        from restes r
    )
    select _a.id, _p1.id, 'balayage'::public.famille_prix, c.zone_id, null::uuid, null::numeric, null::numeric,
           c.executee, c.attachee, c.reste,
           case when c.reste <= 0 or _dispo is null then c.reste
                else greatest(0, least(c.reste, _dispo - c.negatif - c.positif_avant)) end,
           true, _au
      from cumuls c;
  end if;

  -- Prix 2 : tranches des phases portant une part du prix ; base = prix 1 attaché de la zone
  if _p2.id is not null then
    return query
    with base as (
      select al.zone_id, sum(al.quantite) as quantite
        from public.attachement_lignes al
        join public.attachements x on x.id = al.attachement_id and x.statut = 'arrete' and x.supprime_le is null
       where al.prix_id = _p1.id and al.zone_id is not null
       group by al.zone_id
    ),
    attachees as (
      select al.zone_id, al.phase_id, sum(al.quantite) as quantite
        from public.attachement_lignes al
        join public.attachements x on x.id = al.attachement_id and x.statut = 'arrete' and x.supprime_le is null
       where al.prix_id = _p2.id and al.nature = 'lineaire'
       group by al.zone_id, al.phase_id
    ),
    tranches as (
      select z.id as zone_id, ph.id as phase_id, ph.part_maintien_pct as part,
             coalesce(b.quantite, 0) as base,
             case when z.arret_srm_le is not null then 0
                  else round(coalesce(b.quantite, 0) * ph.part_maintien_pct / 100, _dec) end as executee,
             coalesce(t.quantite, 0) as attachee,
             (ph.date_fin is not null and _au >= ph.date_fin) as disponible
        from public.zones z
        join public.phases ph on ph.marche_id = z.marche_id and ph.part_maintien_pct is not null
        left join base b on b.zone_id = z.id
        left join attachees t on t.zone_id = z.id and t.phase_id = ph.id
       where z.marche_id = _a.marche_id and z.actif
    )
    select _a.id, _p2.id, 'maintien'::public.famille_prix, t.zone_id, t.phase_id, t.base, t.part,
           t.executee, t.attachee, t.executee - t.attachee,
           case when t.disponible then t.executee - t.attachee else 0 end,
           t.disponible, _au
      from tranches t;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 4. Détail des lignes : quantité des lignes de linéaire suivie en direct dans un brouillon
--    (corps de 20261013200000 ; colonnes de la tranche ajoutées à la fin)
-- -----------------------------------------------------------------------------
create or replace view public.v_attachement_lignes with (security_invoker = true) as
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
  r.auteur_terrain_id as chef_equipe_id,
  pc.nom_complet as chef_equipe,
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
  case when al.nature = 'solde' and a.statut = 'brouillon' then coalesce(u.reste, 0)
       when al.nature = 'lineaire' and a.statut = 'brouillon' then coalesce(lin.proposee, 0)
       else al.quantite end as quantite,
  case when al.nature = 'solde' and a.statut = 'brouillon' then coalesce(u.reste, 0) < 0
       when al.nature = 'lineaire' and a.statut = 'brouillon' then coalesce(lin.proposee, 0) < 0
       else al.quantite < 0 end as regularisation_negative,
  -- Unité déjà attachée dans un lot arrêté précédent : cette ligne est une régularisation
  (al.nature = 'solde' and prec.numero is not null) as regularisation,
  prec.numero as lot_precedent,
  al.designation,
  al.motif,
  al.cree_le,
  nr.prix_id as prix_refection_prevu,               -- article de réfection selon le revêtement de la fouille
  al.phase_id,
  ph.libelle as phase,
  ph.part_maintien_pct
from public.attachement_lignes al
join public.attachements a on a.id = al.attachement_id and a.supprime_le is null
join public.prix p on p.id = al.prix_id
left join public.fuites f on f.id = al.fuite_id
left join public.v_a_attacher u on u.fuite_id = al.fuite_id and u.prix_id = al.prix_id
-- Linéaire d'un brouillon : proposition calculée pour cette seule ligne, jamais pour les autres (le CASE garde
-- l'appel ; une clause WITH empêcherait de pousser les filtres de v_attachement_recap dans cette vue)
left join lateral (
  select case when al.nature = 'lineaire' and a.statut = 'brouillon' then (
           select q.proposee
             from private.proposition_lineaire(al.attachement_id) q
            where q.prix_id = al.prix_id and q.zone_id = al.zone_id and q.phase_id is not distinct from al.phase_id)
         end as proposee
) lin on true
left join public.phases ph on ph.id = al.phase_id
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
  select rp.realisee_le, rp.auteur_terrain_id, rp.fouille_longueur_m, rp.fouille_largeur_m, rp.fouille_profondeur_m,
         rp.volume_m3, rp.nature_revetement_id
    from public.reparations rp
   where rp.fuite_id = al.fuite_id and rp.supprime_le is null
   order by rp.realisee_le desc
   limit 1
) r on true
left join public.natures_refection nr on nr.id = r.nature_revetement_id
left join public.profils pc on pc.id = r.auteur_terrain_id
left join lateral (
  select x.realisee_le, x.surface_m2
    from public.refections x
   where x.fuite_id = al.fuite_id and x.supprime_le is null and x.resultat = 'faite'
   order by x.realisee_le desc
   limit 1
) rf on true;

-- -----------------------------------------------------------------------------
-- 5. Contrôles des lignes : linéaire (corps de 20261009200200 complété)
-- -----------------------------------------------------------------------------
create or replace function private.controler_ligne_attachement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _ligne public.attachement_lignes := coalesce(new, old);
  _lot public.attachements;
  _autre public.attachements;
  _acceptee boolean;
  _anticipable boolean;
  _raison text;
  _famille public.famille_prix;
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
    select pa.refection_anticipee into _acceptee from public.parametres_attachement pa where pa.marche_id = new.marche_id;
    if not coalesce(_acceptee, false) then
      raise exception 'Attachement par anticipation non accepté par le maître d''ouvrage (règles du marché)'
        using errcode = 'check_violation';
    end if;
    select p.anticipable into _anticipable from public.prix p where p.id = new.prix_id;
    if not coalesce(_anticipable, false) then
      raise exception 'Article hors du panier d''anticipation du marché' using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT' or new.fuite_id is distinct from old.fuite_id or new.prix_id is distinct from old.prix_id
       or old.nature is distinct from 'anticipation' then
      _raison := private.anticipation_impossible(new.fuite_id, new.prix_id);
      if _raison is not null then
        raise exception '%', _raison using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if new.nature = 'lineaire' then
    select p.famille into _famille from public.prix p where p.id = new.prix_id;
    if _famille is distinct from 'balayage' and _famille is distinct from 'maintien' then
      raise exception 'Ligne de linéaire : article de balayage ou de maintien seulement' using errcode = 'check_violation';
    end if;
    if _famille = 'balayage' and new.phase_id is not null then
      raise exception 'Balayage : pas de tranche' using errcode = 'check_violation';
    end if;
    if _famille = 'maintien' and not exists (select 1 from public.phases ph
                                             where ph.id = new.phase_id and ph.part_maintien_pct is not null) then
      raise exception 'Maintien : tranche obligatoire (phase portant une part du prix)' using errcode = 'check_violation';
    end if;
    select a.* into _autre
      from public.attachement_lignes l
      join public.attachements a on a.id = l.attachement_id and a.statut = 'brouillon' and a.supprime_le is null
     where l.nature = 'lineaire' and l.prix_id = new.prix_id and l.zone_id = new.zone_id
       and l.phase_id is not distinct from new.phase_id
       and l.attachement_id <> new.attachement_id and l.id <> new.id
     limit 1;
    if _autre.id is not null then
      raise exception 'Ce linéaire est déjà dans le brouillon « % »', coalesce(_autre.intitule, 'sans titre')
        using errcode = 'unique_violation';
    end if;
  end if;

  if new.nature in ('solde', 'lineaire') then
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
-- 6. Arrêt et réouverture : lignes de linéaire figées ou rendues au suivi en direct
--    (corps de 20261004200000 complétés)
-- -----------------------------------------------------------------------------
create or replace function public.arreter_attachement(p_attachement uuid, p_date_arret date default null)
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
  -- Linéaire : proposition à la date « travaux exécutés au » (plafond du marché, tranche disponible)
  update public.attachement_lignes l
     set quantite = coalesce(q.proposee, 0)
    from public.attachement_lignes x
    left join private.proposition_lineaire(p_attachement, _a.date_arret) q
           on q.prix_id = x.prix_id and q.zone_id = x.zone_id and q.phase_id is not distinct from x.phase_id
   where x.id = l.id and l.attachement_id = p_attachement and l.nature = 'lineaire';
  delete from public.attachement_lignes l
   where l.attachement_id = p_attachement and l.nature in ('solde', 'lineaire') and l.quantite = 0;
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

create or replace function public.rouvrir_attachement(p_attachement uuid, p_motif text)
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
  -- Les unités au solde et le linéaire redeviennent suivis en direct ; les autres lignes gardent leur quantité.
  update public.attachement_lignes
     set quantite = case when nature in ('solde', 'lineaire') then null else quantite end,
         prix_numero = null, prix_designation = null, unite = null, pu_ht = null
   where attachement_id = p_attachement;
end
$$;

-- -----------------------------------------------------------------------------
-- 7. Pour le panneau : linéaire à attacher dans un lot, ajout en un geste
-- -----------------------------------------------------------------------------

-- Une ligne par prix 1 × zone et prix 2 × zone × tranche, avec le contexte du marché (plafond, cumul attaché,
-- linéaire balayé sur des tronçons sans zone, linéaire approximatif de la zone au contrat).
create function public.lineaire_a_attacher(p_attachement uuid)
returns table (
  prix_id uuid,
  prix_numero text,
  famille public.famille_prix,
  zone_id uuid,
  zone_numero integer,
  zone text,
  zone_lineaire_contrat_m numeric,
  zone_arret_srm_le date,
  phase_id uuid,
  phase text,
  phase_fin date,
  part_pct numeric,
  base numeric,
  executee numeric,
  attachee numeric,
  reste numeric,
  proposee numeric,
  disponible boolean,
  dans_lot boolean,
  autre_brouillon text,
  au date,
  quantite_marche numeric,
  attachee_marche numeric,
  balaye_sans_zone_m numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select * from private.proposition_lineaire(p_attachement)
  ),
  sans_zone as (
    select coalesce(sum(b.lineaire_m), 0) as lineaire_m
      from public.attachements a
      cross join lateral private.lineaire_balaye_zones(a.marche_id, (select max(q.au) from q)) b
     where a.id = p_attachement and b.zone_id is null
  )
  select q.prix_id, p.numero, q.famille, q.zone_id, z.numero, z.libelle, z.lineaire_m, z.arret_srm_le,
         q.phase_id, ph.libelle, ph.date_fin, q.part_pct, q.base, q.executee, q.attachee, q.reste, q.proposee,
         q.disponible,
         exists (select 1 from public.attachement_lignes l
                  where l.attachement_id = q.attachement_id and l.nature = 'lineaire' and l.prix_id = q.prix_id
                    and l.zone_id = q.zone_id and l.phase_id is not distinct from q.phase_id),
         (select coalesce(b.intitule, 'sans titre')
            from public.attachement_lignes l
            join public.attachements b on b.id = l.attachement_id and b.statut = 'brouillon' and b.supprime_le is null
           where l.attachement_id <> q.attachement_id and l.nature = 'lineaire' and l.prix_id = q.prix_id
             and l.zone_id = q.zone_id and l.phase_id is not distinct from q.phase_id
           limit 1),
         q.au, p.quantite_marche,
         (select coalesce(sum(al.quantite), 0)
            from public.attachement_lignes al
            join public.attachements x on x.id = al.attachement_id and x.statut = 'arrete' and x.supprime_le is null
           where al.prix_id = q.prix_id),
         case when q.famille = 'balayage' then (select sz.lineaire_m from sans_zone sz) end
    from q
    join public.prix p on p.id = q.prix_id
    join public.zones z on z.id = q.zone_id
    left join public.phases ph on ph.id = q.phase_id
   order by p.ordre, z.numero, ph.ordre
$$;

-- Ajoute au brouillon une ligne par zone (et par tranche) dont la proposition n'est pas nulle, sauf celles déjà dans
-- ce lot ou dans un autre brouillon ; droits de l'appelant (attachements / créer) et contrôles des lignes.
create function public.ajouter_lineaire_attachement(p_attachement uuid, p_famille public.famille_prix)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  _n integer;
begin
  if p_famille not in ('balayage', 'maintien') then
    raise exception 'Linéaire : balayage ou maintien seulement' using errcode = 'check_violation';
  end if;
  insert into public.attachement_lignes (marche_id, attachement_id, nature, prix_id, zone_id, phase_id, designation)
  select a.marche_id, a.id, 'lineaire', q.prix_id, q.zone_id, q.phase_id,
         case when q.famille = 'balayage'
              then format('Linéaire balayé (premiers passages), zone %s : %s', z.numero, z.libelle)
              else format('Maintien des résultats, %s (%s %%), zone %s : %s', ph.libelle,
                          trim(trailing '.' from trim(trailing '0' from q.part_pct::text)), z.numero, z.libelle) end
    from public.attachements a
    cross join lateral private.proposition_lineaire(a.id) q
    join public.zones z on z.id = q.zone_id
    left join public.phases ph on ph.id = q.phase_id
   where a.id = p_attachement and a.statut = 'brouillon' and a.supprime_le is null
     and q.famille = p_famille and q.proposee <> 0
     and not exists (select 1
                       from public.attachement_lignes l
                       join public.attachements b on b.id = l.attachement_id and b.statut = 'brouillon' and b.supprime_le is null
                      where l.nature = 'lineaire' and l.prix_id = q.prix_id and l.zone_id = q.zone_id
                        and l.phase_id is not distinct from q.phase_id)
   order by z.numero, ph.ordre;
  get diagnostics _n = row_count;
  return _n;
end
$$;

-- -----------------------------------------------------------------------------
-- 8. Privilèges
-- -----------------------------------------------------------------------------
revoke execute on function
  private.lineaire_balaye_zones(uuid, date),
  private.prix_lineaire(uuid, public.famille_prix),
  private.proposition_lineaire(uuid, date),
  public.lineaire_a_attacher(uuid),
  public.ajouter_lineaire_attachement(uuid, public.famille_prix)
  from public, anon;
-- Appelées par v_attachement_lignes et les deux fonctions du panneau (droits de l'appelant ; la proposition ne
-- répond qu'à qui lit les attachements du marché).
grant execute on function
  private.lineaire_balaye_zones(uuid, date),
  private.prix_lineaire(uuid, public.famille_prix),
  private.proposition_lineaire(uuid, date),
  public.lineaire_a_attacher(uuid),
  public.ajouter_lineaire_attachement(uuid, public.famille_prix)
  to authenticated, service_role;
