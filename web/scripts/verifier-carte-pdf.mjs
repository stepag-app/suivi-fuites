// Vérification de l'impression de la carte (src/lib/export/carte-pdf.ts), sans navigateur ni base :
// fabrique des PDF avec des fuites fictives autour d'Oujda et un fond de carte factice (PNG dessiné
// ici, points placés en Web Mercator comme le ferait MapLibre), puis contrôle l'essentiel : nombre et
// format des pages, légende, échelle (comparée au calcul de MapLibre), nord, coordonnées, graduations,
// attribution OpenStreetMap, mention du fond indisponible, liste, pied « Page n / N ».
//
// Usage (dans web/) : node scripts/verifier-carte-pdf.mjs [dossier de sortie]
// Node 22.18 ou plus (types TypeScript retirés à la volée). Si pdftoppm (poppler) est installé,
// chaque PDF est aussi rendu en PNG dans le dossier de sortie, pour le regarder.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

// Les modules du panneau s'importent sans extension et avec l'alias « @/ » : on les résout ici.
const SRC = new URL('../src/', import.meta.url);
registerHooks({
  resolve(specifier, context, suivant) {
    const alias = specifier.startsWith('@/') ? new URL(specifier.slice(2), SRC).href : null;
    const relatif = specifier.startsWith('.') && context.parentURL?.endsWith('.ts') ? new URL(specifier, context.parentURL).href : null;
    const base = alias ?? relatif;
    if (base && !/\.[cm]?[jt]sx?$/.test(base)) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) if (existsSync(fileURLToPath(base + ext))) return suivant(base + ext, context);
    }
    return suivant(base ?? specifier, context);
  },
});
const { GABARIT, barreEchelle, capaciteLegende, centreImage, disposerCarte, genererCartePdf, graduations, metresParMm } = await import('../src/lib/export/carte-pdf.ts');
const { CLASSES_DIAMETRE } = await import('../src/lib/reseau/palette.ts');

const sortie = process.argv[2] ?? join(tmpdir(), 'verification-carte-pdf');
mkdirSync(sortie, { recursive: true });

// ---------------------------------------------------------------------------
// Données fictives
// ---------------------------------------------------------------------------
const CENTRE = { lat: 34.6814, lon: -1.9086 };
const ZOOM = 14.4;
const STATUTS = [
  ['Détectée, non réparée', '#e26060', '#aa0808'], ['Réparation en cours', '#f0a050', '#b44f00'],
  ['Réparée, réfection à faire', '#5c9ff0', '#0064d9'], ['Achevée', '#4fa36a', '#256f3a'], ['Sans réparation', '#a3b0bd', '#556b82'],
];
let graine = 7;
const hasard = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648);
const fuites = Array.from({ length: 40 }, (_, i) => {
  const [statut, fond, contour] = STATUTS[i % 5];
  const sansPosition = i >= 38;
  return {
    numero: i + 1, reference: `R-2026-${String(400 + i).padStart(4, '0')}`, statut, couleur: { fond, contour },
    secteur: `Secteur ${String(1 + (i % 6)).padStart(2, '0')}`, adresse: `${12 + i} rue de la Fontaine, quartier ${['Lazaret', 'Al Qods', 'Sidi Yahya'][i % 3]}`,
    latitude: sansPosition ? null : CENTRE.lat + (hasard() - 0.5) * 0.02, longitude: sansPosition ? null : CENTRE.lon + (hasard() - 0.5) * 0.03,
    detectee: new Date(Date.UTC(2026, 8, 1 + (i % 28), 8 + (i % 9), 15)).toISOString(), alerte: i % 7 === 0,
  };
});
const placees = fuites.filter((f) => f.latitude != null);

// Web Mercator (tuiles de 512 px, comme MapLibre)
const MONDE = (z) => 512 * 2 ** z;
const xPx = (lon, z) => ((lon + 180) / 360) * MONDE(z);
const yPx = (lat, z) => (0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)) * MONDE(z);
const lonPx = (x, z) => (x / MONDE(z)) * 360 - 180;
const latPx = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / MONDE(z))))) * 180 / Math.PI;

