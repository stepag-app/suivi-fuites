"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

const CYCLE = ["light", "dark", "system"] as const;

export function BasculeTheme() {
  const { themeMode, setPreference } = usePreferencesStore(
    useShallow((state) => ({ themeMode: state.values.theme_mode, setPreference: state.setPreference })),
  );
  const suivant = () => setPreference("theme_mode", CYCLE[(CYCLE.indexOf(themeMode) + 1) % CYCLE.length]);
  return (
    <Button size="icon" variant="outline" onClick={suivant} aria-label={`Thème : ${themeMode}. Cliquer pour changer`}>
      <Monitor className="hidden [html[data-theme-mode=system]_&]:block" />
      <Sun className="hidden dark:block [html[data-theme-mode=system]_&]:hidden" />
      <Moon className="block dark:hidden [html[data-theme-mode=system]_&]:hidden" />
    </Button>
  );
}
