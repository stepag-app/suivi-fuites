// Rapport de recherche de fuites (CPS art. II-21) depuis le journal des balayages, pour la période Du–Au choisie
// (Du = Au : rapport journalier) : lit les balayages (v_balayage_journalier) et les fuites détectées sur la période
// (v_fuites_export), puis fabrique un seul PDF (avec l'extrait de plan A4 : conduites inspectées sur la période en
// vert, repassées en bleu, autres en gris, fuites numérotées) ou un seul Excel. Pour une journée, un rapport par
// équipe reste possible. Rubriques à cocher (lib/export/rubriques.ts). Chargé au clic, comme les autres exports.
import type { Feature, LineString } from 'geojson';
import type { StyleSpecification } from 'maplibre-gl';
import type { ImageCarte } from '@/lib/export/carte-pdf';
import type { FuiteJour, LigneVueJournalier } from '@/lib/export/rapport-journalier';
import { paletteSecteurs } from '@/lib/reseau/palette';
import { chargerContexteReseau, chargerTronconsSecteur } from '@/lib/reseau/donnees';
import { SANS_SECTEUR, type EtatFeature } from '@/lib/reseau/types';
import { getSupabase } from '@/lib/supabase';
import { STYLE_FOND } from '../carte/commun';

export type ModeRapport = 'jour' | 'equipe';

const COLONNES_FUITES =
  'numero, reference_srm, adresse, zone, secteur_id, secteur, equipe_id, visibilite, diametre_mm, materiau, revetement, latitude, longitude, jour_detection';

export interface PeriodeRapport { du: string; au: string }
/** Filtres du journal repris par le rapport (vides : toutes les équipes, tous les secteurs). */
export interface FiltresRapport { equipe?: string; secteur?: string }

async function styleFond(): Promise<{ style: StyleSpecification; avecTextes: boolean; indisponible: boolean }> {
  const { STYLE_SECOURS } = await import('../carte/couches');
  try {
    const c = new AbortController();
    const minuterie = setTimeout(() => c.abort(), 8000);
    const r = await fetch(STYLE_FOND, { signal: c.signal });
    clearTimeout(minuterie);
    if (!r.ok) throw new Error(String(r.status));
    const style = (await r.json()) as StyleSpecification;
    return { style, avecTextes: !!style.glyphs, indisponible: false };
  } catch {
    return { style: STYLE_SECOURS, avecTextes: false, indisponible: true };
  }
}

/** Fonction de capture de l'extrait de plan : réseau des secteurs balayés sur la période, état de la période seulement. */
function capturePlan(marcheId: string, periode: PeriodeRapport, lignes: LigneVueJournalier[], fuites: FuiteJour[], equipe?: string | null) {
  return async (largeurMm: number, hauteurMm: number): Promise<ImageCarte> => {
    const sb = getSupabase();
    const [{ capturerCarte }, contexte, b, fond] = await Promise.all([
      import('../carte/capture'),
      chargerContexteReseau(marcheId),
      (() => {
        const q = sb.from('balayages').select('troncon_id, premier_passage').eq('marche_id', marcheId)
          .gte('date_balayage', periode.du).lte('date_balayage', periode.au).is('annule_le', null);
        // Rapport d'une équipe : seulement ses passages (les autres conduites restent grises).
        return equipe === undefined ? q : equipe === null ? q.is('equipe_id', null) : q.eq('equipe_id', equipe);
      })(),
      styleFond(),
    ]);
    if (b.error) throw b.error;
    const passages = new Map<string, { premier: boolean }>();
    for (const x of (b.data as { troncon_id: string; premier_passage: boolean }[] | null) ?? []) {
      const p = passages.get(x.troncon_id);
      passages.set(x.troncon_id, { premier: (p?.premier ?? false) || x.premier_passage });
    }
    const modifie = new Map(contexte.lignes.map((l) => [l.secteur_id, l.modifie_le]));
    const ids = [...new Set(lignes.map((l) => l.secteur_id ?? SANS_SECTEUR))];
    const secteurs = await Promise.all(ids.map(async (id) => ({
      id, data: await chargerTronconsSecteur(marcheId, id, id === SANS_SECTEUR ? null : modifie.get(id) ?? null),
    })));
    const etats = new Map<string, EtatFeature>();
    for (const [id, p] of passages) {
      etats.set(id, { balaye: p.premier, repasse: !p.premier, passages: 1, premier: periode.du, dernier: periode.au, equipe: null, agent: null });
    }
    // Cadrage : tronçons inspectés sur la période et fuites de la période, marge de 10 %.
    let ouest = Infinity, est = -Infinity, sud = Infinity, nord = -Infinity;
    const etendre = (lon: number, lat: number) => {
      ouest = Math.min(ouest, lon); est = Math.max(est, lon); sud = Math.min(sud, lat); nord = Math.max(nord, lat);
    };
    for (const s of secteurs) {
      for (const f of s.data.features as Feature<LineString, { id: string }>[]) {
        if (passages.has(f.properties.id)) for (const c of f.geometry.coordinates) etendre(c[0], c[1]);
      }
    }
    for (const f of fuites) if (f.latitude != null && f.longitude != null) etendre(f.longitude, f.latitude);
    if (!Number.isFinite(ouest)) {
      for (const s of secteurs) for (const f of s.data.features) for (const c of f.geometry.coordinates) etendre(c[0], c[1]);
    }
    if (!Number.isFinite(ouest)) throw new Error('Aucune conduite à montrer pour cette période.');
    const mx = Math.max((est - ouest) * 0.1, 0.0008);
    const my = Math.max((nord - sud) * 0.1, 0.0008);
    return capturerCarte(
      {
        style: fond.style, avecTextes: fond.avecTextes, fondIndisponible: fond.indisponible,
        bornes: [[ouest - mx, sud - my], [est + mx, nord + my]],
        centre: [(ouest + est) / 2, (sud + nord) / 2], zoom: 15,
        // Vue « écran » fictive très grande : la capture cadre alors sur les bornes.
        largeurPx: 100000, hauteurPx: 100000,
      },
      {
        fuites: [], zones: [], secteurs: [],
        reseau: { secteurs, coloration: 'balayage', palette: paletteSecteurs(contexte.zones, contexte.secteurs), etats },
      },
      largeurMm, hauteurMm,
    );
  };
}

