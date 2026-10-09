// Lecture en ligne de la fiche d'une fuite (RLS appliquée) : contenu affiché, listes des formulaires,
// URL signées des photos. Signale si le réseau a manqué, pour basculer sur la copie gardée.
import { COLONNES_PIECES, decrirePieces, type PieceLue } from '@/app/(app)/attachements/controles';
import { lireArticles, uniteArticle } from '@/lib/articles';
import { nombre } from '@/lib/format';
import { estErreurReseau } from '@/lib/hors-ligne';
import { urlsPhotos } from '@/lib/photo';
import { getSupabase } from '@/lib/supabase';
import type { FuiteV2, Motif, Nature, PhotoLigne, Piece, Profil, Quantite, Refection, Reparation, VFuite } from '@/lib/types';
import { nomsUtiles, type ContenuFiche, type LiensReparations } from './fiche-hors-ligne';

/** Colonnes de `fuites` du chantier v2 (validation, corrections, nouveaux champs), absentes de `v_fuites`. */
export const COLONNES_FUITE_V2 = 'validee_le, validee_par, auteur_terrain_id, saisi_par, cree_le, saisie_differee, motif_correction, '
  + 'corrigee_par, corrigee_le, nature_degradation_id, diametre_mm, materiau, troncon_id, precision_gps_m';
const COLONNES_PHOTOS = 'id, type, chemin, prise_le, stockage, reparation_id, refection_id, auteur_terrain_id, saisi_par, cree_le';

export interface ListesFormulaires {
  natures: Nature[];
  motifs: Motif[];
  profils: Profil[];
}

export interface LectureEnLigne {
  /** Le réseau a manqué pour la fuite elle-même : rien d'utilisable. */
  reseau: boolean;
  /** Toutes les lectures ont abouti : la copie hors ligne peut être remplacée sans rien perdre. */
  complete: boolean;
  /** Erreur de lecture de la fuite (autre que le réseau). */
  erreur: unknown;
  /** `null` : fuite introuvable ou refusée par la RLS. */
  contenu: ContenuFiche | null;
  urls: Map<string, string>;
  listes: ListesFormulaires;
  /** Pièces actives (« posées ») de chaque réparation, telles que lues : modification d'une réparation (V2). */
  piecesLues: Record<string, PieceLue[]>;
}

type Reponse = { data: unknown; error: unknown };

const lignes = <T,>(r: Reponse) => (r.data as T[] | null) ?? [];

/**
 * `bureau` (R7) : administrateur, responsable ou droit « quantités » ; sinon les pièces affichées sont la
 * déclaration du terrain (`v_pieces_terrain`), sans corrections du bureau.
 */
