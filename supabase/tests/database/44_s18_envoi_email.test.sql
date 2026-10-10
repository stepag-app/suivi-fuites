-- =============================================================================
-- Chantier v3, S18 : envoi des documents par e-mail — destinataires par marché, journal des envois,
-- droits (responsable du marché et administrateur), limites du jour (marché et ensemble des marchés).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(47);

-- a admin, b agent détection, d responsable de G, e responsable de O, f responsable révoqué de G
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local', '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'det@test.local',   '{"identifiant": "det", "nom_complet": "Détection"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp@test.local',  '{"identifiant": "resp", "nom_complet": "Responsable"}'),
  ('00000000-0000-0000-0000-00000000000e', 'respo@test.local', '{"identifiant": "respo", "nom_complet": "Responsable O"}'),
  ('00000000-0000-0000-0000-00000000000f', 'revo@test.local',  '{"identifiant": "revo", "nom_complet": "Révoqué"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-G', '1', 'Marché G', 'Client G'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-O', '2', 'Marché O', 'Client O');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'bbbbbbbb-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000f', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
update affectations set roles = array['detection'] where profil_id = '00000000-0000-0000-0000-00000000000b';
update affectations set roles = array['responsable']
 where profil_id in ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000f');
update profils set actif = false where identifiant = 'revo';

-- 1. Privilèges et RLS
select ok((select relrowsecurity from pg_class where oid = 'public.destinataires_email'::regclass), 'RLS activée sur destinataires_email');
select ok((select relrowsecurity from pg_class where oid = 'public.envois_email'::regclass), 'RLS activée sur envois_email');
select ok(not has_table_privilege('anon', 'public.destinataires_email', 'select')
      and not has_table_privilege('anon', 'public.envois_email', 'select'), 'anon : aucun accès');
select ok(not has_table_privilege('authenticated', 'public.envois_email', 'insert')
      and not has_table_privilege('authenticated', 'public.envois_email', 'update')
      and not has_table_privilege('authenticated', 'public.envois_email', 'delete'), 'journal : aucune écriture directe');
select ok(has_table_privilege('authenticated', 'public.destinataires_email', 'delete'), 'carnet : suppression permise (RLS)');
select ok(not has_function_privilege('anon', 'public.reserver_envoi_email(uuid, text, text, text, text[], text, integer)', 'execute')
      and not has_function_privilege('anon', 'public.terminer_envoi_email(uuid, text, text, text)', 'execute')
      and not has_function_privilege('anon', 'public.peut_envoyer_email(uuid)', 'execute'), 'anon : aucune fonction d''envoi');
select is((select emails_par_jour from marches where code = 'TEST-G'), 20, 'limite du marché : 20 par jour par défaut');

-- 2. Qui peut envoyer
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select ok(peut_envoyer_email('aaaaaaaa-0000-0000-0000-000000000001'), 'responsable : peut envoyer pour son marché');
select ok(not peut_envoyer_email('bbbbbbbb-0000-0000-0000-000000000001'), 'responsable : pas pour un autre marché');
select ok(not peut_envoyer_email(null), 'marché absent : non');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select ok(not peut_envoyer_email('aaaaaaaa-0000-0000-0000-000000000001'), 'agent de détection : non');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);
select ok(not peut_envoyer_email('aaaaaaaa-0000-0000-0000-000000000001'), 'responsable révoqué : non');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select ok(peut_envoyer_email('bbbbbbbb-0000-0000-0000-000000000001'), 'administrateur : tous les marchés');

-- 3. Carnet des destinataires
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ insert into destinataires_email (marche_id, nom, email, organisme, par_defaut)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Suivi SRM', 'suivi@srm.test.ma', 'SRM Oriental', true) $$,
  'responsable : ajoute un destinataire à son marché');
select throws_ok($$ insert into destinataires_email (marche_id, nom, email)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Doublon', 'SUIVI@srm.test.ma') $$, '23505', null,
  'même adresse (casse ignorée) : refusée');
select throws_ok($$ insert into destinataires_email (marche_id, nom, email)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Faux', 'pas-une-adresse') $$, '23514', null,
  'adresse invalide : refusée');
select throws_ok($$ insert into destinataires_email (marche_id, nom, email)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'Autre', 'x@autre.test.ma') $$, '42501', null,
  'responsable : rien dans le carnet d''un autre marché');
select lives_ok($$ update destinataires_email set organisme = 'SRM' where email = 'suivi@srm.test.ma' $$, 'responsable : modifie');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select is((select count(*)::int from destinataires_email), 0, 'responsable d''un autre marché : ne voit pas le carnet');
select lives_ok($$ insert into destinataires_email (marche_id, nom, email)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'Bureau O', 'bureau@o.test.ma') $$, 'responsable O : son propre carnet');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select count(*)::int from destinataires_email), 0, 'agent de détection : ne voit pas le carnet');
select throws_ok($$ insert into destinataires_email (marche_id, nom, email)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Agent', 'agent@g.test.ma') $$, '42501', null,
  'agent de détection : n''ajoute rien');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is((select count(*)::int from destinataires_email), 2, 'administrateur : voit tous les carnets');
reset role;
select is((select count(*)::int from journal where table_nom = 'destinataires_email'), 3, 'carnet journalisé (deux ajouts, une modification)');
select throws_ok($$ update destinataires_email set marche_id = 'bbbbbbbb-0000-0000-0000-000000000001' where email = 'suivi@srm.test.ma' $$,
  '23514', null, 'le marché d''un destinataire est figé');

