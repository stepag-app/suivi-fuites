'use client';

// Paramètres > Réseau : fond de carte hors ligne de la ville (lot CH). Extrait OpenStreetMap de Protomaps fabriqué sur
// le Mac par `outils/fond-carte/fabriquer.sh` (le navigateur ne peut pas lire les archives de Protomaps), déposé ici
// dans le compartiment privé R2 (`fonds/<marché>/fond.pmtiles`). Les tablettes le copient à la prochaine ouverture de
// la carte avec réseau et l'affichent ensuite, en ligne comme sans réseau. À refaire tous les trois mois environ.
import { useCallback, useEffect, useRef, useState } from 'react';
import { dateHeure, messageErreur } from '@/lib/format';
import { deposerTuiles, etatFond, type EtatFond } from '@/lib/reseau/tuiles';

const TAILLE_MAX = 100 * 1048576;
const enMo = (octets: number) => `${(octets / 1048576).toFixed(1).replace('.', ',')} Mo`;

/** En-tête PMTiles v3 : « PMTiles » puis la version 3, et des tuiles vectorielles (type 1). */
async function verifierArchive(f: File): Promise<string | null> {
  if (!f.size || f.size > TAILLE_MAX) return `Taille inattendue (${enMo(f.size)}).`;
  const t = new Uint8Array(await f.slice(0, 127).arrayBuffer());
  if (new TextDecoder().decode(t.slice(0, 7)) !== 'PMTiles' || t[7] !== 3) return 'Ce fichier n\'est pas une archive PMTiles (version 3).';
  if (t[99] !== 1) return 'L\'archive ne contient pas des tuiles vectorielles (fond Protomaps attendu).';
  return null;
}

export function BlocFondCarte({ marcheId }: { marcheId: string }) {
  const [etat, setEtat] = useState<EtatFond | null>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const champ = useRef<HTMLInputElement>(null);

  const lire = useCallback(async () => {
    setEtat(null);
    setEtat(await etatFond(marcheId));
  }, [marcheId]);

  useEffect(() => {
    lire();
  }, [lire]);

  const deposer = async () => {
    if (!fichier) return;
    setOccupe(true);
    setErreur('');
    setMessage('');
    try {
      const refus = await verifierArchive(fichier);
      if (refus) throw new Error(refus);
      setMessage(`Envoi du fond (${enMo(fichier.size)})…`);
      await deposerTuiles(marcheId, fichier, 'fond');
      setMessage('Fond déposé : les tablettes le copieront à la prochaine ouverture de la carte avec réseau.');
      setFichier(null);
      if (champ.current) champ.current.value = '';
      await lire();
    } catch (e) {
      setMessage('');
      setErreur(messageErreur(e));
    }
    setOccupe(false);
  };

  return (
    <section className="carte">
      <div className="barre">
        <h2>Fond de carte hors ligne</h2>
        <div className="actions en-tete">
          <button onClick={lire} disabled={!etat || occupe}>Vérifier</button>
        </div>
      </div>
      <p className="discret">
        Rues, noms, bâtiments et points d&apos;intérêt de la ville (OpenStreetMap, extrait Protomaps), gardés sur les
        tablettes pour la carte de balayage sans réseau. Fichier fabriqué sur le Mac par{' '}
        <code>outils/fond-carte/fabriquer.sh</code>, à refaire tous les trois mois environ ou quand des rues manquent.
      </p>
      {!etat && <p className="discret">Vérification…</p>}
      {etat && !etat.disponible && <p className="erreur">Fond indisponible : {etat.erreur ?? 'fonction reseau-tuiles injoignable'}.</p>}
      {etat?.disponible && !etat.existe && <p className="info">Aucun fond déposé : les tablettes gardent le fond en ligne (fond uni sans réseau).</p>}
      {etat?.existe && (
        <p className="info" role="status">
          Déposé{etat.modifieLe ? ` le ${dateHeure(etat.modifieLe)}` : ''}{etat.octets ? ` · ${enMo(etat.octets)}` : ''}
        </p>
      )}
      <div className="actions">
        <input ref={champ} type="file" accept=".pmtiles" disabled={occupe || !etat?.disponible} onChange={(e) => setFichier(e.target.files?.[0] ?? null)} />
        <button className="primaire" disabled={!fichier || occupe || !etat?.disponible} onClick={deposer}>
          {occupe ? 'Envoi…' : etat?.existe ? 'Remplacer le fond' : 'Déposer le fond'}
        </button>
      </div>
      {message && <p className="discret" role="status">{message}</p>}
      {erreur && <p className="erreur">{erreur}</p>}
    </section>
  );
}
