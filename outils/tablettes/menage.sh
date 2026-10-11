#!/usr/bin/env bash
# Ménage d'une tablette par câble (adb) : retire les applis de applis-retirees.txt (pm uninstall -k --user 0 : elles
# restent dans le système, réinstallables par remise.sh) et désactive celles de applis-desactivees.txt (Xiaomi refuse
# leur retrait). Ne touche jamais aux applis gardées. Pour la Redmi d'essai et toute tablette branchée en débogage USB ;
# une tablette d'agent préparée par QR code n'en a pas besoin (adb y est coupé, et la politique de Suivi fuites cache
# déjà ces applis : docs/lots/lot-tablette-proprietaire.md § 10).
#
# Usage : outils/tablettes/menage.sh [série adb]     (série : « adb devices » ; facultative s'il n'y a qu'un appareil)
set -euo pipefail

ICI="$(cd "$(dirname "$0")" && pwd)"
ADB="${ADB:-adb}"
command -v "$ADB" >/dev/null || ADB="$HOME/Library/Android/sdk/platform-tools/adb"
CIBLE=()
[ $# -ge 1 ] && CIBLE=(-s "$1")

GARDEES=" ma.stepag.suivifuites ma.stepag.suivifuites.dev com.android.camera com.google.android.apps.maps com.google.android.dialer com.google.android.contacts com.google.android.apps.messaging com.whatsapp "

paquets() { grep -v '^[[:space:]]*#' "$1" | grep -v '^[[:space:]]*$' | tr -d '[:space:]\r' | sed '/^$/d'; }

echo "Tablette : $("$ADB" "${CIBLE[@]}" shell getprop ro.product.model | tr -d '\r') ($("$ADB" "${CIBLE[@]}" shell getprop ro.build.version.release | tr -d '\r'))"
presents=" $("$ADB" "${CIBLE[@]}" shell pm list packages --user 0 | tr -d '\r' | sed 's/^package://' | tr '\n' ' ') "

retirees=0; desactivees=0; absentes=0; refus=()
for p in $(paquets "$ICI/applis-retirees.txt"); do
  case "$GARDEES" in *" $p "*) echo "gardée, ignorée : $p"; continue ;; esac
  case "$presents" in *" $p "*) ;; *) absentes=$((absentes + 1)); continue ;; esac
  if r=$("$ADB" "${CIBLE[@]}" shell pm uninstall -k --user 0 "$p" 2>&1 | tr -d '\r') && [ "$r" = "Success" ]; then
    retirees=$((retirees + 1))
  else
    refus+=("$p ($r)")
  fi
done
for p in $(paquets "$ICI/applis-desactivees.txt"); do
  case "$GARDEES" in *" $p "*) echo "gardée, ignorée : $p"; continue ;; esac
  case "$presents" in *" $p "*) ;; *) absentes=$((absentes + 1)); continue ;; esac
  if r=$("$ADB" "${CIBLE[@]}" shell pm disable-user --user 0 "$p" 2>&1 | tr -d '\r') && printf '%s' "$r" | grep -q 'disabled-user'; then
    desactivees=$((desactivees + 1))
  else
    refus+=("$p ($r)")
  fi
done

echo "Retirées : $retirees ; désactivées : $desactivees ; déjà absentes : $absentes ; refusées : ${#refus[@]}"
for r in "${refus[@]+"${refus[@]}"}"; do echo "  refusée : $r"; done
echo "Remise : outils/tablettes/remise.sh ${1:-} (tout) ou remise.sh <série> <paquet…>"
