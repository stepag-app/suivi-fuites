// Débits de nuit du mode démonstration (S15) : tableau n° 1 sur les zones fictives du marché SRM, deux points de
// mesure par zone, campagnes avant (relevés détaillés la première nuit), après balayage, contrôles de maintien,
// une mesure de terrain à valider. Les vues et debits_resultats sont recalculés par src/lib/debits.ts.
import { HEURES_NUIT } from "@/lib/debits";
import { MARCHE_SRM, marches, zones } from "./donnees";

type Ligne = Record<string, unknown>;

let s = 20261013;
const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const id = (n: number) => `bdbdbdbd-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const jourIlYA = (j: number) => new Date(Date.now() - j * 86_400_000).toISOString().slice(0, 10);
const AGENT = "dddddddd-0000-4000-8000-000000000002";
const ADMIN = "dddddddd-0000-4000-8000-000000000001";

// Tableau n° 1 (R-CPS-100, 102) et réglages par défaut
const TABLEAU: [number, number, number, number][] = [[358000, 126, 133, 158], [362000, 130, 136, 162], [228000, 118, 133, 148], [399000, 112, 99, 140], [119000, 83, 79, 104]];
const zonesSrm = zones.filter((z) => z.marche_id === MARCHE_SRM).sort((a, b) => Number(a.numero) - Number(b.numero));
zonesSrm.forEach((z, i) => {
  const [lin, qe, hist, act] = TABLEAU[i] ?? TABLEAU[0];
  Object.assign(z, { lineaire_m: lin, q_exige_m3h: qe, q_plus_bas_historique_m3h: hist, q_actuel_m3h: act, balayage_acheve_le: i < 3 ? jourIlYA(21) : null });
});
for (const m of marches) {
  Object.assign(m, { debits_mode_saisie: "minimum", debits_assiette: "zone", debits_points: "entiers", debits_plafond_pct: 25, debits_seuil_arret_pct: 25, debits_seuil_degradation_pct: 25 });
}

export const phasesDemo: Ligne[] = [
  ["balayage", "Balayage", 1, 120, 0], ["maintien_1", "Maintien des performances (40 %)", 2, -1, -121], ["maintien_2", "Maintien des performances (60 %)", 3, -122, -242],
].map(([code, libelle, ordre, debut, fin]) => ({
  id: id(900 + Number(ordre)), marche_id: MARCHE_SRM, code, libelle, ordre, date_debut: jourIlYA(Number(debut)), date_fin: jourIlYA(Number(fin)),
}));

export const pointsMesure: Ligne[] = zonesSrm.flatMap((z, i) => [0, 1].map((k) => ({
  id: id(10 + i * 2 + k), marche_id: MARCHE_SRM, zone_id: z.id, secteur_id: null, code: `PM${i + 1}${k ? "B" : "A"}`,
  libelle: `${k ? "Réservoir" : "Adduction"} zone ${i + 1}`, equipement: k ? "Débitmètre électromagnétique (télé-relève)" : "Compteur de secteur",
  observation: null, ordre: k, actif: true, cree_le: jourIlYA(118), modifie_le: jourIlYA(118),
})));

const camp = (n: number, type: string, debut: number, nuits: number, libelle: string | null = null, zone: unknown = null): Ligne => ({
  id: id(100 + n), marche_id: MARCHE_SRM, type, zone_id: zone, libelle, date_debut: jourIlYA(debut), date_fin: jourIlYA(debut - nuits + 1),
  mode_saisie: null, observation: null, pv_chemin: null, pv_signe_le: type === "avant" ? jourIlYA(debut - 4) : null,
  saisi_par: ADMIN, cree_le: new Date(Date.now() - debut * 86_400_000).toISOString(), supprime_le: null,
});
export const campagnesDebit: Ligne[] = [
  camp(1, "avant", 115, 3, "Mesures avant intervention"),
  camp(2, "libre", 60, 1, "Contrôle intermédiaire"),
  camp(3, "apres", 20, 3, "Mesures après balayage"),
  camp(4, "maintien", 11, 1),
  camp(5, "maintien", 4, 1),
];

// Facteurs par zone : Qi ≈ débit actuel ; Qf autour du Q exigé (zone 3 bien au-dessus : alerte d'arrêt) ; maintien.
const FQF = [0.97, 1.06, 1.31, 0.94, 1.1];
const FMAINTIEN = [[1.01, 1.03], [1.02, 1.0], [1.05, 1.09], [1.1, 1.18], [1.0, 0.99]];
export const mesuresNuit: Ligne[] = [];
let n = 0;
const ajouter = (c: Ligne, p: Ligne, nuit: string, q: number, detail: boolean, validee = true) => {
  const releves = detail ? HEURES_NUIT.map((h, i) => ({ h, q: Math.round((q * (1 + 0.35 * Math.abs(Math.cos(i / 3.2)) + 0.02 * r())) * 10) / 10 })) : null;
  const minimum = releves ? Math.min(...releves.map((x) => x.q)) : Math.round(q * 10) / 10;
  mesuresNuit.push({
    id: id(1000 + ++n), marche_id: MARCHE_SRM, campagne_id: c.id, point_id: p.id, nuit, releves, minimum_m3h: minimum, mode: releves ? "releves" : "minimum",
    origine: "saisie", piece_jointe: null, observation: null, auteur_terrain_id: validee ? ADMIN : AGENT, saisi_par: validee ? ADMIN : AGENT,
    source_saisie: validee ? "web" : "tablette", validee_le: validee ? `${nuit}T09:00:00Z` : null, validee_par: validee ? ADMIN : null,
    cree_le: `${nuit}T08:00:00Z`, modifie_le: `${nuit}T08:00:00Z`, supprime_le: null,
  });
};
zonesSrm.forEach((z, i) => {
  const [, qe, , act] = TABLEAU[i];
  const pts = pointsMesure.filter((p) => p.zone_id === z.id);
  const part = [0.62, 0.38];
  const [avant, libre, apres, m1, m2] = campagnesDebit;
  [0, 1, 2].forEach((k) => pts.forEach((p, j) => ajouter(avant, p, jourIlYA(115 - k), act * part[j] * (1 + 0.03 * k + 0.02 * r()), k === 0)));
  pts.forEach((p, j) => ajouter(libre, p, jourIlYA(60), ((act + qe * FQF[i]) / 2) * part[j], false));
  [0, 1, 2].forEach((k) => pts.forEach((p, j) => ajouter(apres, p, jourIlYA(20 - k), qe * FQF[i] * part[j] * (1 + 0.02 * k + 0.01 * r()), false)));
  pts.forEach((p, j) => ajouter(m1, p, jourIlYA(11), qe * FQF[i] * FMAINTIEN[i][0] * part[j], false));
  pts.forEach((p, j) => ajouter(m2, p, jourIlYA(4), qe * FQF[i] * FMAINTIEN[i][1] * part[j], false, !(i === 0 && j === 0)));
});
