// R4 : dans tout document imprimé ou exporté (PDF, Excel, Word, CSV), le matricule remplace le nom des agents et
// des ouvriers ; le nom reste à l'écran. Sans matricule saisi, le nom est gardé (rien ne disparaît du document).
import { getSupabase } from '@/lib/supabase';

export interface Personne { id: string; nom_complet: string | null; matricule?: string | null }

export interface Matricules {
  /** Agent (compte) désigné par son identifiant ; `nom` sert de repli si le compte est introuvable. */
  agent: (id: unknown, nom?: unknown) => string | null;
  /** Agent connu seulement par son nom (vues qui ne donnent pas l'identifiant) ; homonymes : le nom est gardé. */
  agentParNom: (nom: unknown) => string | null;
  ouvrier: (id: unknown, nom?: unknown) => string | null;
}

const texte = (v: unknown) => (v == null || v === '' ? null : String(v));

export function indexMatricules(profils: Personne[], ouvriers: Personne[]): Matricules {
  const parId = (liste: Personne[]) => new Map(liste.map((p) => [p.id, p]));
  const agents = parId(profils);
  const ouvriersParId = parId(ouvriers);
  const parNom = new Map<string, string | null>();
  profils.forEach((p) => {
    if (!p.nom_complet) return;
    parNom.set(p.nom_complet, parNom.has(p.nom_complet) ? null : texte(p.matricule));
  });
  const choisir = (p: Personne | undefined, nom: unknown) => texte(p?.matricule) ?? texte(p?.nom_complet) ?? texte(nom);
  return {
    agent: (id, nom) => choisir(agents.get(String(id)), nom),
    agentParNom: (nom) => {
      const n = texte(nom);
      return n ? parNom.get(n) ?? n : null;
    },
    ouvrier: (id, nom) => choisir(ouvriersParId.get(String(id)), nom),
  };
}

// Base pas encore à jour (colonne matricule absente) : les noms restent, l'export ne bloque pas.
async function lirePersonnes(table: 'profils' | 'ouvriers', marcheId?: string): Promise<Personne[]> {
  const sb = getSupabase();
  const requete = (colonnes: string) => {
    const q = sb.from(table).select(colonnes);
    return marcheId ? q.eq('marche_id', marcheId) : q;
  };
  const r = await requete('id, nom_complet, matricule');
  if (!r.error) return (r.data as unknown as Personne[] | null) ?? [];
  const repli = await requete('id, nom_complet');
  return (repli.data as unknown as Personne[] | null) ?? [];
}

export async function chargerMatricules(marcheId: string): Promise<Matricules> {
  const [profils, ouvriers] = await Promise.all([lirePersonnes('profils'), lirePersonnes('ouvriers', marcheId)]);
  return indexMatricules(profils, ouvriers);
}
