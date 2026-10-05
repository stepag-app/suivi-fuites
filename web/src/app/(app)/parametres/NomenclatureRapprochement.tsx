'use client';

import { useEffect, useMemo, useState } from 'react';
import { LIBELLES_FAMILLES } from '@/lib/nomenclature/csv';
import { lierPieces, messageNomenclature, modifierPiece, type PieceNomenclature } from '@/lib/nomenclature/donnees';
import {
  compterStatuts, rapprocher, rechercherProduits, type Candidat, type ProduitNomenclature, type Proposition, type Statut,
} from '@/lib/nomenclature/rapprochement';
import styles from './Nomenclature.module.css';

type Filtre = Statut | 'rapprochees' | 'hors' | 'desactivees';

const FILTRES: { cle: Filtre; libelle: string; classe: string }[] = [
  { cle: 'sur', libelle: 'Sûres', classe: 'st-achevee' },
  { cle: 'probable', libelle: 'Probables', classe: 'st-encours' },
  { cle: 'aucun', libelle: 'Sans correspondance', classe: 'st-detectee' },
  { cle: 'rapprochees', libelle: 'Rapprochées', classe: 'st-reparee' },
  { cle: 'hors', libelle: 'Hors nomenclature', classe: 'st-sans' },
  { cle: 'desactivees', libelle: 'Désactivées', classe: 'st-sans' },
];
const STATUTS: Record<Statut, { libelle: string; classe: string }> = {
  sur: { libelle: 'Sûr', classe: 'st-achevee' },
  probable: { libelle: 'Probable', classe: 'st-encours' },
  aucun: { libelle: 'Aucun', classe: 'st-detectee' },
};
const PAR_PAGE = 50;

interface Props {
  marcheId: string;
  pieces: PieceNomenclature[];
  produits: ProduitNomenclature[];
  recharger: () => Promise<void>;
}

