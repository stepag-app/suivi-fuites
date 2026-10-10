-- =============================================================================
-- Chantier v3, S12 (E1) : la notion d'équipe disparaît des vues et des fonctions.
--
-- Décision d'Issam (2026-10-10, docs/lots/chantier-v3.md § 0) : l'équipe, c'est le compte du
-- chef d'équipe (identifiant et mot de passe) ; plus de numéro d'équipe. Le chef d'équipe est le
-- compte qui a saisi le travail (auteur_terrain_id), désigné par son matricule dans les
-- documents (R4, côté panneau). Regroupements « par équipe » → « par chef d'équipe »
-- (réparation, réfection) ou « par agent » (détection, balayage).
--
-- Pas de suppression (E4, S21) : la table equipes, le type type_equipe et les colonnes equipe_id
-- de fuites, reparations, refections et balayages restent, vides et inutilisées, tant qu'une
-- APK plus ancienne peut encore les envoyer. Aucune vue ne les lit plus : E4 se réduira à des
-- « drop column » et « drop table ».
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Équipes désactivées : une APK déjà installée n'affiche plus le choix de l'équipe
--    (liste vide après le rafraîchissement de ses paramètres), donc n'envoie plus equipe_id.
-- -----------------------------------------------------------------------------
update public.equipes set actif = false where actif;
update public.libelles_listes set actif = false where liste = 'type_equipe' and actif;

-- -----------------------------------------------------------------------------
-- 2. Regroupements et modèles d'export : équipe → chef d'équipe
-- -----------------------------------------------------------------------------
alter table public.parametres_attachement drop constraint parametres_attachement_regroupement_check;
update public.parametres_attachement set regroupement = 'chef' where regroupement = 'equipe';
alter table public.parametres_attachement add constraint parametres_attachement_regroupement_check
  check (regroupement in ('poste', 'zone', 'secteur', 'chef'));

alter table public.modeles_export drop constraint modeles_export_regroupement_check;
update public.modeles_export set regroupement = 'chef' where regroupement = 'equipe';
alter table public.modeles_export add constraint modeles_export_regroupement_check
  check (regroupement in ('aucun', 'zone', 'secteur', 'chef', 'article', 'jour', 'categorie', 'piece'));

-- Colonnes « Équipe » des modèles remplacées par le chef d'équipe (sans doublon, ordre gardé) ;
-- le filtre par équipe (identifiant d'une équipe) n'a plus de sens.
update public.modeles_export e
   set colonnes = (
     select coalesce(array_agg(d.c order by d.i), '{}')
       from (select distinct on (u.c) u.c, u.i
               from unnest(case e.jeu
                             when 'fuites' then array_remove(array_replace(e.colonnes, 'equipe_reparation', 'chef_reparation'), 'equipe')
                             when 'pieces' then array_replace(e.colonnes, 'equipe', 'chef')
                             when 'attachement' then array_replace(e.colonnes, 'equipe', 'chef_equipe')
                             else array_remove(e.colonnes, 'equipe')
                           end) with ordinality u (c, i)
              order by u.c, u.i) d)
 where e.colonnes && array['equipe', 'equipe_reparation'];
update public.modeles_export set filtres = filtres - 'equipe' where filtres ? 'equipe';

-- -----------------------------------------------------------------------------
-- 3. Vues : celles qui exposaient une équipe sont recréées sans elle (dépendantes d'abord)
-- -----------------------------------------------------------------------------
drop view public.v_propositions_anticipation;
drop view public.v_refections_dues;
drop view public.v_attachement_recap;
drop view public.v_attachement_lignes;
drop view public.v_a_attacher;
drop view public.v_inventaire_fournitures;
drop view public.v_pieces_posees;
drop view public.v_pieces_reelles;
drop view public.v_fuites_export;
drop view public.v_fuites;
drop view public.v_quantites;
drop view public.v_balayage_journalier;

-- v_fuites : corps de 20261004180100 sans l'équipe (l'agent de détection reste : detectee_par).
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

-- v_fuites_export : corps de 20261006140000 ; chef d'équipe de la dernière réparation (nom et
-- compte, pour le matricule des documents) à la place de l'équipe.
create view public.v_fuites_export with (security_invoker = true) as
select
  v.*,
  r.realisee_le as reparation_le,
  r.resultat as resultat_reparation,
  r.ouvrage as ouvrage_constate,
  r.materiau,
  r.diametre_mm,
  r.fouille_longueur_m,
  r.fouille_largeur_m,
  r.fouille_profondeur_m,
  r.volume_m3,
  r.longueur_pe_m,
  r.tuyau_repare,
  r.robinet_pec_change,
  r.collier_pec_change,
  r.bouche_a_cle_mise_a_niveau,
  r.representant_srm as representant_client,
  r.auteur_terrain_id as chef_reparation_id,
  pc.nom_complet as chef_reparation,
  nr.libelle_fr as revetement,
  nr.libelle_ar as revetement_ar,
  rf.realisee_le as refection_le,
  rf.resultat as resultat_refection,
  nf.libelle_fr as nature_refection,
  nf.libelle_ar as nature_refection_ar,
  rf.surface_m2 as surface_refection_m2,
  pp.pieces as pieces_posees,
  q.quantites
