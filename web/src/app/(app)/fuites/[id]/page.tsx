'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ETATS_PIECE, libelleProvenance, type PieceAffichee } from '@/app/(app)/attachements/controles';
import {
  EMPLACEMENTS, MATERIAUX, OUVRAGES, STATUTS, TYPES_PHOTO,
  dateHeure, libellesMarche, messageErreur, montant, nombre,
} from '@/lib/format';
import { estErreurReseau, noterConsultation, oublierFiche } from '@/lib/hors-ligne';
import { lienItineraire } from '@/lib/itineraire';
import { preparerPhoto } from '@/lib/photo';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import type {
  Motif, Nature, PhotoLigne, Piece, Profil, Quantite, Refection, Reparation, StatutFuite, VFuite,
} from '@/lib/types';
import { garderCopie, lireCopie } from './copie';
import { FormRefection, FormReparation } from './formulaires';
import { lireFicheEnLigne, type LectureEnLigne } from './donnees';
import {
  DELAI_RESEAU_MS, NOMS_VIDES, actionsFiche, choisirAffichage, type ContenuFiche, type LiensReparations, type NomsFiche,
} from './fiche-hors-ligne';
import styles from './fiche.module.css';

const nombreOuNul = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.')));
// Ligne de prix avec le motif de sa dernière correction (lot R)
type QuantiteFiche = Quantite & { motif_correction?: string | null };

// Pièces d'une réparation (lot R) : inventaire réel, avec les corrections du bureau (nature, motif) ;
// la saisie d'origine corrigée reste visible, barrée « remplacée » ou « retirée ». Une copie gardée
// avant le lot R ne contient que le texte de chaque pièce.
function PiecesReparation({ pieces = [] }: { pieces?: (PieceAffichee | string)[] }) {
  if (!pieces.length) return null;
  return (
    <>
      <dt>Pièces posées</dt>
      <dd className="large">
        <ul className={styles.pieces}>
          {pieces.map((p, i) => (typeof p === 'string' ? <li key={i}>{p}</li> : (
            <li key={p.id} className={p.etat === 'posee' ? undefined : styles.pieceHors}>
              <span className={p.etat === 'posee' ? undefined : styles.barre}>{p.texte}</span>
              {p.etat !== 'posee' && <span className={styles.etatPiece}>{ETATS_PIECE[p.etat]}</span>}
              {p.provenance === 'correction' && <span className={styles.correction}>{libelleProvenance(p.provenance, p.nature)}</span>}
              {p.remplace && <span className="discret"> · remplace {p.remplace}</span>}
              {p.remplaceePar && <span className="discret"> · remplacée par {p.remplaceePar}</span>}
              {p.motif && <span className="discret"> · « {p.motif} »</span>}
            </li>
          )))}
        </ul>
      </dd>
    </>
  );
}

