"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";
import { Briefcase, FlaskConical } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import type { SidebarCollapsible, SidebarVariant } from "@/lib/preferences/layout";
import { useSession } from "@/lib/session";
import { DOMAINE_AGENTS, MODE_DEMO } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { AppSidebar } from "./app-sidebar";
import { BasculeTheme } from "./bascule-theme";
import { ControlesAffichage } from "./controles-affichage";
import { elementsNav } from "./elements-nav";
import { MenuCompte } from "./menu-compte";
import { Recherche } from "./recherche";
import { SelecteurMarche } from "./selecteur-marche";
import { StatutReseau } from "./statut-reseau";

export function Coque({ children, defaultOpen, variant, collapsible }: {
  children: ReactNode; defaultOpen: boolean; variant: SidebarVariant; collapsible: SidebarCollapsible;
}) {
  const { chargement, session, profil, marches, marche, choisirMarche, peut, verrous, deconnecter } = useSession();
  const router = useRouter();
  const chemin = usePathname();

  useEffect(() => {
    if (!chargement && !session) router.replace("/connexion");
  }, [chargement, session, router]);

  const groupes = useMemo(() => elementsNav(peut, profil, verrous.length), [peut, profil, verrous.length]);

  if (chargement || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground text-sm">
        <Spinner /> Chargement…
      </div>
    );
  }

  const nom = profil?.nom_complet ?? session.user.email ?? "";
  const identifiant = profil?.identifiant ? `${profil.identifiant}@${DOMAINE_AGENTS}` : session.user.email ?? "";
  const admin = !!profil?.est_admin;
  const accesContenu = marche || (admin && chemin.startsWith("/marches"));

  return (
    <SidebarProvider defaultOpen={defaultOpen} style={{ "--sidebar-width": "calc(var(--spacing) * 68)" } as React.CSSProperties}>
      <AppSidebar
        variant={variant} collapsible={collapsible} groupes={groupes} peutCreer={peut("fuites", "creer")}
        nom={nom} identifiant={identifiant} admin={admin} deconnecter={deconnecter}
      />
      <SidebarInset
        className={cn(
          "[html[data-content-layout=centered]_&>*]:mx-auto",
          "[html[data-content-layout=centered]_&>*]:w-full",
          "[html[data-content-layout=centered]_&>*]:max-w-screen-2xl",
          "peer-data-[variant=inset]:border",
          "[--dashboard-header-height:--spacing(12)]",
          "min-w-0 overflow-x-clip",
        )}
      >
        <header
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
            "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
          )}
        >
          <div className="flex w-full items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-1 lg:gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center" />
              <Recherche groupes={groupes} />
            </div>
            <div className="flex items-center gap-2">
              <SelecteurMarche marches={marches} marche={marche} choisir={choisirMarche} admin={admin} />
              <ControlesAffichage />
              <BasculeTheme />
              <MenuCompte nom={nom} identifiant={identifiant} admin={admin} deconnecter={deconnecter} />
            </div>
          </div>
        </header>
        {MODE_DEMO && (
          <div className="flex items-center justify-center gap-2 border-b border-violet-200 bg-violet-50 px-4 py-1.5 text-violet-900 text-xs dark:border-violet-900 dark:bg-violet-950 dark:text-violet-100" role="status">
            <FlaskConical className="size-3.5" />
            Mode démonstration : données fictives en mémoire, rien n&apos;est enregistré.
          </div>
        )}
        <StatutReseau />
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 has-data-[content-padding=false]:p-0 md:p-6 md:has-data-[content-padding=false]:p-0">
          {accesContenu ? children : (
            <Empty className="min-h-64">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Briefcase /></EmptyMedia>
                <EmptyTitle>Aucun marché affecté</EmptyTitle>
                <EmptyDescription>Aucun marché n&apos;est affecté à votre compte. Contactez l&apos;administrateur.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
