// Délai des requêtes vers Supabase. Le fetch de l'APK (expo/fetch, sur le client OkHttp de React Native : connexion,
// lecture et écriture sans délai) attend sans fin une réponse qui ne viendra pas : sur une connexion 4G morte, jusqu'à
// l'expiration TCP, souvent un quart d'heure. La file d'attente n'envoyant qu'une synchro à la fois (`synchroniser`),
// plus rien ne partait d'ici là. Passé le délai, la requête est abandonnée et l'erreur compte comme une coupure : la
// saisie reste sur la tablette, sans message, et repart au tour suivant.
export const DELAI_API_MS = 60000;
// Envoi d'une photo (1 600 px, qualité 70 : quelques centaines de Ko) : de quoi passer sur une 4G très lente.
export const DELAI_PHOTO_MS = 3 * 60 * 1000;

// Corps binaire : photo envoyée au stockage. Sinon : JSON de l'API, ou pas de corps.
const delaiDe = (init?: RequestInit) => (init?.body == null || typeof init.body === 'string' ? DELAI_API_MS : DELAI_PHOTO_MS);

// Nommée AbortError, comme un abandon : supabase-js ne relance pas la requête (une lecture le serait trois fois de plus,
// sur la même connexion morte). « timeout » la classe en coupure dans la file d'attente (`erreurReseau`).
function delaiDepasse(ms: number) {
  const e = new Error(`timeout : pas de réponse du serveur en ${ms / 1000} s`);
  e.name = 'AbortError';
  return e;
}

/**
 * Borne un `fetch` (celui de la tablette ; un réseau simulé dans les essais). Le délai court jusqu'à la réponse du
 * serveur, là où restent les connexions mortes ; le corps, court pour toutes ces requêtes, arrive avec. Un appelant
 * qui passe son propre signal (liste des fuites : 20 s) garde son délai : rien n'est ajouté.
 */
export function avecDelai(base: typeof fetch): typeof fetch {
  return (entree, init) => {
    if (init?.signal) return base(entree, init);
    const ms = delaiDe(init);
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), ms);
    return base(entree, { ...init, signal: controleur.signal })
      .catch((e: unknown) => {
        throw controleur.signal.aborted ? delaiDepasse(ms) : e;
      })
      .finally(() => clearTimeout(minuteur));
  };
}

/** `fetch` du client Supabase (`supabase.ts`) : API, connexion, envoi des photos. */
export const fetchAvecDelai = avecDelai((entree, init) => fetch(entree, init));
