# Application Android (Expo, React Native, TypeScript)

Socle de l'APK pour les tablettes Samsung. Même base Supabase et mêmes règles (RLS) que le panneau web :
aucun secret dans l'application, uniquement l'adresse du projet et la clé « anon » (publique).

## Ce que fait ce socle

| Écran | Contenu |
|---|---|
| Connexion | identifiant + mot de passe (compte créé par l'administrateur) |
| Liste | fuites du marché (statut, secteur, alerte 48 h), tirer pour rafraîchir ; sinon mise à jour **en silence** (sans le rond de rafraîchissement, rien de redessiné si rien n'a changé) toutes les 5 min, au retour sur l'appli et après un envoi ; chargement abandonné après 20 s sans réponse (dernière liste connue) ; dernière liste gardée hors ligne ; choix du marché (mémorisé) si le compte en a plusieurs ; fuites saisies hors ligne en tête ; un appui ouvre la fiche ; **onglets par statut** avec compteurs et **recherche** (N° exact, référence, aussi par ses chiffres, adresse), comme le panneau, faits sur la tablette sans requête de plus ; tableau en paysage, lignes empilées en portrait |
| Nouvelle fuite | GPS, référence SRM, secteur, adresse, observation, photos (redimensionnées à 1 600 px, qualité 70, stockées dans le dossier privé de l'appli, jamais dans la galerie) ; **contrôle des doublons** (`rechercher_fuites_proches`) : « C'est la même fuite » ouvre la fiche existante, « Nouvelle fuite liée » remplit `fuite_liee_id` ; sans réseau, pas de contrôle (signalé) |
| Fiche d'une fuite | informations, statut, photos (vignettes), réparations et réfections (serveur + saisies encore sur la tablette) ; dernière version gardée hors ligne ; **jamais de prix ni de quantités du bordereau** ; fuite verrouillée par un lot arrêté : saisie masquée (sauf droit « valider ») ; bouton **« Y aller »** (aussi sur chaque ligne de la liste) : ouvre l'application de cartes de la tablette (Google Maps, Waze…) avec la fuite pour destination, repli sur le lien Google Maps ; grisé sans position ; boutons photo selon le droit « photos / créer » (photo de la fuite, avant / pendant / après sous chaque réparation, réfection sous chaque réfection ; masqués sur une fuite verrouillée sans « photos / valider ») ; **Modifier la réparation** selon « interventions / modifier » (portée « siennes » : auteur terrain ou compte de saisie), masqué sur une fuite verrouillée |
| Saisir une réparation | résultat (réparée, en cours, non réparée + motif), date et heure, équipe, ouvrage, matériau, diamètre, travaux (cases), longueur PE, fouille L × l × p (alerte > 2 m), revêtement à refaire, emplacement, représentant du maître d'ouvrage, pièces posées (recherche dans les articles Dolibarr activés, quantité ; plus de désignation libre : un article absent se note en observation), ouvriers, observation, photos avant / pendant / après ; même écran, pré-rempli, pour **modifier** une réparation envoyée (quantités modifiables ; retrait d'une pièce déjà envoyée seulement avec « interventions / supprimer », que le chef n'a pas) |
| Saisir une réfection | faite (nature, longueur et largeur reprises de la fouille si vides) ou non faite + motif ; date, équipe, photos de réfection |
| Balayage | bouton « Balayage » de la liste (droit « balayage / lire ») : carte du réseau du panneau web dans une **WebView** (`react-native-webview` 13.16.1), ouverte avec la session de la tablette par `/session#access_token=…&refresh_token=…` (jetons dans le fragment, jamais en paramètre ni journalisés), directement en **mode balayage** (toucher, lasso, prolonger, enregistrer ; file d'attente hors ligne du panneau) ; position GPS autorisée ; seuls les liens du panneau restent dans la WebView (itinéraire Google Maps : application de cartes) ; retour Android : historique de la WebView puis liste ; avant d'ouvrir la carte, la tablette vérifie que le panneau répond (simple GET de `/session`, 15 s au plus ; pas de HEAD, dont la réponse arrive après une dizaine de secondes sur la tablette) ; sans réseau : « La carte du réseau a besoin de la connexion » et « Réessayer » ; la tablette renouvelle elle-même la session 5 min avant l'échéance et recharge la carte (environ une fois par heure). Adresse du panneau : `EXPO_PUBLIC_WEB_URL` (défaut `https://fuites.stepag.ma`) |
| Envois en attente | toutes les saisies gardées sur la tablette, dans l'ordre ; envoi manuel ; erreurs en clair (ex. fuite verrouillée) ; suppression avec confirmation (une fuite emporte ses réparations et réfections) |

**Droits** : boutons de saisie affichés selon les droits du marché. Le chef de réparation (fuites, interventions,
photos) saisit ; l'agent de détection (interventions en lecture) voit les fiches sans les boutons.

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
Essai **sans pile** (ni Docker ni installation) : `node --import ./essais/substituts.mjs essais/file-attente-hors-pile.test.mjs`
depuis `mobile/` (Node ≥ 22.18) : vrai code de la file d'attente, base, stockage et réseau simulés
(`essais/mocks/supabase-simule.js`) ; 32 vérifications (écrans prévenus seulement à un vrai changement de la file,
photos depuis la fiche, modification après la création,
coupures, renvoi sans doublon, droits, verrou, abandon).

**Pas encore fait** : suppression d'une réparation ou d'une photo, modification d'une réfection (panneau web),
photos du serveur visibles hors ligne, suivi GPS en arrière-plan (M4), notifications
push, mise à jour intégrée de l'APK, carte native hors ligne (le balayage passe par la WebView et a besoin du réseau ;
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

Workflow `.github/workflows/apk.yml` : types, `expo prebuild`, `gradlew assembleRelease`, APK en artefact
(14 jours). Une fois par dépôt, créer le secret **`EXPO_PUBLIC_SUPABASE_ANON_KEY`** (clé anon, comme pour
Vercel) ; sans lui l'APK se compile mais ne peut pas se connecter.

**Architectures** (depuis le 2026-10-07) : bibliothèques natives compilées pour **ARM seulement**, `armeabi-v7a` et
`arm64-v8a` (`buildArchs` d'`expo-build-properties` dans `app.json`, repris dans `reactNativeArchitectures` de
`android/gradle.properties`) : les tablettes Samsung et l'émulateur du Mac sont ARM. Sans x86 ni x86_64, l'APK passe
de 79,0 à 42,6 Mo (bibliothèques ARM inchangées : 17,2 Mo en `arm64-v8a`, 11,9 Mo en `armeabi-v7a`) et la compilation
d'environ 20 à 13 min. Un émulateur x86_64 (PC Windows, Mac Intel) ne la lance que par traduction ARM (images
Android 11 et plus, plus lent) et la refuse sur les images plus anciennes (`INSTALL_FAILED_NO_MATCHING_ABIS`) : pour
un tel essai, rajouter `x86_64` à la liste le temps d'une compilation.

L'APK est **signé avec la clé de test d'Expo** : suffisant pour les essais sur la tablette de test.
**Avant toute distribution aux agents**, créer un keystore de production **hors du dépôt**, en deux copies
(sans lui, plus aucune mise à jour possible par-dessus une version installée) et le brancher dans le workflow.

## Installation sur la tablette

Télécharger l'artefact `suivi-fuites-apk` (onglet Actions du dépôt), le copier sur la tablette, autoriser
l'installation depuis cette source. Sur Samsung : exclure l'appli de l'optimisation batterie
(Réglages > Batterie > Applications jamais en veille) pour le futur suivi GPS.
