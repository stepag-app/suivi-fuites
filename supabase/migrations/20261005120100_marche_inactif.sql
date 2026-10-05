-- =============================================================================
-- Marché désactivé : lecture seule pour tous sauf l'administrateur.
-- Jusqu'ici, un marché désactivé était seulement masqué aux agents dans les
-- écrans. Toutes les écritures (règles RLS, compartiments, fonctions d'arrêt)
-- passent par private.peut et private.marches_autorises : on y ajoute la
-- condition « marché actif » pour toute action autre que « lire ».
-- =============================================================================

create or replace function private.marches_autorises(p_type public.type_donnee, p_action text)
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
    return true;
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
