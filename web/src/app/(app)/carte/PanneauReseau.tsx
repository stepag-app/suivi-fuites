'use client';

// Panneau « Réseau » de la carte, en trois onglets (C4 : le même panneau sur la tablette et dans le panneau web,
// ouvert au besoin par-dessus la carte) : Secteurs (interrupteur mémorisé, coloration, arbre Zone → secteurs avec
// cases, linéaire et % balayé), Légende (traits, nœuds, étiquettes), Balayage (enregistrement, file d'attente).
import { useEffect, useState } from 'react';
import { basculerZone, etatCaseZone, totauxChoisis, tousLesSecteurs } from '@/lib/reseau/arbre';
import { CLE_EQUIPE_MEMORISEE, METHODES, aujourdhuiMaroc, type ChoixBalayage } from '@/lib/reseau/balayage';
import { compterEtats } from '@/lib/reseau/etat';
import { COULEUR_NON_ZONE, TYPES_NOEUD, classeDiametre, entreesLegendeReseau } from '@/lib/reseau/palette';
import { formaterLineaire } from '@/lib/reseau/selection';
import { SANS_SECTEUR, type Coloration } from '@/lib/reseau/types';
import { nombre } from '@/lib/format';
import type { MethodeBalayage } from '@/lib/types';
import styles from './reseau.module.css';
import type { EtatReseau } from './useReseau';

const COLORATIONS: [Coloration, string][] = [['secteur', 'Secteur'], ['balayage', 'Balayage'], ['diametre', 'Diamètre']];

export interface BalayagePanneau {
  peut: boolean;
  actif: boolean;
  basculer: () => void;
  selection: Set<string>;
  lineaire: number;
  vider: () => void;
  enregistrer: (choix: Omit<ChoixBalayage, 'marcheId'>) => Promise<void>;
  occupe: boolean;
  message: string;
  enAttente: number;
  envoyer: () => void;
  peutAnnuler: boolean;
}

export type OngletReseau = 'secteurs' | 'legende' | 'balayage';

interface Props {
  reseau: EtatReseau;
  balayage: BalayagePanneau;
  fermer: () => void;
  onglet: OngletReseau;
  changerOnglet: (o: OngletReseau) => void;
}

