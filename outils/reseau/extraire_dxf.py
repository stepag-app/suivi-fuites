#!/usr/bin/env python3
"""Extraction en flux des entités utiles d'un DXF énorme, blocs compris, vers un fichier compact (pickle).

Usage : python3 extraire_dxf.py reseau.dxf extrait.pkl

Pourquoi un lecteur maison : le DXF d'Oujda pèse 1,2 Go (1,9 million d'entités) et ne tient pas en mémoire
avec ezdxf ; surtout, l'export du SIG (Elyx) a rangé la plus grande partie des conduites **dans des définitions
de blocs** insérées dans l'espace objet (souvent sur le calque « TITRE » ou « 0 »), que `iterdxf` ignore.
On lit donc les paires (code, valeur) une à une : la section BLOCKS d'abord (contenu de chaque bloc), puis
ENTITIES (espace objet) ; chaque insertion de bloc est ensuite dépliée (translation, échelle, rotation,
imbrication) pour obtenir des coordonnées « monde », dans le système du dessin (Lambert Nord Maroc).

Ne sont gardés que : les lignes des calques du réseau (conduites par diamètre, limites de secteurs et de zones,
tournées), les textes de ces calques, les insertions des blocs d'équipements (nœuds, vannes, hydrants…) et
les points. Le résultat alimente convertir.py.
"""
from __future__ import annotations

import argparse
import math
import pickle
import re
import sys
from collections import Counter

MOTIFS = [
    r"^(EP-|12EP-)?\d{2,4}$",
    r"^(EP-|12EP-)?\d{2,4} ?(PVC|BA|BAP|PEHD|PE|AC|F|FD|FONTE)$",
    r"^(EP-|12EP-)?\d{2}[xX]\d{2,3}$",
    r"^EP-L-PE-F$",
    r"^(EP|AEP) (A REHABILITER|A DEPLACER|A RESILIER|ENCOURS|PROJETE|A POSER)$",
    r"^DN500 REHA$", r"^RESEAU A POSER$", r"^r.seau pos.$", r"^RESEAU NV$",
    r"^ELYX_DATA\.EP_", r"^EP_",
    r"^EP-(VANE|BOUCHE INCENDIE|VENTOUSE|COMPTEUR|RESERVOIR|CONE DE REDUCTION|OBTURATEUR|TEXTE ?\d?|COO- TEXT|DETAILLE)$",
    r"^(12EP-|01-)?VAN(N)?E$",
]
REGLES = [re.compile(m, re.I) for m in MOTIFS]
# Blocs « symboles » (équipements) : une insertion = un point, on ne les déplie pas.
BLOCS_EQUIPEMENT = re.compile(
    r"^(EP_(NOEUD|VANNE|OBTURATEUR|HYDRANT|VENTOUSE|VIDANGE|COMPTEUR_[AI]|CONE_REDUC|REDUC_PRES|RESERVOIR|REGARD|POMPE|FORAGE|BACHE)"
    r"|VANNE|VANNES|COMPTEUR|bouche d'incendie|vz|v6)$", re.I)
PROFONDEUR_MAX = 6

LIGNES = ("LINE", "LWPOLYLINE", "POLYLINE")


def garder_calque(c: str, cache: dict[str, bool]) -> bool:
    r = cache.get(c)
    if r is None:
        r = any(x.search(c) for x in REGLES)
        cache[c] = r
    return r


def lire_paires(chemin: str):
    """Paires (code, valeur) du DXF ASCII, sans conversion coûteuse."""
    with open(chemin, "r", encoding="cp1252", errors="replace", newline="") as f:
        while True:
            code = f.readline()
            if not code:
                return
            valeur = f.readline()
            if not valeur:
                return
            yield int(code), valeur.rstrip("\r\n")


class Entite:
    __slots__ = ("type", "calque", "handle", "espace_papier", "pts", "ferme", "texte", "hauteur", "nom",
                 "insert", "echelle", "rotation", "lignes_mtext")

    def __init__(self, type_: str) -> None:
        self.type = type_
        self.calque = "0"
        self.handle = ""
        self.espace_papier = False
        self.pts: list[tuple[float, float]] = []
        self.ferme = False
        self.texte = ""
        self.hauteur = 0.0
        self.nom = ""
        self.insert = (0.0, 0.0)
        self.echelle = (1.0, 1.0)
        self.rotation = 0.0
        self.lignes_mtext: list[str] = []


