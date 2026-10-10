// Liste « Fiches disponibles hors ligne » : règles pures (sans navigateur), vérifiées par
// `node scripts/verifier-fiche-hors-ligne.mjs`. Les copies sont lues dans `src/lib/hors-ligne.ts`.
import type { StatutFuite, VFuite } from '@/lib/types';

/** Ce que la liste lit d'une copie gardée (la fiche entière est dans IndexedDB, photos à part). */
export interface CopieGardee {
  id: string;
  utilisateur_id: string;
  consultee_le: string;
  version_le: string;
  nb_photos: number;
  fuite: Pick<VFuite, 'marche_id' | 'numero' | 'statut' | 'adresse' | 'reference_srm' | 'secteur'>;
}

export interface FicheDisponible {
  id: string;
  marche_id: string;
  numero: number;
  statut: StatutFuite;
  adresse: string | null;
  reference_srm: string | null;
  secteur: string | null;
  version_le: string;
  consultee_le: string;
  nb_photos: number;
}

/**
 * Copies de ce compte seulement (jamais celles d'un autre), les plus récemment ouvertes d'abord ;
 * une copie illisible (sans fuite) est ignorée. `texte` : N°, référence ou adresse, comme la liste des fuites.
 */
export function fichesDisponibles(copies: CopieGardee[], utilisateurId: string, texte = ''): FicheDisponible[] {
  const t = texte.trim().toLowerCase();
  return copies
    .filter((c) => c.utilisateur_id === utilisateurId && c.fuite && typeof c.fuite.numero === 'number')
    .map((c) => ({
      id: c.id, marche_id: c.fuite.marche_id, numero: c.fuite.numero, statut: c.fuite.statut, adresse: c.fuite.adresse ?? null,
      reference_srm: c.fuite.reference_srm ?? null, secteur: c.fuite.secteur ?? null,
      version_le: c.version_le, consultee_le: c.consultee_le, nb_photos: c.nb_photos ?? 0,
    }))
    .filter((f) => !t || String(f.numero) === t || (f.reference_srm ?? '').toLowerCase().includes(t) || (f.adresse ?? '').toLowerCase().includes(t))
    .sort((a, b) => b.consultee_le.localeCompare(a.consultee_le) || b.numero - a.numero);
}
