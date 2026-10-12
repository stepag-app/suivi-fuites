-- Purge de mise en service (S22, Z3 du chantier v3), demandée par Issam le 2026-10-12 :
-- toutes les fuites et tous les balayages d'essai effacés, marché DEMO supprimé ; le marché SRM-4500004453
-- garde son paramétrage (bordereau, zones, secteurs, réseau, motifs, ouvriers…), ses comptes et ses droits.
--
-- Exécuté par .github/workflows/purge-mise-en-service.yml (après une sauvegarde fraîche) dans UNE transaction
-- (psql --single-transaction) : en cas d'erreur, rien n'est effacé. Testé par
-- supabase/tests/database/51_purge_mise_en_service.test.sql. Ne contient ni begin ni commit.
-- Les fichiers (photos R2 et Supabase Storage, tuiles de DEMO) sont effacés ensuite par le workflow.
--
-- Variables psql obligatoires :
--   srm, demo                      identifiants des deux marchés (vérifiés contre leurs codes)
--   effacer_gps                    oui : tracés, pauses et états du suivi GPS du SRM
--   effacer_debits                 oui : campagnes et mesures de débit de nuit du SRM (points de mesure gardés)
--   effacer_evenements             oui : événements particuliers du SRM et leurs pièces jointes
--   effacer_envois_email           oui : journal des documents envoyés par e-mail depuis le SRM
--   garder_notifications_generales oui : notifications du SRM sans fuite (suivi GPS coupé…) gardées
--   affecter_agents_demo           oui : un agent affecté à DEMO seulement reçoit les mêmes rôles et droits sur le SRM

\set ON_ERROR_STOP 1

select set_config('purge.srm', :'srm', true),
       set_config('purge.demo', :'demo', true),
       set_config('purge.gps', :'effacer_gps', true),
       set_config('purge.debits', :'effacer_debits', true),
       set_config('purge.evenements', :'effacer_evenements', true),
       set_config('purge.email', :'effacer_envois_email', true),
       set_config('purge.notif_gen', :'garder_notifications_generales', true),
       set_config('purge.agents_demo', :'affecter_agents_demo', true),
       set_config('purge.journal_depuis', (select coalesce(max(id), 0)::text from public.journal), true);

set local statement_timeout = '10min';
set local lock_timeout = '30s';

-- Comptes avant purge (résumé journalisé à la fin), et garde-fous.
create temporary table purge_avant on commit drop as
select format('%s.%s', n.nspname, c.relname) as nom,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) filter (where marche_id = %L) as n from %I.%I',
          current_setting('purge.srm'), n.nspname, c.relname), false, true, '')))[1]::text::bigint as srm,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) filter (where marche_id = %L) as n from %I.%I',
          current_setting('purge.demo'), n.nspname, c.relname), false, true, '')))[1]::text::bigint as demo
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'p') and n.nspname in ('public', 'private')
   and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'marche_id' and not a.attisdropped);

do $$
declare
  _srm uuid := current_setting('purge.srm')::uuid;
  _demo uuid := current_setting('purge.demo')::uuid;
  _v text;
begin
  foreach _v in array array[current_setting('purge.gps'), current_setting('purge.debits'), current_setting('purge.evenements'),
                            current_setting('purge.email'), current_setting('purge.notif_gen'), current_setting('purge.agents_demo')] loop
    if _v not in ('oui', 'non') then
      raise exception 'Réglage de purge invalide : « % » (oui ou non attendu)', _v;
    end if;
  end loop;
  if not exists (select 1 from public.marches where id = _srm and code = 'SRM-4500004453') then
    raise exception 'Marché SRM-4500004453 introuvable sous l''identifiant %', _srm;
  end if;
  if not exists (select 1 from public.marches where id = _demo and code = 'DEMO') then
    raise exception 'Marché DEMO introuvable sous l''identifiant %', _demo;
  end if;
  if exists (select 1 from public.marches where id not in (_srm, _demo)) then
    raise exception 'Un autre marché existe : purge arrêtée (elle ne prévoit que SRM et DEMO)';
  end if;
end
$$;

-- 1. Agents affectés à DEMO seulement : mêmes rôles et droits sur le SRM (avant la suppression de DEMO).
create temporary table purge_agents_demo on commit drop as
select a.profil_id, a.roles, a.actif
  from public.affectations a
  join public.profils p on p.id = a.profil_id and not p.est_admin
 where current_setting('purge.agents_demo') = 'oui'
   and a.marche_id = current_setting('purge.demo')::uuid
   and not exists (select 1 from public.affectations s where s.profil_id = a.profil_id and s.marche_id = current_setting('purge.srm')::uuid);

insert into public.affectations (profil_id, marche_id, roles, actif)
select profil_id, current_setting('purge.srm')::uuid, roles, actif from purge_agents_demo;

