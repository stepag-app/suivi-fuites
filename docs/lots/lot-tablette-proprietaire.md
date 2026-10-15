# Lot TP : Suivi fuites propriétaire de la tablette

> Fiche de cadrage (2026-10-11, version 2 après les réponses d'Issam du soir). **Pas de code avant son accord** (règle
> du `CLAUDE.md`) : quatre réponses attendues au § 11. Explication pour Issam et son binôme : note Claude Docs
> « Briefing — Tablettes verrouillées Suivi fuites ».

## 0. Objectif et décisions d'Issam (2026-10-11)

Les tablettes des agents (détection, réparation, réfection) sont des **outils de travail**, simples : seules les applis
de travail, aucune batterie ni 4G dépensée par le reste, mise à jour en un bouton. Modèle : **Redmi Pad 2 4G** (HyperOS
OS2.0.203.0.VOWMIXM, Android 15), qui sert aussi de tablette d'essai.

| Sujet | Décision |
|---|---|
| Moyen | L'appli **Suivi fuites devient « propriétaire de l'appareil »** (Device Owner d'Android) : seul moyen de cacher des applis, de bloquer les installations et d'installer une mise à jour sans fenêtre d'Android. Pas de MDM tiers |
| Applis gardées | Suivi fuites, Appareil photo (`com.android.camera`), Google Maps (« Y aller »), Téléphone, Contacts, Messages (Google), WhatsApp (Play Store) |
| Le reste | applis qu'on ne peut pas désinstaller : **cachées** ; applis qui tournent en arrière-plan : **retirées** (Redmi, par câble) ou **cachées** (tablettes préparées par QR code) ; une appli cachée est arrêtée |
| 4G | réservée à Suivi fuites et à ses dépendances (services Google, WebView, Maps) ; Play Store et mises à jour du système en Wi-Fi |
| Batterie | seules Suivi fuites et ses dépendances tournent en arrière-plan |
| Mise à jour | l'agent touche « Installer » dans la fenêtre « Mise à jour disponible » ; l'appli se ferme et se rouvre seule, sauf sur Xiaomi où l'agent la rouvre d'un toucher (règle validée par Issam le 2026-10-11 au soir : « l'agent va l'ouvrir naturellement de toutes manières ») |
| Écran d'accueil | celui d'HyperOS, réduit aux applis gardées. Pas de kiosque |
| Déverrouillage | **code temporaire** créé sur le panneau web par un compte administrateur, tapé dans Suivi fuites : Paramètres et Play Store remontrés, installations permises, puis reverrouillage automatique. Doit marcher sans Issam et sans Claude (son binôme, pendant ses congés, avec un compte administrateur) |
| Préparation d'une tablette | **QR code** (seul moyen sans ordinateur, Android n'accepte le propriétaire qu'au premier démarrage) ; Redmi par câble |
| Wi-Fi | **toujours joignable par l'agent, sans code** (Issam, 2026-10-11 soir : forfait 4G épuisé → Wi-Fi → les fuites partent) : volet du haut d'Android ; un nouveau réseau ouvre la fenêtre Wi-Fi de l'appli (`ActiviteWifi`, à la place de la page Wi-Fi des Paramètres, active pendant le verrouillage seulement) ; plus de Wi-Fi dans les écrans de l'appli (Issam, 2026-10-12) ; droits du propriétaire (`WifiManager.addNetwork`), Paramètres restent cachés |
| Play Store | caché ; remontré seulement pendant un déverrouillage |
| Compte Google | **un seul** compte dédié à toutes les tablettes, ajouté pendant un déverrouillage ; `stepag.app@gmail.com` jamais sur une tablette |
| Point ouvert n° 7 du `CLAUDE.md` | réglé : l'appli propriétaire installe elle-même ses mises à jour |

## 1. Faits vérifiés sur la Redmi (2026-10-11, appli d'essai minimale, retirée ensuite)

- `dpm set-device-owner` **accepté avec zéro compte** ; refusé (« already some accounts ») avec le compte Xiaomi.
- `setApplicationHidden` sur le Play Store et les Paramètres : **accepté** (icônes disparues).
- `no_install_apps` : `adb install` **refusé**. `no_install_unknown_sources`, `no_modify_accounts`, `no_factory_reset` : acceptés.
- **Le Play Store ne peut pas être suspendu** (`setPackagesSuspended` le renvoie) : on le **cache**.
- « Installer via USB » (option Xiaomi) a exigé un compte Xiaomi **et** une carte SIM ; les interrupteurs restent actifs
  après la déconnexion du compte.
- Le compte Xiaomi est de nouveau présent ce soir : Issam le retire avant la déclaration (§ 8).
- WebView en **131** (ancienne) : à mettre à jour par le Play Store pendant un déverrouillage.
- Applis à icône restantes après le ménage par câble (66 applis) : Appareil photo, Paramètres, Services SIM
  (`com.android.stk`), Thèmes, Play Store, Maps, Messages, Contacts, Téléphone, Galerie, Sécurité.
- Une APK peut se construire sans Gradle (JBR d'Android Studio, build-tools 36.0.0, platforms android-37.0) : utile pour
  des essais natifs rapides ; l'APK réelle reste compilée par la CI.

## 2. Vue d'ensemble

```
  préparation (une fois)                    à chaque démarrage, redémarrage, mise à jour de l'appli
  Redmi : câble, « dpm set-device-owner »   ──►  politique appliquée (idempotente) : applis cachées,
  agents : QR code au premier démarrage           interdictions, 4G coupée aux autres applis
                                                              │
                     ┌────────────────────────────────────────┼─────────────────────────────┐
           mise à jour Suivi fuites                 déverrouillage par code               libération (code
           un bouton, sans fenêtre (§ 5)            1 h : Paramètres, Play Store,          définitif) : tout
                                                    installations ; reverrouillage seul    remontré, plus de
                                                    (§ 6)                                  propriétaire
```

Profil interne de la tablette, sans réglage pour Issam : **agent** (préparée par QR code : débogage USB coupé) ou
**essai** (préparée par câble, la Redmi : adb et l'appli DEV gardés, commande de secours par adb). Tout le reste est
identique, pour que la Redmi reste un vrai modèle.

## 3. Module natif (Kotlin) : `mobile/modules/tablette-proprietaire/`

Module Expo local (autolinké depuis `mobile/modules/`), Android seulement. Son manifeste et ses ressources sont fusionnés
dans l'APK par Gradle : récepteurs, activités et `res/xml/device_admin.xml` y sont déclarés, sans toucher au dossier
`android/` généré. Plugin de configuration (`mobile/plugins/`) seulement si la première compilation montre un manque.

| Pièce | Rôle |
|---|---|
| `RecepteurAdmin` (`DeviceAdminReceiver`) + `res/xml/device_admin.xml` | composant propriétaire : `ma.stepag.suivifuites/ma.stepag.tablette.RecepteurAdmin` (`…dev/…` pour l'appli DEV) ; `<support-transfer-ownership/>` pour passer la Redmi de l'appli DEV à l'appli normale sans réinitialiser |
| `ActiviteModeProvisionnement` (`GET_PROVISIONING_MODE`), `ActiviteConformite` (`ADMIN_POLICY_COMPLIANCE`) | exigées par Android 12+ pour le QR code : « appareil entièrement géré », politique appliquée avant la fin de l'assistant |
| `Politique` | applis cachées, interdictions, 4G coupée, autorisations, état mémorisé (profil, fin de déverrouillage, applis gardées sur cette tablette) |
| `RecepteurDemarrage` (`BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`) | réapplique la politique au redémarrage et après une mise à jour (referme un déverrouillage échu), rouvre l'appli après sa propre mise à jour |
| `RecepteurInstallation` | résultat de la session d'installation |
| `RecepteurFinDeverrouillage` (alarme) | reverrouille à l'heure, même si l'appli a été fermée |
| `RecepteurSecours` | profil essai seulement, commandes par adb (§ 7) |
| `TabletteModule` (Expo) | fonctions exposées au JS |

```ts
etat(): { proprietaire: boolean; profil: 'agent' | 'essai'; deverrouilleeJusqua: number | null;
          cachees: string[]; interdictions: string[]; appareil: string; modele: string; android: string }
appliquerPolitique(): Promise<Bilan>              // idempotent, à chaque démarrage
deverrouiller(minutes: number): Promise<void>     // après validation du code par le serveur
reverrouiller(): Promise<void>                    // garde visibles les applis installées pendant le déverrouillage
installerApk(chemin: string, sha256: string): Promise<void>
transfererVers(paquet: string): Promise<void>     // DEV → appli normale (Redmi)
liberer(): Promise<void>
```

Hors propriétaire (tablette préparée à la main, émulateur) : `proprietaire = false`, rien ne change (mise à jour par
l'installateur d'Android comme aujourd'hui, pas d'entrée « Déverrouiller »).

## 4. Applis, 4G, batterie, interdictions

### 4.1 Applis

- **Gardées** : `ma.stepag.suivifuites`, `com.android.camera`, `com.google.android.apps.maps`,
  `com.google.android.dialer`, `com.google.android.contacts`, `com.google.android.apps.messaging`, `com.whatsapp`
  (`com.whatsapp.w4b` si Business) ; profil essai : en plus `ma.stepag.suivifuites.dev` ; et toute appli installée
  pendant un déverrouillage, sur cette tablette.
- **Cachées** (= arrêtées) : toute appli **à icône** hors de la liste gardée (Paramètres, Play Store, Galerie, Thèmes,
  Services SIM, et ce qu'un fabricant ou le Play Store ajoute), plus les **services en arrière-plan** de la liste du
  ménage par câble (§ 10) encore présents (publicité, statistiques, partage, nettoyeur…).
- **Jamais cachées** : écran d'accueil (`com.miui.home`), barre système, clavier actif (Gboard), services Google (`gms`,
  `gsf`), WebView, gestionnaire de permissions, installateur de paquets, composants HyperOS indispensables
  (`com.miui.powerkeeper`, `com.xiaomi.xmsf`, `com.lbe.security.miui`, `com.miui.securitycore`). **Sécurité**
  (`com.miui.securitycenter`) : cachée si l'essai sur la Redmi montre que rien n'en dépend, sinon visible.
- Le volet rapide (Wi-Fi, données, luminosité, mode avion, localisation) reste utilisable.

### 4.2 4G et batterie

- `setMeteredDataDisabledPackages` : données mobiles interdites à toutes les applis installées **sauf** Suivi fuites,
  services Google, WebView, Maps (et WhatsApp selon Q2) et les composants système nécessaires au téléphone et aux SMS.
  Wi-Fi libre : Play Store et mises à jour du système passent en Wi-Fi. La fonction renvoie les paquets qu'Android
  refuse de restreindre : liste notée à l'essai, contrôle de la consommation au bout d'une semaine.
- Batterie : une appli cachée ne tourne plus ; Suivi fuites garde l'arrière-plan pour le suivi GPS (à vérifier sur la
  Redmi face à l'économiseur de batterie de Xiaomi ; sinon un geste pendant la préparation).

### 4.3 Interdictions

| Interdiction | agent | essai | Effet |
|---|---|---|---|
| `no_install_apps` | oui | oui | aucune installation, même par adb ; levée pendant un déverrouillage et le temps d'une mise à jour |
| `no_install_unknown_sources` | oui | oui | pas d'APK téléchargée |
| `no_modify_accounts` | oui | oui | pas d'ajout ni de retrait de compte (levée pendant un déverrouillage) |
| `no_factory_reset` | oui | oui | pas de réinitialisation depuis les Paramètres |
| `no_add_user` | oui | oui | pas d'autre utilisateur ni d'invité |
| `no_safe_boot` | oui | oui | pas de mode sans échec |
| `no_debugging_features` | **oui** | non | débogage USB et options pour les développeurs coupés |

Proposés (Q4) : heure automatique imposée (`setAutoTimeEnabled`), autorisations de Suivi fuites accordées d'office
(`setPermissionGrantState` : position y compris en arrière-plan, appareil photo, notifications).

Limite : la réinitialisation par les **boutons** (mode récupération) reste possible sur tout Android ; Android demande
ensuite le compte Google des tablettes (protection contre le vol), puis la tablette se prépare de nouveau par QR code.

## 5. Mise à jour de Suivi fuites : un bouton

Sur une tablette dont l'appli est propriétaire, « Installer maintenant » (fenêtre et bandeau actuels de
`mobile/src/mise-a-jour.tsx`) remplace l'ouverture de l'installateur d'Android (`ACTION_VIEW`). Règles gardées :
contrôle au plus toutes les 6 h, jamais sans réseau, jamais au milieu d'une saisie, « Plus tard » possible.

1. Téléchargement dans le cache de l'appli, comme aujourd'hui.
2. Contrôles par le module : taille, **empreinte SHA-256** (`derniere.json` la donne déjà), même nom de paquet et
   **même certificat** que l'appli installée.
3. `no_install_apps` levée, session `PackageInstaller` validée sans fenêtre, interdiction reposée (échec :
   `RecepteurInstallation` ; succès : `RecepteurDemarrage` ; et à chaque démarrage).
4. Android ferme l'appli 5 à 15 s ; elle **se rouvre seule** sur la liste. Saisies et envois en attente gardés.

Play Store (WebView, Maps, WhatsApp) : mis à jour seulement pendant un déverrouillage, en Wi-Fi.

## 6. Déverrouillage par code temporaire

**Panneau web** (Paramètres > onglet **Tablettes**, administrateur) :
- **Générer un code** : type « Déverrouiller » (durée selon Q3, 1 h par défaut) ou « Libérer la tablette (définitif) »,
  motif facultatif. Code de **8 chiffres** affiché une seule fois ; une seule utilisation ; expire au bout de **24 h** ;
  valable sur n'importe quelle tablette.
- **QR code de préparation** à imprimer (§ 8).
- **Journal** : codes créés (par qui, type, motif), utilisés (quelle tablette, quand), déverrouillages, reverrouillages,
  libérations, mises à jour installées, applis gardées après un déverrouillage.

**Tablette** (réseau nécessaire) : entrée **Déverrouiller la tablette** dans le menu de la liste et sur l'écran de
connexion ; saisie du code ; le serveur le vérifie et le consomme ; la tablette s'ouvre pour la durée prévue, bandeau
« Tablette déverrouillée jusqu'à 15 h 20 » et bouton **Reverrouiller maintenant** ; reverrouillage automatique à
l'heure (alarme), au redémarrage et à l'ouverture de l'appli si l'heure est passée. Les applis installées pendant le
déverrouillage restent visibles sur cette tablette. Code « Libérer » : tout remontré, interdictions retirées,
`clearDeviceOwnerApp` ; l'appli reste installée comme une appli normale.

**Sécurité** : seul un administrateur actif crée un code ; le serveur ne garde qu'une empreinte du code ; 5 échecs
d'affilée bloquent les essais 1 h (par tablette et par compte) ; vérification par une fonction de la base, aussi depuis
l'écran de connexion (sans session : limite globale d'essais en plus).

## 7. Secours

| Situation | Recours |
|---|---|
| Défaut de l'appli | version corrigée (§ 5), ou code « Libérer » |
| Appli qui plante dès son ouverture | Téléphone, Maps, WhatsApp marchent encore ; réinitialisation par les boutons puis QR code. D'où un essai sur la Redmi avant chaque publication |
| Redmi (profil essai) | `adb shell am broadcast -n <paquet>/ma.stepag.tablette.RecepteurSecours -a ma.stepag.tablette.SECOURS --es action liberer` (ou `deverrouiller`, `appliquer`) ; récepteur réservé au shell (permission `DUMP`) |

## 8. Préparation des tablettes

### 8.1 Redmi d'Issam (câble, profil essai)

Geste d'Issam (liste donnée au moment voulu) : retirer le compte Xiaomi et tout autre compte. Puis Claude, par adb, après
avoir vérifié qu'Issam n'utilise pas la tablette : installer l'APK DEV de la CI,
`dpm set-device-owner ma.stepag.suivifuites.dev/ma.stepag.tablette.RecepteurAdmin`, ouvrir l'appli. L'appli DEV est
propriétaire pendant le développement (rechargement par Metro) ; la propriété passera à l'appli normale par
`transfererVers` quand celle-ci aura le module.

### 8.2 Tablettes des agents (QR code, profil agent)

Tablette neuve ou réinitialisée, SIM insérée : **six touchers** sur le premier écran de l'assistant, lecture du QR code ;
Android télécharge l'APK, la déclare propriétaire et applique la politique avant la fin de l'assistant ; aucun compte
demandé. Contenu du QR code (Android Enterprise) :

```json
{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "ma.stepag.suivifuites/ma.stepag.tablette.RecepteurAdmin",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "https://osajiinsibwrsltntmsk.supabase.co/functions/v1/apk-enrolement",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": "<empreinte du certificat STEPAG, base64url>",
  "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
  "android.app.extra.PROVISIONING_USE_MOBILE_DATA": true,
  "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": { "profil": "agent" }
}
```

- **Adresse stable de l'APK** : nouvelle fonction serveur `apk-enrolement` (sans connexion, lecture seule) qui renvoie
  vers une URL signée d'une heure de la dernière APK publiée par `apk.yml` (`apk/derniere.json`). Le QR code ne change
  pas d'une version à l'autre ; l'APK ne contient aucun secret (clé anon publique par conception).
- **Empreinte** : SHA-256 du certificat de signature STEPAG en base64url, stable tant que le keystore est gardé. Pas un
  secret.
- Ensuite, pendant un premier déverrouillage : compte Google des tablettes, WhatsApp depuis le Play Store.
- Premier essai du QR code : sur la Redmi après les essais du § 12 (réinitialisation par Issam, à sa date), ou sur la
  première tablette d'agent.

## 9. Base et serveur

- Migration `supabase/migrations/20261016100000_tablettes.sql` :
  - `codes_tablette` (empreinte du code, type, durée, motif, créé par, créé le, expire le, utilisé le, tablette) et
    `journal_tablettes` (tablette, action, détails, compte, date) ; RLS : lecture administrateur seulement, aucune
    écriture directe ;
  - `creer_code_tablette(type, minutes, motif)` : administrateur actif ; renvoie le code en clair une seule fois ;
  - `utiliser_code_tablette(code, appareil, modele)` : `anon` et `authenticated`, limites d'essais ; renvoie type et durée ;
  - `journaliser_tablette(appareil, action, details)` : comptes actifs, actions de la liste seulement ;
  - droits accordés explicitement ; tests pgTAP `50_tablettes.test.sql`.
- Fonction `supabase/functions/apk-enrolement/` (`verify_jwt = false`, secrets R2 de `version-apk`), déployée par
  « Déploiement de la base » à la fusion.
- Panneau web : onglet **Tablettes** de Paramètres (administrateur) : générer un code, QR code de préparation, journal.

## 10. Script `outils/tablettes/`

Pour la Redmi et toute tablette où adb est disponible (les tablettes préparées par QR code n'en ont pas besoin) :

- `applis-retirees.txt` (`pm uninstall -k --user 0`) et `applis-desactivees.txt` (Xiaomi refuse leur retrait, erreur
  -1000 : `pm disable-user --user 0`) : les listes appliquées à la Redmi le 2026-10-11 ;
- `menage.sh <série>` : applique les listes, bilan (retirée, désactivée, absente, refusée), ne touche jamais aux applis
  gardées ;
- `remise.sh <série> [paquet…]` : remet tout ou une partie (`cmd package install-existing --user 0`, `pm enable`) ;
- `README.md`. La même liste sert à la politique (services cachés sur les tablettes préparées par QR code).

## 11. Questions à trancher (Issam)

1. **Accord** sur ce fonctionnement (mode propriétaire, code temporaire du panneau, QR code). Proposé : oui.
2. **WhatsApp** : 4G permise ? normal ou Business ? Proposé : 4G oui, WhatsApp normal.
3. **Durée d'un déverrouillage** : 1 h fixe, ou au choix 15 min, 1 h, 4 h ? Proposé : au choix, 1 h par défaut.
4. **Heure automatique imposée et autorisations accordées d'office**. Proposé : oui aux deux.

## 12. Vérifications sur la Redmi (décrites dans la PR)

PR [#117](https://github.com/stepag-app/suivi-fuites/pull/117) **fusionnée** le 2026-10-11 (`72def81`), migration et fonction
`apk-enrolement` déployées. Suite : PR Wi-Fi [#118](https://github.com/stepag-app/suivi-fuites/pull/118) : bloc Wi-Fi de l'écran Tablette **vérifié
sur la Redmi** le 2026-10-12 à 00:15 (tablette verrouillée, réseau WPA2 rejoint depuis l'appli, mot de passe tapé par
Issam, événement « wifi » journalisé, envois possibles ensuite).

Résultats du 2026-10-11 (appli DEV `7cef633` propriétaire, profil essai, après retrait du compte Xiaomi par Issam) :
`dpm set-device-owner` accepté ; politique : 13 applis cachées (Paramètres, Play Store, Galerie, Thèmes, Services SIM,
Sécurité, et les 7 applis désactivées), 6 interdictions, **234 paquets privés de 4G sans aucun refus**, heure automatique,
4 autorisations accordées (`POLICY_FIXED`) ; écran d'accueil réduit à Suivi fuites DEV, Appareil photo, Maps, Téléphone,
Contacts, Messages ; `adb install` refusé (« User restriction prevents installing ») ; déverrouillage de 2 min par la
commande de secours : Paramètres et Play Store réapparus, `no_install_apps` et `no_modify_accounts` levées, alarme posée ;
**reverrouillage automatique** environ 2 min 30 après (alarme inexacte), interdictions remises. Constat : Android refuse
`am force-stop` sur l'appli propriétaire (`run-as … kill` pour l'appli DEV).
**Mise à jour silencieuse** (appli DEV réinstallée par le module, APK copiée dans son cache) : installation sans fenêtre,
`lastUpdateTime` changé, session de l'agent gardée, politique réappliquée par le nouveau processus. **Limite HyperOS** :
sans « Démarrage automatique » (op MIUI 10008), HyperOS refuse de lancer l'appli pour la diffusion « paquet remplacé »
(« process is not permitted to auto start ») ; sans « Fenêtres contextuelles en arrière-plan » (op 10021), la relance ne
revient pas au premier plan. Le réglage « fenêtres en arrière-plan » (et la batterie) fait partie de la préparation de la tablette (mode d'emploi du
panneau) ; il survit aux mises à jour. Le « démarrage automatique » n'est **pas proposé** par HyperOS 2.0 tablette pour
l'appli, et sans lui HyperOS refuse **tout** réveil de l'appli après l'installation (diffusion « paquet remplacé » et
compte rendu de la session d'installation, vérifié sur 5 mises à jour) : **sur Xiaomi, l'agent rouvre l'appli d'un
toucher après « Installer »** (texte de la fenêtre adapté) ; la réouverture automatique reste en place pour les tablettes
qui l'acceptent (Android d'origine, autres fabricants : propriétaire exempté). Si l'appli est fermée, le reverrouillage se fait à l'ouverture
suivante. La « Sécurité » de Xiaomi reste visible pendant un
déverrouillage pour accéder à ces pages. `adb install` refusé par HyperOS (« Installer via USB ») : l'APK DEV s'installe
par la mise à jour de l'appli elle-même.

1. Propriétaire déclaré (`dumpsys device_policy`), profil essai.
2. Écran d'accueil réduit aux applis gardées ; Paramètres, Play Store, Galerie, Thèmes introuvables ; volet rapide utilisable.
3. `adb install` refusé ; APK téléchargée refusée ; ajout de compte refusé ; réinitialisation absente.
4. 4G : liste des paquets restreints et refusés ; consommation par appli au bout de quelques jours.
5. Mise à jour en un bouton : APK DEV plus récente installée sans fenêtre, appli rouverte, interdiction reposée ; puis
   l'APK normale (artefact de la PR) par le même chemin.
6. Code : refusé (faux, expiré, déjà servi, 5 échecs) ; accepté : Paramètres et Play Store visibles, appli installée
   gardée, reverrouillage à l'heure, au bouton et après redémarrage ; journal en base.
7. Code « Libérer » : tout remontré, plus de propriétaire, appli installée ; puis nouvelle déclaration par adb.
8. Appareil photo, Maps (« Y aller »), WebView (Balayage), suivi GPS fonctionnels sous la politique.

Avant chaque installation ou arrêt forcé : contrôle qu'Issam n'utilise pas la tablette (`dumpsys power`, écran au premier
plan). Les gestes manuels (comptes, réglages, réinitialisation) sont faits par Issam.

## 13. Coordination

- Branche `claude/lot-tablette-proprietaire`, PR [#117](https://github.com/stepag-app/suivi-fuites/pull/117).
- Fichiers : `mobile/modules/tablette-proprietaire/` (nouveau), `mobile/src/mise-a-jour.tsx`, `mobile/src/tablette.tsx`
  (nouveau : déverrouillage, bandeau), `mobile/App.tsx`, `mobile/src/ecrans.tsx`, `mobile/src/traductions.ts`,
  `supabase/` (migration, test, fonction, `config.toml`), `web/src/app/(app)/parametres/` (onglet Tablettes),
  `outils/tablettes/`, `mobile/README.md`, `docs/etat-avancement.md`.
- La partie native change : `apk.yml` (PR) et `apk-dev.yml` compilent ; aucune publication aux tablettes sans la demande
  d'Issam. Dépôt public : aucun secret (empreinte du certificat et adresse de la fonction n'en sont pas).
- Migration après `20261015300000…` (S21) : `20261016100000`.
