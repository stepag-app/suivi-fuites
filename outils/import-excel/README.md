# Import de l'historique Excel (fuites saisies avant les tablettes)

Demande d'Issam du 2026-10-18 : injecter dans le marché SRM-4500004453 les fuites tenues par la responsable dans
l'attachement Excel (« Attachement N°1 mois 10.xlsx », feuille « Fiche de réparation par num »), depuis l'ordre de
service du 2026-10-02, pour démarrer les tablettes avec un compteur à jour.

Ce dossier ne contient que le code. Les données réelles restent hors du dépôt, dans `data-private/import-excel/` :

| Fichier | Rôle |
|---|---|
| `source/*.xlsx` | l'attachement Excel d'origine |
| `config.json` | marché, comptes (détection, réparation, saisie), chemins |
| `travail/articles-candidats.json` | pièces de l'Excel et articles Dolibarr candidats (données de l'artefact) |
| `travail/choix-artefact/` | choix cochés dans l'artefact « Articles de l'attachement n° 1 » |
| `correspondance-articles.json` | correspondance apprise pièce Excel → article Dolibarr, gardée pour les imports suivants |
| `injecter.sql`, `controle-import.xlsx` | produits par `generer.py` |
| `.env` | `BASE_URL` (connexion d'administration de la base), saisie par Issam, jamais affichée |

## Règles appliquées (validées par Issam le 2026-10-18)

- Numéros de l'Excel gardés (1 à 112) ; la première fuite saisie sur tablette prend le numéro suivant.
- Auteurs : l'agent de détection et le chef de réparation désignés dans `config.json` ; saisie : la responsable,
  depuis le papier.
- Date de détection : celle des rapports journaliers du 2026-10-02 quand la tournée y figure, sinon la date de la fiche.
- Fuites sans pièce ni fouille : « Détectée », à réparer sur tablette ; l'alerte des 48 h joue normalement.
- Visibilité : invisible ; ouvrage déduit des pièces (robinet ou collier PEC, raccord, PE de DE < 40 → branchement ;
  sinon conduite) ; secteur laissé vide (la responsable le choisit avant de valider) ; pas de GPS ni de photo.
- Réparation : fouille, nature de dégradation, cases « tuyau réparé », « robinet PEC », « collier PEC », « bouche à
  clé » déduites des pièces ; la base calcule les lignes de prix comme pour une saisie de tablette. Pas de réfection.
- Rien n'est validé ; source de saisie `import`, observation « Import de l'attachement Excel n° 1 (fiche n° …) ».
- Les articles retenus sont activés (Paramètres › Articles) pour être proposés dans les listes.

## Par l'éditeur SQL de Supabase (sans accès à la base depuis le Mac)

`generer` écrit aussi `data-private/import-excel/editeur-supabase/` : `1-verifier.sql` (lecture seule),
`2-injecter.sql`, `3-annuler.sql` et `3-annuler-forcer.sql`, sans commandes psql. Les coller un par un dans
Supabase › SQL Editor (rôle `postgres`, donc mode système) ; chacun affiche un seul tableau de contrôle. Même
transaction, mêmes garde-fous que par `importer.sh`.

## Commandes

```bash
python3 outils/import-excel/correspondance.py --config data-private/import-excel/config.json
outils/import-excel/importer.sh generer
outils/import-excel/importer.sh verifier
outils/import-excel/importer.sh essai
outils/import-excel/importer.sh injecter
outils/import-excel/importer.sh annuler
```

Depuis un worktree sans `data-private/`, passer `DONNEES=~/Desktop/Suivi-fuites/data-private/import-excel` devant
la commande (les chemins de `config.json` sont absolus).

- `essai` joue tout l'import puis l'annule (rollback) : contrôle sans rien écrire.
- `annuler` retire seulement les fuites `source_saisie = 'import'` et ce qui en dépend ; les fuites des tablettes
  restent, le compteur repart du plus grand numéro restant. Refusé si une fuite importée est attachée, verrouillée,
  liée, ou a reçu une réfection, une photo ou une réparation d'une tablette ; refusé aussi si elle est validée, sauf
  `annuler forcer`.
- **Nouvel import après correction de l'Excel** : remplacer le fichier dans `source/`, `annuler`, relancer
  `correspondance.py` (les pièces déjà connues sont reprises ; une pièce nouvelle est signalée et se choisit dans
  l'artefact), `generer`, `essai`, `injecter`. Les corrections faites entre-temps dans le panneau sur les fuites
  importées sont perdues.

## Essai local

Base PostgreSQL 17 avec `supabase/ci/simulateur-supabase.sql` et toutes les migrations, comptes et articles chargés
par `data-private/import-excel/travail/banc-donnees.sql`, puis `BASE_URL="host=… port=… dbname=… user=postgres"`.
Vérifié le 2026-10-18 : import (31 détectées, 80 réparées, 1 sans réparation ; prix 3 = 61,015 m³), fuite de
tablette n° 113 après l'import, annulation (la fuite 113 reste), second import, garde-fou « validée », édition et
validation par la responsable.
