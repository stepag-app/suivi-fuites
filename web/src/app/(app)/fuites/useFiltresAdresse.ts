'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FILTRES_VIDES, ecrireFiltres, lireFiltres, memesFiltres, type FiltresListe } from './filtres';

// Pendant une saisie (recherche, dates), l'adresse n'est réécrite qu'après une pause : une navigation par pause.
const DELAI_SAISIE_MS = 400;

/**
 * Filtres de la liste : tenus à l'écran (réaction immédiate), recopiés dans l'adresse par `router.replace`
 * (l'historique ne s'allonge pas). Une adresse changée d'ailleurs (onglet « Fuites », lien du tableau de bord)
 * est relue ; les adresses que la page vient de demander ne le sont pas (la saisie en cours serait perdue).
 */
export function useFiltresAdresse() {
  const router = useRouter();
  const chemin = usePathname();
  const adresse = useSearchParams().toString();
  const [filtres, setFiltres] = useState<FiltresListe>(() => lireFiltres(adresse));
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
  const changer = useCallback((maj: Partial<FiltresListe>, saisie = false) => {
    differer.current = saisie;
    setFiltres((f) => ({ ...f, ...maj }));
  }, []);
  const effacer = useCallback(() => changer(FILTRES_VIDES), [changer]);

  return { filtres, changer, effacer };
}
