// « Imprimer la carte » : en-tête du marché (comme les autres exports), image haute définition de la
// vue affichée (capture.ts), mise en page PDF (lib/export/carte-pdf.ts). Chargé au clic.
import type { Contexte } from '@/lib/export/jeux';
import type { FormatPapier, OrientationPapier } from '@/lib/export/carte-pdf';
import type { ImageTexte } from '@/lib/export/arabe';
import { STATUTS } from '@/lib/format';
import { compterEtats } from '@/lib/reseau/etat';
import { classeDiametre, entreesLegendeReseau } from '@/lib/reseau/palette';
import type { StatutFuite } from '@/lib/types';
import { capturerCarte, type EtatCarte, type ReseauImpression } from './capture';
import { COULEURS, COULEUR_ALERTE, COULEUR_CONTOURS, aUneAlerte, type Contour, type FuiteCarte } from './commun';

// La légende du PDF (lib/export/carte-pdf.ts, hors lot S) dessine des pastilles : on y ajoute au plus
// six entrées pour le réseau, pour que le cartouche garde sa place.
const ENTREES_RESEAU_MAX = 6;

/** Entrées de légende du réseau affiché : zones (par secteur), états (par balayage) ou classes (par diamètre). */
export function legendeReseau(r: ReseauImpression | null | undefined, zones: { id: string; numero: number; libelle: string }[]) {
  if (!r || !r.secteurs.some((s) => s.data)) return [];
  const ids = r.secteurs.flatMap((s) => s.data?.features.map((f) => f.properties.id) ?? []);
  const nombres = new Map<string, number>();
  if (r.coloration === 'balayage') {
    for (const [k, v] of compterEtats(ids, r.etats)) nombres.set(k, v);
  } else if (r.coloration === 'diametre') {
    for (const s of r.secteurs) for (const f of s.data?.features ?? []) {
      const cle = String(classeDiametre(f.properties.d));
      nombres.set(cle, (nombres.get(cle) ?? 0) + 1);
    }
  } else {
    for (const s of r.secteurs) for (const f of s.data?.features ?? []) {
      if (f.properties.z) nombres.set(f.properties.z, (nombres.get(f.properties.z) ?? 0) + 1);
    }
  }
  const zonesAffichees = zones.filter((z) => r.coloration !== 'secteur' || (nombres.get(z.id) ?? 0) > 0);
  return entreesLegendeReseau(r.coloration, r.palette, zonesAffichees, nombres)
    .filter((e) => r.coloration === 'balayage' || e.nombre > 0)
    .slice(0, ENTREES_RESEAU_MAX);
}

export interface ChoixImpression {
  format: FormatPapier;
  orientation: OrientationPapier;
  titre: string;
  avecListe: boolean;
  /** « contenu » : carte cadrée sur les fuites et le réseau affichés ; « ecran » : vue de l'écran. */
  cadrage: 'contenu' | 'ecran';
  /** Rubriques cochées (lib/export/rubriques.ts, document « carte ») ; « liste » remplace avecListe. */
  rubriques?: Set<string>;
}

// Étendue minimale du cadrage (≈ 300 m) : une fuite seule n'est pas imprimée au zoom maximal.
const ETENDUE_MIN_DEGRES = 0.003;

/** Bornes [[ouest, sud], [est, nord]] des fuites placées et des tronçons du réseau affiché ; null si rien. */
export function bornesContenu(
  fuites: { latitude: number | null; longitude: number | null }[],
  reseau: ReseauImpression | null | undefined,
): [[number, number], [number, number]] | null {
  let ouest = Infinity, est = -Infinity, sud = Infinity, nord = -Infinity;
  const ajouter = (lon: number, lat: number) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    ouest = Math.min(ouest, lon); est = Math.max(est, lon); sud = Math.min(sud, lat); nord = Math.max(nord, lat);
  };
  for (const f of fuites) if (f.latitude != null && f.longitude != null) ajouter(f.longitude, f.latitude);
  for (const s of reseau?.secteurs ?? []) for (const t of s.data?.features ?? []) for (const [lon, lat] of t.geometry.coordinates) ajouter(lon, lat);
  if (ouest > est) return null;
  const dLon = Math.max(0, ETENDUE_MIN_DEGRES - (est - ouest)) / 2;
  const dLat = Math.max(0, ETENDUE_MIN_DEGRES - (nord - sud)) / 2;
  return [[ouest - dLon, sud - dLat], [est + dLon, nord + dLat]];
}

export interface DonneesImpression {
  etat: EtatCarte;
  fuites: FuiteCarte[];        // fuites filtrées, géolocalisées ou non
  zones: Contour[];
  secteurs: Contour[];
  filtres: string;
  libelleReference: string;
  /** Réseau affiché à l'écran (lot S) ; absent ou vide : carte des fuites seule. */
  reseau?: ReseauImpression | null;
  zonesReseau?: { id: string; numero: number; libelle: string }[];
}

