-- =============================================================================
-- « Mes chiffres » et « À faire » de l'APK (demande d'Issam du 2026-10-15) : tableau de bord de l'agent de
-- terrain, par rôle et par marché, en lecture seule. Le panneau web n'est pas touché.
--
--  1. mes_chiffres(marché) : chiffres du compte connecté pour aujourd'hui, la semaine (depuis lundi) et le mois,
--     jours à l'heure du Maroc ; chiffres du marché du moment. Aucun montant, aucune quantité du bordereau, aucun
--     tracé GPS : seulement des comptes de fuites, de réparations, de réfections et le linéaire balayé.
--  2. mes_actions(marché) : actions qui attendent le compte, comme le volet « À faire » du panneau, limitées à ses
--     rôles : urgentes d'abord, puis les plus anciennes (décision d'Issam). Les travaux attachés par anticipation
--     n'y sont pas : l'attachement reste au responsable et à l'administrateur.
--
-- Rôles déduits des droits, comme les boutons de l'APK : Détection = « fuites / créer », Réparation =
-- « interventions / créer », Réfection = « réfections / créer ». Un marché désactivé (lecture seule) n'en donne
-- aucun. Les deux fonctions sont SECURITY INVOKER : la RLS de l'appelant s'applique à chaque table lue.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Étape renvoyée déjà reprise par son auteur : une modification à lui, après le renvoi, qui touche autre chose
--    que les colonnes posées par le serveur (statut recalculé, verrou, validation, renvoi). Le journal n'est lu que
--    du responsable : fonction SECURITY DEFINER qui ne répond que pour le compte connecté.
-- -----------------------------------------------------------------------------
create function private.reprise_apres_renvoi(p_table text, p_id uuid, p_renvoyee_le timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.journal j
     where j.table_nom = p_table
       and j.ligne_id = p_id::text
       and j.operation = 'modification'
       and j.utilisateur_id = auth.uid()
       and j.le > p_renvoyee_le
       and exists (
         select 1 from jsonb_object_keys(j.changements) k
          where k not in ('statut', 'modifie_le', 'verrouillee_le', 'verrouillee_par', 'validee_le', 'validee_par',
                          'renvoyee_le', 'renvoyee_par', 'motif_renvoi')
       )
  )
$$;

