# Conversion du plan du réseau (DWG → GeoJSON → Supabase)

Chaîne locale, sur le Mac, sans service payant ni outil externe à l'exécution de l'application. Les fichiers
du plan (DWG, DXF, GeoJSON produits) restent **hors du dépôt**, dans `data-private/reseau/` (ignoré par git).
Seuls ces scripts et les tables de correspondance sont versionnés.

## Système de coordonnées (vérifié le 2026-10-06, recalé le 2026-10-07)

Le dessin `Reseau aep oujda.dwg` est en **Lambert Nord Maroc, datum Merchich (EPSG:26191)**, le système le plus
utilisé dans le nord du Maroc (Oujda est dans la zone Nord). Conversion vers WGS84 (le système du GPS des
tablettes et de la carte) par la transformation EPSG standard « Merchich to WGS 84 (1) » (translation
31, 146, 47 m ; précision annoncée 7 m).

**Recalage (2026-10-07)** : la transformation n'est annoncée qu'à 7 m près et le dessin converti gardait un
décalage systématique visible à fort zoom (conduites à côté des rues). `recaler.py` cherche la translation qui
met le plus de conduites **sur** les rues OSM (critère 1 − exp(−d² / 2σ²), σ = 3 m, estimé par fenêtres de
800 m) : **5,7 m vers l'ouest et 6,6 m vers le nord** (8,8 m). Corrections locales (champ lissé, puis modèle
affine) essayées et écartées : les fenêtres sont bruitées de ± 4 m (conduites sous un trottoir ou sous les
deux) et la validation croisée ne montre aucun gain.

| Distance conduite → rue OSM la plus proche | Avant | Après recalage |
|---|---:|---:|
| Médiane | 5,0 m | 4,5 m |
| À moins de 2 m | 24 % | 25 % |
| À moins de 3 m | 34 % | 36 % |
| À moins de 5 m | 50 % | 54 % |

Vérifié à l'œil (centre-ville, Lazaret, quartier Oued Loukous / Oum Rabia) : les conduites tombent sur les
rues. L'écart restant (quelques mètres) vient du dessin lui-même (conduites sous trottoir, tracés schématiques
du SIG) et de la précision d'OSM ; à Sidi Yahya, le plan et OSM ne dessinent pas les rues de la même façon.
Un point GPS de la tablette (3 à 5 m en ville) tombe sur la bonne conduite ou sa voisine immédiate.

`controler_calage.py` moyenne le vecteur vers la rue la plus proche : les conduites des deux trottoirs se
compensent, il sous-estime un décalage systématique (il annonçait 1 à 2 m avant recalage). Il sert à
télécharger les rues OSM ; la mesure qui fait foi est le rapport de `recaler.py` (`recale/recalage.md`).

## Pré-requis (une fois)

```bash
python3 -m pip install ezdxf pyproj shapely scipy pymupdf
brew install libredwg
```

