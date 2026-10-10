'use client';

import { useMemo } from 'react';
import {
  LIBELLES_ETAT, RETARD_MINUTES, depuis, libelleEnvoi, resumerEnvois, type EnvoiDolibarr,
} from '@/lib/dolibarr/envoi-auto';
import { dateHeure } from '@/lib/format';
import styles from '../fournitures.module.css';

// Envoi automatique depuis le serveur Dolibarr (X8) : état de la tâche planifiée, dernier envoi, erreurs depuis le dernier
// passage réussi, journal des derniers passages. L'import CSV reste en secours (administrateur, carte suivante).
export function EnvoiAutomatique({ envois, maintenant }: { envois: EnvoiDolibarr[] | null; maintenant: Date }) {
  const resume = useMemo(() => resumerEnvois(envois ?? [], maintenant), [envois, maintenant]);

  if (envois === null) {
    return (
      <section className="carte">
        <h2>Envoi automatique depuis Dolibarr</h2>
        <p className="discret">La base n&apos;a pas encore le journal de l&apos;envoi automatique (migration à déployer). Import CSV ci-dessous.</p>
      </section>
    );
  }

  const { etat, dernierRecu, dernierSucces, erreurs, minutesDepuisContact } = resume;
  return (
    <section className="carte" aria-labelledby="titre-envoi-auto">
      <div className={styles.tete}>
        <h2 id="titre-envoi-auto">Envoi automatique depuis Dolibarr</h2>
        <span className={`${styles.etatEnvoi} ${styles[`etat_${etat}`]}`} role="status">{LIBELLES_ETAT[etat]}</span>
      </div>

      {etat === 'jamais' ? (
        <p className="discret">
          Aucun envoi reçu du serveur Dolibarr. Tant que la tâche planifiée n&apos;y est pas installée, les mouvements arrivent par
          l&apos;import CSV (administrateur).
        </p>
      ) : (
        <dl className={styles.envoi}>
          <dt>Dernier envoi automatique</dt>
          <dd>
            {dernierRecu
              ? <>{dateHeure(dernierRecu.dernier_le)} : {libelleEnvoi(dernierRecu)}{dernierRecu.dernier_dolibarr_id ? ` (jusqu'au mouvement n° ${dernierRecu.dernier_dolibarr_id})` : ''}</>
              : 'aucun mouvement reçu pour l\'instant'}
          </dd>
          <dt>Dernier passage du serveur</dt>
          <dd>
            {dateHeure(resume.dernierContact)} ({depuis(minutesDepuisContact)})
            {dernierSucces?.poste ? ` · ${dernierSucces.poste}` : ''}
            {etat === 'en_retard' && (
              <span className={styles.alerteEnvoi}>
                {' '}Plus de {RETARD_MINUTES} min sans nouvelles (passage prévu toutes les 15 min) : serveur éteint, coupure Internet ou
                tâche planifiée arrêtée. Le rattrapage est automatique au retour.
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
                {e.origine === 'script' ? 'serveur Dolibarr' : 'réception'} : {e.message ?? 'erreur sans message'}
              </li>
            ))}
          </ul>
          <p className="discret">Le serveur réessaie tout seul à chaque passage ; rien n&apos;est perdu tant que Dolibarr garde ses mouvements.</p>
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
                    <td>{e.statut === 'erreur' ? `Erreur (${e.origine === 'script' ? 'serveur Dolibarr' : 'réception'}) : ` : ''}{libelleEnvoi(e)}</td>
                    <td className="num">{e.appels}</td>
                    <td className="num">{e.mouvements}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
