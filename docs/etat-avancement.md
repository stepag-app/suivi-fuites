# État d'avancement et passation entre sessions

> À lire en début de chaque session, avec `CLAUDE.md` et `supabase/README.md`.
> Mettre à jour en fin de session (fait, en attente, décisions).

Dernière mise à jour : 2026-10-05 (session 5 : lots F, G, H, I, J menés en parallèle ; PR #21 à #25 **en brouillon**,
non fusionnées, CI verte ; fusion sur demande d'Issam après ses essais).

## 1. Fait

| Élément | Où | État |
|---|---|---|
| Règles du marché 4500004453 extraites des documents | `references/regles-marche-4500004453.md` | sur `main` |
| Migration 1 : schéma, droits, RLS, vues, données du marché (13 prix, 5 zones, 34 secteurs, 261 pièces) | `supabase/migrations/` | **déployée** sur le projet `osajiinsibwrsltntmsk` |
| 61 tests pgTAP + CI | `supabase/tests/`, `.github/workflows/base-de-donnees.yml` | verts |
| Déploiement automatique des migrations et de la fonction à chaque fusion dans `main` | `.github/workflows/deployer-base.yml` | opérationnel (secrets créés) |
| Compte administrateur `issam` (`issam@agents.stepag.ma`) | Supabase Auth | créé et **vérifié** (`issam | true | true`) |
| Réglages Auth Supabase : fournisseur e-mail activé, « Confirm email » désactivé | tableau de bord Supabase | vérifié sur captures (2026-10-04) |
| Fonction serveur de gestion des comptes | `supabase/functions/gerer-utilisateurs/` | écrite, compilée ; déployée par le workflow à la fusion |
| Panneau web + mode terrain (Next.js) | `web/` (voir `web/README.md`) | **en ligne** : https://suivi-fuites-web.vercel.app (Vercel, équipe STEPAG, plan Hobby) ; connexion, création de compte et saisie de fuite validées par Issam le 2026-10-04 |
| Écran Paramètres (ouvriers, équipes, motifs, prix hors bordereau) et mode hors ligne léger (file d'attente IndexedDB, synchro, service worker, page « En attente ») | `web/src/app/(app)/parametres`, `web/src/lib/hors-ligne.ts` | PR 1 de la session ; **à tester sur la tablette** (mode avion : créer une fuite avec photo, rétablir le réseau) |
| Socle de l'application Android Expo : connexion, liste, nouvelle fuite (GPS, photos), file d'attente hors ligne, envois en attente ; workflow de compilation de l'APK | `mobile/` (voir `mobile/README.md`), `.github/workflows/apk.yml` | PR 2 de la session ; types et bundle Android vérifiés ici, **compilation APK à valider par le workflow** |
| Sauvegarde nocturne chiffrée de la base (schéma, données, comptes), 30 jours | `.github/workflows/sauvegarde-base.yml`, `supabase/README.md` | **active** (secret créé le 2026-10-05, premières exécutions réussies) ; essai de restauration à faire |
| Correctif droits `service_role` (migration `20261004130000`) | `supabase/migrations/` | déployé ; simulateur de test rendu strict (aucun droit par défaut), 64 tests |
| **Étape A** : application standard (fiche du marché : titulaire, maître d'ouvrage, délai, OS typés, arrêts et reprises, avenants, bordereau versionné, journal des événements avec pièces jointes, règles d'attachement, libellés et contrôles du client par marché) | migrations `20261004180000`, `20261004180100` ; Paramètres > Marché, Bordereau, Attachement, Événements | **PR [#10](https://github.com/stepag-app/suivi-fuites/pull/10) fusionnée** (accord d'Issam) ; migrations **déployées** le 2026-10-04 à 19 h 05 UTC |
| **Étape B** : lots d'attachement figés (solde fuite × article, brouillon puis arrêt, régularisations, réfection anticipée, ligne libre, refacturation forcée et réouverture par l'admin) | migration `20261004200000` ; pages `/attachements` | même PR #10, déployée |
| **Étape C** : panneau d'export (Excel, PDF, Word, CSV), modèles par marché, en-têtes du marché, arabe dans les fichiers | migration `20261004210000` ; `web/src/lib/export/` | même PR #10, déployée |
| 164 tests pgTAP (64 + 49 A + 41 B + 10 C) ; migrations rejouées sur une vraie pile Supabase locale (Docker) ; parcours Playwright des trois étapes ; fichiers d'export rendus et contrôlés (PDF, Word et Excel via LibreOffice) | `supabase/tests/database/` | verts en local et en CI |
| **Marché DEMO** (données fictives) : copie des paramètres SRM, 25 fuites août-octobre (tous les cas), lot N° 01 d'août arrêté, régularisation et réfection tardive à attacher en septembre, arrêt de travaux, 4 événements | migration `20261004230000` ; `supabase/README.md` § Marché de démonstration | PR [#11](https://github.com/stepag-app/suivi-fuites/pull/11), **déployée** le 2026-10-04 à 19 h 48 UTC |
| Deux fausses anomalies corrigées (terrassement sans fouille, re-détection vue comme doublon) | migration `20261004220000` | même PR |
| Droits des agents de terrain vérifiés : détection et chef de réparation ne voient que les fuites et les réparations (ni attachements, ni prix, ni paramètres, ni exports) ; 30 tests pgTAP de plus (194 au total) | `supabase/tests/database/05_marche_demo.test.sql` | verts |
| Sélecteur de marché lisible dans l'en-tête du panneau ; marchés classés du plus récent au plus ancien (SRM avant DEMO) ; choix du marché sur la tablette (mémorisé) ; « Attachement d'octobre » | `web/`, `mobile/src/session.tsx`, `mobile/src/ecrans.tsx` | PR [#11](https://github.com/stepag-app/suivi-fuites/pull/11) fusionnée et déployée |
| **Lot B : carte des fuites** (`/carte`) : fond OpenStreetMap minimal (OpenFreeMap, sans clé), couleur par statut, alertes, regroupement, bulle avec lien vers la fiche, filtres (statut, secteur, période, alertes), recentrer, contours des zones / secteurs si `geom` rempli ; lien « Carte » dans le menu. Parcours Playwright (admin à la souris, agent de détection au toucher) sur pile Supabase locale ; fond réel **non vérifié ici** (tuiles bloquées par le réseau de la session : fond de secours testé) | `web/src/app/(app)/carte/`, `web/scripts/copier-maplibre.mjs` ; `web/README.md` § Carte | PR [#18](https://github.com/stepag-app/suivi-fuites/pull/18) fusionnée ; **à vérifier sur Vercel et la tablette** (fond de carte, toucher) |
| Retours d'Issam sur le lot (2026-10-04) : fuites cliquables (fiche dans un nouvel onglet), listes « Travaux du lot » et « À attacher » horizontales, compactes et zébrées, page élargie ; titre qui suit la saisie (date, N° prévu), intitulé qui suit le mois ; Excel prêt à imprimer en A4 (une page en largeur, titres répétés, colonnes resserrées selon l'orientation) | `web/src/app/(app)/attachements/`, `web/src/lib/export/xlsx.ts` | PR #12 fusionnée |
| **Lot A, tablette** : fiche d'une fuite (infos, statut, photos, réparations, réfections, sans prix), saisie d'une réparation (pièces du catalogue, ouvriers, photos avant / pendant / après) et d'une réfection, hors ligne (file d'attente ordonnée par fuite, reprise après coupure, erreurs claires dont fuite verrouillée), contrôle des doublons à la création (même fuite / nouvelle fuite liée), boutons de saisie selon les droits (détection en lecture), bouton « Y aller » (application de cartes externe ; carte intégrée reportée), photos regroupées dans `photos.ts` (prêt pour R2) | `mobile/src/` (`fiche.tsx`, `saisie.tsx`, `file-attente.ts`, `photos.ts`), `mobile/essais/` | PR [#13](https://github.com/stepag-app/suivi-fuites/pull/13) fusionnée ; types et bundle Android vérifiés, **25 vérifications** contre une pile Supabase locale (chef, détection, DEMO) ; **à essayer sur la tablette** |
| **Lot D : rapport PDF par fuite** (fiche : bouton « Rapport PDF » ; liste : « Rapports PDF (n) », une fuite par page) : en-tête du marché, identification et GPS, réparations, réfections, prix si droit « quantités / lire », photos par type réduites, visas ; 6 photos → 2 pages, 393 Ko, < 1 s | `web/src/lib/export/rapport-fuite.ts`, `web/README.md` § Rapport PDF par fuite | PR `claude/lot-d-rapport-pdf` ; testé sur pile locale (Playwright, PDF rendus et relus) ; PR #15 **fusionnée** ; **à faire valider par Issam** (contenu exigé par la SRM ?) |
| Lot D, ajouts : itinéraire vers la fuite (lien dans le rapport, bouton « Y aller » sur la fiche) ; lecture des photos par `urlsPhotos` (point unique pour le futur passage à R2) | `web/src/lib/itineraire.ts`, `web/src/lib/photo.ts` | PR #17 fusionnée |
| **Interface au style SAP Fiori** (choix d'Issam du 2026-10-05 parmi 5 maquettes) : barre d'application sombre, onglets de modules, tableaux et statuts Fiori, densité bureau / tactile ; widgets d'indicateurs (modèle ERP) sur la liste des fuites ; liste en tableau sur bureau | `web/src/app/globals.css`, `web/src/app/(app)/layout.tsx`, `web/src/lib/ui/` ; `web/README.md` § Style | PR #19 fusionnée ; **à valider par Issam** ; APK : fait par le lot H (PR #24) |
| **Lot C : paramètres à l'écran** : page `/marches` (admin : liste, activer / désactiver, créer vide ou par copie des paramètres d'un marché), Paramètres > Secteurs (zones et secteurs), Natures de réfection, Catalogue des pièces (recherche), règles de proposition des articles du bordereau (famille, matériaux, diamètres, sans nouvelle version) ; marché désactivé masqué aux agents | migration `20261005100000_copie_marche.sql` (`copier_marche`) ; `web/src/app/(app)/marches/`, `web/src/app/(app)/parametres/Onglet{Secteurs,Natures,Catalogue}.tsx` ; 36 tests pgTAP (`06_copie_marche_parametres`) | PR #14 fusionnée, migration **déployée** le 2026-10-04 à 23 h 40 UTC ; tests pgTAP, tsc et parcours Playwright sur pile Supabase locale verts |
| **Lot F : logos** du titulaire et du maître d'ouvrage (Paramètres > Marché ; PNG ou JPEG, 2 Mo, réduits à 600 px), repris dans les en-têtes PDF (exports, lots, rapport par fuite, carte), Word et Excel | migration `20261005120000_logos_marche.sql` (compartiment privé `logos`) ; `web/src/lib/logos.ts`, `web/src/lib/export/` ; 37 tests pgTAP (`07_logos`), `web/scripts/essai-logos.mjs` | PR [#22](https://github.com/stepag-app/suivi-fuites/pull/22) **en brouillon**, CI verte (267 tests pgTAP) ; écran non essayé connecté ; **à essayer après fusion et déploiement** (l'envoi échoue sur l'aperçu tant que la migration n'est pas en production) |
| **Lot G : impression de la carte** (« Imprimer la carte ») : PDF A4 / A3, portrait / paysage, en-tête du marché, filtres, carte à 200 dpi, légende, échelle, nord, coordonnées WGS84, © OSM, liste des fuites en option ; gabarit générique réglable (`GABARIT`) | `web/src/lib/export/carte-pdf.ts`, `web/src/app/(app)/carte/{capture,couches,impression}.ts`, `web/scripts/verifier-carte-pdf.mjs` | PR [#25](https://github.com/stepag-app/suivi-fuites/pull/25) **en brouillon**, CI verte ; essais Chromium sur le vrai fond (page d'essai) ; **à essayer sur l'aperçu Vercel** (DEMO) ; gabarit à confirmer avec la SRM (point ouvert 12) |
| **Lot H, tablette** : style Fiori de l'APK, photos seules depuis la fiche (fuite, avant / pendant / après, réfection ; droit « photos / créer »), modification d'une réparation envoyée (droit et portée, hors ligne, changements seulement, après la création) | `mobile/src/` (`ui.tsx`, `fiche.tsx`, `saisie.tsx`, `modification.ts`, `file-attente.ts`), `mobile/essais/file-attente-hors-pile.test.mjs` | PR [#24](https://github.com/stepag-app/suivi-fuites/pull/24) **en brouillon**, CI verte (APK compilé, artefact de la PR) ; 28 vérifications sans pile ; rendu vu sur aucune tablette : **à essayer sur la tablette** ; le chef ne peut pas retirer une pièce déjà envoyée (droit « supprimer » = non) |
| **Lot I : tableau de bord v1** (`/tableau-de-bord`) : période, indicateurs de la période et à ce jour, statuts, 12 semaines, secteurs / zones, attachements (selon les droits) ; pas de lien vers `/fuites` (pas de filtres dans l'URL) | `web/src/app/(app)/tableau-de-bord/`, `web/src/lib/ui/tableau-de-bord.ts`, `web/scripts/verifier-tableau-de-bord.mjs` | PR [#23](https://github.com/stepag-app/suivi-fuites/pull/23) **en brouillon**, CI verte ; 15 vérifications de calcul ; **à essayer sur l'aperçu Vercel** (DEMO, admin puis agent de détection) |
| **Lot J : marché désactivé en lecture seule** (écritures refusées en base sauf administrateur, lecture conservée) | migration `20261005120100_marche_inactif.sql` ; 9 tests pgTAP (`08_marche_inactif`) | PR [#21](https://github.com/stepag-app/suivi-fuites/pull/21) **en brouillon**, CI verte (tous les tests existants inchangés) |
| Intégration des PR web #21, #22, #23, #25 : fusion ensemble sans conflit sur `main`, tsc, build et les 3 scripts de vérification verts ; la carte imprimée reçoit les logos du lot F | — | vérifié le 2026-10-05 |

## 2. En attente d'Issam

**Priorité (session 5) : essais des PR en brouillon #21 à #25** (aperçus Vercel ; APK : artefact de la PR #24), puis dire « fusionner » :
Claude fusionne une fois la CI verte et vérifie le déploiement de la base (migrations des lots F et J).
Fournir les **logos** STEPAG et SRM (PNG de préférence) et confirmer le droit d'usage du logo SRM.
Questions : tableau de bord (page d'accueil du responsable ? délais en heures ou jours ? date de réparation =
dernière réparation ou passage à « achevée » ? comparaison avec la période précédente ? export PDF ?) ;
gabarit de la carte imprimée (visas, Lambert Nord Maroc en plus du WGS84, n° de planche, A3 ou échelle imposés).

0. **Essais sur le marché DEMO** (sélecteur en haut du panneau) : lot d'attachement de septembre
   (« + Nouveau lot », date au 30/09, cocher la régularisation de la fuite N° 2 et la réfection de la
   N° 3, réfection anticipée sur la N° 10), exports, alertes. Pour essayer l'APK sur DEMO, affecter un
   agent au marché DEMO (Utilisateurs). **Après les essais** : désactiver le marché DEMO.
   Dans le marché SRM : **Paramètres > Marché**, relire la fiche et compléter téléphones et e-mails.
1. **Test sur la tablette Samsung** (Chrome, « Ajouter à l'écran d'accueil ») : signaler une fuite avec GPS et photo, saisir réparation et réfection, vérifier les prix de la fiche. Noter tout ce qui gêne (boutons, étapes, champs manquants, lenteur, réseau).
2. **Plan du réseau `Reseau aep oujda.dwg`** : sera transmis plus tard. Voir § 4.
3. **Relecture** des libellés arabes (motifs, natures de réfection) et du découpage des 34 secteurs.
4. ~~Sauvegarde nocturne~~ **active depuis le 2026-10-05** : secret `SAUVEGARDE_PASSPHRASE` créé par Issam (phrase
   dans son gestionnaire de mots de passe), deux exécutions manuelles réussies à 16 h 05 UTC (runs 37337525271 et
   37337615644, archive chiffrée de 155 Ko, contenu contrôlé par le workflow : schéma, `marches`, comptes). **Reste** :
   un essai de déchiffrement et de restauration sur une base vierge. Historique : elle **échouait chaque nuit** (constaté le 2026-10-05 à
   02 h 30 : « Secret SAUVEGARDE_PASSPHRASE manquant dans GitHub »), donc **aucune sauvegarde n'existe**.
   Créer le secret GitHub `SAUVEGARDE_PASSPHRASE` (phrase secrète rangée dans le gestionnaire de mots de
   passe ; Settings > Secrets and variables > Actions), puis lancer « Sauvegarde de la base » à la main et
   vérifier l'artefact. **Ensuite** (demande d'Issam du 2026-10-05) : copie de la sauvegarde hors de GitHub
   (Gmail ou autre), restaurable à tout moment, **photos comprises** ; stockage et destination à décider
   (voir `docs/feuille-de-route.md` § 4, point 10).
5. **Secret GitHub `EXPO_PUBLIC_SUPABASE_ANON_KEY`** : **créé le 2026-10-04** ; la compilation APK n° 13 sur `main`
   (run 37241834456) l'a bien prise, artefact `suivi-fuites-apk` disponible jusqu'au 18/10/2026 : APK connectable.
   Reste : l'installer sur la tablette (sources inconnues autorisées, batterie « Non restreinte ») et le tester
   (avec le lot A une fois fusionné : fiche, réparation, réfection, hors ligne), puis le keystore de production.
6. **Keystore de production** de l'APK : à créer hors du dépôt, en deux copies, avant toute distribution (l'APK actuel est signé avec la clé de test d'Expo).
7. Faits : inscriptions publiques désactivées, fournisseur e-mail réglé, projet Vercel créé, premier agent créé.

## 3. Décisions prises (à respecter)

- **Lots en parallèle** (2026-10-05) : lots indépendants menés en même temps dans des copies isolées (worktrees), avec
  des périmètres de fichiers disjoints ; docs, README et `globals.css` réservés à la session principale, qui reporte la
  documentation de chaque lot ; une PR en brouillon par lot. Attention au quota du compte Max (partagé avec la paie).

- **Façon de travailler** (2026-10-05) : travail courant **en local** sur le MacBook avec Claude Code
  (`docs/travail-local.md`) ; solde cloud (≈ 60 $, expire le 5 novembre) gardé pour les gros lots autonomes.

- **Interface** (2026-10-05) : style **SAP Fiori** reproduit en CSS maison (pas de bibliothèque SAP UI5 :
  poids), avec les widgets d'indicateurs du modèle ERP ; planches PDF du réseau **en attente** des DXF / DWG
  (essai Qods Bas : extraction vectorielle fiable, attributs absents, calage à faire).

- **Application standard** (2026-10-04) : rien de figé pour STEPAG ou la SRM. Libellé et format de la
  référence client, sigle, jalons du client, seuils, devise, titulaire et maître d'ouvrage sont des
  paramètres du marché ; nom de l'organisation et domaine des identifiants par variables d'environnement.
- **Pas de facture** : l'appli s'arrête aux métrés et attachements (antérieur, lot, cumul, % par article).
  Factures, majoration, retenue de garantie, pénalités et révision des prix se font à la main sur Excel.
- **Circuit d'attachement** (validé par Issam) : unité d'œuvre = fuite × article du bordereau ; solde =
  exécuté − attaché ; le responsable coche des unités dans un lot **brouillon** (exports « PROJET »), puis
  l'**arrête** : quantités figées, numéro, fuites verrouillées, plus de double facturation. Une correction
  ultérieure revient en régularisation (+/−) dans le lot suivant. Réfection anticipée possible si la règle du
  marché l'autorise (accord du maître d'ouvrage noté). L'admin seul force une refacturation (hors solde) ou
  rouvre le dernier lot (motif obligatoire). **Arrêt** : responsable (droit « attachements / valider ») et admin.
- **Bordereau** : un article du bordereau ne se modifie que par une nouvelle version (avenant et / ou motif).
- **Fusion des PR** : Issam ne relit pas le code ; la PR sert à faire tourner la CI avant la production. Claude
  fusionne quand Issam le demande dans la session (« commit, push, fusionner »), une fois la CI verte, puis
  vérifie le workflow « Déploiement de la base ».
- **Agents de terrain** (2026-10-04) : détection et chef de réparation voient les fuites et les réparations,
  jamais les attachements, le paramétrage, les prix ni les exports ; responsable et administrateur seuls
  configurent et attachent (modèles de droits inchangés, garantis par les tests `05_marche_demo`).
- **Données d'essai** : dans un marché séparé `DEMO` (choix d'Issam), jamais dans le marché SRM.
- **Exports** : fichiers fabriqués dans le navigateur ; write-excel-file (19 Ko), jsPDF + autotable (140 Ko),
  docx (112 Ko), chargés à la demande ; police arabe Amiri (OFL) ; dans les PDF, l'arabe est composé par le
  navigateur et inséré en image.
- Supabase gratuit pour l'instant ; aucune sauvegarde automatique → backup maison (workflow `sauvegarde-base.yml`, photos non incluses).
- Bordereau « à majoration » (15 %) : l'appli montre les montants au prix du bordereau seulement ;
  la majoration et la facture se font à la main (décision du 2026-10-04 ci-dessus).
- Fuites signalées par la SRM : réparées et payées comme celles de STEPAG (`origine = 'srm'`).
- Pas de compte SRM : les jalons SRM (communication, validation, avis avant terrassement) sont
  saisis par STEPAG.
- Balayage : l'agent coche le réseau parcouru sur la carte ; le responsable exporte les points
  balayés. Mesures de débit nocturne saisies par le responsable.
- Rapports journaliers : au choix par équipe et secteur, ou par jour regroupé (Q-34).
- Numérotation unique des fuites par marché (Q-35).
- Pièces : catalogue seulement, sans stock ; quantités posées filtrables par secteur, période,
  équipe (Q-37, vue `v_pieces_posees`).
- Photos facultatives, alerte si aucune.
- Sondage négatif payé en terrassement (hypothèse Q-08, réglable : `motifs.terrassement_paye`).

## 4. Emplacement réservé : plan du réseau (DWG → DXF → tronçons)

**Statut : en attente du fichier.** Ne pas démarrer la migration 2 sans lui.

Ce qu'il faut obtenir d'Issam :
- `Reseau aep oujda.dwg` exporté en **DXF** (AutoCAD « Enregistrer sous » ou ODA File Converter) ;
- le **système de coordonnées** du dessin (probablement Lambert Nord Maroc, EPSG:26191, à
  confirmer) ou 3 à 4 points connus (coordonnées plan + GPS) pour le caler ;
- la **liste des calques** (lesquels portent les conduites, diamètres, matériaux, branchements).

Règles : le DWG et le DXF ne vont **jamais** dans le dépôt (données sensibles, taille ;
`data-private/` et `planches/` sont ignorés par git). Seul un résultat converti et allégé
(GeoJSON ou SQL des tronçons en WGS84) peut être importé dans Supabase.

Piste de conversion (à décider à la prochaine session) : session Claude Code **locale** sur le Mac,
`brew install gdal`, puis `ogr2ogr` (DXF → GeoJSON, reprojection EPSG:26191 → EPSG:4326, filtre
des calques réseau), contrôle visuel sur une carte, import dans la table `troncons`.

Ce que la migration 2 construira ensuite : `troncons` (LineString PostGIS, secteur, diamètre,
matériau, longueur), `balayage_troncons` (un tronçon payé une seule fois, prix 1), `journees_balayage`
(équipe, secteur, date, linéaire, cadence ≥ 4 km/jour/équipe), `mesures_debit` (campagnes avant /
après / maintien, 3 nuits) et vues de performance (Qi, Qf, ΔQ, τ1, τ2, pénalités, arrêt de zone).
Le droit `balayage` et le droit `mesures_debit` existent déjà dans `type_donnee`.

## 5. Prochaines étapes proposées

**Fait cette session (5)** : lots F (logos), G (impression de la carte), H (tablette), I (tableau de bord),
J (marché désactivé en lecture seule), en brouillon (PR #21 à #25).

**Application standard, ce qui manquait à l'écran** : fait par le lot C (marchés, secteurs, natures,
catalogue, règles de proposition). Reste : dessin des zones et secteurs (avec le plan du réseau), phases du
marché. (Marché désactivé en lecture seule : lot J.)

**Retouches visuelles des exports** : si la SRM impose un gabarit (cartouche, logos, mentions, visas),
passer une session **locale** sur le Mac avec aperçu navigateur ; tout le reste se règle dans les modèles.


1. Retours du premier test terrain (parcours connexion → fuite → réparation → réfection).
2. À ajouter dans le panneau selon les retours : paramètres (ouvriers, équipes, prix hors bordereau,
   motifs), carte des fuites, anomalies, journal, interface en arabe / mixte, exports PDF et Word.
3. Application Expo : socle, fiche, réparations / réfections et doublons faits (lot A). Lot H : style Fiori, photos depuis la fiche,
   modification d'une réparation. À ajouter : suivi GPS en arrière-plan (tracé par agent et par jour, M4 ; **bloqué** par
   les questions heures de suivi / information des agents / CNDP), notifications (**bloqué** : push, e-mail ou les deux ?),
   mise à jour de l'APK, suppression d'une réparation, modification d'une réfection. Mode hors ligne web : consultation et modification d'une fuite
   existante sans réseau non gérées.
4. Migration 2 dès réception du DXF : le balayage (prix 1 et 2) pourra alors s'attacher par tronçon ;
   en attendant, une **ligne libre** du lot d'attachement porte le linéaire balayé par secteur.
5. ~~Rapport PDF par fuite~~ (lot D, fait ; contenu à valider avec la SRM), ~~carte des fuites~~ (lot B, fait),
   état journalier au gabarit exact de la SRM (**bloqué** : modèle à fournir). ~~Impression PDF de la carte~~ (lot G) ;
   à suivre : gabarit SRM (point ouvert 12, à régler dans `GABARIT`), tracés GPS, balayage sur la carte (après le DXF).

## 6. Prompt pour démarrer une nouvelle session

```text
Lis CLAUDE.md, docs/etat-avancement.md, supabase/README.md, web/README.md et mobile/README.md.
Contexte : tout jusqu'à la PR #20 est fusionné et déployé. Session 5 : lots F, G, H, I, J en PR brouillon
#21 à #25 (CI verte) : vérifie leur état ; fusionne celles qu'Issam a validées (CI verte, puis workflow
« Déploiement de la base » pour #21 et #22), puis ses retours de test (DEMO, exports, carte, tableau de bord, APK).
Le plan DWG du réseau n'est pas encore disponible : ne commence pas la migration 2.
Objectif de cette session : [à préciser : corriger les retours du premier test, puis la prochaine
fonctionnalité].
Travaille en français, sur une branche dédiée avec une PR en brouillon ; ne touche pas au projet
Supabase de production sans mon accord explicite ; aucun secret dans le dépôt ni dans le chat.
Mets à jour docs/etat-avancement.md en fin de session.
```
