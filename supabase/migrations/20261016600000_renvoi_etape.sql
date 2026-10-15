-- =============================================================================
-- Renvoi d'une étape à l'agent (dévalidation) : le responsable rend une détection, une réparation ou
-- une réfection à son agent pour qu'il la corrige (saisie erronée, pièces oubliées), avec un motif.
--
--  * renvoyer_etape(etape, id, motif) : droit « valider » de l'étape ; validée ou non, l'étape repasse
--    « à valider » (validee_le vidée) et porte le motif, la date et l'auteur du renvoi ; l'agent la
--    modifie de nouveau (droit « modifier siennes », V2) : champs, pièces, ouvriers, photos.
--  * Refusé quand la fuite est verrouillée par un lot arrêté et que l'étape précède le verrou (V6) :
--    l'agent ne pourrait rien corriger ; le responsable corrige lui-même ou rouvre le lot.
--  * Notification « etape_a_corriger » à l'agent de l'étape (auteur terrain), hors circuit réglable,
--    jamais à celui qui renvoie ; le motif en est le corps (push compris).
--  * Les colonnes du renvoi ne s'écrivent que par renvoyer_etape ; gardées après la nouvelle validation
--    (le journal garde les renvois précédents).
--  * Une réparation revalidée après un renvoi ne prévient pas une seconde fois l'équipe de réfection.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colonnes
-- -----------------------------------------------------------------------------
alter table public.fuites
  add column renvoyee_le timestamptz,
  add column renvoyee_par uuid references public.profils (id),
  add column motif_renvoi text;
alter table public.reparations
  add column renvoyee_le timestamptz,
  add column renvoyee_par uuid references public.profils (id),
  add column motif_renvoi text;
alter table public.refections
  add column renvoyee_le timestamptz,
  add column renvoyee_par uuid references public.profils (id),
  add column motif_renvoi text;

comment on column public.fuites.motif_renvoi is
  'Dernier renvoi de la détection à l''agent pour correction : ce qu''il doit corriger (renvoyer_etape) ; « à corriger » tant que validee_le est vide';
comment on column public.reparations.motif_renvoi is
  'Dernier renvoi de la réparation à l''agent pour correction (renvoyer_etape) ; « à corriger » tant que validee_le est vide';
comment on column public.refections.motif_renvoi is
  'Dernier renvoi de la réfection à l''agent pour correction (renvoyer_etape) ; « à corriger » tant que validee_le est vide';

-- Écrites par renvoyer_etape seulement : un client ne les pose ni ne les change (avant les autres contrôles).
create function private.proteger_renvoi()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.appel_systeme() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.renvoyee_le := null;
    new.renvoyee_par := null;
    new.motif_renvoi := null;
  else
    new.renvoyee_le := old.renvoyee_le;
    new.renvoyee_par := old.renvoyee_par;
    new.motif_renvoi := old.motif_renvoi;
  end if;
  return new;
end
$$;

create trigger a1_proteger_renvoi before insert or update on public.fuites
  for each row execute function private.proteger_renvoi();
create trigger a1_proteger_renvoi before insert or update on public.reparations
  for each row execute function private.proteger_renvoi();
create trigger a1_proteger_renvoi before insert or update on public.refections
  for each row execute function private.proteger_renvoi();

-- -----------------------------------------------------------------------------
-- 2. Notification à l'agent
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_evenement_check;
alter table public.notifications add constraint notifications_evenement_check check (evenement in (
  'fuite_detectee', 'reparation_saisie', 'reparation_validee', 'refection_saisie', 'alerte_reparation', 'suivi_coupe',
  'etape_a_corriger'));

