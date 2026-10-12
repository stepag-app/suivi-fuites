# Purge de mise en service (S22, Z3)

Demande d'Issam du 2026-10-12 : avant le premier jour réel de détection sur le marché SRM-4500004453, effacer
toutes les fuites et tous les balayages d'essai, et supprimer le marché DEMO. Le SRM garde son paramétrage
(bordereau, zones, secteurs, réseau et tuiles, fond de carte, motifs, ouvriers, articles), ses comptes et ses droits.

## Fichiers

| Fichier | Rôle |
|---|---|
| `inventaire.sql` | nombres de lignes par table et par marché, fichiers de Storage, détails utiles (lecture seule) |
| `purger.sql` | la purge de la base, en une transaction, avec garde-fous et contrôles finaux |
| `purge.sh` | `inventaire`, `base`, `fichiers` (Supabase Storage et R2) ; appelé par le workflow |
| `.github/workflows/purge-mise-en-service.yml` | inventaire sur PR ou à la demande ; purge précédée d'une sauvegarde complète |
| `supabase/tests/database/51_purge_mise_en_service.test.sql` | test pgTAP de `purger.sql` |

## Ce qui est effacé

- **Les deux marchés** : fuites, réparations, pièces posées, ouvriers des réparations, réfections, quantités,
  photos (lignes et fichiers), lots d'attachement et leurs lignes, notifications liées aux fuites, balayages ;
  historique de ces saisies dans le journal.
- **SRM** : numérotation remise à zéro (prochaine fuite N° 1, prochain lot N° 1) ; secteurs remis à « À balayer »,
  date d'achèvement du balayage des zones effacée. Selon les réglages du workflow (`EFFACER_*`, `GARDER_*`) : suivi
  GPS (tracés, pauses, états), débits de nuit (campagnes, mesures, procès-verbaux ; points de mesure gardés),
  événements particuliers et leurs pièces jointes, journal des e-mails, notifications sans fuite.
- **DEMO** : tout (paramétrage, réseau, secteurs, droits, affectations, journal), puis le marché ; dans R2 ses
  photos, `reseau/<DEMO>/` et `fonds/<DEMO>/`. Avec `AFFECTER_AGENTS_DEMO=oui`, un agent affecté à DEMO seulement
  reçoit d'abord les mêmes rôles et droits sur le SRM.

## Ce qui reste

Comptes (`auth.users`, `profils`), affectations et droits du SRM, paramétrage du SRM, `troncons` et `noeuds`,
`reseau/<SRM>/reseau.pmtiles` et `fonds/<SRM>/fond.pmtiles` dans R2, articles Dolibarr et mouvements de stock
(tables communes à tous les marchés), tablettes (`codes_tablette`, `journal_tablettes`), appareils push, rues,
libellés, historique du paramétrage et des comptes. Les sauvegardes (R2 `sauvegardes/`, Google Drive) ne sont pas
touchées : les photos effacées y restent.

## Lancer

1. Actions › **Purge de mise en service** › Run workflow (branche `main`) › `inventaire` : lire le résumé.
2. Accord d'Issam sur l'inventaire.
3. Run workflow › `purger`, confirmation `PURGER DEMO ET ESSAIS` : sauvegarde complète (base chiffrée, R2, Drive),
   puis purge de la base (une transaction : tout ou rien), puis fichiers, puis inventaire après.
4. Si seule l'étape des fichiers a échoué : `fichiers` avec la même confirmation.

**Seconde passe** (2026-10-12 soir) : DEMO déjà supprimé, la purge se relance telle quelle (mêmes réglages, même
confirmation) ; les étapes de DEMO sont sans effet, un second résumé est ajouté au journal du SRM.

Avant : aucune saisie en attente sur les tablettes (ouvrir l'appli avec du réseau). Après : ouvrir une fois la
carte de balayage avec du réseau sur chaque tablette (l'état de balayage gardé sur l'appareil est relu).
