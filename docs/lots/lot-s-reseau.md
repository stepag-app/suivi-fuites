# Lot S : plan du réseau (DWG), zonage, balayage par tronçon

> Contrat partagé entre quatre sous-lots menés en parallèle (session du 2026-10-06).
> Toute interface décrite ici (tables, fonctions, propriétés GeoJSON, routes) est **figée** pour la durée du lot :
> un sous-lot qui a besoin d'un changement le note dans sa PR au lieu de modifier l'autre côté.

## 0. Objectif

1. Convertir `Reseau aep oujda.dwg` (AutoCAD 2013, 162 Mo, hors dépôt) en tronçons WGS84 légers, vérifier le
   système de coordonnées (Lambert Nord Maroc / Merchich, EPSG:26191) contre le fond OpenStreetMap.
2. Zoner le réseau : chaque tronçon appartient à un secteur (donc à une zone) du marché ; zonage initial
   automatique (limites dessinées dans le DWG, noms des planches PDF), **corrigeable par l'administrateur** par
   sélection multiple (clic, rectangle, lasso) et par polygone, comme on allume un calque dans AutoCAD.
3. Afficher le réseau sur la carte (panneau web, puis APK), **activable ou non**, par zone et par secteur, avec
   légende ; colorer par secteur, par état de balayage ou par diamètre.
4. Cocher les tronçons balayés sur le terrain ; en déduire le **linéaire balayé par agent et par jour**, les nœuds,
   secteurs et zones balayés pour le **rapport journalier de détection** (CPS art. II-21) ; un tronçon n'est payé
   qu'une fois (CPS art. II-15, prix n° 1).
5. Rester léger : aucun service payant, aucun outil externe à l'exécution, pas de latence : GeoJSON par secteur
   servi par une fonction PostgreSQL (RLS), mis en cache sur l'appareil (IndexedDB), état de balayage lu à part.

## 1. Sous-lots, branches et périmètres de fichiers (disjoints)

