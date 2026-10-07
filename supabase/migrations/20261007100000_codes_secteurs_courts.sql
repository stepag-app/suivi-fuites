-- =============================================================================
-- Secteurs : codes courts en capitales et libellés en capitales (demande d'Issam,
-- 2026-10-07). Les codes d'origine (« qods_haut_chu_mouhoub_iriss »…) étaient trop
-- longs pour les listes, la carte et les rapports.
--
-- Sans risque pour les données saisies : fuites, balayages, tronçons et nœuds
-- pointent vers secteurs.id, jamais vers le code. Le code ne sert qu'à l'affichage
-- et à l'import du plan (propriété secteur_code des fichiers GeoJSON, comparée
-- exactement) : les fichiers d'import sont régénérés avec les nouveaux codes
-- (outils/reseau/secteurs.json, zoner.py).
--
-- Tous les marchés qui portent encore les anciens codes (SRM-4500004453, DEMO et
-- leurs copies) ; un code déjà changé à la main n'est pas touché. Libellés en
-- capitales pour tous les secteurs de tous les marchés.
-- =============================================================================

update public.secteurs s
   set code = v.nouveau
  from (values
    ('qods_haut_chu_mouhoub_iriss', 'QODS-H'),
    ('andalous', 'ANDALOUS'),
    ('maafa_bekay_bas', 'MAAFA'),
    ('ballaoui_bas_irfane', 'BALLAOUI'),
    ('qods_bas', 'QODS-B'),
    ('chateau_sidi_aissa', 'CHATEAU'),
    ('azengot', 'AZENGOT'),
    ('maksam_kharoub', 'MAKSAM'),
    ('lazaret_bas', 'LAZARET-B'),
    ('tairet', 'TAIRET'),
    ('mbasso', 'MBASSO'),
    ('tennis_2', 'TENNIS-2'),
    ('sidi_driss', 'S-DRISS'),
    ('tazaghine', 'TAZAGHINE'),
    ('el_boustane', 'BOUSTANE'),
    ('ghar_el_baroud_zone_industrielle', 'GHAR-ZI'),
    ('derfoufi_zerktouni', 'DERFOUFI'),
    ('mohammadi_interieur', 'MOHAM-INT'),
    ('allal_ben_abdellah', 'ALLAL'),
    ('oued_makhazine', 'MAKHAZINE'),
    ('mauritanie_hassani', 'MAURITANIE'),
    ('mohammadi_exterieur', 'MOHAM-EXT'),
    ('benkhirane', 'BENKHIRANE'),
    ('sidi_yahya', 'S-YAHYA'),
    ('pam', 'PAM'),
    ('lazaret_haut', 'LAZARET-H'),
    ('abdellah_guenoun', 'GUENOUN'),
    ('medina', 'MEDINA'),
    ('rte_algerie', 'RTE-ALG'),
    ('tennis_1', 'TENNIS-1'),
    ('aounia', 'AOUNIA'),
    ('atlas', 'ATLAS'),
    ('lieutenant_belhoucine', 'BELHOUCINE'),
    ('boudir', 'BOUDIR')
  ) v (ancien, nouveau)
 where s.code = v.ancien
   and not exists (select 1 from public.secteurs d where d.marche_id = s.marche_id and d.code = v.nouveau);

update public.secteurs
   set libelle = upper(libelle)
 where libelle is distinct from upper(libelle);
