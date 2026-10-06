#!/usr/bin/env python3
"""Contrôle du calage : les conduites doivent suivre les rues d'OpenStreetMap.

Usage : python3 controler_calage.py troncons.geojson [--osm rues-osm.geojson] [--echantillon 3000]

Pour un échantillon de sommets des tronçons (déjà en WGS84), mesure la distance à la rue OSM la plus
proche. Un réseau d'eau potable urbain court sous la chaussée ou le trottoir : la médiane attendue est
de quelques mètres. Une médiane de plusieurs dizaines de mètres, ou un décalage systématique (même
vecteur partout), trahit un mauvais système de coordonnées ou une mauvaise transformation de datum.

Les rues sont téléchargées une fois depuis l'API Overpass (emprise des tronçons + 300 m) et gardées dans
`--osm` (GeoJSON) pour les exécutions suivantes.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import urllib.parse
import urllib.request

from pyproj import Transformer
from shapely.geometry import LineString, Point, shape
from shapely.strtree import STRtree

OVERPASS = "https://overpass-api.de/api/interpreter"
# Projection métrique locale pour mesurer des distances (UTM 30N couvre Oujda, lon -1.9).
METRIQUE = Transformer.from_crs("EPSG:4326", "EPSG:32630", always_xy=True)


def telecharger_rues(bbox: tuple[float, float, float, float], chemin: str) -> None:
    s, w, n, e = bbox
    requete = f'[out:json][timeout:120];way["highway"]["highway"!~"footway|path|steps|cycleway|track|bridleway"]({s},{w},{n},{e});out geom;'
    data = urllib.parse.urlencode({"data": requete}).encode()
    req = urllib.request.Request(OVERPASS, data=data, headers={"User-Agent": "suivi-fuites-calage/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        brut = json.load(r)
    features = []
    for el in brut.get("elements", []):
        pts = [[p["lon"], p["lat"]] for p in el.get("geometry", [])]
        if len(pts) >= 2:
            features.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": pts},
                             "properties": {"id": el["id"], "highway": el.get("tags", {}).get("highway"),
                                            "name": el.get("tags", {}).get("name")}})
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))
    print(f"{len(features)} rues OSM enregistrées dans {chemin}")


def en_metres(coords):
    return [METRIQUE.transform(x, y) for x, y in coords]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("troncons")
    ap.add_argument("--osm", default=None)
    ap.add_argument("--echantillon", type=int, default=3000)
    ap.add_argument("--graine", type=int, default=7)
    a = ap.parse_args()

    with open(a.troncons, encoding="utf-8") as f:
        fc = json.load(f)
    lignes = [ft["geometry"]["coordinates"] for ft in fc["features"] if ft["geometry"]["type"] == "LineString"]
    if not lignes:
        sys.exit("Aucun tronçon")
    lons = [p[0] for l in lignes for p in l]
    lats = [p[1] for l in lignes for p in l]
    marge = 0.003  # ≈ 300 m
    bbox = (min(lats) - marge, min(lons) - marge, max(lats) + marge, max(lons) + marge)
    print(f"Emprise des tronçons : lat {min(lats):.5f}→{max(lats):.5f}, lon {min(lons):.5f}→{max(lons):.5f}")

    chemin_osm = a.osm or os.path.join(os.path.dirname(os.path.abspath(a.troncons)), "rues-osm.geojson")
    if not os.path.exists(chemin_osm):
        telecharger_rues(bbox, chemin_osm)
    with open(chemin_osm, encoding="utf-8") as f:
        rues = json.load(f)
    rues_m = [LineString(en_metres(ft["geometry"]["coordinates"])) for ft in rues["features"]]
    arbre = STRtree(rues_m)
    print(f"{len(rues_m)} rues OSM chargées")

    random.seed(a.graine)
    sommets = [p for l in lignes for p in l]
    ech = random.sample(sommets, min(a.echantillon, len(sommets)))
    dist = []
    vecteurs = []
    for lon, lat in ech:
        p = Point(METRIQUE.transform(lon, lat))
        idx = arbre.nearest(p)
        rue = rues_m[int(idx)]
        d = p.distance(rue)
        dist.append(d)
        q = rue.interpolate(rue.project(p))
        vecteurs.append((q.x - p.x, q.y - p.y))
    dist.sort()
    n = len(dist)
    med = dist[n // 2]
    p25, p75, p90 = dist[n // 4], dist[3 * n // 4], dist[int(n * 0.9)]
    dx = sum(v[0] for v in vecteurs) / n
    dy = sum(v[1] for v in vecteurs) / n
    print(f"Distance sommet → rue la plus proche ({n} sommets) : médiane {med:.1f} m ; P25 {p25:.1f} ; P75 {p75:.1f} ; P90 {p90:.1f}")
    print(f"Décalage moyen (vers la rue) : dx {dx:+.1f} m, dy {dy:+.1f} m (|d| {math.hypot(dx, dy):.1f} m)")
    if med <= 6 and math.hypot(dx, dy) <= 3:
        print("VERDICT : calage correct (les conduites suivent les rues, pas de décalage systématique).")
    elif med <= 15:
        print("VERDICT : calage plausible mais à affiner (décalage ou système de coordonnées voisin).")
    else:
        print("VERDICT : calage douteux : vérifier le système de coordonnées du dessin.")


if __name__ == "__main__":
    main()
