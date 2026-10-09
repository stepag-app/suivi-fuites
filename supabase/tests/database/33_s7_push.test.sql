-- =============================================================================
-- Chantier v2, S7 : envoi des notifications push Android (N2) — prise unique, jetons, clé d'appel.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'pa@test.local', '{"identifiant": "pusha", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'pb@test.local', '{"identifiant": "pushb", "nom_complet": "Agent B"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'pc@test.local', '{"identifiant": "pushc", "nom_complet": "Agent révoqué"}');
update profils set langue = 'ar' where identifiant = 'pusha';
update profils set actif = false where identifiant = 'pushc';
insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'TEST-P', '1', 'Marché P', 'Client P');
insert into fuites (id, marche_id, numero, adresse, source_saisie) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 7, 'Rue A', 'import');
insert into appareils_push (profil_id, jeton, vu_le) values
  ('00000000-0000-0000-0000-0000000000a1', 'jeton-a-ancien', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000a1', 'jeton-a-recent', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'jeton-c', now());

insert into notifications (destinataire_id, marche_id, evenement, fuite_id, titre, corps, donnees, cree_le, lue_le) values
  ('00000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'fuite_detectee',
   'aaaaaaaa-2222-0000-0000-000000000001', 'Nouvelle fuite N° 7 détectée', 'Rue A', '{"numero": 7}', now(), null),
  ('00000000-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'fuite_detectee',
   'aaaaaaaa-2222-0000-0000-000000000001', 'Nouvelle fuite N° 7 détectée', 'Rue A', '{"numero": 7}', now(), null),
  -- déjà lue, ancienne, révoqué : jamais envoyées
  ('00000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'alerte_reparation',
   'aaaaaaaa-2222-0000-0000-000000000001', 'Lue', null, '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'alerte_reparation',
   'aaaaaaaa-2222-0000-0000-000000000001', 'Ancienne', null, '{}', now() - interval '3 hours', null),
  ('00000000-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'fuite_detectee',
   'aaaaaaaa-2222-0000-0000-000000000001', 'Révoqué', null, '{}', now(), null);

-- 1. Réservé au serveur
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
select throws_ok($$ select prendre_notifications_push() $$, '42501', null, 'un compte connecté ne prend pas les notifications');
select throws_ok($$ select retirer_jetons_push(array['jeton-c']) $$, '42501', null, 'ni ne retire de jetons');
select throws_ok($$ select verifier_cle_push('x') $$, '42501', null, 'ni ne vérifie une clé');
reset role;

-- 2. Prise unique
set local role service_role;
create temp table prise on commit drop as select prendre_notifications_push() as j;
reset role;
select is((select jsonb_array_length(j) from prise), 2, 'deux notifications à envoyer (récentes, non lues, comptes actifs)');
select is((select e ->> 'langue' from prise, jsonb_array_elements(j) e where e ->> 'destinataire_id' = '00000000-0000-0000-0000-0000000000a1'),
  'ar', 'langue du destinataire jointe');
select is((select e -> 'jetons' from prise, jsonb_array_elements(j) e where e ->> 'destinataire_id' = '00000000-0000-0000-0000-0000000000a1'),
  '["jeton-a-recent", "jeton-a-ancien"]'::jsonb, 'jetons du destinataire, le plus récent d''abord');
select is((select (e ->> 'non_lues')::int from prise, jsonb_array_elements(j) e where e ->> 'destinataire_id' = '00000000-0000-0000-0000-0000000000a1'),
  2, 'nombre de notifications non lues (pastille)');
select is((select e -> 'jetons' from prise, jsonb_array_elements(j) e where e ->> 'destinataire_id' = '00000000-0000-0000-0000-0000000000b1'),
  '[]'::jsonb, 'destinataire sans appareil : aucun jeton');
select is((select count(*)::int from notifications where push_envoyee_le is not null and titre <> 'Révoqué'), 2,
  'les deux notifications prises sont marquées envoyées');
select is((select push_envoyee_le from notifications where titre = 'Ancienne'), null, 'une notification de plus de 2 h n''est pas prise');
set local role service_role;
select is(prendre_notifications_push(), '[]'::jsonb, 'second appel : rien à reprendre (pas de double envoi)');

-- 3. Jetons refusés par Firebase
select is(retirer_jetons_push(array['jeton-a-ancien', 'inconnu']), 1, 'jeton refusé retiré');

-- 4. Clé d'appel
reset role;
insert into private.envoi_push (url, cle) values ('https://exemple.test/functions/v1/envoyer-push', repeat('k', 64));
set local role service_role;
select ok(verifier_cle_push(repeat('k', 64)), 'la clé de la base est reconnue');
select ok(not verifier_cle_push('') and not verifier_cle_push(repeat('x', 64)), 'toute autre clé est refusée');
reset role;

select * from finish();
rollback;
