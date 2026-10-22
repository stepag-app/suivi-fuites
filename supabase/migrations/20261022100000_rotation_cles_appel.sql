-- =============================================================================
-- H11 (audit de sécurité) : rotation des clés d'appel base → fonctions serveur (x-cle-push, x-cle-synchro).
--
-- Les deux clés sont tirées par la base et ne quittent jamais le schéma private : ni secret GitHub, ni secret de
-- fonction (la fonction fait vérifier la clé reçue par la base). Fixes depuis leur création, elles figurent dans
-- chaque archive de sauvegarde. renouveler_cles_appel() les tire de nouveau ; elle est appelée une fois ici, puis
-- le 1er de chaque mois à 03:07 UTC par pg_cron : une archive ne contient plus que des clés mortes au bout d'un
-- mois. Aucune valeur n'est affichée ni journalisée.
-- Un appel déjà en file dans pg_net au moment du changement part avec l'ancienne clé et reçoit 401 : il est
-- rattrapé au passage suivant (5 min pour le push, 15 min pour Dolibarr).
-- =============================================================================

create function private.renouveler_cles_appel()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.envoi_push set cle = default where id;
  update private.synchro_dolibarr set cle = default where id;
end
$$;
comment on function private.renouveler_cles_appel() is
  'Tire de nouvelles clés d''appel x-cle-push et x-cle-synchro (H11) ; pg_cron le 1er du mois à 03:07 UTC';
revoke all on function private.renouveler_cles_appel() from public, anon, authenticated, service_role;

select private.renouveler_cles_appel();

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron absent : clés d''appel à renouveler à la main (select private.renouveler_cles_appel())';
    return;
  end if;
  begin
    perform cron.schedule('rotation-cles-appel', '7 3 1 * *', 'select private.renouveler_cles_appel()');
  exception when others then
    raise notice 'pg_cron indisponible (%) : clés d''appel à renouveler à la main', sqlerrm;
  end;
end
$$;
