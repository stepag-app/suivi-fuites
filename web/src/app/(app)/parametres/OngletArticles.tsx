'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LIBELLES_FAMILLES } from '@/lib/nomenclature/csv';
import {
  activerProduits, chargerDernierImport, chargerProduits, messageNomenclature,
  type DernierImport, type ProduitNomenclature,
} from '@/lib/nomenclature/donnees';
import { NomenclatureImport } from './NomenclatureImport';
import styles from './Articles.module.css';

type Etape = 'liste' | 'import';
type Filtre = '' | 'actives' | 'a_activer' | 'nouveaux' | 'retires';

const PAR_PAGE = 100;
const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const libelleFamille = (f: string) => (LIBELLES_FAMILLES[f] ? `${LIBELLES_FAMILLES[f]} (${f})` : f);

// Paramètres > Articles : les produits Dolibarr importés sont le référentiel des pièces, commun à tous les
// marchés ; seuls les articles activés s'affichent dans la liste déroulante du réparateur. Import réservé à
// l'administrateur, activation ouverte au responsable. Seul écran où la référence Dolibarr apparaît.
export function OngletArticles({ importer }: { importer: boolean }) {
  const [produits, setProduits] = useState<ProduitNomenclature[]>([]);
  const [dernier, setDernier] = useState<DernierImport | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [etape, setEtape] = useState<Etape>('liste');
  const [recherche, setRecherche] = useState('');
  const [famille, setFamille] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('');
  const [limite, setLimite] = useState(PAR_PAGE);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([chargerProduits(), chargerDernierImport()]);
      setProduits(p);
      setDernier(d);
      setErreur('');
    } catch (e) {
      setErreur(messageNomenclature(e));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  // Sans article en base, l'administrateur commence par l'import.
  useEffect(() => {
    if (!chargement && produits.length === 0 && importer) setEtape('import');
  }, [chargement, produits.length, importer]);

  useEffect(() => {
    setLimite(PAR_PAGE);
    setSelection(new Set());
  }, [recherche, famille, filtre]);

  const familles = useMemo(() => [...new Set(produits.map((p) => p.famille))].sort(), [produits]);
  // « Nouveaux » : arrivés au dernier import (cree_le ≥ début du dernier import) et pas encore activés.
  const debutDernierImport = dernier ? new Date(dernier.importe_le).getTime() - 60_000 : null;
  const filtres = useMemo(() => {
    const mots = sansAccent(recherche).split(/\s+/).filter(Boolean);
    return produits
      .filter((p) =>
        (!famille || p.famille === famille)
        && (filtre === '' ? p.actif || p.utilisable
          : filtre === 'actives' ? p.utilisable && p.actif
            : filtre === 'a_activer' ? p.actif && !p.utilisable
              : filtre === 'nouveaux' ? p.actif && !p.utilisable && debutDernierImport != null
                && new Date(p.cree_le).getTime() >= debutDernierImport
                : !p.actif)
        && mots.every((m) => sansAccent(`${p.designation} ${p.ref}`).includes(m)))
      .sort((a, b) => a.designation.localeCompare(b.designation, 'fr'));
  }, [produits, recherche, famille, filtre, debutDernierImport]);

  const actives = produits.filter((p) => p.utilisable && p.actif).length;
  const visibles = filtres.slice(0, limite);
  const toutCoche = visibles.length > 0 && visibles.every((p) => selection.has(p.dolibarr_id));

  const basculerSelection = (id: number) => setSelection((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  async function activer(ids: number[], utilisable: boolean) {
    if (!ids.length) return;
    setOccupe(true);
    setErreur('');
    setInfo('');
    try {
      const n = await activerProduits(ids, utilisable);
      setInfo(`${n} article(s) ${utilisable ? 'activé(s)' : 'désactivé(s)'} pour tous les marchés.`);
      setSelection(new Set());
      await charger();
    } catch (e) {
      setErreur(messageNomenclature(e));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <>
      {erreur && <p className="erreur">{erreur}</p>}
      <section className="carte">
        <h2>Articles</h2>
        <p className="discret">
          Les articles sont les produits de Dolibarr, communs à tous les marchés. Seuls les articles <strong>activés</strong>{' '}
          s&apos;affichent dans la liste des pièces posées (tablette et panneau). Le réparateur ne voit que la désignation ;
          la référence Dolibarr n&apos;apparaît que sur cet écran. {produits.length} article(s) importé(s), dont {actives} activé(s)
          {dernier ? `, dernier import le ${new Date(dernier.importe_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} (${dernier.familles.join(', ') || 'familles non précisées'})` : ', jamais importés'}.
        </p>
        <p className="discret">
          Article absent de Dolibarr : demande interne au gestionnaire de Dolibarr, qui le crée ; l&apos;administrateur
          exporte ensuite <code>produits.csv</code> et le réimporte ici, puis l&apos;article est activé. Il n&apos;y a pas de pièce libre.
        </p>
        {importer && (
          <div className={styles.etapes} role="group" aria-label="Étapes">
            <button type="button" aria-pressed={etape === 'liste'} onClick={() => setEtape('liste')} disabled={!produits.length}>
              Liste et activation
            </button>
            <button type="button" aria-pressed={etape === 'import'} onClick={() => setEtape('import')}>
              Importer produits.csv
            </button>
          </div>
        )}
        {!chargement && !produits.length && !importer && (
          <p className="discret">Aucun article importé : l&apos;administrateur doit d&apos;abord importer <code>produits.csv</code>.</p>
        )}
        {chargement && <p className="discret">Chargement…</p>}
      </section>

      {!chargement && importer && etape === 'import' && <NomenclatureImport produits={produits} recharger={charger} />}

      {!chargement && etape === 'liste' && produits.length > 0 && (
        <section className="carte">
          <div className="filtres">
            <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher (désignation, référence)" aria-label="Rechercher un article" />
            <select value={famille} onChange={(e) => setFamille(e.target.value)} aria-label="Famille">
              <option value="">Toutes les familles</option>
              {familles.map((f) => <option key={f} value={f}>{libelleFamille(f)}</option>)}
            </select>
            <select value={filtre} onChange={(e) => setFiltre(e.target.value as Filtre)} aria-label="État">
              <option value="">Tous (présents dans Dolibarr)</option>
              <option value="actives">Activés</option>
              <option value="a_activer">Non activés</option>
              <option value="nouveaux">Nouveaux du dernier import</option>
              <option value="retires">Retirés de Dolibarr</option>
            </select>
          </div>
          {info && <p className="info" role="status">{info}</p>}
          <div className={styles.barreLot}>
            <span className="discret">{filtres.length} article(s){selection.size ? ` · ${selection.size} sélectionné(s)` : ''}</span>
            <span className="actions">
              <button onClick={() => activer([...selection], true)} disabled={occupe || !selection.size}>Activer la sélection</button>
              <button onClick={() => activer([...selection], false)} disabled={occupe || !selection.size}>Désactiver la sélection</button>
            </span>
          </div>
          <div className="defilement">
            <table className="liste-compacte">
              <thead>
                <tr>
                  <th className={styles.selection}>
                    <input type="checkbox" checked={toutCoche} aria-label="Tout sélectionner (articles affichés)"
                      onChange={() => setSelection((s) => {
                        const n = new Set(s);
                        visibles.forEach((p) => (toutCoche ? n.delete(p.dolibarr_id) : n.add(p.dolibarr_id)));
                        return n;
                      })} />
                  </th>
                  <th>Désignation</th><th>Famille</th><th>Unité</th><th>État</th><th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((p, i) => (
                  <tr key={p.dolibarr_id} className={`${i % 2 ? 'zebre' : ''} ${p.actif ? '' : 'discret'}`}>
                    <td className={styles.selection}>
                      <input type="checkbox" checked={selection.has(p.dolibarr_id)} onChange={() => basculerSelection(p.dolibarr_id)}
                        aria-label={`Sélectionner ${p.designation}`} />
                    </td>
                    <td>{p.designation} <span className={styles.ref}>{p.ref}</span></td>
                    <td>{LIBELLES_FAMILLES[p.famille] ?? p.famille}</td>
                    <td className="nowrap">{p.unite ?? '—'}</td>
                    <td className="nowrap">
                      {!p.actif ? 'Retiré de Dolibarr' : p.utilisable ? <span className={styles.active}>Activé</span> : 'Non activé'}
                    </td>
                    <td className="nowrap">
                      {(p.actif || p.utilisable) && (
                        <button className="petit" disabled={occupe} onClick={() => activer([p.dolibarr_id], !p.utilisable)}>
                          {p.utilisable ? 'Désactiver' : 'Activer'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtres.length > limite && (
            <div className="actions">
              <button onClick={() => setLimite((l) => l + PAR_PAGE)}>Afficher {Math.min(PAR_PAGE, filtres.length - limite)} de plus</button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
