"use client";

// Bascule plan / satellite à la manière de Google Maps : vignette posée sur la carte qui montre le fond que l'on obtient
// en la touchant (image satellite quand le plan est affiché, plan quand le satellite l'est).
import { cn } from "@/lib/utils";
import { urlApercuSatellite } from "./satellite";

function ApercuPlan() {
  return (
    <svg viewBox="0 0 64 64" className="size-full" aria-hidden="true">
      <rect width="64" height="64" fill="#f2efe9" />
      <rect x="4" y="6" width="22" height="16" fill="#e4e0d8" />
      <rect x="36" y="34" width="24" height="22" fill="#d8ebd0" />
      <path d="M-2 28 L66 20 M18 -2 L26 66 M-2 50 L66 44 M44 -2 L40 66" stroke="#fff" strokeWidth="5" fill="none" />
      <path d="M-2 28 L66 20 M18 -2 L26 66" stroke="#f6d38a" strokeWidth="2.5" fill="none" />
      <path d="M6 60 C 20 40, 34 46, 60 10" stroke="#2563eb" strokeWidth="2" fill="none" />
    </svg>
  );
}

export function VignetteFond({ satellite, basculer, centre, libelles, className }: {
  satellite: boolean;
  basculer: () => void;
  /** Point [lon, lat] de la ville, pour l'aperçu satellite. */
  centre: [number, number];
  libelles: { satellite: string; plan: string };
  className?: string;
}) {
  const libelle = satellite ? libelles.plan : libelles.satellite;
  return (
    <button
      type="button"
      onClick={basculer}
      aria-pressed={satellite}
      aria-label={libelle}
      title={libelle}
      className={cn(
        "group relative size-16 overflow-hidden rounded-lg border-2 border-white bg-muted shadow-md ring-1 ring-black/15 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:size-[4.5rem]",
        className,
      )}
    >
      {satellite ? <ApercuPlan /> : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urlApercuSatellite(centre)} alt="" className="size-full object-cover" loading="lazy" />
      )}
      <span className={cn(
        "absolute inset-x-0 bottom-0 bg-gradient-to-t px-1 pt-3 pb-0.5 text-center font-medium text-[11px] leading-tight",
        satellite ? "from-white/90 to-transparent text-foreground" : "from-black/70 to-transparent text-white",
      )}>
        {libelle}
      </span>
    </button>
  );
}
