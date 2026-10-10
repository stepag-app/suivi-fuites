"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Vide } from "@/components/en-tete-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ASSIETTES, MODES_POINTS, MODES_SAISIE, debit, type Assiette, type ModePoints, type ModeSaisie, type PointMesure, type ReglagesDebits,
} from "@/lib/debits";
import { messageErreur } from "@/lib/format";
import { getSupabase } from "@/lib/supabase";
import { baseAbsente, chargerDebits, type DonneesDebits } from "../debits/donnees";

const enNombre = (t: string) => (t.trim() === "" ? null : Number(t.replace(/\s/g, "").replace(",", ".")));
const texte = (n: number | null | undefined) => (n == null ? "" : String(n));

function Reglages({ d, modifiable, enregistre }: { d: DonneesDebits; modifiable: boolean; enregistre: () => void }) {
  const [r, setR] = useState<ReglagesDebits>(d.reglages);
  const [envoi, setEnvoi] = useState(false);
  const champ = (k: keyof ReglagesDebits, v: string) => setR((x) => ({ ...x, [k]: v }));
  const change = JSON.stringify(r) !== JSON.stringify(d.reglages);
  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    const valeurs = {
      ...r, debits_plafond_pct: enNombre(String(r.debits_plafond_pct)), debits_seuil_arret_pct: enNombre(String(r.debits_seuil_arret_pct)),
      debits_seuil_degradation_pct: enNombre(String(r.debits_seuil_degradation_pct)),
    };
    setEnvoi(true);
    const { error } = await getSupabase().from("marches").update(valeurs).eq("id", d.marcheId);
    setEnvoi(false);
    if (error) toast.error(messageErreur(error));
    else { toast.success("Réglages enregistrés"); enregistre(); }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Réglages du calcul</CardTitle>
        <CardDescription>Assiette et arrondi des pénalités : non écrits dans le CPS (R-CPS-150), valeurs par défaut à confirmer avec la SRM.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enregistrer} className="flex flex-col gap-4">
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="mode">Saisie proposée</FieldLabel>
              <NativeSelect id="mode" className="w-full" disabled={!modifiable} value={r.debits_mode_saisie} onChange={(e) => champ("debits_mode_saisie", e.target.value as ModeSaisie)}>
                {(Object.keys(MODES_SAISIE) as ModeSaisie[]).map((m) => <NativeSelectOption key={m} value={m}>{MODES_SAISIE[m]}</NativeSelectOption>)}
              </NativeSelect>
              <FieldDescription>Modifiable par campagne et à la saisie.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="assiette">Assiette des pénalités</FieldLabel>
              <NativeSelect id="assiette" className="w-full" disabled={!modifiable} value={r.debits_assiette} onChange={(e) => champ("debits_assiette", e.target.value as Assiette)}>
                {(Object.keys(ASSIETTES) as Assiette[]).map((m) => <NativeSelectOption key={m} value={m}>{ASSIETTES[m]}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="points">Points de pénalité</FieldLabel>
              <NativeSelect id="points" className="w-full" disabled={!modifiable} value={r.debits_points} onChange={(e) => champ("debits_points", e.target.value as ModePoints)}>
                {(Object.keys(MODES_POINTS) as ModePoints[]).map((m) => <NativeSelectOption key={m} value={m}>{MODES_POINTS[m]}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="plafond">Plafond de la pénalité (%)</FieldLabel>
              <Input id="plafond" inputMode="decimal" disabled={!modifiable} value={String(r.debits_plafond_pct)} onChange={(e) => champ("debits_plafond_pct", e.target.value)} />
              <FieldDescription>25 % (art. II-23).</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="arret">Seuil « arrêt de zone » (τ1 en %)</FieldLabel>
              <Input id="arret" inputMode="decimal" disabled={!modifiable} value={String(r.debits_seuil_arret_pct)} onChange={(e) => champ("debits_seuil_arret_pct", e.target.value)} />
              <FieldDescription>Alerte si τ1 &lt; −25 % (art. II-23).</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="degr">Seuil de dégradation des gains (%)</FieldLabel>
              <Input id="degr" inputMode="decimal" disabled={!modifiable} value={String(r.debits_seuil_degradation_pct)} onChange={(e) => champ("debits_seuil_degradation_pct", e.target.value)} />
              <FieldDescription>Alerte au-delà de 25 % du gain (art. II-15).</FieldDescription>
            </Field>
          </FieldGroup>
          {modifiable && <div><Button type="submit" disabled={!change || envoi}><Save data-icon="inline-start" />Enregistrer les réglages</Button></div>}
        </form>
      </CardContent>
    </Card>
  );
}

function TableauN1({ d, modifiable, enregistre }: { d: DonneesDebits; modifiable: boolean; enregistre: () => void }) {
  type Saisie = { q_exige_m3h: string; q_plus_bas_historique_m3h: string; q_actuel_m3h: string; balayage_acheve_le: string };
  const initial = () => Object.fromEntries(d.zones.map((z) => [z.id, {
    q_exige_m3h: texte(z.q_exige_m3h), q_plus_bas_historique_m3h: texte(z.q_plus_bas_historique_m3h), q_actuel_m3h: texte(z.q_actuel_m3h),
    balayage_acheve_le: z.balayage_acheve_le ?? "",
  }])) as Record<string, Saisie>;
  const [v, setV] = useState(initial);
  const [envoi, setEnvoi] = useState(false);
  const modifiees = d.zones.filter((z) => {
    const x = v[z.id];
    return x && (enNombre(x.q_exige_m3h) !== z.q_exige_m3h || enNombre(x.q_plus_bas_historique_m3h) !== (z.q_plus_bas_historique_m3h ?? null)
      || enNombre(x.q_actuel_m3h) !== (z.q_actuel_m3h ?? null) || (x.balayage_acheve_le || null) !== (z.balayage_acheve_le ?? null));
  });
  async function enregistrer() {
    setEnvoi(true);
    for (const z of modifiees) {
      const x = v[z.id];
      const { error } = await getSupabase().from("zones").update({
        q_exige_m3h: enNombre(x.q_exige_m3h), q_plus_bas_historique_m3h: enNombre(x.q_plus_bas_historique_m3h),
        q_actuel_m3h: enNombre(x.q_actuel_m3h), balayage_acheve_le: x.balayage_acheve_le || null,
      }).eq("id", z.id);
      if (error) { toast.error(`Zone ${z.numero} : ${messageErreur(error)}`); setEnvoi(false); return; }
    }
    setEnvoi(false);
    toast.success("Tableau n° 1 enregistré");
    enregistre();
  }
  const cellule = (id: string, k: keyof Saisie, type = "text") => (
    <Input type={type} inputMode={type === "text" ? "decimal" : undefined} disabled={!modifiable} className="h-8 text-right tabular-nums"
      value={v[id]?.[k] ?? ""} onChange={(e) => setV((x) => ({ ...x, [id]: { ...x[id], [k]: e.target.value } }))} />
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Débits de référence par zone (tableau n° 1)</CardTitle>
        <CardDescription>Q exigé à l&apos;achèvement du balayage, plus bas historique et débit actuel (m³/h) ; date d&apos;achèvement du balayage de chaque zone.</CardDescription>
        {modifiable && <CardAction><Button size="sm" disabled={!modifiees.length || envoi} onClick={enregistrer}><Save data-icon="inline-start" />Enregistrer{modifiees.length ? ` (${modifiees.length})` : ""}</Button></CardAction>}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zone</TableHead>
              <TableHead className="text-right">Linéaire (km)</TableHead>
              <TableHead className="w-28 text-right">Q exigé</TableHead>
              <TableHead className="w-28 text-right">Plus bas historique</TableHead>
              <TableHead className="w-28 text-right">Débit actuel</TableHead>
              <TableHead className="w-40">Balayage achevé le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.zones.map((z) => (
              <TableRow key={z.id}>
                <TableCell><span className="font-medium">Zone {z.numero}</span> <span className="text-muted-foreground">{z.libelle}</span>{z.actif === false && <Badge variant="outline" className="ml-1">inactive</Badge>}</TableCell>
                <TableCell className="text-right tabular-nums">{z.lineaire_m == null ? "—" : debit(z.lineaire_m / 1000, 1)}</TableCell>
                <TableCell>{cellule(z.id, "q_exige_m3h")}</TableCell>
                <TableCell>{cellule(z.id, "q_plus_bas_historique_m3h")}</TableCell>
                <TableCell>{cellule(z.id, "q_actuel_m3h")}</TableCell>
                <TableCell>{cellule(z.id, "balayage_acheve_le", "date")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Phases({ d, modifiable, enregistre }: { d: DonneesDebits; modifiable: boolean; enregistre: () => void }) {
  const [v, setV] = useState(() => Object.fromEntries(d.phases.map((p) => [p.id, { debut: p.date_debut ?? "", fin: p.date_fin ?? "" }])));
  const modifiees = d.phases.filter((p) => (v[p.id]?.debut || null) !== p.date_debut || (v[p.id]?.fin || null) !== p.date_fin);
  async function enregistrer() {
    for (const p of modifiees) {
      const { error } = await getSupabase().from("phases").update({ date_debut: v[p.id].debut || null, date_fin: v[p.id].fin || null }).eq("id", p.id);
      if (error) { toast.error(`${p.libelle} : ${messageErreur(error)}`); return; }
    }
    toast.success("Phases enregistrées");
    enregistre();
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Phases du marché</CardTitle>
        <CardDescription>Balayage (4 mois), puis deux phases de maintien de 4 mois (art. II-14) : la pénalité de maintien est définitive à la fin du maintien.</CardDescription>
        {modifiable && <CardAction><Button size="sm" disabled={!modifiees.length} onClick={enregistrer}><Save data-icon="inline-start" />Enregistrer</Button></CardAction>}
      </CardHeader>
      <CardContent>
        {d.phases.length === 0 ? <Vide className="h-24">Aucune phase définie pour ce marché.</Vide> : (
          <Table>
            <TableHeader><TableRow><TableHead>Phase</TableHead><TableHead className="w-44">Début</TableHead><TableHead className="w-44">Fin</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.phases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.libelle}</TableCell>
                  <TableCell><Input type="date" className="h-8" disabled={!modifiable} value={v[p.id]?.debut ?? ""} onChange={(e) => setV((x) => ({ ...x, [p.id]: { ...x[p.id], debut: e.target.value } }))} /></TableCell>
                  <TableCell><Input type="date" className="h-8" disabled={!modifiable} value={v[p.id]?.fin ?? ""} onChange={(e) => setV((x) => ({ ...x, [p.id]: { ...x[p.id], fin: e.target.value } }))} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

type FormPoint = { code: string; libelle: string; zone_id: string; secteur_id: string; equipement: string; observation: string; ordre: string; actif: boolean };

function DialoguePoint({ d, point, fermer, enregistre }: { d: DonneesDebits; point: PointMesure | null; fermer: () => void; enregistre: () => void }) {
  const [f, setF] = useState<FormPoint>({
    code: point?.code ?? "", libelle: point?.libelle ?? "", zone_id: point?.zone_id ?? d.zones[0]?.id ?? "", secteur_id: point?.secteur_id ?? "",
    equipement: point?.equipement ?? "", observation: point?.observation ?? "", ordre: String(point?.ordre ?? 0), actif: point?.actif ?? true,
  });
  const [envoi, setEnvoi] = useState(false);
  const champ = (k: keyof FormPoint, v: string | boolean) => setF((x) => ({ ...x, [k]: v, ...(k === "zone_id" ? { secteur_id: "" } : {}) }));
  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    const valeurs = {
      code: f.code.trim(), libelle: f.libelle.trim(), zone_id: f.zone_id, secteur_id: f.secteur_id || null, equipement: f.equipement.trim() || null,
      observation: f.observation.trim() || null, ordre: Number(f.ordre) || 0, actif: f.actif,
    };
    const sb = getSupabase();
    const { error } = point ? await sb.from("points_mesure").update(valeurs).eq("id", point.id) : await sb.from("points_mesure").insert({ ...valeurs, marche_id: d.marcheId });
    setEnvoi(false);
    if (error) { toast.error(error.code === "23505" ? "Ce code de point existe déjà dans le marché." : messageErreur(error)); return; }
    toast.success(point ? "Point de mesure modifié" : "Point de mesure ajouté");
    enregistre();
    fermer();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={enregistrer} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{point ? `Point ${point.code}` : "Nouveau point de mesure"}</DialogTitle>
            <DialogDescription>Ouvrage de comptage de la SRM (télé-relève, débitmètre de secteur) ; le débit de la zone est la somme de ses points.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <Field><FieldLabel htmlFor="code">Code</FieldLabel><Input id="code" required maxLength={30} value={f.code} onChange={(e) => champ("code", e.target.value)} /></Field>
              <Field><FieldLabel htmlFor="lib">Libellé</FieldLabel><Input id="lib" required maxLength={120} value={f.libelle} onChange={(e) => champ("libelle", e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="zone">Zone</FieldLabel>
                <NativeSelect id="zone" className="w-full" value={f.zone_id} onChange={(e) => champ("zone_id", e.target.value)}>
                  {d.zones.map((z) => <NativeSelectOption key={z.id} value={z.id}>Zone {z.numero} – {z.libelle}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="secteur">Secteur (facultatif)</FieldLabel>
                <NativeSelect id="secteur" className="w-full" value={f.secteur_id} onChange={(e) => champ("secteur_id", e.target.value)}>
                  <NativeSelectOption value="">—</NativeSelectOption>
                  {d.secteurs.filter((s) => s.zone_id === f.zone_id).map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.code} – {s.libelle}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
            </div>
            <Field><FieldLabel htmlFor="eq">Équipement</FieldLabel><Input id="eq" maxLength={120} placeholder="Débitmètre électromagnétique, télé-relève…" value={f.equipement} onChange={(e) => champ("equipement", e.target.value)} /></Field>
            <Field><FieldLabel htmlFor="obs">Observation</FieldLabel><Input id="obs" maxLength={200} value={f.observation} onChange={(e) => champ("observation", e.target.value)} /></Field>
            <div className="grid grid-cols-2 items-end gap-3">
              <Field><FieldLabel htmlFor="ordre">Ordre</FieldLabel><Input id="ordre" inputMode="numeric" value={f.ordre} onChange={(e) => champ("ordre", e.target.value)} /></Field>
              <Field orientation="horizontal"><Switch id="actif" checked={f.actif} onCheckedChange={(v) => champ("actif", v)} /><FieldLabel htmlFor="actif">Actif</FieldLabel></Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
            <Button type="submit" disabled={envoi || !f.code.trim() || !f.libelle.trim() || !f.zone_id}>{envoi ? "Enregistrement…" : "Enregistrer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Points({ d, peutCreer, peutModifier, enregistre }: { d: DonneesDebits; peutCreer: boolean; peutModifier: boolean; enregistre: () => void }) {
  const [edition, setEdition] = useState<PointMesure | "nouveau" | null>(null);
  const zones = d.zones.filter((z) => d.points.some((p) => p.zone_id === z.id) || z.actif !== false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Points de mesure</CardTitle>
        <CardDescription>{d.points.length} point{d.points.length > 1 ? "s" : ""}, dont {d.points.filter((p) => p.actif).length} actif{d.points.filter((p) => p.actif).length > 1 ? "s" : ""}. Un point désactivé n&apos;est plus attendu dans les nuits suivantes ; ses mesures restent.</CardDescription>
        {peutCreer && <CardAction><Button size="sm" disabled={!d.zones.length} onClick={() => setEdition("nouveau")}><Plus data-icon="inline-start" />Point</Button></CardAction>}
      </CardHeader>
      <CardContent>
        {d.points.length === 0 ? <Vide className="h-24">Aucun point de mesure : ajoutez les ouvrages de comptage de chaque zone (liste à demander à la SRM).</Vide> : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Zone</TableHead><TableHead>Code</TableHead><TableHead>Libellé</TableHead><TableHead>Secteur</TableHead><TableHead>Équipement</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {zones.flatMap((z) => d.points.filter((p) => p.zone_id === z.id).map((p) => (
                <TableRow key={p.id} className={p.actif ? "" : "text-muted-foreground"}>
                  <TableCell>Zone {z.numero}</TableCell>
                  <TableCell className="font-medium">{p.code}{!p.actif && <Badge variant="outline" className="ml-1">inactif</Badge>}</TableCell>
                  <TableCell>{p.libelle}</TableCell>
                  <TableCell>{d.secteurs.find((s) => s.id === p.secteur_id)?.libelle ?? "—"}</TableCell>
                  <TableCell className="max-w-64 truncate">{p.equipement ?? "—"}</TableCell>
                  <TableCell className="text-right">{peutModifier && <Button variant="ghost" size="icon-sm" aria-label={`Modifier ${p.code}`} onClick={() => setEdition(p)}><Pencil /></Button>}</TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {edition && <DialoguePoint d={d} point={edition === "nouveau" ? null : edition} fermer={() => setEdition(null)} enregistre={enregistre} />}
    </Card>
  );
}

/** Paramètres › Débits de nuit (S15, D1 et D5) : réglages, tableau n° 1, phases, points de mesure. */
export function OngletDebits({ marcheId, peutCreer, peutModifier }: { marcheId: string; peutCreer: boolean; peutModifier: boolean }) {
  const [d, setD] = useState<DonneesDebits | null>(null);
  const [erreur, setErreur] = useState("");
  const [version, setVersion] = useState(0);
  const charger = useCallback(async () => {
    try {
      setD(await chargerDebits(marcheId, false));
      setVersion((v) => v + 1);
    } catch (e) {
      setErreur(baseAbsente(e) ? "La migration des débits de nuit n'est pas encore déployée sur la base." : messageErreur(e));
    }
  }, [marcheId]);
  useEffect(() => { charger(); }, [charger]);
  if (erreur) return <Alert variant="destructive"><AlertTitle>Débits de nuit</AlertTitle><AlertDescription>{erreur}</AlertDescription></Alert>;
  if (!d) return <p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement…</p>;
  return (
    <div className="flex flex-col gap-4">
      <Points d={d} peutCreer={peutCreer} peutModifier={peutModifier} enregistre={charger} />
      <TableauN1 key={`t${version}`} d={d} modifiable={peutModifier} enregistre={charger} />
      <Reglages key={`r${version}`} d={d} modifiable={peutModifier} enregistre={charger} />
      <Phases key={`p${version}`} d={d} modifiable={peutModifier} enregistre={charger} />
    </div>
  );
}
