# Application Android (Expo, React Native, TypeScript)

Socle de l'APK pour les tablettes Samsung. Même base Supabase et mêmes règles (RLS) que le panneau web :
aucun secret dans l'application, uniquement l'adresse du projet et la clé « anon » (publique).

## Ce que fait ce socle

| Écran | Contenu |
|---|---|
| Connexion | identifiant + mot de passe (compte créé par l'administrateur) |
| Liste | fuites du marché (statut, secteur, alerte 48 h), tirer pour rafraîchir ; sinon mise à jour **en silence** (sans le rond de rafraîchissement, rien de redessiné si rien n'a changé) toutes les 5 min, au retour sur l'appli et après un envoi ; dernière liste gardée sur la tablette, affichée dès l'ouverture puis remplacée par celle du serveur ; chargement abandonné après 20 s sans réponse, attente du jeton comprise (« Hors ligne : dernière liste connue ») ; choix du marché (mémorisé) si le compte en a plusieurs ; fuites saisies hors ligne en tête ; un appui ouvre la fiche ; **onglets par statut** avec compteurs et **recherche** (N° exact, référence, aussi par ses chiffres, adresse), comme le panneau, faits sur la tablette sans requête de plus ; tableau en paysage, lignes empilées en portrait |
| Nouvelle fuite (F1 à F5) | GPS ; **champs exigés** par le marché (`marches.champs_obligatoires_fuite` ; liste vide, comme aujourd'hui pour SRM et DEMO : règle F1 par défaut, tournée, secteur, ouvrage, visibilité, **nature de dégradation**), marqués « * » et encadrés en rouge s'ils manquent ; adresse facultative ; conduite (matériau, diamètre de la liste du marché) facultative ; photos facultatives avec avertissement « Enregistrer sans photo ? » (redimensionnées à 1 600 px, qualité 70, dossier privé de l'appli, jamais la galerie) ; **suggestions à valider d'un toucher** (`suggestions_localisation`, S2) : rues (« Rues : © OpenStreetMap »), secteur, conduite la plus proche (matériau, diamètre, tronçon), jamais pré-remplies, rayon selon la précision GPS, rien sans réseau ; **mini-carte** du panneau (page `/mini-carte` de S10, contrat `docs/lots/chantier-v2-mini-carte.md`, en plein écran dans une WebView avec la session de la tablette, après une sonde de `/session` comme le Balayage) : épingle déplaçable, conduite la plus proche en surbrillance ; « Valider la position » remplace la position et apporte les suggestions de l'épingle (toujours à accepter d'un toucher) ; retour Android = annuler ; bouton absent sans réseau ou si le jeton expire dans moins de 10 min ; **contrôle des doublons** (`rechercher_fuites_proches`) : « C'est la même fuite » ouvre la fiche existante, « Nouvelle fuite liée » remplit `fuite_liee_id` ; sans réseau, pas de contrôle (signalé). Même écran pour **modifier** une fuite pas encore validée (auteur) |
| Fiche d'une fuite | informations (visibilité, nature de dégradation, conduite), statut, photos (vignettes), réparations et réfections (serveur + saisies encore sur la tablette) ; dernière version gardée sur la tablette, affichée aussitôt puis remplacée par celle du serveur ; **jamais de prix ni de quantités du bordereau** ; **jamais les corrections du bureau** pour le terrain (R7 : pièces lues dans `v_pieces_terrain` ; `reparation_pieces` pour le droit « interventions / valider ») ; **validation par étape** (V1, V2) : badge « À valider » ou « Validée le … » sur la détection, chaque réparation, chaque réfection ; « Modifier » tant que l'étape n'est pas validée (auteur, portée « siennes ») ; validée : ajout seulement (droit « valider » excepté) ; bouton « Valider » pour le responsable (avec réseau, avertissement « aucune photo ») ; **photos** (V3) : un toucher change le type ou retire la photo (retrait logique, fichier gardé) selon les règles de la base (photo antérieure à la validation de son étape : responsable seulement) ; fuite verrouillée par un lot arrêté (V6) : ajouts permis (réparation, réfection, photos), le reste réservé au responsable ; bouton **« Y aller »** (aussi sur chaque ligne de la liste) : ouvre l'application de cartes de la tablette (Google Maps, Waze…) avec la fuite pour destination, repli sur le lien Google Maps ; grisé sans position ; boutons photo selon le droit « photos / créer » (photo de la fuite, avant / pendant / après sous chaque réparation, réfection sous chaque réfection ; masqués sur une fuite verrouillée sans « photos / valider ») ; **Modifier la réparation** selon « interventions / modifier » (portée « siennes » : auteur terrain ou compte de saisie), masqué sur une fuite verrouillée |
| Saisir une réparation (P1 à P8) | **formulaire séquentiel**, étapes numérotées : 1 résultat (réparée, en cours, non réparée + motif ; non réparée : fouille, travaux et pièces restent saisis et attachés), 2 ouvrage ou matériau (proposition « Comme à la détection » si la fuite a sa conduite), 3 **diamètre en liste selon le matériau** (`diametres_materiau`, « Autre » pour une valeur hors liste), 4 travaux réalisés (cases) et longueur de conduite posée, 5 fouille L × l × p en mètres, 6 revêtement à refaire, 7 emplacement, 8 **pièces posées en capsules** (articles proposés selon le diamètre et le matériau lus dans la désignation, puis les plus posés sur le marché ; un toucher ajoute, « − / + » règle la quantité ; recherche gardée pour le reste) ; puis **date et heure** proposées (calendrier et horloge d'Android), équipe, **représentant** en liste (`representants_srm`, facultatif), ouvriers, photos avant / pendant / après, observation ; **gardes-fous** (avertissements, jamais bloquants) : fouille au-delà de 10 / 3 / 3 m (« 0,80 et non 80 »), fouille > 2 m sans élément remplacé, conduite posée plus courte que la plus petite ou plus longue que la plus grande dimension de la fouille ; « Vérifier et enregistrer » ouvre le **récapitulatif** (tout ce qui sera enregistré, avertissements) : « Corriger » ou « Confirmer ». Même écran, pré-rempli, pour **modifier** une réparation pas encore validée |
| Saisir une réfection | faite (nature, longueur et largeur reprises de la fouille si vides) ou non faite + motif ; date et heure au calendrier, équipe, photos de réfection ; gardes-fous (P9) : réfection > 30 m², total des réfections de la fuite inférieur au total de ses fouilles ; récapitulatif ; **modifier** une réfection pas encore validée. Bouton selon le droit **« refections / créer »** (rôle Réfection, R1) |
| À valider (V1) | bouton « À valider (n) » de la liste pour qui peut valider (responsable, administrateur) : détections, réparations, réfections du marché pas encore validées (`v_a_valider`), toutes cochées d'office ; « **Valider (n)** » (`valider_etapes`) ; « Aucune photo » signalé, avec avertissement avant de valider ; un toucher ouvre la fiche (pour ajouter une photo) ; avec réseau seulement |
| Notifications (N1, N2) | cloche de la barre de la liste avec pastille (non lues, « 9+ ») ; écran des 30 dernières (non lue = point bleu), tout marqué lu à l'ouverture et rideau vidé ; texte dans la langue de la tablette ; **push Android** (expo-notifications, Firebase) : rideau même appli fermée, toucher = fiche de la fuite (dans son marché), notification marquée lue et retirée du rideau |
| Mise à jour (X2) | « Nouvelle version x disponible » en tête de la liste quand la CI a publié une APK plus récente (contrôle à l'ouverture et au retour sur l'appli, au plus toutes les 6 h, avec réseau) : téléchargement (progression) puis installateur d'Android ; données et envois en attente gardés |
| Balayage | bouton « Balayage » de la liste (droit « balayage / lire ») : carte du réseau du panneau web dans une **WebView** (`react-native-webview` 13.16.1), ouverte avec la session de la tablette par `/session#access_token=…&refresh_token=…` (jetons dans le fragment, jamais en paramètre ni journalisés), directement en **mode balayage** (toucher, lasso, prolonger, enregistrer ; file d'attente hors ligne du panneau) ; position GPS autorisée ; seuls les liens du panneau restent dans la WebView (itinéraire Google Maps : application de cartes) ; retour Android : historique de la WebView puis liste ; avant d'ouvrir la carte, la tablette vérifie que le panneau répond (simple GET de `/session`, 15 s au plus ; pas de HEAD, dont la réponse arrive après une dizaine de secondes sur la tablette) ; sans réseau : « La carte du réseau a besoin de la connexion » et « Réessayer » ; la tablette renouvelle elle-même la session 5 min avant l'échéance et recharge la carte (environ une fois par heure). Adresse du panneau : `EXPO_PUBLIC_WEB_URL` (défaut `https://fuites.stepag.ma`) |
| Suivi GPS (X6) | bouton « Suivi GPS » de la liste (et bandeau « Le suivi de position n'est pas actif » tant qu'il ne tourne pas) : **tâche de fond** d'`expo-location` (`src/suivi-gps.ts`, service de premier plan Android avec **notification permanente**, tâche définie par `index.ts` pour tourner aussi quand Android réveille l'appli sans écran) démarrée à la connexion tant que la session est ouverte et que les autorisations sont accordées, arrêtée à « Quitter » après un dernier envoi (5 s au plus) ; mesure au plus toutes les 10 s et après 5 m de déplacement (filtre natif, rien ne part à l'arrêt), puis filtre de l'appli (`src/suivi-gps-regles.ts`) : **un point tous les 15 m, ou toutes les 30 s si l'agent se déplace** (plus de 8 m et plus que la précision annoncée), précision supérieure à 50 m et sauts de plus de 200 km/h écartés ; points `[t, lon, lat]` gardés **sur la tablette** (file de 20 000 points au plus, 7 jours) puis envoyés **par paquets de 500** (`ajouter_points_trace`), au plus toutes les 2 min en arrière-plan, aussitôt au retour sur l'appli et à « Quitter » ; coupure : tout reste, repart sans doublon (la base ignore un point déjà reçu) ; refus définitif de la base (plus affecté, marché désactivé) : paquet abandonné ; les points d'un agent ne partent jamais sous un autre compte. **Écran d'activation** : état, texte d'explication (qui voit le tracé), « Activer le suivi » (position, puis « Toujours autoriser » dans les réglages d'Android 11 et plus), « Désactiver le suivi » (choix de la tablette, mémorisé), ouverture des réglages de la tablette et de la batterie, points en attente, dernier envoi, dernière position. Permissions Android posées par le plugin `expo-location` : `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` (vérifié par `expo prebuild`). Libellés dans `src/traductions.ts` (section « Suivi GPS (S11) »), à relire par Issam |
| Envois en attente | toutes les saisies gardées sur la tablette, dans l'ordre ; envoi manuel ; erreurs en clair (ex. fuite verrouillée) ; suppression avec confirmation (une fuite emporte ses réparations et réfections) |

**Droits** : boutons de saisie affichés selon les droits du marché (la base reste juge, `src/regles.ts` reflète ses
règles). Réparation : « interventions / créer » ; réfection : « refections / créer » (rôle Réfection, R1) ; l'agent de
détection voit les fiches sans ces boutons. Refus du serveur traduits en clair (étape validée, photo antérieure à la
validation, champs obligatoires, verrou, droit insuffisant).

**Listes de saisie en arabe** (X4) : ouvrages, matériaux, emplacements, visibilité, résultats, travaux, types de photo
lus dans `libelles_listes` (S2), natures et motifs dans leurs colonnes `libelle_ar`, gardés avec les paramètres ; en
hybride, les choix restent en français (règle d'Issam). Les 121 nouveaux libellés de l'APK sont dans
`src/traductions.ts` (section « Chantier v2 (S7) »), à relire par Issam.

**Session hors ligne** (`src/session-donnees.ts`) : la session reste sur la tablette jusqu'à « Quitter ». Au démarrage
avec un jeton expiré (plus d'une heure) ou presque (moins de 90 s, marge d'auth-js), auth-js tente d'abord de le
renouveler : sans réseau, ses reprises durent près de 25 s (davantage quand le DNS échoue lentement), puis
`getSession()` rend `null`. Avant le 2026-10-07 : écran Connexion, puis (PR #56) liste au bout de 25 s à 1 min 40.
L'appli n'attend plus que 1,5 s (`DELAI_DEPART_MS`) : passé ce délai, la session gardée (`CLE_SESSION`, clé par
défaut de supabase-js) est rendue, « jeton à renouveler », et l'appli s'ouvre sur les copies de la tablette.
- **Copies d'abord, puis serveur** : contexte (profil, marchés, droits), liste (`src/liste-donnees.ts`), fiches,
  paramètres de saisie, secteurs. Avec un jeton valide, la réponse du serveur remplace la copie à son arrivée.
- **Jeton à renouveler** : aucune requête ne part, car elle attendrait les reprises d'auth-js puis partirait avec la
  clé anonyme, sans aucun droit. Bandeau « Hors ligne » aussitôt, pas de contrôle des doublons. La synchro de la
  file d'attente rend la main tout de suite (jeton gardé expiré : `getSession()` n'est pas appelé).
- **Suite** : les événements d'auth-js. `TOKEN_REFRESHED` (minuteur toutes les 30 s au premier plan, pause de 60 s
  après un échec, essai aussitôt au retour sur l'appli, rien en arrière-plan : `AppState`, `src/supabase.ts`) : la
  file repart, contexte et liste sont rechargés du serveur. `SIGNED_OUT` (jeton révoqué) : écran Connexion.
- Un refus reçu pendant que le jeton expirait n'est pas compté : la saisie repart ensuite.
- **« Quitter » sans réseau** : la session est retirée de la tablette sans appel au serveur, avec retour immédiat à
  l'écran Connexion, même pendant les reprises d'auth-js.

**Hors ligne** (`src/file-attente.ts`) : chaque saisie (fuite, réparation, réfection) et ses photos sont
d'abord écrites sur la tablette, puis envoyées (ouverture de l'appli, retour au premier plan, toutes les 30 s,
juste après l'enregistrement). Les écrans (liste, fiche, envois en attente) ne rechargent qu'à un vrai changement de
la file : la synchro des 30 s sans rien à envoyer ne fait ni requête ni rechargement (avant le 2026-10-07, elle
rechargeait la liste toutes les 30 s, rond de rafraîchissement compris : CPU de la tablette sollicité en continu).
Les identifiants sont créés sur l'appareil, donc un renvoi ne crée pas de doublon ;
les étapes confirmées sont notées (reprise après coupure) ; les fichiers locaux ne sont supprimés qu'après
confirmation du serveur. Ordre respecté : fuite → réparation → pièces / ouvriers → photos → réfection → photos ;
une saisie refusée bloque les suivantes **de la même fuite** (les autres partent). Paramètres de saisie (natures,
motifs, équipes, ouvriers du marché ; articles Dolibarr activés) gardés par marché (`src/parametres.ts`). Rien n'est recalculé sur la
tablette : statut de la fuite et lignes de quantités avancent côté serveur (déclencheurs).
Deux envois de plus : `photos` (ajoutées depuis la fiche) et `modification` (seulement les changements d'une
réparation, `src/modification.ts` : champs, pièces ajoutées / retirées / requantifiées, ouvriers ajoutés / retirés ;
chaque étape rejouable sans effet de plus) ; ils partent après la saisie qu'ils complètent si elle attend encore ;
abandonner une réparation emporte ses modifications et ses photos ajoutées.
**Délai des requêtes** (`src/reseau.ts`, `global.fetch` du client Supabase) : le fetch de l'APK n'en avait aucun, et une
requête restée sans réponse (connexion 4G morte) bloquait la synchro, une seule à la fois, jusqu'à l'expiration TCP
(souvent un quart d'heure). Toute requête est abandonnée après **60 s**, **3 min** pour l'envoi d'une photo ; l'abandon
compte comme une coupure : la saisie reste sur la tablette, sans message, et repart à la synchro suivante. Une requête
qui porte déjà son propre signal d'abandon le garde (liste des fuites : 20 s).
Côté natif, `plugins/okhttp-delais.js` (posé par `expo prebuild` dans `MainApplication.kt`) donne au client OkHttp
(fetch, images) des délais d'**inactivité** : connexion 10 s, lecture et écriture **15 s**, 60 s pour un corps de plus de
16 Ko (photos). Dépassé, un délai fait écarter la connexion HTTP/2 morte (PING sans réponse en 1 s) : la requête
suivante en ouvre une neuve. Un abandon par JavaScript, lui, la laisse en place pour les requêtes suivantes : les délais
natifs sont donc plus courts que ceux ci-dessus, pour tomber avant eux. Pas de PING régulier (radio 4G, batterie).

**Style** : celui du panneau web, interface « Studio Admin » (shadcn/ui, depuis le 2026-10-07 ; maquettes validées par
Issam : liste en tableau comme le panneau, fiche sur une seule page). Jetons de `web/src/app/globals.css` (préréglage
« default », mode clair) et couleurs des statuts de `web/src/components/statut.tsx`, convertis en hexadécimal dans
`src/ui.tsx` : barre blanche, fond blanc, cartes à bord gris fin (rayon 14), bouton principal noir, boutons à contour,
bouton destructif rouge pâle, badges de statut et d'alerte (point coloré sur fond teinté), anneau d'avancement sur la
fiche, messages encadrés avec icône. Police **Geist** du panneau (`@expo-google-fonts/geist`, graisses 400 à 700,
embarquée à la compilation par le module `expo-font` déclaré dans `app.json`) ; icônes **Lucide** du panneau, recopiées
dans `src/icones.tsx` et dessinées par `react-native-svg`. Commandes de 48 dp au moins, 56 dp pour les actions
principales ; mise en page sur deux colonnes à partir de 900 dp (tablette en paysage). Affichage bord à bord
(Android 15) : marges des barres système par `react-native-safe-area-context`.

**Photos** : tout le cycle (prise, compression 1 600 px / qualité 70, dossier privé, envoi, ligne `photos`
avec `stockage = 'supabase'`, effacement local après confirmation) est dans `src/photos.ts`. Le passage à
Cloudflare R2 (lot dédié) ne changera que `envoyerPhoto`.

**Essai automatique** (`essais/lancer.sh`, pile Supabase locale) : vrai code de la file d'attente, de la fiche
et des paramètres, avec stockage, fichiers et réseau simulés ; 25 vérifications (ordre d'envoi, coupures,
reprise, photos typées et rattachées, réfection reprise de la fouille, statut avancé par le serveur, fuite
verrouillée, doublons, droits détection / chef, aucun prix visible).
Essais **sans pile** (ni Docker ni installation), depuis `mobile/` (Node ≥ 22.18), lancés aussi par la CI de l'APK :
vrai client Supabase (connexion par auth-js, jeton porté par chaque requête, délais de `src/reseau.ts`) ; serveur,
stockage et réseau simulés (`essais/mocks/serveur-simule.js` : une requête sans jeton valide y est refusée comme par
la base).
- `node --import ./essais/substituts.mjs essais/regles-saisie.test.mjs` : règles de `src/regles.ts`, 37 vérifications
  (champs obligatoires, gardes-fous des fouilles et des réfections, pièces proposées, droit de modifier une étape ou une
  photo avant et après validation ou verrou, version publiée, texte des notifications).
- `node --import ./essais/substituts.mjs essais/file-attente-hors-pile.test.mjs` : vrai code de la file d'attente,
  49 vérifications (dont les modifications de champs « maj » : fuite et réfection avant validation, photo retypée ou
  retirée, refus d'une photo d'un collègue) (écrans prévenus seulement à un vrai changement de la file, photos depuis la fiche, modification
  après la création, coupures, renvoi sans doublon, droits, verrou, abandon, requête sans réponse abandonnée au délai
  sur une horloge simulée, jamais la clé anonyme).
- `node --import ./essais/substituts.mjs essais/suivi-gps.test.mjs` : suivi GPS (S11), 42 vérifications : filtre d'un point (15 m, 30 s en mouvement, arrêt, précision, saut), file et paquets de 500, coupure et reprise, points ajoutés pendant un envoi, refus définitif, tâche de fond avec `expo-location` et `expo-task-manager` simulés (autorisations, démarrage, notification permanente, désactivation, « Quitter »), points d'un autre compte jamais envoyés.
- `node --import ./essais/substituts.mjs essais/session-hors-ligne.test.mjs` : démarrage sans réseau avec un jeton
  expiré, sur une horloge simulée, 52 vérifications :
  - durée d'ouverture : liste de la tablette au bout de 1,5 s, contre 25,4 s mesurées pour l'ancien chemin ;
  - « Quitter » et « Enregistrer » pendant les reprises d'auth-js ;
  - rien d'envoyé sans jeton valide, puis envoi après le renouvellement ; arrière-plan et premier plan ;
  - jeton expiré pendant un envoi, refus du serveur, « Quitter » avec et sans réseau ;
  - ouverture avec réseau : jeton valide, expiré renouvelé à temps, réseau lent, refus après le délai, événement
    d'auth-js jamais écrasé par l'état de départ.
  - jeton qui expire pendant l'utilisation sans réseau : à renouveler 90 s avant l'échéance, aucune requête (même
    lancée par un écran pas encore prévenu, même réseau revenu avant le renouvellement), « Quitter » aussitôt au réveil
    de la tablette, retour normal après le renouvellement.

**Pas encore fait** : suppression d'une réparation, corrections du responsable avec motif (position, date de
détection : panneau web, V5), photos du serveur visibles hors ligne, carte native hors ligne (le balayage passe par la WebView et a besoin du réseau ;
les cochages sans réseau attendent dans la file du panneau).

## Développement

```bash
cd mobile
cp .env.example .env     # adresse du projet et clé anon (publique)
npm install
npx expo start           # nécessite Expo Go ou un build de développement
```

`expo install` et `expo-doctor` interrogent des serveurs Expo : les versions des modules natifs se lisent
dans `node_modules/expo/bundledNativeModules.json` si ces serveurs sont inaccessibles.

## Compilation de l'APK (GitHub Actions)

Workflow `.github/workflows/apk.yml` : types, essais sans pile, `expo prebuild`, `gradlew assembleRelease`, APK en
artefact (14 jours). Une fois par dépôt, créer le secret **`EXPO_PUBLIC_SUPABASE_ANON_KEY`** (clé anon, comme pour
Vercel) ; sans lui l'APK se compile mais ne peut pas se connecter.

**Numéro de version** (`app.config.js`) : `versionCode` = numéro du run de la CI (`APK_VERSION_CODE`), nom `1.0.<run>` ;
toujours croissant, une APK plus récente s'installe par-dessus la précédente. Si le workflow est renommé, son numéro de
run repart à 1 : ajouter alors un décalage dans `APK_VERSION_CODE`.

**Publication pour les tablettes** (X2) : sur `main`, une APK signée avec la clé de production est déposée dans le
compartiment privé R2 (`apk/suivi-fuites-<numéro>.apk`, `apk/derniere.json` ; les 3 dernières gardées), avec les
secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (ceux des photos). La fonction serveur
`version-apk` (comptes connectés et actifs) renvoie la dernière version et une URL signée d'une heure.

**Notifications push** (N2) : secret **`GOOGLE_SERVICES_JSON`** (contenu du fichier `google-services.json` de
l'appli Android `ma.stepag.suivifuites` dans Firebase), écrit par la CI dans `mobile/` avant `expo prebuild`, jamais
versionné (`.gitignore`) ; absent, l'APK se compile sans push (aucun jeton enregistré, le reste fonctionne). Côté
serveur : secret **`FIREBASE_SERVICE_ACCOUNT`** (fichier JSON du compte de service, Firebase > Paramètres du projet >
Comptes de service > Générer une clé privée), passé par « Déploiement de la base » à la fonction `envoyer-push`. Celle-ci
est appelée par la base à chaque notification (pg_net) et toutes les 5 min (pg_cron), avec une clé tirée au hasard par
la migration `20261010600000` (aucun secret dans le dépôt) ; elle envoie par FCM (API HTTP v1) les notifications non lues
des 2 dernières heures, une seule fois, en français ou en arabe selon `profils.langue` (tenue à jour par l'APK), et
retire les jetons périmés.

**Architectures** (depuis le 2026-10-07) : bibliothèques natives compilées pour **ARM seulement**, `armeabi-v7a` et
`arm64-v8a` (`buildArchs` d'`expo-build-properties` dans `app.json`, repris dans `reactNativeArchitectures` de
`android/gradle.properties`) : les tablettes Samsung et l'émulateur du Mac sont ARM. Sans x86 ni x86_64, l'APK passe
de 79,0 à 42,6 Mo (bibliothèques ARM inchangées : 17,2 Mo en `arm64-v8a`, 11,9 Mo en `armeabi-v7a`) et la compilation
d'environ 20 à 13 min. Un émulateur x86_64 (PC Windows, Mac Intel) ne la lance que par traduction ARM (images
Android 11 et plus, plus lent) et la refuse sur les images plus anciennes (`INSTALL_FAILED_NO_MATCHING_ABIS`) : pour
un tel essai, rajouter `x86_64` à la liste le temps d'une compilation.

**Bibliothèques natives compressées** (depuis le 2026-10-07) : `useLegacyPackaging: true` d'`expo-build-properties` dans
`app.json`, repris dans `expo.useLegacyPackaging` de `android/gradle.properties`. Les `.so` sont rangés compressés dans
l'APK (`Defl:N` dans `unzip -v`) : bibliothèques ARM de 29,1 à 10,8 Mo, APK de 42,6 à **24,1 Mo**, soit 18,5 Mo de
moins à faire passer sur la tablette (l'artefact zippé de GitHub ne change presque pas, 21,9 puis 21,5 Mo : le zip
compressait déjà les `.so`). Le compromis : Android extrait les bibliothèques à l'installation (`extractNativeLibs`),
mais seulement celles de l'architecture de l'appareil, 17,2 Mo en `arm64-v8a` (11,9 Mo sur un Android 32 bits) ; l'APK
qu'il garde ayant maigri de 18,5 Mo, la place prise par l'appli ne grossit pas (émulateur : APK et bibliothèques de
42,6 à 41,2 Mo, taille de l'appli dans les Réglages de 65,9 à 64,8 Mo). L'extraction prend de 0,2 à 2,9 s selon la
charge de l'émulateur (journal d'Android) ; la durée d'installation dépend surtout de la compilation du code par
Android, la même pour les deux versions, et le démarrage à froid ne change pas de façon mesurable (comparaison
alternée sur l'émulateur : médiane 2,6 s contre 3,6 s avant, de 1,2 à 4,6 s d'un essai à l'autre). Pour revenir aux
`.so` non compressés : retirer la clé (ou la mettre à `false`).

L'APK est **signée avec la clé de production STEPAG** (secrets `ANDROID_KEYSTORE_*`, depuis le 2026-10-07) ; sans ces
secrets, avec la clé de test d'Expo (une APK de test ne s'installe pas par-dessus une APK de production, et inversement).

## Installation sur la tablette

Télécharger l'artefact `suivi-fuites-apk` (onglet Actions du dépôt), le copier sur la tablette, autoriser
l'installation depuis cette source.

### Suivi GPS : à faire sur chaque tablette Samsung

1. À la première connexion, ouvrir **Suivi GPS** (bouton de la liste), « Activer le suivi », accepter la position puis
   choisir **« Toujours autoriser »** (Android 11 et plus : la fenêtre renvoie aux réglages de l'appli > Autorisations >
   Position). Accepter aussi les notifications.
2. **Exclure l'appli de l'optimisation de la batterie**, sinon Samsung endort le suivi quand l'écran s'éteint :
   Réglages > Batterie (ou « Entretien de l'appareil » > Batterie) > **Limites d'utilisation en arrière-plan** >
   **Applications jamais en veille** > ajouter « Suivi des fuites ». Aussi : Réglages > Applications > Suivi des fuites >
   Batterie > **Non restreinte**. Le bouton « Ouvrir les réglages de la batterie » de l'écran Suivi GPS ouvre la liste
   d'Android. À refaire après une réinstallation (pas après une mise à jour).
3. Laisser la **notification permanente** (« Suivi de position actif ») : Android l'impose tant que le suivi tourne ; elle
   disparaît avec « Quitter ». Le service est déclaré pour survivre à la fermeture de l'écran de l'appli
   (`killServiceOnDestroy: false`) ; « Tout fermer » de One UI peut malgré tout l'arrêter (à vérifier sur une vraie tablette) :
   il repart à la prochaine ouverture de l'appli.
4. Redémarrage de la tablette : le suivi repart à la prochaine ouverture de l'appli (Android ne relance pas une tâche de
   fond au démarrage). Informer les agents du suivi avant la mise en service (décision d'Issam : pas de déclaration CNDP).

**Pas mesuré** (aucune tablette réelle au 2026-10-09) : consommation de batterie sur une journée, fiabilité du service sur
One UI, précision en rue étroite. Réglages à ajuster alors dans `src/suivi-gps.ts` (`timeInterval`, `distanceInterval`,
précision `High`) et `src/suivi-gps-regles.ts` (15 m, 30 s, 8 m, 50 m).

## Photos : stockage

`src/photos.ts` regroupe tout : prise (1 600 px, qualité 70, dossier privé), dépôt et lecture. Le dépôt demande une URL
signée à la fonction serveur `photos-r2` et envoie le fichier tel quel dans le compartiment privé Cloudflare R2
(`FileSystem.uploadAsync`, sans passer par la mémoire) ; si R2 n'est pas configuré ou refuse, repli sur Supabase Storage.
La ligne `photos` porte le `stockage` réel ; `urlsPhotos` lit les deux. Aucune clé R2 dans l'APK.
