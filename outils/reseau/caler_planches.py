#!/usr/bin/env python3
"""Calage des planches PDF sur le dessin du réseau.

Chaque planche est une impression vectorielle du DWG (A3, sans coordonnées, la plupart des textes convertis en
traits) ; l'orientation, l'échelle et le cadrage changent d'une impression à l'autre. On retrouve la similitude
PDF → dessin (rotation, échelle, translation, symétrie verticale du PDF) ainsi :
  1. textes communs (titres fonciers, lots…) appariés par tirage aléatoire robuste (RANSAC), quand la planche a
     gardé ses textes ;
  2. sinon, corrélation géométrique : les conduites de la planche (traits bleus, rouges, verts, magenta fins)
     sont échantillonnées, tournées et mises à l'échelle (rotation tous les 2°, échelle tous les 4 %), rastérisées
     et corrélées (FFT) avec la carte des conduites du DWG, dans une fenêtre autour du secteur attendu ;
  3. affinage commun : itérations « point le plus proche » (ICP) sur les conduites, moindres carrés.
La qualité est la part des points de conduite de la planche à moins de 2 m d'une conduite du dessin.
Ensuite, les limites magenta épaisses (secteurs tracés par STEPAG) et les grands noms de secteur sont reportés en
Lambert puis WGS84.

Usage :
  python3 caler_planches.py --extrait data-private/reseau/extrait.pkl --dxf data-private/reseau/reseau.dxf \
      --plans <dossier des planches> --sortie data-private/reseau/planches [--processus 6]
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import pickle
import random
import re
import sys
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor

import fitz  # PyMuPDF
import numpy as np
from pyproj import Transformer
from scipy import ndimage, signal
from scipy.spatial import cKDTree
from shapely.geometry import Point, Polygon

VERS_WGS84 = Transformer.from_crs("EPSG:26191", "EPSG:4326", always_xy=True)
VERS_LAMBERT = Transformer.from_crs("EPSG:4326", "EPSG:26191", always_xy=True)
CALQUES_CONDUITES = re.compile(r"^(EP-|12EP-)?(\d{2,4}|\d{2}[xX]\d{2,3})( ?(PVC|BA|BAP|PEHD))?$")
X0, Y0, X1, Y1 = 812500.0, 451500.0, 834000.0, 470500.0
COULEURS_CONDUITES = {(0.0, 0.0, 1.0), (0.0, 0.5, 1.0), (1.0, 0.0, 0.0), (0.0, 0.58, 0.0), (0.5, 0.0, 0.0)}

# Secteur(s) du SIG autour duquel chercher chaque planche (centre approximatif de la fenêtre de recherche).
CENTRES_SIG = {
    "Azengot": ["AZENGOT"], "Ballaoui Bas-Irfane et autre part 1": ["UNIVERSITE", "QODS HAUT"],
    "Ghar el baroud-zone indust": ["ZONE INDUSTRIELLE", "BOUSTANE"], "Lazaret Haut part 2": ["LAZARET HAUT"],
    "Lazaret haut part 1": ["LAZARET HAUT"], "Mbasso": ["MBASSO"], "Qods Bas": ["QODS BAS"],
    "Qods Haut,Chu,Mouhoub-Irriss": ["QODS HAUT"], "Sidi driss": ["SIDI DRISS"], "Tennis 2": ["TENNIS 2"],
    "abdellah guennoun bas": ["A.GUENNOUN"], "abdellah guennoun haut": ["A.GUENNOUN"], "lazaret bas": ["LAZARET BAS"],
    "tairet bas": ["TAIRET"], "tairet haut": ["TAIRET"], "Tazaghine": ["LAZARET HAUT", "LAZARET BAS", "TENNIS 2"],
    "Château Sidi Aissa": ["AZENGOT"], "Maksam-Kharoub": ["AZENGOT"], "pam": ["MAAFA ET BEKKAY", "A.GUENNOUN"],
    "Andalous": ["ANDALOUS"], "Maafa Bekkay Bas": ["MAAFA ET BEKKAY"],
}
DEMI_FENETRE = 4200.0      # m
PAS_GROSSIER = 10.0        # m / pixel
ANGLES = np.arange(0.0, 360.0, 2.0)
ECHELLES = np.array([1.0 * 1.04 ** i for i in range(33)])   # 1,0 à 3,5 m/pt


# ---------------------------------------------------------------------------------------------------
# Textes (méthode 1)
# ---------------------------------------------------------------------------------------------------
def normaliser_texte(t: str) -> str:
    t = re.sub(r"\\[A-Za-z][^;]*;", "", t)
    t = re.sub(r"[{}]", "", t).replace("\\P", " ")
    return re.sub(r"\s+", "", t).upper()


def textes_dessin(dxf: str, cache: str):
    if os.path.exists(cache):
        with open(cache, "rb") as f:
            return pickle.load(f)
    textes: list[tuple[str, float, float]] = []
    with open(dxf, encoding="cp1252", errors="replace", newline="") as f:
        type_ = None
        dans_bloc = False
        cur: dict = {}

        def fin():
            if type_ in ("TEXT", "MTEXT") and not dans_bloc and cur.get("t") and "x" in cur and "y" in cur:
                n = normaliser_texte(cur["t"])
                if 2 <= len(n) <= 40:
                    textes.append((n, cur["x"], cur["y"]))

        while True:
            code = f.readline()
            if not code:
                break
            val = f.readline().rstrip("\r\n")
            code = code.strip()
            if code == "0":
                fin()
                if val == "BLOCK":
                    dans_bloc = True
                elif val == "ENDBLK":
                    dans_bloc = False
                type_ = val
                cur = {}
            elif type_ in ("TEXT", "MTEXT"):
                if code == "1":
                    cur["t"] = val
                elif code == "3":
                    cur["t"] = cur.get("t", "") + val
                elif code == "10":
                    cur["x"] = float(val)
                elif code == "20":
                    cur["y"] = float(val)
    with open(cache, "wb") as f:
        pickle.dump(textes, f)
    return textes


def calage_textes(page, index):
    """Renvoie (alpha, beta) tels que z_dessin = alpha·conj(z_pdf) + beta, ou None."""
    tp = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l.get("spans", []):
                n = normaliser_texte(s["text"])
                if 4 <= len(n) <= 40 and not re.fullmatch(r"\d{2,3}|\d{2}X\d{2}", n):
                    o = s.get("origin")
                    tp.append((n, o[0], o[1]))
    freq = Counter(t for t, *_ in tp)
    paires = [(complex(x, y).conjugate(), d) for t, x, y in tp if freq[t] <= 3 and 0 < len(index.get(t, ())) <= 6 for d in index[t]]
    meilleur = (0, None)
    rnd = random.Random(11)
    for _ in range(4000 if len(paires) >= 3 else 0):
        (p1, d1), (p2, d2) = rnd.sample(paires, 2)
        if abs(d1 - d2) < 20 or abs(p1 - p2) < 30:
            continue
        al = (d1 - d2) / (p1 - p2)
        if not (0.5 < abs(al) < 5):
            continue
        be = d1 - al * p1
        inl = sum(1 for p, d in paires if abs(al * p + be - d) < 6)
        if inl > meilleur[0]:
            meilleur = (inl, (al, be))
    if meilleur[0] < 6:
        return None
    al, be = meilleur[1]
    sel = [(p, d) for p, d in paires if abs(al * p + be - d) < 6]
    return moindres_carres(np.array([p for p, _ in sel]), np.array([d for _, d in sel])), len(sel)


# ---------------------------------------------------------------------------------------------------
# Géométrie
# ---------------------------------------------------------------------------------------------------
def moindres_carres(p: np.ndarray, d: np.ndarray):
    mp, md = p.mean(), d.mean()
    al = np.sum((d - md) * np.conj(p - mp)) / np.sum(np.abs(p - mp) ** 2)
    return complex(al), complex(md - al * mp)


def points_conduites_pdf(page, pas_pt=1.5) -> np.ndarray:
    """Points échantillonnés le long des conduites de la planche, en conj(z_pdf) (symétrie appliquée)."""
    pts = []
    for d in page.get_drawings():
        c = d.get("color")
        if not c or tuple(round(v, 2) for v in c[:3]) not in COULEURS_CONDUITES:
            continue
        if (d.get("width") or 0) > 1.0 and tuple(round(v, 2) for v in c[:3]) != (0.5, 0.0, 0.0):
            continue
        for it in d["items"]:
            if it[0] != "l":
                continue
            a = complex(it[1].x, it[1].y)
            b = complex(it[2].x, it[2].y)
            n = max(1, int(abs(b - a) / pas_pt))
            t = np.linspace(0, 1, n + 1)
            pts.append(a + (b - a) * t)
    if not pts:
        return np.zeros(0, dtype=complex)
    return np.conj(np.concatenate(pts))


def carte_dessin(extrait: str, pas: float, sigma: float):
    with open(extrait, "rb") as f:
        d = pickle.load(f)
    w = int((X1 - X0) / pas) + 1
    h = int((Y1 - Y0) / pas) + 1
    img = np.zeros((h, w), dtype=np.float32)
    sommets = []
    for c, hdl, pts, ferme, src in d["lignes"]:
        if src != "modele" or not CALQUES_CONDUITES.match(c):
            continue
        for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
            L = math.hypot(xb - xa, yb - ya)
            n = max(1, int(L / 1.0))
            t = np.linspace(0, 1, n + 1)
            xs = xa + (xb - xa) * t
            ys = ya + (yb - ya) * t
            sommets.append(np.column_stack([xs, ys]))
    s = np.concatenate(sommets)
    j = ((s[:, 0] - X0) / pas).astype(int)
    i = ((Y1 - s[:, 1]) / pas).astype(int)
    ok = (i >= 0) & (i < h) & (j >= 0) & (j < w)
    img[i[ok], j[ok]] = 1.0
    img = ndimage.gaussian_filter(img, sigma)
    img /= img.max()
    img = img - ndimage.gaussian_filter(img, 4 * sigma + 2)   # passe-haut : seules les structures comptent
    return img, s


def rasteriser(q: np.ndarray, pas: float, sigma: float):
    ox, oy = q.real.min(), q.imag.max()
    j = ((q.real - ox) / pas).astype(int)
    i = ((oy - q.imag) / pas).astype(int)
    h, w = i.max() + 1, j.max() + 1
    img = np.zeros((h, w), dtype=np.float32)
    np.add.at(img, (i, j), 1.0)
    img = np.minimum(img, 1.0)
    if sigma > 0:
        img = ndimage.gaussian_filter(img, sigma)
    return img, ox, oy


def chercher(q_pdf: np.ndarray, carte: np.ndarray, centre: tuple[float, float], garder=12):
    """Recherche grossière : les meilleurs (rotation, échelle, translation) dans la fenêtre autour du centre.

    Carte et gabarit sont filtrés passe-haut (le fond « réseau dense » ne ressemble alors plus à tout), la
    corrélation est normalisée par la masse du gabarit ; on garde les `garder` meilleurs candidats distincts,
    départagés ensuite par l'affinage point à point.
    """
    cx, cy = centre
    wx0 = max(X0, cx - DEMI_FENETRE)
    wy1 = min(Y1, cy + DEMI_FENETRE)
    j0 = int((wx0 - X0) / PAS_GROSSIER)
    i0 = int((Y1 - wy1) / PAS_GROSSIER)
    n = int(2 * DEMI_FENETRE / PAS_GROSSIER)
    fen = carte[i0:i0 + n, j0:j0 + n]
    m = q_pdf.mean()
    sous = q_pdf[:: max(1, len(q_pdf) // 30000)] - m
    candidats: list[tuple[float, complex, complex]] = []
    for ang in ANGLES:
        rot = complex(math.cos(math.radians(ang)), math.sin(math.radians(ang)))
        for k in ECHELLES:
            q = sous * rot * k
            tpl, ox, oy = rasteriser(q, PAS_GROSSIER, 0.7)
            if tpl.shape[0] >= fen.shape[0] or tpl.shape[1] >= fen.shape[1]:
                continue
            tpl = tpl - ndimage.gaussian_filter(tpl, 4)
            r = signal.fftconvolve(fen, tpl[::-1, ::-1], mode="valid")
            idx = int(np.argmax(r))
            iy, ix = np.unravel_index(idx, r.shape)
            score = float(r[iy, ix]) / float(np.abs(tpl).sum())
            X = X0 + (j0 + ix) * PAS_GROSSIER
            Y = Y1 - (i0 + iy) * PAS_GROSSIER
            alpha = rot * k
            beta = complex(X - ox, Y - oy) - alpha * m
            candidats.append((score, alpha, beta))
    candidats.sort(key=lambda c: -c[0])
    retenus: list[tuple[float, complex, complex]] = []
    for c in candidats:
        z = c[1] * m + c[2]
        if all(abs(z - (r[1] * m + r[2])) > 150 or abs(c[1] - r[1]) / abs(r[1]) > 0.06 for r in retenus):
            retenus.append(c)
        if len(retenus) >= garder:
            break
    return retenus


def icp(q_pdf: np.ndarray, arbre: cKDTree, alpha: complex, beta: complex, tours=12):
    sous = q_pdf[:: max(1, len(q_pdf) // 60000)]
    for seuil in [25, 15, 10, 6, 4, 3, 2.5, 2, 2, 2, 2, 2][:tours]:
        z = alpha * sous + beta
        dist, idx = arbre.query(np.column_stack([z.real, z.imag]), distance_upper_bound=seuil)
        ok = np.isfinite(dist)
        if ok.sum() < 50:
            break
        cible = arbre.data[idx[ok]]
        alpha, beta = moindres_carres(sous[ok], cible[:, 0] + 1j * cible[:, 1])
    z = alpha * sous + beta
    dist, _ = arbre.query(np.column_stack([z.real, z.imag]))
    return alpha, beta, float(np.mean(dist <= 2.0)), float(np.median(dist))


# Données de travail de chaque processus (chargées par `initialiser` : macOS démarre les processus par « spawn »).
G: dict = {}


def initialiser(extrait: str) -> None:
    carte, sommets = carte_dessin(extrait, PAS_GROSSIER, 1.0)
    G["carte"] = carte
    G["arbre"] = cKDTree(sommets)


def caler(nom: str, chemin: str, centre: tuple[float, float] | None, depart):
    page = fitz.open(chemin)[0]
    page.remove_rotation()
    q = points_conduites_pdf(page)
    if len(q) < 500:
        return nom, None, "trop peu de conduites sur la planche"
    if depart is not None:
        alpha, beta = depart
        methode = "textes"
    else:
        candidats = chercher(q, G["carte"], centre)
        if not candidats:
            return nom, None, "échec de la recherche"
        essais = [(icp(q, G["arbre"], al, be), sc) for sc, al, be in candidats]
        (alpha, beta, part, med), score = max(essais, key=lambda e: e[0][2])
        return nom, (alpha, beta, part, med), f"géométrie (corrélation {score:.2f}, {len(candidats)} candidats)"
    alpha, beta, part, med = icp(q, G["arbre"], alpha, beta)
    return nom, (alpha, beta, part, med), methode


def features_planche(nom: str, chemin: str, res, methode: str):
    """Emprise, limites magenta épaisses et noms d'une planche calée (WGS84), et sa ligne de rapport.

    Seuls les textes en capitales sont des noms de secteur dans la carte ; le titre en pied de page (casse
    mixte, hors du cadre) est marqué `titre` pour ne pas être pris pour un nom placé sur le plan.
    """
    alpha, beta, part, med = res
    fiable = part >= 0.75 and med <= 1.5
    page = fitz.open(chemin)[0]
    page.remove_rotation()

    def vers(x, y):
        z = alpha * complex(x, -y) + beta
        return z.real, z.imag

    features = []
    r = page.rect
    coins = [vers(x, y) for x, y in ((r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1))]
    anneau = [list(VERS_WGS84.transform(*c)) for c in coins]
    anneau.append(anneau[0])
    props = {"planche": nom, "methode": methode, "echelle_m_par_pt": round(abs(alpha), 4),
             "rotation_deg": round(math.degrees(math.atan2(alpha.imag, alpha.real)), 2),
             "superposition": round(part, 3), "ecart_median_m": round(med, 2), "fiable": fiable,
             "alpha": [alpha.real, alpha.imag], "beta": [beta.real, beta.imag]}
    features.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [anneau]}, "properties": {**props, "type": "emprise"}})
    for dr in page.get_drawings():
        c = dr.get("color")
        if not c or not (c[0] > 0.6 and c[2] > 0.6 and c[1] < 0.45) or (dr.get("width") or 0) < 1.5:
            continue
        for it in dr["items"]:
            if it[0] == "l":
                c1 = VERS_WGS84.transform(*vers(it[1].x, it[1].y))
                c2 = VERS_WGS84.transform(*vers(it[2].x, it[2].y))
                features.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": [list(c1), list(c2)]},
                                 "properties": {"planche": nom, "type": "limite_magenta", "fiable": fiable}})
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l.get("spans", []):
                t = s["text"].strip()
                if s["size"] >= 14 and t:
                    x0, y0, x1, y1 = s["bbox"]
                    lon, lat = VERS_WGS84.transform(*vers((x0 + x1) / 2, (y0 + y1) / 2))
                    features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
                                     "properties": {"planche": nom, "type": "nom" if t == t.upper() else "titre", "texte": t,
                                                    "taille": round(s["size"]), "fiable": fiable}})
    ligne = (f"| {nom} | {methode} | {props['rotation_deg']}° | {props['echelle_m_par_pt']:.3f} | "
             f"{100 * part:.0f} % | {med:.2f} | {'fiable' if fiable else 'à vérifier'} |")
    return features, ligne


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--extrait", required=True)
    ap.add_argument("--dxf", required=True)
    ap.add_argument("--plans", required=True)
    ap.add_argument("--sortie", required=True)
    ap.add_argument("--processus", type=int, default=6)
    a = ap.parse_args()
    os.makedirs(a.sortie, exist_ok=True)

    index: dict[str, list[complex]] = defaultdict(list)
    for t, x, y in textes_dessin(a.dxf, os.path.join(a.sortie, "textes-dessin.pkl")):
        index[t].append(complex(x, y))

    # Centres des fenêtres : centroïdes des secteurs du SIG.
    with open(a.extrait, "rb") as f:
        d = pickle.load(f)
    textes_sect = [(t.strip().upper(), x, y) for c, t, x, y, h, s in d["textes"] if c == "ELYX_DATA.EP_SECTEUR_HYDRO00" and s == "modele"]
    centres_sig: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for c, h, pts, f_, s in d["lignes"]:
        if c == "ELYX_DATA.EP_SECTEUR_HYDRO" and s == "modele" and len(pts) >= 4:
            pg = Polygon(pts).buffer(0)
            for t, x, y in textes_sect:
                if pg.contains(Point(x, y)):
                    centres_sig[t].append((pg.centroid.x, pg.centroid.y))

    def centre(nom):
        pts = [c for n in CENTRES_SIG.get(nom, []) for c in centres_sig.get(n, [])]
        if not pts:
            return ((X0 + X1) / 2, (Y0 + Y1) / 2)
        return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))

    taches = []
    for chemin in sorted(glob.glob(os.path.join(a.plans, "*.pdf"))):
        nom = os.path.splitext(os.path.basename(chemin))[0]
        page = fitz.open(chemin)[0]
        page.remove_rotation()
        t = calage_textes(page, index)
        taches.append((nom, chemin, centre(nom), t[0] if t else None))

    resultats = {}
    methodes = {}
    with ProcessPoolExecutor(max_workers=a.processus, initializer=initialiser, initargs=(a.extrait,)) as ex:
        for nom, res, methode in ex.map(caler, *zip(*taches)):
            resultats[nom] = res
            methodes[nom] = methode
            print(f"{nom}: {methode} → {('superposition ' + format(100 * res[2], '.0f') + ' %, écart médian ' + format(res[3], '.2f') + ' m') if res else 'échec'}", file=sys.stderr)

    features = []
    rapport = ["# Calage des planches PDF sur le dessin", "",
               "| Planche | Méthode | Rotation | Échelle (m/pt) | Conduites superposées (≤ 2 m) | Écart médian (m) | Calage |",
               "|---|---|---:|---:|---:|---:|---|"]
    for nom, chemin, _, _ in taches:
        res = resultats.get(nom)
        if not res:
            rapport.append(f"| {nom} | {methodes.get(nom)} | — | — | — | — | échec |")
            continue
        feats, ligne = features_planche(nom, chemin, res, methodes[nom])
        features += feats
        rapport.append(ligne)
    with open(os.path.join(a.sortie, "planches.geojson"), "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(a.sortie, "calage-planches.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(rapport) + "\n")
    print("\n".join(rapport))


if __name__ == "__main__":
    main()