| Sous-lot | Branche | Périmètre | Qui |
|---|---|---|---|
| S1 conversion DWG, zonage initial, fichiers d'import, documentation | `claude/lot-s1-conversion-reseau` | `outils/reseau/**`, `docs/**`, `supabase/README.md`, `web/README.md`, `mobile/README.md`, `data-private/reseau/**` (hors dépôt) | session principale |
| S2 base de données | `claude/lot-s2-base-reseau` | `supabase/migrations/20261006130000_reseau_balayage.sql`, `supabase/tests/database/15_reseau_balayage.test.sql` (numéros 20261006120000 et 13-14 pris par les lots P3 et P4 d'une autre session) | agent |
| S3 panneau web | `claude/lot-s3-web-reseau` | `web/src/app/(app)/carte/**`, `web/src/app/(app)/parametres/OngletReseau*.tsx` (+ 1 onglet dans `parametres/page.tsx`), `web/src/app/(app)/balayage/**`, `web/src/app/session/**`, `web/src/lib/reseau/**`, `web/src/lib/types.ts` (ajouts), `web/scripts/verifier-reseau.mjs`, `web/public/sw.js` (si nécessaire) | agent |
| S4 APK | `claude/lot-s4-apk-balayage` | `mobile/**` | agent |

Interdits à tous les sous-lots : `web/src/app/globals.css` (session principale), les migrations existantes, `CLAUDE.md`.

## 2. Données (S2) : tables

Conventions du dépôt (voir `supabase/README.md` § Règles) : RLS activée juste après `create table`, privilèges
explicites (`authenticated` et `service_role`), rien pour `anon`, pas de `delete` sur les données terrain,
fonctions `SECURITY DEFINER` dans `private` avec `set search_path = ''`, `revoke execute … from public`.
Marché désactivé : lecture seule (reprendre le mécanisme de `20261005120100_marche_inactif.sql`).

```sql
create table public.troncons (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  reference text not null,                  -- identifiant stable issu du dessin (handle AutoCAD), ex. 'H1A2B3C'
  calque text,                              -- calque AutoCAD d'origine
  categorie text not null default 'conduite'
    check (categorie in ('conduite', 'branchement', 'adduction', 'autre')),
  diametre_mm integer check (diametre_mm > 0),
  materiau text,                            -- texte du dessin (PEHD, PVC, FONTE, AC…), non normalisé
  zone_id uuid,
  secteur_id uuid,
  longueur_m numeric(10,2) not null,        -- posée par déclencheur : ST_Length(geom::geography)
  geom extensions.geometry(LineString, 4326) not null,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, reference),
  unique (id, marche_id),
  foreign key (zone_id, marche_id) references public.zones (id, marche_id),
  foreign key (secteur_id, marche_id) references public.secteurs (id, marche_id)
);
-- index : gist (geom), (marche_id, secteur_id) where actif

create table public.noeuds (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  reference text not null,
  type text not null default 'jonction'
    check (type in ('jonction', 'extremite', 'vanne', 'bouche_incendie', 'ventouse', 'vidange', 'compteur', 'reservoir', 'autre')),
  calque text,
  zone_id uuid,
  secteur_id uuid,
  geom extensions.geometry(Point, 4326) not null,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, reference),
  unique (id, marche_id),
  foreign key (zone_id, marche_id) references public.zones (id, marche_id),
  foreign key (secteur_id, marche_id) references public.secteurs (id, marche_id)
);

create table public.balayages (
  id uuid primary key default gen_random_uuid(),          -- créé sur l'appareil (hors ligne)
  marche_id uuid not null references public.marches (id),
  troncon_id uuid not null,
  date_balayage date not null default ((now() at time zone 'Africa/Casablanca')::date),
  balaye_le timestamptz not null default now(),
  equipe_id uuid,
  agent_id uuid references public.profils (id),           -- qui a balayé (défaut : auth.uid())
  saisi_par uuid references public.profils (id),          -- compte qui a saisi (défaut : auth.uid())
  source_saisie public.source_saisie not null default 'tablette',
  methode text check (methode in ('ecoute', 'correlation', 'prelocalisation', 'enregistreurs')),
  premier_passage boolean not null default true,          -- posé par déclencheur : aucun balayage antérieur non annulé du tronçon
  observation text,
  annule_le timestamptz,
  annule_par uuid references public.profils (id),
  motif_annulation text,
  cree_le timestamptz not null default now(),
  unique (id, marche_id),
  foreign key (troncon_id, marche_id) references public.troncons (id, marche_id),
  foreign key (equipe_id, marche_id) references public.equipes (id, marche_id),
  check (annule_le is null or motif_annulation is not null)
);
-- index : (marche_id, date_balayage), (troncon_id) where annule_le is null
```

Déclencheurs :
- `troncons` : `longueur_m` et `modifie_le` ; si `secteur_id` est fourni et `zone_id` nul → zone du secteur ; si
  `secteur_id` nul à l'insertion et que le marché a des secteurs avec `geom` → secteur contenant le **milieu** du
  tronçon (`ST_LineInterpolatePoint(geom, 0.5)`), sinon reste nul (« non zoné »).
- `noeuds` : même règle de zonage par le point.
- `balayages` : avant insertion, `agent_id` et `saisi_par` par défaut `auth.uid()` ; `premier_passage` = aucun autre
  balayage non annulé du même tronçon ; après insertion ou annulation, recalcul de `premier_passage` des autres
  lignes du tronçon et de `secteurs.statut_balayage` (`a_balayer` : aucun tronçon balayé ; `en_cours` : au moins
  un ; `balayee` : tous les tronçons actifs du secteur balayés). Pas d'`update` autre que l'annulation
  (`annule_le`, `annule_par`, `motif_annulation`) : refuser le reste par déclencheur.
- Pas de journalisation ligne à ligne sur `troncons` / `noeuds` (volume) ; journaliser (table `journal`, via
  `private.journaliser()` ou une entrée par appel) les affectations de secteur et les annulations de balayage.

RLS et privilèges :
- `troncons`, `noeuds` : lecture pour tout affecté au marché (`marche_id = any(mes_marches())`) ; insertion et
  modification : administrateur ou droit `parametres / modifier` (les écritures passent normalement par les
  fonctions ci-dessous) ; pas de suppression (on désactive).
- `balayages` : lecture avec `balayage / lire` ; insertion avec `balayage / creer` (le marché doit être actif) ;
  modification (annulation seulement) avec `balayage / supprimer` selon la portée (`siennes` : `agent_id` ou
  `saisi_par` = compte) ou `balayage / valider` ; aucune suppression physique.
- `service_role` : tous privilèges (comme `20261004130000_acces_service_role.sql`).
- Modèles de rôles (`modeles_droits`) : `detection` → `balayage` lire + créer + supprimer (siennes) ;
  `responsable` → lire, créer, modifier, supprimer (toutes), valider ; `chef_reparation` → lire. Vérifier les
  noms exacts des modèles dans `20261004090100_noyau_droits.sql` et compléter sans casser `appliquer_modele_role`.

## 3. Données (S2) : fonctions et vues (API figée)

Toutes en `public`, `grant execute … to authenticated, service_role` ; `SECURITY INVOKER` sauf mention.

| Fonction | Rôle | Droit |
|---|---|---|
| `importer_troncons(p_marche uuid, p_features jsonb) returns jsonb` | upsert par `(marche_id, reference)` depuis un tableau de Features GeoJSON (voir § 4) ; renvoie `{"inseres": n, "mis_a_jour": n, "ignores": n, "erreurs": [...]}` ; au plus 2 000 features par appel | administrateur (`SECURITY DEFINER`, comme `importer_produits_dolibarr`) |
| `importer_noeuds(p_marche uuid, p_features jsonb) returns jsonb` | idem pour les nœuds | administrateur |
| `reseau_geojson(p_marche uuid, p_secteurs uuid[] default null, p_sans_secteur boolean default false, p_tolerance double precision default 0) returns jsonb` | FeatureCollection des tronçons actifs du marché ; `p_secteurs` nul = tous les zonés ; `p_sans_secteur` ajoute les tronçons sans secteur ; `p_tolerance` > 0 : `ST_SimplifyPreserveTopology` (degrés) ; coordonnées à 6 décimales (`ST_AsGeoJSON(geom, 6)`) ; propriétés **courtes** : `id`, `s` (secteur_id), `z` (zone_id), `c` (categorie), `d` (diametre_mm), `m` (materiau), `l` (longueur_m) | RLS (lecture du marché) |
| `noeuds_geojson(p_marche uuid, p_secteurs uuid[] default null, p_sans_secteur boolean default false) returns jsonb` | FeatureCollection des nœuds ; propriétés `id`, `s`, `z`, `t` (type) | RLS |
| `etat_balayage(p_marche uuid, p_secteurs uuid[] default null) returns table (troncon_id uuid, premier_le date, dernier_le date, nb_passages integer, equipe_id uuid, agent_id uuid)` | état par tronçon (balayages non annulés), léger, lu à chaque ouverture de la carte | `balayage / lire` (sinon zéro ligne) |
| `affecter_troncons_secteur(p_secteur uuid, p_troncons uuid[]) returns integer` | affecte les tronçons (et leurs nœuds à moins de 1 m des extrémités) au secteur ; `p_secteur` nul = désaffecter ; recalcule les contours des secteurs touchés (ancien et nouveau) et de leurs zones ; renvoie le nombre de tronçons modifiés ; journalise un résumé | administrateur ou `parametres / modifier` sur le marché du secteur |
| `affecter_troncons_polygone(p_secteur uuid, p_polygone jsonb, p_mode text default 'ajouter') returns integer` | tronçons dont le **milieu** est dans le polygone GeoJSON (WGS84) : `ajouter` au secteur, `retirer` (désaffecter ceux du secteur), `remplacer` (le secteur = exactement ces tronçons) ; même recalcul des contours | idem |
| `recalculer_contour_secteur(p_secteur uuid) returns void` | `secteurs.geom` = enveloppe concave des tronçons du secteur (`ST_ConcaveHull(ST_Collect(geom), 0.3, false)`), tamponnée de 20 m (`geography`), en `MultiPolygon` ; `zones.geom` = union des secteurs de la zone ; secteur sans tronçon : `geom` nul | idem |
| `definir_contour_secteur(p_secteur uuid, p_polygone jsonb) returns void` | contour dessiné à la main par l'administrateur (remplace `geom`, `MultiPolygon` forcé) ; n'affecte pas les tronçons | idem |

Vues (`security_invoker = true`, comme `v_fuites`) :

| Vue | Colonnes |
|---|---|
| `v_lineaire_secteurs` | `marche_id, zone_id, secteur_id, code, libelle, statut_balayage, nb_troncons, lineaire_m, nb_balayes, lineaire_balaye_m, pct_balaye (0-100, 1 décimale), nb_noeuds, lineaire_contrat_m (secteurs.lineaire_m), modifie_le (max des tronçons)` ; secteurs actifs, tronçons actifs, balayages non annulés en premier passage |
| `v_lineaire_zones` | `marche_id, zone_id, numero, code, libelle, nb_secteurs, nb_troncons, lineaire_m, lineaire_balaye_m, pct_balaye, lineaire_contrat_m (zones.lineaire_m)` |
| `v_balayage_journalier` | `marche_id, date_balayage, equipe_id, equipe, agent_id, agent (nom_complet), zone_id, zone, secteur_id, secteur, nb_troncons, lineaire_m` (premiers passages), `lineaire_repasse_m` (passages suivants), `nb_noeuds` (nœuds à moins de 1 m d'une extrémité d'un tronçon balayé ce jour), `nb_fuites` (fuites du marché détectées ce jour dans ce secteur, non supprimées) |
| `v_troncons_sans_secteur` | `marche_id, nb_troncons, lineaire_m` : ce qui reste à zoner |

Tests pgTAP (`15_reseau_balayage.test.sql`, jeu d'essai sur le marché `TEST-A` comme `02_parametres_marche`) :
RLS lecture / écriture par rôle ; import idempotent (même fichier → 0 insert) et mise à jour par référence ;
longueur calculée ; zonage automatique par contour ; affectation par liste et par polygone, contours recalculés ;
`premier_passage` et annulation ; statut du secteur `a_balayer → en_cours → balayee` ; vues (linéaires, journalier,
nœuds, fuites du jour) ; marché désactivé : balayage refusé ; `etat_balayage` vide sans droit ; `copier_marche`
inchangée (les tronçons ne sont **pas** copiés). Lancer `supabase/ci/lancer-tests.sh` (PostgreSQL + PostGIS + pgTAP).

## 4. Format d'échange GeoJSON (S1 → S2 → S3)

Fichiers produits par S1 dans `data-private/reseau/` (jamais dans le dépôt) :
- `troncons.geojson` : FeatureCollection WGS84, un `LineString` par tronçon, propriétés :
  `reference` (texte, unique), `calque`, `categorie` (`conduite` | `branchement` | `adduction` | `autre`),
  `diametre_mm` (entier ou null), `materiau` (texte ou null), `secteur_code` (code de `secteurs.code` ou null).
- `noeuds.geojson` : `Point`, propriétés `reference`, `calque`, `type`, `secteur_code`.
- `secteurs.geojson` : `MultiPolygon` par secteur dessiné (propriétés `secteur_code`, `libelle`), pour vérification.
- `rapport-conversion.md` : calques, comptes, linéaires par secteur, contrôles de calage.

`importer_troncons` et `importer_noeuds` reçoivent **le tableau `features`** (pas la collection), par paquets.

## 5. Panneau web (S3)

Carte `/carte` (tous ceux qui voient les fuites) :
- Panneau latéral repliable « Réseau » : interrupteur général (mémorisé dans `localStorage`), arbre **Zone →
  secteurs** avec cases (une zone coche ses secteurs ; « Tout » / « Aucun »), compteurs (linéaire, % balayé) depuis
  `v_lineaire_secteurs`. Secteurs chargés à la demande (`reseau_geojson` par secteur), gardés dans IndexedDB
  (base `suivi-fuites-reseau`, clé `marche:secteur`, invalidée si `modifie_le` de la vue change) ; état de
  balayage (`etat_balayage`) relu à chaque ouverture et appliqué par `setFeatureState` (`promoteId: 'id'`), jamais
  mélangé à la géométrie en cache.
- Coloration au choix : **par secteur** (teinte par zone, nuances par secteur, palette déterministe dans
  `web/src/lib/reseau/palette.ts`, légende Zone → secteurs), **par balayage** (balayé vert `#256f3a`, non balayé gris
  `#8a97a5`, repassé bleu), **par diamètre** (classes ≤ 63, 75-110, 125-200, 250-400, > 400). Nœuds affichés à
  partir du zoom 15. Les couches sont ajoutées dans `couches.ts` pour que la carte imprimée les reprenne (légende du
  PDF complétée : zones / secteurs affichés, état de balayage si choisi).
- Bulle d'un tronçon : secteur, zone, diamètre, matériau, longueur, « balayé le … par … (équipe) » ou « non balayé ».
- **Mode balayage** (droit `balayage / creer`) : bouton « Balayage » ; appui sur les tronçons pour les sélectionner
  (surbrillance, compteur de linéaire) ; « Enregistrer » → équipe (liste des équipes de détection, dernière choisie
  mémorisée), date (aujourd'hui par défaut), méthode facultative → insertion dans `balayages` avec identifiants
  créés sur l'appareil ; sans réseau, mise en file d'attente (`web/src/lib/hors-ligne.ts`, nouveau type d'envoi
  `balayage`) et envoi au retour du réseau. Annulation d'un balayage (depuis la bulle, selon le droit) avec motif.
- Mode `?mode=balayage` : ouvre la carte directement en mode balayage avec le panneau Réseau ouvert (pour l'APK).

Paramètres > **Réseau** (nouvel onglet `OngletReseau.tsx`, administrateur ou `parametres / modifier`) :
- Import : fichier GeoJSON (tronçons, puis nœuds), aperçu (nombre, calques, secteurs reconnus), envoi par paquets
  de 1 000 features à `importer_troncons` / `importer_noeuds`, barre de progression, résumé.
- Carte de zonage plein écran : tous les tronçons (sans secteur en gris pointillé), contours des secteurs,
  sélection par clic, Maj+clic (ajout), **rectangle** (Maj+glisser) et **lasso** (polygone dessiné) ; actions
  « Affecter au secteur … », « Retirer du secteur », « Recalculer le contour », « Dessiner le contour à la main » ;
  tableau des secteurs (tronçons, linéaire, % balayé, linéaire du contrat, écart) depuis `v_lineaire_secteurs` et
  ligne « Non zonés » (`v_troncons_sans_secteur`).

Page `/balayage` (droit `balayage / lire`) : journal des balayages par jour, équipe, agent, zone, secteur depuis
`v_balayage_journalier` (filtres période, équipe, secteur ; totaux) ; bouton d'export Excel via `lib/export`
(jeu `balayage_journalier`) si le temps le permet ; lien « Balayage » dans le menu (`layout.tsx`, une ligne).

Route `web/src/app/session/page.tsx` (sans mise en page de l'application) : lit `#access_token=…&refresh_token=…&suite=/carte?mode=balayage`
dans le fragment d'adresse, appelle `supabase.auth.setSession`, efface le fragment et redirige vers `suite`
(chemin relatif seulement) ; message d'erreur sinon. Sert à l'APK (§ 6).

Vérification : `tsc --noEmit`, `next build`, `node scripts/verifier-reseau.mjs` (palette, classes de diamètre,
fusion état / géométrie, lecture des features, découpage en paquets, file d'attente `balayage`) ; aperçu navigateur
sur données fictives (MapLibre réel, Supabase simulé) si possible.

## 6. APK (S4)

- Dépendance `react-native-webview` (version du `bundledNativeModules.json` de l'Expo installé).
- Écran **Balayage** : WebView plein écran sur `${EXPO_PUBLIC_WEB_URL ?? 'https://fuites.stepag.ma'}/session#access_token=…&refresh_token=…&suite=/carte?mode=balayage`
  (jetons de la session Supabase courante, dans le **fragment**, jamais en paramètre de requête) ; bouton retour
  Android ; géolocalisation autorisée dans la WebView ; message clair sans réseau (la carte a besoin de la connexion).
- Bouton « Balayage » dans la barre de la liste, visible avec le droit `balayage / lire` ; `types.ts` : `'balayage'`
  ajouté au type de donnée si nécessaire. `npx tsc --noEmit` et l'essai sans pile
  (`node --import ./essais/substituts.mjs essais/file-attente-hors-pile.test.mjs`) doivent rester verts.
- Hors périmètre : carte native (MapLibre React Native) ; suivi GPS en arrière-plan (M4).

## 7. Conversion (S1) : pipeline

`outils/reseau/` (Python 3.12, `ezdxf`, `pyproj`, `shapely` ; LibreDWG `dwg2dxf` pour la lecture du DWG) :
1. `dwg2dxf` → `data-private/reseau/reseau.dxf` (hors dépôt).
2. `analyser_dxf.py` : calques, types d'entités, étendue, textes ; propose la classification des calques.
3. `convertir.py` : lit le DXF, explose les polylignes en tronçons par calque, reprojette EPSG:26191 → EPSG:4326,
   arrondit à 6 décimales, écrit `troncons.geojson`, `noeuds.geojson`, `secteurs.geojson`, `rapport-conversion.md`.
4. `controler_calage.py` : compare quelques points connus du dessin aux coordonnées OSM (gare, ronds-points) ;
   écart moyen attendu < 10 m, sinon tester les autres systèmes marocains (Merchich / Sud Maroc EPSG:26192,
   Lambert Maroc 2 zones…).
5. Vérification visuelle dans le navigateur (MapLibre, fond OpenFreeMap, GeoJSON local).

L'import dans Supabase (production) ne se fait **qu'avec l'accord d'Issam**, via Paramètres > Réseau.

## 8. Résultat (fin de session 7)

- S1 à S5 faits et réunis sur `claude/lot-s-integration` ; chiffres et vérifications : `docs/etat-avancement.md` § 7.
- Écarts au contrat : migration `20261006130000` et test `15` (collision avec P3 / P4) ; `importer_*` renvoie aussi
  `inchanges` ; `reseau_geojson` : `p_secteurs = '{}'` = aucun secteur ; `etat_balayage` : équipe et agent du
  **dernier** passage ; le chef de réparation n'a **pas** le droit « balayage » (test `05_marche_demo` inchangé) ;
  import des contours de secteurs (`secteurs.geojson`, `definir_contour_secteur`) ajouté à Paramètres > Réseau ;
  `hors-ligne.ts` et `supabase.ts` modifiés par S3 (type d'envoi `balayage`, APK) ; rapport journalier branché sur
  `/balayage` à l'intégration ; matrice des droits complétée (lignes Balayage).
