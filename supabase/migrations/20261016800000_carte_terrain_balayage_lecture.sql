-- =============================================================================
-- Carte terrain (bouton « Carte » de l'APK) : les rôles Réparation et Réfection voient les zones
-- déjà balayées, en lecture seule (Issam, 2026-10-15).
--
-- La carte terrain montre à tout agent de terrain (détection, réparation, réfection) les fuites, le
-- réseau et les tronçons balayés. Le droit « balayage » n'existait que pour la Détection (voir,
-- cocher, annuler les siens) et le Responsable : la RLS de `balayages` (et `etat_balayage_compact`,
-- SECURITY INVOKER) cachait tout balayage à un compte Réparation ou Réfection seul.
--
--  1. Modèles « chef_reparation / balayage » et « refection / balayage » : lecture seule.
--  2. Comptes déjà affectés avec l'un de ces rôles : « balayage / lire » ajouté, rien d'autre (on ne
--     retire jamais un droit, comme appliquer_modele_role ; créer, annuler et valider restent ceux des
--     autres rôles du compte). Un rôle retiré plus tard : modifier_roles recalcule depuis les modèles.
-- Tronçons, nœuds et secteurs (avec leur état de balayage) étaient déjà lisibles de tout affecté.
-- =============================================================================

insert into public.modeles_droits (role, type_donnee, lire, creer, modifier, supprimer, valider) values
  ('chef_reparation', 'balayage', true, false, 'non', 'non', false),
  ('refection',       'balayage', true, false, 'non', 'non', false)
on conflict (role, type_donnee) do update
  set lire = excluded.lire, creer = excluded.creer, modifier = excluded.modifier,
      supprimer = excluded.supprimer, valider = excluded.valider;

insert into public.droits as d (profil_id, marche_id, type_donnee, lire, creer, modifier, supprimer, valider)
select a.profil_id, a.marche_id, 'balayage'::public.type_donnee, true, false,
       'non'::public.portee_droit, 'non'::public.portee_droit, false
  from public.affectations a
 where a.roles && array['chef_reparation', 'refection']::text[]
on conflict (profil_id, marche_id, type_donnee) do update
  set lire = true
  where not d.lire;
