-- =============================================================================
-- Marché de démonstration « DEMO » : données fictives pour les essais.
--
-- Copie des paramètres du marché SRM-4500004453 (fiche, bordereau, zones,
-- secteurs, équipes, natures de réfection, motifs, catalogue des pièces,
-- règles d'attachement, modèles d'export), décalée de deux mois (commencement
-- le 3 août 2026), puis :
--   * 25 fuites d'août à octobre 2026 couvrant les cas du terrain : origine SRM
--     ou STEPAG, réparées avec ou sans réfection, réfection non faite (motif),
--     sondage négatif payé, sans réparation (réparée par la SRM, assainissement,
--     refus de l'abonné), réparation en deux temps, réparation en cours,
--     re-détection, gros diamètre, alertes (non réparée, non communiquée,
--     réfections en retard) et anomalies (fouille > 2 m, PE > 2 m, avis de
--     terrassement manquant, référence hors format) ;
--   * le lot d'attachement N° 01 (août) arrêté, puis, après l'arrêt, une
--     réfection exécutée en septembre et une profondeur de fouille corrigée
--     (régularisation de + 0,160 m3 à attacher dans le lot suivant) ;
--   * un arrêt de travaux avec ses ordres de service et quatre événements.
--
-- Rien n'est écrit dans le marché SRM. Les comptes ne sont pas affectés au
-- marché DEMO : l'administrateur le voit (sélecteur de marché en haut du
-- panneau) et peut y affecter un agent pour les essais. Après les essais :
-- désactiver le marché DEMO (administrateur).
-- La migration ne fait rien si le marché SRM n'existe pas ou si DEMO existe.
-- Identifiants stables : md5('demo:' || identifiant SRM) pour les copies,
-- « de000000-0000-4000-8000-… » pour le reste.
-- =============================================================================

do $$
declare
  _srm uuid := (select id from public.marches where code = 'SRM-4500004453');
  _demo constant uuid := 'de000000-0000-4000-8000-000000000000';
