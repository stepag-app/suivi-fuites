// Rubriques à cocher avant un export (X7 : exigences changeantes de la SRM, pas de gabarit figé) :
// rapport PDF par fuite, rapport de balayage (journalier ou période) et carte imprimée.
// Choix mémorisés en modèles par marché dans `modeles_export` (jeu « fuites », `filtres.document` = le
// document, `colonnes` = les rubriques cochées) : le mécanisme des modèles d'export, sans migration. Le
// dernier choix est aussi gardé sur l'appareil (repli si le compte ne peut pas enregistrer de modèle).
// Fonctions pures en tête (vérifiées par scripts/verifier-rubriques.mjs), accès à la base ensuite.

export type DocumentRubriques = 'rapport_fuite' | 'rapport_balayage' | 'carte';

export interface Rubrique {
  cle: string;
  libelle: string;
  aide?: string;
  defaut: boolean;
  /** Visible seulement avec ce droit (ex. prix du bordereau : « quantités / lire »). */
  droit?: 'quantites';
}

export const RUBRIQUES: Record<DocumentRubriques, readonly Rubrique[]> = {
  rapport_fuite: [
    { cle: 'identification', libelle: 'Identification', aide: 'N°, référence, statut, dates, ouvrage, zone et secteur, adresse', defaut: true },
    { cle: 'jalons', libelle: 'Jalons du client', aide: 'communication, avis avant terrassement, validation', defaut: true },
    { cle: 'position', libelle: 'Coordonnées GPS et itinéraire', defaut: true },
    { cle: 'reparations', libelle: 'Réparations', aide: 'constat, travaux, fouille, emplacement, revêtement', defaut: true },
    { cle: 'equipes', libelle: 'Équipes et ouvriers', aide: 'dans les réparations et réfections', defaut: true },
    { cle: 'pieces', libelle: 'Pièces posées', aide: 'dans les réparations', defaut: true },
    { cle: 'refections', libelle: 'Réfections', defaut: true },
    { cle: 'observations', libelle: 'Observations', defaut: true },
    { cle: 'photos', libelle: 'Photos', defaut: true },
    { cle: 'visas', libelle: 'Visas', aide: 'règles d\'attachement du marché', defaut: true },
    { cle: 'quantites', libelle: 'Articles et prix du bordereau', aide: 'quantités, prix unitaires, montants', defaut: false, droit: 'quantites' },
  ],
  rapport_balayage: [
    { cle: 'identification', libelle: 'Identification', aide: 'société, journée ou période, équipes, agents, zones, secteurs, linéaire', defaut: true },
    { cle: 'detail_jours', libelle: 'Linéaire par jour', aide: 'période de plusieurs jours', defaut: true },
    { cle: 'detail_secteurs', libelle: 'Linéaire par zone et secteur', aide: 'plusieurs secteurs', defaut: true },
    { cle: 'fuites', libelle: 'Fuites détectées', defaut: true },
    { cle: 'commentaire', libelle: 'Commentaire', defaut: true },
    { cle: 'visas', libelle: 'Visas', defaut: true },
    { cle: 'plan', libelle: 'Extrait de plan', aide: 'PDF seulement', defaut: true },
  ],
  carte: [
    { cle: 'legende', libelle: 'Légende', defaut: true },
    { cle: 'echelle', libelle: 'Échelle et nord', defaut: true },
    { cle: 'coordonnees', libelle: 'Coordonnées GPS des coins', defaut: true },
    { cle: 'informations', libelle: 'Informations', aide: 'date d\'édition, nombre de fuites, sources', defaut: true },
    { cle: 'graduations', libelle: 'Graduations en degrés', defaut: true },
    { cle: 'filtres', libelle: 'Filtres appliqués', aide: 'sous le titre', defaut: true },
    { cle: 'liste', libelle: 'Liste des fuites affichées', aide: 'pages suivantes', defaut: false },
  ],
};

export const LIBELLES_DOCUMENTS: Record<DocumentRubriques, string> = {
  rapport_fuite: 'Rapport par fuite',
  rapport_balayage: 'Rapport de balayage',
  carte: 'Carte imprimée',
};

/** Rubriques proposées au compte (sans celles d'un droit qu'il n'a pas). */
export function rubriquesVisibles(document: DocumentRubriques, droits: { quantites?: boolean } = {}): Rubrique[] {
  return RUBRIQUES[document].filter((r) => !r.droit || droits[r.droit]);
}

