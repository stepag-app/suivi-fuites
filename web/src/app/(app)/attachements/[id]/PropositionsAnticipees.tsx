'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { quantite, type ReglesAttachement } from '@/lib/attachements';
import { STATUTS, dateSeule, messageErreur } from '@/lib/format';
import { getSupabase, lireTout } from '@/lib/supabase';
import type { StatutFuite } from '@/lib/types';
import { LienFuite } from './AAttacher';

// Une proposition : réfection due (ou autre article du panier) ni exécutée ni attachée (vue v_propositions_anticipation, S2 § 6).
export interface Proposition {
  marche_id: string;
  fuite_id: string;
  fuite_numero: number;
  reference_srm: string | null;
  adresse: string | null;
  statut: string;
  reparee_le: string | null;
  nature_libelle_fr: string | null;
  prix_id: string;
  prix_numero: string;
  prix_ordre: number;
  prix_designation: string;
  unite: string;
  quantite_proposee: number | null;
  brouillon_id: string | null;
}

const cle = (p: Pick<Proposition, 'fuite_id' | 'prix_id'>) => `${p.fuite_id}|${p.prix_id}`;
const enNombre = (t: string) => Number(t.replace(/\s/g, '').replace(',', '.'));
const MOTIF_DEFAUT = "Attaché par anticipation (accord du maître d'ouvrage, règles du marché)";

// A1 : propositions anticipées, à part et d'une autre couleur que « À attacher ». Chaque ajout crée une ligne
// « Attaché par anticipation » (nature anticipation) ; à l'exécution réelle, le solde se régularise au lot suivant.
export function PropositionsAnticipees({ marcheId, lotId, regles, version, ajoute, onErreur }: {
  marcheId: string; lotId: string; regles: ReglesAttachement; version: number; ajoute: () => void; onErreur: (m: string) => void;
}) {
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [chargement, setChargement] = useState(true);
  const [choix, setChoix] = useState<Set<string>>(new Set());
  const [quantites, setQuantites] = useState<Record<string, string>>({});
  const [motif, setMotif] = useState(MOTIF_DEFAUT);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      setPropositions(await lireTout<Proposition>((de, a) => getSupabase().from('v_propositions_anticipation').select('*')
        .eq('marche_id', marcheId).order('fuite_numero').order('prix_ordre').range(de, a)));
    } catch (e) {
      onErreur(messageErreur(e));
      setPropositions([]);
    }
    setChoix(new Set());
    setQuantites({});
    setChargement(false);
  }, [marcheId, onErreur]);

  useEffect(() => {
    charger();
  }, [charger, version]);

  const visibles = useMemo(() => propositions.filter((p) => p.brouillon_id !== lotId), [propositions, lotId]);
  const cochables = visibles.filter((p) => !p.brouillon_id);
  const texteQuantite = (p: Proposition) => quantites[cle(p)] ?? (p.quantite_proposee != null ? String(p.quantite_proposee).replace('.', ',') : '');
  const choisies = cochables.filter((p) => choix.has(cle(p)));
  const invalides = choisies.filter((p) => !(enNombre(texteQuantite(p)) > 0));

  async function ajouter() {
    if (!choisies.length || invalides.length || !motif.trim()) return;
    setOccupe(true);
    const { error } = await getSupabase().from('attachement_lignes').insert(choisies.map((p) => ({
      marche_id: marcheId, attachement_id: lotId, nature: 'anticipation', fuite_id: p.fuite_id, prix_id: p.prix_id,
      quantite: enNombre(texteQuantite(p)), motif: motif.trim(),
    })));
    setOccupe(false);
    if (error) {
      onErreur(messageErreur(error));
      return;
    }
    ajoute();
  }

  if (!chargement && visibles.length === 0) return null;

  return (
    <section className="carte propositions-anticipees">
      <div className="barre">
        <h2>
          Propositions anticipées <span className="discret">({visibles.length})</span>
        </h2>
        <button className="primaire" disabled={occupe || !choisies.length || invalides.length > 0 || !motif.trim()} onClick={ajouter}>
          Attacher par anticipation ({choisies.length})
        </button>
      </div>
      <p className="discret">
        Travaux du panier d&apos;anticipation pas encore exécutés (réfection : surface de fouille, modifiable). La ligne est
        marquée « Attaché par anticipation » et la fuite reste prioritaire jusqu&apos;à l&apos;exécution réelle ; la différence
        (exécuté − attaché) se régularise alors dans un lot suivant.
      </p>
      <label>
        Motif (accord du maître d&apos;ouvrage) *
        <input value={motif} onChange={(e) => setMotif(e.target.value)} required />
      </label>
      <div className="actions">
        <button onClick={() => setChoix(new Set(cochables.map(cle)))}>Tout cocher</button>
        <button onClick={() => setChoix(new Set())}>Rien</button>
      </div>
      {chargement ? <p className="discret">Chargement…</p> : (
        <div className="defilement">
          <table className="liste-compacte">
            <thead>
              <tr>
                <th aria-label="Choisir" /><th>Fuite</th><th>Référence</th><th>Adresse</th><th>État</th><th>Réparée le</th>
                <th>Revêtement</th><th>Article</th><th>Quantité</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => {
                const statut = STATUTS[p.statut as StatutFuite];
                const k = cle(p);
                const fausse = choix.has(k) && !(enNombre(texteQuantite(p)) > 0);
                return (
                  <tr key={k}>
                    <td>
                      <input type="checkbox" checked={choix.has(k)} disabled={!!p.brouillon_id} aria-label={`Fuite N° ${p.fuite_numero}, prix ${p.prix_numero}`}
                        onChange={(e) => setChoix((c) => {
                          const n = new Set(c);
                          if (e.target.checked) n.add(k);
                          else n.delete(k);
                          return n;
                        })} />
                    </td>
                    <td className="nowrap"><LienFuite id={p.fuite_id} numero={p.fuite_numero} /></td>
                    <td className="nowrap">{p.reference_srm ?? '—'}</td>
                    <td>{p.adresse ?? '—'}</td>
                    <td className="nowrap"><span className={`badge ${statut?.classe ?? ''}`}>{statut?.libelle ?? p.statut}</span></td>
                    <td className="nowrap">{dateSeule(p.reparee_le)}</td>
                    <td>{p.nature_libelle_fr ?? '—'}</td>
                    <td title={p.prix_designation}>P{p.prix_numero}</td>
                    <td className="nowrap">
                      {p.brouillon_id ? <span className="discret">dans un autre brouillon</span> : (
                        <>
                          <input className={`quantite ${fausse ? 'erreur' : ''}`} inputMode="decimal" value={texteQuantite(p)}
                            aria-label={`Quantité anticipée, fuite N° ${p.fuite_numero}`}
                            onChange={(e) => setQuantites((q) => ({ ...q, [k]: e.target.value }))} /> {p.unite}
                          {p.quantite_proposee != null && enNombre(texteQuantite(p)) !== p.quantite_proposee && (
                            <span className="discret"> (proposé {quantite(p.quantite_proposee, p.unite, regles.decimales)})</span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {invalides.length > 0 && <p className="erreur">Quantité à saisir (supérieure à 0) pour {invalides.length} ligne{invalides.length > 1 ? 's' : ''}.</p>}
    </section>
  );
}