-- -----------------------------------------------------------------------------
-- 3. Renvoi
-- -----------------------------------------------------------------------------
create function public.renvoyer_etape(p_etape text, p_id uuid, p_motif text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _motif text := nullif(btrim(p_motif), '');
  _type public.type_donnee;
  _marche uuid;
  _fuite uuid;
  _cree timestamptz;
  _supprime timestamptz;
  _agent uuid;
  _verrou timestamptz;
  _numero integer;
  _titre text;
  _n integer;
begin
  case p_etape
    when 'detection' then
      _type := 'fuites';
      select f.marche_id, f.id, f.cree_le, f.supprime_le, coalesce(f.auteur_terrain_id, f.saisi_par)
        into _marche, _fuite, _cree, _supprime, _agent
        from public.fuites f where f.id = p_id for update;
    when 'reparation' then
      _type := 'interventions';
      select r.marche_id, r.fuite_id, r.cree_le, r.supprime_le, coalesce(r.auteur_terrain_id, r.saisi_par)
        into _marche, _fuite, _cree, _supprime, _agent
        from public.reparations r where r.id = p_id for update;
    when 'refection' then
      _type := 'refections';
      select r.marche_id, r.fuite_id, r.cree_le, r.supprime_le, coalesce(r.auteur_terrain_id, r.saisi_par)
        into _marche, _fuite, _cree, _supprime, _agent
        from public.refections r where r.id = p_id for update;
    else
      raise exception 'Étape inconnue : %', p_etape using errcode = 'invalid_parameter_value';
  end case;
  if _marche is null or _supprime is not null then
    raise exception 'Étape introuvable' using errcode = 'no_data_found';
  end if;
  if not private.peut(_marche, _type, 'valider') then
    raise exception 'Renvoi à l''agent réservé au responsable' using errcode = 'insufficient_privilege';
  end if;
  if _motif is null then
    raise exception 'Motif obligatoire : indiquez à l''agent ce qu''il doit corriger' using errcode = 'check_violation';
  end if;
  if char_length(_motif) > 500 then
    raise exception 'Motif trop long (500 caractères au plus)' using errcode = 'check_violation';
  end if;

  select f.verrouillee_le, f.numero into _verrou, _numero from public.fuites f where f.id = _fuite;
  if _verrou is not null and (p_etape = 'detection' or _cree <= _verrou) then
    raise exception 'Fuite verrouillée par un lot arrêté : l''agent ne pourrait pas corriger. Corrigez vous-même ou rouvrez le lot.'
      using errcode = 'check_violation';
  end if;

  case p_etape
    when 'detection' then
      update public.fuites
         set validee_le = null, validee_par = null, renvoyee_le = now(), renvoyee_par = auth.uid(), motif_renvoi = _motif
       where id = p_id;
    when 'reparation' then
      update public.reparations
         set validee_le = null, validee_par = null, renvoyee_le = now(), renvoyee_par = auth.uid(), motif_renvoi = _motif
       where id = p_id;
    else
      update public.refections
         set validee_le = null, validee_par = null, renvoyee_le = now(), renvoyee_par = auth.uid(), motif_renvoi = _motif
       where id = p_id;
  end case;

  _titre := format(case p_etape
    when 'detection' then 'Détection à corriger : fuite N° %s'
    when 'reparation' then 'Réparation à corriger : fuite N° %s'
    else 'Réfection à corriger : fuite N° %s' end, _numero);
  insert into public.notifications
    (destinataire_id, marche_id, evenement, fuite_id, reparation_id, refection_id, auteur_id, titre, corps, donnees)
  select p.id, _marche, 'etape_a_corriger', _fuite,
         case when p_etape = 'reparation' then p_id end, case when p_etape = 'refection' then p_id end,
         auth.uid(), _titre, _motif,
         private.donnees_fuite(_fuite) || jsonb_build_object('etape', p_etape, 'motif', _motif)
    from public.profils p
   where p.id = _agent
     and p.id is distinct from auth.uid()
     and p.actif
     and exists (select 1 from public.affectations a where a.profil_id = p.id and a.marche_id = _marche and a.actif);
  get diagnostics _n = row_count;
  return _n;
end
$$;

comment on function public.renvoyer_etape(text, uuid, text) is
  'Renvoie une détection, une réparation ou une réfection à son agent pour correction (dévalidation) avec un motif ; droit « valider » ; retourne 1 si l''agent est prévenu, 0 sinon.';

-- -----------------------------------------------------------------------------
-- 4. Écran « À valider » : renvoi en cours (colonnes ajoutées en fin de vue, corps de 20261009100200)
-- -----------------------------------------------------------------------------
create or replace view public.v_a_valider with (security_invoker = true) as
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
    where p.fuite_id = f.id and p.reparation_id is null and p.refection_id is null and p.supprime_le is null) as nb_photos,
  f.renvoyee_le,
  f.motif_renvoi
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
    where p.reparation_id = r.id and p.refection_id is null and p.supprime_le is null),
  r.renvoyee_le,
  r.motif_renvoi
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
  (select count(*) from public.photos p where p.refection_id = rf.id and p.supprime_le is null),
  rf.renvoyee_le,
  rf.motif_renvoi
from public.refections rf
join public.fuites f on f.id = rf.fuite_id and f.supprime_le is null
left join public.profils pa on pa.id = rf.auteur_terrain_id
where rf.validee_le is null and rf.supprime_le is null
  and rf.marche_id = any ((select private.marches_autorises('refections', 'valider'))::uuid[]);

-- -----------------------------------------------------------------------------
-- 5. Réparation revalidée après un renvoi : l'équipe de réfection n'est prévenue qu'une fois
--    (corps de 20261009200200, condition ajoutée)
-- -----------------------------------------------------------------------------
create or replace function private.notifier_reparation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _numero integer := (select f.numero from public.fuites f where f.id = new.fuite_id);
  _donnees jsonb := private.donnees_fuite(new.fuite_id) || jsonb_build_object('resultat', new.resultat);
begin
  if new.supprime_le is not null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform private.notifier('reparation_saisie', new.marche_id, new.fuite_id, new.id, null,
      array[auth.uid(), new.saisi_par, new.auteur_terrain_id],
      format('Réparation saisie : fuite N° %s', _numero),
      case new.resultat when 'reparee' then 'Réparée' when 'en_cours' then 'En cours' else 'Non réparée' end,
      _donnees);
  end if;
  if new.validee_le is not null and new.resultat in ('reparee', 'non_reparee')
     and not (tg_op = 'UPDATE' and old.validee_le is not null and old.resultat in ('reparee', 'non_reparee')
              and old.supprime_le is null)
     and private.refection_attendue(new.id)
     and not exists (select 1 from public.refections rf
                      where rf.fuite_id = new.fuite_id and rf.supprime_le is null and rf.cree_le >= new.cree_le)
     and not exists (select 1 from public.notifications n
                      where n.reparation_id = new.id and n.evenement = 'reparation_validee') then
    perform private.notifier('reparation_validee', new.marche_id, new.fuite_id, new.id, null,
      array[auth.uid()],
      case when new.resultat = 'reparee'
           then format('Fuite N° %s réparée et validée : réfection à faire', _numero)
           else format('Fuite N° %s non réparée, fouille validée : réfection à faire', _numero) end,
      (select f.adresse from public.fuites f where f.id = new.fuite_id),
      _donnees);
  end if;
  return null;
end
$$;

-- -----------------------------------------------------------------------------
-- 6. Privilèges
-- -----------------------------------------------------------------------------
revoke all on function private.proteger_renvoi(), public.renvoyer_etape(text, uuid, text) from public, anon;
grant execute on function public.renvoyer_etape(text, uuid, text) to authenticated, service_role;
grant execute on function private.proteger_renvoi() to service_role;
