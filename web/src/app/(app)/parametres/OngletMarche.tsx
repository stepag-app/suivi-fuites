'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { dateSeule, messageErreur } from '@/lib/format';
import { COLONNES_LOGO, TYPES_LOGO, envoyerLogo, retirerLogo, telechargerLogo, type RoleLogo } from '@/lib/logos';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import { BlocDestinataires } from './BlocDestinataires';
import { FormulaireFiche, type Champ } from './commun';
import styles from './Logos.module.css';

interface OrdreService {
  id: string; numero: string; date_os: string; nature: string; objet: string;
  date_effet: string | null; observation: string | null;
}
interface Arret {
  id: string; date_arret: string; os_arret_id: string | null; motif: string;
  date_reprise: string | null; os_reprise_id: string | null; observation: string | null; actif: boolean;
}
interface Delai {
  date_fin_calculee: string | null; date_fin_initiale: string | null; jours_arret: number;
  jours_prolongation: number; date_fin_prevue: string | null; arret_en_cours: boolean; jours_restants: number | null;
}

export const NATURES_OS: Record<string, string> = {
  notification: 'Notification de l\'approbation',
  commencement: 'Commencement des travaux',
  arret: 'Arrêt des travaux',
  reprise: 'Reprise des travaux',
  agent_suivi: 'Désignation de l\'agent de suivi',
  avenant: 'Avenant',
  autre: 'Autre',
};

const CHAMPS_MARCHE: Champ[] = [
  { cle: 'numero', libelle: 'Numéro du marché', obligatoire: true },
  { cle: 'numero_appel_offres', libelle: 'Numéro de l\'appel d\'offres' },
  { cle: 'intitule', libelle: 'Objet du marché', type: 'zone', obligatoire: true },
  { cle: 'ville', libelle: 'Lieu d\'exécution (ville)' },
  { cle: 'montant_ttc', libelle: 'Montant du marché TTC', type: 'nombre' },
  { cle: 'devise', libelle: 'Devise', obligatoire: true },
];

const CHAMPS_CLIENT: Champ[] = [
  { cle: 'client', libelle: 'Raison sociale', obligatoire: true, aide: 'En-tête des documents : remplacée par le logo s\'il est chargé' },
  { cle: 'client_sigle', libelle: 'Sigle (utilisé dans les écrans)', aide: 'Ex. SRM : « Suivi SRM », « Non communiquée SRM »' },
  { cle: 'client_nom_ar', libelle: 'Nom en arabe', arabe: true, aide: 'En-tête des documents : remplacé par le logo s\'il est chargé' },
  { cle: 'client_direction', libelle: 'Direction' },
  { cle: 'client_service', libelle: 'Service chargé du suivi' },
  { cle: 'client_adresse', libelle: 'Adresse' },
  { cle: 'client_ice', libelle: 'ICE' },
  { cle: 'client_telephone', libelle: 'Téléphone' },
  { cle: 'client_email', libelle: 'E-mail' },
  { cle: 'client_representant', libelle: 'Représentant' },
];

const CHAMPS_TITULAIRE: Champ[] = [
  { cle: 'titulaire_nom', libelle: 'Raison sociale', aide: 'En-tête des documents : remplacée par le logo s\'il est chargé' },
  { cle: 'titulaire_nom_ar', libelle: 'Nom en arabe', arabe: true, aide: 'En-tête des documents : remplacé par le logo s\'il est chargé' },
  { cle: 'titulaire_forme_juridique', libelle: 'Forme juridique' },
  { cle: 'titulaire_capital', libelle: 'Capital' },
  { cle: 'titulaire_adresse', libelle: 'Adresse (siège ou domicile élu)' },
  { cle: 'titulaire_ice', libelle: 'ICE' },
  { cle: 'titulaire_if', libelle: 'Identifiant fiscal (IF)' },
  { cle: 'titulaire_rc', libelle: 'Registre du commerce (RC)' },
  { cle: 'titulaire_patente', libelle: 'Taxe professionnelle' },
  { cle: 'titulaire_cnss', libelle: 'CNSS' },
  { cle: 'titulaire_telephone', libelle: 'Téléphone' },
  { cle: 'titulaire_email', libelle: 'E-mail' },
  { cle: 'titulaire_representant', libelle: 'Représentant (signataire)' },
  { cle: 'titulaire_qualite_representant', libelle: 'Qualité du représentant' },
];

