# Chantier v2 : audit de couverture (S8, 2026-10-09)

Relevé sur `main` (69debab, après la PR #70). Pour chaque tâche de `docs/lots/chantier-v2.md` § 1 : fichier, migration ou
test qui la porte. **Fait** = livré et testé ; **partiel** = livré avec un écart noté ; **manquant** = absent.
Les écrans ont été vérifiés par les sessions qui les ont livrées (captures, mode démonstration, essais locaux) ; S8 a relu le code
et rejoué les tests (voir § Vérifications), mais n'a pas rejoué le parcours sur l'émulateur (arrêté, voir § Parcours).

| Code | État | Preuve | Écart |
|---|---|---|---|
| R1 rôle Réfection | fait | migrations `20261009100000`, `100100` (droit `refections`) ; pgTAP 30 ; `web/src/app/(app)/utilisateurs/matrice.ts` ; APK `fiche.tsx` | — |
| R2 rôles par marché, suppression / révocation | fait | `100100` (`supprimer`), `gerer-utilisateurs`, `utilisateurs/page.tsx` ; pgTAP 30 | pas de verrou admin dédié à la suppression (noté par S1) |
| R3 nom et prénom | fait | `100100`, `20261010500000` (issam → BOUSALAM Issam) ; `utilisateurs/page.tsx` | — |
| R4 matricule dans les documents | fait | `100100` ; `web/src/lib/export/matricules.ts` ; `verifier-matricules.mjs` | sans matricule saisi, le nom est gardé ; `v_fuites_export` : chef d'équipe retrouvé par le nom (homonymes → nom) |
| R5 Droits compacts, verrous à part | fait | `utilisateurs/Droits.tsx`, `droits.module.css` ; `verifier-matrice-droits.mjs` (13 vérifications) | script de contrôle recalé par S8 (13 types, dernière contrainte des verrous, 20 modèles) |
| R6 champ Entreprise | fait | `100100` (`profils.entreprise`) ; page Utilisateurs | — |
| R7 corrections du bureau invisibles du terrain | partiel | `v_pieces_terrain` (base), utilisée par `web/.../fuites/[id]/donnees.ts` et `mobile/src/fiche-donnees.ts` | les corrections de champs (adresse, position, dimensions) restent visibles du terrain ; seules les pièces du bureau sont masquées (S1, point 4) |
| V1 validation par étape, « À valider » | fait | `100200` ; web `a-valider/page.tsx`, `fuites/[id]/validation.tsx` ; APK `a-valider.tsx` ; pgTAP 31 (58) | annulation d'une validation permise au droit « valider » (S1, point 2) |
| V2 modifier réparation / réfection | fait | `100200` ; web `form-reparation.tsx`, `form-refection.tsx` ; APK `saisie.tsx`, `modification.ts` ; `verifier-saisie.mjs` | — |
| V3 photos : type, retrait logique | fait | `100200` ; web `fuites/[id]/photos.tsx` ; APK `saisie.tsx` | — |
| V4 photo facultative / obligatoire par étape | **partiel** | avertissement « aucune photo » : web `validation.tsx`, APK `a-valider.tsx` | **pas de réglage « obligatoire » par marché et par étape** (aucune colonne en base) : toujours facultative avec avertissement (S5, point 1). Conforme à la réponse Q6 par défaut |
| V5 corrections du responsable avec motif, saisie différée | fait | `100200` (`motif_modification`, `saisie_differee`) ; web `correction-detection.tsx` + `MiniCarte` ; pgTAP 31 | seuil de saisie différée fixé à 12 h (S1, point 3) |
| V6 ajout après lot arrêté | fait | `100200` (déclencheur sur `attachements`) ; pgTAP 31 et 27 | — |
| V7 réparation dès la détection | fait | pgTAP 31 (cas V7) ; circuit N3 | — |
| F1 champs obligatoires | **fait par S8** | `20261009200000` (contrôle en base) ; web `fuites/nouvelle/page.tsx` ; APK `nouvelle-fuite.tsx` | la liste du marché était **vide** pour SRM et DEMO depuis la PR #65 : rétablie par `20261011900000` (S8), test 25 ajusté |
| F2 nature de dégradation | fait | `20261009200000` (`fuites.nature_degradation_id`) ; web et APK | — |
| F3 suggestions rue et secteur | fait | `20261009200100`, `200110` (3 274 voies OSM) ; pgTAP 26 ; web et APK (`suggestions_localisation`) | — |
| F4 mini-carte, tronçon, diamètre et matériau suggérés | fait | `/mini-carte` (`web/.../carte/MiniCarte.tsx`), `mobile/src/mini-carte.tsx`, contrat `chantier-v2-mini-carte.md` | non vu en conditions réelles (réseau 4G) |
| F5 natures Carrelage, REVSOL, Faïence (+ pavé ciment) | fait | `20261009200000` (arabe compris) ; pgTAP 25 | arabe à relire par Issam |
| P1 formulaire séquentiel | fait | APK `saisie.tsx` ; web `saisie-ui.tsx` | — |
| P2 diamètre selon matériau | fait | `diametres_materiau` ; `ParametresSaisie.tsx` ; APK `parametres.ts` | — |
| P3 pièces en capsules | fait | web `lib/saisie/regles.ts` ; APK `regles.ts` | — |
| P4 récapitulatif | fait | APK `recap.tsx` ; web `saisie-ui.tsx` | — |
| P5 date et heure | fait | APK `date-heure.tsx` ; web formulaires | — |
| P6 gardes-fous | fait | `regles.ts` (web et APK), seuils 10 / 3 / 3 m, longueur de conduite comparée aux deux dimensions de la fouille ; `verifier-saisie.mjs` (17), `regles-saisie.test.mjs` (37) | avertissements seulement |
| P7 représentant SRM | fait | `representants_srm` ; web et APK | — |
| P8 non réparée : terrassement attaché, réfection obligatoire | fait | `20261009200200` ; pgTAP 27 | — |
| P9 total réfections ≥ total fouilles | fait | web `regles.ts` l. 197-200 ; APK `regles.ts` l. 107-110 | avertissement seulement |
| A1 anticipation généralisée | fait | `20261009200200` (`prix.anticipable`, `v_propositions_anticipation`) ; web `PropositionsAnticipees.tsx`, badge `Anticipé`, `tableau-de-bord/Anticipees.tsx` ; pgTAP 27 | case du marché = colonne `refection_anticipee` (nom ancien gardé) |
| N1 cloche | fait | `100300` ; web `_coque/cloche.tsx` ; pgTAP 32 | 30 dernières notifications, sans pagination |
| N2 push Android | **partiel** | `20261010600000`, fonction `envoyer-push`, APK `push.ts`, `notifications.tsx` ; pgTAP 33 | **inactif** : secrets `GOOGLE_SERVICES_JSON` (APK) et `FIREBASE_SERVICE_ACCOUNT` (fonction) absents → APK sans push, fonction « non configurée ». Code prêt |
| N3 circuit de notifications | fait | `100300` + redéfinition `20261009200200` ; pgTAP 32 et 27 | `reparation_saisie` prévient aussi le Responsable (S1, point 1) |
| L1 Kanban 5 colonnes | fait | `fuites/vue-kanban.tsx` ; captures S3 (1366, 1440, 1920) | — |
| L2 tableau dans la largeur | fait | `components/tableau/tableau-donnees.tsx` ; captures S3 | — |
| L3 « Depuis le début du marché » | fait | `tableau-de-bord/Synthese.tsx`, `lib/ui/tableau-de-bord.ts` ; `verifier-tableau-de-bord.mjs` | — |
| C1 carte A4 / A3 portrait | fait | `lib/export/carte-pdf.ts` (`disposerCarte`), `palette.ts` (« jusqu'à ») ; `verifier-carte-pdf.mjs` | — |
| C2 rapport par fuite sans prix, rubriques | fait | `lib/export/rapport-fuite.ts`, `ChoixRubriques.tsx` ; `verifier-rubriques.mjs` | « articles et prix » gardé en rubrique facultative décochée (S3) |
| C3 balayage : un PDF par période | fait | `balayage/rapport.ts` (`telechargerRapportBalayage`) ; `verifier-rapport-journalier.mjs` | non essayé sur une vraie base de balayage (S3) |
| C4 balayage plein écran sur tablette | fait | `carte/page.tsx`, `PanneauReseau.tsx` ; mesures S10 (2,9 s, 60 i/s) | — |
| C5 satellite | **partiel** | `carte/satellite.ts`, mini-carte | **bouton masqué tant que `NEXT_PUBLIC_ESRI_CLE` n'est pas posée sur Vercel** (compte Esri à créer par Issam) |
| X1 sauvegarde | fait | `outils/sauvegarde/`, workflows ; PR #60 | essai de restauration réelle sur un projet neuf jamais fait de bout en bout hors CI |
| X2 mise à jour de l'APK | fait | fonction `version-apk`, `mobile/src/mise-a-jour.tsx`, publication R2 dans `apk.yml` | la mise à jour réelle ne s'installe que sur une APK de production (signée STEPAG) |
| X3 lots P3 / P4 | fait | `20261009300000`, `300100` ; pgTAP 13, 14 ; pages Fournitures, Rapprochement | écart de rapprochement au départ élevé (rien n'est posé) |
| X4 listes en arabe | fait | `libelles_listes` ; APK `listes.ts`, 415 clés de `traductions.ts` | arabe à relire par Issam (V001 à V121) |
| X5 tuiles vectorielles | fait | fonction `reseau-tuiles`, `lib/reseau/tuiles.ts` ; `verifier-tuiles.mjs` (15) | **les tuiles doivent être générées une fois** (Paramètres > Réseau) et la règle CORS R2 avec `Range` posée |
| X6 suivi GPS | fait | `20261011100000` ; pgTAP 34 (57) ; APK `suivi-gps*.ts` ; web `suivi-gps/page.tsx`, `lib/trace-gps.ts` ; essais 42 + `verifier-trace-gps.mjs` | agents à informer avant l'usage ; optimisation batterie Samsung à régler sur chaque tablette |
| X7 exports au choix | fait | `lib/export/rubriques.ts`, `PanneauExport.tsx` | modèles stockés dans `modeles_export` sans colonne dédiée (S3) |
| X8 envoi Dolibarr → Supabase | **reporté** (prévu) | `importer_mouvements_dolibarr` prête (S9), import CSV livré | tâche planifiée côté serveur Dolibarr à faire après S8 |

## Doublons et recoupements des PR APK (#53, #54, #56, #57, #58)

Pas de code mort ni de double chemin : après fusion, le démarrage hors ligne passe par **un seul module**,
`mobile/src/session-donnees.ts` (lecture de la session stockée, départ à 1,5 s, jeton à renouveler, contexte gardé), consommé par
`session.tsx`. Les délais réseau sont dans `reseau.ts` (PR #51) et le plugin OkHttp `mobile/plugins/okhttp-delais.js` (PR #53) :
deux couches complémentaires (JS puis socket natif), pas un doublon. La #54 (correctif partiel) a été fusionnée avant la #56 et
remplacée par elle (conflit résolu en gardant la #56). Les 52 vérifications de `session-hors-ligne.test.mjs` couvrent #56, #57 et #58.
Écart de documentation : `docs/etat-avancement.md` décrivait encore ces PR comme « à fusionner » ; corrigé.

## Vérifications rejouées par S8

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit` panneau et APK | 0 erreur |
| `next build` du panneau (variables factices de la CI) | OK |
| Scripts `web/scripts/verifier-*.mjs` (16) | 16 verts ; `verifier-matrice-droits` était en échec sur `main` (hors CI) et a été recalé |
| Essais APK sans pile (`essais/*.test.mjs`) | file d'attente 49, session hors ligne 52, règles de saisie 37, suivi GPS 42 : 0 échec |
| pgTAP (PostgreSQL 17 + PostGIS, 25 fichiers, migrations jusqu'à `20261011900000`) | **1 055 vérifications, 0 échec** (pg_cron et pg_net absents en local, comme en CI) |
| Dictionnaire arabe | `t()` n'accepte que les clés du dictionnaire (typé) ; les 415 clés existent, aucun appel `t('…')` du code n'est absent |
| CI de `main` (69debab) | Base de données, Panneau web, APK et « Déploiement de la base » : tous verts |

## Parcours détection → validation → réparation → réfection → lot sur l'émulateur

**Non rejoué** : aucun émulateur démarré pendant la session (`adb devices` vide). Le parcours est couvert par les tests de base
(pgTAP 27, 31, 32 : circuit, notifications, validation, lot) et les essais de l'APK, pas par un essai d'écran de l'APK de `main`.
L'APK de la CI de `main` (artefact `suivi-fuites-apk`, 22,7 Mo, signée STEPAG) reste à installer : désinstaller d'abord l'ancienne
APK signée avec la clé de test d'Expo.
