"use client";

import { useState, type FormEvent } from "react";
import { FileDown, FileSpreadsheet, Paperclip, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Vide } from "@/components/en-tete-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  MODES_SAISIE, TYPES_CAMPAGNE, dateFinDefaut, debit, jourFr, type Campagne, type ModeSaisie, type TypeCampagne,
} from "@/lib/debits";
import { messageErreur } from "@/lib/format";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { chargerMesures, ouvrirPieceJointe, type DonneesDebits } from "./donnees";

const aujourdhui = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function NouvelleCampagne({ d, ouvert, fermer, creee }: { d: DonneesDebits; ouvert: boolean; fermer: () => void; creee: (id: string) => void }) {
  const [type, setType] = useState<TypeCampagne>("maintien");
  const [zone, setZone] = useState("");
  const [debut, setDebut] = useState(aujourdhui());
  const [fin, setFin] = useState("");
  const [libelle, setLibelle] = useState("");
  const [mode, setMode] = useState<"" | ModeSaisie>("");
  const [observation, setObservation] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const finProposee = dateFinDefaut(type, debut);

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    const { data, error } = await getSupabase().from("campagnes_debit").insert({
      marche_id: d.marcheId, type, zone_id: zone || null, date_debut: debut, date_fin: fin || finProposee,
      libelle: libelle.trim() || null, mode_saisie: mode || null, observation: observation.trim() || null,
    }).select("id").single();
    setEnvoi(false);
    if (error) { toast.error(messageErreur(error)); return; }
    toast.success("Campagne créée");
    creee((data as { id: string }).id);
  }

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={enregistrer} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Nouvelle campagne de mesure</DialogTitle>
            <DialogDescription>{TYPES_CAMPAGNE[type].aide}.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="type">Type</FieldLabel>
              <NativeSelect id="type" className="w-full" value={type} onChange={(e) => setType(e.target.value as TypeCampagne)}>
                {(Object.keys(TYPES_CAMPAGNE) as TypeCampagne[]).map((t) => <NativeSelectOption key={t} value={t}>{TYPES_CAMPAGNE[t].libelle}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="zone">Zone</FieldLabel>
              <NativeSelect id="zone" className="w-full" value={zone} onChange={(e) => setZone(e.target.value)}>
                <NativeSelectOption value="">Toutes les zones</NativeSelectOption>
                {d.zones.filter((z) => z.actif !== false).map((z) => <NativeSelectOption key={z.id} value={z.id}>Zone {z.numero} – {z.libelle}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="debut">Première nuit</FieldLabel>
                <Input id="debut" type="date" required value={debut} onChange={(e) => setDebut(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="fin">Dernière nuit</FieldLabel>
                <Input id="fin" type="date" min={debut} value={fin || finProposee} onChange={(e) => setFin(e.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="libelle">Libellé (facultatif)</FieldLabel>
              <Input id="libelle" value={libelle} maxLength={120} placeholder={TYPES_CAMPAGNE[type].libelle} onChange={(e) => setLibelle(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="mode">Saisie proposée</FieldLabel>
              <NativeSelect id="mode" className="w-full" value={mode} onChange={(e) => setMode(e.target.value as "" | ModeSaisie)}>
                <NativeSelectOption value="">Réglage du marché ({MODES_SAISIE[d.reglages.debits_mode_saisie].toLowerCase()})</NativeSelectOption>
                {(Object.keys(MODES_SAISIE) as ModeSaisie[]).map((m) => <NativeSelectOption key={m} value={m}>{MODES_SAISIE[m]}</NativeSelectOption>)}
              </NativeSelect>
              <FieldDescription>Les trois modes restent possibles à la saisie.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="obs">Observation</FieldLabel>
              <Textarea id="obs" rows={2} value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="État des vannes de séparation, agents présents…" />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi || !debut}>{envoi ? "Création…" : "Créer la campagne"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export async function exporterProcesVerbal(d: DonneesDebits, c: Campagne, format: "pdf" | "xlsx") {
  const [{ documentProcesVerbal }, { exporter }, { chargerContexteRapport }] = await Promise.all([
    import("./documents"), import("@/lib/export/generer"), import("@/lib/export/rapport-fuite"),
  ]);
  const [ctx, mesures] = await Promise.all([chargerContexteRapport(d.marcheId, false), chargerMesures(c.id)]);
  const detail = mesures.some((m) => m.mode === "releves");
  await exporter(documentProcesVerbal(ctx, c, d.zones, d.points, mesures, { detail, orientation: "portrait" }), format);
}

export function Campagnes({ d, peutGerer, peutExporter, ouvrir, actualiser }: {
  d: DonneesDebits; peutGerer: boolean; peutExporter: boolean; ouvrir: (id: string) => void; actualiser: () => void;
}) {
  const [nouvelle, setNouvelle] = useState(false);
  const [occupe, setOccupe] = useState("");

  async function supprimer(c: Campagne) {
    if (!window.confirm(`Supprimer la campagne « ${c.libelle || TYPES_CAMPAGNE[c.type].libelle} » ? Ses mesures ne compteront plus.`)) return;
    const { error } = await getSupabase().from("campagnes_debit").update({ supprime_le: new Date().toISOString() }).eq("id", c.id);
    if (error) toast.error(messageErreur(error));
    else { toast.success("Campagne supprimée"); actualiser(); }
  }
  async function document(c: Campagne, format: "pdf" | "xlsx") {
    setOccupe(`${c.id}|${format}`);
    try {
      await exporterProcesVerbal(d, c, format);
    } catch (e) {
      toast.error(messageErreur(e));
    }
    setOccupe("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campagnes de mesure</CardTitle>
        <CardDescription>Avant intervention (Qi), après balayage (Qf), contrôles de maintien hebdomadaires, mesures libres. Ouvrir une campagne pour saisir ou importer.</CardDescription>
        {peutGerer && (
          <CardAction><Button onClick={() => setNouvelle(true)}><Plus data-icon="inline-start" />Nouvelle campagne</Button></CardAction>
        )}
      </CardHeader>
      <CardContent>
        {d.campagnes.length === 0 ? <Vide>Aucune campagne. {peutGerer ? "Créez la première (avant intervention)." : ""}</Vide> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campagne</TableHead>
                <TableHead>Nuits</TableHead>
                <TableHead>Zones</TableHead>
                <TableHead>Résultat par zone (m³/h)</TableHead>
                <TableHead>Procès-verbal</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.campagnes.map((c) => {
                const res = d.camps.filter((x) => x.campagne_id === c.id);
                const aValider = res.reduce((t, x) => t + x.nb_a_valider, 0);
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => ouvrir(c.id)}>
                    <TableCell>
                      <span className="font-medium">{c.libelle || TYPES_CAMPAGNE[c.type].libelle}</span>
                      <span className="block text-muted-foreground text-xs">{TYPES_CAMPAGNE[c.type].libelle}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{c.date_debut === c.date_fin ? jourFr(c.date_debut) : `${jourFr(c.date_debut)} → ${jourFr(c.date_fin)}`}</TableCell>
                    <TableCell>{c.zone_id ? `Zone ${d.zones.find((z) => z.id === c.zone_id)?.numero ?? "?"}` : "Toutes"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {res.map((x) => (
                          <Badge key={x.zone_id} variant="outline" className={cn("tabular-nums", x.q_m3h == null && "text-muted-foreground")}
                            title={x.q_m3h == null ? "Aucune nuit complète" : `${x.nb_nuits_completes} nuit(s) complète(s)${x.approchee ? ", valeur approchée" : ""}`}>
                            Z{x.zone_numero} {x.q_m3h == null ? "—" : `${x.approchee ? "≈" : ""}${debit(x.q_m3h)}`}
                          </Badge>
                        ))}
                        {aValider > 0 && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">{aValider} à valider</Badge>}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {c.pv_chemin
                        ? <Button variant="link" size="sm" className="h-auto p-0" onClick={() => ouvrirPieceJointe(c.pv_chemin!).catch((e) => toast.error(messageErreur(e)))}><Paperclip data-icon="inline-start" />Signé{c.pv_signe_le ? ` le ${jourFr(c.pv_signe_le)}` : ""}</Button>
                        : <span className="text-muted-foreground text-xs">Non joint</span>}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {peutExporter && <>
                          <Button variant="ghost" size="sm" disabled={!!occupe} onClick={() => document(c, "pdf")} title="Procès-verbal A4 (PDF)">
                            <FileDown data-icon="inline-start" />{occupe === `${c.id}|pdf` ? "…" : "PV"}
                          </Button>
                          <Button variant="ghost" size="icon-sm" disabled={!!occupe} onClick={() => document(c, "xlsx")} title="Procès-verbal (Excel)" aria-label="Procès-verbal Excel">
                            <FileSpreadsheet />
                          </Button>
                        </>}
                        {peutGerer && (
                          <Button variant="ghost" size="icon-sm" onClick={() => supprimer(c)} title="Supprimer la campagne" aria-label="Supprimer la campagne"><Trash2 /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <NouvelleCampagne d={d} ouvert={nouvelle} fermer={() => setNouvelle(false)} creee={(id) => { setNouvelle(false); actualiser(); ouvrir(id); }} />
    </Card>
  );
}
