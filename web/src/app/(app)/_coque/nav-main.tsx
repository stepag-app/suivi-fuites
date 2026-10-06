"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, CloudUpload, PlusCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from "@/components/ui/sidebar";
import { useEnvoisEnAttente } from "@/lib/use-attente";
import { cn } from "@/lib/utils";
import type { NavBadge, NavGroup, NavMainItem, NavMainLinkItem, NavMainParentItem } from "./elements-nav";

interface NavMainProps {
  readonly items: readonly NavGroup[];
  readonly peutCreer: boolean;
}

function hasSubItems(item: NavMainItem): item is NavMainParentItem {
  return Boolean(item.subItems?.length);
}

function CollapsedIconFallback({ title }: { title: string }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-xs font-medium text-[10px] outline">
      {title.slice(0, 1)}
    </span>
  );
}

export function NavMain({ items, peutCreer }: NavMainProps) {
  const path = usePathname();
  const recherche = useSearchParams().toString();
  const courant = recherche ? `${path}?${recherche}` : path;
  const attente = useEnvoisEnAttente();

  const isItemActive = (item: NavMainItem) => {
    if (hasSubItems(item)) return item.subItems.some((sub) => courant === sub.url || path === sub.url.split("?")[0]);
    if (item.url === "/fuites") return path === "/fuites" || (path.startsWith("/fuites/") && path !== "/fuites/nouvelle");
    return path === item.url || path.startsWith(`${item.url}/`);
  };
  const isSubItemActive = (url: string) => courant === url;
  const isSubmenuOpen = (item: NavMainParentItem) => item.subItems.some((sub) => path === sub.url.split("?")[0]);

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent className="flex flex-col gap-2">
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center gap-2">
              <SidebarMenuButton
                asChild
                tooltip="Nouvelle fuite"
                aria-disabled={!peutCreer}
                className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
              >
                <Link href="/fuites/nouvelle" prefetch={false}>
                  <PlusCircleIcon />
                  <span>Nouvelle fuite</span>
                </Link>
              </SidebarMenuButton>
              <Button size="icon" className="relative h-9 w-9 shrink-0 group-data-[collapsible=icon]:opacity-0" variant="outline" asChild>
                <Link href="/en-attente" prefetch={false} aria-label="Envois en attente">
                  <CloudUpload />
                  {attente > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                      {attente}
                    </span>
                  )}
                </Link>
              </Button>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {items.map((group) => (
        <SidebarGroup key={group.id}>
          {group.label && (
            <SidebarGroupLabel className="group-data-[collapsible=icon]:pointer-events-none">{group.label}</SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  isItemActive={isItemActive}
                  isSubItemActive={isSubItemActive}
                  isSubmenuOpen={isSubmenuOpen}
                  compteur={item.id === "en-attente" && attente > 0 ? attente : undefined}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function NavItem({ item, isItemActive, isSubItemActive, isSubmenuOpen, compteur }: {
  item: NavMainItem;
  isItemActive: (item: NavMainItem) => boolean;
  isSubItemActive: (url: string) => boolean;
  isSubmenuOpen: (item: NavMainParentItem) => boolean;
  compteur?: number;
}) {
  const { state, isMobile } = useSidebar();
  const isCollapsedDesktop = state === "collapsed" && !isMobile;

  if (!hasSubItems(item)) {
    return <NavLinkItem item={item} isActive={isItemActive(item)} showIconFallback={isCollapsedDesktop} compteur={compteur} />;
  }
  if (isCollapsedDesktop) {
    return <NavDropdownItem item={item} isActive={isItemActive(item)} isSubItemActive={isSubItemActive} />;
  }
  return <NavCollapsibleItem item={item} isActive={isItemActive(item)} defaultOpen={isSubmenuOpen(item)} isSubItemActive={isSubItemActive} />;
}

function NavLinkItem({ item, isActive, showIconFallback, compteur }: {
  item: NavMainLinkItem; isActive: boolean; showIconFallback: boolean; compteur?: number;
}) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild aria-disabled={item.disabled} tooltip={item.title} isActive={isActive}>
        <Link prefetch={false} href={item.url} target={item.newTab ? "_blank" : undefined} rel={item.newTab ? "noreferrer" : undefined}>
          {Icon ? <Icon /> : showIconFallback ? <CollapsedIconFallback title={item.title} /> : null}
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
      {compteur != null ? (
        <SidebarMenuBadge className="rounded-full bg-amber-500 text-white peer-hover/menu-button:text-white">{compteur}</SidebarMenuBadge>
      ) : (
        <NavItemBadge badge={item.badge} />
      )}
    </SidebarMenuItem>
  );
}

function NavDropdownItem({ item, isActive, isSubItemActive }: {
  item: NavMainParentItem; isActive: boolean; isSubItemActive: (url: string) => boolean;
}) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton tooltip={item.title} isActive={isActive} disabled={item.disabled}>
            {Icon ? <Icon /> : <CollapsedIconFallback title={item.title} />}
            <span>{item.title}</span>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={12} className="w-52">
          <DropdownMenuGroup>
            {item.subItems.map((subItem) => (
              <DropdownMenuItem key={subItem.id} asChild disabled={subItem.disabled}>
                <Link prefetch={false} href={subItem.url} aria-current={isSubItemActive(subItem.url) ? "page" : undefined} className="flex items-center gap-2">
                  {subItem.icon && <subItem.icon />}
                  <span>{subItem.title}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function NavCollapsibleItem({ item, isActive, defaultOpen, isSubItemActive }: {
  item: NavMainParentItem; isActive: boolean; defaultOpen: boolean; isSubItemActive: (url: string) => boolean;
}) {
  const Icon = item.icon;
  return (
    <Collapsible asChild defaultOpen={defaultOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title} isActive={isActive} disabled={item.disabled}>
            {Icon && <Icon />}
            <span>{item.title}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <NavItemBadge badge={item.badge} />
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.subItems.map((subItem) => (
              <SidebarMenuSubItem key={subItem.id}>
                <SidebarMenuSubButton asChild aria-disabled={subItem.disabled} isActive={isSubItemActive(subItem.url)}>
                  <Link prefetch={false} href={subItem.url}>
                    {subItem.icon && <subItem.icon />}
                    <span>{subItem.title}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function NavItemBadge({ badge }: { badge?: NavBadge }) {
  if (!badge) return null;
  return (
    <SidebarMenuBadge
      className={cn(
        "rounded-sm border capitalize",
        badge === "nouveau" && "border-green-600 text-green-600 peer-hover/menu-button:text-green-600 peer-data-active/menu-button:text-green-600",
        badge === "bientôt" && "border-muted-foreground text-muted-foreground",
      )}
    >
      {badge}
    </SidebarMenuBadge>
  );
}
