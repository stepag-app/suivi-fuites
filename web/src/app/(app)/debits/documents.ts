// Documents des débits de nuit (D7) : procès-verbal de mesures d'une campagne (A4, visas de l'entreprise et du maître
// d'ouvrage) et export Excel de la synthèse. Modèle neutre (src/lib/export/modele.ts), PDF ou Excel au choix.
import {
  TYPES_CAMPAGNE, debitsNuits, jourFr, nuitsCampagne, resultatsCampagnes, type Campagne, type MesureNuit, type PointMesure,
  type ResultatDebits, type ZoneDebit, type NuitZone, type CampagneZone,
} from "@/lib/debits";
import { construireSection, type Colonne, type DocumentExport, type Ligne, type SectionDoc } from "@/lib/export/modele";
import { construireEntete, type Contexte } from "@/lib/export/jeux";

const PIED = "Débit de la nuit : minimum des relevés de 0 h à 6 h (art. II-17). Débit d'une zone : somme de ses points au même instant "
  + "(tableau n° 1) ; « ~ » : somme des minimums des points (approchée). Qi et Qf : minimum des nuits complètes (art. II-17 et II-22).";

// Polices standard du PDF (WinAnsi) : ni « ≈ », ni « τ », ni espaces fines ; « ~ » et « Tau » à la place.
const nb = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ");

const nom = (ctx: Contexte, cle: string, defaut: string) => String(ctx.marche[cle] ?? "").trim() || defaut;

