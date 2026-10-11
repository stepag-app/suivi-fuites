// Heure légale du Maroc, même règle que private.heure_maroc dans la base : UTC+0 depuis le 2026-09-20 à 01:00 UTC
// (fin de l'heure GMT+1, sans heure d'été ni changement du ramadan), Africa/Casablanca avant.
// La base des fuseaux des navigateurs et de Node peut retarder d'un changement d'heure (Chrome 152 et Node 24 croyaient
// encore le Maroc à UTC+1 en octobre 2026) : seul endroit du panneau où le fuseau est écrit. Si le Maroc rechange
// d'heure, modifier BASCULE_UTC0 ici et dans la base.

export const BASCULE_UTC0 = Date.UTC(2026, 8, 20, 1);

type Instant = Date | string | number;
const ms = (v: Instant) => (v instanceof Date ? v.getTime() : new Date(v).getTime());

/** Fuseau à donner à Intl pour lire cet instant à l'heure du Maroc. */
export const fuseauMaroc = (v: Instant) => (ms(v) >= BASCULE_UTC0 ? 'UTC' : 'Africa/Casablanca');

const CASABLANCA = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

/** Décalage du Maroc sur UTC à cet instant, en millisecondes. */
function decalage(t: number): number {
  if (t >= BASCULE_UTC0 || Number.isNaN(t)) return 0;
  const p = Object.fromEntries(CASABLANCA.formatToParts(t).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}

/** Heure du Maroc d'un instant, rendue comme une date dont les champs UTC sont l'heure affichée au Maroc. */
export const heureMurale = (v: Instant) => {
  const t = ms(v);
  return new Date(t + decalage(t));
};

/**
 * Instant d'une heure du Maroc donnée en champs UTC (inverse de heureMurale, comme private.instant_maroc). Comme
 * PostgreSQL : heure affichée deux fois (passage à UTC+0) → la seconde ; heure sautée → lue à UTC+0.
 */
export function instantMaroc(murale: Date | number): Date {
  const m = typeof murale === 'number' ? murale : murale.getTime();
  if (m >= BASCULE_UTC0) return new Date(m);
  return new Date(decalage(m) === 0 || decalage(m - 3_600_000) !== 3_600_000 ? m : m - 3_600_000);
}

/** Jour du Maroc d'un instant (AAAA-MM-JJ), comme private.jour_maroc. */
export const jourMaroc = (v: Instant) => heureMurale(v).toISOString().slice(0, 10);

const formats = new Map<string, Intl.DateTimeFormat>();

/** Formatage Intl à l'heure du Maroc (options sans timeZone). */
export function formatMaroc(v: Instant, locale: string, options: Intl.DateTimeFormatOptions = {}): string {
  const d = v instanceof Date ? v : new Date(v);
  const cle = `${locale}|${fuseauMaroc(d)}|${JSON.stringify(options)}`;
  let f = formats.get(cle);
  if (!f) formats.set(cle, (f = new Intl.DateTimeFormat(locale, { ...options, timeZone: fuseauMaroc(d) })));
  return f.format(d);
}

/** JJ/MM/AAAA à l'heure du Maroc. */
export const dateMaroc = (v: Instant) => formatMaroc(v, 'fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** JJ/MM/AAAA HH:MM à l'heure du Maroc. */
export const dateHeureMaroc = (v: Instant) =>
  formatMaroc(v, 'fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
