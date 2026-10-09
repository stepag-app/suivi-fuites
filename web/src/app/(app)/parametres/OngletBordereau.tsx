'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { dateSeule, libellesMarche, MATERIAUX, messageErreur, montant, nombre } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import { SuggestionsArticles } from './SuggestionsArticles';

interface Avenant {
  id: string; numero: string; date_avenant: string; objet: string; prolongation_jours: number;
  observation: string | null; actif: boolean;
}
interface Article {
  id: string; numero: string; ordre: number; designation: string; unite: string;
  quantite_marche: number | null; pu_ht: number | null; hors_bordereau: boolean; actif: boolean;
  famille: string; materiaux: string[] | null; diametre_min_mm: number | null; diametre_max_mm: number | null;
  anticipable?: boolean;
}
interface Version {
  id: string; prix_id: string; version: number; designation: string; unite: string;
  quantite_marche: number | null; pu_ht: number | null; avenant_id: string | null; motif: string;
  date_effet: string; cree_le: string;
}

const UNITES = ['ml', 'm2', 'm3', 'u', 'forfait'];
// Familles de la proposition automatique des lignes de prix (type famille_prix en base).
const FAMILLES: Record<string, string> = {
  balayage: 'Balayage', maintien: 'Maintien', terrassement: 'Terrassement', refection: 'Réfection',
  reparation_tuyau: 'Réparation de tuyau', robinet_pec: 'Robinet de prise en charge', collier_pec: 'Collier de prise en charge',
  bouche_a_cle: 'Bouche à clé', autre: 'Autre (jamais proposé)',
};
const enNombre = (t: string) => (t.trim() === '' ? null : Number(t.replace(/\s/g, '').replace(',', '.')));
const nombreValide = (t: string) => t.trim() === '' || (!Number.isNaN(enNombre(t)) && (enNombre(t) ?? 0) >= 0);

