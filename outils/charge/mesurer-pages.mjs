// Essai de charge : rejoue contre PostgREST (base LOCALE) les lectures que fait chaque page du panneau web,
// avec la pagination de lireTout (1 000 lignes par appel), et mesure durée, volume JSON et lignes.
//
//   PGRST_URL=http://127.0.0.1:54331 PGRST_JWT_SECRET=… UID_ESSAI=<profil> node outils/charge/mesurer-pages.mjs [avant|apres]
//
// « avant » : requêtes du code avant l'essai de charge ; « apres » : requêtes corrigées. Jamais la production :
// le script refuse toute adresse autre que 127.0.0.1 / localhost.
import { createHmac } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const URL_BASE = process.env.PGRST_URL ?? 'http://127.0.0.1:54331';
const SECRET = process.env.PGRST_JWT_SECRET;
const UID = process.env.UID_ESSAI ?? 'c0000000-0000-4000-8000-000000000007';
const MARCHE = process.env.MARCHE ?? 'de000000-0000-4000-8000-000000000000';
const VERSION = process.argv[2] ?? 'avant';
const REPETITIONS = Number(process.env.REPETITIONS ?? 3);

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_BASE)) throw new Error('Adresse locale exigée (127.0.0.1 ou localhost)');
if (!SECRET) throw new Error('PGRST_JWT_SECRET manquant (secret de la configuration PostgREST locale)');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const entete = b64({ alg: 'HS256', typ: 'JWT' });
const corps = b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
const JETON = `${entete}.${corps}.${createHmac('sha256', SECRET).update(`${entete}.${corps}`).digest('base64url')}`;

const COLONNES_TDB = 'id, numero, statut, zone_id, zone, secteur_id, secteur, date_detection, derniere_reparation_le, derniere_refection_le, '
  + 'emplacement_fouille, nb_photos, alerte_non_reparee, alerte_communication_srm, alerte_refection_chaussee, '
  + 'refection_chaussee_hors_delai, alerte_refection_trottoir, alerte_sans_photo';
const COLONNES_CARTE = 'id, numero, reference_srm, origine, statut, zone, secteur_id, secteur, adresse, latitude, longitude, date_detection, '
  + 'alerte_non_reparee, alerte_communication_srm, alerte_refection_chaussee, refection_chaussee_hors_delai, alerte_refection_trottoir';
const COLONNES_LISTE = 'id, numero, reference_srm, origine, statut, zone, secteur_id, secteur, adresse, latitude, longitude, date_detection, '
  + 'derniere_reparation_le, derniere_refection_le, emplacement_fouille, nb_photos, verrouillee_le, detectee_par, '
  + 'alerte_non_reparee, alerte_communication_srm, alerte_refection_chaussee, refection_chaussee_hors_delai, '
  + 'alerte_refection_trottoir, alerte_sans_photo';
const COLONNES_ALERTES = `${COLONNES_LISTE}, date_communication_srm, validation_srm_le, avis_terrassement_srm_le, observation`;
// Même filtre que filtreAlertes (web/src/lib/colonnes-fuites.ts) : alertes et lignes des courbes des 14 jours
const depuis = `"${new Date(Date.now() - 15 * 864e5).toISOString()}"`;
const FILTRE_ALERTES = 'or=(alerte_non_reparee.is.true,alerte_communication_srm.is.true,alerte_refection_chaussee.is.true,'
  + 'refection_chaussee_hors_delai.is.true,alerte_refection_trottoir.is.true,alerte_sans_photo.is.true,'
  + `derniere_reparation_le.is.null,derniere_reparation_le.gte.${depuis},statut.eq.reparee,derniere_refection_le.gte.${depuis})`;

