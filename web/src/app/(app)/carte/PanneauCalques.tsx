"use client";

// Volet « Calques » de la carte terrain (APK, bouton « Carte ») : chaque calque s'affiche ou se masque d'un toucher,
// la ligne entière sert d'interrupteur (doigt sur tablette). Légende du réseau et des zones balayées sous les calques.
import { Layers, X } from "lucide-react";
import { ORDRE_STATUTS, STATUT_STYLE } from "@/components/statut";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useLangueApk } from "@/lib/langue-apk";
import { CLASSES_DIAMETRE, COULEUR_BALAYE, COULEUR_DIAMETRE_INCONNU, COULEUR_NON_BALAYE, COULEUR_REPASSE } from "@/lib/reseau/palette";
import type { StatutFuite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { COULEURS, COULEUR_ALERTE, COULEUR_POSITION, COULEURS_STATUT_SECTEUR } from "./commun";
import { ZOOM_MIN_SATELLITE } from "./satellite";

export interface Calques {
  /** Statut masqué : false ; absent ou vrai : affiché. */
  statuts: Partial<Record<StatutFuite, boolean>>;
  prioritaires: boolean;
  reseau: boolean;
  zones: boolean;
  limites: boolean;
  satellite: boolean;
  position: boolean;
}

export const CALQUES_DEFAUT: Calques = {
  statuts: {}, prioritaires: true, reseau: true, zones: false, limites: true, satellite: false, position: true,
};

function Ligne({ id, titre, detail, actif, changer, pastille, nombre }: {
  id: string; titre: string; detail?: string; actif: boolean; changer: (v: boolean) => void;
  pastille?: React.ReactNode; nombre?: number;
}) {
  return (
    <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
      <span className="flex size-5 shrink-0 items-center justify-center">{pastille}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm leading-tight">{titre}</span>
        {detail && <span className="text-muted-foreground text-xs leading-snug">{detail}</span>}
      </span>
      {nombre != null && <span className="text-muted-foreground text-xs tabular-nums">{nombre}</span>}
      <Switch id={id} checked={actif} onCheckedChange={changer} aria-label={titre} />
    </label>
  );
}

const Point = ({ couleur, contour }: { couleur: string; contour?: string }) => (
  <span className="size-3.5 rounded-full border-2" style={{ background: couleur, borderColor: contour ?? couleur }} />
);
const Trait = ({ couleur }: { couleur: string }) => <span className="h-1 w-5 rounded-full" style={{ background: couleur }} />;
const Aplat = ({ couleur }: { couleur: string }) => (
  <span className="size-4 rounded-sm border" style={{ background: `${couleur}40`, borderColor: couleur }} />
);

function Groupe({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-0.5">
      <h3 className="px-2 pt-2 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">{titre}</h3>
      {children}
    </section>
  );
}

export function PanneauCalques({ calques, changer, nombres, nbPrioritaires, satellite, peutLireBalayage, fermer }: {
  calques: Calques;
  changer: (c: Partial<Calques>) => void;
  /** Fuites placées sur la carte, par statut. */
  nombres: Partial<Record<StatutFuite, number>>;
  nbPrioritaires: number;
  /** Clé Esri posée : le calque satellite existe. */
  satellite: boolean;
  peutLireBalayage: boolean;
  fermer: () => void;
}) {
  const { tb, rtl } = useLangueApk();
  const statut = (s: StatutFuite) => calques.statuts[s] !== false;
  const seulementBalayes = calques.zones && !calques.reseau;
  return (
    <div
      dir={rtl ? "rtl" : undefined}
      className="absolute top-3 bottom-24 left-3 z-[5] flex w-[min(280px,92vw)] flex-col overflow-hidden rounded-xl border bg-background shadow-lg"
      role="dialog"
      aria-label={tb("Calques")}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Layers className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="flex-1 font-medium text-sm">{tb("Calques")}</h2>
        <Button size="icon" variant="ghost" onClick={fermer} aria-label={tb("Fermer")} title={tb("Fermer")}><X /></Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5">
        <Groupe titre={tb("Fuites")}>
          <Ligne
            id="calque-prioritaires" titre={tb("Fuites prioritaires")} detail={tb("Non réparées au-delà du délai, réfection de chaussée hors délai")}
            actif={calques.prioritaires} changer={(v) => changer({ prioritaires: v })} nombre={nbPrioritaires}
            pastille={<span className="size-4 rounded-full border-2" style={{ borderColor: COULEUR_ALERTE, background: `${COULEUR_ALERTE}40` }} />}
          />
          {ORDRE_STATUTS.map((s) => (
            <Ligne
              key={s} id={`calque-${s}`} titre={tb(STATUT_STYLE[s].libelle)} actif={statut(s)} nombre={nombres[s] ?? 0}
              changer={(v) => changer({ statuts: { ...calques.statuts, [s]: v } })}
              pastille={<Point couleur={COULEURS[s].fond} contour={COULEURS[s].contour} />}
            />
          ))}
        </Groupe>

        <Groupe titre={tb("Réseau et balayage")}>
          <Ligne
            id="calque-reseau" titre={tb("Réseau d'eau")} detail={tb("Conduites (couleur du diamètre)")} actif={calques.reseau}
            changer={(v) => changer({ reseau: v })} pastille={<Trait couleur={CLASSES_DIAMETRE[1]?.couleur ?? COULEUR_DIAMETRE_INCONNU} />}
          />
          <Ligne
            id="calque-zones" titre={tb("Zones balayées")} detail={tb("Tronçons et secteurs déjà balayés")} actif={calques.zones}
            changer={(v) => changer({ zones: v })} pastille={<Trait couleur={COULEUR_BALAYE} />}
          />
          <Ligne
            id="calque-limites" titre={tb("Limites des secteurs")} actif={calques.limites} changer={(v) => changer({ limites: v })}
            pastille={<span className="size-4 rounded-sm border-2 border-dashed border-[#0b5d8a]" />}
          />
        </Groupe>

        <Groupe titre={tb("Fond de carte")}>
          {satellite && (
            <Ligne
              id="calque-satellite" titre={tb("Satellite")} detail={tb("Image satellite (à partir du zoom {z})", { z: ZOOM_MIN_SATELLITE })}
              actif={calques.satellite} changer={(v) => changer({ satellite: v })}
              pastille={<span className="size-4 rounded-sm bg-gradient-to-br from-emerald-700 to-stone-500" />}
            />
          )}
          <Ligne
            id="calque-position" titre={tb("Ma position")} detail={tb("Point bleu : votre position GPS actuelle")} actif={calques.position}
            changer={(v) => changer({ position: v })} pastille={<Point couleur={COULEUR_POSITION} contour="#ffffff" />}
          />
        </Groupe>

        {(calques.reseau || calques.zones) && (
          <Groupe titre={tb("Légende")}>
            <ul className="flex flex-col gap-1.5 px-2 pb-2 text-xs">
              {calques.zones ? (
                <>
                  {peutLireBalayage && (
                    <>
                      <li className="flex items-center gap-2"><Trait couleur={COULEUR_BALAYE} />{tb("Tronçon balayé")}</li>
                      <li className="flex items-center gap-2"><Trait couleur={COULEUR_REPASSE} />{tb("Repassé (2e passage ou plus)")}</li>
                      {!seulementBalayes && <li className="flex items-center gap-2"><Trait couleur={COULEUR_NON_BALAYE} />{tb("Non balayé")}</li>}
                    </>
                  )}
                  <li className="flex items-center gap-2"><Aplat couleur={COULEURS_STATUT_SECTEUR.balayee} />{tb("Secteur balayé")}</li>
                  <li className="flex items-center gap-2"><Aplat couleur={COULEURS_STATUT_SECTEUR.en_cours} />{tb("Secteur en cours de balayage")}</li>
                </>
              ) : (
                <>
                  {CLASSES_DIAMETRE.map((c) => (
                    <li key={c.libelle} className="flex items-center gap-2"><Trait couleur={c.couleur} />{tb(`Diamètre ${c.libelle}`)}</li>
                  ))}
                  <li className="flex items-center gap-2"><Trait couleur={COULEUR_DIAMETRE_INCONNU} />{tb("Diamètre inconnu")}</li>
                </>
              )}
            </ul>
          </Groupe>
        )}
        <p className={cn("px-2 pb-2 text-muted-foreground text-xs leading-snug")}>{tb("Lecture seule : les balayages se saisissent par le bouton « Balayage ».")}</p>
      </div>
    </div>
  );
}
