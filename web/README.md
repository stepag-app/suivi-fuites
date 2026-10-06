# Panneau web et mode terrain (version rapide)

Application Next.js 15 (App Router, TypeScript), hébergée sur Vercel. Elle parle directement
à Supabase depuis le navigateur : la **RLS** de la base fait la sécurité, il n'y a aucun secret
côté client. Les comptes sont créés par la fonction serveur `supabase/functions/gerer-utilisateurs`.

Une seule application, utilisable sur ordinateur (bureau, responsable) et sur la tablette Samsung
(navigateur Chrome, « Ajouter à l'écran d'accueil » pour l'installer comme une application).
C'est la **version rapide de test** : mode hors ligne léger pour la création de fuites (voir plus bas),
pas de GPS en arrière-plan ; l'APK Expo prévu dans CLAUDE.md viendra après validation du parcours.

## Style de l'interface (SAP Fiori + indicateurs)

Choix d'Issam du 2026-10-05, après comparaison de 5 maquettes : apparence **SAP Fiori** reproduite dans notre
propre CSS (`src/app/globals.css`, jetons en tête de fichier), **sans** la bibliothèque SAP UI5 (trop lourde
pour les tablettes en 4G), plus les **widgets d'indicateurs** du modèle « ERP compact ».

- Barre d'application sombre (logo, organisation, marché, utilisateur), onglets des modules selon les droits.
- Pages blanches sur fond gris clair, tableaux sobres (en-têtes gris, survol bleu pâle, chiffres alignés).
- Statuts en texte coloré précédé d'un point (couleurs sémantiques Fiori : rouge, orange, bleu, vert, gris),
  les mêmes sur la carte (`carte/commun.ts`).
- Boutons « fantômes » par défaut, bouton principal bleu, bouton de suppression rouge.
- Densité bureau 14 px ; sur écran tactile ou étroit, 16 px et commandes de 44 px au moins.
- Liste des fuites : 4 indicateurs (`src/lib/ui/Indicateur.tsx`, calculs dans `src/lib/ui/indicateurs.ts`) :
  fuites du mois (courbe : par jour sur 14 jours), non réparées au-delà du seuil (courbe : situation à chaque
  fin de jour), délai moyen de réparation (courbe : par semaine sur 8 semaines), réfections à faire ; puis
  tableau sur bureau, cartes sur tablette en portrait et téléphone.
- Graphiques du tableau de bord en CSS (barres empilées, colonnes groupées, petites barres dans les tableaux), sans
  bibliothèque ; couleurs des statuts = teintes des points de la carte.

## Écrans

| Écran | Qui | Contenu |
|---|---|---|
| `/connexion` | tous | identifiant + mot de passe |
| `/fuites` | tous les affectés | liste, filtres (statut, secteur, période de détection du / au, texte, alertes) **dans l'adresse** (voir § Filtres de la liste dans l'adresse), « Effacer les filtres », export Excel (CSV), « Rapports PDF (n) » de la liste affichée |
| `/tableau-de-bord` | tous ceux qui lisent les fuites | période (mois en cours par défaut, semaine en cours, mois précédent, dates libres) ; activité de la période (détectées, réparées, délais moyen et médian détection → réparation) ; situation à ce jour (non réparées au-delà du seuil, réfections à faire et hors délai, sans photo, anomalies si droits « quantités » et « interventions ») ; répartition par statut, évolution sur 12 semaines, tableau par secteur ou par zone ; bloc attachements (droits « attachements » et « quantités » : lots arrêtés, cumul attaché, reste à attacher, % par article). Chiffres cliquables vers la liste `/fuites` filtrée à l'identique, seulement quand la liste a le filtre exact (détectées sur la période, réfections à faire = statut « réparée », répartition par statut, détectées par semaine, détectées et alertes par secteur, totaux) ; les autres chiffres restent du texte. Calculs dans `src/lib/ui/tableau-de-bord.ts`, vérifiés par `node scripts/verifier-tableau-de-bord.mjs` |
| `/carte` | tous ceux qui lisent les fuites | carte des fuites du marché (fond OpenStreetMap minimal, sans satellite) : couleur par statut (mêmes couleurs que les badges, les pastilles servent de légende et de filtre), halo rouge si alerte, regroupement des points serrés (toucher un groupe zoome dessus), bulle (N°, référence, statut, zone et secteur, adresse, date, alertes, « Ouvrir la fiche », « Y aller » : itinéraire Google Maps vers la fuite) ; filtres statut, secteur, période de détection, alertes seulement ; « Recentrer » (fuites affichées, sinon contour du secteur, sinon Oujda) ; contours des zones et secteurs dessinés seulement si `geom` est rempli ; bouton **Imprimer la carte** (droit « exports / lire ») : PDF A4 / A3, voir § Carte |
| `/fuites/nouvelle` | droit « fuites / créer » | GPS, référence SRM, secteur, photos, détection des doublons (rayon ou référence) |
| `/fuites/[id]` | selon droits | détail, photos, suivi SRM, réparations (fouille, pièces posées : corrections du bureau avec leur nature et leur motif, saisie d'origine barrée « remplacée » ou « retirée »), réfections ou clôture sans réfection, quantités et prix, verrouillage, statut, suppression logique ; motif des lignes de prix corrigées (corriger une quantité demande un motif) |
| `/parametres` | droits « parametres », « ouvriers », « evenements » | onglets **Marché** (titulaire, maître d'ouvrage, **logos des documents** : PNG ou JPEG, 2 Mo au plus, réduits à 600 px, droit « paramètres / modifier » ; délai, OS, arrêts et reprises, libellés et alertes du client, longueur de polyéthylène couverte par l'article de réparation : 2 m par défaut), **Bordereau** (avenants, nouvelle version d'un article avec avenant ou motif, historique, articles hors bordereau), **Attachement** (règles par marché), **Événements** (journal filtrable, pièces jointes, export, catégories), ouvriers, équipes, motifs, **Secteurs** (zones et secteurs : code, libellé, zone, ordre, linéaire), **Natures de réfection** (libellés FR / AR, symbole, emplacement, article lié, réfection nécessaire), **Catalogue des pièces** (recherche, famille, unité, article suggéré, étiquette « Dolibarr » pour une pièce rapprochée, dont la désignation est alors en lecture seule), **Nomenclature Dolibarr** (administrateur : import de `produits.csv`, rapprochement, voir § Nomenclature Dolibarr) ; bouton **Règles** d'un article (famille, matériaux, diamètres : modification directe, sans nouvelle version) ; on désactive, on ne supprime pas |
| `/attachements` | droit « attachements » | lots d'attachement : reste à attacher, nouveau lot, liste (brouillons, arrêtés, acceptés, facturés) ; synthèse des contrôles en défaut (droit « quantités / lire ») et lien vers les travaux hors bordereau |
| `/attachements/[id]` | droit « attachements » | en-tête et mentions du CPS (le titre suit la saisie ; numéro « prévu » d'un brouillon), récapitulatif par article (antérieur, lot, cumul, %), travaux du lot et sélection « À attacher » en listes compactes zébrées, une ligne par fuite (N° de fuite cliquable : fiche, photos dans un nouvel onglet ; filtres, cases par fuite et par article), ligne libre, réfection anticipée, refacturation forcée (admin), arrêt définitif, réouverture (admin), suivi (acceptation, facture) ; page élargie (écran de bureau). Colonne **Contrôles** (oublis probables, lignes incohérentes, travaux hors bordereau ; détail en infobulle) dans « Travaux du lot » et « À attacher », filtre « Contrôles en défaut seulement », bouton **Corriger** d'un brouillon : requalifier une ligne de prix (article, quantité, **motif obligatoire**), ajouter une ligne ; pièces posées : **Remplacer** une pièce erronée, **Retirer** une pièce non posée, **+ Ajouter un oubli**, chaque fois avec motif (la saisie d'origine reste visible, barrée « remplacée » ou « retirée » ; une pièce ne change jamais le prix) ; le nouvel article d'une unité du lot entre dans le lot |
| `/attachements/hors-bordereau` | droit « attachements / lire » | travaux à faire valoir : polyéthylène au-delà du seuil du marché (excédent), réparations sans article (DN > 315, fonte, acier…), pièces non couvertes de l'inventaire réel (provenance : terrain ou correction du bureau) ; filtres période, secteur, nature ; export Excel, PDF, Word, CSV ; rien n'est facturé automatiquement. Calculs dans `src/app/(app)/attachements/controles.ts`, vérifiés par `node scripts/verifier-controles-attachement.mjs` |
| `/en-attente` | tous | fuites saisies sur la tablette et pas encore reçues ; envoi manuel, erreurs, abandon |
| `/marches` | administrateur | liste des marchés, activer / désactiver (un marché désactivé n'est plus proposé aux agents), créer un marché vide ou en copiant les paramètres d'un marché existant (`copier_marche`) |
| `/utilisateurs` | administrateur | onglet **Comptes** : créer un agent, rôles par marché, mot de passe, révoquer (la base d'abord, verrou et journal, puis blocage de la connexion par la fonction serveur) / réactiver ; onglet **Droits** (`?onglet=droits&marche=<uuid>`) : matrice du marché, **utilisateurs en colonnes, droits en lignes** par rubrique (une ligne = une colonne de `droits`, portée Non / Les siennes / Toutes), « Modèle… » par colonne, enregistrement explicite après confirmation (`enregistrer_droits`, journalisé) ; colonne « Vous » grisée et **verrous de sécurité** de l'administrateur (tous les marchés, refusés par la base, à rouvrir soi-même, sans refermeture automatique) |

**Droits à l'écran** : `peut(type, action)` (`src/lib/session.tsx`) suit les droits du marché choisi ; pour l'administrateur, tout sauf ce qu'il a verrouillé (`verrous_admin`). `verrouille(objet, action)` sert aux boutons réservés à l'administrateur (rouvrir, refacturation forcée, désactiver, copier, révoquer) : bouton grisé « verrouillé par vous ». Le menu affiche « Utilisateurs (n verrous) ». Calculs purs dans `src/app/(app)/utilisateurs/matrice.ts`, vérifiés par `node scripts/verifier-matrice-droits.mjs`.

### Filtres de la liste dans l'adresse

- Paramètres : `statut` (detectee, en_reparation, reparee, achevee, sans_reparation), `secteur` (uuid du secteur),
  `du` et `au` (jour de détection AAAA-MM-JJ à l'heure du Maroc, bornes comprises), `alertes=1` (mêmes 5 alertes
  que la colonne « Alertes »), `texte` (N°, référence ou adresse, 100 caractères au plus). Ordre fixe, filtres vides omis.
- Écrits par `router.replace` (l'historique ne s'allonge pas), recherche et dates après une pause de 400 ms. Une valeur
  inconnue ou invalide est ignorée ; un secteur d'un autre marché est retiré.
- Le tableau de bord fabrique ses liens avec `lienFuites` (`src/app/(app)/fuites/filtres.ts`) : la liste ouverte
  compte exactement le chiffre cliqué. Vérification : `node scripts/verifier-filtres-fuites.mjs`.

## Nomenclature Dolibarr (Paramètres, administrateur)

Les pièces posables viennent de la nomenclature de l'ERP Dolibarr (`produits_dolibarr`, sans aucun prix). Une pièce du
catalogue d'un marché est rapprochée d'un produit Dolibarr (`catalogue_pieces.produit_dolibarr_id`, un produit au plus une
fois par marché) et prend alors son libellé : le réparateur ne voit que cette désignation (tablette, fiche, rapports,
exports) ; la référence Dolibarr n'apparaît que dans Paramètres > Nomenclature Dolibarr.

- **Importer** : Paramètres > Nomenclature Dolibarr > « Importer produits.csv ». Le fichier est lu dans le navigateur ;
  seules les colonnes identifiant, référence, libellé, unité, famille (préfixe de la référence) et en vente / en achat sont
  envoyées (jamais un prix, un PMP ou un stock). Familles cochées par défaut : RAC, CND, ROB, AEP, VRI (CNS en option).
  Réimport à volonté : nouveaux produits ajoutés, libellés modifiés repris (y compris par les pièces rapprochées), produits
  absents rendus inactifs, jamais supprimés ; un produit ni en vente ni en achat est inactif.
- **Rapprocher** : proposition automatique (même type de pièce, mêmes diamètres et filetages, matière compatible),
  « sûre », « probable » ou « aucune » ; validation en lot des sûres ; autre produit par recherche ; une pièce sans
  correspondance est désactivée ou gardée hors nomenclature (historique des réparations conservé). Retirer le lien rend à
  la pièce sa désignation d'origine. Premier essai sur l'export du 2026-10-05 : 261 pièces, 113 sûres, 58 probables,
  90 sans correspondance.
- **Ajouter** des produits Dolibarr au catalogue du marché (famille, recherche).
- Logique : `src/lib/nomenclature/` (`csv.ts`, `rapprochement.ts`, `donnees.ts`) ; vérification :
  `node scripts/verifier-nomenclature.mjs`.

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
`dessinerEntete` les dessine pour tout PDF. Pas de logo en CSV. Vérification : `node scripts/essai-logos.mjs`.

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

### Rapport PDF par fuite

Bouton **Rapport PDF** sur la fiche d'une fuite, et **Rapports PDF (n)** sur la liste (toutes les fuites
affichées après filtres, une fuite par page dans un seul fichier, barre de progression) ; droit
« exports / lire ». Module `src/lib/export/rapport-fuite.ts`, chargé au clic (jsPDF + autotable, comme les
exports ; en-tête dessiné par `dessinerEntete` de `pdf.ts`). Contenu : en-tête du marché ; identification
(N°, référence client, origine, statut, dates de détection et jalons du client, zone, secteur, adresse,
**coordonnées GPS** en degrés décimaux et sexagésimaux avec lien vers la carte, précision) ; réparations
(équipe, chef, constat, travaux, fouille et volume, emplacement, revêtement, représentant du maître
d'ouvrage, ouvriers, pièces posées, observation) ; réfections (nature FR / AR, dimensions, ou motif) ;
quantités et prix du bordereau **seulement** avec le droit « quantités / lire » ; photos rangées par type
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
  OpenStreetMap, sans compte ni clé, attribution OSM affichée par le style). Pas d'image satellite.
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
- **Impression** (« Imprimer la carte », droit « exports / lire ») : format A4 / A3, portrait / paysage, titre, liste des
  fuites affichées en option. PDF fabriqué dans le navigateur (`src/lib/export/carte-pdf.ts`, jsPDF chargé au clic) :
  en-tête du marché (`dessinerEntete`, logos compris), filtres appliqués, vue affichée rendue hors écran par MapLibre à
  200 dpi (`carte/capture.ts`, couches communes `carte/couches.ts` ; même zoom qu'à l'écran si la vue tient dans le cadre,
  textes réduits à 77 % au plus, sinon recadrage), numéro à côté de chaque point, graduations en degrés, cartouche
  (légende, échelle juste à la latitude du centre, nord, coordonnées WGS84 du centre et des coins), © OpenStreetMap,
  bandeau si le fond est indisponible, liste paginée, « Page n / N ». Gabarit générique réglable (`GABARIT` en tête de
  `carte-pdf.ts`) en attendant le modèle de la SRM. Mesures : A4 paysage 1,8 s, 0,4 Mo ; A3 paysage 0,9 Mo.
  Vérification : `node scripts/verifier-carte-pdf.mjs`.
- Hors périmètre pour l'instant : tracés GPS des agents, zones colorées selon le balayage (après le plan du réseau).

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
- **Hors périmètre** : modifier une fuite existante sans réseau ; la liste des fuites hors ligne (une fiche
  gardée s'ouvre par l'historique, un lien ou la réouverture de l'application) ; la détection des doublons
  (re-détection) est muette sans réseau.
- Limite : la session reste valable tant que le jeton se rafraîchit ; après une très longue coupure,
  il faut se reconnecter en ligne (les envois en attente sont conservés).

## Variables d'environnement (Vercel et `web/.env.local`)

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://osajiinsibwrsltntmsk.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé « anon / publishable » de *Project Settings > API Keys* |

| `NEXT_PUBLIC_NOM_ORGANISATION` | facultative : nom affiché à la connexion (défaut STEPAG) |
| `NEXT_PUBLIC_DOMAINE_AGENTS` | facultative : domaine technique des identifiants (défaut `agents.stepag.ma`, même valeur que `DOMAINE_AGENTS` de la fonction serveur) |

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
