"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Droplets, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import type { NavGroup, NavMainItem } from "./elements-nav";

type SearchItem = { id: string; group: string; label: string; url: string; icon?: NavMainItem["icon"]; disabled?: boolean };

function aplatir(groupes: readonly NavGroup[]): SearchItem[] {
  return groupes.flatMap((group) =>
    group.items.flatMap((item) => {
      if (item.subItems) {
        return item.subItems.map((sub) => ({ id: sub.id, group: item.title, label: sub.title, url: sub.url, icon: item.icon, disabled: sub.disabled }));
      }
      return [{ id: item.id, group: group.label ?? "Autres", label: item.title, url: item.url, icon: item.icon, disabled: item.disabled }];
    }),
  );
}

function grouper(items: SearchItem[]) {
  const groupes = [...new Set(items.map((i) => i.group))];
  return groupes.map((group) => ({ group, items: items.filter((i) => i.group === group) }));
}

/** Recherche globale (⌘J / Ctrl+J) : écrans, et saut direct à une fuite par son numéro. */
export function Recherche({ groupes }: { groupes: readonly NavGroup[] }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const router = useRouter();
  const items = React.useMemo(() => aplatir(groupes), [groupes]);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) setQuery("");
  };

  const aller = (url: string) => {
    handleOpenChange(false);
    router.push(url);
  };

  const numero = /^\s*(n°|no|#)?\s*(\d{1,6})\s*$/i.exec(query)?.[2];

  const renderGroups = (liste: SearchItem[]) =>
    grouper(liste).map(({ group, items: groupItems }, index) => (
      <React.Fragment key={group}>
        {index > 0 && <CommandSeparator />}
        <CommandGroup heading={group}>
          {groupItems.map((item) => (
            <CommandItem disabled={item.disabled} key={`${group}-${item.id}`} value={`${item.group} ${item.label}`} onSelect={() => aller(item.url)}>
              <span className="flex min-w-0 items-center gap-2">
                {item.icon && <item.icon />}
                <span className="truncate">{item.label}</span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </React.Fragment>
    ));

  return (
    <>
      <Button onClick={() => handleOpenChange(true)} variant="link" className="px-0! font-normal text-muted-foreground hover:no-underline">
        <Search data-icon="inline-start" />
        <span className="hidden sm:inline">Rechercher</span>
        <kbd className="hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px] sm:inline-flex">
          <span className="text-xs">⌘</span>J
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={handleOpenChange}>
        <Command shouldFilter={!numero}>
          <CommandInput placeholder="Écran, ou numéro de fuite…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            {numero && (
              <CommandGroup heading="Fuite">
                <CommandItem value={`fuite ${numero}`} onSelect={() => aller(`/fuites?texte=${numero}`)}>
                  <Droplets />
                  Ouvrir la fuite N° {numero}
                </CommandItem>
              </CommandGroup>
            )}
            {!numero && renderGroups(items)}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
