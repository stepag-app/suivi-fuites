# RAPPORT DE SÉCURITÉ — Suivi fuites (STEPAG / SRM Oriental)

> Audit offensif de pré-production, mené en local sur une copie jetable de la base.
> Branche `claude/audit-securite-durcissement`. Date : 2026-10-17.
> Cible : **local uniquement** (PostgreSQL 17 + migrations). Aucune requête vers la production,
> R2, Resend, Firebase, Dolibarr, Vercel. Aucun secret réel lu.

---

## 1. Résumé exécutif

L'autorisation de l'application est **entièrement en base** (RLS + 40 fonctions `SECURITY DEFINER`
+ déclencheurs). L'audit a donc porté l'essentiel de son effort là, avec un **banc d'essai PostgreSQL 17
reproduisant fidèlement l'enforcement PostgREST** (`SET ROLE authenticated` + `request.jwt.claims`),
sur lequel chaque faille a été **prouvée puis rejouée après correctif**.

**Verdict global : le noyau d'autorisation est solide.** Le cloisonnement multi-marchés, les escalades
de privilège classiques (auto-promotion admin, auto-attribution de droits), le contournement de
l'historique des prix, le figeage des attachements et la révocation d'accès **tiennent** — plusieurs
alertes théoriques ont été **réfutées à l'exécution** (10 faux positifs prouvés).

Les failles réelles trouvées sont surtout de **sévérité moyenne à basse** et relèvent de deux familles :

1. **Contrôles d'auteur manquants en base** (un agent agit sur l'objet d'un collègue du même marché) et
   **colonnes sensibles non gardées** (montant du marché, effet global Dolibarr). → **Corrigées** par une
   migration unique, avec test de non-régression pgTAP (le durcissement du `montant_ttc` du marché a été
   tenté puis **retiré** : il brisait le travail nominal du responsable — voir §5).
2. **Configuration et chaîne d'approvisionnement hors-code** : le dépôt GitHub **public**, la CI qui
   exécute des PR avec les **secrets de production**, les réglages Supabase Auth (inscriptions, rate-limit).
   → Les 6 failles **Hautes** sont **toutes** de ce type : elles se traitent dans les tableaux de bord
   (GitHub / Supabase / Vercel), pas dans le code. Voir §6.

**Décompte** (après vérification adversariale, doublons fusionnés) : 6 Hautes (toutes hors-code),
~18 Moyennes, ~28 Basses, 10 faux positifs prouvés.

**État au 19/10/2026** : #149 fusionnée et déployée, vérifiée en production (0 violation CSP, migration et 7 Edge Functions en service) ; H2–H6 corrigées par #150 ; H7–H9 réglées au tableau de bord Supabase ; H1 tranché (dépôt privé à la mise en production). Restent H10 (PR #166) et H11 (rotation des secrets), voir §4 et §6.

**Go / no-go (avant correctifs) : NO-GO tant que les 6 Hautes hors-code ne sont pas traitées** (§4). Les correctifs de code
de cette branche sont prêts et testés ; ils ne suffisent pas seuls car les risques les plus graves sont
dans la configuration du dépôt et de la CI.

---

## 2. Banc d'essai et limites

| Élément | État |
|---|---|
| PostgreSQL 17 + PostGIS + pgTAP, 66 migrations appliquées | ✅ banc jetable local (`security-tests/_bench.sh`) |
| Forge d'identité fidèle à PostgREST (`set role` + `request.jwt.claims`) | ✅ (`security-tests/_forge.sh`) |
| Matrice d'identités (admin, resp/detection/reparation/refection A, resp/detection B, inactif A) | ✅ (`_seed.sql`) |
| RLS / déclencheurs / RPC `SECURITY DEFINER` | ✅ rejoués (exploit **et** non-régression) |
| Pile Supabase complète (`supabase start`) | ❌ **Docker absent** sur la machine → Auth, Storage policies et Edge Functions non exécutées en conditions réelles |
| Edge Functions (Deno) | vérifiées en **boîte blanche** + `deno check` ; **non rejouées** faute de runtime Supabase local |
| Réglages tableaux de bord (Supabase/Vercel/Cloudflare/GitHub) | **non accessibles** en local → documentés en §6 |

