import {
  Boxes, Briefcase, CheckCheck, CloudOff, CloudUpload, Droplets, FileText, Footprints, Gauge, LayoutDashboard, ListTodo, type LucideIcon, MapPinned, ReceiptText, Route,
  Settings2, Siren, Users,
} from "lucide-react";
import type { Action, Profil, TypeDonnee } from "@/lib/types";

export type NavBadge = "nouveau" | "bientôt";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export type Onglet = "marche" | "bordereau" | "attachement" | "evenements" | "ouvriers" | "motifs" | "secteurs" | "reseau"
  | "debits" | "natures" | "articles";

export const ONGLETS_PARAMETRES: [Onglet, string][] = [
  ["marche", "Marché"],
  ["bordereau", "Bordereau"],
  ["attachement", "Attachement"],
  ["evenements", "Événements"],
  ["ouvriers", "Ouvriers"],
  ["motifs", "Motifs"],
  ["secteurs", "Secteurs"],
  ["reseau", "Réseau"],
  ["debits", "Débits de nuit"],
  ["natures", "Natures de réfection"],
  ["articles", "Articles (tous marchés)"],
];

type Peut = (type: TypeDonnee, action: Action) => boolean;

/** Onglets des paramètres visibles selon les droits (Réseau et Articles : administrateur ou « paramètres / modifier »). */
export function ongletsParametresVisibles(peut: Peut, profil: Profil | null): [Onglet, string][] {
  const accesParametres = peut("parametres", "creer") || peut("parametres", "modifier");
  return ONGLETS_PARAMETRES.filter(([k]) =>
    k === "evenements" ? peut("evenements", "lire")
      : k === "ouvriers" ? peut("ouvriers", "creer") || peut("ouvriers", "modifier")
        : k === "bordereau" ? accesParametres || peut("quantites", "lire")
          : k === "reseau" || k === "articles" ? !!profil?.est_admin || peut("parametres", "modifier")
            : accesParametres,
  );
}

/** Menu latéral selon les droits du compte sur le marché ouvert ; verrous : ceux que l'administrateur s'est posés. */
export function elementsNav(peut: Peut, profil: Profil | null, verrous = 0): NavGroup[] {
  const admin = !!profil?.est_admin;
  const lireFuites = peut("fuites", "lire");
  const ongletsVisibles = ongletsParametresVisibles(peut, profil);

  const suivi: NavMainItem[] = [
    ...(lireFuites ? [{ id: "tableau-de-bord", title: "Tableau de bord", url: "/tableau-de-bord", icon: LayoutDashboard }] : []),
    { id: "fuites", title: "Fuites", url: "/fuites", icon: Droplets },
    // Validation par étape (chantier v2, V1) : responsable et administrateur
    ...(peut("fuites", "valider") || peut("interventions", "valider") || peut("refections", "valider")
      ? [{ id: "a-valider", title: "À valider", url: "/a-valider", icon: CheckCheck }] : []),
    ...(lireFuites ? [
      { id: "carte", title: "Carte", url: "/carte", icon: MapPinned },
      ...(peut("balayage", "lire") ? [{ id: "balayage", title: "Balayage", url: "/balayage", icon: Route }] : []),
      // Débits de nuit (chantier v3, S15) : droit « mesures_debit / lire »
      ...(peut("mesures_debit", "lire") ? [{ id: "debits", title: "Débits de nuit", url: "/debits", icon: Gauge }] : []),
      // Rapports (chantier v3, J1) : états journaliers et hebdomadaires, responsable et administrateur
      ...(peut("exports", "lire") && (admin || peut("fuites", "valider")) ? [{ id: "rapports", title: "Rapports", url: "/rapports", icon: FileText }] : []),
      // Suivi GPS (S11) : tracés des agents, responsable et administrateur (la base filtre aussi)
      ...(admin || peut("fuites", "valider") ? [{ id: "suivi-gps", title: "Suivi GPS", url: "/suivi-gps", icon: Footprints }] : []),
      { id: "alertes", title: "Alertes", url: "/alertes", icon: Siren },
      { id: "a-faire", title: "À faire", url: "/a-faire", icon: ListTodo },
    ] : []),
  ];

  const marche: NavMainItem[] = [
    ...(peut("attachements", "lire") ? [{ id: "attachements", title: "Attachements", url: "/attachements", icon: ReceiptText }] : []),
    ...(peut("quantites", "lire") ? [{
      id: "fournitures", title: "Fournitures", icon: Boxes,
      subItems: [
        { id: "fournitures-inventaire", title: "Inventaire", url: "/fournitures" },
        { id: "fournitures-rapprochement", title: "Rapprochement Dolibarr", url: "/fournitures/rapprochement" },
      ],
    }] : []),
    ...(ongletsVisibles.length ? [{
      id: "parametres", title: "Paramètres", icon: Settings2,
      subItems: ongletsVisibles.map(([k, t]) => ({ id: `parametres-${k}`, title: t, url: `/parametres?onglet=${k}` })),
    }] : []),
  ];

  const administration: NavMainItem[] = admin ? [
    {
      id: "utilisateurs", icon: Users, url: "/utilisateurs",
      title: verrous ? `Utilisateurs (${verrous} verrou${verrous > 1 ? "s" : ""})` : "Utilisateurs",
    },
    { id: "marches", title: "Marchés", url: "/marches", icon: Briefcase },
  ] : [];

  const tablette: NavMainItem[] = [
    { id: "en-attente", title: "Envois en attente", url: "/en-attente", icon: CloudUpload },
    { id: "hors-ligne", title: "Fiches hors ligne", url: "/fuites/hors-ligne", icon: CloudOff },
  ];

  return [
    { id: 1, label: "Suivi", items: suivi },
    ...(marche.length ? [{ id: 2, label: "Marché", items: marche }] : []),
    ...(administration.length ? [{ id: 3, label: "Administration", items: administration }] : []),
    { id: 4, label: "Tablette", items: tablette },
  ];
}
