-- =============================================================================
-- Marché de démonstration « DEMO » (formation des agents), demande d'Issam du 2026-10-14.
--
-- Le premier DEMO (20261004230000) a été supprimé par la purge de mise en service du 2026-10-12. Celui-ci :
--   * identifiant propre « de000002-… » : la purge de mise en service (MARCHE_DEMO = « de000000-… ») ne le
--     touche pas ;
--   * paramétrage copié du marché SRM-4500004453 comme « Copier un marché » (private.copier_parametres_marche),
--     fiche du marché comprise (sans logos, ordre de service ni entrepôt Dolibarr) ;
--   * copie du réseau du SRM (tronçons et nœuds, rattachés aux secteurs copiés) pour la carte de balayage ;
--     tuiles et fond de carte à produire ensuite dans le panneau (Paramètres › Réseau) ;
--   * 10 fuites fictives de statuts différents : 3 détectées, 2 en réparation, 2 réparées (réfection à faire),
--     2 achevées, 1 sans réparation ; dates relatives au jour du déploiement ;
--   * aucune notification ni envoi push (lignes créées par les déclencheurs effacées dans la même transaction).
-- Les comptes ne sont pas affectés ici : l'administrateur le fait dans Utilisateurs (pas de nom dans le dépôt).
--
-- private.creer_marche_demo(code) ne fait rien si le marché « de000002-… » ou le code existe déjà.
-- =============================================================================

create or replace function private.creer_marche_demo(p_code text default 'DEMO')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _srm uuid := (select id from public.marches where code = 'SRM-4500004453');
  _demo constant uuid := 'de000002-0000-4000-8000-000000000000';
  _auteur uuid := (select id from public.profils where est_admin and actif order by cree_le limit 1);
  _statuts text;
