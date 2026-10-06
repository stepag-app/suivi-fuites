"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Eye, EyeOff, KeyRound, MoreHorizontal, Plus, Search, ShieldCheck, UserRoundCheck, UserRoundX, Wand2 } from "lucide-react";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";
import { DOMAINE_AGENTS, getSupabase } from "@/lib/supabase";
import type { Marche, Profil } from "@/lib/types";
import { cn, getInitials } from "@/lib/utils";
import { Droits } from "./Droits";

interface Affectation { id: string; profil_id: string; marche_id: string; roles: string[]; actif: boolean }

const ROLES: Record<string, string> = {
  detection: "Détection",
  chef_reparation: "Chef d'équipe réparation",
  responsable: "Responsable (bureau)",
};

const TONS = [
  "[&_[data-slot=avatar-fallback]]:bg-amber-100 [&_[data-slot=avatar-fallback]]:text-amber-700 dark:[&_[data-slot=avatar-fallback]]:bg-amber-500/15 dark:[&_[data-slot=avatar-fallback]]:text-amber-300",
  "[&_[data-slot=avatar-fallback]]:bg-rose-100 [&_[data-slot=avatar-fallback]]:text-rose-700 dark:[&_[data-slot=avatar-fallback]]:bg-rose-500/15 dark:[&_[data-slot=avatar-fallback]]:text-rose-300",
  "[&_[data-slot=avatar-fallback]]:bg-violet-100 [&_[data-slot=avatar-fallback]]:text-violet-700 dark:[&_[data-slot=avatar-fallback]]:bg-violet-500/15 dark:[&_[data-slot=avatar-fallback]]:text-violet-300",
  "[&_[data-slot=avatar-fallback]]:bg-sky-100 [&_[data-slot=avatar-fallback]]:text-sky-700 dark:[&_[data-slot=avatar-fallback]]:bg-sky-500/15 dark:[&_[data-slot=avatar-fallback]]:text-sky-300",
  "[&_[data-slot=avatar-fallback]]:bg-emerald-100 [&_[data-slot=avatar-fallback]]:text-emerald-700 dark:[&_[data-slot=avatar-fallback]]:bg-emerald-500/15 dark:[&_[data-slot=avatar-fallback]]:text-emerald-300",
  "[&_[data-slot=avatar-fallback]]:bg-orange-100 [&_[data-slot=avatar-fallback]]:text-orange-700 dark:[&_[data-slot=avatar-fallback]]:bg-orange-500/15 dark:[&_[data-slot=avatar-fallback]]:text-orange-300",
];
const ton = (nom: string) => TONS[nom.length % TONS.length];

type OngletUtilisateurs = "comptes" | "affectations" | "droits";

// useSearchParams demande une frontière Suspense (page rendue côté navigateur).
export default function PageUtilisateurs() {
  return (
    <Suspense fallback={<p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement…</p>}>
      <Utilisateurs />
    </Suspense>
  );
}

