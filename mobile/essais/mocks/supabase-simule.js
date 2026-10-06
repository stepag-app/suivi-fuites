// Substitut du client Supabase pour l'essai SANS pile locale : tables en mémoire, réseau qu'on coupe,
// et les règles de la base utiles à la file d'attente (mêmes codes et messages) :
//  * identifiant déjà pris → 23505 ; réparation absente → 23503 ;
//  * droit « interventions / modifier » = 'non' → la règle RLS ne laisse voir aucune ligne (0 ligne, sans erreur) ;
//  * portée « siennes » sur une ligne saisie par un autre → « Modification non autorisée » (42501) ;
//  * retrait (supprime_le) sans droit « supprimer » → « Suppression non autorisée » (42501) ;
//  * fuite verrouillée → « Fuite verrouillée : modification réservée au responsable » (42501).
const TABLES = ['fuites', 'reparations', 'refections', 'reparation_pieces', 'reparation_ouvriers', 'photos'];
const INTERVENTIONS = ['reparations', 'refections', 'reparation_pieces', 'reparation_ouvriers'];

export const simulation = {
  tables: Object.fromEntries(TABLES.map((t) => [t, []])),
  fichiers: new Set(),
  journal: [], // « table:operation » de chaque requête reçue, dans l'ordre
  reseau: true,
  coupureDans: null, // nombre de requêtes acceptées avant la coupure (coupure en plein envoi)
  utilisateur: 'chef',
  droits: { modifier: 'siennes', supprimer: 'non' },
  verrouillees: new Set(),
  remettre() {
    for (const t of TABLES) this.tables[t] = [];
    this.fichiers.clear();
    this.journal = [];
    this.reseau = true;
    this.coupureDans = null;
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
  then(ok, ko) { return Promise.resolve().then(() => this.executer()).then(ok, ko); }
}

export const supabase = {
  from: (table) => new Requete(table),
  auth: { getSession: async () => ({ data: { session: { user: { id: simulation.utilisateur } } } }) },
  // Fonction serveur photos-r2 absente de l'essai : « non configuré », la tablette retombe sur Supabase Storage.
  functions: {
    invoke: async () => {
      if (!reseauOk()) return coupure();
      simulation.journal.push('fonction:photos-r2');
      return { data: null, error: { message: 'non configuré', context: { json: async () => ({ erreur: 'Stockage R2 non configuré', code: 'r2_non_configure' }) } } };
    },
  },
  storage: {
    from: () => ({
      upload: async (chemin) => {
        if (!reseauOk()) return coupure();
        simulation.journal.push('stockage:upload');
        if (simulation.fichiers.has(chemin)) return { data: null, error: { statusCode: '409', message: 'The resource already exists' } };
        simulation.fichiers.add(chemin);
        return { data: { path: chemin }, error: null };
      },
    }),
  },
};
