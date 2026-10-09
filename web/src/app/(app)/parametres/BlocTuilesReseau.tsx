'use client';

// Paramètres > Réseau : tuiles vectorielles du réseau (X5). L'archive PMTiles est fabriquée dans ce navigateur à partir
// des tronçons et des nœuds de la base, puis déposée dans le compartiment privé R2 (fonction serveur reseau-tuiles).
// À refaire après chaque import ou zonage : tant que l'archive est périmée, la carte lit le réseau secteur par secteur.
import { useCallback, useEffect, useState } from 'react';
import { messageErreur, nombre } from '@/lib/format';
import { chargerNoeudsComplet, chargerReseauComplet, type ContexteReseau } from '@/lib/reseau/donnees';
import { estampilleReseau } from '@/lib/reseau/tuiles-format';
import { deposerTuiles, etatTuiles, type TuilesReseau } from '@/lib/reseau/tuiles';

type Etat = { chargement: true } | { chargement: false; disponible: boolean; tuiles: TuilesReseau | null; erreur?: string };

export function BlocTuilesReseau({ marcheId, contexte }: { marcheId: string; contexte: ContexteReseau }) {
  const [etat, setEtat] = useState<Etat>({ chargement: true });
  const [etape, setEtape] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);

  const lire = useCallback(async () => {
    setEtat({ chargement: true });
    setEtat({ chargement: false, ...(await etatTuiles(marcheId)) });
  }, [marcheId]);

  useEffect(() => {
    lire();
  }, [lire]);

  const empreinte = estampilleReseau(contexte.lignes, contexte.sansSecteur);
  const tuiles = !etat.chargement ? etat.tuiles : null;
  const aJour = !!tuiles && tuiles.infos?.estampille === empreinte;

  const generer = async () => {
    setOccupe(true);
    setErreur('');
    try {
      setEtape('Lecture des tronçons et des nœuds…');
      const [troncons, noeuds, { genererPmtiles }] = await Promise.all([
        chargerReseauComplet(marcheId, 0), chargerNoeudsComplet(marcheId), import('@/lib/reseau/pmtiles'),
      ]);
      setEtape(`Découpage de ${nombre(troncons.features.length, 0)} tronçons et ${nombre(noeuds.features.length, 0)} nœuds en tuiles…`);
      await new Promise((r) => setTimeout(r, 30));
      const debut = performance.now();
      const r = genererPmtiles(troncons, noeuds, {
        version: 1, marche_id: marcheId, estampille: empreinte, genere_le: new Date().toISOString(),
        nb_troncons: troncons.features.length, nb_noeuds: noeuds.features.length,
      });
      setEtape(`Envoi de l'archive (${(r.octets.length / 1048576).toFixed(1).replace('.', ',')} Mo, ${r.nbTuiles} tuiles, fabriquée en ${Math.max(1, Math.round((performance.now() - debut) / 1000))} s)…`);
      await deposerTuiles(marcheId, r.octets);
      setEtape('');
      await lire();
    } catch (e) {
      setErreur(messageErreur(e));
      setEtape('');
    }
    setOccupe(false);
  };

  return (
    <section className="carte">
      <div className="barre">
        <h2>Tuiles du réseau (carte rapide)</h2>
        <div className="actions en-tete">
          <button onClick={lire} disabled={etat.chargement || occupe}>Vérifier</button>
          <button className="primaire" onClick={generer}
            disabled={occupe || etat.chargement || !etat.disponible || contexte.lignes.length + (Number(contexte.sansSecteur?.nb_troncons) || 0) === 0}>
            {occupe ? 'Génération…' : tuiles ? 'Régénérer les tuiles' : 'Générer les tuiles'}
          </button>
        </div>
      </div>
      <p className="discret">
        Tout le réseau s&apos;affiche d&apos;un bloc et reste fluide sur la tablette. Le fichier reste privé (lecture par URL
        signée). À régénérer après chaque import ou modification du zonage : en attendant, la carte lit le réseau secteur
        par secteur (plus lent, toujours juste).
      </p>
      {etat.chargement && <p className="discret">Vérification…</p>}
      {!etat.chargement && !etat.disponible && <p className="erreur">Tuiles indisponibles : {etat.erreur ?? 'fonction reseau-tuiles injoignable'}.</p>}
      {!etat.chargement && etat.disponible && !tuiles && <p className="info">Aucune archive : la carte lit le réseau secteur par secteur.</p>}
      {tuiles && (
        <p className={aJour ? 'info' : 'erreur'} role="status">
          {aJour ? 'À jour' : 'Périmées (le réseau a changé depuis : régénérez)'}
          {tuiles.infos ? ` · générées le ${new Date(tuiles.infos.genere_le).toLocaleString('fr-FR')}, ${nombre(tuiles.infos.nb_troncons, 0)} tronçons, ${nombre(tuiles.infos.nb_noeuds, 0)} nœuds` : ''}
          {tuiles.octets ? ` · ${(tuiles.octets / 1048576).toFixed(1).replace('.', ',')} Mo` : ''}
        </p>
      )}
      {etape && <p className="discret" role="status">{etape}</p>}
      {erreur && <p className="erreur">{erreur}</p>}
    </section>
  );
}
