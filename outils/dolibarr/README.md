# Synchronisation des mouvements Dolibarr par l'API REST (chantier v3, X8)

Supabase lit lui-même, toutes les 15 minutes, les mouvements de stock de l'entrepôt du chantier (76 pour le marché
4500004453) dans l'API REST de Dolibarr. Rien n'est installé sur le serveur Windows. Le bouton **Synchroniser
maintenant** de la page Fournitures › Rapprochement lance une lecture tout de suite. L'import CSV de la même page reste le
secours.

```
Supabase                                                             Serveur Dolibarr (Windows, XAMPP)
┌───────────────────────────────────────────────┐   HTTPS, GET seul  ┌──────────────────────────────────────────┐
│ pg_cron (15 min) → pg_net ─┐                  │ ─────────────────▶ │ Cloudflare Access : app « ERP API lecture│
│ bouton du panneau ─────────┤                  │ CF-Access-Client-* │ (Supabase) », erp.stepag.ma/erp/api,     │
│                            ▼                  │ DOLAPIKEY          │ règle Service Auth (jeton de service)    │
│ fonction dolibarr-mouvements (lecture-api.ts) │                    │   → tunnel → /erp/api/index.php          │
│   → recevoir_envoi_dolibarr (service_role)    │ ◀───────────────── │   utilisateur api-suivi-fuites           │
│   → importer_mouvements_dolibarr              │  JSON (sans prix   │   (consulter stocks, mouvements,         │
│   → journal envois_dolibarr                   │  gardé)            │    produits ; rien d'autre)              │
└───────────────────────────────────────────────┘                    └──────────────────────────────────────────┘
```

## Accès (posés par Issam le 2026-10-10)

Mode d'emploi pas à pas : note Claude Docs « Dolibarr : ouverture de l'API en lecture ».

| Où | Quoi |
|---|---|
| Dolibarr 19.0.1 (`https://erp.stepag.ma/erp/`) | module API REST actif ; liste d'adresses IP autorisées **vide** (derrière le tunnel, Dolibarr voit l'adresse de l'appelant, et celles de Supabase changent) ; utilisateur interne `api-suivi-fuites`, non administrateur, trois droits : consulter les produits, les stocks, les mouvements de stocks ; sa clé API |
| Cloudflare Zero Trust (compte `boussalam.issam@…`, équipe `broad-grass-825f`) | jeton de service `supabase-suivi-fuites` (sans expiration) ; application self-hosted `ERP API lecture (Supabase)` sur `erp.stepag.ma/erp/api`, règle `Supabase seulement` en **Service Auth** limitée à ce jeton ; l'application `STEPAG ERP` (reste du site) inchangée |
| Secrets GitHub → Supabase | `DOLIBARR_API_URL` (`https://erp.stepag.ma/erp/api/index.php`), `DOLIBARR_API_CLE`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, posés sur la fonction par le workflow « Déploiement de la base » ; absents, la fonction répond « non configuré » |

Les valeurs sont dans `data-private/dolibarr/api-dolibarr.env` sur le Mac d'Issam (hors dépôt). Pour les recopier dans
GitHub sans les afficher :

```bash
gh secret set -f ~/Desktop/Suivi-fuites/data-private/dolibarr/api-dolibarr.env -R stepag-app/suivi-fuites
```

**Couper l'accès** (clé diffusée, fin du marché) : Cloudflare › Service credentials › `supabase-suivi-fuites` › Revoke,
ou Dolibarr › fiche `api-suivi-fuites` › Désactiver ; l'un des deux suffit. **Changer une clé** : nouvelle valeur dans le
fichier `.env`, la commande ci-dessus, puis relancer « Déploiement de la base » (Actions › Run workflow).

## Fonctionnement (`supabase/functions/dolibarr-mouvements/`)

1. **Verrou et état** : `recevoir_envoi_dolibarr({action: 'debut'})` refuse une seconde lecture simultanée (verrou périmé
   après 3 minutes) et rend, pour chaque entrepôt suivi (`marches.entrepot_dolibarr_id`), le plus grand rowid déjà reçu
   (lecture ou CSV).
2. **Lecture** (`lecture-api.ts`, GET seulement) : `/stockmovements` filtré sur l'entrepôt, rowid plus grand **et** ceux
   des 3 derniers jours (recouvrement : un mouvement corrigé est repris), par pages de 100, triés par rowid ; tout
   l'historique la première fois, ou avec « Tout relire » (administrateur). Référence, désignation et unité : `/products` (filtre
   `in`, 50 produits par appel) et `/setup/dictionary/units` ; nom et projet de l'entrepôt : `/warehouses/{id}`. Un passage
   normal fait une douzaine d'appels (5 s) ; tout l'historique, une vingtaine (7 s).
