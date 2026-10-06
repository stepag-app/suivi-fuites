'use client';

// Import du plan du réseau (administrateur), dans l'ordre conseillé : 1. contours des secteurs (facultatif),
// 2. tronçons, 3. nœuds. Fichiers GeoJSON lus dans le navigateur, aperçu (nombre, calques, secteurs reconnus),
// envoi par paquets de 1 000 features à importer_troncons / importer_noeuds, un appel definir_contour_secteur
// par contour, barre de progression, résumé.
import { useMemo, useState, type ChangeEvent } from 'react';
import { nombre } from '@/lib/format';
import { importerContoursSecteurs, importerFeatures, messageReseau } from '@/lib/reseau/donnees';
import {
  TAILLE_PAQUET, lireContoursSecteurs, lireFeatureCollection, type GenreImport, type LectureContours, type LectureGeoJSON,
} from '@/lib/reseau/import';
import { formaterLineaire } from '@/lib/reseau/selection';
import type { ResultatImportReseau, SecteurReseau } from '@/lib/reseau/types';
import styles from './Reseau.module.css';

const TAILLE_MAX = 200 * 1024 * 1024;
type Etape = 'contours' | GenreImport;
const ETAPES: [Etape, string][] = [
  ['contours', '1. Contours des secteurs (secteurs.geojson, facultatif)'],
  ['troncons', '2. Tronçons (troncons.geojson)'],
  ['noeuds', '3. Nœuds (noeuds.geojson)'],
];

type Resultat =
  | { genre: GenreImport; r: ResultatImportReseau }
  | { genre: 'contours'; r: { definis: number; erreurs: { code: string; message: string }[] } };

