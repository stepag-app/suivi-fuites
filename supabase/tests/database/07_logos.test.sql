-- =============================================================================
-- Lot F : logos du titulaire et du maître d'ouvrage (compartiment privé « logos »,
-- colonnes marches.logo_titulaire / logo_maitre_ouvrage) : écriture par le droit
-- « paramètres / modifier », lecture par « exports / lire » ou « paramètres / lire »,
-- noms imposés, isolation entre marchés, agents de terrain refusés, copie sans logos.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(37);

-- a = admin, d = responsable SRM, b = détection SRM, c = chef de réparation SRM,
-- e = responsable DEMO, f = lecteur des exports SRM (détection + exports / lire)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chef.a@test.local',  '{"identifiant": "chef.a", "nom_complet": "Chef A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}'),
  ('00000000-0000-0000-0000-00000000000e', 'resp.b@test.local',  '{"identifiant": "resp.b", "nom_complet": "Responsable DEMO"}'),
  ('00000000-0000-0000-0000-00000000000f', 'lect.a@test.local',  '{"identifiant": "lect.a", "nom_complet": "Lecteur A"}');
update profils set est_admin = true where identifiant = 'issam';

create temporary table t_ids (cle text primary key, id uuid);
grant select, insert on t_ids to authenticated;
insert into t_ids values
  ('srm', (select id from marches where code = 'SRM-4500004453')),
  ('demo', (select id from marches where code = 'DEMO'));

select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', (select id from t_ids where cle = 'srm'), 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000c', (select id from t_ids where cle = 'srm'), 'chef_reparation');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', (select id from t_ids where cle = 'srm'), 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', (select id from t_ids where cle = 'demo'), 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000f', (select id from t_ids where cle = 'srm'), 'detection');
insert into droits (profil_id, marche_id, type_donnee, lire)
  values ('00000000-0000-0000-0000-00000000000f', (select id from t_ids where cle = 'srm'), 'exports', true);

-- -----------------------------------------------------------------------------
-- 1. Compartiment et colonnes
-- -----------------------------------------------------------------------------
select results_eq($$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'logos' $$,
  $$ values (false, 2097152::bigint, array['image/png', 'image/jpeg']) $$,
  'compartiment « logos » privé, 2 Mo, PNG ou JPEG seulement');
select results_eq($$ select logo_titulaire, logo_maitre_ouvrage from marches where id = (select id from t_ids where cle = 'srm') $$,
  $$ values (null::text, null::text) $$,
  'marché SRM : aucun logo au départ (en-têtes inchangés)');
select throws_ok($$ update marches set logo_titulaire = (select id from t_ids where cle = 'demo') || '/titulaire.png'
                     where id = (select id from t_ids where cle = 'srm') $$,
  '23514', null, 'chemin d''un autre marché refusé');
select throws_ok($$ update marches set logo_maitre_ouvrage = (select id from t_ids where cle = 'srm') || '/maitre_ouvrage.svg'
                     where id = (select id from t_ids where cle = 'srm') $$,
  '23514', null, 'extension autre que png / jpg refusée');
select throws_ok($$ update marches set logo_titulaire = (select id from t_ids where cle = 'srm') || '/maitre_ouvrage.png'
                     where id = (select id from t_ids where cle = 'srm') $$,
  '23514', null, 'logo du titulaire : seul le nom « titulaire » est admis');

-- -----------------------------------------------------------------------------
-- 2. Responsable SRM : envoie, remplace, enregistre ; noms et dossier imposés
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    select 'logos', id || '/titulaire.png', '00000000-0000-0000-0000-00000000000d' from t_ids where cle = 'srm' $$,
  'responsable : envoie le logo du titulaire');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    select 'logos', id || '/maitre_ouvrage.jpg', '00000000-0000-0000-0000-00000000000d' from t_ids where cle = 'srm' $$,
  'responsable : envoie le logo du maître d''ouvrage (JPEG)');
select lives_ok($$ update marches set logo_titulaire = id || '/titulaire.png', logo_maitre_ouvrage = id || '/maitre_ouvrage.jpg'
                    where id = (select id from t_ids where cle = 'srm') $$,
  'responsable : enregistre les chemins dans la fiche du marché');
select lives_ok($$ update storage.objects set metadata = '{"remplace": true}'
                    where bucket_id = 'logos' and name = (select id from t_ids where cle = 'srm') || '/titulaire.png' $$,
  'responsable : remplace le logo (upsert)');
select is((select count(*)::int from storage.objects where bucket_id = 'logos'), 2, 'responsable : lit les deux logos de son marché');
select throws_ok($$ insert into storage.objects (bucket_id, name) select 'logos', id || '/autre.png' from t_ids where cle = 'srm' $$,
  '42501', null, 'responsable : nom de fichier libre refusé');
select throws_ok($$ insert into storage.objects (bucket_id, name) select 'logos', id || '/titulaire.svg' from t_ids where cle = 'srm' $$,
  '42501', null, 'responsable : fichier SVG refusé');
select throws_ok($$ insert into storage.objects (bucket_id, name) select 'logos', id || '/sous/titulaire.png' from t_ids where cle = 'srm' $$,
  '42501', null, 'responsable : sous-dossier refusé');
select throws_ok($$ insert into storage.objects (bucket_id, name) select 'logos', id || '/titulaire.png' from t_ids where cle = 'demo' $$,
  '42501', null, 'responsable SRM : n''écrit pas dans le dossier du marché DEMO');
