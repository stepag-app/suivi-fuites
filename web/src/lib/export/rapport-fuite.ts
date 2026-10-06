// Rapport PDF par fuite (une ou plusieurs fuites dans un seul fichier, une fuite par page) :
// en-tête du marché, identification et position GPS, réparations, réfections, quantités du
// bordereau (si le compte a le droit « quantités / lire »), photos groupées par type, visas.
//
// Fabriqué dans le navigateur comme les autres exports (jsPDF + autotable chargés à la
// demande). Les photos sont réduites en JPEG avant insertion : le PDF reste léger et sert
// d'archive (les anciennes photos pourront être purgées du stockage, CLAUDE.md § 7).
import type { ReglesAttachement } from '@/lib/attachements';
import { EMPLACEMENTS, MATERIAUX, OUVRAGES, STATUTS, TYPES_PHOTO, libellesMarche } from '@/lib/format';
import { lienItineraire } from '@/lib/itineraire';
import { chargerLogosEntete } from '@/lib/logos';
import { urlsPhotos } from '@/lib/photo';
import { getSupabase } from '@/lib/supabase';
import type { Marche, Quantite, Refection, Reparation, VFuite } from '@/lib/types';
import { contientArabe, imagesTextes, type ImageTexte } from './arabe';
import { construireEntete, type Contexte } from './jeux';
import { nomFichierSur, telecharger, texteDate, texteNombre } from './modele';

type Pdf = InstanceType<typeof import('jspdf').jsPDF>;

// Photos : côté le plus long et qualité JPEG dans le PDF ; nombre par ligne.
const PHOTO_COTE_PX = 800;
const PHOTO_QUALITE = 0.6;
const PHOTOS_PAR_LIGNE = 3;
const ORDRE_PHOTOS = ['detection', 'avant', 'pendant', 'apres', 'refection', 'autre'];
const TAILLE = 8.5;

// ---------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------
export interface PhotoRapport {
  id: string;
  type: string;
  chemin: string;
  stockage?: string | null;
  prise_le: string;
  latitude: number | null;
  longitude: number | null;
}

export interface ReparationRapport extends Reparation {
  equipe: string | null;
  chef: string | null;
  representant_srm: string | null;
  motif: string | null;
  motifAr: string | null;
  revetement: string | null;
  ouvriers: string[];
  pieces: { designation: string; quantite: number; unite: string }[];
}

export interface RefectionRapport extends Refection {
  nature: string | null;
  natureAr: string | null;
  motif: string | null;
  motifAr: string | null;
  equipe: string | null;
}

export interface FicheRapport {
  fuite: VFuite & { precision_gps_m: number | null; methode_detection: string | null; motif_sans_reparation_ar?: string | null };
  reparations: ReparationRapport[];
  refections: RefectionRapport[];
  photos: PhotoRapport[];
  quantites: Quantite[] | null;   // null : pas le droit de voir les prix
}

export type Progression = (fait: number, total: number, etape: string) => void;

// Contexte du marché (fiche, OS, règles d'attachement pour les visas, logos), comme le panneau d'export.
export async function chargerContexteRapport(marcheId: string, peutMontants: boolean): Promise<Contexte> {
  const sb = getSupabase();
  const [m, o, r] = await Promise.all([
    sb.from('marches').select('*').eq('id', marcheId).maybeSingle(),
    sb.from('ordres_service').select('id, numero, date_os').eq('marche_id', marcheId).order('date_os'),
    sb.from('parametres_attachement').select('*').eq('marche_id', marcheId).maybeSingle(),
  ]);
  if (m.error) throw m.error;
  const fiche = (m.data as Record<string, unknown> | null) ?? {};
  const os = (o.data as { id: string; numero: string; date_os: string }[] | null) ?? [];
  return {
    marche: fiche,
    os,
    osCommencement: os.find((x) => x.id === fiche.os_commencement_id) ?? null,
    regles: (r.data as ReglesAttachement | null) ?? null,
    peutMontants,
    logos: await chargerLogosEntete(fiche),
  };
}

