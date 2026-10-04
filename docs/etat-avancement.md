# État d'avancement et passation entre sessions

> À lire en début de chaque session, avec `CLAUDE.md` et `supabase/README.md`.
> Mettre à jour en fin de session (fait, en attente, décisions).

Dernière mise à jour : 2026-10-04 (session 4 : application standard, attachements figés, panneau d'export ;
PR #10 fusionnée et déployée ; marché de démonstration DEMO).

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
| Sauvegarde nocturne chiffrée de la base (schéma, données, comptes), 30 jours | `.github/workflows/sauvegarde-base.yml`, `supabase/README.md` | écrite ; **inactive tant que le secret `SAUVEGARDE_PASSPHRASE` n'existe pas** ; première exécution à valider à la main |
| Correctif droits `service_role` (migration `20261004130000`) | `supabase/migrations/` | déployé ; simulateur de test rendu strict (aucun droit par défaut), 64 tests |
| **Étape A** : application standard (fiche du marché : titulaire, maître d'ouvrage, délai, OS typés, arrêts et reprises, avenants, bordereau versionné, journal des événements avec pièces jointes, règles d'attachement, libellés et contrôles du client par marché) | migrations `20261004180000`, `20261004180100` ; Paramètres > Marché, Bordereau, Attachement, Événements | **PR [#10](https://github.com/stepag-app/suivi-fuites/pull/10) fusionnée** (accord d'Issam) ; migrations **déployées** le 2026-10-04 à 19 h 05 UTC |
| **Étape B** : lots d'attachement figés (solde fuite × article, brouillon puis arrêt, régularisations, réfection anticipée, ligne libre, refacturation forcée et réouverture par l'admin) | migration `20261004200000` ; pages `/attachements` | même PR #10, déployée |
| **Étape C** : panneau d'export (Excel, PDF, Word, CSV), modèles par marché, en-têtes du marché, arabe dans les fichiers | migration `20261004210000` ; `web/src/lib/export/` | même PR #10, déployée |
| 164 tests pgTAP (64 + 49 A + 41 B + 10 C) ; migrations rejouées sur une vraie pile Supabase locale (Docker) ; parcours Playwright des trois étapes ; fichiers d'export rendus et contrôlés (PDF, Word et Excel via LibreOffice) | `supabase/tests/database/` | verts en local et en CI |
| **Marché DEMO** (données fictives) : copie des paramètres SRM, 25 fuites août-octobre (tous les cas), lot N° 01 d'août arrêté, régularisation et réfection tardive à attacher en septembre, arrêt de travaux, 4 événements | migration `20261004230000` ; `supabase/README.md` § Marché de démonstration | PR [#11](https://github.com/stepag-app/suivi-fuites/pull/11), **déployée** le 2026-10-04 à 19 h 48 UTC |
| Deux fausses anomalies corrigées (terrassement sans fouille, re-détection vue comme doublon) | migration `20261004220000` | même PR |
| Droits des agents de terrain vérifiés : détection et chef de réparation ne voient que les fuites et les réparations (ni attachements, ni prix, ni paramètres, ni exports) ; 30 tests pgTAP de plus (194 au total) | `supabase/tests/database/05_marche_demo.test.sql` | verts |
| Sélecteur de marché lisible dans l'en-tête du panneau ; marchés classés du plus récent au plus ancien (SRM avant DEMO) ; choix du marché sur la tablette (mémorisé) ; « Attachement d'octobre » | `web/`, `mobile/src/session.tsx`, `mobile/src/ecrans.tsx` | PR [#11](https://github.com/stepag-app/suivi-fuites/pull/11) fusionnée et déployée |
| Retours d'Issam sur le lot (2026-10-04) : fuites cliquables (fiche dans un nouvel onglet), listes « Travaux du lot » et « À attacher » horizontales, compactes et zébrées, page élargie ; titre qui suit la saisie (date, N° prévu), intitulé qui suit le mois ; Excel prêt à imprimer en A4 (une page en largeur, titres répétés, colonnes resserrées selon l'orientation) | `web/src/app/(app)/attachements/`, `web/src/lib/export/xlsx.ts` | PR suivante |
| **Lot A, tablette** : fiche d'une fuite (infos, statut, photos, réparations, réfections, sans prix), saisie d'une réparation (pièces du catalogue, ouvriers, photos avant / pendant / après) et d'une réfection, hors ligne (file d'attente ordonnée par fuite, reprise après coupure, erreurs claires dont fuite verrouillée), contrôle des doublons à la création (même fuite / nouvelle fuite liée), boutons de saisie selon les droits (détection en lecture) | `mobile/src/` (`fiche.tsx`, `saisie.tsx`, `file-attente.ts`), `mobile/essais/` | branche `claude/lot-a-tablette` ; types et bundle Android vérifiés, **24 vérifications** contre une pile Supabase locale (chef, détection, DEMO) ; **à essayer sur la tablette** |

