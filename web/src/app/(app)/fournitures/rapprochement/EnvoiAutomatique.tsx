'use client';

import { useMemo, useState } from 'react';
import { messageDolibarr, synchroniserDolibarr } from '@/lib/dolibarr/donnees';
import {
  LIBELLES_ETAT, LIBELLES_ORIGINE, RETARD_MINUTES, depuis, libelleBilan, libelleEnvoi, resumerEnvois, type EnvoiDolibarr,
} from '@/lib/dolibarr/envoi-auto';
import { dateHeure } from '@/lib/format';
import styles from '../fournitures.module.css';

// Synchronisation Dolibarr (X8) : Supabase lit l'API REST de Dolibarr toutes les 15 minutes ; état, dernière lecture avec
// nouveautés, dernier passage, erreurs depuis le dernier passage réussi, journal ; bouton « Synchroniser maintenant »
// (administrateur et responsable) et « Tout relire » (administrateur). L'import CSV reste en secours (carte suivante).
export function EnvoiAutomatique({ envois, maintenant, admin, apresSynchro }: {
  envois: EnvoiDolibarr[] | null;
  maintenant: Date;
  admin: boolean;
  apresSynchro: () => Promise<void>;
}) {
  const resume = useMemo(() => resumerEnvois(envois ?? [], maintenant), [envois, maintenant]);
  const [enCours, setEnCours] = useState<'' | 'normal' | 'tout'>('');
  const [bilan, setBilan] = useState<{ texte: string; ton: 'succes' | 'erreur' | 'info' } | null>(null);

  async function lancer(tout: boolean) {
    setEnCours(tout ? 'tout' : 'normal');
    setBilan(null);
    try {
      const b = await synchroniserDolibarr(tout);
      setBilan({ texte: libelleBilan(b), ton: b.statut === 'erreur' ? 'erreur' : b.statut === 'occupe' ? 'info' : 'succes' });
      await apresSynchro();
    } catch (e) {
      setBilan({ texte: messageDolibarr(e), ton: 'erreur' });
    }
    setEnCours('');
  }

  if (envois === null) {
    return (
      <section className="carte">
        <h2>Synchronisation Dolibarr</h2>
        <p className="discret">La base n&apos;a pas encore le journal de la synchronisation (migration à déployer). Import CSV ci-dessous.</p>
      </section>
    );
  }

  const { etat, dernierRecu, dernierSucces, erreurs, minutesDepuisContact } = resume;
  return (
    <section className="carte" aria-labelledby="titre-envoi-auto">
      <div className={styles.tete}>
        <h2 id="titre-envoi-auto">Synchronisation Dolibarr</h2>
        <div className={styles.synchro}>
          <span className={`${styles.etatEnvoi} ${styles[`etat_${etat}`]}`} role="status">{LIBELLES_ETAT[etat]}</span>
          <button type="button" onClick={() => lancer(false)} disabled={!!enCours}>
            {enCours === 'normal' ? 'Lecture en cours…' : 'Synchroniser maintenant'}
          </button>
        </div>
      </div>

      {bilan && (
        <p className={bilan.ton === 'erreur' ? 'erreur' : `carte ${bilan.ton === 'succes' ? 'succes' : ''}`} role="status">{bilan.texte}</p>
      )}

      {etat === 'jamais' ? (
        <p className="discret">
          Aucune lecture pour l&apos;instant. Supabase lit les mouvements de l&apos;entrepôt dans Dolibarr toutes les 15 minutes, dès
          que les clés de l&apos;API sont posées sur le serveur ; « Synchroniser maintenant » lance une lecture tout de suite. En
          attendant, l&apos;import CSV (administrateur) reste possible.
        </p>
      ) : (
        <dl className={styles.envoi}>
          <dt>Dernière lecture avec nouveautés</dt>
          <dd>
            {dernierRecu
              ? <>{dateHeure(dernierRecu.dernier_le)} : {libelleEnvoi(dernierRecu)}{dernierRecu.dernier_dolibarr_id ? ` (jusqu'au mouvement n° ${dernierRecu.dernier_dolibarr_id})` : ''}</>
              : 'aucun mouvement reçu pour l\'instant'}
          </dd>
          <dt>Dernier passage</dt>
          <dd>
            {dateHeure(resume.dernierContact)} ({depuis(minutesDepuisContact)})
            {dernierSucces?.poste ? ` · ${dernierSucces.poste}` : ''}
            {etat === 'en_retard' && (
              <span className={styles.alerteEnvoi}>
                {' '}Plus de {RETARD_MINUTES} min sans passage (lecture prévue toutes les 15 min) : planification arrêtée ou Supabase en
                pause. Le rattrapage est automatique au retour ; « Synchroniser maintenant » relance tout de suite.
              </span>
            )}
          </dd>
        </dl>
      )}

      {erreurs.length > 0 && (
        <div className={styles.erreursEnvoi}>
          <strong>Erreurs depuis le dernier passage réussi</strong>
          <ul>
            {erreurs.slice(0, 5).map((e) => (
              <li key={e.id}>
                {dateHeure(e.dernier_le)}{e.appels > 1 ? ` (${e.appels} fois depuis le ${dateHeure(e.recu_le)})` : ''} ·{' '}
                {LIBELLES_ORIGINE[e.origine] ?? e.origine} : {e.message ?? 'erreur sans message'}
              </li>
            ))}
          </ul>
          <p className="discret">
            La lecture est retentée toute seule toutes les 15 minutes ; rien n&apos;est perdu tant que Dolibarr garde ses mouvements.
          </p>
        </div>
      )}

      {envois.length > 0 && (
        <details className={styles.journalEnvoi}>
          <summary>Journal des derniers passages ({envois.length})</summary>
          <div className={styles.defilement}>
            <table>
              <thead>
                <tr><th>Dernier passage</th><th>Résultat</th><th className="num">Passages</th><th className="num">Mouvements lus</th></tr>
              </thead>
              <tbody>
                {envois.map((e) => (
                  <tr key={e.id} className={e.statut === 'erreur' ? styles.alerte : ''}>
                    <td>{dateHeure(e.dernier_le)}</td>
                    <td>{e.statut === 'erreur' ? `Erreur (${LIBELLES_ORIGINE[e.origine] ?? e.origine}) : ` : ''}{libelleEnvoi(e)}</td>
                    <td className="num">{e.appels}</td>
                    <td className="num">{e.mouvements}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {admin && (
            <p className="discret">
              <button type="button" className="petit" onClick={() => lancer(true)} disabled={!!enCours}>
                {enCours === 'tout' ? 'Relecture en cours…' : 'Tout relire depuis le début'}
              </button>{' '}
              : relit tout l&apos;historique de l&apos;entrepôt dans Dolibarr (contrôle, ou correction de lignes venues d&apos;un CSV) ;
              rien n&apos;est doublé.
            </p>
          )}
        </details>
      )}
    </section>
  );
}
