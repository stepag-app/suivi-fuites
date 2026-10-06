-- =============================================================================
-- Lot T : les produits Dolibarr deviennent le référentiel unique des pièces
-- (contrat : docs/lots/lot-articles-dolibarr.md).
--
-- Décisions d'Issam (2026-10-06) :
--  * les produits Dolibarr importés (produits.csv, familles RAC, CND, ROB, AEP, VRI) sont
--    LE référentiel des pièces, commun à tous les marchés et à toutes les sociétés ;
--  * un interrupteur global « utilisable » (activé) décide de ce qui s'affiche dans la
--    liste déroulante du réparateur ; un produit nouvellement importé arrive désactivé ;
--  * la pièce posée référence directement le produit (reparation_pieces.produit_id) :
--    plus de catalogue par marché ni de rapprochement ; plus de pièce libre (texte) : un
--    article absent fait l'objet d'une demande interne au gestionnaire de Dolibarr, qui le
--    crée ; la liste est ensuite réimportée et l'article activé ;
--  * activation par l'administrateur ou un responsable (droit « paramètres / modifier »
--    sur au moins un marché) ; import de produits.csv réservé à l'administrateur ;
--  * unité : celle de Dolibarr, telle quelle ;
--  * article du bordereau suggéré : règles par marché (famille ou produit → article),
--    le produit l'emporte sur la famille ;
--  * rien n'est en production : l'ancien catalogue (261 pièces saisies sous Excel) et les
--    pièces déjà posées sont purgés ; les réparations, ouvriers, photos et réfections restent.
--
-- Reprise des données avant la suppression du catalogue :
--  * pré-activation : tout produit lié à une pièce du catalogue (rapprochement du lot P1)
--    devient « utilisable » ;
--  * l'article suggéré d'une pièce liée devient une règle « produit » de son marché.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Activation (globale) d'un produit
-- -----------------------------------------------------------------------------
alter table public.produits_dolibarr
  add column utilisable boolean not null default false,
  add column utilisable_le timestamptz,
  add column utilisable_par uuid,
  add column cree_le timestamptz;

-- Arrivée du produit (premier import qui l'a contenu) : sert au filtre « nouveaux du dernier import ».
update public.produits_dolibarr
   set cree_le = coalesce((select min(i.importe_le) from public.imports_dolibarr i), importe_le);
alter table public.produits_dolibarr
  alter column cree_le set default now(),
  alter column cree_le set not null;

comment on column public.produits_dolibarr.utilisable is
  'Activé : proposé dans la liste déroulante des pièces (tous les marchés) tant que le produit est actif dans Dolibarr.';
comment on column public.produits_dolibarr.actif is
  'Présent dans le dernier import, en vente ou en achat dans Dolibarr ; faux : retiré de la liste déroulante, historique gardé.';

create index produits_dolibarr_utilisables_idx on public.produits_dolibarr (designation)
  where utilisable and actif;

update public.produits_dolibarr d
   set utilisable = true, utilisable_le = now()
 where exists (select 1 from public.catalogue_pieces c where c.produit_dolibarr_id = d.dolibarr_id and c.actif);

-- -----------------------------------------------------------------------------
-- 2. Suggestion d'article par marché : famille ou produit Dolibarr → article du bordereau
-- -----------------------------------------------------------------------------
create table public.suggestions_articles (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  prix_id uuid not null,
  famille text check (famille ~ '^[A-Z0-9]{1,10}$'),
  produit_id integer references public.produits_dolibarr (dolibarr_id),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  foreign key (prix_id, marche_id) references public.prix (id, marche_id),
  constraint suggestions_articles_cible check (num_nonnulls(famille, produit_id) = 1),
  constraint suggestions_articles_famille_unique unique (marche_id, famille),
  constraint suggestions_articles_produit_unique unique (marche_id, produit_id)
);
alter table public.suggestions_articles enable row level security;
create index suggestions_articles_prix_idx on public.suggestions_articles (prix_id);
create index suggestions_articles_produit_idx on public.suggestions_articles (produit_id) where produit_id is not null;

comment on table public.suggestions_articles is
  'Article du bordereau suggéré pour une pièce posée : règle par produit Dolibarr, sinon par famille (préfixe de la référence).';

create trigger maj_modifie_le before update on public.suggestions_articles
  for each row execute function private.maj_modifie_le();
create trigger figer_marche before update on public.suggestions_articles
  for each row execute function private.figer_marche();
create trigger journaliser after insert or update or delete on public.suggestions_articles
  for each row execute function private.journaliser();

-- Paramètre du marché : lisible par tous les affectés, géré avec le droit « paramètres »
-- (une règle se supprime : ce n'est pas une donnée historique).
create policy suggestions_articles_lecture on public.suggestions_articles for select to authenticated
  using (marche_id = any ((select private.mes_marches())::uuid[]));
create policy suggestions_articles_creation on public.suggestions_articles for insert to authenticated
  with check (marche_id = any ((select private.marches_autorises('parametres', 'creer'))::uuid[]));
create policy suggestions_articles_modification on public.suggestions_articles for update to authenticated
  using (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]))
  with check (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]));
