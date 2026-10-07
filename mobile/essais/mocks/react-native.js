// Substitut de React Native pour l'essai sans pile : seul AppState sert (src/supabase.ts), piloté par l'essai.
const ecouteurs = new Set();
export const AppState = {
  currentState: 'active',
  addEventListener(type, f) {
    if (type === 'change') ecouteurs.add(f);
    return { remove: () => void ecouteurs.delete(f) };
  },
};
/** L'appli passe au premier plan ('active') ou en arrière-plan ('background'), comme sous Android. */
export function changerEtat(etat) {
  AppState.currentState = etat;
  for (const f of ecouteurs) f(etat);
}
