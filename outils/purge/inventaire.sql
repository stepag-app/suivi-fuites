-- Inventaire de la purge de mise en service (lecture seule) : nombre de lignes par table et par marché,
-- fichiers de Supabase Storage par compartiment, et quelques détails utiles à la décision d'Issam.
-- Aucune valeur n'est affichée : seulement des noms de tables et des nombres.
-- Lancé par .github/workflows/purge-mise-en-service.yml dans une transaction en lecture seule.

\if :{?srm}
\else
  \set srm '125afaed-2f52-4329-8221-758056f172e0'
\endif
\if :{?demo}
\else
  \set demo 'de000000-0000-4000-8000-000000000000'
\endif

\echo '## Lignes par table (SRM, DEMO, autres marchés)'
select format('%s.%s', n.nspname, c.relname) as "table",
       (xpath('/row/n/text()', query_to_xml(format('select count(*) filter (where marche_id = %L) as n from %I.%I', :'srm', n.nspname, c.relname), false, true, '')))[1]::text::bigint as srm,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) filter (where marche_id = %L) as n from %I.%I', :'demo', n.nspname, c.relname), false, true, '')))[1]::text::bigint as demo,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) filter (where marche_id not in (%L, %L)) as n from %I.%I', :'srm', :'demo', n.nspname, c.relname), false, true, '')))[1]::text::bigint as autres
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'p') and n.nspname in ('public', 'private')
   and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'marche_id' and not a.attisdropped)
 order by 1;

\echo '## Tables sans marché (lignes)'
select format('%s.%s', n.nspname, c.relname) as "table",
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint as lignes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'p') and n.nspname in ('public', 'private')
   and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'marche_id' and not a.attisdropped)
 order by 1;

\echo '## Marchés'
select case id when :'srm' then 'SRM' when :'demo' then 'DEMO' else 'autre' end as marche, actif,
       os_commencement_id is not null as a_os_commencement
  from public.marches order by 1;

\echo '## Comptes et affectations'
select (select count(*) from auth.users) as comptes_auth,
       (select count(*) from public.profils) as profils,
       (select count(*) from public.profils where est_admin) as administrateurs,
       (select count(*) from public.profils p where not exists (select 1 from public.affectations a where a.profil_id = p.id and a.marche_id = :'srm')) as profils_sans_srm,
       (select count(*) from public.profils p where not p.est_admin
           and exists (select 1 from public.affectations a where a.profil_id = p.id and a.marche_id = :'demo')
           and not exists (select 1 from public.affectations a where a.profil_id = p.id and a.marche_id = :'srm')) as agents_demo_seulement;

\echo '## Fichiers de Supabase Storage (compartiment, marché du premier dossier)'
select bucket_id,
       case (storage.foldername(name))[1] when :'srm' then 'SRM' when :'demo' then 'DEMO' else 'autre' end as marche,
       count(*) as fichiers,
       coalesce(sum((metadata ->> 'size')::bigint), 0) as octets
  from storage.objects
 where name not like '%.emptyFolderPlaceholder'
 group by 1, 2 order by 1, 2;

\echo '## Photos (stockage, marché)'
select stockage, case marche_id when :'srm' then 'SRM' when :'demo' then 'DEMO' else 'autre' end as marche,
       count(*) as photos, count(*) filter (where supprime_le is not null) as retirees
  from public.photos group by 1, 2 order by 1, 2;

\echo '## Fuites SRM par statut (numéro le plus haut)'
select statut::text, count(*) as fuites, count(*) filter (where supprime_le is not null) as supprimees, max(numero) as numero_max
  from public.fuites where marche_id = :'srm' group by 1 order by 1;

\echo '## Compteurs de numérotation SRM'
select cle, valeur from private.compteurs where marche_id = :'srm' order by 1;

\echo '## Balayages SRM'
select count(*) as balayages, count(*) filter (where annule_le is null) as non_annules,
       count(distinct troncon_id) as troncons, min(date_balayage) as premier_jour, max(date_balayage) as dernier_jour
  from public.balayages where marche_id = :'srm';

\echo '## Secteurs et zones SRM (état de balayage)'
select statut_balayage::text, count(*) as secteurs from public.secteurs where marche_id = :'srm' group by 1 order by 1;
select count(*) as zones, count(*) filter (where balayage_acheve_le is not null) as zones_achevees
  from public.zones where marche_id = :'srm';

\echo '## Notifications SRM (liées à une fuite ou non, par événement)'
select evenement::text, fuite_id is not null as liee_a_une_fuite, count(*) as notifications
  from public.notifications where marche_id = :'srm' group by 1, 2 order by 1, 2;

\echo '## Journal SRM par table'
select table_nom, count(*) as lignes, min(le)::date as du, max(le)::date as au
  from public.journal where marche_id = :'srm' group by 1 order by 1;

\echo '## Journal sans marché par table'
select table_nom, count(*) as lignes from public.journal where marche_id is null group by 1 order by 1;

\echo '## Débits de nuit SRM'
select (select count(*) from public.points_mesure where marche_id = :'srm') as points_mesure,
       (select count(*) from public.campagnes_debit where marche_id = :'srm') as campagnes,
       (select count(*) from public.campagnes_debit where marche_id = :'srm' and pv_chemin is not null) as campagnes_avec_pv,
       (select count(*) from public.mesures_nuit where marche_id = :'srm') as mesures;

\echo '## Suivi GPS SRM'
select (select count(*) from public.traces_gps where marche_id = :'srm') as traces,
       (select min(jour) from public.traces_gps where marche_id = :'srm') as premier_jour,
       (select max(jour) from public.traces_gps where marche_id = :'srm') as dernier_jour,
       (select count(*) from public.pauses_gps where marche_id = :'srm') as pauses,
       (select count(*) from public.suivi_gps_etats where marche_id = :'srm') as etats;

\echo '## Fournitures Dolibarr (tables communes à tous les marchés)'
select (select count(*) from public.mouvements_dolibarr) as mouvements,
       (select count(*) from public.imports_mouvements_dolibarr) as imports_mouvements,
       (select count(*) from public.envois_dolibarr) as envois,
       (select count(*) from public.produits_dolibarr) as produits,
       (select count(*) from public.produits_dolibarr where utilisable) as produits_actives;
