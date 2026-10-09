// Mini-carte de localisation d'une fuite (F4) : fonctions pures partagées par le composant MiniCarte, la route
// /mini-carte servie à la WebView de l'APK et les vérifications (scripts/verifier-tuiles.mjs).
// Contrat d'appel et messages : docs/lots/chantier-v2-mini-carte.md.
import type { Polygon } from 'geojson';
import { distanceMetres } from './selection';

export type LangueMiniCarte = 'fr' | 'ar' | 'hybride';

export interface ParametresMiniCarte {
  marcheId: string | null;
  latitude: number | null;
  longitude: number | null;
  precision: number | null;
  langue: LangueMiniCarte;
  satellite: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nombreOuNul = (v: string | null, min: number, max: number) => {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/** Lecture de l'adresse `/mini-carte?marche=…&lat=…&lng=…&precision=…&langue=…&satellite=1` (valeurs invalides : nulles). */
export function lireParametresMiniCarte(p: URLSearchParams): ParametresMiniCarte {
  const marche = p.get('marche');
  const lat = nombreOuNul(p.get('lat'), -90, 90);
  const lng = nombreOuNul(p.get('lng'), -180, 180);
  const langue = p.get('langue');
  return {
    marcheId: marche && UUID.test(marche) ? marche.toLowerCase() : null,
    latitude: lat != null && lng != null ? lat : null,
    longitude: lat != null && lng != null ? lng : null,
    precision: nombreOuNul(p.get('precision'), 0, 100000),
    langue: langue === 'ar' || langue === 'hybride' ? langue : 'fr',
    satellite: p.get('satellite') === '1',
  };
}

/** Tronçon proche tel que le renvoie `suggestions_localisation` (contrat S2 § 3). */
export interface TronconProche {
  id: string;
  reference: string | null;
  diametre_mm: number | null;
  materiau: string | null;
  materiau_plan: string | null;
  secteur_id: string | null;
  distance_m: number | null;
  geojson: { type: 'LineString'; coordinates: number[][] } | null;
}

export interface Suggestions {
  rayon_m: number | null;
  precision_insuffisante: boolean;
  rues: { nom: string; nom_fr: string | null; nom_ar: string | null; distance_m: number }[];
  secteur: { id: string; code: string; libelle: string; zone_id: string | null; source: 'contour' | 'troncon' } | null;
  troncon: TronconProche | null;
}

/** Message envoyé à l'APK (et à la page parente) : JSON, champ `type` préfixé « mini-carte: ». */
export type MessageMiniCarte =
  | { type: 'mini-carte:prete'; version: 1 }
  | { type: 'mini-carte:position'; version: 1; latitude: number; longitude: number; precision_m: number | null; deplacee: boolean; distance_gps_m: number | null; troncon: TronconProche | null; suggestions: Suggestions | null }
  | { type: 'mini-carte:valider'; version: 1; latitude: number; longitude: number; precision_m: number | null; deplacee: boolean; distance_gps_m: number | null; troncon: TronconProche | null; suggestions: Suggestions | null }
  | { type: 'mini-carte:annuler'; version: 1 }
  | { type: 'mini-carte:erreur'; version: 1; message: string };

/** Position GPS envoyée par l'APK à la page (postMessage ou `window.miniCarte.gps(…)`), ou null si illisible. */
export function lireMessageGps(donnees: unknown): { latitude: number; longitude: number; precision: number | null } | null {
  let d = donnees;
  if (typeof d === 'string') {
    try {
      d = JSON.parse(d);
    } catch {
      return null;
    }
  }
  if (!d || typeof d !== 'object' || (d as { type?: unknown }).type !== 'mini-carte:gps') return null;
  const { latitude, longitude, precision } = d as { latitude?: unknown; longitude?: unknown; precision?: unknown };
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const p = Number(precision);
  return { latitude: lat, longitude: lng, precision: precision != null && Number.isFinite(p) && p >= 0 ? p : null };
}

/** Cercle de précision du GPS (polygone de 48 côtés). */
export function cercle(longitude: number, latitude: number, rayonM: number, cotes = 48): Polygon {
  const dLat = rayonM / 111320;
  const dLon = rayonM / (111320 * Math.cos((latitude * Math.PI) / 180));
  const anneau = Array.from({ length: cotes + 1 }, (_, i) => {
    const a = ((i % cotes) / cotes) * 2 * Math.PI;
    return [longitude + dLon * Math.cos(a), latitude + dLat * Math.sin(a)];
  });
  return { type: 'Polygon', coordinates: [anneau] };
}

/** Distance (m) entre la position GPS et l'épingle, null sans GPS. */
export const ecartEpingle = (gps: { latitude: number; longitude: number } | null, epingle: { latitude: number; longitude: number }) =>
  gps ? Math.round(distanceMetres([gps.longitude, gps.latitude], [epingle.longitude, epingle.latitude]) * 10) / 10 : null;

const MATERIAUX: Record<string, string> = {
  polyethylene: 'PE', pvc: 'PVC', amiante_ciment: 'Amiante-ciment', fonte_ductile: 'Fonte ductile', fonte_grise: 'Fonte grise',
  acier_galvanise: 'Acier galvanisé', ppr: 'PPR', autre: 'Autre',
};

/** « Ø110 · PVC » (matériau normalisé, sinon texte du plan), « diamètre inconnu » si rien. */
export function libelleTroncon(t: Pick<TronconProche, 'diametre_mm' | 'materiau' | 'materiau_plan'>, materiaux: Record<string, string> = MATERIAUX): string {
  const morceaux = [
    t.diametre_mm ? `Ø${t.diametre_mm}` : null,
    t.materiau ? materiaux[t.materiau] ?? MATERIAUX[t.materiau] ?? t.materiau : t.materiau_plan,
  ].filter(Boolean);
  return morceaux.length ? morceaux.join(' · ') : '';
}

// Libellés de la mini-carte (arabe à relire par Issam, comme le dictionnaire de l'APK).
const TEXTES = {
  valider: ['Valider la position', 'تأكيد الموقع'],
  annuler: ['Annuler', 'إلغاء'],
  maPosition: ['Ma position', 'موقعي'],
  satellite: ['Satellite', 'القمر الصناعي'],
  plan: ['Plan', 'الخريطة'],
  aide: ['Déplacez l\'épingle ou touchez la carte à l\'endroit exact de la fuite.', 'حرّك الدبوس أو المس الخريطة في المكان الدقيق للتسرب.'],
  proche: ['Conduite la plus proche', 'أقرب قناة'],
  aucune: ['Aucune conduite à moins de', 'لا توجد قناة على بعد أقل من'],
  diametreInconnu: ['diamètre et matériau inconnus', 'القطر والمادة غير معروفين'],
  a: ['à', 'على بعد'],
  recherche: ['Recherche de la conduite…', 'البحث عن القناة…'],
  horsReseau: ['Suggestions indisponibles (réseau) : la position reste enregistrable.', 'الاقتراحات غير متاحة (الشبكة): يمكن تسجيل الموقع.'],
  precisionGps: ['Précision du GPS', 'دقة نظام تحديد المواقع'],
  deplacee: ['Épingle déplacée de', 'تم تحريك الدبوس بمسافة'],
  secteur: ['Secteur', 'القطاع'],
} as const;

export type CleTexte = keyof typeof TEXTES;

export function texte(cle: CleTexte, langue: LangueMiniCarte): string {
  const [fr, ar] = TEXTES[cle];
  return langue === 'ar' ? ar : langue === 'hybride' ? `${fr} · ${ar}` : fr;
}