from public.v_fuites v
left join lateral (
  select rp.realisee_le, rp.resultat, rp.ouvrage, rp.materiau, rp.diametre_mm, rp.fouille_longueur_m,
         rp.fouille_largeur_m, rp.fouille_profondeur_m, rp.volume_m3, rp.longueur_pe_m, rp.tuyau_repare,
         rp.robinet_pec_change, rp.collier_pec_change, rp.bouche_a_cle_mise_a_niveau, rp.representant_srm,
         rp.auteur_terrain_id, rp.nature_revetement_id
    from public.reparations rp
   where rp.fuite_id = v.id and rp.supprime_le is null
   order by rp.realisee_le desc
   limit 1
) r on true
left join public.profils pc on pc.id = r.auteur_terrain_id
left join public.natures_refection nr on nr.id = r.nature_revetement_id
left join lateral (
  select x.realisee_le, x.resultat, x.nature_id, x.surface_m2
    from public.refections x
   where x.fuite_id = v.id and x.supprime_le is null
   order by x.realisee_le desc
   limit 1
) rf on true
left join public.natures_refection nf on nf.id = rf.nature_id
left join lateral (
  select string_agg(coalesce(d.designation, p.designation_libre) || ' × ' || trim_scale(p.quantite), ' ; '
                    order by coalesce(d.designation, p.designation_libre)) as pieces
    from public.reparation_pieces p
    join public.reparations rr on rr.id = p.reparation_id and rr.supprime_le is null
    left join public.produits_dolibarr d on d.dolibarr_id = p.produit_id
   where rr.fuite_id = v.id and p.supprime_le is null and p.etat = 'posee'
) pp on true
left join lateral (
  select string_agg(format('P%s : %s %s', s.numero, trim_scale(s.total), s.unite), ' ; ' order by s.ordre, s.numero) as quantites
    from (
      select px.numero, px.ordre, px.unite, sum(l.quantite) as total
        from public.lignes_quantites l
        join public.prix px on px.id = l.prix_id
       where l.fuite_id = v.id and l.supprime_le is null
       group by px.numero, px.ordre, px.unite
    ) s
) q on true;

-- v_quantites : corps de 20261006100100 ; chef d'équipe (compte de la réparation, sinon de la
-- réfection) à la place de l'équipe, pour le filtre des exports.
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
  coalesce(r.auteur_terrain_id, rf.auteur_terrain_id) as chef_equipe_id,
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
  l.commentaire,
  l.motif_correction,
  l.corrigee_par,
  l.corrigee_le,
  l.prix_initial_id
from public.lignes_quantites l
join public.prix p on p.id = l.prix_id
join public.fuites f on f.id = l.fuite_id and f.supprime_le is null
left join public.zones z on z.id = f.zone_id
left join public.secteurs s on s.id = f.secteur_id
left join public.reparations r on r.id = l.reparation_id
left join public.refections rf on rf.id = l.refection_id
where l.supprime_le is null;

-- Inventaire réel des fournitures posées : corps de 20261006140000 sans l'équipe (le chef
-- d'équipe, compte de la réparation, y était déjà).
create view public.v_pieces_reelles with (security_invoker = true) as
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
  r.auteur_terrain_id as chef_id,
  pc.nom_complet as chef,
  r.realisee_le,
  (r.realisee_le at time zone 'Africa/Casablanca')::date as jour,
  rp.produit_id,
  coalesce(d.designation, rp.designation_libre) as designation,
  d.famille,
  coalesce(d.unite, 'u') as unite,
  rp.quantite,
  rp.provenance,
  rp.nature_correction,
  rp.motif_correction,
  rp.saisi_par,
  ps.nom_complet as saisi_par_nom,
  rp.cree_le as saisi_le,
  rp.remplace_piece_id,
  coalesce(da.designation, pa.designation_libre) as designation_remplacee,
  pa.quantite as quantite_remplacee
from public.reparation_pieces rp
join public.reparations r on r.id = rp.reparation_id and r.supprime_le is null
join public.fuites f on f.id = r.fuite_id and f.supprime_le is null
left join public.produits_dolibarr d on d.dolibarr_id = rp.produit_id
left join public.zones z on z.id = f.zone_id
left join public.secteurs s on s.id = f.secteur_id
left join public.profils pc on pc.id = r.auteur_terrain_id
left join public.profils ps on ps.id = rp.saisi_par
left join public.reparation_pieces pa on pa.id = rp.remplace_piece_id
left join public.produits_dolibarr da on da.dolibarr_id = pa.produit_id
where rp.supprime_le is null and rp.etat = 'posee';

create view public.v_pieces_posees with (security_invoker = true) as
select
  id, marche_id, reparation_id, fuite_id, fuite_numero, reference_srm, zone_id, zone, secteur_id, secteur,
  chef_id, chef, realisee_le, jour, produit_id, designation, famille, unite, quantite,
  provenance, nature_correction, motif_correction
from public.v_pieces_reelles;

-- Inventaire des fournitures : corps de 20261009300000, par chef d'équipe au lieu de l'équipe.
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
  p.chef_id,
  p.chef,
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
  'Inventaire des fournitures posées (inventaire réel de v_pieces_reelles) : article Dolibarr, famille, quantité, provenance (terrain ou correction du bureau), chef d''équipe. Jamais de prix. Droit « quantités / lire ».';

-- À attacher : corps de 20261009200200 ; chef d'équipe de la dernière réparation.
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
  r.auteur_terrain_id as chef_equipe_id,
  pc.nom_complet as chef_equipe,
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
  select rp.realisee_le, rp.auteur_terrain_id
    from public.reparations rp
   where rp.fuite_id = f.id and rp.supprime_le is null
   order by rp.realisee_le desc
   limit 1
) r on true
left join public.profils pc on pc.id = r.auteur_terrain_id
left join lateral (
  select max(x.realisee_le) as realisee_le, count(*) as nombre
    from public.refections x
   where x.fuite_id = f.id and x.supprime_le is null
) rf on true
left join brouillons b on b.fuite_id = u.fuite_id and b.prix_id = u.prix_id;

