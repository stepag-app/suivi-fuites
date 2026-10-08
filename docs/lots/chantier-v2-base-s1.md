# Chantier v2 : contrat de base S1 (comptes, rôles, validation, notifications)

> Publié par la session S1 pour la vague 2 (S5 panneau fiche et validation, S6 comptes et cloche, S7 APK, S10).
> Source des règles : `docs/lots/chantier-v2.md` (§ 1 R, V, N ; § 6 réponses d'Issam). Migrations
> `supabase/migrations/20261009100000` à `20261009100300` ; tests `supabase/tests/database/30_s1_*`, `31_s1_*`, `32_s1_*`.
> Toutes les règles ci-dessous sont **vérifiées en base** : l'écran les reflète (bouton grisé, message), il ne les remplace pas.

## 1. Rôles et droits (R1)

| Valeur (`affectations.roles`, `modeles_droits.role`) | Libellé à afficher |
|---|---|
| `detection` | Détection |
| `chef_reparation` | Réparation |
| `refection` | Réfection (**nouveau**) |
| `responsable` | Responsable |
| `profils.est_admin` | Administrateur (hors rôles) |

- Rôles cumulables. Nouveau **type de donnée `refections`** (enum `type_donnee`) : les réfections ne relèvent plus de
  `interventions` (qui couvre désormais réparations, pièces posées, ouvriers de la réparation).
- Reprise : les droits `interventions` de chaque compte ont été recopiés sur `refections` ; les comptes `chef_reparation`
  ont reçu aussi `refection`. Rien n'a changé pour eux.
- Modèles :

| Rôle | fuites | interventions | refections | photos | balayage |
|---|---|---|---|---|---|
| detection | lire, créer, modifier siennes | lire | lire | lire, créer, modifier / supprimer siennes | lire, créer, supprimer siennes |
| chef_reparation | lire, créer, modifier siennes | lire, créer, modifier siennes | lire | lire, créer, modifier / supprimer siennes | — |
| refection | lire | lire | lire, créer, modifier siennes | lire, créer, modifier / supprimer siennes | — |
| responsable | tout + valider | tout + valider | tout + valider | tout + valider | tout |

- Matrice (S3 / S6) : ajouter la ligne « Réfections » (`refections` : lire, créer, modifier, supprimer, valider) ;
  `enregistrer_droits` l'accepte déjà. Verrou de l'administrateur possible sur `refections` (`verrous_admin`).
- Côté écran, « saisir une réfection » = `peut('refections', 'creer')` (et non plus `interventions`).

## 2. Comptes (R2, R3, R4, R6)

Colonnes de `profils` (écriture : administrateur ; l'agent ne change que `langue`) :

| Colonne | Règle |
|---|---|
| `nom`, `prenom` | facultatifs ; dès qu'un des deux est saisi, `nom_complet` devient « NOM Prénom » (ex. `BOUSALAM Issam`) |
| `matricule` | facultatif, nettoyé, **unique sans distinction de casse** ; à imprimer à la place du nom (R4, S6) |
| `entreprise` | `STEPAG` par défaut (vide → `STEPAG`) ; sous-traitant sinon |

`ouvriers.matricule` : unique par marché. La fonction serveur `gerer-utilisateurs` (action `creer`) accepte `nom`,
`prenom`, `matricule`, `entreprise` (repris par le déclencheur de création du profil).

Fonctions (administrateur connecté) :

```ts
// Rôles d'un compte dans un marché : la liste remplace l'ancienne ; [] = retiré du marché (affectation inactive, droits effacés).
await sb.rpc('modifier_roles', { p_profil: id, p_marche: marcheId, p_roles: ['chef_reparation', 'refection'] });
// Rôle ajouté : modèle fusionné. Rôle retiré : un droit que seul ce rôle accordait redescend au niveau des rôles restants
// (un droit ajouté à la main que le rôle retiré n'accordait pas est gardé). Refusé pour un administrateur (23514).

// Bouton « Supprimer » : grisé avec la raison si non supprimable.
const { data } = await sb.rpc('compte_supprimable', { p_profil: id });
// → { supprimable: false, raison: 'Ce compte a des saisies (fuites : 2, journal : 5) : révocation seulement',
//     saisies: { fuites: 2, journal: 5 } }

// Suppression : par la fonction serveur (la base refuse encore si une saisie existe ; 409 + raison).
await sb.functions.invoke('gerer-utilisateurs', { body: { action: 'supprimer', profil_id: id } });
// Révocation : inchangée (action « activer », actif = false).
```

« Saisie » = toute ligne qui désigne le compte par une clé étrangère vers `profils` (auteur, saisie, validation, verrou,
correction, suppression, balayage, lot…) et toute ligne du journal écrite par lui. Ne comptent pas : son profil, ses
affectations, droits, verrous, notifications, appareils, ni le changement de sa propre langue. Une table ajoutée plus
tard avec une clé vers `profils` est comptée d'office. Un administrateur ou son propre compte : jamais supprimable.

## 3. Corrections du bureau invisibles du terrain (R7)

- **Bureau** = administrateur, ou droit `interventions / valider` ou `quantites / lire` sur le marché (`private.marches_bureau()`).
- `reparation_pieces` : une pièce de provenance `correction` (oubli, remplacement par le bureau) n'est **lue que par le
  bureau** (RLS). Lignes de quantités, requalifications et lots : déjà réservés (`quantites`, `attachements`).
- `v_pieces_terrain` (lecture, droits de l'appelant) : la déclaration du terrain, telle que l'équipe l'a saisie : une
  pièce remplacée ou retirée par le bureau y figure normalement ; une pièce que l'auteur a lui-même remplacée ou retirée
  n'y figure plus. Colonnes : `id, marche_id, reparation_id, fuite_id, produit_id, designation, famille, unite, quantite,
  saisi_par, cree_le`. **APK et fiche pour le terrain : lire cette vue** (pas `etat`, ni `v_pieces_posees`).
- Les corrections de champs (adresse, position, dimensions…) restent visibles de tous : la valeur affichée est la valeur
  corrigée (utile au terrain, ex. position déplacée). Ancienne valeur : journal.

## 4. Validation par étape (V1 à V7)

Étapes : **détection** = la fuite (`fuites`), chaque **réparation**, chaque **réfection**. Colonnes ajoutées aux trois
tables : `validee_le`, `validee_par` (posées par la base). Droit requis pour valider : `valider` du type de donnée
(`fuites`, `interventions`, `refections`).

| Règle | En base |
|---|---|
| Valider | `valider_etapes` (ci-dessous) ou `update … set validee_le = now()` ; date et auteur posés par la base ; une validation existante n'est jamais réécrite ; `validee_le = null` annule (droit « valider », journalisé) |
| Valider dès la création | insertion avec `validee_le` non nul par un compte qui peut valider (« Enregistrer et valider ») ; sinon ignoré |
| Avant validation | l'auteur modifie selon ses droits (« siennes ») |
| Après validation | modification et suppression réservées au droit « valider » (+ « modifier ») ; l'agent **ajoute** une nouvelle réparation / réfection, qui est à valider. Pièces et ouvriers d'une réparation validée : idem |
| Photos (V3) | type, rattachement, retrait logique (`supprime_le`, `motif_retrait` facultatif ; fichier gardé). Photo déposée (`cree_le`) **avant** la validation de son étape (réfection > réparation > fuite selon son rattachement) : seul le droit `photos / valider` la modifie ou la retire ; après : l'auteur, selon ses droits |
| Motif (V5) | `fuites.date_detection`, `reference_srm`, `position` changés par un autre que l'auteur (`auteur_terrain_id` / `saisi_par`) : envoyer `motif_modification` (sinon erreur `23514`) ; gardé dans `motif_correction`, `corrigee_par`, `corrigee_le` ; ancienne valeur au journal |
| « Détectée par » (V5) | `auteur_terrain_id` ≠ soi, à la création ou en modification (fuites, réparations, réfections) : droit « valider » seulement, agent **affecté au marché** (`23514` sinon) |
| Saisie différée (V5) | `fuites.saisie_differee` posé par la base : date de détection antérieure de plus de 12 h à la saisie, faite au bureau (`source_saisie` ≠ `tablette`) ou à la place d'un agent |
| Lot arrêté (V6) | sur une fuite verrouillée, un agent **ajoute** réparation, réfection, photo, et modifie ce qu'il a ajouté depuis le verrou (avant validation) ; le reste est figé. La fuite revient d'elle-même dans « À attacher » (`v_a_attacher`). Un nouvel arrêt reverrouille la fuite (date du verrou avancée) |
| V7 | réparation possible dès la détection (aucune condition) ; seule une réparation `reparee` **validée** qui appelle une réfection prévient l'équipe de réfection ; pas de verrou automatique |

Cohérence de date : `cree_le` est toujours posé par la base à l'insertion (jamais celui de l'appareil).

```ts
// Écran « À valider » (panneau et tablette) : seulement les marchés où le compte peut valider l'étape.
const { data } = await sb.from('v_a_valider').select('*').eq('marche_id', marcheId).order('date_etape');
// colonnes : etape ('detection'|'reparation'|'refection'), id, marche_id, fuite_id, fuite_numero, reference_srm, adresse,
// statut, resultat, date_etape, auteur_terrain_id, auteur, saisi_par, cree_le, saisie_differee, fuite_validee_le,
// nb_photos (photos de l'étape : 0 → avertissement « aucune photo »)

// « Valider (n) » : nombre réellement validé (déjà validées ou supprimées : ignorées).
const { data: n } = await sb.rpc('valider_etapes', { p_elements: [
  { etape: 'detection', id: fuiteId }, { etape: 'reparation', id: repId }, { etape: 'refection', id: refId } ] });

// Correction du responsable avec motif
await sb.from('fuites').update({ position: 'SRID=4326;POINT(-1.9 34.68)', motif_modification: 'Épingle sur le regard' }).eq('id', id);

// Réfections à faire (équipe de réfection) : réparation « réparée » validée qui appelle une réfection, sans réfection depuis.
const { data: aFaire } = await sb.from('v_a_refectionner').select('*').eq('marche_id', marcheId);
// colonnes : fuite_id, marche_id, fuite_numero, reference_srm, adresse, secteur_id, statut, latitude, longitude,
// reparation_id, reparee_le, reparation_validee_le, emplacement, nature_revetement_id, fouille_longueur_m, fouille_largeur_m
```

`private.refection_attendue(p_reparation)` décide si une réparation appelle une réfection (réparée, hors terrain naturel,
revêtement à refaire) : S2 la redéfinit pour P8 (refus de l'abonné, terrassement sur revêtement).

Messages d'erreur (code `42501` sauf mention) : « Validation réservée au responsable », « Étape validée : modification
réservée au responsable (ajoutez un nouvel élément, il sera à valider) », « Réparation validée : pièces et ouvriers
réservés au responsable », « Photo enregistrée avant la validation : seul le responsable peut la modifier ou la retirer »,
« Saisie à la place d'un agent réservée au responsable », « Motif obligatoire pour corriger la date de détection, la
référence ou la position » (`23514`), « L'agent choisi n'est pas affecté à ce marché » (`23514`).

## 5. Notifications (N1, N3) et appareils push (N2)

### Table `notifications` (une ligne par destinataire)

| Colonne | Sens |
|---|---|
| `id` (bigint), `destinataire_id`, `marche_id` | destinataire, marché |
| `evenement` | voir le circuit |
| `fuite_id`, `reparation_id`, `refection_id` | clic → fiche de la fuite |
| `auteur_id` | compte qui a déclenché (nul pour l'alerte) |
| `titre`, `corps` | texte français prêt à afficher (ex. « Nouvelle fuite N° 12 détectée », adresse) |
| `donnees` | pour traduire (AR) : `numero`, `reference_srm`, `adresse`, `statut`, `resultat`, `delai_h` |
| `cree_le`, `lue_le` | non lue = `lue_le` nul |
| `push_envoyee_le` | envoi push fait (fonction serveur de S7, `service_role`) |

Règles : chacun **lit et marque seulement les siennes** ; seule la colonne `lue_le` est modifiable ; aucune écriture par
les clients (déclencheurs). Publiée en temps réel (`supabase_realtime`). Notifications lues purgées après 90 jours.

### Circuit (N3), table `notifications_circuit` (événement × rôle, réglable par l'administrateur)

| `evenement` | Déclencheur | Rôles destinataires (défaut) |
|---|---|---|
| `fuite_detectee` | insertion d'une fuite (sauf `source_saisie = import`) | `chef_reparation`, `responsable` |
| `reparation_saisie` | insertion d'une réparation | `responsable` (à valider ; **ajout S1**, voir § 7) |
| `reparation_validee` | réparation `reparee` validée qui appelle une réfection, sans réfection saisie depuis | `refection` (rôle cumulé compris) |
| `refection_saisie` | insertion d'une réfection (faite ou clôture sans réfection) | `responsable` |
| `alerte_reparation` | fuite toujours `detectee` au-delà de `marches.delai_alerte_reparation_h` (48 h), une fois par fuite, fuites de moins de 30 jours | `chef_reparation`, `responsable` |

Toujours : l'**administrateur** reçoit tout ; **jamais l'auteur** (compte connecté, `saisi_par`, `auteur_terrain_id` ;
pour la validation : le compte qui valide) ; seulement les comptes **actifs affectés au marché** (affectation active).
L'alerte est produite par `generer_alertes_reparation()` (serveur seulement), planifiée toutes les 15 min par `pg_cron`
si l'extension est disponible (sinon : à appeler par une tâche planifiée avec la clé `service_role`).

```ts
// Cloche : liste, pastille, tout lu à l'ouverture, en direct
const { data } = await sb.from('notifications').select('*').order('cree_le', { ascending: false }).limit(30);
const { data: nonLues } = await sb.rpc('compter_notifications_non_lues');      // pastille « 9+ »
await sb.rpc('marquer_notifications_lues');                                    // tout marquer lu
await sb.rpc('marquer_notifications_lues', { p_ids: [id] });                   // une seule (clic sur la notification push)
sb.channel('cloche').on('postgres_changes',
  { event: 'INSERT', schema: 'public', table: 'notifications', filter: `destinataire_id=eq.${moi}` }, rafraichir).subscribe();
```

### Appareils push (pour S7)

Table `appareils_push` (`id, profil_id, jeton unique, plateforme 'android', version_app, cree_le, vu_le`) : chacun voit
et supprime les siens ; écriture par fonction.

```ts
await sb.rpc('enregistrer_appareil_push', { p_jeton: jetonFcm, p_version: '2.1.0' }); // à la connexion ; un appareil
// repris par un autre agent change de compte
await sb.rpc('retirer_appareil_push', { p_jeton: jetonFcm });                         // à la déconnexion
```

Envoi (S7, fonction serveur, `service_role`) : lire `notifications` où `push_envoyee_le` est nul, les jetons
`appareils_push` du destinataire, envoyer par FCM, puis poser `push_envoyee_le`. Un jeton refusé par FCM se supprime.

## 6. Objets redéfinis (à reprendre tels quels si une session les redéfinit)

`private.avant_insertion_saisie`, `private.avant_modification_saisie`, `private.controler_verrou_fuite`,
`private.creer_profil_utilisateur`, règles RLS de `refections` et la lecture de `reparation_pieces`, contraintes
`affectations_roles_check`, `modeles_droits_role_check`, `verrous_admin_droit_connu`. Non touchés : `v_fuites`,
`v_fuites_export`, `arreter_attachement`, `controler_piece`, `avancer_statut_fuite`.

## 7. Écarts au plan et points à confirmer avec Issam

1. **`reparation_saisie` → Responsable** : non listé dans N3, ajouté pour que le responsable sache qu'une réparation
   attend sa validation (demande d'origine « réparation faite »). Une ligne de `notifications_circuit` : se retire d'un clic.
2. **Annulation d'une validation** : permise au droit « valider » (sans motif, journalisée) ; aucune fonction dédiée.
3. **Seuil de la saisie différée** : 12 h, fixe.
4. **Corrections de champs** (adresse, position, dimensions) : visibles du terrain avec la valeur corrigée (seules les
   pièces du bureau sont masquées, § 3).
5. **Suppression d'un compte** : pas de verrou de l'administrateur dédié (la règle « aucune saisie » suffit).
6. **Alerte 48 h** : `pg_cron` créé par la migration si disponible ; à vérifier sur le projet (tâche `alertes-reparation`).
