#!/usr/bin/env bash
# Installe rclone dans /usr/local/bin (runner Linux amd64 de GitHub Actions), version et empreinte épinglées :
# le zip est vérifié par SHA-256 avant d'être ouvert. Pour changer de version : nouvelle valeur de VERSION
# et de SHA256 (https://downloads.rclone.org/<version>/SHA256SUMS, ligne rclone-<version>-linux-amd64.zip).
set -euo pipefail
VERSION=v1.75.2
SHA256=349ac8fba6ff65d6247043f1750cdcb518ec5d500ef91463a10d37c0ccdf3702

if command -v rclone > /dev/null && [ "$(rclone version | head -n1)" = "rclone $VERSION" ]; then
  echo "rclone $VERSION déjà installé."
  exit 0
fi
travail="$(mktemp -d)"
trap 'rm -rf "$travail"' EXIT
curl -fsSL --retry 3 -o "$travail/rclone.zip" "https://downloads.rclone.org/$VERSION/rclone-$VERSION-linux-amd64.zip"
echo "$SHA256  $travail/rclone.zip" | sha256sum -c -
unzip -q -j "$travail/rclone.zip" "rclone-$VERSION-linux-amd64/rclone" -d "$travail"
sudo install -m 0755 "$travail/rclone" /usr/local/bin/rclone
rclone version | head -n1
