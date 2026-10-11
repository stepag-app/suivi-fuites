-- =============================================================================
-- Lot TP, suite : deux événements de tablette de plus au journal (notés par le module natif, envoyés par l'appli).
--  * wifi   : réseau Wi-Fi rejoint depuis l'appli (PR #118) ;
--  * fuseau : fuseau corrigé à GMT sur une tablette dont la base des fuseaux met encore le Maroc à UTC+1.
-- =============================================================================
alter table public.journal_tablettes drop constraint journal_tablettes_action_check;
alter table public.journal_tablettes add constraint journal_tablettes_action_check check (action in (
  'code_cree', 'deverrouillage', 'liberation', 'code_refuse', 'reverrouillage', 'mise_a_jour',
  'installation_echec', 'preparation', 'transfert', 'transfert_recu', 'wifi', 'fuseau'
));

create or replace function public.journaliser_tablette(
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
  if p_action not in ('reverrouillage', 'mise_a_jour', 'installation_echec', 'preparation', 'transfert', 'transfert_recu',
                      'wifi', 'fuseau') then
    raise exception 'Action de tablette inconnue : %', p_action using errcode = 'invalid_parameter_value';
  end if;
  insert into public.journal_tablettes (appareil, modele, action, details, compte, survenu_le)
  values (left(btrim(coalesce(p_appareil, '')), 64), left(nullif(btrim(coalesce(p_modele, '')), ''), 100), p_action,
          case when jsonb_typeof(p_details) = 'object' then p_details else '{}'::jsonb end, auth.uid(),
          -- Heure de la tablette, bornée : un événement gardé hors ligne date d'au plus une semaine.
          least(now(), greatest(coalesce(p_survenu_le, now()), now() - interval '7 days')));
end
$$;

revoke execute on function public.journaliser_tablette(text, text, text, jsonb, timestamptz) from public, anon;
grant execute on function public.journaliser_tablette(text, text, text, jsonb, timestamptz) to authenticated;
