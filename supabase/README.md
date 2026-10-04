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
| `migrations/20261004130000_acces_service_role.sql` | droits explicites du rôle `service_role` (fonctions serveur) |
| `migrations/20261004180000_type_donnee_evenements.sql` | type de donnée `evenements` (fichier séparé : une valeur d'énumération n'est utilisable qu'après validation) |
| `migrations/20261004180100_parametres_marche_standard.sql` | étape A : fiche du marché (titulaire, maître d'ouvrage, délai, montant), OS typés, arrêts et reprises, avenants, versions des articles du bordereau, journal des événements et pièces jointes (compartiment `evenements`), règles d'attachement, libellés propres au client, valeurs par défaut de tout nouveau marché |
| `migrations/20261004200000_lots_attachement.sql` | étape B : lots d'attachement (`attachements`, `attachement_lignes`), solde par fuite × article (`v_a_attacher`), détail et récapitulatif (`v_attachement_lignes`, `v_attachement_recap`), `arreter_attachement`, `rouvrir_attachement` |
| `migrations/20261004210000_exports.sql` | étape C : modèles d'export par marché (`modeles_export`, trois par défaut), vue `v_fuites_export` (fuite + dernière réparation, réfection, pièces, quantités) |
| `config.toml` | configuration minimale de la CLI Supabase |
| `functions/gerer-utilisateurs/` | fonction serveur (création des comptes, mot de passe, révocation, rôles), déployée par le workflow |
| `tests/database/01_rls_et_regles.test.sql` | 64 tests pgTAP (isolation, droits, verrou, statuts, prix, re-détection, photos, journal) |
| `tests/database/02_parametres_marche.test.sql` | 49 tests de l'étape A (fiche, versions de prix, avenants, arrêts et délai, événements, libellés du client) |
| `tests/database/03_lots_attachement.test.sql` | 41 tests de l'étape B (solde, brouillons, arrêt, régularisations, anticipation, forçage, réouverture, droits) |
| `tests/database/04_exports.test.sql` | 10 tests de l'étape C (modèles par défaut, droits, vue enrichie) |
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

## Sauvegarde et restauration

Workflow `.github/workflows/sauvegarde-base.yml` : chaque nuit (02:17 UTC) et à la demande, export du
schéma, des données `public` et des comptes `auth`, chiffré (AES-256) puis conservé **30 jours** en
artefact GitHub. Une fois : créer le secret `SAUVEGARDE_PASSPHRASE` (phrase secrète rangée dans le
gestionnaire de mots de passe, copie hors ligne ; jamais dans le dépôt ni dans le chat), puis lancer le
workflow à la main pour valider la première sauvegarde.

Restauration (sur un projet Supabase **vierge**, jamais sur la production sans décision explicite) :
```bash
gpg --decrypt sauvegarde-AAAAMMJJ-HHMM.tar.gz.gpg | tar -xzf -     # schema.sql, donnees_*.sql
psql "$URL_BASE_NEUVE" -f schema.sql
psql "$URL_BASE_NEUVE" -f donnees_auth.sql
psql "$URL_BASE_NEUVE" -f donnees_public.sql
```
**Limites** : les photos (Storage) ne sont pas incluses (copie vers R2 prévue quand la carte bancaire
sera disponible) ; 30 jours de rétention ; test de restauration à faire une fois sur un projet vierge
avant de s'y fier.

## Application « standard » (étape A)

- **Rien de figé pour un client** : libellé et format de la référence client (`masque_reference`,
  « 9 » = un chiffre), jalons du client (communication le jour même, avis avant terrassement,
  validation : `jalons_client`), sigle utilisé dans les écrans, seuils d'alerte, devise.
  Le marché 4500004453 garde ses valeurs (SRM, `999-999-999`, jalons suivis).
- **Fiche du marché** modifiable par le droit « paramètres / modifier » ; code et activation réservés
  à l'administrateur (déclencheur `proteger_marche`).
- **Délai** (`v_delai_marche`) : fin = veille du jour anniversaire (ou date saisie), prolongée des jours
  d'arrêt (arrêt en cours compté jusqu'à aujourd'hui) et des prolongations d'avenant.
- **Bordereau** : un article du bordereau ne se modifie que par une nouvelle ligne de `prix_versions`
  (avenant et / ou motif obligatoire) ; un article hors bordereau se modifie directement, chaque
  modification crée aussi une version. Version 1 = état initial.
- **Événements** : catégories par marché (5 par défaut), suppression logique, pièces jointes dans le
  compartiment privé `evenements` (`<marche_id>/<evenement_id>/<piece_id>.<ext>`, 10 Mo). Droit
  `evenements` ajouté au modèle « responsable » (et aux responsables existants).
- **Nouveau marché** : catégories d'événements et règles d'attachement créées automatiquement.

## Métrés et attachements (étape B) : pas de facture

- **Unité d'œuvre** = une fuite × un article. Solde = exécuté (`lignes_quantites`) − attaché (lots
  arrêtés, lignes « solde » et « anticipation »). Une quantité attachée ne l'est jamais deux fois ; une
  correction faite après l'arrêt réapparaît en **régularisation** (+ ou −) dans le lot suivant.
- **Lot** : brouillon (le responsable coche des unités ; quantités suivies en direct, exports marqués
  « projet ») → `arreter_attachement` (droit « attachements / valider ») : mentions du CPS contrôlées
  selon les règles du marché, quantités et articles figés, numéro attribué, fuites verrouillées.
  Ensuite seuls l'acceptation, la référence de facture et l'observation se modifient (suivi, aucun calcul).
- **Natures de ligne** : `solde` ; `anticipation` (réfection attachée avant exécution, accord du maître
  d'ouvrage, si la règle du marché l'autorise ; la vraie réfection fait la différence) ; `libre` (sans
  fuite : balayage, maintien en attendant le plan du réseau) ; `forcage` (administrateur, hors solde,
  motif obligatoire).
- **Réouverture** : administrateur, dernier lot arrêté seulement, motif obligatoire.
- **Récapitulatif** : quantité du marché, antérieur (lots arrêtés précédents), ce lot, cumul, %.

## Essai local complet (Docker)

Pour tester le panneau sur une vraie pile Supabase (sans toucher à la production) :
`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start -x studio,imgproxy,logflare,vector,realtime,edge-runtime,mailpit,supavisor,postgres-meta`
applique toutes les migrations ; les comptes d'essai se créent avec la clé `service_role` **locale**
affichée par la commande (jamais celle du projet).

## Règles pour les migrations suivantes

- `alter table … enable row level security` juste après chaque `create table`.
- Privilèges accordés explicitement (`grant select, insert, update … to authenticated`) ;
  rien pour `anon` ; pas de `delete` sur les données terrain.
- Toute nouvelle fonction : `revoke execute … from public, anon` puis `grant` ciblé.
- Fonctions SECURITY DEFINER dans `private`, avec `set search_path = ''`.

## Reste à faire (migrations suivantes)

- **M2** : tronçons du réseau (DXF à fournir), balayage coché sur la carte, journées de
  balayage, mesures de débit nocturne, τ1 / τ2 et pénalités de performance.
- **M3** : attachements faits (étape B). Factures, majoration, retenue de garantie, pénalités et
  révision des prix **ne seront pas calculées** (décision d'Issam du 2026-10-04 : facture à la main
  sur Excel à partir des attachements).
- **M4** : traces GPS (un tracé par agent et par jour), notifications push, révision des prix.
