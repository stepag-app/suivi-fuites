#!/usr/bin/env bash
# Helper de forge de requêtes : exécute du SQL sous une identité donnée, exactement comme
# PostgREST (set role authenticated + request.jwt.claims.sub). anon = pas de JWT.
# Usage : af_as <uuid|anon|service_role> "<sql>"
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" LC_ALL=C LANG=C
: "${PGDATABASE:=audit_fuites}" "${PGHOST:=127.0.0.1}" "${PGPORT:=5440}" "${PGUSER:=postgres}"
export PGHOST PGPORT PGUSER PGDATABASE

# UUIDs du jeu d'identités (voir _seed.sql)
AF_ADMIN='a0000000-0000-4000-8000-000000000001'
AF_RESP_A='a0000000-0000-4000-8000-000000000002'
AF_DET_A='a0000000-0000-4000-8000-000000000003'
AF_REP_A='a0000000-0000-4000-8000-000000000004'
AF_REF_A='a0000000-0000-4000-8000-000000000005'
AF_RESP_B='a0000000-0000-4000-8000-000000000006'
AF_DET_B='a0000000-0000-4000-8000-000000000007'
AF_INACTIF_A='a0000000-0000-4000-8000-000000000008'
AF_MARCHE_A="$(psql -X -tAq -c "select id from public.marches where code like 'SRM-%' limit 1" 2>/dev/null)"
AF_MARCHE_B="$(psql -X -tAq -c "select id from public.marches where code='DEMO' limit 1" 2>/dev/null)"

af_as() {
  local who="$1"; shift; local sql="$*"
  if [ "$who" = "anon" ]; then
    psql -X -q -v ON_ERROR_STOP=0 <<SQL 2>&1
begin; set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}', true);
$sql
rollback;
SQL
  elif [ "$who" = "service_role" ]; then
    psql -X -q -v ON_ERROR_STOP=0 <<SQL 2>&1
begin; set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}', true);
$sql
rollback;
SQL
  else
    psql -X -q -v ON_ERROR_STOP=0 <<SQL 2>&1
begin; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','$who','role','authenticated')::text, true);
$sql
rollback;
SQL
  fi
}
