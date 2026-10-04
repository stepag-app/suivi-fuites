-- =============================================================================
-- v_anomalies : deux fausses anomalies révélées par le marché de démonstration.
--  * « Terrassement sans avis » : seulement s'il y a eu une fouille (fuite
--    réparée ou volume de fouille saisi), pas pour une fuite close sans
--    ouverture (réparée par le maître d'ouvrage, assainissement, refus).
--  * « Référence portée par une autre fuite » : la fuite d'origine n'est plus
--    signalée quand l'autre fuite est déclarée comme sa re-détection.
-- Colonnes inchangées ; le reste de la vue est repris tel quel.
-- =============================================================================

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
  from rep
 where rep.jalons_client and rep.avis_terrassement_srm_le is null
   and (rep.resultat = 'reparee' or coalesce(rep.volume_m3, 0) > 0)
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
        and g.fuite_liee_id is distinct from f.id
   );
