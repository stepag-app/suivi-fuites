"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CircleCheck, Clock3, FileDown, FileUp, Lock, Paperclip, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { Vide } from "@/components/en-tete-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  HEURES_NUIT, MODES_SAISIE, TYPES_CAMPAGNE, debit, debitsNuits, jourFr, libelleCampagne, lireCsv, lireTableauImport,
  normaliserReleves, nuitsCampagne, regrouperImport, type Campagne, type MesureImport, type MesureNuit, type ModeSaisie,
  type Releve, type ResultatImport,
} from "@/lib/debits";
import { messageErreur } from "@/lib/format";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { exporterProcesVerbal } from "./Campagnes";
import { chargerMesures, deposerPieceJointe, ouvrirPieceJointe, type DonneesDebits } from "./donnees";

// Modification en attente d'une cellule (point × nuit) : nouveau minimum, nouveaux relevés, ou mesure à retirer.
type Brouillon = { minimum: string } | { releves: Releve[] } | { effacer: true };
const cle = (point: string, nuit: string) => `${point}|${nuit}`;
const texteNombre = (n: number | null | undefined) => (n == null ? "" : String(n));
const lireNombre = (t: string) => {
  const n = Number(t.replace(/\s/g, "").replace(",", "."));
  return t.trim() === "" || !Number.isFinite(n) ? null : n;
};