/** Procès-verbal de mesures d'une campagne : points par nuit, zones par nuit et résultat, relevés détaillés s'il y en a. */
export function documentProcesVerbal(
  ctx: Contexte, campagne: Campagne, zones: ZoneDebit[], points: PointMesure[], mesures: MesureNuit[],
  o: { detail: boolean; orientation: "portrait" | "paysage" },
): DocumentExport {
  const nuits = nuitsCampagne(campagne);
  const zonesC = zones.filter((z) => (campagne.zone_id ? z.id === campagne.zone_id : z.actif !== false)).sort((a, b) => a.numero - b.numero);
  const ptsC = points.filter((p) => zonesC.some((z) => z.id === p.zone_id) && (p.actif || mesures.some((m) => m.point_id === p.id)));
  const valides = mesures.filter((m) => m.validee_le && !m.supprime_le);
  const nz = debitsNuits(zones, points, [campagne], valides);
  const cz = resultatsCampagnes(zones, [campagne], nz);

  const zoneDe = (id: string) => zonesC.find((z) => z.id === id);
  const lignesPoints: Ligne[] = ptsC
    .sort((a, b) => (zoneDe(a.zone_id)?.numero ?? 0) - (zoneDe(b.zone_id)?.numero ?? 0) || a.code.localeCompare(b.code, "fr"))
    .map((p) => ({
      zone: `Zone ${zoneDe(p.zone_id)?.numero ?? ""}`, code: p.code, libelle: p.libelle,
      ...Object.fromEntries(nuits.map((n) => [n, valides.find((m) => m.point_id === p.id && m.nuit === n)?.minimum_m3h ?? null])),
    }));
  const colonnesNuits = (prefixe: string): Colonne[] => nuits.map((n) => ({ cle: n, titre: `${prefixe}${jourFr(n).slice(0, 5)}`, groupe: "", type: "nombre", decimales: 2, largeur: 9 }));
  const sections: SectionDoc[] = [
    construireSection(lignesPoints, [
      { cle: "zone", titre: "Zone", groupe: "", largeur: 8 },
      { cle: "code", titre: "Point", groupe: "", largeur: 8 },
      { cle: "libelle", titre: "Ouvrage de comptage", groupe: "", largeur: 24 },
      ...colonnesNuits("Nuit du "),
    ], { titre: "Débit minimum de chaque point par nuit (m³/h)" }),
  ];

  const valeurZone = (n: NuitZone | undefined) => (n?.q_zone_m3h == null ? null : `${n.approchee ? "~ " : ""}${nb(n.q_zone_m3h)}${n.complete ? "" : " (incomplet)"}`);
  const lignesZones: Ligne[] = zonesC.map((z) => {
    const r = cz.find((c) => c.zone_id === z.id);
    const t = campagne.type === "apres" && z.q_exige_m3h && r?.q_m3h != null ? Math.round((10000 * (z.q_exige_m3h - r.q_m3h)) / z.q_exige_m3h) / 100 : null;
    return {
      zone: `Zone ${z.numero} – ${z.libelle}`,
      ...Object.fromEntries(nuits.map((n) => [n, valeurZone(nz.find((x) => x.zone_id === z.id && x.nuit === n))])),
      resultat: r?.q_m3h == null ? null : `${r.approchee ? "~ " : ""}${nb(r.q_m3h)}`,
      q_exige: z.q_exige_m3h, tau: t,
    };
  });
  const court = TYPES_CAMPAGNE[campagne.type].court;
  sections.push(construireSection(lignesZones, [
    { cle: "zone", titre: "Zone", groupe: "", largeur: 26 },
    ...nuits.map((n): Colonne => ({ cle: n, titre: `Nuit du ${jourFr(n).slice(0, 5)}`, groupe: "", largeur: 11 })),
    { cle: "resultat", titre: campagne.type === "libre" ? "Minimum" : court, groupe: "", largeur: 10 },
    { cle: "q_exige", titre: "Q exigé", groupe: "", type: "nombre", decimales: 0, largeur: 8 },
    ...(campagne.type === "apres" ? [{ cle: "tau", titre: "Tau 1 (%)", groupe: "", type: "nombre", decimales: 2, largeur: 8 } as Colonne] : []),
  ], { titre: `Débit de chaque zone par nuit et résultat de la campagne (m³/h)` }));

  if (o.detail) {
    for (const n of nuits) {
      for (const z of zonesC) {
        const pz = ptsC.filter((p) => p.zone_id === z.id);
        const ms = pz.map((p) => valides.find((m) => m.point_id === p.id && m.nuit === n && m.mode === "releves"));
        if (!ms.some(Boolean)) continue;
        const heures = [...new Set(ms.flatMap((m) => m?.releves?.map((r) => r.h) ?? []))].sort();
        const lignes = heures.map((h) => {
          const valeurs = ms.map((m) => m?.releves?.find((r) => r.h === h)?.q ?? null);
          return [h, ...valeurs, valeurs.every((v) => v != null) ? valeurs.reduce((t, v) => t + Number(v), 0) : null];
        });
        sections.push({
          titre: `Relevés de la nuit du ${jourFr(n)}, zone ${z.numero} (m³/h)`,
          colonnes: [
            { titre: "Heure", type: "texte", decimales: lignes.map(() => 0), largeur: 7 },
            ...[...pz.map((p) => p.code), "Zone"].map((titre) => ({ titre, type: "nombre" as const, decimales: lignes.map(() => 2), largeur: 9 })),
          ],
          lignes: lignes.map((cellules) => ({ type: "donnees" as const, cellules })),
        });
      }
    }
  }

  const zoneTexte = campagne.zone_id ? `Zone : ${zonesC[0]?.numero} – ${zonesC[0]?.libelle}` : "Zones : toutes les zones du marché";
  return {
    nomFichier: `pv-debits-${campagne.type}-${campagne.date_debut}`,
    entete: construireEntete(ctx, `Procès-verbal de mesures de débit de nuit – ${TYPES_CAMPAGNE[campagne.type].libelle}`, [
      campagne.libelle ? `Campagne : ${campagne.libelle}` : "",
      campagne.date_debut === campagne.date_fin ? `Nuit du ${jourFr(campagne.date_debut)}, de 0 h à 6 h` : `Nuits du ${jourFr(campagne.date_debut)} au ${jourFr(campagne.date_fin)}, de 0 h à 6 h`,
      zoneTexte,
      mesures.some((m) => !m.validee_le) ? "Mesures non encore validées : non reprises dans ce procès-verbal" : "",
      campagne.observation ? `Observation : ${campagne.observation}` : "",
    ].filter(Boolean)),
    sections,
    visas: [`Pour l'entreprise (${nom(ctx, "titulaire_nom", "STEPAG")})`, `Pour le maître d'ouvrage (${nom(ctx, "client_sigle", nom(ctx, "client", "SRM"))})`],
    pied: PIED,
    filigrane: null,
    orientation: o.orientation,
    genereLe: new Date(),
  };
}

