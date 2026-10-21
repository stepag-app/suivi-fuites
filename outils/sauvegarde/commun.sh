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

# Clé R2 la plus restreinte pour chaque usage (H10), à appeler avant r2_config ou rclone_r2 :
#   r2_cle sauvegardes     compartiment séparé des sauvegardes (R2_BUCKET_SAUVEGARDES, défaut
#                          suivi-fuites-sauvegardes) avec sa propre clé R2_SAUV_*, qu'aucune fonction Supabase
#                          ne détient : une clé des photos qui fuit ne peut pas effacer les sauvegardes ;
#   r2_cle photos-lecture  compartiment des photos avec la clé lecture seule R2_RO_*.
# Clé absente : repli, avec un avertissement, sur R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY et le compartiment des
# photos (avant la mise en service). Clé à moitié posée : échec.
r2_cle() {
  local id secret
  case "$1" in
    sauvegardes)    id="${R2_SAUV_ACCESS_KEY_ID:-}" secret="${R2_SAUV_SECRET_ACCESS_KEY:-}" ;;
    photos-lecture) id="${R2_RO_ACCESS_KEY_ID:-}" secret="${R2_RO_SECRET_ACCESS_KEY:-}" ;;
    *) echo "r2_cle : usage inconnu « $1 » (sauvegardes ou photos-lecture)." >&2; return 2 ;;
  esac
  if [ -n "$id" ] && [ -n "$secret" ]; then
    R2_ACCESS_KEY_ID="$id" R2_SECRET_ACCESS_KEY="$secret"
    if [ "$1" = sauvegardes ]; then R2_BUCKET="${R2_BUCKET_SAUVEGARDES:-suivi-fuites-sauvegardes}"; fi
  elif [ -n "$id$secret" ]; then
    echo "::error::Clé R2 « $1 » incomplète : il faut l'identifiant ET le secret (en-tête de sauvegarde-base.yml)."
    return 1
  else
    echo "::warning::Clé R2 dédiée « $1 » absente : repli sur la clé lecture+écriture des photos (H10 à activer)."
  fi
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

# --- Copie hors plateformes : Google Drive du compte stepag.app, par rclone -------------------------------
# Dossier racine côté Drive. « drive » est le nom de la section de la configuration rclone (secret GitHub
# SAUVEGARDE_DRIVE_CONFIG). Un chemin local peut le remplacer (essais sans réseau).
DRIVE_RACINE="${DRIVE_RACINE:-drive:Suivi-fuites-sauvegarde}"

# Remote « r2 » de rclone défini par l'environnement (jamais écrit sur disque), racine du compartiment R2_BUCKET
# dans R2_RACINE. Essais : R2_ESSAI_DOSSIER (un sous-dossier local par compartiment) le remplace, sans clé.
rclone_r2() {
  R2_BUCKET="${R2_BUCKET:-suivi-fuites-photos}"
  if [ -n "${R2_ESSAI_DOSSIER:-}" ]; then R2_RACINE="$R2_ESSAI_DOSSIER/$R2_BUCKET"; return 0; fi
  : "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID manquant}" "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID manquant}" \
    "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY manquant}"
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_ACL=private \
         RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
         RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
         RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
  R2_RACINE="r2:$R2_BUCKET"
}

# Options communes aux copies : reprises, débit raisonnable pour l'API Drive, une ligne de statistiques.
RCLONE_OPTIONS=(--transfers 4 --checkers 8 --retries 3 --low-level-retries 10 --drive-chunk-size 32M
                --log-level NOTICE --stats 60s --stats-one-line --stats-log-level NOTICE)

# « drive: » quand DRIVE_RACINE est « drive:dossier » ; le chemin lui-même pour un dossier local.
drive_remote() {
  case "$DRIVE_RACINE" in *:*) printf '%s:' "${DRIVE_RACINE%%:*}" ;; *) printf '%s' "$DRIVE_RACINE" ;; esac
}
