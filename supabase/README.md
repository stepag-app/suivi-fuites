# Base de données Supabase : migration 1 (noyau)

Schéma validé par Issam (plan v4). Rien n'est appliqué au projet Supabase tant
qu'Issam ne l'a pas lancé lui-même (voir « Appliquer »).

## Contenu

| Dossier / fichier | Rôle |
|---|---|
| `migrations/20261004090000_fondations.sql` | PostGIS, schéma `private`, types (statuts, rôles, familles de prix…), privilèges par défaut retirés |
| `migrations/20261004090100_noyau_droits.sql` | marchés, profils, affectations, droits CRUD, modèles de rôles, journal, fonctions de sécurité |
| `migrations/20261004090200_parametres_marche.sql` | zones, secteurs, phases, équipes, ouvriers, prix, natures de réfection, motifs, catalogue de pièces, ordres de service |
| `migrations/20261004090300_fuites_interventions.sql` | fuites, réparations, réfections, pièces posées, lignes de quantités, photos ; numérotation, statuts automatiques, verrou, lignes de prix automatiques |
| `migrations/20261004090400_rls_privileges.sql` | règles RLS et privilèges, table par table |
| `migrations/20261004090500_vues_fonctions.sql` | vues `v_fuites` (alertes), `v_pieces_posees`, `v_quantites`, `v_anomalies` ; fonction `rechercher_fuites_proches` |
| `migrations/20261004090600_stockage_photos.sql` | compartiment privé `photos` et ses règles |
| `migrations/20261004090700_donnees_marche_4500004453.sql` | marché SRM Oriental : 13 prix, 5 zones, 34 secteurs, phases, OS, natures, motifs FR/AR, 261 pièces ; contrôle des totaux |
| `config.toml` | configuration minimale de la CLI Supabase |
| `functions/gerer-utilisateurs/` | fonction serveur (création des comptes, mot de passe, révocation, rôles), déployée par le workflow |
| `tests/database/01_rls_et_regles.test.sql` | 64 tests pgTAP (isolation, droits, verrou, statuts, prix, re-détection, photos, journal) |
| `ci/` | simulateur Supabase et script de test pour la CI GitHub (ne jamais appliquer au projet) |

## Ce que fait le schéma

- **Multi-marchés** : toutes les données portent `marche_id`. Les clés étrangères composites
  `(id, marche_id)` empêchent de rattacher une donnée à un paramètre d'un autre marché.
- **Droits** : table `droits` (utilisateur × marché × type de donnée) avec lire / créer /
  modifier (non, siennes, toutes) / supprimer (non, siennes, toutes) / valider.
  Les modèles `detection`, `chef_reparation`, `responsable` s'appliquent avec
  `appliquer_modele_role(profil, marché, rôle)` et se cumulent. L'administrateur
  (`profils.est_admin`) voit et fait tout.
- **« Siennes »** : la ligne a été faite sur le terrain (`auteur_terrain_id`) ou saisie
  (`saisi_par`) par l'utilisateur. Le responsable peut saisir à la place d'un chef absent :
  `saisi_par` = responsable, `auteur_terrain_id` = chef, `source_saisie` = papier / web.
- **Suppression** : jamais physique ; `supprime_le` rempli si l'utilisateur a le droit
  « supprimer ». Tout est tracé dans `journal` (qui, quand, valeurs avant / après).
- **Verrou** : le responsable (droit « valider ») verrouille une fuite validée ; ni elle ni ses
  réparations, réfections, photos ou quantités ne changent ensuite, sauf par un responsable.
- **Statut automatique** (avance seulement ; le responsable peut le changer à la main) :
  réparation « en cours » → `en_reparation` ; « réparée » → `reparee` (ou `achevee` si terrain
  naturel) ; « non réparée » + motif → `sans_reparation` ; réfection faite ou close sans
  réfection (motif obligatoire) → `achevee`.
