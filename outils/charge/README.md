# Essai de charge (3 000 fuites)

Outils de l'essai décrit dans [`docs/essai-charge-3000.md`](../../docs/essai-charge-3000.md). Tout tourne **en local**
(PostgreSQL 17 + PostGIS, PostgREST, relais d'authentification) ; aucun script n'accepte une adresse distante.

| Fichier | Rôle |
|---|---|
| `preparer-base.sh` | crée la base locale `charge_3000` : migrations du dépôt, réseau copié depuis une base locale qui l'a importé (`SOURCE`, défaut `essai_interface`) vers le marché DEMO, puis `generer-charge.sql` |
| `generer-charge.sql` | `:nb` fuites fictives (défaut 3 000) sur DEMO, sur 12 mois et sur les secteurs, avec réparations, pièces, réfections, ~4 lignes photos par fuite (sans fichier) et un an de balayage (2 agents × 4 km par jour ouvré, 10 % de seconds passages) ; 8 comptes d'essai `c0000000-…-00000000000N` (1-4 détection, 5-6 chefs, 7 responsable, 8 administrateur) |
| `mesurer-sql.sql` | temps SQL (EXPLAIN ANALYZE, médiane de 3) et volume JSON des lectures principales, sous la RLS du compte `:uid` |
| `mesurer-pages.mjs` | rejoue contre PostgREST les lectures de chaque page (`avant` : code d'origine, `apres` : code corrigé) ; durée, volume brut et gzip, lignes, appels |
| `mesurer-navigateur.mjs` | ouvre les pages du panneau dans Chrome sans interface (profil `bureau` ou `tablette` : processeur ÷ 4, 4G 80 ms / 10 Mbit/s) ; données reçues, volume, tâches longues, tas JS, mémoire du rendu pour la carte avec tout le réseau |
| `relais.mjs` | imite `/auth/v1` de Supabase et transmet `/rest/v1` à PostgREST, compressé en gzip |

## Déroulé

```bash
PGHOST=localhost PGPORT=5432 PGUSER=$(whoami) bash outils/charge/preparer-base.sh
```

PostgREST (fichier de configuration hors dépôt, rôle `authenticator` du cluster local) :

```text
db-uri = "postgres://authenticator@localhost:5432/charge_3000"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "<secret local d'au moins 32 caractères>"
server-port = 54331
db-max-rows = 1000
```

```bash
PGRST_JWT_SECRET=<même secret> node outils/charge/relais.mjs
```

Panneau web construit contre le relais (`web/.env.local` : `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398`, clé
anonyme quelconque), puis `npm run build && npx next start -p 3107` dans `web/`.

```bash
psql -d charge_3000 -v uid=c0000000-0000-4000-8000-000000000001 -f outils/charge/mesurer-sql.sql
PGRST_JWT_SECRET=<secret> node outils/charge/mesurer-pages.mjs avant
PGRST_JWT_SECRET=<secret> node outils/charge/mesurer-pages.mjs apres
node outils/charge/mesurer-navigateur.mjs bureau
node outils/charge/mesurer-navigateur.mjs tablette
```

`db-max-rows = 1000` reproduit le plafond « Max rows » de l'API Supabase : c'est lui qui tronquait `etat_balayage`.
Les chiffres du navigateur viennent de Chrome sans interface sur le MacBook (rendu WebGL logiciel) : ils servent à
comparer avant / après, pas à prédire au dixième de seconde le temps sur la tablette.
