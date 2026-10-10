-- =============================================================================
-- Chantier v3, S15 : débits de nuit et pénalités de performance (tâches D1 à D6).
-- CPS art. II-17, II-22, II-23 et tableau n° 1 (references/regles-marche-4500004453.md,
-- R-CPS-100 à 115 et 142 à 150). Contrat pour S17 (rapports) et S19 (APK) :
-- docs/lots/chantier-v3-debits.md.
--
--  1. Référentiel (D1) : débits de référence des zones (plus bas historique, débit actuel),
--     achèvement du balayage par zone, points de mesure par zone et secteur ; le Q exigé est
--     déjà dans zones.q_exige_m3h et les dates des phases dans phases.
--  2. Réglages du marché (D3, D5) : mode de saisie par défaut, assiette, points, seuils.
--  3. Campagnes (D2) : avant intervention (Qi), après balayage (Qf), contrôle de maintien,
--     mesure libre ; procès-verbal en pièce jointe.
--  4. Mesures (D3) : une ligne par campagne, point et nuit ; relevés détaillés de 0 h à 6 h ou
--     minimum de la nuit ; validation par le responsable (D6, circuit V1).
--  5. Calculs (D4) : v_debits_nuits, v_debits_campagnes, debits_resultats, penalite_points.
--  6. Droits (D6) : type de donnée « mesures_debit » ; compartiment privé « debits ».
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Référentiel
-- -----------------------------------------------------------------------------
alter table public.zones
  add column q_plus_bas_historique_m3h numeric(8,2) check (q_plus_bas_historique_m3h >= 0),
  add column q_actuel_m3h numeric(8,2) check (q_actuel_m3h >= 0),
  add column balayage_acheve_le date;

comment on column public.zones.q_exige_m3h is
  'Débit nocturne minimum à assurer à l''achèvement du balayage, Q exigé (CPS tableau n° 1, m3/h).';
comment on column public.zones.q_plus_bas_historique_m3h is 'Plus bas débit nocturne historique (CPS tableau n° 1, m3/h).';
comment on column public.zones.q_actuel_m3h is 'Débit nocturne actuel mesuré avant le marché (CPS tableau n° 1, m3/h).';
comment on column public.zones.balayage_acheve_le is 'Date d''achèvement du balayage de la zone (début des contrôles de maintien).';

-- Tableau n° 1 du marché 4500004453 (R-CPS-102).
update public.zones z
   set q_plus_bas_historique_m3h = v.historique, q_actuel_m3h = v.actuel
  from public.marches m,
       (values (1, 133, 158), (2, 136, 162), (3, 133, 148), (4, 99, 140), (5, 79, 104)) v (numero, historique, actuel)
 where m.code = 'SRM-4500004453' and z.marche_id = m.id and z.numero = v.numero
   and z.q_plus_bas_historique_m3h is null and z.q_actuel_m3h is null;

-- Points de mesure : ouvrages de comptage de la SRM (télé-relève, débitmètre de secteur…).
create table public.points_mesure (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  zone_id uuid not null,
  secteur_id uuid,
  code text not null check (btrim(code) <> ''),
  libelle text not null check (btrim(libelle) <> ''),
  equipement text,
  observation text,
  ordre integer not null default 0,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, code),
  unique (id, marche_id),
  foreign key (zone_id, marche_id) references public.zones (id, marche_id),
  foreign key (secteur_id, marche_id) references public.secteurs (id, marche_id)
);
alter table public.points_mesure enable row level security;
create index points_mesure_zone_idx on public.points_mesure (zone_id);

comment on table public.points_mesure is
  'Points de mesure du débit de nuit (R-CPS-103, 104) : le débit d''une zone est la somme de ses points au même instant.';

-- -----------------------------------------------------------------------------
-- 2. Réglages du marché
-- -----------------------------------------------------------------------------
alter table public.marches
  add column debits_mode_saisie text not null default 'minimum'
    check (debits_mode_saisie in ('minimum', 'releves', 'import')),
  add column debits_assiette text not null default 'zone'
    check (debits_assiette in ('zone', 'marche')),
  add column debits_points text not null default 'proportionnels'
    check (debits_points in ('proportionnels', 'entiers')),
  add column debits_plafond_pct numeric(5,2) not null default 25
    check (debits_plafond_pct > 0 and debits_plafond_pct <= 100),
  add column debits_seuil_arret_pct numeric(5,2) not null default 25
    check (debits_seuil_arret_pct >= 0),
  add column debits_seuil_degradation_pct numeric(5,2) not null default 25
    check (debits_seuil_degradation_pct >= 0);

comment on column public.marches.debits_mode_saisie is
  'Saisie proposée par défaut (D3) : minimum de la nuit, relevés de 0 h à 6 h, ou import ; modifiable par campagne.';
comment on column public.marches.debits_assiette is
  'Assiette des pénalités (D5, R-CPS-150) : zone (linéaire de la zone × prix) ou marché entier (τ global).';
comment on column public.marches.debits_points is
  'Points de pénalité (D5) : proportionnels (τ sans arrondi) ou entiers (points complets seulement).';

-- -----------------------------------------------------------------------------
-- 3. Campagnes de mesure
-- -----------------------------------------------------------------------------
create table public.campagnes_debit (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  type text not null check (type in ('avant', 'apres', 'maintien', 'libre')),
  zone_id uuid,                                   -- null : toutes les zones du marché
  libelle text,
  date_debut date not null,                       -- première nuit (jour de 0 h à 6 h)
  date_fin date,                                  -- dernière nuit ; défaut posé par déclencheur
  mode_saisie text check (mode_saisie in ('minimum', 'releves', 'import')),  -- null : réglage du marché
  observation text,
  pv_chemin text,                                 -- procès-verbal signé (compartiment « debits »)
  pv_signe_le date,
  saisi_par uuid references public.profils (id),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  supprime_le timestamptz,
  unique (id, marche_id),
  foreign key (zone_id, marche_id) references public.zones (id, marche_id),
  check (date_fin is null or (date_fin >= date_debut and date_fin - date_debut <= 31))
);
alter table public.campagnes_debit enable row level security;
create index campagnes_debit_marche_idx on public.campagnes_debit (marche_id, type, date_debut);