// Écran de validation : proposition et autres candidats par pièce, validation en lot des propositions sûres.
export function NomenclatureRapprochement({ marcheId, pieces, produits, recharger }: Props) {
  const [filtre, setFiltre] = useState<Filtre>('sur');
  const [ouverte, setOuverte] = useState('');
  const [limite, setLimite] = useState(PAR_PAGE);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  const produitParId = useMemo(() => new Map(produits.map((p) => [p.dolibarr_id, p])), [produits]);
  const pieceParId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  const pris = useMemo(
    () => new Map(pieces.filter((p) => p.produit_dolibarr_id !== null).map((p) => [p.produit_dolibarr_id as number, p.id])),
    [pieces],
  );
  const aTraiter = useMemo(() => pieces.filter((p) => p.actif && p.produit_dolibarr_id === null && !p.hors_nomenclature), [pieces]);
  const propositions = useMemo(() => rapprocher(aTraiter, produits, { pris }), [aTraiter, produits, pris]);
  const nombres = useMemo(() => compterStatuts(propositions), [propositions]);
  const rapprochees = pieces.filter((p) => p.produit_dolibarr_id !== null);
  const hors = pieces.filter((p) => p.hors_nomenclature);
  const desactivees = pieces.filter((p) => !p.actif && p.produit_dolibarr_id === null && !p.hors_nomenclature);
  const compte: Record<Filtre, number> = {
    ...nombres, rapprochees: rapprochees.length, hors: hors.length, desactivees: desactivees.length,
  };
  const sures = propositions.filter((p) => p.statut === 'sur' && p.proposition && !p.doublonDe);

  useEffect(() => {
    setLimite(PAR_PAGE);
    setOuverte('');
    setMessage('');
    setErreur('');
  }, [filtre]);

  async function agir(action: () => Promise<string | void>) {
    setOccupe(true);
    setErreur('');
    setMessage('');
    try {
      const m = await action();
      if (m) setMessage(m);
      await recharger();
    } catch (e) {
      setErreur(messageNomenclature(e));
    } finally {
      setOccupe(false);
    }
  }

  const lier = (pieceId: string, produitId: number | null) => agir(async () => {
    const r = await lierPieces(marcheId, [{ piece_id: pieceId, produit_dolibarr_id: produitId }]);
    if (r.erreurs.length) throw r.erreurs[0];
    setOuverte('');
    return produitId === null ? 'Lien retiré : la pièce reprend sa désignation d\'origine.' : 'Pièce rapprochée : elle porte maintenant la désignation Dolibarr.';
  });

  const validerSures = () => {
    if (!sures.length) return;
    if (!window.confirm(`Valider ${sures.length} rapprochement(s) sûr(s) ? Ces pièces prendront la désignation Dolibarr.`)) return;
    agir(async () => {
      const r = await lierPieces(marcheId, sures.map((s) => ({ piece_id: s.pieceId, produit_dolibarr_id: s.proposition!.produit.dolibarr_id })));
      const details = r.erreurs.slice(0, 3).map((e) => `« ${pieceParId.get(e.piece_id)?.designation ?? '?'} » : ${messageNomenclature(e)}`);
      return `${r.rapprochees} pièce(s) rapprochée(s)${r.erreurs.length ? `, ${r.erreurs.length} refusée(s) : ${details.join(' ; ')}` : ''}.`;
    });
  };

  const modifier = (id: string, valeurs: Parameters<typeof modifierPiece>[1], texte: string) => agir(async () => {
    await modifierPiece(id, valeurs);
    return texte;
  });

  const lignesStatut = propositions.filter((p) => p.statut === filtre);
  const lignesPieces = filtre === 'rapprochees' ? rapprochees : filtre === 'hors' ? hors : filtre === 'desactivees' ? desactivees : [];
  const total = filtre in STATUTS ? lignesStatut.length : lignesPieces.length;

  return (
    <section className="carte">
      <h2>Rapprochement du catalogue</h2>
      <p className="discret">
        Proposition automatique : même type de pièce, mêmes diamètres et filetages, matière compatible. « Sûr » : une seule
        correspondance complète. « Probable » : à vérifier (plusieurs produits possibles, qualificatif absent, produit
        inactif…). Une pièce sans correspondance reste en base pour l&apos;historique : on la désactive ou on la garde
        hors nomenclature.
      </p>
      <div className="pastilles" role="tablist" aria-label="Filtrer les pièces">
        {FILTRES.map((f) => (
          <button key={f.cle} role="tab" aria-selected={filtre === f.cle}
            className={`pastille ${f.classe} ${filtre === f.cle ? 'choisie' : ''}`} onClick={() => setFiltre(f.cle)}>
            {f.libelle} <b>{compte[f.cle]}</b>
          </button>
        ))}
      </div>
      {filtre === 'sur' && (
        <div className={styles.barreLot}>
          <span className="discret">{sures.length} proposition(s) sûre(s) prête(s) à valider.</span>
          <button className="primaire" onClick={validerSures} disabled={occupe || !sures.length}>
            Valider les {sures.length} proposition(s) sûre(s)
          </button>
        </div>
      )}
      {message && <p className="info" role="status">{message}</p>}
      {erreur && <p className="erreur">{erreur}</p>}

      <div className="defilement">
        <table className={`liste-compacte ${styles.tableau}`}>
          <thead>
            <tr>
              <th>Pièce du catalogue</th>
              <th>{filtre in STATUTS ? 'Proposition Dolibarr' : 'Produit Dolibarr'}</th>
              <th>{filtre in STATUTS ? 'Statut' : ''}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtre in STATUTS
              ? lignesStatut.slice(0, limite).map((p, i) => (
                <LigneProposition
                  key={p.pieceId} p={p} piece={pieceParId.get(p.pieceId)} zebre={i % 2 === 1} ouverte={ouverte === p.pieceId}
                  basculer={() => setOuverte(ouverte === p.pieceId ? '' : p.pieceId)} occupe={occupe} produits={produits}
                  pris={pris} pieceParId={pieceParId} lier={lier} modifier={modifier}
                  doublon={p.doublonDe ? pieceParId.get(p.doublonDe)?.designation ?? null : null}
                />
              ))
              : lignesPieces.slice(0, limite).map((piece, i) => (
                <LignePiece key={piece.id} piece={piece} zebre={i % 2 === 1} occupe={occupe}
                  produit={piece.produit_dolibarr_id !== null ? produitParId.get(piece.produit_dolibarr_id) : undefined}
                  lier={lier} modifier={modifier} />
              ))}
            {total === 0 && <tr><td colSpan={4} className="discret">Aucune pièce.</td></tr>}
          </tbody>
        </table>
      </div>
      {total > limite && (
        <div className="actions">
          <button onClick={() => setLimite((l) => l + PAR_PAGE)}>Afficher {Math.min(PAR_PAGE, total - limite)} de plus</button>
        </div>
      )}
    </section>
  );
}

