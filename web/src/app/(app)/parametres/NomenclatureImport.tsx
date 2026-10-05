'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import {
  FAMILLES_PAR_DEFAUT, comparerImport, decoderTexte, extraireProduits, filtrerFamilles, lireCsv, resumerFamilles,
  type LectureProduits,
} from '@/lib/nomenclature/csv';
import { importerProduits, messageNomenclature, type ResultatImport } from '@/lib/nomenclature/donnees';
import type { ProduitNomenclature } from '@/lib/nomenclature/rapprochement';
import styles from './Nomenclature.module.css';

const TAILLE_MAX = 20 * 1024 * 1024;

// Import de produits.csv : le fichier est lu dans le navigateur ; seules les colonnes utiles partent vers la base.
export function NomenclatureImport({ produits, recharger }: { produits: ProduitNomenclature[]; recharger: () => Promise<void> }) {
  const [lecture, setLecture] = useState<LectureProduits | null>(null);
  const [familles, setFamilles] = useState<Set<string>>(new Set(FAMILLES_PAR_DEFAUT));
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [resultat, setResultat] = useState<ResultatImport | null>(null);

  async function choisirFichier(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    setResultat(null);
    setErreur('');
    setLecture(null);
    if (!fichier) return;
    if (fichier.size > TAILLE_MAX) {
      setErreur('Fichier trop volumineux (20 Mo au plus).');
      return;
    }
    try {
      const l = extraireProduits(lireCsv(decoderTexte(await fichier.arrayBuffer())));
      setLecture(l);
      if (l.colonnesManquantes.length) setErreur(`Colonnes introuvables : ${l.colonnesManquantes.join(', ')}. Est-ce bien l'export des produits de Dolibarr ?`);
    } catch (err) {
      setErreur(`Fichier illisible : ${messageNomenclature(err)}`);
    }
  }

  const resume = useMemo(() => (lecture ? resumerFamilles(lecture.produits) : []), [lecture]);
  const retenus = useMemo(() => (lecture ? filtrerFamilles(lecture.produits, familles) : []), [lecture, familles]);
  const apercu = useMemo(() => comparerImport(produits, retenus), [produits, retenus]);

  const basculer = (f: string) => setFamilles((s) => {
    const n = new Set(s);
    if (n.has(f)) n.delete(f);
    else n.add(f);
    return n;
  });

  async function importer() {
    if (!retenus.length) return;
    if (apercu.desactives > 0 && !window.confirm(`${apercu.desactives} produit(s) déjà importé(s) ne sont pas dans cette sélection : ils seront rendus inactifs (jamais supprimés). Continuer ?`)) return;
    setOccupe(true);
    setErreur('');
    try {
      const familleRetenues = resume.map((r) => r.famille).filter((f) => familles.has(f));
      setResultat(await importerProduits(retenus, familleRetenues));
      await recharger();
    } catch (err) {
      setErreur(messageNomenclature(err));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <section className="carte">
      <h2>Importer la nomenclature (produits.csv)</h2>
      <p className="discret">
        Export des produits de Dolibarr (séparateur « ; », UTF-8). On peut réimporter à tout moment : les nouveaux
        produits sont ajoutés, les libellés modifiés suivent (y compris dans le catalogue des marchés), les produits
        absents deviennent inactifs ; rien n&apos;est supprimé et les rapprochements sont gardés.
      </p>
      <div className={styles.fichier}>
        <input type="file" accept=".csv,text/csv" onChange={choisirFichier} aria-label="Fichier produits.csv" disabled={occupe} />
      </div>
      <p className={styles.confidentiel}>
        Le fichier reste sur cet ordinateur. Seuls l&apos;identifiant, la référence, le libellé, l&apos;unité, la famille et
        l&apos;état (en vente ou en achat) des familles cochées sont envoyés. Aucun prix, PMP ni stock, même si le
        fichier en contient.
      </p>
      {erreur && <p className="erreur">{erreur}</p>}

      {lecture && !lecture.colonnesManquantes.length && (
        <>
          <div className={styles.resume}>
            <div className={styles.chiffre}><strong>{lecture.produits.length}</strong><span>produits lus</span></div>
            <div className={styles.chiffre}><strong>{retenus.length}</strong><span>dans les familles cochées</span></div>
            <div className={styles.chiffre}><strong>{lecture.rejetees.length}</strong><span>lignes rejetées</span></div>
            <div className={styles.chiffre}><strong>{lecture.doublons}</strong><span>identifiants en double</span></div>
          </div>
          {lecture.rejetees.length > 0 && (
            <ul className={styles.rejets}>
              {lecture.rejetees.slice(0, 5).map((r) => <li key={r.ligne}>Ligne {r.ligne} : {r.motif}</li>)}
              {lecture.rejetees.length > 5 && <li>… et {lecture.rejetees.length - 5} autre(s)</li>}
            </ul>
          )}
          <fieldset>
            <legend>Familles à garder (préfixe de la référence)</legend>
            <div className={styles.familles}>
              {resume.map((r) => (
                <label key={r.famille} className="ligne">
                  <input type="checkbox" checked={familles.has(r.famille)} onChange={() => basculer(r.famille)} />
                  <span>{r.famille} · {r.libelle}</span>
                  <small>{r.total}{r.actifs < r.total ? ` (${r.total - r.actifs} inactif${r.total - r.actifs > 1 ? 's' : ''})` : ''}</small>
                </label>
              ))}
            </div>
          </fieldset>
          <div className={styles.resume} aria-label="Ce que l'import va changer">
            <div className={styles.chiffre}><strong>{apercu.nouveaux}</strong><span>nouveaux</span></div>
            <div className={styles.chiffre}><strong>{apercu.modifies}</strong><span>modifiés (dont {apercu.designationsModifiees} libellé{apercu.designationsModifiees > 1 ? 's' : ''})</span></div>
            <div className={styles.chiffre}><strong>{apercu.desactives}</strong><span>rendus inactifs</span></div>
            <div className={styles.chiffre}><strong>{apercu.inchanges}</strong><span>inchangés</span></div>
          </div>
          <div className="actions">
            <button className="primaire" onClick={importer} disabled={occupe || !retenus.length}>
              {occupe ? 'Import en cours…' : `Importer ${retenus.length} produit(s)`}
            </button>
          </div>
        </>
      )}

      {resultat && (
        <p className="info" role="status">
          Import terminé : {resultat.nouveaux} nouveau(x), {resultat.modifies} modifié(s) dont {resultat.designations_modifiees} libellé(s),{' '}
          {resultat.desactives} rendu(s) inactif(s) ; {resultat.pieces_renommees} pièce(s) du catalogue renommée(s)
          {resultat.conflits_designation > 0 ? `, ${resultat.conflits_designation} non renommée(s) (une autre pièce porte déjà ce libellé)` : ''}.
        </p>
      )}
    </section>
  );
}
