// Vérification de l'envoi par e-mail (src/lib/email.ts, S18), sans navigateur, base ni fournisseur :
// adresses, limites, textes proposés, courriel construit (copie cachée et réponses vers contact@stepag.ma, HTML
// échappé), traitement complet d'une demande avec une base et un fournisseur factices (aucun envoi réel).
// Usage (dans web/) : node scripts/verifier-email.mjs (Node 22.18 ou plus).
import assert from 'node:assert/strict';

const e = await import('../src/lib/email.ts');
let n = 0;
const ok = async (nom, f) => { await f(); n++; console.log(`ok ${n} - ${nom}`); };

const MARCHE = 'aaaaaaaa-0000-0000-0000-000000000001';
const pdf = (octets = 2048, nom = 'rapport-fuite-12.pdf') => ({
  nom, octets, type: 'application/pdf', contenu: async () => new TextEncoder().encode('%PDF-1.4 essai').buffer,
});
const brute = (x = {}) => ({
  marche_id: MARCHE, document: 'rapport_fuite', reference: 'Fuite N° 12', destinataires: JSON.stringify(['suivi@srm.exemple.ma']),
  objet: 'Rapport de fuite — Fuite N° 12', message: 'Bonjour,\nCi-joint.', piece: pdf(), ...x,
});

// Base et fournisseur factices : chaque appel est noté.
function factices({ reserver, envoyer, configure = true } = {}) {
  const appels = { reserver: [], terminer: [], envoyer: [] };
  return {
    appels,
    deps: {
      configure,
      expediteur: 'STEPAG <contact@stepag.ma>',
      copie: 'contact@stepag.ma',
      reserver: async (d) => { appels.reserver.push(d); return reserver ? reserver(d) : { id: 'envoi-1' }; },
      terminer: async (...a) => { appels.terminer.push(a); },
      contexte: async () => ({ envoyePar: 'Responsable <SRM>', marche: 'SRM-4500004453' }),
      envoyer: async (c, cle) => { appels.envoyer.push({ c, cle }); return envoyer ? envoyer(c) : { id: 're_essai_1' }; },
      base64: (b) => Buffer.from(b).toString('base64'),
    },
  };
}

await ok('adresses : valides, invalides, découpage d\'une saisie libre', () => {
  assert.equal(e.adresseValide('suivi.fuites@srm-oriental.ma'), true);
  assert.equal(e.adresseValide("o'neil@exemple.co.ma"), true);
  for (const a of ['pas-une-adresse', 'a@b', 'a b@c.ma', '@srm.ma', 'x@.ma']) assert.equal(e.adresseValide(a), false, a);
  assert.deepEqual(e.decouperAdresses('A@Srm.ma; b@srm.ma,\n a@srm.ma  faux'), { valides: ['a@srm.ma', 'b@srm.ma'], invalides: ['faux'] });
});

await ok('textes proposés : objet et message selon le document, la référence et le marché', () => {
  assert.equal(e.objetParDefaut({ document: 'rapport_fuite', reference: 'Fuite N° 12', marche: 'SRM-4500004453' }),
    'Rapport de fuite — Fuite N° 12 — SRM-4500004453');
  assert.equal(e.objetParDefaut({ document: 'carte' }), 'Carte');
  assert.match(e.messageParDefaut({ document: 'pv_debits', reference: 'Qi zone 1', marche: 'SRM' }),
    /ci-joint le procès-verbal de mesures de débit de nuit \(Qi zone 1\) du marché SRM\./);
  assert.ok(e.objetParDefaut({ document: 'rapport', reference: 'x'.repeat(300) }).length <= e.LONGUEUR_OBJET);
});

await ok('demande : champs obligatoires, 10 destinataires au plus, adresses normalisées', () => {
  assert.ok('demande' in e.verifierDemande(brute()));
  assert.equal(e.verifierDemande(brute({ marche_id: 'x' })).refus.statut, 400);
  assert.equal(e.verifierDemande(brute({ document: 'facture' })).refus.erreur, 'Document inconnu.');
  assert.equal(e.verifierDemande(brute({ destinataires: '[]' })).refus.erreur, 'Aucun destinataire.');
  assert.equal(e.verifierDemande(brute({ destinataires: '{' })).refus.erreur, 'Destinataires illisibles.');
  const onze = JSON.stringify(Array.from({ length: 11 }, (_, i) => `a${i}@srm.ma`));
  assert.match(e.verifierDemande(brute({ destinataires: onze })).refus.erreur, /10 destinataires/);
  assert.match(e.verifierDemande(brute({ destinataires: '["faux"]' })).refus.erreur, /Adresse invalide : faux/);
  assert.equal(e.verifierDemande(brute({ objet: '   ' })).refus.erreur, 'Objet obligatoire.');
  const d = e.verifierDemande(brute({ destinataires: JSON.stringify(['A@srm.ma ', 'a@srm.ma', 'b@srm.ma']), reference: '  ' })).demande;
  assert.deepEqual(d.destinataires, ['a@srm.ma', 'b@srm.ma']);
  assert.equal(d.reference, null);
});

