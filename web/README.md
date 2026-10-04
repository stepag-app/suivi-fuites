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
| `/fuites/nouvelle` | droit « fuites / créer » | GPS, référence SRM, secteur, photos, détection des doublons (rayon ou référence) |
| `/fuites/[id]` | selon droits | détail, photos, suivi SRM, réparations (fouille, pièces), réfections ou clôture sans réfection, quantités et prix, verrouillage, statut, suppression logique |
| `/parametres` | droits « parametres », « ouvriers », « evenements » | onglets **Marché** (titulaire, maître d'ouvrage, délai, OS, arrêts et reprises, libellés et alertes du client), **Bordereau** (avenants, nouvelle version d'un article avec avenant ou motif, historique, articles hors bordereau), **Attachement** (règles par marché), **Événements** (journal filtrable, pièces jointes, export, catégories), ouvriers, équipes, motifs ; on désactive, on ne supprime pas |
| `/attachements` | droit « attachements » | lots d'attachement : reste à attacher, nouveau lot, liste (brouillons, arrêtés, acceptés, facturés) |
| `/attachements/[id]` | droit « attachements » | en-tête et mentions du CPS, récapitulatif par article (antérieur, lot, cumul, %), travaux par fuite, sélection « À attacher » (filtres, cases par fuite et par article), ligne libre, réfection anticipée, refacturation forcée (admin), arrêt définitif, réouverture (admin), suivi (acceptation, facture) |
| `/en-attente` | tous | fuites saisies sur la tablette et pas encore reçues ; envoi manuel, erreurs, abandon |
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
| Excel | `write-excel-file` | 19 Ko | styles, fusions, largeurs, ligne figée ; exceljs 263 Ko ; SheetJS 92 Ko, sans styles en version libre |
| PDF | `jspdf` + `jspdf-autotable` | 140 Ko | tableaux paginés ; pdf-lib 535 Ko et sans mise en page de tableaux |
| Word | `docx` | 112 Ko | tableaux, en-tête répété, pied paginé, police embarquée |
| CSV | aucune | — | séparateur « ; », virgule décimale |

**Arabe** : police Amiri (SIL OFL, `public/polices/`), chargée seulement si le document contient de l'arabe.
Word : vrai texte de droite à gauche, police embarquée dans le fichier. Excel : vrai texte. PDF : jsPDF lie mal
certains textes (parenthèses, lettres marocaines ݒ ݣ) ; chaque texte arabe y est composé par le navigateur
avec Amiri puis inséré en image nette (non sélectionnable), le reste du PDF est du vrai texte.

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
