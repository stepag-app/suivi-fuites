# État d'avancement et passation entre sessions

> À lire en début de chaque session, avec `CLAUDE.md` et `supabase/README.md`.
> Mettre à jour en fin de session (fait, en attente, décisions).

Dernière mise à jour : 2026-10-04.

## 1. Fait

| Élément | Où | État |
|---|---|---|
| Règles du marché 4500004453 extraites des documents (CPS, bordereau, définition des prix, attachement 2017, fiches, plans) | `references/regles-marche-4500004453.md` | sur `main` |
| Plan du schéma v4 validé par Issam | conversation du 2026-10-04 ; résumé dans `supabase/README.md` | validé |
| Migration 1 : noyau, droits par marché, fuites, interventions, prix, photos, journal, RLS, vues, données du marché | `supabase/migrations/` | PR n° 1 ; CI verte |
| 61 tests pgTAP + CI GitHub | `supabase/tests/`, `.github/workflows/base-de-donnees.yml` | verts |
| Déploiement par GitHub Actions | `.github/workflows/deployer-base.yml` | prêt ; attend les secrets |

## 2. En attente d'Issam

1. **Secrets GitHub** `SUPABASE_ACCESS_TOKEN` et `SUPABASE_DB_PASSWORD` (voir `supabase/README.md`,
   « Appliquer au projet Supabase »), puis fusion de la PR n° 1 → déploiement automatique sur le
   projet `osajiinsibwrsltntmsk` (STEPAG / suivi-fuites, West EU Paris, plan gratuit).
2. **Premier compte administrateur** après le déploiement (étapes 3 et 4 du README Supabase).
3. **Plan du réseau `Reseau aep oujda.dwg`** (162,8 Mo) : sera transmis plus tard. Voir § 4.
4. **Relecture** des libellés arabes (motifs, natures de réfection) et du découpage des 34 secteurs.

## 3. Décisions prises (à respecter)

- Supabase gratuit pour l'instant ; aucune sauvegarde automatique → backup maison à prévoir (M3/M4).
- Bordereau « à majoration » : quantités × prix du bordereau, majoration (15 %) appliquée au total
  de la facture, taux figé à l'émission.
- Fuites signalées par la SRM : réparées et payées comme celles de STEPAG (`origine = 'srm'`).
- Pas de compte SRM : les jalons SRM (communication, validation, avis avant terrassement) sont
  saisis par STEPAG.
- Balayage : l'agent coche le réseau parcouru sur la carte ; le responsable exporte les points
  balayés. Mesures de débit nocturne saisies par le responsable.
- Rapports journaliers : au choix par équipe et secteur, ou par jour regroupé (Q-34).
- Numérotation unique des fuites par marché (Q-35).
- Pièces : catalogue seulement, sans stock ; quantités posées filtrables par secteur, période,
  équipe (Q-37, vue `v_pieces_posees`).
- Photos facultatives, alerte si aucune.
- Sondage négatif payé en terrassement (hypothèse Q-08, réglable : `motifs.terrassement_paye`).

## 4. Emplacement réservé : plan du réseau (DWG → DXF → tronçons)

**Statut : en attente du fichier.** Ne pas démarrer la migration 2 sans lui.

Ce qu'il faut obtenir d'Issam :
- `Reseau aep oujda.dwg` exporté en **DXF** (AutoCAD « Enregistrer sous » ou ODA File Converter) ;
- le **système de coordonnées** du dessin (probablement Lambert Nord Maroc, EPSG:26191, à
  confirmer) ou 3 à 4 points connus (coordonnées plan + GPS) pour le caler ;
- la **liste des calques** (lesquels portent les conduites, diamètres, matériaux, branchements).

Règles : le DWG et le DXF ne vont **jamais** dans le dépôt (données sensibles, taille ;
`data-private/` et `planches/` sont ignorés par git). Seul un résultat converti et allégé
(GeoJSON ou SQL des tronçons en WGS84) peut être importé dans Supabase.

Piste de conversion (à décider à la prochaine session) : session Claude Code **locale** sur le Mac,
`brew install gdal`, puis `ogr2ogr` (DXF → GeoJSON, reprojection EPSG:26191 → EPSG:4326, filtre
des calques réseau), contrôle visuel sur une carte, import dans la table `troncons`.

Ce que la migration 2 construira ensuite : `troncons` (LineString PostGIS, secteur, diamètre,
matériau, longueur), `balayage_troncons` (un tronçon payé une seule fois, prix 1), `journees_balayage`
(équipe, secteur, date, linéaire, cadence ≥ 4 km/jour/équipe), `mesures_debit` (campagnes avant /
après / maintien, 3 nuits) et vues de performance (Qi, Qf, ΔQ, τ1, τ2, pénalités, arrêt de zone).
Le droit `balayage` et le droit `mesures_debit` existent déjà dans `type_donnee`.

## 5. Prochaines étapes proposées

1. Déploiement de la migration 1 et premier administrateur (Issam).
2. Edge Function de création des comptes agents (identifiant + mot de passe, révocation),
   `service_role` côté serveur uniquement.
3. Panneau web (Vercel) : connexion, gestion des utilisateurs et des droits, liste des fuites,
   alertes, quantités, anomalies.
4. Application tablette (Expo) : connexion, signalement avec GPS et photo, liste, réparation,
   réfection, mode hors ligne léger.
5. Migration 2 dès réception du DXF ; migration 3 (attachements, factures, pénalités, exports).

## 6. Prompt pour démarrer une nouvelle session

```text
Lis CLAUDE.md, docs/etat-avancement.md et supabase/README.md.
Contexte : la migration 1 (schéma Supabase, RLS, données du marché 4500004453) est écrite et testée
(61 tests pgTAP, CI verte). Vérifie d'abord l'état réel : PR n° 1 fusionnée ou non, résultat du
workflow « Déploiement de la base », secrets présents.
Le plan DWG du réseau n'est pas encore disponible : ne commence pas la migration 2.
Objectif de cette session : [à préciser, par ex. « Edge Function de création des comptes et
squelette du panneau web Next.js sur Vercel »].
Travaille en français, sur une branche dédiée avec une PR en brouillon ; ne touche pas au projet
Supabase de production sans mon accord explicite ; aucun secret dans le dépôt ni dans le chat.
Mets à jour docs/etat-avancement.md en fin de session.
```
