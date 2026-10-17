'use client';
// Frontière d'erreur générique (audit S20) : on n'affiche jamais le message brut au client
// (il peut contenir des détails internes/base). Le détail reste dans la console du navigateur.
import { useEffect } from 'react';

export default function Erreur({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="mb-2 text-xl font-semibold">Une erreur est survenue</h1>
        <p className="mb-6 text-muted-foreground">Réessayez ; si le problème persiste, prévenez l&apos;administrateur.</p>
        <button className="underline" onClick={reset}>Réessayer</button>
      </div>
    </main>
  );
}