function DialogueReleves({ titre, initial, fermer, valider, lecture }: {
  titre: string; initial: Releve[] | null; fermer: () => void; valider: (r: Releve[] | null) => void; lecture: boolean;
}) {
  const heures = useMemo(() => [...new Set([...HEURES_NUIT, ...(initial ?? []).map((r) => r.h)])].sort(), [initial]);
  const [valeurs, setValeurs] = useState<Record<string, string>>(() => Object.fromEntries((initial ?? []).map((r) => [r.h, String(r.q)])));
  const [colle, setColle] = useState("");
  const [erreur, setErreur] = useState("");
  const nombres = heures.map((h) => lireNombre(valeurs[h] ?? "")).filter((n): n is number => n != null);
  const repartir = () => {
    const liste = colle.split(/[\s;]+/).filter(Boolean);
    setValeurs((v) => ({ ...v, ...Object.fromEntries(liste.slice(0, HEURES_NUIT.length).map((x, i) => [HEURES_NUIT[i], x])) }));
    setColle("");
  };
  const enregistrer = () => {
    try {
      valider(normaliserReleves(heures.map((h) => ({ h, q: valeurs[h] ?? "" })).filter((r) => r.q.trim() !== "").map((r) => ({ h: r.h, q: lireNombre(r.q) ?? NaN }))));
    } catch (e) {
      setErreur(messageErreur(e));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Relevés de 0 h à 6 h</DialogTitle>
          <DialogDescription>{titre} · débit en m³/h toutes les 15 minutes (25 valeurs, art. II-17) ; le débit de la nuit est le minimum.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[50vh] grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto pr-1 sm:grid-cols-3">
          {heures.map((h) => (
            <label key={h} className="flex items-center gap-2 text-sm">
              <span className="w-12 text-muted-foreground tabular-nums">{h}</span>
              <Input inputMode="decimal" className="h-8 text-right tabular-nums" disabled={lecture} value={valeurs[h] ?? ""}
                onChange={(e) => setValeurs((v) => ({ ...v, [h]: e.target.value }))} />
            </label>
          ))}
        </div>
        {!lecture && (
          <div className="flex flex-col gap-2">
            <Textarea rows={2} value={colle} onChange={(e) => setColle(e.target.value)}
              placeholder="Coller une colonne de valeurs (tableur, télé-relève) : elles sont réparties de 00:00 à 06:00." />
            <div><Button variant="outline" size="sm" disabled={!colle.trim()} onClick={repartir}>Répartir les valeurs collées</Button></div>
          </div>
        )}
        <p className="text-sm">Minimum de la nuit : <span className="font-medium tabular-nums">{nombres.length ? debit(Math.min(...nombres), 2) : "—"}</span> m³/h · {nombres.length} relevé{nombres.length > 1 ? "s" : ""}</p>
        {erreur && <p className="text-destructive text-sm">{erreur}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={fermer}>{lecture ? "Fermer" : "Annuler"}</Button>
          {!lecture && <Button onClick={enregistrer}>Garder ces relevés</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Saisie({ d, campagne, peutSaisir, peutValider, peutExporter, retour, actualiser }: {
  d: DonneesDebits; campagne: Campagne; peutSaisir: boolean; peutValider: boolean; peutExporter: boolean;
  retour: () => void; actualiser: () => void;
}) {
  const [mesures, setMesures] = useState<MesureNuit[] | null>(null);
  const [erreur, setErreur] = useState("");
  const [brouillon, setBrouillon] = useState<Map<string, Brouillon>>(new Map());
  const [mode, setMode] = useState<ModeSaisie>(campagne.mode_saisie ?? d.reglages.debits_mode_saisie);
  const [releves, setReleves] = useState<{ point: string; nuit: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [importe, setImporte] = useState<(ResultatImport & { fichier: string }) | null>(null);

  const charger = useCallback(async () => {
    setErreur("");
    try {
      setMesures(await chargerMesures(campagne.id));
      setBrouillon(new Map());
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }, [campagne.id]);
  useEffect(() => { charger(); }, [charger]);

  const nuits = nuitsCampagne(campagne);
  const zones = d.zones.filter((z) => (campagne.zone_id ? z.id === campagne.zone_id : z.actif !== false)).sort((a, b) => a.numero - b.numero);
  const points = (zoneId: string) => d.points.filter((p) => p.zone_id === zoneId && (p.actif || mesures?.some((m) => m.point_id === p.id)));
  const existante = (point: string, nuit: string) => mesures?.find((m) => m.point_id === point && m.nuit === nuit);
  const verrouillee = (m: MesureNuit | undefined) => !peutSaisir || (!!m?.validee_le && !peutValider);

  // Aperçu : mesures enregistrées et brouillon, comptées comme validées.
  const apercu = useMemo(() => {
    if (!mesures) return [];
    const fusion: MesureNuit[] = [];
    const vues = new Set<string>();
    for (const m of mesures) {
      const b = brouillon.get(cle(m.point_id, m.nuit));
      vues.add(cle(m.point_id, m.nuit));
      if (!b) fusion.push({ ...m, validee_le: "apercu" });
      else if ("releves" in b) fusion.push({ ...m, mode: "releves", releves: b.releves, minimum_m3h: Math.min(...b.releves.map((r) => r.q)), validee_le: "apercu" });
      else if ("minimum" in b && lireNombre(b.minimum) != null) fusion.push({ ...m, mode: "minimum", releves: null, minimum_m3h: lireNombre(b.minimum)!, validee_le: "apercu" });
    }
    for (const [k, b] of brouillon) {
      if (vues.has(k) || "effacer" in b) continue;
      const [point_id, nuit] = k.split("|");
      const min = "releves" in b ? Math.min(...b.releves.map((r) => r.q)) : lireNombre(b.minimum);
      if (min == null) continue;
      fusion.push({ id: k, campagne_id: campagne.id, point_id, nuit, releves: "releves" in b ? b.releves : null, mode: "releves" in b ? "releves" : "minimum", minimum_m3h: min, validee_le: "apercu" });
    }
    return debitsNuits(d.zones, d.points, [campagne], fusion);
  }, [mesures, brouillon, d.zones, d.points, campagne]);

  // Nouvelle valeur d'une cellule ; vide : retrait de la mesure enregistrée, ou rien.
  const modifier = (point: string, nuit: string, b: Brouillon | null) => setBrouillon((x) => {
    const suite = new Map(x);
    const m = existante(point, nuit);
    const vide = b == null || ("minimum" in b && b.minimum.trim() === "");
    if (vide && m) suite.set(cle(point, nuit), { effacer: true });
    else if (vide) suite.delete(cle(point, nuit));
    else suite.set(cle(point, nuit), b);
    return suite;
  });
  const changements = [...brouillon.entries()].filter(([k, b]) => {
    const [p, n] = k.split("|");
    const m = existante(p, n);
    if ("effacer" in b) return !!m;
    if ("releves" in b) return true;
    const v = lireNombre(b.minimum);
    return v != null && (!m || v !== m.minimum_m3h || m.mode !== "minimum");
  });

  async function enregistrer(lot: MesureImport[] | null = null, origine: "saisie" | "import" = "saisie") {
    setEnvoi(true);
    const sb = getSupabase();
    try {
      const envoi: MesureImport[] = lot ?? [];
      const effacer: string[] = [];
      if (!lot) {
        for (const [k, b] of changements) {
          const [point_id, nuit] = k.split("|");
          const m = existante(point_id, nuit);
          if ("effacer" in b) { if (m) effacer.push(m.id); }
          else if ("releves" in b) envoi.push({ point_id, nuit, releves: b.releves });
          else envoi.push({ point_id, nuit, minimum_m3h: lireNombre(b.minimum)! });
        }
      }
      if (envoi.length) {
        const { data, error } = await sb.rpc("enregistrer_mesures_nuit", { p_campagne: campagne.id, p_mesures: envoi, p_origine: origine, p_source: "web" });
        if (error) throw error;
        const r = data as { ajoutees: number; modifiees: number } | null;
        toast.success(`${r?.ajoutees ?? 0} mesure(s) ajoutée(s), ${r?.modifiees ?? 0} modifiée(s)`);
      }
      for (const id of effacer) {
        const { error } = await sb.from("mesures_nuit").update({ supprime_le: new Date().toISOString() }).eq("id", id);
        if (error) throw error;
      }
      if (effacer.length) toast.success(`${effacer.length} mesure(s) retirée(s)`);
      setImporte(null);
      await charger();
      actualiser();
    } catch (e) {
      toast.error(messageErreur(e));
    }
    setEnvoi(false);
  }

  async function lireFichier(f: File) {
    try {
      const tableau = /\.xlsx$/i.test(f.name) ? await (await import("@/lib/lire-xlsx")).lireXlsx(f) : lireCsv(await f.text());
      setImporte({ ...regrouperImport(lireTableauImport(tableau), d.points, campagne), fichier: f.name });
    } catch (e) {
      toast.error(`Fichier illisible : ${messageErreur(e)}`);
    }
  }

  async function joindrePv(f: File) {
    try {
      const chemin = await deposerPieceJointe(d.marcheId, campagne.id, f);
      const { error } = await getSupabase().from("campagnes_debit").update({ pv_chemin: chemin, pv_signe_le: new Date().toISOString().slice(0, 10) }).eq("id", campagne.id);
      if (error) throw error;
      toast.success("Procès-verbal signé joint");
      actualiser();
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  const enCours = releves ? { m: existante(releves.point, releves.nuit), b: brouillon.get(cle(releves.point, releves.nuit)) } : null;
  const nbAValider = mesures?.filter((m) => !m.validee_le).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={retour}><ArrowLeft data-icon="inline-start" />Campagnes</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{libelleCampagne(campagne)}</CardTitle>
          <CardDescription>
            {TYPES_CAMPAGNE[campagne.type].libelle} · {campagne.zone_id ? `zone ${zones[0]?.numero}` : "toutes les zones"} · {TYPES_CAMPAGNE[campagne.type].aide}.
            {campagne.observation ? ` ${campagne.observation}` : ""}
          </CardDescription>
          <CardAction className="flex flex-wrap gap-2">
            {peutExporter && (
              <Button variant="outline" size="sm" onClick={() => exporterProcesVerbal(d, campagne, "pdf").catch((e) => toast.error(messageErreur(e)))}>
                <FileDown data-icon="inline-start" />Procès-verbal
              </Button>
            )}
            {campagne.pv_chemin && (
              <Button variant="outline" size="sm" onClick={() => ouvrirPieceJointe(campagne.pv_chemin!).catch((e) => toast.error(messageErreur(e)))}>
                <Paperclip data-icon="inline-start" />PV signé
              </Button>
            )}
            {peutValider && (
              <Button variant="outline" size="sm" asChild>
                <label className="cursor-pointer">
                  <Upload data-icon="inline-start" />{campagne.pv_chemin ? "Remplacer le PV" : "Joindre le PV signé"}
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) joindrePv(f); }} />
                </label>
              </Button>
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {peutSaisir && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-muted-foreground text-sm">Saisie :</span>
              <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as ModeSaisie)}>
                {(Object.keys(MODES_SAISIE) as ModeSaisie[]).map((m) => <ToggleGroupItem key={m} value={m}>{MODES_SAISIE[m]}</ToggleGroupItem>)}
              </ToggleGroup>
            </div>
          )}
          {!peutValider && peutSaisir && (
            <Alert><Clock3 /><AlertTitle>Saisie à valider</AlertTitle><AlertDescription>Vos mesures comptent une fois validées par le responsable.</AlertDescription></Alert>
          )}
          {nbAValider > 0 && peutValider && (
            <Alert><Clock3 /><AlertTitle>{nbAValider} mesure{nbAValider > 1 ? "s" : ""} du terrain à valider</AlertTitle><AlertDescription>Onglet « À valider » : elles ne comptent pas encore.</AlertDescription></Alert>
          )}

          {mode === "import" && peutSaisir && (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" asChild>
                  <label className="cursor-pointer">
                    <FileUp data-icon="inline-start" />Choisir un fichier CSV ou Excel
                    <input type="file" accept=".csv,.txt,.xlsx" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) lireFichier(f); }} />
                  </label>
                </Button>
                <span className="text-muted-foreground text-xs">Colonnes : point (code), date, heure, débit (m³/h). Sans heure : minimum de la nuit. Relevés hors de 0 h à 6 h ignorés.</span>
              </div>
              {importe && (
                <div className="flex flex-col gap-2 text-sm">
                  <p><span className="font-medium">{importe.fichier}</span> : {importe.mesures.length} mesure(s) par point et par nuit
                    ({importe.mesures.filter((m) => m.releves).length} avec relevés), {importe.ignorees} ligne(s) ignorée(s) (hors nuit ou hors campagne).</p>
                  {importe.pointsInconnus.length > 0 && <p className="text-amber-700 dark:text-amber-300">Points inconnus ou hors zone : {importe.pointsInconnus.slice(0, 10).join(", ")}{importe.pointsInconnus.length > 10 ? "…" : ""}</p>}
                  {importe.erreurs.length > 0 && <p className="text-destructive">{importe.erreurs.join(" ; ")}</p>}
                  <div className="flex gap-2">
                    <Button disabled={envoi || importe.mesures.length === 0 || importe.mesures.length > 2000} onClick={() => enregistrer(importe.mesures, "import")}>
                      <Save data-icon="inline-start" />Enregistrer l&apos;import
                    </Button>
                    <Button variant="outline" onClick={() => setImporte(null)}>Abandonner</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {erreur ? <p className="text-destructive text-sm">{erreur}</p> : !mesures ? (
            <p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement des mesures…</p>
          ) : zones.every((z) => points(z.id).length === 0) ? (
            <Vide>Aucun point de mesure dans {campagne.zone_id ? "cette zone" : "ce marché"} : ajoutez-les dans Paramètres › Débits de nuit.</Vide>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Point de mesure</th>
                    {nuits.map((n) => <th key={n} className="px-3 py-2 text-right font-medium whitespace-nowrap">Nuit du {jourFr(n).slice(0, 5)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {zones.map((z) => {
                    const pz = points(z.id);
                    if (!pz.length) return null;
                    return (
                      <Fragment key={z.id}>
                        <tr className="border-t bg-muted/30"><td colSpan={nuits.length + 1} className="px-3 py-1.5 font-medium">Zone {z.numero} – {z.libelle}
                          <span className="ml-2 font-normal text-muted-foreground text-xs">Q exigé {debit(z.q_exige_m3h, 0)} m³/h</span></td></tr>
                        {pz.map((p) => (
                          <tr key={p.id} className="border-t">
                            <td className="px-3 py-1.5"><span className="font-medium">{p.code}</span> <span className="text-muted-foreground">{p.libelle}</span>{!p.actif && <Badge variant="outline" className="ml-1">désactivé</Badge>}</td>
                            {nuits.map((n) => {
                              const m = existante(p.id, n);
                              const b = brouillon.get(cle(p.id, n));
                              const fermee = verrouillee(m);
                              const efface = !!b && "effacer" in b;
                              const avecReleves = b ? "releves" in b : m?.mode === "releves";
                              const minReleves = b && "releves" in b ? Math.min(...b.releves.map((r) => r.q)) : !b && m?.mode === "releves" ? m.minimum_m3h : null;
                              const etat = b ? <span className="size-2 rounded-full bg-sky-500" title="Modifiée, à enregistrer" />
                                : m?.validee_le ? <CircleCheck className="size-3.5 text-green-600" aria-label="Validée" />
                                : m ? <Clock3 className="size-3.5 text-amber-600" aria-label="À valider" /> : null;
                              return (
                                <td key={n} className="px-2 py-1 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {etat}
                                    {fermee && m && <Lock className="size-3 text-muted-foreground" aria-label="Non modifiable" />}
                                    {mode === "releves" || avecReleves ? (
                                      <Button variant="outline" size="sm" className="w-24 justify-end tabular-nums" onClick={() => setReleves({ point: p.id, nuit: n })}>
                                        {minReleves != null ? debit(minReleves, 2) : efface ? "retirée" : fermee ? "—" : "Saisir"}
                                      </Button>
                                    ) : (
                                      <Input inputMode="decimal" aria-label={`${p.code}, nuit du ${jourFr(n)}`} disabled={fermee}
                                        className={cn("h-8 w-24 text-right tabular-nums", b && "border-sky-500")}
                                        value={b && "minimum" in b ? b.minimum : efface ? "" : texteNombre(m?.minimum_m3h)}
                                        onChange={(e) => modifier(p.id, n, { minimum: e.target.value })} />
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        <tr className="border-t bg-muted/10">
                          <td className="px-3 py-1.5 text-muted-foreground">Débit de la zone (aperçu)</td>
                          {nuits.map((n) => {
                            const a = apercu.find((x) => x.zone_id === z.id && x.nuit === n);
                            return (
                              <td key={n} className="px-3 py-1.5 text-right tabular-nums">
                                {a?.q_zone_m3h == null ? "—" : <span title={a.approchee ? "Somme des minimums : approchée" : a.complete ? "Somme au même instant" : "Points manquants"}
                                  className={cn("font-medium", !a.complete && "text-muted-foreground")}>
                                  {a.approchee ? "≈ " : ""}{debit(a.q_zone_m3h, 2)}{a.complete ? "" : " *"}
                                </span>}
                              </td>
                            );
                          })}
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-muted-foreground text-xs">
            <CircleCheck className="inline size-3.5 text-green-600" /> validée · <Clock3 className="inline size-3.5 text-amber-600" /> à valider ·
            <span className="mx-1 inline-block size-2 rounded-full bg-sky-500" /> modifiée · « ≈ » somme des minimums (approchée) · « * » nuit incomplète (point sans mesure).
            Effacer une valeur retire la mesure.
          </p>
          {peutSaisir && mode !== "import" && (
            <div className="flex gap-2">
              <Button disabled={envoi || changements.length === 0} onClick={() => enregistrer()}>
                <Save data-icon="inline-start" />{envoi ? "Enregistrement…" : `Enregistrer${changements.length ? ` (${changements.length})` : ""}`}
              </Button>
              {changements.length > 0 && <Button variant="outline" onClick={() => setBrouillon(new Map())}>Annuler les modifications</Button>}
            </div>
          )}
        </CardContent>
      </Card>
      {releves && enCours && (
        <DialogueReleves
          titre={`${d.points.find((p) => p.id === releves.point)?.code ?? ""}, nuit du ${jourFr(releves.nuit)}`}
          initial={enCours.b ? ("releves" in enCours.b ? enCours.b.releves : null) : enCours.m?.releves ?? null}
          lecture={verrouillee(enCours.m)}
          fermer={() => setReleves(null)}
          valider={(r) => { modifier(releves.point, releves.nuit, r ? { releves: r } : null); setReleves(null); }}
        />
      )}
    </div>
  );
}
