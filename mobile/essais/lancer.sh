#!/usr/bin/env bash
# Essai de la file d'attente (fuite → réparation → pièces / ouvriers → réfection → photos, coupures
# réseau, fuite verrouillée, doublons, droits détection / chef) contre la pile Supabase LOCALE.
# Prérequis, depuis la racine du dépôt : dockerd, puis
#   SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx -y supabase@2 start -x studio,imgproxy,logflare,vector,realtime,edge-runtime,mailpit,supavisor,postgres-meta
# Les clés lues ici sont celles de la pile locale (jamais celles du projet).
set -euo pipefail
cd "$(dirname "$0")"
export H="${H:-$(mktemp -d)}"
STATUT=$(cd ../.. && npx -y supabase@2 status -o json 2>/dev/null)
lire() { echo "$STATUT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s)['$1']))"; }
export SB_URL=$(lire API_URL) SB_ANON=$(lire ANON_KEY) SB_SERVICE=$(lire SERVICE_ROLE_KEY)
export ICI="$PWD"
[ -d "$H/node_modules/esbuild" ] || npm i --prefix "$H" --no-save --silent esbuild@0.25 >/dev/null
cp build.mjs "$H/build.mjs" && node "$H/build.mjs"
node "$H/essai.mjs"
