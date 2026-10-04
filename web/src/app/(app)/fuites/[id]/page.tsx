'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  EMPLACEMENTS, MATERIAUX, OUVRAGES, STATUTS, TYPES_PHOTO,
  dateHeure, libellesMarche, localVersIso, messageErreur, montant, nombre,
} from '@/lib/format';
import { preparerPhoto } from '@/lib/photo';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import type {
  Motif, Nature, PhotoLigne, Piece, Profil, Quantite, Refection, Reparation, StatutFuite, VFuite,
} from '@/lib/types';

const nombreOuNul = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.')));

export default function DetailFuite() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { marche, peut } = useSession();
  const libelles = libellesMarche(marche);
  const [fuite, setFuite] = useState<VFuite | null>(null);
  const [photos, setPhotos] = useState<(PhotoLigne & { url?: string })[]>([]);
  const [reparations, setReparations] = useState<Reparation[]>([]);
  const [refections, setRefections] = useState<Refection[]>([]);
  const [quantites, setQuantites] = useState<Quantite[]>([]);
  const [natures, setNatures] = useState<Nature[]>([]);
  const [motifs, setMotifs] = useState<Motif[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [profils, setProfils] = useState<Profil[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [formulaire, setFormulaire] = useState<'' | 'reparation' | 'refection'>('');

  const marcheId = marche?.id;

  const charger = useCallback(async () => {
    if (!marcheId) return;
    const sb = getSupabase();
    const [f, ph, rp, rf, q, n, m, pc, pr] = await Promise.all([
      sb.from('v_fuites').select('*').eq('id', id).maybeSingle(),
      sb.from('photos').select('id, type, chemin, prise_le').eq('fuite_id', id).is('supprime_le', null).order('prise_le'),
      sb.from('reparations').select('*').eq('fuite_id', id).is('supprime_le', null).order('realisee_le'),
      sb.from('refections').select('*').eq('fuite_id', id).is('supprime_le', null).order('realisee_le'),
      sb.from('v_quantites').select('id, prix_numero, prix_ordre, prix_designation, unite, quantite, pu_ht, montant_ht_bordereau, origine_ligne').eq('fuite_id', id).order('prix_ordre'),
      sb.from('natures_refection').select('id, code, libelle_fr, emplacement, necessite_refection').eq('marche_id', marcheId).eq('actif', true).order('ordre'),
      sb.from('motifs').select('id, categorie, code, libelle_fr').eq('marche_id', marcheId).eq('actif', true).order('ordre'),
      sb.from('catalogue_pieces').select('id, designation, unite').eq('marche_id', marcheId).eq('actif', true).order('designation'),
      sb.from('profils').select('id, identifiant, nom_complet, telephone, langue, est_admin, actif').eq('actif', true).order('nom_complet'),
    ]);
    if (f.error) setErreur(messageErreur(f.error));
    setFuite((f.data as VFuite | null) ?? null);
    const lignesPhotos = (ph.data as PhotoLigne[] | null) ?? [];
    if (lignesPhotos.length) {
      const urls = await sb.storage.from('photos').createSignedUrls(lignesPhotos.map((p) => p.chemin), 3600);
      setPhotos(lignesPhotos.map((p) => ({ ...p, url: urls.data?.find((u) => u.path === p.chemin)?.signedUrl ?? undefined })));
    } else {
      setPhotos([]);
    }
    setReparations((rp.data as Reparation[] | null) ?? []);
    setRefections((rf.data as Refection[] | null) ?? []);
    setQuantites((q.data as Quantite[] | null) ?? []);
    setNatures((n.data as Nature[] | null) ?? []);
    setMotifs((m.data as Motif[] | null) ?? []);
    setPieces((pc.data as Piece[] | null) ?? []);
    setProfils((pr.data as Profil[] | null) ?? []);
    setChargement(false);
  }, [id, marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function executer(action: () => PromiseLike<{ error: unknown }>) {
    setErreur('');
    setOccupe(true);
    try {
      const { error } = await action();
      if (error) throw error;
      await charger();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  const modifierFuite = (champs: Record<string, unknown>) =>
    executer(() => getSupabase().from('fuites').update(champs).eq('id', id));

  if (chargement) return <p className="discret">Chargement…</p>;
  if (!fuite) return <p className="carte">Fuite introuvable ou accès refusé. <Link href="/fuites">Retour à la liste</Link></p>;

  const verrouillee = !!fuite.verrouillee_le;
  const peutValider = peut('fuites', 'valider');
  const maintenant = () => new Date().toISOString();
  const natureLibelle = (nid: string | null) => natures.find((n) => n.id === nid)?.libelle_fr ?? '—';
  const motifLibelle = (mid: string | null) => motifs.find((m) => m.id === mid)?.libelle_fr ?? '—';
  const totalHt = quantites.reduce((s, l) => s + (l.montant_ht_bordereau ?? 0), 0);

  return (
    <>
      <p><Link href="/fuites">← Liste des fuites</Link></p>

      <section className="carte">
        <div className="fuite-tete">
          <h1>Fuite N° {fuite.numero}</h1>
          <span className={`badge ${STATUTS[fuite.statut].classe}`}>{STATUTS[fuite.statut].libelle}</span>
        </div>
        {verrouillee && <p className="etiquette">Verrouillée le {dateHeure(fuite.verrouillee_le)}</p>}
        <dl className="infos">
          <dt>{libelles.reference}</dt><dd>{fuite.reference_srm ?? '—'}</dd>
          <dt>Secteur</dt><dd>{fuite.secteur ?? '—'}{fuite.zone ? ` (${fuite.zone})` : ''}</dd>
          <dt>Adresse</dt><dd>{fuite.adresse ?? '—'}</dd>
          <dt>Ouvrage / visibilité</dt>
          <dd>{fuite.ouvrage ? OUVRAGES[fuite.ouvrage] : '—'} / {fuite.visibilite ?? '—'}</dd>
          <dt>Détectée</dt><dd>{dateHeure(fuite.date_detection)}{fuite.detectee_par ? ` par ${fuite.detectee_par}` : ''}</dd>
          <dt>Origine</dt><dd>{fuite.origine === 'srm' ? `Signalée par ${libelles.sigle}` : 'Détection de l\'entreprise'} · saisie {fuite.source_saisie}</dd>
          {fuite.latitude != null && fuite.longitude != null && (
            <>
              <dt>Position</dt>
              <dd>
                {fuite.latitude.toFixed(6)}, {fuite.longitude.toFixed(6)} ·{' '}
                <a href={`https://www.google.com/maps?q=${fuite.latitude},${fuite.longitude}`} target="_blank" rel="noreferrer">
                  Ouvrir dans Cartes
                </a>
              </dd>
            </>
          )}
          {fuite.motif_sans_reparation && (<><dt>Motif</dt><dd>{fuite.motif_sans_reparation}</dd></>)}
          {fuite.observation && (<><dt>Observation</dt><dd>{fuite.observation}</dd></>)}
        </dl>
        <div className="alertes">
          {fuite.alerte_non_reparee && <span className="alerte">Non réparée depuis plus de {libelles.delaiReparationH} h</span>}
          {fuite.alerte_communication_srm && <span className="alerte">Non communiquée à {libelles.sigle}</span>}
          {fuite.refection_chaussee_hors_delai && <span className="alerte">Réfection chaussée hors délai</span>}
          {fuite.alerte_refection_chaussee && !fuite.refection_chaussee_hors_delai && <span className="alerte">Réfection chaussée à faire</span>}
          {fuite.alerte_refection_trottoir && <span className="alerte">Réfection trottoir à faire</span>}
          {fuite.alerte_sans_photo && <span className="alerte">Aucune photo</span>}
        </div>
      </section>

      {erreur && <p className="erreur">{erreur}</p>}

      <Photos
        photos={photos} fuiteId={id} marcheId={marche!.id} peutAjouter={peut('photos', 'creer')}
        onChange={charger} onErreur={setErreur}
      />

      {(peut('fuites', 'modifier') || peutValider)
        && (libelles.jalons || fuite.date_communication_srm || fuite.avis_terrassement_srm_le || fuite.validation_srm_le) && (
        <section className="carte">
          <h2>Suivi {libelles.sigle}</h2>
          <ul className="simple">
            <li>
              Communiquée à {libelles.sigle} : <strong>{dateHeure(fuite.date_communication_srm)}</strong>{' '}
              {!fuite.date_communication_srm && (
                <button disabled={occupe} onClick={() => modifierFuite({ date_communication_srm: maintenant() })}>Marquer communiquée</button>
              )}
            </li>
            <li>
              Avis préalable avant terrassement : <strong>{dateHeure(fuite.avis_terrassement_srm_le)}</strong>{' '}
              {!fuite.avis_terrassement_srm_le && (
                <button disabled={occupe} onClick={() => modifierFuite({ avis_terrassement_srm_le: maintenant() })}>Avis obtenu</button>
              )}
            </li>
            <li>
              Validation {libelles.sigle} : <strong>{fuite.validation_srm_le ? `${dateHeure(fuite.validation_srm_le)}${fuite.validation_srm_par ? ` (${fuite.validation_srm_par})` : ''}` : '—'}</strong>{' '}
              {!fuite.validation_srm_le && (
                <button
                  disabled={occupe}
                  onClick={() => {
                    const nom = window.prompt(`Nom du représentant ${libelles.sigle} présent :`);
                    if (nom !== null) modifierFuite({ validation_srm_le: maintenant(), validation_srm_par: nom.trim() || null });
                  }}
                >
                  Enregistrer la validation
                </button>
              )}
            </li>
          </ul>
        </section>
      )}

      <section className="carte">
        <div className="barre">
          <h2>Réparations</h2>
          {peut('interventions', 'creer') && formulaire !== 'reparation' && (
            <button className="primaire" disabled={verrouillee && !peut('interventions', 'valider')} onClick={() => setFormulaire('reparation')}>
              + Réparation
            </button>
          )}
        </div>
        {reparations.length === 0 && <p className="discret">Aucune réparation saisie.</p>}
        {reparations.map((r) => (
          <div key={r.id} className="bloc">
            <strong>
              {r.resultat === 'reparee' ? 'Réparée' : r.resultat === 'en_cours' ? 'En cours' : 'Non réparée'} · {dateHeure(r.realisee_le)}
            </strong>
            <div className="discret">
              {[r.ouvrage ? OUVRAGES[r.ouvrage] : null, r.materiau ? MATERIAUX[r.materiau] : null, r.diametre_mm ? `Ø ${r.diametre_mm} mm` : null]
                .filter(Boolean).join(' · ') || '—'}
            </div>
            <div>
              {[r.tuyau_repare && 'tuyau réparé', r.robinet_pec_change && 'robinet PEC changé', r.collier_pec_change && 'collier PEC changé',
                r.bouche_a_cle_mise_a_niveau && 'bouche à clé mise à niveau', r.element_remplace && 'élément remplacé']
                .filter(Boolean).join(', ')}
            </div>
            {r.volume_m3 != null && (
              <div>Fouille {nombre(r.fouille_longueur_m)} × {nombre(r.fouille_largeur_m)} × {nombre(r.fouille_profondeur_m)} m = {nombre(r.volume_m3, 3)} m³ ({r.emplacement ? EMPLACEMENTS[r.emplacement] : '—'})</div>
            )}
            {r.observation && <div className="discret">{r.observation}</div>}
          </div>
        ))}
        {formulaire === 'reparation' && (
          <FormReparation
            marcheId={marche!.id} fuiteId={id} natures={natures} motifs={motifs} pieces={pieces} profils={profils}
            avance={peutValider} onFini={() => { setFormulaire(''); charger(); }} onAnnuler={() => setFormulaire('')}
          />
        )}
      </section>

      {(reparations.length > 0 || refections.length > 0) && (
        <section className="carte">
          <div className="barre">
            <h2>Réfections</h2>
            {peut('interventions', 'creer') && formulaire !== 'refection' && (
              <button className="primaire" disabled={verrouillee && !peut('interventions', 'valider')} onClick={() => setFormulaire('refection')}>
                + Réfection
              </button>
            )}
          </div>
          {refections.length === 0 && <p className="discret">Aucune réfection saisie.</p>}
          {refections.map((r) => (
            <div key={r.id} className="bloc">
              <strong>{r.resultat === 'faite' ? 'Réfection faite' : 'Clôturée sans réfection'} · {dateHeure(r.realisee_le)}</strong>
              {r.resultat === 'faite' ? (
                <div>{natureLibelle(r.nature_id)} · {nombre(r.longueur_m)} × {nombre(r.largeur_m)} m = {nombre(r.surface_m2, 3)} m²</div>
              ) : (
                <div>Motif : {motifLibelle(r.motif_id)}</div>
              )}
              {r.observation && <div className="discret">{r.observation}</div>}
            </div>
          ))}
          {formulaire === 'refection' && (
            <FormRefection
              marcheId={marche!.id} fuiteId={id} natures={natures} motifs={motifs}
              avance={peutValider}
              onFini={() => { setFormulaire(''); charger(); }} onAnnuler={() => setFormulaire('')}
            />
          )}
        </section>
      )}

      {quantites.length > 0 && (
        <section className="carte">
          <h2>Quantités et prix du bordereau</h2>
          <div className="defilement">
            <table>
              <thead>
                <tr><th>Prix</th><th>Désignation</th><th>Qté</th><th>PU HT</th><th>Montant HT</th></tr>
              </thead>
              <tbody>
                {quantites.map((l) => (
                  <LigneQuantite key={l.id} ligne={l} modifiable={peut('quantites', 'modifier')} onChange={charger} onErreur={setErreur} />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>
                    Total HT aux prix du bordereau{marche?.taux_majoration ? ` (hors majoration de ${marche.taux_majoration} %)` : ''}
                  </td>
                  <td>{montant(totalHt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {(peutValider || peut('fuites', 'supprimer')) && (
        <section className="carte">
          <h2>Responsable</h2>
          <div className="actions">
            {peutValider && (
              <>
                <button disabled={occupe} onClick={() => modifierFuite({ verrouillee_le: verrouillee ? null : maintenant() })}>
                  {verrouillee ? 'Déverrouiller' : 'Valider et verrouiller'}
                </button>
                <label className="ligne">
                  Statut :
                  <select value={fuite.statut} disabled={occupe} onChange={(e) => modifierFuite({ statut: e.target.value as StatutFuite })}>
                    {(Object.keys(STATUTS) as StatutFuite[]).map((s) => (
                      <option key={s} value={s} disabled={s === 'sans_reparation' && !fuite.motif_sans_reparation}>{STATUTS[s].libelle}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {peut('fuites', 'supprimer') && (
              <button
                className="danger"
                disabled={occupe}
                onClick={async () => {
                  if (!window.confirm('Supprimer cette fuite ? (elle sera masquée, la trace reste dans le journal)')) return;
                  const { error } = await getSupabase().from('fuites').update({ supprime_le: maintenant() }).eq('id', id);
                  if (error) setErreur(messageErreur(error));
                  else router.replace('/fuites');
                }}
              >
                Supprimer
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}

/* ----------------------------------------------------------------------- */

function Photos({
  photos, fuiteId, marcheId, peutAjouter, onChange, onErreur,
}: {
  photos: (PhotoLigne & { url?: string })[]; fuiteId: string; marcheId: string; peutAjouter: boolean;
  onChange: () => void; onErreur: (m: string) => void;
}) {
  const [type, setType] = useState('avant');
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef<HTMLInputElement>(null);

  async function ajouter(fichiers: FileList | null) {
    if (!fichiers?.length) return;
    const liste = Array.from(fichiers);
    setEnvoi(true);
    onErreur('');
    try {
      const sb = getSupabase();
      for (const fichier of liste) {
        const prete = await preparerPhoto(fichier);
        const photoId = crypto.randomUUID();
        const chemin = `${marcheId}/${fuiteId}/${photoId}.jpg`;
        const up = await sb.storage.from('photos').upload(chemin, prete.blob, { contentType: 'image/jpeg' });
        if (up.error) throw up.error;
        const ligne = await sb.from('photos').insert({
          id: photoId, marche_id: marcheId, fuite_id: fuiteId, type, chemin,
          largeur_px: prete.largeur, hauteur_px: prete.hauteur, taille_octets: prete.blob.size,
        });
        if (ligne.error) throw ligne.error;
      }
      onChange();
    } catch (e) {
      onErreur(messageErreur(e));
    } finally {
      setEnvoi(false);
      if (champ.current) champ.current.value = '';
    }
  }

  return (
    <section className="carte">
      <h2>Photos ({photos.length})</h2>
      <div className="vignettes">
        {photos.map((p) => (
          <figure key={p.id} className="vignette">
            {p.url ? (
              <a href={p.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={TYPES_PHOTO[p.type] ?? p.type} loading="lazy" />
              </a>
            ) : (
              <div className="vide">Indisponible</div>
            )}
            <figcaption>{TYPES_PHOTO[p.type] ?? p.type}</figcaption>
          </figure>
        ))}
      </div>
      {peutAjouter && (
        <div className="actions">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(TYPES_PHOTO).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
          </select>
          <input ref={champ} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => ajouter(e.target.files)} />
          <button disabled={envoi} onClick={() => champ.current?.click()}>{envoi ? 'Envoi…' : 'Ajouter une photo'}</button>
        </div>
      )}
    </section>
  );
}

function LigneQuantite({
  ligne, modifiable, onChange, onErreur,
}: { ligne: Quantite; modifiable: boolean; onChange: () => void; onErreur: (m: string) => void }) {
  const [valeur, setValeur] = useState(String(ligne.quantite));
  useEffect(() => setValeur(String(ligne.quantite)), [ligne.quantite]);

  async function enregistrer() {
    const q = nombreOuNul(valeur);
    if (q == null || Number.isNaN(q) || q < 0 || q === ligne.quantite) return;
    const { error } = await getSupabase().from('lignes_quantites').update({ quantite: q }).eq('id', ligne.id);
    if (error) onErreur(messageErreur(error));
    onChange();
  }

  return (
    <tr>
      <td>{ligne.prix_numero}</td>
      <td title={ligne.prix_designation}>{ligne.prix_designation.slice(0, 60)}…{ligne.origine_ligne === 'manuel' ? ' ✎' : ''}</td>
      <td>
        {modifiable ? (
          <input className="court" value={valeur} onChange={(e) => setValeur(e.target.value)} onBlur={enregistrer} inputMode="decimal" />
        ) : nombre(ligne.quantite, 3)}{' '}
        {ligne.unite}
      </td>
      <td>{montant(ligne.pu_ht)}</td>
      <td>{montant(ligne.montant_ht_bordereau)}</td>
    </tr>
  );
}

/* ----------------------------------------------------------------------- */

function FormReparation({
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
  const [lignes, setLignes] = useState<{ piece_id: string | null; designation: string; quantite: number }[]>([]);
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
    setLignes([...lignes, { piece_id: piece?.id ?? null, designation: piece?.designation ?? texte, quantite: q }]);
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
            marche_id: marcheId, reparation_id: id, piece_id: l.piece_id,
            designation_libre: l.piece_id ? null : l.designation, quantite: l.quantite,
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
          <input list="catalogue" placeholder="Rechercher une pièce" value={pieceTexte} onChange={(e) => setPieceTexte(e.target.value)} />
          <datalist id="catalogue">
            {pieces.map((p) => (<option key={p.id} value={p.designation} />))}
          </datalist>
          <input className="court" value={pieceQte} onChange={(e) => setPieceQte(e.target.value)} inputMode="decimal" aria-label="Quantité" />
          <button type="button" onClick={ajouterPiece}>Ajouter</button>
        </div>
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

function FormRefection({
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
