#!/usr/bin/env bash
# Exporte le projet Supabase lié (supabase link) dans DOSSIER : schema.sql, donnees.sql,
# complement.sql, migrations_appliquees.txt, LISEZMOI.txt. Variable : SUPABASE_DB_PASSWORD.
#   exporter.sh DOSSIER
set -euo pipefail
[ $# -eq 1 ] || { sed -n '2,4p' "$0" >&2; exit 2; }
ici="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=commun.sh
source "$ici/commun.sh"
d="$1"
mkdir -p "$d"

supabase db dump --linked -f "$d/schema.sql"
# Les comptes (auth) et les fichiers (storage) font partie de cet export : pas de second fichier.
# Les deux tables internes des « vector buckets » sont interdites en lecture-écriture au rôle postgres
# et le guide de migration de Supabase les exclut lui-même.
supabase db dump --linked --data-only --use-copy \
  -x storage.buckets_vectors -x storage.vector_indexes -f "$d/donnees.sql"
psql_prod -At -f "$ici/generer-complement.sql" > "$d/complement.sql"
if psql_prod -At -c "select version from supabase_migrations.schema_migrations order by version" \
     > "$d/migrations_appliquees.txt" 2> /dev/null; then
  :
else
  echo "::warning::Liste des migrations appliquées illisible (supabase_migrations.schema_migrations)."
  : > "$d/migrations_appliquees.txt"
fi

cat > "$d/LISEZMOI.txt" <<LISEZMOI
Sauvegarde de la base Suivi-fuites (STEPAG), faite le $(date -u '+%Y-%m-%d à %H:%M UTC').
schema.sql                  structure (tables, fonctions, règles RLS)
donnees.sql                 données, comptes (auth) et enregistrements de fichiers (storage) compris
complement.sql              déclencheur de auth.users et règles de storage.objects (à charger en dernier)
migrations_appliquees.txt   versions de migrations déjà appliquées (pour « supabase migration repair »)
Restauration : voir supabase/README.md, section « Sauvegarde et restauration » (outils/sauvegarde/restaurer.sh).
Les fichiers eux-mêmes (photos) ne sont pas dans cette archive : ils sont dans R2 (préfixe sauvegardes/stockage-supabase/ pour Supabase Storage) et sur le Google Drive de stepag.app (dossiers r2/ et stockage-supabase/).
LISEZMOI

grep -q 'CREATE TABLE IF NOT EXISTS "public"."fuites"' "$d/schema.sql"
grep -q 'COPY "public"."marches"' "$d/donnees.sql"
grep -q 'COPY "auth"."users"' "$d/donnees.sql"
if grep -q 'buckets_vectors\|vector_indexes' "$d/donnees.sql"; then
  echo "::error::donnees.sql contient encore des tables « vector buckets »."; exit 1
fi
grep -q '^CREATE TRIGGER creer_profil_apres_inscription ' "$d/complement.sql"
grep -q '^create policy photos_fichiers_lecture on storage.objects ' "$d/complement.sql"
wc -c "$d"/*.sql
