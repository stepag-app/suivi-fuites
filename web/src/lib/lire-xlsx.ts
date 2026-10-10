// Lecture de la première feuille d'un classeur Excel (.xlsx) en tableau de textes, dans le navigateur
// (fflate + DOMParser) : nombres, textes partagés ou en ligne ; dates et heures restent des nombres Excel.
import { unzipSync, strFromU8 } from 'fflate';

const colonne = (ref: string) => {
  const lettres = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  return [...lettres].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
};

export async function lireXlsx(fichier: Blob, maxLignes = 50000): Promise<string[][]> {
  const zip = unzipSync(new Uint8Array(await fichier.arrayBuffer()));
  const xml = (chemin: string) => (zip[chemin] ? new DOMParser().parseFromString(strFromU8(zip[chemin]), 'application/xml') : null);
  const partages = [...(xml('xl/sharedStrings.xml')?.getElementsByTagName('si') ?? [])]
    .map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''));
  const classeur = xml('xl/workbook.xml');
  const liens = xml('xl/_rels/workbook.xml.rels');
  const premiere = classeur?.getElementsByTagName('sheet')[0];
  const rid = premiere?.getAttribute('r:id') ?? premiere?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const cible = [...(liens?.getElementsByTagName('Relationship') ?? [])].find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target');
  const chemin = cible ? `xl/${cible.replace(/^\/?xl\//, '')}` : 'xl/worksheets/sheet1.xml';
  const feuille = xml(chemin) ?? xml('xl/worksheets/sheet1.xml');
  if (!feuille) throw new Error('Classeur illisible : aucune feuille trouvée');
  const tableau: string[][] = [];
  for (const ligne of [...feuille.getElementsByTagName('row')].slice(0, maxLignes)) {
    const cellules: string[] = [];
    for (const c of ligne.getElementsByTagName('c')) {
      const type = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      const texte = type === 's' ? partages[Number(v)] ?? ''
        : type === 'inlineStr' ? [...c.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('')
        : v;
      cellules[colonne(c.getAttribute('r') ?? 'A')] = texte;
    }
    tableau.push(Array.from(cellules, (x) => x ?? ''));
  }
  return tableau;
}
