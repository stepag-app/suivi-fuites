'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { messageErreur } from '@/lib/format';
import { getSupabase } from '@/lib/supabase';

interface PieceLigne {
  id: string; designation: string; famille: string | null; unite: string; prix_suggere_id: string | null;
  numero_source: number | null; actif: boolean;
}
interface ArticleCourt { id: string; numero: string; designation: string; actif: boolean }

const UNITES = ['u', 'ml', 'm2', 'm3', 'kg'];
const PAR_PAGE = 60;
const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Catalogue des pièces posées (justification des quantités, pas de montant).
export function OngletCatalogue({ marcheId, peutCreer, peutModifier }: { marcheId: string; peutCreer: boolean; peutModifier: boolean }) {
  const [pieces, setPieces] = useState<PieceLigne[]>([]);
  const [articles, setArticles] = useState<ArticleCourt[]>([]);
  const [erreur, setErreur] = useState('');
  const [recherche, setRecherche] = useState('');
  const [famille, setFamille] = useState('');
  const [inactives, setInactives] = useState(false);
  const [limite, setLimite] = useState(PAR_PAGE);
  const [edition, setEdition] = useState<string>(''); // id, ou 'nouvelle'

  const charger = useCallback(async () => {
    const sb = getSupabase();
    const [c, p] = await Promise.all([
      sb.from('catalogue_pieces').select('id, designation, famille, unite, prix_suggere_id, numero_source, actif')
        .eq('marche_id', marcheId).order('famille', { nullsFirst: false }).order('designation'),
      sb.from('prix').select('id, numero, designation, actif').eq('marche_id', marcheId).order('hors_bordereau').order('ordre').order('numero'),
    ]);
    const premiere = c.error || p.error;
    setErreur(premiere ? messageErreur(premiere) : '');
    setPieces((c.data as PieceLigne[] | null) ?? []);
    setArticles((p.data as ArticleCourt[] | null) ?? []);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => setLimite(PAR_PAGE), [recherche, famille, inactives]);

  async function ecrire(id: string | null, valeurs: Record<string, unknown>): Promise<boolean> {
    setErreur('');
    const sb = getSupabase();
    const { error } = id
      ? await sb.from('catalogue_pieces').update(valeurs).eq('id', id)
      : await sb.from('catalogue_pieces').insert({ ...valeurs, marche_id: marcheId });
    if (error) {
      setErreur(error.code === '23505' ? 'Une pièce porte déjà cette désignation.' : messageErreur(error));
      return false;
    }
    setEdition('');
    await charger();
    return true;
  }

  const familles = useMemo(
    () => [...new Set(pieces.map((p) => p.famille).filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b, 'fr')),
    [pieces],
  );
  const filtrees = useMemo(() => {
    const mots = sansAccent(recherche).split(/\s+/).filter(Boolean);
    return pieces.filter((p) =>
      (inactives || p.actif)
      && (!famille || p.famille === famille)
      && mots.every((m) => sansAccent(`${p.designation} ${p.famille ?? ''}`).includes(m)));
  }, [pieces, recherche, famille, inactives]);
  const article = (id: string | null) => articles.find((a) => a.id === id);

  return (
    <>
      {erreur && <p className="erreur">{erreur}</p>}
      <section className="carte">
        <h2>Catalogue des pièces</h2>
        <p className="discret">
          Pièces proposées au chef de réparation ({pieces.filter((p) => p.actif).length} actives sur {pieces.length}).
          L&apos;article suggéré oriente la ligne de prix ; on désactive une pièce, on ne la supprime pas.
        </p>
        <div className="filtres">
          <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher (désignation, famille)" aria-label="Rechercher une pièce" />
          <select value={famille} onChange={(e) => setFamille(e.target.value)} aria-label="Famille">
            <option value="">Toutes les familles</option>
            {familles.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <label className="ligne"><input type="checkbox" checked={inactives} onChange={(e) => setInactives(e.target.checked)} />Désactivées</label>
        </div>
        {peutCreer &&
          (edition === 'nouvelle' ? (
            <FormPiece articles={articles} familles={familles} onSubmit={(v) => ecrire(null, v)} annuler={() => setEdition('')} />
          ) : (
            <p><button onClick={() => setEdition('nouvelle')}>+ Ajouter une pièce</button></p>
          ))}
        <p className="discret">{filtrees.length} pièce(s)</p>
        <div className="defilement">
          <table className="liste-compacte catalogue">
            <thead>
              <tr><th>Désignation</th><th>Famille</th><th>Unité</th><th>Article suggéré</th><th /></tr>
            </thead>
            <tbody>
              {filtrees.slice(0, limite).map((p, i) =>
                edition === p.id ? (
                  <tr key={p.id}>
                    <td colSpan={5}>
                      <FormPiece initial={p} articles={articles} familles={familles} onSubmit={(v) => ecrire(p.id, v)} annuler={() => setEdition('')} />
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className={`${i % 2 ? 'zebre' : ''} ${p.actif ? '' : 'discret'}`}>
                    <td>{p.designation}{p.actif ? '' : ' (désactivée)'}</td>
                    <td>{p.famille ?? '—'}</td>
                    <td className="nowrap">{p.unite}</td>
                    <td className="nowrap">{p.prix_suggere_id ? `N° ${article(p.prix_suggere_id)?.numero ?? '?'}` : '—'}</td>
                    <td className="nowrap">
                      {peutModifier && (
                        <span className="actions">
                          <button className="petit" onClick={() => setEdition(p.id)}>Modifier</button>
                          <button className="petit" onClick={() => ecrire(p.id, { actif: !p.actif })}>{p.actif ? 'Désactiver' : 'Réactiver'}</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        {filtrees.length > limite && (
          <div className="actions">
            <button onClick={() => setLimite((l) => l + PAR_PAGE)}>Afficher {Math.min(PAR_PAGE, filtrees.length - limite)} de plus</button>
          </div>
        )}
      </section>
    </>
  );
}

function FormPiece({
  initial, articles, familles, onSubmit, annuler,
}: {
  initial?: PieceLigne; articles: ArticleCourt[]; familles: string[];
  onSubmit: (v: Record<string, unknown>) => void; annuler: () => void;
}) {
  const [designation, setDesignation] = useState(initial?.designation ?? '');
  const [famille, setFamille] = useState(initial?.famille ?? '');
  const [unite, setUnite] = useState(initial?.unite ?? 'u');
  const [prixId, setPrixId] = useState(initial?.prix_suggere_id ?? '');
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ designation: designation.trim(), famille: famille.trim() || null, unite, prix_suggere_id: prixId || null });
  };
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <label>Désignation<input value={designation} onChange={(e) => setDesignation(e.target.value)} required /></label>
      <div className="trois">
        <label>
          Famille
          <input value={famille} onChange={(e) => setFamille(e.target.value)} list="familles-pieces" />
          <datalist id="familles-pieces">{familles.map((f) => <option key={f} value={f} />)}</datalist>
        </label>
        <label>
          Unité
          <select value={unite} onChange={(e) => setUnite(e.target.value)}>
            {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label>
          Article suggéré
          <select value={prixId} onChange={(e) => setPrixId(e.target.value)}>
            <option value="">— Aucun —</option>
            {articles.filter((a) => a.actif || a.id === prixId).map((a) => (
              <option key={a.id} value={a.id}>N° {a.numero} · {a.designation.slice(0, 50)}{a.designation.length > 50 ? '…' : ''}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="actions">
        <button className="primaire" disabled={!designation.trim()}>Enregistrer</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}
