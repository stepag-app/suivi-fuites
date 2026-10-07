# État d'avancement et passation entre sessions

> À lire en début de chaque session, avec `CLAUDE.md` et `supabase/README.md`.
> Mettre à jour en fin de session (fait, en attente, décisions).

Dernière mise à jour : 2026-10-07 (**APK en trois langues** : français, hybride, arabe ; bouton en haut de chaque écran ;
PR empilée sur la #43, voir la ligne « Langues de l'APK » du § 1). Avant : 2026-10-07 (**APK au style « Studio Admin »** du panneau, Balayage sur `https://fuites.stepag.ma`,
PR [#43](https://github.com/stepag-app/suivi-fuites/pull/43), voir la ligne « Interface Studio Admin de l'APK » du § 1).
Précédente : 2026-10-06 (session 8 : **nouvelle interface « Studio Admin » (shadcn/ui) adoptée**, **lot S** (réseau,
balayage par tronçon, rapport journalier) et **lot T** (articles Dolibarr, ajusté : activation par l'admin ou le responsable,
plus de pièce libre) réunis dans la PR [#39](https://github.com/stepag-app/suivi-fuites/pull/39), fusionnée et déployée ;
reste à faire par Issam : importer `produits.csv` et activer les articles, puis importer le réseau ; voir § 2 et § 7).

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
| Panneau web + mode terrain (Next.js) | `web/` (voir `web/README.md`) | **en ligne** : https://fuites.stepag.ma depuis le 2026-10-07 (CNAME Cloudflare vers Vercel ; l'ancienne adresse https://suivi-fuites-web.vercel.app reste active ; Vercel, équipe STEPAG, plan Hobby) ; connexion, création de compte et saisie de fuite validées par Issam le 2026-10-04 |
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
| Intégration des PR #31, #32, #33 : fusion sans conflit de fichiers ; `copier_marche` redéfinie par Q et P1, réconciliée par la migration `20261006100300` (verrou, liens Dolibarr, seuil du PE copié) ; boutons de l'admin (rouvrir, refacturation forcée, désactiver, copier) grisés « verrouillé par vous » ; rapport PDF par fuite sans les pièces remplacées ou retirées ; libellé neutre au tableau de bord ; **497 tests pgTAP**, tsc, build et 7 scripts verts | PR [#35](https://github.com/stepag-app/suivi-fuites/pull/35) | **fusionnée** le 2026-10-06, migration `20261006100300` **déployée** |
| **Interface « Studio Admin » de l'APK** (maquettes validées par Issam le 2026-10-07 : **liste A** en tableau comme le panneau, avec onglets par statut et compteurs et recherche (N°, référence, adresse) ; **fiche B** sur une seule page avec l'en-tête « Profile » du panneau) : jetons du panneau, police Geist embarquée, icônes Lucide, badges de statut et d'alerte, boutons noir / contour, connexion en deux volets, marges des barres système (Android 15) ; parcours et logique inchangés ; statut « Réparée, réfection à faire » comme le panneau. **Balayage** : adresse par défaut `https://fuites.stepag.ma` ; sonde du panneau en GET (le HEAD répondait en ~11 s sur la tablette, au-delà des 8 s du délai : la carte ne s'ouvrait jamais), délai 15 s | `mobile/src/ui.tsx`, `mobile/src/icones.tsx`, écrans de `mobile/src/` ; `mobile/README.md` § Style ; maquettes et captures avant / après hors dépôt (dossier de notes de la session) | PR [#43](https://github.com/stepag-app/suivi-fuites/pull/43) ; tsc, bundle, 28 vérifications sans pile ; **vérifié sur l'émulateur** (tablette, paysage et portrait, compte réel) avec l'APK de la CI : liste, onglets, recherche, fiche, saisies (sans enregistrer), envois en attente, connexion, Balayage ouvert sur fuites.stepag.ma ; **à essayer sur la tablette Samsung** |
| **Langues de l'APK** (demande d'Issam du 2026-10-07, agents de détection et de réparation seulement ; panneau web en français) : trois modes choisis par tablette avec le bouton « FR / ع + FR / ع » en haut de chaque écran (et de la connexion), mémorisés sur la tablette : **français** (inchangé), **hybride** (arabe, termes techniques fréquents gardés en français selon le glossaire validé par Issam), **arabe classique** ; texte arabe aligné à droite (marque RLM), mise en page gardée de gauche à droite ; rapports, exports, désignations Dolibarr et listes paramétrées (natures, motifs, équipes) restent en français | `mobile/src/langue.tsx` (`t`, `tx`, `useLangue`), `mobile/src/traductions.ts` (271 libellés, clé = texte français, vérifiée par tsc) ; relecture : artefact « Dictionnaire arabe APK » (`docs/traduction/dictionnaire-ar.html`, réponses d'Issam sauvegardées dans `docs/traduction/revues-issam.json`) | tout relu par Issam : 274 entrées (273 OK, 1 correction), 49 libellés Studio Admin acceptés (Z01-Z49) ; **règle du 2026-10-07** : en hybride, une phrase arabe ne garde un mot français que pour « Réfection » (42 libellés passés en arabe complet ; « Polyethylene » gardé, version d'Issam ; titres « Fuites » en arabe ; les autres libellés entièrement français restent) ; tsc vert ; **à essayer sur la tablette** (APK de la PR) |
| **APK : liste au repos sans CPU** : la synchro des 30 s prévenait les écrans même sans rien envoyer ; la liste se rechargeait donc toutes les 30 s (requête, rond de rafraîchissement, redessin) et une fiche ouverte aussi. Mesuré sur l'émulateur : 8,7 % d'un cœur en moyenne au repos, pics de RenderThread à 77 %, contre 1,9 % après (0 image en 131 s ; reste le rappel d'image de React Native). Écrans prévenus seulement si la file change ; liste mise à jour en silence toutes les 5 min, au retour sur l'appli et après un envoi ; requête de la liste abandonnée après 20 s | `mobile/src/file-attente.ts`, `mobile/src/ecrans.tsx` ; essai sans pile 32/32 | PR [#48](https://github.com/stepag-app/suivi-fuites/pull/48), 2026-10-07 |
| Archivage : dossier du marché 4500004453 (documents, rapports, plans, **`Reseau aep oujda.dwg`**) et ancien dossier `Suivi-fuites-ancien` | `data-private/archives/` (ignoré par git, 359 Mo) | fait le 2026-10-05 |
| Export Dolibarr (lecture seule, sans prix) : produits, entrepôts, mouvements du chantier | `data-private/dolibarr/` (ignoré par git ; `RAPPORT.md`) | reçu le 2026-10-05 ; entrepôt du chantier **76**, projet **40**, sorties par **bons de transfert** depuis le dépôt 1 ; aucune consommation saisie |
| **APK allégée : ARM seulement** (2026-10-07) : bibliothèques natives compilées pour `armeabi-v7a` et `arm64-v8a` (tablettes Samsung et émulateur du Mac), plus pour x86 ni x86_64 ; APK de **79,0 à 42,6 Mo** (−46 %, artefact zippé de 34,6 à 21,9 Mo), plus rapide à télécharger et à installer en 4G ; compilation CI d'environ 20 à 13 min ; un émulateur x86_64 ne la lance que par traduction ARM | `mobile/app.json` (`buildArchs` d'`expo-build-properties`), `mobile/README.md` § Compilation | PR [#46](https://github.com/stepag-app/suivi-fuites/pull/46) (contient la #43 : fusionner la #43 d'abord) ; CI verte ; **vérifiée sur l'émulateur** (mise à jour par-dessus l'APK de la #43, session gardée : démarrage, liste, fiche, photos) |
| **APK allégée : bibliothèques natives compressées** (2026-10-07) : `.so` rangés compressés dans l'APK (`useLegacyPackaging`), APK de **42,6 à 24,1 Mo** (−43 %, bibliothèques ARM de 29,1 à 10,8 Mo), 18,5 Mo de moins à faire passer sur la tablette en 4G ; en échange, Android extrait à l'installation les bibliothèques de l'architecture de l'appareil (17,2 Mo en `arm64-v8a`), mais l'APK qu'il garde maigrit d'autant : place prise inchangée (émulateur : APK et bibliothèques de 42,6 à 41,2 Mo, taille de l'appli dans les Réglages de 65,9 à 64,8 Mo) ; extraction de 0,2 à 2,9 s, installation et démarrage dans le bruit de l'émulateur | `mobile/app.json` (`useLegacyPackaging` d'`expo-build-properties`), `mobile/README.md` § Compilation | PR [#47](https://github.com/stepag-app/suivi-fuites/pull/47) (contient la #46 : fusionner la #46 d'abord) ; CI verte ; **vérifiée sur l'émulateur** (mise à jour par-dessus la #46, session gardée : démarrage, liste, fiche, photos) ; **à fusionner sur accord d'Issam** |

## 2. En attente d'Issam

**Langues de l'APK (2026-10-07)** : dictionnaire entièrement validé ; essayer les trois modes sur la tablette avec
l'APK de la PR [#45](https://github.com/stepag-app/suivi-fuites/pull/45) (empilée sur la #43 : fusionner la #43 d'abord). Les listes paramétrées (natures de revêtement, motifs, équipes)
restent en français tant qu'une colonne arabe n'est pas ajoutée en base (à décider).

**APK (2026-10-07)** : installer l'APK de la PR [#43](https://github.com/stepag-app/suivi-fuites/pull/43) (artefact
`suivi-fuites-apk`, mise à jour par-dessus l'ancienne, la session reste ouverte), l'essayer sur la tablette, puis dire
« fusionner ». La PR #40 (photos R2) touche aussi `mobile/src/fiche.tsx`, `mobile/README.md` et `types.ts` : fusion
d'essai sans conflit. **À reporter dans la PR #40** : la politique CORS du compartiment R2 (feuille de route § 3) doit
autoriser l'origine `https://fuites.stepag.ma` (adresse du panneau depuis le 2026-10-07), en plus de l'ancienne.
Sur l'émulateur du Mac, la première connexion à un nouveau nom d'hôte prend une dizaine de secondes (DNS du routeur
local) : premier chargement, vignettes et carte du Balayage lents à l'ouverture, sans lien avec l'appli.

**Priorité (session 8)** : la nouvelle interface, le lot S et le lot T sont en ligne (PR #39). À faire maintenant :
1. **Paramètres > Articles** (administrateur) : « Importer produits.csv » (`data-private/dolibarr/produits.csv` ou un nouvel
   export ; familles RAC, CND, ROB, AEP, VRI), puis **activer** les articles utiles (recherche + « Tout sélectionner » +
   « Activer la sélection ») ; les produits déjà rapprochés en production (lot P1), s'il y en avait, sont déjà activés.
   Le responsable peut aussi activer. Ensuite **Paramètres > Bordereau** : règles d'article suggéré (robinet et collier PEC).
2. **Essayer la nouvelle interface** (ordinateur et tablette) : menu, carte, fiche, attachements, Utilisateurs > Droits.
3. **Lot S** : relire le zonage, puis, avec accord, importer le réseau en production (§ 7).
- Procédure courante (Issam) : exports Dolibarr fréquents → réimport de `produits.csv` → activation des nouveaux articles.
- **Fusionné et déployé le 2026-10-06** (PR #31 à #35). ~~Importer `produits.csv` puis rapprocher le catalogue~~
  (remplacé par le lot T) ; essais
  sur DEMO : matrice des droits et verrous (Utilisateurs > Droits), corrections à l'attachement (fuites N° 9, 10, 18),
  travaux hors bordereau, seuil du PE (Paramètres > Marché).
- **Lot R, réponses d'Issam du 2026-10-06 appliquées** : corrections du bureau selon leur nature (remplacement, oubli,
  retrait), pas de délai, seuil du PE réglable par marché. **Confirmé le 2026-10-06** : le responsable qui recopie une
  fiche papier est l'auteur de la réparation, ses pièces restent « terrain » même plus tard. **Lot APK à prévoir** : afficher
  sur la tablette les pièces remplacées ou retirées (barrées) avec la nature et le motif des corrections.
- ~~Défaut antérieur~~ **corrigé le 2026-10-06** (migration `20261006110000`) : `private.peut(…)` renvoyait `null` et non
  `false` quand l'auteur d'une saisie était inconnu ; `avant_modification_saisie` ne bloquait donc pas un agent « les
  siennes » sur une saisie sans auteur.
- **Questions du lot P1** : « BU » = « BIYOU » ? « ASTOR » traité comme une marque ? 6 libellés en double dans les
  familles RAC à VRI à corriger dans Dolibarr.
- **Dans Dolibarr** (relevé par l'export) : bons 6804 et 6814 arrivés dans l'entrepôt 76 mais rattachés au projet 30
  (entretien) ; bon 6796 du 2026-10-02 resté en brouillon (8 produits) ; la pose n'est pas saisie (aucune
  « consommation pour le projet » sur l'entrepôt 76) : à décider avec le magasinier.
- **Corriger l'export de la sauvegarde** (lot à lancer, `sauvegarde-base.yml` + `supabase/README.md`) : exclure
  `storage.buckets_vectors` et `storage.vector_indexes`, supprimer le doublon `donnees_auth.sql`, sauvegarder aussi le
  déclencheur `creer_profil_apres_inscription` et les règles de `storage.objects` ; le test du lot K doit alors passer
  sans contournement. D'ici là, la restauration se fait à la main (`supabase/README.md` § Sauvegarde et restauration).
- **Essais des lots K, L, M** (fusionnés) : lot M en mode avion sur la tablette (fiche déjà vue, photos).
- **Essais en production des lots F à J**, fusionnés : logos (Paramètres > Marché), carte imprimée, tableau de bord,
  marché désactivé ; APK du lot H (artefact de la compilation sur `main`).
- **Photos sur R2** (lot E / N) : non lancé, les secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
  n'existent pas dans GitHub (vérifié le 2026-10-05) ; les créer (`docs/feuille-de-route.md` § 3).

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
   37337615644, archive chiffrée de 155 Ko, contenu contrôlé par le workflow : schéma, `marches`, comptes). Test de
   restauration : lot K (PR #27), vert, mais **trois défauts de l'export** à corriger (voir la priorité ci-dessus). Historique : elle **échouait chaque nuit** (constaté le 2026-10-05 à
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
Lis CLAUDE.md, docs/etat-avancement.md, supabase/README.md, web/README.md et mobile/README.md.
Lis aussi web/MAQUETTE-SHADCN.md (interface Studio Admin) et docs/lots/lot-articles-dolibarr.md.
Contexte : tout jusqu'à la PR #39 est fusionné et déployé : nouvelle interface « Studio Admin » (shadcn/ui), lot S
(réseau, balayage, rapport journalier) et lot T (articles Dolibarr : activation par l'admin ou le responsable, plus de
pièce libre). Vérifie qu'Issam a importé produits.csv et activé des articles (Paramètres > Articles), et où en est
l'import du réseau en production (§ 7). Ensuite : corriger l'export de la sauvegarde (3 défauts, § 2), puis relancer
les lots P3 et P4 sur le modèle du lot T (migrations après 20261006140000), voir § 5 et docs/feuille-de-route.md.
Pour vérifier l'interface sans compte : NEXT_PUBLIC_MODE_DEMO=1 (mode démonstration, jamais sur Vercel).
Objectif de cette session : [à préciser : corriger les retours du premier test, puis la prochaine
fonctionnalité].
Travaille en français, sur une branche dédiée avec une PR en brouillon ; ne touche pas au projet
Supabase de production sans mon accord explicite ; aucun secret dans le dépôt ni dans le chat.
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

**À faire par Issam (lot S)** :
1. Relire le zonage sur l'aperçu (`data-private/reseau/apercu.html`, `python3 -m http.server 8765` dans ce dossier)
   et dire si les noms et contours des 34 secteurs sont justes (planches comprises).
2. Laisser passer la CI, essayer l'aperçu Vercel, puis « fusionner ». Ensuite, **avec son accord**, importer le
   réseau en production : Paramètres > Réseau > Import (`secteurs.geojson`, `troncons.geojson`, `noeuds.geojson`),
   puis affecter les 229 km non zonés sur la carte de zonage.
3. Essayer l'APK (artefact de la CI) : bouton Balayage, cocher quelques tronçons, rapport du jour.
4. Questions : le chef de réparation doit-il voir le journal des balayages ? (non pour l'instant) ; le linéaire
   payé par secteur doit-il venir du dessin (`v_lineaire_secteurs`) ou d'un relevé contradictoire ? ; la SRM
   accepte-t-elle le rapport journalier au gabarit STEPAG 2026 ?

**Notes techniques** : une autre session (lots P3, P4) a pris `20261006120000`, `20261006120100` et les tests 13-14 :
le lot S utilise `20261006130000` et le test 15 ; fusionner P3/P4 avant S (le déploiement refuse une migration plus
ancienne que la dernière appliquée). Le dessin contient aussi les **secteurs de relève** (269 polygones numérotés) :
piste pour localiser une fuite par le premier bloc de sa référence SRM (à confirmer avec la SRM).
