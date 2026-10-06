#!/usr/bin/env python3
"""Conversion du réseau d'Oujda (extrait du DWG) en GeoJSON WGS84 prêt à importer : tronçons, nœuds, secteurs.

Usage :
  python3 convertir.py --extrait data-private/reseau/extrait.pkl --secteurs secteurs.json \
      [--planches data-private/reseau/planches/planches.geojson] --sortie data-private/reseau

Entrée : `extrait.pkl` (extraire_dxf.py) ; `secteurs.json` (correspondance secteurs du SIG → codes du marché,
zones du marché, périmètre). Étapes :
  1. conduites de l'espace objet (calques par diamètre, réseau posé) ; les blocs orphelins (exports 2012 et
     2018) et le réseau projeté (« à poser », « projeté ») sont écartés ;
  2. doublons supprimés (union topologique : une conduite dessinée deux fois ne compte qu'une fois) ;
  3. diamètre et matériau : étiquette la plus proche (≤ 4 m), propagée le long des conduites sans étiquette ;
  4. tronçons = morceaux fusionnés entre deux nœuds (jonction, extrémité, vanne, changement de diamètre),
     300 m au plus, pour un cochage fin sur le terrain ;
  5. secteur = polygone de secteur (SIG) contenant le milieu du tronçon, traduit en code du marché ;
  6. périmètre : seuls les tronçons des zones du marché sont exportés (les autres vont dans hors-marche.geojson) ;
  7. nœuds : équipements du SIG (nœuds, vannes, hydrants, ventouses, vidanges, compteurs…) dédoublonnés ;
  8. reprojection Merchich / Nord Maroc (EPSG:26191) → WGS84, 6 décimales ; référence stable de chaque tronçon
     (milieu arrondi au mètre en Lambert) : un nouvel export du même dessin redonne les mêmes références.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import pickle
import re
import sys
from collections import Counter, defaultdict

from pyproj import Transformer
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

VERS_WGS84 = Transformer.from_crs("EPSG:26191", "EPSG:4326", always_xy=True)
DEC = 6
CALQUES_CONDUITES = re.compile(r"^(EP-|12EP-)?(\d{2,4}|\d{2}[xX]\d{2,3})( ?(PVC|BA|BAP|PEHD))?$")
CALQUES_NEUFS = re.compile(r"^(r.seau pos.|RESEAU NV)$", re.I)
ETIQUETTE = re.compile(r"^\s*(?:%%C|Ø|DN)?\s*(\d{2,4})(?:\s*[xX]\s*(\d{2,3}))?\s*(PVC|BA|BAP|PEHD|PE|AC|FONTE|FD)?\s*(?:PN\s*\d+)?\s*$", re.I)
DIAMETRES_PVC = {63, 75, 90, 110, 125, 140, 160, 225, 250, 315}
DIAMETRES_DN = {60, 80, 100, 150, 300, 350, 500, 600, 700, 800, 1000}
LONGUEUR_MAX = 300.0
LONGUEUR_MIN = 0.5          # m : en dessous, bruit de dessin
DISTANCE_ETIQUETTE = 4.0
TYPES_NOEUDS = {
    "EP_NOEUD": "jonction", "EP_VANNE": "vanne", "VANNE": "vanne", "VANNES": "vanne", "vz": "vanne", "v6": "vanne",
    "EP_HYDRANT": "bouche_incendie", "bouche d'incendie": "bouche_incendie", "EP_VENTOUSE": "ventouse",
    "EP_VIDANGE": "vidange", "EP_COMPTEUR_I": "compteur", "EP_COMPTEUR_A": "compteur", "COMPTEUR": "compteur",
    "EP_RESERVOIR": "reservoir", "EP_BACHE": "reservoir", "EP_OBTURATEUR": "extremite",
    "EP_CONE_REDUC": "autre", "EP_REDUC_PRES": "autre", "EP_REGARD": "autre", "EP_POMPE": "autre", "EP_FORAGE": "autre",
}
# Un tronçon ne traverse pas ces équipements (limites naturelles d'un tronçon).
COUPURES = {"vanne", "reservoir"}


def lire_diametre(texte: str):
    m = ETIQUETTE.match(texte.replace("{", "").replace("}", ""))
    if not m:
        return None
    a, b, mat = int(m.group(1)), m.group(2), (m.group(3) or "").upper()
    if b:  # « 33X50 » : polyéthylène, diamètre extérieur = second nombre
        return int(b), "PEHD"
    if not 40 <= a <= 1200:
        return None
    if mat in ("PVC",):
        return a, "PVC"
    if mat in ("BA", "BAP"):
        return a, "BETON"
    if mat in ("PEHD", "PE"):
        return a, "PEHD"
    if mat in ("FONTE", "FD"):
        return a, "FONTE"
    if mat == "AC":
        return a, "AC"
    if a in DIAMETRES_PVC:
        return a, "PVC"
    return a, None


def cle(p, pas=0.02):
    return (round(p[0] / pas), round(p[1] / pas))


def wgs(p):
    lon, lat = VERS_WGS84.transform(p[0], p[1])
    return [round(lon, DEC), round(lat, DEC)]


def polygones(d, calque, calque_texte):
    textes = [(t.strip(), x, y) for c, t, x, y, h, s in d["textes"] if c == calque_texte and s == "modele"]
    out = []
    for c, h, pts, f, s in d["lignes"]:
        if c != calque or s != "modele" or len(pts) < 4:
            continue
        pg = Polygon(pts)
        if not pg.is_valid:
            pg = pg.buffer(0)
        if pg.area < 100:
            continue
        if any(abs(pg.area - q.area) < 1 and pg.centroid.distance(q.centroid) < 1 for _, q in out):
            continue
        noms = [t for t, x, y in textes if pg.contains(Point(x, y))]
        out.append((noms[0] if noms else None, pg))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--extrait", required=True)
    ap.add_argument("--secteurs", required=True, help="correspondance secteurs SIG → codes du marché (JSON)")
    ap.add_argument("--planches", help="planches calées (caler_planches.py) : leurs emprises élargissent le périmètre")
    ap.add_argument("--zonage", help="zonage initial (zoner.py) : remplace la correspondance directe avec le SIG")
    ap.add_argument("--sortie", required=True)
    a = ap.parse_args()
    with open(a.extrait, "rb") as f:
        d = pickle.load(f)
    with open(a.secteurs, encoding="utf-8") as f:
        cfg = json.load(f)
    os.makedirs(a.sortie, exist_ok=True)
    journal: list[str] = []

    def note(t):
        print(t, file=sys.stderr)
        journal.append(t)

    # --- 1. Conduites de l'espace objet ------------------------------------------------------------
    brutes = []
    calques = Counter()
    for c, h, pts, f, s in d["lignes"]:
        if s != "modele" or not (CALQUES_CONDUITES.match(c) or CALQUES_NEUFS.match(c)) or len(pts) < 2:
            continue
        l = LineString(pts)
        if l.length < 0.05:
            continue
        brutes.append(l)
        calques[c] += 1
    long_brut = sum(l.length for l in brutes)

    # --- 2. Doublons ----------------------------------------------------------------------------
    u = unary_union(brutes)
    morceaux = [g for g in (u.geoms if hasattr(u, "geoms") else [u]) if g.length >= 0.05]
    note(f"Conduites : {len(brutes)} lignes, {long_brut / 1000:.1f} km dessinés ; sans doublons {sum(g.length for g in morceaux) / 1000:.1f} km ({len(morceaux)} morceaux)")

    # --- 3. Diamètres ---------------------------------------------------------------------------
    arbre = STRtree(morceaux)
    diam: dict[int, tuple[int, str | None]] = {}
    votes: dict[int, Counter] = defaultdict(Counter)
    for c, t, x, y, h, s in d["textes"]:
        if s != "modele":
            continue
        v = lire_diametre(t)
        if not v:
            continue
        p = Point(x, y)
        i = int(arbre.nearest(p))
        if morceaux[i].distance(p) <= DISTANCE_ETIQUETTE:
            votes[i][v] += 1
    for i, cnt in votes.items():
        diam[i] = cnt.most_common(1)[0][0]
    note(f"Diamètres : {len(diam)} morceaux étiquetés directement sur {len(morceaux)}")

    # Graphe des morceaux
    extremites: dict[tuple, list[int]] = defaultdict(list)
    bouts = []
    for i, g in enumerate(morceaux):
        c0, c1 = g.coords[0], g.coords[-1]
        k0, k1 = cle(c0), cle(c1)
        bouts.append((k0, k1))
        extremites[k0].append(i)
        extremites[k1].append(i)
    degre = {k: len(v) for k, v in extremites.items()}

    # Équipements (nœuds) de l'espace objet, rattachés au nœud du graphe le plus proche
    equipements = []
    for c, nom, x, y, s in d["inserts"]:
        if s != "modele":
            continue
        t = TYPES_NOEUDS.get(nom)
        if t:
            equipements.append((t, nom, c, x, y))
    coupe: set[tuple] = set()
    if equipements:
        cles_noeuds = list(extremites.keys())
        arbre_n = STRtree([Point(k[0] * 0.02, k[1] * 0.02) for k in cles_noeuds])
        for t, nom, c, x, y in equipements:
            if t in COUPURES:
                j = int(arbre_n.nearest(Point(x, y)))
                k = cles_noeuds[j]
                if math.dist((k[0] * 0.02, k[1] * 0.02), (x, y)) <= 1.0:
                    coupe.add(k)

    # Propagation des diamètres : (a) à travers les nœuds de degré 2 ; (b) à travers une jonction, vers le
    # morceau qui prolonge en ligne droite (± 20°) un morceau de diamètre connu (la conduite continue).
    def direction(i, k):
        cs = list(morceaux[i].coords)
        if cle(cs[0]) != k:
            cs = cs[::-1]
        (x0, y0), (x1, y1) = cs[0], cs[1]
        return math.atan2(y1 - y0, x1 - x0)

    change = True
    tours = 0
    while change and tours < 300:
        change = False
        tours += 1
        for k, lst in extremites.items():
            inconnus = [i for i in lst if i not in diam]
            if not inconnus or len(inconnus) == len(lst):
                continue
            if len(lst) == 2 and lst[0] != lst[1]:
                diam[inconnus[0]] = diam[lst[0] if lst[1] == inconnus[0] else lst[1]]
                change = True
                continue
            for i in inconnus:
                ai = direction(i, k)
                for j in lst:
                    if j in diam and j != i:
                        ecart = abs((direction(j, k) - ai + math.pi) % (2 * math.pi) - math.pi)
                        if abs(ecart - math.pi) <= math.radians(20):
                            diam[i] = diam[j]
                            change = True
                            break
    note(f"Diamètres après propagation : {len(diam)} morceaux sur {len(morceaux)} ({100 * sum(morceaux[i].length for i in diam) / sum(g.length for g in morceaux):.0f} % du linéaire)")

    # --- 4. Fusion en tronçons --------------------------------------------------------------------
    vu = [False] * len(morceaux)

    def voisin(k, i):
        lst = extremites[k]
        if len(lst) != 2 or lst[0] == lst[1]:
            return None
        return lst[1] if lst[0] == i else lst[0]

    def traversable(k, i):
        j = voisin(k, i)
        return j is not None and k not in coupe and diam.get(i) == diam.get(j)

    def autre_bout(i, k):
        return bouts[i][1] if bouts[i][0] == k else bouts[i][0]

    def orienter(g, depart):
        cs = list(g.coords)
        return cs if cle(cs[0]) == depart else cs[::-1]

    troncons = []
    for depart_i in range(len(morceaux)):
        if vu[depart_i]:
            continue
        # Remonter jusqu'à une extrémité de chaîne (nœud non traversable).
        i, k = depart_i, bouts[depart_i][0]
        pas_faits = 0
        while traversable(k, i) and pas_faits < len(morceaux):
            j = voisin(k, i)
            if vu[j] or j == depart_i:
                break
            k = autre_bout(j, k)
            i = j
            pas_faits += 1
        # Descendre la chaîne depuis (i, k).
        courant: list = []
        longueur = 0.0
        d_courant = diam.get(i)
        while i is not None and not vu[i]:
            vu[i] = True
            cs = orienter(morceaux[i], k)
            if courant and longueur + morceaux[i].length > LONGUEUR_MAX:
                troncons.append((courant, d_courant))
                courant, longueur = [], 0.0
            courant = courant + (cs if not courant else cs[1:])
            longueur += morceaux[i].length
            k = cle(cs[-1])
            j = voisin(k, i)
            i = j if (j is not None and traversable(k, i) and not vu[j]) else None
        if courant:
            troncons.append((courant, d_courant))
    note(f"Tronçons : {len(troncons)} (≤ {LONGUEUR_MAX:.0f} m, coupés aux jonctions, vannes et changements de diamètre)")

    # --- 5. Secteurs ----------------------------------------------------------------------------
    sig_secteurs = polygones(d, "ELYX_DATA.EP_SECTEUR_HYDRO", "ELYX_DATA.EP_SECTEUR_HYDRO00")
    sig_zones = polygones(d, "ELYX_DATA.EP_ZONE_HYDRO", "ELYX_DATA.EP_ZONE_HYDRO00")
    corr = {k.upper(): v for k, v in cfg["secteurs_sig"].items()}
    polys_marche: dict[str, list[Polygon]] = defaultdict(list)
    sig_non_marche = []
    for nom, pg in sig_secteurs:
        code = corr.get((nom or "").upper())
        if code:
            polys_marche[code].append(pg)
        else:
            sig_non_marche.append((nom, pg))
    # Secteurs du marché absents du SIG : polygones fournis (repérés sur les planches calées), en Lambert.
    for code, anneaux in cfg.get("secteurs_dessines", {}).items():
        for anneau in anneaux:
            polys_marche[code].append(Polygon(anneau))
    if a.zonage:
        with open(a.zonage, encoding="utf-8") as f:
            zonage = json.load(f)["secteurs_dessines"]
        polys_marche = defaultdict(list)
        for code, anneaux in zonage.items():
            for anneau in anneaux:
                polys_marche[code].append(Polygon(anneau).buffer(0))
        note(f"Zonage : {len(polys_marche)} secteurs du marché tirés des planches et du SIG ({a.zonage})")
    secteurs_marche = [(code, unary_union(pgs)) for code, pgs in polys_marche.items()]
    arbre_s = STRtree([g for _, g in secteurs_marche])

    # Périmètre du marché : zones SIG retenues + secteurs du marché + emprises des planches, tampon 50 m.
    perimetre_parts = [pg for nom, pg in sig_zones if (nom or "").upper() in {z.upper() for z in cfg["zones_sig_marche"]}]
    perimetre_parts += [g for _, g in secteurs_marche]
    # Les rectangles des planches débordent largement des secteurs (A3) : ils n'élargissent le périmètre que
    # sans zonage (premier passage) ; avec un zonage, le périmètre = zones du marché + secteurs identifiés.
    if a.planches and os.path.exists(a.planches) and not a.zonage:
        with open(a.planches, encoding="utf-8") as f:
            pl = json.load(f)
        vers_lambert = Transformer.from_crs("EPSG:4326", "EPSG:26191", always_xy=True)
        for ft in pl["features"]:
            if ft["properties"].get("type") == "emprise":
                anneau = [vers_lambert.transform(x, y) for x, y in ft["geometry"]["coordinates"][0]]
                perimetre_parts.append(Polygon(anneau))
    perimetre = unary_union(perimetre_parts).buffer(50)

    def secteur_de(p: Point):
        for j in arbre_s.query(p):
            if secteurs_marche[int(j)][1].contains(p):
                return secteurs_marche[int(j)][0]
        return None

    arbre_sig = STRtree([pg for _, pg in sig_secteurs])

    def nom_sig(p: Point):
        for j in arbre_sig.query(p):
            if sig_secteurs[int(j)][1].contains(p):
                return sig_secteurs[int(j)][0] or "(secteur SIG sans nom)"
        return "(hors secteurs SIG)"

    non_zones_sig: Counter = Counter()
    trop_courts = 0
    features, hors = [], []
    refs: Counter = Counter()
    lin_secteur: Counter = Counter()
    nb_secteur: Counter = Counter()
    lin_diam = 0.0
    for coords, dm in troncons:
        ligne = LineString(coords)
        milieu = ligne.interpolate(0.5, normalized=True)
        ref = f"T{round(milieu.x)}_{round(milieu.y)}"
        refs[ref] += 1
        if refs[ref] > 1:
            ref = f"{ref}_{refs[ref]}"
        code = secteur_de(milieu)
        props = {"reference": ref, "calque": None, "categorie": "conduite",
                 "diametre_mm": dm[0] if dm else None, "materiau": dm[1] if dm else None, "secteur_code": code}
        # Coordonnées arrondies (0,1 m), sommets répétés retirés ; moins de 0,5 m ou un seul point : bruit de dessin.
        points = []
        for p in coords:
            q = wgs(p)
            if not points or q != points[-1]:
                points.append(q)
        if len(points) < 2 or ligne.length < LONGUEUR_MIN:
            trop_courts += 1
            continue
        geom = {"type": "LineString", "coordinates": points}
        if code is None and not perimetre.contains(milieu):
            hors.append({"type": "Feature", "geometry": geom, "properties": props})
            continue
        features.append({"type": "Feature", "geometry": geom, "properties": props})
        lin_secteur[code or "(non zoné)"] += ligne.length
        if code is None:
            non_zones_sig[nom_sig(milieu)] += ligne.length
        nb_secteur[code or "(non zoné)"] += 1
        if dm:
            lin_diam += ligne.length

    # --- 7. Nœuds ---------------------------------------------------------------------------------
    noeuds, vus = [], set()
    for t, nom, c, x, y in equipements:
        k = (t, round(x * 2), round(y * 2))
        if k in vus:
            continue
        vus.add(k)
        p = Point(x, y)
        code = secteur_de(p)
        if code is None and not perimetre.contains(p):
            continue
        noeuds.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": wgs((x, y))},
                       "properties": {"reference": f"N{t[:2].upper()}{round(x)}_{round(y)}", "calque": c, "type": t, "secteur_code": code}})
    refs_n = Counter(n["properties"]["reference"] for n in noeuds)
    vus_n: Counter = Counter()
    for n in noeuds:
        r = n["properties"]["reference"]
        if refs_n[r] > 1:
            vus_n[r] += 1
            n["properties"]["reference"] = f"{r}_{vus_n[r]}"

    # --- 8. Écriture ------------------------------------------------------------------------------
    def ecrire(nom, fc_features):
        with open(os.path.join(a.sortie, nom), "w", encoding="utf-8") as f:
            json.dump({"type": "FeatureCollection", "features": fc_features}, f, ensure_ascii=False, separators=(",", ":"))

    ecrire("troncons.geojson", features)
    ecrire("noeuds.geojson", noeuds)
    ecrire("hors-marche.geojson", hors)

    def poly_wgs(g):
        """Contour valide en WGS84 : simplifié à 1 m, trous ignorés, réparé après arrondi (auto-intersections)."""
        from shapely.validation import make_valid
        g = g.buffer(0).simplify(1.0, preserve_topology=True).buffer(0)
        parts = [g] if isinstance(g, Polygon) else [p for p in getattr(g, "geoms", []) if isinstance(p, Polygon)]
        sortie = []
        for p_ in parts:
            if p_.area < 50:
                continue
            q = Polygon([wgs(c) for c in p_.exterior.coords])
            if not q.is_valid:
                q = make_valid(q)
            for r in ([q] if isinstance(q, Polygon) else [x for x in getattr(q, "geoms", []) if isinstance(x, Polygon)]):
                anneau = [[round(x, DEC), round(y, DEC)] for x, y in r.exterior.coords]
                if Polygon(anneau).is_valid:
                    sortie.append([anneau])
                else:
                    r2 = Polygon(anneau).buffer(0)
                    for r3 in ([r2] if isinstance(r2, Polygon) else list(getattr(r2, "geoms", []))):
                        sortie.append([[[round(x, DEC), round(y, DEC)] for x, y in r3.exterior.coords]])
        return {"type": "MultiPolygon", "coordinates": sortie}

    ecrire("secteurs.geojson", [{"type": "Feature", "geometry": poly_wgs(g), "properties": {"secteur_code": code}}
                                for code, g in secteurs_marche])
    ecrire("secteurs-sig-hors-marche.geojson", [{"type": "Feature", "geometry": poly_wgs(pg), "properties": {"nom_sig": nom}}
                                                for nom, pg in sig_non_marche])

    total = sum(lin_secteur.values())
    r = ["# Rapport de conversion du réseau d'Oujda", "",
         "- Source : `Reseau aep oujda.dwg` (AutoCAD 2013) → DXF (LibreDWG 0.14) → espace objet seulement.",
         "- Système : Merchich / Nord Maroc (EPSG:26191) → WGS84 (EPSG:4326), 6 décimales (≈ 0,1 m).", ""]
    journal.append(f"Tronçons de moins de {LONGUEUR_MIN} m (bruit de dessin) écartés : {trop_courts}")
    r += [f"- {t}" for t in journal]
    r += [f"- Exportés : {len(features)} tronçons, {total / 1000:.1f} km ; diamètre connu sur {100 * lin_diam / max(total, 1):.0f} % du linéaire",
          f"- Hors périmètre du marché (non exportés) : {len(hors)} tronçons, {sum(LineString([VERS_WGS84.transform(*p, direction='INVERSE') for p in f_['geometry']['coordinates']]).length for f_ in hors) / 1000:.1f} km",
          f"- Nœuds exportés : {len(noeuds)} ({dict(Counter(n['properties']['type'] for n in noeuds))})", "",
          "## Linéaire par secteur du marché", "", "| Secteur | Tronçons | Linéaire (km) |", "|---|---:|---:|"]
    for code, l in sorted(lin_secteur.items(), key=lambda kv: -kv[1]):
        r.append(f"| {code} | {nb_secteur[code]} | {l / 1000:.1f} |")
    r += ["", "## Tronçons non zonés, par secteur du SIG (à affecter dans Paramètres > Réseau)", "",
          "| Secteur du SIG | Linéaire (km) |", "|---|---:|"]
    for n, l in non_zones_sig.most_common():
        r.append(f"| {n} | {l / 1000:.1f} |")
    r += ["", "## Calques retenus", ""] + [f"- {c} : {k}" for c, k in calques.most_common()]
    with open(os.path.join(a.sortie, "rapport-conversion.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(r) + "\n")
    print("\n".join(r))


if __name__ == "__main__":
    main()