type Lier = (pieceId: string, produitId: number | null) => void;
type Modifier = (id: string, valeurs: { actif?: boolean; hors_nomenclature?: boolean }, texte: string) => void;

function Produit({ produit, extra }: { produit: ProduitNomenclature; extra?: string }) {
  return (
    <>
      {produit.designation} <span className={styles.ref}>{produit.ref}</span>
      <span className={styles.motif}>
        {LIBELLES_FAMILLES[produit.famille] ?? produit.famille}{produit.unite ? ` · ${produit.unite}` : ''}{extra ? ` · ${extra}` : ''}
      </span>
      {!produit.actif && <span className={styles.avertissement}>Inactif dans Dolibarr</span>}
    </>
  );
}

function LigneProposition({
  p, piece, zebre, ouverte, basculer, occupe, produits, pris, pieceParId, lier, modifier, doublon,
}: {
  p: Proposition; piece: PieceNomenclature | undefined; zebre: boolean; ouverte: boolean; basculer: () => void; occupe: boolean;
  produits: ProduitNomenclature[]; pris: Map<number, string>; pieceParId: Map<string, PieceNomenclature>;
  lier: Lier; modifier: Modifier; doublon: string | null;
}) {
  if (!piece) return null;
  const statut = STATUTS[p.statut];
  return (
    <>
      <tr className={`${zebre ? 'zebre' : ''} ${ouverte ? styles.ouverte : ''}`}>
        <td className={styles.piece}>
          {piece.designation}
          {piece.famille && <span className={styles.motif}>{piece.famille} · {piece.unite}</span>}
        </td>
        <td className={styles.produit}>
          {p.proposition ? <Produit produit={p.proposition.produit} /> : <span className="discret">—</span>}
          <span className={styles.motif}>{p.motif}</span>
          {doublon && <span className={styles.avertissement}>Même produit que « {doublon} » : pièce en double ?</span>}
        </td>
        <td className="nowrap">
          <span className={`badge ${statut.classe}`}>{statut.libelle}</span>
          {p.proposition && <span className={styles.score}> {Math.round(Math.max(0, p.proposition.score) * 100)} %</span>}
        </td>
        <td>
          <span className="actions">
            {p.proposition && !doublon && (
              <button className="petit primaire" disabled={occupe} onClick={() => lier(piece.id, p.proposition!.produit.dolibarr_id)}>Accepter</button>
            )}
            <button className="petit" disabled={occupe} onClick={basculer} aria-expanded={ouverte}>{ouverte ? 'Fermer' : 'Autre produit…'}</button>
            <button className="petit" disabled={occupe} onClick={() => modifier(piece.id, { actif: false }, `« ${piece.designation} » désactivée (historique conservé).`)}>
              Aucune : désactiver
            </button>
            <button className="petit" disabled={occupe} onClick={() => modifier(piece.id, { hors_nomenclature: true }, `« ${piece.designation} » gardée hors nomenclature.`)}>
              Aucune : garder
            </button>
          </span>
        </td>
      </tr>
      {ouverte && (
        <tr className={styles.ouverte}>
          <td colSpan={4}>
            <ChoixProduit piece={piece} autres={p.autres} produits={produits} pris={pris} pieceParId={pieceParId} lier={lier} occupe={occupe} />
          </td>
        </tr>
      )}
    </>
  );
}

