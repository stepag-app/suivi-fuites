-- =============================================================================
-- Lot N : photos sur Cloudflare R2. La fonction marches_photos (lue par la fonction serveur
-- photos-r2 avant de signer une URL) suit exactement les droits « photos » du compte :
-- rien sans compte ni sans affectation, le marché affecté pour un agent, tout pour l'admin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',    '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'detect.r@test.local', '{"identifiant": "detect.r", "nom_complet": "Détection R"}'),
  ('00000000-0000-0000-0000-00000000000f', 'sans.r@test.local',   '{"identifiant": "sans.r", "nom_complet": "Sans affectation"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('cccccccc-0000-0000-0000-000000000001', 'TEST-R2',   '4500000004', 'Marché R2',   'Client R2'),
  ('cccccccc-0000-0000-0000-000000000002', 'TEST-R2-B', '4500000005', 'Marché R2 B', 'Client R2');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-000000000001', 'detection');

-- Structure et privilèges
select has_function('public', 'marches_photos', array['text'], 'marches_photos(text) existe');
select ok(not has_function_privilege('anon', 'public.marches_photos(text)', 'execute'),
  'anon : ne peut pas appeler marches_photos');
select ok(has_function_privilege('authenticated', 'public.marches_photos(text)', 'execute'),
  'authenticated : peut appeler marches_photos');

-- Sans compte (aucun JWT) : rien
select is(marches_photos('lire'), '{}'::uuid[], 'sans compte : aucun marché');

set local role authenticated;

-- Agent de détection affecté : son marché, en lecture et en création, pas l'autre
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is(marches_photos('lire'), array['cccccccc-0000-0000-0000-000000000001']::uuid[],
  'détection : lit les photos de son marché seulement');
select is(marches_photos('creer'), array['cccccccc-0000-0000-0000-000000000001']::uuid[],
  'détection : dépose des photos sur son marché seulement');
select throws_ok($$ select marches_photos('modifier') $$, '22023', null,
  'action inconnue refusée');

-- Compte sans affectation : rien
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
select is(marches_photos('creer'), '{}'::uuid[], 'sans affectation : aucun marché');

-- Administrateur : tous les marchés (les deux)
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select ok(marches_photos('creer') @> array['cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002']::uuid[],
  'administrateur : dépose sur tous les marchés');

-- Marché désactivé : plus de dépôt pour l'agent (lecture gardée, lot J)
reset role;
update marches set actif = false where id = 'cccccccc-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is(marches_photos('creer'), '{}'::uuid[], 'marché désactivé : plus de dépôt pour l''agent');

select * from finish();
rollback;
