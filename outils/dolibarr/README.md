# Envoi automatique des mouvements Dolibarr (chantier v3, X8)

Les mouvements de stock de l'entrepôt du chantier (76 pour le marché 4500004453) arrivent seuls dans Supabase, toutes les
15 minutes, sans ouvrir Dolibarr à Internet. L'import CSV de la page Rapprochement reste en secours.

```
Serveur Dolibarr (Windows, XAMPP)                       Supabase
┌────────────────────────────────────┐   HTTPS sortant  ┌─────────────────────────────────────────┐
│ tâche planifiée (15 min, SYSTEM)   │ ───────────────▶ │ fonction dolibarr-mouvements            │
│ envoi-mouvements.php               │  x-jeton-dolibarr│  (jeton = secret DOLIBARR_JETON)        │
│  · lit la base erp en lecture seule│                  │ recevoir_envoi_dolibarr (service_role)  │
│  · journal\envoi-AAAA-MM.log       │ ◀─────────────── │  → importer_mouvements_dolibarr         │
└────────────────────────────────────┘   état, résultat │  → journal envois_dolibarr              │
                                                        └─────────────────────────────────────────┘
```

## Fichiers

| Fichier | Rôle |
|---|---|
| `envoi-mouvements.php` | le script (PHP 7.1 et plus, extensions mysqli et curl) |
| `config.exemple.ini` | modèle de configuration ; `config.ini` (créé sur le serveur, **jamais versionné**) porte le jeton |
| `1-creer-jeton.cmd` | crée `config.ini` et y écrit un jeton neuf (affiché une fois, pour le secret GitHub) |
| `2-essai.cmd` | vérifie tout (configuration, jeton, lecture de Dolibarr) et montre ce qui partirait, sans rien envoyer |
| `3-envoyer-tout.cmd` | renvoie tout l'historique des entrepôts suivis (une fois à l'installation ; rien n'est doublé) |
| `4-installer-tache.cmd` | installe la tâche planifiée « STEPAG\Envoi mouvements Dolibarr » (à lancer en administrateur) |
| `desinstaller-tache.cmd` | supprime la tâche |

Installation pas à pas : note Claude Docs « Envoi automatique Dolibarr : installation sur le serveur » (dossier conseillé
`C:\stepag\envoi-dolibarr\`, hors du Bureau : la tâche tourne sous le compte SYSTEM).

## Fonctionnement

1. **État** : le script demande à la fonction, pour chaque entrepôt suivi (`marches.entrepot_dolibarr_id`, réglé dans le
   panneau), le plus grand rowid déjà reçu (envoi automatique ou CSV). Aucun entrepôt n'est écrit dans le script.
2. **Lecture** : dans `llx_stock_mouvement` (lecture seule, transaction `READ ONLY`, identifiants lus dans `conf.php` à
   chaque passage comme `export.php`), les mouvements de rowid plus grand **et** ceux des 3 derniers jours
   (`jours_recouvrement`) ; le bon de transfert (module StockTransfers, s'il existe) donne la contrepartie et le projet.
   Textes nettoyés (balises, entités HTML). **Jamais de prix, PMP ni valeur.**
3. **Envoi** par lots de 1 000 (`taille_lot`), dans l'ordre des rowid ; la base n'importe que les nouveaux ou changés,
   ignore les entrepôts non suivis, refuse un lot invalide en bloc. Un passage sans rien de neuf laisse un signe de vie.
4. **Rattrapage** : en cas de coupure (Internet, serveur éteint, Supabase en pause), le passage suivant repart du dernier
   rowid reçu ; rien à faire. `--tout` renvoie tout l'historique si besoin (contrôle, CSV partiel importé avant).
5. **Erreurs** : lecture de Dolibarr impossible → signalée au panneau (message sans identifiant de base) et au journal
   local ; fonction injoignable → journal local seulement, le panneau passe « En retard » au-delà d'une heure.

Code de sortie : 0 si tout va bien (ou exécution déjà en cours), 1 en cas d'échec (visible dans le Planificateur de tâches).

## Essai de bout en bout (Mac, sans Supabase ni Dolibarr)

Vérifié le 2026-10-10 : MariaDB jetable avec des tables `llx_` factices (transferts, annulation, retour, entités HTML,
entrepôt non suivi) → `envoi-mouvements.php` → fonction servie par Deno (`DENO_SERVE_ADDRESS`, `SUPABASE_URL` vers PostgREST
local) → base d'essai. Cas couverts : essai à blanc, premier envoi (5 nouveaux, entrepôt 60 écarté), renvoi sans doublon,
coupure de la fonction puis rattrapage (2 nouveaux), modification reprise (1 mis à jour), mot de passe de base refusé
(erreur signalée et regroupée), `--tout` (0 nouveau). Le script accepte une `url_fonction` en `http://127.0.0.1:<port>/`
pour cet essai seulement.
