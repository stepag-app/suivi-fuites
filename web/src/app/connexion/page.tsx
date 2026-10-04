'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { messageErreur } from '@/lib/format';
import { useSession } from '@/lib/session';
import { NOM_ORGANISATION, configurationManquante, emailDepuisIdentifiant, getSupabase } from '@/lib/supabase';

export default function Connexion() {
  const { session, chargement } = useSession();
  const router = useRouter();
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!chargement && session) router.replace('/fuites');
  }, [chargement, session, router]);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({
        email: emailDepuisIdentifiant(identifiant),
        password: motDePasse,
      });
      if (error) throw error;
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  if (configurationManquante()) {
    return (
      <main className="carte connexion">
        <h1>Suivi des fuites</h1>
        <p className="erreur">
          Configuration manquante : les variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY
          doivent être renseignées dans Vercel.
        </p>
      </main>
    );
  }

  return (
    <main className="carte connexion">
      <h1>Suivi des fuites</h1>
      <p className="discret">{NOM_ORGANISATION}</p>
      <form onSubmit={soumettre}>
        <label>
          Identifiant
          <input
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            required
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {erreur && <p className="erreur">{erreur}</p>}
        <button className="gros primaire" disabled={envoi}>
          {envoi ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
