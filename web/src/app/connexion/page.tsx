"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { CircleAlert, Droplets, Globe } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";
import { NOM_ORGANISATION, configurationManquante, emailDepuisIdentifiant, getSupabase } from "@/lib/supabase";

export default function Connexion() {
  const { session, chargement } = useSession();
  const router = useRouter();
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const annee = new Date().getFullYear();

  useEffect(() => {
    if (!chargement && session) router.replace("/tableau-de-bord");
  }, [chargement, session, router]);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email: emailDepuisIdentifiant(identifiant), password: motDePasse });
      if (error) throw error;
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="flex h-dvh">
      <div className="hidden bg-primary lg:block lg:w-1/3">
        <div className="flex h-full flex-col items-center justify-center p-12 text-center">
          <div className="space-y-6">
            <Droplets className="mx-auto size-12 text-primary-foreground" />
            <div className="space-y-2">
              <h1 className="font-light text-5xl text-primary-foreground">Bonjour</h1>
              <p className="text-primary-foreground/80 text-xl">Connectez-vous pour continuer</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex w-full items-center justify-center bg-background p-8 lg:w-2/3">
        <div className="w-full max-w-md space-y-10 py-24 lg:py-32">
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-center gap-2 font-medium tracking-tight lg:hidden">
              <Droplets className="size-5 text-sky-600" /> Suivi des fuites
            </div>
            <div className="font-medium tracking-tight">Connexion</div>
            <div className="mx-auto max-w-xl text-muted-foreground">
              Entrez l&apos;identifiant et le mot de passe remis par l&apos;administrateur {NOM_ORGANISATION}.
            </div>
          </div>

          {configurationManquante() ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Configuration manquante</AlertTitle>
              <AlertDescription>
                Les variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent être renseignées.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={soumettre} className="flex flex-col gap-4">
              <FieldGroup className="gap-4">
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="identifiant">Identifiant</FieldLabel>
                  <Input id="identifiant" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} autoCapitalize="none"
                    autoCorrect="off" autoComplete="username" placeholder="ex. agent1" required />
                </Field>
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="mot-de-passe">Mot de passe</FieldLabel>
                  <Input id="mot-de-passe" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)}
                    autoComplete="current-password" placeholder="••••••••" required />
                  <FieldDescription>La session reste ouverte sur cet appareil jusqu&apos;à « Quitter ».</FieldDescription>
                </Field>
              </FieldGroup>
              {erreur && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>Connexion refusée</AlertTitle>
                  <AlertDescription>{erreur}</AlertDescription>
                </Alert>
              )}
              <Button className="w-full" type="submit" size="lg" disabled={envoi}>
                {envoi && <Spinner />}
                {envoi ? "Connexion…" : "Se connecter"}
              </Button>
            </form>
          )}
        </div>

        <div className="absolute bottom-5 flex w-full justify-between px-10 text-muted-foreground text-sm">
          <div>© {annee}, {NOM_ORGANISATION}.</div>
          <div className="flex items-center gap-1"><Globe className="size-4" />FR</div>
        </div>
      </div>
    </div>
  );
}