## 2. En attente d'Issam

0. **Essais sur le marché DEMO** (sélecteur en haut du panneau) : lot d'attachement de septembre
   (« + Nouveau lot », date au 30/09, cocher la régularisation de la fuite N° 2 et la réfection de la
   N° 3, réfection anticipée sur la N° 10), exports, alertes. Pour essayer l'APK sur DEMO, affecter un
   agent au marché DEMO (Utilisateurs). **Après les essais** : désactiver le marché DEMO.
   Dans le marché SRM : **Paramètres > Marché**, relire la fiche et compléter téléphones et e-mails.
1. **Test sur la tablette Samsung** (Chrome, « Ajouter à l'écran d'accueil ») : signaler une fuite avec GPS et photo, saisir réparation et réfection, vérifier les prix de la fiche. Noter tout ce qui gêne (boutons, étapes, champs manquants, lenteur, réseau).
2. **Plan du réseau `Reseau aep oujda.dwg`** : sera transmis plus tard. Voir § 4.
3. **Relecture** des libellés arabes (motifs, natures de réfection) et du découpage des 34 secteurs.
4. **Secret GitHub `SAUVEGARDE_PASSPHRASE`** (phrase secrète, gestionnaire de mots de passe), puis lancer « Sauvegarde de la base » à la main et vérifier l'artefact.
5. **Secret GitHub `EXPO_PUBLIC_SUPABASE_ANON_KEY`** : **créé le 2026-10-04** ; la compilation APK n° 13 sur `main`
   (run 37241834456) l'a bien prise, artefact `suivi-fuites-apk` disponible jusqu'au 18/10/2026 : APK connectable.
   Reste : l'installer sur la tablette (sources inconnues autorisées, batterie « Non restreinte ») et le tester
   (avec le lot A une fois fusionné : fiche, réparation, réfection, hors ligne), puis le keystore de production.
6. **Keystore de production** de l'APK : à créer hors du dépôt, en deux copies, avant toute distribution (l'APK actuel est signé avec la clé de test d'Expo).
7. Faits : inscriptions publiques désactivées, fournisseur e-mail réglé, projet Vercel créé, premier agent créé.

## 3. Décisions prises (à respecter)

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

**Fait cette session** : le panneau d'export demandé (voir `web/README.md`, § Exports), fusionné et
déployé ; marché DEMO pour les essais.

**Application standard, ce qui manque encore à l'écran** (aujourd'hui seulement en base, par migration) :
création d'un marché (et copie des paramètres d'un marché existant), zones et secteurs, natures de réfection
(et leur article), catalogue des pièces, règles de proposition automatique des prix (famille, matériaux,
diamètres) pour un bordereau saisi à l'écran.

**Retouches visuelles des exports** : si la SRM impose un gabarit (cartouche, logos, mentions, visas),
passer une session **locale** sur le Mac avec aperçu navigateur ; tout le reste se règle dans les modèles.


1. Retours du premier test terrain (parcours connexion → fuite → réparation → réfection).
2. À ajouter dans le panneau selon les retours : paramètres (ouvriers, équipes, prix hors bordereau,
   motifs), carte des fuites, anomalies, journal, interface en arabe / mixte, exports PDF et Word.
3. Application Expo : socle, fiche, réparations / réfections et doublons faits (lot A). À ajouter : suivi GPS en
   arrière-plan (tracé par agent et par jour, M4), notifications push, mise à jour de l'APK, modification d'une
   réparation envoyée, photos seules depuis la fiche. Mode hors ligne web : consultation et modification d'une fuite
   existante sans réseau non gérées.
4. Migration 2 dès réception du DXF : le balayage (prix 1 et 2) pourra alors s'attacher par tronçon ;
   en attendant, une **ligne libre** du lot d'attachement porte le linéaire balayé par secteur.
5. Rapport PDF par fuite (photos, GPS), carte des fuites, état journalier au gabarit exact de la SRM.

## 6. Prompt pour démarrer une nouvelle session

```text
Lis CLAUDE.md, docs/etat-avancement.md, supabase/README.md, web/README.md et mobile/README.md.
Contexte : migrations 1, A, B, C déployées (PR #10) ; marché DEMO (données fictives) ajouté par la PR
suivante : vérifie qu'elle est fusionnée et déployée (workflow « Déploiement de la base »), puis les
retours de test d'Issam (lots d'attachement sur DEMO, exports, APK).
Le plan DWG du réseau n'est pas encore disponible : ne commence pas la migration 2.
Objectif de cette session : [à préciser : corriger les retours du premier test, puis la prochaine
fonctionnalité].
Travaille en français, sur une branche dédiée avec une PR en brouillon ; ne touche pas au projet
Supabase de production sans mon accord explicite ; aucun secret dans le dépôt ni dans le chat.
Mets à jour docs/etat-avancement.md en fin de session.
```