begin
  if _srm is null or exists (select 1 from public.marches where code = 'DEMO') then
    raise notice 'Marché DEMO non créé (marché SRM absent ou DEMO déjà présent)';
    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- 1. Fiche du marché (copie, dates décalées), paramètres créés par le
  --    déclencheur initialiser_marche puis alignés sur ceux de la SRM
  -- ---------------------------------------------------------------------------
  insert into public.marches (
    id, code, numero, numero_appel_offres, intitule, client, ville,
    date_notification, date_commencement, duree_mois, duree_jours, date_fin,
    taux_majoration, taux_tva, taux_retenue_garantie, plafond_retenue_garantie,
    rayon_redetection_m, delai_alerte_reparation_h, delai_prealerte_refection_chaussee_j,
    delai_refection_chaussee_j, delai_alerte_refection_trottoir_j, une_unite_par_prix_et_fuite,
    observation,
    client_sigle, client_nom_ar, client_direction, client_service, client_adresse, client_ice,
    client_telephone, client_email, client_representant,
    titulaire_nom, titulaire_nom_ar, titulaire_forme_juridique, titulaire_capital, titulaire_adresse,
    titulaire_ice, titulaire_if, titulaire_rc, titulaire_patente, titulaire_cnss, titulaire_telephone,
    titulaire_email, titulaire_representant, titulaire_qualite_representant,
    montant_ttc, devise, libelle_reference, masque_reference, jalons_client
  )
  select
    _demo, 'DEMO', 'DEMO-' || m.numero, m.numero_appel_offres,
    'DÉMONSTRATION (données fictives) : ' || m.intitule, m.client, m.ville,
    '2026-07-20', '2026-08-03', m.duree_mois, m.duree_jours, null,
    m.taux_majoration, m.taux_tva, m.taux_retenue_garantie, m.plafond_retenue_garantie,
    m.rayon_redetection_m, m.delai_alerte_reparation_h, m.delai_prealerte_refection_chaussee_j,
    m.delai_refection_chaussee_j, m.delai_alerte_refection_trottoir_j, m.une_unite_par_prix_et_fuite,
    'Marché de démonstration : données fictives pour les essais, à ne pas facturer. '
      || 'À désactiver par l''administrateur après les essais.',
    m.client_sigle, m.client_nom_ar, m.client_direction, m.client_service, m.client_adresse, m.client_ice,
    m.client_telephone, m.client_email, m.client_representant,
    m.titulaire_nom, m.titulaire_nom_ar, m.titulaire_forme_juridique, m.titulaire_capital, m.titulaire_adresse,
    m.titulaire_ice, m.titulaire_if, m.titulaire_rc, m.titulaire_patente, m.titulaire_cnss, m.titulaire_telephone,
    m.titulaire_email, m.titulaire_representant, m.titulaire_qualite_representant,
    m.montant_ttc, m.devise, m.libelle_reference, m.masque_reference, m.jalons_client
  from public.marches m
  where m.id = _srm;

  update public.parametres_attachement d
     set periodicite = s.periodicite, titre = s.titre, regroupement = s.regroupement,
         fuites_admissibles = s.fuites_admissibles, refection_anticipee = s.refection_anticipee,
         verrouiller_a_l_arret = s.verrouiller_a_l_arret, afficher_prix = s.afficher_prix,
         mentions_obligatoires = s.mentions_obligatoires, visas = s.visas, decimales = s.decimales,
         texte_pied = s.texte_pied
    from public.parametres_attachement s
   where s.marche_id = _srm and d.marche_id = _demo;

  insert into public.categories_evenement (marche_id, code, libelle, libelle_ar, ordre, actif)
  select _demo, c.code, c.libelle, c.libelle_ar, c.ordre, c.actif
    from public.categories_evenement c where c.marche_id = _srm
  on conflict (marche_id, code) do nothing;

  update public.modeles_export e
     set nom = 'État journalier ' || m.client_sigle
    from public.marches m
   where m.id = e.marche_id and e.marche_id = _demo and e.nom = 'État journalier'
     and nullif(btrim(m.client_sigle), '') is not null;

  insert into public.modeles_export (marche_id, nom, jeu, colonnes, regroupement, filtres, format, orientation, ordre, actif, saisi_par)
  select _demo, e.nom, e.jeu, e.colonnes, e.regroupement, e.filtres, e.format, e.orientation, e.ordre, e.actif, null
    from public.modeles_export e where e.marche_id = _srm
  on conflict (marche_id, nom) do nothing;

  -- ---------------------------------------------------------------------------
  -- 2. Référentiels copiés
  -- ---------------------------------------------------------------------------
  insert into public.zones (id, marche_id, numero, code, libelle, lineaire_m, q_exige_m3h, geom, actif)
  select md5('demo:' || z.id)::uuid, _demo, z.numero, z.code, z.libelle, z.lineaire_m, z.q_exige_m3h, z.geom, z.actif
    from public.zones z where z.marche_id = _srm;

  insert into public.secteurs (id, marche_id, zone_id, code, libelle, lineaire_m, geom, ordre, actif)
  select md5('demo:' || s.id)::uuid, _demo, md5('demo:' || s.zone_id)::uuid, s.code, s.libelle, s.lineaire_m,
         s.geom, s.ordre, s.actif
    from public.secteurs s where s.marche_id = _srm;

  insert into public.phases (marche_id, code, libelle, ordre, date_debut, date_fin)
  select _demo, p.code, p.libelle, p.ordre, p.date_debut - 60, p.date_fin - 60
    from public.phases p where p.marche_id = _srm;

  insert into public.equipes (id, marche_id, type, numero, libelle, actif)
  select md5('demo:' || e.id)::uuid, _demo, e.type, e.numero, e.libelle, e.actif
    from public.equipes e where e.marche_id = _srm;
  insert into public.equipes (id, marche_id, type, numero, libelle) values
    ('de000000-0000-4000-8000-020000000091', _demo, 'reparation', 91, 'Réparation A (démo)'),
    ('de000000-0000-4000-8000-020000000092', _demo, 'reparation', 92, 'Réparation B (démo)')
  on conflict (marche_id, type, numero) do nothing;

  insert into public.ouvriers (id, marche_id, nom_complet) values
    ('de000000-0000-4000-8000-030000000001', _demo, 'Ouvrier démo 1'),
    ('de000000-0000-4000-8000-030000000002', _demo, 'Ouvrier démo 2'),
    ('de000000-0000-4000-8000-030000000003', _demo, 'Ouvrier démo 3'),
    ('de000000-0000-4000-8000-030000000004', _demo, 'Ouvrier démo 4');

  insert into public.prix (id, marche_id, numero, ordre, designation, unite, quantite_marche, pu_ht,
                           famille, materiaux, diametre_min_mm, diametre_max_mm, hors_bordereau, actif)
  select md5('demo:' || p.id)::uuid, _demo, p.numero, p.ordre, p.designation, p.unite, p.quantite_marche, p.pu_ht,
         p.famille, p.materiaux, p.diametre_min_mm, p.diametre_max_mm, p.hors_bordereau, p.actif
    from public.prix p where p.marche_id = _srm;

  insert into public.natures_refection (id, marche_id, code, libelle_fr, libelle_ar, symbole, emplacement,
                                        prix_id, necessite_refection, ordre, actif)
  select md5('demo:' || n.id)::uuid, _demo, n.code, n.libelle_fr, n.libelle_ar, n.symbole, n.emplacement,
         case when n.prix_id is not null then md5('demo:' || n.prix_id)::uuid end,
         n.necessite_refection, n.ordre, n.actif
    from public.natures_refection n where n.marche_id = _srm;

  insert into public.motifs (id, marche_id, categorie, code, libelle_fr, libelle_ar, terrassement_paye, ordre, actif)
  select md5('demo:' || m.id)::uuid, _demo, m.categorie, m.code, m.libelle_fr, m.libelle_ar,
         m.terrassement_paye, m.ordre, m.actif
    from public.motifs m where m.marche_id = _srm;

  insert into public.catalogue_pieces (id, marche_id, designation, famille, unite, prix_suggere_id, numero_source, actif)
  select md5('demo:' || c.id)::uuid, _demo, c.designation, c.famille, c.unite,
         case when c.prix_suggere_id is not null then md5('demo:' || c.prix_suggere_id)::uuid end,
         c.numero_source, c.actif
    from public.catalogue_pieces c where c.marche_id = _srm;

  -- Ordres de service propres au marché DEMO, arrêt de travaux de trois jours
  insert into public.ordres_service (id, marche_id, numero, date_os, objet, date_effet, nature) values
    ('de000000-0000-4000-8000-010000000001', _demo, '01/DEMO', '2026-07-20', 'Notification de l''approbation du marché', null, 'notification'),
    ('de000000-0000-4000-8000-010000000002', _demo, '02/DEMO', '2026-07-27', 'Commencement de l''exécution des travaux', '2026-08-03', 'commencement'),
    ('de000000-0000-4000-8000-010000000003', _demo, '03/DEMO', '2026-09-07', 'Arrêt des travaux (coupure générale programmée)', '2026-09-08', 'arret'),
    ('de000000-0000-4000-8000-010000000004', _demo, '04/DEMO', '2026-09-10', 'Reprise des travaux', '2026-09-11', 'reprise');
  update public.marches set os_commencement_id = 'de000000-0000-4000-8000-010000000002' where id = _demo;

  insert into public.arrets_travaux (id, marche_id, date_arret, os_arret_id, motif, date_reprise, os_reprise_id) values
    ('de000000-0000-4000-8000-600000000001', _demo, '2026-09-08', 'de000000-0000-4000-8000-010000000003',
     'Coupure générale programmée par le maître d''ouvrage (essais des réservoirs)', '2026-09-11',
     'de000000-0000-4000-8000-010000000004');

  -- ---------------------------------------------------------------------------
  -- 3. Fuites (numéros posés ici, compteur aligné ensuite)
  -- ---------------------------------------------------------------------------
  insert into public.fuites (
    id, marche_id, numero, reference_srm, origine, visibilite, ouvrage, zone_id, secteur_id, equipe_id,
    adresse, position, precision_gps_m, date_detection, date_communication_srm, validation_srm_le,
    validation_srm_par, avis_terrassement_srm_le, fuite_liee_id, observation
  )
  select
    ('de000000-0000-4000-8000-1' || lpad(v.n::text, 11, '0'))::uuid, _demo, v.n, v.ref,
    v.origine::public.origine_fuite, v.visibilite::public.visibilite_fuite, v.ouvrage,
    s.zone_id, s.id, e.id, v.adresse,
    extensions.st_geogfromtext(format('SRID=4326;POINT(%s %s)', v.lon, v.lat)), 4.5,
    v.detection::timestamptz, v.communication::timestamptz, v.validation::timestamptz,
    case when v.validation is not null then 'Représentant SRM (démo)' end,
    v.avis::timestamptz,
    case when v.liee is not null then ('de000000-0000-4000-8000-1' || lpad(v.liee::text, 11, '0'))::uuid end,
    v.observation
  from (values
    -- n, détection, origine, référence, visibilité, ouvrage, secteur, adresse, lat, lon,
    -- communiquée, validée, avis terrassement, équipe détection, fuite liée, observation
    ( 1, '2026-08-04 09:20+01', 'srm',    '101-214-003', 'visible',   'branchement', 'azengot',            'Rue Azengot, face n° 12',                     34.69520, -1.89680, '2026-08-04 09:20+01', '2026-08-06 10:00+01', '2026-08-05 08:00+01', 1, null::int, null),
    ( 2, '2026-08-06 15:00+01', 'stepag', '101-230-017', 'invisible', 'branchement', 'andalous',           'Bd des Andalous, angle rue 7',                34.69810, -1.90120, '2026-08-06 16:30+01', '2026-08-08 09:30+01', '2026-08-07 08:00+01', 2, null, null),
    ( 3, '2026-08-10 08:40+01', 'srm',    '102-118-004', 'visible',   'conduite',    'qods_bas',           'Av. Al Qods, devant la pharmacie',            34.69180, -1.89250, '2026-08-10 08:40+01', '2026-08-12 11:00+01', '2026-08-11 07:45+01', 1, null, null),
    ( 4, '2026-08-12 10:10+01', 'stepag', '103-402-011', 'invisible', 'branchement', 'maksam_kharoub',     'Rue Maksam, lot 45',                          34.70030, -1.88900, '2026-08-12 11:00+01', '2026-08-13 09:00+01', '2026-08-12 12:00+01', 3, null, null),
    ( 5, '2026-08-18 11:30+01', 'srm',    '101-305-008', 'visible',   'branchement', 'chateau_sidi_aissa', 'Derb Sidi Aissa, n° 3',                       34.68900, -1.90500, '2026-08-18 11:30+01', '2026-08-19 15:00+01', '2026-08-19 08:00+01', 2, null, null),
    ( 6, '2026-08-20 14:15+01', 'stepag', '102-140-021', 'visible',   'branchement', 'qods_haut_chu_mouhoub_iriss', 'Rue Iriss, n° 28',                   34.69350, -1.88800, '2026-08-20 15:00+01', '2026-08-22 10:00+01', '2026-08-21 08:00+01', 4, null, null),
    ( 7, '2026-08-25 09:05+01', 'srm',    '101-322-002', 'visible',   'branchement', 'ballaoui_bas_irfane', 'Quartier Irfane, rue 14',                    34.69900, -1.88350, '2026-08-25 09:05+01', '2026-08-27 09:00+01', '2026-08-26 08:00+01', 1, null, null),
    ( 8, '2026-08-27 10:45+01', 'srm',    '102-150-009', 'visible',   'branchement', 'maafa_bekay_bas',    'Rue Maafa, n° 61',                            34.69600, -1.88600, '2026-08-27 10:45+01', null, null, 3, null, 'Fuite réparée par la SRM avant l''intervention'),
    ( 9, '2026-08-28 16:20+01', 'stepag', '103-415-006', 'invisible', 'branchement', 'andalous',           'Rue Ibn Tachfine, n° 90',                     34.69700, -1.90300, '2026-08-28 17:00+01', '2026-09-01 09:00+01', '2026-08-31 08:00+01', 2, null, null),
    (10, '2026-08-29 08:50+01', 'srm',    '104-512-014', 'visible',   'branchement', 'derfoufi_zerktouni', 'Bd Zerktouni, n° 112',                        34.68200, -1.91050, '2026-08-29 08:50+01', '2026-09-02 10:00+01', '2026-09-01 08:00+01', 4, null, null),
    (11, '2026-09-02 09:40+01', 'stepag', '104-520-003', 'invisible', 'branchement', 'allal_ben_abdellah', 'Rue Allal Ben Abdellah, n° 7',                34.68010, -1.91400, '2026-09-02 10:30+01', '2026-09-04 09:00+01', '2026-09-03 08:00+01', 1, null, null),
    (12, '2026-09-04 07:55+01', 'srm',    '104-533-010', 'visible',   'conduite',    'oued_makhazine',     'Rue Oued Makhazine, angle rue de Tanger',     34.67850, -1.91220, '2026-09-04 07:55+01', '2026-09-07 09:00+01', '2026-09-05 07:30+01', 2, null, null),
    (13, '2026-09-07 08:30+01', 'stepag', '105-610-002', 'invisible', 'branchement', 'mohammadi_interieur', 'Rue Mohammadi, n° 19',                       34.67600, -1.91700, '2026-09-07 09:00+01', '2026-09-07 17:00+01', '2026-09-07 10:00+01', 3, null, null),
    (14, '2026-09-14 10:20+01', 'srm',    '105-622-008', 'visible',   'branchement', 'mauritanie_hassani', 'Rue de Mauritanie, n° 5',                     34.67450, -1.91010, '2026-09-14 10:20+01', '2026-09-17 09:00+01', '2026-09-15 08:00+01', 4, null, null),
    (15, '2026-09-17 11:10+01', 'srm',    '106-701-001', 'visible',   null,          'benkhirane',         'Rue Benkhirane, n° 33',                       34.67300, -1.90600, '2026-09-17 11:10+01', null, null, 1, null, null),
    (16, '2026-09-21 09:00+01', 'stepag', '103-402-011', 'invisible', 'branchement', 'maksam_kharoub',     'Rue Maksam, lot 45 (à 6 m de la fuite N° 4)', 34.70035, -1.88905, '2026-09-21 09:45+01', '2026-09-23 09:00+01', '2026-09-22 08:00+01', 3, 4,    'Re-détection près de la fuite N° 4'),
    (17, '2026-09-22 07:30+01', 'srm',    '107-801-005', 'visible',   'conduite',    'tairet',             'Route de Tairet, PK 1+200',                   34.66500, -1.92500, '2026-09-22 07:30+01', '2026-09-24 10:00+01', '2026-09-23 07:00+01', 2, null, 'Conduite PVC DN 250'),
    (18, '2026-09-24 10:00+01', 'stepag', '107-812-019', 'invisible', 'branchement', 'sidi_driss',         'Rue Sidi Driss, n° 48',                       34.66800, -1.91900, '2026-09-24 11:00+01', null, null, 4, null, null),
    (19, '2026-09-26 15:30+01', 'stepag', '108-905-007', 'invisible', 'branchement', 'el_boustane',        'Lotissement El Boustane, villa 12',           34.67000, -1.92800, '2026-09-26 16:00+01', null, null, 1, null, null),
    (20, '2026-09-29 09:15+01', 'srm',    '15-645-1',    'visible',   'branchement', 'tazaghine',          'Rue Tazaghine, n° 2',                         34.66200, -1.92200, '2026-09-29 09:15+01', '2026-10-01 09:00+01', null, 2, null, 'Référence mal saisie (format)'),
    (21, '2026-09-30 10:40+01', 'stepag', '108-911-013', 'invisible', 'branchement', 'mbasso',             'Quartier Mbasso, rue 3',                      34.66400, -1.93000, '2026-09-30 11:30+01', '2026-10-02 16:00+01', '2026-10-01 08:00+01', 3, null, null),
    (22, '2026-10-01 10:15+01', 'stepag', '109-001-004', 'invisible', 'branchement', 'lazaret_bas',        'Bd Lazaret, n° 140',                          34.67200, -1.93500, '2026-10-01 11:00+01', null, null, 4, null, null),
    (23, '2026-10-02 11:40+01', 'stepag', null,          'invisible', 'conduite',    'sidi_yahya',         'Av. Sidi Yahya, devant l''école',             34.65800, -1.90800, null, null, null, 1, null, 'Pas encore communiquée au maître d''ouvrage'),
    (24, '2026-10-02 16:05+01', 'srm',    '109-014-002', 'visible',   'branchement', 'pam',                'Quartier PAM, rue 21',                        34.65600, -1.90400, '2026-10-02 16:05+01', null, '2026-10-03 08:00+01', 2, null, null),
    (25, '2026-10-03 09:30+01', 'srm',    '109-020-011', 'visible',   'branchement', 'medina',             'Médina, derb Lamkadem',                       34.68300, -1.90500, '2026-10-03 09:30+01', null, null, 3, null, null)
  ) v (n, detection, origine, ref, visibilite, ouvrage, secteur, adresse, lat, lon,
       communication, validation, avis, equipe, liee, observation)
  join public.secteurs s on s.marche_id = _demo and s.code = v.secteur
  join public.equipes e on e.marche_id = _demo and e.type = 'detection' and e.numero = v.equipe
  order by v.n;

  insert into private.compteurs (marche_id, cle, valeur) values (_demo, 'fuite', 25)
  on conflict (marche_id, cle) do update set valeur = greatest(private.compteurs.valeur, excluded.valeur);

  -- ---------------------------------------------------------------------------
  -- 4. Réparations (les lignes de quantités et les statuts suivent par déclencheur)
  -- ---------------------------------------------------------------------------
  insert into public.reparations (
    id, marche_id, fuite_id, resultat, motif_id, realisee_le, equipe_id, ouvrage, materiau, diametre_mm,
    representant_srm, tuyau_repare, robinet_pec_change, collier_pec_change, bouche_a_cle_mise_a_niveau,
    element_remplace, longueur_pe_m, fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m,
    emplacement, nature_revetement_id, observation
  )
  select
    ('de000000-0000-4000-8000-2' || lpad(v.r::text, 11, '0'))::uuid, _demo,
    ('de000000-0000-4000-8000-1' || lpad(v.n::text, 11, '0'))::uuid,
    v.resultat::public.resultat_reparation, mo.id, v.le::timestamptz,
    ('de000000-0000-4000-8000-0200000000' || v.equipe)::uuid,
    v.ouvrage, v.materiau, v.dn, case when v.resultat <> 'en_cours' then 'Représentant SRM (démo)' end,
    v.tuyau, v.robinet, v.collier, v.bac, v.element, v.pe, v.l, v.lg, v.p,
    v.emplacement::public.emplacement_fouille, nr.id, v.observation
  from (values
    -- r, n, résultat, motif, date, équipe, ouvrage, matériau, DN, tuyau, robinet, collier, bouche à clé,
    -- élément remplacé, PE (m), fouille L, l, p, emplacement, revêtement, observation
    ( 1,  1, 'reparee',     null::text,        '2026-08-05 10:30+01', 91, 'branchement', 'polyethylene', 25,  true,  false, false, false, false, null::numeric, 1.20, 0.60, 0.80, 'trottoir',        'beton',                 null::text),
    ( 2,  2, 'reparee',     null,              '2026-08-07 09:00+01', 92, 'branchement', 'polyethylene', 25,  false, true,  false, true,  false, null, 1.00, 0.80, 1.00, 'chaussee',        'enrobe_a_chaud',        null),
    ( 3,  3, 'reparee',     null,              '2026-08-11 14:00+01', 91, 'conduite',    'pvc',          110, true,  false, false, false, true,  null, 2.50, 1.00, 1.40, 'chaussee',        'enrobe_a_chaud',        'Élément de conduite remplacé'),
    ( 4,  4, 'reparee',     null,              '2026-08-12 16:00+01', 92, 'branchement', 'polyethylene', 32,  true,  false, true,  false, false, null, 1.00, 0.60, 0.70, 'terrain_naturel', 'terrain_naturel',       null),
    ( 5,  5, 'non_reparee', 'sondage_negatif', '2026-08-19 09:30+01', 91, 'branchement', null,           null, false, false, false, false, false, null, 1.00, 0.60, 0.80, 'terrain_naturel', 'terrain_naturel',       'Pas de fuite à l''ouverture'),
    ( 6,  6, 'reparee',     null,              '2026-08-21 08:45+01', 92, 'branchement', null,           null, false, false, false, true,  false, null, 0.50, 0.50, 0.40, 'trottoir',        'mosaique',              'Bouche à clé enterrée remise à niveau'),
    ( 7,  7, 'reparee',     null,              '2026-08-26 10:00+01', 91, 'branchement', 'polyethylene', 20,  true,  false, false, false, false, null, 1.10, 0.60, 0.80, 'trottoir',        'carreaux_ciment',       null),
    ( 8,  8, 'non_reparee', 'reparee_par_srm', '2026-08-28 09:00+01', 92, 'branchement', null,           null, false, false, false, false, false, null, null, null, null, null,              null,                    'Constat : déjà réparée par la SRM'),
    ( 9,  9, 'reparee',     null,              '2026-08-31 11:00+01', 91, 'branchement', 'polyethylene', 25,  true,  false, false, false, false, null, 1.20, 0.70, 0.90, 'chaussee',        'enrobe_a_chaud',        null),
    (10, 10, 'reparee',     null,              '2026-09-01 10:00+01', 92, 'branchement', 'polyethylene', 20,  false, false, true,  false, false, null, 1.00, 0.60, 0.80, 'trottoir',        'beton',                 null),
    (11, 11, 'reparee',     null,              '2026-09-03 09:15+01', 91, 'branchement', 'polyethylene', 40,  true,  false, false, false, false, null, 1.30, 0.70, 1.00, 'trottoir',        'granito_lave',          null),
    (12, 12, 'reparee',     null,              '2026-09-05 08:30+01', 92, 'conduite',    'amiante_ciment', 150, true, false, false, false, true,  null, 2.00, 1.00, 1.50, 'chaussee',        'enrobe_a_chaud',        'Élément de conduite remplacé'),
    (13, 13, 'reparee',     null,              '2026-09-07 14:30+01', 91, 'branchement', 'polyethylene', 25,  true,  false, false, false, false, null, 1.00, 0.60, 0.90, 'chaussee',        'enrobe_resine_a_froid', null),
    (14, 14, 'en_cours',    null,              '2026-09-15 09:00+01', 92, 'branchement', 'polyethylene', 32,  false, false, false, false, false, null, 1.20, 0.60, 0.90, 'trottoir',        'beton',                 'Fouille ouverte ; manchon 32 à approvisionner'),
    (54, 14, 'reparee',     null,              '2026-09-16 10:00+01', 92, 'branchement', 'polyethylene', 32,  true,  false, false, false, false, null, 1.20, 0.60, 0.90, 'trottoir',        'beton',                 'Réparation terminée le lendemain'),
    (15, 15, 'non_reparee', 'assainissement',  '2026-09-18 10:00+01', 91, null,          null,           null, false, false, false, false, false, null, null, null, null, null,              null,                    null),
    (16, 16, 'reparee',     null,              '2026-09-22 11:30+01', 92, 'branchement', 'polyethylene', 32,  false, false, true,  true,  false, null, 1.00, 0.60, 0.80, 'terrain_naturel', 'terrain_naturel',       null),
    (17, 17, 'reparee',     null,              '2026-09-23 08:00+01', 91, 'conduite',    'pvc',          250, true,  false, false, false, true,  null, 3.00, 1.20, 1.60, 'chaussee',        'enrobe_a_chaud',        'Élément de conduite remplacé'),
    (18, 18, 'reparee',     null,              '2026-09-25 09:00+01', 92, 'branchement', 'polyethylene', 32,  true,  false, false, false, false, 2.50, 2.40, 0.60, 0.90, 'trottoir',        'beton',                 null),
    (19, 19, 'non_reparee', 'refus_abonne',    '2026-09-27 10:00+01', 91, 'branchement', null,           null, false, false, false, false, false, null, null, null, null, null,              null,                    'L''abonné refuse l''ouverture devant son entrée'),
    (20, 20, 'reparee',     null,              '2026-09-30 09:00+01', 92, 'branchement', 'polyethylene', 20,  true,  false, false, false, false, null, 0.90, 0.50, 0.70, 'terrain_naturel', 'terrain_naturel',       null),
    (21, 21, 'reparee',     null,              '2026-10-01 10:30+01', 91, 'branchement', 'polyethylene', 25,  false, true,  false, false, false, null, 1.00, 0.80, 0.90, 'trottoir',        'carreaux_ciment',       null),
    (24, 24, 'en_cours',    null,              '2026-10-03 15:00+01', 92, 'branchement', 'polyethylene', 40,  false, false, false, false, false, null, 1.00, 0.70, 0.90, 'trottoir',        'beton',                 'Fouille ouverte ; robinet PEC 40/50 à approvisionner')
  ) v (r, n, resultat, motif, le, equipe, ouvrage, materiau, dn, tuyau, robinet, collier, bac,
       element, pe, l, lg, p, emplacement, revetement, observation)
  left join public.motifs mo on mo.marche_id = _demo and mo.categorie = 'sans_reparation' and mo.code = v.motif
  left join public.natures_refection nr on nr.marche_id = _demo and nr.code = v.revetement
  order by v.le;

  insert into public.reparation_ouvriers (marche_id, reparation_id, ouvrier_id)
  select _demo, ('de000000-0000-4000-8000-2' || lpad(v.r::text, 11, '0'))::uuid,
         ('de000000-0000-4000-8000-03000000000' || v.o)::uuid
    from (values (1, 1), (1, 2), (3, 1), (3, 2), (3, 3), (12, 3), (12, 4), (17, 1), (17, 2), (17, 3), (17, 4)) v (r, o);

  insert into public.reparation_pieces (marche_id, reparation_id, piece_id, designation_libre, quantite)
  select _demo, ('de000000-0000-4000-8000-2' || lpad(v.r::text, 11, '0'))::uuid, c.id, v.libre, v.q
    from (values
      ( 1, 'Manchon droit 25/25', null::text, 2.0), ( 1, 'PEHD 19/25', null, 1.5),
      ( 2, 'Robinet PEC 20/25', null, 1), ( 2, 'Tabernacle', null, 1), ( 2, 'Tube PVC 90', null, 1),
      ( 3, 'Joint Gibault 110', null, 2), ( 3, 'Tuyau PVC D 110', null, 1.5),
      ( 4, 'Collier PEC 63/20', null, 1), ( 4, 'Manchon droit 32/32', null, 1),
      ( 6, 'Bouche à clé carrée', null, 1), ( 6, 'Tube PVC 90', null, 1),
      ( 7, 'Manchon droit 20/20', null, 2),
      ( 9, 'Manchon droit 25/25', null, 2),
      (10, 'Collier PEC 50/20', null, 1), (10, 'Tabernacle', null, 1),
      (11, 'Manchon droit 40/40', null, 2), (11, 'PEHD 33/40', null, 1),
      (12, 'Joint Gibault 150', null, 2), (12, 'Tuyau AC D 150', null, 2),
      (13, 'Manchon droit 25/25', null, 2),
      (54, 'Manchon droit 32/32', null, 2), (54, 'PEHD 26/32', null, 1),
      (16, 'Collier PEC 63/20', null, 1), (16, 'Bouche à clé carrée', null, 1),
      (17, 'Joint Gibault  250', null, 2), (17, 'Tuyau PVC D 250', null, 3),
      (18, 'Manchon droit 32/32', null, 2), (18, 'PEHD 26/32', null, 2.5),
      (20, 'Manchon droit 20/20', null, 1),
      (21, 'Robinet PEC 20/25', null, 1), (21, 'Tabernacle', null, 1),
      (21, null, 'Bouche à clé ronde (hors catalogue)', 1)
    ) v (r, piece, libre, q)
    left join public.catalogue_pieces c on c.marche_id = _demo and c.designation = v.piece;

  -- Réfections exécutées avant l'arrêt du lot d'août (longueur et largeur reprises de la fouille)
  insert into public.refections (id, marche_id, fuite_id, resultat, motif_id, realisee_le, nature_id, equipe_id)
  select ('de000000-0000-4000-8000-3' || lpad(v.n::text, 11, '0'))::uuid, _demo,
         ('de000000-0000-4000-8000-1' || lpad(v.n::text, 11, '0'))::uuid,
         v.resultat::public.resultat_refection, mo.id, v.le::timestamptz, nr.id,
         ('de000000-0000-4000-8000-0200000000' || v.equipe)::uuid
    from (values
      ( 1, 'faite',     null::text,               '2026-08-08 11:00+01', 'beton',           91),
      ( 2, 'faite',     null,                     '2026-08-20 09:00+01', 'enrobe_a_chaud',  92),
      ( 6, 'faite',     null,                     '2026-08-22 10:00+01', 'mosaique',        92),
      ( 7, 'non_faite', 'faite_par_proprietaire', '2026-08-28 15:00+01', null,              91),
      (11, 'faite',     null,                     '2026-09-07 15:00+01', 'granito_lave',    91),
      (12, 'faite',     null,                     '2026-09-25 10:00+01', 'enrobe_a_chaud',  92),
      (14, 'faite',     null,                     '2026-09-19 09:00+01', 'beton',           92),
      (17, 'faite',     null,                     '2026-09-30 10:00+01', 'enrobe_a_chaud',  91),
      (18, 'faite',     null,                     '2026-09-28 11:00+01', 'beton',           92),
      (21, 'faite',     null,                     '2026-10-02 10:00+01', 'carreaux_ciment', 91)
    ) v (n, resultat, motif, le, nature, equipe)
    left join public.motifs mo on mo.marche_id = _demo and mo.categorie = 'sans_refection' and mo.code = v.motif
    left join public.natures_refection nr on nr.marche_id = _demo and nr.code = v.nature
   order by v.le;

  -- Surface de réfection corrigée à la main (ligne « manuelle ») sur la fuite N° 21
  update public.lignes_quantites
     set quantite = 1.000, origine = 'manuel',
         commentaire = 'Surface relevée contradictoirement : 1,00 m²'
   where refection_id = 'de000000-0000-4000-8000-300000000021';

  -- ---------------------------------------------------------------------------
  -- 5. Lot d'attachement N° 01 (août), arrêté comme le fait arreter_attachement
  -- ---------------------------------------------------------------------------
  insert into public.attachements (id, marche_id, intitule, date_arret, periode_debut, periode_fin,
                                   lieu_travaux, os_id, observation)
  values ('de000000-0000-4000-8000-400000000001', _demo, 'Attachement d''août 2026', '2026-08-31',
          '2026-08-03', '2026-08-31',
          'Zone université : secteurs Azengot, Andalous, Qods Bas, Qods Haut, Maksam-Kharoub, Château Sidi Aissa, Ballaoui Bas-Irfane',
          'de000000-0000-4000-8000-010000000002', 'Lot de démonstration');

  insert into public.attachement_lignes (marche_id, attachement_id, nature, fuite_id, prix_id)
  select distinct _demo, 'de000000-0000-4000-8000-400000000001'::uuid, 'solde', l.fuite_id, l.prix_id
    from public.lignes_quantites l
   where l.marche_id = _demo and l.supprime_le is null
     and l.fuite_id in (select f.id from public.fuites f where f.marche_id = _demo and f.numero between 1 and 7);

  insert into public.attachement_lignes (marche_id, attachement_id, nature, prix_id, quantite, designation, zone_id)
  select _demo, 'de000000-0000-4000-8000-400000000001', 'libre', p.id, 18500,
         'Balayage des secteurs Azengot, Andalous et Qods Bas (août 2026)', z.id
    from public.prix p
    join public.zones z on z.marche_id = _demo and z.numero = 1
   where p.marche_id = _demo and p.numero = '1';

  update public.attachement_lignes l
     set quantite = private.reste_a_attacher(l.fuite_id, l.prix_id)
   where l.attachement_id = 'de000000-0000-4000-8000-400000000001' and l.nature = 'solde';
  delete from public.attachement_lignes l
   where l.attachement_id = 'de000000-0000-4000-8000-400000000001' and l.nature = 'solde' and l.quantite = 0;
  update public.attachement_lignes l
     set prix_numero = p.numero, prix_designation = p.designation, unite = p.unite, pu_ht = p.pu_ht
    from public.prix p
   where p.id = l.prix_id and l.attachement_id = 'de000000-0000-4000-8000-400000000001';

  update public.attachements
     set statut = 'arrete', numero = 1, arrete_le = '2026-09-01 10:00+01',
         accepte_le = '2026-09-05', accepte_par = 'Représentant SRM (démo)'
   where id = 'de000000-0000-4000-8000-400000000001';
  insert into private.compteurs (marche_id, cle, valeur) values (_demo, 'attachement', 1)
  on conflict (marche_id, cle) do update set valeur = greatest(private.compteurs.valeur, excluded.valeur);

  update public.fuites f
     set verrouillee_le = '2026-09-01 10:00+01'
   where f.marche_id = _demo
     and f.id in (select l.fuite_id from public.attachement_lignes l
                   where l.attachement_id = 'de000000-0000-4000-8000-400000000001');

  -- ---------------------------------------------------------------------------
  -- 6. Après l'arrêt du lot d'août : réfection de la fuite N° 3 faite en
  --    septembre, profondeur de fouille de la fuite N° 2 corrigée (régularisation)
  -- ---------------------------------------------------------------------------
  insert into public.refections (id, marche_id, fuite_id, resultat, realisee_le, nature_id, equipe_id)
  select 'de000000-0000-4000-8000-300000000003', _demo, 'de000000-0000-4000-8000-100000000003',
         'faite', '2026-09-14 10:00+01', nr.id, 'de000000-0000-4000-8000-020000000091'
    from public.natures_refection nr where nr.marche_id = _demo and nr.code = 'enrobe_a_chaud';

  update public.reparations
     set fouille_profondeur_m = 1.20,
         observation = 'Profondeur corrigée de 1,00 à 1,20 m après relevé contradictoire du 15/09/2026'
   where id = 'de000000-0000-4000-8000-200000000002';

  -- ---------------------------------------------------------------------------
  -- 7. Journal des événements
  -- ---------------------------------------------------------------------------
  insert into public.evenements (id, marche_id, date_evenement, heure, categorie_id, titre, description,
                                 participants, lieu, zone_id, secteur_id)
  select ('de000000-0000-4000-8000-50000000000' || v.k)::uuid, _demo, v.jour::date, v.heure::time, c.id,
         v.titre, v.description, v.participants, v.lieu, s.zone_id, s.id
    from (values
      (1, '2026-08-03', '09:00', 'reunion_chantier', 'Réunion de démarrage',
       'Présentation du planning de balayage et des équipes ; circuit de communication des fuites.',
       'Maître d''ouvrage : chef du service exploitation (démo) ; titulaire : directeur de projet (démo)',
       'Siège du maître d''ouvrage, Oujda', null::text),
      (2, '2026-09-02', '10:00', 'sortie_reception', 'Réception contradictoire des réparations d''août',
       'Visite de 7 fuites réparées ; réserves levées sur la fuite N° 2 (profondeur à relever).',
       'Représentant SRM (démo) ; chef d''équipe Réparation A (démo)', 'Zone université', 'andalous'),
      (3, '2026-09-24', '08:30', 'sortie_audit', 'Audit des fouilles en cours',
       'Contrôle du blindage et de la signalisation de la fouille DN 250.',
       'Auditeur du maître d''ouvrage (démo)', 'Route de Tairet', 'tairet'),
      (4, '2026-10-01', '11:00', 'sortie_laboratoire', 'Prélèvement d''eau après réparation',
       'Prélèvement pour analyse bactériologique après la réparation de la conduite DN 250.',
       'Laboratoire (démo) ; représentant SRM (démo)', 'Route de Tairet', 'tairet')
    ) v (k, jour, heure, categorie, titre, description, participants, lieu, secteur)
    join public.categories_evenement c on c.marche_id = _demo and c.code = v.categorie
    left join public.secteurs s on s.marche_id = _demo and s.code = v.secteur;

  -- ---------------------------------------------------------------------------
  -- 8. Contrôles : la migration échoue (et rien n'est appliqué) si un
  --    scénario ne donne pas le résultat attendu
  -- ---------------------------------------------------------------------------
  if (select count(*) from public.fuites where marche_id = _demo) <> 25 then
    raise exception 'DEMO : 25 fuites attendues';
  end if;
  if (select string_agg(statut::text || '=' || n, ' ' order by statut)
        from (select statut, count(*) n from public.fuites where marche_id = _demo group by statut) x)
     <> 'detectee=3 en_reparation=1 reparee=3 achevee=14 sans_reparation=4' then
    raise exception 'DEMO : répartition des statuts inattendue : %',
      (select string_agg(statut::text || '=' || n, ' ' order by statut)
         from (select statut, count(*) n from public.fuites where marche_id = _demo group by statut) x);
  end if;
  if (select count(*) from public.reparation_pieces where marche_id = _demo) <> 32
     or exists (select 1 from public.reparation_pieces
                 where marche_id = _demo and piece_id is null and designation_libre is null) then
    raise exception 'DEMO : pièce introuvable dans le catalogue copié';
  end if;
  if (select count(*) from public.attachement_lignes
       where attachement_id = 'de000000-0000-4000-8000-400000000001') <> 18 then
    raise exception 'DEMO : 18 lignes attendues dans le lot N° 01, % trouvées',
      (select count(*) from public.attachement_lignes where attachement_id = 'de000000-0000-4000-8000-400000000001');
  end if;
  if private.reste_a_attacher('de000000-0000-4000-8000-100000000002',
       (select id from public.prix where marche_id = _demo and numero = '3')) <> 0.160 then
    raise exception 'DEMO : régularisation de terrassement attendue sur la fuite N° 2';
  end if;
end
$$;
