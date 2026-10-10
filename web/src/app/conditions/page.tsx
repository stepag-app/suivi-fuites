import type { Metadata } from 'next';

// Page publique (hors de la mise en page de l'application, aucune connexion requise). Google l'exige, avec la
// politique de confidentialité, pour publier l'application OAuth « Sauvegarde Suivi-fuites ».
export const metadata: Metadata = {
  title: 'Conditions d’utilisation – Suivi des fuites',
  description: 'Conditions d’utilisation de l’application de suivi des fuites de STEPAG.',
};

export default function PageConditions() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 leading-relaxed">
      <h1 className="text-2xl font-semibold">Conditions d’utilisation</h1>
      <p>
        « Suivi des fuites » est un outil professionnel de STEPAG SARL (stepag.ma). Son usage est réservé aux personnes
        dont le compte a été créé par un administrateur de STEPAG, pour le marché auquel elles sont affectées.
      </p>
      <ul className="list-disc space-y-2 pl-6">
        <li>Chaque compte est personnel : l’identifiant et le mot de passe ne se partagent pas.</li>
        <li>
          Les saisies (fuites, photos, positions, quantités) doivent correspondre à des interventions réelles ; elles
          servent de base aux attachements du marché.
        </li>
        <li>Les données restent la propriété de STEPAG et de son client ; elles ne doivent pas être extraites à d’autres fins.</li>
        <li>L’accès peut être suspendu ou retiré à tout moment par un administrateur.</li>
      </ul>
      <p>
        Le traitement des données est décrit dans la{' '}
        <a className="underline" href="/confidentialite">
          politique de confidentialité
        </a>
        . Contact :{' '}
        <a className="underline" href="mailto:contact@stepag.ma">
          contact@stepag.ma
        </a>
        .
      </p>
    </main>
  );
}
