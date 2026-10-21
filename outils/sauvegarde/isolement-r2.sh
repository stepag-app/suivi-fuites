#!/usr/bin/env bash
# Contrôle de l'isolement des jetons R2 (H10), à la fin du job Drive de la sauvegarde et au déploiement des
# fonctions (avec les clés réellement posées dans les fonctions). Pour chaque clé présente :
#  * témoin : elle doit lister son propre compartiment, sinon la clé est invalide ou périmée (échec) ;
#  * elle doit être refusée (AccessDenied) sur l'autre compartiment ; une liste acceptée = jeton trop large (échec).
# Clés : R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY et R2_RO_* (photos, R2_BUCKET), R2_SAUV_* (sauvegardes,
# R2_BUCKET_SAUVEGARDES). Compartiment des sauvegardes encore absent (avant la mise en service) : avertissement.
# Variables : R2_ACCOUNT_ID et les clés ci-dessus. N'affiche aucun secret : seulement les codes d'erreur d'aws.
set -uo pipefail
# shellcheck source=commun.sh
source "$(dirname "$0")/commun.sh"

if [ -z "${R2_ACCOUNT_ID:-}" ]; then echo "::error::Secret R2_ACCOUNT_ID manquant : isolement non contrôlé."; exit 1; fi
photos="${R2_BUCKET:-suivi-fuites-photos}"
sauvegardes="${R2_BUCKET_SAUVEGARDES:-suivi-fuites-sauvegardes}"
erreur="$(mktemp)"
trap 'rm -f "$erreur"' EXIT

code() { # ID SECRET COMPARTIMENT : « ok » si la clé liste le compartiment, sinon le code d'erreur d'aws
  if AWS_ACCESS_KEY_ID="$1" AWS_SECRET_ACCESS_KEY="$2" AWS_SESSION_TOKEN= AWS_DEFAULT_REGION=auto AWS_PAGER= \
       r2 s3api list-objects-v2 --bucket "$3" --max-keys 1 > /dev/null 2> "$erreur"; then
    echo ok
  else
    sed -n 's/.*An error occurred (\([A-Za-z]*\)).*/\1/p' "$erreur" | head -n 1 | grep . || echo inconnu
  fi
}
fautes=0
controle() { # NOM ID SECRET PROPRE AUTRE
  local nom="$1" id="$2" secret="$3" propre="$4" autre="$5" c
  if [ -z "$id$secret" ]; then echo "Clé $nom absente ici : non contrôlée."; return 0; fi
  if [ -z "$id" ] || [ -z "$secret" ]; then
    echo "::error::Clé $nom incomplète : il faut l'identifiant ET le secret."; fautes=$((fautes + 1)); return 0
  fi
  c="$(code "$id" "$secret" "$propre")"
  if [ "$c" != ok ]; then
    echo "::error::La clé $nom ne lit pas son compartiment $propre ($c) : clé invalide ou périmée, contrôle impossible."
    fautes=$((fautes + 1)); return 0
  fi
  c="$(code "$id" "$secret" "$autre")"
  case "$c" in
    AccessDenied) echo "Clé $nom : lit $propre, refusée sur $autre. Correct." ;;
    ok) echo "::error::La clé $nom peut lire $autre : son jeton n'est pas limité à $propre (H10)."; fautes=$((fautes + 1)) ;;
    NoSuchBucket) echo "::warning::Compartiment $autre introuvable : pas encore créé ? Isolement de la clé $nom non contrôlé." ;;
    *) echo "::error::Réponse inattendue ($c) pour la clé $nom sur $autre : isolement non contrôlé."; fautes=$((fautes + 1)) ;;
  esac
}

controle "des photos (R2_ACCESS_KEY_ID)" "${R2_ACCESS_KEY_ID:-}" "${R2_SECRET_ACCESS_KEY:-}" "$photos" "$sauvegardes"
controle "lecture seule (R2_RO_*)" "${R2_RO_ACCESS_KEY_ID:-}" "${R2_RO_SECRET_ACCESS_KEY:-}" "$photos" "$sauvegardes"
controle "des sauvegardes (R2_SAUV_*)" "${R2_SAUV_ACCESS_KEY_ID:-}" "${R2_SAUV_SECRET_ACCESS_KEY:-}" "$sauvegardes" "$photos"
[ "$fautes" -eq 0 ]
