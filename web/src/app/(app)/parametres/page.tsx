"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Banknote, Boxes, ClipboardList, Hammer, Layers3, ListChecks, type LucideIcon, Map, Plus, ReceiptText, Settings2, Users, Wrench,
} from "lucide-react";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import type { TypeDonnee } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ONGLETS_PARAMETRES, type Onglet } from "../_coque/elements-nav";
import { OngletAttachement } from "./OngletAttachement";
import { OngletBordereau } from "./OngletBordereau";
import { OngletCatalogue } from "./OngletCatalogue";
import { OngletEvenements } from "./OngletEvenements";
import { OngletMarche } from "./OngletMarche";
import { OngletNatures } from "./OngletNatures";
import { OngletSecteurs } from "./OngletSecteurs";

interface Ouvrier { id: string; nom_complet: string; telephone: string | null; actif: boolean }
interface Equipe { id: string; type: "detection" | "reparation" | "mixte"; numero: number; libelle: string; actif: boolean }
interface MotifLigne {
  id: string; categorie: "sans_reparation" | "sans_refection"; code: string;
  libelle_fr: string; libelle_ar: string | null; terrassement_paye: boolean; actif: boolean;
}

const TYPES_EQUIPE = { detection: "Détection", reparation: "Réparation", mixte: "Mixte" } as const;
const CATEGORIES = { sans_reparation: "Fuite non réparée", sans_refection: "Clôture sans réfection" } as const;
const ICONES: Record<Onglet, LucideIcon> = {
  marche: Settings2, bordereau: Banknote, attachement: ReceiptText, evenements: ClipboardList, ouvriers: Users, equipes: Hammer,
  motifs: ListChecks, secteurs: Map, natures: Layers3, catalogue: Boxes,
};
const DESCRIPTIONS: Record<Onglet, string> = {
  marche: "Fiche du marché : titulaire, maître d'ouvrage, logos, délais, OS, libellés et alertes du client.",
  bordereau: "Articles du bordereau des prix, avenants et versions, règles de proposition.",
  attachement: "Règles des lots d'attachement : périodicité, mentions obligatoires, verrouillage.",
  evenements: "Journal des événements du marché, pièces jointes, catégories, export.",
  ouvriers: "Ouvriers sans compte, rattachés aux réparations. Jamais supprimés : on les désactive.",
  equipes: "Équipes de détection et de réparation.",
  motifs: "Listes proposées sur la fiche d'une fuite non réparée et à la clôture sans réfection.",
  secteurs: "Zones et secteurs du marché : code, libellé, ordre, linéaire.",
  natures: "Natures de réfection (libellés FR / AR, symbole, emplacement, article lié).",
  catalogue: "Catalogue des pièces : famille, unité, article suggéré.",
};

const codeDepuis = (texte: string) =>
  texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

export default function PageParametres() {
  return (
    <Suspense fallback={<p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement…</p>}>
      <Parametres />
    </Suspense>
  );
}

