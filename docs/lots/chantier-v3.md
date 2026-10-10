# Chantier v3 : fin du projet (équipes, débits de nuit, rapports, e-mail, Dolibarr, sauvegarde, mise en production)

> Cadrage du 2026-10-10 avec Issam : réécriture du plan v2 (`docs/lots/chantier-v2.md`, entièrement fusionné, audit
> `docs/lots/chantier-v2-audit-s8.md`) en nouvelles vagues de sessions parallèles, pour finir au plus tôt. Source unique pour
> les sessions du chantier : chaque session lit ce fichier, `CLAUDE.md`, `docs/etat-avancement.md` et les README de sa zone
> avant de commencer. Fermeture du dépôt et rotation des secrets : `docs/feuille-de-route.md` § 5 (PR #83).

## 0. Reste du chantier v2 : décisions d'Issam (2026-10-10)

| Point | Décision | Suite |
|---|---|---|
| N2 push Android (Firebase) | en cours, hors de ce plan | fini avant la vague 3 |
| C5 satellite | **fait** (clé Esri posée) | — |
| X5 tuiles du réseau | gardées (explication ci-dessous) | deux gestes d'Issam ; régénérer après S22 |
| X8 envoi automatique Dolibarr | **gardé, au plus tôt** | S13, vague 1 |
| V4 photo obligatoire par étape | **abandonné** : l'avertissement « aucune photo » avant validation suffit | clos |
| R7 corrections du bureau | **évalué : fait** (ci-dessous) | clos |
| Mesures de débit de nuit et pénalités | **ajoutées**, conformes au CPS, avec réglages | S15, S19 |
| Équipes 1, 2… (détection et réparation) | **supprimées partout** : l'équipe, c'est le compte du chef d'équipe (identifiant et mot de passe) | S12, puis E4 en S21 |
| États journaliers et hebdomadaires | **débloqués** : rubriques à cocher, filtres, A4 portrait ou paysage | S17 |
| Petits restes du panneau | traités en parallèle | S16 |
| Facturation GitHub | sans objet tant que le dépôt est public ; il redevient privé à la fermeture | S23 |
| Keystore Android | **régénéré** à la fermeture et rangé en lieu sûr | S23 |
| Tablette Samsung | branchée au Mac, essais en cours | — |
| Vercel Pro | **dernier geste du projet** | S24 |
| Arabe | vérifié (ci-dessous) ; relecture d'Issam à finir | S19 pour les nouveaux libellés |
| Bons de transfert Dolibarr (6804, 6814, 6796) | rappel en fin de projet | S24 |
| Double authentification | liste à vérifier une par une (§ 6) | Issam |
| Sauvegarde hors plateformes | copie complète hors de Supabase, Vercel, R2 et GitHub | S14 |
| Rapports par e-mail | boutons du responsable, envoi depuis `contact@stepag.ma` | S18 |
| Audit final | session lourde **Fable 5.1** : sécurité, fiabilité, qualité, polish, optimisation | S20 |
| Nettoyage, repliement, APK finale archivée | dossier local, dépôt, APK stockée et sauvegardée | S21, S23 |
| Purge de DEMO | SRM seul, **0 fuite**, réseau gardé (transféré depuis DEMO s'il manque) | S22 |

**Tuiles du réseau (X5) : à quoi elles servent.** Le plan d'Oujda compte 44 044 tronçons et 30 820 nœuds. Sans tuiles, la
carte le lit secteur par secteur (132 couches) : 7,9 s pour tout afficher et 27 à 32 images par seconde, saccadé sur la
tablette. Les tuiles le découpent une fois pour toutes en petits carreaux prêts à dessiner (un fichier PMTiles de 4,7 Mo,
privé dans R2, lu par morceaux avec une URL signée) : 2,9 s (1,7 s ensuite, grâce au cache) et 60 images par seconde, donc
un balayage plein écran fluide sur la tablette en 4G. Sans risque : si les tuiles manquent ou ne correspondent plus au réseau
(import, zonage), la carte revient seule à la lecture par secteur. Gestes d'Issam, s'ils ne sont pas faits : poser la règle
CORS du compartiment R2 avec l'en-tête `Range` (texte prêt dans `web/README.md` § Tuiles), puis Paramètres › Réseau ›
**Régénérer les tuiles**. Le bouton est à refaire après chaque import du réseau ou changement de zonage (donc après S22).

**R7, évaluation.** Fait pour l'essentiel : les pièces ajoutées, remplacées ou retirées par le bureau, les quantités, les
requalifications et les lots sont invisibles du terrain (RLS de `reparation_pieces`, vue `v_pieces_terrain` lue par l'APK
et par la fiche du panneau pour les rôles terrain). Seul écart, voulu par S1 : une correction de champ faite au bureau
(adresse, position GPS, dimensions) s'affiche corrigée pour tous, ce qui sert au terrain (aller au bon endroit) ; l'ancienne
valeur reste au journal. Clos ; à rouvrir seulement si Issam veut masquer aussi ces valeurs.

**Arabe, vérification.** Le dernier déploiement contient tout l'arabe : panneau Vercel en production sur `63ddf1f` (PR #82,
carte Balayage en arabe) et APK compilée par la CI sur ce même commit (exécution 38010972111 du 2026-10-10, artefact
`suivi-fuites-apk`, publiée dans R2 : la fenêtre « Mise à jour disponible » la propose aux tablettes). Côté code, tous les
textes des écrans de l'APK passent par le dictionnaire typé (`t()`, `tx()`) et une recherche n'a relevé aucun texte français
écrit en dur ; les pages du panneau ouvertes dans l'APK (carte Balayage, mini-carte) suivent la langue de la tablette
(`web/src/lib/langue-apk.ts`). Restent la relecture d'Issam (V001 à V121, listes paramétrées) et les libellés que S12 retire
et que S19 ajoute, qui entreront dans l'APK de fin de vague 2.

## 1. Tâches, par catégorie

### E. Équipes supprimées

| Code | Tâche |
|---|---|
| E1 | **Base** : plus aucune lecture ni écriture d'équipe (vues d'export, d'attachement, de fournitures et de balayage ; copie de marché ; démonstration ; essai de charge ; type `equipes` retiré de la matrice des droits). Le **chef d'équipe** est le compte qui a fait le travail (`auteur_terrain_id`, matricule dans les documents, R4) : les regroupements « par équipe » deviennent « par chef d'équipe » (réparation, réfection) ou « par agent » (détection, balayage) |
| E2 | **Panneau** : onglet Paramètres › Équipes retiré ; filtres et colonnes « Équipe » remplacés par « Chef d'équipe » ou « Agent » (fournitures, balayage, carte, exports, fiche, rapport journalier) ; mode démonstration sans équipes |
| E3 | **APK** : choix de l'équipe retiré des formulaires de réparation et de réfection ; nom du chef d'équipe sur la fiche ; libellés retirés du dictionnaire |
| E4 | **Suppression définitive en base** (`equipe_id` de `fuites`, `reparations`, `refections`, `balayages`… ; table `equipes` ; type `type_equipe`), **seulement quand toutes les tablettes ont l'APK sans équipe** : une APK plus ancienne envoie encore `equipe_id` et ses envois seraient refusés (même piège que les champs obligatoires rétablis par S8). D'ici là, colonnes gardées vides et inutilisées |

Les **ouvriers sans compte** (Paramètres › Ouvriers, rattachés aux réparations) restent : seule la notion d'équipe disparaît.

### D. Débits de nuit (CPS art. II-17, II-22, II-23 et tableau n° 1)

| Code | Tâche | Règles |
|---|---|---|
| D1 | **Référentiel** : points de mesure (ouvrages de comptage de la SRM) par secteur et par zone ; Q exigé par zone (déjà en base : `zones.q_exige_m3h`, 126, 130, 118, 112 et 83 m³/h) ; débits de référence du tableau n° 1 (plus bas historique, débit actuel) ; dates des **phases** dans `phases` (balayage 4 mois, maintien 4 + 4 mois, achèvement du balayage par zone) | R-CPS-091, 092, 100 à 104 |
| D2 | **Campagnes** : avant intervention (Qi, 3 nuits) ; après balayage (Qf, 3 nuits, procès-verbal) ; contrôle de maintien (hebdomadaire, dates fixées par la SRM, intervalle constant d'au plus 7 jours) ; mesure libre | R-CPS-108, 109, 114, 142 |
| D3 | **Saisie au choix** (réglage du marché, modifiable par campagne) : relevés détaillés de 0 h à 6 h toutes les 15 min (25 valeurs par point et par nuit) ; minimum de la nuit seulement ; import d'un fichier de télé-relève ou d'enregistreur (CSV, Excel). Débit d'une zone = somme des points **au même instant** ; avec les seuls minimums, somme des minimums, marquée « approchée ». Procès-verbal signé ou photo de l'afficheur en pièce jointe | R-CPS-103, 115 |
| D4 | **Calculs** (en base, testés) : débit de la nuit = minimum des relevés ; Qi et Qf = minimum des trois nuits ; gain ΔQ = Qi − Qf ; τ1 = 100 × (Q exigé − Q réal) / Q exigé ; si τ1 < 0, pénalité de 1 % du montant du balayage par point, plafond 25 % ; **alerte « arrêt de zone »** si τ1 < −25 % ; τ2 = 100 × (Q à maintenir − moyenne des minimums hebdomadaires) / Q à maintenir, même pénalité sur le montant du maintien ; alerte si la dégradation des gains dépasse 25 % | R-CPS-107, 111, 143, 145 à 149 |
| D5 | **Réglages** : assiette de la pénalité par zone (linéaire de la zone × prix 1 ou 2, par défaut) ou marché entier ; points proportionnels (par défaut) ou entiers | R-CPS-150, à confirmer avec la SRM |
| D6 | **Droits** : saisie par le responsable (droit `mesures_debit`, déjà prévu dans la matrice) ; ouvrable à Détection et à Réparation par la matrice des droits ; une saisie faite sur le terrain est **à valider** par le responsable (circuit V1) | |
| D7 | **Panneau** : page « Débits de nuit » (saisie, tableau par zone et par nuit, courbe dans le temps face au Q exigé, τ et pénalité estimée) ; widget au tableau de bord ; **procès-verbal de mesures** A4 (visas de l'entreprise et de la SRM) ; export Excel ; rubrique « Débits de nuit » des rapports (J1) | |
| D8 | **APK** : écran « Mesures de nuit » montré seulement aux rôles qui ont le droit ; saisie hors ligne comme le reste ; libellés arabes | |

### J. Rapports (états journaliers et hebdomadaires)

| Code | Tâche |
|---|---|
| J1 | Écran **Rapports** (responsable, administrateur) : période (jour, semaine, dates libres) ; **rubriques à cocher** : fuites détectées, réparations, réfections, balayage, débits de nuit, pièces posées, fuites en attente et alertes ; **filtres** : zone, secteur, statut, chef d'équipe ou agent, validées seulement ; colonnes à cocher par rubrique ; **A4 portrait ou paysage** ; PDF ou Excel ; aperçu avant tirage ; dernier choix gardé par marché (`modeles_export`). Pas de gabarit SRM figé (réponse Q15 du v2) |
| J2 | Le rapport journalier de recherche de fuites (gabarit STEPAG 2026, page Balayage) reste tel quel et devient un modèle proposé par l'écran Rapports |

### M. Envoi par e-mail

| Code | Tâche |
|---|---|
| M1 | Bouton **« Envoyer par e-mail »** (responsable, administrateur) sur les rapports (J1), le rapport par fuite, la carte imprimée, les attachements et le procès-verbal de débits ; destinataires pris dans une liste **« Destinataires »** par marché (Paramètres › Marché) ou saisis ; objet et message préremplis et modifiables ; pièce jointe : le document généré |
| M2 | **Envoi par le serveur** depuis `contact@stepag.ma` (route serveur du panneau : session et droit vérifiés ; clé du fournisseur côté serveur seulement, jamais `NEXT_PUBLIC_`) ; réponses vers `contact@stepag.ma` ; copie cachée à `contact@stepag.ma` pour garder la trace dans la boîte ; **journal des envois** (table avec RLS : responsable et administrateur du marché) ; limites de taille et de nombre d'envois par jour |

### X. Reste de l'inventaire

| Code | Tâche |
|---|---|
| X8 | **Envoi automatique Dolibarr → Supabase** (mouvements de l'entrepôt 76) : fonction Supabase protégée par un jeton dédié, qui appelle `importer_mouvements_dolibarr` (prête depuis S9) ; **script planifié sur le serveur Dolibarr** (sortant seulement : l'API Dolibarr reste limitée au réseau local), sans doublon (identifiant du mouvement), rattrapage après une coupure ; « Dernier envoi » et erreurs affichés sur la page Rapprochement ; import CSV gardé en secours ; note pas à pas pour l'installation sur le serveur. **Remplacé le 2026-10-10 (S13 bis)** : Supabase lit l'API REST de Dolibarr toutes les 15 min (Cloudflare Access, utilisateur en lecture seule), bouton « Synchroniser maintenant » ; script retiré (`outils/dolibarr/README.md`) |
| X9 | **Sauvegarde hors plateformes** : chaque nuit, archive chiffrée de la base, copie incrémentale de **toutes les photos** (R2 et Supabase Storage) et des APK publiées, vers le **Drive** (§ 5, Q2), par `rclone` depuis le workflow de sauvegarde. Côté Drive, rien n'est effacé, sauf la rotation des archives de base (30 quotidiennes et 12 mensuelles). Échec signalé (notification GitHub, puis e-mail par M2). **Essai de restauration complet depuis le Drive** (base et photos, sur une base vierge) ; procédure « reprise après sinistre » pas à pas dans `supabase/README.md` |

### U. Petits restes du panneau

| Code | Tâche |
|---|---|
| U1 | Tableau de bord : « Non réparées > seuil » et « En attente » cliquables (filtre par type d'alerte, filtre multi-statuts dans la liste) ; période du tableau de bord gardée dans l'adresse |
| U2 | Liste des fuites : filtre par zone |
| U3 | Liste « Fiches disponibles hors ligne » (fiches en cache, ouvertes sans réseau) |
| U4 | Cloche : « Tout voir » au-delà des 30 dernières notifications |

### Z. Fin du projet

| Code | Tâche |
|---|---|
| Z1 | **Audit Fable 5.1** et correctifs : sécurité (RLS, fonctions `security definer`, droits, secrets, en-têtes, dépendances), fiabilité (hors ligne, files d'attente, reprises), qualité (code mort, écrans `.ancien`, doublons), performances (panneau, APK, base), polish de l'interface |
| Z2 | **Nettoyage et repliement** : dossier local (fichiers épars à la racine, une trentaine de copies de travail dans `.claude/worktrees`, checkout principal resté sur `claude/reseau-simplification` du 7/10 : ses modifications non commitées sont déjà dans `main`, vérifié le 2026-10-10) ; branches fusionnées et PR obsolètes ; documentation finale (`etat-avancement.md` réécrit, **manuel d'exploitation** : ajouter un marché, un agent ; mettre à jour l'APK ; restaurer la sauvegarde ; faire tourner les clés) ; E4 |
| Z3 | **Purge** : marché DEMO supprimé (fuites, photos et fichiers, lots, notifications, tracés GPS, balayages, comptes d'essai rattachés à DEMO seulement) ; **SRM à zéro** (aucune fuite ni saisie d'essai, numérotation qui repart à 1) ; gardés : paramètres, bordereau, zones et secteurs, **réseau et zonage**, articles, comptes et droits. Si le réseau n'est pas dans SRM, **le transférer depuis DEMO avant** (ou le réimporter depuis `data-private/IMPORT-RESEAU/`), puis régénérer les tuiles. Sauvegarde vérifiée juste avant ; liste cochée par Issam ; exécution confirmée par lui |
| Z4 | **Fermeture et rotation** (`docs/feuille-de-route.md` § 5) : `gitleaks` sur tout l'historique, dépôt **privé**, rotation de tous les comptes et secrets, coffre unique, **nouveau keystore** (coffre et deux copies hors ligne), nouvelle clé anon compilée dans l'APK. Dépôt privé : les 2 000 minutes gratuites d'Actions par mois doivent couvrir la sauvegarde nocturne, le test de restauration hebdomadaire et les compilations, sinon la sauvegarde s'arrête (à surveiller) |
| Z5 | **APK finale** : signée avec le nouveau keystore, publiée en **GitHub Release** (téléchargée depuis le téléphone, envoyée par WhatsApp ou e-mail pour la première installation) et copiée sur le Drive (X9). Sur chaque tablette : file d'attente vidée, ancienne APK désinstallée (signature différente), nouvelle installée ; ensuite, mises à jour par la fenêtre « Mise à jour disponible » |
| Z6 | **Vercel Pro**, dernier geste. Rappels : bons de transfert Dolibarr (6804 et 6814 rattachés au projet 30, 6796 en brouillon, pose non saisie, à régler avec le magasinier) ; agents informés du suivi GPS ; optimisation de batterie Samsung exclue sur chaque tablette ; relecture arabe faite |

## 2. Vagues et sessions

```
Vague 1 (maintenant, en parallèle)
  ├─ S12 Équipes supprimées : base, panneau, APK (E1 à E3)
  ├─ S13 Dolibarr : envoi automatique (X8)
  ├─ S14 Sauvegarde hors plateformes (X9)
  ├─ S15 Débits de nuit : base et panneau (D1 à D7)
  └─ S16 Petits restes du panneau (U1 à U4)
Vague 2 (après S12 ; S17 et S19 aussi après S15)
  ├─ S17 Rapports (J1, J2)
  ├─ S18 Envoi par e-mail (M1, M2)
  └─ S19 Débits sur l'APK (D8), libellés arabes, APK de main sur les tablettes
Vague 3 (fin)
  ├─ S20 Audit Fable 5.1 (Z1) ──→ S21 Nettoyage, documentation, E4 (Z2)
  └─ S22 Purge de DEMO, SRM à zéro (Z3), en parallèle de S20
  puis S23 Fermeture, rotation, APK finale (Z4, Z5) ──→ S24 Vercel Pro et rappels (Z6, Issam)
```

| Session | Tâches | Zone de fichiers | Migrations | Dépend de | Modèle, effort | Taille |
|---|---|---|---|---|---|---|
| S12 | E1, E2, E3 | `supabase/` (vues, fonctions, tests), `web/` (paramètres, fournitures, balayage, carte, exports, fiche, démonstration), `mobile/` (saisie, fiche, paramètres, types, langue, traductions), `outils/charge/` | `20261013200000…` | — | Opus 5.5, high | L |
| S13 | X8 | `supabase/functions/` (nouvelle fonction), `outils/dolibarr/` (nouveau), page Rapprochement | `20261013100000…` | accès au serveur Dolibarr (Issam, guidé) | Opus 5.5, high | M |
| S14 | X9 | `.github/workflows/sauvegarde-base.yml`, `test-restauration.yml`, `outils/sauvegarde/`, `supabase/README.md` | aucune | Q2 ; autorisation du Drive (Issam, guidé) | Sonnet 5.5, high | M |
| S15 | D1 à D7 | `supabase/` (débits), `web/` : page `/debits` (nouvelle), onglet Paramètres, widget du tableau de bord, procès-verbal | `20261013300000…` | — | Opus 5.5, high | L |
| S16 | U1 à U4 | `web/` : tableau de bord, liste des fuites, hors ligne, cloche | aucune | — | Opus 5.5, medium | S |
| S17 | J1, J2 | `web/src/lib/export/`, page `/rapports` (nouvelle) | `20261014200000…` si besoin | S12 ; S15 (rubrique débits) ; S18 (bouton, posé par la dernière des deux fusionnée) | Opus 5.5, high | L |
| S18 | M1, M2 | route serveur du panneau, Paramètres › Destinataires, composant d'envoi, boutons des exports existants | `20261014100000…` | Q1 ; DNS posés par Issam | Opus 5.5, high | M |
| S19 | D8, APK de `main` sur les tablettes | `mobile/` | `20261014300000…` si besoin | S12, S15 | Opus 5.5, high | M |
| S20 | Z1 | tout (lecture), correctifs par zone | `20261015100000…` | vagues 1 et 2 fusionnées, push Firebase fini | **Fable 5.1, max** | L |
| S21 | Z2, E4 | dossier local, `docs/`, branches, migration finale E4 | `20261015300000…` | S20 ; toutes les tablettes sur l'APK sans équipe | Sonnet 5.5, high | M |
| S22 | Z3 | fonction de purge testée, puis exécution | `20261015200000…` | S14 en service (copie Drive vérifiée), accord d'Issam | Opus 5.5, high | S |
| S23 | Z4, Z5 | secrets, `apk.yml` (Release), coffre | aucune | S20, S21, S22 | Opus 5.5, high, avec Issam | M |
| S24 | Z6 | — | — | S23 | Issam | S |

**Chemin critique** : S12 → S17 → S20 → S23. Les autres sessions passent à côté.

## 3. Contrat technique partagé

- **Copie de travail** : worktree tiré de `origin/main`, branche `claude/chantier-v3-s<n>-<sujet>` ; au début et avant la PR :
  `gh pr list --state open` et `git worktree list` ; rien de non commité dans le checkout principal.
- **Fusion** (reprise de la réponse Q1 du v2, § 5 Q6) : PR fusionnée dès que la CI est verte, puis vérifier « Déploiement de la
  base ». **Migrations** : plages du § 2, fusion dans l'ordre des numéros ; une session qui fusionne après une migration de
  numéro plus haut renomme la sienne au-dessus de la dernière de `main` avant de fusionner (et corrige ses renvois dans les
  README).
- **APK déjà installées** : ne jamais supprimer ni rendre obligatoire une colonne qu'une APK en service écrit, tant que la
  nouvelle APK n'est pas installée partout (E4).
- **Tests** : pgTAP pour toute règle de base (équipes absentes des vues, calculs des débits et des pénalités, droits de
  saisie des débits, journal des e-mails, purge) ; `tsc` et `build` du panneau ; `tsc` et essais sans pile de l'APK ;
  scripts `web/scripts/verifier-*.mjs` (en ajouter pour les calculs de débits et l'écran Rapports).
- **Libellés de l'APK** : `t()`, `mobile/src/traductions.ts` et une ligne à relire dans l'artefact du dictionnaire arabe
  (S12 retire, S19 ajoute).
- **Tablette** : partagée avec Issam ; capture avant chaque geste, jamais d'installation ni d'arrêt forcé pendant qu'il s'en
  sert ; itérer sur l'appli DEV par Metro.
- **Secrets** : le dépôt est **public** jusqu'à S23 : aucun secret ni donnée réelle dans un fichier versionné ; Issam saisit
  lui-même chaque valeur (GitHub, Vercel, Supabase).
- **Contrats pour la vague 2** : S15 publie `docs/lots/chantier-v3-debits.md` (tables, fonctions, droits, rubrique des
  rapports) ; S18 publie `docs/lots/chantier-v3-email.md` (composant d'envoi, route, droits).
- **Documentation** : chaque session met à jour son README ; `docs/etat-avancement.md` seulement par S21, puis S23 pour l'état
  final.
- **Gestes d'Issam** : une note pas à pas (Claude Docs) et des fichiers prêts à l'emploi pour chacun : S13 (serveur
  Dolibarr), S14 (autorisation du Drive), S18 (fournisseur d'e-mail et DNS), S22 (liste de purge), S23 (rotation).

## 4. Coût et rapidité

Opus 5.5 partout, sauf S14 et S21 (Sonnet 5.5 : scripts et rangement) et S20 (Fable 5.1, effort max, choix d'Issam). Le
quota Max est partagé avec l'application de paie du client (priorité au client, `CLAUDE.md` § 12) : point de consommation
après la vague 1 ; si la limite approche, S16 puis S19 attendent.

## 5. Décisions (réponses d'Issam du 2026-10-10 ; sinon valeur appliquée sans réponse)

| Q | Question | Réponse ou valeur par défaut |
|---|---|---|
| 1 | Envoi des e-mails depuis `contact@stepag.ma` : **Resend** (service d'envoi : trois enregistrements DNS dans Cloudflare, gratuit jusqu'à 3 000 e-mails par mois) ou **SMTP de l'hébergeur** de la boîte (mot de passe de la boîte gardé côté serveur) | **Resend** (Issam) ; la boîte reste chez l'hébergeur (MX de stepag.ma), seuls les envois passent par Resend |
| 2 | Destination de la sauvegarde hors plateformes : Drive du compte `stepag.app` (15 Go gratuits ; base : quelques Mo par jour ; photos : 2 à 7 Go par an), Drive personnel, ou en plus le serveur local H24 | **Drive `stepag.app`** (Issam) ; Google One 100 Go si la place manque |
| 3 | Débits : assiette des pénalités (zone ou marché entier), points proportionnels ou entiers | par zone, proportionnels (à confirmer avec la SRM) |
| 4 | Débits : mode de saisie par défaut | minimum de la nuit ; relevés détaillés et import possibles par campagne |
| 5 | Ouvriers sans compte | gardés |
| 6 | Fusion dès CI verte, migrations en production comprises | **oui** (Issam : vague 1 lancée avec fusion du plan) |

## 6. Double authentification : liste à vérifier une par une

| # | Compte | État connu (documents) | À faire |
|---|---|---|---|
| 1 | Google `stepag.app@gmail.com` (sert aussi à Firebase et Esri) | non confirmée | passkey et application d'authentification, codes de secours hors ligne |
| 2 | Google personnel (adresse de récupération de `stepag.app`) | inconnu | même protection : il permet de reprendre le compte 1 |
| 3 | GitHub `stepag-app` | **non activée** (`CLAUDE.md` § 6) | application et passkey, codes de secours |
| 4 | Supabase | **activée** (Google Authenticator) | ajouter une seconde application de secours |
| 5 | Vercel (équipe STEPAG, connexion par GitHub) | dépend de GitHub | protéger GitHub ; activer aussi celle de Vercel si elle est proposée |
| 6 | Cloudflare | **en cours** | terminer, régénérer les codes de récupération |
| 7 | Esri ArcGIS | **abandonnée** (décision du 2026-10-09) | rien |
| 8 | Compte Claude | connexion par e-mail ou Google | protégé par la 2FA du compte e-mail utilisé (1 ou 2) |
| 9 | Hébergeur de stepag.ma (panneau, boîte `contact@`) | inconnu | activer si l'hébergeur la propose |
| 10 | Bureau d'enregistrement du domaine stepag.ma | inconnu | 2FA et verrou de transfert |
| 11 | Resend (si retenu, Q1) | à créer | activer à la création |
| 12 | Gestionnaire de mots de passe (coffre unique, S23) | à créer | obligatoire |
| 13 | Dolibarr `erp.stepag.ma`, administrateur | inconnu | facultatif (module d'authentification à deux facteurs) |
| 14 | Sentry | créé ? | si le compte existe |

## 7. Lancement des sessions

Message de lancement, commun à toutes les sessions (remplacer les crochets) :

> Chantier v3, session S[n] ([titre]). Lis d'abord `CLAUDE.md`, `docs/lots/chantier-v3.md` (§ 1 : tâches [codes] ; § 3 :
> contrat technique), `docs/etat-avancement.md` et le README de ta zone. Au début et avant d'ouvrir la PR :
> `gh pr list --state open` et `git worktree list`. Travaille dans un worktree tiré de `main`, branche
> `claude/chantier-v3-s[n]-[sujet]`. Zone de fichiers : [zone] ; migrations dans la plage [plage]. Termine par : tests verts,
> PR avec CI verte, fusion, vérification de « Déploiement de la base » ; rapport en cinq lignes (fait, écarts, gestes
> d'Issam).

| Session | Mission à ajouter au message |
|---|---|
| S12 | Supprime la notion d'équipe partout (E1 à E3, **pas E4**) : colonnes gardées vides ; le chef d'équipe est `auteur_terrain_id` ; retire les libellés du dictionnaire et de l'artefact de relecture |
| S13 | Envoi automatique Dolibarr (X8) : fonction protégée, script du serveur, journal, « Dernier envoi » sur Rapprochement ; note pas à pas pour Issam |
| S14 | Sauvegarde hors plateformes (X9) vers la destination de Q2 ; essai de restauration complet depuis le Drive ; note pas à pas pour l'autorisation |
| S15 | Débits de nuit, base et panneau (D1 à D7) ; publie `docs/lots/chantier-v3-debits.md` pour S17 et S19 |
| S16 | Petits restes du panneau (U1 à U4) |
| S17 | Écran Rapports (J1, J2), avec la rubrique débits de S15 et le bouton e-mail de S18 s'il est fusionné |
| S18 | Envoi par e-mail (M1, M2) avec le fournisseur de Q1 ; publie `docs/lots/chantier-v3-email.md` |
| S19 | Écran « Mesures de nuit » de l'APK (D8), libellés arabes et lignes de relecture ; APK de `main` installée sur les tablettes |
| S20 | Audit complet (Z1) : sécurité d'abord, puis fiabilité, qualité, performances, polish ; correctifs par zone de fichiers |
| S21 | Nettoyage et repliement (Z2), puis E4 une fois toutes les tablettes à jour |
| S22 | Purge (Z3) : fonction testée, liste à cocher par Issam, sauvegarde vérifiée, exécution confirmée par lui |
| S23 | Fermeture, rotation, keystore, APK finale (Z4, Z5), avec Issam, pas à pas |

## 8. Définition de terminé

Chaque tâche : règle en base testée (pgTAP) quand il y en a une, écran vérifié (navigateur, tablette), libellés de l'APK en
français et en arabe, README à jour, PR fusionnée et déployée. Le projet : APK finale (nouveau keystore) installée sur les
tablettes ; parcours complet sur la tablette (détection → validation → réparation → réfection → lot → rapport envoyé par
e-mail → mesure de nuit) ; sauvegarde de la nuit présente sur le Drive et restaurée une fois ; dépôt privé, secrets tournés et
rangés dans le coffre ; SRM à zéro avec son réseau ; Vercel Pro.