async function appel(chemin, { methode = 'GET', corps: donnees, de, a } = {}) {
  const t0 = performance.now();
  const r = await fetch(`${URL_BASE}/${chemin}`, {
    method: methode,
    headers: {
      authorization: `Bearer ${JETON}`, accept: 'application/json', 'content-type': 'application/json',
      ...(de != null ? { range: `${de}-${a}`, 'range-unit': 'items' } : {}),
    },
    body: donnees ? JSON.stringify(donnees) : undefined,
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${texte.slice(0, 200)}`);
  const json = JSON.parse(texte);
  return { ms: performance.now() - t0, octets: Buffer.byteLength(texte), gzip: gzipSync(texte).length, lignes: Array.isArray(json) ? json.length : 1, json };
}

// Pagination de lireTout : pages de 1 000 jusqu'à une page incomplète ou au plafond ; « avant » : une page
// après l'autre ; « apres » : après une première page pleine, les suivantes 3 par 3 (lireTout corrigé).
async function lireTout(chemin, maximum = 50000) {
  const parallele = VERSION === 'apres' ? 3 : 1;
  let octets = 0, gzip = 0, lignes = 0, appels = 0, fini = false;
  const t0 = performance.now();
  const lire = async (de) => {
    const r = await appel(chemin, { de, a: de + 999 });
    octets += r.octets; gzip += r.gzip; lignes += r.lignes; appels++;
    return r.lignes;
  };
  let de = 0;
  if ((await lire(0)) < 1000) fini = true;
  de = 1000;
  while (!fini && de < maximum) {
    const lots = [];
    for (let i = 0; i < parallele && de < maximum; i++, de += 1000) lots.push(lire(de));
    if ((await Promise.all(lots)).some((n) => n < 1000)) fini = true;
  }
  return { ms: performance.now() - t0, octets, gzip, lignes, appels, tronque: !fini };
}
const unique = async (chemin, options) => {
  const r = await appel(chemin, options);
  return { ms: r.ms, octets: r.octets, gzip: r.gzip, lignes: r.lignes, appels: 1, tronque: false, json: r.json };
};
const rpc = (fonction, args) => unique(`rpc/${fonction}`, { methode: 'POST', corps: args });

// Plusieurs lectures en parallèle (Promise.all de la page) : durée = la plus longue.
async function page(lectures) {
  const t0 = performance.now();
  const res = await Promise.all(lectures.map(([nom, f]) => f().then((r) => ({ nom, ...r }))));
  return { ms: performance.now() - t0, res };
}

const m = `marche_id=eq.${MARCHE}`;
const PAGES = {
  avant: {
    fuites: () => [
      ['v_fuites *', () => lireTout(`v_fuites?select=*&${m}&order=numero.desc`, 10000)],
      ['secteurs', () => unique(`secteurs?select=id,zone_id,code,libelle&${m}&order=libelle`)],
    ],
    alertes: () => [['v_fuites *', () => lireTout(`v_fuites?select=*&${m}&order=numero`, 10000)]],
    'a-faire': () => [['v_fuites *', () => lireTout(`v_fuites?select=*&${m}&order=numero`, 10000)]],
    'tableau-de-bord': () => [
      ['v_fuites (tdb)', () => lireTout(`v_fuites?select=${COLONNES_TDB},reference_srm,adresse,detectee_par&${m}&order=numero`)],
      ['v_anomalies', () => lireTout(`v_anomalies?select=fuite_id,anomalie&${m}&order=fuite_id,anomalie,reparation_id.nullsfirst`)],
      ['attachements', () => unique(`attachements?select=id,numero,statut,date_arret&${m}&supprime_le=is.null`)],
      ['prix', () => unique(`prix?select=id,numero,ordre,designation,unite,quantite_marche,pu_ht,hors_bordereau,actif&${m}`)],
      ['v_attachement_lignes', () => lireTout(`v_attachement_lignes?select=prix_id,quantite,pu_ht&${m}&attachement_statut=eq.arrete&order=id`)],
      ['v_a_attacher', () => lireTout(`v_a_attacher?select=fuite_id,prix_id,reste,brouillon_id&${m}&reste=neq.0&order=fuite_id,prix_id`)],
    ],
    marches: () => [
      ['marches', () => unique('marches?select=id,code,numero,intitule,client,ville,date_commencement,actif&order=code')],
      ['profils', () => unique('profils?select=id,identifiant,nom_complet,telephone,langue,est_admin,actif&order=nom_complet')],
      ['affectations', () => unique('affectations?select=id,profil_id,marche_id,roles,actif')],
      ['v_fuites statuts', () => lireTout('v_fuites?select=marche_id,statut&order=numero')],
    ],
    carte: () => [
      ['v_fuites (carte)', () => lireTout(`v_fuites?select=${COLONNES_CARTE}&${m}&order=numero`)],
      ['secteurs + geom', () => unique(`secteurs?select=id,zone_id,code,libelle,geom&${m}&actif=is.true&order=libelle`)],
      ['zones + geom', () => unique(`zones?select=id,code,libelle,geom&${m}&actif=is.true&order=numero`)],
      ['etat_balayage', () => rpc('etat_balayage', { p_marche: MARCHE })],
    ],
  },
  apres: {
    fuites: () => [
      ['v_fuites (liste)', () => lireTout(`v_fuites?select=${COLONNES_LISTE}&${m}&order=numero.desc`, 10000)],
      ['secteurs', () => unique(`secteurs?select=id,zone_id,code,libelle&${m}&order=libelle`)],
      ['compter_fuites', () => rpc('compter_fuites', { p_marche: MARCHE })],
    ],
    alertes: () => [['v_fuites alertes + courbes', () => lireTout(`v_fuites?select=${COLONNES_ALERTES}&${m}&${FILTRE_ALERTES}&order=numero.desc`, 10000)]],
    'a-faire': () => [['v_fuites (liste)', () => lireTout(`v_fuites?select=${COLONNES_LISTE}&${m}&order=numero.desc`, 10000)]],
    'tableau-de-bord': () => [
      ['v_fuites (tdb)', () => lireTout(`v_fuites?select=${COLONNES_TDB}&${m}&order=numero.desc`)],
      ['v_fuites 10 dernières', () => unique(`v_fuites?select=${COLONNES_TDB},reference_srm,adresse,detectee_par&${m}&order=date_detection.desc&limit=10`)],
      ['v_anomalies', () => lireTout(`v_anomalies?select=fuite_id,anomalie&${m}&order=fuite_id,anomalie,reparation_id.nullsfirst`)],
      ['attachements', () => unique(`attachements?select=id,numero,statut,date_arret&${m}&supprime_le=is.null`)],
      ['prix', () => unique(`prix?select=id,numero,ordre,designation,unite,quantite_marche,pu_ht,hors_bordereau,actif&${m}`)],
      ['v_attachement_lignes', () => lireTout(`v_attachement_lignes?select=prix_id,quantite,pu_ht&${m}&attachement_statut=eq.arrete&order=id`)],
      ['resume_a_attacher', () => rpc('resume_a_attacher', { p_marche: MARCHE })],
    ],
    marches: () => [
      ['marches', () => unique('marches?select=id,code,numero,intitule,client,ville,date_commencement,actif&order=code')],
      ['profils', () => unique('profils?select=id,identifiant,nom_complet,telephone,langue,est_admin,actif&order=nom_complet')],
      ['affectations', () => unique('affectations?select=id,profil_id,marche_id,roles,actif')],
      ['compter_fuites (tous)', () => rpc('compter_fuites', {})],
    ],
    carte: () => [
      ['v_fuites (carte)', () => lireTout(`v_fuites?select=${COLONNES_CARTE}&${m}&order=numero.desc`)],
      ['secteurs + geom', () => unique(`secteurs?select=id,zone_id,code,libelle,geom&${m}&actif=is.true&order=libelle`)],
      ['zones + geom', () => unique(`zones?select=id,code,libelle,geom&${m}&actif=is.true&order=numero`)],
      ['etat_balayage_compact', () => rpc('etat_balayage_compact', { p_marche: MARCHE })],
    ],
  },
};

// Réseau de la carte : un appel reseau_geojson par secteur (3 à la fois), comme useReseau.
async function reseauParSecteur() {
  const { json: secteurs } = await unique(`secteurs?select=id&${m}&actif=is.true`);
  const t0 = performance.now();
  let octets = 0, gzip = 0, lignes = 0;
  const file = [...secteurs.map((s) => s.id), null];
  const ouvrier = async () => {
    while (file.length) {
      const id = file.shift();
      const r = await rpc('reseau_geojson', { p_marche: MARCHE, p_secteurs: id ? [id] : [], p_sans_secteur: !id, p_tolerance: 0 });
      octets += r.octets; gzip += r.gzip; lignes += r.json.features.length;
    }
  };
  await Promise.all([ouvrier(), ouvrier(), ouvrier()]);
  const tn = performance.now();
  let octetsN = 0, gzipN = 0, nbN = 0;
  for (const s of secteurs) {
    const r = await rpc('noeuds_geojson', { p_marche: MARCHE, p_secteurs: [s.id], p_sans_secteur: false });
    octetsN += r.octets; gzipN += r.gzip; nbN += r.json.features.length;
  }
  return { troncons: { ms: tn - t0, octets, gzip, lignes }, noeuds: { ms: performance.now() - tn, octets: octetsN, gzip: gzipN, lignes: nbN } };
}

const ko = (o) => `${(o / 1024).toFixed(0)} Ko`;
const pages = PAGES[VERSION];
if (!pages) throw new Error(`Version inconnue : ${VERSION}`);
console.log(`Version ${VERSION}, compte ${UID}, ${REPETITIONS} passages (médiane)\n`);
console.log('| Page | Durée | Volume JSON | Compressé (gzip) | Lignes | Appels | Détail |');
console.log('|---|---:|---:|---:|---:|---:|---|');
for (const [nom, lectures] of Object.entries(pages)) {
  const essais = [];
  for (let i = 0; i < REPETITIONS; i++) essais.push(await page(lectures()));
  essais.sort((x, y) => x.ms - y.ms);
  const med = essais[Math.floor(essais.length / 2)];
  const octets = med.res.reduce((s, r) => s + r.octets, 0);
  const gzip = med.res.reduce((s, r) => s + r.gzip, 0);
  const lignes = med.res.reduce((s, r) => s + r.lignes, 0);
  const appels = med.res.reduce((s, r) => s + r.appels, 0);
  const detail = med.res.map((r) => `${r.nom} ${r.ms.toFixed(0)} ms / ${ko(r.octets)} / ${r.lignes}${r.lignes === 1000 && r.appels === 1 ? ' ⚠ tronqué à 1 000' : ''}${r.tronque ? ' ⚠ plafond' : ''}`).join(' ; ');
  console.log(`| ${nom} | ${med.ms.toFixed(0)} ms | ${ko(octets)} | ${ko(gzip)} | ${lignes} | ${appels} | ${detail} |`);
}
if (process.env.RESEAU !== '0') {
  const r = await reseauParSecteur();
  console.log(`| carte : réseau (35 appels) | ${r.troncons.ms.toFixed(0)} ms | ${ko(r.troncons.octets)} | ${ko(r.troncons.gzip)} | ${r.troncons.lignes} tronçons | 35 | reseau_geojson par secteur, 3 en parallèle |`);
  console.log(`| carte : nœuds (zoom ≥ 15) | ${r.noeuds.ms.toFixed(0)} ms | ${ko(r.noeuds.octets)} | ${ko(r.noeuds.gzip)} | ${r.noeuds.lignes} nœuds | 34 | noeuds_geojson par secteur |`);
}
