'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { messageErreur } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';

interface MarcheLigne {
  id: string; code: string; numero: string; intitule: string; client: string; ville: string | null;
  date_commencement: string | null; actif: boolean;
}

// Administrateur : liste des marchés, activation, création (vide ou par copie des paramètres).
export default function Marches() {
  const { profil, marche, choisirMarche, recharger, verrouille } = useSession();
  const router = useRouter();
  const [liste, setListe] = useState<MarcheLigne[]>([]);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [creation, setCreation] = useState(false);
  const estAdmin = profil?.est_admin === true;

  const charger = useCallback(async () => {
    const { data, error } = await getSupabase().from('marches')
      .select('id, code, numero, intitule, client, ville, date_commencement, actif')
      .order('actif', { ascending: false }).order('date_commencement', { ascending: false, nullsFirst: false }).order('code');
    setErreur(error ? messageErreur(error) : '');
    setListe((data as MarcheLigne[] | null) ?? []);
  }, []);

  useEffect(() => {
    if (estAdmin) charger();
  }, [estAdmin, charger]);

  if (!estAdmin) return <p className="carte">Page réservée à l&apos;administrateur.</p>;

  async function basculer(m: MarcheLigne) {
    if (m.actif && !window.confirm(`Désactiver le marché ${m.code} ? Il ne sera plus proposé aux agents (rien n'est supprimé, il pourra être réactivé).`)) return;
    setErreur('');
    setInfo('');
    const { error } = await getSupabase().from('marches').update({ actif: !m.actif }).eq('id', m.id);
    if (error) {
      setErreur(messageErreur(error));
      return;
    }
    setInfo(`Marché ${m.code} ${m.actif ? 'désactivé' : 'réactivé'}.`);
    await charger();
    recharger();
  }

  function ouvrir(m: MarcheLigne) {
    choisirMarche(m.id);
    router.push('/parametres');
  }

  async function creer(v: Valeurs): Promise<boolean> {
    setErreur('');
    setInfo('');
    const sb = getSupabase();
    let id: string | null = null;
    if (v.source) {
      const { data, error } = await sb.rpc('copier_marche', {
        p_source: v.source, p_code: v.code, p_numero: v.numero, p_intitule: v.intitule, p_client: v.client, p_ville: v.ville,
      });
      if (error) {
        setErreur(error.code === '23505' ? 'Ce code de marché existe déjà.' : messageErreur(error));
        return false;
      }
      id = data as string;
    } else {
      const nouveau = crypto.randomUUID();
      const { error } = await sb.from('marches').insert({
        id: nouveau, code: v.code, numero: v.numero, intitule: v.intitule, client: v.client, ville: v.ville || null,
      });
      if (error) {
        setErreur(error.code === '23505' ? 'Ce code de marché existe déjà.' : messageErreur(error));
        return false;
      }
      id = nouveau;
    }
    const source = liste.find((m) => m.id === v.source);
    setInfo(source
      ? `Marché ${v.code} créé avec les paramètres de ${source.code}. Complétez sa fiche (dates, OS, montant) dans Paramètres > Marché, puis affectez les agents dans Utilisateurs.`
      : `Marché ${v.code} créé. Renseignez sa fiche, son bordereau et ses secteurs dans Paramètres, puis affectez les agents dans Utilisateurs.`);
    setCreation(false);
    await charger();
    recharger();
    if (id) choisirMarche(id);
    return true;
  }

  return (
    <>
      <div className="barre">
        <h1>Marchés</h1>
        {!creation && <button className="primaire" onClick={() => { setCreation(true); setInfo(''); }}>+ Nouveau marché</button>}
      </div>
      {erreur && <p className="erreur">{erreur}</p>}
      {info && <p className="info">{info}</p>}
      {creation && (
        <FormMarche marches={liste} proposition={marche?.id ?? ''} copieVerrouillee={verrouille('marches', 'copier')}
          onSubmit={creer} annuler={() => setCreation(false)} />
      )}

      <section className="carte">
        <p className="discret">
          Un marché désactivé n&apos;est plus proposé aux agents ; ses données restent intactes et il peut être réactivé.
          Seul l&apos;administrateur crée, active et désactive un marché.
        </p>
        {liste.length === 0 && <p className="discret">Aucun marché.</p>}
        <div className="defilement">
          <table className="liste-compacte liste-marches">
            <thead>
              <tr><th>Code</th><th>N° du marché</th><th>Intitulé</th><th>Client</th><th>État</th><th /></tr>
            </thead>
            <tbody>
              {liste.map((m, i) => (
                <tr key={m.id} className={`${i % 2 ? 'zebre' : ''} ${m.actif ? '' : 'discret'}`}>
                  <td className="nowrap"><strong>{m.code}</strong>{m.id === marche?.id ? <span className="etiquette">ouvert</span> : null}</td>
                  <td className="nowrap">{m.numero}</td>
                  <td><span className="designation">{m.intitule}</span></td>
                  <td>{m.client}{m.ville ? ` · ${m.ville}` : ''}</td>
                  <td className="nowrap">
                    <span className={`badge ${m.actif ? 'st-achevee' : 'st-sans'}`}>{m.actif ? 'Actif' : 'Désactivé'}</span>
                  </td>
                  <td className="nowrap">
                    <span className="actions">
                      <button className="petit" onClick={() => ouvrir(m)}>Paramètres</button>
                      {m.actif && verrouille('marches', 'desactiver') ? (
                        <button className="petit" disabled title="Verrouillé par vous : rouvrez le verrou dans Utilisateurs > Droits">Désactiver (verrouillé)</button>
                      ) : (
                        <button className={`petit ${m.actif ? 'danger' : ''}`} onClick={() => basculer(m)}>
                          {m.actif ? 'Désactiver' : 'Réactiver'}
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

interface Valeurs { source: string; code: string; numero: string; intitule: string; client: string; ville: string }

function FormMarche({
  marches, proposition, copieVerrouillee, onSubmit, annuler,
}: {
  marches: MarcheLigne[]; proposition: string; copieVerrouillee: boolean; onSubmit: (v: Valeurs) => Promise<boolean>; annuler: () => void;
}) {
  const [mode, setMode] = useState<'copie' | 'vide'>(marches.length && !copieVerrouillee ? 'copie' : 'vide');
  const [source, setSource] = useState(marches.find((m) => m.id === proposition && m.code !== 'DEMO')?.id
    ?? marches.find((m) => m.actif && m.code !== 'DEMO')?.id ?? marches[0]?.id ?? '');
  const [code, setCode] = useState('');
  const [numero, setNumero] = useState('');
  const [intitule, setIntitule] = useState('');
  const [client, setClient] = useState('');
  const [ville, setVille] = useState('');
  const [occupe, setOccupe] = useState(false);
  const copie = mode === 'copie';
  const choisie = marches.find((m) => m.id === source);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setOccupe(true);
    await onSubmit({
      source: copie ? source : '', code: code.trim(), numero: numero.trim(), intitule: intitule.trim(),
      client: client.trim(), ville: ville.trim(),
    });
    setOccupe(false);
  };
  const valide = code.trim() && numero.trim() && intitule.trim() && (copie ? !!source : !!client.trim());

  return (
    <form className="carte" onSubmit={envoyer}>
      <h2>Nouveau marché</h2>
      <div className="choix-boutons" role="radiogroup" aria-label="Type de création">
        <button type="button" role="radio" aria-checked={copie} className={copie ? 'actif' : ''} onClick={() => setMode('copie')} disabled={!marches.length || copieVerrouillee}
          title={copieVerrouillee ? 'Verrouillé par vous : rouvrez le verrou dans Utilisateurs > Droits' : undefined}>
          Copier les paramètres d&apos;un marché
        </button>
        <button type="button" role="radio" aria-checked={!copie} className={!copie ? 'actif' : ''} onClick={() => setMode('vide')}>
          Marché vide
        </button>
      </div>
      {copie && (
        <>
          <label>
            Marché modèle
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {marches.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.intitule.slice(0, 60)}{m.actif ? '' : ' (désactivé)'}</option>)}
            </select>
          </label>
          <p className="discret">
            Copiés : fiche (maître d&apos;ouvrage, titulaire, taux, alertes, libellés du client), bordereau et règles de
            proposition, zones et secteurs, équipes, natures de réfection, motifs, catalogue des pièces, règles d&apos;attachement,
            catégories d&apos;événements et modèles d&apos;export. Jamais copiés : fuites, interventions, photos, lots
            d&apos;attachement, ordres de service, avenants, ouvriers ; ni les dates, l&apos;OS de commencement et le montant.
          </p>
        </>
      )}
      <div className="deux">
        <label>Code court *<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex. SRM-4500005000" required /></label>
        <label>N° du marché *<input value={numero} onChange={(e) => setNumero(e.target.value)} required /></label>
      </div>
      <label>Intitulé *<input value={intitule} onChange={(e) => setIntitule(e.target.value)} required /></label>
      <div className="deux">
        <label>
          Client{copie ? '' : ' *'}
          <input value={client} onChange={(e) => setClient(e.target.value)} placeholder={copie ? choisie?.client ?? '' : ''} required={!copie} />
          {copie && <span className="discret aide">Vide : celui du marché modèle.</span>}
        </label>
        <label>
          Ville
          <input value={ville} onChange={(e) => setVille(e.target.value)} placeholder={copie ? choisie?.ville ?? '' : ''} />
          {copie && <span className="discret aide">Vide : celle du marché modèle.</span>}
        </label>
      </div>
      <div className="actions">
        <button className="primaire" disabled={!valide || occupe}>{occupe ? 'Création…' : 'Créer le marché'}</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}
