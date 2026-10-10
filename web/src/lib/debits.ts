// Débits de nuit (chantier v3, S15, D1 à D7) : types, libellés et calculs purs. Les calculs officiels sont
// faits par la base (v_debits_nuits, v_debits_campagnes, debits_resultats, migration 20261013300000) ;
// ceux-ci les reproduisent à l'identique pour l'aperçu de la saisie, l'import et le mode démonstration.
// Vérification : node scripts/verifier-debits.mjs (mêmes jeux que supabase/tests/database/40_s15_debits_nuit.test.sql).

export type TypeCampagne = 'avant' | 'apres' | 'maintien' | 'libre';
export type ModeSaisie = 'minimum' | 'releves' | 'import';
export type Assiette = 'zone' | 'marche';
export type ModePoints = 'proportionnels' | 'entiers';

export const TYPES_CAMPAGNE: Record<TypeCampagne, { libelle: string; court: string; aide: string }> = {
  avant: { libelle: 'Avant intervention (Qi)', court: 'Qi', aide: 'trois nuits juste après l\'ordre de service (art. II-17)' },
  apres: { libelle: 'Après balayage (Qf)', court: 'Qf', aide: 'trois nuits après la détection et la réparation (art. II-22)' },
  maintien: { libelle: 'Contrôle de maintien', court: 'Maintien', aide: 'hebdomadaire, dates fixées par la SRM, 7 jours au plus (art. II-15)' },
  libre: { libelle: 'Mesure libre', court: 'Libre', aide: 'suivi interne, sans effet sur les pénalités' },
};

export const MODES_SAISIE: Record<ModeSaisie, string> = {
  minimum: 'Minimum de la nuit',
  releves: 'Relevés de 0 h à 6 h',
  import: 'Import d\'un fichier (CSV, Excel)',
};

export const ASSIETTES: Record<Assiette, string> = {
  zone: 'Par zone (linéaire de la zone × prix)',
  marche: 'Marché entier (τ global)',
};

export const MODES_POINTS: Record<ModePoints, string> = {
  proportionnels: 'Proportionnels (τ sans arrondi)',
  entiers: 'Entiers (points complets)',
};