comment on table public.campagnes_debit is
  'Campagnes de mesure du débit de nuit (D2) : avant (Qi, 3 nuits), après balayage (Qf, 3 nuits), contrôle de maintien (hebdomadaire), libre.';

-- -----------------------------------------------------------------------------
-- 4. Mesures : une ligne par campagne, point et nuit
-- -----------------------------------------------------------------------------
create table public.mesures_nuit (
  id uuid primary key default gen_random_uuid(),   -- créé sur l'appareil (hors ligne, S19)
  marche_id uuid not null references public.marches (id),
  campagne_id uuid not null,
  point_id uuid not null,
  nuit date not null,                              -- jour de la nuit (relevés de 0 h à 6 h ce jour-là)
  releves jsonb,                                   -- [{"h": "00:15", "q": 12.4}, …] triés, de 00:00 à 06:00
  minimum_m3h numeric(10,3) not null check (minimum_m3h >= 0),  -- saisi, ou minimum des relevés
  mode text not null check (mode in ('minimum', 'releves')),     -- posé par déclencheur
  origine text not null default 'saisie' check (origine in ('saisie', 'import')),
  piece_jointe text,                               -- photo de l'afficheur ou PV (compartiment « debits »)
  observation text,
  auteur_terrain_id uuid references public.profils (id),
  saisi_par uuid references public.profils (id),
  source_saisie public.source_saisie not null default 'web',
  validee_le timestamptz,
  validee_par uuid references public.profils (id),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  supprime_le timestamptz,
  unique (id, marche_id),
  foreign key (campagne_id, marche_id) references public.campagnes_debit (id, marche_id),
  foreign key (point_id, marche_id) references public.points_mesure (id, marche_id)
);
alter table public.mesures_nuit enable row level security;
create unique index mesures_nuit_unique_idx on public.mesures_nuit (campagne_id, point_id, nuit) where supprime_le is null;
create index mesures_nuit_marche_idx on public.mesures_nuit (marche_id, nuit);

comment on table public.mesures_nuit is
  'Débit de nuit d''un point (D3) : relevés de 0 h à 6 h (25 valeurs toutes les 15 min, R-CPS-114) ou minimum de la nuit seul ; compté une fois validé.';

-- -----------------------------------------------------------------------------
-- 5. Fonctions internes et déclencheurs
-- -----------------------------------------------------------------------------

-- Relevés vérifiés et triés : [{h: "HH:MM", q}] entre 00:00 et 06:00, débits positifs, heures distinctes.
create function private.normaliser_releves(p_releves jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  _resultat jsonb;
  _n integer;
  _distinctes integer;
  _hors integer;
  _negatifs integer;
begin
  if p_releves is null or jsonb_typeof(p_releves) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_releves) <> 'array' then
    raise exception 'Relevés : liste attendue' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_releves) = 0 then
    return null;
  end if;
  if jsonb_array_length(p_releves) > 100 then
    raise exception 'Relevés : 100 valeurs au plus par point et par nuit' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_releves) e
     where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'q') is distinct from 'number'
        or coalesce(e ->> 'h', '') !~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
  ) then
    raise exception 'Relevé invalide : heure HH:MM et débit numérique attendus' using errcode = 'invalid_parameter_value';
  end if;
  select jsonb_agg(jsonb_build_object('h', x.h, 'q', x.q) order by x.h),
         count(*), count(distinct x.h),
         count(*) filter (where x.h > '06:00'),
         count(*) filter (where x.q < 0)
    into _resultat, _n, _distinctes, _hors, _negatifs
    from (select to_char((e ->> 'h')::time, 'HH24:MI') as h, (e ->> 'q')::numeric as q
            from jsonb_array_elements(p_releves) e) x;
  if _hors > 0 then
    raise exception 'Relevés de nuit : de 00:00 à 06:00 seulement' using errcode = 'check_violation';
  end if;
  if _negatifs > 0 then
    raise exception 'Débit négatif refusé' using errcode = 'check_violation';
  end if;
  if _distinctes <> _n then
    raise exception 'Deux relevés à la même heure pour le même point' using errcode = 'check_violation';
  end if;
  return _resultat;
end
$$;

-- Point de mesure : le secteur appartient à la zone.
create function private.controler_point_mesure()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.secteur_id is not null and not exists (
    select 1 from public.secteurs s where s.id = new.secteur_id and s.zone_id = new.zone_id
  ) then
    raise exception 'Le secteur du point de mesure n''appartient pas à sa zone' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- Campagne : dernière nuit par défaut (3 nuits avant et après, une nuit sinon), auteur ; une
-- campagne qui a des mesures garde son type, sa zone et couvre toujours leurs nuits.
create function private.avant_campagne_debit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not private.appel_systeme() then
      new.saisi_par := auth.uid();
      new.cree_le := now();
      new.supprime_le := null;
    end if;
    new.saisi_par := coalesce(new.saisi_par, auth.uid());
  elsif not private.appel_systeme() then
    new.saisi_par := old.saisi_par;
    new.cree_le := old.cree_le;
  end if;
  new.date_fin := coalesce(new.date_fin, new.date_debut + case when new.type in ('avant', 'apres') then 2 else 0 end);
  new.libelle := nullif(btrim(new.libelle), '');
  if tg_op = 'UPDATE' and exists (
    select 1 from public.mesures_nuit m where m.campagne_id = new.id and m.supprime_le is null
  ) then
    if new.type is distinct from old.type or new.zone_id is distinct from old.zone_id then
      raise exception 'Campagne déjà mesurée : type et zone ne changent plus' using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from public.mesures_nuit m
       where m.campagne_id = new.id and m.supprime_le is null
         and (m.nuit < new.date_debut or m.nuit > new.date_fin)
    ) then
      raise exception 'Des mesures sont hors des nouvelles dates de la campagne' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;

