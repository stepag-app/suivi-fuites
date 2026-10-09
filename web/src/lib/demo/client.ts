// Client Supabase de démonstration : mêmes appels (from / select / eq / order / range, auth, storage, rpc,
// functions), servis depuis les tables en mémoire de donnees.ts. Rien n'est envoyé nulle part.
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_ID, EMAIL_DEMO, TABLES, profils, secteurs, vFuites } from "./donnees";

type Ligne = Record<string, unknown>;
type Reponse = { data: unknown; error: { message: string; code?: string } | null; count: number | null };
type Filtre = (l: Ligne) => boolean;

const copie = (l: Ligne) => ({ ...l });
const nomProfil = (pid: unknown) => profils.find((p) => p.id === pid)?.nom_complet ?? null;
const nombreOuNul = (v: unknown) => (v == null || v === "" ? null : Number(v));

// Vues calculées à la lecture (chantier v2) : étapes à valider, pièces déclarées par le terrain.
function vueCalculee(table: string): Ligne[] | null {
  if (table === "v_a_valider") {
    const photos = (TABLES.photos ?? []).filter((p) => p.supprime_le == null);
    const fuite = (id: unknown) => vFuites.find((f) => f.id === id) as unknown as Ligne | undefined;
    const ligne = (etape: string, l: Ligne, f: Ligne, date: unknown, nb: number): Ligne => ({
      etape, id: l.id, marche_id: l.marche_id, fuite_id: f.id, fuite_numero: f.numero, reference_srm: f.reference_srm, adresse: f.adresse,
      statut: f.statut, resultat: etape === "detection" ? null : l.resultat, date_etape: date, auteur_terrain_id: l.auteur_terrain_id,
      auteur: nomProfil(l.auteur_terrain_id), saisi_par: l.saisi_par, cree_le: l.cree_le, saisie_differee: f.saisie_differee ?? false,
      fuite_validee_le: f.validee_le ?? null, nb_photos: nb,
    });
    return [
      ...(vFuites as unknown as Ligne[]).filter((f) => !f.validee_le && !f.supprime_le).map((f) => ligne("detection", f, f, f.date_detection,
        photos.filter((p) => p.fuite_id === f.id && !p.reparation_id && !p.refection_id).length)),
      ...(TABLES.reparations ?? []).filter((r) => !r.validee_le && !r.supprime_le && fuite(r.fuite_id)).map((r) => ligne("reparation", r, fuite(r.fuite_id)!, r.realisee_le,
        photos.filter((p) => p.reparation_id === r.id && !p.refection_id).length)),
      ...(TABLES.refections ?? []).filter((r) => !r.validee_le && !r.supprime_le && fuite(r.fuite_id)).map((r) => ligne("refection", r, fuite(r.fuite_id)!, r.realisee_le,
        photos.filter((p) => p.refection_id === r.id).length)),
    ];
  }
  if (table === "v_pieces_terrain") {
    const articles = TABLES.produits_dolibarr ?? [];
    return (TABLES.reparation_pieces ?? []).filter((p) => p.supprime_le == null && p.provenance === "terrain").map((p) => {
      const a = articles.find((x) => x.dolibarr_id === p.produit_id);
      return { ...p, designation: a?.designation ?? null, unite: a?.unite ?? "u" };
    });
  }
  return null;
}

// Effets des écritures que la base ferait elle-même (déclencheurs), assez pour que la démonstration suive.
function completerInsertion(table: string, v: Ligne) {
  const maintenant = new Date().toISOString();
  if (["reparations", "refections", "fuites", "photos"].includes(table)) {
    v.saisi_par = ADMIN_ID;
    v.auteur_terrain_id = v.auteur_terrain_id ?? ADMIN_ID;
    v.supprime_le = null;
  }
  if (["reparations", "refections", "fuites"].includes(table)) {
    v.validee_par = v.validee_le ? ADMIN_ID : null;
    v.validee_le = v.validee_le ? maintenant : null;
  }
  if (table === "reparations") {
    v.realisee_le = v.realisee_le ?? maintenant;
    const [L, l, P] = [nombreOuNul(v.fouille_longueur_m), nombreOuNul(v.fouille_largeur_m), nombreOuNul(v.fouille_profondeur_m)];
    v.volume_m3 = L != null && l != null && P != null ? Math.round(L * l * P * 1000) / 1000 : null;
    if (v.representant_srm_id) v.representant_srm = (TABLES.representants_srm ?? []).find((r) => r.id === v.representant_srm_id)?.nom ?? null;
    const f = vFuites.find((x) => x.id === v.fuite_id);
    if (f && v.resultat !== "non_reparee") {
      Object.assign(f, { statut: v.resultat === "reparee" ? "reparee" : "en_reparation", derniere_reparation_le: v.realisee_le, emplacement_fouille: v.emplacement ?? null });
    }
  }
  if (table === "refections") {
    v.realisee_le = v.realisee_le ?? maintenant;
    const rep = (TABLES.reparations ?? []).find((r) => r.id === v.reparation_id);
    v.nature_id = v.nature_id ?? (v.resultat === "faite" ? rep?.nature_revetement_id ?? null : null);
    v.longueur_m = v.longueur_m ?? (v.resultat === "faite" ? rep?.fouille_longueur_m ?? null : null);
    v.largeur_m = v.largeur_m ?? (v.resultat === "faite" ? rep?.fouille_largeur_m ?? null : null);
    const [L, l] = [nombreOuNul(v.longueur_m), nombreOuNul(v.largeur_m)];
    v.surface_m2 = L != null && l != null ? Math.round(L * l * 1000) / 1000 : null;
    const f = vFuites.find((x) => x.id === v.fuite_id);
    if (f) Object.assign(f, { statut: "achevee", derniere_refection_le: v.realisee_le });
  }
  if (table === "reparation_pieces") Object.assign(v, { provenance: "terrain", etat: "posee", nature_correction: null, supprime_le: null, designation_libre: null });
  if (table === "diametres_materiau" || table === "representants_srm") v.actif = v.actif ?? true;
  if (table === "photos") {
    const f = vFuites.find((x) => x.id === v.fuite_id);
    if (f) Object.assign(f, { nb_photos: f.nb_photos + 1, alerte_sans_photo: false });
    v.prise_le = v.prise_le ?? maintenant;
  }
}