- **Lignes de prix proposées automatiquement** (règle R-DER-007), corrigeables par le
  responsable (une ligne corrigée passe en « manuel » et n'est plus recalculée) :
  terrassement L × l × P → prix 3 ; réfection L × l (reprise de la fouille) → prix 4 ou 5
  selon la nature ; tuyau PE DE < 40 → 6, ≥ 40 → 9 ; robinet PEC → 7 ; collier PEC → 8 ;
  bouche à clé seule → 10 ; AC / PVC selon DN → 11, 12, 13 ; DN > 315, fonte, acier →
  aucun prix, signalé dans `v_anomalies`. Au plus une unité par prix et par fuite (paramètre).
  Montants au prix du bordereau ; la majoration (15 %) s'appliquera au total de la facture
  (migration 3).
- **Alertes** (`v_fuites`) : non réparée après 48 h, non communiquée à la SRM le jour même,
  réfection chaussée à J+20 et hors délai à J+30, réfection trottoir, fuite sans photo.
  Seuils paramétrables dans `marches`.

## Appliquer au projet Supabase

Le déploiement passe par GitHub Actions (`.github/workflows/deployer-base.yml`) : aucun
mot de passe sur un poste ni dans une conversation.

1. **Une seule fois, créer deux secrets** dans GitHub : *Settings > Secrets and variables >
   Actions > New repository secret* :
   - `SUPABASE_ACCESS_TOKEN` : jeton créé dans Supabase, *Account (avatar) > Access Tokens >
     Generate new token* ;
   - `SUPABASE_DB_PASSWORD` : mot de passe de la base (gestionnaire de mots de passe ; s'il est
     perdu : *Project Settings > Database > Reset database password*).
2. **Déployer** : fusionner la PR dans `main` (déploiement automatique), ou *Actions >
   Déploiement de la base > Run workflow*. Le workflow rejoue les tests, affiche les
   migrations à appliquer (`--dry-run`), les applique, puis liste l'état du projet.
   Les migrations déjà appliquées ne sont jamais rejouées.
3. **Premier administrateur** : *Authentication > Users > Add user > Create new user* avec
   l'adresse technique `issam@agents.stepag.ma`, un mot de passe, « Auto Confirm User » coché.
   Le profil `issam` est créé automatiquement. Puis dans *SQL Editor* :
   `update profils set est_admin = true where identifiant = 'issam';`
4. *Authentication > Sign In / Providers > Email* : désactiver « Confirm email » (les agents
   se connectent avec un identifiant ; l'adresse `<identifiant>@agents.stepag.ma` reste interne).

Sans GitHub, depuis le Mac : `brew install supabase/tap/supabase`, puis dans le dépôt
`supabase link --project-ref osajiinsibwrsltntmsk` et `supabase db push`.

Les comptes des agents seront créés depuis le panneau web par une Edge Function
(clé `service_role` côté serveur uniquement), prochaine étape.

## Tests

- Automatiques : la CI GitHub (`.github/workflows/base-de-donnees.yml`) rejoue migrations
  et tests à chaque modification de `supabase/` ; le déploiement les rejoue aussi avant d'envoyer.
- Sur le Mac avec Docker : `supabase start` puis `supabase test db`.

## Règles pour les migrations suivantes

- `alter table … enable row level security` juste après chaque `create table`.
- Privilèges accordés explicitement (`grant select, insert, update … to authenticated`) ;
  rien pour `anon` ; pas de `delete` sur les données terrain.
- Toute nouvelle fonction : `revoke execute … from public, anon` puis `grant` ciblé.
- Fonctions SECURITY DEFINER dans `private`, avec `set search_path = ''`.

## Reste à faire (migrations suivantes)

- **M2** : tronçons du réseau (DXF à fournir), balayage coché sur la carte, journées de
  balayage, mesures de débit nocturne, τ1 / τ2 et pénalités de performance.
- **M3** : attachements (mensuels et contractuels), 3 factures, majoration au total,
  retenue de garantie, pénalités, exports.
- **M4** : traces GPS (un tracé par agent et par jour), notifications push, révision des prix.
