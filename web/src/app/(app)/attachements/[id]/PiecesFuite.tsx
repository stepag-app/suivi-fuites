'use client';

// Pièces posées d'une fuite dans l'écran « Corriger » (lot R) : l'inventaire doit refléter le réel du
// terrain. Le bureau corrige selon son intention, avec un motif obligatoire (contrôlé en base) :
// remplacer une pièce erronée, ajouter un oubli, retirer une pièce non posée. La saisie d'origine du
// réparateur reste visible, barrée « remplacée » ou « retirée ». Une pièce ne change jamais le prix.
import { useState, type FormEvent } from 'react';
import { dateHeure, dateSeule, nombre } from '@/lib/format';
import { getSupabase } from '@/lib/supabase';
import {
  ETATS_PIECE, PHRASE_PIECE_AJOUTEE, decrirePieces, libelleProvenance, motifValide,
  type PieceAffichee, type PieceLue,
} from '../controles';
import styles from '../controles.module.css';

export interface RepPieces {
  id: string;
  realisee_le: string;
  auteur_terrain_id: string | null;
  saisi_par: string | null;
}

/** Article Dolibarr ; `actif` : proposé à la saisie (activé et toujours dans Dolibarr). */
export interface PieceCatalogue { id: number; designation: string; unite: string | null; actif: boolean }

type Formulaire = { type: 'oubli' } | { type: 'remplacer'; piece: PieceLue } | { type: 'retirer'; piece: PieceLue } | null;

const enNombre = (t: string) => Number(t.replace(/\s/g, '').replace(',', '.'));
const quantiteValide = (t: string) => t.trim() !== '' && !Number.isNaN(enNombre(t)) && enNombre(t) > 0;

