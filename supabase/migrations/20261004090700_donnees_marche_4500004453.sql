-- =============================================================================
-- Migration 1 / fichier 8 : données du marché n° 4500004453 (SRM Oriental, Oujda).
-- Premier marché de l'application ; les marchés suivants seront créés depuis le
-- panneau web. Source : references/regles-marche-4500004453.md (sections 2, 4,
-- 5, 6.2, 6 bis). Contrôles des totaux en fin de fichier : la migration échoue
-- (et rien n'est appliqué) si un total diffère des pièces du marché.
--
-- Points à confirmer (section 12 du fichier de règles) :
--  * découpage des 34 secteurs (ponctuation ambiguë du tableau n° 1 du CPS) ;
--  * sondage négatif payé en terrassement (hypothèse Q-08) ;
--  * dates des phases calculées de date à date à partir du 2026-10-02.
-- =============================================================================


insert into public.marches (
  code, numero, numero_appel_offres, intitule, client, ville,
  date_notification, date_commencement, duree_mois,
  taux_majoration, taux_tva, taux_retenue_garantie, plafond_retenue_garantie
) values (
  'SRM-4500004453', '4500004453', '10008883/1R',
  'Travaux de détection, recherche et réparation de fuites sur le réseau de distribution d''eau potable de la ville d''Oujda',
  'SRM Oriental (SRM-ORI)', 'Oujda',
  '2026-09-11', '2026-10-02', 12,
  15.00, 20.00, 10.00, 7.00
) on conflict (code) do nothing;

-- Phases (CPS art. II-14 ; maintien : 40 % puis 60 % du prix 2)
insert into public.phases (marche_id, code, libelle, ordre, date_debut, date_fin)
select m.id, v.code, v.libelle, v.ordre, v.debut::date, v.fin::date
  from public.marches m,
       (values
         ('balayage',   'Balayage',                           1, '2026-10-02', '2027-02-01'),
         ('maintien_1', 'Maintien des performances (40 %)',   2, '2027-02-02', '2027-06-01'),
         ('maintien_2', 'Maintien des performances (60 %)',   3, '2027-06-02', '2027-10-01'),
         ('garantie',   'Délai de garantie (12 mois)',        4, null, null)
       ) v (code, libelle, ordre, debut, fin)
 where m.code = 'SRM-4500004453'
on conflict (marche_id, code) do nothing;

-- Ordres de service
insert into public.ordres_service (marche_id, numero, date_os, objet, date_effet)
select m.id, v.numero, v.date_os::date, v.objet, v.effet::date
  from public.marches m,
       (values
         ('01/4500004453', '2026-09-11', 'Notification de l''approbation du marché', null),
         ('02/4500004453', '2026-09-25', 'Commencement de l''exécution des travaux', '2026-10-02')
       ) v (numero, date_os, objet, effet)
 where m.code = 'SRM-4500004453'
on conflict (marche_id, numero) do nothing;

-- Zones (tableau n° 1 du CPS ; linéaire en mètres, débit nocturne exigé en m3/h)
insert into public.zones (marche_id, numero, code, libelle, lineaire_m, q_exige_m3h)
select m.id, v.numero, v.code, v.libelle, v.lineaire_m, v.q_exige
  from public.marches m,
       (values
         (1, 'zone_1_universite',       'Zone université 7000 m3 et champ de tir', 358000, 126),
         (2, 'zone_2_jbel_hamra_dn700', 'Zone Jbel Hamra DN700',                   362000, 130),
         (3, 'zone_3_ain_serrak',       'Zone réservoir Aïn Serrak 5000 m3',       228000, 118),
         (4, 'zone_4_sidi_yahya',       'Zone Sidi Yahya 5000 m3 et 4000 m3',      399000, 112),
         (5, 'zone_5_jbel_hamra_dn600', 'Zone Jbel Hamra DN600',                   119000,  83)
       ) v (numero, code, libelle, lineaire_m, q_exige)
 where m.code = 'SRM-4500004453'
on conflict (marche_id, code) do nothing;

-- Secteurs (34, découpage proposé ; linéaire par secteur inconnu à ce jour)
insert into public.secteurs (marche_id, zone_id, code, libelle, ordre)
select m.id, z.id, v.code, v.libelle, v.ordre
  from public.marches m
  join (values
  (1, 'qods_haut_chu_mouhoub_iriss', 'Qods Haut, Chu-Mouhoub-Iriss', 1),
  (1, 'andalous', 'Andalous', 2),
  (1, 'maafa_bekay_bas', 'Maafa Bekay Bas', 3),
  (1, 'ballaoui_bas_irfane', 'Ballaoui Bas-Irfane- Unisit-Colline-Partie H Ain Serrak', 4),
  (1, 'qods_bas', 'Qods Bas', 5),
  (1, 'chateau_sidi_aissa', 'Château Sidi Aissa', 6),
  (1, 'azengot', 'Azengot', 7),
  (1, 'maksam_kharoub', 'Maksam-Kharoub', 8),
  (2, 'lazaret_bas', 'Lazaret Bas', 1),
  (2, 'tairet', 'Tairet', 2),
  (2, 'mbasso', 'Mbasso', 3),
  (2, 'tennis_2', 'Tennis 2', 4),
  (2, 'sidi_driss', 'Sidi Driss', 5),
  (2, 'tazaghine', 'Tazaghine', 6),
  (2, 'el_boustane', 'El Boustane', 7),
  (2, 'ghar_el_baroud_zone_industrielle', 'Ghar El Baroud-Zone Industrielle', 8),
  (3, 'derfoufi_zerktouni', 'Derfoufi et Zerktouni', 1),
  (3, 'mohammadi_interieur', 'Mohammadi Intérieur', 2),
  (3, 'allal_ben_abdellah', 'Allal Ben Abdellah', 3),
  (3, 'oued_makhazine', 'Oued Makhazine', 4),
  (3, 'mauritanie_hassani', 'Mauritanie et Hassani', 5),
  (3, 'mohammadi_exterieur', 'Mohammadi Extérieur', 6),
  (3, 'benkhirane', 'Benkhirane', 7),
  (4, 'sidi_yahya', 'Sidi Yahya', 1),
  (4, 'pam', 'Pam', 2),
  (4, 'lazaret_haut', 'Lazaret Haut', 3),
  (4, 'abdellah_guenoun', 'Abdellah Guenoun', 4),
  (5, 'medina', 'Medina', 1),
  (5, 'rte_algerie', 'Route d''Algérie', 2),
  (5, 'tennis_1', 'Tennis 1', 3),
  (5, 'aounia', 'Aounia', 4),
  (5, 'atlas', 'Atlas', 5),
  (5, 'lieutenant_belhoucine', 'Lieutenant Belhoucine', 6),
  (5, 'boudir', 'Boudir', 7)
       ) v (zone_numero, code, libelle, ordre) on true
  join public.zones z on z.marche_id = m.id and z.numero = v.zone_numero
 where m.code = 'SRM-4500004453'
on conflict (marche_id, code) do nothing;

-- Équipes de détection (au moins 4 exigées) ; les équipes de réparation sont
-- ajoutées par le responsable dans le panneau.
insert into public.equipes (marche_id, type, numero, libelle)
select m.id, 'detection', n, 'Détection ' || n
  from public.marches m, generate_series(1, 4) n
 where m.code = 'SRM-4500004453'
on conflict (marche_id, type, numero) do nothing;

-- Bordereau des prix (prix HT avant majoration ; la majoration de 15 % est
-- appliquée au total de la facture). famille / matériaux / diamètres :
-- règles de proposition automatique des lignes (R-DER-007).
insert into public.prix (
  marche_id, numero, ordre, designation, unite, quantite_marche, pu_ht,
  famille, materiaux, diametre_min_mm, diametre_max_mm
)
select m.id, v.numero, v.ordre, v.designation, v.unite, v.quantite, v.pu,
       v.famille::public.famille_prix, v.materiaux, v.dmin, v.dmax
  from public.marches m,
       (values
  ('1', 1, 'Recherche et détection de fuites sur conduites, tous diamètres et toutes natures ( Balayage)', 'ml', 1466000, 0.30, 'balayage', null::text[], null::int, null::int),
  ('2', 2, 'Recherche et détection de fuites sur conduites pour le maintien des résultats', 'ml', 1466000, 0.45, 'maintien', null::text[], null::int, null::int),
  ('3', 3, 'Confection de tranchée en terrain de toute nature y compris remblaiement de la tranchée, compactage, transport des terres en excédent et toutes sujétions, pour conduites et branchements y compris réglage du fond de fouille, étaiement, blindage et épuisement en cas de terrassement pour réparation de fuite ou sondage L''Unité = Le Mètre Cube', 'm3', 2400, 50.00, 'terrassement', null::text[], null::int, null::int),
  ('4', 4, 'Réfection et revêtement des trottoirs en béton, granito lavé, en carreaux ciment ou en mosaïque conforme à l''original épaisseur 0,10 m y compris blocage en pierre d''une épaisseur minimale de 15 cm,couche en tout venant GNA compactée et toutes sujétions', 'm2', 2000, 100.00, 'refection', null::text[], null::int, null::int),
  ('5', 5, 'Réfection et revêtement de chaussée goudronnée en enrobé à chaud d''épaisseur de 7 cm, y compris couche en tout venant GNA de 0,50 m', 'm2', 800, 150.00, 'refection', null::text[], null::int, null::int),
  ('6', 6, 'Fourniture,Transport et pose pour réparation de fuites au niveau du tuyau polyéthylène de diamètre extérieur strictement inférieur à 40 mm (longueur polyéthylène inférieur ou égale à 2m) y compris la fourniture du sable et sa mise en œuvre pour lit de pose d''une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue de largeur (50 cm), cisaillement, montage par mise en place de raccords , collier pour polyéthèlyne et ou manchon ou bouchon', 'u', 2400, 400.00, 'reparation_tuyau', array['polyethylene']::text[], null::int, 39::int),
  ('7', 7, 'Fourniture ,Transport et pose pour changement de Robinet PEC de différents diamètres pour branchement ou conduites en polyéthylène y compris pose du tabernacle et du tube en PVC et confection d''un socle en béton (0,40x0,40x0,20) pour la bouche à clé (béton fourni par l''entreprise)', 'u', 900, 460.00, 'robinet_pec', null::text[], null::int, null::int),
  ('8', 8, 'Fourniture ,Transport et pose pour changement de collier PEC de différents diamètres pour branchement ou conduites en polyéthylène y compris pose du tabernacle et du tube en PVC et confection d''un socle en béton (0,40x0,40x0,20) pour la bouche à clé (béton fourni par l''entreprise)', 'u', 500, 460.00, 'collier_pec', null::text[], null::int, null::int),
  ('9', 9, 'Fourniture,Transport et pose pour réparation de fuites au niveau du tuyau polyéthylène de diamètre extérieur supérieur ou égal à 40 mm (longueur polyéthylène inférieur ou égale à 2m) y compris la fourniture du sable et sa mise en œuvre pour lit de pose d''une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue de largeur (50 cm), cisaillement, montage par mise en place de raccords , collier pour polyéthèlyne et ou manchon ou bouchon', 'u', 600, 400.00, 'reparation_tuyau', array['polyethylene']::text[], 40::int, null::int),
  ('10', 10, 'Mise à niveau de bouche à clé carrée ou ronde y compris pose de tube allonge en PVC, tabernacle et socle en béton de 0,40 m x 0,40 m x 0,20', 'u', 300, 140.00, 'bouche_a_cle', null::text[], null::int, null::int),
  ('11', 11, 'réparation de fuites sur conduites (amiante ciment et PVC) par joint gibault, joint dissymetrique ou autres matériels de jonction y compris Fourniture, transport ,coupe et pose pour remplacement total ou partiel d''un élément de conduite défectueux y compris la fourniture du sable et sa mise en œuvre pour lit de pose d''une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement de conduite, préparation des bouts de montage ainsi que le démontage de l''élément épuisement du fond de fouille et toutes sujestions : -Diam compris entre 315 mm et 225 mm', 'u', 8, 4600.00, 'reparation_tuyau', array['amiante_ciment','pvc']::text[], 225::int, 315::int),
  ('12', 12, 'réparation de fuites sur conduites (amiante ciment et PVC) par joint gibault, joint dissymetrique ou autres matériels de jonction y compris Fourniture, transport ,coupe et pose pour remplacement total ou partiel d''un élément de conduite défectueux y compris la fourniture du sable et sa mise en œuvre pour lit de pose d''une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement de conduite, préparation des bouts de montage ainsi que le démontage de l''élément épuisement du fond de fouille et toutes sujestions : -Diam compris entre 200 mm et 110 mm', 'u', 40, 2900.00, 'reparation_tuyau', array['amiante_ciment','pvc']::text[], 110::int, 200::int),
  ('13', 13, 'réparation de fuites sur conduites (amiante ciment et PVC) par joint gibault, joint dissymetrique ou autres matériels de jonction y compris Fourniture, transport ,coupe et pose pour remplacement total ou partiel d''un élément de conduite défectueux y compris la fourniture du sable et sa mise en œuvre pour lit de pose d''une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement de conduite, préparation des bouts de montage ainsi que le démontage de l''élément épuisement du fond de fouille et toutes sujestions : -Diam inférieur à 110 mm', 'u', 80, 2300.00, 'reparation_tuyau', array['amiante_ciment','pvc']::text[], null::int, 109::int)
       ) v (numero, ordre, designation, unite, quantite, pu, famille, materiaux, dmin, dmax)
 where m.code = 'SRM-4500004453'
on conflict (marche_id, numero) do nothing;

-- Natures de revêtement et de réfection (symboles de la feuille REFECTION)
insert into public.natures_refection (marche_id, code, libelle_fr, libelle_ar, symbole, emplacement, prix_id, necessite_refection, ordre)
select m.id, v.code, v.libelle_fr, v.libelle_ar, v.symbole, v.emplacement::public.emplacement_fouille,
       p.id, v.necessite, v.ordre
  from public.marches m
  join (values
         ('beton',                 'Béton',                        'خرسانة',          'B',  'trottoir',        '4',  true,  1),
         ('mosaique',              'Mosaïque',                     'فسيفساء',         'M',  'trottoir',        '4',  true,  2),
         ('granito_lave',          'Granito lavé',                 'غرانيتو مغسول',   'L',  'trottoir',        '4',  true,  3),
         ('carreaux_ciment',       'Carreaux ciment / carrelage',  'بلاط',            'C',  'trottoir',        '4',  true,  4),
         ('enrobe_a_chaud',        'Enrobé à chaud',               'إسفلت ساخن',      'AC', 'chaussee',        '5',  true,  5),
         ('enrobe_resine_a_froid', 'Enrobé à froid (résine)',      'إسفلت بارد',      'AF', 'chaussee',        '5',  true,  6),
         ('terrain_naturel',       'Terrain naturel',              'أرض طبيعية',      'TN', 'terrain_naturel', null, false, 7),
         ('autre',                 'Autre',                        'آخر',             null, 'autre',           null, true,  8)
       ) v (code, libelle_fr, libelle_ar, symbole, emplacement, prix_numero, necessite, ordre) on true
  left join public.prix p on p.marche_id = m.id and p.numero = v.prix_numero
 where m.code = 'SRM-4500004453'
on conflict (marche_id, code) do nothing;

-- Motifs (libellés arabes à relire par Issam)
insert into public.motifs (marche_id, categorie, code, libelle_fr, libelle_ar, terrassement_paye, ordre)
select m.id, v.categorie::public.categorie_motif, v.code, v.libelle_fr, v.libelle_ar, v.paye, v.ordre
  from public.marches m,
       (values
         ('sans_reparation', 'sondage_negatif',  'Sondage négatif (pas de fuite à l''ouverture)', 'حفر بدون تسرب',            true,  1),
         ('sans_reparation', 'a_detecter',       'À détecter de nouveau',                         'يجب إعادة الكشف',          false, 2),
         ('sans_reparation', 'assainissement',   'Eau provenant de l''assainissement',            'مياه الصرف الصحي',         false, 3),
         ('sans_reparation', 'refus_abonne',     'Refus de l''abonné',                            'رفض المشترك',              false, 4),
         ('sans_reparation', 'reparee_par_srm',  'Réparée par la SRM',                            'أصلحتها الشركة الجهوية',   false, 5),
         ('sans_reparation', 'ras',              'Rien à signaler',                               'لا شيء يذكر',              false, 6),
         ('sans_reparation', 'autre',            'Autre motif',                                   'سبب آخر',                  false, 7),
         ('sans_refection',  'faite_par_proprietaire', 'Réfection faite par le propriétaire',     'الترميم أنجزه المالك',     false, 1),
         ('sans_refection',  'terrain_naturel',  'Terrain naturel',                               'أرض طبيعية',               false, 2),
         ('sans_refection',  'faite_par_tiers',  'Réfection faite par un tiers',                  'الترميم أنجزه طرف آخر',    false, 3),
         ('sans_refection',  'autre',            'Autre motif',                                   'سبب آخر',                  false, 4)
       ) v (categorie, code, libelle_fr, libelle_ar, paye, ordre)
 where m.code = 'SRM-4500004453'
on conflict (marche_id, categorie, code) do nothing;

-- Catalogue des pièces (feuille LISTE du classeur STEPAG, 261 pièces ; les
-- 5 motifs de la liste sont repris dans la table des motifs).
insert into public.catalogue_pieces (marche_id, numero_source, designation, famille, unite, prix_suggere_id)
select m.id, v.numero_source, v.designation, v.famille, v.unite, p.id
  from public.marches m
  join (values
  (6, 'Manchon droit 15', 'manchon polyéthylène', 'u', '6'),
  (7, 'Manchon droit 75/75', 'manchon polyéthylène', 'u', '9'),
  (8, 'Manchon DN 600', 'manchon', 'u', null),
  (9, 'Manchon droit 63/63', 'manchon polyéthylène', 'u', '9'),
  (10, 'Manchon droit 50/50', 'manchon polyéthylène', 'u', '9'),
  (11, 'Manchon droit 40/40', 'manchon polyéthylène', 'u', '9'),
  (12, 'Manchon droit 32/32', 'manchon polyéthylène', 'u', '6'),
  (13, 'Manchon droit 20/20', 'manchon polyéthylène', 'u', '6'),
  (14, 'Manchon droit 25/25', 'manchon polyéthylène', 'u', '6'),
  (15, 'Manchon réduit 32/25', 'manchon polyéthylène', 'u', '6'),
  (16, 'Manchon réduit 40/32', 'manchon polyéthylène', 'u', '9'),
  (17, 'Manchon réduit 75/63', 'manchon polyéthylène', 'u', '9'),
  (18, 'Robinet d''arret 25/15', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (19, 'Robinet d''arret 32/15', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (20, 'Robinet d''arret 15', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (21, 'Robinet d''arret 63', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (22, 'Robinet d''arret 20', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (23, 'Robinet FF 32', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (24, 'Robinet FF 20', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (25, 'Robinet FF 50/50', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (26, 'Robinet PEC 50 1-1/2', 'robinet de prise en charge', 'u', '7'),
  (27, 'Robinet PEC 40 1-1/2 F', 'robinet de prise en charge', 'u', '7'),
  (28, 'Robinet PEC 63 1-1/2', 'robinet de prise en charge', 'u', '7'),
  (29, 'Robinet PEC 20/32', 'robinet de prise en charge', 'u', '7'),
  (30, 'Robinet PEC 20/25', 'robinet de prise en charge', 'u', '7'),
  (31, 'Robinet PEC 40/40', 'robinet de prise en charge', 'u', '7'),
  (32, 'Robinet PEC 40/50', 'robinet de prise en charge', 'u', '7'),
  (33, 'Robinet PEC 63/40', 'robinet de prise en charge', 'u', '7'),
  (34, 'Robinet vanne 200', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (35, 'Robinet vanne 100', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (36, 'Robinet vanne 150', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (37, 'Robinet vanne 60', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (38, 'Robinet vanne 80', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (39, 'Robinet vanne 50/40', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (40, 'Robinet vanne 30 1-1/4', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (41, 'Raccord en laiton 50 1-1/2', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (42, 'Raccord en laiton 63 1-1/2', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (43, 'Raccord en laiton 75', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (44, 'Raccord en laiton 40 1-1/4', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (45, 'Raccord en laiton 40 1/2', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (46, 'Raccord en laiton 32 1/2', 'raccord, coude ou bouchon polyéthylène', 'u', '6'),
  (47, 'Raccord en laiton 32 3/4', 'raccord, coude ou bouchon polyéthylène', 'u', '6'),
  (48, 'Raccord en laiton 25 3/4', 'raccord, coude ou bouchon polyéthylène', 'u', '6'),
  (49, 'Raccord en laiton 25 1/2', 'raccord, coude ou bouchon polyéthylène', 'u', '6'),
  (50, 'Raccord standard 15', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (51, 'Raccord standard 30', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (52, 'coude dn 15', 'raccord, coude ou bouchon polyéthylène', 'u', '6'),
  (53, 'coude dn 40', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (54, 'coude dn 20', 'raccord, coude ou bouchon polyéthylène', 'u', '6'),
  (55, 'coude dn 50', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (56, 'coude dn 75', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (57, 'coude dn 90', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (58, 'coude dn 63', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (59, 'coude dn 100', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (60, 'coude dn 1/8 110', 'raccord, coude ou bouchon polyéthylène', 'u', '6'),
  (61, 'Collier PEC 50/20', 'collier de prise en charge', 'u', '8'),
  (62, 'Collier PEC 40/20', 'collier de prise en charge', 'u', '8'),
  (63, 'Collier PEC 80/40', 'collier de prise en charge', 'u', '8'),
  (64, 'Collier PEC 80/20', 'collier de prise en charge', 'u', '8'),
  (65, 'Collier PEC 63/20', 'collier de prise en charge', 'u', '8'),
  (66, 'Collier PEC 60/20', 'collier de prise en charge', 'u', '8'),
  (67, 'Collier PEC 60/40', 'collier de prise en charge', 'u', '8'),
  (68, 'Collier PEC 63/40', 'collier de prise en charge', 'u', '8'),
  (69, 'Collier PEC 75/20', 'collier de prise en charge', 'u', '8'),
  (70, 'Collier PEC 40/90', 'collier de prise en charge', 'u', '8'),
  (71, 'Collier PEC 100/20', 'collier de prise en charge', 'u', '8'),
  (72, 'Collier PEC 110/20', 'collier de prise en charge', 'u', '8'),
  (73, 'Collier PEC 110/40', 'collier de prise en charge', 'u', '8'),
  (74, 'Collier PEC 100/40', 'collier de prise en charge', 'u', '8'),
  (75, 'Collier PEC 150/20', 'collier de prise en charge', 'u', '8'),
  (76, 'Collier PEC 150/40', 'collier de prise en charge', 'u', '8'),
  (77, 'Collier PEC 160/20', 'collier de prise en charge', 'u', '8'),
  (78, 'Collier PEC 200/20', 'collier de prise en charge', 'u', '8'),
  (79, 'Collier PEC 225/40', 'collier de prise en charge', 'u', '8'),
  (80, 'Collier PEC  400/40', 'collier de prise en charge', 'u', '8'),
  (81, 'Collier PEC 160/40', 'collier de prise en charge', 'u', '8'),
  (82, 'Collier ASTOR 32 3/4', 'collier pour polyéthylène', 'u', '6'),
  (83, 'Collier ASTOR 50 3/4', 'collier pour polyéthylène', 'u', '9'),
  (84, 'Collier ASTOR 40 3/4', 'collier pour polyéthylène', 'u', '9'),
  (85, 'Collier ASTOR 63 3/4', 'collier pour polyéthylène', 'u', '9'),
  (86, 'compteur dn 100', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (87, 'boulon 24', 'consommable ou matériau', 'u', null),
  (88, 'boulon 16x80', 'consommable ou matériau', 'u', null),
  (89, 'boulon 20x80', 'consommable ou matériau', 'u', null),
  (90, 'boulon 16X70', 'consommable ou matériau', 'u', null),
  (91, 'boulon 20X110', 'consommable ou matériau', 'u', null),
  (92, 'Fillasse', 'consommable ou matériau', 'u', null),
  (93, 'PEHD 75/75', 'tuyau polyéthylène', 'ml', '9'),
  (94, 'PEHD 53/63', 'tuyau polyéthylène', 'ml', '9'),
  (95, 'PEHD 33/40', 'tuyau polyéthylène', 'ml', '9'),
  (96, 'PEHD 42/50', 'tuyau polyéthylène', 'ml', '9'),
  (97, 'PEHD 19/25', 'tuyau polyéthylène', 'ml', '6'),
  (98, 'PEHD 20', 'tuyau polyéthylène', 'ml', '6'),
  (99, 'PEHD 15', 'tuyau polyéthylène', 'ml', '6'),
  (100, 'PEHD 26/32', 'tuyau polyéthylène', 'ml', '6'),
  (101, 'PEHD /75', 'tuyau polyéthylène', 'ml', '9'),
  (102, 'PPR 25', 'manchon polyéthylène', 'u', '6'),
  (103, 'Robinet equerre 32 1/2', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (104, 'Robinet equerre 25 1/2', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (105, 'Robinet equerre 25 3/4', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (106, 'Robinet equerre 15', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (107, 'Robinet equerre 20', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (108, 'Tabernacle', 'bouche à clé', 'u', null),
  (109, 'Bouche à clé carrée', 'bouche à clé', 'u', null),
  (110, 'Tube PVC 90', 'bouche à clé', 'u', null),
  (111, 'Robinet FF 1/2', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (112, 'Robinet FF 25/15', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (113, 'Robinet pec 32/15', 'robinet de prise en charge', 'u', '7'),
  (114, 'Robinet PEC 30/40', 'robinet de prise en charge', 'u', '7'),
  (115, 'Robinet PEC 40/20', 'robinet de prise en charge', 'u', '7'),
  (116, 'Robinet PEC 20/15', 'robinet de prise en charge', 'u', '7'),
  (117, 'Collier PEC 140/20', 'collier de prise en charge', 'u', '8'),
  (118, 'Collier PEC 50/40', 'collier de prise en charge', 'u', '8'),
  (119, 'Joint Gibault 60', 'jonction ou tuyau de conduite AC/PVC', 'u', '13'),
  (120, 'Joint Gibault 63', 'jonction ou tuyau de conduite AC/PVC', 'u', '13'),
  (121, 'Joint Gibault 75/80', 'jonction ou tuyau de conduite AC/PVC', 'u', '13'),
  (122, 'Joint Gibault 75', 'jonction ou tuyau de conduite AC/PVC', 'u', '13'),
  (123, 'Joint Gibault 75/60', 'jonction ou tuyau de conduite AC/PVC', 'u', '13'),
  (124, 'Joint Gibault 80', 'jonction ou tuyau de conduite AC/PVC', 'u', '13'),
  (125, 'Joint Gibault 90', 'jonction ou tuyau de conduite AC/PVC', 'u', '13'),
  (126, 'Joint Gibault 80/90', 'jonction ou tuyau de conduite AC/PVC', 'u', '13'),
  (127, 'Joint Gibault  100', 'jonction ou tuyau de conduite AC/PVC', 'u', '13'),
  (128, 'Joint Gibault 110', 'jonction ou tuyau de conduite AC/PVC', 'u', '12'),
  (129, 'Joint Gibault 125', 'jonction ou tuyau de conduite AC/PVC', 'u', '12'),
  (130, 'Joint Gibault 140', 'jonction ou tuyau de conduite AC/PVC', 'u', '12'),
  (131, 'Joint Gibault 150', 'jonction ou tuyau de conduite AC/PVC', 'u', '12'),
  (132, 'Joint Gibault 160', 'jonction ou tuyau de conduite AC/PVC', 'u', '12'),
  (133, 'Joint Gibault 200', 'jonction ou tuyau de conduite AC/PVC', 'u', '12'),
  (134, 'Joint Gibault  225', 'jonction ou tuyau de conduite AC/PVC', 'u', '11'),
  (135, 'Joint Gibault  250', 'jonction ou tuyau de conduite AC/PVC', 'u', '11'),
  (136, 'Joint Gibault  300', 'jonction ou tuyau de conduite AC/PVC', 'u', '11'),
  (137, 'Joint Gibault  315', 'jonction ou tuyau de conduite AC/PVC', 'u', '11'),
  (138, 'Joint Gibault  400', 'jonction ou tuyau de conduite AC/PVC', 'u', null),
  (139, 'Joint Gibault  500', 'jonction ou tuyau de conduite AC/PVC', 'u', null),
  (140, 'Joint de démontage dn 400', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (141, 'Joint de démontage dn 100', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (142, 'Joint dissymétrique  90*80', 'jonction ou tuyau de conduite AC/PVC', 'u', '13'),
  (143, 'Joint dissymétrique  150*160', 'jonction ou tuyau de conduite AC/PVC', 'u', '12'),
  (144, 'Joint dissymétrique  100*110', 'jonction ou tuyau de conduite AC/PVC', 'u', '13'),
  (145, 'Joint dissymétrique  200*225', 'jonction ou tuyau de conduite AC/PVC', 'u', '12'),
  (146, 'Joint dissymétrique  60*75', 'jonction ou tuyau de conduite AC/PVC', 'u', '13'),
  (147, 'buse DN200', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (148, 'Tuyau PVC D 63', 'jonction ou tuyau de conduite AC/PVC', 'ml', '13'),
  (149, 'Tuyau PVC D 75', 'jonction ou tuyau de conduite AC/PVC', 'ml', '13'),
  (150, 'Tuyau PVC D 90', 'jonction ou tuyau de conduite AC/PVC', 'ml', '13'),
  (151, 'Tuyau PVC D 110', 'jonction ou tuyau de conduite AC/PVC', 'ml', '12'),
  (152, 'Tuyau PVC D 125', 'jonction ou tuyau de conduite AC/PVC', 'ml', '12'),
  (153, 'Tuyau PVC D 140', 'jonction ou tuyau de conduite AC/PVC', 'ml', '12'),
  (154, 'Tuyau AC D 150', 'jonction ou tuyau de conduite AC/PVC', 'ml', '12'),
  (155, 'Tuyau AC D 151', 'jonction ou tuyau de conduite AC/PVC', 'ml', '12'),
  (156, 'Tuyau PVC D 160', 'jonction ou tuyau de conduite AC/PVC', 'ml', '12'),
  (157, 'Tuyau PVC D 200', 'jonction ou tuyau de conduite AC/PVC', 'ml', '12'),
  (158, 'Tuyau PVC D 225', 'jonction ou tuyau de conduite AC/PVC', 'ml', '11'),
  (159, 'Tuyau PVC D 250', 'jonction ou tuyau de conduite AC/PVC', 'ml', '11'),
  (160, 'Tuyau PVC D 315', 'jonction ou tuyau de conduite AC/PVC', 'ml', '11'),
  (161, 'Tuyau PVC D 400', 'jonction ou tuyau de conduite AC/PVC', 'ml', null),
  (162, 'Tuyau PVC D 500', 'jonction ou tuyau de conduite AC/PVC', 'ml', null),
  (163, 'Tuyau AC DN 150', 'jonction ou tuyau de conduite AC/PVC', 'ml', '12'),
  (164, 'Tuyau AC DN 300', 'jonction ou tuyau de conduite AC/PVC', 'ml', '11'),
  (165, 'Collier PEC 75/40', 'collier de prise en charge', 'u', '8'),
  (166, 'Collier PEC 90/20', 'collier de prise en charge', 'u', '8'),
  (167, 'Joint tolérance 75', 'jonction ou tuyau de conduite AC/PVC', 'u', '13'),
  (168, 'tuyau  pehd', 'tuyau polyéthylène', 'ml', null),
  (169, 'Joint tapis', 'consommable ou matériau', 'u', null),
  (170, 'ventouse DN 100', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (171, 'ventouse DN 80', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (172, 'ventouse DN 60', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (173, 'bouchon dn 25', 'raccord, coude ou bouchon polyéthylène', 'u', '6'),
  (174, 'bouchon dn20', 'raccord, coude ou bouchon polyéthylène', 'u', '6'),
  (175, 'bouchon dn 40', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (176, 'bouchon dn 32', 'raccord, coude ou bouchon polyéthylène', 'u', '6'),
  (177, 'bouchon dn 20 ASTORE', 'raccord, coude ou bouchon polyéthylène', 'u', '6'),
  (178, 'bouchon dn 32 ASTORE', 'raccord, coude ou bouchon polyéthylène', 'u', '6'),
  (179, 'bouchon dn 50 ASTORE', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (180, 'bouchon dn 50', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (181, 'bouchon dn 75', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (182, 'bouchon dn 90', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (183, 'bouchon dn 110', 'raccord ou bouchon gros diamètre', 'u', null),
  (184, 'bouchon dn 315', 'raccord ou bouchon gros diamètre', 'u', null),
  (185, 'bouchon dn 63', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (186, 'bouchon dn  160', 'raccord ou bouchon gros diamètre', 'u', null),
  (187, 'adaptateur de bride dn 60', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (188, 'adaptateur de bride dn 80', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (189, 'adaptateur de bride dn 90/80', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (190, 'adaptateur de bride dn 150', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (191, 'adaptateur de bride dn 300', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (192, 'adaptateur de bride dn 315', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (193, 'adaptateur de bride dn 100/110', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (194, 'adaptateur de bride dn 200/225', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (195, 'adaptateur de bride dn 400', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (196, 'bride major dn 400', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (197, 'bride major dn 225/200', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (198, 'bride major dn 315/300', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (199, 'bride major dn 110/100', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (200, 'bride major dn 160', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (201, 'bride major dn 90/80', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (202, 'bride major dn 90', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (203, 'bride major dn 75', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (204, 'bride major dn 63', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (205, 'BU DN 200', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (206, 'BU DN 100', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (207, 'BU DN 150', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (208, 'BU DN 160', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (209, 'BU DN 300', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (210, 'BU DN 60', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (211, 'BU DN 80', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (212, 'obturateur dn 40', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (213, 'obturateur dn 50', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (214, 'obturateur dn 63', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (215, 'obturateur dn 75', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (216, 'obturateur dn 90', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (217, 'obturateur dn 60', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (218, 'obturateur dn 80', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (219, 'obturateur dn 100', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (220, 'obturateur dn 150', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (221, 'obturateur dn 200', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (222, 'cône de réduction 160/110', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (223, 'réducteur dn 400', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (224, 'PLAQ REGARD CADRE CARRE TAMP ROND 800X800', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (225, 'PLAQ REGARD TAMPON ET CADRE CARRE  500X500', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (226, 'touvenant', 'consommable ou matériau', 'u', null),
  (227, 'Réducteur 300', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (228, 'TE 150/100', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (229, 'TE 150/150', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (230, 'TE 100/100', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (231, 'TE 100/80', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (232, 'TE 110/80', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (233, 'TE 200/60', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (234, 'TE 100/60', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (235, 'TE 150/80', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (236, 'TE 160/160', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (237, 'TE 200/100', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (238, 'TE 63', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (239, 'TE 75/75', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (240, 'TE 50', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (241, 'TE 200/80', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (242, 'TE 63 ASTORE', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (243, 'FUITE SUR CONDUITE DN 700', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (244, 'FUITE SUR CONDUITE DN 600', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (245, 'Fonte ductile dn400', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (246, 'CONDUITE DN 90 ACIER GALVANISE', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (247, 'vanne dn 400', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (248, 'beton b2', 'consommable ou matériau', 'u', null),
  (249, 'acier haut adherance 10', 'consommable ou matériau', 'u', null),
  (250, 'acier haut adherance 12', 'consommable ou matériau', 'u', null),
  (251, 'Collier pec 200/40', 'collier de prise en charge', 'u', '8'),
  (252, 'Raccord  40/30', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (253, 'Raccord  63/40', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (254, 'Raccord  20', 'raccord, coude ou bouchon polyéthylène', 'u', '6'),
  (255, 'Raccord  Astore 50', 'raccord, coude ou bouchon polyéthylène', 'u', '9'),
  (256, 'AC dn 300', 'jonction ou tuyau de conduite AC/PVC', 'ml', '11'),
  (257, 'CONE 225/160', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (258, 'CONE DE REDUCTION 160/110', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (259, 'CONE DE REDUCTION 150/100', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (260, 'CONE DE REDUCTION 160/225', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (261, 'plaque de regard', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (262, 'Porte de niche 50/50', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null),
  (263, 'bouche d''incendie', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (264, 'monchette dn 200', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (265, 'monchette dn 100', 'pièce spéciale, robinetterie ou ouvrage', 'u', null),
  (266, 'Robinet FF 50', 'côté compteur (cache-entrée, raccord standard, compteur)', 'u', null)
       ) v (numero_source, designation, famille, unite, prix_numero) on true
  left join public.prix p on p.marche_id = m.id and p.numero = v.prix_numero
 where m.code = 'SRM-4500004453'
on conflict (marche_id, designation) do nothing;

-- Contrôles (le script échoue et annule tout si un total diffère du marché)
do $$
declare
  _m uuid := (select id from public.marches where code = 'SRM-4500004453');
  _total numeric;
begin
  select sum(round(quantite_marche * pu_ht, 2)) into _total from public.prix where marche_id = _m and not hors_bordereau;
  if _total <> 3762300.00 then raise exception 'Total HT du bordereau : % au lieu de 3762300.00', _total; end if;
  if round(_total * 1.20 * 1.15, 2) <> 5191974.00 then raise exception 'Total TTC majoré incorrect'; end if;
  select sum(lineaire_m) into _total from public.zones where marche_id = _m;
  if _total <> 1466000 then raise exception 'Linéaire des zones : % au lieu de 1466000 m', _total; end if;
  if (select count(*) from public.secteurs where marche_id = _m) <> 34 then raise exception 'Nombre de secteurs différent de 34'; end if;
  if (select count(*) from public.catalogue_pieces where marche_id = _m) <> 261 then raise exception 'Catalogue incomplet'; end if;
end
$$;

