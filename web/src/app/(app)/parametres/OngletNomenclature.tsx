'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  chargerDernierImport, chargerPieces, chargerProduits, messageNomenclature,
  type DernierImport, type PieceNomenclature,
} from '@/lib/nomenclature/donnees';
import type { ProduitNomenclature } from '@/lib/nomenclature/rapprochement';
import { NomenclatureAjout } from './NomenclatureAjout';
import { NomenclatureImport } from './NomenclatureImport';
import { NomenclatureRapprochement } from './NomenclatureRapprochement';
import styles from './Nomenclature.module.css';

type Etape = 'rapprochement' | 'import' | 'ajout';

// Paramètres > Nomenclature Dolibarr (administrateur) : seul écran où la référence Dolibarr apparaît.
export function OngletNomenclature({ marcheId, marcheCode }: { marcheId: string; marcheCode: string }) {
  const [produits, setProduits] = useState<ProduitNomenclature[]>([]);
  const [pieces, setPieces] = useState<PieceNomenclature[]>([]);
  const [dernier, setDernier] = useState<DernierImport | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [etape, setEtape] = useState<Etape>('rapprochement');

  const charger = useCallback(async () => {
    try {
      const [p, c, d] = await Promise.all([chargerProduits(), chargerPieces(marcheId), chargerDernierImport()]);
      setProduits(p);
      setPieces(c);
      setDernier(d);
      setErreur('');
    } catch (e) {
      setErreur(messageNomenclature(e));
    } finally {
      setChargement(false);
    }
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Sans nomenclature en base, on commence par l'import.
  useEffect(() => {
    if (!chargement && produits.length === 0) setEtape('import');
  }, [chargement, produits.length]);

  const actifs = produits.filter((p) => p.actif).length;
  const rapprochees = pieces.filter((p) => p.produit_dolibarr_id !== null).length;

  return (
    <>
      {erreur && <p className="erreur">{erreur}</p>}
      <section className="carte">
        <h2>Nomenclature Dolibarr</h2>
        <p className="discret">
          Les pièces posables viennent de la nomenclature de Dolibarr. Le réparateur ne voit que la désignation ;
          la référence Dolibarr n&apos;apparaît que sur cet écran. Marché {marcheCode} : {rapprochees} pièce(s) sur{' '}
          {pieces.length} rapprochée(s). Nomenclature : {produits.length} produit(s), dont {actifs} actif(s)
          {dernier ? `, dernier import le ${new Date(dernier.importe_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} (${dernier.familles.join(', ') || 'familles non précisées'})` : ', jamais importée'}.
        </p>
        <div className={styles.etapes} role="group" aria-label="Étapes">
          <button type="button" aria-pressed={etape === 'rapprochement'} onClick={() => setEtape('rapprochement')} disabled={!produits.length}>
            Rapprochement du catalogue
          </button>
          <button type="button" aria-pressed={etape === 'ajout'} onClick={() => setEtape('ajout')} disabled={!produits.length}>
            Ajouter des produits au catalogue
          </button>
          <button type="button" aria-pressed={etape === 'import'} onClick={() => setEtape('import')}>
            Importer produits.csv
          </button>
        </div>
        {chargement && <p className="discret">Chargement…</p>}
      </section>

      {!chargement && etape === 'import' && <NomenclatureImport produits={produits} recharger={charger} />}
      {!chargement && etape === 'rapprochement' && produits.length > 0 && (
        <NomenclatureRapprochement key={marcheId} marcheId={marcheId} pieces={pieces} produits={produits} recharger={charger} />
      )}
      {!chargement && etape === 'ajout' && produits.length > 0 && (
        <NomenclatureAjout key={marcheId} marcheId={marcheId} pieces={pieces} produits={produits} recharger={charger} />
      )}
    </>
  );
}
