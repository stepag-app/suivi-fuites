import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { libellesMarche } from "@/lib/format";
import type { StatutFuite, VFuite } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Apparence de chaque statut : badge, point, texte, couleur hexadécimale (carte, graphiques). */
export const STATUT_STYLE: Record<
  StatutFuite,
  { libelle: string; court: string; badge: string; point: string; texte: string; couleur: string; progression: number }
> = {
  detectee: {
    libelle: "Détectée, non réparée", court: "Détectée", progression: 15,
    badge: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
    point: "bg-red-500", texte: "text-red-600 dark:text-red-400", couleur: "#dc2626",
  },
  en_reparation: {
    libelle: "Réparation en cours", court: "En cours", progression: 45,
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    point: "bg-amber-500", texte: "text-amber-600 dark:text-amber-400", couleur: "#d97706",
  },
  reparee: {
    libelle: "Réparée, réfection à faire", court: "Réparée", progression: 75,
    badge: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    point: "bg-sky-500", texte: "text-sky-600 dark:text-sky-400", couleur: "#0284c7",
  },
  achevee: {
    libelle: "Achevée", court: "Achevée", progression: 100,
    badge: "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300",
    point: "bg-green-500", texte: "text-green-600 dark:text-green-400", couleur: "#16a34a",
  },
  sans_reparation: {
    libelle: "Sans réparation", court: "Sans réparation", progression: 100,
    badge: "border-muted-foreground/20 bg-muted text-muted-foreground",
    point: "bg-slate-400", texte: "text-muted-foreground", couleur: "#64748b",
  },
};

export const ORDRE_STATUTS: StatutFuite[] = ["detectee", "en_reparation", "reparee", "achevee", "sans_reparation"];

export function BadgeStatut({ statut, court = false, className }: { statut: StatutFuite; court?: boolean; className?: string }) {
  const s = STATUT_STYLE[statut];
  return (
    <Badge variant="outline" className={cn("gap-1.5 border font-medium", s.badge, className)}>
      <span className={cn("size-1.5 rounded-full", s.point)} />
      {court ? s.court : s.libelle}
    </Badge>
  );
}

export function PointStatut({ statut, className }: { statut: StatutFuite; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", STATUT_STYLE[statut].point, className)} />;
}

type Libelles = ReturnType<typeof libellesMarche>;
type ChampsAlerte = Partial<
  Pick<
    VFuite,
    | "alerte_non_reparee" | "alerte_communication_srm" | "refection_chaussee_hors_delai"
    | "alerte_refection_chaussee" | "alerte_refection_trottoir" | "alerte_sans_photo"
  >
>;

/** Mêmes alertes que la colonne « Alertes » de la liste, la carte et la fiche. */
export const ALERTES_FUITE: { cle: keyof ChampsAlerte; texte: (l: Libelles) => string; ton: "rouge" | "orange" }[] = [
  { cle: "alerte_non_reparee", texte: (l) => `Non réparée > ${l.delaiReparationH} h`, ton: "rouge" },
  { cle: "alerte_communication_srm", texte: (l) => `Non communiquée ${l.sigle}`, ton: "rouge" },
  { cle: "refection_chaussee_hors_delai", texte: () => "Réfection chaussée hors délai", ton: "rouge" },
  { cle: "alerte_refection_chaussee", texte: () => "Réfection chaussée à faire", ton: "orange" },
  { cle: "alerte_refection_trottoir", texte: () => "Réfection trottoir à faire", ton: "orange" },
];

export const alertesDe = (f: ChampsAlerte) => ALERTES_FUITE.filter((a) => f[a.cle] === true);

export function BadgeAlerte({ ton = "rouge", children, className }: { ton?: "rouge" | "orange" | "neutre"; children: ReactNode; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border font-medium",
        ton === "rouge" && "border-destructive/20 bg-destructive/10 text-destructive",
        ton === "orange" && "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        ton === "neutre" && "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </Badge>
  );
}

export function BadgesAlertes({ fuite, libelles, verrouillee, sansPhoto = false, vide = "—" }: {
  fuite: ChampsAlerte; libelles: Libelles; verrouillee?: string | null; sansPhoto?: boolean; vide?: ReactNode;
}) {
  const alertes = alertesDe(fuite);
  if (!alertes.length && !verrouillee && !(sansPhoto && fuite.alerte_sans_photo)) return <span className="text-muted-foreground">{vide}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {alertes.map((a) => (
        <BadgeAlerte key={a.cle} ton={a.ton}>{a.texte(libelles)}</BadgeAlerte>
      ))}
      {sansPhoto && fuite.alerte_sans_photo && <BadgeAlerte ton="orange">Aucune photo</BadgeAlerte>}
      {verrouillee && <BadgeAlerte ton="neutre">Verrouillée</BadgeAlerte>}
    </div>
  );
}
