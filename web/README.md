# Panneau web et mode terrain (version rapide)

Application Next.js 15 (App Router, TypeScript), hébergée sur Vercel. Elle parle directement
à Supabase depuis le navigateur : la **RLS** de la base fait la sécurité, il n'y a aucun secret
côté client. Les comptes sont créés par la fonction serveur `supabase/functions/gerer-utilisateurs`.

Une seule application, utilisable sur ordinateur (bureau, responsable) et sur la tablette Samsung
(navigateur Chrome, « Ajouter à l'écran d'accueil » pour l'installer comme une application).
C'est la **version rapide de test** : mode hors ligne léger pour la création de fuites (voir plus bas),
pas de GPS en arrière-plan ; l'APK Expo prévu dans CLAUDE.md viendra après validation du parcours.

## Style de l'interface (« Studio Admin », shadcn/ui)

Choix d'Issam du 2026-10-06 : interface du modèle [next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard)
(« Studio Admin », MIT), qui remplace le style SAP Fiori du 2026-10-05. Détail des rubriques reprises et de la
technique : `MAQUETTE-SHADCN.md`.

- Tailwind v4 (`src/app/globals.css` : jetons et 3 préréglages de couleurs), composants shadcn dans `src/components/ui/`,
  icônes `lucide-react`, graphiques Recharts, tableaux TanStack.
- Coque (`src/app/(app)/_coque/`) : barre latérale repliable selon les droits (`elements-nav.ts` : menu, onglets visibles des
  paramètres), recherche ⌘J, sélecteur de marché, préférences d'affichage (cookies), mode clair / sombre.
- Écrans encore écrits avec les classes de l'ancienne version (onglets des paramètres, panneau d'export, matrice des droits, corrections à l'attachement, réseau et balayage) : habillés par
  `src/styles/ancien.css` sous un conteneur `.ancien`. Les modules CSS de ces écrans lisent les anciens jetons
  (`--bord`, `--discret`, `--principal`…), rapportés aux jetons shadcn en tête de `ancien.css` (justes en mode sombre).
- Statuts : `src/components/statut.tsx` (badges, points, couleurs reprises par la carte).
- **Mode démonstration** (vérification sans compte, jamais sur Vercel) : `NEXT_PUBLIC_MODE_DEMO=1 npm run dev`,
  identifiants quelconques, données fictives en mémoire (`src/lib/demo/`).

## Écrans

| Écran | Qui | Contenu |
|---|---|---|
| `/connexion` | tous | identifiant + mot de passe |
| `/fuites` | tous les affectés | liste, filtres (statuts, zone, secteur, période de détection du / au, texte, alertes : toutes ou un type) **dans l'adresse** (voir § Filtres de la liste dans l'adresse), « Effacer les filtres », export Excel (CSV), « Rapports PDF (n) » de la liste affichée (rubriques à cocher d'abord, voir § Rubriques à cocher). **Tableau** : toutes les colonnes cochées dans « Affichage » tiennent dans la largeur (adresse élastique, secteur et alertes à la ligne, marges réduites ; moins de colonnes = plus de place). **Colonnes par statut** (Kanban) : les 5 colonnes se partagent la largeur (10,5 rem au moins, cartes compactes), défilement horizontal seulement sous ≈ 1 200 px menu ouvert ; vérifié à 1366, 1440 et 1920 px, menu ouvert et replié |
| `/tableau-de-bord` | tous ceux qui lisent les fuites | période (mois en cours par défaut, semaine en cours, mois précédent, **depuis le début du marché** : date d'effet de l'OS de commencement, sinon date de commencement de la fiche, sinon jour de la première fuite, jusqu'à aujourd'hui, flèches de comparaison masquées ; dates libres) ; activité de la période (détectées, réparées, délais moyen et médian détection → réparation) ; situation à ce jour (non réparées au-delà du seuil, réfections à faire et hors délai, sans photo, anomalies si droits « quantités » et « interventions ») ; répartition par statut, évolution sur 12 semaines, tableau par secteur ou par zone ; bloc attachements (droits « attachements » et « quantités » : lots arrêtés, cumul attaché, reste à attacher, % par article). Chiffres cliquables vers la liste `/fuites` filtrée à l'identique, seulement quand la liste a le filtre exact (détectées sur la période, réfections à faire = statut « réparée », répartition par statut, détectées par semaine, détectées et alertes par secteur, totaux) ; les autres chiffres restent du texte. Calculs dans `src/lib/ui/tableau-de-bord.ts`, vérifiés par `node scripts/verifier-tableau-de-bord.mjs` |
| `/carte` | tous ceux qui lisent les fuites | carte des fuites du marché (fond OpenStreetMap minimal, sans satellite) : couleur par statut (mêmes couleurs que les badges, les pastilles servent de légende et de filtre), halo rouge si alerte, regroupement des points serrés (toucher un groupe zoome dessus), bulle (N°, référence, statut, zone et secteur, adresse, date, alertes, « Ouvrir la fiche », « Y aller » : itinéraire Google Maps vers la fuite) ; filtres statut, secteur, période de détection, alertes seulement ; « Recentrer » (fuites affichées, sinon contour du secteur, sinon Oujda) ; contours des zones et secteurs dessinés seulement si `geom` est rempli ; bouton **Imprimer la carte** (droit « exports / lire ») : PDF A4 / A3, rubriques à cocher, voir § Carte |
| `/balayage` | droit « balayage / lire » | journal des balayages (`v_balayage_journalier`) : période (7 derniers jours par défaut), équipe, secteur ; par jour, équipe, agent, zone, secteur : tronçons, linéaire balayé, repassé, nœuds, fuites ; totaux ; export Excel / CSV ; **rapport de recherche de fuites de la période Du–Au** (droit « exports / lire ») : **un seul** PDF A4 au gabarit STEPAG 2026 (toutes les zones balayées, linéaire par jour, fuites avec leur date, **extrait de plan A4** de la période : conduites inspectées en vert, repassées en bleu, autres en gris, fuites numérotées) ou un seul Excel ; Du = Au : rapport journalier, un pour la journée ou un par équipe (décision Q-34) ; équipe et secteur du filtre repris ; rapport d'un jour depuis sa ligne ; rubriques à cocher ; voir § Réseau et balayage |
| `/suivi-gps` | responsable du marché et administrateur (RLS de `traces_gps`) ; entrée de menu si « fuites / valider » ou administrateur | **suivi GPS (X6)** : tracé d'un jour (calendrier, jour précédent / suivant, jamais dans le futur) des agents du marché, un par agent, sur le fond OpenFreeMap minimal avec le réseau en tuiles privées (S10) et le satellite activable ; liste des agents avec heures de début et de fin, distance, nombre de points, temps réellement suivi et interruptions (trou de plus de 10 min : le trait est coupé), cases pour afficher ou masquer un agent, une couleur par agent ; début en vert, fin en rouge, points visibles de près (toucher : agent et heure). Lecture par `v_traces_gps` et `trace_gps` ; **Marchés > menu d'un marché désactivé > « Effacer les tracés GPS »** (administrateur, `purger_traces_marche`, confirmation) pour la fin du marché. Code : `src/app/(app)/suivi-gps/`, calculs dans `src/lib/trace-gps.ts` (`node scripts/verifier-trace-gps.mjs`) |
| `/debits` | droit « mesures_debit / lire » (responsable ; Détection et Réparation si la matrice l'ouvre) | **débits de nuit (S15, D7)** : onglet **Synthèse** (τ1 du marché, pénalités estimées au prix du bordereau si « quantités / lire », zones en alerte, dernier contrôle ; tableau par zone et marché : Q exigé, Qi, Qf, ΔQ, τ1, pénalité de balayage, contrôles, moyenne, τ2, pénalité de maintien, dégradation, alertes ; courbe des nuits complètes face au Q exigé et au Q à maintenir) ; **Campagnes et saisie** (`?onglet=campagnes&campagne=<id>` : nouvelle campagne et suppression avec « valider » ; grille point × nuit au minimum, relevés de 0 h à 6 h dans un dialogue avec collage d'une colonne, import CSV ou Excel (`point, date, heure, débit`), aperçu du débit des zones, PV signé joint au compartiment `debits`, **procès-verbal** A4 PDF ou Excel avec visas) ; **À valider** (saisies du terrain, `valider_etapes` étape « debit ») ; export Excel de la synthèse. Paramètres › **Débits de nuit** : points de mesure, tableau n° 1, réglages, phases. Widget au tableau de bord, rappel sur `/a-valider`. Calculs : `src/lib/debits.ts` (`node scripts/verifier-debits.mjs`) ; contrat : `docs/lots/chantier-v3-debits.md` |
| `/session` | APK | ouvre la session de la tablette dans la WebView de l'écran Balayage (jetons dans le fragment `#`, jamais envoyés au serveur), puis `/carte?mode=balayage` |
| `/fuites/nouvelle` | droit « fuites / créer » | GPS ou **épingle sur une mini-carte** (zoom rapproché, tronçon suggéré en surbrillance), champs obligatoires **F1** (référence, secteur, ouvrage, visibilité, **nature de dégradation**, plus ceux que le marché coche), adresse facultative, matériau et diamètre de la conduite, **suggestions à valider d'un clic** (rue, secteur, conduite du tronçon le plus proche ; jamais pré-remplies), photos facultatives avec avertissement, détection des doublons ; responsable : **« Détectée par »**, date et heure réelles, source, « valider en même temps » ; voir § Validation et saisie |
| `/fuites/[id]` | selon droits | détail, photos par étape, suivi SRM, **validation par étape** (détection, chaque réparation, chaque réfection : badge, bouton « Valider », avertissement « aucune photo »), **modifier** la détection, une réparation ou une réfection selon la validation et les droits, **corrections du responsable** (position à l'épingle, date au calendrier, référence, adresse… motif obligatoire pour date, référence et position), badge **« saisie différée »**, réparations (fouille, pièces posées : corrections du bureau avec leur nature et leur motif, saisie d'origine barrée « remplacée » ou « retirée », **visibles du bureau seulement**), réfections ou clôture sans réfection, quantités et prix, verrouillage, statut, suppression logique ; motif des lignes de prix corrigées (corriger une quantité demande un motif) |
| `/a-valider` | droit « valider » (fuites, interventions ou réfections) : responsable, administrateur | étapes en attente du marché (`v_a_valider`) : étape, fuite, résultat, date, auteur, saisie différée, 3 vignettes ou « Aucune photo » ; onglets par étape, cases à cocher, « Tout cocher », **« Valider (n) »** (`valider_etapes`), avertissement « aucune photo » avec la liste avant de valider |
| `/parametres` | droits « parametres », « ouvriers », « evenements » | onglets **Marché** (titulaire, maître d'ouvrage, **logos des documents** : PNG ou JPEG, 2 Mo au plus, réduits à 600 px, droit « paramètres / modifier » ; délai, OS, arrêts et reprises, libellés et alertes du client, longueur de polyéthylène couverte par l'article de réparation : 2 m par défaut), **Bordereau** (avenants, nouvelle version d'un article avec avenant ou motif, historique, articles hors bordereau), **Attachement** (règles par marché), **Événements** (journal filtrable, pièces jointes, export, catégories), ouvriers, équipes, motifs, **Secteurs** (zones et secteurs : code, libellé, zone, ordre, linéaire), **Réseau** (plan du réseau : import, zonage ; administrateur ou « paramètres / modifier »), **Natures de réfection** (libellés FR / AR, symbole, emplacement, article lié, réfection nécessaire), **Articles (tous marchés)** (articles Dolibarr : import de `produits.csv` par l'administrateur, activation par l'administrateur ou le responsable, voir § Articles Dolibarr) ; l'onglet ouvert est dans l'adresse (`/parametres?onglet=articles`) ; bouton **Règles** d'un article (famille, matériaux, diamètres : modification directe, sans nouvelle version) ; on désactive, on ne supprime pas |
| `/attachements` | droit « attachements » | lots d'attachement : reste à attacher, nouveau lot, liste (brouillons, arrêtés, acceptés, facturés) ; synthèse des contrôles en défaut (droit « quantités / lire ») et lien vers les travaux hors bordereau |
| `/attachements/[id]` | droit « attachements » | en-tête et mentions du CPS (le titre suit la saisie ; numéro « prévu » d'un brouillon), récapitulatif par article (antérieur, lot, cumul, %), travaux du lot et sélection « À attacher » en listes compactes zébrées, une ligne par fuite (N° de fuite cliquable : fiche, photos dans un nouvel onglet ; filtres, cases par fuite et par article), ligne libre, **attachement par anticipation** (bloc violet « Propositions anticipées », bouton « Attacher par anticipation » d'une fuite du lot ; voir § Comptes, cloche et anticipation), refacturation forcée (admin), arrêt définitif, réouverture (admin), suivi (acceptation, facture) ; page élargie (écran de bureau). Colonne **Contrôles** (oublis probables, lignes incohérentes, travaux hors bordereau ; détail en infobulle) dans « Travaux du lot » et « À attacher », filtre « Contrôles en défaut seulement », bouton **Corriger** d'un brouillon : requalifier une ligne de prix (article, quantité, **motif obligatoire**), ajouter une ligne ; pièces posées : **Remplacer** une pièce erronée, **Retirer** une pièce non posée, **+ Ajouter un oubli**, chaque fois avec motif (la saisie d'origine reste visible, barrée « remplacée » ou « retirée » ; une pièce ne change jamais le prix) ; le nouvel article d'une unité du lot entre dans le lot |
| `/attachements/hors-bordereau` | droit « attachements / lire » | travaux à faire valoir : polyéthylène au-delà du seuil du marché (excédent), réparations sans article (DN > 315, fonte, acier…), pièces non couvertes de l'inventaire réel (provenance : terrain ou correction du bureau) ; filtres période, secteur, nature ; export Excel, PDF, Word, CSV ; rien n'est facturé automatiquement. Calculs dans `src/app/(app)/attachements/controles.ts`, vérifiés par `node scripts/verifier-controles-attachement.mjs` |
| `/fournitures` | droit « quantités / lire » (responsable, administrateur) | **inventaire des fournitures posées** (`v_inventaire_fournitures`) : inventaire réel par article Dolibarr (corrections du bureau comprises, pièces remplacées ou retirées exclues) ; lignes (article, famille, secteur, zone, équipe, fuite, mois) × colonnes (aucune, mois, secteur, équipe, provenance) avec totaux par unité ; période (mois en cours par défaut, 12 mois au plus), fuite N°, puces zone / secteur / équipe / famille / saisie (terrain ou bureau) ; filtres dans l'adresse (`?lignes=&colonnes=&du=&au=&zone=&secteur=&equipe=&famille=&provenance=terrain\|correction&fuite=`) ; chiffres cliquables vers la fiche ou la liste du secteur ; **Excel** (feuilles « Inventaire » et « Détail ») ; aucun montant |
| `/fournitures/rapprochement` | droit « quantités / lire » | **rapprochement posé / transféré** (`rapprochement_fournitures`) : par article, transféré (Dolibarr, entrepôt du marché), consommé (si déclaré), posé, écart sur la période (depuis le début, mois en cours, mois précédent, dates libres) et en cumul, % et badge « au-delà du seuil » ; filtres famille, désignation, « pièces seulement » (RAC, CND, ROB, AEP, VRI ou article posé), « au-delà du seuil seulement » ; réglages : entrepôt Dolibarr (administrateur), seuil (« paramètres / modifier ») ; carte **« Envoi automatique depuis Dolibarr »** (X8 : état En service / En retard / En erreur / Jamais reçu, dernier envoi, dernier passage du serveur, erreurs depuis le dernier passage réussi, journal des derniers passages ; `envois_dolibarr`) ; **import manuel du CSV des mouvements**, en secours (administrateur, un ou plusieurs fichiers, aperçu : entrées, retours, consommations, annulations, rejets, entrepôts) ; **Excel** |
| `/en-attente` | tous | fuites saisies sur la tablette et pas encore reçues ; envoi manuel, erreurs, abandon |
| `/marches` | administrateur | liste des marchés, activer / désactiver (un marché désactivé n'est plus proposé aux agents), créer un marché vide ou en copiant les paramètres d'un marché existant (`copier_marche`) |
| `/utilisateurs` | administrateur | onglet **Comptes** (`?onglet=affectations` : affectations et rôles ; voir § Comptes, cloche et anticipation) : créer un agent, rôles par marché, mot de passe, révoquer (la base d'abord, verrou et journal, puis blocage de la connexion par la fonction serveur) / réactiver ; onglet **Droits** (`?onglet=droits&marche=<uuid>`) : matrice compacte des **seuls utilisateurs du marché** (en colonnes, côte à côte ; droits en lignes par rubrique, une ligne = une colonne de `droits`, portée Non / Les siennes / Toutes ; en-têtes et libellés figés au défilement ; lignes réservées à l'administrateur retirées), « Modèle… » par colonne, enregistrement explicite après confirmation (`enregistrer_droits`, journalisé) ; **bloc à part « Administrateur et verrous de sécurité »** (repliable, ouvert d'un clic) : colonne « Vous » grisée, vos **verrous** (tous les marchés, refusés par la base, à rouvrir soi-même, sans refermeture automatique), autres administrateurs |

## Validation et saisie (chantier v2, S5)

Contrats de base : `docs/lots/chantier-v2-base-s1.md` (validation, motifs, R7) et `docs/lots/chantier-v2-base-s2.md`
(champs obligatoires, suggestions, diamètres, représentants). La base reste juge ; l'écran grise et prévient.

- **Règles pures** : `src/lib/saisie/regles.ts` (champs exigés, diamètres par matériau, gardes-fous, capsules, droits par
  étape et sur les photos, motif, saisie différée, dates à l'heure du Maroc), vérifiées par `node scripts/verifier-saisie.mjs` (17).
  Listes lues par `src/lib/saisie/referentiels.ts` (gardées sur l'appareil pour la nouvelle fuite hors ligne).
- **Validation (V1)** : une fois, par le droit « valider » de l'étape ; « Valider » sur la fiche, « Valider (n) » sur `/a-valider`,
  case « valider en même temps » à la saisie. Photo facultative : sans photo, un dialogue prévient (« Ajouter une photo »
  ouvre l'onglet Photos sur l'étape, `?photo=reparation:<id>`). Le réglage « photo obligatoire » par étape (V4) n'existe pas
  en base : toujours « facultative avec avertissement ».
- **Modifier (V2, V6)** : l'auteur tant que l'étape n'est pas validée ; après, seul le responsable (l'agent ajoute un nouvel
  élément, à valider) ; fuite verrouillée par un lot : l'agent ajoute encore et modifie seulement ce qu'il a ajouté depuis.
  Pièces d'une réparation d'un autre agent : remplacement, retrait ou oubli avec motif (corrections du bureau).
- **Photos (V3)** : rattachées à une étape ; type modifiable et retrait avec motif (fichier gardé) ; déposées avant la
  validation de leur étape : responsable seulement.
- **Corrections (V5)** : panneau « Corriger » / « Modifier » de la détection (`fuites/[id]/correction-detection.tsx`) ;
  motif obligatoire quand un autre que l'auteur change la date, la référence ou la position.
- **Formulaires réparation et réfection (P1 à P9)** : `fuites/[id]/form-reparation.tsx` et `form-refection.tsx`, étapes
  numérotées dans l'ordre du terrain, choix en gros boutons, diamètres selon le matériau (Paramètres > Marché), **pièces en
  capsules** (articles qui citent le matériau et le diamètre, puis les plus posés du marché ; « − / + » ; recherche),
  représentant du maître d'ouvrage en liste, date et heure proposées et modifiables, **récapitulatif** « Corriger /
  Confirmer », gardes-fous sans blocage (fouille 10 / 3 / 3 m, unité suspecte, fouille > 2 m sans élément remplacé, PE posé
  hors des dimensions de la fouille, non réparée avec terrassement sur revêtement → réfection obligatoire, réfection > 30 m²,
  réfections < fouilles).
- **R7** : un compte qui n'est pas du bureau (ni « interventions / valider », ni « quantités / lire ») lit les pièces dans
  `v_pieces_terrain` (sa déclaration, sans remplacement ni retrait du bureau) ; la dernière correction de la détection et son
  motif ne s'affichent qu'au bureau.
- **Paramètres > Marché** (`parametres/ParametresSaisie.tsx`) : champs obligatoires contrôlés par la base (tablette comprise ;
  le panneau exige toujours le jeu F1), diamètres par matériau (ajouter, retirer, réactiver ; ceux du réseau marqués),
  représentants du maître d'ouvrage (ajouter, renommer, désactiver).

**Droits à l'écran** : `peut(type, action)` (`src/lib/session.tsx`) suit les droits du marché choisi ; pour l'administrateur, tout sauf ce qu'il a verrouillé (`verrous_admin`). `verrouille(objet, action)` sert aux boutons réservés à l'administrateur (rouvrir, refacturation forcée, désactiver, copier, révoquer) : bouton grisé « verrouillé par vous ». Le menu affiche « Utilisateurs (n verrous) ». Calculs purs dans `src/app/(app)/utilisateurs/matrice.ts`, vérifiés par `node scripts/verifier-matrice-droits.mjs`.

### Filtres de la liste dans l'adresse

- Paramètres : `statut` (un ou plusieurs, séparés par des virgules : `statut=detectee,en_reparation` ; detectee,
  en_reparation, reparee, achevee, sans_reparation ; tous cochés = aucun filtre), `zone` (uuid de la zone ; le menu
  Secteur ne propose alors que ses secteurs), `secteur` (uuid du secteur), `du` et `au` (jour de détection AAAA-MM-JJ
  à l'heure du Maroc, bornes comprises), `alertes=1` (mêmes 5 alertes que la colonne « Alertes »), `alerte` (un type :
  `alerte_non_reparee`, `alerte_communication_srm`, `refection_chaussee_hors_delai`, `alerte_refection_chaussee`,
  `alerte_refection_trottoir`), `texte` (N°, référence ou adresse, 100 caractères au plus). Ordre fixe, filtres vides omis.
- À l'écran : onglets par statut (un seul), menu **Statut** (plusieurs), **Zone** (si le marché en a plusieurs),
  **Secteur**, période, **Alertes** (« Toutes les alertes » ou un type).
- Écrits par `router.replace` (l'historique ne s'allonge pas), recherche et dates après une pause de 400 ms. Une valeur
  inconnue ou invalide est ignorée ; un secteur d'un autre marché est retiré.
- Le tableau de bord fabrique ses liens avec `lienFuites` (`src/app/(app)/fuites/filtres.ts`) : la liste ouverte
  compte exactement le chiffre cliqué (« Non réparées > seuil » → `alerte=alerte_non_reparee` ; « En attente » →
  `statut=detectee,en_reparation` ; tableau par secteur **ou par zone**). Vérification :
  `node scripts/verifier-filtres-fuites.mjs`.
- La **période du tableau de bord** est elle aussi dans l'adresse (`/tableau-de-bord?periode=semaine|mois_precedent|debut`,
  `?periode=libre&du=…&au=…` ; « Mois en cours » n'écrit rien) : le retour depuis la liste la retrouve. Fonctions
  `lirePeriodeAdresse` / `ecrirePeriodeAdresse` (`src/lib/ui/tableau-de-bord.ts`), vérifiées par
  `node scripts/verifier-tableau-de-bord.mjs`.

## Comptes, cloche et anticipation (chantier v2, S6)

Contrats de base : `docs/lots/chantier-v2-base-s1.md` (comptes, notifications) et `docs/lots/chantier-v2-base-s2.md` (A1).

- **Comptes** (Utilisateurs > Comptes, menu « ⋯ » de chaque ligne) : **Nom, matricule, entreprise** (nom, prénom,
  matricule unique, entreprise `STEPAG` par défaut ou le sous-traitant, téléphone ; aussi pour son propre compte
  d'administrateur ; la base affiche « NOM Prénom ») ; **Rôles par marché** (Détection, Réparation, Réfection,
  Responsable, cumulables ; une ligne par marché, `modifier_roles` pour chaque marché changé ; tout décocher retire le
  compte du marché ; aussi depuis l'onglet Affectations) ; **Supprimer le compte** : `compte_supprimable` est lu à
  l'ouverture du menu, bouton grisé avec la raison (survol et texte sous le bouton) dès qu'il existe une saisie, sinon
  suppression par la fonction serveur ; **Révoquer** inchangé. Création : nom, prénom, matricule, entreprise, rôle
  Réfection proposé. Le compte `issam` est nommé BOUSALAM Issam par la migration `20261010500000_nom_compte_issam.sql`
  (sans écraser une saisie de l'écran). Paramètres > Ouvriers : **matricule** (unique par marché).
- **Matricules dans les documents (R4)** : `src/lib/export/matricules.ts` (`chargerMatricules`) remplace le nom des
  agents et des ouvriers par leur matricule dans la liste des fuites et l'état journalier (« Détectée par », « Chef
  d'équipe »), les pièces posées, le rapport PDF par fuite (détection, chef d'équipe, ouvriers), le journal et le
  rapport de balayage (agents) ; Excel, PDF, Word et CSV passent par les mêmes lignes. À l'écran, le nom reste. Sans
  matricule saisi, le nom est gardé (la ligne du compte affiche « Sans matricule »). Les lots d'attachement, la carte
  et les fournitures (P3 / P4) ne nomment aucune personne. Vérification : `node scripts/verifier-matricules.mjs`
  (règles, jeux d'export chargés sur le client de démonstration, vrais fichiers Excel, Word, CSV, PDF relus).
- **Cloche** (`src/app/(app)/_coque/cloche.tsx`, en-tête) : pastille rouge (nombre, « 9+ »,
  `compter_notifications_non_lues`), liste des 30 dernières (non lue = point bleu, lue = grisée) ; à l'ouverture tout
  est marqué lu (`marquer_notifications_lues`) ; clic → fiche de la fuite ; nouvelles notifications **en direct**
  (temps réel Supabase, `INSERT` filtré sur `destinataire_id`) et recompte au retour sur l'onglet. Base sans la table :
  pas de cloche. **« Tout voir »** → `/notifications` : toutes les notifications du compte par pages de 50
  (« Voir les plus anciennes »), groupées par jour, non lues en bleu puis marquées lues.
- **Attachement par anticipation (A1)** : case du marché « Le maître d'ouvrage accepte l'attachement par anticipation »
  (Paramètres > Attachement) ; **panier** = articles cochés « Anticipable » (Paramètres > Bordereau, `prix.anticipable`).
  Dans un brouillon, bloc violet **Propositions anticipées** (`v_propositions_anticipation` : réfection due, quantité =
  surface de fouille, modifiable ; motif commun prérempli) → lignes `anticipation` marquées **« Attaché par
  anticipation »** ; le bouton d'une fuite du lot propose les seuls articles du panier. Badge **« Anticipé »**
  (`fuites_anticipees`) : lot, « À attacher », liste des fuites ; ces fuites passent **en tête** du tableau de bord
  (bloc dédié), de « À faire » (filtre « Attachées par anticipation ») et des « Alertes » jusqu'à l'exécution réelle.
- **Tableau de bord, Fournitures posées (P3)** : `resume_fournitures` sur la période choisie (droit « quantités /
  lire ») : articles les plus posés, total par unité, corrections du bureau, lien vers `/fournitures?du=…&au=…`.
- Mode démonstration : notifications, propositions et fuites anticipées, matricules, vues d'export et inventaire
  fictifs (`src/lib/demo/`).

## Articles Dolibarr (Paramètres > Articles)

Les pièces posées sont des **articles Dolibarr** (`produits_dolibarr`, sans aucun prix), communs à tous les marchés. Seuls
les articles **activés** (et toujours présents dans Dolibarr) s'affichent dans la liste des pièces (tablette, fiche d'une
fuite, corrections à l'attachement) ; une pièce déjà saisie garde son article s'il est désactivé ensuite. **Plus de pièce
libre** (décision d'Issam du 2026-10-06) : un article absent fait l'objet d'une demande interne au gestionnaire de
Dolibarr, qui le crée ; l'administrateur exporte puis réimporte `produits.csv`, et l'article est activé (le réparateur
note l'article manquant en observation ; le bureau l'ajoute ensuite comme « oubli » à l'attachement). Le réparateur ne
voit que la désignation ; la référence Dolibarr n'apparaît que dans Paramètres > Articles.

- **Importer** (administrateur seulement) : « Importer produits.csv ». Le fichier est lu dans le navigateur ; seules les colonnes identifiant,
  référence, libellé, unité, famille (préfixe de la référence) et en vente / en achat sont envoyées (jamais un prix, un
  PMP ou un stock). Familles cochées par défaut : RAC, CND, ROB, AEP, VRI (CNS en option). Nouveaux produits désactivés,
  libellés modifiés repris, produits absents retirés (jamais supprimés). Unité : celle de Dolibarr.
- **Activer** : liste avec recherche (désignation, référence), famille et état (activés, non activés, nouveaux du dernier
  import, retirés) ; activation ligne par ligne ou par sélection (`activer_produits_dolibarr`), par l'administrateur ou un
  responsable (droit « paramètres / modifier »), pour tous les marchés.
- **Article suggéré** (par marché) : Paramètres > Bordereau, règle par article ou par famille (`SuggestionsArticles.tsx`).
- Logique : `src/lib/articles.ts` (liste déroulante, noms des pièces saisies), `src/lib/nomenclature/` (`csv.ts`,
  `donnees.ts`) ; vérification : `node scripts/verifier-nomenclature.mjs`.

## Fournitures et Dolibarr (menu Marché > Fournitures)

- Logique pure : `src/app/(app)/fournitures/inventaire.ts` (filtres, période, croisement), `src/lib/ui/fournitures.ts`
  (types, quantités par unité, résumé), `src/lib/dolibarr/csv.ts` (lecture du CSV des mouvements : seules les colonnes
  utiles, jamais un prix), `src/lib/dolibarr/rapprochement.ts` (filtres, tri, export), `src/lib/dolibarr/donnees.ts`
  (appels à la base). Vérification : `node scripts/verifier-fournitures-dolibarr.mjs` (avec
  `DOLIBARR_EXPORTS=<dossier>` : contrôle aussi la lecture des vrais exports, hors dépôt).
- **Procédure courante** (administrateur) : sur le serveur, `C:\xampp\php\php.exe export.php` (lecture seule), copier les
  CSV sur le Mac hors du dépôt (`data-private/dolibarr/`), puis Fournitures > Rapprochement Dolibarr > choisir
  `mouvements_chantier.csv` (et la première fois `mouvements_chantier_avant_2026-10-01.csv`) > « Importer ». Réimporter ne
  double rien. C'est le **secours** : en temps normal, la tâche planifiée du serveur Dolibarr envoie seule les mouvements
  toutes les 15 minutes (`outils/dolibarr/README.md`). État affiché par `src/lib/dolibarr/envoi-auto.ts` (logique pure,
  `node scripts/verifier-envoi-dolibarr.mjs`) et `fournitures/rapprochement/EnvoiAutomatique.tsx`.
- Le widget du tableau de bord (S6) lira `resume_fournitures` (voir `supabase/README.md`).

## Exports (panneau « Exporter »)

Ouvert par **Exporter** (liste des fuites, fiche d'un lot d'attachement, journal des événements) : panneau
à droite, la liste reste visible. Modèles enregistrés par marché (« État journalier SRM », « Pièces posées
par secteur », « Attachement du mois » par défaut, d'autres s'enregistrent), colonnes cochées par thème
avec Tout / Rien, filtres (période, zone, secteur, équipe ; « limiter à la liste affichée »), regroupement
avec sous-totaux, synthèse des pièces, format, orientation, aperçu des premières lignes. En-tête tiré de la
fiche du marché (titulaire, maître d'ouvrage, n° du marché, objet, OS) ; un lot en brouillon porte « PROJET ».

**Logos** (Paramètres > Marché) repris en tête des PDF (exports, lots, rapport par fuite, carte), Word et Excel :
titulaire à gauche, maître d'ouvrage à droite, 14 mm de haut, proportions conservées. Chargés avec le contexte du
marché (`chargerLogosEntete` de `src/lib/logos.ts`) et transmis par l'en-tête (`logoTitulaire`, `logoMaitreOuvrage`) ;
`dessinerEntete` les dessine pour tout PDF. Un logo remplace le nom et le nom arabe de sa colonne (`lignesEntete` de
`src/lib/export/modele.ts`) ; sans logo, le nom reste écrit. Pas de logo en CSV. Vérification : `node scripts/essai-logos.mjs`.

Fichiers fabriqués **dans le navigateur** (aucun coût serveur), bibliothèques chargées seulement au moment
de l'export (mesures minifiées + gzip) :

| Format | Bibliothèque | Poids | Pourquoi |
|---|---|---|---|
| Excel | `write-excel-file` (+ `fflate`, déjà inclus) | 19 Ko | styles, fusions, largeurs, ligne figée ; exceljs 263 Ko ; SheetJS 92 Ko, sans styles en version libre. Impression réglée dans le fichier : A4 dans l'orientation choisie, une page en largeur, titres de colonnes répétés, pied « Page n / N » ; colonnes de texte resserrées selon l'orientation, désignation abrégée dans le détail (texte complet au récapitulatif) |
| PDF | `jspdf` + `jspdf-autotable` | 140 Ko | tableaux paginés ; pdf-lib 535 Ko et sans mise en page de tableaux |
| Word | `docx` | 112 Ko | tableaux, en-tête répété, pied paginé, police embarquée |
| CSV | aucune | — | séparateur « ; », virgule décimale |

**Arabe** : police Amiri (SIL OFL, `public/polices/`), chargée seulement si le document contient de l'arabe.
Word : vrai texte de droite à gauche, police embarquée dans le fichier. Excel : vrai texte. PDF : jsPDF lie mal
certains textes (parenthèses, lettres marocaines ݒ ݣ) ; chaque texte arabe y est composé par le navigateur
avec Amiri puis inséré en image nette (non sélectionnable), le reste du PDF est du vrai texte.

### Rubriques à cocher (X7)

Pas de gabarit SRM figé (réponse 15 d'Issam) : avant le **rapport par fuite** (dialogue de « Rapports PDF (n) » et de
l'action « Rapport PDF » d'une ligne), le **rapport de balayage** (page `/balayage`) et la **carte imprimée** (onglet
Impression de `/carte`), on coche les rubriques à imprimer (`src/lib/export/rubriques.ts`, composant
`ChoixRubriques.tsx`). Choix **mémorisés en modèles par marché** dans `modeles_export` (sans migration : jeu
« fuites », `filtres.document` = `rapport_fuite`, `rapport_balayage` ou `carte`, `colonnes` = rubriques cochées ;
enregistrer, mettre à jour, retirer avec le droit « exports / créer ») ; le panneau « Exporter » ignore ces lignes. Le
dernier choix est aussi gardé sur l'appareil, par document et par marché (repli sans droit d'enregistrer ; le bouton
« Rapport PDF » de la fiche l'utilise). L'**état journalier** reste le panneau « Exporter » (colonnes cochées et
modèles). Vérification : `node scripts/verifier-rubriques.mjs`.

| Document | Rubriques (cochées par défaut, sauf mention) |
|---|---|
| Rapport par fuite | identification, jalons du client, coordonnées GPS et itinéraire, réparations, équipes et ouvriers, pièces posées, réfections, observations, photos, visas ; **articles et prix du bordereau : décochée**, proposée seulement avec le droit « quantités / lire » |
| Rapport de balayage | identification, linéaire par jour (période), linéaire par zone et secteur, fuites détectées, commentaire, visas, extrait de plan (PDF) |
| Carte imprimée | légende, échelle et nord, coordonnées GPS des coins, informations, graduations, filtres appliqués ; liste des fuites affichées : décochée |

### Rapport PDF par fuite

Bouton **Rapport PDF** sur la fiche d'une fuite, et **Rapports PDF (n)** sur la liste (toutes les fuites
affichées après filtres, une fuite par page dans un seul fichier, barre de progression) ; droit
« exports / lire ». **Par défaut sans les articles ni les prix du bordereau** (blocs réparations et réfections
seulement, lot C2) ; rubriques à cocher avant l'export (§ Rubriques à cocher). Module `src/lib/export/rapport-fuite.ts`, chargé au clic (jsPDF + autotable, comme les
exports ; en-tête dessiné par `dessinerEntete` de `pdf.ts`). Contenu : en-tête du marché ; identification
(N°, référence client, origine, statut, dates de détection et jalons du client, zone, secteur, adresse,
**coordonnées GPS** en degrés décimaux et sexagésimaux avec lien vers la carte, précision) ; réparations
(équipe, chef, constat, travaux, fouille et volume, emplacement, revêtement, représentant du maître
d'ouvrage, ouvriers, pièces posées, observation) ; réfections (nature FR / AR, dimensions, ou motif) ;
articles et prix du bordereau seulement si la rubrique est cochée (droit « quantités / lire ») ; photos rangées par type
(détection, avant, pendant, après, réfection), 3 par ligne, réduites dans le navigateur (800 px, JPEG 60 %),
avec type, date et coordonnées ; visas des règles d'attachement du marché ; pied « édité le », page n / N.
Mesures (pile locale, Chromium) : fuite avec 6 photos de 1 600 px → **2 pages, 393 Ko, 0,4 à 0,6 s** ;
25 fuites du marché DEMO → 43 pages, 0,56 Mo, ≈ 1 s.
Lien « Itinéraire vers la fuite » dans le rapport et bouton **Y aller** sur la fiche (`src/lib/itineraire.ts` :
Google Maps en mode itinéraire, application sur la tablette Android, site sur ordinateur ; pas de carte Google
intégrée). Lecture des photos (fiche et rapports) par une seule fonction, `urlsPhotos` dans `src/lib/photo.ts`,
qui choisit selon `photos.stockage` (aujourd'hui `supabase` seulement) : le lot R2 ne changera qu'elle. Ces PDF gardent les images : ils serviront d'archive
avant toute purge des anciennes photos (CLAUDE.md § 7).

## Carte (`/carte`)

- **MapLibre GL JS 6** (BSD, libre), fond **OpenFreeMap « positron »** (`tiles.openfreemap.org`, tuiles
  OpenStreetMap, sans compte ni clé, attribution OSM affichée par le style). Image satellite activable : voir § Satellite.
- Chargée **seulement à l'ouverture de la carte** : `scripts/copier-maplibre.mjs` (lancé par `predev` et
  `prebuild`) copie les modules ES de MapLibre dans `public/maplibre/` (ignoré par git), que la page importe
  en module natif. Webpack casse le chargement du « worker » de la v6 s'il l'intègre au bundle ; la v5 (un
  seul fichier) a une faille XSS critique non corrigée (GHSA-jrc7-96c5-q579). Poids : 305 Ko gzip
  (151 + 147 + 6), 10 Ko gzip de CSS ; les autres pages ne changent pas.
- Fuites lues dans `v_fuites` (RLS appliquée), par pages de 1 000 au-delà de 1 000 lignes.
- **Sans réseau** : le module est en cache (service worker) mais les fuites ne le sont pas : message
  « Pas de réseau », bouton Actualiser. Si le fond de carte ne répond pas (8 s), les fuites s'affichent sur
  fond uni avec un bandeau (les nombres des groupes n'apparaissent alors pas).
- Tablette : boutons de zoom de 44 px, rotation désactivée, un toucher à 14 px près sélectionne le point.
- **Impression** (« Imprimer la carte », droit « exports / lire ») : format A4 / A3, portrait / paysage, titre,
  **cadrage** (par défaut sur les fuites et le réseau affichés, avec une marge de 4 % ; ou vue de l'écran), rubriques à
  cocher (liste des fuites affichées comprise). PDF fabriqué dans le navigateur (`src/lib/export/carte-pdf.ts`, jsPDF
  chargé au clic) : en-tête du marché (`dessinerEntete`, logos compris), filtres appliqués, carte rendue hors écran par
  MapLibre à 200 dpi (`carte/capture.ts`, couches communes `carte/couches.ts` ; vue de l'écran : même zoom si elle tient
  dans le cadre, textes réduits à 77 % au plus, sinon recadrage), numéro à côté de chaque point, graduations en degrés,
  cartouche (légende, échelle juste à la latitude du centre, nord, coordonnées WGS84 du centre et des coins),
  © OpenStreetMap, bandeau si le fond est indisponible, liste paginée, « Page n / N ». **Légende longue** (statuts,
  contours et réseau) : en portrait, si elle dépasse la bande, elle passe en bande pleine largeur au-dessus des autres
  boîtes, sur 3 colonnes (A4) ou 4 (A3) ; en paysage, si la colonne de droite ne la contient pas avec les autres boîtes,
  elle passe sous la carte ; la carte est réduite d'autant, aucun texte ne déborde (coupé avec « … » au pire). Rubriques
  décochées : la boîte disparaît et les autres se partagent la place ; sans boîte, la carte prend toute la page. Libellés
  de diamètre sans « ≤ » ni « > » (absents de la police standard de jsPDF) : « jusqu'à 63 mm », « plus de 400 mm ». Gabarit générique réglable (`GABARIT` en tête de
  `carte-pdf.ts`) en attendant le modèle de la SRM. Mesures : A4 paysage 1,8 s, 0,4 Mo ; A3 paysage 0,9 Mo.
  Vérification : `node scripts/verifier-carte-pdf.mjs` (4 formats, légendes longues en portrait et en paysage, rubriques).
- Réseau d'eau et balayage : voir § Réseau et balayage. Hors périmètre pour l'instant : tracés GPS des agents.

### Tuiles vectorielles du réseau (X5)

- **Pourquoi** : lu secteur par secteur (une source GeoJSON par secteur, 132 couches pour Oujda), tout le réseau rendait
  la carte lente sur la tablette. En tuiles : une seule source PMTiles, 5 couches de réseau, les secteurs cochés filtrent
  l'affichage sans rien recharger.
- **Archive** : `reseau/<marche_id>/reseau.pmtiles` dans le compartiment **privé** R2 (le même que les photos). Couches
  `troncons` (identifiant entier, propriétés `s` secteur, `c` catégorie, `d` diamètre, `m` matériau) et `noeuds`
  (`s`, `t` type, zooms 14 à 16), zooms 10 à 16 (MapLibre agrandit au-delà) ; métadonnées : index des tronçons (uuid,
  longueur, secteur, diamètre : légende et sélection sans géométrie), date, empreinte du réseau. Oujda : 323 tuiles,
  4,7 Mo, fabriquée en 1,5 à 3 s. Code : `src/lib/reseau/pmtiles.ts` (fabrication), `tuiles-format.ts` (format,
  empreinte), `tuiles.ts` (lecture), `src/app/(app)/carte/{couches,reseau-carte}.ts` (couches, état de balayage).
- **Accès** : jamais public. La fonction serveur `reseau-tuiles` (droits de l'appelant, RLS) délivre une **URL signée**
  de 6 h ; le navigateur lit l'archive **par plages d'octets** (en-tête et répertoire en une lecture de 16 Ko, puis une
  tuile par requête) et redemande une URL quand elle expire. Plages gardées dans le cache du navigateur (Cache Storage
  `suivi-fuites-tuiles`, clé = archive + ETag ; une archive régénérée purge l'ancienne).
- **Garde-fou** : l'archive porte l'**empreinte** du réseau (`estampilleReseau` : tronçons, linéaire, dernière
  modification et nœuds par secteur, non zonés). Si la base a changé depuis (import, zonage, correction), la carte
  revient d'elle-même à la lecture par secteur (toujours juste) et le panneau Réseau l'indique. Même repli sans archive,
  sans R2 configuré, ou si la lecture par plages échoue (règle CORS ci-dessous absente).
- **Régénérer après un import du réseau ou un zonage** : Paramètres › Réseau › bloc « Tuiles du réseau » ›
  **Régénérer les tuiles** (administrateur ou « paramètres / modifier »). Le navigateur lit tout le réseau
  (`reseau_geojson`, `noeuds_geojson`), fabrique l'archive et la dépose dans R2 par une URL signée (15 min) ; l'état
  passe à « À jour ». Les tablettes la prennent à la prochaine ouverture de la carte.
- **Mode balayage en tuiles** : « Toucher » marche tout de suite ; le lasso et « Prolonger » ont besoin de la
  géométrie : elle est lue en arrière-plan 4 s après l'ouverture (ou au premier lasso / Prolonger), depuis le cache de
  l'appareil après la première fois, sans être dessinée une seconde fois.
- **Règle CORS du compartiment R2** (Cloudflare › R2 › `suivi-fuites-photos` › Settings › CORS policy) : la lecture
  par plages envoie l'en-tête `Range` ; règle à poser (remplace la règle des photos, qui y est comprise) :
  ```json
  [{ "AllowedOrigins": ["https://fuites.stepag.ma", "http://localhost:3000"],
     "AllowedMethods": ["GET", "PUT", "HEAD"],
     "AllowedHeaders": ["Content-Type", "Range"],
     "ExposeHeaders": ["ETag", "Content-Range", "Content-Length"],
     "MaxAgeSeconds": 3600 }]
  ```
- **Mesures** (essai local, tout Oujda : 44 044 tronçons, 30 820 nœuds ; Chrome sans tête, écran 1280 × 800 à 1,5,
  processeur bridé ×4, `/carte?mode=balayage`) :

  | | Avant (GeoJSON par secteur) | Après (tuiles) |
  |---|---:|---:|
  | Réseau complet affiché, cache vide | 7,9 s | 2,9 s |
  | Réseau complet affiché, cache de l'appareil | 5,0 s | 1,7 à 1,9 s |
  | Images par seconde (8 s de déplacements et zooms) | 27 à 32 | 59 à 60 (48 pendant la préparation du lasso) |
  | Images de plus de 50 ms | 37 à 49 | 0 (14 à 20 pendant la préparation) |
  | Couches MapLibre | 132 | 73 |

  Outil : `node scripts/mesurer-carte.mjs http://localhost:3110 [bridage] [passages] [chemin]` sur un panneau construit
  avec `NEXT_PUBLIC_MESURE_CARTE=1` (expose la carte au script ; **jamais sur Vercel**) et une base d'essai locale.
  Vérification du format : `node scripts/verifier-tuiles.mjs [troncons.geojson noeuds.geojson]` (15 ; avec les deux
  fichiers, génère le vrai réseau et vérifie que chaque tronçon est dans les tuiles du zoom 16).

### Satellite (C5)

- **Esri World Imagery** (offre gratuite ArcGIS Location Platform, 2 millions de tuiles par mois), tuiles en ligne
  demandées **seulement quand la couche est activée** (bouton « Satellite » en bas à gauche de la carte, choix mémorisé
  sur l'appareil), **bornées à l'emprise du réseau + 1 km** (bornes de l'archive, sinon des secteurs et des zones) et
  aux **zooms 13 à 19** : MapLibre ne demande rien en dehors. Pas de copie locale ni dans R2 (conditions d'utilisation).
- L'image passe sous les noms de rues du fond ; un **contour blanc** s'ajoute sous les conduites pour qu'elles restent
  lisibles ; attribution « Powered by Esri » affichée. Pas de satellite sur la carte imprimée.
- **Clé** : `NEXT_PUBLIC_ESRI_CLE` (clé publique restreinte au domaine, voir § Variables) ; **sans clé, le bouton
  n'apparaît pas**. Code : `src/app/(app)/carte/satellite.ts`.

### Mini-carte de localisation (F4)

- Route `/mini-carte` (hors du menu, comme `/session`) pour la WebView de la tablette, et composant `MiniCarte`
  (`src/app/(app)/carte/MiniCarte.tsx`) réutilisable dans les formulaires du panneau : zoom rapproché sur la position
  GPS, cercle de précision, épingle déplaçable, conduite la plus proche en surbrillance avec diamètre et matériau
  (`suggestions_localisation`), réseau autour, satellite. Position et suggestions renvoyées à l'APK par `postMessage`.
- Contrat d'appel et messages : `docs/lots/chantier-v2-mini-carte.md`.

## Réseau et balayage (lot S)

- **Panneau « Réseau »** de `/carte` (tous ceux qui voient les fuites) : interrupteur général (mémorisé), arbre
  **Zone → secteurs** avec cases (comme les calques d'AutoCAD), « Tout » / « Aucun », linéaire et % balayé par
  secteur ; coloration **par secteur** (teinte par zone, nuances par secteur, légende), **par balayage** (balayé
  vert, repassé bleu, non balayé gris) ou **par diamètre** ; nœuds à partir du zoom 15 ; bulle d'un tronçon
  (secteur, zone, diamètre, matériau, longueur, « balayé le … par … »). Les mêmes couches passent sur la carte
  imprimée.
- **Léger, sans service payant** : GeoJSON par secteur (`reseau_geojson`), gardé dans IndexedDB
  (`suivi-fuites-reseau`, invalidé quand `modifie_le` du secteur change) ; l'état de balayage est relu à chaque
  ouverture et posé par `setFeatureState`, jamais mêlé à la géométrie en cache. Code : `src/lib/reseau/`,
  `src/app/(app)/carte/{PanneauReseau.tsx,useReseau.ts,reseau-carte.ts,lasso.ts}`.
- **Panneau en onglets** (C4 ; le même dans le panneau web et dans l'APK) : **Secteurs** (interrupteur, coloration,
  arbre, linéaire et % balayé), **Légende** (traits, nœuds par type, étiquettes), **Balayage** (enregistrement, file
  d'attente). De près : diamètre et matériau écrits le long des conduites (« Ø110 PVC », zoom 16), vannes, bouches
  d'incendie, ventouses, vidanges, compteurs et réservoirs en couleur (zoom 15), sigle à côté (zoom 17).
- **Mode balayage** (droit « balayage / créer », `/carte?mode=balayage`, aussi dans l'APK) : **carte en plein écran**
  (par-dessus l'en-tête et le menu), le panneau s'ouvre au besoin par « Réseau » dans la barre. **Toucher** un
  tronçon, **Lasso** au doigt (milieu du tronçon dans la forme), **Prolonger** le long de la rue jusqu'à la
  prochaine jonction (± 20°), « Désélectionner tout », compteur « n tronçons · x,xx km » ; « Enregistrer » : équipe
  (la dernière est mémorisée), date, méthode ; identifiants créés sur l'appareil, **file d'attente hors ligne**
  (type d'envoi `balayage`) ; annulation du dernier balayage d'un tronçon avec motif. Une sélection non enregistrée
  survit au rechargement (`sessionStorage`).
- **Paramètres > Réseau** (administrateur ou « paramètres / modifier » ; import : administrateur) : import en trois
  étapes (contours `secteurs.geojson` → `definir_contour_secteur`, tronçons, nœuds ; paquets de 1 000, progression,
  résumé) ; **carte de zonage** plein écran (tous les tronçons, non zonés en gris pointillé ; sélection clic,
  Maj + clic, rectangle Maj + glisser, lasso ; « Affecter au secteur … », « Retirer du secteur », « Recalculer le
  contour », « Dessiner le contour à la main ») ; tableau des secteurs (tronçons, linéaire, % balayé, linéaire du
  contrat, écart) et ligne « Non zonés ».
- **Rapport journalier ou de période** : `src/lib/export/rapport-journalier.ts` (générateur PDF / Excel, sans accès à la
  base ; `synthesePeriode` regroupe tous les jours de [Du, Au] par zone et secteur, avec le linéaire par jour ; Du = Au :
  identique au rapport journalier), appelé par `src/app/(app)/balayage/rapport.ts` (`telechargerRapportBalayage` :
  lecture des balayages et des fuites de la période, filtres équipe et secteur, extrait de plan de la période rendu
  hors écran par `carte/capture.ts`). Période : titre « Rapport de recherche de fuites sur la période », identification
  « Période » et « Jours balayés », tableau « Linéaire inspecté par jour », colonne « Détectée le », légende « sur la
  période », fichier `rapport-balayage-<marché>-<du>-au-<au>`. Visas : titulaire et sigle du client lus dans la fiche du
  marché.
- **APK** : la route `/session` désactive le rafraîchissement automatique du jeton quand elle tourne dans la
  WebView (`window.ReactNativeWebView` ou « SuiviFuitesAPK » dans l'User-Agent) : c'est la tablette qui renouvelle
  la session (un jeton de rafraîchissement réutilisé déconnecterait les deux).
- Vérifications : `node scripts/verifier-reseau.mjs` (31), `node scripts/verifier-rapport-journalier.mjs` (64, période et
  rubriques comprises).
- Limites : légende du PDF de la carte en pastilles (pas en traits) ; rectangle et lasso essayés par événements
  simulés seulement ; jamais essayé sur la tablette ni contre la base de production.

## Photos : Cloudflare R2 et Supabase Storage

Seul point d'accès aux fichiers : `src/lib/photo.ts`. `deposerPhoto` demande une URL de dépôt à la fonction serveur
`photos-r2` (droits vérifiés côté serveur, clés R2 jamais dans le navigateur), envoie le JPEG directement dans le
compartiment privé R2, et renvoie `stockage = 'r2'` ; si la fonction répond « non configuré », refuse, ou si le dépôt
échoue, le fichier va sur Supabase Storage (`stockage = 'supabase'`) : rien n'est perdu. `urlsPhotos` lit les deux
stockages (URL signées 1 h, 10 min pour le rapport PDF). Utilisé par la fiche, la file hors ligne (`hors-ligne.ts`),
la copie hors ligne et le rapport PDF. Mise en service : `docs/feuille-de-route.md` § 3 ; essai des clés :
`node scripts/essai-r2.mjs` (`--forme` sans clés).

## Mode hors ligne léger

- **Nouvelle fuite** : toujours enregistrée d'abord sur la tablette (IndexedDB : fiche + photos déjà
  compressées), puis envoyée. Sans réseau ou en cas de coupure, elle reste en attente et part toute seule
  (retour du réseau, retour sur l'application, toutes les 30 s). Un bandeau indique l'état.
- Les identifiants (uuid) sont créés sur l'appareil : renvoyer ne crée jamais de doublon. Les données
  locales ne sont effacées qu'après confirmation du serveur.
- Mis en cache : liste des secteurs, profil / marchés / droits du dernier utilisateur connecté
  (effacés à la déconnexion), pages de l'application (service worker `public/sw.js`, actif en production).
- **Fiche déjà vue** : chaque fiche ouverte en ligne est copiée sur l'appareil (IndexedDB, base
  `suivi-fuites-fiches`, à part de la file d'attente) : fuite, réparations, réfections, quantités si le
  compte les voit, photos réduites à 1 024 px (clé = identifiant de la photo, jamais l'URL signée). Seul ce
  que la RLS a renvoyé à ce compte est gardé ; une fuite devenue introuvable ou refusée est effacée.
- Sans réseau, en cas d'échec ou après 10 s sans réponse, la fiche s'affiche depuis cette copie avec le
  bandeau « Hors ligne : version du … », en lecture seule (aucun bouton d'écriture, ni rapport PDF) ; fiche
  jamais ouverte sur l'appareil : « Fiche non disponible hors ligne ». Relecture automatique au retour du réseau.
- Taille bornée : 50 fiches et 400 photos (≈ 40 Mo), les moins récemment ouvertes purgées d'abord. Tout est
  effacé à la déconnexion (en ligne : « Quitter » sans réseau n'efface rien).
- Service worker : une seule page « coquille » (sans données) sert toutes les fiches `/fuites/<uuid>` hors
  ligne, avec ses scripts ; les données de navigation des fiches ne sont pas gardées une par une.
  Vérification : `node scripts/verifier-fiche-hors-ligne.mjs`. **Non vérifié dans un navigateur ni sur la
  tablette** (service worker hors ligne, photos en cache) : à essayer en mode avion.
- **Fiches disponibles hors ligne** (`/fuites/hors-ligne`, menu « Tablette › Fiches hors ligne » et lien du bandeau
  « Hors ligne ») : copies de ce compte, les plus récemment ouvertes d'abord (N°, statut, adresse, secteur, version,
  photos), recherche, « Retirer » une copie. Le service worker garde cette page avec la coquille des fiches : elle
  s'ouvre sans réseau même si elle n'a jamais été visitée. Règles : `src/app/(app)/fuites/hors-ligne/fiches-gardees.ts`.
- **Hors périmètre** : modifier une fuite existante sans réseau ; la détection des doublons (re-détection) est muette
  sans réseau.
- Limite : la session reste valable tant que le jeton se rafraîchit ; après une très longue coupure,
  il faut se reconnecter en ligne (les envois en attente sont conservés).

## Tenue en charge (essai à 3 000 fuites)

Rapport et mesures : `docs/essai-charge-3000.md` ; outils : `outils/charge/`.

- `lireTout` (`src/lib/supabase.ts`) lit 1 000 lignes par appel (plafond de l'API Supabase) ; après une première page
  pleine, les suivantes partent 3 par 3. Au plafond (10 000 fuites pour la liste, « Alertes », « À faire » ; 50 000
  ailleurs), le résultat porte `tronque = true` et la page affiche « Affichage incomplet » (`AvertissementPlafond`) ;
  les pages lisent par numéro décroissant, donc ce sont les fuites les plus anciennes qui manquent. Un export refuse
  de sortir un fichier tronqué.
- Colonnes : `src/lib/colonnes-fuites.ts` (`COLONNES_LISTE`, `COLONNES_ALERTES`, types qui suivent la liste) ; jamais
  `select('*')` sur `v_fuites` pour une liste.
- Agrégats calculés par la base (RLS de l'appelant) : `compter_fuites` (onglets de la liste, page des marchés),
  `resume_a_attacher` (tableau de bord), `etat_balayage_compact` (carte : un seul document JSON, non plafonné). Si la
  fonction manque (migration pas encore déployée, mode démonstration), la page retombe sur l'ancienne lecture.
- « Alertes » ne lit que les fuites en alerte et celles des courbes des 14 derniers jours.
- Vérification : `node scripts/verifier-essai-charge.mjs` (11).

## Variables d'environnement (Vercel et `web/.env.local`)

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://osajiinsibwrsltntmsk.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé « anon / publishable » de *Project Settings > API Keys* |

| `NEXT_PUBLIC_NOM_ORGANISATION` | facultative : nom affiché à la connexion (défaut STEPAG) |
| `NEXT_PUBLIC_DOMAINE_AGENTS` | facultative : domaine technique des identifiants (défaut `agents.stepag.ma`, même valeur que `DOMAINE_AGENTS` de la fonction serveur) |
| `NEXT_PUBLIC_ESRI_CLE` | facultative : clé d'API ArcGIS Location Platform (satellite, § Satellite), **restreinte au domaine** `fuites.stepag.ma` ; absente : pas de bouton Satellite |
| `NEXT_PUBLIC_MESURE_CARTE` | essais locaux seulement (`1` : carte exposée à `scripts/mesurer-carte.mjs`) ; **jamais sur Vercel** |

La clé anon est publique par conception (elle est dans le navigateur de chaque utilisateur).
**Ne jamais** mettre la clé `service_role` ici.

## Développement local

```bash
cd web
cp .env.example .env.local   # puis renseigner les deux valeurs
npm install
npm run dev
```

## Mise en ligne sur Vercel (équipe STEPAG)

1. vercel.com → équipe **STEPAG** → *Add New… > Project* → importer `stepag-app/suivi-fuites`.
2. **Root Directory : `web`**. Framework : Next.js (détecté).
3. *Environment Variables* : ajouter les deux variables ci-dessus, puis *Deploy*.
4. Chaque fusion dans `main` redéploie automatiquement.
