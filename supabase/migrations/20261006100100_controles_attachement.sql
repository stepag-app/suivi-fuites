-- =============================================================================
-- Lot R : contrôles et corrections à l'attachement.
--
-- Décisions d'Issam (2026-10-05) :
--  * toutes les fournitures sont comprises dans les prix de réparation (CPS art. II-15) :
--    aucune pièce n'est payée à part ; une pièce ne change jamais le montant (la facture passe
--    uniquement par les lignes de prix et leur requalification avec motif) ;
--  * le bureau (responsable, administrateur) peut, à l'attachement, corriger les pièces, ajouter
--    une ligne de prix ou requalifier une ligne quand les faits le justifient ;
--  * une réparation = une unité par prix (réglage « une unité par prix et par fuite »
--    inchangé) : le lot sert la traçabilité et la détection des oublis, jamais à gonfler
--    les quantités.
-- Décisions d'Issam (2026-10-06) :
--  * l'inventaire des fournitures posées reflète le réel du terrain : une correction des pièces
--    par le bureau a une nature (remplacement d'une pièce erronée, oubli, retrait d'une pièce non
--    posée) et un motif obligatoire ; la saisie d'origine du réparateur reste toujours en base ;
--  * pas de délai : une pièce saisie par l'auteur de la réparation est « terrain », quels que
--    soient le moment et le canal ; tout ajout, remplacement ou retrait par un autre compte est
--    une correction du bureau ;
--  * longueur de polyéthylène couverte par l'article de réparation réglable par marché.
--
-- Contenu :
--  1. reparation_pieces : provenance (terrain / correction), nature de la correction
--     (remplacement, oubli), pièce remplacée, motif, état (posée, remplacée, retirée), posés ou
--     contrôlés par déclencheur ; correction sur la réparation d'un autre soumise au droit
--     « interventions / modifier ».
--  2. lignes_quantites : motif obligatoire pour toute modification par un utilisateur
--     (ajout manuel, article, quantité, suppression), article d'origine gardé à la
--     requalification (la règle automatique ne le repropose plus), une unité par prix et
--     par fuite aussi pour les lignes saisies à la main.
--  3. marches.longueur_pe_max_m : seuil du polyéthylène (défaut 2 m).
--  4. Vues : private.v_prix_proposes (articles que propose la règle R-DER-007),
--     v_controles_attachement (oublis probables, lignes incohérentes, polyéthylène au-delà du
--     seuil, réparations sans article), v_hors_bordereau (travaux à faire valoir),
--     v_pieces_reelles (inventaire réel) ; v_pieces_posees, v_fuites_export et
--     v_controles_attachement ne comptent plus les pièces remplacées ou retirées ; v_anomalies
--     suit le seuil du marché ; v_quantites et v_pieces_posees reçoivent les nouvelles colonnes
--     (en fin de liste).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Pièces posées : déclaration du terrain et corrections du bureau
-- -----------------------------------------------------------------------------
alter table public.reparation_pieces
  add column provenance text not null default 'terrain',
  add column nature_correction text,
  add column remplace_piece_id uuid references public.reparation_pieces (id),
  add column motif_correction text,
  add column etat text not null default 'posee',
  add column etat_par uuid references public.profils (id),
  add column etat_le timestamptz,
  add column motif_retrait text,
  add column motif_modification text;

comment on column public.reparation_pieces.provenance is
  'terrain : saisie par l''auteur de la réparation (réparateur, ou compte qui l''a saisie) ; correction : ajoutée par un autre compte (bureau). Posée par déclencheur';
comment on column public.reparation_pieces.nature_correction is
  'Correction du bureau : remplacement (d''une pièce erronée, remplace_piece_id) ou oubli ; nulle pour le terrain. Posée par déclencheur';
comment on column public.reparation_pieces.remplace_piece_id is
  'Pièce remplacée par celle-ci (même réparation) : elle reste en base, marquée « remplacee »';
comment on column public.reparation_pieces.motif_correction is
  'Motif de la correction qui a créé la pièce (oubli, remplacement), obligatoire pour le bureau';
comment on column public.reparation_pieces.etat is
  'posee : dans l''inventaire réel ; remplacee, retiree : hors inventaire, gardée pour la trace (jamais supprimée)';
