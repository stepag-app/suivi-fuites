# Tri des PR Dependabot (octobre 2026)

> Session du 2026-10-19 au soir. **Aucune PR fusionnée ni fermée** : Issam décide. Sources : diff (`gh pr diff`), CI
> (`gh pr checks` et journaux des jobs en échec), notes de version jointes par Dependabot, code de `web/` et `mobile/`,
> deux essais de compilation en local (§ 3).

## 0. Ce qu'il faut retenir

- Il y a **12** PR Dependabot ouvertes, pas 14 : #151 et #154 à #164. Les #152 et #153 sont des PR d'Issam (préparation
  des tablettes), déjà fusionnées.
- **#151 n'est pas un simple correctif.** Le postcss vulnérable (8.4.31) est **embarqué par `next` 15**. Pour le corriger,
  Dependabot passe `next` de 15.5.27 à **16.4.2** : #151 **est** la migration Next 16. Son diff est **identique** à celui
  de #163 (vérifié ligne à ligne). #160 ne recoupe pas la faille (elle laisse le postcss de `next` en 8.4.31) mais
  **entre en conflit** avec #151 sur `web/package-lock.json`.
- L'audit S20 avait déjà jugé cette faille **sans objet ici** (`docs/lots/chantier-v3-audit-s20.md`, S5 : faille à la
  compilation, sur du CSS d'origine extérieure). Rien ne presse donc côté sécurité.
- Next 16 coûte presque rien : la CI, la prévisualisation Vercel et un essai local compilent le panneau sans aucune
  modification du code. Restent des essais à l'écran (§ 2).
- Les 4 PR de l'Expo SDK 58 (#155, #156, #158, #159) ne se fusionnent **pas une par une**. Elles mélangent les
  SDK 57 et 58, et trois des quatre cassent la compilation de l'APK. La migration se fera en **une seule PR**, après la
  mise en service, et elle impose une **nouvelle APK** (§ 4).

## 1. Tableau

CI : ✅ verte, ❌ rouge. « Types et compilation » = `web.yml`, « APK » = `apk.yml` et `apk-dev.yml`.

