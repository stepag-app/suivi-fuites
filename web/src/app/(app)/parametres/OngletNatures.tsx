'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { EMPLACEMENTS, messageErreur } from '@/lib/format';
import { getSupabase } from '@/lib/supabase';

interface NatureLigne {
  id: string; code: string; libelle_fr: string; libelle_ar: string | null; symbole: string | null;
  emplacement: string; prix_id: string | null; necessite_refection: boolean; ordre: number; actif: boolean;
}
interface ArticleCourt { id: string; numero: string; designation: string; hors_bordereau: boolean; actif: boolean }

const codeDepuis = (texte: string) =>
  texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

// Natures de revêtement : symbole de l'attachement et article payé pour la réfection.
export function OngletNatures({ marcheId, peutCreer, peutModifier }: { marcheId: string; peutCreer: boolean; peutModifier: boolean }) {
  const [natures, setNatures] = useState<NatureLigne[]>([]);
  const [articles, setArticles] = useState<ArticleCourt[]>([]);
  const [erreur, setErreur] = useState('');
  const [edition, setEdition] = useState<string>(''); // id, ou 'nouvelle'

  const charger = useCallback(async () => {
    const sb = getSupabase();
    const [n, p] = await Promise.all([
      sb.from('natures_refection')
        .select('id, code, libelle_fr, libelle_ar, symbole, emplacement, prix_id, necessite_refection, ordre, actif')
        .eq('marche_id', marcheId).order('ordre').order('code'),
      sb.from('prix').select('id, numero, designation, hors_bordereau, actif').eq('marche_id', marcheId)
        .order('hors_bordereau').order('ordre').order('numero'),
    ]);
    const premiere = n.error || p.error;
    setErreur(premiere ? messageErreur(premiere) : '');
    setNatures((n.data as NatureLigne[] | null) ?? []);
    setArticles((p.data as ArticleCourt[] | null) ?? []);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ecrire(id: string | null, valeurs: Record<string, unknown>): Promise<boolean> {
    setErreur('');
    const sb = getSupabase();
    const { error } = id
      ? await sb.from('natures_refection').update(valeurs).eq('id', id)
      : await sb.from('natures_refection').insert({ ...valeurs, marche_id: marcheId });
    if (error) {
      setErreur(error.code === '23505' ? 'Une nature porte déjà ce code.' : messageErreur(error));
      return false;
    }
    setEdition('');
    await charger();
    return true;
  }

  const article = (id: string | null) => articles.find((a) => a.id === id);

  return (
    <>
      {erreur && <p className="erreur">{erreur}</p>}
      <section className="carte">
        <h2>Natures de réfection</h2>
        <p className="discret">
          Proposées au chef de réparation (revêtement de la fouille). L&apos;article lié sert à proposer la ligne de réfection ;
          « sans réfection » (terrain naturel) achève la fuite dès la réparation.
        </p>
        {natures.length === 0 && <p className="discret">Aucune nature.</p>}
        {natures.map((n) =>
          edition === n.id ? (
            <FormNature key={n.id} initial={n} articles={articles} onSubmit={(v) => ecrire(n.id, v)} annuler={() => setEdition('')} />
          ) : (
            <div key={n.id} className="bloc ligne-param">
              <span className={n.actif ? '' : 'discret'}>
                {n.symbole && <span className="etiquette symbole">{n.symbole}</span>} <strong>{n.libelle_fr}</strong>
                {n.libelle_ar && <span dir="rtl" lang="ar"> · {n.libelle_ar}</span>}
                <br />
                <span className="discret">
                  {EMPLACEMENTS[n.emplacement] ?? n.emplacement}
                  {' · '}
                  {n.necessite_refection ? 'réfection à faire' : 'sans réfection'}
                  {' · '}
                  {n.prix_id ? `article N° ${article(n.prix_id)?.numero ?? '?'}` : 'non payée'}
                  {' · ordre '}{n.ordre}
                  {n.actif ? '' : ' · désactivée'}
                </span>
              </span>
              {peutModifier && (
                <span className="actions">
                  <button onClick={() => setEdition(n.id)}>Modifier</button>
                  <button onClick={() => ecrire(n.id, { actif: !n.actif })}>{n.actif ? 'Désactiver' : 'Réactiver'}</button>
                </span>
              )}
            </div>
          ),
        )}
        {peutCreer &&
          (edition === 'nouvelle' ? (
            <FormNature
              articles={articles}
              ordreSuivant={Math.max(0, ...natures.map((n) => n.ordre)) + 1}
              codesPris={natures.map((n) => n.code)}
              onSubmit={(v) => ecrire(null, v)}
              annuler={() => setEdition('')}
            />
          ) : (
            <button onClick={() => setEdition('nouvelle')}>+ Ajouter une nature</button>
          ))}
      </section>
    </>
  );
}

function FormNature({
  initial, articles, ordreSuivant, codesPris, onSubmit, annuler,
}: {
  initial?: NatureLigne; articles: ArticleCourt[]; ordreSuivant?: number; codesPris?: string[];
  onSubmit: (v: Record<string, unknown>) => void; annuler: () => void;
}) {
  const [fr, setFr] = useState(initial?.libelle_fr ?? '');
  const [ar, setAr] = useState(initial?.libelle_ar ?? '');
  const [symbole, setSymbole] = useState(initial?.symbole ?? '');
  const [emplacement, setEmplacement] = useState(initial?.emplacement ?? 'trottoir');
  const [prixId, setPrixId] = useState(initial?.prix_id ?? '');
  const [necessite, setNecessite] = useState(initial?.necessite_refection ?? true);
  const [ordre, setOrdre] = useState(String(initial?.ordre ?? ordreSuivant ?? 1));
  const code = initial?.code ?? codeDepuis(fr);
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...(initial ? {} : { code }),
      libelle_fr: fr.trim(), libelle_ar: ar.trim() || null, symbole: symbole.trim() || null,
      emplacement, prix_id: prixId || null, necessite_refection: necessite, ordre: Number(ordre),
    });
  };
  const codeLibre = !!initial || (code !== '' && !(codesPris ?? []).includes(code));
  const valide = fr.trim() && codeLibre && /^\d+$/.test(ordre.trim());
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <div className="deux">
        <label>Libellé en français<input value={fr} onChange={(e) => setFr(e.target.value)} required /></label>
        <label>Libellé en arabe<input value={ar} onChange={(e) => setAr(e.target.value)} dir="rtl" lang="ar" /></label>
      </div>
      <div className="trois">
        <label>Symbole (attachement)<input value={symbole} onChange={(e) => setSymbole(e.target.value)} maxLength={6} placeholder="B, AC, TN…" /></label>
        <label>
          Emplacement
          <select value={emplacement} onChange={(e) => setEmplacement(e.target.value)}>
            {Object.entries(EMPLACEMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Ordre<input value={ordre} onChange={(e) => setOrdre(e.target.value)} inputMode="numeric" /></label>
      </div>
      <label>
        Article du bordereau payé
        <select value={prixId} onChange={(e) => setPrixId(e.target.value)}>
          <option value="">— Non payée —</option>
          {articles.filter((a) => a.actif || a.id === prixId).map((a) => (
            <option key={a.id} value={a.id}>
              N° {a.numero}{a.hors_bordereau ? ' (hors bordereau)' : ''} · {a.designation.slice(0, 90)}{a.designation.length > 90 ? '…' : ''}
            </option>
          ))}
        </select>
        {articles.length === 0 && <span className="discret aide">Articles invisibles : droit « quantités » ou « paramètres / modifier » requis.</span>}
      </label>
      <label className="ligne"><input type="checkbox" checked={necessite} onChange={(e) => setNecessite(e.target.checked)} />Nécessite une réfection (décocher pour le terrain naturel)</label>
      {!initial && fr.trim() && !codeLibre && <p className="erreur">Une nature porte déjà ce libellé.</p>}
      <div className="actions">
        <button className="primaire" disabled={!valide}>Enregistrer</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}
