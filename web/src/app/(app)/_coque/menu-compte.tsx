"use client";

import Link from "next/link";
import { CloudUpload, LogOut, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/utils";

export function MenuCompte({ nom, identifiant, admin, deconnecter }: {
  nom: string; identifiant: string; admin: boolean; deconnecter: () => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="Mon compte">
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback className="rounded-lg">{getInitials(nom)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56 rounded-lg" side="bottom" align="end" sideOffset={4}>
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="size-9 rounded-lg">
              <AvatarFallback className="rounded-lg">{getInitials(nom)}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{nom}</span>
              <span className="truncate text-muted-foreground text-xs">{identifiant}{admin ? " · administrateur" : ""}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {admin && (
            <DropdownMenuItem asChild><Link href="/utilisateurs" prefetch={false}><ShieldCheck />Utilisateurs</Link></DropdownMenuItem>
          )}
          <DropdownMenuItem asChild><Link href="/en-attente" prefetch={false}><CloudUpload />Envois en attente</Link></DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void deconnecter()}><LogOut />Quitter</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