-- Détail des lignes d'un lot : corps de 20261004200000 ; chef d'équipe de la dernière réparation.
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

-- Récapitulatif par lot et par article : corps de 20261004200000, inchangé (recréé avec
-- v_attachement_lignes).
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

-- Réfections dues : corps de 20261009200200 ; chef d'équipe de la réparation à la place de l'équipe.
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
       r.validee_le as reparation_validee_le,
       r.auteur_terrain_id as chef_equipe_id,
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
    select rp.id, rp.resultat, rp.realisee_le, rp.validee_le, rp.auteur_terrain_id, rp.emplacement,
           rp.nature_revetement_id, rp.fouille_longueur_m, rp.fouille_largeur_m, rp.cree_le
      from public.reparations rp
     where rp.fuite_id = f.id and rp.supprime_le is null and private.refection_attendue(rp.id)
     order by rp.realisee_le desc, rp.cree_le desc
     limit 1
  ) r
  left join public.natures_refection n on n.id = r.nature_revetement_id
 where f.supprime_le is null
   and f.statut <> 'achevee'
   and not exists (select 1 from public.refections x
                    where x.fuite_id = f.id and x.supprime_le is null and x.cree_le >= r.cree_le);

comment on view public.v_refections_dues is
  'Réfections à faire, validées ou non : dernière réparation (réparée, ou non réparée avec fouille) hors terrain naturel sur un revêtement à refaire, sans réfection saisie depuis ; fuites non achevées.';

-- Propositions anticipées : corps de 20261009200200, inchangé (recréé avec v_refections_dues).
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

