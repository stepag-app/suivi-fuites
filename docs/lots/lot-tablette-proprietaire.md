# Lot TP : Suivi fuites propriétaire de la tablette

> Fiche de cadrage (2026-10-11), **à valider par Issam avant de coder** (règle du `CLAUDE.md`). Les questions du § 12
> attendent sa réponse ; le reste applique ses décisions du 2026-10-11.

## 0. Objectif et décisions d'Issam (2026-10-11)

Les tablettes des agents (détection, réparation, réfection) sont des **outils de travail** : ni jeux, ni vidéo, ni
installation d'applis par l'agent, ni ajout de compte, ni réinitialisation. Modèle : **Redmi Pad 2 4G** (HyperOS
OS2.0.203.0.VOWMIXM, Android 15), qui sert aussi de tablette d'essai.

| Sujet | Décision |
|---|---|
| Moyen | L'appli **Suivi fuites devient « propriétaire de l'appareil »** (Device Owner d'Android). Pas de MDM tiers (ManageEngine écarté), pas de simple verrouillage par adb (contournable) |
| Applis gardées | Suivi fuites, **Appareil photo** (`com.android.camera`, ouvert par l'appli pour les photos), **Google Maps** (bouton « Y aller »), **Téléphone, Contacts, Messages** (Google), **WhatsApp** (à installer depuis le Play Store) |
| Écran d'accueil | Celui d'HyperOS, **gardé**, réduit à ces applis. **Pas de kiosque** (l'agent passe d'une appli gardée à l'autre normalement) |
| Reprise en main | Écran **« Maintenance »** dans l'appli, ouvert seulement à un compte **administrateur** (vérifié par le serveur) |
| Comptes Google | `stepag.app@gmail.com` **jamais** sur une tablette (il contrôle GitHub, Supabase, Vercel). Une adresse dédiée aux tablettes, ajoutée **après** la déclaration du propriétaire |
| Point ouvert n° 7 du `CLAUDE.md` | Réglé par ce lot : l'appli propriétaire installe elle-même ses mises à jour |

## 1. Faits vérifiés sur la Redmi (2026-10-11, appli d'essai minimale, retirée ensuite)

- `dpm set-device-owner` **accepté avec zéro compte** ; refusé (« already some accounts ») avec le compte Xiaomi.
- `setApplicationHidden` sur le Play Store et les Paramètres : **accepté** (icônes disparues).
- `no_install_apps` : `adb install` **refusé**. `no_install_unknown_sources`, `no_modify_accounts`, `no_factory_reset` : acceptés.
- **Le Play Store ne peut pas être suspendu** (`setPackagesSuspended` le renvoie) : on le **cache**, et on le remontre
  pendant une fenêtre de mise à jour.
- « Installer via USB » (option Xiaomi) a exigé un compte Xiaomi **et** une carte SIM ; les interrupteurs restent actifs
  après la déconnexion du compte.
- Le compte Xiaomi est de nouveau présent ce soir : il faudra le retirer avant la déclaration (§ 8).
- WebView en **131** (ancienne) : à mettre à jour par le Play Store (§ 5.2).
- Applis à icône restantes après le grand ménage : Appareil photo, Paramètres, Services SIM (`com.android.stk`), Thèmes,
  Play Store, Maps, Messages, Contacts, Téléphone, Galerie, Sécurité.
- Une APK peut se construire sans Gradle (JBR d'Android Studio, build-tools 36.0.0, platforms android-37.0) : utile pour
  des essais natifs rapides, l'APK réelle reste compilée par la CI.

## 2. Vue d'ensemble

```
            enrôlement (une fois)                       chaque démarrage de l'appli, chaque redémarrage,
  Redmi : adb « dpm set-device-owner »                   chaque mise à jour de l'appli
  agents : QR code après réinitialisation      ──►      « appliquer la politique » (idempotent) :
                                                          cacher les applis hors liste, poser les interdictions
                                                                          │
              ┌───────────────────────────────────────────┼───────────────────────────────────┐
     mise à jour de l'APK                        fenêtre Play Store                     Maintenance (admin)
  installée sans question (§ 5.1)        WebView, Maps, WhatsApp (§ 5.2)      Paramètres et Play Store remontrés
                                                                              le temps d'une intervention, journal,
                                                                              « Libérer la tablette » (§ 6)
```

Deux **profils** de tablette :

| Profil | Pour | Différences |
|---|---|---|
| **agent** | tablettes des agents (par défaut d'un enrôlement par QR code) | débogage USB et options pour les développeurs **coupés** (`no_debugging_features`) |
| **essai** | la Redmi d'Issam (par défaut d'un enrôlement par adb) | adb gardé ; l'appli **Suivi fuites DEV** gardée visible ; commande de secours par adb (§ 7) |

Tout le reste (applis cachées, interdictions) est identique, pour que la Redmi reste un vrai modèle. Le profil se change
dans Maintenance (journalisé).

## 3. Module natif (Kotlin) : `mobile/modules/tablette-proprietaire/`

Module Expo local (autolinké depuis `mobile/modules/`), Android seulement. Son manifeste et ses ressources sont fusionnés
dans l'APK par Gradle : récepteur, activités et `res/xml/device_admin.xml` y sont déclarés, sans toucher au dossier
`android/` généré. **Plugin de configuration** (`mobile/plugins/`) seulement si la première compilation montre un manque
(pas prévu à ce stade : le manifeste du module suffit).

| Pièce | Rôle |
|---|---|
| `RecepteurAdmin` (`DeviceAdminReceiver`) + `res/xml/device_admin.xml` | le composant déclaré propriétaire : `ma.stepag.suivifuites/ma.stepag.tablette.RecepteurAdmin` (et `…dev/…` pour l'appli DEV) ; `<support-transfer-ownership/>` pour passer la propriété de l'appli DEV à l'appli normale sans réinitialiser |
| `ActiviteModeProvisionnement` (`GET_PROVISIONING_MODE`), `ActiviteConformite` (`ADMIN_POLICY_COMPLIANCE`) | exigées par Android 12 et plus pour l'enrôlement par QR code : « appareil entièrement géré », puis politique appliquée avant la fin de l'assistant |
| `Politique` | applique un profil : cacher / montrer, interdictions, permissions, état mémorisé (profil, nom de la tablette, fin de maintenance) |
| `RecepteurDemarrage` (`BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`) | réapplique la politique au redémarrage et après une mise à jour (referme une maintenance oubliée), puis rouvre l'appli après sa propre mise à jour |
| `RecepteurInstallation` | résultat de la session d'installation (succès, échec, raison) |
| `RecepteurFinMaintenance` (alarme) | referme la maintenance à l'heure prévue, même si l'appli a été fermée |
| `RecepteurSecours` | profil **essai** seulement : commandes par adb (§ 7) ; désactivé en profil agent (adb y est coupé de toute façon) |
| `TabletteModule` (Expo) | fonctions exposées au JS (ci-dessous) |

Fonctions exposées au JS (`mobile/modules/tablette-proprietaire/index.ts`, typées) :

```ts
etat(): { proprietaire: boolean; profil: 'agent' | 'essai'; nom: string | null; maintenanceJusqua: number | null;
          cachees: string[]; interdictions: string[]; appareil: string; modele: string; android: string }
appliquerPolitique(): Promise<Bilan>            // idempotent, à chaque démarrage
ouvrirMaintenance(minutes: number): Promise<void>
fermerMaintenance(): Promise<void>
changerProfil(profil: 'agent' | 'essai'): Promise<void>
nommer(nom: string): Promise<void>
installerApk(chemin: string, sha256: string): Promise<void>   // § 5.1
transfererVers(paquet: string): Promise<void>                 // DEV → appli normale
liberer(): Promise<void>                                      // § 6
```

Hors propriétaire (tablettes Samsung actuelles, émulateur) : `proprietaire = false`, les fonctions de politique ne font
rien, et la mise à jour garde le chemin actuel (installateur d'Android). Rien ne change pour ces tablettes.

## 4. Applis et interdictions

### 4.1 Règle des applis

**Toute appli qui a une icône sur l'écran d'accueil est cachée**, sauf la liste gardée ; une appli **sans icône**
(services du système) n'est jamais touchée par l'appli. Une appli installée plus tard (par le Play Store pendant une
fenêtre) est donc cachée au démarrage suivant si elle n'est pas dans la liste.

- **Gardées** : `ma.stepag.suivifuites`, `com.android.camera`, `com.google.android.apps.maps`,
  `com.google.android.dialer`, `com.google.android.contacts`, `com.google.android.apps.messaging`, `com.whatsapp`
  (et `com.whatsapp.w4b` si WhatsApp Business est choisi) ; en profil essai, en plus `ma.stepag.suivifuites.dev`.
- **Jamais cachées**, même avec une icône : écran d'accueil (`com.miui.home`), barre système (`com.android.systemui`),
  clavier actif (Gboard), services Google (`com.google.android.gms`, `gsf`), WebView, gestionnaire de permissions,
  installateur de paquets, et les composants d'HyperOS indispensables (`com.miui.securitycenter`, `com.miui.powerkeeper`,
  `com.xiaomi.xmsf`, `com.lbe.security.miui`, `com.miui.securitycore`).
- **Cachées sur la Redmi d'aujourd'hui** : Paramètres, Play Store, Galerie, Thèmes, Services SIM ; **Sécurité**
  (`com.miui.securitycenter`) : à essayer. Si la cacher casse une fenêtre du système (permissions, démarrage automatique,
  batterie), elle reste visible : elle ne permet ni d'installer, ni d'ajouter un compte, ni de réinitialiser.
- Le volet rapide (Wi-Fi, données, luminosité, mode avion, localisation) reste disponible.

### 4.2 Interdictions (restrictions d'Android)

| Interdiction | agent | essai | Effet |
|---|---|---|---|
| `no_install_apps` | oui | oui | aucune installation, même par adb ; levée le temps d'une mise à jour (§ 5) |
| `no_install_unknown_sources` | oui | oui | pas d'APK téléchargée |
| `no_modify_accounts` | oui | oui | pas d'ajout ni de retrait de compte (levée pendant une maintenance, pour le compte Google des tablettes) |
| `no_factory_reset` | oui | oui | pas de réinitialisation depuis les Paramètres |
| `no_add_user` | oui | oui | pas d'autre utilisateur ni d'invité |
| `no_safe_boot` | oui | oui | pas de démarrage en mode sans échec (qui contourne les applis) |
| `no_debugging_features` | **oui** | non | débogage USB et options pour les développeurs coupés |

**Proposées en plus** (question Q4) : heure automatique imposée (heures des fuites fiables), localisation forcée
allumée, permissions accordées d'office à Suivi fuites (position « toujours », appareil photo, notifications : moins de
gestes par tablette, l'agent ne peut plus les retirer), transfert de fichiers par USB coupé.

Limite connue : la réinitialisation par les **boutons physiques** (mode récupération) reste possible sur tout Android.
Après elle, Android demande le compte Google qui était sur la tablette (protection contre le vol) : d'où l'intérêt du
compte dédié aux tablettes, connu de STEPAG. La tablette est alors à réenrôler par QR code.

## 5. Mises à jour

### 5.1 APK Suivi fuites : installée sans question

Remplace, sur une tablette dont l'appli est propriétaire, l'ouverture de l'installateur d'Android (`ACTION_VIEW`) de
`mobile/src/mise-a-jour.tsx`. Règles gardées : contrôle au plus toutes les 6 h, **jamais sans réseau**, **jamais au
milieu d'une saisie** (seulement sur la liste), « Plus tard » possible.

1. Version plus récente trouvée (fonction `version-apk`, inchangée) : téléchargement dans le cache de l'appli, comme
   aujourd'hui.
2. Contrôles avant installation, par le module : taille et **empreinte SHA-256** (`derniere.json` la donne déjà), même
   nom de paquet et **même certificat de signature** que l'appli installée.
3. `no_install_apps` levée, session `PackageInstaller` validée **sans fenêtre** (droit du propriétaire), puis
   interdiction reposée : sur échec par `RecepteurInstallation`, sur succès par `RecepteurDemarrage` (la nouvelle version
   démarre), et de toute façon à chaque démarrage de l'appli.
4. Android ferme l'appli pendant le remplacement (5 à 15 s) ; elle **se rouvre seule** sur la liste. Saisies et envois en
   attente sont gardés (même signature, mêmes données).

Moment de l'installation : question Q2.

### 5.2 Play Store (WebView, Maps, WhatsApp)

Le Play Store reste **caché** aux agents. Il met à jour WebView (la carte de balayage en dépend ; la Redmi est en 131),
Maps et WhatsApp **seulement** quand il est remontré, avec `no_install_apps` levée. Deux façons (question Q3) :

- **pendant une Maintenance** : l'administrateur ouvre la tablette au bureau (Wi-Fi), lance les mises à jour dans le
  Play Store, referme ;
- **fenêtre de nuit** automatique : tablette en charge, par exemple de 1 h à 5 h (heure du Maroc), Play Store remontré
  et installations permises, puis tout refermé. Le Play Store décide seul du moment de ses mises à jour : il faut
  vérifier sur la Redmi, pendant quelques nuits, qu'il les fait bien dans la fenêtre, et régler ses mises à jour
  automatiques sur « tous les réseaux » si les agents n'ont pas de Wi-Fi (consomme la 4G).

Mises à jour d'HyperOS : laissées au réglage d'usine pour l'instant (le propriétaire peut les fixer à une plage horaire,
à décider plus tard si une mise à jour gêne).

## 6. Écran « Maintenance »

**Accès** : une entrée « Maintenance » dans le menu de la liste, visible seulement si le compte connecté est
administrateur (`profils.est_admin`). À l'ouverture, l'appli appelle la base (`ouvrir_maintenance`) : la base vérifie que
le compte est administrateur et actif, et journalise ; sans cette réponse (refus ou pas de réseau), l'écran ne s'ouvre
pas. Variante proposée : question Q1.

**Contenu** :
- État : propriétaire oui / non, profil, nom de la tablette (T01, T02…), modèle, version de l'appli et d'Android,
  applis cachées, interdictions en place.
- **Ouvrir la tablette pour 30 min** (15, 30, 60) : Paramètres et Play Store remontrés, installations et comptes permis.
  Bandeau « Maintenance ouverte jusqu'à 14 h 30 » sur la liste ; **Refermer maintenant**. Fermeture automatique à
  l'heure (alarme), au redémarrage, et à l'ouverture de l'appli si l'heure est passée.
- **Profil** agent / essai ; **Nom de la tablette** ; **Réappliquer la politique** (bilan affiché).
- **Libérer la tablette** : toutes les applis remontrées, toutes les interdictions retirées, puis l'appli cesse d'être
  propriétaire (`clearDeviceOwnerApp`) et reste installée comme une appli normale. Double confirmation (taper
  « LIBÉRER »). But : ne **jamais** devoir réinitialiser une tablette à cause d'un défaut de l'appli.
- DEV seulement : **Transférer la propriété** à l'appli normale (`transferOwnership`), pour passer la Redmi de l'appli DEV
  à l'appli normale sans réinitialiser ni retirer les comptes.

**Journal** (base) : ouverture et fermeture de maintenance (qui, quand, durée, motif facultatif), profil, nom,
libération, mise à jour installée, politique appliquée (bilan court). Événements sans réseau gardés sur la tablette et
envoyés à la connexion suivante.

## 7. Secours

| Situation | Recours |
|---|---|
| Défaut de l'appli, tablette d'agent | mise à jour corrigée (§ 5.1), ou Maintenance > Libérer |
| Appli qui ne démarre plus (plantage au lancement) | la politique reste en place, l'agent garde Téléphone, Maps, WhatsApp ; publier une version corrigée ne suffit pas (l'appli ne la voit pas) : **réinitialisation par les boutons** (mode récupération) puis réenrôlement par QR code. D'où des essais sur la Redmi avant chaque publication |
| Redmi (profil essai) | `adb shell am broadcast -n <paquet>/ma.stepag.tablette.RecepteurSecours -a ma.stepag.tablette.SECOURS --es action liberer` (ou `ouvrir`, `appliquer`) ; le récepteur n'accepte que l'appelant adb (permission réservée au shell) |

## 8. Enrôlement

### 8.1 Redmi d'Issam (adb, profil essai)

Gestes d'Issam (liste donnée au moment voulu, puis « fait ») : retirer le compte Xiaomi (et tout autre compte). Puis
Claude, par adb, en vérifiant d'abord qu'Issam n'utilise pas la tablette : installer l'APK DEV de la CI,
`dpm set-device-owner ma.stepag.suivifuites.dev/ma.stepag.tablette.RecepteurAdmin`, ouvrir l'appli : politique du
profil **essai** appliquée. L'appli DEV est propriétaire pendant le développement (rechargement par Metro) ; la propriété
passera à l'appli normale par « Transférer la propriété » quand elle aura le module.

### 8.2 Tablettes des agents (QR code, profil agent)

Après réinitialisation (ou tablette neuve) : **six touchers** sur l'écran d'accueil de l'assistant, lecture du QR code,
Android télécharge l'APK, la déclare propriétaire et applique la politique **avant** la fin de l'assistant. Aucun compte
n'est demandé. Contenu du QR code (JSON d'Android Enterprise) :

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

- **Adresse stable de l'APK** : le compartiment R2 est privé et une URL signée expire. Nouvelle fonction serveur
  `apk-enrolement` (sans connexion, lecture seule) qui renvoie vers une URL signée d'une heure de la **dernière APK
  publiée** par `apk.yml` (`apk/derniere.json`). Elle ne donne que l'APK, qui ne contient aucun secret (la clé anon est
  publique par conception). Le QR code ne change donc pas d'une version à l'autre.
- **Empreinte** : SHA-256 du certificat de signature STEPAG, en base64url ; elle ne change pas tant que le keystore est
  gardé (décision du 2026-10-11). Ce n'est pas un secret.
- Le Wi-Fi n'est pas nécessaire (données mobiles de la SIM). Le QR code se génère et s'imprime depuis le panneau
  (question Q5).
- Première fois : à essayer sur la Redmi **après** les essais du § 11, ce qui demande une réinitialisation (geste
  d'Issam, à sa date), ou sur la première tablette d'agent.

## 9. Base et serveur

- Migration `supabase/migrations/20261016100000_tablettes.sql` : table `journal_tablettes` (appareil, nom, action,
  détails, compte, date ; RLS : lecture administrateur seulement, aucune écriture directe), fonctions
  `ouvrir_maintenance(appareil, nom, minutes, motif)` (administrateur actif, sinon refus) et
  `journaliser_tablette(appareil, nom, action, details)` (actions de maintenance réservées à l'administrateur ; mise à
  jour et politique pour tout compte actif) ; droits accordés explicitement. Tests pgTAP `50_tablettes.test.sql`.
- Fonction `supabase/functions/apk-enrolement/` (`verify_jwt = false`, mêmes secrets R2 que `version-apk`), déployée par
  « Déploiement de la base » à la fusion.

## 10. Script `outils/tablettes/`

À partir du ménage fait sur la Redmi (66 applis), pour la Redmi et toute tablette où adb est disponible :

- `applis-retirees.txt` (retrait pour l'utilisateur, `pm uninstall -k --user 0`) et `applis-desactivees.txt`
  (Xiaomi refuse leur retrait, erreur -1000 : `pm disable-user --user 0`) : les listes de la Redmi.
- `menage.sh <série>` : applique les deux listes, affiche le bilan (retirée, désactivée, absente, refusée), ne touche
  jamais à une appli de la liste gardée.
- `remise.sh <série> [paquet…]` : remet tout ou une partie (`cmd package install-existing --user 0`, `pm enable`).
- `README.md` : quand s'en servir (tablettes d'agents enrôlées par QR : inutile, la politique cache déjà tout ce qui a une
  icône ; le script libère en plus la place et les services sans icône).

## 11. Vérifications sur la Redmi (décrites dans la PR)

1. Propriétaire déclaré (`dumpsys device_policy`), profil essai.
2. Écran d'accueil réduit aux applis gardées ; Paramètres, Play Store, Galerie, Thèmes introuvables ; volet rapide utilisable.
3. `adb install` refusé ; installation d'une APK téléchargée refusée ; ajout de compte refusé ; réinitialisation absente des Paramètres.
4. Mise à jour silencieuse : APK DEV plus récente installée par l'appli sans fenêtre, appli rouverte, interdiction reposée ;
   puis installation de l'APK normale (artefact de la PR) par le même chemin.
5. Maintenance : refusée à un compte non administrateur ; ouverte par Issam : Paramètres et Play Store visibles,
   refermée à l'heure et par le bouton ; lignes du journal en base.
6. Libération : toutes les applis remontrées, plus de propriétaire, appli toujours installée ; puis nouvelle déclaration
   par adb pour la suite des essais.
7. Appareil photo, Maps (« Y aller »), WebView (Balayage) et suivi GPS toujours fonctionnels sous la politique.

Avant chaque installation ou arrêt forcé : contrôle qu'Issam n'utilise pas la tablette (`dumpsys power`, écran au
premier plan). Les gestes manuels (comptes, réglages, réinitialisation) sont faits par Issam.

## 12. Questions à trancher (Issam)

1. **Accès à Maintenance**. (a) Comme décidé : l'administrateur se connecte dans l'appli à la place de l'agent
   (« Quitter », puis son compte), et l'agent se reconnecte après. (b) **Proposé** : en plus, un lien « Maintenance » sur
   l'écran de connexion et dans le menu, qui demande l'identifiant et le mot de passe d'un administrateur **sans fermer
   la session de l'agent** (vérifiés par le serveur, rien n'est gardé sur la tablette).
2. **Moment de l'installation** d'une nouvelle version. (a) **Proposé** : téléchargement dès qu'elle est trouvée, puis
   sur la liste une fenêtre « Mise à jour dans 10 s » avec « Plus tard » ; l'appli se ferme et se rouvre seule. (b) Sans
   aucune fenêtre, à la première ouverture de la liste. (c) La nuit seulement, tablette en charge.
3. **Play Store**. (a) **Proposé pour commencer** : seulement pendant une Maintenance (au bureau, en Wi-Fi, par exemple
   une fois par mois). (b) Fenêtre de nuit automatique, après quelques nuits d'essai sur la Redmi.
4. **Interdictions en plus** (§ 4.2) : heure automatique imposée, localisation forcée allumée, permissions accordées
   d'office, transfert de fichiers USB coupé. Proposé : **oui aux quatre**.
5. **Panneau web** : une page Paramètres > **Tablettes** (administrateur) avec le **QR code d'enrôlement** à imprimer et
   le **journal** (tablette, action, qui, quand). Proposé : **oui, dans ce lot** (petite page) ; sinon le QR code est
   fabriqué par un script et le journal se lit dans Supabase.
6. **Compte Google des tablettes** : une seule adresse dédiée pour toutes les tablettes (ex. `tablettes.stepag@gmail.com`,
   à créer par Issam, double authentification), ajoutée en Maintenance après l'enrôlement. Proposé : **oui, une seule**.
7. **WhatsApp** : WhatsApp ou WhatsApp Business ?

## 13. Coordination

- Branche `claude/lot-tablette-proprietaire`, une PR. Fichiers : `mobile/modules/tablette-proprietaire/` (nouveau),
  `mobile/src/mise-a-jour.tsx`, `mobile/src/maintenance.tsx` (nouveau), `mobile/App.tsx`, `mobile/src/ecrans.tsx` (entrée
  du menu), `mobile/src/traductions.ts` (libellés arabes : Maintenance est réservée à l'administrateur, libellés français
  seulement si Issam le préfère), `supabase/` (migration, test, fonction, `config.toml`), `outils/tablettes/`,
  éventuellement `web/src/app/(app)/parametres/` (Q5), `mobile/README.md`, `docs/etat-avancement.md`.
- La partie native change : `apk.yml` (PR) et `apk-dev.yml` compilent l'APK ; aucune publication aux tablettes sans la
  demande d'Issam.
- Dépôt public : aucun secret dans les fichiers (l'empreinte du certificat et l'adresse de la fonction ne sont pas des
  secrets).
- Migration après `20261015300000…` (S21) : `20261016100000`.
