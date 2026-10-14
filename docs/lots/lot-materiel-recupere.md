# Lot MR : matériel récupéré posé (au lieu du matériel neuf)

> Demande d'Issam du 2026-10-14. **À cadrer avant tout développement** : les questions du § 4 sont à trancher
> d'abord (règles de la SRM et pratique du chantier). Rien n'est développé.

## 0. Demande

À la saisie d'une réparation, pouvoir indiquer qu'une pièce posée est du **matériel récupéré** (réemployé), et non
du matériel **neuf** sorti du stock. Aujourd'hui, toute pièce posée est réputée neuve.

## 1. Pourquoi c'est utile

- **Rapprochement Dolibarr** (`rapprochement_fournitures`, lot P4) : l'écart vaut transféré − consommé − posé, sur
  l'entrepôt du marché (76). Une pièce récupérée n'a jamais été transférée : elle crée aujourd'hui un **faux écart**
  (posé plus grand que transféré).
- **Inventaire des fournitures** (`v_inventaire_fournitures`, `resume_fournitures`) : distinguer ce qui a été
  consommé en neuf de ce qui a été réemployé.
- **Traçabilité envers la SRM** : le CPS met la fourniture, le transport et la pose du matériel de réparation à la
  charge de l'entreprise (R-CPS-098, R-CPS-205), sans parler de réemploi ; il ne cite les « matériaux de
  récupération » que pour les réfections de trottoir (prix 4, R-DEF-017). L'acceptation du réemploi pour les pièces de
  réparation reste donc **à confirmer avec la SRM** (§ 4, question 2).
- **Montant** : a priori **aucun effet**. Les pièces ne changent jamais le montant (fournitures comprises dans les prix,
  CPS art. II-15 ; décision du lot R) : l'attachement passe par les lignes de prix, pas par les pièces.

## 2. Proposition (à valider)

### 2.1 Base

- `reparation_pieces.origine` : `neuf` (par défaut) ou `recupere` (liste fermée, contrainte `check`). D'autres valeurs
  si Issam en demande (§ 4, question 1).
- Colonne **avec valeur par défaut, jamais obligatoire à l'envoi** : une APK en service qui ne l'envoie pas écrit
  « neuf » (règle : aucune migration ne rend obligatoire une colonne qu'une APK en service écrit).
- **Même produit Dolibarr** : le matériel récupéré garde l'article activé de la liste déroulante (désignation seule
  pour le réparateur) ; pas de nouvel article, pas de pièce libre.
- **Corrections du bureau** (lot R) : changer l'origine d'une pièce passe par un **remplacement** avec motif ; la
  saisie d'origine reste visible, comme aujourd'hui.
- **Vues et fonctions** : `v_pieces_reelles`, `v_pieces_posees`, `v_inventaire_fournitures`, `v_fuites_export` et
  `resume_fournitures` exposent l'origine ; `rapprochement_fournitures` ne compte **que le neuf** dans « posé » et
  affiche le récupéré dans une colonne à part, pour information. Attention à l'ordre de recréation des vues
  (`supabase/README.md`, § Fournitures posées, « Dépendance »).
- RLS et privilèges inchangés (même table) ; tests pgTAP : `13_inventaire_fournitures`, `14_rapprochement_dolibarr`,
  et un test de compatibilité (insertion sans `origine` → `neuf`).

### 2.2 Tablette (APK)

- Ajout d'une pièce : deux gros boutons **« Neuf »** (choisi par défaut) / **« Récupéré »**, un seul geste de plus au
  pire. Libellés en français, hybride et arabe.
- Hors ligne : la file d'attente transporte l'origine ; une saisie en attente d'une ancienne version part en « neuf ».
- Fiche de la fuite : mention « récupéré » à côté de la pièce.
- Fichiers concernés : `mobile/src/saisie.tsx`, `mobile/src/fiche.tsx`, `mobile/src/fiche-donnees.ts`,
  `mobile/src/file-attente.ts`, `mobile/src/parametres.ts`, `mobile/src/types.ts`, traductions.
