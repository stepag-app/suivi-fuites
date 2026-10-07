#!/usr/bin/env bash
# Essai de charge : base LOCALE `BASE` (défaut charge_3000) = migrations du dépôt + réseau copié depuis une base
# locale qui l'a déjà importé (`SOURCE`, défaut essai_interface, marché SRM) vers le marché DEMO, puis fuites
# fictives (generer-charge.sql, NB fuites). Jamais la production : PGHOST doit être local.
#
#   PGHOST=localhost PGPORT=5432 PGUSER=$(whoami) NB=3000 bash outils/charge/preparer-base.sh
set -euo pipefail
BASE="${BASE:-charge_3000}"
SOURCE="${SOURCE:-essai_interface}"
NB="${NB:-3000}"
case "${PGHOST:-localhost}" in localhost|127.0.0.1|::1|/*) ;; *) echo "PGHOST doit être local" >&2; exit 1 ;; esac
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "drop database if exists ${BASE}" -c "create database ${BASE}"
"${PSQL[@]}" -d "$BASE" -f "$RACINE/supabase/ci/simulateur-supabase.sql" >/dev/null
for f in "$RACINE"/supabase/migrations/*.sql; do "${PSQL[@]}" -d "$BASE" -f "$f" >/dev/null; done

# Réseau (tronçons, nœuds, contours des secteurs) rattaché aux secteurs de DEMO par leur code
"${PSQL[@]}" -d "$SOURCE" -c "\copy (select t.reference, t.calque, t.categorie, t.diametre_mm, t.materiau, s.code, t.geom from troncons t left join secteurs s on s.id = t.secteur_id) to '$TMP/tr.tsv'"
"${PSQL[@]}" -d "$SOURCE" -c "\copy (select n.reference, n.calque, n.type, s.code, n.geom from noeuds n left join secteurs s on s.id = n.secteur_id) to '$TMP/no.tsv'"
"${PSQL[@]}" -d "$SOURCE" -c "\copy (select s.code, s.geom from secteurs s where s.geom is not null) to '$TMP/se.tsv'"
"${PSQL[@]}" -d "$BASE" <<SQL
create temp table tr (reference text, calque text, categorie text, diametre_mm int, materiau text, code text, geom extensions.geometry);
create temp table no (reference text, calque text, type text, code text, geom extensions.geometry);
create temp table se (code text, geom extensions.geometry);
\copy tr from '$TMP/tr.tsv'
\copy no from '$TMP/no.tsv'
\copy se from '$TMP/se.tsv'
update public.secteurs s set geom = se.geom from se where s.code = se.code and s.marche_id = 'de000000-0000-4000-8000-000000000000';
insert into public.troncons (marche_id, reference, calque, categorie, diametre_mm, materiau, secteur_id, geom)
select 'de000000-0000-4000-8000-000000000000', tr.reference, tr.calque, tr.categorie, tr.diametre_mm, tr.materiau, s.id, tr.geom
  from tr left join public.secteurs s on s.code = tr.code and s.marche_id = 'de000000-0000-4000-8000-000000000000';
insert into public.noeuds (marche_id, reference, calque, type, secteur_id, geom)
select 'de000000-0000-4000-8000-000000000000', no.reference, no.calque, no.type, s.id, no.geom
  from no left join public.secteurs s on s.code = no.code and s.marche_id = 'de000000-0000-4000-8000-000000000000';
SQL

"${PSQL[@]}" -d "$BASE" -v nb="$NB" -f "$RACINE/outils/charge/generer-charge.sql"
psql -X -d "$BASE" -Atc "select 'taille de la base : ' || pg_size_pretty(pg_database_size(current_database()))"
