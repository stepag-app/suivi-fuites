-- =============================================================================
-- Lot N : photos sur Cloudflare R2 (compartiment privé).
-- La tablette et le panneau n'ont jamais de clé R2 : la fonction serveur photos-r2 vérifie
-- les droits du compte appelant puis délivre des URL signées de courte durée (dépôt PUT,
-- lecture GET). Cette fonction SQL lui expose les marchés où le compte a un droit sur les
-- photos : même règle que la RLS de public.photos et que le compartiment Supabase Storage.
-- La colonne photos.stockage ('supabase' | 'r2') existe depuis la migration 1 ; les deux
-- stockages cohabitent (anciennes photos lisibles sans transfert).
-- =============================================================================

create function public.marches_photos(p_action text)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_action not in ('lire', 'creer', 'supprimer') then
    raise exception 'Action inconnue : % (lire, creer ou supprimer)', p_action
      using errcode = 'invalid_parameter_value';
  end if;
  if auth.uid() is null then
    return '{}'::uuid[];
  end if;
  return private.marches_autorises('photos', p_action);
end
$$;

comment on function public.marches_photos(text) is
  'Marchés où le compte connecté a le droit « photos » demandé (lire, creer, supprimer) ; lu par la fonction serveur photos-r2 avant de signer une URL R2.';

revoke execute on function public.marches_photos(text) from public, anon;
grant execute on function public.marches_photos(text) to authenticated, service_role;

comment on column public.photos.stockage is
  'supabase : compartiment Storage « photos » ; r2 : compartiment privé Cloudflare R2 (URL signées par la fonction serveur photos-r2).';