export function PanneauReseau({ reseau, balayage, fermer, onglet, changerOnglet }: Props) {
  const { arbre, choisis, setChoisis, contexte, coloration, setColoration, palette, etats, inventaire } = reseau;
  const totaux = totauxChoisis(arbre, choisis);
  const sansSecteur = contexte?.sansSecteur;
  const nbSans = Number(sansSecteur?.nb_troncons) || 0;

  const basculerSecteur = (id: string) => {
    const s = new Set(choisis);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setChoisis(s);
  };

  // Légende : compteurs sur les tronçons affichés (index de l'archive en tuiles, géométries chargées sinon).
  const nombres = new Map<string, number>();
  if (coloration === 'balayage') {
    for (const [k, v] of compterEtats(inventaire.map((t) => t.id), etats)) nombres.set(k, v);
  } else if (coloration === 'diametre') {
    for (const t of inventaire) {
      const cle = String(classeDiametre(t.d));
      nombres.set(cle, (nombres.get(cle) ?? 0) + 1);
    }
  } else {
    for (const z of arbre) nombres.set(z.id, z.secteurs.filter((s) => choisis.has(s.id)).reduce((t, s) => t + s.nbTroncons, 0));
  }
  const zonesAffichees = arbre.filter((z) => z.secteurs.some((s) => choisis.has(s.id)));
  const legende = entreesLegendeReseau(coloration, palette, zonesAffichees, nombres);

  return (
    <aside className={styles.panneau} role="region" aria-label="Réseau d'eau">
      <div className={styles.entete}>
        <h2>Réseau d&apos;eau</h2>
        <button onClick={fermer}>Fermer</button>
      </div>

      <div className={`choix-boutons ${styles.onglets}`} role="tablist" aria-label="Rubriques du panneau">
        {ONGLETS.filter(([o]) => o !== 'balayage' || balayage.peut).map(([o, texte]) => (
          <button key={o} type="button" role="tab" aria-selected={onglet === o} className={onglet === o ? 'actif' : ''} onClick={() => changerOnglet(o)}>
            {texte}{o === 'balayage' && balayage.selection.size > 0 ? ` (${balayage.selection.size})` : ''}
          </button>
        ))}
      </div>

      {onglet === 'secteurs' && <>
      <label className={styles.interrupteur}>
        <input type="checkbox" checked={reseau.actif} onChange={(e) => reseau.setActif(e.target.checked)} />
        Afficher le réseau
      </label>

      {reseau.erreur && <p className="erreur">{reseau.erreur}</p>}
      {reseau.actif && reseau.chargement && <p className={styles.vide}>Chargement des zones et secteurs…</p>}

      {reseau.actif && contexte?.disponible && (
        <>
          <div className={`choix-boutons ${styles.choix}`} role="radiogroup" aria-label="Coloration">
            {COLORATIONS.map(([v, texte]) => (
              <button key={v} type="button" role="radio" aria-checked={coloration === v} className={coloration === v ? 'actif' : ''}
                onClick={() => setColoration(v)}>
                {texte}
              </button>
            ))}
          </div>

          <div className={styles.outils}>
            <button type="button" onClick={() => setChoisis(new Set([...tousLesSecteurs(arbre), ...(nbSans ? [SANS_SECTEUR] : [])]))}>Tout</button>
            <button type="button" onClick={() => setChoisis(new Set())}>Aucun</button>
            <span className={styles.compteur}>
              {totaux.secteurs} secteur{totaux.secteurs > 1 ? 's' : ''} · {formaterLineaire(totaux.lineaire)}
              {totaux.lineaire > 0 ? ` · ${nombre(totaux.pct, 1)} % balayé` : ''}
              {reseau.nbEnChargement > 0 ? ` · ${reseau.tuiles ? 'préparation' : 'chargement'} (${reseau.nbEnChargement})…` : ''}
            </span>
          </div>

          <ul className={styles.arbre}>
            {arbre.map((z) => {
              const etat = etatCaseZone(z, choisis);
              return (
                <li key={z.id} className={styles.zone}>
                  <label className={styles.ligne}>
                    <input type="checkbox" checked={etat === 'tous'} ref={(el) => { if (el) el.indeterminate = etat === 'partiel'; }}
                      onChange={() => setChoisis(basculerZone(z, choisis))} />
                    <span className={styles.pastille} style={{ background: z.couleur }} aria-hidden="true" />
                    <span className={styles.texte}>Zone {z.numero} · {z.libelle}</span>
                    <span className={styles.compteur}>{formaterLineaire(z.lineaire)}</span>
                  </label>
                  <ul className={styles.secteurs}>
                    {z.secteurs.map((s) => (
                      <li key={s.id}>
                        <label className={styles.ligne}>
                          <input type="checkbox" checked={choisis.has(s.id)} onChange={() => basculerSecteur(s.id)} />
                          <span className={styles.trait} style={{ borderTopColor: s.couleur }} aria-hidden="true" />
                          <span className={styles.texte} title={`${s.code} · ${s.libelle}`}>{s.code} · {s.libelle}</span>
                          <span className={styles.jauge} title={`${nombre(s.pct, 1)} % balayé`} aria-hidden="true">
                            <span style={{ width: `${Math.min(100, Math.max(0, s.pct))}%` }} />
                          </span>
                          <span className={styles.compteur}>{formaterLineaire(s.lineaire)}</span>
                        </label>
                      </li>
                    ))}
                    {z.secteurs.length === 0 && <li className={styles.vide}>Aucun secteur</li>}
                  </ul>
                </li>
              );
            })}
            {nbSans > 0 && (
              <li className={styles.zone}>
                <label className={styles.ligne}>
                  <input type="checkbox" checked={choisis.has(SANS_SECTEUR)} onChange={() => basculerSecteur(SANS_SECTEUR)} />
                  <span className={`${styles.trait} ${styles.pointille}`} style={{ borderTopColor: COULEUR_NON_ZONE }} aria-hidden="true" />
                  <span className={styles.texte}>Tronçons non zonés</span>
                  <span className={styles.compteur}>{nombre(nbSans, 0)} · {formaterLineaire(Number(sansSecteur?.lineaire_m) || 0)}</span>
                </label>
              </li>
            )}
            {arbre.length === 0 && <li className={styles.vide}>Aucune zone ni secteur dans ce marché (Paramètres › Secteurs).</li>}
          </ul>

          {reseau.etatTuiles === 'perimees' && (
            <p className={styles.vide}>Affichage par secteur : le réseau a changé depuis la dernière génération des tuiles (Paramètres › Réseau › Tuiles).</p>
          )}
        </>
      )}
      </>}

      {onglet === 'legende' && reseau.actif && contexte?.disponible && (
        <>
          <ul className={styles.legende} aria-label="Légende du réseau">
            {legende.map((e) => (
              <li key={e.libelle}>
                <span className={styles.trait} style={{ borderTopColor: e.fond }} aria-hidden="true" />
                <span className={styles.texte}>{e.libelle}</span>
                <span className={styles.compteur}>{e.nombre > 0 ? nombre(e.nombre, 0) : ''}</span>
              </li>
            ))}
            {nbSans > 0 && choisis.has(SANS_SECTEUR) && coloration === 'secteur' && (
              <li>
                <span className={`${styles.trait} ${styles.pointille}`} style={{ borderTopColor: COULEUR_NON_ZONE }} aria-hidden="true" />
                <span className={styles.texte}>Non zoné</span>
              </li>
            )}
          </ul>
          <ul className={styles.legende} aria-label="Légende des nœuds">
            {TYPES_NOEUD.map((t) => (
              <li key={t.type}>
                <span className={styles.point} style={{ background: t.couleur, width: t.equipement ? 12 : 7, height: t.equipement ? 12 : 7 }} aria-hidden="true" />
                <span className={styles.texte}>{t.libelle}{t.sigle ? ` (${t.sigle})` : ''}</span>
              </li>
            ))}
          </ul>
          <p className={styles.vide}>Nœuds à partir du zoom 15, sigles à partir du zoom 17. Diamètre et matériau écrits le long des conduites de près (« Ø110 PVC », zoom 16).</p>
          {reseau.tuiles && <p className={styles.vide}>Réseau affiché en tuiles vectorielles{reseau.tuiles.infos ? ` (générées le ${new Date(reseau.tuiles.infos.genere_le).toLocaleDateString('fr-FR')})` : ''}.</p>}
        </>
      )}
      {onglet === 'legende' && !(reseau.actif && contexte?.disponible) && <p className={styles.vide}>Affichez le réseau (onglet Secteurs) pour voir sa légende.</p>}

      {onglet === 'balayage' && balayage.peut && reseau.actif && contexte?.disponible && (
        <BlocBalayage balayage={balayage} equipes={reseau.equipes} />
      )}
      {onglet === 'balayage' && balayage.peut && !(reseau.actif && contexte?.disponible) && <p className={styles.vide}>Affichez le réseau (onglet Secteurs) pour balayer.</p>}
    </aside>
  );
}

