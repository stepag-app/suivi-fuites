"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CircleAlert, Download, Lock, LockOpen, Plus, Save, Trash2 } from "lucide-react";
import { Vide } from "@/components/en-tete-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  NATURES_LIGNE, intituleMensuel, quantite, titreLot, type LigneLot, type Lot, type Recap, type ReglesAttachement,
} from "@/lib/attachements";
import { dateSeule, messageErreur } from "@/lib/format";
import { PanneauExport } from "@/lib/export/PanneauExport";
import { useSession } from "@/lib/session";
import { getSupabase, lireTout } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { BadgeControles } from "../BadgeControles";
import { useControles } from "../useControles";
import { AAttacher, LienFuite } from "./AAttacher";
import { CorrectionsFuite } from "./CorrectionsFuite";
import { FormAnticipation, FormForcage, FormLigneLibre, type ArticleChoix } from "./FormsLignes";

interface Os { id: string; numero: string; date_os: string; nature: string }
interface Zone { id: string; libelle: string }

export default function DetailLot() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { marche, profil, peut, verrouille } = useSession();
  const [lot, setLot] = useState<Lot | null>(null);
  const [lignes, setLignes] = useState<LigneLot[]>([]);
  const [recap, setRecap] = useState<Recap[]>([]);
  const [regles, setRegles] = useState<ReglesAttachement | null>(null);
  const [os, setOs] = useState<Os[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [articles, setArticles] = useState<ArticleChoix[]>([]);
  const [prixRefection, setPrixRefection] = useState<Set<string>>(new Set());
  const [dernierNumero, setDernierNumero] = useState<number | null>(null);
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [formulaire, setFormulaire] = useState<"" | "libre" | "forcage">("");
  const [anticipation, setAnticipation] = useState<string | null>(null);
  const [correction, setCorrection] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [exportOuvert, setExportOuvert] = useState(false);
  const [apercu, setApercu] = useState<EnTete | null>(null);
  const marcheId = marche?.id;

  const charger = useCallback(async () => {
    if (!marcheId) return;
    const sb = getSupabase();
    const lignesLot = lireTout<LigneLot>((de, a) =>
      sb.from("v_attachement_lignes").select("*").eq("attachement_id", id).order("fuite_numero", { nullsFirst: false }).order("prix_ordre").order("id").range(de, a))
      .then((data) => ({ data, error: null }), (error: { message: string }) => ({ data: null, error }));
    const [l, li, rc, rg, o, z, p, n, dn] = await Promise.all([
      sb.from("attachements").select("*").eq("id", id).maybeSingle(),
      lignesLot,
      sb.from("v_attachement_recap").select("*").eq("attachement_id", id).order("prix_ordre").order("prix_numero"),
      sb.from("parametres_attachement").select("*").eq("marche_id", marcheId).maybeSingle(),
      sb.from("ordres_service").select("id, numero, date_os, nature").eq("marche_id", marcheId).order("date_os"),
      sb.from("zones").select("id, libelle").eq("marche_id", marcheId).order("numero"),
      sb.from("prix").select("id, numero, designation, unite, famille, actif").eq("marche_id", marcheId).order("hors_bordereau").order("ordre"),
      sb.from("natures_refection").select("prix_id").eq("marche_id", marcheId).not("prix_id", "is", null),
      sb.from("attachements").select("numero").eq("marche_id", marcheId).eq("statut", "arrete").is("supprime_le", null).order("numero", { ascending: false }).limit(1),
    ]);
    const premiere = l.error || li.error || rc.error;
    setErreur(premiere ? messageErreur(premiere) : "");
    setLot((l.data as Lot | null) ?? null);
    setLignes((li.data as LigneLot[] | null) ?? []);
    setRecap((rc.data as Recap[] | null) ?? []);
    setRegles((rg.data as ReglesAttachement | null) ?? null);
    setOs((o.data as Os[] | null) ?? []);
    setZones((z.data as Zone[] | null) ?? []);
    const prix = (p.data as ArticleChoix[] | null) ?? [];
    setArticles(prix);
    const lies = new Set(((n.data as { prix_id: string }[] | null) ?? []).map((x) => x.prix_id));
    setPrixRefection(new Set(prix.filter((x) => x.famille === "refection" || lies.has(x.id)).map((x) => x.id)));
    setDernierNumero(((dn.data as { numero: number }[] | null) ?? [])[0]?.numero ?? null);
  }, [id, marcheId]);

  useEffect(() => {
    charger();
  }, [charger, version]);

  const rafraichir = () => setVersion((v) => v + 1);
  // Contrôles de cohérence (lot R), relus à chaque changement du lot
  const { parFuite: controles, erreur: erreurControles } = useControles(marcheId, version);
  const dec = regles?.decimales;

  const groupes = useMemo(() => {
    const m = new Map<string, LigneLot[]>();
    lignes.forEach((l) => {
      const cle = l.fuite_id ?? `libre-${l.id}`;
      m.set(cle, [...(m.get(cle) ?? []), l]);
    });
    return [...m.values()];
  }, [lignes]);

  if (!lot) {
    return (
      <Vide>
        <span className="flex items-center gap-2">{erreur || <><Spinner />Chargement…</>}&nbsp;<Link href="/attachements" className="text-primary underline-offset-4 hover:underline">Retour aux attachements</Link></span>
      </Vide>
    );
  }

  const brouillon = lot.statut === "brouillon";
  const modifiable = brouillon && peut("attachements", "modifier");
  const estAdmin = !!profil?.est_admin;
  const recapUtile = recap.filter((r) => r.quantite_cumulee !== 0 || !r.hors_bordereau);
  const fuitesDuLot = new Set(lignes.filter((l) => l.fuite_id).map((l) => l.fuite_id));
  const fuitesEnDefaut = [...fuitesDuLot].filter((f) => f && controles.has(f)).length;
  const peutCorriger = modifiable && (peut("quantites", "modifier") || peut("quantites", "creer") || peut("interventions", "creer"));
  const unitesLot = new Set(lignes.filter((l) => l.fuite_id && (l.nature === "solde" || l.nature === "anticipation"))
    .map((l) => `${l.fuite_id}|${l.prix_id}`));
  const negatives = lignes.filter((l) => l.quantite < 0).length;
  const lotAffiche = { ...lot, ...(brouillon && apercu ? apercu : {}), numero_prevu: lot.numero == null ? (dernierNumero ?? 0) + 1 : null };
  const enTeteModifie = brouillon && !!apercu && (Object.keys(apercu) as (keyof EnTete)[]).some((k) => (apercu[k] ?? null) !== (lot[k] ?? null));
  const titre = titreLot(regles?.titre, lotAffiche);

  async function executer(action: () => PromiseLike<{ error: unknown }>, succes?: string): Promise<boolean> {
    setErreur("");
    setInfo("");
    setOccupe(true);
    try {
      const { error } = await action();
      if (error) throw error;
      if (succes) setInfo(succes);
      rafraichir();
      return true;
    } catch (e) {
      setErreur(messageErreur(e));
      return false;
    } finally {
      setOccupe(false);
    }
  }

  async function arreter() {
    if (enTeteModifie) {
      setErreur("Enregistrez d'abord l'en-tête : le lot est arrêté avec les mentions enregistrées.");
      return;
    }
    const zeros = lignes.filter((l) => l.nature === "solde" && l.quantite === 0).length;
    const texte = [
      `Arrêter définitivement ce lot (${lignes.length - zeros} ligne${lignes.length - zeros > 1 ? "s" : ""}) ?`,
      "Les quantités seront figées et ne pourront plus être attachées une seconde fois.",
      regles?.verrouiller_a_l_arret ? "Les fuites du lot seront verrouillées." : "",
      zeros ? `${zeros} ligne(s) à zéro seront retirées.` : "",
      negatives ? `Attention : ${negatives} régularisation(s) négative(s).` : "",
    ].filter(Boolean).join("\n");
    if (!window.confirm(texte)) return;
    await executer(() => getSupabase().rpc("arreter_attachement", { p_attachement: lot!.id, p_date_arret: lot!.date_arret }), "Lot arrêté.");
  }

  async function rouvrir() {
    const motif = window.prompt("Motif de la réouverture (obligatoire, gardé dans le journal) :");
    if (!motif?.trim()) return;
    await executer(() => getSupabase().rpc("rouvrir_attachement", { p_attachement: lot!.id, p_motif: motif.trim() }), "Lot rouvert.");
  }

  async function supprimerBrouillon() {
    if (!window.confirm("Supprimer ce brouillon ? Les travaux sélectionnés redeviennent disponibles.")) return;
    if (await executer(() => getSupabase().from("attachements").update({ supprime_le: new Date().toISOString() }).eq("id", lot!.id))) router.push("/attachements");
  }

  const retirer = (ids: string[]) => executer(() => getSupabase().from("attachement_lignes").delete().in("id", ids));

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/attachements" prefetch={false}>Attachements</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{lot.numero != null ? `Lot N° ${String(lot.numero).padStart(2, "0")}` : "Brouillon"}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-medium text-2xl leading-tight tracking-tight sm:text-3xl">{titre}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {brouillon ? (
              <Badge className={lot.numero != null ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : ""} variant={lot.numero != null ? "outline" : "outline"}>
                {lot.numero != null ? "Rouvert (brouillon)" : "Brouillon : projet non définitif"}
              </Badge>
            ) : (
              <Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300"><Lock data-icon="inline-start" />Arrêté le {dateSeule(lot.arrete_le)}</Badge>
            )}
            <span className="text-muted-foreground text-sm">{fuitesDuLot.size} fuite{fuitesDuLot.size > 1 ? "s" : ""} · {lignes.length} ligne{lignes.length > 1 ? "s" : ""}</span>
            {lot.motif_reouverture && <span className="text-muted-foreground text-sm">· rouvert le {dateSeule(lot.rouvert_le)} : {lot.motif_reouverture}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {peut("exports", "lire") && (
            <Button type="button" variant="outline" onClick={() => setExportOuvert(true)}><Download data-icon="inline-start" />Exporter{brouillon ? " (projet)" : ""}</Button>
          )}
          {brouillon && lot.numero == null && peut("attachements", "supprimer") && (
            <Button type="button" variant="destructive" disabled={occupe} onClick={supprimerBrouillon}><Trash2 data-icon="inline-start" />Supprimer le brouillon</Button>
          )}
          {!brouillon && estAdmin && lot.numero === dernierNumero && (
            verrouille("attachements", "rouvrir")
              ? <Button type="button" variant="outline" disabled title="Verrouillé par vous : rouvrez le verrou dans Utilisateurs > Droits"><Lock data-icon="inline-start" />Rouvrir (verrouillé par vous)</Button>
              : <Button type="button" variant="outline" disabled={occupe} onClick={rouvrir}><LockOpen data-icon="inline-start" />Rouvrir (administrateur)</Button>
          )}
          {brouillon && peut("attachements", "valider") && (
            <Button type="button" disabled={occupe || lignes.length === 0} onClick={arreter}><Lock data-icon="inline-start" />Arrêter le lot (définitif)</Button>
          )}
        </div>
      </div>

      {enTeteModifie && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
          <CircleAlert />
          <AlertTitle>En-tête modifié, pas encore enregistré</AlertTitle>
          <AlertDescription className="text-amber-900/80 dark:text-amber-50/80">Le titre montre la saisie en cours.</AlertDescription>
        </Alert>
      )}
      {erreur && <Alert variant="destructive"><AlertTitle>Erreur</AlertTitle><AlertDescription>{erreur}</AlertDescription></Alert>}
      {info && <Alert className="border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-50"><AlertDescription className="text-green-900 dark:text-green-50">{info}</AlertDescription></Alert>}

      <PanneauExport ouvert={exportOuvert} fermer={() => setExportOuvert(false)}
        attachement={{ lot: lotAffiche, lignes, recap, zone: zones.find((z) => z.id === lotAffiche.zone_id)?.libelle ?? null }} />

      <div className="grid gap-5 xl:grid-cols-2">
        {brouillon ? (
          <EnTeteBrouillon key={lot.id} lot={lot} os={os} zones={zones} modifiable={modifiable} regles={regles} onApercu={setApercu}
            enregistrer={(v) => executer(() => getSupabase().from("attachements").update(v).eq("id", lot.id), "En-tête enregistré.")} />
        ) : (
          <SuiviLot lot={lot} os={os} zones={zones} modifiable={peut("attachements", "modifier")}
            enregistrer={(v) => executer(() => getSupabase().from("attachements").update(v).eq("id", lot.id), "Suivi enregistré.")} />
        )}

        {/* Aperçu « papier » : récapitulatif par article, comme sur le document exporté */}
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="font-normal">Récapitulatif par article</CardTitle>
            <CardDescription>Antérieur, lot, cumul et pourcentage de la quantité du marché.</CardDescription>
            <CardAction>{brouillon && <Badge variant="outline">PROJET</Badge>}</CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <Table className="text-xs [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8">N°</TableHead><TableHead className="h-8">Désignation</TableHead><TableHead className="h-8">Unité</TableHead>
                  <TableHead className="h-8 text-right">Marché</TableHead><TableHead className="h-8 text-right">Antérieur</TableHead>
                  <TableHead className="h-8 text-right">Ce lot</TableHead><TableHead className="h-8 text-right">Cumul</TableHead><TableHead className="h-8 text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recapUtile.map((r) => (
                  <TableRow key={r.prix_id} className={cn("hover:bg-transparent", r.quantite_lot === 0 && "text-muted-foreground")}>
                    <TableCell className="py-1.5 tabular-nums">{r.prix_numero}</TableCell>
                    <TableCell className="max-w-60 whitespace-normal py-1.5"><span className="line-clamp-2">{r.prix_designation}</span></TableCell>
                    <TableCell className="py-1.5">{r.unite}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{quantite(r.quantite_marche, r.unite, dec)}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{quantite(r.quantite_anterieure, r.unite, dec)}</TableCell>
                    <TableCell className="py-1.5 text-right font-medium tabular-nums">{quantite(r.quantite_lot, r.unite, dec)}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{quantite(r.quantite_cumulee, r.unite, dec)}</TableCell>
                    <TableCell className={cn("py-1.5 text-right tabular-nums", r.pourcentage_marche != null && r.pourcentage_marche > 100 && "text-destructive")}>
                      {r.pourcentage_marche != null ? `${r.pourcentage_marche.toLocaleString("fr-FR")} %` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-normal">Travaux du lot</CardTitle>
          <CardDescription>
            {fuitesDuLot.size} fuite{fuitesDuLot.size > 1 ? "s" : ""}, {lignes.length} ligne{lignes.length > 1 ? "s" : ""}.
            {brouillon ? " Quantités « au solde » suivies en direct jusqu'à l'arrêt. N° de fuite : fiche complète dans un nouvel onglet." : ""}
          </CardDescription>
          {modifiable && (
            <CardAction className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setFormulaire(formulaire === "libre" ? "" : "libre")}><Plus data-icon="inline-start" />Ligne libre</Button>
              {estAdmin && (verrouille("attachements", "forcer")
                ? <Button size="sm" variant="outline" disabled title="Verrouillé par vous : rouvrez le verrou dans Utilisateurs > Droits"><Lock data-icon="inline-start" />Refacturation forcée (verrouillée)</Button>
                : <Button size="sm" variant="outline" onClick={() => setFormulaire(formulaire === "forcage" ? "" : "forcage")}><Plus data-icon="inline-start" />Refacturation forcée</Button>)}
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="ancien flex flex-col gap-3">
          {formulaire === "libre" && (
            <FormLigneLibre articles={articles} marcheId={marcheId!} lotId={lot.id} annuler={() => setFormulaire("")} fini={() => { setFormulaire(""); rafraichir(); }} onErreur={setErreur} />
          )}
          {formulaire === "forcage" && (
            <FormForcage articles={articles} marcheId={marcheId!} lotId={lot.id} annuler={() => setFormulaire("")} fini={() => { setFormulaire(""); rafraichir(); }} onErreur={setErreur} />
          )}
          {negatives > 0 && <p className="carte attention">{negatives} régularisation(s) négative(s) : quantité attachée en trop dans un lot précédent, déduite ici.</p>}
          {fuitesEnDefaut > 0 && (
            <p className="carte attention">
              {fuitesEnDefaut} fuite{fuitesEnDefaut > 1 ? "s" : ""} du lot avec des contrôles en défaut (colonne « Contrôles » : oublis
              probables, lignes incohérentes, travaux hors bordereau).{peutCorriger ? " « Corriger » ouvre le détail et les corrections." : ""}
            </p>
          )}
          {erreurControles && <p className="discret">{erreurControles}</p>}
          {lignes.length === 0 && <p className="discret">Aucun travail dans ce lot. {modifiable ? "Cochez des travaux ci-dessous." : ""}</p>}
          {lignes.length > 0 && (
            <div className="defilement">
              <table className="liste-compacte">
                <thead>
                  <tr>
                    <th>Fuite</th><th>Contrôles</th><th>Référence</th><th>Secteur</th><th>Réparée le</th><th>Fouille L × l × p (m)</th><th>Réfection</th>
                    <th>Lignes du lot</th>{modifiable && <th />}
                  </tr>
                </thead>
                <tbody>
                  {groupes.map((g, i) => {
                    const t = g[0];
                    const refectionAttendue = modifiable && regles?.refection_anticipee && t.fuite_id && !t.refectionnee_le && !g.some((l) => l.nature === "anticipation");
                    const zebre = i % 2 === 1 ? "zebre" : "";
                    return (
                      <Fragment key={t.fuite_id ?? t.id}>
                        <tr className={zebre}>
                          {t.fuite_id ? (
                            <>
                              <td className="nowrap"><LienFuite id={t.fuite_id} numero={t.fuite_numero} /></td>
                              <td><BadgeControles liste={controles.get(t.fuite_id)} /></td>
                              <td className="nowrap">{t.reference_srm ?? "—"}</td>
                              <td>{t.secteur ?? "—"}</td>
                              <td className="nowrap">{dateSeule(t.reparee_le)}</td>
                              <td className="nowrap">
                                {t.fouille_longueur_m != null
                                  ? [t.fouille_longueur_m, t.fouille_largeur_m, t.fouille_profondeur_m].map((x) => (x == null ? "?" : x.toLocaleString("fr-FR"))).join(" × ")
                                  : "—"}
                              </td>
                              <td className="nowrap">{t.refectionnee_le ? dateSeule(t.refectionnee_le) : <span className="discret">non faite</span>}</td>
                            </>
                          ) : (
                            <td colSpan={7}><strong>{NATURES_LIGNE[t.nature]}</strong> · {t.designation}</td>
                          )}
                          <td>
                            <div className="unites-ligne">
                              {g.map((l) => (
                                <span key={l.id} className="unite-ligne">
                                  P{l.prix_numero} <strong>{quantite(l.quantite, l.unite, dec)}</strong> {l.unite}
                                  {l.regularisation && <span className={`etiquette ${l.quantite < 0 ? "etiquette-alerte" : ""}`}>Régul. lot {l.lot_precedent}</span>}
                                  {l.nature !== "solde" && l.fuite_id && <span className="etiquette">{NATURES_LIGNE[l.nature]}</span>}
                                  {l.motif && <span className="discret" title={l.motif}>{l.motif.length > 40 ? `${l.motif.slice(0, 40)}…` : l.motif}</span>}
                                  {modifiable && g.length > 1 && (
                                    <button className="petit" onClick={() => retirer([l.id])} aria-label={`Retirer le prix ${l.prix_numero}`}>×</button>
                                  )}
                                </span>
                              ))}
                            </div>
                          </td>
                          {modifiable && (
                            <td className="nowrap">
                              {refectionAttendue && <button className="petit" onClick={() => setAnticipation(anticipation === t.fuite_id ? null : t.fuite_id)}>Réfection anticipée</button>}{" "}
                              {peutCorriger && t.fuite_id && (
                                <button className="petit" onClick={() => setCorrection(correction === t.fuite_id ? null : t.fuite_id)}>
                                  {correction === t.fuite_id ? "Fermer" : "Corriger"}
                                </button>
                              )}{" "}
                              <button className="petit" onClick={() => retirer(g.map((l) => l.id))}>Retirer</button>
                            </td>
                          )}
                        </tr>
                        {correction === t.fuite_id && t.fuite_id && (
                          <tr className={zebre}>
                            <td colSpan={modifiable ? 9 : 8}>
                              <CorrectionsFuite
                                marcheId={marcheId!} fuiteId={t.fuite_id} fuiteNumero={t.fuite_numero}
                                controles={controles.get(t.fuite_id) ?? []} articles={articles}
                                lot={{ id: lot.id, unites: unitesLot }}
                                fermer={() => setCorrection(null)} corrige={rafraichir}
                              />
                            </td>
                          </tr>
                        )}
                        {anticipation === t.fuite_id && t.fuite_id && (
                          <tr className={zebre}>
                            <td colSpan={modifiable ? 9 : 8}>
                              <FormAnticipation
                                articles={articles.filter((a) => prixRefection.has(a.id))} prixPropose={t.prix_refection_prevu}
                                quantiteProposee={t.fouille_longueur_m != null && t.fouille_largeur_m != null ? Math.round(t.fouille_longueur_m * t.fouille_largeur_m * 1000) / 1000 : null}
                                marcheId={marcheId!} lotId={lot.id} fuiteId={t.fuite_id}
                                annuler={() => setAnticipation(null)} fini={() => { setAnticipation(null); rafraichir(); }} onErreur={setErreur}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {modifiable && regles && (
        <div className="ancien">
          <AAttacher
            marcheId={marcheId!} lotId={lot.id} regles={regles} zones={zones} version={version} ajoute={rafraichir} onErreur={setErreur}
            controles={controles} bordereau={articles} peutCorriger={peutCorriger}
          />
        </div>
      )}
    </div>
  );
}

type EnTete = Pick<Lot, "intitule" | "date_arret" | "periode_debut" | "periode_fin" | "zone_id" | "lieu_travaux" | "os_id" | "observation">;

function EnTeteBrouillon({ lot, os, zones, modifiable, regles, onApercu, enregistrer }: {
  lot: Lot; os: Os[]; zones: Zone[]; modifiable: boolean; regles: ReglesAttachement | null;
  onApercu: (v: EnTete) => void; enregistrer: (v: Record<string, unknown>) => Promise<boolean>;
}) {
  const [intitule, setIntitule] = useState(lot.intitule ?? "");
  const [dateArret, setDateArret] = useState(lot.date_arret ?? "");
  const [debut, setDebut] = useState(lot.periode_debut ?? "");
  const [fin, setFin] = useState(lot.periode_fin ?? "");
  const [zoneId, setZoneId] = useState(lot.zone_id ?? "");
  const [lieu, setLieu] = useState(lot.lieu_travaux ?? "");
  const [osId, setOsId] = useState(lot.os_id ?? "");
  const [observation, setObservation] = useState(lot.observation ?? "");
  const obligatoire = (m: string) => (regles?.mentions_obligatoires.includes(m) ? " *" : "");
  const valeurs: EnTete = {
    intitule: intitule.trim() || null, date_arret: dateArret || null, periode_debut: debut || null, periode_fin: fin || null,
    zone_id: zoneId || null, lieu_travaux: lieu.trim() || null, os_id: osId || null, observation: observation.trim() || null,
  };
  const cleValeurs = JSON.stringify(valeurs);
  useEffect(() => {
    onApercu(JSON.parse(cleValeurs) as EnTete);
  }, [cleValeurs, onApercu]);

  const changerDate = (nouvelle: string) => {
    if (intitule.trim() === intituleMensuel(dateArret || undefined) && nouvelle) setIntitule(intituleMensuel(nouvelle));
    setDateArret(nouvelle);
  };
  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    enregistrer(valeurs);
  };

  return (
    <form onSubmit={soumettre}>
      <Card>
        <CardHeader>
          <CardTitle className="font-normal">En-tête et mentions</CardTitle>
          <CardDescription>Mentions du document ; * = exigé par les règles du marché.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field className="gap-1"><FieldLabel className="text-xs" htmlFor="intitule">Intitulé</FieldLabel><Input id="intitule" value={intitule} disabled={!modifiable} onChange={(e) => setIntitule(e.target.value)} /></Field>
              <Field className="gap-1"><FieldLabel className="text-xs" htmlFor="date-arret">Travaux exécutés au *</FieldLabel><Input id="date-arret" type="date" value={dateArret} disabled={!modifiable} onChange={(e) => changerDate(e.target.value)} /></Field>
              <Field className="gap-1"><FieldLabel className="text-xs" htmlFor="debut">Période du (facultatif)</FieldLabel><Input id="debut" type="date" value={debut} disabled={!modifiable} onChange={(e) => setDebut(e.target.value)} /></Field>
              <Field className="gap-1"><FieldLabel className="text-xs" htmlFor="fin">au</FieldLabel><Input id="fin" type="date" value={fin} disabled={!modifiable} onChange={(e) => setFin(e.target.value)} /></Field>
              <Field className="gap-1">
                <FieldLabel className="text-xs" htmlFor="os">Ordre de service{obligatoire("ordre_service")}</FieldLabel>
                <NativeSelect id="os" className="w-full" value={osId} disabled={!modifiable} onChange={(e) => setOsId(e.target.value)}>
                  <NativeSelectOption value="">—</NativeSelectOption>
                  {os.map((o) => <NativeSelectOption key={o.id} value={o.id}>OS n° {o.numero} du {dateSeule(o.date_os)}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <Field className="gap-1">
                <FieldLabel className="text-xs" htmlFor="zone">Zone{obligatoire("zone")}</FieldLabel>
                <NativeSelect id="zone" className="w-full" value={zoneId} disabled={!modifiable} onChange={(e) => setZoneId(e.target.value)}>
                  <NativeSelectOption value="">Toutes zones</NativeSelectOption>
                  {zones.map((z) => <NativeSelectOption key={z.id} value={z.id}>{z.libelle}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
            </div>
            <Field className="gap-1">
              <FieldLabel className="text-xs" htmlFor="lieu">Lieu exact des travaux (début et fin){obligatoire("lieu_travaux")}</FieldLabel>
              <Textarea id="lieu" rows={2} value={lieu} disabled={!modifiable} onChange={(e) => setLieu(e.target.value)} placeholder="Ex. secteurs Andalous et Qods Bas, de la rue X à la rue Y" />
            </Field>
            <Field className="gap-1">
              <FieldLabel className="text-xs" htmlFor="observation">Observation{obligatoire("observation")}</FieldLabel>
              <Textarea id="observation" rows={2} value={observation} disabled={!modifiable} onChange={(e) => setObservation(e.target.value)} />
            </Field>
          </FieldGroup>
        </CardContent>
        {modifiable && (
          <CardFooter className="justify-end">
            <Button type="submit" size="sm"><Save data-icon="inline-start" />Enregistrer l&apos;en-tête</Button>
          </CardFooter>
        )}
      </Card>
    </form>
  );
}

function SuiviLot({ lot, os, zones, modifiable, enregistrer }: {
  lot: Lot; os: Os[]; zones: Zone[]; modifiable: boolean; enregistrer: (v: Record<string, unknown>) => Promise<boolean>;
}) {
  const [accepteLe, setAccepteLe] = useState(lot.accepte_le ?? "");
  const [acceptePar, setAcceptePar] = useState(lot.accepte_par ?? "");
  const [facture, setFacture] = useState(lot.reference_facture ?? "");
  const [factureLe, setFactureLe] = useState(lot.facture_le ?? "");
  const [observation, setObservation] = useState(lot.observation ?? "");
  const o = os.find((x) => x.id === lot.os_id);
  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    enregistrer({ accepte_le: accepteLe || null, accepte_par: acceptePar.trim() || null, reference_facture: facture.trim() || null, facture_le: factureLe || null, observation: observation.trim() || null });
  };
  const infos: [string, string][] = [
    ["Travaux exécutés au", dateSeule(lot.date_arret)],
    ["Ordre de service", o ? `OS n° ${o.numero} du ${dateSeule(o.date_os)}` : "—"],
    ["Zone", zones.find((z) => z.id === lot.zone_id)?.libelle ?? "Toutes zones"],
    ["Lieu des travaux", lot.lieu_travaux ?? "—"],
    ["Arrêté le", dateSeule(lot.arrete_le)],
  ];
  return (
    <form onSubmit={soumettre}>
      <Card>
        <CardHeader>
          <CardTitle className="font-normal">En-tête (figé) et suivi</CardTitle>
          <CardDescription>Suivi seulement : l&apos;appli ne calcule ni facture ni décompte.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {infos.map(([l, v]) => (
              <div key={l} className="flex flex-col gap-1"><span className="text-muted-foreground text-xs">{l}</span><span className="text-sm">{v}</span></div>
            ))}
          </div>
          <Separator />
          <FieldGroup className="gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field className="gap-1"><FieldLabel className="text-xs" htmlFor="accepte-le">Accepté par le maître d&apos;ouvrage le</FieldLabel><Input id="accepte-le" type="date" value={accepteLe} disabled={!modifiable} onChange={(e) => setAccepteLe(e.target.value)} /></Field>
              <Field className="gap-1"><FieldLabel className="text-xs" htmlFor="accepte-par">Accepté par</FieldLabel><Input id="accepte-par" value={acceptePar} disabled={!modifiable} onChange={(e) => setAcceptePar(e.target.value)} /></Field>
              <Field className="gap-1"><FieldLabel className="text-xs" htmlFor="facture">Référence de la facture ou du décompte</FieldLabel><Input id="facture" value={facture} disabled={!modifiable} onChange={(e) => setFacture(e.target.value)} /></Field>
              <Field className="gap-1"><FieldLabel className="text-xs" htmlFor="facture-le">Facturé le</FieldLabel><Input id="facture-le" type="date" value={factureLe} disabled={!modifiable} onChange={(e) => setFactureLe(e.target.value)} /></Field>
            </div>
            <Field className="gap-1"><FieldLabel className="text-xs" htmlFor="observation-suivi">Observation</FieldLabel><Textarea id="observation-suivi" rows={2} value={observation} disabled={!modifiable} onChange={(e) => setObservation(e.target.value)} /></Field>
          </FieldGroup>
        </CardContent>
        {modifiable && (
          <CardFooter className="justify-end">
            <Button type="submit" size="sm"><Save data-icon="inline-start" />Enregistrer le suivi</Button>
          </CardFooter>
        )}
      </Card>
    </form>
  );
}
