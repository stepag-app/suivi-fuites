# État d'avancement (version courte, fait foi)

> À lire en début de chaque session, avec `CLAUDE.md` et `supabase/README.md`. Mettre à jour en fin de session.
> Détail historique complet (lots, PR, vérifications, pièges, session par session) :
> `docs/archives/etat-avancement-historique-2026-10-13.md`. Exploitation courante : `docs/manuel-exploitation.md`.

Dernière mise à jour : 2026-10-21, soir (**H10, premier volet** : PR #166 fusionnée et déployée, `apk-enrolement` et `version-apk` lisent R2 avec une clé **lecture seule** ; avant : 2026-10-19, audit de sécurité offensif, #149 et #150 en production ; rapport `RAPPORT_SECURITE.md`).
Avant : 2026-10-15, 23 h 30 (**Mes chiffres et À faire** (PR #146) : fusionnés, base déployée, **APK bêta 6
(213) publiée** à 23 h 27 ; arabe des 43 nouvelles phrases (Q01 à Q43) et de la carte terrain (K01 à K52) coché par Issam).
Avant : 2026-10-15, 11 h 20 (**carte terrain des agents** (PR #140) : fusionnée, déployée, dans l'APK
bêta 5 (208) ; état d'avancement à jour (#141 à #143), #137 fermée car déjà reprise). Avant : 2026-10-15, 10 h 45 (**prix 1
et 2 à l'attachement, re-détection 22-bis** (PR #138) et **interface épurée, modales sans débordement** (PR #139) :
fusionnées et déployées ; APK bêta 5 publiée à 10 h 51). Avant : 2026-10-14, soir (renvoi d'une étape
à l'agent, « Dévalider », PR #136). Avant : 2026-10-14 (troisième purge du SRM sur demande d'Issam, marché DEMO de formation, PR #134). Avant : 2026-10-13 (S21 : nettoyage du dossier local et des branches, manuel d'exploitation, ce fichier
réécrit, **E4 fait** : équipes retirées de la base). Avant : 2026-10-12, 23 h 45 (seconde purge, SRM à zéro pour le 13/10).

## 1. En service

| Élément | État |
|---|---|
| **Marché SRM-4500004453 (Oujda)** | **à zéro** depuis la troisième purge (2026-10-14, exécution 38648185254, sauvegarde complète juste avant) : 5 fuites, 4 réparations, 3 réfections, 18 photos, 2 lots, 125 balayages et 2 tracés GPS des 13 et 14/10 effacés à la demande d'Issam (essais) ; numérotation à 1 ; 34 secteurs « À balayer » ; paramétrage, bordereau, réseau et comptes gardés |
| **Marché DEMO (formation)** | créé le 2026-10-14 par la migration `20261016400000` (PR #134), identifiant `de000002-…` : copie du SRM (fiche, paramétrage, réseau), 10 fuites fictives (3 détectées, 2 en réparation, 2 réparées, 2 achevées, 1 sans réparation). **Gestes d'Issam dans le panneau** : affecter TAIBI ABDELALI au DEMO (Détection, Réparation, Réfection) et le retirer du SRM ; Paramètres › Réseau du DEMO : Régénérer les tuiles, déposer le fond de carte. Tant que ce marché existe, la purge de mise en service refuse de tourner (« un autre marché existe ») |
| **Base** | Supabase (projet `osajiinsibwrsltntmsk`, Paris, plan gratuit), RLS sur toutes les tables, migrations jusqu'à `20261016900000` (Mes chiffres et À faire, PR #146) ; déployée à chaque fusion dans `main` (« Déploiement de la base ») ; tâches `pg_cron` actives (`alertes-reparation`, `alertes-suivi-gps`, `envoi-push`, `lecture-dolibarr`) |
| **Panneau web** | https://fuites.stepag.ma (Vercel, plan Hobby) : fuites, validation par étape et renvoi à l'agent, re-détection (22-bis), tableau de bord, carte et balayage, **carte terrain** des agents (`/carte?mode=terrain`, ouverte par le bouton « Carte » de l'APK : calques, position, lecture seule, trois langues), attachements (linéaire des prix 1 et 2 sur option), fournitures et rapprochement Dolibarr, débits de nuit, rapports, suivi GPS, envoi par e-mail (Resend, depuis `contact@stepag.ma`), utilisateurs et droits, paramètres, tablettes |
| **APK Android** | **1.0.0-beta.6** (`versionCode` 213, « 1.0 bêta 6 », publiée le 2026-10-15 à 23 h 27, `main` `ed6e33c`, exécution 38822680560 : Mes chiffres, À faire, rangée de boutons sur une ligne, Envois en attente dans la barre, #146). Avant : 1.0.0-beta.5 (208, `c1d87f5` : re-détection 22-bis, renvoi à l'agent « À corriger », carte terrain #140, orange brûlé), signée avec le keystore de production, publiée à la demande d'Issam par une session Claude ; mise à jour par la fenêtre « Mise à jour disponible » ; interface en français, hybride et arabe ; hors ligne ; push (Firebase) ; satellite (Esri) ; carte de balayage sans réseau |
| **Tablettes verrouillées** (lot TP) | Suivi fuites propriétaire de la tablette (Device Owner) : applis cachées, code temporaire créé sur le panneau, mise à jour en un bouton, préparation par QR code, Wi-Fi par le volet du haut. Deux Redmi Pad 2 en service (tablette 1 : 11 pouces ; tablette 2 : 9,7 pouces, préparée le 2026-10-18), jamais de Samsung ; **le QR code ne marche pas sur Xiaomi** : préparation par câble (`outils/tablettes/preparer-cable.sh`), profil essai ; tablette 3 (9,7 pouces, 64 Go) à venir |
| **Réseau** | 44 044 tronçons, 30 820 nœuds, 34 secteurs, tuiles privées dans R2 (« À jour »), fond de carte d'Oujda (à refaire environ tous les trois mois) |
| **Sauvegarde** | chaque nuit : base chiffrée (GitHub 30 j, R2 30 j, **Drive de `stepag.app`** 30 quotidiennes + 12 mensuelles), photos et APK sur le Drive ; test de restauration le lundi depuis le Drive. Dernière sauvegarde verte : 2026-10-13 |
| **Dolibarr** | lecture seule de l'API REST toutes les 15 min (mouvements de l'entrepôt 76), sans prix ; import CSV en secours |
| **Équipes** | supprimées partout, **base comprise** (E4, migration `20261016300000`) : le chef d'équipe est le compte qui a fait le travail. Une APK d'avant S12 n'est plus acceptée |
| **Audit S20** (Fable 5.1) | aucun constat critique ; 2 importants et 5 mineurs corrigés ; reste laissé et expliqué dans `docs/lots/chantier-v3-audit-s20.md` § 2 et § 4 |
| **Audit de sécurité offensif** (2026-10-17 → 19) | banc PostgreSQL 17 local et revue multi-agents ; en service : contrôles d'auteur (`reparation_ouvriers`, `balayages.agent_id`, `photos.auteur_terrain_id`), `est_affecte` filtré sur `actif`, dépôt de photos lié à une vraie fuite, CSP complète vérifiée en production, injection de formules CSV neutralisée, `/session` réservée à l'APK, Edge Functions durcies (#149) ; `apk-enrolement` et `version-apk` sur une clé R2 **lecture seule** (H10 premier volet, #166, 2026-10-21) ; CI/CD durcie avec 4 environnements protégés (#150) ; Supabase Auth réglé (inscriptions fermées, mot de passe ≥ 12). Détail, résidus et constats hors-code : `RAPPORT_SECURITE.md` ; banc rejouable : `security-tests/lancer-tout.sh` |
| **CI de `main`** | verte au 2026-10-13 : base de données (pgTAP), panneau, APK, sauvegarde |

## 2. Reste à faire

| # | Quoi | Qui | Détail |
|---|---|---|---|
| 1 | **S23 : fermeture** : `gitleaks` sur tout l'historique, dépôt **privé**, rotation de tous les secrets et du coffre, APK finale avec la nouvelle clé anon (publier **avant** de révoquer l'ancienne), jeton Supabase du déploiement réduit au strict nécessaire, deux copies hors ligne du keystore (gardé), surveillance des minutes d'Actions | Claude avec Issam, pas à pas | `docs/feuille-de-route.md` § 5, `docs/lots/chantier-v3.md` § 1 (Z4, Z5) |
| 1 bis | **Suites de l'audit offensif** : H10, remettre #166 (clé R2 lecture seule) à jour sur `main` (conflit avec #149 sur `apk-enrolement` et `version-apk`), puis créer le jeton Cloudflare lecture seule et `R2_RO_*` dans `base-production` ; 2e volet (compartiment des sauvegardes séparé) en PR dédiée. H11, rotation des secrets (Resend, Dolibarr, Cloudflare Access, clés machine) et déplacement des autres secrets de production du dépôt vers leurs environnements. `NEXT_PUBLIC_R2_PUBLIC_HOST` dans Vercel. 14 PR Dependabot à trier. Résidus du rapport § 5 (révocation des sessions après changement de mot de passe, file hors ligne par compte, plafond de taille R2) | Claude avec Issam | `RAPPORT_SECURITE.md` § 4 à § 6 |
| 2 | **S24 : Vercel Pro**, dernier geste ; puis rappels : bons de transfert Dolibarr 6804 et 6814 (rattachés au projet 30) et 6796 (brouillon), à régler avec le magasinier ; agents informés du suivi GPS ; batterie de l'appli « Aucune restriction » sur chaque tablette (HyperOS) ; relecture de l'arabe | Issam | `docs/lots/chantier-v3.md` § 1 (Z6) |
| 3 | **Import de l'historique Excel** du responsable (sans GPS ni photos) : analyse, correspondance, essai local, import en production avec sauvegarde et lot annulable | session dédiée, Issam | fichier déposé dans `data-private/import-excel/` ; questions ouvertes : numérotation (détection réelle depuis le 12/10), réparations et pièces, champs obligatoires vides, alertes 48 h sur les anciennes fuites |
| 4 | Préparer les **tablettes d'agents** par câble avec Claude (Xiaomi : pas de QR code ; tablette 2 faite le 2026-10-18, tablette 3 faite le même jour), vérifier la consommation 4G par appli au bout d'une semaine, mettre à jour WebView et WhatsApp par le Play Store | Issam, binôme | `outils/tablettes/README.md` |
| 5 | Double authentification, compte par compte (liste de 14 comptes) ; seconde application d'authentification pour Supabase ; codes de secours hors ligne | Issam | `docs/lots/chantier-v3.md` § 6 |
| 6 | Facultatifs : relire les pages publiques `/confidentialite` et `/conditions` ; `apk-dev.yml` en déclenchement manuel une fois le dépôt privé ; mises à jour majeures (Next 16, Expo SDK 58) après la mise en service ; conversion des 10 écrans encore habillés par `ancien.css` | Issam / Claude | `docs/lots/chantier-v3-audit-s20.md` § 4 |
| 7 | **Renvoi à l'agent (dévalidation)** : en service (PR #136) ; badge « À corriger » et motif sur la tablette dans l'APK bêta 5 (208) | Claude, à la demande d'Issam | `docs/manuel-exploitation.md` § 9 |
| 8 | **À confirmer avec la SRM** : assiette des pénalités de débit (par zone, points proportionnels : valeur par défaut appliquée), gabarit d'impression de la carte, rapport par fuite, linéaire par secteur (le marché ne le donne que par zone) | Issam | `docs/lots/chantier-v3-debits.md`, `references/regles-marche-4500004453.md` |
| 9 | **Prix 1 et 2, re-détection 22-bis** : en service (PR #138, déployée le 2026-10-15) ; **APK bêta 5** (bouton « Re-détecter », 22-bis, badge « À corriger », orange brûlé) publiée le 2026-10-15 ; relire l'arabe des nouvelles phrases (statut « À re-détecter », `mobile/src/traductions.ts`, `envoyer-push`) ; cocher sur la carte le linéaire balayé du 2 au 12 octobre (date réelle) avant le premier attachement du prix 1 ; **à confirmer avec la SRM** : attachement mensuel du prix 1 et plafond au marché | Claude avec Issam | `docs/manuel-exploitation.md` § 10 et 11, `supabase/README.md` |
| 10 | **Interface épurée, modales** : en service (PR #139) ; règles à respecter dans `web/README.md` § Style de l'interface | Claude | `web/README.md` |
| 11 | **Carte terrain** : en service (PR #140) et dans la bêta 5 ; essayer sur une tablette mise à jour (bouton « Carte » pour chaque rôle, calques, « Ma position », « Ouvrir la fiche » puis retour, changement de langue sur la Carte et le Balayage) ; arabe K01 à K52 coché par Issam (2026-10-15) ; retours du terrain | Issam, puis Claude | `web/README.md` § Carte terrain, `mobile/README.md` (écran Carte) |
| 12 | **Mes chiffres et À faire** (demande d'Issam du 2026-10-15, gabarit validé) : rangée de boutons de l'accueil sur une ligne (Envois en attente passé dans la barre), écran « Mes chiffres » (chiffres du compte aujourd'hui / semaine / mois par rôle, chiffres du marché) et écran « À faire » (actions par rôle, urgentes puis plus anciennes, sans l'anticipation) ; migration `20261016900000`, 29 tests pgTAP, essai sans pile `essais/tableau.test.mjs` ; vérifié sur un banc React Native Web (portrait 800 dp, paysage 1280 dp, trois langues). **En service** : PR #146 fusionnée, base déployée (migration appliquée à 23 h 15), **APK bêta 6 (213)** publiée ; arabe Q01 à Q43 coché OK par Issam sans correction. **Reste** : essai sur la Redmi Pad 2 (accueil en paysage et en portrait, Mes chiffres sur les trois périodes, À faire : filtres, « Y aller », ouverture d'une fiche puis retour) ; retours des agents | Issam, puis Claude | `mobile/README.md` (Mes chiffres, À faire), `supabase/README.md` |

**E4, fait le 2026-10-13 (S21).** Condition remplie : Issam a confirmé qu'il n'y a qu'**une seule tablette** en
service (Redmi Pad 2), en beta.4 (195), qui n'envoie plus `equipe_id`. Migration
`20261016300000_equipes_retrait_definitif.sql` : colonnes `equipe_id` de `fuites`, `reparations`, `refections` et
`balayages`, table `equipes`, type `type_equipe`, liste `type_equipe` des libellés ; `outils/purge/purger.sql` ne
supprime plus d'équipes. **Conséquence** : ne pas réinstaller une APK d'avant S12. Aucune trace de la version d'APK par
tablette en base (`journal_tablettes` note les mises à jour sans numéro) : avec d'autres tablettes à venir, faire écrire
la version dans ce journal (petit lot base + APK) pour vérifier le parc.

**Carte terrain des agents (2026-10-15, PR #140, fusionnée et déployée ; dans l'APK 1.0.0-beta.5, numéro 208).**
Demande d'Issam : bouton **« Carte »** sur la tablette pour tout agent (détection, réparation, réfection), plein écran,
lecture seule, calques (fuites prioritaires, chaque statut, réseau, zones balayées, limites, satellite, ma position), en
trois langues ; correctif du changement de langue sur le Balayage et la mini-carte (la page suit sans recharger).
Base : « balayage / lire » pour Réparation et Réfection (migration `20261016800000`, déployée). Règle des **fuites
prioritaires confirmée par Issam** : retard de réparation au-delà du délai ou réfection de chaussée hors délai (comme
« Urgent » de À faire). Libellés arabes K01 à K52 ajoutés au dictionnaire de relecture. Détail : `web/README.md` § Carte
terrain.

## 3. Décisions à respecter

**Produit**
- **Rôles de terrain** : Détection signale, Réparation saisit les réparations, Réfection saisit les réfections ;
  cumulables, un compte par personne. **L'équipe, c'est le compte du chef d'équipe** (matricule dans les documents).
- **Application multi-marchés** : tout porte l'identifiant du marché ; RLS par marché et par rôle ; un marché désactivé
  est en lecture seule ; l'administrateur voit tout et se pose lui-même des verrous (sans refermeture automatique).
- **Pièces** : liste = produits Dolibarr importés, communs à tous les marchés, activés par l'administrateur ou le
  responsable ; plus de pièce libre ; le réparateur ne voit jamais de code. Le réparateur fait foi ; le bureau corrige
  avec motif, la saisie d'origine reste visible.
- **Attachement** : unité d'œuvre = fuite × article ; brouillon, puis arrêt (quantités figées) ; régularisations dans le
  lot suivant ; refacturation forcée et réouverture réservées à l'administrateur. L'application s'arrête aux métrés :
  pas de facture. Bordereau : un article ne change que par nouvelle version. Polyéthylène au-delà du seuil (2 m par
  défaut, par marché) : listé « hors bordereau », jamais facturé automatiquement.
- **Prix 1 et 2 à l'attachement** (2026-10-14, PR #138) : lignes « linéaire » par zone, calculées sur le balayage
  (premiers passages, branchements exclus). Prix 1 **sur option dès le premier mois** (rien sans le clic du
  responsable ; le CPS ne le paie qu'à l'achèvement du balayage) ; **plafond au marché** (1 466 000 m, quantité du
  bordereau ; le tableau n° 1 ne donne qu'un linéaire approximatif par zone). Prix 2 : **deux tranches du CPS** (40 %
  puis 60 % du prix 1 attaché de la zone, à la fin des phases). Pénalités τ1 / τ2 : **rappelées** sur le lot, jamais
  des quantités ; toujours pas de facture dans l'application.
- **Re-détection** (2026-10-14, PR #138) : motif « À détecter de nouveau » → fuite **« À re-détecter »** (pas close),
  le détecteur est prévenu ; la re-détection garde le numéro avec un suffixe (**22-bis**, 22-ter : choix d'Issam), la
  fuite d'origine est close. Autres motifs : bouton « Demander une re-détection » (Paramètres › Listes).
- **Dolibarr** : lecture seule, jamais de prix. **Photos** facultatives avec avertissement « aucune photo ».
- **Suivi GPS** : un tracé par agent et par jour, heures de travail et pauses (jamais le lieu d'une pause), agents
  informés par écrit (`docs/suivi-gps-information-agents.md`) ; pas de déclaration CNDP (réponse Q14).
- **Wi-Fi** des tablettes verrouillées : par le volet du haut d'Android, sans code ; plus de Wi-Fi dans l'appli.

**Exploitation**
- **Fusion des PR** : Issam ne lit pas le code ; la PR sert à faire tourner la CI avant la production. Claude fusionne
  quand Issam le demande, une fois la CI verte, puis vérifie « Déploiement de la base ».
- **APK** : plus de version publiée à chaque fusion ; essais sur la tablette d'Issam (appli DEV), puis **à sa demande**
  une session Claude publie (`mobile/README.md` § Publier). **Keystore gardé** (en changer obligerait à réinstaller sur
  chaque tablette) ; deux copies hors ligne de `~/Documents/STEPAG-KEYSTORE/`.
- **Aucune migration ne retire ou ne rend obligatoire une colonne qu'une APK en service écrit**, tant que la nouvelle
  APK n'est pas installée partout.
- **Dépôt public jusqu'à S23** : aucun secret ni donnée réelle dans un fichier versionné ; Issam saisit lui-même chaque
  valeur ; `data-private/` et le keystore ne sont jamais touchés par un outil.
- **Supabase gratuit** (500 Mo de base, 1 Go de fichiers, pause après 7 jours d'inactivité écartée par l'usage et la
  sauvegarde) ; pas de sauvegarde Supabase : sauvegarde maison. **Vercel Pro en dernier** (avant toute facturation au
  client). Quota Claude partagé avec l'application de paie : priorité au client.
- **Purge** : outil de mise en service uniquement (`outils/purge/`), jamais sur un marché qui travaille.

## 4. Pièges connus

- **Jeton Supabase du déploiement** : un jeton à durée limitée a expiré le 2026-10-11 ; remplacé par un jeton sans
  expiration. Si « Déploiement de la base » rougit, regarder le jeton avant de fusionner une base et une APK ensemble.
- **Tablette verrouillée** : transférer la propriété (écran Tablette, pendant un déverrouillage), **jamais** « libérer »
  puis `dpm set-device-owner` quand un compte existe (refusé : « already some accounts »). Android refuse
  `am force-stop` sur l'appli propriétaire. HyperOS (Xiaomi) demande trois réglages manuels et ne rouvre pas l'appli
  seul après une mise à jour.
- **Heure du Maroc** : GMT depuis le 2026-09-20 ; Supabase et Chrome 152 ont une base de fuseaux en retard : passer par
  `heure_maroc` (base) et `heure-maroc.ts` (web).
- **Ordre des migrations** : le déploiement refuse une migration plus ancienne que la dernière appliquée ; une session
  qui fusionne après un numéro plus haut renomme la sienne.
- **Une APK compilée avec l'ancienne clé anon** ne joint plus Supabase, même pas la fenêtre de mise à jour : voir S23.
- **Saisie restée « en attente » sur une tablette** d'avant une purge : elle serait renvoyée et recréerait un essai ;
  la supprimer dans le panneau.
- **Numéro affiché (22-bis)** : `fuites.numero_affiche` est une colonne simple posée à la création ; une colonne
  générée est nulle dans les déclencheurs BEFORE UPDATE et ferait refuser des modifications (`to_jsonb(new)`). Toute
  vue redéfinie qui porte un numéro de fuite garde `fuite_numero_affiche` en dernière colonne ; ne jamais envelopper
  `v_a_attacher` (lue unité par unité à l'arrêt d'un lot : de 0,3 s à plus de 60 s à 3 000 fuites).
- **Migration écrite sur une branche pendant qu'une autre est fusionnée** : `supabase db push` refuse une migration
  plus ancienne que la dernière appliquée en production ; renuméroter après celle de `main` et régénérer toute
  fonction ou vue redéfinie des deux côtés (PR #138 après #136).

## 5. Où lire

| Besoin | Fichier |
|---|---|
| Exploitation courante (marché, agent, tablette, APK, sauvegarde, clés, purge, dépannage) | `docs/manuel-exploitation.md` |
| Cadrage métier, architecture, consignes | `CLAUDE.md` |
| Règles du marché 4500004453 | `references/regles-marche-4500004453.md` |
| Base : schéma, déploiement, sauvegarde, reprise après sinistre, règles des migrations | `supabase/README.md` |
| Panneau web : écrans, exports, carte, variables d'environnement | `web/README.md` |
| APK : compilation, publication, tablettes verrouillées | `mobile/README.md` |
| Plan du réseau (DWG → GeoJSON) | `outils/reseau/README.md`, `docs/lots/lot-s-reseau.md` |
| Purge | `outils/purge/README.md` |
| Chantier v3 (plan, contrat technique, décisions) | `docs/lots/chantier-v3.md`, audit : `docs/lots/chantier-v3-audit-s20.md` |
| Fermeture et rotation des secrets | `docs/feuille-de-route.md` § 5 |
| Historique détaillé (lots, PR, vérifications) | `docs/archives/etat-avancement-historique-2026-10-13.md` |

## 6. Prompt de reprise

```text
Lis CLAUDE.md, docs/etat-avancement.md, docs/manuel-exploitation.md, supabase/README.md, web/README.md et mobile/README.md.
Contexte : le chantier v3 est fusionné et déployé (S12 à S22) ; S21 (nettoyage, manuel, état, E4) est faite. Prix 1 et 2 à l'attachement, re-détection
22-bis, interface épurée et carte terrain en service (PR #138, #139, #140) ; APK bêta 5 publiée (208). Restent S23 (fermeture, rotation des secrets, APK
finale, avec Issam) et S24 (Vercel Pro, rappels).
Avant de commencer : gh pr list --state all --limit 20 et git worktree list (sessions parallèles), puis vérifie la CI de main.
Objectif de cette session : [à préciser].
Travaille en français, sur une branche dédiée avec une PR ; ne fusionne pas sans la demande d'Issam ; ne touche pas au
projet Supabase de production hors déploiement automatique ; aucun secret dans le dépôt ni dans le chat ; ne touche pas
au keystore ni aux tablettes (adb) sans demande d'Issam.
Mets à jour docs/etat-avancement.md en fin de session.
```