/**
 * Télécharge le rapport de la période (un seul fichier ; Du = Au : rapport du jour), ou, pour une journée, un rapport
 * par équipe (un fichier par équipe). Renvoie le nombre de fichiers et les fuites qu'aucune équipe ne peut porter
 * (secteur balayé par plusieurs équipes).
 */
export async function telechargerRapportBalayage(
  marcheId: string, periode: PeriodeRapport, format: 'pdf' | 'xlsx', mode: ModeRapport, rubriques: Set<string>, filtres: FiltresRapport = {},
): Promise<{ fichiers: number; nonAttribuees: number }> {
  const { du, au } = periode.du <= periode.au ? periode : { du: periode.au, au: periode.du };
  const sb = getSupabase();
  const [{ chargerContexteRapport }, rj, { telecharger }] = await Promise.all([
    import('@/lib/export/rapport-fuite'), import('@/lib/export/rapport-journalier'), import('@/lib/export/modele'),
  ]);
  const [ctx, l, f] = await Promise.all([
    chargerContexteRapport(marcheId, false),
    sb.from('v_balayage_journalier').select('*').eq('marche_id', marcheId).gte('date_balayage', du).lte('date_balayage', au),
    sb.from('v_fuites_export').select(COLONNES_FUITES).eq('marche_id', marcheId).gte('jour_detection', du).lte('jour_detection', au).order('numero'),
  ]);
  if (l.error) throw l.error;
  if (f.error) throw f.error;
  const lignes = ((l.data as LigneVueJournalier[] | null) ?? [])
    .filter((x) => (!filtres.equipe || x.equipe_id === filtres.equipe) && (!filtres.secteur || x.secteur_id === filtres.secteur));
  const fuites = ((f.data as FuiteJour[] | null) ?? [])
    .filter((x) => (!filtres.equipe || x.equipe_id === filtres.equipe) && (!filtres.secteur || x.secteur_id === filtres.secteur));
  if (lignes.length === 0) throw new Error(du === au ? 'Aucun balayage ce jour-là.' : 'Aucun balayage sur la période choisie.');
  const avecPlan = rubriques.has('plan');
  const equipeFiltre = filtres.equipe || undefined;

  const produire = async (
    journee: Parameters<typeof rj.genererRapportJournalierPdf>[1], liste: FuiteJour[], lignesPlan: LigneVueJournalier[], equipe?: string | null,
  ) => {
    const nom = rj.nomFichierRapportJournalier(ctx, journee);
    if (format === 'xlsx') {
      telecharger(await rj.genererRapportJournalierXlsx(ctx, journee, liste, { rubriques }), `${nom}.xlsx`);
      return;
    }
    const extrait = avecPlan ? { capturer: capturePlan(marcheId, { du, au }, lignesPlan, liste, equipe) } : null;
    telecharger(await rj.genererRapportJournalierPdf(ctx, journee, liste, { extrait, rubriques }), `${nom}.pdf`);
  };

  if (du !== au || mode === 'jour') {
    await produire(rj.synthesePeriode(lignes, { du, au }), fuites, lignes, equipeFiltre);
    return { fichiers: 1, nonAttribuees: 0 };
  }
  const { rapports, fuitesNonAttribuees } = rj.regrouperParEquipe(lignes, fuites, { date: du });
  for (const r of rapports) {
    const lignesEquipe = lignes.filter((x) => (x.equipe_id ?? null) === r.equipe.id);
    await produire(r.journee, r.fuites, lignesEquipe.length ? lignesEquipe : lignes, r.equipe.id);
  }
  return { fichiers: rapports.length, nonAttribuees: fuitesNonAttribuees.length };
}
