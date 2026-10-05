'use client';

import { useMemo } from 'react';
import { Indicateur } from '@/lib/ui/Indicateur';
import { nonReparees, refectionsAFaire } from '@/lib/ui/indicateurs';
import {
  activite, detecteesSur, jourCasa, jourLong, parSemaine, repartitionStatuts, resumeAnomalies, situation,
  type FuiteTdb, type Periode,
} from '@/lib/ui/tableau-de-bord';
import { EvolutionSemaines, RepartitionStatuts, TableauGroupes, pluriel } from './Graphiques';
import styles from './tableau-de-bord.module.css';

export type Anomalie = { fuite_id: string; anomalie: string };

const heures = (h: number | null) => (h == null ? null : Math.round(h));

// Indicateurs, répartition, évolution et tableau par secteur, à partir des fuites déjà lues.
// `anomalies` vaut null quand le compte n'a pas le droit de les voir (le widget est alors absent).
export function Synthese({ fuites, anomalies, maintenant, periode, titrePeriode, seuilH }: {
  fuites: FuiteTdb[]; anomalies: Anomalie[] | null; maintenant: Date; periode: Periode; titrePeriode: string; seuilH: number;
}) {
  const c = useMemo(() => {
    const aujourdHui = jourCasa(maintenant);
    return {
      act: activite(fuites, periode),
      sit: situation(fuites),
      retard: nonReparees(fuites, seuilH, maintenant),
      refections: refectionsAFaire(fuites, maintenant),
      statutsPeriode: repartitionStatuts(detecteesSur(fuites, periode)),
      statutsTout: repartitionStatuts(fuites),
      semaines: parSemaine(fuites, periode.au < aujourdHui ? periode.au : aujourdHui, 12),
      anomalies: anomalies ? resumeAnomalies(anomalies) : null,
    };
  }, [fuites, anomalies, maintenant, periode, seuilH]);
  const { act, sit } = c;

  return (
    <>
      <div className={styles.section}>
        <h2>Activité de la période</h2>
        <span className="discret">{titrePeriode}</span>
      </div>
      <div className="indicateurs">
        <Indicateur libelle="Fuites détectées" valeur={act.detectees}
          commentaire={!act.detectees ? 'aucune sur la période'
            : act.detecteesEnAttente ? `dont ${pluriel(act.detecteesEnAttente, 'encore non réparée', 'encore non réparées')}`
              : 'toutes réparées ou closes'}
          serie={c.semaines.map((s) => s.detectees)} titreCourbe="Fuites détectées par semaine, 12 semaines" />
        <Indicateur libelle="Fuites réparées" valeur={act.reparees}
          commentaire={act.reparees ? `dont ${pluriel(act.repareesAchevees, 'achevée')} (réfection faite ou inutile)` : 'aucune sur la période'}
          serie={c.semaines.map((s) => s.reparees)} titreCourbe="Fuites réparées par semaine, 12 semaines" />
        <Indicateur libelle="Délai moyen détection → réparation" valeur={heures(act.delaiMoyenH)} unite=" h"
          commentaire={act.nbDelais ? `sur ${pluriel(act.nbDelais, 'réparation')} de la période` : 'aucune réparation sur la période'}
          serie={c.semaines.flatMap((s) => (s.delaiMoyenH == null ? [] : [Math.round(s.delaiMoyenH)]))}
          titreCourbe="Délai moyen par semaine de réparation, 12 semaines (heures)" />
        <Indicateur libelle="Délai médian détection → réparation" valeur={heures(act.delaiMedianH)} unite=" h"
          commentaire={act.delaiMaxH != null ? `le plus long : ${Math.round(act.delaiMaxH)} h` : 'aucune réparation sur la période'} />
      </div>

      <div className={styles.section}>
        <h2>Situation à ce jour</h2>
        <span className="discret">quelle que soit la période choisie</span>
      </div>
      <div className="indicateurs">
        <Indicateur libelle={`Non réparées > ${seuilH} h`} valeur={c.retard.valeur} commentaire={c.retard.commentaire}
          serie={c.retard.serie} ton="negatif" titreCourbe="Fuites en retard à chaque fin de journée, 14 derniers jours" />
        <Indicateur libelle="Réfections à faire" valeur={c.refections.valeur} commentaire={c.refections.commentaire}
          serie={c.refections.serie} ton="critique" titreCourbe="Réfections en attente à chaque fin de journée, 14 derniers jours" />
        <Indicateur libelle="Réfections chaussée hors délai" valeur={sit.refectionsHorsDelai} ton="negatif"
          commentaire={sit.refectionsTrottoirAlerte
            ? `et ${pluriel(sit.refectionsTrottoirAlerte, 'réfection trottoir', 'réfections trottoir')} en alerte`
            : 'délai de réfection du marché dépassé'} />
        <Indicateur libelle="Fuites sans photo" valeur={sit.sansPhoto} ton="critique"
          commentaire={`dont ${pluriel(act.detecteesSansPhoto, 'détectée')} sur la période`} />
        {c.anomalies && (
          <Indicateur libelle="Anomalies ouvertes" valeur={c.anomalies.total} ton="critique"
            commentaire={c.anomalies.total
              ? `${pluriel(c.anomalies.fuites, 'fuite')} ; surtout : ${c.anomalies.types[0].libelle.toLowerCase()} (${c.anomalies.types[0].nombre})`
              : 'aucune anomalie détectée'} />
        )}
      </div>

      <div className={styles.deuxColonnes}>
        <section className="carte">
          <h2>Répartition par statut</h2>
          <RepartitionStatuts periode={c.statutsPeriode} tout={c.statutsTout} libellePeriode={titrePeriode} />
        </section>
        <section className="carte">
          <h2>
            Évolution par semaine{' '}
            <span className="sous-titre">12 semaines, jusqu&apos;au {jourLong(c.semaines[c.semaines.length - 1].dimanche)}</span>
          </h2>
          <EvolutionSemaines semaines={c.semaines} />
        </section>
      </div>

      <TableauGroupes fuites={fuites} periode={periode} />
    </>
  );
}
