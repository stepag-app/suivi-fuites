-- =============================================================================
-- Chantier v2, X3 (lot P3) : inventaire des fournitures posées.
--
-- Décisions d'Issam (2026-10-05, 2026-10-06, 2026-10-08) :
--  * les fournitures sont comprises dans les prix de réparation (CPS art. II-15) : l'inventaire
--    ne porte que des quantités, jamais de prix ni de montant ;
--  * pièces posées « réelles » : v_pieces_reelles (lot R, relue par le lot T), c'est-à-dire les
--    pièces du terrain ni remplacées ni retirées et les corrections du bureau (oubli, remplacement),
--    réparations et fuites non supprimées ;
--  * regroupement par article Dolibarr (reparation_pieces.produit_id, lot T) ; la famille est celle
--    du produit (préfixe de sa référence : RAC, CND, ROB, AEP, VRI…) ;
--  * page réservée au responsable et à l'administrateur : droit « quantités / lire » (comme les
--    contrôles de l'attachement), en plus de la RLS des pièces (« interventions / lire »).
--
-- Contenu :
--  1. v_inventaire_fournitures : une ligne par pièce de l'inventaire réel, avec le mois de la
--     réparation (heure du Maroc) ; security_invoker ;
--  2. resume_fournitures(marché, du, au) : quantités par article sur une période (widget du tableau
--     de bord, lot S6) ; SECURITY INVOKER, mêmes droits que la vue.
-- Aucune table ni aucun objet des sessions S1 et S2 n'est modifié.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Inventaire réel, une ligne par pièce
-- -----------------------------------------------------------------------------
create view public.v_inventaire_fournitures with (security_invoker = true) as
select
  p.id,
  p.marche_id,
  p.reparation_id,
  p.fuite_id,
  p.fuite_numero,
  p.reference_srm,
  p.realisee_le,
  p.jour,
  to_char(p.jour, 'YYYY-MM') as mois,
  p.zone_id,
  p.zone,
  p.secteur_id,
  p.secteur,
  p.equipe_id,
  p.equipe,
  p.produit_id,
  p.designation,
  p.famille,
  p.unite,
  p.quantite,
  p.provenance,
  p.nature_correction
from public.v_pieces_reelles p
where p.marche_id = any ((select private.marches_autorises('quantites', 'lire'))::uuid[]);

comment on view public.v_inventaire_fournitures is
  'Inventaire des fournitures posées (inventaire réel de v_pieces_reelles) : article Dolibarr, famille, quantité, provenance (terrain ou correction du bureau). Jamais de prix. Droit « quantités / lire ».';

grant select on public.v_inventaire_fournitures to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Quantités posées par article sur une période (jours de réparation à l'heure du Maroc,
--    bornes comprises ; borne nulle = sans limite). Pour le widget du tableau de bord (S6).
-- -----------------------------------------------------------------------------
create function public.resume_fournitures(p_marche_id uuid, p_du date default null, p_au date default null)
returns table (
  produit_id integer,
  designation text,
  famille text,
  unite text,
  quantite numeric,
  pieces integer,
  fuites integer,
  corrections integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.produit_id,
         min(i.designation),
         min(i.famille),
         i.unite,
         sum(i.quantite),
         count(*)::integer,
         count(distinct i.fuite_id)::integer,
         (count(*) filter (where i.provenance = 'correction'))::integer
    from public.v_inventaire_fournitures i
   where i.marche_id = p_marche_id
     and (p_du is null or i.jour >= p_du)
     and (p_au is null or i.jour <= p_au)
   group by i.produit_id, i.unite
   order by sum(i.quantite) desc, count(*) desc, min(i.designation)
$$;

comment on function public.resume_fournitures(uuid, date, date) is
  'Quantités posées par article Dolibarr sur une période (inventaire réel) : quantité, pièces, fuites, corrections du bureau. Droits de l''appelant (« quantités / lire »).';

revoke execute on function public.resume_fournitures(uuid, date, date) from public, anon;
grant execute on function public.resume_fournitures(uuid, date, date) to authenticated, service_role;
