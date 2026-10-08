#!/usr/bin/env bash
# Dépose l'archive chiffrée dans R2 (copie hors de GitHub), vérifie la copie par empreinte SHA-256,
# puis supprime les archives de plus de 30 jours (en gardant au moins 7 archives récentes).
#   copie-r2.sh ARCHIVE.tar.gz.gpg
# Variables : R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (facultatif).
# Cible : s3://<compartiment>/sauvegardes/base/<nom de l'archive>. Seule l'archive CHIFFRÉE y va ;
# la phrase secrète n'est jamais envoyée.
set -euo pipefail
[ $# -eq 1 ] || { sed -n '2,5p' "$0" >&2; exit 2; }
# shellcheck source=commun.sh
source "$(dirname "$0")/commun.sh"
r2_config

archive="$1"
prefixe="sauvegardes/base/"
cle="$prefixe$(basename "$archive")"
conservation_jours=30
minimum_gardees=7

r2 s3 cp "$archive" "s3://$R2_BUCKET/$cle" --no-progress
attendu="$(sha256sum "$archive" | cut -d' ' -f1)"
obtenu="$(r2 s3 cp "s3://$R2_BUCKET/$cle" - --no-progress | sha256sum | cut -d' ' -f1)"
if [ "$attendu" != "$obtenu" ]; then
  echo "::error::La copie R2 de l'archive ne correspond pas à l'originale (empreintes différentes)."
  exit 1
fi
echo "Copie R2 vérifiée : $cle ($(stat -c %s "$archive") octets, SHA-256 identique)."

limite="$(date -u -d "$conservation_jours days ago" +%s)"
liste="$(r2 s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "$prefixe" \
           --query 'Contents[].[Key,LastModified]' --output text)"
[ "$liste" = "None" ] && liste=""
recentes=0
anciennes=()
while IFS=$'\t' read -r k date_k; do
  [ -n "$k" ] || continue
  if [ "$(date -u -d "$date_k" +%s)" -lt "$limite" ]; then anciennes+=("$k"); else recentes=$((recentes + 1)); fi
done <<< "$liste"
echo "Archives dans R2 : $recentes de moins de $conservation_jours jours, ${#anciennes[@]} plus ancienne(s)."
if [ "${#anciennes[@]}" -gt 0 ]; then
  if [ "$recentes" -lt "$minimum_gardees" ]; then
    echo "::warning::Moins de $minimum_gardees archives récentes dans R2 : aucune suppression."
  else
    for k in "${anciennes[@]}"; do r2 s3 rm "s3://$R2_BUCKET/$k" --only-show-errors; done
    echo "${#anciennes[@]} archive(s) de plus de $conservation_jours jours supprimée(s) de R2."
  fi
fi
