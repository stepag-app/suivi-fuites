-- =============================================================================
-- Droits explicites du rôle service_role (clé secrète, Edge Functions, côté
-- serveur uniquement).
--
-- Les projets Supabase récents n'accordent plus rien automatiquement sur les
-- nouveaux objets du schéma public. La migration 1 ne donnait des droits qu'à
-- authenticated : la fonction gerer-utilisateurs échouait donc dès sa lecture
-- de la table profils (« permission denied »), et répondait « Réservé à
-- l'administrateur » à un administrateur légitime.
--
-- service_role contourne la RLS (attribut BYPASSRLS) : il lui faut seulement les
-- privilèges SQL. Il n'est jamais utilisé dans l'application ni dans le
-- navigateur.
-- =============================================================================

grant usage on schema public, private to service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema private to service_role;

-- Objets créés par les migrations suivantes : mêmes droits d'office.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
alter default privileges in schema private grant execute on functions to service_role;
