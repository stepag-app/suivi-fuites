'use client';

// État du réseau sur la carte : interrupteur et choix mémorisés, zones et secteurs, état de balayage relu à part.
// Affichage par les tuiles vectorielles du réseau (X5) quand l'archive existe et porte l'empreinte du réseau en base ;
// sinon chargement des tronçons par secteur (cache IndexedDB), nœuds à partir du zoom 15. En tuiles, la géométrie
// n'est lue que si `besoinGeometries` (mode balayage : lasso et « Prolonger » travaillent sur les tronçons).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { construireArbre, tousLesSecteurs, type NoeudZone } from '@/lib/reseau/arbre';
import {
  chargerContexteReseau, chargerEtatBalayage, chargerNoeudsSecteur, chargerNomsProfils, chargerTronconsSecteur,
  messageReseau, type ContexteReseau,
} from '@/lib/reseau/donnees';
import { etatsFeatures } from '@/lib/reseau/etat';
import { paletteSecteurs, type PaletteReseau } from '@/lib/reseau/palette';
import { estampilleReseau } from '@/lib/reseau/tuiles-format';
import { indexerTroncons, type TronconIndexe } from '@/lib/reseau/selection';
import { ouvrirTuilesReseau, type TuilesReseau } from '@/lib/reseau/tuiles';
import { SANS_SECTEUR, type CollectionNoeuds, type CollectionTroncons, type Coloration, type EtatFeature } from '@/lib/reseau/types';
import type { EtatBalayageTroncon } from '@/lib/types';
import type { SecteurAffiche } from './reseau-carte';

const CLE_ACTIF = 'suivi-fuites:reseau:actif';
const CLE_COLORATION = 'suivi-fuites:reseau:coloration';
const cleSecteurs = (marcheId: string) => `suivi-fuites:reseau:secteurs:${marcheId}`;
const ZOOM_NOEUDS = 15;
const CHARGEMENTS_PARALLELES = 3;

const lireLocal = (cle: string) => {
  try {
    return window.localStorage.getItem(cle);
  } catch {
    return null;
  }
};
const ecrireLocal = (cle: string, valeur: string) => {
  try {
    window.localStorage.setItem(cle, valeur);
  } catch {
    /* stockage indisponible */
  }
};
const COLORATIONS: Coloration[] = ['secteur', 'balayage', 'diametre'];

export interface EtatReseau {
  actif: boolean;
  setActif: (v: boolean) => void;
  coloration: Coloration;
  setColoration: (c: Coloration) => void;
  choisis: Set<string>;
  setChoisis: (s: Set<string>) => void;
  contexte: ContexteReseau | null;
  arbre: NoeudZone[];
  palette: PaletteReseau;
  libelles: Map<string, { secteur: string; zone: string }>;
  secteursAffiches: SecteurAffiche[];
  index: Map<string, TronconIndexe>;
  etats: Map<string, EtatFeature>;
  chargement: boolean;
  nbEnChargement: number;
  erreur: string;
  recharger: () => Promise<void>;
  rechargerEtats: () => Promise<void>;
  surZoom: (zoom: number) => void;
  /** Archive de tuiles à jour (affichage en tuiles), sinon null (lecture par secteur). */
  tuiles: TuilesReseau | null;
  /** attente : pas encore décidé ; absentes ; perimees : réseau modifié depuis la génération ; a_jour. */
  etatTuiles: 'attente' | 'absentes' | 'perimees' | 'a_jour';
  /** Bornes du réseau [ouest, sud, est, nord] (archive, sinon contours des secteurs et des zones). */
  bornes: [number, number, number, number] | null;
  /** Longueur (m) de chaque tronçon connu (archive ou géométries chargées). */
  longueurs: Map<string, number>;
  /** Tronçons des secteurs cochés, avec leur diamètre et leur zone (légende, impression). */
  inventaire: { id: string; d: number | null; z: string | null }[];
}