export function choixParDefaut(document: DocumentRubriques): Set<string> {
  return new Set(RUBRIQUES[document].filter((r) => r.defaut).map((r) => r.cle));
}

/** Clés connues seulement (un modèle ancien peut nommer une rubrique retirée depuis). */
export function normaliser(document: DocumentRubriques, cles: readonly string[]): Set<string> {
  const connues = new Set(RUBRIQUES[document].map((r) => r.cle));
  return new Set(cles.filter((c) => connues.has(c)));
}

/** Choix effectif : rubriques d'un droit absent toujours retirées. */
export function choixEffectif(document: DocumentRubriques, choix: Iterable<string>, droits: { quantites?: boolean } = {}): Set<string> {
  const visibles = new Set(rubriquesVisibles(document, droits).map((r) => r.cle));
  return new Set([...choix].filter((c) => visibles.has(c)));
}

/** Ligne de `modeles_export` portant des rubriques (et non un modèle de colonnes du panneau d'export). */
export const estModeleRubriques = (m: { filtres?: unknown }) =>
  !!m.filtres && typeof m.filtres === 'object' && typeof (m.filtres as { document?: unknown }).document === 'string';

// ---------------------------------------------------------------------------
// Dernier choix sur l'appareil
// ---------------------------------------------------------------------------
const cleLocale = (document: DocumentRubriques, marcheId: string) => `suivi-fuites:rubriques:${document}:${marcheId}`;

export function dernierChoix(document: DocumentRubriques, marcheId: string): Set<string> {
  try {
    const brut = typeof localStorage === 'undefined' ? null : localStorage.getItem(cleLocale(document, marcheId));
    const cles = brut ? (JSON.parse(brut) as unknown) : null;
    if (Array.isArray(cles)) return normaliser(document, cles.filter((c): c is string => typeof c === 'string'));
  } catch {
    // stockage indisponible (navigation privée) : choix par défaut
  }
  return choixParDefaut(document);
}

export function memoriserChoix(document: DocumentRubriques, marcheId: string, choix: Iterable<string>) {
  try {
    localStorage.setItem(cleLocale(document, marcheId), JSON.stringify([...choix]));
  } catch {
    // sans effet
  }
}

// ---------------------------------------------------------------------------
// Modèles par marché (modeles_export)
// ---------------------------------------------------------------------------
export interface ModeleRubriques { id: string; nom: string; rubriques: Set<string> }

export async function lireModeles(document: DocumentRubriques, marcheId: string): Promise<ModeleRubriques[]> {
  const { getSupabase } = await import('@/lib/supabase');
  const { data, error } = await getSupabase().from('modeles_export').select('id, nom, colonnes, filtres, ordre')
    .eq('marche_id', marcheId).eq('jeu', 'fuites').eq('actif', true).order('ordre').order('nom');
  if (error) throw error;
  return ((data ?? []) as { id: string; nom: string; colonnes: string[] | null; filtres: unknown }[])
    .filter((m) => estModeleRubriques(m) && (m.filtres as { document: string }).document === document)
    .map((m) => ({ id: m.id, nom: m.nom, rubriques: normaliser(document, m.colonnes ?? []) }));
}

export async function enregistrerModele(
  document: DocumentRubriques, marcheId: string, nom: string, rubriques: Iterable<string>, remplacer?: string,
): Promise<void> {
  const { getSupabase } = await import('@/lib/supabase');
  const sb = getSupabase();
  const reglages = { colonnes: [...rubriques], filtres: { document }, format: 'pdf', orientation: 'portrait' };
  const { error } = remplacer
    ? await sb.from('modeles_export').update(reglages).eq('id', remplacer)
    : await sb.from('modeles_export').insert({ ...reglages, marche_id: marcheId, nom: nom.trim(), jeu: 'fuites', ordre: 100, actif: true });
  if (error) {
    if (error.code === '23505') throw new Error(`Un modèle « ${nom.trim()} » existe déjà pour ce marché : choisissez un autre nom.`);
    throw error;
  }
}

export async function retirerModele(id: string): Promise<void> {
  const { getSupabase } = await import('@/lib/supabase');
  const { error } = await getSupabase().from('modeles_export').update({ actif: false }).eq('id', id);
  if (error) throw error;
}
