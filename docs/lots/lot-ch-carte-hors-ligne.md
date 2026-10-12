# Lot CH : carte de balayage utilisable sans réseau

> Fiche de cadrage (2026-10-12), **version 2 après les réponses d'Issam** (§ 10, le 2026-10-12 vers 00 h 30).
> Mesures faites le 2026-10-12 sur le Mac (extrait réel du fond de carte d'Oujda, polices réelles). Réalisation :
> `web/README.md` § Carte sans réseau, `outils/fond-carte/`.

## 0. Objectif

Sur la tablette, l'écran **Balayage** (WebView de `/carte?mode=balayage`) doit rester complet sans réseau : conduites,
secteurs, diamètres, matériaux, nœuds **et rues avec leurs noms**, à tous les zooms ; toucher, lasso, « Prolonger » ;
balayages enregistrés en file d'attente comme aujourd'hui. Pour cela, quand la tablette a du réseau (Wi-Fi ou 4G), elle
**télécharge d'avance** tout ce qu'il faut pour le marché, une fois, puis seulement quand quelque chose change.

## 1. Constat : ce qui se passe aujourd'hui sans réseau

Lecture du code (à confirmer à l'essai, mais sans ambiguïté) ; la réponse du 2026-10-12 (« en partie, zones déjà vues »)
était trop optimiste :

| Élément | Aujourd'hui sans réseau |
|---|---|
| Écran Balayage de l'APK | **ne s'ouvre pas** : l'APK sonde le panneau avant d'ouvrir la WebView et affiche « La carte du réseau a besoin de la connexion » (`mobile/src/balayage.tsx`) |
| Panneau dans un navigateur | la page s'ouvre (service worker), mais la liste des zones et secteurs est lue en ligne (`chargerContexteReseau`) : sans elle, **aucun réseau dessiné** |
| Tuiles du réseau | l'URL signée est demandée à la fonction `reseau-tuiles` avant toute lecture : hors ligne, échec, puis repli GeoJSON (qui a lui aussi besoin de la liste des secteurs) |
| Plages déjà lues | gardées (Cache Storage `suivi-fuites-tuiles`), mais inaccessibles sans l'URL signée |
| Fond de carte OpenFreeMap | jamais gardé : fond uni |
| État de balayage | jamais gardé (relu à chaque ouverture) |
| Balayages enregistrés | file d'attente IndexedDB : **marche** (comptés, envoyés au retour du réseau) |

## 2. Le « paquet hors ligne » d'un marché (mesures pour Oujda)

| Élément | Source | Taille | Change quand |
|---|---|---:|---|
| Archive du réseau (conduites, nœuds, diamètres, matériaux, secteurs) | R2 privé, existant (X5) | **4,7 Mo** | « Régénérer les tuiles » (import, zonage) |
| Fond de carte (rues, noms, bâtiments, eau, verdure, points d'intérêt), zooms 0 à 15, agrandi au-delà | **nouveau** : extrait Protomaps dans R2 privé (§ 3) | **3,3 Mo** (ville + 5 km, 534 tuiles, retenu) ; 2,8 Mo (ville + 1 km) | mise à jour du fond (§ 5) |
| Polices des noms (Noto Sans, trois graisses, lettres latines **et arabes**) et icônes | fichiers du panneau (`web/public/fond/v1/`) | ≈ 3 Mo | jamais (ou presque) |
| Style du fond (couleurs, couches) | code du panneau (`@protomaps/basemaps`, BSD-3) | ≈ 30 Ko | mise en ligne du panneau |
| Géométrie pour le lasso et « Prolonger » | base, existant (cache IndexedDB par secteur) | ≈ 15 Mo sur la tablette, 1 à 4 Mo transférés (compressé) | zonage d'un secteur |
| Zones, secteurs, linéaires | base, **gardé en plus** | < 0,3 Mo | à chaque ouverture en ligne |
| État de balayage (dernière copie) | base, **gardé en plus** | < 1 Mo | à chaque ouverture en ligne |
| Pages et scripts de la carte (MapLibre compris) | service worker, **gardés d'avance** | ≈ 1 Mo compressé | mise en ligne du panneau |

**Premier téléchargement : ≈ 12 Mo par tablette et par marché. Place sur la tablette : ≈ 30 Mo.**

## 3. Fond de carte : source, licence, style

- **Source** : **Protomaps Basemap**, construit chaque jour à partir d'OpenStreetMap (`build.protomaps.com`, archive
  PMTiles de la planète, 139 Go). On n'en garde que la ville : `pmtiles extract … --bbox=<réseau + marge> --maxzoom=15`
  lit seulement les morceaux utiles (vérifié le 2026-10-12 sur le build du 11 octobre : **20 s, 3 Mo transférés**,
  archive de 2,8 Mo). Rues, noms et bâtiments d'OSM à jour au 11 octobre.
- **Licence** : données © OpenStreetMap (ODbL) : la mention « © OpenStreetMap » reste affichée (déjà le cas) ;
  basses échelles Natural Earth (domaine public) ; style `@protomaps/basemaps` (BSD-3) ; polices Noto (OFL). Usage
  interne, sans redistribution de la base : pas d'obligation de partage. Pas de compte, pas de clé, gratuit.
- **Style** : variante claire de Protomaps (« light »), **complète** (Issam : « qualité supérieure et plus de
  détail ») : rues hiérarchisées, noms des rues et des quartiers, bâtiments, eau, parcs, **points d'intérêt avec leurs
  icônes** (feuilles simple et double densité). Pas de satellite (inchangé : en ligne seulement, C5).
- **Noms** (Issam : « afficher noms de rues soit arabe ou français ») : sur 1 626 noms de voies de l'extrait, 1 610 sont
  en lettres latines, 16 en arabe. Français s'il existe, nom local (souvent arabe) en seconde ligne ; tablette en arabe :
  arabe d'abord. Polices arabes fournies ; MapLibre 6 met lui-même l'arabe en forme (aucun module à ajouter).
- **Où** : `fonds/<marche_id>/fond.pmtiles` dans le compartiment R2 privé, à côté de l'archive du réseau, délivré par la
  même fonction `reseau-tuiles` (URL signée, paramètre `fichier : 'fond'`). R2 : 3 Mo, une lecture par tablette et par
  mise à jour : gratuit.
- **Sur quelle carte** : sur la **tablette**, dès que le paquet est téléchargé, la carte de balayage prend ce fond
  **même en ligne** (même rendu partout, aucune tuile de fond en 4G). Le panneau du bureau garde OpenFreeMap (monde
  entier) ; la carte imprimée ne change pas.
- **Écarté** : OpenFreeMap hors ligne (aucun extrait par ville ; il faudrait refabriquer les tuiles soi-même avec
  Planetiler et le Maroc entier, ou aspirer leurs tuiles) ; fond en images (plusieurs dizaines de Mo, flou au zoom).

## 4. Fonctionnement sur la tablette

1. **Téléchargement** : à l'ouverture de l'écran Balayage **avec réseau**, en arrière-plan, sans gêner la carte : si la
   copie est absente ou si l'archive a changé (ETag), l'archive du réseau entière est téléchargée (une requête), puis le
   fond, les polices et la géométrie manquante. L'ancienne copie reste en service jusqu'à ce que la nouvelle soit
   complète. Une coupure reprend à la prochaine ouverture.
2. **Indicateur** dans l'onglet Balayage du panneau Réseau : « Carte hors ligne : prête (réseau du 10/10, fond du 11/10) »,
   ou « téléchargement 45 % », ou « pas encore téléchargée ».
3. **Lecture** : une fois la copie complète, les tuiles (réseau et fond) sont lues **dans la tablette**, jamais par le
   réseau, en ligne comme hors ligne : plus rapide, sans 4G.
4. **Sans réseau** : l'APK ouvre directement la carte si le panneau lui a signalé « carte prête » **pour le compte
   connecté** (sinon « ouvrez-la une fois avec du réseau » : les balayages partiraient au nom de l'agent précédent). Le service worker sert la page et ses scripts ; zones, secteurs et géométrie viennent de la tablette ; état
   de balayage = dernière copie **plus les balayages en attente** (affichés balayés tout de suite) ; bandeau « Hors
   ligne : état du balayage du 12/10 à 09:40 ». La session déjà gardée par le panneau suffit (pas de passage par
   `/session`, qui a besoin du réseau).
5. **Retour du réseau** : envoi de la file d'attente (existant), relecture de l'état, contrôle des versions.
6. **Limites** : la toute première ouverture se fait avec réseau ; la bulle d'un tronçon affiche « balayé le … par … »
   de la dernière copie ; les autres écrans de la WebView (mini-carte de la nouvelle fuite) ne sont pas dans ce lot.

## 5. Mises à jour

- **Réseau** : inchangé : Paramètres › Réseau › « Régénérer les tuiles » ; chaque tablette reprend la nouvelle archive
  (4,7 Mo) à sa prochaine ouverture avec réseau.
- **Fond** : script `outils/fond-carte/` sur le Mac (outil `pmtiles` officiel, emprise lue dans l'archive du réseau),
  puis dépôt du fichier dans Paramètres › Réseau › bloc **« Fond de carte hors ligne »** (administrateur : choisir le
  fichier, « Déposer » ; date et taille affichées). Claude peut le faire à la demande. Rythme proposé : au démarrage de
  chaque marché, puis **tous les trois mois** ou quand de nouvelles rues manquent. Le dépôt depuis le navigateur seul
  n'est pas possible (le serveur de Protomaps refuse les lectures d'un autre site, vérifié).
- **Pages et scripts** : à chaque mise en ligne du panneau, regardés à la prochaine ouverture en ligne.

## 6. Place sur la tablette

≈ 30 Mo par marché (Redmi Pad 2 : 128 Go). Rangé dans le stockage de la WebView de Suivi fuites (Cache Storage et
IndexedDB, privés à l'appli) ; demande de stockage « persistant » au navigateur : s'il la refuse, Android ne vide ce
stockage qu'en cas de mémoire saturée, et la carte se retélécharge alors à la prochaine ouverture en ligne.

## 7. Consommation 4G

- **Une fois** : ≈ 12 Mo par tablette et par marché (réseau 4,7, fond 3,3, polices et icônes 3, géométrie 1 à 4 compressée).
- **Ensuite** : rien pour le réseau ni le fond tant qu'ils ne changent pas ; à chaque ouverture en ligne, l'état de
  balayage et la liste des secteurs (quelques centaines de Ko, comme aujourd'hui).
- **Aujourd'hui**, chaque déplacement de la carte redemande des tuiles OpenFreeMap et des plages du réseau : le paquet
  **réduit** la 4G de la carte.
- Ordre de grandeur : 10 tablettes, une régénération du réseau par semaine → ≈ 50 Mo par semaine pour toute l'équipe.

## 8. Ce qui change dans le code

| Partie | Changement |
|---|---|
| `web/src/lib/reseau/tuiles.ts` | copie complète de l'archive (Cache Storage), source lue dans la copie, ETag comparé en ligne, sans appel à la fonction hors ligne |
| nouveau `web/src/lib/reseau/hors-ligne-carte.ts` | paquet : téléchargement, versions, état « prête », message à l'APK |
| `web/src/app/(app)/carte/` | style du fond local (Protomaps) sur la tablette, indicateur, bandeau hors ligne |
| `useReseau.ts`, `donnees.ts` | zones, secteurs, linéaires et état de balayage gardés ; balayages en attente fusionnés à l'état |
| `web/public/sw.js` | page de la carte, scripts, modules MapLibre et polices gardés d'avance |
| `web/public/fond/polices/` | polices Noto Sans (lettres latines), OFL |
| `supabase/functions/reseau-tuiles` | paramètre `fichier` (`reseau` ou `fond`) ; dépôt du fond : mêmes droits que les tuiles |
| Paramètres › Réseau | bloc « Fond de carte hors ligne » (date, taille, dépôt) |
| `outils/fond-carte/` | script d'extraction du fond pour un marché |
| `mobile/src/balayage.tsx` | sans réseau et carte prête : ouvrir la carte directement → **nouvelle APK** (publiée seulement à la demande d'Issam) |
| Base | **aucune migration** |

Sans la nouvelle APK, tout marche dans un navigateur, mais l'APK actuelle continue de refuser l'écran Balayage sans
réseau.

## 9. Essais prévus

- Panneau dans le navigateur intégré, réseau coupé (mode hors ligne du navigateur) : carte, zooms 10 à 19, toucher,
  lasso, Prolonger, enregistrement, retour du réseau et envoi.
- Script de vérification (format des copies, versions, fusion des balayages en attente) ; mesure de fluidité
  (`mesurer-carte.mjs`) avec le fond local.
- **Redmi Pad 2** (série nzxcijwchixklrij), avec l'accord d'Issam : appli DEV, mode avion, même parcours.

## 10. Questions pour Issam et réponses (2026-10-12)

Réponses : « d'accord pour toutes tes recommandations », avec ces précisions :
- 1 : oui, en **qualité supérieure** (style complet, points d'intérêt, sur des sources gratuites) ;
- 2 : **ville + 5 km** ;
- 3 : noms **en arabe ou en français** (polices arabes ajoutées) ;
- 4 : téléchargement **en 4G et en Wi-Fi** ;
- 5 : **garder** la copie à la déconnexion : la tablette change de main, un autre agent se reconnecte, le paquet sert
  aux deux (rangé par marché, pas par compte ; l'ouverture sans réseau reste liée au compte qui l'a préparée) ;
- 6 et 7 : oui. Réseau : tout charger (conduites, diamètres, secteurs, zones, nœuds, noms des rues).

Questions posées :

1. **Fond Protomaps épuré** (rues et noms, bâtiments, eau, verdure, sans points d'intérêt), utilisé **sur la tablette
   en ligne aussi** ; panneau du bureau inchangé : d'accord ?
2. **Emprise** : ville + 1 km (2,8 Mo, recommandé) ou ville + 5 km (3,3 Mo) ?
3. **Noms en arabe** : laisser de côté les 16 noms écrits seulement en arabe (recommandé) ou les afficher (+ 0,8 Mo) ?
4. **4G** : téléchargement permis en 4G (≈ 10 Mo la première fois, recommandé) ou Wi-Fi seulement ?
5. **Déconnexion** : effacer la copie du plan quand l'agent se déconnecte (recommandé : le plan n'est jamais public, la
   déconnexion est rare sur une tablette dédiée), ou la garder ?
6. **Mise à jour du fond** : par le script et le bloc « Fond de carte hors ligne », tous les trois mois : d'accord ?
7. **APK** : d'accord pour préparer la nouvelle APK (publiée seulement sur ta demande) et pour l'essai en mode avion
   sur la Redmi avec l'appli DEV ?