reset role;

select results_eq($$ select logo_titulaire, logo_maitre_ouvrage from marches where id = (select id from t_ids where cle = 'srm') $$,
  $$ select id || '/titulaire.png', id || '/maitre_ouvrage.jpg' from t_ids where cle = 'srm' $$,
  'fiche SRM : chemins des deux logos enregistrés');
select is((select metadata ->> 'remplace' from storage.objects
            where bucket_id = 'logos' and name = (select id from t_ids where cle = 'srm') || '/titulaire.png'),
  'true', 'remplacement appliqué');

-- -----------------------------------------------------------------------------
-- 3. Isolation : le responsable DEMO ne voit ni ne touche les logos du SRM
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'logos'), 0, 'responsable DEMO : ne lit pas les logos du SRM');
select throws_ok($$ insert into storage.objects (bucket_id, name) select 'logos', id || '/maitre_ouvrage.png' from t_ids where cle = 'srm' $$,
  '42501', null, 'responsable DEMO : n''envoie pas de logo au SRM');
select lives_ok($$ update marches set logo_titulaire = null where id = (select id from t_ids where cle = 'srm') $$,
  'responsable DEMO : retirer le logo du SRM n''échoue pas mais ne touche aucune ligne');
select lives_ok($$ delete from storage.objects where bucket_id = 'logos' $$,
  'responsable DEMO : supprimer les logos ne touche pas ceux du SRM');
select lives_ok($$ insert into storage.objects (bucket_id, name) select 'logos', id || '/titulaire.png' from t_ids where cle = 'demo' $$,
  'responsable DEMO : envoie le logo de son propre marché');
reset role;

-- -----------------------------------------------------------------------------
-- 4. Agents de terrain refusés ; lecteur des exports : lecture seule
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'logos'), 0, 'détection : ne lit pas les logos');
select throws_ok($$ insert into storage.objects (bucket_id, name) select 'logos', id || '/maitre_ouvrage.png' from t_ids where cle = 'srm' $$,
  '42501', null, 'détection : n''envoie pas de logo');
select lives_ok($$ update storage.objects set metadata = '{"pirate": true}' where bucket_id = 'logos' $$,
  'détection : remplacer un logo ne touche aucune ligne');
select lives_ok($$ update marches set logo_titulaire = null, logo_maitre_ouvrage = null where id = (select id from t_ids where cle = 'srm') $$,
  'détection : retirer les logos de la fiche ne touche aucune ligne');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'logos'), 0, 'chef de réparation : ne lit pas les logos');
select lives_ok($$ delete from storage.objects where bucket_id = 'logos' $$,
  'chef de réparation : supprimer les logos ne touche aucune ligne');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
select set_eq($$ select name from storage.objects where bucket_id = 'logos' $$,
  $$ select id || '/titulaire.png' from t_ids where cle = 'srm' union all select id || '/maitre_ouvrage.jpg' from t_ids where cle = 'srm' $$,
  'droit « exports / lire » : lit les logos de son marché, pas ceux du DEMO');
select throws_ok($$ insert into storage.objects (bucket_id, name) select 'logos', id || '/maitre_ouvrage.png' from t_ids where cle = 'srm' $$,
  '42501', null, 'droit « exports / lire » : n''envoie pas de logo');
reset role;

set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'logos'), 0, 'anonyme : aucun logo');
reset role;

select results_eq($$ select count(*)::int, bool_or(metadata ? 'pirate') from storage.objects
                      where bucket_id = 'logos' and name like (select id from t_ids where cle = 'srm') || '/%' $$,
  $$ values (2, false) $$,
  'logos du SRM intacts après les essais des autres comptes');
select results_eq($$ select logo_titulaire, logo_maitre_ouvrage from marches where id = (select id from t_ids where cle = 'srm') $$,
  $$ select id || '/titulaire.png', id || '/maitre_ouvrage.jpg' from t_ids where cle = 'srm' $$,
  'fiche SRM : chemins inchangés par les autres comptes');

-- -----------------------------------------------------------------------------
-- 5. Retrait par le responsable, vue de l'administrateur, copie sans logos
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ update marches set logo_maitre_ouvrage = null where id = (select id from t_ids where cle = 'srm') $$,
  'responsable : retire le logo du maître d''ouvrage de la fiche');
select lives_ok($$ delete from storage.objects where bucket_id = 'logos'
                    and name = (select id from t_ids where cle = 'srm') || '/maitre_ouvrage.jpg' $$,
  'responsable : supprime le fichier');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select set_eq($$ select name from storage.objects where bucket_id = 'logos' $$,
  $$ select id || '/titulaire.png' from t_ids where cle in ('srm', 'demo') $$,
  'administrateur : voit les logos de tous les marchés ; fichier retiré absent');
select lives_ok($$ insert into t_ids values ('copie',
  copier_marche((select id from t_ids where cle = 'srm'), 'LOGOS-1', '4500000001', 'Marché copié')) $$,
  'administrateur : copie du marché SRM');
reset role;

select results_eq($$ select logo_titulaire, logo_maitre_ouvrage from marches where id = (select id from t_ids where cle = 'copie') $$,
  $$ values (null::text, null::text) $$,
  'copier_marche : les logos ne sont pas copiés');

select * from finish();
rollback;
