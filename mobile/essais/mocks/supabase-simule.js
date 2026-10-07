// Substitut du client Supabase pour l'essai SANS pile locale : tables en mémoire, réseau qu'on coupe,
// et les règles de la base utiles à la file d'attente (mêmes codes et messages) :
//  * identifiant déjà pris → 23505 ; réparation absente → 23503 ;
//  * droit « interventions / modifier » = 'non' → la règle RLS ne laisse voir aucune ligne (0 ligne, sans erreur) ;
//  * portée « siennes » sur une ligne saisie par un autre → « Modification non autorisée » (42501) ;
//  * retrait (supprime_le) sans droit « supprimer » → « Suppression non autorisée » (42501) ;
//  * fuite verrouillée → « Fuite verrouillée : modification réservée au responsable » (42501).
// Chaque requête passe par le vrai délai de l'appli (src/reseau.ts, `global.fetch` du vrai client).
import { avecDelai } from '../../src/reseau.ts';

const TABLES = ['fuites', 'reparations', 'refections', 'reparation_pieces', 'reparation_ouvriers', 'photos'];
const INTERVENTIONS = ['reparations', 'refections', 'reparation_pieces', 'reparation_ouvriers'];

export const simulation = {
  tables: Object.fromEntries(TABLES.map((t) => [t, []])),
  fichiers: new Set(),
  journal: [], // « table:operation » de chaque requête reçue, dans l'ordre
  reseau: true,
  coupureDans: null, // nombre de requêtes acceptées avant la coupure (coupure en plein envoi)
  sansReponseDans: null, // nombre de requêtes servies avant celle qui n'aura jamais de réponse (connexion 4G morte)
  sansReponse: 0, // requêtes en attente d'une réponse qui ne viendra pas
  utilisateur: 'chef',
  droits: { modifier: 'siennes', supprimer: 'non' },
  verrouillees: new Set(),
  remettre() {
    for (const t of TABLES) this.tables[t] = [];
    this.fichiers.clear();
    this.journal = [];
    this.reseau = true;
    this.coupureDans = null;
    this.sansReponseDans = null;
    this.verrouillees.clear();
  },
};

const coupure = () => ({ data: null, error: { message: 'TypeError: Network request failed' } });
const refus = (message, code = '42501') => ({ data: null, error: { code, message } });

function reseauOk() {
  if (simulation.coupureDans != null) {
    if (simulation.coupureDans <= 0) simulation.reseau = false;
    else simulation.coupureDans -= 1;
  }
  return simulation.reseau;
}

// Le serveur simulé répond aussitôt, sauf à la requête « sans réponse » : rien ne revient, seul l'abandon par le délai
// de l'appli la fait tomber (même erreur que le fetch de l'APK, expo/fetch).
function serveur(_adresse, init) {
  if (simulation.sansReponseDans == null) return Promise.resolve();
  if (simulation.sansReponseDans > 0) {
    simulation.sansReponseDans -= 1;
    return Promise.resolve();
  }
  simulation.sansReponseDans = null;
  simulation.sansReponse += 1;
  return new Promise((_, ko) => init?.signal?.addEventListener('abort', () => {
    simulation.sansReponse -= 1;
    ko(new Error('fetch failed: Fetch request has been canceled'));
  }));
}
const transport = avecDelai(serveur);

function fuiteDe(table, ligne) {
  if (table === 'reparation_pieces' || table === 'reparation_ouvriers') {
    return simulation.tables.reparations.find((r) => r.id === ligne.reparation_id)?.fuite_id;
  }
  return table === 'fuites' ? ligne.id : ligne.fuite_id;
}
const verrouillee = (table, ligne) => table !== 'fuites' && simulation.verrouillees.has(fuiteDe(table, ligne));
const MSG_VERROU = 'Fuite verrouillée : modification réservée au responsable';
const permis = (portee, ligne) => portee === 'toutes' || (portee === 'siennes' && ligne.saisi_par === simulation.utilisateur);