export function OngletBordereau({ marcheId, peutCreer, peutModifier }: { marcheId: string; peutCreer: boolean; peutModifier: boolean }) {
  const { marche } = useSession();
  const devise = libellesMarche(marche).devise;
  const [avenants, setAvenants] = useState<Avenant[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [erreur, setErreur] = useState('');
  const [ajout, setAjout] = useState<'' | 'avenant' | 'bordereau' | 'hors_bordereau'>('');

  const charger = useCallback(async () => {
    const sb = getSupabase();
    const [a, p, v] = await Promise.all([
      sb.from('avenants').select('*').eq('marche_id', marcheId).order('date_avenant'),
      sb.from('prix').select('id, numero, ordre, designation, unite, quantite_marche, pu_ht, hors_bordereau, actif, famille, materiaux, diametre_min_mm, diametre_max_mm, anticipable')
        .eq('marche_id', marcheId).order('hors_bordereau').order('ordre').order('numero'),
      sb.from('prix_versions').select('*').eq('marche_id', marcheId).order('version'),
    ]);
    const premiere = a.error || p.error || v.error;
    setErreur(premiere ? messageErreur(premiere) : '');
    setAvenants((a.data as Avenant[] | null) ?? []);
    setArticles((p.data as Article[] | null) ?? []);
    setVersions((v.data as Version[] | null) ?? []);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function executer(action: () => PromiseLike<{ error: { code?: string; message: string } | null }>): Promise<boolean> {
    setErreur('');
    const { error } = await action();
    if (error) {
      setErreur(error.code === '23505' ? 'Ce numéro existe déjà.' : messageErreur(error));
      return false;
    }
    await charger();
    return true;
  }

  const sb = getSupabase();
  const avenantsActifs = avenants.filter((a) => a.actif);
  const bordereau = articles.filter((p) => !p.hors_bordereau);
  const horsBordereau = articles.filter((p) => p.hors_bordereau);

  return (
    <>
      {erreur && <p className="erreur">{erreur}</p>}

      <section className="carte">
        <h2>Avenants</h2>
        <p className="discret">Un avenant peut prolonger le délai et modifier ou ajouter des articles du bordereau.</p>
        {avenants.length === 0 && <p className="discret">Aucun avenant.</p>}
        {avenants.map((a) => (
          <div key={a.id} className="bloc ligne-param">
            <span className={a.actif ? '' : 'discret'}>
              <strong>Avenant n° {a.numero}</strong> du {dateSeule(a.date_avenant)} · {a.objet}
              {a.prolongation_jours ? ` · prolongation de ${a.prolongation_jours} jours` : ''}
              {a.actif ? '' : ' (saisie annulée)'}
            </span>
            {peutModifier && (
              <button onClick={() => executer(() => sb.from('avenants').update({ actif: !a.actif }).eq('id', a.id))}>
                {a.actif ? 'Annuler la saisie' : 'Rétablir'}
              </button>
            )}
          </div>
        ))}
        {peutCreer &&
          (ajout === 'avenant' ? (
            <FormAvenant
              onSubmit={async (v) => (await executer(() => sb.from('avenants').insert({ ...v, marche_id: marcheId }))) && setAjout('')}
              annuler={() => setAjout('')}
            />
          ) : (
            <button onClick={() => setAjout('avenant')}>+ Enregistrer un avenant</button>
          ))}
      </section>

      <section className="carte">
        <h2>Articles du bordereau</h2>
        <p className="discret">
          Un article du bordereau ne se modifie jamais directement : chaque changement crée une nouvelle version,
          rattachée à un avenant ou justifiée par un motif. L&apos;historique et le journal gardent toutes les valeurs.
        </p>
        <p className="discret">
          <strong>Panier d&apos;anticipation</strong> : les articles cochés « Anticipable » peuvent être attachés avant leur
          exécution, si le maître d&apos;ouvrage l&apos;accepte (case des règles d&apos;attachement). Ils sont alors proposés
          dans le lot, avec la surface de fouille pour une réfection.
        </p>
        {articles.length === 0 && <p className="discret">Aucun article visible (droit « quantités » requis).</p>}
        {bordereau.map((p) => (
          <LigneArticle
            key={p.id} article={p} devise={devise} versions={versions.filter((v) => v.prix_id === p.id)}
            avenants={avenantsActifs} toutAvenants={avenants} peutModifier={peutModifier}
            nouvelleVersion={(v) => executer(() => sb.from('prix_versions').insert({ ...v, prix_id: p.id, marche_id: marcheId }))}
            modifierRegles={(v) => executer(() => sb.from('prix').update(v).eq('id', p.id))}
          />
        ))}
        {peutCreer &&
          (ajout === 'bordereau' ? (
            <FormArticle
              avenants={avenantsActifs}
              onSubmit={async (v) =>
                (await executer(() => sb.from('prix').insert({ ...v, marche_id: marcheId, hors_bordereau: false, famille: 'autre', ordre: 100 + bordereau.length }))) && setAjout('')
              }
              annuler={() => setAjout('')}
            />
          ) : (
            <button onClick={() => setAjout('bordereau')}>+ Ajouter un article au bordereau (avenant)</button>
          ))}
      </section>

      <section className="carte">
        <h2>Articles hors bordereau</h2>
        <p className="discret">Créés et modifiés directement ; chaque modification est gardée dans l&apos;historique.</p>
        {horsBordereau.length === 0 && <p className="discret">Aucun article hors bordereau.</p>}
        {horsBordereau.map((p) => (
          <LigneArticle
            key={p.id} article={p} devise={devise} versions={versions.filter((v) => v.prix_id === p.id)}
            avenants={avenantsActifs} toutAvenants={avenants} peutModifier={peutModifier}
            modifierDirectement={(v) => executer(() => sb.from('prix').update(v).eq('id', p.id))}
            modifierRegles={(v) => executer(() => sb.from('prix').update(v).eq('id', p.id))}
            basculer={() => executer(() => sb.from('prix').update({ actif: !p.actif }).eq('id', p.id))}
          />
        ))}
        {peutCreer &&
          (ajout === 'hors_bordereau' ? (
            <FormArticle
              horsBordereau
              onSubmit={async (v) =>
                (await executer(() => sb.from('prix').insert({ ...v, marche_id: marcheId, hors_bordereau: true, famille: 'autre', ordre: 900 + horsBordereau.length }))) && setAjout('')
              }
              annuler={() => setAjout('')}
            />
          ) : (
            <button onClick={() => setAjout('hors_bordereau')}>+ Ajouter un article hors bordereau</button>
          ))}
      </section>

      <SuggestionsArticles marcheId={marcheId} prix={articles} peutCreer={peutCreer} />
    </>
  );
}

function LigneArticle({
  article: p, devise, versions, avenants, toutAvenants, peutModifier, nouvelleVersion, modifierDirectement, modifierRegles, basculer,
}: {
  article: Article; devise: string; versions: Version[]; avenants: Avenant[]; toutAvenants: Avenant[]; peutModifier: boolean;
  nouvelleVersion?: (v: Record<string, unknown>) => Promise<boolean>;
  modifierDirectement?: (v: Record<string, unknown>) => Promise<boolean>;
  modifierRegles: (v: Record<string, unknown>) => Promise<boolean>;
  basculer?: () => void;
}) {
  const [mode, setMode] = useState<'' | 'version' | 'historique' | 'regles'>('');
  const avenantDe = (id: string | null) => toutAvenants.find((a) => a.id === id);
  return (
    <div className="bloc">
      <div className="ligne-param">
        <span className={p.actif ? '' : 'discret'}>
          <strong>N° {p.numero}</strong> · {p.unite} · quantité du marché {nombre(p.quantite_marche, 3)} · PU HT {montant(p.pu_ht)} {devise}
          {versions.length > 1 ? <span className="etiquette">version {versions.length}</span> : null}
          {p.actif ? '' : ' (désactivé)'}
          <br />
          <span className="discret designation">{p.designation}</span>
          <span className="discret regles-prix">Proposition automatique : {resumeRegles(p)}</span>
          {p.anticipable !== undefined && (
            <label className="ligne anticipable" title="Panier d'anticipation : article attachable avant son exécution">
              <input type="checkbox" checked={p.anticipable} disabled={!peutModifier}
                onChange={(e) => modifierRegles({ anticipable: e.target.checked })} />
              Anticipable
            </label>
          )}
        </span>
        <span className="actions">
          {peutModifier && (
            <button onClick={() => setMode(mode === 'version' ? '' : 'version')}>
              {p.hors_bordereau ? 'Modifier' : 'Nouvelle version'}
            </button>
          )}
          {peutModifier && <button onClick={() => setMode(mode === 'regles' ? '' : 'regles')}>Règles</button>}
          <button onClick={() => setMode(mode === 'historique' ? '' : 'historique')}>Historique ({versions.length})</button>
          {peutModifier && basculer && <button onClick={basculer}>{p.actif ? 'Désactiver' : 'Réactiver'}</button>}
        </span>
      </div>
      {mode === 'version' && (
        <FormVersion
          article={p}
          avenants={p.hors_bordereau ? undefined : avenants}
          annuler={() => setMode('')}
          onSubmit={async (v) => {
            const ok = p.hors_bordereau ? await modifierDirectement?.(v) : await nouvelleVersion?.(v);
            if (ok) setMode('');
          }}
        />
      )}
      {mode === 'regles' && (
        <FormRegles
          article={p}
          annuler={() => setMode('')}
          onSubmit={async (v) => {
            if (await modifierRegles(v)) setMode('');
          }}
        />
      )}
      {mode === 'historique' && (
        <div className="defilement">
          <table>
            <thead>
              <tr><th>Version</th><th>Effet</th><th>Qté marché</th><th>PU HT</th><th>Avenant / motif</th></tr>
            </thead>
            <tbody>
              {[...versions].reverse().map((v) => (
                <tr key={v.id}>
                  <td>{v.version}</td>
                  <td>{dateSeule(v.date_effet)}</td>
                  <td>{nombre(v.quantite_marche, 3)}</td>
                  <td>{montant(v.pu_ht)}</td>
                  <td>
                    {v.avenant_id ? `Avenant n° ${avenantDe(v.avenant_id)?.numero ?? '?'} · ` : ''}{v.motif}
                    {v.designation !== p.designation ? <><br /><span className="discret">Désignation : {v.designation}</span></> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function resumeRegles(p: Article): string {
  if (p.famille === 'autre') return 'jamais proposé';
  const morceaux = [FAMILLES[p.famille] ?? p.famille];
  if (p.materiaux?.length) morceaux.push(p.materiaux.map((m) => MATERIAUX[m] ?? m).join(', '));
  if (p.diametre_min_mm != null && p.diametre_max_mm != null) morceaux.push(`Ø ${p.diametre_min_mm} à ${p.diametre_max_mm} mm`);
  else if (p.diametre_min_mm != null) morceaux.push(`Ø ≥ ${p.diametre_min_mm} mm`);
  else if (p.diametre_max_mm != null) morceaux.push(`Ø ≤ ${p.diametre_max_mm} mm`);
  if (p.hors_bordereau) morceaux.push('(hors bordereau : jamais proposé)');
  return morceaux.join(' · ');
}

// Règles de proposition : modifiables directement (pas de nouvelle version ; le journal garde la trace).
function FormRegles({ article, onSubmit, annuler }: { article: Article; onSubmit: (v: Record<string, unknown>) => void; annuler: () => void }) {
  const [famille, setFamille] = useState(article.famille);
  const [materiaux, setMateriaux] = useState<string[]>(article.materiaux ?? []);
  const [min, setMin] = useState(article.diametre_min_mm != null ? String(article.diametre_min_mm) : '');
  const [max, setMax] = useState(article.diametre_max_mm != null ? String(article.diametre_max_mm) : '');
  const entier = (t: string) => t.trim() === '' || /^\d+$/.test(t.trim());
  const ordreValide = !min.trim() || !max.trim() || Number(max) >= Number(min);
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      famille,
      materiaux: materiaux.length ? materiaux : null,
      diametre_min_mm: min.trim() ? Number(min) : null,
      diametre_max_mm: max.trim() ? Number(max) : null,
    });
  };
  const basculer = (m: string) => setMateriaux((l) => (l.includes(m) ? l.filter((x) => x !== m) : [...l, m]));
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <p className="discret">
        Ces règles choisissent l&apos;article proposé à partir des mesures de terrain (matériau et diamètre du tuyau).
        Elles se modifient directement : pas de nouvelle version, le journal garde l&apos;ancienne valeur.
        Les lignes déjà proposées ne sont recalculées qu&apos;à la prochaine modification de leur réparation ou réfection.{article.hors_bordereau ? ' Un article hors bordereau n\'est jamais proposé.' : ''}
      </p>
      <label>
        Famille
        <select value={famille} onChange={(e) => setFamille(e.target.value)}>
          {Object.entries(FAMILLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <fieldset>
        <legend>Matériaux (aucun coché : tous)</legend>
        <div className="cases-materiaux">
          {Object.entries(MATERIAUX).map(([k, v]) => (
            <label key={k} className="ligne"><input type="checkbox" checked={materiaux.includes(k)} onChange={() => basculer(k)} />{v}</label>
          ))}
        </div>
      </fieldset>
      <div className="deux">
        <label>Diamètre minimum (mm)<input value={min} onChange={(e) => setMin(e.target.value)} inputMode="numeric" placeholder="sans minimum" /></label>
        <label>Diamètre maximum (mm)<input value={max} onChange={(e) => setMax(e.target.value)} inputMode="numeric" placeholder="sans maximum" /></label>
      </div>
      {!ordreValide && <p className="erreur">Le diamètre maximum doit être supérieur ou égal au minimum.</p>}
      <div className="actions">
        <button className="primaire" disabled={!entier(min) || !entier(max) || !ordreValide}>Enregistrer les règles</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}

function FormVersion({
  article, avenants, onSubmit, annuler,
}: {
  article: Article; avenants?: Avenant[]; onSubmit: (v: Record<string, unknown>) => void; annuler: () => void;
}) {
  const [designation, setDesignation] = useState(article.designation);
  const [unite, setUnite] = useState(article.unite);
  const [quantite, setQuantite] = useState(article.quantite_marche != null ? String(article.quantite_marche) : '');
  const [pu, setPu] = useState(article.pu_ht != null ? String(article.pu_ht) : '');
  const [avenantId, setAvenantId] = useState('');
  const [motif, setMotif] = useState('');
  const [dateEffet, setDateEffet] = useState('');
  const versionne = !!avenants;

  function choisirAvenant(id: string) {
    setAvenantId(id);
    const a = avenants?.find((x) => x.id === id);
    if (a) {
      if (!motif.trim()) setMotif(`Avenant n° ${a.numero}`);
      if (!dateEffet) setDateEffet(a.date_avenant);
    }
  }

  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    const valeurs: Record<string, unknown> = {
      designation: designation.trim(), unite, quantite_marche: enNombre(quantite), pu_ht: enNombre(pu),
    };
    if (versionne) {
      valeurs.avenant_id = avenantId || null;
      valeurs.motif = motif.trim();
      if (dateEffet) valeurs.date_effet = dateEffet;
    }
    onSubmit(valeurs);
  };
  const valide = designation.trim() && nombreValide(quantite) && nombreValide(pu) && (!versionne || motif.trim());
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <label>Désignation<textarea rows={3} value={designation} onChange={(e) => setDesignation(e.target.value)} required /></label>
      <div className="trois">
        <label>
          Unité
          <select value={unite} onChange={(e) => setUnite(e.target.value)}>
            {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label>Quantité du marché<input value={quantite} onChange={(e) => setQuantite(e.target.value)} inputMode="decimal" /></label>
        <label>Prix unitaire HT<input value={pu} onChange={(e) => setPu(e.target.value)} inputMode="decimal" /></label>
      </div>
      {versionne && (
        <div className="trois">
          <label>
            Avenant
            <select value={avenantId} onChange={(e) => choisirAvenant(e.target.value)}>
              <option value="">— Sans avenant —</option>
              {avenants!.map((a) => <option key={a.id} value={a.id}>n° {a.numero} du {dateSeule(a.date_avenant)}</option>)}
            </select>
          </label>
          <label>Motif *<input value={motif} onChange={(e) => setMotif(e.target.value)} required placeholder="Avenant, erreur de saisie…" /></label>
          <label>Date d&apos;effet<input type="date" value={dateEffet} onChange={(e) => setDateEffet(e.target.value)} /></label>
        </div>
      )}
      <div className="actions">
        <button className="primaire" disabled={!valide}>{versionne ? 'Enregistrer la nouvelle version' : 'Enregistrer'}</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}

function FormArticle({
  horsBordereau, avenants, onSubmit, annuler,
}: {
  horsBordereau?: boolean; avenants?: Avenant[]; onSubmit: (v: Record<string, unknown>) => void; annuler: () => void;
}) {
  const [numero, setNumero] = useState(horsBordereau ? 'HB-' : '');
  const [designation, setDesignation] = useState('');
  const [unite, setUnite] = useState('u');
  const [quantite, setQuantite] = useState('');
  const [pu, setPu] = useState('');
  const [avenantId, setAvenantId] = useState('');
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      numero: numero.trim(), designation: designation.trim(), unite,
      quantite_marche: enNombre(quantite), pu_ht: enNombre(pu),
      ...(horsBordereau ? {} : { avenant_id: avenantId || null }),
    });
  };
  const valide = numero.trim() && designation.trim() && pu.trim() && nombreValide(quantite) && nombreValide(pu);
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <div className="deux">
        <label>Numéro<input value={numero} onChange={(e) => setNumero(e.target.value)} required /></label>
        {!horsBordereau && (
          <label>
            Avenant
            <select value={avenantId} onChange={(e) => setAvenantId(e.target.value)}>
              <option value="">— Sans avenant —</option>
              {(avenants ?? []).map((a) => <option key={a.id} value={a.id}>n° {a.numero} du {dateSeule(a.date_avenant)}</option>)}
            </select>
          </label>
        )}
      </div>
      <label>Désignation<textarea rows={3} value={designation} onChange={(e) => setDesignation(e.target.value)} required /></label>
      <div className="trois">
        <label>
          Unité
          <select value={unite} onChange={(e) => setUnite(e.target.value)}>
            {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label>Quantité du marché<input value={quantite} onChange={(e) => setQuantite(e.target.value)} inputMode="decimal" /></label>
        <label>Prix unitaire HT<input value={pu} onChange={(e) => setPu(e.target.value)} inputMode="decimal" required /></label>
      </div>
      <div className="actions">
        <button className="primaire" disabled={!valide}>Enregistrer</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}

function FormAvenant({ onSubmit, annuler }: { onSubmit: (v: Record<string, unknown>) => void; annuler: () => void }) {
  const [numero, setNumero] = useState('');
  const [date, setDate] = useState('');
  const [objet, setObjet] = useState('');
  const [prolongation, setProlongation] = useState('0');
  const [observation, setObservation] = useState('');
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      numero: numero.trim(), date_avenant: date, objet: objet.trim(),
      prolongation_jours: Number(prolongation) || 0, observation: observation.trim() || null,
    });
  };
  const prolongationValide = /^\d+$/.test(prolongation.trim());
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <div className="trois">
        <label>Numéro<input value={numero} onChange={(e) => setNumero(e.target.value)} required /></label>
        <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        <label>Prolongation du délai (jours)<input value={prolongation} onChange={(e) => setProlongation(e.target.value)} inputMode="numeric" /></label>
      </div>
      <label>Objet<input value={objet} onChange={(e) => setObjet(e.target.value)} required /></label>
      <label>Observation<textarea rows={2} value={observation} onChange={(e) => setObservation(e.target.value)} /></label>
      <div className="actions">
        <button className="primaire" disabled={!numero.trim() || !date || !objet.trim() || !prolongationValide}>Enregistrer</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}