begin
  if _srm is null
     or exists (select 1 from public.marches where id = _demo or code = p_code) then
    return null;
  end if;

  -- 1. Fiche et paramétrage (comme copier_marche, avec la fiche complète)
  insert into public.marches (id, code, numero, intitule, client, ville)
  select _demo, p_code, 'DEMO-' || m.numero, 'DÉMONSTRATION (données fictives) : ' || m.intitule, m.client, m.ville
    from public.marches m where m.id = _srm;

  perform private.copier_parametres_marche(_srm, _demo);

  update public.marches d
     set numero_appel_offres = s.numero_appel_offres, date_notification = s.date_notification,
         date_commencement = s.date_commencement, duree_mois = s.duree_mois, duree_jours = s.duree_jours,
         date_fin = s.date_fin, taux_majoration = s.taux_majoration, taux_tva = s.taux_tva,
         taux_retenue_garantie = s.taux_retenue_garantie, plafond_retenue_garantie = s.plafond_retenue_garantie,
         rayon_redetection_m = s.rayon_redetection_m, delai_alerte_reparation_h = s.delai_alerte_reparation_h,
         delai_prealerte_refection_chaussee_j = s.delai_prealerte_refection_chaussee_j,
         delai_refection_chaussee_j = s.delai_refection_chaussee_j,
         delai_alerte_refection_trottoir_j = s.delai_alerte_refection_trottoir_j,
         une_unite_par_prix_et_fuite = s.une_unite_par_prix_et_fuite,
         client_sigle = s.client_sigle, client_nom_ar = s.client_nom_ar, client_direction = s.client_direction,
         client_service = s.client_service, client_adresse = s.client_adresse,
         titulaire_nom = s.titulaire_nom, titulaire_nom_ar = s.titulaire_nom_ar,
         titulaire_forme_juridique = s.titulaire_forme_juridique, titulaire_capital = s.titulaire_capital,
         titulaire_adresse = s.titulaire_adresse, titulaire_ice = s.titulaire_ice, titulaire_if = s.titulaire_if,
         titulaire_rc = s.titulaire_rc, titulaire_patente = s.titulaire_patente, titulaire_cnss = s.titulaire_cnss,
         titulaire_telephone = s.titulaire_telephone, titulaire_email = s.titulaire_email,
         titulaire_representant = s.titulaire_representant,
         titulaire_qualite_representant = s.titulaire_qualite_representant,
         montant_ttc = s.montant_ttc, devise = s.devise, jalons_client = s.jalons_client,
         libelle_reference = s.libelle_reference, masque_reference = s.masque_reference,
         longueur_pe_max_m = s.longueur_pe_max_m, seuil_ecart_fournitures_pct = s.seuil_ecart_fournitures_pct,
         suivi_gps_debut = s.suivi_gps_debut, suivi_gps_fin = s.suivi_gps_fin, suivi_gps_jours = s.suivi_gps_jours,
         suivi_gps_pause_min = s.suivi_gps_pause_min, suivi_gps_pause_jour_min = s.suivi_gps_pause_jour_min,
         observation = 'Marché de démonstration pour la formation : données fictives, rien n''est facturé.'
    from public.marches s
   where s.id = _srm and d.id = _demo;

  -- 2. Réseau (mêmes géométries, secteurs copiés : md5(cible:source), comme copier_parametres_marche)
  insert into public.troncons (marche_id, reference, calque, categorie, diametre_mm, materiau, secteur_id, geom, actif)
  select _demo, t.reference, t.calque, t.categorie, t.diametre_mm, t.materiau,
         case when t.secteur_id is not null then md5(_demo || ':' || t.secteur_id)::uuid end, t.geom, t.actif
    from public.troncons t where t.marche_id = _srm;

  insert into public.noeuds (marche_id, reference, type, calque, zone_id, secteur_id, geom, actif)
  select _demo, n.reference, n.type, n.calque,
         case when n.zone_id is not null then md5(_demo || ':' || n.zone_id)::uuid end,
         case when n.secteur_id is not null then md5(_demo || ':' || n.secteur_id)::uuid end, n.geom, n.actif
    from public.noeuds n where n.marche_id = _srm;

  -- 3. Fuites (source « import » : pas de notification à la création)
  insert into public.fuites (
    id, marche_id, numero, reference_srm, origine, visibilite, ouvrage, zone_id, secteur_id, adresse, position,
    precision_gps_m, date_detection, date_communication_srm, nature_degradation_id, diametre_mm, materiau,
    auteur_terrain_id, source_saisie, observation
  )
  select ('de000002-0000-4000-8000-1' || lpad(v.n::text, 11, '0'))::uuid, _demo, v.n, v.ref,
         v.origine::public.origine_fuite, v.visibilite::public.visibilite_fuite, v.ouvrage,
         s.zone_id, s.id, v.adresse,
         extensions.st_geogfromtext(format('SRID=4326;POINT(%s %s)', v.lon, v.lat)), 4.5,
         now() - v.age, now() - v.age, nr.id, v.dn, v.materiau, _auteur, 'import', v.observation
    from (values
      -- n, âge, origine, référence, visibilité, ouvrage, secteur, adresse, lat, lon, dégradation, DN, matériau, observation
      ( 1, interval '2 hours', 'srm',    '101-214-003', 'visible',   'branchement', 'AZENGOT',   'Rue Azengot, face n° 12',          34.69520, -1.89680, 'beton',          25,  'polyethylene', null::text),
      ( 2, interval '1 day',   'stepag', '101-230-017', 'invisible', 'branchement', 'ANDALOUS',  'Bd des Andalous, angle rue 7',     34.69810, -1.90120, 'enrobe_a_chaud', 25,  'polyethylene', null),
      ( 3, interval '3 days',  'srm',    '102-118-004', 'visible',   'conduite',    'QODS-B',    'Av. Al Qods, devant la pharmacie', 34.69180, -1.89250, 'enrobe_a_chaud', 110, 'pvc',          'Non réparée depuis plus de 48 h : alerte'),
      ( 4, interval '2 days',  'stepag', '103-402-011', 'invisible', 'branchement', 'MAKSAM',    'Rue Maksam, lot 45',               34.70030, -1.88900, 'terrain_naturel', 32, 'polyethylene', null),
      ( 5, interval '2 days',  'srm',    '101-305-008', 'visible',   'branchement', 'CHATEAU',   'Derb Sidi Aissa, n° 3',            34.68900, -1.90500, 'beton',          25,  'polyethylene', null),
      ( 6, interval '4 days',  'stepag', '102-140-021', 'visible',   'branchement', 'MAAFA',     'Rue Maafa, n° 61',                 34.69600, -1.88600, 'beton',          20,  'polyethylene', null),
      ( 7, interval '5 days',  'srm',    '104-512-014', 'visible',   'branchement', 'DERFOUFI',  'Bd Zerktouni, n° 112',             34.68200, -1.91050, 'enrobe_a_chaud', 25,  'polyethylene', null),
      ( 8, interval '8 days',  'stepag', '104-520-003', 'invisible', 'branchement', 'ALLAL',     'Rue Allal Ben Abdellah, n° 7',     34.68010, -1.91400, 'granito_lave',   40,  'polyethylene', null),
      ( 9, interval '9 days',  'srm',    '104-533-010', 'visible',   'conduite',    'MAKHAZINE', 'Rue Oued Makhazine, angle rue de Tanger', 34.67850, -1.91220, 'carreaux_ciment', 150, 'amiante_ciment', null),
      (10, interval '6 days',  'stepag', '106-701-001', 'visible',   'branchement', 'BENKHIRANE', 'Rue Benkhirane, n° 33',           34.67300, -1.90600, 'beton',          20,  'polyethylene', 'L''abonné refuse l''ouverture devant son entrée')
    ) v (n, age, origine, ref, visibilite, ouvrage, secteur, adresse, lat, lon, degradation, dn, materiau, observation)
    left join public.secteurs s on s.marche_id = _demo and s.code = v.secteur
    left join public.natures_refection nr on nr.marche_id = _demo and nr.code = v.degradation
   order by v.n;

  insert into private.compteurs (marche_id, cle, valeur) values (_demo, 'fuite', 10)
  on conflict (marche_id, cle) do update set valeur = greatest(private.compteurs.valeur, excluded.valeur);

  -- 4. Réparations (quantités et statuts suivent par déclencheur)
  insert into public.reparations (
    id, marche_id, fuite_id, resultat, motif_id, realisee_le, auteur_terrain_id, source_saisie, ouvrage, materiau,
    diametre_mm, tuyau_repare, robinet_pec_change, collier_pec_change, element_remplace,
    fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m, emplacement, nature_revetement_id, observation
  )
  select ('de000002-0000-4000-8000-2' || lpad(v.n::text, 11, '0'))::uuid, _demo,
         ('de000002-0000-4000-8000-1' || lpad(v.n::text, 11, '0'))::uuid,
         v.resultat::public.resultat_reparation, mo.id, now() - v.age, _auteur, 'import',
         v.ouvrage, v.materiau, v.dn, v.tuyau, v.robinet, v.collier, v.element, v.l, v.lg, v.p,
         v.emplacement::public.emplacement_fouille, nr.id, v.observation
    from (values
      -- n, âge, résultat, motif, ouvrage, matériau, DN, tuyau, robinet, collier, élément, fouille L, l, p, emplacement, revêtement, observation
      ( 4, interval '1 day',    'en_cours',    null::text,     'branchement', 'polyethylene', 32,  false, false, false, false, 1.20::numeric, 0.60::numeric, 0.90::numeric, 'terrain_naturel', 'terrain_naturel', 'Fouille ouverte ; manchon 32 à approvisionner'),
      ( 5, interval '1 day',    'en_cours',    null,           'branchement', 'polyethylene', 25,  false, false, false, false, 1.00, 0.60, 0.80, 'trottoir',        'beton',           'Reprise demain matin'),
      ( 6, interval '3 days',   'reparee',     null,           'branchement', 'polyethylene', 20,  true,  false, false, false, 1.10, 0.60, 0.80, 'trottoir',        'beton',           null),
      ( 7, interval '4 days',   'reparee',     null,           'branchement', 'polyethylene', 25,  false, true,  false, false, 1.00, 0.80, 1.00, 'chaussee',        'enrobe_a_chaud',  null),
      ( 8, interval '7 days',   'reparee',     null,           'branchement', 'polyethylene', 40,  true,  false, false, false, 1.30, 0.70, 1.00, 'trottoir',        'granito_lave',    null),
      ( 9, interval '8 days',   'reparee',     null,           'conduite',    'amiante_ciment', 150, true, false, false, true, 2.00, 1.00, 1.50, 'trottoir',        'carreaux_ciment', 'Élément de conduite remplacé'),
      (10, interval '5 days',   'non_reparee', 'refus_abonne', 'branchement', null,           null, false, false, false, false, null, null, null, null,             null,              'L''abonné refuse l''ouverture devant son entrée')
    ) v (n, age, resultat, motif, ouvrage, materiau, dn, tuyau, robinet, collier, element, l, lg, p, emplacement, revetement, observation)
    left join public.motifs mo on mo.marche_id = _demo and mo.categorie = 'sans_reparation' and mo.code = v.motif
    left join public.natures_refection nr on nr.marche_id = _demo and nr.code = v.revetement
   order by v.age desc;

  -- 5. Réfections (fuites 8 et 9 : achevées)
  insert into public.refections (id, marche_id, fuite_id, resultat, motif_id, realisee_le, nature_id,
                                 auteur_terrain_id, source_saisie)
  select ('de000002-0000-4000-8000-3' || lpad(v.n::text, 11, '0'))::uuid, _demo,
         ('de000002-0000-4000-8000-1' || lpad(v.n::text, 11, '0'))::uuid,
         v.resultat::public.resultat_refection, mo.id, now() - v.age, nr.id, _auteur, 'import'
    from (values
      (8, interval '5 days', 'faite',     null::text,               'granito_lave'),
      (9, interval '6 days', 'non_faite', 'faite_par_proprietaire', null)
    ) v (n, age, resultat, motif, nature)
    left join public.motifs mo on mo.marche_id = _demo and mo.categorie = 'sans_refection' and mo.code = v.motif
    left join public.natures_refection nr on nr.marche_id = _demo and nr.code = v.nature;

  -- 6. Aucune notification (ni push) pour ces données fictives
  delete from public.notifications where marche_id = _demo;

  -- 7. Contrôle : la migration échoue (rien n'est appliqué) si la répartition des statuts n'est pas celle voulue
  select string_agg(statut::text || '=' || n, ' ' order by statut) into _statuts
    from (select statut, count(*) n from public.fuites where marche_id = _demo group by statut) x;
  if _statuts is distinct from 'detectee=3 en_reparation=2 reparee=2 achevee=2 sans_reparation=1' then
    raise exception 'DEMO : répartition des statuts inattendue : %', _statuts;
  end if;

  return _demo;
end
$$;

revoke all on function private.creer_marche_demo(text) from public;

select private.creer_marche_demo();
