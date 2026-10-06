'use client';

import { useEffect, useMemo, useState } from 'react';
import { LIBELLES_FAMILLES, uniteCatalogue } from '@/lib/nomenclature/csv';
import { ajouterAuCatalogue, messageNomenclature, type PieceNomenclature } from '@/lib/nomenclature/donnees';
import { normaliser, rechercherProduits, type ProduitNomenclature } from '@/lib/nomenclature/rapprochement';
import styles from './Nomenclature.module.css';

const PAR_PAGE = 60;

// Ajout au catalogue du marché de produits Dolibarr non encore rapprochés (sélection par famille et recherche).
export function NomenclatureAjout({
  marcheId, pieces, produits, recharger,
}: { marcheId: string; pieces: PieceNomenclature[]; produits: ProduitNomenclature[]; recharger: () => Promise<void> }) {
  const [famille, setFamille] = useState('');
  const [recherche, setRecherche] = useState('');
  const [inactifs, setInactifs] = useState(false);
  const [choisis, setChoisis] = useState<Set<number>>(new Set());
  const [limite, setLimite] = useState(PAR_PAGE);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  const lies = useMemo(() => new Set(pieces.map((p) => p.produit_dolibarr_id).filter((id): id is number => id !== null)), [pieces]);
  const designations = useMemo(() => new Map(pieces.map((p) => [normaliser(p.designation), p.designation])), [pieces]);
  const familles = useMemo(() => [...new Set(produits.map((p) => p.famille))].sort(), [produits]);
  const disponibles = useMemo(() => {
    const base = produits.filter((p) => !lies.has(p.dolibarr_id) && (inactifs || p.actif) && (!famille || p.famille === famille));
    return recherche.trim() ? rechercherProduits(base, recherche, base.length) : base;
  }, [produits, lies, inactifs, famille, recherche]);

  useEffect(() => setLimite(PAR_PAGE), [famille, recherche, inactifs]);

  const basculer = (id: number) => setChoisis((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const visibles = disponibles.slice(0, limite);
  const selectionnables = visibles.filter((p) => !designations.has(normaliser(p.designation)));
  const toutCoche = selectionnables.length > 0 && selectionnables.every((p) => choisis.has(p.dolibarr_id));

  async function ajouter() {
    // Deux produits au même libellé ne peuvent pas entrer ensemble (désignation unique dans le marché).
    const vus = new Set<string>();
    const lignes = produits
      .filter((p) => choisis.has(p.dolibarr_id) && !lies.has(p.dolibarr_id) && !designations.has(normaliser(p.designation)))
      .filter((p) => {
        const cle = normaliser(p.designation);
        if (vus.has(cle)) return false;
        vus.add(cle);
        return true;
      })
      .map((p) => ({
        marche_id: marcheId,
        produit_dolibarr_id: p.dolibarr_id,
        designation: p.designation,
        famille: LIBELLES_FAMILLES[p.famille] ?? p.famille,
        unite: uniteCatalogue(p.unite),
      }));
    if (!lignes.length) return;
    setOccupe(true);
    setErreur('');
    setMessage('');
    try {
      await ajouterAuCatalogue(lignes);
      const ecartes = choisis.size - lignes.length;
      setChoisis(new Set());
      setMessage(`${lignes.length} produit(s) ajouté(s) au catalogue du marché, proposés au réparateur par leur désignation.`
        + (ecartes > 0 ? ` ${ecartes} écarté(s) : libellé en double dans Dolibarr ou déjà présent.` : ''));
      await recharger();
    } catch (e) {
      setErreur(messageNomenclature(e));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <section className="carte">
      <h2>Ajouter des produits Dolibarr au catalogue</h2>
      <p className="discret">
        Produits de la nomenclature pas encore rapprochés d&apos;une pièce de ce marché. Une fois ajoutés, le réparateur
        les trouve par leur désignation (jamais par la référence).
      </p>
      <div className="filtres">
        <select value={famille} onChange={(e) => setFamille(e.target.value)} aria-label="Famille Dolibarr">
          <option value="">Toutes les familles</option>
          {familles.map((f) => <option key={f} value={f}>{f} · {LIBELLES_FAMILLES[f] ?? f}</option>)}
        </select>
        <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher (désignation ou référence)" aria-label="Rechercher un produit" />
        <label className="ligne"><input type="checkbox" checked={inactifs} onChange={(e) => setInactifs(e.target.checked)} />Produits inactifs</label>
      </div>
      <div className={styles.barreLot}>
        <span className="discret">{disponibles.length} produit(s) · {choisis.size} coché(s)</span>
        <button className="primaire" onClick={ajouter} disabled={occupe || choisis.size === 0}>
          Ajouter {choisis.size} produit(s) au catalogue
        </button>
      </div>
      {message && <p className="info" role="status">{message}</p>}
      {erreur && <p className="erreur">{erreur}</p>}
      <div className="defilement">
        <table className={`liste-compacte ${styles.ajout}`}>
          <thead>
            <tr>
              <th>
                <input type="checkbox" checked={toutCoche} aria-label="Cocher les produits affichés"
                  onChange={() => setChoisis((s) => {
                    const n = new Set(s);
                    selectionnables.forEach((p) => (toutCoche ? n.delete(p.dolibarr_id) : n.add(p.dolibarr_id)));
                    return n;
                  })} />
              </th>
              <th>Désignation</th>
              <th>Référence</th>
              <th>Famille</th>
              <th>Unité</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p, i) => {
              const homonyme = designations.get(normaliser(p.designation));
              return (
                <tr key={p.dolibarr_id} className={i % 2 ? 'zebre' : ''}>
                  <td>
                    <input type="checkbox" checked={choisis.has(p.dolibarr_id)} disabled={!!homonyme}
                      onChange={() => basculer(p.dolibarr_id)} aria-label={`Ajouter ${p.designation}`} />
                  </td>
                  <td>
                    {p.designation}
                    {!p.actif && <span className={styles.avertissement}>Inactif dans Dolibarr</span>}
                    {homonyme && <span className={styles.avertissement}>Une pièce « {homonyme} » existe déjà : la rapprocher plutôt</span>}
                  </td>
                  <td><span className={styles.ref}>{p.ref}</span></td>
                  <td className="nowrap">{LIBELLES_FAMILLES[p.famille] ?? p.famille}</td>
                  <td className="nowrap">{uniteCatalogue(p.unite)}</td>
                </tr>
              );
            })}
            {disponibles.length === 0 && <tr><td colSpan={5} className="discret">Aucun produit disponible.</td></tr>}
          </tbody>
        </table>
      </div>
      {disponibles.length > limite && (
        <div className="actions">
          <button onClick={() => setLimite((l) => l + PAR_PAGE)}>Afficher {Math.min(PAR_PAGE, disponibles.length - limite)} de plus</button>
        </div>
      )}
    </section>
  );
}
