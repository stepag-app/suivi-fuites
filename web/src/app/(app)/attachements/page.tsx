"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, ChevronRight, ClipboardList, Download, FileSpreadsheet, LayoutDashboard, ListChecks, Plus, ReceiptText, Scale, Settings2,
  ShieldCheck, Zap,
} from "lucide-react";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { finDuMois, intituleMensuel, titreLot, type Lot, type ReglesAttachement } from "@/lib/attachements";
import { dateSeule, messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";
import { getSupabase, lireTout } from "@/lib/supabase";
import { cn, pluriel } from "@/lib/utils";
import { GRAVITES, syntheseControles } from "./controles";
import styles from "./controles.module.css";
import { useControles } from "./useControles";

function BadgeLot({ lot }: { lot: Lot }) {
  if (lot.statut === "arrete") return <Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300">Arrêté</Badge>;
  if (lot.numero != null) return <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300">Rouvert</Badge>;
  return <Badge variant="outline">Brouillon</Badge>;
}

function Cellule({ titre, valeur, note, badge, className }: { titre: string; valeur: React.ReactNode; note: string; badge?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-5 overflow-hidden rounded-none border-0 border-foreground/10 ring-0", className)}>
      <CardHeader><CardTitle className="font-normal">{titre}</CardTitle></CardHeader>
      <CardContent className="flex items-end justify-between gap-2">
        <div className="space-y-1">
          <div className="text-3xl leading-none tracking-tight tabular-nums">{valeur}</div>
          <p className="text-muted-foreground text-xs">{note}</p>
        </div>
        {badge}
      </CardContent>
    </Card>
  );
}

export default function Attachements() {
  const { marche, peut } = useSession();
  const router = useRouter();
  const [lots, setLots] = useState<Lot[]>([]);
  const [regles, setRegles] = useState<ReglesAttachement | null>(null);
  const [aAttacher, setAAttacher] = useState<{ unites: number; fuites: number } | null>(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);
  const marcheId = marche?.id;
  const { liste: controles } = useControles(marcheId, 0);
  const synthese = syntheseControles(controles);
  const aujourdHui = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const charger = useCallback(async () => {
    if (!marcheId) return;
    const sb = getSupabase();
    const [l, r, u] = await Promise.all([
      sb.from("attachements").select("*").eq("marche_id", marcheId).is("supprime_le", null)
        .order("numero", { ascending: false, nullsFirst: true }).order("cree_le", { ascending: false }),
      sb.from("parametres_attachement").select("*").eq("marche_id", marcheId).maybeSingle(),
      lireTout<{ fuite_id: string }>((de, a) => sb.from("v_a_attacher").select("fuite_id, prix_id").eq("marche_id", marcheId).neq("reste", 0).order("fuite_id").order("prix_id").range(de, a))
        .then((data) => ({ data, error: null }), (error: { message: string }) => ({ data: null, error })),
    ]);
    const premiere = l.error || r.error || u.error;
    setErreur(premiere ? messageErreur(premiere) : "");
    setLots((l.data as Lot[] | null) ?? []);
    setRegles((r.data as ReglesAttachement | null) ?? null);
    const unites = (u.data as { fuite_id: string }[] | null) ?? [];
    setAAttacher({ unites: unites.length, fuites: new Set(unites.map((x) => x.fuite_id)).size });
    setChargement(false);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function nouveauLot() {
    if (!marcheId) return;
    const id = crypto.randomUUID();
    const mensuel = !regles || regles.periodicite === "mensuelle";
    const { error } = await getSupabase().from("attachements").insert({
      id, marche_id: marcheId, intitule: mensuel ? intituleMensuel(finDuMois()) : "Nouvel attachement", date_arret: mensuel ? finDuMois() : null,
    });
    if (error) {
      setErreur(messageErreur(error));
      return;
    }
    router.push(`/attachements/${id}`);
  }

  const prochainNumero = Math.max(0, ...lots.map((l) => l.numero ?? 0)) + 1;
  const arretes = useMemo(() => lots.filter((l) => l.statut === "arrete"), [lots]);
  const brouillons = lots.length - arretes.length;
  const dernier = arretes[0] ?? null;
  const factures = arretes.filter((l) => l.reference_facture).length;
  const acceptes = arretes.filter((l) => l.accepte_le).length;
  const titreDe = (l: Lot) => titreLot(regles?.titre, { ...l, numero_prevu: l.numero == null ? prochainNumero : null });

  if (!peut("attachements", "lire")) return <Vide>Votre compte n&apos;a pas accès aux attachements.</Vide>;

  const peutCreer = peut("attachements", "creer");
  const raccourcis = [
    { libelle: "Nouveau lot", icone: Plus, action: nouveauLot, actif: peutCreer },
    { libelle: "Dernier lot", icone: ReceiptText, href: dernier ? `/attachements/${dernier.id}` : undefined, actif: !!dernier },
    { libelle: "Tableau de bord", icone: LayoutDashboard, href: "/tableau-de-bord", actif: true },
    { libelle: "Bordereau", icone: FileSpreadsheet, href: "/parametres?onglet=bordereau", actif: peut("parametres", "modifier") || peut("quantites", "lire") },
    { libelle: "Règles", icone: Settings2, href: "/parametres?onglet=attachement", actif: peut("parametres", "modifier") },
    { libelle: "Fuites", icone: ListChecks, href: "/fuites?statut=achevee", actif: true },
    { libelle: "Exporter", icone: Download, href: dernier ? `/attachements/${dernier.id}` : undefined, actif: !!dernier && peut("exports", "lire") },
    { libelle: "Événements", icone: ClipboardList, href: "/parametres?onglet=evenements", actif: peut("evenements", "lire") },
    { libelle: "Hors bordereau", icone: Scale, href: "/attachements/hors-bordereau", actif: peut("quantites", "lire") },
  ];

  return (
    <div className="flex flex-col gap-4">
      <EnTetePage titre="Attachements" description={`${marche?.code ?? ""} · ${aujourdHui}`}
        actions={
          <>
            {peut("parametres", "modifier") && (
              <Button size="sm" variant="outline" asChild><Link href="/parametres?onglet=attachement" prefetch={false}><Settings2 data-icon="inline-start" />Règles</Link></Button>
            )}
            {peutCreer && <Button size="sm" onClick={nouveauLot}><Plus data-icon="inline-start" />Nouveau lot</Button>}
          </>
        } />

      {erreur && <Alert variant="destructive"><AlertTitle>Erreur</AlertTitle><AlertDescription>{erreur}</AlertDescription></Alert>}

      <Tabs defaultValue="synthese" className="flex flex-col gap-4">
        <TabsList variant="line">
          <TabsTrigger value="synthese">Synthèse</TabsTrigger>
          <TabsTrigger value="lots">Lots ({lots.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="synthese" className="flex flex-col gap-4">
          {chargement ? <Skeleton className="h-56 rounded-xl" /> : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <div className="xl:col-span-6">
                <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                  <div className="grid grid-cols-1 xl:grid-cols-8">
                    <Cellule className="border-b xl:col-span-4 xl:border-r" titre="Lots arrêtés" valeur={arretes.length}
                      note={dernier ? `dernier : N° ${String(dernier.numero).padStart(2, "0")} du ${dateSeule(dernier.arrete_le)}` : "aucun lot arrêté"}
                      badge={<Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300">{acceptes} accepté{acceptes > 1 ? "s" : ""}</Badge>} />
                    <Cellule className="border-b xl:col-span-4" titre="Brouillons" valeur={brouillons} note="suivent les quantités en direct"
                      badge={brouillons ? <Badge variant="outline">en cours</Badge> : undefined} />
                    <Cellule className="xl:col-span-4 xl:border-r" titre="Reste à attacher" valeur={aAttacher?.unites ?? "—"} note="unités fuite × article, régularisations comprises"
                      badge={(aAttacher?.unites ?? 0) > 0 ? <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300">à traiter</Badge> : <Badge className="bg-green-500/10 text-green-700 dark:text-green-300">à jour</Badge>} />
                    <Cellule className="xl:col-span-4" titre="Fuites concernées" valeur={aAttacher?.fuites ?? "—"} note="avec au moins une unité à attacher"
                      badge={<Badge variant="outline">{factures} facturé{factures > 1 ? "s" : ""}</Badge>} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 xl:col-span-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="font-normal">Circuit d&apos;attachement</CardTitle>
                    <CardAction><Badge variant="outline">{regles?.periodicite === "mensuelle" || !regles ? "mensuel" : regles.periodicite}</Badge></CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm">
                    <p className="text-muted-foreground">
                      Un lot regroupe des travaux choisis (fuite × article du bordereau). En brouillon, il suit les quantités en direct ;
                      une fois arrêté, ses quantités sont figées et ne peuvent plus être attachées une seconde fois.
                    </p>
                    <div className="flex w-max items-center gap-2 rounded-md border bg-muted/70 px-2 py-1.5 text-sm">
                      <Zap className="size-4 fill-primary text-primary" />
                      <span className="text-muted-foreground">
                        Prochain lot arrêté : <span className="font-medium text-foreground">N° {String(prochainNumero).padStart(2, "0")}</span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
                {aAttacher && aAttacher.unites > 0 && (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
                    <ReceiptText />
                    <AlertTitle>Travaux à attacher</AlertTitle>
                    <AlertDescription className="text-amber-900/80 dark:text-amber-50/80">
                      {pluriel(aAttacher.unites, "unité")} de travaux sur {pluriel(aAttacher.fuites, "fuite")} attendent un lot.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          )}

          {peut("quantites", "lire") && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-normal"><ShieldCheck className="size-4 text-muted-foreground" />Contrôles avant attachement</CardTitle>
                <CardAction>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/attachements/hors-bordereau" prefetch={false}><Scale data-icon="inline-start" />Travaux hors bordereau à faire valoir</Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {synthese.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Aucun contrôle en défaut (oublis probables, lignes incohérentes, travaux hors bordereau).</p>
                ) : (
                  <div className={styles.synthese}>
                    {synthese.map((c) => (
                      <span key={c.controle} className={`${styles.puce} ${styles[c.gravite]}`} title={GRAVITES[c.gravite]?.libelle}>
                        {c.libelle} : {pluriel(c.fuites, "fuite")}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-muted-foreground text-xs">Détail et corrections (« Corriger ») dans la fiche d&apos;un lot en brouillon, colonne « Contrôles ».</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <Card className="xl:col-span-7">
              <CardHeader>
                <CardTitle className="font-normal">Lots récents</CardTitle>
                <CardAction>
                  <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
                    <a href="#lots">Tous les lots<ArrowRight data-icon="inline-end" /></a>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {lots.length === 0 && !chargement && <Vide>Aucun lot pour l&apos;instant.</Vide>}
                <ItemGroup>
                  {lots.slice(0, 6).map((l) => (
                    <Item key={l.id} variant="outline" size="xs" asChild>
                      <Link href={`/attachements/${l.id}`} prefetch={false}>
                        <ItemMedia>
                          <div className="grid size-9 place-items-center rounded-md border bg-background"><ReceiptText className="size-4 text-muted-foreground" /></div>
                        </ItemMedia>
                        <ItemContent>
                          <ItemTitle>{l.numero != null ? `N° ${String(l.numero).padStart(2, "0")}` : "Brouillon"} · {l.intitule ?? "Sans titre"}</ItemTitle>
                          <ItemDescription>
                            {l.arrete_le ? `Arrêté le ${dateSeule(l.arrete_le)}` : `Créé le ${dateSeule(l.cree_le)}`}
                            {l.accepte_le ? ` · accepté le ${dateSeule(l.accepte_le)}` : ""}{l.reference_facture ? ` · facture ${l.reference_facture}` : ""}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions><BadgeLot lot={l} /><ChevronRight className="size-5 text-muted-foreground" /></ItemActions>
                      </Link>
                    </Item>
                  ))}
                </ItemGroup>
              </CardContent>
            </Card>

            <Card className="xl:col-span-5">
              <CardHeader><CardTitle className="font-normal">Raccourcis</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  {raccourcis.map((r) => (
                    <div key={r.libelle} className="flex flex-col items-center gap-2.5">
                      {r.href ? (
                        <Button variant="outline" className="size-12 rounded-full" disabled={!r.actif} asChild={r.actif}>
                          {r.actif ? <Link href={r.href} prefetch={false} aria-label={r.libelle}><r.icone className="size-5" /></Link> : <r.icone className="size-5" />}
                        </Button>
                      ) : (
                        <Button variant="outline" className="size-12 rounded-full" disabled={!r.actif} onClick={r.action} aria-label={r.libelle}><r.icone className="size-5" /></Button>
                      )}
                      <span className="text-center text-muted-foreground text-xs">{r.libelle}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="lots" id="lots">
          <Card>
            <CardHeader>
              <CardTitle className="font-normal">Tous les lots</CardTitle>
              <CardAction>{peutCreer && <Button size="sm" onClick={nouveauLot}><Plus data-icon="inline-start" />Nouveau lot</Button>}</CardAction>
            </CardHeader>
            <CardContent className="px-0">
              {lots.length === 0 ? <Vide className="mx-4">Aucun lot pour l&apos;instant.</Vide> : (
                <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Lot</TableHead><TableHead>Titre</TableHead><TableHead>Statut</TableHead><TableHead>Arrêté le</TableHead>
                      <TableHead>Accepté</TableHead><TableHead>Facture</TableHead><TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lots.map((l) => (
                      <TableRow key={l.id} className="cursor-pointer" onClick={() => router.push(`/attachements/${l.id}`)}>
                        <TableCell className="font-medium tabular-nums">{l.numero != null ? `N° ${String(l.numero).padStart(2, "0")}` : "Brouillon"}</TableCell>
                        <TableCell className="max-w-96 whitespace-normal"><span className="line-clamp-2">{titreDe(l)}</span></TableCell>
                        <TableCell><BadgeLot lot={l} /></TableCell>
                        <TableCell className="tabular-nums">{l.arrete_le ? dateSeule(l.arrete_le) : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="tabular-nums">{l.accepte_le ? `${dateSeule(l.accepte_le)}${l.accepte_par ? ` · ${l.accepte_par}` : ""}` : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell>{l.reference_facture ? `${l.reference_facture}${l.facture_le ? ` · ${dateSeule(l.facture_le)}` : ""}` : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-right"><ChevronRight className="ml-auto size-4 text-muted-foreground" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