/** 25 instants de 0 h à 6 h, toutes les 15 minutes (art. II-17 : Q1 à Q25). */
export const HEURES_NUIT: string[] = Array.from({ length: 25 }, (_, i) =>
  `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);

export interface Releve { h: string; q: number }

export interface ZoneDebit {
  id: string;
  marche_id?: string;
  numero: number;
  libelle: string;
  lineaire_m: number | null;
  q_exige_m3h: number | null;
  q_plus_bas_historique_m3h?: number | null;
  q_actuel_m3h?: number | null;
  balayage_acheve_le?: string | null;
  actif?: boolean;
}

export interface PointMesure {
  id: string;
  marche_id?: string;
  zone_id: string;
  secteur_id?: string | null;
  code: string;
  libelle: string;
  equipement?: string | null;
  observation?: string | null;
  ordre?: number;
  actif: boolean;
}

export interface Campagne {
  id: string;
  marche_id?: string;
  type: TypeCampagne;
  zone_id: string | null;
  libelle?: string | null;
  date_debut: string;
  date_fin: string;
  mode_saisie?: ModeSaisie | null;
  observation?: string | null;
  pv_chemin?: string | null;
  pv_signe_le?: string | null;
  cree_le?: string;
  supprime_le?: string | null;
}

export interface MesureNuit {
  id: string;
  marche_id?: string;
  campagne_id: string;
  point_id: string;
  nuit: string;
  releves: Releve[] | null;
  minimum_m3h: number;
  mode: 'minimum' | 'releves';
  origine?: 'saisie' | 'import';
  piece_jointe?: string | null;
  observation?: string | null;
  auteur_terrain_id?: string | null;
  saisi_par?: string | null;
  validee_le: string | null;
  supprime_le?: string | null;
  cree_le?: string;
}

/** Ligne de v_debits_nuits. */
export interface NuitZone {
  campagne_id: string;
  campagne_type: TypeCampagne;
  zone_id: string;
  zone_numero: number;
  zone_libelle: string;
  nuit: string;
  nb_points: number;
  nb_points_mesures: number;
  nb_points_releves: number;
  nb_instants: number;
  nb_valides: number;
  nb_a_valider: number;
  complete: boolean;
  q_zone_m3h: number | null;
  approchee: boolean;
}

/** Ligne de v_debits_campagnes. */
export interface CampagneZone {
  campagne_id: string;
  type: TypeCampagne;
  libelle: string | null;
  date_debut: string;
  date_fin: string;
  zone_id: string;
  zone_numero: number;
  zone_libelle: string;
  q_exige_m3h: number | null;
  nb_nuits: number;
  nb_nuits_completes: number;
  nb_a_valider: number;
  q_m3h: number | null;
  nuit_minimum: string | null;
  approchee: boolean;
  cree_le?: string;
}

/** Ligne de debits_resultats. */
export interface ResultatDebits {
  niveau: 'zone' | 'marche';
  zone_id: string | null;
  zone_numero: number | null;
  zone_libelle: string | null;
  lineaire_m: number | null;
  q_exige_m3h: number | null;
  q_plus_bas_historique_m3h: number | null;
  q_actuel_m3h: number | null;
  balayage_acheve_le: string | null;
  qi_m3h: number | null;
  qi_approche: boolean | null;
  qi_nuits: number | null;
  qf_m3h: number | null;
  qf_approche: boolean | null;
  qf_nuits: number | null;
  delta_q_m3h: number | null;
  tau1_pct: number | null;
  points_balayage: number | null;
  montant_balayage: number | null;
  penalite_balayage: number | null;
  alerte_arret: boolean;
  nb_controles: number;
  dernier_controle: string | null;
  dernier_controle_m3h: number | null;
  ecart_controles_max_j: number | null;
  q_maintien_moyen_m3h: number | null;
  tau2_pct: number | null;
  points_maintien: number | null;
  montant_maintien: number | null;
  penalite_maintien: number | null;
  degradation_m3h: number | null;
  degradation_pct: number | null;
  alerte_degradation: boolean;
  assiette: Assiette;
  mode_points: ModePoints;
  fin_maintien: string | null;
}

export interface ReglagesDebits {
  debits_mode_saisie: ModeSaisie;
  debits_assiette: Assiette;
  debits_points: ModePoints;
  debits_plafond_pct: number;
  debits_seuil_arret_pct: number;
  debits_seuil_degradation_pct: number;
}

export const REGLAGES_DEFAUT: ReglagesDebits = {
  debits_mode_saisie: 'minimum', debits_assiette: 'zone', debits_points: 'proportionnels',
  debits_plafond_pct: 25, debits_seuil_arret_pct: 25, debits_seuil_degradation_pct: 25,
};

// ---------------------------------------------------------------------------
// Règles de saisie (miroir de private.normaliser_releves)
// ---------------------------------------------------------------------------

const MOTIF_HEURE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Heure « H:MM » ou « HH:MM » ramenée à « HH:MM » ; null si illisible. */
export function heureNormale(h: string): string | null {
  const m = MOTIF_HEURE.exec(String(h).trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

/** Relevés vérifiés et triés (mêmes refus que la base) ; liste vide → null. */
export function normaliserReleves(releves: { h: string; q: number | string | null }[] | null | undefined): Releve[] | null {
  if (!releves) return null;
  const utiles = releves.filter((r) => r.q !== null && r.q !== '' && r.q !== undefined);
  if (utiles.length === 0) return null;
  if (utiles.length > 100) throw new Error('Relevés : 100 valeurs au plus par point et par nuit');
  const sortie: Releve[] = utiles.map((r) => {
    const h = heureNormale(r.h);
    const q = typeof r.q === 'number' ? r.q : Number(String(r.q).replace(',', '.'));
    if (!h || !Number.isFinite(q)) throw new Error('Relevé invalide : heure HH:MM et débit numérique attendus');
    if (h > '06:00') throw new Error('Relevés de nuit : de 00:00 à 06:00 seulement');
    if (q < 0) throw new Error('Débit négatif refusé');
    return { h, q };
  }).sort((a, b) => a.h.localeCompare(b.h));
  if (new Set(sortie.map((r) => r.h)).size !== sortie.length) throw new Error('Deux relevés à la même heure pour le même point');
  return sortie;
}

export const minimumReleves = (r: Releve[]) => Math.min(...r.map((x) => x.q));

// ---------------------------------------------------------------------------
// Calculs (miroir des vues et de debits_resultats)
// ---------------------------------------------------------------------------

/** Points de pénalité (R-CPS-146, 149) : 1 % par point de τ non atteint, plafonné. */
export function penalitePoints(tau: number | null | undefined, plafond = 25, mode: ModePoints = 'proportionnels'): number | null {
  if (tau == null || Number.isNaN(tau)) return null;
  if (tau >= 0) return 0;
  return Math.min(plafond, mode === 'entiers' ? Math.floor(-tau) : -tau);
}

/** Arrondi à 2 décimales comme numeric round() (au plus loin de zéro). */
export const arrondi2 = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) / 100;

/** τ = 100 × (référence − réalisé) / référence, arrondi à 2 décimales. */
export function tau(reference: number | null | undefined, realise: number | null | undefined): number | null {
  if (reference == null || realise == null || !(reference > 0)) return null;
  return arrondi2((100 * (reference - realise)) / reference);
}

/** Débit de chaque zone par campagne et par nuit (v_debits_nuits) : mesures validées, au même instant si possible. */
export function debitsNuits(zones: ZoneDebit[], points: PointMesure[], campagnes: Campagne[], mesures: MesureNuit[]): NuitZone[] {
  const camp = new Map(campagnes.filter((c) => !c.supprime_le).map((c) => [c.id, c]));
  const pt = new Map(points.map((p) => [p.id, p]));
  const zn = new Map(zones.map((z) => [z.id, z]));
  const actives = mesures.filter((m) => !m.supprime_le && camp.has(m.campagne_id) && pt.has(m.point_id));
  const groupes = new Map<string, MesureNuit[]>();
  for (const m of actives) {
    const cle = `${m.campagne_id}|${pt.get(m.point_id)!.zone_id}|${m.nuit}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), m]);
  }
  const sortie: NuitZone[] = [];
  for (const [cle, liste] of groupes) {
    const [campagneId, zoneId, nuit] = cle.split('|');
    const valides = liste.filter((m) => m.validee_le);
    const attendus = new Set([...points.filter((p) => p.zone_id === zoneId && p.actif).map((p) => p.id), ...valides.map((m) => m.point_id)]);
    const parPoint = new Map(valides.map((m) => [m.point_id, m]));
    const nbMesures = [...attendus].filter((id) => parPoint.has(id)).length;
    const detail = valides.filter((m) => m.mode === 'releves' && m.releves && attendus.has(m.point_id));
    const instants = new Map<string, { q: number; nb: number }>();
    for (const m of detail) for (const r of m.releves!) {
      const i = instants.get(r.h) ?? { q: 0, nb: 0 };
      instants.set(r.h, { q: i.q + Number(r.q), nb: i.nb + 1 });
    }
    const pleins = [...instants.values()].filter((i) => i.nb === attendus.size);
    const exact = pleins.length > 0 && detail.length === attendus.size;
    const somme = valides.length ? valides.reduce((t, m) => t + Number(m.minimum_m3h), 0) : null;
    const z = zn.get(zoneId);
    sortie.push({
      campagne_id: campagneId, campagne_type: camp.get(campagneId)!.type, zone_id: zoneId,
      zone_numero: z?.numero ?? 0, zone_libelle: z?.libelle ?? '', nuit,
      nb_points: attendus.size, nb_points_mesures: nbMesures, nb_points_releves: detail.length, nb_instants: pleins.length,
      nb_valides: valides.length, nb_a_valider: liste.length - valides.length,
      complete: nbMesures === attendus.size,
      q_zone_m3h: exact ? Math.min(...pleins.map((i) => i.q)) : somme,
      approchee: !exact && nbMesures > 1,
    });
  }
  return sortie.sort((a, b) => a.nuit.localeCompare(b.nuit) || a.zone_numero - b.zone_numero);
}