// Position d'une photo : GeoJSON ou EWKB hexadécimal (format renvoyé par l'API pour une geography).
export function lirePoint(v: unknown): { latitude: number; longitude: number } | null {
  if (v && typeof v === 'object' && Array.isArray((v as { coordinates?: unknown }).coordinates)) {
    const [lon, lat] = (v as { coordinates: number[] }).coordinates;
    return Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null;
  }
  if (typeof v !== 'string' || !/^[0-9a-fA-F]{42,}$/.test(v)) return null;
  const octets = new Uint8Array(v.length / 2);
  for (let i = 0; i < octets.length; i++) octets[i] = parseInt(v.substr(i * 2, 2), 16);
  const vue = new DataView(octets.buffer);
  const petit = octets[0] === 1;
  const type = vue.getUint32(1, petit);
  if ((type & 0xffff) !== 1) return null;                 // Point seulement
  const debut = 5 + (type & 0x20000000 ? 4 : 0);          // SRID présent
  const longitude = vue.getFloat64(debut, petit);
  const latitude = vue.getFloat64(debut + 8, petit);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

const paquets = <T,>(t: T[], n: number) => Array.from({ length: Math.ceil(t.length / n) }, (_, i) => t.slice(i * n, i * n + n));

// Charge toutes les données des fuites demandées (par paquets, pour de longues sélections).
export async function chargerFiches(ids: string[], marcheId: string, peutMontants: boolean): Promise<FicheRapport[]> {
  const sb = getSupabase();
  const [eq, ou, pc, mo, na, pr] = await Promise.all([
    sb.from('equipes').select('id, libelle').eq('marche_id', marcheId),
    sb.from('ouvriers').select('id, nom_complet').eq('marche_id', marcheId),
    sb.from('catalogue_pieces').select('id, designation, unite').eq('marche_id', marcheId),
    sb.from('motifs').select('id, libelle_fr, libelle_ar').eq('marche_id', marcheId),
    sb.from('natures_refection').select('id, libelle_fr, libelle_ar').eq('marche_id', marcheId),
    sb.from('profils').select('id, nom_complet'),
  ]);
  const index = <T extends { id: string }>(r: { data: unknown }) => new Map(((r.data as T[] | null) ?? []).map((x) => [x.id, x]));
  const equipes = index<{ id: string; libelle: string }>(eq);
  const ouvriers = index<{ id: string; nom_complet: string }>(ou);
  const pieces = index<{ id: string; designation: string; unite: string }>(pc);
  const motifs = index<{ id: string; libelle_fr: string; libelle_ar: string | null }>(mo);
  const natures = index<{ id: string; libelle_fr: string; libelle_ar: string | null }>(na);
  const profils = index<{ id: string; nom_complet: string }>(pr);

  const fiches: FicheRapport[] = [];
  for (const lot of paquets(ids, 50)) {
    const [f, fx, rp, rf, ph, q] = await Promise.all([
      sb.from('v_fuites').select('*').in('id', lot),
      sb.from('fuites').select('id, precision_gps_m, methode_detection').in('id', lot),
      sb.from('reparations').select('*').in('fuite_id', lot).is('supprime_le', null).order('realisee_le'),
      sb.from('refections').select('*').in('fuite_id', lot).is('supprime_le', null).order('realisee_le'),
      sb.from('photos').select('id, fuite_id, type, chemin, stockage, prise_le, position').in('fuite_id', lot).is('supprime_le', null).order('prise_le'),
      peutMontants
        ? sb.from('v_quantites').select('id, fuite_id, prix_numero, prix_ordre, prix_designation, unite, quantite, pu_ht, montant_ht_bordereau, origine_ligne')
          .in('fuite_id', lot).order('prix_ordre')
        : Promise.resolve({ data: null, error: null }),
    ]);
    const erreur = f.error ?? rp.error ?? rf.error ?? ph.error;
    if (erreur) throw erreur;
    const reparations = (rp.data as (Reparation & Record<string, unknown>)[] | null) ?? [];
    const repIds = reparations.map((r) => r.id);
    const [ro, rpi] = repIds.length
      ? await Promise.all([
        sb.from('reparation_ouvriers').select('reparation_id, ouvrier_id').in('reparation_id', repIds),
        sb.from('reparation_pieces').select('reparation_id, piece_id, designation_libre, quantite').in('reparation_id', repIds).is('supprime_le', null).eq('etat', 'posee'),
      ])
      : [{ data: [] }, { data: [] }];
    const lignesOuvriers = (ro.data as { reparation_id: string; ouvrier_id: string }[] | null) ?? [];
    const lignesPieces = (rpi.data as { reparation_id: string; piece_id: string | null; designation_libre: string | null; quantite: number }[] | null) ?? [];
    const extra = new Map(((fx.data as { id: string; precision_gps_m: number | null; methode_detection: string | null }[] | null) ?? []).map((x) => [x.id, x]));
    const lignesFuites = new Map(((f.data as VFuite[] | null) ?? []).map((x) => [x.id, x]));

    for (const id of lot) {
      const fuite = lignesFuites.get(id);
      if (!fuite) continue;
      fiches.push({
        fuite: { ...fuite, precision_gps_m: extra.get(id)?.precision_gps_m ?? null, methode_detection: extra.get(id)?.methode_detection ?? null },
        reparations: reparations.filter((r) => r.fuite_id === id).map((r) => ({
          ...r,
          equipe: equipes.get(String(r.equipe_id))?.libelle ?? null,
          chef: profils.get(String(r.auteur_terrain_id))?.nom_complet ?? null,
          representant_srm: (r.representant_srm as string | null) ?? null,
          motif: motifs.get(String(r.motif_id))?.libelle_fr ?? null,
          motifAr: motifs.get(String(r.motif_id))?.libelle_ar ?? null,
          revetement: natures.get(String(r.nature_revetement_id))?.libelle_fr ?? null,
          ouvriers: lignesOuvriers.filter((o) => o.reparation_id === r.id).map((o) => ouvriers.get(o.ouvrier_id)?.nom_complet ?? '?'),
          pieces: lignesPieces.filter((p) => p.reparation_id === r.id).map((p) => ({
            designation: (p.piece_id ? pieces.get(p.piece_id)?.designation : null) ?? p.designation_libre ?? '?',
            quantite: Number(p.quantite),
            unite: (p.piece_id ? pieces.get(p.piece_id)?.unite : null) ?? 'u',
          })),
        })),
        refections: ((rf.data as (Refection & Record<string, unknown>)[] | null) ?? []).filter((r) => r.fuite_id === id).map((r) => ({
          ...r,
          nature: natures.get(String(r.nature_id))?.libelle_fr ?? null,
          natureAr: natures.get(String(r.nature_id))?.libelle_ar ?? null,
          motif: motifs.get(String(r.motif_id))?.libelle_fr ?? null,
          motifAr: motifs.get(String(r.motif_id))?.libelle_ar ?? null,
          equipe: equipes.get(String(r.equipe_id))?.libelle ?? null,
        })),
        photos: ((ph.data as (Omit<PhotoRapport, 'latitude' | 'longitude'> & { fuite_id: string; position: unknown })[] | null) ?? [])
          .filter((p) => p.fuite_id === id)
          .map(({ position, ...p }) => ({ ...p, latitude: lirePoint(position)?.latitude ?? null, longitude: lirePoint(position)?.longitude ?? null })),
        quantites: peutMontants ? ((q.data as (Quantite & { fuite_id: string })[] | null) ?? []).filter((l) => l.fuite_id === id) : null,
      });
    }
  }
  // Ordre demandé conservé
  const rang = new Map(ids.map((id, i) => [id, i]));
  return fiches.sort((a, b) => (rang.get(a.fuite.id) ?? 0) - (rang.get(b.fuite.id) ?? 0));
}

// Photo réduite en JPEG dans le navigateur.
interface ImagePhoto { octets: Uint8Array; largeur: number; hauteur: number }

async function reduirePhoto(url: string): Promise<ImagePhoto | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const bitmap = await createImageBitmap(await r.blob());
    const k = Math.min(1, PHOTO_COTE_PX / Math.max(bitmap.width, bitmap.height));
    const largeur = Math.round(bitmap.width * k);
    const hauteur = Math.round(bitmap.height * k);
    const toile = document.createElement('canvas');
    toile.width = largeur;
    toile.height = hauteur;
    const ctx = toile.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, largeur, hauteur);
    ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => toile.toBlob(ok, 'image/jpeg', PHOTO_QUALITE));
    if (!blob) return null;
    return { octets: new Uint8Array(await blob.arrayBuffer()), largeur, hauteur };
  } catch {
    return null;
  }
}

