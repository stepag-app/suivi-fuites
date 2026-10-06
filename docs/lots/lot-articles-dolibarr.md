# Lot T : articles Dolibarr, référentiel unique des pièces

> Contrat de regroupement (session du 2026-10-06, nuit). Il **remplace** le modèle « catalogue des pièces par
> marché + rapprochement avec la nomenclature Dolibarr » (lot P1) et **suspend** les lots P3 (inventaire des
> fournitures posées) et P4 (rapprochement posé / transféré), arrêtés en cours de route : leurs copies de travail
> (`.claude/worktrees/agent-a717ba124be578155`, `.claude/worktrees/agent-a3becbb029e3ba53d`) ne sont ni
> commitées ni poussées, et servent seulement de référence pour la relance (§ 7).

## 0. Constat et décision d'Issam

Le catalogue des pièces vient d'un tableau Excel saisi à la main au démarrage (261 lignes, libellés hétérogènes,
doublons). Le lot P1 a ajouté par-dessus un rapprochement pièce par pièce (sûres, probables, sans correspondance)
avec la nomenclature Dolibarr. Ce rapprochement est une complication inutile : Dolibarr contient déjà des
produits réels, bien renseignés et sans doublons.

**Nouveau principe** :

1. Les **produits Dolibarr importés** (`produits.csv`, déjà importés sur DEMO) sont **le** référentiel des pièces.
   Ils sont **globaux** : ni par marché, ni par société, et rien n'est codé en dur.
2. Quand Dolibarr reçoit de nouveaux produits, on **réimporte** la liste. Les nouveaux produits arrivent
   **désactivés**.
3. L'administrateur **active** les produits utilisables. Seuls ceux-là s'affichent dans la liste déroulante du
   réparateur (APK et panneau web).
4. La pièce posée référence **directement** le produit Dolibarr. Inventaire et rapprochement avec le stock
   Dolibarr deviennent natifs, sans table de correspondance.

## 1. Décisions (2026-10-06)

