#!/usr/bin/env bash
# Rotation des archives de base sur le Drive : lit sur l'entrée standard des noms de fichiers
# (sauvegarde-AAAAMMJJ-HHMM.tar.gz.gpg, un par ligne) et affiche ceux à SUPPRIMER. Ne supprime rien.
#   rotation-archives.sh [JOURS=30] [MOIS=12]
# Règle : on garde
#  * quotidiennes : la dernière archive de chacun des JOURS jours les plus récents qui en ont une ;
#  * mensuelles   : la première archive de chacun des MOIS mois les plus récents qui en ont une.
# Tout nom qui n'a pas la forme d'une archive est ignoré (jamais proposé à la suppression). Les jours et
# les mois sont comptés parmi ceux qui ont une archive : une panne de la sauvegarde ne fait donc rien
# vieillir, et rien n'est supprimé tant qu'aucune archive plus récente ne s'ajoute.
set -euo pipefail
jours="${1:-30}"
mois="${2:-12}"
case "$jours$mois" in *[!0-9]* | '') echo "JOURS et MOIS : nombres entiers attendus." >&2; exit 2 ;; esac
[ "$jours" -ge 1 ] && [ "$mois" -ge 1 ] || { echo "JOURS et MOIS : au moins 1." >&2; exit 2; }

travail="$(mktemp -d)"
trap 'rm -rf "$travail"' EXIT
re='^sauvegarde-[0-9]{8}-[0-9]{4}\.tar\.gz\.gpg$'
while IFS= read -r nom; do
  [[ "$nom" =~ $re ]] && printf '%s\n' "$nom"
done | LC_ALL=C sort -u > "$travail/toutes"

# « sauvegarde- » fait 11 caractères : le jour est aux positions 12 à 19, le mois aux positions 12 à 17.
awk '{ j = substr($0, 12, 8); dernier[j] = $0 } END { for (j in dernier) print dernier[j] }' "$travail/toutes" \
  | LC_ALL=C sort | tail -n "$jours" > "$travail/quotidiennes"
awk '{ m = substr($0, 12, 6); if (!(m in premier)) premier[m] = $0 } END { for (m in premier) print premier[m] }' "$travail/toutes" \
  | LC_ALL=C sort | tail -n "$mois" > "$travail/mensuelles"
LC_ALL=C sort -u "$travail/quotidiennes" "$travail/mensuelles" > "$travail/gardees"
LC_ALL=C comm -23 "$travail/toutes" "$travail/gardees"
