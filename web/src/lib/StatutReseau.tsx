'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { compterAttente, ecouterAttente, synchroniser } from './hors-ligne';

// Enregistre le service worker, lance la synchronisation (retour du réseau, retour sur
// l'application, toutes les 30 s s'il reste des envois) et affiche l'état dans l'en-tête.
export function StatutReseau() {
  const [enLigne, setEnLigne] = useState(true);
  const [attente, setAttente] = useState(0);
  const [synchro, setSynchro] = useState(false);

  const rafraichir = useCallback(async () => setAttente(await compterAttente()), []);

  const envoyer = useCallback(async () => {
    if (!navigator.onLine) return;
    setSynchro(true);
    try {
      await synchroniser();
    } catch {
      /* réessayé au prochain déclenchement */
    }
    setSynchro(false);
    await rafraichir();
  }, [rafraichir]);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    setEnLigne(navigator.onLine);
    rafraichir();
    envoyer();
    const enLigneF = () => {
      setEnLigne(true);
      envoyer();
    };
    const horsLigneF = () => setEnLigne(false);
    const visible = () => document.visibilityState === 'visible' && envoyer();
    window.addEventListener('online', enLigneF);
    window.addEventListener('offline', horsLigneF);
    document.addEventListener('visibilitychange', visible);
    const arreter = ecouterAttente(rafraichir);
    const minuteur = setInterval(() => {
      compterAttente().then((n) => { if (n > 0) envoyer(); });
    }, 30000);
    return () => {
      window.removeEventListener('online', enLigneF);
      window.removeEventListener('offline', horsLigneF);
      document.removeEventListener('visibilitychange', visible);
      arreter();
      clearInterval(minuteur);
    };
  }, [envoyer, rafraichir]);

  if (enLigne && attente === 0) return null;
  return (
    <div className={enLigne ? 'bandeau attente' : 'bandeau horsligne'} role="status">
      {!enLigne && <strong>Hors ligne. </strong>}
      {attente > 0 ? (
        <>
          <Link href="/en-attente">
            {attente} fuite{attente > 1 ? 's' : ''} à envoyer
          </Link>
          {enLigne && (synchro ? ' · envoi en cours…' : '')}
          {!enLigne && ' : elles partiront au retour du réseau.'}
        </>
      ) : (
        'Les fuites saisies seront gardées sur la tablette puis envoyées au retour du réseau.'
      )}
    </div>
  );
}