/** Résultat de chaque campagne par zone (v_debits_campagnes) : minimum des nuits complètes. */
export function resultatsCampagnes(zones: ZoneDebit[], campagnes: Campagne[], nuits: NuitZone[]): CampagneZone[] {
  const sortie: CampagneZone[] = [];
  for (const c of campagnes.filter((x) => !x.supprime_le)) {
    const duMarche = (x: ZoneDebit) => !c.marche_id || !x.marche_id || x.marche_id === c.marche_id;
    for (const z of zones.filter((x) => duMarche(x) && (c.zone_id ? x.id === c.zone_id : x.actif !== false))) {
      const n = nuits.filter((x) => x.campagne_id === c.id && x.zone_id === z.id);
      const completes = n.filter((x) => x.complete && x.q_zone_m3h != null);
      const q = completes.length ? Math.min(...completes.map((x) => x.q_zone_m3h!)) : null;
      const auMin = completes.filter((x) => x.q_zone_m3h === q);
      sortie.push({
        campagne_id: c.id, type: c.type, libelle: c.libelle ?? null, date_debut: c.date_debut, date_fin: c.date_fin,
        zone_id: z.id, zone_numero: z.numero, zone_libelle: z.libelle, q_exige_m3h: z.q_exige_m3h,
        nb_nuits: n.length, nb_nuits_completes: completes.length, nb_a_valider: n.reduce((t, x) => t + x.nb_a_valider, 0),
        q_m3h: q, nuit_minimum: auMin.length ? auMin.map((x) => x.nuit).sort()[0] : null,
        approchee: auMin.some((x) => x.approchee), cree_le: c.cree_le,
      });
    }
  }
  return sortie;
}

