# Fond de carte hors ligne (lot CH)

Fond de la ville pour la carte de balayage sans réseau des tablettes : extrait OpenStreetMap de **Protomaps Basemap**
(rues, noms, bâtiments, eau, verdure, points d'intérêt), zooms 0 à 15, agrandi au-delà par MapLibre. Fiche du lot :
`docs/lots/lot-ch-carte-hors-ligne.md`.

## Fabriquer et déposer

1. Outil `pmtiles` (Protomaps, libre) : une fois, voir le message de `fabriquer.sh` s'il manque.
2. Sur le Mac, à la racine du dépôt :
   ```
   outils/fond-carte/fabriquer.sh oujda data-private/fonds/oujda.pmtiles
   ```
   Autre ville : emprise `ouest,sud,est,nord` en degrés (réseau du marché élargi de 5 km).
3. Panneau web › Paramètres › Réseau › **Fond de carte hors ligne** › choisir le fichier › « Déposer le fond »
   (administrateur ou « paramètres / modifier »). Rangé dans le compartiment R2 privé : `fonds/<marché>/fond.pmtiles`.
4. Les tablettes le copient à la prochaine ouverture de la carte de balayage avec réseau.

Rythme : au démarrage d'un marché, puis tous les trois mois environ ou quand des rues manquent.

## Mesures (2026-10-12, construction du 11 octobre)

| Emprise | Tuiles | Taille | Durée |
|---|---:|---:|---:|
| Oujda, réseau + 1 km | 199 | 2,8 Mo | 20 s |
| Oujda, réseau + 5 km (retenu) | 534 | 3,3 Mo | 17 s |

## Licences

- Données © OpenStreetMap (ODbL) : mention affichée sur la carte ; basses échelles Natural Earth (domaine public).
- Style `@protomaps/basemaps` (BSD-3), polices Noto Sans (OFL, `web/public/fond/v1/polices/OFL.txt`), icônes dérivées
  de tangrams/icons (MIT, `web/public/fond/v1/icones/LICENSE.md`).
- `data-private/` n'est pas versionné : le fichier fabriqué n'entre pas dans le dépôt.
