// Rapport journalier de recherche de fuites (CPS art. II-21) depuis le journal des balayages : lit la journée
// (v_balayage_journalier), les fuites détectées ce jour (v_fuites_export), puis fabrique le PDF (avec l'extrait
// de plan A4 : conduites inspectées ce jour en vert, repassées en bleu, autres en gris, fuites numérotées) ou
// l'Excel. Chargé au clic, comme les autres exports.
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
  'numero, reference_srm, adresse, zone, secteur_id, secteur, equipe_id, visibilite, diametre_mm, materiau, revetement, latitude, longitude';

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

/** Fonction de capture de l'extrait de plan : réseau des secteurs balayés ce jour, état du jour seulement. */
function capturePlan(marcheId: string, jour: string, lignes: LigneVueJournalier[], fuites: FuiteJour[], equipe?: string | null) {
  return async (largeurMm: number, hauteurMm: number): Promise<ImageCarte> => {
    const sb = getSupabase();
    const [{ capturerCarte }, contexte, b, fond] = await Promise.all([
      import('../carte/capture'),
      chargerContexteReseau(marcheId),
      (() => {
        const q = sb.from('balayages').select('troncon_id, premier_passage').eq('marche_id', marcheId).eq('date_balayage', jour).is('annule_le', null);
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
      etats.set(id, { balaye: p.premier, repasse: !p.premier, passages: 1, premier: jour, dernier: jour, equipe: null, agent: null });
    }
    // Cadrage : tronçons inspectés ce jour et fuites du jour, marge de 10 %.
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
    if (!Number.isFinite(ouest)) throw new Error('Aucune conduite à montrer pour cette journée.');
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
 * Télécharge le rapport du jour (un fichier) ou un rapport par équipe (un fichier par équipe).
 * Renvoie le nombre de fichiers et les fuites qu'aucune équipe ne peut porter (secteur balayé par plusieurs équipes).
 */
export async function telechargerRapportJournalier(
  marcheId: string, jour: string, format: 'pdf' | 'xlsx', mode: ModeRapport, avecPlan: boolean,
): Promise<{ fichiers: number; nonAttribuees: number }> {
  const sb = getSupabase();
  const [{ chargerContexteRapport }, rj, { telecharger }] = await Promise.all([
    import('@/lib/export/rapport-fuite'), import('@/lib/export/rapport-journalier'), import('@/lib/export/modele'),
  ]);
  const [ctx, l, f] = await Promise.all([
    chargerContexteRapport(marcheId, false),
    sb.from('v_balayage_journalier').select('*').eq('marche_id', marcheId).eq('date_balayage', jour),
    sb.from('v_fuites_export').select(COLONNES_FUITES).eq('marche_id', marcheId).eq('jour_detection', jour).order('numero'),
  ]);
  if (l.error) throw l.error;
  if (f.error) throw f.error;
  const lignes = (l.data as LigneVueJournalier[] | null) ?? [];
  const fuites = (f.data as FuiteJour[] | null) ?? [];
  if (lignes.length === 0) throw new Error('Aucun balayage ce jour-là.');

  const produire = async (
    journee: Parameters<typeof rj.genererRapportJournalierPdf>[1], liste: FuiteJour[], lignesPlan: LigneVueJournalier[], equipe?: string | null,
  ) => {
    const nom = rj.nomFichierRapportJournalier(ctx, journee);
    if (format === 'xlsx') {
      telecharger(await rj.genererRapportJournalierXlsx(ctx, journee, liste), `${nom}.xlsx`);
      return;
    }
    const extrait = avecPlan ? { capturer: capturePlan(marcheId, jour, lignesPlan, liste, equipe) } : null;
    telecharger(await rj.genererRapportJournalierPdf(ctx, journee, liste, { extrait }), `${nom}.pdf`);
  };

  if (mode === 'jour') {
    await produire(rj.syntheseJournee(lignes, { date: jour }), fuites, lignes);
    return { fichiers: 1, nonAttribuees: 0 };
  }
  const { rapports, fuitesNonAttribuees } = rj.regrouperParEquipe(lignes, fuites, { date: jour });
  for (const r of rapports) {
    const lignesEquipe = lignes.filter((x) => (x.equipe_id ?? null) === r.equipe.id);
    await produire(r.journee, r.fuites, lignesEquipe.length ? lignesEquipe : lignes, r.equipe.id);
  }
  return { fichiers: rapports.length, nonAttribuees: fuitesNonAttribuees.length };
}