-- Rapport journalier de détection : par jour, agent, zone et secteur (corps de 20261006130000,
-- sans l'équipe) : tronçons et linéaire en premier passage (payés), linéaire repassé, nœuds à
-- moins de 1 m d'une extrémité d'un tronçon balayé ce jour (tous passages), fuites détectées ce
-- jour dans le secteur.
create view public.v_balayage_journalier with (security_invoker = true) as
select
  g.marche_id,
  g.date_balayage,
  g.agent_id,
  p.nom_complet as agent,
  g.zone_id,
  z.libelle as zone,
  g.secteur_id,
  s.libelle as secteur,
  g.nb_troncons,
  g.lineaire_m,
  g.lineaire_repasse_m,
  coalesce(nn.nb_noeuds, 0)::integer as nb_noeuds,
  coalesce(f.nb_fuites, 0)::integer as nb_fuites
from (
  select b.marche_id, b.date_balayage, b.agent_id, t.zone_id, t.secteur_id,
         (count(distinct t.id) filter (where b.premier_passage))::integer as nb_troncons,
         coalesce(sum(t.longueur_m) filter (where b.premier_passage), 0)::numeric(12,2) as lineaire_m,
         coalesce(sum(t.longueur_m) filter (where not b.premier_passage), 0)::numeric(12,2) as lineaire_repasse_m
    from public.balayages b
    join public.troncons t on t.id = b.troncon_id
   where b.annule_le is null
   group by b.marche_id, b.date_balayage, b.agent_id, t.zone_id, t.secteur_id
) g
left join public.profils p on p.id = g.agent_id
left join public.zones z on z.id = g.zone_id
left join public.secteurs s on s.id = g.secteur_id
left join (
  select b.marche_id, b.date_balayage, b.agent_id, t.zone_id, t.secteur_id,
         count(distinct x.noeud_id) as nb_noeuds
    from public.balayages b
    join public.troncons t on t.id = b.troncon_id
    cross join lateral private.noeuds_extremites(t.id) x (noeud_id)
   where b.annule_le is null
   group by b.marche_id, b.date_balayage, b.agent_id, t.zone_id, t.secteur_id
) nn
  on nn.marche_id = g.marche_id
 and nn.date_balayage = g.date_balayage
 and nn.agent_id is not distinct from g.agent_id
 and nn.zone_id is not distinct from g.zone_id
 and nn.secteur_id is not distinct from g.secteur_id
left join lateral (
  select count(*) as nb_fuites
    from public.fuites f
   where g.secteur_id is not null
     and f.marche_id = g.marche_id
     and f.secteur_id = g.secteur_id
     and f.supprime_le is null
     and (f.date_detection at time zone 'Africa/Casablanca')::date = g.date_balayage
) f on true;

grant select on
  public.v_fuites, public.v_fuites_export, public.v_quantites, public.v_pieces_reelles, public.v_pieces_posees,
  public.v_inventaire_fournitures, public.v_a_attacher, public.v_attachement_lignes, public.v_attachement_recap,
  public.v_refections_dues, public.v_propositions_anticipation, public.v_balayage_journalier
  to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Vues qui lisaient equipe_id sans l'exposer (« r.* », « x.* ») : mêmes colonnes, liste
--    explicite, pour que plus rien ne dépende de la colonne (E4)
-- -----------------------------------------------------------------------------

-- Réfections à faire (V7) : corps de 20261009100200.
create or replace view public.v_a_refectionner with (security_invoker = true) as
select
  f.id as fuite_id,
  f.marche_id,
  f.numero as fuite_numero,
  f.reference_srm,
  f.adresse,
  f.secteur_id,
  f.statut,
  extensions.st_y(f.position::extensions.geometry) as latitude,
  extensions.st_x(f.position::extensions.geometry) as longitude,
  r.id as reparation_id,
  r.realisee_le as reparee_le,
  r.validee_le as reparation_validee_le,
  r.emplacement,
  r.nature_revetement_id,
  r.fouille_longueur_m,
  r.fouille_largeur_m
from public.fuites f
join lateral (
  select x.id, x.realisee_le, x.validee_le, x.emplacement, x.nature_revetement_id, x.fouille_longueur_m,
         x.fouille_largeur_m, x.cree_le
    from public.reparations x
   where x.fuite_id = f.id and x.supprime_le is null and x.validee_le is not null
     and private.refection_attendue(x.id)
   order by x.realisee_le desc
   limit 1
) r on true
where f.supprime_le is null
  and not exists (select 1 from public.refections rf
                   where rf.fuite_id = f.id and rf.supprime_le is null and rf.cree_le >= r.cree_le);

-- Anomalies : corps de 20261006100100.
create or replace view public.v_anomalies with (security_invoker = true) as
with rep as (
  select r.id, r.marche_id, r.fuite_id, r.resultat, r.motif_id, r.realisee_le, r.auteur_terrain_id, r.saisi_par,
         r.source_saisie, r.ouvrage, r.materiau, r.diametre_mm, r.representant_srm, r.representant_srm_id,
         r.tuyau_repare, r.robinet_pec_change, r.collier_pec_change, r.bouche_a_cle_mise_a_niveau,
         r.element_remplace, r.longueur_pe_m, r.fouille_longueur_m, r.fouille_largeur_m, r.fouille_profondeur_m,
         r.volume_m3, r.emplacement, r.nature_revetement_id, r.observation, r.cree_le, r.modifie_le,
         r.supprime_le, r.supprime_par, r.validee_le, r.validee_par,
         f.numero, f.date_detection, f.avis_terrassement_srm_le, m.jalons_client, m.longueur_pe_max_m
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
  from rep where rep.longueur_pe_m > rep.longueur_pe_max_m
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

-- Contrôles de l'attachement : corps de 20261006140000.
create or replace view public.v_controles_attachement with (security_invoker = true) as
with rep as (
  select r.id, r.marche_id, r.fuite_id, r.resultat, r.motif_id, r.realisee_le, r.auteur_terrain_id, r.saisi_par,
         r.source_saisie, r.ouvrage, r.materiau, r.diametre_mm, r.representant_srm, r.representant_srm_id,
         r.tuyau_repare, r.robinet_pec_change, r.collier_pec_change, r.bouche_a_cle_mise_a_niveau,
         r.element_remplace, r.longueur_pe_m, r.fouille_longueur_m, r.fouille_largeur_m, r.fouille_profondeur_m,
         r.volume_m3, r.emplacement, r.nature_revetement_id, r.observation, r.cree_le, r.modifie_le,
         r.supprime_le, r.supprime_par, r.validee_le, r.validee_par,
         f.numero as fuite_numero, f.statut as statut_fuite, m.longueur_pe_max_m
    from public.reparations r
    join public.fuites f on f.id = r.fuite_id and f.supprime_le is null
    join public.marches m on m.id = r.marche_id
   where r.supprime_le is null
),
derniere_reparee as (
  select distinct on (rep.fuite_id) rep.fuite_id, rep.id, rep.marche_id, rep.fuite_numero
    from rep
   where rep.resultat = 'reparee'
   order by rep.fuite_id, rep.realisee_le desc
),
pieces_pec as (
  select r.fuite_id, px.famille, string_agg(distinct d.designation, ', ' order by d.designation) as designations
    from public.reparation_pieces rp
    join public.reparations r on r.id = rp.reparation_id and r.supprime_le is null
    join public.produits_dolibarr d on d.dolibarr_id = rp.produit_id
    join public.prix px on px.id = private.article_suggere(rp.marche_id, rp.produit_id)
   where rp.supprime_le is null and rp.etat = 'posee' and px.famille in ('robinet_pec', 'collier_pec')
   group by r.fuite_id, px.famille
),
cases_pec as (
  select rep.fuite_id,
         bool_or(rep.robinet_pec_change) as robinet,
         bool_or(rep.collier_pec_change) as collier
    from rep
   where rep.resultat = 'reparee'
   group by rep.fuite_id
),
sans_article as (
  select rep.id
    from rep
   where rep.resultat = 'reparee' and rep.tuyau_repare
     and exists (
       select 1 from private.v_prix_proposes pp
        where pp.reparation_id = rep.id and pp.refection_id is null
          and pp.famille = 'reparation_tuyau' and pp.prix_id is null
     )
     and not exists (
       select 1 from public.lignes_quantites l
         join public.prix p on p.id = l.prix_id
        where l.reparation_id = rep.id and l.supprime_le is null
          and (p.famille = 'reparation_tuyau' or p.hors_bordereau)
     )
),
controles as (
  -- Robinet / collier PEC : pièce posée sans la case, ou case sans la pièce
  select d.marche_id, d.fuite_id, d.fuite_numero, d.id as reparation_id, null::uuid as ligne_id,
         'robinet_pec_non_coche'::text as controle, 'avertissement'::text as gravite,
         'Robinet PEC posé, case « Robinet PEC changé » non cochée'::text as libelle,
         'Pièces posées : ' || pp.designations as detail, null::numeric as excedent, null::text as unite
    from derniere_reparee d
    join pieces_pec pp on pp.fuite_id = d.fuite_id and pp.famille = 'robinet_pec'
    join cases_pec c on c.fuite_id = d.fuite_id
   where not c.robinet
  union all
  select rep.marche_id, rep.fuite_id, rep.fuite_numero, rep.id, null,
         'robinet_pec_sans_piece', 'avertissement',
         'Case « Robinet PEC changé » cochée sans robinet PEC dans les pièces posées',
         'Ajouter la pièce posée (article Dolibarr) ou décocher la case', null, null
    from rep
   where rep.resultat = 'reparee' and rep.robinet_pec_change
     and not exists (select 1 from pieces_pec pp where pp.fuite_id = rep.fuite_id and pp.famille = 'robinet_pec')
  union all
  select d.marche_id, d.fuite_id, d.fuite_numero, d.id, null,
         'collier_pec_non_coche', 'avertissement',
         'Collier PEC posé, case « Collier PEC changé » non cochée',
         'Pièces posées : ' || pp.designations, null, null
    from derniere_reparee d
    join pieces_pec pp on pp.fuite_id = d.fuite_id and pp.famille = 'collier_pec'
    join cases_pec c on c.fuite_id = d.fuite_id
   where not c.collier
  union all
  select rep.marche_id, rep.fuite_id, rep.fuite_numero, rep.id, null,
         'collier_pec_sans_piece', 'avertissement',
         'Case « Collier PEC changé » cochée sans collier PEC dans les pièces posées',
         'Ajouter la pièce posée (article Dolibarr) ou décocher la case', null, null
    from rep
   where rep.resultat = 'reparee' and rep.collier_pec_change
     and not exists (select 1 from pieces_pec pp where pp.fuite_id = rep.fuite_id and pp.famille = 'collier_pec')
  union all
  -- Fouille sans volume sur une réparation réussie
  select rep.marche_id, rep.fuite_id, rep.fuite_numero, rep.id, null,
         'fouille_sans_volume', 'avertissement',
         'Réparation réussie sans volume de fouille',
         format('Fouille L × l × p : %s × %s × %s m',
                coalesce(private.nombre_fr(rep.fouille_longueur_m), '?'),
                coalesce(private.nombre_fr(rep.fouille_largeur_m), '?'),
                coalesce(private.nombre_fr(rep.fouille_profondeur_m), '?')),
         null, null
    from rep
   where rep.resultat = 'reparee' and coalesce(rep.volume_m3, 0) = 0
  union all
  -- Réparation réussie sans aucune ligne de prix de réparation (hors terrassement et réfection)
  select d.marche_id, d.fuite_id, d.fuite_numero, d.id, null,
         'reparation_sans_prix', 'avertissement',
         'Réparation réussie sans aucune ligne de prix de réparation',
         'Vérifier les travaux cochés (tuyau, robinet, collier, bouche à clé) ou ajouter la ligne', null, null
    from derniere_reparee d
   where not exists (
           select 1 from public.lignes_quantites l
             join public.prix p on p.id = l.prix_id
            where l.fuite_id = d.fuite_id and l.supprime_le is null
              and (p.hors_bordereau or p.famille not in ('terrassement', 'refection', 'balayage', 'maintien'))
         )
     and not exists (select 1 from rep x join sans_article s on s.id = x.id where x.fuite_id = d.fuite_id)
  union all
  -- Réfection ni faite ni close (motif) après le délai du marché : mêmes seuils que les
  -- alertes de v_fuites (chaussée : délai de réfection ; ailleurs : délai trottoir)
  select f.marche_id, f.id, f.numero, r.id, null,
         'refection_hors_delai', 'avertissement',
         'Réfection ni faite ni close (motif) après le délai du marché',
         format('Réparée le %s, délai de %s jours',
                to_char(r.realisee_le at time zone 'Africa/Casablanca', 'DD/MM/YYYY'),
                case when r.emplacement = 'chaussee' then m.delai_refection_chaussee_j else m.delai_alerte_refection_trottoir_j end),
         null, null
    from public.fuites f
    join public.marches m on m.id = f.marche_id
    join lateral (
      select rp.id, rp.realisee_le, rp.emplacement
        from public.reparations rp
       where rp.fuite_id = f.id and rp.supprime_le is null
       order by rp.realisee_le desc
       limit 1
    ) r on true
   where f.supprime_le is null and f.statut = 'reparee'
     and now() - r.realisee_le > make_interval(days => case when r.emplacement = 'chaussee'
                                                             then m.delai_refection_chaussee_j
                                                             else m.delai_alerte_refection_trottoir_j end)
  union all
  -- Ligne manuelle dont l'article diffère de ce que propose la règle, sans motif
  select l.marche_id, l.fuite_id, f.numero, l.reparation_id, l.id,
         'ligne_incoherente', 'alerte',
         'Article retenu différent de celui que propose la règle pour les mesures saisies, sans motif',
         format('Prix %s retenu ; la règle propose : %s', p.numero,
                coalesce(prop.numeros, 'aucun article')),
         null, null
    from public.lignes_quantites l
    join public.fuites f on f.id = l.fuite_id and f.supprime_le is null
    join public.prix p on p.id = l.prix_id
    left join lateral (
      select string_agg(distinct 'prix ' || px.numero, ', ' order by 'prix ' || px.numero) as numeros,
             bool_or(pp.prix_id = l.prix_id) as couvert
        from private.v_prix_proposes pp
        left join public.prix px on px.id = pp.prix_id
       where case
               when l.refection_id is not null then pp.refection_id = l.refection_id
               when l.reparation_id is not null then pp.reparation_id = l.reparation_id and pp.refection_id is null
               else pp.fuite_id = l.fuite_id
             end
    ) prop on true
   where l.supprime_le is null and l.origine = 'manuel'
     and nullif(btrim(l.motif_correction), '') is null
     and not coalesce(prop.couvert, false)
  union all
  -- Polyéthylène au-delà du seuil du marché (marches.longueur_pe_max_m, 2 m par défaut, Q-12)
  select rep.marche_id, rep.fuite_id, rep.fuite_numero, rep.id, null,
         'pe_superieur_2m', 'information',
         format('Polyéthylène au-delà de %s m : excédent hors bordereau, à faire valoir', private.nombre_fr(rep.longueur_pe_max_m)),
         format('%s m posés : %s m au-delà des %s m couverts par l''article de réparation',
                private.nombre_fr(rep.longueur_pe_m), private.nombre_fr(rep.longueur_pe_m - rep.longueur_pe_max_m),
                private.nombre_fr(rep.longueur_pe_max_m)),
         rep.longueur_pe_m - rep.longueur_pe_max_m, 'm'
    from rep
   where rep.resultat = 'reparee' and rep.materiau = 'polyethylene' and rep.longueur_pe_m > rep.longueur_pe_max_m
  union all
  -- Réparation sur un matériau ou un diamètre sans article (DN > 315, fonte, acier…)
  select rep.marche_id, rep.fuite_id, rep.fuite_numero, rep.id, null,
         'reparation_hors_bordereau', 'information',
         'Réparation sans article au bordereau (matériau ou diamètre) : à faire valoir',
         format('%s, diamètre %s', private.libelle_materiau(rep.materiau),
                coalesce(rep.diametre_mm || ' mm', 'non saisi')),
         null, null
    from rep
    join sans_article s on s.id = rep.id
)
select c.*
  from controles c
 where private.contexte_serveur()
    or (c.marche_id = any ((select private.marches_autorises('attachements', 'lire'))::uuid[])
        and c.marche_id = any ((select private.marches_autorises('quantites', 'lire'))::uuid[]));

-- Travaux hors bordereau : corps de 20261006140000.
create or replace view public.v_hors_bordereau with (security_invoker = true) as
with rep as (
  select r.id, r.marche_id, r.fuite_id, r.resultat, r.motif_id, r.realisee_le, r.auteur_terrain_id, r.saisi_par,
         r.source_saisie, r.ouvrage, r.materiau, r.diametre_mm, r.representant_srm, r.representant_srm_id,
         r.tuyau_repare, r.robinet_pec_change, r.collier_pec_change, r.bouche_a_cle_mise_a_niveau,
         r.element_remplace, r.longueur_pe_m, r.fouille_longueur_m, r.fouille_largeur_m, r.fouille_profondeur_m,
         r.volume_m3, r.emplacement, r.nature_revetement_id, r.observation, r.cree_le, r.modifie_le,
         r.supprime_le, r.supprime_par, r.validee_le, r.validee_par,
         f.numero as fuite_numero, f.reference_srm, f.adresse, f.zone_id, z.libelle as zone,
         f.secteur_id, s.libelle as secteur, m.longueur_pe_max_m
    from public.reparations r
    join public.fuites f on f.id = r.fuite_id and f.supprime_le is null
    join public.marches m on m.id = r.marche_id
    left join public.zones z on z.id = f.zone_id
    left join public.secteurs s on s.id = f.secteur_id
   where r.supprime_le is null and r.resultat = 'reparee'
),
travaux as (
  select rep.marche_id, 'pe_au_dela_2m'::text as nature,
         format('Polyéthylène au-delà de %s m', private.nombre_fr(rep.longueur_pe_max_m)) as libelle,
         format('Polyéthylène %s mm : %s m posés, excédent au-delà de %s m',
                coalesce(rep.diametre_mm::text, '?'), private.nombre_fr(rep.longueur_pe_m),
                private.nombre_fr(rep.longueur_pe_max_m)) as designation,
         rep.longueur_pe_m - rep.longueur_pe_max_m as quantite, 'm'::text as unite,
         rep.id as reparation_id, null::uuid as piece_ligne_id,
         null::text as piece_provenance, null::text as piece_nature_correction
    from rep
   where rep.materiau = 'polyethylene' and rep.longueur_pe_m > rep.longueur_pe_max_m
  union all
  select rep.marche_id, 'reparation_sans_article', 'Réparation sans article au bordereau',
         format('Réparation %s, diamètre %s', private.libelle_materiau(rep.materiau),
                coalesce(rep.diametre_mm || ' mm', 'non saisi')),
         1, 'u', rep.id, null, null, null
    from rep
   where rep.tuyau_repare
     and exists (
       select 1 from private.v_prix_proposes pp
        where pp.reparation_id = rep.id and pp.refection_id is null
          and pp.famille = 'reparation_tuyau' and pp.prix_id is null
     )
     and not exists (
       select 1 from public.lignes_quantites l
         join public.prix p on p.id = l.prix_id
        where l.reparation_id = rep.id and l.supprime_le is null
          and (p.famille = 'reparation_tuyau' or p.hors_bordereau)
     )
  union all
  select rep.marche_id, 'piece_non_couverte', 'Pièce non couverte par un article',
         coalesce(d.designation, rp.designation_libre),
         rp.quantite, coalesce(d.unite, 'u'), rep.id, rp.id, rp.provenance, rp.nature_correction
    from public.reparation_pieces rp
    join rep on rep.id = rp.reparation_id
    left join public.produits_dolibarr d on d.dolibarr_id = rp.produit_id
    left join public.prix ps on ps.id = private.article_suggere(rp.marche_id, rp.produit_id)
   where rp.supprime_le is null and rp.etat = 'posee'
     and (coalesce(ps.hors_bordereau, false)
          or not exists (
            select 1 from public.lignes_quantites l
              join public.prix p on p.id = l.prix_id
             where l.fuite_id = rep.fuite_id and l.supprime_le is null
               and (p.hors_bordereau or p.famille not in ('terrassement', 'refection', 'balayage', 'maintien'))
          ))
)
select t.marche_id, t.nature, t.libelle, rep.fuite_id, rep.fuite_numero, rep.reference_srm, rep.adresse,
       rep.zone_id, rep.zone, rep.secteur_id, rep.secteur, t.reparation_id, rep.realisee_le,
       (rep.realisee_le at time zone 'Africa/Casablanca')::date as jour,
       rep.materiau::text as materiau, rep.diametre_mm, t.designation, t.quantite, t.unite,
       t.piece_ligne_id, t.piece_provenance, t.piece_nature_correction
  from travaux t
  join rep on rep.id = t.reparation_id
 where private.contexte_serveur()
    or (t.marche_id = any ((select private.marches_autorises('attachements', 'lire'))::uuid[])
        and t.marche_id = any ((select private.marches_autorises('quantites', 'lire'))::uuid[]));

-- -----------------------------------------------------------------------------
-- 5. Fonctions
-- -----------------------------------------------------------------------------

-- État du balayage par tronçon : agent du dernier passage, plus d'équipe (la carte et le rapport
-- journalier désignent l'agent). Forme compacte : clés e et equipes retirées.
drop function public.etat_balayage_compact(uuid, uuid[]);
drop function public.etat_balayage(uuid, uuid[]);

create function public.etat_balayage(p_marche uuid, p_secteurs uuid[] default null)
returns table (troncon_id uuid, premier_le date, dernier_le date, nb_passages integer, agent_id uuid)
language sql
stable
set search_path = ''
as $$
  select b.troncon_id,
         min(b.date_balayage) as premier_le,
         max(b.date_balayage) as dernier_le,
         count(*)::integer as nb_passages,
         (array_agg(b.agent_id order by b.balaye_le desc, b.id desc))[1] as agent_id
    from public.balayages b
    join public.troncons t on t.id = b.troncon_id
   where b.marche_id = p_marche
     and b.annule_le is null
     and t.actif
     and (p_secteurs is null or t.secteur_id = any (p_secteurs))
   group by b.troncon_id
$$;

comment on function public.etat_balayage(uuid, uuid[]) is
  'État léger par tronçon balayé : premier passage (payé), dernier passage, nombre, agent du dernier passage.';

create function public.etat_balayage_compact(p_marche uuid, p_secteurs uuid[] default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with e as (
    select * from public.etat_balayage(p_marche, p_secteurs)
  ),
  ag as (
    select x.agent_id, (row_number() over (order by x.agent_id) - 1)::integer as rang
      from (select distinct e.agent_id from e where e.agent_id is not null) x
  )
  select jsonb_build_object(
    't', coalesce(jsonb_agg(e.troncon_id order by e.troncon_id), '[]'::jsonb),
    'p', coalesce(jsonb_agg(e.premier_le order by e.troncon_id), '[]'::jsonb),
    'd', coalesce(jsonb_agg(e.dernier_le order by e.troncon_id), '[]'::jsonb),
    'n', coalesce(jsonb_agg(e.nb_passages order by e.troncon_id), '[]'::jsonb),
    'a', coalesce(jsonb_agg(ag.rang order by e.troncon_id), '[]'::jsonb),
    'agents', (select coalesce(jsonb_agg(ag.agent_id order by ag.rang), '[]'::jsonb) from ag)
  )
    from e
    left join ag on ag.agent_id = e.agent_id
$$;

comment on function public.etat_balayage_compact(uuid, uuid[]) is
  'etat_balayage en un document JSON en colonnes (t, p, d, n, a, agents) : non plafonné à 1 000 lignes par l''API.';

revoke execute on function public.etat_balayage(uuid, uuid[]), public.etat_balayage_compact(uuid, uuid[])
  from public, anon;
grant execute on function public.etat_balayage(uuid, uuid[]), public.etat_balayage_compact(uuid, uuid[])
  to authenticated, service_role;

-- Copie des paramètres d'un marché : corps de 20261009200000 sans les équipes.
create or replace function private.copier_parametres_marche(p_source uuid, p_cible uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Fiche : tout ce qui décrit le client, le titulaire et les règles du marché
  update public.marches d
     set duree_mois = s.duree_mois, duree_jours = s.duree_jours,
         taux_majoration = s.taux_majoration, taux_tva = s.taux_tva,
         taux_retenue_garantie = s.taux_retenue_garantie, plafond_retenue_garantie = s.plafond_retenue_garantie,
         rayon_redetection_m = s.rayon_redetection_m, delai_alerte_reparation_h = s.delai_alerte_reparation_h,
         delai_prealerte_refection_chaussee_j = s.delai_prealerte_refection_chaussee_j,
         delai_refection_chaussee_j = s.delai_refection_chaussee_j,
         delai_alerte_refection_trottoir_j = s.delai_alerte_refection_trottoir_j,
         une_unite_par_prix_et_fuite = s.une_unite_par_prix_et_fuite,
         client_sigle = s.client_sigle, client_nom_ar = s.client_nom_ar, client_direction = s.client_direction,
         client_service = s.client_service, client_adresse = s.client_adresse, client_ice = s.client_ice,
         client_telephone = s.client_telephone, client_email = s.client_email,
         client_representant = s.client_representant,
         titulaire_nom = s.titulaire_nom, titulaire_nom_ar = s.titulaire_nom_ar,
         titulaire_forme_juridique = s.titulaire_forme_juridique, titulaire_capital = s.titulaire_capital,
         titulaire_adresse = s.titulaire_adresse, titulaire_ice = s.titulaire_ice, titulaire_if = s.titulaire_if,
         titulaire_rc = s.titulaire_rc, titulaire_patente = s.titulaire_patente, titulaire_cnss = s.titulaire_cnss,
         titulaire_telephone = s.titulaire_telephone, titulaire_email = s.titulaire_email,
         titulaire_representant = s.titulaire_representant,
         titulaire_qualite_representant = s.titulaire_qualite_representant,
         devise = s.devise, libelle_reference = s.libelle_reference, masque_reference = s.masque_reference,
         jalons_client = s.jalons_client
    from public.marches s
   where s.id = p_source and d.id = p_cible;

  update public.parametres_attachement d
     set periodicite = s.periodicite, titre = s.titre, regroupement = s.regroupement,
         fuites_admissibles = s.fuites_admissibles, refection_anticipee = s.refection_anticipee,
         verrouiller_a_l_arret = s.verrouiller_a_l_arret, afficher_prix = s.afficher_prix,
         mentions_obligatoires = s.mentions_obligatoires, visas = s.visas, decimales = s.decimales,
         texte_pied = s.texte_pied
    from public.parametres_attachement s
   where s.marche_id = p_source and d.marche_id = p_cible;

  insert into public.categories_evenement (marche_id, code, libelle, libelle_ar, ordre, actif)
  select p_cible, c.code, c.libelle, c.libelle_ar, c.ordre, c.actif
    from public.categories_evenement c where c.marche_id = p_source
  on conflict (marche_id, code) do update
    set libelle = excluded.libelle, libelle_ar = excluded.libelle_ar,
        ordre = excluded.ordre, actif = excluded.actif;

  -- Modèles par défaut renommés comme ceux de la source (« État journalier SRM »)
  update public.modeles_export e
     set nom = 'État journalier ' || m.client_sigle
    from public.marches m
   where m.id = e.marche_id and e.marche_id = p_cible and e.nom = 'État journalier'
     and nullif(btrim(m.client_sigle), '') is not null
     and exists (select 1 from public.modeles_export s
                  where s.marche_id = p_source and s.nom = 'État journalier ' || m.client_sigle);

  insert into public.modeles_export (marche_id, nom, jeu, colonnes, regroupement, filtres, format, orientation, ordre, actif, saisi_par)
  select p_cible, e.nom, e.jeu, e.colonnes, e.regroupement, e.filtres, e.format, e.orientation, e.ordre, e.actif, null
    from public.modeles_export e where e.marche_id = p_source
  on conflict (marche_id, nom) do update
    set jeu = excluded.jeu, colonnes = excluded.colonnes, regroupement = excluded.regroupement,
        filtres = excluded.filtres, format = excluded.format, orientation = excluded.orientation,
        ordre = excluded.ordre, actif = excluded.actif;

  -- Référentiels
  insert into public.zones (id, marche_id, numero, code, libelle, lineaire_m, q_exige_m3h, geom, actif)
  select md5(p_cible || ':' || z.id)::uuid, p_cible, z.numero, z.code, z.libelle, z.lineaire_m, z.q_exige_m3h,
         z.geom, z.actif
    from public.zones z where z.marche_id = p_source;

  insert into public.secteurs (id, marche_id, zone_id, code, libelle, lineaire_m, geom, ordre, actif)
  select md5(p_cible || ':' || s.id)::uuid, p_cible, md5(p_cible || ':' || s.zone_id)::uuid, s.code, s.libelle,
         s.lineaire_m, s.geom, s.ordre, s.actif
    from public.secteurs s where s.marche_id = p_source;

  insert into public.prix (id, marche_id, numero, ordre, designation, unite, quantite_marche, pu_ht,
                           famille, materiaux, diametre_min_mm, diametre_max_mm, hors_bordereau, actif)
  select md5(p_cible || ':' || p.id)::uuid, p_cible, p.numero, p.ordre, p.designation, p.unite, p.quantite_marche,
         p.pu_ht, p.famille, p.materiaux, p.diametre_min_mm, p.diametre_max_mm, p.hors_bordereau, p.actif
    from public.prix p where p.marche_id = p_source
   order by p.hors_bordereau, p.ordre, p.numero;

  insert into public.natures_refection (id, marche_id, code, libelle_fr, libelle_ar, symbole, emplacement,
                                        prix_id, necessite_refection, ordre, actif)
  select md5(p_cible || ':' || n.id)::uuid, p_cible, n.code, n.libelle_fr, n.libelle_ar, n.symbole, n.emplacement,
         case when n.prix_id is not null then md5(p_cible || ':' || n.prix_id)::uuid end,
         n.necessite_refection, n.ordre, n.actif
    from public.natures_refection n where n.marche_id = p_source;

  insert into public.motifs (id, marche_id, categorie, code, libelle_fr, libelle_ar, terrassement_paye, ordre, actif)
  select md5(p_cible || ':' || m.id)::uuid, p_cible, m.categorie, m.code, m.libelle_fr, m.libelle_ar,
         m.terrassement_paye, m.ordre, m.actif
    from public.motifs m where m.marche_id = p_source;

  -- Suggestions d'article (famille ou produit Dolibarr → article du bordereau copié)
  insert into public.suggestions_articles (id, marche_id, prix_id, famille, produit_id)
  select md5(p_cible || ':' || s.id)::uuid, p_cible, md5(p_cible || ':' || s.prix_id)::uuid, s.famille, s.produit_id
    from public.suggestions_articles s where s.marche_id = p_source;

  -- Chantier v2 (S2) : saisie terrain et attachement par anticipation
  perform private.copier_parametres_terrain(p_source, p_cible);
end
$$;
