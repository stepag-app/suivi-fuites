import { LifeBuoy } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function CarteAide() {
  return (
    <Card size="sm" className="overflow-hidden shadow-none group-data-[collapsible=icon]:hidden">
      <CardHeader className="min-w-0 px-4">
        <CardTitle className="flex items-center gap-2 truncate text-sm">
          <LifeBuoy className="size-4 text-muted-foreground" />
          Un souci sur le terrain ?
        </CardTitle>
        <CardDescription className="line-clamp-3">
          Les fuites saisies sans réseau partent toutes seules. En cas de blocage, appelez le responsable STEPAG.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
