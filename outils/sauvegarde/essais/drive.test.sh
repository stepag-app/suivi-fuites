#!/usr/bin/env bash
# Essais sans réseau des scripts de copie vers le Drive : rclone avec des dossiers locaux à la place du Drive
# et de R2 (DRIVE_RACINE, R2_RACINE). Vérifie la rotation, la copie incrémentale, l'absence de suppression côté
# Drive, les contrôles et les échecs. Exécuté par la CI (test-restauration.yml) et à la main :
#   bash outils/sauvegarde/essais/drive.test.sh
set -uo pipefail
ici="$(cd "$(dirname "$0")/.." && pwd)"
command -v rclone > /dev/null || { echo "rclone absent : installer rclone (outils/sauvegarde/installer-rclone.sh)." >&2; exit 2; }

travail="$(mktemp -d)"
trap 'rm -rf "$travail"' EXIT
export RCLONE_CONFIG="$travail/rclone.conf"
: > "$RCLONE_CONFIG"
export DRIVE_RACINE="$travail/drive" R2_RACINE="$travail/r2"
export R2_BUCKET=essai

echecs=0
verifie() { # DESCRIPTION CODE_ATTENDU CODE_OBTENU
  if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  ECHEC $1 (attendu $2, obtenu $3)"; echecs=$((echecs + 1)); fi
}
egal() { # DESCRIPTION ATTENDU OBTENU
  if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  ECHEC $1 : attendu « $2 », obtenu « $3 »"; echecs=$((echecs + 1)); fi
}
jours() { # DEBUT NOMBRE : noms d'archives quotidiennes consécutives (02:17)
  python3 - "$1" "$2" <<'PY'
import datetime, sys
d = datetime.date.fromisoformat(sys.argv[1])
for i in range(int(sys.argv[2])):
    print(f"sauvegarde-{d + datetime.timedelta(days=i):%Y%m%d}-0217.tar.gz.gpg")
PY
}

echo "Rotation"
sorties="$(jours 2026-01-01 300 | bash "$ici/rotation-archives.sh" 30 12)"
egal "300 archives quotidiennes : 261 à supprimer (30 quotidiennes + 9 mensuelles hors fenêtre gardées)" 261 "$(grep -c . <<< "$sorties")"
egal "la plus récente est gardée" 0 "$(grep -c '20261027' <<< "$sorties")"
egal "le 1er de chaque mois est gardé" 0 "$(grep -cE 'sauvegarde-2026(0[1-9]|10)01-' <<< "$sorties")"
egal "moins de 30 archives : rien à supprimer" 0 "$(jours 2026-10-01 20 | bash "$ici/rotation-archives.sh" | grep -c .)"
egal "noms étrangers ignorés" 0 "$( { echo 'photo.jpg'; echo 'sauvegarde-20260101-0217.tar.gz'; echo 'LISEZMOI.txt'; } | bash "$ici/rotation-archives.sh" | grep -c .)"
egal "trois archives le même jour : la première (mensuelle) et la dernière (quotidienne) gardées, celle du milieu supprimée" \
     "sauvegarde-20261010-1000.tar.gz.gpg" \
     "$( { echo sauvegarde-20261010-0217.tar.gz.gpg; echo sauvegarde-20261010-1000.tar.gz.gpg; echo sauvegarde-20261010-1500.tar.gz.gpg; } | bash "$ici/rotation-archives.sh" 30 12 )"

echo "Copie de l'archive de base"
mkdir -p "$travail/archives"
archive="$travail/archives/sauvegarde-20261027-0217.tar.gz.gpg"
head -c 4096 /dev/urandom > "$archive"
mkdir -p "$DRIVE_RACINE/base"
jours 2026-01-01 299 | while read -r n; do : > "$DRIVE_RACINE/base/$n"; done
bash "$ici/copie-drive.sh" base "$archive" > "$travail/sortie.txt" 2>&1
verifie "copie et rotation de 300 archives refusée au-delà de 20 suppressions" 1 "$?"
egal "rien n'a été supprimé quand la limite est dépassée" 299 "$(ls "$DRIVE_RACINE/base" | grep -vc 'sauvegarde-20261027')"
rm -rf "$DRIVE_RACINE/base"
mkdir -p "$DRIVE_RACINE/base"
jours 2026-09-10 47 | while read -r n; do : > "$DRIVE_RACINE/base/$n"; done
bash "$ici/copie-drive.sh" base "$archive" > "$travail/sortie.txt" 2>&1
verifie "copie de l'archive et rotation" 0 "$?"
egal "archive présente et identique" "$(shasum -a 256 "$archive" | cut -d' ' -f1)" "$(shasum -a 256 "$DRIVE_RACINE/base/sauvegarde-20261027-0217.tar.gz.gpg" | cut -d' ' -f1)"
egal "30 quotidiennes + la mensuelle de septembre gardées, 17 supprimées" 31 "$(ls "$DRIVE_RACINE/base" | wc -l | tr -d ' ')"
bash "$ici/copie-drive.sh" base "$travail/archives/inconnu.txt" > /dev/null 2>&1
verifie "nom d'archive inattendu refusé" 1 "$?"

