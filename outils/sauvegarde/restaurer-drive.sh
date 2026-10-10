#!/usr/bin/env bash
# Reprise depuis le Google Drive (copie faite par copie-drive.sh). Nécessite rclone et la section [drive]
# de la configuration rclone (RCLONE_CONFIG), ou un dossier local dans DRIVE_RACINE.
#   restaurer-drive.sh archive DOSSIER [NOM]   télécharge l'archive NOM (la plus récente par défaut) dans DOSSIER
#                                              et affiche son chemin
#   restaurer-drive.sh verifier ATTENDU.tsv    compare les fichiers que la base restaurée référence avec le Drive :
#                                              chaque ligne « zone<TAB>chemin<TAB>taille » (zone r2 ou stockage ;
#                                              taille -1 si inconnue) doit exister sur le Drive, puis un échantillon
#                                              de fichiers est relu en entier
#   restaurer-drive.sh fichiers DOSSIER        copie r2/ et stockage-supabase/ du Drive dans DOSSIER (reprise
#                                              après sinistre : voir supabase/README.md)
# Aucun nom de fichier ni donnée n'est affiché : seulement des nombres.
set -euo pipefail
ici="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=commun.sh
source "$ici/commun.sh"

archive() {
  local dossier="$1" nom="${2:-}" liste
  if [ -z "$nom" ]; then
    liste="$(rclone lsf "$DRIVE_RACINE/base" --files-only | grep -E '^sauvegarde-[0-9]{8}-[0-9]{4}\.tar\.gz\.gpg$' || true)"
    nom="$(LC_ALL=C sort <<< "$liste" | tail -n 1)"
    [ -n "$nom" ] || { echo "::error::Aucune archive sauvegarde-*.tar.gz.gpg dans base/ sur le Drive."; return 1; }
  fi
  [[ "$nom" =~ ^sauvegarde-[0-9]{8}-[0-9]{4}\.tar\.gz\.gpg$ ]] || { echo "Nom d'archive invalide." >&2; return 2; }
  mkdir -p "$dossier"
  if ! rclone copyto "$DRIVE_RACINE/base/$nom" "$dossier/$nom" --log-level NOTICE; then
    echo "::error::Archive $nom introuvable ou illisible sur le Drive."
    return 1
  fi
  echo "$dossier/$nom"
}

verifier() {
  local attendu="$1" travail
  [ -s "$attendu" ] || { echo "::error::Liste attendue vide : la base restaurée ne référence aucun fichier à contrôler."; return 1; }
  travail="$(mktemp -d)"
  trap 'rm -rf "$travail"' RETURN
  local zone
  for zone in r2 stockage-supabase; do
    # Dossier absent du Drive : liste vide, les fichiers attendus seront comptés manquants.
    rclone lsf -R --files-only --format 'ps' --separator $'\t' "$DRIVE_RACINE/$zone" > "$travail/$zone.tsv" 2> /dev/null || : > "$travail/$zone.tsv"
  done
  awk -F '\t' -v dossier="$travail" '
    BEGIN {
      while ((getline l < (dossier "/r2.tsv")) > 0) { split(l, a, "\t"); r2[a[1]] = a[2] }
      while ((getline l < (dossier "/stockage-supabase.tsv")) > 0) { split(l, a, "\t"); st[a[1]] = a[2] }
    }
    {
      zone = $1; chemin = $2; taille = $3 + 0
      if (zone == "r2") { total_r2++; if (!(chemin in r2)) manque_r2++ }
      else if (zone == "stockage") {
        total_st++
        if (!(chemin in st)) manque_st++
        else if (taille >= 0 && st[chemin] + 0 != taille) taille_st++
      }
    }
    END {
      printf "photos R2 référencées : %d, absentes du Drive : %d\n", total_r2, manque_r2
      printf "fichiers Supabase Storage référencés : %d, absents du Drive : %d, de taille différente : %d\n", total_st, manque_st, taille_st
      exit (manque_r2 + manque_st + taille_st > 0) ? 1 : 0
    }' "$attendu" | tee "$travail/bilan.txt" || { echo "::error::Des fichiers référencés par la base restaurée manquent sur le Drive."; return 1; }

  # Échantillon relu en entier depuis le Drive : jusqu'à 12 fichiers de moins de 5 Mo répartis sur la
  # liste (les APK sont trop lourdes), taille et signature JPEG contrôlées.
  local n=0 lus=0 pas
  : > "$travail/echantillon.tsv"
  for zone in r2 stockage-supabase; do
    awk -F '\t' -v z="$zone" '$2 + 0 < 5000000 { print z "\t" $0 }' "$travail/$zone.tsv" >> "$travail/echantillon.tsv"
  done
  n="$(grep -c . "$travail/echantillon.tsv" || true)"
  if [ "$n" -eq 0 ]; then echo "::error::Aucun fichier sur le Drive à relire."; return 1; fi
  pas=$(( n / 12 > 0 ? n / 12 : 1 ))
  while IFS=$'\t' read -r z chemin taille; do
    local lu entete
    lu="$(rclone cat "$DRIVE_RACINE/$z/$chemin" | wc -c | tr -d ' ')"
    if [ "$lu" != "$taille" ]; then
      echo "::error::Un fichier du Drive est illisible ou tronqué (lu : $lu octets, attendu : $taille)."
      return 1
    fi
    case "$chemin" in
      *.jpg | *.jpeg)
        entete="$(rclone cat --count 2 "$DRIVE_RACINE/$z/$chemin" | od -An -tx1 | tr -d ' \n')"
        [ "$entete" = "ffd8" ] || { echo "::error::Un fichier .jpg du Drive n'a pas la signature JPEG."; return 1; } ;;
    esac
    lus=$((lus + 1))
  done < <(awk -v pas="$pas" 'NR % pas == 1 || pas == 1' "$travail/echantillon.tsv" | head -n 12)
  echo "Échantillon relu depuis le Drive : $lus fichier(s), taille et signature conformes."
}

fichiers() {
  local dossier="$1"
  mkdir -p "$dossier"
  rclone copy "$DRIVE_RACINE/r2" "$dossier/r2" "${RCLONE_OPTIONS[@]}"
  if rclone lsf "$DRIVE_RACINE/stockage-supabase" --max-depth 1 > /dev/null 2>&1; then
    rclone copy "$DRIVE_RACINE/stockage-supabase" "$dossier/stockage-supabase" "${RCLONE_OPTIONS[@]}"
  fi
  echo "Fichiers copiés dans $dossier (r2/ et stockage-supabase/)."
}

case "${1:-}" in
  archive)  [ $# -ge 2 ] || { sed -n '2,15p' "$0" >&2; exit 2; }; archive "$2" "${3:-}" ;;
  verifier) [ $# -eq 2 ] || { sed -n '2,15p' "$0" >&2; exit 2; }; verifier "$2" ;;
  fichiers) [ $# -eq 2 ] || { sed -n '2,15p' "$0" >&2; exit 2; }; fichiers "$2" ;;
  *)        sed -n '2,15p' "$0" >&2; exit 2 ;;
esac
