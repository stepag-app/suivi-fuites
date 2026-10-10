"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Vide } from "@/components/en-tete-page";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TYPES_CAMPAGNE, debit, jourFr, type Releve, type TypeCampagne } from "@/lib/debits";
import { dateHeure, messageErreur } from "@/lib/format";
import { getSupabase } from "@/lib/supabase";

interface LigneAValider {
  id: string; campagne_id: string; campagne_type: TypeCampagne; campagne_libelle: string | null; point_code: string; point_libelle: string;
  zone_numero: number | null; nuit: string; mode: "minimum" | "releves"; minimum_m3h: number; releves: Releve[] | null;
  auteur: string | null; source_saisie: string; cree_le: string; observation: string | null;
}

/** Mesures de nuit saisies sur le terrain, à valider par le responsable (circuit V1, `valider_etapes` étape « debit »). */
export function AValider({ marcheId, ouvrir, actualiser }: { marcheId: string; ouvrir: (campagne: string) => void; actualiser: () => void }) {
  const [lignes, setLignes] = useState<LigneAValider[] | null>(null);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    const { data, error } = await getSupabase().from("v_debits_a_valider").select("*").eq("marche_id", marcheId).order("nuit").order("point_code");
    if (error) setErreur(messageErreur(error));
    else { setLignes((data as LigneAValider[] | null) ?? []); setCoches(new Set()); }
  }, [marcheId]);
  useEffect(() => { charger(); }, [charger]);

  async function valider() {
    setEnvoi(true);
    const { data, error } = await getSupabase().rpc("valider_etapes", { p_elements: [...coches].map((id) => ({ etape: "debit", id })) });
    setEnvoi(false);
    if (error) { toast.error(messageErreur(error)); return; }
    toast.success(`${data ?? 0} mesure(s) validée(s)`);
    await charger();
    actualiser();
  }

  const tout = !!lignes?.length && coches.size === lignes.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mesures du terrain à valider</CardTitle>
        <CardDescription>Une mesure saisie sur la tablette compte dans les calculs une fois validée (circuit V1). Pour corriger une valeur, ouvrir la campagne.</CardDescription>
        <CardAction>
          <Button disabled={envoi || coches.size === 0} onClick={valider}><CheckCheck data-icon="inline-start" />Valider ({coches.size})</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {erreur ? <p className="text-destructive text-sm">{erreur}</p> : !lignes ? (
          <p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement…</p>
        ) : lignes.length === 0 ? <Vide>Aucune mesure à valider.</Vide> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"><Checkbox aria-label="Tout cocher" checked={tout} onCheckedChange={() => setCoches(tout ? new Set() : new Set(lignes.map((l) => l.id)))} /></TableHead>
                <TableHead>Nuit</TableHead>
                <TableHead>Point</TableHead>
                <TableHead>Campagne</TableHead>
                <TableHead className="text-right">Débit (m³/h)</TableHead>
                <TableHead>Saisie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lignes.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Checkbox aria-label={`Cocher ${l.point_code} du ${jourFr(l.nuit)}`} checked={coches.has(l.id)}
                      onCheckedChange={() => setCoches((c) => { const s = new Set(c); if (s.has(l.id)) s.delete(l.id); else s.add(l.id); return s; })} />
                  </TableCell>
                  <TableCell className="tabular-nums">{jourFr(l.nuit)}</TableCell>
                  <TableCell><span className="font-medium">{l.point_code}</span> <span className="text-muted-foreground">{l.point_libelle}</span>
                    <span className="block text-muted-foreground text-xs">Zone {l.zone_numero}</span></TableCell>
                  <TableCell>
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => ouvrir(l.campagne_id)}>{l.campagne_libelle || TYPES_CAMPAGNE[l.campagne_type].libelle}</Button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {debit(Number(l.minimum_m3h), 2)}
                    <span className="block text-muted-foreground text-xs">{l.mode === "releves" ? `minimum de ${l.releves?.length ?? 0} relevés` : "minimum saisi"}</span>
                  </TableCell>
                  <TableCell className="text-sm">{l.auteur ?? "—"}<span className="block text-muted-foreground text-xs">{l.source_saisie} · {dateHeure(l.cree_le)}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
