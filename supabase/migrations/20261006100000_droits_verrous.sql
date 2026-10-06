-- =============================================================================
-- Lot Q : matrice des droits par utilisateur et verrous de sécurité de
-- l'administrateur.
--
--  * Matrice : l'administrateur règle les droits (table « droits ») de chaque
--    utilisateur d'un marché, colonne par colonne ; « enregistrer_droits » écrit
--    tous les changements d'un coup (journal alimenté par le déclencheur
--    existant de « droits » et « affectations »).
--  * Verrous de sécurité : l'administrateur a tout, mais il peut se retirer
--    lui-même un droit (« verrouillé pour moi »), pour se protéger d'une fausse
--    manœuvre. Le verrou vaut pour tous les marchés ; il reste posé jusqu'à ce
--    qu'il l'ouvre lui-même (pas de refermeture automatique). Pose et retrait
--    sont journalisés.
--  * Effet en base : un verrou sur un droit (type de donnée × lire / créer /
--    modifier / supprimer / valider) le retire à l'administrateur partout où la
--    base le contrôle (private.peut, private.marches_autorises : règles RLS,
--    déclencheurs, fonctions). Les actions réservées à l'administrateur ont leur
--    propre verrou : rouvrir un lot, refacturation forcée, désactiver un marché,
--    copier un marché, révoquer un compte.
--  * Sans aucun verrou, rien ne change.
--  * Révocation d'un compte : faite par l'administrateur connecté (verrou
--    contrôlé ici) ; la fonction serveur gerer-utilisateurs (service_role) ne
--    fait plus que bloquer la connexion d'un profil déjà révoqué.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Verrous posés par un administrateur sur lui-même
-- -----------------------------------------------------------------------------
create table public.verrous_admin (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null default auth.uid() references public.profils (id) on delete cascade,
  objet text not null,      -- type de donnée, ou « marches », « comptes »
  action text not null,     -- colonne de « droits », ou action réservée à l'administrateur
  pose_le timestamptz not null default now(),
  unique (profil_id, objet, action),
  constraint verrous_admin_droit_connu check (
    (objet in ('fuites', 'interventions', 'photos', 'quantites', 'parametres', 'ouvriers', 'journal',
               'exports', 'balayage', 'mesures_debit', 'attachements', 'evenements')
     and action in ('lire', 'creer', 'modifier', 'supprimer', 'valider'))
    or (objet, action) in (('attachements', 'rouvrir'), ('attachements', 'forcer'),
                           ('marches', 'desactiver'), ('marches', 'copier'), ('comptes', 'revoquer'))
  )
);
alter table public.verrous_admin enable row level security;

comment on table public.verrous_admin is
  'Verrous de sécurité qu''un administrateur pose sur lui-même : l''action est refusée par la base tant qu''il ne l''a pas rouvert.';

-- -----------------------------------------------------------------------------
-- 2. Fonctions de contrôle
-- -----------------------------------------------------------------------------

-- L'utilisateur connecté a-t-il posé ce verrou sur lui-même ?
create function private.verrou_admin(p_objet text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.verrous_admin v
     where v.profil_id = auth.uid() and v.objet = p_objet and v.action = p_action
  )
$$;

