# Fonctions communes aux scripts de sauvegarde (à charger avec « source »). N'affichent jamais de secret.

# Connexion SQL au projet lié (supabase link) par le pooler : l'hôte direct n'a pas d'IPv4.
# Le mot de passe est lu dans SUPABASE_DB_PASSWORD, jamais placé dans une commande.
psql_prod() {
  local url re='^postgres(ql)?://([^:@/]+)(:[^@]*)?@([^:/]+):([0-9]+)/([^?]+)'
  url="$(cat "${SUPABASE_TEMP:-supabase/.temp}/pooler-url")"
  [[ "$url" =~ $re ]] || { echo "pooler-url illisible : supabase link a-t-il été lancé ?" >&2; return 2; }
  PGPASSWORD="$SUPABASE_DB_PASSWORD" PGSSLMODE=require \
    psql -X -v ON_ERROR_STOP=1 -h "${BASH_REMATCH[4]}" -p "${BASH_REMATCH[5]}" \
         -U "${BASH_REMATCH[2]}" -d "${BASH_REMATCH[6]}" "$@"
}

# AWS CLI vers Cloudflare R2 (API compatible S3). Variables : R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
# R2_SECRET_ACCESS_KEY, R2_BUCKET (défaut suivi-fuites-photos).
r2_config() {
  : "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID manquant}" "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID manquant}" \
    "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY manquant}"
  R2_BUCKET="${R2_BUCKET:-suivi-fuites-photos}"
  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION=auto AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
         AWS_RESPONSE_CHECKSUM_VALIDATION=when_required AWS_PAGER=
}
r2() { aws --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" "$@"; }

# Chemin encodé segment par segment pour une URL (les « / » sont conservés).
chemin_url() { printf '%s' "$1" | jq -Rr 'split("/") | map(@uri) | join("/")'; }

# Une ligne de configuration curl portant les en-têtes d'authentification de l'API Supabase :
# la clé ne figure jamais dans les arguments d'un processus.
curl_config_cle() {
  printf 'header = "apikey: %s"\nheader = "Authorization: Bearer %s"\n' "$1" "$1"
}
