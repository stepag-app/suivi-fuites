-- =============================================================================
-- Essai de charge : fuites fictives sur le marché DEMO (base LOCALE uniquement).
--
--   psql -d charge_3000 -v nb=3000 -f outils/charge/generer-charge.sql
--
-- JAMAIS sur le projet Supabase : le script refuse de tourner si la base
-- ressemble à la production (schéma `storage` réel) ou si DEMO est absent.
--
-- Contenu (déterministe : setseed) :
--   * 8 comptes d'essai : 4 détection, 2 chefs de réparation, 1 responsable affectés à DEMO, 1 administrateur ;
--   * 40 articles Dolibarr activés (pièces posées) ;
--   * :nb fuites réparties sur les 12 derniers mois (lundi à samedi, 7 h à 18 h) et sur les
--     secteurs au prorata du nombre de tronçons, position sur un tronçon du secteur ;
--   * réparations, pièces, réfections selon l'âge de la fuite (statuts déduits par la base) ;
--   * ~4 lignes photos par fuite (aucun fichier : chemins fictifs) ;
--   * balayages : chaque jour ouvré, deux équipes de détection balaient ~4 km chacune, secteur
--     après secteur, plus 10 % de seconds passages (réseau couvert environ une fois en un an).
--
-- Les déclencheurs restent actifs (numérotation, statut, lignes de prix, journal) : la taille
-- de la base mesurée ensuite est celle qu'aurait la production.
-- =============================================================================
\set ON_ERROR_STOP on
\if :{?nb}
\else
  \set nb 3000
\endif

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'migrations') then
    raise exception 'Base Supabase réelle détectée : essai de charge refusé';
  end if;
  if not exists (select 1 from public.marches where id = 'de000000-0000-4000-8000-000000000000') then
    raise exception 'Marché DEMO absent : appliquer les migrations d''abord';
  end if;
  if not exists (select 1 from public.troncons where marche_id = 'de000000-0000-4000-8000-000000000000') then
    raise exception 'Réseau absent du marché DEMO : importer les tronçons d''abord (voir README)';
  end if;
end
$$;

select setseed(0.3000);

begin;