-- Mesure, avant insertion ou modification : relevés normalisés, minimum, mode ; point, zone et
-- nuit cohérents avec la campagne ; auteurs ; validation réservée au droit « valider ».
create function private.avant_mesure_nuit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _c public.campagnes_debit;
  _zone uuid;
  _valideur boolean;
begin
  new.releves := private.normaliser_releves(new.releves);
  if new.releves is not null then
    new.mode := 'releves';
    select min((e ->> 'q')::numeric) into new.minimum_m3h from jsonb_array_elements(new.releves) e;
  else
    new.mode := 'minimum';
    if new.minimum_m3h is null then
      raise exception 'Débit minimum de la nuit ou relevés obligatoires' using errcode = 'not_null_violation';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.campagne_id is distinct from old.campagne_id or new.point_id is distinct from old.point_id
       or new.nuit is distinct from old.nuit then
      raise exception 'Campagne, point et nuit d''une mesure ne changent pas : supprimez-la et saisissez-en une autre'
        using errcode = 'check_violation';
    end if;
  end if;

  select * into _c from public.campagnes_debit c where c.id = new.campagne_id;
  if _c.id is null then
    raise exception 'Campagne introuvable ou non autorisée' using errcode = 'insufficient_privilege';
  end if;
  if _c.supprime_le is not null then
    raise exception 'Campagne supprimée' using errcode = 'check_violation';
  end if;
  if new.nuit < _c.date_debut or new.nuit > _c.date_fin then
    raise exception 'La nuit du % est hors de la campagne (du % au %)', new.nuit, _c.date_debut, _c.date_fin
      using errcode = 'check_violation';
  end if;
  select p.zone_id into _zone from public.points_mesure p where p.id = new.point_id;
  if _c.zone_id is not null and _zone is distinct from _c.zone_id then
    raise exception 'Le point de mesure n''est pas dans la zone de la campagne' using errcode = 'check_violation';
  end if;

  if private.appel_systeme() then
    return new;
  end if;
  _valideur := private.peut(new.marche_id, 'mesures_debit', 'valider');

  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_mesure p where p.id = new.point_id and p.actif) then
      raise exception 'Point de mesure désactivé' using errcode = 'check_violation';
    end if;
    new.saisi_par := auth.uid();
    new.cree_le := now();
    new.supprime_le := null;
    if new.auteur_terrain_id is distinct from auth.uid() and new.auteur_terrain_id is not null and not _valideur then
      raise exception 'Seul le responsable saisit une mesure au nom d''un autre' using errcode = 'insufficient_privilege';
    end if;
    new.auteur_terrain_id := coalesce(new.auteur_terrain_id, auth.uid());
    -- Saisie du bureau (droit « valider ») : validée d'emblée ; saisie du terrain : à valider.
    if _valideur then
      new.validee_le := now();
      new.validee_par := auth.uid();
    else
      new.validee_le := null;
      new.validee_par := null;
    end if;
    return new;
  end if;

  -- Modification : compte de saisie, date et origine figés ; auteur changé par le responsable seulement.
  if new.saisi_par is distinct from old.saisi_par or new.cree_le is distinct from old.cree_le
     or new.origine is distinct from old.origine
     or (new.auteur_terrain_id is distinct from old.auteur_terrain_id and not _valideur) then
    raise exception 'Auteur, compte et date de saisie d''une mesure non modifiables' using errcode = 'insufficient_privilege';
  end if;
  if new.supprime_le is distinct from old.supprime_le then
    if old.supprime_le is not null then
      raise exception 'Mesure déjà supprimée' using errcode = 'check_violation';
    end if;
    if not (_valideur or (old.validee_le is null
            and private.peut(old.marche_id, 'mesures_debit', 'supprimer', old.auteur_terrain_id, old.saisi_par))) then
      raise exception 'Suppression de cette mesure non autorisée' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if old.supprime_le is not null then
    raise exception 'Mesure supprimée : non modifiable' using errcode = 'check_violation';
  end if;
  if new.validee_le is distinct from old.validee_le then
    if not _valideur then
      raise exception 'Validation réservée au responsable (droit « valider » des mesures de débit)'
        using errcode = 'insufficient_privilege';
    end if;
    new.validee_le := case when new.validee_le is null then null else now() end;
    new.validee_par := case when new.validee_le is null then null else auth.uid() end;
  elsif new.validee_par is distinct from old.validee_par then
    raise exception 'Validation non modifiable' using errcode = 'insufficient_privilege';
  end if;
  if (to_jsonb(new) - 'validee_le' - 'validee_par' - 'modifie_le')
     is distinct from (to_jsonb(old) - 'validee_le' - 'validee_par' - 'modifie_le') then
    if old.validee_le is not null and not _valideur then
      raise exception 'Mesure validée : seul le responsable la corrige' using errcode = 'insufficient_privilege';
    end if;
    if not (_valideur or private.peut(old.marche_id, 'mesures_debit', 'modifier', old.auteur_terrain_id, old.saisi_par)) then
      raise exception 'Modification de cette mesure non autorisée' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end
$$;

create trigger a_controler_point before insert or update on public.points_mesure
  for each row execute function private.controler_point_mesure();
create trigger maj_modifie_le before update on public.points_mesure
  for each row execute function private.maj_modifie_le();
create trigger figer_marche before update on public.points_mesure
  for each row execute function private.figer_marche();
create trigger journaliser after insert or update or delete on public.points_mesure
  for each row execute function private.journaliser();