comment on column public.reparation_pieces.motif_retrait is
  'Motif du retrait d''une pièce non posée (erreur de saisie), obligatoire';
comment on column public.reparation_pieces.motif_modification is
  'Motif envoyé avec un ajout, un remplacement ou un retrait (écriture seule : vidé par le déclencheur, gardé dans motif_correction ou motif_retrait)';

-- Pièces existantes : celles saisies par un autre compte que l'auteur de la réparation sont des
-- corrections du bureau (oubli), avec un motif de reprise.
update public.reparation_pieces rp
   set provenance = 'correction',
       nature_correction = 'oubli',
       motif_correction = 'Reprise : pièce ajoutée par un autre compte que l''auteur de la réparation, avant le suivi des corrections'
  from public.reparations r
 where r.id = rp.reparation_id
   and rp.saisi_par is not null
   and rp.saisi_par is distinct from r.auteur_terrain_id
   and rp.saisi_par is distinct from r.saisi_par;

alter table public.reparation_pieces
  add constraint reparation_pieces_provenance check (provenance in ('terrain', 'correction')),
  add constraint reparation_pieces_nature check (coalesce(
    (provenance = 'terrain' and nature_correction is null)
    or (provenance = 'correction' and remplace_piece_id is null and nature_correction = 'oubli')
    or (provenance = 'correction' and remplace_piece_id is not null and nature_correction = 'remplacement'),
    false)),
  add constraint reparation_pieces_motif_correction check (
    (provenance = 'terrain' and remplace_piece_id is null) or nullif(btrim(motif_correction), '') is not null),
  add constraint reparation_pieces_remplace_autre check (remplace_piece_id <> id),
  add constraint reparation_pieces_etat check (etat in ('posee', 'remplacee', 'retiree')),
  add constraint reparation_pieces_etat_date check ((etat = 'posee') = (etat_le is null)),
  add constraint reparation_pieces_motif_retrait check (etat <> 'retiree' or nullif(btrim(motif_retrait), '') is not null);

create index reparation_pieces_remplace_idx on public.reparation_pieces (remplace_piece_id)
  where remplace_piece_id is not null;

-- Auteur d'une réparation : le compte qui l'a faite sur le terrain (auteur_terrain_id) ou qui l'a
-- saisie (saisi_par : fiche papier recopiée au bureau). Ses pièces sont la déclaration du terrain,
-- quels que soient le moment et le canal (tablette ou web) : aucun délai.
create function private.est_auteur_reparation(p_reparation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reparations r
     where r.id = p_reparation and auth.uid() in (r.auteur_terrain_id, r.saisi_par)
  )
$$;

-- Droit de corriger la réparation d'un autre : « interventions / modifier » avec sa portée
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

-- Droit de remplacer ou de retirer une pièce : l'auteur de la réparation pour une pièce du terrain
-- (une correction du bureau seulement s'il peut modifier toutes les pièces) ; un autre compte avec
-- le droit de corriger la réparation d'un autre. (private.peut renvoie null, et non false, quand
-- l'auteur est inconnu : d'où le coalesce.)
create function private.peut_corriger_piece(p_reparation uuid, p_marche uuid, p_provenance text, p_saisi_par uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.est_auteur_reparation(p_reparation)
      then p_provenance = 'terrain'
           or coalesce(private.peut(p_marche, 'interventions', 'modifier', null, p_saisi_par), false)
    else private.peut_completer_reparation(p_reparation)
  end
$$;

-- Remplacement : la pièce remplacée reste en base, marquée « remplacée » (hors inventaire réel).
-- Appelée par le déclencheur à l'insertion de la pièce qui la remplace ; contrôle les droits de
-- l'utilisateur, puis écrit avec ceux du propriétaire (la marque n'est pas une modification à la
-- main) ; le journal garde l'utilisateur.
create function private.remplacer_piece(p_piece uuid, p_reparation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _p public.reparation_pieces;
begin
  select * into _p from public.reparation_pieces where id = p_piece for update;
  if _p.id is null or _p.reparation_id is distinct from p_reparation or _p.supprime_le is not null then
    raise exception 'Pièce à remplacer introuvable sur cette réparation' using errcode = 'check_violation';
  end if;
  if _p.etat <> 'posee' then
    raise exception 'Pièce déjà remplacée ou retirée' using errcode = 'check_violation';
  end if;
  if not private.peut_corriger_piece(_p.reparation_id, _p.marche_id, _p.provenance, _p.saisi_par) then
    raise exception 'Correction refusée : pièce saisie par un autre compte' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.reparations r join public.fuites f on f.id = r.fuite_id
              where r.id = p_reparation and f.verrouillee_le is not null)
     and not private.peut(_p.marche_id, 'interventions', 'valider') then
    raise exception 'Fuite verrouillée : modification réservée au responsable' using errcode = 'insufficient_privilege';
  end if;
  update public.reparation_pieces
     set etat = 'remplacee', etat_par = auth.uid(), etat_le = now()
   where id = p_piece;
