-- =============================================================================
-- Rôle « Réparation » (chef_reparation) : il ne signale plus de fuite (Issam, 2026-10-11).
--
-- Le modèle du rôle accordait « fuites / créer » et « fuites / modifier (siennes) » : un compte
-- Réparation seul voyait « Nouvelle fuite » sur la tablette et la base acceptait la fuite.
-- Chaque rôle de terrain ne saisit que son étape : Détection → fuites, Réparation → réparations,
-- Réfection → réfections ; un compte qui a plusieurs rôles (cases cochées dans Utilisateurs)
-- cumule leurs étapes. Le statut de la fuite suit la réparation par une fonction serveur : la
-- réparation n'a besoin d'aucun droit d'écriture sur la fuite.
--
--  1. Modèle « chef_reparation / fuites » : lecture seule, comme « refection / fuites ».
--  2. Droits en place : « fuites / créer » et « fuites / modifier » ramenés au plus large de ce que
--     donnent les rôles du compte dans le marché (un compte Détection ou Responsable les garde).
-- =============================================================================

insert into public.modeles_droits (role, type_donnee, lire, creer, modifier, supprimer, valider) values
  ('chef_reparation', 'fuites', true, false, 'non', 'non', false)
on conflict (role, type_donnee) do update
  set lire = excluded.lire, creer = excluded.creer, modifier = excluded.modifier,
      supprimer = excluded.supprimer, valider = excluded.valider;

with plafond as (
  select a.profil_id, a.marche_id,
         coalesce(bool_or(m.creer), false) as creer,
         coalesce(max(m.modifier), 'non') as modifier
    from public.affectations a
    left join public.modeles_droits m on m.role = any (a.roles) and m.type_donnee = 'fuites'
   group by a.profil_id, a.marche_id
)
update public.droits d
   set creer = d.creer and p.creer,
       modifier = least(d.modifier, p.modifier)
  from plafond p
 where d.profil_id = p.profil_id
   and d.marche_id = p.marche_id
   and d.type_donnee = 'fuites'
   and ((d.creer and not p.creer) or d.modifier > p.modifier);