create trigger a_avant_campagne before insert or update on public.campagnes_debit
  for each row execute function private.avant_campagne_debit();
create trigger maj_modifie_le before update on public.campagnes_debit
  for each row execute function private.maj_modifie_le();
create trigger figer_marche before update on public.campagnes_debit
  for each row execute function private.figer_marche();
create trigger journaliser after insert or update or delete on public.campagnes_debit
  for each row execute function private.journaliser();

create trigger a_avant_mesure before insert or update on public.mesures_nuit
  for each row execute function private.avant_mesure_nuit();
create trigger maj_modifie_le before update on public.mesures_nuit
  for each row execute function private.maj_modifie_le();
create trigger figer_marche before update on public.mesures_nuit
  for each row execute function private.figer_marche();
create trigger journaliser after insert or update or delete on public.mesures_nuit
  for each row execute function private.journaliser();

-- -----------------------------------------------------------------------------
-- 6. Règles RLS et privilèges (rien pour anon ; aucune suppression physique)
-- -----------------------------------------------------------------------------

-- Points : lisibles par tout affecté au marché ; gérés avec le droit « paramètres ».
create policy points_mesure_lecture on public.points_mesure for select to authenticated
  using (marche_id = any ((select private.mes_marches())::uuid[]));
create policy points_mesure_creation on public.points_mesure for insert to authenticated
  with check (marche_id = any ((select private.marches_autorises('parametres', 'creer'))::uuid[]));
create policy points_mesure_modification on public.points_mesure for update to authenticated
  using (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]))
  with check (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]));

-- Campagnes : lecture « mesures_debit / lire » ; création, modification et suppression logique
-- par le bureau (« mesures_debit / valider » : le responsable).
create policy campagnes_debit_lecture on public.campagnes_debit for select to authenticated
  using (marche_id = any ((select private.marches_autorises('mesures_debit', 'lire'))::uuid[]));
create policy campagnes_debit_creation on public.campagnes_debit for insert to authenticated
  with check (marche_id = any ((select private.marches_autorises('mesures_debit', 'valider'))::uuid[]));
create policy campagnes_debit_modification on public.campagnes_debit for update to authenticated
  using (marche_id = any ((select private.marches_autorises('mesures_debit', 'valider'))::uuid[]))
  with check (marche_id = any ((select private.marches_autorises('mesures_debit', 'valider'))::uuid[]));

-- Mesures : lecture « lire », saisie « creer », modification « modifier » (portée vérifiée par le
-- déclencheur), suppression logique « supprimer », correction et validation « valider ».
create policy mesures_nuit_lecture on public.mesures_nuit for select to authenticated
  using (marche_id = any ((select private.marches_autorises('mesures_debit', 'lire'))::uuid[]));
create policy mesures_nuit_creation on public.mesures_nuit for insert to authenticated
  with check (marche_id = any ((select private.marches_autorises('mesures_debit', 'creer'))::uuid[]));
create policy mesures_nuit_modification on public.mesures_nuit for update to authenticated
  using (
    marche_id = any ((select private.marches_autorises('mesures_debit', 'modifier'))::uuid[])
    or marche_id = any ((select private.marches_autorises('mesures_debit', 'supprimer'))::uuid[])
    or marche_id = any ((select private.marches_autorises('mesures_debit', 'valider'))::uuid[])
  )
  with check (
    marche_id = any ((select private.marches_autorises('mesures_debit', 'modifier'))::uuid[])
    or marche_id = any ((select private.marches_autorises('mesures_debit', 'supprimer'))::uuid[])
    or marche_id = any ((select private.marches_autorises('mesures_debit', 'valider'))::uuid[])
  );

grant select, insert, update on public.points_mesure, public.campagnes_debit, public.mesures_nuit to authenticated;
grant all on public.points_mesure, public.campagnes_debit, public.mesures_nuit to service_role;

