# Essai de charge : 3 000 fuites (session du 2026-10-07)

> Question d'Issam : l'application reste-t-elle fluide avec 3 000 fuites (photos, balayages, tracés) ?
> Essai fait **en local uniquement** (PostgreSQL 17 + PostGIS, PostgREST, relais d'authentification) ; la base de
> production n'a pas été touchée. Outils et marche à suivre : [`outils/charge/`](../outils/charge/README.md).

## 1. Réponse courte

- **Oui pour les écrans de suivi** (liste, alertes, à faire, tableau de bord, marchés, carte des fuites) : après les
  correctifs, toutes les pages reçoivent leurs données en **moins de 2 s**, même en profil « tablette 4G »
  (processeur ÷ 4, 80 ms, 10 Mbit/s). Avant : 2,1 à 3,3 s sur ce profil.
- **Un vrai défaut corrigé** : l'état de balayage de la carte était **tronqué à 1 000 tronçons** sans aucun message
  (plafond « Max rows » de l'API Supabase). Au bout d'un an (44 000 tronçons balayés), la carte en coloration
  « balayage » aurait montré 2 % du travail fait.
- **Non pour la carte avec tout le réseau** : 20 à 25 s et 0,4 à 1 Go de mémoire sur le Mac, **64 s et 1,3 Go en
  profil tablette**. C'est le dessin de 44 000 tronçons en GeoJSON, sans lien avec le nombre de fuites : chantier
  « tuiles vectorielles » séparé (chiffres au § 6).
- **Quotas du Supabase gratuit** : la base tient (≈ 120 Mo après un an, 274 Mo pour 12 000 fuites, sur 500 Mo) ; **les
  photos non** : ≈ 2,7 Go par an pour 1 Go gratuit, plein vers le 4e mois. Cloudflare R2 devient indispensable.

## 2. Jeu d'essai

Généré par `outils/charge/generer-charge.sql` sur le marché DEMO (déterministe, déclencheurs actifs : numérotation,
statuts, lignes de prix et journal tels qu'en production) :

| Objet | Lignes | Remarque |
|---|---:|---|
| Fuites | 3 025 | 3 000 + 25 de démonstration ; 12 derniers mois, lundi-samedi 7 h-18 h, secteurs au prorata des tronçons, position sur un tronçon |
| Statuts | — | achevée 2 455, sans réparation 194, réparée 222, en réparation 39, détectée 115 (selon l'âge) |
| Réparations / pièces posées / réfections | 2 911 / 5 320 / 2 169 | 40 articles Dolibarr activés |
| Lignes de quantités | 8 104 | proposées par la base |
| Photos (lignes, sans fichier) | 11 889 | ≈ 4 par fuite, 240 Ko en moyenne déclarés |
| Réseau | 44 044 tronçons (1 541 km), 30 820 nœuds | plan réel de la base d'essai du lot S |
| Balayages | 48 461 | un an : 2 équipes × 4 km par jour ouvré, + 10 % de seconds passages |
| Journal | 39 492 | |

Comptes d'essai : agent de détection (droits du modèle « détection ») et responsable (modèle « responsable ») de
DEMO ; administrateur pour la page des marchés.

## 3. Temps SQL sous RLS

`outils/charge/mesurer-sql.sql`, rôle `authenticated` avec la RLS du compte, médiane de 3, Mac (local) :

| Lecture | Agent détection | Responsable | Volume JSON |
|---|---:|---:|---:|
| `v_fuites` toutes colonnes, 3 025 fuites | 54 ms | 55 ms | 4,7 Mo |
| `v_fuites` première page de 1 000 | 22 ms | 28 ms | 1,6 Mo |
| `v_fuites` colonnes de la liste | 38 ms | 45 ms | 2,2 Mo |
| `v_fuites` statuts de tous les marchés (ancienne page Marchés) | 9 ms | 10 ms | 217 Ko |
| `compter_fuites()` (nouvelle) | — | 1 ms | 0,4 Ko |
| `v_fuites` en alerte (372) | 43 ms | 44 ms | 571 Ko |
| `v_a_attacher` reste ≠ 0 (ancien tableau de bord) | 2 ms (aucun droit) | 55 ms, 8 088 lignes | 1,1 Mo |
| `resume_a_attacher` (nouvelle) | 4 ms | 53 ms | 1 Ko |
| `etat_balayage` (ancienne, en lignes) | 94 ms, 44 044 lignes | 89 ms | 9,8 Mo |
| `etat_balayage_compact` (nouvelle, un document) | 207 ms | 187 à 274 ms | 3,4 Mo |
| `reseau_geojson` du plus gros secteur | 222 ms | 174 ms | 3,0 Mo |
| `reseau_geojson` de tout le réseau | 1 131 ms | 838 ms | 15 Mo |

Premier passage à froid : jusqu'à 350 ms pour `v_fuites`. Le plan est bon (parcours de l'index
`(marche_id, numero)`, jointures latérales indexées, fonctions de droits évaluées une fois). **Le SQL n'est pas le
goulot à 3 000 fuites.** Le Supabase gratuit (Nano, processeur partagé) sera plus lent que le Mac : rien n'a été
mesuré sur la production, prévoir un facteur 2 à 4. La liste de l'APK (200 dernières, colonnes réduites) : 100 ms.

## 4. Lectures de chaque page (API, avant / après)

`outils/charge/mesurer-pages.mjs`, compte responsable (Marchés : administrateur), PostgREST local sans latence,
médiane de 3 ; « compressé » = gzip, ce que reçoit un navigateur si l'API compresse (Supabase le fait d'ordinaire :
**à vérifier une fois dans l'onglet Réseau du navigateur sur la production**).

| Page | Avant : durée / brut / compressé / appels | Après : durée / brut / compressé / appels |
|---|---|---|
| Fuites | 388 ms / 4,6 Mo / 382 Ko / 4 en série | 264 ms / 2,3 Mo / 273 Ko / 2 vagues |
| Alertes | 346 ms / 4,6 Mo / 381 Ko / 4 en série | 90 ms / 0,5 Mo / 62 Ko / 1 |
| À faire | 246 ms / 4,6 Mo / 381 Ko / 4 en série | 191 ms / 2,3 Mo / 271 Ko / 2 vagues |
| Tableau de bord | 689 ms / 3,3 Mo / 314 Ko / 17 (dont 9 en série pour `v_a_attacher`) | 214 ms / 1,9 Mo / 166 Ko / 10 |
| Marchés | 47 ms / 226 Ko / 3 Ko / 4 en série | 9 ms / 3 Ko / 1 Ko / 1 |
| Carte (fuites, contours, état de balayage) | 200 ms / 2,0 Mo / 276 Ko, **état tronqué à 1 000** | 640 ms / 5,1 Mo / 1,3 Mo, **état complet (44 044)** |

Avec la latence réelle (Oujda → Paris, 4G), chaque appel « en série » coûte un aller-retour de plus : c'est ce que
supprime la lecture 3 par 3. La carte « après » est plus lourde parce qu'elle reçoit enfin tout l'état de balayage
(1,06 Mo compressé) ; il n'est lu que si le réseau est affiché.

## 5. Dans le navigateur (avant / après)

`outils/charge/mesurer-navigateur.mjs` : panneau construit (`next start`), Chrome sans interface, base locale,
relais gzip. « Données reçues » : fin de la dernière réponse de l'API depuis l'ouverture de la page ; « tâches
longues » : temps où le navigateur est bloqué (> 50 ms d'un coup), rendu compris.

**Profil bureau** (Mac, réseau local) :

| Page | Avant : données / tâches longues / tas JS | Après |
|---|---|---|
| Fuites | 1,2 s / 474 ms / 42 Mo | 0,6 s / 415 ms / 28 Mo |
| Alertes | 0,7 s / 877 ms / 44 Mo | 0,5 s / 583 ms / 24 Mo |
| À faire | 1,4 s / 271 ms / 60 Mo | 0,5 s / 201 ms / 50 Mo |
| Tableau de bord | 2,5 s / 276 ms / 64 Mo | 0,9 s / 269 ms / 74 Mo |
| Carte (sans réseau) | 1,7 s / 643 ms / 38 Mo | 0,6 s / 775 ms / 81 Mo |

**Profil tablette** (processeur ÷ 4, 80 ms, 10 Mbit/s) :

| Page | Avant : données / tâches longues | Après |
|---|---|---|
| Fuites | 2,7 s / 1,9 s | **1,3 s** / 1,9 s |
| Alertes | 2,1 s / 3,1 s | **1,1 s** / 2,2 s |
| À faire | 3,3 s / 1,4 s | **1,7 s** / 1,2 s |
| Tableau de bord | 2,6 s / 1,9 s | **1,2 s** / 1,4 s |
| Marchés | 0,4 s | 0,5 s |
| Carte (sans réseau) | 1,5 s / 8,5 s | 0,8 s / 8,3 s |

Les 8 s de tâches longues de la carte viennent de MapLibre en rendu WebGL **logiciel** (Chrome sans interface) : à
lire comme un ordre de grandeur, pas comme le temps sur la tablette (qui a un vrai processeur graphique). Le rendu
de la liste reste sous 2 s de blocage cumulé : 20 lignes par page de tableau, filtres en mémoire sur 3 000 lignes.

## 6. Carte avec tout le réseau (non corrigé ici, chantier « tuiles vectorielles »)

Réseau activé, coloration « balayage », 34 secteurs cochés :

| Profil | Durée jusqu'au réseau complet | Tâches longues | Tas JS | Mémoire des processus de rendu | Reçu (compressé / décodé) |
|---|---:|---:|---:|---|---|
| Bureau, avant | 21,7 s | 16,6 s | 372 Mo | 435 Mo (+ 116 Mo processeur graphique) | 3,6 Mo / 27,7 Mo |
| Bureau, après | 23,5 s | 17,6 s | 398 Mo | 1 017 Mo (+ 140 Mo) | 4,4 Mo / 28,8 Mo |
| Tablette, après | 64,1 s | 56,1 s | 239 Mo | 1 308 Mo (+ 147 Mo) | 3,2 Mo / 19,8 Mo |

- Volume : 14,7 Mo de GeoJSON (1,9 Mo compressé) pour les tronçons, 7,8 Mo (0,9 Mo) pour les nœuds au zoom ≥ 15 ;
  le cache IndexedDB évite de les retélécharger, pas de les redessiner.
- Le temps passe dans le navigateur (34 appels de 75 ms en moyenne côté serveur) : chaque secteur chargé refait
  les sources de la carte.
- La mémoire varie beaucoup d'un essai à l'autre (ramasse-miettes) : retenir **0,4 à 1,3 Go**. Une tablette Samsung
  de milieu de gamme (3 à 4 Go) risque de fermer la WebView de l'APK (écran Balayage).
- En profil bureau, 62 à 64 appels pour 34 secteurs : des secteurs rechargés après une annulation (zoom) ; corrigé
  par la branche `claude/reseau-simplification` (pas encore fusionnée).
- Piste : tuiles vectorielles (PMTiles ou fonction `ST_AsMVT`) portant aussi l'état de balayage, pour ne plus envoyer
  44 000 identifiants à chaque ouverture.

## 7. Correctifs (cette PR)

Base, migration `20261007120000_essai_charge.sql` (SECURITY INVOKER : la RLS de l'appelant s'applique ; test
`17_essai_charge.test.sql`, 22 tests) :

- `compter_fuites(marché)` : fuites par marché et statut ; onglets de la liste (comptes exacts même au-delà du
  plafond), page des marchés (ne lit plus une ligne par fuite de tous les marchés).
- `resume_a_attacher(marché)` : reste à attacher par article ; le tableau de bord ne lit plus 8 000 unités en
  9 appels successifs.
- `etat_balayage_compact(marché, secteurs)` : l'état de balayage en un seul document JSON en colonnes (non plafonné,
  3,4 Mo au lieu de 9,8 Mo en lignes) ; `etat_balayage` reste pour la compatibilité.

Panneau web :

- `lireTout` : après une première page pleine, les suivantes partent 3 par 3 ; au plafond, le résultat porte
  `tronque` et la page affiche **« Affichage incomplet »** (liste, alertes, à faire, tableau de bord ; carte : message
  dans la barre de la carte). Les pages lisent par numéro décroissant : ce sont les plus anciennes qui manquent. Un
  export refuse de sortir un fichier tronqué. Vérifié sur une base de 12 025 fuites : « 10 000 affichées sur
  12 025 », onglet « Toutes 12025 ».
- Colonnes réduites (`src/lib/colonnes-fuites.ts`, types qui suivent la liste) au lieu de `select('*')` : liste et
  « À faire » (moitié du volume), « Alertes » (fuites en alerte et lignes des courbes des 14 jours seulement : 584 au
  lieu de 3 025), tableau de bord (les 10 dernières fuites lues à part).
- « Alertes » : la page entière ne se redessine plus chaque seconde (seule l'horloge le fait).
- Courbe « Réfections à faire » : une fuite achevée sans réfection (terrain naturel) n'est plus comptée « en attente »
  pour toujours (défaut trouvé en préparant le filtre des alertes).
- Replis : sans les nouvelles fonctions (migration pas encore déployée, mode démonstration), chaque page reprend
  l'ancienne lecture ; vérifié en mode démonstration.

Vérifications : 648 tests pgTAP (PostgreSQL 17 + PostGIS 3.6), `tsc`, `next build`, 9 scripts dont
`web/scripts/verifier-essai-charge.mjs` (11).

## 8. Volumes et quotas du Supabase gratuit

| Ressource | Mesure | Quota gratuit | Verdict |
|---|---|---|---|
| Base | 53 Mo sans activité (réseau compris : 31 Mo) ; **120 Mo** après un an à 3 000 fuites ; 274 Mo à 12 025 fuites | 500 Mo | tient ; le **journal** est la plus grosse table (36 Mo par an, 155 000 lignes à 12 000 fuites) |
| Fichiers (photos) | 11 889 photos × 240 Ko ≈ **2,7 Go par an** | 1 Go | plein vers le **4e mois** : R2 (10 Go gratuits) à activer avant |
| Trafic sortant | ≈ 270 Ko compressés par ouverture de liste ; 1,9 Mo à la première ouverture du réseau par appareil, puis 1,1 Mo d'état de balayage à chaque ouverture | 5 Go par mois (à confirmer sur la page « Usage ») | ordre de grandeur pour 10 comptes × 30 pages par jour : 2 à 3 Go par mois, photos consultées en plus ; à surveiller |
| Tracés GPS | non mesurés (fonction pas encore écrite) | | garder « un tracé par agent et par jour » (CLAUDE.md § 8) |

## 9. Limites de l'essai

- Tout est local : ni la latence réelle vers Paris, ni le processeur partagé du plan Nano, ni la compression réelle de
  l'API Supabase n'ont été mesurés.
- Le profil « tablette » ralentit le processeur et le réseau d'un Mac ; il ne remplace pas un essai sur la tablette
  Samsung (surtout pour la carte et la mémoire).
- Photos sans fichier : ni envoi, ni miniatures, ni rapports PDF avec images n'ont été chargés.

## 10. Suites proposées

1. Tuiles vectorielles du réseau (chantier séparé) : c'est le seul écran qui ne tient pas à 3 000 fuites, et il ne
   dépend pas du nombre de fuites.
2. Activer R2 dès la carte bancaire disponible (photos).
3. Une fois en production : ouvrir la liste des fuites avec l'onglet Réseau du navigateur pour confirmer la
   compression, et suivre la page « Usage » de Supabase (base, fichiers, trafic) chaque mois.
4. Purge ou archivage du journal au-delà de 12 à 18 mois si la base approche 400 Mo.
