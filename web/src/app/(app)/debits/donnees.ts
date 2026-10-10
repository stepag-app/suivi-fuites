// Chargement des débits de nuit d'un marché (S15) : référentiel, campagnes, vues de calcul et résultats de la base.
import {
  REGLAGES_DEFAUT, type Campagne, type CampagneZone, type MesureNuit, type NuitZone, type PointMesure, type ReglagesDebits,
  type ResultatDebits, type ZoneDebit,
} from "@/lib/debits";
import { getSupabase, lireTout } from "@/lib/supabase";

export interface SecteurDebit { id: string; zone_id: string; code: string; libelle: string }
export interface PhaseDebit { id: string; code: string; libelle: string; ordre: number; date_debut: string | null; date_fin: string | null }

export interface DonneesDebits {
  marcheId: string;
  zones: ZoneDebit[];
  secteurs: SecteurDebit[];
  points: PointMesure[];
  campagnes: Campagne[];
  nuits: NuitZone[];
  camps: CampagneZone[];
  resultats: ResultatDebits[];
  reglages: ReglagesDebits;
  phases: PhaseDebit[];
  aValider: number;
}

type Reponse<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

/** Table ou fonction absente : migration 20261013300000 pas encore déployée. */
export const baseAbsente = (e: unknown) => {
  const code = (e as { code?: string } | null)?.code;
  return code === "42P01" || code === "PGRST205" || code === "PGRST202" || code === "42883" || code === "42703";
};

async function lire<T>(requete: unknown): Promise<T[]> {
  const { data, error } = await (requete as Reponse<T>);
  if (error) throw error;
  return data ?? [];
}

export async function chargerDebits(marcheId: string, peutValider: boolean): Promise<DonneesDebits> {
  const sb = getSupabase();
  const tout = <T,>(requete: (de: number, a: number) => unknown) => lireTout<T>((de, a) => requete(de, a) as Reponse<T>);
  const [zones, secteurs, points, campagnes, nuits, camps, resultats, reglages, phases, aValider] = await Promise.all([
    lire<ZoneDebit>(sb.from("zones").select("id, numero, libelle, lineaire_m, q_exige_m3h, q_plus_bas_historique_m3h, q_actuel_m3h, balayage_acheve_le, actif")
      .eq("marche_id", marcheId).order("numero")),
    lire<SecteurDebit>(sb.from("secteurs").select("id, zone_id, code, libelle").eq("marche_id", marcheId).order("ordre").order("code")),
    lire<PointMesure>(sb.from("points_mesure").select("*").eq("marche_id", marcheId).order("ordre").order("code")),
    lire<Campagne>(sb.from("campagnes_debit").select("*").eq("marche_id", marcheId).is("supprime_le", null)
      .order("date_debut", { ascending: false }).order("cree_le", { ascending: false })),
    tout<NuitZone>((de, a) => sb.from("v_debits_nuits").select("*").eq("marche_id", marcheId).order("nuit").order("zone_numero").order("campagne_id").range(de, a)),
    lire<CampagneZone>(sb.from("v_debits_campagnes").select("*").eq("marche_id", marcheId).order("date_debut").order("zone_numero")),
    (async () => {
      const { data, error } = await sb.rpc("debits_resultats", { p_marche: marcheId });
      if (error) throw error;
      return (data as ResultatDebits[] | null) ?? [];
    })(),
    (async () => {
      const { data, error } = await sb.from("marches")
        .select("debits_mode_saisie, debits_assiette, debits_points, debits_plafond_pct, debits_seuil_arret_pct, debits_seuil_degradation_pct")
        .eq("id", marcheId).maybeSingle();
      if (error) throw error;
      return { ...REGLAGES_DEFAUT, ...((data as Partial<ReglagesDebits> | null) ?? {}) };
    })(),
    lire<PhaseDebit>(sb.from("phases").select("id, code, libelle, ordre, date_debut, date_fin").eq("marche_id", marcheId).order("ordre")),
    peutValider
      ? (async () => {
        const { count, error } = await sb.from("v_debits_a_valider").select("id", { count: "exact", head: true }).eq("marche_id", marcheId);
        if (error) throw error;
        return count ?? 0;
      })()
      : 0,
  ]);
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    marcheId,
    zones: zones.map((z) => ({ ...z, lineaire_m: num(z.lineaire_m), q_exige_m3h: num(z.q_exige_m3h), q_plus_bas_historique_m3h: num(z.q_plus_bas_historique_m3h), q_actuel_m3h: num(z.q_actuel_m3h) })),
    secteurs, points, campagnes, phases, aValider,
    nuits: nuits.map((n) => ({ ...n, q_zone_m3h: num(n.q_zone_m3h) })),
    camps: camps.map((c) => ({ ...c, q_m3h: num(c.q_m3h), q_exige_m3h: num(c.q_exige_m3h) })),
    resultats: resultats.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v])) as unknown as ResultatDebits),
    reglages: {
      ...reglages,
      debits_plafond_pct: Number(reglages.debits_plafond_pct), debits_seuil_arret_pct: Number(reglages.debits_seuil_arret_pct),
      debits_seuil_degradation_pct: Number(reglages.debits_seuil_degradation_pct),
    },
  };
}

export async function chargerMesures(campagneId: string): Promise<MesureNuit[]> {
  const sb = getSupabase();
  const lignes = await lire<MesureNuit>(sb.from("mesures_nuit").select("*").eq("campagne_id", campagneId).is("supprime_le", null).order("nuit"));
  return lignes.map((m) => ({ ...m, minimum_m3h: Number(m.minimum_m3h), releves: m.releves?.map((r) => ({ h: r.h, q: Number(r.q) })) ?? null }));
}

/** Pièce jointe d'une campagne : <marché>/<campagne>/<fichier> dans le compartiment privé « debits ». */
export async function deposerPieceJointe(marcheId: string, campagneId: string, f: File): Promise<string> {
  const extension = (f.name.split(".").pop() ?? "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const chemin = `${marcheId}/${campagneId}/pv-${Date.now()}.${extension}`;
  const { error } = await getSupabase().storage.from("debits").upload(chemin, f, { contentType: f.type || undefined, upsert: false });
  if (error) throw error;
  return chemin;
}

export async function ouvrirPieceJointe(chemin: string) {
  const { data, error } = await getSupabase().storage.from("debits").createSignedUrl(chemin, 600);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}
