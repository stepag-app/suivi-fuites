# Feuille de route (retouches et évolutions planifiées)

> Notée le 2026-10-04 au soir avec Issam. Complète `docs/etat-avancement.md` (fait, en attente) :
> ici, ce qui est **décidé ou demandé mais pas encore fait**, dans l'ordre prévu. Mettre à jour à
> chaque lot terminé (déplacer la ligne dans `etat-avancement.md`).

## 1. Décisions prises ce soir

| Sujet | Décision |
|---|---|
| Ce que voit chacun | Tout le monde voit toutes les fuites (détectées, en réparation, réparées). Attachements, paramètres, exports, prix et autres rubriques : **responsable et administrateur** seulement (déjà en place, garanti par les tests `05_marche_demo`). |
| Agent de détection | Signale les fuites et **modifie seulement celles qu'il a signalées**, tant qu'elles sont « détectées » (règle actuelle, confirmée). Voit aussi les fuites réparées, en lecture. |
| Équipes de réparation | Voient toutes les fuites, saisissent réparations et réfections (lot A, tablette). |
| Itinéraire | Chaque fuite a un lien « **Y aller** » qui ouvre une appli de cartes **externe** (Google Maps, Waze…) avec la fuite comme destination, sans rien demander : tablette (lot A, URI `geo:`), fiche web et rapport PDF (lot D), bulle de la carte (lot B). |
| Google Maps intégré | **Reporté** : on garde le fond OpenStreetMap / MapLibre du lot B (gratuit, sans clé, utilisable hors ligne plus tard) ; Issam décide après l'avoir vu s'il passe à Google Maps (clé API Google Cloud, facturation par carte). |
| Photos sur Cloudflare R2 | Carte bancaire acceptée, **R2 Paid actif** (2026-10-04). Compartiment et clé créés par Issam (étapes au § 3) ; développement **après la fusion des lots A et D** (même code photo). |

## 2. Lots en cours (sessions parallèles du 2026-10-04)

| Lot | Contenu | État au 2026-10-04 23 h 30 UTC |
|---|---|---|
| A. Tablette | fiche d'une fuite, réparations et réfections hors ligne, doublons, « Y aller », envoi des photos regroupé dans une seule fonction | PR #13 ouverte |
| B. Carte | page `/carte`, fond OSM minimal, couleurs par statut, filtres, lien « Y aller » dans la bulle | PR #18, fond réel à vérifier sur Vercel |
| C. Paramètres | page Marchés (copie, activation), secteurs, natures, catalogue, règles des prix | PR #14 ouverte |
| D. Rapport PDF | rapport par fuite et par liste filtrée (fusionné, PR #15) ; suite : « Y aller », lecture des photos regroupée | suite en cours |

Session 5 (2026-10-05), lots menés en parallèle, PR **en brouillon** (CI verte) :

| Lot | Contenu | PR |
|---|---|---|
| F. Logos | logos du titulaire et du maître d'ouvrage dans tous les en-têtes (PDF, Word, Excel) | #22 |
| G. Impression de la carte | PDF A4 / A3 : carte 200 dpi, légende, échelle, nord, coordonnées WGS84, liste | #25 |
| H. Tablette | style Fiori de l'APK, photos depuis la fiche, modification d'une réparation | #24 |
| I. Tableau de bord v1 | indicateurs, statuts, 12 semaines, secteurs / zones, attachements | #23 |
| J. Marché désactivé | lecture seule en base (sauf administrateur) | #21 |

Lots F à J fusionnés le 2026-10-05 (session 6). Session 6, lots en parallèle, PR **en brouillon** :

| Lot | Contenu | PR |
|---|---|---|
| K. Test de restauration | restauration hebdomadaire de la dernière sauvegarde dans une base vierge de la CI, lignes comparées | #27 |
| L. Filtres dans l'adresse | filtres de `/fuites` dans l'URL (dont la période), chiffres du tableau de bord cliquables | #28 |
| M. Fiche hors ligne | fiche déjà vue consultable sans réseau (données et photos en cache, lecture seule) | #29 |
| N. Photos sur R2 | code prêt (fonction serveur, dépôt et lecture web / APK, repli Supabase) ; **secrets R2 à créer par Issam** (§ 3) | PR lot N |

Lots K, L, M fusionnés le 2026-10-05 ; Q, R, P1 et intégration fusionnés et déployés le 2026-10-06 :

| Lot | Contenu | PR |
|---|---|---|
| Q. Matrice des droits | utilisateurs en colonnes, droits en lignes ; verrous de sécurité de l'admin | #31 |
| R. Contrôles à l'attachement | pièces ajoutées au bureau, requalification avec motif, oublis probables, travaux hors bordereau | #32 |
| P1. Nomenclature Dolibarr | import `produits.csv`, rapprochement par identifiant produit, validation ; désignation seule pour le réparateur | #33 |
| P3. Inventaire des fournitures posées | tableau croisé et filtres rapides (fuite, période, secteur, équipe, famille, terrain / bureau) | à lancer après P1 |
| P4. Rapprochement posé / transféré | mouvements Dolibarr de l'entrepôt 76 (CSV, puis envoi depuis le serveur) comparés aux pièces posées, période × article | à lancer après P1 |
| APK. Pièces corrigées | afficher sur la tablette les pièces remplacées ou retirées (barrées), nature et motif des corrections ; la réparation d'un autre se corrige depuis « Corriger » sur le web | à lancer |

## 3. Photos sur Cloudflare R2 (lot N, code prêt : PR du 2026-10-06)

**Côté application (fait)** : fonction serveur `photos-r2` (URL signées S3 de courte durée : dépôt `PUT` 15 min,
lecture `GET` 1 h), fonction SQL `marches_photos` (mêmes droits que la RLS de `photos`), dépôt et lecture dans
`web/src/lib/photo.ts` (`deposerPhoto`, `urlsPhotos`) et `mobile/src/photos.ts` ; la ligne `photos` porte
`stockage = 'r2'`. **Tant que les secrets R2 manquent, rien ne change** : la fonction répond « non configuré »
et les photos vont sur Supabase Storage. Les anciennes photos restent lisibles (deux stockages cohabitent).

**À faire par Issam** (aucune valeur secrète dans le chat ni le dépôt) :
1. Cloudflare → **R2 Object Storage** → **Create bucket** : nom `suivi-fuites-photos`, emplacement automatique
   avec l'indication **Western Europe (WEUR)**, classe Standard. **Accès public : désactivé** (ni r2.dev ni
   domaine public : les photos restent privées, servies seulement par URL signée).