const jours = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/** Performances par zone puis pour le marché (debits_resultats). pu : prix « balayage » et « maintien » (null : montants cachés). */
export function resultatsDebits(
  zones: ZoneDebit[], camps: CampagneZone[], r: ReglagesDebits,
  pu: { balayage: { pu: number; quantite: number } | null; maintien: { pu: number; quantite: number } | null },
  finMaintien: string | null = null,
): ResultatDebits[] {
  const pts = (t: number | null) => penalitePoints(t, r.debits_plafond_pct, r.debits_points);
  const mesurees = camps.filter((c) => c.q_m3h != null);
  const derniere = (zoneId: string, type: TypeCampagne) => mesurees.filter((c) => c.zone_id === zoneId && c.type === type)
    .sort((a, b) => b.date_debut.localeCompare(a.date_debut) || String(b.cree_le ?? '').localeCompare(String(a.cree_le ?? '')))[0];
  const parZone: ResultatDebits[] = zones.filter((z) => z.actif !== false).sort((a, b) => a.numero - b.numero).map((z) => {
    const qi = derniere(z.id, 'avant');
    const qf = derniere(z.id, 'apres');
    const controles = mesurees.filter((c) => c.zone_id === z.id && c.type === 'maintien')
      .sort((a, b) => a.date_debut.localeCompare(b.date_debut) || String(a.cree_le ?? '').localeCompare(String(b.cree_le ?? '')));
    const moyenne = controles.length ? controles.reduce((t, c) => t + c.q_m3h!, 0) / controles.length : null;
    const ecarts = controles.slice(1).map((c, i) => jours(controles[i].date_debut, c.date_debut));
    const qfv = qf?.q_m3h ?? null;
    const qiv = qi?.q_m3h ?? null;
    const t1 = tau(z.q_exige_m3h, qfv);
    const t2 = qfv != null && qfv > 0 && moyenne != null ? arrondi2((100 * (qfv - moyenne)) / qfv) : null;
    const mt1 = pu.balayage && z.lineaire_m != null ? arrondi2(z.lineaire_m * pu.balayage.pu) : null;
    const mt2 = pu.maintien && z.lineaire_m != null ? arrondi2(z.lineaire_m * pu.maintien.pu) : null;
    const p1 = pts(t1);
    const p2 = pts(t2);
    const gain = qiv != null && qfv != null ? qiv - qfv : null;
    const degrPct = gain != null && gain > 0 && moyenne != null && qfv != null ? arrondi2((100 * (moyenne - qfv)) / gain) : null;
    return {
      niveau: 'zone', zone_id: z.id, zone_numero: z.numero, zone_libelle: z.libelle, lineaire_m: z.lineaire_m,
      q_exige_m3h: z.q_exige_m3h, q_plus_bas_historique_m3h: z.q_plus_bas_historique_m3h ?? null, q_actuel_m3h: z.q_actuel_m3h ?? null,
      balayage_acheve_le: z.balayage_acheve_le ?? null,
      qi_m3h: qiv, qi_approche: qi?.approchee ?? null, qi_nuits: qi?.nb_nuits_completes ?? null,
      qf_m3h: qfv, qf_approche: qf?.approchee ?? null, qf_nuits: qf?.nb_nuits_completes ?? null,
      delta_q_m3h: gain, tau1_pct: t1, points_balayage: p1, montant_balayage: mt1,
      penalite_balayage: r.debits_assiette === 'zone' && mt1 != null && p1 != null ? arrondi2((mt1 * p1) / 100) : null,
      alerte_arret: t1 != null && t1 < -r.debits_seuil_arret_pct,
      nb_controles: controles.length, dernier_controle: controles.at(-1)?.date_debut ?? null,
      dernier_controle_m3h: controles.at(-1)?.q_m3h ?? null, ecart_controles_max_j: ecarts.length ? Math.max(...ecarts) : null,
      q_maintien_moyen_m3h: moyenne, tau2_pct: t2, points_maintien: p2, montant_maintien: mt2,
      penalite_maintien: r.debits_assiette === 'zone' && mt2 != null && p2 != null ? arrondi2((mt2 * p2) / 100) : null,
      degradation_m3h: moyenne != null && qfv != null ? moyenne - qfv : null, degradation_pct: degrPct,
      alerte_degradation: degrPct != null && degrPct > r.debits_seuil_degradation_pct,
      assiette: r.debits_assiette, mode_points: r.debits_points, fin_maintien: finMaintien,
    };
  });
  if (!parZone.length) return [];
  const tous = (k: keyof ResultatDebits) => parZone.every((z) => z[k] != null);
  const somme = (k: keyof ResultatDebits) => parZone.reduce((t, z) => t + Number(z[k] ?? 0), 0);
  const sommeOuNul = (k: keyof ResultatDebits) => (parZone.some((z) => z[k] != null) ? somme(k) : null);
  const qe = somme('q_exige_m3h');
  const qi = tous('qi_m3h') ? somme('qi_m3h') : null;
  const qf = tous('qf_m3h') ? somme('qf_m3h') : null;
  const moy = tous('q_maintien_moyen_m3h') ? somme('q_maintien_moyen_m3h') : null;
  const t1 = qf != null && qe > 0 ? arrondi2((100 * (qe - qf)) / qe) : null;
  const t2 = qf != null && moy != null && qf > 0 ? arrondi2((100 * (qf - moy)) / qf) : null;
  const degrPct = qi != null && qf != null && moy != null && qi - qf > 0 ? arrondi2((100 * (moy - qf)) / (qi - qf)) : null;
  const marche = r.debits_assiette === 'marche';
  const mt1 = marche ? (pu.balayage ? arrondi2(pu.balayage.quantite * pu.balayage.pu) : null) : sommeOuNul('montant_balayage');
  const mt2 = marche ? (pu.maintien ? arrondi2(pu.maintien.quantite * pu.maintien.pu) : null) : sommeOuNul('montant_maintien');
  const p1 = pts(t1);
  const p2 = pts(t2);
  const dates = parZone.map((z) => z.dernier_controle).filter((d): d is string => !!d).sort();
  const ecarts = parZone.map((z) => z.ecart_controles_max_j).filter((d): d is number => d != null);
  return [...parZone, {
    niveau: 'marche', zone_id: null, zone_numero: null, zone_libelle: null, lineaire_m: sommeOuNul('lineaire_m'),
    q_exige_m3h: qe, q_plus_bas_historique_m3h: sommeOuNul('q_plus_bas_historique_m3h'), q_actuel_m3h: sommeOuNul('q_actuel_m3h'),
    balayage_acheve_le: null, qi_m3h: qi, qi_approche: qi != null ? parZone.some((z) => z.qi_approche) : null, qi_nuits: null,
    qf_m3h: qf, qf_approche: qf != null ? parZone.some((z) => z.qf_approche) : null, qf_nuits: null,
    delta_q_m3h: qi != null && qf != null ? qi - qf : null, tau1_pct: t1, points_balayage: p1, montant_balayage: mt1,
    penalite_balayage: marche ? (mt1 != null && p1 != null ? arrondi2((mt1 * p1) / 100) : null) : sommeOuNul('penalite_balayage'),
    alerte_arret: parZone.some((z) => z.alerte_arret), nb_controles: somme('nb_controles'),
    dernier_controle: dates.at(-1) ?? null, dernier_controle_m3h: null, ecart_controles_max_j: ecarts.length ? Math.max(...ecarts) : null,
    q_maintien_moyen_m3h: moy, tau2_pct: t2, points_maintien: p2, montant_maintien: mt2,
    penalite_maintien: marche ? (mt2 != null && p2 != null ? arrondi2((mt2 * p2) / 100) : null) : sommeOuNul('penalite_maintien'),
    degradation_m3h: moy != null && qf != null ? moy - qf : null, degradation_pct: degrPct,
    alerte_degradation: degrPct != null && degrPct > r.debits_seuil_degradation_pct,
    assiette: r.debits_assiette, mode_points: r.debits_points, fin_maintien: finMaintien,
  }];
}