function ChoixProduit({
  piece, autres, produits, pris, pieceParId, lier, occupe,
}: {
  piece: PieceNomenclature; autres: Candidat[]; produits: ProduitNomenclature[]; pris: Map<number, string>;
  pieceParId: Map<string, PieceNomenclature>; lier: Lier; occupe: boolean;
}) {
  const [recherche, setRecherche] = useState('');
  const trouves = useMemo(() => rechercherProduits(produits, recherche, 20), [produits, recherche]);
  const ligne = (produit: ProduitNomenclature, ecarts: string[] = []) => {
    const titulaire = pris.get(produit.dolibarr_id);
    const dejaPris = titulaire && titulaire !== piece.id ? pieceParId.get(titulaire)?.designation ?? 'une autre pièce' : null;
    return (
      <li key={produit.dolibarr_id}>
        <span className={styles.texte}>
          <Produit produit={produit} />
          {ecarts.length > 0 && <span className={styles.ecart}>{ecarts.join(' · ')}</span>}
          {dejaPris && <span className={styles.avertissement}>Déjà rapproché de « {dejaPris} »</span>}
        </span>
        <button className="petit" disabled={occupe || !!dejaPris} onClick={() => lier(piece.id, produit.dolibarr_id)}>Choisir</button>
      </li>
    );
  };
  return (
    <div className={styles.choix}>
      <h4>Autres candidats pour « {piece.designation} »</h4>
      {autres.length ? <ul className={styles.candidats}>{autres.map((c) => ligne(c.produit, c.ecarts))}</ul> : <p className="discret">Aucun autre candidat.</p>}
      <h4>Rechercher dans la nomenclature</h4>
      <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="ex. collier pec 63 20, ou une référence" aria-label="Rechercher un produit Dolibarr" />
      {recherche.trim() && (trouves.length ? <ul className={styles.candidats}>{trouves.map((p) => ligne(p))}</ul> : <p className="discret">Aucun produit trouvé.</p>)}
    </div>
  );
}

function LignePiece({
  piece, produit, zebre, occupe, lier, modifier,
}: {
  piece: PieceNomenclature; produit: ProduitNomenclature | undefined; zebre: boolean; occupe: boolean; lier: Lier; modifier: Modifier;
}) {
  const libelleDifferent = produit && produit.designation !== piece.designation;
  return (
    <tr className={zebre ? 'zebre' : ''}>
      <td className={styles.piece}>
        {piece.designation}
        {piece.designation_initiale && piece.designation_initiale !== piece.designation && (
          <span className={styles.motif}>Avant : {piece.designation_initiale}</span>
        )}
        {!piece.actif && <span className={styles.motif}>Pièce désactivée</span>}
      </td>
      <td className={styles.produit}>
        {produit ? <Produit produit={produit} /> : <span className="discret">—</span>}
        {libelleDifferent && <span className={styles.avertissement}>Libellé Dolibarr différent (une autre pièce porte déjà ce libellé)</span>}
      </td>
      <td />
      <td>
        <span className="actions">
          {produit && <button className="petit" disabled={occupe} onClick={() => lier(piece.id, null)}>Retirer le lien</button>}
          {piece.hors_nomenclature && (
            <button className="petit" disabled={occupe} onClick={() => modifier(piece.id, { hors_nomenclature: false }, `« ${piece.designation} » remise à rapprocher.`)}>
              Remettre à rapprocher
            </button>
          )}
          <button className="petit" disabled={occupe} onClick={() => modifier(piece.id, { actif: !piece.actif }, `« ${piece.designation} » ${piece.actif ? 'désactivée' : 'réactivée'}.`)}>
            {piece.actif ? 'Désactiver' : 'Réactiver'}
          </button>
        </span>
      </td>
    </tr>
  );
}
