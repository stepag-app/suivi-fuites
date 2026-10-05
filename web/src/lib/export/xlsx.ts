// Export Excel (write-excel-file, chargé à la demande) : un onglet par tableau,
// en-tête du marché fusionné, ligne de titres figée, formats de nombres et de dates.
// Impression : A4 dans l'orientation choisie, ajusté à une page en largeur, titres de
// colonnes répétés sur chaque page, numéro de page en pied (réglages ajoutés au fichier).
import {
  decimalesPour, dimensionsLogo, etendueLibelle, mmEnPixels, octetsDataUrl, parcourir,
  type DocumentExport, type LogoEntete, type SectionDoc,
} from './modele';

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

// Largeur visée pour une page A4 (marges de 1 cm), en caractères de la police du classeur :
// un peu plus que la largeur imprimable, l'ajustement à la page réduisant légèrement l'échelle
// plutôt que de trop resserrer les colonnes de texte.
const LARGEUR_PAGE = { paysage: 190, portrait: 125 };

// Les colonnes de texte se resserrent (le texte passe à la ligne) pour tenir dans la page ;
// nombres et dates gardent leur largeur. L'ajustement à la page fait le reste à l'impression.
function largeurs(section: SectionDoc, orientation: DocumentExport['orientation']): number[] {
  const base = section.colonnes.map((c) => Math.min(60, Math.max(6, c.largeur + 2)));
  const cible = LARGEUR_PAGE[orientation === 'portrait' ? 'portrait' : 'paysage'];
  const total = base.reduce((a, b) => a + b, 0);
  if (total <= cible) return base;
  const fixe = section.colonnes.map((c) => c.type !== 'texte');
  const sommeFixe = base.reduce((a, w, i) => a + (fixe[i] ? w : 0), 0);
  const ratio = Math.max(0.35, (cible - sommeFixe) / (total - sommeFixe));
  return base.map((w, i) => (fixe[i] ? w : Math.max(10, Math.floor(w * ratio))));
}

// Largeur approximative d'une colonne en pixels (police du classeur : Calibri 10).
const PIXELS_PAR_CARACTERE = 7;

interface ImageFeuille {
  content: ArrayBuffer; contentType: string; width: number; height: number; dpi: number;
  anchor: { row: number; column: number }; offsetX: number; title: string;
}

// Logos sur une ligne réservée en tête de feuille : titulaire calé à gauche, maître
// d'ouvrage calé sur le bord droit de la dernière colonne (ancre + décalage en pixels).
function imagesLogos(d: DocumentExport, tailles: number[], ligne: number): ImageFeuille[] {
  const pixels = tailles.map((w) => Math.round(w * PIXELS_PAR_CARACTERE));
  const totale = pixels.reduce((a, b) => a + b, 0);
  const image = (logo: LogoEntete, x: number, titre: string): ImageFeuille => {
    const { largeurMm, hauteurMm } = dimensionsLogo(logo);
    let colonne = 0;
    let debut = 0;
    while (colonne < pixels.length - 1 && debut + pixels[colonne] <= x) debut += pixels[colonne++];
    return {
      content: octetsDataUrl(logo.donnees).buffer as ArrayBuffer,
      contentType: logo.format === 'PNG' ? 'image/png' : 'image/jpeg',
      width: mmEnPixels(largeurMm), height: mmEnPixels(hauteurMm), dpi: 96,
      anchor: { row: ligne, column: colonne + 1 }, offsetX: Math.max(0, Math.round(x - debut)), title: titre,
    };
  };
  const images: ImageFeuille[] = [];
  const gauche = d.entete.logoTitulaire;
  const droite = d.entete.logoMaitreOuvrage;
  const largeurGauche = gauche ? mmEnPixels(dimensionsLogo(gauche).largeurMm) : 0;
  if (gauche) images.push(image(gauche, 0, 'Logo du titulaire'));
  if (droite) {
    const x = totale - mmEnPixels(dimensionsLogo(droite).largeurMm) - 4;
    images.push(image(droite, Math.max(x, largeurGauche ? largeurGauche + 8 : 0), 'Logo du maître d\'ouvrage'));
  }
  return images;
}