export function PiecesFuite({
  marcheId, reps, pieces, catalogue, utilisateurId, peutAjouter, peutRetirer, occupe, agir,
}: {
  marcheId: string; reps: RepPieces[]; pieces: PieceLue[]; catalogue: PieceCatalogue[]; utilisateurId: string | undefined;
  peutAjouter: boolean; peutRetirer: boolean; occupe: boolean; agir: (action: () => Promise<string>) => Promise<boolean>;
}) {
  const [formulaire, setFormulaire] = useState<Formulaire>(null);
  const repDefaut = reps[reps.length - 1]?.id ?? '';
  const nomPiece = (p: Pick<PieceLue, 'produit_id' | 'designation_libre'>) =>
    catalogue.find((c) => c.id === p.produit_id)?.designation ?? p.designation_libre ?? '?';
  const unitePiece = (p: Pick<PieceLue, 'produit_id'>) => catalogue.find((c) => c.id === p.produit_id)?.unite || 'u';
  const affichees = decrirePieces(pieces, (p) => `${nomPiece(p)} : ${nombre(p.quantite)} ${unitePiece(p)}`);
  const lues = new Map(pieces.map((p) => [p.id, p]));
  const dateRep = new Map(reps.map((r) => [r.id, dateSeule(r.realisee_le)]));
  // L'auteur de la réparation (réparateur, ou compte qui l'a saisie) reste « terrain » ; tout autre compte corrige.
  const estAuteur = (reparationId: string) => {
    const r = reps.find((x) => x.id === reparationId);
    return !!utilisateurId && !!r && (r.auteur_terrain_id === utilisateurId || r.saisi_par === utilisateurId);
  };
  const fermer = () => setFormulaire(null);
  const envoyer = (action: () => Promise<string>) => agir(action).then((ok) => {
    if (ok) fermer();
    return ok;
  });

  const ajouterOubli = (reparationId: string, pieceId: number, quantite: number, motif: string) => envoyer(async () => {
    const { error } = await getSupabase().from('reparation_pieces').insert({
      marche_id: marcheId, reparation_id: reparationId, produit_id: pieceId, quantite, motif_modification: motif,
    });
    if (error) throw error;
    return estAuteur(reparationId)
      ? 'Pièce ajoutée (vous êtes l\'auteur de la réparation : déclarée sur le terrain).'
      : 'Oubli ajouté à l\'inventaire réel, motif gardé.';
  });

  const remplacer = (ancienne: PieceLue, pieceId: number, quantite: number, motif: string) => envoyer(async () => {
    const { error } = await getSupabase().from('reparation_pieces').insert({
      marche_id: marcheId, reparation_id: ancienne.reparation_id, produit_id: pieceId, quantite,
      remplace_piece_id: ancienne.id, motif_modification: motif,
    });
    if (error) throw error;
    return 'Pièce remplacée : la saisie d\'origine reste visible, barrée « remplacée ».';
  });

  const retirer = (piece: PieceLue, motif: string) => envoyer(async () => {
    const { data, error } = await getSupabase().from('reparation_pieces')
      .update({ etat: 'retiree', motif_modification: motif }).eq('id', piece.id).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Retrait non autorisé pour votre compte.');
    return 'Pièce retirée de l\'inventaire réel : elle reste visible, barrée « retirée ».';
  });

  const libelleEtat = (p: PieceAffichee) => (p.etat === 'posee' ? null : (
    <span className={styles.horsInventaire} title={p.le ? `Le ${dateHeure(p.le)}` : undefined}>{ETATS_PIECE[p.etat]}</span>
  ));

  return (
    <section>
      <h4>Pièces posées</h4>
      <p className={styles.consigne}>{PHRASE_PIECE_AJOUTEE}</p>
      {affichees.length === 0 && <p className="discret">Aucune pièce déclarée.</p>}
      <ul className={styles.pieces}>
        {affichees.map((p) => {
          const lue = lues.get(p.id);
          return (
            <li key={p.id} className={p.etat === 'posee' ? undefined : styles.pieceHors}>
              {reps.length > 1 && <span className="discret">{dateRep.get(p.reparation_id)} · </span>}
              <span className={p.etat === 'posee' ? undefined : styles.barre}>{p.texte}</span>
              {p.provenance === 'correction'
                ? <span className={styles.bureau}>{libelleProvenance(p.provenance, p.nature)}</span>
                : <span className={styles.terrain}>{libelleProvenance(p.provenance, p.nature)}</span>}
              {libelleEtat(p)}
              {p.remplace && <span className={styles.motif}>remplace : {p.remplace}</span>}
              {p.remplaceePar && <span className={styles.motif}>remplacée par : {p.remplaceePar}</span>}
              {p.motif && <span className={styles.motif}>« {p.motif} »</span>}
              {lue && p.etat === 'posee' && (peutAjouter || peutRetirer) && (
                <span className={styles.actionsPiece}>
                  {peutAjouter && (
                    <button type="button" className="petit" disabled={occupe} onClick={() => setFormulaire({ type: 'remplacer', piece: lue })}>Remplacer</button>
                  )}
                  {peutRetirer && (
                    <button type="button" className="petit" disabled={occupe} onClick={() => setFormulaire({ type: 'retirer', piece: lue })}>Retirer</button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {formulaire?.type === 'remplacer' && (
        <FormRemplacer
          key={formulaire.piece.id} piece={formulaire.piece} nom={nomPiece(formulaire.piece)} catalogue={catalogue.filter((c) => c.actif)}
          auteur={estAuteur(formulaire.piece.reparation_id)} occupe={occupe} envoyer={remplacer} annuler={fermer}
        />
      )}
      {formulaire?.type === 'retirer' && (
        <FormRetirer
          key={formulaire.piece.id} texte={`${nomPiece(formulaire.piece)} : ${nombre(formulaire.piece.quantite)} ${unitePiece(formulaire.piece)}`}
          occupe={occupe} envoyer={(motif) => retirer(formulaire.piece, motif)} annuler={fermer}
        />
      )}
      {formulaire?.type === 'oubli' && (
        <FormOubli
          catalogue={catalogue.filter((c) => c.actif)} reps={reps} repDefaut={repDefaut} estAuteur={estAuteur} occupe={occupe}
          envoyer={ajouterOubli} annuler={fermer}
        />
      )}
      {peutAjouter && reps.length > 0 && formulaire?.type !== 'oubli' && (
        <div className="actions">
          <button type="button" className="petit" disabled={occupe} onClick={() => setFormulaire({ type: 'oubli' })}>+ Ajouter un oubli</button>
        </div>
      )}
    </section>
  );
}

function ChampMotif({ valeur, maj, exemple }: { valeur: string; maj: (v: string) => void; exemple: string }) {
  return (
    <label>
      Motif (obligatoire, gardé dans le journal)
      <input value={valeur} onChange={(e) => maj(e.target.value)} required placeholder={exemple} />
    </label>
  );
}

function ChoixPiece({ catalogue, texte, maj, idListe }: { catalogue: PieceCatalogue[]; texte: string; maj: (v: string) => void; idListe: string }) {
  return (
    <label>
      Article
      <input value={texte} onChange={(e) => maj(e.target.value)} list={idListe} required placeholder="Rechercher…" />
      <datalist id={idListe}>
        {catalogue.map((c) => <option key={c.id} value={c.designation} />)}
      </datalist>
    </label>
  );
}

const trouver = (catalogue: PieceCatalogue[], texte: string) =>
  catalogue.find((c) => c.designation.toLowerCase() === texte.trim().toLowerCase());

const NoteAuteur = ({ auteur }: { auteur: boolean }) => (auteur
  ? <p className="discret">Vous êtes l&apos;auteur de cette réparation : la pièce comptera comme déclarée sur le terrain.</p>
  : null);

function FormRemplacer({
  piece, nom, catalogue, auteur, occupe, envoyer, annuler,
}: {
  piece: PieceLue; nom: string; catalogue: PieceCatalogue[]; auteur: boolean; occupe: boolean;
  envoyer: (ancienne: PieceLue, pieceId: number, quantite: number, motif: string) => Promise<boolean>; annuler: () => void;
}) {
  const [texte, setTexte] = useState(catalogue.some((c) => c.id === piece.produit_id) ? nom : '');
  const [qte, setQte] = useState(String(piece.quantite).replace('.', ','));
  const [motif, setMotif] = useState('');
  const choisie = trouver(catalogue, texte);
  const change = !!choisie && (choisie.id !== piece.produit_id || enNombre(qte) !== Number(piece.quantite));
  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    if (choisie) envoyer(piece, choisie.id, enNombre(qte), motif.trim());
  };
  return (
    <form onSubmit={soumettre} className={styles.formulaire}>
      <strong>Remplacer une pièce erronée : {nom} × {nombre(piece.quantite)}</strong>
      <p className="discret">La pièce saisie reste visible, barrée « remplacée » ; la nouvelle compte dans l&apos;inventaire réel.</p>
      <div className="deux">
        <ChoixPiece catalogue={catalogue} texte={texte} maj={setTexte} idListe={`remplacer-${piece.id}`} />
        <label>Quantité{choisie ? ` (${choisie.unite || 'u'})` : ''}<input value={qte} onChange={(e) => setQte(e.target.value)} inputMode="decimal" required /></label>
      </div>
      {texte.trim() && !choisie && <p className="discret">Choisissez un article de la liste (articles activés, Paramètres &gt; Articles).</p>}
      <ChampMotif valeur={motif} maj={setMotif} exemple="Ex. un seul manchon posé (constat du 05/10)" />
      <NoteAuteur auteur={auteur} />
      <div className="actions">
        <button className="primaire" disabled={occupe || !change || !quantiteValide(qte) || !motifValide(motif)}>Remplacer</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}

function FormRetirer({
  texte, occupe, envoyer, annuler,
}: { texte: string; occupe: boolean; envoyer: (motif: string) => Promise<boolean>; annuler: () => void }) {
  const [motif, setMotif] = useState('');
  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    envoyer(motif.trim());
  };
  return (
    <form onSubmit={soumettre} className={styles.formulaire}>
      <strong>Retirer une pièce non posée : {texte}</strong>
      <p className="discret">Erreur de saisie : la pièce reste visible, barrée « retirée », hors inventaire réel (jamais supprimée).</p>
      <ChampMotif valeur={motif} maj={setMotif} exemple="Ex. pièce non posée, saisie en double" />
      <div className="actions">
        <button className="primaire" disabled={occupe || !motifValide(motif)}>Retirer</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}

function FormOubli({
  catalogue, reps, repDefaut, estAuteur, occupe, envoyer, annuler,
}: {
  catalogue: PieceCatalogue[]; reps: RepPieces[]; repDefaut: string; estAuteur: (reparationId: string) => boolean; occupe: boolean;
  envoyer: (reparationId: string, pieceId: number, quantite: number, motif: string) => Promise<boolean>; annuler: () => void;
}) {
  const [texte, setTexte] = useState('');
  const [qte, setQte] = useState('1');
  const [repId, setRepId] = useState(repDefaut);
  const [motif, setMotif] = useState('');
  const piece = trouver(catalogue, texte);
  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    if (piece) envoyer(repId, piece.id, enNombre(qte), motif.trim());
  };
  return (
    <form onSubmit={soumettre} className={styles.formulaire}>
      <strong>Ajouter un oubli (pièce posée, non déclarée)</strong>
      <div className="deux">
        <ChoixPiece catalogue={catalogue} texte={texte} maj={setTexte} idListe={`oubli-${repDefaut}`} />
        <label>Quantité{piece ? ` (${piece.unite || 'u'})` : ''}<input value={qte} onChange={(e) => setQte(e.target.value)} inputMode="decimal" required /></label>
      </div>
      {reps.length > 1 && (
        <label>
          Réparation
          <select value={repId} onChange={(e) => setRepId(e.target.value)} required>
            {reps.map((r) => <option key={r.id} value={r.id}>{dateSeule(r.realisee_le)}</option>)}
          </select>
        </label>
      )}
      {texte.trim() && !piece && <p className="discret">Choisissez un article de la liste (articles activés, Paramètres &gt; Articles).</p>}
      <ChampMotif valeur={motif} maj={setMotif} exemple="Ex. robinet PEC posé, visible sur la photo du 05/10" />
      <NoteAuteur auteur={estAuteur(repId)} />
      <div className="actions">
        <button className="primaire" disabled={occupe || !piece || !repId || !quantiteValide(qte) || !motifValide(motif)}>Ajouter l&apos;oubli</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}
