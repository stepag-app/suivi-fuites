// Essai de la lecture de l'API REST de Dolibarr depuis le Mac, avec le même code que la fonction dolibarr-mouvements :
// GET seulement, rien n'est écrit (ni dans Dolibarr, ni dans Supabase), aucun secret ni prix affiché.
//
//   deno run --allow-net --allow-read outils/dolibarr/essai-lecture.ts data-private/dolibarr/api-dolibarr.env [entrepôt] [dernier rowid]
//
// Le fichier .env (hors dépôt) porte DOLIBARR_API_URL, DOLIBARR_API_CLE, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET.
import { ErreurApi, clientDolibarr, lireEntrepot, nouveauxCaches } from '../../supabase/functions/dolibarr-mouvements/lecture-api.ts';

const [fichier, entrepotArg = '76', dernierArg] = Deno.args;
if (!fichier) {
  console.error('Usage : deno run --allow-net --allow-read outils/dolibarr/essai-lecture.ts <fichier .env> [entrepôt] [dernier rowid]');
  Deno.exit(2);
}
const env: Record<string, string> = {};
for (const ligne of Deno.readTextFileSync(fichier).split(/\r?\n/)) {
  const m = ligne.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2];
}
const manque = ['DOLIBARR_API_URL', 'DOLIBARR_API_CLE', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET'].filter((k) => !env[k]);
if (manque.length) {
  console.error(`Valeurs manquantes dans ${fichier} : ${manque.join(', ')}`);
  Deno.exit(1);
}

const client = clientDolibarr({ url: env.DOLIBARR_API_URL, cle: env.DOLIBARR_API_CLE, cfId: env.CF_ACCESS_CLIENT_ID, cfSecret: env.CF_ACCESS_CLIENT_SECRET });
const debut = Date.now();
try {
  const lus = await lireEntrepot(client, nouveauxCaches(), Number(entrepotArg), dernierArg ? Number(dernierArg) : null);
  const duree = ((Date.now() - debut) / 1000).toFixed(1);
  console.log(`Entrepôt ${entrepotArg} : ${lus.length} mouvement(s) ${dernierArg ? `après le n° ${dernierArg} et des derniers jours` : '(tout l\'historique)'}, ${client.appels()} appels, ${duree} s.`);
  const enFace = new Map<string, number>();
  for (const m of lus) {
    const k = m.entrepot_contrepartie ?? (m.type_mouvement === 1 && !m.annulation ? 'aucun (consommation)' : 'aucun');
    enFace.set(k, (enFace.get(k) ?? 0) + 1);
  }
  console.log('Entrepôt d\'en face :', [...enFace].map(([k, n]) => `${k} ×${n}`).join(' | '));
  for (const m of lus.slice(-5)) {
    console.log(`  n° ${m.dolibarr_id} ${m.date_mouvement} ${m.produit_ref} ${m.quantite} ${m.unite ?? ''} « ${m.libelle} »${m.entrepot_contrepartie ? ` ↔ ${m.entrepot_contrepartie}` : ''}`);
  }
} catch (e) {
  console.error(e instanceof ErreurApi ? `ÉCHEC : ${e.message}` : e);
  Deno.exit(1);
}