async function imagesDesPhotos(photos: PhotoRapport[], avancer: () => void): Promise<Map<string, ImagePhoto | null>> {
  const sortie = new Map<string, ImagePhoto | null>();
  if (!photos.length) return sortie;
  const urls = await urlsPhotos(photos, 600);
  // Trois téléchargements à la fois : rapide sans saturer une connexion mobile.
  for (const groupe of paquets(photos, 3)) {
    await Promise.all(groupe.map(async (p) => {
      const url = urls.get(p.id);
      sortie.set(p.id, url ? await reduirePhoto(url) : null);
      avancer();
    }));
  }
  return sortie;
}

// ---------------------------------------------------------------------------
// Mise en forme
// ---------------------------------------------------------------------------
const texteDateIso = (iso: string | null | undefined, heure = true) => (iso ? texteDate(new Date(iso), heure) : '—');
const nb = (n: number | null | undefined, dec = 2) => (n == null ? '—' : texteNombre(Number(n), dec));

// 34,681234 → 34°40'52,4"N
function dms(v: number, positif: string, negatif: string) {
  const a = Math.abs(v);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = ((a - d) * 60 - m) * 60;
  return `${d}°${String(m).padStart(2, '0')}'${s.toFixed(1).replace('.', ',').padStart(4, '0')}"${v >= 0 ? positif : negatif}`;
}

