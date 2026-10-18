#!/usr/bin/env bash
# Préparation d'une Redmi Pad 2 par câble (profil essai) : la méthode des tablettes Xiaomi, où le QR code à 6 touchers
# n'existe pas. Recette suivie pour la tablette 2 (REDMI Pad 2 9.7 4G, HyperOS 3.0) le 2026-10-18 ; mode d'emploi et
# gestes d'Issam : outils/tablettes/README.md § Préparer une tablette par câble.
#
# Avant : tablette réinitialisée, assistant terminé SANS aucun compte (ni Google ni Xiaomi), débogage USB activé,
# « Configuration USB par défaut » sur « Transfert de fichiers », câble branché et accepté.
#
# Usage : outils/tablettes/preparer-cable.sh [série adb] [chemin de l'APK]
#   sans APK : la dernière version publiée est téléchargée (même adresse que le QR code).
set -euo pipefail

ICI="$(cd "$(dirname "$0")" && pwd)"
ADB="${ADB:-adb}"
command -v "$ADB" >/dev/null || ADB="$HOME/Library/Android/sdk/platform-tools/adb"
SERIE="${1:-}"
APK="${2:-}"
CIBLE=()
[ -n "$SERIE" ] && CIBLE=(-s "$SERIE")
PAQUET=ma.stepag.suivifuites
ADMIN="$PAQUET/ma.stepag.tablette.RecepteurAdmin"
URL_APK=https://osajiinsibwrsltntmsk.supabase.co/functions/v1/apk-enrolement

a() { "$ADB" ${CIBLE[@]+"${CIBLE[@]}"} "$@"; }
sh_() { a shell "$@" | tr -d '\r'; }
etape() { printf '\n== %s\n' "$1"; }
secours() { sh_ am broadcast -n "$PAQUET/ma.stepag.tablette.RecepteurSecours" -a ma.stepag.tablette.SECOURS --es action "$1" | tail -1; }
attendre_demarrage() {
  # adb perd la tablette pendant le redémarrage : « wait-for-device » échoue, on la guette.
  until [ "$(sh_ getprop sys.boot_completed 2>/dev/null)" = 1 ]; do sleep 3; done
}

etape "Tablette"
if [ "$(sh_ echo ok 2>/dev/null)" != ok ]; then
  echo "ARRÊT : la tablette ne répond pas à adb (« error: closed ») : débogage USB à désactiver puis réactiver, ou câble à rebrancher."
  exit 1
fi
echo "$(sh_ getprop ro.product.marketname) ($(sh_ getprop ro.product.model)), $(sh_ getprop ro.build.version.incremental), Android $(sh_ getprop ro.build.version.release)"
comptes=$(sh_ dumpsys account | sed -n 's/^ *Accounts: //p' | head -1)
if [ "$comptes" != 0 ]; then
  echo "ARRÊT : $comptes compte(s) sur la tablette. Android refuse le propriétaire tant qu'un compte existe :"
  sh_ dumpsys account | grep 'Account {' || true
  exit 1
fi
if sh_ dpm list-owners | grep -q DeviceOwner; then
  echo "Déjà un propriétaire :"; sh_ dpm list-owners; exit 1
fi
echo "Aucun compte, aucun propriétaire."

etape "Suivi fuites"
if ! sh_ pm list packages "$PAQUET" | grep -qx "package:$PAQUET"; then
  if [ -z "$APK" ]; then
    APK="$(mktemp -d)/suivi-fuites.apk"
    curl -fsSL -o "$APK" "$URL_APK"
    echo "Dernière APK publiée téléchargée ($(du -h "$APK" | cut -f1))."
  fi
  if ! a install "$APK" >/dev/null 2>&1; then
    # HyperOS refuse l'installation par câble sans « Installer via USB » (qui exige un compte Xiaomi).
    a push "$APK" /sdcard/Download/suivi-fuites.apk >/dev/null
    echo "Installation par câble refusée par HyperOS. Sur la tablette : Gestionnaire de fichiers › Téléchargements ›"
    echo "suivi-fuites.apk › Installer (autoriser la source si demandé), puis Terminé SANS ouvrir l'appli."
    until sh_ pm list packages "$PAQUET" | grep -qx "package:$PAQUET"; do sleep 2; done
    sh_ rm -f /sdcard/Download/suivi-fuites.apk
  fi
fi
sh_ dumpsys package "$PAQUET" | awk '/versionName|versionCode/ && n < 2 { sub(/^ */, "  "); print; n++ }'

etape "Ménage"
"$ICI/menage.sh" ${SERIE:+"$SERIE"}

etape "Propriétaire de la tablette"
sh_ dpm set-device-owner "$ADMIN"
sleep 2
secours appliquer | cut -c1-400

etape "Réglages (relevés sur la tablette 1, 2026-10-18)"
for kv in screen_brightness_mode=1 screen_off_timeout=120000 accelerometer_rotation=0 user_rotation=0 \
  sound_effects_enabled=0 haptic_feedback_enabled=1 lockscreen_sounds_enabled=1 time_12_24=24 font_scale=1.0; do
  sh_ settings put system "${kv%%=*}" "${kv#*=}"
done
for kv in auto_time=1 data_roaming=0 mobile_data=1 stay_on_while_plugged_in=0; do
  sh_ settings put global "${kv%%=*}" "${kv#*=}"
done
sh_ cmd uimode night no >/dev/null
sh_ dumpsys deviceidle whitelist "+$PAQUET" >/dev/null
sh_ cmd appops set "$PAQUET" RUN_ANY_IN_BACKGROUND allow
# Autorisations Xiaomi (Autres autorisations) : démarrage automatique, raccourcis, écran verrouillé, fenêtres en
# arrière-plan. Ne plus y toucher dans l'interface ensuite : HyperOS en remet à « refuser ».
for op in 10008 10017 10020 10021; do sh_ appops set "$PAQUET" "$op" allow; done
# Sans écriture forcée, un redémarrage juste après perd les autorisations et l'exemption de batterie (tablette 3).
sh_ appops write-settings
sleep 5
echo "Fuseau : $(sh_ getprop persist.sys.timezone), heure : $(sh_ date)"

etape "Redémarrage (fait apparaître le cadenas dans l'appli)"
a reboot
sleep 5
attendre_demarrage
sleep 10
sh_ dpm list-owners | tail -1
sh_ cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER | grep / | sort -u
sh_ appops get "$PAQUET" | grep -E 'MIUIOP\(100(08|17|20|21)\)|RUN_ANY'
sh_ dumpsys deviceidle whitelist | grep "$PAQUET" || echo "ATTENTION : exemption de batterie perdue, relancer : adb shell dumpsys deviceidle whitelist +$PAQUET"

cat <<'FIN'

Prêt côté adb. Gestes d'Issam sur la tablette (README § Préparer une tablette par câble, étapes 6 à 11) :
  Suivi fuites › connecter l'agent › cadenas › code « 1 heure » du panneau ; compte Google des tablettes ;
  Applis › Suivi fuites › Économiseur de batterie › Aucune restriction ; Écran de verrouillage › Données faciales et
  verrouillage d'écran › Code PIN ; Reverrouiller maintenant ; redémarrer, taper le PIN, essayer de sortir de l'appli.
FIN