export function useReseau(marcheId: string | undefined, peutLireBalayage: boolean, forcerActif = false, besoinGeometries = false): EtatReseau {
  const [actif, setActifEtat] = useState(false);
  const [coloration, setColorationEtat] = useState<Coloration>('secteur');
  const [choisis, setChoisisEtat] = useState<Set<string>>(new Set());
  const [choisisInitialises, setChoisisInitialises] = useState(false);
  const [contexte, setContexte] = useState<ContexteReseau | null>(null);
  const [lignesEtat, setLignesEtat] = useState<EtatBalayageTroncon[]>([]);
  const [noms, setNoms] = useState<{ agents: Map<string, string> }>({ agents: new Map() });
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [version, setVersion] = useState(0);
  const [zoom, setZoom] = useState(12);

  // Géométries chargées (hors état React : volumineuses) ; `version` force le rendu quand elles changent.
  const troncons = useRef(new Map<string, CollectionTroncons>());
  const noeuds = useRef(new Map<string, CollectionNoeuds>());
  const enCours = useRef(new Set<string>());
  const index = useRef(new Map<string, TronconIndexe>());
  const [nbEnChargement, setNbEnChargement] = useState(0);
  const [archive, setArchive] = useState<TuilesReseau | null>(null);
  const [archiveLue, setArchiveLue] = useState(false);

  // Mémorisation (interrupteur, coloration) : lue au montage.
  useEffect(() => {
    setActifEtat(forcerActif || lireLocal(CLE_ACTIF) === '1');
    const c = lireLocal(CLE_COLORATION) as Coloration | null;
    if (c && COLORATIONS.includes(c)) setColorationEtat(c);
  }, [forcerActif]);

  const setActif = useCallback((v: boolean) => {
    setActifEtat(v);
    ecrireLocal(CLE_ACTIF, v ? '1' : '0');
  }, []);
  const setColoration = useCallback((c: Coloration) => {
    setColorationEtat(c);
    ecrireLocal(CLE_COLORATION, c);
  }, []);
  const setChoisis = useCallback((s: Set<string>) => {
    setChoisisEtat(s);
    if (marcheId) ecrireLocal(cleSecteurs(marcheId), JSON.stringify([...s]));
  }, [marcheId]);

  // Changement de marché : tout oublier.
  useEffect(() => {
    troncons.current.clear();
    noeuds.current.clear();
    index.current = new Map();
    enCours.current.clear();
    setContexte(null);
    setLignesEtat([]);
    setChoisisInitialises(false);
    setChoisisEtat(new Set());
    setArchive(null);
    setArchiveLue(false);
    setVersion((v) => v + 1);
  }, [marcheId]);

  const rechargerEtats = useCallback(async () => {
    if (!marcheId || !peutLireBalayage) return;
    try {
      const lignes = await chargerEtatBalayage(marcheId);
      setLignesEtat(lignes);
      const agents = await chargerNomsProfils(lignes.map((l) => l.agent_id).filter((x): x is string => !!x));
      setNoms({ agents });
    } catch (e) {
      setErreur(messageReseau(e));
    }
  }, [marcheId, peutLireBalayage]);

  const recharger = useCallback(async () => {
    if (!marcheId || !actif) return;
    setChargement(true);
    setErreur('');
    try {
      // Archive relue aussi (régénérée entre-temps ?) : même ETag, même objet, l'affichage ne bouge pas.
      const [ctx, t] = await Promise.all([chargerContexteReseau(marcheId), ouvrirTuilesReseau(marcheId)]);
      setArchive(t);
      setArchiveLue(true);
      setContexte(ctx);
      if (!ctx.disponible) setErreur('La base de données n\'a pas encore le plan du réseau (migration du lot S2 à déployer).');
      await rechargerEtats();
    } catch (e) {
      setErreur(messageReseau(e));
    }
    setChargement(false);
  }, [marcheId, actif, rechargerEtats]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  // Secteurs cochés : mémorisés par marché ; par défaut, tous.
  useEffect(() => {
    if (!contexte || !marcheId || choisisInitialises) return;
    const memorise = lireLocal(cleSecteurs(marcheId));
    const connus = new Set([...contexte.secteurs.map((s) => s.id), SANS_SECTEUR]);
    let choix: Set<string> | null = null;
    if (memorise) {
      try {
        const liste = JSON.parse(memorise) as unknown;
        if (Array.isArray(liste)) choix = new Set(liste.filter((x): x is string => typeof x === 'string' && connus.has(x)));
      } catch {
        choix = null;
      }
    }
    setChoisisEtat(choix ?? new Set(contexte.secteurs.map((s) => s.id)));
    setChoisisInitialises(true);
  }, [contexte, marcheId, choisisInitialises]);

  const palette = useMemo(
    () => paletteSecteurs(contexte?.zones ?? [], contexte?.secteurs ?? []),
    [contexte],
  );
  const arbre = useMemo(
    () => (contexte ? construireArbre(contexte.zones, contexte.secteurs, contexte.lignes, palette) : []),
    [contexte, palette],
  );
  const libelles = useMemo(() => {
    const m = new Map<string, { secteur: string; zone: string }>();
    for (const z of arbre) for (const s of z.secteurs) m.set(s.id, { secteur: `${s.code} · ${s.libelle}`, zone: `Zone ${z.numero} · ${z.libelle}` });
    return m;
  }, [arbre]);

  // Estampille d'un secteur (invalidation du cache) : modifie_le de la vue ; non zonés : nombre et linéaire.
  const estampille = useCallback((secteurId: string): string | null => {
    if (!contexte) return null;
    if (secteurId === SANS_SECTEUR) return contexte.sansSecteur ? `${contexte.sansSecteur.nb_troncons}:${contexte.sansSecteur.lineaire_m}` : '0';
    return contexte.lignes.find((l) => l.secteur_id === secteurId)?.modifie_le ?? null;
  }, [contexte]);
  const estampilleCourante = useRef(estampille);
  estampilleCourante.current = estampille;

  const empreinte = useMemo(() => (contexte?.disponible ? estampilleReseau(contexte.lignes, contexte.sansSecteur) : null), [contexte]);
  const etatTuiles: EtatReseau['etatTuiles'] = !archiveLue || !contexte ? 'attente'
    : !archive ? 'absentes' : archive.infos?.estampille === empreinte ? 'a_jour' : 'perimees';
  const tuiles = etatTuiles === 'a_jour' ? archive : null;
  const decide = etatTuiles !== 'attente';

  // Chargement des tronçons des secteurs cochés (3 à la fois), nœuds à partir du zoom 15 ; en tuiles, seulement
  // la géométrie demandée (balayage), sans les nœuds (déjà dans les tuiles).
  useEffect(() => {
    if (!actif || !marcheId || !contexte?.disponible || !decide) return;
    if (tuiles && !besoinGeometries) return;
    let annule = false;
    const aCharger = [...choisis].filter((id) => !troncons.current.has(id) && !enCours.current.has(`t:${id}`));
    const noeudsACharger = !tuiles && zoom >= ZOOM_NOEUDS
      ? [...choisis].filter((id) => !noeuds.current.has(id) && !enCours.current.has(`n:${id}`))
      : [];
    const taches: (() => Promise<void>)[] = [
      ...aCharger.map((id) => async () => {
        enCours.current.add(`t:${id}`);
        const e = estampille(id);
        try {
          const data = await chargerTronconsSecteur(marcheId, id, e);
          // Arrivé après une annulation (zoom, case décochée), le résultat reste bon tant que la géométrie du
          // secteur n'a pas changé : on le garde, car l'effet suivant ne l'a pas redemandé (il était en cours).
          if (estampilleCourante.current(id) !== e) return;
          troncons.current.set(id, data);
          for (const [k, v] of indexerTroncons(data.features)) index.current.set(k, v);
        } catch (erreurChargement) {
          if (!annule) setErreur(messageReseau(erreurChargement));
        } finally {
          enCours.current.delete(`t:${id}`);
        }
      }),
      ...noeudsACharger.map((id) => async () => {
        enCours.current.add(`n:${id}`);
        const e = estampille(id);
        try {
          const data = await chargerNoeudsSecteur(marcheId, id, e);
          if (estampilleCourante.current(id) === e) noeuds.current.set(id, data);
        } catch {
          /* les nœuds sont accessoires */
        } finally {
          enCours.current.delete(`n:${id}`);
        }
      }),
    ];
    if (!taches.length) return;
    const file = [...taches];
    setNbEnChargement((n) => n + file.length);
    // Chaque tâche lancée est décomptée, même annulée ; à l'annulation (zoom, case décochée), la file restante
    // est abandonnée et décomptée d'un coup : l'effet suivant la reprend. Sinon le compteur ne redescend jamais.
    const ouvrier = async () => {
      while (file.length && !annule) {
        const t = file.shift()!;
        await t();
        setNbEnChargement((n) => Math.max(0, n - 1));
        setVersion((v) => v + 1);
      }
    };
    void Promise.all(Array.from({ length: Math.min(CHARGEMENTS_PARALLELES, file.length) }, ouvrier));
    return () => {
      annule = true;
      setNbEnChargement((n) => Math.max(0, n - file.length));
      file.length = 0;
    };
  }, [actif, marcheId, contexte, choisis, zoom, estampille, decide, tuiles, besoinGeometries]);

  // L'estampille change (balayage enregistré ne change pas la géométrie ; un zonage si) : on oublie les
  // secteurs dont la géométrie peut avoir bougé, la relecture passe par le cache si rien n'a changé.
  const estampillesVues = useRef(new Map<string, string | null>());
  useEffect(() => {
    if (!contexte) return;
    let change = false;
    for (const id of [...troncons.current.keys()]) {
      const e = estampille(id);
      if (estampillesVues.current.has(id) && estampillesVues.current.get(id) !== e) {
        troncons.current.delete(id);
        noeuds.current.delete(id);
        change = true;
      }
      estampillesVues.current.set(id, e);
    }
    for (const id of choisis) estampillesVues.current.set(id, estampille(id));
    if (change) setVersion((v) => v + 1);
  }, [contexte, choisis, estampille]);

  const secteursAffiches = useMemo<SecteurAffiche[]>(() => {
    if (!actif) return [];
    return [...choisis].map((id) => ({ id, data: troncons.current.get(id) ?? null, noeuds: noeuds.current.get(id) ?? null }));
    // version : les géométries vivent hors de l'état React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, choisis, version]);

  // Mesure de fluidité (scripts/mesurer-carte.mjs) : secteurs attendus et déjà chargés ; jamais en production.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_MESURE_CARTE !== '1') return;
    (window as unknown as { __mesureReseau?: unknown }).__mesureReseau = {
      attendus: actif ? choisis.size : 0,
      charges: tuiles ? choisis.size : [...choisis].filter((id) => troncons.current.has(id)).length,
      mode: tuiles ? 'tuiles' : 'geojson',
    };
  }, [actif, choisis, version, tuiles]);

  const bornes = useMemo<[number, number, number, number] | null>(() => {
    if (archive) return archive.bornes;
    const coords = [...(contexte?.secteurs ?? []), ...(contexte?.zones ?? [])].flatMap((c) =>
      !c.geom ? [] : c.geom.type === 'Polygon' ? c.geom.coordinates.flat() : c.geom.coordinates.flat(2));
    if (!coords.length) return null;
    const x = coords.map((c) => c[0]);
    const y = coords.map((c) => c[1]);
    return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)];
  }, [archive, contexte]);

  const longueurs = useMemo(() => {
    const m = new Map<string, number>();
    if (archive) archive.index.ids.forEach((id, i) => m.set(id, archive.index.l[i]));
    for (const [id, t] of index.current) if (!m.has(id)) m.set(id, t.longueur);
    return m;
    // L'index vit hors de l'état React : `version` suit ses changements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archive, version]);

  const inventaire = useMemo(() => {
    if (!actif) return [];
    if (tuiles) {
      const { ids, s: rangs, d, secteurs } = tuiles.index;
      const zoneDe = new Map((contexte?.secteurs ?? []).map((x) => [x.id, x.zone_id]));
      const voulus = secteurs.map((id) => choisis.has(id));
      const sans = choisis.has(SANS_SECTEUR);
      return ids.flatMap((id, i) => {
        const r = rangs[i];
        if (r === 0 ? !sans : !voulus[r - 1]) return [];
        return [{ id, d: d[i] || null, z: r === 0 ? null : zoneDe.get(secteurs[r - 1]) ?? null }];
      });
    }
    return [...choisis].flatMap((id) => troncons.current.get(id)?.features.map((f) => ({ id: f.properties.id, d: f.properties.d, z: f.properties.z })) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, tuiles, choisis, contexte, version]);

  const etats = useMemo(() => etatsFeatures(lignesEtat, noms), [lignesEtat, noms]);

  return {
    actif, setActif, coloration, setColoration, choisis, setChoisis, contexte, arbre, palette, libelles,
    secteursAffiches, index: index.current, etats, chargement, nbEnChargement, erreur,
    recharger, rechargerEtats, surZoom: setZoom, tuiles, etatTuiles, bornes, longueurs, inventaire,
  };
}

export const tousChoisis = tousLesSecteurs;
