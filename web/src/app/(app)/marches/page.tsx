"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Briefcase, Check, ChevronDown, CircleDashed, Copy, EllipsisVertical, Footprints, Plus, Power, RefreshCw, Search, Settings, Users,
} from "lucide-react";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";
import { compterFuites } from "@/lib/colonnes-fuites";
import { getSupabase, lireTout } from "@/lib/supabase";
import type { Profil, StatutFuite } from "@/lib/types";
import { cn, pourcent } from "@/lib/utils";

interface MarcheLigne {
  id: string; code: string; numero: string; intitule: string; client: string; ville: string | null; date_commencement: string | null; actif: boolean;
}
interface Affectation { id: string; profil_id: string; marche_id: string; roles: string[]; actif: boolean }
const ROLES: Record<string, string> = { detection: "Détection", chef_reparation: "Chef réparation", responsable: "Responsable" };

function Jauge({ libelle, valeur, couleur }: { libelle: string; valeur: number; couleur: string }) {
  return (
    <span className="min-w-0 space-y-1">
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-muted-foreground">{libelle}</span>
        <span className="font-medium tabular-nums">{valeur} %</span>
      </span>
      <span className="block h-1.5 overflow-hidden rounded-full bg-muted-foreground/20">
        <span className={cn("block h-full rounded-full", couleur)} style={{ width: `${valeur}%` }} />
      </span>
    </span>
  );
}

