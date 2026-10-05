-- =============================================================================
-- Lot R : contrôles et corrections à l'attachement.
--
-- Décisions d'Issam (2026-10-05) :
--  * toutes les fournitures sont comprises dans les prix de réparation (CPS art. II-15) :
--    aucune pièce n'est payée à part ;
--  * le réparateur fait foi pour les pièces posées ; le bureau (responsable, administrateur)
--    peut, à l'attachement, ajouter une pièce, ajouter une ligne de prix ou requalifier une
--    ligne quand les faits le justifient ;
--  * une réparation = une unité par prix (réglage « une unité par prix et par fuite »
--    inchangé) : le lot sert la traçabilité et la détection des oublis, jamais à gonfler
--    les quantités.
--
-- Contenu :
--  1. reparation_pieces : pièce « ajoutée au bureau » (indicateur, auteur, date), posé par
--     déclencheur ; ajout sur la réparation d'un autre agent soumis au droit « modifier ».
--  2. lignes_quantites : motif obligatoire pour toute modification par un utilisateur
--     (ajout manuel, article, quantité, suppression), article d'origine gardé à la
--     requalification (la règle automatique ne le repropose plus), une unité par prix et
--     par fuite aussi pour les lignes saisies à la main.
--  3. Vues : private.v_prix_proposes (articles que propose la règle R-DER-007),
--     v_controles_attachement (oublis probables, lignes incohérentes, polyéthylène au-delà
--     de 2 m, réparations sans article), v_hors_bordereau (travaux à faire valoir) ;
--     v_quantites et v_pieces_posees reçoivent les nouvelles colonnes (en fin de liste).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Pièces ajoutées au bureau
-- -----------------------------------------------------------------------------
alter table public.reparation_pieces
  add column ajoutee_bureau boolean not null default false,
  add column ajoutee_bureau_par uuid references public.profils (id),
  add column ajoutee_bureau_le timestamptz;

comment on column public.reparation_pieces.ajoutee_bureau is
  'Pièce ajoutée après coup par un autre que le réparateur (bureau) ; posé par déclencheur';

-- Profil « de bureau » sur un marché : administrateur, ou droit de validation des interventions.
create function private.profil_de_bureau(p_profil uuid, p_marche uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profils p where p.id = p_profil and p.est_admin)
      or exists (
        select 1 from public.droits d
         where d.profil_id = p_profil and d.marche_id = p_marche
           and d.type_donnee = 'interventions' and d.valider
      )
$$;

-- Une pièce enregistrée par p_profil à l'instant p_le est-elle « ajoutée au bureau » ?
-- Non (déclaration du réparateur) quand :
--  * elle est saisie par le compte qui a saisi la réparation, dans les 15 minutes de sa
--    création (envoi de la tablette, fiche papier recopiée au bureau avec la réparation) ;
--  * elle est saisie par le réparateur lui-même (auteur terrain), agent de terrain sans droit
--    de validation (ajout depuis la tablette, même plus tard).
-- Oui dans tous les autres cas (responsable ou administrateur après coup, autre agent).
create function private.piece_ajoutee_au_bureau(p_reparation uuid, p_profil uuid, p_le timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_profil is null or r.id is null then false
    when p_profil = r.saisi_par and p_le <= r.cree_le + interval '15 minutes' then false
    when p_profil = r.auteur_terrain_id and not private.profil_de_bureau(p_profil, r.marche_id) then false
    else true
  end
  from (select 1) x
  left join public.reparations r on r.id = p_reparation
$$;

-- Droit de compléter la réparation d'un autre : « interventions / modifier » avec sa portée
-- (le responsable : toutes ; le chef de réparation : seulement les siennes).
create function private.peut_completer_reparation(p_reparation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.peut(r.marche_id, 'interventions', 'modifier', r.auteur_terrain_id, r.saisi_par)
      from public.reparations r
     where r.id = p_reparation
  ), false)
$$;

