-- =============================================================================
-- Annuler l'import de l'historique Excel d'un marché (fuites source_saisie = 'import').
--
-- Retire les fuites importées et tout ce qui en dépend (réparations, pièces, lignes de prix,
-- notifications, journal de ces lignes), puis remet le compteur au plus grand numéro restant.
-- Les fuites saisies sur tablette ou dans le panneau ne sont jamais touchées.
--
-- Refusé si une fuite importée est attachée ou verrouillée, si une fuite non importée la cite
-- (re-détection, lien), ou si une réfection, une photo ou une réparation non importée y a été
-- ajoutée. Une fuite déjà validée bloque aussi, sauf avec -v forcer=oui.
-- Variables psql : marche (code du marché), forcer (oui / non), fin (commit / rollback).
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

select set_config('annul.marche', :'marche', true),
       set_config('annul.forcer', :'forcer', true) \gset

create temporary table annul_fuites on commit drop as
select f.id, f.numero, f.validee_le, f.verrouillee_le, f.marche_id
  from public.fuites f join public.marches m on m.id = f.marche_id
 where m.code = current_setting('annul.marche') and f.source_saisie = 'import';

do $$
declare
  _n integer;
  _x text;
begin
  select count(*) into _n from annul_fuites;
  if _n = 0 then raise exception 'Aucune fuite importée dans le marché %', current_setting('annul.marche'); end if;

  select string_agg(numero::text, ', ' order by numero) into _x from annul_fuites where verrouillee_le is not null
     or exists (select 1 from public.attachement_lignes l where l.fuite_id = annul_fuites.id);
  if _x is not null then raise exception 'Fuites attachées ou verrouillées, annulation impossible : %', _x; end if;

  select string_agg(a.numero::text, ', ' order by a.numero) into _x
    from annul_fuites a
   where exists (select 1 from public.fuites f where f.fuite_liee_id = a.id and f.source_saisie <> 'import')
      or exists (select 1 from public.refections r where r.fuite_id = a.id)
      or exists (select 1 from public.photos ph where ph.fuite_id = a.id)
      or exists (select 1 from public.reparations r where r.fuite_id = a.id and r.source_saisie <> 'import');
  if _x is not null then
    raise exception 'Travail ajouté depuis l''import (réfection, photo, réparation ou fuite liée) sur les fuites : %', _x;
  end if;

  if current_setting('annul.forcer') <> 'oui' then
    select string_agg(a.numero::text, ', ' order by a.numero) into _x
      from annul_fuites a
     where a.validee_le is not null
        or exists (select 1 from public.reparations r where r.fuite_id = a.id and r.validee_le is not null);
    if _x is not null then
      raise exception 'Fuites déjà validées (« importer.sh annuler forcer » pour les retirer quand même) : %', _x;
    end if;
  end if;
end
$$;

create temporary table annul_reparations on commit drop as
select r.id from public.reparations r join annul_fuites a on a.id = r.fuite_id;

create temporary table annul_lignes on commit drop as
select id from annul_fuites
union all select id from annul_reparations
union all select id from public.reparation_pieces where reparation_id in (select id from annul_reparations)
union all select id from public.reparation_ouvriers where reparation_id in (select id from annul_reparations)
union all select id from public.lignes_quantites where fuite_id in (select id from annul_fuites);

delete from public.notifications n
 where n.fuite_id in (select id from annul_fuites) or n.reparation_id in (select id from annul_reparations);
delete from public.lignes_quantites where fuite_id in (select id from annul_fuites);
delete from public.reparation_pieces where reparation_id in (select id from annul_reparations);
delete from public.reparation_ouvriers where reparation_id in (select id from annul_reparations);
delete from public.reparations where id in (select id from annul_reparations);
delete from public.fuites where id in (select id from annul_fuites);

-- Compteur : la prochaine fuite suit la plus grande restante (tablettes comprises)
update private.compteurs c
   set valeur = coalesce((select max(f.numero) from public.fuites f where f.marche_id = c.marche_id), 0)
 where c.cle = 'fuite' and c.marche_id = (select marche_id from annul_fuites limit 1);

-- Journal : historique des lignes retirées et lignes écrites par cette annulation
delete from public.journal j
 where j.table_nom in ('fuites', 'reparations', 'reparation_pieces', 'reparation_ouvriers', 'lignes_quantites')
   and j.ligne_id in (select id::text from annul_lignes);

\echo 'Fuites retirées :'
select count(*) as fuites, min(numero), max(numero) from annul_fuites;
\echo 'Prochain numéro de fuite :'
select c.valeur + 1 as prochain from private.compteurs c
 where c.cle = 'fuite' and c.marche_id = (select marche_id from annul_fuites limit 1);

:fin;
