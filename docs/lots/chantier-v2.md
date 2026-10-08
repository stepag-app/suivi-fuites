# Chantier v2 : circuit de validation, saisie terrain, notifications, comptes, listes et exports

> Cadrage du 2026-10-07 et du 2026-10-08 avec Issam (session de cadrage). Source unique pour les sessions du chantier :
> chaque session lit ce fichier, `CLAUDE.md`, `docs/etat-avancement.md` et les README avant de commencer.
> Les réponses d'Issam aux questions du § 6 sont reportées ici avant le lancement.

## 1. Tâches, par catégorie

Repère : `#n` = numéro du panier de la session de cadrage ; `nouveau` = demandé le 2026-10-08.

### R. Comptes, rôles et droits

| Code | Tâche | Origine |
|---|---|---|
| R1 | Rôle **Réfection** distinct, cumulable (Détection, Réparation, Réfection, Responsable ; + Administrateur) : modèle de droits, matrice, création et affectation, notifications | #5 |
| R2 | Modifier les **rôles par marché** d'un compte existant (menu « ⋯ » de la ligne) ; **suppression** d'un compte seulement s'il n'a aucune saisie, sinon **révocation** (règle vérifiée en base, bouton grisé avec la raison) | #8 |
| R3 | Modifier **nom et prénom** d'un compte, y compris l'administrateur (Issam : nom BOUSALAM, prénom Issam) | #6 |
| R4 | **Matricule** des comptes et des ouvriers ; dans **tous** les documents imprimés ou exportés, le matricule remplace le nom (PDF, Excel, Word, CSV) ; le nom reste à l'écran | #15 |
| R5 | Utilisateurs > Droits : **administrateur et verrous à part**, matrice des seuls utilisateurs, compacte (cases et marges réduites, en-têtes figés), fond inchangé | #9 |
| R6 | Champ **Entreprise** du compte (sous-traitant) | voir Q13 |
| R7 | **Corrections du bureau invisibles du terrain** : pièces barrées, retirées, requalifications, lots et ajustements visibles seulement de l'administrateur et du responsable (panneau ; APK si déjà affichés, réservés à ces rôles). Détection, Réparation et Réfection voient ce qui a été saisi sur le terrain | nouveau |

### V. Circuit de la fuite et validation

