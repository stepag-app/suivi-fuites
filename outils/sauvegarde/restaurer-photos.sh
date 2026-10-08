#!/usr/bin/env bash
# Renvoie dans Supabase Storage les fichiers sauvegardés par photos-vers-r2.sh.
#   restaurer-photos.sh DOSSIER
# DOSSIER contient un sous-dossier par compartiment Supabase (photos, evenements, logos), par exemple
# obtenu avec :
#   aws s3 sync s3://suivi-fuites-photos/sauvegardes/stockage-supabase/ DOSSIER/ \
#       --endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
# Variables : SUPABASE_URL (https://<projet>.supabase.co, projet NEUF), SUPABASE_SERVICE_ROLE_KEY
# (clé de service du projet neuf, à ne jamais ranger dans un fichier du dépôt). Les compartiments
# doivent exister (ils viennent de donnees.sql) ; un fichier déjà présent est remplacé (upsert), ce qui
# permet de relancer le script. Les photos stockées dans R2 (stockage = 'r2') n'ont rien à restaurer.
set -euo pipefail
[ $# -eq 1 ] && [ -d "$1" ] || { sed -n '2,3p' "$0" >&2; exit 2; }
: "${SUPABASE_URL:?SUPABASE_URL manquant}" "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY manquant}"
# shellcheck source=commun.sh
source "$(dirname "$0")/commun.sh"

dossier="${1%/}"
envoyes=0
echecs=0
while IFS= read -r -d '' f; do
  relatif="${f#"$dossier"/}"
  type="$(file --mime-type -b "$f")"
  if curl -fsS --retry 3 --retry-delay 2 --config <(curl_config_cle "$SUPABASE_SERVICE_ROLE_KEY") \
       -X POST -H "x-upsert: true" -H "Content-Type: $type" --data-binary "@$f" -o /dev/null \
       "${SUPABASE_URL%/}/storage/v1/object/$(chemin_url "$relatif")"; then
    envoyes=$((envoyes + 1))
  else
    echecs=$((echecs + 1))
    echo "Échec : $relatif" >&2
  fi
done < <(find "$dossier" -type f ! -name '.*' -print0)
echo "Envoyés : $envoyes ; en échec : $echecs."
[ "$echecs" -eq 0 ]
