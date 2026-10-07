// Substitut de src/supabase.ts pour l'essai SANS pile locale. La connexion est la vraie : auth-js du client de
// src/supabase.ts (renouvellement du jeton, reprises, événements, déconnexion). Chaque requête de la tablette passe par
// le vrai fetch de ce client (jeton de la session, sinon clé anonyme ; délai de src/reseau.ts) jusqu'au serveur
// simulé (mocks/serveur-simule.js). Seul le constructeur de requêtes de l'API est simplifié (filtres utiles à l'essai).
import { enVol } from './serveur-simule.js';
import { supabase as client } from '../../src/supabase.ts';

export { simulation } from './serveur-simule.js';
export { CLE_SESSION, configurationManquante, emailDepuisIdentifiant } from '../../src/supabase.ts';

const API = process.env.EXPO_PUBLIC_SUPABASE_URL;
const METHODES = { select: 'GET', insert: 'POST', update: 'PATCH', delete: 'DELETE' };
let numero = 0;

class Requete {
  constructor(table) {
    this.table = table;
    this.operation = 'select';
    this.filtres = [];
    this.retour = false;
    this.unique = false;
  }
  insert(v) { this.operation = 'insert'; this.valeur = v; return this; }
  update(v) { this.operation = 'update'; this.valeur = v; return this; }
  delete() { this.operation = 'delete'; return this; }
  select() { if (this.operation !== 'select') this.retour = true; return this; }
  eq(c, v) { this.filtres.push((l) => l[c] === v); return this; }
  is(c, v) { this.filtres.push((l) => (l[c] ?? null) === v); return this; }
  in(c, v) { this.filtres.push((l) => v.includes(l[c])); return this; }
  order() { return this; }
  limit() { return this; }
  abortSignal(signal) { this.signal = signal; return this; }
  maybeSingle() { this.unique = true; return this; }
  then(ok, ko) {
    const id = String(++numero);
    enVol.set(id, this);
    return client.fetch(`${API}/rest/v1/${this.table}`, {
      method: METHODES[this.operation], headers: { 'x-requete': id }, signal: this.signal,
      body: this.valeur === undefined ? undefined : JSON.stringify(this.valeur),
    })
      // Requête abandonnée ou coupure : erreur mise en forme comme par postgrest-js (« nom: message »).
      .then((r) => r.json(), (e) => ({ data: null, error: { message: `${e.name}: ${e.message}`, code: '' } }))
      .finally(() => enVol.delete(id))
      .then(ok, ko);
  }
}

export const supabase = {
  from: (table) => new Requete(table),
  auth: client.auth,
  // Fonction serveur photos-r2 : le serveur simulé répond « non configuré », la tablette retombe sur Supabase Storage.
  functions: {
    invoke: async (nom, { body } = {}) => {
      try {
        const r = await client.fetch(`${API}/functions/v1/${nom}`, { method: 'POST', body: JSON.stringify(body) });
        if (r.ok) return { data: await r.json(), error: null };
        return { data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { name: 'FunctionsHttpError', context: r }) };
      } catch (e) {
        return { data: null, error: Object.assign(new Error(e.message), { name: 'FunctionsFetchError' }) }; // comme functions-js
      }
    },
  },
  storage: {
    from: () => ({
      upload: async (chemin, octets) => {
        try {
          const r = await client.fetch(`${API}/storage/v1/object/photos/${chemin}`, { method: 'POST', body: octets });
          return await r.json();
        } catch (e) {
          return { data: null, error: { name: 'StorageUnknownError', message: e.message } }; // comme storage-js
        }
      },
    }),
  },
};
