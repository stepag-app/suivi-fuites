'use client';

// Paramètres > Réseau (administrateur ou « paramètres / modifier ») : tableau des secteurs depuis
// v_lineaire_secteurs (tronçons, linéaire, % balayé, linéaire du contrat, écart), sous-total par zone
// (le CPS ne fixe le linéaire du contrat que par zone), ligne « Non zonés »,
// carte de zonage plein écran, import GeoJSON (administrateur), tuiles vectorielles du réseau (X5).
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nombre } from '@/lib/format';
import { construireArbre } from '@/lib/reseau/arbre';
import { chargerContexteReseau, messageReseau, viderCacheReseau, type ContexteReseau } from '@/lib/reseau/donnees';
import { paletteSecteurs } from '@/lib/reseau/palette';
import { formaterLineaire } from '@/lib/reseau/selection';
import { BlocTuilesReseau } from './BlocTuilesReseau';
import { OngletReseauImport } from './OngletReseauImport';
import styles from './Reseau.module.css';

// La carte de zonage (MapLibre) n'est chargée qu'à l'ouverture.
const OngletReseauZonage = dynamic(() => import('./OngletReseauZonage').then((m) => m.OngletReseauZonage), {
  ssr: false,
  loading: () => <p className="carte discret">Chargement de la carte…</p>,
});

type Vue = 'secteurs' | 'import';

