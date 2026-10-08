-- =============================================================================
-- Chantier v2, S1 / fichier 3 : circuit de la fuite et validation par étape (V1 à V7).
-- Contrat pour les écrans : docs/lots/chantier-v2-base-s1.md.
--
--  V1  Validation par étape (détection = la fuite, chaque réparation, chaque réfection) par
--      le droit « valider » du type de donnée (responsable, administrateur) : validee_le et
--      validee_par posés par la base ; valider_etapes (lot « Valider (n) ») ; v_a_valider.
--  V2  Avant validation, l'auteur modifie (droit « siennes ») ; après, modification et
--      suppression réservées au droit « valider » : l'agent ajoute un nouvel élément (à valider).
--      Pièces et ouvriers d'une réparation validée : idem.
--  V3  Photos : changement de type, rattachement, retrait logique (motif facultatif) ; une photo
--      déposée avant la validation de son étape n'est plus modifiable ni retirable par l'agent.
--  V5  Motif obligatoire (journalisé) quand un autre que l'auteur change la date de détection,
--      la référence ou la position d'une fuite ; « détectée par » (auteur terrain) choisi par le
--      droit « valider » seulement, parmi les comptes affectés au marché ; marque
--      « saisie différée ».
--  V6  Après un lot arrêté, un agent peut encore ajouter réparation, réfection et photos : la fuite
--      revient dans « À attacher » (solde de v_a_attacher) ; ce qui existait au verrouillage reste
--      figé ; un nouvel arrêt reverrouille la fuite.
--  V7  Réparation possible dès la détection (aucune condition) ; seule une réparation « réparée »
--      validée appelle la réfection (v_a_refectionner, notification du fichier suivant) ; pas de
--      verrou automatique.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colonnes
-- -----------------------------------------------------------------------------
alter table public.fuites
  add column validee_le timestamptz,
  add column validee_par uuid references public.profils (id),
  add column motif_modification text,
  add column motif_correction text,
  add column corrigee_par uuid references public.profils (id),
  add column corrigee_le timestamptz,
  add column saisie_differee boolean not null default false;

comment on column public.fuites.validee_le is
  'Validation de la détection (V1) par le droit « fuites / valider » ; posée par la base (valider_etapes)';
comment on column public.fuites.motif_modification is
  'Motif envoyé avec une correction de la date de détection, de la référence ou de la position (écriture seule : vidé par le déclencheur, gardé dans motif_correction)';
comment on column public.fuites.motif_correction is
  'Motif de la dernière correction de date, référence ou position (V5) ; ancienne valeur au journal';
comment on column public.fuites.saisie_differee is
  'Saisie différée (V5) : la date de détection précède de plus de 12 h la saisie, faite au bureau (web, papier) ou à la place d''un agent ; posée par la base';

alter table public.reparations
  add column validee_le timestamptz,
  add column validee_par uuid references public.profils (id);
comment on column public.reparations.validee_le is
  'Validation de la réparation (V1) par le droit « interventions / valider » ; posée par la base';

alter table public.refections
  add column validee_le timestamptz,
  add column validee_par uuid references public.profils (id);
comment on column public.refections.validee_le is
  'Validation de la réfection (V1) par le droit « refections / valider » ; posée par la base';

alter table public.photos add column motif_retrait text;
comment on column public.photos.motif_retrait is 'Motif facultatif du retrait logique d''une photo (V3) ; le fichier est gardé';

create index fuites_a_valider_idx on public.fuites (marche_id) where validee_le is null and supprime_le is null;
create index reparations_a_valider_idx on public.reparations (marche_id) where validee_le is null and supprime_le is null;
create index refections_a_valider_idx on public.refections (marche_id) where validee_le is null and supprime_le is null;

