-- Génère (à lancer avec « psql -X -At -f ») le SQL des objets applicatifs que « supabase db dump »
-- ne peut pas exporter, parce qu'ils vivent dans les schémas gérés par Supabase (auth, storage) :
--  * les déclencheurs de auth.users dont la fonction n'est pas dans le schéma auth
--    (creer_profil_apres_inscription, migration 20261004090100) ;
--  * les règles (policies) de storage.objects et storage.buckets (photos, evenements, logos :
--    migrations 20261004090600, 20261004180100, 20261005120000).
-- Rechargé APRÈS schema.sql et donnees.sql : le déclencheur ne se déclenche donc pas pendant le
-- chargement des comptes (il créerait des profils en double).
-- Chaque objet est supprimé avant d'être recréé : le fichier peut être rejoué.

select '-- Complément applicatif des schémas auth et storage (généré par outils/sauvegarde/generer-complement.sql)';
select 'set search_path = public, extensions;';

select format('drop trigger if exists %I on auth.users;', tg.tgname) || E'\n' || pg_get_triggerdef(tg.oid) || ';'
from pg_trigger tg
join pg_proc p on p.oid = tg.tgfoid
join pg_namespace n on n.oid = p.pronamespace
where tg.tgrelid = 'auth.users'::regclass
  and not tg.tgisinternal
  and n.nspname <> 'auth'
order by tg.tgname;

select format('drop policy if exists %I on %I.%I;', policyname, schemaname, tablename) || E'\n'
       || format('create policy %I on %I.%I as %s for %s to %s%s%s;',
                 policyname, schemaname, tablename, lower(permissive), lower(cmd),
                 (select string_agg(case when r = 'public' then 'public' else quote_ident(r) end, ', ') from unnest(roles) as r),
                 coalesce(E'\n  using (' || qual || ')', ''),
                 coalesce(E'\n  with check (' || with_check || ')', ''))
from pg_policies
where schemaname = 'storage' and tablename in ('objects', 'buckets')
order by tablename, policyname;
