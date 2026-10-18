#!/usr/bin/env bash
# Import de l'historique Excel : une commande par étape.
#   outils/import-excel/importer.sh verifier          état du marché et des comptes (lecture seule)
#   outils/import-excel/importer.sh generer           injecter.sql + controle-import.xlsx depuis l'Excel
#   outils/import-excel/importer.sh essai             injecte puis annule tout (rollback) : contrôle sans écrire
#   outils/import-excel/importer.sh injecter          injecte pour de bon
#   outils/import-excel/importer.sh annuler [forcer]  retire les fuites importées (forcer : même validées)
#
# Connexion : BASE_URL dans data-private/import-excel/.env (jamais dans le dépôt, jamais affichée).
# Réglages : data-private/import-excel/config.json.
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
OUTIL="$RACINE/outils/import-excel"
DONNEES="${DONNEES:-$RACINE/data-private/import-excel}"
CONFIG="$DONNEES/config.json"

if [ -z "${BASE_URL:-}" ] && [ -f "$DONNEES/.env" ]; then set -a; . "$DONNEES/.env"; set +a; fi
: "${BASE_URL:?BASE_URL absent : le renseigner dans data-private/import-excel/.env}"
# Adresse copiée telle quelle depuis Supabase : le mot de passe vient de PGPASSWORD
BASE_URL="${BASE_URL/:\[YOUR-PASSWORD\]/}"
PSQL="${PSQL:-psql}"

lire() { python3 -c "import json,sys; print(json.load(open('$CONFIG'))[sys.argv[1]])" "$1"; }
MARCHE="$(lire marche)"
COMPTES="$(lire detecteur),$(lire reparateur),$(lire saisie)"
lancer() { "$PSQL" -X -q -v ON_ERROR_STOP=1 -P pager=off "$BASE_URL" "$@"; }

case "${1:-}" in
  verifier)
    lancer -v marche="$MARCHE" -v comptes="$COMPTES" -f "$OUTIL/verifier.sql" ;;
  generer)
    (cd "$RACINE" && python3 "$OUTIL/generer.py" --config "$CONFIG") ;;
  essai)
    lancer -v fin=rollback -f "$DONNEES/injecter.sql"
    echo "Essai terminé : rien n'a été écrit (rollback)." ;;
  injecter)
    lancer -v fin=commit -f "$DONNEES/injecter.sql"
    echo "Import écrit." ;;
  annuler)
    forcer=non; [ "${2:-}" = forcer ] && forcer=oui
    lancer -v marche="$MARCHE" -v forcer="$forcer" -v fin=commit -f "$OUTIL/annuler.sql"
    echo "Import annulé." ;;
  *)
    sed -n '2,8p' "$0"; exit 1 ;;
esac
