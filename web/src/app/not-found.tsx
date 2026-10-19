// Page 404 générique (audit S20) : aucun détail technique.
import Link from 'next/link';

export default function Introuvable() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="mb-2 text-xl font-semibold">Page introuvable</h1>
        <p className="mb-6 text-muted-foreground">La page demandée n&apos;existe pas ou a été déplacée.</p>
        <Link className="underline" href="/">Retour à l&apos;accueil</Link>
      </div>
    </main>
  );
}
