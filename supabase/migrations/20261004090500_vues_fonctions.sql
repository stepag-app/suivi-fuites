-- =============================================================================
-- Migration 1 / fichier 6 : vues de travail (listes, alertes, anomalies,
-- pièces posées, quantités) et fonction de recherche de re-détection.
-- Toutes les vues sont en security_invoker : elles appliquent la RLS de
-- l'utilisateur qui les interroge.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Liste des fuites avec alertes (base de la liste tablette, du panneau et des exports)
-- -----------------------------------------------------------------------------
create view public.v_fuites with (security_invoker = true) as
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
  (f.date_communication_srm is null
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

-- -----------------------------------------------------------------------------
-- Pièces posées, filtrables par secteur, zone, période, équipe, chef.
-- -----------------------------------------------------------------------------
create view public.v_pieces_posees with (security_invoker = true) as
select
  rp.id,
  rp.marche_id,
  rp.reparation_id,
  r.fuite_id,
  f.numero as fuite_numero,
  f.reference_srm,
  f.zone_id,
  z.libelle as zone,
  f.secteur_id,
  s.libelle as secteur,
  r.equipe_id,
  e.libelle as equipe,
  r.auteur_terrain_id as chef_id,
  pc.nom_complet as chef,
  r.realisee_le,
  (r.realisee_le at time zone 'Africa/Casablanca')::date as jour,
  rp.piece_id,
  coalesce(cp.designation, rp.designation_libre) as designation,
  cp.famille,
  coalesce(cp.unite, 'u') as unite,
  rp.quantite
from public.reparation_pieces rp
join public.reparations r on r.id = rp.reparation_id and r.supprime_le is null
join public.fuites f on f.id = r.fuite_id and f.supprime_le is null
left join public.catalogue_pieces cp on cp.id = rp.piece_id
left join public.zones z on z.id = f.zone_id
left join public.secteurs s on s.id = f.secteur_id
left join public.equipes e on e.id = r.equipe_id
left join public.profils pc on pc.id = r.auteur_terrain_id
where rp.supprime_le is null;

-- -----------------------------------------------------------------------------
-- Quantités par prix (montants au prix du bordereau, avant majoration :
-- la majoration s'applique au total de la facture, migration 3).
-- -----------------------------------------------------------------------------
create view public.v_quantites with (security_invoker = true) as
select
  l.id,
  l.marche_id,
  l.fuite_id,
  f.numero as fuite_numero,
  f.reference_srm,
  f.origine,
  f.zone_id,
  z.libelle as zone,
  f.secteur_id,
  s.libelle as secteur,
  coalesce(r.equipe_id, rf.equipe_id) as equipe_id,
  l.reparation_id,
  l.refection_id,
  l.prix_id,
  p.numero as prix_numero,
  p.ordre as prix_ordre,
  p.designation as prix_designation,
  p.unite,
  p.hors_bordereau,
  l.quantite,
  p.pu_ht,
  round(l.quantite * p.pu_ht, 2) as montant_ht_bordereau,
  l.date_execution,
  l.origine as origine_ligne,
  l.commentaire
from public.lignes_quantites l
join public.prix p on p.id = l.prix_id
join public.fuites f on f.id = l.fuite_id and f.supprime_le is null
left join public.zones z on z.id = f.zone_id
left join public.secteurs s on s.id = f.secteur_id
left join public.reparations r on r.id = l.reparation_id
left join public.refections rf on rf.id = l.refection_id
where l.supprime_le is null;

-- -----------------------------------------------------------------------------
-- Anomalies à vérifier par le responsable (contrôles du marché, non bloquants).
-- -----------------------------------------------------------------------------
create view public.v_anomalies with (security_invoker = true) as
with rep as (
  select r.*, f.numero, f.date_detection, f.avis_terrassement_srm_le
    from public.reparations r
    join public.fuites f on f.id = r.fuite_id and f.supprime_le is null
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
       'Terrassement sans avis préalable de la SRM enregistré'
  from rep where rep.avis_terrassement_srm_le is null
union all
select rf.marche_id, rf.fuite_id, f.numero, rf.reparation_id, 'refection_avant_reparation',
       'Date de réfection antérieure à la date de réparation'
  from public.refections rf
  join public.reparations r on r.id = rf.reparation_id
  join public.fuites f on f.id = rf.fuite_id and f.supprime_le is null
 where rf.supprime_le is null and rf.realisee_le < r.realisee_le
union all
select f.marche_id, f.id, f.numero, null::uuid, 'reference_srm_format',
       format('Référence « %s » hors format NNN-NNN-NNN', f.reference_srm)
  from public.fuites f
 where f.supprime_le is null and f.reference_srm is not null
   and f.reference_srm !~ '^\d{3}-\d{3}-\d{3}$'
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

grant select on public.v_fuites, public.v_pieces_posees, public.v_quantites, public.v_anomalies
  to authenticated;

-- -----------------------------------------------------------------------------
-- Re-détection : fuites du marché dans le rayon paramétré ou de même référence.
-- Appelée par la tablette avant d'enregistrer une nouvelle fuite.
-- -----------------------------------------------------------------------------
create function public.rechercher_fuites_proches(
  p_marche uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_reference text default null,
  p_rayon_m integer default null
)
returns table (
  id uuid,
  numero integer,
  reference_srm text,
  statut public.statut_fuite,
  date_detection timestamptz,
  distance_m double precision,
  meme_reference boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with point as (
    select extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography as g
  ),
  rayon as (
    select coalesce(p_rayon_m, m.rayon_redetection_m) as r
      from public.marches m where m.id = p_marche
  )
  select f.id, f.numero, f.reference_srm, f.statut, f.date_detection,
         case when f.position is not null and p_latitude is not null
              then extensions.st_distance(f.position, point.g) end as distance_m,
         (p_reference is not null and f.reference_srm = p_reference) as meme_reference
    from public.fuites f, point, rayon
   where f.marche_id = p_marche
     and f.supprime_le is null
     and (
       (p_latitude is not null and f.position is not null
          and extensions.st_dwithin(f.position, point.g, rayon.r))
       or (p_reference is not null and f.reference_srm = p_reference)
     )
   order by distance_m nulls last
$$;

revoke execute on function public.rechercher_fuites_proches(uuid, double precision, double precision, text, integer)
  from public, anon;
grant execute on function public.rechercher_fuites_proches(uuid, double precision, double precision, text, integer)
  to authenticated;
