#!/usr/bin/env python3
"""Zonage initial : secteurs du marché reconstitués à partir des planches PDF calées et du SIG.

Usage :
  python3 zoner.py --extrait data-private/reseau/extrait.pkl --planches data-private/reseau/planches/planches.geojson \
      --secteurs outils/reseau/secteurs.json --sortie data-private/reseau/zonage.json

Principe :
  * les limites de secteur tracées par STEPAG sur les planches (pointillés magenta épais, planches calées
    « fiables ») et les limites des secteurs hydrauliques du SIG forment un réseau de frontières ;
  * ces frontières, élargies de quelques mètres pour refermer les pointillés, découpent le périmètre du marché
    en régions ;
  * chaque région prend le nom de secteur (grand texte violet) qu'elle contient sur une planche ; à défaut, le
    nom du secteur SIG dont elle fait partie (traduit en code du marché par secteurs.json) ;
  * une région sans nom reste « non zonée » (l'administrateur l'affecte dans Paramètres > Réseau).
Sortie : `secteurs_dessines` (contours Lambert par code du marché) à fusionner dans secteurs.json, plus un
GeoJSON WGS84 de contrôle (`zonage.geojson`) et un rapport.
"""
from __future__ import annotations

import argparse
import json
import os
import pickle
import re
import unicodedata
from collections import Counter, defaultdict

from pyproj import Transformer
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, mapping
from shapely.ops import unary_union

VERS_LAMBERT = Transformer.from_crs("EPSG:4326", "EPSG:26191", always_xy=True)
VERS_WGS84 = Transformer.from_crs("EPSG:26191", "EPSG:4326", always_xy=True)
LARGEUR_FRONTIERE = 7.0   # m de part et d'autre : referme les pointillés (tirets ≈ 3 m d'écart)

# Noms écrits sur les planches → code du secteur du marché.
NOMS_PLANCHES = {
    "qods haut chu mouhoub irriss": "qods_haut_chu_mouhoub_iriss", "qods haut chu mouhoub irri": "qods_haut_chu_mouhoub_iriss",
    "andalous": "andalous", "sidi maafa bas": "maafa_bekay_bas", "sidi maafa ba": "maafa_bekay_bas",
    "unisit colline partie h ain serrak": "ballaoui_bas_irfane", "bellaoui haut": "ballaoui_bas_irfane",
    "qods bas": "qods_bas", "chateau sidi aissa": "chateau_sidi_aissa", "au sidi aissa": "chateau_sidi_aissa",
    "azengot": "azengot", "maksam kharoub": "maksam_kharoub", "maksam": "maksam_kharoub",
    "lazaret bas": "lazaret_bas", "tairet bas": "tairet", "tairet haut": "tairet", "mbasso": "mbasso",
    "tennis 2": "tennis_2", "ennis 2": "tennis_2", "sidi driss": "sidi_driss", "tazaghine": "tazaghine",
    "el boustane": "el_boustane", "ghar el baroud zone industrielle": "ghar_el_baroud_zone_industrielle",
    "pam": "pam", "lazaret haut": "lazaret_haut", "abdellah gunoun bas": "abdellah_guenoun",
    "abdellah gunoun haut": "abdellah_guenoun", "tennis 1": "tennis_1", "aounia": "aounia",
    "belhoucine": "lieutenant_belhoucine", "t belhoucine": "lieutenant_belhoucine",
}


