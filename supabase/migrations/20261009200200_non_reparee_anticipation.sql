-- =============================================================================
-- Chantier v2, S2 / fichier 3 : réparation non réparée (P8) et attachement par
-- anticipation généralisé (A1). Contrat : docs/lots/chantier-v2-base-s2.md.
--
-- P8 (réponse d'Issam : « refus de l'abonné, et non réparée en général ») :
--  * une réparation « non réparée » garde son terrassement et ses travaux saisis : les
--    lignes de prix automatiques sont proposées comme pour une réparation faite
--    (terrassement dès qu'il y a une fouille, quel que soit le motif ; motifs.terrassement_paye
--    n'est plus consulté). private.v_prix_proposes suit la même règle ;
--  * réfection due : fouille sur un revêtement autre que terrain naturel (nature qui
--    nécessite une réfection, ou emplacement autre que terrain naturel sans nature) et aucune
--    réfection saisie, que la fuite soit réparée ou non : private.refection_due, vue
--    v_refections_dues (« réfections à faire »). Le statut de la fuite ne change pas
--    (« sans réparation » reste « sans réparation »).
--
-- A1 :
--  * case du marché « le maître d'ouvrage accepte l'attachement par anticipation » :
--    parametres_attachement.refection_anticipee (nom historique gardé : le panneau la lit) ;
--  * panier d'articles anticipables : prix.anticipable (par défaut : famille « refection » ou
--    article d'une nature de réfection) ;
--  * une unité fuite × article ne s'attache par anticipation que si rien n'en est encore
--    exécuté ni attaché (pas de seconde anticipation, pas d'anticipation d'un travail fait) ;
--  * v_propositions_anticipation : réfections dues dont l'article est anticipable, quantité
--    proposée = surface de fouille (L × l) ;
--  * exécution réelle : le solde exécuté − attaché (v_a_attacher) régularise (+ ou −), jamais
--    de double paiement ; en attente tant que l'exécution réelle manque (en_attente_execution) ;
--  * fuites_anticipees(marché) : fuites « Attaché par anticipation » en attente d'exécution
--    (badge « Anticipé », priorité), lisible par tout compte qui lit les fuites, sans quantités
--    ni prix.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. P8 : lignes automatiques d'une réparation non réparée
-- -----------------------------------------------------------------------------
create or replace function private.generer_lignes_reparation(p_reparation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _r public.reparations;
  _date date;
begin
  select * into _r from public.reparations where id = p_reparation;
  delete from public.lignes_quantites where reparation_id = p_reparation and origine = 'auto';
  if _r.id is null or _r.supprime_le is not null or _r.resultat = 'en_cours' then
    return;
  end if;
  _date := (_r.realisee_le at time zone 'Africa/Casablanca')::date;

  -- Terrassement : toute fouille saisie, réparée ou non (refus de l'abonné, sondage négatif…)
  perform private.ajouter_ligne_auto(_r.marche_id, _r.fuite_id, _r.id, null,
    private.prix_famille(_r.marche_id, 'terrassement'), _r.volume_m3, _date, false);

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

create or replace view private.v_prix_proposes with (security_invoker = true) as
select r.marche_id, r.fuite_id, r.id as reparation_id, null::uuid as refection_id, x.famille,
       (select p.id
          from public.prix p
         where p.marche_id = r.marche_id
           and p.famille = x.famille
           and p.actif
           and not p.hors_bordereau
           and (p.materiaux is null or x.materiau = any (p.materiaux))
           and (p.diametre_min_mm is null or x.diametre >= p.diametre_min_mm)
           and (p.diametre_max_mm is null or x.diametre <= p.diametre_max_mm)
         order by p.ordre, p.numero
         limit 1) as prix_id
  from public.reparations r
  cross join lateral (values
    ('terrassement'::public.famille_prix, null::text, null::integer,
       coalesce(r.volume_m3, 0) > 0),
    ('reparation_tuyau'::public.famille_prix, r.materiau::text, r.diametre_mm,
       r.tuyau_repare),
    ('robinet_pec'::public.famille_prix, null::text, null::integer,
       r.robinet_pec_change),
    ('collier_pec'::public.famille_prix, null::text, null::integer,
       r.collier_pec_change),
    ('bouche_a_cle'::public.famille_prix, null::text, null::integer,
       r.bouche_a_cle_mise_a_niveau and not (r.robinet_pec_change or r.collier_pec_change))
  ) x (famille, materiau, diametre, retenue)
 where r.supprime_le is null and r.resultat <> 'en_cours' and x.retenue
union all
select rf.marche_id, rf.fuite_id, rf.reparation_id, rf.id, 'refection'::public.famille_prix, n.prix_id
  from public.refections rf
  join public.natures_refection n on n.id = rf.nature_id
 where rf.supprime_le is null and rf.resultat = 'faite' and coalesce(rf.surface_m2, 0) > 0;

comment on column public.motifs.terrassement_paye is
  'Historique : depuis le chantier v2 (P8), le terrassement d''une réparation non réparée est toujours proposé ; plus consulté.';

-- -----------------------------------------------------------------------------
-- 2. P8 : réfections dues (y compris fuite non réparée)
-- -----------------------------------------------------------------------------
create view public.v_refections_dues with (security_invoker = true) as
select f.marche_id,
       f.id as fuite_id,
       f.numero as fuite_numero,
       f.reference_srm,
       f.adresse,
       f.statut,
       f.zone_id,
       f.secteur_id,
       r.id as reparation_id,
       r.resultat as resultat_reparation,
       r.realisee_le as reparee_le,
       r.equipe_id,
       r.emplacement,
       r.nature_revetement_id,
       n.code as nature_code,
       n.libelle_fr as nature_libelle_fr,
       n.libelle_ar as nature_libelle_ar,
       n.prix_id as prix_refection_id,
       r.fouille_longueur_m,
       r.fouille_largeur_m,
       round(r.fouille_longueur_m * r.fouille_largeur_m, 3) as surface_fouille_m2,
       ((now() at time zone 'Africa/Casablanca')::date - (r.realisee_le at time zone 'Africa/Casablanca')::date)
         as jours_depuis_reparation
  from public.fuites f
  cross join lateral (
    select rp.*
      from public.reparations rp
     where rp.fuite_id = f.id and rp.supprime_le is null and rp.resultat <> 'en_cours'
       and coalesce(rp.fouille_longueur_m, 0) > 0 and coalesce(rp.fouille_largeur_m, 0) > 0
     order by rp.realisee_le desc, rp.cree_le desc
     limit 1
  ) r
  left join public.natures_refection n on n.id = r.nature_revetement_id
 where f.supprime_le is null
   and f.statut <> 'achevee'
   and (case when n.id is not null then n.necessite_refection
             else coalesce(r.emplacement, 'autre') <> 'terrain_naturel' end)
   and not exists (select 1 from public.refections x where x.fuite_id = f.id and x.supprime_le is null);

comment on view public.v_refections_dues is
  'Réfections à faire : dernière fouille (réparée ou non réparée) sur un revêtement autre que terrain naturel, sans réfection saisie ; fuites non achevées.';

create function private.refection_due(p_fuite uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.v_refections_dues v where v.fuite_id = p_fuite)
$$;

-- -----------------------------------------------------------------------------
-- 3. A1 : panier d'articles anticipables
-- -----------------------------------------------------------------------------
alter table public.prix add column anticipable boolean;

update public.prix p
   set anticipable = p.famille = 'refection'
                     or exists (select 1 from public.natures_refection n where n.prix_id = p.id);

create function private.anticipable_par_defaut()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.anticipable := coalesce(new.anticipable, new.famille = 'refection');
  return new;
end
$$;
create trigger a_anticipable_par_defaut before insert on public.prix
  for each row execute function private.anticipable_par_defaut();

alter table public.prix alter column anticipable set default null,
                        alter column anticipable set not null;

comment on column public.prix.anticipable is
  'Panier d''anticipation : article attachable avant exécution (accord du maître d''ouvrage) ; par défaut les articles de réfection.';
comment on column public.parametres_attachement.refection_anticipee is
  'Case du marché « le maître d''ouvrage accepte l''attachement par anticipation » (tout article du panier, prix.anticipable).';

-- Copie : le panier suit les articles copiés (copier_parametres_terrain, fichier 1).
create or replace function private.copier_parametres_terrain(p_source uuid, p_cible uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.marches d
     set champs_obligatoires_fuite = s.champs_obligatoires_fuite
    from public.marches s
   where s.id = p_source and d.id = p_cible;

  insert into public.diametres_materiau (marche_id, materiau, diametre_mm, source, actif)
  select p_cible, x.materiau, x.diametre_mm, x.source, x.actif
    from public.diametres_materiau x where x.marche_id = p_source
  on conflict (marche_id, materiau, diametre_mm) do update
    set source = excluded.source, actif = excluded.actif;

  insert into public.representants_srm (id, marche_id, nom, ordre, actif)
  select md5(p_cible || ':' || r.id)::uuid, p_cible, r.nom, r.ordre, r.actif
    from public.representants_srm r where r.marche_id = p_source
  on conflict (marche_id, nom) do nothing;

  update public.prix d
     set anticipable = s.anticipable
    from public.prix s
   where s.marche_id = p_source and d.marche_id = p_cible and d.numero = s.numero
     and d.anticipable is distinct from s.anticipable;
end
$$;

-- -----------------------------------------------------------------------------
-- 4. A1 : contrôle des lignes d'anticipation
-- -----------------------------------------------------------------------------
-- Une unité déjà exécutée ou déjà attachée (lot arrêté) ne s'anticipe pas : renvoie la raison.
create function private.anticipation_impossible(p_fuite uuid, p_prix uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _lot integer;
begin
  if exists (select 1 from public.lignes_quantites l
              where l.fuite_id = p_fuite and l.prix_id = p_prix and l.supprime_le is null and l.quantite > 0) then
    return 'Travail déjà exécuté : attachez le solde, pas une anticipation';
  end if;
  select max(a.numero) into _lot
    from public.attachement_lignes al
    join public.attachements a on a.id = al.attachement_id and a.statut = 'arrete' and a.supprime_le is null
   where al.fuite_id = p_fuite and al.prix_id = p_prix and al.nature in ('solde', 'anticipation');
  if _lot is not null then
    return format('Déjà attaché (lot N° %s) : pas de seconde anticipation', _lot);
  end if;
  return null;
end
$$;

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
-- 5. A1 : solde exécuté − attaché ; en attente tant que l'exécution réelle manque
--    (réfection : aucune réfection saisie sur la fuite ; autre article : rien d'exécuté)
-- -----------------------------------------------------------------------------
create or replace view public.v_a_attacher with (security_invoker = true) as
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
),
etats as (
  select u.*,
         u.quantite_anticipee > 0
         and case when p.famille = 'refection' or exists (select 1 from public.natures_refection n where n.prix_id = p.id)
                  then not exists (select 1 from public.refections x where x.fuite_id = u.fuite_id and x.supprime_le is null)
                  else u.quantite_executee = 0 end as en_attente
    from unites u
    join public.prix p on p.id = u.prix_id
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
  -- Nom historique : vaut pour tout article attaché par anticipation (voir en_attente_execution)
  u.en_attente as en_attente_refection,
  case when u.en_attente then 0 else u.quantite_executee - u.quantite_attachee end as reste,
  u.dernier_lot,
  b.attachement_id as brouillon_id,
  u.en_attente as en_attente_execution,
  p.anticipable
from etats u
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

-- -----------------------------------------------------------------------------
-- 6. A1 : propositions anticipées pour un lot (colonne distincte du panneau)
-- -----------------------------------------------------------------------------
create view public.v_propositions_anticipation with (security_invoker = true) as
select d.marche_id,
       d.fuite_id,
       d.fuite_numero,
       d.reference_srm,
       d.adresse,
       d.statut,
       d.zone_id,
       d.secteur_id,
       d.reparation_id,
       d.resultat_reparation,
       d.reparee_le,
       d.nature_code,
       d.nature_libelle_fr,
       p.id as prix_id,
       p.numero as prix_numero,
       p.ordre as prix_ordre,
       p.designation as prix_designation,
       p.unite,
       d.surface_fouille_m2 as quantite_proposee,
       b.attachement_id as brouillon_id
  from public.v_refections_dues d
  join public.prix p on p.id = d.prix_refection_id and p.actif and p.anticipable
  join public.parametres_attachement pa on pa.marche_id = d.marche_id and pa.refection_anticipee
  left join lateral (
    select al.attachement_id
      from public.attachement_lignes al
      join public.attachements a on a.id = al.attachement_id and a.statut = 'brouillon' and a.supprime_le is null
     where al.fuite_id = d.fuite_id and al.prix_id = p.id and al.nature in ('solde', 'anticipation')
     order by a.cree_le
     limit 1
  ) b on true
 where d.surface_fouille_m2 > 0
   and private.anticipation_impossible(d.fuite_id, p.id) is null;

comment on view public.v_propositions_anticipation is
  'Propositions anticipées (A1) : réfection due dont l''article est dans le panier, rien d''exécuté ni d''attaché ; quantité proposée = surface de fouille ; brouillon_id si déjà cochée.';

-- -----------------------------------------------------------------------------
-- 7. A1 : fuites attachées par anticipation, en attente d'exécution (badge, priorité)
-- -----------------------------------------------------------------------------
create function public.fuites_anticipees(p_marche uuid)
returns table (
  fuite_id uuid,
  fuite_numero integer,
  premier_lot integer,
  attachee_le date,
  articles integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_marche is null
     or not (private.contexte_serveur() or p_marche = any (private.marches_autorises('fuites', 'lire'))) then
    raise exception 'Marché non autorisé' using errcode = 'insufficient_privilege';
  end if;
  return query
  select v.fuite_id, v.fuite_numero,
         min(a.numero)::integer as premier_lot,
         min(a.date_arret) as attachee_le,
         count(distinct v.prix_id)::integer as articles
    from public.v_a_attacher v
    join public.attachement_lignes al on al.fuite_id = v.fuite_id and al.prix_id = v.prix_id and al.nature = 'anticipation'
    join public.attachements a on a.id = al.attachement_id and a.statut = 'arrete' and a.supprime_le is null
   where v.marche_id = p_marche and v.en_attente_execution
   group by v.fuite_id, v.fuite_numero
   order by min(a.date_arret), v.fuite_numero;
end
$$;

comment on function public.fuites_anticipees(uuid) is
  'Fuites « Attaché par anticipation » dont l''exécution réelle manque (prioritaires) : {fuite_id, fuite_numero, premier_lot, attachee_le, articles} ; droit « fuites / lire », sans quantités ni prix.';

-- -----------------------------------------------------------------------------
-- 8. Privilèges
-- -----------------------------------------------------------------------------
grant select on public.v_refections_dues, public.v_propositions_anticipation to authenticated, service_role;
grant select on public.v_a_attacher to authenticated, service_role;
grant select on private.v_prix_proposes to authenticated, service_role;

revoke execute on function
  private.generer_lignes_reparation(uuid),
  private.refection_due(uuid),
  private.anticipable_par_defaut(),
  private.copier_parametres_terrain(uuid, uuid),
  private.anticipation_impossible(uuid, uuid),
  private.controler_ligne_attachement(),
  public.fuites_anticipees(uuid)
  from public, anon, authenticated;
grant execute on function
  private.refection_due(uuid),
  private.anticipation_impossible(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.fuites_anticipees(uuid) to authenticated, service_role;