| PR | Paquets | Type | CI | Risque | Recommandation |
|---|---|---|---|---|---|
| [#151](https://github.com/stepag-app/suivi-fuites/pull/151) | `postcss` (embarqué par `next`) 8.4.31 → 8.5.23 ; **`next` 15.5.27 → 16.4.2** | sécurité, mais **majeure** | ✅ types, compilation, Vercel | moyen : nouvelle version majeure, et le panneau sert aussi la mini-carte et la carte de balayage dans la WebView de l'APK | **À tester d'abord** (§ 2.2), puis fusionner **à la place de #163** |
| [#163](https://github.com/stepag-app/suivi-fuites/pull/163) | `next` 15.5.27 → 16.4.2 | majeure | ✅ | celui de #151 | **Doublon de #151** (même diff). Ne pas la fusionner à part : Dependabot la fermera de lui-même une fois #151 fusionnée |
| [#160](https://github.com/stepag-app/suivi-fuites/pull/160) | groupe web, 11 paquets : `maplibre-gl` 6.12 → 6.14, `@maplibre/geojson-vt` 6.1.2 → 6.2.0, `radix-ui` 1.7 → 1.8.1, `docx` 9.8.1 → 9.11.0, `lucide-react` 1.52 → 1.57, `jspdf-autotable` 5.0.8 → 5.0.9, `react` / `react-dom` 19.3.0 → 19.3.1, `@supabase/supabase-js` 2.117.2 → 2.118.0, `postcss` 8.5.29 → 8.5.30, `shadcn` 4.21.2 → 4.21.5 | mineures et correctifs | ✅ | faible à moyen : MapLibre (cartes du panneau **et des tablettes**), boîtes de dialogue et menus (radix), export Word | **À tester d'abord** (§ 2.1). Fusionner **avant** #151 |
| [#154](https://github.com/stepag-app/suivi-fuites/pull/154) | actions : `checkout` 4 → 7, `setup-node` 4 → 7, `setup-java` 4 → 6, `upload-artifact` 4 → 7, `download-artifact` 4 → 8, `supabase/setup-cli` 1 → 3 | majeures d'actions | ✅ (APK compilée, APK dev, migrations et RLS, web) | faible, mais `setup-cli` v3 et `download-artifact` v8 **ne tournent pas sur une PR** | **À tester d'abord** : fusionner, puis lancer à la main les workflows de sauvegarde et de restauration (§ 2.3) |
| [#157](https://github.com/stepag-app/suivi-fuites/pull/157) | `typescript` 6.0.3 → 7.0.2 (mobile) | majeure, outillage seulement | ✅ (types, essais sans pile, APK compilée) | très faible : TypeScript ne fait que vérifier les types ; Metro / Babel retire les types sans lui. Aucun effet sur l'APK | **À tester d'abord**, essai léger, sans APK (§ 2.4). Facultative |
| [#161](https://github.com/stepag-app/suivi-fuites/pull/161) | `typescript` 5.9.3 → 7.0.2 (web) | majeure | ❌ `tsc` (6 × TS2882), Vercel | bloquante tant que le panneau est en Next 15 | **À reporter** jusqu'après #151 (§ 3) : la migration tient alors en un seul fichier |
| [#162](https://github.com/stepag-app/suivi-fuites/pull/162) | `@types/node` 22.20.5 → 26.6.5 (web) | majeure, types seulement | ✅ | fond : décrit l'API de Node 26 alors que la CI tourne en Node 22. Une fonction de Node 26 passerait la vérification des types puis échouerait à l'exécution | **À reporter** (ne pas fusionner) : garder `@types/node` sur la version de Node réellement utilisée (22) ; passer en 24 le jour où la CI et Vercel passent en Node 24 |
| [#164](https://github.com/stepag-app/suivi-fuites/pull/164) | `@tanstack/react-table` 8.21.3 → 9.3.1 | majeure | ❌ `tsc` (44 erreurs), Vercel | élevé : nouvelle API | **À reporter après la mise en service** (§ 5) : aucun gain pour l'appli, migration de l'écran Fuites |
| [#155](https://github.com/stepag-app/suivi-fuites/pull/155) | groupe mobile, 7 paquets : `react-native` 0.86.3 → **0.88.0**, `react` 19.2.3 → 19.3.1, `@types/react` 19.2 → 19.3, `react-native-safe-area-context` 5.7 → 5.10.1, `react-native-svg` 15.15.4 → 15.16.0, `@react-native-community/datetimepicker` 9.1.0 → 9.2.1, `@supabase/supabase-js` 2.117.2 → 2.118.0 | « mineures » en semver, mais React Native 0.86 → 0.88 est une **montée majeure** | ❌ `tsc` (11 erreurs), APK dev (« Minimum supported Gradle version is 9.4.1 ») | élevé : ce sont les versions de l'**Expo SDK 58**, incompatibles avec le SDK 57 | **À reporter** avec la migration SDK 58 (§ 4) |
| [#156](https://github.com/stepag-app/suivi-fuites/pull/156) | `expo-build-properties` 57.0.22 → 58.0.10 | majeure (SDK 58) | ✅ APK compilée | moyen : module du SDK 58 dans un projet SDK 57, combinaison non prise en charge (`npx expo install --check` la signale) ; APK jamais essayée sur tablette | **À reporter** avec le SDK 58 |
| [#158](https://github.com/stepag-app/suivi-fuites/pull/158) | `expo-status-bar` 57.0.1 → 58.0.3 | majeure (SDK 58) | ❌ APK et APK dev (liaison automatique : « Field 'version' is required … Publication ») | élevé | **À reporter** avec le SDK 58 |
| [#159](https://github.com/stepag-app/suivi-fuites/pull/159) | `expo` 57.0.26 → 58.0.11 (seul) | majeure (SDK 58) | ❌ APK et APK dev (« Internal compiler error », plugin Gradle d'Expo) | élevé : Expo 58 sans React Native 0.88 ni les autres modules 58 | **À reporter** : migration en une PR (§ 4) |

Conflits vérifiés (`git merge-tree`) : #151 + #160 **en conflit** (`web/package-lock.json`) ; chacune passe seule sur
`main`. #154 ne touche pas les fichiers de #166 (clé R2 en lecture seule). #160 + #162 et #151 + #162 passent.

## 2. Ordre de fusion conseillé et essais à faire

1. **#154** (actions GitHub), puis essais § 2.3.
2. **#160** (groupe web), après les essais § 2.1. Dependabot remet ensuite #151 à jour de lui-même (sinon, commenter
   `@dependabot rebase` sur #151) ; la CI de #151 tourne alors sur Next 16 **avec** les nouvelles versions.
3. **#151** (Next 16 et postcss), après les essais § 2.2. #163 se ferme toute seule.
4. **#157** (TypeScript 7 de l'APK), facultative, après l'essai § 2.4.
5. Après la mise en service : #161 (dès que #151 est fusionnée, voir § 3), migration Expo SDK 58 (#155, #156, #158,
   #159 en une PR, § 4), react-table 9 (#164, § 5). #162 : ne pas fusionner.

Ne jamais modifier une branche `dependabot/...` à la main : Dependabot cesse alors de la tenir à jour. Les corrections
(par exemple `src/css.d.ts` pour #161) vont dans une PR à part.

### 2.1 #160 : à essayer sur sa prévisualisation Vercel

- **Cartes (MapLibre 6.14)** : `/carte` (fuites, couches), `/carte?mode=terrain`, `/carte?mode=balayage`, la
  mini-carte de « Nouvelle fuite » (`/mini-carte`), le suivi GPS (`/suivi-gps`) et Paramètres › Réseau (zonage).
  Ces pages sont aussi ouvertes **dans la WebView de l'APK** (`mobile/src/mini-carte.tsx`, `mobile/src/balayage.tsx`,
  `mobile/src/carte.tsx`) :
  elles changent sur les tablettes dès la mise en ligne du panneau, **sans nouvelle APK**.
- **Carte sans réseau (lot CH)** : depuis MapLibre 6.13, le worker est demandé avec un paramètre de version
  (`/maplibre/maplibre-gl-worker.mjs?v=6.14.0`, constaté dans `dist/maplibre-gl.mjs`). `public/sw.js` garde le
  worker **sans** ce paramètre (`garderCarte`) et le cherche sans `ignoreSearch`. La copie générale « réseau d'abord »
  du service worker garde aussi l'adresse avec `?v=` dès que la carte s'ouvre en ligne : en pratique, ça devrait
  marcher. **Essai à faire sur la tablette d'Issam** : après déploiement, ouvrir Balayage en ligne, préparer la carte
  sans réseau, passer en mode avion, rouvrir Balayage. En cas d'échec : `ignoreSearch` pour `/maplibre/` dans
  `sw.js` (PR à part).
- **Boîtes de dialogue et menus (radix-ui 1.8)** : une modale d'édition (fuite, utilisateur), un menu déroulant, un
  sélecteur de date, le volet latéral.
- **Exports** : un rapport Word (`docx` 9.11), un PDF avec tableau (`jspdf-autotable`), un Excel.

### 2.2 #151 (Next 16) : ce qui change, ce qu'il faut essayer

Ce qui a été vérifié dans le code : pas de `middleware.ts` (renommé `proxy.ts` en Next 16) ; `cookies()` déjà
attendu avec `await` (`src/app/(app)/layout.tsx`, `src/server/server-actions.ts`) ; paramètres de route lus par
`useParams` côté navigateur ; aucune configuration webpack (Turbopack devient l'outil par défaut de `next dev` et de
`next build`, et la compilation passe) ; CSP posée par `headers()` dans `next.config.mjs`, inchangée ; pas de
`next lint` (supprimé). Il faut Node 20.9 ou plus : la CI est en Node 22 ; **la version de Node du projet Vercel
est à vérifier** (Settings › Build and Deployment ; non lisible depuis cette session).

Effet de bord constaté à la compilation : Next 16 **réécrit `web/tsconfig.json`** (`jsx` passe à `react-jsx`, ajout
de `.next/dev/types/**/*.ts` dans `include`). Après la fusion, lancer `npm run build` dans `web/` et commiter ces deux
lignes dans une petite PR, sinon chaque compilation locale laisse le fichier modifié.

Essais sur la prévisualisation de #151 (lien dans la PR, contrôle « Vercel »), console du navigateur ouverte :
connexion ; liste des fuites (tri, pagination, filtres dans l'adresse) ; fiche d'une fuite avec photos ; les cartes du
§ 2.1 ; un export PDF, Excel et Word ; envoi d'un document par e-mail (`/api/email`) ; **aucune violation de CSP dans
la console** (même contrôle que la vérification d'exécution de PR #149) ; hors ligne : le service worker `/sw.js`
s'enregistre et une fiche déjà ouverte se rouvre en mode avion. Ensuite, sur la tablette d'Issam, après mise en
ligne : mini-carte de « Nouvelle fuite » et Balayage.

### 2.3 #154 (actions) : à lancer après la fusion

La CI de la PR a compilé les deux APK et passé les migrations et la RLS. Elle ne fait pas tourner ce qui utilise
`supabase/setup-cli` v3 et `download-artifact` v8 (déclenchés seulement sur `main`, à la main ou la nuit) :

- **Sauvegarde de la base** (Actions › Run workflow) : archive chiffrée, copie R2 et Drive. Changements : `setup-cli`
  v3 installe la CLI Supabase depuis npm (plus depuis les versions GitHub), et `version: latest` reste accepté.
  `download-artifact` v8 fait échouer le job si l'empreinte de l'archive ne correspond pas (avant : simple
  avertissement).
- **Test de restauration** (Run workflow) : pile Supabase locale, restauration.
- **Déploiement de la base** : il tournera à la prochaine migration fusionnée ; regarder qu'il reste vert.

Autres changements, sans effet ici : toutes ces actions passent en Node 24 (les machines de GitHub sont à jour) ;
`checkout` v6 range les identifiants dans un fichier à part (aucun workflow ne fait `git push`) ; `checkout` v7
durcit `pull_request_target` (pas utilisé). `.github/dependabot.yml` couvre déjà les actions.

### 2.4 #157 (TypeScript 7 de l'APK) : essai léger

`cd mobile && npm ci && npx tsc --noEmit && npx expo start` : le serveur démarre sans avertissement sur TypeScript.
Puis le banc web des écrans. **Pas d'APK à publier** : TypeScript ne sert ni à Metro ni à Gradle. Seul inconvénient :
l'APK serait en TypeScript 7 et le panneau en 5.9 tant que #161 n'est pas faite ; c'est sans conséquence.

## 3. TypeScript 7 sur le panneau (#161) : essais en local

Deux essais sur une copie de la branche de #161 :

| Essai | Résultat |
|---|---|
| `tsc --noEmit` tel quel | ❌ 6 × TS2882 : imports de CSS sans déclaration de type (`maplibre-gl/dist/maplibre-gl.css` × 5, `./globals.css`). TypeScript 7 vérifie désormais les imports « pour effet » |
| `tsc` avec `src/css.d.ts` contenant `declare module '*.css';` | ✅ |
| `next build` **Next 15.5.27** + TypeScript 7 | ❌ tous les alias `@/…` introuvables : Next 15 lit `tsconfig.json` par l'API JavaScript de TypeScript, absente de TypeScript 7 |
| `next build` **Next 16.4.2** + TypeScript 7 + `src/css.d.ts` | ✅ compilation, vérification des types (5 s) et 29 pages générées |

Migration après #151 : une PR qui ajoute `src/css.d.ts` (une ligne), puis `@dependabot rebase` sur #161.

## 4. Expo SDK 58 (#155, #156, #158, #159) : le travail de migration

Les versions proposées sont celles que fixe l'Expo SDK 58 (`bundledNativeModules.json` d'`expo` 58.0.11). Les
fusionner séparément mélange deux SDK. À faire en **une seule PR**, après la mise en service :

1. `cd mobile && npx expo install expo@^58.0.0 -- --fix` : aligne tous les `expo-*` sur 58, `react` 19.3.0,
   `react-native` 0.88.0, `react-native-safe-area-context` 5.10.1, `react-native-svg` 15.16.0, `datetimepicker`
   9.2.1 et **`react-native-webview` 13.16.1 → 14.0.1** (majeure ; c'est la WebView de la mini-carte, du balayage et
   de la carte terrain).
2. Gradle 9.4.1 au moins (régénéré par `expo prebuild` ; c'était l'échec de #155).
3. Corriger les 11 erreurs de types relevées par la CI de #155 : refs de `ScrollView` et `TextInput`
   (`src/ecrans.tsx`), `ListEmptyComponent` à `null` (`src/a-valider.tsx`, `src/ecrans.tsx`,
   `src/notifications.tsx`, `src/tableau.tsx`), `onRequestClose` d'une `Modal` (`src/mise-a-jour.tsx`).
4. Revoir le code natif maison avec React Native 0.88 : le module `modules/tablette-proprietaire` (Kotlin, propriétaire
   de l'appareil) et le plugin `plugins/okhttp-delais.js`.
5. APK de débogage (émulateur, puis tablette d'Issam) : connexion et session hors ligne, nouvelle fuite (GPS, photo,
   mini-carte), file d'envoi hors ligne, suivi GPS en arrière-plan (`expo-location`, `expo-task-manager`), notifications
   push, Balayage et carte terrain (WebView 14), fenêtre « Mise à jour disponible », verrouillage propriétaire.
6. **Nouvelle APK obligatoire** : publication à la main par Issam (workflow Application Android (APK) depuis `main`,
   `docs/manuel-exploitation.md` § 4), même keystore. Les tablettes la reçoivent par « Mise à jour disponible ».

Estimation : une session de travail plus une demi-journée d'essais sur tablette. Gain : rester sur un SDK suivi, et réduire
les 24 alertes `npm audit` de l'outillage Expo (audit S20, S5 : toutes à la compilation, aucune dans l'APK).

## 5. react-table 9 (#164) : le travail de migration

L'API change : `useReactTable`, `getCoreRowModel`, `getSortedRowModel`, `getPaginationRowModel` et `VisibilityState`
disparaissent ; `ColumnDef`, `Table`, `Row` et `ColumnMeta` prennent un type de « fonctionnalités » en plus. Six
fichiers, environ 880 lignes : `src/app/(app)/fuites/colonnes.tsx`, `fuites/page.tsx`, `fuites/vue-cartes.tsx`,
`src/components/tableau/outils-tableau.tsx`, `pagination-tableau.tsx`, `tableau-donnees.tsx`. Puis essai complet de
l'écran Fuites (tri, pagination, colonnes visibles, vue en cartes, export). Aucun gain pour l'appli : à faire quand la
v8 ne sera plus suivie.

## 6. Pour éviter que ça revienne (proposition, rien n'est fait)

Dans `.github/dependabot.yml`, ajouter des `ignore` :

- `mobile/` : `expo`, `expo-*`, `react`, `react-native`, `react-native-*`, `@react-native-community/*`, `@types/react`.
  Leurs versions sont fixées par le SDK Expo et se changent ensemble par `npx expo install --fix`, jamais une par une.
  Le groupe « mineures » ne protège pas ici : React Native est en 0.x, une montée « mineure » y est une version majeure.
- `web/` : `@types/node`, versions majeures (à aligner sur la version de Node de la CI et de Vercel).

Autre solution, sans toucher au fichier : commenter `@dependabot ignore this major version` sur #155, #156, #158, #159
et #162 (ce qui les ferme). C'est à Issam de décider.
