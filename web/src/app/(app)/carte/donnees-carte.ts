'use client';

// Données et carte sans réseau communes aux deux écrans de /carte : carte des fuites (panneau, Balayage de l'APK) et
// carte terrain (bouton « Carte » de l'APK, ?mode=terrain).
import { useCallback, useEffect, useRef, useState } from 'react';
import { messageErreur } from '@/lib/format';
import { langueApk } from '@/lib/langue-apk';
import { avecCopie, cleCopieReseau, type ContexteReseau } from '@/lib/reseau/donnees';
import { choisirPaquet, lireEtatPaquet, paquetActif, preparerPaquet, type EtatPaquet } from '@/lib/reseau/paquet-carte';
import { ouvrirFondCarte } from '@/lib/reseau/tuiles';
import { useSession } from '@/lib/session';
import { getSupabase, lireTout } from '@/lib/supabase';
import { COLONNES_CARTE, FICHIERS_MAPLIBRE, type Contour, type FuiteCarte } from './commun';
import { fichiersFond, styleFondLocal } from './fond-local';

export type SecteurCarte = Contour & { zone_id: string | null };

/** Message à l'APK quand la carte est ouverte dans sa WebView (rien dans un navigateur). */
export function signalerApk(type: string, donnees: Record<string, unknown> = {}) {
  const w = window as Window & { ReactNativeWebView?: { postMessage: (m: string) => void } };
  try {
    w.ReactNativeWebView?.postMessage(JSON.stringify({ ...donnees, type }));
  } catch {
    /* WebView fermée */
  }
}

/**
 * Marché ouvert par l'APK (`?marche=`, celui de la liste de la tablette) quand le compte y est affecté : choisi dans
 * le panneau, puis rendu une fois actif (undefined pendant le changement, pour ne rien lire dans l'autre marché) ;
 * sans demande, le marché du panneau.
 */
export function useMarcheDemande(demande: string | null): string | undefined {
  const { marche, marches, choisirMarche } = useSession();
  const valide = !!demande && marches.some((m) => m.id === demande);
  useEffect(() => {
    if (valide && demande && marche?.id !== demande) choisirMarche(demande);
  }, [valide, demande, marche?.id, choisirMarche]);
  return valide && marche?.id !== demande ? undefined : marche?.id;
}

export const MESSAGE_SANS_RESEAU = "Pas de réseau : la carte des fuites s'affichera au retour de la connexion (bouton « Actualiser »).";

/**
 * Fuites, secteurs (avec leur état de balayage) et zones du marché. Avec le paquet (carte sans réseau), la dernière
 * lecture est gardée : les fuites restent sur la carte sans réseau.
 */
export function useDonneesCarte(marcheId: string | undefined, paquet: boolean | null) {
  const [fuites, setFuites] = useState<FuiteCarte[]>([]);
  const [secteurs, setSecteurs] = useState<SecteurCarte[]>([]);
  const [zones, setZones] = useState<Contour[]>([]);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);

  const derniereDemande = useRef(0);
  const charger = useCallback(async () => {
    if (!marcheId || paquet === null) return;
    const demande = ++derniereDemande.current;
    setErreur('');
    if (!paquet && !navigator.onLine) {
      setErreur(MESSAGE_SANS_RESEAU);
      setChargement(false);
      return;
    }
    setChargement(true);
    const sb = getSupabase();
    const lire = async () => {
      const [f, s, z] = await Promise.all([
        lireTout<FuiteCarte>((de, a) => sb.from('v_fuites').select(COLONNES_CARTE).eq('marche_id', marcheId)
          .order('numero', { ascending: false }).range(de, a) as unknown as PromiseLike<{ data: FuiteCarte[] | null; error: { message: string } | null }>),
        sb.from('secteurs').select('id, zone_id, code, libelle, geom, statut_balayage').eq('marche_id', marcheId).eq('actif', true).order('libelle'),
        sb.from('zones').select('id, code, libelle, geom').eq('marche_id', marcheId).eq('actif', true).order('numero'),
      ]);
      if (s.error) throw s.error;
      if (z.error) throw z.error;
      return { fuites: [...f], tronque: !!f.tronque, secteurs: (s.data as SecteurCarte[] | null) ?? [], zones: (z.data as Contour[] | null) ?? [] };
    };
    try {
      const lu = paquet ? await avecCopie(cleCopieReseau('fuites', marcheId), lire) : { valeur: await lire(), copieDu: null };
      if (demande !== derniereDemande.current) return;
      const v = lu.valeur;
      setFuites(v.fuites);
      // Copie servie sans réseau : la barre de la carte le dit déjà (« Hors ligne · état du … »).
      if (!lu.copieDu && v.tronque) setErreur(`Carte incomplète : seules les ${v.fuites.length.toLocaleString('fr-FR')} fuites les plus récentes sont chargées.`);
      setSecteurs(v.secteurs);
      setZones(v.zones);
    } catch (e) {
      if (demande !== derniereDemande.current) return;
      setErreur(messageErreur(e));
    }
    setChargement(false);
  }, [marcheId, paquet]);

  useEffect(() => {
    charger();
  }, [charger]);

  return { fuites, secteurs, zones, erreur, chargement, charger };
}

