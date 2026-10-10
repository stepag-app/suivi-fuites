// Écran Rapports (J1) : lecture des données de la période et des modèles du marché. Toutes les rubriques visibles sont
// lues une fois par période ; filtres, rubriques et colonnes s'appliquent ensuite sans relire (rapports.ts).
// R4 : agents et chefs d'équipe désignés par leur matricule dans les lignes du document.
import { LIBELLES_FAMILLES } from '@/lib/nomenclature/csv';
import { getSupabase, lireTout } from '@/lib/supabase';
import { chargerMatricules, type Matricules } from './matricules';
import type { Ligne } from './modele';
import {
  NOM_DERNIER_CHOIX, ajouterJours, depuisModele, enAlerte, estDernierChoix, estModeleRapport, jourCasablanca, versModele,
  type ChoixRapport, type DonneesRapport, type Droits, type LigneModele,
} from './rapports';

type Reponse = PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
type Paginable = { range: (de: number, a: number) => Reponse };

// Un rapport tronqué serait faux sans que rien ne le signale : au plafond, on refuse.
async function tout(fabrique: () => Paginable): Promise<Ligne[]> {
  const lignes = await lireTout<Ligne>((de, a) => fabrique().range(de, a) as PromiseLike<{ data: Ligne[] | null; error: { message: string } | null }>);
  if (lignes.tronque) throw new Error(`Rapport limité à ${lignes.length.toLocaleString('fr-FR')} lignes par rubrique : réduisez la période.`);
  return lignes;
}

async function lire(q: Reponse): Promise<Ligne[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data as Ligne[] | null) ?? [];
}

// Base pas encore à jour (vue ou fonction absente) : la rubrique reste vide au lieu de bloquer le rapport.
const absente = (e: unknown) => ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(String((e as { code?: string })?.code));
async function siPresente(f: () => Promise<Ligne[]>): Promise<Ligne[]> {
  try {
    return await f();
  } catch (e) {
    if (absente(e)) return [];
    throw e;
  }
}

/** Lignes d'une table par identifiants, par paquets (adresse de requête de taille raisonnable). */
async function parIds(table: string, colonnes: string, ids: unknown[]): Promise<Map<unknown, Ligne>> {
  const uniques = [...new Set(ids.filter((x) => x != null))];
  const paquets: unknown[][] = [];
  for (let i = 0; i < uniques.length; i += 150) paquets.push(uniques.slice(i, i + 150));
  const lus = await Promise.all(paquets.map((p) => lire(getSupabase().from(table).select(colonnes).in('id', p as string[]))));
  return new Map(lus.flat().map((l) => [l.id, l]));
}

// Interventions de la période : horodatages lus avec un jour de marge, puis gardés selon le jour du Maroc.
function interventions(table: 'reparations' | 'refections', marcheId: string, du: string, au: string) {
  return tout(() => getSupabase().from(table).select('*').eq('marche_id', marcheId).is('supprime_le', null)
    .gte('realisee_le', ajouterJours(du, -1)).lt('realisee_le', ajouterJours(au, 2)).order('realisee_le').order('id'))
    .then((l) => l.filter((x) => {
      const j = jourCasablanca(x.realisee_le);
      return j >= du && j <= au;
    }));
}

const COLONNES_FUITE = 'id, numero, reference_srm, adresse, zone_id, zone, secteur_id, secteur, statut';
const infosFuite = (f: Ligne | undefined) => ({
  fuite_numero: f?.numero ?? null, reference_srm: f?.reference_srm ?? null, adresse: f?.adresse ?? null,
  zone_id: f?.zone_id ?? null, zone: f?.zone ?? null, secteur_id: f?.secteur_id ?? null, secteur: f?.secteur ?? null, statut: f?.statut ?? null,
});