const coord = (lat: number | null, lon: number | null) =>
  lat == null || lon == null ? null : `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

const RESULTAT_REPARATION: Record<string, string> = { reparee: 'Réparée', en_cours: 'En cours / reste à finir', non_reparee: 'Non réparée' };

function travaux(r: Reparation): string {
  return [
    r.tuyau_repare && 'tuyau réparé', r.robinet_pec_change && 'robinet PEC changé', r.collier_pec_change && 'collier PEC changé',
    r.bouche_a_cle_mise_a_niveau && 'bouche à clé mise à niveau', r.element_remplace && 'élément remplacé',
  ].filter(Boolean).join(', ') || '—';
}

type Cellule = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };

// Tableau « libellé : valeur » sur deux paires par ligne ; une valeur longue prend toute la largeur.
function paires(champs: [string, string | null | undefined, boolean?][]): Cellule[][] {
  const lignes: Cellule[][] = [];
  let attente: Cellule[] | null = null;
  for (const [libelle, valeur, large] of champs) {
    if (valeur == null || valeur === '') continue;
    if (large) {
      if (attente) { lignes.push([...attente, '', '']); attente = null; }
      lignes.push([libelle, { content: valeur, colSpan: 3 }]);
    } else if (attente) {
      lignes.push([...attente, libelle, valeur]);
      attente = null;
    } else {
      attente = [libelle, valeur];
    }
  }
  if (attente) lignes.push([...attente, '', '']);
  return lignes;
}

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------
export async function genererRapports(fiches: FicheRapport[], ctx: Contexte, progres?: Progression): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }, { dessinerEntete, BLEU, GRIS_TRAIT, FOND_GROUPE }] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), import('./pdf'),
  ]);
  const marche = ctx.marche as unknown as Marche;
  const libelles = libellesMarche(marche);
  const genereLe = new Date();
  const totalPhotos = fiches.reduce((s, f) => s + f.photos.length, 0);
  const totalEtapes = totalPhotos + fiches.length;
  let fait = 0;
  const avancer = (etape: string) => progres?.(++fait, totalEtapes, etape);

  // Textes arabes (en-tête, natures et motifs) composés par le navigateur, comme pdf.ts.
  const enteteModele = construireEntete(ctx, '', []);
  const arabesEntete = [enteteModele.titulaireAr, enteteModele.clientAr].filter(contientArabe);
  const arabes = fiches.flatMap((f) => [
    f.fuite.motif_sans_reparation_ar,
    ...f.refections.flatMap((r) => [r.natureAr, r.motifAr]),
    ...f.reparations.map((r) => r.motifAr),
  ]).filter(contientArabe);
  const imagesEntete = arabesEntete.length ? await imagesTextes(arabesEntete, 10, true) : new Map<string, ImageTexte>();
  const imagesCellules = arabes.length ? await imagesTextes(arabes, TAILLE) : new Map<string, ImageTexte>();

  const pdf: Pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const largeur = pdf.internal.pageSize.getWidth();
  const hauteur = pdf.internal.pageSize.getHeight();
  const marge = 12;
  const utile = largeur - 2 * marge;
  const bas = hauteur - 14;
  const piedParPage = new Map<number, string>();
  const visas = ctx.regles?.visas?.filter((v) => v.trim()) ?? [];

  const titreSection = (titre: string, y: number, besoin = 25) => {
    if (y + besoin > bas) { pdf.addPage(); y = marge + 4; }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.setTextColor(...BLEU);
    pdf.text(titre, marge, y + 1);
    pdf.setTextColor(20, 35, 46);
    return y + 3.5;
  };

  const finTableau = () => (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const hooksArabe = {
    didParseCell: (data: { section: string; cell: { text: string[] | string; styles: { minCellHeight: number } } }) => {
      if (data.section !== 'body') return;
      const brut = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : String(data.cell.text ?? '');
      if (!contientArabe(brut)) return;
      (data.cell as unknown as { arabe: string }).arabe = brut;
      data.cell.text = [''];
      const img = imagesCellules.get(brut);
      if (img) data.cell.styles.minCellHeight = img.hauteurMm + 1;
    },
    didDrawCell: (data: { section: string; cell: { x: number; y: number; width: number; height: number } }) => {
      const arabe = (data.cell as unknown as { arabe?: string }).arabe;
      if (data.section !== 'body' || !arabe) return;
      const img = imagesCellules.get(arabe);
      if (!img) return;
      const k = Math.min(1, (data.cell.width - 2) / img.largeurMm);
      pdf.addImage(img.donnees, 'PNG', data.cell.x + data.cell.width - 1 - img.largeurMm * k,
        data.cell.y + (data.cell.height - img.hauteurMm * k) / 2, img.largeurMm * k, img.hauteurMm * k, img.alias, 'FAST');
    },
  };

  const styleTableau = {
    theme: 'grid' as const,
    margin: { left: marge, right: marge, top: marge + 4, bottom: 16 },
    styles: {
      font: 'helvetica', fontSize: TAILLE, cellPadding: 1.2, overflow: 'linebreak' as const,
      lineColor: GRIS_TRAIT, lineWidth: 0.1, textColor: [20, 35, 46] as [number, number, number], valign: 'middle' as const,
    },
    headStyles: { fillColor: BLEU, textColor: 255, fontStyle: 'bold' as const, halign: 'center' as const, fontSize: 7.5 },
  };

  const tableauPaires = (lignes: Cellule[][], y: number, liens?: Map<string, string>) => {
    autoTable(pdf, {
      ...styleTableau,
      startY: y,
      body: lignes as never,
      columnStyles: {
        0: { fontStyle: 'bold', fillColor: FOND_GROUPE, cellWidth: 36 },
        1: { cellWidth: utile / 2 - 36 },
        2: { fontStyle: 'bold', fillColor: FOND_GROUPE, cellWidth: 36 },
        3: { cellWidth: 'auto' },
      },
      didParseCell: (data) => {
        // Cellule de libellé vide (fin de ligne impaire) : sans fond.
        if ((data.column.index === 2) && !String(data.cell.raw ?? '')) data.cell.styles.fillColor = false as never;
        // Cellules liées (carte, itinéraire) : texte bleu
        const brut = data.cell.raw && typeof data.cell.raw === 'object' ? (data.cell.raw as { content: string }).content : data.cell.raw;
        if (data.section === 'body' && liens?.has(String(brut))) data.cell.styles.textColor = BLEU;
        hooksArabe.didParseCell(data as never);
      },
      didDrawCell: (data) => {
        hooksArabe.didDrawCell(data as never);
        const url = liens?.get(String(data.cell.raw && typeof data.cell.raw === 'object' ? (data.cell.raw as { content: string }).content : data.cell.raw));
        if (url && data.section === 'body') pdf.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
      },
    });
    return finTableau() + 5;
  };

  for (const [k, fiche] of fiches.entries()) {
    const f = fiche.fuite;
    if (k > 0) pdf.addPage();
    const premierePage = pdf.getNumberOfPages();
    const pied = `Rapport de la fuite N° ${f.numero}${marche.code ? ` · marché ${marche.code}` : ''}`;
    progres?.(fait, totalEtapes, `Fuite N° ${f.numero} : photos`);
    const images = await imagesDesPhotos(fiche.photos, () => avancer(`Fuite N° ${f.numero} : photos`));

    // En-tête du marché
    const entete = construireEntete(ctx, `Rapport de fuite N° ${f.numero}`, [
      [f.secteur && `Secteur : ${f.secteur}`, f.zone && `zone : ${f.zone}`].filter(Boolean).join(', '),
    ].filter(Boolean));
    let y = dessinerEntete(pdf, entete, imagesEntete, marge);

    // Identification
    y = titreSection('Identification', y);
    const lat = f.latitude;
    const lon = f.longitude;
    const position = coord(lat, lon);
    const lienCarte = position ? `https://www.google.com/maps?q=${lat},${lon}` : null;
    const liens = new Map<string, string>();
    const jalons = libelles.jalons;
    const textePosition = position && `${position} (${dms(lat!, 'N', 'S')}, ${dms(lon!, 'E', 'O')})`;
    if (textePosition && lienCarte) liens.set(textePosition, lienCarte);
    const itineraire = lienItineraire(lat, lon);
    const texteItineraire = 'Itinéraire vers la fuite (Google Maps) ›';
    if (itineraire) liens.set(texteItineraire, itineraire);
    y = tableauPaires(paires([
      ['N° de la fuite', String(f.numero)],
      [libelles.reference, f.reference_srm ?? '—'],
      ['Origine', f.origine === 'srm' ? `Signalée par ${libelles.sigle}` : 'Détection de l\'entreprise'],
      ['Statut', STATUTS[f.statut]?.libelle ?? f.statut],
      ['Détectée le', texteDateIso(f.date_detection)],
      ['Détectée par', f.detectee_par ?? '—'],
      ['Ouvrage', f.ouvrage ? OUVRAGES[f.ouvrage] ?? f.ouvrage : '—'],
      ['Visibilité', f.visibilite === 'visible' ? 'Visible' : f.visibilite === 'invisible' ? 'Invisible' : '—'],
      ['Méthode de détection', f.methode_detection, true],
      ['Zone', f.zone ?? '—'],
      ['Secteur', f.secteur ?? '—'],
      // Jalons du client : affichés si le marché les suit ou s'ils ont été saisis
      [`Communiquée à ${libelles.sigle}`, jalons || f.date_communication_srm ? texteDateIso(f.date_communication_srm) : null],
      ['Avis avant terrassement', jalons || f.avis_terrassement_srm_le ? texteDateIso(f.avis_terrassement_srm_le) : null],
      [`Validation ${libelles.sigle}`, f.validation_srm_le
        ? `${texteDateIso(f.validation_srm_le)}${f.validation_srm_par ? ` (${f.validation_srm_par})` : ''}`
        : jalons ? '—' : null, true],
      ['Adresse', f.adresse ?? '—', true],
      ['Coordonnées GPS (WGS84)', textePosition ?? 'Non relevées', true],
      ['Itinéraire', itineraire ? texteItineraire : null, true],
      ['Précision GPS', f.precision_gps_m != null ? `± ${nb(f.precision_gps_m, 0)} m` : '—'],
      ['Photos', String(fiche.photos.length)],
      ['Verrouillée le', f.verrouillee_le ? texteDateIso(f.verrouillee_le) : null],
      ['Motif sans réparation', f.motif_sans_reparation, !f.motif_sans_reparation_ar],
      ['Motif (arabe)', f.motif_sans_reparation ? f.motif_sans_reparation_ar : null],
      ['Observation', f.observation, true],
    ]), y, liens);

    // Réparations
    y = titreSection('Réparations', y);
    if (!fiche.reparations.length) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(TAILLE);
      pdf.text('Aucune réparation saisie.', marge, y + 2);
      y += 8;
    }
    fiche.reparations.forEach((r, i) => {
      if (y + 30 > bas) { pdf.addPage(); y = marge + 4; }
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(`${fiche.reparations.length > 1 ? `${i + 1}. ` : ''}${RESULTAT_REPARATION[r.resultat] ?? r.resultat} · ${texteDateIso(r.realisee_le)}`, marge, y + 1);
      y += 2.5;
      const fouille = r.fouille_longueur_m != null || r.volume_m3 != null
        ? `${nb(r.fouille_longueur_m)} × ${nb(r.fouille_largeur_m)} × ${nb(r.fouille_profondeur_m)} m = ${nb(r.volume_m3, 3)} m³`
        : null;
      y = tableauPaires(paires([
        ['Équipe', r.equipe ?? '—'],
        ['Chef d\'équipe', r.chef ?? '—'],
        ['Ouvrage', r.ouvrage ? OUVRAGES[r.ouvrage] ?? r.ouvrage : '—'],
        ['Matériau', r.materiau ? MATERIAUX[r.materiau] ?? r.materiau : '—'],
        ['Diamètre', r.diametre_mm ? `Ø ${r.diametre_mm} mm` : '—'],
        ['Longueur PE', r.longueur_pe_m != null ? `${nb(r.longueur_pe_m)} m` : null],
        ['Travaux', travaux(r), true],
        ['Fouille L × l × p', fouille ?? '—'],
        ['Emplacement', r.emplacement ? EMPLACEMENTS[r.emplacement] ?? r.emplacement : '—'],
        ['Revêtement', r.revetement],
        [`Représentant ${libelles.sigle}`, r.representant_srm],
        ['Motif', r.motif ? r.motif : null, !r.motifAr],
        ['Motif (arabe)', r.motifAr],
        ['Ouvriers', r.ouvriers.length ? r.ouvriers.join(', ') : null, true],
        ['Pièces posées', r.pieces.length ? r.pieces.map((p) => `${p.designation} : ${texteNombre(p.quantite, p.unite === 'u' ? 0 : 2)} ${p.unite}`).join(' ; ') : null, true],
        ['Observation', r.observation, true],
      ]), y);
    });

    // Réfections
    if (fiche.refections.length) {
      y = titreSection('Réfections', y);
      autoTable(pdf, {
        ...styleTableau,
        startY: y,
        head: [['Date', 'Résultat', 'Nature / motif', 'Nature / motif (arabe)', 'Dimensions', 'Équipe', 'Observation']],
        body: fiche.refections.map((r) => [
          texteDateIso(r.realisee_le),
          r.resultat === 'faite' ? 'Faite' : 'Non faite',
          r.resultat === 'faite' ? r.nature ?? '—' : r.motif ?? '—',
          (r.resultat === 'faite' ? r.natureAr : r.motifAr) ?? '',
          r.resultat === 'faite' ? `${nb(r.longueur_m)} × ${nb(r.largeur_m)} m = ${nb(r.surface_m2, 3)} m²` : '—',
          r.equipe ?? '—',
          r.observation ?? '',
        ]),
        columnStyles: { 0: { cellWidth: 'wrap' }, 1: { cellWidth: 'wrap' }, 4: { cellWidth: 'wrap' } },
        didParseCell: (data) => hooksArabe.didParseCell(data as never),
        didDrawCell: (data) => hooksArabe.didDrawCell(data as never),
      });
      y = finTableau() + 5;
    }

    // Quantités du bordereau (droit « quantités / lire » seulement)
    if (fiche.quantites?.length) {
      y = titreSection('Quantités et prix du bordereau', y);
      const total = fiche.quantites.reduce((s, l) => s + (Number(l.montant_ht_bordereau) || 0), 0);
      const dec = (u: string) => ctx.regles?.decimales?.[u] ?? (u === 'm3' ? 3 : u === 'u' ? 0 : 2);
      autoTable(pdf, {
        ...styleTableau,
        startY: y,
        head: [['Prix', 'Désignation', 'Unité', 'Quantité', 'PU HT', 'Montant HT']],
        body: [
          ...fiche.quantites.map((l) => [
            l.prix_numero, l.prix_designation, l.unite, texteNombre(Number(l.quantite), dec(l.unite)),
            l.pu_ht == null ? '' : texteNombre(Number(l.pu_ht), 2), l.montant_ht_bordereau == null ? '' : texteNombre(Number(l.montant_ht_bordereau), 2),
          ]),
          [{ content: `Total HT aux prix du bordereau (${libelles.devise})${marche.taux_majoration ? `, hors majoration de ${marche.taux_majoration} %` : ''}`, colSpan: 5, styles: { fontStyle: 'bold', fillColor: [242, 242, 242] } },
            { content: texteNombre(total, 2), styles: { fontStyle: 'bold', fillColor: [242, 242, 242] } }],
        ] as never,
        columnStyles: {
          0: { cellWidth: 'wrap', halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 'wrap', halign: 'center' },
          3: { cellWidth: 'wrap', halign: 'right' }, 4: { cellWidth: 'wrap', halign: 'right' }, 5: { cellWidth: 'wrap', halign: 'right' },
        },
      });
      y = finTableau() + 5;
    }

    // Photos : grille continue, groupées par type (détection, avant, pendant, après, réfection)
    if (fiche.photos.length) {
      const ecart = 4;
      const lCase = (utile - ecart * (PHOTOS_PAR_LIGNE - 1)) / PHOTOS_PAR_LIGNE;
      const hImage = lCase * 0.75;
      const hCase = hImage + 8;
      const rang = (t: string) => (ORDRE_PHOTOS.includes(t) ? ORDRE_PHOTOS.indexOf(t) : ORDRE_PHOTOS.length);
      const triees = [...fiche.photos].sort((a, b) => rang(a.type) - rang(b.type) || a.prise_le.localeCompare(b.prise_le));
      const resume = ORDRE_PHOTOS.concat(triees.map((p) => p.type))
        .filter((t, i, tous) => tous.indexOf(t) === i)
        .map((t) => [TYPES_PHOTO[t] ?? t, triees.filter((p) => p.type === t).length] as const)
        .filter(([, n]) => n > 0).map(([t, n]) => `${t.toLowerCase()} ${n}`).join(', ');
      y = titreSection(`Photos (${fiche.photos.length} : ${resume})`, y, hCase + 8);
      y += 1;
      triees.forEach((p, i) => {
        const col = i % PHOTOS_PAR_LIGNE;
        if (col === 0 && i > 0) y += hCase + 3;
        if (col === 0 && y + hCase > bas) { pdf.addPage(); y = marge + 4; }
        const x = marge + col * (lCase + ecart);
        const img = images.get(p.id);
        pdf.setDrawColor(...GRIS_TRAIT);
        pdf.setLineWidth(0.1);
        pdf.rect(x, y, lCase, hImage);
        if (img) {
          const k = Math.min(lCase / img.largeur, hImage / img.hauteur);
          const l = img.largeur * k;
          const h = img.hauteur * k;
          pdf.addImage(img.octets, 'JPEG', x + (lCase - l) / 2, y + (hImage - h) / 2, l, h, `photo-${p.id}`, 'NONE');
        } else {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(8);
          pdf.text('Photo indisponible', x + lCase / 2, y + hImage / 2, { align: 'center' });
        }
        pdf.setFontSize(7);
        pdf.setTextColor(20, 35, 46);
        pdf.setFont('helvetica', 'bold');
        const type = TYPES_PHOTO[p.type] ?? p.type;
        const lType = pdf.getTextWidth(type);
        pdf.text(type, x, y + hImage + 3.2);
        pdf.setFont('helvetica', 'normal');
        pdf.text(` · ${texteDateIso(p.prise_le)}`, x + lType, y + hImage + 3.2);
        pdf.setTextColor(91, 107, 119);
        pdf.text(coord(p.latitude, p.longitude) ?? (position ? `Position de la fuite : ${position}` : 'Sans coordonnées'), x, y + hImage + 6.4);
        pdf.setTextColor(20, 35, 46);
      });
      y += hCase + 5;
    }

    // Visas (règles d'attachement du marché)
    if (visas.length) {
      const hVisa = 26;
      if (y + hVisa + 2 > bas) { pdf.addPage(); y = marge + 4; }
      const l = utile / visas.length;
      pdf.setDrawColor(...GRIS_TRAIT);
      pdf.setLineWidth(0.2);
      visas.forEach((v, i) => {
        const x = marge + i * l;
        pdf.rect(x + 1, y, l - 2, hVisa);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.text(pdf.splitTextToSize(v, l - 6), x + l / 2, y + 5, { align: 'center' });
      });
    }

    for (let p = premierePage; p <= pdf.getNumberOfPages(); p++) piedParPage.set(p, pied);
    avancer(`Fuite N° ${f.numero}`);
  }

  // Pied de chaque page : fuite, date d'édition, page n / N
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(91, 107, 119);
    pdf.text(`${piedParPage.get(p) ?? ''} · édité le ${texteDate(genereLe, true)}`, marge, hauteur - 6);
    pdf.text(`Page ${p} / ${total}`, largeur - marge, hauteur - 6, { align: 'right' });
  }
  return pdf.output('blob');
}

// Charge, fabrique et télécharge. Renvoie poids et durée (affichés à l'écran).
export async function telechargerRapports(
  ids: string[], marcheId: string, peutMontants: boolean, progres?: Progression,
): Promise<{ octets: number; secondes: number; fuites: number }> {
  const debut = performance.now();
  progres?.(0, 1, 'Chargement des données');
  const [ctx, fiches] = await Promise.all([
    chargerContexteRapport(marcheId, peutMontants),
    chargerFiches(ids, marcheId, peutMontants),
  ]);
  if (!fiches.length) throw new Error('Aucune fuite à imprimer.');
  const blob = await genererRapports(fiches, ctx, progres);
  const code = String(ctx.marche.code ?? '');
  const date = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' });
  const nom = fiches.length === 1
    ? `rapport-fuite-${fiches[0].fuite.numero}-${code}`
    : `rapports-fuites-${code}-${fiches.length}`;
  telecharger(blob, `${nomFichierSur(nom)}-${date}.pdf`);
  return { octets: blob.size, secondes: (performance.now() - debut) / 1000, fuites: fiches.length };
}