// ---------------------------------------------------------------------------
// Import d'un fichier de télé-relève ou d'enregistreur
// ---------------------------------------------------------------------------

export interface LigneImport { point: string; nuit: string; h: string | null; q: number }
export interface MesureImport { point_id: string; nuit: string; releves?: Releve[]; minimum_m3h?: number }
export interface ResultatImport { mesures: MesureImport[]; ignorees: number; erreurs: string[]; pointsInconnus: string[] }

const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Date « JJ/MM/AAAA », « AAAA-MM-JJ » ou nombre de jours Excel → « AAAA-MM-JJ ». */
export function dateImport(v: string): string | null {
  const t = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
  if (m) {
    const annee = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${annee}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (/^\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (n > 30000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10);
  }
  return null;
}

/** Heure « HH:MM[:SS] », ou fraction de jour Excel → « HH:MM ». */
export function heureImport(v: string): string | null {
  const t = v.trim();
  const m = /(\d{1,2}):(\d{2})(?::\d{2})?/.exec(t);
  if (m) return heureNormale(`${m[1]}:${m[2]}`);
  if (/^\d*\.\d+$|^0$/.test(t)) {
    const fraction = Number(t) % 1;
    const minutes = Math.round(fraction * 1440);
    return heureNormale(`${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`);
  }
  return null;
}

/**
 * Lignes d'un tableau importé (première ligne : en-têtes). Colonnes reconnues : point (code), date (ou date et heure
 * ensemble), heure, débit (m3/h) ; sans heure : minimum de la nuit. Les relevés hors de 0 h à 6 h sont ignorés.
 */
export function lireTableauImport(tableau: string[][]): { lignes: LigneImport[]; ignorees: number; erreurs: string[] } {
  const erreurs: string[] = [];
  if (tableau.length < 2) return { lignes: [], ignorees: 0, erreurs: ['Fichier vide ou sans en-têtes'] };
  const entetes = tableau[0].map(sansAccent);
  const col = (...noms: string[]) => entetes.findIndex((e) => noms.some((n) => e === n || e.startsWith(n)));
  const iPoint = col('point', 'code', 'compteur', 'ouvrage');
  const iDate = col('date', 'jour', 'nuit', 'horodatage');
  const iHeure = col('heure');
  const iDebit = col('debit', 'q', 'valeur', 'minimum');
  if (iPoint < 0 || iDate < 0 || iDebit < 0) {
    return { lignes: [], ignorees: 0, erreurs: ['Colonnes attendues : point, date, heure (facultative), débit'] };
  }
  const lignes: LigneImport[] = [];
  let ignorees = 0;
  tableau.slice(1).forEach((l, i) => {
    if (l.every((c) => !String(c ?? '').trim())) return;
    const brut = String(l[iDate] ?? '');
    const nuit = dateImport(brut);
    const h = iHeure >= 0 ? heureImport(String(l[iHeure] ?? '')) : heureImport(brut.includes(':') || brut.includes('.') ? brut.replace(/^[^ T]*[ T]/, '') : '');
    const q = Number(String(l[iDebit] ?? '').replace(/\s/g, '').replace(',', '.'));
    const point = String(l[iPoint] ?? '').trim();
    if (!nuit || !point || !Number.isFinite(q) || String(l[iDebit] ?? '').trim() === '') {
      if (erreurs.length < 10) erreurs.push(`Ligne ${i + 2} illisible`);
      return;
    }
    if (q < 0) {
      if (erreurs.length < 10) erreurs.push(`Ligne ${i + 2} : débit négatif`);
      return;
    }
    if (h != null && h > '06:00') {
      ignorees++;
      return;
    }
    lignes.push({ point, nuit, h, q });
  });
  return { lignes, ignorees, erreurs };
}

/** Lignes importées → mesures par point et par nuit (codes des points du marché, nuits de la campagne). */
export function regrouperImport(
  lu: { lignes: LigneImport[]; ignorees: number; erreurs: string[] },
  points: PointMesure[], campagne: Pick<Campagne, 'date_debut' | 'date_fin' | 'zone_id'>,
): ResultatImport {
  const parCode = new Map(points.map((p) => [sansAccent(p.code), p]));
  const inconnus = new Set<string>();
  const erreurs = [...lu.erreurs];
  let ignorees = lu.ignorees;
  const groupes = new Map<string, { point: PointMesure; nuit: string; releves: Map<string, number>; minimum: number | null }>();
  for (const l of lu.lignes) {
    const p = parCode.get(sansAccent(l.point));
    if (!p) { inconnus.add(l.point); continue; }
    if (campagne.zone_id && p.zone_id !== campagne.zone_id) { inconnus.add(l.point); continue; }
    if (l.nuit < campagne.date_debut || l.nuit > campagne.date_fin) { ignorees++; continue; }
    const cle = `${p.id}|${l.nuit}`;
    const g = groupes.get(cle) ?? { point: p, nuit: l.nuit, releves: new Map(), minimum: null };
    if (l.h == null) g.minimum = g.minimum == null ? l.q : Math.min(g.minimum, l.q);
    else g.releves.set(l.h, l.q);
    groupes.set(cle, g);
  }
  const mesures: MesureImport[] = [];
  for (const g of groupes.values()) {
    if (g.releves.size) {
      mesures.push({ point_id: g.point.id, nuit: g.nuit, releves: [...g.releves].map(([h, q]) => ({ h, q })).sort((a, b) => a.h.localeCompare(b.h)) });
    } else if (g.minimum != null) mesures.push({ point_id: g.point.id, nuit: g.nuit, minimum_m3h: g.minimum });
  }
  if (mesures.length > 2000) erreurs.push('2 000 mesures au plus par import');
  return { mesures: mesures.sort((a, b) => a.nuit.localeCompare(b.nuit)), ignorees, erreurs, pointsInconnus: [...inconnus] };
}

/** Texte CSV (séparateur ; , ou tabulation, guillemets) → tableau. */
export function lireCsv(texte: string): string[][] {
  const premiere = texte.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', '\t', ','].map((s) => [s, premiere.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === sep) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = '';
    } else champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

export const debit = (n: number | null | undefined, d = 1) =>
  n == null ? '—' : `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d })}`;

export const pourcent = (n: number | null | undefined) =>
  n == null ? '—' : `${n > 0 ? '+' : ''}${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

export const jourFr = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

/** Nuits d'une campagne, de la première à la dernière. */
export function nuitsCampagne(c: Pick<Campagne, 'date_debut' | 'date_fin'>): string[] {
  const n = Math.max(0, jours(c.date_debut, c.date_fin));
  return Array.from({ length: n + 1 }, (_, i) => new Date(Date.parse(`${c.date_debut}T12:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
}

/** Dernière nuit par défaut (3 nuits avant et après, une sinon), comme la base. */
export const dateFinDefaut = (type: TypeCampagne, debut: string) =>
  nuitsCampagne({ date_debut: debut, date_fin: debut }).length && ['avant', 'apres'].includes(type)
    ? new Date(Date.parse(`${debut}T12:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10)
    : debut;

export function libelleCampagne(c: Pick<Campagne, 'type' | 'libelle' | 'date_debut' | 'date_fin'>): string {
  const dates = c.date_debut === c.date_fin ? `nuit du ${jourFr(c.date_debut)}` : `du ${jourFr(c.date_debut)} au ${jourFr(c.date_fin)}`;
  return `${c.libelle || TYPES_CAMPAGNE[c.type].libelle} · ${dates}`;
}
