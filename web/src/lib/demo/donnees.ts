// Jeu de données fictif du mode démonstration (NEXT_PUBLIC_MODE_DEMO=1) : marché, fuites, lots, bordereau…
// Généré de façon déterministe (même graine → mêmes chiffres) autour d'Oujda, daté par rapport à aujourd'hui.
import type { Droit, Marche, Profil, Secteur, StatutFuite, VFuite } from "@/lib/types";

type Ligne = Record<string, unknown>;

function alea(graine: number) {
  let s = graine >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const r = alea(20261006);
const choix = <T,>(liste: T[]): T => liste[Math.floor(r() * liste.length)];
const entre = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const id = (type: string, n: number) => `${type.repeat(8)}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const H = 3_600_000;
const maintenant = new Date();
const il_y_a = (heures: number) => new Date(maintenant.getTime() - heures * H).toISOString();
const jour = (iso: string) => iso.slice(0, 10);

export const ADMIN_ID = id("d", 1);
export const EMAIL_DEMO = "issam@agents.stepag.ma";

export const profils: Profil[] = [
  { id: ADMIN_ID, identifiant: "issam", nom_complet: "Issam Bousalam", telephone: "0661 00 00 01", langue: "fr", est_admin: true, actif: true },
  { id: id("d", 2), identifiant: "karim", nom_complet: "Karim El Amrani", telephone: "0661 00 00 02", langue: "fr_ar", est_admin: false, actif: true },
  { id: id("d", 3), identifiant: "youssef", nom_complet: "Youssef Benali", telephone: "0661 00 00 03", langue: "ar", est_admin: false, actif: true },
  { id: id("d", 4), identifiant: "nadia", nom_complet: "Nadia Rahmouni", telephone: null, langue: "fr", est_admin: false, actif: true },
  { id: id("d", 5), identifiant: "hamid", nom_complet: "Hamid Zerouali", telephone: "0661 00 00 05", langue: "fr_ar", est_admin: false, actif: false },
];

export const MARCHE_SRM = id("c", 1);
export const MARCHE_DEMO = id("c", 2);
export const marches: (Marche & Ligne)[] = [
  {
    id: MARCHE_SRM, code: "SRM-4500004453", numero: "4500004453", intitule: "Détection et réparation des fuites sur le réseau d'eau potable d'Oujda",
    client: "SRM Oriental", ville: "Oujda", actif: true, taux_majoration: 15, taux_tva: 20, rayon_redetection_m: 25,
    client_sigle: "SRM", libelle_reference: "Référence SRM (tournée)", masque_reference: "999-999-999", jalons_client: true,
    delai_alerte_reparation_h: 48, devise: "DH", logo_titulaire: null, logo_maitre_ouvrage: null,
    titulaire: "STEPAG SARL", maitre_ouvrage: "Société Régionale Multiservices de l'Oriental", date_commencement: jour(il_y_a(24 * 120)),
    duree_mois: 12, montant_ht: 1_850_000, os_commencement_id: id("e", 91), telephone_titulaire: "05 36 00 00 00", email_titulaire: "contact@stepag.ma",
    // Contrôle de la base suspendu pendant la transition (PR #65) : le panneau exige quand même le jeu F1.
    champs_obligatoires_fuite: [],
  },
  {
    id: MARCHE_DEMO, code: "DEMO", numero: "DEMO-2026", intitule: "Marché de démonstration (données fictives)", client: "Client fictif", ville: "Oujda",
    actif: true, taux_majoration: 0, taux_tva: 20, rayon_redetection_m: 25, client_sigle: "DEMO", libelle_reference: "Référence client",
    masque_reference: null, jalons_client: false, delai_alerte_reparation_h: 48, devise: "DH", logo_titulaire: null, logo_maitre_ouvrage: null,
    titulaire: "STEPAG SARL", maitre_ouvrage: "Client fictif", date_commencement: jour(il_y_a(24 * 400)), duree_mois: 6, montant_ht: 250_000,
    champs_obligatoires_fuite: ["reference_srm", "secteur_id", "ouvrage", "visibilite", "nature_degradation_id"],
  },
];

export const affectations: Ligne[] = [
  { id: id("a", 101), profil_id: id("d", 2), marche_id: MARCHE_SRM, roles: ["detection"], actif: true },
  { id: id("a", 102), profil_id: id("d", 3), marche_id: MARCHE_SRM, roles: ["chef_reparation"], actif: true },
  { id: id("a", 103), profil_id: id("d", 4), marche_id: MARCHE_SRM, roles: ["responsable"], actif: true },
  { id: id("a", 104), profil_id: id("d", 5), marche_id: MARCHE_SRM, roles: ["detection"], actif: false },
  { id: id("a", 105), profil_id: id("d", 2), marche_id: MARCHE_DEMO, roles: ["detection", "chef_reparation"], actif: true },
  { id: id("a", 106), profil_id: id("d", 4), marche_id: MARCHE_DEMO, roles: ["responsable"], actif: true },
];

const TYPES_DONNEE = ["fuites", "interventions", "refections", "photos", "quantites", "parametres", "ouvriers", "journal", "exports", "balayage", "mesures_debit", "attachements", "evenements"] as const;
export const droits: Droit[] = [MARCHE_SRM, MARCHE_DEMO].flatMap((m) => TYPES_DONNEE.map((t) => ({
  marche_id: m, type_donnee: t, lire: true, creer: true, modifier: "toutes" as const, supprimer: "toutes" as const, valider: true,
})));

const NOMS_ZONES = ["Centre", "Nord", "Sud", "Est", "Ouest"];
export const zones: Ligne[] = NOMS_ZONES.map((libelle, i) => ({
  id: id("b", i + 1), marche_id: MARCHE_SRM, numero: i + 1, code: `Z${i + 1}`, libelle: `Zone ${i + 1} – ${libelle}`, actif: true, geom: null,
}));
const NOMS_SECTEURS = ["Andalous", "Qods Bas", "Qods Haut", "Lazaret", "Hay Al Fath", "Sidi Yahya", "Al Massira", "Bni Drar", "Hay Al Qods", "Isly", "Ennasr", "Riad"];
export const secteurs: (Secteur & Ligne)[] = NOMS_SECTEURS.map((libelle, i) => ({
  id: id("a", i + 1), marche_id: MARCHE_SRM, zone_id: id("b", (i % 5) + 1), code: `S${String(i + 1).padStart(2, "0")}`, libelle, actif: true, ordre: i + 1,
  lineaire_m: entre(3000, 14000), geom: null,
}));
export const secteursDemo: (Secteur & Ligne)[] = ["Quartier A", "Quartier B", "Quartier C"].map((libelle, i) => ({
  id: id("a", 50 + i), marche_id: MARCHE_DEMO, zone_id: id("b", 50), code: `Q${i + 1}`, libelle, actif: true, ordre: i + 1, lineaire_m: 5000, geom: null,
}));
zones.push({ id: id("b", 50), marche_id: MARCHE_DEMO, numero: 1, code: "Z1", libelle: "Zone unique", actif: true, geom: null });

const RUES = ["Bd Mohammed V", "Rue de Marrakech", "Av. Hassan II", "Rue Ibn Sina", "Bd Allal Al Fassi", "Rue Al Massira", "Av. Mohammed VI", "Rue Tafilalet",
  "Bd Derfoufi", "Rue Oued Ziz", "Rue de Taza", "Av. Idriss Al Akbar", "Rue Al Qods", "Bd Zerktouni", "Rue Oujda-Angad", "Av. des FAR"];
const OUVRAGES = ["branchement", "branchement", "conduite", "vanne", "compteur", "piece_speciale", "bouche_incendie"];
const EMPLACEMENTS = ["trottoir", "chaussee", "chaussee", "terrain_naturel"];
const AGENTS = ["Karim El Amrani", "Hamid Zerouali", "Karim El Amrani"];

interface Plan { statut: StatutFuite; n: number }
const PLAN_SRM: Plan[] = [
  { statut: "detectee", n: 9 }, { statut: "en_reparation", n: 5 }, { statut: "reparee", n: 10 }, { statut: "achevee", n: 24 }, { statut: "sans_reparation", n: 4 },
];
const PLAN_DEMO: Plan[] = [{ statut: "detectee", n: 3 }, { statut: "en_reparation", n: 1 }, { statut: "reparee", n: 3 }, { statut: "achevee", n: 6 }];

function fabriquerFuites(marcheId: string, plan: Plan[], secteursDu: (Secteur & Ligne)[], sigle: string, masque: boolean, depart: number): VFuite[] {
  const liste: VFuite[] = [];
  let numero = 0;
  for (const p of plan) {
    for (let k = 0; k < p.n; k++) {
      numero++;
      const secteur = choix(secteursDu);
      const zone = zones.find((z) => z.id === secteur.zone_id);
      // Les fuites ouvertes sont récentes ; les achevées s'étalent sur trois mois.
      const age = p.statut === "detectee" ? entre(2, 120) : p.statut === "en_reparation" ? entre(20, 90) : p.statut === "reparee" ? entre(60, 500) : entre(150, 2100);
      const detection = il_y_a(age);
      const delaiRep = entre(6, 70);
      const reparee = p.statut === "reparee" || p.statut === "achevee" || (p.statut === "en_reparation" && r() < 0.4);
      const reparation = reparee ? new Date(new Date(detection).getTime() + Math.min(delaiRep, Math.max(1, age - 1)) * H).toISOString() : null;
      const refection = p.statut === "achevee" && reparation ? new Date(new Date(reparation).getTime() + entre(24, 240) * H).toISOString() : null;
      const emplacement = choix(EMPLACEMENTS);
      const nbPhotos = r() < 0.15 ? 0 : entre(1, 4);
      const enAttente = p.statut === "detectee" || p.statut === "en_reparation";
      const depuisRep = reparation ? (maintenant.getTime() - new Date(reparation).getTime()) / H : 0;
      const sansRep = p.statut === "sans_reparation";
      const verrou = p.statut === "achevee" && r() < 0.5 ? il_y_a(Math.max(1, age - entre(200, 400))) : null;
      liste.push({
        id: id("f", depart + numero), marche_id: marcheId, numero,
        reference_srm: r() < 0.75 ? (masque ? `302-${String(entre(600, 699))}-${String(entre(1, 999)).padStart(3, "0")}` : `REF-${1000 + numero}`) : null,
        origine: r() < 0.12 ? "srm" : "stepag", visibilite: r() < 0.6 ? "visible" : "invisible", ouvrage: choix(OUVRAGES), statut: p.statut,
        zone: zone?.libelle as string ?? null, secteur_id: secteur.id, secteur: secteur.libelle,
        adresse: `${entre(2, 180)} ${choix(RUES)}`, latitude: 34.6814 + (r() - 0.5) * 0.06, longitude: -1.9086 + (r() - 0.5) * 0.08,
        date_detection: detection, detectee_par: choix(AGENTS), source_saisie: r() < 0.8 ? "tablette" : "web",
        date_communication_srm: r() < 0.7 ? il_y_a(Math.max(1, age - 2)) : null, validation_srm_le: p.statut === "achevee" && r() < 0.6 ? refection : null,
        validation_srm_par: p.statut === "achevee" && r() < 0.6 ? "M. Tahiri" : null, avis_terrassement_srm_le: reparee && r() < 0.6 ? il_y_a(Math.max(1, age - 4)) : null,
        derniere_reparation_le: reparation, derniere_refection_le: refection, emplacement_fouille: reparee ? emplacement : null, nb_photos: nbPhotos,
        motif_sans_reparation: sansRep ? choix(["Sondage négatif", "Fuite privée après compteur", "Refus du riverain"]) : null,
        verrouillee_le: verrou, observation: r() < 0.3 ? choix(["Fuite visible en surface, forte pression.", "Suintement au niveau du collier.", "Signalée par un riverain, eau sur la chaussée.", "Bruit de fuite au corrélateur, rien en surface."]) : null,
        alerte_non_reparee: enAttente && age > 48, alerte_communication_srm: enAttente && r() < 0.25,
        alerte_refection_chaussee: p.statut === "reparee" && emplacement === "chaussee", refection_chaussee_hors_delai: p.statut === "reparee" && emplacement === "chaussee" && depuisRep > 24 * 7,
        alerte_refection_trottoir: p.statut === "reparee" && emplacement === "trottoir" && depuisRep > 24 * 10, alerte_sans_photo: nbPhotos === 0,
        ...({ sigle } as object),
      });
    }
  }
  return liste;
}

export const vFuites: VFuite[] = [
  ...fabriquerFuites(MARCHE_SRM, PLAN_SRM, secteurs, "SRM", true, 0),
  ...fabriquerFuites(MARCHE_DEMO, PLAN_DEMO, secteursDemo, "DEMO", false, 500),
];

// Bordereau des prix (SRM)
const BORDEREAU: [string, string, string, number, number, string][] = [
  ["1", "Balayage du réseau à la recherche de fuites (écoute, corrélation)", "ml", 180000, 1.2, "balayage"],
  ["2", "Détection et localisation d'une fuite, pointage GPS et photo", "u", 1200, 150, "detection"],
  ["3", "Fouille en terrain de toute nature, y compris blindage et évacuation", "m3", 2400, 180, "terrassement"],
  ["4", "Réparation d'un branchement, toutes pièces comprises", "u", 700, 650, "reparation"],
  ["5", "Réparation d'une conduite DN ≤ 110", "u", 300, 1100, "reparation"],
  ["6", "Réparation d'une conduite DN > 110", "u", 120, 1900, "reparation"],
  ["7", "Fourniture et pose de tuyau PE DE 32 à 63", "ml", 1500, 85, "pose"],
  ["8", "Remplacement de robinet ou collier de prise en charge", "u", 500, 420, "pieces"],
  ["9", "Mise à niveau de bouche à clé", "u", 400, 160, "pieces"],
  ["10", "Remblai en tout-venant compacté", "m3", 2000, 95, "terrassement"],
  ["11", "Réfection de chaussée en enrobé à chaud", "m2", 1800, 320, "refection"],
  ["12", "Réfection de trottoir (carrelage ou béton)", "m2", 1500, 210, "refection"],
  ["13", "Mesure de débit nocturne (campagne de 3 nuits)", "u", 60, 2500, "mesure"],
];
export const prix: Ligne[] = BORDEREAU.map(([numero, designation, unite, qm, pu, famille], i) => ({
  id: id("9", i + 1), marche_id: MARCHE_SRM, numero, ordre: i + 1, designation, unite, quantite_marche: qm, pu_ht: pu, famille,
  hors_bordereau: false, actif: true, version: 1, avenant_id: null, motif: null,
}));

export const parametresAttachement: Ligne[] = [{
  marche_id: MARCHE_SRM, periodicite: "mensuelle", titre: "ATTACHEMENT N° {numero} des travaux exécutés au {date}", regroupement: "poste",
  fuites_admissibles: "toutes", refection_anticipee: true, verrouiller_a_l_arret: true, afficher_prix: true,
  mentions_obligatoires: ["ordre_service", "lieu_travaux"], visas: ["Le titulaire", "Le maître d'ouvrage"], decimales: { m3: 3, m2: 2, ml: 2, u: 0 }, texte_pied: null,
}];

export const ordresService: Ligne[] = [
  { id: id("e", 91), marche_id: MARCHE_SRM, numero: "01", date_os: jour(il_y_a(24 * 120)), nature: "commencement", objet: "Commencement des travaux" },
  { id: id("e", 92), marche_id: MARCHE_SRM, numero: "02", date_os: jour(il_y_a(24 * 45)), nature: "reprise", objet: "Reprise après arrêt" },
];

// Lots d'attachement : trois arrêtés (un par mois), un brouillon
const finMois = (decalage: number) => {
  const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - decalage + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const moisFr = (dateIso: string) => new Date(`${dateIso}T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
const libelleLot = (dateIso: string) => { const m = moisFr(dateIso); return `Attachement ${/^[aeiouyéh]/i.test(m) ? "d'" : "de "}${m}`; };
export const attachements: Ligne[] = [3, 2, 1].map((k, i) => ({
  id: id("e", i + 1), marche_id: MARCHE_SRM, numero: i + 1, statut: "arrete", intitule: libelleLot(finMois(k)), date_arret: finMois(k),
  periode_debut: null, periode_fin: null, zone_id: null, lieu_travaux: "Secteurs Andalous, Qods et Lazaret", os_id: id("e", 91), observation: null,
  arrete_le: `${finMois(k)}T17:30:00.000Z`, rouvert_le: null, motif_reouverture: null, accepte_le: i < 2 ? jour(il_y_a(24 * (30 * k - 5))) : null,
  accepte_par: i < 2 ? "M. Tahiri (SRM)" : null, reference_facture: i < 1 ? `F-2026-0${i + 1}` : null, facture_le: i < 1 ? jour(il_y_a(24 * 80)) : null,
  cree_le: `${finMois(k + 1)}T09:00:00.000Z`, supprime_le: null,
}));
attachements.push({
  id: id("e", 4), marche_id: MARCHE_SRM, numero: null, statut: "brouillon", intitule: libelleLot(finMois(0)), date_arret: finMois(0),
  periode_debut: null, periode_fin: null, zone_id: null, lieu_travaux: null, os_id: id("e", 91), observation: null, arrete_le: null, rouvert_le: null,
  motif_reouverture: null, accepte_le: null, accepte_par: null, reference_facture: null, facture_le: null, cree_le: il_y_a(24 * 3), supprime_le: null,
});

// Unités d'œuvre (fuite × article) des fuites réparées du marché SRM, réparties entre lots arrêtés, brouillon et reste à attacher
const prixPar = (numero: string) => prix.find((p) => p.numero === numero)!;
const quantitePour = (numero: string, f: VFuite): number => {
  switch (numero) {
    case "2": return 1;
    case "3": return Number((entre(8, 30) / 10).toFixed(3));
    case "4": return f.ouvrage === "branchement" ? 1 : 0;
    case "5": return f.ouvrage === "conduite" ? 1 : 0;
    case "7": return f.ouvrage === "branchement" && r() < 0.5 ? Number((entre(10, 60) / 10).toFixed(2)) : 0;
    case "10": return Number((entre(6, 25) / 10).toFixed(3));
    case "11": return f.emplacement_fouille === "chaussee" && f.derniere_refection_le ? Number((entre(10, 50) / 10).toFixed(2)) : 0;
    case "12": return f.emplacement_fouille === "trottoir" && f.derniere_refection_le ? Number((entre(10, 40) / 10).toFixed(2)) : 0;
    default: return 0;
  }
};
export const lignesAttachement: Ligne[] = [];
export const unitesAAttacher: Ligne[] = [];
let numLigne = 0;
const repareesSrm = vFuites.filter((f) => f.marche_id === MARCHE_SRM && f.derniere_reparation_le && f.statut !== "sans_reparation")
  .sort((a, b) => a.derniere_reparation_le!.localeCompare(b.derniere_reparation_le!));
repareesSrm.forEach((f, i) => {
  const dansLot = i < repareesSrm.length * 0.65 ? Math.min(3, Math.floor((i / (repareesSrm.length * 0.65)) * 3) + 1) : null;
  const enBrouillon = !dansLot && f.statut === "achevee" && r() < 0.5;
  for (const numero of ["2", "3", "4", "5", "7", "10", "11", "12"]) {
    const q = quantitePour(numero, f);
    if (!q) continue;
    const p = prixPar(numero);
    const base = {
      marche_id: MARCHE_SRM, fuite_id: f.id, fuite_numero: f.numero, reference_srm: f.reference_srm, adresse: f.adresse, statut: f.statut, verrouillee: !!f.verrouillee_le,
      zone_id: f.secteur_id ? secteurs.find((s) => s.id === f.secteur_id)?.zone_id ?? null : null, zone: f.zone, secteur_id: f.secteur_id, secteur: f.secteur,
      equipe_id: id("a", 201 + (f.numero % 3)), equipe: `Réparation ${(f.numero % 3) + 1}`, reparee_le: f.derniere_reparation_le, refectionnee_le: f.derniere_refection_le,
      prix_id: p.id, prix_numero: p.numero, prix_ordre: p.ordre, prix_designation: p.designation, unite: p.unite, famille: p.famille,
    };
    if (dansLot) {
      lignesAttachement.push({
        ...base, id: id("7", ++numLigne), attachement_id: id("e", dansLot), attachement_statut: "arrete", nature: "solde", pu_ht: p.pu_ht, quantite: q,
        fouille_longueur_m: 1.5, fouille_largeur_m: 0.8, fouille_profondeur_m: 1.1, volume_m3: 1.32, surface_refection_m2: numero === "11" || numero === "12" ? q : null,
        regularisation: false, regularisation_negative: false, lot_precedent: null, designation: null, motif: null, prix_refection_prevu: null,
      });
    } else {
      if (enBrouillon) {
        lignesAttachement.push({
          ...base, id: id("7", ++numLigne), attachement_id: id("e", 4), attachement_statut: "brouillon", nature: "solde", pu_ht: p.pu_ht, quantite: q,
          fouille_longueur_m: 1.5, fouille_largeur_m: 0.8, fouille_profondeur_m: 1.1, volume_m3: 1.32, surface_refection_m2: null,
          regularisation: false, regularisation_negative: false, lot_precedent: null, designation: null, motif: null, prix_refection_prevu: null,
        });
      }
      unitesAAttacher.push({
        ...base, quantite_executee: q, quantite_attachee: 0, quantite_anticipee: 0, en_attente_refection: f.statut === "reparee", reste: q, dernier_lot: null,
        brouillon_id: enBrouillon ? id("e", 4) : null,
      });
    }
  }
});

// Récapitulatif par article de chaque lot
export const recapAttachement: Ligne[] = attachements.flatMap((lot) => prix.map((p) => {
  const quantiteLot = lignesAttachement.filter((l) => l.attachement_id === lot.id && l.prix_id === p.id).reduce((s, l) => s + Number(l.quantite), 0);
  const anterieure = lignesAttachement.filter((l) => l.prix_id === p.id && l.attachement_statut === "arrete" && (attachements.find((a) => a.id === l.attachement_id)?.numero as number ?? 99) < ((lot.numero as number | null) ?? 99)).reduce((s, l) => s + Number(l.quantite), 0);
  const cumul = anterieure + quantiteLot;
  return {
    attachement_id: lot.id, prix_id: p.id, prix_numero: p.numero, prix_ordre: p.ordre, prix_designation: p.designation, unite: p.unite, hors_bordereau: false,
    quantite_marche: p.quantite_marche, pu_ht: p.pu_ht, quantite_anterieure: Number(anterieure.toFixed(3)), quantite_lot: Number(quantiteLot.toFixed(3)),
    quantite_cumulee: Number(cumul.toFixed(3)), pourcentage_marche: p.quantite_marche ? Number(((100 * cumul) / (p.quantite_marche as number)).toFixed(1)) : null,
  };
}));

// Réparations, réfections, quantités et photos des fuites
export const reparations: Ligne[] = [];
export const refections: Ligne[] = [];
export const vQuantites: Ligne[] = [];
export const photos: Ligne[] = [];
export const reparationPieces: Ligne[] = [];
export const reparationOuvriers: Ligne[] = [];
const TYPES_PHOTO = ["detection", "avant", "pendant", "apres"];
vFuites.forEach((f, i) => {
  for (let k = 0; k < f.nb_photos; k++) {
    photos.push({ id: id("5", i * 10 + k + 1), marche_id: f.marche_id, fuite_id: f.id, type: TYPES_PHOTO[Math.min(k, f.derniere_reparation_le ? 3 : 0)], chemin: `${f.marche_id}/${f.id}/${k}.jpg`,
      prise_le: new Date(new Date(f.date_detection).getTime() + k * 6 * H).toISOString(), stockage: "supabase", supprime_le: null, largeur_px: 1600, hauteur_px: 1200, taille_octets: 240000 });
  }
  if (f.derniere_reparation_le) {
    const rid = id("6", i + 1);
    const L = Number((entre(10, 25) / 10).toFixed(1)); const l = Number((entre(6, 12) / 10).toFixed(1)); const P = Number((entre(8, 14) / 10).toFixed(1));
    reparations.push({
      id: rid, marche_id: f.marche_id, fuite_id: f.id, resultat: f.statut === "en_reparation" ? "en_cours" : "reparee", realisee_le: f.derniere_reparation_le,
      ouvrage: f.ouvrage, materiau: choix(["polyethylene", "pvc", "fonte_ductile", "acier_galvanise"]), diametre_mm: choix([32, 40, 63, 110, 160]),
      tuyau_repare: true, robinet_pec_change: r() < 0.4, collier_pec_change: r() < 0.5, bouche_a_cle_mise_a_niveau: r() < 0.3, element_remplace: r() < 0.2,
      longueur_pe_m: r() < 0.4 ? Number((entre(10, 40) / 10).toFixed(1)) : null, fouille_longueur_m: L, fouille_largeur_m: l, fouille_profondeur_m: P,
      volume_m3: Number((L * l * P).toFixed(3)), emplacement: f.emplacement_fouille, observation: null, source_saisie: "tablette", auteur_terrain_id: id("d", 3),
      equipe_id: id("a", 201 + (f.numero % 3)), motif_id: null, representant_srm: r() < 0.5 ? "M. Tahiri" : null, nature_revetement_id: f.emplacement_fouille === "chaussee" ? id("3", 1) : id("3", 2), supprime_le: null,
    });
    reparationPieces.push({
      id: id("6", reparationPieces.length + 1), marche_id: MARCHE_SRM, reparation_id: rid, produit_id: 9100 + entre(1, 8), designation_libre: null,
      quantite: 1, provenance: "terrain", nature_correction: null, remplace_piece_id: null, motif_correction: null, etat: "posee", etat_le: null,
      motif_retrait: null, cree_le: new Date().toISOString(), supprime_le: null,
    });
    reparationOuvriers.push({ reparation_id: rid, ouvrier_id: id("8", entre(1, 6)) }, { reparation_id: rid, ouvrier_id: id("8", entre(1, 6)) });
    const lignesQ: [string, number][] = [["2", 1], ["3", Number((L * l * P).toFixed(3))], [f.ouvrage === "conduite" ? "5" : "4", 1], ["10", Number((L * l * P * 0.9).toFixed(3))]];
    if (f.derniere_refection_le) lignesQ.push([f.emplacement_fouille === "chaussee" ? "11" : "12", Number((L * l).toFixed(2))]);
    lignesQ.forEach(([numero, q], j) => {
      const p = prixPar(numero);
      vQuantites.push({ id: id("2", i * 10 + j + 1), fuite_id: f.id, marche_id: f.marche_id, prix_numero: p.numero, prix_ordre: p.ordre, prix_designation: p.designation, unite: p.unite,
        quantite: q, pu_ht: p.pu_ht, montant_ht_bordereau: Number((q * (p.pu_ht as number)).toFixed(2)), origine_ligne: "auto" });
    });
  }
  if (f.derniere_refection_le) {
    refections.push({ id: id("1", i + 1), marche_id: f.marche_id, fuite_id: f.id, resultat: "faite", realisee_le: f.derniere_refection_le, longueur_m: 1.8, largeur_m: 0.9, surface_m2: 1.62,
      nature_id: f.emplacement_fouille === "chaussee" ? id("3", 1) : id("3", 2), motif_id: null, observation: null, supprime_le: null });
  }
});

export const naturesRefection: Ligne[] = [
  { id: id("3", 1), marche_id: MARCHE_SRM, code: "chaussee_enrobe", libelle_fr: "Chaussée en enrobé", libelle_ar: "طريق مزفت", symbole: "CH", emplacement: "chaussee", prix_id: id("9", 11), necessite_refection: true, actif: true, ordre: 1 },
  { id: id("3", 2), marche_id: MARCHE_SRM, code: "trottoir_carrele", libelle_fr: "Trottoir carrelé", libelle_ar: "رصيف مبلط", symbole: "TC", emplacement: "trottoir", prix_id: id("9", 12), necessite_refection: true, actif: true, ordre: 2 },
  { id: id("3", 3), marche_id: MARCHE_SRM, code: "trottoir_beton", libelle_fr: "Trottoir en béton", libelle_ar: "رصيف خرساني", symbole: "TB", emplacement: "trottoir", prix_id: id("9", 12), necessite_refection: true, actif: true, ordre: 3 },
  { id: id("3", 5), marche_id: MARCHE_SRM, code: "carrelage", libelle_fr: "Carrelage", libelle_ar: "بلاط", symbole: "CR", emplacement: "trottoir", prix_id: id("9", 12), necessite_refection: true, actif: true, ordre: 5 },
  { id: id("3", 6), marche_id: MARCHE_SRM, code: "faience", libelle_fr: "Faïence", libelle_ar: "زليج", symbole: "F", emplacement: "trottoir", prix_id: id("9", 12), necessite_refection: true, actif: true, ordre: 6 },
  { id: id("3", 7), marche_id: MARCHE_SRM, code: "pave_ciment", libelle_fr: "Pavé ciment", libelle_ar: "حجر الرصف الإسمنتي", symbole: "PV", emplacement: "trottoir", prix_id: id("9", 12), necessite_refection: true, actif: true, ordre: 7 },
  { id: id("3", 4), marche_id: MARCHE_SRM, code: "terrain_naturel", libelle_fr: "Terrain naturel (sans réfection)", libelle_ar: "أرض طبيعية", symbole: "TN", emplacement: "terrain_naturel", prix_id: null, necessite_refection: false, actif: true, ordre: 4 },
];
export const motifs: Ligne[] = [
  { id: id("0", 1), marche_id: MARCHE_SRM, categorie: "sans_reparation", code: "sondage_negatif", libelle_fr: "Sondage négatif", libelle_ar: "سبر سلبي", terrassement_paye: true, actif: true, ordre: 1 },
  { id: id("0", 2), marche_id: MARCHE_SRM, categorie: "sans_reparation", code: "fuite_privee", libelle_fr: "Fuite privée après compteur", libelle_ar: "تسرب خاص بعد العداد", terrassement_paye: false, actif: true, ordre: 2 },
  { id: id("0", 3), marche_id: MARCHE_SRM, categorie: "sans_reparation", code: "refus_riverain", libelle_fr: "Refus du riverain", libelle_ar: null, terrassement_paye: false, actif: true, ordre: 3 },
  { id: id("0", 4), marche_id: MARCHE_SRM, categorie: "sans_refection", code: "terrain_naturel", libelle_fr: "Terrain naturel, pas de revêtement", libelle_ar: null, terrassement_paye: false, actif: true, ordre: 1 },
  { id: id("0", 5), marche_id: MARCHE_SRM, categorie: "sans_refection", code: "refection_par_tiers", libelle_fr: "Réfection faite par un tiers", libelle_ar: null, terrassement_paye: false, actif: true, ordre: 2 },
];
// Articles Dolibarr (lot T) : référentiel unique des pièces, commun à tous les marchés ; les activés sont proposés.
export const produitsDolibarr: Ligne[] = [
  ["ROB", "Collier de prise en charge DN 63"], ["ROB", "Robinet de prise en charge 3/4\""], ["RAC", "Manchon PE DE 32"], ["RAC", "Manchon PE DE 63"],
  ["RAC", "Raccord laiton 20/27"], ["VRI", "Bouche à clé fonte"], ["ROB", "Vanne à opercule DN 80"], ["RAC", "Joint Gibault DN 100"], ["RAC", "Té PE DE 63"],
  ["RAC", "Coude PE 90° DE 32"], ["AEP", "Compteur 15 mm"], ["CND", "Tube PE DE 32"], ["CND", "Tube PE DE 63"], ["RAC", "Bride DN 100"], ["VRI", "Tabernacle"],
].map(([famille, designation], i) => ({
  dolibarr_id: 9101 + i, ref: `${famille}${String(1000 + i)}`, designation, unite: famille === "CND" ? "m" : "U", famille,
  actif: i !== 14, utilisable: i < 11, utilisable_le: null, utilisable_par: null, cree_le: "2026-10-05T08:00:00Z", importe_le: "2026-10-05T08:00:00Z",
  modifie_le: "2026-10-05T08:00:00Z",
}));
export const importsDolibarr: Ligne[] = [{
  id: id("5", 1), importe_le: "2026-10-05T08:00:00Z", importe_par: null, familles: ["RAC", "CND", "ROB", "AEP", "VRI"], produits_lus: 15,
  nouveaux: 15, modifies: 0, designations_modifiees: 0, desactives: 1,
}];
export const equipes: Ligne[] = [
  { id: id("a", 201), marche_id: MARCHE_SRM, type: "reparation", numero: 1, libelle: "Réparation 1", actif: true },
  { id: id("a", 202), marche_id: MARCHE_SRM, type: "reparation", numero: 2, libelle: "Réparation 2", actif: true },
  { id: id("a", 203), marche_id: MARCHE_SRM, type: "reparation", numero: 3, libelle: "Réparation 3", actif: false },
  { id: id("a", 204), marche_id: MARCHE_SRM, type: "detection", numero: 1, libelle: "Détection 1", actif: true },
];
export const ouvriers: Ligne[] = ["Rachid Bouzid", "Mustapha Lahlou", "Abdelkader Ziani", "Said Mimouni", "Omar Belkacem", "Brahim Taleb"].map((nom, i) => ({
  id: id("8", i + 1), marche_id: MARCHE_SRM, nom_complet: nom, telephone: i % 2 ? `0662 00 00 ${String(i).padStart(2, "0")}` : null, actif: i !== 5,
}));
export const vAnomalies: Ligne[] = vFuites.filter((f) => f.marche_id === MARCHE_SRM && f.statut === "achevee").slice(0, 3).map((f, i) => ({
  marche_id: MARCHE_SRM, fuite_id: f.id, reparation_id: null, anomalie: ["fouille_superieure_2m", "reference_srm_format", "prix_hors_bordereau"][i],
}));

// ---- Chantier v2 (S1, S2) : validation par étape, auteurs, nouveaux champs, référentiels de la saisie ----
const KARIM = id("d", 2);
const YOUSSEF = id("d", 3);
const NADIA = id("d", 4);
const MATERIAUX_DEMO = ["polyethylene", "pvc", "amiante_ciment", "fonte_ductile"];
vFuites.forEach((f, i) => {
  const ancienne = f.statut === "achevee" || f.statut === "sans_reparation" || (f.statut === "reparee" && i % 3 === 0);
  // Quelques fuites saisies au bureau après coup (saisie différée)
  const differee = f.source_saisie === "web" && i % 2 === 0;
  const cree = differee ? new Date(new Date(f.date_detection).getTime() + 30 * H).toISOString() : f.date_detection;
  const materiau = MATERIAUX_DEMO[i % MATERIAUX_DEMO.length];
  Object.assign(f, {
    validee_le: ancienne ? new Date(new Date(cree).getTime() + 5 * H).toISOString() : null, validee_par: ancienne ? NADIA : null,
    auteur_terrain_id: KARIM, saisi_par: differee ? NADIA : KARIM, cree_le: cree, saisie_differee: differee,
    motif_correction: null, corrigee_par: null, corrigee_le: null,
    nature_degradation_id: f.marche_id === MARCHE_SRM && i % 4 !== 3 ? (i % 2 ? id("3", 1) : id("3", 2)) : null,
    materiau: i % 3 ? materiau : null, diametre_mm: i % 3 ? [32, 63, 110, 160][i % 4] : null, troncon_id: null, precision_gps_m: 6 + (i % 9),
  });
});
reparations.forEach((r, i) => {
  const f = vFuites.find((x) => x.id === r.fuite_id)!;
  const validee = f.statut === "achevee" || (f.statut === "reparee" && i % 2 === 0);
  Object.assign(r, {
    validee_le: validee ? new Date(new Date(r.realisee_le as string).getTime() + 8 * H).toISOString() : null, validee_par: validee ? NADIA : null,
    saisi_par: YOUSSEF, cree_le: r.realisee_le, representant_srm_id: null,
  });
});
refections.forEach((r, i) => {
  Object.assign(r, {
    validee_le: i % 4 ? new Date(new Date(r.realisee_le as string).getTime() + 6 * H).toISOString() : null, validee_par: i % 4 ? NADIA : null,
    auteur_terrain_id: YOUSSEF, saisi_par: YOUSSEF, cree_le: r.realisee_le, source_saisie: "tablette",
    reparation_id: reparations.find((x) => x.fuite_id === r.fuite_id)?.id ?? null,
  });
});
photos.forEach((p) => {
  const rep = p.type === "apres" || p.type === "pendant" ? reparations.find((x) => x.fuite_id === p.fuite_id) : null;
  Object.assign(p, { reparation_id: rep?.id ?? null, refection_id: null, auteur_terrain_id: rep ? YOUSSEF : KARIM, saisi_par: rep ? YOUSSEF : KARIM, cree_le: p.prise_le });
});

const STANDARD: [string, number[]][] = [
  ["polyethylene", [20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 160, 200]], ["pvc", [63, 75, 90, 110, 125, 160, 200, 250, 315]],
  ["amiante_ciment", [60, 80, 100, 125, 150, 200, 250, 300, 350, 400]], ["fonte_ductile", [60, 80, 100, 125, 150, 200, 250, 300, 400, 500, 600]],
  ["fonte_grise", [60, 80, 100, 125, 150, 200, 250, 300, 400, 500, 600]], ["acier_galvanise", [15, 20, 26, 33, 40, 50]], ["ppr", [20, 25, 32, 40, 50, 63]],
];
export const diametresMateriau: Ligne[] = [MARCHE_SRM, MARCHE_DEMO].flatMap((m, k) => STANDARD.flatMap(([materiau, liste], j) => liste.map((d, n) => ({
  id: id("4", k * 1000 + j * 50 + n + 1), marche_id: m, materiau, diametre_mm: d, source: "standard", actif: true,
}))));
diametresMateriau.push({ id: id("4", 999), marche_id: MARCHE_SRM, materiau: "amiante_ciment", diametre_mm: 175, source: "reseau", actif: true });
export const representantsSrm: Ligne[] = [
  { id: id("4", 2001), marche_id: MARCHE_SRM, nom: "Abdelkhalek", ordre: 1, actif: true },
  { id: id("4", 2002), marche_id: MARCHE_SRM, nom: "M. Tahiri", ordre: 2, actif: true },
  { id: id("4", 2003), marche_id: MARCHE_DEMO, nom: "Abdelkhalek", ordre: 1, actif: true },
];

/** Tables et vues servies par le client de démonstration. */
export const TABLES: Record<string, Ligne[]> = {
  profils: profils as unknown as Ligne[], marches, affectations, droits: droits as unknown as Ligne[], zones, secteurs: [...secteurs, ...secteursDemo] as unknown as Ligne[],
  v_fuites: vFuites as unknown as Ligne[], fuites: vFuites as unknown as Ligne[], prix, parametres_attachement: parametresAttachement, ordres_service: ordresService,
  attachements, v_attachement_lignes: lignesAttachement, attachement_lignes: lignesAttachement, v_a_attacher: unitesAAttacher, v_attachement_recap: recapAttachement,
  reparations, refections, v_quantites: vQuantites, lignes_quantites: vQuantites, photos, reparation_pieces: reparationPieces, reparation_ouvriers: reparationOuvriers,
  natures_refection: naturesRefection, motifs, produits_dolibarr: produitsDolibarr, imports_dolibarr: importsDolibarr, suggestions_articles: [],
  equipes, ouvriers, v_anomalies: vAnomalies, v_controles_attachement: [], v_pieces_reelles: [], verrous_admin: [],
  modeles_export: [], evenements: [], categories_evenements: [], avenants: [], arrets: [], evenements_pieces: [],
  diametres_materiau: diametresMateriau, representants_srm: representantsSrm,
};