- Nouvelle APK à publier **à la demande d'Issam** (`mobile/README.md` § Publier), après essai sur l'appli DEV.

### 2.3 Panneau web

- Saisie et modification d'une réparation : `web/src/app/(app)/fuites/[id]/form-reparation.tsx`.
- Attachement, pièces et corrections : `PiecesFuite.tsx`, `CorrectionsFuite.tsx`, `controles.ts`.
- Rapport PDF par fuite (`web/src/lib/export/rapport-fuite.ts`) et exports : mention « récupéré » (selon la réponse à
  la question 2).
- Fournitures : filtre neuf / récupéré dans l'inventaire ; colonne « récupéré » dans le Rapprochement Dolibarr.
- Marché de démonstration (`web/src/lib/demo/`) : quelques pièces récupérées pour les essais.

## 3. Hors périmètre (sauf demande)

- Pas de **stock du matériel récupéré** (entrées par dépose, sorties par repose) : seulement l'origine de la pièce
  posée. À ouvrir si la question 3 ou 8 le demande.
- Aucun prix, aucun changement du montant de l'attachement.

## 4. Questions pour Issam (à trancher avant le développement)

1. **Sens de « récupéré »** : pièce déposée sur la même fuite et reposée ? pièce récupérée ailleurs (autre chantier,
   dépôt STEPAG) ? matériel fourni par la SRM ? Faut-il **deux choix** (neuf / récupéré) ou **plusieurs** (neuf,
   récupéré sur place, récupéré au dépôt, fourni par la SRM) ?
2. **Position de la SRM** : accepte-t-elle le réemploi pour les pièces de réparation (colliers, robinets PEC, joints,
   tuyaux) ? Faut-il le faire apparaître sur la fiche de réparation, le rapport par fuite, l'attachement ? Le prix
   reste-t-il le même (hypothèse : oui) ?
3. **Dolibarr** : le matériel récupéré y est-il suivi (entrepôt dédié, par exemple « récupération ») ? Si oui, le
   rapprochement peut aussi le comparer.
4. **Qui choisit** : le réparateur sur la tablette (proposé), le bureau corrigeant avec motif ?
5. **Valeur par défaut** : « Neuf » (proposé).
6. **Familles concernées** : toutes (RAC, CND, ROB, AEP, VRI) ou seulement certaines ?
7. **Photo** de la pièce récupérée : facultative comme les autres photos (proposé) ou exigée ?
8. **Pièce déposée** : faut-il noter aussi ce que devient la pièce retirée de la fuite (jetée, gardée pour réemploi) ?
   Ce serait le début d'un stock de récupération (hors périmètre proposé).

## 5. Contraintes et place dans la feuille de route

- Migration **additive** (colonne avec défaut), numéro plus haut que la dernière migration appliquée au moment de la
  fusion (renommer si une autre session a fusionné entre-temps).
- Indépendant de S23 (fermeture, rotation des secrets) et S24 (Vercel Pro) ; Issam choisit le moment. Si le lot est
  livré **après S23**, l'APK est compilée avec la nouvelle clé anon (rien de particulier à faire, la CI la prend).
- Une session suffit (locale sur le Mac de préférence : `docs/travail-local.md`) : base + APK + panneau, environ une
  demi-journée une fois les questions tranchées.

## 6. Définition de terminé

- Migration et tests pgTAP verts ; CI de la branche verte (base, panneau, APK).
- Essai sur la tablette d'Issam (appli DEV) : pièce neuve, pièce récupérée, saisie hors ligne puis envoi, correction
  depuis le panneau.
- Rapprochement : une pièce récupérée ne crée plus d'écart.
- Documentation mise à jour : `supabase/README.md` (schéma, fournitures), `web/README.md`, `mobile/README.md` si
  besoin, `docs/etat-avancement.md` ; ligne déplacée de `docs/feuille-de-route.md` vers l'état d'avancement.