-- -----------------------------------------------------------------------------
-- 2. Mes chiffres
-- -----------------------------------------------------------------------------
create function public.mes_chiffres(p_marche uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with moi as (select auth.uid() as id),
  m as (
    select mk.id, mk.delai_alerte_reparation_h, mk.delai_refection_chaussee_j, mk.delai_alerte_refection_trottoir_j,
           private.jour_maroc(now()) as auj
      from public.marches mk
     where mk.id = p_marche
  ),
  periodes as (
    select 'jour' as cle, m.auj as du, m.auj as au from m
    union all
    select 'semaine', m.auj - (extract(isodow from m.auj)::integer - 1), m.auj from m
    union all
    select 'mois', date_trunc('month', m.auj)::date, m.auj from m
  ),
  -- Fuites signalées par le compte (re-détections comprises)
  detectees as (
    select private.jour_maroc(f.date_detection) as jour, f.statut in ('reparee', 'achevee') as reparee
      from public.fuites f, moi
     where f.marche_id = p_marche and f.supprime_le is null and f.auteur_terrain_id = moi.id
  ),
  -- Tronçons balayés par le compte (un tronçon repassé dans la période ne compte qu'une fois)
  balayes as (
    select b.date_balayage as jour, b.troncon_id, t.longueur_m
      from public.balayages b
      join public.troncons t on t.id = b.troncon_id, moi
     where b.marche_id = p_marche and b.annule_le is null and b.agent_id = moi.id
  ),
  -- Fuites réparées par le compte : première réparation « Réparée » de chaque fuite, délai depuis la détection
  reparees as (
    select distinct on (r.fuite_id)
           private.jour_maroc(r.realisee_le) as jour,
           r.realisee_le - f.date_detection <= make_interval(hours => m.delai_alerte_reparation_h) as dans_delai
      from public.reparations r
      join public.fuites f on f.id = r.fuite_id, moi, m
     where r.marche_id = p_marche and r.supprime_le is null and r.auteur_terrain_id = moi.id
       and r.resultat = 'reparee' and f.supprime_le is null
     order by r.fuite_id, r.realisee_le
  ),
  -- Réfections faites par le compte : délai depuis la réparation (la sienne, sinon la dernière avant la réfection),
  -- celui de la chaussée ou celui du trottoir et des autres emplacements, comme les alertes de v_fuites
  refaites as (
    select distinct on (x.fuite_id)
           private.jour_maroc(x.realisee_le) as jour,
           x.realisee_le - rp.realisee_le <= make_interval(days => case when rp.emplacement = 'chaussee'
             then m.delai_refection_chaussee_j else m.delai_alerte_refection_trottoir_j end) as dans_delai
      from public.refections x
      cross join moi
      cross join m
      left join lateral (
        select r.realisee_le, r.emplacement
          from public.reparations r
         where r.supprime_le is null
           and (r.id = x.reparation_id or (x.reparation_id is null and r.fuite_id = x.fuite_id and r.realisee_le <= x.realisee_le))
         order by r.realisee_le desc
         limit 1
      ) rp on true
     where x.marche_id = p_marche and x.supprime_le is null and x.auteur_terrain_id = moi.id and x.resultat = 'faite'
     order by x.fuite_id, x.realisee_le
  ),
  chiffres as (
    select p.cle, jsonb_build_object(
      'du', p.du,
      'au', p.au,
      'detectees', (select count(*) from detectees d where d.jour between p.du and p.au),
      'deja_reparees', (select count(*) from detectees d where d.jour between p.du and p.au and d.reparee),
      'balaye_m', (select coalesce(round(sum(t.longueur_m)), 0)
                     from (select distinct on (b.troncon_id) b.longueur_m
                             from balayes b where b.jour between p.du and p.au) t),
      'reparees', (select count(*) from reparees r where r.jour between p.du and p.au),
      'reparees_dans_delai', (select count(*) from reparees r where r.jour between p.du and p.au and r.dans_delai),
      'refections', (select count(*) from refaites r where r.jour between p.du and p.au),
      'refections_dans_delai', (select count(*) from refaites r where r.jour between p.du and p.au and r.dans_delai),
      'refections_delai_connu', (select count(*) from refaites r where r.jour between p.du and p.au and r.dans_delai is not null)
    ) as valeur
      from periodes p
  )
  select jsonb_build_object(
    'maj', now(),
    'roles', jsonb_build_object(
      'detection', private.peut(p_marche, 'fuites', 'creer'),
      'reparation', private.peut(p_marche, 'interventions', 'creer'),
      'refection', private.peut(p_marche, 'refections', 'creer')
    ),
    'delais', (select jsonb_build_object(
      'reparation_h', m.delai_alerte_reparation_h,
      'refection_chaussee_j', m.delai_refection_chaussee_j,
      'refection_trottoir_j', m.delai_alerte_refection_trottoir_j) from m),
    'periodes', (select jsonb_object_agg(c.cle, c.valeur) from chiffres c),
    'marche', (select jsonb_build_object(
      'a_redetecter', count(*) filter (where f.statut = 'a_redetecter'),
      'a_reparer', count(*) filter (where f.statut in ('detectee', 'en_reparation')),
      'a_refectionner', count(*) filter (where f.statut = 'reparee'))
      from public.fuites f
     where f.marche_id = p_marche and f.supprime_le is null)
  )
  from m
$$;

-- -----------------------------------------------------------------------------
-- 3. À faire
--    corriger_detection / corriger_reparation / corriger_refection : étape du compte renvoyée par le bureau, pas
--      encore reprise (motif joint) ; toujours urgente.
--    redetection : fuite introuvable à l'ouverture (Détection) ; toujours urgente.
--    photo : fuite du compte sans photo, pas encore close (Détection).
--    reparation / finir_reparation : fuite détectée ou réparation en cours (Réparation) ; urgente au-delà du délai
--      du marché (alerte « non réparée »).
--    refection : fuite réparée, réfection à faire (Réfection) ; urgente quand la chaussée est hors délai.
--    `depuis` : renvoi, détection ou réparation selon l'action.
-- -----------------------------------------------------------------------------
create function public.mes_actions(p_marche uuid)
returns table (
  type text, fuite_id uuid, numero_affiche text, adresse text, secteur text, latitude double precision,
  longitude double precision, urgent boolean, depuis timestamptz, motif text, emplacement text
)
language sql
stable
set search_path = ''
as $$
  with moi as (select auth.uid() as id),
  roles as (
    select private.peut(p_marche, 'fuites', 'creer') as detection,
           private.peut(p_marche, 'interventions', 'creer') as reparation,
           private.peut(p_marche, 'refections', 'creer') as refection
  ),
  v as (
    select * from public.v_fuites where marche_id = p_marche
  ),
  a as (
    select 'corriger_detection' as type, f.id, true as urgent, f.renvoyee_le as depuis, f.motif_renvoi as motif
      from public.fuites f, moi, roles
     where roles.detection and f.marche_id = p_marche and f.supprime_le is null and f.auteur_terrain_id = moi.id
       and f.renvoyee_le is not null and f.validee_le is null
       and not private.reprise_apres_renvoi('fuites', f.id, f.renvoyee_le)
    union all
    select 'redetection', v.id, true, v.date_detection, null
      from v, roles
     where roles.detection and v.statut = 'a_redetecter'
    union all
    select 'photo', v.id, false, v.date_detection, null
      from v, moi, roles
     where roles.detection and v.auteur_terrain_id = moi.id and v.alerte_sans_photo
       and v.statut in ('detectee', 'en_reparation', 'reparee')
    union all
    select 'corriger_reparation', r.fuite_id, true, r.renvoyee_le, r.motif_renvoi
      from public.reparations r, moi, roles
     where roles.reparation and r.marche_id = p_marche and r.supprime_le is null and r.auteur_terrain_id = moi.id
       and r.renvoyee_le is not null and r.validee_le is null
       and not private.reprise_apres_renvoi('reparations', r.id, r.renvoyee_le)
    union all
    select case when v.statut = 'detectee' then 'reparation' else 'finir_reparation' end, v.id, v.alerte_non_reparee,
           v.date_detection, null
      from v, roles
     where roles.reparation and v.statut in ('detectee', 'en_reparation')
    union all
    select 'corriger_refection', x.fuite_id, true, x.renvoyee_le, x.motif_renvoi
      from public.refections x, moi, roles
     where roles.refection and x.marche_id = p_marche and x.supprime_le is null and x.auteur_terrain_id = moi.id
       and x.renvoyee_le is not null and x.validee_le is null
       and not private.reprise_apres_renvoi('refections', x.id, x.renvoyee_le)
    union all
    select 'refection', v.id, v.refection_chaussee_hors_delai, v.derniere_reparation_le, null
      from v, roles
     where roles.refection and v.statut = 'reparee'
  )
  select a.type, a.id, f.numero_affiche, f.adresse, f.secteur, f.latitude, f.longitude, a.urgent, a.depuis, a.motif,
         f.emplacement_fouille::text
    from a
    join v f on f.id = a.id
   order by a.urgent desc, a.depuis asc nulls last, f.numero, a.type
   limit 500
$$;

-- -----------------------------------------------------------------------------
-- 4. Privilèges
-- -----------------------------------------------------------------------------
revoke execute on function private.reprise_apres_renvoi(text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.reprise_apres_renvoi(text, uuid, timestamptz) to authenticated, service_role;
revoke execute on function public.mes_chiffres(uuid), public.mes_actions(uuid) from public, anon;
grant execute on function public.mes_chiffres(uuid), public.mes_actions(uuid) to authenticated, service_role;
