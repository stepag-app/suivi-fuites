-- =============================================================================
-- Champs obligatoires d'une nouvelle fuite suspendus pour SRM et DEMO (2026-10-09, accord d'Issam).
-- La règle F1 (S2, 20261009200000) exige la nature de dégradation, que les formulaires actuels du panneau et de
-- l'APK ne connaissent pas encore : plus aucune fuite ne pouvait être créée. Les formulaires de la vague 2 (S5, S7)
-- l'ajoutent ; l'intégration (S8) rétablit la liste :
--   {reference_srm, secteur_id, ouvrage, visibilite, nature_degradation_id}.
-- =============================================================================

update public.marches
   set champs_obligatoires_fuite = '{}'
 where code in ('SRM-4500004453', 'DEMO');
