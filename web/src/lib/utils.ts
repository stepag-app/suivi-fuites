import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getInitials = (str: string): string => {
  if (typeof str !== "string" || !str.trim()) return "?";
  return (
    str
      .trim()
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "?"
  );
};

export const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) =>
  `${n.toLocaleString("fr-FR")} ${n > 1 ? motPluriel : mot}`;

export const pourcent = (n: number, total: number) => (total ? Math.round((100 * n) / total) : 0);

/** Durée écoulée en clair : « 3 h », « 2 j 4 h ». */
export function dureeDepuis(iso: string | null | undefined, maintenant = new Date()): string {
  if (!iso) return "—";
  const h = Math.max(0, Math.round((maintenant.getTime() - new Date(iso).getTime()) / 3_600_000));
  if (h < 48) return `${h} h`;
  const j = Math.floor(h / 24);
  return `${j} j ${h - j * 24} h`;
}
