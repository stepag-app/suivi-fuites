'use client';

// Corrections d'une fuite à l'attachement (lot R) : contrôles en défaut, requalification d'une ligne
// de prix (article et quantité, motif obligatoire), ajout d'une ligne, ajout d'une pièce posée
// (marquée « ajoutée au bureau » par la base). Toutes les fournitures sont comprises dans les prix :
// une pièce ajoutée n'est jamais payée à part ; une réparation = une unité par prix.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MATERIAUX, dateHeure, dateSeule, messageErreur, nombre } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getSupabase, lireTout } from '@/lib/supabase';
import { GRAVITES, type Controle } from '../controles';
import styles from '../controles.module.css';
import type { ArticleChoix } from './FormsLignes';

interface RepFuite {
  id: string;
  realisee_le: string;
  resultat: 'en_cours' | 'reparee' | 'non_reparee';
  materiau: string | null;
  diametre_mm: number | null;
  tuyau_repare: boolean;
  robinet_pec_change: boolean;
  collier_pec_change: boolean;
  bouche_a_cle_mise_a_niveau: boolean;
  longueur_pe_m: number | null;
  volume_m3: number | null;
}

interface LigneFuite {
  id: string;
  prix_id: string;
  prix_numero: string;
  prix_designation: string;
  unite: string;
  quantite: number;
  origine_ligne: 'auto' | 'manuel';
  motif_correction: string | null;
  reparation_id: string | null;
}

interface PieceFuite {
  id: string;
  reparation_id: string;
  piece_id: string | null;
  designation_libre: string | null;
  quantite: number;
  ajoutee_bureau: boolean;
  ajoutee_bureau_le: string | null;
}

interface PieceCatalogue { id: string; designation: string; unite: string; actif: boolean }

export interface LotCorrection { id: string; unites: Set<string> }

const cleUnite = (fuiteId: string, prixId: string) => `${fuiteId}|${prixId}`;
const enNombre = (t: string) => Number(t.replace(/\s/g, '').replace(',', '.'));
const nombreValide = (t: string) => t.trim() !== '' && !Number.isNaN(enNombre(t)) && enNombre(t) >= 0;
// Jour d'exécution (AAAA-MM-JJ) à l'heure du Maroc
const jourCasa = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' });
const RESULTATS: Record<RepFuite['resultat'], string> = { reparee: 'réparée', en_cours: 'en cours', non_reparee: 'non réparée' };

function resumeReparation(r: RepFuite): string {
  const travaux = [
    r.tuyau_repare && 'tuyau', r.robinet_pec_change && 'robinet PEC', r.collier_pec_change && 'collier PEC',
    r.bouche_a_cle_mise_a_niveau && 'bouche à clé',
  ].filter(Boolean).join(', ');
  return [
    `${dateSeule(r.realisee_le)} (${RESULTATS[r.resultat]})`,
    [r.materiau ? MATERIAUX[r.materiau] ?? r.materiau : null, r.diametre_mm ? `Ø ${r.diametre_mm} mm` : null].filter(Boolean).join(' '),
    travaux && `travaux : ${travaux}`,
    r.volume_m3 != null && `fouille ${nombre(r.volume_m3, 3)} m³`,
    r.longueur_pe_m != null && `PE ${nombre(r.longueur_pe_m)} m`,
  ].filter(Boolean).join(' · ');
}

