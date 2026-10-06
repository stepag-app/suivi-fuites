'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { lireArticles, lireArticlesProposes } from '@/lib/articles';
import { messageErreur } from '@/lib/format';
import { FAMILLES_PAR_DEFAUT, LIBELLES_FAMILLES } from '@/lib/nomenclature/csv';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import type { Piece } from '@/lib/types';

interface Regle { id: string; prix_id: string; famille: string | null; produit_id: number | null }
interface Prix { id: string; numero: string; designation: string; actif: boolean }

const libelleFamille = (f: string) => (LIBELLES_FAMILLES[f] ? `${LIBELLES_FAMILLES[f]} (${f})` : f);
const court = (t: string) => (t.length > 60 ? `${t.slice(0, 60)}…` : t);

// Article du bordereau suggéré pour une pièce posée (contrôles de l'attachement, pièces non couvertes) :
// règle par article Dolibarr, sinon par famille. Les articles Dolibarr sont communs à tous les marchés,
// les règles sont propres à ce marché (son bordereau).
export function SuggestionsArticles({ marcheId, prix, peutCreer }: { marcheId: string; prix: Prix[]; peutCreer: boolean }) {
  const { peut } = useSession();
  const peutSupprimer = peut('parametres', 'supprimer');
  const [regles, setRegles] = useState<Regle[]>([]);
  const [noms, setNoms] = useState<Map<number, Piece>>(new Map());
  const [proposes, setProposes] = useState<Piece[]>([]);
  const [erreur, setErreur] = useState('');
  const [ajout, setAjout] = useState(false);

  const charger = useCallback(async () => {
    try {
      const { data, error } = await getSupabase().from('suggestions_articles')
        .select('id, prix_id, famille, produit_id').eq('marche_id', marcheId).order('famille').order('produit_id');
      if (error) throw error;
      const r = (data as Regle[] | null) ?? [];
      setRegles(r);
      setNoms(await lireArticles(r.map((x) => x.produit_id)));
      setErreur('');
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    if (ajout && !proposes.length) lireArticlesProposes().then(setProposes, (e) => setErreur(messageErreur(e)));
  }, [ajout, proposes.length]);

  const numero = (id: string) => prix.find((p) => p.id === id);
  const parFamille = regles.filter((r) => r.famille);
  const parArticle = regles
    .filter((r) => r.produit_id != null)
    .sort((a, b) => (noms.get(a.produit_id!)?.designation ?? '').localeCompare(noms.get(b.produit_id!)?.designation ?? '', 'fr'));

  async function ecrire(action: () => PromiseLike<{ error: { code?: string; message: string } | null }>): Promise<boolean> {
    setErreur('');
    const { error } = await action();
    if (error) {
      setErreur(error.code === '23505' ? 'Cette famille ou cet article a déjà une règle dans ce marché.' : messageErreur(error));
      return false;
    }
    await charger();
    return true;
  }
  const supprimer = (id: string) => ecrire(() => getSupabase().from('suggestions_articles').delete().eq('id', id));

  const ligne = (r: Regle, libelle: string) => {
    const p = numero(r.prix_id);
    return (
      <div key={r.id} className="bloc ligne-param">
        <span>
          <strong>{libelle}</strong> → {p ? `N° ${p.numero} · ${court(p.designation)}` : 'article non visible'}
        </span>
        {peutSupprimer && <button onClick={() => supprimer(r.id)}>Supprimer</button>}
      </div>
    );
  };

  return (
    <section className="carte">
      <h2>Article suggéré pour les pièces posées</h2>
      <p className="discret">
        Oriente les contrôles de l&apos;attachement (robinet ou collier PEC posé sans la case cochée, pièce non couverte).
        La règle d&apos;un article Dolibarr l&apos;emporte sur celle de sa famille. Les pièces ne changent jamais le montant.
      </p>
      {erreur && <p className="erreur">{erreur}</p>}
      {regles.length === 0 && <p className="discret">Aucune règle.</p>}
      {parFamille.length > 0 && (
        <fieldset>
          <legend>Par famille</legend>
          {parFamille.map((r) => ligne(r, libelleFamille(r.famille!)))}
        </fieldset>
      )}
      {parArticle.length > 0 && (
        <fieldset>
          <legend>Par article ({parArticle.length})</legend>
          {parArticle.map((r) => ligne(r, noms.get(r.produit_id!)?.designation ?? `Article ${r.produit_id}`))}
        </fieldset>
      )}
      {peutCreer &&
        (ajout ? (
          <FormRegle
            prix={prix.filter((p) => p.actif)} proposes={proposes}
            onSubmit={async (v) => (await ecrire(() => getSupabase().from('suggestions_articles').insert({ ...v, marche_id: marcheId }))) && setAjout(false)}
            annuler={() => setAjout(false)}
          />
        ) : (
          <button onClick={() => setAjout(true)}>+ Ajouter une règle</button>
        ))}
    </section>
  );
}

function FormRegle({
  prix, proposes, onSubmit, annuler,
}: {
  prix: Prix[]; proposes: Piece[]; onSubmit: (v: Record<string, unknown>) => void; annuler: () => void;
}) {
  const [type, setType] = useState<'produit' | 'famille'>('produit');
  const [famille, setFamille] = useState(FAMILLES_PAR_DEFAUT[0]);
  const [texte, setTexte] = useState('');
  const [prixId, setPrixId] = useState('');
  const article = useMemo(
    () => proposes.find((a) => a.designation.toLowerCase() === texte.trim().toLowerCase()),
    [proposes, texte],
  );
  const valide = !!prixId && (type === 'famille' ? !!famille : !!article);
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    if (!valide) return;
    onSubmit(type === 'famille' ? { famille, prix_id: prixId } : { produit_id: article!.id, prix_id: prixId });
  };
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <div className="trois">
        <label>
          Règle pour
          <select value={type} onChange={(e) => setType(e.target.value as 'produit' | 'famille')}>
            <option value="produit">un article</option>
            <option value="famille">une famille</option>
          </select>
        </label>
        {type === 'famille' ? (
          <label>
            Famille
            <select value={famille} onChange={(e) => setFamille(e.target.value)}>
              {Object.keys(LIBELLES_FAMILLES).map((f) => <option key={f} value={f}>{libelleFamille(f)}</option>)}
            </select>
          </label>
        ) : (
          <label>
            Article (activé)
            <input value={texte} onChange={(e) => setTexte(e.target.value)} list="regle-articles" placeholder="Rechercher…" required />
            <datalist id="regle-articles">
              {proposes.map((a) => <option key={a.id} value={a.designation} />)}
            </datalist>
          </label>
        )}
        <label>
          Article du bordereau
          <select value={prixId} onChange={(e) => setPrixId(e.target.value)} required>
            <option value="">— Choisir —</option>
            {prix.map((p) => <option key={p.id} value={p.id}>N° {p.numero} · {court(p.designation)}</option>)}
          </select>
        </label>
      </div>
      {type === 'produit' && texte.trim() && !article && <p className="discret">Choisissez un article activé de la liste.</p>}
      <div className="actions">
        <button className="primaire" disabled={!valide}>Enregistrer</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}
