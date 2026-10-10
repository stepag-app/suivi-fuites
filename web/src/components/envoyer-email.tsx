"use client";

// Bouton « Envoyer par e-mail » (chantier v3, M1 ; contrat docs/lots/chantier-v3-email.md) : fabrique le document,
// propose les destinataires du marché et un texte modifiable, puis l'envoie par la route serveur /api/email.
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { Download, Mail, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  DOCUMENTS_EMAIL, LONGUEUR_MESSAGE, LONGUEUR_OBJET, MAX_DESTINATAIRES, TAILLE_MAX_PIECE,
  decouperAdresses, messageParDefaut, normaliserAdresses, objetParDefaut, texteTaille, type DocumentEmail,
} from "@/lib/email";
import { envoyerDocument, lireDestinataires, usePeutEnvoyerEmail, type Destinataire } from "@/lib/email-client";
import { messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";

export interface DocumentFabrique {
  blob: Blob;
  /** Nom du fichier, extension comprise (.pdf, .xlsx, .docx, .csv). */
  nom: string;
}

export interface ProprietesEnvoi {
  document: DocumentEmail;
  /** Texte court repris dans l'objet proposé et au journal (N° de fuite, période, lot…). */
  reference?: string | null;
  /** Fabrique le fichier à joindre (appelé à l'ouverture du dialogue). */
  fabriquer: () => Promise<DocumentFabrique>;
  objet?: string;
  message?: string;
}

function telechargerLocal({ blob, nom }: DocumentFabrique) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: nom });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Bouton masqué si le compte n'est ni responsable du marché ouvert ni administrateur. */
export function BoutonEnvoyerEmail({
  libelle = "Envoyer par e-mail", variant = "outline", size, disabled, className, ...envoi
}: ProprietesEnvoi & {
  libelle?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  disabled?: boolean;
  className?: string;
}) {
  const peut = usePeutEnvoyerEmail();
  const [ouvert, setOuvert] = useState(false);
  if (!peut) return null;
  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} disabled={disabled} onClick={() => setOuvert(true)}
        title="Envoyer le document par e-mail depuis contact@stepag.ma" aria-label={libelle ? undefined : "Envoyer par e-mail"}>
        {libelle ? <><Mail data-icon="inline-start" />{libelle}</> : <Mail />}
      </Button>
      {ouvert && <DialogueEnvoyerEmail {...envoi} fermer={() => setOuvert(false)} />}
    </>
  );
}