create policy suggestions_articles_suppression on public.suggestions_articles for delete to authenticated
  using (marche_id = any ((select private.marches_autorises('parametres', 'supprimer'))::uuid[]));
revoke all on public.suggestions_articles from anon, authenticated;
grant select, insert, update, delete on public.suggestions_articles to authenticated;

-- Reprise des articles suggérés par les pièces rapprochées (un produit au plus une fois par marché)
insert into public.suggestions_articles (marche_id, prix_id, produit_id)
select distinct on (c.marche_id, c.produit_dolibarr_id) c.marche_id, c.prix_suggere_id, c.produit_dolibarr_id
  from public.catalogue_pieces c
 where c.produit_dolibarr_id is not null and c.prix_suggere_id is not null
 order by c.marche_id, c.produit_dolibarr_id, c.actif desc, c.designation;

-- Article suggéré d'un produit dans un marché : règle du produit, sinon de sa famille, sinon aucun.
-- SECURITY DEFINER : lisible par les vues (security_invoker) quel que soit le compte ; ne rend
-- qu'un identifiant d'article, dont la lecture (prix) reste soumise à la RLS de l'appelant.
create function private.article_suggere(p_marche uuid, p_produit integer)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.prix_id
    from public.suggestions_articles s
    join public.produits_dolibarr d on d.dolibarr_id = p_produit
   where s.marche_id = p_marche
     and (s.produit_id = p_produit or (s.produit_id is null and s.famille = d.famille))
   order by s.produit_id is null
   limit 1
$$;

-- -----------------------------------------------------------------------------
-- 3. Pièces posées : le produit Dolibarr remplace la pièce du catalogue
-- -----------------------------------------------------------------------------
alter table public.reparation_pieces
  add column produit_id integer references public.produits_dolibarr (dolibarr_id);

comment on column public.reparation_pieces.produit_id is
  'Produit Dolibarr posé (activé au moment de la saisie) ; obligatoire (plus de pièce libre).';

-- Purge (aucune donnée en production) : pièces posées de tous les marchés, terrain et bureau.
-- Exécutée par la migration (appel système) : ni verrou de fuite ni contrôle de correction.
delete from public.reparation_pieces;

-- Vues du lot R (20261006100100) : mêmes colonnes, pièces lues dans la nomenclature Dolibarr.