-- Déclencheur : indicateur, auteur et date posés par le serveur, jamais par le client.
create function private.marquer_piece_bureau()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.appel_systeme() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.ajoutee_bureau := old.ajoutee_bureau;
    new.ajoutee_bureau_par := old.ajoutee_bureau_par;
    new.ajoutee_bureau_le := old.ajoutee_bureau_le;
    return new;
  end if;
  new.ajoutee_bureau := private.piece_ajoutee_au_bureau(new.reparation_id, auth.uid(), now());
  if new.ajoutee_bureau then
    if not private.peut_completer_reparation(new.reparation_id) then
      raise exception 'Ajout d''une pièce refusé : réparation saisie par un autre agent'
        using errcode = 'insufficient_privilege';
    end if;
    new.ajoutee_bureau_par := auth.uid();
    new.ajoutee_bureau_le := now();
  else
    new.ajoutee_bureau_par := null;
    new.ajoutee_bureau_le := null;
  end if;
  return new;
end
$$;

-- Pièces existantes : même règle, d'après le compte et la date de saisie gardés.
update public.reparation_pieces rp
   set ajoutee_bureau = true, ajoutee_bureau_par = rp.saisi_par, ajoutee_bureau_le = rp.cree_le
 where rp.saisi_par is not null
   and private.piece_ajoutee_au_bureau(rp.reparation_id, rp.saisi_par, rp.cree_le);

alter table public.reparation_pieces
  add constraint reparation_pieces_ajout_bureau_date check (ajoutee_bureau = (ajoutee_bureau_le is not null));

create index reparation_pieces_bureau_idx on public.reparation_pieces (marche_id) where ajoutee_bureau;

create trigger d_marquer_piece_bureau before insert or update on public.reparation_pieces
  for each row execute function private.marquer_piece_bureau();

-- -----------------------------------------------------------------------------
-- 2. Lignes de quantités : motif obligatoire, article d'origine, une unité par prix
-- -----------------------------------------------------------------------------
alter table public.lignes_quantites
  add column motif_modification text,
  add column motif_correction text,
  add column corrigee_par uuid references public.profils (id),
  add column corrigee_le timestamptz,
  add column prix_initial_id uuid,
  add constraint lignes_quantites_prix_initial_fk
    foreign key (prix_initial_id, marche_id) references public.prix (id, marche_id);

comment on column public.lignes_quantites.motif_modification is
  'Motif de la modification envoyée avec elle (écriture seule : vidé par le déclencheur, gardé dans motif_correction)';
comment on column public.lignes_quantites.motif_correction is
  'Motif de la dernière modification faite par un utilisateur (ajout, article, quantité, suppression)';
comment on column public.lignes_quantites.prix_initial_id is
  'Article de la ligne avant sa première requalification : la règle automatique ne le repropose plus';

-- Toute écriture d'un utilisateur sur une ligne : motif obligatoire, auteur et date posés par
-- le serveur, ancienne valeur gardée par le journal ; une ligne ajoutée est toujours manuelle.
-- Droits inchangés (« quantités / créer, modifier, supprimer », verrou de la fuite : « valider »).
create function private.controler_ligne_quantite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _motif text := nullif(btrim(new.motif_modification), '');
  _techniques constant text[] := array[
    'modifie_le', 'origine', 'motif_modification', 'motif_correction', 'corrigee_par', 'corrigee_le',
    'prix_initial_id', 'saisi_par', 'cree_le', 'supprime_par'
  ];
  _une_unite boolean;
  _unitaire boolean;
  _deja numeric;
