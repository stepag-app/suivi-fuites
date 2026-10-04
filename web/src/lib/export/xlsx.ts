// Export Excel (write-excel-file, chargé à la demande) : un onglet par tableau,
// en-tête du marché fusionné, ligne de titres figée, formats de nombres et de dates.
import { etendueLibelle, parcourir, decimalesPour, type DocumentExport, type SectionDoc } from './modele';

type Cellule = Record<string, unknown> | null;

const BORDURE = { borderStyle: 'thin', borderColor: '#AFBAC4' };

// Excel n'a pas de fuseau : on écrit l'heure de Casablanca telle qu'on la lit.
function heureMurale(d: Date): Date {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute));
}

const formatNombre = (dec: number) => (dec > 0 ? `#,##0.${'0'.repeat(dec)}` : '#,##0');

function feuille(d: DocumentExport, section: SectionDoc, premiere: boolean) {
  const n = section.colonnes.length;
  const lignes: Cellule[][] = [];
  const pleine = (valeur: string, style: Record<string, unknown> = {}) => {
    const l: Cellule[] = [{ value: valeur, type: String, columnSpan: n, wrap: true, ...style }];
    for (let i = 1; i < n; i++) l.push(null);
    lignes.push(l);
  };

  if (d.filigrane) pleine(`${d.filigrane} : document provisoire, non définitif`, { fontWeight: 'bold', textColor: '#B3261E' });
  d.entete.titulaire.forEach((t, i) => pleine(t, i === 0 ? { fontWeight: 'bold', fontSize: 12 } : { textColor: '#5B6B77' }));
  if (d.entete.titulaireAr) pleine(d.entete.titulaireAr, { fontWeight: 'bold', align: 'left' });
  d.entete.client.forEach((t, i) => pleine(t, i === 0 ? { fontWeight: 'bold', fontSize: 12 } : { textColor: '#5B6B77' }));
  if (d.entete.clientAr) pleine(d.entete.clientAr, { fontWeight: 'bold', align: 'left' });
  lignes.push([]);
  pleine(d.entete.titre, { fontWeight: 'bold', fontSize: 14, align: 'center', height: 24 });
  d.entete.infos.forEach((t) => pleine(t));
  if (section.titre) {
    lignes.push([]);
    pleine(section.titre, { fontWeight: 'bold', fontSize: 12 });
  }
  lignes.push([]);

  const ligneTitres = lignes.length;
  lignes.push(section.colonnes.map((c) => ({
    value: c.titre, type: String, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: '#0B5D8A',
    align: 'center', alignVertical: 'center', wrap: true, ...BORDURE,
  })));

  for (const { ligne, indexDonnees } of parcourir(section)) {
    if (ligne.type === 'groupe') {
      pleine(ligne.libelle ?? '', { fontWeight: 'bold', backgroundColor: '#E6EEF4', ...BORDURE });
      continue;
    }
    const total = ligne.type !== 'donnees';
    const k = total && ligne.libelle ? etendueLibelle(ligne) : 0;
    lignes.push(section.colonnes.map((c, i) => {
      const v = ligne.cellules[i];
      const style = { ...BORDURE, ...(total ? { fontWeight: 'bold', backgroundColor: '#F2F2F2' } : {}) };
      if (k && i === 0) return { value: ligne.libelle, type: String, columnSpan: k, ...style };
      if (k && i < k) return null;
      if (v == null) return { ...style };
      if (v instanceof Date) {
        return { value: heureMurale(v), type: Date, format: c.type === 'dateheure' ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy', align: 'center', ...style };
      }
      if (typeof v === 'number') {
        return { value: v, type: Number, format: formatNombre(decimalesPour(section, ligne, i, indexDonnees)), ...style };
      }
      return { value: v, type: String, wrap: String(v).length > 40, ...style };
    }));
  }

  if (premiere && d.pied) {
    lignes.push([]);
    pleine(d.pied);
  }
  if (premiere && d.visas?.length) {
    lignes.push([]);
    const pas = Math.max(1, Math.floor(n / d.visas.length));
    const l: Cellule[] = Array.from({ length: n }, () => null);
    d.visas.forEach((v, i) => {
      if (i * pas < n) l[i * pas] = { value: v, type: String, fontWeight: 'bold', columnSpan: Math.min(pas, n - i * pas) };
    });
    lignes.push(l);
  }

  return {
    data: lignes,
    sheet: (section.titre ?? 'Export').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31),
    columns: section.colonnes.map((c) => ({ width: Math.min(60, Math.max(8, c.largeur + 2)) })),
    stickyRowsCount: ligneTitres + 1,
    orientation: d.orientation === 'paysage' ? ('landscape' as const) : undefined,
  };
}

export async function genererXlsx(d: DocumentExport): Promise<Blob> {
  const { default: ecrire } = await import('write-excel-file/browser');
  const feuilles = d.sections.map((s, i) => feuille(d, s, i === 0));
  // Noms d'onglets uniques
  const vus = new Map<string, number>();
  feuilles.forEach((f) => {
    const k = vus.get(f.sheet) ?? 0;
    vus.set(f.sheet, k + 1);
    if (k) f.sheet = `${f.sheet.slice(0, 28)} ${k + 1}`;
  });
  return (ecrire as unknown as (f: unknown[], o: unknown) => { toBlob: () => Promise<Blob> })(
    feuilles, { fontFamily: 'Calibri', fontSize: 10 },
  ).toBlob();
}