3. **Entrepôt d'en face** d'un bon de transfert (module additionnel StockTransfers, sans API) : le mouvement jumeau, lu
   dans les rowid voisins des autres entrepôts : même libellé à la minute près (la sortie du dépôt et l'entrée au chantier
   peuvent porter deux minutes différentes), même produit, quantité de signe opposé, même sens d'annulation, au plus 2 min
   d'écart. Sans jumeau (« Consommation pour le projet … »), le mouvement compte comme consommation. Essai du 2026-10-10 :
   128 contreparties sur 129 mouvements, la 129ᵉ étant une vraie consommation.
4. **Envoi à la base** par lots de 1 000 : seuls les mouvements nouveaux ou changés sont importés, sans doublon (clé = rowid
   Dolibarr). Le **n° du bon** et son **projet** ne sont pas dans l'API : clés non envoyées, la base garde ceux déjà reçus par
   le CSV ; sinon projet de l'entrepôt (40). **Jamais de prix** : le prix et le PMP que l'API renvoie ne sont pas recopiés.
5. **Journal** `envois_dolibarr` (page Rapprochement) : une ligne par lecture avec nouveautés ; signes de vie et erreurs
   identiques regroupés ; erreur de lecture en origine `api` (Dolibarr injoignable, Cloudflare ou clé refusés, droit
   manquant, adresse incorrecte), message sans secret. Après une coupure, la lecture suivante repart du dernier rowid reçu.

Planification : `private.declencher_synchro_dolibarr()` (pg_cron `lecture-dolibarr`, `*/15 * * * *`) appelle la fonction
par pg_net avec la clé tirée au hasard par la migration (`private.synchro_dolibarr`, vérifiée par
`verifier_cle_synchro_dolibarr`) ; la fonction répond 202 et lit en arrière-plan. Le bouton passe par le jeton du compte
(`peut_synchroniser_dolibarr` : administrateur, ou « quantités / lire »). Migration
`supabase/migrations/20261014700000_lecture_api_dolibarr.sql`, tests `46_s13_lecture_api_dolibarr.test.sql`.

### Pièges de l'API Dolibarr 19.0.1 (vérifiés le 2026-10-10)

- **Une valeur de filtre qui contient « : »** (heure, libellé « … 12:41 ») fait **ignorer le filtre sans erreur** : toute la
  table revient. D'où des dates sans heure (`'AAAA-MM-JJ'`) et aucun filtre sur le libellé ; les résultats sont refiltrés
  par entrepôt dans la fonction.
- **Heures** : le PHP du serveur est réglé sur l'heure de Berlin. La valeur brute de `datem` et le libellé « Transfert de
  stock AAAA-MM-JJ HH:MM » sont à l'heure de Berlin ; l'API renvoie un horodatage Unix, l'instant vrai. Les CSV, qui
  lisaient la valeur brute comme l'heure du Maroc, étaient en avance d'une à deux heures (deux depuis que le Maroc est à
  l'heure GMT, le 2026-09-20 ; une après le 25 octobre) : « Tout relire » les corrige.
- `GET /stockmovements/{id}` n'existe pas ; le projet de chaque mouvement n'est pas renvoyé.

## Essai depuis le Mac

```bash
deno run --allow-net --allow-read outils/dolibarr/essai-lecture.ts ~/Desktop/Suivi-fuites/data-private/dolibarr/api-dolibarr.env 76
```

Même code que la fonction, GET seulement, rien d'écrit ; affiche le nombre de mouvements, les entrepôts d'en face et les
derniers mouvements, jamais un secret ni un prix. Un troisième argument (rowid) imite un passage normal. Essai de bout en
bout du 2026-10-10 (base locale, PostgREST, fonction servie par Deno, vraie API) : CSV importés (93), premier passage
36 nouveaux, second rien de neuf, « Tout relire » 93 mis à jour (heure, contrepartie) avec n° de bon et projet 30 gardés,
deux lectures simultanées (la seconde « occupée »), erreurs lisibles (jeton Cloudflare faux, clé Dolibarr fausse, secrets
absents, adresse sans `/erp`).

## Historique

Le 2026-10-10, S13 avait d'abord livré un **envoi poussé** (script PHP planifié sur le serveur Windows, PR #89). Il n'a
jamais été installé ; à la demande d'Issam, il est remplacé par cette lecture et retiré du dépôt (le script reste dans
l'historique git, commit `f9c69fd`).