def extraire(chemin: str):
    cache: dict[str, bool] = {}
    blocs: dict[str, dict] = {}        # nom → {"base": (x, y), "entites": [Entite]}
    modele: list[Entite] = []
    section = None
    bloc_courant: dict | None = None
    e: Entite | None = None
    x_attente: float | None = None
    x11: float | None = None
    polyligne: Entite | None = None    # POLYLINE en cours (ses VERTEX suivent)
    comptes: Counter = Counter()
    n = 0

    def terminer(ent: Entite | None) -> None:
        if ent is None:
            return
        if ent.type == "MTEXT":
            ent.texte = "".join(ent.lignes_mtext)
        if ent.type == "INSERT":
            cible = blocs if section == "BLOCKS" else None
            (bloc_courant["entites"] if bloc_courant is not None else modele).append(ent)
            return
        if ent.type in ("TEXT", "MTEXT", "POINT") or ent.type in LIGNES:
            if ent.espace_papier and bloc_courant is None:
                return
            if garder_calque(ent.calque, cache):
                (bloc_courant["entites"] if bloc_courant is not None else modele).append(ent)

    for code, valeur in lire_paires(chemin):
        n += 1
        if n % 20_000_000 == 0:
            print(f"  {n // 1_000_000} M paires lues…", file=sys.stderr)
        if code == 0:
            # Fin de l'entité précédente
            if polyligne is not None and valeur not in ("VERTEX", "SEQEND"):
                terminer(polyligne)
                polyligne = None
            if e is not None and e is not polyligne:
                if e.type == "VERTEX" and polyligne is not None:
                    pass  # déjà ajouté à la polyligne
                else:
                    terminer(e)
            e = None
            x_attente = None
            x11 = None
            if valeur == "SECTION":
                section = "?"
            elif valeur == "ENDSEC":
                section = None
            elif valeur == "BLOCK" and section == "BLOCKS":
                bloc_courant = {"base": (0.0, 0.0), "entites": [], "nom": ""}
                e = Entite("BLOCK")
            elif valeur == "ENDBLK":
                if bloc_courant is not None and bloc_courant["nom"]:
                    blocs[bloc_courant["nom"]] = bloc_courant
                bloc_courant = None
            elif valeur == "SEQEND":
                if polyligne is not None:
                    terminer(polyligne)
                    polyligne = None
            elif valeur == "VERTEX" and polyligne is not None:
                e = Entite("VERTEX")
            elif section in ("BLOCKS", "ENTITIES") and (bloc_courant is not None or section == "ENTITIES"):
                if valeur in ("LINE", "LWPOLYLINE", "POLYLINE", "TEXT", "MTEXT", "INSERT", "POINT", "ATTRIB", "ATTDEF"):
                    e = Entite(valeur)
                    if valeur == "POLYLINE":
                        polyligne = e
                    comptes[valeur] += 1
                else:
                    comptes["autres"] += 1
            continue
        if code == 2 and section == "?":
            section = valeur
            continue
        if e is None:
            continue
        t = e.type
        if t == "BLOCK":
            if code == 2:
                bloc_courant["nom"] = valeur
            elif code == 10:
                x_attente = float(valeur)
            elif code == 20 and x_attente is not None:
                bloc_courant["base"] = (x_attente, float(valeur))
                x_attente = None
            continue
        if code == 8:
            e.calque = valeur
        elif code == 5:
            e.handle = valeur
        elif code == 67:
            e.espace_papier = valeur.strip() == "1"
        elif code == 10:
            x_attente = float(valeur)
        elif code == 20 and x_attente is not None:
            p = (x_attente, float(valeur))
            x_attente = None
            if t in ("LWPOLYLINE",):
                e.pts.append(p)
            elif t == "LINE":
                e.pts.insert(0, p) if not e.pts or len(e.pts) == 2 else e.pts.insert(0, p)
            elif t == "VERTEX":
                if polyligne is not None:
                    polyligne.pts.append(p)
            elif t in ("TEXT", "MTEXT", "POINT", "ATTRIB", "ATTDEF"):
                e.pts = [p]
            elif t == "INSERT":
                e.insert = p
        elif code == 11:
            x11 = float(valeur)
        elif code == 21 and x11 is not None and t == "LINE":
            e.pts.append((x11, float(valeur)))
            x11 = None
        elif code == 70 and t in ("LWPOLYLINE", "POLYLINE"):
            e.ferme = bool(int(valeur) & 1)
        elif code == 1:
            if t == "MTEXT":
                e.lignes_mtext.append(valeur)
            else:
                e.texte = valeur
        elif code == 3 and t == "MTEXT":
            e.lignes_mtext.insert(0, valeur) if False else e.lignes_mtext.append(valeur)
        elif code == 40 and t in ("TEXT", "MTEXT", "ATTRIB", "ATTDEF"):
            e.hauteur = float(valeur)
        elif code == 2 and t == "INSERT":
            e.nom = valeur
        elif code == 41 and t == "INSERT":
            e.echelle = (float(valeur), e.echelle[1])
        elif code == 42 and t == "INSERT":
            e.echelle = (e.echelle[0], float(valeur))
        elif code == 50 and t == "INSERT":
            e.rotation = float(valeur)
    terminer(e)
    print(f"{n} paires lues ; entités rencontrées : {dict(comptes)} ; blocs définis : {len(blocs)} ; "
          f"entités gardées dans l'espace objet : {len(modele)}", file=sys.stderr)
    return blocs, modele


