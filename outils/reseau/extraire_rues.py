#!/usr/bin/env python3
"""Rues nommées d'OpenStreetMap dans l'emprise du réseau (suggestions d'adresse, tâche F3).

Usage :
  python3 outils/reseau/extraire_rues.py [--troncons data-private/IMPORT-RESEAU/2-troncons.geojson]
      [--marge-m 500] [--sortie data-private/IMPORT-RESEAU/4-rues.geojson]
      [--migration supabase/migrations/AAAAMMJJHHMMSS_rues_oujda.sql]

Télécharge une fois (API Overpass) les voies nommées (« name », « name:ar » ou « name:fr ») dont la
géométrie coupe l'emprise des tronçons élargie de --marge-m mètres, et les garde dans un cache
(`rues-osm-noms.json` à côté de la sortie). Les géométries sont simplifiées à 1 m près et arrondies à
6 décimales (≈ 0,1 m).

Sorties :
  * --sortie : GeoJSON (properties : id, nom, nom_ar, nom_fr, categorie) pour `importer_rues` ; un nom
    bilingue d'OSM (« Rue Taïf زنقة الطائف ») complète nom_fr et nom_ar quand les étiquettes manquent ;
  * --migration (facultatif) : migration SQL qui charge ces rues par `private.charger_rues`.

Données © contributeurs OpenStreetMap, sous licence ODbL 1.0 (https://www.openstreetmap.org/copyright) :
l'attribution accompagne le fichier produit et la migration.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request

from shapely.geometry import LineString

OVERPASS = "https://overpass-api.de/api/interpreter"
ATTRIBUTION = "© contributeurs OpenStreetMap, licence ODbL 1.0 (https://www.openstreetmap.org/copyright)"
EXCLUES = {"proposed", "construction", "raceway", "bus_guideway", "platform", "corridor", "elevator", "abandoned"}


def emprise(chemin: str, marge_m: float) -> tuple[float, float, float, float]:
    with open(chemin, encoding="utf-8") as f:
        fc = json.load(f)
    lons, lats = [], []
    for ft in fc["features"]:
        g = ft.get("geometry") or {}
        if g.get("type") == "LineString":
            for x, y in g["coordinates"]:
                lons.append(x)
                lats.append(y)
    if not lons:
        sys.exit("Aucun tronçon dans " + chemin)
    dlat = marge_m / 111_320
    dlon = marge_m / (111_320 * math.cos(math.radians((min(lats) + max(lats)) / 2)))
    return (min(lats) - dlat, min(lons) - dlon, max(lats) + dlat, max(lons) + dlon)


def telecharger(bbox: tuple[float, float, float, float], chemin: str) -> None:
    s, w, n, e = bbox
    b = f"({s:.6f},{w:.6f},{n:.6f},{e:.6f})"
    requete = (f'[out:json][timeout:180];(way["highway"]["name"]{b};way["highway"]["name:ar"]{b};'
               f'way["highway"]["name:fr"]{b};);out geom;')
    data = urllib.parse.urlencode({"data": requete}).encode()
    req = urllib.request.Request(OVERPASS, data=data, headers={"User-Agent": "suivi-fuites-rues/1.0"})
    with urllib.request.urlopen(req, timeout=240) as r:
        brut = json.load(r)
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump({"bbox": bbox, "elements": brut.get("elements", [])}, f, ensure_ascii=False)
    print(f"{len(brut.get('elements', []))} voies OSM nommées enregistrées dans {chemin}")


def nettoyer(texte: str | None) -> str | None:
    if texte is None:
        return None
    t = " ".join(texte.split())
    return t or None


ARABE = re.compile(r"[\u0600-\u06FF][\u0600-\u06FF\s'’-]*[\u0600-\u06FF]|[\u0600-\u06FF]")


def separer(nom: str | None) -> tuple[str | None, str | None]:
    """« Rue Taïf زنقة الطائف » → (« Rue Taïf », « زنقة الطائف ») ; un nom d'une seule écriture reste entier."""
    if not nom:
        return None, None
    arabe = " ".join(m.group(0) for m in ARABE.finditer(nom)).strip() or None
    latin = nettoyer(ARABE.sub(" ", nom).strip(" -–/()"))
    if latin and not re.search(r"[A-Za-zÀ-ÿ]", latin):
        latin = None
    return latin, arabe


