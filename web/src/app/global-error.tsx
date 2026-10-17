'use client';
// Frontière d'erreur racine (audit S20) : remplace l'écran d'erreur par défaut de Next, qui
// peut exposer la pile en clair. Message générique uniquement.
import { useEffect } from 'react';

export default function ErreurGlobale({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="fr">
      <body>
        <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ maxWidth: 360, textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Une erreur est survenue</h1>
            <p style={{ marginBottom: 24 }}>Réessayez ; si le problème persiste, prévenez l&apos;administrateur.</p>
            <button style={{ textDecoration: 'underline' }} onClick={reset}>Réessayer</button>
          </div>
        </main>
      </body>
    </html>
  );
}
