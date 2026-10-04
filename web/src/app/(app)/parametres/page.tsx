'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { messageErreur } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import type { TypeDonnee } from '@/lib/types';
import { OngletAttachement } from './OngletAttachement';
import { OngletBordereau } from './OngletBordereau';
import { OngletEvenements } from './OngletEvenements';
import { OngletMarche } from './OngletMarche';

type Onglet = 'marche' | 'bordereau' | 'attachement' | 'evenements' | 'ouvriers' | 'equipes' | 'motifs';

interface Ouvrier { id: string; nom_complet: string; telephone: string | null; actif: boolean }
interface Equipe { id: string; type: 'detection' | 'reparation' | 'mixte'; numero: number; libelle: string; actif: boolean }
interface MotifLigne {
  id: string; categorie: 'sans_reparation' | 'sans_refection'; code: string;
  libelle_fr: string; libelle_ar: string | null; terrassement_paye: boolean; actif: boolean;
}

const TYPES_EQUIPE = { detection: 'Détection', reparation: 'Réparation', mixte: 'Mixte' } as const;
const CATEGORIES = { sans_reparation: 'Fuite non réparée', sans_refection: 'Clôture sans réfection' } as const;

const codeDepuis = (texte: string) =>
  texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

export default function Parametres() {
  const { marche, peut } = useSession();
  const accesParametres = peut('parametres', 'creer') || peut('parametres', 'modifier');
  const [onglet, setOnglet] = useState<Onglet>(() => (accesParametres ? 'marche' : peut('evenements', 'lire') ? 'evenements' : 'ouvriers'));
  const droitDe = (o: Onglet): TypeDonnee => (o === 'ouvriers' ? 'ouvriers' : o === 'evenements' ? 'evenements' : 'parametres');
  const peutCreer = peut(droitDe(onglet), 'creer');
  const peutModifier = peut(droitDe(onglet), 'modifier');

  const [ouvriers, setOuvriers] = useState<Ouvrier[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [motifs, setMotifs] = useState<MotifLigne[]>([]);
  const [erreur, setErreur] = useState('');
  const [ajout, setAjout] = useState(false);

  const marcheId = marche?.id;

  const charger = useCallback(async () => {
    if (!marcheId) return;
    const sb = getSupabase();
    const [o, e, m] = await Promise.all([
      sb.from('ouvriers').select('id, nom_complet, telephone, actif').eq('marche_id', marcheId).order('nom_complet'),
      sb.from('equipes').select('id, type, numero, libelle, actif').eq('marche_id', marcheId).order('type').order('numero'),
      sb.from('motifs').select('id, categorie, code, libelle_fr, libelle_ar, terrassement_paye, actif').eq('marche_id', marcheId).order('categorie').order('ordre'),
    ]);
    const premiere = o.error || e.error || m.error;
    setErreur(premiere ? messageErreur(premiere) : '');
    setOuvriers((o.data as Ouvrier[] | null) ?? []);
    setEquipes((e.data as Equipe[] | null) ?? []);
    setMotifs((m.data as MotifLigne[] | null) ?? []);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => setAjout(false), [onglet]);

  // Enregistre une création ou une modification, puis recharge.
  async function ecrire(table: string, id: string | null, valeurs: Record<string, unknown>): Promise<boolean> {
    setErreur('');
    const sb = getSupabase();
    const { error } = id
      ? await sb.from(table).update(valeurs).eq('id', id)
      : await sb.from(table).insert({ ...valeurs, marche_id: marcheId });
    if (error) {
      setErreur(
        error.code === '23505' ? 'Cet élément existe déjà (même numéro, code ou nom).' : messageErreur(error),
      );
      return false;
    }
    await charger();
    return true;
  }

  const basculer = (table: string, id: string, actif: boolean) => ecrire(table, id, { actif: !actif });

  if (!marche) return null;
  if (!accesParametres && !peut('ouvriers', 'creer') && !peut('ouvriers', 'modifier') && !peut('evenements', 'lire')) {
    return <p className="carte">Votre compte n&apos;a pas accès aux paramètres.</p>;
  }

  const onglets = ([
    ['marche', 'Marché', accesParametres],
    ['bordereau', 'Bordereau', accesParametres || peut('quantites', 'lire')],
    ['attachement', 'Attachement', accesParametres],
    ['evenements', 'Événements', peut('evenements', 'lire')],
    ['ouvriers', 'Ouvriers', peut('ouvriers', 'creer') || peut('ouvriers', 'modifier')],
    ['equipes', 'Équipes', accesParametres],
    ['motifs', 'Motifs', accesParametres],
  ] as [Onglet, string, boolean][]).filter(([, , visible]) => visible);

  return (
    <>
      <h1>Paramètres du marché {marche.code}</h1>
      <div className="onglets" role="tablist">
        {onglets.map(([k, t]) => (
          <button key={k} role="tab" aria-selected={onglet === k} className={onglet === k ? 'actif' : ''} onClick={() => setOnglet(k)}>
            {t}
          </button>
        ))}
      </div>
      {erreur && ['ouvriers', 'equipes', 'motifs'].includes(onglet) && <p className="erreur">{erreur}</p>}

      {onglet === 'marche' && <OngletMarche marcheId={marche.id} modifiable={peut('parametres', 'modifier')} />}
      {onglet === 'bordereau' && (
        <OngletBordereau marcheId={marche.id} peutCreer={peut('parametres', 'creer')} peutModifier={peut('parametres', 'modifier')} />
      )}
      {onglet === 'attachement' && <OngletAttachement marcheId={marche.id} modifiable={peut('parametres', 'modifier')} />}
      {onglet === 'evenements' && <OngletEvenements marcheId={marche.id} />}

      {onglet === 'ouvriers' && (
        <section className="carte">
          <p className="discret">Ouvriers sans compte, rattachés aux réparations. Ils ne sont jamais supprimés : on les désactive.</p>
          {ouvriers.map((o) => (
            <LigneOuvrier key={o.id} o={o} editable={peutModifier} ecrire={ecrire} basculer={basculer} />
          ))}
          {ouvriers.length === 0 && <p className="discret">Aucun ouvrier.</p>}
          {peutCreer &&
            (ajout ? (
              <FormOuvrier onSubmit={async (v) => (await ecrire('ouvriers', null, v)) && setAjout(false)} annuler={() => setAjout(false)} />
            ) : (
              <button onClick={() => setAjout(true)}>+ Ajouter un ouvrier</button>
            ))}
        </section>
      )}

      {onglet === 'equipes' && (
        <section className="carte">
          {equipes.map((q) => (
            <div key={q.id} className="bloc ligne-param">
              <span className={q.actif ? '' : 'discret'}>
                <strong>{q.libelle}</strong> · {TYPES_EQUIPE[q.type]} n° {q.numero}
                {q.actif ? '' : ' (désactivée)'}
              </span>
              {peutModifier && <button onClick={() => basculer('equipes', q.id, q.actif)}>{q.actif ? 'Désactiver' : 'Réactiver'}</button>}
            </div>
          ))}
          {equipes.length === 0 && <p className="discret">Aucune équipe.</p>}
          {peutCreer &&
            (ajout ? (
              <FormEquipe
                suivant={(type) => Math.max(0, ...equipes.filter((q) => q.type === type).map((q) => q.numero)) + 1}
                onSubmit={async (v) => (await ecrire('equipes', null, v)) && setAjout(false)}
                annuler={() => setAjout(false)}
              />
            ) : (
              <button onClick={() => setAjout(true)}>+ Ajouter une équipe</button>
            ))}
        </section>
      )}

      {onglet === 'motifs' && (
        <section className="carte">
          <p className="discret">Listes proposées sur la fiche d&apos;une fuite non réparée et à la clôture sans réfection.</p>
          {(Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]).map((c) => (
            <fieldset key={c}>
              <legend>{CATEGORIES[c]}</legend>
              {motifs.filter((m) => m.categorie === c).map((m) => (
                <div key={m.id} className="bloc ligne-param">
                  <span className={m.actif ? '' : 'discret'}>
                    {m.libelle_fr}
                    {m.libelle_ar && <span dir="rtl" lang="ar"> · {m.libelle_ar}</span>}
                    {m.terrassement_paye ? ' · terrassement payé' : ''}
                    {m.actif ? '' : ' (désactivé)'}
                  </span>
                  {peutModifier && <button onClick={() => basculer('motifs', m.id, m.actif)}>{m.actif ? 'Désactiver' : 'Réactiver'}</button>}
                </div>
              ))}
            </fieldset>
          ))}
          {peutCreer &&
            (ajout ? (
              <FormMotif onSubmit={async (v) => (await ecrire('motifs', null, v)) && setAjout(false)} annuler={() => setAjout(false)} />
            ) : (
              <button onClick={() => setAjout(true)}>+ Ajouter un motif</button>
            ))}
        </section>
      )}

    </>
  );
}

type Ecrire = (table: string, id: string | null, v: Record<string, unknown>) => Promise<boolean>;
type Basculer = (table: string, id: string, actif: boolean) => Promise<boolean>;

function LigneOuvrier({ o, editable, ecrire, basculer }: { o: Ouvrier; editable: boolean; ecrire: Ecrire; basculer: Basculer }) {
  const [edition, setEdition] = useState(false);
  if (edition) {
    return (
      <FormOuvrier
        initial={o}
        onSubmit={async (v) => (await ecrire('ouvriers', o.id, v)) && setEdition(false)}
        annuler={() => setEdition(false)}
      />
    );
  }
  return (
    <div className="bloc ligne-param">
      <span className={o.actif ? '' : 'discret'}>
        <strong>{o.nom_complet}</strong>
        {o.telephone ? ` · ${o.telephone}` : ''}
        {o.actif ? '' : ' (désactivé)'}
      </span>
      {editable && (
        <span className="actions">
          <button onClick={() => setEdition(true)}>Modifier</button>
          <button onClick={() => basculer('ouvriers', o.id, o.actif)}>{o.actif ? 'Désactiver' : 'Réactiver'}</button>
        </span>
      )}
    </div>
  );
}

function FormOuvrier({ initial, onSubmit, annuler }: { initial?: Ouvrier; onSubmit: (v: Record<string, unknown>) => void; annuler: () => void }) {
  const [nom, setNom] = useState(initial?.nom_complet ?? '');
  const [tel, setTel] = useState(initial?.telephone ?? '');
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ nom_complet: nom.trim(), telephone: tel.trim() || null });
  };
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <label>Nom complet<input value={nom} onChange={(e) => setNom(e.target.value)} required /></label>
      <label>Téléphone<input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" /></label>
      <div className="actions"><button className="primaire" disabled={!nom.trim()}>Enregistrer</button><button type="button" onClick={annuler}>Annuler</button></div>
    </form>
  );
}

