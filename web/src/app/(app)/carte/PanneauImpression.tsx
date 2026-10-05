'use client';

import { useEffect, useState } from 'react';
import type { FormatPapier, OrientationPapier } from '@/lib/export/carte-pdf';
import { messageErreur } from '@/lib/format';
import type { ChoixImpression } from './impression';
import styles from './impression.module.css';

interface Props {
  ouvert: boolean;
  fermer: () => void;
  titreDefaut: string;
  nombreSurCarte: number;
  nombreListe: number;
  filtres: string;
  imprimer: (choix: ChoixImpression, etape: (texte: string) => void) => Promise<string>;
}

const FORMATS: [FormatPapier, string][] = [['a4', 'A4'], ['a3', 'A3']];
const ORIENTATIONS: [OrientationPapier, string][] = [['paysage', 'Paysage'], ['portrait', 'Portrait']];

function Choix<T extends string>({ libelle, liste, valeur, changer, inactif }: {
  libelle: string; liste: [T, string][]; valeur: T; changer: (v: T) => void; inactif: boolean;
}) {
  return (
    <div className={`choix-boutons ${styles.choix}`} role="radiogroup" aria-label={libelle}>
      {liste.map(([v, texte]) => (
        <button key={v} type="button" role="radio" aria-checked={valeur === v} className={valeur === v ? 'actif' : ''}
          disabled={inactif} onClick={() => changer(v)}>
          {texte}
        </button>
      ))}
    </div>
  );
}

export function PanneauImpression({ ouvert, fermer, titreDefaut, nombreSurCarte, nombreListe, filtres, imprimer }: Props) {
  const [format, setFormat] = useState<FormatPapier>('a4');
  const [orientation, setOrientation] = useState<OrientationPapier>('paysage');
  const [titre, setTitre] = useState(titreDefaut);
  const [titreRetouche, setTitreRetouche] = useState(false);
  const [avecListe, setAvecListe] = useState(false);
  const [etape, setEtape] = useState('');
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');

  // Le titre suit le secteur choisi tant qu'il n'a pas été retouché.
  useEffect(() => {
    if (!titreRetouche) setTitre(titreDefaut);
  }, [titreDefaut, titreRetouche]);

  if (!ouvert) return null;
  const occupe = !!etape;

  async function lancer() {
    setErreur('');
    setInfo('');
    setEtape('Préparation…');
    try {
      setInfo(await imprimer({ format, orientation, titre: titre.trim() || titreDefaut, avecListe }, setEtape));
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setEtape('');
  }

  return (
    <aside className="panneau-export" role="dialog" aria-label="Imprimer la carte">
      <div className="barre">
        <h2>Imprimer la carte</h2>
        <button onClick={fermer} disabled={occupe}>Fermer</button>
      </div>

      <fieldset>
        <legend>Papier</legend>
        <Choix libelle="Format" liste={FORMATS} valeur={format} changer={setFormat} inactif={occupe} />
        <Choix libelle="Orientation" liste={ORIENTATIONS} valeur={orientation} changer={setOrientation} inactif={occupe} />
      </fieldset>

      <label>
        Titre
        <input value={titre} maxLength={120} disabled={occupe}
          onChange={(e) => { setTitre(e.target.value); setTitreRetouche(true); }} />
      </label>
      <label className={`ligne ${styles.case}`}>
        <input type="checkbox" checked={avecListe} disabled={occupe || nombreListe === 0} onChange={(e) => setAvecListe(e.target.checked)} />
        Ajouter la liste des fuites affichées ({nombreListe})
      </label>

      <div className={`discret ${styles.resume}`}>
        <p>{nombreSurCarte} fuite{nombreSurCarte > 1 ? 's' : ''} sur la carte. {filtres}.</p>
        <p>La carte est imprimée comme elle est cadrée à l&apos;écran (zoomez ou déplacez-la avant), en haute définition,
          avec légende, échelle, nord et coordonnées GPS.</p>
      </div>

      {erreur && <p className="erreur">{erreur}</p>}
      {info && <p className="info" role="status">{info}</p>}
      <button className="primaire gros" disabled={occupe} onClick={lancer}>
        {occupe ? etape : 'Télécharger le PDF'}
      </button>
    </aside>
  );
}
