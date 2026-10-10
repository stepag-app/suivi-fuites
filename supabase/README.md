# Base de données Supabase : migration 1 (noyau)

Schéma validé par Issam (plan v4). Rien n'est appliqué au projet Supabase tant
qu'Issam ne l'a pas lancé lui-même (voir « Appliquer »).

## Contenu

| Dossier / fichier | Rôle |
|---|---|
| `migrations/20261004090000_fondations.sql` | PostGIS, schéma `private`, types (statuts, rôles, familles de prix…), privilèges par défaut retirés |
| `migrations/20261004090100_noyau_droits.sql` | marchés, profils, affectations, droits CRUD, modèles de rôles, journal, fonctions de sécurité |
| `migrations/20261004090200_parametres_marche.sql` | zones, secteurs, phases, équipes, ouvriers, prix, natures de réfection, motifs, catalogue de pièces, ordres de service |
| `migrations/20261004090300_fuites_interventions.sql` | fuites, réparations, réfections, pièces posées, lignes de quantités, photos ; numérotation, statuts automatiques, verrou, lignes de prix automatiques |
| `migrations/20261004090400_rls_privileges.sql` | règles RLS et privilèges, table par table |
| `migrations/20261004090500_vues_fonctions.sql` | vues `v_fuites` (alertes), `v_pieces_posees`, `v_quantites`, `v_anomalies` ; fonction `rechercher_fuites_proches` |
| `migrations/20261004090600_stockage_photos.sql` | compartiment privé `photos` et ses règles |
| `migrations/20261004090700_donnees_marche_4500004453.sql` | marché SRM Oriental : 13 prix, 5 zones, 34 secteurs, phases, OS, natures, motifs FR/AR, 261 pièces ; contrôle des totaux |
| `migrations/20261004130000_acces_service_role.sql` | droits explicites du rôle `service_role` (fonctions serveur) |
| `migrations/20261004180000_type_donnee_evenements.sql` | type de donnée `evenements` (fichier séparé : une valeur d'énumération n'est utilisable qu'après validation) |
| `migrations/20261004180100_parametres_marche_standard.sql` | étape A : fiche du marché (titulaire, maître d'ouvrage, délai, montant), OS typés, arrêts et reprises, avenants, versions des articles du bordereau, journal des événements et pièces jointes (compartiment `evenements`), règles d'attachement, libellés propres au client, valeurs par défaut de tout nouveau marché |
| `migrations/20261004200000_lots_attachement.sql` | étape B : lots d'attachement (`attachements`, `attachement_lignes`), solde par fuite × article (`v_a_attacher`), détail et récapitulatif (`v_attachement_lignes`, `v_attachement_recap`), `arreter_attachement`, `rouvrir_attachement` |
| `migrations/20261004210000_exports.sql` | étape C : modèles d'export par marché (`modeles_export`, trois par défaut), vue `v_fuites_export` (fuite + dernière réparation, réfection, pièces, quantités) |
| `migrations/20261004220000_anomalies_corrigees.sql` | `v_anomalies` : plus de « terrassement sans avis » sans fouille, ni de « référence en double » sur la fuite d'origine d'une re-détection |
| `migrations/20261004230000_marche_demo.sql` | marché de démonstration `DEMO` (données fictives, voir ci-dessous) |
| `migrations/20261005100000_copie_marche.sql` | lot C : `copier_marche` (administrateur) crée un marché en copiant fiche, bordereau et règles de proposition, zones, secteurs, équipes, natures, motifs, catalogue, règles d'attachement, catégories d'événements, modèles d'export ; jamais fuites, lots, OS, avenants, ouvriers |
| `migrations/20261005120000_logos_marche.sql` | lot F : logos du marché (compartiment privé `logos`, PNG ou JPEG, 2 Mo ; `<marche_id>/titulaire\|maitre_ouvrage.png\|jpg` dans `marches.logo_titulaire` / `logo_maitre_ouvrage` ; lecture « exports / lire » ou « paramètres / lire », écriture « paramètres / modifier ») ; non copiés par `copier_marche` |
| `migrations/20261005120100_marche_inactif.sql` | lot J : marché désactivé en lecture seule (`peut` et `marches_autorises` exigent un marché actif pour toute action autre que « lire ») ; l'administrateur garde la main |
| `migrations/20261006100000_droits_verrous.sql` | lot Q : verrous de sécurité de l'administrateur (`verrous_admin`, journalisés) pris en compte par `private.peut` et `private.marches_autorises` ; contrôle explicite des actions sensibles (supprimer une fuite, arrêter / rouvrir un lot, refacturation forcée, désactiver / copier un marché, révoquer un compte) ; fiche du marché et journal soumis aux verrous ; révocation par l'administrateur connecté seulement (service_role : blocage de connexion d'un profil déjà révoqué) ; `enregistrer_droits` (matrice d'un marché en une transaction) |
| `migrations/20261006100100_controles_attachement.sql` | lot R : pièces posées avec provenance (`terrain` : saisie par l'auteur de la réparation, sans délai ; `correction` : autre compte, droit « interventions / modifier » sur la réparation d'un autre), nature de la correction (`remplacement` avec `remplace_piece_id`, `oubli`), état (`posee`, `remplacee`, `retiree`, jamais supprimées) et motif obligatoire, posés ou contrôlés par déclencheur ; vue `v_pieces_reelles` (inventaire réel) ; motif obligatoire de toute modification d'une ligne de quantités (`motif_modification` → `motif_correction`, `corrigee_par`, `corrigee_le`), article d'origine d'une ligne requalifiée (`prix_initial_id`, jamais reproposé), une unité par prix et par fuite pour les lignes manuelles ; `marches.longueur_pe_max_m` (seuil du polyéthylène, 2 m par défaut) ; vues `v_controles_attachement` et `v_hors_bordereau` ; `v_pieces_posees` et `v_fuites_export` sans les pièces remplacées ou retirées ; `v_anomalies` suit le seuil du marché |
| `migrations/20261006100200_nomenclature_dolibarr.sql` | lot P1 : `produits_dolibarr` (nomenclature Dolibarr de l'entreprise, sans prix ; lecture admin et « paramètres / lire »), `imports_dolibarr`, `importer_produits_dolibarr` (admin, idempotent, absents rendus inactifs), lien `catalogue_pieces.produit_dolibarr_id` (unique par marché, désignation Dolibarr imposée, admin seulement), `hors_nomenclature`, `designation_initiale`, `rapprocher_pieces` (admin, en lot), `copier_marche` reprend les liens |
| `migrations/20261006100300_reconciliation_copier_marche.sql` | `copier_marche` redéfinie par les lots Q et P1 : garde le verrou « créer un marché par copie », la reprise des liens Dolibarr et copie le seuil du polyéthylène du marché source |
| `migrations/20261006140000_articles_dolibarr.sql` | lot T : les produits Dolibarr deviennent le **référentiel unique des pièces**, commun à tous les marchés ; `produits_dolibarr.utilisable` (activation globale, `activer_produits_dolibarr`, administrateur ou responsable « paramètres / modifier » ; nouveau produit importé désactivé ; `cree_le`), lecture par tout compte affecté ; `reparation_pieces.produit_id` remplace `piece_id` (article activé et présent dans Dolibarr exigé à la saisie, ligne ancienne gardée ; **plus de pièce libre** : contrainte `reparation_pieces_produit_obligatoire`) ; `suggestions_articles` (article du bordereau suggéré par marché : produit, sinon famille ; `private.article_suggere`), copiées par `copier_marche` ; vues du lot R relues sur Dolibarr ; **suppression** de `catalogue_pieces`, du rapprochement et des compteurs P1 d'`imports_dolibarr` ; reprise : produits rapprochés pré-activés, articles suggérés des pièces rapprochées convertis en règles ; **purge** des pièces posées (rien en production) |
| `migrations/20261006110000_droits_auteur_inconnu.sql` | correctif : `private.peut` renvoie `false` (et non `null`) pour une portée « siennes » quand la saisie n'a ni auteur terrain ni `saisi_par` ; `avant_modification_saisie` bloque donc bien les saisies sans auteur (importées, de démonstration, générées) |
| `config.toml` | configuration minimale de la CLI Supabase |
| `functions/gerer-utilisateurs/` | fonction serveur (création des comptes, mot de passe, révocation, rôles), déployée par le workflow |
| `functions/photos-r2/` | fonction serveur des photos sur Cloudflare R2 : vérifie le compte (JWT) et ses droits (`marches_photos`, RLS de `photos`), puis signe des URL S3 de courte durée (dépôt `PUT` 15 min, lecture `GET` 1 h, 200 chemins par appel) ; secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (`R2_BUCKET` facultatif) posés par le workflow depuis les secrets GitHub ; sans eux, répond 503 `r2_non_configure` et les clients restent sur Supabase Storage |
| `functions/reseau-tuiles/` | fonction serveur des tuiles vectorielles du réseau (X5) : archive PMTiles privée `reseau/<marché>/reseau.pmtiles` dans R2 ; `lire` (compte affecté au marché, RLS de `marches`) → URL signée `GET` 6 h (lecture par plages), `deposer` (administrateur ou « paramètres / modifier ») → URL signée `PUT` 15 min ; mêmes secrets R2 que `photos-r2` ; sans eux, 503 `r2_non_configure` et la carte lit le réseau par secteur |
| `tests/database/01_rls_et_regles.test.sql` | 64 tests pgTAP (isolation, droits, verrou, statuts, prix, re-détection, photos, journal) ; depuis le lot R, la correction de quantité du responsable porte un motif |
| `tests/database/02_parametres_marche.test.sql` | 49 tests de l'étape A (fiche, versions de prix, avenants, arrêts et délai, événements, libellés du client) |
| `tests/database/03_lots_attachement.test.sql` | 41 tests de l'étape B (solde, brouillons, arrêt, régularisations, anticipation, forçage, réouverture, droits) ; correction avec motif depuis le lot R |
| `tests/database/04_exports.test.sql` | 10 tests de l'étape C (modèles par défaut, droits, vue enrichie) |
| `tests/database/05_marche_demo.test.sql` | 30 tests : marché DEMO, droits des agents de terrain (ni attachements, ni prix, ni paramètres, ni exports), isolation, lot N° 02 de bout en bout |
| `tests/database/06_copie_marche_parametres.test.sql` | 36 tests du lot C : copie réservée à l'admin, contenu copié (dont les articles suggérés, lot T), isolation, paramètres édités par le responsable, règles de proposition sans nouvelle version, refus des agents, journal |
| `tests/database/07_logos.test.sql` | 37 tests du lot F (droits, noms imposés, isolation, agents de terrain refusés, copie sans logos) |
| `tests/database/08_marche_inactif.test.sql` | 9 tests du lot J (écritures refusées sur un marché désactivé sauf administrateur, lecture conservée, réactivation) |
| `tests/database/09_droits_verrous.test.sql` | 68 tests du lot Q (accès refusé aux non-administrateurs, matrice, chaque verrou bloque puis le retrait rétablit, service_role, journal) |
| `tests/database/10_controles_attachement.test.sql` | 110 tests du lot R (corrections des pièces : remplacement, oubli, retrait, motif, saisie d'origine gardée, pas de délai, inventaire réel, droits ; motif et journal des lignes, requalification, une unité par prix, lot arrêté figé, chaque contrôle, travaux hors bordereau, seuil du polyéthylène par marché) |
| `tests/database/11_articles_dolibarr.test.sql` | 48 tests du lot T (plus de catalogue ni de rapprochement, aucun prix, import idempotent, nouveaux désactivés, activation globale par l'administrateur ou un responsable, lecture par les comptes affectés, saisie limitée aux articles activés, ligne ancienne gardée, pièce libre refusée, article suggéré produit > famille, droits et journal des règles) ; remplace les 43 tests du lot P1 |
| `tests/database/12_droits_auteur_inconnu.test.sql` | 9 tests du correctif (saisie sans auteur refusée à la détection et au chef, propre saisie et saisie d'un autre chef, responsable « toutes », administrateur) |
| `migrations/20261006130000_reseau_balayage.sql` | lot S2 : tronçons, nœuds et balayages (RLS, marché désactivé en lecture seule), import, GeoJSON par secteur, état de balayage, zonage (liste, polygone, contours), vues des linéaires et du journal ; droit « balayage » de la détection (voir, cocher, annuler les siens) |
| `tests/database/15_reseau_balayage.test.sql` | 115 tests du lot S2 (droits par rôle, isolation, import idempotent, longueur, zonage automatique et manuel, contours, premier passage et annulation, statut du secteur, vues, marché désactivé, `copier_marche` inchangée) |
| `migrations/20261007120000_essai_charge.sql` | essai de charge à 3 000 fuites (`docs/essai-charge-3000.md`) : `compter_fuites` (fuites par marché et statut), `resume_a_attacher` (reste à attacher par article), `etat_balayage_compact` (état de balayage en un seul document JSON : `etat_balayage` en lignes était plafonné à 1 000 tronçons par l'API) ; toutes SECURITY INVOKER (RLS de l'appelant) |
| `tests/database/17_essai_charge.test.sql` | 22 tests : privilèges, comptages identiques à `v_fuites` sous la RLS de chaque rôle, reste à attacher identique à `v_a_attacher`, état compact identique à `etat_balayage` au-delà de 1 000 tronçons |
| `migrations/20261007130000_photos_r2.sql` | lot N : `marches_photos(p_action)` (marchés où le compte a le droit « photos » lire / creer / supprimer ; même règle que la RLS de `photos` et du compartiment Storage), lue par la fonction serveur `photos-r2` ; `anon` sans accès ; commentaire de `photos.stockage` |
| `tests/database/16_photos_r2.test.sql` | 10 tests du lot N : privilèges de `marches_photos`, rien sans compte ni sans affectation, marché de l'agent en lecture et en dépôt, action inconnue refusée, administrateur sur tous les marchés, marché désactivé sans dépôt |
| `migrations/20261009100000_type_donnee_refections.sql` | chantier v2, S1 : type de donnée `refections` (fichier séparé, valeur d'énumération) |
| `migrations/20261009100100_comptes_roles.sql` | S1, R1 à R7 : rôle `refection` (modèle, contraintes, droits `interventions` recopiés sur `refections`, rôle ajouté aux `chef_reparation`), RLS des réfections sur `refections` ; `profils.nom`, `prenom` (nom complet « NOM Prénom »), `matricule` (unique), `entreprise` (STEPAG) ; `ouvriers.matricule` ; `modifier_roles`, `compte_supprimable`, suppression d'un profil refusée s'il a la moindre saisie ; pièces « correction » lues par le bureau seulement, `v_pieces_terrain` |
| `migrations/20261009100200_validation.sql` | S1, V1 à V7 : `validee_le` / `validee_par` (fuites, réparations, réfections), `valider_etapes`, `v_a_valider`, `v_a_refectionner`, étape validée réservée au droit « valider », photos antérieures à la validation, motif des corrections (date, référence, position), « détectée par », `saisie_differee`, ajout après un lot arrêté et reverrouillage au lot suivant |
| `migrations/20261009100300_notifications.sql` | S1, N1 / N3 : `notifications` (les siennes, lu / non lu, temps réel), `notifications_circuit`, déclencheurs du circuit, `generer_alertes_reparation` (pg_cron 15 min si disponible), `appareils_push` et ses fonctions |
| `tests/database/30_s1_comptes_roles.test.sql` | 47 tests S1 : rôle réfection, droits par rôle, `modifier_roles`, nom / matricule / entreprise, suppression de compte, corrections du bureau invisibles du terrain |
| `tests/database/31_s1_validation.test.sql` | 58 tests S1 : validation par étape, ajout seulement après validation, photos, motif, « détectée par », saisie différée, réfections à faire, ajout après lot arrêté |
| `tests/database/32_s1_notifications.test.sql` | 37 tests S1 : circuit (destinataires, jamais l'auteur, révoqués et autres marchés exclus), lecture des siennes, lu / non lu, alerte 48 h, circuit réglable, appareils push |
| `migrations/20261009200000_referentiels_terrain.sql` | chantier v2, S2 : `libelles_listes` (libellés FR / AR des listes de saisie, X4), natures Carrelage, Carreaux de ciment (REVSOL), Faïence, Pavé ciment (SRM, DEMO, F5), `diametres_materiau` (diamètres par matériau, standard + réseau, P2), `representants_srm` et `reparations.representant_srm_id` (P7), `fuites.nature_degradation_id`, `diametre_mm`, `materiau`, `troncon_id` (F2, F4), `marches.champs_obligatoires_fuite` contrôlé à la création (F1), copie par `copier_marche` |
| `migrations/20261009200100_rues_suggestions.sql` | chantier v2, S2 : table `rues` (OSM, ODbL), `importer_rues` (administrateur), `suggestions_localisation` (rues proches, secteur, tronçon le plus proche avec diamètre et matériau ; rayon selon la précision GPS) |
| `migrations/20261009200110_rues_oujda.sql` | 3 274 voies nommées d'Oujda (© contributeurs OpenStreetMap, ODbL 1.0), produites par `outils/reseau/extraire_rues.py` |
| `migrations/20261009200200_non_reparee_anticipation.sql` | chantier v2, S2 : réparation non réparée attachée (terrassement et travaux, P8), `private.refection_attendue` et `notifier_reparation` (S1) élargies aux non réparées avec fouille, `v_refections_dues`, `private.refection_due` ; anticipation généralisée (A1) : `prix.anticipable` (panier), contrôles (case du marché, panier, ni exécuté ni déjà attaché), `v_propositions_anticipation`, `v_a_attacher` (`en_attente_execution`), `fuites_anticipees` |
| `tests/database/25_referentiels_terrain.test.sql` | 44 tests : libellés arabes complets, natures F5, diamètres (standard, réseau, droits, isolation), représentants, champs obligatoires (création, fuite ancienne, champ vidé, RLS, contexte serveur), copie |
| `tests/database/26_rues_suggestions.test.sql` | 27 tests : rues d'Oujda chargées, import (administrateur, idempotent), rayon selon la précision, ordre et regroupement des rues, secteur par contour ou par tronçon, tronçon et matériau normalisé, rien autour, précision insuffisante, droits |
| `tests/database/27_non_reparee_anticipation.test.sql` | 42 tests : lignes d'une non réparée, réfection attendue (S1 : validation, notification, `v_a_refectionner`), réfections dues, panier, case du marché, propositions, refus (hors panier, déjà exécuté, seconde anticipation), « Attaché par anticipation », exécution réelle et régularisations, total attaché = exécuté |
| `migrations/20261009300000_inventaire_fournitures.sql` | chantier v2, X3 (lot P3) : `v_inventaire_fournitures` (une ligne par pièce de l'inventaire réel `v_pieces_reelles`, article Dolibarr, famille, mois, provenance terrain / correction ; droit « quantités / lire », security_invoker) ; `resume_fournitures(marché, du, au)` (quantités par article sur une période, pour le widget du tableau de bord de S6) |
| `migrations/20261009300100_rapprochement_dolibarr.sql` | chantier v2, X3 (lot P4) : `mouvements_dolibarr` (mouvements de stock, quantités signées, **sans prix** ; lecture : administrateur, ou « quantités / lire » sur un marché dont c'est l'entrepôt), `imports_mouvements_dolibarr` (journal), `importer_mouvements_dolibarr` (administrateur ou serveur pour X8, idempotent par rowid, lignes modifiées mises à jour), `marches.entrepot_dolibarr_id` (administrateur seulement, déclencheur `proteger_entrepot_dolibarr` ; 76 pour le marché 4500004453 ; non copié) et `marches.seuil_ecart_fournitures_pct` (10 % par défaut, « paramètres / modifier »), `rapprochement_fournitures(marché, du, au)` (période × article : transféré, consommé, posé, écart, cumuls, seuil) |
| `migrations/20261010500000_nom_compte_issam.sql` | chantier v2, S6 (R3) : données seulement, le compte `issam` reçoit nom `BOUSALAM`, prénom `Issam` (nom affiché « BOUSALAM Issam ») si aucun nom ni prénom n'a été saisi |
| `migrations/20261011100000_suivi_gps.sql` | chantier v2, S11 (X6) : `traces_gps` (**un tracé par agent, marché et jour**, jour d'Oujda ; géométrie `LineString M` en WGS84, M = secondes Unix ; environ 24 octets par point, soit 70 Ko pour 3 000 points ; `unique (marche_id, profil_id, jour)`), RLS : lecture par le **responsable du marché** et l'**administrateur** seulement (`private.marches_traces_gps`), jamais l'agent lui-même ni ses collègues, aucune écriture directe ; `ajouter_points_trace(marché, [[t, lon, lat], …])` (agent affecté et actif dans un marché actif, 1 000 points au plus par envoi, points invalides ignorés, **idempotente** : un point déjà reçu est ignoré, l'ordre des lots n'importe pas, lot à cheval sur minuit réparti sur deux jours) ; `v_traces_gps` (liste sans géométrie), `trace_gps(marché, agent, jour)` (points `[lon, lat, t]`) ; `purger_traces_marche` (administrateur, **marché désactivé seulement**, journalisée) ; `saisies_compte` ne compte pas les tracés (un compte qui n'a que des tracés reste supprimable) |
| `tests/database/34_s11_suivi_gps.test.sql` | 57 tests S11 : privilèges, un tracé par agent et par jour, géométrie M, idempotence (même lot, lot qui recoupe, lot plus ancien reçu après), minuit d'Oujda, points invalides, refus (autre marché, révoqué, marché désactivé, 1 000 points), lecture responsable / administrateur seulement, isolation entre marchés, purge (droits, marché actif refusé, journal) |
| `tests/database/13_inventaire_fournitures.test.sql` | 17 tests du lot P3 (privilèges, aucun prix ni référence, inventaire réel avec corrections, remplacées / retirées / réparation supprimée exclues, résumé par période, droits : responsable et administrateur seulement, isolation) |
| `tests/database/14_rapprochement_dolibarr.test.sql` | 54 tests du lot P4 (RLS, aucun prix, entrepôt réservé à l'administrateur, seuil du responsable, import idempotent et mis à jour, serveur accepté, isolation par l'entrepôt, annulations, retours, consommations, posé réel, période et cumul, seuil, copie du marché, journal) |
| `migrations/20261013100000_envoi_dolibarr.sql` | chantier v3, S13 (X8) : envoi automatique des mouvements Dolibarr ; `envois_dolibarr` (journal : envois reçus, signes de vie et erreurs regroupés, 400 jours ; lecture comme `imports_mouvements_dolibarr`), `recevoir_envoi_dolibarr(jsonb)` (**service_role seulement**, appelée par la fonction `dolibarr-mouvements` : actions `etat`, `envoyer`, `erreur` ; entrepôts suivis seulement, nouveaux ou changés seulement, puis `importer_mouvements_dolibarr`) |
| `tests/database/43_s13_envoi_dolibarr.test.sql` | 34 tests S13 : privilèges (service_role seulement, journal en lecture), état par entrepôt suivi, entrepôt non suivi ignoré, sans doublon, renvoi sans nouvel import, mise à jour, envoi refusé en bloc et journalisé, regroupements, erreur du script, lecture du journal |
| `functions/dolibarr-mouvements/` | fonction serveur sans JWT : jeton dédié `x-jeton-dolibarr` comparé au secret `DOLIBARR_JETON` (posé par le workflow depuis le secret GitHub du même nom), puis `recevoir_envoi_dolibarr` ; 503 si le secret manque |
| `ci/` | simulateur Supabase et script de test pour la CI GitHub (ne jamais appliquer au projet) |

## Ce que fait le schéma

- **Multi-marchés** : toutes les données portent `marche_id`. Les clés étrangères composites
  `(id, marche_id)` empêchent de rattacher une donnée à un paramètre d'un autre marché.
- **Droits** : table `droits` (utilisateur × marché × type de donnée) avec lire / créer /
  modifier (non, siennes, toutes) / supprimer (non, siennes, toutes) / valider.
  Les modèles `detection`, `chef_reparation` (« Réparation »), `refection` (« Réfection », chantier v2) et
  `responsable` s'appliquent avec `appliquer_modele_role(profil, marché, rôle)` et se cumulent ; `modifier_roles`
  remplace les rôles d'un compte dans un marché. Les réfections ont leur propre type de donnée `refections`. L'administrateur
  (`profils.est_admin`) voit et fait tout, sauf ce qu'il a verrouillé.
- **Verrous de sécurité** (lot Q) : l'administrateur peut se retirer un droit (`verrous_admin` : objet = type de
  donnée ou `marches` / `comptes`, action = colonne de `droits` ou `rouvrir`, `forcer`, `desactiver`, `copier`,
  `revoquer`). Tant que le verrou est posé, la base lui refuse l'action ; il l'ouvre et le referme lui-même (pas de
  refermeture automatique, décision d'Issam). Sans verrou, rien ne change.
- **« Siennes »** : la ligne a été faite sur le terrain (`auteur_terrain_id`) ou saisie
  (`saisi_par`) par l'utilisateur. Le responsable peut saisir à la place d'un chef absent :
  `saisi_par` = responsable, `auteur_terrain_id` = chef, `source_saisie` = papier / web.
- **Suppression** : jamais physique ; `supprime_le` rempli si l'utilisateur a le droit
  « supprimer ». Tout est tracé dans `journal` (qui, quand, valeurs avant / après).
- **Verrou** : le responsable (droit « valider ») verrouille une fuite validée ; ni elle ni ses
  réparations, réfections, photos ou quantités ne changent ensuite, sauf par un responsable. Depuis le
  chantier v2, un agent peut encore y **ajouter** réparation, réfection et photo (la fuite revient dans
  « À attacher ») ; un nouvel arrêt de lot reverrouille.
- **Validation par étape** (chantier v2, contrat `docs/lots/chantier-v2-base-s1.md`) : détection, chaque
  réparation, chaque réfection ; avant validation l'auteur modifie, après il ajoute seulement.
- **Notifications** : table `notifications` remplie par déclencheurs selon `notifications_circuit`.
- **Statut automatique** (avance seulement ; le responsable peut le changer à la main) :
  réparation « en cours » → `en_reparation` ; « réparée » → `reparee` (ou `achevee` si terrain
  naturel) ; « non réparée » + motif → `sans_reparation` ; réfection faite ou close sans
  réfection (motif obligatoire) → `achevee`.
- **Lignes de prix proposées automatiquement** (règle R-DER-007), corrigeables par le
  responsable (une ligne corrigée passe en « manuel » et n'est plus recalculée) :
  terrassement L × l × P → prix 3 ; réfection L × l (reprise de la fouille) → prix 4 ou 5
  selon la nature ; tuyau PE DE < 40 → 6, ≥ 40 → 9 ; robinet PEC → 7 ; collier PEC → 8 ;
  bouche à clé seule → 10 ; AC / PVC selon DN → 11, 12, 13 ; DN > 315, fonte, acier →
  aucun prix, signalé dans `v_anomalies`. Au plus une unité par prix et par fuite (paramètre).
  Montants au prix du bordereau ; la majoration (15 %) s'appliquera au total de la facture
  (migration 3).
- **Alertes** (`v_fuites`) : non réparée après 48 h, non communiquée à la SRM le jour même,
  réfection chaussée à J+20 et hors délai à J+30, réfection trottoir, fuite sans photo.
  Seuils paramétrables dans `marches`.

## Appliquer au projet Supabase

Le déploiement passe par GitHub Actions (`.github/workflows/deployer-base.yml`) : aucun
mot de passe sur un poste ni dans une conversation.

1. **Une seule fois, créer deux secrets** dans GitHub : *Settings > Secrets and variables >
   Actions > New repository secret* :
   - `SUPABASE_ACCESS_TOKEN` : jeton créé dans Supabase, *Account (avatar) > Access Tokens >
     Generate new token* ;
   - `SUPABASE_DB_PASSWORD` : mot de passe de la base (gestionnaire de mots de passe ; s'il est
     perdu : *Project Settings > Database > Reset database password*).
2. **Déployer** : fusionner la PR dans `main` (déploiement automatique), ou *Actions >
   Déploiement de la base > Run workflow*. Le workflow rejoue les tests, affiche les
   migrations à appliquer (`--dry-run`), les applique, puis liste l'état du projet.
   Les migrations déjà appliquées ne sont jamais rejouées.
3. **Premier administrateur** : *Authentication > Users > Add user > Create new user* avec
   l'adresse technique `issam@agents.stepag.ma`, un mot de passe, « Auto Confirm User » coché.
   Le profil `issam` est créé automatiquement. Puis dans *SQL Editor* :
   `update profils set est_admin = true where identifiant = 'issam';`
4. *Authentication > Sign In / Providers > Email* : désactiver « Confirm email » (les agents
   se connectent avec un identifiant ; l'adresse `<identifiant>@agents.stepag.ma` reste interne).

Sans GitHub, depuis le Mac : `brew install supabase/tap/supabase`, puis dans le dépôt
`supabase link --project-ref osajiinsibwrsltntmsk` et `supabase db push`.

Les comptes des agents seront créés depuis le panneau web par une Edge Function
(clé `service_role` côté serveur uniquement), prochaine étape.

## Tests

- Automatiques : la CI GitHub (`.github/workflows/base-de-donnees.yml`) rejoue migrations
  et tests à chaque modification de `supabase/` ; le déploiement les rejoue aussi avant d'envoyer.
- Sur le Mac avec Docker : `supabase start` puis `supabase test db`.

## Sauvegarde et restauration

Workflow `.github/workflows/sauvegarde-base.yml` (scripts dans `outils/sauvegarde/`) : chaque nuit (02:17 UTC)
et à la demande (Actions > Sauvegarde de la base > Run workflow), il exporte puis chiffre (AES-256) une archive
`sauvegarde-AAAAMMJJ-HHMM.tar.gz.gpg` qui contient :

| Fichier | Contenu |
|---|---|
| `schema.sql` | structure : tables, fonctions, règles RLS (`supabase db dump`) |
| `donnees.sql` | données de **tous** les schémas dumpés : `public`, comptes `auth`, enregistrements `storage` (`buckets`, `objects`) ; sans `storage.buckets_vectors` ni `storage.vector_indexes` (tables internes non restaurables, exclues par `-x`) |
| `complement.sql` | ce que l'export ne peut pas voir, car il vit dans `auth` et `storage` : le déclencheur `creer_profil_apres_inscription` sur `auth.users` et les règles de `storage.objects` (photos, evenements, logos) ; généré depuis la base vivante par `outils/sauvegarde/generer-complement.sql` ; rejouable |
| `migrations_appliquees.txt` | versions de migrations déjà appliquées (pour `supabase migration repair`) |
| `LISEZMOI.txt` | rappel de l'ordre de restauration |

L'archive est conservée **à trois endroits** (le secret `SAUVEGARDE_PASSPHRASE` n'est jamais copié) :
1. **GitHub** : artefact `sauvegarde-base`, 30 jours ;
2. **Cloudflare R2**, hors de GitHub : `suivi-fuites-photos/sauvegardes/base/<archive>`, copie vérifiée par empreinte
   SHA-256. Le workflow supprime lui-même les archives de plus de 30 jours (en gardant toujours au moins 7
   archives récentes), parce que le jeton R2 (Object Read & Write) ne peut pas régler de règle de cycle de vie ;
3. **Google Drive du compte `stepag.app@gmail.com`**, hors de Supabase, Vercel, Cloudflare et GitHub (voir
   « Copie hors plateformes » ci-dessous) : 30 archives quotidiennes et 12 mensuelles.

**Fichiers de Supabase Storage (photos comprises)** : le même workflow copie dans R2, sous
`sauvegardes/stockage-supabase/<compartiment>/<chemin>`, tout fichier encore stocké dans Supabase Storage
(`photos`, `evenements`, `logos`), seulement s'il manque ou si sa taille diffère ; rien n'est jamais supprimé de R2,
donc un fichier effacé de Supabase reste récupérable. Les photos prises depuis le lot N sont déjà dans R2
(`photos.stockage = 'r2'`, préfixe racine du compartiment) : elles ne dépendent plus de Supabase, et ont leur
seconde copie sur le Drive (section suivante).

### Copie hors plateformes (Google Drive du compte `stepag.app`)

Second job du même workflow, **`drive`** (« Copie sur le Drive (hors plateformes) »), lancé après l'export, par
`rclone` (version et empreinte épinglées dans `outils/sauvegarde/installer-rclone.sh`). Même si l'export de la
base échoue, les photos sont copiées. Scripts : `outils/sauvegarde/copie-drive.sh` (copie),
`rotation-archives.sh` (rotation), `restaurer-drive.sh` (reprise et contrôle).

Disposition du dossier `Suivi-fuites-sauvegarde` du Drive (un `LISEZMOI.txt` la décrit sur place) :

| Dossier du Drive | Contenu | Conservation |
|---|---|---|
| `base/` | `sauvegarde-AAAAMMJJ-HHMM.tar.gz.gpg`, l'archive chiffrée de la nuit (vérifiée par SHA-256 après relecture) | **30 quotidiennes** (la dernière de chacun des 30 jours les plus récents) et **12 mensuelles** (la première de chacun des 12 mois les plus récents) ; au plus 20 suppressions par exécution |
| `r2/` | le compartiment R2 tel quel, hors `sauvegardes/` : photos (`<marché>/<fuite>/<photo>.jpg`), `apk/` (APK publiées et `derniere.json`), `reseau/` (tuiles) | jamais supprimé |
| `stockage-supabase/` | fichiers de Supabase Storage, `<compartiment>/<chemin>` (copiés d'abord dans R2, puis ici) | jamais supprimé |

- **Incrémentale** : un fichier déjà sur le Drive (même chemin, même taille) n'est pas recopié ; la première nuit est
  longue (toutes les photos), les suivantes durent quelques minutes. Après la copie, `rclone check` vérifie que chaque
  fichier de la source existe sur le Drive avec la même taille.
- **Rien n'est effacé côté Drive**, sauf la rotation des archives de `base/` : `rclone copy` (jamais `sync`), une
  photo supprimée de R2 reste sur le Drive. La corbeille du Drive garde 30 jours les archives tournées.
- **Échec visible** : l'étape en cause est rouge, le **résumé de l'exécution** (onglet Summary) dit pour chaque
  élément (connexion, base, photos et APK, Storage) s'il a réussi, avec l'espace libre du Drive ; GitHub envoie un
  e-mail pour tout workflow planifié en échec (régler Settings > Notifications > Actions du compte qui a modifié le
  planning en dernier). Sans le secret `SAUVEGARDE_DRIVE_CONFIG`, le job échoue aussi (sauf sur une PR : simple
  avertissement). Une alerte apparaît quand il reste moins de 3 Go libres (Google One 100 Go si la place manque).
- **Secret** : `SAUVEGARDE_DRIVE_CONFIG` contient la section `[drive]` de la configuration rclone (identifiant OAuth
  et jeton du compte `stepag.app`). Il est créé par Issam lui-même : note pas à pas « Autoriser rclone sur le
  Drive » (Claude Docs). Étendue `drive` (accès complet) et non `drive.file` : une nouvelle autorisation (rotation,
  nouvel identifiant OAuth) voit ainsi encore les anciennes copies. Si le jeton est révoqué ou expire, le job échoue
  à l'étape « Connexion au Drive » : refaire l'autorisation et recréer le secret.
  L'application OAuth de Google Cloud doit être **publiée** (Audience > Publier l'application), sinon le jeton
  expire après 7 jours ; Google l'exige avec trois liens publics (page d'accueil, politique de confidentialité,
  conditions d'utilisation) et le domaine autorisé `stepag.ma` : le panneau les sert sans connexion sur
  `/confidentialite` et `/conditions` (`web/src/app/`).
- **Jamais dans le dépôt** : ni le jeton, ni l'identifiant OAuth, ni la phrase secrète ; seule l'archive chiffrée
  est envoyée.

### Test de restauration

Workflow `.github/workflows/test-restauration.yml` : chaque lundi à 04:07 UTC, à la demande (Actions > Test de
restauration > Run workflow ; champ facultatif : numéro d'une exécution de « Sauvegarde de la base »), et sur toute
PR qui modifie les workflows de sauvegarde ou `outils/sauvegarde/` (une sauvegarde complète est alors réalisée
d'abord). Il trouve la dernière exécution dont l'**export** a réussi (une panne du Drive ne masque pas le test de la
base), vérifie que la copie R2 est identique à l'artefact GitHub, **télécharge l'archive depuis le Drive** (comparée
à l'artefact par SHA-256) et restaure **celle du Drive** avec `outils/sauvegarde/restaurer.sh` (le **même script**
que la procédure manuelle) dans une base Supabase locale et vierge créée dans la CI (`supabase start`, même
PostgreSQL que la production ; **jamais** la production), puis compare table par table les lignes de la sauvegarde à
celles de la base restaurée et vérifie le retour du déclencheur et des règles de `storage.objects`. Ensuite, pour
les **photos** : chaque photo `r2` non supprimée et chaque objet de `storage.objects` que la base restaurée référence
doit exister sur le Drive (les objets Storage avec la même taille), et un échantillon de 12 fichiers est relu en
entier depuis le Drive (taille, signature JPEG). Un job séparé joue les essais sans réseau des scripts de copie
(`outils/sauvegarde/essais/drive.test.sh` : rotation, copie incrémentale, rien d'effacé, contrôles, échecs). **Aucun contournement** : une table non restaurable, un écart de lignes ou un objet
manquant font échouer le test. Le résumé du run donne la date de la sauvegarde et le nombre de lignes par table ;
aucune donnée n'est affichée.

Si le test échoue :
- « aucune exécution réussie » ou « plus de 48 h » : la sauvegarde nocturne ne tourne plus ; vérifier
  Actions > Sauvegarde de la base, puis la relancer ;
- « copie R2 introuvable » ou « diffère » : la copie hors de GitHub ne s'est pas faite ; lire l'étape
  « Copie hors de GitHub (R2) » de la sauvegarde (secrets R2, jeton, compartiment) ;
- « archive … pas sur le Drive », « diffère de l'artefact » ou « Connexion au Drive impossible » : lire le job
  « Copie sur le Drive » de la sauvegarde (jeton Drive expiré ou révoqué : refaire la note pas à pas ; Drive plein) ;
- « fichiers référencés par la base restaurée manquent sur le Drive » : des photos ou fichiers de la base ne sont
  pas dans la copie ; relancer la sauvegarde, puis comparer à la main (`rclone lsf -R drive:Suivi-fuites-sauvegarde/r2`) ;
- échec du déchiffrement : `SAUVEGARDE_PASSPHRASE` ne correspond plus ;
- échec de restauration ou écart de lignes : la sauvegarde n'est pas fiable ; relancer une sauvegarde puis
  le test, et corriger avant toute opération risquée sur la base.

### Restaurer pour de vrai

Sur un projet Supabase **neuf et vierge**, jamais sur la production sans décision explicite (le script refuse une
base où `public.marches` ou `public.fuites` existe déjà). Outils : `gpg`, `psql` (version 17 de préférence),
`aws` (AWS CLI) et `jq`.

1. **Récupérer l'archive** : artefact GitHub (Actions > exécution de « Sauvegarde de la base » > `sauvegarde-base`),
   ou le Drive (voir « Reprise après sinistre » ci-dessous), ou R2 (copie hors de GitHub) :
   ```bash
   export AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… AWS_DEFAULT_REGION=auto   # clés R2 du gestionnaire de mots de passe
   export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
   R2="--endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com"
   aws s3 ls $R2 s3://suivi-fuites-photos/sauvegardes/base/
   aws s3 cp $R2 s3://suivi-fuites-photos/sauvegardes/base/sauvegarde-AAAAMMJJ-HHMM.tar.gz.gpg .
   ```
2. **Déchiffrer** (la phrase secrète est lue dans une variable, jamais en argument) :
   ```bash
   read -rs SAUVEGARDE_PASSPHRASE && export SAUVEGARDE_PASSPHRASE
   bash outils/sauvegarde/restaurer.sh dechiffrer sauvegarde-AAAAMMJJ-HHMM.tar.gz.gpg ./restauration
   ```
3. **Créer le projet Supabase neuf** (même région, PostGIS disponible) et relever sa chaîne de connexion
   « Session pooler » (Project Settings > Database), avec son mot de passe, dans `URL_BASE_NEUVE` :
   ```bash
   export URL_BASE_NEUVE='postgresql://postgres.<projet>:<mot de passe>@aws-0-<région>.pooler.supabase.com:5432/postgres'
   bash outils/sauvegarde/restaurer.sh charger ./restauration     # schema.sql, donnees.sql, complement.sql
   ```
   Le script charge chaque fichier en une transaction (`ON_ERROR_STOP=1`) et n'affiche aucune donnée.
4. **Migrations** : lier le dépôt au projet neuf puis déclarer les migrations comme appliquées, avant tout
   `db push` :
   ```bash
   supabase link --project-ref <projet>
   supabase migration repair --status applied $(cat restauration/migrations_appliquees.txt)
   ```
5. **Fichiers de Supabase Storage** (les lignes `storage.objects` sont revenues avec `donnees.sql`, pas les
   fichiers) : télécharger puis renvoyer dans le projet neuf (clé de service du projet **neuf**) :
   ```bash
   aws s3 sync $R2 s3://suivi-fuites-photos/sauvegardes/stockage-supabase/ ./restauration/fichiers/
   SUPABASE_URL=https://<projet>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… \
     bash outils/sauvegarde/restaurer-photos.sh ./restauration/fichiers
   ```
   Les photos stockées dans R2 (`stockage = 'r2'`) n'ont rien à restaurer : elles sont toujours dans le
   compartiment.
6. **Reconnecter l'application** : nouveau `SUPABASE_PROJECT_ID`, URL et clé anon dans les secrets GitHub et
   les variables Vercel, puis « Déploiement de la base » (fonctions, secrets R2). Les comptes reviennent avec
   leurs mots de passe ; les sessions ouvertes sont invalidées (nouveau secret JWT), les agents se reconnectent.

### Réglage à faire une fois dans Cloudflare (facultatif)

Le workflow supprime déjà les archives de plus de 30 jours. Pour doubler cette règle côté Cloudflare : R2 >
`suivi-fuites-photos` > **Settings** > **Object lifecycle rules** > **Add rule** : nom `sauvegardes-base-30-jours`,
préfixe `sauvegardes/base/`, action **Delete uploaded objects** après **30 jours**. Ne **pas** mettre de règle sur
`sauvegardes/stockage-supabase/` (copie des fichiers, à garder) ni sur le reste du compartiment (photos).

**Limites** : l'historique des migrations est seulement listé (`migrations_appliquees.txt`) ; la copie de Storage
vers R2 puis vers le Drive est nocturne (un fichier déposé depuis la dernière nuit n'y est pas encore) ; les secrets
de l'application (clés, fonctions Edge, variables Vercel) ne sont pas dans la sauvegarde : ils sont dans le
gestionnaire de mots de passe d'Issam et dans les paramètres GitHub / Vercel ; la phrase secrète
`SAUVEGARDE_PASSPHRASE` n'existe qu'à ces endroits : **sans elle, aucune archive ne se lit**.

## Reprise après sinistre (pas à pas)

À lire **avant** d'en avoir besoin. Le test de restauration hebdomadaire (CI) joue déjà les étapes « archive du Drive »,
« chargement dans une base vierge » et « photos retrouvées sur le Drive » : il prouve que la procédure marche.

### Ce qui est où

| Donnée | Emplacement normal | Copies |
|---|---|---|
| Base (comptes, fuites, réparations…) | Supabase | GitHub (artefact, 30 j) ; R2 `sauvegardes/base/` (30 j) ; **Drive `base/`** (30 quotidiennes, 12 mensuelles) |
| Photos | R2 (racine du compartiment) | **Drive `r2/`** |
| Fichiers de Supabase Storage (anciennes photos, logos) | Supabase Storage | R2 `sauvegardes/stockage-supabase/` ; **Drive `stockage-supabase/`** |
| APK publiées | R2 `apk/` (3 dernières) ; artefact GitHub (14 j) | **Drive `r2/apk/`** |
| Code | GitHub `stepag-app/suivi-fuites` | clones locaux (Mac d'Issam) |
| Secrets (phrase secrète, clés R2, `service_role`, jetons) | gestionnaire de mots de passe | paramètres GitHub / Vercel / Supabase |

À avoir sous la main : le **gestionnaire de mots de passe** (phrase secrète `SAUVEGARDE_PASSPHRASE`, clés R2),
l'accès au compte Google `stepag.app@gmail.com`, un Mac avec `rclone`, `gpg`, `psql` 17 et `jq`
(`brew install rclone gnupg libpq jq`) et le dépôt cloné (`git clone` ; à défaut, n'importe quel clone récent).

### Étape 0 : brancher rclone sur le Drive (commune à tous les scénarios)

```bash
rclone config                    # n (nouveau), nom : drive, type : drive, identifiant OAuth, étendue 1 (accès complet)
rclone lsf drive:Suivi-fuites-sauvegarde --max-depth 1     # doit afficher base/ r2/ stockage-supabase/ LISEZMOI.txt
```

L'autorisation se refait comme dans la note « Autoriser rclone sur le Drive » (même compte, même étendue). Si le
Mac d'Issam a encore sa configuration rclone, `rclone lsf drive:` suffit : rien à refaire.

### Scénario A : Supabase est perdu (projet supprimé, base corrompue, région indisponible)

R2 (photos) est intact ; il faut un projet neuf, la base et les fichiers de Storage.

1. **Archive la plus récente** (ou une plus ancienne : `rclone lsf drive:Suivi-fuites-sauvegarde/base`) :
   ```bash
   bash outils/sauvegarde/restaurer-drive.sh archive ./restauration           # affiche le chemin du fichier
   # une date précise : bash outils/sauvegarde/restaurer-drive.sh archive ./restauration sauvegarde-AAAAMMJJ-HHMM.tar.gz.gpg
   ```
2. **Déchiffrer** : `read -rs SAUVEGARDE_PASSPHRASE && export SAUVEGARDE_PASSPHRASE`, puis
   `bash outils/sauvegarde/restaurer.sh dechiffrer ./restauration/sauvegarde-….tar.gz.gpg ./restauration/sql`.
3. **Projet Supabase neuf** (même région, PostGIS disponible), chaîne « Session pooler » dans `URL_BASE_NEUVE`, puis
   `bash outils/sauvegarde/restaurer.sh charger ./restauration/sql` (schéma, données, complément ; une transaction par
   fichier).
4. **Migrations** : `supabase link --project-ref <projet>` puis
   `supabase migration repair --status applied $(cat ./restauration/sql/migrations_appliquees.txt)`.
5. **Fichiers de Supabase Storage** :
   ```bash
   rclone copy drive:Suivi-fuites-sauvegarde/stockage-supabase ./restauration/fichiers --progress
   SUPABASE_URL=https://<projet>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… \
     bash outils/sauvegarde/restaurer-photos.sh ./restauration/fichiers
   ```
6. **Reconnecter** : `SUPABASE_PROJECT_ID`, URL et clé anon dans les secrets GitHub (`SUPABASE_*`,
   `EXPO_PUBLIC_SUPABASE_ANON_KEY`) et les variables Vercel ; adresse du projet dans `.github/workflows/apk.yml` et
   `sauvegarde-base.yml` ; lancer « Déploiement de la base » (fonctions Edge, secrets R2).
7. **APK** : l'adresse du projet est compilée dans l'APK : **recompiler** (`apk.yml` sur `main`) et réinstaller à la
   main sur chaque tablette (la fenêtre « Mise à jour disponible » dépend de la fonction `version-apk`, qui est dans
   le projet perdu ; la dernière APK de l'ancien projet est sur le Drive, dans `r2/apk/`, mais ne parle plus au
   nouveau). Les comptes reviennent avec leurs mots de passe ; les sessions ouvertes sont invalidées.
8. **Vérifier** : connexion du panneau, nombre de marchés et de fuites (comparer au résumé du dernier test de
   restauration), ouverture d'une fuite avec ses photos, une saisie de test depuis une tablette.

### Scénario B : R2 est perdu (compartiment supprimé, compte Cloudflare fermé)

La base et Storage sont intacts ; il faut un compartiment et les photos.

1. Créer le compartiment privé `suivi-fuites-photos` (ou un autre nom, puis variable GitHub `R2_BUCKET`), un jeton
   **Object Read & Write** limité à ce compartiment, et la règle CORS (`web/README.md` § Tuiles).
2. Renvoyer les photos et les APK depuis le Drive (remote R2 créé avec `rclone config`, type S3, fournisseur
   Cloudflare ; le remote s'appelle ici `r2`) :
   ```bash
   rclone copy drive:Suivi-fuites-sauvegarde/r2 r2:suivi-fuites-photos --progress
   rclone check drive:Suivi-fuites-sauvegarde/r2 r2:suivi-fuites-photos --size-only --one-way
   ```
3. Nouvelles clés R2 dans les secrets GitHub (`R2_*`) et dans les secrets des fonctions Supabase
   (« Déploiement de la base ») ; régénérer les tuiles du réseau si `reseau/` manque (Paramètres › Réseau).
4. Laisser tourner la sauvegarde de la nuit : `sauvegardes/base/` et `sauvegardes/stockage-supabase/` se
   reconstruisent seuls.

### Scénario C : GitHub est perdu (compte suspendu, dépôt supprimé)

1. Récupérer le code d'un clone local (`git log` pour vérifier le dernier commit) et le pousser vers un dépôt neuf.
2. Recréer **tous** les secrets (liste : en-têtes des workflows, `CLAUDE.md`, gestionnaire de mots de passe), dont
   `SAUVEGARDE_PASSPHRASE` **à l'identique** (sinon les archives existantes restent illisibles) et
   `SAUVEGARDE_DRIVE_CONFIG` (`rclone config show drive`, voir la note pas à pas).
3. Relancer « Sauvegarde de la base » à la main : le Drive est repris tel quel (copie incrémentale), rien n'est
   recopié ni supprimé hors rotation.

### Scénario D : tout est perdu

Dans l'ordre : **A** (projet et base neufs, depuis le Drive) → **B** (photos et APK depuis le Drive) → **C** (code et
secrets). Le Drive de `stepag.app` est la seule source nécessaire, avec la phrase secrète du gestionnaire de mots de
passe. Prévoir une demi-journée ; compter davantage pour réinstaller l'APK sur chaque tablette.

### Entretien de la copie

- Une fois par trimestre : ouvrir le dernier résumé du test de restauration (Actions > Test de restauration) et vérifier
  « restaurée depuis le Google Drive » et les nombres de photos.
- Espace : le résumé de la sauvegarde indique l'espace libre ; au-dessous de 3 Go, alerte. Google One (100 Go) règle
  le problème ; les archives de la rotation vont à la corbeille (vidée par Google après 30 jours).
- Jeton Drive : valable tant qu'il sert ; il est invalidé si Issam le révoque (compte Google > Sécurité > Accès
  des tiers) ou si l'identifiant OAuth est supprimé. Symptôme : étape « Connexion au Drive » en échec.

## Application « standard » (étape A)

- **Rien de figé pour un client** : libellé et format de la référence client (`masque_reference`,
  « 9 » = un chiffre), jalons du client (communication le jour même, avis avant terrassement,
  validation : `jalons_client`), sigle utilisé dans les écrans, seuils d'alerte, devise.
  Le marché 4500004453 garde ses valeurs (SRM, `999-999-999`, jalons suivis).
- **Fiche du marché** modifiable par le droit « paramètres / modifier » ; code et activation réservés
  à l'administrateur (déclencheur `proteger_marche`).
- **Délai** (`v_delai_marche`) : fin = veille du jour anniversaire (ou date saisie), prolongée des jours
  d'arrêt (arrêt en cours compté jusqu'à aujourd'hui) et des prolongations d'avenant.
- **Bordereau** : un article du bordereau ne se modifie que par une nouvelle ligne de `prix_versions`
  (avenant et / ou motif obligatoire) ; un article hors bordereau se modifie directement, chaque
  modification crée aussi une version. Version 1 = état initial.
- **Événements** : catégories par marché (5 par défaut), suppression logique, pièces jointes dans le
  compartiment privé `evenements` (`<marche_id>/<evenement_id>/<piece_id>.<ext>`, 10 Mo). Droit
  `evenements` ajouté au modèle « responsable » (et aux responsables existants).
- **Nouveau marché** : catégories d'événements et règles d'attachement créées automatiquement.

## Métrés et attachements (étape B) : pas de facture

- **Unité d'œuvre** = une fuite × un article. Solde = exécuté (`lignes_quantites`) − attaché (lots
  arrêtés, lignes « solde » et « anticipation »). Une quantité attachée ne l'est jamais deux fois ; une
  correction faite après l'arrêt réapparaît en **régularisation** (+ ou −) dans le lot suivant.
- **Lot** : brouillon (le responsable coche des unités ; quantités suivies en direct, exports marqués
  « projet ») → `arreter_attachement` (droit « attachements / valider ») : mentions du CPS contrôlées
  selon les règles du marché, quantités et articles figés, numéro attribué, fuites verrouillées.
  Ensuite seuls l'acceptation, la référence de facture et l'observation se modifient (suivi, aucun calcul).
- **Natures de ligne** : `solde` ; `anticipation` (réfection attachée avant exécution, accord du maître
  d'ouvrage, si la règle du marché l'autorise ; la vraie réfection fait la différence) ; `libre` (sans
  fuite : balayage, maintien en attendant le plan du réseau) ; `forcage` (administrateur, hors solde,
  motif obligatoire).
- **Réouverture** : administrateur, dernier lot arrêté seulement, motif obligatoire.
- **Récapitulatif** : quantité du marché, antérieur (lots arrêtés précédents), ce lot, cumul, %.
- **Pièces posées : terrain et corrections (lot R)** : l'inventaire des fournitures posées reflète le réel du terrain.
  Une pièce saisie par l'auteur de la réparation (auteur terrain, ou compte qui l'a saisie) est « terrain », à tout
  moment et quel que soit le canal. Tout autre compte corrige selon son intention, avec un motif obligatoire contrôlé en
  base et le droit « interventions / modifier » sur la réparation d'un autre : **remplacement** d'une pièce erronée
  (nouvelle pièce avec `remplace_piece_id` ; l'ancienne reste en base, marquée « remplacée »), **oubli** (pièce
  ajoutée), **retrait** d'une pièce non posée (marquée « retirée »). La saisie d'origine n'est jamais modifiée ni
  supprimée par un autre compte ; une correction ne se modifie pas, elle se remplace ou se retire. Les pièces ne
  changent jamais le montant (fournitures comprises dans les prix, CPS art. II-15) : la facture passe uniquement par les
  lignes de prix et leur requalification avec motif. `v_pieces_reelles` : inventaire réel (ni remplacées ni retirées)
  avec provenance, nature, motif et pièce remplacée, base du futur inventaire et du rapprochement avec Dolibarr ;
  `v_pieces_posees`, l'export des fuites et le rapport PDF par fuite en sont tirés.
- **Contrôles et corrections (lot R)** : toute modification d'une ligne de quantités par un utilisateur (ajout,
  article, quantité, suppression) exige un motif, gardé avec son auteur et sa date (ancienne valeur au journal) ;
  l'article remplacé n'est plus reproposé par la règle automatique ; une unité par prix et par fuite, lignes manuelles
  comprises (deux joints sur un même élément de conduite = un seul prix 11 à 13). `v_controles_attachement` : 10
  contrôles non bloquants (robinet / collier PEC posé sans la case ou l'inverse, fouille sans volume, réparation sans
  prix de réparation, réfection en retard, ligne incohérente sans motif, polyéthylène au-delà du seuil du marché,
  réparation sans article) ; `v_hors_bordereau` : travaux à faire valoir (excédent de PE au-delà du seuil des prix 6
  et 9, réparation sans article, pièces non couvertes de l'inventaire réel), à présenter à la SRM pour un prix nouveau.
  Réservées aux droits « attachements / lire » et « quantités / lire ». Seuil du polyéthylène :
  `marches.longueur_pe_max_m` (Paramètres > Marché, 2 m par défaut, copié avec le marché), aussi suivi par `v_anomalies`.

## Articles Dolibarr (lot T, remplace le catalogue et le rapprochement du lot P1)

Les produits Dolibarr sont le seul référentiel des pièces posées, commun à tous les marchés (contrat :
`docs/lots/lot-articles-dolibarr.md`). Chaque fois que Dolibarr reçoit de nouveaux produits :
1. Sur le serveur, relancer `C:\xampp\php\php.exe export.php` dans le dossier `export-fuites` du Bureau (lecture seule,
   aucun prix), puis copier le fichier sur le Mac, **hors du dépôt** (`data-private/dolibarr/`).
2. Panneau web, compte administrateur : Paramètres > Articles > « Importer produits.csv », choisir le fichier, vérifier
   les familles cochées (RAC, CND, ROB, AEP, VRI) et l'aperçu (nouveaux, modifiés, retirés), puis « Importer ».
3. L'import (`importer_produits_dolibarr`) est idempotent ; les **nouveaux produits arrivent désactivés** ; un produit absent
   du fichier devient inactif (retiré de la liste déroulante, historique gardé). Chaque import est tracé dans `imports_dolibarr`.
4. Paramètres > Articles > filtre « Nouveaux du dernier import » : activer ceux qui servent sur les chantiers (ligne par
   ligne ou sélection). L'activation vaut pour tous les marchés.

Article du bordereau suggéré pour une pièce (contrôles de l'attachement) : Paramètres > Bordereau > « Article suggéré pour
les pièces posées », règle par article ou par famille, propre à chaque marché. Le réparateur ne voit jamais de code. L'API REST de Dolibarr n'accepte que les adresses du réseau local (`API_RESTRICT_ON_IP`) : pas d'appel
depuis Vercel ni GitHub ; la synchronisation automatique (lot P4) se fera par envoi depuis le serveur.

## Fournitures posées et rapprochement Dolibarr (chantier v2, X3 : lots P3 et P4)

- **Inventaire** (`v_inventaire_fournitures`) : l'inventaire réel de `v_pieces_reelles` (pièces du terrain ni remplacées ni
  retirées, corrections du bureau), regroupé par `produit_id` ; famille = préfixe de la référence du produit. Lecture :
  droit « quantités / lire » (responsable, administrateur), en plus de la RLS des pièces. Aucun prix.
- **Widget du tableau de bord (S6)** : `select * from resume_fournitures(:marche_id, :du, :au)` (jours de réparation à
  l'heure du Maroc, bornes comprises, nulles = sans limite) → `produit_id, designation, famille, unite, quantite, pieces,
  fuites, corrections`, triés par quantité décroissante. Total des pièces et part des corrections : sommes de ces colonnes.
- **Mouvements Dolibarr** : import du CSV `mouvements_chantier*.csv` dans le navigateur (Fournitures > Rapprochement
  Dolibarr, administrateur) ; `importer_mouvements_dolibarr(jsonb)` ne lit que les clés utiles (jamais prix, valeur, PMP),
  idempotent par rowid. Importer **les deux fichiers** (courant et dotation initiale du 2026-09-30) : sur l'export du
  2026-10-05, 93 mouvements, 16 lignes d'annulation, 45 références, **143,5 unités transférées** (égal au stock de
  l'entrepôt 76 relevé dans Dolibarr). Ce CSV reste le **secours** de l'envoi automatique (ci-dessous).
- **Envoi automatique (X8, S13)** : tâche planifiée sur le serveur Dolibarr (`outils/dolibarr/`, toutes les 15 min,
  sortante seulement) → fonction `dolibarr-mouvements` (jeton dédié) → `recevoir_envoi_dolibarr` (service_role) →
  `importer_mouvements_dolibarr`. Le script demande d'abord l'**état** (plus grand rowid reçu par entrepôt suivi, CSV
  compris), lit dans Dolibarr les mouvements plus récents et ceux des 3 derniers jours, et les envoie par lots ; la base ne
  passe à l'import que les nouveaux ou changés (jamais de doublon : clé = rowid Dolibarr), ignore les entrepôts qu'aucun
  marché ne suit et refuse un lot invalide **en bloc** (journalisé, réessayé au passage suivant). Après une coupure, le
  rattrapage est automatique. Journal `envois_dolibarr` affiché sur la page Rapprochement (« Dernier envoi automatique »,
  erreurs, « en retard » au-delà d'une heure sans nouvelles). Un import de l'envoi automatique n'a pas d'auteur
  (`imports_mouvements_dolibarr.importe_par` nul).
- **Calcul** (`rapprochement_fournitures`) : transféré = somme signée des mouvements de l'entrepôt du marché hors
  consommations (retours déduits, paires « CANCEL » neutralisées) ; consommé = sortie de type 1 sans entrepôt de
  contrepartie, hors annulation ; posé = inventaire réel par jour de réparation ; écart = transféré − consommé − posé, sur la
  période et en cumul jusqu'à la fin de la période ; « au-delà du seuil » si |écart cumulé| > seuil % du transféré cumulé
  (tout écart si rien n'a été transféré). Indicatif, jamais bloquant.
- **Dépendance** : `v_inventaire_fournitures` et `rapprochement_fournitures` lisent `v_pieces_reelles` ; une migration qui
  la supprime et la recrée doit d'abord supprimer puis recréer `v_inventaire_fournitures` (la fonction, en SQL, est
  recompilée à l'appel).

## Marché de démonstration `DEMO` (données fictives)

Créé par `20261004230000_marche_demo.sql` pour les essais, sans rien écrire dans le marché SRM :
copie des paramètres SRM (fiche, bordereau, zones, secteurs, équipes, natures, motifs, catalogue (supprimé par le lot T),
règles d'attachement, modèles d'export), décalée au 3 août 2026, puis 25 fuites d'août à octobre
(tous les statuts, origine SRM ou STEPAG, avec ou sans réfection, sondage négatif, réparation en deux
temps, re-détection, gros diamètre, alertes et anomalies), le lot N° 01 d'août arrêté, puis une
réfection tardive et une profondeur corrigée (régularisation + 0,160 m3) à attacher en septembre.
L'administrateur le choisit dans le sélecteur de marché ; un agent n'y a accès que si on l'y affecte.
**Après les essais** : désactiver le marché DEMO (administrateur) ; ses données restent isolées.

## Essai local complet (Docker)

Pour tester le panneau sur une vraie pile Supabase (sans toucher à la production) :
`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start -x studio,imgproxy,logflare,vector,realtime,edge-runtime,mailpit,supavisor,postgres-meta`
applique toutes les migrations ; les comptes d'essai se créent avec la clé `service_role` **locale**
affichée par la commande (jamais celle du projet).

## Plan du réseau et balayage (lot S)

Contrat : `docs/lots/lot-s-reseau.md`. Conversion du DWG : `outils/reseau/README.md`.

- **Tables** : `troncons` (LineString WGS84, référence stable du dessin, diamètre, matériau, secteur, zone,
  `longueur_m` calculée), `noeuds` (jonction, extrémité, vanne, bouche d'incendie, ventouse, vidange, compteur,
  réservoir, autre), `balayages` (un passage d'une équipe / d'un agent sur un tronçon, jour à l'heure du Maroc ;
  `premier_passage` posé par la base ; annulation avec motif, jamais de suppression).
- **Un tronçon n'est payé qu'une fois** (CPS art. II-15) : les linéaires « balayés » ne comptent que les premiers
  passages ; les repassages sont à part (`lineaire_repasse_m`). Statut du secteur (`a_balayer`, `en_cours`,
  `balayee`) recalculé par la base.
- **Fonctions** : `importer_troncons`, `importer_noeuds` (administrateur, paquets de 2 000 au plus, idempotent par
  référence), `reseau_geojson` / `noeuds_geojson` (par secteur : `null` = tous les zonés, `'{}'` + `p_sans_secteur`
  = non zonés seuls), `etat_balayage`, `affecter_troncons_secteur`, `affecter_troncons_polygone`,
  `recalculer_contour_secteur`, `definir_contour_secteur`.
- **Vues** : `v_lineaire_secteurs`, `v_lineaire_zones`, `v_balayage_journalier` (jour, équipe, agent, zone, secteur :
  tronçons, linéaire, repassé, nœuds, fuites du secteur ce jour, répétées sur chaque ligne du secteur),
  `v_troncons_sans_secteur`.
- **Volumes réels** (essai local du 2026-10-06, PostgreSQL 17 + PostGIS 3.6) : 44 044 tronçons et 30 820 nœuds
  importés en 15 s ; GeoJSON d'un secteur de 4 500 tronçons 0,1 s (1,4 Mo), réseau entier 0,8 s ; état de balayage
  12 ms. La CI GitHub tourne en PostgreSQL 16 : à confirmer au premier passage de la CI.
- **Importer le réseau en production** (administrateur, **après accord d'Issam**) : Paramètres > Réseau > Import,
  dans l'ordre : `secteurs.geojson` (contours), `troncons.geojson`, `noeuds.geojson` (fichiers produits dans
  `data-private/reseau/`, jamais dans le dépôt).
- **Droits** : lecture des tronçons et nœuds pour tout affecté au marché ; balayage selon le droit « balayage »
  (modèle détection : voir, cocher, annuler les siens ; responsable : tout). Le chef de réparation n'a pas le
  droit « balayage » (il voit le réseau sur la carte, pas le journal).

## Chantier v2 : saisie terrain et anticipation (S2)

Contrat complet : `docs/lots/chantier-v2-base-s2.md`.

- **Nouvelle fuite** : champs exigés par `marches.champs_obligatoires_fuite` (SRM, DEMO : tournée, secteur, ouvrage,
  visibilité, nature de dégradation), contrôlés à la création ; les fuites antérieures restent valides ; un champ exigé
  rempli ne se vide plus. Nouveaux champs : nature de dégradation, diamètre, matériau, tronçon.
- **Suggestions** (`suggestions_localisation`) : rues OSM proches, secteur, tronçon le plus proche ; jamais pré-remplies.
  Rues d'Oujda : © contributeurs OpenStreetMap, licence ODbL 1.0 (mention à afficher avec les suggestions).
- **Listes** : diamètres par matériau et représentants du maître d'ouvrage réglables par marché ; libellés arabes des
  listes à valeurs fixes dans `libelles_listes` (à relire par Issam).
- **Non réparée** : terrassement et travaux attachés quel que soit le motif ; fouille sur revêtement → réfection
  attendue (`v_a_refectionner` une fois validée, notification à l'équipe de réfection ; `v_refections_dues`).
- **Anticipation** : case du marché (`parametres_attachement.refection_anticipee`), panier (`prix.anticipable`, réfection
  par défaut), propositions (surface de fouille), une seule anticipation par unité et jamais d'un travail déjà exécuté ;
  à l'exécution, solde exécuté − attaché (pas de double paiement).

## Règles pour les migrations suivantes

- `alter table … enable row level security` juste après chaque `create table`.
- Privilèges accordés explicitement (`grant select, insert, update … to authenticated`) ;
  rien pour `anon` ; pas de `delete` sur les données terrain.
- Toute nouvelle fonction : `revoke execute … from public, anon` puis `grant` ciblé.
- Fonctions SECURITY DEFINER dans `private`, avec `set search_path = ''`.

## Reste à faire (migrations suivantes)

- **M2** : ~~tronçons du réseau, balayage coché sur la carte, journées de balayage~~ (lot S, migration
  `20261006130000`) ; reste : mesures de débit nocturne, τ1 / τ2 et pénalités de performance.
- **M3** : attachements faits (étape B). Factures, majoration, retenue de garantie, pénalités et
  révision des prix **ne seront pas calculées** (décision d'Issam du 2026-10-04 : facture à la main
  sur Excel à partir des attachements).
- **M4** : traces GPS (un tracé par agent et par jour), envoi des notifications push (base posée par S1 : `notifications`, `appareils_push`), révision des prix.
