'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { StatutReseau } from '@/lib/StatutReseau';
import { NOM_ORGANISATION } from '@/lib/supabase';

export default function MiseEnPage({ children }: { children: ReactNode }) {
  const { chargement, session, profil, marches, marche, choisirMarche, peut, verrous, deconnecter } = useSession();
  const router = useRouter();
  const chemin = usePathname();

  useEffect(() => {
    if (!chargement && !session) router.replace('/connexion');
  }, [chargement, session, router]);

  if (chargement || !session) return <p className="centre">Chargement…</p>;

  const actif = (href: string) =>
    href === '/fuites' ? chemin === '/fuites' || (chemin.startsWith('/fuites/') && chemin !== '/fuites/nouvelle') : chemin.startsWith(href);
  const lien = (href: string, texte: string, classe = '') => (
    <Link href={href} className={[actif(href) ? 'actif' : '', classe].filter(Boolean).join(' ')}>
      {texte}
    </Link>
  );
  const nom = profil?.nom_complet ?? session.user.email ?? '';
  const initiales = nom.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase()).join('');

  return (
    <>
      {/* Barre d'application (style SAP Fiori) : logo, marché, utilisateur */}
      <header className="shell">
        <Link href="/fuites" className="shell-logo"><span className="goutte" aria-hidden="true" />Suivi des fuites</Link>
        <span className="shell-org">{NOM_ORGANISATION}</span>
        <div className="shell-droite">
          {marches.length > 1 ? (
            <select value={marche?.id ?? ''} onChange={(e) => choisirMarche(e.target.value)} aria-label="Marché">
              {marches.map((m) => (
                <option key={m.id} value={m.id}>{m.code}{m.actif === false ? ' (désactivé)' : ''}</option>
              ))}
            </select>
          ) : marche ? <span className="shell-org">{marche.code}</span> : null}
          <span className="shell-utilisateur" title={nom}>
            <span className="avatar" aria-hidden="true">{initiales}</span><span className="nom">{nom}</span>
          </span>
          <button onClick={deconnecter}>Quitter</button>
        </div>
      </header>
      {/* Onglets des modules, selon les droits (Utilisateurs et Marchés : administrateur seulement) */}
      <nav className="onglets-modules" aria-label="Modules">
        {peut('fuites', 'lire') && lien('/fuites', 'Fuites')}
        {peut('fuites', 'lire') && lien('/tableau-de-bord', 'Tableau de bord')}
        {peut('fuites', 'lire') && lien('/carte', 'Carte')}
        {peut('attachements', 'lire') && lien('/attachements', 'Attachements')}
        {(peut('parametres', 'creer') || peut('parametres', 'modifier') || peut('ouvriers', 'creer') || peut('ouvriers', 'modifier')
          || peut('evenements', 'lire')) && lien('/parametres', 'Paramètres')}
        {/* Rappel des verrous de sécurité posés par l'administrateur sur lui-même */}
        {profil?.est_admin && lien('/utilisateurs', verrous.length
          ? `Utilisateurs (${verrous.length} verrou${verrous.length > 1 ? 's' : ''})` : 'Utilisateurs')}
        {profil?.est_admin && lien('/marches', 'Marchés')}
        {peut('fuites', 'creer') && lien('/fuites/nouvelle', '+ Nouvelle fuite', 'action')}
      </nav>
      <StatutReseau />
      {/* Écrans de bureau (attachements, matrice des droits) et carte : plus larges */}
      <main className={['/attachements', '/carte', '/utilisateurs'].some((p) => chemin.startsWith(p)) ? 'contenu large' : 'contenu'}>
        {/* La page Marchés reste accessible à l'administrateur sans marché (création du premier). */}
        {marche || (profil?.est_admin && chemin.startsWith('/marches')) ? (
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