const ONGLETS: [OngletReseau, string][] = [['secteurs', 'Secteurs'], ['legende', 'Légende'], ['balayage', 'Balayage']];

function BlocBalayage({ balayage, equipes }: { balayage: BalayagePanneau; equipes: EtatReseau['equipes'] }) {
  const [equipe, setEquipe] = useState('');
  const [date, setDate] = useState(() => aujourdhuiMaroc());
  const [methode, setMethode] = useState<MethodeBalayage | ''>('');
  const [observation, setObservation] = useState('');
  const detection = equipes.filter((e) => e.actif && e.type !== 'reparation');

  // Dernière équipe choisie, mémorisée sur l'appareil.
  useEffect(() => {
    try {
      const m = window.localStorage.getItem(CLE_EQUIPE_MEMORISEE);
      if (m && detection.some((e) => e.id === m)) setEquipe(m);
      else if (detection.length === 1) setEquipe(detection[0].id);
    } catch {
      /* stockage indisponible */
    }
    // La liste des équipes ne change qu'au chargement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipes]);

  const choisirEquipe = (id: string) => {
    setEquipe(id);
    try {
      window.localStorage.setItem(CLE_EQUIPE_MEMORISEE, id);
    } catch {
      /* sans conséquence */
    }
  };

  const n = balayage.selection.size;
  return (
    <section className={styles.balayage} aria-label="Mode balayage">
      <button type="button" className={`gros ${styles['bouton-panneau']}`} aria-pressed={balayage.actif} onClick={balayage.basculer}>
        {balayage.actif ? 'Quitter le mode balayage' : 'Mode balayage'}
      </button>
      {balayage.actif && (
        <>
          <p className={styles.vide}>
            Touchez les tronçons balayés (un second appui retire le tronçon), ou tracez un lasso au doigt ; « Prolonger »
            suit la rue jusqu&apos;à la prochaine jonction. Les outils sont dans la barre en haut de la carte.
          </p>
          <p>
            <span className={styles.chiffre}>{nombre(n, 0)}</span> tronçon{n > 1 ? 's' : ''} · <span className={styles.chiffre}>{formaterLineaire(balayage.lineaire)}</span>
          </p>
          <label id="formulaire-balayage">
            Équipe
            <select value={equipe} onChange={(e) => choisirEquipe(e.target.value)}>
              <option value="">— sans équipe —</option>
              {detection.map((e) => <option key={e.id} value={e.id}>{e.libelle}</option>)}
            </select>
          </label>
          <label>
            Date du balayage
            <input type="date" value={date} max={aujourdhuiMaroc()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Méthode (facultative)
            <select value={methode} onChange={(e) => setMethode(e.target.value as MethodeBalayage | '')}>
              <option value="">—</option>
              {METHODES.map((m) => <option key={m.valeur} value={m.valeur}>{m.libelle}</option>)}
            </select>
          </label>
          <label>
            Observation (facultative)
            <input value={observation} maxLength={300} onChange={(e) => setObservation(e.target.value)} />
          </label>
          {balayage.message && <p className={balayage.message.startsWith('Erreur') ? 'erreur' : 'info'} role="status">{balayage.message}</p>}
          <div className="actions">
            <button className="primaire gros" disabled={n === 0 || balayage.occupe || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
              onClick={() => balayage.enregistrer({ equipeId: equipe || null, dateBalayage: date, methode: methode || null, observation: observation || null })}>
              {balayage.occupe ? 'Enregistrement…' : `Enregistrer ${n > 0 ? `(${n})` : ''}`}
            </button>
            <button type="button" disabled={n === 0 || balayage.occupe} onClick={balayage.vider}>Vider la sélection</button>
          </div>
        </>
      )}
      {balayage.enAttente > 0 && (
        <p className={styles.attente} role="status">
          {balayage.enAttente} balayage{balayage.enAttente > 1 ? 's' : ''} à envoyer.{' '}
          <button type="button" className="petit" onClick={balayage.envoyer}>Envoyer maintenant</button>
        </p>
      )}
      {balayage.peutAnnuler && balayage.actif && (
        <p className={styles.vide}>Pour annuler un balayage : quittez le mode balayage, touchez le tronçon puis « Annuler le balayage ».</p>
      )}
    </section>
  );
}
