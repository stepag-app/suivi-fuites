-- =============================================================================
-- Chantier v2, S1 / fichier 2 : comptes, rôles et droits (R1, R2, R3, R4, R6, R7).
-- Contrat pour les écrans : docs/lots/chantier-v2-base-s1.md.
--
--  R1  Rôle « refection » (libellé « Réfection »), cumulable avec detection,
--      chef_reparation (libellé « Réparation ») et responsable. Les réfections ont
--      leur propre type de donnée « refections » : droits « interventions »
--      existants recopiés, rôle « refection » ajouté aux comptes « chef_reparation »
--      (même équipe aujourd'hui) : rien ne change pour eux.
--  R2  modifier_roles (rôles d'un compte dans un marché, droits recalculés) ;
--      compte_supprimable (raison affichée par le bouton grisé) ; suppression d'un
--      profil refusée par la base dès qu'il a la moindre saisie.
--  R3, R4, R6  nom, prénom, matricule (profils et ouvriers), entreprise du compte.
--  R7  Pièces ajoutées par le bureau (provenance « correction ») invisibles des
--      comptes de terrain ; v_pieces_terrain : la déclaration du terrain.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. R1 : rôle « refection » et type de donnée « refections »
-- -----------------------------------------------------------------------------
alter table public.affectations drop constraint affectations_roles_check;
alter table public.affectations add constraint affectations_roles_check
  check (roles <@ array['detection', 'chef_reparation', 'refection', 'responsable']::text[]);

alter table public.modeles_droits drop constraint modeles_droits_role_check;
alter table public.modeles_droits add constraint modeles_droits_role_check
  check (role in ('detection', 'chef_reparation', 'refection', 'responsable'));

insert into public.modeles_droits (role, type_donnee, lire, creer, modifier, supprimer, valider) values
  -- Équipe de réfection : voit la fuite et la réparation (fouille, revêtement), saisit ses réfections.
  ('refection', 'fuites',        true, false, 'non',     'non',     false),
  ('refection', 'interventions', true, false, 'non',     'non',     false),
  ('refection', 'refections',    true, true,  'siennes', 'non',     false),
  ('refection', 'photos',        true, true,  'siennes', 'siennes', false),
  -- Les autres rôles voient les réfections ; seul le responsable les gère.
  ('detection',       'refections', true, false, 'non',    'non',    false),
  ('chef_reparation', 'refections', true, false, 'non',    'non',    false),
  ('responsable',     'refections', true, true,  'toutes', 'toutes', true)
on conflict (role, type_donnee) do nothing;

-- Droits existants : les réfections gardent exactement les droits « interventions » de chacun.
insert into public.droits (profil_id, marche_id, type_donnee, lire, creer, modifier, supprimer, valider)
select d.profil_id, d.marche_id, 'refections', d.lire, d.creer, d.modifier, d.supprimer, d.valider
  from public.droits d
 where d.type_donnee = 'interventions'
on conflict (profil_id, marche_id, type_donnee) do nothing;

update public.affectations a
   set roles = (select array_agg(distinct r order by r) from unnest(a.roles || array['refection']) r)
 where 'chef_reparation' = any (a.roles) and not 'refection' = any (a.roles);

-- Règles des réfections : droit « refections » (et non plus « interventions »).
drop policy refections_lecture on public.refections;
drop policy refections_creation on public.refections;
drop policy refections_modification on public.refections;
create policy refections_lecture on public.refections for select to authenticated
  using (marche_id = any ((select private.marches_autorises('refections', 'lire'))::uuid[]));
create policy refections_creation on public.refections for insert to authenticated
  with check (marche_id = any ((select private.marches_autorises('refections', 'creer'))::uuid[]));
create policy refections_modification on public.refections for update to authenticated
  using (
    marche_id = any ((select private.marches_autorises('refections', 'modifier'))::uuid[])
    or marche_id = any ((select private.marches_autorises('refections', 'supprimer'))::uuid[])
    or marche_id = any ((select private.marches_autorises('refections', 'valider'))::uuid[])
  )
  with check (
    marche_id = any ((select private.marches_autorises('refections', 'modifier'))::uuid[])
    or marche_id = any ((select private.marches_autorises('refections', 'supprimer'))::uuid[])
    or marche_id = any ((select private.marches_autorises('refections', 'valider'))::uuid[])
  );

-- Verrous de sécurité de l'administrateur : le nouveau type de donnée se verrouille comme les autres.
alter table public.verrous_admin drop constraint verrous_admin_droit_connu;
alter table public.verrous_admin add constraint verrous_admin_droit_connu check (
  (objet in ('fuites', 'interventions', 'refections', 'photos', 'quantites', 'parametres', 'ouvriers', 'journal',
             'exports', 'balayage', 'mesures_debit', 'attachements', 'evenements')
   and action in ('lire', 'creer', 'modifier', 'supprimer', 'valider'))
  or (objet, action) in (('attachements', 'rouvrir'), ('attachements', 'forcer'),
                         ('marches', 'desactiver'), ('marches', 'copier'), ('comptes', 'revoquer'))
);

-- -----------------------------------------------------------------------------
-- 2. R3, R4, R6 : nom, prénom, matricule, entreprise
-- -----------------------------------------------------------------------------
alter table public.profils
  add column nom text,
  add column prenom text,
  add column matricule text,
  add column entreprise text not null default 'STEPAG';

comment on column public.profils.nom is
  'Nom de famille (R3) ; s''il est saisi avec le prénom, nom_complet devient « NOM Prénom » (déclencheur)';
comment on column public.profils.prenom is 'Prénom (R3)';
comment on column public.profils.matricule is
  'Matricule (R4) : remplace le nom dans tout document imprimé ou exporté ; unique, sans distinction de casse';
comment on column public.profils.entreprise is
  'Entreprise du compte (R6) : STEPAG par défaut, ou le sous-traitant';

create unique index profils_matricule_idx on public.profils (upper(matricule)) where matricule is not null;

alter table public.ouvriers add column matricule text;
comment on column public.ouvriers.matricule is
  'Matricule (R4) : remplace le nom dans tout document imprimé ou exporté ; unique par marché';
create unique index ouvriers_matricule_idx on public.ouvriers (marche_id, upper(matricule)) where matricule is not null;

-- Valeurs nettoyées ; nom_complet recomposé quand le nom ou le prénom change.
create function private.normaliser_profil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nom := nullif(btrim(new.nom), '');
  new.prenom := nullif(btrim(new.prenom), '');
  new.matricule := nullif(btrim(new.matricule), '');
  new.entreprise := coalesce(nullif(btrim(new.entreprise), ''), 'STEPAG');
  if (new.nom is not null or new.prenom is not null)
     and (tg_op = 'INSERT' or (new.nom, new.prenom) is distinct from (old.nom, old.prenom)) then
    new.nom_complet := btrim(concat_ws(' ', upper(new.nom), new.prenom));
  end if;
  return new;
end
$$;

create trigger b_normaliser_profil before insert or update on public.profils
  for each row execute function private.normaliser_profil();

create function private.normaliser_matricule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.matricule := nullif(btrim(new.matricule), '');
  return new;
end
$$;

create trigger b_normaliser_matricule before insert or update on public.ouvriers
  for each row execute function private.normaliser_matricule();

-- Création du profil : nom, prénom, matricule et entreprise lus aussi dans les métadonnées du compte
-- (fonction gerer-utilisateurs). Même corps que 20261004090100 pour le reste.
create or replace function private.creer_profil_utilisateur()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  _identifiant text := lower(coalesce(_meta ->> 'identifiant', split_part(new.email, '@', 1)));
begin
  insert into public.profils (id, identifiant, nom_complet, nom, prenom, matricule, entreprise)
  values (new.id, _identifiant, coalesce(nullif(btrim(_meta ->> 'nom_complet'), ''), _identifiant),
          _meta ->> 'nom', _meta ->> 'prenom', _meta ->> 'matricule', _meta ->> 'entreprise');
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- 3. R2 : rôles par marché et suppression d'un compte
-- -----------------------------------------------------------------------------

-- Saisies d'un compte : toute ligne qui le désigne (auteur, saisie, validation, verrou, correction,
-- suppression, balayage, lot…) par une clé étrangère vers profils, et toute ligne du journal écrite
-- par lui. Ne comptent pas : son profil, ses affectations et droits, ses verrous, ses notifications
-- et appareils, ni les changements de sa propre langue. Les tables ajoutées plus tard avec une clé
-- étrangère vers profils sont prises en compte d'office.
create function private.saisies_compte(p_profil uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _r record;
  _n bigint;
  _res jsonb := '{}'::jsonb;
begin
  for _r in
    select n.nspname as schema_nom, t.relname as table_nom, a.attname as colonne
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.profils'::regclass
       and cardinality(c.conkey) = 1
       and not (n.nspname = 'public'
                and t.relname in ('profils', 'affectations', 'droits', 'verrous_admin', 'notifications', 'appareils_push'))
     order by 1, 2, 3
  loop
    execute format('select count(*) from %I.%I where %I = $1', _r.schema_nom, _r.table_nom, _r.colonne)
      into _n using p_profil;
    if _n > 0 then
      _res := _res || jsonb_build_object(_r.table_nom, coalesce((_res ->> _r.table_nom)::bigint, 0) + _n);
    end if;
  end loop;

  select count(*) into _n
    from public.journal j
   where j.utilisateur_id = p_profil
     and j.table_nom not in ('notifications', 'appareils_push')
     and not (j.table_nom = 'profils' and j.ligne_id = p_profil::text);
  if _n > 0 then
    _res := _res || jsonb_build_object('journal', _n);
  end if;
  return _res;
end
$$;

-- Le compte peut-il être supprimé ? Sinon, la raison (bouton « Supprimer » grisé) : révocation seule.
-- Réservé à l'administrateur (et au serveur).
create function public.compte_supprimable(p_profil uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _p public.profils;
  _saisies jsonb;
  _detail text;
begin
  if not (private.contexte_serveur() or private.est_admin()) then
    raise exception 'Réservé à l''administrateur' using errcode = 'insufficient_privilege';
  end if;
  select * into _p from public.profils where id = p_profil;
  if _p.id is null then
    raise exception 'Compte introuvable' using errcode = 'no_data_found';
  end if;
  _saisies := private.saisies_compte(p_profil);
  select string_agg(format('%s : %s', k, v), ', ' order by k) into _detail from jsonb_each_text(_saisies) e (k, v);
  return jsonb_build_object(
    'supprimable', not (_p.est_admin or p_profil = auth.uid() or _saisies <> '{}'::jsonb),
    'raison', case
      when p_profil = auth.uid() then 'Vous ne pouvez pas supprimer votre propre compte'
      when _p.est_admin then 'Compte administrateur : retirez d''abord le statut d''administrateur'
      when _saisies <> '{}'::jsonb then format('Ce compte a des saisies (%s) : révocation seulement', _detail)
    end,
    'saisies', _saisies
  );
end
$$;

-- Suppression d'un profil (cascade de la suppression du compte par la fonction serveur) : refusée
-- s'il a la moindre saisie ou s'il est administrateur ; sinon ses affectations et droits partent avec.
create function private.avant_suppression_profil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _saisies jsonb := private.saisies_compte(old.id);
begin
  if old.est_admin then
    raise exception 'Compte administrateur : suppression refusée' using errcode = 'check_violation';
  end if;
  if _saisies <> '{}'::jsonb then
    raise exception 'Suppression refusée : ce compte a des saisies (%). Révoquez-le.',
      (select string_agg(format('%s : %s', k, v), ', ' order by k) from jsonb_each_text(_saisies) e (k, v))
      using errcode = 'check_violation';
  end if;
  delete from public.affectations where profil_id = old.id;
  return old;
end
$$;

create trigger a_avant_suppression before delete on public.profils
  for each row execute function private.avant_suppression_profil();

-- Rôles d'un compte dans un marché (administrateur) : la liste remplace l'ancienne.
--  * rôle ajouté : son modèle est fusionné dans les droits (comme appliquer_modele_role) ;
--  * rôle retiré : un droit que seul ce rôle accordait redescend au niveau des rôles restants
--    (un droit ajouté à la main dans la matrice et que le rôle retiré n'accordait pas est gardé) ;
--  * liste vide : le compte est retiré du marché (affectation inactive, droits effacés).
create function public.modifier_roles(p_profil uuid, p_marche uuid, p_roles text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _roles text[] := (select coalesce(array_agg(distinct btrim(r) order by btrim(r)), '{}')
                      from unnest(coalesce(p_roles, '{}')) r);
  _anciens text[];
  _retires text[];
  _role text;
begin
  if not (private.contexte_serveur() or private.est_admin()) then
    raise exception 'Réservé à l''administrateur' using errcode = 'insufficient_privilege';
  end if;
  if not (_roles <@ array['detection', 'chef_reparation', 'refection', 'responsable']::text[]) then
    raise exception 'Rôle inconnu dans %', _roles using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.profils p where p.id = p_profil) then
    raise exception 'Compte introuvable' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.marches m where m.id = p_marche) then
    raise exception 'Marché introuvable' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.profils p where p.id = p_profil and p.est_admin) then
    raise exception 'Un administrateur a tous les droits : pas de rôle à régler'
      using errcode = 'check_violation';
  end if;

  select a.roles into _anciens from public.affectations a
   where a.profil_id = p_profil and a.marche_id = p_marche
   for update;

  if cardinality(_roles) = 0 then
    if _anciens is not null then
      delete from public.droits where profil_id = p_profil and marche_id = p_marche;
      update public.affectations set roles = '{}', actif = false
       where profil_id = p_profil and marche_id = p_marche;
    end if;
    return;
  end if;

  if _anciens is not null then
    _retires := (select coalesce(array_agg(r), '{}') from unnest(_anciens) r where not r = any (_roles));
    if cardinality(_retires) > 0 then
      with restants as (
        select m.type_donnee, bool_or(m.lire) as lire, bool_or(m.creer) as creer,
               max(m.modifier) as modifier, max(m.supprimer) as supprimer, bool_or(m.valider) as valider
          from public.modeles_droits m where m.role = any (_roles) group by m.type_donnee
      ), retires as (
        select m.type_donnee, bool_or(m.lire) as lire, bool_or(m.creer) as creer,
               max(m.modifier) as modifier, max(m.supprimer) as supprimer, bool_or(m.valider) as valider
          from public.modeles_droits m where m.role = any (_retires) group by m.type_donnee
      )
      update public.droits d
         set lire = d.lire and not (x.lire and not coalesce(r.lire, false)),
             creer = d.creer and not (x.creer and not coalesce(r.creer, false)),
             modifier = case when x.modifier > coalesce(r.modifier, 'non')
                             then least(d.modifier, coalesce(r.modifier, 'non')) else d.modifier end,
             supprimer = case when x.supprimer > coalesce(r.supprimer, 'non')
                              then least(d.supprimer, coalesce(r.supprimer, 'non')) else d.supprimer end,
             valider = d.valider and not (x.valider and not coalesce(r.valider, false))
        from retires x
        left join restants r on r.type_donnee = x.type_donnee
       where d.profil_id = p_profil and d.marche_id = p_marche and d.type_donnee = x.type_donnee;
    end if;
    update public.affectations
       set roles = (select coalesce(array_agg(r order by r), '{}') from unnest(_anciens) r where r = any (_roles)),
           actif = true
     where profil_id = p_profil and marche_id = p_marche;
  end if;

  foreach _role in array _roles loop
    if _anciens is null or not _role = any (_anciens) then
      perform public.appliquer_modele_role(p_profil, p_marche, _role);
    end if;
  end loop;
  -- Rôle réaffiché même quand l'affectation était inactive (liste vide auparavant)
  update public.affectations set roles = _roles, actif = true
   where profil_id = p_profil and marche_id = p_marche and roles is distinct from _roles;
end
$$;

comment on function public.modifier_roles(uuid, uuid, text[]) is
  'Administrateur : remplace les rôles d''un compte dans un marché et recalcule ses droits (R2).';
comment on function public.compte_supprimable(uuid) is
  'Administrateur : {supprimable, raison, saisies} ; la base refuse la suppression d''un compte qui a des saisies (R2).';

-- -----------------------------------------------------------------------------
-- 4. R7 : corrections du bureau invisibles du terrain
-- -----------------------------------------------------------------------------

-- Marchés où le compte est « bureau » : administrateur, ou droit « interventions / valider » ou
-- « quantités / lire » (responsable). Les rôles détection, réparation et réfection n'en ont aucun.
create function private.marches_bureau()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.est_admin() then
      (select coalesce(array_agg(m.id), '{}') from public.marches m)
    else
      (select coalesce(array_agg(distinct d.marche_id), '{}')
         from public.droits d
         join public.affectations a
           on a.profil_id = d.profil_id and a.marche_id = d.marche_id and a.actif
         join public.profils p on p.id = d.profil_id and p.actif
        where d.profil_id = auth.uid()
          and ((d.type_donnee = 'interventions' and d.valider) or (d.type_donnee = 'quantites' and d.lire)))
  end
$$;

-- Pièces ajoutées par le bureau (oubli, remplacement) : lues seulement par le bureau. Les lignes de
-- quantités, requalifications et lots d'attachement le sont déjà (droits « quantités » et
-- « attachements », absents des rôles de terrain).
drop policy reparation_pieces_lecture on public.reparation_pieces;
create policy reparation_pieces_lecture on public.reparation_pieces for select to authenticated
  using (
    marche_id = any ((select private.marches_autorises('interventions', 'lire'))::uuid[])
    and (provenance = 'terrain' or marche_id = any ((select private.marches_bureau())::uuid[]))
  );

-- Déclaration du terrain : les pièces telles que l'équipe les a saisies, sans les corrections du
-- bureau (une pièce remplacée ou retirée par le bureau y figure comme saisie ; une pièce que l'auteur
-- a lui-même remplacée ou retirée n'y figure plus). Écran de l'APK et de la fiche pour le terrain.
create view public.v_pieces_terrain with (security_invoker = true) as
select
  rp.id,
  rp.marche_id,
  rp.reparation_id,
  r.fuite_id,
  rp.produit_id,
  d.designation,
  d.famille,
  coalesce(d.unite, 'u') as unite,
  rp.quantite,
  rp.saisi_par,
  rp.cree_le
from public.reparation_pieces rp
join public.reparations r on r.id = rp.reparation_id and r.supprime_le is null
left join public.produits_dolibarr d on d.dolibarr_id = rp.produit_id
where rp.supprime_le is null
  and rp.provenance = 'terrain'
  and not (rp.etat = 'retiree' and rp.etat_par in (r.auteur_terrain_id, r.saisi_par))
  and not exists (select 1 from public.reparation_pieces n
                   where n.remplace_piece_id = rp.id and n.provenance = 'terrain' and n.supprime_le is null);

grant select on public.v_pieces_terrain to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Privilèges
-- -----------------------------------------------------------------------------
revoke execute on function
  private.normaliser_profil(),
  private.normaliser_matricule(),
  private.saisies_compte(uuid),
  private.avant_suppression_profil(),
  private.marches_bureau(),
  public.compte_supprimable(uuid),
  public.modifier_roles(uuid, uuid, text[])
  from public, anon;
grant execute on function
  private.marches_bureau(),
  public.compte_supprimable(uuid),
  public.modifier_roles(uuid, uuid, text[])
  to authenticated, service_role;
grant execute on function
  private.normaliser_profil(),
  private.normaliser_matricule(),
  private.saisies_compte(uuid),
  private.avant_suppression_profil()
  to service_role;
