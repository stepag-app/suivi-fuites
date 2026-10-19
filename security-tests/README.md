# security-tests — rejeu des attaques de l'audit S20

Scripts **rejouables** prouvant chaque faille (et chaque contrôle qui tient) sur un banc
**local** PostgreSQL 17 + migrations. Aucune requête vers la production.

## Prérequis
- PostgreSQL 17 (`/opt/homebrew/opt/postgresql@17`) avec PostGIS et pgTAP
- Node ≥ 18 (pour le test d'injection CSV)

## Lancer tout
```bash
bash security-tests/lancer-tout.sh
```
Monte un banc jetable (initdb sur un port 5440, migrations + jeu d'identités), joue toutes
les familles, puis arrête le banc. Chaque script affiche **ATTENDU vs OBTENU**.

## Fichiers
| Script | Famille | Prouve |
|---|---|---|
| `01-cloisonnement.sh` | §3.1 | isolation A↔B (lecture/écriture) tient ; résidu journaux Dolibarr |
| `02-controles-auteur-colonnes.sh` | §3.2/§3.4/§3.3 | exploits d'auteur/colonnes **refusés après correctif**, usages légitimes OK |
| `07-injection-csv.mjs` | §3.7 | neutralisation des formules CSV (helper réel) |
| `_bench.sh` / `_forge.sh` / `_seed.sql` | — | banc jetable, forge d'identité (role + request.jwt.claims), jeu d'essai |

La régression est aussi couverte côté CI par `supabase/tests/database/59_s20_durcissement_securite.test.sql`.

## Jeu d'identités (`_seed.sql`)
admin, resp_A, detection_A, reparation_A, refection_A, resp_B, detection_B, inactif_A.
Marché A = SRM-4500004453, marché B = DEMO.
