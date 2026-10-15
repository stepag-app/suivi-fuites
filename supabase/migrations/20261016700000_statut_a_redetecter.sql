-- Statut « À re-détecter » (demande d'Issam du 2026-10-14) : une réparation « non réparée » dont le motif demande une
-- re-détection (« À détecter de nouveau ») laisse la fuite ouverte et prévient l'agent de détection. Seul dans son
-- fichier : une valeur ajoutée à un type n'est utilisable qu'après la validation de la transaction qui l'ajoute
-- (utilisée par 20261016700200_redetection.sql).
alter type public.statut_fuite add value if not exists 'a_redetecter' after 'detectee';