export async function fabriquerPdfCarte(
  ctx: Contexte, choix: ChoixImpression, d: DonneesImpression, etape: (texte: string) => void,
): Promise<Blob> {
  const [{ genererCartePdf }, { construireEntete }, { contientArabe, imagesTextes }, { textesArabesEntete }] = await Promise.all([
    import('@/lib/export/carte-pdf'), import('@/lib/export/jeux'), import('@/lib/export/arabe'), import('@/lib/export/modele'),
  ]);
  const placees = d.fuites.filter((f) => f.latitude != null && f.longitude != null);
  const sansPosition = d.fuites.length - placees.length;
  const nombre = `${placees.length} fuite${placees.length > 1 ? 's' : ''} sur la carte`
    + (sansPosition ? `, ${sansPosition} sans position GPS (absente${sansPosition > 1 ? 's' : ''} de la carte)` : '');
  const avec = (r: string) => !choix.rubriques || choix.rubriques.has(r);
  const entete = construireEntete(ctx, choix.titre, avec('filtres') ? [d.filtres, nombre] : [nombre]);
  const liste = (choix.rubriques ? choix.rubriques.has('liste') : choix.avecListe) ? d.fuites : null;

  // Arabe (nom du titulaire ou du client, adresses) : composé par le navigateur, comme les autres PDF.
  const arabesEntete = textesArabesEntete(entete).filter(contientArabe);
  const arabesListe = (liste ?? []).flatMap((f) => [f.reference_srm, f.secteur, f.adresse]).filter(contientArabe);
  const imagesEntete = arabesEntete.length ? await imagesTextes(arabesEntete, 10, true) : new Map<string, ImageTexte>();
  const imagesCellules = arabesListe.length ? await imagesTextes(arabesListe, 7.5) : new Map<string, ImageTexte>();

  etape('Mise en page…');
  const pdf = await genererCartePdf({
    format: choix.format,
    orientation: choix.orientation,
    entete,
    imagesEntete,
    imagesCellules,
    filtres: d.filtres,
    legende: [
      ...(Object.keys(STATUTS) as StatutFuite[]).map((s) => ({
        libelle: STATUTS[s].libelle, ...COULEURS[s], nombre: placees.filter((f) => f.statut === s).length,
      })),
      ...legendeReseau(d.reseau, d.zonesReseau ?? []),
    ],
    alertes: { nombre: placees.filter(aUneAlerte).length, couleur: COULEUR_ALERTE },
    contours: { zones: d.zones.length > 0, secteurs: d.secteurs.length > 0, couleur: COULEUR_CONTOURS },
    nombreSurCarte: placees.length,
    sansPosition,
    liste: liste && liste.map((f) => ({
      numero: f.numero, reference: f.reference_srm, statut: STATUTS[f.statut].libelle, couleur: COULEURS[f.statut],
      secteur: f.secteur, adresse: f.adresse, latitude: f.latitude, longitude: f.longitude, detectee: f.date_detection,
    })),
    libelleReference: d.libelleReference,
    genereLe: new Date(),
    rubriques: choix.rubriques,
    capturer: (largeurMm, hauteurMm) => {
      etape('Rendu de la carte en haute définition…');
      const cadrage = choix.cadrage === 'contenu' ? bornesContenu(placees, d.reseau) : null;
      return capturerCarte({ ...d.etat, cadrage }, { fuites: placees, zones: d.zones, secteurs: d.secteurs, reseau: d.reseau ?? null }, largeurMm, hauteurMm);
    },
  });
  return new Blob([pdf], { type: 'application/pdf' });
}

// Charge l'en-tête du marché, fabrique et télécharge. Renvoie poids et durée (affichés à l'écran).
export async function imprimerCarte(
  marcheId: string, choix: ChoixImpression, d: DonneesImpression, etape: (texte: string) => void,
): Promise<{ octets: number; secondes: number }> {
  const debut = performance.now();
  etape('Chargement de l\'en-tête du marché…');
  const [{ chargerContexteRapport }, { nomFichierSur, telecharger }] = await Promise.all([
    import('@/lib/export/rapport-fuite'), import('@/lib/export/modele'),
  ]);
  const ctx = await chargerContexteRapport(marcheId, false);
  const blob = await fabriquerPdfCarte(ctx, choix, d, etape);
  const date = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' });
  telecharger(blob, `${nomFichierSur(`carte-fuites-${String(ctx.marche.code ?? '')}-${choix.format}-${choix.orientation}`)}-${date}.pdf`);
  return { octets: blob.size, secondes: (performance.now() - debut) / 1000 };
}
