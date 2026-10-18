"""Construit la correspondance pièce Excel -> article Dolibarr.

Sources : les rapprochements automatiques (articles-candidats.json, mode « auto ») et les choix cochés
dans l'artefact (un fichier JSON par pièce, lus par ArtifactData). Une correspondance déjà apprise
lors d'un import précédent est gardée : seules les pièces nouvelles demandent un choix.

Usage : python3 outils/import-excel/correspondance.py --config data-private/import-excel/config.json [--essai]
  --essai : accepte les suggestions pour les pièces non choisies (fichier correspondance-essai.json, banc local).
"""
import argparse
import json
import sys
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', required=True)
    ap.add_argument('--essai', action='store_true')
    args = ap.parse_args()
    cfg = json.loads(Path(args.config).read_text())
    base = Path(cfg['dossier'])
    cand = json.loads((base / cfg['candidats']).read_text())
    cat = {p['ref']: p for p in cand['catalogue']}
    sortie = base / ('correspondance-essai.json' if args.essai else cfg['correspondance'])
    connue = json.loads(sortie.read_text()) if sortie.exists() and not args.essai else {}

    choix = {}
    dossier_choix = base / cfg['choix_artefact']
    for f in sorted(dossier_choix.glob('**/*.json')) if dossier_choix.exists() else []:
        d = json.loads(f.read_text())
        d = d.get('data', d)
        choix[d['piece']] = d

    res, attente = {}, []
    for p in cand['pieces']:
        nom = p['piece']
        c = choix.get(nom)
        if c:
            res[nom] = {'aucun': True} if c.get('aucun') else {'ref': c['ref'], 'produit_id': cat[c['ref']]['id'],
                                                               'libelle': cat[c['ref']]['label'], 'source': 'artefact'}
        elif nom in connue:
            res[nom] = connue[nom]
        elif p['mode'] == 'auto' or (args.essai and p['suggestion']):
            ref = p['suggestion']
            res[nom] = {'ref': ref, 'produit_id': cat[ref]['id'], 'libelle': cat[ref]['label'],
                        'source': 'automatique' if p['mode'] == 'auto' else 'suggestion (essai)'}
        elif args.essai:
            res[nom] = {'aucun': True, 'source': 'sans suggestion (essai)'}
        else:
            attente.append(nom)
    sortie.write_text(json.dumps(res, ensure_ascii=False, indent=1))
    print(f'{len(res)} pièces rapprochées -> {sortie}')
    if attente:
        print('En attente de choix dans l\'artefact : ' + ', '.join(attente))
        sys.exit(2 if not args.essai else 0)


if __name__ == '__main__':
    main()