def features(chemin_brut: str) -> list[dict]:
    with open(chemin_brut, encoding="utf-8") as f:
        brut = json.load(f)
    sortie = []
    for el in brut["elements"]:
        tags = el.get("tags", {})
        if el.get("type") != "way" or tags.get("highway") in EXCLUES:
            continue
        pts = [(p["lon"], p["lat"]) for p in el.get("geometry", [])]
        if len(pts) < 2:
            continue
        ligne = LineString(pts).simplify(0.00001, preserve_topology=False)
        coords = [[round(x, 6), round(y, 6)] for x, y in ligne.coords]
        if len(coords) < 2 or coords[0] == coords[-1] and len(coords) == 2:
            continue
        nom, nom_ar, nom_fr = nettoyer(tags.get("name")), nettoyer(tags.get("name:ar")), nettoyer(tags.get("name:fr"))
        if not (nom or nom_ar or nom_fr):
            continue
        latin, arabe = separer(nom)
        nom_fr = nom_fr or latin
        nom_ar = nom_ar or arabe
        sortie.append({"type": "Feature",
                       "geometry": {"type": "LineString", "coordinates": coords},
                       "properties": {"id": el["id"], "nom": nom, "nom_ar": nom_ar, "nom_fr": nom_fr,
                                      "categorie": tags.get("highway")}})
    sortie.sort(key=lambda ft: ft["properties"]["id"])
    return sortie


def ecrire_migration(chemin: str, fc: list[dict], bbox: tuple[float, float, float, float]) -> None:
    morceaux = [fc[i:i + 1000] for i in range(0, len(fc), 1000)]
    with open(chemin, "w", encoding="utf-8") as f:
        f.write("-- " + "=" * 77 + "\n")
        f.write("-- Rues nommées d'Oujda tirées d'OpenStreetMap (suggestions d'adresse, tâche F3).\n")
        f.write(f"-- Données {ATTRIBUTION}.\n")
        f.write("-- Produit par outils/reseau/extraire_rues.py (emprise du réseau + marge :\n")
        f.write(f"-- lat {bbox[0]:.5f} → {bbox[2]:.5f}, lon {bbox[1]:.5f} → {bbox[3]:.5f}) ; ne pas modifier à la main.\n")
        f.write(f"-- {len(fc)} voies, chargées par paquets de 1 000 (idempotent : mise à jour par identifiant OSM).\n")
        f.write("-- " + "=" * 77 + "\n\n")
        for m in morceaux:
            texte = json.dumps(m, ensure_ascii=False, separators=(",", ":"))
            f.write("select private.charger_rues($rues$" + texte + "$rues$::jsonb, 'Oujda');\n")
    print(f"Migration écrite : {chemin} ({os.path.getsize(chemin) / 1e6:.2f} Mo)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--troncons", default="data-private/IMPORT-RESEAU/2-troncons.geojson")
    ap.add_argument("--marge-m", type=float, default=500)
    ap.add_argument("--sortie", default="data-private/IMPORT-RESEAU/4-rues.geojson")
    ap.add_argument("--migration", default=None)
    a = ap.parse_args()

    bbox = emprise(a.troncons, a.marge_m)
    chemin_brut = os.path.join(os.path.dirname(os.path.abspath(a.sortie)), "rues-osm-noms.json")
    if not os.path.exists(chemin_brut):
        telecharger(bbox, chemin_brut)
    fc = features(chemin_brut)
    with open(a.sortie, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "attribution": ATTRIBUTION, "licence": "ODbL-1.0",
                   "bbox": [bbox[1], bbox[0], bbox[3], bbox[2]], "features": fc},
                  f, ensure_ascii=False, separators=(",", ":"))
    avec_ar = sum(1 for ft in fc if ft["properties"]["nom_ar"])
    print(f"{len(fc)} voies nommées ({avec_ar} avec un nom arabe) → {a.sortie} "
          f"({os.path.getsize(a.sortie) / 1e6:.2f} Mo)")
    if a.migration:
        ecrire_migration(a.migration, fc, bbox)


if __name__ == "__main__":
    main()