insert into public.droits (profil_id, marche_id, type_donnee, lire, creer, modifier, supprimer, valider)
select d.profil_id, current_setting('purge.srm')::uuid, d.type_donnee, d.lire, d.creer, d.modifier, d.supprimer, d.valider
  from public.droits d
  join purge_agents_demo g on g.profil_id = d.profil_id
 where d.marche_id = current_setting('purge.demo')::uuid;

-- 2. Fuites et tout ce qui en dépend, dans les deux marchés.
create temporary table purge_marches on commit drop as
select unnest(array[current_setting('purge.srm')::uuid, current_setting('purge.demo')::uuid]) as id;

delete from public.notifications n
 using purge_marches m
 where n.marche_id = m.id
   and (n.marche_id = current_setting('purge.demo')::uuid
        or n.fuite_id is not null or n.reparation_id is not null or n.refection_id is not null
        or current_setting('purge.notif_gen') = 'non');
delete from public.attachement_lignes where marche_id in (select id from purge_marches);
delete from public.attachements where marche_id in (select id from purge_marches);
delete from public.photos where marche_id in (select id from purge_marches);
delete from public.lignes_quantites where marche_id in (select id from purge_marches);
delete from public.reparation_pieces where marche_id in (select id from purge_marches);
delete from public.reparation_ouvriers where marche_id in (select id from purge_marches);
delete from public.refections where marche_id in (select id from purge_marches);
delete from public.reparations where marche_id in (select id from purge_marches);
delete from public.fuites where marche_id in (select id from purge_marches);

-- 3. Balayages, puis état des secteurs et des zones du SRM remis à « À balayer ».
delete from public.balayages where marche_id in (select id from purge_marches);
select private.recalculer_statut_secteurs(array(select id from public.secteurs where marche_id = current_setting('purge.srm')::uuid));
update public.zones set balayage_acheve_le = null
 where marche_id = current_setting('purge.srm')::uuid and balayage_acheve_le is not null;

-- 4. Saisies d'essai facultatives du SRM (toujours effacées pour DEMO).
delete from public.traces_gps where marche_id = current_setting('purge.demo')::uuid
   or (marche_id = current_setting('purge.srm')::uuid and current_setting('purge.gps') = 'oui');
delete from public.pauses_gps where marche_id = current_setting('purge.demo')::uuid
   or (marche_id = current_setting('purge.srm')::uuid and current_setting('purge.gps') = 'oui');
delete from public.suivi_gps_etats where marche_id = current_setting('purge.demo')::uuid
   or (marche_id = current_setting('purge.srm')::uuid and current_setting('purge.gps') = 'oui');
delete from public.mesures_nuit where marche_id = current_setting('purge.demo')::uuid
   or (marche_id = current_setting('purge.srm')::uuid and current_setting('purge.debits') = 'oui');
delete from public.campagnes_debit where marche_id = current_setting('purge.demo')::uuid
   or (marche_id = current_setting('purge.srm')::uuid and current_setting('purge.debits') = 'oui');
delete from public.evenement_pieces where marche_id = current_setting('purge.demo')::uuid
   or (marche_id = current_setting('purge.srm')::uuid and current_setting('purge.evenements') = 'oui');
delete from public.evenements where marche_id = current_setting('purge.demo')::uuid
   or (marche_id = current_setting('purge.srm')::uuid and current_setting('purge.evenements') = 'oui');
delete from public.envois_email where marche_id = current_setting('purge.demo')::uuid
   or (marche_id = current_setting('purge.srm')::uuid and current_setting('purge.email') = 'oui');

-- 5. Numérotation du SRM : la prochaine fuite porte le N° 1, le prochain attachement le N° 1.
delete from private.compteurs
 where marche_id = current_setting('purge.srm')::uuid and cle in ('fuite', 'attachement');

-- 6. Reste du marché DEMO (paramétrage, réseau, droits), du plus dépendant au moins dépendant.
update public.marches set os_commencement_id = null where id = current_setting('purge.demo')::uuid;
delete from public.arrets_travaux where marche_id = current_setting('purge.demo')::uuid;
delete from public.categories_evenement where marche_id = current_setting('purge.demo')::uuid;
delete from public.ordres_service where marche_id = current_setting('purge.demo')::uuid;
delete from public.suggestions_articles where marche_id = current_setting('purge.demo')::uuid;
delete from public.natures_refection where marche_id = current_setting('purge.demo')::uuid;
delete from public.prix_versions where marche_id = current_setting('purge.demo')::uuid;
delete from public.prix where marche_id = current_setting('purge.demo')::uuid;
delete from public.avenants where marche_id = current_setting('purge.demo')::uuid;
delete from public.parametres_attachement where marche_id = current_setting('purge.demo')::uuid;
delete from public.modeles_export where marche_id = current_setting('purge.demo')::uuid;
delete from public.destinataires_email where marche_id = current_setting('purge.demo')::uuid;
delete from public.diametres_materiau where marche_id = current_setting('purge.demo')::uuid;
delete from public.representants_srm where marche_id = current_setting('purge.demo')::uuid;
delete from public.points_mesure where marche_id = current_setting('purge.demo')::uuid;
delete from public.noeuds where marche_id = current_setting('purge.demo')::uuid;
delete from public.troncons where marche_id = current_setting('purge.demo')::uuid;
delete from public.secteurs where marche_id = current_setting('purge.demo')::uuid;
delete from public.zones where marche_id = current_setting('purge.demo')::uuid;
delete from public.phases where marche_id = current_setting('purge.demo')::uuid;
delete from public.equipes where marche_id = current_setting('purge.demo')::uuid;
delete from public.ouvriers where marche_id = current_setting('purge.demo')::uuid;
delete from public.motifs where marche_id = current_setting('purge.demo')::uuid;
delete from public.affectations where marche_id = current_setting('purge.demo')::uuid;  -- droits en cascade
delete from private.compteurs where marche_id = current_setting('purge.demo')::uuid;

