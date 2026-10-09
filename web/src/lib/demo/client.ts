// Client Supabase de démonstration : mêmes appels (from / select / eq / order / range, auth, storage, rpc,
// functions), servis depuis les tables en mémoire de donnees.ts. Rien n'est envoyé nulle part.
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_ID, EMAIL_DEMO, TABLES, anticipeesDemo, vFuites } from "./donnees";

type Ligne = Record<string, unknown>;
type Reponse = { data: unknown; error: { message: string; code?: string } | null; count: number | null };
type Filtre = (l: Ligne) => boolean;

const copie = (l: Ligne) => ({ ...l });
const cmp = (a: unknown, b: unknown) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0);

class Requete implements PromiseLike<Reponse> {
  private filtres: Filtre[] = [];
  private ordres: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private de = 0;
  private a = Infinity;
  private forme: "liste" | "maybeSingle" | "single" = "liste";
  private ecriture: { type: "insert" | "update" | "delete" | "upsert"; valeurs?: Ligne | Ligne[] } | null = null;
  private tete = false;
  private compter = false;

  private table: string;

  // Sans propriété de paramètre : le fichier se charge aussi par Node seul (scripts de vérification)
  constructor(table: string) {
    this.table = table;
  }

  select(_cols?: string, opts?: { head?: boolean; count?: string }) {
    if (opts?.head) this.tete = true;
    if (opts?.count) this.compter = true;
    return this;
  }
  insert(valeurs: Ligne | Ligne[]) { this.ecriture = { type: "insert", valeurs }; return this; }
  upsert(valeurs: Ligne | Ligne[]) { this.ecriture = { type: "upsert", valeurs }; return this; }
  update(valeurs: Ligne) { this.ecriture = { type: "update", valeurs }; return this; }
  delete() { this.ecriture = { type: "delete" }; return this; }
  eq(col: string, v: unknown) { this.filtres.push((l) => l[col] === v); return this; }
  neq(col: string, v: unknown) { this.filtres.push((l) => l[col] !== v); return this; }
  is(col: string, v: unknown) { this.filtres.push((l) => (v === null ? l[col] == null : l[col] === v)); return this; }
  in(col: string, vs: unknown[]) { this.filtres.push((l) => vs.includes(l[col])); return this; }
  gt(col: string, v: unknown) { this.filtres.push((l) => cmp(l[col], v) > 0); return this; }
  gte(col: string, v: unknown) { this.filtres.push((l) => cmp(l[col], v) >= 0); return this; }
  lt(col: string, v: unknown) { this.filtres.push((l) => cmp(l[col], v) < 0); return this; }
  lte(col: string, v: unknown) { this.filtres.push((l) => cmp(l[col], v) <= 0); return this; }
  not(col: string, op: string, v: unknown) { this.filtres.push((l) => (op === "is" && v === null ? l[col] != null : l[col] !== v)); return this; }
  ilike(col: string, motif: string) { const m = motif.replace(/%/g, "").toLowerCase(); this.filtres.push((l) => String(l[col] ?? "").toLowerCase().includes(m)); return this; }
  like(col: string, motif: string) { return this.ilike(col, motif); }
  or() { return this; }
  contains() { return this; }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) { this.ordres.push({ col, asc: opts?.ascending ?? true, nullsFirst: opts?.nullsFirst }); return this; }
  range(de: number, a: number) { this.de = de; this.a = a; return this; }
  limit(n: number) { this.a = this.de + n - 1; return this; }
  maybeSingle() { this.forme = "maybeSingle"; return this; }
  single() { this.forme = "single"; return this; }

  private executer(): Reponse {
    const lignes = TABLES[this.table] ?? (TABLES[this.table] = []);
    const retenues = lignes.filter((l) => this.filtres.every((f) => f(l)));
    if (this.ecriture) {
      const { type, valeurs } = this.ecriture;
      if (type === "insert" || type === "upsert") {
        const nouvelles: Ligne[] = (Array.isArray(valeurs) ? valeurs : [valeurs!]).map((v) => ({ id: crypto.randomUUID(), cree_le: new Date().toISOString(), ...v }));
        lignes.push(...nouvelles);
        if (this.table === "fuites") {
          // Une fuite saisie en démonstration apparaît aussitôt dans la vue des fuites.
          nouvelles.forEach((v) => {
            const marche = v.marche_id as string;
            const numero = Math.max(0, ...vFuites.filter((f) => f.marche_id === marche).map((f) => f.numero)) + 1;
            const pos = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(String(v.position ?? ""));
            Object.assign(v, {
              numero, statut: "detectee", origine: "stepag", zone: null, secteur: null, latitude: pos ? Number(pos[2]) : null, longitude: pos ? Number(pos[1]) : null,
              date_detection: new Date().toISOString(), detectee_par: "Issam Bousalam", nb_photos: 0, alerte_sans_photo: true, alerte_non_reparee: false,
              alerte_communication_srm: false, alerte_refection_chaussee: false, refection_chaussee_hors_delai: false, alerte_refection_trottoir: false,
              derniere_reparation_le: null, derniere_refection_le: null, verrouillee_le: null, validation_srm_le: null, validation_srm_par: null,
              avis_terrassement_srm_le: null, date_communication_srm: null, motif_sans_reparation: null, visibilite: v.visibilite ?? null,
            });
          });
        }
        return { data: nouvelles, error: null, count: nouvelles.length };
      }
      if (type === "update") {
        retenues.forEach((l) => Object.assign(l, valeurs));
        // Comme le déclencheur de la base : « NOM Prénom » dès que le nom ou le prénom est saisi
        if (this.table === "profils") retenues.forEach((l) => {
          if (l.nom || l.prenom) l.nom_complet = [String(l.nom ?? "").toUpperCase(), l.prenom].filter(Boolean).join(" ");
        });
        return { data: retenues.map(copie), error: null, count: retenues.length };
      }
      if (type === "delete") {
        retenues.forEach((l) => lignes.splice(lignes.indexOf(l), 1));
        return { data: retenues.map(copie), error: null, count: retenues.length };
      }
    }
    const triees = [...retenues].sort((x, y) => {
      for (const o of this.ordres) {
        const [a, b] = [x[o.col], y[o.col]];
        if (a == null && b == null) continue;
        if (a == null) return o.nullsFirst ? -1 : 1;
        if (b == null) return o.nullsFirst ? 1 : -1;
        const c = cmp(a, b);
        if (c) return o.asc ? c : -c;
      }
      return 0;
    });
    const page = triees.slice(this.de, this.a === Infinity ? undefined : this.a + 1).map(copie);
    if (this.tete) return { data: null, error: null, count: retenues.length };
    if (this.forme === "maybeSingle") return { data: page[0] ?? null, error: null, count: null };
    if (this.forme === "single") return page[0] ? { data: page[0], error: null, count: null } : { data: null, error: { message: "Aucune ligne.", code: "PGRST116" }, count: null };
    return { data: page, error: null, count: this.compter ? retenues.length : null };
  }

  then<R1 = Reponse, R2 = never>(ok?: ((v: Reponse) => R1 | PromiseLike<R1>) | null, ko?: ((e: unknown) => R2 | PromiseLike<R2>) | null): PromiseLike<R1 | R2> {
    return new Promise<Reponse>((res) => setTimeout(() => res(this.executer()), 120 + Math.random() * 200)).then(ok ?? undefined, ko ?? undefined);
  }
}