// Onglet et marché de la matrice dans l'adresse : /utilisateurs?onglet=droits&marche=<uuid>
function Utilisateurs() {
  const { profil, marches, marche, verrouille } = useSession();
  const router = useRouter();
  const chemin = usePathname();
  const parametres = useSearchParams();
  const demande = parametres.get("onglet");
  const onglet: OngletUtilisateurs = demande === "droits" || demande === "affectations" ? demande : "comptes";
  const marcheDemande = parametres.get("marche");
  const marcheDroits = marches.some((m) => m.id === marcheDemande) ? (marcheDemande as string) : (marche?.id ?? marches[0]?.id ?? "");
  const aller = (o: OngletUtilisateurs, m?: string) => {
    const q = new URLSearchParams();
    if (o !== "comptes") q.set("onglet", o);
    if (o === "droits" && m && m !== marche?.id) q.set("marche", m);
    const suite = q.toString();
    router.replace(suite ? `${chemin}?${suite}` : chemin, { scroll: false });
  };
  const [profils, setProfils] = useState<Profil[]>([]);
  const [affectations, setAffectations] = useState<Affectation[]>([]);
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [creation, setCreation] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [etat, setEtat] = useState<"tous" | "actifs" | "revoques">("tous");
  const [marcheFiltre, setMarcheFiltre] = useState("tous");
  const [role, setRole] = useState<Profil | null>(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    const sb = getSupabase();
    const [p, a] = await Promise.all([
      sb.from("profils").select("id, identifiant, nom_complet, telephone, langue, est_admin, actif").order("nom_complet"),
      sb.from("affectations").select("id, profil_id, marche_id, roles, actif"),
    ]);
    if (p.error) setErreur(messageErreur(p.error));
    setProfils((p.data as Profil[] | null) ?? []);
    setAffectations((a.data as Affectation[] | null) ?? []);
    setChargement(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function appeler(corps: Record<string, unknown>): Promise<boolean> {
    setErreur("");
    setInfo("");
    const { data, error } = await getSupabase().functions.invoke("gerer-utilisateurs", { body: corps });
    if (error) {
      let message = messageErreur(error);
      const contexte = (error as { context?: Response }).context;
      if (contexte && typeof contexte.json === "function") {
        try {
          const detail = await contexte.json();
          if (detail?.erreur) message = detail.erreur;
        } catch {
          /* corps illisible */
        }
      }
      setErreur(message);
      return false;
    }
    if (data?.erreur) {
      setErreur(data.erreur);
      return false;
    }
    await charger();
    return true;
  }

  const marcheDe = (id: string) => marches.find((m) => m.id === id)?.code ?? id.slice(0, 8);
  const filtres = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    return profils.filter((p) => {
      if (etat === "actifs" && !p.actif) return false;
      if (etat === "revoques" && p.actif) return false;
      if (marcheFiltre !== "tous" && !affectations.some((a) => a.profil_id === p.id && a.marche_id === marcheFiltre && a.actif)) return false;
      return !t || p.nom_complet.toLowerCase().includes(t) || p.identifiant.toLowerCase().includes(t);
    });
  }, [profils, affectations, recherche, etat, marcheFiltre]);

  // Révocation en deux temps : la base d'abord (droit d'administrateur, verrou « révoquer un compte »,
  // jamais soi-même, journal), puis la fonction serveur bloque la connexion du compte.
  async function revoquer(p: Profil) {
    if (!window.confirm(`Révoquer l'accès de ${p.nom_complet} ?`)) return;
    setErreur("");
    setInfo("");
    const { data, error } = await getSupabase().from("profils").update({ actif: false }).eq("id", p.id).select("id");
    if (error || !data?.length) {
      setErreur(error ? messageErreur(error) : "Action non autorisée pour votre compte.");
      return;
    }
    if (await appeler({ action: "activer", profil_id: p.id, actif: false })) {
      setInfo(`Accès de ${p.nom_complet} révoqué.`);
    } else {
      await charger();
      setErreur((e) => `Accès révoqué dans la base, mais la connexion n'a pas pu être bloquée : ${e}`);
    }
  }

  if (!profil?.est_admin) return <Vide>Réservé à l&apos;administrateur.</Vide>;

  const actifs = profils.filter((p) => p.actif).length;
  const revocationVerrouillee = verrouille("comptes", "revoquer");

  return (
    <div className="flex flex-col gap-4">
      <EnTetePage titre="Utilisateurs" description={`${profils.length} compte${profils.length > 1 ? "s" : ""}, ${actifs} actif${actifs > 1 ? "s" : ""} · comptes créés par l'administrateur, identifiant@${DOMAINE_AGENTS}.`}
        actions={<Button size="sm" onClick={() => setCreation(true)}><Plus data-icon="inline-start" />Nouvel agent</Button>} />

      {erreur && <Alert variant="destructive"><AlertTitle>Erreur</AlertTitle><AlertDescription>{erreur}</AlertDescription></Alert>}
      {info && <Alert className="border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-50"><Check /><AlertTitle>Fait</AlertTitle><AlertDescription className="text-green-900/80 dark:text-green-50/80">{info}</AlertDescription></Alert>}

      <Tabs value={onglet} onValueChange={(v) => aller(v as OngletUtilisateurs, marcheDroits)} className="gap-4">
        <TabsList variant="line" className="w-full justify-start gap-2 border-b ps-0 *:data-[slot=tabs-trigger]:flex-none">
          <TabsTrigger value="comptes">Comptes</TabsTrigger>
          <TabsTrigger value="affectations">Affectations et rôles</TabsTrigger>
          <TabsTrigger value="droits">Droits</TabsTrigger>
        </TabsList>

        <TabsContent value="comptes">
          <Card>
            <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 md:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
              <CardTitle className="text-xl leading-none">Comptes</CardTitle>
              <CardDescription className="max-w-sm leading-snug">Accès, mots de passe et rôles par marché.</CardDescription>
              <CardAction className="col-start-1 row-start-auto flex w-full flex-wrap justify-start gap-2 justify-self-stretch md:col-start-2 md:row-span-2 md:row-start-1 md:w-auto md:flex-nowrap md:justify-end md:justify-self-end">
                <InputGroup className="h-7 w-full md:w-64">
                  <InputGroupAddon align="inline-start"><Search className="size-3.5" /></InputGroupAddon>
                  <InputGroupInput className="h-7" placeholder="Nom ou identifiant…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
                </InputGroup>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-0">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={etat} onValueChange={(v) => setEtat(v as typeof etat)}>
                    <SelectTrigger size="sm"><span className="text-muted-foreground">Statut :</span><SelectValue /></SelectTrigger>
                    <SelectContent position="popper" align="start">
                      <SelectGroup>
                        <SelectItem value="tous">Tous</SelectItem><SelectItem value="actifs">Actifs</SelectItem><SelectItem value="revoques">Révoqués</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Select value={marcheFiltre} onValueChange={setMarcheFiltre}>
                    <SelectTrigger size="sm"><span className="text-muted-foreground">Marché :</span><SelectValue /></SelectTrigger>
                    <SelectContent position="popper" align="start">
                      <SelectGroup>
                        <SelectItem value="tous">Tous</SelectItem>
                        {marches.map((m) => <SelectItem key={m.id} value={m.id}>{m.code}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-muted-foreground text-sm tabular-nums">{filtres.length} compte{filtres.length > 1 ? "s" : ""}</div>
              </div>
              {chargement ? <p className="flex items-center gap-2 px-4 text-muted-foreground text-sm"><Spinner />Chargement…</p> : (
                <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
                  <TableHeader className="[&_tr]:border-t">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="py-3 font-normal">Utilisateur</TableHead>
                      <TableHead className="py-3 font-normal">Rôle</TableHead>
                      <TableHead className="py-3 font-normal">Marchés</TableHead>
                      <TableHead className="py-3 font-normal">Statut</TableHead>
                      <TableHead className="py-3 text-right font-normal">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtres.map((p) => {
                      const siennes = affectations.filter((a) => a.profil_id === p.id);
                      const [premiere, ...reste] = siennes;
                      return (
                        <TableRow key={p.id} className="border-border/60">
                          <TableCell className="py-3">
                            <div className="flex items-center gap-3">
                              <Avatar size="lg" className={cn("font-medium", ton(p.nom_complet))}>
                                <AvatarFallback>{getInitials(p.nom_complet)}</AvatarFallback>
                                <AvatarBadge className={p.actif ? "bg-green-600 text-white" : "bg-muted-foreground text-muted"}>{p.actif ? <Check /> : <UserRoundX />}</AvatarBadge>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="truncate font-medium text-sm">{p.nom_complet}</div>
                                <div className="truncate text-muted-foreground text-sm">{p.identifiant}@{DOMAINE_AGENTS}{p.telephone ? ` · ${p.telephone}` : ""}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            {p.est_admin ? <Badge className="rounded-sm" variant="secondary"><ShieldCheck data-icon="inline-start" />Administrateur</Badge> : (
                              <div className="grid gap-0.5">
                                <span className="whitespace-nowrap">Agent</span>
                                <span className="text-muted-foreground text-xs">{[...new Set(siennes.flatMap((a) => a.roles))].map((r) => ROLES[r] ?? r).join(", ") || "aucun rôle"}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-3">
                            {siennes.length === 0 ? <span className="text-muted-foreground text-sm">Aucun marché</span> : (
                              <div className="flex items-center gap-2">
                                <AvatarGroup className="*:data-[slot=avatar]:ring-0">
                                  {premiere && <Avatar className="after:rounded-sm"><AvatarFallback className="rounded-sm ring-0 text-[10px]">{marcheDe(premiere.marche_id).slice(0, 3).toUpperCase()}</AvatarFallback></Avatar>}
                                  {reste.length > 0 && <AvatarGroupCount className="rounded-sm border ring-card">+{reste.length}</AvatarGroupCount>}
                                </AvatarGroup>
                                <span className="text-muted-foreground text-xs">{siennes.map((a) => `${marcheDe(a.marche_id)}${a.actif ? "" : " (retiré)"}`).join(", ")}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-3">
                            <Badge variant="outline" className={cn("gap-1.5 border px-2 py-1 font-medium", p.actif ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300" : "border-muted-foreground/20 bg-muted text-muted-foreground")}>
                              <span className={cn("size-1.5 rounded-full", p.actif ? "bg-green-500" : "bg-muted-foreground")} />{p.actif ? "Actif" : "Révoqué"}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            {p.id !== profil.id && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button aria-label={`Actions pour ${p.nom_complet}`} className="size-8 rounded-md text-muted-foreground hover:bg-muted/50" size="icon-sm" variant="ghost"><MoreHorizontal className="size-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={() => setRole(p)}><UserRoundCheck />Ajouter un rôle</DropdownMenuItem>
                                  <DropdownMenuItem onSelect={async () => {
                                    const mdp = window.prompt(`Nouveau mot de passe pour ${p.identifiant} (8 caractères minimum) :`);
                                    if (!mdp) return;
                                    if (await appeler({ action: "mot_de_passe", profil_id: p.id, mot_de_passe: mdp })) setInfo("Mot de passe modifié.");
                                  }}><KeyRound />Changer le mot de passe</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {p.actif ? (
                                    <DropdownMenuItem variant="destructive" disabled={revocationVerrouillee} onSelect={() => revoquer(p)}>
                                      <UserRoundX />{revocationVerrouillee ? "Révoquer l'accès (verrouillé par vous)" : "Révoquer l'accès"}
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onSelect={() => appeler({ action: "activer", profil_id: p.id, actif: true })}>
                                      <UserRoundCheck />Réactiver
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filtres.length === 0 && <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Aucun compte.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="affectations">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl leading-none">Affectations et rôles</CardTitle>
              <CardDescription>Une ligne par compte et par marché. Les droits fins (lire, créer, modifier, valider) se règlent dans l&apos;onglet Droits et sont garantis par la base (RLS).</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
                <TableHeader className="[&_tr]:border-t">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="py-3 font-normal">Marché</TableHead><TableHead className="py-3 font-normal">Compte</TableHead>
                    <TableHead className="py-3 font-normal">Rôles</TableHead><TableHead className="py-3 font-normal">Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {affectations.sort((a, b) => marcheDe(a.marche_id).localeCompare(marcheDe(b.marche_id))).map((a) => {
                    const p = profils.find((x) => x.id === a.profil_id);
                    return (
                      <TableRow key={a.id} className="border-border/60">
                        <TableCell className="py-3 font-medium">{marcheDe(a.marche_id)}{a.marche_id === marche?.id && <Badge variant="outline" className="ml-2 rounded-sm">ouvert</Badge>}</TableCell>
                        <TableCell className="py-3">{p?.nom_complet ?? a.profil_id.slice(0, 8)} <span className="text-muted-foreground text-xs">{p?.identifiant}</span></TableCell>
                        <TableCell className="py-3"><div className="flex flex-wrap gap-1">{a.roles.map((r) => <Badge key={r} variant="secondary" className="rounded-sm">{ROLES[r] ?? r}</Badge>)}{!a.roles.length && <span className="text-muted-foreground">aucun rôle</span>}</div></TableCell>
                        <TableCell className="py-3"><Badge variant="outline" className={a.actif ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300" : "text-muted-foreground"}>{a.actif ? "Active" : "Retirée"}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                  {affectations.length === 0 && <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Aucune affectation.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="droits" className="ancien">
          {marcheDroits ? <Droits marcheId={marcheDroits} choisirMarche={(m) => aller("droits", m)} /> : (
            <Vide>Aucun marché : créez-en un dans la page Marchés.</Vide>
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={creation} onOpenChange={setCreation}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Nouvel agent</SheetTitle>
            <SheetDescription>Communiquez ensuite l&apos;identifiant et le mot de passe à l&apos;agent.</SheetDescription>
          </SheetHeader>
          <FormCreation marches={marches} marcheParDefaut={marche?.id ?? ""} onAnnuler={() => setCreation(false)}
            onCreer={async (corps) => {
              const ok = await appeler({ action: "creer", ...corps });
              if (ok) {
                setInfo(`Compte « ${corps.identifiant} » créé. Communiquez l'identifiant et le mot de passe à l'agent.`);
                setCreation(false);
              }
            }} />
        </SheetContent>
      </Sheet>

      <Dialog open={!!role} onOpenChange={(o) => !o && setRole(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un rôle</DialogTitle>
            <DialogDescription>{role?.nom_complet} : choisissez le marché et le rôle à ajouter.</DialogDescription>
          </DialogHeader>
          {role && <AjoutAffectation marches={marches} onAjouter={async (marche_id, r) => {
            const ok = await appeler({ action: "affecter", profil_id: role.id, marche_id, role: r });
            if (ok) setRole(null);
            return ok;
          }} annuler={() => setRole(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AjoutAffectation({ marches, onAjouter, annuler }: { marches: Marche[]; onAjouter: (marche_id: string, role: string) => Promise<boolean>; annuler: () => void }) {
  const [marcheId, setMarcheId] = useState(marches[0]?.id ?? "");
  const [role, setRole] = useState("detection");
  const [occupe, setOccupe] = useState(false);
  return (
    <>
      <FieldGroup className="gap-4">
        <Field className="gap-1.5">
          <FieldLabel htmlFor="aff-marche">Marché</FieldLabel>
          <NativeSelect id="aff-marche" className="w-full" value={marcheId} onChange={(e) => setMarcheId(e.target.value)}>
            {marches.map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.code} · {m.intitule.slice(0, 50)}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="aff-role">Rôle</FieldLabel>
          <NativeSelect id="aff-role" className="w-full" value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(ROLES).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={annuler}>Annuler</Button>
        <Button disabled={!marcheId || occupe} onClick={async () => { setOccupe(true); await onAjouter(marcheId, role); setOccupe(false); }}>
          {occupe && <Spinner />}Ajouter ce rôle
        </Button>
      </DialogFooter>
    </>
  );
}

function FormCreation({ marches, marcheParDefaut, onAnnuler, onCreer }: {
  marches: Marche[]; marcheParDefaut: string; onAnnuler: () => void;
  onCreer: (c: { identifiant: string; nom_complet: string; mot_de_passe: string; telephone: string; affectations: { marche_id: string; roles: string[] }[] }) => Promise<void>;
}) {
  const [identifiant, setIdentifiant] = useState("");
  const [nom, setNom] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [telephone, setTelephone] = useState("");
  const [marcheId, setMarcheId] = useState(marcheParDefaut);
  const [roles, setRoles] = useState<string[]>(["detection"]);
  const [voir, setVoir] = useState(false);
  const [occupe, setOccupe] = useState(false);

  function genererMotDePasse() {
    const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
    const octets = crypto.getRandomValues(new Uint8Array(10));
    setMotDePasse(Array.from(octets, (o) => alphabet[o % alphabet.length]).join(""));
    setVoir(true);
  }

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setOccupe(true);
    await onCreer({
      identifiant: identifiant.trim().toLowerCase(), nom_complet: nom.trim(), mot_de_passe: motDePasse, telephone: telephone.trim(),
      affectations: marcheId && roles.length ? [{ marche_id: marcheId, roles }] : [],
    });
    setOccupe(false);
  }

  return (
    <form onSubmit={soumettre} className="flex flex-col gap-4 px-4 pb-4">
      <FieldGroup className="gap-4">
        <Field className="gap-1.5">
          <FieldLabel htmlFor="identifiant">Identifiant</FieldLabel>
          <Input id="identifiant" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} pattern="[a-zA-Z0-9._\-]{3,40}" autoCapitalize="none" required placeholder="ex. agent3" />
          <FieldDescription>Lettres, chiffres, point, tiret ; devient identifiant@{DOMAINE_AGENTS}.</FieldDescription>
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="nom">Nom complet</FieldLabel>
          <Input id="nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="mdp">Mot de passe</FieldLabel>
          <InputGroup>
            <InputGroupInput id="mdp" type={voir ? "text" : "password"} value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} minLength={8} autoComplete="new-password" required />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="button" aria-label={voir ? "Masquer" : "Afficher"} onClick={() => setVoir(!voir)}>{voir ? <EyeOff /> : <Eye />}</InputGroupButton>
              <InputGroupButton type="button" onClick={genererMotDePasse}><Wand2 />Générer</InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>8 caractères minimum ; « Générer » propose un mot de passe lisible, sans caractères ambigus.</FieldDescription>
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="telephone">Téléphone (facultatif)</FieldLabel>
          <Input id="telephone" value={telephone} onChange={(e) => setTelephone(e.target.value)} inputMode="tel" />
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="marche">Marché</FieldLabel>
          <NativeSelect id="marche" className="w-full" value={marcheId} onChange={(e) => setMarcheId(e.target.value)}>
            {marches.map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.code} · {m.intitule.slice(0, 50)}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <FieldSet>
          <FieldLegend>Rôles (cumulables)</FieldLegend>
          <FieldGroup className="gap-2">
            {Object.entries(ROLES).map(([k, v]) => (
              <Field key={k} orientation="horizontal">
                <Checkbox id={`role-${k}`} checked={roles.includes(k)} onCheckedChange={(c) => setRoles(c ? [...roles, k] : roles.filter((r) => r !== k))} />
                <FieldLabel htmlFor={`role-${k}`} className="font-normal">{v}</FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
      </FieldGroup>
      <SheetFooter className="px-0">
        <Button type="submit" disabled={occupe}>{occupe && <Spinner />}{occupe ? "Création…" : "Créer le compte"}</Button>
        <Button type="button" variant="outline" onClick={onAnnuler}>Annuler</Button>
      </SheetFooter>
    </form>
  );
}
