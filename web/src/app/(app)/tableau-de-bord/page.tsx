'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { libellesMarche, messageErreur } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getSupabase, lireTout } from '@/lib/supabase';
import {
  COLONNES_TDB, libellePeriode, periodePour,
  type ArticleTdb, type ChoixPeriode, type FuiteTdb, type LigneAttacheeTdb, type LotTdb, type Periode, type UniteResteTdb,
} from '@/lib/ui/tableau-de-bord';
import { BlocAttachements, type DonneesAttachements } from './BlocAttachements';
import { Segments } from './Graphiques';
import { Synthese, type Anomalie } from './Synthese';
import styles from './tableau-de-bord.module.css';

type Reponse<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

interface Donnees {
  marcheId: string;
  maintenant: Date;
  fuites: FuiteTdb[];
  anomalies: Anomalie[] | null;
  attachements: DonneesAttachements | null;
}

const CHOIX_PERIODE: [ChoixPeriode, string][] = [
  ['mois', 'Mois en cours'], ['semaine', 'Semaine en cours'], ['mois_precedent', 'Mois précédent'], ['libre', 'Dates libres'],
];

// L'API renvoie au plus 1 000 lignes par requête : lecture par pages (clé de tri stable).
const toutLire = <T,>(requete: (de: number, a: number) => unknown) =>
  lireTout<T>((de, a) => requete(de, a) as Reponse<T>, 1000, 50000);
async function lire<T>(requete: unknown): Promise<T[]> {
  const { data, error } = await (requete as Reponse<T>);
  if (error) throw error;
  return data ?? [];
}

export default function TableauDeBord() {
  const { marche, peut } = useSession();
  const libelles = libellesMarche(marche);
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);
  const [choix, setChoix] = useState<ChoixPeriode>('mois');
  const [libre, setLibre] = useState<Partial<Periode>>({});

  const marcheId = marche?.id;
  const lireFuites = peut('fuites', 'lire');
  // v_anomalies lit réparations, quantités et prix : sans ces droits elle signalerait de fausses anomalies.
  const voirAnomalies = peut('quantites', 'lire') && peut('interventions', 'lire');
  // Attachements, prix et montants : jamais pour les agents de terrain (droits « attachements » et « quantités »).
  const voirAttachements = peut('attachements', 'lire') && peut('quantites', 'lire');

  // Une réponse arrivée après un changement de marché (ou une actualisation plus récente) est ignorée.
  const derniereDemande = useRef(0);
  const charger = useCallback(async () => {
    if (!marcheId || !lireFuites) return;
    const demande = ++derniereDemande.current;
    setErreur('');
    setDonnees((d) => (d?.marcheId === marcheId ? d : null));
    if (!navigator.onLine) {
      setErreur('Pas de réseau : le tableau de bord s\'affichera au retour de la connexion (bouton « Actualiser »).');
      setChargement(false);
      return;
    }
    setChargement(true);
    const sb = getSupabase();
    try {
      const [fuites, anomalies, lots, articles, lignes, unites] = await Promise.all([
        toutLire<FuiteTdb>((de, a) => sb.from('v_fuites').select(COLONNES_TDB).eq('marche_id', marcheId).order('numero').range(de, a)),
        voirAnomalies
          ? toutLire<Anomalie>((de, a) => sb.from('v_anomalies').select('fuite_id, anomalie').eq('marche_id', marcheId)
            .order('fuite_id').order('anomalie').order('reparation_id', { nullsFirst: true }).range(de, a))
          : null,
        voirAttachements
          ? lire<LotTdb>(sb.from('attachements').select('id, numero, statut, date_arret').eq('marche_id', marcheId).is('supprime_le', null))
          : null,
        voirAttachements
          ? lire<ArticleTdb>(sb.from('prix').select('id, numero, ordre, designation, unite, quantite_marche, pu_ht, hors_bordereau, actif')
            .eq('marche_id', marcheId))
          : null,
        voirAttachements
          ? toutLire<LigneAttacheeTdb>((de, a) => sb.from('v_attachement_lignes').select('prix_id, quantite, pu_ht')
            .eq('marche_id', marcheId).eq('attachement_statut', 'arrete').order('id').range(de, a))
          : null,
        voirAttachements
          ? toutLire<UniteResteTdb>((de, a) => sb.from('v_a_attacher').select('fuite_id, prix_id, reste, brouillon_id')
            .eq('marche_id', marcheId).neq('reste', 0).order('fuite_id').order('prix_id').range(de, a))
          : null,
      ]);
      if (demande !== derniereDemande.current) return;
      setDonnees({
        marcheId, maintenant: new Date(), fuites, anomalies,
        attachements: lots && articles && lignes && unites ? { lots, articles, lignes, unites } : null,
      });
    } catch (e) {
      if (demande !== derniereDemande.current) return;
      setErreur(messageErreur(e));
    }
    setChargement(false);
  }, [marcheId, lireFuites, voirAnomalies, voirAttachements]);

  useEffect(() => {
    charger();
  }, [charger]);

  const maintenant = donnees?.maintenant;
  const periode = useMemo(() => periodePour(choix, maintenant, libre), [choix, maintenant, libre]);

  function choisirPeriode(c: ChoixPeriode) {
    if (c === 'libre' && !libre.du && !libre.au) setLibre(periode);
    setChoix(c);
  }

  if (!lireFuites) return <p className="carte">Votre compte n&apos;a pas accès aux fuites de ce marché.</p>;

  const titrePeriode = libellePeriode(periode);

  return (
    <>
      <div className="barre">
        <h1>Tableau de bord <span className="sous-titre">{marche?.code} · {titrePeriode}</span></h1>
        <div className="actions en-tete">
          <button onClick={charger} disabled={chargement}>Actualiser</button>
        </div>
      </div>

      <div className={styles.periode}>
        <Segments libelle="Période" valeur={choix} onChange={choisirPeriode} choix={CHOIX_PERIODE} />
        {choix === 'libre' && (
          <div className={styles.dates}>
            <label>Du<input type="date" value={libre.du ?? ''} max={libre.au || undefined}
              onChange={(e) => setLibre((l) => ({ ...l, du: e.target.value }))} /></label>
            <label>Au<input type="date" value={libre.au ?? ''} min={libre.du || undefined}
              onChange={(e) => setLibre((l) => ({ ...l, au: e.target.value }))} /></label>
          </div>
        )}
      </div>
      <p className={`discret ${styles.rappel}`}>
        Période : {titrePeriode}. Jours comptés à l&apos;heure du Maroc ; fuites supprimées exclues.
      </p>

      {erreur && <p className="erreur">{erreur}</p>}
      {chargement && !donnees && <p className="discret">Chargement…</p>}
      {donnees && donnees.fuites.length === 0 && <p className="carte">Aucune fuite enregistrée sur ce marché pour l&apos;instant.</p>}
      {donnees && donnees.fuites.length > 0 && (
        <Synthese fuites={donnees.fuites} anomalies={donnees.anomalies} maintenant={donnees.maintenant}
          periode={periode} titrePeriode={titrePeriode} seuilH={libelles.delaiReparationH} />
      )}
      {donnees?.attachements && <BlocAttachements donnees={donnees.attachements} devise={libelles.devise} />}
    </>
  );
}
