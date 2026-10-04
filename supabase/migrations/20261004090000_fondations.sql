-- =============================================================================
-- Migration 1 / fichier 1 : fondations
-- Extensions, schéma privé, privilèges par défaut, types, fonctions utilitaires.
-- =============================================================================

create extension if not exists postgis with schema extensions;

-- Schéma privé : fonctions de sécurité et tables techniques. Il n'est pas
-- exposé par l'API de données (ne jamais l'ajouter aux « Exposed schemas »).
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Aucune exposition automatique des nouveaux objets : chaque table, vue ou
-- fonction reçoit ses privilèges explicitement dans les migrations.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Types énumérés (valeurs internes en snake_case ; libellés FR / AR côté appli)
-- -----------------------------------------------------------------------------

create type public.langue_interface as enum ('fr', 'ar', 'fr_ar');

-- Types de données sur lesquels portent les droits CRUD.
create type public.type_donnee as enum (
  'fuites',          -- fuites (détection, statut, jalons SRM)
  'interventions',   -- réparations, réfections, pièces posées, ouvriers
  'photos',
  'quantites',       -- lignes de prix, montants (bordereau)
  'parametres',      -- zones, secteurs, prix, catalogue, motifs, équipes, OS
  'ouvriers',        -- ouvriers sans compte
  'journal',         -- consultation du journal
  'exports',         -- exports CSV / Excel / PDF (contrôlé par l'appli)
  'balayage',        -- migration 2
  'mesures_debit',   -- migration 2
  'attachements'     -- migration 3
);

-- Portée d'un droit de modification ou de suppression.
create type public.portee_droit as enum ('non', 'siennes', 'toutes');

create type public.source_saisie as enum ('tablette', 'web', 'papier', 'import');

create type public.statut_fuite as enum (
  'detectee',        -- détectée, non réparée
  'en_reparation',   -- réparation en cours / reste à finir
  'reparee',         -- réparée, réfection à faire
  'achevee',         -- réparée et réfectionnée, ou close sans réfection (motif)
  'sans_reparation'  -- sondage négatif, refus de l'abonné, assainissement...
);

create type public.origine_fuite as enum ('stepag', 'srm');
create type public.visibilite_fuite as enum ('visible', 'invisible');
create type public.resultat_reparation as enum ('en_cours', 'reparee', 'non_reparee');
create type public.resultat_refection as enum ('faite', 'non_faite');
create type public.type_photo as enum ('detection', 'avant', 'pendant', 'apres', 'refection', 'autre');
create type public.origine_ligne as enum ('auto', 'manuel');
create type public.emplacement_fouille as enum ('trottoir', 'chaussee', 'terrain_naturel', 'autre');
create type public.statut_balayage as enum ('a_balayer', 'en_cours', 'balayee');
create type public.categorie_motif as enum ('sans_reparation', 'sans_refection');
create type public.type_equipe as enum ('detection', 'reparation', 'mixte');

-- Famille d'un prix : sert à proposer automatiquement les lignes de quantités
-- (règle R-DER-007 du fichier references/regles-marche-4500004453.md).
create type public.famille_prix as enum (
  'balayage', 'maintien', 'terrassement', 'refection',
  'reparation_tuyau', 'robinet_pec', 'collier_pec', 'bouche_a_cle', 'autre'
);

-- -----------------------------------------------------------------------------
-- Fonctions utilitaires génériques
-- -----------------------------------------------------------------------------

-- Contexte serveur : migrations, éditeur SQL, Edge Functions en service_role.
-- Aucun utilisateur connecté (auth.uid() nul). Les rôles anon n'ont aucun
-- privilège sur les tables et n'atteignent donc jamais les déclencheurs.
create function private.contexte_serveur()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is null
$$;

create function private.maj_modifie_le()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.modifie_le := now();
  return new;
end
$$;

-- Une ligne ne change jamais de marché.
create function private.figer_marche()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.marche_id is distinct from old.marche_id then
    raise exception 'Le marché d''une donnée ne peut pas être modifié'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- Conversion sûre d'un texte en uuid (chemins de stockage).
create function private.uuid_ou_nul(p_texte text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_texte::uuid;
exception when others then
  return null;
end
$$;

-- Appel système : l'instruction est exécutée par le serveur ou par une fonction
-- SECURITY DEFINER de ce schéma (statut automatique, lignes de prix), et non
-- directement par un utilisateur via l'API. Utilisé dans les déclencheurs.
create function private.appel_systeme()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user not in ('authenticated', 'anon')
$$;

grant execute on function private.contexte_serveur() to authenticated;
grant execute on function private.appel_systeme() to authenticated;
grant execute on function private.uuid_ou_nul(text) to authenticated;
