'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/lib/session';

export default function MiseEnPage({ children }: { children: ReactNode }) {
  const { chargement, session, profil, marches, marche, choisirMarche, deconnecter } = useSession();
  const router = useRouter();
  const chemin = usePathname();

  useEffect(() => {
    if (!chargement && !session) router.replace('/connexion');
  }, [chargement, session, router]);

  if (chargement || !session) return <p className="centre">Chargement…</p>;

  const lien = (href: string, texte: string) => (
    <Link href={href} className={chemin === href || (href !== '/fuites' && chemin.startsWith(href)) ? 'actif' : ''}>
      {texte}
    </Link>
  );

  return (
    <>
      <header className="entete">
        <nav>
          {lien('/fuites', 'Fuites')}
          {lien('/fuites/nouvelle', '+ Nouvelle fuite')}
          {profil?.est_admin && lien('/utilisateurs', 'Utilisateurs')}
        </nav>
        <div className="entete-droite">
          {marches.length > 1 && (
            <select value={marche?.id ?? ''} onChange={(e) => choisirMarche(e.target.value)} aria-label="Marché">
              {marches.map((m) => (
                <option key={m.id} value={m.id}>{m.code}</option>
              ))}
            </select>
          )}
          <span className="discret">{profil?.nom_complet ?? session.user.email}</span>
          <button onClick={deconnecter}>Quitter</button>
        </div>
      </header>
      <main className="contenu">
        {marche ? (
          children
        ) : (
          <p className="carte">
            Aucun marché n&apos;est affecté à votre compte. Contactez l&apos;administrateur.
          </p>
        )}
      </main>
    </>
  );
}
