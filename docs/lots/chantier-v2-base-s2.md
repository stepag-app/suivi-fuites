# Chantier v2 — contrat de base S2 : référentiels et règles terrain, arabe, attachement

> Publié par la session S2 (vague 1). Les sessions de la vague 2 (S5 panneau, S6 attachements, S7 APK, S10 cartes)
> s'y fient. Source des tâches : `docs/lots/chantier-v2.md` (F1 à F5, P2, P7, P8, X4, A1).
> Migrations : `20261009200000` à `20261009200200` ; tests pgTAP `25`, `26`, `27` (113 tests).

## 1. Ce qui change pour les écrans

| Tâche | Objet en base | À faire en vague 2 |
|---|---|---|
| F1 | `marches.champs_obligatoires_fuite text[]` + contrôle en base | formulaire Nouvelle fuite (S5, S7) |
| F2 | `fuites.nature_degradation_id` | liste « Nature de dégradation » = `natures_refection` actives du marché |
| F3 | table `rues`, fonction `suggestions_localisation` | suggestions à valider d'un toucher (S5, S7) |
| F4 | `fuites.diametre_mm`, `fuites.materiau`, `fuites.troncon_id` ; tronçon dans `suggestions_localisation` | mini-carte, tronçon en surbrillance (S10), champs suggérés (S5, S7) |
| F5 | données : 4 natures (SRM, DEMO) | rien (listes lues en base) |
| P2 | table `diametres_materiau` | liste des diamètres selon le matériau (S5, S7) ; Paramètres > Marché (S5 ou S6) |
| P7 | table `representants_srm`, `reparations.representant_srm_id` | liste du représentant (S5, S7) ; Paramètres > Marché |
| P8 | lignes automatiques des non réparées ; `private.refection_attendue` (S1) élargie ; vue `v_refections_dues` | `v_a_refectionner` (S1) couvre les non réparées validées ; suivi du responsable (S5) |
| X4 | table `libelles_listes` | APK et panneau lisent les libellés arabes en base (S7) |
| A1 | `prix.anticipable`, case `parametres_attachement.refection_anticipee`, vues `v_propositions_anticipation`, `v_a_attacher` (colonnes ajoutées), fonction `fuites_anticipees` | colonne de propositions dans le lot, badge « Anticipé », priorité (S6) ; panier dans Paramètres > Bordereau |

## 2. Fuite : champs et contrôle (F1, F2, F4)

Nouvelles colonnes de `fuites` (toutes facultatives en base, nulles pour les fuites existantes) :

| Colonne | Type | Rôle |
|---|---|---|
| `nature_degradation_id` | uuid → `natures_refection (id, marche_id)` | nature du revêtement dégradé (F2) |
| `diametre_mm` | integer > 0 | diamètre de la conduite (suggéré par le tronçon) |
| `materiau` | `code_materiau` (`polyethylene`, `pvc`, `amiante_ciment`, `fonte_ductile`, `fonte_grise`, `acier_galvanise`, `ppr`, `autre`) | matériau de la conduite |
| `troncon_id` | uuid → `troncons (id, marche_id)` | tronçon retenu (le plus proche suggéré) |

`marches.champs_obligatoires_fuite` (sous-ensemble de `reference_srm`, `secteur_id`, `ouvrage`, `visibilite`,
`nature_degradation_id`, `adresse`, `diametre_mm`, `materiau`) : **SRM et DEMO** =
`{reference_srm, secteur_id, ouvrage, visibilite, nature_degradation_id}` ; nouveau marché copié : celui de la source ;
défaut d'une ligne `marches` créée autrement : `{}`. Modifiable par le droit « paramètres / modifier » (fiche du marché).

Contrôle (déclencheur `d_controler_champs` sur `fuites`, appels des comptes seulement ; imports et contexte serveur
exemptés) :
- **création** : chaque champ de la liste doit être rempli (texte vide = manquant), sinon erreur `23514`
  « Champs obligatoires manquants : tournée, secteur, … » (le libellé de la référence est `marches.libelle_reference`
  en minuscules) ;