-- 1. Comptes d'essai -------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data)
select ('c0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'charge' || n || '@agents.stepag.ma',
       jsonb_build_object('identifiant', 'charge' || n, 'nom_complet', nom)
  from (values (1, 'Détecteur Un'), (2, 'Détecteur Deux'), (3, 'Détecteur Trois'), (4, 'Détecteur Quatre'),
               (5, 'Chef Réparation A'), (6, 'Chef Réparation B'), (7, 'Responsable Charge'), (8, 'Administrateur Charge')) v (n, nom)
on conflict (id) do nothing;
update public.profils set est_admin = true where id = 'c0000000-0000-4000-8000-000000000008';

select public.appliquer_modele_role(('c0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
                                    'de000000-0000-4000-8000-000000000000', r)
  from (values (1, 'detection'), (2, 'detection'), (3, 'detection'), (4, 'detection'),
               (5, 'chef_reparation'), (6, 'chef_reparation'), (7, 'responsable')) v (n, r);

-- 2. Articles Dolibarr activés ------------------------------------------------------
insert into public.produits_dolibarr (dolibarr_id, ref, designation, famille, utilisable, utilisable_le)
select 900000 + n, 'CHG-' || n, 'Article de charge ' || n, (array['PE', 'PEC', 'BAC', 'RACC'])[1 + n % 4], true, now()
  from generate_series(1, 40) n
on conflict (dolibarr_id) do nothing;

-- Équipes de détection de DEMO (identifiants propres à chaque base)
create temp table _eq on commit drop as
select (row_number() over (order by numero) - 1)::int as rang, id
  from public.equipes where marche_id = 'de000000-0000-4000-8000-000000000000' and type = 'detection';

-- 3. Fuites --------------------------------------------------------------------------
create temp table _tr on commit drop as
select row_number() over (order by t.reference) as rang, t.id, t.secteur_id, s.zone_id, t.geom
  from public.troncons t join public.secteurs s on s.id = t.secteur_id
 where t.marche_id = 'de000000-0000-4000-8000-000000000000' and t.actif;
create index on _tr (rang);

create temp table _f on commit drop as
with base as (
  select n,
         -- jour ouvré dans les 365 derniers jours, heure de travail (Casablanca)
         (((now() at time zone 'Africa/Casablanca')::date - (random() * 364)::int)
           + make_interval(hours => 7 + (random() * 10)::int, mins => (random() * 59)::int)) as local_ts,
         1 + floor(random() * (select count(*) from _tr))::int as rang_troncon,
         random() as p_statut, random() as p_divers, random() as p_pos
    from generate_series(1, :nb) n
)
select b.n, gen_random_uuid() as id,
       -- dimanche → samedi
       ((b.local_ts - case when extract(isodow from b.local_ts) = 7 then interval '1 day' else interval '0' end)
          at time zone 'Africa/Casablanca') as date_detection,
       t.secteur_id, t.zone_id,
       extensions.st_lineinterpolatepoint(t.geom, b.p_pos)::extensions.geography as position,
       b.p_statut, b.p_divers
  from base b join _tr t on t.rang = b.rang_troncon;
-- une détection future (heure de travail d'aujourd'hui) devient ce matin
update _f set date_detection = now() - interval '2 hours' where date_detection > now();

alter table _f add column cible text;
update _f set cible = case
  when now() - date_detection > interval '30 days' then
    case when p_statut < 0.85 then 'achevee' when p_statut < 0.92 then 'sans_reparation'
         when p_statut < 0.97 then 'reparee' else 'detectee' end
  when now() - date_detection > interval '3 days' then
    case when p_statut < 0.50 then 'achevee' when p_statut < 0.80 then 'reparee'
         when p_statut < 0.90 then 'en_reparation' else 'detectee' end
  else
    case when p_statut < 0.60 then 'detectee' when p_statut < 0.80 then 'en_reparation' else 'reparee' end
end;

insert into public.fuites (id, marche_id, reference_srm, origine, visibilite, ouvrage, methode_detection, zone_id, secteur_id,
                           equipe_id, adresse, position, precision_gps_m, date_detection, auteur_terrain_id, source_saisie,
                           date_communication_srm, validation_srm_le, validation_srm_par, avis_terrassement_srm_le, observation)
select f.id, f.marche,
       lpad((100 + (random() * 899)::int)::text, 3, '0') || '-' || lpad((random() * 999)::int::text, 3, '0') || '-'
         || lpad((random() * 999)::int::text, 3, '0'),
       case when f.p_divers < 0.45 then 'srm' else 'stepag' end::public.origine_fuite,
       case when f.p_divers < 0.6 then 'visible' else 'invisible' end::public.visibilite_fuite,
       case when f.p_divers < 0.8 then 'branchement' else 'conduite' end,
       'corrélateur acoustique',
       f.zone_id, f.secteur_id,
       (select id from _eq where rang = f.n % 4),
       'Rue d''essai n° ' || (1 + f.n % 180) || ', lot ' || (1 + f.n % 37),
       f.position, 3 + round((random() * 6)::numeric, 1), f.date_detection,
       ('c0000000-0000-4000-8000-0000000000' || lpad((1 + f.n % 4)::text, 2, '0'))::uuid, 'tablette',
       case when f.p_divers < 0.96 then f.date_detection + interval '40 minutes' end,
       case when f.cible in ('reparee', 'achevee') then f.date_detection + interval '2 days' end,
       case when f.cible in ('reparee', 'achevee') then 'Représentant SRM (essai)' end,
       f.date_detection + interval '3 hours',
       case when f.p_divers > 0.9 then 'Observation d''essai : fuite sur branchement, eau claire en surface.' end
  from (select _f.*, 'de000000-0000-4000-8000-000000000000'::uuid as marche from _f) f
 order by f.date_detection;

-- 4. Réparations ------------------------------------------------------------------------
create temp table _r on commit drop as
select gen_random_uuid() as id, f.id as fuite_id, f.n, f.cible, f.date_detection,
       least(now() - interval '10 minutes',
             f.date_detection + make_interval(hours => 2 + (random() * 46)::int + case when random() < 0.1 then 60 else 0 end)) as realisee_le,
       null::public.emplacement_fouille as emplacement,
       random() as p, random() as p_emplacement
  from _f f
 where f.cible <> 'detectee';
update _r set emplacement = case when p_emplacement < 0.55 then 'trottoir' when p_emplacement < 0.9 then 'chaussee'
                                 else 'terrain_naturel' end::public.emplacement_fouille;

insert into public.reparations (id, marche_id, fuite_id, resultat, motif_id, realisee_le, equipe_id, auteur_terrain_id,
                                source_saisie, ouvrage, materiau, diametre_mm, representant_srm, tuyau_repare,
                                robinet_pec_change, collier_pec_change, bouche_a_cle_mise_a_niveau, longueur_pe_m,
                                fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m, emplacement, observation)
select r.id, 'de000000-0000-4000-8000-000000000000', r.fuite_id,
       case r.cible when 'en_reparation' then 'en_cours' when 'sans_reparation' then 'non_reparee' else 'reparee' end::public.resultat_reparation,
       case when r.cible = 'sans_reparation'
            then (select m.id from public.motifs m where m.marche_id = 'de000000-0000-4000-8000-000000000000' and m.categorie = 'sans_reparation'
                     and m.code = (array['sondage_negatif', 'assainissement', 'refus_abonne', 'reparee_par_srm'])[1 + r.n % 4]) end,
       r.realisee_le,
       case when r.n % 2 = 0 then 'de000000-0000-4000-8000-020000000091' else 'de000000-0000-4000-8000-020000000092' end::uuid,
       ('c0000000-0000-4000-8000-0000000000' || lpad((5 + r.n % 2)::text, 2, '0'))::uuid, 'tablette',
       'branchement', 'polyethylene', (array[20, 25, 32, 40, 63, 90, 110])[1 + r.n % 7], 'Représentant SRM (essai)',
       r.p < 0.7, r.p >= 0.7 and r.p < 0.85, r.p >= 0.85, r.p < 0.2,
       case when r.p < 0.7 then round((0.5 + random() * 1.4)::numeric, 2) end,
       round((0.8 + random() * 1.2)::numeric, 2), round((0.5 + random() * 0.4)::numeric, 2), round((0.6 + random() * 0.8)::numeric, 2),
       r.emplacement,
       case when r.p > 0.95 then 'Réparation d''essai.' end
  from _r r;

insert into public.reparation_pieces (marche_id, reparation_id, quantite, produit_id, provenance)
select 'de000000-0000-4000-8000-000000000000', r.id, 1 + (random() * 2)::int, 900001 + ((r.n * 7 + k * 13) % 40), 'terrain'
  from _r r, generate_series(1, 2) k
 where r.cible in ('reparee', 'achevee');

-- 5. Réfections -------------------------------------------------------------------------
insert into public.refections (marche_id, fuite_id, reparation_id, resultat, realisee_le, nature_id, longueur_m, largeur_m,
                               equipe_id, auteur_terrain_id, source_saisie)
select 'de000000-0000-4000-8000-000000000000', r.fuite_id, r.id, 'faite',
       least(now() - interval '5 minutes', r.realisee_le + make_interval(days => 3 + (random() * 22)::int)),
       (select n.id from public.natures_refection n where n.marche_id = 'de000000-0000-4000-8000-000000000000'
         and n.code = case r.emplacement when 'chaussee' then 'enrobe_a_chaud'
                                          else (array['carreaux_ciment', 'beton'])[1 + r.n % 2] end),
       round((0.9 + random() * 1.2)::numeric, 2), round((0.6 + random() * 0.5)::numeric, 2),
       case when r.n % 2 = 0 then 'de000000-0000-4000-8000-020000000091' else 'de000000-0000-4000-8000-020000000092' end::uuid,
       ('c0000000-0000-4000-8000-0000000000' || lpad((5 + r.n % 2)::text, 2, '0'))::uuid, 'tablette'
  from _r r
 where r.cible = 'achevee' and r.emplacement <> 'terrain_naturel';

-- 6. Photos (lignes seulement) ------------------------------------------------------------
insert into public.photos (marche_id, fuite_id, type, stockage, chemin, position, prise_le, largeur_px, hauteur_px, taille_octets,
                           auteur_terrain_id)
select 'de000000-0000-4000-8000-000000000000', f.id, t.type::public.type_photo, 'supabase',
       'de000000-0000-4000-8000-000000000000/' || f.id || '/' || t.type || '-' || k || '.jpg',
       f.position, f.date_detection + make_interval(mins => 5 + k), 1600, 1200, 180000 + (random() * 120000)::int,
       ('c0000000-0000-4000-8000-0000000000' || lpad((1 + f.n % 4)::text, 2, '0'))::uuid
  from _f f
  cross join lateral (values ('detection', 1), ('detection', 2), ('avant', 3), ('apres', 4), ('refection', 5)) t (type, k)
 where f.p_divers < 0.97   -- 3 % sans photo (alerte)
   and (t.type = 'detection'
        or (t.type in ('avant', 'apres') and f.cible in ('reparee', 'achevee'))
        or (t.type = 'refection' and f.cible = 'achevee'))
   and (t.k <> 2 or f.n % 2 = 0);

-- 7. Balayages ------------------------------------------------------------------------------
create temp table _jours on commit drop as
select row_number() over (order by j) - 1 as rang, j
  from generate_series((now() at time zone 'Africa/Casablanca')::date - 364,
                       (now() at time zone 'Africa/Casablanca')::date, interval '1 day') j
 where extract(isodow from j) < 7;

create temp table _ordre on commit drop as
select row_number() over (order by s.code, extensions.st_geohash(extensions.st_startpoint(t.geom), 7)) - 1 as rang,
       t.id, t.longueur_m
  from public.troncons t join public.secteurs s on s.id = t.secteur_id
 where t.marche_id = 'de000000-0000-4000-8000-000000000000' and t.actif;

-- 2 équipes × ~4 km par jour ; avancée en mètres cumulés
create temp table _bal on commit drop as
with cumul as (
  select o.*, sum(o.longueur_m) over (order by o.rang) as m from _ordre o
)
select c.id as troncon_id, j.j::date as jour, (c.rang % 2) as equipe
  from cumul c
  join _jours j on j.rang = floor(c.m / 8000)::int;

insert into public.balayages (marche_id, troncon_id, date_balayage, balaye_le, equipe_id, agent_id, saisi_par, source_saisie, methode)
select 'de000000-0000-4000-8000-000000000000'::uuid, b.troncon_id, b.jour,
       (b.jour + make_interval(hours => 8 + (random() * 8)::int)) at time zone 'Africa/Casablanca',
       (select id from _eq where rang = b.equipe),
       ('c0000000-0000-4000-8000-0000000000' || lpad((1 + b.equipe)::text, 2, '0'))::uuid,
       ('c0000000-0000-4000-8000-0000000000' || lpad((1 + b.equipe)::text, 2, '0'))::uuid,
       'tablette'::public.source_saisie, 'ecoute'
  from _bal b
union all
select 'de000000-0000-4000-8000-000000000000', b.troncon_id, least(b.jour + 30, (now() at time zone 'Africa/Casablanca')::date),
       (least(b.jour + 30, (now() at time zone 'Africa/Casablanca')::date) + interval '10 hours') at time zone 'Africa/Casablanca',
       (select id from _eq where rang = 2), 'c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003',
       'tablette', 'correlation'
  from _bal b
 where random() < 0.10;

commit;

analyze;

select 'fuites' as objet, count(*) as lignes from public.fuites where marche_id = 'de000000-0000-4000-8000-000000000000'
union all select 'reparations', count(*) from public.reparations where marche_id = 'de000000-0000-4000-8000-000000000000'
union all select 'reparation_pieces', count(*) from public.reparation_pieces where marche_id = 'de000000-0000-4000-8000-000000000000'
union all select 'refections', count(*) from public.refections where marche_id = 'de000000-0000-4000-8000-000000000000'
union all select 'photos', count(*) from public.photos where marche_id = 'de000000-0000-4000-8000-000000000000'
union all select 'lignes_quantites', count(*) from public.lignes_quantites where marche_id = 'de000000-0000-4000-8000-000000000000'
union all select 'balayages', count(*) from public.balayages where marche_id = 'de000000-0000-4000-8000-000000000000'
union all select 'journal', count(*) from public.journal;

select statut, count(*) from public.fuites where marche_id = 'de000000-0000-4000-8000-000000000000' group by 1 order by 1;
