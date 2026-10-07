// Vérification des logos dans les en-têtes (PDF, Word, Excel), sans navigateur ni base :
//   cd web && node scripts/essai-logos.mjs [dossier de sortie]
// Fabrique les trois formats avec un logo PNG transparent (titulaire) et un logo JPEG
// (maître d'ouvrage), puis sans logo, et contrôle le contenu des fichiers. Les fichiers
// produits restent dans le dossier de sortie pour un contrôle à l'œil.
// Node 22.15 ou plus (types TypeScript retirés à la volée).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

// Imports sans extension des sources (« ./modele ») : fichier .ts, module ES.
registerHooks({
  resolve(specifier, context, suivant) {
    const depuisSources = context.parentURL?.includes('/src/lib/') && !context.parentURL.includes('/node_modules/');
    const cible = depuisSources && /^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier) ? `${specifier}.ts` : specifier;
    const r = suivant(cible, context);
    return r.url.endsWith('.ts') && r.url.includes('/src/lib/') ? { ...r, format: 'module-typescript' } : r;
  },
});

const { dimensionsLogo, lignesEntete, textesArabesEntete } = await import('../src/lib/export/modele.ts');
const { genererPdf, dessinerEntete } = await import('../src/lib/export/pdf.ts');
const { genererDocx } = await import('../src/lib/export/docx.ts');
const { genererXlsx } = await import('../src/lib/export/xlsx.ts');
const { unzipSync, strFromU8 } = await import('fflate');