-- -----------------------------------------------------------------------------
-- 2. Fonctions internes (lues avec les droits du propriétaire : le contrôle ne dépend pas de ce
--    que l'utilisateur peut lire)
-- -----------------------------------------------------------------------------
create function private.validation_etape_photo(p_fuite uuid, p_reparation uuid, p_refection uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_refection is not null then (select r.validee_le from public.refections r where r.id = p_refection)
    when p_reparation is not null then (select r.validee_le from public.reparations r where r.id = p_reparation)
    else (select f.validee_le from public.fuites f where f.id = p_fuite)
  end
$$;

create function private.fuite_verrouillee_le(p_fuite uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select f.verrouillee_le from public.fuites f where f.id = p_fuite
$$;

create function private.infos_reparation(p_reparation uuid, out fuite_id uuid, out cree_le timestamptz, out validee_le timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.fuite_id, r.cree_le, r.validee_le from public.reparations r where r.id = p_reparation
$$;

create function private.est_affecte(p_profil uuid, p_marche uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.affectations a where a.profil_id = p_profil and a.marche_id = p_marche)
$$;

-- Une réparation appelle-t-elle une réfection ? Réparée, fouille hors terrain naturel, revêtement
-- à refaire (nature inconnue : oui). Même règle que le statut automatique. Redéfinissable (P8).
create function private.refection_attendue(p_reparation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.resultat = 'reparee'
           and r.emplacement is distinct from 'terrain_naturel'
           and coalesce(n.necessite_refection, true)
      from public.reparations r
      left join public.natures_refection n on n.id = r.nature_revetement_id
     where r.id = p_reparation
  ), false)
$$;

-- -----------------------------------------------------------------------------
-- 3. Avant insertion : date de dépôt réelle, validation à la création, « détectée par »
--    (corps de 20261004090300 complété)
-- -----------------------------------------------------------------------------
create or replace function private.avant_insertion_saisie()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _type public.type_donnee := case tg_table_name
    when 'fuites' then 'fuites'
    when 'refections' then 'refections'
    else 'interventions'
  end::public.type_donnee;
begin
  if not private.appel_systeme() then
    new.saisi_par := auth.uid();
    new.supprime_le := null;
    new.supprime_par := null;
    -- Date de dépôt sur le serveur (photos antérieures à la validation, lignes antérieures au verrou)
    new.cree_le := now();
  end if;
  if tg_table_name in ('fuites', 'reparations', 'refections', 'photos') then
    new.auteur_terrain_id := coalesce(new.auteur_terrain_id, new.saisi_par);
  end if;

  if tg_table_name in ('fuites', 'reparations', 'refections') and not private.appel_systeme() then
    -- Saisie à la place d'un agent (« détectée par », auteur terrain choisi) : droit « valider »,
    -- agent affecté au marché.
    if new.auteur_terrain_id is distinct from auth.uid() then
      if not private.peut(new.marche_id, _type, 'valider') then
        raise exception 'Saisie à la place d''un agent réservée au responsable' using errcode = 'insufficient_privilege';
      end if;
      if not private.est_affecte(new.auteur_terrain_id, new.marche_id) then
        raise exception 'L''agent choisi n''est pas affecté à ce marché' using errcode = 'check_violation';
      end if;
    end if;
    -- Validée dès la création : seulement par qui peut valider (« Enregistrer et valider »)
    if new.validee_le is not null and private.peut(new.marche_id, _type, 'valider') then
      new.validee_le := now();
      new.validee_par := auth.uid();
    else
      new.validee_le := null;
      new.validee_par := null;
    end if;
  end if;

  if tg_table_name = 'fuites' then
    if not private.appel_systeme() then
      new.numero := null;
      new.verrouillee_le := null;
      new.verrouillee_par := null;
      new.motif_correction := nullif(btrim(new.motif_modification), '');
      new.corrigee_par := case when new.motif_correction is null then null else auth.uid() end;
      new.corrigee_le := case when new.motif_correction is null then null else now() end;
      new.motif_modification := null;
    end if;
    if new.numero is null then
      new.numero := private.prochain_numero(new.marche_id, 'fuite');
    end if;
  end if;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- 4. Avant modification : validation, étape validée, photos, motif, « détectée par »
--    (corps de 20261004200000 complété)
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
    when 'refections' then 'refections'
    else 'interventions'
  end::public.type_donnee;
  _etape boolean := tg_table_name in ('fuites', 'reparations', 'refections');
  _auteur uuid := case when tg_table_name in ('fuites', 'reparations', 'refections', 'photos')
                       then (to_jsonb(old) ->> 'auteur_terrain_id')::uuid end;
  -- Colonnes hors « données » : suppression, verrou, validation, motif, marques posées par la base
  _techniques constant text[] := array[
    'supprime_le', 'supprime_par', 'modifie_le', 'verrouillee_le', 'verrouillee_par',
    'validee_le', 'validee_par', 'motif_modification', 'motif_correction', 'corrigee_par',
    'corrigee_le', 'saisie_differee'
  ];
  _verrou timestamptz;
  _donnees_modifiees boolean;
  _change boolean;
  _validation timestamptz;
  _motif text;
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

  -- Toute modification des données demande le droit « modifier »
  _donnees_modifiees := (to_jsonb(new) - _techniques) is distinct from (to_jsonb(old) - _techniques);
  if _donnees_modifiees
     and not private.peut(old.marche_id, _type, 'modifier', _auteur, old.saisi_par) then
    raise exception 'Modification non autorisée' using errcode = 'insufficient_privilege';
  end if;
  _change := _donnees_modifiees or new.supprime_le is distinct from old.supprime_le;

  if _etape then
    -- V1 : validation (ou son annulation) par le droit « valider » ; date et auteur posés ici
    if new.validee_le is distinct from old.validee_le then
      if not private.peut(old.marche_id, _type, 'valider') then
        raise exception 'Validation réservée au responsable' using errcode = 'insufficient_privilege';
      end if;
      if old.validee_le is not null and new.validee_le is not null then
        new.validee_le := old.validee_le;
        new.validee_par := old.validee_par;
      elsif new.validee_le is not null then
        new.validee_le := now();
        new.validee_par := auth.uid();
      else
        new.validee_par := null;
      end if;
    else
      new.validee_par := old.validee_par;
    end if;

    -- V2 : étape validée → modification et suppression réservées à qui peut valider
    if old.validee_le is not null and _change
       and not private.peut(old.marche_id, _type, 'valider') then
      raise exception 'Étape validée : modification réservée au responsable (ajoutez un nouvel élément, il sera à valider)'
        using errcode = 'insufficient_privilege';
    end if;

    -- V5 : auteur terrain (« détectée par ») changé par le droit « valider », agent du marché
    if new.auteur_terrain_id is distinct from old.auteur_terrain_id then
      if not private.peut(old.marche_id, _type, 'valider') then
        raise exception 'Changer l''auteur de la saisie est réservé au responsable' using errcode = 'insufficient_privilege';
      end if;
      if new.auteur_terrain_id is not null and not private.est_affecte(new.auteur_terrain_id, old.marche_id) then
        raise exception 'L''agent choisi n''est pas affecté à ce marché' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- V5 : motif obligatoire quand un autre que l'auteur corrige la date, la référence ou la position
  if tg_table_name = 'fuites' then
    _motif := nullif(btrim(new.motif_modification), '');
    new.motif_modification := null;
    new.motif_correction := old.motif_correction;
    new.corrigee_par := old.corrigee_par;
    new.corrigee_le := old.corrigee_le;
    if new.date_detection is distinct from old.date_detection
       or new.reference_srm is distinct from old.reference_srm
       or (to_jsonb(new) -> 'position') is distinct from (to_jsonb(old) -> 'position') then
      if _motif is null and auth.uid() is distinct from old.auteur_terrain_id and auth.uid() is distinct from old.saisi_par then
        raise exception 'Motif obligatoire pour corriger la date de détection, la référence ou la position'
          using errcode = 'check_violation';
      end if;
      if _motif is not null then
        new.motif_correction := _motif;
        new.corrigee_par := auth.uid();
        new.corrigee_le := now();
      end if;
    end if;
  end if;

  -- V3 : photo déposée avant la validation de son étape → réservée au droit « valider »
  if tg_table_name = 'photos' and _change then
    _validation := private.validation_etape_photo(old.fuite_id, old.reparation_id, old.refection_id);
    if _validation is not null and old.cree_le <= _validation
       and not private.peut(old.marche_id, 'photos', 'valider') then
      raise exception 'Photo enregistrée avant la validation : seul le responsable peut la modifier ou la retirer'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Verrouillage d'une fuite (lot arrêté ou responsable)
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
-- 5. Fuite verrouillée (V6) et réparation validée (V2) : données rattachées
--    (corps de 20261004090300 complété)
-- -----------------------------------------------------------------------------
create or replace function private.controler_verrou_fuite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _ligne jsonb := to_jsonb(coalesce(new, old));
  _marche uuid := (_ligne ->> 'marche_id')::uuid;
  _type public.type_donnee := case tg_table_name
    when 'photos' then 'photos'
    when 'lignes_quantites' then 'quantites'
    when 'refections' then 'refections'
    else 'interventions'
  end::public.type_donnee;
  _rep record;
  _fuite uuid;
  _cree timestamptz;
  _verrou timestamptz;
begin
  if private.appel_systeme() then
    return coalesce(new, old);
  end if;

  if tg_table_name in ('reparation_ouvriers', 'reparation_pieces') then
    select * into _rep from private.infos_reparation((_ligne ->> 'reparation_id')::uuid);
    _fuite := _rep.fuite_id;
    _cree := _rep.cree_le;
    -- V2 : réparation validée → pièces et ouvriers réservés au droit « valider »
    if _rep.validee_le is not null and not private.peut(_marche, 'interventions', 'valider') then
      raise exception 'Réparation validée : pièces et ouvriers réservés au responsable (ajoutez une nouvelle réparation)'
        using errcode = 'insufficient_privilege';
    end if;
  else
    _fuite := (_ligne ->> 'fuite_id')::uuid;
    _cree := case when tg_op = 'INSERT' then null else (to_jsonb(old) ->> 'cree_le')::timestamptz end;
  end if;

  _verrou := private.fuite_verrouillee_le(_fuite);
  if _verrou is null or private.peut(_marche, _type, 'valider') then
    return coalesce(new, old);
  end if;

  -- V6 : après un lot arrêté, l'agent ajoute réparation, réfection ou photo ; ce qu'il a ajouté
  -- depuis le verrouillage reste modifiable jusqu'au lot suivant ; le reste est figé.
  if tg_table_name in ('reparations', 'refections', 'photos') and (tg_op = 'INSERT' or _cree > _verrou) then
    return coalesce(new, old);
  end if;
  if tg_table_name in ('reparation_ouvriers', 'reparation_pieces') and _cree > _verrou then
    return coalesce(new, old);
  end if;
  raise exception 'Fuite verrouillée : modification réservée au responsable'
    using errcode = 'insufficient_privilege';
end
$$;

-- Un nouvel arrêt reverrouille les fuites déjà verrouillées du lot (date du verrou avancée) : les
-- ajouts faits depuis le lot précédent se figent à leur tour (même réglage que le verrouillage).
create function private.reverrouiller_fuites_lot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.statut = 'brouillon' and new.statut = 'arrete'
     and coalesce((select r.verrouiller_a_l_arret from public.parametres_attachement r where r.marche_id = new.marche_id), true) then
    update public.fuites f
       set verrouillee_le = now(), verrouillee_par = coalesce(auth.uid(), f.verrouillee_par)
     where f.verrouillee_le is not null
       and f.verrouillee_le < now()
       and f.id in (select l.fuite_id from public.attachement_lignes l where l.attachement_id = new.id);
  end if;
  return null;
end
$$;

create trigger reverrouiller_fuites after update on public.attachements
  for each row execute function private.reverrouiller_fuites_lot();

-- -----------------------------------------------------------------------------
-- 6. Saisie différée (V5)
-- -----------------------------------------------------------------------------
create function private.marquer_saisie_differee()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.saisie_differee := coalesce(
    new.date_detection < new.cree_le - interval '12 hours'
    and (new.source_saisie <> 'tablette' or new.saisi_par is distinct from new.auteur_terrain_id),
    false);
  return new;
end
$$;

create trigger g_saisie_differee before insert or update on public.fuites
  for each row execute function private.marquer_saisie_differee();

update public.fuites
   set saisie_differee = true
 where date_detection < cree_le - interval '12 hours'
   and (source_saisie <> 'tablette' or saisi_par is distinct from auteur_terrain_id);

-- -----------------------------------------------------------------------------
-- 7. Validation en lot et écrans
-- -----------------------------------------------------------------------------

-- « Valider (n) » : p_elements = [{"etape": "detection" | "reparation" | "refection", "id": uuid}].
-- Droits de l'appelant (règles RLS et déclencheurs : droit « valider » du type de donnée).
-- Retourne le nombre d'étapes validées (déjà validées ou supprimées : ignorées).
create function public.valider_etapes(p_elements jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  _e record;
  _n integer := 0;
  _k integer;
begin
  if p_elements is null or jsonb_typeof(p_elements) <> 'array' then
    raise exception 'Liste d''étapes attendue' using errcode = 'invalid_parameter_value';
  end if;
  for _e in select * from jsonb_to_recordset(p_elements) as x (etape text, id uuid) loop
    if _e.id is null then
      raise exception 'Étape sans identifiant' using errcode = 'invalid_parameter_value';
    end if;
    case _e.etape
      when 'detection' then
        update public.fuites set validee_le = now()
         where id = _e.id and validee_le is null and supprime_le is null;
      when 'reparation' then
        update public.reparations set validee_le = now()
         where id = _e.id and validee_le is null and supprime_le is null;
      when 'refection' then
        update public.refections set validee_le = now()
         where id = _e.id and validee_le is null and supprime_le is null;
      else
        raise exception 'Étape inconnue : %', _e.etape using errcode = 'invalid_parameter_value';
    end case;
    get diagnostics _k = row_count;
    _n := _n + _k;
  end loop;
  return _n;
end
$$;

comment on function public.valider_etapes(jsonb) is
  'Valide en lot des détections, réparations et réfections ([{etape, id}]) ; droit « valider » du type de donnée (V1).';

-- Étapes à valider (écran « À valider », panneau et tablette) : seulement les marchés où le compte
-- a le droit « valider » de l'étape. nb_photos : photos de l'étape (avertissement « aucune photo »).
create view public.v_a_valider with (security_invoker = true) as
select
  'detection'::text as etape,
  f.id,
  f.marche_id,
  f.id as fuite_id,
  f.numero as fuite_numero,
  f.reference_srm,
  f.adresse,
  f.statut,
  null::text as resultat,
  f.date_detection as date_etape,
  f.auteur_terrain_id,
  pa.nom_complet as auteur,
  f.saisi_par,
  f.cree_le,
  f.saisie_differee,
  f.validee_le as fuite_validee_le,
  (select count(*) from public.photos p
    where p.fuite_id = f.id and p.reparation_id is null and p.refection_id is null and p.supprime_le is null) as nb_photos
from public.fuites f
left join public.profils pa on pa.id = f.auteur_terrain_id
where f.validee_le is null and f.supprime_le is null
  and f.marche_id = any ((select private.marches_autorises('fuites', 'valider'))::uuid[])
union all
select
  'reparation',
  r.id,
  r.marche_id,
  r.fuite_id,
  f.numero,
  f.reference_srm,
  f.adresse,
  f.statut,
  r.resultat::text,
  r.realisee_le,
  r.auteur_terrain_id,
  pa.nom_complet,
  r.saisi_par,
  r.cree_le,
  f.saisie_differee,
  f.validee_le,
  (select count(*) from public.photos p
    where p.reparation_id = r.id and p.refection_id is null and p.supprime_le is null)
from public.reparations r
join public.fuites f on f.id = r.fuite_id and f.supprime_le is null
left join public.profils pa on pa.id = r.auteur_terrain_id
where r.validee_le is null and r.supprime_le is null
  and r.marche_id = any ((select private.marches_autorises('interventions', 'valider'))::uuid[])
union all
select
  'refection',
  rf.id,
  rf.marche_id,
  rf.fuite_id,
  f.numero,
  f.reference_srm,
  f.adresse,
  f.statut,
  rf.resultat::text,
  rf.realisee_le,
  rf.auteur_terrain_id,
  pa.nom_complet,
  rf.saisi_par,
  rf.cree_le,
  f.saisie_differee,
  f.validee_le,
  (select count(*) from public.photos p where p.refection_id = rf.id and p.supprime_le is null)
from public.refections rf
join public.fuites f on f.id = rf.fuite_id and f.supprime_le is null
left join public.profils pa on pa.id = rf.auteur_terrain_id
where rf.validee_le is null and rf.supprime_le is null
  and rf.marche_id = any ((select private.marches_autorises('refections', 'valider'))::uuid[]);

-- Réfections à faire (équipe de réfection, V7) : réparation « réparée » validée qui appelle une
-- réfection, et aucune réfection saisie sur la fuite depuis.
create view public.v_a_refectionner with (security_invoker = true) as
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
  select x.*
    from public.reparations x
   where x.fuite_id = f.id and x.supprime_le is null and x.validee_le is not null
     and private.refection_attendue(x.id)
   order by x.realisee_le desc
   limit 1
) r on true
where f.supprime_le is null
  and not exists (select 1 from public.refections rf
                   where rf.fuite_id = f.id and rf.supprime_le is null and rf.cree_le >= r.cree_le);

grant select on public.v_a_valider, public.v_a_refectionner to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Privilèges
-- -----------------------------------------------------------------------------
revoke execute on function
  private.validation_etape_photo(uuid, uuid, uuid),
  private.fuite_verrouillee_le(uuid),
  private.infos_reparation(uuid),
  private.est_affecte(uuid, uuid),
  private.refection_attendue(uuid),
  private.reverrouiller_fuites_lot(),
  private.marquer_saisie_differee(),
  private.avant_insertion_saisie(),
  private.avant_modification_saisie(),
  private.controler_verrou_fuite(),
  public.valider_etapes(jsonb)
  from public, anon;
grant execute on function
  private.validation_etape_photo(uuid, uuid, uuid),
  private.fuite_verrouillee_le(uuid),
  private.infos_reparation(uuid),
  private.est_affecte(uuid, uuid),
  private.refection_attendue(uuid),
  public.valider_etapes(jsonb)
  to authenticated, service_role;
grant execute on function
  private.reverrouiller_fuites_lot(),
  private.marquer_saisie_differee(),
  private.avant_insertion_saisie(),
  private.avant_modification_saisie(),
  private.controler_verrou_fuite()
  to service_role;