end
$$;

-- Déclencheur des pièces posées : provenance, nature, état et motifs posés par le serveur.
--  * Ajout par l'auteur de la réparation : terrain (motif seulement s'il remplace une pièce).
--  * Ajout par un autre compte : correction du bureau (oubli, ou remplacement si
--    remplace_piece_id), motif obligatoire, droit de corriger la réparation d'un autre.
--  * Retrait (etat → retiree) : motif obligatoire ; la pièce reste telle que saisie.
--  * Une pièce de l'auteur ne se modifie ni ne se supprime par un autre compte, une correction du
--    bureau par personne : on la remplace ou on la retire. Une pièce remplacée ou retirée est figée.
--  * Remplacer ou retirer : private.peut_corriger_piece (la règle « siennes » de
--    avant_modification_saisie ne s'applique pas aux pièces, faute d'auteur terrain sur la ligne).
create function private.controler_piece()
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
  _donnees := row(new.reparation_id, new.piece_id, new.designation_libre, new.quantite, new.supprime_le)
              is distinct from row(old.reparation_id, old.piece_id, old.designation_libre, old.quantite, old.supprime_le);
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

create trigger d_controler_piece before insert or update on public.reparation_pieces
  for each row execute function private.controler_piece();

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
-- 3. Seuil du polyéthylène, réglable par marché (Paramètres > Marché, droit « paramètres /
--    modifier ») : longueur couverte par l'article de réparation ; au-delà, l'excédent est hors
--    bordereau (contrôles, travaux hors bordereau, anomalies).
-- -----------------------------------------------------------------------------
alter table public.marches
  add column longueur_pe_max_m numeric(5,2) not null default 2
    constraint marches_longueur_pe_max_m check (longueur_pe_max_m > 0);

comment on column public.marches.longueur_pe_max_m is
  'Longueur de polyéthylène (m) couverte par l''article de réparation ; au-delà : excédent hors bordereau, à faire valoir';

-- -----------------------------------------------------------------------------
-- 4. Vues
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
-- Pièces : inventaire réel seulement (ni remplacées ni retirées).
create view public.v_controles_attachement with (security_invoker = true) as
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
  select r.fuite_id, px.famille, string_agg(distinct cp.designation, ', ' order by cp.designation) as designations
    from public.reparation_pieces rp
    join public.reparations r on r.id = rp.reparation_id and r.supprime_le is null
    join public.catalogue_pieces cp on cp.id = rp.piece_id
    join public.prix px on px.id = cp.prix_suggere_id
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

-- Travaux hors bordereau à faire valoir (rien n'est attaché ni facturé automatiquement) :
-- excédent de polyéthylène au-delà du seuil du marché, réparation sans article (matériau ou
-- diamètre), pièces de l'inventaire réel non couvertes (article suggéré hors bordereau, ou fuite
-- sans aucune ligne de prix de réparation qui couvrirait ses fournitures).
create view public.v_hors_bordereau with (security_invoker = true) as
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
         coalesce(cp.designation, rp.designation_libre),
         rp.quantite, coalesce(cp.unite, 'u'), rep.id, rp.id, rp.provenance, rp.nature_correction
    from public.reparation_pieces rp
    join rep on rep.id = rp.reparation_id
    left join public.catalogue_pieces cp on cp.id = rp.piece_id
    left join public.prix ps on ps.id = cp.prix_suggere_id
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

