// Aiguillage par format. Chaque bibliothèque n'est téléchargée qu'au moment de
// l'export qui en a besoin (aucun poids ajouté à l'ouverture des pages).
import { decimalesPour, nomFichierSur, parcourir, telecharger, texteDate, type DocumentExport } from './modele';

export type FormatExport = 'xlsx' | 'pdf' | 'docx' | 'csv';

export const FORMATS: Record<FormatExport, string> = {
  xlsx: 'Excel (.xlsx)',
  pdf: 'PDF',
  docx: 'Word (.docx)',
  csv: 'CSV',
};

function genererCsv(d: DocumentExport): Blob {
  const echapper = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lignes: string[][] = [];
  if (d.filigrane) lignes.push([`${d.filigrane} : document provisoire, non définitif`]);
  lignes.push([d.entete.titre], ...d.entete.infos.map((t) => [t]), []);
  d.sections.forEach((s) => {
    if (s.titre) lignes.push([s.titre]);
    lignes.push(s.colonnes.map((c) => c.titre));
    for (const { ligne, indexDonnees } of parcourir(s)) {
      if (ligne.type === 'groupe') {
        lignes.push([ligne.libelle ?? '']);
        continue;
      }
      const cellules = ligne.cellules.map((v, i) => {
        if (v == null) return '';
        if (v instanceof Date) {
          return texteDate(v, s.colonnes[i].type === 'dateheure');
        }
        // Nombre lisible par Excel en français : virgule décimale, pas de séparateur de milliers
        if (typeof v === 'number') return v.toFixed(decimalesPour(s, ligne, i, indexDonnees)).replace('.', ',');
        return v;
      });
      if (ligne.type !== 'donnees' && ligne.libelle) cellules[0] = ligne.libelle;
      lignes.push(cellules);
    }
    lignes.push([]);
  });
  const contenu = '\uFEFF' + lignes.map((l) => l.map(echapper).join(';')).join('\r\n');
  return new Blob([contenu], { type: 'text/csv;charset=utf-8' });
}

export async function exporter(d: DocumentExport, format: FormatExport): Promise<void> {
  let blob: Blob;
  if (format === 'xlsx') blob = await (await import('./xlsx')).genererXlsx(d);
  else if (format === 'pdf') blob = await (await import('./pdf')).genererPdf(d);
  else if (format === 'docx') blob = await (await import('./docx')).genererDocx(d);
  else blob = genererCsv(d);
  const date = d.genereLe.toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' });
  telecharger(blob, `${nomFichierSur(d.nomFichier)}-${date}.${format}`);
}