Si Homebrew est occupé par une autre installation, la bouteille LibreDWG téléchargée peut être extraite à la
main (voir l'historique de la session du 2026-10-06 dans `docs/etat-avancement.md`).

## Étapes

```bash
cd ~/Desktop/Suivi-fuites
D="data-private/archives/MARCHE N° 4500004453 DÉTECTION, RECHERCHE ET REPARATION DES FUITES"
# 1. DWG → DXF (1,2 Go, une minute)
dwg2dxf -y -o data-private/reseau/reseau.dxf "$D/Reseau aep oujda.dwg"
# 2. Extraction des entités utiles, blocs compris (une minute)
python3 outils/reseau/extraire_dxf.py data-private/reseau/reseau.dxf data-private/reseau/extrait.pkl
# 3. Calage des planches PDF (quinze minutes, six processus)
python3 outils/reseau/caler_planches.py --extrait data-private/reseau/extrait.pkl --dxf data-private/reseau/reseau.dxf \
  --plans "$D/plans" --sortie data-private/reseau/planches
# 4. Zonage initial (secteurs STEPAG des planches + secteurs du SIG)
python3 outils/reseau/zoner.py --extrait data-private/reseau/extrait.pkl \
  --planches data-private/reseau/planches/planches.geojson --secteurs outils/reseau/secteurs.json \
  --sortie data-private/reseau/zonage.json
# 5. Conversion finale (tronçons, nœuds, secteurs)
python3 outils/reseau/convertir.py --extrait data-private/reseau/extrait.pkl --secteurs outils/reseau/secteurs.json \
  --zonage data-private/reseau/zonage.json --planches data-private/reseau/planches/planches.geojson \
  --sortie data-private/reseau
# 6. Contrôle du calage sur OpenStreetMap (télécharge aussi les rues dans rues-osm.geojson)
python3 outils/reseau/controler_calage.py data-private/reseau/troncons.geojson
# 7. Recalage fin sur les rues OSM (translation globale ; corrections locales si la validation croisée y gagne ; cinq minutes)
python3 outils/reseau/recaler.py --source data-private/reseau --sortie data-private/reseau/recale
# 8. Dossier d'import prêt à l'emploi (fichiers numérotés + aperçu ouvrable d'un double-clic)
python3 outils/reseau/preparer_import.py --source data-private/reseau/recale
```

**Import** : `data-private/IMPORT-RESEAU/` contient `1-contours-secteurs.geojson`, `2-troncons.geojson`,
`3-noeuds.geojson` (à choisir dans cet ordre dans Paramètres > Réseau > Importer le GeoJSON), `LISEZ-MOI.txt`
et `APERCU-RESEAU.html` : un double-clic l'ouvre dans Chrome, sans serveur (les données sont dans
`donnees-apercu.js`, chargé par une balise `<script>` ; `fetch` est bloqué en `file://`). L'aperçu marche
aussi servi par `python3 -m http.server 8765` dans `data-private/reseau/` (configuration `apercu-reseau`
de `.claude/launch.json`).

## Ce que contient le dessin

- **Conduites** : espace objet, calques nommés par diamètre (`33X50`, `90`, `110`…), mais l'export du SIG
  (Elyx) a mis la plupart des conduites sur les calques `33X50` et `90` quel que soit leur diamètre : le
  diamètre réel vient de l'étiquette posée à 1,2 m de la conduite (rattachée à moins de 4 m), propagée le long
  des conduites sans étiquette.
- **Blocs orphelins** : deux anciens exports complets du réseau (« LA MISE A JOUR RESEAU EAU POTABLE 2012 »,
  « AEP_MARCHE_CADRE_08-03-2018 ») sont définis dans le fichier mais jamais insérés : invisibles dans AutoCAD,
  ils sont **écartés** (celui de 2018 est à 94 % identique à l'espace objet, celui de 2012 est ancien).
- **Réseau projeté** (`AEP A POSER`, `RESEAU A POSER`, `AEP PROJETE`) : écarté (pas encore posé).
- **Secteurs et zones hydrauliques du SIG** : `ELYX_DATA.EP_SECTEUR_HYDRO` (49 secteurs nommés) et
  `ELYX_DATA.EP_ZONE_HYDRO` (9 zones) ; correspondance avec les secteurs du marché dans `secteurs.json`.
- **Équipements** : blocs `EP_NOEUD`, `EP_VANNE`, `EP_HYDRANT`, `EP_VENTOUSE`, `EP_VIDANGE`, `EP_COMPTEUR_*`,
  `EP_OBTURATEUR`… devenus les nœuds.
- **Secteurs de relève** (`ELYX_DATA.EP_SECTEUR_RELEVE`, 269 polygones numérotés) : non utilisés pour l'instant ;
  ils pourraient localiser une fuite à partir du premier bloc de sa référence SRM (à confirmer avec la SRM).

## Planches PDF

Impressions A3 du même dessin, sans coordonnées, orientation et échelle propres à chaque tirage. Le calage
retrouve rotation, échelle et position (textes communs, sinon corrélation des conduites, puis affinage point à
point) ; il est jugé fiable quand 75 % des conduites de la planche tombent à moins de 2 m d'une conduite du
dessin. Les limites magenta épaisses (secteurs tracés par STEPAG) et les grands noms de secteur servent au
zonage initial ; l'administrateur corrige ensuite dans Paramètres > Réseau.
