import { LifeBuoy } from "lucide-react";

const AIDE =
  "Les fuites saisies sans réseau partent toutes seules. En cas de blocage, appelez le responsable STEPAG.";

export function CarteAide() {
  return (
    <p
      title={AIDE}
      className="flex cursor-help items-center gap-1.5 px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden"
    >
      <LifeBuoy className="size-3.5 shrink-0" />
      <span className="truncate">Aide terrain</span>
    </p>
  );
}