begin
  new.motif_modification := null;
  if private.appel_systeme() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.origine := 'manuel';
    new.prix_initial_id := null;
  else
    new.prix_initial_id := old.prix_initial_id;
    new.motif_correction := old.motif_correction;
    new.corrigee_par := old.corrigee_par;
    new.corrigee_le := old.corrigee_le;
    if (to_jsonb(new) - _techniques) is not distinct from (to_jsonb(old) - _techniques) then
      return new;
    end if;
  end if;

  if _motif is null then
    raise exception 'Motif obligatoire pour modifier une ligne de quantités (ajout, article, quantité ou suppression)'
      using errcode = 'check_violation';
  end if;

  if new.reparation_id is not null
     and (tg_op = 'INSERT' or new.reparation_id is distinct from old.reparation_id or new.fuite_id is distinct from old.fuite_id)
     and not exists (select 1 from public.reparations r where r.id = new.reparation_id and r.fuite_id = new.fuite_id) then
    raise exception 'La réparation indiquée n''appartient pas à cette fuite' using errcode = 'check_violation';
  end if;
  if new.refection_id is not null
     and (tg_op = 'INSERT' or new.refection_id is distinct from old.refection_id or new.fuite_id is distinct from old.fuite_id)
     and not exists (select 1 from public.refections r where r.id = new.refection_id and r.fuite_id = new.fuite_id) then
    raise exception 'La réfection indiquée n''appartient pas à cette fuite' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and new.prix_id is distinct from old.prix_id then
    new.prix_initial_id := coalesce(old.prix_initial_id, old.prix_id);
  end if;
  new.motif_correction := _motif;
  new.corrigee_par := auth.uid();
  new.corrigee_le := now();

  -- Une unité par prix et par fuite (réglage du marché) : vaut aussi pour les lignes saisies à la main
  -- (contrôlé quand l'article, la quantité ou la présence de la ligne change).
  if new.supprime_le is null
     and (tg_op = 'INSERT' or new.prix_id is distinct from old.prix_id or new.quantite is distinct from old.quantite
          or old.supprime_le is not null or new.fuite_id is distinct from old.fuite_id) then
    select m.une_unite_par_prix_et_fuite into _une_unite from public.marches m where m.id = new.marche_id;
    select p.unite = 'u' into _unitaire from public.prix p where p.id = new.prix_id;
    if coalesce(_une_unite, false) and coalesce(_unitaire, false) then
      select coalesce(sum(l.quantite), 0) into _deja
        from public.lignes_quantites l
       where l.fuite_id = new.fuite_id and l.prix_id = new.prix_id and l.supprime_le is null and l.id <> new.id;
      if _deja + new.quantite > 1 then
        raise exception 'Une seule unité de cet article par fuite (réglage du marché)' using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end
$$;

create trigger f_controler_ligne before insert or update on public.lignes_quantites
  for each row execute function private.controler_ligne_quantite();

-- La règle automatique ne repropose jamais un article remplacé à la main (requalification) :
-- même corps que dans 20261004090300, avec l'article d'origine des lignes manuelles.
create or replace function private.ajouter_ligne_auto(
  p_marche uuid,
  p_fuite uuid,
  p_reparation uuid,
  p_refection uuid,
  p_prix uuid,
  p_quantite numeric,
  p_date date,
  p_unitaire boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _une_unite boolean;
begin
  if p_prix is null or coalesce(p_quantite, 0) <= 0 then
    return;
  end if;
  -- Déjà couvert par une ligne manuelle de la même source (même supprimée : décision du
  -- responsable), y compris une ligne requalifiée depuis cet article
  if exists (
    select 1 from public.lignes_quantites l
     where (l.prix_id = p_prix or l.prix_initial_id = p_prix) and l.origine = 'manuel'
       and (l.reparation_id = p_reparation or l.refection_id = p_refection)
  ) then
    return;
  end if;
  -- Au plus une unité de chaque prix unitaire par fuite (paramètre du marché)
  select m.une_unite_par_prix_et_fuite into _une_unite from public.marches m where m.id = p_marche;
  if p_unitaire and _une_unite and exists (
    select 1 from public.lignes_quantites l
     where l.fuite_id = p_fuite and l.prix_id = p_prix and l.supprime_le is null
  ) then
    return;
  end if;
  insert into public.lignes_quantites
    (marche_id, fuite_id, reparation_id, refection_id, prix_id, quantite, date_execution, origine)
  values
    (p_marche, p_fuite, p_reparation, p_refection, p_prix, p_quantite, p_date, 'auto');
end
$$;

-- -----------------------------------------------------------------------------
-- 3. Vues
-- -----------------------------------------------------------------------------

-- Libellé lisible d'un code de matériau (détails des contrôles).
create function private.libelle_materiau(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_code
    when 'polyethylene' then 'polyéthylène'
    when 'amiante_ciment' then 'amiante-ciment'
    when 'pvc' then 'PVC'
    when 'fonte_ductile' then 'fonte ductile'
    when 'fonte_grise' then 'fonte grise'
    when 'acier_galvanise' then 'acier galvanisé'
    when 'ppr' then 'PPR'
    when 'autre' then 'autre matériau'
    else coalesce(p_code, 'matériau non saisi')
  end
$$;

-- Nombre en écriture française, sans zéros inutiles (2,5 ; 0,75).
create function private.nombre_fr(p_valeur numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(trim_scale(p_valeur)::text, '.', ',')
$$;

-- Articles que propose la règle automatique (R-DER-007) pour chaque réparation et chaque
-- réfection, d'après les mesures saisies : même logique que generer_lignes_reparation et
-- generer_lignes_refection. prix_id nul = aucun article au bordereau pour ces mesures.
create view private.v_prix_proposes with (security_invoker = true) as
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
  left join public.motifs mo on mo.id = r.motif_id
  cross join lateral (values
    ('terrassement'::public.famille_prix, null::text, null::integer,
       (r.resultat = 'reparee' or coalesce(mo.terrassement_paye, false)) and coalesce(r.volume_m3, 0) > 0),
    ('reparation_tuyau'::public.famille_prix, r.materiau::text, r.diametre_mm,
       r.resultat = 'reparee' and r.tuyau_repare),
    ('robinet_pec'::public.famille_prix, null::text, null::integer,
       r.resultat = 'reparee' and r.robinet_pec_change),
    ('collier_pec'::public.famille_prix, null::text, null::integer,
       r.resultat = 'reparee' and r.collier_pec_change),
    ('bouche_a_cle'::public.famille_prix, null::text, null::integer,
       r.resultat = 'reparee' and r.bouche_a_cle_mise_a_niveau and not (r.robinet_pec_change or r.collier_pec_change))
  ) x (famille, materiau, diametre, retenue)
 where r.supprime_le is null and x.retenue
union all
select rf.marche_id, rf.fuite_id, rf.reparation_id, rf.id, 'refection'::public.famille_prix, n.prix_id
  from public.refections rf
  join public.natures_refection n on n.id = rf.nature_id
 where rf.supprime_le is null and rf.resultat = 'faite' and coalesce(rf.surface_m2, 0) > 0;

-- Contrôles de cohérence à l'attachement (non bloquants). Gravité : « alerte » (risque de
-- facturation injustifiée), « avertissement » (oubli probable), « information » (travaux hors
-- bordereau à faire valoir). Réservé aux comptes qui lisent les attachements et les quantités.
create view public.v_controles_attachement with (security_invoker = true) as
with rep as (
  select r.*, f.numero as fuite_numero, f.statut as statut_fuite
    from public.reparations r
    join public.fuites f on f.id = r.fuite_id and f.supprime_le is null
   where r.supprime_le is null
),
derniere_reparee as (
  select distinct on (rep.fuite_id) rep.fuite_id, rep.id, rep.marche_id, rep.fuite_numero
    from rep
   where rep.resultat = 'reparee'
   order by rep.fuite_id, rep.realisee_le desc
),
pieces_pec as (
  select r.fuite_id, px.famille, string_agg(distinct cp.designation, ', ' order by cp.designation) as designations
    from public.reparation_pieces rp
    join public.reparations r on r.id = rp.reparation_id and r.supprime_le is null
    join public.catalogue_pieces cp on cp.id = rp.piece_id
    join public.prix px on px.id = cp.prix_suggere_id
   where rp.supprime_le is null and px.famille in ('robinet_pec', 'collier_pec')
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
         'Ajouter la pièce posée (catalogue) ou décocher la case', null, null
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
         'Ajouter la pièce posée (catalogue) ou décocher la case', null, null
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
  -- Polyéthylène au-delà de 2 m : les articles de réparation PE couvrent 2 m au plus (Q-12)
  select rep.marche_id, rep.fuite_id, rep.fuite_numero, rep.id, null,
         'pe_superieur_2m', 'information',
         'Polyéthylène au-delà de 2 m : excédent hors bordereau, à faire valoir',
         format('%s m posés : %s m au-delà des 2 m couverts par l''article de réparation',
                private.nombre_fr(rep.longueur_pe_m), private.nombre_fr(rep.longueur_pe_m - 2)),
         rep.longueur_pe_m - 2, 'm'
    from rep
   where rep.resultat = 'reparee' and rep.materiau = 'polyethylene' and rep.longueur_pe_m > 2
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

-- Travaux hors bordereau à faire valoir (rien n'est attaché ni facturé automatiquement) :
-- excédent de polyéthylène au-delà de 2 m, réparation sans article (matériau ou diamètre),
-- pièces non couvertes (article suggéré hors bordereau, ou fuite sans aucune ligne de prix
-- de réparation qui couvrirait ses fournitures).
create view public.v_hors_bordereau with (security_invoker = true) as
with rep as (
  select r.*, f.numero as fuite_numero, f.reference_srm, f.adresse, f.zone_id, z.libelle as zone,
         f.secteur_id, s.libelle as secteur
    from public.reparations r
    join public.fuites f on f.id = r.fuite_id and f.supprime_le is null
    left join public.zones z on z.id = f.zone_id
    left join public.secteurs s on s.id = f.secteur_id
   where r.supprime_le is null and r.resultat = 'reparee'
),
travaux as (
  select rep.marche_id, 'pe_au_dela_2m'::text as nature,
         'Polyéthylène au-delà de 2 m'::text as libelle,
         format('Polyéthylène %s mm : %s m posés, excédent au-delà de 2 m',
                coalesce(rep.diametre_mm::text, '?'), private.nombre_fr(rep.longueur_pe_m)) as designation,
         rep.longueur_pe_m - 2 as quantite, 'm'::text as unite,
         rep.id as reparation_id, null::uuid as piece_ligne_id, null::boolean as ajoutee_bureau
    from rep
   where rep.materiau = 'polyethylene' and rep.longueur_pe_m > 2
  union all
  select rep.marche_id, 'reparation_sans_article', 'Réparation sans article au bordereau',
         format('Réparation %s, diamètre %s', private.libelle_materiau(rep.materiau),
                coalesce(rep.diametre_mm || ' mm', 'non saisi')),
         1, 'u', rep.id, null, null
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
         coalesce(cp.designation, rp.designation_libre),
         rp.quantite, coalesce(cp.unite, 'u'), rep.id, rp.id, rp.ajoutee_bureau
    from public.reparation_pieces rp
    join rep on rep.id = rp.reparation_id
    left join public.catalogue_pieces cp on cp.id = rp.piece_id
    left join public.prix ps on ps.id = cp.prix_suggere_id
   where rp.supprime_le is null
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
       t.piece_ligne_id, t.ajoutee_bureau
  from travaux t
  join rep on rep.id = t.reparation_id
 where private.contexte_serveur()
    or (t.marche_id = any ((select private.marches_autorises('attachements', 'lire'))::uuid[])
        and t.marche_id = any ((select private.marches_autorises('quantites', 'lire'))::uuid[]));

-- Quantités : motif, auteur et date de la dernière correction, article d'origine (en fin de liste).
create or replace view public.v_quantites with (security_invoker = true) as
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

-- Pièces posées : « ajoutée au bureau » (futur inventaire des fournitures posées, filtre).
create or replace view public.v_pieces_posees with (security_invoker = true) as
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
  rp.quantite,
  rp.ajoutee_bureau,
  rp.ajoutee_bureau_par,
  rp.ajoutee_bureau_le
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
-- 4. Privilèges
-- -----------------------------------------------------------------------------
grant select on public.v_controles_attachement, public.v_hors_bordereau to authenticated;
grant select on private.v_prix_proposes to authenticated, service_role;

revoke execute on function
  private.profil_de_bureau(uuid, uuid),
  private.piece_ajoutee_au_bureau(uuid, uuid, timestamptz),
  private.peut_completer_reparation(uuid),
  private.marquer_piece_bureau(),
  private.controler_ligne_quantite(),
  private.libelle_materiau(text),
  private.nombre_fr(numeric)
  from public, anon, authenticated;

-- Appelées par les déclencheurs (rôle de l'utilisateur) et par les vues (security_invoker).
grant execute on function
  private.profil_de_bureau(uuid, uuid),
  private.piece_ajoutee_au_bureau(uuid, uuid, timestamptz),
  private.peut_completer_reparation(uuid),
  private.libelle_materiau(text),
  private.nombre_fr(numeric)
  to authenticated, service_role;
grant execute on function
  private.marquer_piece_bureau(),
  private.controler_ligne_quantite()
  to service_role;
