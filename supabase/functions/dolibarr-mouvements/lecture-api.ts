// Lecture des mouvements de stock dans l'API REST de Dolibarr (X8), derrière Cloudflare Access. GET seulement.
//
// Par entrepôt suivi : les mouvements de rowid plus grand que le dernier reçu, plus ceux des derniers jours
// (recouvrement : un mouvement corrigé ou écrit en retard est repris ; la base ne garde que les nouveaux ou changés).
// L'API donne les identifiants ; la référence, la désignation et l'unité viennent de /products (par paquets de 50), le
// nom de l'entrepôt et son projet de /warehouses (l'API des mouvements ne donne pas leur projet). L'entrepôt d'en face
// d'un bon de transfert (module additionnel StockTransfers, sans API) est celui du mouvement jumeau : rowid voisin (à la
// validation du bon, Dolibarr écrit les sorties du dépôt puis les entrées du chantier, à la suite), autre entrepôt, même
// libellé à la minute près, même produit, quantité de signe opposé, quelques secondes d'écart. Le n° du bon et son projet
// restent inconnus de l'API : clés non envoyées, la base garde ceux déjà reçus par le CSV.
//
// Filtres de l'API (sqlfilters) : une valeur qui contient « : » fait ignorer le filtre sans erreur (Dolibarr 19.0.1,
// vérifié le 2026-10-10) ; d'où des dates sans heure et aucun filtre sur le libellé. Les résultats sont de toute façon
// refiltrés ici (entrepôt).
//
// Dates : epoch renvoyé par Dolibarr, converti par lui depuis l'heure du serveur (PHP en Europe/Berlin) ; c'est l'instant
// vrai. Le libellé « Transfert de stock AAAA-MM-JJ HH:MM » et la valeur brute de la base sont à l'heure de Berlin
// (une heure de plus que le Maroc en été) : les CSV, qui lisaient la valeur brute, étaient donc décalés d'une heure.
//
// Jamais de prix : seules les clés utiles sont recopiées (le prix et le PMP renvoyés par l'API sont ignorés ici).

export interface ConfigApi {
  url: string;
  cle: string;
  cfId: string;
  cfSecret: string;
}

export interface MouvementEnvoye {
  dolibarr_id: number;
  date_mouvement: string;
  produit_dolibarr_id: number;
  produit_ref: string | null;
  produit_designation: string | null;
  entrepot_id: number;
  entrepot_libelle: string | null;
  entrepot_contrepartie_id: number | null;
  entrepot_contrepartie: string | null;
  quantite: number;
  type_mouvement: number;
  libelle: string | null;
  code_inventaire: string | null;
  annulation: boolean;
  unite: string | null;
  projet_id?: number;
  projet_entrepot_id?: number;
  bon_id?: number;
}

export class ErreurApi extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

type Brut = Record<string, unknown>;
type Fetch = typeof fetch;

const PAGE = 100;
const PAGES_MAX = 200;
const DELAI_MS = 25_000;
const MARGE_ROWID = 20;
const ECART_JUMEAU_S = 120;

const entier = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Textes de Dolibarr : balises retirées, entités décodées, espaces resserrés, longueur bornée (comme le script PHP).
export function nettoyer(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (e, c: string) => {
      if (c[0] === '#') {
        const n = c[1] === 'x' || c[1] === 'X' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : e;
      }
      return ENTITES[c.toLowerCase()] ?? e;
    })
    .replace(/\s+/g, ' ')
    .trim();
  const coupe = [...t].slice(0, max).join('');
  return coupe === '' ? null : coupe;
}

const ANNULATION = / CANCEL\s*$/;