export async function chargerDonneesRapport(marcheId: string, periode: { du: string; au: string }, droits: Droits): Promise<DonneesRapport> {
  const { du, au } = periode;
  const sb = getSupabase();
  const [fuites, reparations, refections, pieces, attenteBrute, balayage, debitsNuits, debitsSituation, natures, motifs, m] = await Promise.all([
    tout(() => sb.from('v_fuites_export').select('*').eq('marche_id', marcheId).gte('jour_detection', du).lte('jour_detection', au).order('numero')),
    interventions('reparations', marcheId, du, au),
    interventions('refections', marcheId, du, au),
    tout(() => sb.from('v_pieces_posees').select('*').eq('marche_id', marcheId).gte('jour', du).lte('jour', au).order('jour').order('id')),
    // En attente ou en alerte : non achevées, à la date d'édition (indépendant de la période)
    tout(() => sb.from('v_fuites_export').select('*').eq('marche_id', marcheId).in('statut', ['detectee', 'en_reparation', 'reparee']).order('numero')),
    droits.balayage
      ? siPresente(() => tout(() => sb.from('v_balayage_journalier').select('*').eq('marche_id', marcheId).gte('date_balayage', du).lte('date_balayage', au)
        .order('date_balayage').order('secteur_id')))
      : Promise.resolve([]),
    droits.mesures_debit
      ? siPresente(() => tout(() => sb.from('v_debits_nuits').select('*').eq('marche_id', marcheId).gte('nuit', du).lte('nuit', au).order('nuit').order('zone_numero')))
      : Promise.resolve([]),
    droits.mesures_debit
      ? siPresente(async () => {
        const { data, error } = await sb.rpc('debits_resultats', { p_marche: marcheId });
        if (error) throw error;
        return (data as Ligne[] | null) ?? [];
      })
      : Promise.resolve([]),
    lire(sb.from('natures_refection').select('id, libelle_fr').eq('marche_id', marcheId)),
    lire(sb.from('motifs').select('id, libelle_fr').eq('marche_id', marcheId)),
    chargerMatricules(marcheId),
  ]);
  const attente = attenteBrute.filter((f) => f.statut === 'detectee' || f.statut === 'en_reparation' || enAlerte(f));

  const [infos, validation, repsPieces] = await Promise.all([
    parIds('v_fuites', COLONNES_FUITE, [...reparations, ...refections, ...pieces].map((l) => l.fuite_id)),
    parIds('fuites', 'id, validee_le', [...fuites, ...attente].map((l) => l.id)),
    parIds('reparations', 'id, validee_le', pieces.map((l) => l.reparation_id).filter((id) => !reparations.some((r) => r.id === id))),
  ]);
  reparations.forEach((r) => repsPieces.set(r.id, r));
  const nom = (liste: Ligne[], id: unknown) => (id == null ? null : (liste.find((x) => x.id === id)?.libelle_fr as string | undefined) ?? null);
  const valide = (id: unknown) => validation.get(id)?.validee_le ?? null;
  const maintenant = Date.now();

  return {
    fuites: fuites.map((f) => ({ ...f, detectee_par: m.agent(f.auteur_terrain_id, f.detectee_par), validee_le: valide(f.id) })),
    reparations: reparations.map((r) => ({
      ...r, ...infosFuite(infos.get(r.fuite_id)), chef: agent(m, r.auteur_terrain_id),
      revetement: nom(natures, r.nature_revetement_id), motif: nom(motifs, r.motif_id),
    })),
    refections: refections.map((r) => ({
      ...r, ...infosFuite(infos.get(r.fuite_id)), chef: agent(m, r.auteur_terrain_id), nature: nom(natures, r.nature_id), motif: nom(motifs, r.motif_id),
    })),
    balayage: balayage.map((b) => ({ ...b, agent: m.agent(b.agent_id, b.agent) })),
    debitsNuits,
    debitsSituation,
    pieces: pieces.map((p) => ({
      ...p, chef: m.agent(p.chef_id, p.chef), famille: LIBELLES_FAMILLES[String(p.famille)] ?? p.famille,
      statut: infos.get(p.fuite_id)?.statut ?? null, validee_le: repsPieces.get(p.reparation_id)?.validee_le ?? null,
    })),
    attente: attente.map((f) => ({
      ...f, detectee_par: m.agent(f.auteur_terrain_id, f.detectee_par), validee_le: valide(f.id),
      age_jours: f.date_detection ? Math.floor((maintenant - Date.parse(String(f.date_detection))) / 86_400_000) : null,
    })),
  };
}

const agent = (m: Matricules, id: unknown) => (id == null ? null : m.agent(id));

// ---------------------------------------------------------------------------
// Listes des filtres
// ---------------------------------------------------------------------------
export interface Choix { id: string; libelle: string }
export interface Personne extends Choix { matricule: string | null }

