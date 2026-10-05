// Export Word (docx, chargé à la demande). Les textes arabes sont de vrais textes
// de droite à gauche ; la police Amiri est embarquée dans le fichier si besoin.
import { chargerFichiersAmiri, contientArabe } from './arabe';
import {
  dimensionsLogo, etendueLibelle, mmEnPixels, octetsDataUrl, parcourir, texteCellule, texteDate,
  type DocumentExport, type LogoEntete, type SectionDoc,
} from './modele';

export async function genererDocx(d: DocumentExport): Promise<Blob> {
  const x = await import('docx');
  const {
    AlignmentType, BorderStyle, CharacterSet, Document, Footer, ImageRun, LineRuleType, Packer, PageNumber, PageOrientation,
    Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
  } = x;

  const avecArabe = [d.entete.titulaireAr, d.entete.clientAr].some(contientArabe)
    || d.sections.some((s) => s.lignes.some((l) => l.cellules.some(contientArabe) || contientArabe(l.libelle)));
  const amiri = avecArabe ? await chargerFichiersAmiri() : null;

  const run = (texte: string, o: { gras?: boolean; taille?: number; couleur?: string } = {}) =>
    new TextRun({
      text: texte,
      bold: o.gras,
      size: o.taille ?? 16,
      color: o.couleur,
      ...(contientArabe(texte) ? { rightToLeft: true, font: { name: 'Amiri', hint: 'cs' } } : { font: 'Arial' }),
    });
  const paragraphe = (texte: string, o: { gras?: boolean; taille?: number; alignement?: 'left' | 'center' | 'right'; couleur?: string; espaceApres?: number } = {}) => {
    const arabe = contientArabe(texte);
    return new Paragraph({
      children: [run(texte, o)],
      alignment: o.alignement === 'center' ? AlignmentType.CENTER : o.alignement === 'right' || (arabe && !o.alignement) ? AlignmentType.RIGHT : AlignmentType.LEFT,
      bidirectional: arabe,
      spacing: { after: o.espaceApres ?? 40 },
    });
  };

  const sansBordure = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const bordures = { top: sansBordure, bottom: sansBordure, left: sansBordure, right: sansBordure };
  const trait = { style: BorderStyle.SINGLE, size: 4, color: 'AFBAC4' };
  const traits = { top: trait, bottom: trait, left: trait, right: trait };

  // En-tête : logo puis titulaire à gauche, logo puis maître d'ouvrage à droite. Les noms
  // commencent à la même hauteur des deux côtés (espace de la hauteur du plus grand logo).
  const twips = (mm: number) => Math.round(mm * 56.69);
  const hauteurLogos = Math.max(0, ...[d.entete.logoTitulaire, d.entete.logoMaitreOuvrage].map((l) => (l ? dimensionsLogo(l).hauteurMm : 0)));
  const paragrapheLogo = (logo: LogoEntete | null | undefined, alignement: 'left' | 'right') => {
    if (!logo) return new Paragraph({ children: [], spacing: { after: 80, line: twips(hauteurLogos), lineRule: LineRuleType.EXACT } });
    const { largeurMm, hauteurMm } = dimensionsLogo(logo);
    return new Paragraph({
      alignment: alignement === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { after: 80 + twips(hauteurLogos - hauteurMm) },
      children: [new ImageRun({
        type: logo.format === 'PNG' ? 'png' : 'jpg',
        data: octetsDataUrl(logo.donnees),
        transformation: { width: mmEnPixels(largeurMm), height: mmEnPixels(hauteurMm) },
      })],
    });
  };
  const colonneEntete = (lignes: string[], ar: string | null | undefined, logo: LogoEntete | null | undefined, alignement: 'left' | 'right') =>
    new TableCell({
      borders: bordures,
      width: { size: 50, type: WidthType.PERCENTAGE },
      children: [
        ...(hauteurLogos ? [paragrapheLogo(logo, alignement)] : []),
        ...lignes.map((t, i) => paragraphe(t, { gras: i === 0, taille: i === 0 ? 21 : 16, alignement, couleur: i === 0 ? undefined : '5B6B77' })),
        ...(ar ? [paragraphe(ar, { gras: true, taille: 22, alignement })] : []),
      ],
    });
  const entete = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...bordures, insideHorizontal: sansBordure, insideVertical: sansBordure },
    rows: [new TableRow({ children: [
      colonneEntete(d.entete.titulaire, d.entete.titulaireAr, d.entete.logoTitulaire, 'left'),
      colonneEntete(d.entete.client, d.entete.clientAr, d.entete.logoMaitreOuvrage, 'right'),
    ] })],
  });

  const tableau = (section: SectionDoc) => {
    const n = section.colonnes.length;
    const totalLargeurs = section.colonnes.reduce((s, c) => s + c.largeur, 0);
    const largeurs = section.colonnes.map((c) => Math.round((c.largeur / totalLargeurs) * 100));
    const cellule = (texte: string, o: { gras?: boolean; fond?: string; blanc?: boolean; alignement?: 'left' | 'center' | 'right'; span?: number; largeur?: number } = {}) =>
      new TableCell({
        borders: traits,
        columnSpan: o.span,
        width: o.largeur ? { size: o.largeur, type: WidthType.PERCENTAGE } : undefined,
        verticalAlign: VerticalAlign.CENTER,
        shading: o.fond ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fond } : undefined,
        margins: { top: 30, bottom: 30, left: 60, right: 60 },
        children: [paragraphe(texte, { gras: o.gras, taille: 15, alignement: o.alignement, couleur: o.blanc ? 'FFFFFF' : undefined, espaceApres: 0 })],
      });
    const lignes = [
      new TableRow({
        tableHeader: true,
        children: section.colonnes.map((c, i) => cellule(c.titre, { gras: true, fond: '0B5D8A', blanc: true, alignement: 'center', largeur: largeurs[i] })),
      }),
    ];
    for (const { ligne, indexDonnees } of parcourir(section)) {
      if (ligne.type === 'groupe') {
        lignes.push(new TableRow({ children: [cellule(ligne.libelle ?? '', { gras: true, fond: 'E6EEF4', span: n })] }));
        continue;
      }
      const total = ligne.type !== 'donnees';
      const textes = section.colonnes.map((_, i) => texteCellule(section, ligne, i, indexDonnees));
      const k = total && ligne.libelle ? etendueLibelle(ligne) : 0;
      const cellules = textes.map((t, i) => {
        const type = section.colonnes[i].type;
        const alignement = type === 'texte' ? undefined : type === 'date' || type === 'dateheure' ? 'center' : 'right';
        return cellule(t, { gras: total, fond: total ? 'F2F2F2' : undefined, alignement: alignement as 'center' | 'right' | undefined, largeur: largeurs[i] });
      });
      if (k) cellules.splice(0, k, cellule(ligne.libelle!, { gras: true, fond: 'F2F2F2', span: k }));
      lignes.push(new TableRow({ cantSplit: true, children: cellules }));
    }
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: lignes });
  };

  const enfants: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  if (d.filigrane) enfants.push(paragraphe(`${d.filigrane} : document provisoire, non définitif`, { gras: true, couleur: 'B3261E', alignement: 'center' }));
  enfants.push(entete);
  enfants.push(paragraphe(d.entete.titre, { gras: true, taille: 28, alignement: 'center', espaceApres: 120 }));
  d.entete.infos.forEach((t) => enfants.push(paragraphe(t, { taille: 17 })));
  d.sections.forEach((s) => {
    enfants.push(new Paragraph({ text: '', spacing: { after: 80 } }));
    if (s.titre) enfants.push(paragraphe(s.titre, { gras: true, taille: 21 }));
    enfants.push(tableau(s));
  });
  if (d.pied) {
    enfants.push(new Paragraph({ text: '', spacing: { after: 80 } }));
    enfants.push(paragraphe(d.pied, { taille: 17 }));
  }
  if (d.visas?.length) {
    enfants.push(new Paragraph({ text: '', spacing: { after: 120 } }));
    enfants.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({
        height: { value: 1500, rule: 'atLeast' as never },
        children: d.visas.map((v) => new TableCell({
          borders: traits,
          width: { size: Math.floor(100 / d.visas!.length), type: WidthType.PERCENTAGE },
          children: [paragraphe(v, { gras: true, alignement: 'center', taille: 17 })],
        })),
      })],
    }));
  }

  const document = new Document({
    creator: d.entete.titulaire[0] ?? '',
    title: d.entete.titre,
    fonts: amiri
      ? [
          { name: 'Amiri', data: amiri.regulier as unknown as Buffer, characterSet: CharacterSet.ARABIC },
        ]
      : undefined,
    sections: [{
      properties: {
        page: {
          size: { orientation: d.orientation === 'paysage' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `Édité le ${texteDate(d.genereLe, true)} · page `, size: 14, color: '5B6B77', font: 'Arial' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 14, color: '5B6B77', font: 'Arial' }),
              new TextRun({ text: ' / ', size: 14, color: '5B6B77', font: 'Arial' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: '5B6B77', font: 'Arial' }),
            ],
          })],
        }),
      },
      children: enfants,
    }],
  });
  return Packer.toBlob(document);
}