-- Inventaire réel des fournitures posées : pièces du terrain ni remplacées ni retirées, et
-- corrections du bureau (oubli, remplacement), avec leur provenance, leur nature, leur motif,
-- leur auteur et la pièce remplacée. Base du futur inventaire et du rapprochement avec Dolibarr.
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
  rp.piece_id,
  coalesce(cp.designation, rp.designation_libre) as designation,
  cp.famille,
  coalesce(cp.unite, 'u') as unite,
  rp.quantite,
  rp.provenance,
  rp.nature_correction,
  rp.motif_correction,
  rp.saisi_par,
  ps.nom_complet as saisi_par_nom,
  rp.cree_le as saisi_le,
  rp.remplace_piece_id,
  coalesce(cpa.designation, pa.designation_libre) as designation_remplacee,
  pa.quantite as quantite_remplacee
from public.reparation_pieces rp
join public.reparations r on r.id = rp.reparation_id and r.supprime_le is null
join public.fuites f on f.id = r.fuite_id and f.supprime_le is null
left join public.catalogue_pieces cp on cp.id = rp.piece_id
left join public.zones z on z.id = f.zone_id
left join public.secteurs s on s.id = f.secteur_id
left join public.equipes e on e.id = r.equipe_id
left join public.profils pc on pc.id = r.auteur_terrain_id
left join public.profils ps on ps.id = rp.saisi_par
left join public.reparation_pieces pa on pa.id = rp.remplace_piece_id
left join public.catalogue_pieces cpa on cpa.id = pa.piece_id
where rp.supprime_le is null and rp.etat = 'posee';

-- Pièces posées (exports) : désormais l'inventaire réel (ni remplacées ni retirées), avec la
-- provenance, la nature et le motif de la correction en fin de liste.
create or replace view public.v_pieces_posees with (security_invoker = true) as
select
  id, marche_id, reparation_id, fuite_id, fuite_numero, reference_srm, zone_id, zone, secteur_id, secteur,
  equipe_id, equipe, chef_id, chef, realisee_le, jour, piece_id, designation, famille, unite, quantite,
  provenance, nature_correction, motif_correction
from public.v_pieces_reelles;

-- Fuites enrichies pour les exports : corps de 20261004210000, pièces de l'inventaire réel.
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
  select string_agg(coalesce(cp.designation, p.designation_libre) || ' × ' || trim_scale(p.quantite), ' ; '
                    order by coalesce(cp.designation, p.designation_libre)) as pieces
    from public.reparation_pieces p
    join public.reparations rr on rr.id = p.reparation_id and rr.supprime_le is null
    left join public.catalogue_pieces cp on cp.id = p.piece_id
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

-- Anomalies : corps de 20261004220000, seul le seuil du polyéthylène suit le marché
-- (marches.longueur_pe_max_m ; code et libellé inchangés).
create or replace view public.v_anomalies with (security_invoker = true) as
with rep as (
  select r.*, f.numero, f.date_detection, f.avis_terrassement_srm_le, m.jalons_client, m.longueur_pe_max_m
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

-- -----------------------------------------------------------------------------
-- 5. Privilèges
-- -----------------------------------------------------------------------------
grant select on public.v_controles_attachement, public.v_hors_bordereau, public.v_pieces_reelles to authenticated;
grant select on private.v_prix_proposes to authenticated, service_role;

revoke execute on function
  private.est_auteur_reparation(uuid),
  private.peut_completer_reparation(uuid),
  private.peut_corriger_piece(uuid, uuid, text, uuid),
  private.remplacer_piece(uuid, uuid),
  private.controler_piece(),
  private.controler_ligne_quantite(),
  private.libelle_materiau(text),
  private.nombre_fr(numeric)
  from public, anon, authenticated;

-- Appelées par les déclencheurs (rôle de l'utilisateur) et par les vues (security_invoker).
grant execute on function
  private.est_auteur_reparation(uuid),
  private.peut_completer_reparation(uuid),
  private.peut_corriger_piece(uuid, uuid, text, uuid),
  private.remplacer_piece(uuid, uuid),
  private.libelle_materiau(text),
  private.nombre_fr(numeric)
  to authenticated, service_role;
grant execute on function
  private.controler_piece(),
  private.controler_ligne_quantite()
  to service_role;
