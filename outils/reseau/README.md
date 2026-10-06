# Conversion du plan du réseau (DWG → GeoJSON → Supabase)

Chaîne locale, sur le Mac, sans service payant ni outil externe à l'exécution de l'application. Les fichiers
du plan (DWG, DXF, GeoJSON produits) restent **hors du dépôt**, dans `data-private/reseau/` (ignoré par git).
Seuls ces scripts et les tables de correspondance sont versionnés.

## Système de coordonnées (vérifié le 2026-10-06)

Le dessin `Reseau aep oujda.dwg` est en **Lambert Nord Maroc, datum Merchich (EPSG:26191)**, le système le plus
utilisé dans le nord du Maroc (Oujda est dans la zone Nord). Conversion vers WGS84 (le système du GPS des
tablettes et de la carte) par la transformation EPSG standard « Merchich to WGS 84 (1) » (translation
31, 146, 47 m ; précision annoncée 7 m).

Contrôle sur 4 000 sommets de conduites comparés aux rues d'OpenStreetMap :

| Mesure | Valeur |
|---|---|
| Distance médiane conduite → axe de la rue | 4,0 m (conduites sous trottoir ou chaussée) |
| 90 % des sommets à moins de | 12 m |
| Décalage moyen systématique | 1 à 2 m (négligeable) |

Un point GPS de la tablette (précision 3 à 5 m en ville) tombe donc sur la bonne conduite ou sa voisine
immédiate. Aucun recalage n'est nécessaire.

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
# 6. Contrôle du calage sur OpenStreetMap
python3 outils/reseau/controler_calage.py data-private/reseau/troncons.geojson
```

Aperçu : `apercu.html` copié dans `data-private/reseau/`, servi par `python3 -m http.server 8765` dans ce
dossier (configuration `apercu-reseau` de `.claude/launch.json`).

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
