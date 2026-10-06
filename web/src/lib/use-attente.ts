"use client";

import { useEffect, useState } from "react";
import { compterAttente, ecouterAttente } from "./hors-ligne";

/** Nombre de fuites saisies sur l'appareil et pas encore envoyées. */
export function useEnvoisEnAttente(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let actif = true;
    const lire = () => compterAttente().then((x) => actif && setN(x)).catch(() => undefined);
    lire();
    const arreter = ecouterAttente(lire);
    return () => {
      actif = false;
      arreter();
    };
  }, []);
  return n;
}
