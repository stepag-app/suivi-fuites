#!/usr/bin/env bash
# Copie hors plateformes (hors Supabase, Vercel, Cloudflare R2 et GitHub) vers le Google Drive du compte
# stepag.app@gmail.com, par rclone. Côté Drive RIEN n'est jamais supprimé, sauf la rotation des archives de
# base (30 quotidiennes, 12 mensuelles : rotation-archives.sh).
#   copie-drive.sh preparer         écrit la configuration rclone (SAUVEGARDE_DRIVE_CONFIG) et teste la connexion
#   copie-drive.sh base ARCHIVE     archive chiffrée -> base/, relue et comparée par SHA-256, puis rotation
#   copie-drive.sh r2               compartiment R2 (photos, APK, tuiles ; hors sauvegardes/) -> r2/
#   copie-drive.sh stockage         copie R2 des fichiers de Supabase Storage -> stockage-supabase/
#   copie-drive.sh lisezmoi         dépose LISEZMOI.txt à la racine du dossier
#   copie-drive.sh espace           espace utilisé et libre du Drive (alerte si moins de 3 Go)
# Variables : SAUVEGARDE_DRIVE_CONFIG (contenu de la section [drive] de rclone.conf, préparer seulement),
# RCLONE_CONFIG (fichier de configuration), R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
# (facultatif), DRIVE_RACINE (défaut drive:Suivi-fuites-sauvegarde), R2_RACINE (essais). Aucun secret n'est
# affiché ni placé dans un argument.
#
# Disposition du Drive :
#   base/                 sauvegarde-AAAAMMJJ-HHMM.tar.gz.gpg (chiffrées : sans SAUVEGARDE_PASSPHRASE, illisibles)
#   r2/                   le compartiment R2 tel quel : <marché>/<fuite>/<photo>.jpg, apk/, reseau/
#   stockage-supabase/    <compartiment Supabase>/<chemin> (photos, evenements, logos des débuts du projet)
set -euo pipefail
ici="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=commun.sh
source "$ici/commun.sh"

libre_minimum=$((3 * 1024 * 1024 * 1024))
suppressions_max=20

preparer() {
  : "${RCLONE_CONFIG:?RCLONE_CONFIG manquant (fichier de configuration rclone)}"
  if [ -z "${SAUVEGARDE_DRIVE_CONFIG:-}" ]; then
    echo "::error::Secret SAUVEGARDE_DRIVE_CONFIG manquant : la copie sur le Drive n'est pas configurée."
    return 1
  fi
  ( umask 077; printf '%s\n' "$SAUVEGARDE_DRIVE_CONFIG" > "$RCLONE_CONFIG" )
  if ! grep -q '^\[drive\]' "$RCLONE_CONFIG"; then
    echo "::error::SAUVEGARDE_DRIVE_CONFIG ne contient pas de section [drive] (voir la note pas à pas)."
    return 1
  fi
  local erreur
  erreur="$(mktemp)"
  if ! rclone mkdir "$DRIVE_RACINE" 2> "$erreur" || ! rclone lsf "$DRIVE_RACINE" --max-depth 1 > /dev/null 2>> "$erreur"; then
    echo "::error::Connexion au Drive impossible : jeton refusé, expiré ou révoqué ? Refaire l'autorisation et recréer le secret (note pas à pas)."
    sed -E 's/(token|key|secret)[^ ]*/<masqué>/Ig' "$erreur" | tail -n 5 >&2
    rm -f "$erreur"
    return 1
  fi
  rm -f "$erreur"
  echo "Connexion au Drive établie ($DRIVE_RACINE)."
}

verifier_copie() { # SOURCE DESTINATION [options de filtre…] : tout fichier de la source doit exister dans la destination
  local source="$1" destination="$2" combine ok manquants rc=0
  shift 2
  combine="$(mktemp)"
  rclone check "$source" "$destination" --one-way --size-only --combined "$combine" \
    --log-level ERROR "$@" > /dev/null 2>&1 || rc=$?
  ok="$(grep -c '^= ' "$combine" || true)"
  manquants="$(grep -c '^[-*!] ' "$combine" || true)"
  rm -f "$combine"
  if [ "$manquants" != "0" ]; then
    echo "::error::Contrôle de la copie : $manquants fichier(s) absent(s) ou de taille différente sur le Drive ($ok identiques)."
    return 1
  fi
  if [ "$rc" != "0" ]; then
    echo "::error::Contrôle de la copie impossible (rclone check, code $rc)."
    return 1
  fi
  echo "Contrôle : $ok fichier(s) présents sur le Drive avec la même taille, aucun manquant."
}