function FormEquipe({ suivant, onSubmit, annuler }: { suivant: (t: Equipe['type']) => number; onSubmit: (v: Record<string, unknown>) => void; annuler: () => void }) {
  const [type, setType] = useState<Equipe['type']>('reparation');
  const [libelle, setLibelle] = useState('');
  const numero = suivant(type);
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ type, numero, libelle: libelle.trim() || `${TYPES_EQUIPE[type]} ${numero}` });
  };
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <label>
        Type
        <select value={type} onChange={(e) => setType(e.target.value as Equipe['type'])}>
          {Object.entries(TYPES_EQUIPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label>Libellé (n° {numero})<input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder={`${TYPES_EQUIPE[type]} ${numero}`} /></label>
      <div className="actions"><button className="primaire">Enregistrer</button><button type="button" onClick={annuler}>Annuler</button></div>
    </form>
  );
}

function FormMotif({ onSubmit, annuler }: { onSubmit: (v: Record<string, unknown>) => void; annuler: () => void }) {
  const [categorie, setCategorie] = useState<MotifLigne['categorie']>('sans_reparation');
  const [fr, setFr] = useState('');
  const [ar, setAr] = useState('');
  const [paye, setPaye] = useState(false);
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ categorie, code: codeDepuis(fr), libelle_fr: fr.trim(), libelle_ar: ar.trim() || null, terrassement_paye: paye, ordre: 900 });
  };
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <label>
        Liste
        <select value={categorie} onChange={(e) => setCategorie(e.target.value as MotifLigne['categorie'])}>
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label>Libellé en français<input value={fr} onChange={(e) => setFr(e.target.value)} required /></label>
      <label>Libellé en arabe (facultatif)<input value={ar} onChange={(e) => setAr(e.target.value)} dir="rtl" lang="ar" /></label>
      <label className="ligne"><input type="checkbox" checked={paye} onChange={(e) => setPaye(e.target.checked)} />Terrassement payé malgré l&apos;absence de réparation</label>
      <div className="actions"><button className="primaire" disabled={!codeDepuis(fr)}>Enregistrer</button><button type="button" onClick={annuler}>Annuler</button></div>
    </form>
  );
}