| Sujet | Décision |
|---|---|
| Activation d'un produit | **Globale** : un seul interrupteur par produit, valable pour tous les marchés |
| Article du bordereau suggéré par une pièce | **Règles par marché** : le produit reste global ; chaque marché associe une **famille** ou un **produit** à un article de **son** bordereau (le produit l'emporte sur la famille) |
| Ancien catalogue (261 pièces) et pièces déjà posées | **Purge** : rien n'est en production. On supprime l'ancien catalogue et on remet à zéro les pièces posées (DEMO compris) |
| Périmètre de l'import | Familles **RAC, CND, ROB, AEP, VRI** (préfixe de la référence), comme l'import actuel |
| Pièce libre (texte hors Dolibarr) | **Gardée** pour les cas exceptionnels |
| Unité | **Celle de Dolibarr**, telle quelle (U, m, Barre, kg…), sans conversion |
| Activation de départ | **Pré-activation** : tout produit rapproché d'une pièce du catalogue (lot P1) devient activé, calculé par la migration (158 sur DEMO) |

Inchangé : aucun prix Dolibarr dans l'application, le réparateur ne voit que la **désignation** (jamais la
référence ni l'identifiant), import lu dans le navigateur (l'API Dolibarr n'est pas joignable depuis Internet).

## 2. Modèle de données cible

### 2.1 `produits_dolibarr` (existe, lot P1) : référentiel global

- Garder : `dolibarr_id` (rowid, clé), `ref`, `designation`, `unite`, `famille`, `actif` (présent dans Dolibarr et
  en vente ou en achat), `importe_le`, `modifie_le`, l'import `importer_produits_dolibarr` (idempotent par rowid)
  et le journal `imports_dolibarr`.
- Ajouter :
  - `utilisable boolean not null default false` : **activé pour la liste déroulante**. Seul l'administrateur le
    modifie (fonction dédiée ou déclencheur, journalisé). Un nouveau produit importé arrive à `false`.
  - `utilisable_le`, `utilisable_par` (trace de l'activation) et `cree_le` (arrivée du produit, pour le filtre
    « nouveaux du dernier import »).
  - Unité : `unite` de Dolibarr telle quelle (décision du 2026-10-06), « u » pour une pièce libre.
- Produit qui disparaît de Dolibarr ou n'est plus ni en vente ni en achat : `actif = false`. Il **sort de la
  liste déroulante** (la liste lit `actif and utilisable`) mais reste lisible dans l'historique.
- Liste déroulante : `utilisable and actif`, triée par désignation, avec recherche. La famille sert de filtre
  (libellé lisible : Raccords, Conduites, Robinetterie…, sans le code).

### 2.2 Lecture par le terrain

`produits_dolibarr` devient lisible par tout compte affecté à au moins un marché (et l'administrateur) : la table ne
contient aucun prix, la référence n'est qu'un code que l'interface ne montre que dans Paramètres > Articles. Pas de
vue intermédiaire (plus simple ; les vues du lot R lisent la table directement).

### 2.3 Pièces posées : `reparation_pieces`

- Remplacer `piece_id uuid → catalogue_pieces` par `produit_id integer references produits_dolibarr (dolibarr_id)`.
- Contrôle à l'écriture : un produit **nouvellement** choisi doit être `utilisable and actif`. Une ligne déjà saisie
  garde son produit même s'il est désactivé ensuite.
- `designation_libre` : **gardée** (décision du 2026-10-06), pour les cas exceptionnels.
- Même traitement pour les corrections du bureau (lot R : pièce oubliée, remplacée ou retirée) et pour
  `v_pieces_reelles`.

### 2.4 Suggestion d'article par marché : nouvelle table `suggestions_articles`

```
suggestions_articles (
  id uuid pk, marche_id uuid not null → marches,
  prix_id uuid not null, (prix_id, marche_id) → prix (id, marche_id),
  famille text null,            -- préfixe Dolibarr (RAC, CND…)
  produit_id integer null → produits_dolibarr,
  check (num_nonnulls(famille, produit_id) = 1),
  unique (marche_id, famille), unique (marche_id, produit_id)
)
```

Résolution pour une pièce posée : la règle du **produit**, sinon celle de sa **famille**, sinon aucune. Cette
résolution remplace `catalogue_pieces.prix_suggere_id` partout, notamment dans les contrôles de l'attachement
(lot R, migration `20261006100100`, lignes qui joignent `cp.prix_suggere_id`). `copier_marche` copie ces règles
(en remappant `prix_id` vers le bordereau copié). RLS et droits identiques aux autres paramètres du marché.

### 2.5 Supprimé

- Table `catalogue_pieces` (avec ses colonnes P1 : `produit_dolibarr_id`, `hors_nomenclature`,
  `designation_initiale`), son déclencheur `nomenclature_dolibarr` et `private.nomenclature_catalogue`.
- Ce qui la copie ou l'alimente : `copier_marche` (migrations `20261005100000` et `20261006100300`), le jeu DEMO
  (`20261004230000_marche_demo.sql`), le jeu du marché 4500004453 (`20261004090700`). On ne modifie **jamais** une
  migration existante : une **nouvelle** migration redéfinit les fonctions et vues concernées, puis supprime la table.
- Les compteurs P1 de `imports_dolibarr` (`pieces_renommees`, `conflits_designation`) : gardés à 0 ou supprimés.

## 3. Panneau web

- **Paramètres > Articles** (remplace « Catalogue des pièces » et « Nomenclature Dolibarr ») :
  - un seul écran, **global**, sans sélecteur de marché pour l'activation ;
  - bouton **Importer produits.csv** (repris de P1 : familles RAC, CND, ROB, AEP, VRI cochées par défaut) avec un
    compte rendu (nouveaux, modifiés, retirés de Dolibarr, unités inconnues) ;
  - tableau avec recherche, filtre par famille et filtre « Activés / Non activés / Nouveaux depuis le dernier
    import / Retirés de Dolibarr » ;
  - interrupteur **Activer** par ligne, activation **en masse** de la sélection ou du filtre courant, et unité
    terrain modifiable ;
  - la référence Dolibarr n'est visible qu'ici (administrateur).
- **Paramètres > Bordereau** (par marché) : la section « Suggestion d'article » associe une famille ou un produit
  à un article.
- Supprimer `NomenclatureRapprochement.tsx`, l'écran de rapprochement et `OngletCatalogue.tsx`. Réutiliser
  `web/src/lib/nomenclature/csv.ts` (lecture du CSV).
- Adapter : fiche d'une fuite (`fuites/[id]/donnees.ts`, `formulaires.tsx`), attachement (`attachements/controles.ts`,
  `[id]/PiecesFuite.tsx`, `[id]/CorrectionsFuite.tsx`), rapport PDF par fuite (`lib/export/rapport-fuite.ts`),
  exports (`20261004210000_exports.sql`).

## 4. APK

- `mobile/src/parametres.ts` : lire `produits_dolibarr` (`utilisable and actif`, par pages) au lieu de
  `catalogue_pieces` filtré par marché ; clé de cache `v2` (l'ancienne copie n'est plus lue).
- `saisie.tsx`, `fiche.tsx`, `fiche-donnees.ts`, `types.ts`, `file-attente.ts` : `piece_id` devient `produit_id`
  (entier). File d'attente : un envoi gardé par une version précédente (avec `piece_id`) part en pièce libre
  (désignation conservée), sans blocage.
- Liste déroulante : recherche par mots (la liste peut compter plusieurs centaines d'articles), filtre par famille.

## 5. Purge (rien n'est en production)

Dans la nouvelle migration, avant de supprimer `catalogue_pieces` : supprimer les lignes de `reparation_pieces`
(terrain et corrections du bureau) de **tous** les marchés, et vider les règles de suggestion héritées. Les
réparations elles-mêmes, les ouvriers, les photos et les réfections restent. Le jeu DEMO ne recrée plus de pièces
posées. Il pourra en recréer plus tard à partir de produits Dolibarr activés (lot ultérieur).

## 6. Tests

- pgTAP (`supabase/tests/database/11_articles_dolibarr.test.sql`, remplace le fichier du lot P1) : import (nouveau produit à `false`, produit
  retiré passe `actif = false` sans perdre l'historique), activation réservée à l'administrateur, `v_articles` sans
  référence et lisible par un réparateur affecté, refus d'un produit non activé ou retiré à la saisie, ligne
  ancienne conservée, résolution produit > famille > aucune, copie des règles par `copier_marche`, RLS de
  `suggestions_articles`, absence de `catalogue_pieces`.
- Les tests existants qui utilisent le catalogue (lots A, R, P1 : fichier `11`) sont adaptés ou retirés.
- Web : `tsc`, `build`, scripts de vérification. APK : types, bundle, essais `mobile/essais/`.

## 7. Après ce lot : relance de P3 et P4 sur le nouveau modèle

- **P3 inventaire des fournitures posées** : regroupement direct par `produit_id`. La famille est celle du produit,
  et la ligne « sans correspondance » ne concerne plus que les pièces libres.
- **P4 rapprochement posé / transféré** : jointure directe `mouvements_dolibarr.produit_dolibarr_id =
  reparation_pieces.produit_id`. Les règles de calcul (transféré, consommé, posé, écart, seuil) écrites dans la copie
  de travail P4 restent valables.
- Les deux copies de travail arrêtées sont supprimées une fois P3 et P4 relancés.

## 8. Questions tranchées (2026-10-06)

1. Pièce libre : gardée. 2. Unités : celles de Dolibarr. 3. Activation initiale : pré-activation des produits rapprochés.

## 9. Coordination

- Sessions parallèles : lot S (réseau, balayage, APK balayage) et maquette shadcn. Elles ne touchent pas au modèle
  des pièces, mais la maquette modifie `parametres/page.tsx` : on fusionne dans l'ordre et on résout l'onglet à la
  main.
- Migration : `supabase/migrations/20261006140000_articles_dolibarr.sql` (après celles du lot S, `20261006120000`).
- Branche : `claude/lot-articles-dolibarr`.