def deplier(blocs: dict[str, dict], modele: list[Entite]):
    """Déplie les insertions : renvoie des listes plates en coordonnées monde."""
    lignes: list[tuple[str, str, list[tuple[float, float]], bool, str]] = []
    textes: list[tuple[str, str, float, float, float, str]] = []
    inserts: list[tuple[str, str, float, float, str]] = []
    points: list[tuple[str, float, float, str]] = []
    stats: Counter = Counter()
    source = "modele"

    def transformer(p, base, ins, ech, rot_cos, rot_sin):
        x = (p[0] - base[0]) * ech[0]
        y = (p[1] - base[1]) * ech[1]
        return (ins[0] + x * rot_cos - y * rot_sin, ins[1] + x * rot_sin + y * rot_cos)

    def emettre(ents: list[Entite], chaine: list, profondeur: int, prefixe: str) -> None:
        for e in ents:
            if e.type == "INSERT":
                if BLOCS_EQUIPEMENT.match(e.nom) or e.nom not in blocs:
                    p = e.insert
                    for (base, ins, ech, c, s) in reversed(chaine):
                        p = transformer(p, base, ins, ech, c, s)
                    if BLOCS_EQUIPEMENT.match(e.nom):
                        inserts.append((e.calque, e.nom, p[0], p[1], source))
                        stats["équipements"] += 1
                    else:
                        stats["blocs inconnus"] += 1
                    continue
                if profondeur >= PROFONDEUR_MAX:
                    stats["profondeur dépassée"] += 1
                    continue
                b = blocs[e.nom]
                rad = math.radians(e.rotation)
                emettre(b["entites"], chaine + [(b["base"], e.insert, e.echelle, math.cos(rad), math.sin(rad))],
                        profondeur + 1, f"{prefixe}{e.handle}/")
                stats[f"insertion dépliée (niveau {profondeur + 1})"] += 1
                continue

            def monde(p):
                for (base, ins, ech, c, s) in reversed(chaine):
                    p = transformer(p, base, ins, ech, c, s)
                return p

            if e.type in LIGNES:
                if len(e.pts) >= 2:
                    lignes.append((e.calque, prefixe + e.handle, [monde(p) for p in e.pts], e.ferme, source))
            elif e.type in ("TEXT", "MTEXT", "ATTRIB"):
                if e.pts and e.texte.strip():
                    x, y = monde(e.pts[0])
                    textes.append((e.calque, e.texte, x, y, e.hauteur, source))
            elif e.type == "POINT" and e.pts:
                x, y = monde(e.pts[0])
                points.append((e.calque, x, y, source))

    emettre(modele, [], 0, "")
    # Blocs orphelins : définis mais jamais insérés (restes de copier-coller / WBLOCK du SIG). Invisibles dans
    # AutoCAD, ils contiennent pourtant des exports complets du réseau, en coordonnées monde (base 0,0).
    # On les émet à part, avec leur nom pour source, pour laisser convertir.py choisir.
    references = Counter(e.nom for e in modele if e.type == "INSERT")
    for b in blocs.values():
        for e in b["entites"]:
            if e.type == "INSERT":
                references[e.nom] += 1
    for nom, b in blocs.items():
        if references[nom] or nom.startswith("*"):
            continue
        nb_lignes = sum(1 for e in b["entites"] if e.type in LIGNES)
        if nb_lignes < 100 or b["base"] != (0.0, 0.0):
            continue
        source = f"bloc:{nom}"
        avant = len(lignes)
        emettre(b["entites"], [], 0, f"{nom}/")
        stats[f"bloc orphelin {nom} : {len(lignes) - avant} lignes"] += 1
    print(f"dépliage : {dict(stats)}", file=sys.stderr)
    return lignes, textes, inserts, points


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dxf")
    ap.add_argument("sortie")
    a = ap.parse_args()
    blocs, modele = extraire(a.dxf)
    lignes, textes, inserts, points = deplier(blocs, modele)
    with open(a.sortie, "wb") as f:
        pickle.dump({"lignes": lignes, "textes": textes, "inserts": inserts, "points": points}, f, protocol=5)
    print(f"lignes {len(lignes)} ; textes {len(textes)} ; inserts {len(inserts)} ; points {len(points)} → {a.sortie}")


if __name__ == "__main__":
    main()