-- Pièces jointes : <marché>/<campagne>/<fichier> (procès-verbal signé, photo de l'afficheur).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('debits', 'debits', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy debits_fichiers_lecture on storage.objects for select to authenticated
  using (
    bucket_id = 'debits'
    and private.uuid_ou_nul((storage.foldername(name))[1])
        = any ((select private.marches_autorises('mesures_debit', 'lire'))::uuid[])
  );
create policy debits_fichiers_envoi on storage.objects for insert to authenticated
  with check (
    bucket_id = 'debits'
    and private.uuid_ou_nul((storage.foldername(name))[1])
        = any ((select private.marches_autorises('mesures_debit', 'creer'))::uuid[])
  );
create policy debits_fichiers_suppression on storage.objects for delete to authenticated
  using (
    bucket_id = 'debits'
    and private.uuid_ou_nul((storage.foldername(name))[1])
        = any ((select private.marches_autorises('mesures_debit', 'valider'))::uuid[])
  );

-- -----------------------------------------------------------------------------
-- 7. Calculs (D4)
-- -----------------------------------------------------------------------------

-- Points de pénalité (R-CPS-146, 149) : 1 % par point de τ non atteint, plafonné ; τ ≥ 0 : aucun.
-- Mode « entiers » : points complets seulement (τ = −3,4 % → 3 points).
create function public.penalite_points(p_tau numeric, p_plafond numeric default 25, p_mode text default 'proportionnels')
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_tau is null then null
    when p_tau >= 0 then 0::numeric
    else least(coalesce(p_plafond, 25), case when p_mode = 'entiers' then floor(-p_tau) else -p_tau end)
  end
$$;

-- Débit d'une zone pour une nuit d'une campagne (mesures validées seulement). Points attendus :
-- points actifs de la zone et points mesurés cette nuit-là. Quand tous les points ont des relevés
-- détaillés, débit de la zone = minimum, sur les instants où tous les points sont relevés, de la
-- somme des points (R-CPS-103) ; sinon somme des minimums des points, marquée « approchée » dès
-- qu'il y a plus d'un point. « complete » : chaque point attendu a sa mesure.
create view public.v_debits_nuits with (security_invoker = true) as
with m as (
  select mn.id, mn.campagne_id, mn.marche_id, mn.point_id, mn.nuit, mn.mode, mn.releves, mn.minimum_m3h,
         mn.validee_le, p.zone_id
    from public.mesures_nuit mn
    join public.points_mesure p on p.id = mn.point_id
    join public.campagnes_debit c on c.id = mn.campagne_id and c.supprime_le is null
   where mn.supprime_le is null
),
v as (select * from m where validee_le is not null),
nuits as (
  select campagne_id, marche_id, zone_id, nuit,
         count(*) filter (where validee_le is not null)::integer as nb_valides,
         count(*) filter (where validee_le is null)::integer as nb_a_valider
    from m group by campagne_id, marche_id, zone_id, nuit
),
attendus as (
  select n.campagne_id, n.zone_id, n.nuit, p.id as point_id
    from nuits n join public.points_mesure p on p.zone_id = n.zone_id and p.actif
  union
  select campagne_id, zone_id, nuit, point_id from v
),
compte as (
  select a.campagne_id, a.zone_id, a.nuit,
         count(*)::integer as nb_points,
         count(v.point_id)::integer as nb_points_mesures,
         count(v.point_id) filter (where v.mode = 'releves')::integer as nb_points_releves,
         sum(v.minimum_m3h) as somme_minimums
    from attendus a
    left join v on v.campagne_id = a.campagne_id and v.point_id = a.point_id and v.nuit = a.nuit
   group by a.campagne_id, a.zone_id, a.nuit
),
instants as (
  select v.campagne_id, v.zone_id, v.nuit, r.h, sum(r.q) as q, count(*)::integer as nb
    from v cross join lateral jsonb_to_recordset(v.releves) as r (h text, q numeric)
   where v.mode = 'releves'
   group by v.campagne_id, v.zone_id, v.nuit, r.h
),
simultane as (
  select i.campagne_id, i.zone_id, i.nuit, min(i.q) as q, count(*)::integer as nb_instants
    from instants i
    join compte k on (k.campagne_id, k.zone_id, k.nuit) = (i.campagne_id, i.zone_id, i.nuit)
   where i.nb = k.nb_points
   group by i.campagne_id, i.zone_id, i.nuit
)
select
  n.campagne_id,
  n.marche_id,
  c.type as campagne_type,
  n.zone_id,
  z.numero as zone_numero,
  z.libelle as zone_libelle,
  n.nuit,
  k.nb_points,
  k.nb_points_mesures,
  k.nb_points_releves,
  coalesce(s.nb_instants, 0) as nb_instants,
  n.nb_valides,
  n.nb_a_valider,
  k.nb_points_mesures = k.nb_points as complete,
  case when s.q is not null and k.nb_points_releves = k.nb_points then s.q else k.somme_minimums end as q_zone_m3h,
  not (s.q is not null and k.nb_points_releves = k.nb_points) and k.nb_points_mesures > 1 as approchee
from nuits n
join public.campagnes_debit c on c.id = n.campagne_id
join public.zones z on z.id = n.zone_id
join compte k on (k.campagne_id, k.zone_id, k.nuit) = (n.campagne_id, n.zone_id, n.nuit)
left join simultane s on (s.campagne_id, s.zone_id, s.nuit) = (n.campagne_id, n.zone_id, n.nuit);

comment on view public.v_debits_nuits is
  'Débit de nuit par campagne, zone et nuit (mesures validées) : q_zone_m3h, approchée (somme des minimums), complète (tous les points).';

-- Résultat d'une campagne par zone : minimum des nuits complètes (Qi, Qf : minimum des trois
-- minimums, R-CPS-115 et 143 ; contrôle de maintien : minimum de la nuit de contrôle).
create view public.v_debits_campagnes with (security_invoker = true) as
with zc as (
  select c.id as campagne_id, c.marche_id, c.type, c.libelle, c.date_debut, c.date_fin, c.cree_le,
         z.id as zone_id, z.numero as zone_numero, z.libelle as zone_libelle, z.q_exige_m3h
    from public.campagnes_debit c
    join public.zones z on z.marche_id = c.marche_id and (c.zone_id = z.id or (c.zone_id is null and z.actif))
   where c.supprime_le is null
),
agr as (
  select campagne_id, zone_id,
         count(*)::integer as nb_nuits,
         count(*) filter (where complete and q_zone_m3h is not null)::integer as nb_nuits_completes,
         min(q_zone_m3h) filter (where complete) as q_m3h,
         sum(nb_a_valider)::integer as nb_a_valider
    from public.v_debits_nuits group by campagne_id, zone_id
)
select
  zc.campagne_id, zc.marche_id, zc.type, zc.libelle, zc.date_debut, zc.date_fin,
  zc.zone_id, zc.zone_numero, zc.zone_libelle, zc.q_exige_m3h,
  coalesce(a.nb_nuits, 0) as nb_nuits,
  coalesce(a.nb_nuits_completes, 0) as nb_nuits_completes,
  coalesce(a.nb_a_valider, 0) as nb_a_valider,
  a.q_m3h,
  (select min(n.nuit) from public.v_debits_nuits n
    where n.campagne_id = zc.campagne_id and n.zone_id = zc.zone_id and n.complete and n.q_zone_m3h = a.q_m3h) as nuit_minimum,
  coalesce((select bool_or(n.approchee) from public.v_debits_nuits n
    where n.campagne_id = zc.campagne_id and n.zone_id = zc.zone_id and n.complete and n.q_zone_m3h = a.q_m3h), false) as approchee,
  zc.cree_le
from zc
left join agr a on a.campagne_id = zc.campagne_id and a.zone_id = zc.zone_id;

