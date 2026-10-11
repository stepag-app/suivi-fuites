#!/usr/bin/env bash
# Remise des applis retirées ou désactivées par menage.sh : toutes, ou seulement les paquets donnés.
#   cmd package install-existing --user 0 <paquet>   (appli retirée pour l'utilisateur, restée dans le système)
#   pm enable --user 0 <paquet>                      (appli désactivée)
# Une tablette dont Suivi fuites est propriétaire refuse install-existing tant que l'interdiction d'installer est en
# place : la déverrouiller d'abord (code du panneau web).
#
# Usage : outils/tablettes/remise.sh [série adb] [paquet…]
set -euo pipefail

ICI="$(cd "$(dirname "$0")" && pwd)"
ADB="${ADB:-adb}"
command -v "$ADB" >/dev/null || ADB="$HOME/Library/Android/sdk/platform-tools/adb"
CIBLE=()
if [ $# -ge 1 ] && ! printf '%s' "$1" | grep -q '\.'; then
  CIBLE=(-s "$1")
  shift
fi

paquets() { grep -v '^[[:space:]]*#' "$1" | grep -v '^[[:space:]]*$' | tr -d '[:space:]\r' | sed '/^$/d'; }

if [ $# -gt 0 ]; then
  liste=("$@")
else
  # shellcheck disable=SC2207
  liste=($(paquets "$ICI/applis-retirees.txt") $(paquets "$ICI/applis-desactivees.txt"))
fi

remises=0; refus=()
for p in "${liste[@]}"; do
  r1=$("$ADB" "${CIBLE[@]}" shell cmd package install-existing --user 0 "$p" 2>&1 | tr -d '\r' || true)
  r2=$("$ADB" "${CIBLE[@]}" shell pm enable --user 0 "$p" 2>&1 | tr -d '\r' || true)
  if printf '%s\n%s' "$r1" "$r2" | grep -Eq 'installed for user|new state: enabled'; then
    remises=$((remises + 1))
  else
    refus+=("$p : $r1 / $r2")
  fi
done
echo "Remises : $remises ; refusées : ${#refus[@]}"
for r in "${refus[@]+"${refus[@]}"}"; do echo "  $r"; done
