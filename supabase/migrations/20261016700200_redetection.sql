-- =============================================================================
-- Re-détection (demande d'Issam du 2026-10-14).
--
--  * Une réparation « non réparée » dont le motif demande une re-détection (motifs.redetection : « À détecter de
--    nouveau » ; case réglable par motif) laisse la fuite ouverte au statut « À re-détecter » au lieu de la
--    classer « Sans réparation ».
--  * Notification (et push) « Fuite N° … à re-détecter » à l'agent qui a détecté la fuite, au responsable
--    (circuit, réglable) et à l'administrateur ; si cet agent n'est plus actif ou plus affecté au marché : à tous
--    les agents de détection du marché. Jamais à l'auteur de la saisie.
--  * La re-détection est une nouvelle fuite liée à la première (fuite_liee_id) qui garde son numéro avec un
--    suffixe : 22-bis, 22-ter… (choix d'Issam) ; fuites.rang (1, 2, 3…) et fuites.numero_affiche (« 22-bis »),
--    posés à la création, jamais modifiés. Toute nouvelle fuite liée à une fuite « À re-détecter » est sa
--    re-détection (bouton « Re-détecter » de la fiche, ou lien choisi dans le formulaire, APK déjà installées
--    comprises). La fuite d'origine est alors close (« Sans réparation », motif gardé) ; sa première fouille reste
--    attachable comme avant ; la repasse du tronçon n'est pas payée (CPS art. II-19, II-22).
--  * Les vues qui portent un numéro de fuite gagnent fuite_numero_affiche (v_fuites, v_fuites_export :
--    numero_affiche) ; les notifications écrivent le numéro affiché (donnees.numero devient un texte : les APK
--    installées l'affichent tel quel), renvoi d'une étape à l'agent compris (renvoyer_etape, 20261016600000).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Libellé du statut (FR / AR, arabe à relire par Issam)
-- -----------------------------------------------------------------------------
update public.libelles_listes set ordre = ordre + 1 where liste = 'statut_fuite' and code <> 'detectee';
insert into public.libelles_listes (liste, code, libelle_fr, libelle_ar, ordre) values
  ('statut_fuite', 'a_redetecter', 'À re-détecter', 'في انتظار إعادة الكشف', 2)
on conflict (liste, code) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Motifs : re-détection demandée
-- -----------------------------------------------------------------------------
alter table public.motifs add column redetection boolean not null default false;
comment on column public.motifs.redetection is
  'Motif de non-réparation qui demande une re-détection : la fuite passe « À re-détecter » et l''agent de détection est prévenu.';
update public.motifs set redetection = true where categorie = 'sans_reparation' and code = 'a_detecter';

-- -----------------------------------------------------------------------------
-- 3. Numéro de re-détection : rang et numéro affiché
-- -----------------------------------------------------------------------------
alter table public.fuites add column rang smallint not null default 1 check (rang between 1 and 10);
alter table public.fuites add column numero_affiche text;
comment on column public.fuites.rang is
  '1 : fuite d''origine ; 2 : bis, 3 : ter… (re-détection d''une fuite « À re-détecter », même numéro).';
comment on column public.fuites.numero_affiche is
  'Numéro à afficher partout : « 22 », « 22-bis », « 22-ter »… (posé à la création, jamais modifié).';

create function private.numero_affiche(p_numero integer, p_rang smallint)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_numero::text || case p_rang when 1 then '' when 2 then '-bis' when 3 then '-ter' when 4 then '-quater'
                                       when 5 then '-quinquies' when 6 then '-sexies' when 7 then '-septies'
                                       when 8 then '-octies' when 9 then '-nonies' when 10 then '-decies'
                                       else '-' || p_rang::text end
$$;

update public.fuites set numero_affiche = private.numero_affiche(numero, rang) where numero_affiche is null;

alter table public.fuites drop constraint fuites_marche_id_numero_key;
alter table public.fuites add constraint fuites_marche_numero_rang_key unique (marche_id, numero, rang);
-- Re-détection d'une fuite (v_fuites.redetection_numero) et liens de re-détection
create index fuites_fuite_liee_idx on public.fuites (fuite_liee_id) where fuite_liee_id is not null;

-- Numéro et rang d'une re-détection : fuite d'origine « À re-détecter » du même marché (verrouillée jusqu'à la fin
-- de la transaction : deux re-détections simultanées prennent des rangs différents) ; aucune ligne sinon.
create function private.numero_redetection(p_marche uuid, p_origine uuid)
returns table (numero integer, rang smallint)
language sql
security definer
set search_path = ''
as $$
  select f.numero,
         ((select max(x.rang) from public.fuites x where x.marche_id = f.marche_id and x.numero = f.numero) + 1)::smallint
    from public.fuites f
   where p_origine is not null and f.id = p_origine and f.marche_id = p_marche
     and f.statut = 'a_redetecter' and f.supprime_le is null
     for update of f
$$;

-- Rang et numéro affiché ne changent jamais par l'API (le numéro est déjà protégé par avant_modification_saisie).
create function private.proteger_numero_fuite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.appel_systeme() then
    new.rang := old.rang;
    new.numero_affiche := old.numero_affiche;
  end if;
  return new;
end
$$;
create trigger a1_proteger_numero before update on public.fuites
  for each row execute function private.proteger_numero_fuite();

-- -----------------------------------------------------------------------------
-- 4. Avant insertion : numéro de re-détection (corps de 20261009100200 complété)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.avant_insertion_saisie()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
      new.rang := 1;
      new.verrouillee_le := null;
      new.verrouillee_par := null;
      new.motif_correction := nullif(btrim(new.motif_modification), '');
      new.corrigee_par := case when new.motif_correction is null then null else auth.uid() end;
      new.corrigee_le := case when new.motif_correction is null then null else now() end;
      new.motif_modification := null;
    end if;
    if new.numero is null then
      -- Re-détection d'une fuite « À re-détecter » : même numéro, rang suivant (22-bis, 22-ter…)
      select r.numero, r.rang into new.numero, new.rang
        from private.numero_redetection(new.marche_id, new.fuite_liee_id) r;
      if new.numero is null then
        new.numero := private.prochain_numero(new.marche_id, 'fuite');
        new.rang := 1;
      end if;
    end if;
    new.rang := coalesce(new.rang, 1);
    new.numero_affiche := private.numero_affiche(new.numero, new.rang);
  end if;
  return new;
end
$function$;

-- -----------------------------------------------------------------------------
-- 5. Après la re-détection : la fuite d'origine est close (« Sans réparation », motif de re-détection gardé)
-- -----------------------------------------------------------------------------
create function private.cloturer_fuite_redetectee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rang > 1 and new.fuite_liee_id is not null then
    update public.fuites o
       set statut = 'sans_reparation',
           motif_sans_reparation_id = coalesce(o.motif_sans_reparation_id, (
             select m.id from public.motifs m
              where m.marche_id = o.marche_id and m.categorie = 'sans_reparation' and m.redetection
              order by m.ordre limit 1))
     where o.id = new.fuite_liee_id and o.statut = 'a_redetecter'
       and coalesce(o.motif_sans_reparation_id, (
             select m.id from public.motifs m
              where m.marche_id = o.marche_id and m.categorie = 'sans_reparation' and m.redetection
              limit 1)) is not null;
  end if;
  return null;
end
$$;
create trigger apres_redetection after insert on public.fuites
  for each row execute function private.cloturer_fuite_redetectee();

-- -----------------------------------------------------------------------------
-- 6. Statut automatique : « À re-détecter » (corps de 20261004090300 complété)
--    Ordre d'avancement : detectee < en_reparation < a_redetecter < reparee < achevee / sans_reparation
-- -----------------------------------------------------------------------------
create or replace function private.avancer_statut_fuite(p_fuite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _f public.fuites;
  _rep public.reparations;
  _sans_refection boolean;
  _refection_close boolean;
  _nouveau public.statut_fuite;
  _motif uuid;
  _ordre constant public.statut_fuite[] :=
    array['detectee', 'en_reparation', 'a_redetecter', 'reparee', 'achevee', 'sans_reparation']::public.statut_fuite[];
begin
  select * into _f from public.fuites where id = p_fuite;
  if _f.id is null or _f.supprime_le is not null or _f.statut in ('achevee', 'sans_reparation') then
    return;
  end if;

  select * into _rep from public.reparations r
   where r.fuite_id = p_fuite and r.supprime_le is null
   order by (r.resultat = 'reparee') desc, r.realisee_le desc
   limit 1;

  _refection_close := exists (
    select 1 from public.refections rf
     where rf.fuite_id = p_fuite and rf.supprime_le is null
  );

  if _rep.id is null then
    return;
  elsif _rep.resultat = 'non_reparee' then
    _motif := _rep.motif_id;
    _nouveau := case when exists (select 1 from public.motifs m where m.id = _rep.motif_id and m.redetection)
                     then 'a_redetecter' else 'sans_reparation' end;
  elsif _rep.resultat = 'en_cours' then
    _nouveau := 'en_reparation';
  else
    select not n.necessite_refection into _sans_refection
      from public.natures_refection n where n.id = _rep.nature_revetement_id;
    _nouveau := case
      when _refection_close or coalesce(_sans_refection, false) or _rep.emplacement = 'terrain_naturel'
        then 'achevee'
      else 'reparee'
    end;
  end if;

  if array_position(_ordre, _nouveau) > array_position(_ordre, _f.statut) then
    update public.fuites
       set statut = _nouveau,
           motif_sans_reparation_id = coalesce(_motif, motif_sans_reparation_id)
     where id = p_fuite;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 7. Notifications : « à re-détecter » ; numéro affiché partout
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_evenement_check;
alter table public.notifications add constraint notifications_evenement_check check (evenement in (
  'fuite_detectee', 'reparation_saisie', 'reparation_validee', 'refection_saisie', 'alerte_reparation', 'suivi_coupe',
  'etape_a_corriger', 'redetection_demandee'));
alter table public.notifications_circuit drop constraint notifications_circuit_evenement_check;
alter table public.notifications_circuit add constraint notifications_circuit_evenement_check check (evenement in (
  'fuite_detectee', 'reparation_saisie', 'reparation_validee', 'refection_saisie', 'alerte_reparation', 'suivi_coupe',
  'redetection_demandee'));
-- Le détecteur de la fuite est prévenu en plus du circuit (voir notifier_redetection).
insert into public.notifications_circuit (evenement, role) values ('redetection_demandee', 'responsable')
on conflict do nothing;

-- Données d'affichage : numéro affiché (texte : « 22-bis ») et rang.
create or replace function private.donnees_fuite(p_fuite uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('numero', coalesce(f.numero_affiche, f.numero::text), 'rang', f.rang,
                            'reference_srm', f.reference_srm, 'adresse', f.adresse, 'statut', f.statut)
    from public.fuites f where f.id = p_fuite
$$;

-- Fuite détectée (ou re-détectée) → Réparation et Responsable (pas les fuites importées).
create or replace function private.notifier_fuite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.supprime_le is null and new.source_saisie <> 'import' then
    perform private.notifier('fuite_detectee', new.marche_id, new.id, null, null,
      array[auth.uid(), new.saisi_par, new.auteur_terrain_id],
      case when new.rang > 1 then format('Fuite N° %s re-détectée', new.numero_affiche)
           else format('Nouvelle fuite N° %s détectée', new.numero_affiche) end,
      coalesce(new.adresse, new.reference_srm),
      private.donnees_fuite(new.id));
  end if;
  return null;
end
$$;

-- Réparation saisie → Responsable ; réparation (ou fouille non réparée) validée qui appelle une réfection →
-- Réfection (corps de 20261016600000, numéro affiché).
CREATE OR REPLACE FUNCTION private.notifier_reparation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  _numero text := (select coalesce(f.numero_affiche, f.numero::text) from public.fuites f where f.id = new.fuite_id);
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
$function$;

-- Étape renvoyée à l'agent pour correction (corps de 20261016600000) : numéro affiché dans le titre.
CREATE OR REPLACE FUNCTION public.renvoyer_etape(p_etape text, p_id uuid, p_motif text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  _motif text := nullif(btrim(p_motif), '');
  _type public.type_donnee;
  _marche uuid;
  _fuite uuid;
  _cree timestamptz;
  _supprime timestamptz;
  _agent uuid;
  _verrou timestamptz;
  _numero text;
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

  select f.verrouillee_le, coalesce(f.numero_affiche, f.numero::text) into _verrou, _numero
    from public.fuites f where f.id = _fuite;
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
$function$;

-- Réfection saisie (faite ou clôture sans réfection) → Responsable (numéro affiché).
create or replace function private.notifier_refection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _numero text := (select coalesce(f.numero_affiche, f.numero::text) from public.fuites f where f.id = new.fuite_id);
begin
  if new.supprime_le is null then
    perform private.notifier('refection_saisie', new.marche_id, new.fuite_id, new.reparation_id, new.id,
      array[auth.uid(), new.saisi_par, new.auteur_terrain_id],
      case when new.resultat = 'faite' then format('Réfection saisie : fuite N° %s', _numero)
           else format('Clôture sans réfection : fuite N° %s', _numero) end,
      (select f.adresse from public.fuites f where f.id = new.fuite_id),
      private.donnees_fuite(new.fuite_id) || jsonb_build_object('resultat', new.resultat));
  end if;
  return null;
end
$$;

-- Alerte de réparation (numéro affiché ; corps inchangé sinon).
create or replace function public.generer_alertes_reparation()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _f record;
  _n integer := 0;
begin
  for _f in
    select f.id, f.marche_id, coalesce(f.numero_affiche, f.numero::text) as numero, f.adresse,
           m.delai_alerte_reparation_h as delai
      from public.fuites f
      join public.marches m on m.id = f.marche_id and m.actif
     where f.statut = 'detectee'
       and f.supprime_le is null
       and f.date_detection > now() - interval '30 days'
       and now() - f.date_detection > make_interval(hours => m.delai_alerte_reparation_h)
       and not exists (select 1 from public.notifications n
                        where n.fuite_id = f.id and n.evenement = 'alerte_reparation')
  loop
    _n := _n + private.notifier('alerte_reparation', _f.marche_id, _f.id, null, null, '{}',
      format('Fuite N° %s non réparée depuis plus de %s h', _f.numero, _f.delai),
      _f.adresse,
      private.donnees_fuite(_f.id) || jsonb_build_object('delai_h', _f.delai));
  end loop;
  delete from public.notifications where lue_le < now() - interval '90 days';
  return _n;
end
$$;

-- Fuite passée « À re-détecter » → détecteur (actif et affecté), circuit (responsable), administrateur ; à défaut
-- de détecteur joignable : tous les agents de détection du marché. Jamais l'auteur de la saisie.
create function private.notifier_redetection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _joignable boolean;
  _motif text;
begin
  if new.supprime_le is not null then
    return null;
  end if;
  _joignable := new.auteur_terrain_id is not null and exists (
    select 1 from public.profils p
      join public.affectations a on a.profil_id = p.id and a.marche_id = new.marche_id and a.actif
     where p.id = new.auteur_terrain_id and p.actif);
  select m.libelle_fr into _motif from public.motifs m where m.id = new.motif_sans_reparation_id;
  insert into public.notifications (destinataire_id, marche_id, evenement, fuite_id, auteur_id, titre, corps, donnees)
  select p.id, new.marche_id, 'redetection_demandee', new.id, auth.uid(),
         format('Fuite N° %s à re-détecter', coalesce(new.numero_affiche, new.numero::text)),
         coalesce(new.adresse, new.reference_srm),
         private.donnees_fuite(new.id) || jsonb_build_object('motif', _motif)
    from public.profils p
   where p.actif
     and p.id is distinct from auth.uid()
     and (p.est_admin
          or (_joignable and p.id = new.auteur_terrain_id)
          or exists (select 1
                       from public.affectations a
                       join public.notifications_circuit c on c.evenement = 'redetection_demandee' and c.role = any (a.roles)
                      where a.profil_id = p.id and a.marche_id = new.marche_id and a.actif)
          or (not _joignable and exists (select 1 from public.affectations a
                                          where a.profil_id = p.id and a.marche_id = new.marche_id and a.actif
                                            and 'detection' = any (a.roles))));
  return null;
end
$$;
create trigger notifier_redetection after update of statut on public.fuites
  for each row when (new.statut = 'a_redetecter' and old.statut is distinct from 'a_redetecter')
  execute function private.notifier_redetection();

-- -----------------------------------------------------------------------------
-- 8. Copie de marché : la case « re-détection » des motifs (corps de 20261009200000 complété)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.copier_parametres_marche(p_source uuid, p_cible uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  insert into public.motifs (id, marche_id, categorie, code, libelle_fr, libelle_ar, terrassement_paye, redetection,
                             ordre, actif)
  select md5(p_cible || ':' || m.id)::uuid, p_cible, m.categorie, m.code, m.libelle_fr, m.libelle_ar,
         m.terrassement_paye, m.redetection, m.ordre, m.actif
    from public.motifs m where m.marche_id = p_source;

  -- Suggestions d'article (famille ou produit Dolibarr → article du bordereau copié)
  insert into public.suggestions_articles (id, marche_id, prix_id, famille, produit_id)
  select md5(p_cible || ':' || s.id)::uuid, p_cible, md5(p_cible || ':' || s.prix_id)::uuid, s.famille, s.produit_id
    from public.suggestions_articles s where s.marche_id = p_source;

  -- Chantier v2 (S2) : saisie terrain et attachement par anticipation
  perform private.copier_parametres_terrain(p_source, p_cible);
end
$function$;

-- -----------------------------------------------------------------------------
-- 9. Recherche des fuites proches : numéro affiché (colonne ajoutée à la fin ; corps de 20261004090500)
-- -----------------------------------------------------------------------------
drop function public.rechercher_fuites_proches(uuid, double precision, double precision, text, integer);
create function public.rechercher_fuites_proches(
  p_marche uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_reference text default null,
  p_rayon_m integer default null
)
returns table (
  id uuid, numero integer, reference_srm text, statut public.statut_fuite, date_detection timestamptz,
  distance_m double precision, meme_reference boolean, numero_affiche text
)
language sql
stable
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
         (p_reference is not null and f.reference_srm = p_reference) as meme_reference,
         f.numero_affiche
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
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 10. Vues : numéro affiché (définitions en vigueur recopiées telles quelles). v_fuites : rang, numéro affiché,
--     numéro de la fuite liée, numéro et identifiant de la re-détection ajoutés à la fin ; vues sans UNION : fuite_numero_affiche
--     (v_fuites_export : numero_affiche) ajouté à la fin de la liste ; vues à UNION (v_a_valider, v_anomalies,
--     v_controles_attachement, v_hors_bordereau) : enveloppées, jointure sur la fuite.
-- -----------------------------------------------------------------------------
create or replace view public.v_fuites with (security_invoker = true) as
 SELECT f.id,
    f.marche_id,
    f.numero,
    f.reference_srm,
    f.origine,
    f.visibilite,
    f.ouvrage,
    f.statut,
    f.zone_id,
    z.libelle AS zone,
    f.secteur_id,
    s.libelle AS secteur,
    f.adresse,
    extensions.st_y(f."position"::extensions.geometry) AS latitude,
    extensions.st_x(f."position"::extensions.geometry) AS longitude,
    f.date_detection,
    private.jour_maroc(f.date_detection) AS jour_detection,
    f.auteur_terrain_id,
    pa.nom_complet AS detectee_par,
    f.source_saisie,
    f.date_communication_srm,
    f.validation_srm_le,
    f.validation_srm_par,
    f.avis_terrassement_srm_le,
    r.realisee_le AS derniere_reparation_le,
    r.emplacement AS emplacement_fouille,
    rf.realisee_le AS derniere_refection_le,
    COALESCE(ph.nb_photos, 0::bigint) AS nb_photos,
    f.motif_sans_reparation_id,
    mo.libelle_fr AS motif_sans_reparation,
    mo.libelle_ar AS motif_sans_reparation_ar,
    f.fuite_liee_id,
    f.verrouillee_le,
    f.observation,
    f.cree_le,
    f.modifie_le,
    f.statut = 'detectee'::public.statut_fuite AND (now() - f.date_detection) > make_interval(hours => m.delai_alerte_reparation_h) AS alerte_non_reparee,
    m.jalons_client AND f.date_communication_srm IS NULL AND private.jour_maroc(f.date_detection) < private.jour_maroc(now()) AS alerte_communication_srm,
    f.statut = 'reparee'::public.statut_fuite AND r.emplacement = 'chaussee'::public.emplacement_fouille AND (now() - r.realisee_le) > make_interval(days => m.delai_prealerte_refection_chaussee_j) AS alerte_refection_chaussee,
    f.statut = 'reparee'::public.statut_fuite AND r.emplacement = 'chaussee'::public.emplacement_fouille AND (now() - r.realisee_le) > make_interval(days => m.delai_refection_chaussee_j) AS refection_chaussee_hors_delai,
    f.statut = 'reparee'::public.statut_fuite AND r.emplacement IS DISTINCT FROM 'chaussee'::public.emplacement_fouille AND (now() - r.realisee_le) > make_interval(days => m.delai_alerte_refection_trottoir_j) AS alerte_refection_trottoir,
    COALESCE(ph.nb_photos, 0::bigint) = 0 AS alerte_sans_photo,
    f.rang,
    f.numero_affiche,
    ( SELECT l.numero_affiche
           FROM public.fuites l
          WHERE l.id = f.fuite_liee_id) AS fuite_liee_numero,
    ( SELECT c.numero_affiche
           FROM public.fuites c
          WHERE c.fuite_liee_id = f.id AND c.rang > 1 AND c.supprime_le IS NULL
          ORDER BY c.rang
         LIMIT 1) AS redetection_numero,
    ( SELECT c.id
           FROM public.fuites c
          WHERE c.fuite_liee_id = f.id AND c.rang > 1 AND c.supprime_le IS NULL
          ORDER BY c.rang
         LIMIT 1) AS redetection_id
   FROM public.fuites f
     JOIN public.marches m ON m.id = f.marche_id
     LEFT JOIN public.zones z ON z.id = f.zone_id
     LEFT JOIN public.secteurs s ON s.id = f.secteur_id
     LEFT JOIN public.profils pa ON pa.id = f.auteur_terrain_id
     LEFT JOIN public.motifs mo ON mo.id = f.motif_sans_reparation_id
     LEFT JOIN LATERAL ( SELECT rp.realisee_le,
            rp.emplacement
           FROM public.reparations rp
          WHERE rp.fuite_id = f.id AND rp.supprime_le IS NULL
          ORDER BY rp.realisee_le DESC
         LIMIT 1) r ON true
     LEFT JOIN LATERAL ( SELECT max(x.realisee_le) AS realisee_le
           FROM public.refections x
          WHERE x.fuite_id = f.id AND x.supprime_le IS NULL) rf ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS nb_photos
           FROM public.photos p
          WHERE p.fuite_id = f.id AND p.supprime_le IS NULL) ph ON true
  WHERE f.supprime_le IS NULL;

create or replace view public.v_fuites_export with (security_invoker = true) as
 SELECT v.id,
    v.marche_id,
    v.numero,
    v.reference_srm,
    v.origine,
    v.visibilite,
    v.ouvrage,
    v.statut,
    v.zone_id,
    v.zone,
    v.secteur_id,
    v.secteur,
    v.adresse,
    v.latitude,
    v.longitude,
    v.date_detection,
    v.jour_detection,
    v.auteur_terrain_id,
    v.detectee_par,
    v.source_saisie,
    v.date_communication_srm,
    v.validation_srm_le,
    v.validation_srm_par,
    v.avis_terrassement_srm_le,
    v.derniere_reparation_le,
    v.emplacement_fouille,
    v.derniere_refection_le,
    v.nb_photos,
    v.motif_sans_reparation_id,
    v.motif_sans_reparation,
    v.motif_sans_reparation_ar,
    v.fuite_liee_id,
    v.verrouillee_le,
    v.observation,
    v.cree_le,
    v.modifie_le,
    v.alerte_non_reparee,
    v.alerte_communication_srm,
    v.alerte_refection_chaussee,
    v.refection_chaussee_hors_delai,
    v.alerte_refection_trottoir,
    v.alerte_sans_photo,
    r.realisee_le AS reparation_le,
    r.resultat AS resultat_reparation,
    r.ouvrage AS ouvrage_constate,
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
    r.representant_srm AS representant_client,
    r.auteur_terrain_id AS chef_reparation_id,
    pc.nom_complet AS chef_reparation,
    nr.libelle_fr AS revetement,
    nr.libelle_ar AS revetement_ar,
    rf.realisee_le AS refection_le,
    rf.resultat AS resultat_refection,
    nf.libelle_fr AS nature_refection,
    nf.libelle_ar AS nature_refection_ar,
    rf.surface_m2 AS surface_refection_m2,
    pp.pieces AS pieces_posees,
    q.quantites,
    v.numero_affiche
   FROM public.v_fuites v
     LEFT JOIN LATERAL ( SELECT rp.realisee_le,
            rp.resultat,
            rp.ouvrage,
            rp.materiau,
            rp.diametre_mm,
            rp.fouille_longueur_m,
            rp.fouille_largeur_m,
            rp.fouille_profondeur_m,
            rp.volume_m3,
            rp.longueur_pe_m,
            rp.tuyau_repare,
            rp.robinet_pec_change,
            rp.collier_pec_change,
            rp.bouche_a_cle_mise_a_niveau,
            rp.representant_srm,
            rp.auteur_terrain_id,
            rp.nature_revetement_id
           FROM public.reparations rp
          WHERE rp.fuite_id = v.id AND rp.supprime_le IS NULL
          ORDER BY rp.realisee_le DESC
         LIMIT 1) r ON true
     LEFT JOIN public.profils pc ON pc.id = r.auteur_terrain_id
     LEFT JOIN public.natures_refection nr ON nr.id = r.nature_revetement_id
     LEFT JOIN LATERAL ( SELECT x.realisee_le,
            x.resultat,
            x.nature_id,
            x.surface_m2
           FROM public.refections x
          WHERE x.fuite_id = v.id AND x.supprime_le IS NULL
          ORDER BY x.realisee_le DESC
         LIMIT 1) rf ON true
     LEFT JOIN public.natures_refection nf ON nf.id = rf.nature_id
     LEFT JOIN LATERAL ( SELECT string_agg((COALESCE(d.designation, p.designation_libre) || ' × '::text) || trim_scale(p.quantite), ' ; '::text ORDER BY (COALESCE(d.designation, p.designation_libre))) AS pieces
           FROM public.reparation_pieces p
             JOIN public.reparations rr ON rr.id = p.reparation_id AND rr.supprime_le IS NULL
             LEFT JOIN public.produits_dolibarr d ON d.dolibarr_id = p.produit_id
          WHERE rr.fuite_id = v.id AND p.supprime_le IS NULL AND p.etat = 'posee'::text) pp ON true
     LEFT JOIN LATERAL ( SELECT string_agg(format('P%s : %s %s'::text, s.numero, trim_scale(s.total), s.unite), ' ; '::text ORDER BY s.ordre, s.numero) AS quantites
           FROM ( SELECT px.numero,
                    px.ordre,
                    px.unite,
                    sum(l.quantite) AS total
                   FROM public.lignes_quantites l
                     JOIN public.prix px ON px.id = l.prix_id
                  WHERE l.fuite_id = v.id AND l.supprime_le IS NULL
                  GROUP BY px.numero, px.ordre, px.unite) s) q ON true;

create or replace view public.v_a_attacher with (security_invoker = true) as
 WITH executees AS (
         SELECT l.marche_id,
            l.fuite_id,
            l.prix_id,
            sum(l.quantite) AS quantite
           FROM public.lignes_quantites l
          WHERE l.supprime_le IS NULL
          GROUP BY l.marche_id, l.fuite_id, l.prix_id
        ), attachees AS (
         SELECT al.marche_id,
            al.fuite_id,
            al.prix_id,
            sum(al.quantite) AS quantite,
            COALESCE(sum(al.quantite) FILTER (WHERE al.nature = 'anticipation'::text), 0::numeric) AS anticipee,
            max(a.numero) AS dernier_lot
           FROM public.attachement_lignes al
             JOIN public.attachements a ON a.id = al.attachement_id AND a.statut = 'arrete'::text AND a.supprime_le IS NULL
          WHERE al.nature = ANY (ARRAY['solde'::text, 'anticipation'::text])
          GROUP BY al.marche_id, al.fuite_id, al.prix_id
        ), brouillons AS (
         SELECT al.fuite_id,
            al.prix_id,
            (array_agg(a.id ORDER BY a.cree_le))[1] AS attachement_id
           FROM public.attachement_lignes al
             JOIN public.attachements a ON a.id = al.attachement_id AND a.statut = 'brouillon'::text AND a.supprime_le IS NULL
          WHERE al.nature = ANY (ARRAY['solde'::text, 'anticipation'::text])
          GROUP BY al.fuite_id, al.prix_id
        ), unites AS (
         SELECT COALESCE(e.marche_id, t.marche_id) AS marche_id,
            COALESCE(e.fuite_id, t.fuite_id) AS fuite_id,
            COALESCE(e.prix_id, t.prix_id) AS prix_id,
            COALESCE(e.quantite, 0::numeric) AS quantite_executee,
            COALESCE(t.quantite, 0::numeric) AS quantite_attachee,
            COALESCE(t.anticipee, 0::numeric) AS quantite_anticipee,
            t.dernier_lot
           FROM executees e
             FULL JOIN attachees t ON t.fuite_id = e.fuite_id AND t.prix_id = e.prix_id
        ), etats AS (
         SELECT u_1.marche_id,
            u_1.fuite_id,
            u_1.prix_id,
            u_1.quantite_executee,
            u_1.quantite_attachee,
            u_1.quantite_anticipee,
            u_1.dernier_lot,
            u_1.quantite_anticipee > 0::numeric AND
                CASE
                    WHEN p_1.famille = 'refection'::public.famille_prix OR (EXISTS ( SELECT 1
                       FROM public.natures_refection n
                      WHERE n.prix_id = p_1.id)) THEN NOT (EXISTS ( SELECT 1
                       FROM public.refections x
                      WHERE x.fuite_id = u_1.fuite_id AND x.supprime_le IS NULL))
                    ELSE u_1.quantite_executee = 0::numeric
                END AS en_attente
           FROM unites u_1
             JOIN public.prix p_1 ON p_1.id = u_1.prix_id
        )
 SELECT u.marche_id,
    u.fuite_id,
    f.numero AS fuite_numero,
    f.reference_srm,
    f.adresse,
    f.statut,
    f.verrouillee_le IS NOT NULL AS verrouillee,
    f.zone_id,
    z.libelle AS zone,
    f.secteur_id,
    s.libelle AS secteur,
    r.auteur_terrain_id AS chef_equipe_id,
    pc.nom_complet AS chef_equipe,
    r.realisee_le AS reparee_le,
    rf.realisee_le AS refectionnee_le,
    u.prix_id,
    p.numero AS prix_numero,
    p.ordre AS prix_ordre,
    p.designation AS prix_designation,
    p.unite,
    p.famille,
    u.quantite_executee,
    u.quantite_attachee,
    u.quantite_anticipee,
    u.en_attente AS en_attente_refection,
        CASE
            WHEN u.en_attente THEN 0::numeric
            ELSE u.quantite_executee - u.quantite_attachee
        END AS reste,
    u.dernier_lot,
    b.attachement_id AS brouillon_id,
    u.en_attente AS en_attente_execution,
    p.anticipable,
    f.numero_affiche AS fuite_numero_affiche
   FROM etats u
     JOIN public.fuites f ON f.id = u.fuite_id AND f.supprime_le IS NULL
     JOIN public.prix p ON p.id = u.prix_id
     LEFT JOIN public.zones z ON z.id = f.zone_id
     LEFT JOIN public.secteurs s ON s.id = f.secteur_id
     LEFT JOIN LATERAL ( SELECT rp.realisee_le,
            rp.auteur_terrain_id
           FROM public.reparations rp
          WHERE rp.fuite_id = f.id AND rp.supprime_le IS NULL
          ORDER BY rp.realisee_le DESC
         LIMIT 1) r ON true
     LEFT JOIN public.profils pc ON pc.id = r.auteur_terrain_id
     LEFT JOIN LATERAL ( SELECT max(x.realisee_le) AS realisee_le,
            count(*) AS nombre
           FROM public.refections x
          WHERE x.fuite_id = f.id AND x.supprime_le IS NULL) rf ON true
     LEFT JOIN brouillons b ON b.fuite_id = u.fuite_id AND b.prix_id = u.prix_id;

create or replace view public.v_a_refectionner with (security_invoker = true) as
 SELECT f.id AS fuite_id,
    f.marche_id,
    f.numero AS fuite_numero,
    f.reference_srm,
    f.adresse,
    f.secteur_id,
    f.statut,
    extensions.st_y(f."position"::extensions.geometry) AS latitude,
    extensions.st_x(f."position"::extensions.geometry) AS longitude,
    r.id AS reparation_id,
    r.realisee_le AS reparee_le,
    r.validee_le AS reparation_validee_le,
    r.emplacement,
    r.nature_revetement_id,
    r.fouille_longueur_m,
    r.fouille_largeur_m,
    f.numero_affiche AS fuite_numero_affiche
   FROM public.fuites f
     JOIN LATERAL ( SELECT x.id,
            x.realisee_le,
            x.validee_le,
            x.emplacement,
            x.nature_revetement_id,
            x.fouille_longueur_m,
            x.fouille_largeur_m,
            x.cree_le
           FROM public.reparations x
          WHERE x.fuite_id = f.id AND x.supprime_le IS NULL AND x.validee_le IS NOT NULL AND private.refection_attendue(x.id)
          ORDER BY x.realisee_le DESC
         LIMIT 1) r ON true
  WHERE f.supprime_le IS NULL AND NOT (EXISTS ( SELECT 1
           FROM public.refections rf
          WHERE rf.fuite_id = f.id AND rf.supprime_le IS NULL AND rf.cree_le >= r.cree_le));

create or replace view public.v_attachement_lignes with (security_invoker = true) as
 SELECT al.id,
    al.marche_id,
    al.attachement_id,
    a.numero AS attachement_numero,
    a.statut AS attachement_statut,
    al.nature,
    al.fuite_id,
    f.numero AS fuite_numero,
    f.reference_srm,
    f.adresse,
    COALESCE(al.zone_id, f.zone_id) AS zone_id,
    z.libelle AS zone,
    COALESCE(al.secteur_id, f.secteur_id) AS secteur_id,
    s.libelle AS secteur,
    r.auteur_terrain_id AS chef_equipe_id,
    pc.nom_complet AS chef_equipe,
    r.realisee_le AS reparee_le,
    r.fouille_longueur_m,
    r.fouille_largeur_m,
    r.fouille_profondeur_m,
    r.volume_m3,
    rf.realisee_le AS refectionnee_le,
    rf.surface_m2 AS surface_refection_m2,
    al.prix_id,
    COALESCE(al.prix_numero, p.numero) AS prix_numero,
    p.ordre AS prix_ordre,
    COALESCE(al.prix_designation, p.designation) AS prix_designation,
    COALESCE(al.unite, p.unite) AS unite,
    COALESCE(al.pu_ht, p.pu_ht) AS pu_ht,
        CASE
            WHEN al.nature = 'solde'::text AND a.statut = 'brouillon'::text THEN COALESCE(u.reste, 0::numeric)
            WHEN al.nature = 'lineaire'::text AND a.statut = 'brouillon'::text THEN COALESCE(lin.proposee, 0::numeric)
            ELSE al.quantite
        END AS quantite,
        CASE
            WHEN al.nature = 'solde'::text AND a.statut = 'brouillon'::text THEN COALESCE(u.reste, 0::numeric) < 0::numeric
            WHEN al.nature = 'lineaire'::text AND a.statut = 'brouillon'::text THEN COALESCE(lin.proposee, 0::numeric) < 0::numeric
            ELSE al.quantite < 0::numeric
        END AS regularisation_negative,
    al.nature = 'solde'::text AND prec.numero IS NOT NULL AS regularisation,
    prec.numero AS lot_precedent,
    al.designation,
    al.motif,
    al.cree_le,
    nr.prix_id AS prix_refection_prevu,
    al.phase_id,
    ph.libelle AS phase,
    ph.part_maintien_pct,
    f.numero_affiche AS fuite_numero_affiche
   FROM public.attachement_lignes al
     JOIN public.attachements a ON a.id = al.attachement_id AND a.supprime_le IS NULL
     JOIN public.prix p ON p.id = al.prix_id
     LEFT JOIN public.fuites f ON f.id = al.fuite_id
     LEFT JOIN public.v_a_attacher u ON u.fuite_id = al.fuite_id AND u.prix_id = al.prix_id
     LEFT JOIN LATERAL ( SELECT
                CASE
                    WHEN al.nature = 'lineaire'::text AND a.statut = 'brouillon'::text THEN ( SELECT q.proposee
                       FROM private.proposition_lineaire(al.attachement_id) q(attachement_id, prix_id, famille, zone_id, phase_id, base, part_pct, executee, attachee, reste, proposee, disponible, au)
                      WHERE q.prix_id = al.prix_id AND q.zone_id = al.zone_id AND NOT q.phase_id IS DISTINCT FROM al.phase_id)
                    ELSE NULL::numeric
                END AS proposee) lin ON true
     LEFT JOIN public.phases ph ON ph.id = al.phase_id
     LEFT JOIN LATERAL ( SELECT max(b.numero) AS numero
           FROM public.attachement_lignes bl
             JOIN public.attachements b ON b.id = bl.attachement_id AND b.statut = 'arrete'::text AND b.supprime_le IS NULL
          WHERE bl.fuite_id = al.fuite_id AND bl.prix_id = al.prix_id AND (bl.nature = ANY (ARRAY['solde'::text, 'anticipation'::text])) AND b.id <> a.id AND (a.numero IS NULL OR b.numero < a.numero)) prec ON true
     LEFT JOIN public.zones z ON z.id = COALESCE(al.zone_id, f.zone_id)
     LEFT JOIN public.secteurs s ON s.id = COALESCE(al.secteur_id, f.secteur_id)
     LEFT JOIN LATERAL ( SELECT rp.realisee_le,
            rp.auteur_terrain_id,
            rp.fouille_longueur_m,
            rp.fouille_largeur_m,
            rp.fouille_profondeur_m,
            rp.volume_m3,
            rp.nature_revetement_id
           FROM public.reparations rp
          WHERE rp.fuite_id = al.fuite_id AND rp.supprime_le IS NULL
          ORDER BY rp.realisee_le DESC
         LIMIT 1) r ON true
     LEFT JOIN public.natures_refection nr ON nr.id = r.nature_revetement_id
     LEFT JOIN public.profils pc ON pc.id = r.auteur_terrain_id
     LEFT JOIN LATERAL ( SELECT x.realisee_le,
            x.surface_m2
           FROM public.refections x
          WHERE x.fuite_id = al.fuite_id AND x.supprime_le IS NULL AND x.resultat = 'faite'::public.resultat_refection
          ORDER BY x.realisee_le DESC
         LIMIT 1) rf ON true;

create or replace view public.v_pieces_reelles with (security_invoker = true) as
 SELECT rp.id,
    rp.marche_id,
    rp.reparation_id,
    r.fuite_id,
    f.numero AS fuite_numero,
    f.reference_srm,
    f.zone_id,
    z.libelle AS zone,
    f.secteur_id,
    s.libelle AS secteur,
    r.auteur_terrain_id AS chef_id,
    pc.nom_complet AS chef,
    r.realisee_le,
    private.jour_maroc(r.realisee_le) AS jour,
    rp.produit_id,
    COALESCE(d.designation, rp.designation_libre) AS designation,
    d.famille,
    COALESCE(d.unite, 'u'::text) AS unite,
    rp.quantite,
    rp.provenance,
    rp.nature_correction,
    rp.motif_correction,
    rp.saisi_par,
    ps.nom_complet AS saisi_par_nom,
    rp.cree_le AS saisi_le,
    rp.remplace_piece_id,
    COALESCE(da.designation, pa.designation_libre) AS designation_remplacee,
    pa.quantite AS quantite_remplacee,
    f.numero_affiche AS fuite_numero_affiche
   FROM public.reparation_pieces rp
     JOIN public.reparations r ON r.id = rp.reparation_id AND r.supprime_le IS NULL
     JOIN public.fuites f ON f.id = r.fuite_id AND f.supprime_le IS NULL
     LEFT JOIN public.produits_dolibarr d ON d.dolibarr_id = rp.produit_id
     LEFT JOIN public.zones z ON z.id = f.zone_id
     LEFT JOIN public.secteurs s ON s.id = f.secteur_id
     LEFT JOIN public.profils pc ON pc.id = r.auteur_terrain_id
     LEFT JOIN public.profils ps ON ps.id = rp.saisi_par
     LEFT JOIN public.reparation_pieces pa ON pa.id = rp.remplace_piece_id
     LEFT JOIN public.produits_dolibarr da ON da.dolibarr_id = pa.produit_id
  WHERE rp.supprime_le IS NULL AND rp.etat = 'posee'::text;

create or replace view public.v_pieces_posees with (security_invoker = true) as
 SELECT id,
    marche_id,
    reparation_id,
    fuite_id,
    fuite_numero,
    reference_srm,
    zone_id,
    zone,
    secteur_id,
    secteur,
    chef_id,
    chef,
    realisee_le,
    jour,
    produit_id,
    designation,
    famille,
    unite,
    quantite,
    provenance,
    nature_correction,
    motif_correction,
    v_pieces_reelles.fuite_numero_affiche
   FROM public.v_pieces_reelles;

create or replace view public.v_inventaire_fournitures with (security_invoker = true) as
 SELECT id,
    marche_id,
    reparation_id,
    fuite_id,
    fuite_numero,
    reference_srm,
    realisee_le,
    jour,
    to_char(jour::timestamp with time zone, 'YYYY-MM'::text) AS mois,
    zone_id,
    zone,
    secteur_id,
    secteur,
    chef_id,
    chef,
    produit_id,
    designation,
    famille,
    unite,
    quantite,
    provenance,
    nature_correction,
    p.fuite_numero_affiche
   FROM public.v_pieces_reelles p
  WHERE marche_id = ANY ((( SELECT private.marches_autorises('quantites'::public.type_donnee, 'lire'::text) AS marches_autorises))::uuid[]);

create or replace view public.v_quantites with (security_invoker = true) as
 SELECT l.id,
    l.marche_id,
    l.fuite_id,
    f.numero AS fuite_numero,
    f.reference_srm,
    f.origine,
    f.zone_id,
    z.libelle AS zone,
    f.secteur_id,
    s.libelle AS secteur,
    COALESCE(r.auteur_terrain_id, rf.auteur_terrain_id) AS chef_equipe_id,
    l.reparation_id,
    l.refection_id,
    l.prix_id,
    p.numero AS prix_numero,
    p.ordre AS prix_ordre,
    p.designation AS prix_designation,
    p.unite,
    p.hors_bordereau,
    l.quantite,
    p.pu_ht,
    round(l.quantite * p.pu_ht, 2) AS montant_ht_bordereau,
    l.date_execution,
    l.origine AS origine_ligne,
    l.commentaire,
    l.motif_correction,
    l.corrigee_par,
    l.corrigee_le,
    l.prix_initial_id,
    f.numero_affiche AS fuite_numero_affiche
   FROM public.lignes_quantites l
     JOIN public.prix p ON p.id = l.prix_id
     JOIN public.fuites f ON f.id = l.fuite_id AND f.supprime_le IS NULL
     LEFT JOIN public.zones z ON z.id = f.zone_id
     LEFT JOIN public.secteurs s ON s.id = f.secteur_id
     LEFT JOIN public.reparations r ON r.id = l.reparation_id
     LEFT JOIN public.refections rf ON rf.id = l.refection_id
  WHERE l.supprime_le IS NULL;

create or replace view public.v_refections_dues with (security_invoker = true) as
 SELECT f.marche_id,
    f.id AS fuite_id,
    f.numero AS fuite_numero,
    f.reference_srm,
    f.adresse,
    f.statut,
    f.zone_id,
    f.secteur_id,
    r.id AS reparation_id,
    r.resultat AS resultat_reparation,
    r.realisee_le AS reparee_le,
    r.validee_le AS reparation_validee_le,
    r.auteur_terrain_id AS chef_equipe_id,
    r.emplacement,
    r.nature_revetement_id,
    n.code AS nature_code,
    n.libelle_fr AS nature_libelle_fr,
    n.libelle_ar AS nature_libelle_ar,
    n.prix_id AS prix_refection_id,
    r.fouille_longueur_m,
    r.fouille_largeur_m,
    round(r.fouille_longueur_m * r.fouille_largeur_m, 3) AS surface_fouille_m2,
    private.jour_maroc(now()) - private.jour_maroc(r.realisee_le) AS jours_depuis_reparation,
    f.numero_affiche AS fuite_numero_affiche
   FROM public.fuites f
     CROSS JOIN LATERAL ( SELECT rp.id,
            rp.resultat,
            rp.realisee_le,
            rp.validee_le,
            rp.auteur_terrain_id,
            rp.emplacement,
            rp.nature_revetement_id,
            rp.fouille_longueur_m,
            rp.fouille_largeur_m,
            rp.cree_le
           FROM public.reparations rp
          WHERE rp.fuite_id = f.id AND rp.supprime_le IS NULL AND private.refection_attendue(rp.id)
          ORDER BY rp.realisee_le DESC, rp.cree_le DESC
         LIMIT 1) r
     LEFT JOIN public.natures_refection n ON n.id = r.nature_revetement_id
  WHERE f.supprime_le IS NULL AND f.statut <> 'achevee'::public.statut_fuite AND NOT (EXISTS ( SELECT 1
           FROM public.refections x
          WHERE x.fuite_id = f.id AND x.supprime_le IS NULL AND x.cree_le >= r.cree_le));

create or replace view public.v_propositions_anticipation with (security_invoker = true) as
 SELECT d.marche_id,
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
    p.id AS prix_id,
    p.numero AS prix_numero,
    p.ordre AS prix_ordre,
    p.designation AS prix_designation,
    p.unite,
    d.surface_fouille_m2 AS quantite_proposee,
    b.attachement_id AS brouillon_id,
    d.fuite_numero_affiche
   FROM public.v_refections_dues d
     JOIN public.prix p ON p.id = d.prix_refection_id AND p.actif AND p.anticipable
     JOIN public.parametres_attachement pa ON pa.marche_id = d.marche_id AND pa.refection_anticipee
     LEFT JOIN LATERAL ( SELECT al.attachement_id
           FROM public.attachement_lignes al
             JOIN public.attachements a ON a.id = al.attachement_id AND a.statut = 'brouillon'::text AND a.supprime_le IS NULL
          WHERE al.fuite_id = d.fuite_id AND al.prix_id = p.id AND (al.nature = ANY (ARRAY['solde'::text, 'anticipation'::text]))
          ORDER BY a.cree_le
         LIMIT 1) b ON true
  WHERE d.surface_fouille_m2 > 0::numeric AND private.anticipation_impossible(d.fuite_id, p.id) IS NULL;

create or replace view public.v_a_valider with (security_invoker = true) as
select v.*, f.numero_affiche as fuite_numero_affiche
  from (
     SELECT 'detection'::text AS etape,
        f.id,
        f.marche_id,
        f.id AS fuite_id,
        f.numero AS fuite_numero,
        f.reference_srm,
        f.adresse,
        f.statut,
        NULL::text AS resultat,
        f.date_detection AS date_etape,
        f.auteur_terrain_id,
        pa.nom_complet AS auteur,
        f.saisi_par,
        f.cree_le,
        f.saisie_differee,
        f.validee_le AS fuite_validee_le,
        ( SELECT count(*) AS count
               FROM public.photos p
              WHERE p.fuite_id = f.id AND p.reparation_id IS NULL AND p.refection_id IS NULL AND p.supprime_le IS NULL) AS nb_photos,
        f.renvoyee_le,
        f.motif_renvoi
       FROM public.fuites f
         LEFT JOIN public.profils pa ON pa.id = f.auteur_terrain_id
      WHERE f.validee_le IS NULL AND f.supprime_le IS NULL AND (f.marche_id = ANY ((( SELECT private.marches_autorises('fuites'::public.type_donnee, 'valider'::text) AS marches_autorises))::uuid[]))
    UNION ALL
     SELECT 'reparation'::text AS etape,
        r.id,
        r.marche_id,
        r.fuite_id,
        f.numero AS fuite_numero,
        f.reference_srm,
        f.adresse,
        f.statut,
        r.resultat::text AS resultat,
        r.realisee_le AS date_etape,
        r.auteur_terrain_id,
        pa.nom_complet AS auteur,
        r.saisi_par,
        r.cree_le,
        f.saisie_differee,
        f.validee_le AS fuite_validee_le,
        ( SELECT count(*) AS count
               FROM public.photos p
              WHERE p.reparation_id = r.id AND p.refection_id IS NULL AND p.supprime_le IS NULL) AS nb_photos,
        r.renvoyee_le,
        r.motif_renvoi
       FROM public.reparations r
         JOIN public.fuites f ON f.id = r.fuite_id AND f.supprime_le IS NULL
         LEFT JOIN public.profils pa ON pa.id = r.auteur_terrain_id
      WHERE r.validee_le IS NULL AND r.supprime_le IS NULL AND (r.marche_id = ANY ((( SELECT private.marches_autorises('interventions'::public.type_donnee, 'valider'::text) AS marches_autorises))::uuid[]))
    UNION ALL
     SELECT 'refection'::text AS etape,
        rf.id,
        rf.marche_id,
        rf.fuite_id,
        f.numero AS fuite_numero,
        f.reference_srm,
        f.adresse,
        f.statut,
        rf.resultat::text AS resultat,
        rf.realisee_le AS date_etape,
        rf.auteur_terrain_id,
        pa.nom_complet AS auteur,
        rf.saisi_par,
        rf.cree_le,
        f.saisie_differee,
        f.validee_le AS fuite_validee_le,
        ( SELECT count(*) AS count
               FROM public.photos p
              WHERE p.refection_id = rf.id AND p.supprime_le IS NULL) AS nb_photos,
        rf.renvoyee_le,
        rf.motif_renvoi
       FROM public.refections rf
         JOIN public.fuites f ON f.id = rf.fuite_id AND f.supprime_le IS NULL
         LEFT JOIN public.profils pa ON pa.id = rf.auteur_terrain_id
      WHERE rf.validee_le IS NULL AND rf.supprime_le IS NULL AND (rf.marche_id = ANY ((( SELECT private.marches_autorises('refections'::public.type_donnee, 'valider'::text) AS marches_autorises))::uuid[]))
  ) v
  left join public.fuites f on f.id = v.fuite_id;

create or replace view public.v_anomalies with (security_invoker = true) as
select v.*, f.numero_affiche as fuite_numero_affiche
  from (
     WITH rep AS (
             SELECT r.id,
                r.marche_id,
                r.fuite_id,
                r.resultat,
                r.motif_id,
                r.realisee_le,
                r.auteur_terrain_id,
                r.saisi_par,
                r.source_saisie,
                r.ouvrage,
                r.materiau,
                r.diametre_mm,
                r.representant_srm,
                r.representant_srm_id,
                r.tuyau_repare,
                r.robinet_pec_change,
                r.collier_pec_change,
                r.bouche_a_cle_mise_a_niveau,
                r.element_remplace,
                r.longueur_pe_m,
                r.fouille_longueur_m,
                r.fouille_largeur_m,
                r.fouille_profondeur_m,
                r.volume_m3,
                r.emplacement,
                r.nature_revetement_id,
                r.observation,
                r.cree_le,
                r.modifie_le,
                r.supprime_le,
                r.supprime_par,
                r.validee_le,
                r.validee_par,
                f.numero,
                f.date_detection,
                f.avis_terrassement_srm_le,
                m.jalons_client,
                m.longueur_pe_max_m
               FROM public.reparations r
                 JOIN public.fuites f ON f.id = r.fuite_id AND f.supprime_le IS NULL
                 JOIN public.marches m ON m.id = r.marche_id
              WHERE r.supprime_le IS NULL
            )
     SELECT rep.marche_id,
        rep.fuite_id,
        rep.numero AS fuite_numero,
        rep.id AS reparation_id,
        'prix_hors_bordereau'::text AS anomalie,
        format('Réparation %s DN %s sans prix au bordereau'::text, rep.materiau, rep.diametre_mm) AS detail
       FROM rep
      WHERE rep.resultat = 'reparee'::public.resultat_reparation AND rep.tuyau_repare AND NOT (EXISTS ( SELECT 1
               FROM public.lignes_quantites l
                 JOIN public.prix p ON p.id = l.prix_id
              WHERE l.reparation_id = rep.id AND l.supprime_le IS NULL AND (p.famille = 'reparation_tuyau'::public.famille_prix OR p.hors_bordereau)))
    UNION ALL
     SELECT rep.marche_id,
        rep.fuite_id,
        rep.numero AS fuite_numero,
        rep.id AS reparation_id,
        'fouille_superieure_2m'::text AS anomalie,
        format('Longueur de fouille %s m sans remplacement d''élément'::text, rep.fouille_longueur_m) AS detail
       FROM rep
      WHERE rep.fouille_longueur_m > 2::numeric AND NOT rep.element_remplace
    UNION ALL
     SELECT rep.marche_id,
        rep.fuite_id,
        rep.numero AS fuite_numero,
        rep.id AS reparation_id,
        'longueur_pe_superieure_2m'::text AS anomalie,
        format('Longueur de polyéthylène %s m'::text, rep.longueur_pe_m) AS detail
       FROM rep
      WHERE rep.longueur_pe_m > rep.longueur_pe_max_m
    UNION ALL
     SELECT rep.marche_id,
        rep.fuite_id,
        rep.numero AS fuite_numero,
        rep.id AS reparation_id,
        'reparation_avant_detection'::text AS anomalie,
        'Date de réparation antérieure à la date de détection'::text AS detail
       FROM rep
      WHERE rep.realisee_le < rep.date_detection
    UNION ALL
     SELECT rep.marche_id,
        rep.fuite_id,
        rep.numero AS fuite_numero,
        rep.id AS reparation_id,
        'terrassement_sans_avis_srm'::text AS anomalie,
        'Terrassement sans avis préalable du maître d''ouvrage enregistré'::text AS detail
       FROM rep
      WHERE rep.jalons_client AND rep.avis_terrassement_srm_le IS NULL AND (rep.resultat = 'reparee'::public.resultat_reparation OR COALESCE(rep.volume_m3, 0::numeric) > 0::numeric)
    UNION ALL
     SELECT rf.marche_id,
        rf.fuite_id,
        f.numero AS fuite_numero,
        rf.reparation_id,
        'refection_avant_reparation'::text AS anomalie,
        'Date de réfection antérieure à la date de réparation'::text AS detail
       FROM public.refections rf
         JOIN public.reparations r ON r.id = rf.reparation_id
         JOIN public.fuites f ON f.id = rf.fuite_id AND f.supprime_le IS NULL
      WHERE rf.supprime_le IS NULL AND rf.realisee_le < r.realisee_le
    UNION ALL
     SELECT f.marche_id,
        f.id AS fuite_id,
        f.numero AS fuite_numero,
        NULL::uuid AS reparation_id,
        'reference_srm_format'::text AS anomalie,
        format('Référence « %s » hors format %s'::text, f.reference_srm, m.masque_reference) AS detail
       FROM public.fuites f
         JOIN public.marches m ON m.id = f.marche_id
      WHERE f.supprime_le IS NULL AND f.reference_srm IS NOT NULL AND m.masque_reference IS NOT NULL AND f.reference_srm !~ private.regex_masque(m.masque_reference)
    UNION ALL
     SELECT f.marche_id,
        f.id AS fuite_id,
        f.numero AS fuite_numero,
        NULL::uuid AS reparation_id,
        'reference_srm_doublon'::text AS anomalie,
        format('Référence « %s » portée par une autre fuite'::text, f.reference_srm) AS detail
       FROM public.fuites f
      WHERE f.supprime_le IS NULL AND f.reference_srm IS NOT NULL AND f.fuite_liee_id IS NULL AND (EXISTS ( SELECT 1
               FROM public.fuites g
              WHERE g.marche_id = f.marche_id AND g.id <> f.id AND g.supprime_le IS NULL AND g.reference_srm = f.reference_srm AND g.fuite_liee_id IS DISTINCT FROM f.id))
  ) v
  left join public.fuites f on f.id = v.fuite_id;

create or replace view public.v_controles_attachement with (security_invoker = true) as
select v.*, f.numero_affiche as fuite_numero_affiche
  from (
     WITH rep AS (
             SELECT r.id,
                r.marche_id,
                r.fuite_id,
                r.resultat,
                r.motif_id,
                r.realisee_le,
                r.auteur_terrain_id,
                r.saisi_par,
                r.source_saisie,
                r.ouvrage,
                r.materiau,
                r.diametre_mm,
                r.representant_srm,
                r.representant_srm_id,
                r.tuyau_repare,
                r.robinet_pec_change,
                r.collier_pec_change,
                r.bouche_a_cle_mise_a_niveau,
                r.element_remplace,
                r.longueur_pe_m,
                r.fouille_longueur_m,
                r.fouille_largeur_m,
                r.fouille_profondeur_m,
                r.volume_m3,
                r.emplacement,
                r.nature_revetement_id,
                r.observation,
                r.cree_le,
                r.modifie_le,
                r.supprime_le,
                r.supprime_par,
                r.validee_le,
                r.validee_par,
                f.numero AS fuite_numero,
                f.statut AS statut_fuite,
                m.longueur_pe_max_m
               FROM public.reparations r
                 JOIN public.fuites f ON f.id = r.fuite_id AND f.supprime_le IS NULL
                 JOIN public.marches m ON m.id = r.marche_id
              WHERE r.supprime_le IS NULL
            ), derniere_reparee AS (
             SELECT DISTINCT ON (rep.fuite_id) rep.fuite_id,
                rep.id,
                rep.marche_id,
                rep.fuite_numero
               FROM rep
              WHERE rep.resultat = 'reparee'::public.resultat_reparation
              ORDER BY rep.fuite_id, rep.realisee_le DESC
            ), pieces_pec AS (
             SELECT r.fuite_id,
                px.famille,
                string_agg(DISTINCT d.designation, ', '::text ORDER BY d.designation) AS designations
               FROM public.reparation_pieces rp
                 JOIN public.reparations r ON r.id = rp.reparation_id AND r.supprime_le IS NULL
                 JOIN public.produits_dolibarr d ON d.dolibarr_id = rp.produit_id
                 JOIN public.prix px ON px.id = private.article_suggere(rp.marche_id, rp.produit_id)
              WHERE rp.supprime_le IS NULL AND rp.etat = 'posee'::text AND (px.famille = ANY (ARRAY['robinet_pec'::public.famille_prix, 'collier_pec'::public.famille_prix]))
              GROUP BY r.fuite_id, px.famille
            ), cases_pec AS (
             SELECT rep.fuite_id,
                bool_or(rep.robinet_pec_change) AS robinet,
                bool_or(rep.collier_pec_change) AS collier
               FROM rep
              WHERE rep.resultat = 'reparee'::public.resultat_reparation
              GROUP BY rep.fuite_id
            ), sans_article AS (
             SELECT rep.id
               FROM rep
              WHERE rep.resultat = 'reparee'::public.resultat_reparation AND rep.tuyau_repare AND (EXISTS ( SELECT 1
                       FROM private.v_prix_proposes pp
                      WHERE pp.reparation_id = rep.id AND pp.refection_id IS NULL AND pp.famille = 'reparation_tuyau'::public.famille_prix AND pp.prix_id IS NULL)) AND NOT (EXISTS ( SELECT 1
                       FROM public.lignes_quantites l
                         JOIN public.prix p ON p.id = l.prix_id
                      WHERE l.reparation_id = rep.id AND l.supprime_le IS NULL AND (p.famille = 'reparation_tuyau'::public.famille_prix OR p.hors_bordereau)))
            ), controles AS (
             SELECT d.marche_id,
                d.fuite_id,
                d.fuite_numero,
                d.id AS reparation_id,
                NULL::uuid AS ligne_id,
                'robinet_pec_non_coche'::text AS controle,
                'avertissement'::text AS gravite,
                'Robinet PEC posé, case « Robinet PEC changé » non cochée'::text AS libelle,
                'Pièces posées : '::text || pp.designations AS detail,
                NULL::numeric AS excedent,
                NULL::text AS unite
               FROM derniere_reparee d
                 JOIN pieces_pec pp ON pp.fuite_id = d.fuite_id AND pp.famille = 'robinet_pec'::public.famille_prix
                 JOIN cases_pec c_1 ON c_1.fuite_id = d.fuite_id
              WHERE NOT c_1.robinet
            UNION ALL
             SELECT rep.marche_id,
                rep.fuite_id,
                rep.fuite_numero,
                rep.id,
                NULL::uuid,
                'robinet_pec_sans_piece'::text,
                'avertissement'::text,
                'Case « Robinet PEC changé » cochée sans robinet PEC dans les pièces posées'::text,
                'Ajouter la pièce posée (article Dolibarr) ou décocher la case'::text,
                NULL::numeric,
                NULL::text
               FROM rep
              WHERE rep.resultat = 'reparee'::public.resultat_reparation AND rep.robinet_pec_change AND NOT (EXISTS ( SELECT 1
                       FROM pieces_pec pp
                      WHERE pp.fuite_id = rep.fuite_id AND pp.famille = 'robinet_pec'::public.famille_prix))
            UNION ALL
             SELECT d.marche_id,
                d.fuite_id,
                d.fuite_numero,
                d.id,
                NULL::uuid,
                'collier_pec_non_coche'::text,
                'avertissement'::text,
                'Collier PEC posé, case « Collier PEC changé » non cochée'::text,
                'Pièces posées : '::text || pp.designations,
                NULL::numeric,
                NULL::text
               FROM derniere_reparee d
                 JOIN pieces_pec pp ON pp.fuite_id = d.fuite_id AND pp.famille = 'collier_pec'::public.famille_prix
                 JOIN cases_pec c_1 ON c_1.fuite_id = d.fuite_id
              WHERE NOT c_1.collier
            UNION ALL
             SELECT rep.marche_id,
                rep.fuite_id,
                rep.fuite_numero,
                rep.id,
                NULL::uuid,
                'collier_pec_sans_piece'::text,
                'avertissement'::text,
                'Case « Collier PEC changé » cochée sans collier PEC dans les pièces posées'::text,
                'Ajouter la pièce posée (article Dolibarr) ou décocher la case'::text,
                NULL::numeric,
                NULL::text
               FROM rep
              WHERE rep.resultat = 'reparee'::public.resultat_reparation AND rep.collier_pec_change AND NOT (EXISTS ( SELECT 1
                       FROM pieces_pec pp
                      WHERE pp.fuite_id = rep.fuite_id AND pp.famille = 'collier_pec'::public.famille_prix))
            UNION ALL
             SELECT rep.marche_id,
                rep.fuite_id,
                rep.fuite_numero,
                rep.id,
                NULL::uuid,
                'fouille_sans_volume'::text,
                'avertissement'::text,
                'Réparation réussie sans volume de fouille'::text,
                format('Fouille L × l × p : %s × %s × %s m'::text, COALESCE(private.nombre_fr(rep.fouille_longueur_m), '?'::text), COALESCE(private.nombre_fr(rep.fouille_largeur_m), '?'::text), COALESCE(private.nombre_fr(rep.fouille_profondeur_m), '?'::text)) AS format,
                NULL::numeric,
                NULL::text
               FROM rep
              WHERE rep.resultat = 'reparee'::public.resultat_reparation AND COALESCE(rep.volume_m3, 0::numeric) = 0::numeric
            UNION ALL
             SELECT d.marche_id,
                d.fuite_id,
                d.fuite_numero,
                d.id,
                NULL::uuid,
                'reparation_sans_prix'::text,
                'avertissement'::text,
                'Réparation réussie sans aucune ligne de prix de réparation'::text,
                'Vérifier les travaux cochés (tuyau, robinet, collier, bouche à clé) ou ajouter la ligne'::text,
                NULL::numeric,
                NULL::text
               FROM derniere_reparee d
              WHERE NOT (EXISTS ( SELECT 1
                       FROM public.lignes_quantites l
                         JOIN public.prix p ON p.id = l.prix_id
                      WHERE l.fuite_id = d.fuite_id AND l.supprime_le IS NULL AND (p.hors_bordereau OR (p.famille <> ALL (ARRAY['terrassement'::public.famille_prix, 'refection'::public.famille_prix, 'balayage'::public.famille_prix, 'maintien'::public.famille_prix]))))) AND NOT (EXISTS ( SELECT 1
                       FROM rep x
                         JOIN sans_article s ON s.id = x.id
                      WHERE x.fuite_id = d.fuite_id))
            UNION ALL
             SELECT f.marche_id,
                f.id,
                f.numero,
                r.id,
                NULL::uuid,
                'refection_hors_delai'::text,
                'avertissement'::text,
                'Réfection ni faite ni close (motif) après le délai du marché'::text,
                format('Réparée le %s, délai de %s jours'::text, to_char(private.heure_maroc(r.realisee_le), 'DD/MM/YYYY'::text),
                    CASE
                        WHEN r.emplacement = 'chaussee'::public.emplacement_fouille THEN m.delai_refection_chaussee_j
                        ELSE m.delai_alerte_refection_trottoir_j
                    END) AS format,
                NULL::numeric,
                NULL::text
               FROM public.fuites f
                 JOIN public.marches m ON m.id = f.marche_id
                 JOIN LATERAL ( SELECT rp.id,
                        rp.realisee_le,
                        rp.emplacement
                       FROM public.reparations rp
                      WHERE rp.fuite_id = f.id AND rp.supprime_le IS NULL
                      ORDER BY rp.realisee_le DESC
                     LIMIT 1) r ON true
              WHERE f.supprime_le IS NULL AND f.statut = 'reparee'::public.statut_fuite AND (now() - r.realisee_le) > make_interval(days =>
                    CASE
                        WHEN r.emplacement = 'chaussee'::public.emplacement_fouille THEN m.delai_refection_chaussee_j
                        ELSE m.delai_alerte_refection_trottoir_j
                    END)
            UNION ALL
             SELECT l.marche_id,
                l.fuite_id,
                f.numero,
                l.reparation_id,
                l.id,
                'ligne_incoherente'::text,
                'alerte'::text,
                'Article retenu différent de celui que propose la règle pour les mesures saisies, sans motif'::text,
                format('Prix %s retenu ; la règle propose : %s'::text, p.numero, COALESCE(prop.numeros, 'aucun article'::text)) AS format,
                NULL::numeric,
                NULL::text
               FROM public.lignes_quantites l
                 JOIN public.fuites f ON f.id = l.fuite_id AND f.supprime_le IS NULL
                 JOIN public.prix p ON p.id = l.prix_id
                 LEFT JOIN LATERAL ( SELECT string_agg(DISTINCT 'prix '::text || px.numero, ', '::text ORDER BY ('prix '::text || px.numero)) AS numeros,
                        bool_or(pp.prix_id = l.prix_id) AS couvert
                       FROM private.v_prix_proposes pp
                         LEFT JOIN public.prix px ON px.id = pp.prix_id
                      WHERE
                            CASE
                                WHEN l.refection_id IS NOT NULL THEN pp.refection_id = l.refection_id
                                WHEN l.reparation_id IS NOT NULL THEN pp.reparation_id = l.reparation_id AND pp.refection_id IS NULL
                                ELSE pp.fuite_id = l.fuite_id
                            END) prop ON true
              WHERE l.supprime_le IS NULL AND l.origine = 'manuel'::public.origine_ligne AND NULLIF(btrim(l.motif_correction), ''::text) IS NULL AND NOT COALESCE(prop.couvert, false)
            UNION ALL
             SELECT rep.marche_id,
                rep.fuite_id,
                rep.fuite_numero,
                rep.id,
                NULL::uuid,
                'pe_superieur_2m'::text,
                'information'::text,
                format('Polyéthylène au-delà de %s m : excédent hors bordereau, à faire valoir'::text, private.nombre_fr(rep.longueur_pe_max_m)) AS format,
                format('%s m posés : %s m au-delà des %s m couverts par l''article de réparation'::text, private.nombre_fr(rep.longueur_pe_m), private.nombre_fr(rep.longueur_pe_m - rep.longueur_pe_max_m), private.nombre_fr(rep.longueur_pe_max_m)) AS format,
                rep.longueur_pe_m - rep.longueur_pe_max_m,
                'm'::text
               FROM rep
              WHERE rep.resultat = 'reparee'::public.resultat_reparation AND rep.materiau::text = 'polyethylene'::text AND rep.longueur_pe_m > rep.longueur_pe_max_m
            UNION ALL
             SELECT rep.marche_id,
                rep.fuite_id,
                rep.fuite_numero,
                rep.id,
                NULL::uuid,
                'reparation_hors_bordereau'::text,
                'information'::text,
                'Réparation sans article au bordereau (matériau ou diamètre) : à faire valoir'::text,
                format('%s, diamètre %s'::text, private.libelle_materiau(rep.materiau::text), COALESCE(rep.diametre_mm || ' mm'::text, 'non saisi'::text)) AS format,
                NULL::numeric,
                NULL::text
               FROM rep
                 JOIN sans_article s ON s.id = rep.id
            )
     SELECT marche_id,
        fuite_id,
        fuite_numero,
        reparation_id,
        ligne_id,
        controle,
        gravite,
        libelle,
        detail,
        excedent,
        unite
       FROM controles c
      WHERE private.contexte_serveur() OR (marche_id = ANY ((( SELECT private.marches_autorises('attachements'::public.type_donnee, 'lire'::text) AS marches_autorises))::uuid[])) AND (marche_id = ANY ((( SELECT private.marches_autorises('quantites'::public.type_donnee, 'lire'::text) AS marches_autorises))::uuid[]))
  ) v
  left join public.fuites f on f.id = v.fuite_id;

create or replace view public.v_hors_bordereau with (security_invoker = true) as
select v.*, f.numero_affiche as fuite_numero_affiche
  from (
     WITH rep AS (
             SELECT r.id,
                r.marche_id,
                r.fuite_id,
                r.resultat,
                r.motif_id,
                r.realisee_le,
                r.auteur_terrain_id,
                r.saisi_par,
                r.source_saisie,
                r.ouvrage,
                r.materiau,
                r.diametre_mm,
                r.representant_srm,
                r.representant_srm_id,
                r.tuyau_repare,
                r.robinet_pec_change,
                r.collier_pec_change,
                r.bouche_a_cle_mise_a_niveau,
                r.element_remplace,
                r.longueur_pe_m,
                r.fouille_longueur_m,
                r.fouille_largeur_m,
                r.fouille_profondeur_m,
                r.volume_m3,
                r.emplacement,
                r.nature_revetement_id,
                r.observation,
                r.cree_le,
                r.modifie_le,
                r.supprime_le,
                r.supprime_par,
                r.validee_le,
                r.validee_par,
                f.numero AS fuite_numero,
                f.reference_srm,
                f.adresse,
                f.zone_id,
                z.libelle AS zone,
                f.secteur_id,
                s.libelle AS secteur,
                m.longueur_pe_max_m
               FROM public.reparations r
                 JOIN public.fuites f ON f.id = r.fuite_id AND f.supprime_le IS NULL
                 JOIN public.marches m ON m.id = r.marche_id
                 LEFT JOIN public.zones z ON z.id = f.zone_id
                 LEFT JOIN public.secteurs s ON s.id = f.secteur_id
              WHERE r.supprime_le IS NULL AND r.resultat = 'reparee'::public.resultat_reparation
            ), travaux AS (
             SELECT rep_1.marche_id,
                'pe_au_dela_2m'::text AS nature,
                format('Polyéthylène au-delà de %s m'::text, private.nombre_fr(rep_1.longueur_pe_max_m)) AS libelle,
                format('Polyéthylène %s mm : %s m posés, excédent au-delà de %s m'::text, COALESCE(rep_1.diametre_mm::text, '?'::text), private.nombre_fr(rep_1.longueur_pe_m), private.nombre_fr(rep_1.longueur_pe_max_m)) AS designation,
                rep_1.longueur_pe_m - rep_1.longueur_pe_max_m AS quantite,
                'm'::text AS unite,
                rep_1.id AS reparation_id,
                NULL::uuid AS piece_ligne_id,
                NULL::text AS piece_provenance,
                NULL::text AS piece_nature_correction
               FROM rep rep_1
              WHERE rep_1.materiau::text = 'polyethylene'::text AND rep_1.longueur_pe_m > rep_1.longueur_pe_max_m
            UNION ALL
             SELECT rep_1.marche_id,
                'reparation_sans_article'::text,
                'Réparation sans article au bordereau'::text,
                format('Réparation %s, diamètre %s'::text, private.libelle_materiau(rep_1.materiau::text), COALESCE(rep_1.diametre_mm || ' mm'::text, 'non saisi'::text)) AS format,
                1,
                'u'::text,
                rep_1.id,
                NULL::uuid,
                NULL::text,
                NULL::text
               FROM rep rep_1
              WHERE rep_1.tuyau_repare AND (EXISTS ( SELECT 1
                       FROM private.v_prix_proposes pp
                      WHERE pp.reparation_id = rep_1.id AND pp.refection_id IS NULL AND pp.famille = 'reparation_tuyau'::public.famille_prix AND pp.prix_id IS NULL)) AND NOT (EXISTS ( SELECT 1
                       FROM public.lignes_quantites l
                         JOIN public.prix p ON p.id = l.prix_id
                      WHERE l.reparation_id = rep_1.id AND l.supprime_le IS NULL AND (p.famille = 'reparation_tuyau'::public.famille_prix OR p.hors_bordereau)))
            UNION ALL
             SELECT rep_1.marche_id,
                'piece_non_couverte'::text,
                'Pièce non couverte par un article'::text,
                COALESCE(d.designation, rp.designation_libre) AS "coalesce",
                rp.quantite,
                COALESCE(d.unite, 'u'::text) AS "coalesce",
                rep_1.id,
                rp.id,
                rp.provenance,
                rp.nature_correction
               FROM public.reparation_pieces rp
                 JOIN rep rep_1 ON rep_1.id = rp.reparation_id
                 LEFT JOIN public.produits_dolibarr d ON d.dolibarr_id = rp.produit_id
                 LEFT JOIN public.prix ps ON ps.id = private.article_suggere(rp.marche_id, rp.produit_id)
              WHERE rp.supprime_le IS NULL AND rp.etat = 'posee'::text AND (COALESCE(ps.hors_bordereau, false) OR NOT (EXISTS ( SELECT 1
                       FROM public.lignes_quantites l
                         JOIN public.prix p ON p.id = l.prix_id
                      WHERE l.fuite_id = rep_1.fuite_id AND l.supprime_le IS NULL AND (p.hors_bordereau OR (p.famille <> ALL (ARRAY['terrassement'::public.famille_prix, 'refection'::public.famille_prix, 'balayage'::public.famille_prix, 'maintien'::public.famille_prix]))))))
            )
     SELECT t.marche_id,
        t.nature,
        t.libelle,
        rep.fuite_id,
        rep.fuite_numero,
        rep.reference_srm,
        rep.adresse,
        rep.zone_id,
        rep.zone,
        rep.secteur_id,
        rep.secteur,
        t.reparation_id,
        rep.realisee_le,
        private.jour_maroc(rep.realisee_le) AS jour,
        rep.materiau::text AS materiau,
        rep.diametre_mm,
        t.designation,
        t.quantite,
        t.unite,
        t.piece_ligne_id,
        t.piece_provenance,
        t.piece_nature_correction
       FROM travaux t
         JOIN rep ON rep.id = t.reparation_id
      WHERE private.contexte_serveur() OR (t.marche_id = ANY ((( SELECT private.marches_autorises('attachements'::public.type_donnee, 'lire'::text) AS marches_autorises))::uuid[])) AND (t.marche_id = ANY ((( SELECT private.marches_autorises('quantites'::public.type_donnee, 'lire'::text) AS marches_autorises))::uuid[]))
  ) v
  left join public.fuites f on f.id = v.fuite_id;

-- -----------------------------------------------------------------------------
-- 11. Privilèges des nouvelles fonctions
-- -----------------------------------------------------------------------------
revoke execute on function
  private.numero_affiche(integer, smallint),
  private.numero_redetection(uuid, uuid),
  private.proteger_numero_fuite(),
  private.cloturer_fuite_redetectee(),
  private.notifier_redetection()
  from public, anon, authenticated;
-- numero_redetection : appelée par avant_insertion_saisie (droits de l'appelant) ; numero_affiche : vues.
grant execute on function
  private.numero_affiche(integer, smallint),
  private.numero_redetection(uuid, uuid)
  to authenticated;
grant execute on function
  private.numero_affiche(integer, smallint),
  private.numero_redetection(uuid, uuid),
  private.proteger_numero_fuite(),
  private.cloturer_fuite_redetectee(),
  private.notifier_redetection()
  to service_role;