const CHAMPS_SUIVI: Champ[] = [
  { cle: 'libelle_reference', libelle: 'Libellé de la référence client', obligatoire: true, aide: 'Ex. « Référence SRM / tournée »' },
  { cle: 'masque_reference', libelle: 'Format de la référence', aide: '« 9 » = un chiffre (ex. 999-999-999) ; vide = saisie libre' },
  { cle: 'delai_alerte_reparation_h', libelle: 'Alerte « non réparée » après (heures)', type: 'nombre', obligatoire: true },
  { cle: 'delai_prealerte_refection_chaussee_j', libelle: 'Préalerte réfection chaussée (jours)', type: 'nombre', obligatoire: true },
  { cle: 'delai_refection_chaussee_j', libelle: 'Délai de réfection chaussée (jours)', type: 'nombre', obligatoire: true },
  { cle: 'delai_alerte_refection_trottoir_j', libelle: 'Alerte réfection trottoir (jours)', type: 'nombre', obligatoire: true },
  { cle: 'rayon_redetection_m', libelle: 'Rayon de re-détection (mètres)', type: 'nombre', obligatoire: true },
  { cle: 'jalons_client', libelle: 'Suivre les jalons du client (communication le jour même, avis avant terrassement, validation)', type: 'case' },
  { cle: 'une_unite_par_prix_et_fuite', libelle: 'Au plus une unité de chaque prix unitaire par fuite', type: 'case' },
  {
    cle: 'longueur_pe_max_m', libelle: 'Polyéthylène couvert par l\'article de réparation (mètres)', type: 'nombre', obligatoire: true,
    aide: 'Au-delà : excédent hors bordereau, à faire valoir (contrôles d\'attachement, travaux hors bordereau, anomalies). 2 m par défaut.',
  },
];

export function OngletMarche({ marcheId, modifiable }: { marcheId: string; modifiable: boolean }) {
  const { recharger } = useSession();
  const [fiche, setFiche] = useState<Record<string, unknown> | null>(null);
  const [os, setOs] = useState<OrdreService[]>([]);
  const [arrets, setArrets] = useState<Arret[]>([]);
  const [delai, setDelai] = useState<Delai | null>(null);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    const sb = getSupabase();
    const [m, o, a, d] = await Promise.all([
      sb.from('marches').select('*').eq('id', marcheId).maybeSingle(),
      sb.from('ordres_service').select('id, numero, date_os, nature, objet, date_effet, observation').eq('marche_id', marcheId).order('date_os'),
      sb.from('arrets_travaux').select('*').eq('marche_id', marcheId).order('date_arret'),
      sb.from('v_delai_marche').select('*').eq('marche_id', marcheId).maybeSingle(),
    ]);
    const premiere = m.error || o.error || a.error || d.error;
    setErreur(premiere ? messageErreur(premiere) : '');
    setFiche((m.data as Record<string, unknown> | null) ?? null);
    setOs((o.data as OrdreService[] | null) ?? []);
    setArrets((a.data as Arret[] | null) ?? []);
    setDelai((d.data as Delai | null) ?? null);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function enregistrerFiche(changements: Record<string, unknown>): Promise<boolean> {
    const { error } = await getSupabase().from('marches').update(changements).eq('id', marcheId);
    if (error) {
      setErreur(messageErreur(error));
      return false;
    }
    await charger();
    recharger();
    return true;
  }

  async function ecrire(table: string, id: string | null, valeurs: Record<string, unknown>): Promise<boolean> {
    setErreur('');
    const sb = getSupabase();
    const { error } = id
      ? await sb.from(table).update(valeurs).eq('id', id)
      : await sb.from(table).insert({ ...valeurs, marche_id: marcheId });
    if (error) {
      setErreur(error.code === '23505' ? 'Ce numéro existe déjà.' : messageErreur(error));
      return false;
    }
    await charger();
    return true;
  }

  async function apresLogo() {
    await charger();
    recharger();
  }

  const libelleOs = (id: string | null) => {
    const o = os.find((x) => x.id === id);
    return o ? `OS n° ${o.numero} du ${dateSeule(o.date_os)}` : '';
  };

  return (
    <>
      {erreur && <p className="erreur">{erreur}</p>}
      {!modifiable && <p className="discret">Lecture seule : la fiche se modifie avec le droit « paramètres / modifier ».</p>}

      <FormulaireFiche titre="Marché" champs={CHAMPS_MARCHE} valeurs={fiche} modifiable={modifiable} enregistrer={enregistrerFiche} />
      <FormulaireFiche titre="Maître d'ouvrage" champs={CHAMPS_CLIENT} valeurs={fiche} modifiable={modifiable} enregistrer={enregistrerFiche} />
      <FormulaireFiche titre="Société titulaire" champs={CHAMPS_TITULAIRE} valeurs={fiche} modifiable={modifiable} enregistrer={enregistrerFiche} />

      <section className="carte">
        <h2>Logos des documents</h2>
        <p className="discret">
          En haut des exports, des lots d&apos;attachement et des rapports par fuite : titulaire à gauche, maître
          d&apos;ouvrage à droite. Image PNG ou JPEG, 2 Mo au plus, réduite à 600 px de large avant l&apos;envoi.
        </p>
        <div className={styles.grille}>
          <Logo
            role="titulaire" titre="Titulaire" marcheId={marcheId} modifiable={modifiable}
            chemin={(fiche?.[COLONNES_LOGO.titulaire] as string | null | undefined) ?? null}
            apresModification={apresLogo}
          />
          <Logo
            role="maitre_ouvrage" titre="Maître d'ouvrage" marcheId={marcheId} modifiable={modifiable}
            chemin={(fiche?.[COLONNES_LOGO.maitre_ouvrage] as string | null | undefined) ?? null}
            apresModification={apresLogo}
          />
        </div>
      </section>

      <FormDelai fiche={fiche} os={os} delai={delai} modifiable={modifiable} enregistrer={enregistrerFiche} />

      <section className="carte">
        <h2>Ordres de service</h2>
        <ListeOs os={os} modifiable={modifiable} ecrire={ecrire} />
      </section>

      <section className="carte">
        <h2>Arrêts et reprises de travaux</h2>
        <p className="discret">Chaque arrêt suspend le délai : la date de fin prévue recule d&apos;autant (arrêt en cours compté jusqu&apos;à aujourd&apos;hui).</p>
        <ListeArrets arrets={arrets} os={os} libelleOs={libelleOs} modifiable={modifiable} ecrire={ecrire} />
      </section>

      <FormulaireFiche
        titre="Suivi et alertes"
        champs={CHAMPS_SUIVI}
        valeurs={fiche}
        modifiable={modifiable}
        enregistrer={enregistrerFiche}
      />

      <BlocDestinataires
        marcheId={marcheId}
        limite={(fiche?.emails_par_jour as number | undefined) ?? null}
        enregistrerLimite={(v) => enregistrerFiche({ emails_par_jour: v })}
      />
    </>
  );
}