// PNG RVBA : bandeau bleu sur fond transparent
function png(largeur, hauteur) {
  const ligne = largeur * 4 + 1;
  const brut = Buffer.alloc(ligne * hauteur);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const o = y * ligne + 1 + x * 4;
      const dedans = y > hauteur * 0.2 && y < hauteur * 0.8 && x > largeur * 0.05 && x < largeur * 0.95;
      brut.set(dedans ? [0, 100, 217, 255] : [0, 0, 0, 0], o);
    }
  }
  const morceau = (type, donnees) => {
    const l = Buffer.alloc(4);
    l.writeUInt32BE(donnees.length);
    const td = Buffer.concat([Buffer.from(type), donnees]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([l, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    morceau('IHDR', ihdr), morceau('IDAT', deflateSync(brut)), morceau('IEND', Buffer.alloc(0)),
  ]);
}
// JPEG 16 × 16 rouge
const JPEG = '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAEAAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMACQkJCQkJEAkJEBYQEBAWHhYWFhYeJh4eHh4eJi4mJiYmJiYuLi4uLi4uLjc3Nzc3N0BAQEBASEhISEhISEhISP/bAEMBCwwMEhESHxERH0szKjNLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS//dAAQAAf/aAAwDAQACEQMRAD8A5WiiivKPvj//2Q==';

const logoTitulaire = { donnees: `data:image/png;base64,${png(300, 100).toString('base64')}`, format: 'PNG', largeur: 300, hauteur: 100 };
const logoMaitreOuvrage = { donnees: `data:image/jpeg;base64,${JPEG}`, format: 'JPEG', largeur: 16, hauteur: 16 };

let echecs = 0;
const verifier = (condition, libelle) => {
  console.log(`${condition ? 'ok  ' : 'ÉCHEC'} ${libelle}`);
  if (!condition) echecs++;
};
const proche = (a, b) => Math.abs(a - b) < 0.01;

// Dimensions : hauteur fixe, proportions conservées, largeur plafonnée
const d1 = dimensionsLogo({ largeur: 300, hauteur: 100 });
verifier(proche(d1.hauteurMm, 14) && proche(d1.largeurMm, 42), 'logo 3:1 : 42 × 14 mm');
const d2 = dimensionsLogo({ largeur: 1000, hauteur: 100 });
verifier(proche(d2.largeurMm, 50) && proche(d2.hauteurMm, 5), 'logo 10:1 : largeur plafonnée à 50 mm, proportions gardées');
const d3 = dimensionsLogo({ largeur: 100, hauteur: 300 });
verifier(proche(d3.hauteurMm, 14) && proche(d3.largeurMm, 14 / 3), 'logo haut : 14 mm de haut');

const documentEssai = (avecLogos) => ({
  nomFichier: 'essai-logos',
  entete: {
    titulaire: ['STEPAG SARL', 'Oujda'], client: ['Maître d\'ouvrage d\'essai', 'Direction'],
    titre: 'Essai des logos', infos: ['Marché n° 1'],
    ...(avecLogos ? { logoTitulaire, logoMaitreOuvrage } : {}),
  },
  sections: [{
    titre: 'Fuites',
    colonnes: [
      { titre: 'N°', type: 'nombre', decimales: [], largeur: 6 },
      { titre: 'Adresse', type: 'texte', decimales: [], largeur: 40 },
      { titre: 'Secteur', type: 'texte', decimales: [], largeur: 16 },
      { titre: 'Quantité', type: 'nombre', decimales: [], largeur: 10 },
    ],
    lignes: Array.from({ length: 60 }, (_, i) => ({ type: 'donnees', cellules: [i + 1, `Rue d'essai ${i + 1}`, 'S1', i * 1.5] })),
  }],
  orientation: 'portrait',
  genereLe: new Date('2026-10-05T10:00:00Z'),
});

const sortie = process.argv[2] ?? join(tmpdir(), 'essai-logos');
mkdirSync(sortie, { recursive: true });
const octets = async (blob) => new Uint8Array(await blob.arrayBuffer());
const images = (u8) => (Buffer.from(u8).toString('latin1').match(/\/Subtype \/Image/g) ?? []).length;

// PDF
for (const avec of [true, false]) {
  const pdf = await octets(await genererPdf(documentEssai(avec)));
  writeFileSync(join(sortie, `essai-logos${avec ? '' : '-sans'}.pdf`), pdf);
  // PNG transparent : image + masque de transparence ; JPEG : une image
  verifier(images(pdf) === (avec ? 3 : 0), `PDF ${avec ? 'avec' : 'sans'} logos : ${images(pdf)} image(s)`);
}
{
  // Rapport par fuite : dessinerEntete appelé à chaque page, chaque logo inclus une seule fois
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const y = dessinerEntete(pdf, documentEssai(true).entete, new Map(), 12);
  pdf.addPage();
  dessinerEntete(pdf, documentEssai(true).entete, new Map(), 12);
  const u8 = new Uint8Array(pdf.output('arraybuffer'));
  verifier(images(u8) === 3, 'PDF de deux pages : logos inclus une seule fois');
  const ySans = dessinerEntete(new jsPDF({ unit: 'mm', format: 'a4' }), documentEssai(false).entete, new Map(), 12);
  // Logos (14 + 2 mm) à la place de la ligne du nom (4,6 mm)
  verifier(proche(y - ySans, 16 - 4.6), `en-tête descendu de la hauteur des logos, sans la ligne du nom (${(y - ySans).toFixed(1)} mm)`);
}

// Le logo porte le nom : ni nom ni nom arabe sous un logo, les deux sans logo
const nomsEcrits = (texte) => ['STEPAG SARL', 'Maître d', 'وكالة'].filter((n) => texte.includes(n));
// Police arabe du Word lue dans public/ (fetch relatif impossible hors navigateur)
const fetchOrigine = globalThis.fetch;
globalThis.fetch = async (u, ...r) => (typeof u === 'string' && u.startsWith('/polices/')
  ? new Response(readFileSync(new URL(`../public${u}`, import.meta.url)))
  : fetchOrigine(u, ...r));
const avecArabe = (avec) => {
  const doc = documentEssai(avec);
  return { ...doc, entete: { ...doc.entete, titulaireAr: null, clientAr: 'وكالة تجريبية' } };
};
{
  const sous = lignesEntete(['STEPAG SARL', 'Oujda'], 'ستيباگ', logoTitulaire);
  const seul = lignesEntete(['STEPAG SARL', 'Oujda'], 'ستيباگ', null);
  verifier(sous.nom === null && sous.ar === null && sous.details.join() === 'Oujda', 'sous un logo : détails seuls');
  verifier(seul.nom === 'STEPAG SARL' && seul.ar === 'ستيباگ' && seul.details.join() === 'Oujda', 'sans logo : nom, détails et nom arabe');
  verifier(textesArabesEntete(avecArabe(true).entete).length === 0 && textesArabesEntete(avecArabe(false).entete).join() === 'وكالة تجريبية',
    'nom arabe composé seulement s\'il est écrit');
  for (const avec of [true, false]) {
    const texte = Buffer.from(await octets(await genererPdf(documentEssai(avec)))).toString('latin1');
    const vus = nomsEcrits(texte);
    verifier(avec ? vus.length === 0 : vus.length === 2, `PDF ${avec ? 'avec' : 'sans'} logos : noms écrits ${vus.join(', ') || 'aucun'}`);
  }
  for (const avec of [true, false]) {
    const xml = strFromU8(unzipSync(await octets(await genererDocx(avecArabe(avec))))['word/document.xml']);
    const vus = nomsEcrits(xml);
    verifier(avec ? vus.length === 0 : vus.length === 3, `Word ${avec ? 'avec' : 'sans'} logos : noms écrits ${vus.join(', ') || 'aucun'}`);
  }
  for (const avec of [true, false]) {
    const zip = unzipSync(await octets(await genererXlsx(avecArabe(avec))));
    const xml = Object.entries(zip).filter(([n]) => n.endsWith('.xml')).map(([, v]) => strFromU8(v)).join('\n');
    const vus = nomsEcrits(xml);
    verifier(avec ? vus.length === 0 : vus.length === 3, `Excel ${avec ? 'avec' : 'sans'} logos : noms écrits ${vus.join(', ') || 'aucun'}`);
  }
}

// Word
for (const avec of [true, false]) {
  const docx = await octets(await genererDocx(documentEssai(avec)));
  writeFileSync(join(sortie, `essai-logos${avec ? '' : '-sans'}.docx`), docx);
  const zip = unzipSync(docx);
  const medias = Object.keys(zip).filter((n) => n.startsWith('word/media/') && !n.endsWith('/'));
  const xml = strFromU8(zip['word/document.xml']);
  verifier(medias.length === (avec ? 2 : 0) && (xml.match(/<pic:pic\b/g) ?? []).length === (avec ? 2 : 0),
    `Word ${avec ? 'avec' : 'sans'} logos : ${medias.length} image(s)`);
}

// Excel
for (const avec of [true, false]) {
  const xlsx = await octets(await genererXlsx(documentEssai(avec)));
  writeFileSync(join(sortie, `essai-logos${avec ? '' : '-sans'}.xlsx`), xlsx);
  const zip = unzipSync(xlsx);
  const medias = Object.keys(zip).filter((n) => n.startsWith('xl/media/') && !n.endsWith('/')).sort();
  const feuille = strFromU8(zip['xl/worksheets/sheet1.xml']);
  verifier(medias.length === (avec ? 2 : 0), `Excel ${avec ? 'avec' : 'sans'} logos : ${medias.join(', ') || 'aucune image'}`);
  if (avec) {
    const dessin = strFromU8(zip['xl/drawings/drawing1.xml']);
    verifier((dessin.match(/<xdr:oneCellAnchor>/g) ?? []).length === 2 && dessin.includes('<xdr:row>0</xdr:row>'),
      'Excel : deux logos ancrés sur la première ligne');
    verifier(feuille.indexOf('<pageSetup') !== -1 && feuille.indexOf('<pageSetup') < feuille.indexOf('<drawing'),
      'Excel : réglages d\'impression avant le dessin (fichier valide)');
  }
}

console.log(`\nFichiers dans ${sortie}`);
if (echecs) {
  console.error(`${echecs} vérification(s) en échec`);
  process.exit(1);
}
