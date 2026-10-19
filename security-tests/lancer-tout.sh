#!/usr/bin/env bash
# Orchestrateur : monte un banc PG17 jetable (si besoin), applique migrations + seed,
# puis joue toutes les familles d'attaque. ATTENDU vs OBTENU. Local uniquement.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/_bench.sh"
af_bench_up
export PGHOST PGPORT PGUSER PGDATABASE
echo
TOTAL=0; KO=0
for s in "$HERE"/0*.sh "$HERE"/0*.mjs; do
  [ "$s" = "$HERE/_bench.sh" ] && continue
  [ -e "$s" ] || continue
  echo "══════════════════════════════════════════════════════════════════"
  echo "▶ $(basename "$s")"
  echo "══════════════════════════════════════════════════════════════════"
  if [[ "$s" == *.mjs ]]; then node "$s"; else bash "$s"; fi
  rc=$?; TOTAL=$((TOTAL+1)); [ $rc -ne 0 ] && KO=$((KO+1))
  echo
done
echo "══════════════════════════════════════════════════════════════════"
[ $KO -eq 0 ] && echo "✅ $TOTAL familles : tout passe" || echo "❌ $KO/$TOTAL famille(s) en échec"
af_bench_down
exit $([ $KO -eq 0 ] && echo 0 || echo 1)
