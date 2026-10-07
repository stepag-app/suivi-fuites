-- =============================================================================
-- Essai de charge à 3 000 fuites (docs/essai-charge-3000.md) : agrégats calculés
-- dans la base au lieu de faire descendre toutes les lignes dans le navigateur,
-- et état de balayage lu en un seul appel.
--
-- * compter_fuites(marché) : nombre de fuites par marché et par statut (onglets de
--   la liste, page des marchés) ; la page des marchés lisait jusqu'ici une ligne par
--   fuite de tous les marchés.
-- * resume_a_attacher(marché) : reste à attacher par article (tableau de bord) ; le
--   tableau de bord lisait toutes les unités fuite × article de v_a_attacher
--   (8 000 lignes en 9 appels successifs à 3 000 fuites).
-- * etat_balayage_compact(marché, secteurs) : même contenu que etat_balayage, en un
--   seul document JSON en colonnes. L'API de données plafonne toute réponse en
--   lignes à 1 000 (réglage Supabase « Max rows ») : etat_balayage, appelé sans
--   pagination par la carte, ne rendait que 1 000 tronçons balayés sur 44 000 après
--   un an de balayage, sans erreur. Un document JSON n'est pas plafonné.
--
-- Toutes en SECURITY INVOKER : la RLS de l'appelant s'applique (fuites « lire »,
-- vues security_invoker, balayage « lire »), rien n'est visible au-delà.
-- =============================================================================

create function public.compter_fuites(p_marche uuid default null)
returns table (marche_id uuid, statut public.statut_fuite, nb integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.marche_id, f.statut, count(*)::integer
    from public.fuites f
   where f.supprime_le is null
     and (p_marche is null or f.marche_id = p_marche)
   group by f.marche_id, f.statut
$$;

comment on function public.compter_fuites(uuid) is
  'Nombre de fuites non supprimées par marché et par statut (RLS de l''appelant) ; marché nul : tous les marchés visibles.';

create function public.resume_a_attacher(p_marche uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with u as (
    select v.fuite_id, v.prix_id, v.reste, v.brouillon_id
      from public.v_a_attacher v
     where v.marche_id = p_marche and v.reste <> 0
  )
  select jsonb_build_object(
    'articles', coalesce((
      select jsonb_agg(jsonb_build_object('prix_id', a.prix_id, 'reste', a.reste, 'unites', a.unites) order by a.prix_id)
        from (select u.prix_id, sum(u.reste) as reste, count(*)::integer as unites from u group by u.prix_id) a
    ), '[]'::jsonb),
    'unites', (select count(*)::integer from u),
    'fuites', (select count(distinct u.fuite_id)::integer from u),
    'unites_en_brouillon', (select count(*)::integer from u where u.brouillon_id is not null)
  )
$$;

comment on function public.resume_a_attacher(uuid) is
  'Reste à attacher du marché (v_a_attacher, RLS de l''appelant) : par article (reste, unités), unités, fuites et unités déjà dans un brouillon.';

-- Colonnes : t (tronçon), p (premier passage), d (dernier passage), n (passages),
-- e / a (rang dans equipes / agents, nul si inconnu). Ordre : identifiant du tronçon.
create function public.etat_balayage_compact(p_marche uuid, p_secteurs uuid[] default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with e as (
    select * from public.etat_balayage(p_marche, p_secteurs)
  ),
  eq as (
    select x.equipe_id, (row_number() over (order by x.equipe_id) - 1)::integer as rang
      from (select distinct e.equipe_id from e where e.equipe_id is not null) x
  ),
  ag as (
    select x.agent_id, (row_number() over (order by x.agent_id) - 1)::integer as rang
      from (select distinct e.agent_id from e where e.agent_id is not null) x
  )
  select jsonb_build_object(
    't', coalesce(jsonb_agg(e.troncon_id order by e.troncon_id), '[]'::jsonb),
    'p', coalesce(jsonb_agg(e.premier_le order by e.troncon_id), '[]'::jsonb),
    'd', coalesce(jsonb_agg(e.dernier_le order by e.troncon_id), '[]'::jsonb),
    'n', coalesce(jsonb_agg(e.nb_passages order by e.troncon_id), '[]'::jsonb),
    'e', coalesce(jsonb_agg(eq.rang order by e.troncon_id), '[]'::jsonb),
    'a', coalesce(jsonb_agg(ag.rang order by e.troncon_id), '[]'::jsonb),
    'equipes', (select coalesce(jsonb_agg(eq.equipe_id order by eq.rang), '[]'::jsonb) from eq),
    'agents', (select coalesce(jsonb_agg(ag.agent_id order by ag.rang), '[]'::jsonb) from ag)
  )
    from e
    left join eq on eq.equipe_id = e.equipe_id
    left join ag on ag.agent_id = e.agent_id
$$;

comment on function public.etat_balayage_compact(uuid, uuid[]) is
  'etat_balayage en un document JSON en colonnes (t, p, d, n, e, a, equipes, agents) : non plafonné à 1 000 lignes par l''API.';

revoke execute on function
  public.compter_fuites(uuid),
  public.resume_a_attacher(uuid),
  public.etat_balayage_compact(uuid, uuid[])
  from public, anon, authenticated;

grant execute on function
  public.compter_fuites(uuid),
  public.resume_a_attacher(uuid),
  public.etat_balayage_compact(uuid, uuid[])
  to authenticated, service_role;