| Code | Tâche | Origine |
|---|---|---|
| V1 | **Validation par étape**, une seule validation, par le responsable (ou l'administrateur) : détection, chaque réparation, chaque réfection ; date et auteur gardés ; écran **« À valider »** (panneau et tablette) avec **« Valider (n) »** ; avertissement « aucune photo » au moment de valider, avec bouton pour en ajouter | #14, nouveau |
| V2 | **Modifier** une réparation ou une réfection, panneau et tablette : l'auteur tant que l'étape n'est pas validée ; après validation, **ajout seulement** (le nouvel élément est à valider) ; responsable et administrateur selon la matrice | #2, #14 |
| V3 | **Photos** : changer le type, retirer (retrait logique, fichier gardé dans R2). Avant validation : l'auteur ; après : il ajoute et retire seulement ses photos postérieures à la validation ; responsable et administrateur : tout | #1, #14 |
| V4 | **Photo facultative avec avertissement** (réglage par marché et par étape : facultative avec avertissement, ou obligatoire) | #14, nouveau, voir Q6 |
| V5 | Corrections du responsable : **position GPS** déplacée sur une petite carte avec épingle, **date de détection** modifiable (calendrier et heure), référence, adresse… ; **motif obligatoire** pour date, référence et position ; fuite **saisie à la place d'un agent** (« Détectée par » choisi) ; marque **« saisie différée »** quand la date de détection précède nettement la saisie | #14, nouveau |
| V6 | Après un **lot arrêté**, un agent peut encore ajouter une réparation ou une réfection ; la fuite revient dans « À attacher » au lot suivant (aujourd'hui refusé à l'agent : fuite verrouillée) | #14 |
| V7 | La réparation est possible **dès la détection** (sans attendre la validation) ; seule une réparation **« réparée » et validée** prévient l'équipe de réfection ; pas de verrou automatique de secours | #14 |

### F. Saisie d'une nouvelle fuite

| Code | Tâche | Origine |
|---|---|---|
| F1 | Champs **obligatoires** : tournée (référence SRM), secteur, ouvrage, visibilité ; **facultatifs** : adresse, photo (avec avertissement, V4) | nouveau, voir Q7 |
| F2 | Nouveau champ **nature de dégradation** (même liste que le revêtement à refaire de la réparation) | nouveau |
| F3 | **Suggestions à valider** (jamais pré-remplies) : rue (rues d'Oujda tirées d'OpenStreetMap, dans PostGIS), secteur (zonage en vigueur) ; rayon de recherche adapté à la **précision GPS** annoncée par la tablette ; rien de trouvé ou pas de réseau : aucune suggestion | #11, nouveau |
| F4 | **Mini-carte de localisation** dans le formulaire (zoom rapproché, tronçon le plus proche en surbrillance) ; **diamètre et matériau du tronçon suggérés** (nouveaux champs de la fuite) | nouveau |
| F5 | Natures : **Carrelage**, **Carreaux de ciment (REVSOL)**, **Faïence**, avec l'arabe (à relire par Issam) | nouveau |

### P. Saisie d'une réparation et d'une réfection

| Code | Tâche | Origine |
|---|---|---|
| P1 | Formulaire **séquentiel** : résultat → ouvrage ou matériau → diamètre → travaux réalisés → fouille → revêtement à refaire → emplacement → pièces posées | nouveau |
| P2 | **Diamètre en liste selon le matériau** (PE, PVC, amiante-ciment, fonte…), listes réglables dans Paramètres > Marché | nouveau, voir Q9 |
| P3 | **Pièces posées en capsules** : articles proposés selon matériau et diamètre (et les plus utilisés), un toucher ajoute, « − / + » règle la quantité ; recherche gardée pour le reste | nouveau |
| P4 | **Récapitulatif avant enregistrement** (comme une borne de commande) : travaux, fouille, revêtement, pièces et quantités ; « Corriger » ou « Confirmer » | nouveau |
| P5 | **Date et heure** proposées automatiquement, modifiables (calendrier) | nouveau |
| P6 | **Gardes-fous** (avertissements, jamais de blocage) : distances en mètres, alerte au-delà d'un seuil plausible (ex. 80 au lieu de 0,80) ; **longueur de conduite posée ≤ min(longueur, largeur) de la fouille** | nouveau, voir Q10 |
| P7 | **Représentant SRM** en liste choisie (facultatif), réglable dans Paramètres > Marché ; « Abdelkhalek » inscrit d'office (un seul champ nom) | nouveau |
| P8 | **Refus de l'abonné** (et non réparée en général) : terrassement et pièces posées toujours saisissables et **attachés** ; terrassement sur un revêtement autre que terrain naturel → **réfection obligatoire**, la fuite entre dans la liste des réfections même non réparée | nouveau |
| P9 | Réfection : **total des surfaces de réfection ≥ total des surfaces de fouille** de la fuite, sinon avertissement | nouveau |

### A. Attachement

| Code | Tâche | Origine |
|---|---|---|
| A1 | **Anticipation généralisée** (aujourd'hui limitée à la réfection, ligne « anticipation » avec motif) : case du marché « le maître d'ouvrage accepte l'attachement par anticipation », **panier d'articles anticipables** ; dans le lot, colonne de **propositions anticipées** (couleur distincte) à ajouter ; badge **« Anticipé »** sur la fuite ; ces fuites **prioritaires** (tableau de bord, À faire, alertes) jusqu'à l'exécution réelle ; à l'exécution, le solde (exécuté − attaché) évite le double paiement | nouveau, voir Q8 |

### N. Notifications

| Code | Tâche | Origine |
|---|---|---|
| N1 | **Cloche** du panneau : pastille rouge discrète (nombre, « 9+ »), liste, non lue = point bleu, lue = grisée, **tout marqué lu à l'ouverture**, clic → fiche, en direct | #4 |
| N2 | **Push Android** (expo-notifications + Firebase Cloud Messaging) : rideau même appli fermée, retiré du rideau une fois lu dans l'appli ; pastille sur la tablette | #4 |
| N3 | Circuit : détection → Réparation **et** Responsable (dès la détection) ; réparation « réparée » validée → Réfection ; réfection faite → Responsable ; alerte 48 h → Réparation et Responsable ; administrateur : tout ; jamais l'auteur ; seulement ses marchés | #4, #14 |

### L, C. Listes, tableau de bord, cartes et exports

| Code | Tâche | Origine |
|---|---|---|
| L1 | Kanban des fuites : 5 colonnes dans la largeur (1366, 1440, 1920 px ; menu ouvert ou replié) | #10 |
| L2 | Tableau des fuites : toutes les colonnes choisies dans « Affichage » tiennent dans la largeur | #12 |
| L3 | Tableau de bord : période **« Depuis le début du marché »** (OS de commencement, sinon 1re fuite ; flèches de comparaison masquées) | #3 |
| C1 | Carte imprimée **portrait A4 / A3** : légende qui ne déborde plus, « ≤ » remplacé par « jusqu'à », carte cadrée sur les fuites et le réseau affichés | #16 |
| C2 | **Rapport PDF par fuite** : sans les articles ni les prix du bordereau (blocs réparations et réfections seulement) ; **choix des rubriques à cocher** avant l'export | nouveau |
| C3 | **Balayage : un seul PDF pour la période choisie** (Du = Au → une journée ; sinon toutes les zones et la carte de la période) | nouveau |
| C4 | **Balayage sur la tablette** : carte en plein écran, filtres et liste dans un panneau qui s'ouvre au besoin ; nœuds et diamètres lisibles | nouveau |
| C5 | **Couche satellite** activable (carte du balayage et mini-carte de la fuite), réseau bien lisible par-dessus | nouveau, voir Q4 |

### X. Reste de l'inventaire, intégré au chantier (réponse Q3)

| Code | Tâche | Session |
|---|---|---|
| X1 | **Sauvegarde** : corriger les 3 défauts de l'export, essai de restauration réel, copie hors de GitHub (R2), photos comprises | S4 |
| X2 | **Mise à jour de l'APK** sur les tablettes : version publiée, l'appli propose « Nouvelle version » et l'installe | S7 |
| X3 | **Lots P3 et P4** : inventaire des fournitures posées ; rapprochement posé / transféré avec Dolibarr (entrepôt 76, import CSV) | S9 |
| X4 | **Listes paramétrées en arabe** (toutes les listes de saisie : natures, motifs, ouvrages, matériaux, emplacements…) | S2, S7 |
| X5 | **Tuiles vectorielles** du réseau (PMTiles sur R2) : carte fluide en profil tablette avec tout le réseau | S10 |
| X6 | **Suivi GPS en arrière-plan** : un tracé par agent et par jour, notification permanente, fréquence réglable ; tracés sur la carte | S11 (selon Q14) |
| X7 | **Gabarit SRM** de l'état journalier et de la carte imprimée | selon Q15 |

Jalons SRM (communiquée, avis terrassement, validée) : rien à faire (case du marché, décision d'Issam). Tâches manuelles
d'Issam hors code : 2FA (GitHub, Google, 2ᵉ appli Supabase, Cloudflare), Vercel Pro et désactivation de DEMO avant la
production, essai sur la vraie tablette.

## 2. Contrat technique partagé

- **Migrations réservées** (strictement croissantes, fusion dans cet ordre) : S1 `20261009100000` à `20261009199999` ; S2
  `20261009200000` à `20261009299999` ; S9 `20261009300000` à `20261009399999` ; vague 2 : S10 `20261010100000…`,
  correctifs `20261010200000…` ; vague 3 : S11 `20261011100000…`. Le déploiement refuse une migration plus ancienne que la
  dernière appliquée : fusionner dans l'ordre des numéros.
- **Tests** : pgTAP pour toute règle de base (droits, validation, suppression de compte, notifications, anticipation) ;
  `tsc` et `build` du panneau ; `tsc` et essais sans pile de l'APK ; captures 1366 / 1440 / 1920 px pour L1, L2, R5.
- **Libellés** : tout nouveau libellé de l'APK passe par `t()` et entre dans le dictionnaire arabe à relire par Issam.
- **Documentation** : chaque session met à jour son README ; `docs/etat-avancement.md` seulement par S8.
- **Émulateur** : partagé avec Issam ; vérifier son activité avant toute installation (S7, S8).

## 3. Vagues et sessions

```
Vague 1 (parallèle) ── S1 Base : comptes, rôles, validation, notifications
                    ├─ S2 Base : référentiels et règles terrain, arabe, attachement
                    ├─ S3 Web : listes, tableau de bord, Droits, exports (sans migration)
                    ├─ S4 Sauvegarde et restauration
                    └─ S9 Dolibarr P3 / P4 (base + pages dédiées)
Vague 2 (parallèle, après S1 + S2) ── S5 Web : fiche, validation, formulaires
                                   ├─ S6 Web : comptes, cloche, attachement
                                   ├─ S7 APK : saisie, validation, push, mise à jour, arabe
                                   └─ S10 Cartes : tuiles vectorielles, satellite, balayage plein écran, mini-carte
Vague 3 ── S11 Suivi GPS (selon Q14) → S8 Intégration : un seul APK, essais, documentation, passation
```

| Session | Tâches | Zone de fichiers | Dépend de | Modèle / effort | Taille |
|---|---|---|---|---|---|
| S1 | R1, R2, R4, R6, R7 (base) ; V1 à V7 (base) ; N1, N3 (base, jetons push) | `supabase/` (2026100910…) | — | Opus, high | L |
| S2 | F1, F2, F3 (import des rues), F4 (tronçon proche), F5, P2, P7, P8, X4 (base) ; A1 (base) | `supabase/` (2026100920…), `outils/reseau/` | — | Opus, high | L |
| S3 | L1, L2, L3, R5, C1, C2, C3 | `web/` : liste des fuites, tableau de bord, Droits, `lib/export` | — | Opus, medium | M |
| S4 | X1 | `.github/workflows/`, `supabase/README.md` | — | Sonnet, high | S |
| S9 | X3 | `supabase/` (2026100930…), `web/` : pages Inventaire et Rapprochement | — | Opus, medium | M |
| S5 | V1 à V6, F1 à F4, P1 à P9 (panneau) | `web/` : fiche, Nouvelle fuite, « À valider », hors ligne | S1, S2 | Opus, high | L |
| S6 | R2, R3, R4 (impressions), N1, A1 (lots, priorités), widget P3 au tableau de bord | `web/` : Utilisateurs, coque, attachements, tableau de bord, `lib/export` | S1, S2, S3, S9 | Opus, high | L |
| S7 | F1 à F5, P1 à P9, V1 à V6, R1, R7, N2, X2, X4 (APK) | `mobile/`, `.github/workflows/apk.yml` | S1, S2 ; Firebase | Opus, high | XL |
| S10 | X5, C4, C5, mini-carte servie à l'APK (F4) | `web/` : carte, balayage, `public/`, R2 (PMTiles) | S2, S3 | Opus, high | L |
| S11 | X6 | `supabase/` (2026101110…), `mobile/`, `web/` carte | S7, S10 ; Q14 | Opus, high | L |
| S8 | intégration, APK unique, essais, `docs/etat-avancement.md`, passation | tout (lecture), docs | toutes | Opus, high | M |

**Fusion** (Q1 : oui) : chaque session ouvre une PR, la fusionne dès que la CI est verte, puis vérifie « Déploiement de la
base ». Ordre imposé : S1 → S2 → S9 (migrations) ; S3 avant S6 et S10 ; S7 avant S11.

**Tâches d'Issam** : créer le projet Firebase (début de la vague 2, guidé) ; créer le compte Esri (avant S10, guidé) ;
relire le dictionnaire arabe (fin de S7) ; démarches CNDP et information des agents (avant S11).

## 4. Coût et rapidité

Quota Max dédié à ce chantier (32 % de la semaine consommés le 2026-10-08). Opus suffit partout ; effort « high » pour la
base, la tablette et la logique métier, « medium » pour la mise en page et les exports, Sonnet pour la sauvegarde
(scripts de CI). Point d'étape après la vague 1 : mesurer la consommation et ajuster la vague 2.

## 5. Définition de terminé

Chaque tâche : règle en base testée (pgTAP) quand il y en a une, écran vérifié (navigateur ou émulateur), libellés FR / AR,
README à jour, PR fusionnée et déployée. Le chantier : un APK de `main` installé sur l'émulateur (puis la tablette), essai du
parcours détection → validation → réparation → réfection → lot d'attachement avec notifications.

## 6. Réponses d'Issam (2026-10-08)

| Q | Réponse |
|---|---|
| 1 | Fusion continue dès CI verte, migrations en production comprises : **oui** |
| 2 | Quota dédié à ce chantier ; modèle et effort proposés par session (§ 3) |
| 3 | **Tout l'inventaire** intégré au chantier (§ 1, X) |
| 4 | Satellite **limité à Oujda** (emprise du réseau AEP, secteurs zonés et non zonés, avec une marge) ; meilleur compromis entre stockage local et appel en ligne (voir § 7) |
| 5 | Le réparateur voit **seulement ce qu'il a saisi** ; corrections, requalifications et autres changements : administrateur et responsable |
| 6 | Photo **facultative avec avertissement** (par défaut, réglable) |
| 7 | Tournée **et** nature de dégradation **obligatoires** |
| 8 | Anticipation : **oui** (« Attaché par anticipation », badge « Anticipé », panier par défaut : réfection, quantité = surface de fouille) |
| 9 | Diamètres par matériau : **oui** (PE 20 à 200 ; PVC 63 à 315 ; amiante-ciment 60 à 400 ; fonte 60 à 600 ; acier galvanisé 15 à 50 ; PPR 20 à 63), complétés par le réseau |
| 10 | Pas de seuil fixe pour le PE : la longueur de conduite ou de PE posée se contrôle par rapport à la fouille ; réfection : avertissement au-delà de **30 m²** ; fouille : 10 m, 3 m, 3 m |
| 11 | Carrelage « بلاط », carreaux de ciment REVSOL « بلاط إسمنتي (ريفسول) », faïence **« زليج »**, et **pavé ciment** ajouté (arabe à relire) |
| 12 | Firebase : **oui**, créé par Issam au début de la vague 2 |
| 13 | Champ « Entreprise » : par défaut **oui** (sans réponse contraire) |

## 7. Satellite : choix retenu

Tuiles **en ligne** (Esri World Imagery, offre gratuite ArcGIS Location Platform, clé limitée à `fuites.stepag.ma` et à
l'APK), **chargées seulement quand la couche est activée**, **bornées à l'emprise du réseau d'Oujda** (≈ 15 × 12 km plus
une marge de 1 km) et aux zooms 13 à 19 ; cache du navigateur et de la WebView. Pas de stockage local ni dans R2 : les
conditions d'utilisation des fournisseurs d'imagerie interdisent d'en garder une copie, et l'emprise ferait environ
1,5 Go aux zooms utiles. Usage estimé : bien en dessous de l'offre gratuite (2 millions de tuiles par mois).
Le réseau, lui, passe en tuiles vectorielles PMTiles sur R2 (X5) : ce sont nos données.