create function private.libelle_verrou(p_objet text, p_action text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_objet || '.' || p_action
    when 'fuites.supprimer' then 'supprimer une fuite'
    when 'attachements.valider' then 'arrêter un lot d''attachement'
    when 'attachements.rouvrir' then 'rouvrir un lot d''attachement'
    when 'attachements.forcer' then 'refacturation forcée'
    when 'marches.desactiver' then 'désactiver un marché'
    when 'marches.copier' then 'créer un marché par copie'
    when 'comptes.revoquer' then 'révoquer un compte'
    when 'parametres.modifier' then 'modifier les paramètres du marché'
    else p_objet || ' / ' || p_action
  end
$$;

-- Refuse l'action à un administrateur qui l'a verrouillée pour lui-même.
create function private.controler_verrou_admin(p_objet text, p_action text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.est_admin() and private.verrou_admin(p_objet, p_action) then
    raise exception 'Action verrouillée par vous : %. Ouvrez le verrou (Utilisateurs > Droits) pour agir.',
      private.libelle_verrou(p_objet, p_action)
      using errcode = 'insufficient_privilege';
  end if;
end
$$;

-- Marchés autorisés : l'administrateur perd le droit qu'il a verrouillé.
-- (Reprend la version du lot J : marché actif exigé pour toute action autre que « lire ».)
create or replace function private.marches_autorises(p_type public.type_donnee, p_action text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.est_admin() then
      case when private.verrou_admin(p_type::text, p_action) then '{}'::uuid[]
           else (select coalesce(array_agg(m.id), '{}') from public.marches m)
      end
    else
      (select coalesce(array_agg(d.marche_id), '{}')
         from public.droits d
         join public.affectations a
           on a.profil_id = d.profil_id and a.marche_id = d.marche_id and a.actif
         join public.profils p on p.id = d.profil_id and p.actif
         join public.marches m on m.id = d.marche_id and (m.actif or p_action = 'lire')
        where d.profil_id = auth.uid()
          and d.type_donnee = p_type
          and case p_action
                when 'lire' then d.lire
                when 'creer' then d.creer
                when 'valider' then d.valider
                when 'modifier' then d.modifier <> 'non'
                when 'supprimer' then d.supprimer <> 'non'
                else false
              end)
  end
$$;

-- Contrôle ligne par ligne : idem, l'administrateur perd le droit qu'il a verrouillé.
create or replace function private.peut(
  p_marche uuid,
  p_type public.type_donnee,
  p_action text,
  p_auteur uuid default null,
  p_saisi_par uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _d public.droits;
  _portee public.portee_droit;
begin
  if p_marche is null then
    return false;
  end if;
  if private.est_admin() then
    return not private.verrou_admin(p_type::text, p_action);
  end if;
  if p_action <> 'lire'
     and not exists (select 1 from public.marches m where m.id = p_marche and m.actif) then
    return false;
  end if;
  _d := private.droit(p_marche, p_type);
  if _d.id is null then
    return false;
  end if;
  case p_action
    when 'lire' then return _d.lire;
    when 'creer' then return _d.creer;
    when 'valider' then return _d.valider;
    when 'modifier' then _portee := _d.modifier;
    when 'supprimer' then _portee := _d.supprimer;
    else return false;
  end case;
  return _portee = 'toutes'
      or (_portee = 'siennes' and auth.uid() in (p_auteur, p_saisi_par));
end
$$;

-- Journal des modifications : l'administrateur lisait tout par sa règle propre ; le verrou
-- « journal / lire » s'y applique aussi (lignes sans marché comprises : comptes, droits, verrous).
drop policy journal_lecture on public.journal;
create policy journal_lecture on public.journal for select to authenticated
  using (
    marche_id = any ((select private.marches_autorises('journal', 'lire'))::uuid[])
    or ((select private.est_admin()) and not (select private.verrou_admin('journal', 'lire')))
  );

-- -----------------------------------------------------------------------------
-- 3. Actions sensibles : contrôle explicite (message clair), en plus de peut()
-- -----------------------------------------------------------------------------
create function private.verifier_verrous_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  case tg_table_name
    when 'fuites' then
      if new.supprime_le is not null and old.supprime_le is null then
        perform private.controler_verrou_admin('fuites', 'supprimer');
      end if;

    -- Arrêt et réouverture ne passent que par arreter_attachement / rouvrir_attachement.
    when 'attachements' then
      if private.appel_systeme() and old.statut = 'brouillon' and new.statut = 'arrete' then
        perform private.controler_verrou_admin('attachements', 'valider');
      elsif private.appel_systeme() and old.statut = 'arrete' and new.statut = 'brouillon' then
        perform private.controler_verrou_admin('attachements', 'rouvrir');
      end if;

    -- Refacturation forcée : création ou changement d'une ligne « forcage »
    -- (pas les recopies faites par l'arrêt ou la réouverture du lot).
    when 'attachement_lignes' then
      if new.nature = 'forcage' then
        if tg_op = 'INSERT' then
          perform private.controler_verrou_admin('attachements', 'forcer');
        elsif old.nature is distinct from 'forcage'
              or (new.quantite, new.prix_id, new.fuite_id) is distinct from (old.quantite, old.prix_id, old.fuite_id) then
          perform private.controler_verrou_admin('attachements', 'forcer');
        end if;
      end if;

    when 'marches' then
      if old.actif and not new.actif then
        perform private.controler_verrou_admin('marches', 'desactiver');
      end if;
      -- Fiche du marché : droit « paramètres / modifier » (l'administrateur passe par sa règle propre).
      if not private.appel_systeme()
         and (to_jsonb(new) - 'actif' - 'modifie_le') is distinct from (to_jsonb(old) - 'actif' - 'modifie_le') then
        perform private.controler_verrou_admin('parametres', 'modifier');
      end if;

    -- Révocation d'un compte : par un administrateur connecté (verrou contrôlé), jamais soi-même ;
    -- la fonction serveur (service_role, sans utilisateur) ne révoque plus : elle bloque la connexion
    -- d'un profil déjà révoqué. Console SQL et migrations (postgres) : inchangé.
    when 'profils' then
      if old.actif and not new.actif then
        if auth.uid() = old.id then
          raise exception 'Vous ne pouvez pas révoquer votre propre accès'
            using errcode = 'insufficient_privilege';
        end if;
        if auth.uid() is null and current_user = 'service_role' then
          raise exception 'La révocation se fait par l''administrateur connecté (panneau, page Utilisateurs)'
            using errcode = 'insufficient_privilege';
        end if;
        perform private.controler_verrou_admin('comptes', 'revoquer');
      end if;

    else
      null;
  end case;
  return new;
end
$$;

create trigger a0_verrous_admin before update on public.fuites
  for each row execute function private.verifier_verrous_admin();
create trigger a0_verrous_admin before update on public.attachements
  for each row execute function private.verifier_verrous_admin();
create trigger a0_verrous_admin before insert or update on public.attachement_lignes
  for each row execute function private.verifier_verrous_admin();
create trigger a0_verrous_admin before update on public.marches
  for each row execute function private.verifier_verrous_admin();
create trigger a0_verrous_admin before update on public.profils
  for each row execute function private.verifier_verrous_admin();

-- Copie d'un marché (lot C) : verrou « créer un marché par copie ».
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
  return _cible;
end
$$;

-- -----------------------------------------------------------------------------
-- 4. Enregistrement de la matrice (administrateur) : droits et rôles affichés
--    d'un marché, en une seule transaction. Fonction exécutée avec les droits de
--    l'appelant : les règles RLS de « droits » et « affectations » s'appliquent.
--    p_droits : [{profil_id, type_donnee, lire, creer, modifier, supprimer, valider}]
--    p_roles  : [{profil_id, roles: [...]}] (modèle appliqué depuis la matrice)
--    Retourne le nombre de lignes réellement changées.
-- -----------------------------------------------------------------------------
create function public.enregistrer_droits(p_marche uuid, p_droits jsonb, p_roles jsonb default '[]'::jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  _droits jsonb := coalesce(p_droits, '[]'::jsonb);
  _roles jsonb := coalesce(p_roles, '[]'::jsonb);
  _profils uuid[];
  _n integer;
  _r integer;
begin
  if not private.est_admin() then
    raise exception 'Réservé à l''administrateur' using errcode = 'insufficient_privilege';
  end if;
  if p_marche is null or jsonb_typeof(_droits) <> 'array' or jsonb_typeof(_roles) <> 'array' then
    raise exception 'Marché et listes de droits et de rôles attendus' using errcode = 'invalid_parameter_value';
  end if;

  if exists (select 1 from jsonb_to_recordset(_droits) as x(profil_id uuid, type_donnee public.type_donnee)
              where x.profil_id is null or x.type_donnee is null)
     or exists (select 1 from jsonb_to_recordset(_roles) as x(profil_id uuid) where x.profil_id is null) then
    raise exception 'Ligne incomplète : utilisateur ou type de donnée manquant' using errcode = 'invalid_parameter_value';
  end if;
  if (select count(*) <> count(distinct (x.profil_id, x.type_donnee))
        from jsonb_to_recordset(_droits) as x(profil_id uuid, type_donnee public.type_donnee))
     or (select count(*) <> count(distinct x.profil_id) from jsonb_to_recordset(_roles) as x(profil_id uuid)) then
    raise exception 'Ligne en double dans la matrice' using errcode = 'unique_violation';
  end if;

  select coalesce(array_agg(distinct s.profil_id), '{}') into _profils
    from (select x.profil_id from jsonb_to_recordset(_droits) as x(profil_id uuid)
          union all
          select x.profil_id from jsonb_to_recordset(_roles) as x(profil_id uuid)) s;
  if exists (select 1 from public.profils p where p.id = any (_profils) and p.est_admin) then
    raise exception 'Un administrateur a tous les droits : seuls ses verrous de sécurité se règlent'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(_profils) s (profil_id)
              where not exists (select 1 from public.affectations a
                                 where a.profil_id = s.profil_id and a.marche_id = p_marche)) then
    raise exception 'Utilisateur non affecté à ce marché' using errcode = 'foreign_key_violation';
  end if;

  insert into public.droits as d (profil_id, marche_id, type_donnee, lire, creer, modifier, supprimer, valider)
  select x.profil_id, p_marche, x.type_donnee, coalesce(x.lire, false), coalesce(x.creer, false),
         coalesce(x.modifier, 'non'), coalesce(x.supprimer, 'non'), coalesce(x.valider, false)
    from jsonb_to_recordset(_droits) as x(
      profil_id uuid, type_donnee public.type_donnee, lire boolean, creer boolean,
      modifier public.portee_droit, supprimer public.portee_droit, valider boolean)
  on conflict (profil_id, marche_id, type_donnee) do update
    set lire = excluded.lire, creer = excluded.creer, modifier = excluded.modifier,
        supprimer = excluded.supprimer, valider = excluded.valider
    where (d.lire, d.creer, d.modifier, d.supprimer, d.valider)
          is distinct from (excluded.lire, excluded.creer, excluded.modifier, excluded.supprimer, excluded.valider);
  get diagnostics _n = row_count;

  with saisis as (
    select x.profil_id,
           (select coalesce(array_agg(distinct r order by r), '{}') from unnest(coalesce(x.roles, '{}')) r) as roles
      from jsonb_to_recordset(_roles) as x(profil_id uuid, roles text[])
  )
  update public.affectations a
     set roles = s.roles
    from saisis s
   where a.profil_id = s.profil_id and a.marche_id = p_marche and a.roles is distinct from s.roles;
  get diagnostics _r = row_count;

  return _n + _r;
end
$$;

comment on function public.enregistrer_droits(uuid, jsonb, jsonb) is
  'Administrateur : enregistre la matrice des droits d''un marché (et le rôle affiché) en une transaction.';

-- -----------------------------------------------------------------------------
-- 5. Déclencheurs, règles RLS et privilèges
-- -----------------------------------------------------------------------------
create trigger journaliser after insert or update or delete on public.verrous_admin
  for each row execute function private.journaliser();

-- Chacun ne voit que ses verrous (l'administrateur voit aussi ceux des autres administrateurs) ;
-- seul un administrateur en pose, et seulement sur lui-même ; on ne retire que les siens.
create policy verrous_admin_lecture on public.verrous_admin for select to authenticated
  using (profil_id = (select auth.uid()) or (select private.est_admin()));
create policy verrous_admin_pose on public.verrous_admin for insert to authenticated
  with check (profil_id = (select auth.uid()) and (select private.est_admin()));
create policy verrous_admin_retrait on public.verrous_admin for delete to authenticated
  using (profil_id = (select auth.uid()));
grant select, insert, delete on public.verrous_admin to authenticated;

revoke execute on function
  private.verrou_admin(text, text),
  private.libelle_verrou(text, text),
  private.controler_verrou_admin(text, text),
  private.verifier_verrous_admin(),
  public.enregistrer_droits(uuid, jsonb, jsonb),
  public.copier_marche(uuid, text, text, text, text, text),
  private.marches_autorises(public.type_donnee, text),
  private.peut(uuid, public.type_donnee, text, uuid, uuid)
  from public, anon;
grant execute on function
  private.verrou_admin(text, text),
  private.libelle_verrou(text, text),
  private.controler_verrou_admin(text, text),
  public.enregistrer_droits(uuid, jsonb, jsonb),
  public.copier_marche(uuid, text, text, text, text, text),
  private.marches_autorises(public.type_donnee, text),
  private.peut(uuid, public.type_donnee, text, uuid, uuid)
  to authenticated, service_role;
grant execute on function private.verifier_verrous_admin() to service_role;
