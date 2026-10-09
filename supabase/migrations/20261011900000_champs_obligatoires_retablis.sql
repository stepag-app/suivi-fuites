-- =============================================================================
-- Champs obligatoires d'une nouvelle fuite rétablis pour SRM et DEMO (S8, 2026-10-09).
-- La suspension de 20261010200000 attendait les formulaires de la vague 2 : le panneau (S5) et l'APK (S7) saisissent
-- désormais la nature de dégradation et exigent le jeu F1. La base le contrôle de nouveau à la création.
-- Les tablettes qui n'ont pas encore la nouvelle APK ne pourront plus créer de fuite SRM / DEMO : mise à jour à faire.
-- =============================================================================

update public.marches
   set champs_obligatoires_fuite = array['reference_srm', 'secteur_id', 'ouvrage', 'visibilite', 'nature_degradation_id']
 where code in ('SRM-4500004453', 'DEMO');
