"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getSupabase } from "@/lib/supabase";

/** Rappel sur l'écran « À valider » : mesures de nuit du terrain en attente (validées sur la page Débits de nuit). */
export function RappelDebitsAValider({ marcheId }: { marcheId: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let annule = false;
    getSupabase().from("v_debits_a_valider").select("id", { count: "exact", head: true }).eq("marche_id", marcheId)
      .then(({ count, error }) => { if (!annule && !error) setN(count ?? 0); });
    return () => { annule = true; };
  }, [marcheId]);
  if (!n) return null;
  return (
    <Alert>
      <Gauge />
      <AlertDescription>
        <span>{n} mesure{n > 1 ? "s" : ""} de débit de nuit saisie{n > 1 ? "s" : ""} sur le terrain {n > 1 ? "attendent" : "attend"} votre validation :{" "}
          <Link href="/debits?onglet=a-valider" prefetch={false} className="font-medium underline underline-offset-4">Débits de nuit › À valider</Link>.</span>
      </AlertDescription>
    </Alert>
  );
}