-- 7. Journal : historique des saisies effacées (fuites, réparations, photos, lots…), tout DEMO, et les lignes
-- écrites par cette purge elle-même ; l'historique du paramétrage et des comptes du SRM reste.
delete from public.journal
 where marche_id = current_setting('purge.demo')::uuid
    or (marche_id = current_setting('purge.srm')::uuid
        and (table_nom in ('fuites', 'reparations', 'reparation_ouvriers', 'reparation_pieces', 'refections',
                           'lignes_quantites', 'photos', 'attachements', 'attachement_lignes', 'balayages')
             or (table_nom in ('traces_gps', 'pauses_gps', 'suivi_gps') and current_setting('purge.gps') = 'oui')
             or (table_nom in ('campagnes_debit', 'mesures_nuit') and current_setting('purge.debits') = 'oui')
             or (table_nom in ('evenements', 'evenement_pieces') and current_setting('purge.evenements') = 'oui')
             or (table_nom = 'envois_email' and current_setting('purge.email') = 'oui')))
    or (id > current_setting('purge.journal_depuis')::bigint and le = now() and role_bd = current_user);

-- La ligne du marché elle-même : son journal pointerait vers un marché supprimé.
alter table public.marches disable trigger journaliser;
delete from public.marches where id = current_setting('purge.demo')::uuid;
alter table public.marches enable trigger journaliser;

-- 8. Contrôles : il ne doit rien rester de DEMO, ni aucune fuite, aucun balayage, aucune photo.
do $$
declare
  _demo uuid := current_setting('purge.demo')::uuid;
  _t record;
  _n bigint;
begin
  for _t in select n.nspname, c.relname
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where c.relkind in ('r', 'p') and n.nspname in ('public', 'private')
               and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'marche_id' and not a.attisdropped)
  loop
    execute format('select count(*) from %I.%I where marche_id = $1', _t.nspname, _t.relname) into _n using _demo;
    if _n > 0 then
      raise exception 'Purge incomplète : % ligne(s) de DEMO restent dans %.%', _n, _t.nspname, _t.relname;
    end if;
  end loop;
  if exists (select 1 from public.fuites) or exists (select 1 from public.balayages) or exists (select 1 from public.photos)
     or exists (select 1 from public.reparations) or exists (select 1 from public.attachements) then
    raise exception 'Purge incomplète : fuites, réparations, photos, lots ou balayages restent';
  end if;
  if exists (select 1 from public.secteurs where marche_id = current_setting('purge.srm')::uuid and statut_balayage <> 'a_balayer') then
    raise exception 'Purge incomplète : un secteur du SRM n''est pas « À balayer »';
  end if;
end
$$;

-- 9. Résumé dans le journal du SRM : nombre de lignes effacées par table et réglages appliqués.
insert into public.journal (marche_id, table_nom, ligne_id, operation, changements)
select current_setting('purge.srm')::uuid, 'purge_mise_en_service', current_setting('purge.demo'), 'suppression',
       jsonb_build_object(
         'reglages', jsonb_build_object(
           'effacer_gps', current_setting('purge.gps'), 'effacer_debits', current_setting('purge.debits'),
           'effacer_evenements', current_setting('purge.evenements'), 'effacer_envois_email', current_setting('purge.email'),
           'garder_notifications_generales', current_setting('purge.notif_gen'),
           'affecter_agents_demo', current_setting('purge.agents_demo')),
         'effacees_srm', (select coalesce(jsonb_object_agg(a.nom, a.srm - coalesce(x.n, 0)), '{}') from purge_avant a
                            left join lateral (select (xpath('/row/n/text()', query_to_xml(format('select count(*) filter (where marche_id = %L) as n from %s',
                                current_setting('purge.srm'), a.nom), false, true, '')))[1]::text::bigint as n) x on true
                           where a.srm - coalesce(x.n, 0) > 0),
         'agents_affectes_srm', (select count(*) from purge_agents_demo),
         'effacees_demo', (select jsonb_object_agg(a.nom, a.demo) from purge_avant a where a.demo > 0));

\echo 'Purge terminée : DEMO supprimé, fuites et balayages effacés.'
