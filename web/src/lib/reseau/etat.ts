// État de balayage des tronçons : lignes de `etat_balayage` → états par identifiant, posés par
// `setFeatureState` sur les sources (la géométrie en cache ne change pas). Fonctions pures.
import { dateSeule } from '@/lib/format';
import type { EtatBalayageTroncon } from '@/lib/types';
import type { EtatFeature } from './types';

export interface NomsBalayage {
  agents?: Map<string, string>;
}

/** Fusion : un état par tronçon balayé ; un tronçon absent n'a pas d'état (= non balayé). */
export function etatsFeatures(lignes: EtatBalayageTroncon[], noms: NomsBalayage = {}): Map<string, EtatFeature> {
  const etats = new Map<string, EtatFeature>();
  for (const l of lignes) {
    const passages = Number(l.nb_passages) || 0;
    if (passages <= 0) continue;
    etats.set(l.troncon_id, {
      balaye: true,
      repasse: passages > 1,
      passages,
      premier: l.premier_le ?? null,
      dernier: l.dernier_le ?? l.premier_le ?? null,
      agent: l.agent_id ? noms.agents?.get(l.agent_id) ?? null : null,
    });
  }
  return etats;
}

/** Ce qu'il faut poser ou retirer sur la carte quand l'état est relu (seulement les différences). */
export function differencesEtats(anciens: Map<string, EtatFeature>, nouveaux: Map<string, EtatFeature>): { poser: string[]; retirer: string[] } {
  const poser: string[] = [];
  const retirer: string[] = [];
  for (const [id, e] of nouveaux) {
    const a = anciens.get(id);
    if (!a || a.passages !== e.passages || a.dernier !== e.dernier || a.agent !== e.agent) poser.push(id);
  }
  for (const id of anciens.keys()) if (!nouveaux.has(id)) retirer.push(id);
  return { poser, retirer };
}

/** « Balayé le 05/10/2026 par Ahmed, 2 passages » ou « Non balayé ». */
export function texteEtatTroncon(etat: EtatFeature | undefined): string {
  if (!etat || !etat.balaye) return 'Non balayé';
  const qui = etat.agent ?? '';
  const quand = etat.dernier ? dateSeule(etat.dernier) : '—';
  const base = `Balayé le ${quand}${qui ? ` par ${qui}` : ''}`;
  return etat.passages > 1 ? `${base} · ${etat.passages} passages` : base;
}

/** Compteurs pour la légende « par balayage » d'un ensemble de tronçons affichés. */
export function compterEtats(ids: Iterable<string>, etats: Map<string, EtatFeature>): Map<string, number> {
  let balaye = 0;
  let repasse = 0;
  let non = 0;
  for (const id of ids) {
    const e = etats.get(id);
    if (!e) non++;
    else if (e.repasse) repasse++;
    else balaye++;
  }
  return new Map([['balaye', balaye], ['repasse', repasse], ['non_balaye', non]]);
}