export async function chargerListes(marcheId: string): Promise<{ zones: Choix[]; secteurs: (Choix & { zone_id: string | null })[]; personnes: Personne[] }> {
  const sb = getSupabase();
  const [z, s, a] = await Promise.all([
    lire(sb.from('zones').select('id, libelle, numero').eq('marche_id', marcheId).order('numero')),
    lire(sb.from('secteurs').select('id, libelle, zone_id, ordre').eq('marche_id', marcheId).order('ordre').order('libelle')),
    lire(sb.from('affectations').select('profil_id, actif').eq('marche_id', marcheId)),
  ]);
  const ids = [...new Set(a.map((x) => x.profil_id as string))];
  const profils = ids.length ? await lire(sb.from('profils').select('id, nom_complet, matricule').in('id', ids)).catch(() => lire(sb.from('profils').select('id, nom_complet').in('id', ids))) : [];
  return {
    zones: z.map((x) => ({ id: String(x.id), libelle: String(x.libelle) })),
    secteurs: s.map((x) => ({ id: String(x.id), libelle: String(x.libelle), zone_id: (x.zone_id as string | null) ?? null })),
    personnes: profils.map((p) => ({ id: String(p.id), libelle: String(p.nom_complet ?? '?'), matricule: (p.matricule as string | null) ?? null }))
      .sort((x, y) => x.libelle.localeCompare(y.libelle, 'fr')),
  };
}

// ---------------------------------------------------------------------------
// Modèles du marché (modeles_export) et dernier choix
// ---------------------------------------------------------------------------
export interface ModeleRapport { id: string; nom: string; choix: ChoixRapport }

export async function lireModelesRapport(marcheId: string): Promise<{ modeles: ModeleRapport[]; dernier: ModeleRapport | null }> {
  const { data, error } = await getSupabase().from('modeles_export').select('id, nom, colonnes, filtres, format, orientation, ordre')
    .eq('marche_id', marcheId).eq('jeu', 'fuites').eq('actif', true).order('ordre').order('nom');
  if (error) throw error;
  const lignes = ((data ?? []) as (LigneModele & { id: string; nom: string })[]).filter(estModeleRapport);
  const enModele = (l: LigneModele & { id: string; nom: string }) => ({ id: l.id, nom: l.nom, choix: depuisModele(l) });
  const dernier = lignes.find(estDernierChoix);
  return { modeles: lignes.filter((l) => !estDernierChoix(l)).map(enModele), dernier: dernier ? enModele(dernier) : null };
}

const erreurNom = (nom: string, e: { code?: string }) =>
  e.code === '23505' ? new Error(`Un modèle « ${nom} » existe déjà pour ce marché : choisissez un autre nom.`) : e;

export async function enregistrerModeleRapport(marcheId: string, nom: string, choix: ChoixRapport, remplacer?: string): Promise<void> {
  const sb = getSupabase();
  const { error } = remplacer
    ? await sb.from('modeles_export').update(versModele(choix)).eq('id', remplacer)
    : await sb.from('modeles_export').insert({ ...versModele(choix), marche_id: marcheId, nom: nom.trim(), ordre: 110, actif: true });
  if (error) throw erreurNom(nom.trim(), error);
}

export async function retirerModeleRapport(id: string): Promise<void> {
  const { error } = await getSupabase().from('modeles_export').update({ actif: false }).eq('id', id);
  if (error) throw error;
}

/** Garde le dernier choix du marché (une ligne réservée, mise à jour à chaque tirage) ; renvoie son identifiant. */
export async function garderDernierChoix(marcheId: string, choix: ChoixRapport, id?: string | null): Promise<string | null> {
  const sb = getSupabase();
  const existant = id ?? ((await sb.from('modeles_export').select('id').eq('marche_id', marcheId).eq('nom', NOM_DERNIER_CHOIX).maybeSingle())
    .data as { id?: string } | null)?.id;
  if (existant) {
    const { error } = await sb.from('modeles_export').update({ ...versModele(choix, true), actif: true }).eq('id', existant);
    if (!error) return existant;
  }
  const { data, error } = await sb.from('modeles_export')
    .insert({ ...versModele(choix, true), marche_id: marcheId, nom: NOM_DERNIER_CHOIX, ordre: 999, actif: true }).select('id').maybeSingle();
  if (error) return null;
  return ((data as { id?: string } | null)?.id) ?? null;
}