export function OngletReseau({ marcheId, peutImporter }: { marcheId: string; peutImporter: boolean }) {
  const [contexte, setContexte] = useState<ContexteReseau | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [vue, setVue] = useState<Vue>('secteurs');
  const [zonageOuvert, setZonageOuvert] = useState(false);

  const charger = useCallback(async () => {
    try {
      setContexte(await chargerContexteReseau(marcheId));
      setErreur('');
    } catch (e) {
      setErreur(messageReseau(e));
    } finally {
      setChargement(false);
    }
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const palette = useMemo(() => paletteSecteurs(contexte?.zones ?? [], contexte?.secteurs ?? []), [contexte]);
  const arbre = useMemo(() => (contexte ? construireArbre(contexte.zones, contexte.secteurs, contexte.lignes, palette) : []), [contexte, palette]);
  const lignes = useMemo(() => new Map((contexte?.lignes ?? []).map((l) => [l.secteur_id, l])), [contexte]);
  const totalTroncons = arbre.reduce((t, z) => t + z.nbTroncons, 0) + (Number(contexte?.sansSecteur?.nb_troncons) || 0);
  const totalLineaire = arbre.reduce((t, z) => t + z.lineaire, 0) + (Number(contexte?.sansSecteur?.lineaire_m) || 0);
  const contratZones = useMemo(() => new Map((contexte?.zones ?? []).map((z) => [z.id, z.lineaire_m != null ? Number(z.lineaire_m) : null])), [contexte]);
  // Le contrat de la zone prime ; à défaut, somme des secteurs renseignés.
  const contratZone = (z: { id: string; secteurs: { id: string }[] }) => {
    const c = contratZones.get(z.id);
    if (c != null && c > 0) return c;
    const somme = z.secteurs.reduce((t, s) => t + (Number(lignes.get(s.id)?.lineaire_contrat_m) || 0), 0);
    return somme > 0 ? somme : null;
  };
  const totalContrat = arbre.reduce((t, z) => t + (contratZone(z) ?? 0), 0);
  const nbSans = Number(contexte?.sansSecteur?.nb_troncons) || 0;

  const ecart = (reel: number, contrat: number | null) => {
    if (contrat == null || contrat <= 0) return <span className="discret">—</span>;
    const d = reel - contrat;
    const pct = (d / contrat) * 100;
    return (
      <span className={d < 0 ? styles['ecart-negatif'] : styles['ecart-positif']} title="Linéaire du plan moins linéaire du contrat">
        {d > 0 ? '+' : ''}{formaterLineaire(d)} ({pct > 0 ? '+' : ''}{nombre(pct, 1)} %)
      </span>
    );
  };

  return (
    <>
      {erreur && <p className="erreur">{erreur}</p>}
      <section className="carte">
        <div className="barre">
          <h2>Plan du réseau</h2>
          <div className="actions en-tete">
            <button onClick={charger} disabled={chargement}>Actualiser</button>
            <button onClick={async () => { await viderCacheReseau(); await charger(); }} disabled={chargement} title="Oublie les géométries gardées sur cet appareil">
              Vider le cache local
            </button>
          </div>
        </div>
        <p className="discret">
          {contexte?.disponible === false
            ? 'La base de données n\'a pas encore le plan du réseau (migration du lot S2 à déployer).'
            : `${nombre(totalTroncons, 0)} tronçon(s), ${formaterLineaire(totalLineaire)} de réseau${totalContrat > 0 ? ` pour ${formaterLineaire(totalContrat)} au contrat` : ''}${nbSans > 0 ? ` ; ${nombre(nbSans, 0)} tronçon(s) non zoné(s)` : ''}.`}
          {' '}Chaque tronçon appartient à un secteur, donc à une zone : corrigez le zonage sur la carte (sélection par clic,
          rectangle ou lasso, comme un calque AutoCAD).
        </p>
        <div className={styles.etapes} role="group" aria-label="Vues">
          <button type="button" aria-pressed={vue === 'secteurs'} onClick={() => setVue('secteurs')}>Secteurs et linéaires</button>
          {peutImporter && <button type="button" aria-pressed={vue === 'import'} onClick={() => setVue('import')}>Importer le GeoJSON</button>}
          <button type="button" className="primaire" onClick={() => setZonageOuvert(true)} disabled={!contexte?.disponible || chargement}>
            Ouvrir la carte de zonage
          </button>
        </div>
        {chargement && <p className="discret">Chargement…</p>}
      </section>

      {!chargement && contexte?.disponible && <BlocTuilesReseau marcheId={marcheId} contexte={contexte} />}

      {!chargement && vue === 'secteurs' && contexte?.disponible && (
        <section className="carte">
          <div className="defilement">
            <table>
              <thead>
                <tr>
                  <th>Zone</th><th>Secteur</th><th>Balayage</th>
                  <th className="num">Tronçons</th><th className="num">Linéaire du plan</th><th className="num">Balayé</th>
                  <th className="num">Linéaire du contrat</th><th className="num">Écart</th><th className="num">Nœuds</th>
                </tr>
              </thead>
              <tbody>
                {arbre.flatMap((z) => [...z.secteurs.map((s, i) => {
                  const l = lignes.get(s.id);
                  const statut = l?.statut_balayage ?? 'a_balayer';
                  return (
                    <tr key={s.id}>
                      <td>{i === 0 ? <><span className={styles.pastille} style={{ background: z.couleur }} aria-hidden="true" />Zone {z.numero} · {z.libelle}</> : ''}</td>
                      <td><span className={styles.pastille} style={{ background: s.couleur }} aria-hidden="true" />{s.code} · {s.libelle}</td>
                      <td>
                        <span className={`badge ${statut === 'balayee' ? 'st-achevee' : statut === 'en_cours' ? 'st-encours' : 'st-sans'}`}>
                          {statut === 'balayee' ? 'Balayé' : statut === 'en_cours' ? 'En cours' : 'À balayer'}
                        </span>
                      </td>
                      <td className="num">{nombre(s.nbTroncons, 0)}</td>
                      <td className="num">{formaterLineaire(s.lineaire)}</td>
                      <td className="num">{s.lineaire > 0 ? `${nombre(s.pct, 1)} %` : '—'}</td>
                      <td className="num">{l?.lineaire_contrat_m != null ? formaterLineaire(Number(l.lineaire_contrat_m)) : '—'}</td>
                      <td className="num">{ecart(s.lineaire, l?.lineaire_contrat_m != null ? Number(l.lineaire_contrat_m) : null)}</td>
                      <td className="num">{nombre(Number(l?.nb_noeuds) || 0, 0)}</td>
                    </tr>
                  );
                }), (
                  <tr key={`${z.id}-total`} className={styles['total-zone']}>
                    <td colSpan={3}>Total zone {z.numero}</td>
                    <td className="num">{nombre(z.nbTroncons, 0)}</td>
                    <td className="num">{formaterLineaire(z.lineaire)}</td>
                    <td className="num">{z.lineaire > 0 ? `${nombre(z.pct, 1)} %` : '—'}</td>
                    <td className="num">{contratZone(z) != null ? formaterLineaire(contratZone(z) ?? 0) : '—'}</td>
                    <td className="num">{ecart(z.lineaire, contratZone(z))}</td>
                    <td className="num">{nombre(z.secteurs.reduce((t, s) => t + (Number(lignes.get(s.id)?.nb_noeuds) || 0), 0), 0)}</td>
                  </tr>
                )])}
                <tr className={nbSans > 0 ? '' : 'discret'}>
                  <td>—</td>
                  <td>Non zonés</td>
                  <td><span className="badge st-sans">{nbSans > 0 ? 'À zoner' : 'Aucun'}</span></td>
                  <td className="num">{nombre(nbSans, 0)}</td>
                  <td className="num">{formaterLineaire(Number(contexte?.sansSecteur?.lineaire_m) || 0)}</td>
                  <td className="num">—</td><td className="num">—</td><td className="num">—</td><td className="num">—</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total du marché</td>
                  <td className="num">{nombre(totalTroncons, 0)}</td>
                  <td className="num">{formaterLineaire(totalLineaire)}</td>
                  <td className="num">{totalLineaire > 0 ? `${nombre((arbre.reduce((t, z) => t + z.lineaireBalaye, 0) / totalLineaire) * 100, 1)} %` : '—'}</td>
                  <td className="num">{totalContrat > 0 ? formaterLineaire(totalContrat) : '—'}</td>
                  <td className="num">{ecart(totalLineaire, totalContrat > 0 ? totalContrat : null)}</td>
                  <td className="num">{nombre((contexte?.lignes ?? []).reduce((t, l) => t + (Number(l.nb_noeuds) || 0), 0), 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {arbre.length === 0 && <p className="discret">Aucune zone ni secteur : créez-les dans l&apos;onglet Secteurs.</p>}
        </section>
      )}

      {!chargement && vue === 'import' && peutImporter && contexte && (
        <OngletReseauImport marcheId={marcheId} secteurs={contexte.secteurs} recharger={charger} />
      )}

      {zonageOuvert && contexte && (
        <OngletReseauZonage
          marcheId={marcheId}
          zones={contexte.zones}
          secteurs={contexte.secteurs}
          palette={palette}
          fermer={() => setZonageOuvert(false)}
          recharger={charger}
        />
      )}
    </>
  );
}
