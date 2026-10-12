#!/usr/bin/env bash
# Purge de mise en service, appelée par .github/workflows/purge-mise-en-service.yml (projet déjà lié).
#   purge.sh inventaire   nombres de lignes et de fichiers, lecture seule (résumé de l'exécution)
#   purge.sh base         outils/purge/purger.sql en une seule transaction
#   purge.sh fichiers     photos et pièces jointes des deux marchés (Supabase Storage), photos et tuiles de DEMO
#                         dans R2 ; sans effet s'il n'y a plus rien (relançable)
# Variables : SUPABASE_PROJECT_ID, SUPABASE_DB_PASSWORD, SUPABASE_ACCESS_TOKEN, MARCHE_SRM, MARCHE_DEMO, réglages
# EFFACER_* / GARDER_* / AFFECTER_* (oui | non), R2_* pour « fichiers ». N'affiche jamais de secret ni de donnée.
set -euo pipefail
ici="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../sauvegarde/commun.sh
source "$ici/../sauvegarde/commun.sh"
: "${MARCHE_SRM:?}" "${MARCHE_DEMO:?}"
resume="${GITHUB_STEP_SUMMARY:-/dev/null}"

inventaire() {
  local sortie
  sortie="$(mktemp)"
  psql_prod -v srm="$MARCHE_SRM" -v demo="$MARCHE_DEMO" -c 'begin transaction read only' -f "$ici/inventaire.sql" -c 'rollback' > "$sortie"
  cat "$sortie"
  { echo "### Inventaire ($(date -u '+%Y-%m-%d %H:%M') UTC)"; echo '```'; cat "$sortie"; echo '```'; } >> "$resume"
  rm -f "$sortie"
}

base() {
  psql_prod --single-transaction \
    -v srm="$MARCHE_SRM" -v demo="$MARCHE_DEMO" \
    -v effacer_gps="$EFFACER_GPS" -v effacer_debits="$EFFACER_DEBITS" \
    -v effacer_evenements="$EFFACER_EVENEMENTS" -v effacer_envois_email="$EFFACER_ENVOIS_EMAIL" \
    -v garder_notifications_generales="$GARDER_NOTIFICATIONS_GENERALES" -v affecter_agents_demo="$AFFECTER_AGENTS_DEMO" \
    -f "$ici/purger.sql"
  echo "Base purgée (transaction validée)." | tee -a "$resume"
}

# Fichiers de Supabase Storage à effacer : tout ce qui est rangé sous le dossier de DEMO, les photos du SRM (plus
# aucune fuite), et selon les réglages les pièces jointes des événements et des débits du SRM. Les logos du SRM
# et ses fichiers d'autres compartiments restent.
fichiers_storage() {
  local liste cle bucket n total=0
  liste="$(mktemp)"
  psql_prod -At -F $'\t' \
    -v srm="$MARCHE_SRM" -v demo="$MARCHE_DEMO" -v ev="$EFFACER_EVENEMENTS" -v deb="$EFFACER_DEBITS" <<'SQL' > "$liste"
select bucket_id, name from storage.objects
 where (storage.foldername(name))[1] = :'demo'
    or ((storage.foldername(name))[1] = :'srm'
        and (bucket_id = 'photos' or (bucket_id = 'evenements' and :'ev' = 'oui') or (bucket_id = 'debits' and :'deb' = 'oui')))
 order by 1, 2;
SQL
  total="$(grep -c . "$liste" || true)"
  echo "Supabase Storage : $total fichier(s) à effacer."
  if [ "$total" -gt 0 ]; then
    cle="$(supabase projects api-keys --project-ref "$SUPABASE_PROJECT_ID" -o json \
            | jq -r '([.[] | select(.name == "service_role")] + [.[] | select(.type == "secret")])[0].api_key // empty')"
    [ -n "$cle" ] || { echo "::error::Clé de service Supabase introuvable."; exit 1; }
    echo "::add-mask::$cle"
    for bucket in $(cut -f1 "$liste" | sort -u); do
      # Par paquets de 500 noms (API Storage : DELETE /object/<compartiment>, corps { prefixes: [...] }).
      awk -F '\t' -v b="$bucket" '$1 == b { print $2 }' "$liste" | split -l 500 - "$liste.paquet."
      for paquet in "$liste".paquet.*; do
        n="$(wc -l < "$paquet" | tr -d ' ')"
        jq -R . "$paquet" | jq -s '{prefixes: .}' \
          | curl -fsS --retry 3 --retry-delay 2 --config <(curl_config_cle "$cle") -X DELETE \
              -H 'Content-Type: application/json' --data-binary @- \
              "https://$SUPABASE_PROJECT_ID.supabase.co/storage/v1/object/$bucket" > /dev/null
        echo "  $bucket : $n fichier(s) effacé(s)."
        rm -f "$paquet"
      done
    done
  fi
  rm -f "$liste"
  local reste
  reste="$(psql_prod -At -v srm="$MARCHE_SRM" -v demo="$MARCHE_DEMO" -v ev="$EFFACER_EVENEMENTS" -v deb="$EFFACER_DEBITS" <<'SQL'
select count(*) from storage.objects
 where (storage.foldername(name))[1] = :'demo'
    or ((storage.foldername(name))[1] = :'srm'
        and (bucket_id = 'photos' or (bucket_id = 'evenements' and :'ev' = 'oui') or (bucket_id = 'debits' and :'deb' = 'oui')));
SQL
)"
  echo "Supabase Storage : $total fichier(s) effacé(s), reste $reste." | tee -a "$resume"
  [ "$reste" -eq 0 ] || { echo "::error::Des fichiers de Supabase Storage n'ont pas été effacés."; exit 1; }
}

# R2 : photos des deux marchés (<marché>/<fuite>/<photo>.jpg) et archives de DEMO (réseau, fond). Le réseau et le fond
# du SRM, les APK et les sauvegardes (dont la copie des fichiers de Storage) ne sont pas touchés.
fichiers_r2() {
  r2_config
  local prefixe n
  for prefixe in "$MARCHE_SRM/" "$MARCHE_DEMO/" "reseau/$MARCHE_DEMO/" "fonds/$MARCHE_DEMO/"; do
    n="$(r2 s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "$prefixe" --query 'length(Contents || `[]`)' --output text)"
    if [ "$n" -gt 0 ]; then
      r2 s3 rm "s3://$R2_BUCKET/$prefixe" --recursive --only-show-errors
    fi
    local reste
    reste="$(r2 s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "$prefixe" --query 'length(Contents || `[]`)' --output text)"
    case "$prefixe" in
      "$MARCHE_SRM/") nom="photos du SRM" ;;
      "$MARCHE_DEMO/") nom="photos de DEMO" ;;
      reseau/*) nom="réseau de DEMO" ;;
      *) nom="fond de DEMO" ;;
    esac
    echo "R2, $nom : $n fichier(s) effacé(s), reste $reste." | tee -a "$resume"
    [ "$reste" -eq 0 ] || { echo "::error::Des fichiers R2 ($nom) n'ont pas été effacés."; exit 1; }
  done
  for prefixe in "reseau/$MARCHE_SRM/" "fonds/$MARCHE_SRM/"; do
    n="$(r2 s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "$prefixe" --query 'length(Contents || `[]`)' --output text)"
    echo "R2, $prefixe (gardé) : $n fichier(s)." | tee -a "$resume"
  done
}

case "${1:-}" in
  inventaire) inventaire ;;
  base) base ;;
  fichiers) fichiers_storage; fichiers_r2 ;;
  *) echo "Usage : $0 inventaire | base | fichiers" >&2; exit 2 ;;
esac
