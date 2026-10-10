import type { Metadata } from 'next';

// Page publique (hors de la mise en page de l'application, aucune connexion requise). Google l'exige pour
// publier l'application OAuth « Sauvegarde Suivi-fuites » (accès au Drive de la sauvegarde nocturne).
export const metadata: Metadata = {
  title: 'Politique de confidentialité – Suivi des fuites',
  description: 'Données traitées par l’application de suivi des fuites de STEPAG et par sa sauvegarde.',
};

export default function PageConfidentialite() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 leading-relaxed">
      <h1 className="text-2xl font-semibold">Politique de confidentialité</h1>
      <p>
        « Suivi des fuites » est l’application interne de STEPAG SARL (stepag.ma) pour la détection et la réparation de
        fuites sur le réseau d’eau potable. Elle est réservée aux agents et aux responsables dont le compte a été créé
        par l’administrateur de STEPAG : il n’y a pas d’inscription publique.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Données traitées</h2>
        <p>
          Comptes des agents (identifiant, nom, rôle), fuites, réparations et quantités saisies, photos géolocalisées,
          position GPS des agents pendant leur service, journal des modifications. Ces données servent uniquement à
          exécuter le marché et à produire les rapports et attachements. Elles ne sont ni vendues, ni utilisées à des
          fins publicitaires, ni transmises à d’autres tiers que les hébergeurs listés ci-dessous.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Hébergement et sauvegarde</h2>
        <p>
          Base de données et comptes : Supabase (région Paris). Photos : Cloudflare R2. Panneau web : Vercel. Une copie
          de sauvegarde chiffrée de la base, des photos et des applications est déposée chaque nuit sur le Google Drive
          du compte de STEPAG, qui reste sous le seul contrôle de STEPAG.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Application Google « Sauvegarde Suivi-fuites »</h2>
        <p>
          Cette application demande l’accès à Google Drive du seul compte de STEPAG, pour y écrire et relire ses propres
          sauvegardes. Elle ne lit, ne partage et ne transmet aucun fichier de tiers. L’usage des informations reçues
          des API Google respecte la politique « Google API Services User Data Policy », y compris ses exigences
          d’utilisation limitée.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Conservation et droits</h2>
        <p>
          Les données du marché sont conservées pendant sa durée et les délais légaux qui suivent ; les sauvegardes
          quotidiennes sont gardées 30 jours et les sauvegardes mensuelles 12 mois. Toute personne concernée peut
          demander l’accès, la correction ou la suppression de ses données en écrivant à{' '}
          <a className="underline" href="mailto:contact@stepag.ma">
            contact@stepag.ma
          </a>
          .
        </p>
      </section>
    </main>
  );
}
