-- =============================================================================
-- Lot F : logos du titulaire et du maître d'ouvrage, repris dans les en-têtes
-- des documents (exports PDF, Word, Excel, lots d'attachement, rapport par fuite).
--
--  * Compartiment privé « logos » (PNG ou JPEG, 2 Mo au plus ; l'image est déjà
--    réduite à ~600 px dans le navigateur avant l'envoi).
--  * Chemins imposés : <marche_id>/titulaire.<png|jpg> et
--    <marche_id>/maitre_ouvrage.<png|jpg>, rangés dans marches.logo_titulaire et
--    marches.logo_maitre_ouvrage (contrôle : le chemin est celui du marché).
--  * Lecture des fichiers : qui a accès au marché avec le droit « exports / lire »
--    (documents) ou « paramètres / lire » (écran Paramètres > Marché).
--    Envoi, remplacement, retrait : droit « paramètres / modifier » (comme la fiche).
--    Les agents de terrain (détection, chef de réparation) n'ont ni l'un ni l'autre.
--  * copier_marche ne copie pas les logos (un fichier ne se copie pas en SQL) :
--    sa liste de colonnes est explicite, les deux colonnes restent vides.
-- =============================================================================

alter table public.marches
  add column logo_titulaire text,
  add column logo_maitre_ouvrage text,
  add constraint marches_logo_titulaire_chemin check (
    logo_titulaire is null or logo_titulaire = id::text || '/titulaire.png' or logo_titulaire = id::text || '/titulaire.jpg'
  ),
  add constraint marches_logo_maitre_ouvrage_chemin check (
    logo_maitre_ouvrage is null
    or logo_maitre_ouvrage = id::text || '/maitre_ouvrage.png' or logo_maitre_ouvrage = id::text || '/maitre_ouvrage.jpg'
  );

comment on column public.marches.logo_titulaire is
  'Chemin du logo du titulaire dans le compartiment privé « logos » (<marche_id>/titulaire.png|jpg), ou vide.';
comment on column public.marches.logo_maitre_ouvrage is
  'Chemin du logo du maître d''ouvrage dans le compartiment privé « logos » (<marche_id>/maitre_ouvrage.png|jpg), ou vide.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', false, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lecture : documents (exports / lire) ou écran des paramètres (paramètres / lire).
create policy logos_fichiers_lecture on storage.objects for select to authenticated
  using (
    bucket_id = 'logos'
    and (
      private.uuid_ou_nul((storage.foldername(name))[1])
        = any ((select private.marches_autorises('exports', 'lire'))::uuid[])
      or private.uuid_ou_nul((storage.foldername(name))[1])
        = any ((select private.marches_autorises('parametres', 'lire'))::uuid[])
    )
  );

-- Écritures : seulement les deux noms prévus, dans le dossier d'un marché que
-- l'utilisateur peut paramétrer. La mise à jour sert au remplacement (upsert).
create policy logos_fichiers_envoi on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and name ~ '^[0-9a-f-]{36}/(titulaire|maitre_ouvrage)\.(png|jpg)$'
    and private.uuid_ou_nul((storage.foldername(name))[1])
        = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[])
  );

create policy logos_fichiers_remplacement on storage.objects for update to authenticated
  using (
    bucket_id = 'logos'
    and private.uuid_ou_nul((storage.foldername(name))[1])
        = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[])
  )
  with check (
    bucket_id = 'logos'
    and name ~ '^[0-9a-f-]{36}/(titulaire|maitre_ouvrage)\.(png|jpg)$'
    and private.uuid_ou_nul((storage.foldername(name))[1])
        = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[])
  );

create policy logos_fichiers_suppression on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and private.uuid_ou_nul((storage.foldername(name))[1])
        = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[])
  );
