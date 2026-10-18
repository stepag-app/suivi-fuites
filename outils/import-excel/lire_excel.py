"""Lecture de l'attachement Excel (feuille « Fiche de réparation par num ») et des rapports journaliers."""
import datetime as dt
import re
from pathlib import Path

from openpyxl import load_workbook

FEUILLE_FICHES = 'Fiche de réparation par num'
MOTIFS = {'assainissement': 'assainissement', 'ras': 'ras', 'sondage negatif': 'sondage_negatif',
          "refusé par l'abonné": 'refus_abonne', 'a detecter': 'a_detecter'}


def _valeurs_fusionnees(ws):
    fus = {}
    for plage in ws.merged_cells.ranges:
        v = ws.cell(plage.min_row, plage.min_col).value
        for r in range(plage.min_row, plage.max_row + 1):
            for c in range(plage.min_col, plage.max_col + 1):
                fus[(r, c)] = v
    return lambda r, c: fus.get((r, c), ws.cell(r, c).value)


def _nombre(v):
    if v in (None, '', '-'):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    return float(str(v).replace(',', '.'))


def lire_fiches(chemin):
    """Une entrée par fuite : numéro, date, tournée, fouille, nature, pièces [(libellé, quantité)], motif."""
    ws = load_workbook(chemin, data_only=True)[FEUILLE_FICHES]
    val = _valeurs_fusionnees(ws)
    entete = next(r for r in range(1, 60) if val(r, 1) == 'N° de fuite')
    fuites, cour = [], None
    for r in range(entete + 2, ws.max_row + 1):
        if ws.cell(r, 1).value is not None:
            date = val(r, 2)
            cour = {
                'numero': int(ws.cell(r, 1).value),
                'date': date.date() if isinstance(date, dt.datetime) else None,
                'tournee': str(val(r, 3) or '').strip(),
                'longueur': _nombre(val(r, 4)), 'largeur': _nombre(val(r, 5)), 'profondeur': _nombre(val(r, 6)),
                'nature': (str(val(r, 7)).strip().lower() if val(r, 7) else None),
                'pieces': [], 'motif': None, 'ligne_excel': r,
            }
            fuites.append(cour)
        piece = ws.cell(r, 8).value
        if cour is None or not piece:
            continue
        libelle = str(piece).strip()
        if libelle.lower() in MOTIFS:
            cour['motif'] = MOTIFS[libelle.lower()]
            continue
        cour['pieces'].append((libelle, _nombre(ws.cell(r, 9).value) or 0.0))
    numeros = [f['numero'] for f in fuites]
    if numeros != list(range(1, len(numeros) + 1)):
        raise SystemExit(f'Numérotation non continue dans « {FEUILLE_FICHES} » : {numeros[:20]}…')
    return fuites


def lire_rapports(dossier):
    """Tournée -> (date de détection, secteur cité) d'après les rapports journaliers « Rapports journaliers *.xlsx »."""
    res = {}
    for fichier in sorted(Path(dossier).glob('Rapports journaliers *.xlsx')):
        wb = load_workbook(fichier, data_only=True)
        for nom in wb.sheetnames:
            m = re.fullmatch(r'(\d{2})-(\d{2})-(\d{4})', nom.strip())
            if not m:
                continue
            jour = dt.date(int(m[3]), int(m[2]), int(m[1]))
            for ligne in wb[nom].iter_rows(values_only=True):
                if not ligne or not isinstance(ligne[0], (int, float)):
                    continue
                tournee = next((c for c in ligne[1:3] if isinstance(c, str) and re.fullmatch(r'\s*\d{3}-\d{3}-\d{3}\s*', c)), None)
                if tournee:
                    res.setdefault(tournee.strip(), jour)
    return res