def normaliser(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def lambert(coords):
    return [VERS_LAMBERT.transform(x, y) for x, y in coords]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--extrait", required=True)
    ap.add_argument("--planches", required=True)
    ap.add_argument("--secteurs", required=True)
    ap.add_argument("--sortie", required=True)
    a = ap.parse_args()
    with open(a.extrait, "rb") as f:
        d = pickle.load(f)
    with open(a.planches, encoding="utf-8") as f:
        pl = json.load(f)["features"]
    with open(a.secteurs, encoding="utf-8") as f:
        cfg = json.load(f)
    corr_sig = {k.upper(): v for k, v in cfg["secteurs_sig"].items()}

    # Secteurs et zones du SIG (Lambert)
    textes = [(t.strip().upper(), x, y) for c, t, x, y, h, s in d["textes"] if c == "ELYX_DATA.EP_SECTEUR_HYDRO00" and s == "modele"]
    textes_z = [(t.strip().upper(), x, y) for c, t, x, y, h, s in d["textes"] if c == "ELYX_DATA.EP_ZONE_HYDRO00" and s == "modele"]
    sig, zones = [], []
    for c, h, pts, ferme, s in d["lignes"]:
        if s != "modele" or len(pts) < 4:
            continue
        if c == "ELYX_DATA.EP_SECTEUR_HYDRO":
            pg = Polygon(pts).buffer(0)
            noms = [t for t, x, y in textes if pg.contains(Point(x, y))]
            sig.append((noms[0] if noms else None, pg))
        elif c == "ELYX_DATA.EP_ZONE_HYDRO":
            pg = Polygon(pts).buffer(0)
            noms = [t for t, x, y in textes_z if pg.contains(Point(x, y))]
            zones.append((noms[0] if noms else None, pg))
    zones_marche = {z.upper() for z in cfg["zones_sig_marche"]}
    perimetre_sig = unary_union([pg for n, pg in zones if (n or "").upper() in zones_marche] +
                                [pg for n, pg in sig if corr_sig.get((n or "").upper())])

    # Planches fiables : emprises, frontières magenta, noms
    fiables = {f["properties"]["planche"] for f in pl if f["properties"]["type"] == "emprise" and f["properties"].get("fiable")}
    emprises = [Polygon(lambert(f["geometry"]["coordinates"][0])) for f in pl
                if f["properties"]["type"] == "emprise" and f["properties"]["planche"] in fiables]
    magenta = [LineString(lambert(f["geometry"]["coordinates"])) for f in pl
               if f["properties"]["type"] == "limite_magenta" and f["properties"]["planche"] in fiables]
    noms = []
    for f in pl:
        p = f["properties"]
        if p["type"] != "nom" or p["planche"] not in fiables or p.get("taille", 0) < 20:
            continue
        code = NOMS_PLANCHES.get(normaliser(p["texte"]))
        if code:
            x, y = VERS_LAMBERT.transform(*f["geometry"]["coordinates"])
            noms.append((code, Point(x, y), p["planche"], p["texte"]))

    perimetre = unary_union([perimetre_sig] + emprises).buffer(30)
    frontieres = unary_union([l.buffer(LARGEUR_FRONTIERE) for l in magenta] +
                             [pg.exterior.buffer(3.0) for n, pg in sig])
    regions = perimetre.difference(frontieres)
    regions = list(regions.geoms) if hasattr(regions, "geoms") else [regions]
    regions = [r for r in regions if r.area > 2000]

    par_code: dict[str, list[Polygon]] = defaultdict(list)
    sources: dict[str, Counter] = defaultdict(Counter)
    conflits = []
    non_zonees = []
    for r in regions:
        dedans = [(code, src, txt) for code, pt, src, txt in noms if r.contains(pt)]
        codes = Counter(c for c, *_ in dedans)
        if len(codes) > 1:
            conflits.append((r.area, dict(codes), [t for *_, t in dedans]))
        if codes:
            code = codes.most_common(1)[0][0]
            par_code[code].append(r)
            sources[code]["planche"] += 1
            continue
        # SIG : secteur contenant le point représentatif de la région
        p = r.representative_point()
        nom_sig = next((n for n, pg in sig if pg.contains(p)), None)
        code = corr_sig.get((nom_sig or "").upper())
        if code:
            par_code[code].append(r)
            sources[code]["sig"] += 1
        else:
            non_zonees.append((r, nom_sig))

    # Contours : régions du même code réunies, frontières rendues (tampon positif de la demi-largeur).
    contours = {}
    for code, rs in par_code.items():
        g = unary_union([x.buffer(LARGEUR_FRONTIERE + 0.5) for x in rs]).intersection(perimetre)
        if isinstance(g, Polygon):
            g = MultiPolygon([g])
        elif not isinstance(g, MultiPolygon):
            g = MultiPolygon([p for p in getattr(g, "geoms", []) if isinstance(p, Polygon)])
        contours[code] = g

    secteurs_dessines = {code: [list(map(list, p.exterior.coords)) for p in g.geoms] for code, g in contours.items()}
    with open(a.sortie, "w", encoding="utf-8") as f:
        json.dump({"secteurs_dessines": secteurs_dessines}, f)

    def poly_wgs(g):
        parts = [g] if isinstance(g, Polygon) else list(g.geoms)
        return {"type": "MultiPolygon", "coordinates": [[[list(VERS_WGS84.transform(*c)) for c in p.exterior.coords]] for p in parts]}

    feats = [{"type": "Feature", "geometry": poly_wgs(g), "properties": {"secteur_code": code, **dict(sources[code])}}
             for code, g in contours.items()]
    feats += [{"type": "Feature", "geometry": poly_wgs(r), "properties": {"secteur_code": None, "nom_sig": n}} for r, n in non_zonees]
    with open(os.path.splitext(a.sortie)[0] + ".geojson", "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Planches fiables : {len(fiables)} ({', '.join(sorted(fiables))})")
    print(f"Noms de secteur repérés : {len(noms)} ; régions : {len(regions)} ; non zonées : {len(non_zonees)}")
    for code in sorted(contours, key=lambda c: -contours[c].area):
        print(f"  {code:36} {contours[code].area / 1e6:6.2f} km²  sources {dict(sources[code])}")
    print("Non zonées (aire km², secteur SIG) :", [(round(r.area / 1e6, 3), n) for r, n in sorted(non_zonees, key=lambda x: -x[0].area)[:15]])
    if conflits:
        print("Régions à plusieurs noms (frontière non fermée ?) :")
        for aire, c, t in conflits:
            print(f"  {aire / 1e6:.2f} km² : {c} ; textes {t}")


if __name__ == "__main__":
    main()
