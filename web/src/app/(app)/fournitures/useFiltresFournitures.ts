'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FILTRES_VIDES, ecrireFiltres, lireFiltres, memesFiltres, type FiltresInventaire } from './inventaire';

// Pendant une saisie (dates, N° de fuite), l'adresse n'est réécrite qu'après une pause : une navigation par pause.
const DELAI_SAISIE_MS = 400;

/**
 * Filtres de l'inventaire tenus à l'écran et recopiés dans l'adresse par `router.replace` (même mécanique que la
 * liste des fuites, src/app/(app)/fuites/useFiltresAdresse.ts) : une adresse changée d'ailleurs (lien du tableau
 * de bord, onglet « Fournitures ») est relue ; celles que la page vient de demander ne le sont pas.
 */
export function useFiltresFournitures() {
  const router = useRouter();
  const chemin = usePathname();
  const adresse = useSearchParams().toString();
  const [filtres, setFiltres] = useState<FiltresInventaire>(() => lireFiltres(adresse));
  const demandees = useRef<string[]>([]);
  const recue = useRef(adresse);
  const differer = useRef(false);

  useEffect(() => {
    recue.current = adresse;
    const i = demandees.current.indexOf(adresse);
    if (i >= 0) {
      demandees.current = demandees.current.slice(i + 1);
      return;
    }
    demandees.current = [];
    const lus = lireFiltres(adresse);
    setFiltres((f) => (memesFiltres(f, lus) ? f : lus));
  }, [adresse]);

  useEffect(() => {
    const delai = differer.current ? DELAI_SAISIE_MS : 0;
    differer.current = false;
    const q = ecrireFiltres(filtres);
    const attendue = demandees.current.at(-1) ?? recue.current;
    if (q === ecrireFiltres(lireFiltres(attendue))) return;
    const minuterie = window.setTimeout(() => {
      demandees.current = [...demandees.current, q];
      router.replace(q ? `${chemin}?${q}` : chemin, { scroll: false });
    }, delai);
    return () => window.clearTimeout(minuterie);
  }, [filtres, router, chemin]);

  /** `saisie` : frappe en cours, l'adresse attendra la pause. */
  const changer = useCallback((maj: Partial<FiltresInventaire>, saisie = false) => {
    differer.current = saisie;
    setFiltres((f) => ({ ...f, ...maj }));
  }, []);
  /** Retire les filtres rapides ; la période et les dimensions du tableau restent. */
  const effacerRapides = useCallback(
    () => changer({ zone: '', secteur: '', chef: '', famille: '', provenance: '', fuite: '' }),
    [changer],
  );
  const effacerTout = useCallback(() => changer(FILTRES_VIDES), [changer]);

  return { filtres, changer, effacerRapides, effacerTout };
}
