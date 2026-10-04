'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { OUVRAGES, STATUTS, dateHeure, formaterReference, libellesMarche, messageErreur, motifMasque } from '@/lib/format';
import { preparerPhoto } from '@/lib/photo';
import { useSession } from '@/lib/session';
import { lireCache, mettreEnCache, mettreFuiteEnAttente, synchroniser, type PhotoEnAttente } from '@/lib/hors-ligne';
import { getSupabase } from '@/lib/supabase';
import type { Secteur, StatutFuite } from '@/lib/types';

interface Position { latitude: number; longitude: number; precision: number }
interface Proche {
  id: string; numero: number; reference_srm: string | null; statut: StatutFuite;
  date_detection: string; distance_m: number | null; meme_reference: boolean;
}

export default function NouvelleFuite() {
  const { marche, peut } = useSession();
  const libelles = libellesMarche(marche);
  const router = useRouter();
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [secteurId, setSecteurId] = useState('');
  const [reference, setReference] = useState('');
  const [visibilite, setVisibilite] = useState<'' | 'visible' | 'invisible'>('');
  const [ouvrage, setOuvrage] = useState('');
  const [adresse, setAdresse] = useState('');
  const [observation, setObservation] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [gpsMessage, setGpsMessage] = useState('Recherche de la position…');
  const [photos, setPhotos] = useState<File[]>([]);
  const [proches, setProches] = useState<Proche[]>([]);
  const [lierA, setLierA] = useState('');
  const [envoi, setEnvoi] = useState('');
  const [erreur, setErreur] = useState('');
  const selecteurPhoto = useRef<HTMLInputElement>(null);

  const marcheId = marche?.id;

  useEffect(() => {
    if (!marcheId) return;
    getSupabase()
      .from('secteurs')
      .select('id, zone_id, code, libelle')
      .eq('marche_id', marcheId)
      .eq('actif', true)
      .order('libelle')
      .then(async ({ data, error }) => {
        const cle = `secteurs:${marcheId}`;
        if (!error && data) {
          setSecteurs(data as Secteur[]);
          mettreEnCache(cle, data);
        } else {
          // Sans réseau : dernière liste connue.
          setSecteurs((await lireCache<Secteur[]>(cle)) ?? []);
        }
      });
  }, [marcheId]);

  const localiser = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsMessage('Position indisponible sur cet appareil.');
      return;
    }
    setGpsMessage('Recherche de la position…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ latitude: p.coords.latitude, longitude: p.coords.longitude, precision: p.coords.accuracy });
        setGpsMessage('');
      },
      (e) =>
        setGpsMessage(
          e.code === e.PERMISSION_DENIED
            ? 'Position refusée : autorisez la localisation pour ce site dans le navigateur.'
            : 'Position introuvable. Sortez à l\'air libre et réessayez.',
        ),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    localiser();
  }, [localiser]);

  // Re-détection : fuites déjà signalées dans le rayon du marché, ou de même référence.
  useEffect(() => {
    if (!marcheId || (!position && !reference.trim())) {
      setProches([]);
      return;
    }
    const delai = setTimeout(async () => {
      const { data } = await getSupabase().rpc('rechercher_fuites_proches', {
        p_marche: marcheId,
        p_latitude: position?.latitude ?? null,
        p_longitude: position?.longitude ?? null,
        p_reference: reference.trim() || null,
      });
      setProches((data as Proche[] | null) ?? []);
    }, 500);
    return () => clearTimeout(delai);
  }, [marcheId, position, reference]);

  function ajouterPhotos(fichiers: FileList | null) {
    // Copie immédiate : la liste du navigateur est vidée par la remise à zéro ci-dessous,
    // et React exécute la mise à jour de l'état plus tard.
    const nouvelles = fichiers ? Array.from(fichiers) : [];
    if (nouvelles.length) setPhotos((p) => [...p, ...nouvelles]);
    if (selecteurPhoto.current) selecteurPhoto.current.value = '';
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!marcheId) return;
    setErreur('');
    if (!position && !reference.trim() && !adresse.trim()) {
      setErreur(`Indiquez au moins la position GPS, la ${libelles.reference.toLowerCase()} ou l'adresse.`);
      return;
    }
    if (photos.length === 0 && !window.confirm('Aucune photo n\'est jointe. Enregistrer quand même ?')) return;

    // La fuite est d'abord gardée sur la tablette (photos comprises), puis envoyée : sans réseau
    // ou en cas de coupure, rien n'est perdu et l'envoi reprend tout seul.
    const id = crypto.randomUUID();
    try {
      setEnvoi('Préparation des photos…');
      const pos = position ? `SRID=4326;POINT(${position.longitude} ${position.latitude})` : null;
      const secteur = secteurs.find((s) => s.id === secteurId);
      const preparees: PhotoEnAttente[] = [];
      for (const fichier of photos) {
        const prete = await preparerPhoto(fichier);
        preparees.push({
          id: crypto.randomUUID(), fuite_id: id, marche_id: marcheId, blob: prete.blob,
          largeur: prete.largeur, hauteur: prete.hauteur, position: pos, prise_le: new Date().toISOString(),
        });
      }
      await mettreFuiteEnAttente(
        {
          id,
          marche_id: marcheId,
          ligne: {
            reference_srm: reference.trim() || null,
            secteur_id: secteur?.id ?? null,
            zone_id: secteur?.zone_id ?? null,
            visibilite: visibilite || null,
            ouvrage: ouvrage || null,
            adresse: adresse.trim() || null,
            observation: observation.trim() || null,
            position: pos,
            precision_gps_m: position ? Math.round(position.precision) : null,
            fuite_liee_id: lierA || null,
            source_saisie: 'tablette',
          },
        },
        preparees,
      );
      setEnvoi(navigator.onLine ? 'Envoi…' : 'Enregistrement sur la tablette…');
      const { restantes } = await synchroniser();
      router.replace(restantes === 0 ? `/fuites/${id}` : '/en-attente');
    } catch (err) {
      setErreur(messageErreur(err));
      setEnvoi('');
    }
  }

  if (!peut('fuites', 'creer')) {
    return <p className="carte">Votre compte ne peut pas signaler de fuite.</p>;
  }

  return (
    <form onSubmit={enregistrer} className="formulaire">
      <h1>Nouvelle fuite</h1>

      <section className="carte">
        <h2>Position</h2>
        {position ? (
          <p>
            {position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}{' '}
            <span className={position.precision > 30 ? 'alerte' : 'discret'}>(± {Math.round(position.precision)} m)</span>
          </p>
        ) : (
          <p className="discret">{gpsMessage}</p>
        )}
        <button type="button" onClick={localiser}>Actualiser la position</button>
      </section>

      {proches.length > 0 && (
        <section className="carte attention">
          <h2>Fuite déjà signalée ici ?</h2>
          <ul className="simple">
            {proches.map((p) => (
              <li key={p.id}>
                <Link href={`/fuites/${p.id}`}>N° {p.numero}</Link> · {STATUTS[p.statut].libelle} ·{' '}
                {dateHeure(p.date_detection)}
                {p.meme_reference ? ' · même référence' : ''}
                {p.distance_m != null ? ` · à ${Math.round(p.distance_m)} m` : ''}
              </li>
            ))}
          </ul>
          <label>
            Si c&apos;est la même fuite (re-détection), la lier à :
            <select value={lierA} onChange={(e) => setLierA(e.target.value)}>
              <option value="">Nouvelle fuite (ne pas lier)</option>
              {proches.map((p) => (
                <option key={p.id} value={p.id}>N° {p.numero}</option>
              ))}
            </select>
          </label>
        </section>
      )}

      <section className="carte">
        <label>
          {libelles.reference}
          {libelles.masque ? (
            <input
              value={reference}
              onChange={(e) => setReference(formaterReference(e.target.value, libelles.masque))}
              placeholder={libelles.masque.replace(/9/g, '0')}
              inputMode="numeric"
              maxLength={libelles.masque.length}
              pattern={motifMasque(libelles.masque)}
              title={`Format ${libelles.masque.replace(/9/g, '0')} : tapez les chiffres, les séparateurs se placent seuls`}
            />
          ) : (
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          )}
        </label>
        <label>
          Secteur
          <select value={secteurId} onChange={(e) => setSecteurId(e.target.value)}>
            <option value="">— Choisir —</option>
            {secteurs.map((s) => (
              <option key={s.id} value={s.id}>{s.libelle}</option>
            ))}
          </select>
        </label>
        <label>
          Adresse / repère
          <input value={adresse} onChange={(e) => setAdresse(e.target.value)} />
        </label>
        <div className="deux">
          <label>
            Visibilité
            <select value={visibilite} onChange={(e) => setVisibilite(e.target.value as typeof visibilite)}>
              <option value="">—</option>
              <option value="visible">Visible</option>
              <option value="invisible">Invisible</option>
            </select>
          </label>
          <label>
            Ouvrage
            <select value={ouvrage} onChange={(e) => setOuvrage(e.target.value)}>
              <option value="">—</option>
              {Object.entries(OUVRAGES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Observation
          <textarea value={observation} onChange={(e) => setObservation(e.target.value)} rows={2} />
        </label>
      </section>

      {peut('photos', 'creer') && (
        <section className="carte">
          <h2>Photos ({photos.length})</h2>
          <input
            ref={selecteurPhoto}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={(e) => ajouterPhotos(e.target.files)}
          />
          <button type="button" className="gros" onClick={() => selecteurPhoto.current?.click()}>
            Prendre une photo
          </button>
          <div className="vignettes">
            {photos.map((f, i) => (
              <div key={i} className="vignette">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(f)} alt={`Photo ${i + 1}`} />
                <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>Retirer</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {erreur && <p className="erreur">{erreur}</p>}
      <button className="gros primaire" disabled={!!envoi}>
        {envoi || 'Enregistrer la fuite'}
      </button>
    </form>
  );
}