/**
 * Carte sans réseau (lot CH) : paquet gardé sur l'appareil (APK : toujours ; navigateur : au choix), préparé ou mis
 * à jour 6 s après l'ouverture avec réseau (l'affichage passe d'abord), une fois par marché et par ouverture ; l'APK
 * apprend s'il est prêt, et pour quel compte (seul ce compte ouvrira la carte sans réseau).
 */
export function usePaquetCarte(marcheId: string | undefined, contexte: ContexteReseau | null, utilisateurId: string | undefined) {
  const [paquet, setPaquet] = useState<boolean | null>(null);
  useEffect(() => setPaquet(paquetActif()), []);
  const [etat, setEtat] = useState<EtatPaquet | null>(null);
  const [etape, setEtape] = useState('');
  const [erreur, setErreur] = useState('');

  const preparer = useCallback(async (forcerPages = false) => {
    if (!marcheId || !contexte || !navigator.onLine) return;
    setErreur('');
    try {
      setEtat(await preparerPaquet({
        marcheId, contexte, page: '/carte?mode=balayage', fichiers: [...FICHIERS_MAPLIBRE, ...fichiersFond()], etape: setEtape, forcerPages,
      }));
    } catch (e) {
      setErreur(messageErreur(e));
      setEtape('');
    }
  }, [marcheId, contexte]);
  useEffect(() => {
    if (!paquet || !marcheId) return;
    let annule = false;
    lireEtatPaquet(marcheId).then((e) => { if (!annule) setEtat(e); });
    return () => { annule = true; };
  }, [paquet, marcheId]);
  const lance = useRef<string | null>(null);
  useEffect(() => {
    if (!paquet || !marcheId || !contexte || lance.current === marcheId) return;
    lance.current = marcheId;
    const minuteur = setTimeout(() => void preparer(), 6000);
    return () => clearTimeout(minuteur);
  }, [paquet, marcheId, contexte, preparer]);
  useEffect(() => {
    if (paquet && marcheId && utilisateurId) signalerApk('carte-hors-ligne', { pret: !!etat?.pret, marche: marcheId, utilisateur: utilisateurId });
  }, [paquet, marcheId, utilisateurId, etat]);

  // Fond de la ville (copie de l'appareil, sinon R2) ; sans fond déposé : fond en ligne habituel.
  const fondLocal = useCallback(async () => {
    if (!paquet || !marcheId) return null;
    const f = await ouvrirFondCarte(marcheId);
    return f ? styleFondLocal(f.url, langueApk() === 'fr' ? 'fr' : 'ar', window.location.origin) : null;
  }, [paquet, marcheId]);

  const choisir = (v: boolean) => {
    choisirPaquet(v);
    setPaquet(v);
    if (v) void preparer(true);
  };

  return { paquet, etat, etape, erreur, preparer, fondLocal, choisir };
}
