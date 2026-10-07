#!/usr/bin/env python3
"""Dossier d'import prêt à l'emploi pour Paramètres > Réseau, et aperçu ouvrable d'un double-clic.

Usage : python3 preparer_import.py [--source data-private/reseau] [--sortie data-private/IMPORT-RESEAU]

À lancer après convertir.py. Copie les trois fichiers à importer sous des noms numérotés dans l'ordre
d'import (le navigateur ne voit que le nom choisi dans le Finder : pas de confusion possible avec la
table de correspondance outils/reseau/secteurs.json), et écrit l'aperçu de relecture avec ses données
dans un script `donnees-apercu.js` : un double-clic suffit, sans serveur (Chrome bloque fetch en
file://, pas une balise <script>).
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

ICI = Path(__file__).resolve().parent
FICHIERS = [
    ("secteurs.geojson", "1-contours-secteurs.geojson", "MultiPolygon"),
    ("troncons.geojson", "2-troncons.geojson", "LineString"),
    ("noeuds.geojson", "3-noeuds.geojson", "Point"),
]

LISEZ_MOI = """Plan du réseau : fichiers à importer
====================================

1. Relire : double-cliquer APERCU-RESEAU.html (Chrome). Couleur = secteur, gris = non zoné,
   tirets magenta = contours des secteurs. Cliquer un tronçon affiche ses informations.

2. Importer, dans le panneau web : choisir le marché en haut à droite, puis
   Paramètres > Réseau > Importer le GeoJSON, et dans cet ordre :
     étape « 1. Contours des secteurs »  → 1-contours-secteurs.geojson → « Définir le contour… »
     étape « 2. Tronçons »               → 2-troncons.geojson          → « Importer… »
     étape « 3. Nœuds »                  → 3-noeuds.geojson            → « Importer… »
   Ne pas fermer l'onglet pendant un import. Refaire un import ne crée pas de doublon.

{resume}
"""


def lire(chemin: Path) -> dict:
    with chemin.open(encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="data-private/reseau", help="sorties de convertir.py")
    ap.add_argument("--sortie", default="data-private/IMPORT-RESEAU")
    args = ap.parse_args()
    source, sortie = Path(args.source), Path(args.sortie)
    sortie.mkdir(parents=True, exist_ok=True)

    donnees: dict[str, dict] = {}
    lignes = []
    for nom, cible, geometrie in FICHIERS:
        collection = lire(source / nom)
        types = {f["geometry"]["type"] for f in collection["features"]}
        if not types <= {geometrie, geometrie.removeprefix("Multi")}:
            raise SystemExit(f"{nom} : géométries {sorted(types)} inattendues (attendu {geometrie})")
        shutil.copyfile(source / nom, sortie / cible)
        donnees[nom.removesuffix(".geojson")] = collection
        lignes.append(f"   {cible:<30} {len(collection['features']):>6} objets")

    shutil.copyfile(ICI / "apercu.html", sortie / "APERCU-RESEAU.html")
    with (sortie / "donnees-apercu.js").open("w", encoding="utf-8") as f:
        f.write("window.DONNEES_APERCU = ")
        json.dump(donnees, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    (sortie / "LISEZ-MOI.txt").write_text(LISEZ_MOI.format(resume="Contenu :\n" + "\n".join(lignes)), encoding="utf-8")
    print(f"{sortie}/ prêt :")
    print("\n".join(lignes))


if __name__ == "__main__":
    main()