Conséquence honnête : les correctifs **en base** sont prouvés par rejeu ; la **CSP** a été éprouvée à l'exécution en
local (`next dev` et build de production, mode démo, voir §3 bis) ; les correctifs **Edge** sont vérifiés statiquement.
Il reste à confirmer sur une **prévisualisation Vercel** les origines réelles (Supabase, R2) avant la
mise en production (détaillé où nécessaire).

---

## 3. Failles corrigées dans cette branche (code)

> Rejeu : `bash security-tests/lancer-tout.sh` + `supabase/tests/database/59_s20_durcissement_securite.test.sql`.

| ID | Famille (OWASP) | Sévérité | Surface (`fichier:ligne`) | Hypothèse | Preuve (banc) | Correctif | Rejeu |
|---|---|---|---|---|---|---|---|
| A1 | Broken Access Control (A01) | Moyenne | `reparation_ouvriers` — RLS `mig/20261004090400:203-209`, aucun trigger INSERT/DELETE | Un chef de réparation (`interventions/modifier=siennes`) ajoute/retire des ouvriers sur la réparation d'un **collègue** (main-d'œuvre → quantités/attachement) | INSERT/DELETE acceptés sur une réparation d'autrui | Déclencheur `controler_auteur_reparation_ouvriers` (SECURITY **INVOKER**) exigeant `peut(interventions,modifier,auteur,saisi_par)` + verrou de validation | ✅ refusé sur autrui, accepté sur la sienne (test 59 #5/#6) |
| A2 | Broken Access Control (A01) | Moyenne | `private.avant_insertion_balayage` `mig/20261006130000:619` | `agent_id = coalesce(client, auth.uid())` → usurper la **production terrain** (base du prix 1) en créditant un collègue | INSERT balayage `agent_id=<collègue>` accepté | `agent_id ≠ soi` exige `balayage/valider` + `est_affecte` (contrôle « saisie à la place ») | ✅ refusé (test 59 #1), légitime OK (#2) |
| A3 | Broken Access Control (A01) | Basse | `private.avant_insertion_saisie` `mig/20261016700200:121-135` | `photos.auteur_terrain_id` posé par le client sans contrôle (bloc limité à fuites/reparations/refections) | INSERT photo `auteur_terrain_id=<collègue>` accepté | Contrôle dédié aux photos : auteur ≠ soi ⇒ `photos/valider` + `est_affecte` | ✅ refusé (test 59 #3), légitime OK (#4) |
| A6 | Broken Access Control (A01) | Moyenne | `storage.objects` policy `photos_fichiers_envoi` `mig/20261004090600:22-28` | La règle d'INSERT ne vérifie que le dossier **marché** ; dépôt d'un objet sous la fuite d'autrui ou inexistante | INSERT `photos/<marché>/<fuite inexistante>/x.jpg` accepté | Helper `fuite_du_marche` ; la policy lie le 2e segment à une fuite non supprimée du marché | ✅ refusé (test 59 #11), vraie fuite OK (#12) |
| A7 | Broken Access Control (A01) | Basse | `private.est_affecte` `mig/20261009100200:102-110` | Ignore `profils.actif` **et** `affectations.actif` → attribuer une saisie à un agent désactivé | `est_affecte(agent désactivé)` = true | Jointure `profils.actif` + filtre `affectations.actif` | ✅ attribution à un agent désactivé refusée (test 59 #13) |
| B1 | Injection (A03) — CSV Formula Injection (CWE-1236) | Moyenne | `web/src/lib/export/generer.ts:16`, `web/src/lib/format.ts:150` | Une cellule texte commençant par `= + - @` (observation, adresse, référence SRM) ressort non neutralisée dans le CSV **envoyé par e-mail à la SRM** → exécution de formule à l'ouverture | Échappement limité à `" ; \r \n` ; charges `=HYPERLINK(...)`, `=WEBSERVICE(...)` écrites brutes | Helper unique `neutraliserFormuleCsv` (préfixe `'`), appliqué aux cellules **texte** (nombres/dates épargnés) | ✅ `security-tests/07-injection-csv.mjs` |
| C1 | Identification & Auth (A07) | Moyenne | `web/src/app/session/page.tsx` | `/session#access_token=…` ouvert dans un navigateur ⇒ **connexion forcée** (fixation de session) sur un compte attaquant | `setSession` accepte des jetons arbitraires du fragment | Page réservée au contexte APK (`estContexteApk()`), seul usage légitime | vérif. statique (tsc) ; rejeu navigateur à faire en préprod |
| C2 | Security Misconfiguration (A05) | Moyenne | `web/next.config.mjs:5` | CSP sans `script-src`/`default-src`/`connect-src` ⇒ une XSS exfiltre le jeton (`localStorage`) vers n'importe quel hôte | En-tête réel partiel | CSP complète dérivée de l'env (Supabase, R2, Esri, OpenFreeMap) + COOP/CORP | ✅ éprouvée en local (dev et prod), sur la prévisualisation et en production le 19/10 (§3 bis) |
| C3 | Security Misconfiguration (A05) | Moyenne | `web/src/lib/supabase.ts:15,34-38` | `NEXT_PUBLIC_MODE_DEMO=1` (connexion sans mot de passe) livrable en production sans garde | Aucune garde dans le code | Échec de build si `VERCEL_ENV=production` + `MODE_DEMO=1` | vérif. logique (local/preview non touchés) |
| C4 | Security Misconfiguration (A05) | Basse | `web/src/app/mini-carte/page.tsx:57-64` | Écouteur `message` sans contrôle d'origine | Confirmé (défense en profondeur) | Filtre d'origine (même origine ∪ canal APK) | vérif. statique |
| C5 | Security Misconfiguration (A05) | Basse | `web/src/server/server-actions.ts:18-27` | Cookie de préférence sans `HttpOnly/Secure/SameSite` | Confirmé (lecture serveur ⇒ httpOnly sûr) | `httpOnly` + `sameSite=lax` + `secure` (prod) | vérif. statique |
| C6 | Security Misconfiguration (A05) | Basse | pages d'erreur absentes ; `web/src/lib/format.ts:137-146` | Messages bruts de la base renvoyés au client (structure/contraintes) | Confirmé | `not-found.tsx` / `error.tsx` / `global-error.tsx` génériques | vérif. statique |
| D1 | Security Misconfiguration (A05) | Basse | `supabase/functions/reseau-tuiles/index.ts:108` | `droit?.modifier !== true` compare une énum à un booléen → responsables **toujours** refusés (bug de justesse, échoue fermé) | Confirmé | Comparaison à la portée réelle (`… ?? 'non') === 'non'`) | `deno check` |
| D2 | Sensitive Data Exposure (A02) | Basse → Info | `supabase/functions/photos-r2/index.ts:24,100` | URL de lecture R2 valables 24 h | Confirmé | `DUREE_LECTURE_MAX_S` 86400 → 7200 (2 h) | `deno check` |
| D3 | Sensitive Data Exposure (A02) | Basse | `supabase/functions/apk-enrolement/index.ts:12` | URL d'enrôlement signée 1 h | Confirmé | 3600 → 600 s (10 min) | `deno check` |
| D4 | Information Disclosure (A05) | Basse | `photos-r2:113`, `reseau-tuiles:117`, `dolibarr-mouvements`, `version-apk` | Messages d'exception bruts renvoyés au client | Confirmé | `catch` → message générique + `console.error` serveur | `deno check` |
| E1 | Vulnerable Components (A06) | Moyenne | `supabase/functions/*/index.ts` (6) | `npm:@supabase/supabase-js@2` (majeure flottante) → introduction de version non maîtrisée | Confirmé | Épinglé à `@2.117.2` (= clients) | `deno check` |
| F1 | Sécurité APK | Basse | `mobile/app.json` | `allowBackup` par défaut `true` → `adb backup` extrait la base AsyncStorage (jetons) | Confirmé | `android.allowBackup=false` | vérif. config |
| G1 | Secrets | Basse | `.gitignore` | `*.p12/*.pfx`, `*.gpg`, comptes de service JSON non ignorés | Confirmé | Motifs ajoutés | — |

---

## 3 bis. CSP — vérification d'exécution (2026-10-19)

Méthode : panneau lancé en local en mode démo (Supabase et Esri factices, rien de réel touché), d'abord `next dev`,
puis `next build` + `next start` ; parcours de la connexion, du tableau de bord, des fuites, d'une fiche avec photos,
de la carte, du suivi GPS, du balayage, des rapports (aperçu PDF), des attachements, des débits et de la mini-carte,
console du navigateur relevée à chaque écran. En parallèle, balayage statique de toutes les ressources chargées
(4 angles, puis un vérificateur adverse par blocage annoncé : 31 agents).

| Constat | Contexte | Effet sans correctif | Correctif |
|---|---|---|---|
| `next dev` utilise `eval` (React Refresh, source maps webpack) | développement | **le panneau ne s'hydratait plus en dev** (EvalError) | `'unsafe-eval'` ajouté **seulement** si `NODE_ENV !== 'production'` |
| Fond OpenFreeMap (`carte/commun.ts:61`, `STYLE_FOND`) | **production** | 6 cartes sans fond (« Fond de carte indisponible ») : suivi GPS, rapport de balayage imprimé, zonage, mini-carte de l'APK, saisie de position, carte sans fond local | `https://tiles.openfreemap.org` dans `connect-src` et `img-src` (style, tuiles, glyphes, icônes sur cette seule origine) |
| Photos fictives `picsum.photos` | démo seulement | photos de la démo vides | autorisé **seulement** si `NEXT_PUBLIC_MODE_DEMO=1` (jamais livré : garde de build) |
| `https://*.r2.dev` | — | inutile : aucun code ne produit d'URL r2.dev | retiré |
| Aperçu PDF des rapports (`<iframe src=blob:>`) | production | aperçu gris dans le navigateur intégré, **identique avec `object-src` assoupli** : limite du navigateur intégré, pas de la CSP ; `object-src 'none'` était déjà en production avant #149 | aucun : **vérifié le 19/10 dans Chrome** (prévisualisation et production), le PDF s'affiche avec `object-src 'none'` |
| Erreur « unknown error when fetching the script » (worker MapLibre) | build de prod | aucune : la carte s'affiche | aucun : **reproduite à l'identique avec les en-têtes d'origine de `main`** (préexistante) |
| Barre d'outils Vercel (`vercel.live`) | prévisualisations seulement | rejets en console, appli intacte | facultatif : la désactiver pour les prévisualisations (Vercel › Settings › General › Vercel Toolbar) |

Vérification en production (19/10, après fusion) : CSP servie à l'identique, **HSTS posé par Vercel** (`max-age=63072000`), carte (fond local, réseau par `reseau-tuiles`), suivi GPS, aperçu PDF, et **Rapport PDF d'une fiche avec ses 2 photos R2**, le tout sans violation (écouteur `securitypolicyviolation`, contrôlé par un témoin).

Recommandation : poser dans Vercel `NEXT_PUBLIC_R2_PUBLIC_HOST = https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`
pour verrouiller `connect-src`/`img-src` sur le seul compte R2 de STEPAG (le joker par défaut couvre tout compte R2 ;
l'identifiant de compte n'est pas un secret, il figure dans chaque URL signée). Cette valeur **remplace** le joker.

Constats annexes (hors sécurité) : le `node_modules` local du Mac était désynchronisé du `package-lock`
(`@protomaps/basemaps`, `qrcode-generator` manquants — cause des 4 erreurs `tsc` vues au départ ; `npm install`
les règle, lockfile inchangé) ; en mode démo, **Paramètres** plante (`ReglagesSuiviGps`) car le marché fictif n'a pas
les champs `suivi_gps_*` (en base réelle ils sont `NOT NULL` avec défaut : pas d'effet en production).

## 4. Checklist Go / No-Go de mise en production

**Bloquants (NO-GO tant que non traités — tous hors-code, §6) :**
- [ ] **Rendre le dépôt GitHub privé** et nettoyer l'historique (données contractuelles, identifiant admin, réf. projet Supabase). *Décidé le 18/10 : public pendant le développement, privé à la mise en production.*
- [x] **CI** (#150) : empêcher les PR d'utiliser les secrets de production (environnements protégés, `pull_request` sans secrets de prod, keystore hors `GITHUB_ENV`).
- [x] **`deployer-base.yml`** (#150, premier déploiement réussi le 19/10) : restreindre le `workflow_dispatch` à `main` + environnement protégé avec relecteur.
- [x] **Supabase Auth** (18/10) : inscriptions fermées, connexions anonymes désactivées, mot de passe ≥ 12 avec minuscules/majuscules/chiffres. Protection des mots de passe divulgués : plan Pro seulement. Rate-limit laissé par défaut (tablettes derrière la même IP 4G/5G).
- [x] **Supabase Data API** (18/10) : confirmé que seuls `public` et `graphql_public` sont exposés (jamais `private`).
- [ ] **Mot de passe admin fort + 2FA** sur le compte applicatif `issam` (identifiant public dans le dépôt). *Mot de passe fort confirmé ; la 2FA des comptes de l'appli reste une évolution à faire.*

**Fortement recommandés avant go-live :**
- [x] Sur la **prévisualisation Vercel** de #149 puis **en production** (19/10) : photos R2, carte, suivi GPS, aperçu PDF, Rapport PDF avec photos ; 0 violation CSP.
- [ ] Poser `NEXT_PUBLIC_R2_PUBLIC_HOST` dans Vercel pour verrouiller R2 sur le compte STEPAG (§3 bis).
- [ ] Vercel **Pro**. *HSTS confirmé (2 ans) et prévisualisations protégées par l'authentification Vercel : vérifiés le 19/10.*
- [ ] R2 : clé **lecture seule** distincte pour `apk-enrolement`/lecture (PR #166, à remettre à jour sur `main` puis à activer) ; limite de taille d'objet (ou dépôt via POST présigné `content-length-range`).
- [ ] Révocation des sessions après changement de mot de passe (§5).
- [ ] Installer Sentry ; planifier les mises à jour Expo/Next. *Dependabot actif depuis #150 : 14 PR à trier (majeures next 16, TypeScript 7, Expo 58 à tester avant fusion).*

**Acceptables en l'état (résidus documentés, §5) :** lecture intra-marché du plan réseau, journaux Dolibarr globaux, file d'envoi hors-ligne mono-compte par appareil, codes de tablette non salés.

---

## 5. Résidus connus (non corrigés — choix d'équilibre ou hors périmètre code)

| Sujet | Sévérité | Pourquoi non corrigé ici | Recommandation |
|---|---|---|---|
| **Révocation de session après changement de mot de passe** (`gerer-utilisateurs`) | Moyenne | `supabase-js@2.117` n'expose pas de « déconnexion par id d'utilisateur » fiable (`admin.signOut` prend un JWT) ; un correctif aveugle risquerait de casser le flux admin non testable en local | Appeler l'API admin GoTrue de déconnexion globale de l'utilisateur après `updateUserById`, à valider en préproduction |
| **File d'envoi hors-ligne partagée entre comptes** (`mobile/src/file-attente.ts`) | Moyenne | Cloisonner la file par compte touche le cœur du mode hors-ligne (risque de perte de données en cours de synchro) ; à concevoir avec soin | Clé de file par `profil_id` + purge au changement de compte ; tester la bascule de compte hors ligne |
| **Admin-sur-admin / dernier admin** (`gerer-utilisateurs`) | Basse | L'auto-révocation est déjà bloquée ; une garde « dernier admin » serait un no-op (l'acteur reste admin). Le vrai durcissement (interdire d'agir sur un autre admin) est une **politique** qui pourrait gêner l'exploitation | Décider d'une règle « deux admins » ou d'une procédure de secours |
| **Plafond de taille / type sur le PUT R2 présigné** (`photos-r2`) | Moyenne→Basse | Imposer la taille exige un POST présigné (`content-length-range`) = réécriture du chemin d'upload web **et** APK (lourdeur + risque). Le type est déjà `image/jpeg` côté clients | POST présigné, ou limite d'objet côté R2 (infra) |
| **`activer_produits_dolibarr` à effet inter-marchés** | Basse | L'activation « admin OU responsable (paramètres/modifier) » est une décision explicite ; le catalogue Dolibarr est unique (sans `marche_id`), partagé entre marchés par conception ; couvert par le test `11_articles_dolibarr` (correctif A5 tenté puis **retiré**) | Laisser tel quel ; si une séparation est voulue, un catalogue par marché serait un changement de modèle de données |
| **Intégrité du `montant_ttc` / identifiants légaux du marché** | Basse | Remplir la fiche du marché (titulaire ICE/IF/RC, montant, délai) est le travail **nominal** du responsable (`parametres/modifier`), confirmé par la suite de tests `02_parametres_marche` ; restreindre à l'admin **casse l'opérationnel** (correctif A4 initialement tenté puis **retiré**) | Si une séparation des tâches est exigée, créer un rôle « gestion de marché » distinct plutôt que de brider le responsable ; ou journaliser les changements de `montant_ttc` |
| **E-mail : destinataires libres hors carnet** (`reserver_envoi_email`) | Basse | Restreindre au carnet `destinataires_email` change le fonctionnement (flexibilité voulue ?) | Décision métier : liste blanche serveur, ou alerte sur destinataire hors carnet |
| **Journaux Dolibarr globaux / plan réseau intra-marché** | Basse / faux positif | Comportements **voulus** (base ERP unique sans `marche_id` ; fond de carte pour tous les agents du marché). Pas de fuite inter-marchés (prouvé) | Réserver à l'admin seulement si la SRM l'exige |
| **Codes de déverrouillage tablette non salés / non liés** | Basse | Changement du schéma de codes (lier à l'appareil + sel) ; usage interne encadré | Sel + liaison appareil/compte à la prochaine itération tablettes |
| **Filtre « heures de travail » GPS contournable** (décalage auto-déclaré) | Basse | Donnée déclarée par l'appareil ; impact faible | Recouper avec l'horodatage serveur |

---

## 6. Constats hors-code (tableaux de bord — à traiter par Issam)

**État au 19/10/2026** : H2–H6 corrigées (#150, 4 environnements protégés, secrets du keystore et de R2 déplacés) ; H7–H9 réglées au tableau de bord ; H1 tranché (privé à la mise en production) ; H10 en cours (#166) ; H11 à faire, avec le déplacement des autres secrets de production encore au niveau du dépôt vers leurs environnements.

> Ce sont les risques les plus graves (les 6 Hautes y sont). Ils ne sont **pas** dans le code et ne peuvent
> être ni prouvés ni corrigés en local. **Ne lancer aucun workflow CI pour les tester.**

| # | Sévérité | Constat | Emplacement | Action |
|---|---|---|---|---|
| H1 | **Haute** | Dépôt GitHub **public** : schéma, RLS, identifiant admin (`mig/20261010500000`), données contractuelles du marché (`mig/20261004090700`, 471 l.), réf. projet Supabase | GitHub | Passer le dépôt **privé** ; réécrire l'historique si les données contractuelles doivent disparaître |
| H2 | **Haute** | PR de branche interne **signe l'APK avec la clé de production** et exporte le mot de passe du keystore dans `GITHUB_ENV` | `.github/workflows/apk.yml:161-212` | Signature prod réservée à `main`/tag + environnement protégé ; ne jamais exporter le mot de passe en clair |
| H3 | **Haute** | PR déclenche une **vraie sauvegarde de la base de production** (`secrets: inherit`) | `test-restauration.yml:66-73` | Retirer le déclencheur `pull_request` ou l'isoler sans secrets de prod |
| H4 | **Haute** | PR exécute un **inventaire de purge contre la production** (code contrôlé par la PR) | `purge-mise-en-service.yml:18-22,59-75` | Idem : pas de secrets de prod sur `pull_request` |
| H5 | **Haute** | **Déploiement en production par `workflow_dispatch` depuis n'importe quelle branche**, sans environnement protégé | `deployer-base.yml:28` | Restreindre à `main` + `environment:` avec relecteur obligatoire |
| H6 | **Haute** | Aucun **environnement GitHub protégé** : tous les jobs à secrets de prod s'exécutent sans garde d'approbation ; artefacts (sauvegardes chiffrées 30 j, APK signées 14 j) téléchargeables | `.github/workflows/*` | Créer des environnements protégés ; limiter la rétention/visibilité des artefacts |
| H7 | Moyenne | **Inscriptions Supabase Auth** peut-être ouvertes : la clé anon est extractible de l'APK (`apk-enrolement`), le déclencheur crée un profil **actif** (mais **jamais admin** — prouvé) | Dashboard Supabase | Fermer les inscriptions ; désactiver les connexions anonymes |
| H8 | Moyenne | Pas de **rate-limit applicatif** au login ; identifiant admin public | Dashboard Supabase | Rate-limit Auth ; mot de passe admin fort + 2FA |
| H9 | Moyenne | Vérifier que la Data API n'expose **que** `public`/`graphql_public` (jamais `private`, où vivent 30 fonctions DEFINER dont certaines sans contrôle d'appelant) | Dashboard Supabase | Confirmer `Exposed schemas` |
| H10 | Moyenne | **R2** : un seul compartiment, une seule clé lecture+écriture partagée par 4 fonctions dont `apk-enrolement` (publique) | Cloudflare | Clé lecture seule dédiée ; compartiment distinct pour les sauvegardes |
| H11 | Basse | Rotation des secrets « oubliés » (Resend, Dolibarr, Cloudflare Access, clés machine `x-cle-push`/`x-cle-synchro`) | divers | Rotation + Dependabot/secret scanning GitHub |

---

## 7. Faux positifs prouvés (contrôles qui tiennent — aucune action)

Rejoués sur le banc, **réfutés** : auto-promotion `profils.est_admin` (trigger `proteger_profil`) ;
auto-attribution de droits / auto-affectation (RLS admin) ; modification directe de `prix.pu_ht`
(trigger `proteger_prix`) ; forçage de statut / réouverture d'attachement (trigger `controler_lot`) ;
modification d'un balayage existant (gelé hors annulation) ; **lecture/écriture croisée A↔B** (RLS +
`figer_marche` + clés composites) ; révocation d'accès effective immédiatement (`mes_marches`/
`marches_autorises` filtrent `actif`) ; course de double-dépense du quota e-mail (`pg_advisory_xact_lock`) ;
injection d'un `prix_id` d'un autre marché dans un attachement (FK composites) ; XSS e-mail/carte/QR
(échappement/DOM corrects) ; SSTI/eval (absents).
