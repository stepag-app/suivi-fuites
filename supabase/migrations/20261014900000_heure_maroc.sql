-- =============================================================================
-- Heure du Maroc explicite (décision d'Issam du 2026-10-10, option A).
--
-- Le Maroc est passé à UTC+0 le 2026-09-20 à 01:00 UTC (fin de l'heure GMT+1 permanente, sans heure d'été ni
-- changement pendant le ramadan ; tzdata 2026d). La base des fuseaux du PostgreSQL de Supabase (17.11, mesuré le
-- 2026-10-10) le croit encore à UTC+1 : tout calcul en `at time zone 'Africa/Casablanca'` y est faux d'une heure
-- (entre 23 h et minuit, fuites, réparations, balayages et e-mails tombaient au lendemain).
--
-- Règle unique, indépendante de la base des fuseaux du serveur :
--   * à partir du 2026-09-20 01:00 UTC : heure du Maroc = UTC ;
--   * avant : Africa/Casablanca (UTC+1, UTC+0 pendant le ramadan), que toutes les versions connaissent.
-- `private.heure_maroc`, `private.instant_maroc` et `private.jour_maroc` sont les seuls endroits où le fuseau est
-- écrit (test 47 : aucun autre objet ne doit contenir 'Africa/Casablanca'). Si le Maroc rechange d'heure, modifier
-- ces deux fonctions, et `web/src/lib/heure-maroc.ts` pour le panneau.
--
-- Les objets qui l'utilisaient sont repris tels quels de leur dernière migration, seul le calcul de l'heure change :
-- 6 fonctions, 7 vues, 2 valeurs par défaut.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Règle de l'heure du Maroc
-- -----------------------------------------------------------------------------
create function private.heure_maroc(p_instant timestamptz)
returns timestamp
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when p_instant >= timestamptz '2026-09-20 01:00:00+00' then p_instant at time zone 'UTC'
              else p_instant at time zone 'Africa/Casablanca' end
$$;

comment on function private.heure_maroc(timestamptz) is
  'Heure légale du Maroc d''un instant : UTC depuis le 2026-09-20 01:00 UTC, Africa/Casablanca avant (indépendant de la tzdata du serveur)';

create function private.instant_maroc(p_local timestamp)
returns timestamptz
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when p_local >= timestamp '2026-09-20 01:00:00' then p_local at time zone 'UTC'
              else p_local at time zone 'Africa/Casablanca' end
$$;

comment on function private.instant_maroc(timestamp) is
  'Instant d''une heure légale du Maroc (inverse de heure_maroc)';

create function private.jour_maroc(p_instant timestamptz)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  select private.heure_maroc(p_instant)::date
$$;

comment on function private.jour_maroc(timestamptz) is
  'Jour civil au Maroc d''un instant (jour_maroc(now()) : aujourd''hui au Maroc)';

revoke execute on function private.heure_maroc(timestamptz), private.instant_maroc(timestamp), private.jour_maroc(timestamptz)
  from public, anon;
-- Vues en security_invoker et valeurs par défaut : évaluées avec les droits de l'utilisateur connecté.
grant execute on function private.heure_maroc(timestamptz), private.instant_maroc(timestamp), private.jour_maroc(timestamptz)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Valeurs par défaut
-- -----------------------------------------------------------------------------
alter table public.balayages alter column date_balayage set default private.jour_maroc(now());
alter table public.prix_versions alter column date_effet set default private.jour_maroc(now());

-- -----------------------------------------------------------------------------
-- 3. Fonctions et vues (droits, commentaires et options gardés par « create or replace »)
-- -----------------------------------------------------------------------------

-- Repris de 20261009200200_non_reparee_anticipation.sql (ligne 35)
create or replace function private.generer_lignes_reparation(p_reparation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _r public.reparations;
  _date date;
begin
  select * into _r from public.reparations where id = p_reparation;
  delete from public.lignes_quantites where reparation_id = p_reparation and origine = 'auto';
  if _r.id is null or _r.supprime_le is not null or _r.resultat = 'en_cours' then
    return;
  end if;
  _date := private.jour_maroc(_r.realisee_le);

  -- Terrassement : toute fouille saisie, réparée ou non (refus de l'abonné, sondage négatif…)
  perform private.ajouter_ligne_auto(_r.marche_id, _r.fuite_id, _r.id, null,
    private.prix_famille(_r.marche_id, 'terrassement'), _r.volume_m3, _date, false);

  if _r.tuyau_repare then
    perform private.ajouter_ligne_auto(_r.marche_id, _r.fuite_id, _r.id, null,
      private.prix_famille(_r.marche_id, 'reparation_tuyau', _r.materiau, _r.diametre_mm), 1, _date, true);
  end if;
  if _r.robinet_pec_change then
    perform private.ajouter_ligne_auto(_r.marche_id, _r.fuite_id, _r.id, null,
      private.prix_famille(_r.marche_id, 'robinet_pec'), 1, _date, true);
  end if;
  if _r.collier_pec_change then
    perform private.ajouter_ligne_auto(_r.marche_id, _r.fuite_id, _r.id, null,
      private.prix_famille(_r.marche_id, 'collier_pec'), 1, _date, true);
  end if;
  -- Bouche à clé : déjà comprise dans le changement de robinet ou de collier PEC
  if _r.bouche_a_cle_mise_a_niveau and not (_r.robinet_pec_change or _r.collier_pec_change) then
    perform private.ajouter_ligne_auto(_r.marche_id, _r.fuite_id, _r.id, null,
      private.prix_famille(_r.marche_id, 'bouche_a_cle'), 1, _date, true);
  end if;
end
$$;

-- Repris de 20261004090300_fuites_interventions.sql (ligne 600)
create or replace function private.generer_lignes_refection(p_refection uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _rf public.refections;
  _prix uuid;
begin
  select * into _rf from public.refections where id = p_refection;
  delete from public.lignes_quantites where refection_id = p_refection and origine = 'auto';
  if _rf.id is null or _rf.supprime_le is not null or _rf.resultat <> 'faite' then
    return;
  end if;
  select n.prix_id into _prix from public.natures_refection n where n.id = _rf.nature_id;
  perform private.ajouter_ligne_auto(_rf.marche_id, _rf.fuite_id, null, _rf.id, _prix, _rf.surface_m2,
    private.jour_maroc(_rf.realisee_le), false);
end
$$;

-- Repris de 20261009300100_rapprochement_dolibarr.sql (ligne 147)
create or replace function private.lire_mouvements_dolibarr(p_mouvements jsonb)
returns table (
  dolibarr_id bigint, date_mouvement timestamptz, produit_dolibarr_id integer, produit_ref text,
  produit_designation text, entrepot_id integer, entrepot_libelle text, entrepot_contrepartie_id integer,
  entrepot_contrepartie text, quantite numeric, type_mouvement smallint, libelle text, code_inventaire text,
  annulation boolean, projet_id integer, bon_id integer, unite text
)
language sql
stable
set search_path = ''
as $$
  select distinct on (x.dolibarr_id)
         x.dolibarr_id,
         case
           when x.date_mouvement ~ '\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}(:?\d{2})?)$' then x.date_mouvement::timestamptz
           else private.instant_maroc(x.date_mouvement::timestamp)
         end,
         x.produit_dolibarr_id,
         nullif(btrim(x.produit_ref), ''),
         nullif(regexp_replace(btrim(x.produit_designation), '\s+', ' ', 'g'), ''),
         x.entrepot_id,
         nullif(btrim(x.entrepot_libelle), ''),
         x.entrepot_contrepartie_id,
         nullif(btrim(x.entrepot_contrepartie), ''),
         x.quantite,
         x.type_mouvement,
         nullif(btrim(x.libelle), ''),
         nullif(btrim(x.code_inventaire), ''),
         coalesce(x.annulation, coalesce(x.libelle, '') ~ ' CANCEL\s*$'),
         x.projet_id,
         x.bon_id,
         nullif(btrim(x.unite), '')
    from jsonb_to_recordset(p_mouvements)
         as x (dolibarr_id bigint, date_mouvement text, produit_dolibarr_id integer, produit_ref text,
               produit_designation text, entrepot_id integer, entrepot_libelle text,
               entrepot_contrepartie_id integer, entrepot_contrepartie text, quantite numeric,
               type_mouvement smallint, libelle text, code_inventaire text, annulation boolean,
               projet_id integer, bon_id integer, unite text)
   order by x.dolibarr_id
$$;

-- Repris de 20261011100000_suivi_gps.sql (ligne 122)
create or replace function public.ajouter_points_trace(p_marche uuid, p_points jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _recus integer;
  _ajoutes integer := 0;
  _jour date;
  _avant integer;
  _apres integer;
  _geom extensions.geometry;
  _existant extensions.geometry;
  _maintenant double precision := extract(epoch from now());
  _valides jsonb;
begin
  if _uid is null then
    raise exception 'Connexion requise' using errcode = 'insufficient_privilege';
  end if;
  if p_points is null or jsonb_typeof(p_points) <> 'array' then
    raise exception 'Liste de points attendue' using errcode = 'invalid_parameter_value';
  end if;
  _recus := jsonb_array_length(p_points);
  if _recus > 1000 then
    raise exception 'Au plus 1000 points par envoi' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (
    select 1
      from public.affectations a
      join public.profils p on p.id = a.profil_id and p.actif
      join public.marches m on m.id = a.marche_id and m.actif
     where a.profil_id = _uid and a.marche_id = p_marche and a.actif
  ) then
    raise exception 'Aucune affectation active sur ce marché' using errcode = 'insufficient_privilege';
  end if;

  -- Points valides seulement : trois nombres, coordonnées possibles, horodatage ni futur ni vieux de plus de 7 jours.
  select coalesce(jsonb_agg(jsonb_build_object('t', y.t, 'lon', y.lon, 'lat', y.lat,
                                               'jour', private.jour_maroc(to_timestamp(y.t)))), '[]'::jsonb)
    into _valides
    from (
      select distinct on (x.t) x.t, x.lon, x.lat
        from (
          select case when v.ok then (v.e ->> 0)::double precision::bigint end as t,
                 case when v.ok then (v.e ->> 1)::double precision end as lon,
                 case when v.ok then (v.e ->> 2)::double precision end as lat
            from (
              select e, case
                       when jsonb_typeof(e) <> 'array' then false
                       when jsonb_array_length(e) < 3 then false
                       when not (jsonb_typeof(e -> 0) = 'number' and jsonb_typeof(e -> 1) = 'number'
                                 and jsonb_typeof(e -> 2) = 'number') then false
                       else (e ->> 0)::numeric between 0 and 4102444800
                     end as ok
                from jsonb_array_elements(p_points) e
            ) v
        ) x
       where x.lon between -180 and 180 and x.lat between -90 and 90
         and x.t between _maintenant - 7 * 86400 and _maintenant + 600
       order by x.t
    ) y;

  for _jour in select distinct r.jour from jsonb_to_recordset(_valides) r (jour date) order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(_uid::text || p_marche::text || _jour::text, 0));

    select t.trace into _existant
      from public.traces_gps t
     where t.marche_id = p_marche and t.profil_id = _uid and t.jour = _jour;
    _avant := case when _existant is null then 0 else
      (select count(distinct extensions.st_m(d.geom)) from extensions.st_dumppoints(_existant) d) end;

    with tous as (
      select extensions.st_m(d.geom)::bigint as t, extensions.st_x(d.geom) as lon, extensions.st_y(d.geom) as lat, 0 as rang
        from extensions.st_dumppoints(_existant) d
       where _existant is not null
      union all
      select r.t, r.lon, r.lat, 1
        from jsonb_to_recordset(_valides) r (t bigint, lon double precision, lat double precision, jour date)
       where r.jour = _jour
    ), uniques as (
      select distinct on (t) t, lon, lat from tous order by t, rang
    ), points as (
      select extensions.st_setsrid(extensions.st_makepointm(lon, lat, t), 4326) as p, t
        from uniques
       union all
      select extensions.st_setsrid(extensions.st_makepointm(lon, lat, t), 4326), t
        from uniques
       where (select count(*) from uniques) = 1
    )
    select extensions.st_makeline(p order by t), (select count(*) from uniques)
      into _geom, _apres
      from points;

    _ajoutes := _ajoutes + (_apres - _avant);
    insert into public.traces_gps as g (marche_id, profil_id, jour, trace, nb_points, debut, fin, distance_m)
    values (p_marche, _uid, _jour, _geom, _apres,
            to_timestamp(extensions.st_m(extensions.st_startpoint(_geom))),
            to_timestamp(extensions.st_m(extensions.st_endpoint(_geom))),
            round(extensions.st_length(_geom::extensions.geography))::integer)
    on conflict (marche_id, profil_id, jour) do update
      set trace = excluded.trace, nb_points = excluded.nb_points, debut = excluded.debut, fin = excluded.fin,
          distance_m = excluded.distance_m;
  end loop;

  return jsonb_build_object('recus', _recus, 'ajoutes', _ajoutes, 'ignores', _recus - _ajoutes);
end
$$;

-- Repris de 20261009300100_rapprochement_dolibarr.sql (ligne 296)
create or replace function public.rapprochement_fournitures(p_marche_id uuid, p_du date default null, p_au date default null)
returns table (
  produit_id integer,
  designation text,
  famille text,
  unite text,
  dans_articles boolean,
  transfere numeric,
  consomme numeric,
  pose numeric,
  ecart numeric,
  pieces integer,
  cumul_transfere numeric,
  cumul_consomme numeric,
  cumul_pose numeric,
  cumul_ecart numeric,
  ecart_pct numeric,
  seuil_pct numeric,
  au_dela_seuil boolean,
  dernier_mouvement timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with m as (
    select mk.id, mk.entrepot_dolibarr_id, mk.seuil_ecart_fournitures_pct
      from public.marches mk
     where mk.id = p_marche_id
       and mk.id = any ((select private.marches_autorises('quantites', 'lire'))::uuid[])
  ),
  mouvements as (
    select mo.produit_dolibarr_id as produit_id,
           private.jour_maroc(mo.date_mouvement) as jour,
           mo.quantite,
           (mo.type_mouvement = 1 and not mo.annulation
            and mo.entrepot_contrepartie_id is null and mo.entrepot_contrepartie is null) as consommation,
           mo.date_mouvement
      from m
      join public.mouvements_dolibarr mo on mo.entrepot_id = m.entrepot_dolibarr_id
  ),
  mv as (
    select x.produit_id,
           coalesce(sum(x.quantite) filter (where not x.consommation and (p_du is null or x.jour >= p_du)), 0) as transfere,
           coalesce(sum(-x.quantite) filter (where x.consommation and (p_du is null or x.jour >= p_du)), 0) as consomme,
           coalesce(sum(x.quantite) filter (where not x.consommation), 0) as cumul_transfere,
           coalesce(sum(-x.quantite) filter (where x.consommation), 0) as cumul_consomme,
           max(x.date_mouvement) as dernier_mouvement
      from mouvements x
     where p_au is null or x.jour <= p_au
     group by x.produit_id
  ),
  po as (
    select p.produit_id,
           coalesce(sum(p.quantite) filter (where p_du is null or p.jour >= p_du), 0) as pose,
           (count(*) filter (where p_du is null or p.jour >= p_du))::integer as pieces,
           sum(p.quantite) as cumul_pose
      from m
      join public.v_pieces_reelles p on p.marche_id = m.id
     where p.produit_id is not null
       and (p_au is null or p.jour <= p_au)
     group by p.produit_id
  ),
  base as (
    select coalesce(mv.produit_id, po.produit_id) as produit_id,
           coalesce(mv.transfere, 0) as transfere,
           coalesce(mv.consomme, 0) as consomme,
           coalesce(po.pose, 0) as pose,
           coalesce(po.pieces, 0) as pieces,
           coalesce(mv.cumul_transfere, 0) as cumul_transfere,
           coalesce(mv.cumul_consomme, 0) as cumul_consomme,
           coalesce(po.cumul_pose, 0) as cumul_pose,
           mv.dernier_mouvement
      from mv
      full join po on po.produit_id = mv.produit_id
  )
  select b.produit_id,
         coalesce(pd.designation, snap.produit_designation, 'Produit Dolibarr ' || b.produit_id),
         coalesce(pd.famille, upper(substring(snap.produit_ref from '^[A-Za-z]+'))),
         coalesce(pd.unite, snap.unite, 'u'),
         pd.dolibarr_id is not null,
         b.transfere, b.consomme, b.pose,
         b.transfere - b.consomme - b.pose,
         b.pieces,
         b.cumul_transfere, b.cumul_consomme, b.cumul_pose,
         b.cumul_transfere - b.cumul_consomme - b.cumul_pose,
         case when b.cumul_transfere > 0
              then round((b.cumul_transfere - b.cumul_consomme - b.cumul_pose) * 100 / b.cumul_transfere, 1) end,
         m.seuil_ecart_fournitures_pct,
         case when b.cumul_transfere > 0
              then abs(b.cumul_transfere - b.cumul_consomme - b.cumul_pose) * 100 / b.cumul_transfere > m.seuil_ecart_fournitures_pct
              else b.cumul_transfere - b.cumul_consomme - b.cumul_pose <> 0 end,
         b.dernier_mouvement
    from base b
    cross join m
    left join public.produits_dolibarr pd on pd.dolibarr_id = b.produit_id
    left join lateral (
      select mo.produit_designation, mo.produit_ref, mo.unite
        from public.mouvements_dolibarr mo
       where pd.dolibarr_id is null
         and mo.entrepot_id = m.entrepot_dolibarr_id and mo.produit_dolibarr_id = b.produit_id
       order by mo.date_mouvement desc, mo.dolibarr_id desc
       limit 1
    ) snap on true
   where b.transfere <> 0 or b.consomme <> 0 or b.pose <> 0
      or b.cumul_transfere <> 0 or b.cumul_consomme <> 0 or b.cumul_pose <> 0
   order by 2, 1
$$;

-- Repris de 20261014100000_envoi_email.sql (ligne 146)
create or replace function public.reserver_envoi_email(
  p_marche uuid,
  p_document text,
  p_reference text,
  p_objet text,
  p_destinataires text[],
  p_piece_nom text,
  p_piece_octets integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _jour date := private.jour_maroc(now());
  _limite integer;
  _du_marche integer;
  _total integer;
  _adresses text[];
  _id uuid;
begin
  if auth.uid() is null or not public.peut_envoyer_email(p_marche) then
    raise exception 'Envoi par e-mail réservé au responsable du marché et à l''administrateur'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(distinct lower(btrim(a))), '{}') into _adresses
    from unnest(coalesce(p_destinataires, '{}')) a
   where btrim(a) <> '';
  if cardinality(_adresses) not between 1 and 10 then
    raise exception 'De 1 à 10 destinataires' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from unnest(_adresses) a
              where length(a) > 254 or a !~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$') then
    raise exception 'Adresse e-mail invalide' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(btrim(p_objet), '') = '' or length(p_objet) > 200 then
    raise exception 'Objet obligatoire (200 caractères au plus)' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_piece_octets, 0) not between 1 and 4194304 then
    raise exception 'Pièce jointe : 4 Mo au plus' using errcode = 'invalid_parameter_value';
  end if;

  -- Un envoi à la fois pour le décompte du jour (deux clics simultanés ne dépassent pas la limite).
  perform pg_advisory_xact_lock(hashtext('envois_email'));

  select m.emails_par_jour into _limite from public.marches m where m.id = p_marche;
  select count(*) filter (where e.marche_id = p_marche), count(*)
    into _du_marche, _total
    from public.envois_email e
   where e.statut <> 'echec'
     and e.cree_le >= private.instant_maroc(_jour::timestamp)
     and e.cree_le < private.instant_maroc((_jour + 1)::timestamp);
  if _du_marche >= _limite then
    raise exception 'Limite du jour atteinte pour ce marché (% envois)', _limite using errcode = 'check_violation';
  end if;
  if _total >= private.limite_emails_jour_total() then
    raise exception 'Limite du jour atteinte pour l''ensemble des marchés (% envois)', private.limite_emails_jour_total()
      using errcode = 'check_violation';
  end if;

  insert into public.envois_email (marche_id, envoye_par, document, reference, objet, destinataires, piece_nom, piece_octets)
  values (p_marche, auth.uid(), p_document, nullif(btrim(p_reference), ''), btrim(p_objet), _adresses,
          btrim(p_piece_nom), p_piece_octets)
  returning id into _id;
  return _id;
end
$$;

-- Repris de 20261013200000_equipes_supprimees.sql (ligne 69)
create or replace view public.v_fuites with (security_invoker = true) as
select
  f.id,
  f.marche_id,
  f.numero,
  f.reference_srm,
  f.origine,
  f.visibilite,
  f.ouvrage,
  f.statut,
  f.zone_id,
  z.libelle as zone,
  f.secteur_id,
  s.libelle as secteur,
  f.adresse,
  extensions.st_y(f.position::extensions.geometry) as latitude,
  extensions.st_x(f.position::extensions.geometry) as longitude,
  f.date_detection,
  private.jour_maroc(f.date_detection) as jour_detection,
  f.auteur_terrain_id,
  pa.nom_complet as detectee_par,
  f.source_saisie,
  f.date_communication_srm,
  f.validation_srm_le,
  f.validation_srm_par,
  f.avis_terrassement_srm_le,
  r.realisee_le as derniere_reparation_le,
  r.emplacement as emplacement_fouille,
  rf.realisee_le as derniere_refection_le,
  coalesce(ph.nb_photos, 0) as nb_photos,
  f.motif_sans_reparation_id,
  mo.libelle_fr as motif_sans_reparation,
  mo.libelle_ar as motif_sans_reparation_ar,
  f.fuite_liee_id,
  f.verrouillee_le,
  f.observation,
  f.cree_le,
  f.modifie_le,
  -- Alertes (seuils paramétrés par marché)
  (f.statut = 'detectee'
     and now() - f.date_detection > make_interval(hours => m.delai_alerte_reparation_h))
    as alerte_non_reparee,
  (m.jalons_client
     and f.date_communication_srm is null
     and private.jour_maroc(f.date_detection)
         < private.jour_maroc(now()))
    as alerte_communication_srm,
  (f.statut = 'reparee' and r.emplacement = 'chaussee'
     and now() - r.realisee_le > make_interval(days => m.delai_prealerte_refection_chaussee_j))
    as alerte_refection_chaussee,
  (f.statut = 'reparee' and r.emplacement = 'chaussee'
     and now() - r.realisee_le > make_interval(days => m.delai_refection_chaussee_j))
    as refection_chaussee_hors_delai,
  (f.statut = 'reparee' and r.emplacement is distinct from 'chaussee'
     and now() - r.realisee_le > make_interval(days => m.delai_alerte_refection_trottoir_j))
    as alerte_refection_trottoir,
  (coalesce(ph.nb_photos, 0) = 0) as alerte_sans_photo
from public.fuites f
join public.marches m on m.id = f.marche_id
left join public.zones z on z.id = f.zone_id
left join public.secteurs s on s.id = f.secteur_id
left join public.profils pa on pa.id = f.auteur_terrain_id
left join public.motifs mo on mo.id = f.motif_sans_reparation_id
left join lateral (
  select rp.realisee_le, rp.emplacement
    from public.reparations rp
   where rp.fuite_id = f.id and rp.supprime_le is null
   order by rp.realisee_le desc
   limit 1
) r on true
left join lateral (
  select max(x.realisee_le) as realisee_le
    from public.refections x
   where x.fuite_id = f.id and x.supprime_le is null
) rf on true
left join lateral (
  select count(*) as nb_photos
    from public.photos p
   where p.fuite_id = f.id and p.supprime_le is null
) ph on true
where f.supprime_le is null;

-- Repris de 20261004180100_parametres_marche_standard.sql (ligne 335)
create or replace view public.v_delai_marche with (security_invoker = true) as
with jour as (
  select private.jour_maroc(now()) as aujourd_hui
),
arrets as (
  select a.marche_id,
         sum(coalesce(a.date_reprise, greatest(j.aujourd_hui, a.date_arret)) - a.date_arret)::integer as jours,
         bool_or(a.date_reprise is null and a.date_arret <= j.aujourd_hui) as en_cours
    from public.arrets_travaux a, jour j
   where a.actif
   group by a.marche_id
),
prolongations as (
  select v.marche_id, sum(v.prolongation_jours)::integer as jours
    from public.avenants v
   where v.actif
   group by v.marche_id
)
select
  m.id as marche_id,
  m.os_commencement_id,
  m.date_commencement,
  m.duree_mois,
  m.duree_jours,
  calc.date_fin_calculee,
  m.date_fin as date_fin_saisie,
  coalesce(m.date_fin, calc.date_fin_calculee) as date_fin_initiale,
  coalesce(ar.jours, 0) as jours_arret,
  coalesce(pr.jours, 0) as jours_prolongation,
  coalesce(m.date_fin, calc.date_fin_calculee) + coalesce(ar.jours, 0) + coalesce(pr.jours, 0) as date_fin_prevue,
  coalesce(ar.en_cours, false) as arret_en_cours,
  coalesce(m.date_fin, calc.date_fin_calculee) + coalesce(ar.jours, 0) + coalesce(pr.jours, 0) - j.aujourd_hui
    as jours_restants
from public.marches m
cross join jour j
left join lateral (
  select case
    when m.date_commencement is null then null::date
    when m.duree_jours is not null then m.date_commencement + m.duree_jours - 1
    when m.duree_mois is not null then (m.date_commencement + make_interval(months => m.duree_mois))::date - 1
  end as date_fin_calculee
) calc on true
left join arrets ar on ar.marche_id = m.id
left join prolongations pr on pr.marche_id = m.id;

-- Repris de 20261013200000_equipes_supprimees.sql (ligne 649)
create or replace view public.v_balayage_journalier with (security_invoker = true) as
select
  g.marche_id,
  g.date_balayage,
  g.agent_id,
  p.nom_complet as agent,
  g.zone_id,
  z.libelle as zone,
  g.secteur_id,
  s.libelle as secteur,
  g.nb_troncons,
  g.lineaire_m,
  g.lineaire_repasse_m,
  coalesce(nn.nb_noeuds, 0)::integer as nb_noeuds,
  coalesce(f.nb_fuites, 0)::integer as nb_fuites
from (
  select b.marche_id, b.date_balayage, b.agent_id, t.zone_id, t.secteur_id,
         (count(distinct t.id) filter (where b.premier_passage))::integer as nb_troncons,
         coalesce(sum(t.longueur_m) filter (where b.premier_passage), 0)::numeric(12,2) as lineaire_m,
         coalesce(sum(t.longueur_m) filter (where not b.premier_passage), 0)::numeric(12,2) as lineaire_repasse_m
    from public.balayages b
    join public.troncons t on t.id = b.troncon_id
   where b.annule_le is null
   group by b.marche_id, b.date_balayage, b.agent_id, t.zone_id, t.secteur_id
) g
left join public.profils p on p.id = g.agent_id
left join public.zones z on z.id = g.zone_id
left join public.secteurs s on s.id = g.secteur_id
left join (
  select b.marche_id, b.date_balayage, b.agent_id, t.zone_id, t.secteur_id,
         count(distinct x.noeud_id) as nb_noeuds
    from public.balayages b
    join public.troncons t on t.id = b.troncon_id
    cross join lateral private.noeuds_extremites(t.id) x (noeud_id)
   where b.annule_le is null
   group by b.marche_id, b.date_balayage, b.agent_id, t.zone_id, t.secteur_id
) nn
  on nn.marche_id = g.marche_id
 and nn.date_balayage = g.date_balayage
 and nn.agent_id is not distinct from g.agent_id
 and nn.zone_id is not distinct from g.zone_id
 and nn.secteur_id is not distinct from g.secteur_id
left join lateral (
  select count(*) as nb_fuites
    from public.fuites f
   where g.secteur_id is not null
     and f.marche_id = g.marche_id
     and f.secteur_id = g.secteur_id
     and f.supprime_le is null
     and private.jour_maroc(f.date_detection) = g.date_balayage
) f on true;

-- Repris de 20261013200000_equipes_supprimees.sql (ligne 818)
create or replace view public.v_controles_attachement with (security_invoker = true) as
with rep as (
  select r.id, r.marche_id, r.fuite_id, r.resultat, r.motif_id, r.realisee_le, r.auteur_terrain_id, r.saisi_par,
         r.source_saisie, r.ouvrage, r.materiau, r.diametre_mm, r.representant_srm, r.representant_srm_id,
         r.tuyau_repare, r.robinet_pec_change, r.collier_pec_change, r.bouche_a_cle_mise_a_niveau,
         r.element_remplace, r.longueur_pe_m, r.fouille_longueur_m, r.fouille_largeur_m, r.fouille_profondeur_m,
         r.volume_m3, r.emplacement, r.nature_revetement_id, r.observation, r.cree_le, r.modifie_le,
         r.supprime_le, r.supprime_par, r.validee_le, r.validee_par,
         f.numero as fuite_numero, f.statut as statut_fuite, m.longueur_pe_max_m
    from public.reparations r
    join public.fuites f on f.id = r.fuite_id and f.supprime_le is null
    join public.marches m on m.id = r.marche_id
   where r.supprime_le is null
),
derniere_reparee as (
  select distinct on (rep.fuite_id) rep.fuite_id, rep.id, rep.marche_id, rep.fuite_numero
    from rep
   where rep.resultat = 'reparee'
   order by rep.fuite_id, rep.realisee_le desc
),
pieces_pec as (
  select r.fuite_id, px.famille, string_agg(distinct d.designation, ', ' order by d.designation) as designations
    from public.reparation_pieces rp
    join public.reparations r on r.id = rp.reparation_id and r.supprime_le is null
    join public.produits_dolibarr d on d.dolibarr_id = rp.produit_id
    join public.prix px on px.id = private.article_suggere(rp.marche_id, rp.produit_id)
   where rp.supprime_le is null and rp.etat = 'posee' and px.famille in ('robinet_pec', 'collier_pec')
   group by r.fuite_id, px.famille
),
cases_pec as (
  select rep.fuite_id,
         bool_or(rep.robinet_pec_change) as robinet,
         bool_or(rep.collier_pec_change) as collier
    from rep
   where rep.resultat = 'reparee'
   group by rep.fuite_id
),
sans_article as (
  select rep.id
    from rep
   where rep.resultat = 'reparee' and rep.tuyau_repare
     and exists (
       select 1 from private.v_prix_proposes pp
        where pp.reparation_id = rep.id and pp.refection_id is null
          and pp.famille = 'reparation_tuyau' and pp.prix_id is null
     )
     and not exists (
       select 1 from public.lignes_quantites l
         join public.prix p on p.id = l.prix_id
        where l.reparation_id = rep.id and l.supprime_le is null
          and (p.famille = 'reparation_tuyau' or p.hors_bordereau)
     )
),
controles as (
  -- Robinet / collier PEC : pièce posée sans la case, ou case sans la pièce
  select d.marche_id, d.fuite_id, d.fuite_numero, d.id as reparation_id, null::uuid as ligne_id,
         'robinet_pec_non_coche'::text as controle, 'avertissement'::text as gravite,
         'Robinet PEC posé, case « Robinet PEC changé » non cochée'::text as libelle,
         'Pièces posées : ' || pp.designations as detail, null::numeric as excedent, null::text as unite
    from derniere_reparee d
    join pieces_pec pp on pp.fuite_id = d.fuite_id and pp.famille = 'robinet_pec'
    join cases_pec c on c.fuite_id = d.fuite_id
   where not c.robinet
  union all
  select rep.marche_id, rep.fuite_id, rep.fuite_numero, rep.id, null,
         'robinet_pec_sans_piece', 'avertissement',
         'Case « Robinet PEC changé » cochée sans robinet PEC dans les pièces posées',
         'Ajouter la pièce posée (article Dolibarr) ou décocher la case', null, null
    from rep
   where rep.resultat = 'reparee' and rep.robinet_pec_change
     and not exists (select 1 from pieces_pec pp where pp.fuite_id = rep.fuite_id and pp.famille = 'robinet_pec')
  union all
  select d.marche_id, d.fuite_id, d.fuite_numero, d.id, null,
         'collier_pec_non_coche', 'avertissement',
         'Collier PEC posé, case « Collier PEC changé » non cochée',
         'Pièces posées : ' || pp.designations, null, null
    from derniere_reparee d
    join pieces_pec pp on pp.fuite_id = d.fuite_id and pp.famille = 'collier_pec'
    join cases_pec c on c.fuite_id = d.fuite_id
   where not c.collier
  union all
  select rep.marche_id, rep.fuite_id, rep.fuite_numero, rep.id, null,
         'collier_pec_sans_piece', 'avertissement',
         'Case « Collier PEC changé » cochée sans collier PEC dans les pièces posées',
         'Ajouter la pièce posée (article Dolibarr) ou décocher la case', null, null
    from rep
   where rep.resultat = 'reparee' and rep.collier_pec_change
     and not exists (select 1 from pieces_pec pp where pp.fuite_id = rep.fuite_id and pp.famille = 'collier_pec')
  union all
  -- Fouille sans volume sur une réparation réussie
  select rep.marche_id, rep.fuite_id, rep.fuite_numero, rep.id, null,
         'fouille_sans_volume', 'avertissement',
         'Réparation réussie sans volume de fouille',
         format('Fouille L × l × p : %s × %s × %s m',
                coalesce(private.nombre_fr(rep.fouille_longueur_m), '?'),
                coalesce(private.nombre_fr(rep.fouille_largeur_m), '?'),
                coalesce(private.nombre_fr(rep.fouille_profondeur_m), '?')),
         null, null
    from rep
   where rep.resultat = 'reparee' and coalesce(rep.volume_m3, 0) = 0
  union all
  -- Réparation réussie sans aucune ligne de prix de réparation (hors terrassement et réfection)
  select d.marche_id, d.fuite_id, d.fuite_numero, d.id, null,
         'reparation_sans_prix', 'avertissement',
         'Réparation réussie sans aucune ligne de prix de réparation',
         'Vérifier les travaux cochés (tuyau, robinet, collier, bouche à clé) ou ajouter la ligne', null, null
    from derniere_reparee d
   where not exists (
           select 1 from public.lignes_quantites l
             join public.prix p on p.id = l.prix_id
            where l.fuite_id = d.fuite_id and l.supprime_le is null
              and (p.hors_bordereau or p.famille not in ('terrassement', 'refection', 'balayage', 'maintien'))
         )
     and not exists (select 1 from rep x join sans_article s on s.id = x.id where x.fuite_id = d.fuite_id)
  union all
  -- Réfection ni faite ni close (motif) après le délai du marché : mêmes seuils que les
  -- alertes de v_fuites (chaussée : délai de réfection ; ailleurs : délai trottoir)
  select f.marche_id, f.id, f.numero, r.id, null,
         'refection_hors_delai', 'avertissement',
         'Réfection ni faite ni close (motif) après le délai du marché',
         format('Réparée le %s, délai de %s jours',
                to_char(private.heure_maroc(r.realisee_le), 'DD/MM/YYYY'),
                case when r.emplacement = 'chaussee' then m.delai_refection_chaussee_j else m.delai_alerte_refection_trottoir_j end),
         null, null
    from public.fuites f
    join public.marches m on m.id = f.marche_id
    join lateral (
      select rp.id, rp.realisee_le, rp.emplacement
        from public.reparations rp
       where rp.fuite_id = f.id and rp.supprime_le is null
       order by rp.realisee_le desc
       limit 1
    ) r on true
   where f.supprime_le is null and f.statut = 'reparee'
     and now() - r.realisee_le > make_interval(days => case when r.emplacement = 'chaussee'
                                                             then m.delai_refection_chaussee_j
                                                             else m.delai_alerte_refection_trottoir_j end)
  union all
  -- Ligne manuelle dont l'article diffère de ce que propose la règle, sans motif
  select l.marche_id, l.fuite_id, f.numero, l.reparation_id, l.id,
         'ligne_incoherente', 'alerte',
         'Article retenu différent de celui que propose la règle pour les mesures saisies, sans motif',
         format('Prix %s retenu ; la règle propose : %s', p.numero,
                coalesce(prop.numeros, 'aucun article')),
         null, null
    from public.lignes_quantites l
    join public.fuites f on f.id = l.fuite_id and f.supprime_le is null
    join public.prix p on p.id = l.prix_id
    left join lateral (
      select string_agg(distinct 'prix ' || px.numero, ', ' order by 'prix ' || px.numero) as numeros,
             bool_or(pp.prix_id = l.prix_id) as couvert
        from private.v_prix_proposes pp
        left join public.prix px on px.id = pp.prix_id
       where case
               when l.refection_id is not null then pp.refection_id = l.refection_id
               when l.reparation_id is not null then pp.reparation_id = l.reparation_id and pp.refection_id is null
               else pp.fuite_id = l.fuite_id
             end
    ) prop on true
   where l.supprime_le is null and l.origine = 'manuel'
     and nullif(btrim(l.motif_correction), '') is null
     and not coalesce(prop.couvert, false)
  union all
  -- Polyéthylène au-delà du seuil du marché (marches.longueur_pe_max_m, 2 m par défaut, Q-12)
  select rep.marche_id, rep.fuite_id, rep.fuite_numero, rep.id, null,
         'pe_superieur_2m', 'information',
         format('Polyéthylène au-delà de %s m : excédent hors bordereau, à faire valoir', private.nombre_fr(rep.longueur_pe_max_m)),
         format('%s m posés : %s m au-delà des %s m couverts par l''article de réparation',
                private.nombre_fr(rep.longueur_pe_m), private.nombre_fr(rep.longueur_pe_m - rep.longueur_pe_max_m),
                private.nombre_fr(rep.longueur_pe_max_m)),
         rep.longueur_pe_m - rep.longueur_pe_max_m, 'm'
    from rep
   where rep.resultat = 'reparee' and rep.materiau = 'polyethylene' and rep.longueur_pe_m > rep.longueur_pe_max_m
  union all
  -- Réparation sur un matériau ou un diamètre sans article (DN > 315, fonte, acier…)
  select rep.marche_id, rep.fuite_id, rep.fuite_numero, rep.id, null,
         'reparation_hors_bordereau', 'information',
         'Réparation sans article au bordereau (matériau ou diamètre) : à faire valoir',
         format('%s, diamètre %s', private.libelle_materiau(rep.materiau),
                coalesce(rep.diametre_mm || ' mm', 'non saisi')),
         null, null
    from rep
    join sans_article s on s.id = rep.id
)
select c.*
  from controles c
 where private.contexte_serveur()
    or (c.marche_id = any ((select private.marches_autorises('attachements', 'lire'))::uuid[])
        and c.marche_id = any ((select private.marches_autorises('quantites', 'lire'))::uuid[]));

-- Repris de 20261013200000_equipes_supprimees.sql (ligne 1009)
create or replace view public.v_hors_bordereau with (security_invoker = true) as
with rep as (
  select r.id, r.marche_id, r.fuite_id, r.resultat, r.motif_id, r.realisee_le, r.auteur_terrain_id, r.saisi_par,
         r.source_saisie, r.ouvrage, r.materiau, r.diametre_mm, r.representant_srm, r.representant_srm_id,
         r.tuyau_repare, r.robinet_pec_change, r.collier_pec_change, r.bouche_a_cle_mise_a_niveau,
         r.element_remplace, r.longueur_pe_m, r.fouille_longueur_m, r.fouille_largeur_m, r.fouille_profondeur_m,
         r.volume_m3, r.emplacement, r.nature_revetement_id, r.observation, r.cree_le, r.modifie_le,
         r.supprime_le, r.supprime_par, r.validee_le, r.validee_par,
         f.numero as fuite_numero, f.reference_srm, f.adresse, f.zone_id, z.libelle as zone,
         f.secteur_id, s.libelle as secteur, m.longueur_pe_max_m
    from public.reparations r
    join public.fuites f on f.id = r.fuite_id and f.supprime_le is null
    join public.marches m on m.id = r.marche_id
    left join public.zones z on z.id = f.zone_id
    left join public.secteurs s on s.id = f.secteur_id
   where r.supprime_le is null and r.resultat = 'reparee'
),
travaux as (
  select rep.marche_id, 'pe_au_dela_2m'::text as nature,
         format('Polyéthylène au-delà de %s m', private.nombre_fr(rep.longueur_pe_max_m)) as libelle,
         format('Polyéthylène %s mm : %s m posés, excédent au-delà de %s m',
                coalesce(rep.diametre_mm::text, '?'), private.nombre_fr(rep.longueur_pe_m),
                private.nombre_fr(rep.longueur_pe_max_m)) as designation,
         rep.longueur_pe_m - rep.longueur_pe_max_m as quantite, 'm'::text as unite,
         rep.id as reparation_id, null::uuid as piece_ligne_id,
         null::text as piece_provenance, null::text as piece_nature_correction
    from rep
   where rep.materiau = 'polyethylene' and rep.longueur_pe_m > rep.longueur_pe_max_m
  union all
  select rep.marche_id, 'reparation_sans_article', 'Réparation sans article au bordereau',
         format('Réparation %s, diamètre %s', private.libelle_materiau(rep.materiau),
                coalesce(rep.diametre_mm || ' mm', 'non saisi')),
         1, 'u', rep.id, null, null, null
    from rep
   where rep.tuyau_repare
     and exists (
       select 1 from private.v_prix_proposes pp
        where pp.reparation_id = rep.id and pp.refection_id is null
          and pp.famille = 'reparation_tuyau' and pp.prix_id is null
     )
     and not exists (
       select 1 from public.lignes_quantites l
         join public.prix p on p.id = l.prix_id
        where l.reparation_id = rep.id and l.supprime_le is null
          and (p.famille = 'reparation_tuyau' or p.hors_bordereau)
     )
  union all
  select rep.marche_id, 'piece_non_couverte', 'Pièce non couverte par un article',
         coalesce(d.designation, rp.designation_libre),
         rp.quantite, coalesce(d.unite, 'u'), rep.id, rp.id, rp.provenance, rp.nature_correction
    from public.reparation_pieces rp
    join rep on rep.id = rp.reparation_id
    left join public.produits_dolibarr d on d.dolibarr_id = rp.produit_id
    left join public.prix ps on ps.id = private.article_suggere(rp.marche_id, rp.produit_id)
   where rp.supprime_le is null and rp.etat = 'posee'
     and (coalesce(ps.hors_bordereau, false)
          or not exists (
            select 1 from public.lignes_quantites l
              join public.prix p on p.id = l.prix_id
             where l.fuite_id = rep.fuite_id and l.supprime_le is null
               and (p.hors_bordereau or p.famille not in ('terrassement', 'refection', 'balayage', 'maintien'))
          ))
)
select t.marche_id, t.nature, t.libelle, rep.fuite_id, rep.fuite_numero, rep.reference_srm, rep.adresse,
       rep.zone_id, rep.zone, rep.secteur_id, rep.secteur, t.reparation_id, rep.realisee_le,
       private.jour_maroc(rep.realisee_le) as jour,
       rep.materiau::text as materiau, rep.diametre_mm, t.designation, t.quantite, t.unite,
       t.piece_ligne_id, t.piece_provenance, t.piece_nature_correction
  from travaux t
  join rep on rep.id = t.reparation_id
 where private.contexte_serveur()
    or (t.marche_id = any ((select private.marches_autorises('attachements', 'lire'))::uuid[])
        and t.marche_id = any ((select private.marches_autorises('quantites', 'lire'))::uuid[]));

-- Repris de 20261013200000_equipes_supprimees.sql (ligne 266)
create or replace view public.v_pieces_reelles with (security_invoker = true) as
select
  rp.id,
  rp.marche_id,
  rp.reparation_id,
  r.fuite_id,
  f.numero as fuite_numero,
  f.reference_srm,
  f.zone_id,
  z.libelle as zone,
  f.secteur_id,
  s.libelle as secteur,
  r.auteur_terrain_id as chef_id,
  pc.nom_complet as chef,
  r.realisee_le,
  private.jour_maroc(r.realisee_le) as jour,
  rp.produit_id,
  coalesce(d.designation, rp.designation_libre) as designation,
  d.famille,
  coalesce(d.unite, 'u') as unite,
  rp.quantite,
  rp.provenance,
  rp.nature_correction,
  rp.motif_correction,
  rp.saisi_par,
  ps.nom_complet as saisi_par_nom,
  rp.cree_le as saisi_le,
  rp.remplace_piece_id,
  coalesce(da.designation, pa.designation_libre) as designation_remplacee,
  pa.quantite as quantite_remplacee
from public.reparation_pieces rp
join public.reparations r on r.id = rp.reparation_id and r.supprime_le is null
join public.fuites f on f.id = r.fuite_id and f.supprime_le is null
left join public.produits_dolibarr d on d.dolibarr_id = rp.produit_id
left join public.zones z on z.id = f.zone_id
left join public.secteurs s on s.id = f.secteur_id
left join public.profils pc on pc.id = r.auteur_terrain_id
left join public.profils ps on ps.id = rp.saisi_par
left join public.reparation_pieces pa on pa.id = rp.remplace_piece_id
left join public.produits_dolibarr da on da.dolibarr_id = pa.produit_id
where rp.supprime_le is null and rp.etat = 'posee';

-- Repris de 20261013200000_equipes_supprimees.sql (ligne 563)
create or replace view public.v_refections_dues with (security_invoker = true) as
select f.marche_id,
       f.id as fuite_id,
       f.numero as fuite_numero,
       f.reference_srm,
       f.adresse,
       f.statut,
       f.zone_id,
       f.secteur_id,
       r.id as reparation_id,
       r.resultat as resultat_reparation,
       r.realisee_le as reparee_le,
       r.validee_le as reparation_validee_le,
       r.auteur_terrain_id as chef_equipe_id,
       r.emplacement,
       r.nature_revetement_id,
       n.code as nature_code,
       n.libelle_fr as nature_libelle_fr,
       n.libelle_ar as nature_libelle_ar,
       n.prix_id as prix_refection_id,
       r.fouille_longueur_m,
       r.fouille_largeur_m,
       round(r.fouille_longueur_m * r.fouille_largeur_m, 3) as surface_fouille_m2,
       (private.jour_maroc(now()) - private.jour_maroc(r.realisee_le))
         as jours_depuis_reparation
  from public.fuites f
  cross join lateral (
    select rp.id, rp.resultat, rp.realisee_le, rp.validee_le, rp.auteur_terrain_id, rp.emplacement,
           rp.nature_revetement_id, rp.fouille_longueur_m, rp.fouille_largeur_m, rp.cree_le
      from public.reparations rp
     where rp.fuite_id = f.id and rp.supprime_le is null and private.refection_attendue(rp.id)
     order by rp.realisee_le desc, rp.cree_le desc
     limit 1
  ) r
  left join public.natures_refection n on n.id = r.nature_revetement_id
 where f.supprime_le is null
   and f.statut <> 'achevee'
   and not exists (select 1 from public.refections x
                    where x.fuite_id = f.id and x.supprime_le is null and x.cree_le >= r.cree_le);
