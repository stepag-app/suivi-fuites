#!/usr/bin/env bash
# Applique les migrations et les données du marché sur une base PostgreSQL +
# PostGIS + pgTAP ordinaire (sans Supabase), puis lance les tests pgTAP.
# Utilisé par la CI GitHub ; utilisable sur un poste disposant de PostgreSQL.
#
# Variables : PGHOST, PGPORT, PGUSER (super-utilisateur), BASE (défaut : essai_suivi_fuites)
set -euo pipefail

BASE="${BASE:-essai_suivi_fuites}"
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "drop database if exists ${BASE}" -c "create database ${BASE}"

"${PSQL[@]}" -d "$BASE" -f "$RACINE/ci/simulateur-supabase.sql"
for f in "$RACINE"/migrations/*.sql; do
  echo "Migration : $(basename "$f")"
  "${PSQL[@]}" -d "$BASE" -f "$f"
done
for f in "$RACINE"/donnees/*.sql; do
  echo "Données : $(basename "$f")"
  "${PSQL[@]}" -d "$BASE" -f "$f"
done

"${PSQL[@]}" -d "$BASE" -c "create extension if not exists pgtap with schema extensions"
pg_prove -d "$BASE" "$RACINE"/tests/database/*.test.sql