/** Export Excel ou PDF de la synthèse : performances par zone, résultats des campagnes, débits des zones par nuit. */
export function documentSynthese(
  ctx: Contexte, resultats: ResultatDebits[], camps: CampagneZone[], nuits: NuitZone[], montants: boolean,
): DocumentExport {
  const oui = (b: boolean | null) => (b ? "Oui" : "");
  const r: Colonne<ResultatDebits & Ligne>[] = [
    { cle: "zone", titre: "Zone", groupe: "", largeur: 22, valeur: (x) => (x.niveau === "marche" ? "Marché" : `Zone ${x.zone_numero} – ${x.zone_libelle}`) },
    { cle: "q_exige_m3h", titre: "Q exigé", groupe: "", type: "nombre", decimales: 0, largeur: 8 },
    { cle: "qi_m3h", titre: "Qi", groupe: "", type: "nombre", decimales: 2, largeur: 8 },
    { cle: "qf_m3h", titre: "Qf", groupe: "", type: "nombre", decimales: 2, largeur: 8 },
    { cle: "delta_q_m3h", titre: "ΔQ", groupe: "", type: "nombre", decimales: 2, largeur: 8 },
    { cle: "tau1_pct", titre: "Tau 1 (%)", groupe: "", type: "nombre", decimales: 2, largeur: 8 },
    { cle: "points_balayage", titre: "Points balayage", groupe: "", type: "nombre", decimales: 2, largeur: 8 },
    ...(montants ? [{ cle: "penalite_balayage", titre: "Pénalité balayage", groupe: "", type: "montant", largeur: 10 } as Colonne<ResultatDebits & Ligne>] : []),
    { cle: "alerte_arret", titre: "Arrêt de zone", groupe: "", largeur: 7, valeur: (x) => oui(x.alerte_arret) },
    { cle: "nb_controles", titre: "Contrôles", groupe: "", type: "nombre", decimales: 0, largeur: 7 },
    { cle: "q_maintien_moyen_m3h", titre: "Moyenne maintien", groupe: "", type: "nombre", decimales: 2, largeur: 9 },
    { cle: "tau2_pct", titre: "Tau 2 (%)", groupe: "", type: "nombre", decimales: 2, largeur: 8 },
    { cle: "points_maintien", titre: "Points maintien", groupe: "", type: "nombre", decimales: 2, largeur: 8 },
    ...(montants ? [{ cle: "penalite_maintien", titre: "Pénalité maintien", groupe: "", type: "montant", largeur: 10 } as Colonne<ResultatDebits & Ligne>] : []),
    { cle: "degradation_pct", titre: "Dégradation (% du gain)", groupe: "", type: "nombre", decimales: 2, largeur: 9 },
  ];
  const c: Colonne<CampagneZone & Ligne>[] = [
    { cle: "type", titre: "Campagne", groupe: "", largeur: 18, valeur: (x) => TYPES_CAMPAGNE[x.type].libelle },
    { cle: "date_debut", titre: "Du", groupe: "", type: "date", largeur: 10 },
    { cle: "date_fin", titre: "Au", groupe: "", type: "date", largeur: 10 },
    { cle: "zone", titre: "Zone", groupe: "", largeur: 18, valeur: (x) => `Zone ${x.zone_numero} – ${x.zone_libelle}` },
    { cle: "nb_nuits_completes", titre: "Nuits complètes", groupe: "", type: "nombre", decimales: 0, largeur: 8 },
    { cle: "q_m3h", titre: "Résultat (m³/h)", groupe: "", type: "nombre", decimales: 2, largeur: 9 },
    { cle: "approchee", titre: "Approché", groupe: "", largeur: 7, valeur: (x) => oui(x.approchee) },
    { cle: "nb_a_valider", titre: "À valider", groupe: "", type: "nombre", decimales: 0, largeur: 7 },
  ];
  const n: Colonne<NuitZone & Ligne>[] = [
    { cle: "nuit", titre: "Nuit", groupe: "", type: "date", largeur: 10 },
    { cle: "campagne_type", titre: "Campagne", groupe: "", largeur: 16, valeur: (x) => TYPES_CAMPAGNE[x.campagne_type].libelle },
    { cle: "zone", titre: "Zone", groupe: "", largeur: 18, valeur: (x) => `Zone ${x.zone_numero} – ${x.zone_libelle}` },
    { cle: "q_zone_m3h", titre: "Débit (m³/h)", groupe: "", type: "nombre", decimales: 2, largeur: 9 },
    { cle: "approchee", titre: "Approché", groupe: "", largeur: 7, valeur: (x) => oui(x.approchee) },
    { cle: "complete", titre: "Complète", groupe: "", largeur: 7, valeur: (x) => (x.complete ? "Oui" : "Non") },
    { cle: "nb_points_mesures", titre: "Points mesurés", groupe: "", type: "nombre", decimales: 0, largeur: 7 },
    { cle: "nb_points", titre: "Points attendus", groupe: "", type: "nombre", decimales: 0, largeur: 7 },
  ];
  const m = resultats.at(-1);
  return {
    nomFichier: `debits-de-nuit-${String(ctx.marche.code ?? "")}`,
    entete: construireEntete(ctx, "Débits de nuit et performances", [
      m ? `Assiette des pénalités : ${m.assiette === "zone" ? "par zone" : "marché entier"} ; points ${m.mode_points}` : "",
      montants ? "Montants au prix du bordereau, hors majoration" : "",
    ].filter(Boolean)),
    sections: [
      construireSection(resultats as (ResultatDebits & Ligne)[], r, { titre: "Performances par zone (CPS art. II-23)" }),
      construireSection(camps as (CampagneZone & Ligne)[], c, { titre: "Résultat des campagnes par zone" }),
      construireSection(nuits as (NuitZone & Ligne)[], n, { titre: "Débit des zones par nuit (mesures validées)" }),
    ],
    pied: PIED,
    orientation: "paysage",
    genereLe: new Date(),
  };
}
