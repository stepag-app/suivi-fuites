// Widget d'indicateur (style ERP) : libellé, chiffre, commentaire et mini-courbe.
type Ton = 'normal' | 'negatif' | 'critique';

const COULEURS: Record<Ton, string> = { normal: 'var(--principal)', negatif: 'var(--st-negatif)', critique: 'var(--st-critique)' };

export function MiniCourbe({ serie, ton = 'normal', titre }: { serie: number[]; ton?: Ton; titre?: string }) {
  if (serie.length < 2) return null;
  const l = 100;
  const h = 40;
  const max = Math.max(...serie);
  const min = Math.min(...serie);
  const pts = serie.map((v, i) => [(i * l) / (serie.length - 1), h - 4 - ((v - min) / (max - min || 1)) * (h - 10)]);
  const trace = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const [dx, dy] = pts[pts.length - 1];
  const c = COULEURS[ton];
  return (
    <svg viewBox={`0 0 ${l} ${h}`} preserveAspectRatio="none" role="img" aria-label={titre ?? `Évolution : ${serie.join(', ')}`}>
      <path d={`${trace} L${l} ${h} L0 ${h} Z`} fill={c} fillOpacity={0.12} />
      <path d={trace} fill="none" stroke={c} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <circle cx={dx} cy={dy} r={2.4} fill={c} />
    </svg>
  );
}

export function Indicateur({
  libelle, valeur, unite, commentaire, serie, ton = 'normal', titreCourbe,
}: {
  libelle: string; valeur: number | null; unite?: string; commentaire: string; serie?: number[]; ton?: Ton; titreCourbe?: string;
}) {
  return (
    <div className="indicateur">
      <span className="indicateur-libelle">{libelle}</span>
      <span className={`indicateur-valeur ${ton !== 'normal' && valeur ? ton : ''}`}>
        {valeur == null ? '—' : valeur.toLocaleString('fr-FR')}
        {valeur != null && unite && <small>{unite}</small>}
      </span>
      <span className="indicateur-commentaire">{commentaire}</span>
      {serie && <MiniCourbe serie={serie} ton={ton} titre={titreCourbe} />}
    </div>
  );
}