comment on view public.v_debits_campagnes is
  'Résultat d''une campagne par zone : minimum des nuits complètes (Qi, Qf, contrôle), approché si la nuit retenue l''est.';

-- Performances par zone et pour le marché (D4) : Qi (dernière campagne « avant »), Qf (dernière
-- « après »), ΔQ, τ1 et pénalité du balayage, alerte d'arrêt de zone (τ1 < −seuil), contrôles de
-- maintien (moyenne des minimums hebdomadaires), τ2 et pénalité du maintien, dégradation des gains
-- (moyenne − Qf, en % de ΔQ ; alerte au-delà du seuil, R-CPS-107 et 111).
-- Montants au prix du bordereau (prix « balayage » et « maintien »), visibles seulement avec
-- « quantités / lire » (RLS de prix). Assiette « zone » : pénalité par zone ; « marché » : τ global
-- (sommes des débits des zones) appliqué au montant total du prix. Ligne niveau = 'marche' : totaux.
create function public.debits_resultats(p_marche uuid)
returns table (
  niveau text,
  zone_id uuid,
  zone_numero integer,
  zone_libelle text,
  lineaire_m numeric,
  q_exige_m3h numeric,
  q_plus_bas_historique_m3h numeric,
  q_actuel_m3h numeric,
  balayage_acheve_le date,
  qi_m3h numeric,
  qi_approche boolean,
  qi_nuits integer,
  qf_m3h numeric,
  qf_approche boolean,
  qf_nuits integer,
  delta_q_m3h numeric,
  tau1_pct numeric,
  points_balayage numeric,
  montant_balayage numeric,
  penalite_balayage numeric,
  alerte_arret boolean,
  nb_controles integer,
  dernier_controle date,
  dernier_controle_m3h numeric,
  ecart_controles_max_j integer,
  q_maintien_moyen_m3h numeric,
  tau2_pct numeric,
  points_maintien numeric,
  montant_maintien numeric,
  penalite_maintien numeric,
  degradation_m3h numeric,
  degradation_pct numeric,
  alerte_degradation boolean,
  assiette text,
  mode_points text,
  fin_maintien date
)
language sql
stable
set search_path = ''
as $$
with mm as (
  select m.id, m.debits_assiette, m.debits_points, m.debits_plafond_pct, m.debits_seuil_arret_pct,
         m.debits_seuil_degradation_pct,
         (select max(ph.date_fin) from public.phases ph where ph.marche_id = m.id and ph.code like 'maintien%') as fin_maintien
    from public.marches m
   where m.id = p_marche and private.peut(p_marche, 'mesures_debit', 'lire')
),
pu as (
  select
    (select p.pu_ht from public.prix p where p.marche_id = p_marche and p.famille = 'balayage' and p.actif and not p.hors_bordereau
      order by p.ordre, p.numero limit 1) as pu_balayage,
    (select p.quantite_marche from public.prix p where p.marche_id = p_marche and p.famille = 'balayage' and p.actif and not p.hors_bordereau
      order by p.ordre, p.numero limit 1) as qte_balayage,
    (select p.pu_ht from public.prix p where p.marche_id = p_marche and p.famille = 'maintien' and p.actif and not p.hors_bordereau
      order by p.ordre, p.numero limit 1) as pu_maintien,
    (select p.quantite_marche from public.prix p where p.marche_id = p_marche and p.famille = 'maintien' and p.actif and not p.hors_bordereau
      order by p.ordre, p.numero limit 1) as qte_maintien
),
zm as (
  select z.* from public.zones z join mm on mm.id = z.marche_id where z.actif
),
dc as (select * from public.v_debits_campagnes where marche_id = p_marche and q_m3h is not null),
z1 as (
  select z.id, z.numero, z.libelle, z.lineaire_m, z.q_exige_m3h, z.q_plus_bas_historique_m3h, z.q_actuel_m3h,
         z.balayage_acheve_le,
         qi.q_m3h as qi, qi.approchee as qi_app, qi.nb_nuits_completes as qi_nuits,
         qf.q_m3h as qf, qf.approchee as qf_app, qf.nb_nuits_completes as qf_nuits,
         mt.nb, mt.moyenne, mt.dernier, mt.dernier_q, mt.ecart_max
    from zm z
    left join lateral (select * from dc where dc.zone_id = z.id and dc.type = 'avant'
                        order by dc.date_debut desc, dc.cree_le desc limit 1) qi on true
    left join lateral (select * from dc where dc.zone_id = z.id and dc.type = 'apres'
                        order by dc.date_debut desc, dc.cree_le desc limit 1) qf on true
    left join lateral (
      select count(*)::integer as nb, avg(x.q_m3h) as moyenne,
             max(x.date_debut) as dernier,
             (array_agg(x.q_m3h order by x.date_debut desc, x.cree_le desc))[1] as dernier_q,
             max(x.ecart)::integer as ecart_max
        from (select dc.q_m3h, dc.date_debut, dc.cree_le,
                     dc.date_debut - lag(dc.date_debut) over (order by dc.date_debut) as ecart
                from dc where dc.zone_id = z.id and dc.type = 'maintien') x
    ) mt on true
),
z2 as (
  select z1.*,
         case when z1.q_exige_m3h > 0 and z1.qf is not null
              then round(100 * (z1.q_exige_m3h - z1.qf) / z1.q_exige_m3h, 2) end as tau1,
         case when z1.qf > 0 and z1.moyenne is not null
              then round(100 * (z1.qf - z1.moyenne) / z1.qf, 2) end as tau2,
         round(z1.lineaire_m * pu.pu_balayage, 2) as mt_balayage,
         round(z1.lineaire_m * pu.pu_maintien, 2) as mt_maintien
    from z1, pu
),
lignes_zones as (
  select 'zone'::text as niveau, z2.id, z2.numero, z2.libelle, z2.lineaire_m, z2.q_exige_m3h,
         z2.q_plus_bas_historique_m3h, z2.q_actuel_m3h, z2.balayage_acheve_le,
         z2.qi, z2.qi_app, z2.qi_nuits, z2.qf, z2.qf_app, z2.qf_nuits,
         z2.qi - z2.qf as delta_q,
         z2.tau1,
         public.penalite_points(z2.tau1, mm.debits_plafond_pct, mm.debits_points) as pts1,
         z2.mt_balayage,
         case when mm.debits_assiette = 'zone'
              then round(z2.mt_balayage * public.penalite_points(z2.tau1, mm.debits_plafond_pct, mm.debits_points) / 100, 2) end as pen1,
         z2.tau1 < -mm.debits_seuil_arret_pct as arret,
         coalesce(z2.nb, 0) as nb, z2.dernier, z2.dernier_q, z2.ecart_max, z2.moyenne,
         z2.tau2,
         public.penalite_points(z2.tau2, mm.debits_plafond_pct, mm.debits_points) as pts2,
         z2.mt_maintien,
         case when mm.debits_assiette = 'zone'
              then round(z2.mt_maintien * public.penalite_points(z2.tau2, mm.debits_plafond_pct, mm.debits_points) / 100, 2) end as pen2,
         z2.moyenne - z2.qf as degr,
         case when z2.qi - z2.qf > 0 and z2.moyenne is not null
              then round(100 * (z2.moyenne - z2.qf) / (z2.qi - z2.qf), 2) end as degr_pct,
         mm.debits_seuil_degradation_pct as seuil_degr,
         mm.debits_assiette, mm.debits_points, mm.fin_maintien
    from z2, mm
),
tot as (
  select count(*) as nz,
         count(qi) as nqi, count(qf) as nqf, count(moyenne) as nmoy,
         sum(lineaire_m) as lin, sum(q_exige_m3h) as qe, sum(q_plus_bas_historique_m3h) as qh, sum(q_actuel_m3h) as qa,
         sum(qi) as qi, sum(qf) as qf, sum(moyenne) as moy,
         bool_or(qi_app) as qi_app, bool_or(qf_app) as qf_app,
         bool_or(arret) as arret, sum(nb) as nb, max(dernier) as dernier, max(ecart_max) as ecart_max,
         sum(mt_balayage) as mt1, sum(mt_maintien) as mt2, sum(pen1) as pen1, sum(pen2) as pen2
    from lignes_zones
),
g as (
  select tot.*,
         case when tot.nqf = tot.nz and tot.qe > 0 then round(100 * (tot.qe - tot.qf) / tot.qe, 2) end as tau1,
         case when tot.nqf = tot.nz and tot.nmoy = tot.nz and tot.qf > 0
              then round(100 * (tot.qf - tot.moy) / tot.qf, 2) end as tau2,
         case when tot.nqi = tot.nz and tot.nqf = tot.nz and tot.nmoy = tot.nz and tot.qi - tot.qf > 0
              then round(100 * (tot.moy - tot.qf) / (tot.qi - tot.qf), 2) end as degr_pct
    from tot
)
select * from (
  select niveau, id, numero, libelle, lineaire_m, q_exige_m3h, q_plus_bas_historique_m3h, q_actuel_m3h,
         balayage_acheve_le, qi, qi_app, qi_nuits, qf, qf_app, qf_nuits, delta_q, tau1, pts1, mt_balayage, pen1,
         coalesce(arret, false), nb, dernier, dernier_q, ecart_max, moyenne, tau2, pts2, mt_maintien, pen2,
         degr, degr_pct, coalesce(degr_pct > seuil_degr, false), debits_assiette, debits_points, fin_maintien
    from lignes_zones
  union all
  select 'marche', null, null, null, g.lin, g.qe, g.qh, g.qa, null,
         case when g.nqi = g.nz then g.qi end, case when g.nqi = g.nz then g.qi_app end, null,
         case when g.nqf = g.nz then g.qf end, case when g.nqf = g.nz then g.qf_app end, null,
         case when g.nqi = g.nz and g.nqf = g.nz then g.qi - g.qf end,
         g.tau1,
         public.penalite_points(g.tau1, mm.debits_plafond_pct, mm.debits_points),
         case when mm.debits_assiette = 'marche' then round(pu.qte_balayage * pu.pu_balayage, 2) else g.mt1 end,
         case when mm.debits_assiette = 'marche'
              then round(pu.qte_balayage * pu.pu_balayage * public.penalite_points(g.tau1, mm.debits_plafond_pct, mm.debits_points) / 100, 2)
              else g.pen1 end,
         coalesce(g.arret, false), g.nb::integer, g.dernier, null, g.ecart_max::integer,
         case when g.nmoy = g.nz then g.moy end,
         g.tau2,
         public.penalite_points(g.tau2, mm.debits_plafond_pct, mm.debits_points),
         case when mm.debits_assiette = 'marche' then round(pu.qte_maintien * pu.pu_maintien, 2) else g.mt2 end,
         case when mm.debits_assiette = 'marche'
              then round(pu.qte_maintien * pu.pu_maintien * public.penalite_points(g.tau2, mm.debits_plafond_pct, mm.debits_points) / 100, 2)
              else g.pen2 end,
         case when g.nmoy = g.nz and g.nqf = g.nz then g.moy - g.qf end,
         g.degr_pct,
         coalesce(g.degr_pct > mm.debits_seuil_degradation_pct, false),
         mm.debits_assiette, mm.debits_points, mm.fin_maintien
    from g, mm, pu
   where g.nz > 0
) r
order by r.niveau desc, r.numero
$$;

