'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { quantite } from '@/lib/attachements';
import { montant } from '@/lib/format';
import { Indicateur } from '@/lib/ui/Indicateur';
import {
  jourLong, recapAttachements, resumeLots,
  type ArticleTdb, type LigneAttacheeTdb, type LotTdb, type UniteResteTdb,
} from '@/lib/ui/tableau-de-bord';
import { pluriel } from './Graphiques';
import styles from './tableau-de-bord.module.css';

export interface DonneesAttachements {
  lots: LotTdb[];
  articles: ArticleTdb[];
  lignes: LigneAttacheeTdb[];
  unites: UniteResteTdb[];
}

const pct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('fr-FR')} %`);

// Cumul attaché = lots arrêtés (au prix figé à l'arrêt) ; reste à attacher = exécuté − attaché (au prix actuel),
// régularisations comprises. Montants HT au prix du bordereau, sans majoration.
export function BlocAttachements({ donnees, devise }: { donnees: DonneesAttachements; devise: string }) {
  const recap = useMemo(() => recapAttachements(donnees.articles, donnees.lignes, donnees.unites), [donnees]);
  const lots = useMemo(() => resumeLots(donnees.lots), [donnees.lots]);
  const dernier = lots.dernier;

  return (
    <>
      <div className={styles.section}>
        <h2>Attachements</h2>
        <span className="discret">montants HT au prix du bordereau, sans majoration</span>
        <Link href="/attachements">Ouvrir les lots</Link>
        {dernier && <Link href={`/attachements/${dernier.id}`}>Dernier lot arrêté (N° {String(dernier.numero).padStart(2, '0')})</Link>}
      </div>
      <div className="indicateurs">
        <Indicateur libelle="Lots arrêtés" valeur={lots.arretes}
          commentaire={[
            dernier ? `dernier : N° ${String(dernier.numero).padStart(2, '0')}${dernier.date_arret ? ` au ${jourLong(dernier.date_arret)}` : ''}` : 'aucun lot arrêté',
            lots.brouillons ? pluriel(lots.brouillons, 'brouillon') : '',
          ].filter(Boolean).join(' · ')} />
        <Indicateur libelle="Attaché (cumul)" valeur={Math.round(recap.montantAttache)} unite={` ${devise}`}
          commentaire={recap.avancement == null ? 'montant du bordereau inconnu' : `${pct(recap.avancement)} du montant du bordereau`} />
        <Indicateur libelle="Reste à attacher" valeur={Math.round(recap.montantReste)} unite={` ${devise}`}
          ton={recap.montantReste > 0 ? 'critique' : 'normal'}
          commentaire={recap.unitesReste
            ? `${pluriel(recap.unitesReste, 'unité')} sur ${pluriel(recap.fuitesReste, 'fuite')}${recap.unitesEnBrouillon ? `, dont ${recap.unitesEnBrouillon} dans un brouillon` : ''}`
            : 'rien à attacher'} />
        <Indicateur libelle="Montant du bordereau" valeur={recap.montantMarche ? Math.round(recap.montantMarche) : null} unite={` ${devise}`}
          commentaire="quantités du marché × prix actuels" />
      </div>
      <section className="carte">
        <h2>Par article du bordereau</h2>
        {recap.articles.length === 0 ? <p className="discret">Aucun article lisible pour ce marché.</p> : (
          <div className="defilement">
            <table>
              <thead>
                <tr>
                  <th>N°</th><th>Désignation</th><th>Unité</th><th className="num">Qté marché</th>
                  <th className="num">Attaché (cumul)</th><th className="num">Reste à attacher</th>
                  <th className="num">Montant attaché</th><th className="num">Montant restant</th><th>% du marché</th>
                </tr>
              </thead>
              <tbody>
                {recap.articles.map((l) => {
                  const p = l.pourcentage ?? 0;
                  const r = Math.max(0, Math.min(l.pourcentageReste ?? 0, 100 - Math.min(p, 100)));
                  return (
                    <tr key={l.article.id}>
                      <td>{l.article.numero}</td>
                      <td className={styles.designation}><span className="designation">{l.article.designation}</span></td>
                      <td>{l.article.unite}</td>
                      <td className="num">{quantite(l.article.quantite_marche, l.article.unite)}</td>
                      <td className="num">{quantite(l.attachee, l.article.unite)}</td>
                      <td className={`num ${l.reste < 0 ? styles.negatif : ''}`}>{quantite(l.reste, l.article.unite)}</td>
                      <td className="num">{montant(l.montantAttache)}</td>
                      <td className={`num ${l.montantReste < 0 ? styles.negatif : ''}`}>{montant(l.montantReste)}</td>
                      <td>
                        {l.pourcentage == null ? <span className="discret">—</span> : (
                          <span className={styles.avancement}
                            title={`Attaché ${pct(l.pourcentage)}, reste à attacher ${pct(l.pourcentageReste)} de la quantité du marché`}>
                            <span className={styles.jaugeDouble} aria-hidden="true">
                              {p > 0 && <span className={styles.partAttachee} style={{ width: `${Math.min(p, 100)}%` }} />}
                              {r > 0 && <span className={styles.partReste} style={{ width: `${r}%` }} />}
                            </span>
                            <span className={p > 100 ? styles.depasse : ''}>{pct(l.pourcentage)}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6}>Total ({devise} HT)</td>
                  <td className="num">{montant(recap.montantAttache)}</td>
                  <td className="num">{montant(recap.montantReste)}</td>
                  <td>{pct(recap.avancement)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <ul className={styles.legende}>
          <li><span className={`${styles.puce} ${styles.partAttachee}`} aria-hidden="true" />Attaché (lots arrêtés)</li>
          <li><span className={`${styles.puce} ${styles.partReste}`} aria-hidden="true" />Reste à attacher (exécuté, régularisations comprises)</li>
        </ul>
      </section>
    </>
  );
}
