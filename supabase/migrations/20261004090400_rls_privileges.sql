-- =============================================================================
-- Migration 1 / fichier 5 : règles RLS et privilèges de l'API de données.
--
-- Principes :
--  * RLS activée sur toutes les tables (dans leur fichier de création) ;
--    sans règle, tout est refusé.
--  * anon : aucun privilège. authenticated : privilèges accordés table par table.
--  * Aucune suppression physique pour les données terrain : suppression logique
--    (supprime_le), contrôlée par le droit « supprimer » dans les déclencheurs.
--  * Les règles filtrent par marché ; la portée « siennes » et le verrouillage
--    sont contrôlés ligne par ligne par les déclencheurs (messages explicites).
--  * Les fonctions de sécurité sont appelées dans un « (select ...) » pour
--    n'être évaluées qu'une fois par requête.
-- =============================================================================

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Fonctions : PostgreSQL accorde EXECUTE à PUBLIC par défaut ; on le retire
-- partout, puis on accorde à authenticated seulement ce qui est nécessaire
-- (fonctions de sécurité appelées par les règles et déclencheurs, RPC).
-- À répéter dans chaque migration qui crée des fonctions.
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  private.contexte_serveur(),
  private.appel_systeme(),
  private.uuid_ou_nul(text),
  private.est_admin(),
  private.mes_marches(),
  private.marches_autorises(public.type_donnee, text),
  private.peut(uuid, public.type_donnee, text, uuid, uuid),
  private.prochain_numero(uuid, text),
  public.appliquer_modele_role(uuid, uuid, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Marchés
-- -----------------------------------------------------------------------------
create policy marches_lecture on public.marches for select to authenticated
  using (id = any ((select private.mes_marches())::uuid[]));
create policy marches_creation on public.marches for insert to authenticated
  with check ((select private.est_admin()));
create policy marches_modification on public.marches for update to authenticated
  using ((select private.est_admin())) with check ((select private.est_admin()));
grant select, insert, update on public.marches to authenticated;

-- -----------------------------------------------------------------------------
-- Profils : soi-même, les collègues des mêmes marchés, tout pour l'administrateur.
-- -----------------------------------------------------------------------------
create policy profils_lecture on public.profils for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.est_admin())
    or id in (
      select a.profil_id from public.affectations a
       where a.marche_id = any ((select private.mes_marches())::uuid[])
    )
  );
create policy profils_modification on public.profils for update to authenticated
  using (id = (select auth.uid()) or (select private.est_admin()))
  with check (id = (select auth.uid()) or (select private.est_admin()));
grant select, update on public.profils to authenticated;

-- -----------------------------------------------------------------------------
-- Affectations et droits : gérés par l'administrateur ; chacun lit les siens.
-- -----------------------------------------------------------------------------
create policy affectations_lecture on public.affectations for select to authenticated
  using (
    profil_id = (select auth.uid())
    or marche_id = any ((select private.mes_marches())::uuid[])
  );
create policy affectations_creation on public.affectations for insert to authenticated
  with check ((select private.est_admin()));
create policy affectations_modification on public.affectations for update to authenticated
  using ((select private.est_admin())) with check ((select private.est_admin()));
grant select, insert, update on public.affectations to authenticated;

create policy droits_lecture on public.droits for select to authenticated
  using (profil_id = (select auth.uid()) or (select private.est_admin()));
create policy droits_creation on public.droits for insert to authenticated
  with check ((select private.est_admin()));
create policy droits_modification on public.droits for update to authenticated
  using ((select private.est_admin())) with check ((select private.est_admin()));
create policy droits_suppression on public.droits for delete to authenticated
  using ((select private.est_admin()));
grant select, insert, update, delete on public.droits to authenticated;

create policy modeles_droits_lecture on public.modeles_droits for select to authenticated
  using (true);
create policy modeles_droits_creation on public.modeles_droits for insert to authenticated
  with check ((select private.est_admin()));
create policy modeles_droits_modification on public.modeles_droits for update to authenticated
  using ((select private.est_admin())) with check ((select private.est_admin()));
create policy modeles_droits_suppression on public.modeles_droits for delete to authenticated
  using ((select private.est_admin()));
grant select, insert, update, delete on public.modeles_droits to authenticated;

-- -----------------------------------------------------------------------------
-- Journal : lecture seule (droit « journal / lire »), écrit par déclencheur.
-- -----------------------------------------------------------------------------
create policy journal_lecture on public.journal for select to authenticated
  using (
    marche_id = any ((select private.marches_autorises('journal', 'lire'))::uuid[])
    or (select private.est_admin())
  );
grant select on public.journal to authenticated;

-- -----------------------------------------------------------------------------
-- Paramètres du marché : lisibles par tous les affectés, modifiables avec le
-- droit « parametres ». Pas de suppression : on désactive (actif = false).
-- -----------------------------------------------------------------------------
do $$
declare
  _t text;
