-- =============================================================================
-- Chantier v3, S21 (E4) : retrait définitif de la notion d'équipe en base.
--
-- Décision d'Issam (2026-10-10, docs/lots/chantier-v3.md § 0) : l'équipe, c'est le compte du chef
-- d'équipe. S12 (migration 20261013200000) a retiré les équipes de toutes les vues et fonctions et
-- gardé, vides et inutilisées, la table equipes, le type type_equipe et les colonnes equipe_id,
-- le temps que toutes les tablettes reçoivent l'APK sans équipe. Fait le 2026-10-13 : une seule
-- tablette en service (Redmi Pad 2), en 1.0.0-beta.4 (versionCode 195), qui n'envoie plus equipe_id.
-- Une APK d'avant S12 verrait ses envois refusés (colonne absente) : ne pas la réinstaller.
-- =============================================================================

-- Les clés étrangères composites (equipe_id, marche_id) disparaissent avec les colonnes.
alter table public.fuites drop column equipe_id;
alter table public.reparations drop column equipe_id;
alter table public.refections drop column equipe_id;
alter table public.balayages drop column equipe_id;

-- Règles, déclencheurs et index de la table partent avec elle.
drop table public.equipes;
drop type public.type_equipe;

-- Liste « type d'équipe » des libellés : lignes retirées, valeur retirée du contrôle de la table.
-- Retrait de structure, pas une saisie : rien n'est écrit au journal.
alter table public.libelles_listes disable trigger journaliser;
delete from public.libelles_listes where liste = 'type_equipe';
alter table public.libelles_listes enable trigger journaliser;
alter table public.libelles_listes drop constraint libelles_listes_liste_check;
alter table public.libelles_listes add constraint libelles_listes_liste_check check (liste in (
  'ouvrage', 'materiau', 'emplacement', 'visibilite', 'origine', 'statut_fuite', 'resultat_reparation',
  'resultat_refection', 'travaux_reparation', 'type_photo', 'methode_balayage'
));