export default function Marches() {
  const { profil, marche, choisirMarche, recharger, verrouille } = useSession();
  const router = useRouter();
  const [liste, setListe] = useState<MarcheLigne[]>([]);
  const [profils, setProfils] = useState<Profil[]>([]);
  const [affectations, setAffectations] = useState<Affectation[]>([]);
  const [statuts, setStatuts] = useState<{ marche_id: string; statut: StatutFuite; nb: number }[]>([]);
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [creation, setCreation] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [etat, setEtat] = useState<"tous" | "actifs" | "inactifs">("tous");
  const [chargement, setChargement] = useState(true);
  const estAdmin = profil?.est_admin === true;

  const charger = useCallback(async () => {
    const sb = getSupabase();
    setChargement(true);
    const [m, p, a, f] = await Promise.all([
      sb.from("marches").select("id, code, numero, intitule, client, ville, date_commencement, actif")
        .order("actif", { ascending: false }).order("date_commencement", { ascending: false, nullsFirst: false }).order("code"),
      sb.from("profils").select("id, identifiant, nom_complet, telephone, langue, est_admin, actif").order("nom_complet"),
      sb.from("affectations").select("id, profil_id, marche_id, roles, actif"),
      // Comptes par marché et statut calculés par la base ; sans la fonction (migration à venir, démonstration) : une ligne par fuite.
      compterFuites()
        .then((c) => c ?? lireTout<{ marche_id: string; statut: StatutFuite }>((de, a2) => sb.from("v_fuites").select("id, marche_id, statut")
          .order("id").range(de, a2), 1000, 50000).then((l) => l.map((x) => ({ marche_id: x.marche_id, statut: x.statut, nb: 1 }))))
        .then((data) => ({ data, error: null }), (error: { message: string }) => ({ data: null, error })),
    ]);
    setErreur(m.error ? messageErreur(m.error) : "");
    setListe((m.data as MarcheLigne[] | null) ?? []);
    setProfils((p.data as Profil[] | null) ?? []);
    setAffectations((a.data as Affectation[] | null) ?? []);
    setStatuts(f.data ?? []);
    setChargement(false);
  }, []);

  useEffect(() => {
    if (estAdmin) charger();
  }, [estAdmin, charger]);

  const filtres = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    return liste.filter((m) => (etat === "tous" || (etat === "actifs" ? m.actif : !m.actif))
      && (!t || m.code.toLowerCase().includes(t) || m.intitule.toLowerCase().includes(t) || m.client.toLowerCase().includes(t) || m.numero.toLowerCase().includes(t)));
  }, [liste, recherche, etat]);

  if (!estAdmin) return <Vide>Page réservée à l&apos;administrateur.</Vide>;

  async function basculer(m: MarcheLigne) {
    if (m.actif && !window.confirm(`Désactiver le marché ${m.code} ? Il ne sera plus proposé aux agents (rien n'est supprimé, il pourra être réactivé).`)) return;
    setErreur("");
    setInfo("");
    const { error } = await getSupabase().from("marches").update({ actif: !m.actif }).eq("id", m.id);
    if (error) {
      setErreur(messageErreur(error));
      return;
    }
    setInfo(`Marché ${m.code} ${m.actif ? "désactivé" : "réactivé"}.`);
    await charger();
    recharger();
  }

  // Fin du marché : tracés GPS effacés (X6), seulement sur un marché désactivé.
  async function purgerTraces(m: MarcheLigne) {
    if (!window.confirm(`Effacer définitivement tous les tracés GPS des agents du marché ${m.code} ? Les fuites, photos et attachements ne sont pas touchés.`)) return;
    setErreur("");
    setInfo("");
    const { data, error } = await getSupabase().rpc("purger_traces_marche", { p_marche: m.id });
    if (error) {
      setErreur(messageErreur(error));
      return;
    }
    setInfo(`Marché ${m.code} : ${Number(data ?? 0)} tracé${Number(data) > 1 ? "s" : ""} GPS effacé${Number(data) > 1 ? "s" : ""}.`);
  }

  function ouvrir(m: MarcheLigne) {
    choisirMarche(m.id);
    router.push("/parametres");
  }

  async function creer(v: Valeurs): Promise<boolean> {
    setErreur("");
    setInfo("");
    const sb = getSupabase();
    let id: string | null = null;
    if (v.source) {
      const { data, error } = await sb.rpc("copier_marche", { p_source: v.source, p_code: v.code, p_numero: v.numero, p_intitule: v.intitule, p_client: v.client, p_ville: v.ville });
      if (error) {
        setErreur(error.code === "23505" ? "Ce code de marché existe déjà." : messageErreur(error));
        return false;
      }
      id = data as string;
    } else {
      const nouveau = crypto.randomUUID();
      const { error } = await sb.from("marches").insert({ id: nouveau, code: v.code, numero: v.numero, intitule: v.intitule, client: v.client, ville: v.ville || null });
      if (error) {
        setErreur(error.code === "23505" ? "Ce code de marché existe déjà." : messageErreur(error));
        return false;
      }
      id = nouveau;
    }
    const source = liste.find((m) => m.id === v.source);
    setInfo(source
      ? `Marché ${v.code} créé avec les paramètres de ${source.code}. Complétez sa fiche (dates, OS, montant) dans Paramètres > Marché, puis affectez les agents dans Utilisateurs.`
      : `Marché ${v.code} créé. Renseignez sa fiche, son bordereau et ses secteurs dans Paramètres, puis affectez les agents dans Utilisateurs.`);
    setCreation(false);
    await charger();
    recharger();
    if (id) choisirMarche(id);
    return true;
  }

  const actifs = liste.filter((m) => m.actif).length;
  const agents = new Set(affectations.filter((a) => a.actif).map((a) => a.profil_id)).size;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <EnTetePage titre="Marchés" description="Chaque marché a ses chantiers, agents, bordereau et rapports. Un marché désactivé n'est plus proposé aux agents ; ses données restent intactes."
          actions={
            <>
              <span className="whitespace-nowrap text-muted-foreground text-sm">{liste.length} marché{liste.length > 1 ? "s" : ""}</span>
              <Button variant="outline" size="icon-sm" onClick={charger} disabled={chargement} aria-label="Actualiser"><RefreshCw className={chargement ? "animate-spin" : undefined} /></Button>
              <Button size="sm" onClick={() => { setCreation(true); setInfo(""); }}><Plus data-icon="inline-start" />Nouveau marché</Button>
            </>
          } />
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="h-auto gap-1 rounded-sm px-1.5 py-0.5"><Briefcase />{liste.length} marché{liste.length > 1 ? "s" : ""}</Badge>
          <Badge variant="outline" className="h-auto gap-1 rounded-sm px-1.5 py-0.5"><span className="size-2 rounded-full bg-green-600 dark:bg-green-500" />{actifs} actif{actifs > 1 ? "s" : ""}</Badge>
          <Badge variant="outline" className="h-auto gap-1 rounded-sm px-1.5 py-0.5"><Users />{agents} agent{agents > 1 ? "s" : ""} affecté{agents > 1 ? "s" : ""}</Badge>
          <Badge variant="outline" className="h-auto gap-1 rounded-sm px-1.5 py-0.5">{statuts.reduce((t, s) => t + s.nb, 0).toLocaleString("fr-FR")} fuites au total</Badge>
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row">
        <InputGroup className="flex-1">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput placeholder="Code, numéro, intitulé ou client…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          <InputGroupAddon align="inline-end"><Kbd>⌘ J</Kbd></InputGroupAddon>
        </InputGroup>
        <ToggleGroup type="single" variant="outline" spacing={0} value={etat} onValueChange={(v) => v && setEtat(v as typeof etat)}>
          <ToggleGroupItem value="tous">Tous</ToggleGroupItem>
          <ToggleGroupItem value="actifs">Actifs</ToggleGroupItem>
          <ToggleGroupItem value="inactifs">Désactivés</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {erreur && <Alert variant="destructive"><AlertTitle>Erreur</AlertTitle><AlertDescription>{erreur}</AlertDescription></Alert>}
      {info && <Alert className="border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-50"><Check /><AlertTitle>Fait</AlertTitle><AlertDescription className="text-green-900/80 dark:text-green-50/80">{info}</AlertDescription></Alert>}

      {chargement && liste.length === 0 && <p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement…</p>}
      {!chargement && filtres.length === 0 && <Vide>Aucun marché.</Vide>}

      <div className="flex flex-col gap-4">
        {filtres.map((m) => {
          const siennes = affectations.filter((a) => a.marche_id === m.id);
          const fuites = statuts.filter((s) => s.marche_id === m.id);
          const somme = (...st: StatutFuite[]) => fuites.reduce((t, s) => t + (st.includes(s.statut) ? s.nb : 0), 0);
          const n = fuites.reduce((t, s) => t + s.nb, 0);
          const reparees = somme("reparee", "achevee");
          const achevees = somme("achevee", "sans_reparation");
          const enAttente = somme("detectee", "en_reparation");
          return (
            <Collapsible key={m.id} defaultOpen={m.actif} className="flex flex-col overflow-hidden rounded-xl border bg-card py-3 text-card-foreground data-[state=open]:gap-3 data-[state=open]:pb-0">
              <div className="flex flex-col gap-2 px-4 sm:flex-row sm:items-center">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="group -ml-2 h-auto w-full justify-start gap-2 px-2 py-1 hover:bg-transparent aria-expanded:bg-transparent sm:flex-1">
                    <ChevronDown className="group-data-[state=open]:rotate-180" />
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-left">
                      <span className="shrink-0 font-medium leading-none">{m.code}</span>
                      <span className="min-w-0 truncate text-muted-foreground text-sm">({m.numero} · {m.client}{m.ville ? ` · ${m.ville}` : ""})</span>
                    </div>
                    {m.id === marche?.id && <Badge variant="outline" className="ml-2 rounded-sm">ouvert</Badge>}
                    <Badge variant="secondary" className={cn("ml-1 rounded-sm px-1.5 py-0.5", m.actif ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                      <span className={cn("size-1.5 rounded-full", m.actif ? "bg-emerald-500" : "bg-muted-foreground")} />{m.actif ? "Actif" : "Désactivé"}
                    </Badge>
                  </Button>
                </CollapsibleTrigger>
                <div className="flex w-full items-center justify-between gap-2 sm:ml-auto sm:w-auto sm:justify-end">
                  <Button variant="ghost" size="sm" className="-ml-1.5 sm:ml-0" onClick={() => ouvrir(m)}><Settings data-icon="inline-start" />Paramètres</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="outline" size="icon-sm" aria-label="Actions"><EllipsisVertical /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem onSelect={() => { choisirMarche(m.id); router.push("/tableau-de-bord"); }}><Briefcase />Ouvrir ce marché</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => ouvrir(m)}><Settings />Paramètres</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => { choisirMarche(m.id); router.push("/utilisateurs"); }}><Users />Agents</DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem onSelect={() => navigator.clipboard?.writeText(m.id)}><Copy />Copier l&apos;identifiant</DropdownMenuItem>
                        {m.actif && verrouille("marches", "desactiver") ? (
                          <DropdownMenuItem disabled><Power />Désactiver (verrouillé par vous)</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem variant={m.actif ? "destructive" : "default"} onSelect={() => basculer(m)}><Power />{m.actif ? "Désactiver" : "Réactiver"}</DropdownMenuItem>
                        )}
                        {!m.actif && <DropdownMenuItem variant="destructive" onSelect={() => purgerTraces(m)}><Footprints />Effacer les tracés GPS</DropdownMenuItem>}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <CollapsibleContent>
                <div className="grid gap-4 border-t bg-muted/30 px-5 py-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                  <Jauge libelle="Réparées" valeur={pourcent(reparees, n)} couleur="bg-sky-500" />
                  <Jauge libelle="Achevées" valeur={pourcent(achevees, n)} couleur="bg-emerald-500" />
                  <Jauge libelle="En attente" valeur={pourcent(enAttente, n)} couleur={enAttente ? "bg-amber-500" : "bg-emerald-500"} />
                  <span className="text-muted-foreground text-xs tabular-nums">{n} fuite{n > 1 ? "s" : ""} · {m.intitule}</span>
                </div>
                {siennes.length === 0 ? (
                  <div className="flex min-h-20 items-center justify-center border-t bg-muted/50 p-4">
                    <div className="flex items-center gap-2"><CircleDashed className="size-4" /><p className="font-medium text-sm">Aucun agent affecté à ce marché</p></div>
                  </div>
                ) : (
                  <Table className="**:data-[slot=table-cell]:px-5 **:data-[slot=table-head]:px-5">
                    <TableHeader className="bg-muted/50 [&_tr]:border-y">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="font-medium">Agent</TableHead><TableHead>Identifiant</TableHead><TableHead>Rôles</TableHead><TableHead>Affectation</TableHead><TableHead>Compte</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="**:data-[slot=table-row]:hover:bg-transparent">
                      {siennes.map((a) => {
                        const p = profils.find((x) => x.id === a.profil_id);
                        return (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium">{p?.nom_complet ?? a.profil_id.slice(0, 8)}</TableCell>
                            <TableCell className="text-muted-foreground">{p?.identifiant ?? "—"}</TableCell>
                            <TableCell><div className="flex flex-wrap gap-1">{a.roles.map((r) => <Badge key={r} variant="secondary" className="rounded-sm">{ROLES[r] ?? r}</Badge>)}{!a.roles.length && <span className="text-muted-foreground">aucun rôle</span>}</div></TableCell>
                            <TableCell><Badge variant="outline" className={a.actif ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>{a.actif ? "Active" : "Retirée"}</Badge></TableCell>
                            <TableCell><Badge variant="outline" className={p?.actif ? "" : "text-muted-foreground"}><span className={cn("size-1.5 rounded-full", p?.actif ? "bg-emerald-500" : "bg-muted-foreground")} />{p?.actif ? "Actif" : "Révoqué"}</Badge></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      <Dialog open={creation} onOpenChange={setCreation}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Nouveau marché</DialogTitle>
            <DialogDescription>Vide, ou en copiant les paramètres d&apos;un marché existant (jamais ses fuites, photos, lots ni ouvriers).</DialogDescription>
          </DialogHeader>
          <FormMarche marches={liste} proposition={marche?.id ?? ""} copieVerrouillee={verrouille("marches", "copier")}
            onSubmit={creer} annuler={() => setCreation(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface Valeurs { source: string; code: string; numero: string; intitule: string; client: string; ville: string }

function FormMarche({ marches, proposition, copieVerrouillee, onSubmit, annuler }: {
  marches: MarcheLigne[]; proposition: string; copieVerrouillee: boolean; onSubmit: (v: Valeurs) => Promise<boolean>; annuler: () => void;
}) {
  const [mode, setMode] = useState<"copie" | "vide">(marches.length && !copieVerrouillee ? "copie" : "vide");
  const [source, setSource] = useState(marches.find((m) => m.id === proposition && m.code !== "DEMO")?.id ?? marches.find((m) => m.actif && m.code !== "DEMO")?.id ?? marches[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [numero, setNumero] = useState("");
  const [intitule, setIntitule] = useState("");
  const [client, setClient] = useState("");
  const [ville, setVille] = useState("");
  const [occupe, setOccupe] = useState(false);
  const copie = mode === "copie";
  const choisie = marches.find((m) => m.id === source);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setOccupe(true);
    await onSubmit({ source: copie ? source : "", code: code.trim(), numero: numero.trim(), intitule: intitule.trim(), client: client.trim(), ville: ville.trim() });
    setOccupe(false);
  };
  const valide = code.trim() && numero.trim() && intitule.trim() && (copie ? !!source : !!client.trim());

  return (
    <form onSubmit={envoyer} className="flex flex-col gap-4">
      <ToggleGroup type="single" variant="outline" spacing={0} value={mode} onValueChange={(v) => v && setMode(v as typeof mode)} className="w-full *:flex-1">
        <ToggleGroupItem value="copie" disabled={!marches.length || copieVerrouillee}
          title={copieVerrouillee ? "Verrouillé par vous : rouvrez le verrou dans Utilisateurs > Droits" : undefined}>
          {copieVerrouillee ? "Copier un marché (verrouillé)" : "Copier un marché"}
        </ToggleGroupItem>
        <ToggleGroupItem value="vide">Marché vide</ToggleGroupItem>
      </ToggleGroup>
      <FieldGroup className="gap-4">
        {copie && (
          <Field className="gap-1.5">
            <FieldLabel htmlFor="source">Marché modèle</FieldLabel>
            <NativeSelect id="source" className="w-full" value={source} onChange={(e) => setSource(e.target.value)}>
              {marches.map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.code} · {m.intitule.slice(0, 60)}{m.actif ? "" : " (désactivé)"}</NativeSelectOption>)}
            </NativeSelect>
            <FieldDescription>Copiés : fiche, bordereau, zones et secteurs, natures, motifs, articles suggérés pour les pièces, règles d&apos;attachement, modèles d&apos;export.</FieldDescription>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="gap-1.5"><FieldLabel htmlFor="code">Code court *</FieldLabel><Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex. SRM-4500005000" required /></Field>
          <Field className="gap-1.5"><FieldLabel htmlFor="numero">N° du marché *</FieldLabel><Input id="numero" value={numero} onChange={(e) => setNumero(e.target.value)} required /></Field>
        </div>
        <Field className="gap-1.5"><FieldLabel htmlFor="intitule">Intitulé *</FieldLabel><Input id="intitule" value={intitule} onChange={(e) => setIntitule(e.target.value)} required /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="client">Client{copie ? "" : " *"}</FieldLabel>
            <Input id="client" value={client} onChange={(e) => setClient(e.target.value)} placeholder={copie ? choisie?.client ?? "" : ""} required={!copie} />
            {copie && <FieldDescription>Vide : celui du marché modèle.</FieldDescription>}
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="ville">Ville</FieldLabel>
            <Input id="ville" value={ville} onChange={(e) => setVille(e.target.value)} placeholder={copie ? choisie?.ville ?? "" : ""} />
          </Field>
        </div>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={annuler}>Annuler</Button>
        <Button type="submit" disabled={!valide || occupe}>{occupe && <Spinner />}{occupe ? "Création…" : "Créer le marché"}</Button>
      </DialogFooter>
    </form>
  );
}