comment on function public.debits_resultats(uuid) is
  'Performances des débits de nuit par zone et pour le marché (D4) : Qi, Qf, ΔQ, τ1, τ2, pénalités, alertes ; droit « mesures_debit / lire ».';

-- Saisie groupée (import, panneau, APK) : p_mesures = [{point_id, nuit, releves | minimum_m3h,
-- observation?, piece_jointe?, auteur_terrain_id?}]. Mesure existante (même campagne, point et
-- nuit) : remplacée (déclencheur : droits « modifier » ou « valider ») ; sinon ajoutée.
-- Droits de l'appelant (RLS). Retourne {ajoutees, modifiees}.
create function public.enregistrer_mesures_nuit(
  p_campagne uuid,
  p_mesures jsonb,
  p_origine text default 'saisie',
  p_source public.source_saisie default 'web'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  _c public.campagnes_debit;
  _e jsonb;
  _id uuid;
  _ajoutees integer := 0;
  _modifiees integer := 0;
begin
  if p_mesures is null or jsonb_typeof(p_mesures) <> 'array' then
    raise exception 'Liste de mesures attendue' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_mesures) > 2000 then
    raise exception '2 000 mesures au plus par envoi' using errcode = 'invalid_parameter_value';
  end if;
  if p_origine not in ('saisie', 'import') then
    raise exception 'Origine inconnue : %', p_origine using errcode = 'invalid_parameter_value';
  end if;
  select * into _c from public.campagnes_debit c where c.id = p_campagne and c.supprime_le is null;
  if _c.id is null then
    raise exception 'Campagne introuvable' using errcode = 'no_data_found';
  end if;
  for _e in select * from jsonb_array_elements(p_mesures) loop
    if (_e ->> 'point_id') is null or (_e ->> 'nuit') is null then
      raise exception 'Point et nuit obligatoires' using errcode = 'invalid_parameter_value';
    end if;
    select m.id into _id from public.mesures_nuit m
     where m.campagne_id = p_campagne and m.point_id = (_e ->> 'point_id')::uuid
       and m.nuit = (_e ->> 'nuit')::date and m.supprime_le is null;
    if _id is null then
      insert into public.mesures_nuit (marche_id, campagne_id, point_id, nuit, releves, minimum_m3h, origine,
                                       observation, piece_jointe, auteur_terrain_id, source_saisie)
      values (_c.marche_id, p_campagne, (_e ->> 'point_id')::uuid, (_e ->> 'nuit')::date,
              _e -> 'releves', (_e ->> 'minimum_m3h')::numeric, p_origine,
              nullif(btrim(_e ->> 'observation'), ''), _e ->> 'piece_jointe',
              (_e ->> 'auteur_terrain_id')::uuid, p_source);
      _ajoutees := _ajoutees + 1;
    else
      update public.mesures_nuit m
         set releves = _e -> 'releves',
             minimum_m3h = (_e ->> 'minimum_m3h')::numeric,
             observation = coalesce(nullif(btrim(_e ->> 'observation'), ''), m.observation),
             piece_jointe = coalesce(_e ->> 'piece_jointe', m.piece_jointe)
       where m.id = _id;
      _modifiees := _modifiees + 1;
    end if;
  end loop;
  return jsonb_build_object('ajoutees', _ajoutees, 'modifiees', _modifiees);
