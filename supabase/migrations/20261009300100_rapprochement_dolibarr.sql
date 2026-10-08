-- =============================================================================
-- Chantier v2, X3 (lot P4) : rapprochement posé / transféré avec les mouvements de stock de Dolibarr.
--
-- Décisions d'Issam (2026-10-05, 2026-10-06, 2026-10-08) :
--  * Dolibarr connaît ce qui est TRANSFÉRÉ au chantier (bons de transfert vers l'entrepôt du
--    chantier, 76 pour le marché 4500004453), pas ce qui est posé ; l'écart est indicatif,
--    jamais bloquant ;
--  * aucun prix, PMP ni valorisation : seulement des quantités ;
--  * import du CSV des mouvements (format de mouvements_chantier.csv) lu dans le navigateur ;
--    l'envoi automatique depuis le serveur Dolibarr (X8) viendra plus tard et réutilisera
--    importer_mouvements_dolibarr (appelable en service_role).
--
-- Règles de calcul (reprises de la copie de travail P4, contrat du lot T § 7), par article :
--  * transféré : somme signée des mouvements de l'entrepôt du marché, hors consommations :
--    entrées moins retours au dépôt ; une annulation (« … CANCEL ») écrit le mouvement inverse,
--    la paire s'annule par la somme ;
--  * consommé : sortie définitive sans entrepôt de contrepartie (« Consommation pour le projet … »,
--    type 1, hors annulation) ; aucune à ce jour ;
--  * posé : inventaire réel (v_pieces_reelles : corrections du bureau comprises, pièces remplacées
--    ou retirées exclues) par jour de réparation, jointure directe sur produit_id ;
--  * écart = transféré − consommé − posé ; sur la période et en cumul depuis le premier mouvement ;
--    « au-delà du seuil » quand |écart cumulé| dépasse marches.seuil_ecart_fournitures_pct % du
--    transféré cumulé (tout écart si rien n'a été transféré).
-- Lecture : droit « quantités / lire » (responsable, administrateur). Aucun objet des sessions S1
-- et S2 n'est modifié ; deux colonnes ajoutées à marches (réglages du rapprochement).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Mouvements de stock (base Dolibarr unique pour l'entreprise : pas de marche_id ;
--    isolation entre marchés par l'entrepôt du marché)
-- -----------------------------------------------------------------------------
create table public.mouvements_dolibarr (
  dolibarr_id bigint primary key check (dolibarr_id > 0),
  date_mouvement timestamptz not null,
  produit_dolibarr_id integer not null check (produit_dolibarr_id > 0),
  produit_ref text check (length(produit_ref) <= 64),
  produit_designation text check (length(produit_designation) <= 255),
  entrepot_id integer not null check (entrepot_id > 0),
  entrepot_libelle text check (length(entrepot_libelle) <= 255),
  entrepot_contrepartie_id integer check (entrepot_contrepartie_id > 0),
  entrepot_contrepartie text check (length(entrepot_contrepartie) <= 255),
  quantite numeric(14,4) not null,
  type_mouvement smallint not null check (type_mouvement between 0 and 3),
  libelle text check (length(libelle) <= 255),
  code_inventaire text check (length(code_inventaire) <= 128),
  annulation boolean not null default false,
  projet_id integer check (projet_id > 0),
  bon_id integer check (bon_id > 0),
  unite text check (length(unite) <= 20),
  importe_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
alter table public.mouvements_dolibarr enable row level security;
create index mouvements_dolibarr_entrepot_idx
  on public.mouvements_dolibarr (entrepot_id, produit_dolibarr_id, date_mouvement);

comment on table public.mouvements_dolibarr is
  'Mouvements de stock de Dolibarr (quantités signées, entrepôt, type, annulation). Jamais de prix ni de valorisation.';
comment on column public.mouvements_dolibarr.produit_dolibarr_id is
  'rowid du produit Dolibarr ; sans clé étrangère : l''entrepôt reçoit aussi carburant, outillage, gilets… absents des articles importés.';
comment on column public.mouvements_dolibarr.quantite is
  'Quantité signée telle que Dolibarr l''enregistre : positive à l''entrée dans l''entrepôt, négative à la sortie.';
comment on column public.mouvements_dolibarr.annulation is
  'Vrai pour la ligne inverse écrite à l''annulation d''un bon (« … CANCEL ») ; la paire s''annule par la somme signée.';

create table public.imports_mouvements_dolibarr (
  id bigint generated always as identity primary key,
  importe_le timestamptz not null default now(),
  importe_par uuid,
  lignes_lues integer not null check (lignes_lues >= 0),
  nouveaux integer not null default 0,
  modifies integer not null default 0,
  inchanges integer not null default 0,
  annulations integer not null default 0,
  date_min timestamptz,
  date_max timestamptz,
  entrepots integer[] not null default '{}'
);
alter table public.imports_mouvements_dolibarr enable row level security;

-- -----------------------------------------------------------------------------
-- 2. Réglages du marché : entrepôt du chantier (administrateur) et seuil d'alerte des écarts
--    (« paramètres / modifier », RLS existante de marches)
-- -----------------------------------------------------------------------------
alter table public.marches
  add column entrepot_dolibarr_id integer
    constraint marches_entrepot_dolibarr_id check (entrepot_dolibarr_id > 0),
  add column seuil_ecart_fournitures_pct numeric(5,2) not null default 10
    constraint marches_seuil_ecart_fournitures_pct check (seuil_ecart_fournitures_pct between 0 and 999);

comment on column public.marches.entrepot_dolibarr_id is
  'Entrepôt du chantier dans Dolibarr (rowid) : ses mouvements sont rapprochés des pièces posées. Nul : pas de rapprochement. Administrateur seulement ; jamais copié avec le marché.';
comment on column public.marches.seuil_ecart_fournitures_pct is
  'Écart cumulé (transféré − consommé − posé) en % du transféré cumulé au-delà duquel un article est signalé (10 % par défaut). Indicatif, jamais bloquant.';

-- L'entrepôt ouvre la lecture des mouvements : seul l'administrateur le change.
create function private.proteger_entrepot_dolibarr()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.entrepot_dolibarr_id is distinct from old.entrepot_dolibarr_id
     and not (private.appel_systeme() or private.est_admin()) then
    raise exception 'L''entrepôt Dolibarr du chantier est réservé à l''administrateur'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger proteger_entrepot_dolibarr before update of entrepot_dolibarr_id on public.marches
  for each row execute function private.proteger_entrepot_dolibarr();

-- Marché 4500004453 : entrepôt 76 « DP-TRAVAUX DE DÉTECTION… » (export Dolibarr du 2026-10-05).
update public.marches set entrepot_dolibarr_id = 76 where numero = '4500004453' and entrepot_dolibarr_id is null;

-- -----------------------------------------------------------------------------
-- 3. Lecture : administrateur ; sinon les mouvements de l'entrepôt d'un marché sur lequel le
--    compte a « quantités / lire »
-- -----------------------------------------------------------------------------
create policy mouvements_dolibarr_lecture on public.mouvements_dolibarr for select to authenticated
  using (
    (select private.est_admin())
    or entrepot_id in (
      select m.entrepot_dolibarr_id
        from public.marches m
       where m.entrepot_dolibarr_id is not null
         and m.id = any ((select private.marches_autorises('quantites', 'lire'))::uuid[])
    )
  );
create policy imports_mouvements_dolibarr_lecture on public.imports_mouvements_dolibarr for select to authenticated
  using (
    (select private.est_admin())
    or cardinality((select private.marches_autorises('quantites', 'lire'))) > 0
  );
revoke all on public.mouvements_dolibarr, public.imports_mouvements_dolibarr from anon, authenticated;
grant select on public.mouvements_dolibarr, public.imports_mouvements_dolibarr to authenticated;
grant all on public.mouvements_dolibarr, public.imports_mouvements_dolibarr to service_role;

-- -----------------------------------------------------------------------------
-- 4. Import (fichier lu dans le navigateur, ou envoi du serveur Dolibarr plus tard)
-- -----------------------------------------------------------------------------

-- Seules ces clés sont lues : toute autre (prix, valeur, PMP…) est ignorée. Date telle que Dolibarr
-- l'écrit (« AAAA-MM-JJ HH:MM:SS », heure du Maroc) ou ISO avec décalage.
create function private.lire_mouvements_dolibarr(p_mouvements jsonb)
returns table (
  dolibarr_id bigint, date_mouvement timestamptz, produit_dolibarr_id integer, produit_ref text,
  produit_designation text, entrepot_id integer, entrepot_libelle text, entrepot_contrepartie_id integer,
  entrepot_contrepartie text, quantite numeric, type_mouvement smallint, libelle text, code_inventaire text,
  annulation boolean, projet_id integer, bon_id integer, unite text
)
language sql
stable
set search_path = ''
as $$
  select distinct on (x.dolibarr_id)
         x.dolibarr_id,
         case
           when x.date_mouvement ~ '\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}(:?\d{2})?)$' then x.date_mouvement::timestamptz
           else (x.date_mouvement::timestamp) at time zone 'Africa/Casablanca'
         end,
         x.produit_dolibarr_id,
         nullif(btrim(x.produit_ref), ''),
         nullif(regexp_replace(btrim(x.produit_designation), '\s+', ' ', 'g'), ''),
         x.entrepot_id,
         nullif(btrim(x.entrepot_libelle), ''),
         x.entrepot_contrepartie_id,
         nullif(btrim(x.entrepot_contrepartie), ''),
         x.quantite,
         x.type_mouvement,
         nullif(btrim(x.libelle), ''),
         nullif(btrim(x.code_inventaire), ''),
         coalesce(x.annulation, coalesce(x.libelle, '') ~ ' CANCEL\s*$'),
         x.projet_id,
         x.bon_id,
         nullif(btrim(x.unite), '')
    from jsonb_to_recordset(p_mouvements)
         as x (dolibarr_id bigint, date_mouvement text, produit_dolibarr_id integer, produit_ref text,
               produit_designation text, entrepot_id integer, entrepot_libelle text,
               entrepot_contrepartie_id integer, entrepot_contrepartie text, quantite numeric,
               type_mouvement smallint, libelle text, code_inventaire text, annulation boolean,
               projet_id integer, bon_id integer, unite text)
   order by x.dolibarr_id
$$;

create function public.importer_mouvements_dolibarr(p_mouvements jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _ids bigint[];
  _lus integer;
  _invalides integer;
  _nouveaux integer;
  _modifies integer;
  _annulations integer;
  _date_min timestamptz;
  _date_max timestamptz;
  _entrepots integer[];
begin
  if not (private.est_admin() or private.contexte_serveur()) then
    raise exception 'L''import des mouvements Dolibarr est réservé à l''administrateur'
      using errcode = 'insufficient_privilege';
  end if;
  if p_mouvements is null or jsonb_typeof(p_mouvements) <> 'array' or jsonb_array_length(p_mouvements) = 0 then
    raise exception 'Aucun mouvement à importer' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_mouvements) > 50000 then
    raise exception 'Trop de mouvements dans un seul import (50 000 au plus)' using errcode = 'program_limit_exceeded';
  end if;

  select count(*),
         count(*) filter (where l.dolibarr_id is null or l.dolibarr_id <= 0
                             or l.date_mouvement is null
                             or l.produit_dolibarr_id is null or l.produit_dolibarr_id <= 0
                             or l.entrepot_id is null or l.entrepot_id <= 0
                             or l.quantite is null
                             or l.type_mouvement is null or l.type_mouvement not between 0 and 3
                             or length(coalesce(l.produit_ref, '')) > 64
                             or length(coalesce(l.produit_designation, '')) > 255
                             or length(coalesce(l.entrepot_libelle, '')) > 255
                             or length(coalesce(l.entrepot_contrepartie, '')) > 255
                             or length(coalesce(l.libelle, '')) > 255
                             or length(coalesce(l.code_inventaire, '')) > 128
                             or length(coalesce(l.unite, '')) > 20),
         count(*) filter (where l.annulation),
         min(l.date_mouvement), max(l.date_mouvement),
         array_agg(l.dolibarr_id),
         array_agg(distinct l.entrepot_id order by l.entrepot_id)
    into _lus, _invalides, _annulations, _date_min, _date_max, _ids, _entrepots
    from private.lire_mouvements_dolibarr(p_mouvements) l;
  if _invalides > 0 then
    raise exception '% mouvement(s) sans identifiant, date, produit, entrepôt, quantité ou type valides', _invalides
      using errcode = 'invalid_parameter_value';
  end if;

  with lus as (
    select * from private.lire_mouvements_dolibarr(p_mouvements)
  ),
  ins as (
    insert into public.mouvements_dolibarr (dolibarr_id, date_mouvement, produit_dolibarr_id, produit_ref, produit_designation,
                                            entrepot_id, entrepot_libelle, entrepot_contrepartie_id, entrepot_contrepartie,
                                            quantite, type_mouvement, libelle, code_inventaire, annulation, projet_id, bon_id, unite)
    select l.dolibarr_id, l.date_mouvement, l.produit_dolibarr_id, l.produit_ref, l.produit_designation,
           l.entrepot_id, l.entrepot_libelle, l.entrepot_contrepartie_id, l.entrepot_contrepartie,
           l.quantite, l.type_mouvement, l.libelle, l.code_inventaire, l.annulation, l.projet_id, l.bon_id, l.unite
      from lus l
    on conflict on constraint mouvements_dolibarr_pkey do nothing
    returning 1
  ),
  maj as (
    update public.mouvements_dolibarr m
       set date_mouvement = l.date_mouvement, produit_dolibarr_id = l.produit_dolibarr_id, produit_ref = l.produit_ref,
           produit_designation = l.produit_designation, entrepot_id = l.entrepot_id, entrepot_libelle = l.entrepot_libelle,
           entrepot_contrepartie_id = l.entrepot_contrepartie_id, entrepot_contrepartie = l.entrepot_contrepartie,
           quantite = l.quantite, type_mouvement = l.type_mouvement, libelle = l.libelle, code_inventaire = l.code_inventaire,
           annulation = l.annulation, projet_id = l.projet_id, bon_id = l.bon_id, unite = l.unite, modifie_le = now()
      from lus l
     where m.dolibarr_id = l.dolibarr_id
       and (m.date_mouvement, m.produit_dolibarr_id, m.produit_ref, m.produit_designation, m.entrepot_id, m.entrepot_libelle,
            m.entrepot_contrepartie_id, m.entrepot_contrepartie, m.quantite, m.type_mouvement, m.libelle, m.code_inventaire,
            m.annulation, m.projet_id, m.bon_id, m.unite)
           is distinct from
           (l.date_mouvement, l.produit_dolibarr_id, l.produit_ref, l.produit_designation, l.entrepot_id, l.entrepot_libelle,
            l.entrepot_contrepartie_id, l.entrepot_contrepartie, l.quantite, l.type_mouvement, l.libelle, l.code_inventaire,
            l.annulation, l.projet_id, l.bon_id, l.unite)
    returning 1
  )
  select (select count(*) from ins), (select count(*) from maj) into _nouveaux, _modifies;

  update public.mouvements_dolibarr m set importe_le = now() where m.dolibarr_id = any (_ids);

  insert into public.imports_mouvements_dolibarr (importe_par, lignes_lues, nouveaux, modifies, inchanges, annulations,
                                                  date_min, date_max, entrepots)
  values (auth.uid(), _lus, _nouveaux, _modifies, _lus - _nouveaux - _modifies, _annulations, _date_min, _date_max, _entrepots);

  return jsonb_build_object(
    'lignes_lues', _lus, 'nouveaux', _nouveaux, 'modifies', _modifies, 'inchanges', _lus - _nouveaux - _modifies,
    'annulations', _annulations, 'date_min', _date_min, 'date_max', _date_max, 'entrepots', to_jsonb(_entrepots)
  );
end
$$;

comment on function public.importer_mouvements_dolibarr(jsonb) is
  'Administrateur (ou serveur) : importe les mouvements de stock Dolibarr (nouveaux, modifiés) ; idempotent par rowid ; aucun prix.';

-- -----------------------------------------------------------------------------
-- 5. Rapprochement période × article. Jours à l'heure du Maroc, bornes comprises ; p_du nul =
--    depuis le début, p_au nul = jusqu'à aujourd'hui. Cumuls : depuis le premier mouvement ou
--    la première pose jusqu'à p_au. Droits de l'appelant (« quantités / lire »).
-- -----------------------------------------------------------------------------
create function public.rapprochement_fournitures(p_marche_id uuid, p_du date default null, p_au date default null)
returns table (
  produit_id integer,
  designation text,
  famille text,
  unite text,
  dans_articles boolean,
  transfere numeric,
  consomme numeric,
  pose numeric,
  ecart numeric,
  pieces integer,
  cumul_transfere numeric,
  cumul_consomme numeric,
  cumul_pose numeric,
  cumul_ecart numeric,
  ecart_pct numeric,
  seuil_pct numeric,
  au_dela_seuil boolean,
  dernier_mouvement timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with m as (
    select mk.id, mk.entrepot_dolibarr_id, mk.seuil_ecart_fournitures_pct
      from public.marches mk
     where mk.id = p_marche_id
       and mk.id = any ((select private.marches_autorises('quantites', 'lire'))::uuid[])
  ),
  mouvements as (
    select mo.produit_dolibarr_id as produit_id,
           (mo.date_mouvement at time zone 'Africa/Casablanca')::date as jour,
           mo.quantite,
           (mo.type_mouvement = 1 and not mo.annulation
            and mo.entrepot_contrepartie_id is null and mo.entrepot_contrepartie is null) as consommation,
           mo.date_mouvement
      from m
      join public.mouvements_dolibarr mo on mo.entrepot_id = m.entrepot_dolibarr_id
  ),
  mv as (
    select x.produit_id,
           coalesce(sum(x.quantite) filter (where not x.consommation and (p_du is null or x.jour >= p_du)), 0) as transfere,
           coalesce(sum(-x.quantite) filter (where x.consommation and (p_du is null or x.jour >= p_du)), 0) as consomme,
           coalesce(sum(x.quantite) filter (where not x.consommation), 0) as cumul_transfere,
           coalesce(sum(-x.quantite) filter (where x.consommation), 0) as cumul_consomme,
           max(x.date_mouvement) as dernier_mouvement
      from mouvements x
     where p_au is null or x.jour <= p_au
     group by x.produit_id
  ),
  po as (
    select p.produit_id,
           coalesce(sum(p.quantite) filter (where p_du is null or p.jour >= p_du), 0) as pose,
           (count(*) filter (where p_du is null or p.jour >= p_du))::integer as pieces,
           sum(p.quantite) as cumul_pose
      from m
      join public.v_pieces_reelles p on p.marche_id = m.id
     where p.produit_id is not null
       and (p_au is null or p.jour <= p_au)
     group by p.produit_id
  ),
  base as (
    select coalesce(mv.produit_id, po.produit_id) as produit_id,
           coalesce(mv.transfere, 0) as transfere,
           coalesce(mv.consomme, 0) as consomme,
           coalesce(po.pose, 0) as pose,
           coalesce(po.pieces, 0) as pieces,
           coalesce(mv.cumul_transfere, 0) as cumul_transfere,
           coalesce(mv.cumul_consomme, 0) as cumul_consomme,
           coalesce(po.cumul_pose, 0) as cumul_pose,
           mv.dernier_mouvement
      from mv
      full join po on po.produit_id = mv.produit_id
  )
  select b.produit_id,
         coalesce(pd.designation, snap.produit_designation, 'Produit Dolibarr ' || b.produit_id),
         coalesce(pd.famille, upper(substring(snap.produit_ref from '^[A-Za-z]+'))),
         coalesce(pd.unite, snap.unite, 'u'),
         pd.dolibarr_id is not null,
         b.transfere, b.consomme, b.pose,
         b.transfere - b.consomme - b.pose,
         b.pieces,
         b.cumul_transfere, b.cumul_consomme, b.cumul_pose,
         b.cumul_transfere - b.cumul_consomme - b.cumul_pose,
         case when b.cumul_transfere > 0
              then round((b.cumul_transfere - b.cumul_consomme - b.cumul_pose) * 100 / b.cumul_transfere, 1) end,
         m.seuil_ecart_fournitures_pct,
         case when b.cumul_transfere > 0
              then abs(b.cumul_transfere - b.cumul_consomme - b.cumul_pose) * 100 / b.cumul_transfere > m.seuil_ecart_fournitures_pct
              else b.cumul_transfere - b.cumul_consomme - b.cumul_pose <> 0 end,
         b.dernier_mouvement
    from base b
    cross join m
    left join public.produits_dolibarr pd on pd.dolibarr_id = b.produit_id
    left join lateral (
      select mo.produit_designation, mo.produit_ref, mo.unite
        from public.mouvements_dolibarr mo
       where pd.dolibarr_id is null
         and mo.entrepot_id = m.entrepot_dolibarr_id and mo.produit_dolibarr_id = b.produit_id
       order by mo.date_mouvement desc, mo.dolibarr_id desc
       limit 1
    ) snap on true
   where b.transfere <> 0 or b.consomme <> 0 or b.pose <> 0
      or b.cumul_transfere <> 0 or b.cumul_consomme <> 0 or b.cumul_pose <> 0
   order by 2, 1
$$;

comment on function public.rapprochement_fournitures(uuid, date, date) is
  'Période × article Dolibarr : transféré au chantier, consommé, posé (inventaire réel), écart, cumuls et dépassement du seuil du marché. Aucun prix. Droit « quantités / lire ».';

-- -----------------------------------------------------------------------------
-- 6. Privilèges des fonctions
-- -----------------------------------------------------------------------------
revoke execute on function private.lire_mouvements_dolibarr(jsonb) from public, anon, authenticated;
revoke execute on function private.proteger_entrepot_dolibarr() from public, anon, authenticated;
revoke execute on function public.importer_mouvements_dolibarr(jsonb) from public, anon;
revoke execute on function public.rapprochement_fournitures(uuid, date, date) from public, anon;
grant execute on function public.importer_mouvements_dolibarr(jsonb) to authenticated, service_role;
grant execute on function public.rapprochement_fournitures(uuid, date, date) to authenticated, service_role;
