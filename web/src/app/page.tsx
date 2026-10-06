"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/session";

export default function Accueil() {
  const { chargement, session } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!chargement) router.replace(session ? "/tableau-de-bord" : "/connexion");
  }, [chargement, session, router]);
  return (
    <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground text-sm">
      <Spinner /> Chargement…
    </div>
  );
}
