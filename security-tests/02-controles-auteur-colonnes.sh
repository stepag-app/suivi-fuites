#!/usr/bin/env bash
# Familles §3.2 / §3.4 / §3.3 — contrôles d'auteur manquants, colonnes sensibles,
# RPC à effet global. Rejoue chaque exploit à l'identité la plus basse possible et
# vérifie que la RLS/les déclencheurs le refusent APRÈS le correctif (migration
# 20261017100000). Les cas « légitime » prouvent l'absence de régression.
# Banc : voir security-tests/_bench.sh. ATTENDU vs OBTENU.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/_forge.sh"

attendu_refus() { # $1=libellé $2=identité $3=sql — doit lever une exception
  local out; out="$(af_as "$2" "$3")"
  if echo "$out" | grep -qiE 'ERROR|exception|insufficient_privilege|check_violation|non autoris'; then
    echo "  [OK  REFUS] $1"
  else echo "  [ÉCHEC] $1 — l'action est PASSÉE (attendu: refus)"; echo "$out" | sed 's/^/        /' | head -3; ECHECS=$((ECHECS+1)); fi
}
attendu_succes() { # action légitime — ne doit PAS lever
  local out; out="$(af_as "$2" "$3")"
  if echo "$out" | grep -qiE 'ERROR|exception|insufficient_privilege|check_violation'; then
    echo "  [ÉCHEC] $1 — refusée alors qu'elle est légitime (régression)"; echo "$out" | sed 's/^/        /' | head -3; ECHECS=$((ECHECS+1))
  else echo "  [OK  PASSE] $1"; fi
}
ECHECS=0
TR='70000000-0000-4000-8000-0000000000a1'
REP_OWN_DET='d0000000-0000-4000-8000-0000000000a1'   # réparation de detection_A
REP_OWN_REP='d0000000-0000-4000-8000-0000000000a2'   # réparation de reparation_A
OUV='01000000-0000-4000-8000-0000000000a1'
FUITE_A='f1000000-0000-4000-8000-0000000000a1'

echo "### §3.4 balayages.agent_id — usurpation de la production terrain (base du prix 1)"
attendu_refus "detection_A crée un balayage au nom de resp_A" "$AF_DET_A" \
  "insert into public.balayages (marche_id,troncon_id,agent_id) values ('$AF_MARCHE_A','$TR','$AF_RESP_A');"
attendu_succes "detection_A crée un balayage pour LUI-MÊME" "$AF_DET_A" \
  "insert into public.balayages (marche_id,troncon_id) values ('$AF_MARCHE_A','$TR');"
attendu_succes "resp_A (valider) crée un balayage au nom de detection_A" "$AF_RESP_A" \
  "insert into public.balayages (marche_id,troncon_id,agent_id) values ('$AF_MARCHE_A','$TR','$AF_DET_A');"

echo "### §3.4 photos.auteur_terrain_id — usurpation d'auteur"
attendu_refus "detection_A dépose une photo au nom de resp_A" "$AF_DET_A" \
  "insert into public.photos (marche_id,fuite_id,type,chemin,stockage,auteur_terrain_id) values ('$AF_MARCHE_A','$FUITE_A','avant','x/y/z.jpg','supabase','$AF_RESP_A');"
attendu_succes "detection_A dépose une photo pour LUI-MÊME" "$AF_DET_A" \
  "insert into public.photos (marche_id,fuite_id,type,chemin,stockage) values ('$AF_MARCHE_A','$FUITE_A','avant','x/y/z2.jpg','supabase');"

echo "### §3.4 reparation_ouvriers — ajout/retrait sur la réparation d'autrui"
attendu_refus "reparation_A ajoute un ouvrier sur la réparation de detection_A" "$AF_REP_A" \
  "insert into public.reparation_ouvriers (marche_id,reparation_id,ouvrier_id) values ('$AF_MARCHE_A','$REP_OWN_DET','$OUV');"
attendu_succes "reparation_A ajoute un ouvrier sur SA PROPRE réparation" "$AF_REP_A" \
  "insert into public.reparation_ouvriers (marche_id,reparation_id,ouvrier_id) values ('$AF_MARCHE_A','$REP_OWN_REP','$OUV');"
attendu_succes "resp_A (toutes) ajoute un ouvrier sur la réparation de detection_A" "$AF_RESP_A" \
  "insert into public.reparation_ouvriers (marche_id,reparation_id,ouvrier_id) values ('$AF_MARCHE_A','$REP_OWN_DET','$OUV');"

echo "### §3.3 activer_produits_dolibarr — effet GLOBAL réservé à l'admin"
attendu_refus "resp_A active un produit Dolibarr (effet tous marchés)" "$AF_RESP_A" \
  "select public.activer_produits_dolibarr(array[9991]::int[], true);"
attendu_succes "admin active un produit Dolibarr" "$AF_ADMIN" \
  "select public.activer_produits_dolibarr(array[9991]::int[], true);"

echo "### §3.8 Storage photos — dépôt dans le dossier d'une fuite inexistante/d'autrui"
attendu_refus "detection_A dépose un objet sous une fuite inexistante de son marché" "$AF_DET_A" \
  "insert into storage.objects (bucket_id,name) values ('photos','$AF_MARCHE_A/99999999-9999-4999-8999-999999999999/x.jpg');"
attendu_succes "detection_A dépose un objet sous une VRAIE fuite de son marché" "$AF_DET_A" \
  "insert into storage.objects (bucket_id,name) values ('photos','$AF_MARCHE_A/$FUITE_A/ok.jpg');"

echo "### §3.6 est_affecte — un agent désactivé n'est plus une cible de saisie à la place"
attendu_refus "resp_A attribue une fuite à inactif_A (compte désactivé)" "$AF_RESP_A" \
  "insert into public.fuites (marche_id,auteur_terrain_id) values ('$AF_MARCHE_A','$AF_INACTIF_A');"

echo
[ "$ECHECS" -eq 0 ] && echo "✅ TOUS LES CAS PASSENT (exploits refusés, usages légitimes OK)" || echo "❌ $ECHECS ÉCHEC(S)"
exit $([ "$ECHECS" -eq 0 ] && echo 0 || echo 1)