/** Jour de début du recouvrement (« AAAA-MM-JJ », sans heure : voir les filtres), un jour de marge pour le fuseau. */
export function debutRecouvrement(jours: number, maintenant: Date): string {
  return new Date(maintenant.getTime() - (jours + 1) * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Africa/Casablanca' });
}

// Une valeur avec « : », une apostrophe ou une parenthèse casserait le filtre (ignoré sans erreur, ou refusé).
function filtre(...criteres: [string, string, string | number][]): string {
  return criteres.map(([champ, op, valeur]) => {
    const v = String(valeur);
    if (/[:'()]/.test(v.replace(/^'|'$/g, ''))) throw new ErreurApi(`Filtre de l'API impossible (${champ})`, 'filtre');
    return `(${champ}:${op}:${v})`;
  }).join(' and ');
}

export function clientDolibarr(config: ConfigApi, fetchFn: Fetch = fetch) {
  const base = config.url.replace(/\/+$/, '');
  let appels = 0;

  async function get(chemin: string, params: Record<string, string | number> = {}): Promise<unknown | null> {
    const url = new URL(base + chemin);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    appels++;
    let r: Response;
    try {
      r = await fetchFn(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(DELAI_MS),
        headers: {
          Accept: 'application/json',
          DOLAPIKEY: config.cle,
          'CF-Access-Client-Id': config.cfId,
          'CF-Access-Client-Secret': config.cfSecret,
          'User-Agent': 'stepag-suivi-fuites/lecture-dolibarr',
        },
      });
    } catch (e) {
      const delai = e instanceof DOMException && e.name === 'TimeoutError';
      throw new ErreurApi(delai
        ? 'Dolibarr ne répond pas (plus de 25 s) : serveur surchargé, éteint, ou tunnel Cloudflare arrêté'
        : 'Dolibarr injoignable : serveur éteint, tunnel Cloudflare arrêté ou coupure Internet', 'injoignable');
    }
    const texte = await r.text();
    let json: unknown = null;
    try {
      json = texte ? JSON.parse(texte) : null;
    } catch {
      json = undefined;
    }
    const erreurDolibarr = json && typeof json === 'object' && 'error' in (json as Brut);
    const lieu = r.headers.get('location') ?? '';

    if (r.status >= 300 && r.status < 400) {
      if (/cloudflareaccess\.com/i.test(lieu)) {
        throw new ErreurApi('Cloudflare refuse l\'accès à l\'API : jeton de service absent ou invalide, règle « Service Auth » manquante, ou adresse de l\'API hors de l\'application Cloudflare (DOLIBARR_API_URL)', 'cloudflare');
      }
      throw new ErreurApi(`Dolibarr redirige l'appel (HTTP ${r.status}) : adresse de l'API à vérifier (DOLIBARR_API_URL)`, 'adresse');
    }
    if ((r.status === 401 || r.status === 403) && !erreurDolibarr) {
      throw new ErreurApi('Cloudflare refuse l\'accès à l\'API : jeton de service invalide ou révoqué, ou règle « Service Auth » manquante', 'cloudflare');
    }
    // Dolibarr répond 401 aussi pour un droit manquant ; seule la vérification de la clé (api_access) dit « user not valid ».
    if (r.status === 401 && /api_access|user not valid|login/i.test(texte)) {
      throw new ErreurApi('Dolibarr refuse la clé API (utilisateur api-suivi-fuites désactivé, ou clé changée)', 'cle');
    }
    if (r.status === 401 || r.status === 403) {
      throw new ErreurApi('Droit manquant pour l\'utilisateur Dolibarr api-suivi-fuites (consulter les stocks, les mouvements de stocks et les produits)', 'droits');
    }
    if (r.status === 404 && erreurDolibarr) return null;
    if (r.status === 404 || r.status === 501) {
      throw new ErreurApi('API REST de Dolibarr introuvable : module API REST inactif, ou adresse incorrecte (DOLIBARR_API_URL)', 'adresse');
    }
    if (r.status >= 500) throw new ErreurApi(`Dolibarr a répondu en erreur (HTTP ${r.status})`, 'serveur');
    if (r.status !== 200 || json === undefined) {
      throw new ErreurApi(`Réponse inattendue de Dolibarr (HTTP ${r.status}${json === undefined ? ', page au lieu de données' : ''}) : adresse de l'API à vérifier`, 'reponse');
    }
    return json;
  }

  async function liste(chemin: string, filtre: string): Promise<Brut[]> {
    const tout: Brut[] = [];
    for (let page = 0; page < PAGES_MAX; page++) {
      const lot = await get(chemin, { sortfield: 't.rowid', sortorder: 'ASC', limit: PAGE, page, sqlfilters: filtre });
      if (lot === null) break;
      if (!Array.isArray(lot)) throw new ErreurApi('Réponse inattendue de Dolibarr (liste attendue)', 'reponse');
      tout.push(...(lot as Brut[]));
      if (lot.length < PAGE) break;
    }
    return tout;
  }

  return { get, liste, appels: () => appels };
}

export type ClientDolibarr = ReturnType<typeof clientDolibarr>;

// Quelques appels à la fois : le serveur Dolibarr est un poste de bureau derrière un tunnel.
async function parLots<T, R>(elements: T[], taille: number, fn: (e: T) => Promise<R>): Promise<R[]> {
  const resultats: R[] = [];
  for (let i = 0; i < elements.length; i += taille) resultats.push(...(await Promise.all(elements.slice(i, i + taille).map(fn))));
  return resultats;
}

interface Produit { ref: string | null; designation: string | null; unite: number | null }
interface Entrepot { ref: string | null; projet: number | null }

export interface Caches {
  produits: Map<number, Produit | null>;
  entrepots: Map<number, Entrepot | null>;
  unites: Map<number, string> | null;
}

export const nouveauxCaches = (): Caches => ({ produits: new Map(), entrepots: new Map(), unites: null });

async function entrepot(client: ClientDolibarr, caches: Caches, id: number): Promise<Entrepot | null> {
  if (!caches.entrepots.has(id)) {
    const e = (await client.get(`/warehouses/${id}`)) as Brut | null;
    caches.entrepots.set(id, e ? { ref: nettoyer(e.ref ?? e.label, 255), projet: entier(e.fk_project) } : null);
  }
  return caches.entrepots.get(id) ?? null;
}

async function unites(client: ClientDolibarr, caches: Caches): Promise<Map<number, string>> {
  if (!caches.unites) {
    caches.unites = new Map();
    const liste = await client.get('/setup/dictionary/units', { limit: 500 });
    if (Array.isArray(liste)) {
      for (const u of liste as Brut[]) {
        const id = entier(u.id ?? u.rowid);
        const court = nettoyer(u.short_label ?? u.code, 20);
        if (id && court) caches.unites.set(id, court);
      }
    }
  }
  return caches.unites;
}

// Libellé sans l'heure ni « CANCEL » : la sortie du dépôt et l'entrée au chantier d'un même bon peuvent porter deux
// minutes différentes (« Transfert de stock 2026-10-01 10:38 » / « … 10:40 », vu le 2026-10-10).
const famille = (libelle: unknown) => String(libelle ?? '').replace(ANNULATION, '')
  .replace(/\s*\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?\s*$/, '').trim();

/** Contreparties des mouvements manuels (bons de transfert) : rowid du mouvement → entrepôt d'en face. */
async function contreparties(client: ClientDolibarr, entrepotId: number, mouvements: Brut[]): Promise<Map<number, number>> {
  const aChercher = mouvements
    .filter((m) => String(m.origintype ?? '').trim() === '' && famille(m.label) !== '')
    .sort((a, b) => Number(a.id) - Number(b.id));
  // Mouvements voisins des autres entrepôts, une requête par paquet de rowid proches.
  const paquets: Brut[][] = [];
  for (const m of aChercher) {
    const dernier = paquets.at(-1);
    if (dernier && Number(m.id) - Number(dernier.at(-1)!.id) <= 50) dernier.push(m);
    else paquets.push([m]);
  }
  const voisins = new Map<number, Brut>();
  await parLots(paquets, 3, async (paquet) => {
    const marge = 2 * paquet.length + MARGE_ROWID;
    const lus = await client.liste('/stockmovements', filtre(
      ['t.rowid', '>=', Number(paquet[0].id) - marge], ['t.rowid', '<=', Number(paquet.at(-1)!.id) + marge],
      ['t.fk_entrepot', '!=', entrepotId]));
    for (const v of lus) if (entier(v.warehouse_id) !== entrepotId) voisins.set(Number(v.id), v);
  });

  // Le jumeau le plus proche dans le temps, puis en rowid ; chacun ne sert qu'une fois.
  const pris = new Set<number>();
  const trouvees = new Map<number, number>();
  for (const m of aChercher) {
    const annule = ANNULATION.test(String(m.label ?? ''));
    const ecart = (a: Brut) => Math.abs(Number(a.datem) - Number(m.datem));
    const jumeau = [...voisins.values()]
      .filter((a) => !pris.has(Number(a.id))
        && String(a.product_id) === String(m.product_id)
        && Math.sign(Number(a.qty)) === -Math.sign(Number(m.qty))
        && ANNULATION.test(String(a.label ?? '')) === annule
        && famille(a.label) === famille(m.label)
        && ecart(a) <= ECART_JUMEAU_S)
      .sort((a, b) => ecart(a) - ecart(b) || Math.abs(Number(a.id) - Number(m.id)) - Math.abs(Number(b.id) - Number(m.id)))[0];
    const enFace = jumeau ? entier(jumeau.warehouse_id) : null;
    if (jumeau && enFace) {
      pris.add(Number(jumeau.id));
      trouvees.set(Number(m.id), enFace);
    }
  }
  return trouvees;
}

/** Mouvements bruts de l'entrepôt : tout l'historique, ou rowid > dernierId et ceux des `jours` derniers jours. */
export async function lireMouvementsBruts(client: ClientDolibarr, entrepotId: number, dernierId: number | null, jours: number,
  maintenant: Date): Promise<Brut[]> {
  const ici: [string, string, number] = ['t.fk_entrepot', '=', entrepotId];
  const lots = dernierId === null
    ? [await client.liste('/stockmovements', filtre(ici))]
    : [
      await client.liste('/stockmovements', filtre(ici, ['t.rowid', '>', dernierId])),
      await client.liste('/stockmovements', filtre(ici, ['t.datem', '>=', `'${debutRecouvrement(jours, maintenant)}'`])),
    ];
  const parId = new Map<number, Brut>();
  for (const m of lots.flat()) {
    const id = entier(m.id);
    if (id && entier(m.warehouse_id) === entrepotId) parId.set(id, m);
  }
  return [...parId.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

/** Mouvements d'un entrepôt suivi, prêts pour recevoir_envoi_dolibarr (sans prix). */
export async function lireEntrepot(client: ClientDolibarr, caches: Caches, entrepotId: number, dernierId: number | null,
  jours = 3, maintenant = new Date()): Promise<MouvementEnvoye[]> {
  const bruts = await lireMouvementsBruts(client, entrepotId, dernierId, jours, maintenant);
  if (!bruts.length) return [];

  const ici = await entrepot(client, caches, entrepotId);
  const aLire = [...new Set(bruts.map((m) => entier(m.product_id)).filter((id): id is number => id !== null))]
    .filter((id) => !caches.produits.has(id));
  // Par paquets de 50 (opérateur « in ») ; un produit absent de la réponse (supprimé dans Dolibarr) reste inconnu.
  const paquets = Array.from({ length: Math.ceil(aLire.length / 50) }, (_, i) => aLire.slice(i * 50, (i + 1) * 50));
  await parLots(paquets, 2, async (ids) => {
    const lus = await client.liste('/products', filtre(['t.rowid', 'in', ids.join(',')]));
    for (const p of lus) {
      const id = entier(p.id);
      if (id) caches.produits.set(id, { ref: nettoyer(p.ref, 64), designation: nettoyer(p.label, 255), unite: entier(p.fk_unit) });
    }
    for (const id of ids) if (!caches.produits.has(id)) caches.produits.set(id, null);
  });
  const dicoUnites = [...caches.produits.values()].some((p) => p?.unite) ? await unites(client, caches) : new Map<number, string>();
  const enFace = await contreparties(client, entrepotId, bruts);
  for (const id of new Set(enFace.values())) await entrepot(client, caches, id);

  return bruts.map((m) => {
    const produitId = entier(m.product_id) ?? 0;
    const produit = caches.produits.get(produitId) ?? null;
    const libelle = nettoyer(m.label, 255);
    const code = nettoyer(m.inventorycode, 128);
    const contrepartieId = enFace.get(Number(m.id)) ?? null;
    const datem = Number(m.datem);
    const mouvement: MouvementEnvoye = {
      dolibarr_id: Number(m.id),
      date_mouvement: Number.isFinite(datem) && datem > 0 ? new Date(datem * 1000).toISOString() : '',
      produit_dolibarr_id: produitId,
      produit_ref: produit?.ref ?? null,
      produit_designation: produit?.designation ?? null,
      entrepot_id: entrepotId,
      entrepot_libelle: ici?.ref ?? null,
      entrepot_contrepartie_id: contrepartieId,
      entrepot_contrepartie: contrepartieId ? caches.entrepots.get(contrepartieId)?.ref ?? null : null,
      quantite: Math.round(Number(m.qty) * 10_000) / 10_000,
      type_mouvement: Number(m.type),
      libelle,
      code_inventaire: code,
      annulation: ANNULATION.test(libelle ?? '') || ANNULATION.test(code ?? ''),
      unite: produit?.unite ? dicoUnites.get(produit.unite) ?? null : null,
    };
    const projet = entier(m.fk_project) ?? entier(m.fk_projet);
    if (projet) mouvement.projet_id = projet;
    else if (ici?.projet) mouvement.projet_entrepot_id = ici.projet;
    if (String(m.origintype ?? '') === 'stocktransfers_transfer' && entier(m.fk_origin)) mouvement.bon_id = entier(m.fk_origin)!;
    return mouvement;
  });
}
