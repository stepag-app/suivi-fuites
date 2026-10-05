-- =============================================================================
-- Lot P1 : nomenclature Dolibarr et rapprochement avec le catalogue des pièces.
--
-- Décisions d'Issam (2026-10-05) :
--  * la liste des pièces posables devient la nomenclature de l'ERP Dolibarr de
--    l'entreprise (une seule base Dolibarr : pas de marche_id) ; aucun prix ;
--  * rapprochement par l'identifiant produit Dolibarr (rowid), la référence
--    (préfixe de famille et numéro) n'est montrée que dans l'écran d'administration ;
--  * le réparateur ne voit que la désignation : une pièce rapprochée prend la
--    désignation (libellé) de Dolibarr ;
--  * une pièce sans correspondance reste en base (historique des réparations
--    déjà saisies) ; elle peut être désactivée ou gardée hors nomenclature.
--
-- Écritures :
--  * produits_dolibarr : seulement par importer_produits_dolibarr (administrateur),
--    jamais directement par l'API ; chaque import est tracé dans imports_dolibarr ;
--  * lien pièce ↔ produit (produit_dolibarr_id, hors_nomenclature) : administrateur
--    seulement (déclencheur), un produit au plus une fois par marché ; tout
--    changement du catalogue reste tracé dans journal (déclencheur journaliser).
--
-- copier_marche est redéfinie (même signature, même contenu) pour reprendre les
-- liens avec Dolibarr dans le catalogue copié.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Produits Dolibarr (miroir sans prix de la nomenclature de l'ERP)
-- -----------------------------------------------------------------------------
create table public.produits_dolibarr (
  dolibarr_id integer primary key check (dolibarr_id > 0),       -- rowid du produit dans Dolibarr
  ref text not null check (length(btrim(ref)) between 1 and 64),
  designation text not null check (length(btrim(designation)) between 1 and 255),
  unite text check (length(unite) <= 20),
  famille text not null check (famille ~ '^[A-Z0-9]{1,10}$'),     -- préfixe de la référence (RAC, CND…)
  actif boolean not null default true,     -- faux : ni en vente ni en achat, ou absent du dernier import
  importe_le timestamptz not null default now(),   -- dernier import où le produit figurait
  modifie_le timestamptz not null default now()    -- dernière modification de ses données
);
alter table public.produits_dolibarr enable row level security;
create index produits_dolibarr_famille_idx on public.produits_dolibarr (famille, actif);
create index produits_dolibarr_ref_idx on public.produits_dolibarr (ref);

comment on table public.produits_dolibarr is
  'Nomenclature Dolibarr (toute l''entreprise) : identifiant, référence, libellé, unité, famille. Jamais de prix.';

-- Journal des imports (qui, quand, quelles familles, ce qui a changé)
create table public.imports_dolibarr (
  id bigint generated always as identity primary key,
  importe_le timestamptz not null default now(),
  importe_par uuid,                        -- compte de l'administrateur (comme journal.utilisateur_id)
  familles text[] not null default '{}',
  produits_lus integer not null check (produits_lus >= 0),
  nouveaux integer not null default 0,
  modifies integer not null default 0,
  designations_modifiees integer not null default 0,
  desactives integer not null default 0,
  pieces_renommees integer not null default 0,
  conflits_designation integer not null default 0
);
alter table public.imports_dolibarr enable row level security;

-- Lecture : administrateur, et tout utilisateur ayant « paramètres / lire » sur au moins un marché.
create policy produits_dolibarr_lecture on public.produits_dolibarr for select to authenticated
  using (
    (select private.est_admin())
    or cardinality((select private.marches_autorises('parametres', 'lire'))) > 0
  );
create policy imports_dolibarr_lecture on public.imports_dolibarr for select to authenticated
  using (
    (select private.est_admin())
    or cardinality((select private.marches_autorises('parametres', 'lire'))) > 0
  );
revoke all on public.produits_dolibarr, public.imports_dolibarr from anon, authenticated;
grant select on public.produits_dolibarr, public.imports_dolibarr to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Lien du catalogue des pièces avec la nomenclature
-- -----------------------------------------------------------------------------
alter table public.catalogue_pieces
  add column produit_dolibarr_id integer references public.produits_dolibarr (dolibarr_id),
  add column hors_nomenclature boolean not null default false,     -- « aucune correspondance », pièce gardée
  add column designation_initiale text,                            -- désignation avant le premier rapprochement
  add constraint catalogue_pieces_produit_unique unique (marche_id, produit_dolibarr_id),
  add constraint catalogue_pieces_lien_ou_hors check (not (hors_nomenclature and produit_dolibarr_id is not null));
create index catalogue_pieces_produit_idx on public.catalogue_pieces (produit_dolibarr_id)
  where produit_dolibarr_id is not null;

comment on column public.catalogue_pieces.produit_dolibarr_id is
  'Produit Dolibarr (rowid) : la pièce prend alors sa désignation ; un produit au plus une fois par marché.';

-- Libellé d'un produit, lisible par le déclencheur quel que soit le compte (aucun prix, aucune autre donnée).
create function private.designation_produit_dolibarr(p_id integer)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.designation from public.produits_dolibarr d where d.dolibarr_id = p_id
$$;

-- Garde du lien (fonction appelée avec les droits de l'utilisateur : appel_systeme reconnaît
-- les fonctions SECURITY DEFINER de l'application, l'import et la copie d'un marché).
create function private.nomenclature_catalogue()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _lien_change boolean;
  _designation text;
begin
  if tg_op = 'INSERT' then
    _lien_change := new.produit_dolibarr_id is not null;
    if (new.produit_dolibarr_id is not null or new.hors_nomenclature or new.designation_initiale is not null)
       and not (private.appel_systeme() or private.est_admin()) then
      raise exception 'Le rapprochement avec la nomenclature Dolibarr est réservé à l''administrateur'
        using errcode = 'insufficient_privilege';
    end if;
  else
    _lien_change := new.produit_dolibarr_id is distinct from old.produit_dolibarr_id;
    if (_lien_change or new.hors_nomenclature is distinct from old.hors_nomenclature
        or new.designation_initiale is distinct from old.designation_initiale)
       and not (private.appel_systeme() or private.est_admin()) then
      raise exception 'Le rapprochement avec la nomenclature Dolibarr est réservé à l''administrateur'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.produit_dolibarr_id is null then
    -- Lien retiré : la pièce reprend sa désignation d'origine, sauf si on lui en donne une autre.
    if tg_op = 'UPDATE' then
      if old.produit_dolibarr_id is not null and new.designation_initiale is not null
         and new.designation is not distinct from old.designation then
        new.designation := new.designation_initiale;
      end if;
    end if;
    return new;
  end if;

  _designation := private.designation_produit_dolibarr(new.produit_dolibarr_id);
  if _designation is null then
    raise exception 'Produit Dolibarr inconnu : %', new.produit_dolibarr_id using errcode = 'foreign_key_violation';
  end if;
  new.hors_nomenclature := false;
  if _lien_change then
    -- Message clair avant la collision de désignation (même produit = même libellé)
    if exists (select 1 from public.catalogue_pieces c
                where c.marche_id = new.marche_id and c.produit_dolibarr_id = new.produit_dolibarr_id
                  and c.id <> new.id) then
      raise exception 'Ce produit Dolibarr est déjà rapproché d''une autre pièce du marché'
        using errcode = 'unique_violation', constraint = 'catalogue_pieces_produit_unique';
    end if;
    if tg_op = 'UPDATE' then
      if old.produit_dolibarr_id is null and new.designation_initiale is null then
        new.designation_initiale := old.designation;
      end if;
    end if;
    new.designation := _designation;
  elsif tg_op = 'UPDATE' then
    if new.designation is distinct from old.designation and new.designation is distinct from _designation then
      raise exception 'La désignation d''une pièce rapprochée vient de Dolibarr : retirez le lien pour la modifier'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;

create trigger nomenclature_dolibarr before insert or update on public.catalogue_pieces
  for each row execute function private.nomenclature_catalogue();

-- -----------------------------------------------------------------------------
-- 3. Import de produits.csv (lu dans le navigateur ; seules les colonnes utiles arrivent ici)
-- -----------------------------------------------------------------------------

-- Lecture du tableau JSON : seules ces clés sont lues, toute autre (prix, stock…) est ignorée.
create function private.lire_produits_dolibarr(p_produits jsonb)
returns table (dolibarr_id integer, ref text, designation text, unite text, famille text, actif boolean)
language sql
immutable
set search_path = ''
as $$
  select distinct on (x.dolibarr_id)
         x.dolibarr_id,
         btrim(x.ref),
         regexp_replace(btrim(x.designation), '\s+', ' ', 'g'),
         nullif(btrim(x.unite), ''),
         upper(btrim(x.famille)),
         coalesce(x.actif, true)
    from jsonb_to_recordset(p_produits)
         as x (dolibarr_id integer, ref text, designation text, unite text, famille text, actif boolean)
   order by x.dolibarr_id
$$;

create function public.importer_produits_dolibarr(p_produits jsonb, p_familles text[] default '{}')
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
  _renommees integer := 0;
  _conflits integer := 0;
  _piece record;
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

  -- Produits absents du fichier (disparus de Dolibarr ou familles non retenues) : inactifs, jamais supprimés.
  with d as (
    update public.produits_dolibarr p set actif = false, modifie_le = now()
     where p.actif and not (p.dolibarr_id = any (_ids))
    returning 1
  )
  select count(*) into _desactives from d;

  -- Pièces rapprochées dont le libellé a changé dans Dolibarr (tous les marchés)
  for _piece in
    select c.id, d.designation
      from public.catalogue_pieces c
      join public.produits_dolibarr d on d.dolibarr_id = c.produit_dolibarr_id
     where c.designation is distinct from d.designation
  loop
    begin
      update public.catalogue_pieces set designation = _piece.designation where id = _piece.id;
      _renommees := _renommees + 1;
    exception when unique_violation then
      -- Une autre pièce du marché porte déjà ce libellé : la pièce garde l'ancien (compté, affiché à l'écran).
      _conflits := _conflits + 1;
    end;
  end loop;

  insert into public.imports_dolibarr (importe_par, familles, produits_lus, nouveaux, modifies,
                                       designations_modifiees, desactives, pieces_renommees, conflits_designation)
  values (auth.uid(), coalesce(p_familles, '{}'), _lus, _nouveaux, _modifies, _designations, _desactives,
          _renommees, _conflits);

  return jsonb_build_object(
    'produits_lus', _lus, 'nouveaux', _nouveaux, 'modifies', _modifies,
    'designations_modifiees', _designations, 'desactives', _desactives,
    'pieces_renommees', _renommees, 'conflits_designation', _conflits
  );
end
$$;

comment on function public.importer_produits_dolibarr(jsonb, text[]) is
  'Administrateur : importe la nomenclature Dolibarr (nouveaux, modifiés, absents rendus inactifs) ; idempotent ; aucun prix.';

-- -----------------------------------------------------------------------------
-- 4. Rapprochement en lot (validation des propositions) : une erreur par pièce, sans tout annuler
-- -----------------------------------------------------------------------------
create function public.rapprocher_pieces(p_marche uuid, p_liens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _l record;
  _faits integer := 0;
  _erreurs jsonb := '[]'::jsonb;
  _contrainte text;
begin
  if not private.est_admin() then
    raise exception 'Le rapprochement avec la nomenclature Dolibarr est réservé à l''administrateur'
      using errcode = 'insufficient_privilege';
  end if;
  if p_liens is null or jsonb_typeof(p_liens) <> 'array' then
    raise exception 'Liste de rapprochements attendue' using errcode = 'invalid_parameter_value';
  end if;

  for _l in
    select x.piece_id, x.produit_dolibarr_id
      from jsonb_to_recordset(p_liens) as x (piece_id uuid, produit_dolibarr_id integer)
  loop
    begin
      update public.catalogue_pieces
         set produit_dolibarr_id = _l.produit_dolibarr_id
       where id = _l.piece_id and marche_id = p_marche;
      if not found then
        raise exception 'Pièce introuvable dans ce marché' using errcode = 'no_data_found';
      end if;
      _faits := _faits + 1;
    exception when others then
      get stacked diagnostics _contrainte = constraint_name;
      _erreurs := _erreurs || jsonb_build_object(
        'piece_id', _l.piece_id, 'code', sqlstate, 'contrainte', nullif(_contrainte, ''), 'message', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('rapprochees', _faits, 'erreurs', _erreurs);
end
$$;

comment on function public.rapprocher_pieces(uuid, jsonb) is
  'Administrateur : lie (ou délie, produit nul) des pièces du catalogue d''un marché à des produits Dolibarr.';

-- -----------------------------------------------------------------------------
-- 5. Copie d'un marché : les liens avec Dolibarr suivent le catalogue copié
-- -----------------------------------------------------------------------------
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

  -- Identifiants des copies : md5(nouveau marché || ':' || identifiant source) (copier_parametres_marche).
  -- Une pièce dont le libellé n'a pas pu suivre Dolibarr (conflit à l'import) est copiée sans lien.
  update public.catalogue_pieces c
     set produit_dolibarr_id = s.produit_dolibarr_id,
         hors_nomenclature = s.hors_nomenclature,
         designation_initiale = s.designation_initiale
    from public.catalogue_pieces s
    left join public.produits_dolibarr d on d.dolibarr_id = s.produit_dolibarr_id
   where s.marche_id = p_source
     and c.marche_id = _cible
     and c.id = md5(_cible || ':' || s.id)::uuid
     and (s.hors_nomenclature or s.designation = d.designation);
  return _cible;
end
$$;

-- -----------------------------------------------------------------------------
-- 6. Privilèges des fonctions
-- -----------------------------------------------------------------------------
revoke execute on function private.designation_produit_dolibarr(integer) from public, anon;
revoke execute on function private.nomenclature_catalogue() from public, anon, authenticated;
revoke execute on function private.lire_produits_dolibarr(jsonb) from public, anon, authenticated;
revoke execute on function public.importer_produits_dolibarr(jsonb, text[]) from public, anon;
revoke execute on function public.rapprocher_pieces(uuid, jsonb) from public, anon;
revoke execute on function public.copier_marche(uuid, text, text, text, text, text) from public, anon;
grant execute on function private.designation_produit_dolibarr(integer) to authenticated;
grant execute on function public.importer_produits_dolibarr(jsonb, text[]) to authenticated;
grant execute on function public.rapprocher_pieces(uuid, jsonb) to authenticated;
grant execute on function public.copier_marche(uuid, text, text, text, text, text) to authenticated;
