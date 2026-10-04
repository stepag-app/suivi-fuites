// Textes arabes dans les exports.
//
// Police : Amiri (licence SIL OFL, public/polices/), chargée seulement si le
// document contient de l'arabe.
//  * Word : vrai texte, police embarquée dans le fichier ; Word met en forme l'arabe.
//  * Excel : vrai texte ; Excel met en forme l'arabe avec les polices du poste.
//  * PDF : jsPDF lie mal certains textes (parenthèses, lettres marocaines ݒ ݣ) ;
//    chaque texte contenant de l'arabe est donc composé par le navigateur (moteur de
//    mise en forme complet, police Amiri) puis inséré en image nette (3 × la taille).

export const RE_ARABE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export const contientArabe = (t: unknown): t is string => typeof t === 'string' && RE_ARABE.test(t);

const FAMILLE = 'AmiriExport';
let fichiers: Promise<{ regulier: Uint8Array; gras: Uint8Array }> | null = null;
let faces: Promise<void> | null = null;

export function chargerFichiersAmiri() {
  fichiers ??= Promise.all(
    ['/polices/Amiri-Regular.ttf', '/polices/Amiri-Bold.ttf'].map(async (u) => {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`Police arabe introuvable (${u}).`);
      return new Uint8Array(await r.arrayBuffer());
    }),
  ).then(([regulier, gras]) => ({ regulier, gras }));
  fichiers.catch(() => (fichiers = null));
  return fichiers;
}

async function chargerFaces() {
  faces ??= (async () => {
    const { regulier, gras } = await chargerFichiersAmiri();
    const r = new FontFace(FAMILLE, regulier.buffer as ArrayBuffer, { weight: '400' });
    const g = new FontFace(FAMILLE, gras.buffer as ArrayBuffer, { weight: '700' });
    await Promise.all([r.load(), g.load()]);
    document.fonts.add(r);
    document.fonts.add(g);
  })();
  faces.catch(() => (faces = null));
  return faces;
}

export interface ImageTexte { donnees: string; alias: string; largeurMm: number; hauteurMm: number }

// Compose un texte avec le navigateur et le renvoie en PNG, à la taille voulue (points).
export async function imagesTextes(textes: string[], taillePt: number, gras = false): Promise<Map<string, ImageTexte>> {
  await chargerFaces();
  const echelle = 3;
  const px = (taillePt * 96) / 72;
  const sortie = new Map<string, ImageTexte>();
  const toile = document.createElement('canvas');
  const ctx = toile.getContext('2d')!;
  for (const t of new Set(textes)) {
    const police = `${gras ? 700 : 400} ${px * echelle}px ${FAMILLE}`;
    ctx.font = police;
    ctx.direction = 'rtl';
    const mesure = ctx.measureText(t);
    const largeur = Math.ceil(mesure.width) + 4 * echelle;
    const hauteur = Math.ceil(px * 1.55 * echelle);
    toile.width = largeur;
    toile.height = hauteur;
    ctx.font = police;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#14232e';
    ctx.clearRect(0, 0, largeur, hauteur);
    ctx.fillText(t, largeur - 2 * echelle, hauteur / 2);
    const mm = 25.4 / 96 / echelle;
    sortie.set(t, { donnees: toile.toDataURL('image/png'), alias: `ar${gras ? 'g' : ''}${taillePt}-${sortie.size}`, largeurMm: largeur * mm, hauteurMm: hauteur * mm });
  }
  return sortie;
}
