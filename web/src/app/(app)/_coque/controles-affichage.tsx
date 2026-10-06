"use client";

import { Settings } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type FontKey, fontOptions } from "@/lib/fonts/registry";
import type { ContentLayout, NavbarStyle, SidebarCollapsible, SidebarVariant } from "@/lib/preferences/layout";
import { THEME_PRESET_OPTIONS, type ThemeMode, type ThemePreset } from "@/lib/preferences/theme";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

const LIBELLES_PRESETS: Record<string, string> = { default: "Par défaut", brutalist: "Brutaliste", "soft-pop": "Soft Pop", tangerine: "Tangerine" };

/** Préférences d'affichage (modèle « Layout controls ») : thème, police, mode, largeur, barre latérale. */
export function ControlesAffichage() {
  const { values, resolvedThemeMode, setPreference, resetPreferences } = usePreferencesStore(
    useShallow((state) => ({
      values: state.values, resolvedThemeMode: state.resolvedThemeMode, setPreference: state.setPreference, resetPreferences: state.resetPreferences,
    })),
  );
  const { theme_mode, theme_preset, content_layout, navbar_style, sidebar_variant, sidebar_collapsible, font } = values;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="outline" aria-label="Préférences d'affichage">
          <Settings />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <div className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <h4 className="font-medium text-sm leading-none">Affichage</h4>
            <p className="text-muted-foreground text-xs">Réglez l&apos;apparence du panneau. Mémorisé sur cet appareil.</p>
          </div>
          <div className="space-y-3 **:data-[slot=toggle-group]:w-full **:data-[slot=toggle-group-item]:flex-1 **:data-[slot=toggle-group-item]:text-xs">
            <div className="space-y-1">
              <Label className="font-medium text-xs">Jeu de couleurs</Label>
              <Select value={theme_preset} onValueChange={(v) => setPreference("theme_preset", v as ThemePreset)}>
                <SelectTrigger size="sm" className="w-full text-xs"><SelectValue placeholder="Jeu de couleurs" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {THEME_PRESET_OPTIONS.map((preset) => (
                      <SelectItem key={preset.value} className="text-xs" value={preset.value}>
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: resolvedThemeMode === "dark" ? preset.primary.dark : preset.primary.light }} />
                        {LIBELLES_PRESETS[preset.value] ?? preset.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="font-medium text-xs">Police</Label>
              <Select value={font} onValueChange={(v) => setPreference("font", v as FontKey)}>
                <SelectTrigger size="sm" className="w-full text-xs"><SelectValue placeholder="Police" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {fontOptions.map((f) => (
                      <SelectItem key={f.key} className="text-xs" value={f.key}>{f.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="font-medium text-xs">Mode</Label>
              <ToggleGroup size="sm" spacing={0} variant="outline" type="single" value={theme_mode} onValueChange={(v) => v && setPreference("theme_mode", v as ThemeMode)}>
                <ToggleGroupItem value="light">Clair</ToggleGroupItem>
                <ToggleGroupItem value="dark">Sombre</ToggleGroupItem>
                <ToggleGroupItem value="system">Système</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="space-y-1">
              <Label className="font-medium text-xs">Largeur des pages</Label>
              <ToggleGroup size="sm" spacing={0} variant="outline" type="single" value={content_layout} onValueChange={(v) => v && setPreference("content_layout", v as ContentLayout)}>
                <ToggleGroupItem value="centered">Centrée</ToggleGroupItem>
                <ToggleGroupItem value="full-width">Pleine largeur</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="space-y-1">
              <Label className="font-medium text-xs">Barre du haut</Label>
              <ToggleGroup size="sm" spacing={0} variant="outline" type="single" value={navbar_style} onValueChange={(v) => v && setPreference("navbar_style", v as NavbarStyle)}>
                <ToggleGroupItem value="sticky">Fixe</ToggleGroupItem>
                <ToggleGroupItem value="scroll">Défilante</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="space-y-1">
              <Label className="font-medium text-xs">Barre latérale</Label>
              <ToggleGroup size="sm" spacing={0} variant="outline" type="single" value={sidebar_variant} onValueChange={(v) => v && setPreference("sidebar_variant", v as SidebarVariant)}>
                <ToggleGroupItem value="inset">Encastrée</ToggleGroupItem>
                <ToggleGroupItem value="sidebar">Classique</ToggleGroupItem>
                <ToggleGroupItem value="floating">Flottante</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="space-y-1">
              <Label className="font-medium text-xs">Repli de la barre latérale</Label>
              <ToggleGroup size="sm" spacing={0} variant="outline" type="single" value={sidebar_collapsible} onValueChange={(v) => v && setPreference("sidebar_collapsible", v as SidebarCollapsible)}>
                <ToggleGroupItem value="icon">Icônes</ToggleGroupItem>
                <ToggleGroupItem value="offcanvas">Masquée</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <Button type="button" size="sm" variant="outline" className="w-full text-xs" onClick={resetPreferences}>
              Rétablir les réglages
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