function inserer(table, valeur) {
  const lignes = Array.isArray(valeur) ? valeur : [valeur];
  const t = simulation.tables[table];
  for (const v of lignes) {
    const ligne = { id: v.id ?? crypto.randomUUID(), saisi_par: simulation.utilisateur, supprime_le: null, ...v };
    if (t.some((x) => x.id === ligne.id)) return refus('duplicate key value violates unique constraint', '23505');
    if (table === 'reparation_ouvriers' && t.some((x) => x.reparation_id === ligne.reparation_id && x.ouvrier_id === ligne.ouvrier_id)) {
      return refus('duplicate key value violates unique constraint', '23505');
    }
    if (ligne.reparation_id && !simulation.tables.reparations.some((r) => r.id === ligne.reparation_id)) {
      return refus('insert or update violates foreign key constraint', '23503');
    }
    if (verrouillee(table, ligne)) return refus(MSG_VERROU);
    t.push(ligne);
  }
  return { data: null, error: null };
}

function modifier(table, cibles, valeur, retour) {
  if (INTERVENTIONS.includes(table) && simulation.droits.modifier === 'non' && simulation.droits.supprimer === 'non') {
    return { data: retour ? [] : null, error: null }; // règle RLS : aucune ligne visible pour la mise à jour
  }
  for (const ligne of cibles) {
    if (verrouillee(table, ligne)) return refus(MSG_VERROU);
    const { supprime_le: retrait, ...donnees } = valeur;
    if ('supprime_le' in valeur && retrait !== ligne.supprime_le && !permis(simulation.droits.supprimer, ligne)) {
      return refus('Suppression non autorisée');
    }
    const change = Object.entries(donnees).some(([k, v]) => ligne[k] !== v);
    if (change && !permis(simulation.droits.modifier, ligne)) return refus('Modification non autorisée');
  }
  for (const ligne of cibles) Object.assign(ligne, valeur);
  return { data: retour ? cibles.map((l) => ({ id: l.id })) : null, error: null };
}

function supprimer(table, cibles) {
  if (simulation.droits.modifier === 'non') return { data: null, error: null };
  for (const ligne of cibles) if (verrouillee(table, ligne)) return refus(MSG_VERROU);
  simulation.tables[table] = simulation.tables[table].filter((l) => !cibles.includes(l));
  return { data: null, error: null };
}

class Requete {
  constructor(table) {
    this.table = table;
    this.operation = 'select';
    this.filtres = [];
    this.retour = false;
  }
  insert(v) { this.operation = 'insert'; this.valeur = v; return this; }
  update(v) { this.operation = 'update'; this.valeur = v; return this; }
  delete() { this.operation = 'delete'; return this; }
  select() { if (this.operation !== 'select') this.retour = true; return this; }
  eq(c, v) { this.filtres.push((l) => l[c] === v); return this; }
  is(c, v) { this.filtres.push((l) => (l[c] ?? null) === v); return this; }
  in(c, v) { this.filtres.push((l) => v.includes(l[c])); return this; }
  executer() {
    if (!reseauOk()) return coupure();
    simulation.journal.push(`${this.table}:${this.operation}`);
    const cibles = simulation.tables[this.table].filter((l) => this.filtres.every((f) => f(l)));
    if (this.operation === 'insert') return inserer(this.table, this.valeur);
    if (this.operation === 'update') return modifier(this.table, cibles, this.valeur, this.retour);
    if (this.operation === 'delete') return supprimer(this.table, cibles);
    return { data: cibles, error: null };
  }
  then(ok, ko) {
    return transport(`/rest/v1/${this.table}`, { body: this.valeur === undefined ? undefined : JSON.stringify(this.valeur) })
      // Requête abandonnée : erreur mise en forme comme par postgrest-js (« nom: message »).
      .then(() => this.executer(), (e) => ({ data: null, error: { message: `${e.name}: ${e.message}`, code: '' } }))
      .then(ok, ko);
  }
}

export const supabase = {
  from: (table) => new Requete(table),
  auth: { getSession: async () => ({ data: { session: { user: { id: simulation.utilisateur } } } }) },
  storage: {
    from: () => ({
      upload: async (chemin, octets) => {
        try {
          await transport(`/storage/v1/object/photos/${chemin}`, { body: octets });
        } catch (e) {
          return { data: null, error: { name: 'StorageUnknownError', message: e.message } }; // comme storage-js
        }
        if (!reseauOk()) return coupure();
        simulation.journal.push('stockage:upload');
        if (simulation.fichiers.has(chemin)) return { data: null, error: { statusCode: '409', message: 'The resource already exists' } };
        simulation.fichiers.add(chemin);
        return { data: { path: chemin }, error: null };
      },
    }),
  },
};