copier_base() {
  [ $# -eq 1 ] || { sed -n '2,9p' "$0" >&2; return 2; }
  local archive="$1" nom attendu obtenu liste
  nom="$(basename "$archive")"
  [[ "$nom" =~ ^sauvegarde-[0-9]{8}-[0-9]{4}\.tar\.gz\.gpg$ ]] \
    || { echo "::error::Nom d'archive inattendu : $nom"; return 1; }
  rclone copyto "$archive" "$DRIVE_RACINE/base/$nom" "${RCLONE_OPTIONS[@]}"
  attendu="$(sha256sum "$archive" | cut -d' ' -f1)"
  obtenu="$(rclone cat "$DRIVE_RACINE/base/$nom" | sha256sum | cut -d' ' -f1)"
  if [ "$attendu" != "$obtenu" ]; then
    echo "::error::La copie Drive de l'archive ne correspond pas à l'originale (empreintes différentes)."
    return 1
  fi
  echo "Copie Drive vérifiée : base/$nom ($(stat -c %s "$archive" 2> /dev/null || stat -f %z "$archive") octets, SHA-256 identique)."

  # Rotation. On ne supprime que si l'archive qui vient d'être déposée figure bien dans la liste lue.
  liste="$(rclone lsf "$DRIVE_RACINE/base" --files-only)"
  if ! grep -qxF "$nom" <<< "$liste"; then
    echo "::error::Rotation abandonnée : l'archive déposée n'apparaît pas dans base/ (rien n'a été supprimé)."
    return 1
  fi
  local a_supprimer total gardees
  a_supprimer="$(bash "$ici/rotation-archives.sh" 30 12 <<< "$liste")"
  total="$(grep -c '^sauvegarde-' <<< "$liste" || true)"
  if [ -z "$a_supprimer" ]; then
    echo "Rotation : $total archive(s) sur le Drive, aucune à supprimer."
    return 0
  fi
  local n
  n="$(grep -c . <<< "$a_supprimer")"
  if [ "$n" -gt "$suppressions_max" ]; then
    echo "::error::Rotation abandonnée : $n suppressions demandées (maximum $suppressions_max par exécution). Vérifier le contenu de base/."
    return 1
  fi
  while IFS= read -r ancien; do
    rclone deletefile "$DRIVE_RACINE/base/$ancien"
  done <<< "$a_supprimer"
  gardees=$((total - n))
  echo "Rotation : $n archive(s) supprimée(s), $gardees gardée(s) (30 quotidiennes, 12 mensuelles)."
}

copier_r2() {
  rclone_r2
  rclone copy "$R2_RACINE" "$DRIVE_RACINE/r2" --exclude 'sauvegardes/**' "${RCLONE_OPTIONS[@]}"
  verifier_copie "$R2_RACINE" "$DRIVE_RACINE/r2" --exclude 'sauvegardes/**'
}

copier_stockage() {
  rclone_r2
  local source="$R2_RACINE/sauvegardes/stockage-supabase"
  if [ -z "$(rclone lsf "$source" --max-depth 1 2> /dev/null | head -n 1)" ]; then
    echo "Aucun fichier de Supabase Storage dans la copie R2 : rien à copier."
    return 0
  fi
  rclone copy "$source" "$DRIVE_RACINE/stockage-supabase" "${RCLONE_OPTIONS[@]}"
  verifier_copie "$source" "$DRIVE_RACINE/stockage-supabase"
}

lisezmoi() {
  local f
  f="$(mktemp)"
  cat > "$f" <<LISEZMOI
Sauvegarde hors plateformes de Suivi-fuites (STEPAG), mise à jour le $(date -u '+%Y-%m-%d à %H:%M UTC').
Copie nocturne faite par GitHub Actions (workflow « Sauvegarde de la base »), avec rclone.
Ne rien déposer ni supprimer ici à la main : le workflow ne supprime jamais rien, sauf la rotation de base/.

base/                sauvegarde-AAAAMMJJ-HHMM.tar.gz.gpg : base de données chiffrée (AES-256). 30 quotidiennes et
                     12 mensuelles. Illisible sans la phrase secrète SAUVEGARDE_PASSPHRASE (gestionnaire de mots de passe).
r2/                  copie du compartiment Cloudflare R2 : photos (<marché>/<fuite>/<photo>.jpg), apk/ (APK publiées),
                     reseau/ (tuiles). Jamais supprimé.
stockage-supabase/   fichiers des compartiments Supabase Storage (photos, evenements, logos des débuts du projet).

Reprise après sinistre : supabase/README.md, section « Reprise après sinistre » (dépôt GitHub stepag-app/suivi-fuites).
LISEZMOI
  rclone copyto "$f" "$DRIVE_RACINE/LISEZMOI.txt" --log-level NOTICE
  rm -f "$f"
}

espace() {
  local json total libre utilise
  json="$(rclone about "$(drive_remote)" --json)"
  total="$(jq -r '.total // empty' <<< "$json")"
  libre="$(jq -r '.free // empty' <<< "$json")"
  utilise="$(jq -r '.used // 0' <<< "$json")"
  local go=$((1024 * 1024 * 1024))
  if [ -z "$total" ] || [ -z "$libre" ]; then
    echo "Espace du Drive : $((utilise / go)) Go utilisés (taille totale non communiquée)."
    return 0
  fi
  echo "Espace du Drive : $((utilise / go)) Go utilisés sur $((total / go)) Go, $((libre / go)) Go libres."
  if [ "$libre" -lt "$libre_minimum" ]; then
    echo "::warning::Moins de 3 Go libres sur le Drive : prévoir Google One (100 Go) ou faire de la place avant que les copies échouent."
  fi
}

case "${1:-}" in
  preparer)  preparer ;;
  base)      shift; copier_base "$@" ;;
  r2)        copier_r2 ;;
  stockage)  copier_stockage ;;
  lisezmoi)  lisezmoi ;;
  espace)    espace ;;
  *)         sed -n '2,9p' "$0" >&2; exit 2 ;;
esac
