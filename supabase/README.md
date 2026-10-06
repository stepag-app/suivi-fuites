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
| `migrations/20261006150000_photos_r2.sql` | lot N : `marches_photos(p_action)` (marchés où le compte a le droit « photos » lire / creer / supprimer ; même règle que la RLS de `photos` et du compartiment Storage), lue par la fonction serveur `photos-r2` ; `anon` sans accès ; commentaire de `photos.stockage` |
| `migrations/20261006110000_droits_auteur_inconnu.sql` | correctif : `private.peut` renvoie `false` (et non `null`) pour une portée « siennes » quand la saisie n'a ni auteur terrain ni `saisi_par` ; `avant_modification_saisie` bloque donc bien les saisies sans auteur (importées, de démonstration, générées) |
| `config.toml` | configuration minimale de la CLI Supabase |
| `functions/gerer-utilisateurs/` | fonction serveur (création des comptes, mot de passe, révocation, rôles), déployée par le workflow |
| `functions/photos-r2/` | fonction serveur des photos sur Cloudflare R2 : vérifie le compte (JWT) et ses droits (`marches_photos`, RLS de `photos`), puis signe des URL S3 de courte durée (dépôt `PUT` 15 min, lecture `GET` 1 h, 200 chemins par appel) ; secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (`R2_BUCKET` facultatif) posés par le workflow depuis les secrets GitHub ; sans eux, répond 503 `r2_non_configure` et les clients restent sur Supabase Storage |
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
| `tests/database/16_photos_r2.test.sql` | 10 tests du lot N : privilèges de `marches_photos`, rien sans compte ni sans affectation, marché de l'agent en lecture et en dépôt, action inconnue refusée, administrateur sur tous les marchés, marché désactivé sans dépôt |
| `ci/` | simulateur Supabase et script de test pour la CI GitHub (ne jamais appliquer au projet) |

## Ce que fait le schéma

- **Multi-marchés** : toutes les données portent `marche_id`. Les clés étrangères composites
  `(id, marche_id)` empêchent de rattacher une donnée à un paramètre d'un autre marché.
- **Droits** : table `droits` (utilisateur × marché × type de donnée) avec lire / créer /
  modifier (non, siennes, toutes) / supprimer (non, siennes, toutes) / valider.
  Les modèles `detection`, `chef_reparation`, `responsable` s'appliquent avec
  `appliquer_modele_role(profil, marché, rôle)` et se cumulent. L'administrateur
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
  réparations, réfections, photos ou quantités ne changent ensuite, sauf par un responsable.
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

Workflow `.github/workflows/sauvegarde-base.yml` : chaque nuit (02:17 UTC) et à la demande, export du
schéma, des données `public` et des comptes `auth`, chiffré (AES-256) puis conservé **30 jours** en
artefact GitHub. Une fois : créer le secret `SAUVEGARDE_PASSPHRASE` (phrase secrète rangée dans le
gestionnaire de mots de passe, copie hors ligne ; jamais dans le dépôt ni dans le chat), puis lancer le
workflow à la main pour valider la première sauvegarde.

**Test de restauration** (lot K, PR #27) : le workflow `.github/workflows/test-restauration.yml` tourne chaque
lundi à 04:07 UTC, et à la demande (Actions > Test de restauration > Run workflow). Il prend la dernière
sauvegarde réussie de `main`, la déchiffre avec `SAUVEGARDE_PASSPHRASE`, la restaure dans une base Supabase
locale et vierge créée dans la CI (`supabase start`, même PostgreSQL que la production ; **jamais** la
production), puis compare table par table les lignes de la sauvegarde à celles de la base restaurée.
Le résumé du run donne la date de la sauvegarde et le nombre de lignes par table ; aucune donnée n'est
affichée. Premier essai (2026-10-05) : 65 tables, 91 comparaisons, toutes égales.

Si le test échoue :
- « aucune exécution réussie » ou « plus de 48 h » : la sauvegarde nocturne ne tourne plus ; vérifier
  Actions > Sauvegarde de la base, puis la relancer ;
- échec du déchiffrement : `SAUVEGARDE_PASSPHRASE` ne correspond plus ;
- échec de restauration ou écart de lignes : la sauvegarde n'est pas fiable ; relancer une sauvegarde puis
  le test, et corriger avant toute opération risquée sur la base.

**Défauts de la sauvegarde actuelle** (révélés par le test, **à corriger**, voir `docs/feuille-de-route.md`) :
1. `donnees_public.sql` contient `storage.buckets_vectors` et `storage.vector_indexes`, non inscriptibles
   (`permission denied`) : les exclure de l'export (`-x storage.buckets_vectors -x storage.vector_indexes`).
2. `donnees_public.sql` contient déjà les comptes (`auth`) : `donnees_auth.sql` fait doublon et l'ancienne
   procédure (auth puis public) échoue sur des doublons.
3. `schema.sql` n'a ni le déclencheur `creer_profil_apres_inscription` (sur `auth.users`) ni les règles de
   `storage.objects` (photos, evenements, logos) : une base restaurée ne crée plus de profil et refuse les
   fichiers.

Restauration réelle (sur un projet Supabase **vierge**, jamais sur la production sans décision explicite),
en attendant la correction de l'export :
```bash
gpg --decrypt sauvegarde-AAAAMMJJ-HHMM.tar.gz.gpg | tar -xzf -     # schema.sql, donnees_*.sql
psql "$URL_BASE_NEUVE" -v ON_ERROR_STOP=1 --single-transaction -f schema.sql
# retirer d'abord de donnees_public.sql les deux blocs COPY vides storage.buckets_vectors / vector_indexes
psql "$URL_BASE_NEUVE" -v ON_ERROR_STOP=1 --single-transaction -f donnees_public.sql   # comptes compris
```
Puis recréer le déclencheur `creer_profil_apres_inscription` (migration `20261004090100`) et les règles de
`storage.objects` (migrations `20261004090600`, `20261004180100`, `20261005120000`), et marquer les
migrations comme appliquées (`supabase migration repair --status applied …`) avant tout `db push`.

**Limites** : les photos (Storage) ne sont pas incluses ; 30 jours de rétention ; l'historique des migrations
n'est pas sauvegardé.

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
- **M4** : traces GPS (un tracé par agent et par jour), notifications push, révision des prix.