begin
  foreach _t in array array[
    'zones', 'secteurs', 'phases', 'equipes', 'natures_refection', 'motifs',
    'catalogue_pieces', 'ordres_service'
  ] loop
    execute format($f$
      create policy %1$s_lecture on public.%1$I for select to authenticated
        using (marche_id = any ((select private.mes_marches())::uuid[]));
      create policy %1$s_creation on public.%1$I for insert to authenticated
        with check (marche_id = any ((select private.marches_autorises('parametres', 'creer'))::uuid[]));
      create policy %1$s_modification on public.%1$I for update to authenticated
        using (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]))
        with check (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]));
      grant select, insert, update on public.%1$I to authenticated;
    $f$, _t);
  end loop;
end
$$;

-- Prix : montants visibles seulement avec le droit « quantites / lire ».
create policy prix_lecture on public.prix for select to authenticated
  using (
    marche_id = any ((select private.marches_autorises('quantites', 'lire'))::uuid[])
    or marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[])
  );
create policy prix_creation on public.prix for insert to authenticated
  with check (marche_id = any ((select private.marches_autorises('parametres', 'creer'))::uuid[]));
create policy prix_modification on public.prix for update to authenticated
  using (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]))
  with check (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]));
grant select, insert, update on public.prix to authenticated;

-- Ouvriers sans compte : liste visible de tous (menu déroulant), gérée avec
-- le droit « ouvriers ».
create policy ouvriers_lecture on public.ouvriers for select to authenticated
  using (marche_id = any ((select private.mes_marches())::uuid[]));
create policy ouvriers_creation on public.ouvriers for insert to authenticated
  with check (marche_id = any ((select private.marches_autorises('ouvriers', 'creer'))::uuid[]));
create policy ouvriers_modification on public.ouvriers for update to authenticated
  using (marche_id = any ((select private.marches_autorises('ouvriers', 'modifier'))::uuid[]))
  with check (marche_id = any ((select private.marches_autorises('ouvriers', 'modifier'))::uuid[]));
grant select, insert, update on public.ouvriers to authenticated;

-- -----------------------------------------------------------------------------
-- Données terrain : fuites, interventions, quantités, photos.
-- Lecture : droit « lire » ; création : droit « creer » ;
-- mise à jour : droit « modifier », « supprimer » ou « valider » sur le marché,
-- puis contrôle fin (portée « siennes », verrou) dans les déclencheurs.
-- -----------------------------------------------------------------------------
do $$
declare
  _t text;
  _type text;
begin
  for _t, _type in
    select * from (values
      ('fuites', 'fuites'),
      ('reparations', 'interventions'),
      ('refections', 'interventions'),
      ('reparation_pieces', 'interventions'),
      ('lignes_quantites', 'quantites'),
      ('photos', 'photos')
    ) v (t, type)
  loop
    execute format($f$
      create policy %1$s_lecture on public.%1$I for select to authenticated
        using (marche_id = any ((select private.marches_autorises(%2$L, 'lire'))::uuid[]));
      create policy %1$s_creation on public.%1$I for insert to authenticated
        with check (marche_id = any ((select private.marches_autorises(%2$L, 'creer'))::uuid[]));
      create policy %1$s_modification on public.%1$I for update to authenticated
        using (
          marche_id = any ((select private.marches_autorises(%2$L, 'modifier'))::uuid[])
          or marche_id = any ((select private.marches_autorises(%2$L, 'supprimer'))::uuid[])
          or marche_id = any ((select private.marches_autorises(%2$L, 'valider'))::uuid[])
        )
        with check (
          marche_id = any ((select private.marches_autorises(%2$L, 'modifier'))::uuid[])
          or marche_id = any ((select private.marches_autorises(%2$L, 'supprimer'))::uuid[])
          or marche_id = any ((select private.marches_autorises(%2$L, 'valider'))::uuid[])
        );
      grant select, insert, update on public.%1$I to authenticated;
    $f$, _t, _type);
  end loop;
end
$$;

-- Ouvriers d'une réparation : simple liaison, retirable avec le droit « modifier ».
create policy reparation_ouvriers_lecture on public.reparation_ouvriers for select to authenticated
  using (marche_id = any ((select private.marches_autorises('interventions', 'lire'))::uuid[]));
create policy reparation_ouvriers_creation on public.reparation_ouvriers for insert to authenticated
  with check (marche_id = any ((select private.marches_autorises('interventions', 'creer'))::uuid[]));
create policy reparation_ouvriers_suppression on public.reparation_ouvriers for delete to authenticated
  using (marche_id = any ((select private.marches_autorises('interventions', 'modifier'))::uuid[]));
grant select, insert, delete on public.reparation_ouvriers to authenticated;
