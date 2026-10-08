#!/usr/bin/env bash
# Restauration d'une sauvegarde chiffrée de la base (workflow sauvegarde-base.yml).
# Utilisé tel quel par le test de restauration de la CI et par la restauration manuelle.
#
#   restaurer.sh dechiffrer ARCHIVE.tar.gz.gpg DOSSIER   déchiffre dans DOSSIER (créé, vide)
#   restaurer.sh charger DOSSIER                         schema.sql, donnees.sql, complement.sql
#
# Variables :
#   SAUVEGARDE_PASSPHRASE   phrase secrète (dechiffrer) ; lue aussi dans le fichier
#                           SAUVEGARDE_PASSPHRASE_FICHIER si la variable est vide
#   URL_BASE_NEUVE          chaîne de connexion de la base à remplir (charger), ex.
#                           postgresql://postgres:…@db.xxxx.supabase.co:5432/postgres
#   RESTAURATION_PSQL       à la place de URL_BASE_NEUVE : commande complète de psql (mots séparés par
#                           des espaces), ex. « docker exec -i supabase_db_x psql -U postgres -d postgres »
#
# Garde-fous : la base cible doit être vierge (aucune table public.marches ni public.fuites) ;
# chaque fichier est chargé en une seule transaction, arrêt à la première erreur ; les messages
# d'erreur de PostgreSQL sont affichés sans les valeurs qu'ils citent.
set -euo pipefail

psql_cible() {
  local options=(-X -q -v ON_ERROR_STOP=1 -v VERBOSITY=terse -v SHOW_CONTEXT=never)
  if [ -n "${RESTAURATION_PSQL:-}" ]; then
    # shellcheck disable=SC2086
    $RESTAURATION_PSQL "${options[@]}" "$@"
  elif [ -n "${URL_BASE_NEUVE:-}" ]; then
    psql "$URL_BASE_NEUVE" "${options[@]}" "$@"
  else
    echo "Définir URL_BASE_NEUVE (ou RESTAURATION_PSQL)." >&2
    return 2
  fi
}

masquer() {
  sed -E -e 's/value "[^"]*"/value "<masqué>"/g' -e 's/: "[^"]*"$/: "<masqué>"/' \
         -e 's/\([^)]*\)=\([^)]*\)/(<masqué>)=(<masqué>)/g'
}

dechiffrer() {
  local archive="$1" dossier="$2" phrase="${SAUVEGARDE_PASSPHRASE:-}"
  if [ -z "$phrase" ] && [ -n "${SAUVEGARDE_PASSPHRASE_FICHIER:-}" ]; then
    phrase="$(cat "$SAUVEGARDE_PASSPHRASE_FICHIER")"
  fi
  if [ -z "$phrase" ]; then
    echo "Phrase secrète absente (SAUVEGARDE_PASSPHRASE ou SAUVEGARDE_PASSPHRASE_FICHIER)." >&2
    return 2
  fi
  mkdir -p "$dossier"
  printf '%s' "$phrase" \
    | gpg --batch --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 0 --decrypt "$archive" \
    | tar -xzf - -C "$dossier"
  local f
  for f in schema.sql donnees.sql complement.sql; do
    if [ ! -s "$dossier/$f" ]; then
      echo "Sauvegarde incomplète : $f absent ou vide." >&2
      return 1
    fi
  done
  echo "Archive déchiffrée dans $dossier"
}

# Charge un fichier SQL (lu sur l'entrée standard : fonctionne aussi avec « docker exec -i ») en une
# transaction, sans afficher de données.
charger_fichier() {
  local fichier="$1" journal
  journal="$(mktemp)"
  if psql_cible -1 -f - < "$fichier" > /dev/null 2> "$journal"; then
    rm -f "$journal"
    echo "$(basename "$fichier") : restauré sans erreur."
  else
    echo "${GITHUB_ACTIONS:+::error::}ERREUR $(basename "$fichier") : la restauration a échoué (ON_ERROR_STOP=1)." >&2
    grep -iE 'error|fatal' "$journal" | masquer | head -n 5 >&2 || true
    rm -f "$journal"
    return 1
  fi
}

charger() {
  local dossier="$1" existantes
  existantes="$(psql_cible -At -c "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('marches', 'fuites')")"
  if [ "$existantes" != "0" ]; then
    echo "La base cible n'est pas vierge (public.marches ou public.fuites existe) : arrêt, rien n'a été modifié." >&2
    return 1
  fi
  charger_fichier "$dossier/schema.sql"
  charger_fichier "$dossier/donnees.sql"
  charger_fichier "$dossier/complement.sql"
}

case "${1:-}" in
  dechiffrer) [ $# -eq 3 ] || { sed -n '2,10p' "$0" >&2; exit 2; }; dechiffrer "$2" "$3" ;;
  charger)    [ $# -eq 2 ] || { sed -n '2,10p' "$0" >&2; exit 2; }; charger "$2" ;;
  *)          sed -n '2,10p' "$0" >&2; exit 2 ;;
esac