end
$$;

comment on function public.enregistrer_mesures_nuit(uuid, jsonb, text, public.source_saisie) is
  'Saisie ou import groupé des mesures d''une campagne (ajout ou remplacement par point et nuit) ; droits de l''appelant.';

-- Mesures à valider (circuit V1) : marchés où le compte a « mesures_debit / valider ».
create view public.v_debits_a_valider with (security_invoker = true) as
select mn.id, mn.marche_id, mn.campagne_id, c.type as campagne_type, c.libelle as campagne_libelle,
       mn.point_id, p.code as point_code, p.libelle as point_libelle, p.zone_id, z.numero as zone_numero,
       mn.nuit, mn.mode, mn.minimum_m3h, mn.releves, mn.piece_jointe, mn.observation,
       mn.auteur_terrain_id, pa.nom_complet as auteur, mn.saisi_par, mn.source_saisie, mn.cree_le
  from public.mesures_nuit mn
  join public.campagnes_debit c on c.id = mn.campagne_id and c.supprime_le is null
  join public.points_mesure p on p.id = mn.point_id
  join public.zones z on z.id = p.zone_id
  left join public.profils pa on pa.id = mn.auteur_terrain_id
 where mn.validee_le is null and mn.supprime_le is null
   and mn.marche_id = any ((select private.marches_autorises('mesures_debit', 'valider'))::uuid[]);

-- valider_etapes (20261009100200) : étape « debit » en plus (mesure de nuit saisie sur le terrain).
create or replace function public.valider_etapes(p_elements jsonb)
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
      when 'debit' then
        update public.mesures_nuit set validee_le = now()
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
  'Valide en lot des détections, réparations, réfections et mesures de nuit ([{etape, id}]) ; droit « valider » du type de donnée (V1).';

grant select on public.v_debits_nuits, public.v_debits_campagnes, public.v_debits_a_valider to authenticated, service_role;

revoke execute on function
  public.penalite_points(numeric, numeric, text),
  public.debits_resultats(uuid),
  public.enregistrer_mesures_nuit(uuid, jsonb, text, public.source_saisie)
  from public, anon;
grant execute on function
  public.penalite_points(numeric, numeric, text),
  public.debits_resultats(uuid),
  public.enregistrer_mesures_nuit(uuid, jsonb, text, public.source_saisie)
  to authenticated, service_role;

-- Fonctions des déclencheurs (non DEFINER) : exécutées avec les droits de l'appelant.
revoke execute on function
  private.normaliser_releves(jsonb),
  private.controler_point_mesure(),
  private.avant_campagne_debit(),
  private.avant_mesure_nuit()
  from public, anon;
grant execute on function
  private.normaliser_releves(jsonb),
  private.controler_point_mesure(),
  private.avant_campagne_debit(),
  private.avant_mesure_nuit()
  to authenticated, service_role;