function completerModification(table: string, l: Ligne, v: Ligne) {
  const maintenant = new Date().toISOString();
  if ("validee_le" in v) Object.assign(v, { validee_le: v.validee_le ? l.validee_le ?? maintenant : null, validee_par: v.validee_le ? l.validee_par ?? ADMIN_ID : null });
  if (table === "fuites") {
    const pos = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(String(v.position ?? ""));
    if (pos) Object.assign(v, { latitude: Number(pos[2]), longitude: Number(pos[1]) });
    if ("secteur_id" in v) v.secteur = secteurs.find((x) => x.id === v.secteur_id)?.libelle ?? null;
    if ("auteur_terrain_id" in v) v.detectee_par = nomProfil(v.auteur_terrain_id);
    if (v.motif_modification) Object.assign(v, { motif_correction: v.motif_modification, corrigee_par: ADMIN_ID, corrigee_le: maintenant });
    delete v.motif_modification;
  }
  if (table === "reparations") {
    const n = { ...l, ...v };
    const [L, w, P] = [nombreOuNul(n.fouille_longueur_m), nombreOuNul(n.fouille_largeur_m), nombreOuNul(n.fouille_profondeur_m)];
    v.volume_m3 = L != null && w != null && P != null ? Math.round(L * w * P * 1000) / 1000 : null;
    if (v.representant_srm_id) v.representant_srm = (TABLES.representants_srm ?? []).find((r) => r.id === v.representant_srm_id)?.nom ?? null;
  }
  if (table === "refections") {
    const n = { ...l, ...v };
    const [L, w] = [nombreOuNul(n.longueur_m), nombreOuNul(n.largeur_m)];
    v.surface_m2 = L != null && w != null ? Math.round(L * w * 1000) / 1000 : null;
  }
  if (table === "reparation_pieces") {
    if (v.etat === "retiree") Object.assign(v, { etat_le: maintenant, motif_retrait: v.motif_modification ?? null });
    delete v.motif_modification;
  }
}
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
  // Alias des colonnes (« id:dolibarr_id ») : repris à la lecture
  private alias: [string, string][] = [];

  constructor(private table: string) {}

  select(cols?: string, opts?: { head?: boolean; count?: string }) {
    this.alias = (cols ?? '').split(',').map((c) => /^\s*(\w+):(\w+)\s*$/.exec(c)).filter((m): m is RegExpExecArray => !!m).map((m) => [m[1], m[2]]);
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
    const lignes = vueCalculee(this.table) ?? TABLES[this.table] ?? (TABLES[this.table] = []);
    const retenues = lignes.filter((l) => this.filtres.every((f) => f(l)));
    if (this.ecriture) {
      const { type, valeurs } = this.ecriture;
      if (type === "insert" || type === "upsert") {
        const nouvelles: Ligne[] = (Array.isArray(valeurs) ? valeurs : [valeurs!]).map((v) => ({ id: crypto.randomUUID(), ...v, cree_le: new Date().toISOString() }));
        if (this.table !== "fuites") nouvelles.forEach((v) => completerInsertion(this.table, v));
        // Pièce qui en remplace une autre (correction du bureau) : l'ancienne est marquée « remplacée ».
        if (this.table === "reparation_pieces") {
          nouvelles.forEach((v) => {
            if (!v.remplace_piece_id) return;
            Object.assign(v, { provenance: "correction", nature_correction: "remplacement", motif_correction: v.motif_modification ?? null });
            const ancienne = lignes.find((x) => x.id === v.remplace_piece_id);
            if (ancienne) Object.assign(ancienne, { etat: "remplacee", etat_le: new Date().toISOString() });
          });
        }
        lignes.push(...nouvelles);
        if (this.table === "fuites") {
          // Une fuite saisie en démonstration apparaît aussitôt dans la vue des fuites.
          nouvelles.forEach((v) => {
            completerInsertion("fuites", v);
            const marche = v.marche_id as string;
            const numero = Math.max(0, ...vFuites.filter((f) => f.marche_id === marche && Number.isFinite(f.numero)).map((f) => f.numero)) + 1;
            const pos = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(String(v.position ?? ""));
            Object.assign(v, {
              numero, statut: "detectee", origine: "stepag", zone: null, latitude: pos ? Number(pos[2]) : null, longitude: pos ? Number(pos[1]) : null,
              date_detection: v.date_detection ?? new Date().toISOString(), detectee_par: nomProfil(v.auteur_terrain_id), nb_photos: 0, alerte_sans_photo: true, alerte_non_reparee: false,
              alerte_communication_srm: false, alerte_refection_chaussee: false, refection_chaussee_hors_delai: false, alerte_refection_trottoir: false,
              derniere_reparation_le: null, derniere_refection_le: null, verrouillee_le: null, validation_srm_le: null, validation_srm_par: null,
              avis_terrassement_srm_le: null, date_communication_srm: null, motif_sans_reparation: null, visibilite: v.visibilite ?? null,
              secteur: secteurs.find((x) => x.id === v.secteur_id)?.libelle ?? null, motif_correction: null,
              saisie_differee: !!v.date_detection && Date.now() - new Date(v.date_detection as string).getTime() > 12 * 3_600_000 && (v.source_saisie !== "tablette" || v.auteur_terrain_id !== ADMIN_ID),
            });
          });
        }
        return { data: nouvelles, error: null, count: nouvelles.length };
      }
      if (type === "update") {
        retenues.forEach((l) => {
          const v = { ...valeurs };
          completerModification(this.table, l, v);
          Object.assign(l, v);
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
    const page = triees.slice(this.de, this.a === Infinity ? undefined : this.a + 1).map((l) => {
      const c = copie(l);
      this.alias.forEach(([nom, col]) => { c[nom] = l[col]; });
      return c;
    });
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
      if (nom === "valider_etapes") {
        const tables: Record<string, string> = { detection: "fuites", reparation: "reparations", refection: "refections" };
        let n = 0;
        for (const e of (params.p_elements as { etape: string; id: string }[]) ?? []) {
          const l = (TABLES[tables[e.etape]] ?? []).find((x) => x.id === e.id && !x.validee_le && !x.supprime_le);
          if (l) {
            Object.assign(l, { validee_le: new Date().toISOString(), validee_par: ADMIN_ID });
            n++;
          }
        }
        return { data: n, error: null };
      }
      if (nom === "suggestions_localisation") {
        // Suggestions fictives autour du point : deux rues, le secteur de la fuite la plus proche, un tronçon de 40 m.
        const lat = params.p_latitude as number;
        const lon = params.p_longitude as number;
        const precision = params.p_precision_m as number | null;
        if (precision != null && precision > 200) return { data: { rayon_m: null, precision_insuffisante: true, rues: [], secteur: null, troncon: null }, error: null };
        const proche = vFuites.filter((f) => f.marche_id === params.p_marche && f.latitude != null)
          .map((f) => ({ f, d: distanceM(lat, lon, f.latitude!, f.longitude!) })).sort((a, b) => a.d - b.d)[0];
        const s = proche ? secteurs.find((x) => x.id === proche.f.secteur_id) : null;
        const rues = ["Rue Ibn Sina", "Bd Mohammed V", "Rue de Taza"];
        const k = Math.abs(Math.round(lat * 1e4 + lon * 1e4)) % rues.length;
        return {
          data: {
            rayon_m: Math.min(150, Math.max(30, Math.ceil(2 * (precision ?? 15)))), precision_insuffisante: false,
            rues: [{ nom: rues[k], nom_fr: rues[k], nom_ar: null, distance_m: 8.4 }, { nom: rues[(k + 1) % 3], nom_fr: rues[(k + 1) % 3], nom_ar: null, distance_m: 27.1 }],
            secteur: s ? { id: s.id, code: s.code, libelle: s.libelle, zone_id: s.zone_id, source: "contour" } : null,
            troncon: {
              id: "dddddddd-0000-4000-8000-00000000t001", reference: "T-1042", diametre_mm: 63, materiau: "polyethylene", materiau_plan: "PEHD",
              secteur_id: s?.id ?? null, distance_m: 4.2,
              geojson: { type: "LineString", coordinates: [[lon - 0.0003, lat + 0.00004], [lon + 0.0003, lat - 0.00002]] },
            },
          },
          error: null,
        };
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