echo "Photos et APK (R2 -> Drive)"
mkdir -p "$R2_RACINE/m1/f1" "$R2_RACINE/apk" "$R2_RACINE/reseau/m1" "$R2_RACINE/sauvegardes/base" "$R2_RACINE/sauvegardes/stockage-supabase/photos/m1"
printf '\xff\xd8\xff\xe0jpeg1' > "$R2_RACINE/m1/f1/p1.jpg"
printf '\xff\xd8\xff\xe0jpeg2' > "$R2_RACINE/m1/f1/p2.jpg"
printf 'apk' > "$R2_RACINE/apk/suivi-fuites-9.apk"
printf 'tuiles' > "$R2_RACINE/reseau/m1/reseau.pmtiles"
printf 'archive' > "$R2_RACINE/sauvegardes/base/sauvegarde-20261027-0217.tar.gz.gpg"
printf '\xff\xd8\xff\xe0ancienne' > "$R2_RACINE/sauvegardes/stockage-supabase/photos/m1/a.jpg"
bash "$ici/copie-drive.sh" r2 > "$travail/sortie.txt" 2>&1
verifie "copie R2 vers Drive" 0 "$?"
egal "photos, APK et tuiles copiés" 4 "$(find "$DRIVE_RACINE/r2" -type f | wc -l | tr -d ' ')"
egal "le préfixe sauvegardes/ n'est pas copié dans r2/" 0 "$(find "$DRIVE_RACINE/r2" -path '*sauvegardes*' | wc -l | tr -d ' ')"
avant="$(stat -c %Y "$DRIVE_RACINE/r2/m1/f1/p1.jpg" 2> /dev/null || stat -f %m "$DRIVE_RACINE/r2/m1/f1/p1.jpg")"
printf '\xff\xd8\xff\xe0jpeg3' > "$R2_RACINE/m1/f1/p3.jpg"
bash "$ici/copie-drive.sh" r2 > "$travail/sortie.txt" 2>&1
verifie "seconde copie (incrémentale)" 0 "$?"
egal "la nouvelle photo est copiée" 5 "$(find "$DRIVE_RACINE/r2" -type f | wc -l | tr -d ' ')"
egal "un fichier déjà copié n'est pas recopié" "$avant" "$(stat -c %Y "$DRIVE_RACINE/r2/m1/f1/p1.jpg" 2> /dev/null || stat -f %m "$DRIVE_RACINE/r2/m1/f1/p1.jpg")"
rm "$R2_RACINE/m1/f1/p2.jpg"
bash "$ici/copie-drive.sh" r2 > "$travail/sortie.txt" 2>&1
verifie "copie après suppression côté R2" 0 "$?"
egal "rien n'est supprimé du Drive" 1 "$([ -f "$DRIVE_RACINE/r2/m1/f1/p2.jpg" ] && echo 1 || echo 0)"
mv "$R2_RACINE" "$travail/r2-absent"
bash "$ici/copie-drive.sh" r2 > "$travail/sortie.txt" 2>&1
verifie "source R2 introuvable : échec visible" 1 "$([ "$?" -ne 0 ] && echo 1 || echo 0)"
mv "$travail/r2-absent" "$R2_RACINE"

echo "Fichiers de Supabase Storage"
bash "$ici/copie-drive.sh" stockage > "$travail/sortie.txt" 2>&1
verifie "copie de stockage-supabase" 0 "$?"
egal "fichier présent" 1 "$([ -f "$DRIVE_RACINE/stockage-supabase/photos/m1/a.jpg" ] && echo 1 || echo 0)"

echo "Contrôle depuis la base restaurée"
tab=$'\t'
{
  printf 'r2%sm1/f1/p1.jpg%s-1\n' "$tab" "$tab"
  printf 'r2%sm1/f1/p3.jpg%s-1\n' "$tab" "$tab"
  printf 'r2%sm1/f1/p2.jpg%s-1\n' "$tab" "$tab"
  printf 'stockage%sphotos/m1/a.jpg%s%s\n' "$tab" "$tab" "$(wc -c < "$R2_RACINE/sauvegardes/stockage-supabase/photos/m1/a.jpg" | tr -d ' ')"
} > "$travail/attendu.tsv"
bash "$ici/restaurer-drive.sh" verifier "$travail/attendu.tsv" > "$travail/sortie.txt" 2>&1
verifie "tout est sur le Drive et relu" 0 "$?"
printf 'r2%sm1/f1/absente.jpg%s-1\n' "$tab" "$tab" >> "$travail/attendu.tsv"
bash "$ici/restaurer-drive.sh" verifier "$travail/attendu.tsv" > "$travail/sortie.txt" 2>&1
verifie "photo référencée absente du Drive : échec" 1 "$?"
sed -i.bak '$d' "$travail/attendu.tsv"
printf 'stockage%sphotos/m1/a.jpg%s3\n' "$tab" "$tab" >> "$travail/attendu.tsv"
bash "$ici/restaurer-drive.sh" verifier "$travail/attendu.tsv" > "$travail/sortie.txt" 2>&1
verifie "taille différente : échec" 1 "$?"
: > "$travail/vide.tsv"
bash "$ici/restaurer-drive.sh" verifier "$travail/vide.tsv" > /dev/null 2>&1
verifie "liste attendue vide : échec" 1 "$?"
printf 'x' > "$DRIVE_RACINE/r2/m1/f1/p3.jpg"
{ printf 'r2%sm1/f1/p3.jpg%s-1\n' "$tab" "$tab"; } > "$travail/attendu.tsv"
bash "$ici/restaurer-drive.sh" verifier "$travail/attendu.tsv" > "$travail/sortie.txt" 2>&1
verifie "fichier .jpg corrompu sur le Drive : échec" 1 "$?"

echo "Archive la plus récente"
dossier="$travail/telechargee"
chemin="$(bash "$ici/restaurer-drive.sh" archive "$dossier" 2> /dev/null)"
egal "la plus récente est téléchargée" "$dossier/sauvegarde-20261027-0217.tar.gz.gpg" "$chemin"

echo
if [ "$echecs" -eq 0 ]; then echo "Tous les essais passent."; else echo "$echecs essai(s) en échec."; fi
exit "$echecs"
