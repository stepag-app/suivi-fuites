-- =============================================================================
-- Chantier v2, S1 / fichier 1 : nouveau type de donnée « refections » (R1).
--
-- Les réfections avaient les droits des « interventions » (réparations, pièces,
-- ouvriers) : une équipe de réparation seule (sous-traitant) ne pouvait pas être
-- privée de la réfection, ni une équipe de réfection seule de la réparation.
-- Les droits existants sont recopiés dans le fichier suivant (rien ne change pour
-- les comptes actuels).
--
-- Fichier séparé : une valeur ajoutée à une énumération n'est utilisable
-- qu'après la validation de la transaction qui l'a créée.
-- =============================================================================

alter type public.type_donnee add value if not exists 'refections' after 'interventions';