export function OngletReseauImport({ marcheId, secteurs, recharger }: { marcheId: string; secteurs: SecteurReseau[]; recharger: () => Promise<void> }) {
  const [etape, setEtape] = useState<Etape>('contours');
  const [lecture, setLecture] = useState<LectureGeoJSON | null>(null);
  const [contours, setContours] = useState<LectureContours | null>(null);
  const [nomFichier, setNomFichier] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [progression, setProgression] = useState<{ faits: number; total: number } | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  const changerEtape = (e: Etape) => {
    setEtape(e);
    setLecture(null);
    setContours(null);
    setResultat(null);
    setErreur('');
    setNomFichier('');
  };

  async function choisirFichier(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    setResultat(null);
    setErreur('');
    setLecture(null);
    setContours(null);
    setNomFichier(fichier?.name ?? '');
    if (!fichier) return;
    if (fichier.size > TAILLE_MAX) {
      setErreur('Fichier trop volumineux (200 Mo au plus).');
      return;
    }
    try {
      const texte = await fichier.text();
      if (etape === 'contours') setContours(lireContoursSecteurs(texte, secteurs));
      else setLecture(lireFeatureCollection(texte, etape));
    } catch (err) {
      setErreur(`Fichier illisible : ${messageReseau(err)}`);
    }
  }

  // Codes de secteur du fichier (tronçons, nœuds) rapprochés des secteurs du marché.
  const codesMarche = useMemo(() => new Set(secteurs.map((s) => s.code)), [secteurs]);
  const secteursFichier = useMemo(() => {
    if (!lecture) return { reconnus: [] as [string, number][], inconnus: [] as [string, number][], sans: 0 };
    const reconnus: [string, number][] = [];
    const inconnus: [string, number][] = [];
    let sans = 0;
    for (const [code, n] of lecture.resume.secteurs) {
      if (code === '') sans = n;
      else if (codesMarche.has(code)) reconnus.push([code, n]);
      else inconnus.push([code, n]);
    }
    return { reconnus: reconnus.sort(), inconnus: inconnus.sort(), sans };
  }, [lecture, codesMarche]);

  async function lancer(action: () => Promise<Resultat>) {
    setOccupe(true);
    setErreur('');
    setResultat(null);
    try {
      setResultat(await action());
      await recharger();
    } catch (err) {
      setErreur(messageReseau(err));
    } finally {
      setOccupe(false);
      setProgression(null);
    }
  }

  function importerContours() {
    if (!contours?.contours.length) return;
    const n = contours.contours.length;
    if (!window.confirm(`Remplacer le contour de ${n} secteur${n > 1 ? 's' : ''} par celui du fichier ? Les tronçons ne sont pas réaffectés.`)) return;
    lancer(async () => ({ genre: 'contours', r: await importerContoursSecteurs(contours.contours, (faits, total) => setProgression({ faits, total })) }));
  }

  function importer() {
    if (!lecture || !lecture.features.length || etape === 'contours') return;
    const genre = etape;
    const nbPaquets = Math.ceil(lecture.features.length / TAILLE_PAQUET);
    if (!window.confirm(`Importer ${nombre(lecture.features.length, 0)} ${genre === 'troncons' ? 'tronçons' : 'nœuds'} dans ce marché (${nbPaquets} envoi${nbPaquets > 1 ? 's' : ''}) ? Les références déjà présentes sont mises à jour, rien n'est supprimé.`)) return;
    lancer(async () => ({ genre, r: await importerFeatures(genre, marcheId, lecture.features, (faits, total) => setProgression({ faits, total })) }));
  }

  const resume = lecture?.resume;
  const nomGenre = etape === 'troncons' ? 'tronçons' : 'nœuds';
  return (
    <section className="carte">
      <h2>Importer le plan du réseau</h2>
      <p className="discret">
        Fichiers produits par <code>outils/reseau/convertir.py</code> (WGS84). <strong>Ordre conseillé : 1. contours des secteurs,
        2. tronçons, 3. nœuds</strong> : les tronçons sans <code>secteur_code</code> sont zonés par le contour du secteur qui contient
        leur milieu, il vaut mieux que les bons contours soient déjà en place. Une référence déjà présente est mise à jour, jamais
        dupliquée. Les contours importés ne sont pas recalculés après l&apos;import des tronçons (bouton « Recalculer le contour »
        de la carte de zonage, si on le souhaite).
      </p>
      <div className={styles.etapes} role="radiogroup" aria-label="Fichier à importer">
        {ETAPES.map(([e, texte]) => (
          <button key={e} type="button" role="radio" aria-pressed={etape === e} aria-checked={etape === e} disabled={occupe}
            onClick={() => changerEtape(e)}>
            {texte}
          </button>
        ))}
      </div>
      <div className={styles.fichier}>
        <input key={etape} type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={choisirFichier}
          aria-label="Fichier GeoJSON" disabled={occupe} />
        {nomFichier && <span className="discret">{nomFichier}</span>}
      </div>
      {erreur && <p className="erreur">{erreur}</p>}

      {etape === 'contours' && contours && (
        <>
          <div className={styles.resume}>
            <div className={styles.chiffre}><strong>{nombre(contours.total, 0)}</strong><span>contours lus</span></div>
            <div className={styles.chiffre}><strong>{nombre(contours.contours.length, 0)}</strong><span>secteurs reconnus (sur {secteurs.length})</span></div>
            <div className={styles.chiffre}><strong>{nombre(contours.inconnus.length, 0)}</strong><span>codes inconnus du marché</span></div>
            <div className={styles.chiffre}><strong>{nombre(contours.rejetees.length, 0)}</strong><span>contours rejetés</span></div>
          </div>
          <div className={styles.listes}>
            <div>
              <strong>Secteurs reconnus</strong>
              <ul>{contours.contours.map((c) => <li key={c.secteur_id}>{c.code}</li>)}</ul>
            </div>
            {contours.inconnus.length > 0 && (
              <div>
                <strong className={styles['ecart-negatif']}>Codes inconnus (ignorés)</strong>
                <ul>{contours.inconnus.map((c) => <li key={c.index}>{c.code} (contour n° {c.index + 1})</li>)}</ul>
              </div>
            )}
            {contours.rejetees.length > 0 && (
              <div>
                <strong className={styles['ecart-negatif']}>Contours rejetés</strong>
                <ul>{contours.rejetees.map((r) => <li key={r.index}>N° {r.index + 1} : {r.motif}</li>)}</ul>
              </div>
            )}
          </div>
          {progression && (
            <div className={styles.progression} aria-live="polite">
              <progress value={progression.faits} max={progression.total || 1} />
              <span>{nombre(progression.faits, 0)} / {nombre(progression.total, 0)}</span>
            </div>
          )}
          <div className="actions">
            <button className="primaire gros" onClick={importerContours} disabled={occupe || !contours.contours.length}>
              {occupe ? 'Import en cours…' : `Définir le contour de ${nombre(contours.contours.length, 0)} secteur(s)`}
            </button>
          </div>
        </>
      )}

      {etape !== 'contours' && lecture && resume && (
        <>
          <div className={styles.resume}>
            <div className={styles.chiffre}><strong>{nombre(resume.total, 0)}</strong><span>{nomGenre} lus</span></div>
            {etape === 'troncons' && <div className={styles.chiffre}><strong>{formaterLineaire(resume.longueurApprox_m)}</strong><span>linéaire approximatif</span></div>}
            <div className={styles.chiffre}><strong>{nombre(lecture.rejetees.length, 0)}</strong><span>features rejetées</span></div>
            <div className={styles.chiffre}><strong>{nombre(resume.references_doublons, 0)}</strong><span>références en double</span></div>
            <div className={styles.chiffre}><strong>{Math.ceil(resume.total / TAILLE_PAQUET)}</strong><span>paquets de {nombre(TAILLE_PAQUET, 0)}</span></div>
          </div>
          {lecture.rejetees.length > 0 && (
            <ul className="discret">
              {lecture.rejetees.slice(0, 5).map((r) => <li key={r.index}>Feature n° {r.index + 1} : {r.motif}</li>)}
              {lecture.rejetees.length > 5 && <li>… et {lecture.rejetees.length - 5} autre(s)</li>}
            </ul>
          )}
          <div className={styles.listes}>
            <div>
              <strong>Calques</strong>
              <ul>{[...resume.calques.entries()].sort().map(([c, n]) => <li key={c}>{c} · {nombre(n, 0)}</li>)}</ul>
            </div>
            <div>
              <strong>{etape === 'troncons' ? 'Catégories' : 'Types'}</strong>
              <ul>{[...resume.classes.entries()].sort().map(([c, n]) => <li key={c}>{c} · {nombre(n, 0)}</li>)}</ul>
            </div>
            <div>
              <strong>Secteurs reconnus</strong> ({secteursFichier.reconnus.length} sur {secteurs.length} du marché)
              <ul>
                {secteursFichier.reconnus.map(([c, n]) => <li key={c}>{c} · {nombre(n, 0)}</li>)}
                {secteursFichier.sans > 0 && <li>sans secteur · {nombre(secteursFichier.sans, 0)} (zonage par le contour, sinon « non zoné »)</li>}
              </ul>
            </div>
            {secteursFichier.inconnus.length > 0 && (
              <div>
                <strong className={styles['ecart-negatif']}>Codes de secteur inconnus du marché</strong> (ils resteront non zonés)
                <ul>{secteursFichier.inconnus.map(([c, n]) => <li key={c}>{c} · {nombre(n, 0)}</li>)}</ul>
              </div>
            )}
          </div>
          {progression && (
            <div className={styles.progression} aria-live="polite">
              <progress value={progression.faits} max={progression.total || 1} />
              <span>{nombre(progression.faits, 0)} / {nombre(progression.total, 0)}</span>
            </div>
          )}
          <div className="actions">
            <button className="primaire gros" onClick={importer} disabled={occupe || !lecture.features.length}>
              {occupe ? 'Import en cours…' : `Importer ${nombre(lecture.features.length, 0)} ${etape === 'troncons' ? 'tronçon(s)' : 'nœud(s)'}`}
            </button>
          </div>
        </>
      )}

      {resultat?.genre === 'contours' && (
        <p className={resultat.r.erreurs.length ? 'erreur' : 'info'} role="status">
          Contours définis : {nombre(resultat.r.definis, 0)} secteur(s)
          {resultat.r.erreurs.length ? ` ; ${resultat.r.erreurs.length} refusé(s) : ${resultat.r.erreurs.slice(0, 5).map((e) => `${e.code} (${e.message})`).join(' ; ')}` : ''}.
        </p>
      )}
      {resultat && resultat.genre !== 'contours' && (
        <p className="info" role="status">
          Import terminé : {nombre(resultat.r.inseres, 0)} inséré(s), {nombre(resultat.r.mis_a_jour, 0)} mis à jour, {nombre(resultat.r.ignores, 0)} ignoré(s)
          {resultat.r.erreurs.length ? ` ; ${resultat.r.erreurs.length} erreur(s) : ${resultat.r.erreurs.slice(0, 3).map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join(' ; ')}` : ''}.
        </p>
      )}
    </section>
  );
}
