-- =============================================================================
-- Étape A / fichier 1 : nouveau type de donnée « evenements » (journal des
-- événements particuliers du marché : audits, réceptions, prélèvements, réunions).
--
-- Fichier séparé : une valeur ajoutée à une énumération n'est utilisable
-- qu'après la validation de la transaction qui l'a créée.
-- =============================================================================

alter type public.type_donnee add value if not exists 'evenements';