// PNG (RGB) sans dépendance
function png(l, h, rgb) {
  const brut = Buffer.alloc((l * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(brut, y * (l * 3 + 1) + 1, y * l * 3, (y + 1) * l * 3);
  const bloc = (type, data) => {
    const t = Buffer.from(type);
    const n = Buffer.alloc(4); n.writeUInt32BE(data.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([n, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(l, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', deflateSync(brut)), bloc('IEND', Buffer.alloc(0))]);
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Fond factice à la taille du cadre (1 px CSS = 1/96 de pouce, ×2 comme le rendu à ~200 dpi) :
// îlots gris, rues blanches, oued bleu, fuites aux positions projetées. Bornes déduites du centre et du zoom.
const capturerFactice = (fondIndisponible) => async (largeurMm, hauteurMm) => {
  const lCss = Math.round((largeurMm * 96) / 25.4);
  const hCss = Math.round((hauteurMm * 96) / 25.4);
  const k = 2;
  const l = lCss * k;
  const h = hCss * k;
  const x0 = xPx(CENTRE.lon, ZOOM) - lCss / 2;
  const y0 = yPx(CENTRE.lat, ZOOM) - hCss / 2;
  const img = Buffer.alloc(l * h * 3);
  const poser = (x, y, c) => { if (x >= 0 && y >= 0 && x < l && y < h) img.set(c, (y * l + x) * 3); };
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
    const rue = !fondIndisponible && ((x + 3 * y) % 170 < 9 || (y - x / 4 + 4000) % 130 < 7);
    const oued = !fondIndisponible && Math.abs(y - h * 0.62 - (x - l / 2) * 0.35) < 10;
    poser(x, y, fondIndisponible ? [238, 242, 245] : oued ? [170, 211, 223] : rue ? [255, 255, 255] : [235, 233, 228]);
  }
  for (const f of placees) {
    const cx = Math.round((xPx(f.longitude, ZOOM) - x0) * k);
    const cy = Math.round((yPx(f.latitude, ZOOM) - y0) * k);
    for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
      const r = Math.hypot(dx, dy);
      if (r <= 8) poser(cx + dx, cy + dy, hex(f.couleur.fond));
      else if (r <= 12) poser(cx + dx, cy + dy, hex(f.couleur.contour));
    }
  }
  return {
    donnees: png(l, h, img), type: 'PNG', largeurPx: l, hauteurPx: h, fondIndisponible, numeros: !fondIndisponible,
    ouest: lonPx(x0, ZOOM), est: lonPx(x0 + lCss, ZOOM), nord: latPx(y0, ZOOM), sud: latPx(y0 + hCss, ZOOM),
  };
};

const entete = {
  titulaire: ['STEPAG SARL', 'SARL au capital de 100 000 DH', 'Oujda', 'ICE 000000000000000 · RC 0000'],
  client: ['Société Régionale Multiservices de l\'Oriental', 'Direction de l\'eau'],
  titre: 'Carte des fuites – Secteur 03',
  infos: ['Marché n° 4500004453', 'Objet : recherche et réparation des fuites sur le réseau d\'eau potable de la ville d\'Oujda (démonstration)',
    'Filtres : secteur : Secteur 03 ; détectées du 01/09/2026 au 30/09/2026', `${placees.length} fuites sur la carte, 2 sans position GPS`],
};

// ---------------------------------------------------------------------------
// Lecture du PDF : textes des flux décompressés, nombre et taille des pages
// ---------------------------------------------------------------------------
function lirePdf(octets) {
  const brut = Buffer.from(octets);
  const latin = brut.toString('latin1');
  const textes = [];
  for (const m of latin.matchAll(/stream\r?\n/g)) {
    const debut = m.index + m[0].length;
    const fin = latin.indexOf('endstream', debut);
    try { textes.push(inflateSync(brut.subarray(debut, fin)).toString('latin1')); } catch { /* flux non compressé ou image */ }
  }
  const texte = textes.join('\n').replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))).replace(/\\([()\\])/g, '$1');
  const pages = [...latin.matchAll(/\/Type \/Page\b(?!s)/g)].length;
  const boite = latin.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  return { texte, pages, largeurMm: boite && (Number(boite[1]) * 25.4) / 72, hauteurMm: boite && (Number(boite[2]) * 25.4) / 72 };
}

let echecs = 0;
const verifier = (nom, ok, detail = '') => {
  if (!ok) echecs++;
  console.log(`${ok ? '  ok ' : '  ÉCHEC'} ${nom}${detail ? ` : ${detail}` : ''}`);
};
const pdftoppm = (() => { try { execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();

const CAS = [
  { nom: 'a4-paysage-liste', format: 'a4', orientation: 'paysage', liste: true, dims: [297, 210] },
  { nom: 'a4-portrait', format: 'a4', orientation: 'portrait', liste: false, dims: [210, 297] },
  { nom: 'a3-paysage', format: 'a3', orientation: 'paysage', liste: false, dims: [420, 297] },
  { nom: 'a3-portrait-liste', format: 'a3', orientation: 'portrait', liste: true, dims: [297, 420] },
  { nom: 'a4-paysage-fond-indisponible', format: 'a4', orientation: 'paysage', liste: false, dims: [297, 210], fondIndisponible: true },
  // Légende longue (statuts, contours, réseau par diamètre) : en portrait, elle passe en bande à part sur plusieurs colonnes.
  { nom: 'a4-portrait-legende-longue', format: 'a4', orientation: 'portrait', liste: false, dims: [210, 297], reseau: true },
  { nom: 'a3-portrait-legende-longue', format: 'a3', orientation: 'portrait', liste: false, dims: [297, 420], reseau: true },
  { nom: 'a4-paysage-legende-longue', format: 'a4', orientation: 'paysage', liste: false, dims: [297, 210], reseau: true },
  { nom: 'a3-paysage-legende-longue', format: 'a3', orientation: 'paysage', liste: false, dims: [420, 297], reseau: true },
  // Rubriques décochées (X7) : légende et échelle seulement, sans graduations ; puis la carte seule.
  { nom: 'a4-portrait-rubriques', format: 'a4', orientation: 'portrait', liste: false, dims: [210, 297], rubriques: ['legende', 'echelle'] },
  { nom: 'a4-paysage-carte-seule', format: 'a4', orientation: 'paysage', liste: false, dims: [297, 210], rubriques: [] },
];
const LEGENDE_RESEAU = [
  ...CLASSES_DIAMETRE.map((c, i) => ({ libelle: `Diamètre ${c.libelle}`, fond: c.couleur, contour: c.couleur, nombre: 120 + i })),
  { libelle: 'Diamètre inconnu', fond: '#8a97a5', contour: '#8a97a5', nombre: 7 },
];

console.log('\nlégende en portrait');
verifier('libellés de diamètre sans « ≤ » ni « > » (police standard du PDF)', CLASSES_DIAMETRE.every((c) => !/[≤≥<>]/.test(c.libelle)), CLASSES_DIAMETRE.map((c) => c.libelle).join(' · '));
const TOUTES = ['legende', 'echelle', 'coordonnees', 'informations'];
verifier('légende courte : dans la bande', disposerCarte(9, TOUTES, false, 186, 200).legendeAPart === null && capaciteLegende(GABARIT.bandeCartouche) === 9);
const longue = disposerCarte(15, TOUTES, false, 186, 200);
verifier('légende longue en A4 portrait : bande à part, 3 colonnes', longue.legendeAPart?.colonnes === 3 && longue.legendeAPart.hauteur < 30
  && longue.boites.join() === 'echelle,coordonnees,informations', JSON.stringify(longue));
verifier('légende longue en A3 portrait : 4 colonnes', disposerCarte(15, TOUTES, false, 273, 330).legendeAPart?.colonnes === 4);
verifier('légende longue en A4 paysage : sous la carte', disposerCarte(15, TOUTES, true, 273, 130).legendeAPart !== null && disposerCarte(9, TOUTES, true, 273, 130).legendeAPart === null);
verifier('sans boîte : la carte prend toute la place', JSON.stringify(disposerCarte(9, [], true, 273, 140).carte) === JSON.stringify({ l: 273, h: 140 })
  && JSON.stringify(disposerCarte(9, [], false, 186, 200).carte) === JSON.stringify({ l: 186, h: 200 }));

for (const cas of CAS) {
  console.log(`\n${cas.nom}`);
  let image = null;
  let cadre = null;
  const capturer = capturerFactice(!!cas.fondIndisponible);
  const debut = performance.now();
  const octets = await genererCartePdf({
    format: cas.format, orientation: cas.orientation, entete, filtres: entete.infos[2],
    legende: [
      ...STATUTS.map(([libelle, fond, contour]) => ({ libelle, fond, contour, nombre: placees.filter((f) => f.statut === libelle).length })),
      ...(cas.reseau ? LEGENDE_RESEAU : []),
    ],
    alertes: { nombre: placees.filter((f) => f.alerte).length, couleur: '#b3261e' },
    contours: { zones: !!cas.reseau, secteurs: true, couleur: '#0b5d8a' },
    nombreSurCarte: placees.length, sansPosition: fuites.length - placees.length,
    liste: cas.liste ? fuites : null, libelleReference: 'Référence SRM',
    genereLe: new Date('2026-10-05T10:30:00Z'),
    rubriques: cas.rubriques ? new Set(cas.rubriques) : undefined,
    capturer: async (l, h) => { cadre = { l, h }; image = await capturer(l, h); return image; },
  });
  const fichier = join(sortie, `carte-${cas.nom}.pdf`);
  writeFileSync(fichier, Buffer.from(octets));
  const { texte, pages, largeurMm, hauteurMm } = lirePdf(octets);
  console.log(`  ${fichier} (${(octets.byteLength / 1024).toFixed(0)} Ko, ${(performance.now() - debut).toFixed(0)} ms)`);

  const pagesAttendues = cas.liste ? 2 : 1;
  verifier('pages', cas.liste ? pages >= pagesAttendues : pages === 1, `${pages}`);
  verifier('format du papier', Math.abs(largeurMm - cas.dims[0]) < 0.5 && Math.abs(hauteurMm - cas.dims[1]) < 0.5, `${largeurMm?.toFixed(1)} × ${hauteurMm?.toFixed(1)} mm`);
  verifier('cadre de la carte assez grand', cadre.h >= GABARIT.hauteurMinCarte && cadre.l > 150, `${cadre.l.toFixed(0)} × ${cadre.h.toFixed(0)} mm`);
  verifier('en-tête du marché et titre', texte.includes('STEPAG SARL') && texte.includes('Carte des fuites') && texte.includes('Marché n° 4500004453'));
  verifier('filtres', texte.includes('Filtres : secteur : Secteur 03'));
  const a = (r) => !cas.rubriques || cas.rubriques.includes(r);
  if (cas.rubriques) {
    verifier('rubriques décochées absentes', (a('coordonnees') || !texte.includes('Coordonnées GPS')) && (a('informations') || !texte.includes('Édité le 05/10/2026'))
      && (a('legende') || !texte.includes('Légende')) && (a('echelle') || !texte.includes('Échelle 1 :')) && (a('graduations') || !/\(-1\.9\d+°\)/.test(texte)));
  }
  if (a('legende')) verifier('légende des statuts', texte.includes('Légende') && STATUTS.every(([l]) => texte.includes(l)) && texte.includes('En alerte'));
  if (a('echelle')) verifier('flèche du nord', /\(N\) Tj/.test(texte));
  verifier('attribution OpenStreetMap', texte.includes('© contributeurs OpenStreetMap'));
  if (a('informations')) verifier('date d\'édition', texte.includes('Édité le 05/10/2026'));
  verifier('pied « Page n / N »', texte.includes(`Page 1 / ${pages}`) && texte.includes(`Page ${pages} / ${pages}`));

  // Échelle : mètres par mm du PDF contre le calcul de MapLibre (mètres par pixel à la latitude du centre).
  const attendu = (40075016.686 * Math.cos((CENTRE.lat * Math.PI) / 180)) / (512 * 2 ** ZOOM) * (96 / 25.4);
  const calcule = metresParMm(image, cadre.l);
  verifier('échelle juste', Math.abs(calcule / attendu - 1) < 0.003, `${calcule.toFixed(3)} m/mm, MapLibre ${attendu.toFixed(3)}`);
  const lue = Number((texte.match(/Échelle 1 : ([\d ]+)/)?.[1] ?? '').replace(/ /g, ''));
  if (a('echelle')) verifier('échelle numérique', Math.abs(lue / (attendu * 1000) - 1) < 0.01, `1 : ${lue}`);
  const barre = barreEchelle(calcule, GABARIT.barreEchelleMax);
  const pas = barre.metres / barre.segments;
  verifier('barre d\'échelle ronde', /^[125]0*$/.test(String(pas)) && barre.segments >= 2 && barre.segments <= 5
    && barre.mm <= GABARIT.barreEchelleMax && barre.mm >= 0.6 * GABARIT.barreEchelleMax, `${barre.segments} × ${pas} m = ${barre.mm.toFixed(1)} mm`);

  // Coordonnées : centre (6 décimales) et coins (5 décimales), graduations dans le cadre.
  const c = centreImage(image);
  verifier('centre = centre demandé', Math.abs(c.latitude - CENTRE.lat) < 1e-6 && Math.abs(c.longitude - CENTRE.lon) < 1e-6);
  if (a('coordonnees')) verifier('coordonnées du centre et des coins', texte.includes(`${CENTRE.lat.toFixed(6)}, ${CENTRE.lon.toFixed(6)}`)
    && texte.includes(`${image.nord.toFixed(5)}, ${image.ouest.toFixed(5)}`) && texte.includes(`${image.sud.toFixed(5)}, ${image.est.toFixed(5)}`));
  const g = graduations(image.ouest, image.est, Math.floor(cadre.l / GABARIT.ecartGraduations));
  const etiquettes = g.valeurs.map((v) => `${v.toFixed(g.decimales)}°`).filter((t) => texte.includes(t));
  if (a('graduations')) verifier('graduations en longitude', etiquettes.length >= 2 && g.valeurs.every((v) => v >= image.ouest && v <= image.est), etiquettes.join(' '));

  if (cas.liste) {
    verifier('liste des fuites', texte.includes(`Fuites affichées (${fuites.length})`) && texte.includes('R-2026-0439') && texte.includes('Référence SRM'));
  }
  if (cas.fondIndisponible) verifier('mention du fond indisponible', texte.includes('Fond de carte indisponible'));
  if (cas.reseau) {
    verifier('légende du réseau complète', LEGENDE_RESEAU.every((e) => texte.includes(`${e.libelle} (${e.nombre})`)) && texte.includes('Contour de zone'),
      'Diamètre jusqu\'à 63 mm …');
    verifier('ni « ≤ » ni caractère perdu dans le PDF', !texte.includes('≤') && !texte.includes('d\'"'));
  }

  if (pdftoppm) {
    execFileSync('pdftoppm', ['-r', '90', '-png', fichier, join(sortie, `carte-${cas.nom}`)]);
    console.log(`  rendu PNG : ${join(sortie, `carte-${cas.nom}-*.png`)}`);
  }
}

console.log(echecs ? `\n${echecs} vérification(s) en échec.` : '\nToutes les vérifications sont passées.');
process.exit(echecs ? 1 : 0);
