# Chantier v3, session S20 : audit complet (Z1), constats et correctifs

> Audit du 2026-10-11 (Fable 5.1, effort max), sur `main` après la fusion des vagues 1 et 2 (PR #101 à #105) et de la
> PR #102. Ordre de priorité du plan (`docs/lots/chantier-v3.md` § 1, Z1) : sécurité, fiabilité, qualité, performances,
> polish. Tâche 0 d'abord : plus de version de l'APK publiée à chaque fusion (PR #106). Correctifs regroupés par zone de
> fichiers, une PR par zone, fusionnées dès CI verte (décision Q6). Aucune APK publiée pendant la session.

## 1. Résumé

| Gravité | Constats | Corrigés | Laissés (raison au § 2) |
|---|---:|---:|---:|
| Critique | 0 | — | — |
| Important | 2 | 2 (PR #108, #111) | 0 |
| Mineur | 9 | 5 (PR #108, #109, #111) | 4 |
| Vérifié conforme | 17 | — | — |

PR de la session : [#106](https://github.com/stepag-app/suivi-fuites/pull/106) (tâche 0 : workflow APK à la main),
[#108](https://github.com/stepag-app/suivi-fuites/pull/108) (panneau web), [#109](https://github.com/stepag-app/suivi-fuites/pull/109)
(APK), [#111](https://github.com/stepag-app/suivi-fuites/pull/111) (base et fonctions serveur),
[#112](https://github.com/stepag-app/suivi-fuites/pull/112) (libellé affiché aux tablettes, mode d'emploi de la publication
pour une session Claude), puis cette note. Toutes fusionnées et déployées (§ 3). La PR
[#107](https://github.com/stepag-app/suivi-fuites/pull/107) (autre session, docs : keystore gardé, première version
`1.0.0-beta.1`) a été fusionnée pendant la session ; la PR [#110](https://github.com/stepag-app/suivi-fuites/pull/110)
(autre session, filtre des notifications par marché) est restée ouverte, hors de cet audit.

**Tâche 0 (décision d'Issam du 2026-10-11)** : `.github/workflows/apk.yml` ne compile ni ne publie plus sur un push de
`main` (types et essais seulement) ; sur une PR, Gradle ne tourne que si un fichier natif change (`app.json`,
`app.config.js`, `plugins/`, `package.json`, `package-lock.json`) ou le workflow ; la publication R2 n'existe plus que par
`gh workflow run apk.yml --ref main -f version=… -f libelle=… -f publier=true`, à la demande d'Issam, par une session
Claude (mode d'emploi : `mobile/README.md` § Publier une version aux tablettes). `versionCode` = numéro du run, toujours
croissant ; première version : `1.0.0-beta.1`, libellé « 1.0 bêta » (PR #107). **Aucune APK publiée pendant S20** ; la
dernière publiée reste `1.0.152` (run 152, avant la tâche 0).

## 2. Constats

### Sécurité

| # | Gravité | Zone | Constat | Décision |
|---|---|---|---|---|
| S1 | **important** | `web/` | En production, seule la `Strict-Transport-Security` de Vercel était posée : ni `Content-Security-Policy`, ni `X-Frame-Options` (détournement de clic possible sur les pages connectées), ni `X-Content-Type-Options`, ni `Referrer-Policy`, ni `Permissions-Policy` | **corrigé** (#108) : `next.config.mjs` pose `CSP frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'`, `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), geolocation=(self), microphone=()`, `X-Powered-By` retiré ; relus sur `fuites.stepag.ma` après déploiement. Pas de `script-src` (cartes, workers, blobs, URL signées : liste fragile ; la sécurité des données reste celle de la RLS) |
| S2 | mineur | `mobile/` | Les WebView Balayage et mini-carte traitaient tout message `postMessage` sans vérifier la page qui l'envoie (le filtre de navigation limitait déjà la WebView au domaine du panneau) | **corrigé** (#109) : message ignoré si `nativeEvent.url` n'est pas une page du panneau |
| S3 | mineur | `supabase/functions/dolibarr-mouvements` | `tout: true` (relecture de tout l'historique Dolibarr) accepté de tout compte qui voit le rapprochement ; le panneau ne le propose qu'à l'administrateur | **corrigé** (#111) : réservé à l'administrateur (403 sinon) |
| S4 | mineur | `supabase/functions/gerer-utilisateurs` | `profil_id` et `marche_id` passés tels quels (`String(...)`) à l'API d'administration de Supabase | **corrigé** (#111) : uuid exigé, 400 sinon |
| S5 | mineur | `web/`, `mobile/` | Dépendances : panneau, `npm audit --omit=dev` 9 vulnérabilités (braces et micromatch par la CLI `shadcn` rangée en `dependencies` ; postcss embarqué par `next`) ; APK, 24 vulnérabilités (braces, node-forge, uuid), toutes dans l'outillage Expo / Metro de compilation, aucune dans le code embarqué | **partiel** : `shadcn` passée en `devDependencies`, `vaul` retirée (#108) : 9 → 2. **Laissé** : le postcss de `next` (correctif = Next 16, changement majeur ; faille au moment de la compilation, sur du CSS d'origine extérieure, sans objet ici) et l'outillage Expo (Expo SDK 58 : changement majeur, à faire hors audit) |
| S6 | mineur | `.github/workflows` | Actions tierces épinglées par tag majeur (`actions/checkout@v4`, `supabase/setup-cli@v1`…) et non par SHA | **laissé** : pratique courante, dépôt sans `pull_request_target`, `permissions: contents: read` partout, secrets hors des PR de forks |
| S7 | mineur | `supabase/functions/*` | `Access-Control-Allow-Origin: *` sur les six fonctions | **laissé** (décision) : authentification par jeton porteur, jamais par cookie ; restreindre l'origine casserait les aperçus Vercel et le développement local sans gain réel |
| S8 | mineur | `mobile/` | Session Supabase gardée dans `AsyncStorage` (non chiffré) | **laissé** : réglage standard de supabase-js pour React Native ; `expo-secure-store` limite chaque valeur à 2 Ko (session plus grosse) ; appareil professionnel, verrouillé |
| S9 | vérifié | base | **RLS activée sur les 57 tables** de `public` (seule `private.compteurs` est sans RLS : schéma non exposé par l'API, aucun privilège hors propriétaire) ; aucune table avec RLS sans règle ; **27 vues toutes en `security_invoker`** ; `anon` sans aucun privilège sur `public` et `private` ; rien pour `PUBLIC` ; privilèges explicites table par table ; `DELETE` seulement sur 9 tables de paramétrage ou propres au compte (jamais une donnée terrain) | conforme |
| S10 | vérifié | base | **191 fonctions** (56 `public`, 135 `private`) : toutes les `SECURITY DEFINER` ont `search_path = ''` ; les 30 fonctions `SECURITY DEFINER` de `public` exécutables par `authenticated` contrôlent l'appelant (`private.peut`, `marches_autorises`, `est_admin`, `controler_affectation_suivi`, `mes_marches`, `marches_emails`, `envoye_par = auth.uid()`) ; les 20 fonctions `SECURITY INVOKER` s'appuient sur la RLS ; `verifier_cle_push`, `verifier_cle_synchro_dolibarr`, `recevoir_envoi_dolibarr`, `prendre_notifications_push`, `retirer_jetons_push`, `generer_alertes_*` : `service_role` seulement | conforme |
| S11 | vérifié | base | Règles RLS écrites en `(select private.…)` (évaluées une fois par requête) ; `proteger_profil` (un compte ne change que sa langue), `proteger_marche` (code et activation réservés à l'administrateur), verrous de sécurité `verrous_admin` propres au compte ; Storage : 4 compartiments privés (`photos`, `evenements`, `logos`, `debits`) avec règles ; schéma `private` : `USAGE` et 46 fonctions pour `authenticated`, nécessaires aux vues `security_invoker` et aux déclencheurs, schéma non exposé par l'API | conforme |
| S12 | vérifié | fonctions serveur | `version-apk`, `photos-r2`, `reseau-tuiles`, `dolibarr-mouvements` (bouton) : jeton vérifié par `auth.getUser`, lectures sous la RLS de l'appelant (clé anon + jeton), jamais `service_role` ; `gerer-utilisateurs` : administrateur actif seulement ; `envoyer-push` et la lecture Dolibarr planifiée : clé d'appel tirée au hasard par la base, vérifiée par `service_role` ; clés R2, Firebase, Dolibarr et Cloudflare Access : secrets des fonctions seulement, posés par « Déploiement de la base » | conforme |
| S13 | vérifié | `web/` | Route `POST /api/email` : jeton de l'appelant, `reserver_envoi_email` sous RLS, clé Resend côté serveur ; variables lues : aucun secret en `NEXT_PUBLIC_` (13 variables recensées) ; `/session` : jetons dans le fragment, effacés par `replaceState`, `suiteSure` n'accepte qu'un chemin relatif ; `sw.js` : jamais d'appel Supabase ni de donnée par fuite ; pas de `dangerouslySetInnerHTML` sur du contenu utilisateur (script de thème et graphiques shadcn seulement) ; `window.open` toujours avec `noopener` | conforme |
| S14 | vérifié | historique git | Recherche sur tout l'historique (toutes branches) : JWT, clés AWS / Resend / GitHub / Google, clés privées, `service_role`, mots de passe en clair, secrets de 64 hexadécimaux : **rien**, hormis le mot de passe d'essai `motdepasse1` de scripts d'essai locaux. `.gitignore` couvre `.env*`, keystore, `*.sql` hors du projet, `data-private/`, `rclone.conf`. `gitleaks` complet prévu en S23 | conforme |

### Fiabilité

| # | Gravité | Zone | Constat | Décision |
|---|---|---|---|---|
| F1 | **important** | `web/api/email`, base | Un envoi d'e-mail réservé (`reserver_envoi_email`) puis jamais clos (`terminer_envoi_email`) restait « en cours » pour toujours : il comptait dans les limites du jour (20 par marché, 90 au total) et restait affiché « en cours ». Cause probable sur Vercel Hobby sans Fluid compute : fonction tuée après 10 s pendant l'envoi d'une pièce de 4 Mo à Resend (30 s de délai prévu) | **corrigé** : `maxDuration = 60` sur la route (#108) ; migration `20261015100000` : les envois en cours depuis plus de 15 min passent en « échec » (motif « Envoi interrompu… ») avant le décompte du jour, test 48 (#111) |
| F2 | vérifié | `mobile/`, `web/` | Files d'attente hors ligne : identifiants créés sur l'appareil (renvoi sans doublon), une synchro à la fois, ordre fuite → réparation → pièces → photos → réfection, coupure = reprise au tour suivant, délais (60 s par requête, 3 min par photo, OkHttp 15 s), session hors ligne (1,5 s) ; 283 vérifications sans pile de l'APK, 23 du cache des fiches du panneau | conforme |
| F3 | vérifié | base | Tâches `pg_cron` : `alertes-reparation` (15 min), `envoi-push` (5 min), `lecture-dolibarr` (15 min), `alertes-suivi-gps` (5 min), créées par les migrations si l'extension existe ; la synchronisation Dolibarr tourne en production (confirmée le 2026-10-10), donc l'extension et les tâches y sont ; appels `pg_net` avec la clé d'appel en en-tête, 10 s de délai, erreur journalisée sans bloquer | conforme ; geste 1 (§ 4) |
| F4 | vérifié | `.github/workflows`, `outils/sauvegarde` | Sauvegarde nocturne chiffrée (GitHub 30 j, R2 30 j, Drive 30 quotidiennes + 12 mensuelles), photos et APK sur le Drive, test de restauration hebdomadaire depuis le Drive dans une base vierge, essais des scripts de copie, résumé d'exécution, alerte sous 48 h ; `concurrency` sur chaque job ; aucun secret dans les journaux | conforme |
| F5 | info | Supabase | Plan gratuit : pause après 7 jours sans activité ; la sauvegarde nocturne (connexion à la base) et l'usage quotidien l'écartent | rien à faire |

### Qualité

| # | Gravité | Zone | Constat | Décision |
|---|---|---|---|---|
| Q1 | mineur | `web/` | 17 fichiers jamais importés (15 composants shadcn, `hooks/use-lg.ts`, `lib/ui/Indicateur.tsx`), 5 imports inutilisés, dépendance `vaul` sans usage ; lien `target="_blank"` sans `rel` | **corrigé** (#108) ; `tsc --noUnusedLocals` propre sur le panneau et l'APK |
| Q2 | mineur | `web/` | 10 écrans encore habillés par `ancien.css` (221 lignes) : attachement (fiche, hors bordereau), balayage, carte, fournitures (inventaire, rapprochement), paramètres, utilisateurs, session | **laissé** : conversion = chantier d'interface, pas un correctif d'audit ; l'habillage rend ces écrans cohérents (mode sombre compris) ; à décider pour S21 ou après la mise en production |
| Q3 | vérifié | tout | Aucun `console.log`, aucun `TODO` / `FIXME` ; `tsc` strict propre ; dictionnaire de l'APK typé (`t()`) ; chaque module serveur a son script de vérification (22 `verifier-*.mjs`) | conforme |
| Q4 | mineur | `mobile/` | Node affiche un avertissement `MODULE_TYPELESS_PACKAGE_JSON` à chaque essai sans pile (`package.json` sans `"type"`) | **laissé** : cosmétique ; ajouter `"type": "module"` toucherait Metro |

### Performances

| # | Gravité | Zone | Constat | Décision |
|---|---|---|---|---|
| P1 | vérifié | base | Sur la base d'essai à 3 025 fuites et 48 461 balayages (PostgreSQL 17, rôle `authenticated`, RLS) : liste `v_fuites` (1 000 lignes) 12 ms, `compter_fuites` 4 ms, photos d'une fuite 1 ms, balayages d'un agent 13 ms. Environ 120 clés étrangères sans index dédié (`saisi_par`, `*_par`, `auteur_terrain_id`, clés composites `(marche_id, …)`), toutes sur des colonnes peu interrogées ou couvertes par un index existant (`fuites_secteur_idx`, `photos_fuite_idx`, `reparations_fuite_idx`, `troncons_marche_secteur_idx`…) | **laissé** : aucun effet mesurable aux volumes du marché (moins de 10 000 fuites par an) ; à revoir si une page ralentit |
| P2 | vérifié | `web/` | Build : premier chargement de 207 à 410 Ko par page (`/debits` 410 Ko, `/alertes` 367 Ko), bibliothèques d'export et MapLibre chargées à la demande ; lecture par pages de 1 000 avec plafond signalé | conforme (mesures de l'essai de charge inchangées) |
| P3 | vérifié | `mobile/` | CPU au repos et démarrage déjà mesurés (PR #48, #51, #53) ; rien de nouveau dans `mobile/` depuis | conforme |

### Polish

| # | Gravité | Zone | Constat | Décision |
|---|---|---|---|---|
| U1 | vérifié | `web/` | Mode démonstration (`NEXT_PUBLIC_MODE_DEMO=1`, port local) : connexion, liste des fuites, tableau de bord : textes en français, boutons principaux larges, interface sobre (« Studio Admin ») ; aucune faute ni anglicisme relevé sur ces écrans | conforme |

## 3. Vérifications rejouées

| Vérification | Résultat |
|---|---|
| pgTAP, PostgreSQL 17 + PostGIS, toutes les migrations dont `20261015100000` | **1 412 tests verts** (48 fichiers, dont le nouveau 48 : 7) ; CI GitHub (PostgreSQL 16) verte sur #111 |
| Catalogue de la base (RLS, règles, privilèges, vues, fonctions, déclencheurs, Storage) | requêtes sur `pg_class`, `pg_policies`, `information_schema`, `pg_proc` : § 2 S9 à S11 |
| Panneau : `tsc --noUnusedLocals`, `next build`, 22 scripts `scripts/verifier-*.mjs` | verts ; en-têtes relus sur `next start` local puis sur `fuites.stepag.ma` |
| APK : `tsc`, 5 essais sans pile | verts (49 + 48 + 52 + 37 + 97 = 283 vérifications) |
| Fonctions serveur | `deno check` des deux fonctions modifiées ; déployées par « Déploiement de la base » à la fusion de #111 |
| `npm audit --omit=dev` | panneau : 9 → 2 (postcss de `next`) ; APK : 24, outillage de compilation seulement |
| Historique git | recherche de secrets sur toutes les branches : rien |
| Base d'essai à 3 000 fuites (`charge_3000`) | durées des requêtes sous RLS : § 2 P1 |
| CI de `main` après chaque fusion | « Application Android (APK) » (types et essais seulement), « Base de données », « Panneau web », « Déploiement de la base » (#111) verts |

Non rejoué : parcours sur la tablette et l'émulateur (partagés avec Issam ; aucun changement de comportement visible des
agents dans cette session), publication d'une APK (interdite pendant S20).

## 4. Gestes et décisions attendus d'Issam

1. **Tâches planifiées en production** (une fois, SQL Editor) : `select jobname, schedule from cron.job order by 1;` doit
   lister `alertes-reparation`, `alertes-suivi-gps`, `envoi-push`, `lecture-dolibarr`. Déduit en service par la
   synchronisation Dolibarr ; une lecture directe le confirme.
2. **Version de l'APK** : décision prise par la PR #107 (`1.0.0-beta.1`, « 1.0 bêta ») ; publication à sa demande seulement
   (`mobile/README.md` § Compilation : `gh workflow run apk.yml --ref main -f version=1.0.0-beta.1 -f publier=true`).
   L'APK de `main` contient les correctifs #109 (WebView) et les changements de l'autre session s'ils sont fusionnés avant.
3. **PR #110** (filtre des notifications par marché, autre session) : à fusionner après sa CI, hors de cet audit.
4. **Écrans `.ancien`** (Q2) : garder l'habillage, ou prévoir une session de conversion après la mise en production.
5. **Workflow `apk-dev.yml`** : compile encore l'APK de développement (13 min) à chaque fusion dans `main` qui touche un
   fichier natif ; à passer en déclenchement manuel aussi si les minutes d'Actions comptent une fois le dépôt privé.
6. Facultatif, tableau de bord Supabase › Authentication : longueur minimale de mot de passe à 8 (la fonction serveur
   l'impose déjà) et protection contre les mots de passe divulgués.
7. Mises à jour majeures (Next 16, Expo SDK 58) : après la mise en production, dans une session dédiée.

## 5. Hors périmètre, confié aux sessions suivantes

- S21 : nettoyage du dossier local, branches fusionnées, E4, `docs/etat-avancement.md` (non modifié ici, contrat § 3).
- S22 : purge de DEMO et du marché SRM (données non touchées par l'audit).
- S23 : `gitleaks` complet, dépôt privé, rotation des secrets, keystore gardé (PR #107), préréglage du jeton Supabase à
  réduire (`jeton-supabase-deploiement`).
