-- =============================================================================
-- Lot TP : Suivi fuites propriétaire de la tablette (docs/lots/lot-tablette-proprietaire.md).
-- Les tablettes des agents sont verrouillées par l'appli ; un administrateur les déverrouille sans être sur place :
--  1. il crée sur le panneau web un code temporaire de 8 chiffres (déverrouiller 15 min, 1 h ou 4 h, ou libérer
--     définitivement), valable 24 h, une seule fois ; la base n'en garde que l'empreinte ;
--  2. le code est tapé dans Suivi fuites, session ouverte (celle de l'agent, ou celle de l'administrateur sur une
--     tablette sans agent) : la base le vérifie, le consomme et le journalise ; 5 codes refusés par heure et par compte ;
--  3. journal des tablettes (codes, déverrouillages, reverrouillages, mises à jour, préparations), lu par
--     l'administrateur seulement.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Codes temporaires
-- -----------------------------------------------------------------------------
create table public.codes_tablette (
  id uuid primary key default gen_random_uuid(),
  empreinte text not null unique,
  type text not null check (type in ('deverrouiller', 'liberer')),
  minutes integer,
  motif text check (length(motif) <= 200),
  cree_par uuid not null references public.profils (id),
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null,
  utilise_le timestamptz,
  utilise_par uuid references public.profils (id),
  utilise_appareil text check (length(utilise_appareil) <= 64),
  utilise_modele text check (length(utilise_modele) <= 100),
  constraint codes_tablette_minutes_check check (
    (type = 'deverrouiller' and minutes in (15, 60, 240)) or (type = 'liberer' and minutes is null)
  )
);
alter table public.codes_tablette enable row level security;
create index codes_tablette_cree_le_idx on public.codes_tablette (cree_le desc);

comment on table public.codes_tablette is
  'Codes temporaires de déverrouillage des tablettes (lot TP) : empreinte SHA-256 seulement, 24 h, une seule utilisation.';

create policy codes_tablette_lecture on public.codes_tablette for select to authenticated
  using ((select private.est_admin()));
grant select on public.codes_tablette to authenticated;
grant all on public.codes_tablette to service_role;

-- -----------------------------------------------------------------------------
-- 2. Journal des tablettes (aucune écriture directe : fonctions du § 4)
-- -----------------------------------------------------------------------------
create table public.journal_tablettes (
  id bigint generated always as identity primary key,
  appareil text check (length(appareil) <= 64),
  modele text check (length(modele) <= 100),
  action text not null constraint journal_tablettes_action_check check (action in (
    'code_cree', 'deverrouillage', 'liberation', 'code_refuse', 'reverrouillage', 'mise_a_jour',
    'installation_echec', 'preparation', 'transfert', 'transfert_recu'
  )),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 4000),
  compte uuid references public.profils (id),
  survenu_le timestamptz not null default now(),
  cree_le timestamptz not null default now()
);
alter table public.journal_tablettes enable row level security;
create index journal_tablettes_survenu_le_idx on public.journal_tablettes (survenu_le desc);

comment on table public.journal_tablettes is
  'Journal des tablettes (lot TP) : codes, déverrouillages, reverrouillages, mises à jour ; survenu_le = heure sur la tablette.';

create policy journal_tablettes_lecture on public.journal_tablettes for select to authenticated
  using ((select private.est_admin()));
grant select on public.journal_tablettes to authenticated;
grant all on public.journal_tablettes to service_role;

-- Essais de codes refusés, pour les limites (privé : aucune lecture par l'API).
create table private.essais_codes_tablette (
  cle text not null,
  le timestamptz not null default now()
);
create index essais_codes_tablette_idx on private.essais_codes_tablette (cle, le);

-- -----------------------------------------------------------------------------
-- 3. Créer un code (administrateur actif)
-- -----------------------------------------------------------------------------
create function private.empreinte_code_tablette(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(sha256(convert_to(p_code, 'UTF8')), 'hex') $$;

create function public.creer_code_tablette(p_type text, p_minutes integer default 60, p_motif text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  _code text;
  _minutes integer := case when p_type = 'deverrouiller' then p_minutes end;
  _motif text := nullif(btrim(coalesce(p_motif, '')), '');
begin
  if auth.uid() is null or not private.est_admin() then
    raise exception 'Codes des tablettes réservés à l''administrateur' using errcode = 'insufficient_privilege';
  end if;
  if p_type not in ('deverrouiller', 'liberer') then
    raise exception 'Type de code : deverrouiller ou liberer' using errcode = 'invalid_parameter_value';
  end if;
  if p_type = 'deverrouiller' and coalesce(p_minutes, 0) not in (15, 60, 240) then
    raise exception 'Durée : 15, 60 ou 240 minutes' using errcode = 'invalid_parameter_value';
  end if;
  if length(_motif) > 200 then
    raise exception 'Motif : 200 caractères au plus' using errcode = 'invalid_parameter_value';
  end if;

  -- 8 chiffres tirés de 48 bits aléatoires de gen_random_uuid (générateur fort de PostgreSQL).
  loop
    _code := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint % 100000000))::text, 8, '0');
    insert into public.codes_tablette (empreinte, type, minutes, motif, cree_par, expire_le)
    values (private.empreinte_code_tablette(_code), p_type, _minutes, _motif, auth.uid(), now() + interval '24 hours')
    on conflict (empreinte) do nothing;
    exit when found;
  end loop;

  insert into public.journal_tablettes (action, details, compte)
  values ('code_cree', jsonb_build_object('type', p_type, 'minutes', _minutes, 'motif', _motif), auth.uid());
  return _code;
