-- =============================================================================
-- Durcissement de sécurité (audit offensif S20) — défense au plus près de la donnée.
-- Chaque bloc redéfinit une fonction / un déclencheur / une règle existante pour fermer
-- une faille prouvée sur banc local (PostgreSQL 17 + migrations). Aucun changement de
-- schéma, aucun impact sur le fonctionnement nominal : on resserre des contrôles d'auteur
-- et des colonnes sensibles qui n'étaient pas gardés.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. est_affecte : ignorait profils.actif ET affectations.actif. Un agent désactivé
--    ou une affectation retirée restait « affecté » (utilisé par la saisie à la place).
-- -----------------------------------------------------------------------------
create or replace function private.est_affecte(p_profil uuid, p_marche uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.affectations a
      join public.profils p on p.id = a.profil_id and p.actif
     where a.profil_id = p_profil and a.marche_id = p_marche and a.actif
  )
$$;

-- -----------------------------------------------------------------------------
-- 2. proteger_marche : montant_ttc et identifiants légaux (ICE/IF/RC/patente/CNSS)
--    étaient modifiables par un responsable (parametres/modifier). Données
--    contractuelles → réservées à l'administrateur, comme le code et l'activation.
-- -----------------------------------------------------------------------------
create or replace function private.proteger_marche()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.appel_systeme() or private.est_admin() then
    return new;
  end if;
  if new.code is distinct from old.code or new.actif is distinct from old.actif then
    raise exception 'Le code et l''activation d''un marché sont réservés à l''administrateur'
      using errcode = 'insufficient_privilege';
  end if;
  if new.montant_ttc    is distinct from old.montant_ttc
     or new.titulaire_ice     is distinct from old.titulaire_ice
     or new.titulaire_if      is distinct from old.titulaire_if
     or new.titulaire_rc      is distinct from old.titulaire_rc
     or new.titulaire_patente is distinct from old.titulaire_patente
     or new.titulaire_cnss    is distinct from old.titulaire_cnss
     or new.client_ice        is distinct from old.client_ice then
    raise exception 'Le montant et les identifiants légaux du marché sont réservés à l''administrateur'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- 3. avant_insertion_balayage : agent_id était pris tel quel du client
--    (coalesce(agent_id, auth.uid())) → un agent pouvait créditer un collègue d'un
--    balayage (base du prix 1). On calque le contrôle « saisie à la place » : poser un
--    autre agent exige le droit « balayage / valider » et que l'agent soit affecté.
--    (balaye_le / date_balayage restent fournis par le client : horodatage réel du
--    balayage hors ligne, non l'heure de synchro.)
-- -----------------------------------------------------------------------------
create or replace function private.avant_insertion_balayage()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _actif boolean;
begin
  if not private.appel_systeme() then
    new.saisi_par := auth.uid();
    new.annule_le := null;
    new.annule_par := null;
    new.motif_annulation := null;
    new.cree_le := now();
  end if;
  new.agent_id := coalesce(new.agent_id, auth.uid());
  new.saisi_par := coalesce(new.saisi_par, auth.uid());

  -- Balayage au nom d'un autre agent : réservé au responsable, agent affecté au marché.
  if not private.appel_systeme() and new.agent_id is distinct from auth.uid() then
    if not private.peut(new.marche_id, 'balayage', 'valider') then
      raise exception 'Balayage au nom d''un autre agent réservé au responsable'
        using errcode = 'insufficient_privilege';
    end if;
    if not private.est_affecte(new.agent_id, new.marche_id) then
      raise exception 'L''agent choisi n''est pas affecté à ce marché'
        using errcode = 'check_violation';
    end if;
  end if;

  _actif := private.troncon_actif(new.troncon_id);
  if _actif is null then
    raise exception 'Tronçon introuvable' using errcode = 'foreign_key_violation';
  elsif not _actif then
    raise exception 'Tronçon désactivé : balayage impossible' using errcode = 'check_violation';
  end if;

  new.premier_passage := new.annule_le is null
                         and private.est_premier_passage(new.troncon_id, new.balaye_le, new.id);
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- 4. avant_insertion_saisie : photos.auteur_terrain_id n'était soumis à aucun contrôle
--    « saisie à la place » (le bloc existant ne couvre que fuites/reparations/refections,
--    et pour ces tables _type = interventions ne convient pas aux photos). On ajoute un
--    contrôle dédié aux photos : poser un auteur ≠ soi exige « photos / valider ».
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
    new.cree_le := now();
  end if;
  if tg_table_name in ('fuites', 'reparations', 'refections', 'photos') then
    new.auteur_terrain_id := coalesce(new.auteur_terrain_id, new.saisi_par);
  end if;

  -- Photos : saisie à la place (auteur terrain choisi) réservée au droit « photos / valider ».
  if tg_table_name = 'photos' and not private.appel_systeme()
     and new.auteur_terrain_id is distinct from auth.uid() then
    if not private.peut(new.marche_id, 'photos', 'valider') then
      raise exception 'Photo au nom d''un autre agent réservée au responsable'
        using errcode = 'insufficient_privilege';
    end if;
    if not private.est_affecte(new.auteur_terrain_id, new.marche_id) then
      raise exception 'L''agent choisi n''est pas affecté à ce marché'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_table_name in ('fuites', 'reparations', 'refections') and not private.appel_systeme() then
    if new.auteur_terrain_id is distinct from auth.uid() then
      if not private.peut(new.marche_id, _type, 'valider') then
        raise exception 'Saisie à la place d''un agent réservée au responsable' using errcode = 'insufficient_privilege';
      end if;
      if not private.est_affecte(new.auteur_terrain_id, new.marche_id) then
        raise exception 'L''agent choisi n''est pas affecté à ce marché' using errcode = 'check_violation';
      end if;
    end if;
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
$$;

-- -----------------------------------------------------------------------------
-- 5. reparation_ouvriers : aucun déclencheur INSERT/DELETE → un chef de réparation
--    (interventions/modifier = « siennes ») pouvait ajouter/retirer des ouvriers sur la
--    réparation d'un collègue (main-d'œuvre → quantités/attachement). On exige le droit
--    « modifier » à la portée réelle sur la réparation parente, et on respecte le verrou
--    de validation (comme reparation_pieces).
-- -----------------------------------------------------------------------------
create or replace function private.controler_auteur_reparation_ouvriers()
returns trigger
language plpgsql
set search_path = ''   -- SECURITY INVOKER (défaut) : private.appel_systeme() doit voir le rôle réel
                       -- (authenticated), sinon une fonction DEFINER bascule current_user sur le
                       -- propriétaire et le contrôle est court-circuité (piège appel_systeme du §5).