export function CorrectionsFuite({
  marcheId, fuiteId, fuiteNumero, controles, articles, lot, fermer, corrige,
}: {
  marcheId: string; fuiteId: string; fuiteNumero: number | null; controles: Controle[]; articles: ArticleChoix[];
  lot?: LotCorrection; fermer: () => void; corrige: () => void;
}) {
  const { peut } = useSession();
  const [reps, setReps] = useState<RepFuite[]>([]);
  const [lignes, setLignes] = useState<LigneFuite[]>([]);
  const [pieces, setPieces] = useState<PieceFuite[]>([]);
  const [catalogue, setCatalogue] = useState<PieceCatalogue[]>([]);
  const [verrouillee, setVerrouillee] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [requalif, setRequalif] = useState<string | null>(null);
  const [formulaire, setFormulaire] = useState<'' | 'ligne' | 'piece'>('');

  const charger = useCallback(async () => {
    const sb = getSupabase();
    try {
      const [f, r, l, c] = await Promise.all([
        sb.from('fuites').select('verrouillee_le').eq('id', fuiteId).maybeSingle(),
        sb.from('reparations').select('id, realisee_le, resultat, materiau, diametre_mm, tuyau_repare, robinet_pec_change, collier_pec_change, bouche_a_cle_mise_a_niveau, longueur_pe_m, volume_m3')
          .eq('fuite_id', fuiteId).is('supprime_le', null).order('realisee_le'),
        sb.from('v_quantites').select('id, prix_id, prix_numero, prix_designation, unite, quantite, origine_ligne, motif_correction, reparation_id')
          .eq('fuite_id', fuiteId).order('prix_ordre').order('id'),
        lireTout<PieceCatalogue>((de, a) => sb.from('catalogue_pieces').select('id, designation, unite, actif')
          .eq('marche_id', marcheId).order('designation').order('id').range(de, a)),
      ]);
      const rs = (r.data as RepFuite[] | null) ?? [];
      const p = rs.length
        ? await sb.from('reparation_pieces').select('id, reparation_id, piece_id, designation_libre, quantite, ajoutee_bureau, ajoutee_bureau_le')
          .in('reparation_id', rs.map((x) => x.id)).is('supprime_le', null).order('cree_le').order('id')
        : { data: [], error: null };
      const premiere = f.error || r.error || l.error || p.error;
      setErreur(premiere ? messageErreur(premiere) : '');
      setVerrouillee(!!(f.data as { verrouillee_le: string | null } | null)?.verrouillee_le);
      setReps(rs);
      setLignes((l.data as LigneFuite[] | null) ?? []);
      setPieces((p.data as PieceFuite[] | null) ?? []);
      setCatalogue(c);
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setChargement(false);
  }, [fuiteId, marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const valider = (type: 'quantites' | 'interventions') => !verrouillee || peut(type, 'valider');
  const peutRequalifier = peut('quantites', 'modifier') && valider('quantites');
  const peutAjouterLigne = peut('quantites', 'creer') && valider('quantites');
  const peutAjouterPiece = peut('interventions', 'creer') && peut('interventions', 'modifier') && valider('interventions') && reps.length > 0;
  const repDefaut = [...reps].reverse().find((r) => r.resultat === 'reparee') ?? reps[reps.length - 1];
  const nomPiece = (p: PieceFuite) => catalogue.find((c) => c.id === p.piece_id)?.designation ?? p.designation_libre ?? '?';
  const unitePiece = (p: PieceFuite) => catalogue.find((c) => c.id === p.piece_id)?.unite ?? 'u';
  const lignesIncoherentes = new Set(controles.filter((c) => c.ligne_id).map((c) => c.ligne_id as string));

  async function agir(action: () => Promise<string>): Promise<boolean> {
    setErreur('');
    setInfo('');
    setOccupe(true);
    try {
      setInfo(await action());
      setRequalif(null);
      setFormulaire('');
      await charger();
      corrige();
      return true;
    } catch (e) {
      setErreur(messageErreur(e));
      return false;
    } finally {
      setOccupe(false);
    }
  }

  // Dans un lot brouillon : le nouvel article d'une unité déjà au lot y entre aussi.
  async function ajouterAuLot(prixId: string, ancienPrix?: string): Promise<string> {
    if (!lot || lot.unites.has(cleUnite(fuiteId, prixId))) return '';
    if (ancienPrix && !lot.unites.has(cleUnite(fuiteId, ancienPrix))) return '';
    const { error } = await getSupabase().from('attachement_lignes').insert({
      marche_id: marcheId, attachement_id: lot.id, nature: 'solde', fuite_id: fuiteId, prix_id: prixId,
    });
    return error ? ` Article non ajouté au lot : ${messageErreur(error)}` : ' Article ajouté au lot.';
  }

  const requalifier = (ligne: LigneFuite, prixId: string, quantite: number, motif: string) => agir(async () => {
    const { data, error } = await getSupabase().from('lignes_quantites')
      .update({ prix_id: prixId, quantite, motif_modification: motif }).eq('id', ligne.id).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Modification non autorisée pour votre compte.');
    const lotTexte = prixId !== ligne.prix_id ? await ajouterAuLot(prixId, ligne.prix_id) : '';
    return `Ligne requalifiée, motif gardé dans le journal.${lotTexte}`;
  });

  const ajouterLigne = (prixId: string, quantite: number, reparationId: string, motif: string) => agir(async () => {
    const rep = reps.find((r) => r.id === reparationId);
    const { error } = await getSupabase().from('lignes_quantites').insert({
      marche_id: marcheId, fuite_id: fuiteId, reparation_id: rep?.id ?? null, prix_id: prixId, quantite,
      date_execution: jourCasa(rep?.realisee_le ?? new Date().toISOString()), motif_modification: motif,
    });
    if (error) throw error;
    return `Ligne ajoutée, motif gardé dans le journal.${await ajouterAuLot(prixId)}`;
  });

  const ajouterPiece = (reparationId: string, pieceId: string, quantite: number) => agir(async () => {
    const { error } = await getSupabase().from('reparation_pieces').insert({
      marche_id: marcheId, reparation_id: reparationId, piece_id: pieceId, quantite,
    });
    if (error) throw error;
    return 'Pièce ajoutée (marquée « ajoutée au bureau » si elle ne vient pas du réparateur).';
  });

  return (
    <div className={styles.panneau}>
      <div className={styles.tete}>
        <strong>Fuite N° {fuiteNumero} : contrôles et corrections</strong>
        <button type="button" className="petit" onClick={fermer}>Fermer</button>
      </div>
      {controles.length > 0 ? (
        <ul className={styles.listeControles}>
          {controles.map((c, i) => (
            <li key={`${c.controle}-${c.reparation_id ?? ''}-${c.ligne_id ?? ''}-${i}`} className={styles[c.gravite]}>
              <b>{GRAVITES[c.gravite]?.libelle ?? c.gravite} · {c.libelle}</b>
              {c.detail && <span> : {c.detail}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="discret">Aucun contrôle en défaut.</p>
      )}
      {erreur && <p className="erreur">{erreur}</p>}
      {info && <p className="info">{info}</p>}
      {verrouillee && (!valider('quantites') || !valider('interventions')) && (
        <p className="carte attention">Fuite verrouillée (lot arrêté) : seules les personnes autorisées à valider peuvent encore la corriger.</p>
      )}
      {chargement ? <p className="discret">Chargement…</p> : (
        <div className={styles.colonnes}>
          <section>
            <h4>Réparations</h4>
            {reps.length === 0 && <p className="discret">Aucune réparation saisie.</p>}
            <ul className="simple">
              {reps.map((r) => <li key={r.id} className="discret">{resumeReparation(r)}</li>)}
            </ul>
            <h4>Lignes de prix</h4>
            {lignes.length === 0 && <p className="discret">Aucune ligne de prix.</p>}
            {lignes.length > 0 && (
              <table className={styles.tableau}>
                <thead><tr><th>Prix</th><th>Désignation</th><th>Qté</th><th>Origine</th><th aria-label="Action" /></tr></thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.id}>
                      <td className="nowrap">
                        P{l.prix_numero}
                        {lignesIncoherentes.has(l.id) && <span className={`${styles.puce} ${styles.alerte}`} title="Ligne incohérente sans motif">!</span>}
                      </td>
                      <td><span className="designation" title={l.prix_designation}>{l.prix_designation}</span></td>
                      <td className="nowrap">{nombre(l.quantite, 3)} {l.unite}</td>
                      <td>
                        {l.origine_ligne === 'manuel' ? 'manuelle' : 'automatique'}
                        {l.motif_correction && <span className={styles.motif}>« {l.motif_correction} »</span>}
                      </td>
                      <td className="nowrap">
                        {peutRequalifier && requalif !== l.id && (
                          <button type="button" className="petit" disabled={occupe} onClick={() => { setRequalif(l.id); setFormulaire(''); }}>Requalifier</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {requalif && lignes.find((l) => l.id === requalif) && (
              <FormRequalifier
                ligne={lignes.find((l) => l.id === requalif)!} articles={articles} occupe={occupe}
                envoyer={requalifier} annuler={() => setRequalif(null)}
              />
            )}
            {peutAjouterLigne && formulaire !== 'ligne' && (
              <div className="actions">
                <button type="button" className="petit" disabled={occupe} onClick={() => { setFormulaire('ligne'); setRequalif(null); }}>+ Ajouter une ligne</button>
              </div>
            )}
            {formulaire === 'ligne' && (
              <FormAjoutLigne articles={articles} reps={reps} repDefaut={repDefaut?.id ?? ''} occupe={occupe}
                envoyer={ajouterLigne} annuler={() => setFormulaire('')} />
            )}
          </section>
          <section>
            <h4>Pièces posées</h4>
            {pieces.length === 0 && <p className="discret">Aucune pièce déclarée.</p>}
            <ul className="simple">
              {pieces.map((p) => (
                <li key={p.id}>
                  {nomPiece(p)} × {nombre(p.quantite)} {unitePiece(p)}
                  {p.ajoutee_bureau
                    ? <span className={styles.bureau} title={`Ajoutée le ${dateHeure(p.ajoutee_bureau_le)}`}>ajoutée au bureau</span>
                    : <span className={styles.terrain}>déclarée sur le terrain</span>}
                </li>
              ))}
            </ul>
            {peutAjouterPiece && formulaire !== 'piece' && (
              <div className="actions">
                <button type="button" className="petit" disabled={occupe} onClick={() => { setFormulaire('piece'); setRequalif(null); }}>+ Ajouter une pièce</button>
              </div>
            )}
            {formulaire === 'piece' && (
              <FormAjoutPiece catalogue={catalogue.filter((c) => c.actif)} reps={reps} repDefaut={repDefaut?.id ?? ''} occupe={occupe}
                envoyer={ajouterPiece} annuler={() => setFormulaire('')} />
            )}
          </section>
        </div>
      )}
      <p className={styles.rappel}>
        Fournitures comprises dans les prix de réparation : une pièce ajoutée n&apos;est jamais payée à part. Une réparation = une
        unité par prix (deux joints = un seul prix). Chaque correction exige un motif, gardé dans le journal.
      </p>
    </div>
  );
}

function ChoixArticle({ articles, valeur, maj }: { articles: ArticleChoix[]; valeur: string; maj: (v: string) => void }) {
  return (
    <label>
      Article
      <select value={valeur} onChange={(e) => maj(e.target.value)} required>
        <option value="">—</option>
        {articles.filter((a) => a.actif || a.id === valeur).map((a) => (
          <option key={a.id} value={a.id}>Prix {a.numero} ({a.unite}) · {a.designation.slice(0, 60)}</option>
        ))}
      </select>
    </label>
  );
}

function ChoixReparation({ reps, valeur, maj }: { reps: RepFuite[]; valeur: string; maj: (v: string) => void }) {
  if (reps.length <= 1) return null;
  return (
    <label>
      Réparation
      <select value={valeur} onChange={(e) => maj(e.target.value)} required>
        {reps.map((r) => <option key={r.id} value={r.id}>{dateSeule(r.realisee_le)} ({RESULTATS[r.resultat]})</option>)}
      </select>
    </label>
  );
}

function ChampMotif({ valeur, maj }: { valeur: string; maj: (v: string) => void }) {
  return (
    <label>
      Motif (obligatoire, gardé dans le journal)
      <input value={valeur} onChange={(e) => maj(e.target.value)} required placeholder="Ex. constat contradictoire du 05/10 : DE 40" />
    </label>
  );
}

function FormRequalifier({
  ligne, articles, occupe, envoyer, annuler,
}: {
  ligne: LigneFuite; articles: ArticleChoix[]; occupe: boolean;
  envoyer: (ligne: LigneFuite, prixId: string, quantite: number, motif: string) => Promise<boolean>; annuler: () => void;
}) {
  const [prixId, setPrixId] = useState(ligne.prix_id);
  const [qte, setQte] = useState(String(ligne.quantite).replace('.', ','));
  const [motif, setMotif] = useState('');
  const change = prixId !== ligne.prix_id || enNombre(qte) !== Number(ligne.quantite);
  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    envoyer(ligne, prixId, enNombre(qte), motif.trim());
  };
  return (
    <form onSubmit={soumettre} className={styles.formulaire}>
      <strong>Requalifier la ligne P{ligne.prix_numero}</strong>
      <div className="deux">
        <ChoixArticle articles={articles} valeur={prixId} maj={setPrixId} />
        <label>Quantité<input value={qte} onChange={(e) => setQte(e.target.value)} inputMode="decimal" required /></label>
      </div>
      <ChampMotif valeur={motif} maj={setMotif} />
      <div className="actions">
        <button className="primaire" disabled={occupe || !prixId || !nombreValide(qte) || !motif.trim() || !change}>Requalifier</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}

function FormAjoutLigne({
  articles, reps, repDefaut, occupe, envoyer, annuler,
}: {
  articles: ArticleChoix[]; reps: RepFuite[]; repDefaut: string; occupe: boolean;
  envoyer: (prixId: string, quantite: number, reparationId: string, motif: string) => Promise<boolean>; annuler: () => void;
}) {
  const [prixId, setPrixId] = useState('');
  const [qte, setQte] = useState('1');
  const [repId, setRepId] = useState(repDefaut);
  const [motif, setMotif] = useState('');
  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    envoyer(prixId, enNombre(qte), repId, motif.trim());
  };
  return (
    <form onSubmit={soumettre} className={styles.formulaire}>
      <strong>Ajouter une ligne de prix</strong>
      <div className="deux">
        <ChoixArticle articles={articles} valeur={prixId} maj={setPrixId} />
        <label>Quantité<input value={qte} onChange={(e) => setQte(e.target.value)} inputMode="decimal" required /></label>
      </div>
      <ChoixReparation reps={reps} valeur={repId} maj={setRepId} />
      <ChampMotif valeur={motif} maj={setMotif} />
      <div className="actions">
        <button className="primaire" disabled={occupe || !prixId || !nombreValide(qte) || enNombre(qte) <= 0 || !motif.trim()}>Ajouter la ligne</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}

function FormAjoutPiece({
  catalogue, reps, repDefaut, occupe, envoyer, annuler,
}: {
  catalogue: PieceCatalogue[]; reps: RepFuite[]; repDefaut: string; occupe: boolean;
  envoyer: (reparationId: string, pieceId: string, quantite: number) => Promise<boolean>; annuler: () => void;
}) {
  const [texte, setTexte] = useState('');
  const [qte, setQte] = useState('1');
  const [repId, setRepId] = useState(repDefaut);
  const piece = catalogue.find((c) => c.designation.toLowerCase() === texte.trim().toLowerCase());
  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    if (piece) envoyer(repId, piece.id, enNombre(qte));
  };
  const idListe = `catalogue-${repDefaut}`;
  return (
    <form onSubmit={soumettre} className={styles.formulaire}>
      <strong>Ajouter une pièce posée</strong>
      <div className="deux">
        <label>
          Pièce du catalogue
          <input value={texte} onChange={(e) => setTexte(e.target.value)} list={idListe} required placeholder="Rechercher…" />
          <datalist id={idListe}>
            {catalogue.map((c) => <option key={c.id} value={c.designation} />)}
          </datalist>
        </label>
        <label>Quantité{piece ? ` (${piece.unite})` : ''}<input value={qte} onChange={(e) => setQte(e.target.value)} inputMode="decimal" required /></label>
      </div>
      <ChoixReparation reps={reps} valeur={repId} maj={setRepId} />
      {texte.trim() && !piece && <p className="discret">Choisissez une pièce de la liste (catalogue du marché).</p>}
      <div className="actions">
        <button className="primaire" disabled={occupe || !piece || !repId || !nombreValide(qte) || enNombre(qte) <= 0}>Ajouter la pièce</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}