function sessionDemo(): Session {
  return {
    access_token: "demo", refresh_token: "demo", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: ADMIN_ID, email: EMAIL_DEMO, app_metadata: {}, user_metadata: { nom_complet: "Issam Bousalam" }, aud: "authenticated", created_at: new Date().toISOString() },
  } as unknown as Session;
}

const distanceM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

export function creerClientDemo(): SupabaseClient {
  let session: Session | null = (() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem("suivi-fuites:demo:session") === "non" ? null : sessionDemo();
    } catch {
      return sessionDemo();
    }
  })();
  const ecouteurs = new Set<(e: string, s: Session | null) => void>();
  const prevenir = (e: string) => ecouteurs.forEach((f) => f(e, session));
  const memoriser = (ouverte: boolean) => {
    try {
      window.localStorage.setItem("suivi-fuites:demo:session", ouverte ? "oui" : "non");
    } catch {
      /* stockage indisponible */
    }
  };
  const image = (chemin: string) => `https://picsum.photos/seed/${encodeURIComponent(chemin.replace(/[^a-z0-9]/gi, "").slice(-12))}/1200/900`;

  const client = {
    from: (table: string) => new Requete(table),
    rpc: async (nom: string, params: Ligne = {}) => {
      await new Promise((r) => setTimeout(r, 150));
      if (nom === "rechercher_fuites_proches") {
        const lat = params.p_latitude as number | null;
        const lon = params.p_longitude as number | null;
        const ref = params.p_reference as string | null;
        const proches = vFuites.filter((f) => f.marche_id === params.p_marche).map((f) => ({
          id: f.id, numero: f.numero, reference_srm: f.reference_srm, statut: f.statut, date_detection: f.date_detection,
          distance_m: lat != null && lon != null && f.latitude != null && f.longitude != null ? distanceM(lat, lon, f.latitude, f.longitude) : null,
          meme_reference: !!ref && f.reference_srm === ref,
        })).filter((f) => f.meme_reference || (f.distance_m != null && f.distance_m < 60)).slice(0, 3);
        return { data: proches, error: null };
      }
      if (nom === "copier_marche") return { data: crypto.randomUUID(), error: null };
      // Chantier v2 : cloche (N1), comptes (R2), anticipation (A1), fournitures posées (P3)
      const notifs = TABLES.notifications ?? [];
      if (nom === "compter_notifications_non_lues") return { data: notifs.filter((n) => !n.lue_le).length, error: null };
      if (nom === "marquer_notifications_lues") {
        const ids = params.p_ids as number[] | undefined;
        const lues = notifs.filter((n) => !n.lue_le && (!ids || ids.includes(n.id as number)));
        lues.forEach((n) => { n.lue_le = new Date().toISOString(); });
        return { data: lues.length, error: null };
      }
      if (nom === "compte_supprimable") {
        const p = (TABLES.profils ?? []).find((x) => x.id === params.p_profil);
        const fuites = vFuites.filter((f) => f.auteur_terrain_id === params.p_profil).length;
        const saisies: Record<string, number> = p?.identifiant === "nadia" ? {} : { fuites, journal: 12 + fuites };
        const vide = Object.keys(saisies).length === 0;
        return { data: {
          supprimable: !p?.est_admin && vide,
          raison: p?.est_admin ? "Compte administrateur : retirez d'abord le statut d'administrateur"
            : vide ? null : `Ce compte a des saisies (${Object.entries(saisies).map(([k, v]) => `${k} : ${v}`).join(", ")}) : révocation seulement`,
          saisies,
        }, error: null };
      }
      if (nom === "modifier_roles") {
        const liste = TABLES.affectations ?? [];
        const roles = (params.p_roles as string[]) ?? [];
        const a = liste.find((x) => x.profil_id === params.p_profil && x.marche_id === params.p_marche);
        if (a) Object.assign(a, { roles, actif: roles.length > 0 });
        else if (roles.length) liste.push({ id: crypto.randomUUID(), profil_id: params.p_profil, marche_id: params.p_marche, roles, actif: true });
        return { data: null, error: null };
      }
      if (nom === "fuites_anticipees") {
        return { data: anticipeesDemo.filter((f) => f.marche_id === params.p_marche).map((f) => ({
          fuite_id: f.id, fuite_numero: f.numero, premier_lot: 3, attachee_le: TABLES.attachements.find((x) => x.numero === 3)?.date_arret ?? null, articles: 1,
        })), error: null };
      }
      if (nom === "resume_fournitures") {
        const du = params.p_du as string | null;
        const au = params.p_au as string | null;
        const reps = new Map((TABLES.reparations ?? []).map((x) => [x.id, x]));
        const produits = new Map((TABLES.produits_dolibarr ?? []).map((x) => [x.dolibarr_id, x]));
        const groupes = new Map<unknown, Ligne & { fuitesSet: Set<unknown> }>();
        for (const piece of TABLES.reparation_pieces ?? []) {
          const rep = reps.get(piece.reparation_id);
          const jour = String(rep?.realisee_le ?? "").slice(0, 10);
          if (!rep || (du && jour < du) || (au && jour > au)) continue;
          const pr = produits.get(piece.produit_id);
          const g = groupes.get(piece.produit_id) ?? { produit_id: piece.produit_id, designation: pr?.designation ?? "?", famille: pr?.famille ?? null,
            unite: pr?.unite ?? "U", quantite: 0, pieces: 0, fuites: 0, corrections: 0, fuitesSet: new Set() };
          g.quantite = Number(g.quantite) + Number(piece.quantite);
          g.pieces = Number(g.pieces) + 1;
          g.fuitesSet.add(rep.fuite_id);
          groupes.set(piece.produit_id, g);
        }
        return { data: [...groupes.values()].map(({ fuitesSet, ...g }) => ({ ...g, fuites: fuitesSet.size })), error: null };
      }
      return { data: null, error: null };
    },
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session?.user ?? null }, error: null }),
      onAuthStateChange: (f: (e: string, s: Session | null) => void) => {
        ecouteurs.add(f);
        return { data: { subscription: { unsubscribe: () => ecouteurs.delete(f) } } };
      },
      signInWithPassword: async () => {
        await new Promise((r) => setTimeout(r, 400));
        session = sessionDemo();
        memoriser(true);
        prevenir("SIGNED_IN");
        return { data: { session, user: session.user }, error: null };
      },
      signOut: async () => {
        session = null;
        memoriser(false);
        prevenir("SIGNED_OUT");
        return { error: null };
      },
    },
    storage: {
      from: () => ({
        createSignedUrls: async (chemins: string[]) => ({ data: chemins.map((path) => ({ path, signedUrl: image(path), error: null })), error: null }),
        createSignedUrl: async (chemin: string) => ({ data: { signedUrl: image(chemin) }, error: null }),
        upload: async (chemin: string) => ({ data: { path: chemin }, error: null }),
        remove: async () => ({ data: [], error: null }),
        download: async () => ({ data: null, error: { message: "Pas de fichier en mode démonstration." } }),
      }),
    },
    functions: {
      invoke: async () => ({ data: { erreur: "Mode démonstration : les comptes ne sont pas modifiables." }, error: null }),
    },
  };
  return client as unknown as SupabaseClient;
}
