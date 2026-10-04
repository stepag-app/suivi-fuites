'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/lib/session';

export default function Accueil() {
  const { chargement, session } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!chargement) router.replace(session ? '/fuites' : '/connexion');
  }, [chargement, session, router]);
  return <p className="centre">Chargement…</p>;
}
