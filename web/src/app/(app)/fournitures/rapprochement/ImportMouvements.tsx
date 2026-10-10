'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import {
  decoderTexte, extraireMouvements, fusionnerLectures, lireCsv, resumerMouvements, type LectureMouvements,
} from '@/lib/dolibarr/csv';
import { importerMouvements, messageDolibarr, type DernierImportMouvements, type ResultatImportMouvements } from '@/lib/dolibarr/donnees';
import { dateHeure } from '@/lib/format';
import styles from '../fournitures.module.css';

const TAILLE_MAX = 20 * 1024 * 1024;

// Import manuel des mouvements de stock (administrateur), en secours de l'envoi automatique (X8) : un ou plusieurs fichiers CSV lus dans le navigateur
// (export courant et complément de la dotation initiale) ; seules les colonnes utiles partent vers la base.
export function ImportMouvements({
  entrepotMarche, dernierImport, apresImport,
}: { entrepotMarche: number | null; dernierImport: DernierImportMouvements | null; apresImport: () => Promise<void> }) {
  const [lecture, setLecture] = useState<LectureMouvements | null>(null);
  const [noms, setNoms] = useState<string[]>([]);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [resultat, setResultat] = useState<ResultatImportMouvements | null>(null);

  async function choisirFichiers(e: ChangeEvent<HTMLInputElement>) {
    const fichiers = [...(e.target.files ?? [])];
    setResultat(null);
    setErreur('');
    setLecture(null);
    setNoms(fichiers.map((f) => f.name));
    if (!fichiers.length) return;
    if (fichiers.some((f) => f.size > TAILLE_MAX)) {
      setErreur('Fichier trop volumineux (20 Mo au plus par fichier).');
      return;
    }
    try {
      const lectures = await Promise.all(fichiers.map(async (f) => extraireMouvements(lireCsv(decoderTexte(await f.arrayBuffer())))));
      const fusion = fusionnerLectures(lectures);
      setLecture(fusion);
      if (fusion.colonnesManquantes.length) {
        setErreur(`Colonnes introuvables : ${fusion.colonnesManquantes.join(', ')}. Est-ce bien l'export des mouvements de stock de Dolibarr ?`);
      }
    } catch (err) {
      setErreur(`Fichier illisible : ${messageDolibarr(err)}`);
    }
  }

  const resume = useMemo(() => (lecture ? resumerMouvements(lecture.mouvements, entrepotMarche) : null), [lecture, entrepotMarche]);

  async function importer() {
    if (!lecture?.mouvements.length) return;
    setOccupe(true);
    setErreur('');
    try {
      setResultat(await importerMouvements(lecture.mouvements));
      setLecture(null);
      setNoms([]);
      await apresImport();
    } catch (err) {
      setErreur(messageDolibarr(err));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <section className="carte">
      <h2>Import manuel des mouvements (secours)</h2>
      <p className="discret">
        À utiliser si la synchronisation est arrêtée (Dolibarr injoignable, clés de l&apos;API retirées).
        Fichiers « mouvements_chantier… .csv » de l&apos;export Dolibarr (séparateur « ; », UTF-8), un ou plusieurs à la fois
        (export courant et complément de la dotation initiale). On peut réimporter à tout moment : un mouvement déjà connu est
        laissé tel quel, ou mis à jour s&apos;il a changé dans Dolibarr ; rien n&apos;est supprimé.
        {dernierImport && (
          <>
            {' '}Dernier import CSV le {dateHeure(dernierImport.importe_le)} : {dernierImport.lignes_lues} ligne{dernierImport.lignes_lues > 1 ? 's' : ''}
            {dernierImport.date_min && dernierImport.date_max ? ` (du ${dateHeure(dernierImport.date_min)} au ${dateHeure(dernierImport.date_max)})` : ''}.
          </>
        )}
      </p>
      <div className={styles.fichier}>
        <input type="file" accept=".csv,text/csv" multiple onChange={choisirFichiers} aria-label="Fichiers de mouvements Dolibarr" disabled={occupe} />
        {noms.length > 1 && <span className="discret">{noms.length} fichiers</span>}
      </div>
      <p className={styles.confidentiel}>
        Les fichiers restent sur cet ordinateur. Seuls l&apos;identifiant du mouvement, la date, le produit (identifiant, référence,
        libellé), l&apos;entrepôt et sa contrepartie, la quantité signée, le type, le libellé, le code d&apos;inventaire, l&apos;annulation,
        le projet, le bon de transfert et l&apos;unité sont envoyés. Aucun prix, valeur ni PMP, même si le fichier en contient.
      </p>
      {erreur && <p className="erreur">{erreur}</p>}

      {lecture && resume && !lecture.colonnesManquantes.length && (
        <>
          <div className={styles.resume}>
            <div className={styles.chiffre}><strong>{resume.lignes}</strong><span>mouvements lus</span></div>
            <div className={styles.chiffre}>
              <strong>{resume.produits}</strong><span>produits</span>
            </div>
            <div className={styles.chiffre}><strong>{resume.entrees}</strong><span>entrées au chantier</span></div>
            <div className={styles.chiffre}><strong>{resume.retours}</strong><span>retours au dépôt</span></div>
            <div className={styles.chiffre}><strong>{resume.consommations}</strong><span>consommations déclarées</span></div>
            <div className={styles.chiffre}><strong>{resume.annulations}</strong><span>lignes d&apos;annulation (neutralisées)</span></div>
            <div className={styles.chiffre}><strong>{lecture.rejetees.length}</strong><span>lignes rejetées</span></div>
            <div className={styles.chiffre}><strong>{lecture.doublons}</strong><span>identifiants en double</span></div>
          </div>
          <p className="discret">
            Période : {resume.dateMin ? dateLue(resume.dateMin) : '—'} → {resume.dateMax ? dateLue(resume.dateMax) : '—'}.
            {entrepotMarche == null
              ? ' Entrepôt du chantier non renseigné (réglage ci-dessus, administrateur) : les mouvements seront importés mais pas rapprochés.'
              : resume.horsEntrepotMarche > 0
                ? ` ${resume.horsEntrepotMarche} ligne${resume.horsEntrepotMarche > 1 ? 's' : ''} d'un autre entrepôt que celui du marché (importées, non rapprochées à ce marché).`
                : ''}
          </p>
          <ul className={styles.entrepots}>
            {resume.entrepots.map((e) => (
              <li key={e.id} className={e.id === entrepotMarche ? styles.marche : ''}>
                Entrepôt {e.id}{e.libelle ? ` · ${e.libelle}` : ''} : {e.lignes} ligne{e.lignes > 1 ? 's' : ''}
                {e.id === entrepotMarche ? ' (entrepôt du marché)' : ''}
              </li>
            ))}
          </ul>
          {lecture.rejetees.length > 0 && (
            <ul className={styles.rejets}>
              {lecture.rejetees.slice(0, 5).map((r) => <li key={`${r.ligne}-${r.motif}`}>Ligne {r.ligne} : {r.motif}</li>)}
              {lecture.rejetees.length > 5 && <li>… et {lecture.rejetees.length - 5} autre(s)</li>}
            </ul>
          )}
          <div className="actions">
            <button className="primaire" onClick={importer} disabled={occupe || !lecture.mouvements.length}>
              {occupe ? 'Import en cours…' : `Importer ${lecture.mouvements.length} mouvement${lecture.mouvements.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </>
      )}

      {resultat && (
        <p className="info" role="status">
          Import terminé : {resultat.nouveaux} nouveau{resultat.nouveaux > 1 ? 'x' : ''}, {resultat.modifies} mis à jour,{' '}
          {resultat.inchanges} inchangé{resultat.inchanges > 1 ? 's' : ''} ; {resultat.annulations} ligne{resultat.annulations > 1 ? 's' : ''} d&apos;annulation
          ; entrepôt{resultat.entrepots.length > 1 ? 's' : ''} {resultat.entrepots.join(', ')}.
        </p>
      )}
    </section>
  );
}

// Date lue dans le fichier : « AAAA-MM-JJ HH:MM:SS » (heure du Maroc) ou ISO ; montrée en jour/mois/année.
function dateLue(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}
