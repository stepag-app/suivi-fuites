-- =============================================================================
-- Migration 1 / fichier 7 : stockage des photos (Supabase Storage pour démarrer ;
-- bascule vers Cloudflare R2 prévue derrière la couche d'abstraction de l'appli,
-- colonne photos.stockage).
-- Chemin d'un fichier : <marche_id>/<fuite_id>/<photo_id>.jpg
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy photos_fichiers_lecture on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and private.uuid_ou_nul((storage.foldername(name))[1])
        = any ((select private.marches_autorises('photos', 'lire'))::uuid[])
  );

create policy photos_fichiers_envoi on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and private.uuid_ou_nul((storage.foldername(name))[1])
        = any ((select private.marches_autorises('photos', 'creer'))::uuid[])
  );

-- Pas de remplacement d'un fichier envoyé ; suppression selon le droit « supprimer ».
create policy photos_fichiers_suppression on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos'
    and private.peut(
      private.uuid_ou_nul((storage.foldername(name))[1]),
      'photos', 'supprimer', null, private.uuid_ou_nul(owner_id)
    )
  );
