import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Lecture arrêtée au plafond de lireTout : la page ne montre qu'une partie des lignes (les plus récentes, lues
 * par numéro décroissant). Compteurs, courbes et listes de la page portent sur ces lignes seulement : le dire
 * plutôt que tronquer en silence.
 */
export function AvertissementPlafond({ lues, total, unite = "fuites", conseil = "Ce sont les plus récentes : les plus anciennes ne sont ni affichées ni comptées ici." }: {
  lues: number; total?: number | null; unite?: string; conseil?: string;
}) {
  const n = (x: number) => x.toLocaleString("fr-FR");
  return (
    <Alert role="status">
      <TriangleAlert />
      <AlertTitle>Affichage incomplet</AlertTitle>
      <AlertDescription>
        {n(lues)} {unite} chargées{total != null && total > lues ? ` sur ${n(total)}` : " (il en reste d'autres)"} : les chiffres de cette page
        ne portent que sur elles. {conseil}
      </AlertDescription>
    </Alert>
  );
}
