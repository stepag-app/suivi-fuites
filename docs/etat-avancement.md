# État d'avancement et passation entre sessions

> À lire en début de chaque session, avec `CLAUDE.md` et `supabase/README.md`.
> Mettre à jour en fin de session (fait, en attente, décisions).

Dernière mise à jour : 2026-10-09 (**fin du chantier v2, session S8** : audit, vérifications, passation, § 10). Tout le
chantier v2 (PR [#59](https://github.com/stepag-app/suivi-fuites/pull/59) à [#70](https://github.com/stepag-app/suivi-fuites/pull/70))
est fusionné dans `main` et déployé ; la PR #40 (photos R2) a été **fusionnée le 2026-10-07**. Audit tâche par tâche :
`docs/lots/chantier-v2-audit-s8.md`. Les § 3 à 9 sont l'historique des sessions précédentes ; le § 2 est refait et fait foi.
**Suite (2026-10-10) : plan du chantier v3, `docs/lots/chantier-v3.md`** (équipes supprimées, débits de nuit, rapports,
e-mail, Dolibarr, sauvegarde hors plateformes, audit, purge de DEMO, fermeture). **Correctif du 2026-10-10** : 403 des tuiles
du réseau (fonction `reseau-tuiles`), cause et gestes restants au § 2. **Sauvegarde hors plateformes (X9, S14)** : copie
nocturne sur le Drive de `stepag.app` en service, restauration depuis le Drive testée, voir § 11.

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
| Panneau web + mode terrain (Next.js) | `web/` (voir `web/README.md`) | **en ligne** : https://fuites.stepag.ma (domaine branché le 2026-10-07 : CNAME `fuites` dans Cloudflare, DNS only, vers Vercel ; Supabase Auth : Site URL et Redirect URL mises à jour) ; ancienne adresse https://suivi-fuites-web.vercel.app toujours active (Vercel, équipe STEPAG, plan Hobby) ; connexion, création de compte et saisie de fuite validées par Issam le 2026-10-04 |
| Écran Paramètres (ouvriers, équipes, motifs, prix hors bordereau) et mode hors ligne léger (file d'attente IndexedDB, synchro, service worker, page « En attente ») | `web/src/app/(app)/parametres`, `web/src/lib/hors-ligne.ts` | PR 1 de la session ; **à tester sur la tablette** (mode avion : créer une fuite avec photo, rétablir le réseau) |
| Socle de l'application Android Expo : connexion, liste, nouvelle fuite (GPS, photos), file d'attente hors ligne, envois en attente ; workflow de compilation de l'APK | `mobile/` (voir `mobile/README.md`), `.github/workflows/apk.yml` | PR 2 de la session ; types et bundle Android vérifiés ici, **compilation APK à valider par le workflow** |
| Sauvegarde nocturne chiffrée de la base (schéma, données, comptes) : GitHub 30 jours, R2 30 jours, **Google Drive de `stepag.app`** (30 quotidiennes, 12 mensuelles) ; photos, APK et fichiers Storage copiés sur le Drive, en incrémental, rien d'effacé | `.github/workflows/sauvegarde-base.yml` (jobs `sauvegarde` et `drive`), `test-restauration.yml`, `outils/sauvegarde/`, `supabase/README.md` § Sauvegarde et restauration et § Reprise après sinistre | **active** (X9, S14, PR [#86](https://github.com/stepag-app/suivi-fuites/pull/86)) : exécution manuelle du 2026-10-10 verte (archive de 10,6 Mo, 18 fichiers R2, 10 fichiers Storage sur le Drive) ; **test de restauration depuis le Drive vert** (base vierge, 23 fichiers référencés retrouvés), voir § 11 |
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
| **Interface au style SAP Fiori** (choix d'Issam du 2026-10-05 parmi 5 maquettes) : barre d'application sombre, onglets de modules, tableaux et statuts Fiori, densité bureau / tactile ; widgets d'indicateurs (modèle ERP) sur la liste des fuites ; liste en tableau sur bureau | `web/src/app/globals.css`, `web/src/app/(app)/layout.tsx`, `web/src/lib/ui/` ; `web/README.md` § Style | PR #19 fusionnée ; **remplacée le 2026-10-06** par l'interface « Studio Admin » (ligne suivante du lot T) ; APK : style du lot H (PR #24), remplacé le 2026-10-07 par l'interface « Studio Admin » (PR #43) |
| **Lot C : paramètres à l'écran** : page `/marches` (admin : liste, activer / désactiver, créer vide ou par copie des paramètres d'un marché), Paramètres > Secteurs (zones et secteurs), Natures de réfection, Catalogue des pièces (recherche), règles de proposition des articles du bordereau (famille, matériaux, diamètres, sans nouvelle version) ; marché désactivé masqué aux agents | migration `20261005100000_copie_marche.sql` (`copier_marche`) ; `web/src/app/(app)/marches/`, `web/src/app/(app)/parametres/Onglet{Secteurs,Natures,Catalogue}.tsx` ; 36 tests pgTAP (`06_copie_marche_parametres`) | PR #14 fusionnée, migration **déployée** le 2026-10-04 à 23 h 40 UTC ; tests pgTAP, tsc et parcours Playwright sur pile Supabase locale verts |
| **Lot F : logos** du titulaire et du maître d'ouvrage (Paramètres > Marché ; PNG ou JPEG, 2 Mo, réduits à 600 px), repris dans les en-têtes PDF (exports, lots, rapport par fuite, carte), Word et Excel | migration `20261005120000_logos_marche.sql` (compartiment privé `logos`) ; `web/src/lib/logos.ts`, `web/src/lib/export/` ; 37 tests pgTAP (`07_logos`), `web/scripts/essai-logos.mjs` | PR [#22](https://github.com/stepag-app/suivi-fuites/pull/22) **fusionnée** le 2026-10-05 (267 tests pgTAP) ; migration **déployée** le 2026-10-05 à 16 h 51 UTC ; écran non essayé connecté : **à essayer** (envoi des logos, en-têtes) |
| **Lot G : impression de la carte** (« Imprimer la carte ») : PDF A4 / A3, portrait / paysage, en-tête du marché, filtres, carte à 200 dpi, légende, échelle, nord, coordonnées WGS84, © OSM, liste des fuites en option ; gabarit générique réglable (`GABARIT`) | `web/src/lib/export/carte-pdf.ts`, `web/src/app/(app)/carte/{capture,couches,impression}.ts`, `web/scripts/verifier-carte-pdf.mjs` | PR [#25](https://github.com/stepag-app/suivi-fuites/pull/25) **fusionnée** le 2026-10-05 ; essais Chromium sur le vrai fond (page d'essai) ; **à essayer sur l'aperçu Vercel** (DEMO) ; gabarit à confirmer avec la SRM (point ouvert 12) |
| **Lot H, tablette** : style Fiori de l'APK (**remplacé le 2026-10-07** par l'interface « Studio Admin », PR #43), photos seules depuis la fiche (fuite, avant / pendant / après, réfection ; droit « photos / créer »), modification d'une réparation envoyée (droit et portée, hors ligne, changements seulement, après la création) | `mobile/src/` (`ui.tsx`, `fiche.tsx`, `saisie.tsx`, `modification.ts`, `file-attente.ts`), `mobile/essais/file-attente-hors-pile.test.mjs` | PR [#24](https://github.com/stepag-app/suivi-fuites/pull/24) **fusionnée** le 2026-10-05 (APK compilé, artefact de la PR) ; 28 vérifications sans pile ; rendu vu sur aucune tablette : **à essayer sur la tablette** ; le chef ne peut pas retirer une pièce déjà envoyée (droit « supprimer » = non) |
| **Lot I : tableau de bord v1** (`/tableau-de-bord`) : période, indicateurs de la période et à ce jour, statuts, 12 semaines, secteurs / zones, attachements (selon les droits) ; chiffres cliquables vers `/fuites` : lot L | `web/src/app/(app)/tableau-de-bord/`, `web/src/lib/ui/tableau-de-bord.ts`, `web/scripts/verifier-tableau-de-bord.mjs` | PR [#23](https://github.com/stepag-app/suivi-fuites/pull/23) **fusionnée** le 2026-10-05 ; 15 vérifications de calcul ; **à essayer sur l'aperçu Vercel** (DEMO, admin puis agent de détection) |
| **Lot J : marché désactivé en lecture seule** (écritures refusées en base sauf administrateur, lecture conservée) | migration `20261005120100_marche_inactif.sql` ; 9 tests pgTAP (`08_marche_inactif`) | PR [#21](https://github.com/stepag-app/suivi-fuites/pull/21) **fusionnée** le 2026-10-05, migration **déployée** à 16 h 51 UTC (après celle du lot F) |
| Intégration des PR web #21, #22, #23, #25 : fusion ensemble sans conflit sur `main`, tsc, build et les 3 scripts de vérification verts ; la carte imprimée reçoit les logos du lot F | — | vérifié le 2026-10-05 |
| **Lot K : test de restauration de la sauvegarde** : chaque lundi 04:07 UTC et à la demande ; dernière sauvegarde réussie de `main`, déchiffrée, restaurée dans une base Supabase vierge de la CI (`supabase start`, jamais la production), lignes comparées table par table, alerte si la sauvegarde a plus de 48 h | `.github/workflows/test-restauration.yml` ; `supabase/README.md` § Sauvegarde et restauration | PR [#27](https://github.com/stepag-app/suivi-fuites/pull/27) **fusionnée** le 2026-10-05, CI verte (65 tables, 91 comparaisons égales) ; **3 défauts de l'export** relevés, voir § 2 |
| **Lot L : filtres de la liste dans l'adresse** (`?statut=…&secteur=…&du=…&au=…&alertes=1&texte=…`, filtre de période ajouté, « Effacer les filtres ») et chiffres du tableau de bord cliquables vers la liste filtrée à l'identique | `web/src/app/(app)/fuites/{filtres.ts,useFiltresAdresse.ts}`, `web/src/app/(app)/tableau-de-bord/` ; `web/scripts/verifier-filtres-fuites.mjs` (15 vérifications) | PR [#28](https://github.com/stepag-app/suivi-fuites/pull/28) **fusionnée** le 2026-10-05, CI verte ; essai navigateur avec données fictives (26 liens = chiffres) ; **à essayer sur l'aperçu Vercel** |
| **Lot M : fiche déjà vue consultable sans réseau** (copie IndexedDB, photos 1 024 px par identifiant, 50 fiches / 400 photos, effacées à la déconnexion, lecture seule hors ligne ; page « coquille » du service worker pour `/fuites/<uuid>`) | `web/src/app/(app)/fuites/[id]/` (page découpée : `donnees.ts`, `copie.ts`, `fiche-hors-ligne.ts`, `formulaires.tsx`), `web/src/lib/hors-ligne.ts`, `web/public/sw.js` ; `web/scripts/verifier-fiche-hors-ligne.mjs` (20 vérifications) | PR [#29](https://github.com/stepag-app/suivi-fuites/pull/29) **fusionnée** le 2026-10-05 ; tsc et build verts en local ; CI GitHub bloquée par un incident Actions le 2026-10-05 (relancée) ; **service worker et photos hors ligne non vérifiés dans un navigateur : à essayer en mode avion** |
| Intégration des PR #27, #28, #29 : fusion ensemble sans conflit, tsc, build et les 3 scripts web verts (15 + 20 + 15) | — | vérifié le 2026-10-05 |
| **Correctif droits « auteur inconnu »** : `private.peut` renvoyait `null` (et non `false`) quand une saisie n'avait ni auteur terrain ni `saisi_par` (données importées, de démonstration ou générées) : un agent « les siennes » pouvait la modifier ; `coalesce(…, false)` | migration `20261006110000_droits_auteur_inconnu.sql` ; 9 tests pgTAP (`12`) | PR fix, 2026-10-06 |
| **Lot Q : matrice des droits et verrous de l'administrateur** : Utilisateurs > Droits, utilisateurs en colonnes et droits en lignes (une ligne = une colonne de `droits`), modèles par colonne, enregistrement journalisé ; l'admin a tout (colonne grisée) et peut se poser des **verrous** refusés par la base (arrêter / rouvrir un lot, refacturation forcée, supprimer une fuite, désactiver / copier un marché, révoquer un compte, et toute ligne de la matrice), sans refermeture automatique ; révocation : la base d'abord, puis la fonction serveur | migration `20261006100000_droits_verrous.sql` ; `web/src/app/(app)/utilisateurs/` ; 68 tests pgTAP (`09`) ; `web/scripts/verifier-matrice-droits.mjs` | PR [#31](https://github.com/stepag-app/suivi-fuites/pull/31) **fusionnée** le 2026-10-06, migration **déployée** ; à fusionner avec le panneau web (le circuit de révocation change) ; APK : boutons sans connaissance des verrous (la base refuse) |
| **Lot R : contrôles et corrections à l'attachement** : les pièces du réparateur font foi (« terrain », sans délai) ; corrections du bureau selon leur nature, avec **motif obligatoire** : **remplacement** d'une pièce erronée, **oubli**, **retrait** d'une pièce non posée (saisie d'origine gardée, barrée) ; vue **`v_pieces_reelles`** (inventaire réel) ; requalification et ajout de lignes de prix avec motif (article d'origine gardé, jamais reproposé), une unité par prix et par fuite y compris en manuel ; **seuil du PE réglable par marché** (2 m par défaut) ; 10 contrôles ; page **Travaux hors bordereau à faire valoir** | migration `20261006100100_controles_attachement.sql` ; `web/src/app/(app)/attachements/` (`controles.ts`, `hors-bordereau/`, `[id]/CorrectionsFuite.tsx`, `[id]/PiecesFuite.tsx`) ; Paramètres > Marché ; 110 tests pgTAP (`10`) | PR [#32](https://github.com/stepag-app/suivi-fuites/pull/32) **fusionnée** le 2026-10-06, migration **déployée** ; écrans non vus connectés : **à essayer sur l'aperçu** (DEMO : fuites N° 9, 10, 18) ; APK : pièces remplacées ou retirées encore affichées comme normales (lot APK à prévoir) |
| **Lot P1 : nomenclature Dolibarr** : `produits_dolibarr` (sans prix), import de `produits.csv` dans le navigateur (familles RAC, CND, ROB, AEP, VRI par défaut), rapprochement des pièces du catalogue par l'**identifiant produit** (référence en option ; diamètres et filetages identiques obligatoires), écran de validation, ajout de produits ; **le réparateur ne voit que la désignation** (APK inchangée) | migration `20261006100200_nomenclature_dolibarr.sql` ; Paramètres > Nomenclature Dolibarr ; `web/src/lib/nomenclature/` ; 43 tests pgTAP (`11`) | PR [#33](https://github.com/stepag-app/suivi-fuites/pull/33) **fusionnée** le 2026-10-06, migration **déployée** ; sur l'export du 2026-10-05 : 113 sûres, 58 probables, 90 sans correspondance ; **après fusion : importer `produits.csv` et rapprocher** |
| **Lot T : articles Dolibarr, référentiel unique des pièces** (décisions d'Issam du 2026-10-06) : les produits Dolibarr importés sont **les** pièces, communs à tous les marchés ; activation **globale** par l'**administrateur ou un responsable** (droit « paramètres / modifier » ; nouveaux produits désactivés) ; import de `produits.csv` par l'administrateur ; pièce posée = `produit_id` (article activé exigé à la saisie, ligne ancienne gardée) ; **plus de pièce libre** (article absent : demande interne au gestionnaire de Dolibarr, qui le crée, puis réimport et activation ; le réparateur le note en observation) ; unité de Dolibarr ; article suggéré par **règles du marché** (produit, sinon famille) ; catalogue par marché et rapprochement **supprimés** ; produits rapprochés pré-activés, articles suggérés repris en règles ; pièces posées **purgées** (rien en production) ; Paramètres > Articles (import, activation en masse), Paramètres > Bordereau (règles) ; APK : liste des articles activés | contrat `docs/lots/lot-articles-dolibarr.md` ; migration `20261006140000_articles_dolibarr.sql` ; 48 tests pgTAP (`11`, remplace P1) | PR [#39](https://github.com/stepag-app/suivi-fuites/pull/39), **fusionnée et déployée** le 2026-10-06 |
| **Interface « Studio Admin » (shadcn/ui)** (maquette validée par Issam le 2026-10-06) : coque à barre latérale repliable selon les droits, recherche ⌘J, sélecteur de marché, mode sombre ; tableau de bord, liste (tableau, colonnes, Kanban), fiche à onglets, carte (liste + carte), attachements, lot, utilisateurs, marchés, nouvelles pages Alertes et À faire ; reprise des lots Q, R, S, T : onglet Droits, verrous, contrôles avant attachement, pièces barrées, Paramètres > Réseau et Articles, carte avec réseau et **mode balayage plein écran** (menu replié automatiquement) ; écrans anciens habillés par `ancien.css` (jetons rapportés aux jetons shadcn) ; fiche d'un autre marché : le marché ouvert suit la fuite | `web/src/app/(app)/_coque/`, `web/src/components/`, `web/src/styles/ancien.css` ; `web/MAQUETTE-SHADCN.md`, `web/README.md` § Style | PR #39 (remplace les brouillons #37 et #38) |
| Vérification de l'intégration (PR #39) : **626 tests pgTAP** (PostgreSQL 17), tsc, build, 8 scripts web, APK (tsc, 28 vérifications) ; navigateur en mode démonstration (1366 et 800 px) ; **essai local de bout en bout** sur une copie de la base d'essai du lot S (vrai réseau, 44 044 tronçons) avec la migration du lot T : import du vrai `produits.csv` (858 articles des familles RAC, CND, ROB, AEP, VRI, tous désactivés à l'arrivée), activation en masse (39 colliers PEC), réparation enregistrée avec une pièce (`produit_id`), pièce absente refusée avec message, réseau affiché par zone sur la carte | `data-private/essai-web/` (hors dépôt) | fait le 2026-10-06 |
| **Lot N : photos sur Cloudflare R2** : fonction serveur `photos-r2` (URL signées S3, droits du compte via `marches_photos` et RLS de `photos`, secrets côté serveur seulement), dépôt direct dans le compartiment privé depuis le panneau et la tablette, lecture des deux stockages, **repli automatique** sur Supabase Storage tant que R2 n'est pas configuré ; workflow : secrets GitHub → secrets de la fonction, déploiement de `photos-r2` ; script d'essai des clés pour Issam | migration `20261007130000_photos_r2.sql` ; `supabase/functions/photos-r2/` ; `web/src/lib/photo.ts`, `mobile/src/photos.ts` ; 10 tests pgTAP (`16`), 636 au total ; `web/scripts/essai-r2.mjs` | PR lot N ; **non essayé contre un vrai compartiment** (clés à créer par Issam) |
| Intégration des PR #31, #32, #33 : fusion sans conflit de fichiers ; `copier_marche` redéfinie par Q et P1, réconciliée par la migration `20261006100300` (verrou, liens Dolibarr, seuil du PE copié) ; boutons de l'admin (rouvrir, refacturation forcée, désactiver, copier) grisés « verrouillé par vous » ; rapport PDF par fuite sans les pièces remplacées ou retirées ; libellé neutre au tableau de bord ; **497 tests pgTAP**, tsc, build et 7 scripts verts | PR [#35](https://github.com/stepag-app/suivi-fuites/pull/35) | **fusionnée** le 2026-10-06, migration `20261006100300` **déployée** |
| **Interface « Studio Admin » de l'APK** (maquettes validées par Issam le 2026-10-07 : **liste A** en tableau comme le panneau, avec onglets par statut et compteurs et recherche (N°, référence, adresse) ; **fiche B** sur une seule page avec l'en-tête « Profile » du panneau) : jetons du panneau, police Geist embarquée, icônes Lucide, badges de statut et d'alerte, boutons noir / contour, connexion en deux volets, marges des barres système (Android 15) ; parcours et logique inchangés ; statut « Réparée, réfection à faire » comme le panneau. **Balayage** : adresse par défaut `https://fuites.stepag.ma` ; sonde du panneau en GET (le HEAD répondait en ~11 s sur la tablette, au-delà des 8 s du délai : la carte ne s'ouvrait jamais), délai 15 s | `mobile/src/ui.tsx`, `mobile/src/icones.tsx`, écrans de `mobile/src/` ; `mobile/README.md` § Style ; maquettes et captures avant / après hors dépôt (dossier de notes de la session) | PR [#43](https://github.com/stepag-app/suivi-fuites/pull/43) ; tsc, bundle, 28 vérifications sans pile ; **vérifié sur l'émulateur** (tablette, paysage et portrait, compte réel) avec l'APK de la CI : liste, onglets, recherche, fiche, saisies (sans enregistrer), envois en attente, connexion, Balayage ouvert sur fuites.stepag.ma ; **à essayer sur la tablette Samsung** |
| **Langues de l'APK** (demande d'Issam du 2026-10-07, agents de détection et de réparation seulement ; panneau web en français) : trois modes choisis par tablette avec le bouton « FR / ع + FR / ع » en haut de chaque écran (et de la connexion), mémorisés sur la tablette : **français** (inchangé), **hybride** (arabe, termes techniques fréquents gardés en français selon le glossaire validé par Issam), **arabe classique** ; texte arabe aligné à droite (marque RLM), mise en page gardée de gauche à droite ; rapports, exports, désignations Dolibarr et listes paramétrées (natures, motifs, équipes) restent en français | `mobile/src/langue.tsx` (`t`, `tx`, `useLangue`), `mobile/src/traductions.ts` (271 libellés, clé = texte français, vérifiée par tsc) ; relecture : artefact « Dictionnaire arabe APK » (`docs/traduction/dictionnaire-ar.html`, réponses d'Issam sauvegardées dans `docs/traduction/revues-issam.json`) | tout relu par Issam : 274 entrées (273 OK, 1 correction), 49 libellés Studio Admin acceptés (Z01-Z49) ; **règle du 2026-10-07** : en hybride, une phrase arabe ne garde un mot français que pour « Réfection » (42 libellés passés en arabe complet ; « Polyethylene » gardé, version d'Issam ; titres « Fuites » en arabe ; les autres libellés entièrement français restent) ; tsc vert ; PR [#45](https://github.com/stepag-app/suivi-fuites/pull/45) **fusionnée** le 2026-10-07 ; **à essayer sur la tablette** |
| **APK : liste au repos sans CPU** : la synchro des 30 s prévenait les écrans même sans rien envoyer ; la liste se rechargeait donc toutes les 30 s (requête, rond de rafraîchissement, redessin) et une fiche ouverte aussi. Mesuré sur l'émulateur : 8,7 % d'un cœur en moyenne au repos, pics de RenderThread à 77 %, contre 1,9 % après (0 image en 131 s ; reste le rappel d'image de React Native). Écrans prévenus seulement si la file change ; liste mise à jour en silence toutes les 5 min, au retour sur l'appli et après un envoi ; requête de la liste abandonnée après 20 s | `mobile/src/file-attente.ts`, `mobile/src/ecrans.tsx` ; essai sans pile 32/32 | PR [#48](https://github.com/stepag-app/suivi-fuites/pull/48) **fusionnée** le 2026-10-07 |
| **Documents et connexion** : sous un logo, l'en-tête n'écrit plus la raison sociale ni le nom arabe (sans logo, le nom reste écrit), pour les PDF, Word et Excel ; **Excel réparé** : `write-excel-file` 4.1.1 écrit un `<definedNames/>` vide, la retouche des titres d'impression en ajoutait un second (« We found a problem with some content » sur tous les exports Excel depuis le 2026-10-04) ; CSV : retours chariot protégés ; **page de connexion** : logo STEPAG et panneau bleu `#39B3E4` | `web/src/lib/export/` (`modele.ts` : `lignesEntete`, `xlsx.ts`, `rapport-journalier.ts`, `generer.ts`), `web/src/app/connexion/page.tsx`, `web/public/logo-stepag.png` | PR [#49](https://github.com/stepag-app/suivi-fuites/pull/49) **fusionnée et en ligne** le 2026-10-07 |
| **Réseau, session 9** : plan recalé sur les rues OSM, import guidé, compteur de la carte, **codes de secteur courts** (`QODS-H`…, libellés en capitales), linéaire du contrat par zone (secteurs vides) | `outils/reseau/`, migration `20261007100000_codes_secteurs_courts.sql`, `web/src/lib/reseau/`, Paramètres > Réseau et Secteurs ; § 7 | PR [#50](https://github.com/stepag-app/suivi-fuites/pull/50) **fusionnée** le 2026-10-07, migration **déployée** (10 h 36 UTC) |
| Archivage : dossier du marché 4500004453 (documents, rapports, plans, **`Reseau aep oujda.dwg`**) et ancien dossier `Suivi-fuites-ancien` | `data-private/archives/` (ignoré par git, 359 Mo) | fait le 2026-10-05 |
| Export Dolibarr (lecture seule, sans prix) : produits, entrepôts, mouvements du chantier | `data-private/dolibarr/` (ignoré par git ; `RAPPORT.md`) | reçu le 2026-10-05 ; entrepôt du chantier **76**, projet **40**, sorties par **bons de transfert** depuis le dépôt 1 ; aucune consommation saisie |
| **APK allégée : ARM seulement** (2026-10-07) : bibliothèques natives compilées pour `armeabi-v7a` et `arm64-v8a` (tablettes Samsung et émulateur du Mac), plus pour x86 ni x86_64 ; APK de **79,0 à 42,6 Mo** (−46 %, artefact zippé de 34,6 à 21,9 Mo), plus rapide à télécharger et à installer en 4G ; compilation CI d'environ 20 à 13 min ; un émulateur x86_64 ne la lance que par traduction ARM | `mobile/app.json` (`buildArchs` d'`expo-build-properties`), `mobile/README.md` § Compilation | PR [#46](https://github.com/stepag-app/suivi-fuites/pull/46) **fusionnée** le 2026-10-07 ; CI verte ; **vérifiée sur l'émulateur** (mise à jour par-dessus l'APK de la #43, session gardée : démarrage, liste, fiche, photos) |
| **APK allégée : bibliothèques natives compressées** (2026-10-07) : `.so` rangés compressés dans l'APK (`useLegacyPackaging`), APK de **42,6 à 24,1 Mo** (−43 %, bibliothèques ARM de 29,1 à 10,8 Mo), 18,5 Mo de moins à faire passer sur la tablette en 4G ; en échange, Android extrait à l'installation les bibliothèques de l'architecture de l'appareil (17,2 Mo en `arm64-v8a`), mais l'APK qu'il garde maigrit d'autant : place prise inchangée (émulateur : APK et bibliothèques de 42,6 à 41,2 Mo, taille de l'appli dans les Réglages de 65,9 à 64,8 Mo) ; extraction de 0,2 à 2,9 s, installation et démarrage dans le bruit de l'émulateur | `mobile/app.json` (`useLegacyPackaging` d'`expo-build-properties`), `mobile/README.md` § Compilation | PR [#47](https://github.com/stepag-app/suivi-fuites/pull/47) **fusionnée** le 2026-10-07 ; CI verte ; **vérifiée sur l'émulateur** (mise à jour par-dessus la #46, session gardée : démarrage, liste, fiche, photos) |
| **APK : requêtes bornées** (2026-10-07) : le fetch de l'APK (`expo/fetch` dans Expo SDK 57, sur le client OkHttp de React Native) n'a aucun délai ; une requête restée sans réponse sur une connexion 4G morte figeait la file d'attente (une seule synchro à la fois : minuteur des 30 s, retour sur l'appli et « Envoyer maintenant » attendaient la même) jusqu'à l'expiration TCP (souvent un quart d'heure) ou un redémarrage. Chaque requête Supabase (API, connexion, photos) est maintenant abandonnée après **60 s**, **3 min** pour l'envoi d'une photo ; l'abandon compte comme une coupure (saisie gardée sans message, renvoyée au tour suivant) et n'est pas relancé par supabase-js ; la liste garde ses 20 s (PR #48). Limite probable, à voir sur la tablette : une connexion HTTP/2 morte reste dans le pool d'OkHttp après l'abandon, les requêtes suivantes peuvent s'y bloquer aussi (60 s chacune) jusqu'à ce qu'Android la ferme ; piste : délai de lecture natif d'OkHttp (fait : ligne suivante, PR #53) | `mobile/src/reseau.ts`, `mobile/src/supabase.ts` ; `mobile/README.md` § Hors ligne ; essai sans pile 42/42 (section 9, horloge simulée ; 6 mutations détectées) ; vrai supabase-js 2.117 contre un fetch muet (insertion, lecture sans relance, photo, renouvellement de session) | PR [#51](https://github.com/stepag-app/suivi-fuites/pull/51), **fusionnée** le 2026-10-07 ; tsc et bundle Android verts ; **non essayée sur l'émulateur ni la tablette** |
| **APK : mise à jour annoncée au démarrage** (2026-10-10) : quand une version plus récente est publiée (X2), une fenêtre « Mise à jour disponible » s'ouvre sur la liste (jamais au milieu d'une saisie) : « Installer maintenant » (téléchargement avec pourcentage, puis installateur d'Android) ou « Plus tard » (refermée jusqu'au prochain démarrage ; le bandeau de la liste reste). Libellés FR / arabe. **Réglage par tablette, une seule fois** : autoriser « Installer des applis inconnues » pour Suivi des fuites (Android le demande au premier « Installer ») | `mobile/src/mise-a-jour.tsx`, `mobile/App.tsx`, `mobile/src/traductions.ts` | branche `claude/maj-au-demarrage` ; tsc et essais sans pile verts ; fenêtre vue sur la tablette SM-X236B (appli DEV, version simulée) ; s'applique aux tablettes **à partir de la version suivante** : les APK déjà installées n'ont que le bandeau |
| **APK : connexion HTTP/2 morte écartée** (2026-10-07) : après un abandon par JavaScript (`reseau.ts` ; liste : 20 s), OkHttp n'y voyait qu'une annulation locale et gardait la connexion morte dans son pool, sans PING de contrôle (aucun délai natif) : les requêtes suivantes s'y bloquaient à leur tour jusqu'à ce qu'Android ferme le socket. Plugin de configuration Expo : délais d'**inactivité** du client OkHttp de l'APK (fetch, images) : connexion 10 s, lecture et écriture **15 s**, 60 s pour un corps de plus de 16 Ko (photos) ; dépassé, un délai envoie un PING, et sans réponse en 1 s OkHttp écarte la connexion. Délais plus courts que ceux de JavaScript pour tomber avant eux (à 60 s chacun, l'abandon JavaScript gagne toujours la course) ; pas de PING régulier (batterie) | `mobile/plugins/okhttp-delais.js` (déclaré dans `mobile/app.json`, posé par `expo prebuild` dans `MainApplication.kt`, non versionné) ; `mobile/README.md` § Hors ligne | PR [#53](https://github.com/stepag-app/suivi-fuites/pull/53) (après la #51) ; tsc, essai sans pile 42/42, CI verte (fabrique vue dans le code compilé de l'APK, OkHttp 4.9.2) ; essai sur la JVM avec OkHttp 4.9.2 et le bloc Kotlin généré, vraie connexion HTTP/2 vers Supabase à travers un proxy « trou noir » : avant, la connexion morte resservait après chaque abandon ; après, délai à 15,0 s puis connexion neuve dès la requête suivante (60,0 s pour un envoi de 300 Ko) ; **non essayée sur l’émulateur** ni sur la tablette : essai tenté par un proxy de l'émulateur (qui contourne sa panne DNS), mais Supabase a refusé le jeton gardé, d'où plus de session ; APK et réglages de l'émulateur remis comme avant  ; **fusionnée** le 2026-10-07 |

## 2. En attente d'Issam (état au 2026-10-09)

**Facturation GitHub (urgent).** GitHub Actions a été bloqué le 2026-10-08 (« recent account payments have failed or your
spending limit needs to be increased ») : quota gratuit de minutes épuisé, aucune carte enregistrée, limite de dépense à 0 $, environ
12 $ de minutes brutes consommées en octobre. Pour que la CI tourne gratuitement, le dépôt est resté **public** pendant la fin du
chantier (aucun secret ni donnée sensible n'y figure) ; il doit être repassé en **privé** à la fin de S8 (par la session parente). Une fois
privé, la CI consomme de nouveau le quota : **enregistrer une carte et fixer une limite de dépense** dans GitHub (Settings > Billing),
faute de quoi les compilations d'APK et le déploiement automatique de la base s'arrêtent de nouveau.

**Secrets et réglages à créer**
- `GOOGLE_SERVICES_JSON` (fichier Firebase de l'APK) et `FIREBASE_SERVICE_ACCOUNT` (fonction `envoyer-push`) : **absents**, donc APK sans
  notifications push et fonction « non configurée ». Le reste marche (cloche du panneau, notifications en base). Pas-à-pas Firebase : PR #67.
- `NEXT_PUBLIC_ESRI_CLE` sur Vercel (compte Esri, clé restreinte à `fuites.stepag.ma`) : sans elle, pas de bouton Satellite (C5).
- **Tuiles du réseau (X5)**. Jusqu'au 2026-10-10, le bloc Paramètres > Réseau > « Tuiles du réseau » affichait « Stockage injoignable
  (HTTP 403) » et le bouton restait grisé. Cause : l'action `lire` de la fonction `reseau-tuiles` envoyait à R2 une URL déjà présignée
  (signature dans la requête) que `client.fetch` d'aws4fetch signait une seconde fois (en-tête `Authorization`, en HEAD) ; R2 refuse une
  requête signée deux fois. Corrigé par la PR `fix(tuiles)` du 2026-10-10 : la vérification de présence n'utilise plus que la signature
  par en-tête, comme `version-apk` ; la fonction est redéployée par « Déploiement de la base » à la fusion (PR #85, fusionnée et
  déployée le 2026-10-10 : le bloc affiche bien « Aucune archive »). Le premier clic sur « Générer les tuiles » a ensuite échoué sur
  « canceling statement due to statement timeout » : le réseau entier lu en une requête (15 Mo de JSON) dépasse le délai maximal
  de l'API en production. `chargerReseauComplet` et `chargerNoeudsComplet` (tuiles et carte de zonage) lisent désormais par paquets
  de 8 secteurs, puis les non zonés, 4 requêtes à la fois (PR #88, fusionnée le 2026-10-10). Le délai restait dépassé en
  production (02:11) : les 8 862 tronçons non zonés formaient encore un seul bloc. Migration `20261013400000_reseau_lecture_paginee`
  (PR `fix(reseau)` lecture paginée) : `reseau_geojson_page` / `noeuds_geojson_page` lisent tout le réseau par pages bornées
  (2 000 tronçons, 3 000 nœuds) ; en local sur Oujda, 23 pages de 50 ms au lieu d'un bloc de 1 060 ms. Le bloc affiche
  l'avancement et, en cas d'échec, la lecture et la page fautives. Repli sur les paquets de secteurs si la base n'a pas encore les
  fonctions. Ensuite, dans l'ordre :
  1. Règle CORS du compartiment R2 `suivi-fuites-photos` : en-tête `Range`, méthode `HEAD`, origine `https://fuites.stepag.ma`
     (texte complet dans `web/README.md` § Tuiles ; il remplace la règle des photos, qui y est comprise).
  2. **Paramètres > Réseau > Générer les tuiles** : l'état doit passer à « À jour » (date, tronçons, nœuds, taille).
- Facultatif : règle de cycle de vie Cloudflare (préfixe `sauvegardes/base/`, 30 jours). Le miroir des photos est fait par la copie sur le Drive (X9, § 11).
- Vérifier dans le SQL Editor que la tâche `pg_cron` `alertes-reparation` existe (`select jobname, schedule from cron.job;`) ; sinon activer
  l'extension (Database > Extensions) puis `select cron.schedule('alertes-reparation', '*/15 * * * *', 'select public.generer_alertes_reparation()');`
  (la CI n'affiche pas les NOTICE ; à vérifier aussi pour `pg_net`, déclencheur du push).

**Keystore de production (créé le 2026-10-07)** : PKCS12, alias `stepag`, valable jusqu'en 2056, **hors dépôt** dans
`~/Documents/STEPAG-KEYSTORE/` ; secrets GitHub `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` ; `apk.yml` signe et vérifie le
certificat. **Sans ce fichier, plus de mise à jour de l'APK possible** : faire la copie sur clé USB. Les APK signées avec la clé de test d'Expo
(émulateur) sont incompatibles : désinstaller avant d'installer.

**Tâches manuelles**
1. Double authentification : GitHub, Google (`stepag.app@gmail.com`), 2ᵉ application pour Supabase, Cloudflare.
2. **Vercel Pro** (environ 20 USD/mois) avant toute mise en production pour le client.
3. **Désactiver le marché DEMO** avant la production (Paramètres > Marchés).
4. **Informer les agents du suivi GPS** avant son usage (réponse Q14 : pas de déclaration CNDP) ; exclure l'appli de l'optimisation de batterie Samsung sur chaque tablette.
5. **Essai sur une vraie tablette Samsung** : installer l'APK de `main` (artefact `suivi-fuites-apk`, signée STEPAG), parcours complet, mode avion, trois langues, suivi GPS.
6. **Relire l'arabe** : les listes paramétrées (natures dont carrelage, REVSOL, faïence, pavé ciment ; motifs ; ouvrages) et les 121 libellés ajoutés par S7 (artefact de relecture).
7. Importer `produits.csv` et activer les articles utiles (Paramètres > Articles), relire le zonage, importer le réseau en production (§ 7) si ce n'est pas fait.
8. ~~Essai de restauration de la sauvegarde~~ : fait en CI (le test de restauration restaure l'archive du **Drive** dans une base vierge, lundi 04:07 UTC et à la demande). Facultatif : jouer une fois la « Reprise après sinistre » de `supabase/README.md` sur un vrai projet Supabase neuf, de préférence avant la purge de DEMO.
9. Dolibarr : bons 6804 et 6814 rattachés au projet 30, bon 6796 en brouillon, pose non saisie (voir § 3) ; à décider avec le magasinier.

**Comportement à connaître.** Les champs obligatoires d'une nouvelle fuite (tournée, secteur, ouvrage, visibilité, nature de dégradation) sont
**rétablis en base** pour SRM et DEMO par la migration `20261011900000` (S8) : une tablette qui n'a pas la nouvelle APK ne peut plus créer de fuite
SRM / DEMO tant qu'elle n'est pas mise à jour.

**Hors de cette liste, reporté.** X8 : envoi automatique Dolibarr → Supabase (tâche planifiée côté Dolibarr qui pousse vers une fonction Supabase protégée ;
`importer_mouvements_dolibarr` est prête en `service_role`). V4 « photo obligatoire » réglable par marché et par étape (pas de colonne en base).
Mesures de débit et pénalités de performance (§ 4).

## 3. Décisions prises (à respecter)

- **Pièces et facturation** (2026-10-05) : toutes les fournitures sont comprises dans les prix unitaires de
  réparation (CPS art. II-15) : pas d'étiquette « facturable / non facturable ». La liste des pièces posables est la
  **liste des produits Dolibarr importés**, commune à tous les marchés (lot T, 2026-10-06 : plus de catalogue par marché
  ni de rapprochement ; réimport à chaque nouveau produit, activation globale de ceux qui s'affichent) ; le réparateur ne voit
  **jamais de code**, seulement la désignation. **Le réparateur fait foi** pour ce qu'il a posé (fiche et inventaire).
  À l'attachement, le responsable et l'admin corrigent les pièces selon leur **intention** (remplacement d'une pièce
  erronée, oubli, retrait d'une pièce non posée ; l'inventaire reflète le réel, la saisie d'origine reste visible),
  ajoutent des lignes et requalifient une ligne de prix, **motif obligatoire** ; pas de délai : la pièce saisie par
  l'auteur de la réparation est « terrain ». Une réparation = une unité par prix (deux joints sur un
  même élément = un seul prix 11 à 13) ; aucune facturation artificielle ; cumul légitime de prix différents
  (6 ou 9 + 7 ou 8 + terrassement + réfection) quand les travaux ont eu lieu ; deux ruptures distinctes = deux fuites liées.
- **Polyéthylène au-delà du seuil** (2 m par défaut, **réglable par marché**) : pas de prix au bordereau ; l'excédent est listé dans
  « Travaux hors bordereau à faire valoir », pour demander un prix nouveau à la SRM ; rien n'est facturé automatiquement.
- **Droits** : réglés par utilisateur dans la matrice (Utilisateurs > Droits) ; l'admin a tout et se pose lui-même des
  verrous de sécurité, **sans refermeture automatique**.
- **Dolibarr** : lecture seule, **jamais de prix ni de PMP**, seulement des quantités. L'API REST n'accepte que le réseau
  local (`API_RESTRICT_ON_IP`) : ne pas l'ouvrir sur Internet ; import par fichier CSV d'abord, puis envoi automatique
  depuis le serveur vers une fonction Supabase protégée (lot P4). Rapprochement posé / transféré : Dolibarr connaît
  l'envoi au chantier (entrepôt 76), pas la pose ; l'écart = reste théorique au chantier, à contrôler physiquement.

- **Lots en parallèle** (2026-10-05) : lots indépendants menés en même temps dans des copies isolées (worktrees), avec
  des périmètres de fichiers disjoints ; docs, README et `globals.css` réservés à la session principale, qui reporte la
  documentation de chaque lot ; une PR en brouillon par lot. Attention au quota du compte Max (partagé avec la paie).

- **Façon de travailler** (2026-10-05) : travail courant **en local** sur le MacBook avec Claude Code
  (`docs/travail-local.md`) ; solde cloud (≈ 60 $, expire le 5 novembre) gardé pour les gros lots autonomes.

- **Interface** (2026-10-06, remplace le style SAP Fiori du 2026-10-05) : interface **« Studio Admin »** (modèle
  next-shadcn-admin-dashboard, shadcn/ui, Tailwind v4), validée par Issam sur la maquette ; les écrans anciens se
  convertissent progressivement (habillage `ancien.css` en attendant).
- **Interface de l'APK** (2026-10-07) : même style que le panneau (« Studio Admin ») ; liste en tableau avec onglets par
  statut et recherche (maquette A), fiche sur une seule page (maquette B) ; plus de style Fiori nulle part.
- **Articles** (2026-10-06) : plus de rapprochement ni de pièce libre ; la liste est celle des produits Dolibarr importés ;
  l'administrateur ou le responsable **active** les articles ; un article absent = demande interne au gestionnaire de
  Dolibarr, création, export, réimport (un article parti au chantier par bon de transfert existe forcément dans Dolibarr).

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
- Supabase gratuit pour l'instant ; aucune sauvegarde automatique Supabase → backup maison (workflow `sauvegarde-base.yml`) avec copies hors plateformes : R2 et Drive de `stepag.app` (base, photos, APK, fichiers Storage), voir § 11.
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
- **Linéaire du contrat** (2026-10-07) : 1 466 km vérifiés (CPS tableau n° 1, F056 p.19), donné **par zone seulement** (358, 362, 228, 399, 119 km). Aucun linéaire par secteur dans le marché : `secteurs.lineaire_m` reste vide (« — » dans Paramètres > Réseau) ; la comparaison plan / contrat se fait sur la ligne « Total zone » et le total du marché. À reprendre si la SRM fournit un linéaire par secteur.

## 4. Emplacement réservé : plan du réseau (DWG → DXF → tronçons)

**Statut : fait (session 7, lot S)** : converti, calé (Lambert Nord Maroc / Merchich confirmé), zoné ; voir § 7 et
`outils/reseau/README.md`. Le texte ci-dessous est l'ancien emplacement réservé, gardé pour l'historique.

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

**Depuis le 2026-10-10 : chantier v3**, plan de fin du projet en trois vagues de sessions parallèles (S12 à S24) :
`docs/lots/chantier-v3.md`. Il remplace la liste ci-dessous et le « reste à faire » du § 2 (décisions d'Issam au § 0 du plan).

**Après le chantier v2 (2026-10-09)**, par ordre : (1) régler la facturation GitHub et les secrets Firebase (§ 2) ; (2) installer l'APK de
`main` sur la tablette et dérouler le parcours terrain ; (3) corriger selon les retours ; (4) X8, l'envoi automatique Dolibarr ;
(5) mesures de débit et pénalités de performance ; (6) V4 « photo obligatoire » par marché et par étape si la SRM l'exige.
Le reste de ce paragraphe est l'historique des sessions 5 à 8 (plusieurs points sont faits, voir § 10).

**Fait en session 5** : lots F (logos), G (impression de la carte), H (tablette), I (tableau de bord),
J (marché désactivé en lecture seule) ; **fusionnés et déployés en session 6**.

**Fait en session 6** : lots K (test de restauration), L (filtres dans l'adresse, tableau de bord cliquable),
M (fiche déjà vue sans réseau), **fusionnés** (PR #27 à #30) ; puis lots Q (matrice des droits), R (contrôles à
l'attachement), P1 (nomenclature Dolibarr) en brouillon (PR #31 à #33) avec la branche d'intégration.

**Suite prévue (pièces et Dolibarr)**, à relancer sur le modèle du lot T (en ligne depuis la PR #39 ; numéros de
migration **après `20261006140000`**, les numéros `20261006120000` / `120100` pris par les copies arrêtées ne sont plus
utilisables) (copies de travail arrêtées : `.claude/worktrees/agent-a717…`
pour P3, `agent-a3be…` pour P4, à reprendre comme référence puis supprimer ; voir `docs/lots/lot-articles-dolibarr.md` § 7) :
P3 **inventaire des fournitures posées** (tableau croisé, filtres rapides : fuite,
période, secteur, équipe, famille, terrain / bureau ; widget au tableau de bord) ; P4 **rapprochement posé / transféré**
(mouvements de l'entrepôt 76 par CSV puis par envoi depuis le serveur ; période × article ; écart et seuil d'alerte) ;
saisie web des pièces par mots séparés ; distinction terrain / bureau dans le rapport PDF et l'APK. Points ouverts du lot L : « Non réparées > seuil » et
« En attente » non cliquables (il faudrait un filtre par type d'alerte et un filtre multi-statuts), pas de filtre
par zone, période du tableau de bord absente de son adresse. Lot M : pas encore de liste « Fiches disponibles hors ligne ».

**Application standard, ce qui manquait à l'écran** : fait par le lot C (marchés, secteurs, natures,
catalogue, règles de proposition). Reste : dessin des zones et secteurs (avec le plan du réseau), phases du
marché. (Marché désactivé en lecture seule : lot J.)

**Retouches visuelles des exports** : si la SRM impose un gabarit (cartouche, logos, mentions, visas),
passer une session **locale** sur le Mac avec aperçu navigateur ; tout le reste se règle dans les modèles.


1. Retours du premier test terrain (parcours connexion → fuite → réparation → réfection).
2. À ajouter dans le panneau selon les retours : paramètres (ouvriers, équipes, prix hors bordereau,
   motifs), carte des fuites, anomalies, journal, interface en arabe / mixte, exports PDF et Word.
3. Application Expo : socle, fiche, réparations / réfections et doublons faits (lot A). Lot H : photos depuis la fiche,
   modification d'une réparation. Interface « Studio Admin » du panneau (PR #43, 2026-10-07). À ajouter : suivi GPS en arrière-plan (tracé par agent et par jour, M4 ; **bloqué** par
   les questions heures de suivi / information des agents / CNDP), notifications (**bloqué** : push, e-mail ou les deux ?),
   mise à jour de l'APK, suppression d'une réparation, modification d'une réfection. Mode hors ligne web : consultation d'une fiche déjà vue
   (lot M) ; modification d'une fuite existante sans réseau non gérée.
4. Migration 2 dès réception du DXF : le balayage (prix 1 et 2) pourra alors s'attacher par tronçon ;
   en attendant, une **ligne libre** du lot d'attachement porte le linéaire balayé par secteur.
5. ~~Rapport PDF par fuite~~ (lot D, fait ; contenu à valider avec la SRM), ~~carte des fuites~~ (lot B, fait),
   état journalier au gabarit exact de la SRM (**bloqué** : modèle à fournir). ~~Impression PDF de la carte~~ (lot G) ;
   à suivre : gabarit SRM (point ouvert 12, à régler dans `GABARIT`), tracés GPS, balayage sur la carte (après le DXF).

## 6. Prompt pour démarrer une nouvelle session

```text
Lis CLAUDE.md, docs/etat-avancement.md (§ 2 et § 10), supabase/README.md, web/README.md et mobile/README.md.
Lis aussi docs/lots/chantier-v2.md et docs/lots/chantier-v2-audit-s8.md (ce qui est livré, partiel, reporté).
Contexte : le chantier v2 est entièrement fusionné dans main et déployé (PR #59 à #70, migrations jusqu'à 20261011900000).
Reste à Issam : facturation GitHub (dépôt privé), secrets Firebase, clé Esri, tuiles du réseau, essai sur tablette (§ 2).
Avant de commencer : gh pr list --state all --limit 20 et git worktree list (sessions parallèles), puis vérifie la CI de main.
Objectif de cette session : [à préciser : retours du test sur tablette, X8 envoi automatique Dolibarr, V4, ou autre].
Pour vérifier l'interface sans compte : NEXT_PUBLIC_MODE_DEMO=1 (jamais sur Vercel).
Travaille en français, sur une branche dédiée avec une PR ; ne touche pas au projet Supabase de production hors déploiement
automatique ; aucun secret dans le dépôt ni dans le chat ; ne touche pas au keystore.
Mets à jour docs/etat-avancement.md en fin de session.
```

## 7. Session 7 (2026-10-06) : plan du réseau DWG, zonage, balayage par tronçon (lot S)

Contrat : `docs/lots/lot-s-reseau.md`. Branche **`claude/lot-s-integration`** (S1 conversion, S2 base, S3 panneau web, S4 APK,
S5 rapport journalier), **fusionnée dans `main` par la PR [#39](https://github.com/stepag-app/suivi-fuites/pull/39)** le
2026-10-06 avec la nouvelle interface et le lot T ; migration `20261006130000` déployée. **Aucune donnée du réseau n'est
encore en production** : import par Paramètres > Réseau (administrateur), avec l'accord d'Issam.

| Élément | Où | État |
|---|---|---|
| **Système de coordonnées** du DWG : Lambert Nord Maroc / Merchich (EPSG:26191) **confirmé** ; vers WGS84 par la transformation EPSG standard ; conduites à 4 m médian de l'axe des rues OSM, décalage moyen ≈ 1 m (aucun recalage) | `outils/reseau/README.md` | vérifié sur 4 000 points et à l'œil (aperçu) |
| **Conversion** DWG → DXF (LibreDWG) → extraction en flux (blocs compris) → GeoJSON WGS84 : 44 044 tronçons, **1 541 km** dans le périmètre (CPS : 1 466 km), 30 820 nœuds (vannes, hydrants, ventouses…), diamètre connu sur 83 % du linéaire ; anciens exports 2012 / 2018 cachés dans le fichier et réseau projeté écartés | `outils/reseau/` ; sorties `data-private/reseau/` (hors dépôt) | fait |
| **Calage des 21 planches PDF** (rotation, échelle, position retrouvées ; 0,3 à 1 m) : 20 retenues (11 par superposition des conduites, 9 confirmées par les noms de secteur) ; Ghar el Baroud écartée (calage non confirmé) | `outils/reseau/caler_planches.py`, `corriger_planches.py` | fait |
| **Zonage initial** : les **34 secteurs du marché** identifiés (limites magenta STEPAG des planches + secteurs du SIG ; Pam, Tazaghine, Château Sidi Aissa, Maksam-Kharoub, Lt Belhoucine, Ballaoui-Irfane, Tennis 1 absents du SIG, retrouvés sur les planches) ; **1 312 km zonés**, 229 km « non zonés » à affecter par l'administrateur (surtout hors secteurs du SIG, et le secteur SIG « Saada ») | `outils/reseau/zoner.py`, `secteurs.json` | fait ; **à relire par Issam** |
| Linéaire par zone (km) : Z1 331 (CPS 358), Z2 299 (362), Z3 238 (228), Z4 326 (399), Z5 118 (119) ; l'écart des zones 2 et 4 est dans les 229 km non zonés | `data-private/reseau/rapport-conversion.md` | — |
| **Base (S2)** : migration `20261006130000_reseau_balayage.sql` (tronçons, nœuds, balayages, import, GeoJSON par secteur, état de balayage, zonage, contours, vues des linéaires et du journal) ; **621 tests pgTAP** (115 nouveaux) verts sur PostgreSQL 17 + PostGIS 3.6 ; import réel essayé en local (15 s), journée simulée (98 tronçons, 3,98 km, 96 nœuds) | `supabase/` ; `supabase/README.md` § Plan du réseau | à faire passer par la CI (PostgreSQL 16) |
| **Panneau web (S3)** : réseau activable par zone et secteur sur `/carte`, coloration secteur / balayage / diamètre, légende, mode balayage (toucher, lasso, prolonger, hors ligne), Paramètres > Réseau (import, carte de zonage modifiable), `/balayage`, `/session` | `web/` ; `web/README.md` § Réseau et balayage | tsc, build et 10 scripts verts ; **jamais essayé contre une vraie base** |
| **Rapport journalier de recherche de fuites (S5)** : PDF A4 au gabarit STEPAG 2026 avec extrait de plan A4, ou Excel ; par jour ou par équipe ; bouton dans `/balayage` | `web/src/lib/export/rapport-journalier.ts`, `web/src/app/(app)/balayage/rapport.ts` | 48 vérifications ; extrait de plan non essayé dans un navigateur |
| **APK (S4)** : écran Balayage (WebView du panneau, session de la tablette, mode balayage) | `mobile/src/balayage.tsx` | tsc et 28 vérifications ; à essayer sur la tablette |
| Matrice des droits : lignes Balayage (voir, cocher, annuler les siens, annuler ceux des autres) | `web/src/app/(app)/utilisateurs/matrice.ts` | vérifié |
| **Essai de bout en bout en local** : vrai réseau importé dans une base PostgreSQL 17 servie par PostgREST, panneau web de la branche : carte et coloration, carte de zonage (8 862 tronçons affectés d'un coup), balayage enregistré depuis la carte, journal, rapport PDF de 2 pages avec extrait de plan ; correctif « Enregistrer… » | `data-private/essai-web/` (hors dépôt) | fait le 2026-10-06 ; reste l'essai sur l'aperçu Vercel avec la vraie base |

**Session 9 (2026-10-07)** : décalage systématique constaté par Issam à fort zoom ; mesuré par fenêtres de 800 m
(`outils/reseau/recaler.py`) : translation de **5,7 m vers l'ouest et 6,6 m vers le nord** (transformation Merchich
annoncée à 7 m) ; corrections locales et affines essayées, écartées par validation croisée (fenêtres bruitées de ± 4 m) ;
vérifié à l'œil (centre, Lazaret, Oued Loukous) ; Sidi Yahya : plan et OSM divergent, non corrigeable. L'ancien contrôle
(`controler_calage.py`, « 1 à 2 m ») sous-estimait le décalage. Sorties recalées : `data-private/reseau/recale/` ;
dossier d'import : `data-private/IMPORT-RESEAU/` (`preparer_import.py`). **Codes de secteur courts** (migration `20261007100000`) :
`qods_haut_chu_mouhoub_iriss` → `QODS-H`, etc. (table dans la migration), libellés en capitales, formulaire Secteurs en
capitales ; `secteurs.json`, `zoner.py` et les fichiers de `data-private/reseau/` remappés : le dossier d'import porte les
**nouveaux** codes, à importer dans un marché **après** le déploiement de la migration (avant : codes inconnus, non zonés) ; **déployée le 2026-10-07** (PR #50) : l'import peut se faire.
Import déjà fait dans DEMO avec les anciens codes : sans effet (tronçons rattachés par `secteur_id`). Causes de « je ne vois rien » : aucun import
encore ; `apercu.html` ouvert en `file://` (fetch bloqué) ; `outils/reseau/secteurs.json` choisi au lieu du GeoJSON.

**À faire par Issam (lot S)** :
1. Relire le zonage : double-clic sur `data-private/IMPORT-RESEAU/APERCU-RESEAU.html` (plan recalé) ; dire si les
   noms et contours des 34 secteurs sont justes.
2. Importer le réseau (DEMO d'abord conseillé, puis SRM) : Paramètres > Réseau > Importer le GeoJSON,
   `1-contours-secteurs.geojson`, `2-troncons.geojson`, `3-noeuds.geojson` du même dossier ; puis affecter les
   229 km non zonés sur la carte de zonage. Mode d'emploi détaillé : note « Briefing Réseau et balayage ».
3. Essayer l'APK (artefact de la CI) : bouton Balayage, cocher quelques tronçons, rapport du jour.
4. Questions : le chef de réparation doit-il voir le journal des balayages ? (non pour l'instant) ; le linéaire
   payé par secteur doit-il venir du dessin (`v_lineaire_secteurs`) ou d'un relevé contradictoire ? ; la SRM
   accepte-t-elle le rapport journalier au gabarit STEPAG 2026 ?

**Notes techniques** : une autre session (lots P3, P4) a pris `20261006120000`, `20261006120100` et les tests 13-14 :
le lot S utilise `20261006130000` et le test 15 ; fusionner P3/P4 avant S (le déploiement refuse une migration plus
ancienne que la dernière appliquée). Le dessin contient aussi les **secteurs de relève** (269 polygones numérotés) :
piste pour localiser une fuite par le premier bloc de sa référence SRM (à confirmer avec la SRM).

## 8. Essai de charge à 3 000 fuites (2026-10-07)

Rapport : `docs/essai-charge-3000.md` ; outils : `outils/charge/` (base locale `charge_3000`, jamais la production).
PR [#44](https://github.com/stepag-app/suivi-fuites/pull/44) **fusionnée** le 2026-10-07 (après la #50, ordre des migrations respecté).

| Élément | Où | État |
|---|---|---|
| Générateur : 3 000 fuites sur 12 mois et sur les secteurs de DEMO, réparations, pièces, réfections, ~4 photos par fuite (lignes seules), un an de balayage (48 461) ; 8 comptes d'essai | `outils/charge/generer-charge.sql`, `preparer-base.sh` | fait |
| Mesures : SQL sous RLS, lectures de chaque page (avant / après), navigateur (profils bureau et tablette 4G), carte avec tout le réseau | `outils/charge/mesurer-*.{sql,mjs}`, `relais.mjs` | fait |
| Migration `20261007120000_essai_charge.sql` : `compter_fuites`, `resume_a_attacher`, `etat_balayage_compact` (SECURITY INVOKER) ; test 17 (22 tests) | `supabase/` | 648 tests pgTAP verts en local ; **déployée** le 2026-10-07 (10 h 39 UTC) |
| Panneau web : `lireTout` 3 pages à la fois et avertissement « Affichage incomplet » au plafond, colonnes réduites, alertes filtrées, comptes et reste à attacher par la base, état de balayage complet, horloge des alertes isolée, courbe des réfections corrigée | `web/` | tsc, build, 9 scripts verts ; vérifié en mode démonstration et sur 12 025 fuites |

**Résultats** (détail dans le rapport) : en profil tablette, liste 2,7 → 1,3 s, alertes 2,1 → 1,1 s, à faire 3,3 → 1,7 s,
tableau de bord 2,6 → 1,2 s. Carte avec tout le réseau : 64 s et 1,3 Go en profil tablette (inchangé, chantier
tuiles vectorielles). Base : 120 Mo après un an (500 Mo gratuits) ; photos 2,7 Go par an (1 Go gratuit).

**Ordre de fusion** : la branche `claude/reseau-simplification` a pris `20261007100000` ; la migration de l'essai est
`20261007120000` : fusionner `reseau-simplification` d'abord (le déploiement refuse une migration plus ancienne que la
dernière appliquée). Les deux branches touchent `web/src/lib/reseau/donnees.ts` à des endroits différents.

**À faire par Issam** : sur la production, ouvrir la liste des fuites avec l'onglet Réseau du navigateur pour
confirmer que l'API compresse (gzip ou br) ; suivre la page « Usage » de Supabase ; activer R2 avant le 4e mois de
photos.

## 9. Livraison des chantiers de la nuit (2026-10-07, fin de matinée)

Inventaire : sessions terminées la nuit, mais travail dispersé (deux correctifs non commités dans le checkout principal,
deux branches non poussées, une PR qui visait encore la branche de la #43 déjà fusionnée). Tout est maintenant dans `main`.

| PR | Contenu | Mise en ligne |
|---|---|---|
| [#49](https://github.com/stepag-app/suivi-fuites/pull/49) | logo à la place du nom dans les en-têtes, Excel réparé, CSV, logo STEPAG à la connexion | Vercel (production) |
| [#48](https://github.com/stepag-app/suivi-fuites/pull/48) | APK : liste au repos sans CPU | APK de `main` |
| [#46](https://github.com/stepag-app/suivi-fuites/pull/46), [#47](https://github.com/stepag-app/suivi-fuites/pull/47) | APK ARM seulement, bibliothèques compressées (79 → 24 Mo) | APK de `main` |
| [#50](https://github.com/stepag-app/suivi-fuites/pull/50) | réseau recalé, import guidé, codes de secteur courts, linéaire par zone | Vercel + migration `20261007100000` |
| [#44](https://github.com/stepag-app/suivi-fuites/pull/44) | essai de charge : comptes en base, état de balayage complet, colonnes réduites | Vercel + migration `20261007120000` |
| [#45](https://github.com/stepag-app/suivi-fuites/pull/45) | APK en trois langues (réorientée vers `main`) | APK de `main` (run 37609921370) |

Vérifié avant les fusions, sur une fusion d'essai de toutes les branches : **648 tests pgTAP** (PostgreSQL 17 + PostGIS),
`tsc` et `next build` du panneau, 11 scripts de vérification web, `tsc` de l'APK et 32/32 vérifications de la file
d'attente ; puis la CI de chaque PR. Seuls conflits : en-tête de ce fichier, et `charger` de la liste
(`mobile/src/ecrans.tsx`) entre les langues (#45, `t()`) et la liste au repos (#48, chargement discret) : les deux gardés.
Relecture arabe : les 323 réponses de l'artefact sont identiques à `docs/traduction/revues-issam.json`.

## 10. Chantier v2 (2026-10-08 et 2026-10-09) : circuit de validation, saisie terrain, notifications, comptes, cartes

Cadrage : `docs/lots/chantier-v2.md` (tâches R, V, F, P, A, N, L, C, X ; réponses d'Issam § 6). Audit de S8 :
`docs/lots/chantier-v2-audit-s8.md` (tableau fait / partiel / manquant, vérifications rejouées).

| Session | PR | Contenu |
|---|---|---|
| S0 | [#59](https://github.com/stepag-app/suivi-fuites/pull/59) | plan du chantier |
| S4 | [#60](https://github.com/stepag-app/suivi-fuites/pull/60) | X1 : export de sauvegarde corrigé, copie R2, fichiers Storage, restauration sans contournement |
| S1, S2 | [#62](https://github.com/stepag-app/suivi-fuites/pull/62), [#61](https://github.com/stepag-app/suivi-fuites/pull/61) | base : rôle Réfection, comptes, validation par étape, notifications ; référentiels terrain, rues OSM, suggestions, non réparée, anticipation |
| S9 | [#63](https://github.com/stepag-app/suivi-fuites/pull/63) | X3 : inventaire des fournitures posées, rapprochement Dolibarr |
| S3 | [#64](https://github.com/stepag-app/suivi-fuites/pull/64) | listes, tableau de bord, Droits, exports à rubriques |
| (#65) | [#65](https://github.com/stepag-app/suivi-fuites/pull/65) | champs obligatoires suspendus (provisoire, rétablis par S8) |
| S6, S5 | [#66](https://github.com/stepag-app/suivi-fuites/pull/66), [#68](https://github.com/stepag-app/suivi-fuites/pull/68) | comptes, cloche, anticipation ; À valider, fiche par étape, formulaires |
| S7 | [#67](https://github.com/stepag-app/suivi-fuites/pull/67) | APK : saisie séquentielle, validation, suggestions, push, mise à jour, 121 libellés arabes |
| S10 | [#69](https://github.com/stepag-app/suivi-fuites/pull/69) | réseau en tuiles vectorielles privées, balayage plein écran, satellite, mini-carte |
| S11 | [#70](https://github.com/stepag-app/suivi-fuites/pull/70) | X6 : suivi GPS en arrière-plan, un tracé par agent et par jour |
| S8 | (cette PR) | audit, scripts recalés, champs obligatoires rétablis (`20261011900000`), documentation |

**Vérifié par S8 (2026-10-09)** : 1 055 vérifications pgTAP (PostgreSQL 17), `tsc` et `build` du panneau, 16 scripts web, `tsc` et
4 essais sans pile de l'APK (180 vérifications), dictionnaire arabe complet, CI de `main` verte (y compris « Déploiement de la base »).
**Non rejoué** : le parcours sur l'émulateur (arrêté) ; l'APK de la CI de `main` (artefact `suivi-fuites-apk`, 22,7 Mo) reste à installer.

**Écarts relevés (même mineurs)** : (1) champs obligatoires de la fuite vides en production pour SRM et DEMO depuis la #65 → rétablis par S8 ;
(2) `verifier-matrice-droits.mjs` en échec sur `main` (hors CI) → recalé ; (3) V4 « photo obligatoire » sans réglage en base ; (4) R7 : les
corrections de champs restent visibles du terrain, seules les pièces du bureau sont masquées ; (5) push et satellite inactifs faute de
secrets / clé ; (6) ce fichier décrivait la PR #40 comme ouverte et les PR APK #56 à #58 comme à fusionner alors qu'elles sont fusionnées ;
(7) copies de travail P3 / P4 (`.claude/worktrees/agent-a717…`, `agent-a3be…`) toujours présentes : à supprimer par Issam.

## 11. Chantier v3, S14 : sauvegarde hors plateformes sur le Drive (X9, 2026-10-10)

PR [#86](https://github.com/stepag-app/suivi-fuites/pull/86) fusionnée (`a71c04f`), sans migration. Détail et procédure :
`supabase/README.md` (§ Copie hors plateformes, § Reprise après sinistre).

- **Ce qui tourne** : chaque nuit (02:17 UTC) et à la demande, le job `drive` de `sauvegarde-base.yml` copie par rclone (version et
  empreinte épinglées) dans le dossier `Suivi-fuites-sauvegarde` du Drive de `stepag.app@gmail.com` : `base/` (archives chiffrées,
  relues en SHA-256, rotation 30 quotidiennes et 12 mensuelles, 20 suppressions au plus par exécution), `r2/` (compartiment R2 hors
  `sauvegardes/` : photos, `apk/`, `reseau/`), `stockage-supabase/`. `rclone copy` seulement : rien n'est effacé côté Drive hors
  rotation. Échec visible : étape rouge, résumé de l'exécution, alerte sous 3 Go libres, e-mail GitHub.
- **Contrôle** : « Test de restauration » restaure l'archive prise sur le Drive (comparée à l'artefact GitHub), puis vérifie que
  chaque photo R2 non supprimée et chaque objet Storage que la base restaurée référence existe sur le Drive (taille comprise pour
  Storage) et relit un échantillon. Premier essai réel le 2026-10-10 : sauvegarde 38018099863 et test 38018472028 verts.
- **Accès Drive** : secret GitHub `SAUVEGARDE_DRIVE_CONFIG` (section `[drive]` de rclone, créé par Issam) ; client OAuth « rclone »
  (application de bureau) du projet Google Cloud `suivi-fuites-sauvegarde`, **publié en production** (sinon jeton expiré après
  7 jours), un seul code secret actif, étendue `drive`. Google exige pour cela trois liens publics : pages `/confidentialite` et
  `/conditions` du panneau (`web/src/app/`), texte à relire par Issam. Note pas à pas d'Issam : Claude Docs « Autoriser rclone sur le
  Drive ».
- **Si la copie échoue** : « Connexion au Drive » en échec = jeton révoqué ou expiré (refaire la note, recréer le secret) ; Drive
  presque plein = Google One 100 Go (15 Go gratuits partagés avec Gmail) ; les APK de R2 ne sont jamais supprimées du Drive.
- **Notifications d'échec** : réglées le 2026-10-10 sur le compte GitHub `stepag-app` (Settings > Notifications > Actions : on
  GitHub et e-mail, « failed workflows only ») ; un échec de la sauvegarde nocturne arrive de `notifications@github.com`.
- **Reste** : relire les deux pages publiques ; e-mail d'échec par M2 (S18) ; refaire les parties 2 et 3 de la note lors de la rotation des secrets (S23) ; surveiller les minutes d'Actions une fois le
  dépôt privé (Z4) : la sauvegarde nocturne, le job Drive et le test hebdomadaire en consomment ; S22 (purge de DEMO) peut s'appuyer
  sur cette copie.
