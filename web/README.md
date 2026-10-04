# Panneau web et mode terrain (version rapide)

Application Next.js 15 (App Router, TypeScript), hébergée sur Vercel. Elle parle directement
à Supabase depuis le navigateur : la **RLS** de la base fait la sécurité, il n'y a aucun secret
côté client. Les comptes sont créés par la fonction serveur `supabase/functions/gerer-utilisateurs`.

Une seule application, utilisable sur ordinateur (bureau, responsable) et sur la tablette Samsung
(navigateur Chrome, « Ajouter à l'écran d'accueil » pour l'installer comme une application).
C'est la **version rapide de test** : mode hors ligne léger pour la création de fuites (voir plus bas),
pas de GPS en arrière-plan ; l'APK Expo prévu dans CLAUDE.md viendra après validation du parcours.

## Écrans

| Écran | Qui | Contenu |
|---|---|---|
| `/connexion` | tous | identifiant + mot de passe |
| `/fuites` | tous les affectés | liste, filtres (statut, secteur, texte, alertes), export Excel (CSV) |
| `/carte` | tous ceux qui lisent les fuites | carte des fuites du marché (fond OpenStreetMap minimal, sans satellite) : couleur par statut (mêmes couleurs que les badges, les pastilles servent de légende et de filtre), halo rouge si alerte, regroupement des points serrés (toucher un groupe zoome dessus), bulle (N°, référence, statut, zone et secteur, adresse, date, alertes, « Ouvrir la fiche », « Y aller » : itinéraire Google Maps vers la fuite) ; filtres statut, secteur, période de détection, alertes seulement ; « Recentrer » (fuites affichées, sinon contour du secteur, sinon Oujda) ; contours des zones et secteurs dessinés seulement si `geom` est rempli. Voir § Carte |
| `/fuites/nouvelle` | droit « fuites / créer » | GPS, référence SRM, secteur, photos, détection des doublons (rayon ou référence) |
| `/fuites/[id]` | selon droits | détail, photos, suivi SRM, réparations (fouille, pièces), réfections ou clôture sans réfection, quantités et prix, verrouillage, statut, suppression logique |
| `/parametres` | droits « parametres », « ouvriers », « evenements » | onglets **Marché** (titulaire, maître d'ouvrage, délai, OS, arrêts et reprises, libellés et alertes du client), **Bordereau** (avenants, nouvelle version d'un article avec avenant ou motif, historique, articles hors bordereau), **Attachement** (règles par marché), **Événements** (journal filtrable, pièces jointes, export, catégories), ouvriers, équipes, motifs, **Secteurs** (zones et secteurs : code, libellé, zone, ordre, linéaire), **Natures de réfection** (libellés FR / AR, symbole, emplacement, article lié, réfection nécessaire), **Catalogue des pièces** (recherche, famille, unité, article suggéré) ; bouton **Règles** d'un article (famille, matériaux, diamètres : modification directe, sans nouvelle version) ; on désactive, on ne supprime pas |
| `/attachements` | droit « attachements » | lots d'attachement : reste à attacher, nouveau lot, liste (brouillons, arrêtés, acceptés, facturés) |
| `/attachements/[id]` | droit « attachements » | en-tête et mentions du CPS (le titre suit la saisie ; numéro « prévu » d'un brouillon), récapitulatif par article (antérieur, lot, cumul, %), travaux du lot et sélection « À attacher » en listes compactes zébrées, une ligne par fuite (N° de fuite cliquable : fiche, photos dans un nouvel onglet ; filtres, cases par fuite et par article), ligne libre, réfection anticipée, refacturation forcée (admin), arrêt définitif, réouverture (admin), suivi (acceptation, facture) ; page élargie (écran de bureau) |
| `/en-attente` | tous | fuites saisies sur la tablette et pas encore reçues ; envoi manuel, erreurs, abandon |
| `/marches` | administrateur | liste des marchés, activer / désactiver (un marché désactivé n'est plus proposé aux agents), créer un marché vide ou en copiant les paramètres d'un marché existant (`copier_marche`) |
| `/utilisateurs` | administrateur | créer un agent, rôles par marché, changer le mot de passe, révoquer / réactiver |

## Exports (panneau « Exporter »)

Ouvert par **Exporter** (liste des fuites, fiche d'un lot d'attachement, journal des événements) : panneau
à droite, la liste reste visible. Modèles enregistrés par marché (« État journalier SRM », « Pièces posées
par secteur », « Attachement du mois » par défaut, d'autres s'enregistrent), colonnes cochées par thème
avec Tout / Rien, filtres (période, zone, secteur, équipe ; « limiter à la liste affichée »), regroupement
avec sous-totaux, synthèse des pièces, format, orientation, aperçu des premières lignes. En-tête tiré de la
fiche du marché (titulaire, maître d'ouvrage, n° du marché, objet, OS) ; un lot en brouillon porte « PROJET ».

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
- Hors périmètre pour l'instant : impression PDF de la carte, tracés GPS des agents, balayage.

## Mode hors ligne léger

- **Nouvelle fuite** : toujours enregistrée d'abord sur la tablette (IndexedDB : fiche + photos déjà
  compressées), puis envoyée. Sans réseau ou en cas de coupure, elle reste en attente et part toute seule
  (retour du réseau, retour sur l'application, toutes les 30 s). Un bandeau indique l'état.
- Les identifiants (uuid) sont créés sur l'appareil : renvoyer ne crée jamais de doublon. Les données
  locales ne sont effacées qu'après confirmation du serveur.
- Mis en cache : liste des secteurs, profil / marchés / droits du dernier utilisateur connecté
  (effacés à la déconnexion), pages de l'application (service worker `public/sw.js`, actif en production).
- **Hors périmètre** : consulter ou modifier une fuite existante sans réseau ; la détection des
  doublons (re-détection) est muette sans réseau.
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