as $$
declare
  _ligne public.reparation_ouvriers := coalesce(new, old);
  _rep record;
begin
  if private.appel_systeme() then
    return coalesce(new, old);
  end if;
  select r.marche_id, r.auteur_terrain_id, r.saisi_par, r.validee_le
    into _rep
    from public.reparations r
   where r.id = _ligne.reparation_id;
  if not found then
    raise exception 'Réparation introuvable' using errcode = 'foreign_key_violation';
  end if;
  -- Réparation validée : main-d'œuvre réservée au droit « valider ».
  if _rep.validee_le is not null and not private.peut(_rep.marche_id, 'interventions', 'valider') then
    raise exception 'Réparation validée : ouvriers réservés au responsable (ajoutez une nouvelle réparation)'
      using errcode = 'insufficient_privilege';
  end if;
  -- Gérer la main-d'œuvre d'une réparation exige « modifier » à sa portée (siennes/toutes).
  if not private.peut(_rep.marche_id, 'interventions', 'modifier', _rep.auteur_terrain_id, _rep.saisi_par) then
    raise exception 'Ouvriers : réservé à l''auteur de la réparation ou au responsable'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end
$$;

drop trigger if exists d_controler_auteur on public.reparation_ouvriers;
create trigger d_controler_auteur
  before insert or delete on public.reparation_ouvriers
  for each row execute function private.controler_auteur_reparation_ouvriers();

-- -----------------------------------------------------------------------------
-- 6. activer_produits_dolibarr : un droit « paramètres / modifier » sur UN marché
--    agissait sur le référentiel GLOBAL (table sans marche_id) → effet inter-marchés.
--    Aligné sur importer_produits_dolibarr : réservé à l'administrateur.
-- -----------------------------------------------------------------------------
create or replace function public.activer_produits_dolibarr(p_ids integer[], p_utilisable boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _n integer;
begin
  -- Durcissement S20 : l'effet est GLOBAL (table sans marche_id) → réservé à l'administrateur
  -- (aligné sur importer_produits_dolibarr). Avant : un droit « paramètres / modifier » sur un
  -- seul marché suffisait, ce qui agissait sur le catalogue de tous les marchés.
  if not private.est_admin() then
    raise exception 'L''activation des articles Dolibarr est réservée à l''administrateur'
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

-- 7. Storage (compartiment photos) : la règle d'INSERT ne vérifiait que le dossier
--    marché (foldername[1]). Le 2e segment (fuite) n'était pas lié à une vraie fuite du
--    marché → dépôt d'un objet dans l'arborescence d'une fuite d'autrui ou inexistante.
--    On lie foldername[2] à une fuite non supprimée du marché (même garde que photos-r2).
-- -----------------------------------------------------------------------------
create or replace function private.fuite_du_marche(p_fuite uuid, p_marche uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.fuites f
     where f.id = p_fuite and f.marche_id = p_marche and f.supprime_le is null
  )
$$;
grant execute on function private.fuite_du_marche(uuid, uuid) to authenticated;

drop policy if exists photos_fichiers_envoi on storage.objects;
create policy photos_fichiers_envoi on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and private.uuid_ou_nul((storage.foldername(name))[1]) = any (
      (select private.marches_autorises('photos'::public.type_donnee, 'creer'))::uuid[]
    )
    and private.fuite_du_marche(
      private.uuid_ou_nul((storage.foldername(name))[2]),
      private.uuid_ou_nul((storage.foldername(name))[1])
    )
  );