end
$$;

comment on function public.creer_code_tablette(text, integer, text) is
  'Administrateur : crée un code de 8 chiffres (déverrouiller 15, 60 ou 240 min, ou libérer), valable 24 h, une fois ; renvoyé une seule fois.';

-- -----------------------------------------------------------------------------
-- 4. Utiliser un code (sur la tablette), journaliser un événement de la tablette
-- -----------------------------------------------------------------------------
-- Limite : 5 codes refusés par heure et par compte (10^8 codes possibles, valables 24 h). Un code refusé ne lève pas
-- d'erreur : l'essai doit rester compté. Aucune fonction n'est ouverte sans connexion (test 01) : session exigée.
create function public.utiliser_code_tablette(p_code text, p_appareil text, p_modele text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _chiffres text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  _appareil text := left(btrim(coalesce(p_appareil, '')), 64);
  _modele text := left(nullif(btrim(coalesce(p_modele, '')), ''), 100);
  _cle text;
  _code public.codes_tablette;
begin
  if auth.uid() is null or not exists (select 1 from public.profils p where p.id = auth.uid() and p.actif) then
    raise exception 'Compte inconnu ou désactivé' using errcode = 'insufficient_privilege';
  end if;
  if _appareil = '' then
    raise exception 'Tablette inconnue' using errcode = 'invalid_parameter_value';
  end if;
  _cle := 'compte:' || auth.uid()::text;

  perform pg_advisory_xact_lock(hashtext('codes_tablette'));
  delete from private.essais_codes_tablette where le < now() - interval '1 day';

  if (select count(*) from private.essais_codes_tablette e where e.cle = _cle and e.le > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'erreur', 'trop_d_essais');
  end if;

  select * into _code from public.codes_tablette c
   where c.empreinte = private.empreinte_code_tablette(_chiffres)
     and length(_chiffres) = 8 and c.utilise_le is null and c.expire_le > now()
   for update;
  if not found then
    insert into private.essais_codes_tablette (cle) values (_cle);
    insert into public.journal_tablettes (appareil, modele, action, compte)
    values (_appareil, _modele, 'code_refuse', auth.uid());
    return jsonb_build_object('ok', false, 'erreur', 'invalide');
  end if;

  update public.codes_tablette c
     set utilise_le = now(), utilise_par = auth.uid(), utilise_appareil = _appareil, utilise_modele = _modele
   where c.id = _code.id;
  delete from private.essais_codes_tablette e where e.cle = _cle;
  insert into public.journal_tablettes (appareil, modele, action, details, compte)
  values (_appareil, _modele, case when _code.type = 'liberer' then 'liberation' else 'deverrouillage' end,
          jsonb_build_object('minutes', _code.minutes, 'motif', _code.motif, 'code_cree_par', _code.cree_par), auth.uid());
  return jsonb_build_object('ok', true, 'type', _code.type, 'minutes', _code.minutes);
end
$$;

comment on function public.utiliser_code_tablette(text, text, text) is
  'Tablette : vérifie et consomme un code ; { ok, type, minutes } ou { ok: false, erreur: invalide | trop_d_essais }.';

create function public.journaliser_tablette(
  p_appareil text,
  p_modele text,
  p_action text,
  p_details jsonb default '{}'::jsonb,
  p_survenu_le timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profils p where p.id = auth.uid() and p.actif) then
    raise exception 'Compte inconnu ou désactivé' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('reverrouillage', 'mise_a_jour', 'installation_echec', 'preparation', 'transfert', 'transfert_recu') then
    raise exception 'Action de tablette inconnue : %', p_action using errcode = 'invalid_parameter_value';
  end if;
  insert into public.journal_tablettes (appareil, modele, action, details, compte, survenu_le)
  values (left(btrim(coalesce(p_appareil, '')), 64), left(nullif(btrim(coalesce(p_modele, '')), ''), 100), p_action,
          case when jsonb_typeof(p_details) = 'object' then p_details else '{}'::jsonb end, auth.uid(),
          -- Heure de la tablette, bornée : un événement gardé hors ligne date d'au plus une semaine.
          least(now(), greatest(coalesce(p_survenu_le, now()), now() - interval '7 days')));
end
$$;

comment on function public.journaliser_tablette(text, text, text, jsonb, timestamptz) is
  'Tablette : note un événement survenu sur la tablette (reverrouillage, mise à jour, préparation…), envoyé dès le réseau.';

revoke execute on function private.empreinte_code_tablette(text) from public, anon, authenticated;
revoke execute on function public.creer_code_tablette(text, integer, text) from public, anon;
revoke execute on function public.utiliser_code_tablette(text, text, text) from public, anon;
revoke execute on function public.journaliser_tablette(text, text, text, jsonb, timestamptz) from public, anon;
grant execute on function public.creer_code_tablette(text, integer, text) to authenticated;
grant execute on function public.utiliser_code_tablette(text, text, text) to authenticated;
grant execute on function public.journaliser_tablette(text, text, text, jsonb, timestamptz) to authenticated;
