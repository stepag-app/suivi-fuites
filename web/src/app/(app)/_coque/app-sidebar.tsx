"use client";

import Link from "next/link";
import { Droplets } from "lucide-react";
import { Suspense } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NOM_ORGANISATION } from "@/lib/supabase";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import { CarteAide } from "./carte-aide";
import type { NavGroup } from "./elements-nav";
import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

export function AppSidebar({ groupes, peutCreer, nom, identifiant, admin, deconnecter, ...props }: React.ComponentProps<typeof Sidebar> & {
  groupes: NavGroup[]; peutCreer: boolean; nom: string; identifiant: string; admin: boolean; deconnecter: () => Promise<void>;
}) {
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({ sidebarVariant: s.values.sidebar_variant, sidebarCollapsible: s.values.sidebar_collapsible, isSynced: s.isSynced })),
  );
  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;

  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link prefetch={false} href="/tableau-de-bord">
                <Droplets className="text-sky-600 dark:text-sky-400" />
                <span className="font-semibold text-base">Suivi des fuites</span>
                <span className="ml-auto text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">{NOM_ORGANISATION}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <Suspense>
          <NavMain items={groupes} peutCreer={peutCreer} />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>
        <CarteAide />
        <NavUser nom={nom} identifiant={identifiant} admin={admin} deconnecter={deconnecter} />
      </SidebarFooter>
    </Sidebar>
  );
}
