'use client';

// Formulaires de saisie de la fiche (en ligne seulement) : réparation et réfection.
import { useState, type FormEvent } from 'react';
import { EMPLACEMENTS, MATERIAUX, OUVRAGES, libellesMarche, localVersIso, messageErreur, nombre } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import type { Motif, Nature, Piece, Profil } from '@/lib/types';

const nombreOuNul = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.')));

export function FormReparation({
  marcheId, fuiteId, natures, motifs, pieces, profils, avance, onFini, onAnnuler,
}: {
  marcheId: string; fuiteId: string; natures: Nature[]; motifs: Motif[]; pieces: Piece[]; profils: Profil[];
  avance: boolean; onFini: () => void; onAnnuler: () => void;
}) {
  const libelles = libellesMarche(useSession().marche);
  const [resultat, setResultat] = useState<'reparee' | 'en_cours' | 'non_reparee'>('reparee');
  const [motifId, setMotifId] = useState('');
  const [ouvrage, setOuvrage] = useState('');
  const [materiau, setMateriau] = useState('');
  const [diametre, setDiametre] = useState('');
  const [tuyau, setTuyau] = useState(false);
  const [robinet, setRobinet] = useState(false);
  const [collier, setCollier] = useState(false);
  const [boucheACle, setBoucheACle] = useState(false);
  const [elementRemplace, setElementRemplace] = useState(false);
  const [longueurPe, setLongueurPe] = useState('');
  const [fL, setFL] = useState('');
  const [fl, setFl] = useState('');
  const [fP, setFP] = useState('');
  const [natureId, setNatureId] = useState('');
  const [emplacement, setEmplacement] = useState('');
  const [representant, setRepresentant] = useState('');
  const [observation, setObservation] = useState('');
  const [lignes, setLignes] = useState<{ produit_id: number; designation: string; quantite: number }[]>([]);
  const [pieceTexte, setPieceTexte] = useState('');
  const [pieceQte, setPieceQte] = useState('1');
  const [saisiPour, setSaisiPour] = useState('');
  const [source, setSource] = useState('tablette');
  const [date, setDate] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');

  const volume = (() => {
    const [a, b, c] = [nombreOuNul(fL), nombreOuNul(fl), nombreOuNul(fP)];
    return a != null && b != null && c != null ? a * b * c : null;
  })();

  function choisirNature(nid: string) {
    setNatureId(nid);
    const n = natures.find((x) => x.id === nid);
    if (n && n.emplacement !== 'autre') setEmplacement(n.emplacement);
  }

  function ajouterPiece() {
    const texte = pieceTexte.trim();
    const q = nombreOuNul(pieceQte);
    if (!texte || !q || q <= 0) return;
    const piece = pieces.find((p) => p.designation.toLowerCase() === texte.toLowerCase());
    if (!piece) {
      setErreur(`« ${texte} » n'est pas dans la liste des articles. Choisissez un article proposé ; s'il manque, demandez sa création dans Dolibarr (il sera proposé après le prochain import).`);
      return;
    }
    setErreur('');
    setLignes([...lignes, { produit_id: piece.id, designation: piece.designation, quantite: q }]);
    setPieceTexte('');
    setPieceQte('1');
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setErreur('');
    setOccupe(true);
    try {
      const sb = getSupabase();
      const ligne: Record<string, unknown> = {
        marche_id: marcheId,
        fuite_id: fuiteId,
        resultat,
        motif_id: resultat === 'non_reparee' ? motifId || null : null,
        ouvrage: ouvrage || null,
        materiau: materiau || null,
        diametre_mm: nombreOuNul(diametre),
        tuyau_repare: tuyau,
        robinet_pec_change: robinet,
        collier_pec_change: collier,
        bouche_a_cle_mise_a_niveau: boucheACle,
        element_remplace: elementRemplace,
        longueur_pe_m: nombreOuNul(longueurPe),
        fouille_longueur_m: nombreOuNul(fL),
        fouille_largeur_m: nombreOuNul(fl),
        fouille_profondeur_m: nombreOuNul(fP),
        emplacement: emplacement || null,
        nature_revetement_id: natureId || null,
        representant_srm: representant.trim() || null,
        observation: observation.trim() || null,
        source_saisie: source,
      };
      if (saisiPour) ligne.auteur_terrain_id = saisiPour;
      const quand = localVersIso(date);
      if (quand) ligne.realisee_le = quand;
      const id = crypto.randomUUID();
      ligne.id = id;
      const { error } = await sb.from('reparations').insert(ligne);
      if (error) throw error;
      if (lignes.length) {
        const rp = await sb.from('reparation_pieces').insert(
          lignes.map((l) => ({
            marche_id: marcheId, reparation_id: id, produit_id: l.produit_id, quantite: l.quantite,
          })),
        );
        if (rp.error) throw rp.error;
      }
      onFini();
    } catch (err) {
      setErreur(messageErreur(err));
      setOccupe(false);
    }
  }

  const motifsRep = motifs.filter((m) => m.categorie === 'sans_reparation');

  return (
    <form onSubmit={enregistrer} className="sous-formulaire">
      <h3>Nouvelle réparation</h3>
      <label>
        Résultat
        <select value={resultat} onChange={(e) => setResultat(e.target.value as typeof resultat)}>
          <option value="reparee">Réparée</option>
          <option value="en_cours">En cours / reste à finir</option>
          <option value="non_reparee">Non réparée (sondage négatif, refus…)</option>
        </select>
      </label>
      {resultat === 'non_reparee' && (
        <label>
          Motif (obligatoire)
          <select value={motifId} onChange={(e) => setMotifId(e.target.value)} required>
            <option value="">— Choisir —</option>
            {motifsRep.map((m) => (<option key={m.id} value={m.id}>{m.libelle_fr}</option>))}
          </select>
        </label>
      )}

      <div className="deux">
        <label>
          Ouvrage
          <select value={ouvrage} onChange={(e) => setOuvrage(e.target.value)}>
            <option value="">—</option>
            {Object.entries(OUVRAGES).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
          </select>
        </label>
        <label>
          Matériau
          <select value={materiau} onChange={(e) => setMateriau(e.target.value)}>
            <option value="">—</option>
            {Object.entries(MATERIAUX).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
          </select>
        </label>
      </div>
      <label>
        Diamètre (mm) : DE pour le PE, DN pour les conduites
        <input value={diametre} onChange={(e) => setDiametre(e.target.value)} inputMode="numeric" />
      </label>

      {resultat !== 'non_reparee' && (
        <>
          <fieldset>
            <legend>Travaux réalisés</legend>
            <label className="ligne"><input type="checkbox" checked={tuyau} onChange={(e) => setTuyau(e.target.checked)} /> Tuyau / conduite réparé(e)</label>
            <label className="ligne"><input type="checkbox" checked={robinet} onChange={(e) => setRobinet(e.target.checked)} /> Robinet PEC changé</label>
            <label className="ligne"><input type="checkbox" checked={collier} onChange={(e) => setCollier(e.target.checked)} /> Collier PEC changé</label>
            <label className="ligne"><input type="checkbox" checked={boucheACle} onChange={(e) => setBoucheACle(e.target.checked)} /> Bouche à clé mise à niveau</label>
            <label className="ligne"><input type="checkbox" checked={elementRemplace} onChange={(e) => setElementRemplace(e.target.checked)} /> Élément de conduite remplacé</label>
          </fieldset>
          {materiau === 'polyethylene' && tuyau && (
            <label>
              Longueur de PE posée (m)
              <input value={longueurPe} onChange={(e) => setLongueurPe(e.target.value)} inputMode="decimal" />
            </label>
          )}
        </>
      )}

      <fieldset>
        <legend>Fouille (terrassement)</legend>
        <div className="trois">
          <label>Longueur (m)<input value={fL} onChange={(e) => setFL(e.target.value)} inputMode="decimal" /></label>
          <label>Largeur (m)<input value={fl} onChange={(e) => setFl(e.target.value)} inputMode="decimal" /></label>
          <label>Profondeur (m)<input value={fP} onChange={(e) => setFP(e.target.value)} inputMode="decimal" /></label>
        </div>
        {volume != null && <p className="discret">Volume : {nombre(volume, 3)} m³</p>}
        {nombreOuNul(fL) != null && (nombreOuNul(fL) ?? 0) > 2 && !elementRemplace && (
          <p className="alerte">Longueur &gt; 2 m : justifiez par un remplacement d&apos;élément.</p>
        )}
        <label>
          Revêtement à refaire
          <select value={natureId} onChange={(e) => choisirNature(e.target.value)}>
            <option value="">—</option>
            {natures.map((n) => (<option key={n.id} value={n.id}>{n.libelle_fr}</option>))}
          </select>
        </label>
        <label>
          Emplacement
          <select value={emplacement} onChange={(e) => setEmplacement(e.target.value)}>
            <option value="">—</option>
            {Object.entries(EMPLACEMENTS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Pièces posées</legend>
        <ul className="simple">
          {lignes.map((l, i) => (
            <li key={i}>
              {l.quantite} × {l.designation}{' '}
              <button type="button" onClick={() => setLignes(lignes.filter((_, j) => j !== i))}>Retirer</button>
            </li>
          ))}
        </ul>
        <div className="ligne-pieces">
          <input list="articles" placeholder="Rechercher un article" value={pieceTexte} onChange={(e) => setPieceTexte(e.target.value)} />
          <datalist id="articles">
            {pieces.map((p) => (<option key={p.id} value={p.designation} />))}
          </datalist>
          <input className="court" value={pieceQte} onChange={(e) => setPieceQte(e.target.value)} inputMode="decimal" aria-label="Quantité" />
          <button type="button" onClick={ajouterPiece}>Ajouter</button>
        </div>
        <p className="discret">Article absent de la liste : le noter en observation et demander sa création dans Dolibarr.</p>
      </fieldset>

      <label>
        Représentant {libelles.sigle} présent
        <input value={representant} onChange={(e) => setRepresentant(e.target.value)} />
      </label>
      <label>
        Observation
        <textarea rows={2} value={observation} onChange={(e) => setObservation(e.target.value)} />
      </label>

      {avance && (
        <fieldset>
          <legend>Saisie pour le compte d&apos;un chef d&apos;équipe (responsable)</legend>
          <label>
            Réalisée par
            <select value={saisiPour} onChange={(e) => setSaisiPour(e.target.value)}>
              <option value="">Moi-même</option>
              {profils.map((p) => (<option key={p.id} value={p.id}>{p.nom_complet}</option>))}
            </select>
          </label>
          <div className="deux">
            <label>
              Source
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="tablette">Tablette</option>
                <option value="web">Panneau web</option>
                <option value="papier">Fiche papier</option>
              </select>
            </label>
            <label>
              Date et heure réelles
              <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
        </fieldset>
      )}

      {erreur && <p className="erreur">{erreur}</p>}
      <div className="actions">
        <button className="gros primaire" disabled={occupe}>{occupe ? 'Enregistrement…' : 'Enregistrer la réparation'}</button>
        <button type="button" onClick={onAnnuler}>Annuler</button>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------------- */

export function FormRefection({
  marcheId, fuiteId, natures, motifs, avance, onFini, onAnnuler,
}: {
  marcheId: string; fuiteId: string; natures: Nature[]; motifs: Motif[];
  avance: boolean; onFini: () => void; onAnnuler: () => void;
}) {
  const [resultat, setResultat] = useState<'faite' | 'non_faite'>('faite');
  const [natureId, setNatureId] = useState('');
  const [longueur, setLongueur] = useState('');
  const [largeur, setLargeur] = useState('');
  const [motifId, setMotifId] = useState('');
  const [observation, setObservation] = useState('');
  const [date, setDate] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setErreur('');
    setOccupe(true);
    try {
      const ligne: Record<string, unknown> = {
        marche_id: marcheId,
        fuite_id: fuiteId,
        resultat,
        nature_id: resultat === 'faite' ? natureId || null : null,
        motif_id: resultat === 'non_faite' ? motifId || null : null,
        longueur_m: resultat === 'faite' ? nombreOuNul(longueur) : null,
        largeur_m: resultat === 'faite' ? nombreOuNul(largeur) : null,
        observation: observation.trim() || null,
      };
      const quand = localVersIso(date);
      if (quand) ligne.realisee_le = quand;
      const { error } = await getSupabase().from('refections').insert(ligne);
      if (error) throw error;
      onFini();
    } catch (err) {
      setErreur(messageErreur(err));
      setOccupe(false);
    }
  }

  return (
    <form onSubmit={enregistrer} className="sous-formulaire">
      <h3>Nouvelle réfection</h3>
      <label>
        Résultat
        <select value={resultat} onChange={(e) => setResultat(e.target.value as typeof resultat)}>
          <option value="faite">Réfection faite</option>
          <option value="non_faite">Clôturer sans réfection</option>
        </select>
      </label>
      {resultat === 'faite' ? (
        <>
          <label>
            Nature de la réfection (si vide : celle prévue à la réparation)
            <select value={natureId} onChange={(e) => setNatureId(e.target.value)}>
              <option value="">— Reprendre de la réparation —</option>
              {natures.map((n) => (<option key={n.id} value={n.id}>{n.libelle_fr}</option>))}
            </select>
          </label>
          <div className="deux">
            <label>Longueur (m)<input value={longueur} onChange={(e) => setLongueur(e.target.value)} inputMode="decimal" placeholder="reprise de la fouille" /></label>
            <label>Largeur (m)<input value={largeur} onChange={(e) => setLargeur(e.target.value)} inputMode="decimal" placeholder="reprise de la fouille" /></label>
          </div>
        </>
      ) : (
        <label>
          Motif (obligatoire)
          <select value={motifId} onChange={(e) => setMotifId(e.target.value)} required>
            <option value="">— Choisir —</option>
            {motifs.filter((m) => m.categorie === 'sans_refection').map((m) => (<option key={m.id} value={m.id}>{m.libelle_fr}</option>))}
          </select>
        </label>
      )}
      <label>
        Observation
        <textarea rows={2} value={observation} onChange={(e) => setObservation(e.target.value)} />
      </label>
      {avance && (
        <label>
          Date et heure réelles
          <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      )}
      {erreur && <p className="erreur">{erreur}</p>}
      <div className="actions">
        <button className="gros primaire" disabled={occupe}>{occupe ? 'Enregistrement…' : 'Enregistrer la réfection'}</button>
        <button type="button" onClick={onAnnuler}>Annuler</button>
      </div>
    </form>
  );
}
