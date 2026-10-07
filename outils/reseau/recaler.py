#!/usr/bin/env python3
"""Recalage fin du réseau sur les rues d'OpenStreetMap (après convertir.py).

Usage : python3 recaler.py [--source data-private/reseau] [--osm data-private/reseau/rues-osm.geojson]
                           [--sortie data-private/reseau/recale] [--maille 500]

La transformation EPSG « Merchich to WGS 84 (1) », la seule disponible, est annoncée à 7 m près : le dessin
converti garde un décalage systématique de cet ordre, visible à fort zoom (conduites à côté des rues).

Méthode (« rubber-sheeting ») :
1. translation globale : celle qui met le plus de conduites SUR les rues OSM (critère 1 - exp(-d² / 2σ²),
   σ = 3 m : une conduite sans rue OSM en face, dans un derb, ne pèse pas ; la distance moyenne, elle,
   préfère dans une rue à deux conduites une position décalée qui rapproche un peu tout le monde) ;
2. corrections locales : même recherche dans des fenêtres de 800 m tous les `--maille` m, autour de la
   translation globale (± 8 m) ; fenêtres pauvres (moins de 3 km de conduites) ou à recherche en butée
   écartées, valeurs aberrantes remplacées par la médiane des voisines ;
3. champ de déplacement continu (noyau gaussien, rappel vers la translation globale là où les données
   manquent) appliqué à chaque sommet : le réseau reste connecté, aucune coupure aux limites de secteur ;
4. validation croisée : champ estimé sur la moitié des tronçons, mesuré sur l'autre moitié ; le champ local
   n'est retenu que s'il fait mieux que la translation globale seule.

Les références des tronçons (milieu en coordonnées Lambert du dessin) ne changent pas : un nouvel import met
à jour la géométrie des tronçons déjà importés, sans doublon. Sorties : troncons.geojson, noeuds.geojson,
secteurs.geojson recalés et recalage.md (avant / après par secteur) dans `--sortie`.
"""
from __future__ import annotations

import argparse
import json
import zlib
import multiprocessing
from pathlib import Path

import numpy as np
from pyproj import Transformer
from scipy.ndimage import distance_transform_edt, map_coordinates
from shapely import STRtree, points
from shapely.geometry import LineString

VERS_M = Transformer.from_crs("EPSG:4326", "EPSG:32630", always_xy=True)   # UTM 30N : mètres à Oujda
VERS_WGS = Transformer.from_crs("EPSG:32630", "EPSG:4326", always_xy=True)
RES = 0.5               # raster des distances aux rues, en mètres
TRONQUE = 12.0          # au-delà, une conduite n'a pas de rue OSM en face (derb, terrain) : poids constant
SIGMA_SCORE = 3.0       # critère « sur la rue » : 1 - exp(-d² / 2σ²), une conduite à 3 m compte, à 10 m plus du tout
DEMI_FENETRE = 400.0
RECHERCHE_LOCALE = 8.0
POINTS_MIN = 1500       # 3 km de conduites (un point tous les 2 m)
SIGMA = 450.0           # portée du lissage du champ
POIDS_PRIOR = 1500.0    # rappel vers la translation globale (en « points » équivalents)

_GRILLE_RUES: dict[tuple[int, int], np.ndarray] = {}


def densifier(c: np.ndarray, pas: float) -> np.ndarray:
    seg = np.diff(c, axis=0)
    n = np.maximum(1, np.ceil(np.hypot(seg[:, 0], seg[:, 1]) / pas).astype(int))
    morceaux = [c[i] + np.linspace(0, 1, k, endpoint=False)[:, None] * seg[i] for i, k in enumerate(n)]
    return np.vstack(morceaux + [c[-1:]])


def en_metres(coords) -> np.ndarray:
    a = np.asarray(coords, dtype=float)
    x, y = VERS_M.transform(a[:, 0], a[:, 1])
    return np.c_[x, y]