-- 4. Réserver et terminer un envoi
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'rapport_fuite', 'F-1', 'Objet',
  array['a@b.test.ma'], 'rapport.pdf', 1000) $$, '42501', null, 'agent de détection : envoi refusé');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select reserver_envoi_email('bbbbbbbb-0000-0000-0000-000000000001', 'rapport_fuite', 'F-1', 'Objet',
  array['a@b.test.ma'], 'rapport.pdf', 1000) $$, '42501', null, 'responsable : pas pour un autre marché');
select throws_ok($$ select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'rapport_fuite', 'F-1', 'Objet',
  array[]::text[], 'rapport.pdf', 1000) $$, '22023', null, 'aucun destinataire : refusé');
select throws_ok($$ select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'rapport_fuite', 'F-1', 'Objet',
  array['a1@t.ma','a2@t.ma','a3@t.ma','a4@t.ma','a5@t.ma','a6@t.ma','a7@t.ma','a8@t.ma','a9@t.ma','a10@t.ma','a11@t.ma'],
  'rapport.pdf', 1000) $$, '22023', null, 'onze destinataires : refusé');
select throws_ok($$ select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'rapport_fuite', 'F-1', 'Objet',
  array['pas une adresse'], 'rapport.pdf', 1000) $$, '22023', null, 'adresse invalide : refusée');
select throws_ok($$ select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'rapport_fuite', 'F-1', 'Objet',
  array['a@b.test.ma'], 'rapport.pdf', 5000000) $$, '22023', null, 'pièce jointe de plus de 4 Mo : refusée');
select throws_ok($$ select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'facture', 'F-1', 'Objet',
  array['a@b.test.ma'], 'rapport.pdf', 1000) $$, '23514', null, 'document inconnu : refusé');

create temp table r (id uuid) on commit drop;
grant select, insert on r to authenticated;
insert into r select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'rapport_fuite', ' F-1 ', ' Rapport F-1 ',
  array['Suivi@SRM.test.ma', 'suivi@srm.test.ma', ' chef@g.test.ma '], 'rapport.pdf', 393000);
select is((select statut from envois_email where id = (select id from r)), 'en_cours', 'envoi réservé : en cours');
select is((select destinataires from envois_email where id = (select id from r)),
  array['chef@g.test.ma', 'suivi@srm.test.ma'], 'adresses en minuscules, sans doublon');
select is((select envoye_par from envois_email where id = (select id from r)),
  '00000000-0000-0000-0000-00000000000d'::uuid, 'auteur de l''envoi : l''appelant');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select throws_ok(format($$ select terminer_envoi_email(%L, 'envoye', 'x') $$, (select id from r)), 'P0002', null,
  'un autre compte ne termine pas l''envoi');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok(format($$ select terminer_envoi_email(%L, 'en_cours') $$, (select id from r)), '22023', null, 'statut final inconnu : refusé');
select lives_ok(format($$ select terminer_envoi_email(%L, 'envoye', 're_123') $$, (select id from r)), 'auteur : termine l''envoi');
select is((select statut || ' ' || fournisseur_id from envois_email where id = (select id from r)), 'envoye re_123', 'envoyé, identifiant du fournisseur gardé');
select throws_ok(format($$ select terminer_envoi_email(%L, 'echec', null, 'x') $$, (select id from r)), 'P0002', null, 'envoi déjà terminé : refusé');

-- 5. Limite du marché : échecs non comptés
reset role;
update marches set emails_par_jour = 2 where code = 'TEST-G';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
delete from r;
insert into r select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'carte', null, 'Carte', array['a@b.test.ma'], 'carte.pdf', 2000);
select terminer_envoi_email((select id from r), 'echec', null, 'Refus du fournisseur');
select lives_ok($$ select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'carte', null, 'Carte', array['a@b.test.ma'], 'carte.pdf', 2000) $$,
  'un échec ne compte pas : deuxième envoi du jour permis');
select throws_ok($$ select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'carte', null, 'Carte', array['a@b.test.ma'], 'carte.pdf', 2000) $$,
  '23514', null, 'limite du marché atteinte (2) : refusé');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select lives_ok($$ select reserver_envoi_email('bbbbbbbb-0000-0000-0000-000000000001', 'pv_debits', null, 'PV', array['a@b.test.ma'], 'pv.pdf', 2000) $$,
  'autre marché : sa propre limite');
select is((select count(*)::int from envois_email), 1, 'responsable O : ne lit que le journal de son marché');

-- 6. Limite commune : 90 envois par jour pour l'ensemble des marchés
reset role;
insert into envois_email (marche_id, envoye_par, document, objet, destinataires, piece_nom, piece_octets, statut)
select 'bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000e', 'export', 'Essai', array['a@b.test.ma'],
       'x.pdf', 10, 'envoye'
  from generate_series(1, 86);
-- 87 + 1 (O) + 2 (G : un envoyé, un en cours) = 90 envois non échoués aujourd'hui
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select throws_ok($$ select reserver_envoi_email('bbbbbbbb-0000-0000-0000-000000000001', 'pv_debits', null, 'PV', array['a@b.test.ma'], 'pv.pdf', 2000) $$,
  '23514', null, 'limite commune atteinte : refusé même sous la limite du marché');
reset role;
update envois_email set cree_le = now() - interval '2 days' where document = 'export';

-- 7. Marché désactivé : le responsable n'envoie plus, l'administrateur si
update marches set actif = false, emails_par_jour = 20 where code = 'TEST-G';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'carte', null, 'Carte', array['a@b.test.ma'], 'carte.pdf', 2000) $$,
  '42501', null, 'marché désactivé : responsable refusé');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ select reserver_envoi_email('aaaaaaaa-0000-0000-0000-000000000001', 'carte', null, 'Carte', array['a@b.test.ma'], 'carte.pdf', 2000) $$,
  'marché désactivé : administrateur permis');
reset role;

select * from finish();
rollback;