- **modification** : un champ exigé déjà rempli ne peut plus être vidé (même message) ; une fuite ancienne incomplète
  reste modifiable sans compléter ses champs.

**Attention (fenêtre de transition)** : dès le déploiement, le formulaire actuel du panneau et l'APK actuelle ne
peuvent plus créer de fuite sur SRM et DEMO sans nature de dégradation (le champ n'existe pas encore à l'écran). S5 et
S7 doivent l'ajouter ; en attendant, Paramètres peut vider la liste du marché (`update marches set
champs_obligatoires_fuite = '{}'`). Une saisie hors ligne refusée reste dans la file de la tablette (message
« Saisie incomplète refusée par le serveur »).

## 3. Suggestions de localisation (F3, F4)

```
suggestions_localisation(p_marche uuid, p_longitude float8, p_latitude float8, p_precision_m numeric default null) → jsonb
```

- Compte connecté affecté au marché (tous rôles ; marché désactivé : lecture permise), sinon `42501` « Marché non
  autorisé » ; position hors bornes : `22023` « Position invalide ».
- Rayon = 2 × précision, borné à **30–150 m** (30 m sans précision). Précision > 200 m : aucune suggestion.
- Réponse :

```json
{
  "rayon_m": 30,
  "precision_insuffisante": false,
  "rues": [{"nom": "Rue Taïf", "nom_fr": "Rue Taïf", "nom_ar": "زنقة الطائف", "distance_m": 11.2}],
  "secteur": {"id": "…", "code": "S1", "libelle": "…", "zone_id": "…", "source": "contour"},
  "troncon": {"id": "…", "reference": "T…", "diametre_mm": 63, "materiau": "polyethylene", "materiau_plan": "PEHD",
              "secteur_id": "…", "distance_m": 5.5, "geojson": {"type": "LineString", "coordinates": […]}}
}
```

- `rues` : 5 au plus, un nom = une suggestion (la voie la plus proche de ce nom), plus proche d'abord. `nom` à afficher
  en français, `nom_ar` en arabe (peut être nul).
- `secteur` : contour du secteur actif qui contient le point (`source = contour`), sinon secteur du tronçon le plus
  proche (`source = troncon`), sinon `null`.
- `troncon` : tronçon actif du marché le plus proche dans le rayon ; `materiau` est le code normalisé (nul si le plan
  ne le donne pas : 61 % des tronçons d'Oujda sans matériau ni diamètre), `materiau_plan` le texte du plan.
- Règle d'Issam : **suggestions seulement**, jamais pré-remplies ; rien de trouvé ou pas de réseau → saisie manuelle.

Table `rues` (lecture : tout compte connecté ; écriture : `importer_rues(p_features jsonb, p_ville text default 'Oujda')`,
administrateur, 5 000 voies par appel, upsert par identifiant OSM, renvoie `{recues, ecrites}`). Données d'Oujda
chargées par la migration `20261009200110_rues_oujda.sql` : 3 274 voies nommées (915 avec un nom arabe), emprise du
réseau + 500 m. **© contributeurs OpenStreetMap, licence ODbL 1.0** : mention à afficher là où les rues sont
proposées (ex. « Rues : © OpenStreetMap ») et sur les impressions qui en reprennent. Rafraîchir : `outils/reseau/extraire_rues.py`
(voir `outils/reseau/README.md`), puis une nouvelle migration ou `importer_rues`.

## 4. Listes réglables par marché (P2, P7)

`diametres_materiau` (`id`, `marche_id`, `materiau code_materiau`, `diametre_mm`, `source` `standard | reseau | manuel`,
`actif`) ; unique `(marche_id, materiau, diametre_mm)`. Lecture : tout affecté ; création « paramètres / creer » ;
modification « paramètres / modifier » ; pas de suppression (désactiver). Liste standard posée à la création de chaque
marché (PE 20–200, PVC 63–315, AC 60–400, fonte ductile et fonte grise 60–600, acier galvanisé 15–50, PPR 20–63) ;
les diamètres des tronçons importés ou corrigés s'ajoutent automatiquement (`source = reseau`, matériau du plan
reconnu : PEHD/PE → PE, PVC, AC, FONTE…). Écran : `select … where marche_id = ? and materiau = ? and actif order by
diametre_mm`. Matériau `autre` : pas de liste, saisie libre.

`representants_srm` (`id`, `marche_id`, `nom`, `ordre`, `actif`) ; mêmes droits. « Abdelkhalek » inscrit d'office
(SRM, DEMO, et les marchés copiés). `reparations.representant_srm_id` (facultatif, même marché) ; le nom choisi est
recopié dans `reparations.representant_srm` (texte des exports existants).

`copier_marche` reprend : champs obligatoires, diamètres, représentants, panier d'anticipation, nouvelles natures.

## 5. Réparation non réparée (P8)

- Résultat `non_reparee` (motif obligatoire, inchangé) : fouille, travaux réalisés et pièces posées restent saisissables ;
  les lignes de prix automatiques sont les mêmes que pour `reparee` : **terrassement dès qu'il y a une fouille** (le
  motif ne compte plus : `motifs.terrassement_paye` n'est plus consulté), robinet / collier PEC, bouche à clé, tuyau
  si coché. `en_cours` : toujours aucune ligne.
- Le statut ne change pas : « sans réparation ».
- **Réfection due** : `private.refection_attendue(reparation)` (créée par S1) est redéfinie : une réparation
  `reparee`, ou `non_reparee` avec une fouille (L et l > 0), hors terrain naturel, sur un revêtement à refaire (nature
  inconnue : oui). Effets : la vue S1 `v_a_refectionner` (réparations **validées**, liste de l'équipe de réfection) et
  la notification `reparation_validee` (titre « Fuite N° n non réparée, fouille validée : réfection à faire ») couvrent
  aussi les non réparées.
- Vue `v_refections_dues` (validées ou non ; RLS de l'appelant, droit S1 « refections / lire » compris) : dernière
  réparation qui appelle une réfection, sans réfection saisie depuis, fuite non achevée et non supprimée. Colonnes :
  `marche_id`, `fuite_id`, `fuite_numero`, `reference_srm`, `adresse`, `statut`, `zone_id`, `secteur_id`,
  `reparation_id`, `resultat_reparation`, `reparee_le`, `reparation_validee_le`, `equipe_id`, `emplacement`,
  `nature_revetement_id`, `nature_code`, `nature_libelle_fr`, `nature_libelle_ar`, `prix_refection_id`,
  `fouille_longueur_m`, `fouille_largeur_m`, `surface_fouille_m2`, `jours_depuis_reparation`. Usage : suivi du
  responsable et propositions d'anticipation ; l'équipe de réfection garde `v_a_refectionner` (S1). Fonction
  `private.refection_due(fuite)` (booléen).
- La saisie d'une réfection sur une fuite « sans réparation » est permise et génère sa ligne de prix.

## 6. Anticipation généralisée (A1)

- **Case du marché** : `parametres_attachement.refection_anticipee` (nom historique gardé, déjà lu par le panneau ;
  libellé à afficher : « Le maître d'ouvrage accepte l'attachement par anticipation »).
- **Panier** : `prix.anticipable boolean not null` ; défaut à la création d'un article : famille `refection` ;
  existants : articles de réfection (SRM, DEMO : prix 4 et 5). Modifiable par « paramètres / modifier » (aucune
  version d'article créée).
- **Ligne `anticipation`** d'un lot (motif obligatoire, quantité > 0, inchangé) — refusée (`23514`) si :
  la case est décochée (« Attachement par anticipation non accepté par le maître d'ouvrage (règles du marché) »),
  l'article n'est pas dans le panier (« Article hors du panier d'anticipation du marché »), l'unité fuite × article a
  déjà une quantité exécutée (« Travail déjà exécuté : attachez le solde, pas une anticipation ») ou est déjà attachée
  dans un lot arrêté (« Déjà attaché (lot N° n) : pas de seconde anticipation »).
- **Propositions** : vue `v_propositions_anticipation` (droit « attachements / lire » et « quantités / lire ») :
  réfections dues dont l'article (`natures_refection.prix_id`) est actif et dans le panier, case cochée, rien
  d'exécuté ni d'attaché ; `quantite_proposee` = surface de fouille ; `brouillon_id` non nul si déjà cochée dans un
  brouillon. Colonnes : `marche_id`, `fuite_id`, `fuite_numero`, `reference_srm`, `adresse`, `statut`, `zone_id`,
  `secteur_id`, `reparation_id`, `resultat_reparation`, `reparee_le`, `nature_code`, `nature_libelle_fr`, `prix_id`,
  `prix_numero`, `prix_ordre`, `prix_designation`, `unite`, `quantite_proposee`, `brouillon_id`. Ajouter une
  proposition = insérer la ligne `anticipation` avec `quantite_proposee` (modifiable) et un motif.
- **Solde** : `v_a_attacher` garde ses colonnes et en ajoute deux à la fin : `en_attente_execution` (anticipée et
  exécution réelle absente : réfection → aucune réfection saisie sur la fuite ; autre article → rien d'exécuté) et
  `anticipable`. `en_attente_refection` vaut désormais `en_attente_execution` pour tout article. Tant qu'elle est en
  attente, `reste = 0` ; ensuite `reste = exécuté − attaché` (régularisation + ou −, réfection close sans être faite :
  tout l'anticipé revient en moins). Total attaché = exécuté : **pas de double paiement** (tests `27`).
- **Badge « Anticipé » et priorité** : `fuites_anticipees(p_marche uuid)` → `fuite_id`, `fuite_numero`, `premier_lot`,
  `attachee_le` (date d'arrêt du lot), `articles` ; fuites attachées par anticipation dont l'exécution manque, triées
  de la plus ancienne. Droit « fuites / lire » (tous les rôles de terrain), sans quantités ni prix.
- **Exécution après l'arrêt** : les fuites d'un lot arrêté sont verrouillées ; l'agent peut encore y ajouter sa
  réfection réelle grâce à V6 (S1), et l'unité revient dans « À attacher » en régularisation.

## 7. Libellés arabes des listes (X4)

Table `libelles_listes` (`liste`, `code`, `libelle_fr`, `libelle_ar`, `ordre`, `actif` ; clé `(liste, code)`), commune à
tous les marchés ; lecture par tout compte connecté, écriture par l'administrateur. Listes : `ouvrage`, `materiau`,
`emplacement`, `visibilite`, `origine`, `statut_fuite`, `resultat_reparation`, `resultat_refection`,
`travaux_reparation` (codes = colonnes booléennes de `reparations`), `type_photo`, `methode_balayage`, `type_equipe`.
Arabe repris du dictionnaire de l'APK quand il existait ; **à relire par Issam** (nouveaux : visibilité, origine,
résultats de réfection, méthodes de balayage, types d'équipe, « Avant / Après réparation »).
Les listes propres au marché gardent leurs colonnes `libelle_fr` / `libelle_ar` : `natures_refection` (toutes
renseignées pour SRM et DEMO), `motifs`, `categories_evenement`. Représentants et diamètres : sans traduction.

## 8. Natures ajoutées (F5)

SRM et DEMO, trottoir, prix 4 : `carreaux_ciment` renommée « Carreaux de ciment (REVSOL) » / « بلاط إسمنتي (ريفسول) »
(code inchangé ; elle s'appelait « Carreaux ciment / carrelage ») ; nouvelles : `carrelage` « Carrelage » / « بلاط »
(symbole CR), `faience` « Faïence » / « زليج » (F), `pave_ciment` « Pavé ciment » / « حجر الرصف الإسمنتي » (PV).
Arabe à relire par Issam.

## 9. Fonctions redéfinies (pour les sessions qui touchent les mêmes objets)

`private.generer_lignes_reparation`, `private.v_prix_proposes`, `private.controler_ligne_attachement`,
`public.v_a_attacher`, `private.copier_parametres_marche` (corps du lot T + `private.copier_parametres_terrain` à la
fin) ; objets de S1 : `private.refection_attendue`, `private.notifier_reparation` (corps S1, résultat élargi à
`non_reparee`). Toute redéfinition ultérieure doit reprendre ces corps.