def rues_proches(x0: float, y0: float, x1: float, y1: float) -> np.ndarray:
    cles = [(i, j) for i in range(int(x0 // 500), int(x1 // 500) + 1) for j in range(int(y0 // 500), int(y1 // 500) + 1)]
    morceaux = [_GRILLE_RUES[k] for k in cles if k in _GRILLE_RUES]
    return np.vstack(morceaux) if morceaux else np.empty((0, 2))


class Raster:
    """Distances aux rues (tronquées) autour d'un nuage de points, pour noter une translation."""

    def __init__(self, pts: np.ndarray, centre: tuple[float, float], recherche: float):
        marge = recherche + TRONQUE + 5
        self.pts = pts
        self.x0, self.y0 = pts.min(0) + np.array(centre) - marge
        x1, y1 = pts.max(0) + np.array(centre) + marge
        nx, ny = int((x1 - self.x0) / RES) + 1, int((y1 - self.y0) / RES) + 1
        img = np.ones((ny, nx), dtype=bool)
        r = rues_proches(self.x0, self.y0, x1, y1)
        if len(r):
            i = ((r[:, 1] - self.y0) / RES).astype(int)
            j = ((r[:, 0] - self.x0) / RES).astype(int)
            ok = (i >= 0) & (i < ny) & (j >= 0) & (j < nx)
            img[i[ok], j[ok]] = False
        d = np.minimum(distance_transform_edt(img) * RES, TRONQUE)
        # Critère « sur la rue » plutôt que la distance moyenne : celle-ci préfère, dans une rue à deux conduites
        # (une par trottoir), une position décalée qui rapproche un peu tout le monde à celle qui encadre l'axe.
        self.dist = (1.0 - np.exp(-d ** 2 / (2 * SIGMA_SCORE ** 2))).astype(np.float32)

    def score(self, dx: float, dy: float) -> float:
        return float(map_coordinates(self.dist, [(self.pts[:, 1] + dy - self.y0) / RES, (self.pts[:, 0] + dx - self.x0) / RES],
                                     order=1, mode="nearest").mean())


def echantillon(pts: np.ndarray, cle: float, n: int = 8000) -> np.ndarray:
    if len(pts) <= n:
        return pts
    return pts[np.random.default_rng(abs(int(cle)) % 2**32).choice(len(pts), n, replace=False)]


def _grille_globale(args):
    """Passe 1 : scores de la fenêtre pour toutes les translations à ± 25 m (pas de 1 m) autour de zéro."""
    cx, cy, pts = args
    r = Raster(echantillon(pts, cx * 7 + cy), (0.0, 0.0), 25.0)
    g = np.arange(-25.0, 25.0 + 1e-9, 1.0)
    return len(pts), np.array([[r.score(dx, dy) for dx in g] for dy in g])


def _fenetre(args):
    """Passe 2 : translation locale à ± 8 m autour de la globale (pas de 1 m, puis affinage à 0,25 m)."""
    cx, cy, pts, (gx, gy) = args
    r = Raster(echantillon(pts, cx * 7 + cy), (gx, gy), RECHERCHE_LOCALE)
    g = np.arange(-RECHERCHE_LOCALE, RECHERCHE_LOCALE + 1e-9, 1.0)
    scores = np.array([[r.score(gx + dx, gy + dy) for dx in g] for dy in g])
    iy, ix = np.unravel_index(scores.argmin(), scores.shape)
    butee = ix in (0, len(g) - 1) or iy in (0, len(g) - 1)
    meilleur = (scores[iy, ix], gx + g[ix], gy + g[iy])
    for ddy in np.arange(-1.0, 1.0 + 1e-9, 0.25):
        for ddx in np.arange(-1.0, 1.0 + 1e-9, 0.25):
            sc = r.score(meilleur[1] + ddx, meilleur[2] + ddy)
            if sc < meilleur[0]:
                meilleur = (sc, meilleur[1] + ddx, meilleur[2] + ddy)
    return cx, cy, len(pts), meilleur[1], meilleur[2], butee


def fenetres(pts: np.ndarray, maille: float) -> list[tuple[float, float, np.ndarray]]:
    xs = np.arange(pts[:, 0].min() // maille * maille, pts[:, 0].max() + maille, maille)
    ys = np.arange(pts[:, 1].min() // maille * maille, pts[:, 1].max() + maille, maille)
    sortie = []
    for cx in xs:
        colonne = pts[np.abs(pts[:, 0] - cx) <= DEMI_FENETRE]
        for cy in ys:
            sel = colonne[np.abs(colonne[:, 1] - cy) <= DEMI_FENETRE]
            if len(sel) >= POINTS_MIN:
                sortie.append((float(cx), float(cy), sel))
    return sortie


def translation_globale(liste: list[tuple]) -> tuple[float, float]:
    """Somme des grilles de scores des fenêtres (pondérées par leur nombre de points), minimum affiné en parabole."""
    with multiprocessing.get_context("fork").Pool() as pool:
        grilles = pool.map(_grille_globale, liste, chunksize=4)
    total = sum(n * s for n, s in grilles) / sum(n for n, _ in grilles)
    iy, ix = np.unravel_index(total.argmin(), total.shape)

    def parabole(a: float, b: float, c: float) -> float:
        d = a - 2 * b + c
        return 0.0 if d <= 0 else 0.5 * (a - c) / d

    fx = parabole(*total[iy, ix - 1:ix + 2]) if 0 < ix < total.shape[1] - 1 else 0.0
    fy = parabole(*total[iy - 1:iy + 2, ix]) if 0 < iy < total.shape[0] - 1 else 0.0
    return float(ix - 25 + fx), float(iy - 25 + fy)


def corrections_locales(liste: list[tuple], globale: tuple[float, float], maille: float) -> list[tuple]:
    with multiprocessing.get_context("fork").Pool() as pool:
        brutes = pool.map(_fenetre, [(cx, cy, p, globale) for cx, cy, p in liste], chunksize=4)
    noeuds = [b for b in brutes if not b[5]]
    # Valeur aberrante : à plus de 3 m de la médiane de ses voisines, remplacée par cette médiane.
    propres = []
    for cx, cy, n, dx, dy, _ in noeuds:
        vois = [(v[3], v[4]) for v in noeuds if 0 < np.hypot(v[0] - cx, v[1] - cy) <= 1.5 * maille]
        if len(vois) >= 3:
            mx, my = np.median([v[0] for v in vois]), np.median([v[1] for v in vois])
            if np.hypot(dx - mx, dy - my) > 3.0:
                dx, dy = mx, my
        propres.append((cx, cy, n, dx, dy))
    return propres


class Champ:
    """Déplacement continu : translation globale + écarts locaux lissés (noyau gaussien, rappel au global)."""

    def __init__(self, globale: tuple[float, float], noeuds: list[tuple] | None):
        self.g = np.array(globale)
        self.n = np.array([(c[0], c[1]) for c in noeuds]) if noeuds else np.empty((0, 2))
        self.w = np.array([c[2] for c in noeuds], dtype=float) if noeuds else np.empty(0)
        self.v = np.array([(c[3], c[4]) for c in noeuds]) - self.g if noeuds else np.empty((0, 2))

    def __call__(self, xy: np.ndarray) -> np.ndarray:
        if not len(self.n):
            return np.broadcast_to(self.g, xy.shape).copy()
        sortie = np.empty_like(xy)
        for a in range(0, len(xy), 20000):
            p = xy[a:a + 20000]
            d2 = ((p[:, None, :] - self.n[None, :, :]) ** 2).sum(-1)
            k = self.w[None, :] * np.exp(-d2 / (2 * SIGMA ** 2))
            sortie[a:a + 20000] = self.g + (k @ self.v) / (k.sum(1) + POIDS_PRIOR)[:, None]
        return sortie


def mesures(pts: np.ndarray, arbre: STRtree) -> dict[str, float]:
    _, d = arbre.query_nearest(points(pts), return_distance=True, all_matches=False)
    return {"mediane": float(np.median(d)), "p2": float((d <= 2).mean() * 100), "p3": float((d <= 3).mean() * 100),
            "p5": float((d <= 5).mean() * 100), "critere": float((1 - np.exp(-d ** 2 / (2 * SIGMA_SCORE ** 2))).mean())}


def charger(chemin: Path) -> dict:
    with chemin.open(encoding="utf-8") as f:
        return json.load(f)


def transformer_geometrie(g: dict, champ: Champ) -> dict:
    def anneau(coords):
        m = en_metres(coords)
        m = m + champ(m)
        lon, lat = VERS_WGS.transform(m[:, 0], m[:, 1])
        return [[round(float(a), 6), round(float(b), 6)] for a, b in zip(lon, lat)]
    t = g["type"]
    if t == "Point":
        return {"type": t, "coordinates": anneau([g["coordinates"]])[0]}
    if t == "LineString":
        return {"type": t, "coordinates": anneau(g["coordinates"])}
    if t == "Polygon":
        return {"type": t, "coordinates": [anneau(r) for r in g["coordinates"]]}
    if t == "MultiPolygon":
        return {"type": t, "coordinates": [[anneau(r) for r in p] for p in g["coordinates"]]}
    raise ValueError(f"géométrie {t} non gérée")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="data-private/reseau")
    ap.add_argument("--osm", default=None, help="rues OSM (controler_calage.py les télécharge) ; défaut : <source>/rues-osm.geojson")
    ap.add_argument("--sortie", default="data-private/reseau/recale")
    ap.add_argument("--maille", type=float, default=500.0)
    a = ap.parse_args()
    source, sortie = Path(a.source), Path(a.sortie)
    sortie.mkdir(parents=True, exist_ok=True)

    troncons = charger(source / "troncons.geojson")
    rues_m = [en_metres(f["geometry"]["coordinates"]) for f in charger(Path(a.osm or source / "rues-osm.geojson"))["features"]]
    rues_pts = np.vstack([densifier(r, 0.25) for r in rues_m])
    cles = np.floor(rues_pts / 500).astype(int)
    ordre = np.lexsort((cles[:, 1], cles[:, 0]))
    cles, rues_tries = cles[ordre], rues_pts[ordre]
    coupures = np.flatnonzero(np.any(np.diff(cles, axis=0) != 0, axis=1)) + 1
    for bloc_cles, bloc in zip(np.split(cles, coupures), np.split(rues_tries, coupures)):
        _GRILLE_RUES[(int(bloc_cles[0, 0]), int(bloc_cles[0, 1]))] = bloc
    arbre = STRtree([LineString(r) for r in rues_m])

    lignes = [en_metres(f["geometry"]["coordinates"]) for f in troncons["features"]]
    codes = [f["properties"].get("secteur_code") or "(non zoné)" for f in troncons["features"]]
    moitie = np.array([zlib.crc32(f["properties"]["reference"].encode()) % 2 for f in troncons["features"]])
    pts_par = [densifier(l, 2.0) for l in lignes]
    tous = np.vstack(pts_par)
    origine = np.concatenate([np.full(len(p), i) for i, p in enumerate(pts_par)])
    rng = np.random.default_rng(7)

    # Validation croisée : translation et champ estimés sur la moitié A des tronçons, mesurés sur la moitié B.
    a_pts = moitie[origine] == 0
    fen_a = fenetres(tous[a_pts], a.maille)
    g_a = translation_globale(fen_a)
    champ_a = Champ(g_a, corrections_locales(fen_a, g_a, a.maille))
    b = tous[~a_pts]
    eval_b = b[rng.choice(len(b), min(60000, len(b)), replace=False)]
    cv = {"aucun": mesures(eval_b, arbre), "globale": mesures(eval_b + np.array(g_a), arbre),
          "champ": mesures(eval_b + champ_a(eval_b), arbre)}
    local_retenu = cv["champ"]["critere"] < cv["globale"]["critere"] - 0.005
    print(f"Validation croisée : globale A {g_a[0]:+.2f} / {g_a[1]:+.2f} m ; " +
          " ; ".join(f"{k} {v['critere']:.3f} (≤ 3 m : {v['p3']:.0f} %)" for k, v in cv.items()), flush=True)

    fen = fenetres(tous, a.maille)
    g = translation_globale(fen)
    noeuds = corrections_locales(fen, g, a.maille) if local_retenu else None
    champ = Champ(g, noeuds)
    print(f"Translation globale {g[0]:+.2f} / {g[1]:+.2f} m ; corrections locales : {len(noeuds or [])} fenêtres", flush=True)

    # Avant / après par secteur.
    lignes_rapport = []
    for code in sorted(set(codes)):
        idx = [i for i, c in enumerate(codes) if c == code]
        p = np.vstack([pts_par[i] for i in idx])
        if len(p) > 20000:
            p = p[rng.choice(len(p), 20000, replace=False)]
        av, ap_ = mesures(p, arbre), mesures(p + champ(p), arbre)
        dep = champ(p).mean(0)
        lignes_rapport.append(f"| {code} | {len(idx)} | {av['mediane']:.1f} → **{ap_['mediane']:.1f}** | {av['p3']:.0f} → **{ap_['p3']:.0f}** | "
                              f"{av['p5']:.0f} → **{ap_['p5']:.0f}** | {dep[0]:+.1f} / {dep[1]:+.1f} |")
    echant = tous[rng.choice(len(tous), 80000, replace=False)]
    av_t, ap_t = mesures(echant, arbre), mesures(echant + champ(echant), arbre)
    deps = champ(echant)
    ecart_local = np.hypot(*(deps - np.array(g)).T)

    for nom in ("troncons.geojson", "noeuds.geojson", "secteurs.geojson"):
        fc = troncons if nom == "troncons.geojson" else charger(source / nom)
        for f in fc["features"]:
            f["geometry"] = transformer_geometrie(f["geometry"], champ)
        with (sortie / nom).open("w", encoding="utf-8") as fh:
            json.dump(fc, fh, ensure_ascii=False, separators=(",", ":"))

    def ligne_cv(nom: str, m: dict) -> str:
        return f"| {nom} | {m['mediane']:.1f} | {m['p2']:.0f} | {m['p3']:.0f} | {m['p5']:.0f} | {m['critere']:.3f} |"

    rapport = f"""# Recalage du réseau sur les rues OSM

- Translation globale : **{g[0]:+.2f} m vers l'est, {g[1]:+.2f} m vers le nord** (|d| = {np.hypot(*g):.1f} m), cohérente avec la
  précision annoncée de la transformation Merchich → WGS 84 (7 m).
- Corrections locales : {'**retenues**' if local_retenu else '**non retenues** (pas de gain en validation croisée)'} ; maille {a.maille:.0f} m,
  {len(noeuds or [])} fenêtres ; écart au global : médiane {np.median(ecart_local):.1f} m, 95 % sous {np.percentile(ecart_local, 95):.1f} m,
  maximum {ecart_local.max():.1f} m. Champ continu : aucune coupure du réseau.
- Ensemble du réseau (distance d'un point de conduite à la rue OSM la plus proche) : médiane {av_t['mediane']:.1f} → **{ap_t['mediane']:.1f} m** ;
  à moins de 3 m : {av_t['p3']:.0f} → **{ap_t['p3']:.0f} %** ; à moins de 5 m : {av_t['p5']:.0f} → **{ap_t['p5']:.0f} %**.
  Une conduite sous trottoir reste à 4-8 m de l'axe d'une grande rue : 100 % n'est ni possible ni souhaitable.

## Validation croisée (estimé sur la moitié des tronçons, mesuré sur l'autre)

| Méthode | Médiane (m) | ≤ 2 m (%) | ≤ 3 m (%) | ≤ 5 m (%) | Critère (0 = tout sur la rue) |
|---|---:|---:|---:|---:|---:|
{ligne_cv('Sans recalage', cv['aucun'])}
{ligne_cv('Translation globale', cv['globale'])}
{ligne_cv('Globale + corrections locales', cv['champ'])}

## Par secteur (avant → après)

| Secteur | Tronçons | Médiane (m) | ≤ 3 m (%) | ≤ 5 m (%) | Déplacement moyen est / nord (m) |
|---|---:|---:|---:|---:|---:|
""" + "\n".join(lignes_rapport) + "\n"
    (sortie / "recalage.md").write_text(rapport, encoding="utf-8")
    print(rapport)


if __name__ == "__main__":
    main()