export default function DetailFuite() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { marche, peut, session } = useSession();
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
  const [noms, setNoms] = useState<NomsFiche>(NOMS_VIDES);
  const [liens, setLiens] = useState<LiensReparations>({ ouvriers: {}, pieces: {} });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [formulaire, setFormulaire] = useState<'' | 'reparation' | 'refection'>('');
  const [rapport, setRapport] = useState('');
  const [rapportEnCours, setRapportEnCours] = useState(false);
  // Sans réseau : date de la copie affichée (lecture seule), ou fiche jamais ouverte sur cet appareil.
  const [horsLigne, setHorsLigne] = useState<string | null>(null);
  const [indisponible, setIndisponible] = useState(false);
  const generation = useRef(0);
  const surCopie = useRef(false);
  const urlsLocales = useRef<string[]>([]);

  const marcheId = marche?.id;
  const utilisateurId = session?.user.id;

  const appliquer = useCallback((c: ContenuFiche, urls: Map<string, string>) => {
    setFuite(c.fuite);
    setPhotos(c.photos.map((p) => ({ ...p, url: urls.get(p.id) })));
    setReparations(c.reparations);
    setRefections(c.refections);
    setQuantites(c.quantites);
    setLiens(c.liens);
    setNoms(c.noms);
  }, []);

  // Adresses blob: des photos de la copie, libérées dès qu'elles ne sont plus affichées.
  const remplacerUrlsLocales = useCallback((urls: string[]) => {
    urlsLocales.current.forEach((u) => URL.revokeObjectURL(u));
    urlsLocales.current = urls;
  }, []);
  useEffect(() => () => remplacerUrlsLocales([]), [remplacerUrlsLocales]);

  const charger = useCallback(async () => {
    if (!marcheId || !utilisateurId) return;
    const tour = ++generation.current;
    let enLigne = false;

    // Copie gardée lors d'une ouverture en ligne : affichée sans réseau, ou si le réseau ne répond pas.
    const afficherCopie = async (lecture: 'reseau' | 'en_cours') => {
      const copie = await lireCopie(id, utilisateurId);
      if (tour !== generation.current || enLigne) {
        copie?.urls.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      const affichage = choisirAffichage({ lecture, copie: !!copie });
      if (affichage === 'attente') return;
      surCopie.current = true;
      setFormulaire('');
      if (copie) {
        remplacerUrlsLocales([...copie.urls.values()]);
        appliquer(copie.fiche, copie.urls);
        setHorsLigne(copie.fiche.version_le);
        setIndisponible(false);
        void noterConsultation(id, new Date().toISOString());
      } else {
        setIndisponible(true);
      }
      setChargement(false);
    };

    if (navigator.onLine === false) {
      await afficherCopie('reseau');
      return;
    }
    const minuteur = window.setTimeout(() => void afficherCopie('en_cours'), DELAI_RESEAU_MS);
    let lu: LectureEnLigne;
    try {
      lu = await lireFicheEnLigne(id, marcheId);
    } catch (e) {
      window.clearTimeout(minuteur);
      if (tour !== generation.current) return;
      if (estErreurReseau(e)) {
        await afficherCopie('reseau');
      } else {
        setErreur(messageErreur(e));
        setChargement(false);
      }
      return;
    }
    window.clearTimeout(minuteur);
    if (tour !== generation.current) return;
    if (lu.reseau) {
      await afficherCopie('reseau');
      return;
    }
    enLigne = true;
    surCopie.current = false;
    remplacerUrlsLocales([]);
    setHorsLigne(null);
    setIndisponible(false);
    if (lu.erreur) setErreur(messageErreur(lu.erreur));
    if (lu.contenu) appliquer(lu.contenu, lu.urls);
    else setFuite(null);
    setNatures(lu.listes.natures);
    setMotifs(lu.listes.motifs);
    setPieces(lu.listes.pieces);
    setProfils(lu.listes.profils);
    setChargement(false);
    // Copie pour la consultation sans réseau : seulement après une lecture complète (jamais une copie
    // tronquée par une coupure) ; une fuite introuvable ou refusée par la RLS n'est plus gardée.
    if (lu.contenu && lu.complete) void garderCopie(lu.contenu, lu.urls, utilisateurId).catch(() => undefined);
    else if (!lu.contenu && !lu.erreur) void oublierFiche(id);
  }, [id, marcheId, utilisateurId, appliquer, remplacerUrlsLocales]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Retour du réseau pendant qu'une copie est affichée : relecture en ligne.
  useEffect(() => {
    const retour = () => {
      if (surCopie.current) void charger();
    };
    window.addEventListener('online', retour);
    return () => window.removeEventListener('online', retour);
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
  if (indisponible) {
    return (
      <section className={`carte ${styles.indisponible}`} role="status">
        <p><strong>Fiche non disponible hors ligne.</strong></p>
        <p className="discret">Elle n&apos;a pas encore été ouverte sur cet appareil avec du réseau.</p>
        <button onClick={() => charger()}>Réessayer</button>
      </section>
    );
  }
  if (!fuite) return <p className="carte">Fuite introuvable ou accès refusé. <Link href="/fuites">Retour à la liste</Link></p>;

  const verrouillee = !!fuite.verrouillee_le;
  const peutValider = peut('fuites', 'valider');
  // Copie hors ligne : aucune action d'écriture (statut, réparation, réfection, quantités, photos…).
  const actions = actionsFiche(peut, { horsLigne: !!horsLigne, verrouillee });
  const maintenant = () => new Date().toISOString();
  const natureLibelle = (nid: string | null | undefined) => (nid && noms.natures[nid]) || '—';
  const motifLibelle = (mid: string | null | undefined) => (mid && noms.motifs[mid]) || '—';
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
  const nomProfil = (pid: string | null | undefined) => (pid && noms.profils[pid]) || null;
  const nomEquipe = (eid: string | null | undefined) => (eid && noms.equipes[eid]) || null;

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
      {horsLigne && (
        <p className={styles.horsLigne} role="status">
          <strong>Hors ligne : version du {dateHeure(horsLigne)}</strong>
          <span>Lecture seule : les modifications reviendront avec le réseau.</span>
        </p>
      )}

      {/* En-tête de l'objet : titre, statut, actions */}
      <div className="objet-entete">
        <div className="objet-titre">
          <h1>Fuite N° {fuite.numero}</h1>
          <span className={`badge ${STATUTS[fuite.statut].classe}`}>{STATUTS[fuite.statut].libelle}</span>
          {sousTitre && <span className="discret">{sousTitre}</span>}
        </div>
        <div className="actions en-tete">
          {itineraire && <a className="bouton" href={itineraire} target="_blank" rel="noreferrer">Y aller</a>}
          {actions.rapportPdf && (
            <button disabled={rapportEnCours} onClick={rapportPdf}>Rapport PDF</button>
          )}
          {actions.verrouiller && (
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
                  {fuite.date_communication_srm ? dateHeure(fuite.date_communication_srm) : !actions.suiviClient ? '—' : (
                    <button className="petit" disabled={occupe} onClick={() => modifierFuite({ date_communication_srm: maintenant() })}>Marquer communiquée</button>
                  )}
                </dd>
                <dt>Avis avant terrassement</dt>
                <dd className="large">
                  {fuite.avis_terrassement_srm_le ? dateHeure(fuite.avis_terrassement_srm_le) : !actions.suiviClient ? '—' : (
                    <button className="petit" disabled={occupe} onClick={() => modifierFuite({ avis_terrassement_srm_le: maintenant() })}>Avis obtenu</button>
                  )}
                </dd>
                <dt>Validation</dt>
                <dd className="large">
                  {fuite.validation_srm_le ? `${dateHeure(fuite.validation_srm_le)}${fuite.validation_srm_par ? ` (${fuite.validation_srm_par})` : ''}` : !actions.suiviClient ? '—' : (
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
              {actions.ajouterReparation && formulaire !== 'reparation' && (
                <button className="petit" disabled={actions.interventionsBloquees} onClick={() => setFormulaire('reparation')}>
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
                  <PiecesReparation pieces={liens.pieces[r.id]} />
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
                      <LigneQuantite key={l.id} ligne={l} modifiable={actions.modifierQuantites} onChange={charger} onErreur={setErreur} />
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

          {(actions.changerStatut || actions.supprimer) && (
            <section className="carte">
              <h2>Responsable</h2>
              <div className="actions">
                {actions.changerStatut && (
                  <label className="ligne">
                    Statut
                    <select value={fuite.statut} disabled={occupe} onChange={(e) => modifierFuite({ statut: e.target.value as StatutFuite })}>
                      {(Object.keys(STATUTS) as StatutFuite[]).map((s) => (
                        <option key={s} value={s} disabled={s === 'sans_reparation' && !fuite.motif_sans_reparation}>{STATUTS[s].libelle}</option>
                      ))}
                    </select>
                  </label>
                )}
                {actions.supprimer && (
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
            photos={photos} fuiteId={id} marcheId={marche!.id} peutAjouter={actions.ajouterPhoto} horsLigne={!!horsLigne}
            onChange={charger} onErreur={setErreur}
          />

          {(reparations.length > 0 || refections.length > 0) && (
            <section className="carte">
              <div className="barre">
                <h2>Réfection{refections.length > 1 ? 's' : ''}</h2>
                {actions.ajouterRefection && formulaire !== 'refection' && (
                  <button className="petit" disabled={actions.interventionsBloquees} onClick={() => setFormulaire('refection')}>
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
  photos, fuiteId, marcheId, peutAjouter, horsLigne, onChange, onErreur,
}: {
  photos: (PhotoLigne & { url?: string })[]; fuiteId: string; marcheId: string; peutAjouter: boolean; horsLigne: boolean;
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
              <div className="vide">{horsLigne ? 'Pas de copie hors ligne' : 'Indisponible'}</div>
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
}: { ligne: QuantiteFiche; modifiable: boolean; onChange: () => void; onErreur: (m: string) => void }) {
  const [valeur, setValeur] = useState(String(ligne.quantite));
  useEffect(() => setValeur(String(ligne.quantite)), [ligne.quantite]);

  // Toute correction d'une ligne exige un motif (contrôle en base, gardé dans le journal).
  async function enregistrer() {
    const q = nombreOuNul(valeur);
    if (q == null || Number.isNaN(q) || q < 0 || q === ligne.quantite) return;
    const motif = window.prompt('Motif de la correction (obligatoire, gardé dans le journal) :');
    if (!motif?.trim()) {
      setValeur(String(ligne.quantite));
      return;
    }
    const { error } = await getSupabase().from('lignes_quantites').update({ quantite: q, motif_modification: motif.trim() }).eq('id', ligne.id);
    if (error) onErreur(messageErreur(error));
    onChange();
  }

  return (
    <tr>
      <td>{ligne.prix_numero}</td>
      <td title={ligne.prix_designation}>
        {ligne.prix_designation.slice(0, 60)}…{ligne.origine_ligne === 'manuel' ? ' ✎' : ''}
        {ligne.motif_correction && <><br /><span className="discret">Motif : {ligne.motif_correction}</span></>}
      </td>
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