create or replace view public.v_controles_attachement with (security_invoker = true) as
with rep as (
  select r.*, f.numero as fuite_numero, f.statut as statut_fuite, m.longueur_pe_max_m
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

-- Travaux hors bordereau : pièce non couverte selon l'article suggéré (produit ou famille).
create or replace view public.v_hors_bordereau with (security_invoker = true) as
with rep as (
  select r.*, f.numero as fuite_numero, f.reference_srm, f.adresse, f.zone_id, z.libelle as zone,
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

-- Fuites enrichies pour les exports : pièces de l'inventaire réel, désignation Dolibarr.
create or replace view public.v_fuites_export with (security_invoker = true) as
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
  er.libelle as equipe_reparation,
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
  select rp.*
    from public.reparations rp
   where rp.fuite_id = v.id and rp.supprime_le is null
   order by rp.realisee_le desc
   limit 1
) r on true
left join public.equipes er on er.id = r.equipe_id
left join public.profils pc on pc.id = r.auteur_terrain_id
left join public.natures_refection nr on nr.id = r.nature_revetement_id
left join lateral (
  select x.*
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

-- La pièce remplacée ou retirée se compare désormais sur le produit (corps de 20261006100100).
create or replace function private.controler_piece()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _motif text := nullif(btrim(new.motif_modification), '');
  _auteur boolean;
  _donnees boolean;
begin
  new.motif_modification := null;
  if private.appel_systeme() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    _auteur := private.est_auteur_reparation(new.reparation_id);
    new.provenance := case when _auteur then 'terrain' else 'correction' end;
    new.nature_correction := case
      when _auteur then null
      when new.remplace_piece_id is null then 'oubli'
      else 'remplacement'
    end;
    new.motif_correction := _motif;
    new.etat := 'posee';
    new.etat_par := null;
    new.etat_le := null;
    new.motif_retrait := null;
    if not _auteur and not private.peut_completer_reparation(new.reparation_id) then
      raise exception 'Correction refusée : réparation d''un autre agent (droit « interventions / modifier » requis)'
        using errcode = 'insufficient_privilege';
    end if;
    if _motif is null and (not _auteur or new.remplace_piece_id is not null) then
      raise exception 'Motif obligatoire pour corriger les pièces posées (remplacement, oubli ou retrait)'
        using errcode = 'check_violation';
    end if;
    if new.remplace_piece_id is not null then
      perform private.remplacer_piece(new.remplace_piece_id, new.reparation_id);
    end if;
    return new;
  end if;

  -- Modification : provenance, nature, pièce remplacée et motif de la correction ne changent jamais
  _auteur := private.est_auteur_reparation(old.reparation_id);
  new.provenance := old.provenance;
  new.nature_correction := old.nature_correction;
  new.remplace_piece_id := old.remplace_piece_id;
  new.motif_correction := old.motif_correction;
  _donnees := row(new.reparation_id, new.produit_id, new.designation_libre, new.quantite, new.supprime_le)
              is distinct from row(old.reparation_id, old.produit_id, old.designation_libre, old.quantite, old.supprime_le);
  if not _donnees and new.etat is not distinct from old.etat then
    new.etat_par := old.etat_par;
    new.etat_le := old.etat_le;
    new.motif_retrait := old.motif_retrait;
    return new;
  end if;

  if not _auteur and not private.peut_completer_reparation(old.reparation_id) then
    raise exception 'Correction refusée : réparation d''un autre agent (droit « interventions / modifier » requis)'
      using errcode = 'insufficient_privilege';
  end if;
  if _auteur and not private.peut_corriger_piece(old.reparation_id, old.marche_id, old.provenance, old.saisi_par) then
    raise exception 'Correction refusée : pièce saisie par un autre compte' using errcode = 'insufficient_privilege';
  end if;
  if old.etat <> 'posee' then
    raise exception 'Pièce remplacée ou retirée : elle ne se modifie plus' using errcode = 'check_violation';
  end if;

  -- Retrait d'une pièce non posée : motif obligatoire, la pièce reste telle que saisie
  if new.etat is distinct from old.etat then
    if new.etat is distinct from 'retiree' then
      raise exception 'Seul le retrait d''une pièce se fait à la main (un remplacement passe par la pièce qui la remplace)'
        using errcode = 'check_violation';
    end if;
    if _donnees then
      raise exception 'Retrait : la pièce retirée reste telle que saisie' using errcode = 'check_violation';
    end if;
    if _motif is null then
      raise exception 'Motif obligatoire pour corriger les pièces posées (remplacement, oubli ou retrait)'
        using errcode = 'check_violation';
    end if;
    new.etat_par := auth.uid();
    new.etat_le := now();
    new.motif_retrait := _motif;
    return new;
  end if;

  -- Modification ou suppression directe : seulement l'auteur, sur une pièce du terrain
  if not _auteur or old.provenance = 'correction' then
    raise exception 'Pièce déclarée par le réparateur ou corrigée par le bureau : la remplacer ou la retirer, avec motif (jamais la modifier ni la supprimer)'
      using errcode = 'check_violation';
  end if;
  new.etat_par := old.etat_par;
  new.etat_le := old.etat_le;
  new.motif_retrait := old.motif_retrait;
  return new;
end
$$;

-- Inventaire réel et pièces posées : la colonne piece_id devient produit_id (vues recréées).
drop view public.v_pieces_posees;
drop view public.v_pieces_reelles;

alter table public.reparation_pieces drop column piece_id;   -- emporte la clé étrangère, l'index et l'ancien contrôle
alter table public.reparation_pieces
  add constraint reparation_pieces_produit_obligatoire
    check (produit_id is not null and designation_libre is null);
comment on column public.reparation_pieces.designation_libre is
  'Obsolète (lot T) : toujours vide ; un article absent de la liste est créé dans Dolibarr puis réimporté.';
create index reparation_pieces_produit_idx on public.reparation_pieces (produit_id) where produit_id is not null;

-- Inventaire réel des fournitures posées : pièces du terrain ni remplacées ni retirées, et
-- corrections du bureau (oubli, remplacement), avec leur provenance, leur nature, leur motif,
-- leur auteur et la pièce remplacée. Famille et unité : celles du produit Dolibarr.
-- Mêmes droits de lecture que les pièces (security_invoker : règle de reparation_pieces).
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
  r.equipe_id,
  e.libelle as equipe,
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
left join public.equipes e on e.id = r.equipe_id
left join public.profils pc on pc.id = r.auteur_terrain_id
left join public.profils ps on ps.id = rp.saisi_par
left join public.reparation_pieces pa on pa.id = rp.remplace_piece_id
left join public.produits_dolibarr da on da.dolibarr_id = pa.produit_id
where rp.supprime_le is null and rp.etat = 'posee';

-- Pièces posées (exports) : l'inventaire réel, avec la provenance, la nature et le motif de la correction.
create view public.v_pieces_posees with (security_invoker = true) as
select
  id, marche_id, reparation_id, fuite_id, fuite_numero, reference_srm, zone_id, zone, secteur_id, secteur,
  equipe_id, equipe, chef_id, chef, realisee_le, jour, produit_id, designation, famille, unite, quantite,
  provenance, nature_correction, motif_correction
from public.v_pieces_reelles;

grant select on public.v_pieces_reelles, public.v_pieces_posees to authenticated;

-- Un produit nouvellement choisi doit être activé et présent dans Dolibarr ; une ligne déjà
-- saisie garde son produit s'il est désactivé ensuite. Droits de l'utilisateur (la lecture
-- de la nomenclature est ouverte à tout compte affecté, § 6).
create function private.controler_produit_piece()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.produit_id is null or private.appel_systeme() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.produit_id is not distinct from old.produit_id then
      return new;
    end if;
  end if;
  if not exists (select 1 from public.produits_dolibarr d
                  where d.dolibarr_id = new.produit_id and d.utilisable and d.actif) then
    raise exception 'Article non proposé : il n''est pas activé (Paramètres > Articles) ou n''existe plus dans Dolibarr'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger e_controler_produit before insert or update on public.reparation_pieces
  for each row execute function private.controler_produit_piece();

-- -----------------------------------------------------------------------------
-- 4. Copie d'un marché : les règles de suggestion remplacent le catalogue
-- -----------------------------------------------------------------------------
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

  insert into public.equipes (id, marche_id, type, numero, libelle, actif)
  select md5(p_cible || ':' || e.id)::uuid, p_cible, e.type, e.numero, e.libelle, e.actif
    from public.equipes e where e.marche_id = p_source;

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
end
$$;

-- Corps de 20261006100300 sans la reprise des liens du catalogue (verrou du lot Q, seuil PE du lot R).
create or replace function public.copier_marche(
  p_source uuid,
  p_code text,
  p_numero text,
  p_intitule text,
  p_client text default null,
  p_ville text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _source public.marches;
  _cible uuid := gen_random_uuid();
begin
  if not private.est_admin() then
    raise exception 'La création d''un marché est réservée à l''administrateur'
      using errcode = 'insufficient_privilege';
  end if;
  perform private.controler_verrou_admin('marches', 'copier');
  select * into _source from public.marches where id = p_source;
  if _source.id is null then
    raise exception 'Marché source introuvable' using errcode = 'no_data_found';
  end if;
  if nullif(btrim(p_code), '') is null or nullif(btrim(p_numero), '') is null
     or nullif(btrim(p_intitule), '') is null then
    raise exception 'Code, numéro et intitulé du nouveau marché sont obligatoires'
      using errcode = 'check_violation';
  end if;

  insert into public.marches (id, code, numero, intitule, client, ville)
  values (_cible, btrim(p_code), btrim(p_numero), btrim(p_intitule),
          coalesce(nullif(btrim(p_client), ''), _source.client),
          coalesce(nullif(btrim(p_ville), ''), _source.ville));

  perform private.copier_parametres_marche(p_source, _cible);
  update public.marches set longueur_pe_max_m = _source.longueur_pe_max_m where id = _cible;
  return _cible;
end
$$;

-- -----------------------------------------------------------------------------
-- 5. Import de produits.csv : plus de pièces à renommer (corps de 20261006100200 sans le catalogue)
-- -----------------------------------------------------------------------------
alter table public.imports_dolibarr
  drop column pieces_renommees,
  drop column conflits_designation;

create or replace function public.importer_produits_dolibarr(p_produits jsonb, p_familles text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _ids integer[];
  _lus integer;
  _invalides integer;
  _nouveaux integer;
  _modifies integer;
  _designations integer;
  _desactives integer;
begin
  if not private.est_admin() then
    raise exception 'L''import de la nomenclature Dolibarr est réservé à l''administrateur'
      using errcode = 'insufficient_privilege';
  end if;
  if p_produits is null or jsonb_typeof(p_produits) <> 'array' or jsonb_array_length(p_produits) = 0 then
    raise exception 'Aucun produit à importer' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_produits) > 20000 then
    raise exception 'Trop de produits dans un seul import (20 000 au plus)' using errcode = 'program_limit_exceeded';
  end if;

  select count(*),
         count(*) filter (where l.dolibarr_id is null or l.dolibarr_id <= 0
                             or coalesce(l.ref, '') = '' or length(l.ref) > 64
                             or coalesce(l.designation, '') = '' or length(l.designation) > 255
                             or coalesce(l.famille, '') !~ '^[A-Z0-9]{1,10}$'
                             or length(coalesce(l.unite, '')) > 20),
         array_agg(l.dolibarr_id)
    into _lus, _invalides, _ids
    from private.lire_produits_dolibarr(p_produits) l;
  if _invalides > 0 then
    raise exception '% produit(s) sans identifiant, référence, libellé ou famille valides', _invalides
      using errcode = 'invalid_parameter_value';
  end if;

  -- Nouveau produit : désactivé (utilisable = faux) jusqu'à ce que l'administrateur l'active.
  with ins as (
    insert into public.produits_dolibarr (dolibarr_id, ref, designation, unite, famille, actif)
    select l.dolibarr_id, l.ref, l.designation, l.unite, l.famille, l.actif
      from private.lire_produits_dolibarr(p_produits) l
    on conflict on constraint produits_dolibarr_pkey do nothing
    returning 1
  )
  select count(*) into _nouveaux from ins;

  -- La requête principale lit l'état d'avant la mise à jour (même instantané que le CTE).
  with maj as (
    update public.produits_dolibarr p
       set ref = l.ref, designation = l.designation, unite = l.unite, famille = l.famille,
           actif = l.actif, modifie_le = now()
      from private.lire_produits_dolibarr(p_produits) l
     where p.dolibarr_id = l.dolibarr_id
       and (p.ref, p.designation, p.unite, p.famille, p.actif)
           is distinct from (l.ref, l.designation, l.unite, l.famille, l.actif)
    returning p.dolibarr_id, p.designation
  )
  select count(*), count(*) filter (where a.designation is distinct from m.designation)
    into _modifies, _designations
    from maj m
    join public.produits_dolibarr a on a.dolibarr_id = m.dolibarr_id;

  update public.produits_dolibarr p set importe_le = now() where p.dolibarr_id = any (_ids);

  -- Produits absents du fichier (disparus de Dolibarr ou familles non retenues) : inactifs,
  -- jamais supprimés (historique des pièces posées) ; leur activation est gardée.
  with d as (
    update public.produits_dolibarr p set actif = false, modifie_le = now()
     where p.actif and not (p.dolibarr_id = any (_ids))
    returning 1
  )
  select count(*) into _desactives from d;

  insert into public.imports_dolibarr (importe_par, familles, produits_lus, nouveaux, modifies,
                                       designations_modifiees, desactives)
  values (auth.uid(), coalesce(p_familles, '{}'), _lus, _nouveaux, _modifies, _designations, _desactives);

  return jsonb_build_object(
    'produits_lus', _lus, 'nouveaux', _nouveaux, 'modifies', _modifies,
    'designations_modifiees', _designations, 'desactives', _desactives
  );
end
$$;

comment on function public.importer_produits_dolibarr(jsonb, text[]) is
  'Administrateur : importe la nomenclature Dolibarr (nouveaux désactivés, modifiés, absents rendus inactifs) ; idempotent ; aucun prix.';

-- -----------------------------------------------------------------------------
-- 6. Activation (administrateur) et lecture de la nomenclature par tout compte affecté
-- -----------------------------------------------------------------------------
create function public.activer_produits_dolibarr(p_ids integer[], p_utilisable boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _n integer;
begin
  if not (private.est_admin() or cardinality(private.marches_autorises('parametres', 'modifier')) > 0) then
    raise exception 'L''activation des articles est réservée à l''administrateur et aux responsables (droit « paramètres / modifier »)'
      using errcode = 'insufficient_privilege';
  end if;
  perform private.controler_verrou_admin('parametres', 'modifier');
  if p_ids is null or p_utilisable is null then
    raise exception 'Articles et état attendus' using errcode = 'invalid_parameter_value';
  end if;
  if cardinality(p_ids) > 20000 then
    raise exception 'Trop d''articles en une fois (20 000 au plus)' using errcode = 'program_limit_exceeded';
  end if;
  -- Un produit retiré de Dolibarr ne s'active plus (il ne serait de toute façon pas proposé).
  update public.produits_dolibarr d
     set utilisable = p_utilisable, utilisable_le = now(), utilisable_par = auth.uid()
   where d.dolibarr_id = any (p_ids)
     and d.utilisable is distinct from p_utilisable
     and (d.actif or not p_utilisable);
  get diagnostics _n = row_count;
  return _n;
end
$$;

comment on function public.activer_produits_dolibarr(integer[], boolean) is
  'Administrateur ou responsable (paramètres / modifier) : active (ou désactive) des articles Dolibarr dans la liste déroulante de tous les marchés ; rend le nombre modifié.';

-- La désignation et l'unité sont nécessaires à la saisie sur la tablette : lecture par tout
-- compte affecté à un marché (aucun prix dans la table). La référence reste un code de
-- l'administration : l'interface ne la montre que dans Paramètres > Articles.
drop policy produits_dolibarr_lecture on public.produits_dolibarr;
create policy produits_dolibarr_lecture on public.produits_dolibarr for select to authenticated
  using ((select private.est_admin()) or cardinality((select private.mes_marches())) > 0);

-- -----------------------------------------------------------------------------
-- 7. Suppression du catalogue et du rapprochement
-- -----------------------------------------------------------------------------
drop function public.rapprocher_pieces(uuid, jsonb);
drop table public.catalogue_pieces;   -- emporte le déclencheur nomenclature_dolibarr
drop function private.nomenclature_catalogue();
drop function private.designation_produit_dolibarr(integer);

-- -----------------------------------------------------------------------------
-- 8. Privilèges des fonctions
-- -----------------------------------------------------------------------------
revoke execute on function private.article_suggere(uuid, integer) from public, anon;
revoke execute on function private.controler_produit_piece() from public, anon, authenticated;
revoke execute on function public.activer_produits_dolibarr(integer[], boolean) from public, anon;
grant execute on function private.article_suggere(uuid, integer) to authenticated, service_role;
grant execute on function private.controler_produit_piece() to service_role;
grant execute on function public.activer_produits_dolibarr(integer[], boolean) to authenticated;
