'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  EMPLACEMENTS, MATERIAUX, OUVRAGES, STATUTS, TYPES_PHOTO,
  dateHeure, libellesMarche, localVersIso, messageErreur, montant, nombre,
} from '@/lib/format';
import { lienItineraire } from '@/lib/itineraire';
import { preparerPhoto, urlsPhotos } from '@/lib/photo';
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
  const [equipes, setEquipes] = useState<{ id: string; libelle: string }[]>([]);
  const [liens, setLiens] = useState<{ ouvriers: Record<string, string[]>; pieces: Record<string, string[]> }>({ ouvriers: {}, pieces: {} });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [formulaire, setFormulaire] = useState<'' | 'reparation' | 'refection'>('');
  const [rapport, setRapport] = useState('');
  const [rapportEnCours, setRapportEnCours] = useState(false);

  const marcheId = marche?.id;

  const charger = useCallback(async () => {
    if (!marcheId) return;
    const sb = getSupabase();
    const [f, ph, rp, rf, q, n, m, pc, pr, eq, ou] = await Promise.all([
      sb.from('v_fuites').select('*').eq('id', id).maybeSingle(),
      sb.from('photos').select('id, type, chemin, prise_le, stockage').eq('fuite_id', id).is('supprime_le', null).order('prise_le'),
      sb.from('reparations').select('*').eq('fuite_id', id).is('supprime_le', null).order('realisee_le'),
      sb.from('refections').select('*').eq('fuite_id', id).is('supprime_le', null).order('realisee_le'),
      sb.from('v_quantites').select('id, prix_numero, prix_ordre, prix_designation, unite, quantite, pu_ht, montant_ht_bordereau, origine_ligne').eq('fuite_id', id).order('prix_ordre'),
      sb.from('natures_refection').select('id, code, libelle_fr, emplacement, necessite_refection').eq('marche_id', marcheId).eq('actif', true).order('ordre'),
      sb.from('motifs').select('id, categorie, code, libelle_fr').eq('marche_id', marcheId).eq('actif', true).order('ordre'),
      sb.from('catalogue_pieces').select('id, designation, unite').eq('marche_id', marcheId).eq('actif', true).order('designation'),
      sb.from('profils').select('id, identifiant, nom_complet, telephone, langue, est_admin, actif').eq('actif', true).order('nom_complet'),
      sb.from('equipes').select('id, libelle').eq('marche_id', marcheId),
      sb.from('ouvriers').select('id, nom_complet').eq('marche_id', marcheId),
    ]);
    // Ouvriers et pièces posées de chaque réparation (vide si le compte n'y a pas accès)
    const idsRep = ((rp.data as { id: string }[] | null) ?? []).map((r) => r.id);
    if (idsRep.length) {
      const nomsOuvriers = new Map(((ou.data as { id: string; nom_complet: string }[] | null) ?? []).map((o) => [o.id, o.nom_complet]));
      const nomsPieces = new Map(((pc.data as Piece[] | null) ?? []).map((x) => [x.id, x]));
      const [ro, rpi] = await Promise.all([
        sb.from('reparation_ouvriers').select('reparation_id, ouvrier_id').in('reparation_id', idsRep),
        sb.from('reparation_pieces').select('reparation_id, piece_id, designation_libre, quantite').in('reparation_id', idsRep).is('supprime_le', null),
      ]);
      const o: Record<string, string[]> = {};
      ((ro.data as { reparation_id: string; ouvrier_id: string }[] | null) ?? []).forEach((l) => {
        (o[l.reparation_id] ??= []).push(nomsOuvriers.get(l.ouvrier_id) ?? '?');
      });
      const pcs: Record<string, string[]> = {};
      ((rpi.data as { reparation_id: string; piece_id: string | null; designation_libre: string | null; quantite: number }[] | null) ?? []).forEach((l) => {
        const piece = l.piece_id ? nomsPieces.get(l.piece_id) : undefined;
        (pcs[l.reparation_id] ??= []).push(`${piece?.designation ?? l.designation_libre ?? '?'} : ${nombre(l.quantite)} ${piece?.unite ?? 'u'}`);
      });
      setLiens({ ouvriers: o, pieces: pcs });
    } else {
      setLiens({ ouvriers: {}, pieces: {} });
    }
    if (f.error) setErreur(messageErreur(f.error));
    setFuite((f.data as VFuite | null) ?? null);
    const lignesPhotos = (ph.data as PhotoLigne[] | null) ?? [];
    if (lignesPhotos.length) {
      const urls = await urlsPhotos(lignesPhotos);
      setPhotos(lignesPhotos.map((p) => ({ ...p, url: urls.get(p.id) })));
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
    setEquipes((eq.data as { id: string; libelle: string }[] | null) ?? []);
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

  // Rapport PDF de la fuite (module chargé seulement au clic)
  async function rapportPdf() {
    if (!marcheId) return;
    setErreur('');
    setRapport('Préparation…');
    setRapportEnCours(true);
    try {
      const { telechargerRapports } = await import('@/lib/export/rapport-fuite');
      const r = await telechargerRapports([id], marcheId, peut('quantites', 'lire'), (fait, total, etape) =>
        setRapport(`${etape} (${Math.round((fait / Math.max(1, total)) * 100)} %)`));
      setRapport(`Rapport téléchargé (${(r.octets / 1024).toFixed(0)} Ko, ${r.secondes.toFixed(1)} s)`);
    } catch (e) {
      setRapport('');
      setErreur(messageErreur(e));
    } finally {
      setRapportEnCours(false);
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

  // Étapes de la frise : détection, jalons du client (si suivis), réparation, réfection, validation.
  const premiereReparee = reparations.find((r) => r.resultat === 'reparee');
  const jalons = libelles.jalons || !!(fuite.date_communication_srm || fuite.avis_terrassement_srm_le || fuite.validation_srm_le);
  const etapes: [string, string | null | undefined][] = fuite.statut === 'sans_reparation'
    ? [['Détectée', fuite.date_detection], ['Sans réparation', fuite.verrouillee_le ?? fuite.date_detection]]
    : [
      ['Détectée', fuite.date_detection],
      ...(jalons ? [[`Communiquée ${libelles.sigle}`, fuite.date_communication_srm], ['Avis terrassement', fuite.avis_terrassement_srm_le]] as [string, string | null][] : []),
      ['Réparée', premiereReparee?.realisee_le],
      ['Réfection', fuite.derniere_refection_le],
      ...(jalons ? [[`Validée ${libelles.sigle}`, fuite.validation_srm_le]] as [string, string | null][] : []),
    ];
  const nomProfil = (pid: string | null | undefined) => profils.find((p) => p.id === pid)?.nom_complet ?? null;
  const nomEquipe = (eid: string | null | undefined) => equipes.find((e) => e.id === eid)?.libelle ?? null;

  // Historique déduit des dates de la fiche (le plus récent en premier).
  const historique: [string, string][] = ([
    [fuite.date_detection, `détectée${fuite.detectee_par ? ` par ${fuite.detectee_par}` : ''} (saisie ${fuite.source_saisie})`],
    [fuite.date_communication_srm, `communiquée à ${libelles.sigle}`],
    [fuite.avis_terrassement_srm_le, 'avis préalable avant terrassement obtenu'],
    ...reparations.map((r) => [r.realisee_le, `réparation saisie (${r.resultat === 'reparee' ? 'réparée' : r.resultat === 'en_cours' ? 'en cours' : 'non réparée'})${nomProfil(r.auteur_terrain_id) ? ` par ${nomProfil(r.auteur_terrain_id)}` : ''}`]),
    ...refections.map((r) => [r.realisee_le, r.resultat === 'faite' ? 'réfection saisie' : 'clôturée sans réfection']),
    [fuite.validation_srm_le, `validée par ${fuite.validation_srm_par || `le représentant ${libelles.sigle}`}`],
    [fuite.verrouillee_le, 'validée et verrouillée'],
  ] as [string | null | undefined, string][])
    .filter((e): e is [string, string] => !!e[0])
    .sort((a, b) => b[0].localeCompare(a[0]));

  const sousTitre = [
    fuite.reference_srm && `Réf. ${libelles.sigle} ${fuite.reference_srm}`,
    fuite.secteur,
    verrouillee && `verrouillée le ${dateHeure(fuite.verrouillee_le)}`,
  ].filter(Boolean).join(' · ');
  const itineraire = lienItineraire(fuite.latitude, fuite.longitude);

  return (
    <>
      <p className="fil-ariane"><Link href="/fuites">Fuites</Link> / <b>N° {fuite.numero}</b></p>

      {/* En-tête de l'objet : titre, statut, actions */}
      <div className="objet-entete">
        <div className="objet-titre">
          <h1>Fuite N° {fuite.numero}</h1>
          <span className={`badge ${STATUTS[fuite.statut].classe}`}>{STATUTS[fuite.statut].libelle}</span>
          {sousTitre && <span className="discret">{sousTitre}</span>}
        </div>
        <div className="actions en-tete">
          {itineraire && <a className="bouton" href={itineraire} target="_blank" rel="noreferrer">Y aller</a>}
          {peut('exports', 'lire') && (
            <button disabled={rapportEnCours} onClick={rapportPdf}>Rapport PDF</button>
          )}
          {peutValider && (
            <button className={verrouillee ? '' : 'primaire'} disabled={occupe}
              onClick={() => modifierFuite({ verrouillee_le: verrouillee ? null : maintenant() })}>
              {verrouillee ? 'Déverrouiller' : 'Valider et verrouiller'}
            </button>
          )}
        </div>
      </div>
      {rapport && <p className="discret" role="status">{rapport}</p>}
      <div className="alertes objet-alertes">
        {fuite.alerte_non_reparee && <span className="alerte">Non réparée depuis plus de {libelles.delaiReparationH} h</span>}
        {fuite.alerte_communication_srm && <span className="alerte">Non communiquée à {libelles.sigle}</span>}
        {fuite.refection_chaussee_hors_delai && <span className="alerte orange">Réfection chaussée hors délai</span>}
        {fuite.alerte_refection_chaussee && !fuite.refection_chaussee_hors_delai && <span className="alerte orange">Réfection chaussée à faire</span>}
        {fuite.alerte_refection_trottoir && <span className="alerte orange">Réfection trottoir à faire</span>}
        {fuite.alerte_sans_photo && <span className="alerte">Aucune photo</span>}
      </div>
      {erreur && <p className="erreur">{erreur}</p>}

      {/* Frise des étapes */}
      <section className="carte frise" aria-label="Étapes">
        {etapes.map(([libelle, date]) => (
          <div key={libelle} className={`etape ${date ? 'fait' : ''}`}>
            <span className="etape-libelle">{libelle}</span>
            <span className="etape-date">{date ? dateHeure(date) : '—'}</span>
          </div>
        ))}
      </section>

      <div className="fiche-grille">
        <div className="colonne">
          <section className="carte">
            <h2>Identification</h2>
            <dl className="dl4">
              <dt>Origine</dt><dd>{fuite.origine === 'srm' ? `Signalée par ${libelles.sigle}` : 'Détection de l\'entreprise'}</dd>
              <dt>Ouvrage</dt><dd>{fuite.ouvrage ? OUVRAGES[fuite.ouvrage] : '—'}{fuite.visibilite ? ` (${fuite.visibilite})` : ''}</dd>
              <dt>Zone</dt><dd>{fuite.zone ?? '—'}</dd>
              <dt>Secteur</dt><dd>{fuite.secteur ?? '—'}</dd>
              <dt>{libelles.reference}</dt><dd>{fuite.reference_srm ?? '—'}</dd>
              <dt>Détectée</dt><dd>{dateHeure(fuite.date_detection)}{fuite.detectee_par ? ` par ${fuite.detectee_par}` : ''}</dd>
              <dt>Adresse</dt><dd className="large">{fuite.adresse ?? '—'}</dd>
              <dt>Coordonnées GPS</dt>
              <dd className="large">
                {fuite.latitude != null && fuite.longitude != null ? (
                  <>
                    <span className="coord">{fuite.latitude.toFixed(6)} ; {fuite.longitude.toFixed(6)}</span> ·{' '}
                    <a href={`https://www.google.com/maps?q=${fuite.latitude},${fuite.longitude}`} target="_blank" rel="noreferrer">Carte</a> ·{' '}
                    <a href={itineraire!} target="_blank" rel="noreferrer">Itinéraire ›</a>
                  </>
                ) : 'Non relevées'}
              </dd>
              {fuite.motif_sans_reparation && (<><dt>Motif</dt><dd className="large">{fuite.motif_sans_reparation}</dd></>)}
              {fuite.observation && (<><dt>Observation</dt><dd className="large">{fuite.observation}</dd></>)}
            </dl>
          </section>

          {(peut('fuites', 'modifier') || peutValider) && jalons && (
            <section className="carte">
              <h2>Suivi {libelles.sigle}</h2>
              <dl className="dl4 jalons">
                <dt>Communiquée</dt>
                <dd className="large">
                  {fuite.date_communication_srm ? dateHeure(fuite.date_communication_srm) : (
                    <button className="petit" disabled={occupe} onClick={() => modifierFuite({ date_communication_srm: maintenant() })}>Marquer communiquée</button>
                  )}
                </dd>
                <dt>Avis avant terrassement</dt>
                <dd className="large">
                  {fuite.avis_terrassement_srm_le ? dateHeure(fuite.avis_terrassement_srm_le) : (
                    <button className="petit" disabled={occupe} onClick={() => modifierFuite({ avis_terrassement_srm_le: maintenant() })}>Avis obtenu</button>
                  )}
                </dd>
                <dt>Validation</dt>
                <dd className="large">
                  {fuite.validation_srm_le ? `${dateHeure(fuite.validation_srm_le)}${fuite.validation_srm_par ? ` (${fuite.validation_srm_par})` : ''}` : (
                    <button
                      className="petit"
                      disabled={occupe}
                      onClick={() => {
                        const nom = window.prompt(`Nom du représentant ${libelles.sigle} présent :`);
                        if (nom !== null) modifierFuite({ validation_srm_le: maintenant(), validation_srm_par: nom.trim() || null });
                      }}
                    >
                      Enregistrer la validation
                    </button>
                  )}
                </dd>
              </dl>
            </section>
          )}

          <section className="carte">
            <div className="barre">
              <h2>Réparation{reparations.length > 1 ? 's' : ''}</h2>
              {peut('interventions', 'creer') && formulaire !== 'reparation' && (
                <button className="petit" disabled={verrouillee && !peut('interventions', 'valider')} onClick={() => setFormulaire('reparation')}>
                  + Réparation
                </button>
              )}
            </div>
            {reparations.length === 0 && <p className="discret">Aucune réparation saisie.</p>}
            {reparations.map((r) => (
              <div key={r.id} className="bloc-objet">
                <div className="bloc-objet-tete">
                  <strong>{r.resultat === 'reparee' ? 'Réparée' : r.resultat === 'en_cours' ? 'En cours / reste à finir' : 'Non réparée'}</strong>
                  <span className="discret">{dateHeure(r.realisee_le)}{nomEquipe(r.equipe_id) ? ` · ${nomEquipe(r.equipe_id)}` : ''}</span>
                </div>
                <dl className="dl4">
                  <dt>Chef d&apos;équipe</dt><dd>{nomProfil(r.auteur_terrain_id) ?? '—'}</dd>
                  <dt>Ouvriers</dt><dd>{liens.ouvriers[r.id]?.join(', ') || '—'}</dd>
                  <dt>Matériau</dt>
                  <dd>{[r.materiau ? MATERIAUX[r.materiau] : null, r.diametre_mm ? `Ø ${r.diametre_mm} mm` : null].filter(Boolean).join(' ') || '—'}</dd>
                  <dt>Ouvrage</dt><dd>{r.ouvrage ? OUVRAGES[r.ouvrage] : '—'}</dd>
                  <dt>Travaux</dt>
                  <dd className="large">
                    {[r.tuyau_repare && 'tuyau réparé', r.robinet_pec_change && 'robinet PEC changé', r.collier_pec_change && 'collier PEC changé',
                      r.bouche_a_cle_mise_a_niveau && 'bouche à clé mise à niveau', r.element_remplace && 'élément remplacé']
                      .filter(Boolean).join(', ') || '—'}
                  </dd>
                  <dt>Fouille</dt>
                  <dd>{r.volume_m3 != null
                    ? <>{nombre(r.fouille_longueur_m)} × {nombre(r.fouille_largeur_m)} × {nombre(r.fouille_profondeur_m)} m = <b>{nombre(r.volume_m3, 3)} m³</b></>
                    : '—'}</dd>
                  <dt>Emplacement</dt><dd>{r.emplacement ? EMPLACEMENTS[r.emplacement] : '—'}</dd>
                  {liens.pieces[r.id]?.length ? (<><dt>Pièces posées</dt><dd className="large">{liens.pieces[r.id].join(' · ')}</dd></>) : null}
                  {r.representant_srm && (<><dt>Représentant {libelles.sigle}</dt><dd className="large">{r.representant_srm}</dd></>)}
                  {r.motif_id && (<><dt>Motif</dt><dd className="large">{motifLibelle(r.motif_id)}</dd></>)}
                  {r.observation && (<><dt>Observation</dt><dd className="large">{r.observation}</dd></>)}
                </dl>
              </div>
            ))}
            {formulaire === 'reparation' && (
              <FormReparation
                marcheId={marche!.id} fuiteId={id} natures={natures} motifs={motifs} pieces={pieces} profils={profils}
                avance={peutValider} onFini={() => { setFormulaire(''); charger(); }} onAnnuler={() => setFormulaire('')}
              />
            )}
          </section>

          {quantites.length > 0 && (
            <section className="carte carte-tableau">
              <div className="barre">
                <h2>Quantités du bordereau</h2>
                {marche?.taux_majoration ? <span className="discret">hors majoration de {marche.taux_majoration} %</span> : null}
              </div>
              <div className="defilement">
                <table>
                  <thead>
                    <tr><th>Prix</th><th>Désignation</th><th>Qté</th><th className="num">PU HT</th><th className="num">Montant HT</th></tr>
                  </thead>
                  <tbody>
                    {quantites.map((l) => (
                      <LigneQuantite key={l.id} ligne={l} modifiable={peut('quantites', 'modifier')} onChange={charger} onErreur={setErreur} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}>Total HT ({libelles.devise})</td>
                      <td className="num">{montant(totalHt)}</td>
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
                  <label className="ligne">
                    Statut
                    <select value={fuite.statut} disabled={occupe} onChange={(e) => modifierFuite({ statut: e.target.value as StatutFuite })}>
                      {(Object.keys(STATUTS) as StatutFuite[]).map((s) => (
                        <option key={s} value={s} disabled={s === 'sans_reparation' && !fuite.motif_sans_reparation}>{STATUTS[s].libelle}</option>
                      ))}
                    </select>
                  </label>
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
        </div>

        <div className="colonne">
          <Photos
            photos={photos} fuiteId={id} marcheId={marche!.id} peutAjouter={peut('photos', 'creer')}
            onChange={charger} onErreur={setErreur}
          />

          {(reparations.length > 0 || refections.length > 0) && (
            <section className="carte">
              <div className="barre">
                <h2>Réfection{refections.length > 1 ? 's' : ''}</h2>
                {peut('interventions', 'creer') && formulaire !== 'refection' && (
                  <button className="petit" disabled={verrouillee && !peut('interventions', 'valider')} onClick={() => setFormulaire('refection')}>
                    + Réfection
                  </button>
                )}
              </div>
              {refections.length === 0 && <p className="discret">Aucune réfection saisie.</p>}
              {refections.map((r) => (
                <dl key={r.id} className="dl2 bloc-objet">
                  <dt>Date</dt><dd>{dateHeure(r.realisee_le)}</dd>
                  {r.resultat === 'faite' ? (
                    <>
                      <dt>Nature</dt><dd>{natureLibelle(r.nature_id)}</dd>
                      <dt>Surface</dt><dd>{nombre(r.longueur_m)} × {nombre(r.largeur_m)} m = <b>{nombre(r.surface_m2, 3)} m²</b></dd>
                    </>
                  ) : (
                    <><dt>Résultat</dt><dd>Clôturée sans réfection : {motifLibelle(r.motif_id)}</dd></>
                  )}
                  {r.observation && (<><dt>Observation</dt><dd>{r.observation}</dd></>)}
                </dl>
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

          <section className="carte">
            <h2>Historique</h2>
            <ul className="historique">
              {historique.map(([date, texte], i) => (
                <li key={i}><b>{dateHeure(date)}</b> · {texte}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
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
      <div className="barre"><h2>Photos</h2><span className="discret">{photos.length}</span></div>
      {photos.length === 0 && <p className="discret">Aucune photo.</p>}
      <div className="galerie">
        {photos.map((p) => (
          <figure key={p.id} className="galerie-photo">
            {p.url ? (
              <a href={p.url} target="_blank" rel="noreferrer" title={`${TYPES_PHOTO[p.type] ?? p.type} · ${dateHeure(p.prise_le)}`}>
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
        <div className="actions ajout-photo">
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type de photo">
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
