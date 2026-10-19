#!/usr/bin/env bash
# Famille §3.1 — Cloisonnement multi-marchés. Prouve que la lecture/écriture croisée A↔B
# est refusée (contrôles en place) et documente les résidus (journaux Dolibarr globaux).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/_forge.sh"
ECHECS=0
vide() { # $1=libellé $2=identité $3=sql — doit renvoyer 0 ligne
  local out; out="$(af_as "$2" "$3" | grep -cE '^ [0-9a-f]{8}-' || true)"
  if [ "$out" = "0" ]; then echo "  [OK  VIDE] $1"; else echo "  [ÉCHEC] $1 — $out ligne(s) visible(s)"; ECHECS=$((ECHECS+1)); fi
}
nonvide() { local out; out="$(af_as "$2" "$3" | grep -cE '^ [0-9a-f]{8}-' || true)"
  if [ "$out" != "0" ]; then echo "  [OK  VISIBLE] $1"; else echo "  [ÉCHEC] $1 — rien visible (régression)"; ECHECS=$((ECHECS+1)); fi
}
FUITE_B='f1000000-0000-4000-8000-0000000000b1'
FUITE_A='f1000000-0000-4000-8000-0000000000a1'

echo "### Lecture croisée : detection_A ne voit pas les fuites du marché B"
vide "detection_A lit une fuite du marché B" "$AF_DET_A" \
  "select id from public.fuites where id='$FUITE_B';"
nonvide "detection_A voit bien ses propres fuites (marché A)" "$AF_DET_A" \
  "select id from public.fuites where id='$FUITE_A';"

echo "### Écriture croisée : rattacher une fuite de A au marché B (PATCH marche_id)"
af_as "$AF_DET_A" "update public.fuites set marche_id='$AF_MARCHE_B' where id='$FUITE_A';" \
  | grep -qiE 'ERROR|violates|non autoris|insufficient|check_violation' \
  && echo "  [OK  REFUS] rattachement A→B refusé (avant_modification_saisie / figer_marche)" \
  || { echo "  [ÉCHEC] le rattachement A→B n'a pas été refusé"; ECHECS=$((ECHECS+1)); }

echo "### INSERT direct avec marche_id=B par un agent de A"
af_as "$AF_DET_A" "insert into public.fuites (marche_id) values ('$AF_MARCHE_B');" \
  | grep -qiE 'ERROR|row-level|violates|insufficient' && echo "  [OK  REFUS] INSERT sur le marché B refusé par la RLS" || { echo "  [ÉCHEC] INSERT marché B accepté"; ECHECS=$((ECHECS+1)); }

echo "### Résidu documenté (non corrigé par choix) : journaux Dolibarr globaux"
echo "    imports_dolibarr est lisible par tout compte ayant un droit sur AU MOINS un marché"
echo "    (métadonnées ERP inter-marchés). Décision métier — voir RAPPORT_SECURITE.md §Résidus."

echo
[ "$ECHECS" -eq 0 ] && echo "✅ CLOISONNEMENT : contrôles en place" || echo "❌ $ECHECS ÉCHEC(S)"
exit $([ "$ECHECS" -eq 0 ] && echo 0 || echo 1)
