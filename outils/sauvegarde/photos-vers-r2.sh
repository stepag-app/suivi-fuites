#!/usr/bin/env bash
# Copie dans R2 les fichiers encore stockés dans Supabase Storage (tous compartiments : photos,
# evenements, logos…), pour qu'aucune photo ne dépende du seul Supabase. Les fichiers déjà présents
# dans R2 (même nom, même taille) ne sont pas recopiés ; rien n'est jamais supprimé de R2 : un fichier
# effacé de Supabase reste donc récupérable. Les photos prises depuis le lot N sont déjà dans R2
# (colonne photos.stockage = 'r2') et n'ont pas besoin de ce script.
# Cible : s3://<compartiment>/sauvegardes/stockage-supabase/<compartiment Supabase>/<chemin>.
# Projet déjà lié (supabase link) ; variables : SUPABASE_PROJECT_ID, SUPABASE_ACCESS_TOKEN,
# SUPABASE_DB_PASSWORD, R2_*.
set -euo pipefail
# shellcheck source=commun.sh
source "$(dirname "$0")/commun.sh"
r2_config
: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID manquant}"

prefixe="sauvegardes/stockage-supabase"
travail="$(mktemp -d)"
trap 'rm -rf "$travail"' EXIT

# bucket<TAB>chemin<TAB>taille (-1 si inconnue). Les dossiers factices de Supabase sont ignorés.
psql_prod -At -F $'\t' -c "select bucket_id, name, coalesce((metadata->>'size')::bigint, -1) from storage.objects where name not like '%.emptyFolderPlaceholder' order by 1, 2" > "$travail/supabase.tsv"
total="$(wc -l < "$travail/supabase.tsv" | tr -d ' ')"

liste="$(r2 s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "$prefixe/" --query 'Contents[].[Key,Size]' --output text)"
[ "$liste" = "None" ] && liste=""
printf '%s\n' "$liste" > "$travail/r2.tsv"

# Fichiers à copier : absents de R2 ou de taille différente.
awk -F '\t' -v p="$prefixe" '
  NR == FNR { if ($1 != "") r2[$1] = $2; next }
  { cle = p "/" $1 "/" $2; if (!(cle in r2) || ($3 >= 0 && r2[cle] != $3)) print $1 "\t" $2 }
' "$travail/r2.tsv" "$travail/supabase.tsv" > "$travail/a-copier.tsv"
a_copier="$(wc -l < "$travail/a-copier.tsv" | tr -d ' ')"
echo "Fichiers dans Supabase Storage : $total ; à copier vers R2 : $a_copier."

copies=0
echecs=0
if [ "$a_copier" -gt 0 ]; then
  # Clé de service lue chez Supabase au moment de la copie (jeton d'accès déjà utilisé par la CI) ;
  # elle reste en mémoire, masquée dans les journaux, et ne sert qu'à lire Storage.
  cle="$(supabase projects api-keys --project-ref "$SUPABASE_PROJECT_ID" -o json \
          | jq -r '([.[] | select(.name == "service_role")] + [.[] | select(.type == "secret")])[0].api_key // empty')"
  [ -n "$cle" ] || { echo "::error::Clé de service Supabase introuvable."; exit 1; }
  echo "::add-mask::$cle"
  while IFS=$'\t' read -r bucket nom; do
    if curl -fsS --retry 3 --retry-delay 2 --config <(curl_config_cle "$cle") -o "$travail/fichier" \
         "https://$SUPABASE_PROJECT_ID.supabase.co/storage/v1/object/authenticated/$(chemin_url "$bucket/$nom")" \
       && r2 s3 cp "$travail/fichier" "s3://$R2_BUCKET/$prefixe/$bucket/$nom" --no-progress --only-show-errors; then
      copies=$((copies + 1))
    else
      echecs=$((echecs + 1))
      echo "::warning::Copie impossible d'un fichier du compartiment $bucket (nom non affiché)."
    fi
    rm -f "$travail/fichier"
  done < "$travail/a-copier.tsv"
fi
echo "Copiés : $copies ; en échec : $echecs."
[ "$echecs" -eq 0 ] || exit 1
