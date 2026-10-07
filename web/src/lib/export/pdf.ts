// Export PDF (jsPDF + jspdf-autotable, chargés à la demande).
import { contientArabe, imagesTextes, type ImageTexte } from './arabe';
import { dimensionsLogo, etendueLibelle, lignesEntete, parcourir, texteCellule, texteDate, textesArabesEntete, type DocumentExport, type LogoEntete, type SectionDoc } from './modele';

export const BLEU: [number, number, number] = [11, 93, 138];
export const GRIS_TRAIT: [number, number, number] = [175, 186, 196];
export const FOND_GROUPE: [number, number, number] = [230, 238, 244];
const FOND_TOTAL: [number, number, number] = [242, 242, 242];
const TAILLE_CELLULE = 8;

type Pdf = InstanceType<typeof import('jspdf').jsPDF>;

// Logos au-dessus des noms (titulaire à gauche, maître d'ouvrage à droite). Renvoie la
// hauteur occupée (0 sans logo). L'alias fait inclure chaque image une seule fois par fichier.
function dessinerLogos(pdf: Pdf, entete: DocumentExport['entete'], marge: number): number {
  const largeur = pdf.internal.pageSize.getWidth();
  const haut = marge - 2;
  const poser = (logo: LogoEntete | null | undefined, cote: 'gauche' | 'droite') => {
    if (!logo) return 0;
    const { largeurMm, hauteurMm } = dimensionsLogo(logo);
    const x = cote === 'gauche' ? marge : largeur - marge - largeurMm;
    pdf.addImage(logo.donnees, logo.format, x, haut, largeurMm, hauteurMm, `logo-${cote}-${logo.donnees.length}`, 'FAST');
    return hauteurMm;
  };
  const h = Math.max(poser(entete.logoTitulaire, 'gauche'), poser(entete.logoMaitreOuvrage, 'droite'));
  return h ? h + 2 : 0;
}

// En-tête de première page (logos, titulaire à gauche, maître d'ouvrage à droite, titre, infos).
// Renvoie l'ordonnée sous l'en-tête. Partagé avec le rapport par fuite.
export function dessinerEntete(pdf: Pdf, entete: DocumentExport['entete'], imagesEntete: Map<string, ImageTexte>, marge: number): number {
  const largeur = pdf.internal.pageSize.getWidth();
  const utile = largeur - 2 * marge;
  pdf.setTextColor(20, 35, 46);
  const hauteurLogos = dessinerLogos(pdf, entete, marge);
  const demi = utile / 2 - 4;
  const colonne = (lignes: string[], ar: string | null | undefined, logo: LogoEntete | null | undefined, cote: 'gauche' | 'droite') => {
    const { nom, details, ar: arabe } = lignesEntete(lignes, ar, logo);
    const x = cote === 'gauche' ? marge : largeur - marge;
    const options = cote === 'gauche' ? undefined : { align: 'right' as const };
    let y = marge + 2 + hauteurLogos;
    if (nom) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      const texte = pdf.splitTextToSize(nom, demi);
      pdf.text(texte, x, y, options);
      y += texte.length * 4.6;
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    details.forEach((t) => {
      const texte = pdf.splitTextToSize(t, demi);
      pdf.text(texte, x, y, options);
      y += texte.length * 3.6;
    });
    const img = arabe ? imagesEntete.get(arabe) : undefined;
    if (img) {
      pdf.addImage(img.donnees, 'PNG', cote === 'gauche' ? marge : largeur - marge - img.largeurMm, y - 2.5, img.largeurMm, img.hauteurMm, img.alias, 'FAST');
      y += img.hauteurMm;
    }
    return y;
  };
  const yGauche = colonne(entete.titulaire, entete.titulaireAr, entete.logoTitulaire, 'gauche');
  const yDroite = colonne(entete.client, entete.clientAr, entete.logoMaitreOuvrage, 'droite');
  let y = Math.max(yGauche, yDroite) + 3;
  pdf.setDrawColor(...BLEU);
  pdf.setLineWidth(0.4);
  pdf.line(marge, y, largeur - marge, y);
  y += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  const titre = pdf.splitTextToSize(entete.titre, utile);
  pdf.text(titre, largeur / 2, y, { align: 'center' });
  y += titre.length * 5.5 + 1;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  entete.infos.forEach((t) => {
    const lignes = pdf.splitTextToSize(t, utile);
    pdf.text(lignes, marge, y);
    y += lignes.length * 3.8;
  });
  return y + 2;
}

