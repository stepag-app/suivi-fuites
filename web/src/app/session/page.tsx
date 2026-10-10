'use client';

// Entrée de l'APK (contrat § 6) : la tablette ouvre cette page avec les jetons de sa session Supabase dans
// le fragment d'adresse ; la session est posée ici, le fragment effacé, puis la suite demandée s'ouvre
// (chemin relatif de l'application seulement). Page hors de la mise en page de l'application : aucun menu.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { messageErreur } from '@/lib/format';
import { memoriserLangueApk } from '@/lib/langue-apk';
import { configurationManquante, estContexteApk, getSupabase } from '@/lib/supabase';
import { lireFragmentSession } from './fragment';

export default function PageSession() {
  const router = useRouter();
  const [erreur, setErreur] = useState('');
  const [etape, setEtape] = useState('Ouverture de la session…');

  useEffect(() => {
    let annule = false;
    (async () => {
      if (configurationManquante()) {
        setErreur('Configuration Supabase manquante sur ce site.');
        return;
      }
      const lu = lireFragmentSession(window.location.hash);
      // Le fragment ne doit pas rester dans l'historique ni dans la barre d'adresse.
      window.history.replaceState(null, '', '/session');
      if ('erreur' in lu) {
        setErreur(lu.erreur);
        return;
      }
      try {
        const sb = getSupabase();
        const { error } = await sb.auth.setSession({ access_token: lu.access_token, refresh_token: lu.refresh_token });
        if (error) {
          // Session fermée côté serveur (déconnexion sur un autre appareil, compte révoqué) : seule l'application peut
          // en rouvrir une.
          if (/session missing|session_not_found|refresh token/i.test(error.message)) {
            throw new Error('La session de l\'application a été fermée. Dans l\'application : « Quitter », puis reconnectez-vous.');
          }
          throw error;
        }
        // Dans l'APK, le jeton de rafraîchissement est partagé avec l'application de la tablette : elle seule
        // le renouvelle (et recharge cette page avec les nouveaux jetons). Le client est déjà créé sans
        // rafraîchissement automatique (lib/supabase.ts) ; on l'arrête aussi explicitement, par sûreté.
        if (estContexteApk()) await sb.auth.stopAutoRefresh();
        if (annule) return;
        setEtape('Session ouverte, ouverture de la carte…');
        // replace : le retour arrière de la WebView ne repasse pas par /session sans jetons.
        memoriserLangueApk(lu.suite);
        router.replace(lu.suite);
      } catch (e) {
        if (!annule) setErreur(messageErreur(e));
      }
    })();
    return () => {
      annule = true;
    };
  }, [router]);

  return (
    <main className="ancien flex min-h-screen items-center justify-center p-4" aria-live="polite">
      <div className="carte w-full max-w-sm">
      <h1>Suivi des fuites</h1>
      {erreur ? (
        <>
          <p className="erreur">{erreur}</p>
          <p className="discret">
            Fermez cette fenêtre et rouvrez la carte depuis l&apos;application, ou connectez-vous avec votre identifiant.
          </p>
          <Link className="bouton gros primaire" href="/connexion">Se connecter</Link>
        </>
      ) : (
        <p className="discret">{etape}</p>
      )}
      </div>
    </main>
  );
}
