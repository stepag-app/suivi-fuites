#!/usr/bin/env bash
# Banc d'essai de sécurité jetable : PostgreSQL 17 + PostGIS + pgTAP, migrations appliquées
# via le simulateur Supabase du dépôt. Local uniquement. Ne touche JAMAIS la production.
#
# Démarre une instance PG17 isolée (port 5440 par défaut), applique ci/simulateur-supabase.sql
# puis les 65 migrations, et seede un jeu d'identités de test (security-tests/_seed.sql).
#
# Variables : AF_PORT (5440), AF_BASE (audit_fuites). Sortie : exporte PGHOST/PGPORT/PGUSER/PGDATABASE.
set -euo pipefail
export LC_ALL=C LANG=C                       # PG17/macOS : évite « postmaster became multithreaded »
PG="${AF_PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
[ -d "$PG" ] || PG="$(pg_config --bindir 2>/dev/null || echo /usr/lib/postgresql/17/bin)"
export PATH="$PG:$PATH"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../supabase" && pwd)"
WORK="${AF_WORK:-$(mktemp -d /tmp/af-bench.XXXX)}"
PGDATA="$WORK/pgdata"; SOCK="/tmp/af-sock-$$"; mkdir -p "$SOCK"
PORT="${AF_PORT:-5440}"; BASE="${AF_BASE:-audit_fuites}"
export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres PGDATABASE="$BASE"

af_bench_up() {
  if ! pg_isready -q 2>/dev/null; then
    rm -rf "$PGDATA"; initdb -D "$PGDATA" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null 2>&1
    { echo "unix_socket_directories='$SOCK'"; echo "port=$PORT"; echo "listen_addresses='127.0.0.1'"; } >> "$PGDATA/postgresql.conf"
    pg_ctl -D "$PGDATA" -l "$WORK/pg.log" -w start >/dev/null
    echo "[bench] PG17 démarré (port $PORT, data $PGDATA)"
  fi
  local P=(psql -X -q -v ON_ERROR_STOP=1)
  "${P[@]}" -d postgres -c "drop database if exists ${BASE}" -c "create database ${BASE}" >/dev/null
  "${P[@]}" -d "$BASE" -f "$RACINE/ci/simulateur-supabase.sql" >/dev/null
  for f in "$RACINE"/migrations/*.sql; do "${P[@]}" -d "$BASE" -f "$f" >/dev/null; done
  "${P[@]}" -d "$BASE" -c "create extension if not exists pgtap with schema extensions" >/dev/null 2>&1 || true
  "${P[@]}" -d "$BASE" -f "$(dirname "${BASH_SOURCE[0]}")/_seed.sql" >/dev/null
  echo "[bench] migrations + seed appliqués sur $BASE"
}
af_bench_down() { pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$SOCK"; }
