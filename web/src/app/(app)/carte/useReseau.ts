'use client';

// État du réseau sur la carte : interrupteur et choix mémorisés, zones et secteurs, chargement des
// tronçons par secteur (cache IndexedDB), état de balayage relu à part, nœuds à partir du zoom 15.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { construireArbre, tousLesSecteurs, type NoeudZone } from '@/lib/reseau/arbre';
import {
  chargerContexteReseau, chargerEquipes, chargerEtatBalayage, chargerNoeudsSecteur, chargerNomsProfils, chargerTronconsSecteur,
  messageReseau, type ContexteReseau, type EquipeReseau,
} from '@/lib/reseau/donnees';
import { etatsFeatures } from '@/lib/reseau/etat';
import { paletteSecteurs, type PaletteReseau } from '@/lib/reseau/palette';
import { indexerTroncons, type TronconIndexe } from '@/lib/reseau/selection';
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
  equipes: EquipeReseau[];
  chargement: boolean;
  nbEnChargement: number;
  erreur: string;
  recharger: () => Promise<void>;
  rechargerEtats: () => Promise<void>;
  surZoom: (zoom: number) => void;
}

export function useReseau(marcheId: string | undefined, peutLireBalayage: boolean, forcerActif = false): EtatReseau {
  const [actif, setActifEtat] = useState(false);
  const [coloration, setColorationEtat] = useState<Coloration>('secteur');
  const [choisis, setChoisisEtat] = useState<Set<string>>(new Set());
  const [choisisInitialises, setChoisisInitialises] = useState(false);
  const [contexte, setContexte] = useState<ContexteReseau | null>(null);
  const [lignesEtat, setLignesEtat] = useState<EtatBalayageTroncon[]>([]);
  const [noms, setNoms] = useState<{ equipes: Map<string, string>; agents: Map<string, string> }>({ equipes: new Map(), agents: new Map() });
  const [equipes, setEquipes] = useState<EquipeReseau[]>([]);
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
    setVersion((v) => v + 1);
  }, [marcheId]);

  const rechargerEtats = useCallback(async () => {
    if (!marcheId || !peutLireBalayage) return;
    try {
      const lignes = await chargerEtatBalayage(marcheId);
      setLignesEtat(lignes);
      const [eq, agents] = await Promise.all([
        chargerEquipes(marcheId),
        chargerNomsProfils(lignes.map((l) => l.agent_id).filter((x): x is string => !!x)),
      ]);
      setEquipes(eq);
      setNoms({ equipes: new Map(eq.map((e) => [e.id, e.libelle])), agents });
    } catch (e) {
      setErreur(messageReseau(e));
    }
  }, [marcheId, peutLireBalayage]);

  const recharger = useCallback(async () => {
    if (!marcheId || !actif) return;
    setChargement(true);
    setErreur('');
    try {
      const ctx = await chargerContexteReseau(marcheId);
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

  // Chargement des tronçons des secteurs cochés (3 à la fois), nœuds à partir du zoom 15.
  useEffect(() => {
    if (!actif || !marcheId || !contexte?.disponible) return;
    let annule = false;
    const aCharger = [...choisis].filter((id) => !troncons.current.has(id) && !enCours.current.has(`t:${id}`));
    const noeudsACharger = zoom >= ZOOM_NOEUDS
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
  }, [actif, marcheId, contexte, choisis, zoom, estampille]);

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

  const etats = useMemo(() => etatsFeatures(lignesEtat, noms), [lignesEtat, noms]);

  return {
    actif, setActif, coloration, setColoration, choisis, setChoisis, contexte, arbre, palette, libelles,
    secteursAffiches, index: index.current, etats, equipes, chargement, nbEnChargement, erreur,
    recharger, rechargerEtats, surZoom: setZoom,
  };
}

export const tousChoisis = tousLesSecteurs;
