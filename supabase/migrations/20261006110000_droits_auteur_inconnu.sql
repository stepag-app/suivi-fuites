-- =============================================================================
-- Correctif : droit « les siennes » sur une saisie sans auteur connu.
--
-- private.peut terminait par
--   return _portee = 'toutes' or (_portee = 'siennes' and auth.uid() in (p_auteur, p_saisi_par));
-- Quand la saisie n'a ni auteur terrain ni saisi_par (données importées, de
-- démonstration ou générées par le serveur), `auth.uid() in (null, null)` vaut
-- null : la fonction renvoyait null, et `if not null` dans avant_modification_saisie
-- ne levait aucune erreur. Un agent « les siennes » pouvait donc modifier ou
-- supprimer une saisie qui n'était pas la sienne. Le lot R couvrait ce cas pour
-- les pièces posées seulement ; ici, correction à la source : coalesce(…, false).
--
-- Même définition que 20261006100000_droits_verrous.sql, seule la dernière
-- instruction change. create or replace : privilèges d'exécution inchangés.
-- =============================================================================
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
  -- Jamais null : une saisie sans auteur connu n'est « la sienne » pour personne.
  return coalesce(
    _portee = 'toutes'
    or (_portee = 'siennes' and auth.uid() in (p_auteur, p_saisi_par)),
    false);
end
$$;