function Logo({
  role, titre, marcheId, chemin, modifiable, apresModification,
}: {
  role: RoleLogo; titre: string; marcheId: string; chemin: string | null; modifiable: boolean;
  apresModification: () => Promise<void>;
}) {
  const selecteur = useRef<HTMLInputElement>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [illisible, setIllisible] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [version, setVersion] = useState(0);

  // Aperçu lu avec les droits du compte ; « version » relit après un remplacement au même chemin.
  useEffect(() => {
    setApercu(null);
    setIllisible(false);
    if (!chemin) return;
    let url: string | null = null;
    let annule = false;
    telechargerLogo(chemin)
      .then((blob) => {
        if (annule) return;
        url = URL.createObjectURL(blob);
        setApercu(url);
      })
      .catch(() => {
        if (!annule) setIllisible(true);
      });
    return () => {
      annule = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [chemin, version]);

  async function envoyer(fichiers: FileList | null) {
    const f = fichiers?.[0];
    if (selecteur.current) selecteur.current.value = '';
    if (!f) return;
    setErreur('');
    setOccupe(true);
    try {
      await envoyerLogo(marcheId, role, f, chemin);
      await apresModification();
      setVersion((v) => v + 1);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  async function retirer() {
    if (!chemin || !window.confirm(`Retirer le logo « ${titre} » ? Les documents n'auront plus ce logo.`)) return;
    setErreur('');
    setOccupe(true);
    try {
      await retirerLogo(marcheId, role, chemin);
      await apresModification();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  const droite = role === 'maitre_ouvrage';
  return (
    <div className={styles.logo}>
      <h3>{titre} <span className="discret">({droite ? 'à droite' : 'à gauche'})</span></h3>
      {apercu ? (
        <div className={`${styles.apercu} ${droite ? styles.droite : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={apercu} alt={`Logo : ${titre}`} />
        </div>
      ) : (
        <div className={`${styles.apercu} ${styles.vide}`}>
          {chemin ? (illisible ? 'Aperçu indisponible' : 'Chargement…') : 'Aucun logo : en-tête sans image'}
        </div>
      )}
      {modifiable && (
        <div className="actions">
          <input ref={selecteur} type="file" accept={TYPES_LOGO.join(',')} hidden onChange={(e) => envoyer(e.target.files)} />
          <button type="button" disabled={occupe} onClick={() => selecteur.current?.click()}>
            {occupe ? 'Envoi…' : chemin ? 'Remplacer' : 'Envoyer une image'}
          </button>
          {chemin && <button type="button" className="danger" disabled={occupe} onClick={retirer}>Retirer</button>}
        </div>
      )}
      {erreur && <p className="erreur">{erreur}</p>}
    </div>
  );
}

function FormDelai({
  fiche, os, delai, modifiable, enregistrer,
}: {
  fiche: Record<string, unknown> | null; os: OrdreService[]; delai: Delai | null; modifiable: boolean;
  enregistrer: (c: Record<string, unknown>) => Promise<boolean>;
}) {
  const [osId, setOsId] = useState('');
  const [debut, setDebut] = useState('');
  const [duree, setDuree] = useState('');
  const [unite, setUnite] = useState<'mois' | 'jours'>('mois');
  const [fin, setFin] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!fiche) return;
    setOsId(String(fiche.os_commencement_id ?? ''));
    setDebut(String(fiche.date_commencement ?? ''));
    setUnite(fiche.duree_jours ? 'jours' : 'mois');
    setDuree(String(fiche.duree_jours ?? fiche.duree_mois ?? ''));
    setFin(String(fiche.date_fin ?? ''));
  }, [fiche]);

  function choisirOs(id: string) {
    setOsId(id);
    const o = os.find((x) => x.id === id);
    if (o) setDebut(o.date_effet ?? o.date_os);
  }

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const n = duree.trim() === '' ? null : Number(duree);
    const ok = await enregistrer({
      os_commencement_id: osId || null,
      date_commencement: debut || null,
      duree_mois: unite === 'mois' ? n : null,
      duree_jours: unite === 'jours' ? n : null,
      date_fin: fin || null,
    });
    setMessage(ok ? 'Enregistré.' : '');
  }

  const dureeInvalide = duree.trim() !== '' && !(Number.isInteger(Number(duree)) && Number(duree) > 0);

  return (
    <form className="carte" onSubmit={soumettre}>
      <h2>Délai d&apos;exécution</h2>
      <div className="deux">
        <label>
          Ordre de service de commencement
          <select value={osId} disabled={!modifiable} onChange={(e) => choisirOs(e.target.value)}>
            <option value="">—</option>
            {os.map((o) => (
              <option key={o.id} value={o.id}>n° {o.numero} du {dateSeule(o.date_os)} · {NATURES_OS[o.nature] ?? o.nature}</option>
            ))}
          </select>
        </label>
        <label>
          Date de commencement
          <input type="date" value={debut} disabled={!modifiable} onChange={(e) => setDebut(e.target.value)} />
        </label>
        <label>
          Durée
          <span className="ligne-pieces">
            <input value={duree} disabled={!modifiable} inputMode="numeric" onChange={(e) => setDuree(e.target.value)} />
            <select className="court" value={unite} disabled={!modifiable} onChange={(e) => setUnite(e.target.value as 'mois' | 'jours')}>
              <option value="mois">mois</option>
              <option value="jours">jours</option>
            </select>
          </span>
        </label>
        <label>
          Date de fin du délai initial (facultative)
          <input type="date" value={fin} disabled={!modifiable} onChange={(e) => setFin(e.target.value)} />
          <span className="discret aide">Vide : calculée (veille du jour anniversaire){delai?.date_fin_calculee ? `, soit le ${dateSeule(delai.date_fin_calculee)}` : ''}.</span>
        </label>
      </div>
      {delai?.date_fin_initiale && (
        <dl className="infos">
          <dt>Fin du délai initial</dt><dd>{dateSeule(delai.date_fin_initiale)}</dd>
          <dt>Jours d&apos;arrêt</dt><dd>{delai.jours_arret}{delai.arret_en_cours ? ' (arrêt en cours)' : ''}</dd>
          <dt>Prolongations par avenant</dt><dd>{delai.jours_prolongation} jours</dd>
          <dt>Fin prévue</dt><dd><strong>{dateSeule(delai.date_fin_prevue)}</strong>{delai.jours_restants != null ? ` · ${delai.jours_restants} jours restants` : ''}</dd>
        </dl>
      )}
      {modifiable && (
        <div className="actions">
          <button className="primaire" disabled={dureeInvalide}>Enregistrer</button>
          {dureeInvalide && <span className="erreur">Durée : nombre entier positif.</span>}
          {message && <span className="info">{message}</span>}
        </div>
      )}
    </form>
  );
}

type Ecrire = (table: string, id: string | null, v: Record<string, unknown>) => Promise<boolean>;

function ListeOs({ os, modifiable, ecrire }: { os: OrdreService[]; modifiable: boolean; ecrire: Ecrire }) {
  const [edition, setEdition] = useState<OrdreService | 'nouveau' | null>(null);
  return (
    <>
      {os.length === 0 && <p className="discret">Aucun ordre de service.</p>}
      {os.map((o) =>
        edition !== 'nouveau' && edition?.id === o.id ? (
          <FormOs key={o.id} initial={o} onSubmit={async (v) => (await ecrire('ordres_service', o.id, v)) && setEdition(null)} annuler={() => setEdition(null)} />
        ) : (
          <div key={o.id} className="bloc ligne-param">
            <span>
              <strong>OS n° {o.numero}</strong> du {dateSeule(o.date_os)} · {NATURES_OS[o.nature] ?? o.nature}
              <br />
              <span className="discret">{o.objet}{o.date_effet ? ` · effet le ${dateSeule(o.date_effet)}` : ''}</span>
            </span>
            {modifiable && <button onClick={() => setEdition(o)}>Modifier</button>}
          </div>
        ),
      )}
      {modifiable &&
        (edition === 'nouveau' ? (
          <FormOs onSubmit={async (v) => (await ecrire('ordres_service', null, v)) && setEdition(null)} annuler={() => setEdition(null)} />
        ) : (
          <button onClick={() => setEdition('nouveau')}>+ Ajouter un ordre de service</button>
        ))}
    </>
  );
}

function FormOs({ initial, onSubmit, annuler }: { initial?: OrdreService; onSubmit: (v: Record<string, unknown>) => void; annuler: () => void }) {
  const [numero, setNumero] = useState(initial?.numero ?? '');
  const [dateOs, setDateOs] = useState(initial?.date_os ?? '');
  const [nature, setNature] = useState(initial?.nature ?? 'autre');
  const [objet, setObjet] = useState(initial?.objet ?? '');
  const [effet, setEffet] = useState(initial?.date_effet ?? '');
  const [observation, setObservation] = useState(initial?.observation ?? '');
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      numero: numero.trim(), date_os: dateOs, nature, objet: objet.trim() || NATURES_OS[nature],
      date_effet: effet || null, observation: observation.trim() || null,
    });
  };
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <div className="deux">
        <label>Numéro<input value={numero} onChange={(e) => setNumero(e.target.value)} required /></label>
        <label>Date de l&apos;OS<input type="date" value={dateOs} onChange={(e) => setDateOs(e.target.value)} required /></label>
        <label>
          Nature
          <select value={nature} onChange={(e) => setNature(e.target.value)}>
            {Object.entries(NATURES_OS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Date d&apos;effet<input type="date" value={effet} onChange={(e) => setEffet(e.target.value)} /></label>
      </div>
      <label>Objet<input value={objet} onChange={(e) => setObjet(e.target.value)} placeholder={NATURES_OS[nature]} /></label>
      <label>Observation<textarea rows={2} value={observation} onChange={(e) => setObservation(e.target.value)} /></label>
      <div className="actions">
        <button className="primaire" disabled={!numero.trim() || !dateOs}>Enregistrer</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}

function ListeArrets({
  arrets, os, libelleOs, modifiable, ecrire,
}: {
  arrets: Arret[]; os: OrdreService[]; libelleOs: (id: string | null) => string; modifiable: boolean; ecrire: Ecrire;
}) {
  const [edition, setEdition] = useState<Arret | 'nouveau' | null>(null);
  const jours = (a: Arret) => (a.date_reprise
    ? Math.round((Date.parse(a.date_reprise) - Date.parse(a.date_arret)) / 86400000)
    : null);
  return (
    <>
      {arrets.length === 0 && <p className="discret">Aucun arrêt de travaux.</p>}
      {arrets.map((a) =>
        edition !== 'nouveau' && edition?.id === a.id ? (
          <FormArret key={a.id} initial={a} os={os} onSubmit={async (v) => (await ecrire('arrets_travaux', a.id, v)) && setEdition(null)} annuler={() => setEdition(null)} />
        ) : (
          <div key={a.id} className="bloc ligne-param">
            <span className={a.actif ? '' : 'discret'}>
              <strong>Arrêt du {dateSeule(a.date_arret)}</strong>
              {a.date_reprise ? ` · reprise le ${dateSeule(a.date_reprise)} (${jours(a)} jours)` : ' · en cours'}
              {a.actif ? '' : ' (saisie annulée)'}
              <br />
              <span className="discret">
                {a.motif}
                {a.os_arret_id ? ` · ${libelleOs(a.os_arret_id)}` : ''}
                {a.os_reprise_id ? ` · reprise : ${libelleOs(a.os_reprise_id)}` : ''}
              </span>
            </span>
            {modifiable && (
              <span className="actions">
                <button onClick={() => setEdition(a)}>{a.date_reprise ? 'Modifier' : 'Saisir la reprise'}</button>
                <button onClick={() => ecrire('arrets_travaux', a.id, { actif: !a.actif })}>{a.actif ? 'Annuler la saisie' : 'Rétablir'}</button>
              </span>
            )}
          </div>
        ),
      )}
      {modifiable &&
        (edition === 'nouveau' ? (
          <FormArret os={os} onSubmit={async (v) => (await ecrire('arrets_travaux', null, v)) && setEdition(null)} annuler={() => setEdition(null)} />
        ) : (
          <button onClick={() => setEdition('nouveau')}>+ Enregistrer un arrêt</button>
        ))}
    </>
  );
}

function FormArret({
  initial, os, onSubmit, annuler,
}: { initial?: Arret; os: OrdreService[]; onSubmit: (v: Record<string, unknown>) => void; annuler: () => void }) {
  const [dateArret, setDateArret] = useState(initial?.date_arret ?? '');
  const [osArret, setOsArret] = useState(initial?.os_arret_id ?? '');
  const [motif, setMotif] = useState(initial?.motif ?? '');
  const [dateReprise, setDateReprise] = useState(initial?.date_reprise ?? '');
  const [osReprise, setOsReprise] = useState(initial?.os_reprise_id ?? '');
  const [observation, setObservation] = useState(initial?.observation ?? '');
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      date_arret: dateArret, os_arret_id: osArret || null, motif: motif.trim(),
      date_reprise: dateReprise || null, os_reprise_id: osReprise || null, observation: observation.trim() || null,
    });
  };
  const choixOs = (valeur: string, maj: (v: string) => void, nature: string) => (
    <select value={valeur} onChange={(e) => maj(e.target.value)}>
      <option value="">—</option>
      {os.filter((o) => o.nature === nature || o.id === valeur).map((o) => (
        <option key={o.id} value={o.id}>n° {o.numero} du {dateSeule(o.date_os)}</option>
      ))}
    </select>
  );
  const incoherent = !!dateReprise && !!dateArret && dateReprise < dateArret;
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <div className="deux">
        <label>Date d&apos;arrêt<input type="date" value={dateArret} onChange={(e) => setDateArret(e.target.value)} required /></label>
        <label>OS d&apos;arrêt{choixOs(osArret, setOsArret, 'arret')}</label>
        <label>Date de reprise<input type="date" value={dateReprise} onChange={(e) => setDateReprise(e.target.value)} /></label>
        <label>OS de reprise{choixOs(osReprise, setOsReprise, 'reprise')}</label>
      </div>
      <label>Motif<input value={motif} onChange={(e) => setMotif(e.target.value)} required placeholder="Intempéries, demande du maître d'ouvrage…" /></label>
      <label>Observation<textarea rows={2} value={observation} onChange={(e) => setObservation(e.target.value)} /></label>
      <p className="discret">Les OS d&apos;arrêt et de reprise se créent d&apos;abord dans « Ordres de service » (nature « Arrêt » ou « Reprise »).</p>
      <div className="actions">
        <button className="primaire" disabled={!dateArret || !motif.trim() || incoherent}>Enregistrer</button>
        <button type="button" onClick={annuler}>Annuler</button>
        {incoherent && <span className="erreur">La reprise précède l&apos;arrêt.</span>}
      </div>
    </form>
  );
}