2. Le compartiment → **Settings → CORS policy → Edit** (le panneau dépose directement dans R2 depuis le
   navigateur ; la tablette n'en a pas besoin) :
   ```json
   [
     {
       "AllowedOrigins": ["https://suivi-fuites-web.vercel.app", "http://localhost:3000"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Ajouter `https://fuites.stepag.ma` le jour du sous-domaine. (Un aperçu Vercel, non listé, retombe sur
   Supabase Storage : c'est voulu.)
3. R2 → **Manage API tokens** → **Create API token** : permission **Object Read & Write**, limité au seul
   compartiment `suivi-fuites-photos`, sans date d'expiration. Noter tout de suite, dans le gestionnaire de mots
   de passe : l'**Account ID**, l'**Access Key ID** et la **Secret Access Key** (affichée une seule fois).
4. Essai avec vos clés, depuis `web/` (rien n'est écrit dans le dépôt, aucune clé affichée) :
   `R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… node scripts/essai-r2.mjs`
   (dépose un fichier texte sous `essai/`, le relit par URL signée, vérifie que le compartiment est privé, le supprime).
5. GitHub → dépôt → Settings → Secrets and variables → Actions : secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY` (et la variable `R2_BUCKET` seulement si le nom diffère). Puis Actions →
   « Déploiement de la base » → **Run workflow** : le workflow passe les secrets à la fonction `photos-r2`
   (`supabase secrets set`) et la redéploie. Dès lors, les nouvelles photos vont dans R2.
6. Contrôle : prendre une photo depuis la tablette ou la fiche web, puis vérifier dans Supabase (table `photos`,
   colonne `stockage` = `r2`) et dans le compartiment (objet `<marche>/<fuite>/<photo>.jpg`).

**Plus tard** : transfert des anciennes photos Supabase vers R2 par script (facultatif, elles restent lisibles) ;
règle de cycle de vie R2 (purge après 6 à 7 mois) une fois les rapports PDF archivés ; sauvegarde des photos
(§ 4, point 10).

## 4. À faire ensuite (ordre proposé)

1. ~~**Logos**~~ (lot F, PR #22) du titulaire et du maître d'ouvrage dans Paramètres > Marché (envoi d'une image, stockage
   privé), repris dans les en-têtes PDF, Word et Excel (exports, attachements, rapport par fuite).
   Après la fusion des lots C et D (mêmes fichiers).
2. **États journaliers et hebdomadaires** : écran « Rapports » où le responsable choisit ce qu'il
   exporte ou imprime (sections, colonnes, regroupements, période), aperçu avant tirage, modèles
   enregistrés par marché ; s'appuie sur le panneau d'export. **Bloqué par** le modèle exact de la SRM
   (à fournir par Issam).
3. **Suivi GPS en arrière-plan** (M4) : tracé de chaque agent, **un tracé par agent et par jour**
   (pas un point par ligne), distance réellement parcourue, notification permanente Android, fréquence
   réglable (15-20 m ou 30 s en mouvement), exclusion de l'optimisation batterie Samsung. Questions :
   heures de suivi (journée de travail seulement ?), information des agents et déclaration à la
   **CNDP** (loi 09-08 sur les données personnelles : la géolocalisation des salariés est encadrée, à
   vérifier avec un conseil).
4. **Tronçons du réseau et balayage** (migration 2) : import du réseau en tronçons (DXF issu du DWG de
   préférence ; sinon planches PDF si elles sont **vectorielles** et calées par 3 à 4 points connus) ;
   sur la tablette, l'agent de détection touche chaque tronçon parcouru (petits traits le long des
   conduites, couleur qui change à la validation) ; la zone balayée se déduit des tronçons validés ;
   un tronçon n'est payé qu'une fois (prix 1). **Bloqué par** le DWG / DXF ou 1 ou 2 planches PDF à
   examiner (à déposer hors dépôt).
5. **Contrôle croisé** : tronçon coché sans passage GPS à moins de X m (seuil à fixer) → signalé au
   responsable.
6. **Tableaux journaliers et hebdomadaires** des distances parcourues (GPS) et des linéaires balayés
   (tronçons), par agent, équipe, secteur, zone.
7. **Tableau de bord** : version 1 faite (lot I, PR #23) ; restent l'avancement du balayage et le contrôle tracé /
   cochage (après la migration 2 et le suivi GPS), et les réponses d'Issam (voir `etat-avancement.md` § 2). Prévu : fuites par statut et par secteur, délais, alertes,
   avancement du balayage, quantités attachées / reste à attacher, contrôle tracking / cochage.
8. **Google Maps intégré** : décision après avoir vu la carte du lot B.
9. **Passe d'interface** : **faite pour le panneau web** (2026-10-05, PR #19) : style SAP Fiori en CSS
   maison, widgets d'indicateurs, fiche d'une fuite au format de la maquette. APK : fait (lot H, PR #24).
10. **Sauvegarde complète et restaurable** (demande d'Issam du 2026-10-05) :
    - ~~Activer la sauvegarde nocturne~~ : active depuis le 2026-10-05. ~~Test de restauration~~ : lot K (PR #27).
    - **D'abord** : corriger les trois défauts de l'export relevés par le lot K (tables `storage` vectorielles
      non inscriptibles, `donnees_auth.sql` en doublon, déclencheur sur `auth.users` et règles de
      `storage.objects` absents ; détail dans `supabase/README.md` § Sauvegarde et restauration).
    - **Ensuite** : envoyer aussi la sauvegarde **hors de GitHub** (une boîte Gmail dédiée, par exemple),
      sous un format restaurable à tout moment (SQL ou archive), **photos comprises**.
    - Contraintes à trancher avec Issam (**stockage et destination décidés plus tard**) :
      - une pièce jointe Gmail est limitée à **25 Mo** : la base (SQL compressé et chiffré, quelques Mo)
        y tient ; les photos (2 à 7 Go sur 12 mois) **non** : il faudra un lien vers une archive
        déposée ailleurs (R2, Google Drive du compte `stepag.app`) ou des envois incrémentaux
        (seulement les photos du jour) ;
      - envoi d'e-mail depuis GitHub Actions : compte Gmail avec mot de passe d'application ou
        API Gmail (secret GitHub) ; le fichier reste **chiffré** (la phrase secrète ne part jamais
        avec le fichier) ;
      - **procédure de restauration écrite et testée** (base + photos) sur une pile Supabase locale.

## 5. Étape ultime : dépôt fermé et rotation de tous les secrets (avant la mise en production)

Demande d'Issam du 2026-10-10. **Dernière étape avant la remise au client.** Le dépôt `stepag-app/suivi-fuites`
est **public depuis le 2026-10-09** : tout ce qui y a transité doit être considéré comme vu (clones, forks, caches).
Le refermer ne suffit pas : on **change tout**, puis on range **tout** au même endroit.

**Coffre unique** : un gestionnaire de mots de passe (Bitwarden ou KeePassXC, à choisir par Issam), une entrée par
compte ou secret (site, identifiant, mot de passe ou valeur, 2FA, codes de secours, date de rotation), le keystore
en pièce jointe ; **une copie hors ligne** (clé USB chiffrée) en plus. Jamais dans le dépôt, le chat, un e-mail ni
un fichier en clair sur le Mac. Claude prépare la liste et le pas-à-pas ; **Issam saisit lui-même** chaque mot de
passe et chaque valeur (Claude ne voit ni ne tape aucun secret).

### Ordre

1. **Avant** : `gitleaks` sur tout l'historique Git (y compris branches fermées) ; liste de ce qui a fuité, s'il y a lieu.
2. **Fermer le dépôt** : GitHub > Settings > visibility **Private** (facturation des minutes Actions réglée avant) ;
   vérifier les forks et retirer les collaborateurs ou applications inutiles.
3. **Comptes** (A) : changer le mot de passe, vérifier la 2FA, régénérer les codes de secours, déconnecter les
   autres sessions, revoir les applications tierces autorisées. **Gmail d'abord** (il récupère tous les autres).
4. **Secrets techniques** (B) : régénérer, reposer partout où ils servent, **ancienne valeur révoquée seulement
   après** vérification que tout marche.
5. **Comptes de l'application** (C).
6. **Keystore** (D), s'il le faut.
7. **Contrôle final** : panneau web, APK, sauvegarde nocturne, push, photos R2 et satellite essayés avec les
   nouvelles valeurs ; date de la prochaine rotation notée dans le coffre.

### A. Comptes (mot de passe + 2FA + codes de secours)

| # | Compte | Remarques |
|---|---|---|
| A1 | Google `stepag.app@gmail.com` | en premier ; mots de passe d'application à révoquer ; adresse et téléphone de récupération à vérifier ; sert aussi à Firebase et à Esri |
| A2 | GitHub `stepag-app` | 2FA ; jetons personnels (PAT), clés SSH, applications OAuth / GitHub Apps (Vercel, Supabase, Claude) à revoir |
| A3 | Supabase (connexion par GitHub) | 2FA + **seconde appli d'authentification** ; jetons d'accès personnels |
| A4 | Vercel, équipe `STEPAG` (connexion par GitHub) | jetons d'accès ; passage à Pro au même moment |
| A5 | Cloudflare | 2FA, codes de récupération **régénérés** ; jetons API ; DNS de `stepag.ma` |
| A6 | Firebase / Google Cloud (compte A1) | comptes de service à revoir |
| A7 | Esri ArcGIS `stepag-fuites.maps.arcgis.com` | mot de passe (pas de 2FA, décision d'Issam) |
| A8 | Compte Claude utilisé pour le développement | sessions et intégrations GitHub connectées |
| A9 | Sentry, s'il a été créé | |
| A10 | Mac de développement | sessions CLI à refaire après rotation : `gh auth`, `supabase login`, `vercel login` |

### B. Secrets techniques (où ils vivent)

| # | Secret | Où le reposer | Comment le régénérer |
|---|---|---|---|
| B1 | Mot de passe de la base Supabase (`SUPABASE_DB_PASSWORD`) | secret GitHub, `.env` local | Supabase > Database > Reset password |
| B2 | Clé anon / publishable (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`) | Vercel, secret GitHub (APK), `web/.env.local`, `mobile/.env` | nouvelles clés d'API Supabase (publishable / secret) ou rotation du secret JWT ; **un nouvel APK est nécessaire** (clé compilée dedans) |
| B3 | Clé `service_role` / secret (`SUPABASE_SERVICE_ROLE_KEY`, `SB_SERVICE` des scripts) | injectée par Supabase dans les fonctions ; `.env` local des scripts | même opération que B2 ; la rotation du secret JWT **déconnecte tous les utilisateurs** |
| B4 | Jeton d'accès Supabase (`SUPABASE_ACCESS_TOKEN`) | secret GitHub (déploiement de la base) | Supabase > Account > Access tokens : en créer un, supprimer l'ancien |
| B5 | Phrase secrète des sauvegardes (`SAUVEGARDE_PASSPHRASE`) | secret GitHub | nouvelle phrase ; **garder l'ancienne dans le coffre** (elle seule ouvre les sauvegardes déjà faites) |
| B6 | R2 (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, variable `R2_BUCKET`) | secrets GitHub, secrets des fonctions Supabase (`photos-r2`, `reseau-tuiles`), Vercel si posés | Cloudflare > R2 > API tokens : nouveau jeton limité au bucket, supprimer l'ancien |
| B7 | Firebase (`GOOGLE_SERVICES_JSON`, `FIREBASE_SERVICE_ACCOUNT`) | secrets GitHub (APK), secret de la fonction `envoyer-push` | nouvelle clé du compte de service, ancienne supprimée ; `google-services.json` se retélécharge (identifiants de projet, pas un vrai secret) |
| B8 | Clé Esri (`NEXT_PUBLIC_ESRI_CLE`) | Vercel | nouvelle clé limitée à `fuites.stepag.ma` et au privilège Basemaps ; renouvellement annuel |
| B9 | Keystore Android (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`) | secrets GitHub ; fichier dans `~/Documents/STEPAG-KEYSTORE/` + 2 copies | voir D |
| B10 | Clé de test PostgREST (`PGRST_JWT_SECRET`) | essai local seulement | à vérifier qu'il ne s'agit que d'une valeur d'essai |

Valeurs **non secrètes** à recopier quand même dans le coffre (pour tout reconstruire) : `SUPABASE_URL`,
`SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_DOMAINE_AGENTS` / `DOMAINE_AGENTS`, `NEXT_PUBLIC_NOM_ORGANISATION`,
`EXPO_PUBLIC_WEB_URL`.

**Recensement à refaire juste avant l'étape** (de nouveaux secrets auront pu s'ajouter) : `git grep` sur
`secrets.`, `vars.`, `process.env.`, `Deno.env.get` et les `.env.example`, puis comparaison avec les listes de
GitHub (Settings > Secrets), Vercel (Environment Variables) et Supabase (Edge Functions > Secrets).

### C. Comptes de l'application

- Comptes d'essai et de démonstration créés pendant le développement : **supprimés** ou désactivés.
- Comptes administrateur STEPAG : nouveau mot de passe ; comptes agents : mot de passe réinitialisé par l'administrateur.
- Comptes de suivi SRM : créés seulement à la mise en production.

### D. Keystore Android (s'il le faut)

Le keystore n'est jamais passé par le dépôt ; le changer n'est **utile que s'il a été exposé** (secrets GitHub lus
par un tiers, copie perdue). Si on le change :

- générer le nouveau keystore hors dépôt, 2 copies + coffre, mettre à jour les 3 secrets GitHub ;
- **de préférence, rotation de clé APK v3** (`apksigner rotate` + lignée signée par l'ancienne clé) : les tablettes
  acceptent la mise à jour **sans désinstaller** ;
- sinon, une signature différente oblige à **désinstaller puis réinstaller** sur chaque tablette : vider d'abord la
  file d'attente hors ligne de chaque tablette (rien de non envoyé), puis reconnexion des agents ;
- compiler et installer un nouvel APK signé (de toute façon nécessaire si B2 change), vérifier la signature
  (`apksigner verify --print-certs`).

## 6. Questions ouvertes pour Issam

- Modèle exact des états journaliers / hebdomadaires et du rapport par fuite exigé par la SRM.
- Suivi GPS : heures de suivi, information des agents, CNDP ; seuil de contrôle tronçon / tracé.
- Plan du réseau : DWG (→ DXF) ou planches PDF vectorielles, et le système de coordonnées.
- Logos : fichiers du titulaire (STEPAG) et du maître d'ouvrage (SRM), droit d'usage du logo client.
- Sauvegarde complète : destination (Gmail dédié, Drive, R2), fréquence (nuit ? semaine pour les photos ?),
  durée de conservation, qui détient la phrase secrète.
- Étape ultime (§ 5) : gestionnaire de mots de passe retenu (Bitwarden ou KeePassXC) et emplacement de la copie hors ligne.
