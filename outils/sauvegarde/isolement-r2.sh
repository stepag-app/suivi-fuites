#!/usr/bin/env bash
# Contrôle de l'isolement des jetons R2 (H10), à la fin du job Drive : aucune clé des photos (lecture+écriture,
# lecture seule) ne doit lire le compartiment des sauvegardes, et la clé des sauvegardes ne doit pas lire celui
# des photos. Chaque clé présente est essayée (liste d'un objet) ; une liste acceptée fait échouer l'étape. Témoin :
# la clé des sauvegardes doit lire son propre compartiment, sinon un refus ne prouverait rien. Sans clé des
# sauvegardes (avant la mise en service), rien à contrôler.
# Variables : R2_ACCOUNT_ID, R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY, R2_RO_*, R2_SAUV_*, R2_BUCKET,
# R2_BUCKET_SAUVEGARDES. N'affiche aucun secret.
set -uo pipefail
# shellcheck source=commun.sh
source "$(dirname "$0")/commun.sh"

if [ -z "${R2_SAUV_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SAUV_SECRET_ACCESS_KEY:-}" ]; then
  echo "Compartiment séparé des sauvegardes pas encore en service : rien à contrôler."
  exit 0
fi
photos="${R2_BUCKET:-suivi-fuites-photos}"
sauvegardes="${R2_BUCKET_SAUVEGARDES:-suivi-fuites-sauvegardes}"

lit() { # ID SECRET COMPARTIMENT : vrai si la clé peut lister le compartiment
  AWS_ACCESS_KEY_ID="$1" AWS_SECRET_ACCESS_KEY="$2" AWS_DEFAULT_REGION=auto AWS_PAGER= \
    r2 s3api list-objects-v2 --bucket "$3" --max-keys 1 > /dev/null 2>&1
}
fautes=0
refusee() { # NOM ID SECRET COMPARTIMENT
  [ -n "$2" ] && [ -n "$3" ] || return 0
  if lit "$2" "$3" "$4"; then
    echo "::error::La clé $1 peut lire le compartiment $4 : son jeton n'est pas limité à son compartiment (H10)."
    fautes=$((fautes + 1))
  else
    echo "Clé $1 refusée sur $4 : correct."
  fi
}

if lit "$R2_SAUV_ACCESS_KEY_ID" "$R2_SAUV_SECRET_ACCESS_KEY" "$sauvegardes"; then
  echo "Clé des sauvegardes acceptée sur $sauvegardes (témoin)."
else
  echo "::error::La clé des sauvegardes ne lit pas $sauvegardes : contrôle d'isolement impossible."
  exit 1
fi
refusee "des photos (R2_ACCESS_KEY_ID)" "${R2_ACCESS_KEY_ID:-}" "${R2_SECRET_ACCESS_KEY:-}" "$sauvegardes"
refusee "lecture seule (R2_RO_*)" "${R2_RO_ACCESS_KEY_ID:-}" "${R2_RO_SECRET_ACCESS_KEY:-}" "$sauvegardes"
refusee "des sauvegardes (R2_SAUV_*)" "$R2_SAUV_ACCESS_KEY_ID" "$R2_SAUV_SECRET_ACCESS_KEY" "$photos"
[ "$fautes" -eq 0 ]
