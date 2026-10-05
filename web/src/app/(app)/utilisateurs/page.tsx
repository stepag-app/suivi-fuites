'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useSession } from '@/lib/session';
import { Comptes } from './Comptes';
import { Droits } from './Droits';

// useSearchParams demande une frontière Suspense (page rendue côté navigateur).
export default function Utilisateurs() {
  return (
    <Suspense fallback={<p className="discret">Chargement…</p>}>
      <PageUtilisateurs />
    </Suspense>
  );
}

// Onglet et marché de la matrice dans l'adresse : /utilisateurs?onglet=droits&marche=<uuid>
function PageUtilisateurs() {
  const { profil, marches, marche } = useSession();
  const router = useRouter();
  const chemin = usePathname();
  const parametres = useSearchParams();
  const onglet = parametres.get('onglet') === 'droits' ? 'droits' : 'comptes';
  const demande = parametres.get('marche');
  const marcheId = marches.some((m) => m.id === demande) ? (demande as string) : (marche?.id ?? marches[0]?.id ?? '');

  if (!profil?.est_admin) return <p className="carte">Réservé à l&apos;administrateur.</p>;

  const aller = (o: 'comptes' | 'droits', m?: string) => {
    const q = new URLSearchParams();
    if (o === 'droits') {
      q.set('onglet', 'droits');
      if (m && m !== marche?.id) q.set('marche', m);
    }
    const suite = q.toString();
    router.replace(suite ? `${chemin}?${suite}` : chemin);
  };

  return (
    <>
      <h1>Utilisateurs</h1>
      <div className="onglets" role="tablist">
        <button role="tab" aria-selected={onglet === 'comptes'} className={onglet === 'comptes' ? 'actif' : ''} onClick={() => aller('comptes')}>
          Comptes
        </button>
        <button role="tab" aria-selected={onglet === 'droits'} className={onglet === 'droits' ? 'actif' : ''} onClick={() => aller('droits', marcheId)}>
          Droits
        </button>
      </div>
      {onglet === 'comptes' ? <Comptes /> : marcheId ? <Droits marcheId={marcheId} choisirMarche={(m) => aller('droits', m)} /> : (
        <p className="carte">Aucun marché : créez-en un dans la page Marchés.</p>
      )}
    </>
  );
}