await ok('pièce jointe : PDF, Excel, Word ou CSV, 4 Mo au plus (413 au-delà)', () => {
  assert.equal(e.verifierDemande(brute({ piece: null })).refus.erreur, 'Pièce jointe manquante.');
  assert.match(e.verifierDemande(brute({ piece: pdf(100, 'photo.exe') })).refus.erreur, /PDF, Excel, Word ou CSV/);
  for (const nom of ['a.pdf', 'b.XLSX', 'c.docx', 'd.csv']) assert.ok('demande' in e.verifierDemande(brute({ piece: pdf(100, nom) })), nom);
  assert.ok('demande' in e.verifierDemande(brute({ piece: pdf(e.TAILLE_MAX_PIECE) })));
  const trop = e.verifierDemande(brute({ piece: pdf(e.TAILLE_MAX_PIECE + 1) })).refus;
  assert.equal(trop.statut, 413);
  assert.match(trop.erreur, /4,0 Mo au plus/);
});

await ok('courriel : expéditeur, réponses et copie cachée vers contact@stepag.ma, pièce en base64, HTML échappé', async () => {
  const d = e.verifierDemande(brute({ message: 'Voir <script>alert(1)</script>\n& merci' })).demande;
  const c = e.construireCourriel({
    expediteur: 'STEPAG <contact@stepag.ma>', copie: 'contact@stepag.ma', demande: d,
    contenuBase64: Buffer.from(await d.piece.contenu()).toString('base64'), envoyePar: 'Resp. <1>', marche: 'SRM',
  });
  assert.equal(c.from, 'STEPAG <contact@stepag.ma>');
  assert.deepEqual(c.to, ['suivi@srm.exemple.ma']);
  assert.deepEqual(c.bcc, ['contact@stepag.ma']);
  assert.equal(c.reply_to, 'contact@stepag.ma');
  assert.equal(c.attachments[0].filename, 'rapport-fuite-12.pdf');
  assert.equal(c.attachments[0].content_type, 'application/pdf');
  assert.equal(Buffer.from(c.attachments[0].content, 'base64').toString(), '%PDF-1.4 essai');
  assert.ok(!c.html.includes('<script>'));
  assert.ok(c.html.includes('&lt;script&gt;') && c.html.includes('&amp; merci') && c.html.includes('Resp. &lt;1&gt;'));
  assert.match(c.text, /Envoyé par Resp\. <1> depuis le suivi des fuites \(marché SRM\)\./);
  assert.match(c.text, /Pour répondre : contact@stepag\.ma/);
  const d2 = e.verifierDemande(brute({ destinataires: '["contact@stepag.ma"]' })).demande;
  assert.deepEqual(e.construireCourriel({ expediteur: 'x', copie: 'STEPAG <contact@stepag.ma>', demande: d2, contenuBase64: '' }).bcc, [],
    'pas de copie cachée en double quand la boîte est déjà destinataire');
});

await ok('traitement : sans session 401, fournisseur non configuré 503, rien de réservé ni envoyé', async () => {
  let f = factices();
  assert.equal((await e.traiterEnvoi(null, brute(), f.deps)).statut, 401);
  f = factices({ configure: false });
  assert.equal((await e.traiterEnvoi('jeton', brute(), f.deps)).statut, 503);
  assert.equal(f.appels.reserver.length + f.appels.envoyer.length, 0);
});

await ok('traitement : envoi réussi, journal terminé « envoye » avec l\'identifiant du fournisseur', async () => {
  const f = factices();
  const r = await e.traiterEnvoi('jeton', brute(), f.deps);
  assert.deepEqual(r, { statut: 200, id: 'envoi-1', fournisseurId: 're_essai_1' });
  assert.equal(f.appels.envoyer.length, 1);
  assert.equal(f.appels.envoyer[0].cle, 'envoi-1', 'clé d\'idempotence = identifiant du journal');
  assert.deepEqual(f.appels.terminer, [['envoi-1', 'envoye', 're_essai_1', null]]);
});

await ok('traitement : refus de la base traduits (403, 429, 400, 401, 503), rien n\'est envoyé', async () => {
  const cas = [
    [{ code: '42501', message: 'Envoi par e-mail réservé au responsable du marché et à l\'administrateur' }, 403],
    [{ code: '23514', message: 'Limite du jour atteinte pour ce marché (20 envois)' }, 429],
    [{ code: '23514', message: 'new row violates check constraint "envois_email_document_check"' }, 400],
    [{ code: '22023', message: 'Adresse e-mail invalide' }, 400],
    [{ code: 'PGRST301', message: 'JWT expired' }, 401],
    [{ code: 'PGRST202', message: 'Could not find the function' }, 503],
  ];
  for (const [erreur, statut] of cas) {
    const f = factices({ reserver: async () => ({ erreur }) });
    const r = await e.traiterEnvoi('jeton', brute(), f.deps);
    assert.equal(r.statut, statut, erreur.message);
    assert.equal(f.appels.envoyer.length, 0);
    assert.equal(f.appels.terminer.length, 0);
  }
});

await ok('traitement : refus ou panne du fournisseur → 502 et journal « echec » (ne compte pas dans la limite)', async () => {
  let f = factices({ envoyer: async () => ({ erreur: '403 The stepag.ma domain is not verified' }) });
  let r = await e.traiterEnvoi('jeton', brute(), f.deps);
  assert.equal(r.statut, 502);
  assert.match(r.erreur, /domain is not verified/);
  assert.deepEqual(f.appels.terminer, [['envoi-1', 'echec', null, '403 The stepag.ma domain is not verified']]);
  f = factices({ envoyer: async () => { throw new Error('délai dépassé'); } });
  r = await e.traiterEnvoi('jeton', brute(), f.deps);
  assert.equal(r.statut, 502);
  assert.equal(f.appels.terminer[0][1], 'echec');
});

console.log(`1..${n}`);
