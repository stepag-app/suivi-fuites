'use client';

import { resumer, type Controle } from './controles';
import styles from './controles.module.css';

const MAX_PUCES = 2;

// Contrôles en défaut d'une fuite : une puce par contrôle (couleur de la gravité), le détail en infobulle.
export function BadgeControles({ liste }: { liste?: Controle[] }) {
  const r = resumer(liste);
  if (!r.total || !r.gravite) return <span className={styles.rien} title="Aucun contrôle en défaut">✓</span>;
  const premieres = r.puces.slice(0, MAX_PUCES);
  const reste = r.puces.length - premieres.length;
  return (
    <span className={styles.badges} title={r.titre} aria-label={`${r.total} contrôle${r.total > 1 ? 's' : ''} en défaut : ${r.titre}`}>
      {premieres.map((p) => <span key={p.libelle} className={`${styles.puce} ${styles[p.gravite]}`}>{p.libelle}</span>)}
      {reste > 0 && <span className={`${styles.puce} ${styles[r.gravite]}`}>+{reste}</span>}
    </span>
  );
}
