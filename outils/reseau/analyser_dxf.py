#!/usr/bin/env python3
"""Inventaire d'un DXF du réseau : calques, types d'entités, étendue, textes.

Usage : python3 analyser_dxf.py chemin/vers/reseau.dxf [--textes 40] [--sortie rapport.md]

Sert à décider quels calques portent les conduites, les branchements, les limites de secteurs
et les noms, avant la conversion (convertir.py). Ne modifie rien.
"""
from __future__ import annotations

import argparse
import math
import sys
from collections import Counter, defaultdict

import ezdxf
from ezdxf import recover


def charger(chemin: str):
    try:
        doc, auditor = recover.readfile(chemin)
    except OSError as e:
        sys.exit(f"Lecture impossible : {e}")
    if auditor.has_errors:
        print(f"[avertissement] {len(auditor.errors)} erreurs réparées à la lecture", file=sys.stderr)
    return doc


def longueur_entite(e) -> float:
    t = e.dxftype()
    try:
        if t == "LINE":
            return math.dist(e.dxf.start, e.dxf.end)
        if t == "LWPOLYLINE":
            pts = list(e.get_points("xy"))
            return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
        if t == "POLYLINE":
            pts = [tuple(v.dxf.location)[:2] for v in e.vertices]
            return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
    except Exception:
        return 0.0
    return 0.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dxf")
    ap.add_argument("--textes", type=int, default=40, help="nombre de textes à montrer par calque")
    ap.add_argument("--sortie", help="fichier Markdown de sortie (sinon écran)")
    a = ap.parse_args()

    doc = charger(a.dxf)
    msp = doc.modelspace()
    lignes: list[str] = []
    out = lignes.append

    out(f"# Inventaire DXF : {a.dxf}")
    out("")
    out(f"- Version DXF : {doc.dxfversion} ; unités ($INSUNITS) : {doc.header.get('$INSUNITS', '?')}")
    ext_min = doc.header.get("$EXTMIN")
    ext_max = doc.header.get("$EXTMAX")
    out(f"- Étendue déclarée : {ext_min} → {ext_max}")
    out(f"- Calques définis : {len(doc.layers)} ; blocs : {len(doc.blocks)}")
    out("")

    par_calque: dict[str, Counter] = defaultdict(Counter)
    longueur: Counter = Counter()
    textes: dict[str, Counter] = defaultdict(Counter)
    blocs: dict[str, Counter] = defaultdict(Counter)
    xmin = ymin = math.inf
    xmax = ymax = -math.inf
    n = 0
    for e in msp:
        n += 1
        c = e.dxf.layer
        t = e.dxftype()
        par_calque[c][t] += 1
        longueur[c] += longueur_entite(e)
        if t in ("TEXT", "MTEXT"):
            txt = (e.text if t == "MTEXT" else e.dxf.text) or ""
            txt = " ".join(txt.replace("\\P", " ").split())
            if txt:
                textes[c][txt[:60]] += 1
        if t == "INSERT":
            blocs[c][e.dxf.name] += 1
        try:
            if t == "LINE":
                for p in (e.dxf.start, e.dxf.end):
                    xmin, ymin, xmax, ymax = min(xmin, p[0]), min(ymin, p[1]), max(xmax, p[0]), max(ymax, p[1])
            elif t == "LWPOLYLINE":
                for p in e.get_points("xy"):
                    xmin, ymin, xmax, ymax = min(xmin, p[0]), min(ymin, p[1]), max(xmax, p[0]), max(ymax, p[1])
            elif t in ("TEXT", "INSERT"):
                p = e.dxf.insert
                xmin, ymin, xmax, ymax = min(xmin, p[0]), min(ymin, p[1]), max(xmax, p[0]), max(ymax, p[1])
        except Exception:
            pass

    out(f"## Entités de l'espace objet : {n}")
    out("")
    out(f"Étendue mesurée (LINE, LWPOLYLINE, TEXT, INSERT) : X {xmin:.1f} → {xmax:.1f} ; Y {ymin:.1f} → {ymax:.1f}")
    out("")
    out("| Calque | Entités | Détail | Longueur (unités) | Couleur | Gelé/Off |")
    out("|---|---:|---|---:|---|---|")
    for c, cnt in sorted(par_calque.items(), key=lambda kv: -sum(kv[1].values())):
        detail = ", ".join(f"{t} {k}" for t, k in cnt.most_common(6))
        try:
            layer = doc.layers.get(c)
            couleur = layer.color
            etat = ("gelé " if layer.is_frozen() else "") + ("off" if layer.is_off() else "")
        except Exception:
            couleur, etat = "?", ""
        out(f"| {c} | {sum(cnt.values())} | {detail} | {longueur[c]:.0f} | {couleur} | {etat} |")
    out("")

    out("## Blocs insérés par calque")
    out("")
    for c, cnt in blocs.items():
        out(f"- **{c}** : " + ", ".join(f"{b} ×{k}" for b, k in cnt.most_common(12)))
    out("")

    out("## Textes par calque (les plus fréquents)")
    out("")
    for c, cnt in textes.items():
        out(f"### {c} ({sum(cnt.values())} textes, {len(cnt)} distincts)")
        for txt, k in cnt.most_common(a.textes):
            out(f"- `{txt}` ×{k}")
        out("")

    texte = "\n".join(lignes)
    if a.sortie:
        with open(a.sortie, "w", encoding="utf-8") as f:
            f.write(texte)
        print(f"Rapport écrit : {a.sortie}")
    else:
        print(texte)


if __name__ == "__main__":
    main()