function feuille(d: DocumentExport, section: SectionDoc, premiere: boolean) {
  const n = section.colonnes.length;
  const tailles = largeurs(section, d.orientation);
  const lignes: Cellule[][] = [];
  const pleine = (valeur: string, style: Record<string, unknown> = {}) => {
    const l: Cellule[] = [{ value: valeur, type: String, columnSpan: n, wrap: true, ...style }];
    for (let i = 1; i < n; i++) l.push(null);
    lignes.push(l);
  };

  const logos = [d.entete.logoTitulaire, d.entete.logoMaitreOuvrage].filter((l): l is LogoEntete => !!l);
  if (logos.length) {
    const hauteurPx = Math.max(...logos.map((l) => mmEnPixels(dimensionsLogo(l).hauteurMm)));
    pleine('', { height: Math.ceil(hauteurPx * 0.75) + 6 });
  }
  const images = logos.length ? imagesLogos(d, tailles, lignes.length) : null;
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
      return { value: v, type: String, wrap: String(v).length > tailles[i], ...style };
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
    columns: tailles.map((width) => ({ width })),
    stickyRowsCount: ligneTitres + 1,
    ligneTitres: ligneTitres + 1,
    ...(images ? { images } : {}),
  };
}

const echapperXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Réglages d'impression que write-excel-file n'écrit pas : A4, orientation, une page en largeur,
// marges réduites, centrage, pied « Page n / N », ligne de titres répétée (zones d'impression).
async function reglerImpression(fichier: Blob, onglets: { nom: string; ligneTitres: number }[], orientation: 'landscape' | 'portrait') {
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import('fflate');
  const contenu = unzipSync(new Uint8Array(await fichier.arrayBuffer()));
  const reglages = '<printOptions horizontalCentered="1"/>'
    + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.2" footer="0.3"/>'
    + `<pageSetup paperSize="9" orientation="${orientation}" fitToWidth="1" fitToHeight="0"/>`
    + '<headerFooter><oddFooter>&amp;C&amp;8Page &amp;P / &amp;N</oddFooter></headerFooter>';
  onglets.forEach((_, i) => {
    const chemin = `xl/worksheets/sheet${i + 1}.xml`;
    if (!contenu[chemin]) return;
    let xml = strFromU8(contenu[chemin])
      .replace(/<printOptions[^>]*\/>/g, '')
      .replace(/<pageMargins[^>]*\/>/g, '')
      .replace(/<pageSetup[^>]*\/>/g, '');
    if (!xml.includes('<sheetPr')) xml = xml.replace(/(<worksheet[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    xml = xml.replace(/(<drawing[ >]|<legacyDrawing|<tableParts|<extLst|<\/worksheet>)/, `${reglages}$1`);
    contenu[chemin] = strToU8(xml);
  });
  const titres = onglets
    .map((o, i) => `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${echapperXml(o.nom.replace(/'/g, "''"))}'!$${o.ligneTitres}:$${o.ligneTitres}</definedName>`)
    .join('');
  let classeur = strFromU8(contenu['xl/workbook.xml']);
  classeur = classeur.includes('<definedNames>')
    ? classeur.replace('<definedNames>', `<definedNames>${titres}`)
    : classeur.replace('</sheets>', `</sheets><definedNames>${titres}</definedNames>`);
  contenu['xl/workbook.xml'] = strToU8(classeur);
  return new Blob([zipSync(contenu, { level: 6 })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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
  const brut = await (ecrire as unknown as (f: unknown[], o: unknown) => { toBlob: () => Promise<Blob> })(
    feuilles.map(({ ligneTitres: _l, ...f }) => f), { fontFamily: 'Calibri', fontSize: 10 },
  ).toBlob();
  return reglerImpression(brut, feuilles.map((f) => ({ nom: f.sheet, ligneTitres: f.ligneTitres })),
    d.orientation === 'portrait' ? 'portrait' : 'landscape');
}
