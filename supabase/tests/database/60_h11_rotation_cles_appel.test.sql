-- =============================================================================
-- Tests de la migration 20261022100000 (H11) : renouvellement des clés d'appel x-cle-push et x-cle-synchro.
-- Les anciennes clés sont refusées, les nouvelles acceptées ; aucune valeur n'est affichée. Transaction annulée.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

-- Sans pg_net (CI), la ligne de envoi_push n'existe pas : on la crée pour l'essai.
insert into private.envoi_push (url, cle) values ('https://exemple.test/functions/v1/envoyer-push', repeat('k', 64))
  on conflict (id) do update set cle = excluded.cle;
update private.synchro_dolibarr set cle = repeat('s', 64) where id;

select private.renouveler_cles_appel();

create temporary table t_cles as
  select (select cle from private.envoi_push) as push, (select cle from private.synchro_dolibarr) as synchro;
grant select on t_cles to service_role;

set local role service_role;
select ok(not verifier_cle_push(repeat('k', 64)), 'ancienne clé push : refusée');
select ok(not verifier_cle_synchro_dolibarr(repeat('s', 64)), 'ancienne clé de synchro Dolibarr : refusée');
select ok(verifier_cle_push((select push from t_cles)), 'nouvelle clé push : acceptée');
select ok(verifier_cle_synchro_dolibarr((select synchro from t_cles)), 'nouvelle clé de synchro Dolibarr : acceptée');
reset role;

select ok((select length(push) = 64 and length(synchro) = 64 and push <> synchro from t_cles),
  'clés neuves de 64 caractères, distinctes');
select ok(not has_function_privilege('service_role', 'private.renouveler_cles_appel()', 'execute')
          and not has_function_privilege('authenticated', 'private.renouveler_cles_appel()', 'execute')
          and not has_function_privilege('anon', 'private.renouveler_cles_appel()', 'execute'),
  'renouveler_cles_appel : réservée à la base (pg_cron)');

select * from finish();
rollback;
