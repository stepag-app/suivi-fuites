-- Un tronçon ne se balaie qu'une fois (décision d'Issam du 2026-10-09 ; tableau n° 1 du CPS : « une fois au
-- minimum », prix 1 payé au mètre balayé une fois).
--
-- Un balayage d'un tronçon qui a déjà un balayage non annulé est ignoré sans erreur (le déclencheur rend NULL) :
-- deux agents hors ligne dans la même rue ne bloquent pas la file d'attente, le premier enregistré fait foi.
-- Annuler ce balayage rouvre le tronçon. Les seconds passages déjà en base restent (historique), et un appel
-- système (reprise d'historique, service_role) peut encore en insérer.
-- La phase de maintien (prix 2) aura sa propre règle, par phase.

create function private.troncon_deja_balaye(p_troncon uuid, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.balayages b
     where b.troncon_id = p_troncon and b.annule_le is null and b.id <> p_id
  )
$$;
-- Appelée avec les droits de l'utilisateur (déclencheur non DEFINER), comme private.est_premier_passage.
revoke execute on function private.troncon_deja_balaye(uuid, uuid) from public, anon;
grant execute on function private.troncon_deja_balaye(uuid, uuid) to authenticated, service_role;

create function private.balayage_unique()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.appel_systeme() and new.annule_le is null and private.troncon_deja_balaye(new.troncon_id, new.id) then
    return null;
  end if;
  return new;
end
$$;

-- « a0 » : avant a_avant_insertion (ordre alphabétique des déclencheurs BEFORE).
revoke execute on function private.balayage_unique() from public, anon, authenticated;

create trigger a0_balayage_unique before insert on public.balayages
  for each row execute function private.balayage_unique();
