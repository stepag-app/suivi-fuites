import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** En-tête de page du modèle : titre, sous-titre, actions à droite. */
export function EnTetePage({ titre, description, actions, className }: {
  titre: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl leading-tight tracking-tight sm:text-3xl sm:leading-none">{titre}</h1>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Vide({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-40 items-center justify-center rounded-xl border border-dashed text-muted-foreground text-sm", className)}>
      {children}
    </div>
  );
}
