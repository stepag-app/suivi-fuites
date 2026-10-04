# État d'avancement et passation entre sessions

> À lire en début de chaque session, avec `CLAUDE.md` et `supabase/README.md`.
> Mettre à jour en fin de session (fait, en attente, décisions).

Dernière mise à jour : 2026-10-04 (fin de journée).

## 1. Fait

| Élément | Où | État |
|---|---|---|
| Règles du marché 4500004453 extraites des documents | `references/regles-marche-4500004453.md` | sur `main` |
| Migration 1 : schéma, droits, RLS, vues, données du marché (13 prix, 5 zones, 34 secteurs, 261 pièces) | `supabase/migrations/` | **déployée** sur le projet `osajiinsibwrsltntmsk` |
| 61 tests pgTAP + CI | `supabase/tests/`, `.github/workflows/base-de-donnees.yml` | verts |
| Déploiement automatique des migrations et de la fonction à chaque fusion dans `main` | `.github/workflows/deployer-base.yml` | opérationnel (secrets créés) |
| Compte administrateur `issam` (`issam@agents.stepag.ma`) | Supabase Auth | créé et **vérifié** (`issam | true | true`) |
| Réglages Auth Supabase : fournisseur e-mail activé, « Confirm email » désactivé | tableau de bord Supabase | vérifié sur captures (2026-10-04) |
| Fonction serveur de gestion des comptes | `supabase/functions/gerer-utilisateurs/` | écrite, compilée ; déployée par le workflow à la fusion |
| Panneau web + mode terrain (Next.js) | `web/` (voir `web/README.md`) | écrit, compilé, requêtes validées contre PostgREST (28 contrôles) ; **à mettre en ligne sur Vercel** |

## 2. En attente d'Issam

1. **Inscriptions publiques** : *Authentication > Sign In / Providers > User Signups* : désactiver « Allow new users to sign up » puis Save changes (les comptes sont créés par la fonction serveur, qui n'en a pas besoin). Sinon n'importe qui peut créer un compte avec la clé publique.
2. **Vercel** (équipe STEPAG) : importer le dépôt avec *Root Directory* `web` et les deux variables `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (procédure dans `web/README.md`).
3. **Premier test** : se connecter en `issam`, créer un agent dans « Utilisateurs », signaler une fuite avec photo sur la tablette.
4. **Plan du réseau `Reseau aep oujda.dwg`** : sera transmis plus tard. Voir § 4.
5. **Relecture** des libellés arabes (motifs, natures de réfection) et du découpage des 34 secteurs.

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

1. Retours du premier test terrain (parcours connexion → fuite → réparation → réfection).
2. À ajouter dans le panneau selon les retours : paramètres (ouvriers, équipes, prix hors bordereau,
   motifs), carte des fuites, anomalies, journal, interface en arabe / mixte, exports PDF et Word.
3. Application tablette Expo (APK) avec mode hors ligne léger et suivi GPS, si le test navigateur
   montre ses limites (réseau coupé, batterie, photos).
4. Migration 2 dès réception du DXF ; migration 3 (attachements, factures, pénalités, exports).

## 6. Prompt pour démarrer une nouvelle session

```text
Lis CLAUDE.md, docs/etat-avancement.md et supabase/README.md.
Contexte : la migration 1 est déployée, le panneau web `web/` et la fonction `gerer-utilisateurs`
sont écrits. Vérifie d'abord l'état réel : dernier déploiement (workflow « Déploiement de la base »),
projet Vercel en ligne ou non, retours de test d'Issam.
Le plan DWG du réseau n'est pas encore disponible : ne commence pas la migration 2.
Objectif de cette session : [à préciser : corriger les retours du premier test, puis la prochaine
fonctionnalité].
Travaille en français, sur une branche dédiée avec une PR en brouillon ; ne touche pas au projet
Supabase de production sans mon accord explicite ; aucun secret dans le dépôt ni dans le chat.
Mets à jour docs/etat-avancement.md en fin de session.
```
