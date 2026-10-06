import {
  Briefcase, CloudUpload, Droplets, LayoutDashboard, ListTodo, type LucideIcon, MapPinned, ReceiptText, Settings2, Siren, Users,
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

export type Onglet = "marche" | "bordereau" | "attachement" | "evenements" | "ouvriers" | "equipes" | "motifs" | "secteurs" | "natures" | "catalogue";

export const ONGLETS_PARAMETRES: [Onglet, string][] = [
  ["marche", "Marché"],
  ["bordereau", "Bordereau"],
  ["attachement", "Attachement"],
  ["evenements", "Événements"],
  ["ouvriers", "Ouvriers"],
  ["equipes", "Équipes"],
  ["motifs", "Motifs"],
  ["secteurs", "Secteurs"],
  ["natures", "Natures de réfection"],
  ["catalogue", "Catalogue des pièces"],
];

type Peut = (type: TypeDonnee, action: Action) => boolean;

/** Menu latéral selon les droits du compte sur le marché ouvert. */
export function elementsNav(peut: Peut, profil: Profil | null): NavGroup[] {
  const admin = !!profil?.est_admin;
  const lireFuites = peut("fuites", "lire");
  const accesParametres = peut("parametres", "creer") || peut("parametres", "modifier");
  const ongletsVisibles = ONGLETS_PARAMETRES.filter(([k]) =>
    k === "evenements" ? peut("evenements", "lire")
      : k === "ouvriers" ? peut("ouvriers", "creer") || peut("ouvriers", "modifier")
        : k === "bordereau" ? accesParametres || peut("quantites", "lire")
          : accesParametres,
  );

  const suivi: NavMainItem[] = [
    ...(lireFuites ? [{ id: "tableau-de-bord", title: "Tableau de bord", url: "/tableau-de-bord", icon: LayoutDashboard }] : []),
    { id: "fuites", title: "Fuites", url: "/fuites", icon: Droplets },
    ...(lireFuites ? [
      { id: "carte", title: "Carte", url: "/carte", icon: MapPinned },
      { id: "alertes", title: "Alertes", url: "/alertes", icon: Siren },
      { id: "a-faire", title: "À faire", url: "/a-faire", icon: ListTodo },
    ] : []),
  ];

  const marche: NavMainItem[] = [
    ...(peut("attachements", "lire") ? [{ id: "attachements", title: "Attachements", url: "/attachements", icon: ReceiptText }] : []),
    ...(ongletsVisibles.length ? [{
      id: "parametres", title: "Paramètres", icon: Settings2,
      subItems: ongletsVisibles.map(([k, t]) => ({ id: `parametres-${k}`, title: t, url: `/parametres?onglet=${k}` })),
    }] : []),
  ];

  const administration: NavMainItem[] = admin ? [
    { id: "utilisateurs", title: "Utilisateurs", url: "/utilisateurs", icon: Users },
    { id: "marches", title: "Marchés", url: "/marches", icon: Briefcase },
  ] : [];

  const tablette: NavMainItem[] = [{ id: "en-attente", title: "Envois en attente", url: "/en-attente", icon: CloudUpload }];

  return [
    { id: 1, label: "Suivi", items: suivi },
    ...(marche.length ? [{ id: 2, label: "Marché", items: marche }] : []),
    ...(administration.length ? [{ id: 3, label: "Administration", items: administration }] : []),
    { id: 4, label: "Tablette", items: tablette },
  ];
}
