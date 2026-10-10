'use client';

// Paramètres › Marché › Destinataires (chantier v3, M1) : carnet des destinataires des documents envoyés par e-mail,
// limite d'envois par jour, journal des derniers envois. Responsable du marché et administrateur (la base filtre aussi).
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { DOCUMENTS_EMAIL, adresseValide, texteTaille } from '@/lib/email';
import { lireDestinataires, lireEnvois, usePeutEnvoyerEmail, type Destinataire, type EnvoiEmail } from '@/lib/email-client';
import { messageErreur } from '@/lib/format';
import { getSupabase } from '@/lib/supabase';
import { formatMaroc } from '@/lib/heure-maroc';

const STATUTS_ENVOI: Record<EnvoiEmail['statut'], string> = { en_cours: 'en cours', envoye: 'envoyé', echec: 'échec' };
const dateHeure = (iso: string) =>
  formatMaroc(iso, 'fr-FR', { dateStyle: 'short', timeStyle: 'short' });

export function BlocDestinataires({ marcheId, limite, enregistrerLimite }: {
  marcheId: string;
  limite: number | null;
  enregistrerLimite: (valeur: number) => Promise<boolean>;
}) {
  const peut = usePeutEnvoyerEmail();
  const [liste, setListe] = useState<Destinataire[]>([]);
  const [envois, setEnvois] = useState<EnvoiEmail[]>([]);
  const [edition, setEdition] = useState<Destinataire | 'nouveau' | null>(null);
  const [erreur, setErreur] = useState('');
  const [saisieLimite, setSaisieLimite] = useState('');

  const charger = useCallback(async () => {
    try {
      const [d, e] = await Promise.all([lireDestinataires(marcheId), lireEnvois(marcheId)]);
      setListe(d);
      setEnvois(e);
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }, [marcheId]);
  useEffect(() => {
    if (peut) charger();
  }, [peut, charger]);
  useEffect(() => setSaisieLimite(limite == null ? '' : String(limite)), [limite]);

  if (!peut) return null;

  async function ecrire(id: string | null, valeurs: Partial<Destinataire>): Promise<boolean> {
    setErreur('');
    const sb = getSupabase();
    const { error } = id
      ? await sb.from('destinataires_email').update(valeurs).eq('id', id)
      : await sb.from('destinataires_email').insert({ ...valeurs, marche_id: marcheId });
    if (error) {
      setErreur(error.code === '23505' ? 'Cette adresse est déjà dans la liste.' : messageErreur(error));
      return false;
    }
    await charger();
    return true;
  }

  async function retirer(d: Destinataire) {
    if (!window.confirm(`Retirer ${d.nom} (${d.email}) de la liste ?`)) return;
    setErreur('');
    const { error } = await getSupabase().from('destinataires_email').delete().eq('id', d.id);
    if (error) setErreur(messageErreur(error));
    else await charger();
  }

  const limiteValide = /^\d+$/.test(saisieLimite) && Number(saisieLimite) >= 1 && Number(saisieLimite) <= 100;

  return (
    <section className="carte">
      <h2>Destinataires des e-mails</h2>
      <p className="discret">
        Proposés par le bouton « Envoyer par e-mail » des rapports, de la carte imprimée, des attachements et du procès-verbal
        de débits. Les envois partent de contact@stepag.ma, avec une copie cachée et les réponses dans cette boîte.
        « Par défaut » : coché d&apos;office.
      </p>
      {erreur && <p className="erreur">{erreur}</p>}
      {liste.length === 0 && <p className="discret">Aucun destinataire enregistré.</p>}
      {liste.map((d) =>
        edition !== 'nouveau' && edition?.id === d.id ? (
          <FormDestinataire key={d.id} initial={d} onSubmit={async (v) => (await ecrire(d.id, v)) && setEdition(null)} annuler={() => setEdition(null)} />
        ) : (
          <div key={d.id} className="bloc ligne-param">
            <span>
              <strong>{d.nom}</strong>{d.organisme ? ` · ${d.organisme}` : ''}
              {d.par_defaut ? ' · par défaut' : ''}{d.actif ? '' : ' · retiré des propositions'}
              <br />
              <span className="discret">{d.email}</span>
            </span>
            <span className="actions">
              <button onClick={() => setEdition(d)}>Modifier</button>
              <button onClick={() => ecrire(d.id, { actif: !d.actif })}>{d.actif ? 'Masquer' : 'Proposer'}</button>
              <button className="danger" onClick={() => retirer(d)}>Retirer</button>
            </span>
          </div>
        ),
      )}
      {edition === 'nouveau' ? (
        <FormDestinataire onSubmit={async (v) => (await ecrire(null, v)) && setEdition(null)} annuler={() => setEdition(null)} />
      ) : (
        <button onClick={() => setEdition('nouveau')}>+ Ajouter un destinataire</button>
      )}

      <form
        className="sous-formulaire"
        onSubmit={async (e) => {
          e.preventDefault();
          if (limiteValide) await enregistrerLimite(Number(saisieLimite));
        }}
      >
        <div className="deux">
          <label>
            Envois par jour pour ce marché (1 à 100)
            <input type="number" min={1} max={100} value={saisieLimite} onChange={(e) => setSaisieLimite(e.target.value)} />
          </label>
        </div>
        <p className="discret">Limite commune à tous les marchés : 90 envois par jour (offre gratuite du fournisseur : 100 e-mails par jour).</p>
        <div className="actions">
          <button className="primaire" disabled={!limiteValide || Number(saisieLimite) === limite}>Enregistrer la limite</button>
        </div>
      </form>

      <h3>Derniers envois</h3>
      {envois.length === 0 && <p className="discret">Aucun envoi.</p>}
      {envois.map((e) => (
        <div key={e.id} className="bloc ligne-param">
          <span>
            <strong>{dateHeure(e.cree_le)}</strong> · {DOCUMENTS_EMAIL[e.document] ?? e.document}{e.reference ? ` — ${e.reference}` : ''}
            {' · '}<span className={e.statut === 'echec' ? 'erreur' : undefined}>{STATUTS_ENVOI[e.statut]}</span>
            <br />
            <span className="discret">
              {e.destinataires.join(', ')} · {e.piece_nom} ({texteTaille(e.piece_octets)})
              {e.statut === 'echec' && e.erreur ? ` · ${e.erreur}` : ''}
            </span>
          </span>
        </div>
      ))}
    </section>
  );
}

function FormDestinataire({ initial, onSubmit, annuler }: {
  initial?: Destinataire;
  onSubmit: (v: Partial<Destinataire>) => void;
  annuler: () => void;
}) {
  const [nom, setNom] = useState(initial?.nom ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [organisme, setOrganisme] = useState(initial?.organisme ?? '');
  const [parDefaut, setParDefaut] = useState(initial?.par_defaut ?? false);
  const [ordre, setOrdre] = useState(String(initial?.ordre ?? 0));
  const valide = !!nom.trim() && adresseValide(email);
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    if (!valide) return;
    onSubmit({
      nom: nom.trim(), email: email.trim().toLowerCase(), organisme: organisme.trim() || null,
      par_defaut: parDefaut, ordre: Number(ordre) || 0,
    });
  };
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <div className="deux">
        <label>Nom<input value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={120} placeholder="Service de suivi SRM" /></label>
        <label>Adresse e-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} /></label>
        <label>Organisme<input value={organisme} onChange={(e) => setOrganisme(e.target.value)} maxLength={120} placeholder="SRM Oriental" /></label>
        <label>Ordre<input type="number" value={ordre} onChange={(e) => setOrdre(e.target.value)} /></label>
      </div>
      <label className="ligne">
        <input type="checkbox" checked={parDefaut} onChange={(e) => setParDefaut(e.target.checked)} />
        Coché d&apos;office dans « Envoyer par e-mail »
      </label>
      <div className="actions">
        <button className="primaire" disabled={!valide}>Enregistrer</button>
        <button type="button" onClick={annuler}>Annuler</button>
        {!!email && !adresseValide(email) && <span className="erreur">Adresse invalide.</span>}
      </div>
    </form>
  );
}