export async function genererPdf(d: DocumentExport): Promise<Blob> {
  const [{ jsPDF, GState }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);

  // Textes arabes composés par le navigateur (voir arabe.ts)
  const arabesCellules: string[] = [];
  d.sections.forEach((s) => s.lignes.forEach((l) => {
    l.cellules.forEach((c) => contientArabe(c) && arabesCellules.push(c));
    if (contientArabe(l.libelle)) arabesCellules.push(l.libelle);
  }));
  const arabesEntete = textesArabesEntete(d.entete).filter(contientArabe);
  const imagesCellules = arabesCellules.length ? await imagesTextes(arabesCellules, TAILLE_CELLULE) : new Map<string, ImageTexte>();
  const imagesEntete = arabesEntete.length ? await imagesTextes(arabesEntete, 10, true) : new Map<string, ImageTexte>();

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: d.orientation === 'paysage' ? 'landscape' : 'portrait' });
  const largeur = pdf.internal.pageSize.getWidth();
  const hauteur = pdf.internal.pageSize.getHeight();
  const marge = 12;
  const utile = largeur - 2 * marge;

  const filigrane = () => {
    if (!d.filigrane) return;
    pdf.saveGraphicsState();
    pdf.setGState(new GState({ opacity: 0.1 }));
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(90);
    pdf.setTextColor(179, 38, 30);
    pdf.text(d.filigrane, largeur / 2, hauteur / 2, { align: 'center', angle: 30 });
    pdf.restoreGraphicsState();
    pdf.setTextColor(20, 35, 46);
  };

  // ---------------------------------------------------------------------------
  // En-tête de la première page : titulaire à gauche, maître d'ouvrage à droite
  // ---------------------------------------------------------------------------
  filigrane();
  let y = dessinerEntete(pdf, d.entete, imagesEntete, marge);

  // ---------------------------------------------------------------------------
  // Tableaux
  // ---------------------------------------------------------------------------
  const piedDePage = () => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(91, 107, 119);
    pdf.text(`${d.entete.titre.slice(0, 90)} · édité le ${texteDate(d.genereLe, true)}`, marge, hauteur - 6);
    pdf.setTextColor(20, 35, 46);
  };

  for (const section of d.sections) {
    if (section.titre) {
      if (y > hauteur - 40) { pdf.addPage(); filigrane(); y = marge + 4; }
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      pdf.text(section.titre, marge, y + 1);
      y += 4;
    }
    tableau(section, y);
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  }

  function tableau(section: SectionDoc, debut: number) {
    const n = section.colonnes.length;
    const corps: unknown[][] = [];
    const types: string[] = [];
    for (const { ligne, indexDonnees } of parcourir(section)) {
      types.push(ligne.type);
      if (ligne.type === 'groupe') {
        corps.push([{ content: ligne.libelle ?? '', colSpan: n }]);
        continue;
      }
      const cellules: unknown[] = section.colonnes.map((_, i) => texteCellule(section, ligne, i, indexDonnees));
      if (ligne.type !== 'donnees' && ligne.libelle) {
        const k = etendueLibelle(ligne);
        cellules.splice(0, k, { content: ligne.libelle, colSpan: k, styles: { halign: 'left' } });
      }
      corps.push(cellules);
    }
    autoTable(pdf, {
      startY: debut,
      margin: { left: marge, right: marge, top: marge + 4, bottom: 12 },
      head: [section.colonnes.map((c) => c.titre)],
      body: corps as never,
      theme: 'grid',
      styles: {
        font: 'helvetica', fontSize: TAILLE_CELLULE, cellPadding: 1.1, overflow: 'linebreak',
        lineColor: GRIS_TRAIT, lineWidth: 0.1, textColor: [20, 35, 46], valign: 'middle',
      },
      headStyles: { fillColor: BLEU, textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 7.5 },
      // Nombres et dates : largeur ajustée au contenu (jamais coupés) ; textes : le reste de la page.
      columnStyles: Object.fromEntries(section.colonnes.map((c, i) => [i, {
        halign: c.type === 'texte' ? 'left' : c.type === 'date' || c.type === 'dateheure' ? 'center' : 'right',
        cellWidth: c.type === 'texte' ? 'auto' : 'wrap',
      }])),
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const type = types[data.row.index];
        if (type === 'groupe') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = FOND_GROUPE;
          data.cell.styles.halign = 'left';
        } else if (type === 'sous_total' || type === 'total') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = FOND_TOTAL;
        }
        const brut = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : String(data.cell.text ?? '');
        if (contientArabe(brut)) {
          (data.cell as unknown as { arabe: string }).arabe = brut;
          data.cell.text = [''];
          const img = imagesCellules.get(brut);
          if (img) data.cell.styles.minCellHeight = img.hauteurMm + 1;
        }
      },
      didDrawCell: (data) => {
        const arabe = (data.cell as unknown as { arabe?: string }).arabe;
        if (data.section !== 'body' || !arabe) return;
        const img = imagesCellules.get(arabe);
        if (!img) return;
        const dispo = data.cell.width - 2;
        const k = Math.min(1, dispo / img.largeurMm);
        const l = img.largeurMm * k;
        const h = img.hauteurMm * k;
        pdf.addImage(img.donnees, 'PNG', data.cell.x + data.cell.width - 1 - l, data.cell.y + (data.cell.height - h) / 2, l, h, img.alias, 'FAST');
      },
      willDrawPage: (data) => {
        if (data.pageNumber > 1) filigrane();
      },
      didDrawPage: () => piedDePage(),
    });
  }

  // ---------------------------------------------------------------------------
  // Texte de pied et visas
  // ---------------------------------------------------------------------------
  if (d.pied) {
    if (y > hauteur - 30) { pdf.addPage(); filigrane(); piedDePage(); y = marge + 4; }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    const lignes = pdf.splitTextToSize(d.pied, utile);
    pdf.text(lignes, marge, y);
    y += lignes.length * 3.8 + 3;
  }
  if (d.visas?.length) {
    const hauteurVisa = 28;
    if (y + hauteurVisa > hauteur - 14) { pdf.addPage(); filigrane(); piedDePage(); y = marge + 4; }
    const l = utile / d.visas.length;
    pdf.setDrawColor(...GRIS_TRAIT);
    pdf.setLineWidth(0.2);
    d.visas.forEach((v, i) => {
      const x = marge + i * l;
      pdf.rect(x + 1, y, l - 2, hauteurVisa);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.text(pdf.splitTextToSize(v, l - 6), x + l / 2, y + 5, { align: 'center' });
    });
  }

  // Numéros de page
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(91, 107, 119);
    pdf.text(`Page ${p} / ${total}`, largeur - marge, hauteur - 6, { align: 'right' });
  }
  return pdf.output('blob');
}
