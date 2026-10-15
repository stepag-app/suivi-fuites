'use client';

// Mode d'emploi des tablettes verrouillées (lot TP), ouvert depuis Paramètres › Tablettes : déverrouiller et
// reverrouiller, préparer une première tablette, maintenance, problèmes. Écrit pour l'administrateur et son binôme,
// sans Mac ni Claude. Même contenu que la note Claude Docs « Briefing — Tablettes verrouillées Suivi fuites ».
import { BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Etapes = ({ children }: { children: ReactNode }) => <ol className="ml-5 flex list-decimal flex-col gap-1.5">{children}</ol>;
const Note = ({ children }: { children: ReactNode }) => <p className="rounded-lg border bg-muted/40 p-3 text-muted-foreground">{children}</p>;

export function ModeEmploiTablettes() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline"><BookOpen data-icon="inline-start" />Mode d&apos;emploi</Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tablettes verrouillées : mode d&apos;emploi</DialogTitle>
          <DialogDescription>
            Chaque tablette d&apos;agent ne montre que Suivi fuites, Appareil photo, Maps, Téléphone, Contacts, Messages et
            WhatsApp. Paramètres, Play Store et installations sont fermés ; un code temporaire les ouvre. Tout se fait depuis
            ce panneau et la tablette, sans ordinateur branché.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="deverrouiller" className="min-h-0 flex-1">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="deverrouiller">Déverrouiller</TabsTrigger>
            <TabsTrigger value="premiere">Première tablette</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
            <TabsTrigger value="problemes">En cas de problème</TabsTrigger>
          </TabsList>
          <div className="mt-3 min-h-0 overflow-y-auto pr-1 text-sm leading-relaxed">
            <TabsContent value="deverrouiller" className="flex flex-col gap-3">
              <p className="font-medium">Sur ce panneau</p>
              <Etapes>
                <li>Bloc « Code de déverrouillage » : choisir <strong>Déverrouiller 15 minutes, 1 heure ou 4 heures</strong>, motif facultatif.</li>
                <li><strong>Générer un code</strong> : 8 chiffres, affichés une seule fois. Valable 24 heures, une seule fois, sur n&apos;importe quelle tablette. On peut le dicter par téléphone.</li>
              </Etapes>
              <p className="font-medium">Sur la tablette (réseau nécessaire, un compte connecté dans Suivi fuites : celui de l&apos;agent suffit)</p>
              <Etapes>
                <li>Ouvrir Suivi fuites, toucher le bouton <strong>Tablette</strong> (cadenas) sur la liste des fuites.</li>
                <li>Taper le code, toucher <strong>Déverrouiller</strong>.</li>
                <li>Bandeau « Tablette déverrouillée jusqu&apos;à … » : Paramètres et Play Store réapparaissent sur l&apos;écran d&apos;accueil ; boutons <strong>Ouvrir les Paramètres</strong> et <strong>Ouvrir le Play Store</strong>.</li>
                <li>Faire le réglage ou l&apos;installation.</li>
                <li>Toucher <strong>Reverrouiller maintenant</strong> (écran Tablette, ou toucher le bandeau). Sinon la tablette se reverrouille seule à l&apos;heure, même éteinte puis rallumée.</li>
              </Etapes>
              <Note>Une appli installée pendant le déverrouillage reste visible ensuite sur cette tablette. Cinq codes faux dans l&apos;heure bloquent les essais du compte pendant une heure.</Note>
              <p className="font-medium">Wi-Fi sans code</p>
              <p>L&apos;agent n&apos;a pas besoin de code pour rejoindre un Wi-Fi (forfait 4G épuisé), même session fermée : il tire le <strong>volet du haut</strong> d&apos;Android. Un toucher sur la tuile Wi-Fi l&apos;allume ou l&apos;éteint ; un appui long montre les réseaux. Un réseau déjà enregistré se rejoint d&apos;un toucher ; pour un nouveau réseau, la fenêtre <strong>Wi-Fi</strong> de Suivi fuites s&apos;ouvre : mot de passe, <strong>Se connecter</strong>. Les données mobiles et le mode avion se règlent aussi dans le volet.</p>
            </TabsContent>

            <TabsContent value="premiere" className="flex flex-col gap-3">
              <p>Pour une tablette neuve, ou réinitialisée. Environ 15 minutes.</p>
              <p className="font-medium">Avant de commencer</p>
              <ul className="ml-5 flex list-disc flex-col gap-1">
                <li>Carte SIM insérée, batterie chargée.</li>
                <li>QR code imprimé (bloc « QR code de préparation » › <strong>Imprimer avec le mode d&apos;emploi</strong>) ; il ne change pas d&apos;une version à l&apos;autre.</li>
                <li>Mot de passe du <strong>compte Google des tablettes</strong> (le même pour toutes). Jamais <code>stepag.app@gmail.com</code>.</li>
              </ul>
              <Etapes>
                <li>Allumer. Sur le <strong>premier écran</strong> (choix de la langue), toucher <strong>6 fois</strong> le même endroit vide.</li>
                <li>Le lecteur de QR code s&apos;ouvre. Si Android demande un réseau : un Wi-Fi, ou continuer en 4G. Viser le QR code imprimé.</li>
                <li>Android télécharge Suivi fuites, la déclare propriétaire de la tablette et pose le verrou. Accepter les écrans d&apos;Android ; aucun compte n&apos;est demandé.</li>
                <li>Écran d&apos;accueil avec les 7 applis : ouvrir Suivi fuites, connecter l&apos;agent (ou votre compte).</li>
                <li>Ici, générer un code <strong>Déverrouiller 1 heure</strong> ; le taper dans Suivi fuites › Tablette.</li>
                <li>Paramètres › Comptes (ou « Comptes et synchronisation ») : ajouter le compte Google des tablettes.</li>
                <li>Play Store : installer <strong>WhatsApp</strong> ; dans les réglages du Play Store, mises à jour automatiques en <strong>Wi-Fi uniquement</strong>.</li>
                <li>Réglages de Suivi fuites (Xiaomi / HyperOS) : Paramètres › Applis › Gérer les applis › <strong>Suivi des fuites</strong> › <strong>Batterie</strong> : aucune restriction ; puis <strong>Autorisations de l&apos;application</strong> › <strong>Autres autorisations</strong> : mettre les quatre lignes sur « Toujours autoriser », dont « Ouvrir de nouvelles fenêtres contextuelles pendant l&apos;exécution en arrière-plan » (sans elle, l&apos;appli ne se rouvre pas seule après une mise à jour).</li>
                <li><strong>Reverrouiller maintenant</strong>. La tablette apparaît dans le journal (« Préparée (QR code) »).</li>
              </Etapes>
              <Note>La 4G de la tablette est réservée à Suivi fuites, Maps, WhatsApp et aux services Google ; le Play Store et les mises à jour d&apos;Android passent par le Wi-Fi.</Note>
            </TabsContent>

            <TabsContent value="maintenance" className="flex flex-col gap-3">
              <ul className="ml-5 flex list-disc flex-col gap-2">
                <li><strong>Mise à jour de Suivi fuites</strong> : rien à faire. Quand une version est publiée, l&apos;agent touche « Installer maintenant » ; l&apos;appli se ferme quelques secondes. Sur les tablettes Xiaomi, elle ne se rouvre pas seule : l&apos;agent la rouvre d&apos;un toucher (HyperOS interdit tout réveil de l&apos;appli après une mise à jour).</li>
                <li><strong>WebView, Maps, WhatsApp</strong> (une fois par mois, au bureau, en Wi-Fi) : code « 1 heure » › Ouvrir le Play Store › photo du compte › Gérer les applis › Tout mettre à jour › Reverrouiller.</li>
                <li><strong>Changer un réglage</strong> (langue, luminosité…) : code « 15 minutes » › Ouvrir les Paramètres › Reverrouiller.</li>
                <li><strong>Ajouter une appli</strong> : code « 1 heure » › Play Store › installer › Reverrouiller. L&apos;appli reste sur cette tablette.</li>
                <li><strong>Rendre ou revendre une tablette</strong> : code « Libérer la tablette (définitif) », tapé comme un code de déverrouillage. Tout est remis, Suivi fuites reste installée comme une appli normale. Pour la reverrouiller : réinitialiser, puis « Première tablette ».</li>
                <li><strong>Suivi</strong> : le journal de cet onglet dit qui a créé chaque code, quelle tablette l&apos;a utilisé, quand elle s&apos;est reverrouillée et quelles mises à jour ont été installées.</li>
              </ul>
            </TabsContent>

            <TabsContent value="problemes" className="flex flex-col gap-3">
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left">
                  <thead className="bg-muted/50"><tr><th className="p-2 font-medium">Problème</th><th className="p-2 font-medium">Que faire</th></tr></thead>
                  <tbody className="[&_td]:border-t [&_td]:p-2 [&_td]:align-top">
                    <tr><td>« Code inconnu, expiré ou déjà utilisé »</td><td>Générer un nouveau code (24 h, une seule fois).</td></tr>
                    <tr><td>« Trop de codes refusés »</td><td>Attendre une heure, ou se connecter avec un autre compte dans Suivi fuites.</td></tr>
                    <tr><td>« Vérification impossible : vérifiez le réseau »</td><td>Aller là où il y a la 4G ou un Wi-Fi : le code est vérifié par le serveur.</td></tr>
                    <tr><td>Pas de Wi-Fi, forfait 4G épuisé</td><td>Volet du haut › appui long sur la tuile Wi-Fi : choisir le réseau, taper le mot de passe dans la fenêtre Wi-Fi de Suivi fuites. Les envois en attente partent dès la connexion.</td></tr>
                    <tr><td>Pas de bouton « Tablette » dans Suivi fuites</td><td>Cette tablette n&apos;est pas verrouillée par Suivi fuites : la préparer (« Première tablette »).</td></tr>
                    <tr><td>Suivi fuites plante dès son ouverture</td><td>Téléphone, Maps et WhatsApp marchent encore. Réinitialiser par les boutons (tablette éteinte : Volume + et Marche ensemble, puis « Wipe data ») ; Android demande le compte Google des tablettes ; puis « Première tablette ».</td></tr>
                    <tr><td>Tablette perdue ou volée</td><td>Désactiver le compte de l&apos;agent (Utilisateurs). Sans le compte Google des tablettes, elle est inutilisable après une réinitialisation.</td></tr>
                  </tbody>
                </table>
              </div>
              <Note>Pendant les congés de l&apos;administrateur : son binôme se connecte au panneau avec un compte administrateur ; tout ce qui précède se fait sans Mac ni Claude. Ce qu&apos;il fait est noté dans le journal sous le nom du compte utilisé.</Note>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
