# CLAUDE.md — Application de détection et réparation de fuites (STEPAG / SRM Oriental)

> Document de cadrage général (version 2). Pas de planification détaillée : les spécifications fines seront discutées ensuite, étape par étape.

## 1. Contexte métier

- **Société** : STEPAG SARL (domaine : stepag.ma)
- **Maître d'ouvrage** : SRM Oriental (Société Régionale Multiservices de l'Oriental)
- **Marché** : 12 mois, détection ET réparation de fuites sur le réseau d'eau potable
- **Objectif** : digitaliser tout le cycle de vie d'une fuite, de la détection à la réparation, avec suivi, alertes, rapports et attachements mensuels.
- **Application multi-marchés** : elle ne sert pas un seul marché. Chaque nouveau marché (SRM Oriental en premier, d'autres ensuite) a ses propres chantiers, zones, tâches, agents, bordereau des prix et rapports. Des agents sont ajoutés marché par marché.

## 2. Profil du développeur (Issam)

- Expérience : PHP, SQL, applications web avec gestionnaire de base de données, intégrations Dolibarr
- Outils maîtrisés : Vercel, Supabase, GitHub, Claude Code (pull/push en local), skills, plugins, MCP
- Infrastructure existante : serveur local H24 accessible via tunnel Cloudflare
  - `erp.stepag.ma` → Dolibarr
  - `paie.stepag.ma` → application de paie
- Matériel de développement : MacBook Air
- Abonnement **Claude Max 20x** (confirmé dans la page de facturation, renouvellement le 3 novembre 2026) ; crédit cloud promotionnel de 250 $ à vérifier et à réclamer rapidement
- Microsoft 365 Famille disponible mais **non retenu** (stockage de fichiers, pas adapté à une app).

## 3. Utilisateurs et rôles (à détailler plus tard)

- **Agents de détection** : balayage du réseau, pointage des fuites
- **Agents / techniciens de réparation** : reçoivent la liste des fuites, interviennent, clôturent
- **Administrateurs STEPAG** : utilisateurs, permissions, vues, exports
- **Agents de suivi de la SRM** : destinataires des états journaliers et hebdomadaires
- Utilisateurs peu à l'aise avec la technique → connexion simple, comptes créés et paramétrés par l'administrateur.
- Chaque agent est **affecté à un ou plusieurs marchés** ; il ne voit que les données de ses marchés. Un administrateur STEPAG voit tous les marchés.
- Matériel : tablettes **Android Samsung** avec carte SIM (5G/4G, travail en ville, coupures rares).

## 4. Fonctionnalités attendues

### Marchés, chantiers, tâches et zones
- **Marchés** : création et paramétrage (client, durée, ville, bordereau des prix, agents affectés)
- **Chantiers** : paramétrables par marché
- **Tâches à exécuter** : paramétrables (type, chantier, équipe, échéance, statut)
- **Zones à balayer** : dessinées ou importées (plans AutoCAD / PDF), assignées aux agents, avec statut (à balayer, en cours, balayée)

### Cartes et impression
- Zones, chantiers, fuites et tracés des agents affichés sur **carte** (appli tablette et panneau web)
- Fond de carte **minimal, sans satellite** ; les planches PDF existantes peuvent servir de couche de référence si elles sont calibrées
- **Zones colorées** selon leur statut (à balayer, en cours, balayée)
- **Impression** des cartes en PDF : zone balayée, fuites, légende, échelle, **coordonnées GPS** de la ville concernée
- Impression pilotée depuis le **panneau web** (plus simple et plus fiable que depuis la tablette)

### Détection
- Balayage du réseau : tracer les zones déjà parcourues
- Plans existants (AutoCAD, PDF) à intégrer comme référence
- Pointage d'une fuite par **GPS** et par **numéro de référence / tournée** SRM
- Photos géolocalisées rattachées à chaque fuite
- **Traçabilité GPS permanente de l'agent** (conservation des points du parcours)

### Réparation
- Liste des fuites détectées transmise automatiquement aux équipes de réparation
- Mise à jour du statut sur le terrain, photos avant / après

### Statuts d'une fuite
1. Détectée, non réparée
2. Réparation en cours / reste à finir
3. Achevée

### Notifications et alertes
- Alerte pour les fuites détectées non réparées au-delà de **48 h** (seuil paramétrable)
- Notifications aux équipes concernées

### Rapports et exports
- États **journaliers et hebdomadaires** pour les agents de suivi SRM
- Rapports PDF par fuite : photos, localisation GPS, informations de la fuite
- Rapports de quantités convertis selon le **bordereau des prix** du marché, pour les **attachements mensuels**
- Export Excel / PDF des listes et statistiques

### Administration
- Tableaux et vues personnalisables
- Gestion des utilisateurs et permissions par rôle
- Sauvegardes (backup)

## 5. Décisions d'architecture prises

| Sujet | Décision |
|---|---|
| Serveur local H24 | **Écarté** pour cette app (risque coupure électricité / internet) |
| Base de données, auth, API | **Supabase** (PostgreSQL + PostGIS) |
| Photos | **Cloudflare R2** (10 Go gratuits, pas de frais de sortie) visé ; **en attente d'une carte bancaire valide** pour l'activer. En attendant : démarrage sur **Supabase Storage** (1 Go gratuit) derrière une **couche d'abstraction du stockage**, pour basculer vers R2 sans réécrire l'appli |
| Google Drive / OneDrive pour les photos | **Écartés** (API non adaptée) |
| Application terrain | **APK Android**, installé directement sur les tablettes, sans Play Store |
| iOS / iPhone | **Abandonné** (Android uniquement) |
| Technologie mobile | **React Native avec Expo, en TypeScript** (Flutter écarté : un seul langage pour APK, panneau web et Supabase) |
| Panneau d'administration / suivi | Application web sur **Vercel** (Hobby pour le développement, **Pro avant la production**), sous-domaine de stepag.ma (ex. `fuites.stepag.ma`), CNAME dans Cloudflare |
| Code | **GitHub** (dépôt privé) |
| Développement | **Claude Code**, sessions cloud pour les gros blocs autonomes, MacBook pour les tests |
| Compilation de l'APK | **GitHub Actions** à chaque push (à valider par un test) ; le Mac n'est pas obligatoire |
| Mode hors-ligne | **Léger** : base locale + synchronisation au retour du réseau |
| Suivi des plantages | **Sentry** (palier gratuit) |
| Connexion | Compte créé par l'administrateur ; l'agent ouvre l'appli et se connecte |
| Multi-marchés | Un identifiant de marché sur toutes les données, droits d'accès (RLS Supabase) par marché et par rôle |
| Cartes et zones | Données géographiques dans **PostGIS** ; affichage avec une bibliothèque de cartes ouverte (type MapLibre), fond de carte à choisir |
| Impression de cartes | PDF généré côté panneau web (zone colorée, légende, échelle, coordonnées) |

## 6. Comptes et accès

- **Adresse dédiée au projet : `stepag.app@gmail.com`** (compte Google « STEPAG APP », créé), utilisée pour créer les comptes Supabase, GitHub, Vercel, Cloudflare
- **Double authentification** activée partout (application d'authentification ou passkey de préférence au SMS) ; codes de secours conservés hors ligne ; aucun mot de passe écrit dans ce fichier
- Adresse de récupération et numéro de téléphone personnels déjà renseignés sur le compte Google

### État d'avancement des comptes
- [x] Compte Google dédié créé (`stepag.app@gmail.com`)
- [ ] Sécurisation du compte Google (2FA, passkey, codes de secours, contrôle de sécurité)
- [x] **GitHub** : compte `stepag-app` créé ; dépôt **`stepag-app/suivi-fuites`**, **privé**, branche `main`, avec README.md et .gitignore Node, sans licence
- [ ] 2FA GitHub activée (le mot de passe était en cours de définition)
- [x] **Supabase** : compte créé via la connexion GitHub `stepag-app`
- [x] Supabase : organisation `STEPAG` (plan gratuit) et projet `suivi-fuites` **créés**, état Healthy, région **West EU (Paris)**, compute Nano ; intégration GitHub de Supabase non activée ; tableau de bord : **aucune sauvegarde** (« No backups ») → backup maison indispensable ; mot de passe de base à ranger dans le gestionnaire de mots de passe
- [x] 2FA Supabase activée (Google Authenticator) ; [ ] ajouter une **seconde application** d'authentification de secours
- [~] Cloudflare : compte créé avec `stepag.app@gmail.com`, 2FA en cours d'activation ; codes de récupération à conserver **hors ligne** (jamais dans le dépôt, ni dans le chat) ; à régénérer une fois la configuration terminée
- [ ] Cloudflare R2 activé et bucket privé `suivi-fuites-photos` créé : **bloqué**, carte bancaire refusée au paiement ; en attente de la carte physique
- [x] **Vercel** : équipe `STEPAG` (plan **Hobby**) créée, `vercel.com/stepag`, connectée via GitHub `stepag-app` ; **décision d'Issam** : rester en gratuit maintenant, puis passer à **Vercel Pro** (mise à niveau sur place, sans migration) dès que la carte bancaire est récupérée et **avant toute mise en production pour le client** (le plan Hobby est réservé à un usage non commercial) ; aucun projet importé pour l'instant
- [ ] Claude Code connecté au dépôt GitHub
- [ ] Crédit cloud Claude réclamé (à vérifier avant le 7 octobre)
- Prévoir une **tablette Samsung de test** pour le développement

## 7. Gestion des photos (règles)

1. Redimensionnement et compression immédiats (≈ 1 600 px, qualité 70)
2. Stockage dans le **dossier privé de l'appli**, jamais dans la galerie
3. Envoi vers R2 dès qu'il y a du réseau, avec reprises automatiques
4. Suppression sur la tablette **seulement après confirmation de l'envoi**
5. Purge progressive des anciennes photos sur R2 possible après 6 à 7 mois (les rapports PDF contiennent déjà les images)

Volume estimé : 30 à 48 photos/jour, lundi à samedi, ≈ 302 jours ouvrés → **environ 2 à 7 Go** sur 12 mois, sous les 10 Go gratuits de R2.

## 8. Suivi GPS permanent (règles)

- Android impose une **notification permanente** pendant le suivi en arrière-plan
- Fréquence réglable (ex. un point tous les 15-20 m ou toutes les 30 s en mouvement) pour limiter la batterie
- **Optimisation batterie Samsung** : exclure l'appli sur chaque tablette (sinon elle est endormie)
- Stocker **un tracé par agent et par jour**, pas un point par ligne : un point toutes les 15 s pour 10 agents (hypothèse) donnerait ≈ 5,8 millions de lignes sur l'année, ce qui dépasserait les 500 Mo du Supabase gratuit

## 9. Budget

- Budget total : **100 USD** pour l'application
- Supabase gratuit : 500 Mo de base, 1 Go de fichiers, pause après 7 jours d'inactivité, sauvegardes automatiques probablement absentes (à vérifier)
- Supabase Pro : 25 USD/mois, soit 300 USD sur 12 mois (**dépasse le budget**)
- Cloudflare R2 : gratuit dans notre volume
- Sentry, GitHub Actions, Vercel : paliers gratuits à confirmer selon l'usage
- Domaine : déjà possédé (stepag.ma)

## 10. Points ouverts à trancher

1. **Supabase gratuit ou Pro ?** Dépend du volume des tracés GPS et du besoin de sauvegardes. Si gratuit : **backup maison** (export SQL planifié vers R2) dès le départ. Le tableau de bord confirme qu'aucune sauvegarde n'existe sur le plan gratuit.
2. **Nombre d'agents et fréquence GPS** réels, pour dimensionner la base.
3. **Structure de la base** : fuites, statuts, tournées / références SRM, utilisateurs, rôles, photos, tracés GPS, bordereau des prix, attachements.
4. **Import des plans** AutoCAD / PDF : format d'exploitation (GeoJSON, tuiles, fond de carte).
5. **Format exact** des états journaliers / hebdomadaires de la SRM et du bordereau des prix.
6. **Moyen de notification** : push mobile, e-mail, ou les deux.
7. **Mise à jour des APK** sur les tablettes (manuelle ou mécanisme intégré).
8. **Compilation APK via GitHub Actions** : valider avec un premier test.
9. **Fond de carte** : fond **minimal, sans satellite** (rues et noms), basé sur OpenStreetMap, pour les tracés, les tirages et les coordonnées. Pistes : fournisseur de tuiles, ou fichier de tuiles PMTiles de la région hébergé sur R2 (à tester, permettrait aussi l'usage hors-ligne).
10. **Système de coordonnées des plans AutoCAD** : probablement un Lambert marocain (à confirmer), à convertir en GPS (WGS84) à l'import.
11. **Plans PDF existants** (planches A3 ou plus, probablement des captures de carte) : décider entre (a) simple fond de référence, avec zones dessinées directement dans l'appli, ou (b) **calibration** (géoréférencement) des planches avec 3 à 4 points de contrôle par planche, en superposition sur la carte. À tester sur 1 ou 2 planches, avec contrôle de précision sur le terrain. Si (b) est retenu, ajouter un outil de calibration dans le panneau web. Si le réseau est dessiné dans l'AutoCAD, privilégier l'export DWG/DXF vers GeoJSON.
12. **Gabarit d'impression** : contenu exact exigé par la SRM (échelle, légende, cartouche, coordonnées).
13. **Isolation entre marchés** : bordereau des prix, rapports et agents séparés par marché ; règles de partage éventuelles.
14. **Hébergement du panneau web** : **tranché** : Vercel Hobby pendant le développement, puis Vercel Pro (environ 20 USD/mois, à intégrer au budget) avant la mise en production. Pas d'aller-retour entre plateformes.
15. **Stockage des photos** : Supabase Storage (1 Go) pour démarrer, puis R2 dès que la carte bancaire est disponible.

## 11. Consignes pour Claude Code

- Privilégier la **simplicité** et la **robustesse terrain** (réseau parfois lent, utilisateurs peu techniques)
- Interface en **français**, grands boutons, parcours courts, design soigné mais sobre
- Priorité : fluidité, faible consommation d'énergie, minimum de bugs
- Sécurité : Row Level Security Supabase par rôle, aucune clé secrète côté client
- Supabase : **RLS activée sur toutes les tables**, accès refusé par défaut ; privilèges de l'API de données accordés **explicitement** table par table dans les migrations (pas d'exposition automatique des nouvelles tables) ; la clé `service_role` n'est jamais utilisée dans l'APK ni dans le panneau web côté client
- Premier objectif : **noyau fonctionnel** (connexion, signaler une fuite avec GPS et photo, liste, statuts), puis itérations avec les retours terrain
- Ne pas démarrer le développement tant que les points ouverts bloquants ne sont pas validés avec Issam
- Poser des questions plutôt que supposer sur les règles métier de la SRM

## 12. Choix de travail (Issam)

- **Planches PDF** : traitées plus tard, pas dans le dépôt pour l'instant
- **CLAUDE.md** : sera déposé à la racine du dépôt `suivi-fuites` une fois finalisé (pas encore envoyé)
- **Compte Claude Max** : partagé avec une application de paie en cours pour un client ; la **priorité reste au client** si la limite hebdomadaire approche ; développement de l'appli fuites en sessions cloud, avec le crédit de 250 $ (à vérifier)
- **Secrets** : aucune clé ni mot de passe dans le chat ni dans le dépôt ; tout va dans des fichiers `.env` ignorés par git et dans le gestionnaire de mots de passe
- **Ordre de mise en place** : GitHub, Supabase, Cloudflare R2, Vercel, connexion de Claude Code, puis premier noyau fonctionnel (connexion, fuite avec GPS et photo, liste, statuts)
- **Langue** : échanges et interface de l'application en français

## 13. Fichiers à ne jamais versionner (.gitignore)

Le .gitignore Node de GitHub couvre déjà `.env` et `node_modules`. À ajouter à la racine du dépôt :

```gitignore
# Secrets et clés
.env
.env.*
!.env.example
*.pem
*.key
secrets/
recovery-codes*
*recovery*codes*

# Signature Android (ne jamais perdre ni publier)
*.jks
*.keystore
keystore.properties

# Binaires et builds
*.apk
*.aab
android/app/build/
.expo/

# Exports de base de données et sauvegardes
*.sql
*.dump
backups/

# Supabase local
supabase/.temp/
supabase/.branches/

# Données volumineuses ou sensibles (planches, plans, photos)
data-private/
planches/
```

Règles pour Claude Code :
- Ne jamais écrire de mot de passe, clé API, clé `service_role`, code de récupération ou keystore dans un fichier versionné
- Fournir un `.env.example` avec des valeurs vides ; les vraies valeurs restent dans `.env` (local) et dans les variables d'environnement de Vercel et GitHub Actions
- Sauvegarder le keystore Android **hors du dépôt**, en deux copies (sans lui, les mises à jour de l'APK deviennent impossibles)

## 14. Passation entre sessions

- **Lire en début de session** : `docs/etat-avancement.md` (fait, en attente, décisions, prochaines étapes, prompt de reprise) et `supabase/README.md` (schéma, déploiement, règles des migrations).
- **Règles du marché 4500004453** : `references/regles-marche-4500004453.md` (source unique ; les documents originaux ne sont pas dans le dépôt).
- **Plan du réseau `Reseau aep oujda.dwg`** : **en attente**, transmis plus tard par Issam. Ne pas commencer la migration 2 (tronçons, balayage, débits) sans lui ; voir `docs/etat-avancement.md` § 4.
- **Fin de session** : mettre à jour `docs/etat-avancement.md`.
