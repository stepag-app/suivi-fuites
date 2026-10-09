'use client';

import { useState, type FormEvent } from 'react';
import { messageErreur } from '@/lib/format';
import { getSupabase } from '@/lib/supabase';

export interface ArticleChoix { id: string; numero: string; designation: string; unite: string; famille: string; actif: boolean }

type Props = {
  articles: ArticleChoix[]; marcheId: string; lotId: string;
  annuler: () => void; fini: () => void; onErreur: (m: string) => void;
};

const enNombre = (t: string) => Number(t.replace(/\s/g, '').replace(',', '.'));
const valide = (t: string, positif = true) => t.trim() !== '' && !Number.isNaN(enNombre(t)) && (!positif || enNombre(t) > 0);

function ChoixArticle({ articles, valeur, maj }: { articles: ArticleChoix[]; valeur: string; maj: (v: string) => void }) {
  return (
    <label>
      Article
      <select value={valeur} onChange={(e) => maj(e.target.value)} required>
        <option value="">—</option>
        {articles.filter((a) => a.actif).map((a) => (
          <option key={a.id} value={a.id}>Prix {a.numero} ({a.unite}) · {a.designation.slice(0, 60)}</option>
        ))}
      </select>
    </label>
  );
}

async function inserer(ligne: Record<string, unknown>, fini: () => void, onErreur: (m: string) => void) {
  const { error } = await getSupabase().from('attachement_lignes').insert(ligne);
  if (error) onErreur(messageErreur(error));
  else fini();
}

// Ligne sans fuite : balayage ou maintien (en attendant le plan du réseau), autre prestation.
export function FormLigneLibre({ articles, marcheId, lotId, annuler, fini, onErreur }: Props) {
  const [prixId, setPrixId] = useState('');
  const [qte, setQte] = useState('');
  const [designation, setDesignation] = useState('');
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    inserer({ marche_id: marcheId, attachement_id: lotId, nature: 'libre', prix_id: prixId, quantite: enNombre(qte), designation: designation.trim() }, fini, onErreur);
  };
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <p className="discret">Ex. balayage d&apos;un secteur sur la période (mètres linéaires), en attendant le plan du réseau.</p>
      <div className="deux">
        <ChoixArticle articles={articles} valeur={prixId} maj={setPrixId} />
        <label>Quantité<input value={qte} onChange={(e) => setQte(e.target.value)} inputMode="decimal" required /></label>
      </div>
      <label>Désignation (lieu, secteur, période) *<input value={designation} onChange={(e) => setDesignation(e.target.value)} required /></label>
      <div className="actions">
        <button className="primaire" disabled={!prixId || !valide(qte, false) || !designation.trim()}>Ajouter</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}

// Article du panier d'anticipation attaché avant son exécution, avec l'accord du maître d'ouvrage (A1).
export function FormAnticipation({
  articles, prixPropose, quantiteProposee, fuiteId, marcheId, lotId, annuler, fini, onErreur,
}: Props & { prixPropose: string | null; quantiteProposee: number | null; fuiteId: string }) {
  const [prixId, setPrixId] = useState(
    articles.find((a) => a.id === prixPropose)?.id ?? (articles.length === 1 ? articles[0].id : ''),
  );
  const [qte, setQte] = useState(quantiteProposee != null ? String(quantiteProposee).replace('.', ',') : '');
  const [motif, setMotif] = useState('');
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    inserer({ marche_id: marcheId, attachement_id: lotId, nature: 'anticipation', fuite_id: fuiteId, prix_id: prixId, quantite: enNombre(qte), motif: motif.trim() }, fini, onErreur);
  };
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <p className="discret">
        Ligne marquée « Attaché par anticipation ». Pour une réfection, la surface proposée est celle de la fouille (L × l).
        Quand le travail réel sera saisi, la différence apparaîtra en régularisation dans un lot suivant.
      </p>
      <div className="deux">
        <ChoixArticle articles={articles} valeur={prixId} maj={setPrixId} />
        <label>Quantité ({articles.find((a) => a.id === prixId)?.unite ?? 'm2'})<input value={qte} onChange={(e) => setQte(e.target.value)} inputMode="decimal" required /></label>
      </div>
      <label>Accord du maître d&apos;ouvrage (nom, date) *<input value={motif} onChange={(e) => setMotif(e.target.value)} required placeholder="Ex. accord de M. X le 30/10/2026" /></label>
      <div className="actions">
        <button className="primaire" disabled={!prixId || !valide(qte) || !motif.trim()}>Attacher par anticipation</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}

// Refacturation forcée (administrateur) : hors solde, motif obligatoire.
export function FormForcage({ articles, marcheId, lotId, annuler, fini, onErreur }: Props) {
  const [numero, setNumero] = useState('');
  const [prixId, setPrixId] = useState('');
  const [qte, setQte] = useState('');
  const [motif, setMotif] = useState('');
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    const { data, error } = await getSupabase().from('fuites').select('id').eq('marche_id', marcheId).eq('numero', Number(numero)).is('supprime_le', null).maybeSingle();
    if (error || !data) {
      onErreur(error ? messageErreur(error) : `Fuite N° ${numero} introuvable.`);
      return;
    }
    inserer({ marche_id: marcheId, attachement_id: lotId, nature: 'forcage', fuite_id: (data as { id: string }).id, prix_id: prixId, quantite: enNombre(qte), motif: motif.trim() }, fini, onErreur);
  }
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <p className="discret">Refacturation volontaire d&apos;une quantité déjà attachée : elle n&apos;entre pas dans le solde de la fuite.</p>
      <div className="trois">
        <label>N° de fuite<input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" required /></label>
        <ChoixArticle articles={articles} valeur={prixId} maj={setPrixId} />
        <label>Quantité<input value={qte} onChange={(e) => setQte(e.target.value)} inputMode="decimal" required /></label>
      </div>
      <label>Motif *<input value={motif} onChange={(e) => setMotif(e.target.value)} required /></label>
      <div className="actions">
        <button className="primaire" disabled={!/^\d+$/.test(numero) || !prixId || !valide(qte, false) || !motif.trim()}>Ajouter</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}
