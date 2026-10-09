"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Eye, EyeOff, IdCard, KeyRound, MoreHorizontal, Plus, Search, ShieldCheck, Trash2, UserRoundCheck, UserRoundCog, UserRoundX, Wand2 } from "lucide-react";
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

// Rôles cumulables par marché (contrat S1 § 1) ; l'administrateur est hors rôles.
const ROLES: Record<string, string> = {
  detection: "Détection",
  chef_reparation: "Réparation",
  refection: "Réfection",
  responsable: "Responsable",
};
const ENTREPRISE_DEFAUT = "STEPAG";

interface EtatSuppression { supprimable: boolean; raison: string | null }

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
  const { profil, marches, marche, verrouille, recharger } = useSession();
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
  const [roles, setRoles] = useState<Profil | null>(null);
  const [edition, setEdition] = useState<Profil | null>(null);
  const [suppressions, setSuppressions] = useState<Record<string, EtatSuppression | "lecture">>({});
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    const sb = getSupabase();
    const colonnes = "id, identifiant, nom_complet, telephone, langue, est_admin, actif";
    const [complet, a] = await Promise.all([
      sb.from("profils").select(`${colonnes}, nom, prenom, matricule, entreprise`).order("nom_complet"),
      sb.from("affectations").select("id, profil_id, marche_id, roles, actif"),
    ]);
    // Base pas encore à jour (colonnes du chantier v2 absentes) : colonnes d'origine
    const p = complet.error?.code === "42703" ? await sb.from("profils").select(colonnes).order("nom_complet") : complet;
    if (p.error) setErreur(messageErreur(p.error));
    setSuppressions({});
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
      return !t || p.nom_complet.toLowerCase().includes(t) || p.identifiant.toLowerCase().includes(t) || (p.matricule ?? "").toLowerCase().includes(t);
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

  // R2 : « Supprimer » seulement sans aucune saisie (règle vérifiée en base) ; sinon grisé avec la raison, et révocation.
  async function verifierSuppression(p: Profil) {
    if (suppressions[p.id]) return;
    setSuppressions((s) => ({ ...s, [p.id]: "lecture" }));
    const { data, error } = await getSupabase().rpc("compte_supprimable", { p_profil: p.id });
    const etat: EtatSuppression = error || !data
      ? { supprimable: false, raison: error ? `Vérification impossible : ${messageErreur(error)}` : "Vérification impossible" }
      : { supprimable: !!(data as EtatSuppression).supprimable, raison: (data as EtatSuppression).raison ?? null };
    setSuppressions((s) => ({ ...s, [p.id]: etat }));
  }

  async function supprimer(p: Profil) {
    if (!window.confirm(`Supprimer définitivement le compte ${p.nom_complet} (${p.identifiant}) ? Il n'a aucune saisie.`)) return;
    if (await appeler({ action: "supprimer", profil_id: p.id })) setInfo(`Compte ${p.nom_complet} supprimé.`);
  }

  // R3, R4, R6 : nom, prénom, matricule, entreprise (administrateur, son propre compte compris) ; la base recompose
  // nom_complet en « NOM Prénom ».
  async function enregistrerCompte(p: Profil, v: ValeursCompte): Promise<boolean> {
    setErreur("");
    setInfo("");
    const { data, error } = await getSupabase().from("profils").update(v).eq("id", p.id).select("id");
    if (error || !data?.length) {
      setErreur(error?.code === "23505" ? `Le matricule « ${v.matricule} » est déjà celui d'un autre compte.`
        : error ? messageErreur(error) : "Action non autorisée pour votre compte.");
      return false;
    }
    setInfo(`Compte de ${[v.nom?.toUpperCase(), v.prenom].filter(Boolean).join(" ") || p.nom_complet} enregistré.`);
    await charger();
    if (p.id === profil?.id) recharger();
    return true;
  }

  // R2 : rôles par marché ; liste vide = compte retiré du marché (droits effacés). Droits recalculés par la base.
  async function enregistrerRoles(p: Profil, changements: { marche_id: string; roles: string[] }[]): Promise<boolean> {
    setErreur("");
    setInfo("");
    const sb = getSupabase();
    for (const c of changements) {
      const { error } = await sb.rpc("modifier_roles", { p_profil: p.id, p_marche: c.marche_id, p_roles: c.roles });
      if (error) {
        setErreur(`${marcheDe(c.marche_id)} : ${messageErreur(error)}`);
        await charger();
        return false;
      }
    }
    setInfo(`Rôles de ${p.nom_complet} enregistrés (${changements.length} marché${changements.length > 1 ? "s" : ""}).`);
    await charger();
    return true;
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
                                {p.entreprise !== undefined && (
                                  <div className="truncate text-muted-foreground text-xs">
                                    {p.matricule ? <>Matricule <span className="font-medium text-foreground tabular-nums">{p.matricule}</span></> : <span className="text-amber-700 dark:text-amber-300">Sans matricule</span>}
                                    {" · "}{p.entreprise || ENTREPRISE_DEFAUT}
                                  </div>
                                )}
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
                            <DropdownMenu onOpenChange={(o) => o && p.id !== profil.id && !p.est_admin && verifierSuppression(p)}>
                              <DropdownMenuTrigger asChild>
                                <Button aria-label={`Actions pour ${p.nom_complet}`} className="size-8 rounded-md text-muted-foreground hover:bg-muted/50" size="icon-sm" variant="ghost"><MoreHorizontal className="size-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-56">
                                <DropdownMenuItem onSelect={() => setEdition(p)}><IdCard />Nom, matricule, entreprise</DropdownMenuItem>
                                {!p.est_admin && <DropdownMenuItem onSelect={() => setRoles(p)}><UserRoundCog />Rôles par marché</DropdownMenuItem>}
                                {p.id !== profil.id && (
                                  <DropdownMenuItem onSelect={async () => {
                                    const mdp = window.prompt(`Nouveau mot de passe pour ${p.identifiant} (8 caractères minimum) :`);
                                    if (!mdp) return;
                                    if (await appeler({ action: "mot_de_passe", profil_id: p.id, mot_de_passe: mdp })) setInfo("Mot de passe modifié.");
                                  }}><KeyRound />Changer le mot de passe</DropdownMenuItem>
                                )}
                                {p.id !== profil.id && <DropdownMenuSeparator />}
                                {p.id !== profil.id && (p.actif ? (
                                  <DropdownMenuItem variant="destructive" disabled={revocationVerrouillee} onSelect={() => revoquer(p)}>
                                    <UserRoundX />{revocationVerrouillee ? "Révoquer l'accès (verrouillé par vous)" : "Révoquer l'accès"}
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onSelect={() => appeler({ action: "activer", profil_id: p.id, actif: true })}>
                                    <UserRoundCheck />Réactiver
                                  </DropdownMenuItem>
                                ))}
                                {p.id !== profil.id && !p.est_admin && (() => {
                                  const etat = suppressions[p.id];
                                  const lecture = !etat || etat === "lecture";
                                  const raison = lecture ? "Vérification des saisies…" : etat.supprimable ? null : etat.raison;
                                  return (
                                    // Élément grisé : le survol passe à l'enveloppe, qui porte la raison
                                    <div title={raison ?? undefined}>
                                      <DropdownMenuItem variant="destructive" disabled={lecture || !!raison} onSelect={() => supprimer(p)}>
                                        {lecture ? <Spinner /> : <Trash2 />}Supprimer le compte
                                      </DropdownMenuItem>
                                      {raison && !lecture && <p className="max-w-64 px-1.5 pb-1 text-muted-foreground text-xs leading-snug">{raison}</p>}
                                    </div>
                                  );
                                })()}
                              </DropdownMenuContent>
                            </DropdownMenu>
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
                    <TableHead className="py-3 text-right font-normal">Actions</TableHead>
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
                        <TableCell className="py-3 text-right">
                          {p && !p.est_admin && <Button size="sm" variant="ghost" onClick={() => setRoles(p)}><UserRoundCog data-icon="inline-start" />Modifier</Button>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {affectations.length === 0 && <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Aucune affectation.</TableCell></TableRow>}
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

      <Dialog open={!!roles} onOpenChange={(o) => !o && setRoles(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Rôles par marché</DialogTitle>
            <DialogDescription>
              {roles?.nom_complet} : rôles cumulables. Un rôle ajouté donne ses droits ; un rôle retiré reprend ceux que lui
              seul accordait. Tout décocher retire le compte du marché.
            </DialogDescription>
          </DialogHeader>
          {roles && (
            <RolesParMarche key={roles.id} marches={marches} affectations={affectations.filter((a) => a.profil_id === roles.id)}
              annuler={() => setRoles(null)}
              enregistrer={async (changements) => {
                const ok = await enregistrerRoles(roles, changements);
                if (ok) setRoles(null);
              }} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!edition} onOpenChange={(o) => !o && setEdition(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nom, matricule, entreprise</DialogTitle>
            <DialogDescription>
              {edition?.identifiant}@{DOMAINE_AGENTS}. Le nom reste à l&apos;écran ; le matricule le remplace dans les documents
              imprimés et exportés.
            </DialogDescription>
          </DialogHeader>
          {edition && (
            <FormCompte key={edition.id} profil={edition} annuler={() => setEdition(null)}
              enregistrer={async (v) => {
                const ok = await enregistrerCompte(edition, v);
                if (ok) setEdition(null);
              }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ValeursCompte = { nom: string | null; prenom: string | null; matricule: string | null; entreprise: string; telephone: string | null };

// R3, R4, R6 : champs du compte (administrateur compris). Nom en capitales à l'affichage (« BOUSALAM Issam »).
function FormCompte({ profil, enregistrer, annuler }: { profil: Profil; enregistrer: (v: ValeursCompte) => Promise<void>; annuler: () => void }) {
  const [nom, setNom] = useState(profil.nom ?? "");
  const [prenom, setPrenom] = useState(profil.prenom ?? "");
  const [matricule, setMatricule] = useState(profil.matricule ?? "");
  const [entreprise, setEntreprise] = useState(profil.entreprise ?? ENTREPRISE_DEFAUT);
  const [telephone, setTelephone] = useState(profil.telephone ?? "");
  const [occupe, setOccupe] = useState(false);
  const apercu = [nom.trim().toUpperCase(), prenom.trim()].filter(Boolean).join(" ");
  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setOccupe(true);
    await enregistrer({
      nom: nom.trim() || null, prenom: prenom.trim() || null, matricule: matricule.trim() || null,
      entreprise: entreprise.trim() || ENTREPRISE_DEFAUT, telephone: telephone.trim() || null,
    });
    setOccupe(false);
  }
  return (
    <form onSubmit={soumettre} className="flex flex-col gap-4">
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="cpt-nom">Nom</FieldLabel>
            <Input id="cpt-nom" value={nom} onChange={(e) => setNom(e.target.value)} required autoCapitalize="characters" />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="cpt-prenom">Prénom</FieldLabel>
            <Input id="cpt-prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
          </Field>
        </div>
        <FieldDescription className="-mt-2">Affiché : <span className="font-medium text-foreground">{apercu || profil.nom_complet}</span></FieldDescription>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="cpt-matricule">Matricule</FieldLabel>
            <Input id="cpt-matricule" value={matricule} onChange={(e) => setMatricule(e.target.value)} autoCapitalize="characters" placeholder="ex. 1024" />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="cpt-entreprise">Entreprise</FieldLabel>
            <Input id="cpt-entreprise" value={entreprise} onChange={(e) => setEntreprise(e.target.value)} placeholder={ENTREPRISE_DEFAUT} />
          </Field>
        </div>
        <FieldDescription className="-mt-2">Matricule unique ; entreprise : {ENTREPRISE_DEFAUT} ou le sous-traitant.</FieldDescription>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="cpt-tel">Téléphone (facultatif)</FieldLabel>
          <Input id="cpt-tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} inputMode="tel" />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={annuler}>Annuler</Button>
        <Button type="submit" disabled={occupe || !nom.trim()}>{occupe && <Spinner />}Enregistrer</Button>
      </DialogFooter>
    </form>
  );
}

// R2 : une ligne par marché, une case par rôle ; seuls les marchés modifiés sont envoyés (modifier_roles).
function RolesParMarche({ marches, affectations, enregistrer, annuler }: {
  marches: Marche[]; affectations: Affectation[];
  enregistrer: (changements: { marche_id: string; roles: string[] }[]) => Promise<void>; annuler: () => void;
}) {
  const initiaux = useMemo(() => Object.fromEntries(marches.map((m) => {
    const a = affectations.find((x) => x.marche_id === m.id);
    return [m.id, a?.actif ? a.roles : []];
  })), [marches, affectations]);
  const [choix, setChoix] = useState<Record<string, string[]>>(initiaux);
  const [occupe, setOccupe] = useState(false);
  const ordre = Object.keys(ROLES);
  const pareil = (a: string[], b: string[]) => a.length === b.length && a.every((r) => b.includes(r));
  const changements = marches.filter((m) => !pareil(choix[m.id] ?? [], initiaux[m.id] ?? []))
    .map((m) => ({ marche_id: m.id, roles: ordre.filter((r) => (choix[m.id] ?? []).includes(r)) }));
  const retraits = changements.filter((c) => !c.roles.length).length;
  const basculer = (m: string, r: string, coche: boolean) =>
    setChoix((c) => ({ ...c, [m]: coche ? [...(c[m] ?? []), r] : (c[m] ?? []).filter((x) => x !== r) }));
  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="font-normal">Marché</TableHead>
              {ordre.map((r) => <TableHead key={r} className="text-center font-normal">{ROLES[r]}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {marches.map((m) => (
              <TableRow key={m.id} className={cn(!pareil(choix[m.id] ?? [], initiaux[m.id] ?? []) && "bg-amber-500/5")}>
                <TableCell className="font-medium">
                  {m.code}
                  {!(initiaux[m.id] ?? []).length && <span className="ml-1.5 text-muted-foreground text-xs">(non affecté)</span>}
                </TableCell>
                {ordre.map((r) => (
                  <TableCell key={r} className="text-center">
                    <Checkbox aria-label={`${m.code} : ${ROLES[r]}`} checked={(choix[m.id] ?? []).includes(r)}
                      onCheckedChange={(c) => basculer(m.id, r, c === true)} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {retraits > 0 && (
        <p className="text-amber-700 text-sm dark:text-amber-300">
          {retraits} marché{retraits > 1 ? "s" : ""} sans aucun rôle : le compte en sera retiré (ses droits y seront effacés).
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={annuler}>Annuler</Button>
        <Button disabled={!changements.length || occupe} onClick={async () => { setOccupe(true); await enregistrer(changements); setOccupe(false); }}>
          {occupe && <Spinner />}Enregistrer{changements.length ? ` (${changements.length})` : ""}
        </Button>
      </DialogFooter>
    </>
  );
}

function FormCreation({ marches, marcheParDefaut, onAnnuler, onCreer }: {
  marches: Marche[]; marcheParDefaut: string; onAnnuler: () => void;
  onCreer: (c: {
    identifiant: string; nom_complet: string; nom: string; prenom: string; matricule: string; entreprise: string;
    mot_de_passe: string; telephone: string; affectations: { marche_id: string; roles: string[] }[];
  }) => Promise<void>;
}) {
  const [identifiant, setIdentifiant] = useState("");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [matricule, setMatricule] = useState("");
  const [entreprise, setEntreprise] = useState(ENTREPRISE_DEFAUT);
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
      identifiant: identifiant.trim().toLowerCase(), nom_complet: [nom.trim().toUpperCase(), prenom.trim()].filter(Boolean).join(" "),
      nom: nom.trim(), prenom: prenom.trim(), matricule: matricule.trim(), entreprise: entreprise.trim() || ENTREPRISE_DEFAUT,
      mot_de_passe: motDePasse, telephone: telephone.trim(),
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="nom">Nom</FieldLabel>
            <Input id="nom" value={nom} onChange={(e) => setNom(e.target.value)} required autoCapitalize="characters" />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="prenom">Prénom</FieldLabel>
            <Input id="prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="matricule">Matricule</FieldLabel>
            <Input id="matricule" value={matricule} onChange={(e) => setMatricule(e.target.value)} autoCapitalize="characters" />
            <FieldDescription>Imprimé à la place du nom.</FieldDescription>
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="entreprise">Entreprise</FieldLabel>
            <Input id="entreprise" value={entreprise} onChange={(e) => setEntreprise(e.target.value)} placeholder={ENTREPRISE_DEFAUT} />
            <FieldDescription>{ENTREPRISE_DEFAUT} ou le sous-traitant.</FieldDescription>
          </Field>
        </div>
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