export function DialogueEnvoyerEmail({ document, reference, fabriquer, objet, message, fermer }: ProprietesEnvoi & { fermer: () => void }) {
  const { marche } = useSession();
  const ctxTexte = { document, reference, marche: marche?.code ?? null };
  const [piece, setPiece] = useState<DocumentFabrique | null>(null);
  const [erreurPiece, setErreurPiece] = useState("");
  const [carnet, setCarnet] = useState<Destinataire[]>([]);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [saisies, setSaisies] = useState("");
  const [sujet, setSujet] = useState(objet ?? objetParDefaut(ctxTexte));
  const [texte, setTexte] = useState(message ?? messageParDefaut(ctxTexte));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    let annule = false;
    fabriquer().then((p) => !annule && setPiece(p)).catch((e) => !annule && setErreurPiece(messageErreur(e)));
    if (marche) {
      lireDestinataires(marche.id, true).then((liste) => {
        if (annule) return;
        setCarnet(liste);
        setCoches(new Set(liste.filter((d) => d.par_defaut).map((d) => d.email.toLowerCase())));
      }).catch(() => undefined);
    }
    return () => {
      annule = true;
    };
    // Fabriqué une seule fois à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tapees = useMemo(() => decouperAdresses(saisies), [saisies]);
  const destinataires = normaliserAdresses([...coches, ...tapees.valides]);
  const tropLourd = !!piece && piece.blob.size > TAILLE_MAX_PIECE;
  const pret = !!piece && !tropLourd && !!marche && destinataires.length > 0 && destinataires.length <= MAX_DESTINATAIRES
    && !tapees.invalides.length && !!sujet.trim();

  const basculer = (email: string, coche: boolean) => {
    const n = new Set(coches);
    if (coche) n.add(email.toLowerCase());
    else n.delete(email.toLowerCase());
    setCoches(n);
  };

  async function envoyer() {
    if (!pret || !piece || !marche) return;
    setEnvoi(true);
    setErreur("");
    try {
      await envoyerDocument({
        marcheId: marche.id, document, reference, destinataires, objet: sujet.trim(), message: texte, blob: piece.blob, nom: piece.nom,
      });
      toast.success(`Envoyé à ${destinataires.length} destinataire${destinataires.length > 1 ? "s" : ""} (copie dans contact@stepag.ma)`);
      fermer();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !envoi && fermer()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Envoyer par e-mail</DialogTitle>
          <DialogDescription>
            {DOCUMENTS_EMAIL[document]}{reference ? ` — ${reference}` : ""}. Envoyé depuis contact@stepag.ma ; les réponses
            et une copie arrivent dans cette boîte.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Destinataires</FieldLabel>
            {carnet.length ? (
              <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md border p-2">
                {carnet.map((d) => (
                  <label key={d.id} className="flex items-start gap-2 text-sm">
                    <Checkbox checked={coches.has(d.email.toLowerCase())} onCheckedChange={(v) => basculer(d.email, v === true)} className="mt-0.5" />
                    <span>
                      <span className="font-medium">{d.nom}</span>
                      {d.organisme ? <span className="text-muted-foreground"> · {d.organisme}</span> : null}
                      <span className="block text-muted-foreground text-xs">{d.email}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <FieldDescription>Aucun destinataire enregistré pour ce marché (Paramètres › Marché › Destinataires).</FieldDescription>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="email-autres">Autres adresses</FieldLabel>
            <Input id="email-autres" value={saisies} onChange={(e) => setSaisies(e.target.value)} placeholder="nom@exemple.ma, autre@exemple.ma"
              inputMode="email" autoComplete="off" aria-invalid={tapees.invalides.length > 0} />
            <FieldDescription>
              {tapees.invalides.length
                ? <span className="text-destructive">Adresse invalide : {tapees.invalides.join(", ")}</span>
                : `${destinataires.length} destinataire${destinataires.length > 1 ? "s" : ""} (${MAX_DESTINATAIRES} au plus).`}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="email-objet">Objet</FieldLabel>
            <Input id="email-objet" value={sujet} maxLength={LONGUEUR_OBJET} onChange={(e) => setSujet(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="email-message">Message</FieldLabel>
            <Textarea id="email-message" rows={6} value={texte} maxLength={LONGUEUR_MESSAGE} onChange={(e) => setTexte(e.target.value)} />
          </Field>
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
            {piece ? <Paperclip className="size-4 shrink-0" /> : erreurPiece ? null : <Spinner />}
            <span className="min-w-0 flex-1 truncate">
              {piece ? `${piece.nom} · ${texteTaille(piece.blob.size)}` : erreurPiece ? <span className="text-destructive">{erreurPiece}</span> : "Préparation du document…"}
            </span>
            {piece ? <Button type="button" variant="ghost" size="sm" onClick={() => telechargerLocal(piece)}><Download data-icon="inline-start" />Voir</Button> : null}
          </div>
          {tropLourd ? (
            <Alert variant="destructive">
              <AlertDescription>
                Document trop lourd pour l&apos;envoi ({texteTaille(piece!.blob.size)}, {texteTaille(TAILLE_MAX_PIECE)} au plus) :
                téléchargez-le avec « Voir » et joignez-le depuis votre messagerie, ou réduisez la sélection.
              </AlertDescription>
            </Alert>
          ) : null}
          {erreur ? <Alert variant="destructive"><AlertDescription>{erreur}</AlertDescription></Alert> : null}
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer} disabled={envoi}>Annuler</Button>
          <Button type="button" onClick={envoyer} disabled={!pret || envoi}>
            {envoi ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}{envoi ? "Envoi…" : "Envoyer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
