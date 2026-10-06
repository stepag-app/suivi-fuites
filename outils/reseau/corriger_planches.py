#!/usr/bin/env python3
"""Régénère planches.geojson sans refaire la recherche (45 min) : reprend le calage de chaque planche à partir de
son emprise déjà calculée, applique d'éventuels calages corrigés, et reconstruit emprises, limites et noms.

Usage :
  python3 corriger_planches.py --planches data-private/reseau/planches/planches.geojson --plans <dossier des planches> \
      [--remplacer "Tazaghine=data-private/reseau/planches/tazaghine.json"]

Le fichier de remplacement contient {"alpha": [re, im], "beta": [re, im], "superposition": x, "ecart": m}
(z_dessin = alpha·conj(z_pdf) + beta, coordonnées Lambert Nord Maroc).
"""
from __future__ import annotations

import argparse
import json
import os

import fitz
from pyproj import Transformer

from caler_planches import features_planche

VERS_LAMBERT = Transformer.from_crs("EPSG:4326", "EPSG:26191", always_xy=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--planches", required=True)
    ap.add_argument("--plans", required=True)
    ap.add_argument("--remplacer", action="append", default=[])
    a = ap.parse_args()
    with open(a.planches, encoding="utf-8") as f:
        anciennes = json.load(f)["features"]
    remplacements = {}
    for r in a.remplacer:
        nom, chemin = r.split("=", 1)
        with open(chemin, encoding="utf-8") as f:
            remplacements[nom] = json.load(f)

    features = []
    rapport = ["# Calage des planches PDF sur le dessin", "",
               "| Planche | Méthode | Rotation | Échelle (m/pt) | Conduites superposées (≤ 2 m) | Écart médian (m) | Calage |",
               "|---|---|---:|---:|---:|---:|---|"]
    for e in anciennes:
        p = e["properties"]
        if p["type"] != "emprise":
            continue
        nom = p["planche"]
        chemin = os.path.join(a.plans, nom + ".pdf")
        page = fitz.open(chemin)[0]
        page.remove_rotation()
        if nom in remplacements:
            m = remplacements[nom]
            res = (complex(*m["alpha"]), complex(*m["beta"]), m["superposition"], m["ecart"])
            methode = "géométrie (recherche ciblée sur les secteurs voisins)"
        else:
            c0 = complex(*VERS_LAMBERT.transform(*e["geometry"]["coordinates"][0][0]))
            c1 = complex(*VERS_LAMBERT.transform(*e["geometry"]["coordinates"][0][1]))
            beta = c0                                   # coin (x0, y0) = (0, 0) de la page
            alpha = (c1 - beta) / page.rect.x1          # coin (x1, 0)
            res = (alpha, beta, p["superposition"], p["ecart_median_m"])
            methode = p["methode"]
        feats, ligne = features_planche(nom, chemin, res, methode)
        feats[0]["properties"]["alpha"] = [res[0].real, res[0].imag]
        feats[0]["properties"]["beta"] = [res[1].real, res[1].imag]
        features += feats
        rapport.append(ligne)
    with open(a.planches, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(os.path.dirname(a.planches), "calage-planches.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(rapport) + "\n")
    print("\n".join(rapport))


if __name__ == "__main__":
    main()
