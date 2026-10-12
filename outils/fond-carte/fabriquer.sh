#!/usr/bin/env bash
# Fond de carte hors ligne d'une ville (lot CH) : extrait de la planète OpenStreetMap construite chaque jour par
# Protomaps (build.protomaps.com), limité à l'emprise donnée, zooms 0 à 15. Seuls les morceaux utiles sont lus
# (Oujda + 5 km : environ 20 s et 3,3 Mo). Le fichier se dépose ensuite dans le panneau : Paramètres › Réseau ›
# « Fond de carte hors ligne ». Voir outils/fond-carte/README.md.
#
#   outils/fond-carte/fabriquer.sh <ouest,sud,est,nord> <fichier.pmtiles>
#   outils/fond-carte/fabriquer.sh oujda data-private/fonds/oujda.pmtiles
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage : $0 <ouest,sud,est,nord | oujda> <fichier.pmtiles>" >&2
  exit 2
fi

emprise="$1"
sortie="$2"
# Oujda : réseau du marché 4500004453 (-1,9421 34,6440 / -1,8536 34,7249) élargi de 5 km.
[ "$emprise" = "oujda" ] && emprise="-1.9969,34.5990,-1.7988,34.7699"
if ! [[ "$emprise" =~ ^-?[0-9.]+,-?[0-9.]+,-?[0-9.]+,-?[0-9.]+$ ]]; then
  echo "Emprise attendue : ouest,sud,est,nord en degrés (ex. -1.9969,34.5990,-1.7988,34.7699)" >&2
  exit 2
fi

pmtiles="${PMTILES:-$(command -v pmtiles || true)}"
if [ -z "$pmtiles" ]; then
  echo "Outil « pmtiles » introuvable. L'installer (une fois) :" >&2
  echo "  gh release download --repo protomaps/go-pmtiles -p '*Darwin_arm64.zip' -D /tmp/pmtiles && unzip -o /tmp/pmtiles/*.zip -d ~/bin" >&2
  echo "puis relancer, ou indiquer son chemin : PMTILES=/chemin/pmtiles $0 …" >&2
  exit 1
fi

# Dernière construction publiée (une par jour ; les anciennes sont effacées au bout de quelques jours).
build=$(curl -fsS https://build-metadata.protomaps.dev/builds.json | python3 -I -c 'import json,sys; print(json.load(sys.stdin)[-1]["key"])')
echo "Construction Protomaps : $build ; emprise : $emprise"

mkdir -p "$(dirname "$sortie")"
"$pmtiles" extract "https://build.protomaps.com/$build" "$sortie" --bbox="$emprise" --maxzoom=15
"$pmtiles" show "$sortie" | grep -E "bounds|max zoom|addressed tiles|osmosisreplicationtime" || true
echo "Fichier prêt : $sortie ($(du -h "$sortie" | cut -f1)) ; à déposer dans Paramètres › Réseau › Fond de carte hors ligne."
