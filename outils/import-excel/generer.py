"""Génère injecter.sql et controle-import.xlsx à partir de l'attachement Excel.

Usage (depuis la racine du dépôt) :
  python3 outils/import-excel/generer.py --config data-private/import-excel/config.json
"""
import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lire_excel import lire_fiches, lire_rapports  # noqa: E402

NATURES = {'carrelage': 'carrelage', 'mosaique': 'mosaique', 'mosaïque': 'mosaique', 'beton': 'beton',
           'béton': 'beton', 'asphaltage': 'enrobe_a_chaud', 'lave': 'granito_lave', 'lavé': 'granito_lave',
           'pave': 'pave_ciment', 'pavé': 'pave_ciment'}
CHAUSSEE = {'enrobe_a_chaud', 'enrobe_resine_a_froid'}


def q(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(round(v, 4)) if isinstance(v, float) else str(v)
    return "'" + str(v).replace("'", "''") + "'"


def diametre_exterieur(libelle):
    """DE du polyéthylène lu dans le libellé de l'Excel (PEHD 26/32 -> 32, Manchon droit 25/25 -> 25)."""
    m = re.search(r'(\d+)\s*/\s*(\d+)', libelle)
    if m and re.match(r'(pehd|manchon)', libelle, re.I):
        return int(m[1]) if libelle.lower().startswith('manchon réduit') else int(m[2])
    m = re.search(r'\bdn\s*(\d+)', libelle, re.I)
    if m:
        return int(m[1])
    return None


def deduire_reparation(f, corresp):
    pieces = [(lib, qte) for lib, qte in f['pieces'] if not corresp[lib].get('aucun')]
    libs = [lib.lower() for lib, _ in pieces]
    articles = [corresp[lib].get('libelle', '').upper() for lib, _ in pieces]
    pvc = any(x.startswith(('joint gibault', 'tuyau pvc')) for x in libs)
    pe = [d for d in (diametre_exterieur(lib) for lib, _ in pieces
                      if re.match(r'(pehd|manchon|bouchon)', lib, re.I)) if d]
    robinet = any(x.startswith('robinet pec') for x in libs)
    collier = any(a.startswith('COLLIER PEC') for a in articles)
    if pvc:
        materiau, diam = 'pvc', max([int(n) for lib in libs if lib.startswith(('joint gibault', 'tuyau pvc'))
                                     for n in re.findall(r'\d+', lib)] or [None])
    elif pe:
        materiau, diam = 'polyethylene', max(pe)
    elif robinet:
        materiau, diam = 'polyethylene', max(int(n) for lib in libs if lib.startswith('robinet pec')
                                             for n in re.findall(r'/(\d+)', lib))
    elif any(x.startswith(('collier', 'raccord')) for x in libs):
        materiau = 'polyethylene'
        diam = max(int(re.search(r'(\d+)', lib)[1]) for lib in libs if lib.startswith(('collier', 'raccord')))
    else:
        materiau, diam = None, None
    raccord_seul = any(x.startswith('raccord') for x in libs) and not pe and not pvc
    branchement = robinet or collier or raccord_seul or (materiau == 'polyethylene' and diam is not None and diam < 40)
    return {
        'materiau': materiau, 'diametre_mm': diam,
        'ouvrage': ('branchement' if branchement else 'conduite') if pieces else None,
        'tuyau_repare': pvc or bool(pe),
        'robinet_pec_change': robinet, 'collier_pec_change': collier,
        'bouche_a_cle_mise_a_niveau': any(x.startswith('bouche à clé') for x in libs),
        'longueur_pe_m': round(sum(qte for lib, qte in pieces if lib.lower().startswith('pehd')), 2) or None,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', required=True)
    cfg = json.loads(Path(ap.parse_args().config).read_text())
    base = Path(cfg['dossier'])
    fuites = lire_fiches(base / cfg['excel'])
    rapports = lire_rapports(cfg['rapports']) if cfg.get('rapports') else {}
    corresp = json.loads((base / cfg['correspondance']).read_text())

    manquantes = sorted({lib for f in fuites for lib, _ in f['pieces'] if lib not in corresp})
    if manquantes:
        sys.exit('Pièces sans article choisi (à valider dans l\'artefact) : ' + ', '.join(manquantes))
    natures_inconnues = sorted({f['nature'] for f in fuites if f['nature'] and f['nature'] not in NATURES})
    if natures_inconnues:
        sys.exit('Natures de dégradation non reconnues : ' + ', '.join(natures_inconnues))

    heure_det, heure_rep = cfg.get('heure_detection', '09:00'), cfg.get('heure_reparation', '12:00')
    lf, lr, lp, controle = [], [], [], []
    for f in fuites:
        nature = NATURES.get(f['nature']) if f['nature'] else None
        date_det = rapports.get(f['tournee']) or f['date']
        a_reparation = bool(f['pieces']) or f['motif'] is not None
        rep = deduire_reparation(f, corresp) if a_reparation else None
        ouvrage = rep['ouvrage'] if rep else None
        obs = f"Import de l'attachement Excel n° 1 (fiche n° {f['numero']})"
        lf.append(f"({f['numero']}, {q(f['tournee'] or None)}, {q(ouvrage)}, {q(nature)}, "
                  f"{q(f'{date_det} {heure_det}+00')}, {q(obs)})")
        if rep:
            resultat = 'non_reparee' if f['motif'] and not f['pieces'] else 'reparee'
            emplacement = ('chaussee' if nature in CHAUSSEE else 'trottoir') if nature else None
            lr.append('(' + ', '.join(q(v) for v in [
                f['numero'], resultat, f['motif'] if resultat == 'non_reparee' else None,
                f"{f['date']} {heure_rep}+00", rep['ouvrage'], rep['materiau'], rep['diametre_mm'],
                rep['tuyau_repare'], rep['robinet_pec_change'], rep['collier_pec_change'],
                rep['bouche_a_cle_mise_a_niveau'], rep['longueur_pe_m'], f['longueur'], f['largeur'], f['profondeur'],
                emplacement, nature]) + ')')
            for lib, qte in f['pieces']:
                c = corresp[lib]
                if c.get('aucun') or not qte:
                    continue
                lp.append(f"({f['numero']}, {int(c['produit_id'])}, {q(qte)}, {q(lib)})")
        controle.append({**f, 'date_detection': date_det, 'source_date': 'rapport journalier' if f['tournee'] in rapports else 'Excel',
                         'nature_code': nature, 'reparation': rep})

    produits = sorted({int(c['produit_id']) for c in corresp.values() if not c.get('aucun')})
    gabarit = (Path(__file__).parent / 'injecter.sql.modele').read_text()
    sql = (gabarit
           .replace('{{GENERE_LE}}', dt.datetime.now().strftime('%Y-%m-%d %H:%M'))
           .replace('{{MARCHE}}', q(cfg['marche']))
           .replace('{{DETECTEUR}}', q(cfg['detecteur'])).replace('{{REPARATEUR}}', q(cfg['reparateur']))
           .replace('{{SAISIE}}', q(cfg['saisie']))
           .replace('{{NB_FUITES}}', str(len(fuites)))
           .replace('{{FUITES}}', ',\n  '.join(lf))
           .replace('{{REPARATIONS}}', ',\n  '.join(lr))
           .replace('{{PIECES}}', ',\n  '.join(lp))
           .replace('{{PRODUITS}}', ', '.join(map(str, produits))))
    (base / 'injecter.sql').write_text(sql)
    ecrire_editeur(base / 'editeur-supabase', sql, cfg)
    ecrire_controle(base / 'controle-import.xlsx', controle, corresp)
    print(f"{len(fuites)} fuites, {len(lr)} réparations, {len(lp)} pièces, {len(produits)} articles ; "
          f"date de détection tirée des rapports pour {sum(1 for c in controle if c['source_date'] != 'Excel')} fuites")
    print(f"Écrit : {base / 'injecter.sql'}, {base / 'editeur-supabase'} et {base / 'controle-import.xlsx'}")


RESUME_EDITEUR = """
-- Résultat affiché par l'éditeur : une ligne par contrôle
select 'fuites ' || f.statut::text as controle, count(*)::text as valeur
  from public.fuites f join public.marches m on m.id = f.marche_id
 where m.code = {m} and f.source_saisie = 'import' group by f.statut
union all
select 'réparations', count(*)::text from public.reparations r join public.marches m on m.id = r.marche_id
 where m.code = {m} and r.source_saisie = 'import'
union all
select 'pièces', count(*)::text from public.reparation_pieces p join public.reparations r on r.id = p.reparation_id
  join public.marches m on m.id = r.marche_id where m.code = {m} and r.source_saisie = 'import'
union all
select 'prix ' || pr.numero, sum(l.quantite)::text from public.lignes_quantites l
  join public.fuites f on f.id = l.fuite_id join public.prix pr on pr.id = l.prix_id
  join public.marches m on m.id = f.marche_id
 where m.code = {m} and f.source_saisie = 'import' group by pr.numero
union all
select 'prochain numéro de fuite', (c.valeur + 1)::text from private.compteurs c
  join public.marches m on m.id = c.marche_id where m.code = {m} and c.cle = 'fuite';
"""

VERIFIER_EDITEUR = """-- Vérification avant import (lecture seule) : à coller dans Supabase › SQL Editor
select 'marché ' || code as controle, case when actif then 'actif' else 'INACTIF' end as valeur
  from public.marches where code = {m}
union all
select 'fuites déjà présentes', count(*)::text
  from public.fuites f join public.marches m on m.id = f.marche_id where m.code = {m}
union all
select 'fuites déjà importées', count(*)::text
  from public.fuites f join public.marches m on m.id = f.marche_id where m.code = {m} and f.source_saisie = 'import'
union all
select 'compteur des fuites', coalesce(max(c.valeur), 0)::text
  from private.compteurs c join public.marches m on m.id = c.marche_id where m.code = {m} and c.cle = 'fuite'
union all
select 'compte ' || x.identifiant,
       coalesce((select case when not p.actif then 'INACTIF'
                             when not private.est_affecte(p.id, m.id) then 'NON AFFECTÉ AU MARCHÉ'
                             else 'actif et affecté' end
                   from public.profils p where p.identifiant = x.identifiant), 'INTROUVABLE')
  from unnest(array[{d}, {r}, {s}]) as x(identifiant)
  cross join public.marches m where m.code = {m};
"""


def ecrire_editeur(dossier, sql, cfg):
    """Versions pour Supabase › SQL Editor : sans commandes psql, un seul tableau de résultat."""
    dossier.mkdir(exist_ok=True)
    m = q(cfg['marche'])
    sans_resume = re.sub(r'-- <resume-psql>.*?-- </resume-psql>\n', '', sql, flags=re.S)
    lignes = [ln for ln in sans_resume.splitlines() if not ln.startswith('\\')]
    corps = '\n'.join(lignes).replace(':fin;', 'commit;')
    entete = ("-- 2. IMPORT : à coller tel quel dans Supabase › SQL Editor, puis Run.\n"
              "-- Tout ou rien : si un garde-fou échoue, rien n'est écrit et l'éditeur affiche le message.\n")
    (dossier / '2-injecter.sql').write_text(entete + corps + RESUME_EDITEUR.format(m=m))
    (dossier / '1-verifier.sql').write_text(VERIFIER_EDITEUR.format(
        m=m, d=q(cfg['detecteur']), r=q(cfg['reparateur']), s=q(cfg['saisie'])))
    modele = (Path(__file__).parent / 'annuler.sql').read_text()
    for nom, forcer in (('3-annuler.sql', 'non'), ('3-annuler-forcer.sql', 'oui')):
        a = (modele.replace(":'marche'", m).replace(":'forcer'", q(forcer))
             .replace(' \\gset', ';').replace(':fin;', 'commit;'))
        a = '\n'.join(ln for ln in a.splitlines() if not ln.startswith('\\'))
        (dossier / nom).write_text("-- ANNULATION de l'import : à coller dans Supabase › SQL Editor, puis Run.\n" + a + '\n')


def ecrire_controle(chemin, controle, corresp):
    from openpyxl import Workbook
    from openpyxl.styles import Font
    wb = Workbook()
    ws = wb.active
    ws.title = 'Fuites'
    ws.append(['N°', 'Tournée', 'Date détection', 'Source date', 'Date réparation', 'Résultat', 'Ouvrage', 'Matériau',
               'Diamètre', 'Nature', 'Long.', 'Larg.', 'Prof.', 'Tuyau réparé', 'Robinet PEC', 'Collier PEC',
               'Bouche à clé', 'PE (m)'])
    for c in controle:
        r = c['reparation'] or {}
        resultat = ('Non réparée (' + c['motif'] + ')' if c['motif'] and not c['pieces']
                    else 'Réparée' if c['pieces'] else 'Détectée, à réparer')
        ws.append([c['numero'], c['tournee'], c['date_detection'], c['source_date'],
                   c['date'] if c['reparation'] else None, resultat, r.get('ouvrage'), r.get('materiau'),
                   r.get('diametre_mm'), c['nature_code'], c['longueur'], c['largeur'], c['profondeur'],
                   *(('oui' if r.get(k) else '') for k in ('tuyau_repare', 'robinet_pec_change', 'collier_pec_change',
                                                            'bouche_a_cle_mise_a_niveau')), r.get('longueur_pe_m')])
    ws2 = wb.create_sheet('Pièces')
    ws2.append(['N° fuite', 'Pièce (Excel)', 'Quantité', 'Article Dolibarr', 'Référence'])
    for c in controle:
        for lib, qte in c['pieces']:
            a = corresp[lib]
            ws2.append([c['numero'], lib, qte, 'non importée' if a.get('aucun') else a.get('libelle'), a.get('ref')])
    for feuille in (ws, ws2):
        for cel in feuille[1]:
            cel.font = Font(bold=True)
        feuille.freeze_panes = 'A2'
        for col in feuille.columns:
            feuille.column_dimensions[col[0].column_letter].width = max(9, min(40, max(len(str(x.value or '')) for x in col) + 2))
    wb.save(chemin)


if __name__ == '__main__':
    main()
