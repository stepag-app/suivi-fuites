'use client';

import { useCallback, useEffect, useState } from 'react';
import { dateHeure } from '@/lib/format';
import {
  abandonnerFuite, ecouterAttente, listerAttente, synchroniser,
  type FuiteEnAttente, type PhotoEnAttente,
} from '@/lib/hors-ligne';

export default function EnAttente() {
  const [fuites, setFuites] = useState<FuiteEnAttente[]>([]);
  const [photos, setPhotos] = useState<PhotoEnAttente[]>([]);
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    const r = await listerAttente();
    setFuites(r.fuites);
    setPhotos(r.photos);
  }, []);

  useEffect(() => {
    charger();
    return ecouterAttente(charger);
  }, [charger]);

  async function envoyer() {
    setOccupe(true);
    setMessage('');
    try {
      const r = await synchroniser();
      setMessage(
        r.restantes === 0
          ? 'Tout est envoyé.'
          : navigator.onLine
            ? `${r.restantes} envoi(s) restent à traiter (voir les erreurs ci-dessous).`
            : 'Pas de réseau : réessayez plus tard.',
      );
    } catch (e) {
      setMessage(String((e as Error).message ?? e));
    }
    setOccupe(false);
    charger();
  }

  async function abandonner(f: FuiteEnAttente) {
    if (!window.confirm('Supprimer définitivement cette fuite et ses photos de la tablette ? Elle ne sera jamais envoyée.')) return;
    await abandonnerFuite(f.id);
  }

  return (
    <>
      <h1>Envois en attente</h1>
      <p className="discret">
        Ces fuites ont été saisies sur cette tablette et n&apos;ont pas encore été reçues par le serveur.
        Elles partent toutes seules dès que le réseau revient ; ne désinstallez pas l&apos;application avant.
      </p>
      <button className="gros primaire" onClick={envoyer} disabled={occupe || fuites.length + photos.length === 0}>
        {occupe ? 'Envoi en cours…' : 'Envoyer maintenant'}
      </button>
      {message && <p className="info">{message}</p>}

      {fuites.length === 0 && photos.length === 0 && <p className="carte">Rien en attente.</p>}
      {fuites.map((f) => {
        const mesPhotos = photos.filter((p) => p.fuite_id === f.id).length;
        return (
          <section key={f.id} className="carte">
            <strong>
              {(f.ligne.reference_srm as string | null) ||
                (f.ligne.adresse as string | null) ||
                'Fuite sans référence'}
            </strong>
            <p className="discret">
              Saisie le {dateHeure(f.creee_le)} · {mesPhotos} photo{mesPhotos > 1 ? 's' : ''} en attente
            </p>
            {f.erreur && <p className="erreur">Refusée par le serveur : {f.erreur}</p>}
            <button onClick={() => abandonner(f)}>Supprimer de la tablette</button>
          </section>
        );
      })}
    </>
  );
}