function Parametres() {
  const { marche, peut } = useSession();
  const router = useRouter();
  const chemin = usePathname();
  const demande = useSearchParams().get("onglet") as Onglet | null;
  const accesParametres = peut("parametres", "creer") || peut("parametres", "modifier");
  const droitDe = (o: Onglet): TypeDonnee => (o === "ouvriers" ? "ouvriers" : o === "evenements" ? "evenements" : "parametres");

  const onglets = ONGLETS_PARAMETRES.filter(([k]) =>
    k === "evenements" ? peut("evenements", "lire")
      : k === "ouvriers" ? peut("ouvriers", "creer") || peut("ouvriers", "modifier")
        : k === "bordereau" ? accesParametres || peut("quantites", "lire")
          : accesParametres,
  );
  const onglet: Onglet = demande && onglets.some(([k]) => k === demande) ? demande : (onglets[0]?.[0] ?? "marche");
  const choisir = (o: Onglet) => router.replace(`${chemin}?onglet=${o}`, { scroll: false });
  const peutCreer = peut(droitDe(onglet), "creer");
  const peutModifier = peut(droitDe(onglet), "modifier");

  const [ouvriers, setOuvriers] = useState<Ouvrier[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [motifs, setMotifs] = useState<MotifLigne[]>([]);
  const [erreur, setErreur] = useState("");
  const [ajout, setAjout] = useState(false);

  const marcheId = marche?.id;

  const charger = useCallback(async () => {
    if (!marcheId) return;
    const sb = getSupabase();
    const [o, e, m] = await Promise.all([
      sb.from("ouvriers").select("id, nom_complet, telephone, actif").eq("marche_id", marcheId).order("nom_complet"),
      sb.from("equipes").select("id, type, numero, libelle, actif").eq("marche_id", marcheId).order("type").order("numero"),
      sb.from("motifs").select("id, categorie, code, libelle_fr, libelle_ar, terrassement_paye, actif").eq("marche_id", marcheId).order("categorie").order("ordre"),
    ]);
    const premiere = o.error || e.error || m.error;
    setErreur(premiere ? messageErreur(premiere) : "");
    setOuvriers((o.data as Ouvrier[] | null) ?? []);
    setEquipes((e.data as Equipe[] | null) ?? []);
    setMotifs((m.data as MotifLigne[] | null) ?? []);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => setAjout(false), [onglet]);

  async function ecrire(table: string, id: string | null, valeurs: Record<string, unknown>): Promise<boolean> {
    setErreur("");
    const sb = getSupabase();
    const { error } = id ? await sb.from(table).update(valeurs).eq("id", id) : await sb.from(table).insert({ ...valeurs, marche_id: marcheId });
    if (error) {
      setErreur(error.code === "23505" ? "Cet élément existe déjà (même numéro, code ou nom)." : messageErreur(error));
      return false;
    }
    await charger();
    return true;
  }
  const basculer = (table: string, id: string, actif: boolean) => ecrire(table, id, { actif: !actif });

  if (!marche) return null;
  if (!accesParametres && !peut("ouvriers", "creer") && !peut("ouvriers", "modifier") && !peut("evenements", "lire")) {
    return <Vide>Votre compte n&apos;a pas accès aux paramètres.</Vide>;
  }
  const titreOnglet = onglets.find(([k]) => k === onglet)?.[1] ?? "";
  const Icone = ICONES[onglet];

  return (
    <div className="flex flex-col gap-4">
      <EnTetePage titre={`Paramètres du marché ${marche.code}`} description={marche.intitule} />
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0" aria-label="Sections">
          {onglets.map(([k, t]) => {
            const I = ICONES[k];
            return (
              <button key={k} type="button" aria-current={onglet === k ? "page" : undefined} onClick={() => choisir(k)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap transition-colors",
                  onglet === k ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}>
                <I className="size-4" />{t}
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg border bg-muted text-muted-foreground"><Icone className="size-4" /></div>
            <div>
              <h2 className="font-medium text-lg leading-tight">{titreOnglet}</h2>
              <p className="text-muted-foreground text-sm">{DESCRIPTIONS[onglet]}</p>
            </div>
          </div>
          {erreur && ["ouvriers", "equipes", "motifs"].includes(onglet) && (
            <Alert variant="destructive"><AlertTitle>Erreur</AlertTitle><AlertDescription>{erreur}</AlertDescription></Alert>
          )}

          <div className="ancien">
            {onglet === "marche" && <OngletMarche marcheId={marche.id} modifiable={peut("parametres", "modifier")} />}
            {onglet === "bordereau" && <OngletBordereau marcheId={marche.id} peutCreer={peut("parametres", "creer")} peutModifier={peut("parametres", "modifier")} />}
            {onglet === "attachement" && <OngletAttachement marcheId={marche.id} modifiable={peut("parametres", "modifier")} />}
            {onglet === "evenements" && <OngletEvenements marcheId={marche.id} />}
            {onglet === "secteurs" && <OngletSecteurs key={marche.id} marcheId={marche.id} peutCreer={peutCreer} peutModifier={peutModifier} />}
            {onglet === "natures" && <OngletNatures key={marche.id} marcheId={marche.id} peutCreer={peutCreer} peutModifier={peutModifier} />}
            {onglet === "catalogue" && <OngletCatalogue key={marche.id} marcheId={marche.id} peutCreer={peutCreer} peutModifier={peutModifier} />}
          </div>

          {onglet === "ouvriers" && (
            <Card>
              <CardHeader>
                <CardTitle className="font-normal">Ouvriers</CardTitle>
                <CardDescription>{ouvriers.length} ouvrier{ouvriers.length > 1 ? "s" : ""}, dont {ouvriers.filter((o) => o.actif).length} actif{ouvriers.filter((o) => o.actif).length > 1 ? "s" : ""}.</CardDescription>
                <CardAction>{peutCreer && !ajout && <Button size="sm" onClick={() => setAjout(true)}><Plus data-icon="inline-start" />Ouvrier</Button>}</CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {ajout && (
                  <div className="ancien rounded-lg border p-3">
                    <FormOuvrier onSubmit={async (v) => (await ecrire("ouvriers", null, v)) && setAjout(false)} annuler={() => setAjout(false)} />
                  </div>
                )}
                {ouvriers.length === 0 ? <Vide className="h-24">Aucun ouvrier.</Vide> : (
                  <ItemGroup>
                    {ouvriers.map((o) => <LigneOuvrier key={o.id} o={o} editable={peutModifier} ecrire={ecrire} basculer={basculer} />)}
                  </ItemGroup>
                )}
              </CardContent>
            </Card>
          )}

          {onglet === "equipes" && (
            <Card>
              <CardHeader>
                <CardTitle className="font-normal">Équipes</CardTitle>
                <CardDescription>Numérotées par type ; le libellé par défaut suit le numéro.</CardDescription>
                <CardAction>{peutCreer && !ajout && <Button size="sm" onClick={() => setAjout(true)}><Plus data-icon="inline-start" />Équipe</Button>}</CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {ajout && (
                  <div className="ancien rounded-lg border p-3">
                    <FormEquipe suivant={(type) => Math.max(0, ...equipes.filter((q) => q.type === type).map((q) => q.numero)) + 1}
                      onSubmit={async (v) => (await ecrire("equipes", null, v)) && setAjout(false)} annuler={() => setAjout(false)} />
                  </div>
                )}
                {equipes.length === 0 ? <Vide className="h-24">Aucune équipe.</Vide> : (
                  <ItemGroup>
                    {equipes.map((q) => (
                      <Item key={q.id} variant="outline" size="sm" className={cn(!q.actif && "opacity-60")}>
                        <ItemMedia><div className="grid size-9 place-items-center rounded-md border bg-background"><Wrench className="size-4 text-muted-foreground" /></div></ItemMedia>
                        <ItemContent>
                          <ItemTitle>{q.libelle}</ItemTitle>
                          <ItemDescription>{TYPES_EQUIPE[q.type]} n° {q.numero}{q.actif ? "" : " · désactivée"}</ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <Badge variant="outline" className={q.actif ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300" : "text-muted-foreground"}>{q.actif ? "Active" : "Désactivée"}</Badge>
                          {peutModifier && <Button size="sm" variant="outline" onClick={() => basculer("equipes", q.id, q.actif)}>{q.actif ? "Désactiver" : "Réactiver"}</Button>}
                        </ItemActions>
                      </Item>
                    ))}
                  </ItemGroup>
                )}
              </CardContent>
            </Card>
          )}

          {onglet === "motifs" && (
            <div className="flex flex-col gap-4">
              {(Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]).map((c) => (
                <Card key={c}>
                  <CardHeader>
                    <CardTitle className="font-normal">{CATEGORIES[c]}</CardTitle>
                    <CardDescription>{motifs.filter((m) => m.categorie === c).length} motif{motifs.filter((m) => m.categorie === c).length > 1 ? "s" : ""}.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {motifs.filter((m) => m.categorie === c).length === 0 ? <Vide className="h-20">Aucun motif.</Vide> : (
                      <ItemGroup>
                        {motifs.filter((m) => m.categorie === c).map((m) => (
                          <Item key={m.id} variant="outline" size="sm" className={cn(!m.actif && "opacity-60")}>
                            <ItemContent>
                              <ItemTitle>{m.libelle_fr}{m.libelle_ar && <span dir="rtl" lang="ar" className="ml-2 text-muted-foreground font-normal">{m.libelle_ar}</span>}</ItemTitle>
                              <ItemDescription>{m.terrassement_paye ? "Terrassement payé" : "Terrassement non payé"}{m.actif ? "" : " · désactivé"}</ItemDescription>
                            </ItemContent>
                            <ItemActions>
                              {peutModifier && <Button size="sm" variant="outline" onClick={() => basculer("motifs", m.id, m.actif)}>{m.actif ? "Désactiver" : "Réactiver"}</Button>}
                            </ItemActions>
                          </Item>
                        ))}
                      </ItemGroup>
                    )}
                  </CardContent>
                </Card>
              ))}
              {peutCreer && (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-normal">Nouveau motif</CardTitle>
                    <CardAction>{!ajout && <Button size="sm" onClick={() => setAjout(true)}><Plus data-icon="inline-start" />Motif</Button>}</CardAction>
                  </CardHeader>
                  {ajout && (
                    <CardContent className="ancien">
                      <FormMotif onSubmit={async (v) => (await ecrire("motifs", null, v)) && setAjout(false)} annuler={() => setAjout(false)} />
                    </CardContent>
                  )}
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Ecrire = (table: string, id: string | null, v: Record<string, unknown>) => Promise<boolean>;
type Basculer = (table: string, id: string, actif: boolean) => Promise<boolean>;

function LigneOuvrier({ o, editable, ecrire, basculer }: { o: Ouvrier; editable: boolean; ecrire: Ecrire; basculer: Basculer }) {
  const [edition, setEdition] = useState(false);
  if (edition) {
    return (
      <div className="ancien rounded-lg border p-3">
        <FormOuvrier initial={o} onSubmit={async (v) => (await ecrire("ouvriers", o.id, v)) && setEdition(false)} annuler={() => setEdition(false)} />
      </div>
    );
  }
  return (
    <Item variant="outline" size="sm" className={cn(!o.actif && "opacity-60")}>
      <ItemMedia><div className="grid size-9 place-items-center rounded-md border bg-background font-medium text-xs">{o.nom_complet.split(/\s+/).slice(0, 2).map((m) => m[0]?.toUpperCase()).join("")}</div></ItemMedia>
      <ItemContent>
        <ItemTitle>{o.nom_complet}</ItemTitle>
        <ItemDescription>{o.telephone ?? "Sans téléphone"}{o.actif ? "" : " · désactivé"}</ItemDescription>
      </ItemContent>
      {editable && (
        <ItemActions>
          <Button size="sm" variant="ghost" onClick={() => setEdition(true)}>Modifier</Button>
          <Button size="sm" variant="outline" onClick={() => basculer("ouvriers", o.id, o.actif)}>{o.actif ? "Désactiver" : "Réactiver"}</Button>
        </ItemActions>
      )}
    </Item>
  );
}

function FormOuvrier({ initial, onSubmit, annuler }: { initial?: Ouvrier; onSubmit: (v: Record<string, unknown>) => void; annuler: () => void }) {
  const [nom, setNom] = useState(initial?.nom_complet ?? "");
  const [tel, setTel] = useState(initial?.telephone ?? "");
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ nom_complet: nom.trim(), telephone: tel.trim() || null });
  };
  return (
    <form onSubmit={envoyer}>
      <div className="deux">
        <label>Nom complet<input value={nom} onChange={(e) => setNom(e.target.value)} required /></label>
        <label>Téléphone<input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" /></label>
      </div>
      <div className="actions"><button className="primaire" disabled={!nom.trim()}>Enregistrer</button><button type="button" onClick={annuler}>Annuler</button></div>
    </form>
  );
}

function FormEquipe({ suivant, onSubmit, annuler }: { suivant: (t: Equipe["type"]) => number; onSubmit: (v: Record<string, unknown>) => void; annuler: () => void }) {
  const [type, setType] = useState<Equipe["type"]>("reparation");
  const [libelle, setLibelle] = useState("");
  const numero = suivant(type);
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ type, numero, libelle: libelle.trim() || `${TYPES_EQUIPE[type]} ${numero}` });
  };
  return (
    <form onSubmit={envoyer}>
      <div className="deux">
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as Equipe["type"])}>
            {Object.entries(TYPES_EQUIPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Libellé (n° {numero})<input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder={`${TYPES_EQUIPE[type]} ${numero}`} /></label>
      </div>
      <div className="actions"><button className="primaire">Enregistrer</button><button type="button" onClick={annuler}>Annuler</button></div>
    </form>
  );
}

function FormMotif({ onSubmit, annuler }: { onSubmit: (v: Record<string, unknown>) => void; annuler: () => void }) {
  const [categorie, setCategorie] = useState<MotifLigne["categorie"]>("sans_reparation");
  const [fr, setFr] = useState("");
  const [ar, setAr] = useState("");
  const [paye, setPaye] = useState(false);
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ categorie, code: codeDepuis(fr), libelle_fr: fr.trim(), libelle_ar: ar.trim() || null, terrassement_paye: paye, ordre: 900 });
  };
  return (
    <form onSubmit={envoyer}>
      <div className="deux">
        <label>
          Liste
          <select value={categorie} onChange={(e) => setCategorie(e.target.value as MotifLigne["categorie"])}>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Libellé en français<input value={fr} onChange={(e) => setFr(e.target.value)} required /></label>
        <label>Libellé en arabe (facultatif)<input value={ar} onChange={(e) => setAr(e.target.value)} dir="rtl" lang="ar" /></label>
        <label className="ligne"><input type="checkbox" checked={paye} onChange={(e) => setPaye(e.target.checked)} />Terrassement payé malgré l&apos;absence de réparation</label>
      </div>
      <div className="actions"><button className="primaire" disabled={!codeDepuis(fr)}>Enregistrer</button><button type="button" onClick={annuler}>Annuler</button></div>
    </form>
  );
}