export async function lireFicheEnLigne(id: string, marcheId: string, options: { bureau: boolean } = { bureau: true }): Promise<LectureEnLigne> {
  const sb = getSupabase();
  const reponses: Reponse[] = await Promise.all([
    sb.from('v_fuites').select('*').eq('id', id).maybeSingle(),
    sb.from('photos').select(COLONNES_PHOTOS).eq('fuite_id', id).is('supprime_le', null).order('prise_le'),
    sb.from('reparations').select('*').eq('fuite_id', id).is('supprime_le', null).order('realisee_le'),
    sb.from('refections').select('*').eq('fuite_id', id).is('supprime_le', null).order('realisee_le'),
    sb.from('v_quantites').select('id, prix_numero, prix_ordre, prix_designation, unite, quantite, pu_ht, montant_ht_bordereau, origine_ligne, motif_correction').eq('fuite_id', id).order('prix_ordre'),
    sb.from('natures_refection').select('id, code, libelle_fr, emplacement, necessite_refection').eq('marche_id', marcheId).eq('actif', true).order('ordre'),
    sb.from('motifs').select('id, categorie, code, libelle_fr').eq('marche_id', marcheId).eq('actif', true).order('ordre'),
    sb.from('profils').select('id, identifiant, nom_complet, telephone, langue, est_admin, actif').eq('actif', true).order('nom_complet'),
    sb.from('equipes').select('id, libelle').eq('marche_id', marcheId),
    sb.from('ouvriers').select('id, nom_complet').eq('marche_id', marcheId),
    sb.from('fuites').select(COLONNES_FUITE_V2).eq('id', id).maybeSingle(),
  ]);
  const [f, ph, rp, rf, q, n, m, pr, eq, ou, f2] = reponses;
  const reparations = lignes<Reparation>(rp);

  // Ouvriers et pièces posées de chaque réparation (vide si le compte n'y a pas accès)
  const liens: LiensReparations = { ouvriers: {}, pieces: {} };
  const piecesLues: Record<string, PieceLue[]> = {};
  const idsRep = reparations.map((r) => r.id);
  const reponsesLiens: Reponse[] = [];
  if (idsRep.length) {
    const nomsOuvriers = new Map(lignes<{ id: string; nom_complet: string }>(ou).map((o) => [o.id, o.nom_complet]));
    const [ro, rpi, vt]: Reponse[] = await Promise.all([
      sb.from('reparation_ouvriers').select('reparation_id, ouvrier_id').in('reparation_id', idsRep),
      sb.from('reparation_pieces').select(COLONNES_PIECES).in('reparation_id', idsRep).is('supprime_le', null),
      options.bureau
        ? Promise.resolve({ data: null, error: null })
        : sb.from('v_pieces_terrain').select('id, reparation_id, produit_id, designation, unite, quantite').in('reparation_id', idsRep),
    ]);
    reponsesLiens.push(ro, rpi);
    const lues = lignes<PieceLue>(rpi);
    lues.filter((l) => l.etat === 'posee').forEach((l) => (piecesLues[l.reparation_id] ??= []).push(l));
    lignes<{ reparation_id: string; ouvrier_id: string }>(ro).forEach((l) => {
      (liens.ouvriers[l.reparation_id] ??= []).push(nomsOuvriers.get(l.ouvrier_id) ?? '?');
    });
    if (!options.bureau && !vt.error) {
      // R7 : le terrain voit sa déclaration, telle qu'il l'a saisie (sans remplacement ni retrait du bureau).
      lignes<{ reparation_id: string; designation: string | null; unite: string; quantite: number }>(vt).forEach((l) => {
        (liens.pieces[l.reparation_id] ??= []).push(`${l.designation ?? '?'} : ${nombre(l.quantite)} ${l.unite || 'u'}`);
      });
    } else {
      const nomsPieces = await lireArticles(lues.map((l) => l.produit_id)).catch(() => new Map<number, Piece>());
      // Inventaire réel et saisie d'origine corrigée (remplacée, retirée), chaque remplacement après la pièce remplacée
      decrirePieces(lues, (l) => {
        const piece = l.produit_id != null ? nomsPieces.get(l.produit_id) : undefined;
        return `${piece?.designation ?? l.designation_libre ?? '?'} : ${nombre(l.quantite)} ${l.produit_id != null ? uniteArticle(piece) : 'u'}`;
      }).forEach((p) => {
        (liens.pieces[p.reparation_id] ??= []).push(p);
      });
    }
  }

  // Sans URL (réseau coupé à ce moment), la photo s'affiche « Indisponible » et sera gardée à la prochaine ouverture.
  const photos = lignes<PhotoLigne>(ph);
  const urls = photos.length && f.data ? await urlsPhotos(photos).catch(() => new Map<string, string>()) : new Map<string, string>();

  const fuite = (f.data as VFuite | null) ?? null;
  const refections = lignes<Refection>(rf);
  const natures = lignes<Nature>(n);
  const motifs = lignes<Motif>(m);
  const profils = lignes<Profil>(pr);
  // Base pas encore à jour (colonnes absentes) : pas d'informations de validation, la fiche reste lisible.
  const v2 = f2.error ? null : ((f2.data as FuiteV2 | null) ?? null);
  const autresNoms = [v2?.validee_par, v2?.corrigee_par, v2?.auteur_terrain_id, ...reparations.map((r) => r.validee_par),
    ...refections.flatMap((r) => [r.validee_par, r.auteur_terrain_id])];
  return {
    reseau: !!f.error && estErreurReseau(f.error),
    complete: [...reponses, ...reponsesLiens].every((r) => !r.error || !estErreurReseau(r.error)),
    piecesLues,
    erreur: f.error,
    contenu: fuite && {
      fuite,
      photos,
      reparations,
      refections,
      quantites: lignes<Quantite>(q),
      liens,
      noms: nomsUtiles(reparations, refections, { natures, motifs, profils, equipes: lignes<{ id: string; libelle: string }>(eq) },
        { profils: autresNoms, natures: [v2?.nature_degradation_id] }),
      v2,
    },
    urls,
    listes: { natures, motifs, profils },
  };
}
