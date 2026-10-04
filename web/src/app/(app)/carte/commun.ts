import type { libellesMarche } from '@/lib/format';
import type { Geometry, MultiPolygon, Polygon } from 'geojson';
import type { StatutFuite, VFuite } from '@/lib/types';

// Colonnes de v_fuites utiles à la carte (la vue applique la RLS : security_invoker).
export const COLONNES_CARTE =
  'id, numero, reference_srm, origine, statut, zone, secteur_id, secteur, adresse, latitude, longitude, date_detection, ' +
  'alerte_non_reparee, alerte_communication_srm, alerte_refection_chaussee, refection_chaussee_hors_delai, alerte_refection_trottoir';

export type FuiteCarte = Pick<
  VFuite,
  | 'id' | 'numero' | 'reference_srm' | 'origine' | 'statut' | 'zone' | 'secteur_id' | 'secteur' | 'adresse'
  | 'latitude' | 'longitude' | 'date_detection' | 'alerte_non_reparee' | 'alerte_communication_srm'
  | 'alerte_refection_chaussee' | 'refection_chaussee_hors_delai' | 'alerte_refection_trottoir'
>;

type Libelles = ReturnType<typeof libellesMarche>;

// Mêmes alertes que la liste des fuites.
export const ALERTES: { cle: keyof FuiteCarte; texte: (l: Libelles) => string }[] = [
  { cle: 'alerte_non_reparee', texte: (l) => `Non réparée > ${l.delaiReparationH} h` },
  { cle: 'alerte_communication_srm', texte: (l) => `Non communiquée ${l.sigle}` },
  { cle: 'refection_chaussee_hors_delai', texte: () => 'Réfection chaussée hors délai' },
  { cle: 'alerte_refection_chaussee', texte: () => 'Réfection chaussée à faire' },
  { cle: 'alerte_refection_trottoir', texte: () => 'Réfection trottoir à faire' },
];

export const aUneAlerte = (f: FuiteCarte) => ALERTES.some((a) => f[a.cle] === true);

// Couleurs des points : bordure (remplissage) et texte (contour) des badges de statut (globals.css).
export const COULEURS: Record<StatutFuite, { fond: string; contour: string }> = {
  detectee: { fond: '#e0b400', contour: '#6b4e00' },
  en_reparation: { fond: '#60a5fa', contour: '#1e3a8a' },
  reparee: { fond: '#8cc56a', contour: '#2c5a12' },
  achevee: { fond: '#38a05a', contour: '#14532d' },
  sans_reparation: { fond: '#9ca3af', contour: '#374151' },
};

// Oujda, quand aucune fuite n'est géolocalisée.
export const CENTRE_DEFAUT: [number, number] = [-1.9086, 34.6814];
export const ZOOM_DEFAUT = 12;

// Fond minimal OpenStreetMap (OpenFreeMap : sans compte ni clé).
export const STYLE_FOND = 'https://tiles.openfreemap.org/styles/positron';

// Contour d'une zone ou d'un secteur : GeoJSON (PostGIS 3 sérialise la géométrie ainsi) ou rien.
export type Contour = { id: string; code: string; libelle: string; geom: Geometry | null };

export function geometrieValide(g: unknown): g is Polygon | MultiPolygon {
  return !!g && typeof g === 'object' && 'type' in g && 'coordinates' in g &&
    ((g as { type: string }).type === 'Polygon' || (g as { type: string }).type === 'MultiPolygon');
}

// Jour (AAAA-MM-JJ) de la détection à l'heure du Maroc, pour le filtre de période.
export const jourMaroc = (iso: string) =>
  new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Africa/Casablanca' });
